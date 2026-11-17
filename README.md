# 工友权益助手（WorkerRights）

面向河南建筑工地欠薪场景的本地全栈原型，为 Hack4Good 准备。产品把“不会写、不知道找谁、材料说不清”的欠薪咨询拆成五步：对话式接待、法律检索、案件分析、行动规划、官方平台填报辅助。

> **当前状态：本地开发预览。**
> - 未部署公网，未发布到 Qoder Sites。
> - 未接入付费模型 API。默认使用本地规则引擎，界面明确标注“演示，未连接大模型”。
> - 不自动登录或提交任何政府网站，不收集身份证号，不承诺胜诉或追回工资。
> - 法律知识库中的河南地方资料仍待逐条核验，不能作为最终法律依据。

## 1. 已实现能力

- **首页**：产品定位、适用地区、五步流程、场景入口、隐私说明、虚构演示入口。
- **对话式接待**：一次只问一个问题；支持快捷回复、语音输入（浏览器 Web Speech API，不可用时自动隐藏）、事实修改、进度展示、法律来源入口。
- **事实整理**：从自然语言中保守抽取地点、工种、工期、招用/管理主体、工资算法、应发/已付/欠发、合同、证据、项目信息、此前投诉情况。金额不确定时保留“约”，不知道的字段保持待核实。
- **五 Agent 模块**：接待、法律检索、案件分析、行动规划、填报助手，各有独立职责，不使用巨型系统提示词。
- **法律检索**：本地 JSON 知识库 + SQLite 种子数据 + 中文 bigram/BM25 风格检索；每条结论带法律名称、条文、发布机关、文号、地区、时效、官方链接和核验状态。
- **案件分析**：基本信息、用工关系图、证据四分类（已有/可补/需要固定/暂缺）、权利主张、可能适用法条、风险提示、管辖与渠道建议。
- **行动指南**：8 个可勾选步骤、期限与风险提示、投诉渠道、微信沟通草稿、正式事实陈述、证据目录。
- **填报辅助**：全国根治欠薪线索反映平台的 7 步/18 字段整理，逐字段说明、值、状态、复制操作；只辅助整理，不自动提交。
- **导出**：DOCX、PDF、TXT（中文 PDF 已实测可渲染）。
- **隐私隔离**：匿名 `X-Session-Id`，跨会话读取返回 404；支持删除案件；不收集身份证号；密钥只在服务端环境变量。

## 2. 技术栈

| 层 | 实现 |
| --- | --- |
| 前端 | Next.js 15 App Router、React 19、TypeScript、Tailwind CSS 3、手写 shadcn 风格组件、lucide-react |
| 后端 | FastAPI、SQLAlchemy 2、Pydantic v2、Uvicorn |
| 数据库 | 默认 SQLite（`workerrights.db`）；PostgreSQL + pgvector 为文档化升级路径，本机未启用 |
| 知识库 | `knowledge/` JSON → SQLite；中文检索，不依赖模型记忆生成法条 |
| 文书导出 | python-docx、ReportLab（STSong-Light 中文字体） |
| 测试 | pytest（后端）、Vitest（前端工具函数）、Playwright 脚本（可选浏览器流程验证） |

## 3. 目录结构

