from __future__ import annotations

import json
from abc import ABC, abstractmethod
from urllib.parse import urlsplit

import httpx

from backend.config import settings


class ProviderError(RuntimeError):
    pass


class AgentProvider(ABC):
    """Model adapter. The mock provider is a deterministic rule engine, not an LLM."""

    provider_id: str = "mock"
    display_name: str = "本地规则引擎（演示，未连接大模型）"
    is_mock: bool = True

    @abstractmethod
    def polish_statement(self, draft: str, facts: dict) -> str:
        raise NotImplementedError

    def health(self) -> dict:
        return {
            "provider_id": self.provider_id,
            "display_name": self.display_name,
            "is_mock": self.is_mock,
            "note": "当前演示使用本地规则引擎完成事实抽取和流程编排；未调用大模型。"
            if self.is_mock
            else "使用服务端配置的大模型接口，仅用于语言润色，不替代规则和知识库。",
        }


class MockProvider(AgentProvider):
    provider_id = "mock"
    display_name = "本地规则引擎（演示，未连接大模型）"
    is_mock = True

    def polish_statement(self, draft: str, facts: dict) -> str:
        return draft


class OpenAICompatibleProvider(AgentProvider):
    """Server-side Chat Completions adapter for the tool loop and legacy polish."""

    provider_id = "openai_compatible"
    is_mock = False

    def __init__(self, *, api_key: str | None = None, base_url: str | None = None, model: str | None = None) -> None:
        self.api_key = api_key if api_key is not None else settings.llm_api_key
        self.base_url = base_url if base_url is not None else settings.llm_base_url
        self.model = model if model is not None else settings.llm_model
        if not self.api_key:
            raise ProviderError("已配置大模型 Provider，但缺少服务端 LLM_API_KEY。")
        self.display_name = f"{self.model}（Agent v1）"

    def _payload(self, messages: list[dict], tools: list[dict], *, final: bool) -> dict:
        payload = {
            "model": self.model,
            "messages": messages,
            "tools": tools,
            "tool_choice": {"type": "function", "function": {"name": "respond"}} if final else "required",
            "parallel_tool_calls": False,
            "max_tokens": 2048,
            "temperature": 0.3,
        }
        # DeepSeek defaults to thinking mode; explicit tool_choice requires non-thinking.
        if urlsplit(self.base_url).hostname == "api.deepseek.com":
            payload["thinking"] = {"type": "disabled"}
        return payload

    def stream_complete(self, messages, tools, *, final, emit):
        from backend.agents.agent_v1.streaming import partial_reply

        payload = {**self._payload(messages, tools, final=final), "stream": True, "stream_options": {"include_usage": True}}
        calls: dict[int, dict] = {}
        message = {"role": "assistant", "content": ""}
        usage = {}
        finished = False
        previous_reply = ""
        try:
            with httpx.stream("POST", f"{self.base_url.rstrip('/')}/chat/completions",
                              headers={"Authorization": f"Bearer {self.api_key}"},
                              json=payload, timeout=settings.llm_timeout_seconds) as response:
                response.raise_for_status()
                for line in response.iter_lines():
                    if not line.startswith("data:"):
                        continue
                    data = line[5:].strip()
                    if data == "[DONE]":
                        break
                    chunk = json.loads(data)
                    if chunk.get("error"):
                        raise ProviderError("模型数据流返回错误；本轮未保存。")
                    if chunk.get("usage"):
                        usage = chunk["usage"]
                    for choice in chunk.get("choices", []):
                        delta = choice.get("delta", {})
                        message["content"] += delta.get("content") or ""
                        if delta.get("content") and not calls:
                            emit({"type": "reply_snapshot", "text": message["content"]})
                        if delta.get("reasoning_content"):
                            message["reasoning_content"] = message.get("reasoning_content", "") + delta["reasoning_content"]
                        for item in delta.get("tool_calls") or []:
                            call = calls.setdefault(item["index"], {"id": "", "type": "function", "function": {"name": "", "arguments": ""}})
                            if item.get("id"):
                                call["id"] = item["id"]
                            function = item.get("function", {})
                            call["function"]["name"] += function.get("name") or ""
                            call["function"]["arguments"] += function.get("arguments") or ""
                            if call["function"]["name"] == "respond":
                                reply = partial_reply(call["function"]["arguments"])
                                if reply != previous_reply:
                                    emit({"type": "reply_snapshot", "text": reply})
                                    previous_reply = reply
                        if choice.get("finish_reason") in {"length", "content_filter"}:
                            raise ProviderError("模型输出被截断，未保存本轮，请缩短消息或检查模型限制。")
                        if choice.get("finish_reason"):
                            finished = True
            if not finished:
                raise ProviderError("模型数据流中断，未保存本轮。")
            message["tool_calls"] = [calls[index] for index in sorted(calls)]
            return {"message": message, "usage": usage}
        except httpx.HTTPStatusError as exc:
            raise ProviderError(f"模型服务返回 HTTP {exc.response.status_code}，请检查权限、余额与流式支持。") from exc
        except (httpx.HTTPError, KeyError, TypeError, ValueError) as exc:
            raise ProviderError(f"读取模型数据流失败：{exc.__class__.__name__}") from exc

    def complete(self, messages: list[dict], tools: list[dict], *, final: bool) -> dict:
        payload = self._payload(messages, tools, final=final)
        try:
            response = httpx.post(
                f"{self.base_url.rstrip('/')}/chat/completions",
                headers={"Authorization": f"Bearer {self.api_key}"},
                json=payload,
                timeout=settings.llm_timeout_seconds,
            )
            response.raise_for_status()
            data = response.json()
            message = data["choices"][0]["message"]
            # reasoning_content is protocol context only; never returned to UI or persisted.
            return {"message": {key: message[key] for key in ("role", "content", "tool_calls", "reasoning_content") if key in message},
                    "usage": data.get("usage", {})}
        except httpx.HTTPStatusError as exc:
            raise ProviderError(f"模型服务返回 HTTP {exc.response.status_code}，请检查权限、余额与模型配置。") from exc
        except (httpx.HTTPError, KeyError, IndexError, TypeError, ValueError) as exc:
            raise ProviderError(f"模型调用或响应解析失败：{exc.__class__.__name__}") from exc

    def polish_statement(self, draft: str, facts: dict) -> str:
        system = (
            "你是劳动权益文书助手。只能润色用户已经陈述的事实，不得新增金额、日期、主体、"
            "法律条文或承诺结果。保留所有【待补充】占位符。输出中文正式陈述，不超过600字。"
        )
        payload = {
            "model": self.model,
            "temperature": 0.1,
            "messages": [
                {"role": "system", "content": system},
                {"role": "user", "content": draft},
            ],
        }
        try:
            response = httpx.post(
                f"{self.base_url.rstrip('/')}/chat/completions",
                headers={"Authorization": f"Bearer {self.api_key}"},
                json=payload,
                timeout=settings.llm_timeout_seconds,
            )
            response.raise_for_status()
            data = response.json()
            content = data["choices"][0]["message"]["content"]
            if not isinstance(content, str) or not content.strip():
                raise ProviderError("大模型返回内容为空。")
            return content.strip()
        except (httpx.HTTPError, KeyError, ValueError, TypeError) as exc:
            raise ProviderError(f"大模型调用失败：{exc.__class__.__name__}") from exc

    def health(self) -> dict:
        return {
            "provider_id": self.provider_id,
            "display_name": self.display_name,
            "is_mock": False,
            "note": "已配置 Agent v1 工具循环；是否成功调用以具体消息和动作记录为准。分析/行动/表单页面仍使用原有规则模块。",
        }


def build_provider() -> AgentProvider:
    if settings.llm_provider in ("deepseek", "openai", "openai_compatible"):
        return OpenAICompatibleProvider()
    if settings.llm_provider == "mock":
        return MockProvider()
    raise ProviderError("未知 LLM_PROVIDER；使用 mock 或 openai_compatible。")


def provider_payload(provider: AgentProvider) -> dict:
    return provider.health()


def encode_provider_meta(provider: AgentProvider) -> str:
    return json.dumps(provider.health(), ensure_ascii=False)
