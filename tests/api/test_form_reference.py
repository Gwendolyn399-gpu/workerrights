from backend.agents.form_assistant import FormAssistantAgent
from backend.legal.loader import load_form_schema


def test_personal_fields_are_official_only():
    fields = [field for step in load_form_schema()["steps"] for field in step["fields"]]
    for field in fields:
        if field["key"] not in {"reporter_name", "reporter_phone", "reporter_id"}:
            continue
        result = FormAssistantAgent._generate_field(field, {"contact_phone": "synthetic-contact"})
        assert result["status"] == "official_only"
        assert result["value"] is None
        assert result["source_facts"] == []
        assert "本人在官方平台填写" in result["copy_text"]
        assert "synthetic-contact" not in str(result)


def test_duration_is_not_presented_as_dates():
    field = next(field for step in load_form_schema()["steps"] for field in step["fields"] if field["key"] == "work_period")
    result = FormAssistantAgent._generate_field(field, {"duration_text": "约三个月"})
    assert result["label"] == "工作时长"
    assert result["value"] == "约三个月"
    assert result["status"] == "verify"
    assert "不是起止日期" in result["note"]
    dated = FormAssistantAgent._generate_field(field, {"work_start": "2026-06", "work_end": "2026-09"})
    assert dated["label"] == "工作起止时间"
    assert dated["value"] == "2026-06 至 2026-09"
