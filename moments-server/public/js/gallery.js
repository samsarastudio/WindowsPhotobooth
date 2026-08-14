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
/** Secondary SSE for wall.settings when viewing a session mosaic. */
let wallSettingsEs = null;
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
  completedView: false,
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
    applyMosaicLayoutMode(true);
  } else {
    stopMosaicLoops();
    els.mosaicStage?.classList.remove('is-completed');
    document.body.classList.remove('is-mosaic-completed');
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

function isCompletedView() {
  return !!wallCfg.completedView;
}

function ensureMosaicBackdrop() {
  if (!els.mosaicStage) return;
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
}

function completedGridDims(photoCount) {
  const stageW = Math.max(320, els.mosaicStage?.clientWidth || 1200);
  const stageH = Math.max(240, els.mosaicStage?.clientHeight || 800);
  const preferred = Math.min(28, Math.max(4, Number(wallCfg.columns) || 12));
  // Cap cell count so huge albums stay dense without thousands of DOM nodes
  const minCellW = 88;
  const maxCols = Math.max(2, Math.min(preferred, Math.floor(stageW / minCellW)));
  let best = { cols: maxCols, rows: 1, capacity: maxCols, score: Infinity };
  for (let cols = 2; cols <= maxCols; cols++) {
    const cellW = stageW / cols;
    const cellH = cellW / MOSAIC_CELL_ASPECT;
    const rows = Math.max(1, Math.floor(stageH / cellH));
    const capacity = cols * rows;
    if (capacity < 1) continue;
    const aspect = cellW / Math.max(1, cellH);
    const unused = photoCount > 0 ? Math.max(0, capacity - Math.min(photoCount, capacity)) : 0;
    const score =
      Math.abs(aspect - MOSAIC_CELL_ASPECT) * 2 +
      Math.abs(cols - preferred) * 0.1 +
      unused * 0.02;
    if (score < best.score) best = { cols, rows, capacity, score };
  }
  return best;
}

function applyMosaicLayoutMode(fullRebuild = true) {
  if (!els.mosaicStage || viewMode !== 'mosaic') return;
  const completed = isCompletedView();
  els.mosaicStage.classList.toggle('is-completed', completed);
  document.body.classList.toggle('is-mosaic-completed', completed);
  if (completed) {
    stopMosaicLoops();
    buildMosaicCompleted();
    startMosaicLoops();
  } else {
    renderMosaic(fullRebuild);
    startMosaicLoops();
  }
}

function buildMosaicCompleted() {
  if (!els.mosaicStage) return;
  els.mosaicStage.querySelectorAll('.mosaic-slot, .mosaic-scan').forEach((el) => el.remove());
  ensureMosaicBackdrop();
  mosaicSlots = [];
  mosaicPhotoSlot.clear();
  updateMosaicBranding();

  const list = photos.filter((p) => p?.id);
  if (!list.length) return;

  const { cols, rows, capacity } = completedGridDims(list.length);
  const cap = Math.max(1, capacity || cols * rows);
  els.mosaicStage.style.setProperty('--completed-cols', String(cols));
  els.mosaicStage.style.setProperty('--completed-rows', String(rows));

  // Virtual window: only as many cells as fill the stage
  const start = list.length <= cap ? 0 : mosaicRotateCursor % list.length;
  const windowPhotos = [];
  for (let i = 0; i < Math.min(cap, list.length); i++) {
    windowPhotos.push(list[(start + i) % list.length]);
  }

  windowPhotos.forEach((photo, i) => {
    const cell = document.createElement('div');
    cell.className = 'mosaic-slot is-filled is-completed-cell';
    cell.dataset.slot = String(i);
    cell.setAttribute('aria-hidden', 'true');
    cell.style.setProperty('--arrive-delay', `${Math.min(i * 18, 900)}ms`);
    cell.innerHTML =
      '<span class="mosaic-slot-card"><img class="mosaic-slot-photo" alt="" decoding="async" loading="lazy" /><span class="mosaic-slot-shine" aria-hidden="true"></span></span>';
    const img = cell.querySelector('.mosaic-slot-photo');
    if (img) {
      img.src = photo.url;
      img.alt = '';
      img.draggable = false;
    }
    els.mosaicStage.appendChild(cell);
    mosaicSlots.push({
      el: cell,
      photoId: photo.id,
      size: 0,
      x: 0,
      y: 0,
      homeX: 0,
      homeY: 0,
      rot: 0,
      floatDur: 8,
      floatDelay: 0,
      scanDelay: 0,
      focus: false,
    });
    mosaicPhotoSlot.set(photo.id, i);
  });
}

function mosaicGridMetrics() {
  const stageW = Math.max(320, els.mosaicStage?.clientWidth || 1200);
  const stageH = Math.max(240, els.mosaicStage?.clientHeight || 800);
  const pad = 14;
  const gap = 8;
  // Virtual unit grid — tiles span 1, 2, or 4 cells
  const cols = stageW >= 1500 ? 8 : stageW >= 1100 ? 6 : stageW >= 720 ? 5 : 4;
  const cellW = (stageW - pad * 2 - gap * (cols - 1)) / cols;
  const cellH = cellW / MOSAIC_CELL_ASPECT;
  const rows = Math.max(3, Math.floor((stageH - pad * 2 + gap) / (cellH + gap)));
  return { stageW, stageH, pad, gap, cols, rows, cellW, cellH };
}

/** Fit a 6×4 card centered inside a reserved rect (never stretch the frame). */
function fitLandscapeCard(reserveX, reserveY, reserveW, reserveH) {
  let w = reserveW;
  let h = w / MOSAIC_CELL_ASPECT;
  if (h > reserveH + 0.5) {
    h = reserveH;
    w = h * MOSAIC_CELL_ASPECT;
  }
  return {
    x: reserveX + (reserveW - w) / 2,
    y: reserveY + (reserveH - h) / 2,
    size: w,
    height: h,
  };
}

/** Pick a span in grid cells: 1×1 (1), medium ~2-area, or 2×2 (4). */
function pickMosaicSpan(rand, freeCells, colsLeft, rowsLeft) {
  const can4 = freeCells >= 4 && colsLeft >= 2 && rowsLeft >= 2;
  const roll = rand();
  if (can4 && roll < 0.22) return { spanC: 2, spanR: 2, grids: 4 };
  if (can4 && roll < 0.5) return { spanC: 2, spanR: 2, grids: 2, medium: true };
  return { spanC: 1, spanR: 1, grids: 1 };
}

function layoutMosaicSlots() {
  const { pad, gap, cols, rows, cellW, cellH } = mosaicGridMetrics();
  const rand = seededRandom(cols * 131 + rows * 97 + Math.round(cellW * 10));
  const occupied = Array.from({ length: rows }, () => Array(cols).fill(false));
  const slots = [];

  const mark = (r, c, spanC, spanR) => {
    for (let y = r; y < r + spanR; y++) {
      for (let x = c; x < c + spanC; x++) occupied[y][x] = true;
    }
  };
  const canPlace = (r, c, spanC, spanR) => {
    if (c + spanC > cols || r + spanR > rows) return false;
    for (let y = r; y < r + spanR; y++) {
      for (let x = c; x < c + spanC; x++) {
        if (occupied[y][x]) return false;
      }
    }
    return true;
  };
  const freeCount = () => {
    let n = 0;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) if (!occupied[r][c]) n++;
    }
    return n;
  };
  const pushSlot = (r, c, spanC, spanR, grids, medium) => {
    mark(r, c, spanC, spanR);
    const reserveW = cellW * spanC + gap * (spanC - 1);
    const reserveH = cellH * spanR + gap * (spanR - 1);
    const reserveX = pad + c * (cellW + gap);
    const reserveY = pad + r * (cellH + gap);
    let card;
    if (medium && spanC === 2 && spanR === 2) {
      // ~2-grid area, still 6×4 — larger than 1×1, smaller than full 2×2
      const targetW = cellW * 1.42;
      card = fitLandscapeCard(
        reserveX + (reserveW - targetW) / 2,
        reserveY + (reserveH - targetW / MOSAIC_CELL_ASPECT) / 2,
        targetW,
        targetW / MOSAIC_CELL_ASPECT,
      );
    } else {
      card = fitLandscapeCard(reserveX, reserveY, reserveW, reserveH);
    }
    const rot = (rand() - 0.5) * (grids >= 4 ? 0.7 : 1.1);
    slots.push({
      x: card.x,
      y: card.y,
      homeX: card.x,
      homeY: card.y,
      size: card.size,
      height: card.height,
      homeSize: card.size,
      homeHeight: card.height,
      rot,
      homeRot: rot,
      floatDur: 8 + rand() * 6,
      floatDelay: -rand() * 5,
      scanDelay: rand() * 3,
      focus: grids >= 4,
      spanC,
      spanR,
      grids,
      col: c,
      row: r,
    });
  };

  // Seed 1–2 hero 4-grid tiles first for hierarchy
  let heroes = 0;
  const heroTarget = rows * cols >= 20 ? 2 : 1;
  const heroStarts = [];
  for (let r = 0; r <= rows - 2; r++) {
    for (let c = 0; c <= cols - 2; c++) heroStarts.push({ r, c });
  }
  for (let i = heroStarts.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [heroStarts[i], heroStarts[j]] = [heroStarts[j], heroStarts[i]];
  }
  for (const { r, c } of heroStarts) {
    if (heroes >= heroTarget) break;
    if (!canPlace(r, c, 2, 2)) continue;
    pushSlot(r, c, 2, 2, 4, false);
    heroes++;
  }

  // Pack remaining: medium (2) and small (1), always 6×4 cards
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (occupied[r][c]) continue;
      const free = freeCount();
      let span = pickMosaicSpan(rand, free, cols - c, rows - r);
      if (!canPlace(r, c, span.spanC, span.spanR)) {
        span = { spanC: 1, spanR: 1, grids: 1 };
        if (!canPlace(r, c, 1, 1)) continue;
      }
      pushSlot(r, c, span.spanC, span.spanR, span.grids, !!span.medium);
    }
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
  // Always keep 6×4 — height derived from width
  const w = slot.size;
  const h = w / MOSAIC_CELL_ASPECT;
  slot.height = h;
  slot.el.style.setProperty('--sz', w + 'px');
  slot.el.style.setProperty('--sz-h', h + 'px');
  slot.el.style.setProperty('--rot', slot.rot + 'deg');
  slot.el.style.setProperty('--mx', slot.x + 'px');
  slot.el.style.setProperty('--my', slot.y + 'px');
  slot.el.style.setProperty('--float-dur', slot.floatDur + 's');
  slot.el.style.setProperty('--float-delay', slot.floatDelay + 's');
  slot.el.style.setProperty('--scan-delay', slot.scanDelay + 's');
  slot.el.dataset.grids = String(slot.grids || 1);
  slot.el.classList.toggle('is-span-2', slot.grids === 2);
  slot.el.classList.toggle('is-span-4', slot.grids === 4);
  slot.el.classList.toggle('is-focus', !!slot.focus || slot.grids >= 4);
  if (!animatePos) {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        slot.el.style.transition = '';
      });
    });
  }
}

