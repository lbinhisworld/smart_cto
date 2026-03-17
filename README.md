# 企业信息与商业画布查询 · 数字化问题跟进

前端单页应用：支持**企业信息与 BMC 商业画布查询**，以及**数字化问题从录入到 ITGap 分析、IT 策略规划**的完整跟进流程。

---

## 功能概览

### 1. 画布模式（企业信息与商业画布）

- 输入公司名称，对接 Base44 企业分析 API，展示企业基本信息与 BMC 商业画布。
- 支持查询价值流列表（`VALUE_STREAM_API_URL`）。
- 支持将查询结果存储到本地，从列表进入企业详情。

### 2. 首页模式（数字化问题跟进）

- **录入**：输入企业名称及数字化问题描述 → 点击「解析」→ 大模型提炼结构化字段（客户名称、需求与挑战、IT 现状、时间要求）→「启动跟进」创建客户档案。
- **需求理解**：企业背景洞察（提炼/确认客户基本信息）→ 商业画布加载（生成 BMC）→ 需求逻辑构建。
- **工作流对齐**：绘制价值流图 → IT 现状标注 → 痛点标注。
- **ITGap 分析**：端到端流程绘制 → 全局 ITGap 分析 → 局部 ITGap 分析（逐环节）。
- **IT 策略规划**：基于 ITGap 结果制定策略（功能开发中）。

问题详情页带聊天区：用户输入消息后系统进行意图提炼（查询 / 修改 / 执行 / 讨论），并据此执行查询、修改工作区内容、重新执行某任务或开展讨论。

---

## 解决「无法访问此网站 / ERR_CONNECTION_REFUSED」

说明：**有程序在对应端口监听时，浏览器才能连上**。请按下面区分情况处理。

| 你访问的地址 | 原因 | 做法 |
|-------------|------|------|
| 例如 `http://localhost:3000`（前端页面） | 没有启动前端静态服务 | 在本项目目录执行：`npx serve .`，再打开终端里显示的地址（如 http://localhost:3000） |
| 画布页点击「查询」报错、或你访问的是后端 API 地址 | 企业分析 API 未就绪 | 确保 `js/config.js` 里 `API_URL`、`VALUE_STREAM_API_URL` 指向已部署的 Base44 接口；本地联调时需在后端项目启动对应服务 |

**注意**：首页的「解析」「生成 BMC」「需求逻辑」「价值流」「IT 现状/痛点标注」「ITGap 分析」及聊天区意图提炼等，均调用 **DeepSeek 大模型**（见下方配置），不依赖 Base44 端口。

---

## 使用方式

### 1. 启动前端

```bash
npx serve .
```

然后访问终端里提示的地址（如 `http://localhost:3000`）。也可直接双击 `index.html`（部分功能受 file 协议限制，建议用本地服务）。

### 2. 配置

- **大模型（DeepSeek）**  
  将 `config.example.js` 复制为 `config.local.js`，在 `config.local.js` 中填入 `DEEPSEEK_API_KEY`（及可选 `DEEPSEEK_API_URL`、`DEEPSEEK_MODEL`）。`config.local.js` 已加入 .gitignore，不会提交到 Git。用于解析数字化问题、生成 BMC、需求逻辑、价值流、IT 现状/痛点标注、全局/局部 ITGap 分析及聊天区意图提炼与回复。
- **企业分析 API**（画布模式）  
  在 `js/config.js` 中配置 `API_URL`（企业基本信息与 BMC 查询）、`VALUE_STREAM_API_URL`（价值流列表查询），按项目实际接口填写。

### 3. 后端接口约定（企业分析 API）

- 方法：`POST`
- 请求体：`{ "companyName": "企业名称" }`
- 成功：`{ "success": true, "data": { "basic_info", "business_model_canvas", "metadata" } }`
- 失败：`{ "error": "错误信息" }`，HTTP 状态码 400 / 404 / 500

若前端与 API 不同域，需在后端配置 CORS（允许前端所在域名和 `Content-Type: application/json`）。

---

## 文件说明与前端模块

### 核心文件

