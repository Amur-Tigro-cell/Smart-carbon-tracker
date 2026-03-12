/* =============================================
   app.js — Smart Carbon Tracker application
   ============================================= */

'use strict';

/* ─── State ─────────────────────────────────── */
let entries = [];          // { id, category, type, amount, co2, date, note }
let activeCategory = 'transport';

/* ─── Init ───────────────────────────────────── */
document.addEventListener('DOMContentLoaded', () => {
  loadFromStorage();
  setDefaultDates();
  setGreetingDate();
  initNav();
  initSidebarToggle();
  initCategoryTabs();
  initCalculator();
  initHistory();
  initTips();
  initPresets();
  renderDashboard();
  renderHistory();
});

/* ─── Storage ────────────────────────────────── */
function loadFromStorage() {
  try {
    const saved = localStorage.getItem('sct_entries');
    if (saved) {
      const parsed = JSON.parse(saved);
      // Validate: must be an array of objects with expected keys
      if (Array.isArray(parsed)) {
        entries = parsed.filter(e =>
          typeof e === 'object' && e !== null &&
          ['id','category','type','amount','co2','date'].every(k => k in e)
        );
      }
    }
  } catch {
    entries = [];
  }
}

function saveToStorage() {
  try {
    localStorage.setItem('sct_entries', JSON.stringify(entries));
  } catch { /* storage full or unavailable */ }
}

/* ─── Helpers ────────────────────────────────── */
function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

function sanitizeText(str) {
  // Basic XSS prevention: encode HTML entities
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatDate(dateStr) {
  if (!dateStr) return '—';
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

function todayISO() {
  return new Date().toISOString().split('T')[0];
}

function getCO2(category, type, amount) {
  const factors = EMISSION_FACTORS[category];
  if (!factors) return 0;
  const factor = factors[type];
  if (factor === undefined) return 0;
  // For shopping, scale per $100
  if (category === 'shopping') return (amount / 100) * factor;
  return amount * factor;
}

function co2Equiv(kg) {
  if (kg <= 0) return '';
  if (kg < 1)   return `≈ equivalent to charging ${Math.round(kg * 121)} smartphones`;
  if (kg < 10)  return `≈ driving a petrol car for ${(kg / 0.192).toFixed(0)} km`;
  if (kg < 100) return `≈ ${(kg / 21.77).toFixed(1)} kg of beef production`;
  return `≈ ${(kg / 1000).toFixed(2)} tonnes CO₂e`;
}

function treesNeeded(kgPerMonth) {
  // A mature tree absorbs ~21 kg CO₂ per year
  return Math.ceil((kgPerMonth * 12) / 21);
}

function showToast(msg, type = '') {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.className = 'toast show' + (type ? ' ' + type : '');
  clearTimeout(t._timer);
  t._timer = setTimeout(() => { t.className = 'toast'; }, 3000);
}

function setDefaultDates() {
  ['transportDate','energyDate','foodDate','shoppingDate','wasteDate'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = todayISO();
  });
}

function setGreetingDate() {
  const el = document.getElementById('dashDate');
  if (!el) return;
  const now = new Date();
  el.textContent = now.toLocaleDateString(undefined, {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
  });
}

/* ─── Navigation ─────────────────────────────── */
function initNav() {
  document.querySelectorAll('.sidebar-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const target = btn.dataset.section;
      document.querySelectorAll('.sidebar-btn').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
      btn.classList.add('active');
      document.getElementById(target).classList.add('active');
      if (target === 'dashboard') renderDashboard();
      if (target === 'history')   renderHistory();
    });
  });

  document.getElementById('resetAll').addEventListener('click', () => {
    if (confirm('Reset ALL logged data? This cannot be undone.')) {
      entries = [];
      saveToStorage();
      renderDashboard();
      renderHistory();
      showToast('All data cleared.', 'error');
    }
  });

  document.getElementById('btnLogActivity').addEventListener('click', () => {
    document.querySelector('.sidebar-btn[data-section="calculator"]').click();
  });
}

