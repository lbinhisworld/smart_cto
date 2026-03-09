/**
 * 沟通历史：从问题详情聊天记录中提取、按任务分段的逻辑（不写入，仅读取与聚合）
 * 依赖：js/config.js（FOLLOW_TASKS、ITGAP_HISTORY_TASKS、IT_STRATEGY_TASKS）、global.parseRolePermissionModel（由 main.js 挂载）
 */
(function (global) {
  const FOLLOW_TASKS = global.FOLLOW_TASKS || [];
  const ITGAP_HISTORY_TASKS = global.ITGAP_HISTORY_TASKS || [];
  const IT_STRATEGY_TASKS = global.IT_STRATEGY_TASKS || [];

  /** 根据聊天消息类型推断所属任务 */
  function inferTaskIdFromMessage(msg) {
    if (!msg) return null;
    if (msg._taskId) return msg._taskId;
    const type = msg.type;
    const role = msg.role;
    const content = msg.content || '';
    if (type === 'basicInfoCard' || type === 'basicInfoJsonBlock' || (role === 'system' && (content === '解析完成' || content === '基本信息 json 提取完毕'))) return 'task1';
    if (type === 'bmcCard' || type === 'bmcStartBlock' || (role === 'system' && content.includes('BMC'))) return 'task2';
    if (type === 'requirementLogicBlock' || type === 'requirementLogicStartBlock') return 'task3';
    if (type === 'valueStreamCard' || type === 'drawValueStreamStartBlock' || type === 'valueStreamStartBlock' || (role === 'system' && (content.includes('价值流') || content.includes('绘制')))) return 'task4';
    if (type === 'itStatusStartBlock' || (role === 'system' && (content === 'IT 现状标注完成' || content === 'IT 现状标注失败'))) return 'task5';
    if (type === 'painPointStartBlock' || (role === 'system' && (content === '痛点标注完成' || content === '痛点标注完毕' || content === '痛点标注失败'))) return 'task6';
    if (type === 'intentExtractionCard' && msg.data?.taskId) return msg.data.taskId;
    if (type === 'e2eFlowGeneratedLog') return 'task7';
    if (type === 'e2eFlowExtractStartBlock' || type === 'e2eFlowJsonBlock') return 'task7';
    if (type === 'globalItGapStartBlock' || type === 'globalItGapAnalysisCard' || type === 'globalItGapAnalysisLog') return 'task8';
    if (type === 'localItGapStartBlock' || type === 'localItGapSessionsBlock' || type === 'localItGapAnalysisCard' || type === 'localItGapAnalysisLog') return 'task9';
    if (type === 'rolePermissionStartBlock' || type === 'rolePermissionCard' || type === 'rolePermissionConfirmedLog') return 'task10';
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
    if (type === 'basicInfoCard' || type === 'bmcCard' || type === 'requirementLogicBlock' || type === 'valueStreamCard') return true;
    if (type === 'e2eFlowGeneratedLog') return true;
    if (type === 'e2eFlowExtractStartBlock') return !!msg.confirmed;
    if (type === 'e2eFlowJsonBlock') return !!msg.confirmed;
    if (type === 'globalItGapStartBlock') return !!msg.confirmed;
    if (type === 'globalItGapAnalysisCard') return !!msg.confirmed;
    if (type === 'globalItGapAnalysisLog') return true;
    if (type === 'localItGapStartBlock') return !!msg.confirmed;
    if (type === 'localItGapSessionsBlock') return true;
    if (type === 'localItGapAnalysisCard') return !!msg.confirmed;
    if (type === 'localItGapAnalysisLog') return true;
    if (type === 'rolePermissionCard') return !!msg.confirmed;
    if (type === 'rolePermissionConfirmedLog') return true;
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
      const speaker = msg.role === 'user' ? '用户' : '系统大模型';
      const payload = { role: msg.role, content: msg.content, type: msg.type, timestamp: msg.timestamp };
      if (msg.data) payload.data = msg.data;
      if (msg.parsed) payload.parsed = msg.parsed;
      if (msg.type === 'intentExtractionCard' && msg.userText) payload.userText = msg.userText;
      if (msg.type === 'e2eFlowGeneratedLog' && msg.valueStreamJson) payload.valueStreamJson = msg.valueStreamJson;
      if (msg.type === 'e2eFlowJsonBlock' && msg.valueStreamJson) payload.valueStreamJson = msg.valueStreamJson;
      if ((msg.type === 'globalItGapAnalysisCard' && msg.data) || (msg.type === 'globalItGapAnalysisLog' && msg.analysisJson)) payload.analysisJson = msg.data || msg.analysisJson;
      if ((msg.type === 'localItGapAnalysisCard' && msg.data) || (msg.type === 'localItGapAnalysisLog' && msg.analysisJson)) payload.analysisJson = msg.data || msg.analysisJson;
      if ((msg.type === 'localItGapAnalysisCard' || msg.type === 'localItGapAnalysisLog') && msg.stepName) payload.stepName = msg.stepName;
      if (msg.type === 'localItGapSessionsBlock' && msg.sessions) payload.sessions = msg.sessions;
      if ((msg.type === 'localItGapAnalysisCard' || msg.type === 'localItGapAnalysisLog') && msg.llmMeta) payload.llmMeta = msg.llmMeta;
      if (msg.type === 'rolePermissionCard' && msg.confirmed && typeof msg.content === 'string') {
        payload.rolePermissionModelJson = parseRolePermissionModel(msg.content);
      }
      if (msg.type === 'rolePermissionConfirmedLog' && msg.rolePermissionModelJson) {
        payload.rolePermissionModelJson = msg.rolePermissionModelJson;
      }
      const contentJson = JSON.stringify(payload, null, 2);
      const entry = { speaker, time: msg.timestamp || '', content: contentJson };
      byTask[currentTask].push(entry);
      lastUserComm = msg.role === 'user' ? { task: currentTask, entry } : null;
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

  global.inferTaskIdFromMessage = inferTaskIdFromMessage;
  global.shouldIncludeInCommunicationHistory = shouldIncludeInCommunicationHistory;
  global.getCommunicationsByTask = getCommunicationsByTask;
  global.getCommunicationsAsTimeline = getCommunicationsAsTimeline;
})(typeof window !== 'undefined' ? window : this);
