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
  mosaic: document.getElementById('mosaic'),
  mosaicStage: document.getElementById('mosaicStage'),
  mosaicGrid: null,
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
/** @type {{ el: HTMLElement, photoId: string | null, color: string, weight: number }[]} */
let mosaicCells = [];
/** @type {Map<string, number>} photoId -> cell index */
const mosaicPhotoCell = new Map();
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
let mosaicReshuffleTimer = null;
/** 6×4 postcard cell aspect (width/height) */
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
  document.body.classList.toggle('is-mosaic', immersive);
  document.body.classList.toggle('is-slideshow-route', mode === 'slideshow');
  if (els.topBar) els.topBar.hidden = immersive;
  els.grid.hidden = mode !== 'grid';
  els.mosaic.hidden = mode !== 'mosaic';
  if (mode === 'grid') {
    els.empty.hidden = photos.length > 0;
    renderGrid();
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
  if (push && route.kind !== 'home') {
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

function seededRandom(seed) {
  let s = seed % 2147483647;
  if (s <= 0) s += 2147483646;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

function mosaicGridSize() {
  const stageW = Math.max(320, els.mosaicStage?.clientWidth || window.innerWidth || 1200);
  const stageH = Math.max(240, els.mosaicStage?.clientHeight || window.innerHeight || 800);
  let cols = Math.min(28, Math.max(8, Number(wallCfg.columns) || 16));
  let cellW = stageW / cols;
  let cellH = cellW / MOSAIC_CELL_ASPECT; // 6:4 → height = width * 4/6
  let rows = Math.max(3, Math.floor(stageH / cellH));
  // Recenter fit if vertical leftover is huge
  if (rows * cellH < stageH * 0.72) {
    cols = Math.max(8, cols - 2);
    cellW = stageW / cols;
    cellH = cellW / MOSAIC_CELL_ASPECT;
    rows = Math.max(3, Math.floor(stageH / cellH));
  }
  const gridW = stageW;
  const gridH = rows * cellH;
  return { cols, rows, gridW, gridH };
}

function defaultCellColors(cols, rows) {
  const cells = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const t = (r / Math.max(1, rows - 1) + c / Math.max(1, cols - 1)) / 2;
      const g = Math.round(55 + t * 40);
      const color = `rgb(${40 + Math.round(t * 20)}, ${g}, ${50 + Math.round(t * 25)})`;
      cells.push({ color, weight: 0.35 + t * 0.4 });
    }
  }
  return cells;
}

async function sampleMosaicTarget(url, cols, rows) {
  if (!url) return defaultCellColors(cols, rows);
  try {
    const img = new Image();
    img.decoding = 'async';
    img.crossOrigin = 'anonymous';
    await new Promise((resolve, reject) => {
      img.onload = resolve;
      img.onerror = reject;
      img.src = url;
    });
    const canvas = document.createElement('canvas');
    canvas.width = cols;
    canvas.height = rows;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return defaultCellColors(cols, rows);
    ctx.drawImage(img, 0, 0, cols, rows);
    const data = ctx.getImageData(0, 0, cols, rows).data;
    const cells = [];
    for (let i = 0; i < cols * rows; i++) {
      const o = i * 4;
      const r = data[o];
      const g = data[o + 1];
      const b = data[o + 2];
      const a = data[o + 3] / 255;
      const luma = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
      // Prefer filling higher-contrast / more opaque regions first
      const weight = a * (0.25 + Math.abs(luma - 0.5) * 1.2);
      cells.push({
        color: `rgb(${r}, ${g}, ${b})`,
        weight: Math.max(0.08, weight),
      });
    }
    return cells;
  } catch {
    return defaultCellColors(cols, rows);
  }
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

function clearMosaicCell(cell) {
  if (!cell?.el) return;
  cell.photoId = null;
  cell.el.classList.remove('is-filled', 'is-shine', 'is-float');
  cell.el.classList.add('is-empty');
  const img = cell.el.querySelector('.mosaic-cell-photo');
  if (img) {
    img.removeAttribute('src');
    img.alt = '';
  }
}

function fillMosaicCell(cellIndex, photo, opts = {}) {
  const cell = mosaicCells[cellIndex];
  if (!cell || !photo?.id) return;
  if (cell.photoId && mosaicPhotoCell.get(cell.photoId) === cellIndex) {
    mosaicPhotoCell.delete(cell.photoId);
  }
  const prevIdx = mosaicPhotoCell.get(photo.id);
  if (prevIdx != null && prevIdx !== cellIndex && mosaicCells[prevIdx]) {
    clearMosaicCell(mosaicCells[prevIdx]);
  }
  cell.photoId = photo.id;
  mosaicPhotoCell.set(photo.id, cellIndex);
  cell.el.classList.remove('is-empty');
  cell.el.classList.add('is-filled', 'is-float');
  const img = cell.el.querySelector('.mosaic-cell-photo');
  if (img) {
    img.src = photo.url;
    img.alt = '';
  }
  if (opts.shine !== false) {
    cell.el.classList.remove('is-shine');
    void cell.el.offsetWidth;
    cell.el.classList.add('is-shine');
    setTimeout(() => cell.el.classList.remove('is-shine'), 1200);
  }
  cell.el.onclick = () => {
    const i = photos.findIndex((p) => p.id === photo.id);
    if (i >= 0) openLightbox(i);
  };
}

function pickMosaicCellForPhoto(preferEmpty = true) {
  if (!mosaicCells.length) return -1;
  if (preferEmpty) {
    const empty = mosaicCells
      .map((c, i) => ({ i, w: c.weight, empty: !c.photoId }))
      .filter((x) => x.empty)
      .sort((a, b) => b.w - a.w);
    if (empty.length) {
      // Weighted random among top candidates
      const top = empty.slice(0, Math.max(3, Math.ceil(empty.length * 0.35)));
      const sum = top.reduce((a, x) => a + x.w, 0) || 1;
      let r = Math.random() * sum;
      for (const x of top) {
        r -= x.w;
        if (r <= 0) return x.i;
      }
      return top[0].i;
    }
  }
  // Replace a lower-weight filled cell
  const filled = mosaicCells
    .map((c, i) => ({ i, w: c.weight, empty: !c.photoId }))
    .filter((x) => !x.empty)
    .sort((a, b) => a.w - b.w);
  if (!filled.length) return 0;
  return filled[Math.floor(Math.random() * Math.min(filled.length, 6))].i;
}

function placePhotoInMosaic(photo, opts = {}) {
  if (!photo?.id || viewMode !== 'mosaic') return;
  if (mosaicPhotoCell.has(photo.id) && !opts.force) {
    const idx = mosaicPhotoCell.get(photo.id);
    const cell = mosaicCells[idx];
    const img = cell?.el?.querySelector('.mosaic-cell-photo');
    if (img && photo.url) img.src = photo.url;
    return;
  }
  const idx = pickMosaicCellForPhoto(true);
  if (idx < 0) return;
  fillMosaicCell(idx, photo, opts);
}

async function buildMosaicGrid() {
  if (!els.mosaicStage) return;
  updateMosaicBranding();
  const { cols, rows, gridW, gridH } = mosaicGridSize();
  const samples = await sampleMosaicTarget(wallCfg.mosaicTargetUrl || '', cols, rows);

  els.mosaicStage.innerHTML = '';
  mosaicCells = [];
  mosaicPhotoCell.clear();

  const grid = document.createElement('div');
  grid.className = 'mosaic-grid';
  grid.style.setProperty('--mosaic-cols', String(cols));
  grid.style.setProperty('--mosaic-rows', String(rows));
  grid.style.width = `${gridW}px`;
  grid.style.height = `${gridH}px`;
  els.mosaicGrid = grid;

  for (let i = 0; i < cols * rows; i++) {
    const sample = samples[i] || { color: '#2a332e', weight: 0.3 };
    const cell = document.createElement('button');
    cell.type = 'button';
    cell.className = 'mosaic-cell is-empty';
    cell.style.setProperty('--cell-color', sample.color);
    cell.innerHTML =
      '<img class="mosaic-cell-photo" alt="" decoding="async" /><span class="mosaic-cell-tint" aria-hidden="true"></span><span class="mosaic-cell-shine" aria-hidden="true"></span>';
    grid.appendChild(cell);
    mosaicCells.push({
      el: cell,
      photoId: null,
      color: sample.color,
      weight: sample.weight,
    });
  }
  els.mosaicStage.appendChild(grid);
}

async function renderMosaic(fullRebuild = false) {
  if (!els.mosaicStage) return;
  if (fullRebuild || !mosaicCells.length) {
    await buildMosaicGrid();
    const order = [...photos];
    const rand = seededRandom(order.length * 97 + (wallCfg.columns || 16) * 13);
    for (let i = order.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      [order[i], order[j]] = [order[j], order[i]];
    }
    order.forEach((photo, i) => {
      setTimeout(() => {
        if (viewMode !== 'mosaic') return;
        placePhotoInMosaic(photo, { shine: true });
      }, Math.min(i * 55, 2400));
    });
    return;
  }
  for (const photo of photos) {
    if (!mosaicPhotoCell.has(photo.id)) placePhotoInMosaic(photo, { shine: true });
  }
}

function shineRandomMosaicTile() {
  if (viewMode !== 'mosaic') return;
  const filled = mosaicCells.filter((c) => c.photoId);
  if (!filled.length) return;
  const cell = filled[Math.floor(Math.random() * filled.length)];
  cell.el.classList.remove('is-shine');
  void cell.el.offsetWidth;
  cell.el.classList.add('is-shine');
  setTimeout(() => cell.el.classList.remove('is-shine'), 1100);
}

function reshuffleMosaicPhotos() {
  if (viewMode !== 'mosaic' || photos.length < 2 || mosaicCells.length < 2) return;
  // Move a few photos into empty/high-weight cells — keeps mosaic alive without breaking composition
  const empties = mosaicCells.map((c, i) => ({ c, i })).filter((x) => !x.c.photoId);
  if (!empties.length) return;
  const movers = [...photos].sort(() => Math.random() - 0.5).slice(0, Math.min(3, empties.length));
  movers.forEach((photo, n) => {
    setTimeout(() => placePhotoInMosaic(photo, { force: true, shine: true }), n * 180);
  });
}

function startMosaicLoops() {
  stopMosaicLoops();
  mosaicShineTimer = setInterval(shineRandomMosaicTile, 3600);
  mosaicReshuffleTimer = setInterval(reshuffleMosaicPhotos, 16000);
}

function stopMosaicLoops() {
  if (mosaicShineTimer) clearInterval(mosaicShineTimer);
  if (mosaicReshuffleTimer) clearInterval(mosaicReshuffleTimer);
  mosaicShineTimer = null;
  mosaicReshuffleTimer = null;
}

function upsertPhoto(photo) {
  if (!photo?.id || photo.variant === 'original') return;
  const i = photos.findIndex((p) => p.id === photo.id);
  const isNew = i < 0;
  if (i >= 0) photos[i] = photo;
  else photos.push(photo);
  photos.sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)));
  if (viewMode === 'grid') renderGrid();
  else if (viewMode === 'mosaic') {
    placePhotoInMosaic(photo, { shine: isNew, force: false });
  }
  if (els.meta) els.meta.textContent = `${photos.length} photos`;
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
  els.meta.textContent = `Expires ${new Date(data.session.expiresAt).toLocaleString()} · ${photos.length} photos`;
  connectStream(`/api/sessions/${encodeURIComponent(slug)}/stream`);

  if (route.kind === 'photo' && route.photoId) {
    setMode('grid', false);
    const i = photos.findIndex((p) => p.id === route.photoId);
    if (i >= 0) openLightbox(i);
  } else {
    setMode(route.mode || 'grid', false);
  }
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
