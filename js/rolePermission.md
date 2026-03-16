# 角色与权限模型推演模块（rolePermission.js）实现说明

## 1. 概述

`rolePermission.js` 负责**角色与权限模型（RBAC）推演**的完整链路：按价值流生成推演会话、针对单环节调用大模型、解析模型输出，以及将解析结果渲染为工作区使用的 HTML。与主流程的编排（如 `runRolePermissionModeling`、聊天消息、DOM 事件）解耦，主流程只负责调用本模块暴露的全局函数。

**职责边界**：

- **本模块**：Session 生成、单环节 LLM 调用、解析、HTML 渲染（纯逻辑 + 字符串拼接）。
- **main.js**：流程编排、UI 状态、聊天容器与消息推送、按钮/折叠等事件绑定。

---

## 2. 依赖与加载

### 2.1 运行时依赖（从 global 读取）

| 依赖 | 来源 | 用途 |
|------|------|------|
| `parseValueStreamGraph` | valueStream.js | 从价值流对象解析出 `stages`，用于生成 session 列表 |
| `fetchDeepSeekChat` | api.js | 调用大模型接口，执行单环节角色与权限推演 |
| `escapeHtml` | utils.js | 对纯文本/JSON 做 HTML 转义，防止 XSS |
| `renderMarkdown` | utils.js | 将 Markdown 字符串渲染为 HTML（用于角色字段、子卡片内容） |

### 2.2 加载顺序

在 `index.html` 中，`rolePermission.js` 置于 `js/navigation.js` 之后、`main.js` 之前，确保上述依赖已加载，且本模块在 main 中可被直接以全局函数形式调用。

### 2.3 模块形式

通过 IIFE 将实现封装，并把需要对外使用的函数挂到 `global`（浏览器下为 `window`），不污染全局命名空间的其他名称。

---

## 3. Session 生成（不调用大模型）

### 3.1 `generateRolePermissionSessions(valueStream)`

**作用**：根据价值流图生成「按环节」的推演会话列表，用于后续逐步或自动顺序执行单环节推演。

**逻辑**：

1. 使用 `parseValueStreamGraph(valueStream)` 得到 `{ stages }`。
2. 顺序遍历每个 `stage` 的 `steps`，为每个 step 生成一条 session：
   - `stepName`：取自 `step.name`，缺省为 `环节${stepIndex + 1}`。
   - `stepIndex`：从 0 递增的环节序号。
   - `stageName`：当前阶段名 `stage.name`。
   - `rolePermissionJson`：初始为 `null`，留给后续 LLM 结果写入。

**返回**：Session 数组，每项形如 `{ stepName, stepIndex, stageName, rolePermissionJson }`。主流程可据此决定推演顺序（如「下一步」或「自动连续」）。

---

## 4. 单环节 LLM 推演

### 4.1 `generateRolePermissionForStep(stepName, stageName, valueStream, globalItGap, localItGap, projectName)`

**作用**：针对**一个环节**调用大模型，得到该环节的角色与权限推演结果（期望为单个 JSON 对象）。

**入参**：

- `stepName` / `stageName`：当前环节与阶段名称，用于 prompt 与结果结构。
- `valueStream`：端到端价值流对象，序列化后放入「端到端全流程」上下文。
- `globalItGap`：全局 IT 差距分析结果（可选），有则序列化后放入「全局 ITGap 分析」。
- `localItGap`：局部 IT 差距分析数组（可选），有则序列化后放入「局部 ITGap 分析」。
- `projectName`：项目名称，用于 user prompt。

**Prompt 设计**：

- **System**：角色设定为需求分析专家；任务为针对「单一环节」做 RBAC 推演；要求包含角色画像、现状转换、痛点闭环、SoD；并约定输出为**单个 JSON 对象**，且必须包含 `stage_name`、`step_id`、`step_name`、`it_gap_reference`、`roles`、`sod_warning` 等字段。
- **User**：拼接「项目 + 环节」说明、端到端全流程 JSON、可选的全局/局部 ITGap JSON，并明确要求「直接输出该环节的 JSON 对象，不要 markdown 代码块或说明文字」。

**返回**：`fetchDeepSeekChat([...])` 的 Promise，即 `{ content, usage, model, durationMs }` 等。主流程拿到 `content` 后，会交给 `parseRolePermissionModel` 解析，再交给 `buildRolePermissionNodeCardsHtml` / `buildRolePermissionStepViewHtml` 渲染。

