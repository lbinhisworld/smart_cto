/**
 * 任务6：痛点标注（价值流图各环节痛点描述标注）。
 *
 * 职责：
 * - 基于价值流图与需求逻辑，支持「整图一次标注」或「按环节单步标注」；
 * - 整图模式：调用大模型为所有环节标注 painPoint，合并后更新存储并推进工作流阶段；
 * - 单步模式：按 session 列表逐环节调用大模型，推送 painPointStepCard，支持确认/重做/自动顺序执行；
 * - 对外提供 runPainPointAnnotation、runPainPointAnnotationForNextStep、runPainPointAnnotationAutoSequential、applyPainPointStepConfirm、generatePainPointSessions 等，供 main 及任务调度使用。
 *
 * 依赖（由页面其他脚本提供的全局变量/函数）：
 * - 配置与工具：hasAiConfig、fetchDeepSeekChat、getTimeStr、escapeHtml、DELETE_CHAT_MSG_ICON
 * - 状态与渲染：el、currentProblemDetailItem、renderProblemDetailContent、buildLlmMetaHtml、renderProblemDetailChatFromStorage
 * - 会话与历史：problemDetailChatMessages、pushAndSaveProblemDetailChat、pushOperationToHistory、saveProblemDetailChat
 * - 价值流解析：parseValueStreamGraph（valueStream.js）
 * - 存储：updateDigitalProblemValueStreamPainPoint、updateDigitalProblemPainPointStep、updateDigitalProblemPainPointSessions、getDigitalProblems
 * - 导航：showNextTaskStartNotification、showTaskCompletionConfirm
 * - 任务列表：FOLLOW_TASKS
 */
