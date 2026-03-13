/* =============================================
   auth-scanner.js — user auth and quick scanner
   ============================================= */

'use strict';

const AUTH_PROFILE_KEY = 'sct_user_profile';
const AUTH_SESSION_KEY = 'sct_user_session';
const AUTH_LOGS_KEY = 'sct_login_logs';
const SCAN_LOGS_KEY = 'sct_scan_logs';
const AUTH_MODE_KEY = 'sct_auth_mode';
const AUTH_DEBUG_KEY = 'sct_debug_auth';

let quickScanStream = null;
let quickScanRafId = null;
let quickScanDetector = null;
let authScanStream = null;
let authScanRafId = null;
let activeSessionCache = null;
let authDebugEnabled = false;

function initUserAuth() {
  const authBtn = document.getElementById('userAuthBtn');
  const form = document.getElementById('authForm');
  const clearLogsBtn = document.getElementById('clearLoginLogs');
  const loginModeBtn = document.getElementById('loginModeBtn');
  const registerModeBtn = document.getElementById('registerModeBtn');
  const googleJoinBtn = document.getElementById('googleJoinBtn');
  const scanJoinBtn = document.getElementById('scanJoinBtn');
  const forgotBtn = document.getElementById('authForgotBtn');
  const scanStartBtn = document.getElementById('authScanStart');
  const scanStopBtn = document.getElementById('authScanStop');
  const scanFile = document.getElementById('authScanFile');

  initAuthDebugMode();

  const savedMode = getStoredJson(AUTH_MODE_KEY, 'login');
  setAuthMode(savedMode === 'register' ? 'register' : 'login');

  renderAuthUi();

  if (authBtn) {
    authBtn.addEventListener('click', () => {
      const session = getActiveSession(true);
      if (session && session.email) {
        logoutUser();
        return;
      }
      setAuthMode('login');
      showAuthGateway();
    });
  }

  if (loginModeBtn) loginModeBtn.addEventListener('click', () => setAuthMode('login'));
  if (registerModeBtn) registerModeBtn.addEventListener('click', () => setAuthMode('register'));
  if (googleJoinBtn) googleJoinBtn.addEventListener('click', handleGoogleJoin);
  if (forgotBtn) {
    forgotBtn.addEventListener('click', () => {
      if (typeof showToast === 'function') showToast('Use Register to create a new password for now.');
      setAuthMode('register');
    });
  }

  if (scanJoinBtn) {
    scanJoinBtn.addEventListener('click', () => {
      const wrap = document.getElementById('authScanWrap');
      if (!wrap) return;
      wrap.hidden = !wrap.hidden;
      if (!wrap.hidden) {
        setAuthScanStatus('Scan a QR with payload: {"name":"Your Name","email":"you@example.com"}.');
      } else {
        stopAuthScanner();
      }
    });
  }

  if (scanStartBtn) scanStartBtn.addEventListener('click', startAuthScanner);
  if (scanStopBtn) scanStopBtn.addEventListener('click', stopAuthScanner);
  if (scanFile) {
    scanFile.addEventListener('change', async (event) => {
      const file = event.target.files && event.target.files[0];
      if (!file) return;
      await scanAuthImageFile(file);
      scanFile.value = '';
    });
  }

  if (form) {
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      await handleAuthSubmit();
    });
  }

  if (clearLogsBtn) {
    clearLogsBtn.addEventListener('click', () => {
      try {
        localStorage.removeItem(AUTH_LOGS_KEY);
      } catch {}
      renderAuthUi();
      if (typeof showToast === 'function') showToast('Login logs cleared.');
    });
  }
}

function setAuthMode(mode) {
  const safeMode = mode === 'register' ? 'register' : 'login';
  document.body.setAttribute('data-auth-mode', safeMode);
  saveStoredJson(AUTH_MODE_KEY, safeMode);

  const loginModeBtn = document.getElementById('loginModeBtn');
  const registerModeBtn = document.getElementById('registerModeBtn');
  const submitBtn = document.getElementById('authSubmitBtn');
  if (loginModeBtn) {
    loginModeBtn.classList.toggle('active', safeMode === 'login');
    loginModeBtn.setAttribute('aria-selected', safeMode === 'login' ? 'true' : 'false');
  }
  if (registerModeBtn) {
    registerModeBtn.classList.toggle('active', safeMode === 'register');
    registerModeBtn.setAttribute('aria-selected', safeMode === 'register' ? 'true' : 'false');
  }
  if (submitBtn) submitBtn.textContent = safeMode === 'register' ? 'Register' : 'Login';

  const confirmInput = document.getElementById('authConfirmPassword');
  if (confirmInput && safeMode === 'login') confirmInput.value = '';
}