function snapshotSlotGeometry(slot) {
  return {
    x: slot.x,
    y: slot.y,
    homeX: slot.homeX,
    homeY: slot.homeY,
    size: slot.size,
    height: slot.height,
    homeSize: slot.homeSize,
    homeHeight: slot.homeHeight,
    rot: slot.rot,
    homeRot: slot.homeRot,
    grids: slot.grids,
    spanC: slot.spanC,
    spanR: slot.spanR,
    focus: slot.focus,
    col: slot.col,
    row: slot.row,
  };
}

function applySlotGeometry(slot, geom) {
  Object.assign(slot, geom);
  slot.homeX = geom.homeX ?? geom.x;
  slot.homeY = geom.homeY ?? geom.y;
  slot.homeSize = geom.homeSize ?? geom.size;
  slot.homeHeight = geom.homeHeight ?? geom.height;
  slot.homeRot = geom.homeRot ?? geom.rot;
  applySlotTransform(slot, true);
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
  if (!photo?.id || viewMode !== 'mosaic' || isCompletedView()) return;
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
  const layouts = layoutMosaicSlots();

  // Keep backdrop node; only wipe slots/scan
  els.mosaicStage.querySelectorAll('.mosaic-slot, .mosaic-scan').forEach((el) => el.remove());
  ensureMosaicBackdrop();
  els.mosaicStage.classList.remove('is-completed');
  document.body.classList.remove('is-mosaic-completed');
  els.mosaicStage.style.removeProperty('--completed-cols');
  els.mosaicStage.style.removeProperty('--completed-rows');

  mosaicSlots = [];
  mosaicPhotoSlot.clear();
  mosaicRotateCursor = 0;
  updateMosaicBranding();

  const scan = document.createElement('div');
  scan.className = 'mosaic-scan';
  scan.setAttribute('aria-hidden', 'true');
  els.mosaicStage.appendChild(scan);

  layouts.forEach((layout, i) => {
    const cell = document.createElement('div');
    cell.className = 'mosaic-slot is-empty';
    if (layout.focus) cell.classList.add('is-focus');
    if (layout.grids === 2) cell.classList.add('is-span-2');
    if (layout.grids === 4) cell.classList.add('is-span-4');
    cell.dataset.slot = String(i);
    cell.dataset.grids = String(layout.grids || 1);
    cell.setAttribute('aria-hidden', 'true');
    cell.innerHTML =
      '<span class="mosaic-slot-card"><img class="mosaic-slot-photo" alt="" decoding="async" draggable="false" /><span class="mosaic-slot-shine" aria-hidden="true"></span></span>';
    const slot = {
      el: cell,
      photoId: null,
      size: layout.size,
      height: layout.height,
      homeSize: layout.homeSize ?? layout.size,
      homeHeight: layout.homeHeight ?? layout.height,
      x: layout.x,
      y: layout.y,
      homeX: layout.homeX ?? layout.x,
      homeY: layout.homeY ?? layout.y,
      rot: layout.rot,
      homeRot: layout.homeRot ?? layout.rot,
      floatDur: layout.floatDur,
      floatDelay: layout.floatDelay,
      scanDelay: layout.scanDelay,
      focus: !!layout.focus,
      spanC: layout.spanC,
      spanR: layout.spanR,
      grids: layout.grids || 1,
      col: layout.col,
      row: layout.row,
    };
    applySlotTransform(slot, false);
    els.mosaicStage.appendChild(cell);
    mosaicSlots.push(slot);
  });
}

