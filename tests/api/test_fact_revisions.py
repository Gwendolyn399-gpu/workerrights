"""M7 regression tests. Run serially: tests/conftest.py owns a shared test DB."""

from copy import deepcopy
from concurrent.futures import ThreadPoolExecutor
from threading import Barrier
import json
import uuid

import pytest
from sqlalchemy import create_engine, inspect, text

from backend.agents.agent_v1.runtime import AgentRuntime
from backend.agents.orchestrator import AgentOrchestrator
from backend.database.db import SessionLocal, migrate_case_revisions
from backend.models.case import Case
from backend.services.facts import generation_facts, record_fact_change


API = "/api/v1/cases"
PAGES = {"analysis": "analysis", "action-plan": "action_plan", "form-assistant": "form_assistant"}


def ok(response, status=200):
    assert response.status_code == status, response.text
    return response.json()


def demo(client, headers):
    return ok(client.post(f"{API}/demo", headers=headers), 201)["case"]


def pages(client, headers, case_id):
    return {page: ok(client.get(f"{API}/{case_id}/{page}", headers=headers)) for page in PAGES}


def patch(client, headers, case_id, facts):
    return ok(client.patch(f"{API}/{case_id}/facts", headers=headers, json={"facts": facts}))


def confirm(client, headers, case_id):
    return ok(client.post(f"{API}/{case_id}/messages", headers=headers,
                          json={"content": "信息无误，生成分析"}))["case"]


def test_revision_snapshots_persist_until_reconfirmation(client, headers):
    case = demo(client, headers)
    case_id, revision = case["id"], case["facts_revision"]
    assert type(revision) is int and revision == 1
    original = pages(client, headers, case_id)
    assert all(type(result["generated_from_revision"]) is int for result in original.values())
    assert all(result["generated_from_revision"] == revision for result in original.values())
    assert pages(client, headers, case_id) == original

    changed = patch(client, headers, case_id, {"owed_amount": 18000})
    assert changed["case"]["facts_revision"] == revision + 1
    assert changed["case"]["status"] == "collecting"
    assert changed["case"]["intake"]["confirmed"] is False
    assert changed["next_question"]["key"] == "confirm"
    assert changed["progress"]["percent"] == 99
    stale = pages(client, headers, case_id)
    for page, snapshot in stale.items():
        assert snapshot["generated_from_revision"] == revision
        assert snapshot["generated_at"] == original[page]["generated_at"]
        assert snapshot["preliminary"] is True
        for key, value in original[page].items():
            if key not in {"case_status", "preliminary", "preliminary_note"}:
                assert snapshot[key] == value
    assert pages(client, headers, case_id) == stale
    # A fresh ORM session sees persisted full snapshots, not response overlays.
    with SessionLocal() as db:
        stored = db.get(Case, case_id)
        assert stored.facts_revision == revision + 1
        for page, key in PAGES.items():
            assert stored.derived_results[key]["generated_at"] == original[page]["generated_at"]
            assert "preliminary" not in stored.derived_results[key]
    refreshed_case = ok(client.get(f"{API}/{case_id}", headers=headers))["case"]
    assert refreshed_case["facts_revision"] == revision + 1

    confirmed = confirm(client, headers, case_id)
    assert confirmed["intake"]["confirmed"] is True
    assert confirmed["facts_revision"] == revision + 1
    assert confirmed["progress"]["percent"] == 100
    with SessionLocal() as db:
        assert db.get(Case, case_id).derived_results == {}
    regenerated = pages(client, headers, case_id)
    assert all(result["generated_from_revision"] == revision + 1 for result in regenerated.values())
    assert all(result["preliminary"] is False for result in regenerated.values())
    assert regenerated["analysis"]["summary"] != original["analysis"]["summary"]
    assert regenerated["action-plan"]["formal_statement"] != original["action-plan"]["formal_statement"]
    assert regenerated["form-assistant"]["formal_statement"] != original["form-assistant"]["formal_statement"]
    assert pages(client, headers, case_id) == regenerated


