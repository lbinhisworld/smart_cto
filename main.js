/**
 * 后端 API 地址（企业信息与商业画布查询）
 */
const API_URL = 'https://app-6aa0d22a.base44.app/api/apps/6969e6b3cbb5e6b66aa0d22a/functions/getCompanyAnalysis';

const VALUE_STREAM_API_URL = 'https://app-6aa0d22a.base44.app/api/apps/6969e6b3cbb5e6b66aa0d22a/functions/getCompanyValueStreams';

const STORAGE_KEY = 'company_analyses';

/** DeepSeek 大模型配置：请在 main.js 中设置你的 API Key，或通过环境变量/配置注入 */
const DEEPSEEK_API_URL = 'https://api.deepseek.com/v1/chat/completions';
const DEEPSEEK_API_KEY = 'sk-051df7f3ec0a406cb1ceb0fa83317d76'; // 请填入你的 DeepSeek API Key
const DEEPSEEK_MODEL = 'deepseek-chat';

/** 当前详情页的公司名称，用于对话上下文 */
let currentDetailCompanyName = '';

/** 当前详情页完整记录，用于大模型分析页面结构及应用修改 */
let currentDetailRecord = null;

const el = {
  companyName: document.getElementById('companyName'),
  btnQuery: document.getElementById('btnQuery'),
  btnSave: document.getElementById('btnSave'),
  btnHome: document.getElementById('btnHome'),
  btnList: document.getElementById('btnList'),
  navDetailLabel: document.getElementById('navDetailLabel'),
  chatPanel: document.getElementById('chatPanel'),
  btnChat: document.getElementById('btnChat'),
  btnCloseChat: document.getElementById('btnCloseChat'),
  historyPanel: document.getElementById('historyPanel'),
  btnHistory: document.getElementById('btnHistory'),
  btnCloseHistory: document.getElementById('btnCloseHistory'),
  historyContent: document.getElementById('historyContent'),
  chatInput: document.getElementById('chatInput'),
  chatSend: document.getElementById('chatSend'),
  chatMessages: document.getElementById('chatMessages'),
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
  detailContent: document.querySelector('.detail-content'),
  detailTitle: document.getElementById('detailTitle'),
  searchSuggestions: document.getElementById('searchSuggestions'),
};

let lastQueriedCompanyName = '';
let lastQueryResult = null;

/** 聊天历史，用于 DeepSeek API 的 messages 上下文 */
let chatHistory = [];

/** 当前未闭环的修改任务：{ parsed, block }，确认或放弃后清空 */
let currentModificationTask = null;

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

/** 字段标签到数据路径的映射，用于大模型返回的 position 匹配并应用修改 */
const LABEL_TO_PATH = (() => {
  const m = new Map();
  BASIC_INFO_FIELDS.forEach((f) => m.set(f.label, { section: 'basicInfo', key: f.key }));
  BMC_FIELDS.forEach((f) => m.set(f.label, { section: 'bmc', key: f.key }));
  m.set('综合评述', { section: 'bmc', key: 'comprehensive_review' });
  return m;
})();

function buildPageStructureForLLM(record) {
  if (!record) return '';
  const basicInfo = record.basicInfo || {};
  const bmc = record.bmc || {};
  const metadata = record.metadata || {};
  const valueStreams = record.valueStreams || [];
  const lines = [
    '=== 当前页面详情结构 ===',
    '',
    '【基本信息】',
    ...BASIC_INFO_FIELDS.map((f) => `  - ${f.label}: ${formatValue(basicInfo[f.key]) || '—'}`),
    '',
    '【商业画布 BMC】',
    ...BMC_FIELDS.map((f) => `  - ${f.label}: ${formatValue(bmc[f.key]) || '—'}`),
    `  - 综合评述: ${formatValue(bmc.comprehensive_review) || '—'}`,
    '',
    '【档案元数据】',
    `  - 档案 ID: ${formatValue(metadata.analysis_id) || '—'}`,
    `  - 创建时间: ${formatValue(metadata.created_date) || '—'}`,
    `  - 更新时间: ${formatValue(metadata.updated_date) || '—'}`,
    '',
    '【价值流列表】',
    ...(valueStreams.length
      ? valueStreams.map((vs, i) => {
          const name = formatValue(vs.name ?? vs.title ?? vs.value_stream_name) || `价值流 ${i + 1}`;
          return `  - [${i}] ${name}`;
        })
      : ['  (暂无)']),
  ];
  return lines.join('\n');
}

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