function showAuthGateway() {
  const gateway = document.getElementById('authGateway');
  const topbar = document.querySelector('.topbar');
  const shell = document.querySelector('.app-shell');
  if (gateway) gateway.hidden = false;
  if (topbar) topbar.style.display = 'none';
  if (shell) shell.style.display = 'none';
  document.body.classList.add('auth-gateway-mode');
  document.documentElement.setAttribute('data-auth-boot', 'logged-out');
  setAuthDebugState('gateway', 'auth screen');

  const profile = getStoredJson(AUTH_PROFILE_KEY, null);
  const nameEl = document.getElementById('authName');
  const emailEl = document.getElementById('authEmail');
  const passEl = document.getElementById('authPassword');
  const confirmEl = document.getElementById('authConfirmPassword');

  if (nameEl && !nameEl.value) nameEl.value = profile?.name || '';
  if (emailEl) emailEl.value = profile?.email || '';
  if (passEl) passEl.value = '';
  if (confirmEl) confirmEl.value = '';

  setTimeout(() => {
    if (emailEl) emailEl.focus();
  }, 0);
}

function hideAuthGateway() {
  const gateway = document.getElementById('authGateway');
  const topbar = document.querySelector('.topbar');
  const shell = document.querySelector('.app-shell');
  if (gateway) gateway.hidden = true;
  if (topbar) topbar.style.display = '';
  if (shell) shell.style.display = '';
  document.body.classList.remove('auth-gateway-mode');
  document.documentElement.setAttribute('data-auth-boot', 'logged-in');
  stopAuthScanner();
  setAuthDebugState('main', 'app visible');
}

function persistAndActivateSession(session) {
  activeSessionCache = session || null;
  saveStoredJson(AUTH_SESSION_KEY, session);
}

function clearActiveSession() {
  activeSessionCache = null;
  try {
    localStorage.removeItem(AUTH_SESSION_KEY);
  } catch {}
}

async function handleAuthSubmit() {
  const mode = document.body.getAttribute('data-auth-mode') === 'register' ? 'register' : 'login';
  const name = (document.getElementById('authName')?.value || '').trim();
  const email = (document.getElementById('authEmail')?.value || '').trim().toLowerCase();
  const password = document.getElementById('authPassword')?.value || '';
  const confirmPassword = document.getElementById('authConfirmPassword')?.value || '';

  if (!email || !password || (mode === 'register' && !name)) {
    if (typeof showToast === 'function') showToast('Please complete all required fields.', 'error');
    return;
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    if (typeof showToast === 'function') showToast('Please enter a valid email address.', 'error');
    return;
  }

  if (password.length < 6) {
    if (typeof showToast === 'function') showToast('Password must be at least 6 characters.', 'error');
    return;
  }

  if (mode === 'register' && password !== confirmPassword) {
    if (typeof showToast === 'function') showToast('Passwords do not match.', 'error');
    return;
  }

  const profile = getStoredJson(AUTH_PROFILE_KEY, null);
  const nextHash = await hashText(password);

  if (mode === 'register' && profile && profile.email === email) {
    if (typeof showToast === 'function') showToast('Account exists. Please login.', 'error');
    setAuthMode('login');
    return;
  }
  if (mode === 'login' && profile && profile.email === email && profile.passwordHash && profile.passwordHash !== nextHash) {
    if (typeof showToast === 'function') showToast('Incorrect password for this account.', 'error');
    return;
  }
  if (mode === 'login' && profile && profile.email !== email) {
    if (typeof showToast === 'function') showToast('No account found for this email. Please register.', 'error');
    return;
  }

  const resolvedName = name || profile?.name || 'User';
  const nowIso = new Date().toISOString();
  const nextProfile = {
    name: resolvedName,
    email,
    passwordHash: nextHash,
    createdAt: profile?.createdAt || nowIso,
    lastLoginAt: nowIso,
    provider: 'email',
  };
  const session = {
    email,
    name: resolvedName,
    loggedInAt: nowIso,
    lastActiveAt: nowIso,
  };

  saveStoredJson(AUTH_PROFILE_KEY, nextProfile);
  persistAndActivateSession(session);
  appendLoginLog({ name: resolvedName, email, at: nowIso, source: 'email' });

  hideAuthGateway();
  renderAuthUi();
  if (typeof showToast === 'function') showToast(mode === 'register' ? 'Registration successful.' : 'Login successful.');
}

