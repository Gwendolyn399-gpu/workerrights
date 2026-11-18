from decimal import Decimal


def check_amounts(facts: dict) -> dict:
    missing = [key for key in ("agreed_amount", "paid_amount") if facts.get(key) is None]
    if missing:
        return {"missing": missing}
    difference = Decimal(str(facts["agreed_amount"])) - Decimal(str(facts["paid_amount"]))
    owed = facts.get("owed_amount")
    return {
        "calculated_owed": str(difference),
        "user_reported_owed": owed,
        "conflict": difference < 0 or (owed is not None and Decimal(str(owed)) != difference),
        "notice": "计算不覆盖用户陈述；冲突请用户核对。",
    }
