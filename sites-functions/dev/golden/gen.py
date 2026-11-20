"""Generate golden fixtures from the accepted Python backend for port verification."""
import json
import sys
from pathlib import Path
from types import SimpleNamespace

ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(ROOT))

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from backend.database.db import Base
from backend.database.seed import seed_all
from backend.legal.retriever import LegalRetriever, tokenize
from backend.rules.evidence import EVIDENCE_CATALOG, analyze_evidence
from backend.services.fact_extractor import NEW_CASE_FACTS
from backend.services.facts import (
    build_case_title, build_relationship, evidence_labels, format_ack, format_amount,
    generation_facts, location_text, record_fact_change, required_progress, work_period_text,
)
from backend.services.statement import (
    build_confirmation_message, build_evidence_directory, build_formal_statement, build_short_description,
)
from backend.services.wage_check import check_amounts

engine = create_engine("sqlite:///:memory:")
Base.metadata.create_all(bind=engine)
Session = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)
db = Session()
seed_all(db)
retriever = LegalRetriever(db)

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

AMOUNTS = [None, 0, 350, 999, 9999, 10000, 12345, 20000, 26000, 6000, 350.5, 1234.56, 100000, 10500, 10001]
QUERIES = ["欠薪 工资 建筑", "包工头 没有合同 工资", "工伤 认定", "加班费 计算", "劳动仲裁 时效",
           "河南 根治欠薪 条例", "工资 支付 保障", "法律援助 申请", "投诉 举报 渠道", "经济补偿 辞退"]

fixtures = {
    "format_amount": [{"value": v, "approximate": a, "out": format_amount(v, a)}
                      for v in AMOUNTS for a in (False, True)],
    "location_text": [{"facts": f, "out": location_text(f)} for f in FACT_SETS],
    "work_period_text": [{"facts": f, "out": work_period_text(f)} for f in FACT_SETS],
    "evidence_labels": [{"keys": f.get("evidence"), "out": evidence_labels(f.get("evidence"), EVIDENCE_CATALOG)} for f in FACT_SETS],
    "required_progress": [{"facts": f, "intake": i, "out": required_progress(f, i)}
                          for f in FACT_SETS for i in ({}, {"confirmed": True}, {"unknowns": {"location": True, "amounts": True}})],
    "build_case_title": [{"facts": f, "out": build_case_title(f)} for f in FACT_SETS],
    "build_relationship": [{"facts": f, "out": build_relationship(f)} for f in FACT_SETS],
    "generation_facts": [{"facts": f, "out": generation_facts(f)} for f in FACT_SETS],
    "format_ack": [{"updates": u, "facts": f, "out": format_ack(u, f)}
                   for f in FACT_SETS[:2] for u in ({"location_city": "郑州市"}, {"owed_amount": 20000, "paid_amount": 6000}, {"work_type": "钢筋工", "evidence": ["chat"]})],
    "check_amounts": [{"facts": f, "out": check_amounts(f)} for f in FACT_SETS],
    "analyze_evidence": [{"facts": f, "out": analyze_evidence(f)} for f in FACT_SETS],
    "build_formal_statement": [{"facts": f, "out": build_formal_statement(f)} for f in FACT_SETS],
    "build_short_description": [{"facts": f, "out": build_short_description(f)} for f in FACT_SETS],
    "build_evidence_directory": [{"facts": f, "out": build_evidence_directory(f)} for f in FACT_SETS],
    "build_confirmation_message": [{"facts": f, "out": build_confirmation_message(f)} for f in FACT_SETS],
    "tokenize": [{"text": q, "out": tokenize(q)} for q in QUERIES],
    "search": [{"query": q, "top_k": 8, "out": retriever.search(q, top_k=8)} for q in QUERIES],
    "all_documents": retriever.all_documents(),
}

# record_fact_change on a Case-like namespace mirroring CaseRow fields.
rfc = []
for f in FACT_SETS[:3]:
    for preserve in (False, True):
        case = SimpleNamespace(facts=dict(NEW_CASE_FACTS), facts_revision=0, intake={"confirmed": True}, status="ready")
        before = dict(case.facts)
        case.facts = dict(f)
        changed = record_fact_change(case, before, preserve_confirmation=preserve)
        rfc.append({"before": before, "after": f, "preserve": preserve, "changed": changed,
                    "facts_revision": case.facts_revision, "intake": case.intake, "status": case.status})
fixtures["record_fact_change"] = rfc

out = Path(__file__).resolve().parent / "fixtures.json"
out.write_text(json.dumps(fixtures, ensure_ascii=False, indent=1), encoding="utf-8")
print("wrote", out, out.stat().st_size, "bytes")