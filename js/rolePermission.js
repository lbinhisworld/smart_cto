/**
 * 角色与权限模型推演：session 生成、单环节 LLM 调用、解析、渲染
 * 依赖：global.parseValueStreamGraph (valueStream.js)、global.fetchDeepSeekChat (api.js)、
 *       global.escapeHtml、global.renderMarkdown (utils.js)
 */
(function(global) {
  const parseValueStreamGraph = global.parseValueStreamGraph;
  const fetchDeepSeekChat = global.fetchDeepSeekChat;
  const escapeHtml = global.escapeHtml;
  const renderMarkdown = global.renderMarkdown;

  const ROLE_PERMISSION_LOG = false;

  /** 根据价值流生成角色与权限模型推演 session（不调用大模型），用于逐步按环节分析 */
  function generateRolePermissionSessions(valueStream) {
    const { stages } = parseValueStreamGraph(valueStream || {});
    let stepIndex = 0;
    const sessions = [];
    for (const stage of stages) {
      const stageName = stage?.name || '';
      for (const step of stage.steps || []) {
        const stepName = step?.name || `环节${stepIndex + 1}`;
        sessions.push({ stepName, stepIndex, stageName, rolePermissionJson: null });
        stepIndex += 1;
      }
    }
    return sessions;
  }

  /** 针对单个环节调用大模型进行角色与权限推演 */
  async function generateRolePermissionForStep(stepName, stageName, valueStream, globalItGap, localItGap, projectName) {
    const vsmJson = JSON.stringify(valueStream, null, 2);
    const globalItGapJson = globalItGap != null ? JSON.stringify(globalItGap, null, 2) : '';
    const localItGapJson = Array.isArray(localItGap) && localItGap.length > 0 ? JSON.stringify(localItGap, null, 2) : '';
    const systemPrompt = `Role & Context:
我是一名软件公司的需求分析专家。请针对价值流中的**单一环节**进行角色与权限模型（RBAC）推演。

Task Goal:
针对环节「${stepName}」所在的阶段「${stageName}」，输出该环节的角色与权限推演结果（单个 JSON 对象）。

Requirement: 角色画像模拟、现状转换映射、痛点闭环设计、合规与风控（SoD）。

Output Format: 直接输出一个 JSON 对象，不要数组，不要 markdown 代码块。结构必须包含：
{
  "stage_name": "阶段名称",
  "step_id": "环节序号",
  "step_name": "环节名称",
  "it_gap_reference": "关联的 IT 现状与痛点简述",
  "roles": [{"role_name":"","legacy_operation":"","new_it_permissions":{},"pain_point_solution":{},"trigger_logic":""}],
  "sod_warning": "职责分离建议或 null"
}`;
    const userParts = [
      `项目：${projectName}。针对环节「${stepName}」进行角色与权限推演。`,
      '【端到端全流程】', vsmJson,
    ];
    if (globalItGapJson) userParts.push('【全局 ITGap 分析】', globalItGapJson);
    if (localItGapJson) userParts.push('【局部 ITGap 分析】', localItGapJson);
    userParts.push('\n请直接输出该环节的 JSON 对象，不要 markdown 代码块或说明文字。');
    const userPrompt = userParts.join('\n\n');
    return fetchDeepSeekChat([
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ]);
  }

  function parseRolePermissionModel(markdown) {
    if (!markdown || typeof markdown !== 'string') return [];
    let raw = markdown.trim().replace(/^\uFEFF/, '');
    if (ROLE_PERMISSION_LOG) console.log('[角色与权限] parseRolePermissionModel: 输入长度=', raw.length, '前80字=', raw.slice(0, 80));
    let parsed = null;
    try {
      parsed = JSON.parse(raw);
    } catch (e1) {
      if (ROLE_PERMISSION_LOG) console.log('[角色与权限] parseRolePermissionModel: JSON.parse(raw) 失败:', e1 && e1.message);
      const codeBlock = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (codeBlock) {
        try {
          parsed = JSON.parse(codeBlock[1].trim());
        } catch (_2) {}
      }
      if (!Array.isArray(parsed)) {
        const start = raw.indexOf('[');
        if (start >= 0) {
          let depth = 0;
          let end = -1;
          let i = start;
          while (i < raw.length) {
            const c = raw[i];
            if (c === '"') {
              i += 1;
              while (i < raw.length) {
                if (raw[i] === '\\') i += 2;
                else if (raw[i] === '"') { i += 1; break; }
                else i += 1;
              }
              continue;
            }
            if (c === '[') { depth += 1; i += 1; continue; }
            if (c === ']') {
              depth -= 1;
              if (depth === 0) { end = i; break; }
              i += 1;
              continue;
            }
            i += 1;
          }
          if (end > start) {
            try {
              parsed = JSON.parse(raw.slice(start, end + 1));
            } catch (_3) {
              if (ROLE_PERMISSION_LOG) console.log('[角色与权限] parseRolePermissionModel: 括号截取后仍解析失败, 长度=', end - start + 1);
            }
          }
        }
      }
    }
    if (Array.isArray(parsed) && parsed.length > 0) {
      const first = parsed[0];
      if (first && typeof first === 'object') {
        const hasRoles = Array.isArray(first.roles);
        const hasStep = 'step_name' in first || 'step_id' in first;
        const hasStage = 'stage_name' in first || 'stage_id' in first;
        if (hasRoles && (hasStep || hasStage)) {
          if (ROLE_PERMISSION_LOG) console.log('[角色与权限] parseRolePermissionModel: 解析成功(新格式), 条数=', parsed.length, '首条keys=', Object.keys(first || {}));
          return parsed;
        }
        if (hasStep || hasStage) {
          if (ROLE_PERMISSION_LOG) console.log('[角色与权限] parseRolePermissionModel: 解析成功(按环节), 条数=', parsed.length);
          return parsed;
        }
      }
    }
    if (ROLE_PERMISSION_LOG) console.log('[角色与权限] parseRolePermissionModel: 未识别为新格式数组, 尝试表格解析, parsed=', Array.isArray(parsed) ? 'length=' + parsed.length : parsed);
    const lines = markdown.split(/\r?\n/).map((l) => l.trim());
    const tableLines = lines.filter((l) => l.includes('|'));
    if (tableLines.length < 2) return [];
    const headerLine = tableLines[0];
    const headerCells = headerLine
      .split('|')
      .map((c) => c.trim())
      .filter((c) => c);
    const idxNode = headerCells.findIndex((c) => c.includes('节点'));
    const idxRole = headerCells.findIndex((c) => c.includes('建议角色'));
    const idxDuty = headerCells.findIndex((c) => c.includes('核心职责'));
    const idxPerm = headerCells.findIndex((c) => c.includes('权限'));
    const rows = [];
    for (let i = 2; i < tableLines.length; i++) {
      const line = tableLines[i];
      if (!line || !line.includes('|')) continue;
      const cells = line
        .split('|')
        .map((c) => c.trim())
        .filter((c) => c);
      if (cells.length < 2) continue;
      const getCell = (idx) => (idx >= 0 && idx < cells.length ? cells[idx] : '');
      const nodeName = getCell(idxNode >= 0 ? idxNode : 0);
      if (!nodeName) continue;
      const roleText = getCell(idxRole >= 0 ? idxRole : 1);
      const dutyText = getCell(idxDuty >= 0 ? idxDuty : 2);
      const permText = getCell(idxPerm >= 0 ? idxPerm : 3);
      const roles = { executor: '', approver: '', informer: '' };
      if (roleText) {
        const execMatch = roleText.match(/执行者[:：]([^；;]+)/);
        const apprMatch = roleText.match(/审批者[:：]([^；;]+)/);
        const infoMatch = roleText.match(/知情者[:：]([^；;]+)/);
        roles.executor = execMatch ? execMatch[1].trim() : '';
        roles.approver = apprMatch ? apprMatch[1].trim() : '';
        roles.informer = infoMatch ? infoMatch[1].trim() : '';
      }
      const perms = { wechat: '', lowcode: '', notify: '', query: '' };
      if (permText) {
        const wechatMatch = permText.match(/企微端[:：]([^；;]+)/);
        const lowcodeMatch = permText.match(/低代码[:：]([^；;]+)/);
        const notifyMatch = permText.match(/接收通知[:：]([^；;]+)/);
        const queryMatch = permText.match(/查询数据[:：]([^；;]+)/);
        perms.wechat = wechatMatch ? wechatMatch[1].trim() : '';
        perms.lowcode = lowcodeMatch ? lowcodeMatch[1].trim() : '';
        perms.notify = notifyMatch ? notifyMatch[1].trim() : '';
        perms.query = queryMatch ? queryMatch[1].trim() : '';
      }
      rows.push({
        node: nodeName,
        roles,
        duty: dutyText,
        perms,
      });
    }
    return rows;
  }

  /** 将角色字段渲染为 HTML：字符串用 markdown，对象用 JSON pre */
  function formatRolePermissionField(val) {
    if (val == null || (typeof val === 'string' && !val.trim())) return '<span class="problem-detail-role-permission-empty">—</span>';
    if (typeof val === 'string') return `<div class="problem-detail-role-permission-field-content markdown-body">${renderMarkdown(val.trim())}</div>`;
    if (typeof val === 'object') return `<pre class="problem-detail-role-permission-field-pre">${escapeHtml(JSON.stringify(val, null, 2))}</pre>`;
    return escapeHtml(String(val));
  }

  /** 将 new_it_permissions 渲染为 数据权限、功能实用、系统操作 三个子卡片 */
  function buildNewPermissionsSubcardsHtml(obj) {
    if (!obj || typeof obj !== 'object') return '<span class="problem-detail-role-permission-empty">—</span>';
    const labels = { data_access: '数据权限', function_use: '功能实用', system_operation: '系统操作' };
    const keys = ['data_access', 'function_use', 'system_operation'];
    const cards = keys.map((key) => {
      const val = obj[key];
      if (val == null && !(key in obj)) return '';
      const label = labels[key] || key;
      let content = '';
      if (val == null) content = '<span class="problem-detail-role-permission-empty">—</span>';
      else if (Array.isArray(val)) content = val.length ? `<ul class="problem-detail-role-permission-list">${val.map((v) => `<li class="problem-detail-role-permission-list-item">${escapeHtml(String(v))}</li>`).join('')}</ul>` : '<span class="problem-detail-role-permission-empty">—</span>';
      else if (typeof val === 'string') content = `<div class="problem-detail-role-permission-field-content markdown-body">${renderMarkdown(val.trim() || '—')}</div>`;
      else content = `<pre class="problem-detail-role-permission-field-pre">${escapeHtml(JSON.stringify(val, null, 2))}</pre>`;
      return `<div class="problem-detail-role-permission-inner-card"><div class="problem-detail-role-permission-inner-card-title">${escapeHtml(label)}</div><div class="problem-detail-role-permission-inner-card-body">${content}</div></div>`;
    }).filter(Boolean).join('');
    if (!cards) return '<span class="problem-detail-role-permission-empty">—</span>';
    return `<div class="problem-detail-role-permission-inner-cards">${cards}</div>`;
  }

  const PAIN_POINT_SOLUTION_LABELS = {
    eliminate_manual_collection: '消除人工采集',
    real_time_data_fusion: '实时数据融合',
    'real-time_data_fusion': '实时数据融合',
    predictive_analysis_support: '预测分析支持',
    automated_alerting: '自动化预警',
    centralized_knowledge_asset: '集中化知识资产',
    immediate_market_reference: '即时市场参考',
    proactive_risk_awareness: '主动风险感知',
    data_driven_decision: '数据驱动决策',
    strategic_insight: '战略洞察',
    real_time_visibility: '实时可视',
    workflow_automation: '流程自动化',
    decision_support: '决策支持',
    knowledge_management: '知识管理',
    collaboration_improvement: '协作改善',
    'data-driven_decision': '数据驱动决策',
    immediate_response: '即时响应',
    accuracy_guarantee: '准确性保障',
    mobile_support: '移动端支持',
    inventory_reservation: '库存预留',
    reduce_interruption: '减少打断',
    improve_accuracy: '提升准确性',
    enhanced_visibility: '增强可见性',
    standardized_pricing: '标准化定价',
    audit_trail: '审计追踪',
  };

  function formatKeyToEnglishTitle(key) {
    if (!key || typeof key !== 'string') return '';
    return key.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
  }

  function buildPainPointSolutionSubcardsHtml(obj) {
    if (!obj || typeof obj !== 'object') return '<span class="problem-detail-role-permission-empty">—</span>';
    const entries = Object.entries(obj);
    if (!entries.length) return '<span class="problem-detail-role-permission-empty">—</span>';
    const cards = entries.map(([key, val], i) => {
      const labelZh = PAIN_POINT_SOLUTION_LABELS[key] || (key ? `解决方案 ${i + 1}` : '—');
      const labelEn = formatKeyToEnglishTitle(key) || '—';
      const content = val == null || (typeof val === 'string' && !val.trim())
        ? '<span class="problem-detail-role-permission-empty">—</span>'
        : (typeof val === 'string'
          ? `<div class="problem-detail-role-permission-field-content markdown-body">${renderMarkdown(val.trim())}</div>`
          : `<pre class="problem-detail-role-permission-field-pre">${escapeHtml(JSON.stringify(val, null, 2))}</pre>`);
      const titleHtml = `<div class="problem-detail-role-permission-inner-card-title"><span class="problem-detail-role-permission-title-zh">${escapeHtml(labelZh)}</span><span class="problem-detail-role-permission-title-en">${escapeHtml(labelEn)}</span></div>`;
      return `<div class="problem-detail-role-permission-inner-card">${titleHtml}<div class="problem-detail-role-permission-inner-card-body">${content}</div></div>`;
    }).join('');
    return `<div class="problem-detail-role-permission-inner-cards">${cards}</div>`;
  }

  function buildRolePermissionStepViewHtml(match) {
    if (!match || typeof match !== 'object') return '';
    const roles = Array.isArray(match.roles) ? match.roles : [];
    if (roles.length === 0) return '<div class="problem-detail-role-permission-placeholder">该环节暂无角色数据</div>';
    const roleCards = roles.map((r) => {
      if (!r || typeof r !== 'object') return '';
      const roleName = r.role_name ?? r.roleName ?? '未命名角色';
      const legacyOp = formatRolePermissionField(r.legacy_operation ?? r.legacyOperation);
      const newPerms = buildNewPermissionsSubcardsHtml(r.new_it_permissions ?? r.newItPermissions ?? r.new_it_permission);
      const painSolution = buildPainPointSolutionSubcardsHtml(r.pain_point_solution ?? r.painPointSolution ?? r.pain_point_solutions);
      const triggerLogic = r.trigger_logic ?? r.triggerLogic;
      const triggerHtml = triggerLogic != null && String(triggerLogic).trim() ? `<div class="problem-detail-role-card-section"><div class="problem-detail-role-card-section-title">触发逻辑</div>${formatRolePermissionField(triggerLogic)}</div>` : '';
      return `
    <div class="problem-detail-role-card">
      <div class="problem-detail-role-card-header problem-detail-role-card-header-collapsed" tabindex="0" role="button" aria-expanded="false">
        <span class="problem-detail-role-card-header-icon" aria-hidden="true">👤</span>
        <span class="problem-detail-role-card-header-title">${escapeHtml(roleName)}</span>
        <span class="problem-detail-role-card-header-arrow">▾</span>
      </div>
      <div class="problem-detail-role-card-body" hidden>
      <div class="problem-detail-role-card-sections">
        <div class="problem-detail-role-card-section"><div class="problem-detail-role-card-section-title">过去操作</div>${legacyOp}</div>
        <div class="problem-detail-role-card-section"><div class="problem-detail-role-card-section-title">新的权限</div>${newPerms}</div>
        <div class="problem-detail-role-card-section"><div class="problem-detail-role-card-section-title">痛点解决方案</div>${painSolution}</div>
        ${triggerHtml}
      </div>
      </div>
    </div>`;
    }).filter(Boolean).join('');
    return `<div class="problem-detail-role-permission-view-roles">${roleCards}</div>`;
  }

  function buildRolePermissionNodeCardsHtml(model) {
    if (!Array.isArray(model) || model.length === 0) return '';
    const isNewFormat = model[0] && typeof model[0] === 'object' && Array.isArray(model[0].roles) && (model[0].step_name != null || model[0].step_id != null || model[0].stage_name != null || model[0].stage_id != null);
    if (isNewFormat) {
      return `<div class="problem-detail-role-permission-step-list">
      <div class="problem-detail-role-permission-list-title">环节列表</div>${model
      .map((item) => {
        const stepName = item.stage_name != null && item.step_name != null
          ? `${item.stage_name} － ${item.step_name}`
          : (item.step_name || item.stage_name || [item.step_id, item.stage_id].filter(Boolean).join(' ') || '环节');
        const viewHtml = buildRolePermissionStepViewHtml(item);
        const jsonStr = JSON.stringify(item, null, 2);
        return `
      <div class="problem-detail-card problem-detail-card-role-permission">
        <div class="problem-detail-card-header problem-detail-card-header-collapsed" tabindex="0" role="button" aria-expanded="false">
          <span class="problem-detail-card-header-title">${escapeHtml(stepName)}</span>
          <span class="problem-detail-card-header-arrow">▾</span>
        </div>
        <div class="problem-detail-card-body" hidden>
          <div class="problem-detail-role-permission-tabs">
            <span class="problem-detail-role-permission-tabs-title">角色与权限模型推演</span>
            <button type="button" class="problem-detail-role-permission-tab problem-detail-role-permission-tab-active" data-tab="view">view</button>
            <button type="button" class="problem-detail-role-permission-tab" data-tab="json">json</button>
          </div>
          <div class="problem-detail-role-permission-panel problem-detail-role-permission-panel-view" data-panel="view">${viewHtml}</div>
          <div class="problem-detail-role-permission-panel problem-detail-role-permission-panel-json" data-panel="json" hidden><pre class="problem-detail-role-permission-json">${escapeHtml(jsonStr)}</pre></div>
        </div>
      </div>`;
      })
      .join('')}</div>`;
    }
    return model
      .map((m) => {
        const nodeName = m.node || '';
        if (!nodeName) return '';
        const roles = m.roles || { executor: '', approver: '', informer: '' };
        const perms = m.perms || { wechat: '', lowcode: '', notify: '', query: '' };
        const duty = m.duty || '';
        return `
      <div class="problem-detail-card problem-detail-card-role-permission">
        <div class="problem-detail-card-header" tabindex="0" role="button" aria-expanded="false">
          <span class="problem-detail-card-header-title">环节：${escapeHtml(nodeName)}</span>
        </div>
        <div class="problem-detail-card-body" hidden>
          <div class="problem-detail-role-permission-grid">
            <div class="problem-detail-role-permission-subcard">
              <div class="problem-detail-role-permission-subtitle">环节名称</div>
              <div class="problem-detail-role-permission-text">${escapeHtml(nodeName)}</div>
            </div>
            <div class="problem-detail-role-permission-subcard">
              <div class="problem-detail-role-permission-subtitle">角色设计</div>
              <div class="problem-detail-role-permission-text">
                <div>执行者：${escapeHtml(roles.executor || '—')}</div>
                <div>审批者：${escapeHtml(roles.approver || '—')}</div>
                <div>知情者：${escapeHtml(roles.informer || '—')}</div>
              </div>
            </div>
            <div class="problem-detail-role-permission-subcard">
              <div class="problem-detail-role-permission-subtitle">企微端</div>
              <div class="problem-detail-role-permission-text">${escapeHtml(perms.wechat || '—')}</div>
            </div>
            <div class="problem-detail-role-permission-subcard">
              <div class="problem-detail-role-permission-subtitle">低代码</div>
              <div class="problem-detail-role-permission-text">${escapeHtml(perms.lowcode || '—')}</div>
            </div>
            <div class="problem-detail-role-permission-subcard">
              <div class="problem-detail-role-permission-subtitle">接收通知</div>
              <div class="problem-detail-role-permission-text">${escapeHtml(perms.notify || '—')}</div>
            </div>
            <div class="problem-detail-role-permission-subcard">
              <div class="problem-detail-role-permission-subtitle">查询数据</div>
              <div class="problem-detail-role-permission-text">${escapeHtml(perms.query || '—')}</div>
            </div>
          </div>
          ${
            duty
              ? `<div class="problem-detail-role-permission-duty"><span class="problem-detail-role-permission-subtitle">核心职责</span><div class="problem-detail-role-permission-text">${escapeHtml(
                  duty
                )}</div></div>`
              : ''
          }
        </div>
      </div>`;
      })
      .join('');
  }

  if (typeof global !== 'undefined') {
    global.generateRolePermissionSessions = generateRolePermissionSessions;
    global.generateRolePermissionForStep = generateRolePermissionForStep;
    global.parseRolePermissionModel = parseRolePermissionModel;
    global.buildRolePermissionNodeCardsHtml = buildRolePermissionNodeCardsHtml;
    global.buildRolePermissionStepViewHtml = buildRolePermissionStepViewHtml;
  }
})(typeof window !== 'undefined' ? window : this);
