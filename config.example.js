/**
 * 配置示例。复制本文件为 config.local.js 并填入你的 DeepSeek API Key。
 * config.local.js 已加入 .gitignore，不会提交到 Git。
 */
window.APP_CONFIG = {
  DEEPSEEK_API_KEY: '',
  DEEPSEEK_API_URL: 'https://api.deepseek.com/v1/chat/completions',
  DEEPSEEK_MODEL: 'deepseek-chat',
  USE_BACKEND_STORAGE: false,
  BACKEND_API_URL: 'http://localhost:3000/api',
};