```text
Qoder-innovation/
├─ backend/
│  ├─ agents/            # 五个 Agent、编排器、模型适配层、问题定义
│  ├─ api/               # 路由、会话依赖、序列化、请求模型
│  ├─ database/          # 引擎、初始化、种子数据、pgvector 升级说明
│  ├─ legal/             # 知识库加载与中文检索
│  ├─ models/            # Case / Message / ActionStep / 法律 / 地区 / 渠道
│  ├─ rules/             # 地区匹配、证据目录
│  ├─ services/          # 金额解析、事实抽取、陈述与证据目录、导出、演示案件
│  ├─ config.py
│  ├─ main.py
│  └─ requirements.txt
├─ frontend/
│  ├─ app/               # 首页、案件列表、对话、分析、行动指南、填报助手
│  ├─ components/        # 案件组件、首页组件、UI 基础组件
│  ├─ hooks/             # 语音识别
│  ├─ lib/               # 会话、事实展示、工具函数
│  ├─ services/          # API 封装
│  ├─ types/             # API 类型
│  ├─ scripts/           # 可选 Playwright 视觉/流程检查脚本
│  ├─ next.config.mjs    # /api/py → FastAPI 重写
│  └─ vitest.config.ts
├─ knowledge/
│  ├─ national/          # 5 部国家层面法律/行政法规
│  ├─ henan/             # 河南待核验政策条目、18 地市与区县
│  └─ official_channels/ # 官方渠道、根治欠薪平台字段结构
├─ tests/
│  ├─ agent/             # 接待流程、金额/事实抽取
│  ├─ legal/             # 法律种子、检索、地区、渠道
│  ├─ api/               # 会话隔离、删除、演示案件、元信息
│  └─ frontend/          # 事实展示与格式化函数
├─ docs/                 # 架构、需求、Agent、法律数据、API、状态、Sites 迁移
├─ .env.example
├─ README.md
└─ workerrights.db       # 运行时生成，不提交
```

## 4. 本地启动

要求：Python 3.11+、Node.js 20+。以下命令在项目根目录执行。

### 4.1 后端

PowerShell：

```powershell
py -3 -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r backend\requirements.txt
python -m backend.database.init_db
uvicorn backend.main:app --host 127.0.0.1 --port 8000
```

Git Bash：

```bash
python -m venv .venv
source .venv/Scripts/activate
pip install -r backend/requirements.txt
python -m backend.database.init_db
uvicorn backend.main:app --host 127.0.0.1 --port 8000
```

首次启动会自动建表并写入法律、地区、渠道种子数据。API 文档：<http://127.0.0.1:8000/docs>。

### 4.2 前端

另开一个终端：

```powershell
cd frontend
npm install
npm run dev
```

打开 <http://localhost:3000>。前端将 `/api/py/*` 代理到 `http://127.0.0.1:8000/api/v1/*`。

### 4.3 生产构建检查

```powershell
cd frontend
npm run build
```

## 5. 测试

```powershell
# 后端 16 项：Agent 流程、金额解析、法律检索、API 隔离、导出
.\.venv\Scripts\python.exe -m pytest tests -q

# 前端 6 项：金额/日期格式化、事实展示、缺失项
cd frontend
npm test
```

浏览器流程检查脚本需要本机 Chrome，并临时安装 `playwright-core`（未写入 `package.json`）：

```powershell
cd frontend
npm install --no-save playwright-core
node scripts/ui-flow.mjs
node scripts/visual-check.mjs
```

## 6. 环境变量

复制 `.env.example` 为 `.env`（可选）。后端启动时读取项目根目录或 `backend/` 下的 `.env`。

| 变量 | 默认值 | 说明 |
| --- | --- | --- |
| `DATABASE_URL` | 项目根目录 `workerrights.db` | SQLAlchemy 连接串 |
| `CORS_ORIGINS` | `http://localhost:3000,http://127.0.0.1:3000` | 逗号分隔 |
| `DEMO_MODE` | `true` | 演示标记 |
| `LOG_LEVEL` | `info` | 日志级别；不记录完整敏感信息 |
| `SERVICE_REGION` | `河南省` | 首期服务范围 |
| `MAX_UPLOAD_MB` | `10` | 为后续上传能力预留；当前未实现文件上传 |
| `LLM_PROVIDER` | `mock` | `mock` 为本地规则引擎；云端适配器为预留能力 |
| `LLM_API_KEY` | 空 | 仅服务端环境变量，禁止写入前端 |
| `LLM_BASE_URL` | `https://api.deepseek.com/v1` | OpenAI 兼容接口 |
| `LLM_MODEL` | `deepseek-chat` | 模型名 |
| `LLM_TIMEOUT_SECONDS` | `30` | 请求超时 |
| `BACKEND_URL` | `http://127.0.0.1:8000` | 仅前端构建/启动读取，用于代理目标 |

