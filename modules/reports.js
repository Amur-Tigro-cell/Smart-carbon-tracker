/* =============================================
  modules/reports.js - extracted from app.js
  ============================================= */

function initReport() {
  const sel = document.getElementById('reportMonth');
  const btn = document.getElementById('downloadReportBtn');
  if (!sel || !btn) return;
  sel.addEventListener('change', renderReport);
  btn.addEventListener('click', downloadReportPDF);
  populateReportMonths();
}

function populateReportMonths() {
  const sel = document.getElementById('reportMonth');
  if (!sel) return;
  const current = sel.value;
  sel.innerHTML = '';
  buildReportMonths().forEach((m, i) => {
    const opt = document.createElement('option');
    opt.value = m.year + '-' + m.month;
    opt.textContent = m.label;
    if (i === 0 && !current) opt.selected = true;
    if (opt.value === current) opt.selected = true;
    sel.appendChild(opt);
  });
}

function getReportData(year, month) {
  const monthEntries = entries.filter(e => {
    const d = new Date(e.date + 'T00:00:00');
    return d.getMonth() === month && d.getFullYear() === year;
  });
  const monthlyTotal = monthEntries.reduce((s, e) => s + e.co2, 0);
  const catTotals = {};
  monthEntries.forEach(e => { catTotals[e.category] = (catTotals[e.category] || 0) + e.co2; });
  const topEntries = [...monthEntries].sort((a, b) => b.co2 - a.co2).slice(0, 5);
  const topCat = Object.keys(catTotals).sort((a, b) => catTotals[b] - catTotals[a])[0];
  let summaryMsg = '';
  if (monthlyTotal === 0) {
    summaryMsg = 'No activities recorded this month.';
  } else if (monthlyTotal < 80) {
    summaryMsg = 'Outstanding! Your monthly footprint is well below the Paris Climate Agreement target. You are a climate champion.';
  } else if (monthlyTotal < 125) {
    summaryMsg = 'Excellent work! You are below the 125 kg Paris Climate Goal this month. Keep it up.';
  } else if (monthlyTotal < 166) {
    summaryMsg = 'Good progress. You are above the Paris target but still below the global average of 166 kg CO\u2082e per month.';
  } else if (monthlyTotal < 250) {
    summaryMsg = 'Your footprint is above the global average. Focus on your highest-emission categories to reduce your impact.';
  } else {
    summaryMsg = 'Your footprint is significantly above the global average. The eco tips section has targeted actions to help you reduce it.';
  }
  if (topCat && monthlyTotal > 0) {
    const m = CATEGORY_META[topCat] || {};
    summaryMsg += ' Your highest-emission category is ' + (m.label || topCat) + ' (' + catTotals[topCat].toFixed(1) + ' kg CO\u2082e).';
  }
  if (monthlyGoal) {
    const pct = (monthlyTotal / monthlyGoal * 100);
    summaryMsg += pct >= 100
      ? ' \u26a0\ufe0f You exceeded your monthly goal of ' + monthlyGoal + ' kg.'
      : ' \u2705 You used ' + Math.round(pct) + '% of your ' + monthlyGoal + ' kg goal.';
  }
  return { monthEntries, monthlyTotal, catTotals, topEntries, summaryMsg };
}

