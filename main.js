/**
 * 后端 API 地址（企业信息与商业画布查询）
 */
const API_URL = 'https://app-6aa0d22a.base44.app/api/apps/6969e6b3cbb5e6b66aa0d22a/functions/getCompanyAnalysis';

const VALUE_STREAM_API_URL = 'https://app-6aa0d22a.base44.app/api/apps/6969e6b3cbb5e6b66aa0d22a/functions/getCompanyValueStreams';

const STORAGE_KEY = 'company_analyses';

const el = {
  companyName: document.getElementById('companyName'),
  btnQuery: document.getElementById('btnQuery'),
  btnSave: document.getElementById('btnSave'),
  btnHome: document.getElementById('btnHome'),
  btnList: document.getElementById('btnList'),
  navDetailLabel: document.getElementById('navDetailLabel'),
  btnValueStreamList: document.getElementById('btnValueStreamList'),
  loading: document.getElementById('loading'),
  error: document.getElementById('error'),
  result: document.getElementById('result'),
  basicInfoList: document.getElementById('basicInfoList'),
  bmcGrid: document.getElementById('bmcGrid'),
  bmcReview: document.getElementById('bmcReview'),
  valueStreamSection: document.getElementById('valueStreamSection'),
  valueStreamContent: document.getElementById('valueStreamContent'),
  metadataList: document.getElementById('metadataList'),
  homeView: document.getElementById('homeView'),
  listView: document.getElementById('listView'),
  detailView: document.getElementById('detailView'),
  savedListContent: document.getElementById('savedListContent'),
  detailResult: document.getElementById('detailResult'),
  detailTitle: document.getElementById('detailTitle'),
  searchSuggestions: document.getElementById('searchSuggestions'),
};

let lastQueriedCompanyName = '';
let lastQueryResult = null;

/**
 * 调试：检查「查询价值流列表」按钮及其父元素的状态
 */
function debugValueStreamButton() {
  const btn = document.getElementById('btnValueStreamList');
  const section = document.querySelector('.value-stream-actions');
  const result = document.getElementById('result');

  const info = {
    'btnValueStreamList 元素': btn ? '存在' : '不存在',
    'value-stream-actions 区块': section ? '存在' : '不存在',
    'result (main)': result ? '存在' : '不存在',
  };
  if (btn) {
    const rect = btn.getBoundingClientRect();
    const style = window.getComputedStyle(btn);
    info['按钮 display'] = style.display;
    info['按钮 visibility'] = style.visibility;
    info['按钮 opacity'] = style.opacity;
    info['按钮 width/height'] = `${rect.width.toFixed(0)}x${rect.height.toFixed(0)}`;
    info['按钮在视口内'] = rect.width > 0 && rect.height > 0;
    info['按钮 offsetParent'] = btn.offsetParent ? btn.offsetParent.tagName : 'null';
  }
  if (section) {
    const rect = section.getBoundingClientRect();
    const style = window.getComputedStyle(section);
    info['区块 display'] = style.display;
    info['区块 visibility'] = style.visibility;
    info['区块 width/height'] = `${rect.width.toFixed(0)}x${rect.height.toFixed(0)}`;
  }
  if (result) {
    info['result.hidden'] = result.hidden;
    info['result display'] = window.getComputedStyle(result).display;
  }
  console.log('[价值流按钮调试]', info);
  return info;
}

const BASIC_INFO_FIELDS = [
  { key: 'company_name', label: '企业名称' },
  { key: 'credit_code', label: '统一社会信用代码' },
  { key: 'legal_representative', label: '法定代表人' },
  { key: 'established_date', label: '成立日期' },
  { key: 'registered_capital', label: '注册资本' },
  { key: 'is_listed', label: '是否上市' },
  { key: 'listing_location', label: '上市地点' },
  { key: 'business_scope', label: '经营范围' },
  { key: 'core_qualifications', label: '核心资质' },
  { key: 'official_website', label: '官网' },
];

