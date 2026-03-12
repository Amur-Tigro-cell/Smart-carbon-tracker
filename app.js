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
  renderDashboard();
  renderHistory();
  renderImpactMap();
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

function initBillAnalyzer() {
  const input = document.getElementById('billFileInput');
  const btn = document.getElementById('analyzeBillBtn');
  if (!input || !btn) return;

  btn.addEventListener('click', async () => {
    const file = input.files && input.files[0] ? input.files[0] : null;
    if (!file) {
      showToast('Please upload a bill image or PDF first.', 'error');
      updateBillStatus('No file selected. Choose an image or PDF bill.', 'warn');
      return;
    }

    if (!isSupportedBillFile(file)) {
      showToast('Unsupported file type. Use image or PDF.', 'error');
      updateBillStatus('Unsupported file type. Upload an image or PDF.', 'warn');
      return;
    }

    btn.disabled = true;
    const previousLabel = btn.textContent;
    btn.textContent = 'Analyzing...';
    updateBillStatus('Preparing analyzer...', 'busy');

    try {
      const extraction = await extractBillText(file, (stepText) => {
        updateBillStatus(stepText, 'busy');
      });

      const parsed = parseElectricityUsageFromText(extraction.text || '');
      if (!Number.isFinite(parsed.usageKwh) || parsed.usageKwh <= 0) {
        updateBillStatus('Could not detect kWh usage. Try a clearer bill image/PDF.', 'warn');
        showToast('No electricity usage found in bill text.', 'error');
        renderBillAnalyzerResult(null, extraction.text || '', extraction.methodLabel || 'OCR');
        return;
      }

      const metrics = calculateBillEmissionMetrics(parsed.usageKwh, parsed.billingDays);
      renderBillAnalyzerResult(metrics, extraction.text || '', extraction.methodLabel || 'OCR');
      updateBillStatus('Analysis complete via ' + (extraction.methodLabel || 'OCR') + '.', 'ok');
      showToast('Electricity bill analyzed successfully.');
    } catch (err) {
      const msg = err && err.message ? err.message : 'Analyzer failed.';
      updateBillStatus('Analyzer failed: ' + msg, 'warn');
      showToast('Bill analysis failed. Try another file.', 'error');
    } finally {
      btn.disabled = false;
      btn.textContent = previousLabel;
    }
  });
}

function isSupportedBillFile(file) {
  if (!file || !file.name) return false;
  const name = file.name.toLowerCase();
  const type = (file.type || '').toLowerCase();
  return type.startsWith('image/') || type === 'application/pdf' || name.endsWith('.pdf');
}

function updateBillStatus(text, mode = 'neutral') {
  const statusEl = document.getElementById('billAnalyzeStatus');
  const pillEl = document.getElementById('billAnalyzerPill');
  if (statusEl) statusEl.textContent = text;
  if (!pillEl) return;

  if (mode === 'busy') {
    pillEl.textContent = 'Processing';
    pillEl.className = 'bill-pill busy';
  } else if (mode === 'ok') {
    pillEl.textContent = 'Analyzed';
    pillEl.className = 'bill-pill ok';
  } else if (mode === 'warn') {
    pillEl.textContent = 'Check file';
    pillEl.className = 'bill-pill warn';
  } else {
    pillEl.textContent = 'Ready';
    pillEl.className = 'bill-pill';
  }
}

async function extractBillText(file, onStep) {
  const name = (file.name || '').toLowerCase();
  const type = (file.type || '').toLowerCase();
  const isPdf = type === 'application/pdf' || name.endsWith('.pdf');

  if (isPdf) {
    const text = await extractPdfText(file, onStep);
    return { text, methodLabel: 'PDF + OCR' };
  }

  const text = await runOcrOnImage(file, onStep);
  return { text, methodLabel: 'OCR' };
}

async function runOcrOnImage(imageSource, onStep) {
  if (!window.Tesseract || typeof window.Tesseract.recognize !== 'function') {
    throw new Error('OCR library not loaded');
  }

  const result = await window.Tesseract.recognize(imageSource, 'eng', {
    logger: (m) => {
      if (!onStep || !m || !m.status) return;
      if (m.status === 'recognizing text') {
        const pct = Number.isFinite(m.progress) ? Math.round(m.progress * 100) : 0;
        onStep('Running OCR... ' + pct + '%');
      } else if (m.status === 'loading tesseract core') {
        onStep('Loading OCR engine...');
      }
    },
  });

  return result && result.data && typeof result.data.text === 'string'
    ? result.data.text
    : '';
}

