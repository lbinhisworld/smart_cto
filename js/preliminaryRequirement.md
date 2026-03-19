# 初步需求提炼与展示模块（preliminaryRequirement.js）设计说明

> 最近更新：2026-03-19。与 `main.js` 中首页「解析」及问题详情「初步需求」展示流程保持一致。

## 1. 模块定位

`preliminaryRequirement.js` 负责**初步需求**的提炼与展示逻辑，将首页解析与工作区初步需求卡片从 `main.js` 解耦。

**当前职责**：

- 首页「解析」多维度提炼：调用大模型对用户输入进行结构化提取（`parseDigitalProblemInput`），输出含运营模式、经营状态、紧急度等字段的 JSON。
- 解析预览与问题详情「初步需求」卡片的字段定义与 HTML 生成（`PARSE_PREVIEW_FIELDS`、`getPreliminaryCardLabels`、`getPreliminarySummaryCardLabels`、`renderParsePreview`、`buildPreliminaryCardRowsHtml`、`buildPreliminaryHistoryHtml`、`formatPreliminaryHistoryTime`）。
- 初步需求字段的路径取值与标签映射（`getByPath`、`PRELIMINARY_LABEL_TO_KEY`、`buildPreliminaryPreContent`），供意图修改、上下文组装等使用。

**非职责**（仍由 `main.js` 负责）：

- 首页解析按钮事件、`lastParsedResult` / `lastParsedLlmQuery` 的存储与「启动跟进」时写入档案；
- 问题详情工作区的整体渲染与卡片挂载；
- 意图提炼、修改目标定位中与 BMC/需求逻辑等其它任务的联动。

---

## 2. 依赖与加载

### 2.1 运行时依赖

| 依赖 | 来源 | 用途 |
|------|------|------|
| `fetchDeepSeekChat` | `global`（如 `js/api.js` 挂载） | 调用大模型执行初步需求提炼 |
| `DEEPSEEK_MODEL` | `global`（可选） | 解析结果 llmMeta 的 model 默认值 |

### 2.2 加载顺序

在 `index.html` 中，本模块位于 `js/api.js` 之后、`main.js` 之前（与 task1BusinessInsight、task2BusinessCanvas 等并列）。

---

## 3. 对外方法与常量

### 3.1 `parseDigitalProblemInput(text)`

**作用**：对用户输入的企业需求进行多维度提炼，返回结构化 JSON 及本次调用元数据。

**入参**：

- `text: string` — 用户输入的原始需求描述（首页输入框内容）。

**返回**（`Promise<PreliminaryLlmResult>`）：

- `parsed` — 解析后的初步需求对象（含 `customerName`、`customerNeedsOrChallenges`、`customerItStatus`、`projectTimeRequirement`、`operationModel`、`businessStatus`、`urgencyAnalysis` 等；`requirementDetail` 由调用方在「启动跟进」时写入）。
- `fullPrompt` — 完整提示词（system + user），供时间线等展示。
- `rawOutput` — 模型原始 JSON 文本。
- `llmMeta` — `{ usage, model, durationMs }`，供过程日志统计与展示。

**异常**：当 `fetchDeepSeekChat` 不可用或返回内容无法解析为 JSON 时抛出，由调用方（如 `handleParseClick`）捕获并提示。

**提示词**：见模块内常量 `PRELIMINARY_SYSTEM_PROMPT`，约束包括分层提取、逻辑推断（如“二期”依赖）、缺失填 "—"、严格 JSON 纯文本。

---

### 3.2 `getByPath(obj, path)`

**作用**：按路径从对象中取值，支持嵌套 key（如 `operationModel.businessProcess`）。

**入参**：

- `obj: Object` — 源对象。
- `path: string` — 路径，多级用 `.` 分隔。

**返回**：路径对应的值，不存在则为 `undefined`。

---

### 3.3 `PARSE_PREVIEW_FIELDS`

**类型**：`Array<{ key: string, label: string }>`。

**说明**：解析预览（首页）展示的字段配置。`key` 可为简单 key 或路径（如 `urgencyAnalysis.urgencyLevel`）；`label` 为展示名称。顺序与问题详情「初步需求」卡片一致，末尾为「需求详情」。

---

