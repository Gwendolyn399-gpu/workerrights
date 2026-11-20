from backend.services.amounts import cn_to_number, find_money, parse_duration_months
from backend.services.fact_extractor import FactExtractor
from backend.services.facts import required_progress
from backend.services.statement import build_short_description
from backend.rules.evidence import analyze_evidence


def test_chinese_amount_parsing():
    assert cn_to_number("两万六") == 26000
    assert cn_to_number("两万三") == 23000
    assert cn_to_number("一万零五") == 10005
    assert cn_to_number("一百二") == 120
    assert cn_to_number("三千五") == 3500


def test_money_context_attribution():
    matches = find_money("一共两万六，给了六千，还欠两万。")
    assert [item.value for item in matches] == [26000, 6000, 20000]
    daily = find_money("按天算，一天350。")
    assert len(daily) == 1 and daily[0].value == 350


def test_duration_ranges():
    assert parse_duration_months("3-6个月左右") == (4.5, "3-6个月")
    assert parse_duration_months("不到1个月")[0] == 0.5
    assert parse_duration_months("半年")[0] == 6
    assert parse_duration_months("一年")[0] == 12


def test_extractor_does_not_invent_work_type():
    extractor = FactExtractor()
    updates, _ = extractor.extract(
        "包工头介绍的，平时也是他安排活。", {}, question_key="work_type"
    )
    assert "work_type" not in updates
    updates, _ = extractor.extract("钢筋工", {}, question_key="work_type")
    assert updates["work_type"] == "钢筋工"


def test_unknown_does_not_fill_unrelated_fields():
    extractor = FactExtractor()
    updates, _ = extractor.extract("不知道项目名称", {}, question_key="contract")
    assert "has_contract" not in updates
    assert "manager_role" not in updates
    updates, _ = extractor.extract("不知道合同的事", {}, question_key="contract")
    assert updates["has_contract"] == "unknown"


def test_short_description_duration_is_not_a_date():
    facts = {"location_city": "郑州", "work_type": "绑钢筋", "duration_text": "三个月",
             "recruiter_name": "老周", "owed_amount": 20000}
    text = build_short_description(facts)
    assert "干了三个月" in text
    assert "本人三个月在" not in text
    assert "本人于" not in text
    dated = build_short_description({**facts, "work_start": "2026-03-01", "work_end": "2026-06-01"})
    assert "本人于2026-03-01至2026-06-01" in dated


def test_evidence_contract_reason_respects_explicit_no():
    no_contract = analyze_evidence({"has_contract": "no", "evidence": ["chat"]})
    contract = next(item for item in no_contract["needed"] if item["key"] == "contract")
    assert "已说明没有签" in contract["reason"]
    assert "未确认" not in contract["reason"]
    unknown = analyze_evidence({"evidence": ["chat"]})
    contract = next(item for item in unknown["needed"] if item["key"] == "contract")
    assert "未确认存在书面合同" in contract["reason"]


def test_progress_reserves_hundred_percent_for_confirmed_cases():
    facts = {"location_city": "郑州", "work_type": "钢筋工", "duration_text": "三个月",
             "recruiter_type": "包工头", "manager_role": "包工头", "wage_basis": "按天",
             "agreed_amount": 14000, "owed_amount": 9000, "paid_amount": 5000,
             "has_contract": "no", "evidence": ["chat"]}
    assert required_progress(facts, {})["percent"] == 99
    assert required_progress(facts, {"confirmed": True})["percent"] == 100
