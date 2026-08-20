const video = document.getElementById('video');
const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d', { willReadFrequently: true });
const eventSelect = document.getElementById('eventSelect');
const statusChip = document.getElementById('statusChip');
const offlineBanner = document.getElementById('offlineBanner');
const soundToggle = document.getElementById('soundToggle');
const cameraHint = document.getElementById('cameraHint');
const cameraStatus = document.getElementById('cameraStatus');
const homePanel = document.getElementById('homePanel');
const scanPanel = document.getElementById('scanPanel');
const resultPanel = document.getElementById('resultPanel');
const resultCard = document.getElementById('resultCard');
const resultTitle = document.getElementById('resultTitle');
const resultDetail = document.getElementById('resultDetail');
const btnScan = document.getElementById('btnScan');
const btnCancelScan = document.getElementById('btnCancelScan');
const btnScanAgain = document.getElementById('btnScanAgain');
const btnHome = document.getElementById('btnHome');

let selectedBatchId = new URLSearchParams(location.search).get('batch') || '';
let stream = null;
let raf = 0;
let mode = 'home'; // home | scanning | result
let submitting = false;

function beep(ok) {
  if (!soundToggle?.checked) return;
  try {
    const ac = new (window.AudioContext || window.webkitAudioContext)();
    const o = ac.createOscillator();
    const g = ac.createGain();
    o.connect(g);
    g.connect(ac.destination);
    o.frequency.value = ok ? 880 : 220;
    g.gain.value = 0.05;
    o.start();
    setTimeout(() => {
      o.stop();
      ac.close();
    }, ok ? 120 : 220);
  } catch {
    /* ignore */
  }
}

function extractCode(raw) {
  const s = String(raw || '').trim();
  if (!s) return '';
  const m = s.match(/\/q\/([A-Za-z0-9_-]+)/);
  if (m) return m[1];
  try {
    const u = new URL(s);
    const parts = u.pathname.split('/').filter(Boolean);
    const i = parts.indexOf('q');
    if (i >= 0 && parts[i + 1]) return decodeURIComponent(parts[i + 1]);
  } catch {
    /* plain */
  }
  return s.replace(/[^A-Za-z0-9_-]/g, '');
}

function formatCardSerial(serial, quantity) {
  if (serial == null || serial === '') return '';
  const n = `#${String(serial).padStart(3, '0')}`;
  return quantity ? `${n} / ${quantity}` : n;
}

function applyLive(data) {
  const ev = data.event;
  statusChip.textContent = ev ? 'Active' : 'No active event';
  statusChip.classList.toggle('is-off', !ev);

  const events = data.activeEvents || [];
  const prev = selectedBatchId;
  eventSelect.innerHTML = '';
  if (!events.length) {
    const opt = document.createElement('option');
    opt.value = '';
    opt.textContent = 'No active event';
    eventSelect.appendChild(opt);
  } else {
    for (const e of events) {
      const opt = document.createElement('option');
      opt.value = e.id;
      opt.textContent = e.eventLabel ? `${e.name} · ${e.eventLabel}` : e.name;
      eventSelect.appendChild(opt);
    }
    if (!prev || !events.some((e) => e.id === prev)) {
      selectedBatchId = ev?.id || events[0].id;
    }
    eventSelect.value = selectedBatchId;
  }

  document.getElementById('statScanned').textContent = String(data.scanned ?? 0);
  document.getElementById('statRemaining').textContent = String(data.remaining ?? 0);
  document.getElementById('statTotal').textContent = String(data.total ?? 0);
  document.getElementById('statLinked').textContent = String(data.linked ?? 0);
  const pct = data.total ? Math.min(100, Math.round((data.scanned / data.total) * 100)) : 0;
  document.getElementById('progressFill').style.width = `${pct}%`;

  const list = document.getElementById('recentList');
  list.innerHTML = '';
  const qty = data.total || data.quantity || null;
  for (const r of data.recent || []) {
    const li = document.createElement('li');
    const when = r.scannedAt ? new Date(r.scannedAt).toLocaleTimeString() : '';
    const cls = r.result === 'valid' ? 'ok' : 'bad';
    const label = formatCardSerial(r.serial, qty) || '—';
    li.innerHTML = `<span>${label}</span><span class="${cls}">${r.result} · ${when}</span>`;
    list.appendChild(li);
  }
}

async function refreshLive() {
  offlineBanner.hidden = navigator.onLine;
  try {
    const q = selectedBatchId ? `?batchId=${encodeURIComponent(selectedBatchId)}` : '';
    const res = await fetch(`/api/qr/live${q}`);
    const data = await res.json();
    applyLive(data);
  } catch {
    offlineBanner.hidden = false;
  }
}

function stopCamera() {
  if (raf) {
    cancelAnimationFrame(raf);
    raf = 0;
  }
  if (stream) {
    for (const t of stream.getTracks()) t.stop();
    stream = null;
  }
  video.srcObject = null;
  submitting = false;
}

function setMode(next) {
  mode = next;
  document.body.dataset.mode = next;
  homePanel.hidden = next !== 'home';
  scanPanel.hidden = next !== 'scanning';
  resultPanel.hidden = next !== 'result';
  if (next !== 'scanning') stopCamera();
}

