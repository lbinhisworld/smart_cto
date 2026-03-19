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
请基于提供的【客户基础信息】及【初步需求】，运用商业模式画布（Business Model Canvas）框架，深度分析该企业的经营模式。

# Input Data (JSON/Text)
公司基本信息 json 数据

# Analysis Logic (推演要求)
在构建画布时，请不要简单重复经营范围，而是基于行业常识进行逻辑推演：

产业链定位：判断其处于上游原材料、中游加工制造、还是下游终端销售？
核心驱动力：该企业是靠"技术创新"驱动、"规模成本"驱动，还是"特许经营/资质"驱动？
客户关系特征：是B2B的长账期/强关系模式，还是B2C的快消/流量模式？
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

  /** 基于客户反馈对 BMC 进行细化生成（重新生成整份 BMC JSON）用系统提示词 */
  const BMC_REFINEMENT_PROMPT = `# Role
你是一位拥有15年经验的【首席商业架构师】与【数字化转型专家】。你擅长把客户的反馈意见落到商业模式画布（BMC）的各字段上，并输出可直接用于前端渲染的结构化内容。

# Task
请基于以下输入，生成一份【更新后的完整商业模式画布 BMC】：
1) 客户基础信息（basic_info）
2) 上一次生成的 BMC（previous_bmc）
3) 客户反馈（customer_feedback，可能包含修正意见或讨论补充）

# Rules
1. 必须输出完整 JSON，字段不可缺失（仍需包含 industry_insight 与 pain_points）。
2. 若 customer_feedback 未明确提到某些字段：请尽量保留 previous_bmc 中对应字段的原值（保持一致性）。
3. 若 customer_feedback 与 previous_bmc 冲突：以 customer_feedback 的含义为准更新相关字段，并保证整体商业逻辑自洽。
4. 输出只包含 JSON，不要包含任何多余解释或 Markdown 代码块。

# Output Format
输出 JSON 格式如下（字段名与 value 类型保持一致）：
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

  /** BMC 讨论模式用 system 提示词（深度对话伙伴，基于画布回答并挖掘需求） */
  const BMC_DISCUSSION_SYSTEM_PROMPT = `## Role / 角色定位
你是一位拥有 20 年经验的资深商业架构师（Business Architect）与软件需求分析专家。你擅长通过商业模式画布（BMC）解构复杂企业业务，并能从中精准识别出企业的"核心竞争力"、"运营痛点"以及"数字化转型（IT Gap）"的切入点。

## Context / 交互背景
用户（软件需求分析师）正在针对特定客户进行调研。系统已经基于初步调研生成了一份《商业模式画布（BMC）》。
你的任务： 作为一个深度对话伙伴，基于 BMC 的全局视角，回答分析师的提问，挖掘隐藏在业务逻辑背后的深层需求，构建更立体、更具逻辑支撑的业务上下文。

## Knowledge Base / 分析框架（核心逻辑）
在处理对话时，你必须始终保持以下维度的联动思考：

价值流转（Value Flow）： 价值主张如何通过渠道传递给客户细分？

盈利逻辑（Profit Logic）： 核心资源与关键业务如何转化成成本结构，并最终支撑收入来源？

一致性检查（Alignment）： 识别 BMC 中的矛盾点（例如：主打"高端定制"却缺乏"关键业务"中的质量控制体系）。

数字化转化（IT Gap）： 思考哪些业务环节可以通过软件系统（如 ERP, MES, CRM）进行优化、降本或提效。

## Constraints / 交互约束
禁止脱离上下文： 所有的回答必须紧密结合当前已有的 BMC 数据。如果用户提问涉及 BMC 之外的通用知识，必须将其关联回当前客户的行业背景。

禁止虚假承诺： 如果 BMC 中信息缺失（例如：未定义收入来源），应在回答中指出该信息的缺失，并引导分析师去调研补充。

主动演进： 如果用户在对话中提供了新的业务事实（如：发现客户其实主要靠售后赚钱），请在回答结束时提示用户："检测到业务模式更新，建议同步修改 BMC 的'收入来源'模块"。

## Response Format / 输出规范
为了保持分析的条理性和专业感，请按以下结构回复：

🧩 业务洞察
[针对用户提问的直接回答。比如客户问：什么是大语言模型，则直接回复大语言模型是什么。这个子部分不要求与 bmc 有深入关联。]

🔗 BMC 关联影响
[分析该问题对 BMC 其他 1-2 个模块的联动影响。例如：物流策略改变如何影响成本结构和客户关系。]

