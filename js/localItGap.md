# 局部 ITGap 分析模块（localItGap.js）实现说明

> 最近更新：2026-03-19。与 main.js、过程日志（压缩块、任务完成确认）及 getLocalItGapDeps 一致。

## 1. 概述

`localItGap.js` 负责**局部 IT Gap 分析**的完整链路：按价值流生成分析会话（session）、针对单环节调用大模型、解析模型输出、将解析结果渲染为结构化 HTML/Markdown，以及**按环节顺序执行分析**与**上下文压缩**的流程控制。与主流程的编排（聊天容器、问题详情状态、任务确认）解耦，main.js 通过注入依赖（`getLocalItGapDeps()`）调用本模块暴露的流程函数与工具函数。

**职责边界**：

- **本模块**：Session 生成、单环节 LLM 调用、解析、HTML/Markdown 渲染（纯逻辑 + 字符串拼接）；按环节顺序执行「下一未完成环节分析」与「全部压缩」的流程逻辑；粘性横幅与滚动到 block 的 UI 辅助。
- **main.js**：流程编排、UI 状态（`currentProblemDetailItem`、`problemDetailChatMessages`）、聊天容器与消息推送、按钮/确认/重做等事件绑定；通过 `getLocalItGapDeps()` 向本模块提供 `el`、`currentProblemDetailItem`、`setCurrentProblemDetailItem`、`pushAndSaveProblemDetailChat`、`renderProblemDetailChatFromStorage`、`renderProblemDetailHistory`、`renderProblemDetailContent`、`updateDigitalProblemLocalItGapAnalysis`、`getDigitalProblems`、`resolveValueStreamForItGap`、`getTimeStr`、`buildLlmMetaHtml`、`DEEPSEEK_API_KEY`、`DELETE_CHAT_MSG_ICON` 等依赖。

---

## 2. 依赖与加载

### 2.1 运行时依赖（从 global 读取）

| 依赖 | 来源 | 用途 |
|------|------|------|
| `parseValueStreamGraph` | valueStream.js | 从价值流对象解析出 `stages`，用于生成 session 列表与确定下一环节 |
| `fetchDeepSeekChat` | api.js | 调用大模型接口，执行单环节局部 IT Gap 分析与压缩 |
| `escapeHtml` | utils.js | 对纯文本/环节名做 HTML 转义，防止 XSS |
| `renderMarkdown` | utils.js | 将 Markdown 字符串渲染为 HTML（用于现状透视、三维映射表等区块） |

### 2.2 加载顺序

在 `index.html` 中，`localItGap.js` 置于 `js/valueStream.js` 之后、`js/rendering.js` 之前，确保上述依赖已加载，且本模块在 main.js 中可被直接以全局函数形式调用。

### 2.3 模块形式

通过 IIFE 将实现封装，并把需要对外使用的函数与常量挂到 `global`（浏览器下为 `window`），不污染全局命名空间的其他名称。

---

## 3. 常量与 Prompt

### 3.1 `LOCAL_ITGAP_PROMPT`

**作用**：单环节局部 IT Gap 分析的 System Prompt 模板。

**内容要点**：角色为资深数字化转型顾问；任务为基于「全局 ITGap 分析 json」与「端到端流程 json」针对**当前环节【替换环节名称】**进行 As-Is vs To-Be 差异分析。要求输出**单一 JSON 对象**，且必须包含四个字段（字段名不可更改）：`statusQuo`（现状透视）、`itGap3DMap`（IT Gap 三维映射表）、`actionableRequirements`（IT 转型建议）、`businessValuePrediction`（业务价值预测），各字段均支持 Markdown。模板中的占位符 `【替换环节名称】` 在生成 session 或调用 LLM 时会被替换为具体环节名。

### 3.2 `LOCAL_ITGAP_COMPRESSION_PROMPT`

**作用**：将单环节的详尽局部 IT Gap 分析 JSON 压缩为「元数据摘要」的 System Prompt。

**内容要点**：角色为需求架构师；目标为提取能驱动「角色权限推演」和「业务对象建模」的关键逻辑，剔除 Markdown、修饰性词汇和背景说明。压缩逻辑：保留 `stepIndex`/`stepName`；精简 `statusQuo` 为关键词（如：全人工、Excel 记录）；将 `itGap3DMap` 重组为 `coreGaps`（1–3 个技术断点）；将 `actionableRequirements` 精简为 `sysFeatures`；`businessValuePrediction` 仅保留核心指标名。输出格式为**严格 Minified JSON 数组**，每环节一个元素，含 `idx`、`step`、`pain`、`gaps`、`feats`、`val`。