/** 从大模型回复中解析结构化修改建议，返回 { position, modification, reason, positionKey, newValue } 或 null */
function parseModificationResponse(text) {
  if (!text || typeof text !== 'string') return null;
  const jsonMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/) || text.match(/\{[\s\S]*\}/);
  const jsonStr = jsonMatch ? (jsonMatch[1] || jsonMatch[0]).trim() : text;
  try {
    const obj = JSON.parse(jsonStr);
    if (obj && (obj.position || obj.modification || obj.reason)) {
      return {
        position: obj.position || '—',
        modification: obj.modification || obj.newValue || '—',
        reason: obj.reason || '—',
        positionKey: obj.positionKey || obj.position,
        newValue: obj.newValue,
      };
    }
  } catch (_) {}
  const posMatch = text.match(/修改位置[：:]\s*([^\n]+)/);
  const modMatch = text.match(/修改意见[：:]\s*([^\n]+)/);
  const reasonMatch = text.match(/修改原因[：:]\s*([^\n]+)/);
  if (posMatch || modMatch || reasonMatch) {
    return {
      position: (posMatch && posMatch[1].trim()) || '—',
      modification: (modMatch && modMatch[1].trim()) || '—',
      reason: (reasonMatch && reasonMatch[1].trim()) || '—',
      positionKey: (posMatch && posMatch[1].trim()) || null,
      newValue: null,
    };
  }
  return null;
}

/** 判断两个修改位置是否相同（同一修改目标） */
function isSameModificationPosition(pos1, pos2) {
  if (!pos1 || !pos2) return false;
  const p1 = getPathForPosition(pos1);
  const p2 = getPathForPosition(pos2);
  if (!p1 || !p2) return String(pos1).trim() === String(pos2).trim();
  return p1.section === p2.section && p1.key === p2.key;
}

/** 根据 position 获取 record 中对应的路径 { section, key } */
function getPathForPosition(pos) {
  const p = String(pos).trim();
  const path = LABEL_TO_PATH.get(p);
  if (path) return path;
  for (const [label, path] of LABEL_TO_PATH) {
    if (p.includes(label) || label.includes(p)) return path;
  }
  return null;
}

/** 获取修改前的当前值 */
function getCurrentValueForPosition(record, parsed) {
  if (!record || !parsed) return '';
  const path = getPathForPosition(parsed.positionKey || parsed.position);
  if (!path) return '';
  const section = record[path.section];
  if (!section || !(path.key in section)) return '';
  return formatValue(section[path.key]) || '';
}

/** 根据 position 匹配并应用修改到 record */
function applyModification(record, parsed) {
  if (!record || !parsed) return false;
  const pos = String(parsed.positionKey || parsed.position).trim();
  const path = getPathForPosition(pos);
  const newVal = parsed.newValue != null ? String(parsed.newValue) : parsed.modification;
  if (path) {
    const section = record[path.section];
    if (section && path.key in section) {
      section[path.key] = newVal;
      return true;
    }
  }
  return false;
}

/** 根据修改位置找到详情页中对应的 DOM 元素 */
function findModificationTarget(position) {
  if (!el.detailResult || !position) return null;
  const pos = String(position).trim();
  const direct = el.detailResult.querySelector(`[data-modify-target="${pos}"]`);
  if (direct) return direct;
  for (const [label] of LABEL_TO_PATH) {
    if (pos.includes(label) || pos === label) {
      const elx = el.detailResult.querySelector(`[data-modify-target="${label}"]`);
      if (elx) return elx;
    }
  }
  return null;
}

/** 清除当前高亮 */
function clearModificationHighlight() {
  el.detailResult?.querySelectorAll('.modify-target-highlight').forEach((el) => el.classList.remove('modify-target-highlight'));
}

