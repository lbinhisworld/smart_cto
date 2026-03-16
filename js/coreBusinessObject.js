/**
 * 核心业务对象推演：session 生成、单环节 LLM 调用、解析、渲染及任务确认交互逻辑
 * 任务目标：定义流程中流转的数字化实体（如订单、合同、任务单），为低代码数据库建模提供底层逻辑结构。
 * 依赖：global.parseValueStreamGraph (valueStream.js)、global.fetchDeepSeekChat (api.js)、
 *       global.escapeHtml、global.renderMarkdown (utils.js)、global.parseRolePermissionModel (rolePermission.js)
 */
(function(global) {
  const parseValueStreamGraph = global.parseValueStreamGraph;
  const fetchDeepSeekChat = global.fetchDeepSeekChat;
  const escapeHtml = global.escapeHtml;
  const renderMarkdown = global.renderMarkdown;
  const parseRolePermissionModel = global.parseRolePermissionModel;

  const CORE_BUSINESS_OBJECT_LOG = false;
  const CORE_BUSINESS_OBJECT_TASK_ID = 'task11';
  const CORE_BUSINESS_OBJECT_NEED_VALUE_STREAM_MSG = '核心业务对象推演需要完整的价值流图，请先在工作流对齐阶段完成价值流图绘制。';

  /** 根据价值流生成核心业务对象推演 session（不调用大模型），用于逐步按环节分析 */
  function generateCoreBusinessObjectSessions(valueStream) {
    const { stages } = parseValueStreamGraph(valueStream || {});
    let stepIndex = 0;
    const sessions = [];
    for (const stage of stages) {
      const stageName = stage?.name || '';
      for (const step of stage.steps || []) {
        const stepName = step?.name || `环节${stepIndex + 1}`;
        sessions.push({ stepName, stepIndex, stageName, coreBusinessObjectJson: null });
        stepIndex += 1;
      }
    }
    return sessions;
  }

  /** 使用严格提示词（沟通历史四类上下文 + 主/事务/状态数据 + 状态机 + 关系图谱）针对单环节调用大模型，返回该环节的 JSON */
  async function generateCoreBusinessObjectForStepWithStrictPrompt(stepName, stageName, stepIndex, valueStreamJson, globalItGapJson, localItGapJson, rolePermissionJson) {
    const systemPrompt = `Role & Context:
我是一名需求分析专家。我已完成前期的全局 IT Gap 分析、局部节点 IT Gap 分析以及角色权限模型模拟。现在，我需要进行核心业务对象（Business Object）推演，为后续的全局 IT 架构设计提供底层数据模型支撑。

Input Data (上下文参考):
（1）沟通历史上下文：价值流设计 json
（2）沟通历史上下文：全局 IT Gap 分析json
（3）沟通历史上下文：局部 ITGap 分析 json
（4）沟通历史上下文：角色与权限模型推演 json

Task Goal:
请基于以上输入，推导并定义出支撑各环节运行的核心业务对象。 特别注意： 一个环节可能涉及多个对象（如：新生成的单据、被引用的主数据、随附的逻辑记录）。请务必拆解出所有原子化对象，并确保它们能解决标注的 IT Gap。

Core Requirement Details:
（1）对象分类： 明确识别主数据 (Master Data)、事务数据/单据 (Transaction Data) 及状态数据。
（2）属性对冲设计： 针对"数据不可追溯"、"信息不透明"等 Gap，在对象中强制设计关联字段（如 Trace_ID、Version_Tag）。
（3）状态机建模： 结合权限模型，详细定义对象在各环节的状态转移逻辑。
（4）关系图谱： 明确对象间的父子关系、引用关系（1:N / M:N）。

Output Format (Strict JSON):
请直接输出 JSON 数据，结构定义如下。针对**当前环节**仅输出一个元素的数组：
[
  {
    "stage_name": "关联的价值流环节",
    "local_gap_resolved": "该环节局部 IT Gap 的具体解决思路",
    "business_objects": [
      {
        "object_name": "业务对象名称",
        "object_role": "环节主产出 / 关联引用 / 过程记录",
        "is_newly_created": "boolean (该环节是创建它，还是仅更新引用它)",
        "category": "MasterData / TransactionData / ConfigData",
        "is_global_shared": "boolean (是否为全局共享的主数据)",
        "key_attributes": [
          {"field": "字段名", "purpose": "设计意图：对应解决哪个 Gap 或业务需求"}
        ],
        "lifecycle_machine": [
          {
            "trigger_role": "Step 1 中的哪个角色触发",
            "action": "动作名称",
            "state_from": "起始状态",
            "state_to": "目标状态"
          }
        ],
        "associations": [
          {"target_object": "关联的对象", "relation_type": "1:N / M:N", "description": "关联逻辑"}
        ],
        "global_integration_note": "在全局架构中，该对象如何解决系统间数据孤岛问题"
      }
    ],
    "multi_object_interaction": "描述本环节内多个业务对象（如有）是如何协同工作的逻辑"
  }
]`;

    const userParts = [
      '【沟通历史上下文：价值流设计 json】',
      valueStreamJson || '{}',
      '【沟通历史上下文：全局 IT Gap 分析 json】',
      globalItGapJson || '{}',
      '【沟通历史上下文：局部 ITGap 分析 json】',
      localItGapJson || '[]',
      '【沟通历史上下文：角色与权限模型推演 json】',
      rolePermissionJson || '[]',
      '',
      `当前环节：阶段「${stageName}」，环节「${stepName}」（stepIndex: ${stepIndex}）。请仅输出该环节的一个 JSON 数组元素（即上述格式的数组且仅含一个对象），不要 markdown 代码块或说明文字。`,
    ];
    const userPrompt = userParts.join('\n\n');
    return fetchDeepSeekChat([
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ]);
  }

  /** 针对单个环节调用大模型进行核心业务对象推演 */
  async function generateCoreBusinessObjectForStep(stepName, stageName, valueStream, globalItGap, localItGap, projectName) {
    const vsmJson = JSON.stringify(valueStream, null, 2);
    const globalItGapJson = globalItGap != null ? JSON.stringify(globalItGap, null, 2) : '';
    const localItGapJson = Array.isArray(localItGap) && localItGap.length > 0 ? JSON.stringify(localItGap, null, 2) : '';
    const systemPrompt = `Role & Context:
我是一名软件公司的需求分析专家。请针对价值流中的**单一环节**进行核心业务对象（数字化实体）推演，为低代码数据库建模提供底层逻辑结构。

Task Goal:
针对环节「${stepName}」所在的阶段「${stageName}」，输出该环节涉及或产生的核心业务对象（单个 JSON 对象）。

Requirement:
1）颗粒度：对象字段足以支撑 IT Gap 分析中的业务数据记录与统计需求。
2）状态定义：为每个业务对象建立清晰的生命周期状态机（如：待处理、执行中、已完成）。

Output Format: 直接输出一个 JSON 对象，不要数组，不要 markdown 代码块。结构必须包含：
{
  "stage_name": "阶段名称",
  "step_id": "环节序号",
  "step_name": "环节名称",
  "it_gap_reference": "关联的 IT 现状与数据需求简述",
  "entities": [
    {
      "entity_name": "对象名称（如订单、合同、任务单）",
      "description": "对象说明",
      "fields": [{"field_name":"","type":"string|number|date|ref","description":""}],
      "state_machine": [{"state":"状态名","description":"","transitions":["下一状态"]}],
      "relations": [{"target_entity":"关联对象","relation_type":"1:1|1:n|n:1"}]
    }
  ]
}`;
    const userParts = [
      `项目：${projectName}。针对环节「${stepName}」进行核心业务对象推演。`,
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

  function parseCoreBusinessObjectModel(markdown) {
    if (!markdown || typeof markdown !== 'string') return [];
    let raw = markdown.trim().replace(/^\uFEFF/, '');
    if (CORE_BUSINESS_OBJECT_LOG) console.log('[核心业务对象] parseCoreBusinessObjectModel: 输入长度=', raw.length);
    let parsed = null;
    try {
      parsed = JSON.parse(raw);
    } catch (e1) {
      const codeBlock = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (codeBlock) {
        try {
          parsed = JSON.parse(codeBlock[1].trim());
        } catch (_2) {}
      }
      if (parsed == null) {
        const start = raw.indexOf('{');
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
            if (c === '{') { depth += 1; i += 1; continue; }
            if (c === '}') {
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
            } catch (_3) {}
          }
        }
      }
    }
    if (parsed && typeof parsed === 'object') {
      const hasEntities = Array.isArray(parsed.entities) && parsed.entities.length > 0;
      const hasStep = parsed.step_name != null || parsed.step_id != null || parsed.stage_name != null;
      if (hasEntities && hasStep) {
        if (CORE_BUSINESS_OBJECT_LOG) console.log('[核心业务对象] parseCoreBusinessObjectModel: 解析成功(单环节), entities=', parsed.entities.length);
        return [parsed];
      }
      if (hasEntities) {
        if (CORE_BUSINESS_OBJECT_LOG) console.log('[核心业务对象] parseCoreBusinessObjectModel: 解析成功(全局 entities), 条数=', parsed.entities.length);
        return [{ stage_name: '全局', step_name: '全局', entities: parsed.entities }];
      }
      // 严格提示词格式：单对象（session 存的是数组首元素），含 business_objects、local_gap_resolved
      if (!Array.isArray(parsed) && parsed != null && typeof parsed === 'object' && Array.isArray(parsed.business_objects)) {
        const entities = parsed.business_objects.map((bo) => {
          const fields = Array.isArray(bo.key_attributes)
            ? bo.key_attributes.map((a) => ({
                field_name: a.field ?? a.field_name,
                type: a.type ?? 'string',
                description: a.purpose ?? a.description ?? '',
              }))
            : [];
          const stateMachine = Array.isArray(bo.lifecycle_machine)
            ? bo.lifecycle_machine.map((lm) => ({
                state: lm.state_to ?? lm.state_from ?? lm.state ?? '—',
                description: [lm.trigger_role, lm.action].filter(Boolean).join(' '),
                transitions: lm.state_to ? [lm.state_to] : [],
              }))
            : [];
          const relations = Array.isArray(bo.associations)
            ? bo.associations.map((a) => ({
                target_entity: a.target_object ?? a.target_entity,
                relation_type: a.relation_type ?? '—',
              }))
            : [];
          return {
            entity_name: bo.object_name ?? bo.entity_name,
            description: bo.object_role ?? bo.global_integration_note ?? '',
            object_role: bo.object_role ?? '',
            fields,
            state_machine: stateMachine,
            relations,
          };
        });
        const normalized = { ...parsed, entities };
        if (CORE_BUSINESS_OBJECT_LOG) console.log('[核心业务对象] parseCoreBusinessObjectModel: 解析成功(严格格式单对象 business_objects), 条数=', entities.length);
        return [normalized];
      }
      if (Array.isArray(parsed)) {
        const first = parsed[0];
        if (first && typeof first === 'object' && Array.isArray(first.entities)) {
          if (CORE_BUSINESS_OBJECT_LOG) console.log('[核心业务对象] parseCoreBusinessObjectModel: 解析成功(环节数组), 条数=', parsed.length);
          return parsed;
        }
        // 严格提示词格式：单元素数组，含 business_objects、local_gap_resolved
        if (first && typeof first === 'object' && Array.isArray(first.business_objects)) {
          const entities = first.business_objects.map((bo) => {
            const fields = Array.isArray(bo.key_attributes)
              ? bo.key_attributes.map((a) => ({
                  field_name: a.field ?? a.field_name,
                  type: a.type ?? 'string',
                  description: a.purpose ?? a.description ?? '',
                }))
              : [];
            const stateMachine = Array.isArray(bo.lifecycle_machine)
              ? bo.lifecycle_machine.map((lm) => ({
                  state: lm.state_to ?? lm.state_from ?? lm.state ?? '—',
                  description: [lm.trigger_role, lm.action].filter(Boolean).join(' '),
                  transitions: lm.state_to ? [lm.state_to] : [],
                }))
              : [];
            const relations = Array.isArray(bo.associations)
              ? bo.associations.map((a) => ({
                  target_entity: a.target_object ?? a.target_entity,
                  relation_type: a.relation_type ?? '—',
                }))
              : [];
            return {
              entity_name: bo.object_name ?? bo.entity_name,
              description: bo.object_role ?? bo.global_integration_note ?? '',
              object_role: bo.object_role ?? '',
              fields,
              state_machine: stateMachine,
              relations,
            };
          });
          const normalized = { ...first, entities };
          if (CORE_BUSINESS_OBJECT_LOG) console.log('[核心业务对象] parseCoreBusinessObjectModel: 解析成功(严格格式 business_objects), 条数=', entities.length);
          return [normalized];
        }
      }
    }
    return [];
  }

  /** 将字段值渲染为 HTML：字符串用 markdown，对象/数组用 JSON pre */
  function formatCoreBusinessObjectField(val) {
    if (val == null || (typeof val === 'string' && !val.trim())) return '<span class="problem-detail-core-business-object-empty">—</span>';
    if (typeof val === 'string') return `<div class="problem-detail-core-business-object-field-content markdown-body">${renderMarkdown(val.trim())}</div>`;
    if (typeof val === 'object') return `<pre class="problem-detail-core-business-object-field-pre">${escapeHtml(JSON.stringify(val, null, 2))}</pre>`;
    return escapeHtml(String(val));
  }

  /** 单个实体卡片 HTML；opts.titlePrefix 存在时标题显示为「titlePrefix + 对象名」；opts.roleTag 存在时在名称右侧显示类型标签（object_role） */
  function buildEntityCardHtml(entity, opts) {
    if (!entity || typeof entity !== 'object') return '';
    const name = entity.entity_name ?? entity.entityName ?? entity.name ?? '未命名对象';
    const titlePrefix = opts && opts.titlePrefix != null ? String(opts.titlePrefix) : '';
    const titleText = titlePrefix ? titlePrefix + name : name;
    const roleTag = opts && opts.roleTag != null ? String(opts.roleTag).trim() : '';
    const fields = Array.isArray(entity.fields) ? entity.fields : [];
    const stateMachine = Array.isArray(entity.state_machine) ? entity.state_machine : (Array.isArray(entity.stateMachine) ? entity.stateMachine : []);
    const relations = Array.isArray(entity.relations) ? entity.relations : [];

    const subcard = (title, body) =>
      `<div class="problem-detail-core-business-entity-subcard">
        <div class="problem-detail-role-card-section-title">${escapeHtml(title)}</div>
        <div class="problem-detail-core-business-entity-subcard-body">${body}</div>
      </div>`;

    const fieldsBody = fields.length
      ? `<table class="problem-detail-core-business-object-table">
          <thead><tr><th>字段名</th><th>类型</th><th>设计意图</th></tr></thead>
          <tbody>${fields.map((f) => {
            const fn = f.field_name ?? f.fieldName ?? f.name ?? '—';
            const ty = f.type ?? '—';
            const rawDesc = (f.description ?? '').trim();
            const fd = rawDesc ? rawDesc.replace(/^设计意图[：:]\s*/, '') : '';
            return `<tr><td>${escapeHtml(fn)}</td><td>${escapeHtml(ty)}</td><td>${escapeHtml(fd || '—')}</td></tr>`;
          }).join('')}</tbody>
        </table>`
      : '<span class="problem-detail-core-business-object-empty">—</span>';
    const stateBody = stateMachine.length
      ? `<ul class="problem-detail-core-business-object-list">${stateMachine.map((s) => {
          const stateName = s.state ?? s.name ?? '—';
          const stateDesc = s.description ?? '';
          const trans = Array.isArray(s.transitions) ? s.transitions.join(' → ') : '';
          return `<li class="problem-detail-core-business-object-list-item"><strong>${escapeHtml(stateName)}</strong>${stateDesc ? ': ' + escapeHtml(stateDesc) : ''}${trans ? ' （→ ' + escapeHtml(trans) + '）' : ''}</li>`;
        }).join('')}</ul>`
      : '<span class="problem-detail-core-business-object-empty">—</span>';
    const relationsBody = relations.length
      ? `<ul class="problem-detail-core-business-object-list">${relations.map((r) => {
          const target = r.target_entity ?? r.targetEntity ?? '—';
          const relType = r.relation_type ?? r.relationType ?? '—';
          return `<li class="problem-detail-core-business-object-list-item">${escapeHtml(target)}（${escapeHtml(relType)}）</li>`;
        }).join('')}</ul>`
      : '<span class="problem-detail-core-business-object-empty">—</span>';

    const subcardsHtml = [
      subcard('字段定义', fieldsBody),
      subcard('状态机', stateBody),
      subcard('关联对象', relationsBody),
    ].join('');

    const roleTagHtml = roleTag ? `<span class="problem-detail-core-business-entity-role-tag">${escapeHtml(roleTag)}</span>` : '';
    return `
    <div class="problem-detail-card problem-detail-card-core-business-entity">
      <div class="problem-detail-card-header problem-detail-card-header-collapsed" tabindex="0" role="button" aria-expanded="false">
        <span class="problem-detail-core-business-entity-header-icon" aria-hidden="true">📦</span>
        <span class="problem-detail-card-header-title">${escapeHtml(titleText)}</span>
        ${roleTagHtml}
        <span class="problem-detail-card-header-arrow">▾</span>
      </div>
      <div class="problem-detail-card-body" hidden>
        <div class="problem-detail-core-business-entity-sections">${subcardsHtml}</div>
      </div>
    </div>`;
  }

  /** 基于单个环节的 model 对象构建 View 视图 HTML；含「局部ITGap 解决思路」与「核心业务对象设计」同等级卡片 */
  function buildCoreBusinessObjectStepViewHtml(match) {
    if (!match || typeof match !== 'object') return '';
    const localGapResolved = match.local_gap_resolved;
    const localGapCardHtml =
      localGapResolved != null && String(localGapResolved).trim()
        ? `
    <div class="problem-detail-card problem-detail-card-core-business-local-gap">
      <div class="problem-detail-card-header" tabindex="0" role="button" aria-expanded="true">
        <span class="problem-detail-card-header-title">局部ITGap 解决思路</span>
        <span class="problem-detail-card-header-arrow">▾</span>
      </div>
      <div class="problem-detail-card-body">
        <div class="problem-detail-core-business-object-section">
          ${formatCoreBusinessObjectField(localGapResolved)}
        </div>
      </div>
    </div>`
        : '';
    const entities = Array.isArray(match.entities) ? match.entities : [];
    const roleGroups = (() => {
      const map = new Map();
      for (const e of entities) {
        const role = (e.object_role != null && String(e.object_role).trim()) ? String(e.object_role).trim() : '未分类';
        if (!map.has(role)) map.set(role, []);
        map.get(role).push(e);
      }
      return Array.from(map.entries());
    })();
    const designSectionsHtml =
      roleGroups.length > 0
        ? roleGroups
            .map(([roleLabel, groupEntities]) => {
              const itemsHtml = groupEntities
                .map((e) => {
                  const cardHtml = buildEntityCardHtml(e, { titlePrefix: '对象：', roleTag: e.object_role ?? e.description ?? '' });
                  return cardHtml ? `<div class="problem-detail-core-business-object-design-item">${cardHtml}</div>` : '';
                })
                .filter(Boolean)
                .join('');
              return `
    <div class="problem-detail-card problem-detail-card-core-business-design-group">
      <div class="problem-detail-card-header problem-detail-card-header-collapsed" tabindex="0" role="button" aria-expanded="false">
        <span class="problem-detail-card-header-title">${escapeHtml(roleLabel)}</span>
        <span class="problem-detail-card-header-arrow">▾</span>
      </div>
      <div class="problem-detail-card-body" hidden>
        <div class="problem-detail-core-business-object-design-list">${itemsHtml}</div>
      </div>
    </div>`;
            })
            .join('')
        : '<div class="problem-detail-core-business-object-placeholder">该环节暂无业务对象数据</div>';
    const designCardBody = `<div class="problem-detail-core-business-object-design-groups">${designSectionsHtml}</div>`;
    const designCardHtml = `
    <div class="problem-detail-card problem-detail-card-core-business-design">
      <div class="problem-detail-card-header problem-detail-card-header-collapsed" tabindex="0" role="button" aria-expanded="false">
        <span class="problem-detail-card-header-title">核心业务对象设计</span>
        <span class="problem-detail-card-header-arrow">▾</span>
      </div>
      <div class="problem-detail-card-body" hidden>${designCardBody}</div>
    </div>`;
    const designWrap = `<div class="problem-detail-core-business-object-view-design">${designCardHtml}</div>`;
    return (
      (localGapCardHtml ? `<div class="problem-detail-core-business-object-view-local-gap">${localGapCardHtml}</div>` : '') + designWrap
    );
  }

  /** 将解析后的模型渲染为环节列表或实体卡片列表 HTML */
  function buildCoreBusinessObjectNodeCardsHtml(model) {
    if (!Array.isArray(model) || model.length === 0) return '';
    const isPerStep = model[0] && typeof model[0] === 'object' && (Array.isArray(model[0].entities) && (model[0].step_name != null || model[0].stage_name != null));
    if (isPerStep) {
      return `<div class="problem-detail-core-business-object-step-list">
        <div class="problem-detail-core-business-object-list-title">环节列表</div>${model
        .map((item) => {
          const stepName = item.stage_name != null && item.step_name != null
            ? `${item.stage_name} － ${item.step_name}`
            : (item.step_name || item.stage_name || [item.step_id, item.stage_id].filter(Boolean).join(' ') || '环节');
          const viewHtml = buildCoreBusinessObjectStepViewHtml(item);
          const jsonStr = JSON.stringify(item, null, 2);
          return `
        <div class="problem-detail-card problem-detail-card-core-business-object">
          <div class="problem-detail-card-header problem-detail-card-header-collapsed" tabindex="0" role="button" aria-expanded="false">
            <span class="problem-detail-card-header-title">${escapeHtml(stepName)}</span>
            <span class="problem-detail-card-header-arrow">▾</span>
          </div>
          <div class="problem-detail-card-body" hidden>
            <div class="problem-detail-core-business-object-tabs">
              <span class="problem-detail-core-business-object-tabs-title">核心业务对象推演</span>
              <button type="button" class="problem-detail-core-business-object-tab problem-detail-core-business-object-tab-active" data-tab="view">view</button>
              <button type="button" class="problem-detail-core-business-object-tab" data-tab="json">json</button>
            </div>
            <div class="problem-detail-core-business-object-panel problem-detail-core-business-object-panel-view" data-panel="view">${viewHtml}</div>
            <div class="problem-detail-core-business-object-panel problem-detail-core-business-object-panel-json" data-panel="json" hidden><pre class="problem-detail-core-business-object-json">${escapeHtml(jsonStr)}</pre></div>
          </div>
        </div>`;
        })
        .join('')}</div>`;
    }
    const flatEntities = model.filter((m) => m && typeof m === 'object' && (Array.isArray(m.entities) ? m.entities : [m])).flatMap((m) => Array.isArray(m.entities) ? m.entities : [m]);
    if (flatEntities.length === 0) return '';
    const viewHtml = flatEntities.map((e) => buildEntityCardHtml(e)).filter(Boolean).join('');
    return `<div class="problem-detail-core-business-object-step-list">
      <div class="problem-detail-core-business-object-list-title">核心业务对象</div>
      <div class="problem-detail-core-business-object-view-entities">${viewHtml}</div>
    </div>`;
  }

  /** 构建任务确认时的上下文 JSON：全局 ITGap、端到端流程、每环节局部 ITGap、每环节角色权限推演 */
  function buildCoreBusinessObjectContextJson(item, valueStream, getLatestConfirmedRolePermissionContent) {
    if (!item || !valueStream || valueStream.raw) return null;
    const globalItGap = item.globalItGapAnalysisJson || null;
    const localSessions = item.localItGapSessions || [];
    const localAnalyses = item.localItGapAnalyses || [];
    const localItGapByStep = localSessions.map((s) => {
      const analysis = localAnalyses.find((a) => (a.stepIndex != null && a.stepIndex === s.stepIndex) || (a.stepName && a.stepName === s.stepName));
      return {
        stepName: s.stepName,
        stageName: s.stageName,
        stepIndex: s.stepIndex,
        analysis: analysis?.analysisJson ?? s.analysisJson ?? s.analysisMarkdown ?? null,
      };
    });
    const rolePermissionContent = typeof getLatestConfirmedRolePermissionContent === 'function' ? getLatestConfirmedRolePermissionContent(item) : null;
    const rolePermissionByStep = rolePermissionContent && typeof parseRolePermissionModel === 'function' ? parseRolePermissionModel(rolePermissionContent) : [];
    return {
      globalItGap,
      valueStream: valueStream && !valueStream.raw ? valueStream : null,
      localItGapByStep,
      rolePermissionByStep,
    };
  }

  /**
   * 执行核心业务对象推演任务「确认」后的逻辑：推送上下文块、生成 session、更新存储、推送 session 块。
   * @param {Object} item - 当前问题详情项
   * @param {Object} valueStream - 已解析的价值流（非 raw）
   * @param {Object} callbacks - { pushAndSaveProblemDetailChat, updateDigitalProblemCoreBusinessObjectSessions, getTimeStr, getLatestConfirmedRolePermissionContent }
   * @returns {{ ok: true, contextJson, sessions, updatedItem } | { ok: false, error: string }}
   */
  function executeCoreBusinessObjectTaskOnConfirm(item, valueStream, callbacks) {
    if (!item || !valueStream || valueStream.raw) {
      return { ok: false, error: CORE_BUSINESS_OBJECT_NEED_VALUE_STREAM_MSG };
    }
    const pushAndSaveProblemDetailChat = callbacks.pushAndSaveProblemDetailChat;
    const updateDigitalProblemCoreBusinessObjectSessions = callbacks.updateDigitalProblemCoreBusinessObjectSessions;
    const getTimeStr = callbacks.getTimeStr;
    const getLatestConfirmedRolePermissionContent = callbacks.getLatestConfirmedRolePermissionContent;
    if (typeof pushAndSaveProblemDetailChat !== 'function' || typeof getTimeStr !== 'function') {
      return { ok: false, error: CORE_BUSINESS_OBJECT_NEED_VALUE_STREAM_MSG };
    }
    const { valueStream: vs, globalItGap, localItGapByStep, rolePermissionByStep } = buildCoreBusinessObjectContextJson(item, valueStream, getLatestConfirmedRolePermissionContent) || {};
    const timestamp = getTimeStr();
    pushAndSaveProblemDetailChat({ type: 'coreBusinessObjectContextBlock', taskId: CORE_BUSINESS_OBJECT_TASK_ID, contextLabel: '价值流设计 json', contextJson: vs != null ? vs : null, timestamp });
    pushAndSaveProblemDetailChat({ type: 'coreBusinessObjectContextBlock', taskId: CORE_BUSINESS_OBJECT_TASK_ID, contextLabel: '全局 ITGap 分析 json', contextJson: globalItGap != null ? globalItGap : null, timestamp });
    pushAndSaveProblemDetailChat({ type: 'coreBusinessObjectContextBlock', taskId: CORE_BUSINESS_OBJECT_TASK_ID, contextLabel: '局部 ITGap 分析 json', contextJson: Array.isArray(localItGapByStep) ? localItGapByStep : null, timestamp });
    pushAndSaveProblemDetailChat({ type: 'coreBusinessObjectContextBlock', taskId: CORE_BUSINESS_OBJECT_TASK_ID, contextLabel: '角色与权限模型推演 json', contextJson: Array.isArray(rolePermissionByStep) ? rolePermissionByStep : null, timestamp });
    const sessions = generateCoreBusinessObjectSessions(valueStream);
    if (typeof updateDigitalProblemCoreBusinessObjectSessions === 'function') {
      updateDigitalProblemCoreBusinessObjectSessions(item.createdAt, sessions);
    }
    const updatedItem = { ...item, coreBusinessObjectSessions: sessions };
    pushAndSaveProblemDetailChat({ type: 'coreBusinessObjectSessionsBlock', taskId: CORE_BUSINESS_OBJECT_TASK_ID, sessions, timestamp, confirmed: false });
    return { ok: true, sessions, updatedItem };
  }

  /** 构建聊天区「核心业务对象推演 Session」内容块的 HTML（与角色与权限 session 块样式一致，含下方确认操作区） */
  function buildCoreBusinessObjectSessionsBlockHtml(sessions, timestamp, deleteIcon, confirmed, sessionMode) {
    const list = Array.isArray(sessions) ? sessions : [];
    const sessionsConfirmed = !!confirmed;
    const mode = sessionMode || '';
    const sessionsListHtml = list
      .map(
        (s) =>
          `<div class="problem-detail-chat-role-permission-session-item"><span class="problem-detail-chat-role-permission-session-name">${escapeHtml(s.stepName || `环节${s.stepIndex + 1}`)}</span><span class="problem-detail-chat-role-permission-session-status ${s.coreBusinessObjectJson ? 'session-done' : 'session-pending'}">${s.coreBusinessObjectJson ? '已推演✅' : '待推演'}</span></div>`
      )
      .join('');
    const actionLabelAuto = mode === 'auto' ? '已选择：自动顺序执行' : '自动顺序执行';
    const actionLabelManual = mode === 'manual' ? '已选择：手工逐项确认' : '手工逐项确认';
    const icon = deleteIcon != null ? deleteIcon : '';
    return `
        <button type="button" class="btn-delete-chat-msg" aria-label="删除">${icon}</button>
        <div class="problem-detail-chat-role-permission-sessions-card-wrap">
          <div class="problem-detail-chat-role-permission-sessions-card-header">核心业务对象推演 Session</div>
          <div class="problem-detail-chat-role-permission-sessions-card-body">
            <div class="problem-detail-chat-role-permission-sessions-header">已为 ${list.length} 个环节生成核心业务对象推演 session</div>
            <div class="problem-detail-chat-role-permission-sessions-list">${sessionsListHtml}</div>
          </div>
          <div class="problem-detail-chat-role-permission-sessions-actions">
            <button type="button" class="btn-core-business-object-sessions-auto btn-confirm-primary" ${sessionsConfirmed ? 'disabled' : ''}>${escapeHtml(actionLabelAuto)}</button>
            <button type="button" class="btn-core-business-object-sessions-manual btn-confirm-primary" ${sessionsConfirmed ? 'disabled' : ''}>${escapeHtml(actionLabelManual)}</button>
          </div>
        </div>
        <div class="problem-detail-chat-msg-time">${escapeHtml(timestamp || '')}</div>`;
  }

  if (typeof global !== 'undefined') {
    global.generateCoreBusinessObjectSessions = generateCoreBusinessObjectSessions;
    global.generateCoreBusinessObjectForStepWithStrictPrompt = generateCoreBusinessObjectForStepWithStrictPrompt;
    global.generateCoreBusinessObjectForStep = generateCoreBusinessObjectForStep;
    global.parseCoreBusinessObjectModel = parseCoreBusinessObjectModel;
    global.buildCoreBusinessObjectNodeCardsHtml = buildCoreBusinessObjectNodeCardsHtml;
    global.buildCoreBusinessObjectStepViewHtml = buildCoreBusinessObjectStepViewHtml;
    global.formatCoreBusinessObjectField = formatCoreBusinessObjectField;
    global.buildEntityCardHtml = buildEntityCardHtml;
    global.buildCoreBusinessObjectContextJson = buildCoreBusinessObjectContextJson;
    global.executeCoreBusinessObjectTaskOnConfirm = executeCoreBusinessObjectTaskOnConfirm;
    global.buildCoreBusinessObjectSessionsBlockHtml = buildCoreBusinessObjectSessionsBlockHtml;
    global.CORE_BUSINESS_OBJECT_TASK_ID = CORE_BUSINESS_OBJECT_TASK_ID;
    global.CORE_BUSINESS_OBJECT_NEED_VALUE_STREAM_MSG = CORE_BUSINESS_OBJECT_NEED_VALUE_STREAM_MSG;
  }
})(typeof window !== 'undefined' ? window : this);