| 文件 | 说明 |
|------|------|
| `index.html` | 页面结构：首页录入、画布搜索与结果、列表、问题详情（工作区 + 聊天区）、任务追踪等 |
| `styles.css` | 样式与 BMC 九宫格、价值流、工作区卡片、沟通历史任务标题栏颜色（已完成=绿色、进行中=蓝色）等布局 |
| `config.js` / `config.local.js` | 根目录配置：`config.local.js` 中配置 DEEPSEEK_API_KEY 等（已 gitignore） |
| `main.js` | 入口：路由、业务逻辑、意图提炼、工作区与聊天区、任务阶段与过程日志、沟通历史渲染等（渲染细节已拆至 js 子模块） |

### JS 模块（`js/` 目录）

| 文件 | 说明 |
|------|------|
| `js/config.js` | 常量、API 地址、存储键、任务定义（FOLLOW_TASKS、ITGAP_HISTORY_TASKS、IT_STRATEGY_TASKS、TASK_EXTRA_FIELDS、BASIC_INFO_FIELDS、BMC_FIELDS、LABEL_TO_PATH 等） |
| `js/utils.js` | 工具函数：formatValue、escapeHtml、renderMarkdown、getTimeStr、formatHistoryTime、formatChatTime、slugifyTopicName |
| `js/api.js` | DeepSeek 大模型调用：DEEPSEEK_API_* 配置、fetchDeepSeekChat、buildLlmMetaHtml |
| `js/storage.js` | 本地存储封装：存档列表、知识库、数字化问题与问题详情聊天、任务追踪、操作历史等读写（getSavedAnalyses、saveAnalysis、getDigitalProblems、updateDigitalProblemBmc、getProblemDetailChat 等） |
| `js/communication-history.js` | 沟通历史提取与按任务分段：inferTaskIdFromMessage、shouldIncludeInCommunicationHistory、getCommunicationsByTask(createdAt, chats)、getCommunicationsAsTimeline（不写入存储，仅从聊天记录聚合） |
| `js/valueStream.js` | 价值流解析与渲染：extractPureStageName、parseValueStreamGraph、renderValueStreamViewHTML、renderEndToEndFlowHTML、getValueStreamList、currentValueStreamList、renderValueStreamList |
| `js/rendering.js` | 详情与查询结果渲染：buildPageStructureForLLM（供意图提炼的页面结构文本）、renderBasicInfo、renderBMC、renderMetadata、buildDetailHTML（详情页整块 HTML） |
| `js/navigation.js` | 视图与面板：switchView（home/tools/detail/problemDetail/taskTracking）、renderSavedList、toggleChatPanel、toggleHistoryPanel、toggleProblemDetailHistory；main 需将 openDetail、renderModificationHistory、renderProblemDetailHistory 挂到 window 供其回调 |

### 脚本加载顺序（index.html）

加载顺序需保证依赖前置：`config.js` → `config.local.js` → `js/config.js` → `js/utils.js` → `js/api.js` → `js/storage.js` → `js/communication-history.js` → `js/valueStream.js` → `js/rendering.js` → `js/navigation.js` → `main.js`。

### 文档

| 文件 | 说明 |
|------|------|
| `README.md` | 本说明 |
| `PROMPTS.md` | 所有大模型提示词汇总（解析、BMC、需求逻辑、价值流、IT 现状/痛点、ITGap、意图提炼等） |
| `对话模型管理.md` | 意图类型、过程日志纳入/展示规则、ITGap 流程与代码位置 |
| `数字化问题跟进阶段设计.md` | 大阶段与任务定义、评价体系、阶段切换与聊天区提示块设计 |
| `docs/knowledge-base-design.md` | 知识库功能设计（话题、时间线、意图与存储） |
| `js/coreBusinessObject.md` | 核心业务对象推演模块（task11）设计 |
| `js/localItGap.md` | 局部 ITGap 分析模块（task9）实现说明 |
| `js/rolePermission.md` | 角色与权限模型推演模块（task10）实现说明 |

---

## 相关文档

- 大模型提示词与 API 配置：[PROMPTS.md](./PROMPTS.md)
- 意图类型与过程日志：[对话模型管理.md](./对话模型管理.md)
- 阶段与任务设计：[数字化问题跟进阶段设计.md](./数字化问题跟进阶段设计.md)
- 知识库功能设计：[docs/knowledge-base-design.md](./docs/knowledge-base-design.md)