async function extractPdfText(file, onStep) {
  if (!window.pdfjsLib || typeof window.pdfjsLib.getDocument !== 'function') {
    throw new Error('PDF parser not loaded');
  }

  if (window.pdfjsLib.GlobalWorkerOptions) {
    window.pdfjsLib.GlobalWorkerOptions.workerSrc =
      'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
  }

  const buffer = await file.arrayBuffer();
  const pdf = await window.pdfjsLib.getDocument({ data: buffer }).promise;
  const maxPages = Math.min(pdf.numPages || 1, 3);

  let mergedText = '';
  for (let pageNum = 1; pageNum <= maxPages; pageNum++) {
    if (onStep) onStep('Reading PDF text (page ' + pageNum + ' of ' + maxPages + ')...');
    const page = await pdf.getPage(pageNum);
    const content = await page.getTextContent();
    const pageText = (content.items || []).map(item => item.str || '').join(' ');
    mergedText += '\n' + pageText;
  }

  if (mergedText.replace(/\s+/g, ' ').trim().length >= 40) {
    return mergedText;
  }

  if (onStep) onStep('PDF appears scanned. Running OCR on first page...');
  const firstPage = await pdf.getPage(1);
  const viewport = firstPage.getViewport({ scale: 2 });
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  canvas.width = Math.ceil(viewport.width);
  canvas.height = Math.ceil(viewport.height);
  await firstPage.render({ canvasContext: ctx, viewport }).promise;

  const ocrText = await runOcrOnImage(canvas, onStep);
  return mergedText + '\n' + ocrText;
}

function parseElectricityUsageFromText(rawText) {
  const text = String(rawText || '').replace(/\s+/g, ' ').trim();
  const regex = /(\d{1,3}(?:[\s,]\d{3})*(?:\.\d+)?)\s*(kwh|kw\.?h|kilowatt(?:-|\s)?hours?|units?)\b/gi;
  const candidates = [];

  let m;
  while ((m = regex.exec(text)) !== null) {
    const value = Number(String(m[1]).replace(/[\s,]/g, ''));
    if (!Number.isFinite(value) || value <= 0) continue;
    const start = Math.max(0, m.index - 34);
    const end = Math.min(text.length, regex.lastIndex + 34);
    const context = text.slice(start, end).toLowerCase();
    let score = 0;
    if (/(usage|consumption|consumed|energy|total|current|this month)/.test(context)) score += 2;
    if (/(rate|price|cost|tariff|per\s*kwh)/.test(context)) score -= 2;
    candidates.push({ value, score });
  }

  let usageKwh = 0;
  if (candidates.length) {
    candidates.sort((a, b) => (b.score - a.score) || (b.value - a.value));
    const pick = candidates.find(c => c.value < 200000) || candidates[0];
    usageKwh = pick.value;
  }

  const daysMatch = text.match(/(\d{1,3})\s*days?\b/i);
  let billingDays = daysMatch ? Number(daysMatch[1]) : null;
  if (!Number.isFinite(billingDays) || billingDays <= 0 || billingDays > 120) {
    billingDays = null;
  }

  return { usageKwh, billingDays };
}

function calculateBillEmissionMetrics(usageKwh, billingDays) {
  const gridFactor = EMISSION_FACTORS?.electricity?.electricity_grid ?? 0.233;
  const days = Number.isFinite(billingDays) && billingDays > 0 ? billingDays : 30;
  const emissionsKg = usageKwh * gridFactor;
  const dailyKwh = usageKwh / days;
  const dailyEmissionsKg = emissionsKg / days;
  const projectedMonthKwh = dailyKwh * 30;
  const projectedMonthEmissionsKg = dailyEmissionsKg * 30;

  return {
    usageKwh,
    days,
    emissionsKg,
    dailyKwh,
    dailyEmissionsKg,
    projectedMonthKwh,
    projectedMonthEmissionsKg,
  };
}

function getBillTips(metrics) {
  const tips = [];
  if (!metrics) return tips;

  if (metrics.dailyKwh > 18) {
    tips.push('Your daily electricity use is high. Focus on cooling/heating settings and idle appliance usage first.');
  }
  if (metrics.usageKwh > 500) {
    tips.push('This bill shows high total usage. Run a home energy audit and replace old appliances with high-efficiency models.');
  }
  if (metrics.emissionsKg > 120) {
    tips.push('Estimated bill emissions are substantial. Consider switching to a renewable electricity plan where available.');
  }

  const ecoSuggestions = (window.ECO_TIPS || ECO_TIPS || [])
    .filter(t => t.cat === 'electricity' || t.cat === 'home_energy')
    .slice(0, 3)
    .map(t => (t.emoji ? t.emoji + ' ' : '') + t.title + ' - ' + t.saving);

  return [...tips, ...ecoSuggestions].slice(0, 5);
}

