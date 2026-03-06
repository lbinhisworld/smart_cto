## 知识库功能设计文档

### 1. 功能定位与总体目标

- **定位**：为项目内各类「工具 / 方法论 / 平台」建立一个轻量级知识库，用于沉淀实际使用过程中的经验、注意事项和最佳实践。
- **入口**：顶部导航中的 `知识库` 按钮（`#topNav` → `#btnTools`），点击后切换到 `#toolsView` 视图。
- **核心目标**：
  - 将**零散的对话记录**结构化为「话题 + 时间线」。
  - 通过**对话意图分析模型**，半自动归档到对应的话题下。
  - 支持**补充已有话题**与**新增话题**两种沉淀方式。
  - 所有话题与时间线内容均本地持久化，可多次打开浏览器后继续使用。

---

### 2. 主要数据结构与存储设计

#### 2.1 工具 / 话题清单（TOOL_KNOWLEDGE_ITEMS）

- 常量数组 `TOOL_KNOWLEDGE_ITEMS`，每项结构：
  - `id: string`：话题唯一 ID（如 `bmc`、`value_stream`）。
  - `name: string`：话题名称（如「商业模式画布（BMC）」）。
  - `description: string`：话题描述，用于话题卡片的副标题。
- 默认内置话题：
  - BMC 商业模式画布。
  - 价值流图（Value Stream）。
  - ITGap 分析。

#### 2.2 本地持久化 Key

- `TOOL_KNOWLEDGE_ITEMS_STORAGE_KEY = 'tool_knowledge_topics'`
  - 存储自定义话题（包括新增的话题卡片）。
  - 结构：`Array<{ id, name, description }>`。
- `TOOL_KNOWLEDGE_STORAGE_KEY = 'tool_knowledge_notes'`
  - 存储每个话题的时间线：
  - 结构：`{ [toolId: string]: Array<{ content: string, createdAt: string, contentJson?: object }> }`。`createdAt` 为 ISO 字符串，展示时统一格式化为「日期+具体时间」（如 `yyyy-MM-dd HH:mm:ss`）。
- `TOOL_KNOWLEDGE_CHAT_STORAGE_KEY = 'tool_knowledge_chat_html'`
  - 存储左侧「话题讨论」聊天区的 **HTML 片段**（包含意图卡片）。

#### 2.3 初始化与加载逻辑

- 启动时调用 `loadToolKnowledgeItemsFromStorage()`：
  - 若本地已有话题列表，则覆盖默认的 `TOOL_KNOWLEDGE_ITEMS`。
  - 否则保留默认内置话题。
- 切换到 `toolsView` 时调用 `renderToolsKnowledge()`：
  - 使用当前的 `TOOL_KNOWLEDGE_ITEMS` 和 `TOOL_KNOWLEDGE_STORAGE_KEY` 中的时间线数据，渲染右侧话题卡片。
  - 首次渲染时，通过 `restoreToolsChatMessagesFromStorage()` 恢复左侧聊天记录。

---

### 3. UI 结构与交互设计

#### 3.1 布局概览（`#toolsView`）

- **左侧：话题讨论区（`aside.tools-chat`）**
  - `#toolsChatMessages`：对话消息列表（用户消息 + 系统意图卡片）。
  - `#toolsChatInput`：多行文本输入框。
  - `#toolsChatSend`：发送按钮。
- **右侧：话题列表工作区（`main#toolsList`）**
  - 每个话题渲染为一张卡片：
    - 标题：话题名称。
    - 副标题：话题说明（description）。
    - 时间线：该话题下的知识点记录。

#### 3.2 话题卡片（右侧）

- DOM 结构（简化）：
  - `<article class="tools-card" data-tool-id="...">`
    - `<button class="tools-card-header">`：标题行，可折叠 / 展开。
      - `tools-card-title`：话题名称。
      - `tools-card-desc`：话题副标题，可多行展示。
    - `<div class="tools-card-body">`
      - `<div class="tools-card-timeline">`：时间线容器。
        - `<ul class="tools-timeline">`
          - 多个 `<li class="tools-timeline-item">`：
            - `tools-timeline-time`：时间（与聊天区时间戳格式一致：日期+具体时间）+ 删除按钮。
            - `tools-timeline-content`：内容卡片（支持内部滚动，`max-height: 260px`；JSON 面板约 234px）。

- 视觉风格：
  - 使用垂直时间线设计：左侧线 + 蓝色圆点，参考「问题详情 → 沟通历史 → 任务过程日志」样式。
  - 每个时间节点由上方的时间行 + 下方深色内容卡片组成。
  - 时间线整体在卡片内部滚动（`max-height + overflow-y: auto`），防止单卡片撑爆列表高度。

#### 3.3 话题讨论区（左侧）

