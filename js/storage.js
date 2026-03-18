/**
 * 本地存储与 session 状态读写（依赖 js/config.js 中的 STORAGE_KEY 等常量）
 */
(function (global) {
  /**
   * 读取已保存的企业分析列表。
   * @returns {Array<Object>} 分析记录数组。
   */
  function getSavedAnalyses() {
    try {
      const raw = localStorage.getItem(global.STORAGE_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  }

  /**
   * 保存或覆盖同名企业分析记录。
   * @param {Object} record - 分析记录。
   * @returns {void}
   */
  function saveAnalysis(record) {
    const list = getSavedAnalyses();
    const idx = list.findIndex((r) => (r.companyName || '').trim() === (record.companyName || '').trim());
    if (idx >= 0) list[idx] = record;
    else list.push(record);
    localStorage.setItem(global.STORAGE_KEY, JSON.stringify(list));
  }

  /**
   * 保存当前路由状态到会话存储。
   * @param {string} view - 当前视图标识。
   * @param {Object} params - 路由参数。
   * @returns {void}
   */
  function saveRouteState(view, params) {
    try {
      sessionStorage.setItem(global.ROUTE_STORAGE_KEY, JSON.stringify({ view, params: params || {} }));
    } catch (_) {}
  }

  /**
   * 获取工具知识状态。
   * @returns {Object} 工具知识状态对象。
   */
  function getToolKnowledgeState() {
    try {
      const raw = localStorage.getItem(global.TOOL_KNOWLEDGE_STORAGE_KEY);
      if (!raw) return {};
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === 'object' ? parsed : {};
    } catch {
      return {};
    }
  }

  /**
   * 保存工具知识状态。
   * @param {Object} state - 待保存状态。
   * @returns {void}
   */
  function saveToolKnowledgeState(state) {
    try {
      localStorage.setItem(global.TOOL_KNOWLEDGE_STORAGE_KEY, JSON.stringify(state || {}));
    } catch {
      // ignore
    }
  }

  /**
   * 从本地存储恢复工具知识条目到内存数组。
   * @returns {void}
   */
  function loadToolKnowledgeItemsFromStorage() {
    try {
      const raw = localStorage.getItem(global.TOOL_KNOWLEDGE_ITEMS_STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return;
      global.TOOL_KNOWLEDGE_ITEMS.length = 0;
      parsed.forEach((item) => {
        if (!item || !item.id || !item.name) return;
        global.TOOL_KNOWLEDGE_ITEMS.push({
          id: String(item.id),
          name: String(item.name),
          description: typeof item.description === 'string' ? item.description : '',
        });
      });
    } catch {
      // ignore
    }
  }

  /**
   * 将工具知识条目写入本地存储。
   * @returns {void}
   */
  function saveToolKnowledgeItemsToStorage() {
    try {
      localStorage.setItem(global.TOOL_KNOWLEDGE_ITEMS_STORAGE_KEY, JSON.stringify(global.TOOL_KNOWLEDGE_ITEMS));
    } catch {
      // ignore
    }
  }

  /**
   * 将工具聊天面板 HTML 持久化到本地存储。
   * @returns {void}
   */
  function saveToolsChatMessagesToStorage() {
    try {
      const el = global.el;
      const container = el && el.toolsChatMessages;
      if (!container) return;
      localStorage.setItem(global.TOOL_KNOWLEDGE_CHAT_STORAGE_KEY, container.innerHTML || '');
    } catch {
      // ignore
    }
  }

  /**
   * 从本地存储恢复工具聊天面板 HTML。
   * @returns {void}
   */
  function restoreToolsChatMessagesFromStorage() {
    try {
      const el = global.el;
      const container = el && el.toolsChatMessages;
      if (!container) return;
      const raw = localStorage.getItem(global.TOOL_KNOWLEDGE_CHAT_STORAGE_KEY);
      if (!raw) return;
      container.innerHTML = raw;
    } catch {
      // ignore
    }
  }

  /**
   * 读取数字化问题列表。
   * @returns {Array<Object>} 问题列表。
   */
  function getDigitalProblems() {
    try {
      const raw = localStorage.getItem(global.DIGITAL_PROBLEMS_STORAGE_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  }

  /**
   * 新增一条数字化问题记录。
   * @param {Object} item - 问题对象。
   * @returns {void}
   */
  function saveDigitalProblem(item) {
    const list = getDigitalProblems();
    list.unshift({ ...item, createdAt: new Date().toISOString() });
    localStorage.setItem(global.DIGITAL_PROBLEMS_STORAGE_KEY, JSON.stringify(list));
  }

  /**
   * 按索引删除数字化问题。
   * @param {number} index - 列表索引。
   * @returns {void}
   */
  function removeDigitalProblem(index) {
    const list = getDigitalProblems();
    if (index < 0 || index >= list.length) return;
    list.splice(index, 1);
    localStorage.setItem(global.DIGITAL_PROBLEMS_STORAGE_KEY, JSON.stringify(list));
  }

  /** @param {boolean} [markTaskComplete=true] 为 false 时仅保存数据，不更新 completedStages（等用户点击「已完成」后再更新） */
  function updateDigitalProblemBasicInfo(createdAt, basicInfo, markTaskComplete) {
    const list = getDigitalProblems();
    const idx = list.findIndex((it) => it.createdAt === createdAt);
    if (idx < 0) return;
    const item = list[idx];
    if (markTaskComplete !== false) {
      const completed = item.completedStages || [];
      if (!completed.includes(0)) completed.push(0);
      completed.sort((a, b) => a - b);
      list[idx] = { ...item, basicInfo, completedStages: completed };
    } else {
      list[idx] = { ...item, basicInfo };
    }
    localStorage.setItem(global.DIGITAL_PROBLEMS_STORAGE_KEY, JSON.stringify(list));
  }

  /** @param {boolean} [markTaskComplete=true] 为 false 时仅保存数据，不更新 completedStages（等用户点击「已完成」后再更新） */
  function updateDigitalProblemBmc(createdAt, bmc, markTaskComplete) {
    const list = getDigitalProblems();
    const idx = list.findIndex((it) => it.createdAt === createdAt);
    if (idx < 0) return;
    const item = list[idx];
    if (markTaskComplete !== false) {
      const completed = item.completedStages || [];
      if (!completed.includes(1)) completed.push(1);
      completed.sort((a, b) => a - b);
      list[idx] = { ...item, bmc, completedStages: completed };
    } else {
      list[idx] = { ...item, bmc };
    }
    localStorage.setItem(global.DIGITAL_PROBLEMS_STORAGE_KEY, JSON.stringify(list));
  }

  /** @param {boolean} [markTaskComplete=true] 为 false 时仅保存数据，不更新 completedStages（等用户点击「已完成」后再更新） */
  function updateDigitalProblemRequirementLogic(createdAt, requirementLogic, markTaskComplete) {
    const list = getDigitalProblems();
    const idx = list.findIndex((it) => it.createdAt === createdAt);
    if (idx < 0) return;
    const item = list[idx];
    if (markTaskComplete !== false) {
      const completed = item.completedStages || [];
      if (!completed.includes(2)) completed.push(2);
      completed.sort((a, b) => a - b);
      list[idx] = { ...item, requirementLogic, completedStages: completed };
    } else {
      list[idx] = { ...item, requirementLogic };
    }
    localStorage.setItem(global.DIGITAL_PROBLEMS_STORAGE_KEY, JSON.stringify(list));
  }

  function updateDigitalProblemMajorStage(createdAt, majorStage) {
    const list = getDigitalProblems();
    const idx = list.findIndex((it) => it.createdAt === createdAt);
    if (idx < 0) return;
    const item = list[idx];
    list[idx] = { ...item, currentMajorStage: majorStage };
    localStorage.setItem(global.DIGITAL_PROBLEMS_STORAGE_KEY, JSON.stringify(list));
  }

  /**
   * 更新 ITGap 阶段完成标记数组。
   * @param {string} createdAt - 问题创建时间。
   * @param {number[]} stages - 已完成阶段索引。
   * @returns {void}
   */
  function updateDigitalProblemItGapCompletedStages(createdAt, stages) {
    const list = getDigitalProblems();
    const idx = list.findIndex((it) => it.createdAt === createdAt);
    if (idx < 0) return;
    const item = list[idx];
    list[idx] = { ...item, itGapCompletedStages: stages };
    localStorage.setItem(global.DIGITAL_PROBLEMS_STORAGE_KEY, JSON.stringify(list));
  }

  /**
   * 记录某任务 ID 为已完成。
   * @param {string} createdAt - 问题创建时间。
   * @param {string} taskId - 任务 ID。
   * @returns {void}
   */
  function updateDigitalProblemCompletedTaskId(createdAt, taskId) {
    const list = getDigitalProblems();
    const idx = list.findIndex((it) => it.createdAt === createdAt);
    if (idx < 0) return;
    const item = list[idx];
    const completed = item.completedTaskIds || [];
    if (completed.includes(taskId)) return;
    list[idx] = { ...item, completedTaskIds: [...completed, taskId].sort() };
    localStorage.setItem(global.DIGITAL_PROBLEMS_STORAGE_KEY, JSON.stringify(list));
  }

  /**
   * 更新全局 ITGap 分析结果并推进对应阶段状态。
   * @param {string} createdAt - 问题创建时间。
   * @param {Object|string} analysisJson - 分析结果。
   * @returns {void}
   */
  function updateDigitalProblemGlobalItGapAnalysis(createdAt, analysisJson) {
    const list = getDigitalProblems();
    const idx = list.findIndex((it) => it.createdAt === createdAt);
    if (idx < 0) return;
    const item = list[idx];
    const itGapCompleted = item.itGapCompletedStages || [];
    if (!itGapCompleted.includes(1)) itGapCompleted.push(1);
    itGapCompleted.sort((a, b) => a - b);
    list[idx] = { ...item, globalItGapAnalysisJson: analysisJson, itGapCompletedStages: itGapCompleted };
    localStorage.setItem(global.DIGITAL_PROBLEMS_STORAGE_KEY, JSON.stringify(list));
  }

  /**
   * 清除全局 ITGap 及相关局部分析数据。
   * @param {string} createdAt - 问题创建时间。
   * @returns {void}
   */
  function clearDigitalProblemGlobalItGapAnalysis(createdAt) {
    const list = getDigitalProblems();
    const idx = list.findIndex((it) => it.createdAt === createdAt);
    if (idx < 0) return;
    const item = list[idx];
    const itGapCompleted = (item.itGapCompletedStages || []).filter((x) => x !== 1 && x !== 2).sort((a, b) => a - b);
    const { globalItGapAnalysisJson, localItGapAnalyses, localItGapSessions, ...rest } = item;
    list[idx] = { ...rest, itGapCompletedStages: itGapCompleted };
    localStorage.setItem(global.DIGITAL_PROBLEMS_STORAGE_KEY, JSON.stringify(list));
  }

  /**
   * 更新局部 ITGap session 列表。
   * @param {string} createdAt - 问题创建时间。
   * @param {Array<Object>} sessions - session 列表。
   * @returns {void}
   */
  function updateDigitalProblemLocalItGapSessions(createdAt, sessions) {
    const list = getDigitalProblems();
    const idx = list.findIndex((it) => it.createdAt === createdAt);
    if (idx < 0) return;
    const item = list[idx];
    list[idx] = { ...item, localItGapSessions: sessions };
    localStorage.setItem(global.DIGITAL_PROBLEMS_STORAGE_KEY, JSON.stringify(list));
  }

  /**
   * 更新某个环节的局部 ITGap 分析内容。
   * @param {string} createdAt - 问题创建时间。
   * @param {string} stepName - 环节名。
   * @param {number} stepIndex - 环节索引。
   * @param {Object|string} analysisJson - 分析 JSON。
   * @param {string} analysisMarkdown - 分析 Markdown。
   * @returns {void}
   */
  function updateDigitalProblemLocalItGapAnalysis(createdAt, stepName, stepIndex, analysisJson, analysisMarkdown) {
    const list = getDigitalProblems();
    const idx = list.findIndex((it) => it.createdAt === createdAt);
    if (idx < 0) return;
    const item = list[idx];
    const analyses = item.localItGapAnalyses || [];
    const existing = analyses.findIndex((a) => a.stepIndex === stepIndex);
    const entry = { stepName, stepIndex, analysisJson };
    const newAnalyses = existing >= 0 ? analyses.map((a, i) => (i === existing ? entry : a)) : [...analyses, entry].sort((a, b) => a.stepIndex - b.stepIndex);
    const itGapCompleted = item.itGapCompletedStages || [];
    if (!itGapCompleted.includes(2)) itGapCompleted.push(2);
    itGapCompleted.sort((a, b) => a - b);
    const sessions = item.localItGapSessions || [];
    if (sessions.length > 0) {
      const newSessions = sessions.map((s) =>
        s.stepIndex === stepIndex ? { ...s, analysisJson, analysisMarkdown: analysisMarkdown || s.analysisMarkdown } : s
      );
      list[idx] = { ...item, localItGapAnalyses: newAnalyses, localItGapSessions: newSessions, itGapCompletedStages: itGapCompleted };
    } else {
      list[idx] = { ...item, localItGapAnalyses: newAnalyses, itGapCompletedStages: itGapCompleted };
    }
    localStorage.setItem(global.DIGITAL_PROBLEMS_STORAGE_KEY, JSON.stringify(list));
  }

  /** 清除某环节的局部 ITGap 分析结果，便于该环节重做 */
  function clearDigitalProblemLocalItGapStep(createdAt, stepIndex) {
    const list = getDigitalProblems();
    const idx = list.findIndex((it) => it.createdAt === createdAt);
    if (idx < 0) return;
    const item = list[idx];
    const sessions = item.localItGapSessions || [];
    const analyses = (item.localItGapAnalyses || []).filter((a) => a.stepIndex !== stepIndex);
    const newSessions = sessions.map((s) =>
      s.stepIndex === stepIndex ? { ...s, analysisJson: undefined, analysisMarkdown: undefined } : s
    );
    list[idx] = { ...item, localItGapSessions: newSessions, localItGapAnalyses: analyses };
    localStorage.setItem(global.DIGITAL_PROBLEMS_STORAGE_KEY, JSON.stringify(list));
  }

  /** 更新角色与权限模型推演 session 列表（用于逐步按环节分析） */
  function updateDigitalProblemRolePermissionSessions(createdAt, sessions) {
    const list = getDigitalProblems();
    const idx = list.findIndex((it) => it.createdAt === createdAt);
    if (idx < 0) return;
    const item = list[idx];
    list[idx] = { ...item, rolePermissionSessions: sessions };
    localStorage.setItem(global.DIGITAL_PROBLEMS_STORAGE_KEY, JSON.stringify(list));
  }

  /** 更新某环节的角色与权限推演结果 */
  function updateDigitalProblemRolePermissionStep(createdAt, stepIndex, rolePermissionJson) {
    const list = getDigitalProblems();
    const idx = list.findIndex((it) => it.createdAt === createdAt);
    if (idx < 0) return;
    const item = list[idx];
    const sessions = item.rolePermissionSessions || [];
    const newSessions = sessions.map((s) =>
      s.stepIndex === stepIndex ? { ...s, rolePermissionJson } : s
    );
    list[idx] = { ...item, rolePermissionSessions: newSessions };
    localStorage.setItem(global.DIGITAL_PROBLEMS_STORAGE_KEY, JSON.stringify(list));
  }

  /** 清除某环节的角色与权限推演结果，便于重做 */
  function clearDigitalProblemRolePermissionStep(createdAt, stepIndex) {
    const list = getDigitalProblems();
    const idx = list.findIndex((it) => it.createdAt === createdAt);
    if (idx < 0) return;
    const item = list[idx];
    const sessions = item.rolePermissionSessions || [];
    const newSessions = sessions.map((s) =>
      s.stepIndex === stepIndex ? { ...s, rolePermissionJson: undefined } : s
    );
    list[idx] = { ...item, rolePermissionSessions: newSessions };
    localStorage.setItem(global.DIGITAL_PROBLEMS_STORAGE_KEY, JSON.stringify(list));
  }

  /** 更新核心业务对象推演 session 列表（用于逐步按环节分析） */
  function updateDigitalProblemCoreBusinessObjectSessions(createdAt, sessions) {
    const list = getDigitalProblems();
    const idx = list.findIndex((it) => it.createdAt === createdAt);
    if (idx < 0) return;
    const item = list[idx];
    list[idx] = { ...item, coreBusinessObjectSessions: sessions };
    localStorage.setItem(global.DIGITAL_PROBLEMS_STORAGE_KEY, JSON.stringify(list));
  }

  /** 仅更新 valueStream 数据，不修改 workflowAlignCompletedStages（用于用户点击价值流 JSON 确认后，待用户再点「已完成」再推进阶段） */
  function updateDigitalProblemValueStreamDataOnly(createdAt, valueStream) {
    const list = getDigitalProblems();
    const idx = list.findIndex((it) => it.createdAt === createdAt);
    if (idx < 0) return;
    const item = list[idx];
    list[idx] = { ...item, valueStream };
    localStorage.setItem(global.DIGITAL_PROBLEMS_STORAGE_KEY, JSON.stringify(list));
  }

  /**
   * 更新价值流并推进工作流对齐阶段到「价值流已完成」。
   * @param {string} createdAt - 问题创建时间。
   * @param {Object} valueStream - 价值流数据。
   * @returns {void}
   */
  function updateDigitalProblemValueStream(createdAt, valueStream) {
    const list = getDigitalProblems();
    const idx = list.findIndex((it) => it.createdAt === createdAt);
    if (idx < 0) return;
    const item = list[idx];
    const wfCompleted = item.workflowAlignCompletedStages || [];
    if (!wfCompleted.includes(0)) wfCompleted.push(0);
    wfCompleted.sort((a, b) => a - b);
    list[idx] = { ...item, valueStream, workflowAlignCompletedStages: wfCompleted };
    localStorage.setItem(global.DIGITAL_PROBLEMS_STORAGE_KEY, JSON.stringify(list));
  }

  /**
   * 更新价值流设计逻辑说明（大模型返回的逻辑说明部分文字）。
   * @param {string} createdAt - 问题创建时间。
   * @param {string} logicText - 逻辑说明正文。
   * @returns {void}
   */
  function updateDigitalProblemValueStreamLogicText(createdAt, logicText) {
    const list = getDigitalProblems();
    const idx = list.findIndex((it) => it.createdAt === createdAt);
    if (idx < 0) return;
    const item = list[idx];
    list[idx] = { ...item, valueStreamLogicText: logicText != null ? String(logicText) : '' };
    localStorage.setItem(global.DIGITAL_PROBLEMS_STORAGE_KEY, JSON.stringify(list));
  }

  /**
   * 更新价值流 IT 现状并推进对应完成阶段。
   * @param {string} createdAt - 问题创建时间。
   * @param {Object} valueStream - 价值流数据。
   * @returns {void}
   */
  function updateDigitalProblemValueStreamItStatus(createdAt, valueStream) {
    const list = getDigitalProblems();
    const idx = list.findIndex((it) => it.createdAt === createdAt);
    if (idx < 0) return;
    const item = list[idx];
    const wfCompleted = item.workflowAlignCompletedStages || [];
    if (!wfCompleted.includes(0)) wfCompleted.push(0);
    if (!wfCompleted.includes(1)) wfCompleted.push(1);
    wfCompleted.sort((a, b) => a - b);
    list[idx] = { ...item, valueStream, workflowAlignCompletedStages: wfCompleted };
    localStorage.setItem(global.DIGITAL_PROBLEMS_STORAGE_KEY, JSON.stringify(list));
  }

  /**
   * 更新价值流痛点并推进对应完成阶段。
   * @param {string} createdAt - 问题创建时间。
   * @param {Object} valueStream - 价值流数据。
   * @returns {void}
   */
  function updateDigitalProblemValueStreamPainPoint(createdAt, valueStream) {
    const list = getDigitalProblems();
    const idx = list.findIndex((it) => it.createdAt === createdAt);
    if (idx < 0) return;
    const item = list[idx];
    const wfCompleted = item.workflowAlignCompletedStages || [];
    if (!wfCompleted.includes(0)) wfCompleted.push(0);
    if (!wfCompleted.includes(1)) wfCompleted.push(1);
    if (!wfCompleted.includes(2)) wfCompleted.push(2);
    wfCompleted.sort((a, b) => a - b);
    list[idx] = { ...item, valueStream, workflowAlignCompletedStages: wfCompleted };
    localStorage.setItem(global.DIGITAL_PROBLEMS_STORAGE_KEY, JSON.stringify(list));
  }

  /**
   * 更新痛点标注 session 列表（环节列表，用于逐环节标注）。
   * @param {string} createdAt - 问题创建时间。
   * @param {Array<{stepName: string, stepIndex: number, stageName?: string, painPoint?: string|null}>} sessions - session 列表。
   * @returns {void}
   */
  function updateDigitalProblemPainPointSessions(createdAt, sessions) {
    const list = getDigitalProblems();
    const idx = list.findIndex((it) => it.createdAt === createdAt);
    if (idx < 0) return;
    const item = list[idx];
    list[idx] = { ...item, painPointSessions: sessions };
    localStorage.setItem(global.DIGITAL_PROBLEMS_STORAGE_KEY, JSON.stringify(list));
  }

  /**
   * 更新某环节的痛点标注结果，并写回价值流。
   * @param {string} createdAt - 问题创建时间。
   * @param {number} stepIndex - 环节索引（全局顺序）。
   * @param {string} painPoint - 该环节的痛点文案。
   * @returns {void}
   */
  function updateDigitalProblemPainPointStep(createdAt, stepIndex, painPoint) {
    const list = getDigitalProblems();
    const idx = list.findIndex((it) => it.createdAt === createdAt);
    if (idx < 0) return;
    const item = list[idx];
    const sessions = item.painPointSessions || [];
    const newSessions = sessions.map((s) =>
      s.stepIndex === stepIndex ? { ...s, painPoint: painPoint || null } : s
    );
    const valueStream = item.valueStream;
    if (!valueStream || valueStream.raw || !Array.isArray(valueStream.stages)) {
      list[idx] = { ...item, painPointSessions: newSessions };
      localStorage.setItem(global.DIGITAL_PROBLEMS_STORAGE_KEY, JSON.stringify(list));
      return;
    }
    let globalStep = 0;
    const stages = valueStream.stages.map((s) => {
      const rawSteps = s.steps ?? s.tasks ?? s.phases ?? s.items ?? [];
      const steps = rawSteps.map((st) => {
        const step = typeof st === 'object' && st != null ? { ...st } : { name: String(st) };
        if (globalStep === stepIndex) {
          if (painPoint != null) {
            step.painPoint = step.pain_point = painPoint;
          } else {
            delete step.painPoint;
            delete step.pain_point;
          }
        }
        globalStep += 1;
        return step;
      });
      return { ...s, steps };
    });
    const mergedVs = { ...valueStream, stages };
    list[idx] = { ...item, painPointSessions: newSessions, valueStream: mergedVs };
    localStorage.setItem(global.DIGITAL_PROBLEMS_STORAGE_KEY, JSON.stringify(list));
  }

  /**
   * 回滚价值流痛点标注及阶段完成标记。
   * @param {string} createdAt - 问题创建时间。
   * @returns {void}
   */
  function rollbackValueStreamPainPoint(createdAt) {
    const list = getDigitalProblems();
    const idx = list.findIndex((it) => it.createdAt === createdAt);
    if (idx < 0) return;
    const item = list[idx];
    const valueStream = item.valueStream;
    if (!valueStream || valueStream.raw) return;
    const rawStages = valueStream.stages ?? valueStream.phases ?? valueStream.nodes ?? [];
    if (!Array.isArray(rawStages)) return;
    const stages = rawStages.map((s) => {
      if (!s || typeof s !== 'object') return s;
      const rawSteps = s.steps ?? s.tasks ?? s.phases ?? s.items ?? [];
      const steps = rawSteps.map((st) => {
        if (typeof st !== 'object' || st == null) return st;
        const { painPoint, pain_point, ...rest } = st;
        return rest;
      });
      return { ...s, steps };
    });
    const vsWithoutPain = { ...valueStream, stages };
    const wfCompleted = (item.workflowAlignCompletedStages || []).filter((x) => x !== 2).sort((a, b) => a - b);
    list[idx] = { ...item, valueStream: vsWithoutPain, workflowAlignCompletedStages: wfCompleted };
    localStorage.setItem(global.DIGITAL_PROBLEMS_STORAGE_KEY, JSON.stringify(list));
  }

  /**
   * 删除需求逻辑并回滚需求理解阶段完成标记。
   * @param {string} createdAt - 问题创建时间。
   * @returns {void}
   */
  function deleteDigitalProblemRequirementLogic(createdAt) {
    const list = getDigitalProblems();
    const idx = list.findIndex((it) => it.createdAt === createdAt);
    if (idx < 0) return;
    const item = list[idx];
    const { requirementLogic, ...rest } = item;
    const completedStages = (item.completedStages || []).filter((x) => x !== 2).sort((a, b) => a - b);
    list[idx] = { ...rest, completedStages };
    localStorage.setItem(global.DIGITAL_PROBLEMS_STORAGE_KEY, JSON.stringify(list));
  }

  /**
   * 获取问题详情聊天记录映射。
   * @returns {Record<string, Array<Object>>} 以 createdAt 为 key 的聊天记录。
   */
  function getProblemDetailChats() {
    try {
      const raw = localStorage.getItem(global.PROBLEM_DETAIL_CHATS_STORAGE_KEY);
      return raw ? JSON.parse(raw) : {};
    } catch {
      return {};
    }
  }

  /**
   * 保存某问题的详情聊天记录。
   * @param {string} createdAt - 问题创建时间。
   * @param {Array<Object>} messages - 聊天消息数组。
   * @returns {void}
   */
  function saveProblemDetailChat(createdAt, messages) {
    const chats = getProblemDetailChats();
    chats[createdAt] = messages;
    localStorage.setItem(global.PROBLEM_DETAIL_CHATS_STORAGE_KEY, JSON.stringify(chats));
  }

  /**
   * 获取操作历史栈映射。
   * @returns {Record<string, Array<Object>>} 历史记录映射。
   */
  function getOperationHistory() {
    try {
      const raw = localStorage.getItem(global.OPERATION_HISTORY_STORAGE_KEY);
      return raw ? JSON.parse(raw) : {};
    } catch {
      return {};
    }
  }

  /**
   * 向操作历史压栈一条记录。
   * @param {string} createdAt - 问题创建时间。
   * @param {string} type - 操作类型。
   * @param {Object} snapshot - 数据快照。
   * @param {number} chatLengthBefore - 操作前聊天长度。
   * @returns {void}
   */
  function pushOperationToHistory(createdAt, type, snapshot, chatLengthBefore) {
    const all = getOperationHistory();
    if (!all[createdAt]) all[createdAt] = [];
    all[createdAt].push({ type, timestamp: Date.now(), snapshot, chatLengthBefore });
    localStorage.setItem(global.OPERATION_HISTORY_STORAGE_KEY, JSON.stringify(all));
  }

  /**
   * 从操作历史弹出最近一条记录。
   * @param {string} createdAt - 问题创建时间。
   * @returns {Object|null} 最近一次历史记录。
   */
  function popOperationFromHistory(createdAt) {
    const all = getOperationHistory();
    const stack = all[createdAt];
    if (!Array.isArray(stack) || stack.length === 0) return null;
    const entry = stack.pop();
    all[createdAt] = stack;
    localStorage.setItem(global.OPERATION_HISTORY_STORAGE_KEY, JSON.stringify(all));
    return entry;
  }

  /**
   * 使用快照恢复问题单数据。
   * @param {string} createdAt - 问题创建时间。
   * @param {Object} snapshot - 快照对象。
   * @returns {void}
   */
  function restoreItemFromSnapshot(createdAt, snapshot) {
    const list = getDigitalProblems();
    const idx = list.findIndex((it) => String(it.createdAt) === String(createdAt));
    if (idx < 0) return;
    list[idx] = { ...snapshot, createdAt };
    localStorage.setItem(global.DIGITAL_PROBLEMS_STORAGE_KEY, JSON.stringify(list));
  }

  /**
   * 获取任务跟踪数据映射。
   * @returns {Record<string, Object>} 跟踪数据映射。
   */
  function getTaskTrackingData() {
    try {
      const raw = localStorage.getItem(global.TASK_TRACKING_STORAGE_KEY);
      return raw ? JSON.parse(raw) : {};
    } catch {
      return {};
    }
  }

  /**
   * 保存某问题的任务跟踪数据。
   * @param {string} createdAt - 问题创建时间。
   * @param {Object} data - 跟踪数据。
   * @returns {void}
   */
  function saveTaskTrackingData(createdAt, data) {
    const all = getTaskTrackingData();
    all[createdAt] = data;
    localStorage.setItem(global.TASK_TRACKING_STORAGE_KEY, JSON.stringify(all));
  }

  /** 回退到上一个任务阶段：清空上一阶段所有数据，将 currentMajorStage 设为上一阶段，并返回更新后的问题单；若已在阶段 0 则返回 null */
  function rollbackDigitalProblemToPreviousStage(createdAt) {
    const list = getDigitalProblems();
    const idx = list.findIndex((it) => it.createdAt === createdAt);
    if (idx < 0) return null;
    const item = list[idx];
    const currentMajorStage = item.currentMajorStage ?? 0;
    if (currentMajorStage <= 0) return null;
    const targetStage = currentMajorStage - 1;
    let nextItem = { ...item, currentMajorStage: targetStage };
    if (targetStage === 0) {
      nextItem = {
        ...nextItem,
        completedStages: [],
        basicInfo: undefined,
        bmc: undefined,
        requirementLogic: undefined,
        workflowAlignCompletedStages: [],
        itGapCompletedStages: [],
        valueStream: undefined,
        globalItGapAnalysisJson: undefined,
        localItGapSessions: undefined,
        localItGapAnalyses: undefined,
        completedTaskIds: [],
      };
    } else if (targetStage === 1) {
      nextItem = {
        ...nextItem,
        workflowAlignCompletedStages: [],
        valueStream: undefined,
        itGapCompletedStages: [],
        globalItGapAnalysisJson: undefined,
        localItGapSessions: undefined,
        localItGapAnalyses: undefined,
        completedTaskIds: [],
      };
    } else if (targetStage === 2) {
      nextItem = {
        ...nextItem,
        itGapCompletedStages: [],
        globalItGapAnalysisJson: undefined,
        localItGapSessions: undefined,
        localItGapAnalyses: undefined,
        completedTaskIds: [],
      };
    }
    list[idx] = nextItem;
    localStorage.setItem(global.DIGITAL_PROBLEMS_STORAGE_KEY, JSON.stringify(list));
    return nextItem;
  }

  /** 重置问题为仅保留初步需求：删除除 customerName/customerNeedsOrChallenges/customerItStatus/projectTimeRequirement 外的所有数据 */
  function resetDigitalProblemToPreliminary(createdAt) {
    const list = getDigitalProblems();
    const idx = list.findIndex((it) => it.createdAt === createdAt);
    if (idx < 0) return false;
    const item = list[idx];
    const resetItem = {
      createdAt,
      customerName: item.customerName ?? item.customer_name ?? '',
      customerNeedsOrChallenges: item.customerNeedsOrChallenges ?? item.customer_needs_or_challenges ?? '',
      customerItStatus: item.customerItStatus ?? item.customer_it_status ?? '',
      projectTimeRequirement: item.projectTimeRequirement ?? item.project_time_requirement ?? '',
    };
    list[idx] = resetItem;
    localStorage.setItem(global.DIGITAL_PROBLEMS_STORAGE_KEY, JSON.stringify(list));
    const chats = getProblemDetailChats();
    delete chats[createdAt];
    localStorage.setItem(global.PROBLEM_DETAIL_CHATS_STORAGE_KEY, JSON.stringify(chats));
    const opHistory = getOperationHistory();
    delete opHistory[createdAt];
    localStorage.setItem(global.OPERATION_HISTORY_STORAGE_KEY, JSON.stringify(opHistory));
    const tracking = getTaskTrackingData();
    delete tracking[createdAt];
    localStorage.setItem(global.TASK_TRACKING_STORAGE_KEY, JSON.stringify(tracking));
    return resetItem;
  }

  global.rollbackDigitalProblemToPreviousStage = rollbackDigitalProblemToPreviousStage;
  global.resetDigitalProblemToPreliminary = resetDigitalProblemToPreliminary;
  global.getSavedAnalyses = getSavedAnalyses;
  global.saveAnalysis = saveAnalysis;
  global.saveRouteState = saveRouteState;
  global.getToolKnowledgeState = getToolKnowledgeState;
  global.saveToolKnowledgeState = saveToolKnowledgeState;
  global.loadToolKnowledgeItemsFromStorage = loadToolKnowledgeItemsFromStorage;
  global.saveToolKnowledgeItemsToStorage = saveToolKnowledgeItemsToStorage;
  global.saveToolsChatMessagesToStorage = saveToolsChatMessagesToStorage;
  global.restoreToolsChatMessagesFromStorage = restoreToolsChatMessagesFromStorage;
  global.getDigitalProblems = getDigitalProblems;
  global.saveDigitalProblem = saveDigitalProblem;
  global.removeDigitalProblem = removeDigitalProblem;
  global.updateDigitalProblemBasicInfo = updateDigitalProblemBasicInfo;
  global.updateDigitalProblemBmc = updateDigitalProblemBmc;
  global.updateDigitalProblemRequirementLogic = updateDigitalProblemRequirementLogic;
  global.updateDigitalProblemMajorStage = updateDigitalProblemMajorStage;
  global.updateDigitalProblemItGapCompletedStages = updateDigitalProblemItGapCompletedStages;
  global.updateDigitalProblemCompletedTaskId = updateDigitalProblemCompletedTaskId;
  global.updateDigitalProblemGlobalItGapAnalysis = updateDigitalProblemGlobalItGapAnalysis;
  global.clearDigitalProblemGlobalItGapAnalysis = clearDigitalProblemGlobalItGapAnalysis;
  global.updateDigitalProblemLocalItGapSessions = updateDigitalProblemLocalItGapSessions;
  global.updateDigitalProblemLocalItGapAnalysis = updateDigitalProblemLocalItGapAnalysis;
  global.clearDigitalProblemLocalItGapStep = clearDigitalProblemLocalItGapStep;
  global.updateDigitalProblemRolePermissionSessions = updateDigitalProblemRolePermissionSessions;
  global.updateDigitalProblemRolePermissionStep = updateDigitalProblemRolePermissionStep;
  global.updateDigitalProblemCoreBusinessObjectSessions = updateDigitalProblemCoreBusinessObjectSessions;
  global.clearDigitalProblemRolePermissionStep = clearDigitalProblemRolePermissionStep;
  global.updateDigitalProblemValueStreamDataOnly = updateDigitalProblemValueStreamDataOnly;
  global.updateDigitalProblemValueStream = updateDigitalProblemValueStream;
  global.updateDigitalProblemValueStreamLogicText = updateDigitalProblemValueStreamLogicText;
  global.updateDigitalProblemValueStreamItStatus = updateDigitalProblemValueStreamItStatus;
  global.updateDigitalProblemValueStreamPainPoint = updateDigitalProblemValueStreamPainPoint;
  global.updateDigitalProblemPainPointSessions = updateDigitalProblemPainPointSessions;
  global.updateDigitalProblemPainPointStep = updateDigitalProblemPainPointStep;
  global.rollbackValueStreamPainPoint = rollbackValueStreamPainPoint;
  global.deleteDigitalProblemRequirementLogic = deleteDigitalProblemRequirementLogic;
  global.getProblemDetailChats = getProblemDetailChats;
  global.saveProblemDetailChat = saveProblemDetailChat;
  global.getOperationHistory = getOperationHistory;
  global.pushOperationToHistory = pushOperationToHistory;
  global.popOperationFromHistory = popOperationFromHistory;
  global.restoreItemFromSnapshot = restoreItemFromSnapshot;
  global.getTaskTrackingData = getTaskTrackingData;
  global.saveTaskTrackingData = saveTaskTrackingData;

  if (typeof global.TOOL_KNOWLEDGE_ITEMS !== 'undefined') {
    loadToolKnowledgeItemsFromStorage();
  }

  /** online 模式时，将数字化问题与聊天记录委托给 HttpAdapter */
  const cfg = global.APP_CONFIG || {};
  const useBackend = (cfg.MODE === 'online') && global.STORAGE_HTTP_ADAPTER;
  if (useBackend) {
    const adapter = global.STORAGE_HTTP_ADAPTER;
    global.getDigitalProblems = () => adapter.getDigitalProblems();
    global.saveDigitalProblem = (item) => adapter.saveDigitalProblem(item);
    global.removeDigitalProblem = (index) => adapter.removeDigitalProblem(index);
    global.getProblemDetailChats = () => adapter.getProblemDetailChats();
    global.saveProblemDetailChat = (createdAt, messages) => adapter.saveProblemDetailChat(createdAt, messages);

    const upd = (createdAt, updates) => adapter.updateDigitalProblem(createdAt, updates);
    const getItem = (createdAt) => adapter.getDigitalProblems().find((it) => (it.createdAt || it.id) === createdAt);

    global.updateDigitalProblemBasicInfo = function (createdAt, basicInfo, markTaskComplete) {
      const item = getItem(createdAt);
      if (!item) return;
      const updates = { basicInfo };
      if (markTaskComplete !== false) {
        const completed = [...(item.completedStages || []), 0].filter((a, i, arr) => arr.indexOf(a) === i).sort((a, b) => a - b);
        updates.completedStages = completed;
      }
      upd(createdAt, updates);
    };
    global.updateDigitalProblemBmc = function (createdAt, bmc, markTaskComplete) {
      const item = getItem(createdAt);
      if (!item) return;
      const updates = { bmc };
      if (markTaskComplete !== false) {
        const completed = [...(item.completedStages || []), 1].filter((a, i, arr) => arr.indexOf(a) === i).sort((a, b) => a - b);
        updates.completedStages = completed;
      }
      upd(createdAt, updates);
    };
    global.updateDigitalProblemRequirementLogic = function (createdAt, requirementLogic, markTaskComplete) {
      const item = getItem(createdAt);
      if (!item) return;
      const updates = { requirementLogic };
      if (markTaskComplete !== false) {
        const completed = [...(item.completedStages || []), 2].filter((a, i, arr) => arr.indexOf(a) === i).sort((a, b) => a - b);
        updates.completedStages = completed;
      }
      upd(createdAt, updates);
    };
    global.updateDigitalProblemMajorStage = (createdAt, majorStage) => upd(createdAt, { currentMajorStage: majorStage });
    global.updateDigitalProblemItGapCompletedStages = (createdAt, stages) => upd(createdAt, { itGapCompletedStages: stages });
    global.updateDigitalProblemCompletedTaskId = function (createdAt, taskId) {
      const item = getItem(createdAt);
      if (!item || (item.completedTaskIds || []).includes(taskId)) return;
      const completed = [...(item.completedTaskIds || []), taskId].sort();
      upd(createdAt, { completedTaskIds: completed });
    };
    global.updateDigitalProblemGlobalItGapAnalysis = function (createdAt, analysisJson) {
      const item = getItem(createdAt);
      if (!item) return;
      const itGapCompleted = [...(item.itGapCompletedStages || []), 1].filter((a, i, arr) => arr.indexOf(a) === i).sort((a, b) => a - b);
      upd(createdAt, { globalItGapAnalysisJson: analysisJson, itGapCompletedStages: itGapCompleted });
    };
    global.clearDigitalProblemGlobalItGapAnalysis = function (createdAt) {
      const item = getItem(createdAt);
      if (!item) return;
      const itGapCompleted = (item.itGapCompletedStages || []).filter((x) => x !== 1 && x !== 2).sort((a, b) => a - b);
      upd(createdAt, {
        globalItGapAnalysisJson: undefined,
        localItGapAnalyses: undefined,
        localItGapSessions: undefined,
        itGapCompletedStages: itGapCompleted,
      });
    };
    global.updateDigitalProblemLocalItGapSessions = (createdAt, sessions) => upd(createdAt, { localItGapSessions: sessions });
    global.updateDigitalProblemLocalItGapAnalysis = function (createdAt, stepName, stepIndex, analysisJson, analysisMarkdown) {
      const item = getItem(createdAt);
      if (!item) return;
      const analyses = (item.localItGapAnalyses || []).filter((a) => a.stepIndex !== stepIndex);
      analyses.push({ stepName, stepIndex, analysisJson });
      analyses.sort((a, b) => a.stepIndex - b.stepIndex);
      const itGapCompleted = [...(item.itGapCompletedStages || []), 2].filter((a, i, arr) => arr.indexOf(a) === i).sort((a, b) => a - b);
      const sessions = item.localItGapSessions || [];
      const newSessions = sessions.length > 0
        ? sessions.map((s) => (s.stepIndex === stepIndex ? { ...s, analysisJson, analysisMarkdown: analysisMarkdown || s.analysisMarkdown } : s))
        : [];
      upd(createdAt, { localItGapAnalyses: analyses, localItGapSessions: newSessions.length ? newSessions : undefined, itGapCompletedStages: itGapCompleted });
    };
    global.clearDigitalProblemLocalItGapStep = function (createdAt, stepIndex) {
      const item = getItem(createdAt);
      if (!item) return;
      const sessions = (item.localItGapSessions || []).map((s) =>
        s.stepIndex === stepIndex ? { ...s, analysisJson: undefined, analysisMarkdown: undefined } : s
      );
      const analyses = (item.localItGapAnalyses || []).filter((a) => a.stepIndex !== stepIndex);
      upd(createdAt, { localItGapSessions: sessions, localItGapAnalyses: analyses });
    };
    global.updateDigitalProblemRolePermissionSessions = (createdAt, sessions) => upd(createdAt, { rolePermissionSessions: sessions });
    global.updateDigitalProblemRolePermissionStep = function (createdAt, stepIndex, rolePermissionJson) {
      const item = getItem(createdAt);
      if (!item) return;
      const sessions = (item.rolePermissionSessions || []).map((s) =>
        s.stepIndex === stepIndex ? { ...s, rolePermissionJson } : s
      );
      upd(createdAt, { rolePermissionSessions: sessions });
    };
    global.clearDigitalProblemRolePermissionStep = function (createdAt, stepIndex) {
      const item = getItem(createdAt);
      if (!item) return;
      const sessions = (item.rolePermissionSessions || []).map((s) =>
        s.stepIndex === stepIndex ? { ...s, rolePermissionJson: undefined } : s
      );
      upd(createdAt, { rolePermissionSessions: sessions });
    };
    global.updateDigitalProblemValueStreamDataOnly = (createdAt, valueStream) => upd(createdAt, { valueStream });
    global.updateDigitalProblemValueStream = function (createdAt, valueStream) {
      const item = getItem(createdAt);
      if (!item) return;
      const wfCompleted = [...(item.workflowAlignCompletedStages || []), 0].filter((a, i, arr) => arr.indexOf(a) === i).sort((a, b) => a - b);
      upd(createdAt, { valueStream, workflowAlignCompletedStages: wfCompleted });
    };
    global.updateDigitalProblemValueStreamLogicText = (createdAt, logicText) => upd(createdAt, { valueStreamLogicText: logicText != null ? String(logicText) : '' });
    global.updateDigitalProblemValueStreamItStatus = function (createdAt, valueStream) {
      const item = getItem(createdAt);
      if (!item) return;
      const wfCompleted = [...(item.workflowAlignCompletedStages || []), 0, 1].filter((a, i, arr) => arr.indexOf(a) === i).sort((a, b) => a - b);
      upd(createdAt, { valueStream, workflowAlignCompletedStages: wfCompleted });
    };
    global.updateDigitalProblemValueStreamPainPoint = function (createdAt, valueStream) {
      const item = getItem(createdAt);
      if (!item) return;
      const wfCompleted = [...(item.workflowAlignCompletedStages || []), 0, 1, 2].filter((a, i, arr) => arr.indexOf(a) === i).sort((a, b) => a - b);
      upd(createdAt, { valueStream, workflowAlignCompletedStages: wfCompleted });
    };
    global.rollbackValueStreamPainPoint = function (createdAt) {
      const item = getItem(createdAt);
      if (!item || !item.valueStream || item.valueStream.raw) return;
      const vs = item.valueStream;
      const rawStages = vs.stages ?? vs.phases ?? vs.nodes ?? [];
      if (!Array.isArray(rawStages)) return;
      const stages = rawStages.map((s) => {
        if (!s || typeof s !== 'object') return s;
        const rawSteps = s.steps ?? s.tasks ?? s.phases ?? s.items ?? [];
        const steps = rawSteps.map((st) => (typeof st === 'object' && st != null ? (({ painPoint, pain_point, ...r }) => r)(st) : st));
        return { ...s, steps };
      });
      const wfCompleted = (item.workflowAlignCompletedStages || []).filter((x) => x !== 2).sort((a, b) => a - b);
      upd(createdAt, { valueStream: { ...vs, stages }, workflowAlignCompletedStages: wfCompleted });
    };
    global.deleteDigitalProblemRequirementLogic = function (createdAt) {
      const item = getItem(createdAt);
      if (!item) return;
      const completedStages = (item.completedStages || []).filter((x) => x !== 2).sort((a, b) => a - b);
      upd(createdAt, { requirementLogic: undefined, completedStages });
    };
    global.restoreItemFromSnapshot = (createdAt, snapshot) => upd(createdAt, { ...snapshot, createdAt });
    global.rollbackDigitalProblemToPreviousStage = function (createdAt) {
      const item = getItem(createdAt);
      if (!item || (item.currentMajorStage ?? 0) <= 0) return null;
      const targetStage = (item.currentMajorStage ?? 0) - 1;
      let nextItem = { ...item, currentMajorStage: targetStage };
      if (targetStage === 0) {
        nextItem = { ...nextItem, completedStages: [], basicInfo: undefined, bmc: undefined, requirementLogic: undefined, workflowAlignCompletedStages: [], itGapCompletedStages: [], valueStream: undefined, globalItGapAnalysisJson: undefined, localItGapSessions: undefined, localItGapAnalyses: undefined, completedTaskIds: [] };
      } else if (targetStage === 1) {
        nextItem = { ...nextItem, workflowAlignCompletedStages: [], valueStream: undefined, itGapCompletedStages: [], globalItGapAnalysisJson: undefined, localItGapSessions: undefined, localItGapAnalyses: undefined, completedTaskIds: [] };
      } else if (targetStage === 2) {
        nextItem = { ...nextItem, itGapCompletedStages: [], globalItGapAnalysisJson: undefined, localItGapSessions: undefined, localItGapAnalyses: undefined, completedTaskIds: [] };
      }
      upd(createdAt, nextItem);
      adapter.saveProblemDetailChat(createdAt, adapter.getProblemDetailChats()[createdAt] || []);
      return nextItem;
    };
    global.resetDigitalProblemToPreliminary = function (createdAt) {
      const item = getItem(createdAt);
      if (!item) return false;
      const resetItem = { createdAt, customerName: item.customerName ?? item.customer_name ?? '', customerNeedsOrChallenges: item.customerNeedsOrChallenges ?? item.customer_needs_or_challenges ?? '', customerItStatus: item.customerItStatus ?? item.customer_it_status ?? '', projectTimeRequirement: item.projectTimeRequirement ?? item.project_time_requirement ?? '' };
      upd(createdAt, resetItem);
      adapter.saveProblemDetailChat(createdAt, []);
      return resetItem;
    };
  }
})(typeof window !== 'undefined' ? window : this);
