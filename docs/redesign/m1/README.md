# M1 · Token 与基础组件

> 日期：2026-11-19  
> 分支：`feat/visual-refactor-m1`  
> 状态：已完成，页面结构未迁移  
> 依据：`DESIGN.md`、`docs/redesign/refactor-plan-v2.md`

## 1. 本轮范围

只做视觉基础层：

- 语义颜色、圆角、页面底色、字体栈。
- Button / Badge / Card / Section / Progress / Input / Textarea / Select / Modal / Alert / Checkbox / CopyButton / Spinner。
- 品牌标记与焦点环。

本轮**没有**改页面布局、文案、路由、Agent、数据接口或法律内容。

## 2. 语义 Token

见 `frontend/tailwind.config.ts` 与 `frontend/app/globals.css`：

- `paper` `#f4efe2`：页面底。
- `surface` `#fffdf8`：阅读面。
- `sand` `#eae1d0`：分区/次级表面。
- `rule` `#d9ccb4`：发丝线。
- `ink` `#171717`：主文字/主按钮。
- `muted` `#5d574d`：次级文字。
- `signal` `#c23b2a` / `signal-deep` `#8f291c` / `signal-wash` `#f6dad3`：当前、风险、下一步。
- `field` `#2e6b4f`：完成/已确认。
- `note` `#8c5a00`：待核实/待补充。
- `route` `#2e6f72`：行动路线，暂未进入页面。
- `rounded-control` 2px、`rounded-card` 4px。

旧 `brand-*` 暂保留为过渡色阶：主按钮黑、链接深红、soft 面为纸色/沙色；页面迁移完成后再删除旧 token。

## 3. 组件状态

| 组件 | 变化 |
| --- | --- |
| Button | 2px 方角，默认 44px 高；primary 黑→红 hover；outline 纸白+发丝边；focus 3px 红环 |
| Badge | 2px 方角，不再用胶囊；状态色映射 field/note/signal |
| Card / Section | 4px 方角、发丝边、无阴影 |
| Progress | 1.5px 细线，轨道 sand、进度 ink；后续行动页可用 `barClassName` 切红 |
| Input / Textarea / Select | 纸白底、2px 方角、红 focus；移动端 16px 防缩放 |
| Modal | 4px 方角、发丝边、无阴影；移动端底部 sheet |
| Alert | 四态改为 sand/note/field/signal tint |
| Checkbox | 44px 触控行高、2px 勾选框 |
| CopyButton | 36px、纸白、发丝边、复制成功用 field green |
| Spinner | 墨黑，不把加载误读成错误 |

## 4. 验证

- `npx tsc --noEmit`：通过。
- `npm run test -- --run`：2 个文件、9 项测试通过。
- `npm run build`：通过；`/` 首屏 119 kB，动态案件页 132 kB。
- 浏览器：1440 × 900 与 390 × 844，首页/对话/分析/行动/填报 + 事实编辑弹窗。
- 所有页面 `horizontalOverflow = 0`；控制台错误 0。
- 证据：`docs/redesign/m1/`（截图与 `metrics.json`）。

## 5. 已知过渡状态

这些属于后续里程碑，不是 M1 缺陷：

- 页面仍使用旧布局与部分旧类名（`text-ink-*`、`bg-white`、`rounded-lg`）。
- 首页仍是旧的一列入口，不是定稿的读本首页；M2 处理。
- 案件头仍是裸 `11/11`，没有双进度标签；M2 处理。
- 行动页仍是 8 步全展开，没有三阶段路线；M6 处理。
- 填报页移动端步骤条与证据表格仍靠横向滚动；M7 处理。
- 旧 `brand-*` 色阶仍在页面中使用；页面迁移完成后删除。

## 6. 下一里程碑

M2：壳层、首页、我的案件列表。

- 双进度标签。
- 读本首页（H1、信任事实、四步路径、产出说明）。
- 案件列表只保留一组主次入口。
- 顶部/底部导航去旧蓝色残留。
