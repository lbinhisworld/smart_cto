# 核心业务对象推演模块（coreBusinessObject.js）详细设计

> 最近更新：2026-03-19。与 main.js、js/communication-history.js 中 task11 流程及过程日志展示一致。

## 1. 概述

`coreBusinessObject.js` 负责 **核心业务对象推演**（IT 策略规划 task11）的完整链路：按价值流生成推演会话、针对单环节调用大模型、解析模型输出、将解析结果渲染为工作区使用的 HTML，以及**任务确认时的交互逻辑**（构建上下文 JSON、推送过程日志、生成并推送 session 确认内容块）。与主流程的编排（聊天容器重绘、子步骤切换、工作区刷新）解耦，main.js 只负责传入回调并执行 UI 刷新。

**任务定义（来自 js/config.js）**：

- **名称**：核心业务对象推演（task11）
- **目标**：定义流程中流转的数字化实体（如订单、合同、任务单），为低代码数据库建模提供底层的逻辑结构。
- **评估标准**：1）颗粒度：对象字段是否足以支撑 IT Gap 分析中提到的所有业务数据记录与统计需求？2）状态定义：是否为每个业务对象建立了清晰的生命周期状态机（State Machine），例如：待处理、执行中、已完成。
- **输入/输出**：输入为「流程与 IT Gap」，输出为「业务对象 JSON，用户确认」。

**职责边界**：

- **本模块**：Session 生成、单环节 LLM 调用、解析、HTML 渲染（纯逻辑 + 字符串拼接）；**任务确认交互逻辑**（构建 4 份上下文 JSON、依次推送 4 条带 `contextLabel` 的上下文块与 1 条 session 块到过程日志、生成 session 列表、更新存储回调）；**Session 确认内容块 HTML**（与角色与权限样式一致的聊天区卡片）。
- **main.js**：流程编排、UI 状态、聊天容器重绘、工作区在 `itStrategyPlanViewingSubstep === 1` 时的展示与事件绑定；task11 确认时不推送通用 `taskContextBlock`，仅调用本模块暴露的 `executeCoreBusinessObjectTaskOnConfirm`、`buildCoreBusinessObjectSessionsBlockHtml` 等，不内联核心业务对象相关业务逻辑。

---

## 2. 依赖与加载

### 2.1 运行时依赖（从 global 读取）

| 依赖 | 来源 | 用途 |
|------|------|------|
| `parseValueStreamGraph` | valueStream.js | 从价值流对象解析出 `stages`，用于生成 session 列表 |
| `parseRolePermissionModel` | rolePermission.js | 解析角色权限内容为按环节数组，用于构建任务确认时的上下文 JSON |
| `fetchDeepSeekChat` | api.js | 调用大模型接口，执行单环节核心业务对象推演 |
| `escapeHtml` | utils.js | 对纯文本/JSON 做 HTML 转义，防止 XSS |
| `renderMarkdown` | utils.js | 将 Markdown 字符串渲染为 HTML（用于实体说明等字段） |

### 2.2 加载顺序

在 `index.html` 中，`coreBusinessObject.js` 置于 `js/rolePermission.js` 之后、`main.js` 之前，确保上述依赖已加载，且本模块在 main 中可被直接以全局函数形式调用。

### 2.3 模块形式

通过 IIFE 将实现封装，并把需要对外使用的函数挂到 `global`（浏览器下为 `window`），不污染全局命名空间的其他名称。

---

## 3. Session 生成（不调用大模型）

### 3.1 `generateCoreBusinessObjectSessions(valueStream)`

**作用**：根据价值流图生成「按环节」的推演会话列表，用于后续逐步或自动顺序执行单环节推演（与角色与权限推演保持一致的按环节粒度）。

**逻辑**：

1. 使用 `parseValueStreamGraph(valueStream)` 得到 `{ stages }`。
2. 顺序遍历每个 `stage` 的 `steps`，为每个 step 生成一条 session：
   - `stepName`：取自 `step.name`，缺省为 `环节${stepIndex + 1}`。
   - `stepIndex`：从 0 递增的环节序号。
   - `stageName`：当前阶段名 `stage.name`。
   - `coreBusinessObjectJson`：初始为 `null`，留给后续 LLM 结果写入。

**返回**：Session 数组，每项形如 `{ stepName, stepIndex, stageName, coreBusinessObjectJson }`。主流程可据此实现「下一步」「自动连续」等交互。

---

## 4. 单环节 LLM 推演

### 4.1 `generateCoreBusinessObjectForStepWithStrictPrompt(stepName, stageName, stepIndex, valueStreamJson, globalItGapJson, localItGapJson, rolePermissionJson)`

