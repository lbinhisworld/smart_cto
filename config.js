/**
 * 默认配置。若存在 config.local.js 会在其后加载并覆盖此处配置。
 * 本地 Key 请写在 config.local.js（已加入 .gitignore，不会提交）。
 */
window.APP_CONFIG = window.APP_CONFIG || {
  DEEPSEEK_API_KEY: '',
  DEEPSEEK_API_URL: 'https://api.deepseek.com/v1/chat/completions',
  DEEPSEEK_MODEL: 'deepseek-chat',
};
