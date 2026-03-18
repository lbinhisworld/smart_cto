/**
 * 任务4：价值流绘制（VSM）执行逻辑。
 *
 * 职责：
 * - 基于企业基本信息 / BMC / 需求逻辑，调用大模型生成价值流图 JSON；
 * - 将生成结果以聊天卡片形式推送到「问题详情 - 对话区」；
 * - 写入本地存储中的 valueStream，并标记工作流对齐阶段完成阶段0；
 * - 提供统一的入口函数 `runValueStreamGeneration` 供主流程调用。
 *
 * 依赖（由页面其他脚本提供的全局变量/函数）：
 * - 配置与工具：`hasAiConfig`、`fetchDeepSeekChat`、`VALUE_STREAM_PROMPT`、`getTimeStr`、`escapeHtml`
 * - 状态与渲染：`el`、`currentProblemDetailItem`、`renderProblemDetailContent`
 * - 会话与历史：`problemDetailChatMessages`、`pushAndSaveProblemDetailChat`、`pushOperationToHistory`、`buildLlmMetaHtml`
 * - 存储：`updateDigitalProblemValueStream`
 */
(function (global) {
  /**
   * 调用大模型，基于企业信息 / BMC / 需求逻辑生成价值流图。
   *
   * @param {Object|string} enterpriseInfo - 客户基本信息（对象或 JSON 字符串）。
   * @param {Object|string} bmcData - 商业模式画布 BMC（对象或 JSON 字符串）。
   * @param {Object|string} requirementLogic - 需求逻辑（对象或 JSON 字符串）。
   * @returns {Promise<{content: string, usage: any, model: string, durationMs: number}>}
   */
  async function generateValueStreamFromInputs(enterpriseInfo, bmcData, requirementLogic) {
    const userContent = `请基于以下三个维度的数据生成价值流图：

## 1. enterprise_info（客户基本信息）
\`\`\`json
${typeof enterpriseInfo === 'string' ? enterpriseInfo : JSON.stringify(enterpriseInfo || {}, null, 2)}
\`\`\`

## 2. bmc_data（商业模式画布 BMC）
\`\`\`json
${typeof bmcData === 'string' ? bmcData : JSON.stringify(bmcData || {}, null, 2)}
\`\`\`

## 3. requirement_logic（需求逻辑）
\`\`\`json
${typeof requirementLogic === 'string' ? requirementLogic : JSON.stringify(requirementLogic || {}, null, 2)}
\`\`\``;
    const systemPrompt =
      typeof global.VALUE_STREAM_PROMPT === 'string' && global.VALUE_STREAM_PROMPT.trim()
        ? global.VALUE_STREAM_PROMPT
        : '# 角色：价值流建模助手\n请根据后续提供的 enterprise_info / bmc_data / requirement_logic 三段 JSON，生成符合前端组件要求的价值流图 JSON。优先保证 JSON 语法正确。';
    const { content, usage, model, durationMs } = await global.fetchDeepSeekChat([
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userContent },
    ]);
    return { content, usage, model, durationMs, fullPrompt: userContent };
  }

  /**
   * 执行任务4：生成价值流图，并在对话区推送结果卡片、写入存储。
   *
   * 使用方式：
   * - 由任务调度入口调用：`runValueStreamGeneration()`
   * - 由「开始绘制价值流」确认按钮回调中调用。
   *
   * @returns {Promise<void>}
   */
  async function runValueStreamGeneration() {
    const container = global.el && global.el.problemDetailChatMessages;
    const item = typeof global.getCurrentProblemDetailItem === 'function'
      ? global.getCurrentProblemDetailItem()
      : global.currentProblemDetailItem;
    console.log('[task4] runValueStreamGeneration 调用', {
      hasContainer: !!container,
      hasItem: !!item,
      createdAt: item && item.createdAt,
    });
    if (!container || !item?.createdAt) {
      console.warn('[task4] 中断：缺少 container 或 currentProblemDetailItem.createdAt');
      return;
    }
    if (!global.hasAiConfig || !global.hasAiConfig()) {
      const msg = '请先配置 AI（local 模式填写 DEEPSEEK_API_KEY，online 模式配置 BACKEND_API_URL）才能使用价值流图生成功能。';
      const errBlock = document.createElement('div');
      errBlock.className = 'problem-detail-chat-msg problem-detail-chat-msg-system';
      errBlock.innerHTML = `<div class="problem-detail-chat-msg-content-wrap"><div class="problem-detail-chat-msg-content">${global.escapeHtml(
        msg
      )}</div></div><div class="problem-detail-chat-msg-time">${global.getTimeStr()}</div>`;
      container.appendChild(errBlock);
      global.pushAndSaveProblemDetailChat?.({ role: 'system', content: msg, timestamp: global.getTimeStr() });
      return;
    }
    const basicInfo = item.basicInfo || global.problemDetailConfirmedBasicInfo || {};
    const bmc = item.bmc || {};
    const requirementLogic = item.requirementLogic || {};
    try {
      const loadingBlock = document.createElement('div');
      loadingBlock.className = 'problem-detail-chat-msg problem-detail-chat-msg-system problem-detail-chat-msg-parsing';
      loadingBlock.innerHTML = `<div class="problem-detail-chat-msg-content-wrap"><div class="problem-detail-chat-parsing-inner"><span class="problem-detail-chat-spinner"></span><span class="problem-detail-chat-msg-content">正在生成需求相关核心价值流图 VSM…</span></div></div><div class="problem-detail-chat-msg-time">${global.getTimeStr()}</div>`;
      container.appendChild(loadingBlock);
      container.scrollTop = container.scrollHeight;
      console.log('[task4] 准备调用 generateValueStreamFromInputs', {
        basicInfoKeys: Object.keys(basicInfo || {}),
        hasBmc: !!bmc && Object.keys(bmc || {}).length > 0,
        hasRequirementLogic: !!requirementLogic && Object.keys(requirementLogic || {}).length > 0,
      });
      const { content, usage, model, durationMs, fullPrompt } = await generateValueStreamFromInputs(basicInfo, bmc, requirementLogic);
      console.log('[task4] generateValueStreamFromInputs 返回', {
        model,
        durationMs,
        contentPreview: (content || '').slice(0, 120),
      });
      loadingBlock.remove();
      // 向时间线推送 LLM-查询 内容块（输入/输出双子卡片，与 task1～3 一致）
      global.pushAndSaveProblemDetailChat?.({
        role: 'system',
        type: 'task4LlmQueryBlock',
        taskId: 'task4',
        noteName: '价值流图生成',
        llmInputPrompt: fullPrompt != null ? String(fullPrompt) : '',
        llmOutputRaw: content != null ? String(content) : '',
        llmMeta: { usage, model, durationMs },
        timestamp: global.getTimeStr(),
        confirmed: false,
      });
      // 优先解析新格式：整段为单一 JSON，含 logic_description + vsm_data
      const contentTrim = (content != null ? String(content) : '').trim();
      let valueStream = null;
      let logicText = '';
      try {
        const parsed = JSON.parse(contentTrim);
        if (parsed && typeof parsed === 'object') {
          if (parsed.vsm_data && (parsed.vsm_data.stages || parsed.vsm_data.connections)) {
            valueStream = parsed.vsm_data;
            logicText = (parsed.logic_description != null ? String(parsed.logic_description) : '').trim();
          } else if (Array.isArray(parsed.stages) || Array.isArray(parsed.connections)) {
            valueStream = parsed;
            logicText = (parsed.logic_description != null ? String(parsed.logic_description) : '').trim();
          }
        }
      } catch (_) {}
      // 兼容旧格式：Markdown 代码块或正文+代码块
      if (!valueStream) {
        const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/);
        let valueStreamJson = null;
        if (jsonMatch) {
          try {
            valueStreamJson = JSON.parse(jsonMatch[1].trim());
          } catch (_) {}
        }
        if (!valueStreamJson) {
          const fallbackMatch = content.match(/\{[\s\S]*\}/);
          if (fallbackMatch) {
            try {
              valueStreamJson = JSON.parse(fallbackMatch[0]);
            } catch (_) {}
          }
        }
        valueStream = valueStreamJson || { raw: content };
        logicText = logicText || content.replace(/```[\s\S]*?```/g, '').trim();
      }
      if (logicText && typeof global.updateDigitalProblemValueStreamLogicText === 'function') {
        global.updateDigitalProblemValueStreamLogicText(item.createdAt, logicText);
      }
      console.log('[task4] 解析后的 valueStream', {
        hasStages: Array.isArray(valueStream && valueStream.stages),
        stagesLength: Array.isArray(valueStream && valueStream.stages) ? valueStream.stages.length : null,
      });
      global.pushOperationToHistory?.(
        item.createdAt,
        'valueStreamDraw',
        JSON.parse(JSON.stringify(item)),
        global.problemDetailChatMessages ? global.problemDetailChatMessages.length : 0
      );
      global.pushAndSaveProblemDetailChat?.({
        type: 'valueStreamCard',
        taskId: 'task4',
        data: valueStream,
        logicText: logicText,
        timestamp: global.getTimeStr(),
        confirmed: false,
        llmMeta: { usage, model, durationMs },
      });
      const llmMetaHtml = global.buildLlmMetaHtml ? global.buildLlmMetaHtml({ usage, model, durationMs }) : '';
      const cardBlock = document.createElement('div');
      cardBlock.className =
        'problem-detail-chat-msg problem-detail-chat-msg-system problem-detail-chat-value-stream-card problem-detail-chat-msg-with-delete';
      cardBlock.dataset.msgIndex = String((global.problemDetailChatMessages || []).length - 1);
      cardBlock.dataset.taskId = 'task4';
      const jsonStr = global.escapeHtml(JSON.stringify(valueStream, null, 2));
      const dataAttr = String(JSON.stringify(valueStream))
        .replace(/&/g, '&amp;')
        .replace(/"/g, '&quot;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
      cardBlock.innerHTML = `
      <button type="button" class="btn-delete-chat-msg" aria-label="删除">${global.DELETE_CHAT_MSG_ICON || '×'}</button>
      <div class="problem-detail-chat-value-stream-card-wrap">
        <div class="problem-detail-chat-value-stream-card-header">价值流图设计 JSON</div>
        <div class="problem-detail-chat-value-stream-card-body"><pre class="problem-detail-chat-json-pre">${jsonStr}</pre></div>
        <div class="problem-detail-chat-value-stream-card-actions">
          <button type="button" class="btn-confirm-value-stream btn-confirm-primary" data-json="${dataAttr}">确认</button>
          <button type="button" class="btn-redo-value-stream">重做</button>
          <button type="button" class="btn-refine-modify">修正</button>
          <button type="button" class="btn-refine-discuss">讨论</button>
        </div>
      </div>
      <div class="problem-detail-chat-msg-time">${global.getTimeStr()}</div>${llmMetaHtml}`;
      container.appendChild(cardBlock);
      container.scrollTop = container.scrollHeight;
      global.updateDigitalProblemValueStream?.(item.createdAt, valueStream);
      global.currentProblemDetailItem = {
        ...item,
        valueStream,
        valueStreamLogicText: logicText || item.valueStreamLogicText || '',
        workflowAlignCompletedStages: [...(item.workflowAlignCompletedStages || []).filter((x) => x !== 0), 0].sort((a, b) => a - b),
      };
      global.renderProblemDetailContent?.();
    } catch (err) {
      const errBlock = document.createElement('div');
      errBlock.className = 'problem-detail-chat-msg problem-detail-chat-msg-system';
      errBlock.innerHTML = `<div class="problem-detail-chat-msg-content-wrap"><div class="problem-detail-chat-msg-content">价值流图生成失败：${global.escapeHtml(
        err.message || String(err)
      )}</div></div><div class="problem-detail-chat-msg-time">${global.getTimeStr()}</div>`;
      container.appendChild(errBlock);
      global.pushAndSaveProblemDetailChat?.({
        role: 'system',
        content: '价值流图生成失败：' + (err.message || String(err)),
        timestamp: global.getTimeStr(),
      });
    }
  }

  global.generateValueStreamFromInputs = generateValueStreamFromInputs;
  global.runValueStreamGeneration = runValueStreamGeneration;
})(typeof window !== 'undefined' ? window : this);

