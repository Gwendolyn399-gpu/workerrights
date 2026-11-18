import copy
import json

import httpx
import pytest

from backend.agents.agent_v1.runtime import AgentRuntime, AgentState
from backend.agents.provider import OpenAICompatibleProvider, ProviderError, build_provider
from backend.config import settings


def action(name, **args):
    return {"message": {"role": "assistant", "tool_calls": [{"id": name, "type": "function", "function": {"name": name, "arguments": json.dumps(args)}}]}, "usage": {"total_tokens": 10}}


def respond(**overrides):
    return action("respond", **{"reply": "还需要了解什么？", "stage": "waiting_user", **overrides})


class Script:
    def __init__(self, *responses):
        self.responses = iter(responses)
        self.inputs = []

    def complete(self, messages, tools, *, final):
        self.inputs.append(copy.deepcopy(messages))
        return next(self.responses)


def test_conversation_retains_early_details_beyond_eight_turns():
    history = [{"role": "user", "content": "我想先拿回工资，不想再回那个工地。"},
               {"role": "assistant", "content": "好，先围绕拿回工资说。"}]
    for i in range(10):
        history.extend([{"role": "user", "content": f"补充细节{i}"},
                        {"role": "assistant", "content": f"记下细节{i}"}])
    model = Script(respond(reply="你说过想先拿回工资，也不想再回那个工地。"), respond(reply="仍按这个目标继续。"))
    runtime = AgentRuntime(model, lambda q: [])
    first = runtime.run(AgentState(history=history), "我一开始说想怎么办？")
    assert model.inputs[0][2:-1] == history
    assert len(first.state.history) == len(history) + 2
    runtime.run(first.state, "继续")
    assert model.inputs[1][2] == history[0]
    assert sum(m["content"] == "我一开始说想怎么办？" for m in model.inputs[1]) == 1


def test_memory_is_sourced_atomic_and_separate_from_paid_amount():
    state = AgentState(facts={"paid_amount": 5000, "owed_amount": 9000})
    model = Script(action("update_case_memory", goal="先协商", constraints=["只能晚上联系"],
                          event="承诺周五给3000，尚未到账", source_quote="想先协商，只能晚上联系。他承诺周五给3000，没到账。"), respond())
    result = AgentRuntime(model, lambda q: []).run(state, "想先协商，只能晚上联系。他承诺周五给3000，没到账。")
    assert result.state.memory["goal"] == "先协商"
    assert result.state.memory["events"][0]["status"] == "user_reported"
    assert result.state.facts == state.facts
    assert state.memory == {}
    bad = Script(action("update_case_memory", goal="立即起诉", source_quote="伪造来源"), respond())
    assert AgentRuntime(bad, lambda q: []).run(result.state, "先不改目标").state.memory == result.state.memory


def test_materials_persist_and_become_outdated_after_correction():
    state = AgentState(facts={"owed_amount": 9000})
    model = Script(action("prepare_materials"), respond())
    first = AgentRuntime(model, lambda q: []).run(state, "给我材料草稿")
    assert first.state.materials["status"] == "draft_requires_review"
    assert "9,000" in first.state.materials["draft"]
    assert first.state.materials["wage_message"]
    corrected = AgentRuntime(Script(action("record_facts", patch={"owed_amount": 7000}, source_quote="还欠7000"), respond()), lambda q: []).run(first.state, "还欠7000")
    assert corrected.state.materials["status"] == "outdated_requires_regeneration"
    updated = AgentRuntime(Script(action("prepare_materials"), respond()), lambda q: []).run(corrected.state, "重新生成")
    assert "7,000" in updated.state.materials["draft"]
    assert "9,000" not in updated.state.materials["draft"]