function renderReport() {
  populateReportMonths();
  const sel = document.getElementById('reportMonth');
  const content = document.getElementById('reportContent');
  if (!sel || !sel.value || !content) return;
  const [year, month] = sel.value.split('-').map(Number);
  const { monthEntries, monthlyTotal, catTotals, topEntries, summaryMsg } = getReportData(year, month);
  const monthLabel = new Date(year, month, 1).toLocaleDateString(undefined, { month: 'long', year: 'numeric' });

  if (monthEntries.length === 0) {
    content.innerHTML = '<div class="card"><div class="empty-state visible"><span>\ud83d\udccb</span><p>No activities logged for ' + sanitizeText(monthLabel) + '. Log activities in the Calculator first.</p></div></div>';
    return;
  }

  const sortedCats = Object.keys(catTotals).sort((a, b) => catTotals[b] - catTotals[a]);
  const uniqueDays = new Set(monthEntries.map(e => e.date)).size;
  const dailyAvg = (monthlyTotal / Math.max(1, uniqueDays)).toFixed(2);

  // Goal block
  let goalHtml = '';
  if (monthlyGoal) {
    const pct = Math.min(100, (monthlyTotal / monthlyGoal) * 100);
    const remain = Math.max(0, monthlyGoal - monthlyTotal);
    const over = Math.max(0, monthlyTotal - monthlyGoal);
    const color = pct >= 100 ? '#ef4444' : pct >= 80 ? '#f59e0b' : '#10b981';
    goalHtml =
      '<div class="card rpt-goal-card">' +
        '<div class="rpt-section-title">\ud83c\udfaf Goal Progress</div>' +
        '<div class="rpt-goal-row">' +
          '<div class="rpt-goal-meta">' +
            '<span>Target: <strong>' + monthlyGoal + ' kg</strong></span>' +
            '<span class="rpt-goal-remain" style="color:' + color + '">' +
              (pct >= 100 ? over.toFixed(1) + ' kg over goal' : remain.toFixed(1) + ' kg remaining') +
            '</span>' +
          '</div>' +
          '<span class="rpt-goal-pct" style="color:' + color + '">' + Math.round(pct) + '%</span>' +
        '</div>' +
        '<div class="rpt-bar-track"><div class="rpt-bar-fill" style="width:' + pct.toFixed(1) + '%;background:' + color + '"></div></div>' +
      '</div>';
  }

  content.innerHTML =
    '<div class="report-kpi-row">' +
      '<div class="rpt-kpi-card rpt-kpi--total">' +
        '<div class="rpt-kpi-val">' + monthlyTotal.toFixed(2) + '</div>' +
        '<div class="rpt-kpi-unit">kg CO\u2082e</div>' +
        '<div class="rpt-kpi-lbl">Total Emissions</div>' +
      '</div>' +
      '<div class="rpt-kpi-card">' +
        '<div class="rpt-kpi-val">' + monthEntries.length + '</div>' +
        '<div class="rpt-kpi-unit">activities</div>' +
        '<div class="rpt-kpi-lbl">Entries Logged</div>' +
      '</div>' +
      '<div class="rpt-kpi-card">' +
        '<div class="rpt-kpi-val">' + dailyAvg + '</div>' +
        '<div class="rpt-kpi-unit">kg CO\u2082e / day</div>' +
        '<div class="rpt-kpi-lbl">Daily Average</div>' +
      '</div>' +
      '<div class="rpt-kpi-card">' +
        '<div class="rpt-kpi-val">' + carbonRatingLabel(monthlyTotal) + '</div>' +
        '<div class="rpt-kpi-unit">&nbsp;</div>' +
        '<div class="rpt-kpi-lbl">Carbon Rating</div>' +
      '</div>' +
    '</div>' +
    goalHtml +
    '<div class="card">' +
      '<div class="rpt-section-title">\ud83d\udcca Category Breakdown</div>' +
      '<div class="rpt-cat-list">' +
        sortedCats.map(cat => {
          const meta = CATEGORY_META[cat] || {};
          const pct = monthlyTotal > 0 ? (catTotals[cat] / monthlyTotal * 100) : 0;
          return '<div class="rpt-cat-row">' +
            '<div class="rpt-cat-label">' +
              '<span class="rpt-cat-dot" style="background:' + (meta.color || '#ccc') + '"></span>' +
              '<span class="rpt-cat-icon">' + (meta.icon || '') + '</span>' +
              '<span class="rpt-cat-name">' + sanitizeText(meta.label || cat) + '</span>' +
            '</div>' +
            '<div class="rpt-cat-bar-wrap">' +
              '<div class="rpt-cat-bar" style="width:' + pct.toFixed(1) + '%;background:' + (meta.color || '#10b981') + '"></div>' +
            '</div>' +
            '<div class="rpt-cat-vals">' +
              '<span class="rpt-cat-kg">' + catTotals[cat].toFixed(2) + ' kg</span>' +
              '<span class="rpt-cat-pct">' + pct.toFixed(1) + '%</span>' +
            '</div>' +
          '</div>';
        }).join('') +
      '</div>' +
    '</div>' +
    '<div class="card">' +
      '<div class="rpt-section-title">\ud83d\udd1d Top Activities This Month</div>' +
      '<div class="rpt-top-list">' +
        topEntries.map((e, i) => {
          const meta = CATEGORY_META[e.category] || {};
          const label = formatTypeLabel(e.category, e.type);
          const noteStr = e.note ? ' \u00b7 ' + sanitizeText(e.note) : '';
          return '<div class="rpt-top-item">' +
            '<span class="rpt-top-rank">' + (i + 1) + '</span>' +
            '<span class="rpt-top-icon" style="background:' + (meta.color || '#ccc') + '22">' + (meta.icon || '\ud83d\udce6') + '</span>' +
            '<div class="rpt-top-info">' +
              '<div class="rpt-top-name">' + sanitizeText(label) + '</div>' +
              '<div class="rpt-top-meta">' + sanitizeText(formatDate(e.date)) + ' \u00b7 ' + e.amount + ' ' + (UNIT_LABELS[e.category] || '') + noteStr + '</div>' +
            '</div>' +
            '<span class="rpt-top-co2">' + e.co2.toFixed(3) + ' kg</span>' +
          '</div>';
        }).join('') +
      '</div>' +
    '</div>' +
    '<div class="card rpt-summary-card">' +
      '<div class="rpt-section-title">\ud83d\udcac Summary</div>' +
      '<p class="rpt-summary-msg">' + sanitizeText(summaryMsg) + '</p>' +
      '<div class="rpt-benchmarks">' +
        '<span class="rpt-bench-item">\ud83c\udf0d World avg: <strong>166 kg/mo</strong></span>' +
        '<span class="rpt-bench-item">\ud83c\udf31 Paris goal: <strong>125 kg/mo</strong></span>' +
        '<span class="rpt-bench-item">\u2b50 Your total: <strong>' + monthlyTotal.toFixed(1) + ' kg</strong></span>' +
        (monthlyGoal ? '<span class="rpt-bench-item">\ud83c\udfaf Your goal: <strong>' + monthlyGoal + ' kg</strong></span>' : '') +
      '</div>' +
    '</div>';
}

