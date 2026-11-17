import copy
import re

from sqlalchemy.orm import Session

from backend.agents.questions import get_question, is_unknown_answer
from backend.models.case import Case, Message
from backend.rules.regions import REGION_INDEX
from backend.services.fact_extractor import FactExtractor
from backend.services.facts import (
    build_case_title,
    format_ack,
    format_amount,
    required_progress,
)

REQUIRED_ORDER = [
    "work_type",
    "period",
    "recruiter",
    "manager",
    "wage_basis",
    "amounts",
    "paid_amount",
    "contract",
    "evidence",
]

CONFIRM_MARKERS = ("无误", "确认", "生成分析", "没问题", "可以生成", "对的", "是的")
MODIFY_MARKERS = ("修改", "改一下", "不对", "等等", "先别", "我再想想", "有错")


class IntakeAgent:
    """Conversational intake. Asks one question at a time and never invents facts."""

    name = "Intake Agent"

    def __init__(self, db: Session, provider=None) -> None:
        self.db = db
        self.provider = provider
        self.extractor = FactExtractor()

    def start_case(self, case: Case) -> Message:
        case.intake = {
            "answered": [],
            "skipped": [],
            "unknowns": {},
            "attempts": {},
            "confirmed": False,
            "last_question_key": None,
        }
        case.facts["user_statement"] = None
        question = self.next_question(case)
        if question:
            case.intake["last_question_key"] = question["key"]
        greeting = (
            "你好，我是工友权益助手。这里不用懂法律，也不用填长表格。"
            "你用平时说话的方式告诉我遇到了什么事，我会一次问一个问题，慢慢帮你整理。\n\n"
            f"{question['text'] if question else ''}"
        )
        message = Message(
            case_id=case.id,
            role="assistant",
            content=greeting,
            meta={
                "kind": "question",
                "question": question,
                "quick_replies": question["quick_replies"] if question else [],
                "provider": getattr(self.provider, "display_name", "本地规则引擎（演示）"),
                "provider_is_mock": getattr(self.provider, "is_mock", True),
            },
        )
        case.messages.append(message)
        case.title = build_case_title(case.facts)
        self.db.flush()
        return message

    def handle_message(self, case: Case, text: str) -> dict:
        intake = copy.deepcopy(case.intake or {})
        intake.setdefault("answered", [])
        intake.setdefault("skipped", [])
        intake.setdefault("unknowns", {})
        intake.setdefault("attempts", {})
        intake.setdefault("confirmed", False)
        last_key = intake.get("last_question_key")
        clean_text = text.strip()
        was_confirmed = bool(intake.get("confirmed"))

        was_unknown = False
        if last_key and self._is_skip(clean_text):
            if last_key not in intake["skipped"]:
                intake["skipped"].append(last_key)
            if last_key in ("location", "work_type", "period", "recruiter", "manager", "wage_basis", "amounts", "paid_amount", "owed_amount", "agreed_amount", "contract", "evidence"):
                intake["unknowns"][last_key] = "用户选择跳过或不清楚"
                was_unknown = True

        updates, _meta = self.extractor.extract(clean_text, case.facts, last_key)
        self._merge_facts(case.facts, updates)
        self._handle_district_answer(case, clean_text, last_key, updates)

        if last_key == "owed_confirm":
            self._handle_owed_confirm(case, clean_text, intake)

        if last_key and not was_unknown:
            if (
                is_unknown_answer(clean_text)
                and not self._question_ready(last_key, case.facts, intake)
                and not self._unknown_refers_elsewhere(last_key, clean_text)
            ):
                intake["unknowns"][last_key] = clean_text[:80]
                was_unknown = True
                updates["_unknown_accepted"] = last_key

        if last_key and not self._question_ready(last_key, case.facts, intake):
            intake["attempts"][last_key] = int(intake["attempts"].get(last_key, 0)) + 1
        else:
            if last_key:
                intake["attempts"][last_key] = 0
                if last_key not in intake["answered"]:
                    intake["answered"].append(last_key)

        case.facts["scene"] = "construction_wage_arrears"
        case.intake = intake
        case.title = build_case_title(case.facts)

        meaningful_updates = {
            key: value
            for key, value in updates.items()
            if not key.startswith("_") and key != "user_statement"
        }
        if was_confirmed and not meaningful_updates:
            side_answer = self._side_answer(clean_text)
            reply = "案件信息已经确认。你可以直接查看“案件分析”“行动指南”或“官方填报辅助”。如需补充或修改事实，请点右侧的“修改案件信息”。"
            if side_answer:
                reply = side_answer + "\n\n" + reply
            message = Message(
                case_id=case.id,
                role="assistant",
                content=reply,
                meta={
                    "kind": "summary",
                    "question": None,
                    "quick_replies": [],
                    "progress": required_progress(case.facts, case.intake),
                    "provider": getattr(self.provider, "display_name", "本地规则引擎（演示）"),
                    "provider_is_mock": getattr(self.provider, "is_mock", True),
                },
            )
            case.messages.append(message)
            case.intake["last_question_key"] = None
            self.db.flush()
            return {
                "message": message,
                "question": None,
                "progress": required_progress(case.facts, case.intake),
                "facts": case.facts,
                "status": case.status,
            }
        if was_confirmed and meaningful_updates:
            intake["confirmed"] = False
            case.status = "collecting"

        if last_key == "confirm" or (
            not case.intake["confirmed"]
            and self._all_required_ready(case.facts, case.intake)
            and intake.get("last_question_key") == "confirm"
        ):
            self._handle_confirmation(case, clean_text, intake)

        question = self.next_question(case)
        if question:
            case.intake["last_question_key"] = question["key"]
        else:
            case.intake["last_question_key"] = None

        if case.intake["confirmed"]:
            case.status = "ready"
            reply = (
                "信息已确认。我现在会按三步整理：\n"
                "1. 分析你的用工关系和可能涉及的权益；\n"
                "2. 匹配国家法律与河南的维权渠道；\n"
                "3. 生成可以照着做的行动步骤和官方填报参考。\n\n"
                "你可以先查看“案件分析”，也可以直接进入“维权行动指南”。"
            )
            kind = "summary"
            quick_replies = []
        else:
            ack = format_ack(updates, case.facts)
            side_answer = self._side_answer(clean_text)
            if was_unknown:
                ack = (ack + " " if ack else "") + "没关系，这一项先标记为“待核实”，不影响继续整理。"
            if not ack and not side_answer:
                ack = "我还没从这句话里整理出新的案件信息。"
            parts = [part for part in (ack, side_answer) if part]
            reply = "\n\n".join(parts)
            if question:
                reply += "\n\n" + question["text"]
            kind = "question"
            quick_replies = question["quick_replies"] if question else []

        message = Message(
            case_id=case.id,
            role="assistant",
            content=reply,
            meta={
                "kind": kind,
                "question": question,
                "quick_replies": quick_replies,
                "updated_facts": {
                    key: value
                    for key, value in updates.items()
                    if not key.startswith("_") and key != "user_statement"
                },
                "progress": required_progress(case.facts, case.intake),
                "provider": getattr(self.provider, "display_name", "本地规则引擎（演示）"),
                "provider_is_mock": getattr(self.provider, "is_mock", True),
            },
        )
        case.messages.append(message)
        self.db.flush()
        return {
            "message": message,
            "question": question,
            "progress": required_progress(case.facts, case.intake),
            "facts": case.facts,
            "status": case.status,
        }

    @staticmethod
    def _is_skip(text: str) -> bool:
        return any(marker in text for marker in ("跳过", "不想说", "不方便说"))

    @staticmethod
    def _merge_facts(facts: dict, updates: dict) -> None:
        for key, value in updates.items():
            if key.startswith("_"):
                continue
            if key == "evidence" and isinstance(value, list):
                existing = list(facts.get("evidence") or [])
                merged = existing[:]
                for item in value:
                    if item not in merged:
                        merged.append(item)
                facts["evidence"] = merged
                continue
            if key == "user_statement":
                facts[key] = value
                continue
            facts[key] = value

    def _handle_district_answer(
        self, case: Case, text: str, last_key: str | None, updates: dict
    ) -> None:
        if last_key != "district":
            return
        city = REGION_INDEX.get(case.facts.get("location_city") or "")
        if not city:
            return
        for district_name in city["districts"]:
            if district_name in text:
                case.facts["location_district"] = district_name
                return
            short = district_name.removesuffix("区").removesuffix("县").removesuffix("市")
            if len(short) >= 2 and short in text:
                case.facts["location_district"] = district_name
                return

    def _handle_owed_confirm(self, case: Case, text: str, intake: dict) -> None:
        if any(marker in text for marker in ("不对", "重新说", "不是")):
            case.facts["owed_amount"] = None
            return
        if any(marker in text for marker in ("对", "是", "差不多")):
            agreed = float(case.facts.get("agreed_amount") or 0)
            paid = float(case.facts.get("paid_amount") or 0)
            difference = max(agreed - paid, 0)
            if difference:
                case.facts["owed_amount"] = difference
                case.facts["owed_amount_approx"] = True
                case.facts["owed_amount_note"] = "根据用户提供的应发和已付金额计算，并经用户确认"
                intake["unknowns"].pop("owed_amount", None)

    def _handle_confirmation(self, case: Case, text: str, intake: dict) -> None:
        if any(marker in text for marker in MODIFY_MARKERS):
            intake["confirmed"] = False
            return
        if any(marker in text for marker in CONFIRM_MARKERS):
            intake["confirmed"] = True
            intent = intake.get("intent")
            if not intent:
                case.status = "ready"

    @staticmethod
    def _question_ready(key: str | None, facts: dict, intake: dict) -> bool:
        if not key:
            return False
        if key in intake.get("unknowns", {}) or key in intake.get("skipped", []):
            return True
        if key == "location":
            return bool(facts.get("location_city"))
        if key == "district":
            return bool(facts.get("location_district"))
        if key == "work_type":
            return bool(facts.get("work_type"))
        if key == "period":
            return bool(facts.get("duration_text") or facts.get("work_start") or facts.get("work_end"))
        if key == "recruiter":
            return bool(facts.get("recruiter_type"))
        if key == "manager":
            return bool(facts.get("manager_role"))
        if key == "wage_basis":
            return bool(facts.get("wage_basis"))
        if key == "amounts":
            return bool(
                facts.get("agreed_amount") or facts.get("paid_amount") or facts.get("owed_amount")
            ) or bool(facts.get("owed_amount_note"))
        if key == "paid_amount":
            return facts.get("paid_amount") is not None
        if key == "agreed_amount":
            return facts.get("agreed_amount") is not None
        if key == "owed_amount":
            return bool(facts.get("owed_amount") or facts.get("owed_amount_note"))
        if key == "owed_confirm":
            return bool(facts.get("owed_amount"))
        if key == "contract":
            return bool(facts.get("has_contract"))
        if key == "evidence":
            return bool(
                facts.get("evidence") or facts.get("evidence_other") or facts.get("evidence_status")
            )
        if key == "project_info":
            return bool(
                facts.get("project_info_status")
                or facts.get("project_name")
                or facts.get("contractor_name")
                or facts.get("subcontractor_name")
                or facts.get("developer_name")
            ) or key in intake.get("skipped", [])
        if key == "prior_report":
            return facts.get("prior_report") is not None or key in intake.get("skipped", [])
        if key == "confirm":
            return bool(intake.get("confirmed"))
        return False

    def _all_required_ready(self, facts: dict, intake: dict) -> bool:
        keys = ["location", "work_type", "period", "recruiter", "manager", "wage_basis", "amounts", "paid_amount", "contract", "evidence"]
        return all(self._question_ready(key, facts, intake) for key in keys)

    def next_question(self, case: Case) -> dict | None:
        facts = case.facts
        intake = case.intake or {}
        if intake.get("confirmed"):
            return None
        if not self._question_ready("location", facts, intake):
            return self._with_attempts("location", facts, intake)
        if (
            facts.get("location_city")
            and not facts.get("location_district")
            and "district" not in intake.get("skipped", [])
            and "district" not in intake.get("unknowns", {})
        ):
            return self._with_attempts("district", facts, intake)

        for key in REQUIRED_ORDER:
            if key == "amounts":
                if not self._question_ready("amounts", facts, intake):
                    return self._with_attempts("amounts", facts, intake)
                continue
            if not self._question_ready(key, facts, intake):
                return self._with_attempts(key, facts, intake)

        if not self._question_ready("owed_amount", facts, intake):
            if facts.get("agreed_amount") and facts.get("paid_amount") is not None:
                return self._with_attempts("owed_confirm", facts, intake)
            return self._with_attempts("owed_amount", facts, intake)

        if (
            not self._question_ready("agreed_amount", facts, intake)
            and "agreed_amount" not in intake.get("skipped", [])
            and "agreed_amount" not in intake.get("unknowns", {})
        ):
            return self._with_attempts("agreed_amount", facts, intake)

        if not self._question_ready("project_info", facts, intake):
            return self._with_attempts("project_info", facts, intake)
        if not self._question_ready("prior_report", facts, intake):
            return self._with_attempts("prior_report", facts, intake)
        return self._with_attempts("confirm", facts, intake)

    def _with_attempts(self, key: str, facts: dict, intake: dict) -> dict:
        attempts = int(intake.get("attempts", {}).get(key, 0))
        question = get_question(key, facts, attempts)
        if question is None:
            raise ValueError(f"Unknown intake question: {key}")
        return question

    @staticmethod
    def _unknown_refers_elsewhere(key: str, text: str) -> bool:
        topic_keywords = {
            "location": ("郑州", "洛阳", "开封", "河南", "区", "县", "工地"),
            "work_type": ("钢筋", "木工", "瓦工", "水电", "架子", "混凝土", "杂工", "工种"),
            "period": ("月", "天", "年", "时间", "开始", "结束"),
            "recruiter": ("包工头", "劳务", "介绍", "招"),
            "manager": ("管理", "考勤", "安排"),
            "wage_basis": ("工资", "一天", "每月", "计价", "平方"),
            "amounts": ("工资", "欠", "给", "元", "万"),
            "owed_amount": ("欠", "元", "万"),
            "contract": ("合同", "协议"),
            "evidence": ("证据", "微信", "聊天", "考勤", "工资表", "转账", "欠条", "工友", "录音", "照片"),
            "project_info": ("项目", "工地", "总包", "建设单位", "公司"),
            "prior_report": ("投诉", "反映", "12345", "12333", "监察"),
        }
        others = [
            keywords
            for other_key, keywords in topic_keywords.items()
            if other_key != key and any(word in text for word in keywords)
        ]
        current = topic_keywords.get(key, ())
        current_hit = any(word in text for word in current)
        return bool(others) and not current_hit

    @staticmethod
    def _side_answer(text: str) -> str:
        if not re.search(r"[?？]|吗|能不能|多久|怎么办|怎么办|收费|要钱|赢|要回来", text):
            return ""
        if any(marker in text for marker in ("能要回来", "能赢", "胜诉", "一定")):
            return "我不能承诺一定能要回工资或一定胜诉。能不能拿回钱，要看欠薪事实、证据、责任主体和对方履行能力。现在能做的是把事实和证据整理清楚，走对渠道。"
        if any(marker in text for marker in ("多久", "多长时间", "几天")):
            return "处理时间因案件和当地部门而异，无法保证具体天数。提交投诉后建议记录受理编号，并定期通过12333或12345查询进度。"
        if any(marker in text for marker in ("收费", "要钱", "花钱", "律师费")):
            return "12333、12345和劳动保障监察投诉一般不收取费用；法律援助是否符合条件由法律援助机构审核，可先拨打12348咨询。"
        if any(marker in text for marker in ("没有证据", "没证据", "证据不足")):
            return "没有某项证据不等于不能维权。可以先保存聊天记录、考勤、工资表、转账记录，并联系工友作证，再向人社部门咨询。"
        if any(marker in text for marker in ("跑路", "找不到人", "联系不上")):
            return "如果包工头联系不上，建议尽快向项目所在地劳动保障监察机构反映，并尽量提供项目名称、总包单位和工地位置，便于找责任主体。"
        if any(marker in text for marker in ("报警", "堵门", "拉横幅", "威胁")):
            return "不建议用堵门、拉横幅、威胁等方式讨薪，可能带来新的法律风险。欠薪问题优先通过劳动保障监察、12333/12345和全国欠薪线索平台反映。"
        return ""