def test_concurrent_first_action_requests_share_one_snapshot(client, headers):
    case = ok(client.post(API, headers=headers, json={}), 201)["case"]
    barrier = Barrier(4)

    def read_plan():
        barrier.wait(timeout=10)
        return ok(client.get(f"{API}/{case['id']}/action-plan", headers=headers))

    with ThreadPoolExecutor(max_workers=4) as pool:
        plans = list(pool.map(lambda _: read_plan(), range(4)))
    assert all(plan["progress"]["total"] == 8 for plan in plans)
    assert all(plan["steps"] == plans[0]["steps"] for plan in plans)
    with SessionLocal() as db:
        assert len(db.get(Case, case["id"]).steps) == 8


def test_same_value_and_non_generation_edits_do_not_increment(client, headers):
    case = demo(client, headers)
    before = pages(client, headers, case["id"])
    updates = {
        "owed_amount": "20000.0",
        "work_type": "  钢筋工  ",
        "evidence": list(reversed(case["facts"]["evidence"])),
        "prior_report_detail": "  ",
        "user_statement": "只记录新的对话原话",
        "contact_phone": "13800000000",
        "notes": "仅供个人记录",
        "duration_months": 4,
        "manager_name": "仅用于来源标签",
        "project_info_status": "known",
        "pay_cycle": "每月",
        "last_paid_date": "2026-10",
        "contract_party": "未用于派生的采集字段",
    }
    result = patch(client, headers, case["id"], updates)["case"]
    assert result["facts_revision"] == case["facts_revision"]
    assert result["intake"]["confirmed"] is True
    assert pages(client, headers, case["id"]) == before
    empty = patch(client, headers, case["id"], {})["case"]
    assert empty["facts_revision"] == case["facts_revision"]
    listing = ok(client.get(API, headers=headers))["cases"]
    assert next(item for item in listing if item["id"] == case["id"])["facts_revision"] == case["facts_revision"]


@pytest.mark.parametrize("field,value", [
    ("work_start", "2026-05"), ("work_end", "2026-10"),
    ("daily_wage", 400), ("monthly_wage", 9000), ("unit_price", 80),
    ("prior_report_detail", "向12345反映"), ("recruiter_phone", "13800000001"),
    ("evidence_other", "还保留原始记工纸"), ("evidence_status", "none"),
    ("location_detail", "另一工地"), ("developer_name", "另一建设单位"),
    ("owed_amount_note", "金额仍待核对"),
])
def test_generation_inputs_omitted_by_old_plan_signature_increment(client, headers, field, value):
    case = demo(client, headers)
    updated = patch(client, headers, case["id"], {field: value})["case"]
    assert updated["facts_revision"] == case["facts_revision"] + 1
    assert updated["intake"]["confirmed"] is False


def test_empty_equivalence_evidence_order_and_deep_capture():
    assert generation_facts({}) == generation_facts({"work_end": " ", "evidence": [], "owed_amount_approx": False})
    assert generation_facts({"evidence": ["chat", "photos"]}) == generation_facts({"evidence": ["photos", "chat", "chat"]})
    case = Case(facts={"evidence": ["chat"]}, facts_revision=0,
                intake={"confirmed": True}, status="ready", derived_results={"analysis": {"old": True}})
    before = deepcopy(case.facts)
    case.facts["evidence"].append("photos")
    assert record_fact_change(case, before)
    assert case.facts_revision == 1
    assert case.derived_results == {"analysis": {"old": True}}
    assert not record_fact_change(case, deepcopy(case.facts))


def test_rule_chat_counts_changes_but_not_chitchat_or_confirmation(client, headers):
    case = demo(client, headers)
    case_id, revision = case["id"], case["facts_revision"]
    thanks = ok(client.post(f"{API}/{case_id}/messages", headers=headers, json={"content": "谢谢"}))["case"]
    assert thanks["facts_revision"] == revision
    changed = ok(client.post(f"{API}/{case_id}/messages", headers=headers,
                             json={"content": "现在还欠18000元"}))["case"]
    assert changed["facts_revision"] == revision + 1
    assert changed["facts"]["owed_amount"] == 18000
    assert changed["intake"]["confirmed"] is False
    confirmed = confirm(client, headers, case_id)
    assert confirmed["facts_revision"] == revision + 1
    assert confirmed["intake"]["confirmed"] is True