/** 滚动到目标元素并居中，添加红色闪动高亮 */
function scrollToTargetAndHighlight(position) {
  clearModificationHighlight();
  const target = findModificationTarget(position);
  if (!target || !el.detailContent) return;
  target.classList.add('modify-target-highlight');
  target.scrollIntoView({ block: 'center', behavior: 'smooth', inline: 'nearest' });
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

function toggleChatPanel(open) {
  const panel = el.chatPanel;
  const body = document.querySelector('.detail-body');
  if (!panel) return;
  const isOpen = open ?? !panel.classList.contains('chat-panel-open');
  panel.classList.toggle('chat-panel-open', isOpen);
  if (body) body.classList.toggle('chat-panel-open', isOpen);
}

function toggleHistoryPanel(open) {
  const panel = el.historyPanel;
  const body = document.querySelector('.detail-body');
  if (!panel) return;
  const isOpen = open ?? !panel.classList.contains('history-panel-open');
  panel.classList.toggle('history-panel-open', isOpen);
  if (body) body.classList.toggle('history-panel-open', isOpen);
  if (isOpen) renderModificationHistory();
}

function renderModificationHistory() {
  if (!el.historyContent) return;
  const record = currentDetailRecord;
  const history = record?.modificationHistory || [];
  const companyName = record?.companyName || '当前企业';
  const titleEl = el.historyPanel?.querySelector('.history-panel-title');
  if (titleEl) titleEl.textContent = `${companyName} - 修改历史`;
  el.historyContent.innerHTML = history.length === 0
    ? `<p class="history-empty">暂无修改历史</p><p class="history-subtitle">${escapeHtml(companyName)}</p>`
    : `<p class="history-subtitle">${escapeHtml(companyName)}</p>
       <div class="history-timeline">
         ${history
           .map(
             (item) => `
           <div class="history-item">
             <div class="history-item-dot"></div>
             <div class="history-item-content">
               <div class="history-item-meta">${escapeHtml(formatHistoryTime(item.timestamp))}</div>
               <div class="history-item-row"><span class="history-label">修改位置</span>${escapeHtml(item.position || '—')}</div>
               <div class="history-item-row"><span class="history-label">修改前</span>${escapeHtml(item.beforeValue ?? '—')}</div>
               <div class="history-item-row"><span class="history-label">修改意见</span>${escapeHtml(item.modification || '—')}</div>
               <div class="history-item-row"><span class="history-label">修改后</span>${escapeHtml(item.afterValue ?? item.modification ?? '—')}</div>
               <div class="history-item-row"><span class="history-label">修改原因</span>${escapeHtml(item.reason || '—')}</div>
             </div>
           </div>`
           )
           .join('')}
       </div>`;
}

function formatHistoryTime(ts) {
  if (!ts) return '—';
  try {
    const d = new Date(ts);
    return d.toLocaleString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
  } catch {
    return String(ts);
  }
}

function formatChatTime(ts) {
  if (!ts) return getTimeStr();
  try {
    const d = new Date(ts);
    return d.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  } catch {
    return getTimeStr();
  }
}

function setupDetailValueStreamEvents() {
  if (!el.detailResult) return;
  currentValueStreamList = currentDetailRecord?.valueStreams || [];
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

function openDetail(record) {
  if (!record) return;
  saveChatToRecord();
  toggleChatPanel(false);
  toggleHistoryPanel(false);
  currentModificationTask = null;
  currentDetailCompanyName = record.companyName || '';
  currentDetailRecord = record;
  chatHistory = record.chatHistory ? [...record.chatHistory] : [];
  record.chatHistory = chatHistory;
  el.detailTitle.textContent = record.companyName || '客户详情';
  el.detailResult.innerHTML = buildDetailHTML(record);
  switchView('detail');
  setupDetailValueStreamEvents();
  renderChatMessagesFromHistory();
}

function renderChatMessagesFromHistory() {
  if (!el.chatMessages) return;
  el.chatMessages.innerHTML = '';
  chatHistory.forEach((msg) => {
    const timeStr = formatChatTime(msg.timestamp);
    if (msg.role === 'user') {
      appendChatBlock(el.chatMessages, 'user', msg.content, timeStr);
    } else {
      const parsed = parseModificationResponse(msg.content);
      if (parsed) {
        appendModificationBlockReadOnly(el.chatMessages, parsed, timeStr);
      } else {
        appendChatBlock(el.chatMessages, 'assistant', msg.content, timeStr);
      }
    }
  });
  el.chatMessages.scrollTop = el.chatMessages.scrollHeight;
}

function saveChatToRecord() {
  if (currentDetailRecord) {
    currentDetailRecord.chatHistory = [...chatHistory];
    saveAnalysis(currentDetailRecord);
  }
}

function buildDetailHTML(record) {
  const basicInfo = record.basicInfo || {};
  const bmc = record.bmc || {};
  const metadata = record.metadata || {};
  const valueStreams = record.valueStreams || [];

  const basicHtml = BASIC_INFO_FIELDS.map(({ key, label }) => {
    const raw = basicInfo[key];
    const value = formatValue(raw);
    const ddContent = key === 'official_website' && raw
      ? `<a href="${encodeURI(raw)}" target="_blank" rel="noopener">${escapeHtml(value)}</a>`
      : escapeHtml(value) || '—';
    return `<div class="info-grid-cell" data-modify-target="${escapeHtml(label)}"><dt>${label}</dt><dd>${ddContent}</dd></div>`;
  }).join('');

  const bmcHtml = BMC_FIELDS.map(({ key, label }) => {
    const content = formatValue(bmc[key]);
    return `<div class="bmc-block" data-modify-target="${escapeHtml(label)}"><h4>${escapeHtml(label)}</h4><div class="content">${escapeHtml(content)}</div></div>`;
  }).join('');
  const review = formatValue(bmc.comprehensive_review);

  const bmcReviewHtml = `<div class="bmc-review" data-modify-target="综合评述"><h4>综合评述</h4><div class="content">${escapeHtml(review)}</div></div>`;

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
      <div class="info-grid">${basicHtml}</div>
    </section>
    <section class="bmc-section section-card">
      <h2>商业画布 (BMC)</h2>
      <div class="bmc-grid">${bmcHtml}</div>
      ${bmcReviewHtml}
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
  saveChatToRecord();
  switchView('home');
  if (el.companyName) el.companyName.value = '';
  if (el.searchSuggestions) { el.searchSuggestions.hidden = true; el.searchSuggestions.innerHTML = ''; }
});
if (el.btnList) el.btnList.addEventListener('click', () => {
  saveChatToRecord();
  renderSavedList();
  switchView('list');
});
if (el.btnChat) el.btnChat.addEventListener('click', () => toggleChatPanel(true));
if (el.btnCloseChat) el.btnCloseChat.addEventListener('click', () => toggleChatPanel(false));
if (el.btnHistory) el.btnHistory.addEventListener('click', () => toggleHistoryPanel(true));
if (el.btnCloseHistory) el.btnCloseHistory.addEventListener('click', () => toggleHistoryPanel(false));
if (el.chatSend) el.chatSend.addEventListener('click', sendChatMessage);
if (el.chatInput) el.chatInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    sendChatMessage();
  }
});

