/**
 * 默认配置。若存在 config.local.js 会在其后加载并覆盖此处配置。
 * 本地 Key 请写在 config.local.js（已加入 .gitignore，不会提交）。
 */
window.APP_CONFIG = window.APP_CONFIG || {
  DEEPSEEK_API_KEY: '',
  DEEPSEEK_API_URL: 'https://api.deepseek.com/v1/chat/completions',
  DEEPSEEK_MODEL: 'deepseek-chat',
  /** 是否使用 Backend API 存储（替代 localStorage） */
  USE_BACKEND_STORAGE: true,
  /** Backend API 基础地址，如 http://localhost:3000/api */
  BACKEND_API_URL: 'http://localhost:3000/api',
};