def tool(name, **args):
    return {"message": {"role": "assistant", "tool_calls": [
        {"id": name, "type": "function", "function": {"name": name, "arguments": json.dumps(args)}}
    ]}, "usage": {}}


class ScriptProvider:
    is_mock = False
    display_name = "M7 isolated scripted provider"

    def __init__(self, *responses):
        self.responses = iter(responses)

    def complete(self, messages, tools, *, final):
        return next(self.responses)

    def health(self):
        return {"is_mock": False, "display_name": self.display_name}


def test_record_facts_web_entry_counts_once_and_confirmation_clears_cache(client, headers, monkeypatch):
    # Follow the existing protocol harness: exercise real AgentIntake/record_facts,
    # without scope-routing calls or external model requests.
    monkeypatch.setattr("backend.agents.agent_v1.intake.ScopedAgentRuntime", AgentRuntime)
    provider = ScriptProvider(
        tool("record_facts", patch={"owed_amount": 18000}, source_quote="欠18000"),
        tool("record_facts", patch={"work_type": "钢筋工"}, source_quote="我是钢筋工"),
        tool("respond", reply="已记录，请核对。", stage="awaiting_confirmation"),
        tool("record_facts", patch={"owed_amount": 18000}, source_quote="仍欠18000"),
        tool("respond", reply="金额不变，请核对。", stage="awaiting_confirmation"),
        tool("respond", reply="信息已确认。", stage="ready"),
        tool("respond", reply="不客气。", stage="waiting_user"),
    )
    monkeypatch.setattr("backend.api.router._provider", lambda session_id: provider)
    case = ok(client.post(API, headers=headers, json={}), 201)["case"]
    case_id = case["id"]
    assert case["facts_revision"] == 0
    initial = pages(client, headers, case_id)
    changed = ok(client.post(f"{API}/{case_id}/messages", headers=headers,
                             json={"content": "我是钢筋工，欠18000"}))["case"]
    assert changed["facts_revision"] == 1
    assert changed["facts"]["work_type"] == "钢筋工"
    unchanged = ok(client.post(f"{API}/{case_id}/messages", headers=headers,
                               json={"content": "仍欠18000"}))["case"]
    assert unchanged["facts_revision"] == 1
    assert all(result["generated_from_revision"] == 0 for result in pages(client, headers, case_id).values())
    confirmed = confirm(client, headers, case_id)
    assert confirmed["facts_revision"] == 1
    assert confirmed["intake"]["confirmed"] is True
    regenerated = pages(client, headers, case_id)
    assert all(result["generated_from_revision"] == 1 for result in regenerated.values())
    assert regenerated["action-plan"]["formal_statement"] != initial["action-plan"]["formal_statement"]
    thanks = ok(client.post(f"{API}/{case_id}/messages", headers=headers, json={"content": "谢谢"}))["case"]
    assert thanks["facts_revision"] == 1
    after_thanks = pages(client, headers, case_id)
    for page in PAGES:
        assert {key: value for key, value in after_thanks[page].items() if key != "case_status"} == {
            key: value for key, value in regenerated[page].items() if key != "case_status"
        }


def test_agent_same_value_patch_keeps_confirmation_and_cache(client, headers, monkeypatch):
    case = demo(client, headers)
    original = pages(client, headers, case["id"])
    monkeypatch.setattr("backend.api.router._provider", lambda session_id: ScriptProvider())
    unchanged = patch(client, headers, case["id"], {"owed_amount": "20000"})["case"]
    assert unchanged["facts_revision"] == case["facts_revision"]
    assert unchanged["intake"]["confirmed"] is True
    assert pages(client, headers, case["id"]) == original
    changed = patch(client, headers, case["id"], {"owed_amount": 18000})["case"]
    assert changed["facts_revision"] == case["facts_revision"] + 1
    assert changed["intake"]["confirmed"] is False
    assert changed["intake"]["agent_stage"] == "waiting_user"


