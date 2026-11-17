# 系统架构

## 1. 总览

```text
浏览器（Next.js 15 / React 19）
  ├─ 首页、案件列表
  ├─ 对话接待 /case/[id]
  ├─ 案件分析 /analysis
  ├─ 行动指南 /action-plan
  └─ 官方填报辅助 /form-assistant
        │  fetch /api/py/*（同源，自动带 X-Session-Id）
        ▼
Next.js rewrite → http://127.0.0.1:8000/api/v1/*
        ▼
FastAPI
  ├─ api/router.py          路由与权限边界
  ├─ agents/orchestrator.py 五 Agent 编排
  ├─ services/              金额、事实、陈述、导出、演示
  ├─ rules/                 地区、证据
  ├─ legal/                 加载 + 中文检索
  └─ database/              SQLAlchemy / SQLite 种子
        ▼
SQLite workerrights.db
  ├─ cases / messages / action_steps（用户数据）
  └─ legal_documents / legal_provisions / regions / channels（种子）
        ▲
knowledge/*.json（事实来源，启动时幂等写入）
```

前端不直接读取法律 JSON，也不在 UI 中硬编码法条。所有法律依据由后端检索后附带元数据返回。

## 2. 前端

- **App Router**：`/app/page.tsx`、`/app/cases`、`/app/case/[id]` 及三个子页。
- **CaseProvider**：加载案件，维护事实/消息/进度/错误状态；通过 `services/api.ts` 调用后端。
- **会话**：`lib/session.ts` 在 `localStorage` 生成匿名 UUID，所有请求带 `X-Session-Id`。
- **事实展示**：`lib/facts.ts` 只负责展示层格式化，不产生法律结论。
- **语音**：`hooks/use-speech-recognition.ts` 封装浏览器 Web Speech API；不支持时不显示入口。
- **弹窗**：`components/ui/modal.tsx` 通过 Portal 挂到 `document.body`，避免侧栏 sticky 堆叠上下文遮挡。
- **导出**：通过同源 `/api/py/.../export/{fmt}` 获取 blob，不把用户文书上传第三方。
- **不做**：不在客户端保存 API Key；不渲染不可信 HTML（消息为纯文本）。

## 3. 后端模块

| 模块 | 职责 |
| --- | --- |
| `api/deps.py` | 校验会话 ID；跨会话统一 404，避免枚举 |
| `api/router.py` | 案件 CRUD、对话、事实、分析、计划、表单、导出、知识库查询 |
| `api/serializers.py` | 统一案件/消息/摘要结构 |
| `agents/questions.py` | 单个问题的文案、快捷回复、是否多选 |
| `agents/intake.py` | 一次一问状态机、跳过/不知道、确认、事实合并 |
| `agents/legal_research.py` | 组合核心条文与检索结果，附关联理由和核验标签 |
| `agents/case_analysis.py` | 关系图、证据分类、权利、风险、管辖、摘要 |
| `agents/action_planning.py` | 8 步计划、渠道、期限、草稿；事实签名变更时重建 |
| `agents/form_assistant.py` | 7 步/18 字段填报草稿，身份证等标记“仅官方填写” |
| `agents/provider.py` | 模型适配层；默认 Mock，云端润色适配器预留 |
| `services/amounts.py` | 中文/阿拉伯数字金额、口语“两万六”、约数、工期解析 |
| `services/fact_extractor.py` | 保守规则抽取，未知保持为空 |
| `services/facts.py` | 事实标签、金额/地点/工期格式化、进度、关系图 |
| `services/statement.py` | 正式陈述、简短描述、证据目录、微信确认话术 |
| `services/export.py` | DOCX/PDF/TXT |
| `services/demo.py` | 虚构郑州金水区案例 |
| `rules/regions.py` | 河南 18 地市、区县识别与别名；不做无依据的机构假设 |
| `rules/evidence.py` | 证据目录和四分类分析 |

## 4. 数据模型

### 用户数据

- `cases`
  - `id`、`session_id`、`scene`、`title`、`status`（collecting/ready/planned）
  - `is_demo`、`facts`(JSON)、`facts_meta`(JSON)、`intake`(JSON)
  - `plan_generated_at`、`created_at`、`updated_at`
- `messages`
  - `case_id`、`role`、`content`、`meta`(JSON)、`created_at`
- `action_steps`
  - `case_id`、`step_key`、`position`、`title/why/prepare`、`channel_id`、`legal_basis`、`deadline_note`、`risk_note`、`draft_text`、`done`

`facts`、`facts_meta`、`intake`、`meta` 使用 SQLAlchemy `MutableDict`，保证原地更新能被持久化。删除案件级联删除消息与步骤。

### 知识数据

- `legal_documents`：法律/政策元数据、官方链接、核验状态。
- `legal_provisions`：条文、主题、关键词、核验状态。
- `regions`：省/市/区县、行政代码、别名。
- `channels`：官方渠道、适用事项、访问方式、核验状态。

## 5. 请求与状态流

1. `POST /cases` 创建匿名案件并返回第一个问题。
2. `POST /cases/{id}/messages` 抽取事实、更新状态、返回下一个问题或确认。
3. 用户确认后 `status=ready`。
4. `GET /analysis` 实时生成分析，不把结论写回事实。
5. `GET /action-plan` 按事实签名生成/复用 8 步计划，并持久化勾选状态。
6. `GET /form-assistant` 生成填报草稿。
7. `GET /export/{fmt}` 在内存生成文书。

分析、法律、计划、表单是**读时生成**；只有事实、消息、计划步骤和完成状态落库。这样事实修改后无需复杂迁移，计划会按签名重建。

## 6. 安全与隐私设计

- **会话隔离**：所有案件查询都带 `session_id` 条件；不属于当前会话返回 404。
- **数据最小化**：不采集身份证号、银行卡号；不实现上传。
- **密钥**：仅后端环境变量读取，前端无 `NEXT_PUBLIC_*` 密钥。
- **日志**：默认不打印案件全文或敏感字段。
- **导出**：服务端内存生成，不写入公开目录。
- **外部调用**：默认不调用任何外部 AI；知识库检索完全本地。
- **法律边界**：结论使用“可能/需核实”，复杂案件提示法律援助；不承诺结果。

## 7. 数据库升级路径

当前 SQLite 适合本机演示。升级 PostgreSQL + pgvector 时：

1. 将 `DATABASE_URL` 改为 PostgreSQL 连接串。
2. 用 Alembic 或 SQL 迁移创建同等表结构。
3. 将 `backend/database/vector_store.py` 的说明落地：为条文增加 embedding 列与 HNSW/IVFFlat 索引。
4. 保留关键词检索作为混合召回，避免嵌入模型不可用时无法检索。
5. 将种子导入改为部署任务，并记录数据版本与核验时间。

当前未安装 PostgreSQL/Docker，也未启用向量嵌入，相关能力不宣称可用。

## 8. 已知架构限制

- 单进程 SQLite，不适合多用户生产并发。
- 无账号体系，清除浏览器存储即失去案件访问。
- 规则抽取覆盖有限口语表达；未覆盖表达会进入待核实或备注。
- 导出为同步生成，大案件未做队列化。
- 前端视觉脚本依赖本机 Chrome，不属于常规测试。
