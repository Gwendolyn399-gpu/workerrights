from typing import Any

FACT_LABELS = {
    "location_city": "工作城市",
    "location_district": "区/县",
    "location_detail": "工地位置",
    "project_name": "项目名称",
    "developer_name": "建设单位",
    "contractor_name": "施工总承包单位",
    "subcontractor_name": "分包/劳务单位",
    "work_type": "工种",
    "work_start": "开始时间",
    "work_end": "结束时间",
    "duration_text": "工作时长",
    "recruiter_type": "招用方式",
    "recruiter_name": "招用人/包工头",
    "recruiter_phone": "招用人电话",
    "manager_role": "日常管理主体",
    "wage_basis": "工资计算方式",
    "daily_wage": "日工资",
    "monthly_wage": "月工资",
    "unit_price": "计件单价",
    "agreed_amount": "约定工资总额",
    "paid_amount": "已支付金额",
    "owed_amount": "拖欠金额",
    "has_contract": "书面合同",
    "evidence": "已有证据",
    "project_info_status": "项目信息掌握情况",
    "prior_report": "此前反映情况",
    "prior_report_detail": "此前反映说明",
    "contact_phone": "联系电话",
    "owed_amount_note": "金额说明",
    "user_statement": "你的原始陈述",
    "location_province": "省份",
}


def format_amount(value: float | int | None, approximate: bool = False) -> str:
    if value is None:
        return "待核实"
    if value >= 10000:
        amount = value / 10000
        text = f"{amount:.1f}".rstrip("0").rstrip(".") + "万元"
    else:
        text = f"{int(value):,}元" if float(value).is_integer() else f"{value:,.1f}元"
    return f"约{text}" if approximate else text


def location_text(facts: dict) -> str:
    parts = [
        facts.get("location_province"),
        facts.get("location_city"),
        facts.get("location_district"),
        facts.get("location_detail"),
    ]
    return "".join(part for part in parts if part) or "待核实"


def work_period_text(facts: dict) -> str:
    if facts.get("work_start") and facts.get("work_end"):
        return f"{facts['work_start']} 至 {facts['work_end']}"
    if facts.get("work_start"):
        return f"{facts['work_start']} 起（结束时间待核实）"
    if facts.get("duration_text"):
        return f"约{facts['duration_text']}"
    return "待核实"


def evidence_labels(keys: list[str] | None, catalog: list[dict]) -> list[str]:
    mapping = {item["key"]: item["label"] for item in catalog}
    return [mapping[key] for key in (keys or []) if key in mapping]


def required_progress(facts: dict, intake: dict) -> dict:
    unknowns = intake.get("unknowns", {})
    checks = {
        "location": bool(facts.get("location_city")) or "location" in unknowns,
        "work_type": bool(facts.get("work_type")) or "work_type" in unknowns,
        "period": bool(
            facts.get("duration_text") or facts.get("work_start") or facts.get("work_end")
        )
        or "period" in unknowns,
        "recruiter": bool(facts.get("recruiter_type")) or "recruiter" in unknowns,
        "manager": bool(facts.get("manager_role")) or "manager" in unknowns,
        "wage_basis": bool(facts.get("wage_basis")) or "wage_basis" in unknowns,
        "amounts": bool(
            facts.get("agreed_amount") or facts.get("paid_amount") or facts.get("owed_amount")
        )
        or bool(facts.get("owed_amount_note"))
        or "amounts" in unknowns,
        "owed_amount": bool(facts.get("owed_amount") or facts.get("owed_amount_note"))
        or "owed_amount" in unknowns,
        "paid_amount": facts.get("paid_amount") is not None or "paid_amount" in unknowns,
        "contract": bool(facts.get("has_contract")) or "contract" in unknowns,
        "evidence": bool(
            facts.get("evidence") or facts.get("evidence_other") or facts.get("evidence_status")
        )
        or "evidence" in unknowns,
    }
    done = sum(1 for value in checks.values() if value)
    total = len(checks)
    return {
        "checks": checks,
        "done": done,
        "total": total,
        "percent": round(done / total * 100),
        "unknown_count": len(unknowns),
    }


def build_case_title(facts: dict) -> str:
    city = facts.get("location_city")
    work_type = facts.get("work_type")
    prefix = f"{city.removesuffix('市')}" if city else "河南"
    suffix = f" · {work_type}" if work_type and work_type not in ("其他", "不清楚") else ""
    return f"{prefix}建筑工地欠薪{suffix}"


