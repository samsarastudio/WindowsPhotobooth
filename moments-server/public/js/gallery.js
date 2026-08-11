function parseRoute() {
  const parts = location.pathname.replace(/^\/+|\/+$/g, '').split('/').filter(Boolean);
  const q = new URLSearchParams(location.search);
  const viewQ = q.get('view');

  if (parts[0] === 'admin') return { kind: 'admin' };
  if (parts.length === 0) {
    if (viewQ === 'wall' || viewQ === 'mosaic') return { kind: 'wall', mode: 'mosaic' };
    if (viewQ === 'slideshow') return { kind: 'wall', mode: 'slideshow' };
    return { kind: 'home' };
  }
  if (parts[0] === 'wall') {
    const mode = parts[1] === 'slideshow' || viewQ === 'slideshow' ? 'slideshow' : 'mosaic';
    return { kind: 'wall', mode };
  }
  if (parts.length >= 3 && parts[1] === 'p') {
    return { kind: 'photo', slug: parts[0], photoId: parts[2], mode: 'grid' };
  }
  if (parts.length >= 2 && (parts[1] === 'wall' || parts[1] === 'mosaic')) {
    return { kind: 'session', slug: parts[0], mode: 'mosaic' };
  }
  if (parts.length >= 2 && parts[1] === 'slideshow') {
    return { kind: 'session', slug: parts[0], mode: 'slideshow' };
  }
  if (viewQ === 'wall' || viewQ === 'mosaic') {
    return { kind: 'session', slug: parts[0], mode: 'mosaic' };
  }
  if (viewQ === 'slideshow') {
    return { kind: 'session', slug: parts[0], mode: 'slideshow' };
  }
  return { kind: 'session', slug: parts[0], mode: 'grid' };
}

const els = {
  title: document.getElementById('sessionTitle'),
  meta: document.getElementById('sessionMeta'),
  status: document.getElementById('status'),
  empty: document.getElementById('empty'),
  grid: document.getElementById('grid'),
  guestPhoto: document.getElementById('guestPhoto'),
  guestPhotoImg: document.getElementById('guestPhotoImg'),
  guestPhotoDownload: document.getElementById('guestPhotoDownload'),
  mosaic: document.getElementById('mosaic'),
  mosaicStage: document.getElementById('mosaicStage'),
  wallOverlay: document.getElementById('wallOverlay'),
  mosaicPartner: document.getElementById('mosaicPartner'),
  mosaicPartnerLogo: document.getElementById('mosaicPartnerLogo'),
  mosaicPartnerText: document.getElementById('mosaicPartnerText'),
  lightbox: document.getElementById('lightbox'),
  lbImg: document.getElementById('lbImg'),
  lbVariant: document.getElementById('lbVariant'),
  lbDownload: document.getElementById('lbDownload'),
  slideshow: document.getElementById('slideshow'),
  ssImg: document.getElementById('ssImg'),
  ssToggle: document.getElementById('ssToggle'),
  topBar: document.getElementById('topBar'),
};

/** @type {any[]} */
let photos = [];
/** @type {{ el: HTMLElement, photoId: string | null, size: number, x: number, y: number }[]} */
let mosaicSlots = [];
/** @type {Map<string, number>} photoId -> slot index */
const mosaicPhotoSlot = new Map();
/** Round-robin index for rotating unseen photos into view */
let mosaicRotateCursor = 0;
let index = 0;
let es = null;
let ssTimer = null;
let ssPlaying = false;
let viewMode = 'grid';
let wallCfg = {
  title: 'Wall of moments',
  overlay: '',
  columns: 16,
  emptyRatio: 0.22,
  brandText: '',
  brandLogoUrl: '',
  mosaicTargetUrl: '',
};
let route = parseRoute();
let mosaicShineTimer = null;
let mosaicRotateTimer = null;
let mosaicDriftTimer = null;
/** 6×4 postcard — width/height */
const MOSAIC_CELL_ASPECT = 6 / 4;

function setStatus(msg, show = true) {
  els.status.hidden = !show;
  els.status.textContent = msg || '';
}

