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

from fastapi.testclient import TestClient  # noqa: E402

from backend.main import app  # noqa: E402


@pytest.fixture(scope="session")
def client():
    with TestClient(app) as test_client:
        yield test_client
    from backend.database.db import engine

    engine.dispose()
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