function showResult(kind, title, detail) {
  stopCamera();
  resultCard.className = `result-card ${kind === 'valid' ? 'is-valid' : 'is-invalid'}`;
  resultTitle.textContent = title;
  resultDetail.textContent = detail || '';
  beep(kind === 'valid');
  setMode('result');
}

async function submitCode(code) {
  if (submitting || mode !== 'scanning') return;
  submitting = true;
  if (cameraStatus) cameraStatus.textContent = 'Checking…';

  try {
    const res = await fetch('/api/qr/scan', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code }),
    });
    const data = await res.json();

    if (data.event?.id) {
      selectedBatchId = data.event.id;
      const url = new URL(location.href);
      url.searchParams.set('batch', selectedBatchId);
      history.replaceState(null, '', url);
    }
    await refreshLive();

    const cardLabel = formatCardSerial(data.serial, data.quantity || data.stats?.total);
    if (data.result === 'valid') {
      showResult('valid', cardLabel || 'Valid', 'OK to shoot');
    } else if (data.result === 'already') {
      const t = data.scannedAt ? new Date(data.scannedAt).toLocaleString() : '';
      showResult(
        'invalid',
        cardLabel ? `Already · ${cardLabel}` : 'Already scanned',
        t ? `First scanned at ${t}` : 'This card was already used',
      );
    } else if (data.result === 'inactive') {
      showResult('invalid', cardLabel || 'Inactive', 'This event or card is not active');
    } else {
      showResult('invalid', 'Unknown', 'Card not recognized');
    }
  } catch {
    offlineBanner.hidden = false;
    showResult('invalid', 'Network error', 'Check connection, then scan again');
  }
}

function tickDetect() {
  if (mode !== 'scanning' || submitting) return;
  if (video.readyState >= 2) {
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const image = ctx.getImageData(0, 0, canvas.width, canvas.height);
    if (typeof jsQR === 'function') {
      const code = jsQR(image.data, image.width, image.height, { inversionAttempts: 'dontInvert' });
      if (code?.data) {
        const extracted = extractCode(code.data);
        if (extracted) {
          void submitCode(extracted);
          return;
        }
      }
    }
  }
  raf = requestAnimationFrame(tickDetect);
}

function cameraErrorMessage(err) {
  const name = err?.name || '';
  if (!window.isSecureContext) {
    return 'Camera needs HTTPS. Open this page with https://, accept the certificate once, then tap Scan card.';
  }
  if (name === 'NotAllowedError' || name === 'PermissionDeniedError') {
    return 'Camera permission denied. Allow camera for this site in phone settings, then try again.';
  }
  if (name === 'NotFoundError' || name === 'DevicesNotFoundError') {
    return 'No camera found on this device.';
  }
  if (name === 'NotReadableError' || name === 'TrackStartError') {
    return 'Camera is in use by another app. Close it and try again.';
  }
  return err?.message ? `Camera error: ${err.message}` : 'Could not open camera.';
}

async function startScanning() {
  if (!window.isSecureContext) {
    showResult('invalid', 'HTTPS required', cameraErrorMessage({ name: 'SecurityError' }));
    return;
  }
  if (!navigator.mediaDevices?.getUserMedia) {
    showResult('invalid', 'No camera', 'Try Chrome or Safari on this device.');
    return;
  }

  btnScan.disabled = true;
  btnScanAgain.disabled = true;
  setMode('scanning');
  if (cameraStatus) cameraStatus.textContent = 'Starting camera…';
  cameraHint.textContent = 'Allow camera if asked, then point at the card';

  try {
    stopCamera();
    submitting = false;

    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: {
          facingMode: { ideal: 'environment' },
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
      });
    } catch {
      stream = await navigator.mediaDevices.getUserMedia({ audio: false, video: true });
    }

    video.srcObject = stream;
    video.setAttribute('playsinline', 'true');
    video.muted = true;
    await video.play();

    if (cameraStatus) cameraStatus.textContent = 'Looking for QR…';
    cameraHint.textContent = 'Hold steady on one card';
    raf = requestAnimationFrame(tickDetect);
  } catch (err) {
    console.warn('[qr-scan] camera', err);
    showResult('invalid', 'Camera blocked', cameraErrorMessage(err));
  } finally {
    btnScan.disabled = false;
    btnScanAgain.disabled = false;
  }
}

function goHome() {
  stopCamera();
  setMode('home');
  void refreshLive();
}

btnScan.addEventListener('click', () => {
  void startScanning();
});
btnScanAgain.addEventListener('click', () => {
  void startScanning();
});
btnCancelScan.addEventListener('click', () => {
  goHome();
});
btnHome.addEventListener('click', () => {
  goHome();
});

eventSelect.addEventListener('change', () => {
  selectedBatchId = eventSelect.value;
  const url = new URL(location.href);
  if (selectedBatchId) url.searchParams.set('batch', selectedBatchId);
  else url.searchParams.delete('batch');
  history.replaceState(null, '', url);
  void refreshLive();
});

window.addEventListener('online', () => {
  offlineBanner.hidden = true;
  void refreshLive();
});
window.addEventListener('offline', () => {
  offlineBanner.hidden = false;
});

window.addEventListener('pagehide', () => {
  stopCamera();
});

setMode('home');
refreshLive();
setInterval(() => {
  if (mode === 'home' || mode === 'result') void refreshLive();
}, 4000);
