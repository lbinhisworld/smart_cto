/**
 * 局部 ITGap 分析：session 生成、单环节 LLM 调用、解析、压缩、渲染与流程控制
 * 依赖：global.parseValueStreamGraph (valueStream.js)、global.fetchDeepSeekChat (api.js)、
 *       global.escapeHtml、global.renderMarkdown (utils.js)；流程函数依赖 main 挂载的 el、currentProblemDetailItem 等
 */
(function (global) {
  const parseValueStreamGraph = global.parseValueStreamGraph;
  const fetchDeepSeekChat = global.fetchDeepSeekChat;
  const escapeHtml = global.escapeHtml;
  const renderMarkdown = global.renderMarkdown;

  const LOCAL_ITGAP_PROMPT = `# 角色设定
你是一位资深的数字化转型顾问，擅长进行"As-Is（现状） vs To-Be（目标）"的差异分析。现在请基于当前问题的全局 ITGap 分析 json 数据，针对当前环节【替换环节名称】进行深度的局部 IT Gap 分析。

# 全局背景约束
- **架构现状**：企业存在严重的"烟囱式"系统架构，数据孤岛现象明显，销售、财务与生产系统缺乏实时联动。
- **核心痛点**：业务高度依赖人工经验，系统仅作为"记录工具"而非"决策工具"。
- **全局目标**：实现全链路数据透明化，由"人找事"转变为"数据驱动决策"。

# 任务要求
请按以下结构输出该环节的 IT Gap 分析，确保分析结果能直接支撑 IT Gap 的闭环：

1. **现状透视 (Status Quo)**：总结该环节目前的作业模式、IT 支持程度及最致命的瓶颈。
2. **IT Gap 三维映射表**：
   - 数据层 Gap：缺少哪些实时字段、哪些系统间的数据流是断开的？
   - 功能层 Gap：现有系统缺失哪些核心算法、自动化逻辑或控制节点？
   - 体验/效率层 Gap：哪些环节还依赖 Excel/线下沟通？
3. **IT 转型建议 (Actionable Requirements)**：将上述 Gap 翻译为具体的 IT 功能点建议（如：开发 XX 接口、建立 XX 模型、引入 XX 规则引擎）。
4. **业务价值预测**：填补此 Gap 后，能为企业带来哪些量化的业务提升（如：缩短换线时间 20% 等）。

# 输出格式
请仅返回一个 JSON 对象，必须包含以下四个字段（字段名不可更改，均支持 Markdown）：
\`\`\`json
{
  "statusQuo": "现状透视内容（该环节作业模式、IT支持程度、最致命瓶颈）",
  "itGap3DMap": "IT Gap 三维映射表（数据层/功能层/体验效率层 Gap 分别描述）",
  "actionableRequirements": "IT 转型建议（具体功能点，如开发XX接口、建立XX模型）",
  "businessValuePrediction": "业务价值预测（量化提升，如缩短换线时间20%）"
}
\`\`\`
重要：只返回上述 JSON，不要用 Markdown 标题分段，每个维度的内容必须放入对应字段中。`;

  const LOCAL_ITGAP_COMPRESSION_PROMPT = `Role & Context:
我正在进行大规模系统架构推演，目前"局部 IT Gap 分析"文档字数过多。请作为需求架构师，将详尽的分析报告压缩为"元数据摘要"，仅保留能驱动"角色权限推演"和"业务对象建模"的关键逻辑。

Task Goal:
遍历每一个流程环节的 JSON，提取其灵魂要素，剔除所有 Markdown 格式、修饰性词汇和背景说明。

Compression Logic (严格执行):
- 保留 stepIndex 和 stepName：这是唯一标识符。
- 精简 statusQuo：只保留一个关键词描述痛点（如：全人工、Excel 记录）。
- 重组 itGap3DMap 为 coreGaps：提取 1-3 个最致命的技术断点（如：库存数据不实时、缺少基准价模型）。
- 精简 actionableRequirements 为 sysFeatures：提取具体的功能点（如：集成行情 API、建立价格预警规则）。
- 剔除 businessValuePrediction：仅保留其核心指标名称（如：毛利提升、风险降低）。

Output Format (Strict Minified JSON):
请直接输出 JSON 数组，格式如下，每个环节对应一个元素：
[
  {
    "idx": 0,
    "step": "市场行情监控与价格预判",
    "pain": "人工经验决策/数据滞后",
    "gaps": ["行情数据未入库", "无自动化对标模型"],
    "feats": ["外部API行情抓取", "动态价格看板", "阈值预警规则"],
    "val": "毛利/风险控制"
  }
]`;

  const LOCAL_ITGAP_STRUCTURED_SECTIONS = [
    { key: 'statusQuo', label: '现状透视 (Status Quo)', isPrimary: true },
    { key: 'itGap3DMap', label: 'IT Gap 三维映射表', isPrimary: true },
    { key: 'actionableRequirements', label: 'IT 转型建议 (Actionable Requirements)', isPrimary: true },
    { key: 'businessValuePrediction', label: '业务价值预测', isPrimary: false },
  ];

  /** 去除内容开头与蓝色子标题重复的 markdown 小标题 */
  function stripRedundantHeadingFromContent(content, label) {
    if (!content || typeof content !== 'string') return content;
    let text = content.trim();
    const chinesePart = (label.match(/^([^（(]+)/) || [])[1]?.trim() || label;
    const esc = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const patterns = [
      new RegExp(`^#+\\s*[^\\n]*${esc(chinesePart)}[^\\n]*\\n?`),
      new RegExp(`^\\*\\*[^\\n]*${esc(chinesePart)}[^\\n]*\\*\\*\\s*\\n?`),
      new RegExp(`^${esc(chinesePart)}[\\s:：]*\\n?`),
    ];
    for (const re of patterns) {
      const prev = text;
      text = text.replace(re, '').trim();
      if (prev !== text) break;
    }
    return text || content;
  }

  /**
   * 根据端到端流程 valueStream 生成所有环节的局部 ITGap 分析 session（不调用大模型）
   */
  function generateLocalItGapSessions(valueStream) {
    const { stages } = parseValueStreamGraph(valueStream || {});
    const allSteps = stages.flatMap((s) => s.steps);
    return allSteps.map((step, i) => {
      const stepName = step?.name || `环节${i + 1}`;
      const prompt = LOCAL_ITGAP_PROMPT.replace(/【替换环节名称】/g, stepName || '当前环节');
      return {
        stepName,
        stepIndex: i,
        prompt,
        analysisJson: null,
        analysisMarkdown: '',
      };
    });
  }

  /** 构建单环节局部 IT Gap 分析的真实提交内容（systemPrompt + userContent），与 generateLocalItGapAnalysis 发送的完全一致 */
  function buildLocalItGapAnalysisFullInput(stepName, globalItGapJson, fullProcessVsm) {
    const systemPrompt = LOCAL_ITGAP_PROMPT.replace(/【替换环节名称】/g, stepName || '当前环节');
    const userContent = `## 全局 ITGap 分析 json
\`\`\`json
${typeof globalItGapJson === 'string' ? globalItGapJson : JSON.stringify(globalItGapJson || {}, null, 2)}
\`\`\`

## 端到端流程 json（含各环节 IT 现状与痛点）
\`\`\`json
${typeof fullProcessVsm === 'string' ? fullProcessVsm : JSON.stringify(fullProcessVsm || {}, null, 2)}
\`\`\`

请针对环节「${(stepName || '').replace(/"/g, '\\"')}」进行局部 IT Gap 分析，按 JSON 格式返回。`;
    return { systemPrompt, userContent };
  }

  /** 针对单环节调用大模型进行局部 IT Gap 分析；若传入 fullInput 则直接使用，否则按参数构建 */
  async function generateLocalItGapAnalysis(stepName, globalItGapJson, fullProcessVsm, fullInput) {
    const systemPrompt = fullInput?.systemPrompt ?? LOCAL_ITGAP_PROMPT.replace(/【替换环节名称】/g, stepName || '当前环节');
    const userContent = fullInput?.userContent ?? (() => {
      const built = buildLocalItGapAnalysisFullInput(stepName, globalItGapJson, fullProcessVsm);
      return built.userContent;
    })();
    const { content, usage, model, durationMs } = await fetchDeepSeekChat([
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userContent },
    ]);
    return { content, usage, model, durationMs };
  }

  /** 从大模型返回内容中解析局部 ITGap 分析（支持 JSON 或 Markdown 分段） */
  function parseLocalItGapFromContent(content) {
    const result = { statusQuo: '', itGap3DMap: '', actionableRequirements: '', businessValuePrediction: '' };
    if (!content || typeof content !== 'string') return result;
    const text = content.trim();
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      try {
        const parsed = JSON.parse(jsonMatch[0]);
        if (parsed && typeof parsed === 'object') {
          const keyMap = {
            statusQuo: ['statusQuo', 'status_quo', '现状透视'],
            itGap3DMap: ['itGap3DMap', 'it_gap_3d_map', 'itGap3dMap', 'IT Gap 三维映射表', 'it_gap_三维映射表'],
            actionableRequirements: ['actionableRequirements', 'actionable_requirements', 'IT 转型建议'],
            businessValuePrediction: ['businessValuePrediction', 'business_value_prediction', '业务价值预测'],
          };
          for (const [targetKey, aliases] of Object.entries(keyMap)) {
            for (const alias of aliases) {
              const val = parsed[alias];
              if (val != null && String(val).trim()) {
                result[targetKey] = String(val).trim();
                break;
              }
            }
          }
          if (Object.values(result).some((v) => v)) return result;
        }
      } catch (_) {}
    }
    const sectionHeaders = [
      { key: 'statusQuo', regex: /(?:^|\n)(?:#+\s*)?(?:1\.\s*)?现状透视\s*(?:\(Status Quo\))?\s*[:：]?\s*\n?/i },
      { key: 'itGap3DMap', regex: /(?:^|\n)(?:#+\s*)?(?:2\.\s*)?IT\s*Gap\s*三维映射表\s*[:：]?\s*\n?/i },
      { key: 'actionableRequirements', regex: /(?:^|\n)(?:#+\s*)?(?:3\.\s*)?IT\s*转型建议\s*(?:\(Actionable Requirements\))?\s*[:：]?\s*\n?/i },
      { key: 'businessValuePrediction', regex: /(?:^|\n)(?:#+\s*)?(?:4\.\s*)?业务价值预测\s*[:：]?\s*\n?/i },
    ];
    let lastIndex = -1;
    let lastKey = null;
    for (const { key, regex } of sectionHeaders) {
      const match = text.match(regex);
      if (match) {
        const start = match.index + match[0].length;
        if (lastKey && lastIndex >= 0) {
          const block = text.slice(lastIndex, match.index).trim();
          if (block) result[lastKey] = block;
        }
        lastIndex = start;
        lastKey = key;
      }
    }
    if (lastKey != null && lastIndex >= 0) {
      const block = text.slice(lastIndex).trim();
      if (block) result[lastKey] = block;
    }
    if (!Object.values(result).some((v) => v)) result.statusQuo = text;
    return result;
  }

  /**
   * 构建局部 ITGap 结构化展示 HTML。
   * @param {Object} analysis - 分析 JSON。
   * @returns {string} HTML 片段。
   */
  function buildLocalItGapStructuredHtml(analysis) {
    if (!analysis || typeof analysis !== 'object') return '<p>（暂无内容）</p>';
    const parts = [];
    for (const { key, label, isPrimary } of LOCAL_ITGAP_STRUCTURED_SECTIONS) {
      const val = analysis[key];
      let content = (val != null ? String(val).trim() : '') || '—';
      if (content !== '—') content = stripRedundantHeadingFromContent(content, label);
      const sectionClass = isPrimary !== false ? 'problem-detail-local-itgap-section' : 'problem-detail-local-itgap-section problem-detail-local-itgap-section-secondary';
      parts.push(`<div class="${sectionClass}"><h4 class="problem-detail-local-itgap-section-title">${escapeHtml(label)}</h4><div class="problem-detail-local-itgap-section-content markdown-body">${content === '—' ? '—' : renderMarkdown(content)}</div></div>`);
    }
    return parts.join('');
  }

  /** 将局部 ITGap 分析 JSON 转为 Markdown 文本 */
  function buildLocalItGapMarkdown(analysis) {
    if (!analysis || typeof analysis !== 'object') return '';
    const parts = [];
    for (const { key, label } of LOCAL_ITGAP_STRUCTURED_SECTIONS) {
      const val = analysis[key];
      const content = (val != null ? String(val).trim() : '') || '';
      if (content) parts.push(`## ${label}\n\n${content}`);
    }
    return parts.join('\n\n');
  }

  /** 调用大模型对单环节局部 ITGap 分析 JSON 进行上下文压缩 */
  async function compressLocalItGapJson(analysisJson, stepName, stepIndex) {
    const userContent = `以下为环节「${(stepName || '').replace(/"/g, '\\"')}」（stepIndex: ${stepIndex}）的局部 IT Gap 分析 JSON，请按压缩逻辑输出一个仅含一个元素的 JSON 数组（idx、step、pain、gaps、feats、val）：\n\n\`\`\`json\n${typeof analysisJson === 'string' ? analysisJson : JSON.stringify(analysisJson, null, 2)}\n\`\`\``;
    const { content, usage, model, durationMs } = await fetchDeepSeekChat([
      { role: 'system', content: LOCAL_ITGAP_COMPRESSION_PROMPT },
      { role: 'user', content: userContent },
    ]);
    return { content, usage, model, durationMs };
  }

  /** 当用户确认「开始上下文压缩」后，按环节顺序依次压缩并推送 task9 时间线，全部完成后调用 onAllDone() */
  async function runLocalItGapCompressionSequentially(deps) {
    const container = deps.el?.problemDetailChatMessages;
    const item = deps.currentProblemDetailItem;
    if (!container || !item?.createdAt) return;
    const sessions = item.localItGapSessions || [];
    const withAnalysis = sessions
      .map((s, i) => ({ ...s, stepIndex: i }))
      .filter((s) => s.analysisJson != null);
    if (withAnalysis.length === 0) {
      if (typeof deps.onAllCompressionDone === 'function') deps.onAllCompressionDone();
      return;
    }
    for (let i = 0; i < withAnalysis.length; i++) {
      const session = withAnalysis[i];
      const stepName = session.stepName || `环节${session.stepIndex + 1}`;
      const analysisJson = typeof session.analysisJson === 'object' ? session.analysisJson : (() => { try { return JSON.parse(session.analysisJson); } catch (_) { return session.analysisJson; } })();
      let parsingBlock = container.querySelector('.problem-detail-chat-msg-parsing');
      if (!parsingBlock) {
        parsingBlock = document.createElement('div');
        parsingBlock.className = 'problem-detail-chat-msg problem-detail-chat-msg-system problem-detail-chat-msg-parsing';
        container.appendChild(parsingBlock);
      }
      const getTimeStr = deps.getTimeStr || (() => '');
      parsingBlock.innerHTML = `<div class="problem-detail-chat-msg-content-wrap"><div class="problem-detail-chat-parsing-inner"><span class="problem-detail-chat-spinner"></span><span class="problem-detail-chat-msg-content">正在压缩环节「${escapeHtml(stepName)}」的局部 ITGap 分析…</span></div></div><div class="problem-detail-chat-msg-time">${getTimeStr()}</div>`;
      container.scrollTop = container.scrollHeight;
      try {
        const { content, usage, model, durationMs } = await compressLocalItGapJson(analysisJson, stepName, session.stepIndex);
        parsingBlock.remove();
        let compressedJson = content;
        try {
          const text = (typeof content === 'string' ? content : JSON.stringify(content || '')).trim();
          const jsonMatch = text.match(/\[[\s\S]*\]/);
          if (jsonMatch) {
            const arr = JSON.parse(jsonMatch[0]);
            compressedJson = Array.isArray(arr) && arr.length > 0 ? arr[0] : arr;
          }
        } catch (_) {}
        const llmMeta = { usage, model, durationMs };
        const compressedStr = typeof compressedJson === 'object' ? JSON.stringify(compressedJson, null, 2) : String(compressedJson);
        deps.pushAndSaveProblemDetailChat({
          type: 'localItGapCompressionBlock',
          taskId: 'task9',
          stepName,
          stepIndex: session.stepIndex,
          compressedJson: compressedStr,
          llmMeta,
          timestamp: getTimeStr(),
        });
        container.innerHTML = '';
        if (typeof deps.renderProblemDetailChatFromStorage === 'function') deps.renderProblemDetailChatFromStorage(container, deps.problemDetailChatMessages);
        container.scrollTop = container.scrollHeight;
        if (typeof deps.renderProblemDetailHistory === 'function') deps.renderProblemDetailHistory();
      } catch (err) {
        parsingBlock.remove();
        deps.pushAndSaveProblemDetailChat({ role: 'system', content: '局部 ITGap 压缩失败（' + (stepName || '') + '）：' + (err.message || String(err)), timestamp: getTimeStr() });
        container.innerHTML = '';
        if (typeof deps.renderProblemDetailChatFromStorage === 'function') deps.renderProblemDetailChatFromStorage(container, deps.problemDetailChatMessages);
        container.scrollTop = container.scrollHeight;
        if (typeof deps.renderProblemDetailHistory === 'function') deps.renderProblemDetailHistory();
      }
    }
    if (typeof deps.onAllCompressionDone === 'function') deps.onAllCompressionDone();
  }

  /** 执行下一未完成环节的局部 ITGap 分析（依赖由 main 注入） */
  async function runLocalItGapAnalysisForNextStep(deps) {
    const container = deps.el?.problemDetailChatMessages;
    const item = deps.currentProblemDetailItem;
    if (!container || !item?.createdAt) return;
    const valueStream = typeof deps.resolveValueStreamForItGap === 'function' ? deps.resolveValueStreamForItGap(item) : null;
    if (!valueStream || valueStream.raw) return;
    if (!deps.DEEPSEEK_API_KEY) {
      const errBlock = document.createElement('div');
      errBlock.className = 'problem-detail-chat-msg problem-detail-chat-msg-system';
      const getTimeStr = deps.getTimeStr || (() => '');
      errBlock.innerHTML = `<div class="problem-detail-chat-msg-content-wrap"><div class="problem-detail-chat-msg-content">请在 config.local.js 中配置 DEEPSEEK_API_KEY 才能使用局部 ITGap 分析功能。</div></div><div class="problem-detail-chat-msg-time">${getTimeStr()}</div>`;
      container.appendChild(errBlock);
      deps.pushAndSaveProblemDetailChat({ role: 'system', content: '请在 config.local.js 中配置 DEEPSEEK_API_KEY 才能使用局部 ITGap 分析功能。', timestamp: getTimeStr() });
      return;
    }
    const globalItGap = item.globalItGapAnalysisJson;
    if (!globalItGap) return;
    const { stages } = parseValueStreamGraph(valueStream);
    const allSteps = stages.flatMap((s) => s.steps);
    const sessions = item.localItGapSessions || [];
    const analyses = item.localItGapAnalyses || [];
    let nextIndex;
    if (sessions.length > 0) {
      const firstUnfinished = sessions.findIndex((s) => !s.analysisJson);
      if (firstUnfinished < 0) return;
      nextIndex = firstUnfinished;
    } else {
      nextIndex = analyses.length;
    }
    if (nextIndex >= allSteps.length) return;
    const step = allSteps[nextIndex];
    const stepName = step?.name || `环节${nextIndex + 1}`;
    const getTimeStr = deps.getTimeStr || (() => '');
    const fullInput = buildLocalItGapAnalysisFullInput(stepName, globalItGap, valueStream);
    if (typeof deps.pushLocalItGapInputBlock === 'function') deps.pushLocalItGapInputBlock(stepName, nextIndex, fullInput);
    deps.pushAndSaveProblemDetailChat({ role: 'system', content: '正在分析环节【' + stepName + '】', timestamp: getTimeStr() });
    container.innerHTML = '';
    if (typeof deps.renderProblemDetailChatFromStorage === 'function') deps.renderProblemDetailChatFromStorage(container, deps.problemDetailChatMessages);
    container.scrollTop = container.scrollHeight;
    const parsingBlock = document.createElement('div');
    parsingBlock.className = 'problem-detail-chat-msg problem-detail-chat-msg-system problem-detail-chat-msg-parsing';
    parsingBlock.innerHTML = `<div class="problem-detail-chat-msg-content-wrap"><div class="problem-detail-chat-parsing-inner"><span class="problem-detail-chat-spinner"></span><span class="problem-detail-chat-msg-content">正在分析环节「${escapeHtml(stepName)}」…</span></div></div><div class="problem-detail-chat-msg-time">${getTimeStr()}</div>`;
    container.appendChild(parsingBlock);
    container.scrollTop = container.scrollHeight;
    try {
      const { content, usage, model, durationMs } = await generateLocalItGapAnalysis(stepName, globalItGap, valueStream, fullInput);
      parsingBlock.remove();
      const llmMeta = { usage, model, durationMs };
      const messages = deps.problemDetailChatMessages;
      if (Array.isArray(messages) && typeof deps.saveProblemDetailChat === 'function' && item?.createdAt) {
        for (let idx = messages.length - 1; idx >= 0; idx--) {
          const m = messages[idx];
          if (m && m.type === 'localItGapInputBlock' && m.stepIndex === nextIndex) {
            messages[idx] = { ...m, llmMeta };
            deps.saveProblemDetailChat(item.createdAt, messages);
            if (typeof deps.renderProblemDetailHistory === 'function') deps.renderProblemDetailHistory();
            break;
          }
        }
      }
      let analysisJson = parseLocalItGapFromContent(content);
      if (!Object.values(analysisJson).some((v) => v)) analysisJson = { statusQuo: content || '（解析失败）', itGap3DMap: '', actionableRequirements: '', businessValuePrediction: '' };
      const llmMetaHtml = typeof deps.buildLlmMetaHtml === 'function' ? deps.buildLlmMetaHtml(llmMeta) : '';
      const structuredHtml = buildLocalItGapStructuredHtml(analysisJson);
      const analysisMarkdown = buildLocalItGapMarkdown(analysisJson);
      if (typeof deps.updateDigitalProblemLocalItGapAnalysis === 'function') deps.updateDigitalProblemLocalItGapAnalysis(item.createdAt, stepName, nextIndex, analysisJson, analysisMarkdown);
      const updatedList = typeof deps.getDigitalProblems === 'function' ? deps.getDigitalProblems() : [];
      const updated = updatedList.find((it) => it.createdAt === item.createdAt);
      if (updated && typeof deps.setCurrentProblemDetailItem === 'function') deps.setCurrentProblemDetailItem(updated);
      const dataAttr = String(JSON.stringify(analysisJson)).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
      const cardBlock = document.createElement('div');
      cardBlock.className = 'problem-detail-chat-msg problem-detail-chat-msg-system problem-detail-chat-local-itgap-card problem-detail-chat-msg-with-delete';
      cardBlock.dataset.msgIndex = String(deps.problemDetailChatMessages.length);
      cardBlock.dataset.stepName = stepName;
      cardBlock.dataset.stepIndex = String(nextIndex);
      const deleteIcon = deps.DELETE_CHAT_MSG_ICON || '';
      cardBlock.innerHTML = `
      <button type="button" class="btn-delete-chat-msg" aria-label="删除">${deleteIcon}</button>
      <div class="problem-detail-chat-local-itgap-card-wrap">
        <div class="problem-detail-chat-local-itgap-card-header">局部 ITGap 分析：${escapeHtml(stepName)}</div>
        <div class="problem-detail-chat-local-itgap-card-body">${structuredHtml}</div>
        <div class="problem-detail-chat-local-itgap-card-actions">
          <button type="button" class="btn-confirm-local-itgap btn-confirm-primary" data-json="${dataAttr}" data-step-name="${escapeHtml(stepName)}" data-step-index="${nextIndex}">确认</button>
          <button type="button" class="btn-redo-local-itgap" data-step-name="${escapeHtml(stepName)}" data-step-index="${nextIndex}">重做</button>
          <button type="button" class="btn-refine-modify" data-task-id="task9">修正</button>
          <button type="button" class="btn-refine-discuss" data-task-id="task9">讨论</button>
        </div>
      </div>
      <div class="problem-detail-chat-msg-time">${getTimeStr()}</div>
      <div class="problem-detail-chat-local-itgap-card-meta">${llmMetaHtml}</div>`;
      container.appendChild(cardBlock);
      deps.pushAndSaveProblemDetailChat({ type: 'localItGapAnalysisCard', data: analysisJson, stepName, stepIndex: nextIndex, timestamp: getTimeStr(), confirmed: false, llmMeta });
      /* 不再推送 localItGapOutputBlock，时间线仅保留带 JSON 与 token/耗时的分析卡片条目 */
      container.scrollTop = container.scrollHeight;
      if (typeof deps.renderProblemDetailContent === 'function') deps.renderProblemDetailContent();
    } catch (err) {
      parsingBlock.remove();
      const errBlock = document.createElement('div');
      errBlock.className = 'problem-detail-chat-msg problem-detail-chat-msg-system';
      errBlock.innerHTML = `<div class="problem-detail-chat-msg-content-wrap"><div class="problem-detail-chat-msg-content">局部 ITGap 分析失败：${escapeHtml(err.message || String(err))}</div></div><div class="problem-detail-chat-msg-time">${getTimeStr()}</div>`;
      container.appendChild(errBlock);
      deps.pushAndSaveProblemDetailChat({ role: 'system', content: '局部 ITGap 分析失败：' + (err.message || String(err)), timestamp: getTimeStr() });
      container.scrollTop = container.scrollHeight;
    }
  }

  const LOCAL_ITGAP_BANNER_ID = 'local-itgap-existing-banner';

  /** 将聊天容器滚动到指定 block 位置 */
  function scrollChatToBlock(container, blockEl) {
    if (!container || !blockEl) return;
    const blockTop = blockEl.offsetTop;
    const containerHeight = container.clientHeight;
    const blockHeight = blockEl.offsetHeight;
    container.scrollTop = Math.max(0, blockTop - Math.floor(containerHeight / 3));
  }

  /** 在聊天区顶部显示粘性提醒条，提示用户已存在局部 ITGap block */
  function showLocalItGapExistingBlockBanner(container, blockEl) {
    if (!container || !blockEl) return;
    let banner = container.querySelector(`#${LOCAL_ITGAP_BANNER_ID}`);
    if (banner) return;
    banner = document.createElement('div');
    banner.id = LOCAL_ITGAP_BANNER_ID;
    banner.className = 'problem-detail-chat-local-itgap-banner';
    banner.innerHTML = `
    <span class="problem-detail-chat-local-itgap-banner-text">局部 ITGap 分析 session 已生成，请向下查看</span>
    <button type="button" class="btn-scroll-to-local-itgap-banner">滚动到</button>
  `;
    const scrollToBlock = () => {
      scrollChatToBlock(container, blockEl);
      banner.remove();
    };
    banner.querySelector('.btn-scroll-to-local-itgap-banner')?.addEventListener('click', scrollToBlock);
    container.insertBefore(banner, container.firstChild);
  }

  global.generateLocalItGapSessions = generateLocalItGapSessions;
  global.generateLocalItGapAnalysis = generateLocalItGapAnalysis;
  global.parseLocalItGapFromContent = parseLocalItGapFromContent;
  global.buildLocalItGapStructuredHtml = buildLocalItGapStructuredHtml;
  global.buildLocalItGapMarkdown = buildLocalItGapMarkdown;
  global.compressLocalItGapJson = compressLocalItGapJson;
  global.runLocalItGapCompressionSequentially = runLocalItGapCompressionSequentially;
  global.runLocalItGapAnalysisForNextStep = runLocalItGapAnalysisForNextStep;
  global.showLocalItGapExistingBlockBanner = showLocalItGapExistingBlockBanner;
  global.scrollChatToBlock = scrollChatToBlock;
  global.LOCAL_ITGAP_BANNER_ID = LOCAL_ITGAP_BANNER_ID;
  global.LOCAL_ITGAP_STRUCTURED_SECTIONS = LOCAL_ITGAP_STRUCTURED_SECTIONS;
})(typeof window !== 'undefined' ? window : this);
