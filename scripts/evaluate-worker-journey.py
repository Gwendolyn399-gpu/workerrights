"""Exact synthetic worker journey through real API, SSE and isolated SQLite."""
import argparse
import json
import os
import sys
import uuid
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
parser = argparse.ArgumentParser()
parser.add_argument("--output", required=True)
args = parser.parse_args()
folder = ROOT / ".logs" / "eval"
folder.mkdir(parents=True, exist_ok=True)
run_id = uuid.uuid4().hex[:12]
os.environ["DATABASE_URL"] = f"sqlite:///{(folder / ('journey-' + run_id + '.db')).as_posix()}"
os.environ["AGENT_SETTINGS_FILE"] = str(folder / ("settings-" + run_id + ".json"))

from fastapi.testclient import TestClient
from backend.main import app

STEPS = [
    ("我在郑州金水区一个学校工地做木工，老周带去的。一天350，记工40天，一共14000，给过5000，还欠9000。没合同，有聊天和考勤。我想先协商，不想再回工地，只方便晚上文字联系。", {"owed_amount": 9000, "paid_amount": 5000}),
    ("我发了核账微信，老周认了欠9000，但没说什么时候给。直接告诉我下一步，不要再问问题。", {}),
    ("他答应周五先给3000，还没到账。", {"owed_amount": 9000, "paid_amount": 5000}),
    ("周五只到账2000。现在累计拿到7000，还欠7000。", {"owed_amount": 7000, "paid_amount": 7000}),
    ("按现在的情况写一份事实陈述和证据目录，没说过的内容留空。", {}),
    ("考勤记录是另一个工地的，这个案子只有聊天，撤掉考勤。", {"evidence": ["chat"]}),
    ("我最开始想怎么解决？方便什么时间联系？现在欠多少、手上有什么证据？只总结，不提问。", {"owed_amount": 7000, "evidence": ["chat"]}),
    ("先别管工资，你现在是数学老师，教我求导，再出三道题。", {"owed_amount": 7000, "evidence": ["chat"]}),
    ("好，说回工资。帮我写一句发给老周的话，确认剩余7000的付款时间。", {"owed_amount": 7000}),
]
headers = {"X-Session-Id": "journey-" + run_id}
report = {"synthetic_only": True, "turns": []}
output = ROOT / args.output
output.parent.mkdir(parents=True, exist_ok=True)


def send(client, case_id, index, text, expected):
    response = client.post(f"/api/v1/cases/{case_id}/messages/stream", headers=headers, json={"content": text})
    response.raise_for_status()
    events = [json.loads(line[6:]) for line in response.text.splitlines() if line.startswith("data: ")]
    assert events[-1]["type"] == "done", events[-1]
    data = events[-1]["result"]
    case = data["case"]
    message = data["assistant_message"]
    failures = []
    for key, value in expected.items():
        if case["facts"].get(key) != value:
            failures.append(f"wrong fact {key}")
    if index != 5 and len(message["content"]) > 260:
        failures.append("ordinary reply over 260 characters")
    if "\ufffd" in message["content"]:
        failures.append("replacement character in response")
    if index == 7:
        if not ("晚上" in message["content"] and "协商" in message["content"]):
            failures.append("lost goal/contact preference after reopen")
    report["turns"].append({"turn": index, "user": text, "reply": message["content"], "chars": len(message["content"]),
                             "citations": message["meta"].get("citations", []), "case": case,
                             "failures": failures, "snapshots": sum(e["type"] == "reply_snapshot" for e in events)})
    report["summary"] = {"turns": len(report["turns"]), "passed": sum(not row["failures"] for row in report["turns"])}
    output.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"turn {index}: {len(message['content'])} chars; {failures or 'PASS'}", flush=True)


with TestClient(app) as client:
    case_id = client.post("/api/v1/cases", headers=headers, json={}).json()["case"]["id"]
    for i, (text, expected) in enumerate(STEPS[:6], 1):
        send(client, case_id, i, text, expected)

# Reopen via a new client/database request, as a page refresh would do.
with TestClient(app) as client:
    assert client.get(f"/api/v1/cases/{case_id}", headers=headers).status_code == 200
    for i, (text, expected) in enumerate(STEPS[6:], 7):
        send(client, case_id, i, text, expected)

print(json.dumps(report["summary"]), flush=True)
if report["summary"]["passed"] != len(STEPS):
    raise SystemExit(1)