🔍 引导性追问
[向用户提出 1 个具有挑战性或启发性的问题，引导用户进行更深度的客户访谈。]`;

  /**
   * 讨论模式单轮：基于 base bmc data + 历史讨论数据 + 用户当前输入，调用大模型返回深度分析回复。
   * @param {Object} baseBmcData - 当前画布数据（用于渲染工作区的最新 BMC）。
   * @param {Array<{role: string, content: string}>} discussionHistory - 讨论模式开始后的历史交互（时间线）。
   * @param {string} userMessage - 用户当前输入。
   * @returns {Promise<{content: string, usage: object, model: string, durationMs: number, fullPrompt: string}>}
   */
  async function runBmcDiscussionTurn(baseBmcData, discussionHistory, userMessage) {
    const fetchDeepSeekChat = global.fetchDeepSeekChat;
    if (typeof fetchDeepSeekChat !== 'function') throw new Error('fetchDeepSeekChat 不可用');
    const part2 = '【当前画布数据 base bmc data】\n' + (typeof baseBmcData === 'string' ? baseBmcData : JSON.stringify(baseBmcData || {}, null, 2));
    const part3 = '【bmc 绘制任务的历史讨论数据（时间线中讨论模式后的所有交互）】\n' + (Array.isArray(discussionHistory) ? JSON.stringify(discussionHistory, null, 2) : '[]');
    const part4 = '【用户当前输入】\n' + String(userMessage || '');
    const userContent = part2 + '\n\n' + part3 + '\n\n' + part4;
    const fullPrompt = `【system】\n${BMC_DISCUSSION_SYSTEM_PROMPT}\n\n【user】\n${userContent}`;
    const { content, usage, model, durationMs } = await fetchDeepSeekChat([
      { role: 'system', content: BMC_DISCUSSION_SYSTEM_PROMPT },
      { role: 'user', content: userContent },
    ]);
    return { content: (content || '').trim(), usage, model, durationMs, fullPrompt };
  }

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
   * 基于客户基本信息及初步需求调用大模型生成商业模式画布（BMC）。
   * 优先从返回内容中提取 JSON 并解析；失败时使用 parseBmcFromMarkdown 兜底。
   * @param {Object|string} basicInfoJson - 客户基本信息对象或 JSON 字符串。
   * @param {Object} [preliminaryReqJson] - 客户初步需求汇总（customerName、customerNeedsOrChallenges、customerItStatus、projectTimeRequirement），可选。
   * @returns {Promise<Task2BmcLlmResult>} 解析后的 BMC、usage、model、durationMs、fullPrompt、rawOutput。
   * @throws {Error} 当 global.fetchDeepSeekChat 不可用时抛出。
   */
  async function generateBmcFromBasicInfo(basicInfoJson, preliminaryReqJson) {
    const fetchDeepSeekChat = global.fetchDeepSeekChat;
    if (typeof fetchDeepSeekChat !== 'function') throw new Error('fetchDeepSeekChat 不可用');
    const basicStr = typeof basicInfoJson === 'string' ? basicInfoJson : JSON.stringify(basicInfoJson || {}, null, 2);
    const prelimStr = preliminaryReqJson != null && Object.keys(preliminaryReqJson || {}).length > 0
      ? JSON.stringify(preliminaryReqJson, null, 2)
      : '';
    const inputStr = prelimStr
      ? `【客户基础信息】\n${basicStr}\n\n【初步需求】\n${prelimStr}`
      : basicStr;
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
   * 基于客户反馈对 BMC 进行细化重新生成（整份 BMC JSON）。
   * @param {Object|string} basicInfoJson - 客户基本信息对象或 JSON 字符串。
   * @param {Object} prevBmcJson - 上一次生成的 BMC（用于上下文）。
   * @param {string} userFeedback - 客户反馈内容（修正/讨论）。
   * @param {('modification'|'discussion')} feedbackType - 反馈类型，影响提示文案（可选）。
   * @returns {Promise<Task2BmcLlmResult>}
   */
  async function generateBmcFromBasicInfoWithFeedback(basicInfoJson, prevBmcJson, userFeedback, feedbackType) {
    const fetchDeepSeekChat = global.fetchDeepSeekChat;
    if (typeof fetchDeepSeekChat !== 'function') throw new Error('fetchDeepSeekChat 不可用');

    const basicStr = typeof basicInfoJson === 'string' ? basicInfoJson : JSON.stringify(basicInfoJson || {}, null, 2);
    const prevStr = prevBmcJson && typeof prevBmcJson === 'string' ? prevBmcJson : JSON.stringify(prevBmcJson || {}, null, 2);
    const feedbackStr = String(userFeedback || '');
    const feedbackLabel = feedbackType === 'modification' ? '修正意见' : '讨论补充';

    const userInput = `【basic_info】\n${basicStr}\n\n【previous_bmc】\n${prevStr}\n\n【customer_feedback - ${feedbackLabel}】\n${feedbackStr}`;
    const fullPrompt = `【system】\n${BMC_REFINEMENT_PROMPT}\n\n【user】\n${userInput}`;

    const { content, usage, model, durationMs } = await fetchDeepSeekChat([
      { role: 'system', content: BMC_REFINEMENT_PROMPT },
      { role: 'user', content: userInput },
    ]);

    const jsonMatch = content.match(/\{[\s\S]*\}/);
    const rawOutput = jsonMatch ? jsonMatch[0] : content;
    let parsed;
    if (jsonMatch) {
      try {
        parsed = JSON.parse(jsonMatch[0]);
      } catch (_) {
        parsed = parseBmcFromMarkdown(content);
      }
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
  global.generateBmcFromBasicInfoWithFeedback = generateBmcFromBasicInfoWithFeedback;
  global.buildTask2LlmQueryMessage = buildTask2LlmQueryMessage;
  global.runBmcDiscussionTurn = runBmcDiscussionTurn;
})(typeof window !== 'undefined' ? window : this);
