# 法律数据规范与核验清单

## 1. 目标

法律知识库必须可追溯、可核验、可更新。产品不得凭模型记忆生成条文，也不得把未核验的地方政策包装成确定结论。

## 2. 文件结构

```text
knowledge/
├─ national/
│  ├─ labor-contract-law.json
│  ├─ labor-dispute-arbitration-law.json
│  ├─ migrant-wage-payment-regulation.json
│  ├─ labor-supervision-regulation.json
│  └─ legal-aid-law.json
├─ henan/
│  ├─ policies-pending.json
│  └─ regions.json
└─ official_channels/
   ├─ channels.json
   └─ root-wage-platform-form.json
```

启动时 `backend/database/seed.py` 幂等清空并重写知识表；用户案件表不受影响。

## 3. 法律文档字段

| 字段 | 含义 | 示例 |
| --- | --- | --- |
| `id` | 稳定标识 | `migrant-wage-payment-regulation` |
| `title` | 法律/政策名称 | `保障农民工工资支付条例` |
| `doc_number` | 文号 | `国务院令第724号` |
| `issuing_authority` | 发布机关 | `国务院` |
| `region` / `region_name` | 适用地区 | `national` / `全国` |
| `publish_date` | 公布日期 | `2019-12-30` |
| `effective_date` | 生效日期 | `2020-05-01` |
| `expiry_date` | 失效日期 | `null` |
| `validity` | 有效性说明 | `现行有效` |
| `official_url` | 官方链接 | `https://www.gov.cn/` |
| `official_source_name` | 官方来源名称 | `中国政府网` |
| `last_verified_at` | 最近人工核验时间 | `null` 表示未核验 |
| `verification_status` | 核验状态 | `transcribed` / `pending` / `verified` |
| `source_note` | 来源与限制说明 | 说明待核验范围 |
| `topics` | 主题标签 | `["欠薪", "工资支付"]` |
| `provisions` | 条文数组 | 见下 |

### 条文字段

| 字段 | 含义 |
| --- | --- |
| `id` | 条文稳定标识，如 `mwpr-30` |
| `article` | 条文号，如 `第三十条` |
| `heading` | 条文小标题（可为空） |
| `text` | 条文正文 |
| `topics` | 主题 |
| `conditions` | 适用条件 |
| `keywords` | 检索关键词 |
| `verification_status` | 条文级核验状态 |

## 4. 状态定义

| 状态 | 含义 | 产品呈现 |
| --- | --- | --- |
| `verified` | 已对照官方原文逐条核验，记录时间与链接 | “已核验” |
| `transcribed` | 按公开发布文本整理，尚未逐条对照/记录时间 | “按公开发布文本整理，待逐条核验” |
| `pending` | 地方政策/字段结构/渠道信息待核验 | “待核验” |

**规则**：`last_verified_at` 为空时，即使条文内容看起来确定，也不得标为“已核验”。

## 5. 当前数据与核验清单

### 5.1 国家层面（5 部）

状态均为 `transcribed`，`last_verified_at` 均为 `null`。

| ID | 名称 | 文号 | 发布机关 | 公布日期 | 生效日期 | 官方入口 |
| --- | --- | --- | --- | --- | --- | --- |
| `labor-contract-law` | 中华人民共和国劳动合同法 | 主席令第六十五号（2012 修正） | 全国人大常委会 | 2007-06-29 | 2008-01-01 | https://flk.npc.gov.cn/ |
| `labor-dispute-arbitration-law` | 中华人民共和国劳动争议调解仲裁法 | 主席令第八十号 | 全国人大常委会 | 2007-12-29 | 2008-05-01 | https://flk.npc.gov.cn/ |
| `migrant-wage-payment-regulation` | 保障农民工工资支付条例 | 国务院令第724号 | 国务院 | 2019-12-30 | 2020-05-01 | https://www.gov.cn/ |
| `labor-supervision-regulation` | 劳动保障监察条例 | 国务院令第423号 | 国务院 | 2004-11-01 | 2004-12-01 | https://www.gov.cn/ |
| `legal-aid-law` | 中华人民共和国法律援助法 | 主席令第九十三号 | 全国人大常委会 | 2021-08-20 | 2022-01-01 | https://flk.npc.gov.cn/ |