function renderMosaic(fullRebuild = false) {
  if (!els.mosaicStage) return;
  if (isCompletedView()) {
    buildMosaicCompleted();
    return;
  }
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
        if (viewMode !== 'mosaic' || isCompletedView()) return;
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
  if (viewMode !== 'mosaic' || isCompletedView()) return;
  const filled = mosaicSlots.filter((s) => s.photoId);
  if (!filled.length) return;
  const slot = filled[Math.floor(Math.random() * filled.length)];
  slot.el.classList.remove('is-shine');
  void slot.el.offsetWidth;
  slot.el.classList.add('is-shine');
  setTimeout(() => slot.el.classList.remove('is-shine'), 1100);
}

function slotSizeKey(slot) {
  return slot?.grids || 1;
}

function slotsDifferInSize(a, b) {
  if (!a || !b) return false;
  if (slotSizeKey(a) !== slotSizeKey(b)) return true;
  // Same span class but different card width (e.g. medium vs hero packing quirks)
  const avg = (a.size + b.size) / 2;
  return avg > 0 && Math.abs(a.size - b.size) / avg > 0.18;
}

function animateSlotGeometrySwap(slotA, slotB, delay = 0) {
  if (!slotA?.el || !slotB?.el) return;
  const geomA = snapshotSlotGeometry(slotA);
  const geomB = snapshotSlotGeometry(slotB);
  setTimeout(() => {
    slotA.el.classList.add('is-vanish');
    slotB.el.classList.add('is-vanish');
    setTimeout(() => {
      applySlotGeometry(slotA, geomB);
      applySlotGeometry(slotB, geomA);
      slotA.el.classList.remove('is-vanish');
      slotB.el.classList.remove('is-vanish');
      slotA.el.classList.add('is-swoosh');
      slotB.el.classList.add('is-swoosh');
      setTimeout(() => {
        slotA.el.classList.remove('is-swoosh');
        slotB.el.classList.remove('is-swoosh');
      }, 700);
    }, 280);
  }, delay);
}

