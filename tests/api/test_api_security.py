import uuid


def test_invalid_session_rejected(client):
    response = client.get("/api/v1/cases")
    assert response.status_code == 400
    response = client.get("/api/v1/cases", headers={"X-Session-Id": "short"})
    assert response.status_code == 400


def test_cases_are_isolated_between_sessions(client):
    session_a = f"session-a-{uuid.uuid4()}"
    session_b = f"session-b-{uuid.uuid4()}"
    headers_a = {"X-Session-Id": session_a}
    headers_b = {"X-Session-Id": session_b}
    case = client.post("/api/v1/cases", headers=headers_a, json={}).json()["case"]
    case_id = case["id"]

    assert client.get(f"/api/v1/cases/{case_id}", headers=headers_b).status_code == 404
    assert (
        client.post(
            f"/api/v1/cases/{case_id}/messages", headers=headers_b, json={"content": "你好"}
        ).status_code
        == 404
    )
    listing = client.get("/api/v1/cases", headers=headers_b).json()["cases"]
    assert case_id not in {item["id"] for item in listing}
    assert client.delete(f"/api/v1/cases/{case_id}", headers=headers_b).status_code == 404


def test_delete_case_removes_messages(client):
    headers = {"X-Session-Id": f"delete-{uuid.uuid4()}"}
    case = client.post("/api/v1/cases", headers=headers, json={}).json()["case"]
    case_id = case["id"]
    deleted = client.delete(f"/api/v1/cases/{case_id}", headers=headers)
    assert deleted.status_code == 200
    assert deleted.json()["deleted"] is True
    assert client.get(f"/api/v1/cases/{case_id}", headers=headers).status_code == 404


def test_demo_case_is_fictional_and_complete(client):
    headers = {"X-Session-Id": f"demo-{uuid.uuid4()}"}
    response = client.post("/api/v1/cases/demo", headers=headers)
    assert response.status_code == 201
    case = response.json()["case"]
    assert case["is_demo"] is True
    assert "虚构演示" in case["title"]
    assert case["facts"]["owed_amount"] == 20000
    assert case["intake"]["confirmed"] is True
    assert case["messages"]
    plan = client.get(f"/api/v1/cases/{case['id']}/action-plan", headers=headers)
    assert len(plan.json()["steps"]) == 8


def test_meta_reports_mock_provider_and_scope(client):
    meta = client.get("/api/v1/meta").json()
    assert meta["service_region"] == "河南省"
    assert meta["provider"]["is_mock"] is True
    assert "未连接大模型" in meta["provider"]["display_name"]
    assert any(item["status"] == "available" for item in meta["scenes"])
    assert any(item["status"] == "coming_soon" for item in meta["scenes"])
    assert meta["privacy"]["stores_id_card"] is False
