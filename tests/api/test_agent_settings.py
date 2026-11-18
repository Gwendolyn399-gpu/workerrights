import json
import uuid

from backend.agents.provider import OpenAICompatibleProvider


def config():
    return {"base_url": "https://example.com/v1/chat/completions", "model": "test-model", "api_key": "test-secret-never-return"}


def test_settings_are_session_scoped_and_never_return_secrets(client, headers):
    path = "/api/v1/agent/settings"
    saved = client.put(path, headers=headers, json=config())
    assert saved.status_code == 200
    assert "test-secret-never-return" not in saved.text
    assert saved.json()["base_url"] == "https://example.com/v1"
    assert saved.json()["mode"] == "ai"
    from backend.agents.session_settings import load_settings
    restored = load_settings()
    assert restored[headers["X-Session-Id"]].api_key.get_secret_value() == "test-secret-never-return"
    other = {"X-Session-Id": f"other-{uuid.uuid4()}"}
    assert client.get(path, headers=other).json()["key_configured"] is False
    own_meta = client.get("/api/v1/meta", headers=headers).json()
    assert own_meta["provider"]["is_mock"] is False
    assert client.get("/api/v1/meta", headers=other).json()["provider"]["is_mock"] is True
    created = client.post("/api/v1/cases", headers=headers, json={}).json()
    assert created["provider"]["is_mock"] is False
    assert "test-secret-never-return" not in json.dumps(created)
    assert client.delete(path, headers=headers).json()["mode"] == "mock"
    assert client.get(path, headers=headers).json()["key_configured"] is False


def test_keep_secret_only_for_same_url(client, headers):
    path = "/api/v1/agent/settings"
    client.put(path, headers=headers, json=config())
    data = {**config(), "api_key": "", "model": "another-model"}
    assert client.put(path, headers=headers, json=data).status_code == 200
    data["base_url"] = "https://different.example/v1"
    rejected = client.put(path, headers=headers, json=data)
    assert rejected.status_code == 400
    assert client.get(path, headers=headers).json()["base_url"] == "https://example.com/v1"


def test_validation_does_not_echo_key(client, headers):
    response = client.put("/api/v1/agent/settings", headers=headers, json={"api_key": "private-test-secret"})
    assert response.status_code == 422
    assert "private-test-secret" not in response.text
    unsafe = client.put("/api/v1/agent/settings", headers=headers, json={**config(), "base_url": "http://remote.example/v1"})
    assert unsafe.status_code == 422
    assert "test-secret-never-return" not in unsafe.text


def test_connection_uses_draft_config_and_does_not_enable(client, headers, monkeypatch):
    def complete(self, messages, tools, *, final):
        assert self.base_url == "https://example.com/v1"
        assert self.api_key == "test-secret-never-return"
        assert final is True
        assert len(messages) == 1
        return {"message": {"tool_calls": [{"function": {"name": "respond", "arguments": json.dumps({"reply": "连接成功", "stage": "waiting_user"})}}]}, "usage": {"total_tokens": 20}}
    monkeypatch.setattr(OpenAICompatibleProvider, "complete", complete)
    response = client.post("/api/v1/agent/settings/test", headers=headers, json=config())
    assert response.status_code == 200
    assert response.json()["ok"] is True
    assert client.get("/api/v1/agent/settings", headers=headers).json()["mode"] == "mock"
    assert "test-secret-never-return" not in response.text


def test_saved_config_used_for_chat(client, headers, monkeypatch):
    client.put("/api/v1/agent/settings", headers=headers, json=config())
    def complete(self, messages, tools, *, final):
        assert self.model == "test-model"
        return {"message": {"role": "assistant", "tool_calls": [{"id": "test", "function": {"name": "respond", "arguments": json.dumps({"reply": "这是协议测试回复", "stage": "waiting_user"})}}]}, "usage": {}}
    monkeypatch.setattr(OpenAICompatibleProvider, "complete", complete)
    created = client.post("/api/v1/cases", headers=headers, json={}).json()
    response = client.post(f"/api/v1/cases/{created['case']['id']}/messages", headers=headers, json={"content": "你好"})
    assert response.status_code == 200, response.text
    assert response.json()["assistant_message"]["content"] == "这是协议测试回复"
