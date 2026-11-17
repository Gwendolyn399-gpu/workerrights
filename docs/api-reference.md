# API 参考（v0.1）

- Base URL（直连后端）：`http://127.0.0.1:8000/api/v1`
- 前端代理：`/api/py/*` → `http://127.0.0.1:8000/api/v1/*`
- 交互文档：`http://127.0.0.1:8000/docs`
- 内容类型：`application/json`（导出除外）

## 1. 会话头

除知识库/地区/渠道查询外，案件接口需要：

```http
X-Session-Id: <8–64 位字母、数字、下划线或连字符>
```

前端使用 `crypto.randomUUID()` 生成并保存在 `localStorage`。缺失或格式错误返回 `400`；案件不属于当前会话统一返回 `404`，不暴露是否存在。

## 2. 通用错误

| 状态码 | 场景 |
| --- | --- |
| `400` | 缺少/无效会话、非法字段、非法证据类型、不支持场景 |
| `404` | 案件不存在或无权访问 |
| `422` | 消息为空、请求体校验失败 |
| `500` | 未预期服务端错误（不返回敏感堆栈给前端） |

---

## 3. 健康与元信息

### `GET /health`

```json
{
  "status": "ok",
  "service": "WorkerRights API",
  "provider": {
    "provider_id": "mock",
    "display_name": "本地规则引擎（演示，未连接大模型）",
    "is_mock": true,
    "note": "..."
  },
  "time": "..."
}
```

### `GET /meta`

返回产品名、服务地区、场景列表、城市、证据目录、隐私说明、限制与免责声明、Provider 信息。前端据此渲染场景可用状态和证据选项。

---

## 4. 案件

### `POST /cases`

创建案件并返回第一条接待消息与第一个问题。

请求体可省略：

```json
{ "scene": "construction_wage_arrears" }
```

响应 `201`：

```json
{
  "case": {
    "id": "...",
    "title": "新的欠薪咨询",
    "status": "collecting",
    "facts": { "...": null },
    "intake": { "confirmed": false },
    "progress": { "done": 0, "total": 11, "percent": 0 },
    "messages": [ ... ]
  },
  "provider": { "is_mock": true }
}
```

### `GET /cases`

返回当前会话的案件摘要列表，按更新时间倒序。

### `GET /cases/{case_id}`

返回完整案件（事实、消息、进度、计划完成度）。跨会话 `404`。

### `DELETE /cases/{case_id}`

删除案件及消息/步骤。

```json
{ "deleted": true, "case_id": "..." }
```

### `POST /cases/demo`

创建明确标注“虚构演示”的郑州金水区案件，已完成接待并确认，可直接查看分析、行动指南、填报助手。

```json
{ "case": { "is_demo": true, "...": "..." }, "is_demo": true }
```

---

## 5. 对话

### `POST /cases/{case_id}/messages`

```json
{ "content": "我在郑州金水区一个工地干了三个月，老板还欠我两万多。" }
```

响应：

```json
{
  "user_message": { "role": "user", "content": "..." },
  "assistant_message": {
    "role": "assistant",
    "content": "...",
    "meta": {
      "kind": "question",
      "question": {
        "key": "work_type",
        "text": "你在工地主要做什么活？",
        "quick_replies": [ { "label": "钢筋工", "value": "钢筋工" } ],
        "multi_select": false,
        "optional": false
      },
      "progress": { "...": "..." },
      "provider": "本地规则引擎（演示，未连接大模型）",
      "provider_is_mock": true
    }
  },
  "case": { "...": "..." },
  "next_question": { "...": "..." },
  "progress": { "...": "..." },
  "status": "collecting",
  "provider": { "...": "..." }
}
```

- `next_question.key` 为 `confirm` 时，可发送“信息无误，生成分析”。
- 确认后 `status=ready`，普通消息不再改写关键事实。
- 语音在前端转文字后调用本接口。

---

## 6. 事实

### `PATCH /cases/{case_id}/facts`

