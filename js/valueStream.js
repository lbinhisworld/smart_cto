/**
 * 价值流解析与渲染（依赖 js/config.js、js/utils.js；需在 main 中提供 el、currentValueStreamList 或由 main 在调用前设置）
 */
(function (global) {
  /**
   * 从混合阶段文案中提取纯阶段名。
   * @param {*} raw - 原始阶段字段。
   * @returns {string} 标准化阶段名。
   */
  function extractPureStageName(raw) {
    const s = global.formatValue(raw);
    if (!s) return s;
    if (s.includes('阶段:') && s.includes('节点:')) {
      const m = s.match(/阶段:\s*([^节点]+?)(?:\s*节点:|$)/);
      if (m) return m[1].trim();
    }
    if (s.startsWith('阶段:')) {
      const m = s.match(/阶段:\s*(.+?)(?:\s*节点:|$)/);
      if (m) return m[1].trim();
    }
    return s;
  }

  /**
   * 解析环节名称与描述。
   * @param {Object} stepObj - 环节对象。
   * @returns {{name: string, desc: string}} 规范化后的名称与描述。
   */
  function extractStepNameAndDesc(stepObj) {
    const nameRaw = stepObj.name ?? stepObj.title ?? stepObj.step_name ?? stepObj.phase_name ?? stepObj.label ?? stepObj.node_name ?? '';
    const descRaw = stepObj.description ?? stepObj.desc ?? stepObj.content;
    const name = global.formatValue(nameRaw);
    const desc = global.formatValue(descRaw);
    if (desc) return { name, desc };
    const m = name && name.match(/^(.+?)\s*[（(]([^）)]+)[）)]\s*$/);
    if (m) return { name: m[1].trim(), desc: m[2].trim() };
    return { name, desc: '' };
  }

  /**
   * 将价值流 JSON 解析为统一图结构。
   * @param {Object} data - 价值流原始数据。
   * @returns {{stages: Array<{name: string, steps: Array}>}} 标准化结构。
   */
  function parseValueStreamGraph(data) {
    if (!data || typeof data !== 'object') return { stages: [] };
    let rawStages = data.stages ?? data.phases ?? data.nodes ?? data.value_stream?.stages ?? data.data?.stages ?? [];
    if (!Array.isArray(rawStages) || rawStages.length === 0) rawStages = [];
    const list = rawStages;
    return {
      stages: list.map((s, i) => {
        if (!s) return { name: `阶段${i + 1}`, steps: [] };
        if (typeof s === 'string') return { name: extractPureStageName(s), steps: [] };
        const rawSteps = s.steps ?? s.tasks ?? s.phases ?? s.items ?? s.nodes ?? s.children ?? [];
        const steps = Array.isArray(rawSteps) ? rawSteps : [];
        const rawStageName = s.name ?? s.title ?? s.stage_name ?? s.phase_name ?? s.label ?? s.node_name ?? s.node_label ?? `阶段${i + 1}`;
        const stageName = extractPureStageName(rawStageName);
        return {
          name: stageName,
          steps: steps.map((st, j) => {
            if (typeof st === 'string') {
              const { name: stepName, desc: stepDesc } = extractStepNameAndDesc({ name: st });
              return { name: stepName || st, desc: stepDesc, role: '', duration: '', itStatusLabel: '', painPoint: '' };
            }
            const { name: stepName, desc: stepDesc } = extractStepNameAndDesc(st);
            const role = global.formatValue(st.role ?? st.executor ?? st.执行角色) || '';
            const duration = global.formatValue(st.duration ?? st.lead_time ?? st.预估耗时 ?? st.提前期) || '';
            const itStatus = st.itStatus ?? st.it_status;
            const itStatusLabel = itStatus && typeof itStatus === 'object'
              ? (itStatus.type === '手工' ? `手工-${itStatus.detail || '—'}` : itStatus.type === '系统' ? `系统-${itStatus.detail || '—'}` : '')
              : (typeof itStatus === 'string' ? itStatus : '');
            const rawPainPoint = global.formatValue(st.painPoint ?? st.pain_point) || '';
            const trimmed = rawPainPoint.trim();
            const isNoPainPoint = /^(无明显痛点|无痛点|暂无|无)$/i.test(trimmed) || /^无明显痛点/i.test(trimmed);
            const painPoint = isNoPainPoint ? '' : rawPainPoint;
            return { name: stepName || `环节${j + 1}`, desc: stepDesc, role, duration, itStatusLabel: itStatusLabel || '', painPoint };
          }),
        };
      }),
    };
  }

  /**
   * 渲染单条价值流的可视化 HTML。
   * @param {Object} item - 单条价值流数据。
   * @returns {string} 渲染 HTML。
   */
  function renderValueStreamViewHTML(item) {
    const { stages } = parseValueStreamGraph(item);
    if (stages.length === 0) return '<p class="vs-view-placeholder">暂无阶段数据，无法渲染图形</p>';
    const stagesHtml = stages.map((stage, si) => {
      const stepsHtml = stage.steps.length === 0
        ? '<div class="vs-step-node vs-step-empty">—</div>'
        : stage.steps.map((step, ji) => {
            const roleDurationHtml = (step.role || step.duration)
              ? `<div class="vs-step-meta">${step.role ? `<span class="vs-step-meta-chip vs-step-meta-role">${global.escapeHtml(step.role)}</span>` : ''}${step.duration ? `<span class="vs-step-meta-chip vs-step-meta-duration">${global.escapeHtml(step.duration)}</span>` : ''}</div>` : '';
            const itStatusHtml = step.itStatusLabel ? `<div class="vs-step-meta"><span class="vs-step-meta-chip vs-step-meta-it-status">IT现状：${global.escapeHtml(step.itStatusLabel)}</span></div>` : '';
            const painPointHtml = step.painPoint ? `<div class="vs-step-meta"><div class="vs-step-pain-point-card">${global.escapeHtml(step.painPoint)}</div></div>` : '';
            return `<div class="vs-step-node" data-vs-step-name="${global.escapeHtml(step.name)}"><span class="vs-step-name">${global.escapeHtml(step.name)}</span>${step.desc ? `<span class="vs-step-desc">${global.escapeHtml(step.desc)}</span>` : ''}${roleDurationHtml}${itStatusHtml}${painPointHtml}</div>${ji < stage.steps.length - 1 ? '<div class="vs-arrow-inner" aria-hidden="true">↓</div>' : ''}`;
          }).join('');
      return `<div class="vs-graph-stage" data-stage="${si}" data-vs-stage-name="${global.escapeHtml(stage.name)}"><div class="vs-stage-node" data-vs-stage-name="${global.escapeHtml(stage.name)}"><div class="vs-stage-name">${global.escapeHtml(stage.name)}</div><div class="vs-steps-chain">${stepsHtml}</div></div></div>${si < stages.length - 1 ? '<div class="vs-arrow-outer" aria-hidden="true">→</div>' : ''}`;
    }).join('');
    return `<div class="vs-graph">${stagesHtml}</div>`;
  }

  /**
   * 渲染端到端流程横向视图 HTML。
   * @param {Object} valueStream - 价值流数据。
   * @returns {string} 渲染 HTML。
   */
  function renderEndToEndFlowHTML(valueStream) {
    const { stages } = parseValueStreamGraph(valueStream);
    const allSteps = stages.flatMap((s) => s.steps);
    if (allSteps.length === 0) return '<p class="vs-view-placeholder">暂无环节数据，无法渲染端到端流程</p>';
    const stepCardsHtml = allSteps.map((step, i) => {
      const roleDurationHtml = (step.role || step.duration) ? `<div class="vs-step-meta">${step.role ? `<span class="vs-step-meta-chip vs-step-meta-role">${global.escapeHtml(step.role)}</span>` : ''}${step.duration ? `<span class="vs-step-meta-chip vs-step-meta-duration">${global.escapeHtml(step.duration)}</span>` : ''}</div>` : '';
      const itStatusHtml = step.itStatusLabel ? `<div class="vs-step-meta"><span class="vs-step-meta-chip vs-step-meta-it-status">IT现状：${global.escapeHtml(step.itStatusLabel)}</span></div>` : '';
      const painPointHtml = step.painPoint ? `<div class="vs-step-meta"><div class="vs-step-pain-point-card">${global.escapeHtml(step.painPoint)}</div></div>` : '';
      return `<div class="vs-e2e-step-card vs-step-node" data-vs-step-index="${i}"><div class="vs-e2e-step-name-block"><span class="vs-e2e-step-name-text">${global.escapeHtml(step.name)}</span></div>${step.desc ? `<span class="vs-step-desc">${global.escapeHtml(step.desc)}</span>` : ''}${roleDurationHtml}${itStatusHtml}${painPointHtml}</div>${i < allSteps.length - 1 ? '<div class="vs-arrow-outer vs-e2e-arrow" aria-hidden="true">→</div>' : ''}`;
    }).join('');
    return `<div class="vs-e2e-flow">${stepCardsHtml}</div>`;
  }

  /**
   * 从不同返回结构中提取价值流数组。
   * @param {*} data - 原始接口返回数据。
   * @returns {Array} 价值流列表。
   */
  function getValueStreamList(data) {
    if (data == null) return [];
    if (Array.isArray(data)) return data;
    const raw = data.value_streams ?? data.streams ?? data.list ?? data.data;
    if (Array.isArray(raw)) return raw;
    if (data.stages != null || data.phases != null) return [data];
    if (raw != null && typeof raw === 'object') return [raw];
    return [];
  }

  let currentValueStreamList = [];

  /**
   * 渲染价值流列表并绑定展开/切换事件。
   * @param {Array} list - 价值流数组。
   * @returns {void}
   */
  function renderValueStreamList(list) {
    const el = global.el;
    if (!el || !el.valueStreamContent) return;
    currentValueStreamList.length = 0;
    (list || []).forEach((item) => currentValueStreamList.push(item));
    const container = el.valueStreamContent;
    if (!list || list.length === 0) {
      container.innerHTML = '<p class="vs-empty">暂无价值流数据</p>';
      return;
    }
    container.innerHTML = list.map((item, i) => {
      const name = global.formatValue(item.name ?? item.title ?? item.value_stream_name ?? `价值流 ${i + 1}`);
      const jsonStr = JSON.stringify(item, null, 2);
      return `<div class="vs-card" data-index="${i}"><button type="button" class="vs-card-header" aria-expanded="false" aria-controls="vs-body-${i}"><span class="vs-card-name">${global.escapeHtml(name)}</span><span class="vs-card-chevron" aria-hidden="true">▼</span></button><div class="vs-card-body" id="vs-body-${i}" hidden><div class="vs-tabs"><button type="button" class="vs-tab vs-tab-active" data-tab="view">view</button><button type="button" class="vs-tab" data-tab="json">json</button></div><div class="vs-tab-panel vs-tab-panel-view" data-panel="view" data-rendered="false"><p class="vs-view-placeholder">展开后加载…</p></div><div class="vs-tab-panel vs-tab-panel-json" data-panel="json" hidden><pre class="vs-json">${global.escapeHtml(jsonStr)}</pre></div></div></div>`;
    }).join('');

    container.querySelectorAll('.vs-card-header').forEach((btn) => {
      btn.addEventListener('click', () => {
        const card = btn.closest('.vs-card');
        const body = card.querySelector('.vs-card-body');
        const expanded = body.hidden;
        body.hidden = !expanded;
        btn.setAttribute('aria-expanded', String(!expanded));
        card.classList.toggle('vs-card-expanded', !expanded);
        if (expanded) {
          const viewPanel = card.querySelector('.vs-tab-panel-view');
          if (viewPanel && viewPanel.dataset.rendered !== 'true') {
            const idx = parseInt(card.dataset.index, 10);
            const item = currentValueStreamList[idx];
            if (item) { viewPanel.innerHTML = renderValueStreamViewHTML(item); viewPanel.dataset.rendered = 'true'; }
          }
        }
      });
    });
    container.querySelectorAll('.vs-tab').forEach((tab) => {
      tab.addEventListener('click', (e) => {
        e.stopPropagation();
        const card = tab.closest('.vs-card');
        const targetTab = tab.dataset.tab;
        card.querySelectorAll('.vs-tab').forEach((t) => t.classList.remove('vs-tab-active'));
        card.querySelectorAll('.vs-tab-panel').forEach((p) => { p.hidden = p.dataset.panel !== targetTab; });
        tab.classList.add('vs-tab-active');
        if (targetTab === 'view') {
          const viewPanel = card.querySelector('.vs-tab-panel-view');
          if (viewPanel) {
            const idx = parseInt(card.dataset.index, 10);
            const item = currentValueStreamList[idx];
            if (item) { viewPanel.innerHTML = renderValueStreamViewHTML(item); viewPanel.dataset.rendered = 'true'; }
          }
        }
      });
    });
  }

  global.extractPureStageName = extractPureStageName;
  global.extractStepNameAndDesc = extractStepNameAndDesc;
  global.parseValueStreamGraph = parseValueStreamGraph;
  global.renderValueStreamViewHTML = renderValueStreamViewHTML;
  global.renderEndToEndFlowHTML = renderEndToEndFlowHTML;
  global.getValueStreamList = getValueStreamList;
  global.currentValueStreamList = currentValueStreamList;
  global.renderValueStreamList = renderValueStreamList;
})(typeof window !== 'undefined' ? window : this);
