## 任务4：价值流绘制模块（`js/task4ValueStream.js`）

> 最近更新：2026-03-19。与 main.js、js/storage.js、js/task4ValueStream.js 实现一致。

**模块职责**

- **负责调用大模型生成价值流图（VSM）**：基于「企业基本信息」「BMC 商业模式画布」「需求逻辑」三个输入维度，构造统一的 prompt，并通过 `fetchDeepSeekChat` 获取结果。
- **负责解析大模型返回**：支持新格式（单一 JSON，含 `logic_description` + `vsm_data`）与旧格式（Markdown 代码块 + 正文），将 `vsm_data` 存为价值流图数据、`logic_description` 存为设计逻辑说明。
- **负责将生成结果渲染为对话区卡片**：在「问题详情 - 对话区」中推送一张带有 JSON 展示与交互按钮的「价值流图设计 JSON」卡片。
- **负责写入与更新存储**：在数字化问题记录中保存 `valueStream`（即 vsm_data）、`valueStreamLogicText`（即 logic_description），并标记工作流对齐阶段的完成情况。
- **对外提供统一入口函数**：通过 `runValueStreamGeneration` 供任务调度（如任务通知确认按钮、任务执行指令）直接调用。

---

### 大模型输出格式与解析

**约定输出格式**（见 `main.js` 中 `VALUE_STREAM_PROMPT`）：

- 大模型**必须仅输出一个合法的 JSON 字符串**，不得包含 Markdown 标识、前言或后缀。
- JSON 结构：
  - `logic_description`：简述如何基于行业背景和规避瓶颈原则设计这套价值流。
  - `vsm_data`：绘图数据，含 `stages`（阶段与 tasks）、`connections`（任务间连接）。

**解析逻辑**（`runValueStreamGeneration` 内）：

1. **优先新格式**：对返回内容做 `JSON.parse`，若解析成功且存在 `vsm_data`（含 `stages` 或 `connections`），则：
   - `valueStream = parsed.vsm_data`（用于绘图与存储）；
   - `logicText = parsed.logic_description`（用于工作区「价值流设计逻辑」卡片与存储）。
2. **兼容旧格式**：若整段非合法 JSON，则从 `` ```json ... ``` `` 代码块或首段 `{...}` 中抽取 JSON 作为 `valueStream`；逻辑说明为去掉所有代码块后的正文。
3. 写入存储：`updateDigitalProblemValueStream(createdAt, valueStream)`、`updateDigitalProblemValueStreamLogicText(createdAt, logicText)`；并更新 `currentProblemDetailItem.valueStream`、`currentProblemDetailItem.valueStreamLogicText`。

---

### 工作区展示（main.js `renderProblemDetailContent`）

- **价值流设计逻辑卡片**（在价值流图卡片**上方**）：
  - 标题：「价值流设计逻辑」。
  - 内容来源：`item.valueStreamLogicText`（即大模型返回的 `logic_description`）；若无则从聊天中最后一条 `valueStreamCard.logicText` 兜底。
  - 展示格式：通过 `formatValueStreamLogicBody(rawText, escapeHtml)` 将带明确编号的段落（如 `1.` `2.`、`1)` `2)`、`一、` `二、`、`（1）`、`①②`）按要点罗列为 `<ul><li>` 列表，其余为段落。
- **价值流图**：根据 `item.valueStream`（即 vsm_data）调用 `renderValueStreamViewHTML(valueStream)` 渲染绘图；「价值流图 json」Tab 展示同一份 `valueStream` 的 JSON。

---

### 存储接口（js/storage.js）

- `updateDigitalProblemValueStream(createdAt, valueStream)`：写入价值流图数据（vsm_data），并推进 `workflowAlignCompletedStages`。
- `updateDigitalProblemValueStreamLogicText(createdAt, logicText)`：仅写入设计逻辑说明（logic_description），不改变阶段状态。  
  若使用 HTTP 存储适配器，上述接口会通过 `upd(createdAt, { ... })` 同步到服务端。

---

### 导出 API（挂载到 `window`）