function pathForMode(mode) {
  if (route.kind === 'wall') {
    return mode === 'slideshow' ? '/wall/slideshow' : '/wall';
  }
  const slug = route.slug;
  if (!slug) return '/';
  if (mode === 'mosaic') return `/${encodeURIComponent(slug)}/wall`;
  if (mode === 'slideshow') return `/${encodeURIComponent(slug)}/slideshow`;
  return `/${encodeURIComponent(slug)}`;
}

function setMode(mode, push = true) {
  viewMode = mode;
  const immersive = mode === 'mosaic';
  const guestOnly = mode === 'photo';
  document.body.classList.toggle('is-mosaic', immersive);
  document.body.classList.toggle('is-guest-photo', guestOnly);
  document.body.classList.toggle('is-slideshow-route', mode === 'slideshow');
  if (els.topBar) els.topBar.hidden = immersive;
  els.grid.hidden = mode !== 'grid';
  if (els.guestPhoto) els.guestPhoto.hidden = mode !== 'photo';
  els.mosaic.hidden = mode !== 'mosaic';
  if (mode === 'grid') {
    els.empty.hidden = photos.length > 0;
    renderGrid();
  }
  if (mode === 'photo') {
    els.empty.hidden = true;
    renderGuestPhoto();
  }
  if (mode === 'mosaic') {
    els.empty.hidden = true;
    void renderMosaic(true);
    startMosaicLoops();
  } else {
    stopMosaicLoops();
  }
  if (mode === 'slideshow') {
    if (photos.length) openSlideshow();
  } else if (!els.slideshow.hidden) {
    stopSs();
    els.slideshow.hidden = true;
  }
  if (push && route.kind !== 'home' && route.kind !== 'photo') {
    history.replaceState(null, '', pathForMode(mode));
  }
}

function renderGrid() {
  els.grid.innerHTML = '';
  els.empty.hidden = photos.length > 0 || viewMode !== 'grid';
  for (const photo of photos) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'card-photo';
    btn.dataset.id = photo.id;
    btn.innerHTML = `<img src="${photo.url}" alt="" loading="lazy" /><span class="badge">${photo.variant}</span>`;
    btn.addEventListener('click', () => openLightbox(photos.findIndex((p) => p.id === photo.id)));
    els.grid.appendChild(btn);
  }
}

/** QR share link — only the guest’s photo, no album grid. */
function renderGuestPhoto() {
  if (!els.guestPhotoImg) return;
  const photo = photos[0] || null;
  if (!photo) {
    els.guestPhotoImg.removeAttribute('src');
    if (els.guestPhotoDownload) {
      els.guestPhotoDownload.removeAttribute('href');
    }
    setStatus('Photo not found or no longer available.');
    return;
  }
  setStatus('', false);
  els.guestPhotoImg.src = photo.url;
  els.title.textContent = 'Your photo';
  els.meta.textContent = photo.variant || '';
  if (els.guestPhotoDownload) {
    els.guestPhotoDownload.href = photo.url;
    els.guestPhotoDownload.download = `${photo.id}-${photo.variant || 'photo'}.jpg`;
  }
}