function downloadReportPDF() {
  const sel = document.getElementById('reportMonth');
  if (!sel || !sel.value) { showToast('Select a month first.', 'error'); return; }
  const [year, month] = sel.value.split('-').map(Number);
  const { monthEntries, monthlyTotal, catTotals, topEntries, summaryMsg } = getReportData(year, month);
  if (monthEntries.length === 0) { showToast('No data to export for this month.', 'error'); return; }
  const monthLabel = new Date(year, month, 1).toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
  const generated  = new Date().toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' });
  const sortedCats = Object.keys(catTotals).sort((a, b) => catTotals[b] - catTotals[a]);
  const uniqueDays = new Set(monthEntries.map(e => e.date)).size;

  const catRows = sortedCats.map(cat => {
    const meta = CATEGORY_META[cat] || {};
    const pct  = monthlyTotal > 0 ? (catTotals[cat] / monthlyTotal * 100) : 0;
    return '<tr><td style="padding:7px 8px"><span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:' + (meta.color || '#ccc') + ';margin-right:7px;vertical-align:middle"></span>' + (meta.label || cat) + '</td>' +
      '<td style="padding:7px 8px"><div style="background:#f1f5f9;border-radius:99px;height:10px;overflow:hidden"><div style="height:100%;border-radius:99px;background:' + (meta.color || '#10b981') + ';width:' + pct.toFixed(1) + '%"></div></div></td>' +
      '<td style="padding:7px 8px;text-align:right;font-weight:700">' + catTotals[cat].toFixed(2) + ' kg</td>' +
      '<td style="padding:7px 8px;text-align:right;color:#94a3b8">' + pct.toFixed(1) + '%</td></tr>';
  }).join('');

  const topRows = topEntries.map((e, i) => {
    const meta  = CATEGORY_META[e.category] || {};
    const label = formatTypeLabel(e.category, e.type);
    return '<tr><td style="padding:7px 8px;color:#94a3b8;font-weight:700">' + (i + 1) + '</td>' +
      '<td style="padding:7px 8px"><strong>' + label + '</strong><br><span style="font-size:11px;color:#94a3b8">' + e.date + ' · ' + e.amount + ' ' + (UNIT_LABELS[e.category] || '') + (e.note ? ' · ' + e.note : '') + '</span></td>' +
      '<td style="padding:7px 8px;text-align:right;font-weight:700;color:#059669">' + e.co2.toFixed(3) + ' kg</td></tr>';
  }).join('');

  const goalSection = monthlyGoal ? (() => {
    const pct   = Math.min(100, (monthlyTotal / monthlyGoal) * 100);
    const color = pct >= 100 ? '#ef4444' : pct >= 80 ? '#f59e0b' : '#10b981';
    return '<div style="margin-bottom:28px"><h3 style="font-size:13px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:#64748b;padding-bottom:6px;border-bottom:1px solid #e2e8f0;margin-bottom:14px">\uD83C\uDFAF Goal Progress</h3>' +
      '<div style="display:flex;justify-content:space-between;font-size:13px;margin-bottom:8px"><span>Target: <strong>' + monthlyGoal + ' kg</strong> &nbsp;&middot;&nbsp; Used: <strong>' + monthlyTotal.toFixed(1) + ' kg</strong></span><span style="font-weight:800;color:' + color + '">' + Math.round(pct) + '%</span></div>' +
      '<div style="background:#f1f5f9;border-radius:99px;height:12px;overflow:hidden"><div style="height:100%;border-radius:99px;background:' + color + ';width:' + pct.toFixed(1) + '%"></div></div></div>';
  })() : '';

  const html = '<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><title>Carbon Report \u2013 ' + monthLabel + '</title>' +
    '<style>*{margin:0;padding:0;box-sizing:border-box}body{font-family:Arial,Helvetica,sans-serif;color:#1e293b;padding:36px 40px;font-size:13px;line-height:1.5}' +
    'h1{font-size:22px;color:#059669;margin-bottom:3px}.subtitle{color:#64748b;font-size:12px;margin-bottom:28px;padding-bottom:14px;border-bottom:2px solid #e2e8f0}' +
    '.kpi-row{display:flex;gap:12px;margin-bottom:28px}.kpi-box{flex:1;border:1px solid #e2e8f0;border-radius:8px;padding:14px 12px;text-align:center}' +
    '.kpi-box.primary{background:#f0fdf4;border-color:#bbf7d0}.kpi-val{font-size:22px;font-weight:800;color:#059669}.kpi-box:not(.primary) .kpi-val{font-size:18px;color:#1e293b}' +
    '.kpi-unit{font-size:10px;color:#64748b;margin-bottom:2px}.kpi-lbl{font-size:11px;color:#475569}' +
    'table{width:100%;border-collapse:collapse}td{vertical-align:middle}tbody tr:nth-child(odd){background:#f8fafc}' +
    'h3{font-size:13px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:#64748b;padding-bottom:6px;border-bottom:1px solid #e2e8f0;margin-bottom:14px}' +
    '.summary-box{background:#f0fdf4;border-left:3px solid #10b981;padding:12px 16px;border-radius:4px;font-size:12px;line-height:1.7;margin-bottom:14px}' +
    '.bench{display:flex;gap:20px;font-size:11px;color:#475569;flex-wrap:wrap}' +
    '.footer{margin-top:36px;padding-top:12px;border-top:1px solid #e2e8f0;font-size:10px;color:#94a3b8;display:flex;justify-content:space-between}' +
    '@media print{body{padding:20px 24px}}</style></head><body>' +
    '<h1>\uD83C\uDF3F Monthly Carbon Report</h1>' +
    '<p class="subtitle">' + monthLabel + ' &nbsp;&middot;&nbsp; Generated ' + generated + ' &nbsp;&middot;&nbsp; SmartCarbonTracker</p>' +
    '<div class="kpi-row">' +
      '<div class="kpi-box primary"><div class="kpi-val">' + monthlyTotal.toFixed(2) + '</div><div class="kpi-unit">kg CO\u2082e</div><div class="kpi-lbl">Total Emissions</div></div>' +
      '<div class="kpi-box"><div class="kpi-val">' + monthEntries.length + '</div><div class="kpi-unit">activities</div><div class="kpi-lbl">Entries Logged</div></div>' +
      '<div class="kpi-box"><div class="kpi-val">' + (monthlyTotal / Math.max(1, uniqueDays)).toFixed(2) + '</div><div class="kpi-unit">kg CO\u2082e / day</div><div class="kpi-lbl">Daily Average</div></div>' +
      '<div class="kpi-box"><div class="kpi-val">' + carbonRatingLabel(monthlyTotal) + '</div><div class="kpi-unit">&nbsp;</div><div class="kpi-lbl">Carbon Rating</div></div>' +
    '</div>' +
    goalSection +
    '<div style="margin-bottom:28px"><h3>\uD83D\uDCCA Category Breakdown</h3><table><tbody>' + catRows + '</tbody></table></div>' +
    '<div style="margin-bottom:28px"><h3>\uD83D\uDD1D Top Activities</h3><table><tbody>' + topRows + '</tbody></table></div>' +
    '<div><h3>\uD83D\uDCAC Summary</h3><div class="summary-box">' + summaryMsg + '</div>' +
    '<div class="bench"><span>\uD83C\uDF0D World avg: <strong>166 kg/mo</strong></span><span>\uD83C\uDF31 Paris goal: <strong>125 kg/mo</strong></span><span>\u2B50 Your total: <strong>' + monthlyTotal.toFixed(1) + ' kg</strong></span>' +
    (monthlyGoal ? '<span>\uD83C\uDFAF Your goal: <strong>' + monthlyGoal + ' kg</strong></span>' : '') + '</div></div>' +
    '<div class="footer"><span>SmartCarbonTracker &middot; Monthly Carbon Report</span><span>' + monthLabel + '</span></div>' +
    '<script>window.onload=function(){window.print();};<\/script></body></html>';

  const win = window.open('', '_blank', 'width=820,height=960');
  if (!win) { showToast('Allow pop-ups to download the PDF.', 'error'); return; }
  win.document.write(html);
  win.document.close();
}
