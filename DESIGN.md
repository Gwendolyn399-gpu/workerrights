---
name: 工友权益助手 WorkerRights
description: 用大白话帮河南建筑工地被欠薪工友整理事实、证据、行动步骤和填报参考
colors:
  newsprint: "#f4efe2"
  paper-white: "#fffdf8"
  sand-panel: "#eae1d0"
  ink: "#171717"
  ink-muted: "#5d574d"
  rule: "#d9ccb4"
  signal-red: "#c23b2a"
  signal-red-deep: "#8f291c"
  signal-red-wash: "#f6dad3"
  field-green: "#2e6b4f"
  note-amber: "#8c5a00"
  route-teal: "#2e6f72"
  route-wash: "#d8e7e3"
typography:
  display:
    fontFamily: "Noto Sans SC, PingFang SC, Microsoft YaHei, system-ui, sans-serif"
    fontSize: "3rem"
    fontWeight: 800
    lineHeight: 1.14
    letterSpacing: "-0.035em"
  headline:
    fontFamily: "Noto Sans SC, PingFang SC, Microsoft YaHei, system-ui, sans-serif"
    fontSize: "1.5rem"
    fontWeight: 800
    lineHeight: 1.25
    letterSpacing: "-0.03em"
  title:
    fontFamily: "Noto Sans SC, PingFang SC, Microsoft YaHei, system-ui, sans-serif"
    fontSize: "1.125rem"
    fontWeight: 700
    lineHeight: 1.45
    letterSpacing: "-0.015em"
  body:
    fontFamily: "Noto Sans SC, PingFang SC, Microsoft YaHei, system-ui, sans-serif"
    fontSize: "1rem"
    fontWeight: 400
    lineHeight: 1.75
    letterSpacing: "0em"
  label:
    fontFamily: "Noto Sans SC, PingFang SC, Microsoft YaHei, system-ui, sans-serif"
    fontSize: "0.75rem"
    fontWeight: 700
    lineHeight: 1.5
    letterSpacing: "0.01em"
rounded:
  sm: "2px"
  md: "4px"
  full: "999px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "16px"
  lg: "24px"
  xl: "40px"
  xxl: "64px"
components:
  button-primary:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.paper-white}"
    rounded: "{rounded.sm}"
    padding: "0 18px"
    height: "44px"
  button-primary-hover:
    backgroundColor: "{colors.signal-red}"
    textColor: "{colors.paper-white}"
  button-outline:
    backgroundColor: "{colors.newsprint}"
    textColor: "{colors.ink}"
    rounded: "{rounded.sm}"
    padding: "0 16px"
    height: "44px"
  case-tab-active:
    backgroundColor: "{colors.paper-white}"
    textColor: "{colors.ink}"
    rounded: "{rounded.sm}"
    padding: "8px 0"
  route-stop-current:
    backgroundColor: "{colors.signal-red}"
    textColor: "{colors.paper-white}"
    rounded: "{rounded.full}"
  facts-panel:
    backgroundColor: "{colors.paper-white}"
    textColor: "{colors.ink}"
    rounded: "{rounded.md}"
    padding: "0"
---

# Design System: 工友权益助手

> 这是第四阶段重构的目标视觉系统，不是当前代码现状。当前正式前端仍是旧的蓝色工具感；重构时以本文件为准。

## Overview

**Creative North Star: "工人夜校读本"**

这不是一份法院文书，也不是一个“AI 法律助手”的后台。它更像一本工友在夜校里会拿到的读本：大字、短句、粗黑标题、新闻纸的底、少量红笔批注。每个版面只教一件事，每次只问一个问题。读本的世界负责让文字可信、可读、可记住，不负责把产品变成教材或海报。

在 B 的读本骨架上，案件事实吸收 A 的“案卷”语法：事实面板有“事实 / 法律依据”页签和“已核对”章，像一份可以核对、带走的材料。行动步骤吸收 C 的“路线”语法：不是把整页画成地铁图，而是在需要判断“现在在哪”时，用“现在 / 下一步 / 之后”的站点把步骤串起来。A 和 C 是局部语法，不能和 B 争夺同一屏的主视觉。

**Key Characteristics:**
- 新闻纸底、墨黑字、信号红只标记当前/风险。
- 一个无衬线家族，粗黑标题，正文不小于 16px。
- 事实是案卷，行动是路线，解释是读本的一课。
- 平面、发丝线、无阴影；靠排版和留白分层。
- 手机优先：390px 是第一验收尺寸。

## Colors

整套颜色像一张被翻过很多次的工人读本：新闻纸的暖白提供底色，墨黑承担阅读，红色只出现在“现在”和“要小心”上。