const BMC_FIELDS = [
  { key: 'customer_segments', label: '客户细分' },
  { key: 'value_propositions', label: '价值主张' },
  { key: 'channels', label: '渠道通路' },
  { key: 'customer_relationships', label: '客户关系' },
  { key: 'revenue_streams', label: '收入来源' },
  { key: 'key_resources', label: '核心资源' },
  { key: 'key_activities', label: '关键业务' },
  { key: 'key_partnerships', label: '重要合作' },
  { key: 'cost_structure', label: '成本结构' },
];

function showLoading(show) {
  el.loading.hidden = !show;
  el.btnQuery.disabled = show;
}

function showError(message) {
  el.error.textContent = message;
  el.error.hidden = !message;
}

function showResult(show) {
  el.result.hidden = !show;
  if (!show) {
    el.valueStreamSection.hidden = true;
  }
  if (show) {
    console.log('[showResult] 结果已显示，调试按钮状态:');
    debugValueStreamButton();
  }
}

function formatValue(value) {
  if (value == null || value === '') return '';
  if (typeof value === 'boolean') return value ? '是' : '否';
  return String(value);
}

function renderBasicInfo(data) {
  if (!data) return;
  el.basicInfoList.innerHTML = BASIC_INFO_FIELDS.map(({ key, label }) => {
    const raw = data[key];
    const value = formatValue(raw);
    if (key === 'official_website' && raw) {
      return `<dt>${label}</dt><dd><a href="${encodeURI(raw)}" target="_blank" rel="noopener">${escapeHtml(value)}</a></dd>`;
    }
    return `<dt>${label}</dt><dd>${escapeHtml(value) || '—'}</dd>`;
  }).join('');
}