function initSidebarToggle() {
  const btn     = document.getElementById('sidebarToggle');
  const sidebar = document.getElementById('sidebar');
  if (!btn || !sidebar) return;
  btn.addEventListener('click', () => {
    sidebar.classList.toggle('open');
    sidebar.classList.toggle('collapsed');
  });
}

/* ─── Category Tabs ──────────────────────────── */
function initCategoryTabs() {
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      activeCategory = btn.dataset.cat;
      document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'));
      btn.classList.add('active');
      document.getElementById('panel-' + activeCategory).classList.add('active');
      updatePreview();
    });
  });
}

/* ─── Calculator ─────────────────────────────── */
function initCalculator() {
  // Live preview on input change
  ['transportType','transportDist',
   'energyType','energyAmount',
   'foodType','foodAmount',
   'shoppingType','shoppingAmount',
   'wasteType','wasteAmount'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.addEventListener('input', updatePreview);
    if (el) el.addEventListener('change', updatePreview);
  });

  document.getElementById('addEntry').addEventListener('click', addEntry);
  document.getElementById('calcOnly').addEventListener('click', updatePreview);
}

function getFormValues() {
  const cat = activeCategory;
  const typeEl   = document.getElementById(cat + 'Type');
  const amountEl = document.getElementById(cat + 'Amount') || document.getElementById(cat + 'Dist');
  const dateEl   = document.getElementById(cat + 'Date');
  const noteEl   = document.getElementById(cat + 'Note');

  if (!typeEl || !amountEl) return null;

  return {
    category: cat,
    type:     typeEl.value,
    amount:   parseFloat(amountEl.value) || 0,
    date:     dateEl ? dateEl.value : todayISO(),
    note:     noteEl ? noteEl.value.trim() : '',
  };
}

function updatePreview() {
  const vals = getFormValues();
  if (!vals) return;
  const kg  = getCO2(vals.category, vals.type, vals.amount);
  document.getElementById('previewCO2').textContent = kg.toFixed(3) + ' kg CO\u2082e';
  document.getElementById('resultEquiv').textContent = co2Equiv(kg);
}

function addEntry() {
  const vals = getFormValues();
  if (!vals) return;
  if (vals.amount <= 0) { showToast('Please enter a valid amount.', 'error'); return; }
  if (!vals.date) { showToast('Please select a date.', 'error'); return; }

  const co2 = getCO2(vals.category, vals.type, vals.amount);
  const entry = {
    id:       generateId(),
    category: vals.category,
    type:     vals.type,
    amount:   vals.amount,
    co2:      co2,
    date:     vals.date,
    note:     vals.note.slice(0, 100), // enforce max length server-side style
  };

  entries.unshift(entry);
  saveToStorage();
  renderDashboard();
  renderHistory();
  showToast(`Added ${co2.toFixed(2)} kg CO₂e ✓`);

  // Reset amount field only
  const amountEl = document.getElementById(vals.category + 'Amount') || document.getElementById(vals.category + 'Dist');
  if (amountEl) amountEl.value = '';
  updatePreview();
}

/* ─── Presets ────────────────────────────────── */
function initPresets() {
  const list = document.getElementById('presetsList');
  list.innerHTML = '';
  PRESETS.forEach(p => {
    const co2 = getCO2(p.cat, p.type, p.amount);
    const div = document.createElement('div');
    div.className = 'preset-item';
    div.innerHTML =
      `<span class="preset-name">${sanitizeText(p.label)}</span>` +
      `<span class="preset-co2">${co2.toFixed(2)} kg</span>`;
    div.addEventListener('click', () => {
      const entry = {
        id:       generateId(),
        category: p.cat,
        type:     p.type,
        amount:   p.amount,
        co2:      co2,
        date:     todayISO(),
        note:     p.note,
      };
      entries.unshift(entry);
      saveToStorage();
      renderDashboard();
      renderHistory();
      showToast(`Quick-added: ${sanitizeText(p.label)} (${co2.toFixed(2)} kg CO₂e)`);
    });
    list.appendChild(div);
  });
}