function renderBillAnalyzerResult(metrics, extractedText, methodLabel) {
  const resultsEl = document.getElementById('billResults');
  const usageEl = document.getElementById('billUsageKwh');
  const emissionsEl = document.getElementById('billEmissionsKg');
  const dailyEl = document.getElementById('billDailyKwh');
  const projectedEl = document.getElementById('billProjectedKg');
  const tipsEl = document.getElementById('billTipsList');
  const textEl = document.getElementById('billExtractedText');
  if (!resultsEl || !usageEl || !emissionsEl || !dailyEl || !projectedEl || !tipsEl || !textEl) return;

  resultsEl.style.display = 'block';
  const preview = String(extractedText || '').trim();
  textEl.textContent = preview ? preview.slice(0, 1600) : 'No text extracted from file.';

  if (!metrics) {
    usageEl.textContent = '--';
    emissionsEl.textContent = '--';
    dailyEl.textContent = '--';
    projectedEl.textContent = '--';
    tipsEl.innerHTML = '<li>Upload a clearer bill image or PDF with visible kWh usage values.</li>';
    renderBillAnalyzerChart(null);
    return;
  }

  usageEl.textContent = metrics.usageKwh.toFixed(1) + ' kWh';
  emissionsEl.textContent = metrics.emissionsKg.toFixed(1) + ' kg CO2e';
  dailyEl.textContent = metrics.dailyKwh.toFixed(2) + ' kWh/day';
  projectedEl.textContent = metrics.projectedMonthEmissionsKg.toFixed(1) + ' kg CO2e';

  const tips = getBillTips(metrics);
  tipsEl.innerHTML = tips.length
    ? tips.map(t => '<li>' + sanitizeText(t) + '</li>').join('')
    : '<li>No extra tips yet. Keep tracking monthly bills for better guidance.</li>';

  renderBillAnalyzerChart(metrics, methodLabel);
}