**作用**：使用严格提示词（沟通历史四类上下文 + 对象分类/属性对冲/状态机/关系图谱）针对单环节调用大模型，返回该环节的 JSON。**当前「自动顺序执行」「手工逐项确认」均调用此函数**。

**入参**：四类上下文的 JSON 字符串（价值流、全局 ITGap、局部 ITGap、角色与权限），以及当前环节的 `stepName`、`stageName`、`stepIndex`。

**System Prompt 要点**：角色为需求分析专家；输入为四类沟通历史上下文；Task Goal 为推导支撑各环节运行的核心业务对象，**特别注意**一个环节可能涉及多个对象（新生成单据、被引用主数据、过程记录），需拆解出所有原子化对象并解决标注的 IT Gap。**五大建模准则**：1）IT Gap 强溯源（object_usage 须引用原话/关键词、采用「业务功能 + 对冲的 IT Gap + 核心设计思路」结构）；2）对象角色（环节主产出/关联引用/过程记录，贡献度原则）；3）闭环性（引用闭环、外键对齐）；4）属性对冲（针对数据断裂等 Gap 设计对冲字段）；5）对象分类权威定义（主数据/事务数据/状态数据）。Core Requirement Details 含对象分类、属性对冲设计、严谨数据类型（String/Decimal/Date/DateTime/Boolean/Enum/Array）、状态机建模、关系图谱；Output Format 为严格 JSON 数组（当前环节仅一个元素），不要多余解释文字。

**提示词迭代优化要点（设计逻辑）**：提示词多次迭代的核心意图可概括为四点。（1）**强溯源闭环**：对象用途必须对应并引用前期分析中的 IT Gap，采用「业务功能 + 痛点对冲 + 设计思路」三段式，确保设计有据可依、杜绝无效建模。（2）**多对象协同与引用一致性**：明确环节主产出（Primary Output）、关联引用、过程记录三重角色，要求关联对象均在文档中有定义，防止「引用孤儿」。（3）**数据分类与高精度建模**：主数据/事务数据/状态数据/配置数据分类及 Decimal、Enum 等字段类型约定，为后续数据库设计提供准开发级底座。（4）**中文语境与架构决策**：枚举与定义全面汉化，将设计思路植入 object_usage，使输出 JSON 兼具数据模型与包含 ADR 的业务逻辑规格书属性。

**输出结构（单元素数组）**：每元素含 `stage_name`、`local_gap_resolved`、`business_objects`（每项含 `object_name`、`object_usage`（**格式**：「业务功能：...。对冲Gap：...。设计思路：...」）、`object_role`（环节主产出/关联引用/过程记录）、`is_newly_created`、`category`（主数据/事务数据/配置数据）、`is_global_shared`（boolean）、`key_attributes`（每项含 `field`、`data_type`、`purpose`）、`lifecycle_machine`、`associations`、`global_integration_note`）、`multi_object_interaction`（本环节多对象协同逻辑，例如引用了哪些原料对象、产生了哪个主产出）。

**返回**：`fetchDeepSeekChat([...])` 的 Promise。main.js 解析 `content` 为单对象（数组取首项）后写入 `session.coreBusinessObjectJson`，并展示在工作区对应环节的「核心业务对象推演」子卡片 **json** 页（默认展示 json 页）。

### 4.2 `generateCoreBusinessObjectForStep(stepName, stageName, valueStream, globalItGap, localItGap, projectName)`

**作用**：针对**一个环节**调用大模型，得到该环节涉及或产生的核心业务对象（期望为单个 JSON 对象，含 `entities` 数组）。

**入参**：

- `stepName` / `stageName`：当前环节与阶段名称，用于 prompt 与结果结构。
- `valueStream`：端到端价值流对象，序列化后放入「端到端全流程」上下文。
- `globalItGap`：全局 IT 差距分析结果（可选），有则序列化后放入「全局 ITGap 分析」。
- `localItGap`：局部 IT 差距分析数组（可选），有则序列化后放入「局部 ITGap 分析」。
- `projectName`：项目名称，用于 user prompt。

**Prompt 设计**：

- **System**：
  - 角色：软件公司需求分析专家。
  - 任务：针对价值流中的**单一环节**进行核心业务对象（数字化实体）推演，为低代码数据库建模提供底层逻辑结构。
  - 要求：1）颗粒度：对象字段足以支撑 IT Gap 分析中的业务数据记录与统计需求；2）状态定义：为每个业务对象建立清晰的生命周期状态机（如：待处理、执行中、已完成）。
  - 输出格式：直接输出一个 JSON 对象，不要数组、不要 markdown 代码块。结构必须包含：
    - `stage_name`, `step_id`, `step_name`, `it_gap_reference`
    - `entities`：数组，每项含 `entity_name`、`description`、`fields`（`field_name`、`type`、`description`）、`state_machine`（`state`、`description`、`transitions`）、`relations`（`target_entity`、`relation_type`）。
