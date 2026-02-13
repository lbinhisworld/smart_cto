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
  const vsLines = [];
  if (valueStreams.length > 0) {
    valueStreams.forEach((vs, i) => {
      const vsName = formatValue(vs.name ?? vs.title ?? vs.value_stream_name) || `价值流 ${i + 1}`;
      vsLines.push(`  - [${i}] 价值流名称: ${vsName}`);
      const { stages } = parseValueStreamGraph(vs);
      stages.forEach((stage, si) => {
        vsLines.push(`      阶段: ${stage.name}`);
        (stage.steps || []).forEach((step, ji) => {
          vsLines.push(`        节点: ${step.name}`);
        });
      });
    });
  } else {
    vsLines.push('  (暂无)');
  }
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
    '【价值流列表】(含阶段与节点名称)',
    ...vsLines,
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
      const parsed = {
        position: obj.position || '—',
        modification: obj.modification || obj.newValue || '—',
        reason: obj.reason || '—',
        positionKey: obj.positionKey || obj.position,
        newValue: obj.newValue,
      };
      if (obj.isValueStream) {
        parsed.isValueStream = true;
        parsed.operation = (obj.operation || 'update').toLowerCase();
        parsed.valueStreamName = obj.valueStreamName || obj.value_stream_name || '';
        parsed.nodeName = obj.nodeName || obj.node_name || '';
        parsed.insertAfterStepName = obj.insertAfterStepName || obj.insert_after_step_name || '';
        parsed.valueStreamIndex = obj.valueStreamIndex != null ? obj.valueStreamIndex : obj.value_stream_index;
      }
      return parsed;
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
  const p1 = typeof pos1 === 'object' ? pos1 : null;
  const p2 = typeof pos2 === 'object' ? pos2 : null;
  if (p1?.isValueStream && p2?.isValueStream) {
    const n1 = (p1.valueStreamName || '').trim();
    const n2 = (p2.valueStreamName || '').trim();
    const node1 = (p1.nodeName || '').trim();
    const node2 = (p2.nodeName || '').trim();
    return n1 === n2 && node1 === node2;
  }
  const s1 = typeof pos1 === 'object' ? (pos1.positionKey || pos1.position) : pos1;
  const s2 = typeof pos2 === 'object' ? (pos2.positionKey || pos2.position) : pos2;
  const path1 = getPathForPosition(s1);
  const path2 = getPathForPosition(s2);
  if (!path1 || !path2) return String(s1).trim() === String(s2).trim();
  return path1.section === path2.section && path1.key === path2.key;
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
  if (parsed.isValueStream) {
    const vsList = record.valueStreams || [];
    const vsName = (parsed.valueStreamName || '').trim();
    const nodeName = (parsed.nodeName || '').trim();
    for (const vs of vsList) {
      const name = formatValue(vs.name ?? vs.title ?? vs.value_stream_name) || '';
      if (!vsName || name === vsName) {
        const { stages } = parseValueStreamGraph(vs);
        for (const stage of stages) {
          if (stage.name === nodeName) return stage.name;
          for (const step of stage.steps || []) {
            if (step.name === nodeName) return step.desc || step.name || '';
          }
        }
      }
    }
    return '';
  }
  const path = getPathForPosition(parsed.positionKey || parsed.position);
  if (!path) return '';
  const section = record[path.section];
  if (!section || !(path.key in section)) return '';
  return formatValue(section[path.key]) || '';
}

