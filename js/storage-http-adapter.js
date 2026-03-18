/**
 * Storage HTTP 适配器：将数字化问题与聊天记录通过 Backend API 持久化。
 * 依赖 APP_CONFIG.BACKEND_API_URL，需在 config.js 之后加载。
 * 使用内存缓存 + 异步写回，兼容 main.js 的同步调用。
 */
(function (global) {
  const cfg = (global.APP_CONFIG || {});
  const baseUrl = (cfg.BACKEND_API_URL || 'http://localhost:3000/api').replace(/\/$/, '');
  const problemCasesPath = baseUrl + '/problem-cases';

  let problemCasesCache = [];
  let problemChatsCache = {};

  function toLegacyItem(item) {
    if (!item) return null;
    return {
      ...item,
      createdAt: item.createdAt || item.id,
      id: item.id,
    };
  }

  function toBackendPayload(item) {
    const createdAt = item.createdAt || item.id || new Date().toISOString();
    return {
      id: createdAt,
      customerName: String(item.customerName ?? item.customer_name ?? ''),
      customerNeedsOrChallenges: String(item.customerNeedsOrChallenges ?? item.customer_needs_or_challenges ?? ''),
      customerItStatus: String(item.customerItStatus ?? item.customer_it_status ?? ''),
      projectTimeRequirement: String(item.projectTimeRequirement ?? item.project_time_requirement ?? ''),
      currentMajorStage: Number(item.currentMajorStage ?? 0),
      currentItStrategySubstep: Number(item.currentItStrategySubstep ?? 0),
      completedStages: Array.isArray(item.completedStages) ? item.completedStages : [],
      workflowAlignCompletedStages: Array.isArray(item.workflowAlignCompletedStages) ? item.workflowAlignCompletedStages : [],
      itGapCompletedStages: Array.isArray(item.itGapCompletedStages) ? item.itGapCompletedStages : [],
      completedTaskIds: Array.isArray(item.completedTaskIds) ? item.completedTaskIds : [],
      basicInfo: item.basicInfo,
      bmc: item.bmc,
      requirementLogic: item.requirementLogic,
      valueStream: item.valueStream,
      globalItGapAnalysisJson: item.globalItGapAnalysisJson,
      localItGapSessions: item.localItGapSessions,
      localItGapAnalyses: item.localItGapAnalyses,
      rolePermissionSessions: item.rolePermissionSessions,
    };
  }

  function toMessagePayload(m) {
    return {
      id: m.id || 'msg_' + Date.now() + '_' + Math.random().toString(36).slice(2, 9),
      taskId: m.taskId,
      taskName: m.taskName,
      role: m.role,
      type: m.type,
      content: String(m.content ?? ''),
      timestamp: (m.timestamp && m.timestamp.endsWith && m.timestamp.endsWith('Z')) ? m.timestamp : new Date(m.timestamp || Date.now()).toISOString(),
      confirmed: Boolean(m.confirmed),
    };
  }

  async function fetchJson(url, options) {
    const res = await fetch(url, {
      headers: { 'Content-Type': 'application/json' },
      ...options,
    });
    if (!res.ok) throw new Error('Backend request failed: ' + res.status);
    return res.json();
  }

  async function loadProblemCases() {
    try {
      const data = await fetchJson(problemCasesPath);
      const items = (data.items || []).map(toLegacyItem).filter(Boolean);
      problemCasesCache = items;
    } catch (e) {
      console.warn('[storage-http-adapter] loadProblemCases failed:', e);
      problemCasesCache = [];
    }
  }

  async function loadChatsForCase(id) {
    try {
      const data = await fetchJson(problemCasesPath + '/' + encodeURIComponent(id) + '/messages');
      return (data.items || []).map(toMessagePayload);
    } catch {
      return [];
    }
  }

  async function loadAllChats() {
    const map = {};
    for (const item of problemCasesCache) {
      const id = item.createdAt || item.id;
      if (id) map[id] = await loadChatsForCase(id);
    }
    problemChatsCache = map;
  }

  async function init() {
    if (!(cfg.USE_BACKEND_STORAGE)) return;
    await loadProblemCases();
    await loadAllChats();
    global.dispatchEvent(new CustomEvent('storageBackendReady'));
  }

  init();

  const HttpAdapter = {
    getDigitalProblems() {
      return problemCasesCache;
    },

    saveDigitalProblem(item) {
      const createdAt = item.createdAt || new Date().toISOString();
      const payload = toBackendPayload({ ...item, createdAt });
      problemCasesCache.unshift(toLegacyItem({ ...payload, createdAt }));
      fetch(problemCasesPath, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      }).catch((e) => console.warn('[storage-http-adapter] saveDigitalProblem failed:', e));
    },

    removeDigitalProblem(index) {
      if (index < 0 || index >= problemCasesCache.length) return;
      const item = problemCasesCache[index];
      const id = item.createdAt || item.id;
      problemCasesCache.splice(index, 1);
      if (id) {
        fetch(problemCasesPath + '/' + encodeURIComponent(id), { method: 'DELETE' })
          .catch((e) => console.warn('[storage-http-adapter] removeDigitalProblem failed:', e));
      }
    },

    updateDigitalProblem(createdAt, updates) {
      const idx = problemCasesCache.findIndex((it) => (it.createdAt || it.id) === createdAt);
      if (idx < 0) return;
      const item = { ...problemCasesCache[idx], ...updates };
      problemCasesCache[idx] = item;
      fetch(problemCasesPath + '/' + encodeURIComponent(createdAt), {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      }).catch((e) => console.warn('[storage-http-adapter] updateDigitalProblem failed:', e));
    },

    getProblemDetailChats() {
      return problemChatsCache;
    },

    saveProblemDetailChat(createdAt, messages) {
      problemChatsCache[createdAt] = messages || [];
      const items = (messages || []).map(toMessagePayload);
      fetch(problemCasesPath + '/' + encodeURIComponent(createdAt) + '/messages', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items }),
      }).catch((e) => console.warn('[storage-http-adapter] saveProblemDetailChat failed:', e));
    },
  };

  global.STORAGE_HTTP_ADAPTER = HttpAdapter;
})(typeof window !== 'undefined' ? window : this);
