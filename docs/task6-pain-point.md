## 任务6：痛点标注模块（`js/task6PainPoint.js`）

> 最近更新：2026-03-19。与 main.js、js/task6PainPoint.js、js/communication-history.js 实现一致。

**模块职责**

- **整图一次标注**：基于「价值流图」与「需求逻辑」，调用大模型为所有环节一次性标注 `painPoint`，解析 JSON 后通过 `mergePainPointIntoValueStream` 合并进原始价值流图，更新存储并推进工作流阶段（0、1、2），推送完成态卡片并触发下一任务通知。
- **按环节单步标注**：根据 `painPointSessions` 列表逐环节调用大模型，推送 `painPointStepCard`（展示该环节大模型返回的痛点信息，下方含确认、重做、修正、讨论四个按钮）。**每次 session 的大模型调用均向时间线推送标签为「LLM-查询」的内容卡片**（`task6LlmQueryBlock`），标签右侧标注**环节名称**，内部包含输入/输出子卡片，承载大模型输入（fullPrompt）与输出（llmOutputRaw）的完整数据，设计借鉴 task1～5 的 LLM-查询 块。支持「手动顺序执行」与「自动顺序执行」：手动顺序即用户点击「手动顺序执行」后系统按第一到最后一个 session 顺序执行，每环节 LLM 调用结束后在聊天区发送该环节内容块与四按钮，用户点击「确认」后系统再自动进行下一 session 环节的大模型调用；自动顺序则无需用户逐环节确认，由系统自动确认并连续执行直至全部完成。
- **会话与存储**：`generatePainPointSessions` 根据价值流图生成环节 session 列表；`applyPainPointStepConfirm` 将单步确认写回存储并刷新 UI，全部环节标注完成时返回 `true`，供主流程弹出任务完成确认。
- **对外入口**：通过 `runPainPointAnnotation(optionalItem, isRerun)`、`runPainPointAnnotationForNextStep(optionalItem)`、`runPainPointAnnotationAutoSequential(optionalItem)`、`applyPainPointStepConfirm(createdAt, stepIndex, painPointText)`、`generatePainPointSessions(valueStream)` 供 main 及任务调度使用；因 main 中 `currentProblemDetailItem` 为 let 不挂载到 window，主流程调用时需传入当前项。

---

### 大模型输出格式与解析

**整图标注**（`PAIN_POINT_ANNOTATION_PROMPT`）：

- 大模型返回一个与输入 `value_stream` 结构一致的 JSON 代码块，在每个 step 中**仅新增** `painPoint` 字段（字符串，该环节痛点的精炼概括）；若无明显痛点可留空或「无明显痛点」。

**解析与合并**（`runPainPointAnnotation` 内）：

1. 从 `content` 中抽取 JSON（优先 `` ```json ... ``` ``，否则首段 `{...}`）。
2. 调用 `mergePainPointIntoValueStream(baseVs, annotatedVs)`：按 `stages`/`steps` 下标一一对应，将 `annotatedVs` 中每个 step 的 `painPoint` 写入 base 对应 step；若为「无明显痛点」等则保留原 step 不写。
3. 使用合并后的价值流图更新存储（`updateDigitalProblemValueStreamPainPoint`）与 `currentProblemDetailItem`，并推进 `workflowAlignCompletedStages`（0、1、2）。

**单环节标注**（`generatePainPointForOneStep`）：

- 仅针对指定环节构造 prompt，大模型直接返回该环节的痛点文案（非 JSON），模块将返回值作为该环节的 `painPoint` 文案使用。

---

### 主要方法（JSDoc 描述）

模块使用 IIFE 形式定义，并将以下方法挂载到全局 `window`，供 `main.js` 及任务调度使用。

#### `async runPainPointAnnotation(optionalItem, isRerun)`

```js
/**
 * 痛点标注主流程（整图一次标注）：校验 AI 配置与当前项 → 调用大模型 → 解析 JSON → 合并 painPoint → 更新存储并推进阶段。
 *
 * @param {Object} [optionalItem] - 当前问题详情项（main 调用时传入 currentProblemDetailItem）。
 * @param {boolean} [isRerun=false] - 是否为重做（文案区分「痛点标注完毕」/「痛点标注完成」）。兼容旧用法：仅传一个 boolean 时视为 isRerun。
 * @returns {Promise<void>}
 */
async function runPainPointAnnotation(optionalItem, isRerun) { /* ... */ }
```

