/* =============================================
  modules/goals.js - extracted from app.js
  ============================================= */

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
  const ring     = document.getElementById('goalRing');
  const ringPct  = document.getElementById('goalRingPct');
  const ringCopy = document.getElementById('goalVisualCopy');
  if (!section) return;

  if (!monthlyGoal) {
    section.style.display = 'none';
    if (pill) { pill.textContent = 'No goal set'; pill.className = 'goal-status-pill'; }
    return;
  }

  if (input && document.activeElement !== input) input.value = monthlyGoal;

  const pct    = (monthlyTotal / monthlyGoal) * 100;
  const usedPct = Math.min(100, Math.max(0, pct));
  const remain = Math.max(0, monthlyGoal - monthlyTotal);
  const over   = Math.max(0, monthlyTotal - monthlyGoal);

  section.style.display = '';
  const fill = document.getElementById('goalFill');
  fill.style.width = usedPct.toFixed(1) + '%';

  let progressColor = '#10b981';
  if (pct >= 100)     fill.style.background = 'linear-gradient(90deg,#ef4444,#dc2626)';
  else if (pct >= 80) fill.style.background = 'linear-gradient(90deg,#f59e0b,#d97706)';
  else                fill.style.background = 'linear-gradient(90deg,#10b981,#059669)';
  if (pct >= 100) progressColor = '#ef4444';
  else if (pct >= 80) progressColor = '#f59e0b';

  if (ring) {
    const angle = (usedPct / 100) * 360;
    ring.style.background = 'conic-gradient(' + progressColor + ' 0deg ' + angle.toFixed(1) + 'deg, #e2e8f0 ' + angle.toFixed(1) + 'deg 360deg)';
  }
  if (ringPct) ringPct.textContent = Math.round(usedPct) + '%';
  if (ringCopy) {
    ringCopy.textContent = pct >= 100
      ? 'You have exceeded your goal by ' + over.toFixed(1) + ' kg this month.'
      : 'You are using ' + Math.round(usedPct) + '% of your monthly goal with ' + remain.toFixed(1) + ' kg left.';
  }

  document.getElementById('goalPct').textContent        = Math.round(usedPct) + '%';
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