### Primary
- **墨黑** (`#171717`): 主按钮、标题、正文和引导性强调。它不是纯黑，给新闻纸留一点呼吸。
- **纸白** (`#fffdf8`): 阅读表面、事实面板、底部导航；比纯白更不刺眼，适配工地强光。

### Secondary
- **信号红** (`#c23b2a`): 当前步骤、风险提示、活动页签、必填和下一步。它是“现在看这里”的墨水，不是装饰。
- **深红** (`#8f291c`): 红色文字在浅底上的可读版本，以及 hover/active。
- **淡红** (`#f6dad3`): 红色提示的表面 tint；不用于大面积背景。

### Tertiary
- **路线蓝绿** (`#2e6f72`): 只用于行动步骤的路线、已完成站点和非当前路径；不得出现在结论/分析页的主视觉。
- **路线浅底** (`#d8e7e3`): 路线轨道的底色。

### Neutral
- **新闻纸** (`#f4efe2`): 页面底、首页大面、输入底之外的默认 ground。
- **沙色面板** (`#eae1d0`): 分区底、首页侧栏、文件页签的非活动面。
- **墨灰** (`#5d574d`): 次级文字、说明、元信息。
- **发丝线** (`#d9ccb4`): 分隔、输入边、卡片边。
- **完成绿** (`#2e6b4f`): 已完成、已确认、已有材料。
- **提醒琥珀** (`#8c5a00`): 待核实、待补充、时效提醒。

### Named Rules
**The Red Pencil Rule.** 信号红只用于“当前步骤、风险、下一步、活动页签、必填、错误”。同一屏最多一个红色主焦点；其余红色一律降为深红文字或淡红底。

**The Two Grounds Rule.** 页面底用新闻纸，阅读面用纸白；不把页面做成纯白后台，也不做深色模式。深浅靠纸白/沙色/新闻纸三层，而不是阴影。

## Typography

**Display Font:** Noto Sans SC（回退 PingFang SC / Microsoft YaHei / system-ui）  
**Body Font:** 同上  
**Label/Mono Font:** 不另设；数字可用 `Cascadia Mono / Consolas` 做编号和表格数字

**Character:** 像一个成年人写给另一个成年人的读本：字形粗、句子短、标题有重量，但不喊叫。它不是儿童教材，也不是公文；不靠花体或衬线制造“文化感”。

### Hierarchy
- **Display** (800, 3rem/1.14, -0.035em): 首页 H1；只用于真正需要建立方向的入口。
- **Headline** (800, 1.5rem/1.25, -0.03em): 页面标题、结论区标题、行动阶段标题。
- **Title** (700, 1.125rem/1.45, -0.015em): 结论条目、卡片标题、步骤标题。
- **Body** (400, 1rem/1.75): 解释、证据、字段说明；移动端不小于 16px，行宽不超过 36em。
- **Label** (700, 0.75rem/1.5): 状态、字段名、页签、元信息；不用大写英文伪装“系统感”。

### Named Rules
**The One Voice Rule.** 全站只用一个无衬线家族。不要为了“案卷感”混入宋体标题，也不要为了“路线感”混入等宽正文；案卷和路线只通过结构、页签、站点和颜色表达。

**The 16px Rule.** 390px 宽的正文不得小于 16px；说明性元信息不得小于 12px。任何需要用户读两遍的文案，先缩短，再降级，不靠缩小字号解决。

## Layout

4px 基准。首页是单列读本，正文最大 620px；案件工作台是“主内容 + 320px 案件档案”的两列，移动端折叠为单列，事实面板收进摘要条/底部面板。页面容器最大 1180px；内容页左右至少 17px 内边距。

信息层级遵循“结论先行”：标题下方先给三条结论，再给证据和依据。行动步骤按三阶段组织，当前阶段默认展开；事实面板在所有页面保持一致。移动端底部导航固定，内容区留出安全区；任何关键内容不能依赖横向滚动。

**The Two-Screen Rule.** 在 390px 上，从案件页顶部到“下一步”按钮不超过两屏。超过时，折叠解释，不删事实。

## Elevation & Depth

**Flat-by-default.** 没有投影、没有玻璃、没有渐变。深度只用新闻纸/纸白/沙色三层底色和 1px 发丝线表达。黑色 3px 横线只用于“读本课页”的段落分隔；红色 5px 下划线只用于活动页签。

模态、底部面板和悬浮导航可以用一层边框和纸白背景与页面分离；不使用模糊或发光。

**The Paper-Not-Plastic Rule.** 表面像纸，不像塑料卡片：不需要阴影来证明它浮起来；需要时用完整的边线和底色变化。

## Shapes

