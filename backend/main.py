from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.exceptions import RequestValidationError
from fastapi.exception_handlers import request_validation_exception_handler
from backend.agents.provider import ProviderError

from backend.api.router import router
from backend.api.agent_settings import router as agent_settings_router
from backend.api.agent_stream import router as agent_stream_router
from backend.config import settings
from backend.database.db import init_database


@asynccontextmanager
async def lifespan(_app: FastAPI):
    init_database()
    yield


app = FastAPI(
    title=settings.app_name,
    version=settings.app_version,
    description=(
        "面向河南建筑工地欠薪场景的劳动权益 Agent 原型。"
        "提供对话式案件接待、法律检索、案件分析、行动规划和官方填报辅助。"
    ),
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Content-Type", "X-Session-Id"],
)

app.include_router(router, prefix=settings.api_prefix)
app.include_router(agent_settings_router, prefix=settings.api_prefix)
app.include_router(agent_stream_router, prefix=settings.api_prefix)


@app.exception_handler(ProviderError)
async def provider_error_handler(_request, exc: ProviderError):
    return JSONResponse(status_code=502, content={"detail": str(exc)})


@app.exception_handler(RequestValidationError)
async def settings_validation_error(request, exc: RequestValidationError):
    if request.url.path.startswith(f"{settings.api_prefix}/agent/settings"):
        # Validation errors can otherwise echo the entire body, including an API key.
        return JSONResponse(status_code=422, content={"detail": [
            {key: error[key] for key in ("loc", "msg", "type")} for error in exc.errors()
        ]})
    return await request_validation_exception_handler(request, exc)


@app.get("/")
def root() -> dict:
    return {
        "name": settings.app_name,
        "version": settings.app_version,
        "docs": "/docs",
        "api_prefix": settings.api_prefix,
        "notice": "本服务为本地演示原型，不自动提交任何政府平台。",
    }
