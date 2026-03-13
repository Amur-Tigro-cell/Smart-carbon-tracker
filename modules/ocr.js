/* =============================================
  modules/ocr.js - extracted from app.js
  ============================================= */

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