- **User**：拼接「项目 + 环节」说明、端到端全流程 JSON、可选的全局/局部 ITGap JSON，并明确要求「直接输出该环节的 JSON 对象，不要 markdown 代码块或说明文字」。

**返回**：`fetchDeepSeekChat([...])` 的 Promise，即 `{ content, usage, model, durationMs }` 等。主流程拿到 `content` 后，会交给 `parseCoreBusinessObjectModel` 解析，再交给 `buildCoreBusinessObjectNodeCardsHtml` / `buildCoreBusinessObjectStepViewHtml` 渲染。

---

## 5. 解析逻辑：`parseCoreBusinessObjectModel(markdown)`

**作用**：将大模型返回的文本（或历史保存的 markdown）解析为「环节列表」或「全局实体列表」的结构化数据，供渲染使用。兼容**单环节对象**、**全局 entities 对象**、**环节数组**三种形态。

### 5.1 输入与预处理

- 非字符串或空串直接返回 `[]`。
- 去除首尾空白与 BOM（`\uFEFF`），得到 `raw`。
- 可选调试：`CORE_BUSINESS_OBJECT_LOG === true` 时在控制台打印解析过程。

### 5.2 JSON 解析策略

1. **直接解析**：`JSON.parse(raw)`；失败则下一步。
2. **代码块提取**：用正则匹配 ` ```json ... ``` ` 或 ` ``` ... ``` `，对块内内容再 `JSON.parse`。
3. **括号匹配**：若仍失败，在 `raw` 中找第一个 `{`，按大括号深度找到匹配的 `}`（跳过字符串内的引号与转义），对截取子串再 `JSON.parse`。

### 5.3 格式识别与归一化

解析得到对象 `parsed` 后：

- **单环节格式**：`parsed` 为对象，且同时具备 `entities`（非空数组）与（`step_name` 或 `step_id` 或 `stage_name`）→ 视为单环节结果，返回 `[parsed]`（即「环节数组」仅含一项）。
- **全局 entities 格式**：`parsed` 为对象，具备 `entities`（非空数组），但不具备 step/stage 信息 → 归一为 `[{ stage_name: '全局', step_name: '全局', entities: parsed.entities }]` 返回。
- **环节数组格式**：`parsed` 为数组，且首项为对象且含 `entities` 数组 → 直接返回 `parsed`。
- **严格提示词格式**（单对象或数组且首项含 `business_objects`）：将 `business_objects` 映射为 `entities`（`object_name`→`entity_name`、`object_usage` 保留、**`category`、`is_global_shared` 保留**、`key_attributes`→`fields`（`field`/`field_name`、`data_type`/`type`、`purpose`/`description`）、`lifecycle_machine`→`state_machine`、`associations`→`relations`），并**保留 `object_role`** 到每个实体；环节对象保留 `local_gap_resolved` 等字段。返回 `[normalized]`。

其他情况返回 `[]`。

**返回值**：统一为「环节对象数组」，每项形如 `{ stage_name?, step_name?, step_id?, stage_id?, entities: [...] }`。渲染层根据首项是否含 `step_name`/`stage_name` 区分「按环节展示」与「扁平实体列表」两种展示方式。

---

## 6. 数据结构约定（LLM 输出与解析结果）

### 6.1 单环节输出（LLM 期望结构）

```json
{
  "stage_name": "阶段名称",
  "step_id": "环节序号",
  "step_name": "环节名称",
  "it_gap_reference": "关联的 IT 现状与数据需求简述",
  "entities": [
    {
      "entity_name": "订单",
      "description": "销售订单，记录客户需求与交付信息",
      "fields": [
        { "field_name": "order_no", "type": "string", "description": "订单编号" },
        { "field_name": "status", "type": "string", "description": "当前状态" }
      ],
      "state_machine": [
        { "state": "待处理", "description": "新建未确认", "transitions": ["执行中", "已取消"] },
        { "state": "执行中", "description": "已排产", "transitions": ["已完成"] },
        { "state": "已完成", "description": "交付完成", "transitions": [] }
      ],
      "relations": [
        { "target_entity": "合同", "relation_type": "n:1" }
      ]
    }
  ]
}
```

### 6.2 实体对象（Entity）

