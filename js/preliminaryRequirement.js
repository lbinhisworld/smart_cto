/**
 * 初步需求提炼与展示模块：
 * - 首页「解析」多维度提炼（parseDigitalProblemInput）
 * - 解析预览与问题详情「初步需求」卡片展示
 * - 初步需求字段定义与标签映射（供意图修改等使用）
 */
(function (global) {
  /**
   * @typedef {Object} PreliminaryLlmResult
   * @property {Object} parsed - 解析后的初步需求对象（含 customerName、operationModel、urgencyAnalysis 等）。
   * @property {string} fullPrompt - 完整提示词（system + user）。
   * @property {string} rawOutput - 模型原始 JSON 文本。
   * @property {{ usage: Object, model: string, durationMs: number }} llmMeta - 大模型元数据。
   */

  /** 初步需求提炼用 system 提示词（多维度：业务逻辑、经营态势、轻重缓急） */
  const PRELIMINARY_SYSTEM_PROMPT = `你是一个专业的数字化需求分析助手。请对用户输入的企业需求进行多维度提炼。你需要识别业务逻辑、经营态势以及需求的轻重缓急。

请以 JSON 格式返回以下字段，不要包含任何其他文字，不要使用 Markdown 代码块包裹：

{
  "customerName": "客户名称",
  "customerNeedsOrChallenges": "核心需求或痛点",
  "customerItStatus": "IT现状/已有系统",
  "projectTimeRequirement": "项目整体时间要求",
  "operationModel": {
    "businessProcess": "核心业务流程梳理",
    "orgStructure": "人员组织模式"
  },
  "businessStatus": "经营状态（上升期/平台期/下滑期）及判定理由",
  "urgencyAnalysis": {
    "immediatePriorities": "最紧急/第一阶段必须实现的功能或目标",
    "deferredFeatures": "可放在第二期或后续迭代的功能/非核心需求",
    "urgencyLevel": "整体紧急程度（高/中/低）"
  }
}

约束条件：

分层提取：在 urgencyAnalysis 中，需明确区分"立刻要解决的问题"与"可以等的问题"。

逻辑推断：如果文中未明说"二期"，请根据需求的依赖关系判断。例如，若提到"先解决库存报错，再考虑自动补货"，则库存报错为 immediatePriorities。

缺失处理：无法提取的字段填 "—"。嵌套对象中缺失的键同样填 "—"。

输出格式：严格保持 JSON 纯文本。`;

  /**
   * 按路径取对象值。
   * @param {Object} obj - 源对象。
   * @param {string} path - 路径，如 'operationModel.businessProcess'。
   * @returns {*} 路径对应的值，不存在则为 undefined。
   */
  function getByPath(obj, path) {
    if (obj == null || typeof path !== 'string') return undefined;
    const parts = path.split('.');
    let v = obj;
    for (const p of parts) {
      v = v != null && typeof v === 'object' ? v[p] : undefined;
    }
    return v;
  }

  /** 解析预览（首页）展示字段配置：key 支持嵌套路径，label 为展示名 */
  const PARSE_PREVIEW_FIELDS = [
    { key: 'customerName', label: '客户名称' },
    { key: 'customerNeedsOrChallenges', label: '核心需求或痛点' },
    { key: 'customerItStatus', label: 'IT现状/已有系统' },
    { key: 'projectTimeRequirement', label: '项目整体时间要求' },
    { key: 'operationModel.businessProcess', label: '核心业务流程梳理' },
    { key: 'operationModel.orgStructure', label: '人员组织模式' },
    { key: 'businessStatus', label: '经营状态' },
    { key: 'urgencyAnalysis.immediatePriorities', label: '最紧急/第一阶段' },
    { key: 'urgencyAnalysis.deferredFeatures', label: '可二期或后续' },
    { key: 'urgencyAnalysis.urgencyLevel', label: '整体紧急程度' },
    { key: 'requirementDetail', label: '需求详情' },
  ];

  /** 问题详情「初步需求」卡片的行配置（与 PARSE_PREVIEW_FIELDS 一致，用于工作区卡片） */
  function getPreliminaryCardLabels() {
    return [
      { key: 'customerName', label: '客户名称' },
      { key: 'customerNeedsOrChallenges', label: '核心需求或痛点' },
      { key: 'customerItStatus', label: 'IT现状/已有系统' },
      { key: 'projectTimeRequirement', label: '项目整体时间要求' },
      { key: 'operationModel.businessProcess', label: '核心业务流程梳理' },
      { key: 'operationModel.orgStructure', label: '人员组织模式' },
      { key: 'businessStatus', label: '经营状态' },
      { key: 'urgencyAnalysis.immediatePriorities', label: '最紧急/第一阶段' },
      { key: 'urgencyAnalysis.deferredFeatures', label: '可二期或后续' },
      { key: 'urgencyAnalysis.urgencyLevel', label: '整体紧急程度' },
      { key: 'requirementDetail', label: '需求详情' },
    ];
  }

  /** 标签到初步需求字段 key 的映射（含嵌套路径），供意图修改定位使用 */
  const PRELIMINARY_LABEL_TO_KEY = {
    客户名称: 'customerName',
    客户需求或挑战: 'customerNeedsOrChallenges',
    核心需求或痛点: 'customerNeedsOrChallenges',
    客户IT现状: 'customerItStatus',
    'IT现状/已有系统': 'customerItStatus',
    项目时间要求: 'projectTimeRequirement',
    项目整体时间要求: 'projectTimeRequirement',
    核心业务流程梳理: 'operationModel.businessProcess',
    人员组织模式: 'operationModel.orgStructure',
    经营状态: 'businessStatus',
    最紧急第一阶段: 'urgencyAnalysis.immediatePriorities',
    '最紧急/第一阶段': 'urgencyAnalysis.immediatePriorities',
    可二期或后续: 'urgencyAnalysis.deferredFeatures',
    整体紧急程度: 'urgencyAnalysis.urgencyLevel',
    需求详情: 'requirementDetail',
  };

  /**
   * 调用大模型解析数字化问题输入，多维度提炼客户需求。
   * @param {string} text - 用户输入的原始需求描述。
   * @returns {Promise<PreliminaryLlmResult>} 解析结果：parsed、fullPrompt、rawOutput、llmMeta。
   * @throws {Error} 当 fetchDeepSeekChat 不可用或返回非合法 JSON 时抛出。
   */
  async function parseDigitalProblemInput(text) {
    const fetchDeepSeekChat = global.fetchDeepSeekChat;
    if (typeof fetchDeepSeekChat !== 'function') throw new Error('fetchDeepSeekChat 不可用');
    const { content, usage, model, durationMs } = await fetchDeepSeekChat([
      { role: 'system', content: PRELIMINARY_SYSTEM_PROMPT },
      { role: 'user', content: text },
    ]);
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    const jsonStr = jsonMatch ? jsonMatch[0] : content;
    const parsed = JSON.parse(jsonStr);
    const fullPrompt = `【system】\n${PRELIMINARY_SYSTEM_PROMPT}\n\n【user】\n${text}`;
    const defaultModel = global.DEEPSEEK_MODEL || 'deepseek-chat';
    return {
      parsed,
      fullPrompt,
      rawOutput: jsonStr,
      llmMeta: { usage: usage || {}, model: model || defaultModel, durationMs: durationMs || 0 },
    };
  }

  /**
   * 渲染解析预览区域 HTML 并显示面板。
   * @param {Object} parsed - 解析结果对象（含各字段及嵌套 operationModel、urgencyAnalysis）。
   * @param {HTMLElement} [contentEl] - 解析预览内容容器（如 parsePreviewContent），用于设置 innerHTML。
   * @param {HTMLElement} [previewEl] - 解析预览外层容器（如 parsePreview），用于设置 hidden。
   * @param {function(string): string} escapeHtml - 转义 HTML 的函数。
   */
  function renderParsePreview(parsed, contentEl, previewEl, escapeHtml) {
    if (!contentEl) return;
    const esc = escapeHtml || ((s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'));
    contentEl.innerHTML = PARSE_PREVIEW_FIELDS.map(({ key, label }) => {
      const raw = key.indexOf('.') >= 0 ? getByPath(parsed, key) : parsed[key];
      const value = raw != null && typeof raw === 'object' ? JSON.stringify(raw) : (raw != null ? String(raw).trim() : '—');
      const ddClass = key === 'requirementDetail' ? ' parse-preview-dd-requirement-detail' : '';
      return `<dt>${esc(label)}</dt><dd class="${ddClass}">${esc(value) || '—'}</dd>`;
    }).join('');
    if (previewEl) previewEl.hidden = false;
  }

  /**
   * 生成问题详情「初步需求」卡片的行 HTML。
   * @param {Object} item - 当前问题项（含 customerName、operationModel、urgencyAnalysis、requirementDetail 等）。
   * @param {function(string): string} escapeHtml - 转义 HTML 的函数。
   * @returns {string} 多行 .problem-detail-row 的 HTML 拼接。
   */
  /**
   * 总结提炼 Tab 展示的字段（不含需求详情，需求详情在历史详情 Tab 中按时间线展示）。
   */
  function getPreliminarySummaryCardLabels() {
    return getPreliminaryCardLabels().filter(({ key }) => key !== 'requirementDetail');
  }

  /** 将已转义文本中的 **...** 转为绿色加粗 HTML（供三卡片详情/总结 Tab 使用） */
  function renderMarkdownBold(escapedText) {
    if (typeof escapedText !== 'string') return '';
    return escapedText.replace(/\*\*(.+?)\*\*/g, '<strong class="problem-detail-value-bold">$1</strong>');
  }

  function buildPreliminaryCardRowsHtml(item, escapeHtml) {
    const esc = escapeHtml || ((s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'));
    const labels = getPreliminarySummaryCardLabels();
    return labels
      .map(({ key, label }) => {
        const raw = key.indexOf('.') >= 0 ? getByPath(item, key) : item[key];
        const value =
          (raw != null && typeof raw !== 'object' ? String(raw).trim() : raw != null && typeof raw === 'object' ? JSON.stringify(raw, null, 2) : '') || '—';
        const rowClass = key === 'requirementDetail' ? ' problem-detail-row-requirement-detail' : '';
        const valueHtml = renderMarkdownBold(esc(value)).replace(/\n/g, '<br>');
        return `<div class="problem-detail-row${rowClass}" data-field="${esc(label)}"><span class="problem-detail-label">${esc(label)}</span><span class="problem-detail-value">${valueHtml}</span></div>`;
      })
      .join('');
  }

  /**
   * 构建「总结提炼」专用 JSON，供时间线「客户初步需求 json」与 BMC 生成入参使用（不含需求详情）。
   * @param {Object} item - 当前问题项，可含 preliminaryReq 或顶层字段（含 customer_name 等蛇形键）。
   * @returns {Object} 仅含 customerName、customerNeedsOrChallenges、customerItStatus、projectTimeRequirement、operationModel、businessStatus、urgencyAnalysis。
   */
  function buildPreliminarySummaryJson(item) {
    if (!item) return {};
    const prelim = item.preliminaryReq || {};
    return {
      customerName: prelim.customerName ?? item.customerName ?? item.customer_name ?? '',
      customerNeedsOrChallenges: prelim.customerNeedsOrChallenges ?? item.customerNeedsOrChallenges ?? item.customer_needs_or_challenges ?? '',
      customerItStatus: prelim.customerItStatus ?? item.customerItStatus ?? item.customer_it_status ?? '',
      projectTimeRequirement: prelim.projectTimeRequirement ?? item.projectTimeRequirement ?? item.project_time_requirement ?? '',
      operationModel: prelim.operationModel ?? item.operationModel ?? undefined,
      businessStatus: prelim.businessStatus ?? item.businessStatus ?? item.business_status ?? '',
      urgencyAnalysis: prelim.urgencyAnalysis ?? item.urgencyAnalysis ?? item.urgency_analysis ?? undefined,
    };
  }

  /**
   * 构建「初步需求（整块）」的 preContent 对象，供意图修改等使用。
   * @param {Object} item - 当前问题项。
   * @returns {Object} 含 customerName、customerNeedsOrChallenges、operationModel、businessStatus、urgencyAnalysis、requirementDetail 等键的对象。
   */
  function buildPreliminaryPreContent(item) {
    return {
      customerName: item?.customerName,
      customerNeedsOrChallenges: item?.customerNeedsOrChallenges,
      customerItStatus: item?.customerItStatus,
      projectTimeRequirement: item?.projectTimeRequirement,
      operationModel: item?.operationModel,
      businessStatus: item?.businessStatus,
      urgencyAnalysis: item?.urgencyAnalysis,
      requirementDetail: item?.requirementDetail ?? item?.requirement_detail,
    };
  }

  /**
   * 格式化为本地日期时间字符串，用于历史详情时间线展示。
   * @param {string} timestamp - ISO 或可解析的时间字符串。
   * @returns {string} 格式化后的字符串。
   */
  function formatPreliminaryHistoryTime(timestamp) {
    if (!timestamp) return '—';
    try {
      const d = new Date(timestamp);
      if (Number.isNaN(d.getTime())) return String(timestamp);
      return d.toLocaleString('zh-CN', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false,
      });
    } catch {
      return String(timestamp);
    }
  }

  /**
   * 生成「历史详情」Tab 内容 HTML：按时间线展示历次提交的需求详情，每项为可折叠卡片，展开显示原始需求文本。
   * @param {Object} item - 当前问题项，可含 requirementDetailHistory（Array<{timestamp, content}>）；若无则用 requirementDetail + createdAt 生成一条。
   * @param {function(string): string} escapeHtml - 转义 HTML 的函数。
   * @returns {string} 历史时间线 HTML。
   */
  function buildPreliminaryHistoryHtml(item, escapeHtml) {
    const esc = escapeHtml || ((s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'));
    const history = Array.isArray(item?.requirementDetailHistory) && item.requirementDetailHistory.length > 0
      ? item.requirementDetailHistory
      : [{ timestamp: item?.createdAt || new Date().toISOString(), content: item?.requirementDetail ?? item?.requirement_detail ?? '' }];
    if (history.length === 0) return '<p class="preliminary-history-empty">暂无历史提交</p>';
    return history
      .map((entry, index) => {
        const ts = entry.timestamp || '';
        const content = (entry.content != null ? String(entry.content).trim() : '') || '—';
        const timeLabel = formatPreliminaryHistoryTime(ts);
        const bodyContent = renderMarkdownBold(esc(content)).replace(/\n/g, '<br>');
        const id = `prelim-history-${index}`;
        return `<div class="preliminary-history-item" data-index="${index}">
          <div class="preliminary-history-item-header" role="button" tabindex="0" aria-expanded="false" aria-controls="${id}" data-index="${index}">
            <span class="preliminary-history-item-time">${esc(timeLabel)}</span>
            <span class="preliminary-history-item-arrow" aria-hidden="true">▾</span>
          </div>
          <div class="preliminary-history-item-body" id="${id}" hidden>${bodyContent}</div>
        </div>`;
      })
      .join('');
  }

  global.getByPath = getByPath;
  global.PARSE_PREVIEW_FIELDS = PARSE_PREVIEW_FIELDS;
  global.getPreliminaryCardLabels = getPreliminaryCardLabels;
  global.PRELIMINARY_LABEL_TO_KEY = PRELIMINARY_LABEL_TO_KEY;
  global.parseDigitalProblemInput = parseDigitalProblemInput;
  global.renderParsePreview = renderParsePreview;
  global.buildPreliminaryCardRowsHtml = buildPreliminaryCardRowsHtml;
  global.buildPreliminaryHistoryHtml = buildPreliminaryHistoryHtml;
  global.buildPreliminarySummaryJson = buildPreliminarySummaryJson;
  global.buildPreliminaryPreContent = buildPreliminaryPreContent;
  global.renderMarkdownBold = renderMarkdownBold;
})(typeof window !== 'undefined' ? window : this);
