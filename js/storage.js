/**
 * 本地存储与 session 状态读写（依赖 js/config.js 中的 STORAGE_KEY 等常量）
 */
(function (global) {
  function getSavedAnalyses() {
    try {
      const raw = localStorage.getItem(global.STORAGE_KEY);
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
    localStorage.setItem(global.STORAGE_KEY, JSON.stringify(list));
  }

  function saveRouteState(view, params) {
    try {
      sessionStorage.setItem(global.ROUTE_STORAGE_KEY, JSON.stringify({ view, params: params || {} }));
    } catch (_) {}
  }

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

  function saveToolKnowledgeState(state) {
    try {
      localStorage.setItem(global.TOOL_KNOWLEDGE_STORAGE_KEY, JSON.stringify(state || {}));
    } catch {
      // ignore
    }
  }

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

  function saveToolKnowledgeItemsToStorage() {
    try {
      localStorage.setItem(global.TOOL_KNOWLEDGE_ITEMS_STORAGE_KEY, JSON.stringify(global.TOOL_KNOWLEDGE_ITEMS));
    } catch {
      // ignore
    }
  }

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

  function getDigitalProblems() {
    try {
      const raw = localStorage.getItem(global.DIGITAL_PROBLEMS_STORAGE_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  }

  function saveDigitalProblem(item) {
    const list = getDigitalProblems();
    list.unshift({ ...item, createdAt: new Date().toISOString() });
    localStorage.setItem(global.DIGITAL_PROBLEMS_STORAGE_KEY, JSON.stringify(list));
  }

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

  function updateDigitalProblemItGapCompletedStages(createdAt, stages) {
    const list = getDigitalProblems();
    const idx = list.findIndex((it) => it.createdAt === createdAt);
    if (idx < 0) return;
    const item = list[idx];
    list[idx] = { ...item, itGapCompletedStages: stages };
    localStorage.setItem(global.DIGITAL_PROBLEMS_STORAGE_KEY, JSON.stringify(list));
  }

  /** 标记某任务为已完成（用于 task10–task15 等，将 taskId 加入 completedTaskIds） */
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

  function updateDigitalProblemLocalItGapSessions(createdAt, sessions) {
    const list = getDigitalProblems();
    const idx = list.findIndex((it) => it.createdAt === createdAt);
    if (idx < 0) return;
    const item = list[idx];
    list[idx] = { ...item, localItGapSessions: sessions };
    localStorage.setItem(global.DIGITAL_PROBLEMS_STORAGE_KEY, JSON.stringify(list));
  }

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

  function getProblemDetailChats() {
    try {
      const raw = localStorage.getItem(global.PROBLEM_DETAIL_CHATS_STORAGE_KEY);
      return raw ? JSON.parse(raw) : {};
    } catch {
      return {};
    }
  }

  function saveProblemDetailChat(createdAt, messages) {
    const chats = getProblemDetailChats();
    chats[createdAt] = messages;
    localStorage.setItem(global.PROBLEM_DETAIL_CHATS_STORAGE_KEY, JSON.stringify(chats));
  }

  function getOperationHistory() {
    try {
      const raw = localStorage.getItem(global.OPERATION_HISTORY_STORAGE_KEY);
      return raw ? JSON.parse(raw) : {};
    } catch {
      return {};
    }
  }

  function pushOperationToHistory(createdAt, type, snapshot, chatLengthBefore) {
    const all = getOperationHistory();
    if (!all[createdAt]) all[createdAt] = [];
    all[createdAt].push({ type, timestamp: Date.now(), snapshot, chatLengthBefore });
    localStorage.setItem(global.OPERATION_HISTORY_STORAGE_KEY, JSON.stringify(all));
  }

  function popOperationFromHistory(createdAt) {
    const all = getOperationHistory();
    const stack = all[createdAt];
    if (!Array.isArray(stack) || stack.length === 0) return null;
    const entry = stack.pop();
    all[createdAt] = stack;
    localStorage.setItem(global.OPERATION_HISTORY_STORAGE_KEY, JSON.stringify(all));
    return entry;
  }

  function restoreItemFromSnapshot(createdAt, snapshot) {
    const list = getDigitalProblems();
    const idx = list.findIndex((it) => it.createdAt === createdAt);
    if (idx < 0) return;
    list[idx] = { ...snapshot, createdAt };
    localStorage.setItem(global.DIGITAL_PROBLEMS_STORAGE_KEY, JSON.stringify(list));
  }

  function getTaskTrackingData() {
    try {
      const raw = localStorage.getItem(global.TASK_TRACKING_STORAGE_KEY);
      return raw ? JSON.parse(raw) : {};
    } catch {
      return {};
    }
  }

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
  global.updateDigitalProblemValueStream = updateDigitalProblemValueStream;
  global.updateDigitalProblemValueStreamItStatus = updateDigitalProblemValueStreamItStatus;
  global.updateDigitalProblemValueStreamPainPoint = updateDigitalProblemValueStreamPainPoint;
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
})(typeof window !== 'undefined' ? window : this);
