"""Golden fixtures for the agent generators (legal/analysis/action_plan/form/export)."""
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(ROOT))

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from backend.database.db import Base
from backend.database.seed import seed_all
from backend.models.case import Case
from backend.services.fact_extractor import NEW_CASE_FACTS
from backend.services.facts import build_case_title
from backend.agents.legal_research import LegalResearchAgent
from backend.agents.case_analysis import CaseAnalysisAgent
from backend.agents.action_planning import ActionPlanningAgent
from backend.agents.form_assistant import FormAssistantAgent
from backend.services.export import build_export_sections, build_plain_text

engine = create_engine("sqlite:///:memory:")
Base.metadata.create_all(bind=engine)
Session = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)
db = Session()
seed_all(db)
db.commit()

FACT_SETS = [
    dict(NEW_CASE_FACTS),
    {**NEW_CASE_FACTS, "location_province": "河南省", "location_city": "郑州市", "location_district": "金水区",
     "location_detail": "某安置房项目工地", "work_type": "钢筋工", "work_start": "2026-06", "work_end": "2026-09",
     "duration_text": "约3个月", "recruiter_type": "包工头", "recruiter_name": "王某某", "manager_role": "包工头",
     "wage_basis": "按天", "daily_wage": 350, "agreed_amount": 26000, "paid_amount": 6000, "owed_amount": 20000,
     "has_contract": "no", "evidence": ["chat", "attendance", "transfer", "witness", "photos"], "evidence_status": "some",
     "project_name": "某安置房项目", "contractor_name": "示例建设工程有限公司", "subcontractor_name": "示例劳务有限公司",
     "prior_report": "no"},
    {**NEW_CASE_FACTS, "location_city": "洛阳市", "work_type": "其他", "wage_basis": "按月", "monthly_wage": 6000,
     "agreed_amount": 18000, "paid_amount": 0, "owed_amount": 18000, "has_contract": "yes", "evidence": []},
    {**NEW_CASE_FACTS, "location_city": "郑州市", "work_type": "不清楚", "wage_basis": "计件", "unit_price": 12.5,
     "owed_amount": None, "owed_amount_note": "大概还欠一万多", "paid_amount": None, "evidence_status": "none"},
    {**NEW_CASE_FACTS, "location_city": "南阳市", "location_district": "卧龙区", "work_type": "木工",
     "duration_text": "两个月", "recruiter_type": "劳务公司", "manager_role": "项目部", "wage_basis": "按天",
     "daily_wage": 300, "agreed_amount": 18000, "paid_amount": 5000, "owed_amount": 13000, "has_contract": "unknown",
     "evidence": ["chat", "photos"], "prior_report": "yes", "prior_report_detail": "找过劳动监察"},
]


def strip_volatile_analysis(analysis):
    out = dict(analysis)
    out.pop("generated_at", None)
    return out


def strip_volatile_plan(plan):
    out = dict(plan)
    out.pop("generated_at", None)
    out["steps"] = [{k: v for k, v in step.items() if k != "id"} for step in plan["steps"]]
    return out


def strip_volatile_form(form):
    out = dict(form)
    out.pop("generated_at", None)
    return out


fixtures = []
for index, facts in enumerate(FACT_SETS):
    for intake in ({}, {"confirmed": True}):
        case = Case(
            session_id=f"parity-{index}",
            scene="construction_wage_arrears",
            title=build_case_title(facts),
            is_demo=False,
            status="ready",
            facts=dict(facts),
            facts_meta={},
            intake=dict(intake),
            derived_results={},
        )
        db.add(case)
        db.flush()
        legal = LegalResearchAgent(db).run(case)
        analysis = CaseAnalysisAgent(db).run(case)
        plan = ActionPlanningAgent(db).ensure_plan(case, force=True)
        form = FormAssistantAgent().run(case)
        sections = build_export_sections(case, analysis, plan)
        text = build_plain_text(case, analysis, plan)
        fixtures.append({
            "facts": facts,
            "intake": intake,
            "title": case.title,
            "legal": legal,
            "analysis": strip_volatile_analysis(analysis),
            "plan": strip_volatile_plan(plan),
            "form": strip_volatile_form(form),
            "export_sections": sections,
            "export_text": text,
        })
        db.rollback()

out = Path(__file__).resolve().parent / "agents_fixtures.json"
out.write_text(json.dumps(fixtures, ensure_ascii=False, indent=1), encoding="utf-8")
print("wrote", out, out.stat().st_size, "bytes", len(fixtures), "cases")