/** 根据 position 匹配并应用修改到 record */
function applyModification(record, parsed) {
  if (!record || !parsed) return false;
  const newVal = parsed.newValue != null ? String(parsed.newValue) : parsed.modification;

  if (parsed.isValueStream) {
    const vsList = record.valueStreams || [];
    const vsName = (parsed.valueStreamName || '').trim();
    const nodeName = (parsed.nodeName || '').trim();
    const vsIndex = parsed.valueStreamIndex;
    const op = (parsed.operation || 'update').toLowerCase();

    for (let vi = 0; vi < vsList.length; vi++) {
      const vs = vsList[vi];
      const name = formatValue(vs.name ?? vs.title ?? vs.value_stream_name) || '';
      const nameMatch = !vsName || name === vsName || name.includes(vsName) || vsName.includes(name);
      if (!nameMatch || (vsIndex != null && vi !== vsIndex)) continue;

      let rawStages = vs.stages ?? vs.phases ?? vs.nodes ?? vs.value_stream?.stages ?? vs.data?.stages;
      if (!Array.isArray(rawStages)) rawStages = vs.stages = [];
      if (!vs.stages && (vs.phases || vs.nodes)) rawStages = vs.phases ?? vs.nodes;

      const getStageNameForMatch = (s) => {
        const raw = s.name ?? s.title ?? s.stage_name ?? s.phase_name ?? s.label ?? s.node_name ?? '';
        return extractPureStageName(raw) || formatValue(raw);
      };

      if (op === 'addstage') {
        const newStage = { name: newVal, steps: [] };
        if (nodeName) {
          const insertIdx = rawStages.findIndex((s) => s && getStageNameForMatch(s) === nodeName);
          if (insertIdx >= 0) rawStages.splice(insertIdx + 1, 0, newStage);
          else rawStages.push(newStage);
        } else {
          rawStages.push(newStage);
        }
        return true;
      }

      if (op === 'addstep') {
        const insertAfterStep = (parsed.insertAfterStepName || parsed.insert_after_step_name || '').trim();
        const STEP_KEYS = ['steps', 'phases', 'items', 'nodes', 'children'];
        const getStepsArray = (stage) => {
          for (const k of STEP_KEYS) {
            const arr = stage[k];
            if (Array.isArray(arr)) return { arr, key: k };
          }
          stage.steps = Array.isArray(stage.steps) ? stage.steps : [];
          return { arr: stage.steps, key: 'steps' };
        };
        const getStepNameForMatch = (st) => {
          const raw = formatValue(st.name ?? st.title ?? st.step_name ?? st.phase_name ?? st.label ?? st.node_name ?? '');
          const m = raw.match(/^(.+?)\s*\([^)]*\)$/);
          return m ? m[1].trim() : raw;
        };
        for (const s of rawStages) {
          if (!s) continue;
          const stageName = getStageNameForMatch(s);
          if (stageName !== nodeName && !stageName.includes(nodeName) && !nodeName.includes(stageName)) continue;
          const { arr: rawSteps } = getStepsArray(s);
          const parts = newVal.split(/\n/);
          const stepName = parts[0]?.trim() || newVal;
          const stepDesc = parts.slice(1).join('\n').trim() || '';
          const newStep = {
            name: stepName,
            step_name: stepName,
            title: stepName,
            description: stepDesc,
            desc: stepDesc,
            content: stepDesc,
          };
          if (insertAfterStep) {
            const idx = rawSteps.findIndex((st) => st && getStepNameForMatch(st) === insertAfterStep);
            if (idx >= 0) rawSteps.splice(idx + 1, 0, newStep);
            else rawSteps.push(newStep);
          } else {
            rawSteps.push(newStep);
          }
          return true;
        }
        return false;
      }

      for (const s of rawStages) {
        if (!s) continue;
        const stageName = getStageNameForMatch(s);
        if (stageName === nodeName) {
          s.name = s.title = s.stage_name = s.phase_name = s.label = s.node_name = newVal;
          return true;
        }
        const rawSteps = s.steps ?? s.phases ?? s.items ?? s.nodes ?? s.children ?? [];
        if (!Array.isArray(rawSteps)) continue;
        for (const st of rawSteps) {
          if (!st) continue;
          const stepName = formatValue(st.name ?? st.title ?? st.step_name ?? st.phase_name ?? st.label ?? st.node_name ?? '');
          if (stepName === nodeName) {
            if (st.description != null || st.desc != null || st.content != null) {
              st.description = st.desc = st.content = newVal;
            } else {
              st.name = st.title = st.step_name = st.phase_name = st.label = st.node_name = newVal;
            }
            return true;
          }
        }
      }
    }
    return false;
  }

  const pos = String(parsed.positionKey || parsed.position).trim();
  const path = getPathForPosition(pos);
  if (path) {
    const section = record[path.section];
    if (section && path.key in section) {
      section[path.key] = newVal;
      return true;
    }
  }
  return false;
}

