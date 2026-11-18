import os
import sys
import uuid
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

TEST_DB = ROOT / "test_workerrights.db"
for suffix in ("", "-wal", "-shm"):
    candidate = Path(f"{TEST_DB}{suffix}")
    if candidate.exists():
        candidate.unlink()
os.environ["DATABASE_URL"] = f"sqlite:///{TEST_DB.as_posix()}"
os.environ["LLM_PROVIDER"] = "mock"
os.environ["LLM_API_KEY"] = ""
os.environ["AGENT_SETTINGS_FILE"] = str(ROOT / "test_agent_settings.json")
os.environ["AGENT_LOG_DIR"] = str(ROOT / ".logs" / "tests")

from fastapi.testclient import TestClient  # noqa: E402

from backend.main import app  # noqa: E402


@pytest.fixture(autouse=True)
def isolate_existing_protocol_tests(request, monkeypatch):
    # These existing suites deliberately script only business tool responses.
    # Scope routing/review is exercised separately in test_scope_boundary.py,
    # including its HTTP integration, and by the live evaluation scripts.
    if request.path.name in {"test_agent_v1.py", "test_agent_stream.py", "test_agent_settings.py"}:
        from backend.agents.agent_v1.runtime import AgentRuntime
        monkeypatch.setattr("backend.agents.agent_v1.intake.ScopedAgentRuntime", AgentRuntime)


@pytest.fixture(scope="session")
def client():
    with TestClient(app) as test_client:
        yield test_client
    from backend.database.db import engine

    engine.dispose()
    from backend.agents.session_settings import SETTINGS_PATH
    if SETTINGS_PATH.exists():
        SETTINGS_PATH.unlink()
    for suffix in ("", "-wal", "-shm"):
        candidate = Path(f"{TEST_DB}{suffix}")
        if candidate.exists():
            candidate.unlink()


@pytest.fixture
def session_id() -> str:
    return f"test-{uuid.uuid4()}"


@pytest.fixture
def headers(session_id: str) -> dict:
    return {"X-Session-Id": session_id}
