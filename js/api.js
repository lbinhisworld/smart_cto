/**
 * DeepSeek 大模型 API 调用
 * 若配置了 BACKEND_API_URL，则走 Backend 代理（Key 从数据库读取）；否则直连 DeepSeek。
 */
(function (global) {
  const cfg = global.APP_CONFIG || {};
  const DEEPSEEK_API_URL = cfg.DEEPSEEK_API_URL || 'https://api.deepseek.com/v1/chat/completions';
  const DEEPSEEK_API_KEY = cfg.DEEPSEEK_API_KEY || '';
  const DEEPSEEK_MODEL = cfg.DEEPSEEK_MODEL || 'deepseek-chat';
  const BACKEND_API_URL = (cfg.BACKEND_API_URL || '').replace(/\/$/, '');

  async function fetchDeepSeekChat(messages) {
    if (BACKEND_API_URL) {
      const res = await fetch(BACKEND_API_URL + '/ai/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.message || 'AI 请求失败');
      return {
        content: (data.content || '').trim(),
        usage: data.usage || {},
        model: data.model || DEEPSEEK_MODEL,
        durationMs: data.durationMs || 0,
      };
    }
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

  /** 是否有 AI 配置：Backend 代理 或 直连 Key */
  function hasAiConfig() {
    return Boolean(BACKEND_API_URL || DEEPSEEK_API_KEY);
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
  global.hasAiConfig = hasAiConfig;
})(typeof window !== 'undefined' ? window : this);