### 3.3 `LOCAL_ITGAP_STRUCTURED_SECTIONS`

**作用**：定义局部 ITGap 分析结果的展示区块顺序与标签，用于 HTML 与 Markdown 渲染。

**结构**：数组，每项 `{ key, label, isPrimary }`。  
- `key`：与解析结果对象字段对应（`statusQuo`、`itGap3DMap`、`actionableRequirements`、`businessValuePrediction`）。  
- `label`：展示用标题（如「现状透视 (Status Quo)」）。  
- `isPrimary`：为 `false` 时增加 `problem-detail-local-itgap-section-secondary` 样式类，用于区分次要区块（如业务价值预测）。

---

## 4. Session 生成（不调用大模型）

### 4.1 `generateLocalItGapSessions(valueStream)`

**作用**：根据端到端价值流生成「按环节」的局部 ITGap 分析会话列表，用于后续逐步执行单环节分析。

**逻辑**：

1. 使用 `parseValueStreamGraph(valueStream)` 得到 `{ stages }`。
2. 将各 stage 的 `steps` 扁平化为 `allSteps`，按索引为每个 step 生成一条 session：
   - `stepName`：取自 `step.name`，缺省为 `环节${i + 1}`。
   - `stepIndex`：从 0 递增的环节序号。
   - `prompt`：`LOCAL_ITGAP_PROMPT` 中 `【替换环节名称】` 替换为 `stepName` 后的字符串。
   - `analysisJson`：初始为 `null`，留给后续 LLM 结果写入。
   - `analysisMarkdown`：初始为 `''`。

**返回**：Session 数组，每项形如 `{ stepName, stepIndex, prompt, analysisJson, analysisMarkdown }`。主流程据此判断「下一未完成环节」并调用 `runLocalItGapAnalysisForNextStep(deps)`。

---

## 5. 单环节 LLM 分析

### 5.1 `generateLocalItGapAnalysis(stepName, globalItGapJson, fullProcessVsm)`

**作用**：针对**一个环节**调用大模型，得到该环节的局部 IT Gap 分析结果（期望为单一 JSON 或可解析的 Markdown 分段）。

**入参**：

- `stepName`：当前环节名称，用于 system/user prompt 中的环节标识。
- `globalItGapJson`：全局 ITGap 分析 JSON（对象或字符串），序列化后放入 user 的「全局 ITGap 分析 json」代码块。
- `fullProcessVsm`：端到端流程（价值流）对象或字符串，序列化后放入 user 的「端到端流程 json」代码块。

**Prompt 设计**：

- **System**：使用 `LOCAL_ITGAP_PROMPT` 并将 `【替换环节名称】` 替换为 `stepName`。
- **User**：拼接「全局 ITGap 分析 json」代码块、「端到端流程 json」代码块，并明确要求针对环节「stepName」按 JSON 格式返回。

**返回**：`fetchDeepSeekChat([...])` 的 Promise，即 `{ content, usage, model, durationMs }`。主流程将 `content` 交给 `parseLocalItGapFromContent` 解析，再交给 `buildLocalItGapStructuredHtml` / `buildLocalItGapMarkdown` 渲染或持久化。

---

## 6. 解析逻辑：`parseLocalItGapFromContent(content)`

**作用**：从大模型返回内容中解析出局部 ITGap 分析的结构化对象，支持 **JSON 内嵌** 与 **Markdown 分段** 两种形态。

### 6.1 输入与默认返回值

- 非字符串或空内容：返回四字段均为空字符串的对象  
  `{ statusQuo: '', itGap3DMap: '', actionableRequirements: '', businessValuePrediction: '' }`。
- 默认 `result` 为该四字段对象，解析成功后按 key 填入内容。

### 6.2 JSON 解析（优先）

1. 用正则匹配第一个 `{ ... }` 子串，对其执行 `JSON.parse`。
2. 若解析成功且为对象，按 `keyMap` 做字段映射（支持多种别名，如 `status_quo`、`现状透视` → `statusQuo`）。
3. 若任一新 key 有值，直接返回 `result`。

### 6.3 Markdown 分段解析（兜底）

当无有效 JSON 时，按固定标题正则匹配四个区块：

- 现状透视（含可选 `(Status Quo)`、`:：` 等）
- IT Gap 三维映射表
- IT 转型建议（含可选 `(Actionable Requirements)`）
- 业务价值预测

按出现顺序切分正文，将相邻标题之间的内容写入对应 `result[key]`。若所有区块都未匹配到内容，则将整段文本写入 `result.statusQuo`。

