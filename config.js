/**
 * 默认配置。若存在 config.local.js 会在其后加载并覆盖此处配置。
 * 本地 Key 请写在 config.local.js（已加入 .gitignore，不会提交）。
 */
window.APP_CONFIG = window.APP_CONFIG || {
  /** 直连 DeepSeek 时使用；若配置了 BACKEND_API_URL 则优先走 Backend 代理，Key 从数据库读取 */
  DEEPSEEK_API_KEY: '',
  DEEPSEEK_API_URL: 'https://api.deepseek.com/v1/chat/completions',
  DEEPSEEK_MODEL: 'deepseek-chat',
  /** 是否使用 Backend API 存储（替代 localStorage） */
  USE_BACKEND_STORAGE: true,
  /** Backend API 基础地址，如 http://localhost:3000/api；配置后 AI 对话走 POST /api/ai/chat，Key 从数据库读取 */
  // 注意：这里需要填 API 基础地址（以 /api 结尾），不是 /health
  BACKEND_API_URL: 'http://192.168.83.106/api',
};