- 消息类型：
  - 用户消息（`tools-chat-msg-user`）。
  - 系统消息：包括「正在分析意图」提示、错误提示、以及**意图卡片**。
- 样式设计与「问题详情聊天区」对齐：
  - 共用 `problem-detail-chat-msg` 的基础样式，使用户与系统消息气泡风格统一。
  - 使用相同的时间戳样式、小号字体与间距。

---

### 4. 对话意图模型设计

#### 4.1 意图分类（intent）

当前支持的意图枚举值（共 5 类）：

- `增加`：希望创建全新的话题主题，或将某段内容作为一个新条目独立记录。
- `补充`：在已有话题下补充更多说明、案例或细节（**不新建话题，只追加时间线**）。
- `删除`：希望删除某个话题（主题）及其所有时间线记录，属于**物理删除整个话题卡片**。
- `修改`：希望根据沟通内容**更新**已有时间线节点；系统将意图卡片 + 该话题时间线发往大模型，返回需更新的节点（时间戳 + 修改后内容），用户确认后覆盖对应节点。
- `讨论`：泛化交流、优缺点、踩坑经验等；系统将时间线 + 用户沟通内容发往大模型，返回回复卡片，用户确认后将回复写入时间线。

（已移除「查询」意图；若模型历史返回「查询」，前端会归一为「讨论」。）

#### 4.2 模型 Prompt 与输出格式

- 调用入口：`analyzeToolDiscussionIntent(text)`。
- 模型系统提示词要求：
  - 从上述 5 类中选择 1 个意图。
  - 识别清晰的「讨论话题」名称（工具 / 平台 / 方法论等）。
  - `content` 字段直接回传用户原始输入，**不做改写**。
  - **尝试抽取结构化 JSON**：根据沟通内容的文本结构，生成尽量合理的 `contentJson`：
    - 当内容本身已经是 JSON 或接近 JSON 时，直接解析或轻微修正为合法 JSON；
    - 当内容是「键: 值」/「字段：说明」/ 列表项等结构化文本时，根据字段含义生成 JSON；
    - 若确实无法抽取出有意义的结构化信息，则返回 `null`。
- 约定的 JSON 输出结构：

```json
{
  "intent": "增加|补充|删除|修改|讨论",
  "tool": "讨论话题名称",
  "newTopic": "当 intent 为 增加 时的新增话题名称；否则为 \"\"",
  "content": "用户的原始输入文本",
  "contentJson": null 或 { ...基于内容推断出的结构化 JSON... }
}
```

---

### 5. 对话处理与意图卡片逻辑

#### 5.1 发送消息（handleToolsChatSend）

1. 将用户输入追加到左侧聊天区（`tools-chat-msg-user`）。
2. 插入「正在分析本次工具讨论的意图与对象…」系统消息。
3. 调用 `analyzeToolDiscussionIntent(text)`，获得 `{ intent, tool, newTopic, content, _llmMeta }`。
4. 移除「正在分析」消息，渲染一张**意图确认卡片**。

#### 5.2 意图确认卡片结构

- 使用 `problem-detail-basic-info-card` 的结构化行样式，每行包含：
  - `沟通意图`：渲染为下拉框 `<select class="tools-intent-select">`，选项：
    - `['增加', '补充', '删除', '修改', '讨论']`
  - `讨论话题`：渲染为可编辑文本框 `<input class="tools-topic-input">`。当意图为「增加」时，该字段初始值设为要新增的话题名称（来自 `newTopic` / `tool`），占位符为「请输入或修改要新增的话题名称」；其他意图时占位符为「请输入或修改本次讨论的话题名称」。不单独展示「新增话题」字段。
  - `沟通内容`：展示 `content || 原始用户输入` 的纯文本说明。
  - `沟通内容 JSON`：当 `contentJson` 非空时，展示为只读的 JSON 预览块 `<pre class="tools-intent-json-pre">`，内部采用截断展示（固定高度、内部省略号），防止撑出聊天框。
- 底部操作区：
  - 「确认」按钮：`.btn-confirm-tool-intent`，带 `data-extracted` 属性存储原始 JSON（包括 `contentJson`、`cardCreatedAt`）。生成卡片时写入 `cardCreatedAt`（ISO），确认写入时间线时使用该时间戳，使节点显示时间与聊天区一致。

#### 5.3 确认时的业务逻辑

监听：`el.toolsChatMessages` 上的 `click` 事件，捕捉 `.btn-confirm-tool-intent`。

1. 解析 `data-extracted` 得到 `extracted`。
2. 读取当前卡片上的用户修改：
   - 下拉框 `tools-intent-select` → 最终 `intent`。
   - 话题输入框 `tools-topic-input` → 最终 `topicName`：
     - 若有多个输入框，取最后一次覆盖（实际场景中会有「讨论话题」和可选的「新增话题」）。