| 字段 | 说明 | 备注 |
|------|------|------|
| `entity_name` / `entityName` / `name` | 对象名称 | 如订单、合同、任务单 |
| `description` | 对象说明 | 可选，支持 Markdown 渲染；工作区对象卡片内容区**不展示**此块 |
| **`object_role`** | 对象角色说明 | 严格格式解析时保留（环节主产出/关联引用/过程记录）；用于分组与标题栏**角色标签** |
| **`object_usage`** | 设计用途 | 严格格式解析时保留；**格式**为「业务功能：...。对冲Gap：...。设计思路：...」；在对象卡片「设计用途」栏目内以**表格**展示（项目列：业务功能、对冲 Gap、设计思路；内容列为解析后的三段文本） |
| **`category`** | 对象类型 | 严格格式解析时保留（主数据/事务数据/配置数据等）；**仅在标题栏以标签展示**，内容区不展示 |
| **`is_global_shared`** | 是否全局引用数据 | 严格格式解析时保留（boolean）；**仅在标题栏以标签展示**：为 true 时显示「全局引用数据」，为 false 时显示「非全局引用数据」，内容区不展示 |
| `fields` | 字段定义数组 | 每项：`field_name`/`fieldName`/`name`、`type`/`data_type`（展示时表头为「数据类型」）、`description`（展示时表头为「设计意图」，单元格去「设计意图：」前缀） |
| `state_machine` / `stateMachine` | 状态机数组 | 每项：`state`/`name`、`description`、`transitions`（下一状态数组） |
| `relations` | 关联对象数组 | 每项：`target_entity`/`targetEntity`、`relation_type`/`relationType`（如 1:1、1:n、n:1） |

字段类型建议：`string`、`number`、`date`、`ref`（引用其他实体）等，由 LLM 自由发挥，解析与渲染不做强校验。

### 6.3 严格提示词输出格式（Strict Prompt，当前主流程）

`generateCoreBusinessObjectForStepWithStrictPrompt` 要求 LLM 针对**当前环节**仅输出一个元素的 JSON 数组，元素结构为：

- **环节级**：`stage_name`、`local_gap_resolved`（该环节局部 IT Gap 解决思路）、`business_objects`、`multi_object_interaction`（本环节内多对象协同逻辑）。
- **business_objects[]**：每项含 `object_name`、**`object_usage`**（格式：「业务功能：...。对冲Gap：...。设计思路：...」）、**`object_role`**（环节主产出 / 关联引用 / 过程记录）、**`is_newly_created`**（该环节是创建还是仅更新引用）、**`category`**（主数据 / 事务数据 / 配置数据）、**`is_global_shared`**（boolean）、`key_attributes`（含 `field`、`data_type`（String/Decimal/Date/DateTime/Boolean/Enum/Array）、`purpose`）、`lifecycle_machine`、`associations`、`global_integration_note`。

解析与工作区展示可直接使用该 JSON（或经 `parseCoreBusinessObjectModel` 归一为 6.1/6.2 结构后再渲染）。

---

## 7. 渲染逻辑

渲染层将解析后的「环节列表」或「实体列表」转成工作区使用的 HTML，并统一使用 `escapeHtml` / `renderMarkdown` 保证安全与格式。所有卡片支持与 main.js 中统一的折叠行为（`.problem-detail-card-header` 与 `.problem-detail-card-body`）。

### 7.1 字段级：`formatCoreBusinessObjectField(val)`

- **空值**：返回占位 `—` 的 span（class `problem-detail-core-business-object-empty`）。
- **字符串**：用 `renderMarkdown` 渲染后放入 `markdown-body` 的 div。
- **对象**（含数组）：`JSON.stringify(val, null, 2)` 后放入 `<pre>`，内容经 `escapeHtml`。
- 其他类型：`escapeHtml(String(val))`。

用于实体「说明」等单值字段。

### 7.2 单实体卡片：`buildEntityCardHtml(entity, opts)`

- **入参**：单个实体对象（含 `entity_name`、`fields`、`state_machine`、`relations`、可选 `object_role`、`object_usage`、`category`、`is_global_shared`）；`opts.titlePrefix`（如 `'对象：'`）、`opts.roleTag`（对象角色说明，用于标题栏标签）。
- **字段名兼容**：同时支持 snake_case 与 camelCase。
- **标题栏**：图标（📦）+ 标题文本（`titlePrefix + 名称`）+ **对象类型标签**（`category`，有值时显示，样式 `.problem-detail-core-business-entity-category-tag` 蓝底）+ **全局引用标签**（`is_global_shared` 为 true 时「全局引用数据」、为 false 时「非全局引用数据」，样式 `.problem-detail-core-business-entity-global-tag` 绿底）+ **角色标签**（`roleTag`/object_role，样式 `.problem-detail-core-business-entity-role-tag` 黄底）+ 折叠箭头。**对象类型**与**是否全局引用数据**仅在标题栏以标签展示，内容区不展示。
- **内容区（默认折叠）**：四块子卡片**垂直串列**：
  1. **设计用途**：以**表格**展示，表头「项目」「内容」；三行分别为**业务功能**、**对冲 Gap**、**设计思路**，内容由 `parseObjectUsageTriple(object_usage)` 从 `object_usage` 字符串解析得到（格式「业务功能：...。对冲Gap：...。设计思路：...」）；无内容时占位「—」。表格类 `problem-detail-core-business-usage-table`。
  2. **字段定义**（表格）、**状态机**（列表）、**关联对象**（列表）。