function logoutUser() {
  clearActiveSession();
  showAuthGateway();
  renderAuthUi();
  if (typeof showToast === 'function') showToast('Logged out successfully.');
}

function renderAuthUi() {
  const profile = getStoredJson(AUTH_PROFILE_KEY, null);
  const session = getActiveSession();
  const logs = getStoredJson(AUTH_LOGS_KEY, []);

  const isLoggedIn = !!(session && session.email);
  const currentName = isLoggedIn ? (session.name || profile?.name || 'User') : 'Guest User';
  const currentEmail = isLoggedIn ? session.email : 'Not logged in';
  const lastLogin = profile?.lastLoginAt ? formatPrettyDate(profile.lastLoginAt) : '--';

  const authStatus = document.getElementById('authStatus');
  const authBtnText = document.getElementById('userAuthBtnText');
  const avatar = document.getElementById('topbarAvatar');
  const authCardPill = document.getElementById('authCardPill');
  const authProfileName = document.getElementById('authProfileName');
  const authProfileEmail = document.getElementById('authProfileEmail');
  const authLastLogin = document.getElementById('authLastLogin');
  const authSessionPolicy = document.getElementById('authSessionPolicy');
  const loginLogList = document.getElementById('loginLogList');

  if (authStatus) authStatus.textContent = isLoggedIn ? 'Signed in' : 'Guest';
  if (authBtnText) authBtnText.textContent = isLoggedIn ? 'Logout' : 'Login / Register';
  if (avatar) {
    avatar.textContent = initialsFromName(currentName);
    avatar.title = isLoggedIn ? currentName : 'Guest profile';
  }
  if (authCardPill) authCardPill.textContent = isLoggedIn ? 'Active User' : 'Guest';
  if (authProfileName) authProfileName.textContent = currentName;
  if (authProfileEmail) authProfileEmail.textContent = currentEmail;
  if (authLastLogin) authLastLogin.textContent = lastLogin;
  if (authSessionPolicy) authSessionPolicy.textContent = 'Manual logout only';

  if (isLoggedIn) {
    hideAuthGateway();
    setAuthDebugState('main', 'logged in');
  } else {
    showAuthGateway();
    setAuthDebugState('gateway', 'not logged in');
  }

  if (loginLogList) {
    if (!logs.length) {
      loginLogList.innerHTML = '<p class="auth-empty">No login logs yet.</p>';
    } else {
      loginLogList.innerHTML = logs
        .slice()
        .sort((a, b) => String(b.at).localeCompare(String(a.at)))
        .slice(0, 12)
        .map((item) => {
          const safeName = escapeHtml(item.name || 'User');
          const safeEmail = escapeHtml(item.email || '--');
          const pretty = formatPrettyDate(item.at);
          return '<div class="auth-log-item">'
            + '<div><strong>' + safeName + '</strong><span>' + safeEmail + '</span></div>'
            + '<time>' + pretty + '</time>'
            + '</div>';
        })
        .join('');
    }
  }
}

function appendLoginLog(log) {
  const logs = getStoredJson(AUTH_LOGS_KEY, []);
  logs.push(log);
  while (logs.length > 30) logs.shift();
  saveStoredJson(AUTH_LOGS_KEY, logs);
}

async function handleGoogleJoin() {
  const emailInput = window.prompt('Google email address');
  if (!emailInput) return;
  const email = String(emailInput).trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    if (typeof showToast === 'function') showToast('Please enter a valid email address.', 'error');
    return;
  }

  const nameInput = window.prompt('Display name (Google account)', email.split('@')[0] || 'Google User');
  const name = (nameInput || email.split('@')[0] || 'Google User').trim();
  const nowIso = new Date().toISOString();

  const profile = getStoredJson(AUTH_PROFILE_KEY, null);
  const nextProfile = {
    name,
    email,
    passwordHash: profile?.passwordHash || '',
    createdAt: profile?.createdAt || nowIso,
    lastLoginAt: nowIso,
    provider: 'google',
  };
  const session = {
    email,
    name,
    loggedInAt: nowIso,
    lastActiveAt: nowIso,
  };

  saveStoredJson(AUTH_PROFILE_KEY, nextProfile);
  persistAndActivateSession(session);
  appendLoginLog({ name, email, at: nowIso, source: 'google' });
  hideAuthGateway();
  renderAuthUi();
  if (typeof showToast === 'function') showToast('Joined successfully with Google.');
}

