/**
 * 商业画布加载（Task2）核心逻辑模块：
 * - BMC 生成提示词与解析
 * - 基于基本信息调用大模型生成商业模式画布
 * - Task2 LLM 查询时间线消息构建
 */
(function (global) {
  /**
   * @typedef {Object} Task2BmcLlmResult
   * @property {Object} parsed - 解析后的 BMC 对象（含 industry_insight、pain_points、九宫格字段等）。
   * @property {Object} usage - 大模型 token 使用统计（prompt_tokens/completion_tokens/total_tokens）。
   * @property {string} model - 模型名称。
   * @property {number} durationMs - 本次调用耗时（毫秒）。
   * @property {string} fullPrompt - 完整提示词（system + user）。
   * @property {string} rawOutput - 模型原始输出文本（用于兜底展示）。
   */

  /**
   * @typedef {Object} Task2LlmQueryMessageArgs
   * @property {string} [fullPrompt] - 提交给大模型的完整提示词。
   * @property {Object} [parsed] - BMC 结构化输出。
   * @property {string} [rawOutput] - 原始输出文本。
   * @property {string} [timestamp] - 时间戳。
   * @property {Object} [usage] - token 使用统计。
   * @property {string} [model] - 模型名称。
   * @property {number} [durationMs] - 调用耗时（毫秒）。
   */

  const BMC_FIELDS = global.BMC_FIELDS || [];

  /** 商业模式画布生成用系统提示词 */
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

  /** Markdown 中 BMC 表头到字段 key 的映射 */
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

  /**
   * 从 Markdown 文本中解析出 BMC 结构（兜底，当大模型未返回纯 JSON 时使用）。
   * 识别章节：## 1. 行业背景洞察、## 2. 商业模式画布、## 3. 业务痛点预判；表内通过 **标签**| 内容 映射到 BMC 字段。
   * @param {string} text - 大模型返回的 Markdown 文本。
   * @returns {Object} 含 industry_insight、pain_points、comprehensive_review 及 BMC_FIELDS 各 key 的对象。
   */
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

  /**
   * 基于客户基本信息调用大模型生成商业模式画布（BMC）。
   * 优先从返回内容中提取 JSON 并解析；失败时使用 parseBmcFromMarkdown 兜底。
   * @param {Object|string} basicInfoJson - 客户基本信息对象或 JSON 字符串。
   * @returns {Promise<Task2BmcLlmResult>} 解析后的 BMC、usage、model、durationMs、fullPrompt、rawOutput。
   * @throws {Error} 当 global.fetchDeepSeekChat 不可用时抛出。
   */
  async function generateBmcFromBasicInfo(basicInfoJson) {
    const fetchDeepSeekChat = global.fetchDeepSeekChat;
    if (typeof fetchDeepSeekChat !== 'function') throw new Error('fetchDeepSeekChat 不可用');
    const inputStr = typeof basicInfoJson === 'string' ? basicInfoJson : JSON.stringify(basicInfoJson, null, 2);
    const fullPrompt = `【system】\n${BMC_GENERATION_PROMPT}\n\n【user】\n${inputStr}`;
    const { content, usage, model, durationMs } = await fetchDeepSeekChat([
      { role: 'system', content: BMC_GENERATION_PROMPT },
      { role: 'user', content: inputStr },
    ]);
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    const rawOutput = jsonMatch ? jsonMatch[0] : content;
    let parsed;
    if (jsonMatch) {
      try { parsed = JSON.parse(jsonMatch[0]); } catch (_) { parsed = parseBmcFromMarkdown(content); }
    } else {
      parsed = parseBmcFromMarkdown(content);
    }
    return { parsed, usage, model, durationMs, fullPrompt, rawOutput };
  }

  /**
   * 构建 task2 LLM 查询消息（供时间线与聊天记录持久化）。
   * @param {Task2LlmQueryMessageArgs} args - 消息参数（fullPrompt、parsed、rawOutput、timestamp、usage、model、durationMs）。
   * @returns {Object} 可直接 pushAndSaveProblemDetailChat 的 task2LlmQueryBlock 消息对象。
   */
  function buildTask2LlmQueryMessage(args) {
    return {
      role: 'system',
      type: 'task2LlmQueryBlock',
      taskId: 'task2',
      noteName: '商业画布提炼',
      llmInputPrompt: args?.fullPrompt || '',
      llmOutputJson: args?.parsed != null ? args.parsed : {},
      llmOutputRaw: args?.rawOutput || '',
      timestamp: args?.timestamp || '',
      llmMeta: (args && args.usage) || args?.model || typeof args?.durationMs === 'number'
        ? { usage: args?.usage || {}, model: args?.model, durationMs: args?.durationMs || 0 }
        : undefined,
    };
  }

  global.generateBmcFromBasicInfo = generateBmcFromBasicInfo;
  global.buildTask2LlmQueryMessage = buildTask2LlmQueryMessage;
})(typeof window !== 'undefined' ? window : this);