3. 若 `topicName` 为空，则使用 `'自定义话题'` 作为兜底。
4. 根据 `topicName` 在 `TOOL_KNOWLEDGE_ITEMS` 中查找 `target`：
   - 精确比对 `name.toLowerCase()`。

##### 5.3.1 意图为「讨论」时的特殊处理

- 当初始意图为 `讨论` 且未命中已存在话题：
  - 自动将意图修正为 `增加`（视为「新话题的第一次讨论」）。
- 当意图为 `讨论` 且命中已有话题时（**讨论回复流程**）：
  1. 先将意图卡片内容写入时间线：`appendToolKnowledge(target.id, note, noteJson, extracted.cardCreatedAt)`。
  2. 展示「正在结合该话题时间线知识生成讨论回复…」，调用 `fetchToolDiscussionReply(toolId, note)`：
     - 上下文：该话题所有时间线节点（内容 + contentJson）+ 用户沟通内容。
     - 大模型返回一段回复正文。
  3. 在话题讨论区插入**讨论回复卡片**（`.tools-discussion-response-card`）：
     - 展示大模型返回内容（Markdown 渲染）。
     - 下方按钮：「确认」「重做」。
  4. 用户点击**确认**：将当前卡片中的回复正文作为新条目写入该话题时间线，并移除按钮。
  5. 用户点击**重做**：再次调用 `fetchToolDiscussionReply`，用新回复替换卡片内容，可再次确认或重做。

##### 5.3.2 创建 / 选择话题卡片

- 若找不到 `target`：
  - **意图为「增加」**：
    - 生成 `topicId = slugifyTopicName(topicName)`。
    - 若 `TOOL_KNOWLEDGE_ITEMS` 中不存在该 ID，则创建：
      - `{ id: topicId, name: topicName, description: '用户新增话题' }`
    - 调用 `saveToolKnowledgeItemsToStorage()` 持久化。
  - **意图为「补充」或其他**：
    - 若 `currentToolKnowledgeId` 存在，则使用当前选中的话题。

##### 5.3.3 处理时间线追加与时间戳一致

- 准备追加内容：
  - 文本部分：`note = extracted.rawText || extracted.content`。
  - JSON 部分：`noteJson = extracted.contentJson || null`。
  - 时间戳：使用 `extracted.cardCreatedAt`（意图卡片创建时的 ISO 时间），使时间线节点显示时间与聊天区该卡片下方时间一致。
- 若 `target` 存在且 `note` 非空（且当前分支并非「讨论」或「修改」的独立流程）：
  - 将 `currentToolKnowledgeId` 切换为 `target.id`。
  - 调用 `appendToolKnowledge(target.id, note, noteJson, extracted.cardCreatedAt)`：
    - 读取 `TOOL_KNOWLEDGE_STORAGE_KEY` 当前状态。
    - 向对应 `toolId` 的数组追加 `{ content, createdAt, contentJson? }` 条目（`createdAt` 优先使用传入的 `cardCreatedAt`）；
    - 写回本地存储。
  - 调用 `renderToolsKnowledge()` 刷新右侧话题列表。
  - 调用 `saveToolsChatMessagesToStorage()` 保存左侧聊天 HTML。
- **全系统时间戳**：聊天块与时间线统一使用「日期+具体时间」格式（如 `yyyy-MM-dd HH:mm:ss`），由 `getTimeStr()` / `formatChatTime()` 提供。

##### 5.3.4 意图为「删除」时的处理

- 当最终意图为 `删除` 且成功命中某个话题 `target` 时：
  - 从 `TOOL_KNOWLEDGE_ITEMS` 中移除该话题，并调用 `saveToolKnowledgeItemsToStorage()` 持久化；
  - 从 `TOOL_KNOWLEDGE_STORAGE_KEY` 对应的状态对象中删除该话题的时间线数组，并调用 `saveToolKnowledgeState()`；
  - 若当前选中话题正是被删除的话题，则将 `currentToolKnowledgeId` 切换为剩余话题中的第一个（若不存在则置空）；
  - 调用 `renderToolsKnowledge()` 重新渲染话题列表；
  - 在左侧聊天区追加系统消息，提示「已删除话题『xxx』及其时间线记录」，并同步更新聊天本地存储。

##### 5.3.5 「讨论」自动转为「新增话题」的后续整理

- 当原始意图为 `讨论`、最终意图被转为 `增加` 且成功创建新话题卡片后：
  - 触发二次异步整理：
    - 调用 `summarizeToolDiscussionContent(note)` 让模型将讨论内容浓缩为一句简洁知识点。
    - 将返回的 `summary` 作为新条目再次追加到对应话题时间线。
    - 同时在左侧聊天区追加一条系统消息展示该总结。