模块使用 IIFE 形式定义，并将核心方法挂载到全局 `window` 对象上，供 `main.js` 及其他脚本直接使用。

#### `async generateValueStreamFromInputs(enterpriseInfo, bmcData, requirementLogic)`

```js
/**
 * 调用大模型，基于企业信息 / BMC / 需求逻辑生成价值流图。
 *
 * @param {Object|string} enterpriseInfo - 客户基本信息（对象或 JSON 字符串）。
 * @param {Object|string} bmcData - 商业模式画布 BMC（对象或 JSON 字符串）。
 * @param {Object|string} requirementLogic - 需求逻辑（对象或 JSON 字符串）。
 * @returns {Promise<{content: string, usage: any, model: string, durationMs: number}>}
 */
async function generateValueStreamFromInputs(enterpriseInfo, bmcData, requirementLogic) { /* ... */ }
```

- **输入**：`enterpriseInfo`（任务1/基础信息）、`bmcData`（任务2）、`requirementLogic`（任务3）。
- **行为**：将三块数据格式化为 Markdown + JSON 代码块，拼装为 `user` 消息；使用 `VALUE_STREAM_PROMPT` 作为 `system` 提示词，通过 `fetchDeepSeekChat` 发送会话；原样返回大模型的 `content` 以及 `usage`、`model`、`durationMs` 元数据。

#### `async runValueStreamGeneration()`

```js
/**
 * 执行任务4：生成价值流图，并在对话区推送结果卡片、写入存储。
 *
 * 使用方式：
 * - 由任务调度入口调用：`runValueStreamGeneration()`
 * - 由「开始绘制价值流」确认按钮回调中调用。
 *
 * @returns {Promise<void>}
 */
async function runValueStreamGeneration() { /* ... */ }
```

- **前置依赖（从全局获取）**：
  - `el.problemDetailChatMessages`、`currentProblemDetailItem`（或 `getCurrentProblemDetailItem()`）、`hasAiConfig()`、`problemDetailConfirmedBasicInfo`；
  - `fetchDeepSeekChat`、`VALUE_STREAM_PROMPT`；
  - `pushOperationToHistory`、`pushAndSaveProblemDetailChat`；
  - `updateDigitalProblemValueStream`、`updateDigitalProblemValueStreamLogicText`；
  - `buildLlmMetaHtml`、`renderProblemDetailContent`。

- **执行流程**（高层视角）：
  1. 校验当前是否存在选中的问题记录以及 AI 配置是否完整；
  2. 从当前问题中提取 `basicInfo`、`bmc`、`requirementLogic`；
  3. 在对话区插入加载中提示；
  4. 调用 `generateValueStreamFromInputs(...)` 获取大模型返回内容；
  5. 按「大模型输出格式与解析」一节解析出 `valueStream`（vsm_data）与 `logicText`（logic_description）；
  6. 写入问题操作历史（`valueStreamDraw`）、对话区消息（`valueStreamCard`，含 `data`、`logicText`）；
  7. 在 UI 上渲染「价值流图设计 JSON」卡片；
  8. 调用 `updateDigitalProblemValueStream`、`updateDigitalProblemValueStreamLogicText` 写入存储，并更新 `currentProblemDetailItem`；
  9. 调用 `renderProblemDetailContent` 刷新右侧工作区（含价值流设计逻辑卡片与价值流图）。

- **错误处理**：未配置 AI 时在对话区推送提示并返回；大模型调用或解析失败时追加「价值流图生成失败」错误卡片并写入系统消息。

---

### 与主流程的集成关系

- 在 `index.html` 中通过 `<script src="js/task4ValueStream.js"></script>` 引入，保证在 `main.js` 之前加载；
- `main.js` 中的任务调度入口在需要执行任务4时调用全局 `runValueStreamGeneration()`；
- 「开始绘制价值流」的会话卡片点击确认后，同样复用该入口；
- 工作区「价值流设计逻辑」与价值流图的渲染、`formatValueStreamLogicBody` 均在 `main.js` 的 `renderProblemDetailContent` 中完成。
