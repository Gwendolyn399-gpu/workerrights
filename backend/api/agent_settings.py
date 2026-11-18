from fastapi import APIRouter, Depends, HTTPException
from pydantic import ValidationError

from backend.api.deps import get_session_id
from backend.agents.provider import ProviderError
from backend.agents.session_settings import (
    ModelSettingsRequest, disable_model, provider_for_config, public_settings,
    resolve_settings, save_settings,
)
from backend.agents.agent_v1.schemas import Respond, tool_definitions

router = APIRouter(prefix="/agent/settings", tags=["Agent 调试设置"])


@router.get("")
def get_settings(session_id: str = Depends(get_session_id)):
    return public_settings(session_id)


@router.put("")
def update_settings(payload: ModelSettingsRequest, session_id: str = Depends(get_session_id)):
    try:
        return save_settings(session_id, payload)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.delete("")
def clear_settings(session_id: str = Depends(get_session_id)):
    return disable_model(session_id)


@router.post("/test")
def test_settings(payload: ModelSettingsRequest, session_id: str = Depends(get_session_id)):
    try:
        config = resolve_settings(session_id, payload)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    result = provider_for_config(config).complete(
        [{"role": "user", "content": "这是连接测试。请调用 respond，reply 为‘连接成功’，stage 为 waiting_user。"}],
        tool_definitions(), final=True,
    )
    try:
        calls = result["message"]["tool_calls"]
        if len(calls) != 1 or calls[0]["function"]["name"] != "respond":
            raise ValueError("未返回 respond 工具")
        Respond.model_validate_json(calls[0]["function"]["arguments"])
    except (KeyError, TypeError, ValueError, ValidationError) as exc:
        raise ProviderError("连接有响应，但未通过 Agent 工具调用协议测试。") from exc
    return {"ok": True, "model": config.model, "usage": result.get("usage", {}),
            "note": "连接及单次工具调用通过，尚未启用设置；多轮质量仍需用案例测试。"}
