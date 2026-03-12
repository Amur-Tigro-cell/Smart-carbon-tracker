/* =============================================
   app.js — Smart Carbon Tracker application
   ============================================= */

'use strict';

/* ─── State ─────────────────────────────────── */
let entries = [];          // { id, category, type, amount, co2, date, note }
let activeCategory = 'transport';
let monthlyGoal = null;    // kg — user-set monthly reduction goal
let themeMode = 'light';
let categoryChartInstance = null;
let timelineChartInstance = null;

/* ─── Init ───────────────────────────────────── */
document.addEventListener('DOMContentLoaded', () => {
  initTheme();
  loadFromStorage();
  loadGoalFromStorage();
  initChartTheme();
  setDefaultDates();
  setGreetingDate();
  initNav();
  initSidebarToggle();
  initCategoryTabs();
  initCalculator();
  initHistory();
  initTips();
  initPresets();
  initGoal();
  initReport();
  renderDashboard();
  renderHistory();
});

/* ─── Theme ─────────────────────────────────── */
function initTheme() {
  let saved = null;
  try { saved = localStorage.getItem('sct_theme'); } catch {}
  const prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
  const initial = saved === 'dark' || saved === 'light' ? saved : (prefersDark ? 'dark' : 'light');
  applyTheme(initial, false, false);

  const btn = document.getElementById('themeToggle');
  if (btn) {
    btn.addEventListener('click', () => {
      applyTheme(themeMode === 'dark' ? 'light' : 'dark');
    });
  }
}

function applyTheme(theme, persist = true, rerender = true) {
  themeMode = theme === 'dark' ? 'dark' : 'light';
  document.body.setAttribute('data-theme', themeMode);
  syncThemeToggle();
  if (persist) {
    try { localStorage.setItem('sct_theme', themeMode); } catch {}
  }
  initChartTheme();
  if (rerender) {
    const activeTipFilter = document.querySelector('.filter-btn.active')?.dataset.filter || 'all';
    renderDashboard();
    renderHistory();
    renderTips(activeTipFilter);
    renderReport();
  }
}

function syncThemeToggle() {
  const btn  = document.getElementById('themeToggle');
  const icon = document.getElementById('themeToggleIcon');
  const text = document.getElementById('themeToggleText');
  if (!btn || !icon || !text) return;

  const isDark = themeMode === 'dark';
  icon.textContent = isDark ? '☀️' : '🌙';
  text.textContent = isDark ? 'Light' : 'Dark';
  btn.setAttribute('aria-pressed', isDark ? 'true' : 'false');
}

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
        ).map(normalizeLegacyEntry);
      }
    }
  } catch {
    entries = [];
  }
  updateStorageBadge();
}

function normalizeLegacyEntry(entry) {
  const normalized = { ...entry };
  if (normalized.category === 'energy') {
    normalized.category = ['electricity_grid', 'electricity_solar', 'renewable_electricity'].includes(normalized.type)
      ? 'electricity'
      : 'home_energy';
  }
  return normalized;
}

function saveToStorage() {
  try {
    localStorage.setItem('sct_entries', JSON.stringify(entries));
    updateStorageBadge(true);
  } catch { /* storage full or unavailable */ }
}

function loadGoalFromStorage() {
  try {
    const v = localStorage.getItem('sct_goal');
    monthlyGoal = v !== null ? parseFloat(v) : null;
    if (!monthlyGoal || monthlyGoal <= 0 || monthlyGoal > 9999) monthlyGoal = null;
  } catch { monthlyGoal = null; }
}

function saveGoalToStorage(val) {
  try { localStorage.setItem('sct_goal', String(val)); } catch {}
}

function updateStorageBadge(flash = false) {
  const badge = document.getElementById('storageBadge');
  if (!badge) return;
  badge.textContent = entries.length > 0
    ? `💾 ${entries.length} entr${entries.length === 1 ? 'y' : 'ies'} saved`
    : '💾 Auto-saved';
  if (flash) {
    badge.classList.add('flash');
    clearTimeout(badge._ft);
    badge._ft = setTimeout(() => badge.classList.remove('flash'), 800);
  }
}

