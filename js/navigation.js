/**
 * 视图切换与面板开关（依赖 js/utils.js、js/storage.js；main 中需提供 el，并可选设置 openDetail、renderModificationHistory、renderProblemDetailHistory）
 */
(function (global) {
  const el = function () { return global.el; };
  const escapeHtml = function (s) { return global.escapeHtml ? global.escapeHtml(s) : String(s); };
  const getSavedAnalyses = function () { return global.getSavedAnalyses ? global.getSavedAnalyses() : []; };

  /**
   * 切换应用主视图显隐状态。
   * @param {'home'|'tools'|'detail'|'problemDetail'|'taskTracking'|string} view - 目标视图。
   * @returns {void}
   */
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

  /**
   * 渲染已保存分析列表并绑定点击/键盘事件。
   * @returns {void}
   */
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

  /**
   * 打开或关闭详情页聊天面板。
   * @param {boolean} [open] - 指定开关；不传则切换。
   * @returns {void}
   */
  function toggleChatPanel(open) {
    const e = el();
    const panel = e?.chatPanel;
    const body = document.querySelector('.detail-body');
    if (!panel) return;
    const isOpen = open ?? !panel.classList.contains('chat-panel-open');
    panel.classList.toggle('chat-panel-open', isOpen);
    if (body) body.classList.toggle('chat-panel-open', isOpen);
  }

  /**
   * 打开或关闭历史面板，并在打开时触发历史渲染。
   * @param {boolean} [open] - 指定开关；不传则切换。
   * @returns {void}
   */
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

  /**
   * 打开或关闭问题详情沟通历史面板。
   * @param {boolean} [open] - 指定开关；不传则切换。
   * @returns {void}
   */
  function toggleProblemDetailHistory(open) {
    const e = el();
    const panel = e?.problemDetailHistoryPanel;
    if (!panel) return;
    const isOpen = open ?? !panel.classList.contains('problem-detail-history-panel-open');
    panel.classList.toggle('problem-detail-history-panel-open', isOpen);
    if (panel.setAttribute) panel.setAttribute('aria-hidden', String(!isOpen));
    console.log('[沟通历史] toggleProblemDetailHistory', { isOpen, hasOpenClass: panel.classList.contains('problem-detail-history-panel-open') });
    if (isOpen && typeof global.renderProblemDetailHistory === 'function') {
      setTimeout(() => global.renderProblemDetailHistory(), 0);
    }
  }

  global.switchView = switchView;
  global.renderSavedList = renderSavedList;
  global.toggleChatPanel = toggleChatPanel;
  global.toggleHistoryPanel = toggleHistoryPanel;
  global.toggleProblemDetailHistory = toggleProblemDetailHistory;
})(typeof window !== 'undefined' ? window : this);