function seededRandom(seed) {
  let s = seed % 2147483647;
  if (s <= 0) s += 2147483646;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

function mosaicSlotCount() {
  const stageW = els.mosaicStage?.clientWidth || window.innerWidth || 1200;
  const stageH = els.mosaicStage?.clientHeight || window.innerHeight || 800;
  const area = stageW * stageH;
  // Soft collage density — not a packed grid
  return Math.min(18, Math.max(8, Math.round(area / 90000)));
}

function mosaicSizeScale(rand) {
  const roll = rand();
  if (roll < 0.18) return 1.45; // larger hero cards
  if (roll < 0.55) return 1.1;
  if (roll < 0.85) return 0.9;
  return 0.72;
}

function layoutMosaicSlots(count) {
  const stageW = Math.max(320, els.mosaicStage?.clientWidth || 1200);
  const stageH = Math.max(240, els.mosaicStage?.clientHeight || 800);
  const base = Math.min(stageW * 0.2, stageH * 0.28, 220);
  const rand = seededRandom(count * 97 + Math.round(stageW + stageH));
  const slots = [];
  const pad = 16;

  for (let i = 0; i < count; i++) {
    const scale = mosaicSizeScale(rand);
    const size = Math.max(110, base * scale);
    const h = size / MOSAIC_CELL_ASPECT;
    let x = pad + rand() * Math.max(1, stageW - size - pad * 2);
    let y = pad + rand() * Math.max(1, stageH - h - pad * 2);
    for (let attempt = 0; attempt < 12; attempt++) {
      let crowded = false;
      for (const s of slots) {
        const dx = x + size / 2 - (s.x + s.size / 2);
        const dy = y + h / 2 - (s.y + s.size / MOSAIC_CELL_ASPECT / 2);
        if (Math.hypot(dx, dy) < Math.min(size, s.size) * 0.62) {
          crowded = true;
          break;
        }
      }
      if (!crowded) break;
      x = pad + rand() * Math.max(1, stageW - size - pad * 2);
      y = pad + rand() * Math.max(1, stageH - h - pad * 2);
    }
    slots.push({
      x,
      y,
      size,
      rot: (rand() - 0.5) * 5,
      floatDur: 7 + rand() * 6,
      floatDelay: -rand() * 5,
      scanDelay: rand() * 3,
    });
  }
  return slots;
}

function updateMosaicBranding() {
  if (els.wallOverlay) {
    if (wallCfg.overlay) {
      els.wallOverlay.hidden = false;
      els.wallOverlay.textContent = wallCfg.overlay;
    } else {
      els.wallOverlay.hidden = true;
    }
  }
  const text = (wallCfg.brandText || '').trim();
  const logoUrl = (wallCfg.brandLogoUrl || '').trim();
  const partner = els.mosaicPartner;
  const logoEl = els.mosaicPartnerLogo;
  const textEl = els.mosaicPartnerText;
  if (!partner) return;
  const hasPartner = !!(text || logoUrl);
  partner.hidden = !hasPartner;
  if (logoEl) {
    if (logoUrl) {
      logoEl.hidden = false;
      logoEl.src = logoUrl;
      logoEl.alt = text || 'Partner brand';
    } else {
      logoEl.hidden = true;
      logoEl.removeAttribute('src');
    }
  }
  if (textEl) {
    if (text) {
      textEl.hidden = false;
      textEl.textContent = text;
    } else {
      textEl.hidden = true;
      textEl.textContent = '';
    }
  }
}

function applySlotTransform(slot, animatePos = true) {
  if (!slot?.el) return;
  if (!animatePos) slot.el.style.transition = 'none';
  slot.el.style.setProperty('--sz', slot.size + 'px');
  slot.el.style.setProperty('--rot', slot.rot + 'deg');
  slot.el.style.setProperty('--mx', slot.x + 'px');
  slot.el.style.setProperty('--my', slot.y + 'px');
  slot.el.style.setProperty('--float-dur', slot.floatDur + 's');
  slot.el.style.setProperty('--float-delay', slot.floatDelay + 's');
  slot.el.style.setProperty('--scan-delay', slot.scanDelay + 's');
  if (!animatePos) {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        slot.el.style.transition = '';
      });
    });
  }
}

function clearMosaicSlot(slot) {
  if (!slot?.el) return;
  if (slot.photoId) mosaicPhotoSlot.delete(slot.photoId);
  slot.photoId = null;
  slot.el.classList.remove('is-filled', 'is-shine');
  slot.el.classList.add('is-empty');
  const img = slot.el.querySelector('.mosaic-slot-photo');
  if (img) {
    img.removeAttribute('src');
    img.alt = '';
  }
  slot.el.onclick = null;
}

