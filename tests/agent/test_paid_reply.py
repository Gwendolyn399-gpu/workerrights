from backend.services.fact_extractor import FactExtractor, NEW_CASE_FACTS


def test_explicit_already_paid_reply_records_payment():
    updates, _ = FactExtractor().extract("已支付6000元", dict(NEW_CASE_FACTS), "paid_amount")
    assert updates["paid_amount"] == 6000
    assert "owed_amount" not in updates


def test_unpaid_reply_is_not_recorded_as_payment():
    updates, _ = FactExtractor().extract("还欠6000元未支付", dict(NEW_CASE_FACTS), "paid_amount")
    assert updates["owed_amount"] == 6000
    assert "paid_amount" not in updates


def test_no_previous_complaint_does_not_become_yes():
    updates, _ = FactExtractor().extract("没有投诉过", dict(NEW_CASE_FACTS), "prior_report")
    assert updates["prior_report"] == "no"
    assert "prior_report_detail" not in updates


def test_manager_attendance_does_not_claim_possession_of_evidence():
    updates, _ = FactExtractor().extract("包工头安排工作和考勤", dict(NEW_CASE_FACTS), "manager")
    assert updates["manager_role"] == "包工头"
    assert "evidence" not in updates
    held, _ = FactExtractor().extract("包工头安排工作，我有考勤记录", dict(NEW_CASE_FACTS), "manager")
    assert "attendance" in held["evidence"]