function getTimeStr() {
  const now = new Date();
  return `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}:${now.getSeconds().toString().padStart(2, '0')}`;
}

function appendChatBlock(container, role, content, timeStr) {
  const block = document.createElement('div');
  block.className = `chat-message chat-message-${role}`;
  block.innerHTML = `<div class="chat-message-content">${escapeHtml(content)}</div><div class="chat-message-time">${timeStr}</div>`;
  container.appendChild(block);
  container.scrollTop = container.scrollHeight;
  return block;
}

function appendModificationBlock(container, parsed, timeStr, onConfirm, onCancel, onRetry) {
  const block = document.createElement('div');
  block.className = 'chat-message chat-message-assistant chat-message-modification';
  block.innerHTML = `
    <div class="chat-modification-body">
      <div class="chat-modification-row">
        <span class="chat-modification-label">修改位置</span>
        <span class="chat-modification-value">${escapeHtml(parsed.position)}</span>
      </div>
      <div class="chat-modification-row">
        <span class="chat-modification-label">修改意见</span>
        <span class="chat-modification-value">${escapeHtml(parsed.modification)}</span>
      </div>
      <div class="chat-modification-row">
        <span class="chat-modification-label">修改原因</span>
        <span class="chat-modification-value">${escapeHtml(parsed.reason)}</span>
      </div>
      <div class="chat-modification-actions">
        <button type="button" class="btn-confirm-mod">确认</button>
        <button type="button" class="btn-retry-mod">重来</button>
        <button type="button" class="btn-cancel-mod">放弃</button>
      </div>
    </div>
    <div class="chat-message-time">${timeStr}</div>
  `;
  container.appendChild(block);
  container.scrollTop = container.scrollHeight;
  block.querySelector('.btn-confirm-mod')?.addEventListener('click', () => {
    block.querySelector('.chat-modification-actions').innerHTML = '<span class="mod-status">已确认</span>';
    currentModificationTask = null;
    onConfirm?.();
  });
  block.querySelector('.btn-retry-mod')?.addEventListener('click', () => {
    block.querySelector('.chat-modification-actions').innerHTML = '<span class="mod-status">正在重新分析...</span>';
    onRetry?.(block);
  });
  block.querySelector('.btn-cancel-mod')?.addEventListener('click', () => {
    currentModificationTask = null;
    onCancel?.(block);
  });
  currentModificationTask = { parsed, block };
  return block;
}