def test_orchestrator_preserves_explicit_same_turn_ready(client, headers, monkeypatch):
    case_data = demo(client, headers)
    with SessionLocal() as db:
        case = db.get(Case, case_data["id"])
        orchestrator = AgentOrchestrator(db, ScriptProvider())

        def ready_intake(case, text, emit=None):
            case.facts = {**case.facts, "daily_wage": 400}
            case.intake = {**case.intake, "confirmed": True, "agent_stage": "ready"}
            case.status = "ready"
            db.flush()
            return {}

        monkeypatch.setattr(orchestrator.intake, "handle_message", ready_intake)
        orchestrator.handle_message(case, "已明确核对")
        assert case.facts_revision == case_data["facts_revision"] + 1
        assert case.intake["confirmed"] is True
        assert case.status == "ready"
        assert case.derived_results == {}


def test_steps_keep_snapshot_progress_and_rebuild_preserves_done_at(client, headers):
    case = demo(client, headers)
    case_id = case["id"]
    original = pages(client, headers, case_id)["action-plan"]
    step = original["steps"][0]
    step_url = f"{API}/{case_id}/action-plan/steps/{step['id']}"
    done = ok(client.patch(step_url, headers=headers, json={"done": True}))
    assert done["steps"][0]["done"] is True
    done_at = done["steps"][0]["done_at"]
    assert done_at
    assert done["progress"]["done"] == 1
    assert done["generated_from_revision"] == case["facts_revision"]
    assert done["formal_statement"] == original["formal_statement"]
    assert done["case_status"] == "planned"
    assert ok(client.get(f"{API}/{case_id}/action-plan", headers=headers)) == done
    assert ok(client.get(f"{API}/{case_id}", headers=headers))["case"]["facts_revision"] == case["facts_revision"]

    patch(client, headers, case_id, {"daily_wage": 400})
    rejected = client.patch(step_url, headers=headers, json={"done": False})
    assert rejected.status_code == 409
    assert "信息已更新，请重新生成" in rejected.json()["detail"]
    stale = ok(client.get(f"{API}/{case_id}/action-plan", headers=headers))
    assert stale["steps"] == done["steps"]
    assert stale["formal_statement"] == done["formal_statement"]
    confirm(client, headers, case_id)
    rebuilt = ok(client.get(f"{API}/{case_id}/action-plan", headers=headers))
    rebuilt_step = next(item for item in rebuilt["steps"] if item["step_key"] == step["step_key"])
    assert rebuilt_step["done"] is True
    assert rebuilt_step["done_at"] == done_at
    assert rebuilt["formal_statement"] != original["formal_statement"]
    assert rebuilt["generated_from_revision"] == case["facts_revision"] + 1
    undone = ok(client.patch(f"{API}/{case_id}/action-plan/steps/{rebuilt_step['id']}",
                             headers=headers, json={"done": False}))
    assert undone["progress"]["done"] == 0
    assert undone["steps"][0]["done_at"] is None


@pytest.mark.parametrize("cached_page", list(PAGES))
def test_export_rejects_any_stale_cache_then_succeeds_after_confirmation(client, headers, cached_page):
    case = demo(client, headers)
    case_id = case["id"]
    pages(client, headers, case_id)
    # Isolate each cache, especially form_assistant (export doesn't generate it).
    with SessionLocal() as db:
        stored = db.get(Case, case_id)
        key = PAGES[cached_page]
        stored.derived_results = {key: stored.derived_results[key]}
        db.commit()
    patch(client, headers, case_id, {"daily_wage": 400})
    for fmt in ("txt", "docx", "pdf"):
        response = client.get(f"{API}/{case_id}/export/{fmt}", headers=headers)
        assert response.status_code == 409
        assert "信息已更新，请重新生成" in response.json()["detail"]
    confirm(client, headers, case_id)
    response = client.get(f"{API}/{case_id}/export/txt", headers=headers)
    assert response.status_code == 200
    assert "每天400元" in response.text


