/**
 * Auth Runtime（多页面共用）
 * - 读取 localStorage 中的 JWT token
 * - 统一构建 Authorization header
 * - 处理 401/403：清理 token 并跳转到 login.html
 */
(function (global) {
  const cfg = global.APP_CONFIG || {};

  // 注意：这里的 key 需要与 login/admin 页写入保持一致（本项目采用 localStorage，跨页面同源共享）。
  const AUTH_TOKEN_STORAGE_KEY = cfg.AUTH_TOKEN_STORAGE_KEY || 'smart_cto_auth_token';
  const AUTH_ROLE_STORAGE_KEY = cfg.AUTH_ROLE_STORAGE_KEY || 'smart_cto_auth_role';

  function getAuthToken() {
    try {
      return global.localStorage.getItem(AUTH_TOKEN_STORAGE_KEY) || '';
    } catch {
      return '';
    }
  }

  function getCurrentRole() {
    try {
      return global.localStorage.getItem(AUTH_ROLE_STORAGE_KEY) || '';
    } catch {
      return '';
    }
  }

  function setAuthToken(token, role) {
    try {
      if (token) global.localStorage.setItem(AUTH_TOKEN_STORAGE_KEY, String(token));
      else global.localStorage.removeItem(AUTH_TOKEN_STORAGE_KEY);
      if (role) global.localStorage.setItem(AUTH_ROLE_STORAGE_KEY, String(role));
      else global.localStorage.removeItem(AUTH_ROLE_STORAGE_KEY);
    } catch {
      // ignore
    }
  }

  function clearAuth() {
    setAuthToken('', '');
  }

  function getAuthHeaders() {
    const token = getAuthToken();
    if (!token) return {};
    return { Authorization: 'Bearer ' + token };
  }

  function handleAuthError(statusOrErr) {
    // status 可能来自后续改造：401/403 会传入数字；否则也能容错。
    const status = typeof statusOrErr === 'number' ? statusOrErr : null;
    if (status != null && status !== 401 && status !== 403) return;

    // 清理 token，避免后续无限循环。
    clearAuth();

    // 保留跳转来源，便于登录后回到原页面（可选）。
    try {
      const url = new URL(global.location.href);
      const redirect = url.pathname + url.search + url.hash;
      global.location.href = 'login.html?redirect=' + encodeURIComponent(redirect);
    } catch {
      global.location.href = 'login.html';
    }
  }

  global.AUTH_RUNTIME = {
    AUTH_TOKEN_STORAGE_KEY,
    AUTH_ROLE_STORAGE_KEY,
    getAuthToken,
    getCurrentRole,
    setAuthToken,
    clearAuth,
    getAuthHeaders,
    handleAuthError,
  };

  // 兼容写法：直接把函数挂到全局，便于 main.js/storage-http-adapter.js/bridge 调用
  global.getAuthToken = getAuthToken;
  global.getAuthHeaders = getAuthHeaders;
  global.handleAuthError = handleAuthError;

  /**
   * 本地模式门禁：
   * 你要求 local 模式下访问业务入口 index.html 也必须先登录，
   * 而不是等待后端返回 401/403 才跳转。
   */
  try {
    const mode = (cfg.MODE || 'local');
    const pathname = global.location && global.location.pathname ? global.location.pathname : '';
    const isLoginPage = pathname.endsWith('login.html') || pathname.endsWith('/login/');
    const isAdminPage = pathname.endsWith('admin.html') || pathname.endsWith('/admin/');
    // 兼容：访问目录时浏览器地址栏可能是 `/frontend/`（而不是 `/frontend/index.html`）
    // 该逻辑用于 local 模式下的门禁，因此需要把目录入口也视为业务首页。
    const isBusinessIndex = pathname.endsWith('index.html') || pathname.endsWith('/');

    if (mode === 'local' && isBusinessIndex && !isLoginPage && !isAdminPage) {
      const token = getAuthToken();
      if (!token) {
        const redirectUrl = pathname + global.location.search + global.location.hash;
        global.location.href = 'login.html?redirect=' + encodeURIComponent(redirectUrl);
      }
    }
  } catch {
    // ignore
  }
})(typeof window !== 'undefined' ? window : this);

