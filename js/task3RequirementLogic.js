/**
 * 需求逻辑构建（Task3）核心逻辑模块：
 * - 需求逻辑生成提示词与 Markdown/JSON 解析
 * - 基于客户初步需求、基本信息、BMC 调用大模型生成需求逻辑
 * - Task3 LLM 查询时间线消息构建（task3LlmQueryBlock）
 */
(function (global) {
  /**
   * @typedef {Object} Task3RequirementLogicLlmResult
   * @property {string} content - 模型返回的正文（已 trim）。
   * @property {Object} usage - 大模型 token 使用统计（prompt_tokens/completion_tokens/total_tokens）。
   * @property {string} model - 模型名称。
   * @property {number} durationMs - 本次调用耗时（毫秒）。
   * @property {string} fullPrompt - 完整提示词（system + user）。
   * @property {string} rawOutput - 模型原始输出文本（用于时间线输出子卡片与兜底展示）。
   */

  /**
   * @typedef {Object} Task3LlmQueryMessageArgs
   * @property {string} [fullPrompt] - 提交给大模型的完整提示词。
   * @property {Object} [parsed] - 解析后的需求逻辑结构化对象（各 section key 对应文本）。
   * @property {string} [rawOutput] - 原始输出文本。
   * @property {string} [timestamp] - 时间戳。
   * @property {Object} [usage] - token 使用统计。
   * @property {string} [model] - 模型名称。
   * @property {number} [durationMs] - 调用耗时（毫秒）。
   * @property {boolean} [confirmed] - 是否已确认，默认 false。
   */

  /** 需求逻辑分析用系统提示词（Role / Input / Task / Analysis Framework / Output Format） */
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

  /**
   * 需求逻辑 Markdown 的四个章节定义（key、label），用于解析与 UI 展示。
   * @type {{ key: string, label: string }[]}
   */
  const REQUIREMENT_LOGIC_SECTIONS = [
    { key: 'industry_competition', label: '行业底层逻辑与竞争共性' },
    { key: 'causal_relation', label: '初步需求与商业模式的"因果关联"' },
    { key: 'deep_motivation', label: '需求背后的深层动机' },
    { key: 'logic_summary', label: '逻辑链条总结' },
  ];

  /**
   * 从大模型返回的 Markdown 或 JSON 文本中解析出需求逻辑结构。
   * 优先尝试提取 JSON 块并解析；失败则按 ## 1. 行业底层逻辑… 等标题切分章节。
   * @param {string} text - 大模型返回的 Markdown 或含 JSON 的文本。
   * @returns {Object} 键为 REQUIREMENT_LOGIC_SECTIONS 中各 key，值为对应段落文本；无则为空字符串。
   */
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

  /**
   * 基于客户初步需求、企业基本信息、BMC 三个维度调用大模型，生成需求逻辑链条分析。
   * @param {Object|string} preliminaryReqJson - 客户初步需求（customerName、customerNeedsOrChallenges 等）或 JSON 字符串。
   * @param {Object|string} basicInfoJson - 企业基本信息对象或 JSON 字符串。
   * @param {Object|string} bmcJson - 商业模式画布 BMC 对象或 JSON 字符串。
   * @returns {Promise<Task3RequirementLogicLlmResult>} content、usage、model、durationMs、fullPrompt、rawOutput。
   * @throws {Error} 当 global.fetchDeepSeekChat 不可用时抛出。
   */
  async function generateRequirementLogicFromInputs(preliminaryReqJson, basicInfoJson, bmcJson) {
    const fetchDeepSeekChat = global.fetchDeepSeekChat;
    if (typeof fetchDeepSeekChat !== 'function') throw new Error('fetchDeepSeekChat 不可用');
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
    const fullPrompt = `【system】\n${REQUIREMENT_LOGIC_PROMPT}\n\n【user】\n${userContent}`;
    const { content, usage, model, durationMs } = await fetchDeepSeekChat([
      { role: 'system', content: REQUIREMENT_LOGIC_PROMPT },
      { role: 'user', content: userContent },
    ]);
    const rawOutput = (content || '').trim();
    return { content: rawOutput, usage, model, durationMs, fullPrompt, rawOutput };
  }

  /**
   * 构建 task3 LLM 查询消息（供沟通历史过程日志展示「需求逻辑提炼」LLM-查询 块）。
   * @param {Task3LlmQueryMessageArgs} args - 消息参数（fullPrompt、parsed、rawOutput、timestamp、usage、model、durationMs、confirmed）。
   * @returns {Object} 可直接 pushAndSaveProblemDetailChat 的 task3LlmQueryBlock 消息对象。
   */
  function buildTask3LlmQueryMessage(args) {
    return {
      role: 'system',
      type: 'task3LlmQueryBlock',
      taskId: 'task3',
      noteName: '需求逻辑提炼',
      llmInputPrompt: args?.fullPrompt || '',
      llmOutputJson: args?.parsed != null ? args.parsed : null,
      llmOutputRaw: args?.rawOutput || '',
      timestamp: args?.timestamp || '',
      confirmed: args?.confirmed === true,
      llmMeta: (args && (args.usage || args.model != null || typeof args?.durationMs === 'number'))
        ? { usage: args?.usage || {}, model: args?.model, durationMs: args?.durationMs ?? 0 }
        : undefined,
    };
  }

  global.REQUIREMENT_LOGIC_PROMPT = REQUIREMENT_LOGIC_PROMPT;
  global.REQUIREMENT_LOGIC_SECTIONS = REQUIREMENT_LOGIC_SECTIONS;
  global.parseRequirementLogicFromMarkdown = parseRequirementLogicFromMarkdown;
  global.generateRequirementLogicFromInputs = generateRequirementLogicFromInputs;
  global.buildTask3LlmQueryMessage = buildTask3LlmQueryMessage;
})(typeof window !== 'undefined' ? window : this);
