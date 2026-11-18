"""Live model + real HTTP routes + isolated SQLite; synthetic cases only."""
import json
import os
import sys
import uuid
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
folder = ROOT / ".logs" / "eval"
folder.mkdir(parents=True, exist_ok=True)
run_id = uuid.uuid4().hex[:12]
os.environ["DATABASE_URL"] = f"sqlite:///{(folder / ('api-' + run_id + '.db')).as_posix()}"
os.environ["AGENT_SETTINGS_FILE"] = str(folder / ("settings-" + run_id + ".json"))

from fastapi.testclient import TestClient
from backend.main import app

headers = {"X-Session-Id": "eval-" + run_id}
rows = []


def send(client, case_id, text, *, stream=False):
    path = f"/api/v1/cases/{case_id}/messages" + ("/stream" if stream else "")
    response = client.post(path, headers=headers, json={"content": text})
    response.raise_for_status()
    if stream:
        events = [json.loads(line[6:]) for line in response.text.splitlines() if line.startswith("data: ")]
        assert events[-1]["type"] == "done", events[-1]
        assert any(event["type"] == "reply_snapshot" for event in events)
        data = events[-1]["result"]
    else:
        data = response.json()
    rows.append({"user": text, "reply": data["assistant_message"]["content"],
                 "facts": data["case"]["facts"], "intake": data["case"]["intake"], "stream": stream})
    return data["case"]


with TestClient(app) as client:
    case_id = client.post("/api/v1/cases", headers=headers, json={}).json()["case"]["id"]
    case = send(client, case_id, "虚构测试：郑州金水区工地，工资应发7000，累计收到1000，还欠6000。先协商，不方便打电话，只能晚上文字联系。", stream=True)
    assert case["facts"]["paid_amount"] == 1000
    assert case["facts"]["owed_amount"] == 6000
    assert "协商" in case["intake"]["agent_memory"]["goal"]
    case = send(client, case_id, "他承诺周六先付2000，但还没到账。这个进度记住，先别问我。")
    assert case["facts"]["paid_amount"] == 1000
    assert case["facts"]["owed_amount"] == 6000
    assert case["intake"]["agent_memory"]["events"]

# Recreate the HTTP app client: no AgentState or model instance carried forward.
with TestClient(app) as client:
    restored = client.get(f"/api/v1/cases/{case_id}", headers=headers).json()["case"]
    assert restored["intake"]["agent_memory"] == case["intake"]["agent_memory"]
    restored = send(client, case_id, "只复述我的目标、联系限制和对方的付款承诺，别提问。", stream=True)
    assert "晚上" in rows[-1]["reply"]
    assert "2000" in rows[-1]["reply"] or "两千" in rows[-1]["reply"]
    other_id = client.post("/api/v1/cases", headers=headers, json={}).json()["case"]["id"]
    other = send(client, other_id, "我在这个案件里告诉过你工资数字吗？没有就说没有，不要猜。")
    assert other["facts"]["owed_amount"] is None
    assert "6000" not in rows[-1]["reply"]

output = folder / "api-final.json"
output.write_text(json.dumps({"synthetic_only": True, "passed": True, "turns": rows,
                              "checks": ["real_sse_snapshots_and_done", "facts_saved", "promise_not_payment", "memory_survives_client_recreation", "case_isolation"]}, ensure_ascii=False, indent=2), encoding="utf-8")
print(f"PASS: {len(rows)} live turns; SSE, persistence, promise vs payment, case isolation.")