function exportCSV() {
  if (entries.length === 0) { showToast('No data to export.', 'error'); return; }
  const headers = ['Date', 'Category', 'Type', 'Amount', 'Unit', 'CO2_kg', 'Note'];
  const rows = [...entries]
    .sort((a, b) => b.date.localeCompare(a.date))
    .map(e => [
      e.date,
      e.category,
      formatTypeLabel(e.category, e.type),
      e.amount,
      UNIT_LABELS[e.category] || '',
      e.co2.toFixed(3),
      e.note || '',
    ].map(v => `"${String(v).replace(/"/g, '""')}"`).join(','));
  const csv = [headers.join(','), ...rows].join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'carbon-tracker-' + todayISO() + '.csv';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  showToast('Data exported as CSV ✓');
}

function initChartTheme() {
  if (!window.Chart) return;
  const cs = getComputedStyle(document.body);
  const chartText = cs.getPropertyValue('--text-500').trim() || '#64748b';
  const chartBorder = cs.getPropertyValue('--border').trim() || '#e2e8f0';
  Chart.defaults.font.family = 'Inter, -apple-system, BlinkMacSystemFont, sans-serif';
  Chart.defaults.color = chartText;
  Chart.defaults.borderColor = chartBorder;
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
  ['transportDate','electricityDate','foodDate','shoppingDate','home_energyDate'].forEach(id => {
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
      if (target === 'report')    renderReport();
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
   'electricityType','electricityAmount',
   'foodType','foodAmount',
   'shoppingType','shoppingAmount',
   'home_energyType','home_energyAmount'].forEach(id => {
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
  renderCalcTips();
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

function evaluateBadgeUnlocks() {
  const monthTotals = new Map();
  entries.forEach(e => {
    const d = new Date(e.date + 'T00:00:00');
    const key = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
    monthTotals.set(key, (monthTotals.get(key) || 0) + e.co2);
  });

  const months = Array.from(monthTotals.entries())
    .map(([key, total]) => {
      const [y, m] = key.split('-').map(Number);
      return { year: y, month: m, total };
    })
    .sort((a, b) => (a.year - b.year) || (a.month - b.month));

  let bestReductionPct = 0;
  for (let i = 1; i < months.length; i++) {
    const prev = months[i - 1].total;
    const curr = months[i].total;
    if (prev > 0 && curr < prev) {
      const pct = ((prev - curr) / prev) * 100;
      if (pct > bestReductionPct) bestReductionPct = pct;
    }
  }

  return {
    bestReductionPct,
    hasMonthlyHistory: months.length >= 2,
    beginner: bestReductionPct > 0,
    protector: bestReductionPct >= 10,
    hero: bestReductionPct >= 20,
  };
}

function renderBadgeSystem(monthlyTotal, prevMonthTotal) {
  const summaryEl = document.getElementById('badgeSummary');
  const msgEl = document.getElementById('badgeMsg');
  const beginnerEl = document.getElementById('badgeBeginner');
  const protectorEl = document.getElementById('badgeProtector');
  const heroEl = document.getElementById('badgeHero');
  const beginnerState = document.getElementById('badgeBeginnerState');
  const protectorState = document.getElementById('badgeProtectorState');
  const heroState = document.getElementById('badgeHeroState');
  if (!summaryEl || !msgEl || !beginnerEl || !protectorEl || !heroEl || !beginnerState || !protectorState || !heroState) return;

  const badgeData = evaluateBadgeUnlocks();
  const unlockedCount = [badgeData.beginner, badgeData.protector, badgeData.hero].filter(Boolean).length;
  summaryEl.textContent = unlockedCount + ' / 3 unlocked';

  const applyState = (wrap, stateEl, unlocked, label) => {
    wrap.classList.toggle('unlocked', unlocked);
    wrap.classList.toggle('locked', !unlocked);
    stateEl.textContent = unlocked ? 'Unlocked' : 'Locked';
    stateEl.className = 'badge-state ' + (unlocked ? 'ok' : 'no');
    if (unlocked) stateEl.setAttribute('title', label + ' unlocked');
    else stateEl.removeAttribute('title');
  };

  applyState(beginnerEl, beginnerState, badgeData.beginner, 'Eco Beginner');
  applyState(protectorEl, protectorState, badgeData.protector, 'Climate Protector');
  applyState(heroEl, heroState, badgeData.hero, 'Sustainability Hero');

  if (!badgeData.hasMonthlyHistory) {
    msgEl.textContent = 'Need at least two months of data to unlock badges.';
    return;
  }

  const currentReductionPct = (prevMonthTotal > 0 && monthlyTotal < prevMonthTotal)
    ? ((prevMonthTotal - monthlyTotal) / prevMonthTotal) * 100
    : 0;

  if (currentReductionPct >= 20) {
    msgEl.textContent = 'Amazing! This month is down ' + currentReductionPct.toFixed(1) + '% from last month. Sustainability Hero earned!';
  } else if (currentReductionPct >= 10) {
    msgEl.textContent = 'Great progress: ' + currentReductionPct.toFixed(1) + '% lower than last month. Climate Protector earned!';
  } else if (currentReductionPct > 0) {
    msgEl.textContent = 'Nice! You reduced emissions by ' + currentReductionPct.toFixed(1) + '% this month. Eco Beginner earned!';
  } else {
    const nextTarget = badgeData.beginner ? (badgeData.protector ? (badgeData.hero ? 0 : 20) : 10) : 0;
    msgEl.textContent = nextTarget === 0
      ? 'Keep reducing month-over-month to unlock more badges.'
      : 'Reduce emissions by ' + nextTarget + '% month-over-month to unlock your next badge.';
  }
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

  // ── Comparison vs global average ──
  const GLOBAL_AVG = 166;
  const cmpYourVal = document.getElementById('compareYourVal');
  const cmpBar = document.getElementById('compareBar');
  const cmpPct = document.getElementById('comparePct');
  const cmpMsg = document.getElementById('compareMsg');
  const cmpPill = document.getElementById('comparePill');
  if (cmpYourVal && cmpBar && cmpPct && cmpMsg && cmpPill) {
    const ratio = (monthlyTotal / GLOBAL_AVG) * 100;
    const clamped = Math.max(0, Math.min(100, ratio));
    cmpYourVal.textContent = monthlyTotal.toFixed(1) + ' kg';
    cmpBar.style.width = clamped.toFixed(1) + '%';
    cmpPct.textContent = Math.round(ratio) + '%';

    if (monthlyTotal === 0) {
      cmpBar.style.background = 'linear-gradient(90deg, #94a3b8, #64748b)';
      cmpPill.textContent = 'No data yet';
      cmpPill.className = 'compare-pill neutral';
      cmpMsg.textContent = 'Log activities to start comparison with the global average.';
    } else if (monthlyTotal < GLOBAL_AVG) {
      const diff = (GLOBAL_AVG - monthlyTotal).toFixed(1);
      cmpBar.style.background = 'linear-gradient(90deg, #10b981, #14b8a6)';
      cmpPill.textContent = 'Below average';
      cmpPill.className = 'compare-pill good';
      cmpMsg.textContent = 'Great job. You are ' + diff + ' kg CO₂e below the global monthly average.';
    } else if (monthlyTotal > GLOBAL_AVG) {
      const diff = (monthlyTotal - GLOBAL_AVG).toFixed(1);
      cmpBar.style.background = 'linear-gradient(90deg, #f59e0b, #f97316)';
      cmpPill.textContent = 'Above average';
      cmpPill.className = 'compare-pill warn';
      cmpMsg.textContent = 'You are ' + diff + ' kg CO₂e above the global monthly average. Focus on your top-emission category to reduce it.';
    } else {
      cmpBar.style.background = 'linear-gradient(90deg, #3b82f6, #6366f1)';
      cmpPill.textContent = 'At average';
      cmpPill.className = 'compare-pill neutral';
      cmpMsg.textContent = 'You are exactly at the global monthly average.';
    }
  }

  // ── Trend badge on timeline ──
  const tb = document.getElementById('trendBadge');
  if (tb) { tb.textContent = monthlyTotal > 0 ? monthlyTotal.toFixed(1) + ' kg this month' : ''; }

  // ── Total badge on donut ──
  const tmb = document.getElementById('totalMonthlyBadge');
  if (tmb) { tmb.textContent = monthlyTotal > 0 ? monthlyTotal.toFixed(1) + ' kg' : ''; }

  renderCategoryChart(monthlyEntries);
  renderTimelineChart();
  renderPersonalizedTips('dashPersonalizedTips');
  renderGoalCard(monthlyTotal);
  renderBadgeSystem(monthlyTotal, prevMonthTotal);
}

/* ─── Charts ─────────────────────────────────── */
function renderCategoryChart(monthly) {
  const canvas   = document.getElementById('categoryChart');
  const emptyEl  = document.getElementById('categoryEmpty');
  const legendEl = document.getElementById('categoryLegend');

  if (!window.Chart || !canvas || !emptyEl || !legendEl) return;

  // Aggregate by category
  const totals = {};
  monthly.forEach(e => { totals[e.category] = (totals[e.category] || 0) + e.co2; });
  const keys   = Object.keys(totals).filter(k => totals[k] > 0);
  const total  = keys.reduce((s, k) => s + totals[k], 0);

  if (total === 0) {
    if (categoryChartInstance) {
      categoryChartInstance.destroy();
      categoryChartInstance = null;
    }
    canvas.style.display = 'none';
    legendEl.style.display = 'none';
    emptyEl.classList.add('visible');
    return;
  }

  canvas.style.display = '';
  legendEl.style.display = '';
  emptyEl.classList.remove('visible');

  const labels = keys.map(k => CATEGORY_META[k]?.label || k);
  const values = keys.map(k => totals[k].toFixed(3));
  const colors = keys.map(k => CATEGORY_META[k]?.color || '#cbd5e1');

  if (categoryChartInstance) {
    categoryChartInstance.destroy();
    categoryChartInstance = null;
  }

  categoryChartInstance = new Chart(canvas, {
    type: 'pie',
    data: {
      labels,
      datasets: [{
        data: values,
        backgroundColor: colors,
        borderColor: '#ffffff',
        borderWidth: 3,
        hoverBorderWidth: 3,
        hoverOffset: 10,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: {
        duration: 500,
        easing: 'easeOutQuart',
      },
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: '#0f172a',
          titleColor: '#f8fafc',
          bodyColor: '#e2e8f0',
          padding: 12,
          cornerRadius: 10,
          displayColors: true,
          callbacks: {
            label(context) {
              const value = Number(context.raw || 0);
              const pct = total > 0 ? ((value / total) * 100).toFixed(1) : '0.0';
              return `${context.label}: ${value.toFixed(2)} kg (${pct}%)`;
            },
          },
        },
      },
    },
  });

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

  if (!window.Chart || !canvas || !emptyEl) return;

  if (entries.length === 0) {
    if (timelineChartInstance) {
      timelineChartInstance.destroy();
      timelineChartInstance = null;
    }
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
    labels.push(d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }));
    const sum = entries.filter(e => e.date === iso).reduce((s, e) => s + e.co2, 0);
    values.push(sum);
  }

  const ctx = canvas.getContext('2d');
  const gradient = ctx.createLinearGradient(0, 0, 0, canvas.parentElement?.clientHeight || 220);
  gradient.addColorStop(0, 'rgba(16,185,129,0.30)');
  gradient.addColorStop(1, 'rgba(16,185,129,0.02)');

  if (timelineChartInstance) {
    timelineChartInstance.destroy();
    timelineChartInstance = null;
  }

  timelineChartInstance = new Chart(canvas, {
    type: 'line',
    data: {
      labels,
      datasets: [{
        label: 'Daily emissions',
        data: values,
        borderColor: '#10b981',
        backgroundColor: gradient,
        fill: true,
        tension: 0.38,
        borderWidth: 3,
        pointBackgroundColor: '#10b981',
        pointBorderColor: '#ffffff',
        pointBorderWidth: 2,
        pointHoverRadius: 5,
        pointRadius(context) {
          const value = Number(context.raw || 0);
          return value > 0 ? 3 : 0;
        },
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: {
        duration: 550,
        easing: 'easeOutQuart',
      },
      interaction: {
        mode: 'index',
        intersect: false,
      },
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: '#0f172a',
          titleColor: '#f8fafc',
          bodyColor: '#e2e8f0',
          padding: 12,
          cornerRadius: 10,
          displayColors: false,
          callbacks: {
            label(context) {
              return `${Number(context.raw || 0).toFixed(2)} kg CO₂e`;
            },
          },
        },
      },
      scales: {
        x: {
          grid: {
            display: false,
          },
          ticks: {
            maxTicksLimit: 6,
            color: '#94a3b8',
            font: {
              size: 10,
            },
          },
          border: {
            display: false,
          },
        },
        y: {
          beginAtZero: true,
          ticks: {
            color: '#94a3b8',
            font: {
              size: 10,
            },
            callback(value) {
              return `${Number(value).toFixed(1)} kg`;
            },
          },
          grid: {
            color: '#e2e8f0',
            drawTicks: false,
          },
          border: {
            display: false,
          },
        },
      },
    },
  });
}

/* ─── History ────────────────────────────────── */
function initHistory() {
  document.getElementById('filterCategory').addEventListener('change', renderHistory);
  document.getElementById('filterPeriod').addEventListener('change', renderHistory);
  document.getElementById('searchHistory').addEventListener('input', renderHistory);
  document.getElementById('sortHistory').addEventListener('change', renderHistory);
  document.getElementById('exportCSV').addEventListener('click', exportCSV);
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

  // Apply sort order
  const sortVal = document.getElementById('sortHistory').value;
  if (sortVal === 'oldest') {
    filtered.sort((a, b) => a.date.localeCompare(b.date));
  } else if (sortVal === 'co2_high') {
    filtered.sort((a, b) => b.co2 - a.co2);
  } else if (sortVal === 'co2_low') {
    filtered.sort((a, b) => a.co2 - b.co2);
  } else {
    filtered.sort((a, b) => b.date.localeCompare(a.date));
  }

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
    electricity: {
      electricity_grid: 'Grid Electricity', electricity_solar: 'Solar Electricity',
      renewable_electricity: 'Renewable Supplier',
    },
    home_energy: {
      natural_gas: 'Natural Gas', heating_oil: 'Heating Oil', coal: 'Coal', lpg: 'LPG',
      district_heating: 'District Heating',
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
    energy: {
      electricity_grid: 'Grid Electricity', electricity_solar: 'Solar Electricity',
      natural_gas: 'Natural Gas', heating_oil: 'Heating Oil', coal: 'Coal', lpg: 'LPG',
    },
    waste: {
      general_waste: 'General Waste', recycling: 'Recycling',
      composting: 'Composting', food_waste: 'Food Waste',
    },
  };
  return (labels[category] && labels[category][type]) || type;
}
/* ─── Goal ────────────────────────────────── */
function initGoal() {
  const input  = document.getElementById('goalInput');
  const setBtn = document.getElementById('goalSetBtn');
  if (!input || !setBtn) return;
  if (monthlyGoal) input.value = monthlyGoal;

  function applyGoal() {
    const val = parseFloat(input.value);
    if (!val || val < 1 || val > 9999) { showToast('Enter a valid goal (1–9999 kg).', 'error'); return; }
    monthlyGoal = val;
    saveGoalToStorage(val);
    renderDashboard();
    showToast('Goal set: ' + val + ' kg CO₂e / month ✓');
  }

  setBtn.addEventListener('click', applyGoal);
  input.addEventListener('keydown', e => { if (e.key === 'Enter') applyGoal(); });
  document.querySelectorAll('.goal-preset-btn').forEach(btn => {
    btn.addEventListener('click', () => { input.value = btn.dataset.val; applyGoal(); });
  });
}

function renderGoalCard(monthlyTotal) {
  const section  = document.getElementById('goalProgressSection');
  const pill     = document.getElementById('goalStatusPill');
  const input    = document.getElementById('goalInput');
  if (!section) return;

  if (!monthlyGoal) {
    section.style.display = 'none';
    if (pill) { pill.textContent = 'No goal set'; pill.className = 'goal-status-pill'; }
    return;
  }

  if (input && document.activeElement !== input) input.value = monthlyGoal;

  const pct    = (monthlyTotal / monthlyGoal) * 100;
  const remain = Math.max(0, monthlyGoal - monthlyTotal);
  const over   = Math.max(0, monthlyTotal - monthlyGoal);

  section.style.display = '';
  const fill = document.getElementById('goalFill');
  fill.style.width = Math.min(100, pct).toFixed(1) + '%';
  if (pct >= 100)     fill.style.background = 'linear-gradient(90deg,#ef4444,#dc2626)';
  else if (pct >= 80) fill.style.background = 'linear-gradient(90deg,#f59e0b,#d97706)';
  else                fill.style.background = 'linear-gradient(90deg,#10b981,#059669)';

  document.getElementById('goalPct').textContent        = Math.min(100, Math.round(pct)) + '%';
  document.getElementById('goalStatUsed').textContent   = monthlyTotal.toFixed(1) + ' kg used';
  document.getElementById('goalStatTarget').textContent = 'Goal: ' + monthlyGoal + ' kg';

  const remainEl = document.getElementById('goalStatRemain');
  const msgEl    = document.getElementById('goalMsg');

  if (monthlyTotal === 0) {
    remainEl.textContent = monthlyGoal + ' kg remaining';
    msgEl.textContent = '';
    if (pill) { pill.textContent = 'Goal set'; pill.className = 'goal-status-pill goal-pill--neutral'; }
  } else if (pct >= 100) {
    remainEl.textContent = over.toFixed(1) + ' kg over goal';
    msgEl.textContent = '⚠️ Monthly goal exceeded. Try to reduce your footprint.';
    if (pill) { pill.textContent = '❌ Goal exceeded'; pill.className = 'goal-status-pill goal-pill--over'; }
  } else if (pct >= 80) {
    remainEl.textContent = remain.toFixed(1) + ' kg remaining';
    msgEl.textContent = '⚡ Getting close — ' + remain.toFixed(1) + ' kg left to stay on target.';
    if (pill) { pill.textContent = '⚡ Almost full'; pill.className = 'goal-status-pill goal-pill--warn'; }
  } else {
    remainEl.textContent = remain.toFixed(1) + ' kg remaining';
    msgEl.textContent = '✅ On track to meet your goal this month!';
    if (pill) { pill.textContent = '✅ On track'; pill.className = 'goal-status-pill goal-pill--good'; }
  }
}
/* ─── Personalized Tips ──────────────────────── */
function getCalcTips(category, type) {
  const all    = ECO_TIPS.filter(t => t.cat === category);
  const exact  = all.filter(t => (TIP_TYPE_MAP[t.title] || []).includes(type));
  const others = all.filter(t => !exact.includes(t));
  return [...exact, ...others].slice(0, 2);
}

function renderCalcTips() {
  const panel = document.getElementById('calcTipsPanel');
  if (!panel) return;
  const vals = getFormValues();
  const kg = vals ? getCO2(vals.category, vals.type, vals.amount) : 0;
  if (!vals || kg <= 0) { panel.style.display = 'none'; return; }
  const tips = getCalcTips(vals.category, vals.type);
  if (!tips.length) { panel.style.display = 'none'; return; }
  panel.style.display = '';
  panel.innerHTML =
    `<div class="calc-tips-hdr">💡 Tips to reduce this</div>` +
    `<div class="calc-tips-list">` +
    tips.map(t =>
      `<div class="calc-tip-item">` +
        `<span class="calc-tip-emoji">${t.emoji}</span>` +
        `<div class="calc-tip-body">` +
          `<div class="calc-tip-title">${sanitizeText(t.title)}</div>` +
          `<div class="calc-tip-saving">${sanitizeText(t.saving)}</div>` +
        `</div>` +
      `</div>`
    ).join('') +
    `</div>`;
}

function getPersonalizedTips() {
  if (!entries.length) return [];
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 30);
  const recent = entries.filter(e => new Date(e.date + 'T00:00:00') >= cutoff);
  if (!recent.length) return [];
  // Sum CO₂ by category, highest first
  const totals = {};
  recent.forEach(e => { totals[e.category] = (totals[e.category] || 0) + e.co2; });
  const sortedCats = Object.keys(totals).sort((a, b) => totals[b] - totals[a]);
  const result = [];
  const seen   = new Set();
  for (const cat of sortedCats) {
    // Find the type with highest CO₂ in this category
    const typeTotals = {};
    recent.filter(e => e.category === cat)
          .forEach(e => { typeTotals[e.type] = (typeTotals[e.type] || 0) + e.co2; });
    const topType = Object.keys(typeTotals).sort((a, b) => typeTotals[b] - typeTotals[a])[0];
    for (const tip of getCalcTips(cat, topType)) {
      if (!seen.has(tip.title)) {
        seen.add(tip.title);
        result.push({ ...tip, _cat: cat, _total: totals[cat] });
        if (result.length >= 3) return result;
      }
    }
  }
  return result;
}

function renderPersonalizedTips(containerId) {
  const container = document.getElementById(containerId);
  if (!container) return;
  const tips = getPersonalizedTips();
  if (!tips.length) { container.style.display = 'none'; return; }
  container.style.display = '';
  container.innerHTML =
    `<div class="pers-tips-hdr">` +
      `<span class="pers-tips-label">✨ Personalised for you</span>` +
      `<span class="pers-tips-sub">Based on your highest-emission activities (last 30 days)</span>` +
    `</div>` +
    `<div class="pers-tips-grid">` +
    tips.map(t => {
      const m   = CATEGORY_META[t._cat] || {};
      const col = m.color || '#10b981';
      return `<div class="pers-tip-card" style="border-top:3px solid ${col}">` +
        `<div class="pers-tip-top">` +
          `<span class="pers-tip-emoji">${t.emoji}</span>` +
          `<span class="pers-tip-badge" style="background:${col}22;color:${col}">${sanitizeText(m.label || t._cat)}</span>` +
        `</div>` +
        `<div class="pers-tip-title">${sanitizeText(t.title)}</div>` +
        `<p class="pers-tip-desc">${sanitizeText(t.desc)}</p>` +
        `<div class="pers-tip-saving">${sanitizeText(t.saving)}</div>` +
      `</div>`;
    }).join('') +
    `</div>`;
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
  renderPersonalizedTips('tipsPersonalizedSection');
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

/* ─── Report ─────────────────────────────────── */
function buildReportMonths() {
  const set = new Set();
  entries.forEach(e => {
    const d = new Date(e.date + 'T00:00:00');
    set.add(d.getFullYear() + '-' + d.getMonth());
  });
  const now = new Date();
  set.add(now.getFullYear() + '-' + now.getMonth());
  return Array.from(set)
    .map(key => {
      const [y, m] = key.split('-').map(Number);
      return { year: y, month: m, label: new Date(y, m, 1).toLocaleDateString(undefined, { month: 'long', year: 'numeric' }) };
    })
    .sort((a, b) => b.year - a.year || b.month - a.month);
}

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

/* ─── Resize: redraw charts when window resizes ─ */
let resizeTimer;
window.addEventListener('resize', () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(renderDashboard, 200);
});