- **输入**：`optionalItem` 可选，若传入且含 `createdAt` 则使用，否则回退到 `global.currentProblemDetailItem`；`isRerun` 可选，为 true 时完成文案为「痛点标注完毕」。
- **行为**：未配置 AI 时在对话区追加提示并返回；插入加载块 → 调用 `generatePainPointAnnotation` → 解析 JSON → `mergePainPointIntoValueStream` → `pushOperationToHistory`、`updateDigitalProblemValueStreamPainPoint`、更新 `currentProblemDetailItem` 与 `workflowAlignCompletedStages` → 推送完成态卡片 → `showNextTaskStartNotification`。异常时追加「痛点标注失败」。

---

#### `async runPainPointAnnotationForNextStep(optionalItem)`

```js
/**
 * 执行下一个未标注环节的痛点标注（单步），推送痛点卡片。
 *
 * @param {Object} [optionalItem] - 当前问题详情项。
 * @returns {Promise<{stepIndex: number, painPointText: string}|null>}
 *   成功时返回 { stepIndex, painPointText }，无下一环节或失败时返回 null。
 */
async function runPainPointAnnotationForNextStep(optionalItem) { /* ... */ }
```

- **输入**：`optionalItem` 同上，用于取 `painPointSessions`、`valueStream`、`requirementLogic`。
- **行为**：在 `painPointSessions` 中找第一个未标注环节；推送「正在标注环节【xxx】的痛点…」→ 清空聊天容器后通过 `getProblemDetailChatMessages()` 取当前消息数组并 `renderProblemDetailChatFromStorage` 重绘 → 调用 `generatePainPointForOneStep`（返回含 `fullPrompt`）→ **先推送 `task6LlmQueryBlock`**（stepName、llmInputPrompt、llmOutputRaw、llmMeta）→ 再推送 `painPointStepCard` 并刷新内容与历史。返回 `{ stepIndex, painPointText }` 供确认按钮调用 `applyPainPointStepConfirm`；无下一环节或未配置 AI 时返回 null。

---

#### `applyPainPointStepConfirm(createdAt, stepIndex, painPointText)`

```js
/**
 * 确认单步痛点并写回存储；刷新会话与 UI。
 *
 * @param {string|number} createdAt - 问题创建时间。
 * @param {number} stepIndex - 环节下标。
 * @param {string} painPointText - 该环节痛点文案。
 * @returns {boolean} 是否全部环节已标注（是则主流程可弹出任务完成确认）。
 */
function applyPainPointStepConfirm(createdAt, stepIndex, painPointText) { /* ... */ }
```

- **行为**：调用 `updateDigitalProblemPainPointStep`；通过 `getProblemDetailChatMessages()` 取当前消息数组，找到对应 `painPointStepCard` 并标记 `confirmed: true`、更新 `content`，调用 `saveProblemDetailChat`；从 `getDigitalProblems` 取最新项更新 `currentProblemDetailItem`；重渲染对话区（同样通过 getter 取消息数组传入 `renderProblemDetailChatFromStorage`）与历史；若所有 session 的 `painPoint` 均已填写则返回 true。

---

#### `generatePainPointSessions(valueStream)`

```js
/**
 * 根据价值流生成痛点标注 session 列表（环节列表），用于「痛点标注 session 计划确认」卡片。
 *
 * @param {Object} valueStream - 价值流图（含 stages/steps 或由 parseValueStreamGraph 解析的结构）。
 * @returns {Array<{stepName: string, stepIndex: number, stageName: string, painPoint: null}>}
 */
function generatePainPointSessions(valueStream) { /* ... */ }
```

- **行为**：通过 `parseValueStreamGraph` 得到 `stages`，按顺序遍历每个 stage 的 steps，生成 `{ stepName, stepIndex, stageName, painPoint: null }` 数组；main 中在进入 task6 或用户确认「即将开始痛点标注」时调用，并写入 `updateDigitalProblemPainPointSessions`、`currentProblemDetailItem.painPointSessions`。

---

#### `async generatePainPointAnnotation(valueStream, requirementLogic)`

```js
/**
 * 调用大模型，基于价值流图与需求逻辑为所有环节一次性标注痛点。
 *
 * @param {Object|string} valueStream - 价值流图。
 * @param {Object|string} requirementLogic - 需求逻辑。
 * @returns {Promise<{content: string, usage: object, model: string, durationMs: number}>}
 */
async function generatePainPointAnnotation(valueStream, requirementLogic) { /* ... */ }
```