- **字段定义表格**：表头为「字段名」「数据类型」「设计意图」；单元格中若 `description` 以「设计意图：」开头则去前缀后展示；表格采用淡灰色表格线。
- **空数据**：无设计用途/fields/state_machine/relations 时对应子卡片仍输出，内容为占位「—」。
- **样式类**：`problem-detail-card-core-business-entity`、`problem-detail-core-business-entity-subcard`、`problem-detail-core-business-entity-category-tag`、`problem-detail-core-business-entity-global-tag`、`problem-detail-core-business-entity-role-tag`、`problem-detail-core-business-usage-table`、`problem-detail-core-business-object-table` 等。

### 7.3 单环节视图：`buildCoreBusinessObjectStepViewHtml(match)`

- **入参**：单个环节对象 `match`，含 `local_gap_resolved`、`entities`（归一后含 `object_role`）。
- **视图结构**（同等级两块卡片）：
  1. **局部 ITGap 解决思路**（`problem-detail-card-core-business-local-gap`）：标题栏**明黄底**（#ffeb3b）、**深蓝字**（#1a237e）；内容区不设独立背景，内容字体明黄色、比标题小一号；展示 `local_gap_resolved`。
  2. **核心业务对象设计**（`problem-detail-card-core-business-design`）：**可折叠**，标题栏样式与局部 ITGap 一致（明黄底深蓝字）。标题栏文案为「核心业务对象设计」+ **分割线**（`｜`）+ **「N个对象」** 标签（N 为该环节实体总数，无对象时不显示）。展开后内容为 **`.problem-detail-core-business-object-design-groups`**：
     - **按 object_role 分组的一级可折叠栏目**（`problem-detail-card-core-business-design-group`）：每栏目标题为该类型说明（object_role）+ **分割线**（`｜`）+ **「M个对象」** 标签（M 为该分组内实体数，无对象时不显示），样式同 ITGap 标题栏；点击展开后为该类型下的对象卡片列表。
     - 列表容器 **`.problem-detail-core-business-object-design-list`**：**垂直排列**，左侧**树形引导线**（竖线 + 每项前横枝，与角色与权限环节子卡片一致）；每项 **`.problem-detail-core-business-object-design-item`** 内为一张对象卡片（`buildEntityCardHtml(e, { titlePrefix: '对象：', roleTag: e.object_role })`）。
- 无 entities 时仅输出「核心业务对象设计」卡片，内容区占位「该环节暂无业务对象数据」。

### 7.4 节点/环节卡片列表：`buildCoreBusinessObjectNodeCardsHtml(model)`

- **入参**：`parseCoreBusinessObjectModel` 的返回值（环节对象数组）。
- **按环节格式**（首项含 `entities` 且含 `step_name` 或 `stage_name`）：
  - 每个环节一张「环节卡片」：
    - 标题：`stage_name － step_name` 或 fallback 到 `step_name` / `stage_name` / step_id 等。
    - 卡片内带 tab：「view」与「json」；view 为 `buildCoreBusinessObjectStepViewHtml(item)`，json 为该环节对象的格式化 JSON。
    - 标题区有「核心业务对象推演」文案与 view/json 切换按钮。
  - 最外层为「环节列表」标题 + 多张 `problem-detail-card-core-business-object`。
- **扁平实体格式**（如全局 entities 归一后的单环节或其它无 step/stage 的结构）：
  - 从 model 中提取所有 `entities` 并扁平化，再对每个实体调用 `buildEntityCardHtml(e)`，统一放在「核心业务对象」标题下，无 view/json tab。

主流程将 `buildCoreBusinessObjectNodeCardsHtml(parsedModel)` 的 HTML 插入工作区（例如在 `itStrategyPlanViewingSubstep === 1` 时），并依赖 main.js 中已有的折叠、tab 切换等事件绑定（若选择与 role-permission 相同的 class 命名规范，可复用部分逻辑）。

---

## 8. 任务确认交互逻辑（封装在本模块）

