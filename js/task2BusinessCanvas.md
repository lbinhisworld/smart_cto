# 商业画布加载模块（task2BusinessCanvas.js）设计说明

> 最近更新：2026-03-19。与 `main.js` 中 task2（商业画布加载）流程保持一致。

## 1. 模块定位

`task2BusinessCanvas.js` 负责商业画布加载（Task2）的核心可复用逻辑，目标是把 task2 的 BMC 生成、解析、讨论模式与时间线消息构建从 `main.js` 解耦。

当前模块职责：

- 商业模式画布（BMC）生成用系统提示词（含「客户基础信息」及「初步需求」）、细化/讨论用提示词与 Markdown 兜底解析；
- 基于客户基本信息及初步需求调用大模型生成 BMC（`generateBmcFromBasicInfo(basicInfoJson, preliminaryReqJson)`）；
- 基于客户反馈的 BMC 重新生成（`generateBmcFromBasicInfoWithFeedback`）；
- BMC 讨论模式单轮调用（`runBmcDiscussionTurn(baseBmcData, discussionHistory, userMessage)`），四段式提示：system（BMC 讨论专用）、当前画布数据、历史讨论 JSON、用户当前输入；
- Task2 `LLM-查询` 时间线消息的标准化构建（`buildTask2LlmQueryMessage` → `task2LlmQueryBlock`）。

非职责（仍由 `main.js` 负责）：

- 聊天区 BMC 卡片 DOM 渲染与「确认/重做/修正/讨论」按钮事件；讨论回复块的「继续讨论」「重新生成」及 base bmc data、讨论历史获取；
- 问题单 BMC 状态推进、存储回写、任务完成确认；
- `runBmcGeneration` 的完整流程（加载态、推送消息、渲染历史）；讨论模式下的 `bmcDiscussionStartBlock` / `bmcDiscussionReplyBlock` / `bmcDiscussionLlmQueryBlock` / `bmcDiscussionEndBlock` 的推送与渲染。

---

## 2. 依赖与加载

### 2.1 运行时依赖

| 依赖 | 来源 | 用途 |
|------|------|------|
| `fetchDeepSeekChat` | `js/api.js` | 调用大模型生成 BMC |
| `BMC_FIELDS` | `js/config.js` | 画布字段定义，用于解析结果初始化与 Markdown 表头映射 |

### 2.2 加载顺序

在 `index.html` 中，该模块位于：

- `js/config.js` 之后（保证 `BMC_FIELDS` 已挂载）；
- `js/api.js` 之后（保证大模型调用函数已挂载）；
- `main.js` 之前（保证主流程可直接调用）。

---

## 3. 对外方法

### 3.1 `generateBmcFromBasicInfo(basicInfoJson, preliminaryReqJson)`

**作用**：根据客户基本信息及（可选）初步需求汇总调用大模型，生成商业模式画布（BMC）结构化结果。提示词 Task 为「请基于提供的【客户基础信息】及【初步需求】」。

**入参**：

- `basicInfoJson: Object | string`：客户基本信息对象或已序列化的 JSON 字符串。
- `preliminaryReqJson: Object`（可选）：客户初步需求汇总（customerName、customerNeedsOrChallenges、customerItStatus、projectTimeRequirement）。若提供且非空，user 内容为「【客户基础信息】+ 【初步需求】」两段 JSON；否则仅发送客户基础信息。

**返回**（`Promise<Task2BmcLlmResult>`）：

- `parsed`：解析后的 BMC 对象（含 industry_insight、pain_points、BMC 九宫格字段等）；
- `usage`、`model`、`durationMs`：大模型元数据；
- `fullPrompt`：完整提示词（system + user）；
- `rawOutput`：模型原始输出文本（优先 JSON 片段，否则全文；用于兜底展示）。

**解析逻辑**：优先从返回内容中提取 `{...}` 并 `JSON.parse`；失败时使用 `parseBmcFromMarkdown(content)`。

