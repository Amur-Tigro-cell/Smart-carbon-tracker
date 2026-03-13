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
let predictionChartInstance = null;
let predictionRunToken = 0;
let travelWatchId = null;
let travelLastCoords = null;
let travelDistanceKm = 0;
let travelTracking = false;
let impactMapInstance = null;
let impactMapLayer = null;
let coachMessages = [];
let offsetSelected = 'tree';
let offsetContributions = { tree: 0, renewable: 0 };
let billAnalyzerChartInstance = null;
let foodScanChartInstance = null;
let climateSimChartInstance = null;

const FOOD_KEYWORDS = {
  beef: ['beef', 'steak', 'burger'],
  lamb: ['lamb', 'mutton'],
  pork: ['pork', 'bacon', 'ham'],
  chicken: ['chicken', 'poultry'],
  fish: ['fish', 'salmon', 'tuna', 'seafood', 'shrimp'],
  dairy: ['milk', 'cheese', 'yogurt', 'butter', 'dairy'],
  eggs: ['egg', 'eggs', 'omelette'],
  vegetables: ['vegetable', 'vegetables', 'salad', 'broccoli', 'spinach', 'carrot'],
  fruits: ['fruit', 'fruits', 'apple', 'banana', 'orange', 'berries'],
  grains: ['rice', 'grain', 'grains', 'bread', 'wheat', 'pasta', 'cereal'],
  legumes: ['legume', 'lentil', 'lentils', 'beans', 'chickpea', 'tofu'],
};

const FOOD_ALTERNATIVES = {
  beef: ['legumes', 'chicken'],
  lamb: ['legumes', 'chicken'],
  pork: ['legumes', 'fish'],
  dairy: ['legumes', 'vegetables'],
  fish: ['legumes', 'vegetables'],
  eggs: ['legumes', 'grains'],
};

const OFFSET_OPTIONS = {
  tree: { label: 'Tree Planting', ratePerKg: 0.05 },
  renewable: { label: 'Renewable Energy Support', ratePerKg: 0.03 },
};

/* ─── Init ───────────────────────────────────── */
document.addEventListener('DOMContentLoaded', () => {
  initTheme();
  initUserAuth();
  loadFromStorage();
  loadGoalFromStorage();
  loadOffsetFromStorage();
  initChartTheme();
  setDefaultDates();
  setGreetingDate();
  initNav();
  initSidebarToggle();
  initCategoryTabs();
  initCalculator();
  initSmartTravel();
  initHistory();
  initTips();
  initPresets();
  initGoal();
  initOffset();
  initClimateSimulator();
  initBillAnalyzer();
  initFoodScanner();
  initReport();
  initImpactMap();
  initCoach();
  initLoadAnimations();
  renderDashboard();
  renderHistory();
  renderImpactMap();
  if (window.lucide && typeof window.lucide.createIcons === 'function') {
    window.lucide.createIcons();
  }
});

function initLoadAnimations() {
  const targets = document.querySelectorAll('#dashboard .kpi-card, #dashboard .sec-card, #dashboard .emission-cat-card, #dashboard .card');
  if (!targets.length) return;

  targets.forEach((el, idx) => {
    el.classList.add('reveal-card');
    el.style.setProperty('--reveal-delay', (idx * 35) + 'ms');
  });

  requestAnimationFrame(() => {
    targets.forEach(el => el.classList.add('reveal-in'));
  });
}