- **行为**：将 `requirement_logic` 与 `value_stream` 格式化为 user 消息，以 `PAIN_POINT_ANNOTATION_PROMPT` 为 system，调用 `fetchDeepSeekChat`；返回 `content`、`usage`、`model`、`durationMs`。由 `runPainPointAnnotation` 内解析 JSON 并合并。

---

#### `async generatePainPointForOneStep(stepName, stageName, valueStream, requirementLogic)`

```js
/**
 * 单环节痛点标注：仅针对指定环节调用大模型，返回该环节的痛点文案。
 *
 * @param {string} stepName - 环节名称。
 * @param {string} stageName - 阶段名称。
 * @param {Object|string} valueStream - 价值流图。
 * @param {Object|string} requirementLogic - 需求逻辑。
 * @returns {Promise<{content: string, usage: object, model: string, durationMs: number, fullPrompt: string}>}
 *   - content: 该环节的痛点文案（已 trim）；fullPrompt: 完整输入（system + user），供时间线 LLM-查询 输入子卡片使用。
 */
async function generatePainPointForOneStep(stepName, stageName, valueStream, requirementLogic) { /* ... */ }
```

- **行为**：构造仅针对该环节的 user 内容，拼装 `fullPrompt`（system + 分隔 + userContent），以 `PAIN_POINT_ANNOTATION_PROMPT` 为 system 调用 `fetchDeepSeekChat`；将返回的 `content` trim 后与 `fullPrompt` 一并返回。由 `runPainPointAnnotationForNextStep` 使用并写入 `task6LlmQueryBlock.llmInputPrompt`。

---

#### `mergePainPointIntoValueStream(baseVs, annotatedVs)`

```js
/**
 * 将大模型返回的「带 painPoint 的价值流」合并进原始价值流图，按阶段/环节下标一一对应写入 painPoint。
 *
 * @param {Object} baseVs - 原始价值流图（含 stages/steps 或 phases/nodes）。
 * @param {Object} annotatedVs - 大模型返回的带 painPoint 的价值流图。
 * @returns {Object} 合并后的价值流图，保留 baseVs 的其余字段，仅在各 step 上增加或覆盖 painPoint（排除「无明显痛点」等）。
 */
function mergePainPointIntoValueStream(baseVs, annotatedVs) { /* ... */ }
```

- **行为**：按 `baseVs.stages[i].steps[j]` 与 `annotatedVs.stages[i].steps[j]` 一一对应；若 annotated step 的 `painPoint`/`pain_point` 非空且非「无明显痛点」等，则写入 base step 的 `painPoint`；否则保留 base step 原样。返回新对象。

---

#### `async runPainPointAnnotationAutoSequential(optionalItem)`

```js
/**
 * 自动顺序执行：循环执行下一未标注环节直到全部完成，每步自动确认并继续。
 *
 * @param {Object} [optionalItem] - 当前问题详情项。
 * @returns {Promise<void>}
 */
async function runPainPointAnnotationAutoSequential(optionalItem) { /* ... */ }
```

- **行为**：禁用「自动顺序」按钮后进入循环：`runPainPointAnnotationForNextStep` → 若返回结果则 `applyPainPointStepConfirm`；若 `allDone` 则 `showTaskCompletionConfirm('task6', '痛点标注')` 并退出；否则用 `getDigitalProblems` 刷新 `currentProblemDetailItem` 继续下一环节。循环结束后根据是否还有未完成 session 恢复按钮的 disabled 状态。

---

### 依赖（由页面其他脚本提供的全局）

- **配置与工具**：`hasAiConfig`、`fetchDeepSeekChat`、`getTimeStr`、`escapeHtml`、`DELETE_CHAT_MSG_ICON`
- **状态与渲染**：`el`、`currentProblemDetailItem`、`renderProblemDetailContent`、`buildLlmMetaHtml`、`renderProblemDetailChatFromStorage`、**`getProblemDetailChatMessages`**（main 提供的 getter，返回当前 `problemDetailChatMessages` 数组；因 main 中该变量为 let 未挂 window，模块重绘聊天区时需通过此 getter 获取，避免传入空数组导致聊天内容被清空）
- **会话与历史**：`pushAndSaveProblemDetailChat`、`pushOperationToHistory`、`saveProblemDetailChat`
- **价值流解析**：`parseValueStreamGraph`（来自 `js/valueStream.js`）
- **存储**：`updateDigitalProblemValueStreamPainPoint`、`updateDigitalProblemPainPointStep`、`updateDigitalProblemPainPointSessions`、`getDigitalProblems`
- **导航**：`showNextTaskStartNotification`、`showTaskCompletionConfirm`
- **任务列表**：`FOLLOW_TASKS`