##### 5.3.6 意图为「修改」时的处理（修改方案卡片）

- 当意图为 `修改` 且命中已有话题时：
  1. 若该话题暂无时间线记录：在聊天区提示「该话题暂无时间线记录，无法执行修改」，结束。
  2. 否则展示「正在根据沟通内容生成时间线修改方案…」，调用 `fetchToolModificationUpdates(toolId, note)`：
     - **上下文**：意图卡片内容（沟通内容）+ 该话题所有时间线节点（每条带时间戳 `createdAt` 与内容/JSON）。
     - **任务描述**：请按照沟通内容信息更新上下文中的内容，并返回需要更新的时间线内容块及时间线时间戳。
     - 大模型严格返回 JSON：`{ "updates": [ { "createdAt": "节点时间戳", "content": "修改后的正文", "contentJson": null 或 {} } ] }`。
  3. 若返回 `updates` 为空：在聊天区提示「未识别到需要修改的时间线节点」。
  4. 否则在话题讨论区插入**修改方案卡片**（`.tools-modification-response-card`）：
     - 需要修改的话题名称。
     - 每个更新项：时间线节点时间戳（格式与聊天一致）、修改后的内容。
     - 下方按钮：「确认」「重做」。
     - 卡片内隐藏存储 `updates` 的 JSON 与用户沟通内容（供确认/重做使用）。
  5. 用户点击**确认**：调用 `applyToolKnowledgeUpdates(toolId, updates)`，按 `createdAt` 匹配时间线节点，用返回的 `content`（及可选 `contentJson`）覆盖对应节点，刷新话题与时间线。
  6. 用户点击**重做**：再次调用 `fetchToolModificationUpdates`，用新返回的 `updates` 更新卡片内容，可再次确认或重做。

---

### 6. 「增加 / 补充 / 删除 / 修改 / 讨论」的差异行为

- **增加（新增主题）**
  - 语义：希望把当前讨论抽象为一个**新的知识主题**。
  - 行为：
    - 若无同名话题，则创建新的话题卡片。
    - 将本次讨论内容作为该话题时间线的第一条记录。
    - 可触发二次整理，将讨论内容总结为精炼说明再追加。

- **补充（追加说明）**
  - 语义：在已有主题下继续补充，**不创建新话题**。
  - 行为：
    - 若能找到同名话题，则直接在其时间线末尾追加一条记录。
    - 若找不到，则使用当前选中话题作为目标。
    - 不触发「自动新建话题」和「二次整理」逻辑。

- **删除（移除话题）**
  - 语义：不再需要某个话题及其下的所有知识记录。
  - 行为：
    - 命中话题后，从话题列表和本地存储中彻底移除该话题；
    - 同时删除该话题在时间线存储中的所有记录；
    - 自动调整当前选中话题，并在聊天区记录删除结果。

- **修改（更新已有节点）**
  - 语义：根据沟通内容更新该话题下某些时间线节点的内容。
  - 行为：
    - 不直接追加新条目；将意图卡片内容 + 该话题全部时间线发往大模型，得到需更新的节点列表（时间戳 + 修改后内容）；
    - 在聊天区展示修改方案卡片（确认/重做）；确认后用「修改后的内容」覆盖对应话题、对应时间戳的时间线节点。

- **讨论（延展讨论并写入回复）**
  - 语义：在已有话题下进行泛化讨论，由大模型结合时间线知识生成回复。
  - 行为：
    - 先将意图卡片内容写入时间线（时间戳与卡片一致）；
    - 再以时间线 + 用户沟通内容为上下文发往大模型，在聊天区展示回复卡片（确认/重做）；
    - 确认后将大模型回复作为新条目写入该话题时间线。

---

### 7. 时间线节点 JSON 视图与后续扩展

- 每条时间线节点在 `tools-card-timeline` 中渲染为：
  - 上方时间行（含时间与删除按钮）。
  - 下方内容卡片 `tools-timeline-content`：
    - 若无 JSON：仅展示文本内容。
    - 若有 JSON：内部包含「内容 / JSON」两个 Tab：
      - `内容` Tab：显示原始文本；
      - `JSON` Tab：显示 `contentJson` 的格式化结果，使用 `pre.tools-timeline-panel-json`，支持滚动但不会撑出卡片。
- 后续可扩展方向（TODO）：
  - 为时间线条目增加「标签 / 类型」字段（如「踩坑」「最佳实践」「注意事项」）。
  - 时间线节点编辑：当前已支持**删除**单条；**修改**意图通过大模型返回的更新方案（时间戳 + 修改后内容）覆盖对应节点，无需在话题卡片内直接编辑。
  - 增加搜索与过滤能力（按话题名、内容关键字、时间范围等）。
  - 将知识库导出为 Markdown / JSON，方便在外部文档中复用。

