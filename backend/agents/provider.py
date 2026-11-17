from __future__ import annotations

import json
from abc import ABC, abstractmethod

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
    """DeepSeek / OpenAI-compatible chat completion adapter.

    API keys are read from server-side environment variables only. This adapter
    is intentionally limited to wording polish; facts, law retrieval and action
    planning remain rule/data driven.
    """

    provider_id = "openai_compatible"
    is_mock = False

    def __init__(self) -> None:
        if not settings.llm_api_key:
            raise ProviderError("已配置大模型 Provider，但缺少服务端 LLM_API_KEY。")
        self.display_name = f"{settings.llm_model}（语言润色适配器，当前流程未调用）"

    def polish_statement(self, draft: str, facts: dict) -> str:
        system = (
            "你是劳动权益文书助手。只能润色用户已经陈述的事实，不得新增金额、日期、主体、"
            "法律条文或承诺结果。保留所有【待补充】占位符。输出中文正式陈述，不超过600字。"
        )
        payload = {
            "model": settings.llm_model,
            "temperature": 0.1,
            "messages": [
                {"role": "system", "content": system},
                {"role": "user", "content": draft},
            ],
        }
        try:
            response = httpx.post(
                f"{settings.llm_base_url.rstrip('/')}/chat/completions",
                headers={"Authorization": f"Bearer {settings.llm_api_key}"},
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
            "note": "适配器已配置，但当前业务流程未调用云端润色；事实、法条和行动步骤仍由规则与知识库生成。",
        }


def build_provider() -> AgentProvider:
    if settings.llm_provider in ("deepseek", "openai", "openai_compatible"):
        try:
            return OpenAICompatibleProvider()
        except ProviderError:
            return MockProvider()
    return MockProvider()


def provider_payload(provider: AgentProvider) -> dict:
    return provider.health()


def encode_provider_meta(provider: AgentProvider) -> str:
    return json.dumps(provider.health(), ensure_ascii=False)