def test_missing_legacy_cache_forces_plan_rebuild(client, headers):
    case = demo(client, headers)
    case_id = case["id"]
    original = ok(client.get(f"{API}/{case_id}/action-plan", headers=headers))
    with SessionLocal() as db:
        stored = db.get(Case, case_id)
        # Simulate an old DB with unchanged partial SHA1 but updated wage input.
        stored.facts = {**stored.facts, "daily_wage": 400}
        stored.derived_results = {}
        db.commit()
    rebuilt = ok(client.get(f"{API}/{case_id}/action-plan", headers=headers))
    assert rebuilt["steps"][0]["id"] != original["steps"][0]["id"]
    assert "每天400元" in rebuilt["formal_statement"]
    assert "每天400元" in next(item["draft_text"] for item in rebuilt["steps"] if item["step_key"] == "written-confirm")
    assert rebuilt["generated_from_revision"] == case["facts_revision"]


def test_derived_revision_routes_remain_session_scoped(client, headers):
    case = demo(client, headers)
    case_id = case["id"]
    plan = pages(client, headers, case_id)["action-plan"]
    other = {"X-Session-Id": f"other-{uuid.uuid4()}"}
    for page in (*PAGES, "export/txt"):
        assert client.get(f"{API}/{case_id}/{page}", headers=other).status_code == 404
    assert client.patch(f"{API}/{case_id}/facts", headers=other, json={"facts": {"owed_amount": 1}}).status_code == 404
    assert client.patch(f"{API}/{case_id}/action-plan/steps/{plan['steps'][0]['id']}",
                        headers=other, json={"done": True}).status_code == 404
    assert client.post(f"{API}/{case_id}/messages", headers=other,
                       json={"content": "确认无误"}).status_code == 404


@pytest.mark.parametrize("existing_column", [None, "facts_revision", "derived_results"])
def test_sqlite_revision_migration_is_idempotent_and_preserves_rows(tmp_path, existing_column):
    engine = create_engine(f"sqlite:///{(tmp_path / 'legacy.sqlite').as_posix()}")
    try:
        with engine.begin() as connection:
            connection.execute(text("CREATE TABLE cases (id TEXT PRIMARY KEY, facts JSON NOT NULL, title TEXT NOT NULL)"))
            connection.execute(text("INSERT INTO cases (id, facts, title) VALUES (:id, :facts, :title)"),
                               {"id": "legacy", "facts": '{"owed_amount": 18000}', "title": "原案件"})
            if existing_column == "facts_revision":
                connection.execute(text("ALTER TABLE cases ADD COLUMN facts_revision INTEGER NOT NULL DEFAULT 0"))
                connection.execute(text("UPDATE cases SET facts_revision = 7"))
            elif existing_column == "derived_results":
                connection.execute(text("ALTER TABLE cases ADD COLUMN derived_results JSON NOT NULL DEFAULT '{}'"))
                connection.execute(text("UPDATE cases SET derived_results = :value"),
                                   {"value": '{"analysis": {"generated_from_revision": 0}}'})
        migrate_case_revisions(engine)
        migrate_case_revisions(engine)
        with engine.connect() as connection:
            row = connection.execute(text("SELECT * FROM cases")).mappings().one()
            assert row["id"] == "legacy" and row["title"] == "原案件"
            assert json.loads(row["facts"]) == {"owed_amount": 18000}
            assert row["facts_revision"] == (7 if existing_column == "facts_revision" else 0)
            assert json.loads(row["derived_results"]) == (
                {"analysis": {"generated_from_revision": 0}} if existing_column == "derived_results" else {}
            )
            columns = {column["name"]: column for column in inspect(connection).get_columns("cases")}
            assert columns["facts_revision"]["nullable"] is False
            assert columns["derived_results"]["nullable"] is False
    finally:
        engine.dispose()