function escapeHtml(str) {
  if (str == null || str === '') return '';
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function renderBMC(data) {
  if (!data) return;
  el.bmcGrid.innerHTML = BMC_FIELDS.map(({ key, label }) => {
    const content = formatValue(data[key]);
    return `
      <div class="bmc-block">
        <h4>${escapeHtml(label)}</h4>
        <div class="content">${escapeHtml(content)}</div>
      </div>
    `;
  }).join('');
  const review = formatValue(data.comprehensive_review);
  el.bmcReview.innerHTML = `
    <h4>综合评述</h4>
    <div class="content">${escapeHtml(review)}</div>
  `;
}

/**
 * 从价值流 JSON 解析出阶段(stages)和环节(steps)结构，用于图形渲染
 * 兼容多种字段名与嵌套结构
 */
function parseValueStreamGraph(data) {
  if (!data || typeof data !== 'object') return { stages: [] };
  let rawStages = data.stages ?? data.phases ?? data.nodes ?? data.value_stream?.stages ?? data.data?.stages ?? [];
  if (!Array.isArray(rawStages) || rawStages.length === 0) {
    rawStages = [];
  }
  const list = rawStages;
  return {
    stages: list.map((s, i) => {
      if (!s) return { name: `阶段${i + 1}`, steps: [] };
      if (typeof s === 'string') return { name: s, steps: [] };
      const rawSteps = s.steps ?? s.phases ?? s.items ?? s.nodes ?? s.children ?? [];
      const steps = Array.isArray(rawSteps) ? rawSteps : [];
      const stageName = formatValue(s.name ?? s.title ?? s.stage_name ?? s.phase_name ?? s.label ?? s.node_name ?? s.node_label ?? `阶段${i + 1}`);
      return {
        name: stageName,
        steps: steps.map((st, j) => {
          if (typeof st === 'string') return { name: st, desc: '' };
          return {
            name: formatValue(st.name ?? st.title ?? st.step_name ?? st.phase_name ?? st.label ?? st.node_name ?? `环节${j + 1}`),
            desc: formatValue(st.description ?? st.desc ?? st.content),
          };
        }),
      };
    }),
  };
}

/**
 * 渲染价值流图形视图 HTML：阶段→阶段（箭头），阶段内 环节→环节（箭头）
 */
function renderValueStreamViewHTML(item) {
  const { stages } = parseValueStreamGraph(item);
  if (stages.length === 0) {
    return '<p class="vs-view-placeholder">暂无阶段数据，无法渲染图形</p>';
  }

  const stagesHtml = stages.map((stage, si) => {
    const stepsHtml = stage.steps.length === 0
      ? '<div class="vs-step-node vs-step-empty">—</div>'
      : stage.steps.map((step, ji) => `
          <div class="vs-step-node">
            <span class="vs-step-name">${escapeHtml(step.name)}</span>
            ${step.desc ? `<span class="vs-step-desc">${escapeHtml(step.desc)}</span>` : ''}
          </div>
          ${ji < stage.steps.length - 1 ? '<div class="vs-arrow-inner" aria-hidden="true">↓</div>' : ''}
        `).join('');

    return `
      <div class="vs-graph-stage" data-stage="${si}">
        <div class="vs-stage-node">
          <div class="vs-stage-name">${escapeHtml(stage.name)}</div>
          <div class="vs-steps-chain">${stepsHtml}</div>
        </div>
      </div>
      ${si < stages.length - 1 ? '<div class="vs-arrow-outer" aria-hidden="true">→</div>' : ''}
    `;
  }).join('');

  return `<div class="vs-graph">${stagesHtml}</div>`;
}

/**
 * 将 API 返回解析为价值流列表（数组，每项含 name 及完整 JSON）
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

/** 当前价值流列表，用于展开时按索引渲染对应项的 view */
let currentValueStreamList = [];

/**
 * 渲染价值流列表：可展开卡片，展开时按索引惰性渲染 view，确保每项使用正确数据
 */
function renderValueStreamList(list) {
  const container = el.valueStreamContent;
  currentValueStreamList = list || [];
  if (!list || list.length === 0) {
    container.innerHTML = '<p class="vs-empty">暂无价值流数据</p>';
    return;
  }
  container.innerHTML = list.map((item, i) => {
    const name = formatValue(item.name ?? item.title ?? item.value_stream_name ?? `价值流 ${i + 1}`);
    const jsonStr = JSON.stringify(item, null, 2);
    return `
      <div class="vs-card" data-index="${i}">
        <button type="button" class="vs-card-header" aria-expanded="false" aria-controls="vs-body-${i}">
          <span class="vs-card-name">${escapeHtml(name)}</span>
          <span class="vs-card-chevron" aria-hidden="true">▼</span>
        </button>
        <div class="vs-card-body" id="vs-body-${i}" hidden>
          <div class="vs-tabs">
            <button type="button" class="vs-tab vs-tab-active" data-tab="view">view</button>
            <button type="button" class="vs-tab" data-tab="json">json</button>
          </div>
          <div class="vs-tab-panel vs-tab-panel-view" data-panel="view" data-rendered="false">
            <p class="vs-view-placeholder">展开后加载…</p>
          </div>
          <div class="vs-tab-panel vs-tab-panel-json" data-panel="json" hidden>
            <pre class="vs-json">${escapeHtml(jsonStr)}</pre>
          </div>
        </div>
      </div>
    `;
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
          if (item) {
            viewPanel.innerHTML = renderValueStreamViewHTML(item);
            viewPanel.dataset.rendered = 'true';
          }
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
        if (viewPanel && viewPanel.dataset.rendered !== 'true') {
          const idx = parseInt(card.dataset.index, 10);
          const item = currentValueStreamList[idx];
          if (item) {
            viewPanel.innerHTML = renderValueStreamViewHTML(item);
            viewPanel.dataset.rendered = 'true';
          }
        }
      }
    });
  });
}