**返回**：`{ statusQuo, itGap3DMap, actionableRequirements, businessValuePrediction }`，供 `buildLocalItGapStructuredHtml` 与 `buildLocalItGapMarkdown` 使用。

---

## 7. 渲染逻辑

### 7.1 `stripRedundantHeadingFromContent(content, label)`

**作用**：去除内容开头与区块蓝色子标题重复的 Markdown 小标题，避免页面展示时重复显示「现状透视」等标题。

**逻辑**：根据 `label` 提取中文部分，构造若干正则（如 `# 现状透视`、`**现状透视**`、`现状透视：`），对 `content` 做一次替换并 trim；若某次替换生效则停止。仅用于本模块内的 HTML 渲染，不对外暴露。

### 7.2 `buildLocalItGapStructuredHtml(analysis)`

**作用**：将解析后的分析对象渲染为工作区使用的结构化 HTML（现状透视、三维映射表、转型建议、业务价值预测四块）。

**逻辑**：遍历 `LOCAL_ITGAP_STRUCTURED_SECTIONS`，对每个 key 取 `analysis[key]`，空则显示 `—`；非空则先 `stripRedundantHeadingFromContent(content, label)`，再根据 `isPrimary` 添加 section 的 class，内容经 `renderMarkdown` 渲染后放入 `markdown-body`。返回拼接后的 HTML 字符串，供聊天区卡片与从存储恢复渲染时使用。

### 7.3 `buildLocalItGapMarkdown(analysis)`

**作用**：将局部 ITGap 分析 JSON 转为纯 Markdown 文本（`## 标题\n\n内容` 形式），用于导出或持久化。

**逻辑**：遍历 `LOCAL_ITGAP_STRUCTURED_SECTIONS`，仅对非空字段拼接 `## ${label}\n\n${content}`，段落间用 `\n\n` 分隔。

---

## 8. 压缩逻辑

### 8.1 `compressLocalItGapJson(analysisJson, stepName, stepIndex)`

**作用**：调用大模型对单环节的局部 ITGap 分析 JSON 进行上下文压缩，输出 Minified 摘要（供后续角色权限、业务对象等阶段使用）。

**入参**：当前环节的 `analysisJson`（对象或字符串）、`stepName`、`stepIndex`。

**Prompt**：System 使用 `LOCAL_ITGAP_COMPRESSION_PROMPT`；User 为「以下为环节「stepName」（stepIndex: stepIndex）的局部 IT Gap 分析 JSON，请按压缩逻辑输出一个仅含一个元素的 JSON 数组（idx、step、pain、gaps、feats、val）」+ 代码块包裹的 JSON。

**返回**：`fetchDeepSeekChat([...])` 的 Promise，即 `{ content, usage, model, durationMs }`。调用方可能从 `content` 中再解析 `[...]` 取首元素作为压缩结果对象。

---

## 9. 流程函数（依赖 main 注入）

本模块的两个流程函数通过参数 `deps` 接收 main 注入的依赖，避免直接依赖 main 内部变量，便于测试与解耦。

### 9.1 `runLocalItGapAnalysisForNextStep(deps)`

**作用**：执行「下一未完成环节」的局部 ITGap 分析：校验环境与数据、调用 LLM、解析、更新问题详情与 session、在聊天区追加分析卡片（含确认/重做/修正/讨论按钮），并刷新聊天历史与问题详情内容区。

**前置条件**：

- `deps.el?.problemDetailChatMessages`：聊天消息容器 DOM。
- `deps.currentProblemDetailItem`：当前问题详情项（含 `createdAt`、`globalItGapAnalysisJson`、`localItGapSessions`、`localItGapAnalyses`）。
- `deps.resolveValueStreamForItGap(item)`：根据问题项解析价值流（若为 raw 或空则直接 return）。
- `deps.DEEPSEEK_API_KEY`：未配置时在聊天区追加提示并 return。

**流程概要**：