**模型说明**：默认 `mock` 是确定性规则引擎，不是大模型。`OpenAICompatibleProvider` 只预留了“语言润色”接口，当前业务流程未调用；在补充云端授权同意、数据最小化和输出校验前，不应启用真实模型。详见 [docs/agent-workflow.md](docs/agent-workflow.md)。

## 7. 法律数据核验状态（摘要）

- 5 部国家法律/行政法规：条文按公开发布文本整理，状态为 `transcribed`；`last_verified_at` 均为空，发布日期、现行有效性仍需逐条对照官方原文。
- 河南地方资料：4 条全部 `pending`，包括最低工资标准、劳动保障监察指引、仲裁指南、法律援助指引；未写入具体最低工资数值。
- 全国根治欠薪平台字段结构：`pending`，字段名称与顺序待对照官方页面。
- 官方渠道：住建部门、法院入口为 `pending`；其余为 `transcribed`，仍需核验具体受理机构与地址。
- 区县数据：郑州区县带官方行政区划代码；其他地市区县列表已录入但代码多为空；不能假设每个区县都有独立劳动监察机构。

完整清单见 [docs/development-status.md](docs/development-status.md) 和 [docs/legal-data-schema.md](docs/legal-data-schema.md)。

## 8. 五个页面

| 页面 | 路径 | 作用 |
| --- | --- | --- |
| 首页 | `/` | 产品说明、场景入口、流程、隐私、演示 |
| 对话接待 | `/case/[id]` | 一次一问、快捷回复、语音、事实编辑、进度、法律来源 |
| 案件分析 | `/case/[id]/analysis` | 关系图、证据分类、权利、法条、风险、管辖、导出 |
| 行动指南 | `/case/[id]/action-plan` | 8 步任务、渠道、期限、沟通草稿、导出 |
| 官方填报辅助 | `/case/[id]/form-assistant` | 7 步字段整理、复制、隐私提示、导出 |

案件列表在 `/cases`。

## 9. 安全与合规边界

- 匿名会话隔离，不提供账号体系；清除浏览器存储会失去案件访问权。
- 不采集身份证号、银行卡号；姓名、电话仅在用户主动提供时用于草稿/表单辅助。
- 不实现文件上传；导出在服务端内存生成，不落盘保存用户文书。
- 不自动提交政府平台，不模拟政府页面，不伪造回执。
- 不生成“保证胜诉/保证追回”的承诺；复杂事实提示咨询法律援助或律师。
- 不提供暴力、威胁、堵门、伪造证据等建议。
- 演示案件明确标注“虚构演示”，使用化名和模糊地点。

## 10. 未实现 / 范围外

- 真实大模型对话、向量嵌入、pgvector 实际启用。
- PostgreSQL 本地实例、Docker 编排、生产级迁移工具。
- 文件/图片上传、OCR、对象存储、病毒扫描。
- 账号登录、跨设备同步、团队协作。
- 真实政府平台自动填报、自动提交、状态回执查询。
- 河南地方政策的正式核验与最低工资数值。
- 其他欠薪场景（装修、制造业、灵活用工等）的完整接待流程。
- 正式上线所需的等保、隐私政策、备案、运营审核（本阶段不部署）。

## 11. 文档索引

- [产品需求](docs/product-requirements.md)
- [系统架构](docs/architecture.md)
- [Agent 工作流](docs/agent-workflow.md)
- [法律数据规范](docs/legal-data-schema.md)
- [API 参考](docs/api-reference.md)
- [开发状态与核验清单](docs/development-status.md)
- [Qoder Sites 迁移说明](docs/qoder-sites-migration.md)

## 12. 许可证

本项目采用 [MIT License](LICENSE)。法律知识库中的法律、法规文本本身不受本项目许可证影响，引用时请以官方发布文本为准。