### 3.4 `getPreliminaryCardLabels()`

**作用**：返回初步需求完整行配置（与 `PARSE_PREVIEW_FIELDS` 一致，含「需求详情」），供解析预览、意图修改等使用。

**返回**：`Array<{ key: string, label: string }>`。

---

### 3.5 `getPreliminarySummaryCardLabels()`

**作用**：返回「总结提炼」Tab 专用行配置（在 `getPreliminaryCardLabels()` 基础上排除 `requirementDetail`）。需求详情仅在「历史详情」Tab 中按时间线展示。

**返回**：`Array<{ key: string, label: string }>`。

---

### 3.6 `PRELIMINARY_LABEL_TO_KEY`

**类型**：`Object<string, string>`。

**说明**：展示标签到字段 key（或嵌套路径）的映射，供意图修改等定位到「初步需求」某一项时使用。例如：`'经营状态' => 'businessStatus'`，`'最紧急/第一阶段' => 'urgencyAnalysis.immediatePriorities'`。

---

### 3.7 `renderParsePreview(parsed, contentEl, previewEl, escapeHtml)`

**作用**：根据解析结果渲染解析预览区域 HTML，并控制预览面板显隐。

**入参**：

- `parsed: Object` — 解析结果对象（含各字段及嵌套 `operationModel`、`urgencyAnalysis`）。
- `contentEl: HTMLElement | undefined` — 解析预览内容容器（如 `parsePreviewContent`），用于设置 `innerHTML`。
- `previewEl: HTMLElement | undefined` — 解析预览外层容器（如 `parsePreview`），用于设置 `hidden = false`。
- `escapeHtml: function(string): string` — 转义 HTML 的函数，避免 XSS。

**行为**：向 `contentEl` 写入 `<dt>/<dd>` 列表；若传入 `previewEl` 则令其 `hidden = false`。

---

### 3.8 `buildPreliminaryCardRowsHtml(item, escapeHtml)`

**作用**：生成问题详情「初步需求」卡片 **「总结提炼」Tab** 的行 HTML（多行 `.problem-detail-row`）。内部使用 `getPreliminarySummaryCardLabels()`，故**不包含「需求详情」行**；需求详情在「历史详情」Tab 中按时间线展示。

**入参**：

- `item: Object` — 当前问题项（含 `customerName`、`operationModel`、`urgencyAnalysis` 等）。
- `escapeHtml: function(string): string` — 转义 HTML 的函数。

**返回**：拼接后的 HTML 字符串，插入 `.problem-detail-card-body-detail`。

---

### 3.9 `formatPreliminaryHistoryTime(timestamp)`

**作用**：将 ISO 或可解析的时间字符串格式化为本地日期时间（如 `zh-CN` 的 `YYYY/MM/DD HH:mm:ss`），用于历史详情时间线展示。

**入参**：`timestamp: string`。

**返回**：格式化后的字符串，解析失败时返回原字符串。

---

### 3.10 `buildPreliminaryHistoryHtml(item, escapeHtml)`

**作用**：生成「历史详情」Tab 内容 HTML：按时间线展示历次提交的需求详情，每项为可折叠块（`.preliminary-history-item`），标题行为时间戳（`.preliminary-history-item-header`），展开后显示该次提交的原始需求文本（`.preliminary-history-item-body`）。

**入参**：

- `item: Object` — 当前问题项；若含 `requirementDetailHistory`（`Array<{ timestamp, content }>`）则按该数组渲染；否则用 `requirementDetail` + `createdAt` 生成一条。
- `escapeHtml: function(string): string` — 转义 HTML 的函数。

**返回**：历史时间线 HTML 字符串，插入 `.problem-detail-card-body-json`。展开/收起由 `main.js` 的 `setupPreliminaryHistoryItemToggle(container)` 在卡片上做事件委托（根据 `hidden` 属性切换显示）。

---

### 3.11 `buildPreliminarySummaryJson(item)`

**作用**：构建「总结提炼」专用 JSON（不含需求详情），供时间线「客户初步需求 json」内容块与 BMC 生成入参使用。开启商业画布加载任务时，推送到时间线的「客户初步需求 json」及调用 `generateBmcFromBasicInfo` 时传入的初步需求均使用本方法，与工作区初步需求卡片的「总结提炼」Tab 内容一致。