1. 解析价值流，得到 `allSteps`；取 `item.localItGapSessions` 或 `item.localItGapAnalyses` 确定 `nextIndex`（第一个未完成 session 或 analyses 长度）。
2. 若 `nextIndex >= allSteps.length` 则 return。
3. 推送「正在分析环节【stepName】」系统消息，展示 parsing 块，调用 `generateLocalItGapAnalysis(stepName, globalItGap, valueStream)`。
4. LLM 返回后，在 `problemDetailChatMessages` 中查找本环节对应的 `localItGapInputBlock`（同 `stepIndex`），为其补写 `llmMeta`（含 usage），并调用 `deps.saveProblemDetailChat` 保存，以便过程日志在「输入」卡片上显示 prompt_tokens。
5. 解析 `content` 为 `analysisJson`（`parseLocalItGapFromContent`），失败则用 `content` 填 `statusQuo`。
6. 调用 `deps.updateDigitalProblemLocalItGapAnalysis(item.createdAt, stepName, nextIndex, analysisJson, analysisMarkdown)`，并 `getDigitalProblems` + `setCurrentProblemDetailItem(updated)` 更新当前项。
7. 构建分析卡片 DOM（含 `buildLocalItGapStructuredHtml`、LLM meta、确认/重做/修正/讨论按钮），追加到容器，`pushAndSaveProblemDetailChat` 类型为 `localItGapAnalysisCard`，再 `renderProblemDetailChatFromStorage`、`renderProblemDetailHistory`、`renderProblemDetailContent`。

**依赖**：`el`、`currentProblemDetailItem`、`setCurrentProblemDetailItem`、`problemDetailChatMessages`、`pushAndSaveProblemDetailChat`、`saveProblemDetailChat`、`renderProblemDetailChatFromStorage`、`renderProblemDetailHistory`、`renderProblemDetailContent`、`updateDigitalProblemLocalItGapAnalysis`、`getDigitalProblems`、`resolveValueStreamForItGap`、`getTimeStr`、`buildLlmMetaHtml`、`DEEPSEEK_API_KEY`、`DELETE_CHAT_MSG_ICON`。

### 9.2 `runLocalItGapCompressionSequentially(deps)`

**作用**：当用户确认「开始上下文压缩」后，按环节顺序依次对每个已存在 `analysisJson` 的 session 调用 `compressLocalItGapJson`，将压缩结果与 LLM meta 推送为 `localItGapCompressionBlock` 类型的聊天消息，并刷新聊天区与历史。全部环节压缩完成后调用 `deps.onAllCompressionDone()`（主流程可用于弹出任务完成确认等）。

**前置条件**：

- `deps.el?.problemDetailChatMessages`、`deps.currentProblemDetailItem` 同 9.1。
- `item.localItGapSessions` 中至少有一项 `analysisJson != null`；否则直接调用 `onAllCompressionDone` 并 return。

**流程概要**：

1. 过滤出 `localItGapSessions` 中带 `analysisJson` 的 session，按 `stepIndex` 顺序遍历。
2. 对每个 session：展示「正在压缩环节「stepName」的局部 ITGap 分析…」parsing 块；`await compressLocalItGapJson(...)`；从返回的 `content` 中解析 `[...]` 取首元素作为 `compressedJson`；`pushAndSaveProblemDetailChat` 写入 `localItGapCompressionBlock`（含 `stepName`、`stepIndex`、`compressedJson`、`llmMeta`、`timestamp`）；清空容器并 `renderProblemDetailChatFromStorage`、`renderProblemDetailHistory`。
3. 循环结束后调用 `deps.onAllCompressionDone()`。

**依赖**：除 9.1 中与聊天相关的 deps 外，必须提供 `onAllCompressionDone` 回调。

---

## 10. UI 辅助

### 10.1 `scrollChatToBlock(container, blockEl)`

**作用**：将聊天容器滚动到指定 block 元素附近，使该 block 大致出现在视口上方约 1/3 处（`scrollTop = blockTop - containerHeight/3`）。

### 10.2 `showLocalItGapExistingBlockBanner(container, blockEl)`

**作用**：在聊天区顶部插入粘性提醒条，文案为「局部 ITGap 分析 session 已生成，请向下查看」，并提供「滚动到」按钮；点击后调用 `scrollChatToBlock(container, blockEl)` 并移除横幅。若已存在同 id 的横幅则不再插入。

### 10.3 `LOCAL_ITGAP_BANNER_ID`

**作用**：粘性横幅元素的 id，值为 `'local-itgap-existing-banner'`，用于查询是否已存在横幅。主流程在需要时（例如打开已存在局部 ITGap session 的问题详情）可调用 `showLocalItGapExistingBlockBanner(container, blockEl)`。

---

## 11. 对外暴露的 API（挂载到 global）