function renderBillAnalyzerChart(metrics, methodLabel = 'OCR') {
  const canvas = document.getElementById('billAnalyzerChart');
  if (!window.Chart || !canvas) return;

  if (billAnalyzerChartInstance) {
    billAnalyzerChartInstance.destroy();
    billAnalyzerChartInstance = null;
  }

  if (!metrics) return;

  billAnalyzerChartInstance = new Chart(canvas, {
    type: 'bar',
    data: {
      labels: ['Current Bill', '30-Day Projection'],
      datasets: [
        {
          label: 'Electricity Usage (kWh)',
          data: [metrics.usageKwh, metrics.projectedMonthKwh],
          backgroundColor: 'rgba(245,158,11,.7)',
          borderColor: '#f59e0b',
          borderWidth: 1.5,
          borderRadius: 8,
          yAxisID: 'yUsage',
        },
        {
          label: 'Estimated Emissions (kg CO2e)',
          data: [metrics.emissionsKg, metrics.projectedMonthEmissionsKg],
          backgroundColor: 'rgba(16,185,129,.65)',
          borderColor: '#10b981',
          borderWidth: 1.5,
          borderRadius: 8,
          yAxisID: 'yEmissions',
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { position: 'top' },
        title: {
          display: true,
          text: 'Bill Analysis (' + methodLabel + ')',
        },
      },
      scales: {
        yUsage: {
          type: 'linear',
          position: 'left',
          beginAtZero: true,
          title: { display: true, text: 'kWh' },
        },
        yEmissions: {
          type: 'linear',
          position: 'right',
          beginAtZero: true,
          grid: { drawOnChartArea: false },
          title: { display: true, text: 'kg CO2e' },
        },
      },
    },
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

function initFoodScanner() {
  const scanBtn = document.getElementById('foodScanBtn');
  const textInput = document.getElementById('foodScanInput');
  const fileInput = document.getElementById('foodScanFile');
  if (!scanBtn || !textInput || !fileInput) return;

  const runScan = async () => {
    const textValue = textInput.value.trim();
    const file = fileInput.files && fileInput.files[0] ? fileInput.files[0] : null;

    if (!textValue && !file) {
      showToast('Add food text or upload an image to scan.', 'error');
      updateFoodScanStatus('No input provided. Enter food text or upload an image.', 'warn');
      return;
    }

    scanBtn.disabled = true;
    const oldLabel = scanBtn.textContent;
    scanBtn.textContent = 'Scanning...';
    updateFoodScanStatus('Analyzing food items...', 'busy');

    try {
      let combinedText = textValue;
      if (file) {
        if (!window.Tesseract || typeof window.Tesseract.recognize !== 'function') {
          throw new Error('OCR engine unavailable');
        }
        const ocr = await window.Tesseract.recognize(file, 'eng', {
          logger: (m) => {
            if (m && m.status === 'recognizing text') {
              const pct = Number.isFinite(m.progress) ? Math.round(m.progress * 100) : 0;
              updateFoodScanStatus('Scanning image text... ' + pct + '%', 'busy');
            }
          },
        });
        const extracted = ocr && ocr.data ? String(ocr.data.text || '') : '';
        combinedText = (textValue + '\n' + extracted).trim();
      }

      const parsedItems = parseFoodItemsFromText(combinedText);
      if (!parsedItems.length) {
        updateFoodScanStatus('No recognizable food items found. Try clearer text or image.', 'warn');
        renderFoodScanResult([]);
        showToast('No food items detected.', 'error');
        return;
      }

      renderFoodScanResult(parsedItems);
      updateFoodScanStatus('Scan complete. ' + parsedItems.length + ' item(s) analyzed.', 'ok');
      showToast('Food carbon scan completed.');
    } catch (err) {
      const msg = err && err.message ? err.message : 'Scanner failed';
      updateFoodScanStatus('Food scanner error: ' + msg, 'warn');
      showToast('Food scanner failed. Try another image.', 'error');
    } finally {
      scanBtn.disabled = false;
      scanBtn.textContent = oldLabel;
    }
  };

  scanBtn.addEventListener('click', runScan);
}

function updateFoodScanStatus(text, mode = 'neutral') {
  const statusEl = document.getElementById('foodScanStatus');
  const pillEl = document.getElementById('foodScanPill');
  if (statusEl) statusEl.textContent = text;
  if (!pillEl) return;

  if (mode === 'busy') {
    pillEl.textContent = 'Scanning';
    pillEl.className = 'food-scan-pill busy';
  } else if (mode === 'ok') {
    pillEl.textContent = 'Done';
    pillEl.className = 'food-scan-pill ok';
  } else if (mode === 'warn') {
    pillEl.textContent = 'Review';
    pillEl.className = 'food-scan-pill warn';
  } else {
    pillEl.textContent = 'Ready';
    pillEl.className = 'food-scan-pill';
  }
}

function parseFoodItemsFromText(raw) {
  const text = String(raw || '').toLowerCase();
  if (!text.trim()) return [];

  const chunks = text
    .split(/[\n,;]+/)
    .map(s => s.trim())
    .filter(Boolean);

  const items = [];
  chunks.forEach(chunk => {
    const foodType = detectFoodType(chunk);
    if (!foodType) return;
    const amountKg = detectFoodAmountKg(chunk);
    const co2 = getCO2('food', foodType, amountKg);
    items.push({
      type: foodType,
      amountKg,
      co2,
      label: CATEGORY_META.food.icon + ' ' + formatTypeLabel('food', foodType),
    });
  });

  const merged = new Map();
  items.forEach(item => {
    const prev = merged.get(item.type);
    if (!prev) {
      merged.set(item.type, { ...item });
      return;
    }
    prev.amountKg += item.amountKg;
    prev.co2 += item.co2;
  });

  return Array.from(merged.values()).sort((a, b) => b.co2 - a.co2);
}

function detectFoodType(chunk) {
  for (const type of Object.keys(FOOD_KEYWORDS)) {
    const keys = FOOD_KEYWORDS[type];
    if (keys.some(k => chunk.includes(k))) return type;
  }
  return null;
}

function detectFoodAmountKg(chunk) {
  const kg = chunk.match(/(\d+(?:\.\d+)?)\s*(kg|kilogram|kilograms)\b/);
  if (kg) return Math.max(0.01, Number(kg[1]));

  const g = chunk.match(/(\d+(?:\.\d+)?)\s*(g|gm|gram|grams)\b/);
  if (g) return Math.max(0.01, Number(g[1]) / 1000);

  const lb = chunk.match(/(\d+(?:\.\d+)?)\s*(lb|lbs|pound|pounds)\b/);
  if (lb) return Math.max(0.01, Number(lb[1]) * 0.453592);

  const oz = chunk.match(/(\d+(?:\.\d+)?)\s*(oz|ounce|ounces)\b/);
  if (oz) return Math.max(0.01, Number(oz[1]) * 0.0283495);

  const naked = chunk.match(/\b(\d+(?:\.\d+)?)\b/);
  if (naked) {
    const val = Number(naked[1]);
    if (Number.isFinite(val) && val > 0 && val <= 5) return val;
    if (Number.isFinite(val) && val > 5 && val <= 3000) return val / 1000;
  }

  return 0.2;
}

function getFoodImpactLevel(totalKgCo2) {
  if (totalKgCo2 < 3) return { label: 'Low', cls: 'impact-low' };
  if (totalKgCo2 < 8) return { label: 'Medium', cls: 'impact-medium' };
  return { label: 'High', cls: 'impact-high' };
}

function buildFoodRecommendations(items) {
  if (!items.length) return ['Add more item details (amount and food type) for better recommendations.'];
  const sorted = items.slice().sort((a, b) => b.co2 - a.co2);
  const top = sorted[0];
  const recs = [];

  if (top && FOOD_ALTERNATIVES[top.type]) {
    const alts = FOOD_ALTERNATIVES[top.type]
      .map(t => formatTypeLabel('food', t))
      .join(' or ');
    recs.push('Swap part of ' + formatTypeLabel('food', top.type) + ' with ' + alts + ' to lower meal emissions.');

    const altType = FOOD_ALTERNATIVES[top.type][0];
    const altCo2 = getCO2('food', altType, top.amountKg);
    const saved = Math.max(0, top.co2 - altCo2);
    recs.push('Estimated saving from that swap: about ' + saved.toFixed(2) + ' kg CO2e for this amount.');
  }

  recs.push('Choose seasonal and local produce when possible to cut food-mile related impact.');
  recs.push('Reduce food waste by planning portions and using leftovers.');
  return recs.slice(0, 4);
}

function renderFoodScanResult(items) {
  const resultsEl = document.getElementById('foodScanResults');
  const totalEl = document.getElementById('foodScanTotal');
  const impactEl = document.getElementById('foodImpactLevel');
  const itemsEl = document.getElementById('foodScanItems');
  const recEl = document.getElementById('foodRecommendations');
  if (!resultsEl || !totalEl || !impactEl || !itemsEl || !recEl) return;

  resultsEl.style.display = 'block';

  if (!items.length) {
    totalEl.textContent = '--';
    impactEl.textContent = 'Unknown';
    impactEl.className = '';
    itemsEl.innerHTML = '<p>No recognizable food items found.</p>';
    recEl.innerHTML = '<li>Try entering text like: chicken 250g, rice 200g, vegetables 300g.</li>';
    renderFoodScanChart([]);
    return;
  }

  const total = items.reduce((s, it) => s + it.co2, 0);
  const level = getFoodImpactLevel(total);

  totalEl.textContent = total.toFixed(2) + ' kg CO2e';
  impactEl.textContent = level.label;
  impactEl.className = level.cls;

  itemsEl.innerHTML =
    '<div class="food-item-list">' +
    items.map(it =>
      '<div class="food-item-row">' +
      '<span>' + sanitizeText(it.label) + ' (' + it.amountKg.toFixed(3) + ' kg)</span>' +
      '<strong>' + it.co2.toFixed(2) + ' kg CO2e</strong>' +
      '</div>'
    ).join('') +
    '</div>';

  recEl.innerHTML = buildFoodRecommendations(items)
    .map(t => '<li>' + sanitizeText(t) + '</li>')
    .join('');

  renderFoodScanChart(items);
}

function renderFoodScanChart(items) {
  const canvas = document.getElementById('foodScanChart');
  if (!window.Chart || !canvas) return;

  if (foodScanChartInstance) {
    foodScanChartInstance.destroy();
    foodScanChartInstance = null;
  }

  if (!items.length) return;

  foodScanChartInstance = new Chart(canvas, {
    type: 'bar',
    data: {
      labels: items.map(i => formatTypeLabel('food', i.type)),
      datasets: [{
        label: 'kg CO2e',
        data: items.map(i => i.co2),
        backgroundColor: '#16a34a99',
        borderColor: '#16a34a',
        borderWidth: 1.5,
        borderRadius: 8,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
      },
      scales: {
        y: {
          beginAtZero: true,
          title: { display: true, text: 'kg CO2e' },
        },
      },
    },
  });
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
  let totalReductionKg = 0;
  let totalPoints = 0;
  let reductionStreak = 0;
  let bestStreak = 0;

  for (let i = 1; i < months.length; i++) {
    const prev = months[i - 1].total;
    const curr = months[i].total;
    if (prev > 0 && curr < prev) {
      const reductionKg = prev - curr;
      const pct = ((prev - curr) / prev) * 100;
      totalReductionKg += reductionKg;
      totalPoints += Math.round(reductionKg * 20 + pct * 5);
      if (pct > bestReductionPct) bestReductionPct = pct;
      reductionStreak += 1;
      if (reductionStreak > bestStreak) bestStreak = reductionStreak;
    } else {
      reductionStreak = 0;
    }
  }

  const levels = [
    { level: 1, name: 'Eco Starter', minKg: 0, nextKg: 10 },
    { level: 2, name: 'Carbon Cutter', minKg: 10, nextKg: 25 },
    { level: 3, name: 'Climate Hero', minKg: 25, nextKg: 50 },
    { level: 4, name: 'Sustainability Champion', minKg: 50, nextKg: null },
  ];

  let currentLevel = levels[0];
  for (let i = 0; i < levels.length; i++) {
    if (totalReductionKg >= levels[i].minKg) currentLevel = levels[i];
  }

  let levelProgressPct = 100;
  let nextLevelText = 'Maximum level achieved. Keep reducing to grow your points.';
  if (currentLevel.nextKg !== null) {
    const segment = currentLevel.nextKg - currentLevel.minKg;
    const progress = Math.max(0, totalReductionKg - currentLevel.minKg);
    levelProgressPct = segment > 0 ? Math.min(100, (progress / segment) * 100) : 0;
    const remaining = Math.max(0, currentLevel.nextKg - totalReductionKg);
    nextLevelText = remaining.toFixed(1) + ' kg more reduction needed for level ' + (currentLevel.level + 1) + '.';
  }

  return {
    totalPoints,
    totalReductionKg,
    bestReductionPct,
    bestStreak,
    currentLevel,
    levelProgressPct,
    nextLevelText,
    hasMonthlyHistory: months.length >= 2,
    beginner: bestReductionPct > 0,
    hero: bestReductionPct >= 10,
    champion: bestReductionPct >= 20,
  };
}

function renderBadgeSystem(monthlyTotal, prevMonthTotal) {
  const summaryEl = document.getElementById('badgeSummary');
  const msgEl = document.getElementById('badgeMsg');

  const profileLevelName = document.getElementById('profileLevelName');
  const profileLevelValue = document.getElementById('profileLevelValue');
  const profileLevelFill = document.getElementById('profileLevelFill');
  const profileLevelPct = document.getElementById('profileLevelPct');
  const profileNextText = document.getElementById('profileNextText');
  const profilePoints = document.getElementById('profilePoints');
  const profileReducedKg = document.getElementById('profileReducedKg');
  const profileBestReduction = document.getElementById('profileBestReduction');
  const profileStreak = document.getElementById('profileStreak');

  const beginnerEl = document.getElementById('badgeBeginner');
  const heroEl = document.getElementById('badgeHero');
  const championEl = document.getElementById('badgeChampion');
  const beginnerState = document.getElementById('badgeBeginnerState');
  const heroState = document.getElementById('badgeHeroState');
  const championState = document.getElementById('badgeChampionState');

  if (!summaryEl || !msgEl || !beginnerEl || !heroEl || !championEl || !beginnerState || !heroState || !championState) return;

  const badgeData = evaluateBadgeUnlocks();
  const unlockedCount = [badgeData.beginner, badgeData.hero, badgeData.champion].filter(Boolean).length;
  summaryEl.textContent = unlockedCount + ' / 3 unlocked';

  if (profileLevelName) profileLevelName.textContent = badgeData.currentLevel.name;
  if (profileLevelValue) profileLevelValue.textContent = String(badgeData.currentLevel.level);
  if (profileLevelFill) profileLevelFill.style.width = badgeData.levelProgressPct.toFixed(1) + '%';
  if (profileLevelPct) profileLevelPct.textContent = Math.round(badgeData.levelProgressPct) + '%';
  if (profileNextText) profileNextText.textContent = badgeData.nextLevelText;
  if (profilePoints) profilePoints.textContent = badgeData.totalPoints.toLocaleString();
  if (profileReducedKg) profileReducedKg.textContent = badgeData.totalReductionKg.toFixed(1) + ' kg';
  if (profileBestReduction) profileBestReduction.textContent = badgeData.bestReductionPct.toFixed(1) + '%';
  if (profileStreak) profileStreak.textContent = String(badgeData.bestStreak);

  const applyState = (wrap, stateEl, unlocked, label) => {
    wrap.classList.toggle('unlocked', unlocked);
    wrap.classList.toggle('locked', !unlocked);
    stateEl.textContent = unlocked ? 'Unlocked' : 'Locked';
    stateEl.className = 'badge-state ' + (unlocked ? 'ok' : 'no');
    if (unlocked) stateEl.setAttribute('title', label + ' unlocked');
    else stateEl.removeAttribute('title');
  };

  applyState(beginnerEl, beginnerState, badgeData.beginner, 'Eco Beginner');
  applyState(heroEl, heroState, badgeData.hero, 'Climate Hero');
  applyState(championEl, championState, badgeData.champion, 'Sustainability Champion');

  if (!badgeData.hasMonthlyHistory) {
    msgEl.textContent = 'Need at least two months of data to start earning reduction points and achievements.';
    return;
  }

  const currentReductionPct = (prevMonthTotal > 0 && monthlyTotal < prevMonthTotal)
    ? ((prevMonthTotal - monthlyTotal) / prevMonthTotal) * 100
    : 0;
  const currentReductionKg = (prevMonthTotal > 0 && monthlyTotal < prevMonthTotal)
    ? (prevMonthTotal - monthlyTotal)
    : 0;
  const currentPoints = currentReductionKg > 0
    ? Math.round(currentReductionKg * 20 + currentReductionPct * 5)
    : 0;

  if (currentReductionPct >= 20) {
    msgEl.textContent = 'Amazing! This month is down ' + currentReductionPct.toFixed(1) + '% (' + currentReductionKg.toFixed(1) + ' kg). +' + currentPoints + ' points and Sustainability Champion earned!';
  } else if (currentReductionPct >= 10) {
    msgEl.textContent = 'Great progress: ' + currentReductionPct.toFixed(1) + '% lower than last month (' + currentReductionKg.toFixed(1) + ' kg). +' + currentPoints + ' points and Climate Hero earned!';
  } else if (currentReductionPct > 0) {
    msgEl.textContent = 'Nice! You reduced emissions by ' + currentReductionPct.toFixed(1) + '% (' + currentReductionKg.toFixed(1) + ' kg). +' + currentPoints + ' points and Eco Beginner earned!';
  } else {
    const nextTarget = badgeData.beginner ? (badgeData.hero ? (badgeData.champion ? 0 : 20) : 10) : 1;
    msgEl.textContent = nextTarget === 0
      ? 'All achievements unlocked. Keep reducing to grow your points and level progress.'
      : 'Reduce emissions by ' + nextTarget + '% month-over-month to unlock your next achievement.';
  }
}

function getDailyLeaderboardSeed() {
  const now = new Date();
  return now.getFullYear() * 1000 + Math.floor((now - new Date(now.getFullYear(), 0, 1)) / 86400000);
}

function buildCommunityLeaderboard(todayTotal) {
  const seed = getDailyLeaderboardSeed();
  const wave = (idx) => Math.sin((seed + idx * 13) * 0.11) * 0.9;
  const users = [
    { username: 'EcoNova', base: 2.4 },
    { username: 'GreenRider', base: 3.1 },
    { username: 'LeafLoop', base: 1.9 },
    { username: 'SolarSam', base: 2.7 },
    { username: 'ZeroTrace', base: 1.6 },
    { username: 'PlanetPulse', base: 3.5 },
  ].map((u, i) => ({
    username: u.username,
    score: Math.max(0.2, u.base + wave(i)),
    isYou: false,
  }));

  const avatarText = (document.querySelector('.topbar-avatar')?.textContent || '').trim();
  users.push({
    username: avatarText ? 'You (' + avatarText + ')' : 'You',
    score: Math.max(0, todayTotal),
    isYou: true,
  });

  return users.sort((a, b) => a.score - b.score);
}

function renderGlobalLeaderboard(todayTotal) {
  const listEl = document.getElementById('leaderboardList');
  const noteEl = document.getElementById('leaderboardNote');
  const pillEl = document.getElementById('leaderboardPill');
  if (!listEl || !noteEl || !pillEl) return;

  const ranked = buildCommunityLeaderboard(todayTotal);
  const top = ranked.slice(0, 5);
  const yourPos = ranked.findIndex(u => u.isYou);

  listEl.innerHTML = top.map((u, i) => {
    const medal = i === 0 ? '🥇' : (i === 1 ? '🥈' : (i === 2 ? '🥉' : '#' + (i + 1)));
    const status = u.score <= 2 ? 'Excellent' : (u.score <= 4 ? 'Good' : 'Needs improvement');
    return (
      '<div class="leaderboard-item' + (u.isYou ? ' is-you' : '') + '">' +
        '<div class="leaderboard-rank">' + medal + '</div>' +
        '<div class="leaderboard-user">' + sanitizeText(u.username) + '</div>' +
        '<div class="leaderboard-score-wrap">' +
          '<strong class="leaderboard-score">' + u.score.toFixed(2) + ' kg</strong>' +
          '<span class="leaderboard-status">' + status + '</span>' +
        '</div>' +
      '</div>'
    );
  }).join('');

  if (yourPos === -1) {
    noteEl.textContent = 'Live rankings unavailable at the moment.';
    pillEl.textContent = 'Syncing';
    pillEl.className = 'leaderboard-pill warm';
    return;
  }

  const rankLabel = '#' + (yourPos + 1);
  const yourScore = ranked[yourPos].score;
  if (yourPos < 3) {
    noteEl.textContent = 'Great job. You are currently ' + rankLabel + ' among eco-friendly users with ' + yourScore.toFixed(2) + ' kg today.';
    pillEl.textContent = 'Top tier';
    pillEl.className = 'leaderboard-pill cool';
  } else {
    noteEl.textContent = 'You are currently ' + rankLabel + '. Reduce today\'s emissions to climb into the top eco-friendly ranks.';
    pillEl.textContent = 'Live';
    pillEl.className = 'leaderboard-pill';
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
  const totalFootprint = entries.reduce((s, e) => s + e.co2, 0);

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
  renderPredictionCard();
  renderPersonalizedTips('dashPersonalizedTips');
  renderGoalCard(monthlyTotal);
  renderOffsetCard(totalFootprint);
  renderGlobalLeaderboard(todayTotal);
  renderBadgeSystem(monthlyTotal, prevMonthTotal);
}

function getContinuousDailyValues() {
  if (!entries.length) return [];
  const totalsByDate = {};
  entries.forEach(e => { totalsByDate[e.date] = (totalsByDate[e.date] || 0) + e.co2; });

  const dates = Object.keys(totalsByDate).sort();
  if (!dates.length) return [];

  const start = new Date(dates[0] + 'T00:00:00');
  const end = new Date();
  end.setHours(0, 0, 0, 0);

  const values = [];
  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    const iso = d.toISOString().split('T')[0];
    values.push(totalsByDate[iso] || 0);
  }
  return values;
}

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

function renderPredictionChart(pastWeek, predWeek, pastMonth, predMonth) {
  const canvas = document.getElementById('predictionChart');
  if (!window.Chart || !canvas) return;

  const isDark = themeMode === 'dark';
  const pastColor = isDark ? 'rgba(148, 163, 184, 0.85)' : 'rgba(100, 116, 139, 0.8)';
  const predColor = isDark ? 'rgba(16, 185, 129, 0.9)' : 'rgba(5, 150, 105, 0.9)';

  if (predictionChartInstance) {
    predictionChartInstance.destroy();
    predictionChartInstance = null;
  }

  predictionChartInstance = new Chart(canvas, {
    type: 'bar',
    data: {
      labels: ['7-Day Total', '30-Day Total'],
      datasets: [
        {
          label: 'Past',
          data: [pastWeek, pastMonth],
          backgroundColor: pastColor,
          borderRadius: 8,
          barPercentage: 0.7,
          categoryPercentage: 0.62,
        },
        {
          label: 'Predicted',
          data: [predWeek, predMonth],
          backgroundColor: predColor,
          borderRadius: 8,
          barPercentage: 0.7,
          categoryPercentage: 0.62,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { position: 'top' },
        tooltip: {
          callbacks: {
            label(ctx) { return ctx.dataset.label + ': ' + Number(ctx.raw || 0).toFixed(2) + ' kg CO₂e'; },
          },
        },
      },
      scales: {
        y: {
          beginAtZero: true,
          ticks: {
            callback(v) { return Number(v).toFixed(0) + ' kg'; },
          },
        },
      },
    },
  });
}

async function renderPredictionCard() {
  const statusEl = document.getElementById('predictionStatus');
  const weekEl = document.getElementById('predictionWeek');
  const monthEl = document.getElementById('predictionMonth');
  const msgEl = document.getElementById('predictionMessage');
  if (!statusEl || !weekEl || !monthEl || !msgEl) return;

  const token = ++predictionRunToken;
  const values = getContinuousDailyValues();

  if (values.length < 14) {
    statusEl.textContent = 'Need more data';
    weekEl.textContent = '--';
    monthEl.textContent = '--';
    msgEl.textContent = 'Add at least 14 days of history for AI prediction.';
    renderPredictionChart(0, 0, 0, 0);
    return;
  }

  statusEl.textContent = window.tf ? 'Training model' : 'Using fallback model';
  msgEl.textContent = 'Training on your historical daily emissions...';

  try {
    const preds = await trainAndPredictTf(values, 30);
    if (token !== predictionRunToken) return;

    const predWeek = preds.slice(0, 7).reduce((s, v) => s + v, 0);
    const predMonth = preds.reduce((s, v) => s + v, 0);
    const pastWeek = values.slice(-7).reduce((s, v) => s + v, 0);
    const pastMonth = values.slice(-30).reduce((s, v) => s + v, 0);

    weekEl.textContent = predWeek.toFixed(2);
    monthEl.textContent = predMonth.toFixed(2);
    statusEl.textContent = window.tf ? 'AI ready' : 'Fallback ready';

    const deltaPct = pastWeek > 0 ? ((predWeek - pastWeek) / pastWeek) * 100 : 0;
    if (deltaPct > 8) {
      msgEl.textContent = 'Prediction suggests an increase next week (' + deltaPct.toFixed(1) + '%). Consider acting on your top emission category.';
    } else if (deltaPct < -8) {
      msgEl.textContent = 'Great trend: next week is predicted to be ' + Math.abs(deltaPct).toFixed(1) + '% lower than your recent week.';
    } else {
      msgEl.textContent = 'Your emissions are predicted to remain relatively stable over the next week.';
    }

    renderPredictionChart(pastWeek, predWeek, pastMonth, predMonth);
  } catch {
    if (token !== predictionRunToken) return;
    statusEl.textContent = 'Model error';
    msgEl.textContent = 'Could not train the AI model with current data. Add more consistent entries and try again.';
  }
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