def test_progress_updates_invalidate_materials_and_regenerated_draft_contains_timeline():
    state = AgentState(facts={"owed_amount": 9000})
    first = AgentRuntime(Script(action("prepare_materials"), respond()), lambda q: []).run(state, "草稿")
    model = Script(action("update_case_memory", event="承诺周五付3000，未到账", source_quote="承诺周五付3000，未到账"), respond())
    updated = AgentRuntime(model, lambda q: []).run(first.state, "承诺周五付3000，未到账")
    assert updated.state.materials["status"] == "outdated_requires_regeneration"
    regenerated = AgentRuntime(Script(action("prepare_materials"),
                                     action("record_facts", patch={"owed_amount": 9000}, source_quote="仍欠9000"), respond()), lambda q: []).run(updated.state, "仍欠9000，重新整理")
    assert "承诺周五付3000，未到账" in regenerated.state.materials["draft"]
    assert regenerated.state.materials["status"] == "draft_requires_review"
    assert regenerated.state.materials["memory_snapshot"] == updated.state.memory


def test_materials_are_refreshed_when_batch_changes_state_after_drafting():
    model = Script(action("prepare_materials"),
                   action("update_case_memory", event="对方承诺周五付3000，未到账", source_quote="对方承诺周五付3000，未到账"), respond())
    result = AgentRuntime(model, lambda q: []).run(AgentState(facts={"owed_amount": 9000}), "对方承诺周五付3000，未到账，帮我整理草稿")
    assert result.state.materials["status"] == "draft_requires_review"
    assert "承诺周五付3000，未到账" in result.state.materials["draft"]
    assert result.state.materials["memory_snapshot"] == result.state.memory
    assert any(item.get("automatic_refresh") for item in result.trace)


def test_known_text_citations_need_no_duplicate_metadata_and_placeholders_are_not_citations():
    model = Script(respond(reply="按资料 [LAW-1]，缺项写[待补充]。"))
    result = AgentRuntime(model, lambda q: []).run(AgentState(citations={"law-1": {"id": "law-1"}}), "解释")
    assert result.citations == [{"id": "law-1"}]
    assert "[law-1]" in result.reply
    assert len(result.trace) == 1
    bad = Script(respond(reply="资料 [30]"), respond(reply="尚无相应依据"))
    assert AgentRuntime(bad, lambda q: []).run(AgentState(), "介绍").trace[0]["ok"] is False


def test_explicit_no_followup_is_enforced_but_employer_message_may_ask():
    model = Script(respond(reply="保留聊天。要不要我帮你写？"),
                   respond(reply="保留聊天，可以发：「请问什么时候付款？」"))
    result = AgentRuntime(model, lambda q: []).run(AgentState(), "先不问细节，直接给办法")
    assert [step["ok"] for step in result.trace] == [False, True]
    assert result.next_question is None
    assert "要不要我" not in result.reply


def test_historical_user_quotes_fill_missing_facts_without_overwriting_corrections():
    history = [{"role": "user", "content": "在新乡干活，欠20000"}, {"role": "assistant", "content": "推测已付8000"}]
    state = AgentState(history=history, facts={"owed_amount": 18000}, sources={"owed_amount": {"quote": "更正18000"}})
    model = Script(action("record_facts", patch={"location_city": "新乡"}, source_quote="在新乡干活"),
                   action("record_facts", patch={"owed_amount": 20000}, source_quote="欠20000"),
                   action("record_facts", patch={"paid_amount": 8000}, source_quote="推测已付8000"), respond())
    result = AgentRuntime(model, lambda q: []).run(state, "先不补充新情况")
    assert result.state.facts["location_city"] == "新乡"
    assert result.state.facts["owed_amount"] == 18000
    assert "paid_amount" not in result.state.facts
    assert [step["ok"] for step in result.trace] == [True, False, False, True]


def test_incremental_payment_cannot_become_unknown_cumulative_total():
    model = Script(action("record_facts", patch={"paid_amount": 1000, "owed_amount": 5000}, source_quote="刚补付了1000，现在还欠5000"),
                   action("record_facts", patch={"owed_amount": 5000}, source_quote="现在还欠5000"), respond())
    result = AgentRuntime(model, lambda q: []).run(AgentState(facts={"owed_amount": 6000}), "刚补付了1000，现在还欠5000")
    assert result.state.facts["owed_amount"] == 5000
    assert result.state.facts.get("paid_amount") is None
    assert result.trace[0]["ok"] is False