function animateNumberTo(el, target, opts = {}) {
  if (!el) return;

  const duration = Number.isFinite(opts.duration) ? opts.duration : 520;
  const decimals = Number.isFinite(opts.decimals) ? opts.decimals : 2;
  const prefix = opts.prefix || '';
  const suffix = opts.suffix || '';
  const easing = (t) => 1 - Math.pow(1 - t, 3);

  const current = Number(el.dataset.numVal || 0);
  const end = Number.isFinite(target) ? target : 0;
  const start = Number.isFinite(current) ? current : 0;
  el.dataset.numVal = String(end);

  const diff = end - start;
  if (Math.abs(diff) < 0.0001) {
    el.textContent = prefix + end.toFixed(decimals) + suffix;
    return;
  }

  const startTs = performance.now();
  const tick = (now) => {
    const p = Math.min(1, (now - startTs) / duration);
    const v = start + diff * easing(p);
    el.textContent = prefix + v.toFixed(decimals) + suffix;
    if (p < 1) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

/* ─── Theme ─────────────────────────────────── */
function initTheme() {
  let saved = null;
  try { saved = localStorage.getItem('sct_theme'); } catch {}
  const mediaQuery = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;
  const prefersDark = !!(mediaQuery && mediaQuery.matches);
  const initial = saved === 'dark' || saved === 'light' ? saved : (prefersDark ? 'dark' : 'light');
  applyTheme(initial, false, false);

  if (!saved && mediaQuery) {
    const applySystemTheme = (e) => applyTheme(e.matches ? 'dark' : 'light', false);
    if (typeof mediaQuery.addEventListener === 'function') {
      mediaQuery.addEventListener('change', applySystemTheme);
    } else if (typeof mediaQuery.addListener === 'function') {
      mediaQuery.addListener(applySystemTheme);
    }
  }

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
  document.documentElement.style.colorScheme = themeMode;
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
    renderImpactMap();
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
  btn.title = isDark ? 'Switch to light theme' : 'Switch to dark theme';
  btn.setAttribute('aria-label', isDark ? 'Switch to light theme' : 'Switch to dark theme');
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
  if (normalized.location && typeof normalized.location === 'object') {
    const lat = Number(normalized.location.lat);
    const lng = Number(normalized.location.lng);
    if (Number.isFinite(lat) && Number.isFinite(lng) && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180) {
      normalized.location = { lat, lng };
    } else {
      normalized.location = null;
    }
  } else {
    normalized.location = null;
  }
  return normalized;
}

function saveToStorage() {
  try {
    localStorage.setItem('sct_entries', JSON.stringify(entries));
    updateStorageBadge(true);
  } catch { /* storage full or unavailable */ }
}


function loadOffsetFromStorage() {
  try {
    const raw = localStorage.getItem('sct_offsets');
    if (!raw) return;
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object') {
      if (parsed.selected && OFFSET_OPTIONS[parsed.selected]) {
        offsetSelected = parsed.selected;
      }
      const c = parsed.contributions || {};
      const tree = Number(c.tree);
      const renewable = Number(c.renewable);
      offsetContributions.tree = Number.isFinite(tree) && tree >= 0 ? tree : 0;
      offsetContributions.renewable = Number.isFinite(renewable) && renewable >= 0 ? renewable : 0;
    }
  } catch {}
}

function saveOffsetToStorage() {
  try {
    localStorage.setItem('sct_offsets', JSON.stringify({
      selected: offsetSelected,
      contributions: offsetContributions,
    }));
  } catch {}
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

function getSmartTravelTypeKey() {
  const pick = document.getElementById('smartTravelType')?.value || 'car';
  if (pick === 'bus') return 'bus';
  if (pick === 'bike') return 'bicycle';
  if (pick === 'train') return 'train';
  return 'car_petrol';
}

function haversineKm(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
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

function getMonthlyTotalForDate(dateObj) {
  const m = dateObj.getMonth();
  const y = dateObj.getFullYear();
  return entries.filter(e => {
    const d = new Date(e.date + 'T00:00:00');
    return d.getMonth() === m && d.getFullYear() === y;
  }).reduce((s, e) => s + e.co2, 0);
}

function buildCoachContext() {
  const now = new Date();
  const monthlyTotal = getMonthlyTotalForDate(now);
  const prev = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const prevMonthTotal = getMonthlyTotalForDate(prev);

  const recent = entries.filter(e => {
    const d = new Date(e.date + 'T00:00:00');
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 30);
    return d >= cutoff;
  });

  const catTotals = {};
  recent.forEach(e => { catTotals[e.category] = (catTotals[e.category] || 0) + e.co2; });
  const sortedCats = Object.keys(catTotals).sort((a, b) => catTotals[b] - catTotals[a]);
  const topCat = sortedCats[0] || null;
  const topCatLabel = topCat ? (CATEGORY_META[topCat]?.label || topCat) : null;
  const topCatKg = topCat ? catTotals[topCat] : 0;
  const personalTips = getPersonalizedTips();

  return {
    monthlyTotal,
    prevMonthTotal,
    topCat,
    topCatLabel,
    topCatKg,
    personalTips,
    hasData: entries.length > 0,
  };
}

function initCoach() {
  const input = document.getElementById('coachInput');
  const sendBtn = document.getElementById('coachSend');
  const chat = document.getElementById('coachChat');
  const pill = document.getElementById('coachPill');
  if (!input || !sendBtn || !chat || !pill) return;

  const ctx = buildCoachContext();
  const opener = ctx.hasData
    ? 'Hi, I am your sustainability coach. I can see your recent activity. Ask me how to reduce your emissions, and I will tailor tips to your data.'
    : 'Hi, I am your sustainability coach. Start logging activities and I will generate personalized low-carbon advice.';

  coachMessages = [{ role: 'assistant', text: opener }];
  renderCoachMessages();

  const send = () => {
    const text = input.value.trim();
    if (!text) return;
    input.value = '';
    handleCoachQuestion(text);
  };

  sendBtn.addEventListener('click', send);
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') send();
  });

  document.querySelectorAll('.coach-quick-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const q = btn.dataset.q || '';
      if (q) handleCoachQuestion(q);
    });
  });
}