async function startAuthScanner() {
  const video = document.getElementById('authScannerVideo');
  if (!video) return;

  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    setAuthScanStatus('Camera is unavailable in this browser.');
    return;
  }

  if (!quickScanDetector && 'BarcodeDetector' in window) {
    quickScanDetector = new window.BarcodeDetector({
      formats: ['qr_code', 'code_128', 'ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_39'],
    });
  }

  try {
    authScanStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false });
    video.srcObject = authScanStream;
    await video.play();
    setAuthScanStatus('Scanning QR...');
    loopAuthScanner();
  } catch {
    setAuthScanStatus('Unable to access camera. Please allow permission.');
  }
}

function stopAuthScanner() {
  if (authScanRafId) {
    cancelAnimationFrame(authScanRafId);
    authScanRafId = null;
  }
  if (authScanStream) {
    authScanStream.getTracks().forEach((track) => track.stop());
    authScanStream = null;
  }
  const video = document.getElementById('authScannerVideo');
  if (video) video.srcObject = null;
}

function loopAuthScanner() {
  const video = document.getElementById('authScannerVideo');
  if (!video || !authScanStream) return;
  authScanRafId = requestAnimationFrame(loopAuthScanner);
  if (!quickScanDetector || video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) return;

  quickScanDetector.detect(video).then((codes) => {
    if (!codes || !codes.length) return;
    const raw = String(codes[0].rawValue || '').trim();
    if (!raw) return;
    handleScannedJoinPayload(raw);
    stopAuthScanner();
  }).catch(() => {
    // Ignore intermittent frame detection errors.
  });
}

async function scanAuthImageFile(file) {
  if (!quickScanDetector && 'BarcodeDetector' in window) {
    quickScanDetector = new window.BarcodeDetector({
      formats: ['qr_code', 'code_128', 'ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_39'],
    });
  }

  if (quickScanDetector) {
    try {
      const bitmap = await createImageBitmap(file);
      const codes = await quickScanDetector.detect(bitmap);
      if (codes.length && codes[0].rawValue) {
        handleScannedJoinPayload(String(codes[0].rawValue));
        return;
      }
    } catch {
      // Continue OCR fallback.
    }
  }

  if (window.Tesseract && typeof window.Tesseract.recognize === 'function') {
    setAuthScanStatus('No barcode found. Trying OCR text...');
    try {
      const result = await window.Tesseract.recognize(file, 'eng');
      const text = String(result?.data?.text || '').replace(/\s+/g, ' ').trim();
      if (!text) {
        setAuthScanStatus('No readable login payload found.');
        return;
      }
      handleScannedJoinPayload(text);
      return;
    } catch {
      setAuthScanStatus('Image scan failed. Try a clearer QR/image.');
      return;
    }
  }

  setAuthScanStatus('Scanning is not supported in this browser.');
}

function handleScannedJoinPayload(rawPayload) {
  const parsed = parseJoinPayload(rawPayload);
  if (!parsed) {
    setAuthScanStatus('Invalid QR payload. Use {"name":"Your Name","email":"you@example.com"}.');
    return;
  }

  const nowIso = new Date().toISOString();
  const profile = getStoredJson(AUTH_PROFILE_KEY, null);

  const nextProfile = {
    name: parsed.name,
    email: parsed.email,
    passwordHash: profile?.passwordHash || '',
    createdAt: profile?.createdAt || nowIso,
    lastLoginAt: nowIso,
    provider: 'scan',
  };

  const session = {
    email: parsed.email,
    name: parsed.name,
    loggedInAt: nowIso,
    lastActiveAt: nowIso,
  };

  saveStoredJson(AUTH_PROFILE_KEY, nextProfile);
  persistAndActivateSession(session);
  appendLoginLog({ name: parsed.name, email: parsed.email, at: nowIso, source: 'scan' });
  setAuthScanStatus('Scan success. Signing you in...');
  hideAuthGateway();
  renderAuthUi();
  if (typeof showToast === 'function') showToast('Joined successfully by scanning QR.');
}