/* ─── Dashboard ──────────────────────────────── */
function calcTrend(current, previous) {
  if (previous === 0 && current === 0) return { label: '—', cls: '' };
  if (previous === 0) return { label: 'New ↑', cls: 'up' };
  const pct = Math.round(((current - previous) / previous) * 100);
  if (pct > 0)  return { label: `↑ ${pct}%`,  cls: 'up' };
  if (pct < 0)  return { label: `↓ ${Math.abs(pct)}%`, cls: 'down' };
  return { label: '→ 0%', cls: '' };
}

function setTrendPill(id, current, previous, compLabel) {
  const wrap = document.getElementById(id);
  if (!wrap) return;
  const trend = calcTrend(current, previous);
  const ico   = wrap.querySelector('.trend-ico');
  const lbl   = wrap.querySelector('.trend-lbl');
  ico.textContent = trend.label;
  ico.className   = 'trend-ico ' + trend.cls;
  if (lbl && compLabel) lbl.textContent = compLabel;
}

function carbonRatingLabel(kgMonth) {
  if (kgMonth === 0)    return '—';
  if (kgMonth < 80)     return '🌟 A+';
  if (kgMonth < 125)    return '✅ A';
  if (kgMonth < 166)    return '🟡 B';
  if (kgMonth < 250)    return '🟠 C';
  return '🔴 D';
}