function fillMosaicSlot(slotIndex, photo, opts = {}) {
  const slot = mosaicSlots[slotIndex];
  if (!slot || !photo?.id) return;
  if (slot.photoId && mosaicPhotoSlot.get(slot.photoId) === slotIndex) {
    mosaicPhotoSlot.delete(slot.photoId);
  }
  const prev = mosaicPhotoSlot.get(photo.id);
  if (prev != null && prev !== slotIndex && mosaicSlots[prev]) {
    clearMosaicSlot(mosaicSlots[prev]);
  }
  slot.photoId = photo.id;
  mosaicPhotoSlot.set(photo.id, slotIndex);
  slot.el.classList.remove('is-empty');
  slot.el.classList.add('is-filled');
  const img = slot.el.querySelector('.mosaic-slot-photo');
  if (img) {
    img.src = photo.url;
    img.alt = '';
  }
  if (opts.shine !== false) {
    slot.el.classList.remove('is-shine');
    void slot.el.offsetWidth;
    slot.el.classList.add('is-shine');
    setTimeout(() => slot.el.classList.remove('is-shine'), 1100);
  }
  slot.el.onclick = () => {
    const i = photos.findIndex((p) => p.id === photo.id);
    if (i >= 0) openLightbox(i);
  };
}

function mosaicFillCap() {
  // Keep at most a couple of glass placeholders for “expecting photo” feel
  const reserve = mosaicSlots.length >= 10 ? 2 : mosaicSlots.length >= 6 ? 1 : 0;
  return Math.max(1, mosaicSlots.length - reserve);
}

function pickEmptySlot() {
  const empty = mosaicSlots.map((s, i) => ({ s, i })).filter((x) => !x.s.photoId);
  if (!empty.length) return -1;
  return empty[Math.floor(Math.random() * empty.length)].i;
}

function placePhotoInMosaic(photo, opts = {}) {
  if (!photo?.id || viewMode !== 'mosaic') return;
  if (mosaicPhotoSlot.has(photo.id) && !opts.force) {
    const idx = mosaicPhotoSlot.get(photo.id);
    const img = mosaicSlots[idx]?.el?.querySelector('.mosaic-slot-photo');
    if (img && photo.url) img.src = photo.url;
    return;
  }
  // Always fill an empty glass slot first — never replace when empties remain.
  const empty = pickEmptySlot();
  if (empty >= 0 && !opts.force) {
    fillMosaicSlot(empty, photo, opts);
    return;
  }
  if (empty >= 0 && opts.force && mosaicPhotoSlot.size < mosaicSlots.length) {
    fillMosaicSlot(empty, photo, opts);
    return;
  }
  if (!opts.force) {
    // Soft place with no empties left (at visual cap) — wait for rotation.
    if (mosaicPhotoSlot.size >= mosaicFillCap()) return;
    if (empty >= 0) {
      fillMosaicSlot(empty, photo, opts);
    }
    return;
  }
  // Forced swap: replace a random filled slot so unseen photos can appear.
  const filled = mosaicSlots.map((s, i) => ({ s, i })).filter((x) => x.s.photoId);
  if (!filled.length) {
    if (empty >= 0) fillMosaicSlot(empty, photo, opts);
    return;
  }
  const idx = filled[Math.floor(Math.random() * filled.length)].i;
  fillMosaicSlot(idx, photo, opts);
}

function buildMosaicCollage() {
  if (!els.mosaicStage) return;
  updateMosaicBranding();
  const count = mosaicSlotCount();
  const layouts = layoutMosaicSlots(count);

  els.mosaicStage.innerHTML = '';
  mosaicSlots = [];
  mosaicPhotoSlot.clear();
  mosaicRotateCursor = 0;

  const scan = document.createElement('div');
  scan.className = 'mosaic-scan';
  scan.setAttribute('aria-hidden', 'true');
  els.mosaicStage.appendChild(scan);

  layouts.forEach((layout, i) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'mosaic-slot is-empty';
    btn.dataset.slot = String(i);
    btn.innerHTML =
      '<span class="mosaic-slot-card"><img class="mosaic-slot-photo" alt="" decoding="async" /><span class="mosaic-slot-shine" aria-hidden="true"></span></span>';
    const slot = {
      el: btn,
      photoId: null,
      size: layout.size,
      x: layout.x,
      y: layout.y,
      rot: layout.rot,
      floatDur: layout.floatDur,
      floatDelay: layout.floatDelay,
      scanDelay: layout.scanDelay,
    };
    applySlotTransform(slot, false);
    els.mosaicStage.appendChild(btn);
    mosaicSlots.push(slot);
  });
}

