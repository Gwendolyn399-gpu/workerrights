import json

from backend.agents.provider import OpenAICompatibleProvider, ProviderError


def parse_events(response):
    return [json.loads(line[6:]) for line in response.text.splitlines() if line.startswith("data: ")]


def enable(client, headers):
    client.put("/api/v1/agent/settings", headers=headers, json={"api_key": "test-stream-key", "base_url": "https://example.com/v1", "model": "stream-test"})
    return client.post("/api/v1/cases", headers=headers, json={}).json()["case"]


def test_sse_finishes_with_saved_result(client, headers, monkeypatch):
    case = enable(client, headers)
    def stream(self, messages, tools, *, final, emit):
        emit({"type": "reply_snapshot", "text": "好，"})
        emit({"type": "reply_snapshot", "text": "好，先不问了。"})
        return {"message": {"role": "assistant", "tool_calls": [{"id": "reply", "function": {"name": "respond", "arguments": json.dumps({"reply": "好，先不问了。", "stage": "waiting_user", "next_question": None})}}]}, "usage": {}}
    monkeypatch.setattr(OpenAICompatibleProvider, "stream_complete", stream)
    response = client.post(f"/api/v1/cases/{case['id']}/messages/stream", headers=headers, json={"content": "不想说了"})
    assert response.status_code == 200
    events = parse_events(response)
    assert [event["type"] for event in events] == ["status", "reply_snapshot", "reply_snapshot", "done"]
    assert events[-1]["result"]["assistant_message"]["content"] == "好，先不问了。"
    assert "test-stream-key" not in response.text


def test_stream_failure_rolls_back_partial_reply_and_message(client, headers, monkeypatch):
    case = enable(client, headers)
    def broken(self, messages, tools, *, final, emit):
        emit({"type": "reply_snapshot", "text": "半截回复"})
        raise ProviderError("测试断流")
    monkeypatch.setattr(OpenAICompatibleProvider, "stream_complete", broken)
    response = client.post(f"/api/v1/cases/{case['id']}/messages/stream", headers=headers, json={"content": "测试"})
    assert parse_events(response)[-1]["type"] == "error"
    saved = client.get(f"/api/v1/cases/{case['id']}", headers=headers).json()["case"]
    assert len(saved["messages"]) == len(case["messages"])


def test_stream_keeps_session_ownership(client, headers):
    case = client.post("/api/v1/cases", headers=headers, json={}).json()["case"]
    response = client.post(f"/api/v1/cases/{case['id']}/messages/stream", headers={"X-Session-Id": "another-session"}, json={"content": "你好"})
    assert response.status_code == 404
