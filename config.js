/**
 * 默认配置。若存在 config.local.js 会在其后加载并覆盖此处配置。
 * 本地 Key 请写在 config.local.js（已加入 .gitignore，不会提交）。
 */
window.APP_CONFIG = window.APP_CONFIG || {
  /**
   * 运行模式：
   * - local：AI 直连 DeepSeek（需要 DEEPSEEK_API_KEY），数据存 localStorage
   * - online：AI + 数据都走后端（BACKEND_API_URL）
   */
  MODE: 'local', // 'local' | 'online'

  /** AI：直连 DeepSeek（本地填写 Key 即可） */
  DEEPSEEK_API_KEY: '',
  DEEPSEEK_API_URL: 'https://api.deepseek.com/v1/chat/completions',
  DEEPSEEK_MODEL: 'deepseek-chat',

  /** 后端 API 基础地址（以 /api 结尾）。MODE=online 时需要 */
  BACKEND_API_URL: 'http://192.168.83.106/api',
};