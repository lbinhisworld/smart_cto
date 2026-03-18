## 任务5：IT 现状标注模块（`js/task5ItStatus.js`）

> 最近更新：2026-03-19。与 main.js、js/communication-history.js、js/task5ItStatus.js 实现一致。

**模块职责**

- **负责调用大模型为价值流图各环节标注 IT 现状**：基于「价值流图」与「需求逻辑」两个输入，构造 prompt（`IT_STATUS_ANNOTATION_PROMPT` + 用户内容），通过 `fetchDeepSeekChat` 获取带 `itStatus` 的 JSON。
- **负责解析大模型返回**：从 Markdown 代码块或首段 `{...}` 中抽取 JSON，与原始价值流图按阶段/环节下标合并（`mergeItStatusIntoValueStream`），得到带 itStatus 的价值流图。
- **负责时间线与对话区推送**：向沟通历史推送 `task5LlmQueryBlock`（LLM-查询，含输入/输出双子卡片）；向对话区推送 `itStatusCard`（阶段名-环节名-IT 现状 JSON）及确认/重做/修正/讨论按钮。不推送 `itStatusOutputLog`，也不向聊天框推送「IT 现状标注完成」完成态卡片。
- **负责写入与更新存储**：在数字化问题记录中更新 `valueStream`（合并后的 itStatus）、推进 `workflowAlignCompletedStages`，并写入操作历史（`itStatus`）。
- **对外提供统一入口函数**：通过 `runItStatusAnnotation(optionalItem)` 供任务调度调用；因 main 中 `currentProblemDetailItem` 为 let 不挂载到 window，主流程调用时需传入当前项。

---

### 大模型输出格式与解析

**约定输出格式**（见 `js/task5ItStatus.js` 中 `IT_STATUS_ANNOTATION_PROMPT`）：

- 大模型返回一个与输入 `value_stream` 结构一致的 JSON 代码块，在每个 step 中**仅新增** `itStatus` 字段。
- `itStatus` 结构：
  - `type`：只能是 `"手工"` 或 `"系统"`。
  - `detail`：手工时为 `"纸质"` 或 `"excel"`；系统时为具体系统名称（如 ERP、MES、OA）。

**解析与合并逻辑**（`runItStatusAnnotation` 内）：

1. 从大模型返回的 `content` 中抽取 JSON（优先 `` ```json ... ``` ``，否则首段 `{...}`）。
2. 调用 `mergeItStatusIntoValueStream(baseVs, annotatedVs)`：按 `stages` / `steps` 下标一一对应，将 `annotatedVs` 中每个 step 的 `itStatus` 写入 `baseVs` 对应 step，其余字段保留 `baseVs` 原样。
3. 使用合并后的价值流图更新存储（`updateDigitalProblemValueStreamItStatus`）与 `currentProblemDetailItem`，并推进工作流对齐阶段（0、1）。

---

### 主要方法（JSDoc 描述）

模块使用 IIFE 形式定义，并将以下方法挂载到全局 `window`，供 `main.js` 及任务调度使用。

#### `async runItStatusAnnotation(optionalItem)`

```js
/**
 * IT 现状标注主流程：校验 AI 配置与当前项 → 调用大模型 → 解析 JSON → 合并 itStatus → 更新存储与当前项 →
 * 推送 task5LlmQueryBlock、itStatusCard，并渲染对话区卡片与沟通历史。
 *
 * @param {Object} [optionalItem] - 当前问题详情项（含 createdAt、valueStream、requirementLogic 等）。
 *   因 main 中 currentProblemDetailItem 为 let 不挂载到 window，主流程调用时需传入，例如 runItStatusAnnotation(currentProblemDetailItem)。
 * @returns {Promise<void>}
 */
async function runItStatusAnnotation(optionalItem) { /* ... */ }
```

- **输入**：可选参数 `optionalItem`；若传入且含 `createdAt` 则使用，否则回退到 `global.currentProblemDetailItem`。从全局读取 `el.problemDetailChatMessages` 等。
- **行为**：
  1. 若未配置 AI，在对话区追加提示并 `pushAndSaveProblemDetailChat` 系统消息后返回。
  2. 在对话区插入加载中块，调用 `generateItStatusAnnotation(valueStream, logicForPrompt)`。
  3. 移除加载块后推送 `task5LlmQueryBlock`（含 `llmInputPrompt`、`llmOutputRaw`、`llmMeta`），供沟通历史时间线展示「LLM-查询」。
  4. 解析大模型返回的 JSON，调用 `mergeItStatusIntoValueStream` 得到合并后的价值流图。
  5. 调用 `pushOperationToHistory`、`updateDigitalProblemValueStreamItStatus`，更新 `currentProblemDetailItem` 与 `workflowAlignCompletedStages`，并执行 `renderProblemDetailContent`。
  6. 从合并后的图中提取「阶段名-环节名-IT 现状」列表（`itStatusOutputData`），推送 `itStatusCard`，在对话区仅渲染该卡片（确认/重做/修正/讨论），不推送「IT 现状标注完成」完成态块。
  7. 调用 `renderProblemDetailHistory`、`showNextTaskStartNotification`。
