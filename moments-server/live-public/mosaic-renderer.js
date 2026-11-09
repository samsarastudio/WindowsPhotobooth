// Ported from public/js/gallery.js: original Moments mosaic rendering and motion.
export function createMosaic(stage) {
const els={mosaicStage:stage};
let wallCfg={},photos=[],viewMode='mosaic',mosaicSlots=[],mosaicRotateCursor=0,mosaicPackedSig='';
const mosaicPhotoSlot=new Map(),MOSAIC_CELL_ASPECT=1.5;
let mosaicShineTimer,mosaicRotateTimer,mosaicDriftTimer,mosaicRevealTimer,mosaicRevealHideTimer;
const thumbSrc=p=>p.url;
const pending=new Set();
const later=(fn,ms)=>{const id=setTimeout(()=>{pending.delete(id);fn();},ms);pending.add(id);return id;};
const cancelLater=id=>{clearTimeout(id);pending.delete(id);};
function cancelAnimations(){for(const id of pending)clearTimeout(id);pending.clear();}
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
  ensureMosaicBrandReveal();
}

function ensureMosaicBrandReveal() {
  if (!els.mosaicStage) return;
  if (els.mosaicBrandReveal && els.mosaicStage.contains(els.mosaicBrandReveal)) return;
  const overlay = document.createElement('div');
  overlay.id = 'mosaicBrandReveal';
  overlay.className = 'mosaic-brand-reveal';
  overlay.hidden = true;
  overlay.setAttribute('aria-hidden', 'true');
  overlay.innerHTML =
    '<div class="mosaic-brand-reveal-inner"><img id="mosaicBrandRevealLogo" class="mosaic-brand-reveal-logo" alt="" hidden /><p id="mosaicBrandRevealText" class="mosaic-brand-reveal-text" hidden></p></div>';
  els.mosaicStage.appendChild(overlay);
  els.mosaicBrandReveal = overlay;
  els.mosaicBrandRevealLogo = overlay.querySelector('#mosaicBrandRevealLogo');
  els.mosaicBrandRevealText = overlay.querySelector('#mosaicBrandRevealText');
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
  mosaicPackedSig = '';
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
    if(typeof photo!=='undefined')cell.dataset.id=photo.id;
    cell.setAttribute('aria-hidden', 'true');
    cell.style.setProperty('--arrive-delay', `${Math.min(i * 18, 900)}ms`);
    cell.innerHTML =
      '<span class="mosaic-slot-card"><img class="mosaic-slot-photo" alt="" decoding="async" loading="lazy" /><span class="mosaic-slot-shine" aria-hidden="true"></span></span>';
    const img = cell.querySelector('.mosaic-slot-photo');
    if (img) {
      img.src = thumbSrc(photo);
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
  // Virtual unit grid — tiles span 1 or 4 cells. Always fill stage WIDTH.
  const cols = stageW >= 1500 ? 8 : stageW >= 1100 ? 6 : stageW >= 720 ? 5 : 4;
  const cellW = (stageW - pad * 2 - gap * (cols - 1)) / cols;
  const cellH = cellW / MOSAIC_CELL_ASPECT;
  const rows = Math.max(3, Math.floor((stageH - pad * 2 + gap) / (cellH + gap)));
  return { stageW, stageH, pad, gap, cols, rows, cellW, cellH };
}

function mosaicLayoutSignature() {
  const m = mosaicGridMetrics();
  return `${m.cols}x${m.rows}:${Math.round(m.stageW)}x${Math.round(m.stageH)}`;
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

/** Pick a span in grid cells: 1×1 or full 2×2. Cards always fill the reserved cells. */
function pickMosaicSpan(rand, freeCells, colsLeft, rowsLeft) {
  const can4 = freeCells >= 4 && colsLeft >= 2 && rowsLeft >= 2;
  if (can4 && rand() < 0.22) return { spanC: 2, spanR: 2, grids: 4 };
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
  const pushSlot = (r, c, spanC, spanR, grids) => {
    mark(r, c, spanC, spanR);
    const reserveW = cellW * spanC + gap * (spanC - 1);
    const reserveH = cellH * spanR + gap * (spanR - 1);
    const reserveX = pad + c * (cellW + gap);
    const reserveY = pad + r * (cellH + gap);
    const card = fitLandscapeCard(reserveX, reserveY, reserveW, reserveH);
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
    pushSlot(r, c, 2, 2, 4);
    heroes++;
  }

  // Pack remaining as 1×1, with occasional extra 2×2 if it still fits
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (occupied[r][c]) continue;
      const free = freeCount();
      let span = pickMosaicSpan(rand, free, cols - c, rows - r);
      if (!canPlace(r, c, span.spanC, span.spanR)) {
        span = { spanC: 1, spanR: 1, grids: 1 };
        if (!canPlace(r, c, 1, 1)) continue;
      }
      pushSlot(r, c, span.spanC, span.spanR, span.grids);
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
  syncBrandRevealContent();
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
  const filled = !!slot.photoId || slot.el.classList.contains('is-filled');
  slot.el.classList.toggle('is-focus', filled && (!!slot.focus || slot.grids >= 4));
  slot.el.style.zIndex = filled ? (slot.grids >= 4 ? '10' : slot.grids === 2 ? '9' : '8') : '1';
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
  slot.photoId = null;delete slot.el.dataset.id;
  slot.el.classList.remove('is-filled', 'is-shine', 'is-swoosh', 'is-vanish', 'is-focus');
  slot.el.classList.add('is-empty');
  slot.el.style.zIndex = '1';
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
    slot.photoId = photo.id;slot.el.dataset.id=photo.id;
    mosaicPhotoSlot.set(photo.id, slotIndex);
    slot.el.classList.remove('is-empty', 'is-vanish');
    slot.el.classList.add('is-filled');
    if (slot.focus || opts.focus) slot.el.classList.add('is-focus');
    else slot.el.classList.remove('is-focus');
    slot.el.style.zIndex = slot.grids >= 4 || opts.focus ? '10' : slot.grids === 2 ? '9' : '8';
    const img = slot.el.querySelector('.mosaic-slot-photo');
    if (img) {
      img.src = thumbSrc(photo);
      img.alt = '';
    }
    slot.el.classList.remove('is-swoosh', 'is-shine');
    void slot.el.offsetWidth;
    slot.el.classList.add('is-swoosh');
    if (opts.shine !== false) slot.el.classList.add('is-shine');
    later(() => {
      slot.el.classList.remove('is-swoosh');
      slot.el.classList.remove('is-shine');
    }, 900);
  };

  if (opts.animate && slot.photoId) {
    slot.el.classList.add('is-vanish');
    later(applyContent, 280);
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
    if (img && photo.url) img.src = thumbSrc(photo);
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
  mosaicPackedSig = mosaicLayoutSignature();
  updateMosaicBranding();

  const scan = document.createElement('div');
  scan.className = 'mosaic-scan';
  scan.setAttribute('aria-hidden', 'true');
  els.mosaicStage.appendChild(scan);

  layouts.forEach((layout, i) => {
    const cell = document.createElement('div');
    cell.className = 'mosaic-slot is-empty';
    if (layout.grids === 2) cell.classList.add('is-span-2');
    if (layout.grids === 4) cell.classList.add('is-span-4');
    cell.dataset.slot = String(i);
    if(typeof photo!=='undefined')cell.dataset.id=photo.id;
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
  if (fullRebuild || !mosaicSlots.length || mosaicLayoutSignature() !== mosaicPackedSig) {
    buildMosaicCollage();
    const order = [...photos];
    const rand = seededRandom(order.length * 97 + mosaicSlots.length * 13);
    for (let i = order.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      [order[i], order[j]] = [order[j], order[i]];
    }
    // Fill up to cap; extras wait for rotation so guests still see theirs
    order.slice(0, mosaicFillCap()).forEach((photo, i) => {
      later(() => {
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
  later(() => slot.el.classList.remove('is-shine'), 1100);
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
  later(() => {
    slotA.el.classList.add('is-vanish');
    slotB.el.classList.add('is-vanish');
    later(() => {
      applySlotGeometry(slotA, geomB);
      applySlotGeometry(slotB, geomA);
      slotA.el.classList.remove('is-vanish');
      slotB.el.classList.remove('is-vanish');
      slotA.el.classList.add('is-swoosh');
      slotB.el.classList.add('is-swoosh');
      later(() => {
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

function swapMosaicSlotPhotos(i, j) {
  const a = mosaicSlots[i];
  const b = mosaicSlots[j];
  if (!a?.photoId || !b?.photoId || a.photoId === b.photoId) return;
  const photoA = photos.find((p) => p.id === a.photoId);
  const photoB = photos.find((p) => p.id === b.photoId);
  if (!photoA || !photoB) return;
  mosaicPhotoSlot.delete(a.photoId);
  mosaicPhotoSlot.delete(b.photoId);
  a.photoId = null;
  b.photoId = null;
  fillMosaicSlot(i, photoB, { animate: true, shine: true });
  fillMosaicSlot(j, photoA, { animate: true, shine: true });
}

function peekMosaicBackdrop(slot) {
  if (!slot?.el) return;
  slot.el.classList.add('is-vanish');
  later(() => slot.el.classList.remove('is-vanish'), 480);
}

function rotateMosaicPhotos() {
  if (viewMode !== 'mosaic' || isCompletedView() || !mosaicSlots.length || photos.length < 1) return;

  const visible = new Set([...mosaicPhotoSlot.keys()]);
  const unseen = photos.filter((p) => !visible.has(p.id));
  for (const photo of unseen) {
    if (!mosaicSlots.some((s) => !s.photoId)) break;
    placePhotoInMosaic(photo, { shine: true, force: false });
  }

  if (Math.random() < 0.7) {
    const moves = pickMosaicSizeMoves(Math.min(3, Math.max(1, Math.floor(mosaicPhotoSlot.size / 2) || 1)));
    moves.forEach((m, n) => animateSlotGeometrySwap(m.a.s, m.b.s, n * 140));
  }

  const stillUnseen = photos.filter((p) => !mosaicPhotoSlot.has(p.id));
  const filled = mosaicSlots.map((s, i) => ({ s, i })).filter((x) => x.s.photoId);
  const take = Math.min(2, Math.max(1, Math.ceil(mosaicSlots.length * 0.12)));

  if (stillUnseen.length) {
    const emptiesLeft = mosaicSlots.filter((s) => !s.photoId).length;
    for (let n = 0; n < Math.min(take, stillUnseen.length); n++) {
      const photo = stillUnseen[(mosaicRotateCursor + n) % stillUnseen.length];
      later(
        () =>
          placePhotoInMosaic(photo, {
            force: emptiesLeft === 0 || n === 0,
            shine: true,
            animate: true,
            focus: false,
          }),
        400 + n * 240,
      );
    }
    mosaicRotateCursor = (mosaicRotateCursor + take) % stillUnseen.length;
    return;
  }

  if (photos.length >= 2 && filled.length >= 2) {
    const shuffled = [...filled].sort(() => Math.random() - 0.5);
    swapMosaicSlotPhotos(shuffled[0].i, shuffled[1].i);
    if (take > 1 && shuffled.length >= 4) {
      later(() => swapMosaicSlotPhotos(shuffled[2].i, shuffled[3].i), 280);
    }
    return;
  }

  if (filled.length) {
    peekMosaicBackdrop(filled[Math.floor(Math.random() * filled.length)].s);
  }
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

function clampBrandRevealSeconds(value, fallback, min, max) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.round(n)));
}

function brandRevealHasAsset() {
  return !!(wallCfg.brandLogoUrl || (wallCfg.brandText || '').trim());
}

function syncBrandRevealContent() {
  const overlay = els.mosaicBrandReveal;
  const logoEl = els.mosaicBrandRevealLogo;
  const textEl = els.mosaicBrandRevealText;
  if (!overlay) return;
  const logoUrl = (wallCfg.brandLogoUrl || '').trim();
  const text = (wallCfg.brandText || '').trim();
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

function hideBrandReveal() {
  if (mosaicRevealHideTimer) {
    cancelLater(mosaicRevealHideTimer);
    mosaicRevealHideTimer = null;
  }
  const overlay = els.mosaicBrandReveal;
  if (!overlay) return;
  overlay.classList.remove('is-on');
  overlay.hidden = true;
}

function showBrandReveal(holdMs) {
  const overlay = els.mosaicBrandReveal;
  if (!overlay || !brandRevealHasAsset() || !wallCfg.brandRevealEnabled) return;
  syncBrandRevealContent();
  overlay.hidden = false;
  requestAnimationFrame(() => overlay.classList.add('is-on'));
  if (mosaicRevealHideTimer) cancelLater(mosaicRevealHideTimer);
  mosaicRevealHideTimer = later(hideBrandReveal, holdMs);
}

function startBrandRevealLoop() {
  stopBrandRevealLoop();
  if (viewMode !== 'mosaic') return;
  if (!wallCfg.brandRevealEnabled || !brandRevealHasAsset()) return;
  const interval = clampBrandRevealSeconds(wallCfg.brandRevealSeconds, 45, 10, 600) * 1000;
  const hold = clampBrandRevealSeconds(wallCfg.brandRevealHoldSeconds, 6, 3, 30) * 1000;
  mosaicRevealTimer = setInterval(() => showBrandReveal(hold), interval);
}

function stopBrandRevealLoop() {
  if (mosaicRevealTimer) clearInterval(mosaicRevealTimer);
  mosaicRevealTimer = null;
  hideBrandReveal();
}

function startMosaicLoops() {
  stopMosaicLoops();
  if (isCompletedView()) {
    mosaicRotateTimer = setInterval(rotateCompletedWindow, 14000);
    startBrandRevealLoop();
    return;
  }
  mosaicShineTimer = setInterval(shineRandomMosaicTile, 4200);
  mosaicRotateTimer = setInterval(rotateMosaicPhotos, 7000);
  mosaicDriftTimer = setInterval(driftMosaicSlots, 14000);
  startBrandRevealLoop();
}

function stopMosaicLoops() {
  if (mosaicShineTimer) clearInterval(mosaicShineTimer);
  if (mosaicRotateTimer) clearInterval(mosaicRotateTimer);
  if (mosaicDriftTimer) clearInterval(mosaicDriftTimer);
  mosaicShineTimer = null;
  mosaicRotateTimer = null;
  mosaicDriftTimer = null;
  stopBrandRevealLoop();
}


let signature='';
const observer=new ResizeObserver(()=>{cancelAnimations();applyMosaicLayoutMode(true);});observer.observe(stage);
return { update(list,settings){const next=JSON.stringify([list,settings]);if(next===signature)return;signature=next;cancelAnimations();stopMosaicLoops();photos=list;wallCfg={...settings,mosaicTargetUrl:settings.backdropUrl,brandLogoUrl:settings.logoUrl};applyMosaicLayoutMode(true);}, clear(){cancelAnimations();stopMosaicLoops();photos=[];signature='';stage.replaceChildren();mosaicSlots=[];mosaicPhotoSlot.clear();}, destroy(){this.clear();observer.disconnect();} };
}