待办：

- 逐条对照官方原文，确认条文文字、条号、修正版本；
- 为每部法律记录 `last_verified_at` 与具体官方详情页；
- 如发现修订/废止，更新 `validity`、`expiry_date` 与条文。

### 5.2 河南地方资料（4 条，全部 `pending`）

| ID | 标题 | 发布机关 | 官方入口 | 待核验内容 |
| --- | --- | --- | --- | --- |
| `henan-minimum-wage-pending` | 河南省最低工资标准（资料条目·待核验） | 河南省政府/人社厅 | https://hrss.henan.gov.cn/ | 现行标准、适用区域、执行日期；**未写入具体数值** |
| `henan-labor-supervision-guide-pending` | 河南省劳动保障监察投诉举报办事指引（资料条目·待核验） | 河南省人社部门 | https://hrss.henan.gov.cn/ | 材料清单、受理层级、地址电话 |
| `henan-arbitration-guide-pending` | 河南省劳动人事争议仲裁办事指南（资料条目·待核验） | 河南省人社部门/仲裁委 | https://hrss.henan.gov.cn/ | 管辖规则、申请材料、时效适用 |
| `henan-legal-aid-guide-pending` | 河南省法律援助申请指引（资料条目·待核验） | 河南省司法行政部门/法援机构 | https://12348.gov.cn/ | 经济困难标准、材料、受理机构 |

这些条目不包含可执行的确定结论，UI 显示“待核验”。

### 5.3 官方渠道（8 个）

| 渠道 | 核验状态 | 说明 |
| --- | --- | --- |
| 全国根治欠薪线索反映平台 | `transcribed` | 入口与流程按公开信息整理，待核验 |
| 12333 热线 | `transcribed` | 待核验具体语音菜单与属地转接 |
| 12345 热线 | `transcribed` | 待核验属地派单规则 |
| 项目所在地劳动保障监察机构 | `transcribed` | 地址/电话需按项目所在地核实 |
| 住建部门（工程建筑领域欠薪） | `pending` | 具体受理窗口待核验 |
| 劳动人事争议仲裁委员会 | `transcribed` | 管辖与材料待核验 |
| 12348 法律援助热线 | `transcribed` | 经济困难标准待核验 |
| 人民法院诉讼服务 | `pending` | 具体立案要求待核验 |

### 5.4 官方平台字段结构

- 文件：`knowledge/official_channels/root-wage-platform-form.json`
- 状态：`pending`
- `last_verified_at`：`null`
- 说明：字段名称、顺序、必填性、上传要求均待对照官方页面；本产品只整理草稿，不自动提交。

### 5.5 地区数据

- 河南 18 个地市；
- 郑州区县带官方行政区划代码（如金水区 `410105`）；
- 其他地市多数区县名已录入，代码为空；
- 功能性区划单列，不强行归并；
- **不假设每个区县都有独立劳动监察机构**；分析页提示拨打 12333 确认。

## 6. 检索与引用

- 中文 bigram 分词 + BM25 风格打分；
- 核心条文固定注入，避免检索漏掉关键法条；
- 合并去重后最多 12 条；
- 每条返回官方链接与核验标签；
- 不把检索分数当法律效力；
- 不使用模型记忆补全缺失条文。

## 7. 更新流程

1. 从官方入口获取原文/页面。
2. 更新 JSON 中的元数据、条文和 `source_note`。
3. 将 `last_verified_at` 写为核验日期（ISO 8601），状态改为 `verified`（仅限已逐条核对）。
4. 运行 `python -m backend.database.init_db` 重新播种。
5. 运行 `pytest tests/legal -q`。
6. 在 UI 检查来源弹窗与分析页标签。
7. 在变更说明中记录数据版本、核验人/日期（如团队协作）。

## 8. 禁止事项

- 编造条文、文号、发布日期、官方链接；
- 把 `pending` 内容写成确定结论；
- 把搜索摘要当原文；
- 在 UI 硬编码法条规避知识库；
- 根据用户金额直接断言“必赔”“必赢”；
- 收录身份证号、真实当事人姓名等个人信息。
