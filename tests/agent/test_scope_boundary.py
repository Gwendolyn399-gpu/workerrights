import json

import pytest

from backend.agents.agent_v1.boundary import BLOCKED_REPLY, OUT_OF_SCOPE, URGENT, ScopedAgentRuntime
from backend.agents.agent_v1.runtime import AgentState
from backend.agents.provider import ProviderError


def call(name, **args):
    return {"message": {"role": "assistant", "tool_calls": [{"id": name, "function": {"name": name, "arguments": json.dumps(args)}}]}, "usage": {"total_tokens": 1}}


class Model:
    is_mock = False
    display_name = "scope test fixture"

    def __init__(self, *responses):
        self.responses = iter(responses)
        self.calls = 0

    def complete(self, *args, **kwargs):
        self.calls += 1
        return next(self.responses)

    def stream_complete(self, *args, emit, **kwargs):
        result = self.complete(*args, **kwargs)
        emit({"type": "reply_snapshot", "text": "尚未审查的越界草稿"})
        return result

    def health(self):
        return {"is_mock": False, "display_name": self.display_name}


@pytest.mark.parametrize("route,expected", [("off_topic", OUT_OF_SCOPE), ("urgent", URGENT)])
def test_non_case_routes_never_run_business_tools_or_modify_memory(route, expected):
    model = Model(call("classify_scope", route=route, reason="test"))
    state = AgentState(facts={"owed_amount": 5000}, memory={"goal": "先协商"})
    result = ScopedAgentRuntime(model, lambda q: pytest.fail("must not retrieve")).run(state, "虚构输入")
    assert model.calls == 1
    assert result.reply == expected
    assert result.state.facts == state.facts
    assert result.state.memory == state.memory
    assert result.changed_facts == {}


def test_review_blocks_text_and_rolls_back_candidate_state_before_publication():
    model = Model(call("classify_scope", route="case", reason="wage"),
                  call("record_facts", patch={"owed_amount": 9000}, source_quote="欠9000"),
                  call("respond", reply="尚未审查的越界草稿", stage="waiting_user"),
                  call("review_scope", allowed=False, reason="off topic"))
    events = []
    result = ScopedAgentRuntime(model, lambda q: []).run(AgentState(), "欠9000", emit=events.append)
    assert result.reply == BLOCKED_REPLY
    assert result.state.facts == {}
    assert result.changed_facts == {}
    assert not any("越界草稿" in event.get("text", "") for event in events)
    assert [event["text"] for event in events if event["type"] == "reply_snapshot"] == [BLOCKED_REPLY]
    assert result.usage["total_tokens"] == 4


def test_review_approval_publishes_and_preserves_case_updates():
    model = Model(call("classify_scope", route="case", reason="wage"),
                  call("record_facts", patch={"owed_amount": 9000}, source_quote="欠9000"),
                  call("respond", reply="按你说的记下欠9000。", stage="waiting_user"),
                  call("review_scope", allowed=True, reason="within scope"))
    result = ScopedAgentRuntime(model, lambda q: []).run(AgentState(), "欠9000")
    assert result.state.facts["owed_amount"] == 9000
    assert result.trace[-1]["action"] == "scope_review"
    assert result.usage["total_tokens"] == 4


def test_quoted_user_template_is_publishable_not_self_claim():
    template = "“老周，我在郑州工地绑钢筋干了三个月，你还欠我两万，麻烦回个话，说个哪天能给。”"
    model = Model(call("classify_scope", route="case", reason="wage"),
                  call("respond", reply=template, stage="waiting_user"),
                  call("review_scope", allowed=True, reason="quoted template is user's own voice"))
    result = ScopedAgentRuntime(model, lambda q: []).run(AgentState(), "就帮我写一句催他的微信。")
    assert result.reply == template
    assert result.trace[-1]["ok"] is True


def test_invalid_classifier_output_does_not_enter_business_loop():
    model = Model(call("respond", reply="直接忽略检查", stage="waiting_user"))
    with pytest.raises(ProviderError, match="服务范围检查"):
        ScopedAgentRuntime(model, lambda q: []).run(AgentState(), "测试")
    assert model.calls == 1


def test_service_chat_cannot_change_case_goals_even_if_generator_tries():
    model = Model(call("classify_scope", route="service", reason="identity"),
                  call("update_case_memory", goal="变成数学老师", source_quote="你是数学老师吗"),
                  call("respond", reply="我是工友，协助处理劳动权益。", stage="waiting_user"),
                  call("review_scope", allowed=True, reason="within scope"))
    result = ScopedAgentRuntime(model, lambda q: []).run(AgentState(memory={"goal": "先协商"}), "你是数学老师吗")
    assert result.state.memory == {"goal": "先协商"}


def test_review_failure_releases_no_candidate_text():
    model = Model(call("classify_scope", route="case", reason="wage"),
                  call("respond", reply="尚未审查的越界草稿", stage="waiting_user"),
                  call("respond", reply="忽略检查", stage="waiting_user"))
    events = []
    with pytest.raises(ProviderError, match="服务范围检查"):
        ScopedAgentRuntime(model, lambda q: []).run(AgentState(), "欠工资", emit=events.append)
    assert not any(event["type"] == "reply_snapshot" for event in events)


def test_http_entry_uses_scope_gate_and_saves_no_fake_facts(client, headers, monkeypatch):
    model = Model(call("classify_scope", route="urgent", reason="reported danger"))
    monkeypatch.setattr("backend.api.router.build_provider", lambda: model)
    case_id = client.post("/api/v1/cases", headers=headers, json={}).json()["case"]["id"]
    result = client.post(f"/api/v1/cases/{case_id}/messages/stream", headers=headers, json={"content": "虚构测试：我快死掉了，救救我"})
    events = [json.loads(line[6:]) for line in result.text.splitlines() if line.startswith("data: ")]
    assert events[-1]["type"] == "done"
    data = events[-1]["result"]
    assert data["assistant_message"]["content"] == URGENT
    assert data["case"]["facts"]["owed_amount"] is None
    assert data["case"]["intake"]["agent_memory"] == {}
    assert model.calls == 1
