const samplesEl = document.getElementById('samples');
const galleryEl = document.getElementById('gallery');
const galleryEmpty = document.getElementById('galleryEmpty');
const quotaText = document.getElementById('quotaText');
const toastEl = document.getElementById('toast');
const tryPreview = document.getElementById('tryPreview');
const tryPlaceholder = document.getElementById('tryPlaceholder');
const tryFile = document.getElementById('tryFile');
const tryMode = document.getElementById('tryMode');
const tryStatus = document.getElementById('tryStatus');
const btnTryGenerate = document.getElementById('btnTryGenerate');
const btnCamera = document.getElementById('btnCamera');
const btnSnap = document.getElementById('btnSnap');
const btnCancelCam = document.getElementById('btnCancelCam');
const tryVideo = document.getElementById('tryVideo');
const tryCanvas = document.getElementById('tryCanvas');
const cameraActions = document.getElementById('cameraActions');

let meta = null;
let busyId = null;
let customBlob = null;
let mediaStream = null;

function toast(msg) {
  if (!toastEl) return;
  toastEl.textContent = msg;
  toastEl.hidden = false;
  clearTimeout(toast._t);
  toast._t = setTimeout(() => {
    toastEl.hidden = true;
  }, 4200);
}

function updateQuota(m) {
  if (!quotaText || !m) return;
  if (!m.apiKeyConfigured) {
    quotaText.textContent = 'Preview unavailable — contact your operator';
    return;
  }
  const left = m.generationRemaining;
  const limit = m.generationLimit;
  quotaText.textContent =
    left === 1
      ? `1 of ${limit} creations remaining`
      : `${left} of ${limit} creations remaining`;
}

function renderGallery(items) {
  if (!galleryEl) return;
  const list = Array.isArray(items) ? items : [];
  galleryEl.querySelectorAll('a').forEach((n) => n.remove());
  if (galleryEmpty) galleryEmpty.hidden = list.length > 0;
  for (const item of list) {
    const a = document.createElement('a');
    a.href = item.url;
    a.target = '_blank';
    a.rel = 'noopener';
    a.title = `${item.sampleId} · ${item.createdAt || ''}`;
    const img = document.createElement('img');
    img.src = `${item.url}?t=${Date.parse(item.createdAt || '') || Date.now()}`;
    img.alt = `Generated ${item.sampleId}`;
    img.loading = 'lazy';
    a.appendChild(img);
    galleryEl.appendChild(a);
  }
}

function renderSamples(samples) {
  if (!samplesEl) return;
  samplesEl.innerHTML = '';
  for (const s of samples) {
    const aspect = s.id === 'portrait' ? 'portrait' : 'scene';
    const card = document.createElement('article');
    card.className = 'sample-card';
    card.dataset.sampleId = s.id;
    card.innerHTML = `
      <header>
        <div>
          <h2>${s.title}</h2>
          <p class="sub">${s.subtitle}</p>
        </div>
      </header>
      <div class="compare">
        <figure class="shot ${aspect}">
          <img src="${s.originalUrl}" alt="${s.title} original" />
          <figcaption class="label">Guest photo</figcaption>
        </figure>
        <figure class="shot ${aspect}">
          <img class="ai-img" src="${s.aiUrl}" alt="${s.title} AI result" />
          <figcaption class="label">Finished print</figcaption>
        </figure>
      </div>
    `;
    samplesEl.appendChild(card);
  }
}

async function loadMeta({ refreshSamples = true } = {}) {
  const r = await fetch(`/api/halloween/meta?t=${Date.now()}`);
  const data = await r.json();
  if (!data?.ok) throw new Error(data?.error || 'Failed to load demo');
  meta = data;
  updateQuota(data);
  if (refreshSamples) renderSamples(data.samples || []);
  renderGallery(data.gallery || []);
  return data;
}

function setCustomPreview(blob) {
  customBlob = blob;
  if (!blob) {
    if (tryPreview) {
      tryPreview.removeAttribute('src');
      tryPreview.hidden = true;
    }
    if (tryPlaceholder) tryPlaceholder.hidden = false;
    if (btnTryGenerate) btnTryGenerate.disabled = true;
    return;
  }
  const url = URL.createObjectURL(blob);
  if (tryPreview) {
    tryPreview.onload = () => URL.revokeObjectURL(url);
    tryPreview.src = url;
    tryPreview.hidden = false;
  }
  if (tryPlaceholder) tryPlaceholder.hidden = true;
  if (btnTryGenerate) btnTryGenerate.disabled = false;
}

