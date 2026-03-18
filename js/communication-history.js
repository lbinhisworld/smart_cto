/**
 * 沟通历史：从问题详情聊天记录中提取、按任务分段及沟通历史页面渲染逻辑
 * 依赖：js/config.js（FOLLOW_TASKS、ITGAP_HISTORY_TASKS、IT_STRATEGY_TASKS、TASK_EXTRA_FIELDS）、
 *       global.parseRolePermissionModel、global.getTaskTrackingData、global.escapeHtml、global.formatChatTime（由 main/storage/utils 挂载）
 */
(function (global) {
  const FOLLOW_TASKS = global.FOLLOW_TASKS || [];
  const ITGAP_HISTORY_TASKS = global.ITGAP_HISTORY_TASKS || [];
  const IT_STRATEGY_TASKS = global.IT_STRATEGY_TASKS || [];
  const TASK_EXTRA_FIELDS = global.TASK_EXTRA_FIELDS || {};
  const escapeHtml = typeof global.escapeHtml === 'function' ? global.escapeHtml : (s) => (s == null ? '' : String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'));
  const formatChatTime = typeof global.formatChatTime === 'function' ? global.formatChatTime : (t) => (t ? String(t) : '—');

  /** 根据聊天消息类型推断所属任务 */
  function inferTaskIdFromMessage(msg) {
    if (!msg) return null;
    if (msg._taskId) return msg._taskId;
    const type = msg.type;
    const role = msg.role;
    const content = msg.content || '';
    if (type === 'task1LlmQueryBlock') return 'task1';
    if (type === 'task2LlmQueryBlock') return 'task2';
    if (type === 'task3LlmQueryBlock') return 'task3';
    if (type === 'task4LlmQueryBlock') return 'task4';
    if (type === 'task5LlmQueryBlock') return 'task5';
    if (type === 'basicInfoCard' || type === 'basicInfoJsonBlock' || (role === 'system' && (content === '解析完成' || content === '基本信息 json 提取完毕'))) return 'task1';
    if (type === 'bmcCard' || type === 'bmcStartBlock' || (role === 'system' && content.includes('BMC'))) return 'task2';
    if (type === 'requirementLogicBlock' || type === 'requirementLogicStartBlock') return 'task3';
    if (type === 'valueStreamCard' || type === 'valueStreamConfirmLog' || type === 'drawValueStreamStartBlock' || type === 'valueStreamStartBlock' || (role === 'system' && (content.includes('价值流') || content.includes('绘制')))) return 'task4';
    if (type === 'itStatusStartBlock' || type === 'itStatusOutputLog' || type === 'itStatusCard' || (role === 'system' && (content === 'IT 现状标注完成' || content === 'IT 现状标注失败'))) return 'task5';
    if (type === 'painPointStartBlock' || (role === 'system' && (content === '痛点标注完成' || content === '痛点标注完毕' || content === '痛点标注失败'))) return 'task6';
    if (type === 'intentExtractionCard' && msg.data?.taskId) return msg.data.taskId;
    if (type === 'e2eFlowGeneratedLog') return 'task7';
    if (type === 'e2eFlowExtractStartBlock' || type === 'e2eFlowJsonBlock') return 'task7';
    if (type === 'globalItGapStartBlock' || type === 'globalItGapAnalysisCard' || type === 'globalItGapAnalysisLog' || type === 'globalItGapContextLog') return 'task8';
    if (type === 'localItGapStartBlock' || type === 'localItGapSessionsBlock' || type === 'localItGapInputBlock' || type === 'localItGapOutputBlock' || type === 'localItGapAnalysisCard' || type === 'localItGapAnalysisLog' || type === 'localItGapContextLog' || type === 'localItGapContextBlock' || type === 'localItGapAllDoneConfirmBlock' || type === 'localItGapTaskCompleteConfirmBlock' || type === 'localItGapCompressionIntentBlock' || type === 'localItGapCompressionBlock') return 'task9';
    if (type === 'rolePermissionStartBlock' || type === 'rolePermissionCard' || type === 'rolePermissionSessionsBlock' || type === 'rolePermissionAnalysisCard' || type === 'rolePermissionConfirmedLog' || type === 'rolePermissionAllDoneBlock') return 'task10';
    if (type === 'coreBusinessObjectContextBlock' || type === 'coreBusinessObjectSessionsBlock' || type === 'coreBusinessObjectAnalysisCard' || type === 'coreBusinessObjectAllDoneBlock') return 'task11';
    if (type === 'globalArchitectureContextBlock') return 'task12';
    if (type === 'taskContextBlock') return msg.taskId || null;
    if (type === 'taskCompleteBlock' || type === 'taskCompletionConfirmBlock') return msg.taskId || null;
    if (type === 'unsatisfiedBlock' || type === 'modificationResponseBlock') return msg.taskId || null;
    if (role === 'system' && typeof content === 'string') {
      if (content.includes('正在分析环节')) return 'task9';
      if (content.includes('正在进行') && content.includes('角色与权限')) return 'task10';
      if (content.includes('正在进行') && content.includes('核心业务对象推演')) return 'task11';
    }
    return null;
  }

  /** 判断消息是否应纳入任务沟通历史：仅大模型返回内容或用户主动输入；未确认的意图卡片不纳入；查询意图的客户输入与系统返回均不纳入；请教讨论纳入；用户纯「确认」不纳入 */
  function shouldIncludeInCommunicationHistory(msg) {
    if (!msg) return false;
    if (msg.role === 'user') {
      if ((msg.content || '').trim() === '确认') return false;
      return true;
    }
    if (msg._taskId) return true; // 请教讨论的系统回复
    const type = msg.type;
    if (type === 'intentExtractionCard') {
      if (msg.data?.intent === 'query') return false; // 查询意图：系统返回内容不纳入
      if (msg.data?.intent === 'discussion') return false; // 请教讨论：意图卡片本身不纳入，用户消息与系统回复已单独处理
      return !!msg.confirmed;
    }
    if (type === 'task1LlmQueryBlock') return true;
    if (type === 'task2LlmQueryBlock') return true;
    if (type === 'task3LlmQueryBlock') return true;
    if (type === 'task4LlmQueryBlock') return true;
    if (type === 'task5LlmQueryBlock') return true;
    if (type === 'basicInfoCard') return false; // task1 基本信息卡片不进入时间线，仅保留 LLM-查询卡片
    if (type === 'bmcCard') return false; // task2 BMC 卡片不进入时间线，仅保留 LLM-查询卡片
    if (type === 'requirementLogicBlock') return false; // task3 需求逻辑卡片不进入时间线，仅保留 LLM-查询卡片
    if (type === 'valueStreamCard') return false; // task4 价值流图 JSON 卡片不进入时间线，仅保留 LLM-查询块
    if (type === 'valueStreamConfirmLog' || type === 'itStatusOutputLog') return true;
    if (type === 'itStatusCard') return false; // task5 IT 现状卡片不进入时间线，仅保留 LLM-查询块
    if (type === 'e2eFlowGeneratedLog') return true;
    if (type === 'e2eFlowExtractStartBlock') return !!msg.confirmed;
    if (type === 'e2eFlowJsonBlock') return true; // 推送即纳入过程日志，未确认时标签为「输出」，确认后为「确认」
    if (type === 'globalItGapStartBlock') return !!msg.confirmed;
    if (type === 'globalItGapAnalysisCard') return !!msg.confirmed;
    if (type === 'globalItGapAnalysisLog') return true;
    if (type === 'globalItGapContextLog') return true;
    if (type === 'localItGapStartBlock') return !!msg.confirmed;
    if (type === 'localItGapSessionsBlock') return true;
    if (type === 'localItGapInputBlock' || type === 'localItGapOutputBlock') return true;
    if (type === 'localItGapAnalysisCard') return true; // 推送即纳入过程日志，未确认标签「输出」，确认后「确认」
    if (type === 'localItGapAnalysisLog') return true;
    if (type === 'localItGapContextLog') return true;
    if (type === 'localItGapContextBlock') return true;
    if (type === 'localItGapAllDoneConfirmBlock') return true;
    if (type === 'localItGapTaskCompleteConfirmBlock') return true;
    if (type === 'localItGapCompressionIntentBlock') return true;
    if (type === 'localItGapCompressionBlock') return true;
    if (type === 'rolePermissionCard') return true; // 推送即纳入过程日志，未确认时标签为「输出」，确认后为「确认」
    if (type === 'rolePermissionSessionsBlock') return true;
    if (type === 'rolePermissionAnalysisCard') return true; // 单环节推演卡片，推送即纳入过程日志
    if (type === 'rolePermissionConfirmedLog') return true;
    if (type === 'coreBusinessObjectContextBlock' || type === 'coreBusinessObjectSessionsBlock' || type === 'coreBusinessObjectAnalysisCard' || type === 'coreBusinessObjectAllDoneBlock') return true;
    if (type === 'globalArchitectureContextBlock') return true;
    if (type === 'taskContextBlock') return true;
    if (type === 'taskCompleteBlock') return true;
    if (type === 'unsatisfiedBlock') return false; // 用户点击「修正」时不向过程日志推送该块
    if (type === 'modificationResponseBlock') return true;
    return false;
  }

  /** 将聊天消息按任务分段，返回 taskId -> communications。chats 为当前问题的消息数组（由调用方传入，可来自内存或 getProblemDetailChats()[createdAt]） */
  function getCommunicationsByTask(createdAt, chats) {
    if (!Array.isArray(chats) || chats.length === 0) return {};
    let currentTask = 'task1';
    const byTask = {};
    FOLLOW_TASKS.forEach((t) => { byTask[t.id] = []; });
    ITGAP_HISTORY_TASKS.forEach((t) => { byTask[t.id] = []; });
    IT_STRATEGY_TASKS.forEach((t) => { byTask[t.id] = []; });
    let lastUserComm = null;
    const parseRolePermissionModel = typeof global.parseRolePermissionModel === 'function' ? global.parseRolePermissionModel : () => null;
    for (const msg of chats) {
      if (msg.askMode === true) continue;
      const inferred = inferTaskIdFromMessage(msg);
      if (inferred) currentTask = inferred;
      // task1（企业背景洞察）阶段：用户粘贴的基本工商信息不再推送到时间线
      if (msg.role === 'user' && currentTask === 'task1' && !msg._taskId) {
        const text = (msg.content || '').trim();
        if (text && text !== '确认') {
          lastUserComm = null;
          continue;
        }
      }
      const isQueryIntentCard = msg.type === 'intentExtractionCard' && msg.data?.intent === 'query';
      const isDiscussionIntentCard = msg.type === 'intentExtractionCard' && msg.data?.intent === 'discussion';
      const isUnconfirmedIntentCard = msg.type === 'intentExtractionCard' && !msg.confirmed;
      if (isQueryIntentCard || (isUnconfirmedIntentCard && !isDiscussionIntentCard)) {
        if (lastUserComm) {
          const comms = byTask[lastUserComm.task];
          if (comms.length > 0 && comms[comms.length - 1] === lastUserComm.entry) comms.pop();
          lastUserComm = null;
        }
        continue;
      }
      if (isDiscussionIntentCard) {
        if (msg.confirmed && lastUserComm) {
          const targetTaskId = msg.data?.taskId || currentTask;
          const commsFrom = byTask[lastUserComm.task];
          const idx = commsFrom.indexOf(lastUserComm.entry);
          if (idx >= 0) {
            commsFrom.splice(idx, 1);
            byTask[targetTaskId].push(lastUserComm.entry);
          }
          currentTask = targetTaskId;
          const extractionPayload = { role: 'system', type: 'intentExtractionCard', content: '讨论请教', data: msg.data, userText: msg.userText, timestamp: msg.timestamp };
          const extractionEntry = { speaker: '系统提炼', time: msg.timestamp || '', content: JSON.stringify(extractionPayload, null, 2) };
          byTask[targetTaskId].push(extractionEntry);
        } else if (lastUserComm) {
          const comms = byTask[lastUserComm.task];
          if (comms.length > 0 && comms[comms.length - 1] === lastUserComm.entry) comms.pop();
        }
        lastUserComm = null;
        continue;
      }
      if (!shouldIncludeInCommunicationHistory(msg)) continue;
      const speaker = (msg.role === 'user' || msg.type === 'taskCompleteBlock' || msg.type === 'unsatisfiedBlock') ? '用户' : '系统大模型';
      const payload = { role: msg.type === 'taskCompleteBlock' || msg.type === 'unsatisfiedBlock' ? 'user' : (msg.role || 'system'), content: msg.content, type: msg.type, timestamp: msg.timestamp };
      if (msg._logType) payload._logType = msg._logType;
      if (msg.llmMeta) payload.llmMeta = msg.llmMeta;
      if ((msg.type === 'taskCompleteBlock' || msg.type === 'unsatisfiedBlock' || msg.type === 'modificationResponseBlock') && msg.taskId) payload.taskId = msg.taskId;
      if (msg.type === 'taskContextBlock') {
        payload.content = '任务上下文';
        payload.contextJson = msg.contextJson;
        payload.taskId = msg.taskId;
        if (msg.contextLabel) payload.contextLabel = msg.contextLabel;
      }
      if (msg.type === 'globalItGapContextLog') {
        payload.content = '上下文';
        payload.contextJson = msg.contextJson;
        payload.taskId = msg.taskId || 'task8';
      }
      if (msg.type === 'localItGapContextLog') {
        payload.content = '上下文';
        payload.taskId = msg.taskId || 'task9';
      }
      if (msg.type === 'localItGapContextBlock') {
        payload.content = '上下文';
        payload.contextLabel = msg.contextLabel;
        payload.contextJson = msg.contextJson;
        payload.taskId = msg.taskId || 'task9';
      }
      if (msg.data) payload.data = msg.data;
      if (msg.type === 'task1LlmQueryBlock') {
        payload.content = 'LLM-查询';
        if (msg.noteName != null) payload.noteName = msg.noteName;
        if (msg.llmInputPrompt != null) payload.llmInputPrompt = msg.llmInputPrompt;
        if (msg.llmOutputJson != null) payload.llmOutputJson = msg.llmOutputJson;
        if (msg.llmOutputRaw != null) payload.llmOutputRaw = msg.llmOutputRaw;
        if (msg.confirmed === true) payload.confirmed = true;
        payload.taskId = msg.taskId || 'task1';
      }
      if (msg.type === 'task2LlmQueryBlock') {
        payload.content = 'LLM-查询';
        if (msg.noteName != null) payload.noteName = msg.noteName;
        if (msg.llmInputPrompt != null) payload.llmInputPrompt = msg.llmInputPrompt;
        if (msg.llmOutputJson != null) payload.llmOutputJson = msg.llmOutputJson;
        if (msg.llmOutputRaw != null) payload.llmOutputRaw = msg.llmOutputRaw;
        if (msg.confirmed === true) payload.confirmed = true;
        payload.taskId = msg.taskId || 'task2';
      }
      if (msg.type === 'task3LlmQueryBlock') {
        payload.content = 'LLM-查询';
        if (msg.noteName != null) payload.noteName = msg.noteName;
        if (msg.llmInputPrompt != null) payload.llmInputPrompt = msg.llmInputPrompt;
        if (msg.llmOutputJson != null) payload.llmOutputJson = msg.llmOutputJson;
        if (msg.llmOutputRaw != null) payload.llmOutputRaw = msg.llmOutputRaw;
        if (msg.confirmed === true) payload.confirmed = true;
        if (msg.llmMeta != null) payload.llmMeta = msg.llmMeta;
        payload.taskId = msg.taskId || 'task3';
      }
      if (msg.type === 'task4LlmQueryBlock') {
        payload.content = 'LLM-查询';
        if (msg.noteName != null) payload.noteName = msg.noteName;
        if (msg.llmInputPrompt != null) payload.llmInputPrompt = msg.llmInputPrompt;
        if (msg.llmOutputRaw != null) payload.llmOutputRaw = msg.llmOutputRaw;
        if (msg.confirmed === true) payload.confirmed = true;
        if (msg.llmMeta != null) payload.llmMeta = msg.llmMeta;
        payload.taskId = msg.taskId || 'task4';
      }
      if (msg.type === 'task5LlmQueryBlock') {
        payload.content = 'LLM-查询';
        if (msg.noteName != null) payload.noteName = msg.noteName;
        if (msg.llmInputPrompt != null) payload.llmInputPrompt = msg.llmInputPrompt;
        if (msg.llmOutputRaw != null) payload.llmOutputRaw = msg.llmOutputRaw;
        if (msg.confirmed === true) payload.confirmed = true;
        if (msg.llmMeta != null) payload.llmMeta = msg.llmMeta;
        payload.taskId = msg.taskId || 'task5';
      }
      if (msg.type === 'valueStreamConfirmLog' && msg.taskId) payload.taskId = msg.taskId;
      if (msg.type === 'itStatusOutputLog' && msg.taskId) payload.taskId = msg.taskId;
      if (msg.type === 'itStatusOutputLog') payload.confirmed = !!msg.confirmed;
      if (['basicInfoCard', 'bmcCard', 'requirementLogicBlock', 'valueStreamCard', 'itStatusCard'].includes(msg.type)) payload.confirmed = !!msg.confirmed;
      if (msg.type === 'e2eFlowJsonBlock') payload.confirmed = !!msg.confirmed;
      if (msg.parsed) payload.parsed = msg.parsed;
      if (msg.type === 'intentExtractionCard' && msg.userText) payload.userText = msg.userText;
      if (msg.type === 'e2eFlowGeneratedLog' && msg.valueStreamJson) payload.valueStreamJson = msg.valueStreamJson;
      if (msg.type === 'e2eFlowJsonBlock' && msg.valueStreamJson) payload.valueStreamJson = msg.valueStreamJson;
      if ((msg.type === 'globalItGapAnalysisCard' && msg.data) || (msg.type === 'globalItGapAnalysisLog' && msg.analysisJson)) payload.analysisJson = msg.data || msg.analysisJson;
      if ((msg.type === 'localItGapAnalysisCard' && msg.data) || (msg.type === 'localItGapAnalysisLog' && msg.analysisJson)) payload.analysisJson = msg.data || msg.analysisJson;
      if ((msg.type === 'localItGapAnalysisCard' || msg.type === 'localItGapAnalysisLog') && msg.stepName) payload.stepName = msg.stepName;
      if (msg.type === 'localItGapSessionsBlock' && msg.sessions) payload.sessions = msg.sessions;
      if (msg.type === 'localItGapInputBlock') {
        if (msg.stepName) payload.stepName = msg.stepName;
        if (msg.stepIndex != null) payload.stepIndex = msg.stepIndex;
        if (msg.fullInput != null) payload.fullInput = msg.fullInput;
        if (msg.prompt != null) payload.prompt = msg.prompt;
        payload.taskId = msg.taskId || 'task9';
      }
      if (msg.type === 'localItGapOutputBlock') {
        if (msg.stepName) payload.stepName = msg.stepName;
        if (msg.stepIndex != null) payload.stepIndex = msg.stepIndex;
        payload.taskId = msg.taskId || 'task9';
      }
      if (msg.type === 'localItGapAnalysisCard') payload.confirmed = !!msg.confirmed;
      if (msg.type === 'localItGapAllDoneConfirmBlock') {
        payload.content = msg.content;
        payload.confirmed = !!msg.confirmed;
        if (msg.taskId) payload.taskId = msg.taskId;
      }
      if (msg.type === 'localItGapTaskCompleteConfirmBlock') {
        payload.content = msg.content;
        payload.confirmed = !!msg.confirmed;
        if (msg.taskId) payload.taskId = msg.taskId;
      }
      if (msg.type === 'localItGapCompressionIntentBlock') {
        payload.content = msg.content;
        payload.confirmed = !!msg.confirmed;
        if (msg.taskId) payload.taskId = msg.taskId;
      }
      if (msg.type === 'localItGapCompressionBlock') {
        if (msg.stepName) payload.stepName = msg.stepName;
        if (msg.compressedJson != null) payload.compressedJson = msg.compressedJson;
        if (msg.llmMeta) payload.llmMeta = msg.llmMeta;
        if (msg.taskId) payload.taskId = msg.taskId;
      }
      if (msg.type === 'rolePermissionCard') {
        payload.confirmed = !!msg.confirmed;
        if (msg.confirmed && typeof msg.content === 'string') payload.rolePermissionModelJson = parseRolePermissionModel(msg.content);
        // payload.content 为整个 JSON 字符串，时间线标签由 getCommunicationLogType 根据 confirmed 返回「输出」或「确认」
      }
      if (msg.type === 'rolePermissionSessionsBlock' && msg.sessions) payload.sessions = msg.sessions;
      if (msg.type === 'rolePermissionSessionsBlock') payload.confirmed = !!msg.confirmed;
      if (msg.type === 'rolePermissionAnalysisCard') {
        payload.confirmed = !!msg.confirmed;
        if (msg.stepName) payload.stepName = msg.stepName;
        if (msg.stepIndex != null) payload.stepIndex = msg.stepIndex;
      }
      if (msg.type === 'rolePermissionConfirmedLog' && msg.rolePermissionModelJson) {
        payload.rolePermissionModelJson = msg.rolePermissionModelJson;
      }
      if (msg.type === 'coreBusinessObjectContextBlock') {
        payload.content = '上下文';
        payload.contextJson = msg.contextJson;
        payload.contextLabel = msg.contextLabel;
        payload.taskId = msg.taskId || 'task11';
      }
      if (msg.type === 'globalArchitectureContextBlock') {
        payload.content = '上下文';
        payload.contextJson = msg.contextJson;
        payload.contextLabel = msg.contextLabel;
        payload.taskId = msg.taskId || 'task12';
      }
      if (msg.type === 'coreBusinessObjectSessionsBlock' && msg.sessions) payload.sessions = msg.sessions;
      if (msg.type === 'coreBusinessObjectSessionsBlock') payload.confirmed = !!msg.confirmed;
      if (msg.type === 'coreBusinessObjectAnalysisCard') {
        payload.confirmed = !!msg.confirmed;
        if (msg.stepName) payload.stepName = msg.stepName;
        if (msg.stepIndex != null) payload.stepIndex = msg.stepIndex;
      }
      if (msg.type === 'coreBusinessObjectAllDoneBlock') payload.allConfirmed = !!msg.allConfirmed;
      const contentJson = JSON.stringify(payload, null, 2);
      const entry = { speaker, time: msg.timestamp || '', content: contentJson };
      /** 任务完成块、价值流确认日志、IT 现状输出日志必须归入其 msg.taskId 对应任务；角色与权限卡片固定归入 task10；核心业务对象归入 task11 */
      const targetTask = ((msg.type === 'rolePermissionCard' || msg.type === 'rolePermissionSessionsBlock' || msg.type === 'rolePermissionAnalysisCard' || msg.type === 'rolePermissionAllDoneBlock') && Array.isArray(byTask['task10'])) ? 'task10' : ((msg.type === 'coreBusinessObjectContextBlock' || msg.type === 'coreBusinessObjectSessionsBlock' || msg.type === 'coreBusinessObjectAnalysisCard' || msg.type === 'coreBusinessObjectAllDoneBlock') && Array.isArray(byTask['task11'])) ? 'task11' : ((msg.type === 'globalArchitectureContextBlock') && Array.isArray(byTask['task12'])) ? 'task12' : (((msg.type === 'taskCompleteBlock' || msg.type === 'valueStreamConfirmLog' || msg.type === 'itStatusOutputLog' || msg.type === 'globalItGapContextLog' || msg.type === 'localItGapContextLog' || msg.type === 'localItGapContextBlock') && msg.taskId && Array.isArray(byTask[msg.taskId])) ? msg.taskId : currentTask);
      byTask[targetTask].push(entry);
      lastUserComm = msg.role === 'user' ? { task: targetTask, entry } : null;
    }
    return byTask;
  }

  /** 将沟通记录扁平化为按时间排序的时间线数组，供时间线视图使用 */
  function getCommunicationsAsTimeline(createdAt, chats) {
    const byTask = getCommunicationsByTask(createdAt, chats);
    const flat = [];
    FOLLOW_TASKS.forEach((task) => {
      const comms = byTask[task.id] || [];
      comms.forEach((c) => {
        flat.push({ ...c, taskId: task.id, taskName: task.name });
      });
    });
    flat.sort((a, b) => {
      const ta = (a.time && new Date(a.time).getTime()) || 0;
      const tb = (b.time && new Date(b.time).getTime()) || 0;
      return ta - tb;
    });
    return flat;
  }

  /** 从沟通记录条目解析日志类型：输入、输出、确认、修正、讨论、上下文、任务完成、不满意 */
  function getCommunicationLogType(c) {
    try {
      const parsed = typeof c.content === 'string' ? JSON.parse(c.content) : c.content;
      if (parsed?._logType === 'modify') return '修正';
      if (parsed?.type === 'taskCompleteBlock') return '任务完成';
      if (parsed?.type === 'task1LlmQueryBlock') return 'LLM-查询';
      if (parsed?.type === 'task2LlmQueryBlock') return 'LLM-查询';
      if (parsed?.type === 'task3LlmQueryBlock') return 'LLM-查询';
      if (parsed?.type === 'task4LlmQueryBlock') return 'LLM-查询';
      if (parsed?.type === 'task5LlmQueryBlock') return 'LLM-查询';
    } catch (_) {}
    if (c.speaker === '用户') return '输入';
    try {
      const parsed = typeof c.content === 'string' ? JSON.parse(c.content) : c.content;
      if (parsed?.type === 'taskCompleteBlock') return '任务完成';
      if (parsed?.type === 'unsatisfiedBlock') return '不满意';
      if (parsed?.type === 'taskContextBlock' || parsed?.type === 'globalItGapContextLog' || parsed?.type === 'localItGapContextLog' || parsed?.type === 'localItGapContextBlock' || parsed?.type === 'coreBusinessObjectContextBlock' || parsed?.type === 'globalArchitectureContextBlock') return '上下文';
      if (parsed?.type === 'intentExtractionCard' && parsed?.data?.intent === 'discussion') return '讨论';
      if (parsed?.type === 'intentExtractionCard' && parsed?.data?.intent === 'modification') {
        const target = String(parsed?.data?.modificationTarget || '');
        const taskId = parsed?.data?.taskId || '';
        if (taskId === 'task1' && (target.includes('企业基本信息') || target.includes('基本信息') || !target)) return '确认';
        return '修正';
      }
      if (parsed?.type === 'intentExtractionCard' && (parsed?.data?.intent === 'query' || parsed?.data?.intent === 'execute')) return '上下文';
      if (c.speaker === '系统提炼') return '讨论';
      if (parsed?.type === 'valueStreamConfirmLog') return '确认';
      if (parsed?.type === 'itStatusOutputLog') return parsed?.confirmed ? '确认' : '输出';
      if (parsed?.type === 'e2eFlowJsonBlock') return (parsed?.valueStreamJson != null && parsed?.confirmed) ? '确认' : '输出';
      if (parsed?.type === 'localItGapInputBlock') return '输入';
      if (parsed?.type === 'localItGapOutputBlock') return '输出';
      if (parsed?.type === 'localItGapAnalysisCard') return (parsed?.analysisJson != null && parsed?.confirmed) ? '确认' : '输出';
      if (parsed?.type === 'localItGapAllDoneConfirmBlock') return parsed?.confirmed ? '确认' : '输出';
      if (parsed?.type === 'localItGapTaskCompleteConfirmBlock') return parsed?.confirmed ? '确认' : '输出';
      if (parsed?.type === 'localItGapCompressionIntentBlock') return parsed?.confirmed ? '确认' : '输出';
      if (parsed?.type === 'localItGapCompressionBlock') return '压缩';
      if (parsed?.type === 'localItGapSessionsBlock') return '确认';
      if (parsed?.type === 'rolePermissionSessionsBlock') return parsed?.confirmed ? '确认' : '输出';
      if (parsed?.type === 'coreBusinessObjectSessionsBlock') return parsed?.confirmed ? '确认' : '输出';
      if (parsed?.type === 'coreBusinessObjectAnalysisCard') return parsed?.confirmed ? '确认' : '输出';
      if (parsed?.type === 'coreBusinessObjectAllDoneBlock') return parsed?.allConfirmed ? '确认' : '输出';
      if (parsed?.type === 'rolePermissionCard') return parsed?.confirmed ? '确认' : '输出';
      if (parsed?.type === 'rolePermissionAnalysisCard') return parsed?.confirmed ? '确认' : '输出';
      if (['basicInfoCard', 'bmcCard', 'requirementLogicBlock', 'valueStreamCard', 'itStatusCard'].includes(parsed?.type)) {
        return parsed?.data && parsed?.confirmed !== false ? '确认' : '输出';
      }
    } catch (_) {}
    return '确认';
  }

  const LOG_TYPE_CLASS = { '输入': 'input', '输出': 'output', '确认': 'confirm', '修正': 'modify', '讨论': 'discuss', '上下文': 'context', '任务完成': 'complete', '不满意': 'unsatisfied', '压缩': 'compress', 'LLM-查询': 'llm-query' };
  const INTENT_LABELS = { query: '简单查询', modification: '反馈修改意见', execute: '执行操作', discussion: '讨论请教' };

  /** 在重新渲染前采集当前展开状态，刷新后恢复，避免沟通历史面板更新时折叠已展开的任务/时间线 */
  function captureHistoryExpandedState(container) {
    const state = {};
    if (!container) return state;
    container.querySelectorAll('.problem-detail-history-task-root').forEach((root) => {
      const taskId = root.getAttribute('data-task-id');
      if (!taskId) return;
      const children = root.querySelector('.problem-detail-history-task-children');
      const taskNode = root.querySelector('.problem-detail-history-task-node');
      const expanded = children && !children.hidden;
      let activeTab = 'detail';
      const activeTabEl = root.querySelector('.problem-detail-history-tab.problem-detail-history-tab-active');
      if (activeTabEl) activeTab = activeTabEl.getAttribute('data-tab') || 'detail';
      const expandedTimelineIndices = [];
      if (expanded && activeTab === 'log') {
        root.querySelectorAll('.problem-detail-history-timeline-node').forEach((node) => {
          const idx = node.getAttribute('data-index');
          const detail = node.querySelector('.problem-detail-history-timeline-detail');
          if (detail && !detail.hidden && idx != null) expandedTimelineIndices.push(parseInt(idx, 10));
        });
      }
      state[taskId] = { expanded, activeTab, expandedTimelineIndices };
    });
    return state;
  }

  /** 根据采集的展开状态恢复 UI */
  function restoreHistoryExpandedState(container, state) {
    if (!container || !state || typeof state !== 'object') return;
    Object.keys(state).forEach((taskId) => {
      const s = state[taskId];
      if (!s) return;
      const root = container.querySelector(`.problem-detail-history-task-root[data-task-id="${taskId}"]`);
      if (!root) return;
      const children = root.querySelector('.problem-detail-history-task-children');
      const taskNode = root.querySelector('.problem-detail-history-task-node');
      if (s.expanded && children && taskNode) {
        children.hidden = false;
        taskNode.classList.add('expanded');
      }
      if (s.activeTab === 'log' && children) {
        const tabs = children.querySelector('.problem-detail-history-task-tabs');
        if (tabs) {
          tabs.querySelectorAll('.problem-detail-history-tab').forEach((t) => {
            const isLog = t.getAttribute('data-tab') === 'log';
            t.classList.toggle('problem-detail-history-tab-active', isLog);
            t.setAttribute('aria-selected', String(isLog));
          });
          children.querySelectorAll('.problem-detail-history-tab-panel').forEach((p) => {
            p.hidden = p.getAttribute('data-tab') !== 'log';
          });
        }
      }
      if (s.expandedTimelineIndices && s.expandedTimelineIndices.length > 0) {
        root.querySelectorAll('.problem-detail-history-timeline-node').forEach((node) => {
          const idx = parseInt(node.getAttribute('data-index'), 10);
          if (!s.expandedTimelineIndices.includes(idx)) return;
          const detail = node.querySelector('.problem-detail-history-timeline-detail');
          const head = node.querySelector('.problem-detail-history-timeline-head');
          const expandSpan = node.querySelector('.problem-detail-history-timeline-expand');
          if (detail) detail.hidden = false;
          if (head) {
            head.classList.add('expanded');
            head.setAttribute('aria-expanded', 'true');
          }
          if (expandSpan) expandSpan.classList.add('expanded');
        });
      }
    });
  }

  /** 渲染沟通历史面板：任务详情/过程日志双 Tab、时间线及日志类型标签。deps: { item, getChatsForProblem, getTaskStatusText } */
  function renderProblemDetailHistory(container, deps) {
    if (!container) return;
    const expandedState = captureHistoryExpandedState(container);
    const item = deps?.item;
    const getChatsForProblem = deps?.getChatsForProblem;
    const getTaskStatusText = deps?.getTaskStatusText;
    const createdAt = item?.createdAt;
    const getTaskTrackingData = typeof global.getTaskTrackingData === 'function' ? global.getTaskTrackingData : () => ({});
    const trackingData = createdAt ? (getTaskTrackingData()[createdAt] || {}) : {};
    const communications = createdAt && getChatsForProblem ? getCommunicationsByTask(createdAt, getChatsForProblem(createdAt)) : {};
    const allHistoryTasks = [...FOLLOW_TASKS, ...ITGAP_HISTORY_TASKS, ...IT_STRATEGY_TASKS];
    const totals = { tokens: 0, inputTokens: 0, outputTokens: 0, durationMs: 0 };
    const taskListHtml = allHistoryTasks.map((task) => {
      const taskData = trackingData[task.id] || {};
      const objective = (taskData.objective ?? task.objective) || '—';
      const evaluationCriteria = (taskData.evaluationCriteria ?? task.evaluationCriteria) || '—';
      const extra = TASK_EXTRA_FIELDS[task.id] || {};
      const inputDesc = extra.input || '—';
      const actionDesc = extra.action || '—';
      const outputDesc = extra.outputFeedback || '—';
      const taskStatusText = typeof getTaskStatusText === 'function' ? getTaskStatusText(item, task.id, allHistoryTasks, getChatsForProblem && createdAt ? getChatsForProblem(createdAt) : null) : '—';
      const comms = (communications[task.id] || []).slice().sort((a, b) => {
        const ta = (a.time && new Date(a.time).getTime()) || 0;
        const tb = (b.time && new Date(b.time).getTime()) || 0;
        return ta - tb;
      });
      const commCount = comms.length;
      const taskTotals = { tokens: 0, inputTokens: 0, outputTokens: 0, durationMs: 0 };
      const timelineHtml = comms.length === 0
        ? '<p class="problem-detail-history-comm-empty">暂无沟通记录</p>'
        : comms.map((c, i) => {
            const timeStr = c.time ? formatChatTime(c.time) : '—';
            const logType = getCommunicationLogType(c);
            let contentStr = typeof c.content === 'object' ? JSON.stringify(c.content, null, 2) : c.content;
            let contentHtml = '';
            let titleLabel = c.speaker;
            let stepNameForHead = '';
            let contextNoteForHead = '';
            let sessionPlanNoteForHead = '';
            let confirmTagForHead = '';
            try {
              const parsed = typeof c.content === 'string' ? JSON.parse(c.content) : c.content;
              if (parsed?.role === 'user') {
                titleLabel = parsed?._logType === 'modify' ? '用户修正意见' : '用户输入';
                contentStr = (parsed?.content != null ? String(parsed.content).trim() : '') || '(空)';
              } else if (parsed?.type === 'task1LlmQueryBlock' || parsed?.type === 'task2LlmQueryBlock' || parsed?.type === 'task3LlmQueryBlock' || parsed?.type === 'task4LlmQueryBlock' || parsed?.type === 'task5LlmQueryBlock') {
                titleLabel = 'LLM-查询';
                stepNameForHead = parsed?.noteName
                  ? String(parsed.noteName)
                  : (parsed?.type === 'task5LlmQueryBlock' ? 'IT 现状标注' : parsed?.type === 'task4LlmQueryBlock' ? '价值流图生成' : parsed?.type === 'task3LlmQueryBlock' ? '需求逻辑提炼' : parsed?.type === 'task2LlmQueryBlock' ? '商业画布提炼' : '工商信息提炼');
                if (parsed?.confirmed === true) confirmTagForHead = '<span class="problem-detail-history-log-type-tag problem-detail-history-log-type-confirm">确认</span>';
                const inputStr = parsed?.llmInputPrompt != null
                  ? String(parsed.llmInputPrompt)
                  : '(无)';
                const outputObj = parsed?.llmOutputJson;
                const outputStr = outputObj != null
                  ? (typeof outputObj === 'string' ? outputObj : JSON.stringify(outputObj, null, 2))
                  : ((parsed?.llmOutputRaw != null && String(parsed.llmOutputRaw).trim()) ? String(parsed.llmOutputRaw) : '(无)');
                contentHtml = `
                <div class="problem-detail-history-llm-query-subcards">
                  <div class="problem-detail-history-llm-query-subcard problem-detail-history-llm-query-subcard-input">
                    <div class="problem-detail-history-llm-query-subcard-title">输入</div>
                    <pre class="problem-detail-history-llm-query-subcard-pre">${escapeHtml(inputStr)}</pre>
                  </div>
                  <div class="problem-detail-history-llm-query-subcard problem-detail-history-llm-query-subcard-output">
                    <div class="problem-detail-history-llm-query-subcard-title">输出</div>
                    <pre class="problem-detail-history-llm-query-subcard-pre">${escapeHtml(outputStr)}</pre>
                  </div>
                </div>`;
              } else if (parsed?.type === 'basicInfoCard') {
                titleLabel = parsed?.confirmed ? '客户基本信息（已确认）' : '客户基本信息（大模型输出）';
                contentStr = parsed?.data != null ? JSON.stringify(parsed.data, null, 2) : (contentStr || '(空)');
              } else if (parsed?.type === 'bmcCard') {
                titleLabel = parsed?.confirmed ? 'BMC（已确认）' : 'BMC（大模型输出）';
                contentStr = parsed?.data != null ? JSON.stringify(parsed.data, null, 2) : (contentStr || '(空)');
              } else if (parsed?.type === 'requirementLogicBlock') {
                titleLabel = parsed?.confirmed ? '需求逻辑（已确认）' : '需求逻辑（大模型输出）';
                contentStr = parsed?.data != null ? JSON.stringify(parsed.data, null, 2) : (parsed?.content != null ? String(parsed.content) : '(空)');
              } else if (parsed?.type === 'valueStreamCard') {
                titleLabel = parsed?.confirmed ? '价值流图（已确认）' : '价值流图（大模型输出）';
                contentStr = parsed?.data != null ? JSON.stringify(parsed.data, null, 2) : (contentStr || '(空)');
              } else if (parsed?.type === 'valueStreamConfirmLog') {
                titleLabel = '确认';
                contentStr = parsed?.data != null ? JSON.stringify(parsed.data, null, 2) : '(空)';
              } else if (parsed?.type === 'itStatusOutputLog') {
                titleLabel = 'IT 现状标注（阶段名-环节名-IT 现状）';
                contentStr = (typeof parsed.content === 'string' ? parsed.content : JSON.stringify(parsed.content || [], null, 2)) || '(空)';
              } else if (parsed?.type === 'intentExtractionCard' && parsed?.data?.intent != null) {
                const intentLabel = INTENT_LABELS[parsed.data.intent] || parsed.data.intent || '—';
                titleLabel = `用户意图提炼：${intentLabel}`;
              } else if (parsed?.type === 'e2eFlowExtractStartBlock') {
                titleLabel = parsed.content || '我先需要提取端到端流程绘制的 json 数据';
              } else if (parsed?.type === 'e2eFlowJsonBlock') {
                titleLabel = parsed?.confirmed ? '端到端流程 JSON 数据（已确认）' : '端到端流程 JSON 数据';
                if (parsed.valueStreamJson) {
                  contentStr = '【端到端流程 JSON 数据】\n' + JSON.stringify(parsed.valueStreamJson, null, 2);
                }
              } else if (parsed?.type === 'e2eFlowGeneratedLog') {
                titleLabel = parsed.content || '已生成端到端流程 JSON 数据';
                if (parsed.valueStreamJson) {
                  contentStr = parsed.content + '\n\n【端到端流程 JSON 数据】\n' + JSON.stringify(parsed.valueStreamJson, null, 2);
                }
              } else if (parsed?.type === 'globalItGapStartBlock') {
                titleLabel = parsed.content || '即将针对端到端流程开展全局 ITGap 分析';
              } else if (parsed?.type === 'globalItGapAnalysisCard') {
                titleLabel = '全局 ITGap 分析';
                if (parsed.analysisJson) {
                  contentStr = '【全局 ITGap 分析 JSON】\n' + JSON.stringify(parsed.analysisJson, null, 2);
                }
              } else if (parsed?.type === 'globalItGapAnalysisLog') {
                titleLabel = parsed.content || '已生成全局 ITGap 分析';
                if (parsed.analysisJson) {
                  contentStr = (parsed.content || '') + '\n\n【全局 ITGap 分析 JSON】\n' + JSON.stringify(parsed.analysisJson, null, 2);
                }
              } else if (parsed?.type === 'rolePermissionCard') {
                titleLabel = parsed?.confirmed ? '角色与权限模型推演（已确认）' : '角色与权限模型推演';
                if (parsed.rolePermissionModelJson) {
                  contentStr = '【角色与权限模型推演 JSON】\n' + JSON.stringify(parsed.rolePermissionModelJson, null, 2);
                } else if (typeof parsed?.content === 'string') {
                  contentStr = parsed.content;
                }
              } else if (parsed?.type === 'rolePermissionSessionsBlock') {
                titleLabel = parsed?.confirmed ? '角色与权限模型推演 Session（已确认）' : '角色与权限模型推演 Session';
                contentStr = parsed.sessions != null ? JSON.stringify(parsed.sessions, null, 2) : '(无)';
              } else if (parsed?.type === 'rolePermissionAnalysisCard') {
                const stepNameForRbac = parsed?.stepName || `环节${(parsed?.stepIndex ?? 0) + 1}`;
                stepNameForHead = stepNameForRbac;
                titleLabel = parsed?.confirmed ? `角色与权限推演（${stepNameForRbac}）（已确认）` : `角色与权限推演（${stepNameForRbac}）`;
                contentStr = parsed.content != null ? (typeof parsed.content === 'string' ? parsed.content : JSON.stringify(parsed.content, null, 2)) : '(无)';
              } else if (parsed?.type === 'rolePermissionConfirmedLog') {
                titleLabel = parsed.content || '已确认角色与权限模型推演';
                if (parsed.rolePermissionModelJson) {
                  contentStr = (parsed.content || '') + '\n\n【角色与权限模型推演 JSON】\n' + JSON.stringify(parsed.rolePermissionModelJson, null, 2);
                }
              } else if (parsed?.type === 'taskContextBlock') {
                titleLabel = '任务上下文';
                contextNoteForHead = parsed?.contextLabel || (parsed?.taskId === 'task2' ? '客户基本信息 json' : '');
                contentStr = parsed.contextJson != null ? JSON.stringify(parsed.contextJson, null, 2) : '(无)';
              } else if (parsed?.type === 'globalItGapContextLog') {
                titleLabel = '上下文';
                contentStr = parsed.contextJson != null ? JSON.stringify(parsed.contextJson, null, 2) : '(无)';
              } else if (parsed?.type === 'localItGapContextLog') {
                contextNoteForHead = '价值流+全局 ITGap 分析';
                titleLabel = '上下文（价值流+全局 ITGap 分析）';
                contentStr = '(无)';
              } else if (parsed?.type === 'localItGapContextBlock') {
                contextNoteForHead = parsed?.contextLabel || '';
                titleLabel = parsed?.contextLabel ? `上下文（${parsed.contextLabel}）` : '上下文';
                contentStr = parsed?.contextJson != null ? JSON.stringify(parsed.contextJson, null, 2) : '(无)';
              } else if (parsed?.type === 'coreBusinessObjectContextBlock') {
                contextNoteForHead = parsed?.contextLabel || '';
                titleLabel = parsed?.contextLabel ? `上下文（${parsed.contextLabel}）` : '上下文';
                contentStr = parsed.contextJson != null ? JSON.stringify(parsed.contextJson, null, 2) : '(无)';
              } else if (parsed?.type === 'globalArchitectureContextBlock') {
                contextNoteForHead = parsed?.contextLabel || '';
                titleLabel = parsed?.contextLabel ? `上下文（${parsed.contextLabel}）` : '上下文';
                contentStr = parsed.contextJson != null ? JSON.stringify(parsed.contextJson, null, 2) : '(无)';
              } else if (parsed?.type === 'coreBusinessObjectSessionsBlock') {
                sessionPlanNoteForHead = '核心业务对象推演 session 计划';
                titleLabel = '核心业务对象推演 session 计划';
                contentStr = parsed.sessions != null ? JSON.stringify(parsed.sessions, null, 2) : '(无)';
              } else if (parsed?.type === 'coreBusinessObjectAnalysisCard') {
                const stepNameCbo = parsed?.stepName || `环节${(parsed?.stepIndex ?? 0) + 1}`;
                stepNameForHead = stepNameCbo;
                titleLabel = parsed?.confirmed ? `核心业务对象推演（${stepNameCbo}）（已确认）` : `核心业务对象推演（${stepNameCbo}）`;
                contentStr = parsed.content != null ? (typeof parsed.content === 'string' ? parsed.content : JSON.stringify(parsed.content, null, 2)) : '(无)';
              } else if (parsed?.type === 'coreBusinessObjectAllDoneBlock') {
                titleLabel = parsed?.allConfirmed ? '核心业务对象推演全部确认' : '核心业务对象推演全部结束';
                contentStr = (parsed?.content && String(parsed.content).trim()) || '所有环节的核心业务对象推演已经结束，是否全部确认？';
              } else if (parsed?.type === 'localItGapSessionsBlock') {
                sessionPlanNoteForHead = 'ITGap 分析 session 计划';
                titleLabel = 'ITGap 分析 session 计划';
                contentStr = parsed.sessions != null ? JSON.stringify(parsed.sessions, null, 2) : '(无)';
              } else if (parsed?.type === 'localItGapInputBlock') {
                stepNameForHead = parsed?.stepName || `环节${(parsed?.stepIndex ?? 0) + 1}`;
                titleLabel = `输入（${stepNameForHead}）`;
                contentStr = parsed?.fullInput && typeof parsed.fullInput === 'object'
                  ? JSON.stringify(parsed.fullInput, null, 2)
                  : ((parsed?.prompt && String(parsed.prompt).trim()) || '(无)');
              } else if (parsed?.type === 'localItGapOutputBlock') {
                stepNameForHead = parsed?.stepName || `环节${(parsed?.stepIndex ?? 0) + 1}`;
                titleLabel = `输出（${stepNameForHead}）`;
                contentStr = '(环节分析结果见下方分析卡片)';
              } else if (parsed?.type === 'localItGapAnalysisCard') {
                stepNameForHead = parsed?.stepName || '环节';
                titleLabel = parsed?.confirmed ? `局部 ITGap 分析（${stepNameForHead}）（已确认）` : `局部 ITGap 分析（${stepNameForHead}）`;
                contentStr = parsed.analysisJson != null ? JSON.stringify(parsed.analysisJson, null, 2) : '(无)';
              } else if (parsed?.type === 'localItGapAnalysisLog') {
                stepNameForHead = parsed?.stepName || '环节';
                titleLabel = parsed.content || `局部 ITGap 分析（${stepNameForHead}）`;
                contentStr = parsed.analysisJson != null ? JSON.stringify(parsed.analysisJson, null, 2) : (parsed.content || '(无)');
              } else if (parsed?.type === 'localItGapAllDoneConfirmBlock') {
                titleLabel = parsed?.confirmed ? '已确认所有环节输出' : '是否自动确认所有输出';
                contentStr = (parsed?.content && String(parsed.content).trim()) || '已经完成所有环节局部 ITGap 分析，是否自动确认所有输出？';
              } else if (parsed?.type === 'localItGapTaskCompleteConfirmBlock') {
                titleLabel = parsed?.confirmed ? '已确认任务完成' : '是否确认任务已经完成';
                contentStr = (parsed?.content && String(parsed.content).trim()) || '是否确认局部 ITGap 分析任务已经完成？';
              } else if (parsed?.type === 'localItGapCompressionIntentBlock') {
                titleLabel = parsed?.confirmed ? '局部 ITGap 压缩（已确认）' : '局部 ITGap 压缩';
                contentStr = (parsed?.content && String(parsed.content).trim()) || '我即将开始对局部 ITGap 分析做上下文压缩，便于后续环节的处理。';
              } else if (parsed?.type === 'localItGapCompressionBlock') {
                stepNameForHead = parsed?.stepName || '环节';
                titleLabel = `压缩（${stepNameForHead}）`;
                contentStr = typeof parsed?.compressedJson === 'string' ? parsed.compressedJson : (parsed?.compressedJson != null ? JSON.stringify(parsed.compressedJson, null, 2) : '(无)');
              } else if (parsed?.type === 'taskCompleteBlock') {
                titleLabel = '任务完成';
                contentStr = (parsed?.content && String(parsed.content).trim()) || '用户确认任务完成';
              } else if (parsed?.type === 'unsatisfiedBlock') {
                titleLabel = '用户表示不满意';
                contentStr = (typeof parsed.content === 'string' ? parsed.content : JSON.stringify(parsed.content || {}, null, 2)).slice(0, 2000) + (String(parsed.content || '').length > 2000 ? '\n…' : '');
              }
            } catch (_) {}
            // 所有时间线卡片备注统一为：耗时，输入 token，输出 token
            let durationMsForEntry = 0;
            let inputTokenCount = 0;
            let outputTokenCount = 0;
            try {
              const parsedForToken = typeof c.content === 'string' ? JSON.parse(c.content) : c.content;
              const usage = parsedForToken?.llmMeta?.usage;
              const currentPrompt = usage?.prompt_tokens ?? 0;
              const currentCompletion = usage?.completion_tokens ?? 0;
              const currentDuration = (parsedForToken?.llmMeta && typeof parsedForToken.llmMeta.durationMs === 'number') ? parsedForToken.llmMeta.durationMs : 0;
              if (logType === '输入') {
                // 输入卡片：耗时为 0，输出 token 为 0，输入 token 为后续大模型调用返回的 prompt_tokens
                durationMsForEntry = 0;
                outputTokenCount = 0;
                const nextContent = comms[i + 1]?.content;
                try {
                  const nextParsed = typeof nextContent === 'string' ? JSON.parse(nextContent) : nextContent;
                  inputTokenCount = nextParsed?.llmMeta?.usage?.prompt_tokens ?? 0;
                } catch (_) {
                  inputTokenCount = 0;
                }
              } else if (logType === 'LLM-查询') {
                // LLM-查询卡片：输入 token=prompt_tokens，输出 token=completion_tokens，耗时=本次调用耗时
                durationMsForEntry = currentDuration;
                inputTokenCount = currentPrompt;
                outputTokenCount = currentCompletion;
              } else if (logType === '输出' || logType === '确认') {
                // 输出/确认卡片：耗时为大模型返回耗时，输入 token 为 0，输出 token 为 completion_tokens
                durationMsForEntry = currentDuration;
                inputTokenCount = 0;
                outputTokenCount = currentCompletion;
              } else if (logType === '压缩') {
                // 压缩卡片：耗时为该次大模型返回耗时，输入/输出 token 为该次调用的 prompt_tokens / completion_tokens
                durationMsForEntry = currentDuration;
                inputTokenCount = currentPrompt;
                outputTokenCount = currentCompletion;
              } else {
                durationMsForEntry = 0;
                inputTokenCount = 0;
                outputTokenCount = 0;
              }
            } catch (_) {}
            // 累计总耗时、输入 token、输出 token
            totals.durationMs += durationMsForEntry;
            taskTotals.durationMs += durationMsForEntry;
            totals.inputTokens += inputTokenCount;
            taskTotals.inputTokens += inputTokenCount;
            totals.outputTokens += outputTokenCount;
            taskTotals.outputTokens += outputTokenCount;
            // 每条卡片统一展示：耗时，输入 token，输出 token（顺序一致）
            const durationSec = durationMsForEntry >= 0 ? (durationMsForEntry / 1000).toFixed(1) : '0';
            const durationLabel = `<span class="problem-detail-history-timeline-duration" title="大模型耗时">${durationSec}秒</span>`;
            const inputTokenStr = inputTokenCount.toLocaleString();
            const outputTokenStr = outputTokenCount.toLocaleString();
            const inputLabel = `<span class="problem-detail-history-timeline-token-in" title="输入 token">输入 ${inputTokenStr}</span>`;
            const outputLabel = `<span class="problem-detail-history-timeline-token-out" title="输出 token">输出 ${outputTokenStr}</span>`;
            const metaCountsHtml = `<span class="problem-detail-history-timeline-meta-counts">${durationLabel}${inputLabel}${outputLabel}</span>`;
            return `
          <div class="problem-detail-history-timeline-node" data-index="${i}" data-log-type="${escapeHtml(logType)}">
            <div class="problem-detail-history-timeline-dot-wrap">
              <div class="problem-detail-history-timeline-dot"></div>
            </div>
            <div class="problem-detail-history-timeline-body">
              <button type="button" class="problem-detail-history-timeline-head" role="button" aria-expanded="false">
                <span class="problem-detail-history-timeline-expand">▸</span>
                <span class="problem-detail-history-timeline-time">${escapeHtml(timeStr)}</span>
                <span class="problem-detail-history-log-type-tag problem-detail-history-log-type-${LOG_TYPE_CLASS[logType] || 'confirm'}">${escapeHtml(logType)}</span>${confirmTagForHead}${stepNameForHead ? `<span class="problem-detail-history-timeline-step-name">${escapeHtml(stepNameForHead)}</span>` : ''}${contextNoteForHead ? `<span class="problem-detail-history-timeline-step-name">${escapeHtml(contextNoteForHead)}</span>` : ''}${sessionPlanNoteForHead ? `<span class="problem-detail-history-timeline-step-name">${escapeHtml(sessionPlanNoteForHead)}</span>` : ''}${metaCountsHtml}
              </button>
              <div class="problem-detail-history-timeline-detail" hidden>
                <div class="problem-detail-history-timeline-detail-meta">
                  <span>${escapeHtml(titleLabel)}</span>
                  <span>${escapeHtml(timeStr)}</span>
                </div>
                ${contentHtml
                  ? `<div class="problem-detail-history-timeline-detail-content problem-detail-history-timeline-detail-content-rich">${contentHtml}</div>`
                  : `<pre class="problem-detail-history-timeline-detail-content">${escapeHtml(contentStr)}</pre>`}
              </div>
            </div>
          </div>`;
          }).join('');
      const taskInputTokensStr = taskTotals.inputTokens.toLocaleString();
      const taskOutputTokensStr = taskTotals.outputTokens.toLocaleString();
      const taskDurationSec = (taskTotals.durationMs / 1000).toFixed(1);
      const taskMetaHtml = `<span class="problem-detail-history-task-node-meta problem-detail-history-timeline-meta-counts">
        <span class="problem-detail-history-timeline-duration" title="本任务耗时">${escapeHtml(taskDurationSec)}秒</span>
        <span class="problem-detail-history-timeline-token-in" title="本任务输入 token 总和">输入 ${escapeHtml(taskInputTokensStr)}</span>
        <span class="problem-detail-history-timeline-token-out" title="本任务输出 token 总和">输出 ${escapeHtml(taskOutputTokensStr)}</span>
      </span>`;
      const statusClass = taskStatusText === '已完成' ? 'problem-detail-history-task-done' : taskStatusText === '进行中' ? 'problem-detail-history-task-current' : '';
      const taskInfoHtml = `
      <div class="problem-detail-history-task-info">
        <h5>归属阶段</h5>
        <p>${escapeHtml(task.stage)}</p>
        <h5>任务目标</h5>
        <p>${escapeHtml(objective)}</p>
        <h5>评估标准</h5>
        <p>${escapeHtml(evaluationCriteria)}</p>
        <h5>输入</h5>
        <p>${escapeHtml(inputDesc)}</p>
        <h5>动作</h5>
        <p>${escapeHtml(actionDesc)}</p>
        <h5>输出反馈</h5>
        <p>${escapeHtml(outputDesc)}</p>
        <h5>任务状态</h5>
        <p>${escapeHtml(taskStatusText)}</p>
      </div>`;
      return `
      <div class="problem-detail-history-task-root ${statusClass}" data-task-id="${task.id}" data-status="${escapeHtml(taskStatusText)}">
        <button type="button" class="problem-detail-history-task-node" data-task-id="${task.id}" role="button">
          <span class="task-node-expand">▸</span>
          <span class="task-node-name">${escapeHtml(task.id.charAt(0).toUpperCase() + task.id.slice(1) + '｜' + task.name)}</span>
          ${taskMetaHtml}
        </button>
        <div class="problem-detail-history-task-children" hidden>
          <div class="problem-detail-history-task-tabs" role="tablist">
            <button type="button" class="problem-detail-history-tab problem-detail-history-tab-active" role="tab" aria-selected="true" data-tab="detail">任务详情</button>
            <button type="button" class="problem-detail-history-tab" role="tab" aria-selected="false" data-tab="log">过程日志</button>
          </div>
          <div class="problem-detail-history-tab-panel" role="tabpanel" data-tab="detail">${taskInfoHtml}</div>
          <div class="problem-detail-history-tab-panel" role="tabpanel" data-tab="log" hidden><div class="problem-detail-history-timeline">${timelineHtml}</div></div>
        </div>
      </div>`;
    }).join('');
    const totalInputTokensStr = totals.inputTokens.toLocaleString();
    const totalOutputTokensStr = totals.outputTokens.toLocaleString();
    const totalSecNum = totals.durationMs / 1000;
    const totalMinutes = Math.floor(totalSecNum / 60);
    const totalSecRem = (totalSecNum % 60).toFixed(1);
    const totalDurationStr = totalMinutes >= 1 ? `${totalMinutes}分${totalSecRem}秒` : `${totalSecRem}秒`;
    const iconDuration = '<span class="problem-detail-history-summary-icon" aria-hidden="true"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg></span>';
    const iconInput = '<span class="problem-detail-history-summary-icon problem-detail-history-summary-icon-in" aria-hidden="true"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><polyline points="19 12 12 19 5 12"/></svg></span>';
    const iconOutput = '<span class="problem-detail-history-summary-icon problem-detail-history-summary-icon-out" aria-hidden="true"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="19" x2="12" y2="5"/><polyline points="5 12 12 5 19 12"/></svg></span>';
    const summaryHtml = `
    <div class="problem-detail-history-summary">
      <div class="problem-detail-history-summary-item" title="所有过程日志条目的大模型耗时之和">
        <span class="problem-detail-history-summary-label">${iconDuration}总耗时</span>
        <span class="problem-detail-history-summary-value problem-detail-history-summary-duration">${escapeHtml(totalDurationStr)}</span>
      </div>
      <div class="problem-detail-history-summary-item" title="所有过程日志条目的输入 token 总和">
        <span class="problem-detail-history-summary-label">${iconInput}输入 token</span>
        <span class="problem-detail-history-summary-value problem-detail-history-summary-tokens-in">${escapeHtml(totalInputTokensStr)}</span>
      </div>
      <div class="problem-detail-history-summary-item" title="所有过程日志条目的输出 token 总和">
        <span class="problem-detail-history-summary-label">${iconOutput}输出 token</span>
        <span class="problem-detail-history-summary-value problem-detail-history-summary-tokens-out">${escapeHtml(totalOutputTokensStr)}</span>
      </div>
    </div>`;
    container.innerHTML = summaryHtml + taskListHtml;
    /* 任务节点展开由 main.js 在 problemDetailHistoryPanel 上的事件委托处理 */
    container.querySelectorAll('.problem-detail-history-tab').forEach((tab) => {
      tab.addEventListener('click', () => {
        const root = tab.closest('.problem-detail-history-task-children');
        if (!root) return;
        const tabKey = tab.getAttribute('data-tab');
        root.querySelectorAll('.problem-detail-history-tab').forEach((t) => {
          t.classList.remove('problem-detail-history-tab-active');
          t.setAttribute('aria-selected', 'false');
        });
        tab.classList.add('problem-detail-history-tab-active');
        tab.setAttribute('aria-selected', 'true');
        root.querySelectorAll('.problem-detail-history-tab-panel').forEach((panel) => {
          panel.hidden = panel.getAttribute('data-tab') !== tabKey;
        });
      });
    });
    container.querySelectorAll('.problem-detail-history-timeline-head').forEach((btn) => {
      btn.addEventListener('click', () => {
        const body = btn.closest('.problem-detail-history-timeline-body');
        const detail = body?.querySelector('.problem-detail-history-timeline-detail');
        if (!detail) return;
        const isExpanded = !detail.hidden;
        detail.hidden = isExpanded;
        btn.classList.toggle('expanded', !isExpanded);
        btn.setAttribute('aria-expanded', !isExpanded);
        btn.querySelector('.problem-detail-history-timeline-expand')?.classList.toggle('expanded', !isExpanded);
      });
    });
    restoreHistoryExpandedState(container, expandedState);
    const taskNodeCount = container.querySelectorAll('.problem-detail-history-task-node').length;
    console.log('[沟通历史] 渲染完成', { taskNodeCount, hasPanel: !!container.closest('.problem-detail-history-panel') });
  }

  global.inferTaskIdFromMessage = inferTaskIdFromMessage;
  global.shouldIncludeInCommunicationHistory = shouldIncludeInCommunicationHistory;
  global.getCommunicationsByTask = getCommunicationsByTask;
  global.getCommunicationsAsTimeline = getCommunicationsAsTimeline;
  /** 渲染沟通历史面板（2 参数：container, deps），供 main 的 renderProblemDetailHistory() 调用 */
  global.renderCommunicationHistoryPanel = renderProblemDetailHistory;
})(typeof window !== 'undefined' ? window : this);
