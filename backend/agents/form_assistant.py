from datetime import datetime, timezone

from backend.legal.loader import load_form_schema
from backend.models.case import Case
from backend.services.facts import (
    FACT_LABELS,
    format_amount,
    location_text,
    work_period_text,
)
from backend.services.statement import (
    build_evidence_directory,
    build_formal_statement,
    build_short_description,
)


class FormAssistantAgent:
    name = "Form Assistant"

    def run(self, case: Case) -> dict:
        facts = case.facts
        schema = load_form_schema()
        steps = []
        ready_fields = 0
        total_fields = 0
        for step in schema["steps"]:
            fields = []
            for field in step["fields"]:
                total_fields += 1
                generated = self._generate_field(field, facts)
                if generated["status"] in ("ready", "official_only"):
                    ready_fields += 1
                fields.append(generated)
            steps.append(
                {
                    "id": step["id"],
                    "title": step["title"],
                    "goal": step["goal"],
                    "tips": step["tips"],
                    "fields": fields,
                }
            )
        return {
            "case_id": case.id,
            "platform": {
                "name": schema["platform_name"],
                "official_url": schema["official_url"],
                "access_note": schema["access_note"],
                "verification_status": schema["verification_status"],
                "last_verified_at": schema["last_verified_at"],
                "source_note": schema["source_note"],
            },
            "steps": steps,
            "progress": {
                "ready": ready_fields,
                "total": total_fields,
                "percent": round(ready_fields / total_fields * 100) if total_fields else 0,
            },
            "formal_statement": build_formal_statement(facts),
            "short_description": build_short_description(facts),
            "evidence_directory": build_evidence_directory(facts),
            "copy_summary": self._copy_summary(steps),
            "privacy_notice": "姓名、手机号和身份证号由本人在官方平台填写，本产品不收集这些填报字段，也不要求上传身份证、银行卡等敏感材料。",
            "submit_notice": "本页面只辅助整理填报内容，不会自动登录、自动上传或代替你提交。提交前请逐项核对，并以官方页面要求为准。",
            "generated_at": datetime.now(timezone.utc).isoformat(),
            "agent": self.name,
        }

    @staticmethod
    def _generate_field(field: dict, facts: dict) -> dict:
        key = field["key"]
        value: str | None = None
        status = "missing"
        note = ""
        approx = False

        if key == "scene_category":
            value = "工程建设领域欠薪"
            status = "ready"
        elif key == "work_location":
            value = location_text(facts) if facts.get("location_city") else None
            status = "ready" if value else "missing"
            if value and facts.get("location_district"):
                note = "区县已确认；具体项目地址可在官方平台补充。"
            elif value:
                note = "区县尚未确认，提交前建议补充或拨打12333确认管辖。"
                status = "verify"
        elif key == "project_name":
            value = facts.get("project_name")
            status = "ready" if value else "missing"
            note = "不知道可以不填，不要编造。"
        elif key == "developer_name":
            value = facts.get("developer_name")
            status = "ready" if value else "missing"
        elif key == "contractor_name":
            value = facts.get("contractor_name")
            status = "ready" if value else "missing"
        elif key == "subcontractor_name":
            value = facts.get("subcontractor_name")
            if not value and facts.get("recruiter_type") == "包工头":
                value = "个人包工头" + (f"：{facts['recruiter_name']}" if facts.get("recruiter_name") else "（姓名待核实）")
                status = "verify" if not facts.get("recruiter_name") else "ready"
                note = "由个人包工头直接招用，建议同时填写包工头姓名。"
            else:
                status = "ready" if value else "missing"
        elif key == "foreman_name":
            value = facts.get("recruiter_name")
            status = "ready" if value else "missing"
            note = "只知道称呼时，可写“王老板”等并注明具体姓名待核实。"
        elif key == "foreman_phone":
            value = facts.get("recruiter_phone")
            status = "ready" if value else "missing"
            note = "没有或不方便提供可以留空，不要编造电话号码。"
        elif key in ("reporter_name", "reporter_phone", "reporter_id"):
            status = "official_only"
            note = "由本人在官方平台填写，本产品不收集此字段。"
        elif key == "work_period":
            value = work_period_text(facts) if work_period_text(facts) != "待核实" else None
            status = "ready" if value else "missing"
            if facts.get("duration_text") and not facts.get("work_start") and not facts.get("work_end"):
                field = {**field, "label": "工作时长", "explanation": "目前只知道工作时长，起止日期由本人核实后在官方平台补充。"}
                value = str(facts["duration_text"])
                status = "verify"
                note = "工作时长不是起止日期，不据此推算月份或日期。"
            elif value and ("待核实" in value or "待补充" in value):
                status = "verify"
        elif key == "work_type":
            value = facts.get("work_type")
            status = "ready" if value else "missing"
        elif key == "wage_agreement":
            parts = []
            if facts.get("wage_basis"):
                parts.append(facts["wage_basis"])
            if facts.get("daily_wage"):
                parts.append(f"每天{format_amount(facts['daily_wage'])}")
            if facts.get("monthly_wage"):
                parts.append(f"每月{format_amount(facts['monthly_wage'])}")
            if facts.get("unit_price"):
                parts.append(f"单价{format_amount(facts['unit_price'])}")
            if facts.get("agreed_amount"):
                parts.append(f"应发合计约{format_amount(facts['agreed_amount'])}")
            value = "，".join(parts) if parts else None
            status = "ready" if value else "missing"
        elif key == "paid_amount":
            value = (
                format_amount(facts.get("paid_amount"))
                if facts.get("paid_amount") is not None
                else None
            )
            status = "ready" if value else "missing"
        elif key == "owed_amount":
            if facts.get("owed_amount") is not None:
                approx = bool(facts.get("owed_amount_approx"))
                value = format_amount(facts["owed_amount"], approx)
                status = "verify" if approx else "ready"
                note = "金额为约数，请在正式材料中注明“约”。" if approx else ""
            else:
                value = None
                note = "先在对话或案件信息中补充欠款金额；不确定可填约数。"
        elif key == "description":
            value = build_short_description(facts)
            status = "ready"
            if any(marker in value for marker in ("【", "待核实", "待补充")):
                status = "verify"
                note = "描述中包含待补充或待核实内容，提交前请核对。"
        elif key == "evidence_list":
            directory = build_evidence_directory(facts)
            if directory:
                value = "\n".join(
                    f"{index}. {item['label']}（{item['status']}）：可证明{item['proves']}"
                    for index, item in enumerate(directory, start=1)
                )
                status = "ready"
            else:
                value = None
                note = "暂时没有材料也可以提交线索，在描述中说明情况即可。"

        if field.get("required") and status == "missing":
            note = note or "官方平台可能要求填写；不知道的可留空并说明，不要编造。"
        if field.get("sensitivity") in ("id",):
            status = "official_only"

        copy_text = "【由本人在官方平台填写，本产品不收集】" if status == "official_only" else value or f"【待补充：{field['label']}】"
        return {
            "key": key,
            "label": field["label"],
            "explanation": field["explanation"],
            "required": field.get("required", False),
            "sensitivity": field.get("sensitivity", "none"),
            "input_type": field.get("input_type", "text"),
            "status": status,
            "value": value,
            "copy_text": copy_text,
            "note": note,
            "source_facts": [
                FACT_LABELS.get(source, source)
                for source in field.get("source_facts", [])
                if status != "official_only" and facts.get(source) not in (None, "", [], {})
            ],
            "placeholder": field.get("placeholder"),
        }

    @staticmethod
    def _copy_summary(steps: list[dict]) -> str:
        lines: list[str] = []
        for step in steps:
            if not step["fields"]:
                continue
            lines.append(f"【{step['title']}】")
            for field in step["fields"]:
                lines.append(f"{field['label']}：{field['copy_text']}")
            lines.append("")
        return "\n".join(lines).strip()