/** 就地更新修改块内容（用于同一任务内的修订） */
function updateModificationBlockContent(block, parsed) {
  if (!block || !parsed) return;
  const body = block.querySelector('.chat-modification-body');
  if (!body) return;
  const rows = body.querySelectorAll('.chat-modification-row');
  if (rows.length >= 3) {
    rows[0].querySelector('.chat-modification-value').textContent = parsed.position || '—';
    rows[1].querySelector('.chat-modification-value').textContent = parsed.modification || '—';
    rows[2].querySelector('.chat-modification-value').textContent = parsed.reason || '—';
  }
}

function appendModificationBlockReadOnly(container, parsed, timeStr) {
  const block = document.createElement('div');
  block.className = 'chat-message chat-message-assistant chat-message-modification chat-message-readonly';
  block.innerHTML = `
    <div class="chat-modification-body">
      <div class="chat-modification-row">
        <span class="chat-modification-label">修改位置</span>
        <span class="chat-modification-value">${escapeHtml(parsed.position)}</span>
      </div>
      <div class="chat-modification-row">
        <span class="chat-modification-label">修改意见</span>
        <span class="chat-modification-value">${escapeHtml(parsed.modification)}</span>
      </div>
      <div class="chat-modification-row">
        <span class="chat-modification-label">修改原因</span>
        <span class="chat-modification-value">${escapeHtml(parsed.reason)}</span>
      </div>
      <div class="chat-modification-actions readonly"><span class="mod-status">历史记录</span></div>
    </div>
    <div class="chat-message-time">${timeStr}</div>
  `;
  container.appendChild(block);
  container.scrollTop = container.scrollHeight;
  return block;
}

