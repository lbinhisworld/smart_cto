/**
 * 工具函数：格式化、转义、Markdown 渲染
 */
(function (global) {
  function formatValue(value) {
    if (value == null || value === '') return '';
    if (typeof value === 'boolean') return value ? '是' : '否';
    return String(value);
  }

  function escapeHtml(str) {
    if (str == null || str === '') return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

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