function renderCoachMessages() {
  const chat = document.getElementById('coachChat');
  if (!chat) return;
  chat.innerHTML = coachMessages.map(m => {
    return '<div class="coach-msg ' + (m.role === 'user' ? 'user' : 'assistant') + '">' + sanitizeText(m.text) + '</div>';
  }).join('');
  chat.scrollTop = chat.scrollHeight;
}

function getCoachResponse(question) {
  const q = question.toLowerCase();
  const ctx = buildCoachContext();

  if (!ctx.hasData) {
    return 'Log at least a few activities first. Then I can identify your biggest emission source and give a personalized reduction plan.';
  }

  const changePct = ctx.prevMonthTotal > 0
    ? ((ctx.monthlyTotal - ctx.prevMonthTotal) / ctx.prevMonthTotal) * 100
    : 0;

  const starter = 'This month: ' + ctx.monthlyTotal.toFixed(1) + ' kg CO₂e' +
    (ctx.prevMonthTotal > 0 ? ' (' + (changePct >= 0 ? '+' : '') + changePct.toFixed(1) + '% vs last month).' : '.');

  const topLine = ctx.topCat
    ? ' Your top source is ' + ctx.topCatLabel + ' at ' + ctx.topCatKg.toFixed(1) + ' kg in the last 30 days.'
    : '';

  const quickTip = ctx.personalTips.length
    ? ' Try this first: ' + ctx.personalTips[0].title + ' (' + ctx.personalTips[0].saving + ').'
    : '';

  if (/transport|car|bus|bike|train|travel/.test(q)) {
    const tips = ECO_TIPS.filter(t => t.cat === 'transport').slice(0, 2).map(t => t.title).join('; ');
    return starter + ' For transport, focus on: ' + tips + '. ' + quickTip;
  }

  if (/electric|energy|power|home/.test(q)) {
    const tips = ECO_TIPS.filter(t => t.cat === 'electricity' || t.cat === 'home_energy').slice(0, 2).map(t => t.title).join('; ');
    return starter + ' For home energy, priority actions are: ' + tips + '. ' + quickTip;
  }

  if (/food|diet|eat|meal/.test(q)) {
    const tips = ECO_TIPS.filter(t => t.cat === 'food').slice(0, 2).map(t => t.title).join('; ');
    return starter + ' For food emissions, start with: ' + tips + '. ' + quickTip;
  }

  if (/shopping|buy|purchase/.test(q)) {
    const tips = ECO_TIPS.filter(t => t.cat === 'shopping').slice(0, 2).map(t => t.title).join('; ');
    return starter + ' For shopping emissions, focus on: ' + tips + '. ' + quickTip;
  }

  if (/goal|target/.test(q)) {
    if (!monthlyGoal) {
      return starter + ' You do not have a monthly goal set. Add one in the Goal card, then I can coach you against it.';
    }
    const remain = monthlyGoal - ctx.monthlyTotal;
    if (remain > 0) {
      return starter + ' You are ' + remain.toFixed(1) + ' kg below your goal right now. Keep reducing ' + (ctx.topCatLabel || 'your top category') + ' to stay on track.';
    }
    return starter + ' You are ' + Math.abs(remain).toFixed(1) + ' kg above your goal. Cut 10–15% from ' + (ctx.topCatLabel || 'your top category') + ' this week.';
  }

  return starter + topLine + quickTip + ' Ask about transport, food, shopping, home energy, or goals for focused advice.';
}

function handleCoachQuestion(text) {
  const pill = document.getElementById('coachPill');
  coachMessages.push({ role: 'user', text });
  renderCoachMessages();

  if (pill) pill.textContent = 'Thinking...';
  setTimeout(() => {
    const response = getCoachResponse(text);
    coachMessages.push({ role: 'assistant', text: response });
    renderCoachMessages();
    if (pill) pill.textContent = 'Ready';
  }, 220);
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
      if (target === 'map') {
        setTimeout(() => {
          if (impactMapInstance) impactMapInstance.invalidateSize();
          renderImpactMap(true);
        }, 40);
      }
    });
  });

  document.getElementById('resetAll').addEventListener('click', () => {
    if (confirm('Reset ALL logged data? This cannot be undone.')) {
      entries = [];
      offsetContributions = { tree: 0, renewable: 0 };
      saveOffsetToStorage();
      saveToStorage();
      renderDashboard();
      renderHistory();
      renderImpactMap();
      showToast('All data cleared.', 'error');
    }
  });

  document.getElementById('btnLogActivity').addEventListener('click', () => {
    document.querySelector('.sidebar-btn[data-section="calculator"]').click();
  });
}

