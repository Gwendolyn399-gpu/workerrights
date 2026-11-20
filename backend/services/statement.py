from backend.rules.evidence import analyze_evidence
from backend.services.facts import format_amount, location_text, work_period_text


def _period(facts: dict) -> str:
    if facts.get("work_start") and facts.get("work_end"):
        return f"{facts['work_start']}至{facts['work_end']}"
    if facts.get("duration_text"):
        return str(facts["duration_text"])
    if facts.get("work_start"):
        return f"{facts['work_start']}起（结束时间待补充）"
    return "【工作时间待补充】"


def _wage_basis_text(facts: dict) -> str:
    parts: list[str] = []
    if facts.get("wage_basis"):
        parts.append(facts["wage_basis"])
    if facts.get("daily_wage"):
        parts.append(f"每天{format_amount(facts['daily_wage'])}")
    if facts.get("monthly_wage"):
        parts.append(f"每月{format_amount(facts['monthly_wage'])}")
    if facts.get("unit_price"):
        parts.append(f"单价{format_amount(facts['unit_price'])}")
    return "，".join(parts) if parts else "【工资约定待补充】"


def _wage_agreement(facts: dict) -> str:
    parts: list[str] = []
    if facts.get("wage_basis"):
        parts.append(facts["wage_basis"])
    if facts.get("daily_wage"):
        parts.append(f"每天{format_amount(facts['daily_wage'])}")
    if facts.get("monthly_wage"):
        parts.append(f"每月{format_amount(facts['monthly_wage'])}")
    if facts.get("unit_price"):
        parts.append(f"单价{format_amount(facts['unit_price'])}")
    if facts.get("agreed_amount"):
        parts.append(f"应发合计{format_amount(facts['agreed_amount'])}")
    return "，".join(parts) if parts else "【工资约定待补充】"


def _owed(facts: dict) -> str:
    if facts.get("owed_amount") is None:
        return "【欠薪金额待核实】"
    text = format_amount(facts["owed_amount"], bool(facts.get("owed_amount_approx")))
    return text


def _evidence_text(facts: dict) -> str:
    analysis = analyze_evidence(facts)
    labels = [item["label"] for item in analysis["have"]]
    if labels:
        return "、".join(labels)
    return "【现有材料待整理】"


def build_formal_statement(facts: dict) -> str:
    recruiter = facts.get("recruiter_name") or facts.get("recruiter_type") or "【招用人待核实】"
    manager = facts.get("manager_role") or "【日常管理主体待核实】"
    project = facts.get("project_name") or facts.get("location_detail") or "【项目名称待补充】"
    work_type = facts.get("work_type") or "【工种待补充】"
    base_location = "".join(
        part for part in (facts.get("location_province"), facts.get("location_city"), facts.get("location_district")) if part
    )
    location = f"{base_location}的{project}" if base_location else str(project)
    paid = format_amount(facts.get("paid_amount")) if facts.get("paid_amount") is not None else "【已付金额待核实】"
    owed = _owed(facts)
    contract_text = {
        "yes": "双方签有书面合同/协议",
        "no": "双方未签订书面劳动合同",
        "unknown": "书面合同情况尚待核实",
    }.get(facts.get("has_contract", ""), "书面合同情况尚待核实")
    prior = ""
    if facts.get("prior_report") == "yes":
        prior = f"此前我已就此事向{facts.get('prior_report_detail') or '有关部门'}反映。"
    elif facts.get("prior_report") == "no":
        prior = "此前我尚未向有关部门投诉或反映。"

    return (
        f"本人在{location}从事{work_type}工作，工作时间为{_period(facts)}。"
        f"招用我的是{recruiter}，日常由{manager}安排工作。"
        f"工资约定为：{_wage_agreement(facts)}。"
        f"已支付{paid}，截至【填写日期】尚欠{owed}。"
        f"{contract_text}。目前持有{_evidence_text(facts)}等材料。{prior}"
        "以上情况根据本人现有记忆和材料整理，如金额、时间与结算记录有出入，以双方结算和证据核对为准。本人愿意配合有关部门核查。"
    )


def build_short_description(facts: dict) -> str:
    location = location_text(facts)
    work_type = facts.get("work_type") or "建筑工作"
    recruiter = facts.get("recruiter_name") or facts.get("recruiter_type") or "用工方（待核实）"
    paid = format_amount(facts.get("paid_amount")) if facts.get("paid_amount") is not None else "待核实"
    owed = _owed(facts)
    evidence = _evidence_text(facts)
    # A duration is not a date: never write "本人三个月在…" as if it were a start time.
    if facts.get("work_start") and facts.get("work_end"):
        opening = f"本人于{facts['work_start']}至{facts['work_end']}在{location}从事{work_type}"
    elif facts.get("duration_text"):
        opening = f"本人在{location}从事{work_type}，干了{facts['duration_text']}"
    elif facts.get("work_start"):
        opening = f"本人自{facts['work_start']}起在{location}从事{work_type}（结束时间待补充）"
    else:
        opening = f"本人在{location}从事{work_type}，工作时间【待补充】"
    return (
        f"{opening}，由{recruiter}招用。"
        f"工资约定为{_wage_agreement(facts)}，已支付{paid}，目前尚欠{owed}。"
        f"现持有{evidence}等材料，请求协调处理欠薪问题。"
    )


def build_evidence_directory(facts: dict) -> list[dict]:
    analysis = analyze_evidence(facts)
    rows: list[dict] = []
    for item in analysis["have"]:
        rows.append(
            {
                "label": item["label"],
                "proves": "、".join(item["proves"]),
                "status": "已有",
                "how_to_get": item["how_to_get"],
            }
        )
    for item in analysis["needed"]:
        rows.append(
            {
                "label": item["label"],
                "proves": item["reason"],
                "status": "待补充",
                "how_to_get": "可按说明收集；没有某项材料不等于无法维权。",
            }
        )
    for item in analysis["alternatives"]:
        rows.append(
            {
                "label": item["label"],
                "proves": item["reason"],
                "status": "替代材料",
                "how_to_get": item.get("reason", ""),
            }
        )
    return rows


def build_confirmation_message(facts: dict) -> str:
    recruiter = facts.get("recruiter_name") or facts.get("recruiter_type") or "负责人"
    work_type = facts.get("work_type") or "工地上的活"
    period = _period(facts)
    agreed = (
        format_amount(facts.get("agreed_amount"))
        if facts.get("agreed_amount") is not None
        else "【应发金额】"
    )
    paid = (
        format_amount(facts.get("paid_amount"))
        if facts.get("paid_amount") is not None
        else "【已付金额】"
    )
    owed = _owed(facts)
    return (
        f"{recruiter}，我把工资账再和您核对一下："
        f"我在工地从事{work_type}，工作时间为{period}，工资约定为{_wage_basis_text(facts)}，"
        f"应发约{agreed}，已收到{paid}，目前还差{owed}。"
        "麻烦您确认一下工作天数和金额对不对，以及大概什么时候能结清。谢谢。"
    )
