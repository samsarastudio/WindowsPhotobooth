function parseRoute() {
  const parts = location.pathname.replace(/^\/+|\/+$/g, '').split('/').filter(Boolean);
  if (parts[0] === 'admin') return { kind: 'admin' };
  if (parts.length === 0) return { kind: 'home' };
  if (parts.length >= 3 && parts[1] === 'p') {
    return { kind: 'photo', slug: parts[0], photoId: parts[2] };
  }
  return { kind: 'session', slug: parts[0] };
}

const els = {
  title: document.getElementById('sessionTitle'),
  meta: document.getElementById('sessionMeta'),
  status: document.getElementById('status'),
  empty: document.getElementById('empty'),
  grid: document.getElementById('grid'),
  lightbox: document.getElementById('lightbox'),
  lbImg: document.getElementById('lbImg'),
  lbVariant: document.getElementById('lbVariant'),
  lbDownload: document.getElementById('lbDownload'),
  slideshow: document.getElementById('slideshow'),
  ssImg: document.getElementById('ssImg'),
  ssToggle: document.getElementById('ssToggle'),
};

/** @type {any[]} */
let photos = [];
let index = 0;
let es = null;
let ssTimer = null;
let ssPlaying = false;

function setStatus(msg, show = true) {
  els.status.hidden = !show;
  els.status.textContent = msg || '';
}

function renderGrid() {
  els.grid.innerHTML = '';
  els.empty.hidden = photos.length > 0;
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

function upsertPhoto(photo, animate = true) {
  const i = photos.findIndex((p) => p.id === photo.id);
  if (i >= 0) photos[i] = photo;
  else photos.push(photo);
  photos.sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)));
  renderGrid();
  if (animate) {
    const el = els.grid.querySelector(`[data-id="${photo.id}"]`);
    if (el) el.style.animation = 'none';
    requestAnimationFrame(() => {
      if (el) el.style.animation = '';
    });
  }
}

function openLightbox(i) {
  if (i < 0 || i >= photos.length) return;
  index = i;
  const photo = photos[index];
  els.lbImg.src = photo.url;
  els.lbVariant.textContent = photo.variant;
  els.lbDownload.href = photo.url;
  els.lbDownload.download = `${photo.id}-${photo.variant}.jpg`;
  els.lightbox.hidden = false;
  history.replaceState(null, '', `/${encodeURIComponent(route.slug)}/p/${encodeURIComponent(photo.id)}`);
}

function closeLightbox() {
  els.lightbox.hidden = true;
  history.replaceState(null, '', `/${encodeURIComponent(route.slug)}`);
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

async function loadSession(slug) {
  setStatus('Loading gallery…');
  const res = await fetch(`/api/sessions/${encodeURIComponent(slug)}`);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    setStatus(data.error || 'Gallery unavailable');
    els.empty.hidden = true;
    return;
  }
  setStatus('', false);
  els.title.textContent = data.session.title || slug;
  els.meta.textContent = `Expires ${new Date(data.session.expiresAt).toLocaleString()} · ${data.session.photos.length} photos`;
  photos = data.session.photos || [];
  renderGrid();

  if (route.kind === 'photo' && route.photoId) {
    const i = photos.findIndex((p) => p.id === route.photoId);
    if (i >= 0) openLightbox(i);
  }

  if (es) es.close();
  es = new EventSource(`/api/sessions/${encodeURIComponent(slug)}/stream`);
  es.addEventListener('photo.added', (ev) => {
    try {
      const photo = JSON.parse(ev.data);
      upsertPhoto(photo, true);
      els.meta.textContent = `Live · ${photos.length} photos · expires ${new Date(data.session.expiresAt).toLocaleDateString()}`;
    } catch {
      /* ignore */
    }
  });
}

const route = parseRoute();

document.getElementById('btnSlideshow')?.addEventListener('click', openSlideshow);
document.getElementById('lbClose')?.addEventListener('click', closeLightbox);
document.getElementById('lbPrev')?.addEventListener('click', () => openLightbox(index - 1));
document.getElementById('lbNext')?.addEventListener('click', () => openLightbox(index + 1));
document.getElementById('ssPrev')?.addEventListener('click', () => showSs(index - 1));
document.getElementById('ssNext')?.addEventListener('click', () => showSs(index + 1));
document.getElementById('ssExit')?.addEventListener('click', () => {
  stopSs();
  els.slideshow.hidden = true;
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
    }
    if (e.key === 'ArrowLeft') showSs(index - 1);
    if (e.key === 'ArrowRight') showSs(index + 1);
  }
});

if (route.kind === 'home') {
  els.title.textContent = 'Moments';
  setStatus('Open a session gallery from your photobooth share link, e.g. /onam-2026-08-01');
  els.empty.hidden = true;
  document.getElementById('btnSlideshow').hidden = true;
} else if (route.kind === 'session' || route.kind === 'photo') {
  loadSession(route.slug).catch((e) => setStatus(String(e)));
}
