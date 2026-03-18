/**
 * 配置示例。复制本文件为 config.local.js 并填入你的 DeepSeek API Key。
 * config.local.js 已加入 .gitignore，不会提交到 Git。
 */
window.APP_CONFIG = {
  /**
   * 运行模式：
   * - local：AI 直连 DeepSeek（需要 DEEPSEEK_API_KEY），数据存 localStorage
   * - online：AI + 数据都走后端（BACKEND_API_URL）
   */
  MODE: 'local', // 'local' | 'online'

  /** AI：直连 DeepSeek（填写 Key 即可） */
  DEEPSEEK_API_KEY: '',
  DEEPSEEK_API_URL: 'https://api.deepseek.com/v1/chat/completions',
  DEEPSEEK_MODEL: 'deepseek-chat',

  /** 后端 API 基础地址（以 /api 结尾）。MODE=online 时需要 */
  BACKEND_API_URL: 'http://localhost:3000/api',
};
