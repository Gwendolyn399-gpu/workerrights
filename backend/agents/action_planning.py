import hashlib
import json
from datetime import datetime, timezone

from sqlalchemy.orm import Session

from backend.models.case import ActionStep, Case, utcnow
from backend.models.legal import Channel
from backend.services.facts import format_amount, location_text
from backend.services.statement import (
    build_confirmation_message,
    build_evidence_directory,
    build_formal_statement,
)


class ActionPlanningAgent:
    name = "Action Planning Agent"

    def __init__(self, db: Session) -> None:
        self.db = db

    def ensure_plan(self, case: Case, force: bool = False) -> dict:
        signature = self._signature(case.facts)
        has_steps = (
            self.db.query(ActionStep).filter(ActionStep.case_id == case.id).count() > 0
        )
        if force or case.facts_meta.get("plan_signature") != signature or not has_steps:
            self._rebuild(case, signature)
        return self.serialize(case)

    def _signature(self, facts: dict) -> str:
        relevant = {
            key: facts.get(key)
            for key in (
                "location_city",
                "location_district",
                "work_type",
                "duration_text",
                "recruiter_type",
                "recruiter_name",
                "manager_role",
                "wage_basis",
                "agreed_amount",
                "paid_amount",
                "owed_amount",
                "owed_amount_approx",
                "has_contract",
                "evidence",
                "project_name",
                "contractor_name",
                "subcontractor_name",
                "prior_report",
            )
        }
        raw = json.dumps(relevant, ensure_ascii=False, sort_keys=True, default=str)
        return hashlib.sha1(raw.encode("utf-8")).hexdigest()

    def _rebuild(self, case: Case, signature: str) -> None:
        existing_steps = (
            self.db.query(ActionStep)
            .filter(ActionStep.case_id == case.id)
            .order_by(ActionStep.position)
            .all()
        )
        existing_done = {step.step_key: (step.done, step.done_at) for step in existing_steps}
        for step in existing_steps:
            self.db.delete(step)
        self.db.flush()
        facts = case.facts
        definitions = self._definitions(facts)
        for index, definition in enumerate(definitions, start=1):
            self.db.add(
                ActionStep(
                    case_id=case.id,
                    step_key=definition["step_key"],
                    position=index,
                    title=definition["title"],
                    why=definition["why"],
                    prepare=definition["prepare"],
                    channel_id=definition.get("channel_id"),
                    legal_basis=definition.get("legal_basis", []),
                    deadline_note=definition.get("deadline_note"),
                    risk_note=definition.get("risk_note"),
                    draft_text=definition.get("draft_text"),
                    done=existing_done.get(definition["step_key"], (False, None))[0],
                    done_at=existing_done.get(definition["step_key"], (False, None))[1],
                )
            )
        case.facts_meta = {**(case.facts_meta or {}), "plan_signature": signature}
        case.plan_generated_at = utcnow()
        if case.status == "ready":
            case.status = "planned"
        self.db.flush()

    def _definitions(self, facts: dict) -> list[dict]:
        evidence_prepare = [
            "把微信、短信聊天记录完整截图，保留对方身份信息和上下文",
            "导出银行、微信或支付宝转账记录，保留对方姓名和时间",
            "整理工资表、记工本、结算单、欠条等原始材料",
            "拍摄工地大门、项目公示牌、工作场景照片",
            "联系1—2名工友，征得同意后记录姓名和电话",
            "按时间顺序写一份简单的大事记：何时进场、谁招用、做什么、约定多少钱、给过多少、何时开始欠",
        ]
        complaint_prepare = [
            "本人身份证明（只在官方渠道提交，不提供给陌生人）",
            "整理好的案件事实和欠薪金额说明",
            "证据材料清单及原件/截图",
            f"项目所在地：{location_text(facts)}",
            f"招用人和管理主体：{facts.get('recruiter_name') or facts.get('recruiter_type') or '待补充'}",
        ]
        owed_text = format_amount(facts.get("owed_amount"), bool(facts.get("owed_amount_approx")))
        owed_display = owed_text if owed_text == "待核实" else owed_text

        definitions = [
            {
                "step_key": "freeze-evidence",
                "title": "先固定证据，不要急着和对方争吵",
                "why": "欠薪维权最怕材料丢失。聊天记录、考勤、工资表和转账记录能帮助说明你干了活、约定多少工资、还欠多少。",
                "prepare": evidence_prepare,
                "legal_basis": ["mwpr-28", "mwpr-31"],
                "risk_note": "保存原始载体，不要只保留裁剪截图；不要伪造、修改证据。",
            },
            {
                "step_key": "reconcile-amount",
                "title": "把工资总额和欠款算清楚",
                "why": f"你目前陈述尚欠{owed_display}。把工作天数、单价、已付款逐项列清楚，能减少受理时反复补充材料。",
                "prepare": [
                    "按“工作起始时间—每天/每月/计件数量—单价—应发—已付—欠付”列一张表",
                    "金额不确定的写“约”，不要为了显得金额大而多写",
                    "把最后一次付款时间和付款人记下来",
                ],
                "legal_basis": ["mwpr-16", "lcl-30"],
                "risk_note": "投诉材料中的金额应与证据相互对应；恶意夸大可能影响可信度。",
            },
            {
                "step_key": "written-confirm",
                "title": "通过微信请对方确认欠薪金额",
                "why": "对方在微信中确认工作天数或欠款金额，可以作为辅助证据；比直接争吵更有利于固定事实。",
                "prepare": [
                    "把下面这段话发给包工头或负责人，保留完整对话",
                    "如果对方回复“过几天给”“再等等”，也一并保存",
                    "不要使用威胁、辱骂或堵门等方式",
                ],
                "draft_text": build_confirmation_message(facts),
                "legal_basis": ["mwpr-16"],
                "risk_note": "沟通时只陈述事实，不要编造金额或承诺放弃权利。",
            },
            {
                "step_key": "labor-supervision",
                "title": "向项目所在地劳动保障监察机构投诉",
                "why": "建筑领域欠薪通常优先走劳动保障监察。查实后可责令限期支付；逾期不支付的，可能涉及加付赔偿金。",
                "prepare": complaint_prepare
                + [
                    "如已整理正式事实陈述，可一并携带或按要求提交",
                ],
                "channel_id": "local-labor-supervision",
                "legal_basis": ["lsr-9", "lsr-11", "lsr-26", "mwpr-30"],
                "deadline_note": "劳动保障监察一般有2年查处时效，建议尽早提交并保留投诉回执。",
                "risk_note": "先拨打12333确认项目所在地对应的受理机构和材料清单；并非每个区县都有独立受理机构。",
            },
            {
                "step_key": "national-platform",
                "title": "在全国根治欠薪线索反映平台提交线索",
                "why": "线上平台可以把线索转交属地部门核查，适合不方便现场投诉或希望留下线上记录的情况。",
                "prepare": complaint_prepare
                + [
                    "按“官方填报辅助”逐字段整理信息后再填写",
                    "保存提交成功页面、查询码或受理编号截图",
                ],
                "channel_id": "national-root-wage-platform",
                "legal_basis": ["mwpr-30", "lsr-11"],
                "deadline_note": "提交后定期查询进度；长时间无回应可拨打12333或12345。",
                "risk_note": "只从国务院客户端小程序或人社部官网进入，不要使用陌生人提供的“代投诉”链接。",
            },
            {
                "step_key": "housing-authority",
                "title": "同步向住建部门或12345反映工程款和分包问题",
                "why": "建筑工地欠薪常与工程款拨付、违法分包、实名制和工资专用账户落实有关，行业主管部门可以核查建筑市场行为。",
                "prepare": [
                    "准备好项目名称、施工总承包单位、分包单位信息",
                    "说明是否存在包工头个人招用、转包或违法分包",
                    "保留向住建部门或12345反映的记录",
                ],
                "channel_id": "henan-housing-authority",
                "legal_basis": ["mwpr-24", "mwpr-28", "mwpr-36"],
                "risk_note": "住建部门投诉入口和职责分工需以当地公布为准，可请12345转办。",
            },
            {
                "step_key": "labor-arbitration",
                "title": "视情况申请劳动仲裁或确认劳动关系",
                "why": "如果行政投诉无法解决，或需要确认劳动关系、主张二倍工资等请求，可以咨询劳动仲裁。是否受理取决于关系和请求。",
                "prepare": [
                    "先拨打12333或12348确认是否属于仲裁受理范围",
                    "准备仲裁申请书、身份证明、用工和欠薪证据",
                    "整理劳动关系证明材料：管理、考勤、工资支付、工牌等",
                ],
                "channel_id": "labor-arbitration",
                "legal_basis": ["ldal-2", "ldal-27", "lcl-82"],
                "deadline_note": "劳动仲裁一般应在知道权利受侵害之日起一年内提出；劳动关系终止的欠薪争议，应自终止之日起一年内提出。",
                "risk_note": "由个人包工头招用时，是否构成劳动关系需结合事实认定，建议先咨询专业法律帮助。",
            },
            {
                "step_key": "legal-aid",
                "title": "如经济困难，咨询法律援助",
                "why": "请求支付劳动报酬、确认劳动关系属于法律援助事项范围，符合条件的可以获得法律咨询或代理帮助。",
                "prepare": [
                    "拨打12348说明欠薪情况和家庭经济状况",
                    "准备身份证明、案件材料和困难情况说明",
                    "询问当地法律援助机构的具体申请材料",
                ],
                "channel_id": "legal-aid-12348",
                "legal_basis": ["lal-31"],
                "risk_note": "是否符合法律援助条件由法律援助机构审核，本产品不能保证申请结果。",
            },
        ]
        return definitions

    def serialize(self, case: Case) -> dict:
        channels = {channel.id: channel for channel in self.db.query(Channel).all()}
        step_records = (
            self.db.query(ActionStep)
            .filter(ActionStep.case_id == case.id)
            .order_by(ActionStep.position)
            .all()
        )
        steps = []
        for step in step_records:
            channel = channels.get(step.channel_id)
            steps.append(
                {
                    "id": step.id,
                    "step_key": step.step_key,
                    "position": step.position,
                    "title": step.title,
                    "why": step.why,
                    "prepare": step.prepare,
                    "channel_id": step.channel_id,
                    "channel_name": channel.name if channel else None,
                    "legal_basis": step.legal_basis,
                    "deadline_note": step.deadline_note,
                    "risk_note": step.risk_note,
                    "draft_text": step.draft_text,
                    "done": step.done,
                    "done_at": step.done_at.isoformat() if step.done_at else None,
                }
            )
        done = sum(1 for step in steps if step["done"])
        selected_channels = self._channels(case.facts, channels)
        return {
            "case_id": case.id,
            "title": case.title,
            "steps": steps,
            "progress": {
                "done": done,
                "total": len(steps),
                "percent": round(done / len(steps) * 100) if steps else 0,
            },
            "channels": selected_channels,
            "primary_channel_id": "local-labor-supervision",
            "formal_statement": build_formal_statement(case.facts),
            "evidence_directory": build_evidence_directory(case.facts),
            "deadlines": [
                {
                    "title": "劳动保障监察查处时效",
                    "detail": "违反劳动保障法律的行为在2年内未被发现、举报或投诉的，劳动保障监察可能不再查处。起算和连续状态需结合事实判断。",
                    "legal_basis": ["lsr-20"],
                    "urgency": "尽快",
                },
                {
                    "title": "劳动仲裁时效",
                    "detail": "劳动仲裁一般为一年。劳动关系存续期间因拖欠劳动报酬发生争议的，不受一年限制；但劳动关系终止的，应自终止之日起一年内提出。",
                    "legal_basis": ["ldal-27"],
                    "urgency": "视关系状态",
                },
            ],
            "risks": [
                "本产品不承诺一定能追回工资或胜诉。",
                "不要堵门、拉横幅、威胁或采取其他可能违法的讨薪方式。",
                "不要伪造、修改证据，也不要向陌生人支付“代理维权”费用。",
                "施工总承包先行清偿不等于最终责任一定由总包承担，最终责任需依法认定。",
                "投诉和仲裁材料中的金额、时间应与证据核对一致。",
            ],
            "generated_at": case.plan_generated_at.isoformat() if case.plan_generated_at else datetime.now(timezone.utc).isoformat(),
            "disclaimer": "本行动指南根据你提供的事实和本地法律知识库生成，不构成正式法律意见。复杂或不确定案件请咨询12348或专业律师。",
            "agents": ["Legal Research Agent", "Case Analysis Agent", self.name],
        }

    @staticmethod
    def _channels(facts: dict, channels: dict[str, Channel]) -> list[dict]:
        order = [
            "local-labor-supervision",
            "national-root-wage-platform",
            "henan-12333",
            "henan-12345",
            "henan-housing-authority",
            "labor-arbitration",
            "legal-aid-12348",
            "court-litigation",
        ]
        reasons = {
            "local-labor-supervision": "建筑领域欠薪通常优先由项目所在地人社部门劳动保障监察机构处理，可责令限期支付。",
            "national-root-wage-platform": "线上留痕并转交属地核查，适合与现场投诉同步进行。",
            "henan-12333": "先用来确认项目所在地的具体受理机构、材料和办理路径。",
            "henan-12345": "不清楚具体受理部门时，可通过政务服务热线转办。",
            "henan-housing-authority": "工程款拨付、违法分包、实名制和工资专户等问题可向住建部门反映。",
            "labor-arbitration": "行政投诉无法解决，或需要确认劳动关系、主张二倍工资等请求时考虑。",
            "legal-aid-12348": "请求支付劳动报酬、确认劳动关系，经济困难时可咨询法律援助。",
            "court-litigation": "其他途径仍无法解决时，可咨询诉讼或支付令，不建议一开始就走诉讼。",
        }
        result = []
        for channel_id in order:
            channel = channels.get(channel_id)
            if not channel:
                continue
            result.append(
                {
                    "id": channel.id,
                    "name": channel.name,
                    "category": channel.category,
                    "description": channel.description,
                    "official_url": channel.official_url,
                    "access_note": channel.access_note,
                    "jurisdiction_rule": channel.jurisdiction_rule,
                    "verification_status": channel.verification_status,
                    "last_verified_at": channel.last_verified_at,
                    "source_note": channel.source_note,
                    "recommended": channel_id in ("local-labor-supervision", "national-root-wage-platform"),
                    "reason": reasons.get(channel_id, ""),
                    "legal_basis": channel.legal_basis,
                }
            )
        return result