控件和按钮是 2px 小方角；面板/事实档案是 4px；徽标/状态标签也是 2px，不做胶囊。圆形只用于路线站点、步骤编号和状态点。禁止 8/12/16/24px 的大圆角卡片，禁止卡片套卡片。

动作区可以用黑色整块面板承载“下一步”，这是全站唯一的大面积深色；它必须与红色当前站配合，不能变成装饰性黑块。

## Components

### Buttons
- **Shape:** 2px 方角，高 44px，水平内边距 16–18px。
- **Primary:** 墨黑底、纸白字；hover 变为信号红。用于“说说我的情况”“看行动步骤”“确认信息”。
- **Outline:** 透明/新闻纸底、1px 发丝边、墨黑字；用于次按钮和“先看演示”。
- **Focus:** 3px 信号红 outline，向外 3px；不使用阴影。
- **Disabled:** 40% 不透明，保留文字；不要用灰色块假装可用。

### Tabs
- **Case tabs:** 3px 墨黑基线；当前项用 5px 信号红下划线。页签文字 12–13px/700，间距 15–18px。
- **Facts tabs:** “事实 / 法律依据”小页签，当前项深红文字 + 2px 红线；不改变面板宽度。

### Chips
- 2px 方角、1px 发丝边、11–12px/700；默认纸白底。待补/待核实用淡琥珀底和虚线边；不要用彩色胶囊堆叠。

### Cards / Containers
- **Corner:** 4px。
- **Background:** 纸白；事实档案的页签区用沙色。
- **Border:** 1px 发丝线；事实档案顶部用 3px 墨黑线作为“案卷头”。
- **Padding:** 16–20px。
- **Shadow:** 无。

### Facts Dossier
事实面板是全站唯一的“案卷”组件。桌面 320px 宽、吸顶；顶部是“案件档案”+ 沙色页签 + 右对齐的“已核对”章；下面是键值行，未知值用墨灰而非红色；底部两个低强调操作“核对或修改档案 / 查阅相关法律条文”。移动端不显示完整面板，改为摘要条 + 底部面板。

### Lesson Block
结论区的基本单元：左侧 20px/800 的信号红编号，右侧是 label（可能可以主张 / 目前最缺 / 建议先做）、18px/700 标题和 14px/1.7 说明。没有卡片边框，只有上下发丝线；三条结论就是三课。

### Route Rail
只出现在行动步骤和“下一步”黑块中。三站：“现在 / 下一步 / 之后”；当前站信号红实心，后续站空心路线蓝绿；已完成站用完成绿 + 勾。路线是判断当前位置的结构，不是装饰背景。

### Inputs / Fields
- 2px 方角，纸白底，1px 发丝边；焦点用 3px 红 outline，不使用蓝光。
- label 12px/700；错误文字 12px 深红；占位文字对比度至少 4.5:1。
- 输入区高度不小于 44px；聊天输入框至少 48px。

### Navigation
- 桌面：新闻纸顶栏，品牌/案件标题在左，页签在中，新建在右；活动页签红色下划线。
- 移动：顶栏只保留品牌和新建；底部四 tab 固定，纸白底，活动项深红。两侧都要有安全区。
- 页签文字：对话 / 案件分析 / 行动步骤 / 填报参考。

## Do's and Don'ts

### Do:
- **Do** 让每条结论像一课：编号、短标题、两句说明。
- **Do** 把事实面板当作唯一事实源，其他页面引用摘要。
- **Do** 只用一处大面积深色：下一步/行动区。
- **Do** 在每个页面显示“信息完整度”或“办理进度”的明确标签，不显示裸数字。
- **Do** 在 390px 上先验收：正文 16px、按钮 44px、无横向滚动。
- **Do** 把官方入口写成“去官方平台（本人提交）”，旁边保留 12348/12333 兜底。
- **Do** 在事实修改后显示“信息已更新，请重新生成”。

### Don't:
- **Don't** 用宋体/衬线标题、牛皮纸纹理、旧公章图形来“制造案卷感”；案卷感来自页签和核对章。
- **Don't** 把路线图铺到分析页；路线只服务于“我现在在哪、下一步做什么”。
- **Don't** 用 8px 以上大圆角卡片、阴影、玻璃拟态或渐变。
- **Don't** 让红色成为背景装饰；它只标记当前、风险和下一步。
- **Don't** 把“官方填报”写成“帮您提交”，也不要用“保证追回/胜诉”文案。
- **Don't** 用小于 12px 的关键正文，或把移动端表格做成必须横向滑动的宽表。
- **Don't** 在标题前堆图标或英文 kicker；标题自己说话。
- **Don't** 把离线原型的 mock 数据、hash 路由或假交互带进正式前端。