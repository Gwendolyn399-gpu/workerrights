import json
import logging
import os
from datetime import datetime, timezone
from logging.handlers import RotatingFileHandler
from pathlib import Path
from threading import Lock

_lock = Lock()


def log_event(event: str, **fields):
    logger = logging.getLogger("workerrights.agent")
    with _lock:
        if not logger.handlers:
            folder = Path(os.environ.get("AGENT_LOG_DIR", str(Path(__file__).resolve().parents[3] / ".logs")))
            folder.mkdir(exist_ok=True, parents=True)
            handler = RotatingFileHandler(folder / "agent.jsonl", maxBytes=2_000_000, backupCount=2, encoding="utf-8")
            handler.setFormatter(logging.Formatter("%(message)s"))
            logger.addHandler(handler)
            logger.setLevel(logging.INFO)
            logger.propagate = False
    logger.info(json.dumps({"time": datetime.now(timezone.utc).isoformat(), "event": event, **fields}, ensure_ascii=True))