---

## 5. 解析逻辑：`parseRolePermissionModel(markdown)`

**作用**：将大模型返回的文本（或历史保存的 markdown）解析为「环节列表」或「旧版表格行」的结构化数据，供渲染使用。兼容**新格式 JSON** 与**旧版 Markdown 表格**。

### 5.1 输入与预处理

- 非字符串或空串直接返回 `[]`。
- 去除首尾空白与 BOM（`\uFEFF`），得到 `raw`。
- 可选调试：`ROLE_PERMISSION_LOG === true` 时在控制台打印解析过程。

### 5.2 新格式 JSON 解析（优先）

1. **直接解析**：`JSON.parse(raw)`；失败则下一步。
2. **代码块提取**：用正则匹配 ` ```json ... ``` ` 或 ` ``` ... ``` `，对块内内容再 `JSON.parse`。
3. **括号匹配**：若仍非数组，在 `raw` 中找第一个 `[`，按括号深度找到匹配的 `]`（跳过字符串内的引号与转义），对截取子串再 `JSON.parse`。

解析得到数组后，做**格式识别**：

- 取首元素 `first`，若为对象且：
  - 同时具备 `roles`（数组）与（`step_name` 或 `step_id` 或 `stage_name` 或 `stage_id`）→ 视为**新格式**，直接返回该数组。
  - 仅有 `step_name` / `step_id` / `stage_name` / `stage_id`（无 `roles` 或格式不全）→ 仍视为按环节结构，返回该数组。

### 5.3 旧版 Markdown 表格解析（兜底）

当无法识别为新格式数组时：

1. 按行切分，只保留包含 `|` 的行；不足 2 行则返回 `[]`。
2. 第一行作为表头，解析列索引：
   - 节点、建议角色、核心职责、权限（通过列名是否包含对应中文确定索引）。
3. 从第 3 行起遍历数据行：
   - 对「建议角色」用正则提取：`执行者：…`、`审批者：…`、`知情者：…`。
   - 对「权限」用正则提取：`企微端：…`、`低代码：…`、`接收通知：…`、`查询数据：…`。
4. 每行输出为：`{ node, roles: { executor, approver, informer }, duty, perms: { wechat, lowcode, notify, query } }`。

**返回值**：新格式为「环节对象数组」（每项含 `stage_name`、`step_name`、`roles` 等）；旧版为「表格行对象数组」（每项含 `node`、`roles`、`duty`、`perms`）。渲染层通过首项结构区分两种格式。

---

## 6. 渲染逻辑

渲染层将解析后的「环节列表」或「表格行列表」转成工作区使用的 HTML，并统一使用 `escapeHtml` / `renderMarkdown` 保证安全与格式。

### 6.1 字段级：`formatRolePermissionField(val)`

- **空值**：返回占位 `—` 的 span。
- **字符串**：用 `renderMarkdown` 渲染后放入 `markdown-body` 的 div。
- **对象**：`JSON.stringify(..., null, 2)` 后放入 `<pre>`，内容经 `escapeHtml`。
- 其他类型：`escapeHtml(String(val))`。

用于「过去操作」「触发逻辑」等单值字段。

### 6.2 新权限子卡片：`buildNewPermissionsSubcardsHtml(obj)`

- 入参为 `new_it_permissions` 这类对象。
- 固定三个键：`data_access`（数据权限）、`function_use`（功能实用）、`system_operation`（系统操作）。
- 每个键对应一张内层卡片：标题 + 内容。内容规则：数组→列表项；字符串→Markdown；其他→JSON pre。
- 空或非对象返回占位 `—`。

### 6.3 痛点解决方案子卡片：`buildPainPointSolutionSubcardsHtml(obj)`

- 入参为 `pain_point_solution` 这类键值对象。
- 使用常量 `PAIN_POINT_SOLUTION_LABELS` 将 key 映射为中文标题（如 `eliminate_manual_collection` → 「消除人工采集」）；无映射时用 `解决方案 ${i+1}` 或 key 的英文 Title Case（`formatKeyToEnglishTitle`）。
- 每个 key 一张内层卡片：中英文标题 + 内容（字符串→Markdown，其他→JSON pre）。

### 6.4 单环节视图：`buildRolePermissionStepViewHtml(match)`