function parseJoinPayload(rawPayload) {
  const text = String(rawPayload || '').trim();
  if (!text) return null;

  try {
    const json = JSON.parse(text);
    const name = String(json?.name || '').trim();
    const email = String(json?.email || '').trim().toLowerCase();
    if (name && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { name, email };
  } catch {}

  const emailMatch = text.match(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/);
  if (!emailMatch) return null;
  const email = emailMatch[0].toLowerCase();
  const nameCandidate = text.replace(emailMatch[0], '').replace(/name\s*[:=-]?/i, '').trim();
  const name = nameCandidate || email.split('@')[0] || 'Scanned User';
  return { name, email };
}

function setAuthScanStatus(message) {
  const status = document.getElementById('authScanStatus');
  if (status) status.textContent = message;
}

function getActiveSession() {
  const stored = getStoredJson(AUTH_SESSION_KEY, null);
  if (stored && stored.email) {
    activeSessionCache = stored;
    setAuthDebugState('session', 'storage hit');
    return stored;
  }
  if (activeSessionCache?.email) {
    setAuthDebugState('session', 'cache hit');
  }
  return activeSessionCache;
}

function initAuthDebugMode() {
  const badge = document.getElementById('authDebugBadge');
  const params = new URLSearchParams(window.location.search);
  const urlFlag = params.get('debugAuth');

  if (urlFlag === '1') {
    saveStoredJson(AUTH_DEBUG_KEY, true);
  } else if (urlFlag === '0') {
    try {
      localStorage.removeItem(AUTH_DEBUG_KEY);
    } catch {}
  }

  authDebugEnabled = !!getStoredJson(AUTH_DEBUG_KEY, false);

  if (!badge) return;
  badge.hidden = !authDebugEnabled;
  if (authDebugEnabled) {
    setAuthDebugState('boot', 'debug enabled');
  }
}

function setAuthDebugState(state, detail) {
  if (!authDebugEnabled) return;
  const badge = document.getElementById('authDebugBadge');
  if (!badge) return;
  const mode = document.body.classList.contains('auth-gateway-mode') ? 'gateway' : 'main';
  badge.textContent = `auth:${mode} | ${state}${detail ? ` (${detail})` : ''}`;
}

function initQuickScanner() {
  const startBtn = document.getElementById('startQuickScan');
  const stopBtn = document.getElementById('stopQuickScan');
  const fileInput = document.getElementById('quickScanFile');

  renderScanHistory();

  if ('BarcodeDetector' in window) {
    quickScanDetector = new window.BarcodeDetector({
      formats: ['qr_code', 'code_128', 'ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_39'],
    });
    setQuickScanStatus('Scanner ready. Click start to use the camera.', 'ready');
  } else {
    setQuickScanStatus('Barcode detection is not supported in this browser. Image OCR fallback is available.', 'warn');
  }

  if (startBtn) startBtn.addEventListener('click', startQuickScanner);
  if (stopBtn) stopBtn.addEventListener('click', stopQuickScanner);
  if (fileInput) {
    fileInput.addEventListener('change', async (event) => {
      const file = event.target.files && event.target.files[0];
      if (!file) return;
      await scanImageFile(file);
      fileInput.value = '';
    });
  }
}

async function startQuickScanner() {
  const video = document.getElementById('quickScannerVideo');
  if (!video) return;

  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    setQuickScanStatus('Camera is not available in this browser.', 'error');
    return;
  }

  try {
    quickScanStream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'environment' },
      audio: false,
    });
    video.srcObject = quickScanStream;
    await video.play();
    setQuickScanStatus('Scanning with camera...', 'active');
    loopQuickScan();
  } catch {
    setQuickScanStatus('Unable to access camera. Please allow camera permission.', 'error');
  }
}

function stopQuickScanner() {
  if (quickScanRafId) {
    cancelAnimationFrame(quickScanRafId);
    quickScanRafId = null;
  }

  if (quickScanStream) {
    quickScanStream.getTracks().forEach((track) => track.stop());
    quickScanStream = null;
  }

  const video = document.getElementById('quickScannerVideo');
  if (video) video.srcObject = null;

  setQuickScanStatus('Scanner stopped.', 'idle');
}

function loopQuickScan() {
  const video = document.getElementById('quickScannerVideo');
  if (!video || !quickScanStream) return;

  quickScanRafId = requestAnimationFrame(loopQuickScan);

  if (!quickScanDetector) return;
  if (video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) return;

  quickScanDetector.detect(video)
    .then((codes) => {
      if (!Array.isArray(codes) || !codes.length) return;
      const value = String(codes[0].rawValue || '').trim();
      if (!value) return;
      onScanDetected(value, 'camera');
      stopQuickScanner();
    })
    .catch(() => {
      // Ignore intermittent frame-detection errors from camera streams.
    });
}