| 名称 | 类型 | 说明 |
|------|------|------|
| `generateLocalItGapSessions(valueStream)` | 函数 | 根据价值流生成 session 数组，不调 LLM |
| `generateLocalItGapAnalysis(stepName, globalItGapJson, fullProcessVsm)` | 函数 | 针对单环节调用大模型，返回 Promise |
| `parseLocalItGapFromContent(content)` | 函数 | 解析模型输出为四字段分析对象 |
| `buildLocalItGapStructuredHtml(analysis)` | 函数 | 将分析对象渲染为结构化 HTML |
| `buildLocalItGapMarkdown(analysis)` | 函数 | 将分析对象转为 Markdown 文本 |
| `compressLocalItGapJson(analysisJson, stepName, stepIndex)` | 函数 | 调用大模型对单环节分析做压缩，返回 Promise |
| `runLocalItGapCompressionSequentially(deps)` | 函数 | 按环节顺序执行压缩并推送聊天消息，最后调用 `deps.onAllCompressionDone` |
| `runLocalItGapAnalysisForNextStep(deps)` | 函数 | 执行下一未完成环节的分析并更新 UI 与存储 |
| `showLocalItGapExistingBlockBanner(container, blockEl)` | 函数 | 在聊天区顶部显示「session 已生成，请向下查看」横幅 |
| `scrollChatToBlock(container, blockEl)` | 函数 | 将聊天容器滚动到指定 block |
| `LOCAL_ITGAP_BANNER_ID` | 常量 | 横幅元素 id |
| `LOCAL_ITGAP_STRUCTURED_SECTIONS` | 常量 | 展示区块配置数组（key/label/isPrimary） |

main.js 在调用流程函数前通过 `getLocalItGapDeps()` 组装 `deps`，并对 `runLocalItGapAnalysisForNextStep`、`runLocalItGapCompressionSequentially`、`buildLocalItGapStructuredHtml`、`buildLocalItGapMarkdown` 等做 `typeof xxx === 'function'` 判断，以兼容本模块未加载或脚本顺序异常的情况。

---

## 12. 数据流简图

```
价值流 (valueStream)
    → generateLocalItGapSessions
    → sessions[{ stepName, stepIndex, prompt, analysisJson, analysisMarkdown }]
    → 主流程触发 runLocalItGapAnalysisForNextStep(deps)
    → 取下一未完成环节 → generateLocalItGapAnalysis(stepName, globalItGap, valueStream)
    → LLM 返回 content
    → parseLocalItGapFromContent(content)
    → analysisJson { statusQuo, itGap3DMap, actionableRequirements, businessValuePrediction }
    → buildLocalItGapStructuredHtml(analysisJson) → 卡片 HTML
    → updateDigitalProblemLocalItGapAnalysis + pushAndSaveProblemDetailChat(localItGapAnalysisCard)
    → 用户确认全部环节后，主流程推送「压缩确认块」，用户确认后触发 runLocalItGapCompressionSequentially(deps)
    → 按 session 顺序 compressLocalItGapJson(...) → 推送 localItGapCompressionBlock
    → onAllCompressionDone() → 主流程推送「任务完成确认块」（是否确认局部 ITGap 分析任务已经完成？），用户确认后推送任务完成并切换 task10
```

---

## 13. 与 main.js 的协作

- **getLocalItGapDeps()**：在 main.js 中定义，返回包含 `el`、`currentProblemDetailItem`、`setCurrentProblemDetailItem`、`problemDetailChatMessages`、`pushAndSaveProblemDetailChat`、`saveProblemDetailChat`、`renderProblemDetailChatFromStorage`、`renderProblemDetailHistory`、`renderProblemDetailContent`、`updateDigitalProblemLocalItGapAnalysis`、`getDigitalProblems`、`resolveValueStreamForItGap`、`getTimeStr`、`buildLlmMetaHtml`、`DEEPSEEK_API_KEY`、`DELETE_CHAT_MSG_ICON` 等属性的对象（部分以 getter 形式保证每次取到最新值）。流程函数仅通过 `deps` 访问这些能力，不直接依赖全局变量。
- **调用示例**：  
  - 分析下一步：`runLocalItGapAnalysisForNextStep(getLocalItGapDeps())`  
  - 压缩并完成后：`runLocalItGapCompressionSequentially({ ...getLocalItGapDeps(), onAllCompressionDone: () => { 推送 localItGapTaskCompleteConfirmBlock（「是否确认局部 ITGap 分析任务已经完成？」）；用户确认该块后再推送任务完成、推进状态并 focusWorkspaceOnCurrentTask('task10') } })`
- **渲染从存储恢复**：main.js 在从 `problemDetailChatMessages` 恢复 `localItGapAnalysisCard` / `localItGapCompressionBlock` 时，会调用 `buildLocalItGapStructuredHtml(data)` 或展示压缩 JSON，均通过 `typeof buildLocalItGapStructuredHtml === 'function'` 判断后再调用，避免本模块未加载时报错。