async function stopCamera() {
  if (mediaStream) {
    for (const t of mediaStream.getTracks()) t.stop();
    mediaStream = null;
  }
  if (tryVideo) {
    tryVideo.srcObject = null;
    tryVideo.hidden = true;
  }
  if (cameraActions) cameraActions.hidden = true;
}

async function generateCustom() {
  if (busyId || !customBlob) return;
  const mode = tryMode?.value === 'scene' ? 'scene' : 'portrait';
  busyId = 'custom';
  if (btnTryGenerate) btnTryGenerate.disabled = true;
  if (tryStatus) tryStatus.textContent = 'Creating your print… please wait';

  try {
    const fd = new FormData();
    fd.append('mode', mode);
    fd.append('photo', customBlob, 'guest.jpg');
    const r = await fetch('/api/halloween/generate-upload', {
      method: 'POST',
      body: fd,
    });
    const data = await r.json();
    if (!data?.ok) {
      throw new Error(data?.error || `Create failed (${r.status})`);
    }
    if (tryStatus) {
      tryStatus.textContent =
        data.remaining === 1
          ? 'Complete · 1 creation remaining'
          : `Complete · ${data.remaining} creations remaining`;
    }
    toast('Your print was added to Your creations');
    await loadMeta({ refreshSamples: false });
  } catch (err) {
    if (tryStatus) tryStatus.textContent = String(err.message || err);
    toast(String(err.message || err));
  } finally {
    busyId = null;
    if (btnTryGenerate) btnTryGenerate.disabled = !customBlob;
  }
}

tryFile?.addEventListener('change', async () => {
  await stopCamera();
  const file = tryFile.files?.[0];
  if (!file) return;
  setCustomPreview(file);
  if (tryStatus) {
    tryStatus.textContent = 'Photo ready — choose an experience, then create your print.';
  }
});

btnCamera?.addEventListener('click', async () => {
  try {
    await stopCamera();
    mediaStream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 960 } },
      audio: false,
    });
    if (tryVideo) {
      tryVideo.srcObject = mediaStream;
      tryVideo.hidden = false;
    }
    if (cameraActions) cameraActions.hidden = false;
    if (tryStatus) {
      tryStatus.textContent = 'Position waist-up in frame, then take your photo.';
    }
  } catch (err) {
    toast(String(err.message || err));
    if (tryStatus) tryStatus.textContent = 'Camera access was declined or is unavailable.';
  }
});

btnSnap?.addEventListener('click', async () => {
  if (!tryVideo || !tryCanvas || !mediaStream) return;
  const w = tryVideo.videoWidth || 1280;
  const h = tryVideo.videoHeight || 960;
  tryCanvas.width = w;
  tryCanvas.height = h;
  const ctx = tryCanvas.getContext('2d');
  ctx.drawImage(tryVideo, 0, 0, w, h);
  const blob = await new Promise((resolve) => tryCanvas.toBlob(resolve, 'image/jpeg', 0.92));
  await stopCamera();
  if (blob) {
    setCustomPreview(blob);
    if (tryStatus) {
      tryStatus.textContent = 'Photo captured — create your print when ready.';
    }
  }
});

btnCancelCam?.addEventListener('click', () => {
  void stopCamera();
  if (tryStatus) tryStatus.textContent = '';
});

btnTryGenerate?.addEventListener('click', () => {
  void generateCustom();
});

loadMeta().catch((err) => {
  if (quotaText) quotaText.textContent = String(err.message || err);
  toast(String(err.message || err));
});

function halloweenVisitorId() {
  const key = 'hauntbooth_visitor_id';
  try {
    let id = localStorage.getItem(key);
    if (!id) {
      id =
        typeof crypto !== 'undefined' && crypto.randomUUID
          ? crypto.randomUUID()
          : `v-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
      localStorage.setItem(key, id);
    }
    return id;
  } catch {
    return `anon-${Date.now()}`;
  }
}

async function reportHalloweenVisit() {
  try {
    const params = new URLSearchParams(window.location.search || '');
    await fetch('/api/halloween/visit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        visitorId: halloweenVisitorId(),
        utmSource: params.get('utm_source') || '',
        utmMedium: params.get('utm_medium') || '',
        utmCampaign: params.get('utm_campaign') || '',
        referrer: document.referrer || '',
        landing: `${window.location.pathname}${window.location.search || ''}`,
      }),
      keepalive: true,
    });
  } catch {
    /* analytics must never block the demo */
  }
}

void reportHalloweenVisit();