function renderMosaic(fullRebuild = false) {
  if (!els.mosaicStage) return;
  if (fullRebuild || !mosaicSlots.length) {
    buildMosaicCollage();
    const order = [...photos];
    const rand = seededRandom(order.length * 97 + mosaicSlots.length * 13);
    for (let i = order.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      [order[i], order[j]] = [order[j], order[i]];
    }
    // Fill up to cap; extras wait for rotation so guests still see theirs
    order.slice(0, mosaicFillCap()).forEach((photo, i) => {
      setTimeout(() => {
        if (viewMode !== 'mosaic') return;
        placePhotoInMosaic(photo, { shine: true });
      }, Math.min(i * 70, 2000));
    });
    return;
  }
  for (const photo of photos) {
    if (mosaicPhotoSlot.size >= mosaicFillCap()) break;
    if (!mosaicPhotoSlot.has(photo.id)) placePhotoInMosaic(photo, { shine: true });
  }
}

function shineRandomMosaicTile() {
  if (viewMode !== 'mosaic') return;
  const filled = mosaicSlots.filter((s) => s.photoId);
  if (!filled.length) return;
  const slot = filled[Math.floor(Math.random() * filled.length)];
  slot.el.classList.remove('is-shine');
  void slot.el.offsetWidth;
  slot.el.classList.add('is-shine');
  setTimeout(() => slot.el.classList.remove('is-shine'), 1100);
}

function rotateMosaicPhotos() {
  if (viewMode !== 'mosaic' || !mosaicSlots.length || photos.length < 2) return;

  // 1) Fill any empty slots with photos not yet on the wall
  const visible = new Set([...mosaicPhotoSlot.keys()]);
  const unseen = photos.filter((p) => !visible.has(p.id));
  const emptyIdxs = mosaicSlots.map((s, i) => (!s.photoId ? i : -1)).filter((i) => i >= 0);
  let filledEmpties = 0;
  for (const photo of unseen) {
    if (filledEmpties >= emptyIdxs.length) break;
    if (mosaicPhotoSlot.size >= mosaicFillCap() && emptyIdxs.length - filledEmpties <= 0) break;
    placePhotoInMosaic(photo, { shine: true, force: false });
    filledEmpties++;
  }

  // 2) Occasionally swap so guests keep seeing different photos
  if (photos.length <= mosaicPhotoSlot.size) return;
  const stillUnseen = photos.filter((p) => !mosaicPhotoSlot.has(p.id));
  const pool = stillUnseen.length ? stillUnseen : photos;
  const take = Math.min(2, pool.length, Math.max(1, mosaicPhotoSlot.size));
  for (let n = 0; n < take; n++) {
    const photo = pool[(mosaicRotateCursor + n) % pool.length];
    setTimeout(() => placePhotoInMosaic(photo, { force: true, shine: true }), n * 220);
  }
  mosaicRotateCursor = (mosaicRotateCursor + take) % pool.length;
}

function driftMosaicSlots() {
  if (viewMode !== 'mosaic' || mosaicSlots.length < 2) return;
  const stageW = els.mosaicStage?.clientWidth || 1200;
  const stageH = els.mosaicStage?.clientHeight || 800;
  const pad = 14;
  // Nudge a few slots for living collage motion
  const idxs = mosaicSlots
    .map((_, i) => i)
    .sort(() => Math.random() - 0.5)
    .slice(0, Math.ceil(mosaicSlots.length * 0.3));
  idxs.forEach((i) => {
    const slot = mosaicSlots[i];
    const h = slot.size / MOSAIC_CELL_ASPECT;
    slot.x = Math.min(stageW - slot.size - pad, Math.max(pad, slot.x + (Math.random() - 0.5) * 36));
    slot.y = Math.min(stageH - h - pad, Math.max(pad, slot.y + (Math.random() - 0.5) * 28));
    slot.rot = Math.max(-4, Math.min(4, slot.rot + (Math.random() - 0.5) * 1.5));
    applySlotTransform(slot, true);
  });
}