### 8.1 `buildCoreBusinessObjectContextJson(item, valueStream, getLatestConfirmedRolePermissionContent)`

**作用**：构建任务确认时写入过程日志「上下文」的拆分数据。不依赖 main 或 storage，仅依赖传入的 `item`、已解析的 `valueStream` 以及获取已确认角色权限内容的函数。

**返回**：`{ valueStream, globalItGap, localItGapByStep, rolePermissionByStep }`，其中 `localItGapByStep` 由 `item.localItGapSessions` 与 `item.localItGapAnalyses` 合并；`rolePermissionByStep` 由 `getLatestConfirmedRolePermissionContent(item)` 经 `parseRolePermissionModel` 得到。若 `valueStream` 无效则返回 `null`。

### 8.2 `executeCoreBusinessObjectTaskOnConfirm(item, valueStream, callbacks)`

**作用**：封装「用户点击核心业务对象推演任务通知的确认按钮」后的全部数据与推送逻辑，由 main.js 在点击确认时调用，不内联任何核心业务对象业务逻辑。

**callbacks**：`{ pushAndSaveProblemDetailChat, updateDigitalProblemCoreBusinessObjectSessions, getTimeStr, getLatestConfirmedRolePermissionContent }`。

**过程日志推送**：依次推送 **4 条** `coreBusinessObjectContextBlock`（仅入沟通历史过程日志，不在聊天区展示），每条带 `contextLabel` 与对应 `contextJson`，过程日志中标签为「上下文」、标签右侧显示备注：

| 顺序 | contextLabel | contextJson |
|------|--------------|-------------|
| 1 | 价值流设计 json | valueStream |
| 2 | 全局 ITGap 分析 json | globalItGap |
| 3 | 局部 ITGap 分析 json | localItGapByStep |
| 4 | 角色与权限模型推演 json | rolePermissionByStep |

随后推送一条 `coreBusinessObjectSessionsBlock`（聊天区展示 session 确认内容块；过程日志中标签为「输出」或「确认」，标签右侧备注「核心业务对象推演 session 计划」）。

**main.js 配合**：task11 确认时**不**推送通用的 `taskContextBlock`，避免过程日志出现重复的无备注「上下文」条目。

**返回**：`{ ok: true, sessions, updatedItem }` 或 `{ ok: false, error: string }`。成功时 main.js 用 `updatedItem` 更新当前详情、重绘聊天与工作区并切换子步骤；失败时 main.js 用 `error` 推送一条系统提示。

### 8.3 `buildCoreBusinessObjectSessionsBlockHtml(sessions, timestamp, deleteIcon)`

**作用**：生成聊天区「核心业务对象推演 Session」内容块的 HTML（与角色与权限 session 块样式一致），供 main.js 在 `renderProblemDetailChatFromStorage` 中注入，不在此模块外重复拼接 HTML。

**常量**：模块内定义 `CORE_BUSINESS_OBJECT_TASK_ID = 'task11'`、`CORE_BUSINESS_OBJECT_NEED_VALUE_STREAM_MSG`，并挂到 global，便于与过程日志、错误提示统一。

### 8.4 过程日志与沟通历史（js/communication-history.js）

- **上下文卡片**：`coreBusinessObjectContextBlock` 纳入 task11 过程日志；`getCommunicationLogType` 返回「上下文」；时间线标题栏为「上下文」+ 备注（`contextNoteForHead = parsed.contextLabel`），详情内容为 `contextJson` 的 JSON。
- **Session 计划块**：`coreBusinessObjectSessionsBlock` 纳入 task11 过程日志；未确认时标签「输出」、已确认时「确认」；时间线标题栏在标签右侧显示备注 `sessionPlanNoteForHead = '核心业务对象推演 session 计划'`，详情内容为 `sessions` 的 JSON。
- **单环节推演卡片**：`coreBusinessObjectAnalysisCard` 纳入 task11 过程日志；未确认时标签「输出」、已确认时「确认」；时间线标签右侧显示对应环节名称（`stepNameForHead`），详情内容为该环节推演 JSON。与角色与权限单环节卡片交互一致。
- **全部确认提示块**：`coreBusinessObjectAllDoneBlock` 纳入 task11 过程日志；未全部确认时标签「输出」、已全部确认时「确认」；时间线标题为「核心业务对象推演全部结束」/「核心业务对象推演全部确认」，详情为提示文案。

### 8.5 手工逐项确认、自动顺序执行与全部确认（main.js）

