/**
 * DeepSeek 大模型 API 调用
 */
(function (global) {
  const DEEPSEEK_API_URL = (global.APP_CONFIG && global.APP_CONFIG.DEEPSEEK_API_URL) || 'https://api.deepseek.com/v1/chat/completions';
  const DEEPSEEK_API_KEY = (global.APP_CONFIG && global.APP_CONFIG.DEEPSEEK_API_KEY) || '';
  const DEEPSEEK_MODEL = (global.APP_CONFIG && global.APP_CONFIG.DEEPSEEK_MODEL) || 'deepseek-chat';

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

  function buildLlmMetaHtml(meta) {
    if (!meta) return '';
    const totalTokens = meta.usage?.total_tokens ?? ((meta.usage?.prompt_tokens || 0) + (meta.usage?.completion_tokens || 0));
    return `<div class="problem-detail-chat-msg-llm-meta">模型: ${escapeHtml(meta.model || DEEPSEEK_MODEL)} | 消耗 token: ${totalTokens} | 耗时: ${meta.durationMs || 0}ms</div>`;
  }

  global.DEEPSEEK_API_URL = DEEPSEEK_API_URL;
  global.DEEPSEEK_API_KEY = DEEPSEEK_API_KEY;
  global.DEEPSEEK_MODEL = DEEPSEEK_MODEL;
  global.fetchDeepSeekChat = fetchDeepSeekChat;
  global.buildLlmMetaHtml = buildLlmMetaHtml;
})(typeof window !== 'undefined' ? window : this);