function initOffset() {
  const treeBtn = document.getElementById('offsetOptionTree');
  const renewBtn = document.getElementById('offsetOptionRenewable');
  const addBtn = document.getElementById('offsetAddBtn');
  const amountInput = document.getElementById('offsetContributionAmount');
  if (!treeBtn || !renewBtn || !addBtn || !amountInput) return;

  const selectOption = (key) => {
    if (!OFFSET_OPTIONS[key]) return;
    offsetSelected = key;
    saveOffsetToStorage();
    renderDashboard();
  };

  treeBtn.addEventListener('click', () => selectOption('tree'));
  renewBtn.addEventListener('click', () => selectOption('renewable'));

  const addContribution = () => {
    const val = Number(amountInput.value);
    if (!Number.isFinite(val) || val <= 0) {
      showToast('Enter a valid contribution amount.', 'error');
      return;
    }
    offsetContributions[offsetSelected] += val;
    amountInput.value = '';
    saveOffsetToStorage();
    renderDashboard();
    showToast('Added $' + val.toFixed(2) + ' to ' + OFFSET_OPTIONS[offsetSelected].label + '.');
  };

  addBtn.addEventListener('click', addContribution);
  amountInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') addContribution();
  });
}

function renderOffsetCard(totalFootprintKg) {
  const treeBtn = document.getElementById('offsetOptionTree');
  const renewBtn = document.getElementById('offsetOptionRenewable');
  const totalKgEl = document.getElementById('offsetTotalKg');
  const requiredEl = document.getElementById('offsetRequiredCost');
  const coveredEl = document.getElementById('offsetCoverageKg');
  const fillEl = document.getElementById('offsetProgressFill');
  const pctEl = document.getElementById('offsetCoveragePct');
  const msgEl = document.getElementById('offsetMessage');
  const pillEl = document.getElementById('offsetProgressText');
  const treeCostEl = document.getElementById('offsetTreeCost');
  const renewCostEl = document.getElementById('offsetRenewCost');
  const treeContribEl = document.getElementById('offsetTreeContrib');
  const renewContribEl = document.getElementById('offsetRenewContrib');
  const treeBarEl = document.getElementById('offsetTreeBar');
  const renewBarEl = document.getElementById('offsetRenewBar');
  if (!treeBtn || !renewBtn || !totalKgEl || !requiredEl || !coveredEl || !fillEl || !pctEl || !msgEl || !pillEl || !treeCostEl || !renewCostEl || !treeContribEl || !renewContribEl || !treeBarEl || !renewBarEl) return;

  const treeRequired = totalFootprintKg * OFFSET_OPTIONS.tree.ratePerKg;
  const renewRequired = totalFootprintKg * OFFSET_OPTIONS.renewable.ratePerKg;
  const selectedRate = OFFSET_OPTIONS[offsetSelected].ratePerKg;
  const selectedContrib = offsetContributions[offsetSelected] || 0;
  const coveredKg = selectedRate > 0 ? (selectedContrib / selectedRate) : 0;
  const pct = totalFootprintKg > 0 ? Math.min(100, (coveredKg / totalFootprintKg) * 100) : 0;

  totalKgEl.textContent = totalFootprintKg.toFixed(2) + ' kg';
  requiredEl.textContent = '$' + (totalFootprintKg * selectedRate).toFixed(2);
  coveredEl.textContent = coveredKg.toFixed(2) + ' kg';

  treeCostEl.textContent = '$' + treeRequired.toFixed(2);
  renewCostEl.textContent = '$' + renewRequired.toFixed(2);
  treeContribEl.textContent = '$' + (offsetContributions.tree || 0).toFixed(2);
  renewContribEl.textContent = '$' + (offsetContributions.renewable || 0).toFixed(2);

  const treeCoveredKg = OFFSET_OPTIONS.tree.ratePerKg > 0 ? (offsetContributions.tree / OFFSET_OPTIONS.tree.ratePerKg) : 0;
  const renewCoveredKg = OFFSET_OPTIONS.renewable.ratePerKg > 0 ? (offsetContributions.renewable / OFFSET_OPTIONS.renewable.ratePerKg) : 0;
  treeBarEl.style.width = (totalFootprintKg > 0 ? Math.min(100, (treeCoveredKg / totalFootprintKg) * 100) : 0).toFixed(1) + '%';
  renewBarEl.style.width = (totalFootprintKg > 0 ? Math.min(100, (renewCoveredKg / totalFootprintKg) * 100) : 0).toFixed(1) + '%';

  treeBtn.classList.toggle('active', offsetSelected === 'tree');
  renewBtn.classList.toggle('active', offsetSelected === 'renewable');

  fillEl.style.width = pct.toFixed(1) + '%';
  pctEl.textContent = Math.round(pct) + '%';
  pillEl.textContent = Math.round(pct) + '% offset';

  if (pct >= 100) fillEl.style.background = 'linear-gradient(90deg,#10b981,#059669)';
  else if (pct >= 60) fillEl.style.background = 'linear-gradient(90deg,#14b8a6,#0d9488)';
  else fillEl.style.background = 'linear-gradient(90deg,#3b82f6,#6366f1)';

  if (totalFootprintKg <= 0) {
    msgEl.textContent = 'No emissions logged yet. Add activities to calculate your offset requirement.';
  } else if (pct >= 100) {
    msgEl.textContent = 'Excellent. You have fully offset your tracked footprint using ' + OFFSET_OPTIONS[offsetSelected].label + '.';
  } else {
    const remainingKg = Math.max(0, totalFootprintKg - coveredKg);
    const remainingCost = remainingKg * selectedRate;
    msgEl.textContent = 'You have offset ' + coveredKg.toFixed(1) + ' kg so far. Add about $' + remainingCost.toFixed(2) + ' more to fully offset your footprint with ' + OFFSET_OPTIONS[offsetSelected].label + '.';
  }
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

function initSmartTravel() {
  const typeSel = document.getElementById('smartTravelType');
  const startBtn = document.getElementById('startTravelTrack');
  const stopBtn = document.getElementById('stopTravelTrack');
  if (!typeSel || !startBtn || !stopBtn) return;

  const syncTransportType = () => {
    const transportType = document.getElementById('transportType');
    if (transportType) transportType.value = getSmartTravelTypeKey();
    updatePreview();
  };

  typeSel.addEventListener('change', () => {
    syncTransportType();
    updateLiveTravelCard();
  });

  startBtn.addEventListener('click', startTravelTracking);
  stopBtn.addEventListener('click', stopTravelTracking);
  syncTransportType();
  updateLiveTravelCard();
}


function initClimateSimulator() {
  const co2El = document.getElementById('simCO2');
  const methaneEl = document.getElementById('simMethane');
  const deforestEl = document.getElementById('simDeforestation');
  if (!co2El || !methaneEl || !deforestEl) return;

  const rerender = () => {
    const co2 = Number(co2El.value);
    const methane = Number(methaneEl.value);
    const deforestation = Number(deforestEl.value);
    renderClimateSimulator({ co2, methane, deforestation });
  };

  [co2El, methaneEl, deforestEl].forEach(sl => {
    sl.addEventListener('input', rerender);
    sl.addEventListener('change', rerender);
  });

  rerender();
}

function renderClimateSimulator({ co2, methane, deforestation }) {
  const co2Val = document.getElementById('simCO2Val');
  const methaneVal = document.getElementById('simMethaneVal');
  const deforestVal = document.getElementById('simDeforestationVal');
  const tempRiseEl = document.getElementById('simTempRise');
  const seaRiseEl = document.getElementById('simSeaRise');
  const tempFill = document.getElementById('simTempFill');
  const seaFill = document.getElementById('simSeaFill');
  const eduText = document.getElementById('climateEduText');
  const pill = document.getElementById('climateSimPill');

  if (!co2Val || !methaneVal || !deforestVal || !tempRiseEl || !seaRiseEl || !tempFill || !seaFill || !eduText || !pill) return;

  co2Val.textContent = co2 + '%';
  methaneVal.textContent = methane + '%';
  deforestVal.textContent = deforestation + '%';

  const weighted = co2 * 0.6 + methane * 0.25 + deforestation * 0.15;
  const pressure = (weighted - 100) / 100;

  const tempRise = clampNum(1.5 + pressure * 1.9, 0.9, 4.8);
  const seaRiseCm = clampNum(35 + pressure * 48 + ((methane - 100) / 100) * 8, 10, 120);

  tempRiseEl.textContent = tempRise.toFixed(2) + ' C';
  seaRiseEl.textContent = seaRiseCm.toFixed(1) + ' cm';

  const tempPct = clampNum((tempRise / 4.8) * 100, 0, 100);
  const seaPct = clampNum((seaRiseCm / 120) * 100, 0, 100);
  tempFill.style.width = tempPct.toFixed(1) + '%';
  seaFill.style.width = seaPct.toFixed(1) + '%';

  if (tempRise < 1.8) {
    pill.textContent = 'Near Paris pathway';
    pill.className = 'climate-sim-pill cool';
    eduText.textContent = 'This pathway is close to a lower-risk future: reduced heat waves, slower sea-level rise, and less ecosystem disruption.';
  } else if (tempRise < 2.8) {
    pill.textContent = 'Moderate risk';
    pill.className = 'climate-sim-pill warm';
    eduText.textContent = 'This range increases heat stress and flooding risks. Faster clean-energy transitions can still bend this curve downward.';
  } else {
    pill.textContent = 'High risk';
    pill.className = 'climate-sim-pill hot';
    eduText.textContent = 'High-emission pathways raise the risk of severe heat, crop stress, and major coastal impacts. Deep reductions in CO2 and methane are critical.';
  }

  renderClimateSimulatorChart(tempRise, seaRiseCm);
}

function renderClimateSimulatorChart(tempRise2100, seaRise2100) {
  const canvas = document.getElementById('climateSimChart');
  if (!window.Chart || !canvas) return;

  const labels = ['2030', '2040', '2050', '2060', '2070', '2080', '2090', '2100'];
  const tempStart = 1.2;
  const seaStart = 12;
  const tStep = (tempRise2100 - tempStart) / (labels.length - 1);
  const sStep = (seaRise2100 - seaStart) / (labels.length - 1);

  const tempSeries = labels.map((_, i) => Number((tempStart + tStep * i).toFixed(2)));
  const seaSeries = labels.map((_, i) => Number((seaStart + sStep * i).toFixed(1)));

  if (climateSimChartInstance) {
    climateSimChartInstance.destroy();
    climateSimChartInstance = null;
  }

  climateSimChartInstance = new Chart(canvas, {
    type: 'line',
    data: {
      labels,
      datasets: [
        {
          label: 'Temperature Rise (C)',
          data: tempSeries,
          borderColor: '#ef4444',
          backgroundColor: 'rgba(239,68,68,.14)',
          fill: true,
          tension: 0.35,
          yAxisID: 'yTemp',
          pointRadius: 2,
        },
        {
          label: 'Sea Level Increase (cm)',
          data: seaSeries,
          borderColor: '#0ea5e9',
          backgroundColor: 'rgba(14,165,233,.14)',
          fill: true,
          tension: 0.35,
          yAxisID: 'ySea',
          pointRadius: 2,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: {
        duration: 520,
        easing: 'easeOutQuart',
      },
      plugins: {
        legend: { position: 'top' },
      },
      scales: {
        yTemp: {
          type: 'linear',
          position: 'left',
          beginAtZero: true,
          title: { display: true, text: 'C' },
        },
        ySea: {
          type: 'linear',
          position: 'right',
          beginAtZero: true,
          grid: { drawOnChartArea: false },
          title: { display: true, text: 'cm' },
        },
      },
    },
  });
}

function clampNum(v, min, max) {
  return Math.min(max, Math.max(min, v));
}

function startTravelTracking() {
  const status = document.getElementById('travelTrackStatus');
  if (!navigator.geolocation) {
    if (status) status.textContent = 'Geolocation is not supported in this browser.';
    showToast('Geolocation not supported.', 'error');
    return;
  }
  if (travelTracking) {
    if (status) status.textContent = 'Tracking already active.';
    return;
  }

  travelTracking = true;
  travelDistanceKm = 0;
  travelLastCoords = null;

  const transportType = document.getElementById('transportType');
  if (transportType) transportType.value = getSmartTravelTypeKey();
  const distInput = document.getElementById('transportDist');
  if (distInput) distInput.value = '0';

  if (status) status.textContent = 'Starting GPS tracking...';
  updateLiveTravelCard();

  travelWatchId = navigator.geolocation.watchPosition(
    (pos) => {
      const { latitude, longitude, accuracy } = pos.coords;
      if (accuracy && accuracy > 120) {
        if (status) status.textContent = 'Waiting for better GPS signal...';
        return;
      }

      if (travelLastCoords) {
        const seg = haversineKm(travelLastCoords.lat, travelLastCoords.lon, latitude, longitude);
        if (seg > 0 && seg < 5) travelDistanceKm += seg;
      }

      travelLastCoords = { lat: latitude, lon: longitude };
      const distInputNow = document.getElementById('transportDist');
      if (distInputNow) distInputNow.value = travelDistanceKm.toFixed(3);

      if (status) status.textContent = 'Tracking active. Distance: ' + travelDistanceKm.toFixed(2) + ' km';
      updatePreview();
      updateLiveTravelCard();
    },
    (err) => {
      const msg = err && err.message ? err.message : 'Unable to read GPS location.';
      if (status) status.textContent = 'Tracking error: ' + msg;
      showToast('Travel tracking error.', 'error');
      stopTravelTracking(false);
    },
    {
      enableHighAccuracy: true,
      maximumAge: 0,
      timeout: 15000,
    }
  );
}

function stopTravelTracking(notify = true) {
  if (travelWatchId !== null && navigator.geolocation) {
    navigator.geolocation.clearWatch(travelWatchId);
  }
  travelWatchId = null;
  travelTracking = false;
  const status = document.getElementById('travelTrackStatus');
  if (status) status.textContent = 'Tracking stopped. Distance captured: ' + travelDistanceKm.toFixed(2) + ' km';
  updateLiveTravelCard();
  if (notify) showToast('Travel tracking stopped.');
}

function updateLiveTravelCard() {
  const distEl = document.getElementById('liveTravelDistance');
  const co2El = document.getElementById('liveTravelCO2');
  const msgEl = document.getElementById('liveTravelStatus');
  const pillEl = document.getElementById('liveTravelPill');
  if (!distEl || !co2El || !msgEl || !pillEl) return;

  const typeKey = getSmartTravelTypeKey();
  const co2 = getCO2('transport', typeKey, travelDistanceKm);
  distEl.textContent = travelDistanceKm.toFixed(2) + ' km';
  co2El.textContent = co2.toFixed(3) + ' kg';

  if (!travelTracking && travelDistanceKm <= 0) {
    pillEl.textContent = 'Idle';
    pillEl.className = 'travel-pill idle';
    msgEl.textContent = 'Start tracking from the Transport calculator to detect travel automatically.';
  } else if (travelTracking) {
    pillEl.textContent = 'Tracking';
    pillEl.className = 'travel-pill active';
    msgEl.textContent = 'Live trip detected using geolocation. Emissions update automatically from distance.';
  } else {
    pillEl.textContent = 'Captured';
    pillEl.className = 'travel-pill done';
    msgEl.textContent = 'Trip captured. Review value in Transport and click Add to Log when ready.';
  }
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
  renderImpactMap();
  showToast(`Added ${co2.toFixed(2)} kg CO₂e ✓`);

  // Non-blocking geotag for map markers
  attachLocationToEntry(entry).then((ok) => {
    if (ok) {
      saveToStorage();
      renderImpactMap();
    }
  });

  // Reset amount field only
  const amountEl = document.getElementById(vals.category + 'Amount') || document.getElementById(vals.category + 'Dist');
  if (amountEl) amountEl.value = '';
  updatePreview();
}

function getCurrentPositionSafe() {
  return new Promise((resolve) => {
    if (!navigator.geolocation) return resolve(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve(pos),
      () => resolve(null),
      { enableHighAccuracy: true, timeout: 9000, maximumAge: 300000 }
    );
  });
}

async function attachLocationToEntry(entry) {
  if (!entry || entry.location) return false;
  const pos = await getCurrentPositionSafe();
  if (!pos || !pos.coords) return false;
  const lat = Number(pos.coords.latitude);
  const lng = Number(pos.coords.longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return false;
  entry.location = { lat, lng };
  return true;
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
      renderImpactMap();
      showToast(`Quick-added: ${sanitizeText(p.label)} (${co2.toFixed(2)} kg CO₂e)`);

      attachLocationToEntry(entry).then((ok) => {
        if (ok) {
          saveToStorage();
          renderImpactMap();
        }
      });
    });
    list.appendChild(div);
  });
}

