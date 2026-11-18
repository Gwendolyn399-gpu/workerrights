# 工友 Agent v1 使用与架构

2026-11-18口语与显示更新：日常回复通常40–140字，程序上限240字；仅本轮明确要求完整材料时用document展开。正文中的已知内部引用编号移到可展开来源；原始消息与引用元数据仍保留。对照测试、限制和复跑方法见`worker-language-review.md`。

当前真实AI入口已启用严格范围边界：`boundary.py`的ScopedAgentRuntime在原工具循环外进行入口分类及出口审查；网页、真实终端、真实模型评测统一使用该入口。后文较早版本的“生成中正文实时流出”已改为：状态实时更新，正文在范围审查通过后整段发布。

## 严格范围规则

- `off_topic`：程序返回固定身份/范围说明，不运行案件工具、不修改案件记忆。
- `urgent`：程序仅返回固定的现实求助转介，不进入医疗、救援、遗书或持续危机陪聊，不追问。
- `case`：处理具体劳动任务，候选答复经独立范围审查通过后才发布和提交其案件变更。
- `service`：可简短回答本服务问题或问候，但仅保存聊天，不更新案件事实、诉求和材料。
- 审查拒绝：丢弃候选正文及其事实/记忆/材料变更，明确显示“答复已拦截、案件未更新”。分类或审查协议失败则报错，没有默认放行。

严格边界使用单独的模型调用进行语义分类和答复审查，程序控制是否执行工具、提交变更及发布正文。语义识别仍可能误判，不能承诺所有输入均可正确判断。正常劳动任务通常增加两次检查调用，等待时间和API用量会增加。业务工具循环的原生模型流仍被消费，但未审查正文不向客户端转发；这不是逐字显示的流式答复。

原AgentRuntime保留为底层工具循环，供单元测试和显式离线脚本回放使用；线上真实AI入口不直接使用它。原有协议测试隔离范围模型，新`test_scope_boundary.py`独立验证入口、出口、HTTP接入和草稿不泄漏行为。

2026-11-17。第一版为可运行的原生工具调用循环，复用当前 Python/FastAPI/Pydantic/httpx；没有安装新的 Agent 平台。

## 架构依据