**异常**：当 `fetchDeepSeekChat` 不可用时抛出错误；调用方（如 `runBmcGeneration`）负责捕获并展示失败信息。

---

### 3.2 `buildTask2LlmQueryMessage(args)`

**作用**：统一构建可入库的 task2 时间线消息对象（`task2LlmQueryBlock`），供沟通历史过程日志展示「商业画布提炼」LLM-查询 块。

**入参**（`Task2LlmQueryMessageArgs`）：

- `fullPrompt`：提交给大模型的完整提示词；
- `parsed`：BMC 结构化输出；
- `rawOutput`：原始输出文本（可选）；
- `timestamp`：时间戳；
- `usage` / `model` / `durationMs`：模型元数据（可选，用于生成 `llmMeta`）。

**返回**：

- 标准消息对象，可直接传给 `pushAndSaveProblemDetailChat(...)`。

**默认行为**：

- `noteName` 固定为「商业画布提炼」；
- 若传入 `usage`、`model` 或 `durationMs` 任一字段，则自动生成 `llmMeta`。

---

## 4. 内部常量与函数（不对外）

- **BMC_GENERATION_PROMPT**：BMC 生成的 system 提示词（Role / Task：基于【客户基础信息】及【初步需求】/ Input / Analysis Logic / Output Format）。
- **BMC_REFINEMENT_PROMPT**：基于客户反馈对 BMC 进行细化重新生成时的 system 提示词（basic_info + previous_bmc + customer_feedback）。
- **BMC_DISCUSSION_SYSTEM_PROMPT**：BMC 讨论模式用 system 提示词（角色、交互背景、分析框架、约束、输出规范：业务洞察 / BMC 关联影响 / 引导性追问）。
- **runBmcDiscussionTurn(baseBmcData, discussionHistory, userMessage)**：讨论模式单轮调用，user 内容为「当前画布数据 + 历史讨论 JSON + 用户当前输入」，返回 `{ content, usage, model, durationMs, fullPrompt }`。
- **BMC_LABEL_TO_KEY**：Markdown 中 BMC 表头到字段 key 的映射。
- **parseBmcFromMarkdown(text)**：从 Markdown 文本中解析 BMC 结构（大模型未返回纯 JSON 时兜底），依赖 `BMC_FIELDS` 与 `BMC_LABEL_TO_KEY`。

---

## 5. 与主流程的关系

`main.js` 在 task2 的流程中复用该模块：

- **runBmcGeneration**：从 `currentProblemDetailItem` 组装 `preliminaryReqJson`，调用 `window.generateBmcFromBasicInfo(problemDetailConfirmedBasicInfo, preliminaryReqJson)` 获取 BMC，再使用 `window.buildTask2LlmQueryMessage(...)` 构建并推送 `task2LlmQueryBlock`，随后推送 `bmcCard` 并渲染 BMC 聊天卡片。
- **BMC 讨论模式**：用户点击「讨论」后推送 `bmcDiscussionStartBlock`；用户发送时调用 `runBmcDiscussionTurn(getBaseBmcData(), getBmcDiscussionHistory(), text)`，推送 `bmcDiscussionLlmQueryBlock`（备注「大模型讨论应答」）与 `bmcDiscussionReplyBlock`；讨论回复块提供「继续讨论」「重新生成」，重新生成时调用 `generateBmcFromBasicInfoWithFeedback` 并推送 `bmcDiscussionEndBlock`。对话区标题栏右上角在讨论模式下显示讨论动画（`updateProblemDetailChatDiscussionIndicator`）。

沟通历史模块（`communication-history.js`）根据 `task2LlmQueryBlock`、`bmcDiscussionLlmQueryBlock`、用户讨论消息（_logType bmcDiscussionUser）等在 task2 过程日志中渲染「商业画布提炼」/「大模型讨论应答」LLM-查询 块及「用户讨论」卡片，样式与 task1 的 LLM-查询 一致（输入/输出双子卡片等）。