/**
 * Prefer moving a photo into an empty slot of a different size.
 * Falls back to swapping two filled photos that differ in size.
 * Never does same-size place-swaps — those look like a plain A↔B swap.
 */
function pickMosaicSizeMoves(maxMoves = 2) {
  const filled = mosaicSlots.map((s, i) => ({ s, i })).filter((x) => x.s.photoId);
  const empty = mosaicSlots.map((s, i) => ({ s, i })).filter((x) => !x.s.photoId);
  const scored = [];

  for (const f of filled) {
    for (const e of empty) {
      if (!slotsDifferInSize(f.s, e.s)) continue;
      const score =
        Math.abs(slotSizeKey(f.s) - slotSizeKey(e.s)) * 100 +
        Math.abs(f.s.size - e.s.size) +
        Math.random() * 12;
      scored.push({ a: f, b: e, score });
    }
  }

  for (let i = 0; i < filled.length; i++) {
    for (let j = i + 1; j < filled.length; j++) {
      if (!slotsDifferInSize(filled[i].s, filled[j].s)) continue;
      const score =
        Math.abs(slotSizeKey(filled[i].s) - slotSizeKey(filled[j].s)) * 40 +
        Math.abs(filled[i].s.size - filled[j].s.size) +
        Math.random() * 8;
      scored.push({ a: filled[i], b: filled[j], score });
    }
  }

  scored.sort((x, y) => y.score - x.score);
  const used = new Set();
  const picked = [];
  for (const m of scored) {
    if (used.has(m.a.i) || used.has(m.b.i)) continue;
    used.add(m.a.i);
    used.add(m.b.i);
    picked.push(m);
    if (picked.length >= maxMoves) break;
  }

  // Last resort: if every filled tile is the same size, still move into any empty
  // so photos leave their current place (size change happens on the empty target).
  if (!picked.length && filled.length && empty.length) {
    const f = filled[Math.floor(Math.random() * filled.length)];
    const different = empty.filter((e) => slotsDifferInSize(f.s, e.s));
    const pool = different.length ? different : empty;
    const e = pool[Math.floor(Math.random() * pool.length)];
    picked.push({ a: f, b: e, score: 1 });
  }

  return picked;
}