def build_relationship(facts: dict) -> dict:
    def node(
        node_id: str,
        label: str,
        name: str | None,
        status: str,
        note: str,
    ) -> dict:
        return {
            "id": node_id,
            "label": label,
            "name": name or "待核实",
            "status": status,
            "note": note,
        }

    developer_status = "known" if facts.get("developer_name") else "unknown"
    contractor_status = "known" if facts.get("contractor_name") else "unknown"
    subcontractor_name = facts.get("subcontractor_name")
    subcontractor_status = "known" if subcontractor_name else "unknown"

    foreman_name = facts.get("recruiter_name")
    recruiter_type = facts.get("recruiter_type")
    foreman_status = "known" if foreman_name else "unknown"
    if not foreman_name and recruiter_type == "包工头":
        foreman_status = "partial"

    if recruiter_type == "劳务公司" and not subcontractor_name:
        subcontractor_status = "partial"
    if recruiter_type == "施工企业/项目部" and not facts.get("contractor_name"):
        contractor_status = "partial"

    manager_role = facts.get("manager_role")
    if manager_role == "项目部" and contractor_status == "unknown":
        contractor_status = "partial"
    if manager_role == "包工头" and foreman_status == "unknown":
        foreman_status = "partial"

    notes = []
    if recruiter_type:
        notes.append(f"直接招用方式：{recruiter_type}")
    if manager_role:
        notes.append(f"日常管理：{manager_role}")
    if not facts.get("contractor_name") and not facts.get("subcontractor_name"):
        notes.append("施工总承包、分包关系尚未核实，不能据此认定最终责任主体")

    nodes = [
        node(
            "developer",
            "建设单位",
            facts.get("developer_name"),
            developer_status,
            "工程的业主或开发方，待核实",
        ),
        node(
            "contractor",
            "施工总承包单位",
            facts.get("contractor_name"),
            contractor_status,
            "对项目施工总承包的公司，待核实",
        ),
        node(
            "subcontractor",
            "分包单位 / 劳务公司",
            subcontractor_name,
            subcontractor_status,
            "从总包承接劳务的单位，待核实",
        ),
        node(
            "foreman",
            "包工头 / 直接招用人",
            foreman_name or (recruiter_type if recruiter_type else None),
            foreman_status,
            "直接联系、安排工作或发工资的人",
        ),
        node("worker", "劳动者（你）", "本人", "known", "实际提供劳动的人"),
    ]
    edges = [
        {"from": "developer", "to": "contractor", "label": "工程发包", "status": "unknown"},
        {"from": "contractor", "to": "subcontractor", "label": "专业/劳务分包", "status": "unknown"},
        {"from": "subcontractor", "to": "foreman", "label": "劳务分包/招用", "status": "unknown"},
        {
            "from": "foreman",
            "to": "worker",
            "label": "招用 · 安排工作",
            "status": "partial" if foreman_status != "unknown" else "unknown",
        },
    ]
    if facts.get("contractor_name"):
        edges[0]["status"] = "partial"
        edges[1]["status"] = "partial"
    if facts.get("subcontractor_name"):
        edges[1]["status"] = "partial"
        edges[2]["status"] = "partial"

    return {
        "nodes": nodes,
        "edges": edges,
        "confirmed_notes": notes,
        "disclaimer": "该关系图仅根据你提供的信息整理，未知主体保留为“待核实”，不代表已经认定法律责任。最终责任主体需由行政机关或仲裁、司法机关依法认定。",
    }


def format_ack(updates: dict, facts: dict) -> str:
    parts: list[str] = []
    if "location_city" in updates or "location_district" in updates:
        parts.append(f"地点：{location_text(facts)}")
    if "work_type" in updates:
        parts.append(f"工种：{facts['work_type']}")
    if any(key in updates for key in ("work_start", "work_end", "duration_text")):
        parts.append(f"工作时间：{work_period_text(facts)}")
    if "recruiter_type" in updates or "recruiter_name" in updates:
        recruiter = facts.get("recruiter_name") or facts.get("recruiter_type")
        if recruiter:
            parts.append(f"招用人：{recruiter}")
    if "manager_role" in updates and facts.get("manager_role"):
        parts.append(f"日常管理：{facts['manager_role']}")
    if "wage_basis" in updates and facts.get("wage_basis"):
        parts.append(f"工资算法：{facts['wage_basis']}")
    if "agreed_amount" in updates and facts.get("agreed_amount"):
        parts.append(f"约定总额：{format_amount(facts['agreed_amount'])}")
    if "paid_amount" in updates and facts.get("paid_amount") is not None:
        parts.append(f"已付：{format_amount(facts['paid_amount'])}")
    if "owed_amount" in updates and facts.get("owed_amount"):
        parts.append(
            f"欠薪：{format_amount(facts['owed_amount'], bool(facts.get('owed_amount_approx')))}"
        )
    if "has_contract" in updates:
        mapping = {"yes": "已签书面合同", "no": "没有书面合同", "unknown": "合同情况不清楚"}
        parts.append(mapping.get(facts.get("has_contract", ""), "合同情况待核实"))
    if "evidence" in updates:
        parts.append("证据材料已记录")
    if "prior_report" in updates:
        parts.append("此前反映情况已记录")
    if "project_info_status" in updates and facts.get("project_info_status") == "unknown":
        parts.append("项目信息暂不清楚")
    if not parts:
        return ""
    return "我记下了：" + "；".join(parts) + "。"