(function (global) {
  const PAIN_POINT_ANNOTATION_PROMPT = `# 角色设定
你是一位资深的业务架构师与痛点分析专家，擅长结合需求逻辑识别各业务环节中的痛点。

# 输入数据
1. **requirement_logic**：当前需求单→需求理解页面→需求逻辑内容。
2. **value_stream**：已绘制的价值流图 JSON，包含 stages 及每个 stage 下的 steps（环节节点）。

# 任务
请结合需求逻辑，在价值流图的每个环节节点中提炼该环节涉及到的痛点。为每个 step 增加 \`painPoint\` 字段，内容为该环节痛点的精炼概括（一句话或简短列表）。若某环节无明显痛点，可留空字符串或简短说明「无明显痛点」。

# 输出格式
请直接返回一个 JSON 代码块，结构与输入 value_stream 一致，但在每个 step 中增加 \`painPoint\` 字段：
\`\`\`json
{
  "stages": [
    {
      "name": "阶段名称",
      "steps": [
        {
          "name": "环节名称",
          "painPoint": "该环节痛点的提炼概括"
        }
      ]
    }
  ]
}
\`\`\`
- painPoint 为字符串，提炼当前环节涉及到的痛点
- 保持原有 stages、steps 结构及 name、role、duration、itStatus 等字段不变，仅新增 painPoint`;

  /**
   * 根据价值流生成痛点标注 session 列表（环节列表），用于「痛点标注 session 计划确认」卡片。
   *
   * @param {Object} valueStream - 价值流图（含 stages/steps 或由 parseValueStreamGraph 解析的结构）。
   * @returns {Array<{stepName: string, stepIndex: number, stageName: string, painPoint: null}>}
   */
  function generatePainPointSessions(valueStream) {
    const parseValueStreamGraph = global.parseValueStreamGraph || (() => ({ stages: [] }));
    const { stages } = parseValueStreamGraph(valueStream || {});
    let stepIndex = 0;
    const sessions = [];
    for (const stage of stages) {
      const stageName = stage?.name || '';
      for (const step of stage.steps || []) {
        const stepName = step?.name || `环节${stepIndex + 1}`;
        sessions.push({ stepName, stepIndex, stageName, painPoint: null });
        stepIndex += 1;
      }
    }
    return sessions;
  }

  /**
   * 将大模型返回的「带 painPoint 的价值流」合并进原始价值流图，按阶段/环节下标一一对应写入 painPoint。
   *
   * @param {Object} baseVs - 原始价值流图。
   * @param {Object} annotatedVs - 大模型返回的带 painPoint 的价值流图。
   * @returns {Object} 合并后的价值流图。
   */
  function mergePainPointIntoValueStream(baseVs, annotatedVs) {
    const baseStages = baseVs.stages ?? baseVs.phases ?? baseVs.nodes ?? [];
    const annStages = annotatedVs.stages ?? annotatedVs.phases ?? annotatedVs.nodes ?? [];
    if (!Array.isArray(baseStages) || !Array.isArray(annStages)) return baseVs;
    const stages = baseStages.map((baseStage, si) => {
      const annStage = annStages[si];
      if (!annStage) return baseStage;
      const baseSteps = baseStage.steps ?? baseStage.tasks ?? baseStage.phases ?? baseStage.items ?? [];
      const annSteps = annStage.steps ?? annStage.tasks ?? annStage.phases ?? annStage.items ?? [];
      const steps = baseSteps.map((baseStep, ji) => {
        const annStep = annSteps[ji];
        const painPoint = annStep?.painPoint ?? annStep?.pain_point;
        if (painPoint == null || (typeof painPoint === 'string' && !painPoint.trim())) return baseStep;
        const trimmed = typeof painPoint === 'string' ? painPoint.trim() : String(painPoint);
        if (/^(无明显痛点|无痛点|暂无|无)$/i.test(trimmed) || /^无明显痛点/i.test(trimmed)) return baseStep;
        const step = typeof baseStep === 'object' && baseStep !== null ? { ...baseStep } : { name: String(baseStep) };
        step.painPoint = trimmed;
        return step;
      });
      return { ...baseStage, steps };
    });
    return { ...baseVs, stages };
  }

  /**
   * 调用大模型，基于价值流图与需求逻辑为所有环节一次性标注痛点。
   *
   * @param {Object|string} valueStream - 价值流图。
   * @param {Object|string} requirementLogic - 需求逻辑。
   * @returns {Promise<{content: string, usage: object, model: string, durationMs: number}>}
   */
  async function generatePainPointAnnotation(valueStream, requirementLogic) {
    const userContent = `请结合需求逻辑，在价值流图各环节标注痛点。

## requirement_logic（需求逻辑 - 需求理解页面→需求逻辑内容）
\`\`\`json
${typeof requirementLogic === 'string' ? requirementLogic : JSON.stringify(requirementLogic || {}, null, 2)}
\`\`\`

## value_stream（已绘制的价值流图）
\`\`\`json
${typeof valueStream === 'string' ? valueStream : JSON.stringify(valueStream || {}, null, 2)}
\`\`\`

请按提示词要求，为每个环节增加 painPoint 字段，直接返回完整 JSON 代码块。`;
    const fetchDeepSeekChat = global.fetchDeepSeekChat;
    if (typeof fetchDeepSeekChat !== 'function') throw new Error('fetchDeepSeekChat 未定义');
    const { content, usage, model, durationMs } = await fetchDeepSeekChat([
      { role: 'system', content: PAIN_POINT_ANNOTATION_PROMPT },
      { role: 'user', content: userContent },
    ]);
    return { content, usage, model, durationMs };
  }

  /**
   * 单环节痛点标注：仅针对指定环节调用大模型，返回该环节的痛点文案及完整输入 prompt（供时间线 LLM-查询 块使用）。
   *
   * @param {string} stepName - 环节名称。
   * @param {string} stageName - 阶段名称。
   * @param {Object|string} valueStream - 价值流图。
   * @param {Object|string} requirementLogic - 需求逻辑。
   * @returns {Promise<{content: string, usage: object, model: string, durationMs: number, fullPrompt: string}>}
   */
  async function generatePainPointForOneStep(stepName, stageName, valueStream, requirementLogic) {
    const userContent = `请结合需求逻辑，仅针对以下**单个环节**提炼痛点，直接返回该环节的痛点概括（一句话或简短列表）。若该环节无明显痛点，请返回「无明显痛点」或「无」。

## 目标环节
- 阶段：${stageName || '—'}
- 环节名称：${stepName || '—'}

## requirement_logic（需求逻辑）
\`\`\`json
${typeof requirementLogic === 'string' ? requirementLogic : JSON.stringify(requirementLogic || {}, null, 2)}
\`\`\`

## value_stream（价值流图，供上下文）
\`\`\`json
${typeof valueStream === 'string' ? valueStream : JSON.stringify(valueStream || {}, null, 2)}
\`\`\`

请只输出该环节的痛点文案，不要输出 JSON 或其它格式。`;
    const fullPrompt = `${PAIN_POINT_ANNOTATION_PROMPT}\n\n---\n\n${userContent}`;
    const fetchDeepSeekChat = global.fetchDeepSeekChat;
    if (typeof fetchDeepSeekChat !== 'function') throw new Error('fetchDeepSeekChat 未定义');
    const { content, usage, model, durationMs } = await fetchDeepSeekChat([
      { role: 'system', content: PAIN_POINT_ANNOTATION_PROMPT },
      { role: 'user', content: userContent },
    ]);
    const painPointText = (content || '').trim();
    return { content: painPointText, usage, model, durationMs, fullPrompt };
  }

  /**
   * 确认单步痛点并写回存储；刷新会话与 UI。若全部环节已标注则返回 true。
   *
   * @param {string|number} createdAt - 问题创建时间。
   * @param {number} stepIndex - 环节下标。
   * @param {string} painPointText - 该环节痛点文案。
   * @returns {boolean} 是否全部环节已标注。
   */
  function applyPainPointStepConfirm(createdAt, stepIndex, painPointText) {
    if (typeof global.updateDigitalProblemPainPointStep !== 'function') return false;
    global.updateDigitalProblemPainPointStep(createdAt, stepIndex, painPointText);
    const messages = (typeof global.getProblemDetailChatMessages === 'function' ? global.getProblemDetailChatMessages() : global.problemDetailChatMessages) || [];
    const cardIdx = Array.isArray(messages) ? messages.findIndex((m) => m.type === 'painPointStepCard' && m.stepIndex === stepIndex) : -1;
    if (cardIdx >= 0) {
      messages[cardIdx] = { ...messages[cardIdx], content: painPointText, confirmed: true };
      if (typeof global.saveProblemDetailChat === 'function') global.saveProblemDetailChat(createdAt, messages);
    }
    const list = global.getDigitalProblems ? global.getDigitalProblems() : [];
    const updated = list.find((it) => it.createdAt === createdAt);
    if (updated && global.currentProblemDetailItem?.createdAt === createdAt) {
      global.currentProblemDetailItem = updated;
    }
    const sessions = updated?.painPointSessions || [];
    const allDone = sessions.length > 0 && sessions.every((s) => s.painPoint != null && String(s.painPoint).trim());
    const container = global.el?.problemDetailChatMessages;
    if (container) {
      container.innerHTML = '';
      if (typeof global.renderProblemDetailChatFromStorage === 'function') {
        const msgs = (typeof global.getProblemDetailChatMessages === 'function' ? global.getProblemDetailChatMessages() : global.problemDetailChatMessages) || [];
        global.renderProblemDetailChatFromStorage(container, Array.isArray(msgs) ? msgs : []);
      }
      container.scrollTop = container.scrollHeight;
    }
    if (typeof global.renderProblemDetailContent === 'function') global.renderProblemDetailContent();
    if (typeof global.renderProblemDetailHistory === 'function') global.renderProblemDetailHistory();
    return !!allDone;
  }

  /**
   * 痛点标注主流程（整图一次标注）：校验 AI 配置与当前项 → 调用大模型 → 解析 JSON → 合并 painPoint → 更新存储并推进阶段。
   *
   * @param {Object} [optionalItem] - 当前问题详情项（main 调用时传入）。
   * @param {boolean} [isRerun=false] - 是否为重做（文案区分「痛点标注完毕」/「痛点标注完成」）。
   * @returns {Promise<void>}
   */
  async function runPainPointAnnotation(optionalItem, isRerun) {
    const container = global.el?.problemDetailChatMessages;
    let item = (optionalItem != null && typeof optionalItem === 'object' && optionalItem.createdAt != null) ? optionalItem : global.currentProblemDetailItem;
    if (typeof optionalItem === 'boolean') {
      isRerun = optionalItem;
      item = global.currentProblemDetailItem;
    }
    if (!container || !item?.createdAt) return;
    if (!global.hasAiConfig?.()) {
      const errBlock = document.createElement('div');
      errBlock.className = 'problem-detail-chat-msg problem-detail-chat-msg-system';
      errBlock.innerHTML = `<div class="problem-detail-chat-msg-content-wrap"><div class="problem-detail-chat-msg-content">请先配置 AI（local 模式填写 DEEPSEEK_API_KEY，online 模式配置 BACKEND_API_URL）才能使用痛点标注功能。</div></div><div class="problem-detail-chat-msg-time">${global.getTimeStr()}</div>`;
      container.appendChild(errBlock);
      global.pushAndSaveProblemDetailChat?.({ role: 'system', content: '请先配置 AI（local 模式填写 DEEPSEEK_API_KEY，online 模式配置 BACKEND_API_URL）才能使用痛点标注功能。', timestamp: global.getTimeStr() });
      return;
    }
    const valueStream = item.valueStream;
    const requirementLogic = item.requirementLogic || {};
    const logicForPrompt = typeof requirementLogic === 'string' ? requirementLogic : JSON.stringify(requirementLogic, null, 2);
    let loadingBlock = isRerun ? (() => { const arr = container.querySelectorAll('.problem-detail-chat-msg-parsing'); return arr[arr.length - 1] || null; })() : null;
    if (!loadingBlock) {
      loadingBlock = document.createElement('div');
      loadingBlock.className = 'problem-detail-chat-msg problem-detail-chat-msg-system problem-detail-chat-msg-parsing';
      loadingBlock.innerHTML = `<div class="problem-detail-chat-msg-content-wrap"><div class="problem-detail-chat-parsing-inner"><span class="problem-detail-chat-spinner"></span><span class="problem-detail-chat-msg-content">正在标注价值流图各环节痛点…</span></div></div><div class="problem-detail-chat-msg-time">${global.getTimeStr()}</div>`;
      container.appendChild(loadingBlock);
    }
    container.scrollTop = container.scrollHeight;
    try {
      const { content, usage, model, durationMs } = await generatePainPointAnnotation(valueStream, logicForPrompt);
      loadingBlock.remove();
      const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/);
      let annotatedVs = null;
      if (jsonMatch) {
        try { annotatedVs = JSON.parse(jsonMatch[1].trim()); } catch (_) {}
      }
      if (!annotatedVs) {
        const fallbackMatch = content.match(/\{[\s\S]*\}/);
        if (fallbackMatch) {
          try { annotatedVs = JSON.parse(fallbackMatch[0]); } catch (_) {}
        }
      }
      const mergedVs = annotatedVs ? mergePainPointIntoValueStream(valueStream, annotatedVs) : valueStream;
      const msgLen = (typeof global.getProblemDetailChatMessages === 'function' ? global.getProblemDetailChatMessages() : global.problemDetailChatMessages)?.length ?? 0;
      global.pushOperationToHistory?.(item.createdAt, 'painPoint', JSON.parse(JSON.stringify(item)), msgLen);
      global.updateDigitalProblemValueStreamPainPoint?.(item.createdAt, mergedVs);
      global.currentProblemDetailItem = { ...item, valueStream: mergedVs, workflowAlignCompletedStages: [...new Set([...(item.workflowAlignCompletedStages || []), 0, 1, 2])].sort((a, b) => a - b) };
      global.renderProblemDetailContent?.();
      const doneText = isRerun ? '痛点标注完毕' : '痛点标注完成';
      const llmMeta = global.buildLlmMetaHtml?.({ usage, model, durationMs }) || '';
      const escapeHtml = global.escapeHtml || ((s) => (s == null ? '' : String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')));
      const doneBlock = document.createElement('div');
      doneBlock.className = 'problem-detail-chat-msg problem-detail-chat-msg-system problem-detail-chat-msg-parsed';
      doneBlock.innerHTML = `<div class="problem-detail-chat-msg-content-wrap"><div class="problem-detail-chat-msg-content">${escapeHtml(doneText)}</div><span class="problem-detail-chat-check" aria-hidden="true">✅</span></div><div class="problem-detail-chat-msg-time">${global.getTimeStr()}</div>${llmMeta}`;
      container.appendChild(doneBlock);
      global.pushAndSaveProblemDetailChat?.({ role: 'system', content: doneText, timestamp: global.getTimeStr(), hasCheck: true, llmMeta: { usage, model, durationMs } });
      container.scrollTop = container.scrollHeight;
      if (typeof global.requestAnimationFrame === 'function') {
        global.requestAnimationFrame(() => global.showNextTaskStartNotification?.());
      } else {
        global.showNextTaskStartNotification?.();
      }
    } catch (err) {
      const errBlock = document.createElement('div');
      errBlock.className = 'problem-detail-chat-msg problem-detail-chat-msg-system';
      const escapeHtml = global.escapeHtml || ((s) => (s == null ? '' : String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')));
      errBlock.innerHTML = `<div class="problem-detail-chat-msg-content-wrap"><div class="problem-detail-chat-msg-content">痛点标注失败：${escapeHtml(err.message || String(err))}</div></div><div class="problem-detail-chat-msg-time">${global.getTimeStr()}</div>`;
      container.appendChild(errBlock);
      global.pushAndSaveProblemDetailChat?.({ role: 'system', content: '痛点标注失败：' + (err.message || String(err)), timestamp: global.getTimeStr() });
    }
  }

  /**
   * 执行下一个未标注环节的痛点标注（单步），推送痛点卡片。成功时返回 { stepIndex, painPointText }，无下一环节或失败时返回 null。
   *
   * @param {Object} [optionalItem] - 当前问题详情项。
   * @returns {Promise<{stepIndex: number, painPointText: string}|null>}
   */
  async function runPainPointAnnotationForNextStep(optionalItem) {
    const container = global.el?.problemDetailChatMessages;
    const item = (optionalItem != null && typeof optionalItem === 'object' && optionalItem.createdAt != null) ? optionalItem : global.currentProblemDetailItem;
    if (!container || !item?.createdAt || !global.hasAiConfig?.()) return null;
    const sessions = item.painPointSessions || [];
    const valueStream = item.valueStream;
    const requirementLogic = item.requirementLogic != null ? item.requirementLogic : {};
    if (!valueStream || valueStream.raw) return null;
    const nextIdx = sessions.findIndex((s) => s.painPoint == null || (typeof s.painPoint === 'string' && !s.painPoint.trim()));
    if (nextIdx < 0) return null;
    const session = sessions[nextIdx];
    const stepName = session.stepName || `环节${nextIdx + 1}`;
    const stageName = session.stageName || '';
    global.pushAndSaveProblemDetailChat?.({ role: 'system', content: '正在标注环节【' + stepName + '】的痛点…', timestamp: global.getTimeStr() });
    container.innerHTML = '';
    const messages = (typeof global.getProblemDetailChatMessages === 'function' ? global.getProblemDetailChatMessages() : global.problemDetailChatMessages) || [];
    global.renderProblemDetailChatFromStorage?.(container, Array.isArray(messages) ? messages : []);
    container.scrollTop = container.scrollHeight;
    const escapeHtml = global.escapeHtml || ((s) => (s == null ? '' : String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')));
    const deleteIcon = global.DELETE_CHAT_MSG_ICON || '';
    const parsingBlock = document.createElement('div');
    parsingBlock.className = 'problem-detail-chat-msg problem-detail-chat-msg-system problem-detail-chat-msg-parsing';
    parsingBlock.innerHTML = `<div class="problem-detail-chat-msg-content-wrap"><div class="problem-detail-chat-parsing-inner"><span class="problem-detail-chat-spinner"></span><span class="problem-detail-chat-msg-content">正在标注环节【${escapeHtml(stepName)}】的痛点…</span></div></div><div class="problem-detail-chat-msg-time">${global.getTimeStr()}</div>`;
    container.appendChild(parsingBlock);
    container.scrollTop = container.scrollHeight;
    try {
      const { content: painPointText, usage, model, durationMs, fullPrompt } = await generatePainPointForOneStep(stepName, stageName, valueStream, requirementLogic);
      parsingBlock.remove();
      const llmMeta = { usage, model, durationMs };
      global.pushAndSaveProblemDetailChat?.({
        role: 'system',
        type: 'task6LlmQueryBlock',
        taskId: 'task6',
        noteName: '痛点标注',
        stepName,
        llmInputPrompt: fullPrompt != null ? String(fullPrompt) : '',
        llmOutputRaw: (painPointText != null ? String(painPointText).trim() : '') || '',
        llmMeta: { usage, model, durationMs },
        timestamp: global.getTimeStr(),
        confirmed: false,
      });
      const llmMetaHtml = global.buildLlmMetaHtml?.(llmMeta) || '';
      const painPointContent = (painPointText && String(painPointText).trim()) || '';
      const cardBlock = document.createElement('div');
      cardBlock.className = 'problem-detail-chat-msg problem-detail-chat-msg-system problem-detail-chat-pain-point-step-card problem-detail-chat-msg-with-delete';
      cardBlock.dataset.msgIndex = String(((typeof global.getProblemDetailChatMessages === 'function' ? global.getProblemDetailChatMessages() : global.problemDetailChatMessages) || []).length);
      cardBlock.dataset.taskId = 'task6';
      cardBlock.dataset.stepName = stepName;
      cardBlock.dataset.stepIndex = String(nextIdx);
      cardBlock.innerHTML = `
      <button type="button" class="btn-delete-chat-msg" aria-label="删除">${deleteIcon}</button>
      <div class="problem-detail-chat-pain-point-step-card-wrap">
        <div class="problem-detail-chat-pain-point-step-card-header">痛点标注：${escapeHtml(stepName)}</div>
        <div class="problem-detail-chat-pain-point-step-card-body"><div class="problem-detail-chat-pain-point-step-content">${escapeHtml(painPointContent || '—')}</div></div>
        <div class="problem-detail-chat-pain-point-step-card-actions">
          <button type="button" class="btn-confirm-pain-point-step btn-confirm-primary" data-step-index="${nextIdx}">确认</button>
          <button type="button" class="btn-redo-pain-point-step" data-step-index="${nextIdx}">重做</button>
          <button type="button" class="btn-refine-modify" data-task-id="task6">修正</button>
          <button type="button" class="btn-refine-discuss" data-task-id="task6">讨论</button>
        </div>
      </div>
      <div class="problem-detail-chat-msg-time">${global.getTimeStr()}</div>${llmMetaHtml}`;
      container.appendChild(cardBlock);
      global.pushAndSaveProblemDetailChat?.({
        type: 'painPointStepCard',
        taskId: 'task6',
        stepName,
        stepIndex: nextIdx,
        content: painPointContent,
        timestamp: global.getTimeStr(),
        confirmed: false,
        llmMeta,
      });
      container.scrollTop = container.scrollHeight;
      global.renderProblemDetailContent?.();
      global.renderProblemDetailHistory?.();
      return { stepIndex: nextIdx, painPointText: painPointContent };
    } catch (err) {
      parsingBlock.remove();
      const errBlock = document.createElement('div');
      errBlock.className = 'problem-detail-chat-msg problem-detail-chat-msg-system';
      errBlock.innerHTML = `<div class="problem-detail-chat-msg-content-wrap"><div class="problem-detail-chat-msg-content">痛点标注失败：${escapeHtml(err.message || String(err))}</div></div><div class="problem-detail-chat-msg-time">${global.getTimeStr()}</div>`;
      container.appendChild(errBlock);
      global.pushAndSaveProblemDetailChat?.({ role: 'system', content: '痛点标注失败：' + (err.message || String(err)), timestamp: global.getTimeStr() });
      container.scrollTop = container.scrollHeight;
      return null;
    }
  }

  /**
   * 自动顺序执行：循环执行下一未标注环节直到全部完成，每步自动确认并继续。
   *
   * @param {Object} [optionalItem] - 当前问题详情项。
   * @returns {Promise<void>}
   */
  async function runPainPointAnnotationAutoSequential(optionalItem) {
    const item = (optionalItem != null && typeof optionalItem === 'object' && optionalItem.createdAt != null) ? optionalItem : global.currentProblemDetailItem;
    if (!item?.createdAt) return;
    const btn = document.querySelector('.btn-auto-pain-point-sessions');
    if (btn && !btn.disabled) btn.disabled = true;
    let currentItem = item;
    while (true) {
      const r = await runPainPointAnnotationForNextStep(currentItem);
      if (!r) break;
      const allDone = applyPainPointStepConfirm(currentItem.createdAt, r.stepIndex, r.painPointText);
      if (allDone) {
        const FOLLOW_TASKS = global.FOLLOW_TASKS || [];
        if (typeof global.requestAnimationFrame === 'function') {
          global.requestAnimationFrame(() => {
            global.showTaskCompletionConfirm?.('task6', FOLLOW_TASKS.find((t) => t.id === 'task6')?.name || '痛点标注');
          });
        } else {
          global.showTaskCompletionConfirm?.('task6', FOLLOW_TASKS.find((t) => t.id === 'task6')?.name || '痛点标注');
        }
        break;
      }
      const list = global.getDigitalProblems ? global.getDigitalProblems() : [];
      const nextItem = list.find((it) => it.createdAt === item.createdAt);
      if (nextItem) {
        global.currentProblemDetailItem = nextItem;
        currentItem = nextItem;
      }
    }
    if (btn) {
      const sessions = (global.currentProblemDetailItem?.painPointSessions || []);
      const hasUnfinished = sessions.some((s) => s.painPoint == null || (typeof s.painPoint === 'string' && !s.painPoint.trim()));
      btn.disabled = !hasUnfinished;
    }
  }

  global.PAIN_POINT_ANNOTATION_PROMPT = PAIN_POINT_ANNOTATION_PROMPT;
  global.generatePainPointSessions = generatePainPointSessions;
  global.generatePainPointAnnotation = generatePainPointAnnotation;
  global.generatePainPointForOneStep = generatePainPointForOneStep;
  global.mergePainPointIntoValueStream = mergePainPointIntoValueStream;
  global.runPainPointAnnotation = runPainPointAnnotation;
  global.runPainPointAnnotationForNextStep = runPainPointAnnotationForNextStep;
  global.applyPainPointStepConfirm = applyPainPointStepConfirm;
  global.runPainPointAnnotationAutoSequential = runPainPointAnnotationAutoSequential;
})(typeof window !== 'undefined' ? window : this);