function startMosaicLoops() {
  stopMosaicLoops();
  mosaicShineTimer = setInterval(shineRandomMosaicTile, 3800);
  mosaicRotateTimer = setInterval(rotateMosaicPhotos, 12000);
  mosaicDriftTimer = setInterval(driftMosaicSlots, 9000);
}

function stopMosaicLoops() {
  if (mosaicShineTimer) clearInterval(mosaicShineTimer);
  if (mosaicRotateTimer) clearInterval(mosaicRotateTimer);
  if (mosaicDriftTimer) clearInterval(mosaicDriftTimer);
  mosaicShineTimer = null;
  mosaicRotateTimer = null;
  mosaicDriftTimer = null;
}

function upsertPhoto(photo) {
  if (!photo?.id || photo.variant === 'original') return;
  // Guest QR view stays locked to that one photo.
  if (route.kind === 'photo') {
    if (photo.id !== route.photoId) return;
    photos = [photo];
    if (viewMode === 'photo') renderGuestPhoto();
    return;
  }
  const i = photos.findIndex((p) => p.id === photo.id);
  const isNew = i < 0;
  if (i >= 0) photos[i] = photo;
  else photos.push(photo);
  photos.sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)));
  if (viewMode === 'grid') renderGrid();
  else if (viewMode === 'mosaic') {
    // Never force-replace on arrival — fill empty glass slots first.
    placePhotoInMosaic(photo, { shine: isNew, force: false });
  }
  if (els.meta) els.meta.textContent = photos.length + ' photos';
}

function openLightbox(i) {
  if (i < 0 || i >= photos.length) return;
  index = i;
  const photo = photos[index];
  els.lbImg.src = photo.url;
  els.lbVariant.textContent = photo.variant + (photo.sessionSlug ? ` · ${photo.sessionSlug}` : '');
  els.lbDownload.href = photo.url;
  els.lbDownload.download = `${photo.id}-${photo.variant}.jpg`;
  els.lightbox.hidden = false;
  if (route.slug) {
    history.replaceState(
      null,
      '',
      `/${encodeURIComponent(route.slug)}/p/${encodeURIComponent(photo.id)}`,
    );
  }
}

function closeLightbox() {
  els.lightbox.hidden = true;
  if (route.slug) history.replaceState(null, '', pathForMode(viewMode));
}

function openSlideshow() {
  if (!photos.length) return;
  els.slideshow.hidden = false;
  showSs(index);
  startSs();
}

function showSs(i) {
  if (!photos.length) return;
  index = ((i % photos.length) + photos.length) % photos.length;
  els.ssImg.src = photos[index].url;
}

function startSs() {
  stopSs();
  ssPlaying = true;
  els.ssToggle.textContent = 'Pause';
  ssTimer = setInterval(() => showSs(index + 1), 3500);
}

function stopSs() {
  ssPlaying = false;
  els.ssToggle.textContent = 'Play';
  if (ssTimer) clearInterval(ssTimer);
  ssTimer = null;
}

function connectStream(url) {
  if (es) es.close();
  es = new EventSource(url);
  es.addEventListener('photo.added', (ev) => {
    try {
      upsertPhoto(JSON.parse(ev.data));
    } catch {
      /* ignore */
    }
  });
}

