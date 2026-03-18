# 企业背景洞察模块（task1BusinessInsight.js）设计说明

> 最近更新：2026-03-19。与 `main.js` 中 task1（企业背景洞察）流程保持一致。

## 1. 模块定位

`task1BusinessInsight.js` 负责企业背景洞察（Task1）的核心可复用逻辑，目标是把 task1 的大模型调用与时间线消息构建从 `main.js` 解耦。

当前模块职责：

- 工商信息提炼的大模型调用与 JSON 解析；
- Task1 `LLM-查询` 时间线消息的标准化构建（统一字段结构）。

非职责（仍由 `main.js` 负责）：

- 聊天区卡片 DOM 渲染与按钮事件；
- 问题单状态推进、存储回写、页面切换；
- 历史时间线聚合与 UI 展示。

---

## 2. 依赖与加载

### 2.1 运行时依赖

| 依赖 | 来源 | 用途 |
|------|------|------|
| `fetchDeepSeekChat` | `js/api.js` | 调用大模型提炼工商信息 |

### 2.2 加载顺序

在 `index.html` 中，该模块位于：

- `js/api.js` 之后（保证大模型调用函数已挂载）；
- `main.js` 之前（保证主流程可直接调用）。

---

## 3. 对外方法

## 3.1 `parseCompanyBasicInfoInput(text)`

**作用**：将用户输入的工商信息文本提交给大模型并解析为结构化 JSON。

**入参**：

- `text: string`：用户输入内容（自由文本或粘贴信息）。

**返回**（`Task1BasicInfoLlmResult`）：

- `parsed`：解析后的工商信息 JSON；
- `usage`：token 使用统计；
- `model`：模型名称；
- `durationMs`：耗时（毫秒）；
- `fullPrompt`：完整提示词（system + user）；
- `rawOutput`：模型原始 JSON 文本（兜底展示）。

**异常**：

- 当 `fetchDeepSeekChat` 不可用时抛错；
- 当模型返回内容无法解析为 JSON 时抛错（由调用方捕获并展示失败信息）。

---

## 3.2 `buildTask1LlmQueryMessage(args)`

**作用**：统一构建可入库的 task1 时间线消息对象（`task1LlmQueryBlock`）。

**入参**（`Task1LlmQueryMessageArgs`）：

- `noteName`：备注名（如「初步需求提炼」「工商信息提炼」）；
- `fullPrompt`：完整提示词；
- `parsed`：结构化输出；
- `rawOutput`：原始输出（可选）；
- `timestamp`：时间戳；
- `usage/model/durationMs`：模型元数据（可选）。

**返回**：

- 标准消息对象，可直接传给 `pushAndSaveProblemDetailChat(...)`。

**默认行为**：

- `noteName` 缺省值为 `工商信息提炼`；
- 若传入 `usage/model/durationMs` 任一字段，则自动生成 `llmMeta`。

---

## 4. 与主流程的关系

`main.js` 在 task1 的三个路径中复用该模块：

- 企业背景洞察首次提炼；
- 企业背景洞察重做提炼；
- task1 阶段输入后直接提炼。

同时，首页“解析”得到的初步需求调用结果会在“启动跟进”后转换为 `task1LlmQueryBlock`，并由沟通历史模块按 `LLM-查询` 渲染为输入/输出双子卡片。