- [OpenAI Cookbook 工具调用示例](https://github.com/openai/openai-cookbook/blob/main/examples/How_to_call_functions_with_chat_models.ipynb)：模型选择工具和参数，应用执行，将观察结果交给模型继续循环。
- [Pydantic AI 客服示例](https://github.com/pydantic/pydantic-ai/blob/main/examples/pydantic_ai_examples/bank_support.py)：分离业务上下文、工具与类型化输出；本版用现有 Pydantic 实现同类边界，没有引入该框架。
- [LangGraph 中断说明](https://github.com/langchain-ai/docs/blob/main/src/oss/langgraph/interrupts.mdx)：借鉴暂停等待用户和状态恢复的设计。本版按消息边界保存状态，不引入节点重放和新的检查点系统。

只参考架构，没有复制整套项目、下载权重、安装第三方框架或训练模型。

## 你可以修改哪些部分

| 文件 | 职责 |
|---|---|
| backend/agents/agent_v1/persona.md | 人设、目标、问询风格、工具策略、停止与确认规则 |
| backend/agents/agent_v1/schemas.py | 工具动作与参数、事实字段和结构化回复 |
| backend/agents/agent_v1/runtime.py | 观察→模型决策→工具执行→观察→回应循环；状态和动作记录 |
| backend/agents/agent_v1/intake.py | 接入现有案件和消息接口，持久化成功的轮次 |
| backend/agents/provider.py | 模型传输和错误呈现 |
| backend/agents/agent_v1/console.py | 独立真实对话或显式离线脚本回放 |
| frontend/app/agent-lab/page.tsx | 调试台，展示对话、事实、动作和用量 |

动作包括 record_facts、update_case_memory、search_law、check_amounts、inspect_evidence、prepare_materials、respond。模型自主选择动作，程序仅允许定义的工具，最后由 respond 结束本轮并等待用户。默认每轮最多6次模型调用，最后一次强制respond。一组工具顺序执行完毕后再请求模型，不将组内每个工具误计为一次模型调用。每次响应至多7个工具，保留总执行上限；失败不提交半轮案件变化。不输出隐藏思维链，trace只包含步骤、动作、成功状态、耗时。

事实更新要求提供用户消息中的逐字引用；同一案件历史中的用户原话可补记缺失字段，但不能覆盖已有值和后来的更正，也不能引用助手推测。字段类型、范围、引用存在性由程序检查。这个检查不能证明事实提取的语义一定正确，仍需用户核对。金额工具只显示计算与冲突，不擅自覆盖欠款。累计已付未知时，对明显只报告新增款的表达拒绝直接写成累计已付，保留错误供模型修正；这是针对已复现路径的有限检查，不是所有计薪语义的识别器。引用ID限于实际检索结果，无法自动证明引用与每句建议完全相关。

## 体验方式一：离线检查循环（不需要密钥）

在项目根目录执行：

```powershell
.\.venv\Scripts\python.exe -m backend.agents.agent_v1.console --replay
```

输出明确标注“脚本回放”，按固定动作演示记事实→核账→回复，测试的是程序循环，不是大模型效果。不会调用外部 API、写入案件或替你开通服务。

## 体验方式二：真实模型

推荐先打开 http://localhost:3000/agent-lab 顶部的“模型设置”：填写 API URL、模型名和 API Key，点击“测试连接”，通过后点击“启用真实 AI”。测试仅发送固定消息，不发送案件内容，会产生少量 API 用量。启用后下一条消息开始生效，无需重启后端；可以新建案件获得新的欢迎语。

页面设置绑定当前匿名浏览器会话，按用户要求把密钥和配置写入本机 `.agent-local-settings.json`，重启后自动读取；该文件和临时文件已加入 .gitignore，接口不回显密钥。不把该文件发给队友。清除密钥按钮删除该会话的存储值并切回规则模式。测试连接通过不代表多轮效果已验收。更换 URL 后须重新填写密钥，防止把旧密钥发往新地址。

旧版只存在进程内存中的密钥无法在升级时导出；本轮更新后的首次保存会开始持久化。保留同一个浏览器会话，后续无需重复输入。终端独立模式仍读取 .env。

以下 .env 方法仍适用于终端和默认服务配置。

在项目根目录创建/编辑本地 .env，填写自己的兼容 Chat Completions API 配置（模型必须支持tools、tool_choice和标准工具结果回传）：

```dotenv
LLM_PROVIDER=openai_compatible
LLM_API_KEY=自行在本机填写真实密钥
LLM_BASE_URL=https://api.deepseek.com/v1
LLM_MODEL=deepseek-flash
LLM_TIMEOUT_SECONDS=30
AGENT_MAX_STEPS=6
```

这是配置示例，实际模型名/工具参数以你的服务商为准；本次未用真实账号验证模型兼容性。密钥不进入浏览器、不提交 Git。确认自己愿意将测试对话与案件上下文发送至该服务后，使用虚构案例开始。

DeepSeek 官方接口显式使用非思考模式，以配合本版强制工具选择；其他兼容服务商需支持 required 与指定工具。依据：[DeepSeek 思考模式与工具调用](https://api-docs.deepseek.com/zh-cn/guides/thinking_mode/)。

终端独立体验：

```powershell
.\.venv\Scripts\python.exe -m backend.agents.agent_v1.console
```

/state 查看事实与来源；/reset 开始新会话；/quit 退出。终端会话仅在进程内保存，网页会话由现有数据库保存。

网页体验：重启后端使 .env 生效，前端正常启动后打开 http://localhost:3000/agent-lab，点击“新建测试案件”。也可在原有首页进入案件咨询。规则模式 LLM_PROVIDER=mock 仍保留，不能把它当作真实模型体验。

502 表示配置/上游调用/协议或循环失败；检查界面错误和自己的服务商用量。没有密钥不静默切换成假 AI。每轮可能多次模型调用，usage 汇总本轮返回的 token，费用以服务商账单为准。

## 队友接入

原 /api/v1/cases/{id}/messages 的请求与主要返回字段保留；assistant_message.meta 增加 agent_stage、agent_trace、usage、citations。保持现有 X-Session-Id 权限隔离。后端先写入待处理用户消息，只有完整 Agent 轮次成功才提交，失败回滚。

调试台每次新建真实的测试案件，保存在当前浏览器会话下；在原“我的案件”管理。不要把测试案件当真实案件提交。待确认阶段可输入“确认无误”；确认后自然更正将重新打开核对。

## 本版实际范围与限制

- 新增真实模型接待循环，人设/动作/状态可单独修改；已接入现有网页消息路径。
- 法律检索及证据和文书工具使用现有本地资料与规则；资料尚未最终核验。
- 案件分析、行动指南、填报页面仍由旧规则模块生成；不宣称这些页面已全部改为模型驱动。
- 已支持真实模型流式传输；暂不支持跨轮详细审计档案、语音 Agent、联网搜索或政府平台自动提交。
- 同一案件每轮带入数据库保存的完整用户/助手历史及结构化事实，修复此前仅发送最近16条导致的上下文丢失。调试台保存当前案件ID，刷新恢复，也可选择已有案件；新案件相互独立，不自动合并。尚无长对话压缩摘要或跨案件记忆；完整历史会增加输入用量，最终仍受所用模型上下文容量限制。
- 原话存在性与类型校验不能防止所有语义误提取、幻觉或提示注入；真实模型需用固定案例人工评测。
- 同一案件请顺序发送消息；当前 UI 禁止发送中再次发送，服务器并发修改的版本冲突控制尚未实现。
- 原有案件进度仍按字段计算，不代表 Agent 阶段或法律判断完整度。

## 验证

```powershell
.\.venv\Scripts\python.exe -m pytest tests -q
cd frontend
npx tsc --noEmit
```

脚本/测试替身验证的是协议、工具结果反馈、事实纠正、来源引用、确认边界、轮次上限、接口保存和回滚，不等于真实模型行为验收。没有真实密钥时，不声称测过真实 AI 效果。

## 流式事件与人设更新

调试台和正式对话页使用 POST `/api/v1/cases/{id}/messages/stream`。后端向模型请求 stream=true，拼接工具调用参数，仅将 respond.reply 的增量可解码文本以 reply_snapshot 推给前端；不推送原始工具参数、密钥或隐藏思维。没有额外调用模型把最终结果改写一遍，也没有先生成完再伪造打字效果。

SSE 事件：status（等待状态）、action（已完成动作与状态）、reply_snapshot（当前生成中的回复）、reply_reset（校验失败或转入下一步时撤回预览）、done（成功保存后的完整原接口结果）、error（本轮失败）。前端在 done 前显示草稿，失败时移除草稿并保留输入供重试。字段变化仅在整轮校验通过后保存。断流/截断不作为完整回复保存；客户端离开时停止继续产生事件，正在等待的网络读取以配置的超时结束。

工具检索等处理阶段仍可能有等待，之后才开始显示回复。代理服务必须支持标准 Chat Completions SSE、流式工具调用及 usage 参数，否则明确显示调用失败。

persona.md 每轮重新读取，可以直接调整风格而无需重启后端。当前策略明确允许不追问、用户休息时停下来、想先听办法时先回应，避免反复复述和训话；风格示例用于约束表达，不代表真实模型已经通过人工评测。

可在已有案件继续测试，或明确新建独立案件。依次试“你好”“你怎么一直问，我就想知道怎么办”“我现在挺烦的，不想说了”“不是两万，是一万八”。分别观察是否自然回应、停止盘问、允许休息，以及真正更新事实。

## 本轮模拟评测后新增

`update_case_memory`保存长期诉求、联系限制和行动反馈，附当前用户原话来源。适配器将其存入case.intake.agent_memory，每个请求重新读取；不跨案件共享，也不自动把助手建议当作用户已采取的行动。完整历史仍是事实字段之外的原话来源，没有长对话压缩。

`prepare_materials`现在保存事实陈述、核账微信、证据目录和事实/记忆快照到case.intake.agent_materials，事实或进展变化会标为outdated_requires_regeneration；重新生成时纳入用户报告的处理经过。同一轮已生成草稿后又更新事实/进展，结束时会用最终状态刷新该轮草稿，避免工具顺序导致保存旧内容。新字段由GET案件接口返回，队友可以直接读取，无需另建持久化接口。草稿的status=draft_requires_review，始终需要用户核对。

明确要求不追问的常见表达会设置本轮reply_policy，回答仍追加问句时将错误反馈模型修改；给用工方的引用范文可包含问题。该检查是有限表达/标点检查，不代表完整语义理解。已知引用ID的大小写统一并补齐对应元数据，未知ID继续拒绝，数字条号不能冒充检索ID。

可复跑的真实模型测试（使用.env中的配置，产生API用量；只发送合成案例）：

```powershell
.\.venv\Scripts\python.exe scripts\evaluate-agent.py --output .logs/eval/core.json
.\.venv\Scripts\python.exe scripts\evaluate-agent.py --holdout --output .logs/eval/holdout.json
.\.venv\Scripts\python.exe scripts\evaluate-agent-api.py
```

前两个脚本仅查询现有本地法律库，不写用户案件；第三个使用.logs/eval下独立SQLite数据库测试真实HTTP、SSE和持久化。JSON报告包含虚构对话、工具校验错误、耗时和用量，不含API密钥。评测不训练权重，也不替代法律资料核验或广泛人类评测。效果与真实遗留限制见agent-evaluation.md。

## 运行日志与停止

`.logs/agent.jsonl` 记录每轮 run_id、模型响应的工具数量、工具成功状态、耗时和结束/错误类型，不记录密钥、请求头、用户原话或模型全文。调试消息展开后可用 run_id 对照日志。测试日志单独写到 `.logs/tests`。

使用 `.\scripts\start-local.ps1` 启动未运行的本地服务时，将标准输出和错误保存到 `.logs/backend.stdout.log`、`.logs/backend.stderr.log` 及前端对应日志。已运行的服务不会重复启动；旧的无重定向进程没有历史文件日志。

客户端每轮最多等待90秒，支持停止生成；离开页面会取消流式请求。停止接收时服务端若已完成提交，仍可能存在已保存结果，可检查案件记录。现在支持模型普通文本回复，以及一组多个工具调用按顺序执行；不再要求每次必须恰好一个动作。
