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
  mosaicBackdrop: document.getElementById('mosaicBackdrop'),
  mosaicBackdropImg: document.getElementById('mosaicBackdropImg'),
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
  backdropOpacity: 0.22,
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
  // Fewer, larger cards so the wall feels filled
  return Math.min(11, Math.max(5, Math.round(area / 145000)));
}

function mosaicSizeScale(rand) {
  const roll = rand();
  if (roll < 0.28) return 1.38; // hero focus
  if (roll < 0.72) return 1.18;
  return 1.0; // no tiny cards
}

function layoutMosaicSlots(count) {
  const stageW = Math.max(320, els.mosaicStage?.clientWidth || 1200);
  const stageH = Math.max(240, els.mosaicStage?.clientHeight || 800);
  const base = Math.min(stageW * 0.32, stageH * 0.42, 340);
  const rand = seededRandom(count * 97 + Math.round(stageW + stageH));
  const slots = [];
  const pad = 18;
  // Soft grid anchors reduce random pile-ups
  const cols = Math.max(2, Math.ceil(Math.sqrt(count * (stageW / Math.max(1, stageH)))));
  const rows = Math.max(2, Math.ceil(count / cols));
  const cellW = (stageW - pad * 2) / cols;
  const cellH = (stageH - pad * 2) / rows;

  for (let i = 0; i < count; i++) {
    const scale = mosaicSizeScale(rand);
    const size = Math.max(170, Math.min(base * scale, cellW * 1.15, stageW * 0.42));
    const h = size / MOSAIC_CELL_ASPECT;
    const col = i % cols;
    const row = Math.floor(i / cols) % rows;
    const jitterX = (rand() - 0.5) * cellW * 0.28;
    const jitterY = (rand() - 0.5) * cellH * 0.28;
    let x = pad + col * cellW + (cellW - size) / 2 + jitterX;
    let y = pad + row * cellH + (cellH - h) / 2 + jitterY;
    x = Math.min(stageW - size - pad, Math.max(pad, x));
    y = Math.min(stageH - h - pad, Math.max(pad, y));

    for (let attempt = 0; attempt < 18; attempt++) {
      let crowded = false;
      for (const s of slots) {
        const dx = x + size / 2 - (s.x + s.size / 2);
        const dy = y + h / 2 - (s.y + s.size / MOSAIC_CELL_ASPECT / 2);
        // Stronger separation — avoid heavy overlaps
        if (Math.hypot(dx, dy) < Math.min(size, s.size) * 1.05) {
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
      rot: (rand() - 0.5) * 3.5,
      floatDur: 7 + rand() * 6,
      floatDelay: -rand() * 5,
      scanDelay: rand() * 3,
      focus: scale >= 1.3,
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
  const backdropUrl = (wallCfg.mosaicTargetUrl || '').trim();
  const opacity =
    typeof wallCfg.backdropOpacity === 'number' ? wallCfg.backdropOpacity : 0.22;
  if (els.mosaicBackdrop && els.mosaicBackdropImg) {
    if (backdropUrl) {
      els.mosaicBackdrop.hidden = false;
      els.mosaicBackdrop.style.setProperty('--backdrop-opacity', String(opacity));
      els.mosaicBackdropImg.src = backdropUrl;
    } else {
      els.mosaicBackdrop.hidden = true;
      els.mosaicBackdropImg.removeAttribute('src');
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
  slot.el.classList.remove('is-filled', 'is-shine', 'is-swoosh', 'is-vanish', 'is-focus');
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

  const applyContent = () => {
    slot.photoId = photo.id;
    mosaicPhotoSlot.set(photo.id, slotIndex);
    slot.el.classList.remove('is-empty', 'is-vanish');
    slot.el.classList.add('is-filled');
    if (slot.focus || opts.focus) slot.el.classList.add('is-focus');
    else slot.el.classList.remove('is-focus');
    const img = slot.el.querySelector('.mosaic-slot-photo');
    if (img) {
      img.src = photo.url;
      img.alt = '';
    }
    slot.el.classList.remove('is-swoosh', 'is-shine');
    void slot.el.offsetWidth;
    slot.el.classList.add('is-swoosh');
    if (opts.shine !== false) slot.el.classList.add('is-shine');
    setTimeout(() => {
      slot.el.classList.remove('is-swoosh');
      slot.el.classList.remove('is-shine');
    }, 900);
    slot.el.onclick = () => {
      const i = photos.findIndex((p) => p.id === photo.id);
      if (i >= 0) openLightbox(i);
    };
  };

  if (opts.animate && slot.photoId) {
    slot.el.classList.add('is-vanish');
    setTimeout(applyContent, 280);
  } else {
    applyContent();
  }
}

function mosaicFillCap() {
  // Keep at most one glass placeholder when we have room
  const reserve = mosaicSlots.length >= 8 ? 1 : 0;
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
  const empty = pickEmptySlot();
  if (empty >= 0 && !opts.force) {
    fillMosaicSlot(empty, photo, { ...opts, animate: false });
    return;
  }
  if (empty >= 0 && opts.force && mosaicPhotoSlot.size < mosaicSlots.length) {
    fillMosaicSlot(empty, photo, { ...opts, animate: true });
    return;
  }
  if (!opts.force) {
    if (mosaicPhotoSlot.size >= mosaicFillCap()) return;
    if (empty >= 0) fillMosaicSlot(empty, photo, opts);
    return;
  }
  const filled = mosaicSlots.map((s, i) => ({ s, i })).filter((x) => x.s.photoId);
  if (!filled.length) {
    if (empty >= 0) fillMosaicSlot(empty, photo, opts);
    return;
  }
  const idx = filled[Math.floor(Math.random() * filled.length)].i;
  fillMosaicSlot(idx, photo, { ...opts, animate: true, focus: Math.random() < 0.45 });
}

function buildMosaicCollage() {
  if (!els.mosaicStage) return;
  const count = mosaicSlotCount();
  const layouts = layoutMosaicSlots(count);

  // Keep backdrop node; only wipe slots/scan
  els.mosaicStage.querySelectorAll('.mosaic-slot, .mosaic-scan').forEach((el) => el.remove());
  if (!els.mosaicBackdrop || !els.mosaicStage.contains(els.mosaicBackdrop)) {
    const backdrop = document.createElement('div');
    backdrop.id = 'mosaicBackdrop';
    backdrop.className = 'mosaic-backdrop';
    backdrop.hidden = true;
    backdrop.setAttribute('aria-hidden', 'true');
    backdrop.innerHTML = '<img id="mosaicBackdropImg" class="mosaic-backdrop-img" alt="" />';
    els.mosaicStage.prepend(backdrop);
    els.mosaicBackdrop = backdrop;
    els.mosaicBackdropImg = backdrop.querySelector('.mosaic-backdrop-img');
  }

  mosaicSlots = [];
  mosaicPhotoSlot.clear();
  mosaicRotateCursor = 0;
  updateMosaicBranding();

  const scan = document.createElement('div');
  scan.className = 'mosaic-scan';
  scan.setAttribute('aria-hidden', 'true');
  els.mosaicStage.appendChild(scan);

  layouts.forEach((layout, i) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'mosaic-slot is-empty';
    if (layout.focus) btn.classList.add('is-focus');
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
      focus: !!layout.focus,
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
  if (viewMode !== 'mosaic' || !mosaicSlots.length || photos.length < 1) return;

  // 1) Fill empty slots first
  const visible = new Set([...mosaicPhotoSlot.keys()]);
  const unseen = photos.filter((p) => !visible.has(p.id));
  const emptyIdxs = mosaicSlots.map((s, i) => (!s.photoId ? i : -1)).filter((i) => i >= 0);
  let filledEmpties = 0;
  for (const photo of unseen) {
    if (filledEmpties >= emptyIdxs.length) break;
    placePhotoInMosaic(photo, { shine: true, force: false });
    filledEmpties++;
  }

  // 2) Swap places between filled cards (vanish → swoosh) so sizes/focus feel alive
  const filled = mosaicSlots.map((s, i) => ({ s, i })).filter((x) => x.s.photoId);
  if (filled.length >= 2 && Math.random() < 0.75) {
    const a = filled[Math.floor(Math.random() * filled.length)];
    let b = filled[Math.floor(Math.random() * filled.length)];
    if (b.i === a.i) b = filled[(filled.indexOf(a) + 1) % filled.length];
    const posA = { x: a.s.x, y: a.s.y, size: a.s.size, rot: a.s.rot, focus: a.s.focus };
    const posB = { x: b.s.x, y: b.s.y, size: b.s.size, rot: b.s.rot, focus: b.s.focus };
    a.s.el.classList.add('is-vanish');
    b.s.el.classList.add('is-vanish');
    setTimeout(() => {
      a.s.x = posB.x;
      a.s.y = posB.y;
      a.s.size = posB.size;
      a.s.rot = posB.rot;
      a.s.focus = Math.random() < 0.4;
      b.s.x = posA.x;
      b.s.y = posA.y;
      b.s.size = posA.size;
      b.s.rot = posA.rot;
      b.s.focus = !a.s.focus && Math.random() < 0.35;
      a.s.el.classList.toggle('is-focus', !!a.s.focus);
      b.s.el.classList.toggle('is-focus', !!b.s.focus);
      applySlotTransform(a.s, true);
      applySlotTransform(b.s, true);
      a.s.el.classList.remove('is-vanish');
      b.s.el.classList.remove('is-vanish');
      a.s.el.classList.add('is-swoosh');
      b.s.el.classList.add('is-swoosh');
      setTimeout(() => {
        a.s.el.classList.remove('is-swoosh');
        b.s.el.classList.remove('is-swoosh');
      }, 700);
    }, 300);
  }

  // 3) Occasionally bring unseen photos onto the wall
  if (photos.length <= mosaicPhotoSlot.size) return;
  const stillUnseen = photos.filter((p) => !mosaicPhotoSlot.has(p.id));
  const pool = stillUnseen.length ? stillUnseen : photos;
  const take = Math.min(2, pool.length, Math.max(1, mosaicPhotoSlot.size));
  for (let n = 0; n < take; n++) {
    const photo = pool[(mosaicRotateCursor + n) % pool.length];
    setTimeout(
      () => placePhotoInMosaic(photo, { force: true, shine: true, animate: true, focus: true }),
      400 + n * 240,
    );
  }
  mosaicRotateCursor = (mosaicRotateCursor + take) % pool.length;
}

function driftMosaicSlots() {
  if (viewMode !== 'mosaic' || mosaicSlots.length < 2) return;
  const stageW = els.mosaicStage?.clientWidth || 1200;
  const stageH = els.mosaicStage?.clientHeight || 800;
  const pad = 18;
  // Gentle nudge only — keep separation so the wall stays readable
  const idxs = mosaicSlots
    .map((_, i) => i)
    .sort(() => Math.random() - 0.5)
    .slice(0, Math.max(1, Math.ceil(mosaicSlots.length * 0.22)));
  idxs.forEach((i) => {
    const slot = mosaicSlots[i];
    const h = slot.size / MOSAIC_CELL_ASPECT;
    let nx = Math.min(stageW - slot.size - pad, Math.max(pad, slot.x + (Math.random() - 0.5) * 18));
    let ny = Math.min(stageH - h - pad, Math.max(pad, slot.y + (Math.random() - 0.5) * 14));
    let crowded = false;
    for (let j = 0; j < mosaicSlots.length; j++) {
      if (j === i) continue;
      const o = mosaicSlots[j];
      const oh = o.size / MOSAIC_CELL_ASPECT;
      const dx = nx + slot.size / 2 - (o.x + o.size / 2);
      const dy = ny + h / 2 - (o.y + oh / 2);
      if (Math.hypot(dx, dy) < Math.min(slot.size, o.size) * 0.88) {
        crowded = true;
        break;
      }
    }
    if (crowded) return;
    slot.x = nx;
    slot.y = ny;
    slot.rot = Math.max(-3.5, Math.min(3.5, slot.rot + (Math.random() - 0.5) * 0.8));
    applySlotTransform(slot, true);
  });
}

function startMosaicLoops() {
  stopMosaicLoops();
  mosaicShineTimer = setInterval(shineRandomMosaicTile, 3200);
  mosaicRotateTimer = setInterval(rotateMosaicPhotos, 6500);
  mosaicDriftTimer = setInterval(driftMosaicSlots, 11000);
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