def test_material_reply_cannot_invent_contract_or_cumulative_payment():
    model = Script(action("prepare_materials"), respond(reply="本人未签订书面合同。"),
                   respond(reply="本人已支付1000元。"), respond(reply="书面合同情况尚待核实，已付【已付金额待核实】。"))
    result = AgentRuntime(model, lambda q: []).run(AgentState(facts={"owed_amount": 5000}), "写事实陈述")
    assert [step["ok"] for step in result.trace] == [True, False, False, True]
    assert "尚待核实" in result.reply


def test_urgent_reply_rejects_unverified_numbers_and_movement_instructions():
    model = Script(respond(reply="请打急救电话911。"), respond(reply="等救护时能靠到路边就靠过去。"),
                   respond(reply="请使用手机紧急呼叫功能，尽量让附近真人帮助联系当地急救。"))
    result = AgentRuntime(model, lambda q: []).run(AgentState(), "虚构紧急求助测试，地点未知")
    assert [step["ok"] for step in result.trace] == [False, False, True]


def test_daily_reply_must_shorten_and_correction_cannot_trigger_document_dump():
    model = Script(respond(reply="长篇说明" * 70),
                   respond(reply="重新发整份材料", response_kind="document"),
                   respond(reply="好，考勤撤掉，这个案子只记聊天。"))
    result = AgentRuntime(model, lambda q: []).run(AgentState(), "考勤是别的工地的，撤掉")
    assert [step["ok"] for step in result.trace] == [False, False, True]


def test_explicit_document_request_can_exceed_chat_limit():
    model = Script(respond(reply="事实陈述草稿。" * 50, response_kind="document"))
    result = AgentRuntime(model, lambda q: []).run(AgentState(), "写一份事实陈述和证据目录")
    assert len(result.reply) > 240
    assert result.trace[0]["ok"] is True


def test_loop_observes_tools_and_preserves_conflicting_claims():
    model = Script(action("record_facts", patch={"agreed_amount": 26000, "paid_amount": 8000, "owed_amount": 20000}, source_quote="共26000，付了8000，还欠20000"),
                   action("check_amounts"), respond(reply="算得18000，与20000不同，请核对。"))
    state = AgentState()
    result = AgentRuntime(model, lambda q: []).run(state, "共26000，付了8000，还欠20000")
    observation = json.loads(model.inputs[2][-1]["content"])
    assert observation["conflict"] is True
    assert float(observation["calculated_owed"]) == 18000
    assert result.state.facts["owed_amount"] == 20000
    assert state.facts == {}
    assert result.usage["total_tokens"] == 30


def test_forged_source_and_bad_types_are_not_committed():
    model = Script(action("record_facts", patch={"owed_amount": 99999}, source_quote="伪造用户的话"),
                   action("record_facts", patch={"paid_amount": -1}, source_quote="没有合同"), respond())
    result = AgentRuntime(model, lambda q: []).run(AgentState(), "没有合同")
    assert result.state.facts == {}
    assert [step["ok"] for step in result.trace] == [False, False, True]


def test_search_then_citation_and_unknown_citation_rejected():
    model = Script(action("search_law", query="欠薪"), respond(reply="资料 [law-1] 待核验", citation_ids=["law-1"]))
    result = AgentRuntime(model, lambda q: [{"id": "law-1", "verification_status": "pending"}]).run(AgentState(), "怎么处理？")
    assert result.citations[0]["verification_status"] == "pending"
    bad = Script(respond(reply="看 [fake]", citation_ids=["fake"]), respond())
    assert AgentRuntime(bad, lambda q: []).run(AgentState(), "你好").trace[0]["ok"] is False


def test_confirmation_requires_prior_summary_and_explicit_user_input():
    model = Script(respond(stage="ready"), respond(stage="awaiting_confirmation"))
    first = AgentRuntime(model, lambda q: []).run(AgentState(), "可能欠两万")
    assert first.state.stage == "awaiting_confirmation"
    confirmed = AgentRuntime(Script(respond(stage="ready")), lambda q: []).run(first.state, "确认无误")
    assert confirmed.state.stage == "ready"