/* ─── Dashboard ──────────────────────────────── */


function movingAverageForecast(values, horizon) {
  const history = values.slice();
  const preds = [];
  for (let i = 0; i < horizon; i++) {
    const window = history.slice(-7);
    const avg = window.length ? window.reduce((s, v) => s + v, 0) / window.length : 0;
    const pred = Math.max(0, avg);
    preds.push(pred);
    history.push(pred);
  }
  return preds;
}

async function trainAndPredictTf(values, horizon = 30) {
  const WINDOW = 7;
  const xs = [];
  const ys = [];

  for (let i = WINDOW; i < values.length; i++) {
    const win = values.slice(i - WINDOW, i);
    const avg = win.reduce((s, v) => s + v, 0) / WINDOW;
    const trend = win[WINDOW - 1] - win[0];
    xs.push([avg, trend]);
    ys.push(values[i]);
  }

  if (xs.length < 10 || !window.tf) {
    return movingAverageForecast(values, horizon);
  }

  const xMean = [
    xs.reduce((s, x) => s + x[0], 0) / xs.length,
    xs.reduce((s, x) => s + x[1], 0) / xs.length,
  ];
  const xStd = [
    Math.sqrt(xs.reduce((s, x) => s + Math.pow(x[0] - xMean[0], 2), 0) / xs.length) || 1,
    Math.sqrt(xs.reduce((s, x) => s + Math.pow(x[1] - xMean[1], 2), 0) / xs.length) || 1,
  ];
  const yMean = ys.reduce((s, y) => s + y, 0) / ys.length;
  const yStd = Math.sqrt(ys.reduce((s, y) => s + Math.pow(y - yMean, 2), 0) / ys.length) || 1;

  const normX = xs.map(x => [(x[0] - xMean[0]) / xStd[0], (x[1] - xMean[1]) / xStd[1]]);
  const normY = ys.map(y => [(y - yMean) / yStd]);

  const model = tf.sequential();
  model.add(tf.layers.dense({ units: 12, activation: 'relu', inputShape: [2] }));
  model.add(tf.layers.dense({ units: 8, activation: 'relu' }));
  model.add(tf.layers.dense({ units: 1 }));
  model.compile({ optimizer: tf.train.adam(0.03), loss: 'meanSquaredError' });

  const xsTensor = tf.tensor2d(normX, [normX.length, 2]);
  const ysTensor = tf.tensor2d(normY, [normY.length, 1]);
  await model.fit(xsTensor, ysTensor, { epochs: 140, batchSize: 8, verbose: 0 });
  xsTensor.dispose();
  ysTensor.dispose();

  const history = values.slice();
  const preds = [];
  for (let i = 0; i < horizon; i++) {
    const win = history.slice(-WINDOW);
    const avg = win.reduce((s, v) => s + v, 0) / WINDOW;
    const trend = win[WINDOW - 1] - win[0];
    const x = tf.tensor2d([[(avg - xMean[0]) / xStd[0], (trend - xMean[1]) / xStd[1]]], [1, 2]);
    const yPredNorm = model.predict(x);
    const yPred = yPredNorm.dataSync()[0];
    x.dispose();
    yPredNorm.dispose();
    const denorm = Math.max(0, yPred * yStd + yMean);
    preds.push(denorm);
    history.push(denorm);
  }

  model.dispose();
  return preds;
}


