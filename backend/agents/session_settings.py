"""Local development settings. User-authorized plain file, excluded from Git."""
import json
import os
import tempfile
from pathlib import Path
from threading import Lock
from urllib.parse import urlsplit

from pydantic import BaseModel, ConfigDict, Field, SecretStr, field_validator

from backend.agents.provider import MockProvider, OpenAICompatibleProvider
from backend.config import settings


class ModelSettingsRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    base_url: str = Field(min_length=1, max_length=500)
    model: str = Field(min_length=1, max_length=120)
    api_key: SecretStr = SecretStr("")

    @field_validator("base_url")
    @classmethod
    def normalize_url(cls, value: str) -> str:
        value = value.strip().rstrip("/")
        if value.endswith("/chat/completions"):
            value = value[:-len("/chat/completions")]
        parts = urlsplit(value)
        if not parts.hostname or parts.username or parts.password or parts.query or parts.fragment:
            raise ValueError("接口地址须包含有效主机，不能包含账号、密码、查询参数或片段。")
        if parts.scheme != "https" and not (parts.scheme == "http" and parts.hostname in {"localhost", "127.0.0.1", "::1"}):
            raise ValueError("云端接口请使用 HTTPS；本机接口可使用 HTTP。")
        return value

    @field_validator("model")
    @classmethod
    def normalize_model(cls, value: str) -> str:
        if not value.strip():
            raise ValueError("请输入模型名。")
        return value.strip()


SETTINGS_PATH = Path(os.environ.get("AGENT_SETTINGS_FILE", str(Path(__file__).resolve().parents[2] / ".agent-local-settings.json")))
_settings_lock = Lock()


def load_settings() -> dict[str, ModelSettingsRequest | None]:
    if not SETTINGS_PATH.exists():
        return {}
    data = json.loads(SETTINGS_PATH.read_text(encoding="utf-8"))
    return {sid: ModelSettingsRequest.model_validate(value) if value is not None else None for sid, value in data.items()}


_sessions = load_settings()


def persist_settings():
    data = {sid: ({**config.model_dump(exclude={"api_key"}), "api_key": config.api_key.get_secret_value()} if config else None)
            for sid, config in _sessions.items()}
    with tempfile.NamedTemporaryFile(mode="w", encoding="utf-8", dir=SETTINGS_PATH.parent, prefix=".agent-settings-", suffix=".tmp", delete=False) as temp:
        temp.write(json.dumps(data, ensure_ascii=False, indent=2))
        temp_path = temp.name
    os.replace(temp_path, SETTINGS_PATH)


def resolve_settings(session_id: str, request: ModelSettingsRequest) -> ModelSettingsRequest:
    if request.api_key.get_secret_value().strip():
        return request.model_copy(update={"api_key": SecretStr(request.api_key.get_secret_value().strip())})
    previous = _sessions.get(session_id)
    if previous and previous.base_url == request.base_url:
        return request.model_copy(update={"api_key": previous.api_key})
    if session_id not in _sessions and settings.llm_api_key and request.base_url == settings.llm_base_url.rstrip("/"):
        return request.model_copy(update={"api_key": SecretStr(settings.llm_api_key)})
    raise ValueError("请填写 API Key；更换接口地址后须重新输入密钥。")


def provider_for_config(config: ModelSettingsRequest) -> OpenAICompatibleProvider:
    return OpenAICompatibleProvider(api_key=config.api_key.get_secret_value(), base_url=config.base_url, model=config.model)


def session_provider(session_id: str):
    if session_id not in _sessions:
        return None
    config = _sessions[session_id]
    return provider_for_config(config) if config else MockProvider()


def save_settings(session_id: str, request: ModelSettingsRequest) -> dict:
    with _settings_lock:
        _sessions[session_id] = resolve_settings(session_id, request)
        persist_settings()
    return public_settings(session_id)


def disable_model(session_id: str) -> dict:
    with _settings_lock:
        _sessions[session_id] = None
        persist_settings()
    return public_settings(session_id)


def public_settings(session_id: str) -> dict:
    config = _sessions.get(session_id)
    use_environment = session_id not in _sessions
    return {
        "mode": "ai" if config or (use_environment and settings.llm_provider != "mock") else "mock",
        "base_url": config.base_url if config else settings.llm_base_url,
        "model": config.model if config else settings.llm_model,
        "key_configured": bool(config and config.api_key.get_secret_value()) or bool(use_environment and settings.llm_api_key),
        "source": "session" if not use_environment else "environment",
        "storage": "设置保存在本机 .agent-local-settings.json，后端重启自动读取；文件已排除 Git。",
    }
