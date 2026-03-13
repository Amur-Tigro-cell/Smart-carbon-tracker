/* =============================================
  modules/charts.js - extracted from app.js
  ============================================= */

function initChartTheme() {
  if (!window.Chart) return;
  const cs = getComputedStyle(document.body);
  const chartText = cs.getPropertyValue('--text-500').trim() || '#64748b';
  const chartBorder = cs.getPropertyValue('--border').trim() || '#e2e8f0';
  Chart.defaults.font.family = 'Inter, -apple-system, BlinkMacSystemFont, sans-serif';
  Chart.defaults.color = chartText;
  Chart.defaults.borderColor = chartBorder;
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

  const cs = getComputedStyle(document.body);
  const cardBg = cs.getPropertyValue('--bg-card').trim() || '#ffffff';
  const borderCol = cs.getPropertyValue('--border').trim() || '#e2e8f0';

  const labels = keys.map(k => CATEGORY_META[k]?.label || k);
  const values = keys.map(k => Number(totals[k].toFixed(3)));
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
        borderColor: cardBg,
        borderWidth: 4,
        hoverBorderWidth: 3,
        hoverOffset: 12,
        spacing: 2,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      layout: {
        padding: 4,
      },
      animation: {
        duration: 650,
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
  legendEl.innerHTML = keys.map(k => {
    const pct = total > 0 ? ((totals[k] / total) * 100).toFixed(1) : '0.0';
    return `<div class="legend-item">
       <span class="legend-dot" style="background:${CATEGORY_META[k]?.color || '#ccc'}"></span>
       <span>${CATEGORY_META[k]?.label || k}: <strong>${totals[k].toFixed(1)}</strong> kg (${pct}%)</span>
     </div>`;
  }).join('');
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

  // Aggregate last 7 days (weekly trend)
  const today = new Date();
  const labels = [];
  const values = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const iso = d.toISOString().split('T')[0];
    labels.push(d.toLocaleDateString(undefined, { weekday: 'short' }));
    const sum = entries.filter(e => e.date === iso).reduce((s, e) => s + e.co2, 0);
    values.push(Number(sum.toFixed(3)));
  }

  const cs = getComputedStyle(document.body);
  const lineColor = cs.getPropertyValue('--emerald').trim() || '#10b981';
  const pointBorder = cs.getPropertyValue('--bg-card').trim() || '#ffffff';
  const tickColor = cs.getPropertyValue('--text-300').trim() || '#94a3b8';
  const yGridColor = cs.getPropertyValue('--border').trim() || '#e2e8f0';

  const ctx = canvas.getContext('2d');
  const gradient = ctx.createLinearGradient(0, 0, 0, canvas.parentElement?.clientHeight || 220);
  gradient.addColorStop(0, 'rgba(16,185,129,0.34)');
  gradient.addColorStop(1, 'rgba(16,185,129,0.03)');

  if (timelineChartInstance) {
    timelineChartInstance.destroy();
    timelineChartInstance = null;
  }

  timelineChartInstance = new Chart(canvas, {
    type: 'line',
    data: {
      labels,
      datasets: [{
        label: 'Daily emissions (last 7 days)',
        data: values,
        borderColor: lineColor,
        backgroundColor: gradient,
        fill: true,
        tension: 0.42,
        borderWidth: 3,
        pointBackgroundColor: lineColor,
        pointBorderColor: pointBorder,
        pointBorderWidth: 2,
        pointHoverRadius: 6,
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
            maxTicksLimit: 7,
            color: tickColor,
            font: {
              size: 11,
              weight: 600,
            },
          },
          border: {
            display: false,
          },
        },
        y: {
          beginAtZero: true,
          ticks: {
            color: tickColor,
            font: {
              size: 10,
            },
            callback(value) {
              return `${Number(value).toFixed(1)} kg`;
            },
          },
          grid: {
            color: yGridColor,
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