---

### 与主流程的集成关系

- 在 `index.html` 中通过 `<script src="js/task6PainPoint.js"></script>` 引入（在 `task5ItStatus.js` 之后、`storage.js` 之前）。
- `main.js` 在脚本加载后从 `window` 取得：`runPainPointAnnotation`、`runPainPointAnnotationForNextStep`、`applyPainPointStepConfirm`、`runPainPointAnnotationAutoSequential`、`generatePainPointSessions`；**调用时传入当前项**：`runPainPointAnnotation(currentProblemDetailItem, false)`、`runPainPointAnnotationForNextStep(currentProblemDetailItem)`、`runPainPointAnnotationAutoSequential(currentProblemDetailItem)`。
- **进入 task6**：当 taskId 为 task6 且存在 valueStream 时，main 调用 `generatePainPointSessions(valueStream)`，写入 `painPointSessions` 并推送 `painPointSessionsBlock`；若无 session 计划则直接调用 `runPainPointAnnotation(currentProblemDetailItem, false)`。
- **「即将开始痛点标注」确认**：用户确认后 main 同样调用 `generatePainPointSessions(valueStream)` 并推送 session 与上下文；否则调用 `runPainPointAnnotation(currentProblemDetailItem)`。
- **任务执行器**：`task6: () => runPainPointAnnotation(currentProblemDetailItem, true)`（重做场景）。
- **按钮事件**：「自动顺序」→ `runPainPointAnnotationAutoSequential(currentProblemDetailItem)`；「手动顺序执行」→ `runPainPointAnnotationForNextStep(currentProblemDetailItem)`（从第一个到最后一个 session 按顺序，每次只执行一个环节）。「确认」痛点单步 → `applyPainPointStepConfirm(...)`；若全部完成则弹出任务完成确认；若未全部完成则**自动触发下一 session 环节的大模型调用**（刷新 `currentProblemDetailItem` 后调用 `runPainPointAnnotationForNextStep`），实现“确认后继续下一环节”的手动顺序执行流程。
- **任务完成确认**：用户点击「已完成」后，与 task5 类似，推进状态并切换到下一任务（如 task7）。
- **时间线 LLM-查询**：沟通历史（`js/communication-history.js`）对 `task6LlmQueryBlock` 的展示与 task1～5 一致：标签「LLM-查询」、右侧备注为**环节名称**（`stepName`）、输入/输出双子卡片及 token/耗时（来自 `llmMeta`）。用户点击痛点单步卡片的「确认」时，main 将对应 `painPointStepCard` 及最近一条 `task6LlmQueryBlock` 标记为已确认。

---

### 重启当前（痛点标注任务）

在痛点标注任务（task6）下，用户点击「重启当前」按钮后，系统将**清空该任务已形成的痛点标注工作区、沟通历史过程日志与聊天区内容**，不改变当前任务仍为 task6，并重新下发任务启动通知。

- **工作区清空**：由 main 的 `applyRestartCurrentTask` → `buildItemClearCurrentTaskOnly` → `buildItemAfterRollbackToTask(item, 'task6')` 实现。task6 分支中：将 `painPointSessions` 置为 `undefined`；从 `valueStream` 各 stage 的 steps 中移除每个 step 的 `painPoint`/`pain_point` 字段（价值流结构保留，仅去掉痛点标注结果）；`workflowAlignCompletedStages` 去掉 2。更新后的 item 经 `restoreItemFromSnapshot` 写回存储，`renderProblemDetailContent` 重绘后工作区不再显示环节列表与各环节痛点内容。
- **聊天区与过程日志清空**：`filterChatMessagesRemoveTask(chats, 'task6')` 移除所有归属 task6 的消息；过滤后的数组经 `saveProblemDetailChat` 写回，`problemDetailChatMessages` 与聊天区重绘后不再包含 task6 相关条目。沟通历史（`js/communication-history.js`）中 `inferTaskIdFromMessage` 将下列消息归为 task6，故均会被移除：`task6LlmQueryBlock`、`painPointStartBlock`、`painPointStepCard`、`painPointSessionsBlock`、`taskContextBlock`（taskId 为 task6）、以及系统消息（如「痛点标注完成/完毕/失败」、含「正在标注环节」且「痛点」的文案）。
- **任务启动通知**：`applyRestartCurrentTask` 末尾调用 `showTaskStartNotificationIfNeeded(taskId, true)`，会再次在聊天区下发「我即将开始【痛点标注】任务」的通知与确认按钮。