def test_correction_reopens_confirmation_with_source():
    model = Script(action("record_facts", patch={"owed_amount": 18000}, source_quote="不是两万，是一万八"), respond())
    result = AgentRuntime(model, lambda q: []).run(AgentState(facts={"owed_amount": 20000}, stage="ready"), "不是两万，是一万八")
    assert result.state.stage == "waiting_user"
    assert result.state.sources["owed_amount"]["previous"] == 20000


def test_tool_budget_failure_is_atomic():
    state = AgentState()
    model = Script(action("record_facts", patch={"has_contract": "no"}, source_quote="没签合同"), action("check_amounts"))
    with pytest.raises(ProviderError, match="动作上限"):
        AgentRuntime(model, lambda q: [], max_steps=2).run(state, "没签合同")
    assert state.facts == {}


def test_provider_missing_key_does_not_silently_mock(monkeypatch):
    monkeypatch.setattr(settings, "llm_provider", "openai_compatible")
    monkeypatch.setattr(settings, "llm_api_key", "")
    with pytest.raises(ProviderError, match="LLM_API_KEY"):
        build_provider()


def test_transport_protocol_and_failure(monkeypatch):
    monkeypatch.setattr(settings, "llm_api_key", "test-only-key")
    def fake_post(url, **kwargs):
        assert kwargs["json"]["tool_choice"]["function"]["name"] == "respond"
        return httpx.Response(401, request=httpx.Request("POST", url))
    monkeypatch.setattr(httpx, "post", fake_post)
    with pytest.raises(ProviderError, match="HTTP 401"):
        OpenAICompatibleProvider().complete([], [], final=True)


def test_successful_transport_returns_tool_protocol(monkeypatch):
    monkeypatch.setattr(settings, "llm_api_key", "test-only-key")
    monkeypatch.setattr(settings, "llm_base_url", "https://api.deepseek.com/v1")
    def fake_post(url, **kwargs):
        assert kwargs["json"]["thinking"] == {"type": "disabled"}
        reply = respond()
        return httpx.Response(200, request=httpx.Request("POST", url),
                              json={"choices": [{"message": reply["message"]}], "usage": reply["usage"]})
    monkeypatch.setattr(httpx, "post", fake_post)
    output = AgentRuntime(OpenAICompatibleProvider(), lambda q: []).run(AgentState(), "你好")
    assert output.reply == "还需要了解什么？"
    assert output.usage["total_tokens"] == 10


def test_multiple_tools_in_one_model_response_are_executed_in_order():
    first = action("record_facts", patch={"paid_amount": 8000}, source_quote="给了八千")
    first["message"]["tool_calls"] += action("check_amounts")["message"]["tool_calls"]
    model = Script(first, respond(reply="已按八千记下。"))
    result = AgentRuntime(model, lambda q: []).run(AgentState(facts={"agreed_amount": 26000}), "给了八千")
    assert result.state.facts["paid_amount"] == 8000
    assert [step["action"] for step in result.trace] == ["record_facts", "check_amounts", "respond"]
    assert len(model.inputs) == 2


def test_batch_tools_do_not_consume_model_round_budget():
    first = action("record_facts", patch={"paid_amount": 8000}, source_quote="给了八千")
    first["message"]["tool_calls"] += action("check_amounts")["message"]["tool_calls"]
    first["message"]["tool_calls"] += action("inspect_evidence")["message"]["tool_calls"]
    model = Script(first, respond(reply="已记录，按工具核算。"))
    result = AgentRuntime(model, lambda q: [], max_steps=2).run(AgentState(facts={"agreed_amount": 26000}), "给了八千")
    assert len(result.trace) == 4
    assert len(model.inputs) == 2
    assert [m["role"] for m in model.inputs[1][-3:]] == ["tool", "tool", "tool"]


