from sqlalchemy.orm import Session

from backend.agents.orchestrator import AgentOrchestrator
from backend.models.case import Case, Message
from backend.services.fact_extractor import NEW_CASE_FACTS

DEMO_TITLE = "郑州金水区建筑工地欠薪（虚构演示）"

DEMO_FACTS = {
    **NEW_CASE_FACTS,
    "location_province": "河南省",
    "location_city": "郑州市",
    "location_district": "金水区",
    "location_detail": "某安置房项目工地（虚构）",
    "project_name": "某安置房项目（虚构）",
    "developer_name": "示例置业有限公司（虚构）",
    "contractor_name": "示例建设工程有限公司（虚构）",
    "subcontractor_name": "示例劳务有限公司（虚构）",
    "work_type": "钢筋工",
    "work_start": "2026-06",
    "work_end": "2026-09",
    "duration_text": "约3个月",
    "duration_months": 3,
    "recruiter_type": "包工头",
    "recruiter_name": "王某某（化名）",
    "manager_role": "包工头",
    "wage_basis": "按天",
    "daily_wage": 350,
    "agreed_amount": 26000,
    "paid_amount": 6000,
    "owed_amount": 20000,
    "owed_amount_approx": False,
    "owed_amount_note": "虚构演示数据：按约80天、每天350元估算，已支付6000元",
    "has_contract": "no",
    "evidence": ["chat", "attendance", "transfer", "witness", "photos"],
    "evidence_status": "some",
    "project_info_status": "partial",
    "prior_report": "no",
    "user_statement": (
        "我在郑州金水区一个安置房工地干钢筋工，从6月干到9月。"
        "包工头王某某招我进去，平时也是他安排活、记考勤。"
        "说好一天350元，一共该给两万六，只给了六千，还欠两万。"
        "没签合同。微信里有他确认工天的聊天，考勤表在他手里，我有工作照片和两个工友能作证。"
        "工地是金水区某安置房项目，总包好像是示例建设工程有限公司，劳务公司叫示例劳务有限公司。"
        "之前没找过部门反映。"
    ),
    "notes": "本案件为虚构演示，所有人物、公司、项目名称均为化名或虚构。",
}

DEMO_INTAKE = {
    "answered": [
        "location",
        "district",
        "work_type",
        "period",
        "recruiter",
        "manager",
        "wage_basis",
        "amounts",
        "contract",
        "evidence",
        "project_info",
        "prior_report",
        "confirm",
    ],
    "skipped": [],
    "unknowns": {},
    "attempts": {},
    "confirmed": True,
    "last_question_key": None,
}


def create_demo_case(db: Session, session_id: str) -> Case:
    existing = (
        db.query(Case)
        .filter(Case.session_id == session_id, Case.is_demo.is_(True))
        .order_by(Case.created_at.desc())
        .first()
    )
    if existing:
        return existing

    orchestrator = AgentOrchestrator(db)
    case = orchestrator.create_case(session_id, is_demo=True)
    case.facts = dict(DEMO_FACTS)
    case.intake = dict(DEMO_INTAKE)
    case.title = DEMO_TITLE
    case.status = "ready"
    for message in list(case.messages):
        case.messages.remove(message)
    db.flush()

    conversation = [
        (
            "user",
            "我在郑州金水区一个工地干了三个月，包工头还欠我两万块钱工资。",
            {"demo": True},
        ),
        (
            "assistant",
            "我记下了：地点郑州金水区，在工地干了约3个月，目前陈述欠薪约2万元。"
            "你是通过谁介绍或招到这个工地工作的？",
            {
                "kind": "question",
                "question": {
                    "key": "recruiter",
                    "text": "当初是谁介绍或招你到这个工地干活的？",
                    "helper": "是包工头、劳务公司，还是工地项目部？",
                    "quick_replies": [
                        {"label": "包工头"},
                        {"label": "劳务公司"},
                        {"label": "工地项目部"},
                    ],
                    "multi_select": False,
                    "optional": False,
                },
                "demo": True,
            },
        ),
        (
            "user",
            "包工头王某某招的，平时也是他安排活、记考勤。我们没签合同。",
            {"demo": True},
        ),
        (
            "assistant",
            "我记下了：招用人是包工头王某某，日常由他管理，没有签订书面合同。"
            "你手里有哪些能证明干活和欠薪的材料？可以多选。",
            {
                "kind": "question",
                "question": {
                    "key": "evidence",
                    "text": "你手里有哪些能证明干活和欠薪的材料？可以多选。",
                    "helper": "没有某项也没关系，缺少材料不等于不能维权。",
                    "quick_replies": [],
                    "multi_select": True,
                    "optional": False,
                },
                "demo": True,
            },
        ),
        (
            "user",
            "有微信聊天、考勤记录、转账记录、工作照片，还有两个工友能作证。"
            "项目叫金水区某安置房项目，总包是示例建设工程有限公司，劳务公司是示例劳务有限公司。",
            {"demo": True},
        ),
        (
            "assistant",
            "我记下了：已有微信聊天、考勤、转账、照片和工友证言；项目为金水区某安置房项目，"
            "总包为示例建设工程有限公司，劳务公司为示例劳务有限公司。\n\n"
            "案件信息已经整理好了，请先核对右侧的“案件信息”。确认后我再生成案件分析和维权步骤。",
            {
                "kind": "question",
                "question": {
                    "key": "confirm",
                    "text": "信息是否无误？",
                    "helper": "如果哪项不对，可以点“修改案件信息”直接改。",
                    "quick_replies": [
                        {"label": "信息无误，生成分析"},
                        {"label": "我要修改信息"},
                    ],
                    "multi_select": False,
                    "optional": False,
                },
                "demo": True,
            },
        ),
        (
            "assistant",
            "信息已确认。这是虚构演示案例，你可以直接查看案件分析、维权行动指南和官方填报辅助，"
            "所有步骤、文案和复制功能都可以实际操作。",
            {"kind": "summary", "demo": True},
        ),
    ]
    for role, content, meta in conversation:
        case.messages.append(Message(case_id=case.id, role=role, content=content, meta=meta))
    case.facts_meta = {**(case.facts_meta or {}), "demo": True}
    db.flush()
    orchestrator.ensure_action_plan(case)
    db.commit()
    db.refresh(case)
    return case
