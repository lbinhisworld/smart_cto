/**
 * 任务5：IT 现状标注（价值流图各环节 IT 支撑方式标注）。
 *
 * 职责：
 * - 基于价值流图与需求逻辑，调用大模型为每个环节标注 itStatus（手工/系统）；
 * - 向时间线推送 LLM-查询 块（输入/输出双子卡片），向对话区推送 itStatusCard 及完成态；
 * - 合并大模型返回的 itStatus 到价值流图并写入存储，推进工作流对齐阶段。
 *
 * 依赖（由页面其他脚本提供的全局变量/函数）：
 * - 配置与工具：hasAiConfig、fetchDeepSeekChat、getTimeStr、escapeHtml、DELETE_CHAT_MSG_ICON
 * - 状态与渲染：el、currentProblemDetailItem、renderProblemDetailContent、buildLlmMetaHtml
 * - 会话与历史：problemDetailChatMessages、pushAndSaveProblemDetailChat、pushOperationToHistory
 * - 价值流解析：parseValueStreamGraph（valueStream.js）
 * - 存储：updateDigitalProblemValueStreamItStatus
 * - 导航：showNextTaskStartNotification
 */
(function (global) {
  const IT_STATUS_ANNOTATION_PROMPT = `# 角色设定
你是一位资深的业务架构师与 IT 现状分析专家，擅长结合需求逻辑判断各业务环节的 IT 支撑方式。

# 输入数据
1. **requirement_logic**：当前需求单→需求理解页面→需求逻辑→需求背后的逻辑链条总结部分的 json 数据。
2. **value_stream**：已绘制的价值流图 JSON，包含 stages 及每个 stage 下的 steps（环节节点）。

# 任务
请结合需求逻辑，在价值流图的每个环节节点标注该环节的 IT 现状：
- **手工**：若该环节依赖人工操作，需进一步区分：\`纸质\` 或 \`excel\`
- **系统**：若该环节有系统支撑，标注具体系统名称（如：ERP、MES、OA 等）

# 输出格式
请直接返回一个 JSON 代码块，结构与输入 value_stream 一致，但在每个 step 中增加 \`itStatus\` 字段：
\`\`\`json
{
  "stages": [
    {
      "name": "阶段名称",
      "steps": [
        {
          "name": "环节名称",
          "role": "执行角色",
          "duration": "预估耗时",
          "itStatus": { "type": "手工", "detail": "纸质" }
        },
        {
          "name": "另一环节",
          "itStatus": { "type": "系统", "detail": "ERP系统" }
        }
      ]
    }
  ]
}
\`\`\`
- itStatus.type 只能是 \`手工\` 或 \`系统\`
- itStatus.detail：手工时为 \`纸质\` 或 \`excel\`；系统时为具体系统名称
- 保持原有 stages、steps 结构及 name、role、duration 等字段不变，仅新增 itStatus`;

  /**
   * 将大模型返回的「带 itStatus 的价值流」合并进原始价值流图，按阶段/环节下标一一对应写入 itStatus。
   *
   * @param {Object} baseVs - 原始价值流图（含 stages/steps 或 phases/nodes 等结构）。
   * @param {Object} annotatedVs - 大模型返回的带 itStatus 的价值流图（结构需与 baseVs 对应）。
   * @returns {Object} 合并后的价值流图，保留 baseVs 的其余字段，仅在各 step 上增加或覆盖 itStatus。
   */
  function mergeItStatusIntoValueStream(baseVs, annotatedVs) {
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
        const itStatus = annStep?.itStatus ?? annStep?.it_status;
        if (!itStatus || typeof itStatus !== 'object') return baseStep;
        const step = typeof baseStep === 'object' && baseStep !== null ? { ...baseStep } : { name: String(baseStep) };
        step.itStatus = itStatus;
        return step;
      });
      return { ...baseStage, steps };
    });
    return { ...baseVs, stages };
  }

  /**
   * 调用大模型，基于价值流图与需求逻辑为各环节标注 IT 现状。
   *
   * @param {Object|string} valueStream - 已绘制的价值流图（对象或 JSON 字符串）。
   * @param {Object|string} requirementLogic - 需求逻辑（对象或 JSON 字符串）。
   * @returns {Promise<{content: string, usage: object, model: string, durationMs: number, fullPrompt: string}>}
   *   - content: 大模型原始回复；fullPrompt: 用于时间线 LLM-查询 输入的完整 prompt。
   */
  async function generateItStatusAnnotation(valueStream, requirementLogic) {
    console.log('[task5] generateItStatusAnnotation 调用', { valueStreamType: typeof valueStream, requirementLogicType: typeof requirementLogic });
    const userContent = `请结合需求逻辑，在价值流图各环节标注 IT 现状。

## requirement_logic（需求逻辑 - 逻辑链条总结等）
\`\`\`json
${typeof requirementLogic === 'string' ? requirementLogic : JSON.stringify(requirementLogic || {}, null, 2)}
\`\`\`

## value_stream（已绘制的价值流图）
\`\`\`json
${typeof valueStream === 'string' ? valueStream : JSON.stringify(valueStream || {}, null, 2)}
\`\`\`

请按提示词要求，为每个环节增加 itStatus 字段，直接返回完整 JSON 代码块。`;
    const fullPrompt = `【system】\n${IT_STATUS_ANNOTATION_PROMPT}\n\n【user】\n${userContent}`;
    const fetchDeepSeekChat = global.fetchDeepSeekChat;
    if (typeof fetchDeepSeekChat !== 'function') {
      console.error('[task5] fetchDeepSeekChat 未定义，无法调用大模型');
      throw new Error('fetchDeepSeekChat 未定义');
    }
    const { content, usage, model, durationMs } = await fetchDeepSeekChat([
      { role: 'system', content: IT_STATUS_ANNOTATION_PROMPT },
      { role: 'user', content: userContent },
    ]);
    console.log('[task5] generateItStatusAnnotation 返回', { contentLength: content?.length, hasUsage: !!usage });
    return { content, usage, model, durationMs, fullPrompt };
  }

  /**
   * IT 现状标注主流程：校验 AI 配置与当前项 → 调用大模型 → 解析 JSON → 合并 itStatus → 更新存储与当前项 →
   * 推送 task5LlmQueryBlock、itStatusCard、完成态消息，并渲染对话区卡片与沟通历史。
   *
   * @param {Object} [optionalItem] - 当前问题详情项（含 createdAt、valueStream、requirementLogic 等）。
   *   由 main 调用时传入，因 currentProblemDetailItem 为 let 不挂载到 window，模块内无法直接读取。
   * @returns {Promise<void>}
   */
  async function runItStatusAnnotation(optionalItem) {
    const container = global.el?.problemDetailChatMessages;
    const item = (optionalItem != null && typeof optionalItem === 'object' && optionalItem.createdAt != null) ? optionalItem : global.currentProblemDetailItem;
    console.log('[task5] runItStatusAnnotation 入口', { hasContainer: !!container, hasItem: !!item, createdAt: item?.createdAt, hasValueStream: !!(item?.valueStream), passedItem: optionalItem != null });
    if (!container || !item?.createdAt) {
      console.warn('[task5] 提前退出：缺少 container 或 item.createdAt', { container: !!container, createdAt: item?.createdAt });
      return;
    }
    if (!global.hasAiConfig?.()) {
      console.warn('[task5] 未配置 AI，推送提示后退出');
      const errBlock = document.createElement('div');
      errBlock.className = 'problem-detail-chat-msg problem-detail-chat-msg-system';
      errBlock.innerHTML = `<div class="problem-detail-chat-msg-content-wrap"><div class="problem-detail-chat-msg-content">请先配置 AI（local 模式填写 DEEPSEEK_API_KEY，online 模式配置 BACKEND_API_URL）才能使用 IT 现状标注功能。</div></div><div class="problem-detail-chat-msg-time">${global.getTimeStr()}</div>`;
      container.appendChild(errBlock);
      global.pushAndSaveProblemDetailChat?.({ role: 'system', content: '请先配置 AI（local 模式填写 DEEPSEEK_API_KEY，online 模式配置 BACKEND_API_URL）才能使用 IT 现状标注功能。', timestamp: global.getTimeStr() });
      return;
    }
    const valueStream = item.valueStream;
    const requirementLogic = item.requirementLogic || {};
    const logicForPrompt = typeof requirementLogic === 'string' ? requirementLogic : JSON.stringify(requirementLogic, null, 2);
    console.log('[task5] 准备调用大模型', { hasValueStream: !!valueStream, requirementLogicLength: logicForPrompt?.length });
    try {
      const loadingBlock = document.createElement('div');
      loadingBlock.className = 'problem-detail-chat-msg problem-detail-chat-msg-system problem-detail-chat-msg-parsing';
      loadingBlock.innerHTML = `<div class="problem-detail-chat-msg-content-wrap"><div class="problem-detail-chat-parsing-inner"><span class="problem-detail-chat-spinner"></span><span class="problem-detail-chat-msg-content">正在标注价值流图各环节 IT 现状…</span></div></div><div class="problem-detail-chat-msg-time">${global.getTimeStr()}</div>`;
      container.appendChild(loadingBlock);
      container.scrollTop = container.scrollHeight;
      const { content, usage, model, durationMs, fullPrompt } = await generateItStatusAnnotation(valueStream, logicForPrompt);
      console.log('[task5] 大模型返回', { contentLength: content?.length, hasUsage: !!usage, model, durationMs });
      loadingBlock.remove();
      const pushAndSave = global.pushAndSaveProblemDetailChat;
      console.log('[task5] 推送 task5LlmQueryBlock', { hasPushAndSaveProblemDetailChat: typeof pushAndSave === 'function' });
      global.pushAndSaveProblemDetailChat?.({
        role: 'system',
        type: 'task5LlmQueryBlock',
        taskId: 'task5',
        noteName: 'IT 现状标注',
        llmInputPrompt: fullPrompt != null ? String(fullPrompt) : '',
        llmOutputRaw: content != null ? String(content) : '',
        llmMeta: { usage, model, durationMs },
        timestamp: global.getTimeStr(),
        confirmed: false,
      });
      console.log('[task5] task5LlmQueryBlock 已推送，当前消息条数', (global.problemDetailChatMessages || []).length);
      const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/);
      let annotatedVs = null;
      if (jsonMatch) {
        try {
          annotatedVs = JSON.parse(jsonMatch[1].trim());
        } catch (_) {}
      }
      if (!annotatedVs) {
        const fallbackMatch = content.match(/\{[\s\S]*\}/);
        if (fallbackMatch) {
          try {
            annotatedVs = JSON.parse(fallbackMatch[0]);
          } catch (_) {}
        }
      }
      const mergedVs = annotatedVs ? mergeItStatusIntoValueStream(valueStream, annotatedVs) : valueStream;
      global.pushOperationToHistory?.(item.createdAt, 'itStatus', JSON.parse(JSON.stringify(item)), (global.problemDetailChatMessages || []).length);
      global.updateDigitalProblemValueStreamItStatus?.(item.createdAt, mergedVs);
      global.currentProblemDetailItem = { ...item, valueStream: mergedVs, workflowAlignCompletedStages: [...new Set([...(item.workflowAlignCompletedStages || []), 0, 1])].sort((a, b) => a - b) };
      global.renderProblemDetailContent?.();
      const parseValueStreamGraph = global.parseValueStreamGraph || (() => ({ stages: [] }));
      const { stages: vsStages } = parseValueStreamGraph(mergedVs);
      const itStatusOutputData = [];
      for (const stage of vsStages || []) {
        const stageName = stage.name || '';
        for (const step of stage.steps || []) {
          const stepName = step.name || '';
          let itStatus = step.itStatusLabel || '';
          if (!itStatus) {
            const it = step.itStatus || step.it_status;
            itStatus = !it ? '' : (typeof it === 'object' ? (it.type === '手工' ? `手工-${it.detail || ''}` : it.type === '系统' ? `系统-${it.detail || ''}` : '') : String(it));
          }
          itStatusOutputData.push({ stageName, stepName, itStatus });
        }
      }
      global.pushAndSaveProblemDetailChat?.({ type: 'itStatusCard', taskId: 'task5', data: itStatusOutputData, timestamp: global.getTimeStr(), confirmed: false, llmMeta: { usage, model, durationMs } });
      const llmMeta = global.buildLlmMetaHtml?.({ usage, model, durationMs }) || '';
      const cardBlock = document.createElement('div');
      cardBlock.className = 'problem-detail-chat-msg problem-detail-chat-msg-system problem-detail-chat-value-stream-card problem-detail-chat-msg-with-delete';
      cardBlock.dataset.msgIndex = String((global.problemDetailChatMessages || []).length - 1);
      cardBlock.dataset.taskId = 'task5';
      const escapeHtml = global.escapeHtml || ((s) => (s == null ? '' : String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')));
      const itStatusJsonStr = escapeHtml(JSON.stringify(itStatusOutputData, null, 2));
      const deleteIcon = global.DELETE_CHAT_MSG_ICON || '';
      cardBlock.innerHTML = `
      <button type="button" class="btn-delete-chat-msg" aria-label="删除">${deleteIcon}</button>
      <div class="problem-detail-chat-value-stream-card-wrap">
        <div class="problem-detail-chat-value-stream-card-header">IT 现状标注 JSON（阶段名-环节名-IT 现状）</div>
        <div class="problem-detail-chat-value-stream-card-body"><pre class="problem-detail-chat-json-pre">${itStatusJsonStr}</pre></div>
        <div class="problem-detail-chat-value-stream-card-actions">
          <button type="button" class="btn-confirm-it-status btn-confirm-primary">确认</button>
          <button type="button" class="btn-redo-it-status">重做</button>
          <button type="button" class="btn-refine-modify" data-task-id="task5">修正</button>
          <button type="button" class="btn-refine-discuss" data-task-id="task5">讨论</button>
        </div>
      </div>
      <div class="problem-detail-chat-msg-time">${global.getTimeStr()}</div>${llmMeta}`;
      container.appendChild(cardBlock);
      container.scrollTop = container.scrollHeight;
      global.renderProblemDetailHistory?.();
      console.log('[task5] IT 现状标注流程完成，已渲染 itStatusCard 与沟通历史');
      if (typeof global.requestAnimationFrame === 'function') {
        global.requestAnimationFrame(() => global.showNextTaskStartNotification?.());
      } else {
        global.showNextTaskStartNotification?.();
      }
    } catch (err) {
      console.error('[task5] runItStatusAnnotation 异常', err);
      const errBlock = document.createElement('div');
      errBlock.className = 'problem-detail-chat-msg problem-detail-chat-msg-system';
      const escapeHtml = global.escapeHtml || ((s) => (s == null ? '' : String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')));
      errBlock.innerHTML = `<div class="problem-detail-chat-msg-content-wrap"><div class="problem-detail-chat-msg-content">IT 现状标注失败：${escapeHtml(err.message || String(err))}</div></div><div class="problem-detail-chat-msg-time">${global.getTimeStr()}</div>`;
      container.appendChild(errBlock);
      global.pushAndSaveProblemDetailChat?.({ role: 'system', content: 'IT 现状标注失败：' + (err.message || String(err)), timestamp: global.getTimeStr() });
    }
  }

  global.runItStatusAnnotation = runItStatusAnnotation;
  global.generateItStatusAnnotation = generateItStatusAnnotation;
  global.mergeItStatusIntoValueStream = mergeItStatusIntoValueStream;
  global.IT_STATUS_ANNOTATION_PROMPT = IT_STATUS_ANNOTATION_PROMPT;
})(typeof window !== 'undefined' ? window : this);