async function loadValueStreamList() {
  if (!lastQueriedCompanyName) return;
  el.btnValueStreamList.disabled = true;
  el.valueStreamSection.hidden = false;
  el.valueStreamContent.innerHTML = '<p class="vs-empty">加载中…</p>';

  try {
    const res = await fetch(VALUE_STREAM_API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ companyName: lastQueriedCompanyName }),
    });
    const json = await res.json().catch(() => ({}));

    if (!res.ok) {
      el.valueStreamContent.innerHTML = '<p class="vs-empty">加载失败：' + escapeHtml(json.error || res.status) + '</p>';
      return;
    }

    const data = json.data !== undefined ? json.data : json;
    const list = getValueStreamList(data);
    renderValueStreamList(list);
  } catch (err) {
    el.valueStreamContent.innerHTML = '<p class="vs-empty">请求异常：' + escapeHtml(err.message || String(err)) + '</p>';
  } finally {
    el.btnValueStreamList.disabled = false;
  }
}

function renderMetadata(data) {
  if (!data) return;
  const items = [
    { key: 'analysis_id', label: '档案 ID' },
    { key: 'created_date', label: '创建时间' },
    { key: 'updated_date', label: '更新时间' },
  ];
  el.metadataList.innerHTML = items.map(({ key, label }) => {
    const value = formatValue(data[key]);
    return `<dt>${label}</dt><dd>${escapeHtml(value) || '—'}</dd>`;
  }).join('');
}

async function query() {
  const companyName = (el.companyName.value || '').trim();
  if (!companyName) {
    showError('请输入企业名称');
    return;
  }

  showError('');
  showResult(false);
  showLoading(true);

  const target = (API_URL || '').replace(/\/$/, '') || window.location.origin;

  try {
    const res = await fetch(target, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ companyName }),
    });

    const json = await res.json().catch(() => ({}));

    if (!res.ok) {
      const msg = json.error || `请求失败 (${res.status})`;
      showError(msg);
      showLoading(false);
      return;
    }

    if (!json.success || !json.data) {
      showError(json.error || '返回数据格式异常');
      showLoading(false);
      return;
    }

    const { basic_info, business_model_canvas, metadata } = json.data;
    lastQueriedCompanyName = (basic_info && basic_info.company_name) || companyName;
    lastQueryResult = { basic_info, business_model_canvas, metadata };
    renderBasicInfo(basic_info);
    renderBMC(business_model_canvas);
    renderMetadata(metadata);
    el.valueStreamSection.hidden = true;
    el.valueStreamContent.innerHTML = '';
    showResult(true);
  } catch (err) {
    const message = err.message || String(err);
    if (message.includes('Failed to fetch') || message.includes('NetworkError')) {
      showError(
        '连接被拒绝：当前没有程序在 ' + target + ' 监听。\n\n' +
        '请先启动后端 API 服务（例如在 API 项目目录运行 deno 启动命令），并确保 main.js 顶部的 API_URL 与后端地址、端口一致。'
      );
    } else {
      showError('请求异常：' + message);
    }
  } finally {
    showLoading(false);
  }
}

document.addEventListener('DOMContentLoaded', () => {
  console.log('[DOMContentLoaded] 页面加载完成，检查按钮:');
  debugValueStreamButton();
  if (el.btnValueStreamList) {
    el.btnValueStreamList.addEventListener('click', loadValueStreamList);
  } else {
    console.warn('[DOMContentLoaded] btnValueStreamList 未找到，无法绑定点击事件');
  }
});

function updateSearchSuggestions() {
  const input = (el.companyName?.value || '').trim();
  const container = el.searchSuggestions;
  if (!container) return;
  if (!input) {
    container.hidden = true;
    container.innerHTML = '';
    return;
  }
  const list = getSavedAnalyses();
  const lower = input.toLowerCase();
  const matches = list.filter((r) => {
    const name = (r.companyName || '').trim();
    return name && name.toLowerCase().includes(lower);
  });
  if (matches.length === 0) {
    container.hidden = true;
    container.innerHTML = '';
    return;
  }
  container.innerHTML = matches
    .map(
      (r) =>
        `<div class="search-suggestion-item" role="button" tabindex="0">${escapeHtml(r.companyName || '未命名')}</div>`
    )
    .join('');
  container.hidden = false;
  container.querySelectorAll('.search-suggestion-item').forEach((node, i) => {
    node.addEventListener('click', () => selectSuggestion(matches[i]));
    node.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        selectSuggestion(matches[i]);
      }
    });
  });
}