def test_plain_text_response_ends_turn_instead_of_protocol_error():
    model = Script({"message": {"role": "assistant", "content": "好，先歇一会儿。"}, "usage": {}})
    result = AgentRuntime(model, lambda q: []).run(AgentState(), "不想说了")
    assert result.reply == "好，先歇一会儿。"
    placeholder = Script({"message": {"role": "assistant", "content": "缺项写[待补充]。"}})
    assert AgentRuntime(placeholder, lambda q: []).run(AgentState(), "草稿").reply == "缺项写[待补充]。"


def test_web_adapter_persists_and_rolls_back_failed_turn(client, headers, monkeypatch):
    provider = Script(action("record_facts", patch={"owed_amount": 18000}, source_quote="欠一万八"), respond())
    provider.is_mock = False
    provider.display_name = "测试替身（不是实际模型）"
    provider.health = lambda: {"is_mock": False, "display_name": provider.display_name}
    monkeypatch.setattr("backend.api.router.build_provider", lambda: provider)
    monkeypatch.setattr("backend.agents.orchestrator.build_provider", lambda: provider)
    case_id = client.post("/api/v1/cases", headers=headers, json={}).json()["case"]["id"]
    result = client.post(f"/api/v1/cases/{case_id}/messages", headers=headers, json={"content": "欠一万八"})
    assert result.status_code == 200, result.text
    data = result.json()
    assert data["case"]["facts"]["owed_amount"] == 18000
    assert len(data["assistant_message"]["meta"]["agent_trace"]) == 2
    previous_count = len(data["case"]["messages"])
    def fail(*args, **kwargs):
        raise ProviderError("测试超时")
    provider.complete = fail
    response = client.post(f"/api/v1/cases/{case_id}/messages", headers=headers, json={"content": "付了六千"})
    assert response.status_code == 502
    current = client.get(f"/api/v1/cases/{case_id}", headers=headers).json()["case"]
    assert len(current["messages"]) == previous_count
    assert current["facts"]["paid_amount"] is None


def test_web_memory_and_materials_survive_new_request_and_stay_case_scoped(client, headers, monkeypatch):
    provider = Script(action("record_facts", patch={"owed_amount": 9000}, source_quote="欠9000，先协商，只能晚上联系"),
                      action("update_case_memory", goal="先协商", constraints=["只能晚上联系"], source_quote="欠9000，先协商，只能晚上联系"),
                      action("prepare_materials"), respond(reply="草稿已整理。"), respond(reply="记得你想先协商。"), respond(reply="这个案件还没有记录。"))
    provider.is_mock = False
    provider.display_name = "测试替身"
    provider.health = lambda: {"is_mock": False, "display_name": provider.display_name}
    monkeypatch.setattr("backend.api.router.build_provider", lambda: provider)
    monkeypatch.setattr("backend.agents.orchestrator.build_provider", lambda: provider)
    first = client.post("/api/v1/cases", headers=headers, json={}).json()["case"]["id"]
    sent = client.post(f"/api/v1/cases/{first}/messages", headers=headers, json={"content": "欠9000，先协商，只能晚上联系"})
    assert sent.status_code == 200, sent.text
    saved = client.get(f"/api/v1/cases/{first}", headers=headers).json()["case"]
    assert saved["intake"]["agent_memory"]["goal"] == "先协商"
    assert saved["intake"]["agent_materials"]["facts_snapshot"]["owed_amount"] == 9000
    client.post(f"/api/v1/cases/{first}/messages", headers=headers, json={"content": "你记得目标吗"})
    context = json.loads(provider.inputs[-1][1]["content"].split("：", 1)[1])
    assert context["case_memory"]["constraints"] == ["只能晚上联系"]
    assert context["saved_materials"]["status"] == "draft_requires_review"
    second = client.post("/api/v1/cases", headers=headers, json={}).json()["case"]["id"]
    client.post(f"/api/v1/cases/{second}/messages", headers=headers, json={"content": "你记得目标吗"})
    second_context = json.loads(provider.inputs[-1][1]["content"].split("：", 1)[1])
    assert second_context["case_memory"] == {}
    assert second_context["saved_materials"] == {}