/** 根据修改位置或 parsed 找到详情页中对应的 DOM 元素 */
function findModificationTarget(positionOrParsed) {
  if (!el.detailResult) return null;
  const parsed = positionOrParsed && typeof positionOrParsed === 'object' ? positionOrParsed : null;
  const position = parsed ? (parsed.positionKey || parsed.position) : String(positionOrParsed || '').trim();

  if (parsed?.isValueStream) {
    const vsName = (parsed.valueStreamName || '').trim();
    const nodeName = (parsed.nodeName || '').trim();
    const vsIndex = parsed.valueStreamIndex;
    const cards = el.detailResult.querySelectorAll('.vs-card');
    let card = null;
    for (const c of cards) {
      const cName = (c.dataset.vsName || '').trim();
      const cIdx = parseInt(c.dataset.vsIndex ?? c.dataset.index, 10);
      if ((vsName && cName === vsName) || (vsIndex != null && cIdx === vsIndex)) {
        card = c;
        break;
      }
    }
    if (!card) return null;
    if (!nodeName) return card;
    const body = card.querySelector('.vs-card-body');
    const viewPanel = body?.querySelector('.vs-tab-panel-view');
    if (!viewPanel || viewPanel.dataset.rendered !== 'true') return card;
    const stageEl = viewPanel.querySelector(`[data-vs-stage-name="${nodeName}"]`);
    if (stageEl) return stageEl;
    const stepEl = viewPanel.querySelector(`[data-vs-step-name="${nodeName}"]`);
    if (stepEl) return stepEl;
    const allNames = viewPanel.querySelectorAll('[data-vs-stage-name], [data-vs-step-name]');
    for (const n of allNames) {
      const name = n.dataset.vsStageName || n.dataset.vsStepName || '';
      if (name === nodeName || name.includes(nodeName) || nodeName.includes(name)) return n;
    }
    return card;
  }

  if (!position) return null;
  const direct = el.detailResult.querySelector(`[data-modify-target="${position}"]`);
  if (direct) return direct;
  for (const [label] of LABEL_TO_PATH) {
    if (position.includes(label) || position === label) {
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

/** 滚动到目标元素并居中，添加红色闪动高亮。价值流修改时会先展开卡片并渲染 view */
function scrollToTargetAndHighlight(positionOrParsed) {
  clearModificationHighlight();
  const parsed = positionOrParsed && typeof positionOrParsed === 'object' ? positionOrParsed : { position: positionOrParsed };
  let target = findModificationTarget(positionOrParsed);
  if (!target || !el.detailContent) return;

  if (parsed.isValueStream) {
    const card = target.closest('.vs-card') || (target.classList.contains('vs-card') ? target : null);
    if (card) {
      const header = card.querySelector('.vs-card-header');
      const body = card.querySelector('.vs-card-body');
      if (header && body && body.hidden) {
        header.click();
        header.setAttribute('aria-expanded', 'true');
        body.hidden = false;
        const viewPanel = body.querySelector('.vs-tab-panel-view');
        if (viewPanel && viewPanel.dataset.rendered !== 'true') {
          const idx = parseInt(card.dataset.index ?? card.dataset.vsIndex, 10);
          const item = (currentDetailRecord?.valueStreams || [])[idx];
          if (item) {
            viewPanel.innerHTML = renderValueStreamViewHTML(item);
            viewPanel.dataset.rendered = 'true';
            target = findModificationTarget(positionOrParsed);
          }
        }
      }
    }
  }

  if (target) {
    target.classList.add('modify-target-highlight');
    target.scrollIntoView({ block: 'center', behavior: 'smooth', inline: 'nearest' });
  }
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

/** 从可能包含「阶段:xxx 节点:xxx」的字符串中提取纯阶段名称 */
function extractPureStageName(raw) {
  const s = formatValue(raw);
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

/** 从可能包含「名称 (描述)」的字符串中分离名称与描述 */
function extractStepNameAndDesc(stepObj) {
  const nameRaw = stepObj.name ?? stepObj.title ?? stepObj.step_name ?? stepObj.phase_name ?? stepObj.label ?? stepObj.node_name ?? '';
  const descRaw = stepObj.description ?? stepObj.desc ?? stepObj.content;
  const name = formatValue(nameRaw);
  const desc = formatValue(descRaw);
  if (desc) return { name, desc };
  if (name && /\([^)]+\)$/.test(name)) {
    const m = name.match(/^(.+?)\s*\(([^)]+)\)$/);
    if (m) return { name: m[1].trim(), desc: m[2].trim() };
  }
  return { name, desc: '' };
}

/**
 * 从价值流 JSON 解析出阶段(stages)和环节(steps)结构，用于图形渲染
 * 兼容多种字段名与嵌套结构。阶段标题仅显示阶段名，环节内容显示在环节块中。
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
      if (typeof s === 'string') return { name: extractPureStageName(s), steps: [] };
      const rawSteps = s.steps ?? s.phases ?? s.items ?? s.nodes ?? s.children ?? [];
      const steps = Array.isArray(rawSteps) ? rawSteps : [];
      const rawStageName = s.name ?? s.title ?? s.stage_name ?? s.phase_name ?? s.label ?? s.node_name ?? s.node_label ?? `阶段${i + 1}`;
      const stageName = extractPureStageName(rawStageName);
      return {
        name: stageName,
        steps: steps.map((st, j) => {
          if (typeof st === 'string') return { name: st, desc: '' };
          const { name: stepName, desc: stepDesc } = extractStepNameAndDesc(st);
          return {
            name: stepName || `环节${j + 1}`,
            desc: stepDesc,
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
          <div class="vs-step-node" data-vs-step-name="${escapeHtml(step.name)}">
            <span class="vs-step-name">${escapeHtml(step.name)}</span>
            ${step.desc ? `<span class="vs-step-desc">${escapeHtml(step.desc)}</span>` : ''}
          </div>
          ${ji < stage.steps.length - 1 ? '<div class="vs-arrow-inner" aria-hidden="true">↓</div>' : ''}
        `).join('');

    return `
      <div class="vs-graph-stage" data-stage="${si}" data-vs-stage-name="${escapeHtml(stage.name)}">
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

/** 从 parsed 获取价值流索引 */
function getValueStreamIndexFromParsed(parsed) {
  if (!parsed?.isValueStream) return null;
  if (parsed.valueStreamIndex != null && parsed.valueStreamIndex >= 0) return parsed.valueStreamIndex;
  const vsName = (parsed.valueStreamName || '').trim();
  if (!vsName || !currentDetailRecord) return null;
  const list = currentDetailRecord.valueStreams || [];
  for (let i = 0; i < list.length; i++) {
    const name = formatValue(list[i].name ?? list[i].title ?? list[i].value_stream_name) || '';
    if (name === vsName || name.includes(vsName) || vsName.includes(name)) return i;
  }
  return null;
}

/**
 * 展开并刷新指定价值流卡片的 view 和 json
 */
function expandAndRefreshValueStreamCard(vsIndex) {
  if (!el.detailResult || !currentDetailRecord) return;
  const valueStreams = currentDetailRecord.valueStreams || [];
  const item = valueStreams[vsIndex];
  if (!item) return;
  const card = el.detailResult.querySelector(`.vs-card[data-index="${vsIndex}"]`);
  if (!card) return;
  const header = card.querySelector('.vs-card-header');
  const body = card.querySelector('.vs-card-body');
  const viewPanel = card.querySelector('.vs-tab-panel-view');
  const jsonPanel = card.querySelector('.vs-tab-panel-json');
  body.hidden = false;
  header.setAttribute('aria-expanded', 'true');
  card.classList.add('vs-card-expanded');
  if (viewPanel) {
    viewPanel.innerHTML = renderValueStreamViewHTML(item);
    viewPanel.dataset.rendered = 'true';
  }
  if (jsonPanel) {
    const pre = jsonPanel.querySelector('.vs-json');
    if (pre) pre.textContent = JSON.stringify(item, null, 2);
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

  setupVsJsonEditEvents();
}

function setupVsJsonEditEvents() {
  if (!el.detailResult) return;
  el.detailResult.querySelectorAll('.vs-json-edit-btn').forEach((btn) => {
    btn.addEventListener('click', () => enterVsJsonEditMode(btn.closest('.vs-card')));
  });
  el.detailResult.querySelectorAll('.vs-json-undo-btn').forEach((btn) => {
    btn.addEventListener('click', () => undoVsJsonEdit(btn.closest('.vs-card')));
  });
  el.detailResult.querySelectorAll('.vs-json-save-btn').forEach((btn) => {
    btn.addEventListener('click', () => saveVsJsonEdit(btn.closest('.vs-card')));
  });
  el.detailResult.querySelectorAll('.vs-json-cancel-btn').forEach((btn) => {
    btn.addEventListener('click', () => exitVsJsonEditMode(btn.closest('.vs-card')));
  });
}

const vsJsonEditState = new WeakMap();

function enterVsJsonEditMode(card) {
  if (!card || !currentDetailRecord) return;
  const idx = parseInt(card.dataset.index, 10);
  const item = currentDetailRecord.valueStreams?.[idx];
  if (!item) return;
  const jsonPanel = card.querySelector('.vs-tab-panel-json');
  const pre = jsonPanel?.querySelector('.vs-json');
  const textarea = jsonPanel?.querySelector('.vs-json-edit');
  const editBtn = jsonPanel?.querySelector('.vs-json-edit-btn');
  const editActions = jsonPanel?.querySelector('.vs-json-edit-actions');
  const errorEl = jsonPanel?.querySelector('.vs-json-error');
  if (!pre || !textarea || !editBtn || !editActions) return;
  const content = JSON.stringify(item, null, 2);
  textarea.value = content;
  vsJsonEditState.set(card, { undoStack: [], lastPushed: content });
  if (errorEl) { errorEl.hidden = true; errorEl.textContent = ''; }
  pre.hidden = true;
  textarea.hidden = false;
  editBtn.hidden = true;
  editActions.hidden = false;
  editActions.querySelector('.vs-json-undo-btn').hidden = true;
  textarea.focus();
  let debounceTimer;
  const onInput = () => {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      const state = vsJsonEditState.get(card);
      if (state && state.lastPushed !== textarea.value) {
        state.undoStack.push(state.lastPushed);
        state.lastPushed = textarea.value;
        editActions.querySelector('.vs-json-undo-btn').hidden = state.undoStack.length === 0;
      }
    }, 300);
  };
  textarea.addEventListener('input', onInput);
  textarea._vsJsonCleanup?.();
  textarea._vsJsonCleanup = () => {
    textarea.removeEventListener('input', onInput);
    clearTimeout(debounceTimer);
    delete textarea._vsJsonCleanup;
  };
}

function undoVsJsonEdit(card) {
  const state = vsJsonEditState.get(card);
  const jsonPanel = card?.querySelector('.vs-tab-panel-json');
  const textarea = jsonPanel?.querySelector('.vs-json-edit');
  const errorEl = jsonPanel?.querySelector('.vs-json-error');
  const undoBtn = jsonPanel?.querySelector('.vs-json-undo-btn');
  if (!textarea || !state || state.undoStack.length === 0) return;
  const prev = state.undoStack.pop();
  textarea.value = prev;
  state.lastPushed = prev;
  if (undoBtn) undoBtn.hidden = state.undoStack.length === 0;
  if (errorEl) { errorEl.hidden = true; errorEl.textContent = ''; }
}

function saveVsJsonEdit(card) {
  if (!card || !currentDetailRecord) return;
  const idx = parseInt(card.dataset.index, 10);
  const jsonPanel = card.querySelector('.vs-tab-panel-json');
  const textarea = jsonPanel?.querySelector('.vs-json-edit');
  const errorEl = jsonPanel?.querySelector('.vs-json-error');
  if (!textarea) return;
  let parsed;
  try {
    parsed = JSON.parse(textarea.value);
  } catch (e) {
    if (errorEl) {
      errorEl.hidden = false;
      errorEl.textContent = 'JSON 格式错误：' + (e.message || '无法解析');
    }
    return;
  }
  if (!parsed || typeof parsed !== 'object') {
    if (errorEl) {
      errorEl.hidden = false;
      errorEl.textContent = 'JSON 必须为对象';
    }
    return;
  }
  if (errorEl) { errorEl.hidden = true; errorEl.textContent = ''; }
  textarea._vsJsonCleanup?.();
  vsJsonEditState.delete(card);
  currentDetailRecord.valueStreams[idx] = parsed;
  saveAnalysis(currentDetailRecord);
  const viewPanel = card.querySelector('.vs-tab-panel-view');
  if (viewPanel) {
    viewPanel.innerHTML = renderValueStreamViewHTML(parsed);
    viewPanel.dataset.rendered = 'true';
  }
  const pre = jsonPanel.querySelector('.vs-json');
  pre.textContent = JSON.stringify(parsed, null, 2);
  pre.hidden = false;
  textarea.hidden = true;
  jsonPanel.querySelector('.vs-json-edit-btn').hidden = false;
  jsonPanel.querySelector('.vs-json-edit-actions').hidden = true;
  delete textarea.dataset.undoContent;
}

function exitVsJsonEditMode(card) {
  if (!card || !currentDetailRecord) return;
  const idx = parseInt(card.dataset.index, 10);
  const item = currentDetailRecord.valueStreams?.[idx];
  if (!item) return;
  const jsonPanel = card.querySelector('.vs-tab-panel-json');
  const pre = jsonPanel?.querySelector('.vs-json');
  const textarea = jsonPanel?.querySelector('.vs-json-edit');
  const errorEl = jsonPanel?.querySelector('.vs-json-error');
  if (!pre || !textarea) return;
  textarea._vsJsonCleanup?.();
  vsJsonEditState.delete(card);
  pre.textContent = JSON.stringify(item, null, 2);
  pre.hidden = false;
  textarea.hidden = true;
  if (errorEl) { errorEl.hidden = true; errorEl.textContent = ''; }
  jsonPanel.querySelector('.vs-json-edit-btn').hidden = false;
  jsonPanel.querySelector('.vs-json-edit-actions').hidden = true;
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
          <div class="vs-card" data-index="${i}" data-vs-index="${i}" data-vs-name="${escapeHtml(name)}">
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
                <div class="vs-json-toolbar">
                  <button type="button" class="vs-json-edit-btn">编辑</button>
                  <div class="vs-json-edit-actions" hidden>
                    <button type="button" class="vs-json-undo-btn">撤回</button>
                    <button type="button" class="vs-json-save-btn">保存</button>
                    <button type="button" class="vs-json-cancel-btn">取消</button>
                  </div>
                </div>
                <pre class="vs-json">${escapeHtml(jsonStr)}</pre>
                <textarea class="vs-json-edit" hidden spellcheck="false"></textarea>
                <p class="vs-json-error" hidden></p>
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

function buildModificationBlockRows(parsed) {
  if (parsed.isValueStream) {
    const opLabel = parsed.operation === 'addstage' ? '新增阶段' : parsed.operation === 'addstep' ? '新增环节' : '修改节点';
    return `
      <div class="chat-modification-row">
        <span class="chat-modification-label">操作类型</span>
        <span class="chat-modification-value">${escapeHtml(opLabel)}</span>
      </div>
      <div class="chat-modification-row">
        <span class="chat-modification-label">需要修改的价值流</span>
        <span class="chat-modification-value">${escapeHtml(parsed.valueStreamName || '—')}</span>
      </div>
      <div class="chat-modification-row">
        <span class="chat-modification-label">${parsed.operation === 'addstep' ? '所属阶段' : parsed.operation === 'addstage' ? '插入位置（前一阶段名）' : '需要修改的节点名称'}</span>
        <span class="chat-modification-value">${escapeHtml(parsed.nodeName || '—')}</span>
      </div>
      <div class="chat-modification-row">
        <span class="chat-modification-label">修改意见</span>
        <span class="chat-modification-value">${escapeHtml(parsed.modification)}</span>
      </div>
      <div class="chat-modification-row">
        <span class="chat-modification-label">修改原因</span>
        <span class="chat-modification-value">${escapeHtml(parsed.reason)}</span>
      </div>`;
  }
  return `
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
      </div>`;
}

function appendModificationBlock(container, parsed, timeStr, onConfirm, onCancel, onRetry) {
  const block = document.createElement('div');
  block.className = 'chat-message chat-message-assistant chat-message-modification';
  block.innerHTML = `
    <div class="chat-modification-body">
      ${buildModificationBlockRows(parsed)}
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

/**
 * 将新的价值流修改内容整合到当前任务中。若新内容与旧内容有冲突，则以新内容为准。
 * 仅当当前任务为价值流修改时使用。
 */
function mergeValueStreamModification(currentParsed, newParsed) {
  if (!currentParsed?.isValueStream) return newParsed || currentParsed;
  if (!newParsed) return currentParsed;
  return {
    ...currentParsed,
    ...newParsed,
    isValueStream: true,
    operation: (newParsed.operation || currentParsed.operation || 'update').toLowerCase(),
    valueStreamName: (newParsed.valueStreamName || currentParsed.valueStreamName || '').trim() || currentParsed.valueStreamName,
    nodeName: (newParsed.nodeName || currentParsed.nodeName || '').trim() || currentParsed.nodeName,
    insertAfterStepName: (newParsed.insertAfterStepName ?? currentParsed.insertAfterStepName ?? '').trim() || currentParsed.insertAfterStepName,
    valueStreamIndex: newParsed.valueStreamIndex ?? currentParsed.valueStreamIndex,
    modification: newParsed.modification ?? currentParsed.modification,
    reason: newParsed.reason ?? currentParsed.reason,
    newValue: newParsed.newValue ?? currentParsed.newValue,
    position: newParsed.position || currentParsed.position,
    positionKey: newParsed.positionKey || currentParsed.positionKey || currentParsed.position,
  };
}

/** 就地更新修改块内容（用于同一任务内的修订） */
function updateModificationBlockContent(block, parsed) {
  if (!block || !parsed) return;
  const body = block.querySelector('.chat-modification-body');
  if (!body) return;
  const rows = body.querySelectorAll('.chat-modification-row');
  if (parsed.isValueStream && rows.length >= 5) {
    const opLabel = parsed.operation === 'addstage' ? '新增阶段' : parsed.operation === 'addstep' ? '新增环节' : '修改节点';
    const nodeLabel = parsed.operation === 'addstep' ? '所属阶段' : parsed.operation === 'addstage' ? '插入位置（前一阶段名）' : '需要修改的节点名称';
    rows[0].querySelector('.chat-modification-label').textContent = '操作类型';
    rows[0].querySelector('.chat-modification-value').textContent = opLabel;
    rows[1].querySelector('.chat-modification-value').textContent = parsed.valueStreamName || '—';
    rows[2].querySelector('.chat-modification-label').textContent = nodeLabel;
    rows[2].querySelector('.chat-modification-value').textContent = parsed.nodeName || '—';
    rows[3].querySelector('.chat-modification-value').textContent = parsed.modification || '—';
    rows[4].querySelector('.chat-modification-value').textContent = parsed.reason || '—';
  } else if (parsed.isValueStream && rows.length >= 4) {
    rows[0].querySelector('.chat-modification-value').textContent = parsed.valueStreamName || '—';
    rows[1].querySelector('.chat-modification-value').textContent = parsed.nodeName || '—';
    rows[2].querySelector('.chat-modification-value').textContent = parsed.modification || '—';
    rows[3].querySelector('.chat-modification-value').textContent = parsed.reason || '—';
  } else if (rows.length >= 3) {
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
      ${buildModificationBlockRows(parsed)}
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
  const pendingVs = currentModificationTask?.parsed?.isValueStream
    ? `\n【重要】当前有一条未确认的价值流修改建议（${currentModificationTask.parsed.valueStreamName || ''} - ${currentModificationTask.parsed.nodeName || ''}）。用户发送的新内容应视为对该修改的补充，请将新内容整合到同一条修改建议中，若有冲突则以新内容为准，仍使用格式 B 回复。\n`
    : '';
  const systemContent = `你是企业信息与商业画布修改助手。当前用户正在查看「${currentDetailCompanyName || '某企业'}」的详情页。
${pendingVs}
【任务】当用户提出修改需求时，你需要：
1. 分析下方「当前页面详情结构」，判断用户要修改的是哪个位置的内容；
2. 提炼出：修改位置、修改意见（具体的修改点的总结）、修改原因、修改后的完整内容；
3. 用以下 JSON 格式回复（不要包含其他说明文字）：

当修改涉及【基本信息】或【商业画布】时，使用格式 A：
\`\`\`json
{
  "position": "精确的字段标签，如：客户细分、价值主张、企业名称 等",
  "modification": "具体的修改点的总结",
  "reason": "修改原因说明",
  "newValue": "修改后的完整新内容（必填）"
}
\`\`\`

当修改涉及【价值流】时，使用格式 B。必须根据操作类型填写 operation：
- update：修改现有节点/环节的内容，nodeName 为要修改的节点名称，newValue 为修改后的内容
- addStage：新增阶段节点，nodeName 为插入位置之前的阶段名（为空则追加到末尾），newValue 为新阶段名称
- addStep：在某个阶段内新增环节，nodeName 为所属阶段名称，newValue 为新环节名称（可含描述，用换行分隔）。若需在指定环节后插入，需填写 insertAfterStepName（前一环节名称））

\`\`\`json
{
  "isValueStream": true,
  "operation": "update|addStage|addStep",
  "valueStreamName": "需要修改的价值流名称（与页面中价值流名称一致）",
  "nodeName": "见上方各 operation 说明",
  "insertAfterStepName": "（仅 addStep 且需指定插入位置时）前一环节名称，如：审核方案",
  "position": "价值流-节点（如：xxx价值流-xxx阶段/环节）",
  "modification": "具体的修改意见",
  "reason": "修改原因说明",
  "newValue": "修改后的完整新内容 或 新增节点/环节的名称（必填）"
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
    scrollToTargetAndHighlight(parsed);
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
        if (appliedParsed.isValueStream) {
          const vsIdx = getValueStreamIndexFromParsed(appliedParsed);
          if (vsIdx != null) {
            requestAnimationFrame(() => {
              expandAndRefreshValueStreamCard(vsIdx);
              el.detailResult?.querySelector(`.vs-card[data-index="${vsIdx}"]`)?.scrollIntoView({ block: 'center', behavior: 'smooth' });
            });
          }
        }
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
    const currentParsed = currentModificationTask.parsed;
    const newParsed = parseModificationResponse(assistantContent);

    if (currentParsed.isValueStream) {
      const merged = mergeValueStreamModification(currentParsed, newParsed);
      const oldBlock = currentModificationTask.block;
      oldBlock.remove();
      const timeStr = formatChatTime(assistantMsg.timestamp);
      appendModificationBlock(messages, merged, timeStr, () => {
        clearModificationHighlight();
        const appliedParsed = currentModificationTask?.parsed || merged;
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
          const vsIdx = getValueStreamIndexFromParsed(appliedParsed);
          if (vsIdx != null) {
            requestAnimationFrame(() => {
              expandAndRefreshValueStreamCard(vsIdx);
              el.detailResult?.querySelector(`.vs-card[data-index="${vsIdx}"]`)?.scrollIntoView({ block: 'center', behavior: 'smooth' });
            });
          }
        }
      }, (modBlock) => {
        clearModificationHighlight();
        cancelModification(messages, modBlock);
      }, (retryBlock) => retryModification(messages, retryBlock));
      scrollToTargetAndHighlight(merged);
      messages.scrollTop = messages.scrollHeight;
      saveChatToRecord();
    } else if (newParsed && isSameModificationPosition(newParsed, currentParsed)) {
      currentModificationTask.parsed = newParsed;
      updateModificationBlockContent(currentModificationTask.block, newParsed);
      scrollToTargetAndHighlight(newParsed);
      saveChatToRecord();
    } else {
      chatHistory.pop();
      const currentPosition = currentParsed.position;
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
