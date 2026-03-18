/**
 * 企业背景洞察（Task1）核心逻辑模块：
 * - 工商信息提炼大模型调用
 * - Task1 LLM 查询时间线消息构建
 */
(function (global) {
  /**
   * @typedef {Object} Task1BasicInfoLlmResult
   * @property {Object} parsed - 解析后的工商信息 JSON。
   * @property {Object} usage - 大模型 token 使用统计（prompt_tokens/completion_tokens/total_tokens）。
   * @property {string} model - 模型名称。
   * @property {number} durationMs - 本次调用耗时（毫秒）。
   * @property {string} fullPrompt - 完整提示词（system + user）。
   * @property {string} rawOutput - 原始 JSON 输出文本。
   */

  /**
   * @typedef {Object} Task1LlmQueryMessageArgs
   * @property {string} [noteName] - 备注名称（例如：工商信息提炼、初步需求提炼）。
   * @property {string} fullPrompt - 提交给大模型的完整提示词。
   * @property {Object|string} parsed - 大模型解析结果。
   * @property {string} [rawOutput] - 原始输出文本（兜底展示）。
   * @property {string} timestamp - 时间戳。
   * @property {Object} [usage] - token 使用统计。
   * @property {string} [model] - 模型名称。
   * @property {number} [durationMs] - 调用耗时（毫秒）。
   */

  /**
   * 解析用户输入的客户基本信息，提取结构化字段。
   * @param {string} text - 用户输入文本。
   * @returns {Promise<Task1BasicInfoLlmResult>} 大模型调用结果与解析结果。
   * @throws {Error} 当 `fetchDeepSeekChat` 未加载或返回内容无法解析为 JSON 时抛出。
   */
  async function parseCompanyBasicInfoInput(text) {
    const fetchDeepSeekChat = global.fetchDeepSeekChat;
    if (typeof fetchDeepSeekChat !== 'function') throw new Error('fetchDeepSeekChat 不可用');
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
    const parsed = JSON.parse(jsonStr);
    const fullPrompt = `【system】\n${systemPrompt}\n\n【user】\n${text}`;
    return { parsed, usage, model, durationMs, fullPrompt, rawOutput: jsonStr };
  }

  /**
   * 构建 task1 LLM 查询消息（供时间线与聊天记录持久化）。
   * @param {Task1LlmQueryMessageArgs} args - 消息参数。
   * @returns {Object} 可直接 `pushAndSaveProblemDetailChat` 的 `task1LlmQueryBlock` 消息对象。
   */
  function buildTask1LlmQueryMessage(args) {
    const noteName = args?.noteName || '工商信息提炼';
    return {
      role: 'system',
      type: 'task1LlmQueryBlock',
      taskId: 'task1',
      noteName,
      llmInputPrompt: args?.fullPrompt || '',
      llmOutputJson: args?.parsed != null ? args.parsed : {},
      llmOutputRaw: args?.rawOutput || '',
      timestamp: args?.timestamp || '',
      llmMeta: (args && args.usage) || args?.model || typeof args?.durationMs === 'number'
        ? { usage: args?.usage || {}, model: args?.model, durationMs: args?.durationMs || 0 }
        : undefined,
    };
  }

  global.parseCompanyBasicInfoInput = parseCompanyBasicInfoInput;
  global.buildTask1LlmQueryMessage = buildTask1LlmQueryMessage;
})(typeof window !== 'undefined' ? window : this);
