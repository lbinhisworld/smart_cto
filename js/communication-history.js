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
    if (type === 'taskContextBlock') return msg.taskId || null;
    if (type === 'taskCompleteBlock' || type === 'taskCompletionConfirmBlock') return msg.taskId || null;
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
    if (type === 'taskContextBlock') return true;
    if (type === 'taskCompleteBlock') return true;
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
      const speaker = (msg.role === 'user' || msg.type === 'taskCompleteBlock') ? '用户' : '系统大模型';
      const payload = { role: msg.type === 'taskCompleteBlock' ? 'user' : (msg.role || 'system'), content: msg.content, type: msg.type, timestamp: msg.timestamp };
      if (msg.type === 'taskCompleteBlock' && msg.taskId) payload.taskId = msg.taskId;
      if (msg.type === 'taskContextBlock') {
        payload.content = '任务上下文';
        payload.contextJson = msg.contextJson;
        payload.taskId = msg.taskId;
      }
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

  /** 从沟通记录条目解析日志类型：输入、确认、修改、讨论、上下文、任务完成 */
  function getCommunicationLogType(c) {
    if (c.speaker === '用户') return '输入';
    try {
      const parsed = typeof c.content === 'string' ? JSON.parse(c.content) : c.content;
      if (parsed?.type === 'taskCompleteBlock') return '任务完成';
      if (parsed?.type === 'taskContextBlock') return '上下文';
      if (parsed?.type === 'intentExtractionCard' && parsed?.data?.intent === 'discussion') return '讨论';
      if (parsed?.type === 'intentExtractionCard' && parsed?.data?.intent === 'modification') return '修改';
      if (parsed?.type === 'intentExtractionCard' && (parsed?.data?.intent === 'query' || parsed?.data?.intent === 'execute')) return '上下文';
      if (c.speaker === '系统提炼') return '讨论';
    } catch (_) {}
    return '确认';
  }

  const LOG_TYPE_CLASS = { '输入': 'input', '确认': 'confirm', '修改': 'modify', '讨论': 'discuss', '上下文': 'context', '任务完成': 'complete' };
  const INTENT_LABELS = { query: '简单查询', modification: '反馈修改意见', execute: '执行操作', discussion: '讨论请教' };

  /** 渲染沟通历史面板：任务详情/过程日志双 Tab、时间线及日志类型标签。deps: { item, getChatsForProblem, getTaskStatusText } */
  function renderProblemDetailHistory(container, deps) {
    if (!container) return;
    const item = deps?.item;
    const getChatsForProblem = deps?.getChatsForProblem;
    const getTaskStatusText = deps?.getTaskStatusText;
    const createdAt = item?.createdAt;
    const getTaskTrackingData = typeof global.getTaskTrackingData === 'function' ? global.getTaskTrackingData : () => ({});
    const trackingData = createdAt ? (getTaskTrackingData()[createdAt] || {}) : {};
    const communications = createdAt && getChatsForProblem ? getCommunicationsByTask(createdAt, getChatsForProblem(createdAt)) : {};
    const allHistoryTasks = [...FOLLOW_TASKS, ...ITGAP_HISTORY_TASKS, ...IT_STRATEGY_TASKS];
    container.innerHTML = allHistoryTasks.map((task) => {
      const taskData = trackingData[task.id] || {};
      const objective = (taskData.objective ?? task.objective) || '—';
      const evaluationCriteria = (taskData.evaluationCriteria ?? task.evaluationCriteria) || '—';
      const extra = TASK_EXTRA_FIELDS[task.id] || {};
      const inputDesc = extra.input || '—';
      const actionDesc = extra.action || '—';
      const outputDesc = extra.outputFeedback || '—';
      const taskStatusText = typeof getTaskStatusText === 'function' ? getTaskStatusText(item, task.id, allHistoryTasks) : '—';
      const comms = (communications[task.id] || []).slice().sort((a, b) => {
        const ta = (a.time && new Date(a.time).getTime()) || 0;
        const tb = (b.time && new Date(b.time).getTime()) || 0;
        return ta - tb;
      });
      const commCount = comms.length;
      const timelineHtml = comms.length === 0
        ? '<p class="problem-detail-history-comm-empty">暂无沟通记录</p>'
        : comms.map((c, i) => {
            const timeStr = c.time ? formatChatTime(c.time) : '—';
            const logType = getCommunicationLogType(c);
            let contentStr = typeof c.content === 'object' ? JSON.stringify(c.content, null, 2) : c.content;
            let titleLabel = c.speaker;
            try {
              const parsed = typeof c.content === 'string' ? JSON.parse(c.content) : c.content;
              if (parsed?.role === 'user') {
                titleLabel = '用户输入';
                contentStr = (parsed?.content != null ? String(parsed.content).trim() : '') || '(空)';
              } else if (parsed?.type === 'intentExtractionCard' && parsed?.data?.intent != null) {
                const intentLabel = INTENT_LABELS[parsed.data.intent] || parsed.data.intent || '—';
                titleLabel = `用户意图提炼：${intentLabel}`;
              } else if (parsed?.type === 'e2eFlowExtractStartBlock') {
                titleLabel = parsed.content || '我先需要提取端到端流程绘制的 json 数据';
              } else if (parsed?.type === 'e2eFlowJsonBlock') {
                titleLabel = '端到端流程 JSON 数据';
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
                titleLabel = '角色与权限模型推演';
                if (parsed.rolePermissionModelJson) {
                  contentStr = '【角色与权限模型推演 JSON】\n' + JSON.stringify(parsed.rolePermissionModelJson, null, 2);
                }
              } else if (parsed?.type === 'rolePermissionConfirmedLog') {
                titleLabel = parsed.content || '已确认角色与权限模型推演';
                if (parsed.rolePermissionModelJson) {
                  contentStr = (parsed.content || '') + '\n\n【角色与权限模型推演 JSON】\n' + JSON.stringify(parsed.rolePermissionModelJson, null, 2);
                }
              } else if (parsed?.type === 'taskContextBlock') {
                titleLabel = '任务上下文';
                contentStr = parsed.contextJson != null ? JSON.stringify(parsed.contextJson, null, 2) : '(无)';
              } else if (parsed?.type === 'taskCompleteBlock') {
                titleLabel = '用户确认任务完成';
                contentStr = '用户确认任务完成';
              }
            } catch (_) {}
            return `
          <div class="problem-detail-history-timeline-node" data-index="${i}" data-log-type="${escapeHtml(logType)}">
            <div class="problem-detail-history-timeline-dot-wrap">
              <div class="problem-detail-history-timeline-dot"></div>
            </div>
            <div class="problem-detail-history-timeline-body">
              <button type="button" class="problem-detail-history-timeline-head" role="button" aria-expanded="false">
                <span class="problem-detail-history-timeline-expand">▸</span>
                <span class="problem-detail-history-timeline-time">${escapeHtml(timeStr)}</span>
                <span class="problem-detail-history-log-type-tag problem-detail-history-log-type-${LOG_TYPE_CLASS[logType] || 'confirm'}">${escapeHtml(logType)}</span>
              </button>
              <div class="problem-detail-history-timeline-detail" hidden>
                <div class="problem-detail-history-timeline-detail-meta">
                  <span>${escapeHtml(titleLabel)}</span>
                  <span>${escapeHtml(timeStr)}</span>
                </div>
                <pre class="problem-detail-history-timeline-detail-content">${escapeHtml(contentStr)}</pre>
              </div>
            </div>
          </div>`;
          }).join('');
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
          ${commCount > 0 ? `<span class="task-node-badge">${commCount} 条</span>` : ''}
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
    container.querySelectorAll('.problem-detail-history-task-node').forEach((btn) => {
      btn.addEventListener('click', () => {
        const root = btn.closest('.problem-detail-history-task-root');
        const children = root?.querySelector('.problem-detail-history-task-children');
        if (!children) return;
        const expanded = !children.hidden;
        children.hidden = expanded;
        btn.classList.toggle('expanded', !expanded);
      });
    });
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
  }

  global.inferTaskIdFromMessage = inferTaskIdFromMessage;
  global.shouldIncludeInCommunicationHistory = shouldIncludeInCommunicationHistory;
  global.getCommunicationsByTask = getCommunicationsByTask;
  global.getCommunicationsAsTimeline = getCommunicationsAsTimeline;
  /** 渲染沟通历史面板（2 参数：container, deps），供 main 的 renderProblemDetailHistory() 调用 */
  global.renderCommunicationHistoryPanel = renderProblemDetailHistory;
})(typeof window !== 'undefined' ? window : this);