**入参**：

- `item: Object` — 当前问题项，可含 `preliminaryReq` 或顶层字段（含蛇形键兼容）。

**返回**：仅含 `customerName`、`customerNeedsOrChallenges`、`customerItStatus`、`projectTimeRequirement`、`operationModel`、`businessStatus`、`urgencyAnalysis` 的对象。

---

### 3.12 `buildPreliminaryPreContent(item)`

**作用**：构建「初步需求（整块）」的 preContent 对象，供意图修改时整块替换或上下文使用。

**入参**：

- `item: Object` — 当前问题项。

**返回**：包含 `customerName`、`customerNeedsOrChallenges`、`customerItStatus`、`projectTimeRequirement`、`operationModel`、`businessStatus`、`urgencyAnalysis`、`requirementDetail` 等键的对象（未定义字段不强制存在）。

---

## 4. 问题详情「初步需求」卡片 UI 设计

- **双 Tab**：卡片头部提供两个 Tab——**总结提炼**（`data-tab="detail"`）、**历史详情**（`data-tab="json"`）；与其它卡片一致，由 `setupProblemDetailCardToggle()` 切换 `.problem-detail-card-body-detail` 与 `.problem-detail-card-body-json` 的显隐。
- **总结提炼**：展示大模型返回的各维度字段（客户名称、核心需求或痛点、IT 现状、项目时间要求、核心业务流程梳理、人员组织模式、经营状态、最紧急/第一阶段、可二期或后续、整体紧急程度），**不展示「需求详情」**；内容由 `buildPreliminaryCardRowsHtml(item, escapeHtml)` 生成。
- **历史详情**：按时间线展示历次提交的需求详情；每条为可折叠块，标题行为时间戳（由 `formatPreliminaryHistoryTime` 格式化），点击标题行展开/收起，展开后显示该次提交的原始需求文本。内容由 `buildPreliminaryHistoryHtml(item, escapeHtml)` 生成；展开/收起由 `main.js` 的 `setupPreliminaryHistoryItemToggle(container)` 在「初步需求」卡片上做事件委托，通过 `body.removeAttribute('hidden')` / `body.setAttribute('hidden', '')` 及父节点 class `preliminary-history-item-expanded` 控制，样式见 `styles.css`（`.preliminary-history-item-body[hidden] { display: none !important; }` 等）。

**数据**：首次「启动跟进」时由 `main.js` 写入 `requirementDetailHistory: [{ timestamp, content }]`；后续若支持多次提交需求详情，可向该数组追加。存储与 HTTP 适配器（`storage.js`、`storage-http-adapter.js`）对 `requirementDetailHistory` 做持久化与前后端字段映射。

---

## 5. 与主流程的关系

- **首页解析**：`main.js` 的 `handleParseClick` 调用 `parseDigitalProblemInput(text)`，将结果与 `requirementDetail: text` 合并为 `lastParsedResult`，并调用 `renderParsePreview(parsed, el.parsePreviewContent, el.parsePreview, escapeHtml)` 更新预览。
- **问题详情**：`renderProblemDetailContent` 中「初步需求」卡片使用双 Tab；总结提炼面板用 `buildPreliminaryCardRowsHtml(item, escapeHtml)` 生成行 HTML，历史详情面板用 `buildPreliminaryHistoryHtml(item, escapeHtml)` 生成时间线 HTML；渲染后调用 `setupPreliminaryHistoryItemToggle(container)` 绑定历史条目的展开/收起。
- **商业画布加载（task2）**：开启任务时向时间线推送的「客户初步需求 json」及调用 `generateBmcFromBasicInfo` 时的初步需求入参，均使用 `buildPreliminarySummaryJson(item)`，与工作区「总结提炼」内容一致（不含需求详情）。
- **意图修改**：`getCurrentContentAtModificationTarget` 中针对「初步需求」的字段定位使用 `PRELIMINARY_LABEL_TO_KEY` 与 `getByPath(item, preKey)`；整块 preContent 使用 `buildPreliminaryPreContent(item)` 序列化。

提示词全文与约束见 `PROMPTS.md` §1（解析数字化问题输入 / 初步需求多维度提炼）。