async function loadSession(slug) {
  setStatus('Loading gallery…');
  const res = await fetch(`/api/sessions/${encodeURIComponent(slug)}`);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    setStatus(data.error || 'Gallery unavailable');
    return;
  }
  setStatus('', false);
  els.title.textContent = data.session.title || slug;
  wallCfg = {
    title: data.session.title || slug,
    overlay: '',
    columns: 14,
    emptyRatio: 0.22,
  };
  // Prefer server wall chrome when available
  try {
    const wr = await fetch('/api/wall');
    const wd = await wr.json();
    if (wr.ok && wd.wall) {
      wallCfg = { ...wallCfg, ...wd.wall, title: wd.wall.title || wallCfg.title };
    }
  } catch {
    /* optional */
  }
  photos = (data.session.photos || []).filter((p) => p.variant !== 'original');

  if (route.kind === 'photo' && route.photoId) {
    // QR / share link: only this guest’s photo — never the full session grid.
    const mine = photos.find((p) => p.id === route.photoId);
    photos = mine ? [mine] : [];
    els.meta.textContent = photos.length ? '' : 'Photo unavailable';
    connectStream(`/api/sessions/${encodeURIComponent(slug)}/stream`);
    setMode('photo', false);
    return;
  }

  els.meta.textContent = `Expires ${new Date(data.session.expiresAt).toLocaleString()} · ${photos.length} photos`;
  connectStream(`/api/sessions/${encodeURIComponent(slug)}/stream`);
  setMode(route.mode || 'grid', false);
}

async function loadWall() {
  setStatus('Loading mosaic wall…');
  const res = await fetch('/api/wall');
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    setStatus(data.error || 'Wall unavailable');
    return;
  }
  setStatus('', false);
  wallCfg = { ...wallCfg, ...(data.wall || {}) };
  photos = (data.photos || []).filter((p) => p.variant !== 'original');
  els.title.textContent = wallCfg.title || 'Wall of moments';
  els.meta.textContent = `${photos.length} photos · ${data.sessions?.length || 0} active sessions`;
  connectStream('/api/wall/stream');
  setMode(route.mode || 'mosaic', false);
}

document.getElementById('btnGrid')?.addEventListener('click', () => setMode('grid'));
document.getElementById('btnWall')?.addEventListener('click', () => setMode('mosaic'));
document.getElementById('btnSlideshow')?.addEventListener('click', () => setMode('slideshow'));
document.getElementById('lbClose')?.addEventListener('click', closeLightbox);
document.getElementById('lbPrev')?.addEventListener('click', () => openLightbox(index - 1));
document.getElementById('lbNext')?.addEventListener('click', () => openLightbox(index + 1));
document.getElementById('ssPrev')?.addEventListener('click', () => showSs(index - 1));
document.getElementById('ssNext')?.addEventListener('click', () => showSs(index + 1));
document.getElementById('ssExit')?.addEventListener('click', () => {
  stopSs();
  els.slideshow.hidden = true;
  setMode(route.kind === 'wall' ? 'mosaic' : 'grid');
});
document.getElementById('ssToggle')?.addEventListener('click', () => {
  if (ssPlaying) stopSs();
  else startSs();
});

window.addEventListener('keydown', (e) => {
  if (!els.lightbox.hidden) {
    if (e.key === 'Escape') closeLightbox();
    if (e.key === 'ArrowLeft') openLightbox(index - 1);
    if (e.key === 'ArrowRight') openLightbox(index + 1);
  }
  if (!els.slideshow.hidden) {
    if (e.key === 'Escape') {
      stopSs();
      els.slideshow.hidden = true;
      setMode(route.kind === 'wall' ? 'mosaic' : 'grid');
    }
    if (e.key === 'ArrowLeft') showSs(index - 1);
    if (e.key === 'ArrowRight') showSs(index + 1);
  }
});

let mosaicResizeTimer = null;
window.addEventListener('resize', () => {
  if (viewMode !== 'mosaic') return;
  clearTimeout(mosaicResizeTimer);
  mosaicResizeTimer = setTimeout(() => renderMosaic(true), 280);
});

if (route.kind === 'home') {
  els.title.textContent = 'Moments';
  setStatus(
    'Open a session (/onam-2026-08-01), mosaic wall (/wall), slideshow (/wall/slideshow), or session wall (/slug/wall).',
  );
  els.empty.hidden = true;
} else if (route.kind === 'wall') {
  loadWall().catch((e) => setStatus(String(e)));
} else if (route.kind === 'session' || route.kind === 'photo') {
  loadSession(route.slug).catch((e) => setStatus(String(e)));
}
