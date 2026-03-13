/* =============================================
  modules/dashboard.js - extracted from app.js
  ============================================= */

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

function renderEmissionCategoryCards(monthlyEntries) {
  const el = {
    transportValue: document.getElementById('catTransportValue'),
    electricityValue: document.getElementById('catElectricityValue'),
    foodValue: document.getElementById('catFoodValue'),
    otherValue: document.getElementById('catOtherValue'),
    transportMeta: document.getElementById('catTransportMeta'),
    electricityMeta: document.getElementById('catElectricityMeta'),
    foodMeta: document.getElementById('catFoodMeta'),
    otherMeta: document.getElementById('catOtherMeta'),
    transportFill: document.getElementById('catTransportFill'),
    electricityFill: document.getElementById('catElectricityFill'),
    foodFill: document.getElementById('catFoodFill'),
    otherFill: document.getElementById('catOtherFill'),
  };

  if (!el.transportValue || !el.electricityValue || !el.foodValue || !el.otherValue ||
      !el.transportMeta || !el.electricityMeta || !el.foodMeta || !el.otherMeta ||
      !el.transportFill || !el.electricityFill || !el.foodFill || !el.otherFill) {
    return;
  }

  const totals = {
    transport: 0,
    electricity: 0,
    food: 0,
    other: 0,
  };

  monthlyEntries.forEach(e => {
    if (e.category === 'transport') totals.transport += e.co2;
    else if (e.category === 'electricity') totals.electricity += e.co2;
    else if (e.category === 'food') totals.food += e.co2;
    else totals.other += e.co2;
  });

  const monthlyTotal = totals.transport + totals.electricity + totals.food + totals.other;
  const maxVal = Math.max(0.01, totals.transport, totals.electricity, totals.food, totals.other);

  const apply = (valueEl, metaEl, fillEl, val) => {
    animateNumberTo(valueEl, val, { decimals: 2, suffix: ' kg', duration: 460 });
    const pctMonthly = monthlyTotal > 0 ? (val / monthlyTotal) * 100 : 0;
    metaEl.textContent = pctMonthly.toFixed(1) + '% of monthly emissions';
    fillEl.style.width = ((val / maxVal) * 100).toFixed(1) + '%';
  };

  apply(el.transportValue, el.transportMeta, el.transportFill, totals.transport);
  apply(el.electricityValue, el.electricityMeta, el.electricityFill, totals.electricity);
  apply(el.foodValue, el.foodMeta, el.foodFill, totals.food);
  apply(el.otherValue, el.otherMeta, el.otherFill, totals.other);
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
  animateNumberTo(document.getElementById('todayCO2'), todayTotal, { decimals: 2, duration: 560 });
  animateNumberTo(document.getElementById('weeklyCO2'), weeklyTotal, { decimals: 2, duration: 560 });
  animateNumberTo(document.getElementById('monthlyCO2'), monthlyTotal, { decimals: 2, duration: 560 });

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
  animateNumberTo(document.getElementById('treesNeeded'), treesNeeded(monthlyTotal), { decimals: 0, duration: 480 });
  animateNumberTo(document.getElementById('dailyAvg'), dailyAvg, { decimals: 2, duration: 520 });
  document.getElementById('carbonRating').textContent = carbonRatingLabel(monthlyTotal);
  renderEmissionCategoryCards(monthlyEntries);

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
