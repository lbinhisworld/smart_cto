/**
 * 详情与查询结果渲染（依赖 js/config.js、js/utils.js、js/valueStream.js；main 中需提供 el）
 */
(function (global) {
  const el = function () { return global.el; };
  const formatValue = function (v) { return global.formatValue(v); };
  const escapeHtml = function (s) { return global.escapeHtml(s); };
  const BASIC_INFO_FIELDS = function () { return global.BASIC_INFO_FIELDS || []; };
  const BMC_FIELDS = function () { return global.BMC_FIELDS || []; };
  const parseValueStreamGraph = function (data) { return global.parseValueStreamGraph ? global.parseValueStreamGraph(data) : { stages: [] }; };

  function buildPageStructureForLLM(record) {
    if (!record) return '';
    const basicInfo = record.basicInfo || {};
    const bmc = record.bmc || {};
    const metadata = record.metadata || {};
    const valueStreams = record.valueStreams || [];
    const vsLines = [];
    if (valueStreams.length > 0) {
      valueStreams.forEach((vs, i) => {
        const vsName = formatValue(vs.name ?? vs.title ?? vs.value_stream_name) || `价值流 ${i + 1}`;
        vsLines.push(`  - [${i}] 价值流名称: ${vsName}`);
        const { stages } = parseValueStreamGraph(vs);
        stages.forEach((stage, si) => {
          vsLines.push(`      阶段: ${stage.name}`);
          (stage.steps || []).forEach((step, ji) => {
            vsLines.push(`        节点: ${step.name}`);
          });
        });
      });
    } else {
      vsLines.push('  (暂无)');
    }
    const lines = [
      '=== 当前页面详情结构 ===',
      '',
      '【基本信息】',
      ...BASIC_INFO_FIELDS().map((f) => `  - ${f.label}: ${formatValue(basicInfo[f.key]) || '—'}`),
      '',
      '【商业画布 BMC】',
      ...BMC_FIELDS().map((f) => `  - ${f.label}: ${formatValue(bmc[f.key]) || '—'}`),
      `  - 综合评述: ${formatValue(bmc.comprehensive_review) || '—'}`,
      '',
      '【档案元数据】',
      `  - 档案 ID: ${formatValue(metadata.analysis_id) || '—'}`,
      `  - 创建时间: ${formatValue(metadata.created_date) || '—'}`,
      `  - 更新时间: ${formatValue(metadata.updated_date) || '—'}`,
      '',
      '【价值流列表】(含阶段与节点名称)',
      ...vsLines,
    ];
    return lines.join('\n');
  }

  function renderBasicInfo(data) {
    if (!data || !el().basicInfoList) return;
    el().basicInfoList.innerHTML = BASIC_INFO_FIELDS().map(({ key, label }) => {
      const raw = data[key];
      const value = formatValue(raw);
      if (key === 'official_website' && raw) {
        return `<dt>${label}</dt><dd><a href="${encodeURI(raw)}" target="_blank" rel="noopener">${escapeHtml(value)}</a></dd>`;
      }
      return `<dt>${label}</dt><dd>${escapeHtml(value) || '—'}</dd>`;
    }).join('');
  }

  function renderBMC(data) {
    if (!data) return;
    if (!el().bmcGrid || !el().bmcReview) return;
    el().bmcGrid.innerHTML = BMC_FIELDS().map(({ key, label }) => {
      const content = formatValue(data[key]);
      return `
      <div class="bmc-block">
        <h4>${escapeHtml(label)}</h4>
        <div class="content">${escapeHtml(content)}</div>
      </div>
    `;
    }).join('');
    const review = formatValue(data.comprehensive_review);
    el().bmcReview.innerHTML = `
    <h4>综合评述</h4>
    <div class="content">${escapeHtml(review)}</div>
  `;
  }

  const METADATA_ITEMS = [
    { key: 'analysis_id', label: '档案 ID' },
    { key: 'created_date', label: '创建时间' },
    { key: 'updated_date', label: '更新时间' },
  ];

  function renderMetadata(data) {
    if (!data) return;
    if (!el().metadataList) return;
    el().metadataList.innerHTML = METADATA_ITEMS.map(({ key, label }) => {
      const value = formatValue(data[key]);
      return `<dt>${label}</dt><dd>${escapeHtml(value) || '—'}</dd>`;
    }).join('');
  }

  function buildDetailHTML(record) {
    const basicInfo = record.basicInfo || {};
    const bmc = record.bmc || {};
    const metadata = record.metadata || {};
    const valueStreams = record.valueStreams || [];

    const basicHtml = BASIC_INFO_FIELDS().map(({ key, label }) => {
      const raw = basicInfo[key];
      const value = formatValue(raw);
      const ddContent = key === 'official_website' && raw
        ? `<a href="${encodeURI(raw)}" target="_blank" rel="noopener">${escapeHtml(value)}</a>`
        : escapeHtml(value) || '—';
      return `<div class="info-grid-cell" data-modify-target="${escapeHtml(label)}"><dt>${label}</dt><dd>${ddContent}</dd></div>`;
    }).join('');

    const bmcHtml = BMC_FIELDS().map(({ key, label }) => {
      const content = formatValue(bmc[key]);
      return `<div class="bmc-block" data-modify-target="${escapeHtml(label)}"><h4>${escapeHtml(label)}</h4><div class="content">${escapeHtml(content)}</div></div>`;
    }).join('');
    const review = formatValue(bmc.comprehensive_review);
    const bmcReviewHtml = `<div class="bmc-review" data-modify-target="综合评述"><h4>综合评述</h4><div class="content">${escapeHtml(review)}</div></div>`;

    const metaHtml = METADATA_ITEMS
      .map(({ key, label }) => {
        const value = formatValue(metadata[key]);
        return `<dt>${label}</dt><dd>${escapeHtml(value) || '—'}</dd>`;
      })
      .join('');

    let valueStreamHtml = '<p class="vs-empty">暂无价值流数据</p>';
    if (valueStreams.length > 0) {
      valueStreamHtml = valueStreams
        .map((item, i) => {
          const name = formatValue(item.name ?? item.title ?? item.value_stream_name ?? `价值流 ${i + 1}`);
          const jsonStr = JSON.stringify(item, null, 2);
          return `
          <div class="vs-card" data-index="${i}" data-vs-index="${i}" data-vs-name="${escapeHtml(name)}">
            <button type="button" class="vs-card-header" aria-expanded="false">
              <span class="vs-card-name">${escapeHtml(name)}</span>
              <span class="vs-card-chevron" aria-hidden="true">▼</span>
            </button>
            <div class="vs-card-body" hidden>
              <div class="vs-tabs">
                <button type="button" class="vs-tab vs-tab-active" data-tab="view">view</button>
                <button type="button" class="vs-tab" data-tab="json">json</button>
              </div>
              <div class="vs-tab-panel vs-tab-panel-view" data-panel="view" data-rendered="false">
                <p class="vs-view-placeholder">展开后加载…</p>
              </div>
              <div class="vs-tab-panel vs-tab-panel-json" data-panel="json" hidden>
                <div class="vs-json-toolbar">
                  <button type="button" class="vs-json-edit-btn">编辑</button>
                  <div class="vs-json-edit-actions" hidden>
                    <button type="button" class="vs-json-undo-btn">撤回</button>
                    <button type="button" class="vs-json-save-btn">保存</button>
                    <button type="button" class="vs-json-cancel-btn">取消</button>
                  </div>
                </div>
                <pre class="vs-json">${escapeHtml(jsonStr)}</pre>
                <textarea class="vs-json-edit" hidden spellcheck="false"></textarea>
                <p class="vs-json-error" hidden></p>
              </div>
            </div>
          </div>`;
        })
        .join('');
    }

    return `
    <section class="basic-info section-card">
      <div class="basic-info-header">
        <h2>基本信息</h2>
        <button type="button" class="btn-basic-info-json">生成 JSON</button>
      </div>
      <div class="info-grid">${basicHtml}</div>
    </section>
    <section class="bmc-section section-card">
      <div class="bmc-section-header">
        <h2>商业画布 (BMC)</h2>
        <button type="button" class="btn-bmc-json">生成 JSON</button>
      </div>
      <div class="bmc-grid">${bmcHtml}</div>
      ${bmcReviewHtml}
    </section>
    <section class="value-stream-section section-card">
      <h2>价值流列表</h2>
      <div class="value-stream-content">${valueStreamHtml}</div>
    </section>
    <section class="metadata section-card muted">
      <h3>档案元数据</h3>
      <dl class="info-grid compact">${metaHtml}</dl>
    </section>
  `;
  }

  global.buildPageStructureForLLM = buildPageStructureForLLM;
  global.renderBasicInfo = renderBasicInfo;
  global.renderBMC = renderBMC;
  global.renderMetadata = renderMetadata;
  global.buildDetailHTML = buildDetailHTML;
})(typeof window !== 'undefined' ? window : this);