- 用户点击「手工逐项确认」后，main.js 调用 `runCoreBusinessObjectForNextStep()`：对**下一待推演环节**调用 `generateCoreBusinessObjectForStepWithStrictPrompt`，将返回的 JSON 写入该 session 的 `coreBusinessObjectJson`，并 **pushAndSaveProblemDetailChat** 一条 `coreBusinessObjectAnalysisCard`（content、stepName、stepIndex、confirmed: false、llmMeta）。聊天区渲染该卡片：标题「核心业务对象推演：{环节名}」，内容为 JSON，操作区为**确认、重做、修正、讨论**。过程日志中该条显示为「输出」、右侧标注环节名称。
- 用户点击「自动顺序执行」后，main.js 调用 `runCoreBusinessObjectAutoSequential()`：按 session 顺序逐环节调用上述 LLM 并更新 session 与工作区；**当所有 session 均有 `coreBusinessObjectJson` 时**，推送一条 **`coreBusinessObjectAllDoneBlock`**（文案：「所有环节的核心业务对象推演已经结束，是否全部确认？」+ 按钮「全部确认」），不自动确认，由用户后续操作。
- **全部确认触发条件**：（1）自动顺序执行跑完所有环节后自动推送上述提示块；（2）**刷新页面后**：若当前问题处于核心业务对象推演阶段、所有 session 已有大模型输出且聊天中存在未确认的 `coreBusinessObjectAnalysisCard`，main.js 在 `initProblemDetailChat` 后调用 **`ensureCoreBusinessObjectAllDoneBlockIfNeeded()`**，若无该块则追加同一条「全部确认」提示块并保存。
- **全部确认按钮**：用户点击「全部确认」后，main.js 将聊天中所有 `coreBusinessObjectAnalysisCard` 置为 `confirmed: true`，将 `coreBusinessObjectAllDoneBlock` 置为 `allConfirmed: true`，保存并重绘聊天、工作区、过程日志；过程日志中对应环节的 JSON 条目由「输出」变为「确认」。若有未确认项被确认，则弹出 task11「是否视为完成」确认。
- **刷新时任务通知**：当任务处于核心业务对象推演阶段且当前状态会触发「全部确认」提示块（所有 session 有输出且存在未确认 CBO 卡片）时，**不再**下发「任务通知：我即将开始【核心业务对象推演】任务」（`showTaskStartNotificationIfNeeded('task11', …)` 内判断并 return）。
- 工作区环节卡片内「核心业务对象推演」子卡片**仅在「核心业务对象推演」任务页**（`itStrategyPlanViewingSubstep === 1`）展示；在「角色与权限模型推演」任务页（substep 0）不展示，由 main.js 在 `renderProblemDetailContent` 中按子步骤决定是否拼接该块。子卡片**默认展示 json 页**（大模型返回的 JSON 显示在 json tab）；有数据时 view 页为解析后的实体视图或同份 JSON。

### 8.6 重启当前任务时清空工作区（main.js）

- 用户点击「重启当前」且当前任务为 task11 时，`applyRestartCurrentTask` → `buildItemClearCurrentTaskOnly` → `buildItemAfterRollbackToTask(item, 'task11')`。对 task11 单独处理：保留 `coreBusinessObjectSessions` 的 session 列表结构，将每个 session 的 **coreBusinessObjectJson** 置为 **null**，并更新 `completedTaskIds`。写回存储后工作区重绘，各环节「核心业务对象推演」子卡片恢复为「待推演」。聊天区中 task11 相关消息（含「正在进行…核心业务对象推演」、session 块、单环节卡片等）由 `filterChatMessagesRemoveTask(chats, 'task11')` 一并移除（过程日志推断见 communication-history 的 `inferTaskIdFromMessage`）。

---

## 9. 对外暴露的 API（挂载到 global）

| 函数名 | 说明 |
|--------|------|
| `generateCoreBusinessObjectSessions(valueStream)` | 根据价值流生成推演 session 数组，不调 LLM |
| `generateCoreBusinessObjectForStepWithStrictPrompt(stepName, stageName, stepIndex, valueStreamJson, globalItGapJson, localItGapJson, rolePermissionJson)` | 单环节推演（严格提示词，当前主入口），返回该环节的 LLM 文本（严格 JSON 单元素数组） |
| `generateCoreBusinessObjectForStep(...)` | 针对单环节调用大模型（自由提示词），返回 Promise |
| `parseCoreBusinessObjectModel(markdown)` | 解析模型输出或历史文本为环节/实体结构 |
| `buildCoreBusinessObjectNodeCardsHtml(model)` | 将解析后的模型数组渲染为环节/实体卡片列表 HTML |
| `buildCoreBusinessObjectStepViewHtml(match)` | 将单个环节对象渲染为实体卡片视图 HTML |
| `formatCoreBusinessObjectField(val)` | 将字段值渲染为 HTML（字符串/Markdown/对象） |
| `buildEntityCardHtml(entity, opts)` | 将单个实体对象渲染为一张实体卡片 HTML；opts 含 titlePrefix、roleTag |
| `buildCoreBusinessObjectContextJson(item, valueStream, getLatestConfirmedRolePermissionContent)` | 构建任务确认时的上下文 JSON |
| `executeCoreBusinessObjectTaskOnConfirm(item, valueStream, callbacks)` | 执行任务确认后的推送与 session 生成逻辑，返回结果或错误信息 |
| `buildCoreBusinessObjectSessionsBlockHtml(sessions, timestamp, deleteIcon)` | 生成聊天区 session 确认内容块 HTML |

