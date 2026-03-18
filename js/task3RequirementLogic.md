# 需求逻辑构建模块（task3RequirementLogic.js）设计说明

> 最近更新：2026-03-19。与 `main.js` 中 task3（需求逻辑构建）流程保持一致。

## 1. 模块定位

`task3RequirementLogic.js` 负责需求逻辑构建（Task3）的核心可复用逻辑，目标是把 task3 的大模型调用、Markdown/JSON 解析与时间线消息构建从 `main.js` 解耦。

当前模块职责：

- 需求逻辑分析用系统提示词（`REQUIREMENT_LOGIC_PROMPT`）与章节定义（`REQUIREMENT_LOGIC_SECTIONS`）；
- 基于客户初步需求、企业基本信息、BMC 调用大模型生成需求逻辑（`generateRequirementLogicFromInputs`）；
- 从 Markdown 或 JSON 文本中解析出四章节结构（`parseRequirementLogicFromMarkdown`）；
- Task3 `LLM-查询` 时间线消息的标准化构建（`buildTask3LlmQueryMessage` → `task3LlmQueryBlock`）。

非职责（仍由 `main.js` 负责）：

- 聊天区需求逻辑卡片 DOM 渲染与「确认/重做/修正/讨论」按钮事件；
- 问题单需求逻辑状态推进、存储回写、任务完成确认；
- `runRequirementLogicConstruction` 的完整流程（加载态、前置校验、推送消息、渲染历史）。

---

## 2. 依赖与加载

### 2.1 运行时依赖

| 依赖 | 来源 | 用途 |
|------|------|------|
| `fetchDeepSeekChat` | `js/api.js` | 调用大模型生成需求逻辑 |

### 2.2 加载顺序

在 `index.html` 中，该模块位于：

- `js/api.js` 之后（保证大模型调用函数已挂载）；
- `main.js` 之前（保证主流程可直接调用）。

---

## 3. 对外方法与常量

### 3.1 `REQUIREMENT_LOGIC_PROMPT`（常量）

需求逻辑分析用 system 提示词，包含 Role、Input Data、Task、Analysis Framework、Output Format 与 Output Requirements。供本模块内部调用大模型使用；若需在别处复用（如 PROMPTS.md 同步），可从此常量读取。

### 3.2 `REQUIREMENT_LOGIC_SECTIONS`（常量）

需求逻辑 Markdown 的四个章节定义，用于解析与 UI 展示：

| key | label |
|-----|--------|
| industry_competition | 行业底层逻辑与竞争共性 |
| causal_relation | 初步需求与商业模式的"因果关联" |
| deep_motivation | 需求背后的深层动机 |
| logic_summary | 逻辑链条总结 |

`main.js` 中渲染需求逻辑卡片、修正后重组 Markdown、工作区展示等均依赖该常量。

### 3.3 `parseRequirementLogicFromMarkdown(text)`

**作用**：从大模型返回的 Markdown 或含 JSON 的文本中解析出需求逻辑结构。

**入参**：

- `text: string`：大模型返回的全文。

**返回**：

- `Object`：键为 `REQUIREMENT_LOGIC_SECTIONS` 中各 `key`，值为对应段落文本；无法解析则为空字符串。

**解析逻辑**：

- 优先尝试从文本中提取 `{...}` 并 `JSON.parse`，再按 key/label 映射到四章节；
- 若 JSON 解析失败或无有效字段，则按 `## 1. 行业底层逻辑…`、`## 2. 初步需求与商业模式…` 等标题切分段落。

### 3.4 `generateRequirementLogicFromInputs(preliminaryReqJson, basicInfoJson, bmcJson)`

**作用**：根据客户初步需求、企业基本信息、BMC 三个维度调用大模型，生成需求逻辑链条分析。

**入参**：

- `preliminaryReqJson: Object | string`：客户初步需求（如 customerName、customerNeedsOrChallenges、customerItStatus、projectTimeRequirement）或 JSON 字符串。
- `basicInfoJson: Object | string`：企业基本信息对象或 JSON 字符串。
- `bmcJson: Object | string`：商业模式画布 BMC 对象或 JSON 字符串。

**返回**（`Promise<Task3RequirementLogicLlmResult>`）：

- `content`：模型返回正文（已 trim）；
- `usage`、`model`、`durationMs`：token 使用与耗时；
- `fullPrompt`：完整提示词（system + user）；
- `rawOutput`：模型原始输出文本（用于时间线输出子卡片与兜底展示）。

**异常**：

- 当 `fetchDeepSeekChat` 不可用时抛出错误；调用方（如 `runRequirementLogicConstruction`）负责捕获并展示失败信息。

### 3.5 `buildTask3LlmQueryMessage(args)`

**作用**：统一构建可入库的 task3 时间线消息对象（`task3LlmQueryBlock`），供沟通历史过程日志展示「需求逻辑提炼」LLM-查询 块。

**入参**（`Task3LlmQueryMessageArgs`）：

- `fullPrompt`：提交给大模型的完整提示词；
- `parsed`：解析后的需求逻辑结构化对象（四章节 key 对应文本）；
- `rawOutput`：原始输出文本（可选）；
- `timestamp`：时间戳；
- `usage` / `model` / `durationMs`：模型元数据（可选，用于生成 `llmMeta`）；
- `confirmed`：是否已确认（可选，默认 false）。

**返回**：

- 标准消息对象，可直接传给 `pushAndSaveProblemDetailChat(...)`。

**默认行为**：

- `noteName` 固定为「需求逻辑提炼」；
- 若传入 `usage`、`model` 或 `durationMs` 任一字段，则自动生成 `llmMeta`。

---

## 4. 与主流程的关系

`main.js` 在 task3 的流程中复用该模块：

- **runRequirementLogicConstruction**：调用 `generateRequirementLogicFromInputs(preliminaryReq, basicInfo, bmc)` 获取需求逻辑，使用 `buildTask3LlmQueryMessage(...)` 构建并推送 `task3LlmQueryBlock`，再推送 `requirementLogicBlock` 并渲染需求逻辑聊天卡片。
- **需求逻辑卡片渲染与重绘**：使用 `REQUIREMENT_LOGIC_SECTIONS` 与 `parseRequirementLogicFromMarkdown` 生成四章节展示或「原始输出」兜底。
- **修正/讨论后重组 Markdown**：使用 `REQUIREMENT_LOGIC_SECTIONS` 与 `parseRequirementLogicFromMarkdown` 将结构化结果重组为 Markdown 字符串。
- **工作区需求逻辑展示**：使用 `REQUIREMENT_LOGIC_SECTIONS` 与 `parseRequirementLogicFromMarkdown` 按章节或原始输出渲染。

沟通历史模块（`communication-history.js`）根据 `task3LlmQueryBlock` 在 task3 过程日志中渲染「需求逻辑提炼」LLM-查询 块（输入/输出双子卡片、确认标签、token/耗时），与 task1、task2 的 LLM-查询 样式一致。
