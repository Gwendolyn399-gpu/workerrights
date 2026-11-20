import json
import os
from contextlib import contextmanager

import httpx
import pytest

from backend.agents.agent_v1.streaming import partial_reply
from backend.agents.provider import OpenAICompatibleProvider, ProviderError, normalize_no_proxy_env


def test_partial_json_reply_handles_escapes_and_split_unicode():
    text = '先不问了。\n你说“想歇歇”，那就歇歇。\\'
    encoded = json.dumps({"reply": text, "stage": "waiting_user"}, ensure_ascii=True)
    snapshots = [partial_reply(encoded[:i]) for i in range(1, len(encoded) + 1)]
    assert snapshots[-1] == text
    assert any("先不问" in snapshot and snapshot != text for snapshot in snapshots)
    assert partial_reply('{"stage":"waiting_user","reply":"你好') == "你好"


class ByteStream(httpx.SyncByteStream):
    def __init__(self, events):
        self.events = events
        self.read_count = 0

    def __iter__(self):
        for event in self.events:
            self.read_count += 1
            yield ("data: " + json.dumps(event) + "\n\n").encode()


def test_provider_streams_before_completion_and_assembles_tool(monkeypatch):
    fragments = ['{"reply":"你好，', '先不问了。",', '"stage":"waiting_user"}']
    chunks = [{"choices": [{"delta": {"tool_calls": [{"index": 0, "id": "call1", "function": {"name": "respond", "arguments": fragments[0]}}]}}]}]
    chunks += [{"choices": [{"delta": {"tool_calls": [{"index": 0, "function": {"arguments": fragment}}]}}]} for fragment in fragments[1:]]
    chunks += [{"choices": [{"delta": {}, "finish_reason": "tool_calls"}]}, {"choices": [], "usage": {"total_tokens": 42}}]
    source = ByteStream(chunks)
    @contextmanager
    def stream(method, url, **kwargs):
        assert kwargs["json"]["stream"] is True
        yield httpx.Response(200, request=httpx.Request(method, url), stream=source)
    monkeypatch.setattr(httpx, "stream", stream)
    events = []
    def emit(event):
        events.append((event, source.read_count))
    result = OpenAICompatibleProvider(api_key="test-only", base_url="https://example.com/v1", model="test").stream_complete([], [], final=True, emit=emit)
    assert events[0][1] < len(chunks)
    assert events[-1][0]["text"] == "你好，先不问了。"
    assert json.loads(result["message"]["tool_calls"][0]["function"]["arguments"])["stage"] == "waiting_user"
    assert result["usage"]["total_tokens"] == 42


def test_provider_rejects_truncated_stream(monkeypatch):
    @contextmanager
    def stream(method, url, **kwargs):
        yield httpx.Response(200, request=httpx.Request(method, url), stream=ByteStream([{"choices": [{"delta": {"content": "半截"}}]}]))
    monkeypatch.setattr(httpx, "stream", stream)
    with pytest.raises(ProviderError, match="中断"):
        OpenAICompatibleProvider(api_key="test", model="test").stream_complete([], [], final=False, emit=lambda event: None)


def test_normalize_no_proxy_strips_bracketed_ipv6(monkeypatch):
    monkeypatch.setenv("NO_PROXY", "localhost,.localhost,127.0.0.1,127.0.0.0/8,[::1],::1")
    normalize_no_proxy_env()
    assert os.environ["NO_PROXY"] == "localhost,.localhost,127.0.0.1,127.0.0.0/8,::1,::1"
    mounts = httpx._utils.get_environment_proxies()
    assert "all://*[::1]" not in mounts


def test_provider_init_normalizes_no_proxy(monkeypatch):
    monkeypatch.setenv("NO_PROXY", "[::1],localhost")
    OpenAICompatibleProvider(api_key="test", model="test")
    assert os.environ["NO_PROXY"] == "::1,localhost"


def test_complete_wraps_invalid_url(monkeypatch):
    def post(*args, **kwargs):
        raise httpx.InvalidURL("Invalid port: ':1]'")
    monkeypatch.setattr(httpx, "post", post)
    with pytest.raises(ProviderError, match="代理环境变量"):
        OpenAICompatibleProvider(api_key="test", model="test").complete([], [], final=False)


def test_stream_complete_wraps_invalid_url(monkeypatch):
    @contextmanager
    def stream(*args, **kwargs):
        raise httpx.InvalidURL("Invalid port: ':1]'")
        yield
    monkeypatch.setattr(httpx, "stream", stream)
    with pytest.raises(ProviderError, match="代理环境变量"):
        OpenAICompatibleProvider(api_key="test", model="test").stream_complete([], [], final=False, emit=lambda event: None)