function selectSuggestion(record) {
  if (!record) return;
  el.searchSuggestions.hidden = true;
  el.searchSuggestions.innerHTML = '';
  el.companyName.value = record.companyName || '';
  openDetail(record);
}

function getSavedAnalyses() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveAnalysis(record) {
  const list = getSavedAnalyses();
  const idx = list.findIndex((r) => (r.companyName || '').trim() === (record.companyName || '').trim());
  if (idx >= 0) list[idx] = record;
  else list.push(record);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
}

function saveCurrent() {
  if (!lastQueryResult) {
    showError('请先查询企业信息');
    return;
  }
  const companyName = (lastQueryResult.basic_info?.company_name || lastQueriedCompanyName || '').trim();
  if (!companyName) {
    showError('无法获取企业名称');
    return;
  }
  const record = {
    companyName,
    basicInfo: lastQueryResult.basic_info,
    bmc: lastQueryResult.business_model_canvas,
    metadata: lastQueryResult.metadata,
    valueStreams: [...(currentValueStreamList || [])],
    storedAt: new Date().toISOString(),
  };
  saveAnalysis(record);
  showError('');
  alert('已存储成功');
}

function switchView(view) {
  el.homeView.hidden = view !== 'home';
  el.listView.hidden = view !== 'list';
  el.detailView.hidden = view !== 'detail';
  if (el.navDetailLabel) el.navDetailLabel.hidden = view !== 'detail';
}

function renderSavedList() {
  const list = getSavedAnalyses();
  if (!list.length) {
    el.savedListContent.innerHTML = '<p class="vs-empty">暂无已存储数据</p>';
    return;
  }
  el.savedListContent.innerHTML = list
    .map(
      (r, i) =>
        `<div class="saved-item" data-index="${i}" role="button" tabindex="0">${escapeHtml(r.companyName || '未命名')}</div>`
    )
    .join('');
  el.savedListContent.querySelectorAll('.saved-item').forEach((node, i) => {
    node.addEventListener('click', () => openDetail(list[i]));
    node.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        openDetail(list[i]);
      }
    });
  });
}

function openDetail(record) {
  if (!record) return;
  el.detailTitle.textContent = record.companyName || '客户详情';
  el.detailResult.innerHTML = buildDetailHTML(record);
  switchView('detail');
  currentValueStreamList = record.valueStreams || [];
  el.detailResult.querySelectorAll('.vs-card-header').forEach((btn) => {
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
          if (item) {
            viewPanel.innerHTML = renderValueStreamViewHTML(item);
            viewPanel.dataset.rendered = 'true';
          }
        }
      }
    });
  });
  el.detailResult.querySelectorAll('.vs-tab').forEach((tab) => {
    tab.addEventListener('click', (e) => {
      e.stopPropagation();
      const card = tab.closest('.vs-card');
      const targetTab = tab.dataset.tab;
      card.querySelectorAll('.vs-tab').forEach((t) => t.classList.remove('vs-tab-active'));
      card.querySelectorAll('.vs-tab-panel').forEach((p) => { p.hidden = p.dataset.panel !== targetTab; });
      tab.classList.add('vs-tab-active');
      if (targetTab === 'view') {
        const viewPanel = card.querySelector('.vs-tab-panel-view');
        if (viewPanel && viewPanel.dataset.rendered !== 'true') {
          const idx = parseInt(card.dataset.index, 10);
          const item = currentValueStreamList[idx];
          if (item) {
            viewPanel.innerHTML = renderValueStreamViewHTML(item);
            viewPanel.dataset.rendered = 'true';
          }
        }
      }
    });
  });
}