- **错误处理**：捕获异常时在对话区追加「IT 现状标注失败」并写入系统消息。
- **调试**：模块内使用 `[task5]` 前缀的 console 日志，便于排查入口、提前退出、大模型调用与推送等。

---

#### `async generateItStatusAnnotation(valueStream, requirementLogic)`

```js
/**
 * 调用大模型，基于价值流图与需求逻辑为各环节标注 IT 现状。
 *
 * @param {Object|string} valueStream - 已绘制的价值流图（对象或 JSON 字符串）。
 * @param {Object|string} requirementLogic - 需求逻辑（对象或 JSON 字符串）。
 * @returns {Promise<{content: string, usage: object, model: string, durationMs: number, fullPrompt: string}>}
 *   - content: 大模型原始回复；fullPrompt: 用于时间线 LLM-查询 输入的完整 prompt。
 */
async function generateItStatusAnnotation(valueStream, requirementLogic) { /* ... */ }
```

- **输入**：`valueStream`（任务4 产出或当前项中的价值流图）、`requirementLogic`（任务3 需求逻辑，对象或字符串）。
- **行为**：将两者格式化为 Markdown + JSON 代码块拼成 user 消息，以 `IT_STATUS_ANNOTATION_PROMPT` 为 system，调用 `fetchDeepSeekChat`；返回 `content`、`usage`、`model`、`durationMs` 以及拼接好的 `fullPrompt`（用于 task5LlmQueryBlock 的 `llmInputPrompt`）。

---

#### `mergeItStatusIntoValueStream(baseVs, annotatedVs)`

```js
/**
 * 将大模型返回的「带 itStatus 的价值流」合并进原始价值流图，按阶段/环节下标一一对应写入 itStatus。
 *
 * @param {Object} baseVs - 原始价值流图（含 stages/steps 或 phases/nodes 等结构）。
 * @param {Object} annotatedVs - 大模型返回的带 itStatus 的价值流图（结构需与 baseVs 对应）。
 * @returns {Object} 合并后的价值流图，保留 baseVs 的其余字段，仅在各 step 上增加或覆盖 itStatus。
 */
function mergeItStatusIntoValueStream(baseVs, annotatedVs) { /* ... */ }
```

- **输入**：`baseVs` 为当前问题中的价值流图；`annotatedVs` 为大模型返回的 JSON（与 baseVs 阶段/环节顺序一致）。
- **行为**：按 `baseVs.stages[i].steps[j]` 与 `annotatedVs.stages[i].steps[j]` 一一对应，若 `annotatedVs` 中该 step 存在对象类型的 `itStatus`（或 `it_status`），则写入 `baseVs` 对应 step 的 `itStatus`；否则保留 base step 原样。返回新对象，不修改入参。

---

### 依赖（由页面其他脚本提供的全局）

- **配置与工具**：`hasAiConfig`、`fetchDeepSeekChat`、`getTimeStr`、`escapeHtml`、`DELETE_CHAT_MSG_ICON`
- **状态与渲染**：`el`、`currentProblemDetailItem`、`renderProblemDetailContent`、`buildLlmMetaHtml`
- **会话与历史**：`problemDetailChatMessages`、`pushAndSaveProblemDetailChat`、`pushOperationToHistory`
- **价值流解析**：`parseValueStreamGraph`（来自 `js/valueStream.js`）
- **存储**：`updateDigitalProblemValueStreamItStatus`
- **导航**：`showNextTaskStartNotification`

---

### 与主流程的集成关系

- 在 `index.html` 中通过 `<script src="js/task5ItStatus.js"></script>` 引入（建议在 `task4ValueStream.js` 之后、`storage.js` 之前）。
- `main.js` 在脚本加载后通过 `window.runItStatusAnnotation` 获得入口；**调用时传入当前项**：`runItStatusAnnotation(currentProblemDetailItem)`，用于任务调度及「即将开始 IT 现状标注」确认回调。
- 用户点击「确认」IT 现状卡片时，由 `main.js` 将对应 `itStatusCard` 及最近一条 `task5LlmQueryBlock` 标记为已确认，并调用 `saveProblemDetailChat`、`renderProblemDetailHistory`、`showTaskCompletionConfirm('task5', 'IT 现状标注')`。
- **任务完成确认**：系统下发「是否确认 IT 现状标注任务已经完成？」（`showTaskCompletionConfirm` 对 task5 使用该文案）；用户点击「已完成」后，在时间线推送「任务完成」标签的卡片、内容为「用户确认任务完成」，并调用 `advanceProblemStateOnTaskComplete`、`showNextTaskStartNotification`，将当前任务切换到**痛点标注**（task6）。
- 「重做」会移除当前 `itStatusCard` 及紧随其后的完成类消息（若有），并再次调用 `runItStatusAnnotation(currentProblemDetailItem)`。
- 沟通历史时间线对 `task5LlmQueryBlock` 的展示（标签「LLM-查询」、输入/输出子卡片、副标题「IT 现状标注」）在 `js/communication-history.js` 中实现。