function renderDashboard() {
  const now   = new Date();
  const today = todayISO();

  // ── Today ──
  const todayEntries = entries.filter(e => e.date === today);
  const todayTotal   = todayEntries.reduce((s, e) => s + e.co2, 0);

  const yest = new Date(now);
  yest.setDate(yest.getDate() - 1);
  const yestISO  = yest.toISOString().split('T')[0];
  const yestTotal = entries.filter(e => e.date === yestISO).reduce((s, e) => s + e.co2, 0);

  // ── Weekly (last 7 days incl. today) ──
  const weekStart = new Date(now);
  weekStart.setDate(weekStart.getDate() - 6);
  weekStart.setHours(0, 0, 0, 0);
  const weeklyEntries = entries.filter(e => new Date(e.date + 'T00:00:00') >= weekStart);
  const weeklyTotal   = weeklyEntries.reduce((s, e) => s + e.co2, 0);

  const prevWeekStart = new Date(weekStart);
  prevWeekStart.setDate(prevWeekStart.getDate() - 7);
  const prevWeekEnd = new Date(weekStart);
  prevWeekEnd.setDate(prevWeekEnd.getDate() - 1);
  const prevWeekTotal = entries.filter(e => {
    const d = new Date(e.date + 'T00:00:00');
    return d >= prevWeekStart && d <= prevWeekEnd;
  }).reduce((s, e) => s + e.co2, 0);

  // ── Monthly ──
  const month = now.getMonth();
  const year  = now.getFullYear();
  const monthlyEntries = entries.filter(e => {
    const d = new Date(e.date + 'T00:00:00');
    return d.getMonth() === month && d.getFullYear() === year;
  });
  const monthlyTotal = monthlyEntries.reduce((s, e) => s + e.co2, 0);

  const prevMonthDate = new Date(year, month - 1, 1);
  const prevMonthTotal = entries.filter(e => {
    const d = new Date(e.date + 'T00:00:00');
    return d.getMonth() === prevMonthDate.getMonth() && d.getFullYear() === prevMonthDate.getFullYear();
  }).reduce((s, e) => s + e.co2, 0);

  // ── Daily avg ──
  const daysSet = new Set(monthlyEntries.map(e => e.date));
  const days    = daysSet.size || 1;
  const dailyAvg = monthlyTotal / days;

  // ── Render KPI numbers ──
  document.getElementById('todayCO2').textContent   = todayTotal.toFixed(2);
  document.getElementById('weeklyCO2').textContent  = weeklyTotal.toFixed(2);
  document.getElementById('monthlyCO2').textContent = monthlyTotal.toFixed(2);

  // ── Trend pills ──
  setTrendPill('todayTrend',  todayTotal,   yestTotal,     'vs yesterday');
  setTrendPill('weekTrend',   weeklyTotal,  prevWeekTotal, 'vs last week');
  setTrendPill('monthTrend',  monthlyTotal, prevMonthTotal,'vs last month');

  // ── Hints ──
  const tCount = todayEntries.length;
  document.getElementById('todayHint').textContent  = tCount ? `${tCount} activit${tCount === 1 ? 'y' : 'ies'} today` : 'No activities logged today';
  const wCount = weeklyEntries.length;
  document.getElementById('weekHint').textContent   = wCount ? `${wCount} activit${wCount === 1 ? 'y' : 'ies'} this week` : 'Last 7 days';
  const mCount = monthlyEntries.length;
  document.getElementById('monthHint').textContent  = mCount ? `${mCount} activit${mCount === 1 ? 'y' : 'ies'} this month` : 'Current calendar month';

  // ── Progress bars (% of daily/weekly/monthly safe zone) ──
  const DAILY_GOAL   = 125 / 30;           // ~4.17 kg
  const WEEKLY_GOAL  = 125 / 30 * 7;      // ~29.2 kg
  const MONTHLY_GOAL = 166;               // world avg
  document.getElementById('todayBar').style.width  = Math.min(100, (todayTotal / DAILY_GOAL) * 100).toFixed(1) + '%';
  document.getElementById('weekBar').style.width   = Math.min(100, (weeklyTotal / WEEKLY_GOAL) * 100).toFixed(1) + '%';
  document.getElementById('monthBar').style.width  = Math.min(100, (monthlyTotal / MONTHLY_GOAL) * 100).toFixed(1) + '%';

  // ── Secondary cards ──
  document.getElementById('totalEntries').textContent = entries.length;
  document.getElementById('treesNeeded').textContent  = treesNeeded(monthlyTotal);
  document.getElementById('dailyAvg').textContent     = dailyAvg.toFixed(2);
  document.getElementById('carbonRating').textContent = carbonRatingLabel(monthlyTotal);

  // ── Sidebar badge ──
  const sb = document.getElementById('sidebarBadge');
  if (sb) sb.textContent = entries.length;

  // ── Chart month label ──
  const monthName = now.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
  const cml = document.getElementById('chartMonthLabel');
  if (cml) cml.textContent = monthName;

  // ── Benchmark ──
  const pct = Math.min(100, (monthlyTotal / 166) * 100);
  document.getElementById('yourBar').style.width = pct.toFixed(1) + '%';
  document.getElementById('yourVal').textContent = monthlyTotal.toFixed(0) + ' kg';

  // Bench status pill
  const bs = document.getElementById('benchStatus');
  if (bs) {
    if (monthlyTotal === 0)        { bs.textContent = 'No data yet'; bs.style.cssText = 'background:#f1f5f9;color:#94a3b8'; }
    else if (monthlyTotal < 125)   { bs.textContent = '🎉 Below Paris Goal'; bs.style.cssText = 'background:#d1fae5;color:#065f46'; }
    else if (monthlyTotal < 166)   { bs.textContent = '✅ Below World Avg'; bs.style.cssText = 'background:#dcfce7;color:#166534'; }
    else if (monthlyTotal < 250)   { bs.textContent = '⚠️ Above Average'; bs.style.cssText = 'background:#fef9c3;color:#854d0e'; }
    else                           { bs.textContent = '🔴 High Emissions'; bs.style.cssText = 'background:#fee2e2;color:#991b1b'; }
    bs.style.cssText += ';font-size:.72rem;font-weight:600;padding:4px 12px;border-radius:99px;';
  }

  // ── Trend badge on timeline ──
  const tb = document.getElementById('trendBadge');
  if (tb) { tb.textContent = monthlyTotal > 0 ? monthlyTotal.toFixed(1) + ' kg this month' : ''; }

  // ── Total badge on donut ──
  const tmb = document.getElementById('totalMonthlyBadge');
  if (tmb) { tmb.textContent = monthlyTotal > 0 ? monthlyTotal.toFixed(1) + ' kg' : ''; }

  renderCategoryChart(monthlyEntries);
  renderTimelineChart();
}

