/**
 * 工具函数：格式化、转义、Markdown 渲染
 */
(function (global) {
  /**
   * 将任意值格式化为可展示文本。
   * @param {*} value - 原始值。
   * @returns {string} 格式化后的字符串。
   */
  function formatValue(value) {
    if (value == null || value === '') return '';
    if (typeof value === 'boolean') return value ? '是' : '否';
    return String(value);
  }

  /**
   * 对字符串进行 HTML 转义，防止注入。
   * @param {string} str - 待转义文本。
   * @returns {string} 安全的 HTML 字符串。
   */
  function escapeHtml(str) {
    if (str == null || str === '') return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  /**
   * 渲染 Markdown 为 HTML，并在可用时做 XSS 清洗。
   * @param {string} str - Markdown 内容。
   * @returns {string} 渲染后的 HTML。
   */
  function renderMarkdown(str) {
    if (str == null || str === '') return '';
    const text = String(str);
    if (typeof marked === 'undefined') return escapeHtml(text).replace(/\n/g, '<br>');
    const html = marked.parse(text, { breaks: true });
    if (typeof DOMPurify !== 'undefined') {
      return DOMPurify.sanitize(html, {
        ALLOWED_TAGS: ['p', 'br', 'strong', 'b', 'em', 'i', 'code', 'pre', 'a', 'ul', 'ol', 'li', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'blockquote', 'hr', 'span', 'div'],
        ALLOWED_ATTR: ['href', 'target', 'rel'],
      });
    }
    return html;
  }

  /**
   * 获取当前时间字符串（yyyy-MM-dd HH:mm:ss）。
   * @returns {string} 当前时间。
   */
  function getTimeStr() {
    const now = new Date();
    const y = now.getFullYear();
    const m = (now.getMonth() + 1).toString().padStart(2, '0');
    const d = now.getDate().toString().padStart(2, '0');
    const h = now.getHours().toString().padStart(2, '0');
    const min = now.getMinutes().toString().padStart(2, '0');
    const s = now.getSeconds().toString().padStart(2, '0');
    return `${y}-${m}-${d} ${h}:${min}:${s}`;
  }

  /**
   * 将时间戳格式化为历史记录时间。
   * @param {string|number|Date} ts - 时间输入。
   * @returns {string} 格式化后的时间文本。
   */
  function formatHistoryTime(ts) {
    if (!ts) return '—';
    try {
      const d = new Date(ts);
      if (Number.isNaN(d.getTime())) return String(ts);
      const y = d.getFullYear();
      const m = (d.getMonth() + 1).toString().padStart(2, '0');
      const day = d.getDate().toString().padStart(2, '0');
      const h = d.getHours().toString().padStart(2, '0');
      const min = d.getMinutes().toString().padStart(2, '0');
      const sec = d.getSeconds().toString().padStart(2, '0');
      return `${y}-${m}-${day} ${h}:${min}:${sec}`;
    } catch {
      return String(ts);
    }
  }

  /**
   * 格式化聊天时间；空值回退为当前时间。
   * @param {string|number|Date} ts - 聊天时间。
   * @returns {string} 格式化时间。
   */
  function formatChatTime(ts) {
    if (!ts) return getTimeStr();
    const s = String(ts).trim();
    if (!s) return getTimeStr();
    const d = new Date(ts);
    if (Number.isNaN(d.getTime())) return s;
    const y = d.getFullYear();
    const m = (d.getMonth() + 1).toString().padStart(2, '0');
    const day = d.getDate().toString().padStart(2, '0');
    const h = d.getHours().toString().padStart(2, '0');
    const min = d.getMinutes().toString().padStart(2, '0');
    const sec = d.getSeconds().toString().padStart(2, '0');
    return `${y}-${m}-${day} ${h}:${min}:${sec}`;
  }

  /**
   * 将主题名转换为 URL 友好的 slug。
   * @param {string} name - 主题名。
   * @returns {string} slug 字符串。
   */
  function slugifyTopicName(name) {
    const base = String(name || '').toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9\-]/g, '').slice(0, 50);
    return base || `topic_${Date.now()}`;
  }

  global.formatValue = formatValue;
  global.escapeHtml = escapeHtml;
  global.renderMarkdown = renderMarkdown;
  global.getTimeStr = getTimeStr;
  global.formatHistoryTime = formatHistoryTime;
  global.formatChatTime = formatChatTime;
  global.slugifyTopicName = slugifyTopicName;
})(typeof window !== 'undefined' ? window : this);
