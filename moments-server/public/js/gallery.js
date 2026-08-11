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
  wallOverlay: document.getElementById('wallOverlay'),
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
/** @type {Map<string, HTMLElement>} */
const mosaicTiles = new Map();
let index = 0;
let es = null;
let ssTimer = null;
let ssPlaying = false;
let viewMode = 'grid';
let wallCfg = { title: 'Wall of moments', overlay: '', columns: 14, emptyRatio: 0.22 };
let route = parseRoute();
let mosaicShineTimer = null;

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
    renderMosaic(true);
    startMosaicShineLoop();
  } else {
    stopMosaicShineLoop();
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

function mosaicSizeFor(rand) {
  const roll = rand();
  const vw = Math.max(320, window.innerWidth || 1200);
  const base = Math.min(220, Math.max(96, vw * 0.11));
  if (roll < 0.18) return base * 1.55;
  if (roll < 0.45) return base * 1.2;
  if (roll < 0.75) return base;
  return base * 0.72;
}

function mosaicLayoutFor(photo, rand) {
  const stageW = els.mosaicStage?.clientWidth || window.innerWidth || 1200;
  const stageH = els.mosaicStage?.clientHeight || window.innerHeight || 800;
  const size = mosaicSizeFor(rand);
  const h = size * 1.28;
  const pad = 12;
  let x = pad + rand() * Math.max(20, stageW - size - pad * 2);
  let y = pad + rand() * Math.max(20, stageH - h - pad * 2);
  for (let attempt = 0; attempt < 8; attempt++) {
    let crowded = false;
    for (const el of mosaicTiles.values()) {
      const ox = parseFloat(el.style.getPropertyValue('--mx')) || 0;
      const oy = parseFloat(el.style.getPropertyValue('--my')) || 0;
      const os = parseFloat(el.style.getPropertyValue('--sz')) || size;
      const oh = os * 1.28;
      const dx = x + size / 2 - (ox + os / 2);
      const dy = y + h / 2 - (oy + oh / 2);
      if (Math.hypot(dx, dy) < Math.min(size, os) * 0.55) {
        crowded = true;
        break;
      }
    }
    if (!crowded) break;
    x = pad + rand() * Math.max(20, stageW - size - pad * 2);
    y = pad + rand() * Math.max(20, stageH - h - pad * 2);
  }
  const rot = (rand() - 0.5) * 10;
  const floatDur = 10 + rand() * 12;
  const floatDelay = -rand() * 8;
  return { x, y, size, rot, floatDur, floatDelay };
}

function placeMosaicTile(photo, opts = {}) {
  if (!els.mosaicStage || !photo?.id) return null;
  const existing = mosaicTiles.get(photo.id);
  if (existing) {
    const img = existing.querySelector('img');
    if (img && photo.url) img.src = photo.url;
    return existing;
  }

  const seed =
    Array.from(String(photo.id)).reduce((a, c) => a + c.charCodeAt(0), 0) * 97 +
    photos.length * 13;
  const rand = seededRandom(seed + (opts.seedJitter || 0));
  const layout = mosaicLayoutFor(photo, rand);

  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'mosaic-tile' + (opts.enter ? ' is-entering is-shine' : '');
  btn.dataset.id = photo.id;
  btn.style.setProperty('--mx', `${layout.x}px`);
  btn.style.setProperty('--my', `${layout.y}px`);
  btn.style.setProperty('--sz', `${layout.size}px`);
  btn.style.setProperty('--rot', `${layout.rot}deg`);
  btn.style.setProperty('--float-dur', `${layout.floatDur}s`);
  btn.style.setProperty('--float-delay', `${layout.floatDelay}s`);
  btn.style.zIndex = String(1 + Math.floor(rand() * 4));
  btn.innerHTML = `<span class="mosaic-tile-frame"><img src="${photo.url}" alt="" loading="lazy" decoding="async" /></span>`;
  btn.addEventListener('click', () => openLightbox(photos.findIndex((p) => p.id === photo.id)));
  if (opts.enter) {
    btn.addEventListener(
      'animationend',
      (ev) => {
        if (ev.animationName === 'mosaicArrive') btn.classList.remove('is-entering');
      },
      { once: true },
    );
    setTimeout(() => btn.classList.remove('is-shine'), 1600);
  }
  els.mosaicStage.appendChild(btn);
  mosaicTiles.set(photo.id, btn);
  return btn;
}

function updateMosaicWatermark() {
  if (!els.wallOverlay) return;
  if (wallCfg.overlay) {
    els.wallOverlay.hidden = false;
    els.wallOverlay.textContent = wallCfg.overlay;
  } else {
    els.wallOverlay.hidden = true;
  }
}

function renderMosaic(fullRebuild = false) {
  if (!els.mosaicStage) return;
  updateMosaicWatermark();

  if (fullRebuild) {
    els.mosaicStage.innerHTML = '';
    mosaicTiles.clear();
    const order = [...photos];
    const rand = seededRandom(order.length * 97 + (wallCfg.columns || 14) * 13);
    for (let i = order.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      [order[i], order[j]] = [order[j], order[i]];
    }
    order.forEach((photo, i) => {
      setTimeout(() => {
        if (viewMode !== 'mosaic') return;
        placeMosaicTile(photo, { enter: true, seedJitter: i * 17 });
      }, Math.min(i * 90, 2800));
    });
    return;
  }

  for (const photo of photos) {
    if (!mosaicTiles.has(photo.id)) {
      placeMosaicTile(photo, { enter: true, seedJitter: Date.now() % 1000 });
    }
  }
}

function shineRandomMosaicTile() {
  if (viewMode !== 'mosaic' || !mosaicTiles.size) return;
  const tiles = [...mosaicTiles.values()];
  const tile = tiles[Math.floor(Math.random() * tiles.length)];
  if (!tile) return;
  tile.classList.remove('is-shine');
  void tile.offsetWidth;
  tile.classList.add('is-shine');
  setTimeout(() => tile.classList.remove('is-shine'), 1500);
}

function startMosaicShineLoop() {
  stopMosaicShineLoop();
  mosaicShineTimer = setInterval(shineRandomMosaicTile, 3200);
}

function stopMosaicShineLoop() {
  if (mosaicShineTimer) clearInterval(mosaicShineTimer);
  mosaicShineTimer = null;
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
    if (isNew) placeMosaicTile(photo, { enter: true, seedJitter: Date.now() % 997 });
    else placeMosaicTile(photo);
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