/* ─── Charts ─────────────────────────────────── */


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
      renderImpactMap();
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


function initImpactMap() {
  const mapEl = document.getElementById('impactMap');
  if (!mapEl || !window.L || impactMapInstance) return;

  impactMapInstance = L.map('impactMap', {
    zoomControl: true,
    scrollWheelZoom: true,
    zoomAnimation: true,
    fadeAnimation: true,
    markerZoomAnimation: true,
  }).setView([20, 0], 2);

  L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
    attribution: '&copy; OpenStreetMap contributors &copy; CARTO',
    subdomains: 'abcd',
    maxZoom: 19,
  }).addTo(impactMapInstance);

  impactMapLayer = L.layerGroup().addTo(impactMapInstance);
}

function renderImpactMap(focus = false) {
  const mapEl = document.getElementById('impactMap');
  const emptyEl = document.getElementById('impactMapEmpty');
  const countEl = document.getElementById('mapEntryCount');
  const totalEl = document.getElementById('mapTotalCO2');
  const topEl = document.getElementById('mapTopCategory');
  if (!mapEl || !emptyEl || !countEl || !totalEl || !topEl) return;

  if (!impactMapInstance) initImpactMap();
  if (!impactMapInstance || !impactMapLayer) return;

  impactMapLayer.clearLayers();

  const mapped = entries.filter(e => e.location && Number.isFinite(Number(e.location.lat)) && Number.isFinite(Number(e.location.lng)));
  countEl.textContent = String(mapped.length);
  const total = mapped.reduce((s, e) => s + e.co2, 0);
  totalEl.textContent = total.toFixed(2) + ' kg';

  const catTotals = {};
  mapped.forEach(e => { catTotals[e.category] = (catTotals[e.category] || 0) + e.co2; });
  const topCat = Object.keys(catTotals).sort((a, b) => catTotals[b] - catTotals[a])[0];
  topEl.textContent = topCat ? (CATEGORY_META[topCat]?.label || topCat) : '—';

  if (!mapped.length) {
    emptyEl.classList.add('visible');
    return;
  }

  emptyEl.classList.remove('visible');
  const bounds = [];
  mapped.forEach(e => {
    const lat = Number(e.location.lat);
    const lng = Number(e.location.lng);
    const meta = CATEGORY_META[e.category] || {};
    const color = meta.color || '#10b981';
    const label = formatTypeLabel(e.category, e.type);

    const marker = L.circleMarker([lat, lng], {
      radius: 8,
      color,
      weight: 2,
      fillColor: color,
      fillOpacity: 0.38,
      opacity: 0.95,
    });

    const popupHtml =
      '<div class="map-popup">' +
        '<div class="map-popup-title">' + sanitizeText(meta.icon ? meta.icon + ' ' : '') + sanitizeText(meta.label || e.category) + '</div>' +
        '<div class="map-popup-row"><strong>Activity:</strong> ' + sanitizeText(label) + '</div>' +
        '<div class="map-popup-row"><strong>Emission:</strong> ' + e.co2.toFixed(3) + ' kg CO₂e</div>' +
        '<div class="map-popup-row"><strong>Date:</strong> ' + sanitizeText(formatDate(e.date)) + '</div>' +
        (e.note ? '<div class="map-popup-row"><strong>Note:</strong> ' + sanitizeText(e.note) + '</div>' : '') +
      '</div>';

    marker.bindPopup(popupHtml, { maxWidth: 260, autoPan: true });
    marker.addTo(impactMapLayer);
    bounds.push([lat, lng]);
  });

  if (bounds.length === 1) {
    const p = bounds[0];
    if (focus) impactMapInstance.flyTo(p, 12, { animate: true, duration: 1.1 });
    else impactMapInstance.setView(p, Math.max(impactMapInstance.getZoom(), 10));
  } else if (bounds.length > 1) {
    if (focus) impactMapInstance.flyToBounds(bounds, { padding: [28, 28], duration: 1.2 });
    else impactMapInstance.fitBounds(bounds, { padding: [24, 24], animate: false });
  }
}


/* ─── Resize: redraw charts when window resizes ─ */
let resizeTimer;
window.addEventListener('resize', () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(renderDashboard, 200);
});
