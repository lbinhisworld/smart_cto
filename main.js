/**
 * 后端 API 地址（企业信息与商业画布查询）
 */
const API_URL = 'https://app-6aa0d22a.base44.app/api/apps/6969e6b3cbb5e6b66aa0d22a/functions/getCompanyAnalysis';

const VALUE_STREAM_API_URL = 'https://app-6aa0d22a.base44.app/api/apps/6969e6b3cbb5e6b66aa0d22a/functions/getCompanyValueStreams';

const STORAGE_KEY = 'company_analyses';
const DIGITAL_PROBLEMS_STORAGE_KEY = 'digital_problem_followups';
const PROBLEM_DETAIL_CHATS_STORAGE_KEY = 'problem_detail_chats';
const TASK_TRACKING_STORAGE_KEY = 'digital_problem_task_tracking';
const ROUTE_STORAGE_KEY = 'app_route_state';
const OPERATION_HISTORY_STORAGE_KEY = 'digital_problem_operation_history';
const TOOL_KNOWLEDGE_STORAGE_KEY = 'tool_knowledge_notes';
const TOOL_KNOWLEDGE_ITEMS_STORAGE_KEY = 'tool_knowledge_topics';
const TOOL_KNOWLEDGE_CHAT_STORAGE_KEY = 'tool_knowledge_chat_html';

/** ITGap 阶段在沟通历史中展示的任务（端到端流程绘制等） */
const ITGAP_HISTORY_TASKS = [
  { id: 'task7', name: '端到端流程绘制', stage: 'ITGap分析' },
  { id: 'task8', name: '全局 ITGap 分析', stage: 'ITGap分析' },
  { id: 'task9', name: '局部 ITGap 分析', stage: 'ITGap分析' },
];

/** IT 策略规划阶段任务 */
const IT_STRATEGY_TASKS = [
  { id: 'task10', name: '全局架构设计', stage: 'IT策略规划' },
  { id: 'task11', name: '环节专项设计', stage: 'IT策略规划' },
  { id: 'task12', name: '链条串联与闭环', stage: 'IT策略规划' },
];

/** 工具知识：工具清单（右侧长卡片列表） */
const TOOL_KNOWLEDGE_ITEMS = [
  {
    id: 'bmc',
    name: '商业模式画布（BMC）',
    description: '用于从客户细分、价值主张、渠道通路等九大模块系统性分析企业商业模式，是需求理解阶段的重要工具。',
  },
  {
    id: 'value_stream',
    name: '价值流图（Value Stream）',
    description: '用于从端到端流程视角梳理业务阶段与关键环节，识别价值创造路径和浪费点，是工作流对齐与 ITGap 分析的基础。',
  },
  {
    id: 'it_gap',
    name: 'ITGap 分析',
    description: '用于从数据、功能、体验/效率三维度分析 IT 能力与业务需求的差距，输出全球和局部 ITGap 分析结论，为 IT 策略规划提供输入。',
  },
];

/** 工具知识：当前选中的工具 ID（用于左侧聊天关联到某个工具卡片） */
let currentToolKnowledgeId = TOOL_KNOWLEDGE_ITEMS[0]?.id || '';

/** 工具知识：从本地存储加载自定义话题列表，覆盖默认列表 */
function loadToolKnowledgeItemsFromStorage() {
  try {
    const raw = localStorage.getItem(TOOL_KNOWLEDGE_ITEMS_STORAGE_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return;
    TOOL_KNOWLEDGE_ITEMS.length = 0;
    parsed.forEach((item) => {
      if (!item || !item.id || !item.name) return;
      TOOL_KNOWLEDGE_ITEMS.push({
        id: String(item.id),
        name: String(item.name),
        description: typeof item.description === 'string' ? item.description : '',
      });
    });
  } catch {
    // ignore
  }
}

/** 工具知识：将当前话题列表写入本地存储 */
function saveToolKnowledgeItemsToStorage() {
  try {
    localStorage.setItem(TOOL_KNOWLEDGE_ITEMS_STORAGE_KEY, JSON.stringify(TOOL_KNOWLEDGE_ITEMS));
  } catch {
    // ignore
  }
}

// 尝试从本地存储恢复工具知识话题（无记录时保留默认内置话题）
loadToolKnowledgeItemsFromStorage();

/** 工具/话题讨论意图管理：调用大模型分析用户对话题的意图与对象 */
async function analyzeToolDiscussionIntent(text) {
  const systemPrompt = `你是一个「工具/话题讨论意图分析助手」。用户会在聊天框中输入一段关于某个软件工具、平台、方法论或抽象话题（如企业微信、飞书、BMC 商业模式画布分析等）的讨论内容。

【你的任务】
1. 判断用户这段话的「沟通意图」是哪一类（只能从下面五类中选一类）：
   - 增加：提出新增功能、补充新的知识点、增加全新的用法或配置项等，并且希望作为一个「新主题」单独记录；
   - 补充：在已存在的话题/主题下补充更多说明、案例或细节，属于在原有主题时间线上继续追加内容；
   - 删除：希望删除某个配置、去掉某条规则、废弃某个用法/工具等；
   - 修改：希望修改现有配置、规则、流程、使用方式等；
   - 讨论：非明确增删改，而是泛化的经验交流、优缺点讨论、踩坑分享等。

2. 识别本段讨论主要涉及的「讨论话题」：
   - 可以是软件产品/平台（如：企业微信、飞书、钉钉、Jira）；
   - 也可以是方法论/分析工具（如：BMC 商业模式画布、价值流图、ITGap 分析等）；
   - 若无法确定具体工具，请尽量从语义中推断一个最接近的工具名称，推断失败则填 ""。

3. 沟通内容（content）直接返回用户原始输入文本（不做改写），用于在卡片中展示。
4. 同时，你需要根据这段沟通内容，尽量推断出一个结构化的 JSON（contentJson）：
   - 当内容本身已经是 JSON 或接近 JSON 时，直接解析或轻微修正为合法 JSON；
   - 当内容是「键: 值」/「字段：说明」/ 列表项等结构化文本时，请根据字段含义生成一个尽量合理的 JSON；
   - 若确实无法抽取出有意义的结构化信息，请将 contentJson 设为 null。

【输出格式】
请严格返回一个 JSON 对象，不要包含多余说明或 Markdown 代码块，例如：
{
  "intent": "增加|补充|删除|修改|讨论",
  "tool": "讨论话题（例如具体工具/平台/方法论名称，如 企业微信 或 BMC 商业模式画布）",
  "newTopic": "当 intent 为 增加 时，代表用户希望新增的话题名称；否则可为 \"\"",
  "content": "用户的原始输入文本",
  "contentJson": null 或 { ...基于内容推断出来的结构化 JSON... }
}`;

  const { content, usage, model, durationMs } = await fetchDeepSeekChat([
    { role: 'system', content: systemPrompt },
    { role: 'user', content: text },
  ]);
  const jsonMatch = content.match(/\{[\s\S]*\}/);
  const jsonStr = jsonMatch ? jsonMatch[0] : content;
  const parsed = JSON.parse(jsonStr);
  return { ...parsed, _llmMeta: { usage, model, durationMs } };
}

/** 数字化问题跟进任务定义 */
const FOLLOW_TASKS = [
  { id: 'task1', name: '企业背景洞察', stage: '需求理解', objective: '基于客户输入的企业信息，提炼并结构化企业基本信息，为后续 BMC 与需求逻辑分析提供基础。', evaluationCriteria: '成功提取并确认包含公司名称、信用代码、法人、成立日期、注册资本、经营范围等核心字段的结构化 JSON。' },
  { id: 'task2', name: '商业画布加载', stage: '需求理解', objective: '基于企业基本信息，运用商业模式画布（BMC）框架生成结构化商业分析，识别客户细分、价值主张、渠道通路等九大模块。', evaluationCriteria: '生成完整的 BMC JSON，包含行业背景洞察、九大画布模块及业务痛点预判，用户确认后视为完成。' },
  { id: 'task3', name: '需求逻辑构建', stage: '需求理解', objective: '基于客户初步需求、企业基本信息、BMC 三个维度，产出需求背后的逻辑链条分析，明确行业特性、商业模式局限与业务痛点的因果关联。', evaluationCriteria: '输出结构化的需求逻辑 Markdown，包含行业底层逻辑、因果关联、深层动机及逻辑链条总结，用户确认后视为完成。' },
  { id: 'task4', name: '绘制价值流', stage: '工作流对齐', objective: '基于 enterprise_info、bmc_data、requirement_logic 生成业务核心价值流图，划分阶段与环节，标注执行角色与预估耗时。', evaluationCriteria: '生成符合前端绘图要求的价值流 JSON，用户确认并完成「开始绘制价值流图」后视为完成。' },
  { id: 'task5', name: 'IT 现状标注', stage: '工作流对齐', objective: '结合需求逻辑，在价值流图每个环节节点标注该环节的 IT 支撑方式（手工/系统），区分纸质、excel 或具体系统名称。', evaluationCriteria: '每个环节均标注 itStatus，用户确认后视为完成。' },
  { id: 'task6', name: '痛点标注', stage: '工作流对齐', objective: '结合需求逻辑，在价值流图每个环节节点提炼该环节涉及到的痛点，为后续 IT Gap 分析提供输入。', evaluationCriteria: '每个环节均标注 painPoint（无明显痛点的环节不展示卡片），用户确认后视为完成。' },
];

/** 聊天区删除按钮图标（白色垃圾桶） */
const DELETE_CHAT_MSG_ICON = '<svg class="icon-trash" xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg>';

/** DeepSeek 大模型配置：请在 main.js 中设置你的 API Key，或通过环境变量/配置注入 */
const DEEPSEEK_API_URL = 'https://api.deepseek.com/v1/chat/completions';
const DEEPSEEK_API_KEY = 'sk-051df7f3ec0a406cb1ceb0fa83317d76'; // 请填入你的 DeepSeek API Key
const DEEPSEEK_MODEL = 'deepseek-chat';

/** 调用 DeepSeek 大模型，返回 content、usage、耗时 */
async function fetchDeepSeekChat(messages) {
  const start = Date.now();
  const res = await fetch(DEEPSEEK_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${DEEPSEEK_API_KEY}`,
    },
    body: JSON.stringify({ model: DEEPSEEK_MODEL, messages }),
  });
  const data = await res.json();
  const durationMs = Date.now() - start;
  if (data.error) throw new Error(data.error.message || JSON.stringify(data.error));
  const content = (data.choices?.[0]?.message?.content ?? '').trim();
  const usage = data.usage || {};
  return { content, usage, model: DEEPSEEK_MODEL, durationMs };
}

/** 构建 LLM 调用元信息 HTML（模型、token、耗时） */
function buildLlmMetaHtml(meta) {
  if (!meta) return '';
  const totalTokens = meta.usage?.total_tokens ?? ((meta.usage?.prompt_tokens || 0) + (meta.usage?.completion_tokens || 0));
  return `<div class="problem-detail-chat-msg-llm-meta">模型: ${escapeHtml(meta.model || DEEPSEEK_MODEL)} | 消耗 token: ${totalTokens} | 耗时: ${meta.durationMs || 0}ms</div>`;
}

/** 当前详情页的公司名称，用于对话上下文 */
let currentDetailCompanyName = '';

/** 当前详情页完整记录，用于大模型分析页面结构及应用修改 */
let currentDetailRecord = null;

const el = {
  companyName: document.getElementById('companyName'),
  btnQuery: document.getElementById('btnQuery'),
  btnSave: document.getElementById('btnSave'),
  btnHome: document.getElementById('btnHome'),
  btnTools: document.getElementById('btnTools'),
  navDetailLabel: document.getElementById('navDetailLabel'),
  chatPanel: document.getElementById('chatPanel'),
  btnChat: document.getElementById('btnChat'),
  btnCloseChat: document.getElementById('btnCloseChat'),
  historyPanel: document.getElementById('historyPanel'),
  btnHistory: document.getElementById('btnHistory'),
  btnCloseHistory: document.getElementById('btnCloseHistory'),
  historyContent: document.getElementById('historyContent'),
  chatInput: document.getElementById('chatInput'),
  chatSend: document.getElementById('chatSend'),
  chatMessages: document.getElementById('chatMessages'),
  btnValueStreamList: document.getElementById('btnValueStreamList'),
  loading: document.getElementById('loading'),
  error: document.getElementById('error'),
  result: document.getElementById('result'),
  basicInfoList: document.getElementById('basicInfoList'),
  bmcGrid: document.getElementById('bmcGrid'),
  bmcReview: document.getElementById('bmcReview'),
  valueStreamSection: document.getElementById('valueStreamSection'),
  valueStreamContent: document.getElementById('valueStreamContent'),
  metadataList: document.getElementById('metadataList'),
  homeView: document.getElementById('homeView'),
  toolsView: document.getElementById('toolsView'),
  btnToolsBack: document.getElementById('btnToolsBack'),
  detailView: document.getElementById('detailView'),
  problemDetailView: document.getElementById('problemDetailView'),
  problemDetailContent: document.getElementById('problemDetailContent'),
  problemDetailChatMessages: document.getElementById('problemDetailChatMessages'),
  problemDetailChatInput: document.getElementById('problemDetailChatInput'),
  problemDetailChatSend: document.getElementById('problemDetailChatSend'),
  btnProblemDetailBack: document.getElementById('btnProblemDetailBack'),
  problemDetailBody: document.getElementById('problemDetailBody'),
  btnProblemDetailRollback: document.getElementById('btnProblemDetailRollback'),
  btnProblemDetailHistory: document.getElementById('btnProblemDetailHistory'),
  problemDetailHistoryPanel: document.getElementById('problemDetailHistoryPanel'),
  btnCloseProblemDetailHistory: document.getElementById('btnCloseProblemDetailHistory'),
  problemDetailHistoryContent: document.getElementById('problemDetailHistoryContent'),
  digitalProblemInput: document.getElementById('digitalProblemInput'),
  btnParse: document.getElementById('btnParse'),
  parsePreview: document.getElementById('parsePreview'),
  parsePreviewContent: document.getElementById('parsePreviewContent'),
  btnStartFollow: document.getElementById('btnStartFollow'),
  problemFollowCount: document.getElementById('problemFollowCount'),
  problemFollowListContent: document.getElementById('problemFollowListContent'),
  taskTrackingView: document.getElementById('taskTrackingView'),
  btnTaskTrackingBack: document.getElementById('btnTaskTrackingBack'),
  taskTrackingTitle: document.getElementById('taskTrackingTitle'),
  taskTrackingList: document.getElementById('taskTrackingList'),
  taskTrackingDetail: document.getElementById('taskTrackingDetail'),
  btnTaskTrackingEnter: document.getElementById('btnTaskTrackingEnter'),
  savedListContent: document.getElementById('savedListContent'),
  detailResult: document.getElementById('detailResult'),
  detailContent: document.querySelector('.detail-content'),
  detailTitle: document.getElementById('detailTitle'),
  searchSuggestions: document.getElementById('searchSuggestions'),
  topNav: document.getElementById('topNav'),
  basicInfoJsonPanel: document.getElementById('basicInfoJsonPanel'),
  basicInfoJsonContent: document.getElementById('basicInfoJsonContent'),
  btnCloseBasicInfoJson: document.getElementById('btnCloseBasicInfoJson'),
  btnCopyBasicInfoJson: document.getElementById('btnCopyBasicInfoJson'),
  bmcJsonPanel: document.getElementById('bmcJsonPanel'),
  bmcJsonContent: document.getElementById('bmcJsonContent'),
  btnCloseBmcJson: document.getElementById('btnCloseBmcJson'),
  btnCopyBmcJson: document.getElementById('btnCopyBmcJson'),
  toolsChatMessages: document.getElementById('toolsChatMessages'),
  toolsChatInput: document.getElementById('toolsChatInput'),
  toolsChatSend: document.getElementById('toolsChatSend'),
  toolsList: document.getElementById('toolsList'),
  toolsDetail: document.getElementById('toolsDetail'),
  toolsDetailTitle: document.getElementById('toolsDetailTitle'),
  toolsDetailDesc: document.getElementById('toolsDetailDesc'),
  toolsDetailTimeline: document.getElementById('toolsDetailTimeline'),
  toolsDetailTree: document.getElementById('toolsDetailTree'),
};

let lastQueriedCompanyName = '';
let lastQueryResult = null;

/** 最近一次解析结果，用于「启动跟进」 */
let lastParsedResult = null;

/** 当前问题详情页展示的跟进项 */
let currentProblemDetailItem = null;

/** 修改意图追问状态：当用户修改意图不明确时，记录需合并的用户消息起始索引，待用户补充后合并再提炼 */
let lastModificationClarification = null;

/** 当前正在浏览的大节段（可点击切换，用于回看需求理解等） */
let problemDetailViewingMajorStage = 0;

/** IT 策略规划阶段当前选中的任务索引：0=全局架构设计 1=环节专项设计 2=链条串联与闭环 */
let itStrategyPlanViewingSubstep = 0;

/** 问题详情页已确认的客户基本信息（解析后点击确认） */
let problemDetailConfirmedBasicInfo = null;

/** 当前问题详情页的聊天记录（用于持久化） */
let problemDetailChatMessages = [];

/** 聊天历史，用于 DeepSeek API 的 messages 上下文 */
let chatHistory = [];

/** 当前未闭环的修改任务：{ parsed, block }，确认或放弃后清空 */
let currentModificationTask = null;

/**
 * 调试：检查「查询价值流列表」按钮及其父元素的状态
 */
function debugValueStreamButton() {
  const btn = document.getElementById('btnValueStreamList');
  const section = document.querySelector('.value-stream-actions');
  const result = document.getElementById('result');

  const info = {
    'btnValueStreamList 元素': btn ? '存在' : '不存在',
    'value-stream-actions 区块': section ? '存在' : '不存在',
    'result (main)': result ? '存在' : '不存在',
  };
  if (btn) {
    const rect = btn.getBoundingClientRect();
    const style = window.getComputedStyle(btn);
    info['按钮 display'] = style.display;
    info['按钮 visibility'] = style.visibility;
    info['按钮 opacity'] = style.opacity;
    info['按钮 width/height'] = `${rect.width.toFixed(0)}x${rect.height.toFixed(0)}`;
    info['按钮在视口内'] = rect.width > 0 && rect.height > 0;
    info['按钮 offsetParent'] = btn.offsetParent ? btn.offsetParent.tagName : 'null';
  }
  if (section) {
    const rect = section.getBoundingClientRect();
    const style = window.getComputedStyle(section);
    info['区块 display'] = style.display;
    info['区块 visibility'] = style.visibility;
    info['区块 width/height'] = `${rect.width.toFixed(0)}x${rect.height.toFixed(0)}`;
  }
  if (result) {
    info['result.hidden'] = result.hidden;
    info['result display'] = window.getComputedStyle(result).display;
  }
  console.log('[价值流按钮调试]', info);
  return info;
}

const BASIC_INFO_FIELDS = [
  { key: 'company_name', label: '企业名称' },
  { key: 'credit_code', label: '统一社会信用代码' },
  { key: 'legal_representative', label: '法定代表人' },
  { key: 'established_date', label: '成立日期' },
  { key: 'registered_capital', label: '注册资本' },
  { key: 'is_listed', label: '是否上市' },
  { key: 'listing_location', label: '上市地点' },
  { key: 'business_scope', label: '经营范围' },
  { key: 'core_qualifications', label: '核心资质' },
  { key: 'official_website', label: '官网' },
];

const BMC_FIELDS = [
  { key: 'customer_segments', label: '客户细分' },
  { key: 'value_propositions', label: '价值主张' },
  { key: 'channels', label: '渠道通路' },
  { key: 'customer_relationships', label: '客户关系' },
  { key: 'revenue_streams', label: '收入来源' },
  { key: 'key_resources', label: '核心资源' },
  { key: 'key_activities', label: '关键业务' },
  { key: 'key_partnerships', label: '重要合作' },
  { key: 'cost_structure', label: '成本结构' },
];

/** 字段标签到数据路径的映射，用于大模型返回的 position 匹配并应用修改 */
const LABEL_TO_PATH = (() => {
  const m = new Map();
  BASIC_INFO_FIELDS.forEach((f) => m.set(f.label, { section: 'basicInfo', key: f.key }));
  BMC_FIELDS.forEach((f) => m.set(f.label, { section: 'bmc', key: f.key }));
  m.set('综合评述', { section: 'bmc', key: 'comprehensive_review' });
  return m;
})();

function buildPageStructureForLLM(record) {
  if (!record) return '';
  const basicInfo = record.basicInfo || {};
  const bmc = record.bmc || {};
  const metadata = record.metadata || {};
  const valueStreams = record.valueStreams || [];
  const vsLines = [];
  if (valueStreams.length > 0) {
    valueStreams.forEach((vs, i) => {
      const vsName = formatValue(vs.name ?? vs.title ?? vs.value_stream_name) || `价值流 ${i + 1}`;
      vsLines.push(`  - [${i}] 价值流名称: ${vsName}`);
      const { stages } = parseValueStreamGraph(vs);
      stages.forEach((stage, si) => {
        vsLines.push(`      阶段: ${stage.name}`);
        (stage.steps || []).forEach((step, ji) => {
          vsLines.push(`        节点: ${step.name}`);
        });
      });
    });
  } else {
    vsLines.push('  (暂无)');
  }
  const lines = [
    '=== 当前页面详情结构 ===',
    '',
    '【基本信息】',
    ...BASIC_INFO_FIELDS.map((f) => `  - ${f.label}: ${formatValue(basicInfo[f.key]) || '—'}`),
    '',
    '【商业画布 BMC】',
    ...BMC_FIELDS.map((f) => `  - ${f.label}: ${formatValue(bmc[f.key]) || '—'}`),
    `  - 综合评述: ${formatValue(bmc.comprehensive_review) || '—'}`,
    '',
    '【档案元数据】',
    `  - 档案 ID: ${formatValue(metadata.analysis_id) || '—'}`,
    `  - 创建时间: ${formatValue(metadata.created_date) || '—'}`,
    `  - 更新时间: ${formatValue(metadata.updated_date) || '—'}`,
    '',
    '【价值流列表】(含阶段与节点名称)',
    ...vsLines,
  ];
  return lines.join('\n');
}

function showLoading(show) {
  if (el.loading) el.loading.hidden = !show;
  if (el.btnQuery) el.btnQuery.disabled = show;
}

function showError(message) {
  if (!el.error) return;
  el.error.textContent = message;
  el.error.hidden = !message;
}

function showResult(show) {
  if (!el.result) return;
  el.result.hidden = !show;
  if (el.valueStreamSection) el.valueStreamSection.hidden = true;
  if (show) debugValueStreamButton?.();
}

/** 工具知识：读取本地存储的工具知识时间线，返回 { [toolId]: Array<{ content, createdAt }> } */
function getToolKnowledgeState() {
  try {
    const raw = localStorage.getItem(TOOL_KNOWLEDGE_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function saveToolKnowledgeState(state) {
  try {
    localStorage.setItem(TOOL_KNOWLEDGE_STORAGE_KEY, JSON.stringify(state || {}));
  } catch {
    // ignore
  }
}

/** 工具知识：保存左侧话题聊天记录（HTML 结构）到本地 */
function saveToolsChatMessagesToStorage() {
  try {
    const container = el.toolsChatMessages;
    if (!container) return;
    localStorage.setItem(TOOL_KNOWLEDGE_CHAT_STORAGE_KEY, container.innerHTML || '');
  } catch {
    // ignore
  }
}

/** 工具知识：从本地恢复左侧话题聊天记录 */
function restoreToolsChatMessagesFromStorage() {
  try {
    const container = el.toolsChatMessages;
    if (!container) return;
    const raw = localStorage.getItem(TOOL_KNOWLEDGE_CHAT_STORAGE_KEY);
    if (!raw) return;
    container.innerHTML = raw;
  } catch {
    // ignore
  }
}

function appendToolKnowledge(toolId, content, contentJson, createdAt) {
  if (!toolId || !content) return;
  const state = getToolKnowledgeState();
  const list = Array.isArray(state[toolId]) ? state[toolId] : [];
  const entry = { content, createdAt: createdAt && typeof createdAt === 'string' ? createdAt : new Date().toISOString() };
  if (contentJson && typeof contentJson === 'object') {
    entry.contentJson = contentJson;
  }
  list.push(entry);
  state[toolId] = list;
  saveToolKnowledgeState(state);
}

function slugifyTopicName(name) {
  const base = String(name || '')
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9\-]/g, '')
    .slice(0, 50);
  return base || `topic_${Date.now()}`;
}

/** 将讨论内容整理成可存入知识库的话题说明（简要总结/提炼） */
async function summarizeToolDiscussionContent(text) {
  const systemPrompt = `你是一个知识库整理助手。现在有一段关于某个工具或话题的讨论内容，请帮我将这段内容整理成一条适合放入「知识库话题时间线」的精炼说明：

要求：
1. 使用简洁的中文表述，一到三句话即可；
2. 不要重复用户的语气词，只保留对工具/话题有价值的信息；
3. 可以是经验总结、注意事项、最佳实践中的一条；
4. 只返回整理后的内容本身，不要有额外说明或 Markdown 代码块。`;

  const { content, usage, model, durationMs } = await fetchDeepSeekChat([
    { role: 'system', content: systemPrompt },
    { role: 'user', content: text },
  ]);
  const summary = (content || '').trim();
  return { summary, _llmMeta: { usage, model, durationMs } };
}

/** 讨论意图：用当前话题所有时间线节点（内容+JSON）与用户沟通内容作为上下文，发往大模型，返回回复 */
async function fetchToolDiscussionReply(toolId, userContent) {
  const state = getToolKnowledgeState();
  const entries = Array.isArray(state[toolId]) ? state[toolId] : [];
  const contextParts = entries.map((e, i) => {
    const text = (e.content || '').trim();
    const jsonStr =
      e.contentJson && typeof e.contentJson === 'object'
        ? JSON.stringify(e.contentJson, null, 2)
        : '';
    return `[节点 ${i + 1}]\n${text}${jsonStr ? '\n' + jsonStr : ''}`;
  });
  const timelineContext =
    contextParts.length > 0
      ? contextParts.join('\n\n---\n\n')
      : '（该话题暂无时间线记录）';

  const systemPrompt = `你是一位知识库讨论助手。用户正在某个「工具/话题」下进行讨论。请根据【该话题时间线知识】和【用户本次沟通内容】，给出专业、简洁的回复：可以是经验总结、解答疑问、补充建议或延展讨论。回复使用中文，直接返回正文，不要用 Markdown 代码块包裹。`;

  const userMessage = `【该话题时间线知识】\n${timelineContext}\n\n【用户本次沟通内容】\n${(userContent || '').trim()}`;

  const { content, usage, model, durationMs } = await fetchDeepSeekChat([
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userMessage },
  ]);
  const reply = (content || '').trim();
  return { reply, _llmMeta: { usage, model, durationMs } };
}

/** 修改意图：用意图卡片内容+话题时间线作为上下文，让大模型返回需要更新的时间线节点（时间戳+修改后内容） */
async function fetchToolModificationUpdates(toolId, userContent) {
  const state = getToolKnowledgeState();
  const entries = Array.isArray(state[toolId]) ? state[toolId] : [];
  const contextParts = entries.map((e, i) => {
    const text = (e.content || '').trim();
    const jsonStr =
      e.contentJson && typeof e.contentJson === 'object'
        ? JSON.stringify(e.contentJson, null, 2)
        : '';
    return `[节点 ${i + 1}]\n时间戳: ${e.createdAt || ''}\n${text}${jsonStr ? '\n' + jsonStr : ''}`;
  });
  const timelineContext =
    contextParts.length > 0
      ? contextParts.join('\n\n---\n\n')
      : '（该话题暂无时间线记录）';

  const systemPrompt = `你是一位知识库修改助手。用户希望根据【沟通内容】更新【该话题时间线】中的某些节点。

任务描述：请按照沟通内容信息更新上下文中的内容，并返回需要更新的时间线内容块及时间线时间戳。

【重要】你必须严格返回一个 JSON 对象，不要包含任何其他文字或 Markdown 代码块。格式如下：
{
  "updates": [
    {
      "createdAt": "上下文里该节点的完整时间戳字符串（必须与上方「时间戳:」后的值完全一致）",
      "content": "修改后的正文内容",
      "contentJson": null 或 结构化对象（若该节点有 JSON 且需修改则填写，否则 null）
    }
  ]
}

若沟通内容不涉及任何具体修改或无法匹配到节点，可返回 { "updates": [] }。`;

  const userMessage = `【该话题时间线】\n${timelineContext}\n\n【沟通内容】\n${(userContent || '').trim()}`;

  const { content, usage, model, durationMs } = await fetchDeepSeekChat([
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userMessage },
  ]);
  const jsonMatch = (content || '').match(/\{[\s\S]*\}/);
  const jsonStr = jsonMatch ? jsonMatch[0] : content || '{}';
  const parsed = JSON.parse(jsonStr);
  const updates = Array.isArray(parsed.updates) ? parsed.updates : [];
  return { updates, _llmMeta: { usage, model, durationMs } };
}

/** 用大模型返回的 updates 覆盖对应时间线节点的 content/contentJson */
function applyToolKnowledgeUpdates(toolId, updates) {
  if (!toolId || !Array.isArray(updates) || updates.length === 0) return;
  const state = getToolKnowledgeState();
  const list = Array.isArray(state[toolId]) ? state[toolId] : [];
  for (const u of updates) {
    const createdAt = u && typeof u.createdAt === 'string' ? u.createdAt.trim() : '';
    if (!createdAt) continue;
    const entry = list.find((e) => String(e.createdAt) === createdAt);
    if (entry) {
      if (typeof u.content === 'string') entry.content = u.content;
      if (u.contentJson !== undefined) entry.contentJson = u.contentJson && typeof u.contentJson === 'object' ? u.contentJson : null;
    }
  }
  state[toolId] = list;
  saveToolKnowledgeState(state);
}

function renderToolsTopicDetail(toolId, stateOverride) {
  const detailWrap = el.toolsDetail;
  const titleEl = el.toolsDetailTitle;
  const descEl = el.toolsDetailDesc;
  const timelineEl = el.toolsDetailTimeline;
  if (!detailWrap || !titleEl || !descEl || !timelineEl) return;
  const state = stateOverride || getToolKnowledgeState();
  const tool = TOOL_KNOWLEDGE_ITEMS.find((t) => String(t.id) === String(toolId));
  if (!tool) {
    titleEl.textContent = '请选择右侧话题';
    descEl.textContent = '';
    timelineEl.innerHTML =
      '<p class="tools-timeline-empty">尚未选择话题。请从左侧列表中选择一个话题查看时间线。</p>';
    return;
  }

  titleEl.textContent = tool.name || '未命名话题';
  descEl.textContent = tool.description || '';

  const entries = Array.isArray(state[tool.id]) ? state[tool.id] : [];
  if (!entries.length) {
    timelineEl.innerHTML =
      '<p class="tools-timeline-empty">该话题暂未记录任何知识，可以通过左侧「话题讨论」添加。</p>';
    return;
  }
  const timelineHtml = `<ul class="tools-timeline">${entries
    .map((e, index) => {
      const time = formatChatTime ? formatChatTime(e.createdAt) : e.createdAt;
      const contentHtml = escapeHtml(e.content || '');
      const hasJson = e && e.contentJson && typeof e.contentJson === 'object';
      const jsonStr = hasJson ? JSON.stringify(e.contentJson, null, 2) : '';
      const jsonHtml = hasJson ? escapeHtml(jsonStr) : '';
      const tabsHtml = hasJson
        ? `<div class="tools-timeline-content-tabs">
      <button type="button" class="tools-timeline-tab tools-timeline-tab-active" data-tab="text">内容</button>
      <button type="button" class="tools-timeline-tab" data-tab="json">JSON</button>
    </div>`
        : '';
      const panelsHtml = hasJson
        ? `<div class="tools-timeline-panel tools-timeline-panel-text">${contentHtml}</div><pre class="tools-timeline-panel tools-timeline-panel-json" hidden>${jsonHtml}</pre>`
        : `<div class="tools-timeline-panel tools-timeline-panel-text">${contentHtml}</div>`;
      return `<li class="tools-timeline-item" data-entry-index="${index}"><div class="tools-timeline-time"><span class="tools-timeline-time-text">${escapeHtml(
        time || ''
      )}</span><button type="button" class="tools-timeline-delete" data-tool-id="${
        tool.id
      }" data-entry-index="${index}" aria-label="删除时间线节点"><span class="tools-timeline-delete-icon">🗑</span></button></div><div class="tools-timeline-content">${tabsHtml}${panelsHtml}</div></li>`;
    })
    .join('')}</ul>`;
  timelineEl.innerHTML = timelineHtml;
}

function renderToolsKnowledge() {
  const listEl = el.toolsList;
  const chatEl = el.toolsChatMessages;
  if (!listEl) return;
  const state = getToolKnowledgeState();
  if (!currentToolKnowledgeId && TOOL_KNOWLEDGE_ITEMS[0]) {
    currentToolKnowledgeId = TOOL_KNOWLEDGE_ITEMS[0].id;
  }

  // 渲染左侧话题列表
  listEl.innerHTML = TOOL_KNOWLEDGE_ITEMS.map((tool) => {
    const isActive = String(tool.id) === String(currentToolKnowledgeId);
    const activeCls = isActive ? ' tools-topic-item-active' : '';
    return `<button type="button" class="tools-topic-item${activeCls}" data-tool-id="${tool.id}">
  <div class="tools-topic-item-name">${escapeHtml(tool.name || '')}</div>
  <div class="tools-topic-item-desc">${escapeHtml(tool.description || '')}</div>
</button>`;
  }).join('');

  // 渲染右侧详情（时间线视图）
  if (currentToolKnowledgeId) {
    renderToolsTopicDetail(currentToolKnowledgeId, state);
  } else {
    renderToolsTopicDetail(null, state);
  }

  // 初始聊天区域为空，仅保留之前记录
  if (chatEl && !chatEl.dataset.initialized) {
    chatEl.dataset.initialized = 'true';
    restoreToolsChatMessagesFromStorage();
  }
}

function formatValue(value) {
  if (value == null || value === '') return '';
  if (typeof value === 'boolean') return value ? '是' : '否';
  return String(value);
}

function renderBasicInfo(data) {
  if (!data || !el.basicInfoList) return;
  el.basicInfoList.innerHTML = BASIC_INFO_FIELDS.map(({ key, label }) => {
    const raw = data[key];
    const value = formatValue(raw);
    if (key === 'official_website' && raw) {
      return `<dt>${label}</dt><dd><a href="${encodeURI(raw)}" target="_blank" rel="noopener">${escapeHtml(value)}</a></dd>`;
    }
    return `<dt>${label}</dt><dd>${escapeHtml(value) || '—'}</dd>`;
  }).join('');
}

function escapeHtml(str) {
  if (str == null || str === '') return '';
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

/** 将 Markdown 文本渲染为安全 HTML，用于聊天内容块 */
function renderMarkdown(str) {
  if (str == null || str === '') return '';
  const text = String(str);
  if (typeof marked === 'undefined') return escapeHtml(text).replace(/\n/g, '<br>');
  const html = marked.parse(text, { breaks: true });
  if (typeof DOMPurify !== 'undefined') {
    return DOMPurify.sanitize(html, {
      ALLOWED_TAGS: ['p', 'br', 'strong', 'b', 'em', 'i', 'code', 'pre', 'a', 'ul', 'ol', 'li', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'blockquote', 'hr', 'span', 'div'],
      ALLOWED_ATTR: ['href', 'target', 'rel'],
    });
  }
  return html;
}

/** 从大模型回复中解析结构化修改建议，返回 { position, modification, reason, positionKey, newValue } 或 null */
function parseModificationResponse(text) {
  if (!text || typeof text !== 'string') return null;
  const jsonMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/) || text.match(/\{[\s\S]*\}/);
  const jsonStr = jsonMatch ? (jsonMatch[1] || jsonMatch[0]).trim() : text;
  try {
    const obj = JSON.parse(jsonStr);
    if (obj && (obj.position || obj.modification || obj.reason)) {
      const parsed = {
        position: obj.position || '—',
        modification: obj.modification || obj.newValue || '—',
        reason: obj.reason || '—',
        positionKey: obj.positionKey || obj.position,
        newValue: obj.newValue,
      };
      if (obj.isValueStream) {
        parsed.isValueStream = true;
        parsed.operation = (obj.operation || 'update').toLowerCase();
        parsed.valueStreamName = obj.valueStreamName || obj.value_stream_name || '';
        parsed.nodeName = obj.nodeName || obj.node_name || '';
        parsed.insertAfterStepName = obj.insertAfterStepName || obj.insert_after_step_name || '';
        parsed.valueStreamIndex = obj.valueStreamIndex != null ? obj.valueStreamIndex : obj.value_stream_index;
      }
      return parsed;
    }
  } catch (_) {}
  const posMatch = text.match(/修改位置[：:]\s*([^\n]+)/);
  const modMatch = text.match(/修改意见[：:]\s*([^\n]+)/);
  const reasonMatch = text.match(/修改原因[：:]\s*([^\n]+)/);
  if (posMatch || modMatch || reasonMatch) {
    return {
      position: (posMatch && posMatch[1].trim()) || '—',
      modification: (modMatch && modMatch[1].trim()) || '—',
      reason: (reasonMatch && reasonMatch[1].trim()) || '—',
      positionKey: (posMatch && posMatch[1].trim()) || null,
      newValue: null,
    };
  }
  return null;
}

/** 判断两个修改位置是否相同（同一修改目标） */
function isSameModificationPosition(pos1, pos2) {
  if (!pos1 || !pos2) return false;
  const p1 = typeof pos1 === 'object' ? pos1 : null;
  const p2 = typeof pos2 === 'object' ? pos2 : null;
  if (p1?.isValueStream && p2?.isValueStream) {
    const n1 = (p1.valueStreamName || '').trim();
    const n2 = (p2.valueStreamName || '').trim();
    const node1 = (p1.nodeName || '').trim();
    const node2 = (p2.nodeName || '').trim();
    return n1 === n2 && node1 === node2;
  }
  const s1 = typeof pos1 === 'object' ? (pos1.positionKey || pos1.position) : pos1;
  const s2 = typeof pos2 === 'object' ? (pos2.positionKey || pos2.position) : pos2;
  const path1 = getPathForPosition(s1);
  const path2 = getPathForPosition(s2);
  if (!path1 || !path2) return String(s1).trim() === String(s2).trim();
  return path1.section === path2.section && path1.key === path2.key;
}

/** 根据 position 获取 record 中对应的路径 { section, key } */
function getPathForPosition(pos) {
  const p = String(pos).trim();
  const path = LABEL_TO_PATH.get(p);
  if (path) return path;
  for (const [label, path] of LABEL_TO_PATH) {
    if (p.includes(label) || label.includes(p)) return path;
  }
  return null;
}

/** 获取修改前的当前值 */
function getCurrentValueForPosition(record, parsed) {
  if (!record || !parsed) return '';
  if (parsed.isValueStream) {
    const vsList = record.valueStreams || [];
    const vsName = (parsed.valueStreamName || '').trim();
    const nodeName = (parsed.nodeName || '').trim();
    for (const vs of vsList) {
      const name = formatValue(vs.name ?? vs.title ?? vs.value_stream_name) || '';
      if (!vsName || name === vsName) {
        const { stages } = parseValueStreamGraph(vs);
        for (const stage of stages) {
          if (stage.name === nodeName) return stage.name;
          for (const step of stage.steps || []) {
            if (step.name === nodeName) return step.desc || step.name || '';
          }
        }
      }
    }
    return '';
  }
  const path = getPathForPosition(parsed.positionKey || parsed.position);
  if (!path) return '';
  const section = record[path.section];
  if (!section || !(path.key in section)) return '';
  return formatValue(section[path.key]) || '';
}

/** 根据 position 匹配并应用修改到 record */
function applyModification(record, parsed) {
  if (!record || !parsed) return false;
  const newVal = parsed.newValue != null ? String(parsed.newValue) : parsed.modification;

  if (parsed.isValueStream) {
    const vsList = record.valueStreams || [];
    const vsName = (parsed.valueStreamName || '').trim();
    const nodeName = (parsed.nodeName || '').trim();
    const vsIndex = parsed.valueStreamIndex;
    const op = (parsed.operation || 'update').toLowerCase();

    for (let vi = 0; vi < vsList.length; vi++) {
      const vs = vsList[vi];
      const name = formatValue(vs.name ?? vs.title ?? vs.value_stream_name) || '';
      const nameMatch = !vsName || name === vsName || name.includes(vsName) || vsName.includes(name);
      if (!nameMatch || (vsIndex != null && vi !== vsIndex)) continue;

      let rawStages = vs.stages ?? vs.phases ?? vs.nodes ?? vs.value_stream?.stages ?? vs.data?.stages;
      if (!Array.isArray(rawStages)) rawStages = vs.stages = [];
      if (!vs.stages && (vs.phases || vs.nodes)) rawStages = vs.phases ?? vs.nodes;

      const getStageNameForMatch = (s) => {
        const raw = s.name ?? s.title ?? s.stage_name ?? s.phase_name ?? s.label ?? s.node_name ?? '';
        return extractPureStageName(raw) || formatValue(raw);
      };

      if (op === 'addstage') {
        const newStage = { name: newVal, steps: [] };
        if (nodeName) {
          const insertIdx = rawStages.findIndex((s) => s && getStageNameForMatch(s) === nodeName);
          if (insertIdx >= 0) rawStages.splice(insertIdx + 1, 0, newStage);
          else rawStages.push(newStage);
        } else {
          rawStages.push(newStage);
        }
        return true;
      }

      if (op === 'addstep') {
        const insertAfterStep = (parsed.insertAfterStepName || parsed.insert_after_step_name || '').trim();
        const STEP_KEYS = ['steps', 'phases', 'items', 'nodes', 'children'];
        const getStepsArray = (stage) => {
          for (const k of STEP_KEYS) {
            const arr = stage[k];
            if (Array.isArray(arr)) return { arr, key: k };
          }
          stage.steps = Array.isArray(stage.steps) ? stage.steps : [];
          return { arr: stage.steps, key: 'steps' };
        };
        const getStepNameForMatch = (st) => {
          const raw = formatValue(st.name ?? st.title ?? st.step_name ?? st.phase_name ?? st.label ?? st.node_name ?? '');
          const m = raw.match(/^(.+?)\s*\([^)]*\)$/);
          return m ? m[1].trim() : raw;
        };
        for (const s of rawStages) {
          if (!s) continue;
          const stageName = getStageNameForMatch(s);
          if (stageName !== nodeName && !stageName.includes(nodeName) && !nodeName.includes(stageName)) continue;
          const { arr: rawSteps } = getStepsArray(s);
          const parts = newVal.split(/\n/);
          const stepName = parts[0]?.trim() || newVal;
          const stepDesc = parts.slice(1).join('\n').trim() || '';
          const newStep = {
            name: stepName,
            step_name: stepName,
            title: stepName,
            description: stepDesc,
            desc: stepDesc,
            content: stepDesc,
          };
          if (insertAfterStep) {
            const idx = rawSteps.findIndex((st) => st && getStepNameForMatch(st) === insertAfterStep);
            if (idx >= 0) rawSteps.splice(idx + 1, 0, newStep);
            else rawSteps.push(newStep);
          } else {
            rawSteps.push(newStep);
          }
          return true;
        }
        return false;
      }

      for (const s of rawStages) {
        if (!s) continue;
        const stageName = getStageNameForMatch(s);
        if (stageName === nodeName) {
          s.name = s.title = s.stage_name = s.phase_name = s.label = s.node_name = newVal;
          return true;
        }
        const rawSteps = s.steps ?? s.phases ?? s.items ?? s.nodes ?? s.children ?? [];
        if (!Array.isArray(rawSteps)) continue;
        for (const st of rawSteps) {
          if (!st) continue;
          const stepName = formatValue(st.name ?? st.title ?? st.step_name ?? st.phase_name ?? st.label ?? st.node_name ?? '');
          if (stepName === nodeName) {
            if (st.description != null || st.desc != null || st.content != null) {
              st.description = st.desc = st.content = newVal;
            } else {
              st.name = st.title = st.step_name = st.phase_name = st.label = st.node_name = newVal;
            }
            return true;
          }
        }
      }
    }
    return false;
  }

  const pos = String(parsed.positionKey || parsed.position).trim();
  const path = getPathForPosition(pos);
  if (path) {
    const section = record[path.section];
    if (section && path.key in section) {
      section[path.key] = newVal;
      return true;
    }
  }
  return false;
}

/** 根据修改位置或 parsed 找到详情页中对应的 DOM 元素 */
function findModificationTarget(positionOrParsed) {
  if (!el.detailResult) return null;
  const parsed = positionOrParsed && typeof positionOrParsed === 'object' ? positionOrParsed : null;
  const position = parsed ? (parsed.positionKey || parsed.position) : String(positionOrParsed || '').trim();

  if (parsed?.isValueStream) {
    const vsName = (parsed.valueStreamName || '').trim();
    const nodeName = (parsed.nodeName || '').trim();
    const vsIndex = parsed.valueStreamIndex;
    const cards = el.detailResult.querySelectorAll('.vs-card');
    let card = null;
    for (const c of cards) {
      const cName = (c.dataset.vsName || '').trim();
      const cIdx = parseInt(c.dataset.vsIndex ?? c.dataset.index, 10);
      if ((vsName && cName === vsName) || (vsIndex != null && cIdx === vsIndex)) {
        card = c;
        break;
      }
    }
    if (!card) return null;
    if (!nodeName) return card;
    const body = card.querySelector('.vs-card-body');
    const viewPanel = body?.querySelector('.vs-tab-panel-view');
    if (!viewPanel || viewPanel.dataset.rendered !== 'true') return card;
    const stageEl = viewPanel.querySelector(`[data-vs-stage-name="${nodeName}"]`);
    if (stageEl) return stageEl;
    const stepEl = viewPanel.querySelector(`[data-vs-step-name="${nodeName}"]`);
    if (stepEl) return stepEl;
    const allNames = viewPanel.querySelectorAll('[data-vs-stage-name], [data-vs-step-name]');
    for (const n of allNames) {
      const name = n.dataset.vsStageName || n.dataset.vsStepName || '';
      if (name === nodeName || name.includes(nodeName) || nodeName.includes(name)) return n;
    }
    return card;
  }

  if (!position) return null;
  const direct = el.detailResult.querySelector(`[data-modify-target="${position}"]`);
  if (direct) return direct;
  for (const [label] of LABEL_TO_PATH) {
    if (position.includes(label) || position === label) {
      const elx = el.detailResult.querySelector(`[data-modify-target="${label}"]`);
      if (elx) return elx;
    }
  }
  return null;
}

/** 清除当前高亮 */
function clearModificationHighlight() {
  el.detailResult?.querySelectorAll('.modify-target-highlight').forEach((el) => el.classList.remove('modify-target-highlight'));
}

/** 滚动到目标元素并居中，添加红色闪动高亮。价值流修改时会先展开卡片并渲染 view */
function scrollToTargetAndHighlight(positionOrParsed) {
  clearModificationHighlight();
  const parsed = positionOrParsed && typeof positionOrParsed === 'object' ? positionOrParsed : { position: positionOrParsed };
  let target = findModificationTarget(positionOrParsed);
  if (!target || !el.detailContent) return;

  if (parsed.isValueStream) {
    const card = target.closest('.vs-card') || (target.classList.contains('vs-card') ? target : null);
    if (card) {
      const header = card.querySelector('.vs-card-header');
      const body = card.querySelector('.vs-card-body');
      if (header && body && body.hidden) {
        header.click();
        header.setAttribute('aria-expanded', 'true');
        body.hidden = false;
        const viewPanel = body.querySelector('.vs-tab-panel-view');
        if (viewPanel && viewPanel.dataset.rendered !== 'true') {
          const idx = parseInt(card.dataset.index ?? card.dataset.vsIndex, 10);
          const item = (currentDetailRecord?.valueStreams || [])[idx];
          if (item) {
            viewPanel.innerHTML = renderValueStreamViewHTML(item);
            viewPanel.dataset.rendered = 'true';
            target = findModificationTarget(positionOrParsed);
          }
        }
      }
    }
  }

  if (target) {
    target.classList.add('modify-target-highlight');
    target.scrollIntoView({ block: 'center', behavior: 'smooth', inline: 'nearest' });
  }
}

function renderBMC(data) {
  if (!data) return;
  el.bmcGrid.innerHTML = BMC_FIELDS.map(({ key, label }) => {
    const content = formatValue(data[key]);
    return `
      <div class="bmc-block">
        <h4>${escapeHtml(label)}</h4>
        <div class="content">${escapeHtml(content)}</div>
      </div>
    `;
  }).join('');
  const review = formatValue(data.comprehensive_review);
  el.bmcReview.innerHTML = `
    <h4>综合评述</h4>
    <div class="content">${escapeHtml(review)}</div>
  `;
}

/** 从可能包含「阶段:xxx 节点:xxx」的字符串中提取纯阶段名称 */
function extractPureStageName(raw) {
  const s = formatValue(raw);
  if (!s) return s;
  if (s.includes('阶段:') && s.includes('节点:')) {
    const m = s.match(/阶段:\s*([^节点]+?)(?:\s*节点:|$)/);
    if (m) return m[1].trim();
  }
  if (s.startsWith('阶段:')) {
    const m = s.match(/阶段:\s*(.+?)(?:\s*节点:|$)/);
    if (m) return m[1].trim();
  }
  return s;
}

/** 从可能包含「名称 (描述)」或「名称（描述）」的字符串中分离名称与描述，支持全角/半角括号 */
function extractStepNameAndDesc(stepObj) {
  const nameRaw = stepObj.name ?? stepObj.title ?? stepObj.step_name ?? stepObj.phase_name ?? stepObj.label ?? stepObj.node_name ?? '';
  const descRaw = stepObj.description ?? stepObj.desc ?? stepObj.content;
  const name = formatValue(nameRaw);
  const desc = formatValue(descRaw);
  if (desc) return { name, desc };
  const m = name && name.match(/^(.+?)\s*[（(]([^）)]+)[）)]\s*$/);
  if (m) return { name: m[1].trim(), desc: m[2].trim() };
  return { name, desc: '' };
}

/**
 * 从价值流 JSON 解析出阶段(stages)和环节(steps)结构，用于图形渲染
 * 兼容多种字段名与嵌套结构。阶段标题仅显示阶段名，环节内容显示在环节块中。
 */
function parseValueStreamGraph(data) {
  if (!data || typeof data !== 'object') return { stages: [] };
  let rawStages = data.stages ?? data.phases ?? data.nodes ?? data.value_stream?.stages ?? data.data?.stages ?? [];
  if (!Array.isArray(rawStages) || rawStages.length === 0) {
    rawStages = [];
  }
  const list = rawStages;
  return {
    stages: list.map((s, i) => {
      if (!s) return { name: `阶段${i + 1}`, steps: [] };
      if (typeof s === 'string') return { name: extractPureStageName(s), steps: [] };
      const rawSteps = s.steps ?? s.tasks ?? s.phases ?? s.items ?? s.nodes ?? s.children ?? [];
      const steps = Array.isArray(rawSteps) ? rawSteps : [];
      const rawStageName = s.name ?? s.title ?? s.stage_name ?? s.phase_name ?? s.label ?? s.node_name ?? s.node_label ?? `阶段${i + 1}`;
      const stageName = extractPureStageName(rawStageName);
      return {
        name: stageName,
        steps: steps.map((st, j) => {
          if (typeof st === 'string') {
            const { name: stepName, desc: stepDesc } = extractStepNameAndDesc({ name: st });
            return { name: stepName || st, desc: stepDesc, role: '', duration: '', itStatusLabel: '', painPoint: '' };
          }
          const { name: stepName, desc: stepDesc } = extractStepNameAndDesc(st);
          const role = formatValue(st.role ?? st.executor ?? st.执行角色) || '';
          const duration = formatValue(st.duration ?? st.lead_time ?? st.预估耗时 ?? st.提前期) || '';
          const itStatus = st.itStatus ?? st.it_status;
          const itStatusLabel = itStatus && typeof itStatus === 'object'
            ? (itStatus.type === '手工' ? `手工-${itStatus.detail || '—'}` : itStatus.type === '系统' ? `系统-${itStatus.detail || '—'}` : '')
            : (typeof itStatus === 'string' ? itStatus : '');
          const rawPainPoint = formatValue(st.painPoint ?? st.pain_point) || '';
          const trimmed = rawPainPoint.trim();
          const isNoPainPoint = /^(无明显痛点|无痛点|暂无|无)$/i.test(trimmed) || /^无明显痛点/i.test(trimmed);
          const painPoint = isNoPainPoint ? '' : rawPainPoint;
          return {
            name: stepName || `环节${j + 1}`,
            desc: stepDesc,
            role,
            duration,
            itStatusLabel: itStatusLabel || '',
            painPoint,
          };
        }),
      };
    }),
  };
}

/**
 * 渲染价值流图形视图 HTML：阶段→阶段（箭头），阶段内 环节→环节（箭头）
 */
function renderValueStreamViewHTML(item) {
  const { stages } = parseValueStreamGraph(item);
  if (stages.length === 0) {
    return '<p class="vs-view-placeholder">暂无阶段数据，无法渲染图形</p>';
  }

  const stagesHtml = stages.map((stage, si) => {
    const stepsHtml = stage.steps.length === 0
      ? '<div class="vs-step-node vs-step-empty">—</div>'
      : stage.steps.map((step, ji) => {
          const roleDurationHtml = (step.role || step.duration)
            ? `<div class="vs-step-meta">
                ${step.role ? `<span class="vs-step-meta-chip vs-step-meta-role">${escapeHtml(step.role)}</span>` : ''}
                ${step.duration ? `<span class="vs-step-meta-chip vs-step-meta-duration">${escapeHtml(step.duration)}</span>` : ''}
              </div>`
            : '';
          const itStatusHtml = step.itStatusLabel
            ? `<div class="vs-step-meta"><span class="vs-step-meta-chip vs-step-meta-it-status">IT现状：${escapeHtml(step.itStatusLabel)}</span></div>`
            : '';
          const painPointHtml = step.painPoint
            ? `<div class="vs-step-meta"><div class="vs-step-pain-point-card">${escapeHtml(step.painPoint)}</div></div>`
            : '';
          return `
          <div class="vs-step-node" data-vs-step-name="${escapeHtml(step.name)}">
            <span class="vs-step-name">${escapeHtml(step.name)}</span>
            ${step.desc ? `<span class="vs-step-desc">${escapeHtml(step.desc)}</span>` : ''}
            ${roleDurationHtml}
            ${itStatusHtml}
            ${painPointHtml}
          </div>
          ${ji < stage.steps.length - 1 ? '<div class="vs-arrow-inner" aria-hidden="true">↓</div>' : ''}
        `;
        }).join('');

    return `
      <div class="vs-graph-stage" data-stage="${si}" data-vs-stage-name="${escapeHtml(stage.name)}">
        <div class="vs-stage-node" data-vs-stage-name="${escapeHtml(stage.name)}">
          <div class="vs-stage-name">${escapeHtml(stage.name)}</div>
          <div class="vs-steps-chain">${stepsHtml}</div>
        </div>
      </div>
      ${si < stages.length - 1 ? '<div class="vs-arrow-outer" aria-hidden="true">→</div>' : ''}
    `;
  }).join('');

  return `<div class="vs-graph">${stagesHtml}</div>`;
}

/**
 * 渲染端到端工作流图：读取价值流 JSON，按环节发生顺序从左到右排列圆角矩形卡片，卡片风格与价值流图一致
 */
function renderEndToEndFlowHTML(valueStream) {
  const { stages } = parseValueStreamGraph(valueStream);
  const allSteps = stages.flatMap((s) => s.steps);
  if (allSteps.length === 0) {
    return '<p class="vs-view-placeholder">暂无环节数据，无法渲染端到端流程</p>';
  }
  const stepCardsHtml = allSteps.map((step, i) => {
    const roleDurationHtml = (step.role || step.duration)
      ? `<div class="vs-step-meta">
          ${step.role ? `<span class="vs-step-meta-chip vs-step-meta-role">${escapeHtml(step.role)}</span>` : ''}
          ${step.duration ? `<span class="vs-step-meta-chip vs-step-meta-duration">${escapeHtml(step.duration)}</span>` : ''}
        </div>`
      : '';
    const itStatusHtml = step.itStatusLabel
      ? `<div class="vs-step-meta"><span class="vs-step-meta-chip vs-step-meta-it-status">IT现状：${escapeHtml(step.itStatusLabel)}</span></div>`
      : '';
    const painPointHtml = step.painPoint
      ? `<div class="vs-step-meta"><div class="vs-step-pain-point-card">${escapeHtml(step.painPoint)}</div></div>`
      : '';
    return `
      <div class="vs-e2e-step-card vs-step-node" data-vs-step-index="${i}">
        <div class="vs-e2e-step-name-block">
          <span class="vs-e2e-step-name-text">${escapeHtml(step.name)}</span>
        </div>
        ${step.desc ? `<span class="vs-step-desc">${escapeHtml(step.desc)}</span>` : ''}
        ${roleDurationHtml}
        ${itStatusHtml}
        ${painPointHtml}
      </div>
      ${i < allSteps.length - 1 ? '<div class="vs-arrow-outer vs-e2e-arrow" aria-hidden="true">→</div>' : ''}
    `;
  }).join('');
  return `<div class="vs-e2e-flow">${stepCardsHtml}</div>`;
}

/**
 * 将 API 返回解析为价值流列表（数组，每项含 name 及完整 JSON）
 */
function getValueStreamList(data) {
  if (data == null) return [];
  if (Array.isArray(data)) return data;
  const raw = data.value_streams ?? data.streams ?? data.list ?? data.data;
  if (Array.isArray(raw)) return raw;
  if (data.stages != null || data.phases != null) return [data];
  if (raw != null && typeof raw === 'object') return [raw];
  return [];
}

/** 当前价值流列表，用于展开时按索引渲染对应项的 view */
let currentValueStreamList = [];

/**
 * 渲染价值流列表：可展开卡片，展开时按索引惰性渲染 view，确保每项使用正确数据
 */
function renderValueStreamList(list) {
  const container = el.valueStreamContent;
  currentValueStreamList = list || [];
  if (!list || list.length === 0) {
    container.innerHTML = '<p class="vs-empty">暂无价值流数据</p>';
    return;
  }
  container.innerHTML = list.map((item, i) => {
    const name = formatValue(item.name ?? item.title ?? item.value_stream_name ?? `价值流 ${i + 1}`);
    const jsonStr = JSON.stringify(item, null, 2);
    return `
      <div class="vs-card" data-index="${i}">
        <button type="button" class="vs-card-header" aria-expanded="false" aria-controls="vs-body-${i}">
          <span class="vs-card-name">${escapeHtml(name)}</span>
          <span class="vs-card-chevron" aria-hidden="true">▼</span>
        </button>
        <div class="vs-card-body" id="vs-body-${i}" hidden>
          <div class="vs-tabs">
            <button type="button" class="vs-tab vs-tab-active" data-tab="view">view</button>
            <button type="button" class="vs-tab" data-tab="json">json</button>
          </div>
          <div class="vs-tab-panel vs-tab-panel-view" data-panel="view" data-rendered="false">
            <p class="vs-view-placeholder">展开后加载…</p>
          </div>
          <div class="vs-tab-panel vs-tab-panel-json" data-panel="json" hidden>
            <pre class="vs-json">${escapeHtml(jsonStr)}</pre>
          </div>
        </div>
      </div>
    `;
  }).join('');

  container.querySelectorAll('.vs-card-header').forEach((btn) => {
    btn.addEventListener('click', () => {
      const card = btn.closest('.vs-card');
      const body = card.querySelector('.vs-card-body');
      const expanded = body.hidden;
      body.hidden = !expanded;
      btn.setAttribute('aria-expanded', String(!expanded));
      card.classList.toggle('vs-card-expanded', !expanded);

      if (expanded) {
        const viewPanel = card.querySelector('.vs-tab-panel-view');
        if (viewPanel && viewPanel.dataset.rendered !== 'true') {
          const idx = parseInt(card.dataset.index, 10);
          const item = currentValueStreamList[idx];
          if (item) {
            viewPanel.innerHTML = renderValueStreamViewHTML(item);
            viewPanel.dataset.rendered = 'true';
          }
        }
      }
    });
  });

  container.querySelectorAll('.vs-tab').forEach((tab) => {
    tab.addEventListener('click', (e) => {
      e.stopPropagation();
      const card = tab.closest('.vs-card');
      const targetTab = tab.dataset.tab;
      card.querySelectorAll('.vs-tab').forEach((t) => t.classList.remove('vs-tab-active'));
      card.querySelectorAll('.vs-tab-panel').forEach((p) => { p.hidden = p.dataset.panel !== targetTab; });
      tab.classList.add('vs-tab-active');

      if (targetTab === 'view') {
        const viewPanel = card.querySelector('.vs-tab-panel-view');
        if (viewPanel) {
          const idx = parseInt(card.dataset.index, 10);
          const item = currentValueStreamList[idx];
          if (item) {
            viewPanel.innerHTML = renderValueStreamViewHTML(item);
            viewPanel.dataset.rendered = 'true';
          }
        }
      }
    });
  });
}

async function loadValueStreamList() {
  if (!lastQueriedCompanyName) return;
  el.btnValueStreamList.disabled = true;
  el.valueStreamSection.hidden = false;
  el.valueStreamContent.innerHTML = '<p class="vs-empty">加载中…</p>';

  try {
    const res = await fetch(VALUE_STREAM_API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ companyName: lastQueriedCompanyName }),
    });
    const json = await res.json().catch(() => ({}));

    if (!res.ok) {
      el.valueStreamContent.innerHTML = '<p class="vs-empty">加载失败：' + escapeHtml(json.error || res.status) + '</p>';
      return;
    }

    const data = json.data !== undefined ? json.data : json;
    const list = getValueStreamList(data);
    renderValueStreamList(list);
  } catch (err) {
    el.valueStreamContent.innerHTML = '<p class="vs-empty">请求异常：' + escapeHtml(err.message || String(err)) + '</p>';
  } finally {
    el.btnValueStreamList.disabled = false;
  }
}

function renderMetadata(data) {
  if (!data) return;
  const items = [
    { key: 'analysis_id', label: '档案 ID' },
    { key: 'created_date', label: '创建时间' },
    { key: 'updated_date', label: '更新时间' },
  ];
  el.metadataList.innerHTML = items.map(({ key, label }) => {
    const value = formatValue(data[key]);
    return `<dt>${label}</dt><dd>${escapeHtml(value) || '—'}</dd>`;
  }).join('');
}

async function query() {
  if (!el.companyName) return;
  const companyName = (el.companyName.value || '').trim();
  if (!companyName) {
    showError('请输入企业名称');
    return;
  }

  showError('');
  showResult(false);
  showLoading(true);

  const target = (API_URL || '').replace(/\/$/, '') || window.location.origin;

  try {
    const res = await fetch(target, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ companyName }),
    });

    const json = await res.json().catch(() => ({}));

    if (!res.ok) {
      const msg = json.error || `请求失败 (${res.status})`;
      showError(msg);
      showLoading(false);
      return;
    }

    if (!json.success || !json.data) {
      showError(json.error || '返回数据格式异常');
      showLoading(false);
      return;
    }

    const { basic_info, business_model_canvas, metadata } = json.data;
    lastQueriedCompanyName = (basic_info && basic_info.company_name) || companyName;
    lastQueryResult = { basic_info, business_model_canvas, metadata };
    renderBasicInfo(basic_info);
    renderBMC(business_model_canvas);
    renderMetadata(metadata);
    el.valueStreamSection.hidden = true;
    el.valueStreamContent.innerHTML = '';
    showResult(true);
  } catch (err) {
    const message = err.message || String(err);
    if (message.includes('Failed to fetch') || message.includes('NetworkError')) {
      showError(
        '连接被拒绝：当前没有程序在 ' + target + ' 监听。\n\n' +
        '请先启动后端 API 服务（例如在 API 项目目录运行 deno 启动命令），并确保 main.js 顶部的 API_URL 与后端地址、端口一致。'
      );
    } else {
      showError('请求异常：' + message);
    }
  } finally {
    showLoading(false);
  }
}

document.addEventListener('DOMContentLoaded', () => {
  console.log('[DOMContentLoaded] 页面加载完成，检查按钮:');
  debugValueStreamButton();
  renderProblemFollowList();
  if (el.btnValueStreamList) {
    el.btnValueStreamList.addEventListener('click', loadValueStreamList);
  } else {
    console.warn('[DOMContentLoaded] btnValueStreamList 未找到，无法绑定点击事件');
  }
  restoreRouteState();
});

function updateSearchSuggestions() {
  const input = (el.companyName?.value || '').trim();
  const container = el.searchSuggestions;
  if (!container) return;
  if (!input) {
    container.hidden = true;
    container.innerHTML = '';
    return;
  }
  const list = getSavedAnalyses();
  const lower = input.toLowerCase();
  const matches = list.filter((r) => {
    const name = (r.companyName || '').trim();
    return name && name.toLowerCase().includes(lower);
  });
  if (matches.length === 0) {
    container.hidden = true;
    container.innerHTML = '';
    return;
  }
  container.innerHTML = matches
    .map(
      (r) =>
        `<div class="search-suggestion-item" role="button" tabindex="0">${escapeHtml(r.companyName || '未命名')}</div>`
    )
    .join('');
  container.hidden = false;
  container.querySelectorAll('.search-suggestion-item').forEach((node, i) => {
    node.addEventListener('click', () => selectSuggestion(matches[i]));
    node.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        selectSuggestion(matches[i]);
      }
    });
  });
}

function selectSuggestion(record) {
  if (!record) return;
  el.searchSuggestions.hidden = true;
  el.searchSuggestions.innerHTML = '';
  el.companyName.value = record.companyName || '';
  openDetail(record);
}

function getSavedAnalyses() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveAnalysis(record) {
  const list = getSavedAnalyses();
  const idx = list.findIndex((r) => (r.companyName || '').trim() === (record.companyName || '').trim());
  if (idx >= 0) list[idx] = record;
  else list.push(record);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
}

function saveCurrent() {
  if (!lastQueryResult) {
    showError('请先查询企业信息');
    return;
  }
  const companyName = (lastQueryResult.basic_info?.company_name || lastQueriedCompanyName || '').trim();
  if (!companyName) {
    showError('无法获取企业名称');
    return;
  }
  const record = {
    companyName,
    basicInfo: lastQueryResult.basic_info,
    bmc: lastQueryResult.business_model_canvas,
    metadata: lastQueryResult.metadata,
    valueStreams: [...(currentValueStreamList || [])],
    storedAt: new Date().toISOString(),
  };
  saveAnalysis(record);
  showError('');
  alert('已存储成功');
}

function saveRouteState(view, params) {
  try {
    sessionStorage.setItem(ROUTE_STORAGE_KEY, JSON.stringify({ view, params: params || {} }));
  } catch (_) {}
}

function restoreRouteState() {
  try {
    const raw = sessionStorage.getItem(ROUTE_STORAGE_KEY);
    if (!raw) return;
    const { view, params } = JSON.parse(raw);
    if (view === 'problemDetail' && params.createdAt) {
      const list = getDigitalProblems();
      const item = list.find((p) => String(p.createdAt) === String(params.createdAt));
      if (item) {
        openProblemDetail(item);
        return;
      }
    }
    if (view === 'taskTracking' && params.createdAt) {
      const list = getDigitalProblems();
      const item = list.find((p) => String(p.createdAt) === String(params.createdAt));
      if (item) {
        openTaskTracking(item);
        return;
      }
    }
    if (view === 'detail' && params.companyName) {
      const list = getSavedAnalyses();
      const record = list.find((r) => (r.companyName || '').trim() === (params.companyName || '').trim());
      if (record) {
        openDetail(record);
        return;
      }
    }
    if (view === 'tools') {
      renderToolsKnowledge();
      switchView('tools');
      return;
    }
    switchView('home');
  } catch (_) {}
}

function switchView(view) {
  el.homeView.hidden = view !== 'home';
  if (el.toolsView) el.toolsView.hidden = view !== 'tools';
  el.detailView.hidden = view !== 'detail';
  if (el.problemDetailView) el.problemDetailView.hidden = view !== 'problemDetail';
  if (el.taskTrackingView) el.taskTrackingView.hidden = view !== 'taskTracking';
  if (el.navDetailLabel) el.navDetailLabel.hidden = view !== 'detail';
  if (el.topNav) el.topNav.hidden = (view === 'problemDetail' || view === 'taskTracking');
}

function renderSavedList() {
  if (!el.savedListContent) return;
  const list = getSavedAnalyses();
  if (!list.length) {
    el.savedListContent.innerHTML = '<p class="vs-empty">暂无已存储数据</p>';
    return;
  }
  el.savedListContent.innerHTML = list
    .map(
      (r, i) =>
        `<div class="saved-item" data-index="${i}" role="button" tabindex="0">${escapeHtml(r.companyName || '未命名')}</div>`
    )
    .join('');
  el.savedListContent.querySelectorAll('.saved-item').forEach((node, i) => {
    node.addEventListener('click', () => openDetail(list[i]));
    node.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        openDetail(list[i]);
      }
    });
  });
}

function toggleChatPanel(open) {
  const panel = el.chatPanel;
  const body = document.querySelector('.detail-body');
  if (!panel) return;
  const isOpen = open ?? !panel.classList.contains('chat-panel-open');
  panel.classList.toggle('chat-panel-open', isOpen);
  if (body) body.classList.toggle('chat-panel-open', isOpen);
}

function toggleHistoryPanel(open) {
  const panel = el.historyPanel;
  const body = document.querySelector('.detail-body');
  if (!panel) return;
  const isOpen = open ?? !panel.classList.contains('history-panel-open');
  panel.classList.toggle('history-panel-open', isOpen);
  if (body) body.classList.toggle('history-panel-open', isOpen);
  if (isOpen) renderModificationHistory();
}

function renderModificationHistory() {
  if (!el.historyContent) return;
  const record = currentDetailRecord;
  const history = record?.modificationHistory || [];
  const companyName = record?.companyName || '当前企业';
  const titleEl = el.historyPanel?.querySelector('.history-panel-title');
  if (titleEl) titleEl.textContent = `${companyName} - 修改历史`;
  el.historyContent.innerHTML = history.length === 0
    ? `<p class="history-empty">暂无修改历史</p><p class="history-subtitle">${escapeHtml(companyName)}</p>`
    : `<p class="history-subtitle">${escapeHtml(companyName)}</p>
       <div class="history-timeline">
         ${history
           .map(
             (item) => `
           <div class="history-item">
             <div class="history-item-dot"></div>
             <div class="history-item-content">
               <div class="history-item-meta">${escapeHtml(formatHistoryTime(item.timestamp))}</div>
               <div class="history-item-row"><span class="history-label">修改位置</span>${escapeHtml(item.position || '—')}</div>
               <div class="history-item-row"><span class="history-label">修改前</span>${escapeHtml(item.beforeValue ?? '—')}</div>
               <div class="history-item-row"><span class="history-label">修改意见</span>${escapeHtml(item.modification || '—')}</div>
               <div class="history-item-row"><span class="history-label">修改后</span>${escapeHtml(item.afterValue ?? item.modification ?? '—')}</div>
               <div class="history-item-row"><span class="history-label">修改原因</span>${escapeHtml(item.reason || '—')}</div>
             </div>
           </div>`
           )
           .join('')}
       </div>`;
}

/** 沟通历史/任务过程日志时间：与 formatChatTime 一致的「日期+具体时间」 */
function formatHistoryTime(ts) {
  if (!ts) return '—';
  try {
    const d = new Date(ts);
    if (Number.isNaN(d.getTime())) return String(ts);
    const y = d.getFullYear();
    const m = (d.getMonth() + 1).toString().padStart(2, '0');
    const day = d.getDate().toString().padStart(2, '0');
    const h = d.getHours().toString().padStart(2, '0');
    const min = d.getMinutes().toString().padStart(2, '0');
    const sec = d.getSeconds().toString().padStart(2, '0');
    return `${y}-${m}-${day} ${h}:${min}:${sec}`;
  } catch {
    return String(ts);
  }
}

/** 将 ISO 或时间戳格式化为「日期+具体时间」，与 getTimeStr 一致 */
function formatChatTime(ts) {
  if (!ts) return getTimeStr();
  const s = String(ts).trim();
  if (!s) return getTimeStr();
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) {
    return s;
  }
  const y = d.getFullYear();
  const m = (d.getMonth() + 1).toString().padStart(2, '0');
  const day = d.getDate().toString().padStart(2, '0');
  const h = d.getHours().toString().padStart(2, '0');
  const min = d.getMinutes().toString().padStart(2, '0');
  const sec = d.getSeconds().toString().padStart(2, '0');
  return `${y}-${m}-${day} ${h}:${min}:${sec}`;
}

/** 从 parsed 获取价值流索引 */
function getValueStreamIndexFromParsed(parsed) {
  if (!parsed?.isValueStream) return null;
  if (parsed.valueStreamIndex != null && parsed.valueStreamIndex >= 0) return parsed.valueStreamIndex;
  const vsName = (parsed.valueStreamName || '').trim();
  if (!vsName || !currentDetailRecord) return null;
  const list = currentDetailRecord.valueStreams || [];
  for (let i = 0; i < list.length; i++) {
    const name = formatValue(list[i].name ?? list[i].title ?? list[i].value_stream_name) || '';
    if (name === vsName || name.includes(vsName) || vsName.includes(name)) return i;
  }
  return null;
}

/**
 * 展开并刷新指定价值流卡片的 view 和 json
 */
function expandAndRefreshValueStreamCard(vsIndex) {
  if (!el.detailResult || !currentDetailRecord) return;
  const valueStreams = currentDetailRecord.valueStreams || [];
  const item = valueStreams[vsIndex];
  if (!item) return;
  const card = el.detailResult.querySelector(`.vs-card[data-index="${vsIndex}"]`);
  if (!card) return;
  const header = card.querySelector('.vs-card-header');
  const body = card.querySelector('.vs-card-body');
  const viewPanel = card.querySelector('.vs-tab-panel-view');
  const jsonPanel = card.querySelector('.vs-tab-panel-json');
  body.hidden = false;
  header.setAttribute('aria-expanded', 'true');
  card.classList.add('vs-card-expanded');
  if (viewPanel) {
    viewPanel.innerHTML = renderValueStreamViewHTML(item);
    viewPanel.dataset.rendered = 'true';
  }
  if (jsonPanel) {
    const pre = jsonPanel.querySelector('.vs-json');
    if (pre) pre.textContent = JSON.stringify(item, null, 2);
  }
}

function setupDetailValueStreamEvents() {
  if (!el.detailResult) return;
  currentValueStreamList = currentDetailRecord?.valueStreams || [];
  el.detailResult.querySelectorAll('.vs-card-header').forEach((btn) => {
    btn.addEventListener('click', () => {
      const card = btn.closest('.vs-card');
      const body = card.querySelector('.vs-card-body');
      const expanded = body.hidden;
      body.hidden = !expanded;
      btn.setAttribute('aria-expanded', String(!expanded));
      card.classList.toggle('vs-card-expanded', !expanded);
      if (expanded) {
        const viewPanel = card.querySelector('.vs-tab-panel-view');
        if (viewPanel && viewPanel.dataset.rendered !== 'true') {
          const idx = parseInt(card.dataset.index, 10);
          const item = currentValueStreamList[idx];
          if (item) {
            viewPanel.innerHTML = renderValueStreamViewHTML(item);
            viewPanel.dataset.rendered = 'true';
          }
        }
      }
    });
  });
  el.detailResult.querySelectorAll('.vs-tab').forEach((tab) => {
    tab.addEventListener('click', (e) => {
      e.stopPropagation();
      const card = tab.closest('.vs-card');
      const targetTab = tab.dataset.tab;
      card.querySelectorAll('.vs-tab').forEach((t) => t.classList.remove('vs-tab-active'));
      card.querySelectorAll('.vs-tab-panel').forEach((p) => { p.hidden = p.dataset.panel !== targetTab; });
      tab.classList.add('vs-tab-active');
      if (targetTab === 'view') {
        const viewPanel = card.querySelector('.vs-tab-panel-view');
        if (viewPanel) {
          const idx = parseInt(card.dataset.index, 10);
          const item = currentValueStreamList[idx];
          if (item) {
            viewPanel.innerHTML = renderValueStreamViewHTML(item);
            viewPanel.dataset.rendered = 'true';
          }
        }
      }
    });
  });

  setupVsJsonEditEvents();
}

function setupVsJsonEditEvents() {
  if (!el.detailResult) return;
  el.detailResult.querySelectorAll('.vs-json-edit-btn').forEach((btn) => {
    btn.addEventListener('click', () => enterVsJsonEditMode(btn.closest('.vs-card')));
  });
  el.detailResult.querySelectorAll('.vs-json-undo-btn').forEach((btn) => {
    btn.addEventListener('click', () => undoVsJsonEdit(btn.closest('.vs-card')));
  });
  el.detailResult.querySelectorAll('.vs-json-save-btn').forEach((btn) => {
    btn.addEventListener('click', () => saveVsJsonEdit(btn.closest('.vs-card')));
  });
  el.detailResult.querySelectorAll('.vs-json-cancel-btn').forEach((btn) => {
    btn.addEventListener('click', () => exitVsJsonEditMode(btn.closest('.vs-card')));
  });
}

const vsJsonEditState = new WeakMap();

function enterVsJsonEditMode(card) {
  if (!card || !currentDetailRecord) return;
  const idx = parseInt(card.dataset.index, 10);
  const item = currentDetailRecord.valueStreams?.[idx];
  if (!item) return;
  const jsonPanel = card.querySelector('.vs-tab-panel-json');
  const pre = jsonPanel?.querySelector('.vs-json');
  const textarea = jsonPanel?.querySelector('.vs-json-edit');
  const editBtn = jsonPanel?.querySelector('.vs-json-edit-btn');
  const editActions = jsonPanel?.querySelector('.vs-json-edit-actions');
  const errorEl = jsonPanel?.querySelector('.vs-json-error');
  if (!pre || !textarea || !editBtn || !editActions) return;
  const content = JSON.stringify(item, null, 2);
  textarea.value = content;
  vsJsonEditState.set(card, { undoStack: [], lastPushed: content });
  if (errorEl) { errorEl.hidden = true; errorEl.textContent = ''; }
  pre.hidden = true;
  textarea.hidden = false;
  editBtn.hidden = true;
  editActions.hidden = false;
  editActions.querySelector('.vs-json-undo-btn').hidden = true;
  textarea.focus();
  let debounceTimer;
  const onInput = () => {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      const state = vsJsonEditState.get(card);
      if (state && state.lastPushed !== textarea.value) {
        state.undoStack.push(state.lastPushed);
        state.lastPushed = textarea.value;
        editActions.querySelector('.vs-json-undo-btn').hidden = state.undoStack.length === 0;
      }
    }, 300);
  };
  textarea.addEventListener('input', onInput);
  textarea._vsJsonCleanup?.();
  textarea._vsJsonCleanup = () => {
    textarea.removeEventListener('input', onInput);
    clearTimeout(debounceTimer);
    delete textarea._vsJsonCleanup;
  };
}

function undoVsJsonEdit(card) {
  const state = vsJsonEditState.get(card);
  const jsonPanel = card?.querySelector('.vs-tab-panel-json');
  const textarea = jsonPanel?.querySelector('.vs-json-edit');
  const errorEl = jsonPanel?.querySelector('.vs-json-error');
  const undoBtn = jsonPanel?.querySelector('.vs-json-undo-btn');
  if (!textarea || !state || state.undoStack.length === 0) return;
  const prev = state.undoStack.pop();
  textarea.value = prev;
  state.lastPushed = prev;
  if (undoBtn) undoBtn.hidden = state.undoStack.length === 0;
  if (errorEl) { errorEl.hidden = true; errorEl.textContent = ''; }
}

function saveVsJsonEdit(card) {
  if (!card || !currentDetailRecord) return;
  const idx = parseInt(card.dataset.index, 10);
  const jsonPanel = card.querySelector('.vs-tab-panel-json');
  const textarea = jsonPanel?.querySelector('.vs-json-edit');
  const errorEl = jsonPanel?.querySelector('.vs-json-error');
  if (!textarea) return;
  let parsed;
  try {
    parsed = JSON.parse(textarea.value);
  } catch (e) {
    if (errorEl) {
      errorEl.hidden = false;
      errorEl.textContent = 'JSON 格式错误：' + (e.message || '无法解析');
    }
    return;
  }
  if (!parsed || typeof parsed !== 'object') {
    if (errorEl) {
      errorEl.hidden = false;
      errorEl.textContent = 'JSON 必须为对象';
    }
    return;
  }
  if (errorEl) { errorEl.hidden = true; errorEl.textContent = ''; }
  textarea._vsJsonCleanup?.();
  vsJsonEditState.delete(card);
  currentDetailRecord.valueStreams[idx] = parsed;
  saveAnalysis(currentDetailRecord);
  const viewPanel = card.querySelector('.vs-tab-panel-view');
  if (viewPanel) {
    viewPanel.innerHTML = renderValueStreamViewHTML(parsed);
    viewPanel.dataset.rendered = 'true';
  }
  const pre = jsonPanel.querySelector('.vs-json');
  pre.textContent = JSON.stringify(parsed, null, 2);
  pre.hidden = false;
  textarea.hidden = true;
  jsonPanel.querySelector('.vs-json-edit-btn').hidden = false;
  jsonPanel.querySelector('.vs-json-edit-actions').hidden = true;
  delete textarea.dataset.undoContent;
}

function exitVsJsonEditMode(card) {
  if (!card || !currentDetailRecord) return;
  const idx = parseInt(card.dataset.index, 10);
  const item = currentDetailRecord.valueStreams?.[idx];
  if (!item) return;
  const jsonPanel = card.querySelector('.vs-tab-panel-json');
  const pre = jsonPanel?.querySelector('.vs-json');
  const textarea = jsonPanel?.querySelector('.vs-json-edit');
  const errorEl = jsonPanel?.querySelector('.vs-json-error');
  if (!pre || !textarea) return;
  textarea._vsJsonCleanup?.();
  vsJsonEditState.delete(card);
  pre.textContent = JSON.stringify(item, null, 2);
  pre.hidden = false;
  textarea.hidden = true;
  if (errorEl) { errorEl.hidden = true; errorEl.textContent = ''; }
  jsonPanel.querySelector('.vs-json-edit-btn').hidden = false;
  jsonPanel.querySelector('.vs-json-edit-actions').hidden = true;
}

function openDetail(record) {
  if (!record) return;
  saveChatToRecord();
  toggleChatPanel(false);
  toggleHistoryPanel(false);
  currentModificationTask = null;
  currentDetailCompanyName = record.companyName || '';
  currentDetailRecord = record;
  chatHistory = record.chatHistory ? [...record.chatHistory] : [];
  record.chatHistory = chatHistory;
  el.detailTitle.textContent = record.companyName || '客户详情';
  el.detailResult.innerHTML = buildDetailHTML(record);
  saveRouteState('detail', { companyName: record.companyName });
  switchView('detail');
  setupDetailValueStreamEvents();
  renderChatMessagesFromHistory();
}

function renderChatMessagesFromHistory() {
  if (!el.chatMessages) return;
  el.chatMessages.innerHTML = '';
  chatHistory.forEach((msg) => {
    const timeStr = formatChatTime(msg.timestamp);
    if (msg.role === 'user') {
      appendChatBlock(el.chatMessages, 'user', msg.content, timeStr);
    } else {
      const parsed = parseModificationResponse(msg.content);
      if (parsed) {
        appendModificationBlockReadOnly(el.chatMessages, parsed, timeStr);
      } else {
        appendChatBlock(el.chatMessages, 'assistant', msg.content, timeStr);
      }
    }
  });
  el.chatMessages.scrollTop = el.chatMessages.scrollHeight;
}

function saveChatToRecord() {
  if (currentDetailRecord) {
    currentDetailRecord.chatHistory = [...chatHistory];
    saveAnalysis(currentDetailRecord);
  }
}

function buildDetailHTML(record) {
  const basicInfo = record.basicInfo || {};
  const bmc = record.bmc || {};
  const metadata = record.metadata || {};
  const valueStreams = record.valueStreams || [];

  const basicHtml = BASIC_INFO_FIELDS.map(({ key, label }) => {
    const raw = basicInfo[key];
    const value = formatValue(raw);
    const ddContent = key === 'official_website' && raw
      ? `<a href="${encodeURI(raw)}" target="_blank" rel="noopener">${escapeHtml(value)}</a>`
      : escapeHtml(value) || '—';
    return `<div class="info-grid-cell" data-modify-target="${escapeHtml(label)}"><dt>${label}</dt><dd>${ddContent}</dd></div>`;
  }).join('');

  const bmcHtml = BMC_FIELDS.map(({ key, label }) => {
    const content = formatValue(bmc[key]);
    return `<div class="bmc-block" data-modify-target="${escapeHtml(label)}"><h4>${escapeHtml(label)}</h4><div class="content">${escapeHtml(content)}</div></div>`;
  }).join('');
  const review = formatValue(bmc.comprehensive_review);

  const bmcReviewHtml = `<div class="bmc-review" data-modify-target="综合评述"><h4>综合评述</h4><div class="content">${escapeHtml(review)}</div></div>`;

  const metaHtml = [
    { key: 'analysis_id', label: '档案 ID' },
    { key: 'created_date', label: '创建时间' },
    { key: 'updated_date', label: '更新时间' },
  ]
    .map(({ key, label }) => {
      const value = formatValue(metadata[key]);
      return `<dt>${label}</dt><dd>${escapeHtml(value) || '—'}</dd>`;
    })
    .join('');

  let valueStreamHtml = '<p class="vs-empty">暂无价值流数据</p>';
  if (valueStreams.length > 0) {
    valueStreamHtml = valueStreams
      .map((item, i) => {
        const name = formatValue(item.name ?? item.title ?? item.value_stream_name ?? `价值流 ${i + 1}`);
        const jsonStr = JSON.stringify(item, null, 2);
        return `
          <div class="vs-card" data-index="${i}" data-vs-index="${i}" data-vs-name="${escapeHtml(name)}">
            <button type="button" class="vs-card-header" aria-expanded="false">
              <span class="vs-card-name">${escapeHtml(name)}</span>
              <span class="vs-card-chevron" aria-hidden="true">▼</span>
            </button>
            <div class="vs-card-body" hidden>
              <div class="vs-tabs">
                <button type="button" class="vs-tab vs-tab-active" data-tab="view">view</button>
                <button type="button" class="vs-tab" data-tab="json">json</button>
              </div>
              <div class="vs-tab-panel vs-tab-panel-view" data-panel="view" data-rendered="false">
                <p class="vs-view-placeholder">展开后加载…</p>
              </div>
              <div class="vs-tab-panel vs-tab-panel-json" data-panel="json" hidden>
                <div class="vs-json-toolbar">
                  <button type="button" class="vs-json-edit-btn">编辑</button>
                  <div class="vs-json-edit-actions" hidden>
                    <button type="button" class="vs-json-undo-btn">撤回</button>
                    <button type="button" class="vs-json-save-btn">保存</button>
                    <button type="button" class="vs-json-cancel-btn">取消</button>
                  </div>
                </div>
                <pre class="vs-json">${escapeHtml(jsonStr)}</pre>
                <textarea class="vs-json-edit" hidden spellcheck="false"></textarea>
                <p class="vs-json-error" hidden></p>
              </div>
            </div>
          </div>`;
      })
      .join('');
  }

  return `
    <section class="basic-info section-card">
      <div class="basic-info-header">
        <h2>基本信息</h2>
        <button type="button" class="btn-basic-info-json">生成 JSON</button>
      </div>
      <div class="info-grid">${basicHtml}</div>
    </section>
    <section class="bmc-section section-card">
      <div class="bmc-section-header">
        <h2>商业画布 (BMC)</h2>
        <button type="button" class="btn-bmc-json">生成 JSON</button>
      </div>
      <div class="bmc-grid">${bmcHtml}</div>
      ${bmcReviewHtml}
    </section>
    <section class="value-stream-section section-card">
      <h2>价值流列表</h2>
      <div class="value-stream-content">${valueStreamHtml}</div>
    </section>
    <section class="metadata section-card muted">
      <h3>档案元数据</h3>
      <dl class="info-grid compact">${metaHtml}</dl>
    </section>
  `;
}

if (el.btnQuery) el.btnQuery.addEventListener('click', query);
if (el.companyName) {
  el.companyName.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') query();
  });
  el.companyName.addEventListener('input', updateSearchSuggestions);
  el.companyName.addEventListener('focus', updateSearchSuggestions);
  el.companyName.addEventListener('blur', () => {
    setTimeout(() => {
      if (el.searchSuggestions) el.searchSuggestions.hidden = true;
    }, 150);
  });
}
if (el.btnSave) el.btnSave.addEventListener('click', saveCurrent);
if (el.btnParse) el.btnParse.addEventListener('click', handleParseClick);
if (el.btnStartFollow) el.btnStartFollow.addEventListener('click', handleStartFollowClick);
if (el.problemFollowListContent) {
  el.problemFollowListContent.addEventListener('click', (e) => {
    const delBtn = e.target.closest('.btn-problem-follow-delete');
    if (delBtn) {
      e.stopPropagation();
      const index = parseInt(delBtn.getAttribute('data-index'), 10);
      if (!Number.isNaN(index)) {
        const list = getDigitalProblems();
        const item = list[index];
        const name = (item?.customerName ?? item?.customer_name ?? '').trim() || '该客户';
        if (!confirm(`确定要删除「${name}」的数字化问题档案吗？此操作不可恢复。`)) return;
        removeDigitalProblem(index);
        renderProblemFollowList();
      }
      return;
    }
    const startBtn = e.target.closest('.btn-problem-follow-start');
    if (startBtn) {
      e.stopPropagation();
      const index = parseInt(startBtn.getAttribute('data-index'), 10);
      if (!Number.isNaN(index)) {
        const list = getDigitalProblems();
        const item = list[index];
        if (item) openProblemDetail(item);
      }
    }
  });
}
if (el.btnProblemDetailBack) {
  el.btnProblemDetailBack.addEventListener('click', () => {
    saveRouteState('home');
    switchView('home');
    renderProblemFollowList();
  });
}
if (el.btnTaskTrackingBack) {
  el.btnTaskTrackingBack.addEventListener('click', () => {
    saveRouteState('home');
    switchView('home');
    renderProblemFollowList();
  });
}
if (el.btnTaskTrackingEnter) {
  el.btnTaskTrackingEnter.addEventListener('click', () => {
    if (currentProblemDetailItem) openProblemDetail(currentProblemDetailItem);
  });
}
if (el.problemDetailView) {
  const handleStageSwitch = (stageEl) => {
    if (!stageEl || !currentProblemDetailItem) return;
    const stage = parseInt(stageEl.getAttribute('data-stage'), 10);
    if (isNaN(stage)) return;
    const currentMajorStage = currentProblemDetailItem.currentMajorStage ?? 0;
    if (stage > currentMajorStage) return;
    problemDetailViewingMajorStage = stage;
    updateProblemDetailProgressStages(currentMajorStage, problemDetailViewingMajorStage);
    renderProblemDetailContent();
  };
  el.problemDetailView.addEventListener('click', (e) => {
    const stageEl = e.target.closest('.problem-detail-stage.problem-detail-stage-clickable');
    if (stageEl) handleStageSwitch(stageEl);
  });
  el.problemDetailView.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    const stageEl = e.target.closest('.problem-detail-stage.problem-detail-stage-clickable');
    if (!stageEl) return;
    e.preventDefault();
    handleStageSwitch(stageEl);
  });
}
if (el.btnProblemDetailHistory) {
  el.btnProblemDetailHistory.addEventListener('click', () => toggleProblemDetailHistory(true));
}
if (el.btnProblemDetailRollback) {
  el.btnProblemDetailRollback.addEventListener('click', () => {
    const item = currentProblemDetailItem;
    if (!item?.createdAt) return;
    const entry = popOperationFromHistory(item.createdAt);
    if (!entry) {
      alert('暂无可回退的操作');
      return;
    }
    const { snapshot, chatLengthBefore } = entry;
    restoreItemFromSnapshot(item.createdAt, snapshot);
    problemDetailConfirmedBasicInfo = snapshot.basicInfo || null;
    currentProblemDetailItem = { ...snapshot, createdAt: item.createdAt };
    const chats = getProblemDetailChats();
    const messages = chats[item.createdAt];
    if (Array.isArray(messages) && chatLengthBefore >= 0 && chatLengthBefore < messages.length) {
      const truncated = messages.slice(0, chatLengthBefore);
      chats[item.createdAt] = truncated;
      localStorage.setItem(PROBLEM_DETAIL_CHATS_STORAGE_KEY, JSON.stringify(chats));
      problemDetailChatMessages.length = 0;
      truncated.forEach((m) => problemDetailChatMessages.push(m));
    }
    renderProblemDetailContent();
    const container = el.problemDetailChatMessages;
    if (container) {
      container.innerHTML = '';
      renderProblemDetailChatFromStorage(container, problemDetailChatMessages);
      container.scrollTop = container.scrollHeight;
    }
    el.problemDetailContent?.querySelectorAll('.modify-target-highlight').forEach((node) => node.classList.remove('modify-target-highlight'));
    requestAnimationFrame(() => {
      maybeShowBmcStartBlock();
      maybeShowRequirementLogicStartBlock();
      maybeShowValueStreamStartBlock();
      maybeShowItStatusStartBlock();
      maybeShowPainPointStartBlock();
    });
  });
}
if (el.btnCloseProblemDetailHistory) {
  el.btnCloseProblemDetailHistory.addEventListener('click', () => toggleProblemDetailHistory(false));
}
if (el.problemDetailBody) {
  el.problemDetailBody.addEventListener('click', (e) => {
    const triggerBtn = e.target.closest('.btn-trigger-local-itgap-session');
    if (triggerBtn && !triggerBtn.disabled) {
      e.preventDefault();
      e.stopPropagation();
      triggerBtn.disabled = true;
      triggerBtn.textContent = '已生成';
      forceShowLocalItGapStartBlock();
      renderProblemDetailContent();
    }
  });
}
if (el.problemDetailChatSend) {
  el.problemDetailChatSend.addEventListener('click', handleProblemDetailChatSend);
}
if (el.problemDetailChatInput) {
  el.problemDetailChatInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleProblemDetailChatSend();
    }
  });
}
if (el.toolsChatSend) el.toolsChatSend.addEventListener('click', handleToolsChatSend);
if (el.toolsChatInput) {
  el.toolsChatInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleToolsChatSend();
    }
  });
}
if (el.problemDetailChatMessages) {
  el.problemDetailChatMessages.addEventListener('click', (e) => {
    const deleteBtn = e.target.closest('.btn-delete-chat-msg');
    if (deleteBtn) {
      const msgBlock = deleteBtn.closest('[data-msg-index]');
      if (msgBlock) {
        const idx = parseInt(msgBlock.dataset.msgIndex, 10);
        if (!isNaN(idx) && idx >= 0 && idx < problemDetailChatMessages.length) {
          const msg = problemDetailChatMessages[idx];
          const isGlobalItGapMsg = msg?.type === 'globalItGapStartBlock' || msg?.type === 'globalItGapAnalysisCard' || msg?.type === 'globalItGapAnalysisLog';
          if (isGlobalItGapMsg && currentProblemDetailItem?.createdAt) {
            problemDetailChatMessages = problemDetailChatMessages.filter((m) => {
              const t = m.type;
              return t !== 'globalItGapStartBlock' && t !== 'globalItGapAnalysisCard' && t !== 'globalItGapAnalysisLog' && t !== 'localItGapStartBlock' && t !== 'localItGapSessionsBlock' && t !== 'localItGapAnalysisCard' && t !== 'localItGapAnalysisLog';
            });
            saveProblemDetailChat(currentProblemDetailItem.createdAt, problemDetailChatMessages);
            clearDigitalProblemGlobalItGapAnalysis(currentProblemDetailItem.createdAt);
            const list = getDigitalProblems();
            const updated = list.find((it) => it.createdAt === currentProblemDetailItem.createdAt);
            if (updated) currentProblemDetailItem = updated;
            const container = el.problemDetailChatMessages;
            container.innerHTML = '';
            renderProblemDetailChatFromStorage(container, problemDetailChatMessages);
            container.scrollTop = container.scrollHeight;
            renderProblemDetailContent();
            renderProblemDetailHistory();
            requestAnimationFrame(() => maybeShowGlobalItGapStartBlock());
            return;
          }
          const isPainPointStartBlock = msg?.type === 'painPointStartBlock';
          const isPainPointDoneMsg = msg?.role === 'system' && msg?.content === '痛点标注完成';
          const shouldRollbackPainPoint = (isPainPointStartBlock || isPainPointDoneMsg) && currentProblemDetailItem?.createdAt;
          if (shouldRollbackPainPoint) {
            rollbackValueStreamPainPoint(currentProblemDetailItem.createdAt);
            currentProblemDetailItem = {
              ...currentProblemDetailItem,
              valueStream: (() => {
                const vs = currentProblemDetailItem.valueStream;
                if (!vs || vs.raw) return vs;
                const rawStages = vs.stages ?? vs.phases ?? vs.nodes ?? [];
                if (!Array.isArray(rawStages)) return vs;
                const stages = rawStages.map((s) => {
                  if (!s || typeof s !== 'object') return s;
                  const rawSteps = s.steps ?? s.tasks ?? s.phases ?? s.items ?? [];
                  const steps = rawSteps.map((st) => {
                    if (typeof st !== 'object' || st == null) return st;
                    const { painPoint, pain_point, ...rest } = st;
                    return rest;
                  });
                  return { ...s, steps };
                });
                return { ...vs, stages };
              })(),
              workflowAlignCompletedStages: (currentProblemDetailItem.workflowAlignCompletedStages || []).filter((x) => x !== 2).sort((a, b) => a - b),
            };
            renderProblemDetailContent();
          }
          let spliceIdx = idx;
          if (isPainPointStartBlock && shouldRollbackPainPoint) {
            let lastDoneIdx = -1;
            for (let i = problemDetailChatMessages.length - 1; i >= 0; i--) {
              const m = problemDetailChatMessages[i];
              if (m?.role === 'system' && m?.content === '痛点标注完成') {
                lastDoneIdx = i;
                break;
              }
            }
            if (lastDoneIdx >= 0) problemDetailChatMessages.splice(lastDoneIdx, 1);
            spliceIdx = lastDoneIdx >= 0 && lastDoneIdx < idx ? idx - 1 : idx;
          }
          problemDetailChatMessages.splice(spliceIdx, 1);
          saveProblemDetailChat(currentProblemDetailItem?.createdAt, problemDetailChatMessages);
          const container = el.problemDetailChatMessages;
          container.innerHTML = '';
          renderProblemDetailChatFromStorage(container, problemDetailChatMessages);
          container.scrollTop = container.scrollHeight;
          requestAnimationFrame(() => {
            maybeShowBmcStartBlock();
            maybeShowRequirementLogicStartBlock();
            maybeShowValueStreamStartBlock();
            maybeShowItStatusStartBlock();
            maybeShowPainPointStartBlock();
          });
        }
      }
      return;
    }
    const startItStatusBtn = e.target.closest('.btn-confirm-start-it-status');
    if (startItStatusBtn && !startItStatusBtn.disabled) {
      startItStatusBtn.disabled = true;
      startItStatusBtn.textContent = '已确认';
      let idx = problemDetailChatMessages.findIndex((m) => m.type === 'itStatusStartBlock');
      if (idx >= 0) {
        problemDetailChatMessages[idx] = { ...problemDetailChatMessages[idx], confirmed: true };
        saveProblemDetailChat(currentProblemDetailItem?.createdAt, problemDetailChatMessages);
      }
      runItStatusAnnotation();
      return;
    }
    const startPainPointBtn = e.target.closest('.btn-confirm-start-pain-point');
    if (startPainPointBtn && !startPainPointBtn.disabled) {
      startPainPointBtn.disabled = true;
      startPainPointBtn.textContent = '已确认';
      let idx = problemDetailChatMessages.findIndex((m) => m.type === 'painPointStartBlock');
      if (idx >= 0) {
        problemDetailChatMessages[idx] = { ...problemDetailChatMessages[idx], confirmed: true };
        saveProblemDetailChat(currentProblemDetailItem?.createdAt, problemDetailChatMessages);
      }
      runPainPointAnnotation();
      return;
    }
    const confirmE2eExtractBtn = e.target.closest('.btn-confirm-e2e-extract');
    if (confirmE2eExtractBtn && !confirmE2eExtractBtn.disabled) {
      const item = currentProblemDetailItem;
      const valueStream = item?.valueStream;
      if (!valueStream || valueStream.raw) return;
      let idx = problemDetailChatMessages.findIndex((m) => m.type === 'e2eFlowExtractStartBlock');
      if (idx >= 0) {
        problemDetailChatMessages[idx] = { ...problemDetailChatMessages[idx], confirmed: true };
        saveProblemDetailChat(item?.createdAt, problemDetailChatMessages);
      }
      confirmE2eExtractBtn.disabled = true;
      confirmE2eExtractBtn.textContent = '已确认';
      pushAndSaveProblemDetailChat({ role: 'user', content: '确认', timestamp: getTimeStr() });
      const container = el.problemDetailChatMessages;
      const jsonStr = escapeHtml(JSON.stringify(valueStream, null, 2));
      const dataAttr = String(JSON.stringify(valueStream)).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
      const jsonBlock = document.createElement('div');
      jsonBlock.className = 'problem-detail-chat-msg problem-detail-chat-msg-system problem-detail-chat-e2e-json-block problem-detail-chat-msg-with-delete';
      jsonBlock.dataset.msgIndex = String(problemDetailChatMessages.length);
      jsonBlock.innerHTML = `
        <button type="button" class="btn-delete-chat-msg" aria-label="删除">${DELETE_CHAT_MSG_ICON}</button>
        <div class="problem-detail-chat-e2e-json-wrap">
          <div class="problem-detail-chat-e2e-json-header">端到端流程 JSON 数据</div>
          <pre class="problem-detail-chat-json-pre">${jsonStr}</pre>
          <div class="problem-detail-chat-e2e-json-actions">
            <button type="button" class="btn-confirm-e2e-json" data-json="${dataAttr}">确认</button>
          </div>
        </div>
        <div class="problem-detail-chat-msg-time">${getTimeStr()}</div>`;
      container.appendChild(jsonBlock);
      pushAndSaveProblemDetailChat({ type: 'e2eFlowJsonBlock', valueStreamJson: valueStream, timestamp: getTimeStr(), confirmed: false });
      container.scrollTop = container.scrollHeight;
      renderProblemDetailHistory();
      return;
    }
    const confirmE2eJsonBtn = e.target.closest('.btn-confirm-e2e-json');
    if (confirmE2eJsonBtn && !confirmE2eJsonBtn.disabled) {
      try {
        const valueStream = JSON.parse(confirmE2eJsonBtn.dataset.json);
        const item = currentProblemDetailItem;
        let idx = problemDetailChatMessages.findIndex((m) => m.type === 'e2eFlowJsonBlock');
        if (idx >= 0) {
          problemDetailChatMessages[idx] = { ...problemDetailChatMessages[idx], valueStreamJson: valueStream, confirmed: true };
          saveProblemDetailChat(item?.createdAt, problemDetailChatMessages);
        }
        confirmE2eJsonBtn.disabled = true;
        confirmE2eJsonBtn.textContent = '已确认';
        pushAndSaveProblemDetailChat({ role: 'user', content: '确认', timestamp: getTimeStr() });
        pushAndSaveProblemDetailChat({ type: 'e2eFlowGeneratedLog', content: '已生成端到端流程 JSON 数据', timestamp: getTimeStr(), taskLabel: '端到端流程绘制', valueStreamJson: valueStream });
        const container = el.problemDetailChatMessages;
        container.innerHTML = '';
        renderProblemDetailChatFromStorage(container, problemDetailChatMessages);
        container.scrollTop = container.scrollHeight;
        renderProblemDetailHistory();
      } catch (_) {}
      return;
    }
    const startGlobalItGapBtn = e.target.closest('.btn-confirm-start-global-itgap');
    if (startGlobalItGapBtn && !startGlobalItGapBtn.disabled) {
      startGlobalItGapBtn.disabled = true;
      startGlobalItGapBtn.textContent = '已确认';
      const item = currentProblemDetailItem;
      let idx = problemDetailChatMessages.findIndex((m) => m.type === 'globalItGapStartBlock');
      if (idx >= 0) {
        problemDetailChatMessages[idx] = { ...problemDetailChatMessages[idx], confirmed: true };
        saveProblemDetailChat(item?.createdAt, problemDetailChatMessages);
      }
      requestAnimationFrame(() => runGlobalItGapAnalysis(false));
      return;
    }
    const confirmGlobalItGapJsonBtn = e.target.closest('.btn-confirm-global-itgap-json');
    if (confirmGlobalItGapJsonBtn && confirmGlobalItGapJsonBtn.dataset.json && !confirmGlobalItGapJsonBtn.disabled) {
      try {
        const analysisJson = JSON.parse(confirmGlobalItGapJsonBtn.dataset.json);
        const item = currentProblemDetailItem;
        let idx = problemDetailChatMessages.findIndex((m) => m.type === 'globalItGapAnalysisCard');
        if (idx >= 0) {
          problemDetailChatMessages[idx] = { ...problemDetailChatMessages[idx], data: analysisJson, structuredView: true };
          saveProblemDetailChat(item?.createdAt, problemDetailChatMessages);
        }
        const container = el.problemDetailChatMessages;
        container.innerHTML = '';
        renderProblemDetailChatFromStorage(container, problemDetailChatMessages);
        container.scrollTop = container.scrollHeight;
      } catch (_) {}
      return;
    }
    const confirmGlobalItGapStructuredBtn = e.target.closest('.btn-confirm-global-itgap-structured');
    if (confirmGlobalItGapStructuredBtn && confirmGlobalItGapStructuredBtn.dataset.json && !confirmGlobalItGapStructuredBtn.disabled) {
      try {
        const analysisJson = JSON.parse(confirmGlobalItGapStructuredBtn.dataset.json);
        const item = currentProblemDetailItem;
        let idx = problemDetailChatMessages.findIndex((m) => m.type === 'globalItGapAnalysisCard');
        if (idx >= 0) {
          problemDetailChatMessages[idx] = { ...problemDetailChatMessages[idx], data: analysisJson, confirmed: true };
          saveProblemDetailChat(item?.createdAt, problemDetailChatMessages);
        }
        confirmGlobalItGapStructuredBtn.disabled = true;
        confirmGlobalItGapStructuredBtn.textContent = '已确认';
        updateDigitalProblemGlobalItGapAnalysis(item.createdAt, analysisJson);
        currentProblemDetailItem = { ...item, globalItGapAnalysisJson: analysisJson };
        pushAndSaveProblemDetailChat({ type: 'globalItGapAnalysisLog', content: '已生成全局 ITGap 分析', timestamp: getTimeStr(), taskLabel: '全局 ITGap 分析', analysisJson });
        renderProblemDetailContent();
        const container = el.problemDetailChatMessages;
        container.innerHTML = '';
        renderProblemDetailChatFromStorage(container, problemDetailChatMessages);
        container.scrollTop = container.scrollHeight;
        renderProblemDetailHistory();
      } catch (_) {}
      return;
    }
    const redoGlobalItGapBtn = e.target.closest('.btn-redo-global-itgap');
    if (redoGlobalItGapBtn && !redoGlobalItGapBtn.disabled) {
      requestAnimationFrame(() => runGlobalItGapAnalysis(true));
      return;
    }
    const startLocalItGapBtn = e.target.closest('.btn-confirm-start-local-itgap');
    if (startLocalItGapBtn && !startLocalItGapBtn.disabled) {
      startLocalItGapBtn.disabled = true;
      startLocalItGapBtn.textContent = '已确认';
      const item = currentProblemDetailItem;
      const valueStream = resolveValueStreamForItGap(item);
      if (!valueStream || valueStream.raw) return;
      const sessions = generateLocalItGapSessions(valueStream);
      updateDigitalProblemLocalItGapSessions(item.createdAt, sessions);
      currentProblemDetailItem = { ...item, localItGapSessions: sessions };
      let idx = problemDetailChatMessages.findIndex((m) => m.type === 'localItGapStartBlock');
      if (idx >= 0) {
        problemDetailChatMessages[idx] = { ...problemDetailChatMessages[idx], confirmed: true };
        saveProblemDetailChat(item?.createdAt, problemDetailChatMessages);
      }
      pushAndSaveProblemDetailChat({ type: 'localItGapSessionsBlock', sessions, timestamp: getTimeStr() });
      const container = el.problemDetailChatMessages;
      container.innerHTML = '';
      renderProblemDetailChatFromStorage(container, problemDetailChatMessages);
      container.scrollTop = container.scrollHeight;
      renderProblemDetailHistory();
      return;
    }
    const confirmLocalItGapSessionsBtn = e.target.closest('.btn-confirm-local-itgap-sessions');
    if (confirmLocalItGapSessionsBtn && !confirmLocalItGapSessionsBtn.disabled) {
      const item = currentProblemDetailItem;
      const sessionsIdx = problemDetailChatMessages.findIndex((m) => m.type === 'localItGapSessionsBlock');
      if (sessionsIdx >= 0) {
        problemDetailChatMessages[sessionsIdx] = { ...problemDetailChatMessages[sessionsIdx], confirmed: true };
        saveProblemDetailChat(item?.createdAt, problemDetailChatMessages);
      }
      confirmLocalItGapSessionsBtn.disabled = true;
      confirmLocalItGapSessionsBtn.textContent = '已确认';
      const container = el.problemDetailChatMessages;
      container.innerHTML = '';
      renderProblemDetailChatFromStorage(container, problemDetailChatMessages);
      container.scrollTop = container.scrollHeight;
      renderProblemDetailContent();
      renderProblemDetailHistory();
      requestAnimationFrame(() => runLocalItGapAnalysisForNextStep());
      return;
    }
    const continueLocalItGapSessionsBtn = e.target.closest('.btn-continue-local-itgap-sessions');
    if (continueLocalItGapSessionsBtn && !continueLocalItGapSessionsBtn.disabled) {
      requestAnimationFrame(() => runLocalItGapAnalysisForNextStep());
      return;
    }
    const confirmLocalItGapBtn = e.target.closest('.btn-confirm-local-itgap');
    if (confirmLocalItGapBtn && confirmLocalItGapBtn.dataset.json && !confirmLocalItGapBtn.disabled) {
      try {
        const analysisJson = JSON.parse(confirmLocalItGapBtn.dataset.json);
        const stepName = confirmLocalItGapBtn.dataset.stepName || '';
        const stepIndex = parseInt(confirmLocalItGapBtn.dataset.stepIndex, 10);
        const item = currentProblemDetailItem;
        let idx = problemDetailChatMessages.findIndex((m) => m.type === 'localItGapAnalysisCard' && m.stepIndex === stepIndex);
        if (idx >= 0) {
          problemDetailChatMessages[idx] = { ...problemDetailChatMessages[idx], data: analysisJson, confirmed: true };
          saveProblemDetailChat(item?.createdAt, problemDetailChatMessages);
        }
        confirmLocalItGapBtn.disabled = true;
        confirmLocalItGapBtn.textContent = '已确认';
        const analysisMarkdown = buildLocalItGapMarkdown(analysisJson);
        updateDigitalProblemLocalItGapAnalysis(item.createdAt, stepName, stepIndex, analysisJson, analysisMarkdown);
        const list = getDigitalProblems();
        const updated = list.find((it) => it.createdAt === item.createdAt);
        if (updated) currentProblemDetailItem = updated;
        pushAndSaveProblemDetailChat({ type: 'localItGapAnalysisLog', content: `已生成环节「${stepName}」的局部 ITGap 分析`, timestamp: getTimeStr(), taskLabel: '局部 ITGap 分析', stepName, stepIndex, analysisJson });
        renderProblemDetailContent();
        const container = el.problemDetailChatMessages;
        container.innerHTML = '';
        renderProblemDetailChatFromStorage(container, problemDetailChatMessages);
        container.scrollTop = container.scrollHeight;
        renderProblemDetailHistory();
        const { stages } = parseValueStreamGraph(item.valueStream);
        const allSteps = stages.flatMap((s) => s.steps);
        if (allSteps.length > stepIndex + 1) {
          requestAnimationFrame(() => runLocalItGapAnalysisForNextStep());
        } else {
          requestAnimationFrame(() => maybeShowItStrategyPlanStartBlock());
        }
      } catch (_) {}
      return;
    }
    const startItStrategyPlanBtn = e.target.closest('.btn-confirm-start-it-strategy-plan');
    if (startItStrategyPlanBtn && !startItStrategyPlanBtn.disabled) {
      startItStrategyPlanBtn.disabled = true;
      startItStrategyPlanBtn.textContent = '已确认';
      const item = currentProblemDetailItem;
      let idx = problemDetailChatMessages.findIndex((m) => m.type === 'itStrategyPlanStartBlock');
      if (idx >= 0) {
        problemDetailChatMessages[idx] = { ...problemDetailChatMessages[idx], confirmed: true };
        saveProblemDetailChat(item?.createdAt, problemDetailChatMessages);
      }
      if (item?.createdAt) {
        updateDigitalProblemMajorStage(item.createdAt, 3);
        currentProblemDetailItem = { ...item, currentMajorStage: 3 };
        problemDetailViewingMajorStage = 3;
        itStrategyPlanViewingSubstep = 0;
        updateProblemDetailProgressStages(3, 3);
        renderProblemDetailContent();
      }
      return;
    }
    const startItGapBtn = e.target.closest('.btn-confirm-start-it-gap');
    if (startItGapBtn && !startItGapBtn.disabled) {
      startItGapBtn.disabled = true;
      startItGapBtn.textContent = '已确认';
      let idx = problemDetailChatMessages.findIndex((m) => m.type === 'itGapStartBlock');
      if (idx >= 0) {
        problemDetailChatMessages[idx] = { ...problemDetailChatMessages[idx], confirmed: true };
        saveProblemDetailChat(currentProblemDetailItem?.createdAt, problemDetailChatMessages);
      }
      const item = currentProblemDetailItem;
      if (item?.createdAt) {
        updateDigitalProblemMajorStage(item.createdAt, 2);
        updateDigitalProblemItGapCompletedStages(item.createdAt, [0]);
        currentProblemDetailItem = { ...item, currentMajorStage: 2, itGapCompletedStages: [0] };
        problemDetailViewingMajorStage = 2;
        updateProblemDetailProgressStages(2, problemDetailViewingMajorStage);
        renderProblemDetailContent();
      }
      return;
    }
    const startValueStreamBtn = e.target.closest('.btn-confirm-start-value-stream');
    if (startValueStreamBtn && !startValueStreamBtn.disabled) {
      startValueStreamBtn.disabled = true;
      startValueStreamBtn.textContent = '已确认';
      let idx = problemDetailChatMessages.findIndex((m) => m.type === 'valueStreamStartBlock');
      if (idx >= 0) {
        problemDetailChatMessages[idx] = { ...problemDetailChatMessages[idx], confirmed: true };
        saveProblemDetailChat(currentProblemDetailItem?.createdAt, problemDetailChatMessages);
      }
      runValueStreamGeneration();
      return;
    }
    const startReqLogicBtn = e.target.closest('.btn-confirm-start-requirement-logic');
    if (startReqLogicBtn && !startReqLogicBtn.disabled) {
      startReqLogicBtn.disabled = true;
      startReqLogicBtn.textContent = '已确认';
      let idx = problemDetailChatMessages.findIndex((m) => m.type === 'requirementLogicStartBlock');
      if (idx >= 0) {
        problemDetailChatMessages[idx] = { ...problemDetailChatMessages[idx], confirmed: true };
        saveProblemDetailChat(currentProblemDetailItem?.createdAt, problemDetailChatMessages);
      }
      runRequirementLogicConstruction();
      return;
    }
    const startBmcBtn = e.target.closest('.btn-confirm-start-bmc');
    if (startBmcBtn && !startBmcBtn.disabled) {
      startBmcBtn.disabled = true;
      startBmcBtn.textContent = '已确认';
      let idx = problemDetailChatMessages.findIndex((m) => m.type === 'bmcStartBlock');
      if (idx >= 0) {
        problemDetailChatMessages[idx] = { ...problemDetailChatMessages[idx], confirmed: true };
        saveProblemDetailChat(currentProblemDetailItem?.createdAt, problemDetailChatMessages);
      }
      runBmcGeneration();
      return;
    }
    const valueStreamBtn = e.target.closest('.btn-confirm-value-stream');
    if (valueStreamBtn && valueStreamBtn.dataset.json && !valueStreamBtn.disabled) {
      try {
        const valueStream = JSON.parse(valueStreamBtn.dataset.json);
        let idx = -1;
        for (let i = problemDetailChatMessages.length - 1; i >= 0; i--) {
          if (problemDetailChatMessages[i].type === 'valueStreamCard') {
            idx = i;
            break;
          }
        }
        if (idx >= 0) {
          problemDetailChatMessages[idx] = { ...problemDetailChatMessages[idx], data: valueStream, confirmed: true };
          saveProblemDetailChat(currentProblemDetailItem?.createdAt, problemDetailChatMessages);
        }
        valueStreamBtn.textContent = '已确认';
        valueStreamBtn.disabled = true;
        const hasDrawStart = problemDetailChatMessages.some((m) => m.type === 'drawValueStreamStartBlock');
        if (!hasDrawStart) {
          const drawBlock = document.createElement('div');
          drawBlock.className = 'problem-detail-chat-msg problem-detail-chat-msg-system problem-detail-chat-draw-value-stream-start';
          drawBlock.innerHTML = `
            <div class="problem-detail-chat-msg-content-wrap">
              <div class="problem-detail-chat-msg-content">开始绘制价值流图</div>
              <div class="problem-detail-chat-draw-value-stream-start-actions">
                <button type="button" class="btn-confirm-draw-value-stream" data-json="${String(JSON.stringify(valueStream)).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;')}">确认</button>
              </div>
            </div>
            <div class="problem-detail-chat-msg-time">${getTimeStr()}</div>`;
          el.problemDetailChatMessages?.appendChild(drawBlock);
          pushAndSaveProblemDetailChat({ type: 'drawValueStreamStartBlock', data: valueStream, timestamp: getTimeStr() });
          el.problemDetailChatMessages.scrollTop = el.problemDetailChatMessages.scrollHeight;
        }
      } catch (_) {}
      return;
    }
    const drawValueStreamBtn = e.target.closest('.btn-confirm-draw-value-stream');
    if (drawValueStreamBtn && drawValueStreamBtn.dataset.json && !drawValueStreamBtn.disabled) {
      try {
        const valueStream = JSON.parse(drawValueStreamBtn.dataset.json);
        const item = currentProblemDetailItem;
        if (item?.createdAt) {
          pushOperationToHistory(item.createdAt, 'valueStreamDraw', JSON.parse(JSON.stringify(item)), problemDetailChatMessages.length);
          updateDigitalProblemValueStream(item.createdAt, valueStream);
          currentProblemDetailItem = { ...item, valueStream, workflowAlignCompletedStages: [...(item.workflowAlignCompletedStages || []).filter((x) => x !== 0), 0].sort((a, b) => a - b) };
        }
        drawValueStreamBtn.textContent = '已确认';
        drawValueStreamBtn.disabled = true;
        const drawIdx = problemDetailChatMessages.findIndex((m) => m.type === 'drawValueStreamStartBlock');
        if (drawIdx >= 0) {
          problemDetailChatMessages[drawIdx] = { ...problemDetailChatMessages[drawIdx], confirmed: true };
          saveProblemDetailChat(currentProblemDetailItem?.createdAt, problemDetailChatMessages);
        }
        renderProblemDetailContent();
        requestAnimationFrame(() => {
          maybeShowItStatusStartBlock();
          maybeShowPainPointStartBlock();
        });
      } catch (_) {}
      return;
    }
    const bmcBtn = e.target.closest('.btn-confirm-bmc');
    if (bmcBtn && bmcBtn.dataset.json) {
      try {
        const bmc = JSON.parse(bmcBtn.dataset.json);
        const item = currentProblemDetailItem;
        if (item?.createdAt) {
          updateDigitalProblemBmc(item.createdAt, bmc);
          const completed = item.completedStages || [];
          if (!completed.includes(1)) completed.push(1);
          completed.sort((a, b) => a - b);
          currentProblemDetailItem = { ...item, bmc, completedStages: completed };
        }
        let idx = -1;
        for (let i = problemDetailChatMessages.length - 1; i >= 0; i--) {
          if (problemDetailChatMessages[i].type === 'bmcCard') {
            idx = i;
            break;
          }
        }
        if (idx >= 0) {
          problemDetailChatMessages[idx] = { ...problemDetailChatMessages[idx], data: bmc, confirmed: true };
          saveProblemDetailChat(item?.createdAt, problemDetailChatMessages);
        }
        renderProblemDetailContent();
        bmcBtn.textContent = '已确认';
        bmcBtn.disabled = true;
        requestAnimationFrame(() => {
          maybeShowRequirementLogicStartBlock();
          maybeShowValueStreamStartBlock();
          maybeShowItStatusStartBlock();
          maybeShowPainPointStartBlock();
        });
      } catch (_) {}
      return;
    }
    const rejectBtn = e.target.closest('.btn-reject-intent-extraction');
    if (rejectBtn) {
      const cardBlock = rejectBtn.closest('.problem-detail-chat-intent-card');
      if (cardBlock && cardBlock.dataset.msgIndex != null) {
        const idx = parseInt(cardBlock.dataset.msgIndex, 10);
        const userText = (rejectBtn.dataset.userText || '').replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>');
        if (!isNaN(idx) && idx >= 0 && idx < problemDetailChatMessages.length && userText) {
          const item = currentProblemDetailItem;
          const createdAt = item?.createdAt;
          const { context: contextStr } = buildIntentExtractionContext(createdAt, item);
          const inner = cardBlock.querySelector('.problem-detail-intent-card-inner');
          if (inner) {
            inner.innerHTML = `<div class="problem-detail-chat-parsing-inner"><span class="problem-detail-chat-spinner"></span><span class="problem-detail-chat-msg-content">正在全局重新匹配任务…</span></div>`;
          }
          (async () => {
            try {
              const result = await extractUserIntentFromChat(userText, contextStr, { globalScope: true });
              const { _llmMeta, ...extracted } = result;
              problemDetailChatMessages[idx] = { role: 'system', type: 'intentExtractionCard', data: extracted, userText, timestamp: getTimeStr(), confirmed: false, llmMeta: _llmMeta };
              saveProblemDetailChat(createdAt, problemDetailChatMessages);
              const container = el.problemDetailChatMessages;
              container.innerHTML = '';
              renderProblemDetailChatFromStorage(container, problemDetailChatMessages);
              container.scrollTop = container.scrollHeight;
              focusWorkspaceOnIntent(extracted);
            } catch (err) {
              problemDetailChatMessages[idx] = { role: 'system', content: '重新提炼失败：' + (err.message || String(err)), timestamp: getTimeStr() };
              saveProblemDetailChat(createdAt, problemDetailChatMessages);
              const container = el.problemDetailChatMessages;
              container.innerHTML = '';
              renderProblemDetailChatFromStorage(container, problemDetailChatMessages);
              container.scrollTop = container.scrollHeight;
            }
          })();
        }
      }
      return;
    }
    const intentBtn = e.target.closest('.btn-confirm-intent-extraction');
    if (intentBtn && intentBtn.dataset.extracted && !intentBtn.disabled) {
      try {
        const extracted = JSON.parse(intentBtn.dataset.extracted);
        const userText = (intentBtn.dataset.userText || '').replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>');
        let idx = -1;
        for (let i = problemDetailChatMessages.length - 1; i >= 0; i--) {
          if (problemDetailChatMessages[i].type === 'intentExtractionCard') {
            idx = i;
            break;
          }
        }
        if (idx >= 0) {
          problemDetailChatMessages[idx] = { ...problemDetailChatMessages[idx], data: extracted, userText, confirmed: true };
          saveProblemDetailChat(currentProblemDetailItem?.createdAt, problemDetailChatMessages);
        }
        intentBtn.textContent = '已确认';
        intentBtn.disabled = true;
        renderProblemDetailHistory();
        if (extracted.intent === 'execute' && extracted.executeTaskId) {
          const runMap = {
            task2: runBmcGeneration,
            task3: runRequirementLogicConstruction,
            task4: runValueStreamGeneration,
            task5: runItStatusAnnotation,
            task6: () => runPainPointAnnotation(true),
          };
          const run = runMap[extracted.executeTaskId];
          if (run) requestAnimationFrame(() => run());
        }
        if (extracted.intent === 'query') {
          const item = currentProblemDetailItem;
          const container = el.problemDetailChatMessages;
          const parsingBlock = document.createElement('div');
          parsingBlock.className = 'problem-detail-chat-msg problem-detail-chat-msg-system problem-detail-chat-msg-parsing';
          parsingBlock.innerHTML = `<div class="problem-detail-chat-msg-content-wrap"><div class="problem-detail-chat-parsing-inner"><span class="problem-detail-chat-spinner"></span><span class="problem-detail-chat-msg-content">正在查询…</span></div></div><div class="problem-detail-chat-msg-time">${getTimeStr()}</div>`;
          container?.appendChild(parsingBlock);
          container.scrollTop = container.scrollHeight;
          requestAnimationFrame(async () => {
            try {
              const { content, usage, model, durationMs } = await executeQueryIntent(extracted, item);
              parsingBlock.remove();
              const llmMeta = buildLlmMetaHtml({ usage, model, durationMs });
              const resultBlock = document.createElement('div');
              resultBlock.className = 'problem-detail-chat-msg problem-detail-chat-msg-system problem-detail-chat-msg-with-delete';
              resultBlock.dataset.msgIndex = String(problemDetailChatMessages.length);
              resultBlock.innerHTML = `<button type="button" class="btn-delete-chat-msg" aria-label="删除">${DELETE_CHAT_MSG_ICON}</button><div class="problem-detail-chat-msg-content-wrap"><div class="problem-detail-chat-msg-content markdown-body">${renderMarkdown(content)}</div></div><div class="problem-detail-chat-msg-time">${getTimeStr()}</div>${llmMeta}`;
              container?.appendChild(resultBlock);
              pushAndSaveProblemDetailChat({ role: 'system', content, timestamp: getTimeStr(), llmMeta: { usage, model, durationMs } });
              container.scrollTop = container.scrollHeight;
            } catch (err) {
              parsingBlock.classList.remove('problem-detail-chat-msg-parsing');
              parsingBlock.querySelector('.problem-detail-chat-msg-content-wrap').innerHTML = `<div class="problem-detail-chat-msg-content">查询失败：${escapeHtml(err.message || String(err))}</div>`;
              pushAndSaveProblemDetailChat({ role: 'system', content: '查询失败：' + (err.message || String(err)), timestamp: getTimeStr() });
            }
          });
        }
        if (extracted.intent === 'discussion') {
          const item = currentProblemDetailItem;
          const container = el.problemDetailChatMessages;
          const userText = (intentBtn.dataset.userText || '').replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>');
          const parsingBlock = document.createElement('div');
          parsingBlock.className = 'problem-detail-chat-msg problem-detail-chat-msg-system problem-detail-chat-msg-parsing';
          parsingBlock.innerHTML = `<div class="problem-detail-chat-msg-content-wrap"><div class="problem-detail-chat-parsing-inner"><span class="problem-detail-chat-spinner"></span><span class="problem-detail-chat-msg-content">正在讨论…</span></div></div><div class="problem-detail-chat-msg-time">${getTimeStr()}</div>`;
          container?.appendChild(parsingBlock);
          container.scrollTop = container.scrollHeight;
          requestAnimationFrame(async () => {
            try {
              const relatedTaskId = extracted.taskId || 'task1';
              const { content, usage, model, durationMs } = await executeDiscussionIntent(extracted, item, userText);
              parsingBlock.remove();
              const llmMeta = buildLlmMetaHtml({ usage, model, durationMs });
              const resultBlock = document.createElement('div');
              resultBlock.className = 'problem-detail-chat-msg problem-detail-chat-msg-system problem-detail-chat-msg-with-delete';
              resultBlock.dataset.msgIndex = String(problemDetailChatMessages.length);
              resultBlock.innerHTML = `<button type="button" class="btn-delete-chat-msg" aria-label="删除">${DELETE_CHAT_MSG_ICON}</button><div class="problem-detail-chat-msg-content-wrap"><div class="problem-detail-chat-msg-content markdown-body">${renderMarkdown(content)}</div></div><div class="problem-detail-chat-msg-time">${getTimeStr()}</div>${llmMeta}`;
              container?.appendChild(resultBlock);
              pushAndSaveProblemDetailChat({ role: 'system', content, timestamp: getTimeStr(), llmMeta: { usage, model, durationMs }, _taskId: relatedTaskId });
              container.scrollTop = container.scrollHeight;
              renderProblemDetailHistory();
            } catch (err) {
              parsingBlock.classList.remove('problem-detail-chat-msg-parsing');
              parsingBlock.querySelector('.problem-detail-chat-msg-content-wrap').innerHTML = `<div class="problem-detail-chat-msg-content">讨论失败：${escapeHtml(err.message || String(err))}</div>`;
              pushAndSaveProblemDetailChat({ role: 'system', content: '讨论失败：' + (err.message || String(err)), timestamp: getTimeStr() });
            }
          });
        }
        const isBasicInfoMod = extracted.intent === 'modification' && extracted.modificationTarget && (String(extracted.modificationTarget).includes('企业基本信息') || String(extracted.modificationTarget).includes('基本信息'));
        const isBasicInfoProvide = (extracted.intent === 'modification' || extracted.taskId === 'task1') && !problemDetailConfirmedBasicInfo;
        const isModificationWithLlm = extracted.intent === 'modification' && extracted.modificationClear === true && !isBasicInfoProvide;
        if (isModificationWithLlm) {
          const item = currentProblemDetailItem;
          const container = el.problemDetailChatMessages;
          const workspaceContainer = el.problemDetailContent;
          const taskId = extracted.taskId || '';
          const modTarget = String(extracted.modificationTarget || '');
          const isValueStreamMod = ['task4', 'task5', 'task6'].includes(taskId) || modTarget.includes('价值流') || modTarget.includes('环节') || modTarget.includes('痛点') || modTarget.includes('IT现状');
          const parsingBlock = document.createElement('div');
          parsingBlock.className = 'problem-detail-chat-msg problem-detail-chat-msg-system problem-detail-chat-msg-parsing';
          parsingBlock.innerHTML = `<div class="problem-detail-chat-msg-content-wrap"><div class="problem-detail-chat-parsing-inner"><span class="problem-detail-chat-spinner"></span><span class="problem-detail-chat-msg-content">正在综合修改…</span></div></div><div class="problem-detail-chat-msg-time">${getTimeStr()}</div>`;
          container?.appendChild(parsingBlock);
          container.scrollTop = container.scrollHeight;
          requestAnimationFrame(async () => {
            try {
              let applied = false;
              let usage = {};
              let model = DEEPSEEK_MODEL;
              let durationMs = 0;
              let positionDesc = '';
              if (isValueStreamMod && item?.valueStream && !item.valueStream.raw) {
                const multiResult = await analyzeMultiModificationForValueStream(extracted, item);
                if (multiResult && multiResult.updates.length > 0) {
                  parsingBlock.remove();
                  pushOperationToHistory(item.createdAt, 'modification', JSON.parse(JSON.stringify(item)), problemDetailChatMessages.length);
                  applied = applyValueStreamUpdates(item, multiResult.updates);
                  usage = multiResult.usage || {};
                  model = multiResult.model || DEEPSEEK_MODEL;
                  durationMs = multiResult.durationMs || 0;
                  positionDesc = `价值流 ${multiResult.updates.length} 处已分别更新`;
                }
              }
              if (!applied) {
                const positionInfo = getCurrentContentAtModificationTarget(extracted, item);
                if (positionInfo) {
                  if (!parsingBlock.parentNode) container?.appendChild(parsingBlock);
                  const singleResult = await executeModificationIntent(extracted, positionInfo);
                  parsingBlock.remove();
                  pushOperationToHistory(item.createdAt, 'modification', JSON.parse(JSON.stringify(item)), problemDetailChatMessages.length);
                  applied = applyModificationToWorkspace(extracted, singleResult.newContent, positionInfo, item);
                  usage = singleResult.usage || {};
                  model = singleResult.model || DEEPSEEK_MODEL;
                  durationMs = singleResult.durationMs || 0;
                  positionDesc = positionInfo.positionDesc;
                } else {
                  parsingBlock.remove();
                }
              }
              if (applied) {
                renderProblemDetailContent();
                workspaceContainer?.querySelectorAll('.modify-target-highlight').forEach((node) => node.classList.remove('modify-target-highlight'));
                const llmMeta = buildLlmMetaHtml({ usage, model, durationMs });
                const doneBlock = document.createElement('div');
                doneBlock.className = 'problem-detail-chat-msg problem-detail-chat-msg-system problem-detail-chat-msg-parsed';
                doneBlock.innerHTML = `<div class="problem-detail-chat-msg-content-wrap"><div class="problem-detail-chat-msg-content">修改已应用：${escapeHtml(positionDesc)}</div><span class="problem-detail-chat-check" aria-hidden="true">✅</span></div><div class="problem-detail-chat-msg-time">${getTimeStr()}</div>${llmMeta}`;
                container?.appendChild(doneBlock);
                pushAndSaveProblemDetailChat({ role: 'system', content: '修改已应用：' + positionDesc, timestamp: getTimeStr(), hasCheck: true, llmMeta: { usage, model, durationMs } });
              } else {
                const errBlock = document.createElement('div');
                errBlock.className = 'problem-detail-chat-msg problem-detail-chat-msg-system';
                errBlock.innerHTML = `<div class="problem-detail-chat-msg-content-wrap"><div class="problem-detail-chat-msg-content">修改应用失败：无法更新目标位置</div></div><div class="problem-detail-chat-msg-time">${getTimeStr()}</div>`;
                container?.appendChild(errBlock);
                pushAndSaveProblemDetailChat({ role: 'system', content: '修改应用失败：无法更新目标位置', timestamp: getTimeStr() });
              }
              container.scrollTop = container.scrollHeight;
            } catch (err) {
                parsingBlock.classList.remove('problem-detail-chat-msg-parsing');
                parsingBlock.querySelector('.problem-detail-chat-msg-content-wrap').innerHTML = `<div class="problem-detail-chat-msg-content">修改失败：${escapeHtml(err.message || String(err))}</div>`;
                pushAndSaveProblemDetailChat({ role: 'system', content: '修改失败：' + (err.message || String(err)), timestamp: getTimeStr() });
              }
            });
        }
        const lastUserMsg = problemDetailChatMessages.filter((m) => m.role === 'user').pop();
        const textToParse = (userText || lastUserMsg?.content || '').trim();
        const useBasicInfoParseFlow = (isBasicInfoMod || isBasicInfoProvide) && textToParse && (isBasicInfoProvide || extracted.modificationClear !== true);
        if (useBasicInfoParseFlow) {
          const item = currentProblemDetailItem;
          requestAnimationFrame(async () => {
            try {
              const { parsed } = await parseCompanyBasicInfoInput(textToParse);
              problemDetailConfirmedBasicInfo = parsed;
              if (item?.createdAt) {
                updateDigitalProblemBasicInfo(item.createdAt, parsed);
                const completed = item.completedStages || [];
                if (!completed.includes(0)) completed.push(0);
                completed.sort((a, b) => a - b);
                currentProblemDetailItem = { ...item, basicInfo: parsed, completedStages: completed };
              }
              const cardBlock = document.createElement('div');
              cardBlock.className = 'problem-detail-chat-msg problem-detail-chat-msg-system problem-detail-chat-card-collapsible';
              const labels = [
                { key: 'company_name', label: '公司名称' }, { key: 'credit_code', label: '信用代码' }, { key: 'legal_representative', label: '法人' },
                { key: 'established_date', label: '成立时间' }, { key: 'registered_capital', label: '注册资本' }, { key: 'is_listed', label: '是否上市' },
                { key: 'listing_location', label: '上市地' }, { key: 'business_scope', label: '经营范围' }, { key: 'core_qualifications', label: '核心资质' }, { key: 'official_website', label: '官方网站' },
              ];
              const rows = labels.map(({ key, label }) => {
                const value = (parsed[key] != null ? String(parsed[key]).trim() : '') || '—';
                return `<div class="problem-detail-basic-info-row"><span class="problem-detail-basic-info-label">${escapeHtml(label)}</span><span class="problem-detail-basic-info-value">${escapeHtml(value)}</span></div>`;
              }).join('');
              cardBlock.innerHTML = `<div class="problem-detail-basic-info-card" role="button" tabindex="0"><div class="problem-detail-basic-info-card-body">${rows}</div><div class="problem-detail-basic-info-card-actions"><button type="button" class="btn-confirm-basic-info" data-json="${String(JSON.stringify(parsed)).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;')}">确认</button></div></div><div class="problem-detail-chat-msg-time">${getTimeStr()}</div>`;
              el.problemDetailChatMessages?.appendChild(cardBlock);
              setupProblemDetailChatCardToggle(cardBlock);
              pushAndSaveProblemDetailChat({ role: 'system', type: 'basicInfoCard', data: parsed, timestamp: getTimeStr(), confirmed: false });
              renderProblemDetailContent();
              maybeShowBmcStartBlock();
            } catch (_) {}
          });
        }
      } catch (_) {}
      return;
    }
    const btn = e.target.closest('.btn-confirm-basic-info');
    if (btn && btn.dataset.json) {
      try {
        const data = JSON.parse(btn.dataset.json);
        problemDetailConfirmedBasicInfo = data;
        const item = currentProblemDetailItem;
        if (item?.createdAt) {
          updateDigitalProblemBasicInfo(item.createdAt, data);
          const completed = item.completedStages || [];
          if (!completed.includes(0)) completed.push(0);
          completed.sort((a, b) => a - b);
          currentProblemDetailItem = { ...item, basicInfo: data, completedStages: completed };
        }
        let idx = -1;
        for (let i = problemDetailChatMessages.length - 1; i >= 0; i--) {
          if (problemDetailChatMessages[i].type === 'basicInfoCard') {
            idx = i;
            break;
          }
        }
        if (idx >= 0) {
          problemDetailChatMessages[idx] = { ...problemDetailChatMessages[idx], data, confirmed: true };
          saveProblemDetailChat(item?.createdAt, problemDetailChatMessages);
        }
        renderProblemDetailContent();
        btn.textContent = '已确认';
        btn.disabled = true;
        requestAnimationFrame(() => maybeShowBmcStartBlock());
      } catch (_) {}
    }
  });
}
if (el.toolsChatMessages) {
  el.toolsChatMessages.addEventListener('click', (e) => {
    const confirmDiscussionBtn = e.target.closest('.btn-confirm-discussion-response');
    if (confirmDiscussionBtn && !confirmDiscussionBtn.disabled) {
      const card = confirmDiscussionBtn.closest('.tools-discussion-response-card');
      if (card) {
        const toolId = card.dataset.toolId;
        const body = card.querySelector('.tools-discussion-response-body');
        const content = body ? (body.innerText || body.textContent || '').trim() : '';
        if (toolId && content) {
          appendToolKnowledge(toolId, content);
          renderToolsKnowledge();
          const actions = card.querySelector('.tools-discussion-response-actions');
          if (actions) actions.remove();
          confirmDiscussionBtn.textContent = '已确认';
          confirmDiscussionBtn.disabled = true;
          saveToolsChatMessagesToStorage();
        }
      }
      return;
    }
    const redoDiscussionBtn = e.target.closest('.btn-redo-discussion-response');
    if (redoDiscussionBtn && !redoDiscussionBtn.disabled) {
      const card = redoDiscussionBtn.closest('.tools-discussion-response-card');
      if (card) {
        const toolId = card.dataset.toolId;
        const userContentEl = card.querySelector('.tools-discussion-user-content');
        const userContent = userContentEl ? (userContentEl.textContent || '').trim() : '';
        const body = card.querySelector('.tools-discussion-response-body');
        const actions = card.querySelector('.tools-discussion-response-actions');
        if (body && actions) {
          redoDiscussionBtn.disabled = true;
          const confirmBtn = card.querySelector('.btn-confirm-discussion-response');
          if (confirmBtn) confirmBtn.disabled = true;
          body.innerHTML = '<span class="tools-chat-msg-content">正在重新生成…</span>';
          (async () => {
            try {
              const { reply, _llmMeta } = await fetchToolDiscussionReply(toolId, userContent);
              body.innerHTML = renderMarkdown(reply || '');
              body.classList.add('markdown-body');
              const existingMeta = card.querySelector('.problem-detail-chat-msg-llm-meta');
              if (existingMeta) existingMeta.remove();
              const timeEl = card.querySelector('.tools-chat-msg-time');
              if (timeEl && _llmMeta) {
                const metaDiv = document.createElement('div');
                metaDiv.className = 'problem-detail-chat-msg-llm-meta';
                metaDiv.innerHTML = buildLlmMetaHtml(_llmMeta);
                timeEl.insertAdjacentElement('afterend', metaDiv);
              }
              saveToolsChatMessagesToStorage();
            } catch (err) {
              body.innerHTML = '<span class="tools-chat-msg-content">重做失败：' + escapeHtml(err.message || String(err)) + '</span>';
              saveToolsChatMessagesToStorage();
            } finally {
              redoDiscussionBtn.disabled = false;
              const confirmBtn2 = card.querySelector('.btn-confirm-discussion-response');
              if (confirmBtn2) confirmBtn2.disabled = false;
            }
          })();
        }
      }
      return;
    }

    const confirmModificationBtn = e.target.closest('.btn-confirm-modification-response');
    if (confirmModificationBtn && !confirmModificationBtn.disabled) {
      const card = confirmModificationBtn.closest('.tools-modification-response-card');
      if (card) {
        const toolId = card.dataset.toolId;
        const payloadEl = card.querySelector('.tools-modification-updates-payload');
        const payloadStr = payloadEl ? payloadEl.textContent : '';
        let updates = [];
        try {
          updates = JSON.parse(payloadStr || '[]');
        } catch (_) {}
        if (toolId && Array.isArray(updates) && updates.length > 0) {
          applyToolKnowledgeUpdates(toolId, updates);
          renderToolsKnowledge();
          const actions = card.querySelector('.tools-modification-response-actions');
          if (actions) actions.remove();
          confirmModificationBtn.textContent = '已确认';
          confirmModificationBtn.disabled = true;
          saveToolsChatMessagesToStorage();
        }
      }
      return;
    }
    const redoModificationBtn = e.target.closest('.btn-redo-modification-response');
    if (redoModificationBtn && !redoModificationBtn.disabled) {
      const card = redoModificationBtn.closest('.tools-modification-response-card');
      if (card) {
        const toolId = card.dataset.toolId;
        const userContentEl = card.querySelector('.tools-modification-user-content');
        const userContent = userContentEl ? (userContentEl.textContent || '').trim() : '';
        const body = card.querySelector('.tools-modification-response-body');
        const actions = card.querySelector('.tools-modification-response-actions');
        if (body && actions && toolId) {
          redoModificationBtn.disabled = true;
          const confirmBtn = card.querySelector('.btn-confirm-modification-response');
          if (confirmBtn) confirmBtn.disabled = true;
          body.innerHTML = '<span class="tools-chat-msg-content">正在重新生成修改方案…</span>';
          (async () => {
            try {
              const { updates, _llmMeta } = await fetchToolModificationUpdates(toolId, userContent);
              const topic = TOOL_KNOWLEDGE_ITEMS.find((t) => String(t.id) === String(toolId));
              const topicName = topic ? (topic.name || '该话题') : '该话题';
              if (!updates || updates.length === 0) {
                body.innerHTML = '<div class="tools-modification-response-body">未识别到需要修改的时间线节点。</div>';
              } else {
                const bodyParts = [
                  `<div class="tools-modification-topic">需要修改的话题：${escapeHtml(topicName)}</div>`,
                  ...updates.map(
                    (u) =>
                      `<div class="tools-modification-item"><div class="tools-modification-item-time">时间线节点时间戳：${escapeHtml(formatChatTime(u.createdAt))}</div><div class="tools-modification-item-content">${escapeHtml((u.content || '').trim() || '—')}</div></div>`
                  ),
                ];
                body.innerHTML = bodyParts.join('');
                const payloadEl = card.querySelector('.tools-modification-updates-payload');
                if (payloadEl) payloadEl.textContent = JSON.stringify(updates);
              }
              const existingMeta = card.querySelector('.problem-detail-chat-msg-llm-meta');
              if (existingMeta) existingMeta.remove();
              const timeEl = card.querySelector('.tools-chat-msg-time');
              if (timeEl && _llmMeta) {
                const metaDiv = document.createElement('div');
                metaDiv.className = 'problem-detail-chat-msg-llm-meta';
                metaDiv.innerHTML = buildLlmMetaHtml(_llmMeta);
                timeEl.insertAdjacentElement('afterend', metaDiv);
              }
              saveToolsChatMessagesToStorage();
            } catch (err) {
              body.innerHTML = '<span class="tools-chat-msg-content">重做失败：' + escapeHtml(err.message || String(err)) + '</span>';
              saveToolsChatMessagesToStorage();
            } finally {
              redoModificationBtn.disabled = false;
              const confirmBtn2 = card.querySelector('.btn-confirm-modification-response');
              if (confirmBtn2) confirmBtn2.disabled = false;
            }
          })();
        }
      }
      return;
    }

    const btn = e.target.closest('.btn-confirm-tool-intent');
    if (btn && !btn.disabled) {
      btn.textContent = '已确认';
      btn.disabled = true;
      const dataStr = btn.getAttribute('data-extracted') || '';
      try {
        const extracted = JSON.parse(dataStr);
        let intent = extracted.intent || '';
        let topicName = (extracted.newTopic || extracted.tool || '').trim();
        const note = (extracted.rawText || extracted.content || '').trim();
        const noteJson =
          extracted.contentJson && typeof extracted.contentJson === 'object'
            ? extracted.contentJson
            : null;

        // 允许用户在卡片顶部通过下拉框二次选择沟通意图 & 编辑讨论话题
        const card = btn.closest('.tools-intent-card');
        const selectEl = card && card.querySelector('.tools-intent-select');
        const topicInput = card && card.querySelector('.tools-topic-input');
        if (selectEl && selectEl.value) {
          intent = selectEl.value;
        }
        if (topicInput && typeof topicInput.value === 'string' && topicInput.value.trim()) {
          topicName = topicInput.value.trim();
        }
        if (!topicName) topicName = '自定义话题';

        // 先尝试按名称命中已存在的话题
        let target = TOOL_KNOWLEDGE_ITEMS.find(
          (t) => t.name && t.name.toLowerCase() === topicName.toLowerCase()
        );

        // 若不存在且原意图为「讨论」，则视为「新增」话题
        if (!target && intent === '讨论') {
          intent = '增加';
        }

        // 若不存在且意图为增加，则新增话题卡片；否则回退到当前选中话题
        if (!target) {
          if (intent === '增加') {
            const topicId = slugifyTopicName(topicName);
            target =
              TOOL_KNOWLEDGE_ITEMS.find((t) => String(t.id) === topicId) ||
              { id: topicId, name: topicName, description: '用户新增话题' };
            if (!TOOL_KNOWLEDGE_ITEMS.some((t) => String(t.id) === String(target.id))) {
              TOOL_KNOWLEDGE_ITEMS.push(target);
              saveToolKnowledgeItemsToStorage();
            }
          } else if (currentToolKnowledgeId) {
            target = TOOL_KNOWLEDGE_ITEMS.find((t) => String(t.id) === String(currentToolKnowledgeId)) || null;
          }
        }

        // 若意图为删除且命中话题，则删除对应话题及其时间线记录
        if (target && intent === '删除') {
          const targetId = target.id;
          const name = target.name || topicName || '未知话题';

          // 从话题列表中移除并持久化
          const idx = TOOL_KNOWLEDGE_ITEMS.findIndex((t) => String(t.id) === String(targetId));
          if (idx >= 0) {
            TOOL_KNOWLEDGE_ITEMS.splice(idx, 1);
            saveToolKnowledgeItemsToStorage();
          }

          // 删除对应时间线记录
          const state = getToolKnowledgeState();
          if (state && Object.prototype.hasOwnProperty.call(state, targetId)) {
            delete state[targetId];
            saveToolKnowledgeState(state);
          }

          // 调整当前选中话题
          if (String(currentToolKnowledgeId) === String(targetId)) {
            currentToolKnowledgeId = TOOL_KNOWLEDGE_ITEMS[0]?.id || '';
          }

          // 重新渲染话题列表
          renderToolsKnowledge();

          // 在聊天区记录删除结果
          if (el.toolsChatMessages) {
            const sysBlock = document.createElement('div');
            sysBlock.className = 'tools-chat-msg tools-chat-msg-system';
            sysBlock.innerHTML = `<div class="tools-chat-msg-content">已删除话题「${escapeHtml(
              name
            )}」及其时间线记录。</div><div class="tools-chat-msg-time">${getTimeStr()}</div>`;
            el.toolsChatMessages.appendChild(sysBlock);
            el.toolsChatMessages.scrollTop = el.toolsChatMessages.scrollHeight;
            saveToolsChatMessagesToStorage();
          }
          return;
        }

        // 意图为「修改」且命中已有话题：意图卡片内容+时间线作为上下文发往大模型，展示修改方案卡片（确认/重做）
        if (target && intent === '修改') {
          currentToolKnowledgeId = target.id;
          renderToolsKnowledge();
          const state = getToolKnowledgeState();
          const entries = Array.isArray(state[target.id]) ? state[target.id] : [];
          if (entries.length === 0) {
            if (el.toolsChatMessages) {
              const sysBlock = document.createElement('div');
              sysBlock.className = 'tools-chat-msg tools-chat-msg-system';
              sysBlock.innerHTML = `<div class="tools-chat-msg-content">该话题暂无时间线记录，无法执行修改。</div><div class="tools-chat-msg-time">${getTimeStr()}</div>`;
              el.toolsChatMessages.appendChild(sysBlock);
              el.toolsChatMessages.scrollTop = el.toolsChatMessages.scrollHeight;
              saveToolsChatMessagesToStorage();
            }
            return;
          }
          const loadingBlock = document.createElement('div');
          loadingBlock.className = 'tools-chat-msg tools-chat-msg-system';
          loadingBlock.innerHTML = `<div class="tools-chat-msg-content">正在根据沟通内容生成时间线修改方案…</div><div class="tools-chat-msg-time">${getTimeStr()}</div>`;
          el.toolsChatMessages.appendChild(loadingBlock);
          el.toolsChatMessages.scrollTop = el.toolsChatMessages.scrollHeight;
          saveToolsChatMessagesToStorage();
          (async () => {
            try {
              if (!DEEPSEEK_API_KEY) {
                loadingBlock.innerHTML = `<div class="tools-chat-msg-content">请在 main.js 中配置 DEEPSEEK_API_KEY。</div><div class="tools-chat-msg-time">${getTimeStr()}</div>`;
                return;
              }
              const { updates, _llmMeta } = await fetchToolModificationUpdates(target.id, note);
              loadingBlock.remove();
              const topicName = target.name || topicName || '该话题';
              if (!updates || updates.length === 0) {
                const emptyBlock = document.createElement('div');
                emptyBlock.className = 'tools-chat-msg tools-chat-msg-system';
                emptyBlock.innerHTML = `<div class="tools-chat-msg-content">未识别到需要修改的时间线节点。</div><div class="tools-chat-msg-time">${getTimeStr()}</div>`;
                el.toolsChatMessages.appendChild(emptyBlock);
                el.toolsChatMessages.scrollTop = el.toolsChatMessages.scrollHeight;
                saveToolsChatMessagesToStorage();
                return;
              }
              const llmMetaHtml = _llmMeta ? buildLlmMetaHtml(_llmMeta) : '';
              const updatesPayload = JSON.stringify(updates);
              const bodyParts = [
                `<div class="tools-modification-topic">需要修改的话题：${escapeHtml(topicName)}</div>`,
                ...updates.map(
                  (u) =>
                    `<div class="tools-modification-item"><div class="tools-modification-item-time">时间线节点时间戳：${escapeHtml(formatChatTime(u.createdAt))}</div><div class="tools-modification-item-content">${escapeHtml((u.content || '').trim() || '—')}</div></div>`
                ),
              ];
              const card = document.createElement('div');
              card.className = 'tools-chat-msg tools-chat-msg-system tools-modification-response-card';
              card.dataset.toolId = String(target.id);
              card.innerHTML = `<div class="tools-modification-user-content" aria-hidden="true" style="display:none">${escapeHtml(note || '')}</div><div class="tools-modification-response-body">${bodyParts.join('')}</div><div class="tools-modification-response-actions"><button type="button" class="btn-confirm-modification-response btn-confirm-primary">确认</button><button type="button" class="btn-redo-modification-response">重做</button></div><div class="tools-chat-msg-time">${getTimeStr()}</div>${llmMetaHtml}`;
              const payloadEl = document.createElement('div');
              payloadEl.className = 'tools-modification-updates-payload';
              payloadEl.hidden = true;
              payloadEl.textContent = updatesPayload;
              card.appendChild(payloadEl);
              el.toolsChatMessages.appendChild(card);
              el.toolsChatMessages.scrollTop = el.toolsChatMessages.scrollHeight;
              saveToolsChatMessagesToStorage();
            } catch (err) {
              loadingBlock.innerHTML = `<div class="tools-chat-msg-content">修改方案生成失败：${escapeHtml(err.message || String(err))}</div><div class="tools-chat-msg-time">${getTimeStr()}</div>`;
              saveToolsChatMessagesToStorage();
            }
          })();
          return;
        }

        // 意图为「讨论」且命中已有话题：先将意图卡片内容写入时间线，再发往大模型展示回复卡片（确认/重做）
        if (target && intent === '讨论') {
          currentToolKnowledgeId = target.id;
          if (note) appendToolKnowledge(target.id, note, noteJson, extracted.cardCreatedAt);
          renderToolsKnowledge();
          saveToolsChatMessagesToStorage();
          const loadingBlock = document.createElement('div');
          loadingBlock.className = 'tools-chat-msg tools-chat-msg-system';
          loadingBlock.innerHTML = `<div class="tools-chat-msg-content">正在结合该话题时间线知识生成讨论回复…</div><div class="tools-chat-msg-time">${getTimeStr()}</div>`;
          el.toolsChatMessages.appendChild(loadingBlock);
          el.toolsChatMessages.scrollTop = el.toolsChatMessages.scrollHeight;
          saveToolsChatMessagesToStorage();
          (async () => {
            try {
              if (!DEEPSEEK_API_KEY) {
                loadingBlock.innerHTML = `<div class="tools-chat-msg-content">请在 main.js 中配置 DEEPSEEK_API_KEY。</div><div class="tools-chat-msg-time">${getTimeStr()}</div>`;
                return;
              }
              const { reply, _llmMeta } = await fetchToolDiscussionReply(target.id, note);
              loadingBlock.remove();
              const llmMetaHtml = _llmMeta ? buildLlmMetaHtml(_llmMeta) : '';
              const userContentEscaped = escapeHtml(note || '');
              const replyHtml = renderMarkdown(reply || '');
              const card = document.createElement('div');
              card.className = 'tools-chat-msg tools-chat-msg-system tools-discussion-response-card';
              card.dataset.toolId = String(target.id);
              card.innerHTML = `<div class="tools-discussion-user-content" aria-hidden="true" style="display:none">${userContentEscaped}</div><div class="tools-discussion-response-body markdown-body">${replyHtml}</div><div class="tools-discussion-response-actions"><button type="button" class="btn-confirm-discussion-response btn-confirm-primary">确认</button><button type="button" class="btn-redo-discussion-response">重做</button></div><div class="tools-chat-msg-time">${getTimeStr()}</div>${llmMetaHtml}`;
              el.toolsChatMessages.appendChild(card);
              el.toolsChatMessages.scrollTop = el.toolsChatMessages.scrollHeight;
              saveToolsChatMessagesToStorage();
            } catch (err) {
              loadingBlock.innerHTML = `<div class="tools-chat-msg-content">讨论回复生成失败：${escapeHtml(err.message || String(err))}</div><div class="tools-chat-msg-time">${getTimeStr()}</div>`;
              saveToolsChatMessagesToStorage();
            }
          })();
          return;
        }

        if (target && note) {
          currentToolKnowledgeId = target.id;
          appendToolKnowledge(target.id, note, noteJson, extracted.cardCreatedAt);
          renderToolsKnowledge();
          saveToolsChatMessagesToStorage();

          // 若是从「讨论」自动转为新增话题，则将讨论内容再发给大模型整理，并将返回内容写入聊天区及时间线
          if (intent === '增加' && extracted.intent === '讨论') {
            (async () => {
              try {
                if (!DEEPSEEK_API_KEY) return;
                const { summary, _llmMeta } = await summarizeToolDiscussionContent(note);
                const finalSummary = (summary || '').trim();
                if (!finalSummary) return;
                appendToolKnowledge(target.id, finalSummary);
                renderToolsKnowledge();
                const sysBlock = document.createElement('div');
                sysBlock.className = 'tools-chat-msg tools-chat-msg-system';
                const llmMetaHtml = _llmMeta ? buildLlmMetaHtml(_llmMeta) : '';
                sysBlock.innerHTML = `<div class="tools-chat-msg-content">${escapeHtml(
                  finalSummary
                )}</div><div class="tools-chat-msg-time">${getTimeStr()}</div>${llmMetaHtml}`;
                el.toolsChatMessages?.appendChild(sysBlock);
                if (el.toolsChatMessages) {
                  el.toolsChatMessages.scrollTop = el.toolsChatMessages.scrollHeight;
                }
                saveToolsChatMessagesToStorage();
              } catch (_) {}
            })();
          }
        }
      } catch (_) {}
    }
  });
}

if (el.toolsDetailTimeline) {
  el.toolsDetailTimeline.addEventListener('click', (e) => {
    const tabBtn = e.target.closest('.tools-timeline-tab');
    if (tabBtn) {
      const container = tabBtn.closest('.tools-timeline-content');
      if (!container) return;
      const isJsonTab = tabBtn.dataset.tab === 'json';
      container.querySelectorAll('.tools-timeline-tab').forEach((btn) => {
        btn.classList.toggle('tools-timeline-tab-active', btn === tabBtn);
      });
      const textPanel = container.querySelector('.tools-timeline-panel-text');
      const jsonPanel = container.querySelector('.tools-timeline-panel-json');
      if (textPanel) textPanel.hidden = isJsonTab && !!jsonPanel;
      if (jsonPanel) jsonPanel.hidden = !isJsonTab;
      return;
    }

    const btn = e.target.closest('.tools-timeline-delete');
    if (!btn) return;
    const toolId =
      btn.getAttribute('data-tool-id') ||
      btn.closest('.tools-card')?.dataset.toolId ||
      currentToolKnowledgeId;
    const indexAttr =
      btn.getAttribute('data-entry-index') ||
      btn.closest('.tools-timeline-item')?.getAttribute('data-entry-index') ||
      '-1';
    const entryIndex = parseInt(indexAttr, 10);
    if (!toolId || isNaN(entryIndex) || entryIndex < 0) return;

    const state = getToolKnowledgeState();
    const list = Array.isArray(state[toolId]) ? state[toolId] : [];
    if (!list.length || entryIndex >= list.length) return;

    list.splice(entryIndex, 1);
    if (list.length > 0) {
      state[toolId] = list;
    } else {
      delete state[toolId];
    }
    saveToolKnowledgeState(state);
    renderToolsKnowledge();
  });
}

if (el.toolsDetail) {
  el.toolsDetail.addEventListener('click', (e) => {
    const tabBtn = e.target.closest('.tools-topic-tab');
    if (!tabBtn) return;
    const tab = tabBtn.dataset.tab;
    if (!tab) return;
    const timelinePanel = el.toolsDetailTimeline;
    const treePanel = el.toolsDetailTree;
    el.toolsDetail.querySelectorAll('.tools-topic-tab').forEach((btn) => {
      btn.classList.toggle('tools-topic-tab-active', btn === tabBtn);
    });
    if (timelinePanel) timelinePanel.hidden = tab !== 'timeline';
    if (treePanel) treePanel.hidden = tab !== 'tree';
  });
}

if (el.toolsList) {
  el.toolsList.addEventListener('click', (e) => {
    const itemBtn = e.target.closest('.tools-topic-item');
    if (!itemBtn) return;
    const toolId = itemBtn.dataset.toolId;
    if (!toolId) return;
    currentToolKnowledgeId = toolId;
    el.toolsList.querySelectorAll('.tools-topic-item').forEach((btn) => {
      btn.classList.toggle('tools-topic-item-active', btn === itemBtn);
    });
    renderToolsTopicDetail(toolId);
  });
}

async function handleToolsChatSend() {
  const input = el.toolsChatInput;
  const container = el.toolsChatMessages;
  if (!input || !container) return;
  const text = (input.value || '').trim();
  if (!text) return;
  input.value = '';

  const msgBlock = document.createElement('div');
  msgBlock.className = 'tools-chat-msg tools-chat-msg-user';
  msgBlock.innerHTML = `<div class="tools-chat-msg-content">${escapeHtml(text)}</div><div class="tools-chat-msg-time">${getTimeStr()}</div>`;
  container.appendChild(msgBlock);
  container.scrollTop = container.scrollHeight;
  saveToolsChatMessagesToStorage();

  // 然后调用大模型进行「工具/话题讨论意图管理」分析，生成结构化卡片
  const parsingBlock = document.createElement('div');
  parsingBlock.className = 'tools-chat-msg tools-chat-msg-system';
  parsingBlock.innerHTML = `<div class="tools-chat-msg-content">正在分析本次工具讨论的意图与对象…</div><div class="tools-chat-msg-time">${getTimeStr()}</div>`;
  container.appendChild(parsingBlock);
  container.scrollTop = container.scrollHeight;

  try {
    if (!DEEPSEEK_API_KEY) {
      throw new Error('请在 main.js 中配置 DEEPSEEK_API_KEY 才能使用工具/话题讨论意图管理功能。');
    }
    const result = await analyzeToolDiscussionIntent(text);
    parsingBlock.remove();
    let intent = result.intent || '';
    if (intent === '查询') intent = '讨论';
    const { tool, newTopic, content, contentJson, _llmMeta } = result;
    const intentLabel = intent || '—';
    const toolLabel = tool || '—';
    const extraTopic = newTopic || '';
    const rows = [
      { label: '沟通意图', value: intentLabel },
      { label: '讨论话题', value: intentLabel === '增加' ? (extraTopic || toolLabel || content || text) : toolLabel },
      { label: '沟通内容', value: content || text },
    ];
    const normalizedContentJson =
      contentJson && typeof contentJson === 'object' ? contentJson : null;
    if (normalizedContentJson) {
      rows.push({
        label: '沟通内容 JSON',
        value: JSON.stringify(normalizedContentJson, null, 2),
      });
    }
    const intentOptions = ['增加', '补充', '删除', '修改', '讨论'];
    const rowsHtml = rows
      .map((r) => {
        if (r.label === '沟通意图') {
          const selectHtml = `
        <select class="tools-intent-select">
          ${intentOptions
            .map(
              (opt) =>
                `<option value="${opt}"${opt === intentLabel ? ' selected' : ''}>${opt}</option>`
            )
            .join('')}
        </select>`;
          return `<div class="problem-detail-basic-info-row"><span class="problem-detail-basic-info-label">${escapeHtml(
            r.label
          )}</span><span class="problem-detail-basic-info-value">${selectHtml}</span></div>`;
        }
        if (r.label === '讨论话题') {
          const placeholder =
            intentLabel === '增加' ? '请输入或修改要新增的话题名称' : '请输入或修改本次讨论的话题名称';
          return `<div class="problem-detail-basic-info-row"><span class="problem-detail-basic-info-label">${escapeHtml(
            r.label
          )}</span><span class="problem-detail-basic-info-value"><input class="tools-topic-input" type="text" value="${escapeHtml(
            r.value || ''
          )}" placeholder="${escapeHtml(placeholder)}" /></span></div>`;
        }
        if (r.label === '沟通内容 JSON') {
          return `<div class="problem-detail-basic-info-row"><span class="problem-detail-basic-info-label">${escapeHtml(
            r.label
          )}</span><span class="problem-detail-basic-info-value"><pre class="tools-intent-json-pre">${escapeHtml(
            r.value || ''
          )}</pre></span></div>`;
        }
        return `<div class="problem-detail-basic-info-row"><span class="problem-detail-basic-info-label">${escapeHtml(
          r.label
        )}</span><span class="problem-detail-basic-info-value">${escapeHtml(r.value || '')}</span></div>`;
      })
      .join('');
    const cardBlock = document.createElement('div');
    cardBlock.className = 'tools-chat-msg tools-chat-msg-system tools-intent-card';
    const llmMetaHtml = _llmMeta ? buildLlmMetaHtml(_llmMeta) : '';
    const cardCreatedAt = new Date().toISOString();
    const dataAttr = String(
      JSON.stringify({
        intent: intentLabel,
        tool: toolLabel,
        newTopic: extraTopic,
        content: content || '',
        contentJson: normalizedContentJson || null,
        rawText: text,
        cardCreatedAt,
      })
    )
      .replace(
      /&/g,
      '&amp;'
    )
      .replace(/&/g, '&amp;')
      .replace(/"/g, '&quot;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
    cardBlock.innerHTML = `<div class="problem-detail-basic-info-card problem-detail-intent-card-inner">
  <div class="problem-detail-basic-info-card-body">${rowsHtml}</div>
  <div class="problem-detail-basic-info-card-actions">
    <button type="button" class="btn-confirm-tool-intent btn-confirm-primary" data-extracted="${dataAttr}">确认</button>
  </div>
</div><div class="tools-chat-msg-time">${formatChatTime(cardCreatedAt)}</div>${llmMetaHtml}`;
    container.appendChild(cardBlock);
    container.scrollTop = container.scrollHeight;
  saveToolsChatMessagesToStorage();
  } catch (err) {
    parsingBlock.remove();
    const errBlock = document.createElement('div');
    errBlock.className = 'tools-chat-msg tools-chat-msg-system';
    errBlock.innerHTML = `<div class="tools-chat-msg-content">工具/话题讨论意图分析失败：${escapeHtml(
      err.message || String(err)
    )}</div><div class="tools-chat-msg-time">${getTimeStr()}</div>`;
    container.appendChild(errBlock);
    container.scrollTop = container.scrollHeight;
    saveToolsChatMessagesToStorage();
  }
}
if (el.btnHome) el.btnHome.addEventListener('click', () => {
  saveChatToRecord();
  saveRouteState('home');
  switchView('home');
  renderProblemFollowList();
  if (el.searchSuggestions) { el.searchSuggestions.hidden = true; el.searchSuggestions.innerHTML = ''; }
});
if (el.btnTools) el.btnTools.addEventListener('click', () => {
  saveChatToRecord();
  saveRouteState('tools');
  renderToolsKnowledge();
  switchView('tools');
});
if (el.btnToolsBack) el.btnToolsBack.addEventListener('click', () => {
  saveRouteState('home');
  switchView('home');
});
if (el.btnChat) el.btnChat.addEventListener('click', () => toggleChatPanel(true));
if (el.btnCloseChat) el.btnCloseChat.addEventListener('click', () => toggleChatPanel(false));
if (el.btnHistory) el.btnHistory.addEventListener('click', () => toggleHistoryPanel(true));
if (el.btnCloseHistory) el.btnCloseHistory.addEventListener('click', () => toggleHistoryPanel(false));
if (el.chatSend) el.chatSend.addEventListener('click', sendChatMessage);
if (el.chatInput) el.chatInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    sendChatMessage();
  }
});

if (el.detailResult) {
  el.detailResult.addEventListener('click', (e) => {
    if (e.target.closest('.btn-basic-info-json')) {
      openBasicInfoJsonPanel();
    } else if (e.target.closest('.btn-bmc-json')) {
      openBmcJsonPanel();
    }
  });
}
if (el.btnCloseBasicInfoJson) {
  el.btnCloseBasicInfoJson.addEventListener('click', closeBasicInfoJsonPanel);
}
if (el.btnCopyBasicInfoJson) {
  el.btnCopyBasicInfoJson.addEventListener('click', copyBasicInfoJson);
}
if (el.btnCloseBmcJson) {
  el.btnCloseBmcJson.addEventListener('click', closeBmcJsonPanel);
}
if (el.btnCopyBmcJson) {
  el.btnCopyBmcJson.addEventListener('click', copyBmcJson);
}

function openBasicInfoJsonPanel() {
  if (!currentDetailRecord || !el.basicInfoJsonPanel || !el.basicInfoJsonContent) return;
  const basicInfo = currentDetailRecord.basicInfo || {};
  const jsonStr = JSON.stringify(basicInfo, null, 2);
  el.basicInfoJsonContent.textContent = jsonStr;
  el.basicInfoJsonPanel.classList.add('basic-info-json-panel-open');
  document.querySelector('.detail-body')?.classList.add('basic-info-json-panel-open');
}

function closeBasicInfoJsonPanel() {
  el.basicInfoJsonPanel?.classList.remove('basic-info-json-panel-open');
  document.querySelector('.detail-body')?.classList.remove('basic-info-json-panel-open');
}

function copyBasicInfoJson() {
  const text = el.basicInfoJsonContent?.textContent;
  if (!text) return;
  navigator.clipboard.writeText(text).then(() => {
    const btn = el.btnCopyBasicInfoJson;
    if (btn) {
      const orig = btn.textContent;
      btn.textContent = '已复制';
      setTimeout(() => { btn.textContent = orig; }, 1500);
    }
  }).catch(() => {
    alert('复制失败');
  });
}

function openBmcJsonPanel() {
  if (!currentDetailRecord || !el.bmcJsonPanel || !el.bmcJsonContent) return;
  const bmc = currentDetailRecord.bmc || {};
  const jsonStr = JSON.stringify(bmc, null, 2);
  el.bmcJsonContent.textContent = jsonStr;
  el.bmcJsonPanel.classList.add('bmc-json-panel-open');
  const body = document.querySelector('.detail-body');
  if (body) body.classList.add('bmc-json-panel-open');
}

function closeBmcJsonPanel() {
  el.bmcJsonPanel?.classList.remove('bmc-json-panel-open');
  document.querySelector('.detail-body')?.classList.remove('bmc-json-panel-open');
}

function copyBmcJson() {
  const text = el.bmcJsonContent?.textContent;
  if (!text) return;
  navigator.clipboard.writeText(text).then(() => {
    const btn = el.btnCopyBmcJson;
    if (btn) {
      const orig = btn.textContent;
      btn.textContent = '已复制';
      setTimeout(() => { btn.textContent = orig; }, 1500);
    }
  }).catch(() => {
    alert('复制失败');
  });
}

/** 统一时间戳格式：日期 + 具体时间（用于聊天块、时间线等） */
function getTimeStr() {
  const now = new Date();
  const y = now.getFullYear();
  const m = (now.getMonth() + 1).toString().padStart(2, '0');
  const d = now.getDate().toString().padStart(2, '0');
  const h = now.getHours().toString().padStart(2, '0');
  const min = now.getMinutes().toString().padStart(2, '0');
  const s = now.getSeconds().toString().padStart(2, '0');
  return `${y}-${m}-${d} ${h}:${min}:${s}`;
}

function appendChatBlock(container, role, content, timeStr) {
  const block = document.createElement('div');
  block.className = `chat-message chat-message-${role}`;
  block.innerHTML = `<div class="chat-message-content markdown-body">${renderMarkdown(content)}</div><div class="chat-message-time">${timeStr}</div>`;
  container.appendChild(block);
  container.scrollTop = container.scrollHeight;
  return block;
}

function buildModificationBlockRows(parsed) {
  if (parsed.isValueStream) {
    const opLabel = parsed.operation === 'addstage' ? '新增阶段' : parsed.operation === 'addstep' ? '新增环节' : '修改节点';
    return `
      <div class="chat-modification-row">
        <span class="chat-modification-label">操作类型</span>
        <span class="chat-modification-value">${escapeHtml(opLabel)}</span>
      </div>
      <div class="chat-modification-row">
        <span class="chat-modification-label">需要修改的价值流</span>
        <span class="chat-modification-value">${escapeHtml(parsed.valueStreamName || '—')}</span>
      </div>
      <div class="chat-modification-row">
        <span class="chat-modification-label">${parsed.operation === 'addstep' ? '所属阶段' : parsed.operation === 'addstage' ? '插入位置（前一阶段名）' : '需要修改的节点名称'}</span>
        <span class="chat-modification-value">${escapeHtml(parsed.nodeName || '—')}</span>
      </div>
      <div class="chat-modification-row">
        <span class="chat-modification-label">修改意见</span>
        <span class="chat-modification-value">${escapeHtml(parsed.modification)}</span>
      </div>
      <div class="chat-modification-row">
        <span class="chat-modification-label">修改原因</span>
        <span class="chat-modification-value">${escapeHtml(parsed.reason)}</span>
      </div>`;
  }
  return `
      <div class="chat-modification-row">
        <span class="chat-modification-label">修改位置</span>
        <span class="chat-modification-value">${escapeHtml(parsed.position)}</span>
      </div>
      <div class="chat-modification-row">
        <span class="chat-modification-label">修改意见</span>
        <span class="chat-modification-value">${escapeHtml(parsed.modification)}</span>
      </div>
      <div class="chat-modification-row">
        <span class="chat-modification-label">修改原因</span>
        <span class="chat-modification-value">${escapeHtml(parsed.reason)}</span>
      </div>`;
}

function appendModificationBlock(container, parsed, timeStr, onConfirm, onCancel, onRetry) {
  const block = document.createElement('div');
  block.className = 'chat-message chat-message-assistant chat-message-modification';
  block.innerHTML = `
    <div class="chat-modification-body">
      ${buildModificationBlockRows(parsed)}
      <div class="chat-modification-actions">
        <button type="button" class="btn-confirm-mod">确认</button>
        <button type="button" class="btn-retry-mod">重来</button>
        <button type="button" class="btn-cancel-mod">放弃</button>
      </div>
    </div>
    <div class="chat-message-time">${timeStr}</div>
  `;
  container.appendChild(block);
  container.scrollTop = container.scrollHeight;
  block.querySelector('.btn-confirm-mod')?.addEventListener('click', () => {
    block.querySelector('.chat-modification-actions').innerHTML = '<span class="mod-status">已确认</span>';
    currentModificationTask = null;
    onConfirm?.();
  });
  block.querySelector('.btn-retry-mod')?.addEventListener('click', () => {
    block.querySelector('.chat-modification-actions').innerHTML = '<span class="mod-status">正在重新分析...</span>';
    onRetry?.(block);
  });
  block.querySelector('.btn-cancel-mod')?.addEventListener('click', () => {
    currentModificationTask = null;
    onCancel?.(block);
  });
  currentModificationTask = { parsed, block };
  return block;
}

/**
 * 将新的价值流修改内容整合到当前任务中。若新内容与旧内容有冲突，则以新内容为准。
 * 仅当当前任务为价值流修改时使用。
 */
function mergeValueStreamModification(currentParsed, newParsed) {
  if (!currentParsed?.isValueStream) return newParsed || currentParsed;
  if (!newParsed) return currentParsed;
  return {
    ...currentParsed,
    ...newParsed,
    isValueStream: true,
    operation: (newParsed.operation || currentParsed.operation || 'update').toLowerCase(),
    valueStreamName: (newParsed.valueStreamName || currentParsed.valueStreamName || '').trim() || currentParsed.valueStreamName,
    nodeName: (newParsed.nodeName || currentParsed.nodeName || '').trim() || currentParsed.nodeName,
    insertAfterStepName: (newParsed.insertAfterStepName ?? currentParsed.insertAfterStepName ?? '').trim() || currentParsed.insertAfterStepName,
    valueStreamIndex: newParsed.valueStreamIndex ?? currentParsed.valueStreamIndex,
    modification: newParsed.modification ?? currentParsed.modification,
    reason: newParsed.reason ?? currentParsed.reason,
    newValue: newParsed.newValue ?? currentParsed.newValue,
    position: newParsed.position || currentParsed.position,
    positionKey: newParsed.positionKey || currentParsed.positionKey || currentParsed.position,
  };
}

/** 就地更新修改块内容（用于同一任务内的修订） */
function updateModificationBlockContent(block, parsed) {
  if (!block || !parsed) return;
  const body = block.querySelector('.chat-modification-body');
  if (!body) return;
  const rows = body.querySelectorAll('.chat-modification-row');
  if (parsed.isValueStream && rows.length >= 5) {
    const opLabel = parsed.operation === 'addstage' ? '新增阶段' : parsed.operation === 'addstep' ? '新增环节' : '修改节点';
    const nodeLabel = parsed.operation === 'addstep' ? '所属阶段' : parsed.operation === 'addstage' ? '插入位置（前一阶段名）' : '需要修改的节点名称';
    rows[0].querySelector('.chat-modification-label').textContent = '操作类型';
    rows[0].querySelector('.chat-modification-value').textContent = opLabel;
    rows[1].querySelector('.chat-modification-value').textContent = parsed.valueStreamName || '—';
    rows[2].querySelector('.chat-modification-label').textContent = nodeLabel;
    rows[2].querySelector('.chat-modification-value').textContent = parsed.nodeName || '—';
    rows[3].querySelector('.chat-modification-value').textContent = parsed.modification || '—';
    rows[4].querySelector('.chat-modification-value').textContent = parsed.reason || '—';
  } else if (parsed.isValueStream && rows.length >= 4) {
    rows[0].querySelector('.chat-modification-value').textContent = parsed.valueStreamName || '—';
    rows[1].querySelector('.chat-modification-value').textContent = parsed.nodeName || '—';
    rows[2].querySelector('.chat-modification-value').textContent = parsed.modification || '—';
    rows[3].querySelector('.chat-modification-value').textContent = parsed.reason || '—';
  } else if (rows.length >= 3) {
    rows[0].querySelector('.chat-modification-value').textContent = parsed.position || '—';
    rows[1].querySelector('.chat-modification-value').textContent = parsed.modification || '—';
    rows[2].querySelector('.chat-modification-value').textContent = parsed.reason || '—';
  }
}

function appendModificationBlockReadOnly(container, parsed, timeStr) {
  const block = document.createElement('div');
  block.className = 'chat-message chat-message-assistant chat-message-modification chat-message-readonly';
  block.innerHTML = `
    <div class="chat-modification-body">
      ${buildModificationBlockRows(parsed)}
      <div class="chat-modification-actions readonly"><span class="mod-status">历史记录</span></div>
    </div>
    <div class="chat-message-time">${timeStr}</div>
  `;
  container.appendChild(block);
  container.scrollTop = container.scrollHeight;
  return block;
}

async function fetchModificationFromLLM() {
  const pageStructure = buildPageStructureForLLM(currentDetailRecord);
  const pendingVs = currentModificationTask?.parsed?.isValueStream
    ? `\n【重要】当前有一条未确认的价值流修改建议（${currentModificationTask.parsed.valueStreamName || ''} - ${currentModificationTask.parsed.nodeName || ''}）。用户发送的新内容应视为对该修改的补充，请将新内容整合到同一条修改建议中，若有冲突则以新内容为准，仍使用格式 B 回复。\n`
    : '';
  const systemContent = `你是企业信息与商业画布修改助手。当前用户正在查看「${currentDetailCompanyName || '某企业'}」的详情页。
${pendingVs}
【任务】当用户提出修改需求时，你需要：
1. 分析下方「当前页面详情结构」，判断用户要修改的是哪个位置的内容；
2. 提炼出：修改位置、修改意见（具体的修改点的总结）、修改原因、修改后的完整内容；
3. 用以下 JSON 格式回复（不要包含其他说明文字）：

当修改涉及【基本信息】或【商业画布】时，使用格式 A：
\`\`\`json
{
  "position": "精确的字段标签，如：客户细分、价值主张、企业名称 等",
  "modification": "具体的修改点的总结",
  "reason": "修改原因说明",
  "newValue": "修改后的完整新内容（必填）"
}
\`\`\`

当修改涉及【价值流】时，使用格式 B。必须根据操作类型填写 operation：
- update：修改现有节点/环节的内容，nodeName 为要修改的节点名称，newValue 为修改后的内容
- addStage：新增阶段节点，nodeName 为插入位置之前的阶段名（为空则追加到末尾），newValue 为新阶段名称
- addStep：在某个阶段内新增环节，nodeName 为所属阶段名称，newValue 为新环节名称（可含描述，用换行分隔）。若需在指定环节后插入，需填写 insertAfterStepName（前一环节名称））

\`\`\`json
{
  "isValueStream": true,
  "operation": "update|addStage|addStep",
  "valueStreamName": "需要修改的价值流名称（与页面中价值流名称一致）",
  "nodeName": "见上方各 operation 说明",
  "insertAfterStepName": "（仅 addStep 且需指定插入位置时）前一环节名称，如：审核方案",
  "position": "价值流-节点（如：xxx价值流-xxx阶段/环节）",
  "modification": "具体的修改意见",
  "reason": "修改原因说明",
  "newValue": "修改后的完整新内容 或 新增节点/环节的名称（必填）"
}
\`\`\`

【当前页面详情结构】
${pageStructure || '(无详情数据)'}`;

  const apiMessages = [
    { role: 'system', content: systemContent },
    ...chatHistory.map((m) => ({ role: m.role, content: m.content })),
  ];
  const res = await fetch(DEEPSEEK_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${DEEPSEEK_API_KEY}`,
    },
    body: JSON.stringify({
      model: DEEPSEEK_MODEL,
      messages: apiMessages,
    }),
  });
  const data = await res.json();
  if (data.error) {
    return '请求失败：' + (data.error.message || JSON.stringify(data.error));
  }
  return data.choices?.[0]?.message?.content ?? '未收到有效回复。';
}

/** 调用大模型解析数字化问题输入，提取客户名称、需求、IT现状、时间要求 */
async function parseDigitalProblemInput(text) {
  const systemPrompt = `你是一个专业的数字化需求分析助手。用户会输入一段关于企业名称及数字化问题的描述，请从中提炼出以下四个字段，以 JSON 格式返回，不要包含其他内容：

{
  "customerName": "客户名称",
  "customerNeedsOrChallenges": "客户需求或挑战",
  "customerItStatus": "客户IT现状",
  "projectTimeRequirement": "项目时间要求"
}

如果某字段无法从输入中推断，该字段填 "—" 或空字符串。只返回 JSON，不要有 markdown 代码块包裹。`;

  const res = await fetch(DEEPSEEK_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${DEEPSEEK_API_KEY}`,
    },
    body: JSON.stringify({
      model: DEEPSEEK_MODEL,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: text },
      ],
    }),
  });
  const data = await res.json();
  if (data.error) {
    throw new Error(data.error.message || JSON.stringify(data.error));
  }
  const content = data.choices?.[0]?.message?.content ?? '';
  const jsonMatch = content.match(/\{[\s\S]*\}/);
  const jsonStr = jsonMatch ? jsonMatch[0] : content;
  return JSON.parse(jsonStr);
}

/** 构建意图提炼的完整上下文：当前问题的沟通历史 + 页面内容结构，供大模型搜索匹配；返回 { context, currentTask } */
function buildIntentExtractionContext(createdAt, item) {
  const chats = getProblemDetailChats()[createdAt];
  const lines = [];
  lines.push('【沟通历史】');
  let currentTask = 'task1';
  if (Array.isArray(chats) && chats.length > 0) {
    for (const msg of chats) {
      const inferred = inferTaskIdFromMessage(msg);
      if (inferred) currentTask = inferred;
      if (msg.type === 'intentExtractionCard' && !msg.confirmed) continue;
      if (msg.type === 'modificationClarificationRequest') continue;
      const taskLabel = FOLLOW_TASKS.find((t) => t.id === currentTask)?.name || currentTask;
      if (msg.role === 'user') {
        lines.push(`[${taskLabel}] 用户: ${(msg.content || '').trim() || '(空)'}`);
      } else if (msg.type === 'basicInfoCard' && msg.confirmed && msg.data) {
        const fields = Object.keys(msg.data).filter((k) => msg.data[k] != null && String(msg.data[k]).trim());
        lines.push(`[${taskLabel}] 系统(已确认企业基本信息): 含字段 ${fields.join('、')}`);
      } else if (msg.type === 'bmcCard' && msg.confirmed && msg.data) {
        const fields = Object.keys(msg.data).filter((k) => msg.data[k] != null && String(msg.data[k]).trim());
        lines.push(`[${taskLabel}] 系统(已确认BMC): 含字段 ${fields.slice(0, 8).join('、')}${fields.length > 8 ? '...' : ''}`);
      } else if (msg.type === 'requirementLogicBlock' && msg.confirmed) {
        lines.push(`[${taskLabel}] 系统(已确认需求逻辑)`);
      } else if (msg.type === 'valueStreamCard' && msg.confirmed && msg.data) {
        const { stages } = parseValueStreamGraph(msg.data);
        const stageNames = stages.map((s) => s.name).filter(Boolean);
        const stepNames = stages.flatMap((s) => s.steps.map((st) => st.name).filter(Boolean));
        lines.push(`[${taskLabel}] 系统(已确认价值流): 阶段 ${stageNames.join('、')}；环节示例 ${stepNames.slice(0, 6).join('、')}${stepNames.length > 6 ? '...' : ''}`);
      } else if (msg.type === 'intentExtractionCard' && msg.confirmed && msg.data) {
        lines.push(`[${taskLabel}] 系统(意图已确认): ${(msg.data.summary || '').trim() || JSON.stringify(msg.data).slice(0, 80)}`);
      } else if (msg.role === 'system' && msg.content && (msg._taskId || msg.llmMeta)) {
        const snippet = (msg.content || '').trim().slice(0, 300);
        lines.push(`[${taskLabel}] 系统大模型: ${snippet}${(msg.content || '').length > 300 ? '…' : ''}`);
      }
    }
  } else {
    lines.push('(暂无历史记录)');
  }
  lines.push('');
  lines.push('【当前页面内容结构】（用于匹配定位，请从中搜索最为匹配的内容单元）');
  const BASIC_INFO_KEY_TO_LABEL = { company_name: '公司名称', credit_code: '信用代码', legal_representative: '法人', established_date: '成立时间', registered_capital: '注册资本', is_listed: '是否上市', listing_location: '上市地', business_scope: '经营范围', core_qualifications: '核心资质', official_website: '官方网站' };
  if (item) {
    const basicInfo = problemDetailConfirmedBasicInfo || item.basicInfo;
    if (basicInfo) {
      const labels = Object.keys(basicInfo)
        .filter((k) => basicInfo[k] != null && String(basicInfo[k]).trim())
        .map((k) => BASIC_INFO_KEY_TO_LABEL[k] || k);
      lines.push(`- 客户基本信息(task1): ${labels.join('、')}`);
    }
    if (item.bmc) {
      const bmc = item.bmc;
      const bmcLabels = BMC_FIELDS.filter((f) => bmc[f.key] != null && String(bmc[f.key]).trim()).map((f) => f.label);
      if (bmc.industry_insight) bmcLabels.unshift('行业背景洞察');
      if (bmc.pain_points) bmcLabels.push('业务痛点预判');
      lines.push(`- BMC(task2): ${bmcLabels.join('、')}`);
    }
    if (item.requirementLogic) {
      lines.push(`- 需求逻辑(task3): 行业底层逻辑与竞争共性、初步需求与商业模式的"因果关联"、需求背后的深层动机、逻辑链条总结`);
    }
    const vs = item.valueStream;
    if (vs && !vs.raw) {
      const { stages } = parseValueStreamGraph(vs);
      stages.forEach((s, i) => {
        const stepNames = (s.steps || []).map((st) => st.name).filter(Boolean);
        lines.push(`- 价值流(task4) 阶段${i + 1}「${s.name}」: 环节 ${stepNames.join('、') || '(无)'}`);
      });
    }
    const localSessions = item.localItGapSessions || [];
    const localStepNames = localSessions.length > 0
      ? localSessions.map((s) => s.stepName || `环节${(s.stepIndex ?? 0) + 1}`).filter(Boolean)
      : (vs && !vs.raw ? parseValueStreamGraph(vs).stages.flatMap((s) => (s.steps || []).map((st) => st.name).filter(Boolean)) : []);
    if (localStepNames.length > 0) {
      lines.push(`- 局部 ITGap 分析(task9): 环节 ${localStepNames.join('、')}`);
    }
  }
  return { context: lines.join('\n'), currentTask };
}

/** 单条沟通内容最大字符数（超长 JSON 截断以降低 LLM 请求体积与延迟） */
const COMM_HISTORY_CONTENT_MAX_LEN = 3500;

/** 构建用于查询的沟通历史文本（排除查询类消息），供大模型回答查询时使用；大块 JSON 会截断以提升性能 */
function buildCommunicationHistoryTextForQuery(createdAt) {
  const communications = getCommunicationsByTask(createdAt);
  const lines = [];
  const allTasks = [...FOLLOW_TASKS, ...ITGAP_HISTORY_TASKS, ...IT_STRATEGY_TASKS];
  for (const task of allTasks) {
    const comms = communications[task.id] || [];
    const taskLabel = task.name;
    for (const c of comms) {
      let contentStr = typeof c.content === 'object' ? JSON.stringify(c.content, null, 2) : c.content;
      if (typeof contentStr === 'string' && contentStr.length > COMM_HISTORY_CONTENT_MAX_LEN) {
        contentStr = contentStr.slice(0, COMM_HISTORY_CONTENT_MAX_LEN) + '\n...(内容已截断)';
      }
      lines.push(`[${taskLabel}] ${c.speaker} (${c.time}):\n${contentStr}`);
    }
  }
  return lines.join('\n\n') || '(暂无沟通记录)';
}

/** 执行查询意图：将查询需求及沟通历史发往大模型，返回回答及元信息 */
async function executeQueryIntent(extracted, item) {
  const createdAt = item?.createdAt;
  const commHistory = buildCommunicationHistoryTextForQuery(createdAt);
  const queryReq = extracted.queryTarget || extracted.summary || '用户查询';
  const systemPrompt = `你是一位数字化问题跟进助手。用户有一个查询需求，请优先依据【当前问题的阶段状态】来判断当前处于哪个阶段或任务，再结合【沟通历史】补充细节。若两者不一致，以【当前问题的阶段状态】为准。若仍无相关信息，请如实说明。`;

  const majorStageIndex = item?.currentMajorStage ?? 0;
  const majorStageLabel = PROBLEM_DETAIL_MAJOR_STAGE_LABELS[majorStageIndex] ?? String(majorStageIndex);
  const workflowAlignCompleted = (item?.workflowAlignCompletedStages || []).join(', ');
  const itGapCompleted = (item?.itGapCompletedStages || []).join(', ');
  let currentStageLine = `当前问题的阶段为：${majorStageLabel}（索引 ${majorStageIndex}）。`;
  if (majorStageIndex === 3) {
    const subIdx = typeof itStrategyPlanViewingSubstep === 'number' ? itStrategyPlanViewingSubstep : 0;
    const itStrategyTask = IT_STRATEGY_TASKS[subIdx];
    if (itStrategyTask) {
      currentStageLine += ` 当前 IT 策略规划任务为：${itStrategyTask.name}（${itStrategyTask.id}）。`;
    }
  }
  const stateLines = [
    currentStageLine,
    `已完成的工作流对齐子步骤索引：${workflowAlignCompleted || '无'}`,
    `已完成的 ITGap 分析子步骤索引：${itGapCompleted || '无'}`,
  ].join('\n');

  const userContent = `【当前问题的阶段状态】
${stateLines}

【沟通历史】
${commHistory}

【查询需求】
${queryReq}`;
  const { content, usage, model, durationMs } = await fetchDeepSeekChat([
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userContent },
  ]);
  return { content: (content || '').trim() || '（无返回内容）', usage, model, durationMs };
}

/** 执行请教讨论意图：将用户讨论问题及沟通历史上下文发往大模型，返回回答；讨论归入对应任务的沟通历史 */
async function executeDiscussionIntent(extracted, item, userText) {
  const createdAt = item?.createdAt;
  const commHistory = buildCommunicationHistoryTextForQuery(createdAt);
  const topic = extracted.discussionTopic || extracted.summary || userText || '用户讨论';
  const systemPrompt = `你是一位数字化问题跟进顾问。用户针对当前数字化问题的某个专题进行延展性讨论或请教。请结合【沟通历史】的完整上下文，对用户的问题进行专业、深入的解答或讨论。可以结合行业经验、最佳实践给出建议，保持友好、专业的对话风格。`;
  const userContent = `【沟通历史】\n${commHistory}\n\n【用户讨论/请教】\n${topic}`;
  const { content, usage, model, durationMs } = await fetchDeepSeekChat([
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userContent },
  ]);
  return { content: (content || '').trim() || '（无返回内容）', usage, model, durationMs };
}

/** 标签到初步需求字段的映射 */
const PRELIMINARY_LABEL_TO_KEY = {
  客户名称: 'customerName',
  客户需求或挑战: 'customerNeedsOrChallenges',
  客户IT现状: 'customerItStatus',
  项目时间要求: 'projectTimeRequirement',
};

/** 标签到基本信息字段的映射 */
const BASIC_INFO_LABEL_TO_KEY = {
  公司名称: 'company_name',
  信用代码: 'credit_code',
  法人: 'legal_representative',
  成立时间: 'established_date',
  注册资本: 'registered_capital',
  是否上市: 'is_listed',
  上市地: 'listing_location',
  经营范围: 'business_scope',
  核心资质: 'core_qualifications',
  官方网站: 'official_website',
};

/** 获取修改目标位置的当前内容，返回 { taskId, fieldKey, currentContent, positionDesc } 或 null */
function getCurrentContentAtModificationTarget(extracted, item) {
  const taskId = extracted.taskId || 'task1';
  const modField = String(extracted.modificationField || '').trim();
  const modTarget = String(extracted.modificationTarget || '').trim();
  const vsLevel = String(extracted.modificationValueStreamLevel || '').toLowerCase();
  const vsTarget = String(extracted.modificationValueStreamTarget || '').trim();

  if (taskId === 'task1' || modTarget.includes('企业基本信息') || modTarget.includes('基本信息')) {
    const basicInfo = problemDetailConfirmedBasicInfo || item?.basicInfo || {};
    const fieldKey = modField ? (BASIC_INFO_LABEL_TO_KEY[modField] || modField) : null;
    if (fieldKey && basicInfo[fieldKey] != null) {
      return { taskId: 'task1', fieldKey, currentContent: String(basicInfo[fieldKey]).trim(), positionDesc: `客户基本信息 - ${modField || fieldKey}` };
    }
    return { taskId: 'task1', fieldKey: null, currentContent: JSON.stringify(basicInfo, null, 2), positionDesc: '客户基本信息（整块）' };
  }

  if (taskId === 'task2' || modTarget.includes('bmc') || modTarget.includes('商业画布') || modTarget.includes('商业模式')) {
    const bmc = item?.bmc || {};
    const bmcField = BMC_FIELDS.find((f) => f.label === modField);
    const industryInsight = modField === '行业背景洞察';
    const painPoints = modField === '业务痛点预判';
    if (bmcField) {
      const val = bmc[bmcField.key];
      return { taskId: 'task2', fieldKey: bmcField.key, currentContent: val != null ? String(val).trim() : '', positionDesc: `BMC - ${modField}` };
    }
    if (industryInsight) return { taskId: 'task2', fieldKey: 'industry_insight', currentContent: (bmc.industry_insight || '').trim(), positionDesc: 'BMC - 行业背景洞察' };
    if (painPoints) return { taskId: 'task2', fieldKey: 'pain_points', currentContent: (bmc.pain_points || '').trim(), positionDesc: 'BMC - 业务痛点预判' };
    return { taskId: 'task2', fieldKey: null, currentContent: JSON.stringify(bmc, null, 2), positionDesc: 'BMC（整块）' };
  }

  if (taskId === 'task3' || modTarget.includes('需求逻辑')) {
    const logic = item?.requirementLogic || '';
    const parsed = typeof logic === 'string' ? parseRequirementLogicFromMarkdown(logic) : logic;
    const section = REQUIREMENT_LOGIC_SECTIONS.find((s) => s.label === modField);
    if (section) {
      const val = (parsed[section.key] || '').trim();
      return { taskId: 'task3', fieldKey: section.key, currentContent: val, positionDesc: `需求逻辑 - ${modField}` };
    }
    return { taskId: 'task3', fieldKey: null, currentContent: typeof logic === 'string' ? logic : JSON.stringify(logic, null, 2), positionDesc: '需求逻辑（整块）' };
  }

  if (['task4', 'task5', 'task6'].includes(taskId) && item?.valueStream && !item.valueStream.raw) {
    const vs = item.valueStream;
    const { stages } = parseValueStreamGraph(vs);
    const targetName = vsTarget || modField;
    const modTargetLower = modTarget.toLowerCase();
    const isPainPointIntent = modTargetLower.includes('痛点') || modField.includes('痛点');
    const isItStatusIntent = modTargetLower.includes('it现状') || modTargetLower.includes('it 现状') || modField.includes('IT现状');
    if ((vsLevel === 'step' || (!vsLevel && targetName)) && targetName) {
      for (let si = 0; si < stages.length; si++) {
        const stage = stages[si];
        for (let ji = 0; ji < (stage.steps || []).length; ji++) {
          const step = stage.steps[ji];
          const name = (step.name || '').trim();
          if (name && (name === targetName || name.includes(targetName) || targetName.includes(name))) {
            let vsStepField;
            if (isPainPointIntent) vsStepField = 'painPoint';
            else if (isItStatusIntent) vsStepField = 'itStatus';
            else vsStepField = step.painPoint ? 'painPoint' : step.itStatusLabel ? 'itStatus' : 'name';
            const itStatus = step.itStatusLabel || (step.itStatus && typeof step.itStatus === 'object' ? (step.itStatus.type === '手工' ? `手工-${step.itStatus.detail || ''}` : step.itStatus.type === '系统' ? `系统-${step.itStatus.detail || ''}` : '') : '');
            const content = vsStepField === 'painPoint' ? (step.painPoint || '') : vsStepField === 'itStatus' ? itStatus : step.name || '';
            const fieldLabel = vsStepField === 'painPoint' ? '痛点描述' : vsStepField === 'itStatus' ? 'IT现状' : '环节名称';
            return { taskId: 'task4', fieldKey: 'valueStream', currentContent: content, positionDesc: `价值流 - 阶段「${stage.name}」- 环节「${step.name}」的${fieldLabel}`, vsStageIndex: si, vsStepIndex: ji, vsStepField };
          }
        }
      }
    }
    if (vsLevel === 'stage' && targetName) {
      for (let si = 0; si < stages.length; si++) {
        const stage = stages[si];
        const name = (stage.name || '').trim();
        if (name && (name === targetName || name.includes(targetName) || targetName.includes(name))) {
          return { taskId: 'task4', fieldKey: 'valueStream', currentContent: stage.name || '', positionDesc: `价值流 - 阶段「${stage.name}」的阶段名称`, vsStageIndex: si, vsStepIndex: -1, vsStepField: 'stageName' };
        }
      }
    }
    return { taskId: 'task4', fieldKey: 'valueStream', currentContent: JSON.stringify(vs, null, 2), positionDesc: '价值流图（整块）' };
  }

  if (taskId === 'preliminary' || modTarget.includes('初步需求')) {
    const preKey = modField ? PRELIMINARY_LABEL_TO_KEY[modField] : null;
    if (preKey && item && item[preKey] != null) {
      return { taskId: 'preliminary', fieldKey: preKey, currentContent: String(item[preKey]).trim(), positionDesc: `初步需求 - ${modField || preKey}` };
    }
    const preContent = {
      customerName: item?.customerName,
      customerNeedsOrChallenges: item?.customerNeedsOrChallenges,
      customerItStatus: item?.customerItStatus,
      projectTimeRequirement: item?.projectTimeRequirement,
    };
    return { taskId: 'preliminary', fieldKey: null, currentContent: JSON.stringify(preContent, null, 2), positionDesc: '初步需求（整块）' };
  }

  return null;
}

/** 价值流修改类型对应的说明，用于提示词中明确告知大模型 */
const VS_STEP_FIELD_LABELS = {
  painPoint: '环节痛点描述',
  itStatus: '环节IT现状',
  name: '环节名称',
  stageName: '阶段名称',
};

/** 构建价值流结构描述，供多目标修改分析使用 */
function buildValueStreamStructureForMultiMod( vs) {
  if (!vs || vs.raw) return '';
  const { stages } = parseValueStreamGraph(vs);
  const lines = stages.map((stage, si) => {
    const stepLines = (stage.steps || []).map((step, ji) => {
      const itStatus = step.itStatusLabel || (step.itStatus && typeof step.itStatus === 'object' ? (step.itStatus.type === '手工' ? `手工-${step.itStatus.detail || ''}` : step.itStatus.type === '系统' ? `系统-${step.itStatus.detail || ''}` : '') : '');
      return `      - 环节「${step.name || ''}」: itStatus=${itStatus || '(空)'}, painPoint=${(step.painPoint || '').trim() || '(空)'}`;
    }).join('\n');
    return `  阶段「${stage.name || ''}」:\n${stepLines}`;
  }).join('\n');
  return lines;
}

/** 分析多目标修改意图：当修改涉及价值流多个环节/字段时，由大模型拆分为独立更新项，分别更新对应位置 */
async function analyzeMultiModificationForValueStream(extracted, item) {
  const vs = item?.valueStream;
  if (!vs || vs.raw) return null;
  const vsStructure = buildValueStreamStructureForMultiMod(vs);
  const modTarget = extracted.modificationTarget || '';
  const modField = extracted.modificationField || '';
  const modNewValue = extracted.modificationNewValue || '';
  const summary = extracted.summary || '';
  const systemPrompt = `你是一位数字化问题跟进助手。用户希望对价值流图进行修改。请分析修改意图，若涉及多个位置（如：订单合并与生产需求分析两个环节的 IT 现状和痛点都需修改），必须拆分为多条独立更新，每条更新对应一个具体位置，分别修改，不要将多个位置的修改合并到其中一处。

【价值流当前结构】
${vsStructure}

【输出格式】只返回 JSON 数组，不要有其他内容。每个元素：
{ "stageName": "阶段名称（必须与上面结构中的阶段名一致）", "stepName": "环节名称（必须与上面结构中的环节名一致）", "field": "itStatus"|"painPoint"|"name", "newContent": "该位置的新内容" }

- field 为 itStatus 时，newContent 格式如「手工-excel」或「系统-ERP」
- field 为 painPoint 时，newContent 为该环节的痛点描述文案
- field 为 name 时，newContent 为环节名称
- 若修改阶段名称，stepName 填空字符串，field 填 "stageName"，newContent 为新阶段名

规则：每个需要修改的位置单独一条；同一环节的 itStatus 与 painPoint 若都需修改，分两条；不同环节的修改必须分条。`;
  const userContent = `【修改意图】\n${modTarget}
${modField ? `修改字段：${modField}` : ''}
${modNewValue ? `用户希望改为：${modNewValue}` : ''}
${summary ? `意图概括：${summary}` : ''}

请分析并返回需更新的位置列表（JSON 数组）。`;
  const { content, usage, model, durationMs } = await fetchDeepSeekChat([
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userContent },
  ]);
  const jsonMatch = content.match(/\[[\s\S]*\]/);
  if (!jsonMatch) return null;
  try {
    const updates = JSON.parse(jsonMatch[0]);
    if (!Array.isArray(updates) || updates.length === 0) return null;
    return { updates, usage, model, durationMs };
  } catch {
    return null;
  }
}

/** 根据 stageName、stepName 在价值流中查找步骤索引，返回 { vsStageIndex, vsStepIndex } 或 null；stepName 为空时匹配阶段 */
function findValueStreamStepIndex(vs, stageName, stepName) {
  const rawStages = vs.stages ?? vs.phases ?? vs.nodes ?? [];
  for (let si = 0; si < rawStages.length; si++) {
    const stage = rawStages[si];
    const sName = (stage.name ?? stage.title ?? stage.stage_name ?? '').toString().trim();
    if (sName !== stageName) continue;
    if (!stepName || (typeof stepName === 'string' && !stepName.trim())) {
      return { vsStageIndex: si, vsStepIndex: -1 };
    }
    const rawSteps = stage.steps ?? stage.tasks ?? stage.phases ?? stage.items ?? [];
    for (let ji = 0; ji < rawSteps.length; ji++) {
      const step = rawSteps[ji];
      const stName = (step.name ?? step.title ?? '').toString().trim();
      if (stName === stepName || (stName && stepName && (stName.includes(stepName) || stepName.includes(stName)))) {
        return { vsStageIndex: si, vsStepIndex: ji };
      }
    }
  }
  return null;
}

/** 将多目标更新列表依次应用到价值流 */
function applyValueStreamUpdates(item, updates) {
  const vs = item?.valueStream;
  if (!vs || vs.raw || !Array.isArray(updates) || updates.length === 0) return false;
  const createdAt = item?.createdAt;
  if (!createdAt) return false;
  let currentVs = { ...vs, stages: JSON.parse(JSON.stringify(vs.stages ?? vs.phases ?? vs.nodes ?? [])) };
  const rawStages = currentVs.stages;
  for (const u of updates) {
    const { stageName, stepName, field, newContent } = u;
    if (!stageName || !field || newContent == null) continue;
    const idx = findValueStreamStepIndex({ stages: rawStages }, stageName, (stepName || '').trim());
    if (!idx) continue;
    const { vsStageIndex: si, vsStepIndex: ji } = idx;
    if (si < 0 || si >= rawStages.length) continue;
    const stage = rawStages[si];
    const rawSteps = stage.steps ?? stage.tasks ?? stage.phases ?? stage.items ?? [];
    if (field === 'stageName') {
      rawStages[si] = { ...stage, name: newContent, title: newContent, stage_name: newContent };
    } else if (ji >= 0 && ji < rawSteps.length) {
      const step = rawSteps[ji];
      const nextStep = typeof step === 'object' && step !== null ? { ...step } : { name: String(step) };
      if (field === 'painPoint') nextStep.painPoint = nextStep.pain_point = newContent;
      else if (field === 'itStatus') {
        const m = String(newContent).match(/^(手工|系统)[-：]?(.*)$/);
        if (m) nextStep.itStatus = nextStep.it_status = { type: m[1], detail: (m[2] || '').trim() };
        else nextStep.itStatus = nextStep.it_status = { type: '手工', detail: newContent };
      } else nextStep.name = nextStep.title = newContent;
      const newSteps = [...rawSteps];
      newSteps[ji] = nextStep;
      rawStages[si] = { ...stage, steps: newSteps };
    }
  }
  updateDigitalProblemValueStream(createdAt, currentVs);
  currentProblemDetailItem = { ...item, valueStream: currentVs };
  return true;
}

/** 执行修改意图：将修改意见及当前位置内容发往大模型，返回新内容及元信息 */
async function executeModificationIntent(extracted, positionInfo) {
  const modTarget = extracted.modificationTarget || '';
  const modField = extracted.modificationField || '';
  const modNewValue = extracted.modificationNewValue || '';
  const { currentContent, positionDesc } = positionInfo;
  const vsStepField = positionInfo.vsStepField;
  const fieldTypeLabel = vsStepField ? VS_STEP_FIELD_LABELS[vsStepField] : null;
  const valueStreamFieldHint = fieldTypeLabel
    ? `\n【重要】本次修改类型为：${fieldTypeLabel}。你只返回该字段的新内容，不要返回其他无关内容。若修改的是痛点描述，只返回痛点文案；若修改的是IT现状，只返回如「手工-excel」或「系统-ERP」格式；若修改的是环节名称，只返回环节名；若修改的是阶段名称，只返回阶段名。`
    : '';
  const systemPrompt = `你是一位数字化问题跟进助手。用户希望对工作区某处内容进行修改。请根据【修改意见】和【当前位置的现有内容】，综合处理形成新的内容。

要求：
1. 新内容应满足用户的修改意图，同时保持与上下文一致；
2. 若用户已明确给出修改后的值（modificationNewValue），可优先采纳，并做必要的润色或补充；
3. 只返回修改后的新内容本身，不要包含解释、说明或 markdown 代码块；
4. 若为 JSON 字段，返回合法的 JSON 字符串；若为普通文本，返回纯文本。${valueStreamFieldHint}`;
  const userContent = `【修改位置】\n${positionDesc}

【修改意见】\n修改目标：${modTarget}
${modField ? `修改字段：${modField}` : ''}
${modNewValue ? `用户希望改为：${modNewValue}` : ''}

【当前位置的现有内容】\n${currentContent || '(空)'}`;
  const { content, usage, model, durationMs } = await fetchDeepSeekChat([
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userContent },
  ]);
  return { newContent: (content || '').trim(), usage, model, durationMs };
}

/** 将修改结果应用到工作区并更新存储 */
function applyModificationToWorkspace(extracted, newContent, positionInfo, item) {
  const { taskId, fieldKey } = positionInfo;
  const createdAt = item?.createdAt;
  if (!createdAt) return false;

  if (taskId === 'preliminary' && fieldKey) {
    const list = getDigitalProblems();
    const idx = list.findIndex((it) => it.createdAt === createdAt);
    if (idx < 0) return false;
    list[idx] = { ...list[idx], [fieldKey]: newContent };
    localStorage.setItem(DIGITAL_PROBLEMS_STORAGE_KEY, JSON.stringify(list));
    currentProblemDetailItem = { ...item, [fieldKey]: newContent };
    return true;
  }

  if (taskId === 'task1') {
    let basicInfo = { ...(problemDetailConfirmedBasicInfo || item?.basicInfo || {}) };
    if (fieldKey) {
      basicInfo[fieldKey] = newContent;
    } else {
      try {
        const parsed = JSON.parse(newContent);
        if (parsed && typeof parsed === 'object') basicInfo = { ...basicInfo, ...parsed };
      } catch (_) {}
    }
    problemDetailConfirmedBasicInfo = basicInfo;
    updateDigitalProblemBasicInfo(createdAt, basicInfo);
    currentProblemDetailItem = { ...item, basicInfo };
    return true;
  }

  if (taskId === 'task2') {
    let bmc = { ...(item?.bmc || {}) };
    if (fieldKey) {
      bmc[fieldKey] = newContent;
    } else {
      try {
        const parsed = JSON.parse(newContent);
        if (parsed && typeof parsed === 'object') bmc = { ...bmc, ...parsed };
      } catch (_) {}
    }
    updateDigitalProblemBmc(createdAt, bmc);
    currentProblemDetailItem = { ...item, bmc };
    return true;
  }

  if (taskId === 'task3') {
    let logicStr = item?.requirementLogic || '';
    const parsed = parseRequirementLogicFromMarkdown(logicStr);
    if (fieldKey) {
      parsed[fieldKey] = newContent;
      logicStr = REQUIREMENT_LOGIC_SECTIONS.map((s) => `## ${s.label}\n\n${(parsed[s.key] || '').trim() || '—'}`).join('\n\n');
    } else {
      logicStr = newContent;
    }
    updateDigitalProblemRequirementLogic(createdAt, logicStr);
    currentProblemDetailItem = { ...item, requirementLogic: logicStr };
    return true;
  }

  if (taskId === 'task4' && positionInfo.vsStageIndex !== undefined) {
    const vs = item?.valueStream;
    if (!vs || vs.raw) return false;
    const rawStages = vs.stages ?? vs.phases ?? vs.nodes ?? [];
    const si = positionInfo.vsStageIndex;
    const ji = positionInfo.vsStepIndex;
    const field = positionInfo.vsStepField;
    if (si < 0 || si >= rawStages.length) return false;
    const stage = rawStages[si];
    const rawSteps = stage.steps ?? stage.tasks ?? stage.phases ?? stage.items ?? [];
    if (ji >= 0 && ji < rawSteps.length) {
      const step = rawSteps[ji];
      const nextStep = typeof step === 'object' && step !== null ? { ...step } : { name: String(step) };
      if (field === 'painPoint') nextStep.painPoint = nextStep.pain_point = newContent;
      else if (field === 'itStatus') {
        const m = newContent.match(/^(手工|系统)[-：]?(.*)$/);
        if (m) nextStep.itStatus = nextStep.it_status = { type: m[1], detail: (m[2] || '').trim() };
        else nextStep.itStatus = nextStep.it_status = { type: '手工', detail: newContent };
      } else nextStep.name = nextStep.title = newContent;
      const newSteps = [...rawSteps];
      newSteps[ji] = nextStep;
      const newStages = [...rawStages];
      newStages[si] = { ...stage, steps: newSteps };
      const newVs = { ...vs, stages: newStages };
      updateDigitalProblemValueStream(createdAt, newVs);
      currentProblemDetailItem = { ...item, valueStream: newVs };
    } else if (field === 'stageName') {
      const newStages = [...rawStages];
      newStages[si] = { ...stage, name: newContent, title: newContent, stage_name: newContent };
      const newVs = { ...vs, stages: newStages };
      updateDigitalProblemValueStream(createdAt, newVs);
      currentProblemDetailItem = { ...item, valueStream: newVs };
    } else return false;
    return true;
  }

  return false;
}

/** 提炼客户聊天输入的意图：当前任务、阶段、意图类型及具体内容；结合沟通历史搜索最匹配的内容单元并协助定位
 * @param {string} text - 用户输入
 * @param {string} context - 沟通历史与页面结构
 * @param {{ currentTaskHint?: string | null, globalScope?: boolean }} options - currentTaskHint: 当前任务提示，优先考虑；globalScope: 用户点击「不对」时传 true，全局匹配
 */
async function extractUserIntentFromChat(text, context, options = {}) {
  const { currentTaskHint, globalScope } = options;
  const tasksDesc = FOLLOW_TASKS.map((t) => `- ${t.id}: ${t.name}（${t.stage}）`).join('\n');
  const taskHintBlock = globalScope
    ? `【当前任务】用户表示当前任务推断不对，请从【任务列表】中全局搜索，判断用户意图与哪个任务最为相关，不要受沟通历史中任务标签的局限。`
    : currentTaskHint
      ? `【当前任务】当前对话上下文最可能涉及的任务为 ${currentTaskHint}（${FOLLOW_TASKS.find((t) => t.id === currentTaskHint)?.name || currentTaskHint}）。请优先考虑用户意图与此任务的关联；若用户输入明显与其它任务更相关，则选择最相关的任务。`
      : '';
  const systemPrompt = `你是一个数字化问题跟进对话的意图分析助手。用户会在聊天区输入消息，请结合【沟通历史】和【当前页面内容结构】提炼意图，从上下文中搜索最为匹配的内容单元，协助定位到对应的页面位置。
${taskHintBlock ? `\n${taskHintBlock}\n` : ''}
【任务列表】
${tasksDesc}

【输出格式】
{
  "taskId": "task1",
  "taskName": "企业背景洞察",
  "stage": "需求理解",
  "intent": "query" | "modification" | "execute" | "discussion",
  "queryTarget": "用户想查询的具体内容，仅当 intent 为 query 时填写",
  "discussionTopic": "用户想请教或讨论的具体话题，仅当 intent 为 discussion 时填写",
  "queryValueStreamLevel": "step" | "stage" | "card",
  "queryValueStreamTarget": "环节名或阶段名",
  "modificationTarget": "用户想修改的具体内容或目标，仅当 intent 为 modification 时填写",
  "modificationField": "具体要修改的字段名称，仅当 intent 为 modification 且能明确到具体字段时填写",
  "modificationValueStreamLevel": "step" | "stage" | "card",
  "modificationValueStreamTarget": "环节名或阶段名",
  "modificationClear": true | false,
  "modificationNewValue": "用户希望修改成的具体内容",
  "executeTaskId": "task2",
  "executeTaskName": "商业画布加载",
  "summary": "一句话概括用户意图"
}

【可修改字段参考】（modificationField 应使用以下精确字段名之一）
- 初步需求：客户名称、客户需求或挑战、客户IT现状、项目时间要求
- 客户基本信息：公司名称、信用代码、法人、成立时间、注册资本、是否上市、上市地、经营范围、核心资质、官方网站
- BMC：行业背景洞察、客户细分、价值主张、渠道通路、客户关系、收入来源、核心资源、关键业务、重要合作、成本结构、业务痛点预判
- 需求逻辑：行业底层逻辑与竞争共性、初步需求与商业模式的"因果关联"、需求背后的深层动机、逻辑链条总结

规则：
1. 结合【沟通历史】理解对话脉络，从【当前页面内容结构】中搜索与用户输入最为匹配的内容单元（字段名、环节名、阶段名等）。
2. taskId/taskName/stage：根据用户消息及沟通历史推断当前沟通涉及的任务及阶段，从上述任务列表中选择最相关的。
3. intent：简单查询(query) / 反馈修改意见(modification) / 执行操作(execute) / 请教讨论(discussion)
4. 若 intent=discussion：用户针对当前问题的各种专题进行延展性讨论或请教时填写。判断用户讨论话题与哪个任务最为相关，填写 taskId；填写 discussionTopic 概括讨论话题。
5. 若 intent=query，填写 queryTarget。若用户查询「某环节的 ITGap 分析」「某环节的局部 ITGap 分析」，填 taskId=task9，queryValueStreamTarget=环节名。若涉及价值流图（非 ITGap 分析），从【当前页面内容结构】中匹配环节名/阶段名，填写 queryValueStreamLevel 和 queryValueStreamTarget
6. 若 intent=modification：必须判断 modificationClear。仅当用户明确指定了「把什么改成什么」（具体修改对象+修改后的值）时填 true，否则填 false。若用户只说「想修改」「改一下」等未明确具体内容，填 false。modificationNewValue 仅当 modificationClear 为 true 时填写用户希望修改成的具体内容。
7. 若 intent=modification 且 modificationClear=true，填写 modificationTarget、modificationField 或 modificationValueStreamTarget；从【当前页面内容结构】中匹配最具体的字段名/环节名/阶段名。
8. 若涉及价值流图：从【当前页面内容结构】的价值流阶段与环节中精确匹配，modificationValueStreamLevel 填 step/stage/card，modificationValueStreamTarget 填匹配到的环节名或阶段名（必须与结构中出现的名称一致）
9. 若 intent=execute，填写 executeTaskId 和 executeTaskName。当用户说「重新进行需求逻辑构建」「重新构建需求逻辑」等时，intent=execute，executeTaskId=task3
10. summary：用一句话概括用户意图
11. 若无法明确推断，相关字段可填空字符串或合理默认值
12. 只返回 JSON，不要有 markdown 代码块包裹`;

  const ctx = context ? `\n${context}` : '';
  const { content, usage, model, durationMs } = await fetchDeepSeekChat([
    { role: 'system', content: systemPrompt },
    { role: 'user', content: `用户输入：${text}${ctx}` },
  ]);
  const jsonMatch = content.match(/\{[\s\S]*\}/);
  const jsonStr = jsonMatch ? jsonMatch[0] : content;
  const parsed = JSON.parse(jsonStr);
  const result = { ...parsed, _llmMeta: { usage, model, durationMs } };

  // 简单查询意图下，进一步判断是全局/宏观查询还是特定任务查询：
  // 若是全局/宏观查询，则在解析卡片中将「当前任务」显示为「整个任务」，stage 为「整体」。
  if (result.intent === 'query') {
    const fullText = String(text || '').toLowerCase();
    const qTarget = String(result.queryTarget || '').toLowerCase();
    const summary = String(result.summary || '').toLowerCase();
    const combined = `${fullText} ${qTarget} ${summary}`;
    const isMacroQuery = /整体|全局|全盘|总体|全貌|整体情况|全局情况|整个项目|整个任务|整个流程|当前阶段|现在什么阶段|目前什么阶段|目前处于什么阶段|现在处于什么阶段|进度|做到哪一步|进行到哪/.test(
      combined
    );
    const taskNames = [...FOLLOW_TASKS, ...ITGAP_HISTORY_TASKS, ...(typeof IT_STRATEGY_TASKS !== 'undefined' ? IT_STRATEGY_TASKS : [])].map(
      (t) => String(t.name || '').toLowerCase()
    );
    const mentionsSpecificTask = taskNames.some((name) => name && combined.includes(name));
    const mentionsValueStreamDetail = /价值流|环节|节点|阶段任务/.test(combined);
    if (isMacroQuery && !mentionsSpecificTask && !mentionsValueStreamDetail) {
      result.taskId = result.taskId || 'all';
      result.taskName = '整个任务';
      result.stage = result.stage || '整体';
    }
  }

  return result;
}

/** 解析用户输入的客户基本信息，提取结构化字段 */
async function parseCompanyBasicInfoInput(text) {
  const systemPrompt = `你是一个专业的企业信息提取助手。用户会输入一段关于企业基本信息的描述（可能是复制粘贴或自由输入），请从中提炼出以下字段，以 JSON 格式返回，不要包含其他内容：

{
  "company_name": "企业名称/公司名称",
  "credit_code": "统一社会信用代码",
  "legal_representative": "法定代表人",
  "established_date": "成立日期",
  "registered_capital": "注册资本",
  "is_listed": "是否上市",
  "listing_location": "上市地点",
  "business_scope": "经营范围",
  "core_qualifications": "核心资质",
  "official_website": "官网"
}

如果某字段无法从输入中推断，该字段填 "" 或 "—"。只返回 JSON，不要有 markdown 代码块包裹。`;

  const { content, usage, model, durationMs } = await fetchDeepSeekChat([
    { role: 'system', content: systemPrompt },
    { role: 'user', content: text },
  ]);
  const jsonMatch = content.match(/\{[\s\S]*\}/);
  const jsonStr = jsonMatch ? jsonMatch[0] : content;
  return { parsed: JSON.parse(jsonStr), usage, model, durationMs };
}

const BMC_GENERATION_PROMPT = `# Role
你是一位拥有15年经验的【首席商业架构师】与【数字化转型专家】。你擅长通过有限的工商基础数据，透视企业的底层运作逻辑，并能精准识别制造业、服务业或科技企业的核心商业要素。

# Task
请基于提供的【客户基础信息】，运用商业模式画布（Business Model Canvas）框架，深度分析该企业的经营模式。

# Input Data (JSON/Text)：公司基本信息 json 数据

# Analysis Logic (推演要求)
在构建画布时，请不要简单重复经营范围，而是基于行业常识进行逻辑推演：
1. **产业链定位**：判断其处于上游原材料、中游加工制造、还是下游终端销售？
2. **核心驱动力**：该企业是靠"技术创新"驱动、"规模成本"驱动，还是"特许经营/资质"驱动？
3. **客户关系特征**：是B2B的长账期/强关系模式，还是B2C的快消/流量模式？

# Output Format (输出要求)
请按以下结构输出，使用 JSON 格式，只返回 JSON 不要有其他内容：

{
  "industry_insight": "行业背景洞察：简述该企业所属赛道的现状、准入门槛及当前的数字化趋势。",
  "customer_segments": "客户细分 (CS)：识别直接买家与最终受益者。",
  "value_propositions": "价值主张 (VP)：解决客户什么痛点？提供什么独特的性能、成本或品牌价值？",
  "channels": "渠道通路 (CH)：销售网络、物流交付及售后反馈路径。",
  "customer_relationships": "客户关系 (CR)：合作深度。",
  "revenue_streams": "收入来源 (RS)：盈利模式。",
  "key_resources": "核心资源 (KR)：关键资产。",
  "key_activities": "关键业务 (KA)：每日核心运作。",
  "key_partnerships": "重要合作 (KP)：上游供应商、技术研发机构等。",
  "cost_structure": "成本结构 (CS)：主要开支。",
  "pain_points": "业务痛点预判：基于上述画布，推测该企业在排产/库存/销售/财务环节可能面临的数字化挑战（至少3条）。"
}`;

const REQUIREMENT_LOGIC_PROMPT = `# Role
你是一位资深的【数字化转型顾问】与【行业分析专家】，擅长通过企业的商业架构（BMC）与业务现状推导底层需求逻辑。

# Input Data
请分析以下三个维度的数据：
1. **企业基本信息**：当前需求理解页面中企业基本信息 json；
2. **商业模式画布 (BMC)**：当前需求理解页面中商业模式画布 BMC 的 json 数据；
3. **客户初步需求**：当前需求理解页面中客户初步需求json 数据；

# Task
请针对以上输入，深度产出【需求背后的逻辑链条分析】。你需要回答：在这个特定的行业背景和商业模式下，客户为什么会提出这些具体的需求？其底层的商业动机是什么？

# Analysis Framework (思考框架)
请按以下逻辑进行深度解构：

## 1. 行业底层逻辑与竞争共性
- 分析该企业所属赛道的典型特征（如：重资产、短周转、强季节性、高定制化等）。
- 该行业目前普遍面临的外部压力（如：供应链波动、利润摊薄、存量竞争等）。

## 2. 需求与商业模式的"因果关联"
- **盈利驱动分析**：需求如何响应 BMC 中的"收入来源"或"成本结构"？（例如：是为了降低核心业务的哪部分成本？）
- **客户价值保障**：需求如何支撑 BMC 中的"价值主张"？（例如：为了提高对核心大客户的交付准时率？）
- **资源杠杆效应**：需求如何优化 BMC 中的"核心资源"利用率？（例如：利用AI优化昂贵的生产线排产。）

## 3. 需求背后的深层动机（The "Why"）
- **显性动机**：客户在需求描述中直接提到的目标。
- **隐性风险驱动**：客户没说出口、但在该模式下必须解决的风险（如：资金周转风险、业务员离职导致的客户流失、由于数据孤岛导致的决策滞后）。

## 4. 逻辑链条总结
请用一句话概括逻辑链条：
因为【行业特性/现状】+【企业的商业模式局限】，导致了【当前业务场景痛点】，所以客户迫切需要通过【提出的功能需求】来实现【最终的商业目标】。

# Output Format
请以结构化的 Markdown 文档输出，确保语言专业、逻辑严密，能为后续的需求规格说明书（SRS）提供支撑。

# Output Requirements (输出必须包含)
输出必须包含以下四个部分，每个部分必须有实质性内容（不少于 2 句话），格式如下，顺序不可调换：

\`\`\`
## 1. 行业底层逻辑与竞争共性
（此处填写该企业所属赛道的典型特征、行业面临的外部压力等，不少于 2 句话）

## 2. 初步需求与商业模式的"因果关联"
（此处填写需求与 BMC 收入/成本/价值主张/核心资源的关联分析，不少于 2 句话）

## 3. 需求背后的深层动机
（此处填写显性动机与隐性风险驱动，不少于 2 句话）

## 4. 逻辑链条总结
（此处用一句话概括：因为【行业特性】+【商业模式局限】→【业务痛点】→【功能需求】→【商业目标】）
\`\`\`

注意：每个 ## 标题下方必须紧跟具体分析内容，不可留空。`;

const VALUE_STREAM_PROMPT = `# 角色设定
你是一位资深的业务架构师与 B-End 需求分析师，擅长通过客户的工商背景、商业画布（BMC）及具体业务逻辑，梳理并绘制业务核心价值流图（Value Stream Map）。你的目标是识别业务环节中的转化效率、角色分工，并为后续的 IT Gap 分析提供可视化基础。

# 输入数据说明
我将为你提供三个维度的 JSON 数据：
- enterprise_info: 当前需求单→需求理解页面中的客户基本信息 json 数据。
- bmc_data: 当前需求单→需求理解页面中的商业模式画布 BMC json 数据。
- requirement_logic: 当前需求单→需求理解页面中的需求逻辑 json 数据。

# 绘图指令与规范
请根据输入数据，生成价值流图结构：
1. **阶段划分（Stages）**：将全流程划分为 5 个左右的核心阶段（如：市场洞察、方案决策、执行交付等）。
2. **原子任务（Tasks）**：每个阶段内包含 1-3 个具体的作业项。
3. **节点属性**：每个作业项必须标注：
   - 3.1）任务名称（如：整理数据）
   - 3.2）执行角色（如：数据专员）
   - 3.3）预估耗时/提前期（如：30分钟、1天）
4. **逻辑连接**：使用箭头连接任务，体现前后序依赖关系。

# 输出格式
请先输出逻辑说明（简要说明价值流设计思路），然后提供一个可用于绘图的 JSON 代码块。JSON 结构需满足前端绘图组件要求，建议格式示例：
\`\`\`json
{
  "stages": [
    {
      "name": "阶段名称",
      "tasks": [
        {
          "name": "任务名称",
          "role": "执行角色",
          "duration": "预估耗时"
        }
      ]
    }
  ],
  "connections": [{"from": "任务A", "to": "任务B"}]
}
\`\`\`
只返回逻辑说明和 JSON 代码块，不要有其他内容。`;

const IT_STATUS_ANNOTATION_PROMPT = `# 角色设定
你是一位资深的业务架构师与 IT 现状分析专家，擅长结合需求逻辑判断各业务环节的 IT 支撑方式。

# 输入数据
1. **requirement_logic**：当前需求单→需求理解页面→需求逻辑→需求背后的逻辑链条总结部分的 json 数据。
2. **value_stream**：已绘制的价值流图 JSON，包含 stages 及每个 stage 下的 steps（环节节点）。

# 任务
请结合需求逻辑，在价值流图的每个环节节点标注该环节的 IT 现状：
- **手工**：若该环节依赖人工操作，需进一步区分：\`纸质\` 或 \`excel\`
- **系统**：若该环节有系统支撑，标注具体系统名称（如：ERP、MES、OA 等）

# 输出格式
请直接返回一个 JSON 代码块，结构与输入 value_stream 一致，但在每个 step 中增加 \`itStatus\` 字段：
\`\`\`json
{
  "stages": [
    {
      "name": "阶段名称",
      "steps": [
        {
          "name": "环节名称",
          "role": "执行角色",
          "duration": "预估耗时",
          "itStatus": { "type": "手工", "detail": "纸质" }
        },
        {
          "name": "另一环节",
          "itStatus": { "type": "系统", "detail": "ERP系统" }
        }
      ]
    }
  ]
}
\`\`\`
- itStatus.type 只能是 \`手工\` 或 \`系统\`
- itStatus.detail：手工时为 \`纸质\` 或 \`excel\`；系统时为具体系统名称
- 保持原有 stages、steps 结构及 name、role、duration 等字段不变，仅新增 itStatus`;

const PAIN_POINT_ANNOTATION_PROMPT = `# 角色设定
你是一位资深的业务架构师与痛点分析专家，擅长结合需求逻辑识别各业务环节中的痛点。

# 输入数据
1. **requirement_logic**：当前需求单→需求理解页面→需求逻辑内容。
2. **value_stream**：已绘制的价值流图 JSON，包含 stages 及每个 stage 下的 steps（环节节点）。

# 任务
请结合需求逻辑，在价值流图的每个环节节点中提炼该环节涉及到的痛点。为每个 step 增加 \`painPoint\` 字段，内容为该环节痛点的精炼概括（一句话或简短列表）。若某环节无明显痛点，可留空字符串或简短说明「无明显痛点」。

# 输出格式
请直接返回一个 JSON 代码块，结构与输入 value_stream 一致，但在每个 step 中增加 \`painPoint\` 字段：
\`\`\`json
{
  "stages": [
    {
      "name": "阶段名称",
      "steps": [
        {
          "name": "环节名称",
          "painPoint": "该环节痛点的提炼概括"
        }
      ]
    }
  ]
}
\`\`\`
- painPoint 为字符串，提炼当前环节涉及到的痛点
- 保持原有 stages、steps 结构及 name、role、duration、itStatus 等字段不变，仅新增 painPoint`;

const GLOBAL_ITGAP_PROMPT = `# 角色设定
你是一位拥有工业数字化背景的资深业务架构师。你擅长运用 McKinsey 7-Step 方法论，从全局视角审视企业端到端流程中的"IT 断点"。

# 输入背景说明
我将为你提供三个核心数据集：
- enterprise_context: 包含客户工商信息及核心业务逻辑
- business_canvas: 描述客户的商业模式（BMC），特别是核心资源与关键业务
- full_process_vsm: 包含从需求获取到成品交付的全链路价值流图，以及各环节的 IT 现状与痛点描述

# 任务要求
请跳出单一环节的限制，针对全链路执行"全局 IT Gap 分析"，并按以下维度输出：

1. **全局架构失调诊断 (Structural Gap)**：识别是否存在"烟囱式"架构或数据孤岛；分析数据从最上游（销售/预测）到最下游（物流/发货）的流转损耗率。

2. **决策协同断裂分析 (Collaboration Gap)**：识别跨部门（如销售与生产、财务与计划）之间的信息不对称点；重点分析"经验驱动"而非"数据驱动"的决策节点。

3. **数字化覆盖盲区 (Digital Blind Spots)**：找出目前仍依赖手动 Excel、线下纸质单据或口头传达的"重度人工干预区"；分析现有老旧系统对新业务模式的支撑乏力点。

4. **优先级建议矩阵 (Roadmap Strategy)**：基于"实施难度"与"业务价值"，给出填补 Gap 的建议顺序；区分"基础底座型 Gap"与"业务增量型 Gap"。

# 输出格式
请以 JSON 格式返回，包含以下字段（均支持 Markdown）：
\`\`\`json
{
  "structuralGap": "全局架构失调诊断（烟囱式架构、数据孤岛、流转损耗等）",
  "collaborationGap": "决策协同断裂分析（跨部门信息不对称、经验驱动决策节点等）",
  "digitalBlindSpots": "数字化覆盖盲区（重度人工干预区、老旧系统支撑乏力点等）",
  "roadmapStrategy": "优先级建议矩阵（实施难度与业务价值、基础底座型与业务增量型 Gap）",
  "globalInsight": "深刻的全局洞察结论（Markdown）",
  "asIsToBeTable": "As-Is（现状）与 To-Be（目标）对比表格（Markdown）",
  "top3Gaps": ["核心 IT 缺口 1", "核心 IT 缺口 2", "核心 IT 缺口 3"]
}
\`\`\`
- structuralGap、collaborationGap、digitalBlindSpots、roadmapStrategy：对应上述四个维度的分析内容
- globalInsight：一段深刻的全局洞察
- asIsToBeTable：使用 Markdown 表格展示现状与目标对比
- top3Gaps：Top 3 必须优先解决的"核心 IT 缺口"`;

const LOCAL_ITGAP_PROMPT = `# 角色设定
你是一位资深的数字化转型顾问，擅长进行"As-Is（现状） vs To-Be（目标）"的差异分析。现在请基于当前问题的全局 ITGap 分析 json 数据，针对当前环节【替换环节名称】进行深度的局部 IT Gap 分析。

# 全局背景约束
- **架构现状**：企业存在严重的"烟囱式"系统架构，数据孤岛现象明显，销售、财务与生产系统缺乏实时联动。
- **核心痛点**：业务高度依赖人工经验，系统仅作为"记录工具"而非"决策工具"。
- **全局目标**：实现全链路数据透明化，由"人找事"转变为"数据驱动决策"。

# 任务要求
请按以下结构输出该环节的 IT Gap 分析，确保分析结果能直接支撑 IT Gap 的闭环：

1. **现状透视 (Status Quo)**：总结该环节目前的作业模式、IT 支持程度及最致命的瓶颈。
2. **IT Gap 三维映射表**：
   - 数据层 Gap：缺少哪些实时字段、哪些系统间的数据流是断开的？
   - 功能层 Gap：现有系统缺失哪些核心算法、自动化逻辑或控制节点？
   - 体验/效率层 Gap：哪些环节还依赖 Excel/线下沟通？
3. **IT 转型建议 (Actionable Requirements)**：将上述 Gap 翻译为具体的 IT 功能点建议（如：开发 XX 接口、建立 XX 模型、引入 XX 规则引擎）。
4. **业务价值预测**：填补此 Gap 后，能为企业带来哪些量化的业务提升（如：缩短换线时间 20% 等）。

# 输出格式
请仅返回一个 JSON 对象，必须包含以下四个字段（字段名不可更改，均支持 Markdown）：
\`\`\`json
{
  "statusQuo": "现状透视内容（该环节作业模式、IT支持程度、最致命瓶颈）",
  "itGap3DMap": "IT Gap 三维映射表（数据层/功能层/体验效率层 Gap 分别描述）",
  "actionableRequirements": "IT 转型建议（具体功能点，如开发XX接口、建立XX模型）",
  "businessValuePrediction": "业务价值预测（量化提升，如缩短换线时间20%）"
}
\`\`\`
重要：只返回上述 JSON，不要用 Markdown 标题分段，每个维度的内容必须放入对应字段中。`;

const LOCAL_ITGAP_STRUCTURED_SECTIONS = [
  { key: 'statusQuo', label: '现状透视 (Status Quo)', isPrimary: true },
  { key: 'itGap3DMap', label: 'IT Gap 三维映射表', isPrimary: true },
  { key: 'actionableRequirements', label: 'IT 转型建议 (Actionable Requirements)', isPrimary: true },
  { key: 'businessValuePrediction', label: '业务价值预测', isPrimary: false },
];

/**
 * 根据端到端流程 valueStream 生成所有环节的局部 ITGap 分析 session（不调用大模型）
 * 每个 session 包含：环节名称、局部 ITGap 分析提示词、局部 ITGap 分析 json、局部 ITGap 分析 markdown
 */
function generateLocalItGapSessions(valueStream) {
  const { stages } = parseValueStreamGraph(valueStream || {});
  const allSteps = stages.flatMap((s) => s.steps);
  return allSteps.map((step, i) => {
    const stepName = step?.name || `环节${i + 1}`;
    const prompt = LOCAL_ITGAP_PROMPT.replace(/【替换环节名称】/g, stepName || '当前环节');
    return {
      stepName,
      stepIndex: i,
      prompt,
      analysisJson: null,
      analysisMarkdown: '',
    };
  });
}

const GLOBAL_ITGAP_STRUCTURED_SECTIONS = [
  { key: 'structuralGap', label: '全局架构失调诊断 (Structural Gap)' },
  { key: 'collaborationGap', label: '决策协同断裂分析 (Collaboration Gap)' },
  { key: 'digitalBlindSpots', label: '数字化覆盖盲区 (Digital Blind Spots)' },
  { key: 'roadmapStrategy', label: '优先级建议矩阵 (Roadmap Strategy)' },
  { key: 'globalInsight', label: '全局洞察结论' },
  { key: 'asIsToBeTable', label: 'As-Is（现状）与 To-Be（目标）' },
  { key: 'top3Gaps', label: 'Top3 核心 IT 缺口', isArray: true },
];

/** 去除内容开头与蓝色子标题重复的 markdown 小标题（如 ## 标题、**标题** 等） */
function stripRedundantHeadingFromContent(content, label) {
  if (!content || typeof content !== 'string') return content;
  let text = content.trim();
  const chinesePart = (label.match(/^([^（(]+)/) || [])[1]?.trim() || label;
  const esc = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const patterns = [
    new RegExp(`^#+\\s*[^\\n]*${esc(chinesePart)}[^\\n]*\\n?`),
    new RegExp(`^\\*\\*[^\\n]*${esc(chinesePart)}[^\\n]*\\*\\*\\s*\\n?`),
    new RegExp(`^${esc(chinesePart)}[\\s:：]*\\n?`),
  ];
  for (const re of patterns) {
    const prev = text;
    text = text.replace(re, '').trim();
    if (prev !== text) break;
  }
  return text || content;
}

function buildGlobalItGapStructuredHtml(analysis) {
  if (!analysis || typeof analysis !== 'object') return '<p>（暂无内容）</p>';
  const parts = [];
  for (const { key, label, isArray } of GLOBAL_ITGAP_STRUCTURED_SECTIONS) {
    let val = analysis[key];
    if (isArray && Array.isArray(val)) {
      val = val.map((g, i) => `${i + 1}. ${g}`).join('\n');
    } else if (isArray) {
      val = '';
    }
    let content = (val != null ? String(val).trim() : '') || '—';
    if (content !== '—') content = stripRedundantHeadingFromContent(content, label);
    parts.push(`<div class="problem-detail-global-itgap-section"><h4 class="problem-detail-global-itgap-section-title">${escapeHtml(label)}</h4><div class="problem-detail-global-itgap-section-content markdown-body">${content === '—' ? '—' : renderMarkdown(content)}</div></div>`);
  }
  return parts.join('');
}

const BMC_LABEL_TO_KEY = {
  '客户细分': 'customer_segments',
  '价值主张': 'value_propositions',
  '渠道通路': 'channels',
  '客户关系': 'customer_relationships',
  '收入来源': 'revenue_streams',
  '核心资源': 'key_resources',
  '关键业务': 'key_activities',
  '重要合作': 'key_partnerships',
  '成本结构': 'cost_structure',
};

function parseBmcFromMarkdown(text) {
  const result = { industry_insight: '', pain_points: '' };
  BMC_FIELDS.forEach((f) => { result[f.key] = ''; });
  result.comprehensive_review = '';
  const lines = text.split('\n');
  let section = '';
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (/^##\s*1\.\s*行业背景洞察/i.test(line)) { section = 'industry_insight'; continue; }
    if (/^##\s*2\.\s*商业模式画布/i.test(line)) { section = 'bmc_table'; continue; }
    if (/^##\s*3\.\s*业务痛点预判/i.test(line)) { section = 'pain_points'; continue; }
    if (section === 'industry_insight' && line && !line.startsWith('##')) {
      result.industry_insight += (result.industry_insight ? '\n' : '') + line.trim();
    }
    if (section === 'bmc_table' && line.includes('|')) {
      const m = line.match(/\*\*([^*]+)\*\*\s*\|\s*(.+)/);
      if (m) {
        const label = m[1].replace(/\s*\([A-Z]+\)\s*$/, '').trim();
        const content = m[2].replace(/\|$/, '').trim();
        const key = BMC_LABEL_TO_KEY[label] || BMC_FIELDS.find((f) => f.label === label)?.key;
        if (key) result[key] = content;
      }
    }
    if (section === 'pain_points' && line && !line.startsWith('##')) {
      result.pain_points += (result.pain_points ? '\n' : '') + line.trim();
    }
  }
  result.comprehensive_review = [result.industry_insight, result.pain_points].filter(Boolean).join('\n\n');
  return result;
}

const REQUIREMENT_LOGIC_SECTIONS = [
  { key: 'industry_competition', label: '行业底层逻辑与竞争共性' },
  { key: 'causal_relation', label: '初步需求与商业模式的"因果关联"' },
  { key: 'deep_motivation', label: '需求背后的深层动机' },
  { key: 'logic_summary', label: '逻辑链条总结' },
];

function parseRequirementLogicFromMarkdown(text) {
  const result = {};
  REQUIREMENT_LOGIC_SECTIONS.forEach(({ key }) => { result[key] = ''; });
  if (!text || typeof text !== 'string') return result;
  text = text.replace(/^```[\w]*\n?|```\s*$/g, '').trim();
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    try {
      const obj = JSON.parse(jsonMatch[0]);
      REQUIREMENT_LOGIC_SECTIONS.forEach(({ key, label }) => {
        const val = obj[key] ?? obj[label] ?? obj[label.replace(/"/g, '')];
        if (val != null) result[key] = String(val).trim();
      });
      if (REQUIREMENT_LOGIC_SECTIONS.some(({ key }) => result[key])) return result;
    } catch (_) {}
  }
  const lines = text.split('\n');
  let section = '';
  const headerPatterns = [
    [/^#{1,3}\s*1[\.、]\s*行业底层逻辑/i, 'industry_competition'],
    [/^#{1,3}\s*2[\.、]\s*初步需求与商业模式/i, 'causal_relation'],
    [/^#{1,3}\s*3[\.、]\s*需求背后的深层动机/i, 'deep_motivation'],
    [/^#{1,3}\s*4[\.、]\s*逻辑链条总结/i, 'logic_summary'],
  ];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    let matched = false;
    for (const [pat, key] of headerPatterns) {
      if (pat.test(line)) {
        section = key;
        const afterColon = line.split(/[：:]/).slice(1).join(':').trim();
        if (afterColon) result[section] = afterColon;
        matched = true;
        break;
      }
    }
    if (matched) continue;
    if (section && result.hasOwnProperty(section)) {
      const trimmed = line.trim();
      if (trimmed && !/^#{1,3}\s*\d[\.、]/.test(trimmed)) {
        result[section] += (result[section] ? '\n' : '') + trimmed;
      }
    }
  }
  return result;
}

async function generateBmcFromBasicInfo(basicInfoJson) {
  const inputStr = typeof basicInfoJson === 'string' ? basicInfoJson : JSON.stringify(basicInfoJson, null, 2);
  const { content, usage, model, durationMs } = await fetchDeepSeekChat([
    { role: 'system', content: BMC_GENERATION_PROMPT },
    { role: 'user', content: inputStr },
  ]);
  const jsonMatch = content.match(/\{[\s\S]*\}/);
  let parsed;
  if (jsonMatch) {
    try { parsed = JSON.parse(jsonMatch[0]); } catch (_) { parsed = parseBmcFromMarkdown(content); }
  } else {
    parsed = parseBmcFromMarkdown(content);
  }
  return { parsed, usage, model, durationMs };
}

async function generateRequirementLogicFromInputs(preliminaryReqJson, basicInfoJson, bmcJson) {
  const userContent = `请基于以下三个维度的数据进行分析：

## 1. 客户初步需求 json
\`\`\`json
${typeof preliminaryReqJson === 'string' ? preliminaryReqJson : JSON.stringify(preliminaryReqJson, null, 2)}
\`\`\`

## 2. 企业基本信息 json
\`\`\`json
${typeof basicInfoJson === 'string' ? basicInfoJson : JSON.stringify(basicInfoJson, null, 2)}
\`\`\`

## 3. 商业模式画布 (BMC) json
\`\`\`json
${typeof bmcJson === 'string' ? bmcJson : JSON.stringify(bmcJson, null, 2)}
\`\`\``;
  const { content, usage, model, durationMs } = await fetchDeepSeekChat([
    { role: 'system', content: REQUIREMENT_LOGIC_PROMPT },
    { role: 'user', content: userContent },
  ]);
  return { content, usage, model, durationMs };
}

async function generateItStatusAnnotation(valueStream, requirementLogic) {
  const userContent = `请结合需求逻辑，在价值流图各环节标注 IT 现状。

## requirement_logic（需求逻辑 - 逻辑链条总结等）
\`\`\`json
${typeof requirementLogic === 'string' ? requirementLogic : JSON.stringify(requirementLogic || {}, null, 2)}
\`\`\`

## value_stream（已绘制的价值流图）
\`\`\`json
${typeof valueStream === 'string' ? valueStream : JSON.stringify(valueStream || {}, null, 2)}
\`\`\`

请按提示词要求，为每个环节增加 itStatus 字段，直接返回完整 JSON 代码块。`;
  const { content, usage, model, durationMs } = await fetchDeepSeekChat([
    { role: 'system', content: IT_STATUS_ANNOTATION_PROMPT },
    { role: 'user', content: userContent },
  ]);
  return { content, usage, model, durationMs };
}

async function generatePainPointAnnotation(valueStream, requirementLogic) {
  const userContent = `请结合需求逻辑，在价值流图各环节标注痛点。

## requirement_logic（需求逻辑 - 需求理解页面→需求逻辑内容）
\`\`\`json
${typeof requirementLogic === 'string' ? requirementLogic : JSON.stringify(requirementLogic || {}, null, 2)}
\`\`\`

## value_stream（已绘制的价值流图）
\`\`\`json
${typeof valueStream === 'string' ? valueStream : JSON.stringify(valueStream || {}, null, 2)}
\`\`\`

请按提示词要求，为每个环节增加 painPoint 字段，直接返回完整 JSON 代码块。`;
  const { content, usage, model, durationMs } = await fetchDeepSeekChat([
    { role: 'system', content: PAIN_POINT_ANNOTATION_PROMPT },
    { role: 'user', content: userContent },
  ]);
  return { content, usage, model, durationMs };
}

async function generateValueStreamFromInputs(enterpriseInfo, bmcData, requirementLogic) {
  const userContent = `请基于以下三个维度的数据生成价值流图：

## 1. enterprise_info（客户基本信息）
\`\`\`json
${typeof enterpriseInfo === 'string' ? enterpriseInfo : JSON.stringify(enterpriseInfo || {}, null, 2)}
\`\`\`

## 2. bmc_data（商业模式画布 BMC）
\`\`\`json
${typeof bmcData === 'string' ? bmcData : JSON.stringify(bmcData || {}, null, 2)}
\`\`\`

## 3. requirement_logic（需求逻辑）
\`\`\`json
${typeof requirementLogic === 'string' ? requirementLogic : JSON.stringify(requirementLogic || {}, null, 2)}
\`\`\``;
  const { content, usage, model, durationMs } = await fetchDeepSeekChat([
    { role: 'system', content: VALUE_STREAM_PROMPT },
    { role: 'user', content: userContent },
  ]);
  return { content, usage, model, durationMs };
}

async function generateGlobalItGapAnalysis(enterpriseContext, businessCanvas, fullProcessVsm) {
  const userContent = `## enterprise_context（客户工商信息及核心业务逻辑）
\`\`\`json
${typeof enterpriseContext === 'string' ? enterpriseContext : JSON.stringify(enterpriseContext || {}, null, 2)}
\`\`\`

## business_canvas（商业模式 BMC）
\`\`\`json
${typeof businessCanvas === 'string' ? businessCanvas : JSON.stringify(businessCanvas || {}, null, 2)}
\`\`\`

## full_process_vsm（全链路价值流图，含 IT 现状与痛点）
\`\`\`json
${typeof fullProcessVsm === 'string' ? fullProcessVsm : JSON.stringify(fullProcessVsm || {}, null, 2)}
\`\`\``;
  const { content, usage, model, durationMs } = await fetchDeepSeekChat([
    { role: 'system', content: GLOBAL_ITGAP_PROMPT },
    { role: 'user', content: userContent },
  ]);
  return { content, usage, model, durationMs };
}

async function generateLocalItGapAnalysis(stepName, globalItGapJson, fullProcessVsm) {
  const systemPrompt = LOCAL_ITGAP_PROMPT.replace(/【替换环节名称】/g, stepName || '当前环节');
  const userContent = `## 全局 ITGap 分析 json
\`\`\`json
${typeof globalItGapJson === 'string' ? globalItGapJson : JSON.stringify(globalItGapJson || {}, null, 2)}
\`\`\`

## 端到端流程 json（含各环节 IT 现状与痛点）
\`\`\`json
${typeof fullProcessVsm === 'string' ? fullProcessVsm : JSON.stringify(fullProcessVsm || {}, null, 2)}
\`\`\`

请针对环节「${(stepName || '').replace(/"/g, '\\"')}」进行局部 IT Gap 分析，按 JSON 格式返回。`;
  const { content, usage, model, durationMs } = await fetchDeepSeekChat([
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userContent },
  ]);
  return { content, usage, model, durationMs };
}

/** 从大模型返回内容中解析局部 ITGap 分析（支持 JSON 或 Markdown 分段） */
function parseLocalItGapFromContent(content) {
  const result = { statusQuo: '', itGap3DMap: '', actionableRequirements: '', businessValuePrediction: '' };
  if (!content || typeof content !== 'string') return result;
  const text = content.trim();
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    try {
      const parsed = JSON.parse(jsonMatch[0]);
      if (parsed && typeof parsed === 'object') {
        const keyMap = {
          statusQuo: ['statusQuo', 'status_quo', '现状透视'],
          itGap3DMap: ['itGap3DMap', 'it_gap_3d_map', 'itGap3dMap', 'IT Gap 三维映射表', 'it_gap_三维映射表'],
          actionableRequirements: ['actionableRequirements', 'actionable_requirements', 'IT 转型建议'],
          businessValuePrediction: ['businessValuePrediction', 'business_value_prediction', '业务价值预测'],
        };
        for (const [targetKey, aliases] of Object.entries(keyMap)) {
          for (const alias of aliases) {
            const val = parsed[alias];
            if (val != null && String(val).trim()) {
              result[targetKey] = String(val).trim();
              break;
            }
          }
        }
        if (Object.values(result).some((v) => v)) return result;
      }
    } catch (_) {}
  }
  const sectionHeaders = [
    { key: 'statusQuo', regex: /(?:^|\n)(?:#+\s*)?(?:1\.\s*)?现状透视\s*(?:\(Status Quo\))?\s*[:：]?\s*\n?/i },
    { key: 'itGap3DMap', regex: /(?:^|\n)(?:#+\s*)?(?:2\.\s*)?IT\s*Gap\s*三维映射表\s*[:：]?\s*\n?/i },
    { key: 'actionableRequirements', regex: /(?:^|\n)(?:#+\s*)?(?:3\.\s*)?IT\s*转型建议\s*(?:\(Actionable Requirements\))?\s*[:：]?\s*\n?/i },
    { key: 'businessValuePrediction', regex: /(?:^|\n)(?:#+\s*)?(?:4\.\s*)?业务价值预测\s*[:：]?\s*\n?/i },
  ];
  let lastIndex = -1;
  let lastKey = null;
  for (const { key, regex } of sectionHeaders) {
    const match = text.match(regex);
    if (match) {
      const start = match.index + match[0].length;
      if (lastKey && lastIndex >= 0) {
        const block = text.slice(lastIndex, match.index).trim();
        if (block) result[lastKey] = block;
      }
      lastIndex = start;
      lastKey = key;
    }
  }
  if (lastKey != null && lastIndex >= 0) {
    const block = text.slice(lastIndex).trim();
    if (block) result[lastKey] = block;
  }
  if (!Object.values(result).some((v) => v)) result.statusQuo = text;
  return result;
}

function buildLocalItGapStructuredHtml(analysis) {
  if (!analysis || typeof analysis !== 'object') return '<p>（暂无内容）</p>';
  const parts = [];
  for (const { key, label, isPrimary } of LOCAL_ITGAP_STRUCTURED_SECTIONS) {
    const val = analysis[key];
    let content = (val != null ? String(val).trim() : '') || '—';
    if (content !== '—') content = stripRedundantHeadingFromContent(content, label);
    const sectionClass = isPrimary !== false ? 'problem-detail-local-itgap-section' : 'problem-detail-local-itgap-section problem-detail-local-itgap-section-secondary';
    parts.push(`<div class="${sectionClass}"><h4 class="problem-detail-local-itgap-section-title">${escapeHtml(label)}</h4><div class="problem-detail-local-itgap-section-content markdown-body">${content === '—' ? '—' : renderMarkdown(content)}</div></div>`);
  }
  return parts.join('');
}

/** 将局部 ITGap 分析 JSON 转为 Markdown 文本 */
function buildLocalItGapMarkdown(analysis) {
  if (!analysis || typeof analysis !== 'object') return '';
  const parts = [];
  for (const { key, label } of LOCAL_ITGAP_STRUCTURED_SECTIONS) {
    const val = analysis[key];
    const content = (val != null ? String(val).trim() : '') || '';
    if (content) parts.push(`## ${label}\n\n${content}`);
  }
  return parts.join('\n\n');
}

const PARSE_PREVIEW_FIELDS = [
  { key: 'customerName', label: '客户名称' },
  { key: 'customerNeedsOrChallenges', label: '客户需求或挑战' },
  { key: 'customerItStatus', label: '客户IT现状' },
  { key: 'projectTimeRequirement', label: '项目时间要求' },
];

function renderParsePreview(parsed) {
  if (!el.parsePreviewContent) return;
  el.parsePreviewContent.innerHTML = PARSE_PREVIEW_FIELDS.map(({ key, label }) => {
    const value = parsed[key] != null ? String(parsed[key]).trim() : '—';
    return `<dt>${escapeHtml(label)}</dt><dd>${escapeHtml(value) || '—'}</dd>`;
  }).join('');
  if (el.parsePreview) {
    el.parsePreview.hidden = false;
  }
}

async function handleParseClick() {
  const input = el.digitalProblemInput;
  if (!input) return;
  const text = (input.value || '').trim();
  if (!text) {
    alert('请先输入企业名称及需要解决的数字化问题');
    return;
  }
  const btn = el.btnParse;
  if (!btn) return;
  btn.disabled = true;
  btn.textContent = '解析中…';
  if (el.parsePreview) el.parsePreview.hidden = true;
  try {
    if (!DEEPSEEK_API_KEY) {
      throw new Error('请在 main.js 中配置 DEEPSEEK_API_KEY 才能使用解析功能。');
    }
    const parsed = await parseDigitalProblemInput(text);
    lastParsedResult = parsed;
    renderParsePreview(parsed);
  } catch (err) {
    const msg = err.message || String(err);
    if (el.parsePreviewContent) {
      el.parsePreviewContent.innerHTML = `<dt>解析失败</dt><dd>${escapeHtml(msg)}</dd>`;
    }
    if (el.parsePreview) {
      el.parsePreview.hidden = false;
    }
  } finally {
    btn.disabled = false;
    btn.textContent = '解析';
  }
}

function getDigitalProblems() {
  try {
    const raw = localStorage.getItem(DIGITAL_PROBLEMS_STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveDigitalProblem(item) {
  const list = getDigitalProblems();
  list.unshift({ ...item, createdAt: new Date().toISOString() });
  localStorage.setItem(DIGITAL_PROBLEMS_STORAGE_KEY, JSON.stringify(list));
}

function removeDigitalProblem(index) {
  const list = getDigitalProblems();
  if (index < 0 || index >= list.length) return;
  list.splice(index, 1);
  localStorage.setItem(DIGITAL_PROBLEMS_STORAGE_KEY, JSON.stringify(list));
}

function updateDigitalProblemBasicInfo(createdAt, basicInfo) {
  const list = getDigitalProblems();
  const idx = list.findIndex((it) => it.createdAt === createdAt);
  if (idx < 0) return;
  const item = list[idx];
  const completed = item.completedStages || [];
  if (!completed.includes(0)) completed.push(0);
  completed.sort((a, b) => a - b);
  list[idx] = { ...item, basicInfo, completedStages: completed };
  localStorage.setItem(DIGITAL_PROBLEMS_STORAGE_KEY, JSON.stringify(list));
}

function updateDigitalProblemBmc(createdAt, bmc) {
  const list = getDigitalProblems();
  const idx = list.findIndex((it) => it.createdAt === createdAt);
  if (idx < 0) return;
  const item = list[idx];
  const completed = item.completedStages || [];
  if (!completed.includes(1)) completed.push(1);
  completed.sort((a, b) => a - b);
  list[idx] = { ...item, bmc, completedStages: completed };
  localStorage.setItem(DIGITAL_PROBLEMS_STORAGE_KEY, JSON.stringify(list));
}

function updateDigitalProblemRequirementLogic(createdAt, requirementLogic) {
  const list = getDigitalProblems();
  const idx = list.findIndex((it) => it.createdAt === createdAt);
  if (idx < 0) return;
  const item = list[idx];
  const completed = item.completedStages || [];
  if (!completed.includes(2)) completed.push(2);
  completed.sort((a, b) => a - b);
  list[idx] = { ...item, requirementLogic, completedStages: completed };
  localStorage.setItem(DIGITAL_PROBLEMS_STORAGE_KEY, JSON.stringify(list));
}

function updateDigitalProblemMajorStage(createdAt, majorStage) {
  const list = getDigitalProblems();
  const idx = list.findIndex((it) => it.createdAt === createdAt);
  if (idx < 0) return;
  const item = list[idx];
  list[idx] = { ...item, currentMajorStage: majorStage };
  localStorage.setItem(DIGITAL_PROBLEMS_STORAGE_KEY, JSON.stringify(list));
}

function updateDigitalProblemItGapCompletedStages(createdAt, stages) {
  const list = getDigitalProblems();
  const idx = list.findIndex((it) => it.createdAt === createdAt);
  if (idx < 0) return;
  const item = list[idx];
  list[idx] = { ...item, itGapCompletedStages: stages };
  localStorage.setItem(DIGITAL_PROBLEMS_STORAGE_KEY, JSON.stringify(list));
}

function updateDigitalProblemGlobalItGapAnalysis(createdAt, analysisJson) {
  const list = getDigitalProblems();
  const idx = list.findIndex((it) => it.createdAt === createdAt);
  if (idx < 0) return;
  const item = list[idx];
  const itGapCompleted = item.itGapCompletedStages || [];
  if (!itGapCompleted.includes(1)) itGapCompleted.push(1);
  itGapCompleted.sort((a, b) => a - b);
  list[idx] = { ...item, globalItGapAnalysisJson: analysisJson, itGapCompletedStages: itGapCompleted };
  localStorage.setItem(DIGITAL_PROBLEMS_STORAGE_KEY, JSON.stringify(list));
}

/** 清除全局 ITGap 分析及所有局部 ITGap 分析（工作区卡片及任务过程日志），流程状态重置到全局 ITGap 分析阶段 */
function clearDigitalProblemGlobalItGapAnalysis(createdAt) {
  const list = getDigitalProblems();
  const idx = list.findIndex((it) => it.createdAt === createdAt);
  if (idx < 0) return;
  const item = list[idx];
  const itGapCompleted = (item.itGapCompletedStages || []).filter((x) => x !== 1 && x !== 2).sort((a, b) => a - b);
  const { globalItGapAnalysisJson, localItGapAnalyses, localItGapSessions, ...rest } = item;
  list[idx] = { ...rest, itGapCompletedStages: itGapCompleted };
  localStorage.setItem(DIGITAL_PROBLEMS_STORAGE_KEY, JSON.stringify(list));
}

/** 保存局部 ITGap 分析 sessions 到问题记录 */
function updateDigitalProblemLocalItGapSessions(createdAt, sessions) {
  const list = getDigitalProblems();
  const idx = list.findIndex((it) => it.createdAt === createdAt);
  if (idx < 0) return;
  const item = list[idx];
  list[idx] = { ...item, localItGapSessions: sessions };
  localStorage.setItem(DIGITAL_PROBLEMS_STORAGE_KEY, JSON.stringify(list));
}

/** 追加局部 ITGap 分析到工作区并更新 itGapCompletedStages；同时更新 localItGapSessions 中对应 session */
function updateDigitalProblemLocalItGapAnalysis(createdAt, stepName, stepIndex, analysisJson, analysisMarkdown) {
  const list = getDigitalProblems();
  const idx = list.findIndex((it) => it.createdAt === createdAt);
  if (idx < 0) return;
  const item = list[idx];
  const analyses = item.localItGapAnalyses || [];
  const existing = analyses.findIndex((a) => a.stepIndex === stepIndex);
  const entry = { stepName, stepIndex, analysisJson };
  const newAnalyses = existing >= 0 ? analyses.map((a, i) => (i === existing ? entry : a)) : [...analyses, entry].sort((a, b) => a.stepIndex - b.stepIndex);
  const itGapCompleted = item.itGapCompletedStages || [];
  if (!itGapCompleted.includes(2)) itGapCompleted.push(2);
  itGapCompleted.sort((a, b) => a - b);
  const sessions = item.localItGapSessions || [];
  if (sessions.length > 0) {
    const newSessions = sessions.map((s) =>
      s.stepIndex === stepIndex ? { ...s, analysisJson, analysisMarkdown: analysisMarkdown || s.analysisMarkdown } : s
    );
    list[idx] = { ...item, localItGapAnalyses: newAnalyses, localItGapSessions: newSessions, itGapCompletedStages: itGapCompleted };
  } else {
    list[idx] = { ...item, localItGapAnalyses: newAnalyses, itGapCompletedStages: itGapCompleted };
  }
  localStorage.setItem(DIGITAL_PROBLEMS_STORAGE_KEY, JSON.stringify(list));
}

function updateDigitalProblemValueStream(createdAt, valueStream) {
  const list = getDigitalProblems();
  const idx = list.findIndex((it) => it.createdAt === createdAt);
  if (idx < 0) return;
  const item = list[idx];
  const wfCompleted = item.workflowAlignCompletedStages || [];
  if (!wfCompleted.includes(0)) wfCompleted.push(0);
  wfCompleted.sort((a, b) => a - b);
  list[idx] = { ...item, valueStream, workflowAlignCompletedStages: wfCompleted };
  localStorage.setItem(DIGITAL_PROBLEMS_STORAGE_KEY, JSON.stringify(list));
}

function updateDigitalProblemValueStreamItStatus(createdAt, valueStream) {
  const list = getDigitalProblems();
  const idx = list.findIndex((it) => it.createdAt === createdAt);
  if (idx < 0) return;
  const item = list[idx];
  const wfCompleted = item.workflowAlignCompletedStages || [];
  if (!wfCompleted.includes(0)) wfCompleted.push(0);
  if (!wfCompleted.includes(1)) wfCompleted.push(1);
  wfCompleted.sort((a, b) => a - b);
  list[idx] = { ...item, valueStream, workflowAlignCompletedStages: wfCompleted };
  localStorage.setItem(DIGITAL_PROBLEMS_STORAGE_KEY, JSON.stringify(list));
}

function updateDigitalProblemValueStreamPainPoint(createdAt, valueStream) {
  const list = getDigitalProblems();
  const idx = list.findIndex((it) => it.createdAt === createdAt);
  if (idx < 0) return;
  const item = list[idx];
  const wfCompleted = item.workflowAlignCompletedStages || [];
  if (!wfCompleted.includes(0)) wfCompleted.push(0);
  if (!wfCompleted.includes(1)) wfCompleted.push(1);
  if (!wfCompleted.includes(2)) wfCompleted.push(2);
  wfCompleted.sort((a, b) => a - b);
  list[idx] = { ...item, valueStream, workflowAlignCompletedStages: wfCompleted };
  localStorage.setItem(DIGITAL_PROBLEMS_STORAGE_KEY, JSON.stringify(list));
}

/** 撤销痛点标注：移除价值流图中的痛点，并将需求单状态回退至 IT 现状标注 */
function rollbackValueStreamPainPoint(createdAt) {
  const list = getDigitalProblems();
  const idx = list.findIndex((it) => it.createdAt === createdAt);
  if (idx < 0) return;
  const item = list[idx];
  const valueStream = item.valueStream;
  if (!valueStream || valueStream.raw) return;
  const rawStages = valueStream.stages ?? valueStream.phases ?? valueStream.nodes ?? [];
  if (!Array.isArray(rawStages)) return;
  const stages = rawStages.map((s) => {
    if (!s || typeof s !== 'object') return s;
    const rawSteps = s.steps ?? s.tasks ?? s.phases ?? s.items ?? [];
    const steps = rawSteps.map((st) => {
      if (typeof st !== 'object' || st == null) return st;
      const { painPoint, pain_point, ...rest } = st;
      return rest;
    });
    return { ...s, steps };
  });
  const vsWithoutPain = { ...valueStream, stages };
  const wfCompleted = (item.workflowAlignCompletedStages || []).filter((x) => x !== 2).sort((a, b) => a - b);
  list[idx] = { ...item, valueStream: vsWithoutPain, workflowAlignCompletedStages: wfCompleted };
  localStorage.setItem(DIGITAL_PROBLEMS_STORAGE_KEY, JSON.stringify(list));
}

function deleteDigitalProblemRequirementLogic(createdAt) {
  const list = getDigitalProblems();
  const idx = list.findIndex((it) => it.createdAt === createdAt);
  if (idx < 0) return;
  const item = list[idx];
  const { requirementLogic, ...rest } = item;
  const completedStages = (item.completedStages || []).filter((x) => x !== 2).sort((a, b) => a - b);
  list[idx] = { ...rest, completedStages };
  localStorage.setItem(DIGITAL_PROBLEMS_STORAGE_KEY, JSON.stringify(list));
}

function getProblemDetailChats() {
  try {
    const raw = localStorage.getItem(PROBLEM_DETAIL_CHATS_STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function saveProblemDetailChat(createdAt, messages) {
  const chats = getProblemDetailChats();
  chats[createdAt] = messages;
  localStorage.setItem(PROBLEM_DETAIL_CHATS_STORAGE_KEY, JSON.stringify(chats));
}

function getOperationHistory() {
  try {
    const raw = localStorage.getItem(OPERATION_HISTORY_STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function pushOperationToHistory(createdAt, type, snapshot, chatLengthBefore) {
  const all = getOperationHistory();
  if (!all[createdAt]) all[createdAt] = [];
  all[createdAt].push({ type, timestamp: Date.now(), snapshot, chatLengthBefore });
  localStorage.setItem(OPERATION_HISTORY_STORAGE_KEY, JSON.stringify(all));
}

function popOperationFromHistory(createdAt) {
  const all = getOperationHistory();
  const stack = all[createdAt];
  if (!Array.isArray(stack) || stack.length === 0) return null;
  const entry = stack.pop();
  all[createdAt] = stack;
  localStorage.setItem(OPERATION_HISTORY_STORAGE_KEY, JSON.stringify(all));
  return entry;
}

/** 将快照还原到数字化问题列表 */
function restoreItemFromSnapshot(createdAt, snapshot) {
  const list = getDigitalProblems();
  const idx = list.findIndex((it) => it.createdAt === createdAt);
  if (idx < 0) return;
  list[idx] = { ...snapshot, createdAt };
  localStorage.setItem(DIGITAL_PROBLEMS_STORAGE_KEY, JSON.stringify(list));
}

function getTaskTrackingData() {
  try {
    const raw = localStorage.getItem(TASK_TRACKING_STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function saveTaskTrackingData(createdAt, data) {
  const all = getTaskTrackingData();
  all[createdAt] = data;
  localStorage.setItem(TASK_TRACKING_STORAGE_KEY, JSON.stringify(all));
}

/** 根据聊天消息类型推断所属任务 */
function inferTaskIdFromMessage(msg) {
  if (!msg) return null;
  if (msg._taskId) return msg._taskId;
  const type = msg.type;
  const role = msg.role;
  const content = msg.content || '';
  if (type === 'basicInfoCard' || type === 'basicInfoJsonBlock' || (role === 'system' && (content === '解析完成' || content === '基本信息 json 提取完毕'))) return 'task1';
  if (type === 'bmcCard' || type === 'bmcStartBlock' || (role === 'system' && content.includes('BMC'))) return 'task2';
  if (type === 'requirementLogicBlock' || type === 'requirementLogicStartBlock') return 'task3';
  if (type === 'valueStreamCard' || type === 'drawValueStreamStartBlock' || type === 'valueStreamStartBlock' || (role === 'system' && (content.includes('价值流') || content.includes('绘制')))) return 'task4';
  if (type === 'itStatusStartBlock' || (role === 'system' && (content === 'IT 现状标注完成' || content === 'IT 现状标注失败'))) return 'task5';
  if (type === 'painPointStartBlock' || (role === 'system' && (content === '痛点标注完成' || content === '痛点标注完毕' || content === '痛点标注失败'))) return 'task6';
  if (type === 'intentExtractionCard' && msg.data?.taskId) return msg.data.taskId;
  if (type === 'e2eFlowGeneratedLog') return 'task7';
  if (type === 'e2eFlowExtractStartBlock' || type === 'e2eFlowJsonBlock') return 'task7';
  if (type === 'globalItGapStartBlock' || type === 'globalItGapAnalysisCard' || type === 'globalItGapAnalysisLog') return 'task8';
  if (type === 'localItGapStartBlock' || type === 'localItGapSessionsBlock' || type === 'localItGapAnalysisCard' || type === 'localItGapAnalysisLog') return 'task9';
  return null;
}

/** 判断消息是否应纳入任务沟通历史：仅大模型返回内容或用户主动输入；未确认的意图卡片不纳入；查询意图的客户输入与系统返回均不纳入；请教讨论纳入；用户纯「确认」不纳入 */
function shouldIncludeInCommunicationHistory(msg) {
  if (!msg) return false;
  if (msg.role === 'user') {
    if ((msg.content || '').trim() === '确认') return false;
    return true;
  }
  if (msg._taskId) return true; // 请教讨论的系统回复
  const type = msg.type;
  if (type === 'intentExtractionCard') {
    if (msg.data?.intent === 'query') return false; // 查询意图：系统返回内容不纳入
    if (msg.data?.intent === 'discussion') return false; // 请教讨论：意图卡片本身不纳入，用户消息与系统回复已单独处理
    return !!msg.confirmed;
  }
  if (type === 'basicInfoCard' || type === 'bmcCard' || type === 'requirementLogicBlock' || type === 'valueStreamCard') return true;
  if (type === 'e2eFlowGeneratedLog') return true;
  if (type === 'e2eFlowExtractStartBlock') return !!msg.confirmed;
  if (type === 'e2eFlowJsonBlock') return !!msg.confirmed;
  if (type === 'globalItGapStartBlock') return !!msg.confirmed;
  if (type === 'globalItGapAnalysisCard') return !!msg.confirmed;
  if (type === 'globalItGapAnalysisLog') return true;
  if (type === 'localItGapStartBlock') return !!msg.confirmed;
  if (type === 'localItGapSessionsBlock') return true;
  if (type === 'localItGapAnalysisCard') return !!msg.confirmed;
  if (type === 'localItGapAnalysisLog') return true;
  return false;
}

/** 将聊天消息按任务分段，返回 taskId -> communications（仅包含用户输入与大模型返回的内容块）；未确认的意图卡片及其触发的用户消息不纳入；查询意图的客户查询内容与系统返回均不纳入
 * 当前问题详情页时优先使用内存中的 problemDetailChatMessages，避免重复读 localStorage */
function getCommunicationsByTask(createdAt) {
  const useMemory = currentProblemDetailItem?.createdAt === createdAt && Array.isArray(problemDetailChatMessages) && problemDetailChatMessages.length > 0;
  const chats = useMemory ? problemDetailChatMessages : getProblemDetailChats()[createdAt];
  if (!Array.isArray(chats) || chats.length === 0) return {};
  let currentTask = 'task1';
  const byTask = {};
  FOLLOW_TASKS.forEach((t) => { byTask[t.id] = []; });
  ITGAP_HISTORY_TASKS.forEach((t) => { byTask[t.id] = []; });
  IT_STRATEGY_TASKS.forEach((t) => { byTask[t.id] = []; });
  let lastUserComm = null;
  for (const msg of chats) {
    const inferred = inferTaskIdFromMessage(msg);
    if (inferred) currentTask = inferred;
    const isQueryIntentCard = msg.type === 'intentExtractionCard' && msg.data?.intent === 'query';
    const isDiscussionIntentCard = msg.type === 'intentExtractionCard' && msg.data?.intent === 'discussion';
    const isUnconfirmedIntentCard = msg.type === 'intentExtractionCard' && !msg.confirmed;
    if (isQueryIntentCard || (isUnconfirmedIntentCard && !isDiscussionIntentCard)) {
      if (lastUserComm) {
        const comms = byTask[lastUserComm.task];
        if (comms.length > 0 && comms[comms.length - 1] === lastUserComm.entry) comms.pop();
        lastUserComm = null;
      }
      continue;
    }
    if (isDiscussionIntentCard) {
      if (msg.confirmed && lastUserComm) {
        const targetTaskId = msg.data?.taskId || currentTask;
        const commsFrom = byTask[lastUserComm.task];
        const idx = commsFrom.indexOf(lastUserComm.entry);
        if (idx >= 0) {
          commsFrom.splice(idx, 1);
          byTask[targetTaskId].push(lastUserComm.entry);
        }
        currentTask = targetTaskId;
        const extractionPayload = { role: 'system', type: 'intentExtractionCard', content: '讨论请教', data: msg.data, userText: msg.userText, timestamp: msg.timestamp };
        const extractionEntry = { speaker: '系统提炼', time: msg.timestamp || '', content: JSON.stringify(extractionPayload, null, 2) };
        byTask[targetTaskId].push(extractionEntry);
      } else if (lastUserComm) {
        const comms = byTask[lastUserComm.task];
        if (comms.length > 0 && comms[comms.length - 1] === lastUserComm.entry) comms.pop();
      }
      lastUserComm = null;
      continue;
    }
    if (!shouldIncludeInCommunicationHistory(msg)) continue;
    const speaker = msg.role === 'user' ? '用户' : '系统大模型';
    const payload = { role: msg.role, content: msg.content, type: msg.type, timestamp: msg.timestamp };
    if (msg.data) payload.data = msg.data;
    if (msg.parsed) payload.parsed = msg.parsed;
    if (msg.type === 'intentExtractionCard' && msg.userText) payload.userText = msg.userText;
    if (msg.type === 'e2eFlowGeneratedLog' && msg.valueStreamJson) payload.valueStreamJson = msg.valueStreamJson;
    if (msg.type === 'e2eFlowJsonBlock' && msg.valueStreamJson) payload.valueStreamJson = msg.valueStreamJson;
    if ((msg.type === 'globalItGapAnalysisCard' && msg.data) || (msg.type === 'globalItGapAnalysisLog' && msg.analysisJson)) payload.analysisJson = msg.data || msg.analysisJson;
    if ((msg.type === 'localItGapAnalysisCard' && msg.data) || (msg.type === 'localItGapAnalysisLog' && msg.analysisJson)) payload.analysisJson = msg.data || msg.analysisJson;
    if ((msg.type === 'localItGapAnalysisCard' || msg.type === 'localItGapAnalysisLog') && msg.stepName) payload.stepName = msg.stepName;
    if (msg.type === 'localItGapSessionsBlock' && msg.sessions) payload.sessions = msg.sessions;
    if ((msg.type === 'localItGapAnalysisCard' || msg.type === 'localItGapAnalysisLog') && msg.llmMeta) payload.llmMeta = msg.llmMeta;
    const contentJson = JSON.stringify(payload, null, 2);
    const entry = { speaker, time: msg.timestamp || '', content: contentJson };
    byTask[currentTask].push(entry);
    lastUserComm = msg.role === 'user' ? { task: currentTask, entry } : null;
  }
  return byTask;
}

/** 将沟通记录扁平化为按时间排序的时间线数组，供时间线视图使用 */
function getCommunicationsAsTimeline(createdAt) {
  const byTask = getCommunicationsByTask(createdAt);
  const flat = [];
  FOLLOW_TASKS.forEach((task) => {
    const comms = byTask[task.id] || [];
    comms.forEach((c) => {
      flat.push({ ...c, taskId: task.id, taskName: task.name });
    });
  });
  flat.sort((a, b) => {
    const ta = (a.time && new Date(a.time).getTime()) || 0;
    const tb = (b.time && new Date(b.time).getTime()) || 0;
    return ta - tb;
  });
  return flat;
}

/** 判断任务是否已完成（基于 problem 状态） */
function isTaskCompleted(item, taskId) {
  if (!item) return false;
  const completed = item.completedStages || [];
  const wfCompleted = item.workflowAlignCompletedStages || [];
  switch (taskId) {
    case 'task1': return !!(item.basicInfo);
    case 'task2': return completed.includes(1) || !!(item.bmc);
    case 'task3': return completed.includes(2) || !!(item.requirementLogic);
    case 'task4': return wfCompleted.includes(0) && !!(item.valueStream && !item.valueStream.raw);
    case 'task5': return wfCompleted.includes(1);
    case 'task6': return wfCompleted.includes(2);
    default: return false;
  }
}

function openTaskTracking(item) {
  currentProblemDetailItem = item;
  const createdAt = item?.createdAt;
  if (!createdAt) return;
  const customerName = (item.customerName || item.customer_name || '').trim() || '未命名';
  if (el.taskTrackingTitle) el.taskTrackingTitle.textContent = `${customerName} - 任务追踪`;
  const trackingData = getTaskTrackingData()[createdAt] || {};
  const communications = getCommunicationsByTask(createdAt);
  renderTaskTrackingList(item, trackingData, communications);
  renderTaskTrackingDetail(null);
  if (el.taskTrackingDetail) {
    el.taskTrackingDetail.innerHTML = '<p class="task-tracking-detail-placeholder">请从左侧选择任务查看详情</p>';
  }
  saveRouteState('taskTracking', { createdAt });
  switchView('taskTracking');
}

function renderTaskTrackingList(item, trackingData, communications) {
  const container = el.taskTrackingList;
  if (!container) return;
  container.innerHTML = FOLLOW_TASKS.map((task) => {
    const completed = isTaskCompleted(item, task.id);
    const taskData = trackingData[task.id] || {};
    const objective = taskData.objective ?? task.objective;
    const evaluationCriteria = taskData.evaluationCriteria ?? task.evaluationCriteria;
    const comms = communications[task.id] || [];
    const commCount = comms.length;
    const cls = completed ? ' task-tracking-item-done' : '';
    return `
      <div class="task-tracking-item${cls}" data-task-id="${task.id}" role="button" tabindex="0">
        <div class="task-tracking-item-header">
          <span class="task-tracking-item-name">${escapeHtml(task.id.charAt(0).toUpperCase() + task.id.slice(1) + '｜' + task.name)}</span>
          ${completed ? '<span class="task-tracking-item-check">✅</span>' : ''}
        </div>
        <div class="task-tracking-item-meta">
          <span class="task-tracking-item-stage">${escapeHtml(task.stage)}</span>
          ${commCount > 0 ? `<span class="task-tracking-item-comm">${commCount} 条沟通</span>` : ''}
        </div>
      </div>`;
  }).join('');
  container.querySelectorAll('.task-tracking-item').forEach((el) => {
    el.addEventListener('click', () => {
      const taskId = el.dataset.taskId;
      const task = FOLLOW_TASKS.find((t) => t.id === taskId);
      if (task) renderTaskTrackingDetail(task, item, trackingData[taskId], communications[taskId] || []);
    });
  });
}

function renderTaskTrackingDetail(task, item, taskData, communications) {
  const container = el.taskTrackingDetail;
  if (!container) return;
  if (!task) {
    container.innerHTML = '<p class="task-tracking-detail-placeholder">请从左侧选择任务查看详情</p>';
    return;
  }
  const def = FOLLOW_TASKS.find((t) => t.id === task.id) || task;
  const objective = (taskData?.objective ?? def.objective) || '—';
  const evaluationCriteria = (taskData?.evaluationCriteria ?? def.evaluationCriteria) || '—';
  const intentLabels = { query: '简单查询', modification: '反馈修改意见', execute: '执行操作', discussion: '讨论请教' };
  const commsHtml = communications.length === 0
    ? '<p class="task-tracking-comm-empty">暂无沟通记录</p>'
    : communications.map((c) => {
        const timeStr = c.time ? formatChatTime(c.time) : '—';
        const contentStr = typeof c.content === 'object' ? JSON.stringify(c.content, null, 2) : c.content;
        let titleLabel = c.speaker;
        try {
          const parsed = typeof c.content === 'string' ? JSON.parse(c.content) : c.content;
          if (parsed?.type === 'intentExtractionCard' && parsed?.data?.intent != null) {
            const intentLabel = intentLabels[parsed.data.intent] || parsed.data.intent || '—';
            titleLabel = `用户意图提炼：${intentLabel}`;
          }
        } catch (_) {}
        return `
        <div class="task-tracking-comm-item">
          <div class="task-tracking-comm-meta">
            <span class="task-tracking-comm-speaker">${escapeHtml(titleLabel)}</span>
            <span class="task-tracking-comm-time">${escapeHtml(timeStr)}</span>
          </div>
          <pre class="task-tracking-comm-content">${escapeHtml(contentStr)}</pre>
        </div>
      `;
      }).join('');
  container.innerHTML = `
    <div class="task-tracking-detail-card">
      <h3 class="task-tracking-detail-title">${escapeHtml(task.id.charAt(0).toUpperCase() + task.id.slice(1) + '｜' + task.name)}</h3>
      <div class="task-tracking-detail-section">
        <h4>归属阶段</h4>
        <p>${escapeHtml(task.stage)}</p>
      </div>
      <div class="task-tracking-detail-section">
        <h4>任务目标</h4>
        <p>${escapeHtml(objective)}</p>
      </div>
      <div class="task-tracking-detail-section">
        <h4>评估标准</h4>
        <p>${escapeHtml(evaluationCriteria)}</p>
      </div>
      <div class="task-tracking-detail-section">
        <h4>任务过程日志</h4>
        <div class="task-tracking-comm-list">${commsHtml}</div>
      </div>
    </div>`;
}

function truncateTo20(str) {
  const s = (str != null ? String(str).trim() : '') || '';
  if (s.length <= 20) return s;
  return s.slice(0, 20) + '…';
}

function formatProblemDate(createdAt) {
  if (!createdAt) return '—';
  try {
    const d = new Date(createdAt);
    if (Number.isNaN(d.getTime())) return String(createdAt);
    return d.toLocaleDateString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit' });
  } catch {
    return String(createdAt);
  }
}

const PROBLEM_FOLLOW_CARD_ICONS = {
  delete: '<svg class="problem-follow-icon problem-follow-icon-delete" xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg>',
};

function renderProblemFollowList() {
  const container = el.problemFollowListContent;
  const countEl = el.problemFollowCount;
  if (!container) return;
  const list = getDigitalProblems();
  if (countEl) countEl.textContent = `共有 ${list.length} 个客户档案`;
  if (!list.length) {
    container.innerHTML = '<p class="problem-follow-empty">暂无跟进项，解析后点击「启动跟进」添加</p>';
    return;
  }
  container.innerHTML = list.map((item) => {
    const index = list.indexOf(item);
    const customerName = (item.customerName ?? item.customer_name ?? '').trim() || '未命名';
    const dateStr = formatProblemDate(item.createdAt);
    const gradientClass = index % 2 === 0 ? 'problem-follow-card-accent-a' : 'problem-follow-card-accent-b';
    return `<div class="problem-follow-card" data-index="${index}">
      <div class="problem-follow-card-accent ${gradientClass}"></div>
      <div class="problem-follow-card-body">
        <div class="problem-follow-card-title">${escapeHtml(customerName)}</div>
        <div class="problem-follow-card-date">📅 ${escapeHtml(dateStr)}</div>
        <div class="problem-follow-card-actions">
          <button type="button" class="btn-problem-follow-start" data-index="${index}">详情</button>
          <button type="button" class="btn-problem-follow-delete" data-index="${index}" aria-label="删除">${PROBLEM_FOLLOW_CARD_ICONS.delete}</button>
        </div>
      </div>
    </div>`;
  }).join('');
}

function openProblemDetail(item) {
  if (lastModificationClarification && lastModificationClarification.createdAt !== item?.createdAt) {
    lastModificationClarification = null;
  }
  currentProblemDetailItem = item;
  problemDetailConfirmedBasicInfo = item.basicInfo || null;
  // 使用已保存的 currentMajorStage，确保再次进入时自动加载对应大节段页面
  const majorStage = currentProblemDetailItem.currentMajorStage ?? item.currentMajorStage ?? 0;
  if (majorStage >= 2) {
    console.log('[局部ITGap] openProblemDetail: 进入 ITGap 阶段', {
      createdAt: item.createdAt,
      currentMajorStage: majorStage,
      itGapCompletedStages: item.itGapCompletedStages,
      hasValueStream: !!(item.valueStream && !item.valueStream?.raw),
      hasGlobalItGap: !!item.globalItGapAnalysisJson,
    });
  }
  // 若已确认企业基本信息，则企业背景洞察视为已完成
  if (item.basicInfo) {
    const completed = item.completedStages || [];
    if (!completed.includes(0)) {
      completed.push(0);
      completed.sort((a, b) => a - b);
      updateDigitalProblemBasicInfo(item.createdAt, item.basicInfo);
      currentProblemDetailItem = { ...item, completedStages: completed };
    }
  }
  problemDetailViewingMajorStage = majorStage;
  updateProblemDetailProgressStages(majorStage, problemDetailViewingMajorStage);
  renderProblemDetailContent();
  initProblemDetailChat();
  if (problemDetailViewingMajorStage >= 2) {
    console.log('[局部ITGap] openProblemDetail: 调用 forceShowLocalItGapStartBlock (同步)');
    forceShowLocalItGapStartBlock();
  }
  toggleProblemDetailHistory(false);
  saveRouteState('problemDetail', { createdAt: item.createdAt });
  switchView('problemDetail');
}

function toggleProblemDetailHistory(open) {
  const panel = el.problemDetailHistoryPanel;
  if (!panel) return;
  const isOpen = open ?? !panel.classList.contains('problem-detail-history-panel-open');
  panel.classList.toggle('problem-detail-history-panel-open', isOpen);
  if (panel.setAttribute) panel.setAttribute('aria-hidden', String(!isOpen));
  if (isOpen) renderProblemDetailHistory();
}

function renderProblemDetailHistory() {
  const container = el.problemDetailHistoryContent;
  if (!container) return;
  const item = currentProblemDetailItem;
  const createdAt = item?.createdAt;
  const trackingData = createdAt ? (getTaskTrackingData()[createdAt] || {}) : {};
  const communications = createdAt ? getCommunicationsByTask(createdAt) : {};
  const allHistoryTasks = [...FOLLOW_TASKS, ...ITGAP_HISTORY_TASKS, ...IT_STRATEGY_TASKS];
  container.innerHTML = allHistoryTasks.map((task) => {
    const taskData = trackingData[task.id] || {};
    const objective = (taskData.objective ?? task.objective) || '—';
    const evaluationCriteria = (taskData.evaluationCriteria ?? task.evaluationCriteria) || '—';
    const comms = (communications[task.id] || []).slice().sort((a, b) => {
      const ta = (a.time && new Date(a.time).getTime()) || 0;
      const tb = (b.time && new Date(b.time).getTime()) || 0;
      return ta - tb;
    });
    const commCount = comms.length;
    const intentLabels = { query: '简单查询', modification: '反馈修改意见', execute: '执行操作', discussion: '讨论请教' };
    const timelineHtml = comms.length === 0
      ? '<p class="problem-detail-history-comm-empty">暂无沟通记录</p>'
      : comms.map((c, i) => {
          const timeStr = c.time ? formatChatTime(c.time) : '—';
          let contentStr = typeof c.content === 'object' ? JSON.stringify(c.content, null, 2) : c.content;
          let titleLabel = c.speaker;
          try {
            const parsed = typeof c.content === 'string' ? JSON.parse(c.content) : c.content;
            if (parsed?.type === 'intentExtractionCard' && parsed?.data?.intent != null) {
              const intentLabel = intentLabels[parsed.data.intent] || parsed.data.intent || '—';
              titleLabel = `用户意图提炼：${intentLabel}`;
            } else if (parsed?.type === 'e2eFlowExtractStartBlock') {
              titleLabel = parsed.content || '我先需要提取端到端流程绘制的 json 数据';
            } else if (parsed?.type === 'e2eFlowJsonBlock') {
              titleLabel = '端到端流程 JSON 数据';
              if (parsed.valueStreamJson) {
                contentStr = '【端到端流程 JSON 数据】\n' + JSON.stringify(parsed.valueStreamJson, null, 2);
              }
            } else if (parsed?.type === 'e2eFlowGeneratedLog') {
              titleLabel = parsed.content || '已生成端到端流程 JSON 数据';
              if (parsed.valueStreamJson) {
                contentStr = parsed.content + '\n\n【端到端流程 JSON 数据】\n' + JSON.stringify(parsed.valueStreamJson, null, 2);
              }
            } else if (parsed?.type === 'globalItGapStartBlock') {
              titleLabel = parsed.content || '即将针对端到端流程开展全局 ITGap 分析';
            } else if (parsed?.type === 'globalItGapAnalysisCard') {
              titleLabel = '全局 ITGap 分析';
              if (parsed.analysisJson) {
                contentStr = '【全局 ITGap 分析 JSON】\n' + JSON.stringify(parsed.analysisJson, null, 2);
              }
            } else if (parsed?.type === 'globalItGapAnalysisLog') {
              titleLabel = parsed.content || '已生成全局 ITGap 分析';
              if (parsed.analysisJson) {
                contentStr = (parsed.content || '') + '\n\n【全局 ITGap 分析 JSON】\n' + JSON.stringify(parsed.analysisJson, null, 2);
              }
            }
          } catch (_) {}
          return `
          <div class="problem-detail-history-timeline-node" data-index="${i}">
            <div class="problem-detail-history-timeline-dot-wrap">
              <div class="problem-detail-history-timeline-dot"></div>
            </div>
            <div class="problem-detail-history-timeline-body">
              <button type="button" class="problem-detail-history-timeline-head" role="button" aria-expanded="false">
                <span class="problem-detail-history-timeline-expand">▸</span>
                <span class="problem-detail-history-timeline-time">${escapeHtml(timeStr)}</span>
                <span class="problem-detail-history-timeline-speaker">${escapeHtml(titleLabel)}</span>
              </button>
              <div class="problem-detail-history-timeline-detail" hidden>
                <div class="problem-detail-history-timeline-detail-meta">
                  <span>${escapeHtml(titleLabel)}</span>
                  <span>${escapeHtml(timeStr)}</span>
                </div>
                <pre class="problem-detail-history-timeline-detail-content">${escapeHtml(contentStr)}</pre>
              </div>
            </div>
          </div>`;
        }).join('');
    return `
      <div class="problem-detail-history-task-root" data-task-id="${task.id}">
        <button type="button" class="problem-detail-history-task-node" data-task-id="${task.id}" role="button">
          <span class="task-node-expand">▸</span>
          <span class="task-node-name">${escapeHtml(task.id.charAt(0).toUpperCase() + task.id.slice(1) + '｜' + task.name)}</span>
          ${commCount > 0 ? `<span class="task-node-badge">${commCount} 条</span>` : ''}
        </button>
        <div class="problem-detail-history-task-children" hidden>
          <div class="problem-detail-history-task-info">
            <h5>归属阶段</h5>
            <p>${escapeHtml(task.stage)}</p>
            <h5>任务目标</h5>
            <p>${escapeHtml(objective)}</p>
            <h5>评估标准</h5>
            <p>${escapeHtml(evaluationCriteria)}</p>
            <h5>任务过程日志</h5>
          </div>
          <div class="problem-detail-history-timeline">${timelineHtml}</div>
        </div>
      </div>`;
  }).join('');
  container.querySelectorAll('.problem-detail-history-task-node').forEach((btn) => {
    btn.addEventListener('click', () => {
      const root = btn.closest('.problem-detail-history-task-root');
      const children = root?.querySelector('.problem-detail-history-task-children');
      if (!children) return;
      const expanded = !children.hidden;
      children.hidden = expanded;
      btn.classList.toggle('expanded', !expanded);
    });
  });
  container.querySelectorAll('.problem-detail-history-timeline-head').forEach((btn) => {
    btn.addEventListener('click', () => {
      const body = btn.closest('.problem-detail-history-timeline-body');
      const detail = body?.querySelector('.problem-detail-history-timeline-detail');
      if (!detail) return;
      const isExpanded = !detail.hidden;
      detail.hidden = isExpanded;
      btn.classList.toggle('expanded', !isExpanded);
      btn.setAttribute('aria-expanded', !isExpanded);
      btn.querySelector('.problem-detail-history-timeline-expand')?.classList.toggle('expanded', !isExpanded);
    });
  });
}

function initProblemDetailChat() {
  const container = el.problemDetailChatMessages;
  if (!container) return;
  container.innerHTML = '';
  const item = currentProblemDetailItem;
  const chatKey = item?.createdAt;
  const storedChat = chatKey ? getProblemDetailChats()[chatKey] : null;
  if (storedChat && Array.isArray(storedChat) && storedChat.length > 0) {
    problemDetailChatMessages = storedChat;
    renderProblemDetailChatFromStorage(container, storedChat);
  } else {
    problemDetailChatMessages = [{ role: 'system', content: '请输入客户基本信息', timestamp: getTimeStr() }];
    appendProblemDetailChatMessage(container, 'system', '请输入客户基本信息', { noSave: true });
    if (chatKey) saveProblemDetailChat(chatKey, problemDetailChatMessages);
  }
  if (el.problemDetailChatInput) el.problemDetailChatInput.value = '';
  requestAnimationFrame(() => {
    container.scrollTop = container.scrollHeight;
    maybeShowBmcStartBlock();
    maybeShowRequirementLogicStartBlock();
    maybeShowValueStreamStartBlock();
    maybeShowItStatusStartBlock();
    maybeShowPainPointStartBlock();
    maybeShowItGapStartBlock();
    if (problemDetailViewingMajorStage >= 2) {
      console.log('[局部ITGap] initProblemDetailChat rAF: 调用 forceShowLocalItGapStartBlock');
      maybeShowE2eFlowExtractBlock();
      maybeShowGlobalItGapStartBlock();
      forceShowLocalItGapStartBlock();
    }
  });
}

async function runBmcGeneration() {
  const container = el.problemDetailChatMessages;
  if (!container || !problemDetailConfirmedBasicInfo || !DEEPSEEK_API_KEY) return;
  const loading1 = document.createElement('div');
  loading1.className = 'problem-detail-chat-msg problem-detail-chat-msg-system problem-detail-chat-msg-parsing';
  loading1.innerHTML = `<div class="problem-detail-chat-msg-content-wrap"><div class="problem-detail-chat-parsing-inner"><span class="problem-detail-chat-spinner"></span><span class="problem-detail-chat-msg-content">正在提取客户基本信息 json 数据</span></div></div><div class="problem-detail-chat-msg-time">${getTimeStr()}</div>`;
  container.appendChild(loading1);
  container.scrollTop = container.scrollHeight;
  await new Promise((r) => setTimeout(r, 400));
  const json = problemDetailConfirmedBasicInfo;
  loading1.remove();
  const extractedBlock = document.createElement('div');
  extractedBlock.className = 'problem-detail-chat-msg problem-detail-chat-msg-system problem-detail-chat-msg-parsed';
  extractedBlock.innerHTML = `<div class="problem-detail-chat-msg-content-wrap"><div class="problem-detail-chat-msg-content">基本信息 json 提取完毕</div><span class="problem-detail-chat-check" aria-hidden="true">✅</span></div><div class="problem-detail-chat-msg-time">${getTimeStr()}</div>`;
  container.appendChild(extractedBlock);
  const jsonBlock = document.createElement('div');
  jsonBlock.className = 'problem-detail-chat-msg problem-detail-chat-msg-system problem-detail-chat-json-block problem-detail-chat-json-collapsible';
  jsonBlock.innerHTML = `<div class="problem-detail-chat-json-wrap" role="button" tabindex="0"><pre class="problem-detail-chat-json-pre">${escapeHtml(JSON.stringify(json, null, 2))}</pre></div><div class="problem-detail-chat-msg-time">${getTimeStr()}</div>`;
  container.appendChild(jsonBlock);
  setupProblemDetailJsonBlockToggle(jsonBlock);
  pushAndSaveProblemDetailChat({ role: 'system', content: '基本信息 json 提取完毕', timestamp: getTimeStr(), hasCheck: true });
  pushAndSaveProblemDetailChat({ type: 'basicInfoJsonBlock', json, timestamp: getTimeStr() });
  container.scrollTop = container.scrollHeight;

  const loading2 = document.createElement('div');
  loading2.className = 'problem-detail-chat-msg problem-detail-chat-msg-system problem-detail-chat-msg-parsing';
  loading2.innerHTML = `<div class="problem-detail-chat-msg-content-wrap"><div class="problem-detail-chat-parsing-inner"><span class="problem-detail-chat-spinner"></span><span class="problem-detail-chat-msg-content">正在生成企业商业画布 BMC</span></div></div><div class="problem-detail-chat-msg-time">${getTimeStr()}</div>`;
  container.appendChild(loading2);
  container.scrollTop = container.scrollHeight;
  try {
    const { parsed: bmc, usage, model, durationMs } = await generateBmcFromBasicInfo(problemDetailConfirmedBasicInfo);
    loading2.remove();
    const llmMeta = buildLlmMetaHtml({ usage, model, durationMs });
    const cardBlock = document.createElement('div');
    cardBlock.className = 'problem-detail-chat-msg problem-detail-chat-msg-system problem-detail-chat-bmc-card-collapsible';
    const bmcRows = BMC_FIELDS.map(({ key, label }) => {
      const value = (bmc[key] != null ? String(bmc[key]).trim() : '') || '—';
      return `<div class="problem-detail-bmc-row"><span class="problem-detail-bmc-label">${escapeHtml(label)}</span><span class="problem-detail-bmc-value">${escapeHtml(value)}</span></div>`;
    }).join('');
    const industryInsight = (bmc.industry_insight || '').trim() || '—';
    const painPoints = (bmc.pain_points || '').trim() || '—';
    cardBlock.innerHTML = `
      <div class="problem-detail-bmc-card" role="button" tabindex="0">
        <div class="problem-detail-bmc-card-body">
          ${industryInsight ? `<div class="problem-detail-bmc-section"><h4>行业背景洞察</h4><div class="problem-detail-bmc-content">${escapeHtml(industryInsight)}</div></div>` : ''}
          <div class="problem-detail-bmc-grid">${bmcRows}</div>
          ${painPoints ? `<div class="problem-detail-bmc-section"><h4>业务痛点预判</h4><div class="problem-detail-bmc-content">${escapeHtml(painPoints)}</div></div>` : ''}
        </div>
        <div class="problem-detail-bmc-card-expand-hint">点击展开</div>
        <div class="problem-detail-bmc-card-actions">
          <button type="button" class="btn-confirm-bmc" data-json="${String(JSON.stringify(bmc)).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;')}">确认</button>
        </div>
      </div>
      <div class="problem-detail-chat-msg-time">${getTimeStr()}</div>${llmMeta}`;
    container.appendChild(cardBlock);
    setupProblemDetailBmcCardToggle(cardBlock);
    pushAndSaveProblemDetailChat({ type: 'bmcCard', data: bmc, confirmed: false, timestamp: getTimeStr(), llmMeta: { usage, model, durationMs } });
    container.scrollTop = container.scrollHeight;
  } catch (err) {
    loading2.classList.remove('problem-detail-chat-msg-parsing');
    loading2.querySelector('.problem-detail-chat-msg-content-wrap').innerHTML = `<div class="problem-detail-chat-msg-content">生成失败：${escapeHtml(err.message || String(err))}</div>`;
    pushAndSaveProblemDetailChat({ role: 'system', content: '生成失败：' + (err.message || String(err)), timestamp: getTimeStr() });
  }
}

async function runRequirementLogicConstruction() {
  const container = el.problemDetailChatMessages;
  const item = currentProblemDetailItem;
  if (!container || !item?.createdAt || !DEEPSEEK_API_KEY) return;
  const basicInfo = item.basicInfo || problemDetailConfirmedBasicInfo || {};
  const bmc = item.bmc || {};
  const preliminaryReq = {
    customerName: item.customerName ?? item.customer_name ?? '',
    customerNeedsOrChallenges: item.customerNeedsOrChallenges ?? item.customer_needs_or_challenges ?? '',
    customerItStatus: item.customerItStatus ?? item.customer_it_status ?? '',
    projectTimeRequirement: item.projectTimeRequirement ?? item.project_time_requirement ?? '',
  };
  if (!basicInfo || Object.keys(basicInfo).length === 0) {
    const errBlock = document.createElement('div');
    errBlock.className = 'problem-detail-chat-msg problem-detail-chat-msg-system';
    errBlock.innerHTML = `<div class="problem-detail-chat-msg-content-wrap"><div class="problem-detail-chat-msg-content">需求逻辑构建需要客户基本信息，请先完成企业背景洞察。</div></div><div class="problem-detail-chat-msg-time">${getTimeStr()}</div>`;
    container.appendChild(errBlock);
    pushAndSaveProblemDetailChat({ role: 'system', content: '需求逻辑构建需要客户基本信息，请先完成企业背景洞察。', timestamp: getTimeStr() });
    return;
  }
  if (!bmc || Object.keys(bmc).length === 0) {
    const errBlock = document.createElement('div');
    errBlock.className = 'problem-detail-chat-msg problem-detail-chat-msg-system';
    errBlock.innerHTML = `<div class="problem-detail-chat-msg-content-wrap"><div class="problem-detail-chat-msg-content">需求逻辑构建需要商业模式画布 BMC，请先完成商业画布加载。</div></div><div class="problem-detail-chat-msg-time">${getTimeStr()}</div>`;
    container.appendChild(errBlock);
    pushAndSaveProblemDetailChat({ role: 'system', content: '需求逻辑构建需要商业模式画布 BMC，请先完成商业画布加载。', timestamp: getTimeStr() });
    return;
  }
  const loadingBlock = document.createElement('div');
  loadingBlock.className = 'problem-detail-chat-msg problem-detail-chat-msg-system problem-detail-chat-msg-parsing';
  loadingBlock.innerHTML = `<div class="problem-detail-chat-msg-content-wrap"><div class="problem-detail-chat-parsing-inner"><span class="problem-detail-chat-spinner"></span><span class="problem-detail-chat-msg-content">正在基于最新客户初步需求、基本信息与 BMC 构建需求逻辑…</span></div></div><div class="problem-detail-chat-msg-time">${getTimeStr()}</div>`;
  container.appendChild(loadingBlock);
  container.scrollTop = container.scrollHeight;
  try {
    const { content, usage, model, durationMs } = await generateRequirementLogicFromInputs(preliminaryReq, basicInfo, bmc);
    loadingBlock.remove();
    const logicStr = (content || '').trim() || '（无返回内容）';
    pushOperationToHistory(item.createdAt, 'requirementLogic', JSON.parse(JSON.stringify(item)), problemDetailChatMessages.length);
    updateDigitalProblemRequirementLogic(item.createdAt, logicStr);
    currentProblemDetailItem = { ...item, requirementLogic: logicStr, completedStages: [...new Set([...(item.completedStages || []), 2])].sort((a, b) => a - b) };
    const parsed = parseRequirementLogicFromMarkdown(logicStr);
    const llmMeta = buildLlmMetaHtml({ usage, model, durationMs });
    const block = document.createElement('div');
    block.className = 'problem-detail-chat-msg problem-detail-chat-msg-system problem-detail-chat-requirement-logic-start problem-detail-chat-msg-with-delete';
    block.dataset.msgIndex = String(problemDetailChatMessages.length);
    const hasAnyContent = REQUIREMENT_LOGIC_SECTIONS.some(({ key }) => (parsed[key] || '').trim());
    const rows = hasAnyContent
      ? REQUIREMENT_LOGIC_SECTIONS.map(({ key, label }) => {
          const val = (parsed[key] || '').trim() || '—';
          return `<div class="problem-detail-basic-info-row"><span class="problem-detail-basic-info-label">${escapeHtml(label)}</span><span class="problem-detail-basic-info-value markdown-body">${renderMarkdown(val)}</span></div>`;
        }).join('')
      : `<div class="problem-detail-basic-info-row"><span class="problem-detail-basic-info-label">原始输出</span><span class="problem-detail-basic-info-value markdown-body">${renderMarkdown(logicStr)}</span></div>`;
    block.innerHTML = `
      <button type="button" class="btn-delete-chat-msg" aria-label="删除">${DELETE_CHAT_MSG_ICON}</button>
      <div class="problem-detail-basic-info-card" role="button" tabindex="0">
        <div class="problem-detail-basic-info-card-body">${rows}</div>
        <div class="problem-detail-basic-info-card-actions">
          <button type="button" class="btn-confirm-requirement-logic">确认</button>
        </div>
      </div>
      <div class="problem-detail-chat-msg-time">${getTimeStr()}</div>${llmMeta}`;
    container.appendChild(block);
    setupProblemDetailRequirementLogicCardToggle(block);
    pushAndSaveProblemDetailChat({ type: 'requirementLogicBlock', content: logicStr, parsed, timestamp: getTimeStr(), confirmed: false, llmMeta: { usage, model, durationMs } });
    container.scrollTop = container.scrollHeight;
    renderProblemDetailContent();
    requestAnimationFrame(() => {
      maybeShowValueStreamStartBlock();
      maybeShowItStatusStartBlock();
      maybeShowPainPointStartBlock();
    });
  } catch (err) {
    loadingBlock.remove();
    const errBlock = document.createElement('div');
    errBlock.className = 'problem-detail-chat-msg problem-detail-chat-msg-system';
    errBlock.innerHTML = `<div class="problem-detail-chat-msg-content-wrap"><div class="problem-detail-chat-msg-content">需求逻辑构建失败：${escapeHtml(err.message || String(err))}</div></div><div class="problem-detail-chat-msg-time">${getTimeStr()}</div>`;
    container.appendChild(errBlock);
    pushAndSaveProblemDetailChat({ role: 'system', content: '需求逻辑构建失败：' + (err.message || String(err)), timestamp: getTimeStr() });
  }
}

function maybeShowBmcStartBlock() {
  const container = el.problemDetailChatMessages;
  const item = currentProblemDetailItem;
  if (!container || !item?.createdAt) return;
  if (item.bmc) return;
  const completedStages = item.completedStages || [];
  const currentStage = [0, 1, 2].find((i) => !completedStages.includes(i)) ?? 3;
  if (currentStage !== 1) return;
  if (!problemDetailConfirmedBasicInfo) return;
  const hasBmcStart = problemDetailChatMessages.some((m) => m.type === 'bmcStartBlock');
  if (hasBmcStart) return;
  const block = document.createElement('div');
  block.className = 'problem-detail-chat-msg problem-detail-chat-msg-system problem-detail-chat-bmc-start';
  block.innerHTML = `
    <div class="problem-detail-chat-msg-content-wrap">
      <div class="problem-detail-chat-msg-content">我将发起商业模式画布 BMC 生成</div>
      <div class="problem-detail-chat-bmc-start-actions">
        <button type="button" class="btn-confirm-start-bmc">确认</button>
      </div>
    </div>
    <div class="problem-detail-chat-msg-time">${getTimeStr()}</div>`;
  container.appendChild(block);
  pushAndSaveProblemDetailChat({ type: 'bmcStartBlock', timestamp: getTimeStr() });
  container.scrollTop = container.scrollHeight;
}

function maybeShowRequirementLogicStartBlock() {
  const container = el.problemDetailChatMessages;
  const item = currentProblemDetailItem;
  if (!container || !item?.createdAt) return;
  if (item.requirementLogic) return;
  const completedStages = item.completedStages || [];
  const currentStage = [0, 1, 2].find((i) => !completedStages.includes(i)) ?? 3;
  if (currentStage !== 2) return;
  if (!item.bmc || !(item.basicInfo || problemDetailConfirmedBasicInfo)) return;
  const hasStart = problemDetailChatMessages.some((m) => m.type === 'requirementLogicStartBlock');
  if (hasStart) return;
  const block = document.createElement('div');
  block.className = 'problem-detail-chat-msg problem-detail-chat-msg-system problem-detail-chat-requirement-logic-start';
  block.innerHTML = `
    <div class="problem-detail-chat-msg-content-wrap">
      <div class="problem-detail-chat-msg-content">我即将开始提取需求逻辑</div>
      <div class="problem-detail-chat-requirement-logic-start-actions">
        <button type="button" class="btn-confirm-start-requirement-logic">确认</button>
      </div>
    </div>
    <div class="problem-detail-chat-msg-time">${getTimeStr()}</div>`;
  container.appendChild(block);
  pushAndSaveProblemDetailChat({ type: 'requirementLogicStartBlock', timestamp: getTimeStr() });
  container.scrollTop = container.scrollHeight;
}

function maybeShowValueStreamStartBlock() {
  const container = el.problemDetailChatMessages;
  const item = currentProblemDetailItem;
  if (!container || !item?.createdAt) return;
  if (item.valueStream) return;
  const currentMajorStage = item.currentMajorStage ?? 0;
  if (currentMajorStage < 1) return;
  const wfCompleted = item.workflowAlignCompletedStages || [];
  const wfCurrent = [0, 1, 2].find((i) => !wfCompleted.includes(i)) ?? 3;
  if (wfCurrent !== 0) return;
  const basicInfo = item.basicInfo || problemDetailConfirmedBasicInfo;
  if (!basicInfo || !item.bmc || !item.requirementLogic) return;
  const hasStart = problemDetailChatMessages.some((m) => m.type === 'valueStreamStartBlock');
  if (hasStart) return;
  const block = document.createElement('div');
  block.className = 'problem-detail-chat-msg problem-detail-chat-msg-system problem-detail-chat-value-stream-start';
  block.innerHTML = `
    <div class="problem-detail-chat-msg-content-wrap">
      <div class="problem-detail-chat-msg-content">我即将开始需求相关核心价值流图绘制</div>
      <div class="problem-detail-chat-value-stream-start-actions">
        <button type="button" class="btn-confirm-start-value-stream">确认</button>
      </div>
    </div>
    <div class="problem-detail-chat-msg-time">${getTimeStr()}</div>`;
  container.appendChild(block);
  pushAndSaveProblemDetailChat({ type: 'valueStreamStartBlock', timestamp: getTimeStr() });
  container.scrollTop = container.scrollHeight;
}

function maybeShowItStatusStartBlock() {
  const container = el.problemDetailChatMessages;
  const item = currentProblemDetailItem;
  if (!container || !item?.createdAt) return;
  const valueStream = item.valueStream;
  if (!valueStream || valueStream.raw) return;
  const hasItStatus = (() => {
    const rawStages = valueStream.stages ?? valueStream.phases ?? valueStream.nodes ?? [];
    if (!Array.isArray(rawStages)) return false;
    for (const s of rawStages) {
      const steps = s.steps ?? s.tasks ?? s.phases ?? s.items ?? [];
      for (const st of steps) {
        if (st && typeof st === 'object' && (st.itStatus || st.it_status)) return true;
      }
    }
    return false;
  })();
  if (hasItStatus) return;
  const currentMajorStage = item.currentMajorStage ?? 0;
  if (currentMajorStage < 1) return;
  const wfCompleted = item.workflowAlignCompletedStages || [];
  const wfCurrent = [0, 1, 2].find((i) => !wfCompleted.includes(i)) ?? 3;
  if (wfCurrent !== 1) return;
  if (!item.requirementLogic) return;
  const hasStart = problemDetailChatMessages.some((m) => m.type === 'itStatusStartBlock');
  if (hasStart) return;
  const block = document.createElement('div');
  block.className = 'problem-detail-chat-msg problem-detail-chat-msg-system problem-detail-chat-it-status-start';
  block.innerHTML = `
    <div class="problem-detail-chat-msg-content-wrap">
      <div class="problem-detail-chat-msg-content">即将开始 IT 现状标注</div>
      <div class="problem-detail-chat-it-status-start-actions">
        <button type="button" class="btn-confirm-start-it-status">确认</button>
      </div>
    </div>
    <div class="problem-detail-chat-msg-time">${getTimeStr()}</div>`;
  container.appendChild(block);
  pushAndSaveProblemDetailChat({ type: 'itStatusStartBlock', timestamp: getTimeStr() });
  container.scrollTop = container.scrollHeight;
}

function maybeShowPainPointStartBlock() {
  const container = el.problemDetailChatMessages;
  const item = currentProblemDetailItem;
  if (!container || !item?.createdAt) return;
  const valueStream = item.valueStream;
  if (!valueStream || valueStream.raw) return;
  const hasPainPoint = (() => {
    const rawStages = valueStream.stages ?? valueStream.phases ?? valueStream.nodes ?? [];
    if (!Array.isArray(rawStages)) return false;
    for (const s of rawStages) {
      const steps = s.steps ?? s.tasks ?? s.phases ?? s.items ?? [];
      for (const st of steps) {
        const pp = st?.painPoint ?? st?.pain_point;
        if (pp && typeof pp === 'string' && pp.trim()) return true;
      }
    }
    return false;
  })();
  if (hasPainPoint) return;
  const currentMajorStage = item.currentMajorStage ?? 0;
  if (currentMajorStage < 1) return;
  const wfCompleted = item.workflowAlignCompletedStages || [];
  const wfCurrent = [0, 1, 2].find((i) => !wfCompleted.includes(i)) ?? 3;
  if (wfCurrent !== 2) return;
  if (!item.requirementLogic) return;
  const hasStart = problemDetailChatMessages.some((m) => m.type === 'painPointStartBlock');
  if (hasStart) return;
  pushAndSaveProblemDetailChat({ type: 'painPointStartBlock', timestamp: getTimeStr() });
  const block = document.createElement('div');
  block.className = 'problem-detail-chat-msg problem-detail-chat-msg-system problem-detail-chat-pain-point-start problem-detail-chat-msg-with-delete';
  block.dataset.msgIndex = String(problemDetailChatMessages.length - 1);
  block.innerHTML = `
    <button type="button" class="btn-delete-chat-msg" aria-label="删除">${DELETE_CHAT_MSG_ICON}</button>
    <div class="problem-detail-chat-msg-content-wrap">
      <div class="problem-detail-chat-msg-content">即将开始价值流图环节节点痛点标注</div>
      <div class="problem-detail-chat-pain-point-start-actions">
        <button type="button" class="btn-confirm-start-pain-point">确认</button>
      </div>
    </div>
    <div class="problem-detail-chat-msg-time">${getTimeStr()}</div>`;
  container.appendChild(block);
  container.scrollTop = container.scrollHeight;
}

function maybeShowE2eFlowExtractBlock() {
  const container = el.problemDetailChatMessages;
  const item = currentProblemDetailItem;
  if (!container || !item?.createdAt) return;
  const valueStream = item.valueStream;
  if (!valueStream || valueStream.raw) return;
  const itGapCompleted = item.itGapCompletedStages || [];
  const itGapCurrent = [0, 1, 2].find((i) => !itGapCompleted.includes(i)) ?? 3;
  if (itGapCurrent !== 1) return;
  const comms = getCommunicationsByTask(item.createdAt);
  if ((comms.task7 || []).length > 0) return;
  if (problemDetailChatMessages.some((m) => m.type === 'e2eFlowExtractStartBlock')) return;
  pushAndSaveProblemDetailChat({ type: 'e2eFlowExtractStartBlock', content: '我先需要提取端到端流程绘制的 json 数据', timestamp: getTimeStr(), confirmed: false });
  const block = document.createElement('div');
  block.className = 'problem-detail-chat-msg problem-detail-chat-msg-system problem-detail-chat-e2e-extract-start problem-detail-chat-msg-with-delete';
  block.dataset.msgIndex = String(problemDetailChatMessages.length - 1);
  block.innerHTML = `
    <button type="button" class="btn-delete-chat-msg" aria-label="删除">${DELETE_CHAT_MSG_ICON}</button>
    <div class="problem-detail-chat-msg-content-wrap">
      <div class="problem-detail-chat-msg-content">我先需要提取端到端流程绘制的 json 数据</div>
      <div class="problem-detail-chat-e2e-extract-actions">
        <button type="button" class="btn-confirm-e2e-extract">确认</button>
      </div>
    </div>
    <div class="problem-detail-chat-msg-time">${getTimeStr()}</div>`;
  container.appendChild(block);
  container.scrollTop = container.scrollHeight;
}

function maybeShowGlobalItGapStartBlock() {
  const container = el.problemDetailChatMessages;
  const item = currentProblemDetailItem;
  if (!container || !item?.createdAt) return;
  const valueStream = item.valueStream;
  if (!valueStream || valueStream.raw) return;
  const itGapCompleted = item.itGapCompletedStages || [];
  const itGapCurrent = [0, 1, 2].find((i) => !itGapCompleted.includes(i)) ?? 3;
  if (itGapCurrent !== 1) return;
  const comms = getCommunicationsByTask(item.createdAt);
  if ((comms.task7 || []).length === 0) return;
  if (problemDetailChatMessages.some((m) => m.type === 'globalItGapStartBlock')) return;
  if (item.globalItGapAnalysisJson) return;
  pushAndSaveProblemDetailChat({ type: 'globalItGapStartBlock', content: '即将针对端到端流程开展全局 ITGap 分析', timestamp: getTimeStr(), confirmed: false });
  const block = document.createElement('div');
  block.className = 'problem-detail-chat-msg problem-detail-chat-msg-system problem-detail-chat-global-itgap-start problem-detail-chat-msg-with-delete';
  block.dataset.msgIndex = String(problemDetailChatMessages.length - 1);
  block.innerHTML = `
    <button type="button" class="btn-delete-chat-msg" aria-label="删除">${DELETE_CHAT_MSG_ICON}</button>
    <div class="problem-detail-chat-msg-content-wrap">
      <div class="problem-detail-chat-msg-content">即将针对端到端流程开展全局 ITGap 分析</div>
      <div class="problem-detail-chat-global-itgap-start-actions">
        <button type="button" class="btn-confirm-start-global-itgap">确认</button>
      </div>
    </div>
    <div class="problem-detail-chat-msg-time">${getTimeStr()}</div>`;
  container.appendChild(block);
    container.scrollTop = container.scrollHeight;
}

/** 从问题记录或聊天记录中解析出有效的端到端流程 valueStream（支持 valueStream、valueStreams[0]、e2eFlowGeneratedLog） */
function resolveValueStreamForItGap(item) {
  let vs = item?.valueStream;
  if (vs && !vs.raw) return vs;
  const streams = item?.valueStreams;
  if (Array.isArray(streams) && streams.length > 0) {
    vs = streams[0];
    if (vs && !vs.raw) return vs;
  }
  const chats = item?.createdAt ? getProblemDetailChats()[item.createdAt] : null;
  if (Array.isArray(chats)) {
    for (let i = chats.length - 1; i >= 0; i--) {
      const m = chats[i];
      const json = m?.valueStreamJson ?? m?.value_stream_json;
      if (json && typeof json === 'object' && !json.raw) return json;
    }
  }
  return vs || null;
}

const LOCAL_ITGAP_BANNER_ID = 'local-itgap-existing-banner';

/** 在聊天区顶部显示粘性提醒条，提示用户已存在局部 ITGap block */
function showLocalItGapExistingBlockBanner(container, blockEl) {
  if (!container || !blockEl) return;
  let banner = container.querySelector(`#${LOCAL_ITGAP_BANNER_ID}`);
  if (banner) return;
  banner = document.createElement('div');
  banner.id = LOCAL_ITGAP_BANNER_ID;
  banner.className = 'problem-detail-chat-local-itgap-banner';
  banner.innerHTML = `
    <span class="problem-detail-chat-local-itgap-banner-text">局部 ITGap 分析 session 已生成，请向下查看</span>
    <button type="button" class="btn-scroll-to-local-itgap-banner">滚动到</button>
  `;
  const scrollToBlock = () => {
    scrollChatToBlock(container, blockEl);
    banner.remove();
  };
  banner.querySelector('.btn-scroll-to-local-itgap-banner')?.addEventListener('click', scrollToBlock);
  container.insertBefore(banner, container.firstChild);
}

/** 将聊天容器滚动到指定 block 位置 */
function scrollChatToBlock(container, blockEl) {
  if (!container || !blockEl) return;
  const blockTop = blockEl.offsetTop;
  const containerHeight = container.clientHeight;
  const blockHeight = blockEl.offsetHeight;
  container.scrollTop = Math.max(0, blockTop - Math.floor(containerHeight / 3));
}

/** 强制在聊天区展示局部 ITGap 分析 session 生成块（用于工作区手动触发或刷新后自动弹出，条件更宽松） */
function forceShowLocalItGapStartBlock() {
  const LOG_PREFIX = '[局部ITGap]';
  const item = currentProblemDetailItem;
  console.log(LOG_PREFIX, 'forceShowLocalItGapStartBlock 被调用', {
    createdAt: item?.createdAt,
    problemDetailViewingMajorStage,
    currentMajorStage: item?.currentMajorStage,
    itGapCompletedStages: item?.itGapCompletedStages,
    hasValueStream: !!(item?.valueStream && !item?.valueStream?.raw),
    hasValueStreams: Array.isArray(item?.valueStreams) && item.valueStreams.length,
    hasGlobalItGap: !!item?.globalItGapAnalysisJson,
    localItGapSessionsLen: (item?.localItGapSessions || []).length,
    localItGapAnalysesLen: (item?.localItGapAnalyses || []).length,
  });
  const container = el.problemDetailChatMessages;
  if (!container || !item?.createdAt) {
    console.log(LOG_PREFIX, 'return: 无 container 或 item.createdAt', { hasContainer: !!container, hasCreatedAt: !!item?.createdAt });
    return;
  }
  const valueStream = resolveValueStreamForItGap(item);
  if (!valueStream || valueStream.raw) {
    console.log(LOG_PREFIX, 'return: 无有效 valueStream', { hasValueStream: !!valueStream, isRaw: valueStream?.raw });
    return;
  }
  if (!item.globalItGapAnalysisJson) {
    console.log(LOG_PREFIX, 'return: 无 globalItGapAnalysisJson');
    return;
  }
  const itGapCompleted = item.itGapCompletedStages || [];
  const itGapCurrent = [0, 1, 2].find((i) => !itGapCompleted.includes(i)) ?? 3;
  if (itGapCurrent !== 2) {
    console.log(LOG_PREFIX, 'return: itGapCurrent !== 2', { itGapCompleted, itGapCurrent });
    return;
  }
  const { stages } = parseValueStreamGraph(valueStream);
  const allSteps = stages.flatMap((s) => s.steps);
  if (allSteps.length === 0) {
    console.log(LOG_PREFIX, 'return: allSteps.length === 0', { stagesCount: stages.length });
    return;
  }
  const sessions = item.localItGapSessions || [];
  const analyses = item.localItGapAnalyses || [];
  if (sessions.length >= allSteps.length || analyses.length >= allSteps.length) {
    console.log(LOG_PREFIX, 'return: 已全部完成', { sessionsLen: sessions.length, analysesLen: analyses.length, allStepsLen: allSteps.length });
    return;
  }
  const chats = getProblemDetailChats()[item.createdAt] || [];
  const matchingBlocks = chats.filter((m) => m.type === 'localItGapStartBlock' || m.type === 'localItGapSessionsBlock');
  const hasBlock = matchingBlocks.length > 0;
  if (hasBlock) {
    const blockTypes = matchingBlocks.map((m) => ({ type: m.type, confirmed: m.confirmed, idx: chats.indexOf(m) }));
    const allTypes = chats.map((m) => m.type || m.role || 'unknown');
    console.log(LOG_PREFIX, 'return: 聊天中已有 block，故不重复弹出', {
      blockTypes,
      blockCount: matchingBlocks.length,
      chatMsgCount: chats.length,
      allMsgTypes: allTypes,
    });
    const blockEl = container?.querySelector('.problem-detail-chat-local-itgap-start, .problem-detail-chat-local-itgap-sessions-card');
    if (blockEl) {
      showLocalItGapExistingBlockBanner(container, blockEl);
      setTimeout(() => scrollChatToBlock(container, blockEl), 100);
    } else {
      console.warn(LOG_PREFIX, '聊天数据中有 block 但 DOM 中未找到，可能需重新渲染');
    }
    return;
  }
  console.log(LOG_PREFIX, '✓ 展示「即将生成每个环节的 ITGap 分析 session」', { allStepsLen: allSteps.length });
  pushAndSaveProblemDetailChat({ type: 'localItGapStartBlock', content: '即将生成每个环节的 ITGap 分析 session', timestamp: getTimeStr(), confirmed: false });
  const block = document.createElement('div');
  block.className = 'problem-detail-chat-msg problem-detail-chat-msg-system problem-detail-chat-local-itgap-start problem-detail-chat-msg-with-delete';
  block.dataset.msgIndex = String(problemDetailChatMessages.length - 1);
  block.innerHTML = `
    <button type="button" class="btn-delete-chat-msg" aria-label="删除">${DELETE_CHAT_MSG_ICON}</button>
    <div class="problem-detail-chat-msg-content-wrap">
      <div class="problem-detail-chat-msg-content">即将生成每个环节的 ITGap 分析 session</div>
      <div class="problem-detail-chat-local-itgap-start-actions">
        <button type="button" class="btn-confirm-start-local-itgap">确认</button>
      </div>
    </div>
    <div class="problem-detail-chat-msg-time">${getTimeStr()}</div>`;
  container.appendChild(block);
  container.scrollTop = container.scrollHeight;
}

function maybeShowLocalItGapStartBlock() {
  const container = el.problemDetailChatMessages;
  const item = currentProblemDetailItem;
  if (!container || !item?.createdAt) return;
  const valueStream = resolveValueStreamForItGap(item);
  if (!valueStream || valueStream.raw) return;
  if (!item.globalItGapAnalysisJson) return;
  const itGapCompleted = item.itGapCompletedStages || [];
  const itGapCurrent = [0, 1, 2].find((i) => !itGapCompleted.includes(i)) ?? 3;
  if (itGapCurrent !== 2) return;
  if (problemDetailChatMessages.some((m) => m.type === 'localItGapStartBlock')) return;
  if (problemDetailChatMessages.some((m) => m.type === 'localItGapSessionsBlock')) return;
  const { stages } = parseValueStreamGraph(valueStream);
  const allSteps = stages.flatMap((s) => s.steps);
  if (allSteps.length === 0) return;
  const sessions = item.localItGapSessions || [];
  const analyses = item.localItGapAnalyses || [];
  if (sessions.length >= allSteps.length || analyses.length >= allSteps.length) return;
  pushAndSaveProblemDetailChat({ type: 'localItGapStartBlock', content: '即将生成每个环节的 ITGap 分析 session', timestamp: getTimeStr(), confirmed: false });
  const block = document.createElement('div');
  block.className = 'problem-detail-chat-msg problem-detail-chat-msg-system problem-detail-chat-local-itgap-start problem-detail-chat-msg-with-delete';
  block.dataset.msgIndex = String(problemDetailChatMessages.length - 1);
  block.innerHTML = `
    <button type="button" class="btn-delete-chat-msg" aria-label="删除">${DELETE_CHAT_MSG_ICON}</button>
    <div class="problem-detail-chat-msg-content-wrap">
      <div class="problem-detail-chat-msg-content">即将生成每个环节的 ITGap 分析 session</div>
      <div class="problem-detail-chat-local-itgap-start-actions">
        <button type="button" class="btn-confirm-start-local-itgap">确认</button>
      </div>
    </div>
    <div class="problem-detail-chat-msg-time">${getTimeStr()}</div>`;
  container.appendChild(block);
  container.scrollTop = container.scrollHeight;
}

/** 局部 ITGap 分析全部完成后，展示「即将开始 IT 策略规划」提示块 */
function maybeShowItStrategyPlanStartBlock() {
  const container = el.problemDetailChatMessages;
  const item = currentProblemDetailItem;
  if (!container || !item?.createdAt) return;
  const valueStream = resolveValueStreamForItGap(item);
  if (!valueStream || valueStream.raw) return;
  const { stages } = parseValueStreamGraph(valueStream);
  const allSteps = stages.flatMap((s) => s.steps);
  if (allSteps.length === 0) return;
  const analyses = item.localItGapAnalyses || [];
  const sessions = item.localItGapSessions || [];
  const completedCount = Math.max(analyses.length, sessions.filter((s) => s.analysisJson).length);
  if (completedCount < allSteps.length) return;
  if (problemDetailChatMessages.some((m) => m.type === 'itStrategyPlanStartBlock')) return;
  if ((item.currentMajorStage ?? 0) >= 3) return;
  pushAndSaveProblemDetailChat({ type: 'itStrategyPlanStartBlock', content: '即将开始 IT 策略规划', timestamp: getTimeStr(), confirmed: false });
  const block = document.createElement('div');
  block.className = 'problem-detail-chat-msg problem-detail-chat-msg-system problem-detail-chat-it-strategy-plan-start problem-detail-chat-msg-with-delete';
  block.dataset.msgIndex = String(problemDetailChatMessages.length - 1);
  block.innerHTML = `
    <button type="button" class="btn-delete-chat-msg" aria-label="删除">${DELETE_CHAT_MSG_ICON}</button>
    <div class="problem-detail-chat-msg-content-wrap">
      <div class="problem-detail-chat-msg-content">即将开始 IT 策略规划</div>
      <div class="problem-detail-chat-it-strategy-plan-start-actions">
        <button type="button" class="btn-confirm-start-it-strategy-plan btn-confirm-primary">确认</button>
      </div>
    </div>
    <div class="problem-detail-chat-msg-time">${getTimeStr()}</div>`;
  container.appendChild(block);
  container.scrollTop = container.scrollHeight;
}

async function runLocalItGapAnalysisForNextStep() {
  const container = el.problemDetailChatMessages;
  const item = currentProblemDetailItem;
  if (!container || !item?.createdAt) return;
  const valueStream = resolveValueStreamForItGap(item);
  if (!valueStream || valueStream.raw) return;
  if (!DEEPSEEK_API_KEY) {
    const errBlock = document.createElement('div');
    errBlock.className = 'problem-detail-chat-msg problem-detail-chat-msg-system';
    errBlock.innerHTML = `<div class="problem-detail-chat-msg-content-wrap"><div class="problem-detail-chat-msg-content">请在 main.js 中配置 DEEPSEEK_API_KEY 才能使用局部 ITGap 分析功能。</div></div><div class="problem-detail-chat-msg-time">${getTimeStr()}</div>`;
    container.appendChild(errBlock);
    pushAndSaveProblemDetailChat({ role: 'system', content: '请在 main.js 中配置 DEEPSEEK_API_KEY 才能使用局部 ITGap 分析功能。', timestamp: getTimeStr() });
    return;
  }
  const globalItGap = item.globalItGapAnalysisJson;
  if (!globalItGap) return;
  const { stages } = parseValueStreamGraph(valueStream);
  const allSteps = stages.flatMap((s) => s.steps);
  const sessions = item.localItGapSessions || [];
  const analyses = item.localItGapAnalyses || [];
  let nextIndex;
  if (sessions.length > 0) {
    const firstUnfinished = sessions.findIndex((s) => !s.analysisJson);
    if (firstUnfinished < 0) return;
    nextIndex = firstUnfinished;
  } else {
    nextIndex = analyses.length;
  }
  if (nextIndex >= allSteps.length) return;
  const step = allSteps[nextIndex];
  const stepName = step?.name || `环节${nextIndex + 1}`;
  const parsingBlock = document.createElement('div');
  parsingBlock.className = 'problem-detail-chat-msg problem-detail-chat-msg-system problem-detail-chat-msg-parsing';
  parsingBlock.innerHTML = `<div class="problem-detail-chat-msg-content-wrap"><div class="problem-detail-chat-parsing-inner"><span class="problem-detail-chat-spinner"></span><span class="problem-detail-chat-msg-content">正在分析环节「${escapeHtml(stepName)}」…</span></div></div><div class="problem-detail-chat-msg-time">${getTimeStr()}</div>`;
  container.appendChild(parsingBlock);
  container.scrollTop = container.scrollHeight;
  try {
    const { content, usage, model, durationMs } = await generateLocalItGapAnalysis(stepName, globalItGap, valueStream);
    parsingBlock.remove();
    let analysisJson = parseLocalItGapFromContent(content);
    if (!Object.values(analysisJson).some((v) => v)) analysisJson = { statusQuo: content || '（解析失败）', itGap3DMap: '', actionableRequirements: '', businessValuePrediction: '' };
    const llmMeta = { usage, model, durationMs };
    const llmMetaHtml = buildLlmMetaHtml(llmMeta);
    const structuredHtml = buildLocalItGapStructuredHtml(analysisJson);
    const analysisMarkdown = buildLocalItGapMarkdown(analysisJson);
    updateDigitalProblemLocalItGapAnalysis(item.createdAt, stepName, nextIndex, analysisJson, analysisMarkdown);
    const list = getDigitalProblems();
    const updated = list.find((it) => it.createdAt === item.createdAt);
    if (updated) currentProblemDetailItem = updated;
    const cardBlock = document.createElement('div');
    cardBlock.className = 'problem-detail-chat-msg problem-detail-chat-msg-system problem-detail-chat-local-itgap-card problem-detail-chat-msg-with-delete';
    cardBlock.dataset.msgIndex = String(problemDetailChatMessages.length);
    cardBlock.dataset.stepName = stepName;
    cardBlock.dataset.stepIndex = String(nextIndex);
    cardBlock.innerHTML = `
      <button type="button" class="btn-delete-chat-msg" aria-label="删除">${DELETE_CHAT_MSG_ICON}</button>
      <div class="problem-detail-chat-local-itgap-card-wrap">
        <div class="problem-detail-chat-local-itgap-card-header">局部 ITGap 分析：${escapeHtml(stepName)}</div>
        <div class="problem-detail-chat-local-itgap-card-body">${structuredHtml}</div>
        <div class="problem-detail-chat-local-itgap-card-actions">
          <button type="button" class="btn-confirm-local-itgap btn-confirm-primary" disabled>已确认</button>
        </div>
      </div>
      <div class="problem-detail-chat-msg-time">${getTimeStr()}</div>
      <div class="problem-detail-chat-local-itgap-card-meta">${llmMetaHtml}</div>`;
    container.appendChild(cardBlock);
    pushAndSaveProblemDetailChat({ type: 'localItGapAnalysisCard', data: analysisJson, stepName, stepIndex: nextIndex, timestamp: getTimeStr(), confirmed: true, llmMeta });
    pushAndSaveProblemDetailChat({ type: 'localItGapAnalysisLog', content: `已生成环节「${stepName}」的局部 ITGap 分析`, timestamp: getTimeStr(), taskLabel: '局部 ITGap 分析', stepName, stepIndex: nextIndex, analysisJson, llmMeta });
    container.scrollTop = container.scrollHeight;
    renderProblemDetailContent();
    container.innerHTML = '';
    renderProblemDetailChatFromStorage(container, problemDetailChatMessages);
    container.scrollTop = container.scrollHeight;
    renderProblemDetailHistory();
    if (nextIndex + 1 >= allSteps.length) {
      requestAnimationFrame(() => maybeShowItStrategyPlanStartBlock());
    } else {
      requestAnimationFrame(() => runLocalItGapAnalysisForNextStep());
    }
  } catch (err) {
    parsingBlock.remove();
    const errBlock = document.createElement('div');
    errBlock.className = 'problem-detail-chat-msg problem-detail-chat-msg-system';
    errBlock.innerHTML = `<div class="problem-detail-chat-msg-content-wrap"><div class="problem-detail-chat-msg-content">局部 ITGap 分析失败：${escapeHtml(err.message || String(err))}</div></div><div class="problem-detail-chat-msg-time">${getTimeStr()}</div>`;
    container.appendChild(errBlock);
    pushAndSaveProblemDetailChat({ role: 'system', content: '局部 ITGap 分析失败：' + (err.message || String(err)), timestamp: getTimeStr() });
    container.scrollTop = container.scrollHeight;
  }
}

async function runGlobalItGapAnalysis(isRedo) {
  const container = el.problemDetailChatMessages;
  const item = currentProblemDetailItem;
  if (!container || !item?.createdAt) return;
  if (!DEEPSEEK_API_KEY) {
    const errBlock = document.createElement('div');
    errBlock.className = 'problem-detail-chat-msg problem-detail-chat-msg-system';
    errBlock.innerHTML = `<div class="problem-detail-chat-msg-content-wrap"><div class="problem-detail-chat-msg-content">请在 main.js 中配置 DEEPSEEK_API_KEY 才能使用全局 ITGap 分析功能。</div></div><div class="problem-detail-chat-msg-time">${getTimeStr()}</div>`;
    container.appendChild(errBlock);
    pushAndSaveProblemDetailChat({ role: 'system', content: '请在 main.js 中配置 DEEPSEEK_API_KEY 才能使用全局 ITGap 分析功能。', timestamp: getTimeStr() });
    return;
  }
  const enterpriseContext = {
    basicInfo: item.basicInfo || problemDetailConfirmedBasicInfo,
    requirementLogic: item.requirementLogic,
    preliminary: { customerName: item.customerName, customerNeedsOrChallenges: item.customerNeedsOrChallenges, customerItStatus: item.customerItStatus, projectTimeRequirement: item.projectTimeRequirement },
  };
  const businessCanvas = item.bmc || {};
  const fullProcessVsm = item.valueStream;
  let parsingBlock = null;
  if (!isRedo) {
    parsingBlock = document.createElement('div');
    parsingBlock.className = 'problem-detail-chat-msg problem-detail-chat-msg-system problem-detail-chat-msg-parsing';
    parsingBlock.innerHTML = `<div class="problem-detail-chat-msg-content-wrap"><div class="problem-detail-chat-parsing-inner"><span class="problem-detail-chat-spinner"></span><span class="problem-detail-chat-msg-content">正在开展全局 ITGap 分析…</span></div></div><div class="problem-detail-chat-msg-time">${getTimeStr()}</div>`;
    container.appendChild(parsingBlock);
    container.scrollTop = container.scrollHeight;
  } else {
    const lastCard = container.querySelector('.problem-detail-chat-global-itgap-card');
    if (lastCard) {
      const wrap = lastCard.querySelector('.problem-detail-chat-global-itgap-card-body');
      if (wrap) {
        wrap.innerHTML = `<div class="problem-detail-chat-parsing-inner"><span class="problem-detail-chat-spinner"></span><span class="problem-detail-chat-msg-content">正在重新生成全局 ITGap 分析…</span></div>`;
      }
    }
  }
  try {
    const { content, usage, model, durationMs } = await generateGlobalItGapAnalysis(enterpriseContext, businessCanvas, fullProcessVsm);
    if (parsingBlock) parsingBlock.remove();
    let analysisJson = null;
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      try {
        analysisJson = JSON.parse(jsonMatch[0]);
      } catch (_) {}
    }
    if (!analysisJson) analysisJson = { structuralGap: '', collaborationGap: '', digitalBlindSpots: '', roadmapStrategy: '', globalInsight: content || '（解析失败）', asIsToBeTable: '', top3Gaps: [] };
    const llmMeta = { usage, model, durationMs };
    const llmMetaHtml = buildLlmMetaHtml(llmMeta);
    const jsonStr = escapeHtml(JSON.stringify(analysisJson, null, 2));
    const dataAttr = String(JSON.stringify(analysisJson)).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    let cardBlock = container.querySelector('.problem-detail-chat-global-itgap-card');
    if (isRedo && cardBlock) {
      const wrap = cardBlock.querySelector('.problem-detail-chat-global-itgap-card-wrap');
      if (wrap) {
        wrap.innerHTML = `
          <div class="problem-detail-chat-global-itgap-card-header">全局 ITGap 分析</div>
          <div class="problem-detail-chat-global-itgap-card-body"><pre class="problem-detail-chat-json-pre">${jsonStr}</pre></div>
          <div class="problem-detail-chat-global-itgap-card-actions">
            <button type="button" class="btn-confirm-global-itgap-json btn-confirm-primary" data-json="${dataAttr}">确认</button>
            <button type="button" class="btn-redo-global-itgap">重做</button>
          </div>`;
      }
      cardBlock.querySelector('.problem-detail-chat-global-itgap-card-meta')?.remove();
      const metaDiv = document.createElement('div');
      metaDiv.className = 'problem-detail-chat-global-itgap-card-meta';
      metaDiv.innerHTML = llmMetaHtml;
      cardBlock.appendChild(metaDiv);
      const idx = parseInt(cardBlock.dataset.msgIndex, 10);
      if (!isNaN(idx) && idx >= 0 && idx < problemDetailChatMessages.length) {
        problemDetailChatMessages[idx] = { ...problemDetailChatMessages[idx], data: analysisJson, structuredView: false, llmMeta };
        saveProblemDetailChat(item.createdAt, problemDetailChatMessages);
      }
    } else {
      cardBlock = document.createElement('div');
      cardBlock.className = 'problem-detail-chat-msg problem-detail-chat-msg-system problem-detail-chat-global-itgap-card problem-detail-chat-msg-with-delete';
      cardBlock.dataset.msgIndex = String(problemDetailChatMessages.length);
      cardBlock.innerHTML = `
        <button type="button" class="btn-delete-chat-msg" aria-label="删除">${DELETE_CHAT_MSG_ICON}</button>
        <div class="problem-detail-chat-global-itgap-card-wrap">
          <div class="problem-detail-chat-global-itgap-card-header">全局 ITGap 分析</div>
          <div class="problem-detail-chat-global-itgap-card-body"><pre class="problem-detail-chat-json-pre">${jsonStr}</pre></div>
          <div class="problem-detail-chat-global-itgap-card-actions">
            <button type="button" class="btn-confirm-global-itgap-json btn-confirm-primary" data-json="${dataAttr}">确认</button>
            <button type="button" class="btn-redo-global-itgap">重做</button>
          </div>
        </div>
        <div class="problem-detail-chat-msg-time">${getTimeStr()}</div>
        <div class="problem-detail-chat-global-itgap-card-meta">${llmMetaHtml}</div>`;
      container.appendChild(cardBlock);
      pushAndSaveProblemDetailChat({ type: 'globalItGapAnalysisCard', data: analysisJson, structuredView: false, timestamp: getTimeStr(), confirmed: false, llmMeta });
    }
    container.scrollTop = container.scrollHeight;
  } catch (err) {
    if (parsingBlock) parsingBlock.remove();
    const errBlock = document.createElement('div');
    errBlock.className = 'problem-detail-chat-msg problem-detail-chat-msg-system';
    errBlock.innerHTML = `<div class="problem-detail-chat-msg-content-wrap"><div class="problem-detail-chat-msg-content">全局 ITGap 分析失败：${escapeHtml(err.message || String(err))}</div></div><div class="problem-detail-chat-msg-time">${getTimeStr()}</div>`;
    container.appendChild(errBlock);
    pushAndSaveProblemDetailChat({ role: 'system', content: '全局 ITGap 分析失败：' + (err.message || String(err)), timestamp: getTimeStr() });
    container.scrollTop = container.scrollHeight;
  }
}

function maybeShowItGapStartBlock() {
  const container = el.problemDetailChatMessages;
  const item = currentProblemDetailItem;
  if (!container || !item?.createdAt) return;
  const wfCompleted = item.workflowAlignCompletedStages || [];
  if (wfCompleted.length < 3 || !wfCompleted.includes(0) || !wfCompleted.includes(1) || !wfCompleted.includes(2)) return;
  const currentMajorStage = item.currentMajorStage ?? 0;
  if (currentMajorStage < 1) return;
  const hasStart = problemDetailChatMessages.some((m) => m.type === 'itGapStartBlock');
  if (hasStart) return;
  pushAndSaveProblemDetailChat({ type: 'itGapStartBlock', timestamp: getTimeStr() });
  const block = document.createElement('div');
  block.className = 'problem-detail-chat-msg problem-detail-chat-msg-system problem-detail-chat-it-gap-start problem-detail-chat-msg-with-delete';
  block.dataset.msgIndex = String(problemDetailChatMessages.length - 1);
  block.innerHTML = `
    <button type="button" class="btn-delete-chat-msg" aria-label="删除">${DELETE_CHAT_MSG_ICON}</button>
    <div class="problem-detail-chat-msg-content-wrap">
      <div class="problem-detail-chat-msg-content">即将在现有价值流上开始 ITGap 分析</div>
      <div class="problem-detail-chat-it-gap-start-actions">
        <button type="button" class="btn-confirm-start-it-gap">确认</button>
      </div>
    </div>
    <div class="problem-detail-chat-msg-time">${getTimeStr()}</div>`;
  container.appendChild(block);
  container.scrollTop = container.scrollHeight;
}

async function runItStatusAnnotation() {
  const container = el.problemDetailChatMessages;
  const item = currentProblemDetailItem;
  if (!container || !item?.createdAt) return;
  if (!DEEPSEEK_API_KEY) {
    const errBlock = document.createElement('div');
    errBlock.className = 'problem-detail-chat-msg problem-detail-chat-msg-system';
    errBlock.innerHTML = `<div class="problem-detail-chat-msg-content-wrap"><div class="problem-detail-chat-msg-content">请在 main.js 中配置 DEEPSEEK_API_KEY 才能使用 IT 现状标注功能。</div></div><div class="problem-detail-chat-msg-time">${getTimeStr()}</div>`;
    container.appendChild(errBlock);
    pushAndSaveProblemDetailChat({ role: 'system', content: '请在 main.js 中配置 DEEPSEEK_API_KEY 才能使用 IT 现状标注功能。', timestamp: getTimeStr() });
    return;
  }
  const valueStream = item.valueStream;
  const requirementLogic = item.requirementLogic || {};
  const logicForPrompt = typeof requirementLogic === 'string' ? requirementLogic : JSON.stringify(requirementLogic, null, 2);
  try {
    const loadingBlock = document.createElement('div');
    loadingBlock.className = 'problem-detail-chat-msg problem-detail-chat-msg-system problem-detail-chat-msg-parsing';
    loadingBlock.innerHTML = `<div class="problem-detail-chat-msg-content-wrap"><div class="problem-detail-chat-parsing-inner"><span class="problem-detail-chat-spinner"></span><span class="problem-detail-chat-msg-content">正在标注价值流图各环节 IT 现状…</span></div></div><div class="problem-detail-chat-msg-time">${getTimeStr()}</div>`;
    container.appendChild(loadingBlock);
    container.scrollTop = container.scrollHeight;
    const { content, usage, model, durationMs } = await generateItStatusAnnotation(valueStream, logicForPrompt);
    loadingBlock.remove();
    const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/);
    let annotatedVs = null;
    if (jsonMatch) {
      try {
        annotatedVs = JSON.parse(jsonMatch[1].trim());
      } catch (_) {}
    }
    if (!annotatedVs) {
      const fallbackMatch = content.match(/\{[\s\S]*\}/);
      if (fallbackMatch) {
        try {
          annotatedVs = JSON.parse(fallbackMatch[0]);
        } catch (_) {}
      }
    }
    const mergedVs = annotatedVs ? mergeItStatusIntoValueStream(valueStream, annotatedVs) : valueStream;
    pushOperationToHistory(item.createdAt, 'itStatus', JSON.parse(JSON.stringify(item)), problemDetailChatMessages.length);
    updateDigitalProblemValueStreamItStatus(item.createdAt, mergedVs);
    currentProblemDetailItem = { ...item, valueStream: mergedVs, workflowAlignCompletedStages: [...new Set([...(item.workflowAlignCompletedStages || []), 0, 1])].sort((a, b) => a - b) };
    renderProblemDetailContent();
    const llmMeta = buildLlmMetaHtml({ usage, model, durationMs });
    const doneBlock = document.createElement('div');
    doneBlock.className = 'problem-detail-chat-msg problem-detail-chat-msg-system problem-detail-chat-msg-parsed';
    doneBlock.innerHTML = `<div class="problem-detail-chat-msg-content-wrap"><div class="problem-detail-chat-msg-content">IT 现状标注完成</div><span class="problem-detail-chat-check" aria-hidden="true">✅</span></div><div class="problem-detail-chat-msg-time">${getTimeStr()}</div>${llmMeta}`;
    container.appendChild(doneBlock);
    pushAndSaveProblemDetailChat({ role: 'system', content: 'IT 现状标注完成', timestamp: getTimeStr(), hasCheck: true, llmMeta: { usage, model, durationMs } });
    container.scrollTop = container.scrollHeight;
    requestAnimationFrame(() => maybeShowPainPointStartBlock());
  } catch (err) {
    const errBlock = document.createElement('div');
    errBlock.className = 'problem-detail-chat-msg problem-detail-chat-msg-system';
    errBlock.innerHTML = `<div class="problem-detail-chat-msg-content-wrap"><div class="problem-detail-chat-msg-content">IT 现状标注失败：${escapeHtml(err.message || String(err))}</div></div><div class="problem-detail-chat-msg-time">${getTimeStr()}</div>`;
    container.appendChild(errBlock);
    pushAndSaveProblemDetailChat({ role: 'system', content: 'IT 现状标注失败：' + (err.message || String(err)), timestamp: getTimeStr() });
  }
}

async function runPainPointAnnotation(isRerun) {
  const container = el.problemDetailChatMessages;
  const item = currentProblemDetailItem;
  if (!container || !item?.createdAt) return;
  if (!DEEPSEEK_API_KEY) {
    const errBlock = document.createElement('div');
    errBlock.className = 'problem-detail-chat-msg problem-detail-chat-msg-system';
    errBlock.innerHTML = `<div class="problem-detail-chat-msg-content-wrap"><div class="problem-detail-chat-msg-content">请在 main.js 中配置 DEEPSEEK_API_KEY 才能使用痛点标注功能。</div></div><div class="problem-detail-chat-msg-time">${getTimeStr()}</div>`;
    container.appendChild(errBlock);
    pushAndSaveProblemDetailChat({ role: 'system', content: '请在 main.js 中配置 DEEPSEEK_API_KEY 才能使用痛点标注功能。', timestamp: getTimeStr() });
    return;
  }
  const valueStream = item.valueStream;
  const requirementLogic = item.requirementLogic || {};
  const logicForPrompt = typeof requirementLogic === 'string' ? requirementLogic : JSON.stringify(requirementLogic, null, 2);
  let loadingBlock = isRerun ? (() => { const arr = container.querySelectorAll('.problem-detail-chat-msg-parsing'); return arr[arr.length - 1] || null; })() : null;
  if (!loadingBlock) {
    loadingBlock = document.createElement('div');
    loadingBlock.className = 'problem-detail-chat-msg problem-detail-chat-msg-system problem-detail-chat-msg-parsing';
    loadingBlock.innerHTML = `<div class="problem-detail-chat-msg-content-wrap"><div class="problem-detail-chat-parsing-inner"><span class="problem-detail-chat-spinner"></span><span class="problem-detail-chat-msg-content">正在标注价值流图各环节痛点…</span></div></div><div class="problem-detail-chat-msg-time">${getTimeStr()}</div>`;
    container.appendChild(loadingBlock);
  }
  container.scrollTop = container.scrollHeight;
  try {
    const { content, usage, model, durationMs } = await generatePainPointAnnotation(valueStream, logicForPrompt);
    loadingBlock.remove();
    const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/);
    let annotatedVs = null;
    if (jsonMatch) {
      try {
        annotatedVs = JSON.parse(jsonMatch[1].trim());
      } catch (_) {}
    }
    if (!annotatedVs) {
      const fallbackMatch = content.match(/\{[\s\S]*\}/);
      if (fallbackMatch) {
        try {
          annotatedVs = JSON.parse(fallbackMatch[0]);
        } catch (_) {}
      }
    }
    const mergedVs = annotatedVs ? mergePainPointIntoValueStream(valueStream, annotatedVs) : valueStream;
    pushOperationToHistory(item.createdAt, 'painPoint', JSON.parse(JSON.stringify(item)), problemDetailChatMessages.length);
    updateDigitalProblemValueStreamPainPoint(item.createdAt, mergedVs);
    currentProblemDetailItem = { ...item, valueStream: mergedVs, workflowAlignCompletedStages: [...new Set([...(item.workflowAlignCompletedStages || []), 0, 1, 2])].sort((a, b) => a - b) };
    renderProblemDetailContent();
    const doneText = isRerun ? '痛点标注完毕' : '痛点标注完成';
    const llmMeta = buildLlmMetaHtml({ usage, model, durationMs });
    const doneBlock = document.createElement('div');
    doneBlock.className = 'problem-detail-chat-msg problem-detail-chat-msg-system problem-detail-chat-msg-parsed';
    doneBlock.innerHTML = `<div class="problem-detail-chat-msg-content-wrap"><div class="problem-detail-chat-msg-content">${escapeHtml(doneText)}</div><span class="problem-detail-chat-check" aria-hidden="true">✅</span></div><div class="problem-detail-chat-msg-time">${getTimeStr()}</div>${llmMeta}`;
    container.appendChild(doneBlock);
    pushAndSaveProblemDetailChat({ role: 'system', content: doneText, timestamp: getTimeStr(), hasCheck: true, llmMeta: { usage, model, durationMs } });
    container.scrollTop = container.scrollHeight;
    requestAnimationFrame(() => maybeShowItGapStartBlock());
  } catch (err) {
    const errBlock = document.createElement('div');
    errBlock.className = 'problem-detail-chat-msg problem-detail-chat-msg-system';
    errBlock.innerHTML = `<div class="problem-detail-chat-msg-content-wrap"><div class="problem-detail-chat-msg-content">痛点标注失败：${escapeHtml(err.message || String(err))}</div></div><div class="problem-detail-chat-msg-time">${getTimeStr()}</div>`;
    container.appendChild(errBlock);
    pushAndSaveProblemDetailChat({ role: 'system', content: '痛点标注失败：' + (err.message || String(err)), timestamp: getTimeStr() });
  }
}

function mergeItStatusIntoValueStream(baseVs, annotatedVs) {
  const baseStages = baseVs.stages ?? baseVs.phases ?? baseVs.nodes ?? [];
  const annStages = annotatedVs.stages ?? annotatedVs.phases ?? annotatedVs.nodes ?? [];
  if (!Array.isArray(baseStages) || !Array.isArray(annStages)) return baseVs;
  const stages = baseStages.map((baseStage, si) => {
    const annStage = annStages[si];
    if (!annStage) return baseStage;
    const baseSteps = baseStage.steps ?? baseStage.tasks ?? baseStage.phases ?? baseStage.items ?? [];
    const annSteps = annStage.steps ?? annStage.tasks ?? annStage.phases ?? annStage.items ?? [];
    const steps = baseSteps.map((baseStep, ji) => {
      const annStep = annSteps[ji];
      const itStatus = annStep?.itStatus ?? annStep?.it_status;
      if (!itStatus || typeof itStatus !== 'object') return baseStep;
      const step = typeof baseStep === 'object' && baseStep !== null ? { ...baseStep } : { name: String(baseStep) };
      step.itStatus = itStatus;
      return step;
    });
    return { ...baseStage, steps };
  });
  return { ...baseVs, stages };
}

function mergePainPointIntoValueStream(baseVs, annotatedVs) {
  const baseStages = baseVs.stages ?? baseVs.phases ?? baseVs.nodes ?? [];
  const annStages = annotatedVs.stages ?? annotatedVs.phases ?? annotatedVs.nodes ?? [];
  if (!Array.isArray(baseStages) || !Array.isArray(annStages)) return baseVs;
  const stages = baseStages.map((baseStage, si) => {
    const annStage = annStages[si];
    if (!annStage) return baseStage;
    const baseSteps = baseStage.steps ?? baseStage.tasks ?? baseStage.phases ?? baseStage.items ?? [];
    const annSteps = annStage.steps ?? annStage.tasks ?? annStage.phases ?? annStage.items ?? [];
    const steps = baseSteps.map((baseStep, ji) => {
      const annStep = annSteps[ji];
      const painPoint = annStep?.painPoint ?? annStep?.pain_point;
      if (painPoint == null || (typeof painPoint === 'string' && !painPoint.trim())) return baseStep;
      const trimmed = typeof painPoint === 'string' ? painPoint.trim() : String(painPoint);
      if (/^(无明显痛点|无痛点|暂无|无)$/i.test(trimmed) || /^无明显痛点/i.test(trimmed)) return baseStep;
      const step = typeof baseStep === 'object' && baseStep !== null ? { ...baseStep } : { name: String(baseStep) };
      step.painPoint = trimmed;
      return step;
    });
    return { ...baseStage, steps };
  });
  return { ...baseVs, stages };
}

async function runValueStreamGeneration() {
  const container = el.problemDetailChatMessages;
  const item = currentProblemDetailItem;
  if (!container || !item?.createdAt) return;
  if (!DEEPSEEK_API_KEY) {
    const errBlock = document.createElement('div');
    errBlock.className = 'problem-detail-chat-msg problem-detail-chat-msg-system';
    errBlock.innerHTML = `<div class="problem-detail-chat-msg-content-wrap"><div class="problem-detail-chat-msg-content">请在 main.js 中配置 DEEPSEEK_API_KEY 才能使用价值流图生成功能。</div></div><div class="problem-detail-chat-msg-time">${getTimeStr()}</div>`;
    container.appendChild(errBlock);
    pushAndSaveProblemDetailChat({ role: 'system', content: '请在 main.js 中配置 DEEPSEEK_API_KEY 才能使用价值流图生成功能。', timestamp: getTimeStr() });
    return;
  }
  const basicInfo = item.basicInfo || problemDetailConfirmedBasicInfo || {};
  const bmc = item.bmc || {};
  const requirementLogic = item.requirementLogic || {};
  try {
    const loadingBlock = document.createElement('div');
    loadingBlock.className = 'problem-detail-chat-msg problem-detail-chat-msg-system problem-detail-chat-msg-parsing';
    loadingBlock.innerHTML = `<div class="problem-detail-chat-msg-content-wrap"><div class="problem-detail-chat-parsing-inner"><span class="problem-detail-chat-spinner"></span><span class="problem-detail-chat-msg-content">正在生成需求相关核心价值流图 VSM…</span></div></div><div class="problem-detail-chat-msg-time">${getTimeStr()}</div>`;
    container.appendChild(loadingBlock);
    container.scrollTop = container.scrollHeight;
    const { content, usage, model, durationMs } = await generateValueStreamFromInputs(basicInfo, bmc, requirementLogic);
    loadingBlock.remove();
    const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/);
    let valueStreamJson = null;
    if (jsonMatch) {
      try {
        valueStreamJson = JSON.parse(jsonMatch[1].trim());
      } catch (_) {}
    }
    if (!valueStreamJson) {
      const fallbackMatch = content.match(/\{[\s\S]*\}/);
      if (fallbackMatch) {
        try {
          valueStreamJson = JSON.parse(fallbackMatch[0]);
        } catch (_) {}
      }
    }
    const valueStream = valueStreamJson || { raw: content };
    pushOperationToHistory(item.createdAt, 'valueStreamDraw', JSON.parse(JSON.stringify(item)), problemDetailChatMessages.length);
    pushAndSaveProblemDetailChat({ type: 'valueStreamCard', data: valueStream, logicText: content.replace(/```[\s\S]*?```/g, '').trim(), timestamp: getTimeStr(), confirmed: false, llmMeta: { usage, model, durationMs } });
    const llmMeta = buildLlmMetaHtml({ usage, model, durationMs });
    const cardBlock = document.createElement('div');
    cardBlock.className = 'problem-detail-chat-msg problem-detail-chat-msg-system problem-detail-chat-value-stream-card problem-detail-chat-msg-with-delete';
    cardBlock.dataset.msgIndex = String(problemDetailChatMessages.length - 1);
    const jsonStr = escapeHtml(JSON.stringify(valueStream, null, 2));
    cardBlock.innerHTML = `
      <button type="button" class="btn-delete-chat-msg" aria-label="删除">${DELETE_CHAT_MSG_ICON}</button>
      <div class="problem-detail-chat-value-stream-card-wrap">
        <div class="problem-detail-chat-value-stream-card-header">价值流图设计 JSON</div>
        <div class="problem-detail-chat-value-stream-card-body"><pre class="problem-detail-chat-json-pre">${jsonStr}</pre></div>
        <div class="problem-detail-chat-value-stream-card-actions">
          <button type="button" class="btn-confirm-value-stream" data-json="${String(JSON.stringify(valueStream)).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;')}">确认</button>
        </div>
      </div>
      <div class="problem-detail-chat-msg-time">${getTimeStr()}</div>${llmMeta}`;
    container.appendChild(cardBlock);
    container.scrollTop = container.scrollHeight;
    updateDigitalProblemValueStream(item.createdAt, valueStream);
    currentProblemDetailItem = { ...item, valueStream, workflowAlignCompletedStages: [...(item.workflowAlignCompletedStages || []).filter((x) => x !== 0), 0].sort((a, b) => a - b) };
    renderProblemDetailContent();
  } catch (err) {
    const errBlock = document.createElement('div');
    errBlock.className = 'problem-detail-chat-msg problem-detail-chat-msg-system';
    errBlock.innerHTML = `<div class="problem-detail-chat-msg-content-wrap"><div class="problem-detail-chat-msg-content">价值流图生成失败：${escapeHtml(err.message || String(err))}</div></div><div class="problem-detail-chat-msg-time">${getTimeStr()}</div>`;
    container.appendChild(errBlock);
    pushAndSaveProblemDetailChat({ role: 'system', content: '价值流图生成失败：' + (err.message || String(err)), timestamp: getTimeStr() });
  }
}

function renderProblemDetailChatFromStorage(container, messages) {
  const item = currentProblemDetailItem;
  messages.forEach((msg, idx) => {
    if (msg.type === 'requirementLogicStartBlock') {
      if (item?.requirementLogic) return;
      const block = document.createElement('div');
      block.className = 'problem-detail-chat-msg problem-detail-chat-msg-system problem-detail-chat-requirement-logic-start problem-detail-chat-msg-with-delete';
      block.dataset.msgIndex = String(idx);
      const confirmed = !!msg.confirmed;
      block.innerHTML = `
        <button type="button" class="btn-delete-chat-msg" aria-label="删除">${DELETE_CHAT_MSG_ICON}</button>
        <div class="problem-detail-chat-msg-content-wrap">
          <div class="problem-detail-chat-msg-content">我即将开始提取需求逻辑</div>
          <div class="problem-detail-chat-requirement-logic-start-actions">
            <button type="button" class="btn-confirm-start-requirement-logic" ${confirmed ? 'disabled' : ''}>${confirmed ? '已确认' : '确认'}</button>
          </div>
        </div>
        <div class="problem-detail-chat-msg-time">${escapeHtml(msg.timestamp || '')}</div>`;
      container.appendChild(block);
    } else if (msg.type === 'itStatusStartBlock') {
      const hasItStatus = item?.valueStream && !item.valueStream.raw && (() => {
        const rawStages = item.valueStream.stages ?? item.valueStream.phases ?? item.valueStream.nodes ?? [];
        if (!Array.isArray(rawStages)) return false;
        for (const s of rawStages) {
          const steps = s.steps ?? s.tasks ?? s.phases ?? s.items ?? [];
          for (const st of steps) {
            if (st && typeof st === 'object' && (st.itStatus || st.it_status)) return true;
          }
        }
        return false;
      })();
      if (hasItStatus) return;
      const block = document.createElement('div');
      block.className = 'problem-detail-chat-msg problem-detail-chat-msg-system problem-detail-chat-it-status-start';
      block.dataset.msgIndex = String(idx);
      const confirmed = !!msg.confirmed;
      block.innerHTML = `
        <div class="problem-detail-chat-msg-content-wrap">
          <div class="problem-detail-chat-msg-content">即将开始 IT 现状标注</div>
          <div class="problem-detail-chat-it-status-start-actions">
            <button type="button" class="btn-confirm-start-it-status" ${confirmed ? 'disabled' : ''}>${confirmed ? '已确认' : '确认'}</button>
          </div>
        </div>
        <div class="problem-detail-chat-msg-time">${escapeHtml(msg.timestamp || '')}</div>`;
      container.appendChild(block);
    } else if (msg.type === 'painPointStartBlock') {
      const hasPainPoint = item?.valueStream && !item.valueStream.raw && (() => {
        const rawStages = item.valueStream.stages ?? item.valueStream.phases ?? item.valueStream.nodes ?? [];
        if (!Array.isArray(rawStages)) return false;
        for (const s of rawStages) {
          const steps = s.steps ?? s.tasks ?? s.phases ?? s.items ?? [];
          for (const st of steps) {
            const pp = st?.painPoint ?? st?.pain_point;
            if (pp && typeof pp === 'string' && pp.trim()) return true;
          }
        }
        return false;
      })();
      if (hasPainPoint) return;
      const block = document.createElement('div');
      block.className = 'problem-detail-chat-msg problem-detail-chat-msg-system problem-detail-chat-pain-point-start problem-detail-chat-msg-with-delete';
      block.dataset.msgIndex = String(idx);
      const confirmed = !!msg.confirmed;
      block.innerHTML = `
        <button type="button" class="btn-delete-chat-msg" aria-label="删除">${DELETE_CHAT_MSG_ICON}</button>
        <div class="problem-detail-chat-msg-content-wrap">
          <div class="problem-detail-chat-msg-content">即将开始价值流图环节节点痛点标注</div>
          <div class="problem-detail-chat-pain-point-start-actions">
            <button type="button" class="btn-confirm-start-pain-point" ${confirmed ? 'disabled' : ''}>${confirmed ? '已确认' : '确认'}</button>
          </div>
        </div>
        <div class="problem-detail-chat-msg-time">${escapeHtml(msg.timestamp || '')}</div>`;
      container.appendChild(block);
    } else if (msg.type === 'itGapStartBlock') {
      const block = document.createElement('div');
      block.className = 'problem-detail-chat-msg problem-detail-chat-msg-system problem-detail-chat-it-gap-start problem-detail-chat-msg-with-delete';
      block.dataset.msgIndex = String(idx);
      const confirmed = !!msg.confirmed;
      block.innerHTML = `
        <button type="button" class="btn-delete-chat-msg" aria-label="删除">${DELETE_CHAT_MSG_ICON}</button>
        <div class="problem-detail-chat-msg-content-wrap">
          <div class="problem-detail-chat-msg-content">即将在现有价值流上开始 ITGap 分析</div>
          <div class="problem-detail-chat-it-gap-start-actions">
            <button type="button" class="btn-confirm-start-it-gap" ${confirmed ? 'disabled' : ''}>${confirmed ? '已确认' : '确认'}</button>
          </div>
        </div>
        <div class="problem-detail-chat-msg-time">${escapeHtml(msg.timestamp || '')}</div>`;
      container.appendChild(block);
    } else if (msg.type === 'valueStreamStartBlock') {
      if (item?.valueStream) return;
      const block = document.createElement('div');
      block.className = 'problem-detail-chat-msg problem-detail-chat-msg-system problem-detail-chat-value-stream-start problem-detail-chat-msg-with-delete';
      block.dataset.msgIndex = String(idx);
      const confirmed = !!msg.confirmed;
      block.innerHTML = `
        <button type="button" class="btn-delete-chat-msg" aria-label="删除">${DELETE_CHAT_MSG_ICON}</button>
        <div class="problem-detail-chat-msg-content-wrap">
          <div class="problem-detail-chat-msg-content">我即将开始需求相关核心价值流图绘制</div>
          <div class="problem-detail-chat-value-stream-start-actions">
            <button type="button" class="btn-confirm-start-value-stream" ${confirmed ? 'disabled' : ''}>${confirmed ? '已确认' : '确认'}</button>
          </div>
        </div>
        <div class="problem-detail-chat-msg-time">${escapeHtml(msg.timestamp || '')}</div>`;
      container.appendChild(block);
    } else if (msg.type === 'bmcStartBlock') {
      if (item?.bmc) return;
      const block = document.createElement('div');
      block.className = 'problem-detail-chat-msg problem-detail-chat-msg-system problem-detail-chat-bmc-start problem-detail-chat-msg-with-delete';
      block.dataset.msgIndex = String(idx);
      const confirmed = !!msg.confirmed;
      block.innerHTML = `
        <button type="button" class="btn-delete-chat-msg" aria-label="删除">${DELETE_CHAT_MSG_ICON}</button>
        <div class="problem-detail-chat-msg-content-wrap">
          <div class="problem-detail-chat-msg-content">我将发起商业模式画布 BMC 生成</div>
          <div class="problem-detail-chat-bmc-start-actions">
            <button type="button" class="btn-confirm-start-bmc" ${confirmed ? 'disabled' : ''}>${confirmed ? '已确认' : '确认'}</button>
          </div>
        </div>
        <div class="problem-detail-chat-msg-time">${escapeHtml(msg.timestamp || '')}</div>`;
      container.appendChild(block);
    } else if (msg.type === 'bmcCard') {
      const data = msg.data || {};
      const confirmed = !!msg.confirmed;
      const llmMetaHtml = msg.llmMeta ? buildLlmMetaHtml(msg.llmMeta) : '';
      const cardBlock = document.createElement('div');
      cardBlock.className = 'problem-detail-chat-msg problem-detail-chat-msg-system problem-detail-chat-bmc-card-collapsible problem-detail-chat-msg-with-delete';
      cardBlock.dataset.msgIndex = String(idx);
      const bmcRows = BMC_FIELDS.map(({ key, label }) => {
        const value = (data[key] != null ? String(data[key]).trim() : '') || '—';
        return `<div class="problem-detail-bmc-row"><span class="problem-detail-bmc-label">${escapeHtml(label)}</span><span class="problem-detail-bmc-value">${escapeHtml(value)}</span></div>`;
      }).join('');
      const industryInsight = (data.industry_insight || '').trim() || '—';
      const painPoints = (data.pain_points || '').trim() || '—';
      cardBlock.innerHTML = `
        <button type="button" class="btn-delete-chat-msg" aria-label="删除">${DELETE_CHAT_MSG_ICON}</button>
        <div class="problem-detail-bmc-card" role="button" tabindex="0">
          <div class="problem-detail-bmc-card-body">
            ${industryInsight ? `<div class="problem-detail-bmc-section"><h4>行业背景洞察</h4><div class="problem-detail-bmc-content">${escapeHtml(industryInsight)}</div></div>` : ''}
            <div class="problem-detail-bmc-grid">${bmcRows}</div>
            ${painPoints ? `<div class="problem-detail-bmc-section"><h4>业务痛点预判</h4><div class="problem-detail-bmc-content">${escapeHtml(painPoints)}</div></div>` : ''}
          </div>
          <div class="problem-detail-bmc-card-expand-hint">点击展开</div>
          <div class="problem-detail-bmc-card-actions">
            <button type="button" class="btn-confirm-bmc" data-json="${String(JSON.stringify(data)).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;')}" ${confirmed ? 'disabled' : ''}>${confirmed ? '已确认' : '确认'}</button>
          </div>
        </div>
        <div class="problem-detail-chat-msg-time">${escapeHtml(msg.timestamp || '')}</div>${llmMetaHtml}`;
      container.appendChild(cardBlock);
      setupProblemDetailBmcCardToggle(cardBlock);
    } else if (msg.type === 'requirementLogicBlock') {
      const content = msg.content || '';
      const parsed = msg.parsed || parseRequirementLogicFromMarkdown(content);
      const confirmed = !!msg.confirmed;
      const hasAnyContent = REQUIREMENT_LOGIC_SECTIONS.some(({ key }) => (parsed[key] || '').trim());
      const rows = hasAnyContent
        ? REQUIREMENT_LOGIC_SECTIONS.map(({ key, label }) => {
            const val = (parsed[key] || '').trim() || '—';
            return `<div class="problem-detail-basic-info-row"><span class="problem-detail-basic-info-label">${escapeHtml(label)}</span><span class="problem-detail-basic-info-value markdown-body">${renderMarkdown(val)}</span></div>`;
          }).join('')
        : `<div class="problem-detail-basic-info-row"><span class="problem-detail-basic-info-label">原始输出</span><span class="problem-detail-basic-info-value markdown-body">${renderMarkdown(content)}</span></div>`;
      const cardBlock = document.createElement('div');
      cardBlock.className = 'problem-detail-chat-msg problem-detail-chat-msg-system problem-detail-chat-card-collapsible problem-detail-chat-msg-with-delete problem-detail-chat-requirement-logic-card';
      cardBlock.dataset.msgIndex = String(idx);
      cardBlock.innerHTML = `
        <button type="button" class="btn-delete-chat-msg" aria-label="删除">${DELETE_CHAT_MSG_ICON}</button>
        <div class="problem-detail-basic-info-card" role="button" tabindex="0">
          <div class="problem-detail-basic-info-card-body">${rows}</div>
          <div class="problem-detail-basic-info-card-actions">
            <button type="button" class="btn-confirm-requirement-logic" ${confirmed ? 'disabled' : ''}>${confirmed ? '已确认' : '确认'}</button>
          </div>
        </div>
        <div class="problem-detail-chat-msg-time">${escapeHtml(msg.timestamp || '')}</div>`;
      container.appendChild(cardBlock);
      setupProblemDetailRequirementLogicCardToggle(cardBlock);
    } else if (msg.type === 'drawValueStreamStartBlock') {
      const data = msg.data || {};
      const confirmed = !!msg.confirmed;
      const block = document.createElement('div');
      block.className = 'problem-detail-chat-msg problem-detail-chat-msg-system problem-detail-chat-draw-value-stream-start';
      block.dataset.msgIndex = String(idx);
      block.innerHTML = `
        <div class="problem-detail-chat-msg-content-wrap">
          <div class="problem-detail-chat-msg-content">开始绘制价值流图</div>
          <div class="problem-detail-chat-draw-value-stream-start-actions">
            <button type="button" class="btn-confirm-draw-value-stream" data-json="${String(JSON.stringify(data)).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;')}" ${confirmed ? 'disabled' : ''}>${confirmed ? '已确认' : '确认'}</button>
          </div>
        </div>
        <div class="problem-detail-chat-msg-time">${escapeHtml(msg.timestamp || '')}</div>`;
      container.appendChild(block);
    } else if (msg.type === 'valueStreamCard') {
      const data = msg.data || {};
      const confirmed = !!msg.confirmed;
      const llmMetaHtml = msg.llmMeta ? buildLlmMetaHtml(msg.llmMeta) : '';
      const cardBlock = document.createElement('div');
      cardBlock.className = 'problem-detail-chat-msg problem-detail-chat-msg-system problem-detail-chat-value-stream-card problem-detail-chat-msg-with-delete';
      cardBlock.dataset.msgIndex = String(idx);
      const jsonStr = escapeHtml(JSON.stringify(data, null, 2));
      cardBlock.innerHTML = `
        <button type="button" class="btn-delete-chat-msg" aria-label="删除">${DELETE_CHAT_MSG_ICON}</button>
        <div class="problem-detail-chat-value-stream-card-wrap">
          <div class="problem-detail-chat-value-stream-card-header">价值流图设计 JSON</div>
          <div class="problem-detail-chat-value-stream-card-body"><pre class="problem-detail-chat-json-pre">${jsonStr}</pre></div>
          <div class="problem-detail-chat-value-stream-card-actions">
            <button type="button" class="btn-confirm-value-stream" data-json="${String(JSON.stringify(data)).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;')}" ${confirmed ? 'disabled' : ''}>${confirmed ? '已确认' : '确认'}</button>
          </div>
        </div>
        <div class="problem-detail-chat-msg-time">${escapeHtml(msg.timestamp || '')}</div>${llmMetaHtml}`;
      container.appendChild(cardBlock);
    } else if (msg.type === 'basicInfoJsonBlock') {
      const jsonBlock = document.createElement('div');
      jsonBlock.className = 'problem-detail-chat-msg problem-detail-chat-msg-system problem-detail-chat-json-block problem-detail-chat-json-collapsible problem-detail-chat-msg-with-delete';
      jsonBlock.dataset.msgIndex = String(idx);
      jsonBlock.innerHTML = `<button type="button" class="btn-delete-chat-msg" aria-label="删除">${DELETE_CHAT_MSG_ICON}</button><div class="problem-detail-chat-json-wrap" role="button" tabindex="0"><pre class="problem-detail-chat-json-pre">${escapeHtml(JSON.stringify(msg.json || {}, null, 2))}</pre></div><div class="problem-detail-chat-msg-time">${escapeHtml(msg.timestamp || '')}</div>`;
      container.appendChild(jsonBlock);
      setupProblemDetailJsonBlockToggle(jsonBlock);
    } else if (msg.type === 'modificationClarificationRequest') {
      const block = document.createElement('div');
      block.className = 'problem-detail-chat-msg problem-detail-chat-msg-system problem-detail-chat-msg-clarification';
      block.dataset.msgIndex = String(idx);
      block.innerHTML = `<div class="problem-detail-chat-msg-content-wrap"><div class="problem-detail-chat-msg-content markdown-body">${renderMarkdown(msg.content || MODIFICATION_CLARIFICATION_TEXT)}</div></div><div class="problem-detail-chat-msg-time">${escapeHtml(msg.timestamp || '')}</div>`;
      container.appendChild(block);
    } else if (msg.type === 'e2eFlowExtractStartBlock') {
      const confirmed = !!msg.confirmed;
      const block = document.createElement('div');
      block.className = 'problem-detail-chat-msg problem-detail-chat-msg-system problem-detail-chat-e2e-extract-start problem-detail-chat-msg-with-delete';
      block.dataset.msgIndex = String(idx);
      block.innerHTML = `
        <button type="button" class="btn-delete-chat-msg" aria-label="删除">${DELETE_CHAT_MSG_ICON}</button>
        <div class="problem-detail-chat-msg-content-wrap">
          <div class="problem-detail-chat-msg-content">我先需要提取端到端流程绘制的 json 数据</div>
          <div class="problem-detail-chat-e2e-extract-actions">
            <button type="button" class="btn-confirm-e2e-extract" ${confirmed ? 'disabled' : ''}>${confirmed ? '已确认' : '确认'}</button>
          </div>
        </div>
        <div class="problem-detail-chat-msg-time">${escapeHtml(msg.timestamp || '')}</div>`;
      container.appendChild(block);
    } else if (msg.type === 'e2eFlowJsonBlock') {
      const jsonBlock = document.createElement('div');
      jsonBlock.className = 'problem-detail-chat-msg problem-detail-chat-msg-system problem-detail-chat-e2e-json-block problem-detail-chat-msg-with-delete';
      jsonBlock.dataset.msgIndex = String(idx);
      const vs = msg.valueStreamJson || {};
      const jsonStr = escapeHtml(JSON.stringify(vs, null, 2));
      const dataAttr = String(JSON.stringify(vs)).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
      const confirmed = !!msg.confirmed;
      jsonBlock.innerHTML = `
        <button type="button" class="btn-delete-chat-msg" aria-label="删除">${DELETE_CHAT_MSG_ICON}</button>
        <div class="problem-detail-chat-e2e-json-wrap">
          <div class="problem-detail-chat-e2e-json-header">端到端流程 JSON 数据</div>
          <pre class="problem-detail-chat-json-pre">${jsonStr}</pre>
          <div class="problem-detail-chat-e2e-json-actions">
            <button type="button" class="btn-confirm-e2e-json" data-json="${dataAttr}" ${confirmed ? 'disabled' : ''}>${confirmed ? '已确认' : '确认'}</button>
          </div>
        </div>
        <div class="problem-detail-chat-msg-time">${escapeHtml(msg.timestamp || '')}</div>`;
      container.appendChild(jsonBlock);
    } else if (msg.type === 'e2eFlowGeneratedLog') {
      const taskLabel = msg.taskLabel || '端到端流程绘制';
      const block = document.createElement('div');
      block.className = 'problem-detail-chat-msg problem-detail-chat-msg-system problem-detail-chat-e2e-flow-log problem-detail-chat-msg-with-delete';
      block.dataset.msgIndex = String(idx);
      block.innerHTML = `
        <button type="button" class="btn-delete-chat-msg" aria-label="删除">${DELETE_CHAT_MSG_ICON}</button>
        <div class="problem-detail-chat-msg-content-wrap">
          <div class="problem-detail-chat-e2e-flow-log-task">${escapeHtml(taskLabel)}</div>
          <div class="problem-detail-chat-msg-content">${escapeHtml(msg.content || '已生成端到端流程 JSON 数据')}</div>
        </div>
        <div class="problem-detail-chat-msg-time">${escapeHtml(msg.timestamp || '')}</div>`;
      container.appendChild(block);
    } else if (msg.type === 'globalItGapStartBlock') {
      const confirmed = !!msg.confirmed;
      const block = document.createElement('div');
      block.className = 'problem-detail-chat-msg problem-detail-chat-msg-system problem-detail-chat-global-itgap-start problem-detail-chat-msg-with-delete';
      block.dataset.msgIndex = String(idx);
      block.innerHTML = `
        <button type="button" class="btn-delete-chat-msg" aria-label="删除">${DELETE_CHAT_MSG_ICON}</button>
        <div class="problem-detail-chat-msg-content-wrap">
          <div class="problem-detail-chat-msg-content">即将针对端到端流程开展全局 ITGap 分析</div>
          <div class="problem-detail-chat-global-itgap-start-actions">
            <button type="button" class="btn-confirm-start-global-itgap" ${confirmed ? 'disabled' : ''}>${confirmed ? '已确认' : '确认'}</button>
          </div>
        </div>
        <div class="problem-detail-chat-msg-time">${escapeHtml(msg.timestamp || '')}</div>`;
      container.appendChild(block);
    } else if (msg.type === 'globalItGapAnalysisCard') {
      const data = msg.data || {};
      const confirmed = !!msg.confirmed;
      const structuredView = !!msg.structuredView;
      const jsonStr = escapeHtml(JSON.stringify(data, null, 2));
      const dataAttr = String(JSON.stringify(data)).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
      const llmMetaHtml = msg.llmMeta ? buildLlmMetaHtml(msg.llmMeta) : '';
      const cardBlock = document.createElement('div');
      cardBlock.className = 'problem-detail-chat-msg problem-detail-chat-msg-system problem-detail-chat-global-itgap-card problem-detail-chat-msg-with-delete';
      cardBlock.dataset.msgIndex = String(idx);
      const bodyContent = structuredView
        ? `<div class="problem-detail-chat-global-itgap-structured">${buildGlobalItGapStructuredHtml(data)}</div>`
        : `<pre class="problem-detail-chat-json-pre">${jsonStr}</pre>`;
      const confirmBtn = structuredView
        ? `<button type="button" class="btn-confirm-global-itgap-structured btn-confirm-primary" data-json="${dataAttr}" ${confirmed ? 'disabled' : ''}>${confirmed ? '已确认' : '确认'}</button>`
        : `<button type="button" class="btn-confirm-global-itgap-json btn-confirm-primary" data-json="${dataAttr}">确认</button>`;
      cardBlock.innerHTML = `
        <button type="button" class="btn-delete-chat-msg" aria-label="删除">${DELETE_CHAT_MSG_ICON}</button>
        <div class="problem-detail-chat-global-itgap-card-wrap">
          <div class="problem-detail-chat-global-itgap-card-header">全局 ITGap 分析</div>
          <div class="problem-detail-chat-global-itgap-card-body">${bodyContent}</div>
          <div class="problem-detail-chat-global-itgap-card-actions">
            ${confirmBtn}
            <button type="button" class="btn-redo-global-itgap" ${confirmed ? 'disabled' : ''}>重做</button>
          </div>
        </div>
        <div class="problem-detail-chat-msg-time">${escapeHtml(msg.timestamp || '')}</div>${llmMetaHtml}`;
      container.appendChild(cardBlock);
    } else if (msg.type === 'globalItGapAnalysisLog') {
      const taskLabel = msg.taskLabel || '全局 ITGap 分析';
      const block = document.createElement('div');
      block.className = 'problem-detail-chat-msg problem-detail-chat-msg-system problem-detail-chat-global-itgap-log problem-detail-chat-msg-with-delete';
      block.dataset.msgIndex = String(idx);
      block.innerHTML = `
        <button type="button" class="btn-delete-chat-msg" aria-label="删除">${DELETE_CHAT_MSG_ICON}</button>
        <div class="problem-detail-chat-msg-content-wrap">
          <div class="problem-detail-chat-e2e-flow-log-task">${escapeHtml(taskLabel)}</div>
          <div class="problem-detail-chat-msg-content">${escapeHtml(msg.content || '已生成全局 ITGap 分析')}</div>
        </div>
        <div class="problem-detail-chat-msg-time">${escapeHtml(msg.timestamp || '')}</div>`;
      container.appendChild(block);
    } else if (msg.type === 'localItGapStartBlock') {
      const confirmed = !!msg.confirmed;
      const block = document.createElement('div');
      block.className = 'problem-detail-chat-msg problem-detail-chat-msg-system problem-detail-chat-local-itgap-start problem-detail-chat-msg-with-delete';
      block.dataset.msgIndex = String(idx);
      block.innerHTML = `
        <button type="button" class="btn-delete-chat-msg" aria-label="删除">${DELETE_CHAT_MSG_ICON}</button>
        <div class="problem-detail-chat-msg-content-wrap">
          <div class="problem-detail-chat-msg-content">即将生成每个环节的 ITGap 分析 session</div>
          <div class="problem-detail-chat-local-itgap-start-actions">
            <button type="button" class="btn-confirm-start-local-itgap" ${confirmed ? 'disabled' : ''}>${confirmed ? '已确认' : '确认'}</button>
          </div>
        </div>
        <div class="problem-detail-chat-msg-time">${escapeHtml(msg.timestamp || '')}</div>`;
      container.appendChild(block);
    } else if (msg.type === 'itStrategyPlanStartBlock') {
      const confirmed = !!msg.confirmed;
      const block = document.createElement('div');
      block.className = 'problem-detail-chat-msg problem-detail-chat-msg-system problem-detail-chat-it-strategy-plan-start problem-detail-chat-msg-with-delete';
      block.dataset.msgIndex = String(idx);
      block.innerHTML = `
        <button type="button" class="btn-delete-chat-msg" aria-label="删除">${DELETE_CHAT_MSG_ICON}</button>
        <div class="problem-detail-chat-msg-content-wrap">
          <div class="problem-detail-chat-msg-content">即将开始 IT 策略规划</div>
          <div class="problem-detail-chat-it-strategy-plan-start-actions">
            <button type="button" class="btn-confirm-start-it-strategy-plan btn-confirm-primary" ${confirmed ? 'disabled' : ''}>${confirmed ? '已确认' : '确认'}</button>
          </div>
        </div>
        <div class="problem-detail-chat-msg-time">${escapeHtml(msg.timestamp || '')}</div>`;
      container.appendChild(block);
    } else if (msg.type === 'localItGapSessionsBlock') {
      const item = currentProblemDetailItem;
      const sessions = item?.localItGapSessions || msg.sessions || [];
      const sessionsConfirmed = !!msg.confirmed;
      const hasUnfinished = sessions.some((s) => !s.analysisJson);
      const sessionsListHtml = sessions
        .map(
          (s) =>
            `<div class="problem-detail-chat-local-itgap-session-item"><span class="problem-detail-chat-local-itgap-session-name">${escapeHtml(s.stepName || `环节${s.stepIndex + 1}`)}</span><span class="problem-detail-chat-local-itgap-session-status ${s.analysisJson ? 'session-done' : 'session-pending'}">${s.analysisJson ? '已分析✅' : '待分析'}</span></div>`
        )
        .join('');
      const block = document.createElement('div');
      block.className = 'problem-detail-chat-msg problem-detail-chat-msg-system problem-detail-chat-local-itgap-sessions-card problem-detail-chat-msg-with-delete';
      block.dataset.msgIndex = String(idx);
      block.innerHTML = `
        <button type="button" class="btn-delete-chat-msg" aria-label="删除">${DELETE_CHAT_MSG_ICON}</button>
        <div class="problem-detail-chat-local-itgap-sessions-card-wrap">
          <div class="problem-detail-chat-local-itgap-sessions-card-header">局部 ITGap 分析 Session</div>
          <div class="problem-detail-chat-local-itgap-sessions-card-body">
            <div class="problem-detail-chat-local-itgap-sessions-header">已为 ${sessions.length} 个环节生成局部 ITGap 分析 session</div>
            <div class="problem-detail-chat-local-itgap-sessions-list">${sessionsListHtml}</div>
          </div>
          <div class="problem-detail-chat-local-itgap-sessions-actions">
            <button type="button" class="btn-confirm-local-itgap-sessions btn-confirm-primary" ${sessionsConfirmed || !hasUnfinished ? 'disabled' : ''}>${sessionsConfirmed ? '已确认' : !hasUnfinished ? '全部已完成' : '确认'}</button>
            <button type="button" class="btn-continue-local-itgap-sessions" ${!hasUnfinished ? 'disabled' : ''}>继续</button>
          </div>
        </div>
        <div class="problem-detail-chat-msg-time">${escapeHtml(msg.timestamp || '')}</div>`;
      container.appendChild(block);
    } else if (msg.type === 'localItGapAnalysisCard') {
      const data = msg.data || {};
      const stepName = msg.stepName || '';
      const stepIndex = msg.stepIndex ?? -1;
      const confirmed = !!msg.confirmed;
      const structuredHtml = buildLocalItGapStructuredHtml(data);
      const dataAttr = String(JSON.stringify(data)).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
      const llmMetaHtml = msg.llmMeta ? buildLlmMetaHtml(msg.llmMeta) : '';
      const cardBlock = document.createElement('div');
      cardBlock.className = 'problem-detail-chat-msg problem-detail-chat-msg-system problem-detail-chat-local-itgap-card problem-detail-chat-msg-with-delete';
      cardBlock.dataset.msgIndex = String(idx);
      cardBlock.dataset.stepName = stepName;
      cardBlock.dataset.stepIndex = String(stepIndex);
      cardBlock.innerHTML = `
        <button type="button" class="btn-delete-chat-msg" aria-label="删除">${DELETE_CHAT_MSG_ICON}</button>
        <div class="problem-detail-chat-local-itgap-card-wrap">
          <div class="problem-detail-chat-local-itgap-card-header">局部 ITGap 分析：${escapeHtml(stepName)}</div>
          <div class="problem-detail-chat-local-itgap-card-body">${structuredHtml}</div>
          <div class="problem-detail-chat-local-itgap-card-actions">
            <button type="button" class="btn-confirm-local-itgap btn-confirm-primary" data-json="${dataAttr}" data-step-name="${escapeHtml(stepName)}" data-step-index="${stepIndex}" ${confirmed ? 'disabled' : ''}>${confirmed ? '已确认' : '确认'}</button>
          </div>
        </div>
        <div class="problem-detail-chat-msg-time">${escapeHtml(msg.timestamp || '')}</div>${llmMetaHtml}`;
      container.appendChild(cardBlock);
    } else if (msg.type === 'localItGapAnalysisLog') {
      const taskLabel = msg.taskLabel || '局部 ITGap 分析';
      const llmMetaHtml = msg.llmMeta ? buildLlmMetaHtml(msg.llmMeta) : '';
      const block = document.createElement('div');
      block.className = 'problem-detail-chat-msg problem-detail-chat-msg-system problem-detail-chat-local-itgap-log problem-detail-chat-msg-with-delete';
      block.dataset.msgIndex = String(idx);
      block.innerHTML = `
        <button type="button" class="btn-delete-chat-msg" aria-label="删除">${DELETE_CHAT_MSG_ICON}</button>
        <div class="problem-detail-chat-msg-content-wrap">
          <div class="problem-detail-chat-e2e-flow-log-task">${escapeHtml(taskLabel)}</div>
          <div class="problem-detail-chat-msg-content">${escapeHtml(msg.content || '已生成局部 ITGap 分析')}</div>
        </div>
        <div class="problem-detail-chat-msg-time">${escapeHtml(msg.timestamp || '')}</div>${llmMetaHtml}`;
      container.appendChild(block);
    } else if (msg.type === 'intentExtractionCard') {
      const data = msg.data || {};
      const confirmed = !!msg.confirmed;
      const llmMetaHtml = msg.llmMeta ? buildLlmMetaHtml(msg.llmMeta) : '';
      const intentLabels = { query: '简单查询', modification: '反馈修改意见', execute: '执行操作', discussion: '讨论请教' };
      const intentLabel = intentLabels[data.intent] || data.intent || '—';
      const rows = [
        { label: '当前任务', value: `${data.taskName || '—'}（${data.stage || '—'}）` },
        { label: '意图类型', value: intentLabel },
        { label: '意图概括', value: data.summary || '—' },
      ];
      if (data.intent === 'query' && data.queryTarget) rows.push({ label: '查询内容', value: data.queryTarget });
      if (data.intent === 'discussion' && data.discussionTopic) rows.push({ label: '讨论话题', value: data.discussionTopic });
      if (data.intent === 'modification' && data.modificationTarget) {
        let modVal = data.modificationTarget;
        if (data.modificationField) modVal += ` → ${data.modificationField}`;
        rows.push({ label: '修改目标', value: modVal });
      }
      if (data.intent === 'execute' && data.executeTaskName) rows.push({ label: '执行任务', value: data.executeTaskName });
      const vsLvl = data.modificationValueStreamLevel || data.queryValueStreamLevel;
      const vsTgt = data.modificationValueStreamTarget || data.queryValueStreamTarget;
      if (vsLvl) {
        const vsLvlLabel = { step: '环节', stage: '阶段', card: '整图' }[vsLvl] || vsLvl;
        rows.push({ label: '价值流范围', value: vsTgt ? `${vsLvlLabel}：${vsTgt}` : vsLvlLabel });
      }
      const rowsHtml = rows.map((r) => `<div class="problem-detail-basic-info-row"><span class="problem-detail-basic-info-label">${escapeHtml(r.label)}</span><span class="problem-detail-basic-info-value">${escapeHtml(r.value)}</span></div>`).join('');
      const dataAttr = String(JSON.stringify(data)).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
      const userTextAttr = (msg.userText || '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
      const cardBlock = document.createElement('div');
      cardBlock.className = 'problem-detail-chat-msg problem-detail-chat-msg-system problem-detail-chat-intent-card';
      cardBlock.dataset.msgIndex = String(idx);
      const rejectBtnHtml = confirmed ? '' : `<button type="button" class="btn-reject-intent-extraction" data-user-text="${userTextAttr}">不对</button>`;
      cardBlock.innerHTML = `
        <div class="problem-detail-basic-info-card problem-detail-intent-card-inner">
          <div class="problem-detail-basic-info-card-body">${rowsHtml}</div>
          <div class="problem-detail-basic-info-card-actions">
            <button type="button" class="btn-confirm-intent-extraction" data-extracted="${dataAttr}" data-user-text="${userTextAttr}" ${confirmed ? 'disabled' : ''}>${confirmed ? '已确认' : '确认'}</button>
            ${rejectBtnHtml}
          </div>
        </div>
        <div class="problem-detail-chat-msg-time">${escapeHtml(msg.timestamp || '')}</div>${llmMetaHtml}`;
      container.appendChild(cardBlock);
    } else if (msg.type === 'basicInfoCard') {
      const cardBlock = document.createElement('div');
      cardBlock.className = 'problem-detail-chat-msg problem-detail-chat-msg-system problem-detail-chat-card-collapsible problem-detail-chat-msg-with-delete';
      cardBlock.dataset.msgIndex = String(idx);
      const labels = [
        { key: 'company_name', label: '公司名称' },
        { key: 'credit_code', label: '信用代码' },
        { key: 'legal_representative', label: '法人' },
        { key: 'established_date', label: '成立时间' },
        { key: 'registered_capital', label: '注册资本' },
        { key: 'is_listed', label: '是否上市' },
        { key: 'listing_location', label: '上市地' },
        { key: 'business_scope', label: '经营范围' },
        { key: 'core_qualifications', label: '核心资质' },
        { key: 'official_website', label: '官方网站' },
      ];
      const data = msg.data || {};
      const rows = labels.map(({ key, label }) => {
        const value = (data[key] != null ? String(data[key]).trim() : '') || '—';
        return `<div class="problem-detail-basic-info-row"><span class="problem-detail-basic-info-label">${escapeHtml(label)}</span><span class="problem-detail-basic-info-value">${escapeHtml(value)}</span></div>`;
      }).join('');
      const confirmed = !!msg.confirmed;
      cardBlock.innerHTML = `
        <button type="button" class="btn-delete-chat-msg" aria-label="删除">${DELETE_CHAT_MSG_ICON}</button>
        <div class="problem-detail-basic-info-card" role="button" tabindex="0">
          <div class="problem-detail-basic-info-card-body">${rows}</div>
          <div class="problem-detail-basic-info-card-actions">
            <button type="button" class="btn-confirm-basic-info" data-json="${String(JSON.stringify(data)).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;')}" ${confirmed ? 'disabled' : ''}>${confirmed ? '已确认' : '确认'}</button>
          </div>
        </div>
        <div class="problem-detail-chat-msg-time">${msg.timestamp || ''}</div>`;
      container.appendChild(cardBlock);
      setupProblemDetailChatCardToggle(cardBlock);
    } else {
      const block = document.createElement('div');
      const collapsibleClass = msg.role === 'user' ? ' problem-detail-chat-msg-collapsible' : '';
      let innerHtml = '';
      if (msg.hasCheck) {
        innerHtml = `<div class="problem-detail-chat-msg-content-wrap"><div class="problem-detail-chat-msg-content markdown-body">${renderMarkdown(msg.content)}</div><span class="problem-detail-chat-check" aria-hidden="true">✅</span></div>`;
      } else {
        innerHtml = `<div class="problem-detail-chat-msg-content-wrap"><div class="problem-detail-chat-msg-content markdown-body">${renderMarkdown(msg.content)}</div></div>`;
      }
      const llmMetaHtml = msg.llmMeta ? buildLlmMetaHtml(msg.llmMeta) : '';
      block.className = `problem-detail-chat-msg problem-detail-chat-msg-${msg.role}${collapsibleClass} problem-detail-chat-msg-with-delete`;
      block.dataset.msgIndex = String(idx);
      block.innerHTML = `<button type="button" class="btn-delete-chat-msg" aria-label="删除">${DELETE_CHAT_MSG_ICON}</button>${innerHtml}<div class="problem-detail-chat-msg-time">${escapeHtml(msg.timestamp || '')}</div>${llmMetaHtml}`;
      container.appendChild(block);
      if (msg.role === 'user') setupProblemDetailChatTextToggle(block);
    }
  });
}

function appendProblemDetailChatMessage(container, role, content, options) {
  const timeStr = options?.timestamp ?? getTimeStr();
  const block = document.createElement('div');
  const collapsibleClass = role === 'user' ? ' problem-detail-chat-msg-collapsible' : '';
  block.className = `problem-detail-chat-msg problem-detail-chat-msg-${role}${collapsibleClass}`;
  block.innerHTML = `<div class="problem-detail-chat-msg-content-wrap" role="button" tabindex="0"><div class="problem-detail-chat-msg-content markdown-body">${renderMarkdown(content)}</div></div><div class="problem-detail-chat-msg-time">${timeStr}</div>`;
  container.appendChild(block);
  if (role === 'user') {
    setupProblemDetailChatTextToggle(block);
  }
  container.scrollTop = container.scrollHeight;
  if (!options?.noSave) {
    problemDetailChatMessages.push({ role, content, timestamp: timeStr });
    saveProblemDetailChat(currentProblemDetailItem?.createdAt, problemDetailChatMessages);
  }
  return block;
}

function pushAndSaveProblemDetailChat(msg) {
  problemDetailChatMessages.push(msg);
  saveProblemDetailChat(currentProblemDetailItem?.createdAt, problemDetailChatMessages);
}

function setupProblemDetailChatTextToggle(msgBlock) {
  const wrap = msgBlock?.querySelector('.problem-detail-chat-msg-content-wrap');
  if (!wrap) return;
  wrap.addEventListener('click', () => {
    msgBlock.classList.toggle('problem-detail-chat-msg-expanded');
  });
  wrap.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      msgBlock.classList.toggle('problem-detail-chat-msg-expanded');
    }
  });
}

function setupProblemDetailChatCardToggle(cardBlock) {
  const card = cardBlock?.querySelector('.problem-detail-basic-info-card');
  if (!card) return;
  card.addEventListener('click', (e) => {
    if (e.target.closest('.btn-confirm-basic-info') || e.target.closest('.btn-confirm-requirement-logic')) return;
    cardBlock.classList.toggle('problem-detail-chat-card-expanded');
  });
  card.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      if (!e.target.closest('.btn-confirm-basic-info') && !e.target.closest('.btn-confirm-requirement-logic')) {
        cardBlock.classList.toggle('problem-detail-chat-card-expanded');
      }
    }
  });
}

function setupProblemDetailBmcCardToggle(cardBlock) {
  const card = cardBlock?.querySelector('.problem-detail-bmc-card');
  if (!card) return;
  card.addEventListener('click', (e) => {
    if (e.target.closest('.btn-confirm-bmc')) return;
    cardBlock.classList.toggle('problem-detail-chat-card-expanded');
  });
  card.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      if (!e.target.closest('.btn-confirm-bmc')) {
        cardBlock.classList.toggle('problem-detail-chat-card-expanded');
      }
    }
  });
}

function setupProblemDetailRequirementLogicCardToggle(cardBlock) {
  const card = cardBlock?.querySelector('.problem-detail-basic-info-card');
  if (!card) return;
  card.addEventListener('click', (e) => {
    if (e.target.closest('.btn-confirm-requirement-logic')) return;
    cardBlock.classList.toggle('problem-detail-chat-card-expanded');
  });
  card.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      if (!e.target.closest('.btn-confirm-requirement-logic')) {
        cardBlock.classList.toggle('problem-detail-chat-card-expanded');
      }
    }
  });
  const confirmBtn = cardBlock.querySelector('.btn-confirm-requirement-logic');
  if (confirmBtn) {
    confirmBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      confirmBtn.disabled = true;
      confirmBtn.textContent = '已确认';
      let idx = -1;
      for (let i = problemDetailChatMessages.length - 1; i >= 0; i--) {
        if (problemDetailChatMessages[i].type === 'requirementLogicBlock') {
          idx = i;
          break;
        }
      }
      if (idx >= 0) {
        problemDetailChatMessages[idx] = { ...problemDetailChatMessages[idx], confirmed: true };
        saveProblemDetailChat(currentProblemDetailItem?.createdAt, problemDetailChatMessages);
      }
      const item = currentProblemDetailItem;
      if (item?.createdAt) {
        updateDigitalProblemMajorStage(item.createdAt, 1);
        currentProblemDetailItem = { ...item, currentMajorStage: 1 };
        problemDetailViewingMajorStage = 1;
        updateProblemDetailProgressStages(1, problemDetailViewingMajorStage);
        renderProblemDetailContent();
        requestAnimationFrame(() => {
          maybeShowValueStreamStartBlock();
          maybeShowItStatusStartBlock();
          maybeShowPainPointStartBlock();
        });
      }
    });
  }
}

function setupProblemDetailValueStreamTabs(container) {
  const card = container?.querySelector('.problem-detail-value-stream-card');
  if (!card) return;
  const tabs = card.querySelectorAll('.problem-detail-value-stream-tab');
  const panels = card.querySelectorAll('.problem-detail-value-stream-panel');
  tabs.forEach((tab) => {
    tab.addEventListener('click', () => {
      const tabName = tab.getAttribute('data-tab');
      tabs.forEach((t) => t.classList.toggle('problem-detail-value-stream-tab-active', t.getAttribute('data-tab') === tabName));
      panels.forEach((p) => { p.hidden = p.getAttribute('data-panel') !== tabName; });
    });
  });
}

function setupProblemDetailJsonBlockToggle(jsonBlock) {
  const wrap = jsonBlock?.querySelector('.problem-detail-chat-json-wrap');
  if (!wrap) return;
  wrap.addEventListener('click', () => {
    jsonBlock.classList.toggle('problem-detail-chat-json-expanded');
  });
  wrap.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      jsonBlock.classList.toggle('problem-detail-chat-json-expanded');
    }
  });
}

const MODIFICATION_CLARIFICATION_TEXT = '请明确具体修改需求：您要修改的具体内容是什么？希望改成什么？';

async function handleProblemDetailChatSend() {
  const input = el.problemDetailChatInput;
  const container = el.problemDetailChatMessages;
  if (!input || !container) return;
  const text = (input.value || '').trim();
  if (!text) return;
  input.value = '';
  appendProblemDetailChatMessage(container, 'user', text);

  // 特殊处理：用户询问「当前处于什么阶段 / 现在做到哪一步」等全局阶段/进度问题时，
  // 直接基于当前问题的阶段状态给出回答，不再走意图提炼与任务归属流程。
  const stageQueryPattern =
    /当前.*阶段|现在.*阶段|目前.*阶段|目前处于.*阶段|现在处于.*阶段|项目.*进度|进度.*如何|做到哪一步|进行到哪/;
  if (stageQueryPattern.test(text)) {
    const item = currentProblemDetailItem;
    const majorStageIndex = item?.currentMajorStage ?? 0;
    const majorStageLabel = PROBLEM_DETAIL_MAJOR_STAGE_LABELS[majorStageIndex] ?? String(majorStageIndex);
    let msg = `当前任务阶段为：${majorStageLabel}（索引 ${majorStageIndex}）。`;
    if (majorStageIndex === 3 && Array.isArray(IT_STRATEGY_TASKS) && IT_STRATEGY_TASKS.length > 0) {
      const subIdx = typeof itStrategyPlanViewingSubstep === 'number' ? itStrategyPlanViewingSubstep : 0;
      const itStrategyTask = IT_STRATEGY_TASKS[subIdx] || IT_STRATEGY_TASKS[0];
      if (itStrategyTask?.name) {
        msg += ` 当前 IT 策略规划任务为：${itStrategyTask.name}（${itStrategyTask.id}）。`;
      }
    }
    const replyBlock = document.createElement('div');
    replyBlock.className = 'problem-detail-chat-msg problem-detail-chat-msg-system';
    replyBlock.innerHTML = `<div class="problem-detail-chat-msg-content-wrap"><div class="problem-detail-chat-msg-content">${escapeHtml(
      msg
    )}</div></div><div class="problem-detail-chat-msg-time">${getTimeStr()}</div>`;
    container.appendChild(replyBlock);
    container.scrollTop = container.scrollHeight;
    pushAndSaveProblemDetailChat({ role: 'system', content: msg, timestamp: getTimeStr() });
    return;
  }

  const parsingBlock = document.createElement('div');
  parsingBlock.className = 'problem-detail-chat-msg problem-detail-chat-msg-system problem-detail-chat-msg-parsing';
  parsingBlock.innerHTML = `<div class="problem-detail-chat-msg-content-wrap"><div class="problem-detail-chat-parsing-inner"><span class="problem-detail-chat-spinner"></span><span class="problem-detail-chat-msg-content">正在提炼意图</span></div></div><div class="problem-detail-chat-msg-time">${getTimeStr()}</div>`;
  container.appendChild(parsingBlock);
  container.scrollTop = container.scrollHeight;
  try {
    if (!DEEPSEEK_API_KEY) {
      throw new Error('请在 main.js 中配置 DEEPSEEK_API_KEY 才能使用解析功能。');
    }
    const item = currentProblemDetailItem;
    const createdAt = item?.createdAt;
    const { context: contextStr, currentTask } = buildIntentExtractionContext(createdAt, item);
    let textForExtraction = text;
    if (lastModificationClarification && lastModificationClarification.createdAt === createdAt) {
      const userIdx = lastModificationClarification.userMessageIndex;
      const originalMsg = problemDetailChatMessages[userIdx];
      const originalText = (originalMsg?.content || '').trim();
      if (originalText) {
        const followUps = [];
        for (let i = userIdx + 1; i < problemDetailChatMessages.length; i++) {
          const m = problemDetailChatMessages[i];
          if (m.role === 'user' && (m.content || '').trim()) followUps.push((m.content || '').trim());
        }
        textForExtraction = followUps.length > 0 ? `${originalText}\n补充：${followUps.join('\n补充：')}` : originalText;
      }
      lastModificationClarification = null;
    }
    const result = await extractUserIntentFromChat(textForExtraction, contextStr, { currentTaskHint: currentTask });
    const { _llmMeta, ...extracted } = result;
    parsingBlock.remove();
    const isModificationUnclear = extracted.intent === 'modification' && extracted.modificationClear !== true;
    if (isModificationUnclear) {
      const clarificationBlock = document.createElement('div');
      clarificationBlock.className = 'problem-detail-chat-msg problem-detail-chat-msg-system';
      clarificationBlock.innerHTML = `<div class="problem-detail-chat-msg-content-wrap"><div class="problem-detail-chat-msg-content">${escapeHtml(MODIFICATION_CLARIFICATION_TEXT)}</div></div><div class="problem-detail-chat-msg-time">${getTimeStr()}</div>`;
      container.appendChild(clarificationBlock);
      pushAndSaveProblemDetailChat({ role: 'system', type: 'modificationClarificationRequest', content: MODIFICATION_CLARIFICATION_TEXT, timestamp: getTimeStr() });
      lastModificationClarification = { createdAt, userMessageIndex: problemDetailChatMessages.length - 2 };
    } else {
      const cardBlock = document.createElement('div');
      cardBlock.className = 'problem-detail-chat-msg problem-detail-chat-msg-system problem-detail-chat-intent-card';
      const intentLabels = { query: '简单查询', modification: '反馈修改意见', execute: '执行操作', discussion: '讨论请教' };
      const intentLabel = intentLabels[extracted.intent] || extracted.intent || '—';
      const rows = [
        { label: '当前任务', value: `${extracted.taskName || '—'}（${extracted.stage || '—'}）` },
        { label: '意图类型', value: intentLabel },
        { label: '意图概括', value: extracted.summary || '—' },
      ];
      if (extracted.intent === 'query' && extracted.queryTarget) rows.push({ label: '查询内容', value: extracted.queryTarget });
      if (extracted.intent === 'discussion' && extracted.discussionTopic) rows.push({ label: '讨论话题', value: extracted.discussionTopic });
      if (extracted.intent === 'modification' && extracted.modificationTarget) {
        let modVal = extracted.modificationTarget;
        if (extracted.modificationField) modVal += ` → ${extracted.modificationField}`;
        if (extracted.modificationNewValue) modVal += ` → 改为：${extracted.modificationNewValue}`;
        rows.push({ label: '修改目标', value: modVal });
      }
      if (extracted.intent === 'execute' && extracted.executeTaskName) rows.push({ label: '执行任务', value: extracted.executeTaskName });
      const vsLvl = extracted.modificationValueStreamLevel || extracted.queryValueStreamLevel;
      const vsTgt = extracted.modificationValueStreamTarget || extracted.queryValueStreamTarget;
      if (vsLvl) {
        const vsLvlLabel = { step: '环节', stage: '阶段', card: '整图' }[vsLvl] || vsLvl;
        rows.push({ label: '价值流范围', value: vsTgt ? `${vsLvlLabel}：${vsTgt}` : vsLvlLabel });
      }
      const rowsHtml = rows.map((r) => `<div class="problem-detail-basic-info-row"><span class="problem-detail-basic-info-label">${escapeHtml(r.label)}</span><span class="problem-detail-basic-info-value">${escapeHtml(r.value)}</span></div>`).join('');
      const dataAttr = String(JSON.stringify(extracted)).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
      const userTextAttr = (textForExtraction || '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
      const llmMetaHtml = _llmMeta ? buildLlmMetaHtml(_llmMeta) : '';
      const newMsgIndex = problemDetailChatMessages.length;
      cardBlock.dataset.msgIndex = String(newMsgIndex);
      cardBlock.innerHTML = `
        <div class="problem-detail-basic-info-card problem-detail-intent-card-inner">
          <div class="problem-detail-basic-info-card-body">${rowsHtml}</div>
          <div class="problem-detail-basic-info-card-actions">
            <button type="button" class="btn-confirm-intent-extraction" data-extracted="${dataAttr}" data-user-text="${userTextAttr}">确认</button>
            <button type="button" class="btn-reject-intent-extraction" data-user-text="${userTextAttr}">不对</button>
          </div>
        </div>
        <div class="problem-detail-chat-msg-time">${getTimeStr()}</div>${llmMetaHtml}`;
      container.appendChild(cardBlock);
      pushAndSaveProblemDetailChat({ role: 'system', type: 'intentExtractionCard', data: extracted, userText: textForExtraction, timestamp: getTimeStr(), confirmed: false, llmMeta: _llmMeta });
      focusWorkspaceOnIntent(extracted);
    }
    container.scrollTop = container.scrollHeight;
  } catch (err) {
    parsingBlock.classList.remove('problem-detail-chat-msg-parsing');
    parsingBlock.querySelector('.problem-detail-chat-msg-content-wrap').innerHTML = `<div class="problem-detail-chat-msg-content">意图提炼失败：${escapeHtml(err.message || String(err))}</div>`;
    pushAndSaveProblemDetailChat({ role: 'system', content: '意图提炼失败：' + (err.message || String(err)), timestamp: getTimeStr() });
  }
}

const PROBLEM_DETAIL_MAJOR_STAGE_LABELS = ['需求理解', '工作流对齐', 'ITGap分析', 'IT策略规划'];

/** 根据意图提炼结果，将工作区定位到对应页面并高亮修改目标 */
function focusWorkspaceOnIntent(extracted) {
  const container = el.problemDetailContent;
  if (!container) return;
  const item = currentProblemDetailItem;
  if (!item) return;
  // 对于全局/宏观查询（当前任务为「整个任务」），不需要跳转或高亮具体工作区
  if (extracted.intent === 'query' && (extracted.taskName === '整个任务' || extracted.taskId === 'all')) return;
  const taskId = extracted.taskId || extracted.executeTaskId;
  if (!taskId) return;
  let cardTaskId = taskId;
  if (['task5', 'task6'].includes(taskId)) cardTaskId = 'task4';
  else if (taskId === 'task7') cardTaskId = 'e2e-flow';
  else if (taskId === 'task8') cardTaskId = 'global-itgap';
  else if (taskId === 'task9') cardTaskId = 'local-itgap';
  else if (['task10', 'task11', 'task12'].includes(taskId)) cardTaskId = taskId;
  const currentMajorStage = item.currentMajorStage ?? 0;
  let targetMajorStage = 0;
  if (['task1', 'task2', 'task3'].includes(taskId)) targetMajorStage = 0;
  else if (['task4', 'task5', 'task6'].includes(taskId)) targetMajorStage = 1;
  else if (['task7', 'task8', 'task9'].includes(taskId)) targetMajorStage = 2;
  else if (['task10', 'task11', 'task12'].includes(taskId)) targetMajorStage = 3;
  else targetMajorStage = 1;
  if (['task10', 'task11', 'task12'].includes(taskId)) {
    const substepMap = { task10: 0, task11: 1, task12: 2 };
    itStrategyPlanViewingSubstep = substepMap[taskId];
  }
  if (problemDetailViewingMajorStage !== targetMajorStage) {
    problemDetailViewingMajorStage = Math.min(targetMajorStage, currentMajorStage);
    updateProblemDetailProgressStages(currentMajorStage, problemDetailViewingMajorStage);
    renderProblemDetailContent();
  }
  requestAnimationFrame(() => {
    const targetCard = container.querySelector(`[data-task-id="${cardTaskId}"]`);
    let scrollTarget = targetCard;
    container.querySelectorAll('.modify-target-highlight').forEach((el) => el.classList.remove('modify-target-highlight'));
    const isModification = extracted.intent === 'modification';
    const isQuery = extracted.intent === 'query';
    const modTarget = String(extracted.modificationTarget || '').toLowerCase();
    const queryTarget = String(extracted.queryTarget || '').toLowerCase();
    const modField = String(extracted.modificationField || '').trim();
    const vsLevel = String(extracted.modificationValueStreamLevel || extracted.queryValueStreamLevel || '').toLowerCase();
    const vsTarget = String(extracted.modificationValueStreamTarget || extracted.queryValueStreamTarget || '').trim();
    const isValueStreamRelated = (modTarget + queryTarget).includes('价值流') || (modTarget + queryTarget).includes('it现状') || (modTarget + queryTarget).includes('痛点') || ['task4', 'task5', 'task6'].includes(taskId);
    const isLocalItGapRelated = taskId === 'task9' || (modTarget + queryTarget).includes('局部') || (modTarget + queryTarget).includes('itgap');
    let highlightEl = null;
    if (isModification || (isQuery && (isValueStreamRelated || isLocalItGapRelated))) {
      if (isLocalItGapRelated && (vsTarget || queryTarget || modTarget)) {
        const targetName = (vsTarget || queryTarget || modTarget).trim();
        if (targetName) {
          const subcards = container.querySelectorAll('.problem-detail-local-itgap-subcard');
          for (const subcard of subcards) {
            const titleEl = subcard.querySelector('.problem-detail-local-itgap-subcard-title');
            const name = (titleEl?.textContent || '').trim();
            if (name && (name === targetName || name.includes(targetName) || targetName.includes(name))) {
              highlightEl = subcard;
              const header = subcard.querySelector('.problem-detail-local-itgap-subcard-header');
              const body = subcard.querySelector('.problem-detail-local-itgap-subcard-body');
              if (header && body && body.hidden) {
                header.click();
              }
              break;
            }
          }
        }
        if (!highlightEl) {
          highlightEl = container.querySelector('[data-task-id="local-itgap"]');
        }
      }
      if (!highlightEl) {
        const fieldAliases = { '客户名称': ['公司名称', '客户名称'], '公司名称': ['公司名称'], '企业名称': ['企业名称'] };
        const possibleFields = modField ? (fieldAliases[modField] || [modField]) : [];
        for (const fieldName of possibleFields) {
          const el = container.querySelector(`[data-field="${fieldName}"]`);
          if (el) {
            highlightEl = el;
            break;
          }
        }
      }
      if (!highlightEl && modField) {
        highlightEl = container.querySelector(`[data-field="${modField}"]`);
      }
      if (!highlightEl && isValueStreamRelated && !isLocalItGapRelated && vsLevel !== 'card') {
        const targetName = vsTarget || modField;
        if ((vsLevel === 'step' || (!vsLevel && targetName)) && targetName) {
          const stepNodes = container.querySelectorAll('[data-vs-step-name]');
          for (const node of stepNodes) {
            const name = (node.getAttribute('data-vs-step-name') || '').trim();
            if (name && (name === targetName || name.includes(targetName) || targetName.includes(name))) {
              highlightEl = node;
              break;
            }
          }
        }
        if (!highlightEl && (vsLevel === 'stage' || (vsLevel !== 'card' && targetName))) {
          const stageNodes = container.querySelectorAll('.vs-stage-node[data-vs-stage-name]');
          for (const node of stageNodes) {
            const name = (node.getAttribute('data-vs-stage-name') || '').trim();
            if (name && (name === targetName || name.includes(targetName) || targetName.includes(name))) {
              highlightEl = node;
              break;
            }
          }
        }
        if (!highlightEl && isValueStreamRelated) {
          highlightEl = container.querySelector('[data-task-id="task4"]');
        }
      }
      if (!highlightEl) {
        if (modTarget.includes('企业基本信息') || modTarget.includes('基本信息') || modTarget.includes('客户基本信息')) {
          highlightEl = container.querySelector('[data-task-id="task1"]');
        } else if (modTarget.includes('bmc') || modTarget.includes('商业画布') || modTarget.includes('商业模式')) {
          highlightEl = container.querySelector('[data-task-id="task2"]');
        } else if (modTarget.includes('需求逻辑')) {
          highlightEl = container.querySelector('[data-task-id="task3"]');
        } else if (isValueStreamRelated) {
          highlightEl = container.querySelector('[data-task-id="task4"]');
        } else {
          highlightEl = targetCard;
        }
      }
      if (highlightEl) {
        highlightEl.classList.add('modify-target-highlight');
        scrollTarget = highlightEl;
      }
    }
    if (scrollTarget) scrollTarget.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  });
}

function updateProblemDetailProgressStages(currentMajorStage, viewingMajorStage) {
  const viewing = viewingMajorStage ?? currentMajorStage;
  const progress = document.querySelector('.problem-detail-progress');
  if (!progress) return;
  const stages = progress.querySelectorAll('.problem-detail-stage');
  stages.forEach((el) => {
    const stage = parseInt(el.getAttribute('data-stage'), 10);
    if (isNaN(stage)) return;
    const label = PROBLEM_DETAIL_MAJOR_STAGE_LABELS[stage] ?? el.textContent.replace(/\s*✅\s*$/, '').trim();
    el.classList.remove('problem-detail-stage-active', 'problem-detail-stage-done', 'problem-detail-stage-flashing', 'problem-detail-stage-clickable');
    el.textContent = label;
    const isReached = stage <= currentMajorStage;
    if (stage < currentMajorStage) {
      el.classList.add('problem-detail-stage-done');
      el.innerHTML = escapeHtml(label) + ' <span class="problem-detail-stage-icon">✅</span>';
    }
    if (stage === viewing) {
      el.classList.add('problem-detail-stage-active');
      if (stage === 1 || stage === 2) el.classList.add('problem-detail-stage-flashing');
    }
    if (isReached) el.classList.add('problem-detail-stage-clickable');
  });
}

function renderProblemDetailContent() {
  const container = el.problemDetailContent;
  if (!container) return;
  const item = currentProblemDetailItem;
  if (!item) {
    container.innerHTML = '<p class="problem-follow-empty">暂无详情</p>';
    return;
  }
  const currentMajorStage = item.currentMajorStage ?? 0;
  if (problemDetailViewingMajorStage === 3) {
    const itStrategyTasks = ['全局架构设计', '环节专项设计', '链条串联与闭环'];
    const itStrategyTaskIds = ['task10', 'task11', 'task12'];
    const itStrategyTaskBarHtml = itStrategyTasks.map((name, i) => {
      const current = i === itStrategyPlanViewingSubstep;
      const cls = 'problem-detail-substep' + (current ? ' problem-detail-substep-current' : '');
      return `<button type="button" class="${cls}" data-it-strategy-substep="${i}" data-task-id="${itStrategyTaskIds[i]}">${escapeHtml(name)}</button>`;
    }).join('<span class="problem-detail-substep-sep" aria-hidden="true">→</span>');
    const contentPlaceholders = [
      { title: '全局架构设计', desc: '基于全局 ITGap 分析，设计整体 IT 架构与系统边界，明确各模块职责与集成关系。' },
      { title: '环节专项设计', desc: '针对各业务环节的局部 ITGap，进行专项方案设计，输出可落地的功能与接口需求。' },
      { title: '链条串联与闭环', desc: '串联端到端流程各环节方案，形成闭环实施路径与优先级，输出 IT 策略规划结论。' },
    ];
    const currentPlaceholder = contentPlaceholders[itStrategyPlanViewingSubstep];
    container.innerHTML = `
      <div class="problem-detail-substeps">${itStrategyTaskBarHtml}</div>
      <div class="problem-detail-workspace-scroll">
        <div class="problem-detail-it-strategy-content">
          <div class="problem-detail-workflow-align-placeholder">
            <h3 class="problem-detail-workflow-align-title">${escapeHtml(currentPlaceholder.title)}</h3>
            <p class="problem-detail-workflow-align-desc">${escapeHtml(currentPlaceholder.desc)}</p>
            <p class="problem-detail-workflow-align-desc problem-detail-workflow-align-note">此任务内容展示区，后续可接入大模型生成与编辑。</p>
          </div>
        </div>
      </div>`;
    setupItStrategyPlanTaskButtons(container);
    return;
  }
  if (problemDetailViewingMajorStage >= 2) {
    const itGapSubsteps = ['端到端流程绘制', '全局 ITGap 分析', '局部 ITGap 分析'];
    const valueStream = resolveValueStreamForItGap(item);
    let itGapCompleted = item.itGapCompletedStages || [];
    // 若已有价值流（端到端流程已绘制），自动将端到端流程绘制任务标为完成并持久化（任务过程日志由用户确认流程写入）
    if (valueStream && !valueStream.raw && !itGapCompleted.includes(0)) {
      itGapCompleted = [...itGapCompleted, 0].sort((a, b) => a - b);
      updateDigitalProblemItGapCompletedStages(item.createdAt, itGapCompleted);
      currentProblemDetailItem = { ...item, itGapCompletedStages: itGapCompleted };
    }
    const itGapCurrent = [0, 1, 2].find((i) => !itGapCompleted.includes(i)) ?? 3;
    const itGapSubstepsHtml = itGapSubsteps.map((name, i) => {
      const done = itGapCompleted.includes(i);
      const current = i === itGapCurrent;
      let cls = 'problem-detail-substep';
      if (done) cls += ' problem-detail-substep-done';
      else if (current) cls += ' problem-detail-substep-current';
      const icon = done ? ' <span class="problem-detail-substep-check">✅</span>' : '';
      return `<span class="${cls}">${escapeHtml(name)}${icon}</span>`;
    }).join('<span class="problem-detail-substep-sep">→</span>');
    let workspaceContent = '';
    if (valueStream && !valueStream.raw) {
      const e2eHtml = renderEndToEndFlowHTML(valueStream);
      const jsonStr = escapeHtml(JSON.stringify(valueStream, null, 2));
      let globalItGapCardHtml = '';
      const analysis = item.globalItGapAnalysisJson;
      if (analysis) {
        const structuredHtml = buildGlobalItGapStructuredHtml(analysis);
        const jsonStr = escapeHtml(JSON.stringify(analysis, null, 2));
        globalItGapCardHtml = `
      <div class="problem-detail-card problem-detail-card-global-itgap" data-task-id="global-itgap">
        <div class="problem-detail-card-header" role="button" tabindex="0" aria-expanded="true">
          <span class="problem-detail-card-header-title">全局ITGap 分析</span>
          <div class="problem-detail-card-header-actions">
            <button type="button" class="problem-detail-card-tab problem-detail-card-tab-active" data-tab="detail" aria-pressed="true">全局ITGap 分析</button>
            <button type="button" class="problem-detail-card-tab" data-tab="json" aria-pressed="false">JSON</button>
          </div>
          <span class="problem-detail-card-header-arrow">▾</span>
        </div>
        <div class="problem-detail-card-body">
          <div class="problem-detail-card-body-detail problem-detail-global-itgap-detail">${structuredHtml}</div>
          <div class="problem-detail-card-body-json" hidden><pre class="problem-detail-card-json-pre">${jsonStr}</pre></div>
        </div>
      </div>`;
      }
      workspaceContent = `
      <div class="problem-detail-card problem-detail-card-e2e-flow" data-task-id="e2e-flow">
        <div class="problem-detail-card-header" role="button" tabindex="0" aria-expanded="true">
          <span class="problem-detail-card-header-title">端到端全流程</span>
          <div class="problem-detail-card-header-actions">
            <button type="button" class="problem-detail-card-tab problem-detail-card-tab-active" data-tab="detail" aria-pressed="true">端到端流程</button>
            <button type="button" class="problem-detail-card-tab" data-tab="json" aria-pressed="false">JSON</button>
          </div>
          <span class="problem-detail-card-header-arrow">▾</span>
        </div>
        <div class="problem-detail-card-body">
          <div class="problem-detail-card-body-detail problem-detail-it-gap-e2e-wrap">${e2eHtml}</div>
          <div class="problem-detail-card-body-json" hidden><pre class="problem-detail-card-json-pre">${jsonStr}</pre></div>
        </div>
      </div>${globalItGapCardHtml}`;
      const localAnalyses = item.localItGapAnalyses || [];
      const { stages: vsStages } = parseValueStreamGraph(valueStream);
      const vsAllSteps = vsStages.flatMap((s) => s.steps);
      const localSessions = item.localItGapSessions || [];
      const needsLocalItGapSession = itGapCurrent === 2 && vsAllSteps.length > 0 && localSessions.length < vsAllSteps.length && localAnalyses.length < vsAllSteps.length;
      const hasLocalItGapBlock = (getProblemDetailChats()[item.createdAt] || []).some((m) => m.type === 'localItGapStartBlock' || m.type === 'localItGapSessionsBlock');
      const showLocalItGapTriggerBtn = needsLocalItGapSession && !hasLocalItGapBlock;
      if (localSessions.length > 0 || localAnalyses.length > 0) {
        const sessionsToShow = localSessions.length > 0 ? localSessions : localAnalyses.map((a) => ({ stepName: a.stepName, stepIndex: a.stepIndex, prompt: '', analysisJson: a.analysisJson }));
        const localSubCardsHtml = sessionsToShow.map((s) => {
          const stepName = s.stepName || `环节${s.stepIndex + 1}`;
          const hasAnalysis = !!s.analysisJson;
          const analysisHtml = hasAnalysis ? buildLocalItGapStructuredHtml(s.analysisJson) : '<p class="problem-detail-local-itgap-pending">待分析</p>';
          const bodyHtml = `<div class="problem-detail-local-itgap-detail">${analysisHtml}</div>`;
          return `
        <div class="problem-detail-local-itgap-subcard" data-step-index="${s.stepIndex}">
          <button type="button" class="problem-detail-local-itgap-subcard-header" role="button" tabindex="0" aria-expanded="false">
            <span class="problem-detail-local-itgap-subcard-title">${escapeHtml(stepName)}</span>
            <span class="problem-detail-local-itgap-subcard-status ${hasAnalysis ? 'session-done' : 'session-pending'}">${hasAnalysis ? '已分析✅' : '待分析'}</span>
            <span class="problem-detail-local-itgap-subcard-arrow">▸</span>
          </button>
          <div class="problem-detail-local-itgap-subcard-body" hidden>
            ${bodyHtml}
          </div>
        </div>`;
        }).join('');
        workspaceContent += `
      <div class="problem-detail-card problem-detail-card-local-itgap" data-task-id="local-itgap">
        <div class="problem-detail-card-header" role="button" tabindex="0" aria-expanded="true">
          <span class="problem-detail-card-header-title">局部ITGap 分析</span>
          <span class="problem-detail-card-header-arrow">▾</span>
        </div>
        <div class="problem-detail-card-body">
          <div class="problem-detail-card-body-detail problem-detail-local-itgap-wrap">
            ${localSubCardsHtml}
          </div>
        </div>
      </div>`;
      }
      if (showLocalItGapTriggerBtn) {
        workspaceContent += `
      <div class="problem-detail-card problem-detail-local-itgap-trigger" data-task-id="local-itgap-trigger">
        <div class="problem-detail-card-body">
          <p class="problem-detail-local-itgap-trigger-desc">即将生成每个环节的 ITGap 分析 session</p>
          <button type="button" class="btn-trigger-local-itgap-session btn-confirm-primary">生成局部 ITGap 分析 session</button>
        </div>
      </div>`;
      }
    } else {
      workspaceContent = `
        <div class="problem-detail-workflow-align-placeholder">
          <h3 class="problem-detail-workflow-align-title">ITGap 分析</h3>
          <p class="problem-detail-workflow-align-desc">请先完成工作流对齐阶段的价值流图绘制后再进行 ITGap 分析。</p>
        </div>`;
    }
    container.innerHTML = `
      <div class="problem-detail-substeps">${itGapSubstepsHtml}</div>
      <div class="problem-detail-workspace-scroll">
        ${workspaceContent}
      </div>`;
    if (valueStream && !valueStream.raw) {
      setupProblemDetailCardToggle();
      setupLocalItGapSubcardToggle();
    }
    requestAnimationFrame(() => {
      console.log('[局部ITGap] renderProblemDetailContent rAF: 调用 forceShowLocalItGapStartBlock');
      maybeShowE2eFlowExtractBlock();
      maybeShowGlobalItGapStartBlock();
      forceShowLocalItGapStartBlock();
      maybeShowItStrategyPlanStartBlock();
    });
    return;
  }
  if (problemDetailViewingMajorStage >= 1) {
    const workflowSubsteps = ['绘制价值流', 'IT现状标注', '痛点标注'];
    const wfCompleted = item.workflowAlignCompletedStages || [];
    const wfCurrent = [0, 1, 2].find((i) => !wfCompleted.includes(i)) ?? 3;
    const workflowSubstepsHtml = workflowSubsteps.map((name, i) => {
      const done = wfCompleted.includes(i);
      const current = i === wfCurrent;
      let cls = 'problem-detail-substep';
      if (done) cls += ' problem-detail-substep-done';
      else if (current) cls += ' problem-detail-substep-current';
      const icon = done ? ' <span class="problem-detail-substep-check">✅</span>' : '';
      return `<span class="${cls}">${escapeHtml(name)}${icon}</span>`;
    }).join('<span class="problem-detail-substep-sep">→</span>');
    const valueStream = item.valueStream;
    let workspaceContent = '';
    if (valueStream && !valueStream.raw) {
      const graphHtml = renderValueStreamViewHTML(valueStream);
      const jsonStr = escapeHtml(JSON.stringify(valueStream, null, 2));
      workspaceContent = `
      <div class="problem-detail-value-stream-card" data-task-id="task4">
        <div class="problem-detail-value-stream-card-header">
          <button type="button" class="problem-detail-value-stream-tab problem-detail-value-stream-tab-active" data-tab="view">价值流图</button>
          <button type="button" class="problem-detail-value-stream-tab" data-tab="json">价值流图json</button>
        </div>
        <div class="problem-detail-value-stream-card-body">
          <div class="problem-detail-value-stream-panel" data-panel="view">${graphHtml}</div>
          <div class="problem-detail-value-stream-panel" data-panel="json" hidden><pre class="problem-detail-card-json-pre">${jsonStr}</pre></div>
        </div>
      </div>`;
    } else {
      workspaceContent = `
        <div class="problem-detail-workflow-align-placeholder">
          <h3 class="problem-detail-workflow-align-title">工作流对齐</h3>
          <p class="problem-detail-workflow-align-desc">此阶段将基于需求逻辑，进行工作流与业务场景的对齐分析。请先在聊天区确认价值流图设计 JSON 后点击「开始绘制价值流图」的确认按钮。</p>
        </div>`;
    }
    container.innerHTML = `
      <div class="problem-detail-substeps">${workflowSubstepsHtml}</div>
      <div class="problem-detail-workspace-scroll">
        ${workspaceContent}
      </div>`;
    if (valueStream && !valueStream.raw) {
      setupProblemDetailValueStreamTabs(container);
    }
    return;
  }
  const labels = [
    { key: 'customerName', label: '客户名称' },
    { key: 'customerNeedsOrChallenges', label: '客户需求或挑战' },
    { key: 'customerItStatus', label: '客户IT现状' },
    { key: 'projectTimeRequirement', label: '项目时间要求' },
  ];
  const rows = labels.map(({ key, label }) => {
    const value = (item[key] != null ? String(item[key]).trim() : '') || '—';
    return `<div class="problem-detail-row" data-field="${escapeHtml(label)}"><span class="problem-detail-label">${escapeHtml(label)}</span><span class="problem-detail-value">${escapeHtml(value)}</span></div>`;
  }).join('');
  const subSteps = [
    '企业背景洞察',
    '商业画布加载',
    '需求逻辑构建',
  ];
  const completedStages = item.completedStages || [];
  const currentStage = [0, 1, 2].find((i) => !completedStages.includes(i)) ?? 3;
  const subStepsHtml = subSteps.map((name, i) => {
    const done = completedStages.includes(i);
    const current = i === currentStage;
    let cls = 'problem-detail-substep';
    if (done) cls += ' problem-detail-substep-done';
    else if (current) cls += ' problem-detail-substep-current';
    const icon = done ? ' <span class="problem-detail-substep-check">✅</span>' : '';
    return `<span class="${cls}">${escapeHtml(name)}${icon}</span>`;
  }).join('<span class="problem-detail-substep-sep">→</span>');
  const basicInfoLabels = [
    { key: 'company_name', label: '公司名称' },
    { key: 'credit_code', label: '信用代码' },
    { key: 'legal_representative', label: '法人' },
    { key: 'established_date', label: '成立时间' },
    { key: 'registered_capital', label: '注册资本' },
    { key: 'is_listed', label: '是否上市' },
    { key: 'listing_location', label: '上市地' },
    { key: 'business_scope', label: '经营范围' },
    { key: 'core_qualifications', label: '核心资质' },
    { key: 'official_website', label: '官方网站' },
  ];
  let basicInfoCardHtml = '';
  if (problemDetailConfirmedBasicInfo) {
    const basicInfoRows = basicInfoLabels.map(({ key, label }) => {
      const value = (problemDetailConfirmedBasicInfo[key] != null ? String(problemDetailConfirmedBasicInfo[key]).trim() : '') || '—';
      return `<div class="problem-detail-row" data-field="${escapeHtml(label)}"><span class="problem-detail-label">${escapeHtml(label)}</span><span class="problem-detail-value">${escapeHtml(value)}</span></div>`;
    }).join('');
    const basicInfoJsonStr = escapeHtml(JSON.stringify(problemDetailConfirmedBasicInfo, null, 2));
    basicInfoCardHtml = `
  <div class="problem-detail-card problem-detail-card-basic-info" data-task-id="task1">
    <div class="problem-detail-card-header" role="button" tabindex="0" aria-expanded="true">
      <span class="problem-detail-card-header-title">客户基本信息</span>
      <div class="problem-detail-card-header-actions">
        <button type="button" class="problem-detail-card-tab problem-detail-card-tab-active" data-tab="detail" aria-pressed="true">详情</button>
        <button type="button" class="problem-detail-card-tab" data-tab="json" aria-pressed="false">JSON</button>
      </div>
      <span class="problem-detail-card-header-arrow">▾</span>
    </div>
    <div class="problem-detail-card-body">
      <div class="problem-detail-card-body-detail">${basicInfoRows}</div>
      <div class="problem-detail-card-body-json" hidden><pre class="problem-detail-card-json-pre">${basicInfoJsonStr}</pre></div>
    </div>
  </div>`;
  }
  let bmcCardHtml = '';
  if (item.bmc) {
    const bmc = item.bmc;
    const bmcRows = BMC_FIELDS.map(({ key, label }) => {
      const value = (bmc[key] != null ? String(bmc[key]).trim() : '') || '—';
      return `<div class="problem-detail-row" data-field="${escapeHtml(label)}"><span class="problem-detail-label">${escapeHtml(label)}</span><span class="problem-detail-value">${escapeHtml(value)}</span></div>`;
    }).join('');
    const industryInsight = (bmc.industry_insight || '').trim();
    const painPoints = (bmc.pain_points || '').trim();
    const bmcJsonStr = escapeHtml(JSON.stringify(bmc, null, 2));
    const bmcDetailContent = `
      ${industryInsight ? `<div class="problem-detail-bmc-section" data-field="行业背景洞察"><span class="problem-detail-label">行业背景洞察</span><span class="problem-detail-value">${escapeHtml(industryInsight).replace(/\n/g, '<br>')}</span></div>` : ''}
      <div class="problem-detail-bmc-grid">${bmcRows}</div>
      ${painPoints ? `<div class="problem-detail-bmc-section" data-field="业务痛点预判"><span class="problem-detail-label">业务痛点预判</span><span class="problem-detail-value">${escapeHtml(painPoints).replace(/\n/g, '<br>')}</span></div>` : ''}`;
    bmcCardHtml = `
  <div class="problem-detail-card problem-detail-card-bmc" data-task-id="task2">
    <div class="problem-detail-card-header" role="button" tabindex="0" aria-expanded="true">
      <span class="problem-detail-card-header-title">商业模式画布 BMC</span>
      <div class="problem-detail-card-header-actions">
        <button type="button" class="problem-detail-card-tab problem-detail-card-tab-active" data-tab="detail" aria-pressed="true">详情</button>
        <button type="button" class="problem-detail-card-tab" data-tab="json" aria-pressed="false">JSON</button>
      </div>
      <span class="problem-detail-card-header-arrow">▾</span>
    </div>
    <div class="problem-detail-card-body">
      <div class="problem-detail-card-body-detail">${bmcDetailContent}</div>
      <div class="problem-detail-card-body-json" hidden><pre class="problem-detail-card-json-pre">${bmcJsonStr}</pre></div>
    </div>
  </div>`;
  }
  let requirementLogicCardHtml = '';
  if (item.requirementLogic) {
    const parsed = parseRequirementLogicFromMarkdown(item.requirementLogic);
    const hasAnyContent = REQUIREMENT_LOGIC_SECTIONS.some(({ key }) => (parsed[key] || '').trim());
    const logicRows = hasAnyContent
      ? REQUIREMENT_LOGIC_SECTIONS.map(({ key, label }) => {
          let val = (parsed[key] || '').trim() || '—';
          val = val.replace(/\*\*/g, '');
          return `<div class="problem-detail-row" data-field="${escapeHtml(label)}"><span class="problem-detail-label">${escapeHtml(label)}</span><span class="problem-detail-value">${escapeHtml(val).replace(/\n/g, '<br>')}</span></div>`;
        }).join('')
      : (() => {
          let raw = (item.requirementLogic || '').replace(/\*\*/g, '');
          raw = escapeHtml(raw).replace(/\n/g, '<br>');
          return `<div class="problem-detail-row" data-field="原始输出"><span class="problem-detail-label">原始输出</span><span class="problem-detail-value">${raw}</span></div>`;
        })();
    const logicJson = {};
    REQUIREMENT_LOGIC_SECTIONS.forEach(({ key, label }) => {
      logicJson[label] = (parsed[key] || '').trim() || '—';
    });
    const logicJsonStr = escapeHtml(JSON.stringify(logicJson, null, 2));
    requirementLogicCardHtml = `
  <div class="problem-detail-card problem-detail-card-requirement-logic" data-task-id="task3">
    <div class="problem-detail-card-header" role="button" tabindex="0" aria-expanded="true">
      <span class="problem-detail-card-header-title">需求逻辑</span>
      <div class="problem-detail-card-header-actions">
        <button type="button" class="problem-detail-card-tab problem-detail-card-tab-active" data-tab="detail" aria-pressed="true">详情</button>
        <button type="button" class="problem-detail-card-tab" data-tab="json" aria-pressed="false">JSON</button>
      </div>
      <span class="problem-detail-card-header-right">
        <span class="problem-detail-card-header-arrow">▾</span>
        <button type="button" class="btn-delete-requirement-logic" aria-label="删除需求逻辑">删除</button>
      </span>
    </div>
    <div class="problem-detail-card-body">
      <div class="problem-detail-card-body-detail">${logicRows}</div>
      <div class="problem-detail-card-body-json" hidden><pre class="problem-detail-card-json-pre">${logicJsonStr}</pre></div>
    </div>
  </div>`;
  }
  const cardsHtml = `<div class="problem-detail-card" data-task-id="preliminary">
    <div class="problem-detail-card-header" role="button" tabindex="0" aria-expanded="true">
      <span class="problem-detail-card-header-title">初步需求</span>
      <span class="problem-detail-card-header-arrow">▾</span>
    </div>
    <div class="problem-detail-card-body">${rows}</div>
  </div>${basicInfoCardHtml}${bmcCardHtml}${requirementLogicCardHtml}`;
  container.innerHTML = `<div class="problem-detail-substeps">${subStepsHtml}</div>
  <div class="problem-detail-workspace-scroll">
    <div class="problem-detail-workspace-cards">${cardsHtml}</div>
  </div>`;
  setupProblemDetailCardToggle();
}

/** IT 策略规划页：任务按钮栏点击切换当前任务并刷新工作区内容 */
function setupItStrategyPlanTaskButtons(container) {
  if (!container) return;
  container.querySelectorAll('button[data-it-strategy-substep]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const idx = parseInt(btn.getAttribute('data-it-strategy-substep'), 10);
      if (Number.isNaN(idx) || idx < 0 || idx > 2) return;
      itStrategyPlanViewingSubstep = idx;
      renderProblemDetailContent();
    });
  });
}

function setupProblemDetailCardToggle() {
  el.problemDetailContent?.querySelectorAll('.problem-detail-card').forEach((card) => {
    const header = card.querySelector('.problem-detail-card-header');
    const body = card.querySelector('.problem-detail-card-body');
    if (!header || !body) return;
    const toggle = () => {
      const collapsed = body.hidden;
      body.hidden = !collapsed;
      header.setAttribute('aria-expanded', String(!collapsed));
      header.classList.toggle('problem-detail-card-header-collapsed', !collapsed);
    };
    header.addEventListener('click', (e) => {
      if (e.target.closest('.problem-detail-card-tab') || e.target.closest('.btn-delete-requirement-logic')) return;
      toggle();
    });
    header.addEventListener('keydown', (e) => {
      if (e.target.closest('.problem-detail-card-tab') || e.target.closest('.btn-delete-requirement-logic')) return;
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        toggle();
      }
    });
    const tabs = card.querySelectorAll('.problem-detail-card-tab');
    const bodyDetail = body.querySelector('.problem-detail-card-body-detail');
    const bodyJson = body.querySelector('.problem-detail-card-body-json');
    if (tabs.length && bodyDetail && bodyJson) {
      tabs.forEach((tab) => {
        tab.addEventListener('click', (e) => {
          e.stopPropagation();
          const tabName = tab.dataset.tab;
          tabs.forEach((t) => {
            t.classList.toggle('problem-detail-card-tab-active', t.dataset.tab === tabName);
            t.setAttribute('aria-pressed', t.dataset.tab === tabName ? 'true' : 'false');
          });
          bodyDetail.hidden = tabName !== 'detail';
          bodyJson.hidden = tabName !== 'json';
        });
      });
    }
    const deleteBtn = card.querySelector('.btn-delete-requirement-logic');
    if (deleteBtn) {
      deleteBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        const item = currentProblemDetailItem;
        if (!item?.createdAt) return;
        deleteDigitalProblemRequirementLogic(item.createdAt);
        currentProblemDetailItem = { ...item, requirementLogic: undefined, completedStages: (item.completedStages || []).filter((x) => x !== 2).sort((a, b) => a - b) };
        const container = el.problemDetailChatMessages;
        problemDetailChatMessages = problemDetailChatMessages.filter(
          (m) => m.type !== 'requirementLogicStartBlock' && m.type !== 'requirementLogicBlock'
        );
        saveProblemDetailChat(item.createdAt, problemDetailChatMessages);
        if (container) {
          container.innerHTML = '';
          renderProblemDetailChatFromStorage(container, problemDetailChatMessages);
          requestAnimationFrame(() => {
            container.scrollTop = container.scrollHeight;
            maybeShowRequirementLogicStartBlock();
          });
        }
        renderProblemDetailContent();
      });
    }
  });
}

function setupLocalItGapSubcardToggle() {
  el.problemDetailContent?.querySelectorAll('.problem-detail-local-itgap-subcard').forEach((subcard) => {
    const header = subcard.querySelector('.problem-detail-local-itgap-subcard-header');
    const body = subcard.querySelector('.problem-detail-local-itgap-subcard-body');
    if (!header || !body) return;
    const toggle = () => {
      const expanded = !body.hidden;
      body.hidden = expanded;
      header.setAttribute('aria-expanded', String(!expanded));
      header.querySelector('.problem-detail-local-itgap-subcard-arrow').textContent = expanded ? '▸' : '▾';
    };
    header.addEventListener('click', toggle);
    header.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        toggle();
      }
    });
  });
}

function handleStartFollowClick() {
  if (!lastParsedResult) {
    alert('请先点击「解析」按钮完成解析');
    return;
  }
  if (el.digitalProblemInput) el.digitalProblemInput.value = '';
  const item = {
    customerName: lastParsedResult.customerName ?? '',
    customerNeedsOrChallenges: lastParsedResult.customerNeedsOrChallenges ?? '',
    customerItStatus: lastParsedResult.customerItStatus ?? '',
    projectTimeRequirement: lastParsedResult.projectTimeRequirement ?? '',
  };
  saveDigitalProblem(item);
  if (el.parsePreview) el.parsePreview.classList.add('parse-preview-exiting');
  renderProblemFollowList();
  const firstItem = el.problemFollowListContent?.querySelector('.problem-follow-card');
  if (firstItem) {
    firstItem.classList.add('problem-follow-card-enter');
    requestAnimationFrame(() => {
      requestAnimationFrame(() => firstItem.classList.add('problem-follow-card-enter-active'));
    });
  }
  const duration = 450;
  setTimeout(() => {
    if (el.parsePreview) {
      el.parsePreview.classList.remove('parse-preview-exiting');
      el.parsePreview.hidden = true;
    }
    lastParsedResult = null;
    if (firstItem) {
      firstItem.classList.remove('problem-follow-card-enter', 'problem-follow-card-enter-active');
    }
  }, duration);
}

function renderModificationOrPlain(container, assistantContent) {
  const parsed = parseModificationResponse(assistantContent);
  if (parsed && currentDetailRecord) {
    scrollToTargetAndHighlight(parsed);
    const lastTs = chatHistory[chatHistory.length - 1]?.timestamp;
    return appendModificationBlock(container, parsed, formatChatTime(lastTs), () => {
      clearModificationHighlight();
      const appliedParsed = currentModificationTask?.parsed || parsed;
      const beforeValue = getCurrentValueForPosition(currentDetailRecord, appliedParsed);
      if (applyModification(currentDetailRecord, appliedParsed)) {
        const afterValue = appliedParsed.newValue != null ? String(appliedParsed.newValue) : appliedParsed.modification;
        const modificationSummary = appliedParsed.modification && appliedParsed.modification !== afterValue
          ? appliedParsed.modification
          : (beforeValue || afterValue ? `将「${beforeValue || '空'}」修改为「${afterValue}」` : '内容已更新');
        const history = currentDetailRecord.modificationHistory || [];
        history.unshift({
          position: appliedParsed.position,
          beforeValue,
          modification: modificationSummary,
          afterValue,
          reason: appliedParsed.reason,
          timestamp: new Date().toISOString(),
        });
        currentDetailRecord.modificationHistory = history;
        el.detailResult.innerHTML = buildDetailHTML(currentDetailRecord);
        saveAnalysis(currentDetailRecord);
        setupDetailValueStreamEvents();
        if (appliedParsed.isValueStream) {
          const vsIdx = getValueStreamIndexFromParsed(appliedParsed);
          if (vsIdx != null) {
            requestAnimationFrame(() => {
              expandAndRefreshValueStreamCard(vsIdx);
              el.detailResult?.querySelector(`.vs-card[data-index="${vsIdx}"]`)?.scrollIntoView({ block: 'center', behavior: 'smooth' });
            });
          }
        }
      }
    }, (modBlock) => {
      clearModificationHighlight();
      cancelModification(container, modBlock);
    }, (oldBlock) => retryModification(container, oldBlock));
  }
  return appendChatBlock(container, 'assistant', assistantContent, formatChatTime(chatHistory[chatHistory.length - 1]?.timestamp));
}

function cancelModification(container, modBlock) {
  currentModificationTask = null;
  const userBlock = modBlock.previousElementSibling;
  if (userBlock && userBlock.classList.contains('chat-message-user')) {
    userBlock.remove();
  }
  modBlock.remove();
  chatHistory.pop();
  if (chatHistory.length > 0 && chatHistory[chatHistory.length - 1].role === 'user') {
    chatHistory.pop();
  }
  saveChatToRecord();
  container.scrollTop = container.scrollHeight;
}

async function retryModification(container, oldBlock) {
  chatHistory.pop();
  oldBlock.classList.remove('chat-message-modification');
  oldBlock.classList.add('chat-message-loading');
  oldBlock.innerHTML = '<div class="chat-message-content">正在重新分析...</div><div class="chat-message-time">' + getTimeStr() + '</div>';
  container.scrollTop = container.scrollHeight;
  let assistantContent = '';
  try {
    assistantContent = await fetchModificationFromLLM();
  } catch (err) {
    assistantContent = '网络或请求错误：' + (err.message || String(err));
  }
  const assistantMsg = { role: 'assistant', content: assistantContent, timestamp: new Date().toISOString() };
  chatHistory.push(assistantMsg);
  oldBlock.remove();
  renderModificationOrPlain(container, assistantContent);
  saveChatToRecord();
  container.scrollTop = container.scrollHeight;
}

async function sendChatMessage() {
  const input = el.chatInput;
  const messages = el.chatMessages;
  if (!input || !messages) return;
  const text = (input.value || '').trim();
  if (!text) return;

  input.value = '';
  const userMsg = { role: 'user', content: text, timestamp: new Date().toISOString() };
  chatHistory.push(userMsg);
  appendChatBlock(messages, 'user', text, formatChatTime(userMsg.timestamp));
  saveChatToRecord();

  const loadingBlock = document.createElement('div');
  loadingBlock.className = 'chat-message chat-message-assistant chat-message-loading';
  loadingBlock.innerHTML = '<div class="chat-message-content">正在分析页面结构并提炼修改建议...</div><div class="chat-message-time">' + getTimeStr() + '</div>';
  messages.appendChild(loadingBlock);
  messages.scrollTop = messages.scrollHeight;

  if (!DEEPSEEK_API_KEY) {
    loadingBlock.querySelector('.chat-message-content').textContent = '请在 main.js 中配置 DEEPSEEK_API_KEY 才能使用大模型对话。';
    loadingBlock.classList.remove('chat-message-loading');
    return;
  }

  let assistantContent = '';
  try {
    assistantContent = await fetchModificationFromLLM();
  } catch (err) {
    assistantContent = '网络或请求错误：' + (err.message || String(err));
  }

  const assistantMsg = { role: 'assistant', content: assistantContent, timestamp: new Date().toISOString() };
  chatHistory.push(assistantMsg);
  loadingBlock.remove();

  if (currentModificationTask) {
    const currentParsed = currentModificationTask.parsed;
    const newParsed = parseModificationResponse(assistantContent);

    if (currentParsed.isValueStream) {
      const merged = mergeValueStreamModification(currentParsed, newParsed);
      const oldBlock = currentModificationTask.block;
      oldBlock.remove();
      const timeStr = formatChatTime(assistantMsg.timestamp);
      appendModificationBlock(messages, merged, timeStr, () => {
        clearModificationHighlight();
        const appliedParsed = currentModificationTask?.parsed || merged;
        const beforeValue = getCurrentValueForPosition(currentDetailRecord, appliedParsed);
        if (applyModification(currentDetailRecord, appliedParsed)) {
          const afterValue = appliedParsed.newValue != null ? String(appliedParsed.newValue) : appliedParsed.modification;
          const modificationSummary = appliedParsed.modification && appliedParsed.modification !== afterValue
            ? appliedParsed.modification
            : (beforeValue || afterValue ? `将「${beforeValue || '空'}」修改为「${afterValue}」` : '内容已更新');
          const history = currentDetailRecord.modificationHistory || [];
          history.unshift({
            position: appliedParsed.position,
            beforeValue,
            modification: modificationSummary,
            afterValue,
            reason: appliedParsed.reason,
            timestamp: new Date().toISOString(),
          });
          currentDetailRecord.modificationHistory = history;
          el.detailResult.innerHTML = buildDetailHTML(currentDetailRecord);
          saveAnalysis(currentDetailRecord);
          setupDetailValueStreamEvents();
          const vsIdx = getValueStreamIndexFromParsed(appliedParsed);
          if (vsIdx != null) {
            requestAnimationFrame(() => {
              expandAndRefreshValueStreamCard(vsIdx);
              el.detailResult?.querySelector(`.vs-card[data-index="${vsIdx}"]`)?.scrollIntoView({ block: 'center', behavior: 'smooth' });
            });
          }
        }
      }, (modBlock) => {
        clearModificationHighlight();
        cancelModification(messages, modBlock);
      }, (retryBlock) => retryModification(messages, retryBlock));
      scrollToTargetAndHighlight(merged);
      messages.scrollTop = messages.scrollHeight;
      saveChatToRecord();
    } else if (newParsed && isSameModificationPosition(newParsed, currentParsed)) {
      currentModificationTask.parsed = newParsed;
      updateModificationBlockContent(currentModificationTask.block, newParsed);
      scrollToTargetAndHighlight(newParsed);
      saveChatToRecord();
    } else {
      chatHistory.pop();
      const currentPosition = currentParsed.position;
      const prompt = `请先确认或放弃当前修改（${currentPosition}）后再开启新的修改任务。`;
      chatHistory.push({ role: 'assistant', content: prompt, timestamp: assistantMsg.timestamp });
      appendChatBlock(messages, 'assistant', prompt, formatChatTime(assistantMsg.timestamp));
      saveChatToRecord();
    }
  } else {
    renderModificationOrPlain(messages, assistantContent);
    saveChatToRecord();
  }
  messages.scrollTop = messages.scrollHeight;
}