```json
{
  "facts": {
    "location_city": "郑州市",
    "location_district": "金水区",
    "work_type": "木工",
    "duration_text": "2个月",
    "owed_amount": 18000,
    "evidence": ["chat", "attendance"]
  }
}
```

- 只允许编辑白名单字段；未知字段 `400`。
- 数字字段校验类型；合同/此前投诉校验枚举；证据校验目录 key。
- 城市变更会校验区县是否属于该市；不属于则清空区县。
- 修改后返回案件、进度、下一问题。

---

## 7. 分析与法律依据

### `GET /cases/{case_id}/legal-basis`

返回检索查询、条文列表、文档列表、核验统计、免责声明。

### `GET /cases/{case_id}/analysis`

返回：

- `basic_info`
- `relationship`（节点/边，未知节点保留）
- `evidence_analysis`（四类）
- `rights`
- `legal_analysis`
- `risk_flags`
- `jurisdiction`
- `summary`

---

## 8. 行动指南

### `GET /cases/{case_id}/action-plan`

生成或复用 8 步计划，并返回：

- `steps`（`id/step_key/title/why/prepare/channel/deadline_note/risk_note/legal_basis/draft_text/done`）
- `channels`
- `progress`
- `formal_statement`
- `evidence_directory`
- `plan_generated_at`

### `PATCH /cases/{case_id}/action-plan/steps/{step_id}`

```json
{ "done": true }
```

返回更新后的完整计划与进度。`step_id` 必须属于当前案件。

---

## 9. 填报辅助

### `GET /cases/{case_id}/form-assistant`

返回：

```json
{
  "platform": {
    "name": "全国根治欠薪线索反映平台",
    "official_url": "https://www.mohrss.gov.cn/",
    "verification_status": "pending",
    "access_note": "...",
    "source_note": "..."
  },
  "steps": [
    {
      "id": "step-1",
      "title": "...",
      "goal": "...",
      "tips": [],
      "fields": [
        {
          "key": "owed_amount",
          "label": "欠薪金额",
          "value": "2万元",
          "status": "ready",
          "note": "...",
          "copy_text": "2万元"
        }
      ]
    }
  ],
  "progress": { "ready": 12, "total": 18, "percent": 67 },
  "formal_statement": "...",
  "short_description": "...",
  "evidence_directory": [],
  "copy_summary": "...",
  "privacy_notice": "...",
  "submit_notice": "本页面只辅助整理填报内容，不会自动登录、自动上传或代替你提交。"
}
```

字段状态：`ready` 可填写、`missing` 待补充、`verify` 需核对、`official_only` 仅官方填写。

未确认案件会带 `preliminary=true` 与提示。

---

## 10. 导出

### `GET /cases/{case_id}/export/{fmt}`

`fmt`：`docx` | `pdf` | `txt`

- 返回文件流；`Content-Disposition: attachment; filename="workerrights-case-<id>.<fmt>"`。
- DOCX 为 `PK` 开头；PDF 为 `%PDF` 开头；TXT 为 UTF-8。
- 导出内容包含案件事实、证据目录、分析、法律依据、行动步骤。
- 文件在内存生成，不写入公开目录。

---

## 11. 知识库与地区

### `GET /legal/search?q=...&top_k=8`

无会话要求。`q` 1–300 字，`top_k` 1–20。返回条文、得分、文档元数据、官方链接、核验状态。

### `GET /legal/documents`

返回法律/政策文档列表与状态说明。

### `GET /regions/henan`

返回省、18 地市、区县名称、行政代码（部分为空）；附管辖提示。

### `GET /channels`

返回官方渠道、类别、适用事项、访问方式、管辖规则、核验状态。

---

## 12. 前端调用示例

```ts
const BASE = "/api/py";
const sessionId = localStorage.getItem("workerrights-session")!;

await fetch(`${BASE}/cases`, {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "X-Session-Id": sessionId,
  },
  body: JSON.stringify({ scene: "construction_wage_arrears" }),
});
```

下载：

```ts
const response = await fetch(`${BASE}/cases/${id}/export/pdf`, {
  headers: { "X-Session-Id": sessionId },
});
const blob = await response.blob();
```
