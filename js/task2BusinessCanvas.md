# 商业画布加载模块（task2BusinessCanvas.js）设计说明

> 最近更新：2026-03-18。与 `main.js` 中 task2（商业画布加载）流程保持一致。

## 1. 模块定位

`task2BusinessCanvas.js` 负责商业画布加载（Task2）的核心可复用逻辑，目标是把 task2 的 BMC 生成、解析与时间线消息构建从 `main.js` 解耦。

当前模块职责：

- 商业模式画布（BMC）生成用系统提示词与 Markdown 兜底解析；
- 基于客户基本信息调用大模型生成 BMC（JSON 或 Markdown 解析）；
- Task2 `LLM-查询` 时间线消息的标准化构建（`task2LlmQueryBlock`）。

非职责（仍由 `main.js` 负责）：

- 聊天区 BMC 卡片 DOM 渲染与「确认/重做/修正/讨论」按钮事件；
- 问题单 BMC 状态推进、存储回写、任务完成确认；
- `runBmcGeneration` 的完整流程（加载态、基本信息 json 块、推送消息、渲染历史）。

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

### 3.1 `generateBmcFromBasicInfo(basicInfoJson)`

**作用**：根据客户基本信息（JSON 或字符串）调用大模型，生成商业模式画布（BMC）结构化结果。

**入参**：

- `basicInfoJson: Object | string`：客户基本信息对象或已序列化的 JSON 字符串。

**返回**（`Promise<Task2BmcLlmResult>`）：

- `parsed`：解析后的 BMC 对象（含 industry_insight、pain_points、BMC 九宫格字段等）；
- `usage`：大模型 token 使用统计；
- `model`：模型名称；
- `durationMs`：本次调用耗时（毫秒）；
- `fullPrompt`：完整提示词（system + user）；
- `rawOutput`：模型原始输出文本（优先为 JSON 片段，否则全文；用于兜底展示）。

**解析逻辑**：

- 优先从返回内容中提取 `{...}` 并 `JSON.parse`；
- 若解析失败或无 JSON 片段，则使用 `parseBmcFromMarkdown(content)` 按 Markdown 章节解析。

**异常**：

- 当 `fetchDeepSeekChat` 不可用时抛出错误；调用方（如 `runBmcGeneration`）负责捕获并展示失败信息。

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

- **BMC_GENERATION_PROMPT**：BMC 生成的 system 提示词（Role / Task / Input / Analysis Logic / Output Format）。
- **BMC_LABEL_TO_KEY**：Markdown 中 BMC 表头（如「客户细分」「价值主张」）到字段 key 的映射。
- **parseBmcFromMarkdown(text)**：从 Markdown 文本中解析 BMC 结构（当大模型未返回纯 JSON 时兜底使用），依赖 `BMC_FIELDS` 与 `BMC_LABEL_TO_KEY`。

---

## 5. 与主流程的关系

`main.js` 在 task2 的流程中复用该模块：

- **runBmcGeneration**：调用 `window.generateBmcFromBasicInfo(problemDetailConfirmedBasicInfo)` 获取 BMC，再使用 `window.buildTask2LlmQueryMessage(...)` 构建并推送 `task2LlmQueryBlock`，随后推送 `bmcCard` 并渲染 BMC 聊天卡片。

沟通历史模块（`communication-history.js`）根据 `task2LlmQueryBlock` 在 task2 过程日志中渲染「商业画布提炼」LLM-查询 块（输入/输出双子卡片、确认标签等），与 task1 的「初步需求提炼」/「工商信息提炼」样式一致。