async function fetchModificationFromLLM() {
  const pageStructure = buildPageStructureForLLM(currentDetailRecord);
  const systemContent = `你是企业信息与商业画布修改助手。当前用户正在查看「${currentDetailCompanyName || '某企业'}」的详情页。

【任务】当用户提出修改需求时，你需要：
1. 分析下方「当前页面详情结构」，判断用户要修改的是哪个位置的内容；
2. 提炼出：修改位置、修改意见（具体的修改点的总结）、修改原因、修改后的完整内容；
3. 用以下 JSON 格式回复（不要包含其他说明文字）：

\`\`\`json
{
  "position": "精确的字段标签，如：客户细分、价值主张、企业名称 等（必须与页面结构中的标签一致）",
  "modification": "具体的修改点的总结，如：将客户细分从宽泛描述调整为更精准的目标客户群体定位",
  "reason": "修改原因说明",
  "newValue": "修改后的完整新内容（必填，即将要写入该字段的全文）"
}
\`\`\`

【当前页面详情结构】
${pageStructure || '(无详情数据)'}`;

  const apiMessages = [
    { role: 'system', content: systemContent },
    ...chatHistory.map((m) => ({ role: m.role, content: m.content })),
  ];
  const res = await fetch(DEEPSEEK_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${DEEPSEEK_API_KEY}`,
    },
    body: JSON.stringify({
      model: DEEPSEEK_MODEL,
      messages: apiMessages,
    }),
  });
  const data = await res.json();
  if (data.error) {
    return '请求失败：' + (data.error.message || JSON.stringify(data.error));
  }
  return data.choices?.[0]?.message?.content ?? '未收到有效回复。';
}

function renderModificationOrPlain(container, assistantContent) {
  const parsed = parseModificationResponse(assistantContent);
  if (parsed && currentDetailRecord) {
    scrollToTargetAndHighlight(parsed.position);
    const lastTs = chatHistory[chatHistory.length - 1]?.timestamp;
    return appendModificationBlock(container, parsed, formatChatTime(lastTs), () => {
      clearModificationHighlight();
      const appliedParsed = currentModificationTask?.parsed || parsed;
      const beforeValue = getCurrentValueForPosition(currentDetailRecord, appliedParsed);
      if (applyModification(currentDetailRecord, appliedParsed)) {
        const afterValue = appliedParsed.newValue != null ? String(appliedParsed.newValue) : appliedParsed.modification;
        const modificationSummary = appliedParsed.modification && appliedParsed.modification !== afterValue
          ? appliedParsed.modification
          : (beforeValue || afterValue ? `将「${beforeValue || '空'}」修改为「${afterValue}」` : '内容已更新');
        const history = currentDetailRecord.modificationHistory || [];
        history.unshift({
          position: appliedParsed.position,
          beforeValue,
          modification: modificationSummary,
          afterValue,
          reason: appliedParsed.reason,
          timestamp: new Date().toISOString(),
        });
        currentDetailRecord.modificationHistory = history;
        el.detailResult.innerHTML = buildDetailHTML(currentDetailRecord);
        saveAnalysis(currentDetailRecord);
        setupDetailValueStreamEvents();
      }
    }, (modBlock) => {
      clearModificationHighlight();
      cancelModification(container, modBlock);
    }, (oldBlock) => retryModification(container, oldBlock));
  }
  return appendChatBlock(container, 'assistant', assistantContent, formatChatTime(chatHistory[chatHistory.length - 1]?.timestamp));
}

function cancelModification(container, modBlock) {
  currentModificationTask = null;
  const userBlock = modBlock.previousElementSibling;
  if (userBlock && userBlock.classList.contains('chat-message-user')) {
    userBlock.remove();
  }
  modBlock.remove();
  chatHistory.pop();
  if (chatHistory.length > 0 && chatHistory[chatHistory.length - 1].role === 'user') {
    chatHistory.pop();
  }
  saveChatToRecord();
  container.scrollTop = container.scrollHeight;
}

async function retryModification(container, oldBlock) {
  chatHistory.pop();
  oldBlock.classList.remove('chat-message-modification');
  oldBlock.classList.add('chat-message-loading');
  oldBlock.innerHTML = '<div class="chat-message-content">正在重新分析...</div><div class="chat-message-time">' + getTimeStr() + '</div>';
  container.scrollTop = container.scrollHeight;
  let assistantContent = '';
  try {
    assistantContent = await fetchModificationFromLLM();
  } catch (err) {
    assistantContent = '网络或请求错误：' + (err.message || String(err));
  }
  const assistantMsg = { role: 'assistant', content: assistantContent, timestamp: new Date().toISOString() };
  chatHistory.push(assistantMsg);
  oldBlock.remove();
  renderModificationOrPlain(container, assistantContent);
  saveChatToRecord();
  container.scrollTop = container.scrollHeight;
}

async function sendChatMessage() {
  const input = el.chatInput;
  const messages = el.chatMessages;
  if (!input || !messages) return;
  const text = (input.value || '').trim();
  if (!text) return;

  input.value = '';
  const userMsg = { role: 'user', content: text, timestamp: new Date().toISOString() };
  chatHistory.push(userMsg);
  appendChatBlock(messages, 'user', text, formatChatTime(userMsg.timestamp));
  saveChatToRecord();

  const loadingBlock = document.createElement('div');
  loadingBlock.className = 'chat-message chat-message-assistant chat-message-loading';
  loadingBlock.innerHTML = '<div class="chat-message-content">正在分析页面结构并提炼修改建议...</div><div class="chat-message-time">' + getTimeStr() + '</div>';
  messages.appendChild(loadingBlock);
  messages.scrollTop = messages.scrollHeight;

  if (!DEEPSEEK_API_KEY) {
    loadingBlock.querySelector('.chat-message-content').textContent = '请在 main.js 中配置 DEEPSEEK_API_KEY 才能使用大模型对话。';
    loadingBlock.classList.remove('chat-message-loading');
    return;
  }

  let assistantContent = '';
  try {
    assistantContent = await fetchModificationFromLLM();
  } catch (err) {
    assistantContent = '网络或请求错误：' + (err.message || String(err));
  }

  const assistantMsg = { role: 'assistant', content: assistantContent, timestamp: new Date().toISOString() };
  chatHistory.push(assistantMsg);
  loadingBlock.remove();

  if (currentModificationTask) {
    const newParsed = parseModificationResponse(assistantContent);
    const currentPosition = currentModificationTask.parsed.position;
    if (newParsed && isSameModificationPosition(newParsed.position, currentPosition)) {
      currentModificationTask.parsed = newParsed;
      updateModificationBlockContent(currentModificationTask.block, newParsed);
      scrollToTargetAndHighlight(newParsed.position);
      saveChatToRecord();
    } else {
      chatHistory.pop();
      const prompt = `请先确认或放弃当前修改（${currentPosition}）后再开启新的修改任务。`;
      chatHistory.push({ role: 'assistant', content: prompt, timestamp: assistantMsg.timestamp });
      appendChatBlock(messages, 'assistant', prompt, formatChatTime(assistantMsg.timestamp));
      saveChatToRecord();
    }
  } else {
    renderModificationOrPlain(messages, assistantContent);
    saveChatToRecord();
  }
  messages.scrollTop = messages.scrollHeight;
}