**常量**：`CORE_BUSINESS_OBJECT_TASK_ID`、`CORE_BUSINESS_OBJECT_NEED_VALUE_STREAM_MSG`。

主流程（main.js）仅负责传入回调、根据返回值更新状态与重绘界面，不内联核心业务对象推演的任务确认或 session 块渲染逻辑。

---

## 10. 数据流简图

**推演与渲染**：

```
价值流 (valueStream)
    → generateCoreBusinessObjectSessions
    → sessions[{ stepName, stepIndex, stageName, coreBusinessObjectJson }]
    → 主流程按 step 调用 generateCoreBusinessObjectForStepWithStrictPrompt(...)（自动顺序执行 或 手工逐项确认）
    → LLM 返回 content (严格 JSON 单元素数组文本)
    → 写入 session.coreBusinessObjectJson；手工逐项时 pushAndSaveProblemDetailChat(coreBusinessObjectAnalysisCard)
    → parseCoreBusinessObjectModel(content) 或直接以 coreBusinessObjectJson 渲染
    → model (环节对象数组，每项含 stage_name, step_name, entities)
    → buildCoreBusinessObjectNodeCardsHtml(model) 或 buildCoreBusinessObjectStepViewHtml(match)
    → HTML 插入工作区（itStrategyPlanViewingSubstep === 1），由 main.js 绑定折叠/tab 等事件
```

**任务确认（过程日志）**：

```
用户点击 task11 确认
    → main.js 不推送 taskContextBlock
    → executeCoreBusinessObjectTaskOnConfirm(...)
    → 依次 pushAndSaveProblemDetailChat( coreBusinessObjectContextBlock × 4 )（价值流设计 json、全局 ITGap、局部 ITGap、角色与权限）
    → pushAndSaveProblemDetailChat( coreBusinessObjectSessionsBlock )（过程日志中「输出」/「确认」右侧备注「核心业务对象推演 session 计划」）
    → updateDigitalProblemCoreBusinessObjectSessions(sessions)
    → 返回 { ok: true, sessions, updatedItem }
```

---

## 11. 调试与扩展

- **解析调试**：将模块内 `CORE_BUSINESS_OBJECT_LOG` 设为 `true`，可在控制台看到 `parseCoreBusinessObjectModel` 的解析步骤与识别到的格式（单环节/全局 entities/环节数组）。
- **实体结构扩展**：若 LLM 输出增加新字段（如 `indexes`、`constraints`），只需在 `buildEntityCardHtml` 中增加对应区块与表格/列表渲染；解析层对未知字段不做校验，会保留在 JSON 中。
- **全局一次性推演**：若产品上改为「全流程一次推演」而非按环节，可保留 `generateCoreBusinessObjectSessions` 返回单元素 session，并在 main.js 中只调用一次 `generateCoreBusinessObjectForStep`（或新增 `generateCoreBusinessObjectGlobal`），解析层已支持「仅含 entities 的对象」并归一为全局环节。
- **样式**：所有 class 均带 `problem-detail-core-business-object-*` 或 `problem-detail-card-core-business-*` 前缀，便于在 `styles.css` 中单独维护或与角色权限卡片风格统一。关键样式：局部 ITGap 与核心业务对象设计标题栏（明黄底 #ffeb3b、深蓝字 #1a237e）；对象类型分组栏、对象卡片标题（明黄字 #ffeb3b）；对象卡片内子卡片标题与角色与权限「过去操作」一致（#5dc9b4、0.78rem）；字段定义表淡灰线、数据类型列与设计意图列；树形引导线（`.problem-detail-core-business-object-design-list` + `.problem-detail-core-business-object-design-item::before`）。**个数标注**：标题与「N个对象」之间用分割线（`.problem-detail-core-business-object-count-sep`，字符 `｜`，左右留白、半透明）；个数文案使用 `.problem-detail-core-business-object-count-tag`（略小字号、同色）。
