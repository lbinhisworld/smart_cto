/**
 * 视图切换与面板开关（依赖 js/utils.js、js/storage.js；main 中需提供 el，并可选设置 openDetail、renderModificationHistory、renderProblemDetailHistory）
 */
(function (global) {
  const el = function () { return global.el; };
  const escapeHtml = function (s) { return global.escapeHtml ? global.escapeHtml(s) : String(s); };
  const getSavedAnalyses = function () { return global.getSavedAnalyses ? global.getSavedAnalyses() : []; };

  function switchView(view) {
    const e = el();
    if (!e) return;
    if (e.homeView) e.homeView.hidden = view !== 'home';
    if (e.toolsView) e.toolsView.hidden = view !== 'tools';
    if (e.detailView) e.detailView.hidden = view !== 'detail';
    if (e.problemDetailView) e.problemDetailView.hidden = view !== 'problemDetail';
    if (e.taskTrackingView) e.taskTrackingView.hidden = view !== 'taskTracking';
    if (e.navDetailLabel) e.navDetailLabel.hidden = view !== 'detail';
    if (e.topNav) e.topNav.hidden = (view === 'problemDetail' || view === 'taskTracking');
  }

  function renderSavedList() {
    const e = el();
    if (!e?.savedListContent) return;
    const list = getSavedAnalyses();
    if (!list.length) {
      e.savedListContent.innerHTML = '<p class="vs-empty">暂无已存储数据</p>';
      return;
    }
    e.savedListContent.innerHTML = list
      .map(
        (r, i) =>
          `<div class="saved-item" data-index="${i}" role="button" tabindex="0">${escapeHtml(r.companyName || '未命名')}</div>`
      )
      .join('');
    e.savedListContent.querySelectorAll('.saved-item').forEach((node, i) => {
      node.addEventListener('click', () => {
        const openDetail = global.openDetail;
        if (typeof openDetail === 'function') openDetail(list[i]);
      });
      node.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          const openDetail = global.openDetail;
          if (typeof openDetail === 'function') openDetail(list[i]);
        }
      });
    });
  }

  function toggleChatPanel(open) {
    const e = el();
    const panel = e?.chatPanel;
    const body = document.querySelector('.detail-body');
    if (!panel) return;
    const isOpen = open ?? !panel.classList.contains('chat-panel-open');
    panel.classList.toggle('chat-panel-open', isOpen);
    if (body) body.classList.toggle('chat-panel-open', isOpen);
  }

  function toggleHistoryPanel(open) {
    const e = el();
    const panel = e?.historyPanel;
    const body = document.querySelector('.detail-body');
    if (!panel) return;
    const isOpen = open ?? !panel.classList.contains('history-panel-open');
    panel.classList.toggle('history-panel-open', isOpen);
    if (body) body.classList.toggle('history-panel-open', isOpen);
    if (isOpen && typeof global.renderModificationHistory === 'function') {
      global.renderModificationHistory();
    }
  }

  function toggleProblemDetailHistory(open) {
    const e = el();
    const panel = e?.problemDetailHistoryPanel;
    if (!panel) return;
    const isOpen = open ?? !panel.classList.contains('problem-detail-history-panel-open');
    panel.classList.toggle('problem-detail-history-panel-open', isOpen);
    if (panel.setAttribute) panel.setAttribute('aria-hidden', String(!isOpen));
    if (isOpen && typeof global.renderProblemDetailHistory === 'function') {
      global.renderProblemDetailHistory();
    }
  }

  global.switchView = switchView;
  global.renderSavedList = renderSavedList;
  global.toggleChatPanel = toggleChatPanel;
  global.toggleHistoryPanel = toggleHistoryPanel;
  global.toggleProblemDetailHistory = toggleProblemDetailHistory;
})(typeof window !== 'undefined' ? window : this);