/* ─── Charts ─────────────────────────────────── */
function renderCategoryChart(monthly) {
  const canvas   = document.getElementById('categoryChart');
  const emptyEl  = document.getElementById('categoryEmpty');
  const legendEl = document.getElementById('categoryLegend');

  // Aggregate by category
  const totals = {};
  monthly.forEach(e => { totals[e.category] = (totals[e.category] || 0) + e.co2; });
  const keys   = Object.keys(totals).filter(k => totals[k] > 0);
  const total  = keys.reduce((s, k) => s + totals[k], 0);

  if (total === 0) {
    canvas.style.display = 'none';
    legendEl.style.display = 'none';
    emptyEl.classList.add('visible');
    return;
  }
  canvas.style.display = '';
  legendEl.style.display = '';
  emptyEl.classList.remove('visible');

  const ctx = canvas.getContext('2d');
  const W = canvas.width  = canvas.offsetWidth  || 180;
  const H = canvas.height = canvas.offsetHeight || 180;
  const R = Math.min(W, H) / 2 - 10;
  const cx = W / 2, cy = H / 2;

  ctx.clearRect(0, 0, W, H);

  let startAngle = -Math.PI / 2;
  keys.forEach(k => {
    const frac  = totals[k] / total;
    const angle = frac * 2 * Math.PI;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.arc(cx, cy, R, startAngle, startAngle + angle);
    ctx.closePath();
    ctx.fillStyle = CATEGORY_META[k]?.color || '#ccc';
    ctx.fill();
    startAngle += angle;
  });

  // Center hole (donut)
  ctx.beginPath();
  ctx.arc(cx, cy, R * 0.55, 0, 2 * Math.PI);
  ctx.fillStyle = '#fff';
  ctx.fill();

  // Center text
  ctx.fillStyle = '#0f172a';
  ctx.font = `bold ${Math.round(R * 0.3)}px Inter, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(total.toFixed(1), cx, cy - 4);
  ctx.font = `${Math.round(R * 0.18)}px Inter, sans-serif`;
  ctx.fillStyle = '#6b7280';
  ctx.fillText('kg CO₂e', cx, cy + R * 0.22);

  // Legend
  legendEl.innerHTML = keys.map(k =>
    `<div class="legend-item">
       <span class="legend-dot" style="background:${CATEGORY_META[k]?.color || '#ccc'}"></span>
       <span>${CATEGORY_META[k]?.label || k}: <strong>${totals[k].toFixed(1)}</strong> kg</span>
     </div>`
  ).join('');
}

function renderTimelineChart() {
  const canvas  = document.getElementById('timelineChart');
  const emptyEl = document.getElementById('timelineEmpty');

  if (entries.length === 0) {
    canvas.style.display = 'none';
    emptyEl.classList.add('visible');
    return;
  }
  canvas.style.display = '';
  emptyEl.classList.remove('visible');

  // Aggregate last 30 days
  const today = new Date();
  const labels = [];
  const values = [];
  for (let i = 29; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const iso = d.toISOString().split('T')[0];
    labels.push(iso);
    const sum = entries.filter(e => e.date === iso).reduce((s, e) => s + e.co2, 0);
    values.push(sum);
  }

  const ctx = canvas.getContext('2d');
  const W   = canvas.width  = canvas.offsetWidth  || 300;
  const H   = canvas.height = canvas.offsetHeight || 220;
  ctx.clearRect(0, 0, W, H);

  const pad = { t: 20, r: 20, b: 40, l: 44 };
  const chartW = W - pad.l - pad.r;
  const chartH = H - pad.t - pad.b;
  const maxVal = Math.max(...values, 1);

  // Grid lines
  const steps = 4;
  ctx.strokeStyle = '#e5e7eb';
  ctx.lineWidth = 1;
  for (let i = 0; i <= steps; i++) {
    const y = pad.t + chartH - (i / steps) * chartH;
    ctx.beginPath();
    ctx.moveTo(pad.l, y);
    ctx.lineTo(pad.l + chartW, y);
    ctx.stroke();
    // Y label
    ctx.fillStyle = '#9ca3af';
    ctx.font = '11px Inter, sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText(((maxVal * i / steps).toFixed(1)), pad.l - 6, y + 4);
  }

  // Build path
  const pts = values.map((v, i) => [
    pad.l + (i / (values.length - 1)) * chartW,
    pad.t + chartH - (v / maxVal) * chartH,
  ]);

  // Fill area
  ctx.beginPath();
  ctx.moveTo(pts[0][0], pad.t + chartH);
  pts.forEach(([x, y]) => ctx.lineTo(x, y));
  ctx.lineTo(pts[pts.length - 1][0], pad.t + chartH);
  ctx.closePath();
  const grad = ctx.createLinearGradient(0, pad.t, 0, pad.t + chartH);
  grad.addColorStop(0, 'rgba(22,163,74,.25)');
  grad.addColorStop(1, 'rgba(22,163,74,.02)');
  ctx.fillStyle = grad;
  ctx.fill();

  // Line
  ctx.beginPath();
  ctx.moveTo(pts[0][0], pts[0][1]);
  pts.forEach(([x, y]) => ctx.lineTo(x, y));
  ctx.strokeStyle = '#16a34a';
  ctx.lineWidth = 2;
  ctx.lineJoin = 'round';
  ctx.stroke();

  // Dots on non-zero
  pts.forEach(([x, y], i) => {
    if (values[i] > 0) {
      ctx.beginPath();
      ctx.arc(x, y, 4, 0, 2 * Math.PI);
      ctx.fillStyle = '#16a34a';
      ctx.fill();
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }
  });

  // X-axis labels (every 5 days)
  ctx.fillStyle = '#9ca3af';
  ctx.font = '10px Inter, sans-serif';
  ctx.textAlign = 'center';
  labels.forEach((l, i) => {
    if (i % 5 === 0 || i === labels.length - 1) {
      const x = pad.l + (i / (labels.length - 1)) * chartW;
      const d = new Date(l + 'T00:00:00');
      ctx.fillText(
        d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }),
        x, H - pad.b + 16
      );
    }
  });
}

/* ─── History ────────────────────────────────── */
function initHistory() {
  document.getElementById('filterCategory').addEventListener('change', renderHistory);
  document.getElementById('filterPeriod').addEventListener('change', renderHistory);
  document.getElementById('searchHistory').addEventListener('input', renderHistory);
}

function renderHistory() {
  const catFilter    = document.getElementById('filterCategory').value;
  const periodFilter = document.getElementById('filterPeriod').value;
  const search       = document.getElementById('searchHistory').value.toLowerCase().trim();

  const now   = new Date();
  const today = todayISO();

  let filtered = entries.filter(e => {
    if (catFilter !== 'all' && e.category !== catFilter) return false;
    if (periodFilter !== 'all') {
      const d = new Date(e.date + 'T00:00:00');
      if (periodFilter === 'today') {
        if (e.date !== today) return false;
      } else if (periodFilter === 'week') {
        const weekAgo = new Date(now); weekAgo.setDate(weekAgo.getDate() - 7);
        if (d < weekAgo) return false;
      } else if (periodFilter === 'month') {
        if (d.getMonth() !== now.getMonth() || d.getFullYear() !== now.getFullYear()) return false;
      }
    }
    if (search) {
      const hay = [e.category, e.type, e.note, e.date, e.co2.toString()].join(' ').toLowerCase();
      if (!hay.includes(search)) return false;
    }
    return true;
  });

  const total = filtered.reduce((s, e) => s + e.co2, 0);
  document.getElementById('historyCount').textContent = filtered.length + ' entr' + (filtered.length === 1 ? 'y' : 'ies');
  document.getElementById('historyTotal').textContent = total.toFixed(2) + ' kg CO₂e';

  const list = document.getElementById('historyList');
  if (filtered.length === 0) {
    list.innerHTML = `<div class="empty-state visible"><span>📝</span><p>No activities match your filters.</p></div>`;
    return;
  }

  list.innerHTML = filtered.map(e => {
    const meta  = CATEGORY_META[e.category] || {};
    const label = formatTypeLabel(e.category, e.type);
    const note  = e.note ? ` · ${sanitizeText(e.note)}` : '';
    return `
      <div class="history-item" data-id="${sanitizeText(e.id)}">
        <div class="history-icon ${sanitizeText(e.category)}">${meta.icon || '📦'}</div>
        <div class="history-details">
          <div class="history-title">${sanitizeText(label)}</div>
          <div class="history-meta">${formatDate(e.date)} · ${e.amount} ${UNIT_LABELS[e.category] || ''}${note}</div>
        </div>
        <div class="history-co2">${e.co2.toFixed(3)} kg</div>
        <button class="history-delete" data-id="${sanitizeText(e.id)}" title="Delete entry" aria-label="Delete entry">✕</button>
      </div>`;
  }).join('');

  list.querySelectorAll('.history-delete').forEach(btn => {
    btn.addEventListener('click', (ev) => {
      ev.stopPropagation();
      const id = btn.dataset.id;
      if (!id || !/^[a-z0-9]+$/.test(id)) return;
      entries = entries.filter(e => e.id !== id);
      saveToStorage();
      renderDashboard();
      renderHistory();
      showToast('Entry deleted.');
    });
  });

  // keep sidebar badge in sync when on history page
  const sb = document.getElementById('sidebarBadge');
  if (sb) sb.textContent = entries.length;
}

function formatTypeLabel(category, type) {
  const labels = {
    transport: {
      car_petrol: 'Car (Petrol)', car_diesel: 'Car (Diesel)',
      car_electric: 'Car (Electric)', car_hybrid: 'Car (Hybrid)',
      motorcycle: 'Motorcycle', bus: 'Bus', train: 'Train / Metro',
      flight_short: 'Short-haul Flight', flight_long: 'Long-haul Flight',
      bicycle: 'Bicycle / Walking',
    },
    energy: {
      electricity_grid: 'Grid Electricity', electricity_solar: 'Solar Electricity',
      natural_gas: 'Natural Gas', heating_oil: 'Heating Oil', coal: 'Coal', lpg: 'LPG',
    },
    food: {
      beef: 'Beef', lamb: 'Lamb', pork: 'Pork', chicken: 'Chicken', fish: 'Fish',
      dairy: 'Dairy', eggs: 'Eggs', vegetables: 'Vegetables', fruits: 'Fruits',
      grains: 'Grains', legumes: 'Legumes',
    },
    shopping: {
      clothing: 'Clothing', electronics: 'Electronics', furniture: 'Furniture',
      books_paper: 'Books / Paper', plastic_goods: 'Plastic Goods',
      metal_goods: 'Metal Goods', online_delivery: 'Online Delivery',
    },
    waste: {
      general_waste: 'General Waste', recycling: 'Recycling',
      composting: 'Composting', food_waste: 'Food Waste',
    },
  };
  return (labels[category] && labels[category][type]) || type;
}

/* ─── Eco Tips ───────────────────────────────── */
function initTips() {
  document.querySelectorAll('.filter-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      renderTips(btn.dataset.filter);
    });
  });
  renderTips('all');
}

function renderTips(filter) {
  const grid = document.getElementById('tipsGrid');
  const tips = filter === 'all' ? ECO_TIPS : ECO_TIPS.filter(t => t.cat === filter);
  grid.innerHTML = tips.map(t => {
    const meta = CATEGORY_META[t.cat] || {};
    return `
      <div class="tip-card" data-cat="${sanitizeText(t.cat)}">
        <div class="tip-header">
          <span class="tip-emoji">${t.emoji}</span>
          <div>
            <span class="tip-cat-badge">${sanitizeText(meta.label || t.cat)}</span>
            <div class="tip-title">${sanitizeText(t.title)}</div>
          </div>
        </div>
        <p class="tip-description">${sanitizeText(t.desc)}</p>
        <div class="tip-saving">${sanitizeText(t.saving)}</div>
      </div>`;
  }).join('');
}

/* ─── Resize: redraw charts when window resizes ─ */
let resizeTimer;
window.addEventListener('resize', () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(renderDashboard, 200);
});