function buildDetailHTML(record) {
  const basicInfo = record.basicInfo || {};
  const bmc = record.bmc || {};
  const metadata = record.metadata || {};
  const valueStreams = record.valueStreams || [];

  const basicHtml = BASIC_INFO_FIELDS.map(({ key, label }) => {
    const raw = basicInfo[key];
    const value = formatValue(raw);
    if (key === 'official_website' && raw) {
      return `<dt>${label}</dt><dd><a href="${encodeURI(raw)}" target="_blank" rel="noopener">${escapeHtml(value)}</a></dd>`;
    }
    return `<dt>${label}</dt><dd>${escapeHtml(value) || '—'}</dd>`;
  }).join('');

  const bmcHtml = BMC_FIELDS.map(({ key, label }) => {
    const content = formatValue(bmc[key]);
    return `<div class="bmc-block"><h4>${escapeHtml(label)}</h4><div class="content">${escapeHtml(content)}</div></div>`;
  }).join('');
  const review = formatValue(bmc.comprehensive_review);

  const metaHtml = [
    { key: 'analysis_id', label: '档案 ID' },
    { key: 'created_date', label: '创建时间' },
    { key: 'updated_date', label: '更新时间' },
  ]
    .map(({ key, label }) => {
      const value = formatValue(metadata[key]);
      return `<dt>${label}</dt><dd>${escapeHtml(value) || '—'}</dd>`;
    })
    .join('');

  let valueStreamHtml = '<p class="vs-empty">暂无价值流数据</p>';
  if (valueStreams.length > 0) {
    valueStreamHtml = valueStreams
      .map((item, i) => {
        const name = formatValue(item.name ?? item.title ?? item.value_stream_name ?? `价值流 ${i + 1}`);
        const jsonStr = JSON.stringify(item, null, 2);
        return `
          <div class="vs-card" data-index="${i}">
            <button type="button" class="vs-card-header" aria-expanded="false">
              <span class="vs-card-name">${escapeHtml(name)}</span>
              <span class="vs-card-chevron" aria-hidden="true">▼</span>
            </button>
            <div class="vs-card-body" hidden>
              <div class="vs-tabs">
                <button type="button" class="vs-tab vs-tab-active" data-tab="view">view</button>
                <button type="button" class="vs-tab" data-tab="json">json</button>
              </div>
              <div class="vs-tab-panel vs-tab-panel-view" data-panel="view" data-rendered="false">
                <p class="vs-view-placeholder">展开后加载…</p>
              </div>
              <div class="vs-tab-panel vs-tab-panel-json" data-panel="json" hidden>
                <pre class="vs-json">${escapeHtml(jsonStr)}</pre>
              </div>
            </div>
          </div>`;
      })
      .join('');
  }

  return `
    <section class="basic-info section-card">
      <h2>基本信息</h2>
      <dl class="info-grid">${basicHtml}</dl>
    </section>
    <section class="bmc-section section-card">
      <h2>商业画布 (BMC)</h2>
      <div class="bmc-grid">${bmcHtml}</div>
      <div class="bmc-review"><h4>综合评述</h4><div class="content">${escapeHtml(review)}</div></div>
    </section>
    <section class="value-stream-section section-card">
      <h2>价值流列表</h2>
      <div class="value-stream-content">${valueStreamHtml}</div>
    </section>
    <section class="metadata section-card muted">
      <h3>档案元数据</h3>
      <dl class="info-grid compact">${metaHtml}</dl>
    </section>
  `;
}

el.btnQuery.addEventListener('click', query);
el.companyName.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') query();
});
el.companyName.addEventListener('input', updateSearchSuggestions);
el.companyName.addEventListener('focus', updateSearchSuggestions);
el.companyName.addEventListener('blur', () => {
  setTimeout(() => {
    if (el.searchSuggestions) el.searchSuggestions.hidden = true;
  }, 150);
});
if (el.btnSave) el.btnSave.addEventListener('click', saveCurrent);
if (el.btnHome) el.btnHome.addEventListener('click', () => {
  switchView('home');
  if (el.companyName) el.companyName.value = '';
  if (el.searchSuggestions) { el.searchSuggestions.hidden = true; el.searchSuggestions.innerHTML = ''; }
});
if (el.btnList) el.btnList.addEventListener('click', () => {
  renderSavedList();
  switchView('list');
});