function rotateMosaicPhotos() {
  if (viewMode !== 'mosaic' || isCompletedView() || !mosaicSlots.length || photos.length < 1) return;

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

  // 2) Move photos into different slot sizes/places (geometry), not same-size A↔B swaps
  if (Math.random() < 0.92) {
    const moves = pickMosaicSizeMoves(Math.min(3, Math.max(1, Math.floor(mosaicPhotoSlot.size / 2) || 1)));
    moves.forEach((m, n) => animateSlotGeometrySwap(m.a.s, m.b.s, n * 140));
  }

  // 3) Bring unseen photos into empty slots when possible; only force-replace if full
  if (photos.length <= mosaicPhotoSlot.size) return;
  const stillUnseen = photos.filter((p) => !mosaicPhotoSlot.has(p.id));
  if (!stillUnseen.length) return;
  const emptiesLeft = mosaicSlots.filter((s) => !s.photoId).length;
  const take = Math.min(2, stillUnseen.length, Math.max(1, emptiesLeft || mosaicPhotoSlot.size));
  for (let n = 0; n < take; n++) {
    const photo = stillUnseen[(mosaicRotateCursor + n) % stillUnseen.length];
    setTimeout(
      () =>
        placePhotoInMosaic(photo, {
          force: emptiesLeft === 0,
          shine: true,
          animate: true,
          focus: false,
        }),
      450 + n * 240,
    );
  }
  mosaicRotateCursor = (mosaicRotateCursor + take) % stillUnseen.length;
}