- `match` 为**一个环节**的对象（新格式），含 `roles` 数组。
- 若无 `roles` 或为空，返回占位「该环节暂无角色数据」。
- 否则对每个角色生成一张「角色卡片」：
  - 标题：`role_name` / `roleName`。
  - 区块：过去操作（`formatRolePermissionField(legacy_operation)`）、新的权限（`buildNewPermissionsSubcardsHtml(new_it_permissions)`）、痛点解决方案（`buildPainPointSolutionSubcardsHtml(pain_point_solution)`）、触发逻辑（若有则再 `formatRolePermissionField(trigger_logic)`）。
- 支持 snake_case 与 camelCase 字段名（如 `legacy_operation` / `legacyOperation`）。
- 外层包一层 `problem-detail-role-permission-view-roles`，内部为多张 `problem-detail-role-card`，便于主流程统一做折叠等交互。

### 6.5 节点/环节卡片列表：`buildRolePermissionNodeCardsHtml(model)`

- `model` 为 `parseRolePermissionModel` 的返回值（数组）。
- **新格式**（首项含 `roles` 且含 `step_name`/`step_id`/`stage_name`/`stage_id`）：
  - 每个环节一张「环节卡片」：
    - 标题：`stage_name － step_name` 或 fallback 到 `step_name` / `stage_name` / step_id 等。
    - 卡片内带 tab：「view」与「json」；view 为 `buildRolePermissionStepViewHtml(item)`，json 为该环节对象的格式化 JSON。
    - 标题区有「角色与权限模型推演」文案与 view/json 切换按钮。
  - 最外层为「环节列表」标题 + 多张 `problem-detail-card-role-permission`。
- **旧版表格格式**（首项为 `node`、`roles`、`perms`、`duty`）：
  - 每个 `node` 一张卡片，展示：环节名称、角色设计（执行者/审批者/知情者）、企微端/低代码/接收通知/查询数据、核心职责（若有）。
  - 使用 `problem-detail-role-permission-grid` 等 class，与现有样式一致。

主流程将 `buildRolePermissionNodeCardsHtml(parsedModel)` 的 HTML 插入工作区，并依赖现有 CSS 与 main.js 中的折叠、tab 切换等事件。

---

## 7. 对外暴露的 API（挂载到 global）

| 函数名 | 说明 |
|--------|------|
| `generateRolePermissionSessions(valueStream)` | 根据价值流生成推演 session 数组，不调 LLM |
| `generateRolePermissionForStep(...)` | 针对单环节调用大模型，返回 Promise |
| `parseRolePermissionModel(markdown)` | 解析模型输出或历史文本为新格式/旧版表格结构 |
| `buildRolePermissionNodeCardsHtml(model)` | 将解析后的模型数组渲染为环节/节点卡片列表 HTML |
| `buildRolePermissionStepViewHtml(match)` | 将单个环节对象渲染为「角色卡片」视图 HTML |

主流程（main.js）在需要时直接调用上述全局函数；若存在依赖 `window.parseRolePermissionModel` 的代码，因挂载在 `global`（即 window）上，仍可正常使用。

---

## 8. 数据流简图

```
价值流 (valueStream)
    → generateRolePermissionSessions
    → sessions[{ stepName, stepIndex, stageName, rolePermissionJson }]
    → 主流程按 step 调用 generateRolePermissionForStep(...)
    → LLM 返回 content (markdown/JSON 文本)
    → parseRolePermissionModel(content)
    → model (新格式数组 或 旧版表格行数组)
    → buildRolePermissionNodeCardsHtml(model) 或 buildRolePermissionStepViewHtml(match)
    → HTML 插入工作区，由 main.js 绑定折叠/tab 等事件
```

---

## 9. 调试与扩展

- **解析调试**：将模块内 `ROLE_PERMISSION_LOG` 设为 `true`，可在控制台看到 `parseRolePermissionModel` 的解析步骤与结果类型。
- **新格式扩展**：若 LLM 输出增加新字段，只需在 `buildRolePermissionStepViewHtml`、`buildNewPermissionsSubcardsHtml`、`buildPainPointSolutionSubcardsHtml` 中按需增加展示；解析层已按「具备 roles + step/stage 信息」识别新格式，一般无需改 `parseRolePermissionModel` 的数组分支。
- **旧版表格**：保留表格解析是为了兼容历史数据；新推演均以新格式 JSON 为准。