async function scanImageFile(file) {
  if (quickScanDetector) {
    try {
      const bitmap = await createImageBitmap(file);
      const codes = await quickScanDetector.detect(bitmap);
      if (codes.length && codes[0].rawValue) {
        onScanDetected(String(codes[0].rawValue), 'image barcode');
        return;
      }
    } catch {
      // Continue to OCR fallback.
    }
  }

  if (window.Tesseract && typeof window.Tesseract.recognize === 'function') {
    setQuickScanStatus('Scanning image text using OCR...', 'active');
    try {
      const result = await window.Tesseract.recognize(file, 'eng');
      const text = String(result?.data?.text || '').replace(/\s+/g, ' ').trim();
      if (text) {
        onScanDetected(text.slice(0, 180), 'image OCR');
      } else {
        setQuickScanStatus('No readable text found in uploaded image.', 'warn');
      }
      return;
    } catch {
      setQuickScanStatus('Image scan failed. Please try another image.', 'error');
      return;
    }
  }

  setQuickScanStatus('No scanner capability detected for this browser.', 'error');
}

function onScanDetected(value, source) {
  const cleanValue = value.trim();
  const resultEl = document.getElementById('quickScanResult');
  if (resultEl) {
    resultEl.innerHTML = '<strong>Result:</strong> ' + escapeHtml(cleanValue);
  }

  const logs = getStoredJson(SCAN_LOGS_KEY, []);
  logs.push({
    value: cleanValue,
    source,
    at: new Date().toISOString(),
  });
  while (logs.length > 25) logs.shift();
  saveStoredJson(SCAN_LOGS_KEY, logs);

  setQuickScanStatus('Scan captured from ' + source + '.', 'ready');
  renderScanHistory();
  if (typeof showToast === 'function') showToast('Scanner captured data successfully.');
}

function renderScanHistory() {
  const historyEl = document.getElementById('quickScanHistory');
  if (!historyEl) return;

  const logs = getStoredJson(SCAN_LOGS_KEY, []);
  if (!logs.length) {
    historyEl.innerHTML = '<p class="scan-empty">No scans saved yet.</p>';
    return;
  }

  historyEl.innerHTML = logs
    .slice()
    .sort((a, b) => String(b.at).localeCompare(String(a.at)))
    .slice(0, 8)
    .map((item) => {
      const value = escapeHtml(String(item.value || '').slice(0, 90));
      const source = escapeHtml(item.source || 'unknown');
      const when = formatPrettyDate(item.at);
      return '<div class="scan-log-item">'
        + '<div><strong>' + value + '</strong><span>' + source + '</span></div>'
        + '<time>' + when + '</time>'
        + '</div>';
    })
    .join('');
}

function setQuickScanStatus(message, state) {
  const statusEl = document.getElementById('quickScanStatus');
  const pillEl = document.getElementById('quickScanPill');

  if (statusEl) statusEl.textContent = message;

  if (!pillEl) return;
  pillEl.className = 'scan-pill';
  if (state === 'active') pillEl.classList.add('is-active');
  if (state === 'warn') pillEl.classList.add('is-warn');
  if (state === 'error') pillEl.classList.add('is-error');

  if (state === 'active') pillEl.textContent = 'Scanning';
  else if (state === 'ready') pillEl.textContent = 'Ready';
  else if (state === 'warn') pillEl.textContent = 'Limited';
  else if (state === 'error') pillEl.textContent = 'Error';
  else pillEl.textContent = 'Idle';
}

function getStoredJson(key, fallbackValue) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallbackValue;
    const parsed = JSON.parse(raw);
    return parsed ?? fallbackValue;
  } catch {
    return fallbackValue;
  }
}

function saveStoredJson(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Ignore storage write errors.
  }
}

async function hashText(input) {
  if (window.crypto && window.crypto.subtle && window.TextEncoder) {
    try {
      const enc = new TextEncoder().encode(input);
      const digest = await window.crypto.subtle.digest('SHA-256', enc);
      const bytes = Array.from(new Uint8Array(digest));
      return bytes.map((b) => b.toString(16).padStart(2, '0')).join('');
    } catch {
      // Fallback below.
    }
  }

  try {
    return btoa(input);
  } catch {
    return input;
  }
}

function initialsFromName(name) {
  const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return 'GT';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

function formatPrettyDate(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '--';
  return d.toLocaleString([], {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function escapeHtml(text) {
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