function driftMosaicSlots() {
  if (viewMode !== 'mosaic' || isCompletedView() || mosaicSlots.length < 2) return;
  // Ease slots back toward their virtual-grid homes — never wander far
  const idxs = mosaicSlots
    .map((_, i) => i)
    .sort(() => Math.random() - 0.5)
    .slice(0, Math.max(1, Math.ceil(mosaicSlots.length * 0.35)));
  idxs.forEach((i) => {
    const slot = mosaicSlots[i];
    const homeX = slot.homeX ?? slot.x;
    const homeY = slot.homeY ?? slot.y;
    const homeRot = slot.homeRot ?? slot.rot;
    slot.x = homeX + (Math.random() - 0.5) * 4;
    slot.y = homeY + (Math.random() - 0.5) * 3;
    slot.rot = homeRot + (Math.random() - 0.5) * 0.4;
    applySlotTransform(slot, true);
  });
}

function rotateCompletedWindow() {
  if (viewMode !== 'mosaic' || !isCompletedView()) return;
  if (photos.length <= mosaicSlots.length) return;
  mosaicRotateCursor =
    (mosaicRotateCursor + Math.max(1, Math.floor(mosaicSlots.length * 0.2))) % photos.length;
  buildMosaicCompleted();
}

function startMosaicLoops() {
  stopMosaicLoops();
  if (isCompletedView()) {
    mosaicRotateTimer = setInterval(rotateCompletedWindow, 14000);
    return;
  }
  mosaicShineTimer = setInterval(shineRandomMosaicTile, 4200);
  mosaicRotateTimer = setInterval(rotateMosaicPhotos, 7000);
  mosaicDriftTimer = setInterval(driftMosaicSlots, 14000);
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
    if (isCompletedView()) {
      if (isNew) buildMosaicCompleted();
      else {
        const idx = mosaicPhotoSlot.get(photo.id);
        const img = mosaicSlots[idx]?.el?.querySelector?.('.mosaic-slot-photo');
        if (img && photo.url) img.src = photo.url;
      }
    } else {
      // Never force-replace on arrival — fill empty glass slots first.
      placePhotoInMosaic(photo, { shine: isNew, force: false });
    }
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

function onWallSettingsEvent(ev) {
  try {
    const wall = JSON.parse(ev.data);
    const prevCompleted = !!wallCfg.completedView;
    wallCfg = { ...wallCfg, ...wall };
    updateMosaicBranding();
    if (viewMode === 'mosaic' && prevCompleted !== !!wallCfg.completedView) {
      applyMosaicLayoutMode(true);
    }
  } catch {
    /* ignore */
  }
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
  es.addEventListener('wall.settings', onWallSettingsEvent);

  if (wallSettingsEs) {
    wallSettingsEs.close();
    wallSettingsEs = null;
  }
  // Session galleries need wall settings stream for completed-view toggles.
  if (!String(url).includes('/api/wall/stream')) {
    wallSettingsEs = new EventSource('/api/wall/stream');
    wallSettingsEs.addEventListener('wall.settings', onWallSettingsEvent);
  }
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
  mosaicResizeTimer = setTimeout(() => applyMosaicLayoutMode(true), 280);
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
