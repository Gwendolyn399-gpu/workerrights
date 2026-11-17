def _send(client, headers, case_id, text):
    response = client.post(
        f"/api/v1/cases/{case_id}/messages", headers=headers, json={"content": text}
    )
    assert response.status_code == 200, response.text
    return response.json()


def test_construction_wage_arrears_end_to_end(client, headers):
    created = client.post("/api/v1/cases", headers=headers, json={})
    assert created.status_code == 201
    case = created.json()["case"]
    assert case["messages"]
    assert "X-Session-Id" not in case
    case_id = case["id"]

    _send(client, headers, case_id, "我在郑州金水区一个工地干了三个月，老板还欠我两万多。")
    _send(client, headers, case_id, "钢筋工，包工头王老板介绍的，平时也是他安排活。")
    _send(client, headers, case_id, "按天算，一天350。")
    _send(client, headers, case_id, "一共两万六，给了六千，还欠两万。")
    _send(client, headers, case_id, "没签合同。")
    _send(client, headers, case_id, "有微信聊天、考勤记录和两个工友作证。")
    _send(client, headers, case_id, "不知道项目名称。")
    result = _send(client, headers, case_id, "没找过。")
    assert result["next_question"]["key"] == "confirm"

    confirmed = _send(client, headers, case_id, "信息无误，生成分析")
    assert confirmed["case"]["status"] == "ready"
    assert confirmed["case"]["intake"]["confirmed"] is True
    assert confirmed["next_question"] is None

    facts = confirmed["case"]["facts"]
    assert facts["location_city"] == "郑州市"
    assert facts["location_district"] == "金水区"
    assert facts["work_type"] == "钢筋工"
    assert facts["duration_months"] == 3
    assert facts["daily_wage"] == 350
    assert facts["agreed_amount"] == 26000
    assert facts["paid_amount"] == 6000
    assert facts["owed_amount"] == 20000
    assert facts["has_contract"] == "no"
    assert set(facts["evidence"]) >= {"chat", "attendance", "witness"}
    assert facts["project_info_status"] == "unknown"
    assert facts["prior_report"] == "no"
    assert facts["user_statement"]

    analysis = client.get(f"/api/v1/cases/{case_id}/analysis", headers=headers)
    assert analysis.status_code == 200
    analysis_data = analysis.json()
    assert analysis_data["basic_info"]
    assert analysis_data["relationship"]["nodes"][-1]["label"].startswith("劳动者")
    assert any(item["id"] == "mwpr-30" for item in analysis_data["legal_analysis"])
    assert any(item["level"] == "attention" for item in analysis_data["risk_flags"])
    assert analysis_data["jurisdiction"]["city"] == "郑州市"

    plan = client.get(f"/api/v1/cases/{case_id}/action-plan", headers=headers)
    assert plan.status_code == 200
    plan_data = plan.json()
    assert len(plan_data["steps"]) == 8
    assert plan_data["primary_channel_id"] == "local-labor-supervision"
    assert plan_data["evidence_directory"]
    assert "【" not in plan_data["formal_statement"] or "填写日期" in plan_data["formal_statement"]

    step_id = plan_data["steps"][0]["id"]
    updated = client.patch(
        f"/api/v1/cases/{case_id}/action-plan/steps/{step_id}",
        headers=headers,
        json={"done": True},
    )
    assert updated.status_code == 200
    assert updated.json()["steps"][0]["done"] is True
    assert updated.json()["progress"]["done"] == 1

    form = client.get(f"/api/v1/cases/{case_id}/form-assistant", headers=headers)
    assert form.status_code == 200
    form_data = form.json()
    assert len(form_data["steps"]) == 7
    fields = {
        field["key"]: field for step in form_data["steps"] for field in step["fields"]
    }
    assert fields["owed_amount"]["value"] == "2万元"
    assert fields["reporter_id"]["status"] == "official_only"
    assert fields["description"]["value"]

    for fmt, signature in (("docx", b"PK"), ("pdf", b"%PDF")):
        export = client.get(f"/api/v1/cases/{case_id}/export/{fmt}", headers=headers)
        assert export.status_code == 200
        assert export.content.startswith(signature)
        assert "attachment" in export.headers["content-disposition"]


def test_facts_update_recomputes_and_keeps_session(client, headers):
    case = client.post("/api/v1/cases", headers=headers, json={}).json()["case"]
    case_id = case["id"]
    response = client.patch(
        f"/api/v1/cases/{case_id}/facts",
        headers=headers,
        json={
            "facts": {
                "location_city": "郑州市",
                "location_district": "金水区",
                "work_type": "木工",
                "duration_text": "2个月",
                "owed_amount": 18000,
                "evidence": ["chat"],
            }
        },
    )
    assert response.status_code == 200
    data = response.json()
    assert data["case"]["facts"]["work_type"] == "木工"
    assert data["case"]["facts"]["owed_amount"] == 18000
    assert data["next_question"] is not None
    invalid = client.patch(
        f"/api/v1/cases/{case_id}/facts",
        headers=headers,
        json={"facts": {"unknown_field": "x"}},
    )
    assert invalid.status_code == 400
