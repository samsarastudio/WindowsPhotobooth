const pinEl = document.getElementById('pin');
const loginCard = document.getElementById('loginCard');
const panel = document.getElementById('panel');
const loginErr = document.getElementById('loginErr');
const adminStatus = document.getElementById('adminStatus');
const sessionList = document.getElementById('sessionList');
const ttlEl = document.getElementById('ttl');
const frameList = document.getElementById('frameList');
const wallTitle = document.getElementById('wallTitle');
const wallOverlay = document.getElementById('wallOverlay');
const wallColumns = document.getElementById('wallColumns');
const wallBrandText = document.getElementById('wallBrandText');
const wallBrandPreview = document.getElementById('wallBrandPreview');
const wallMosaicTargetPreview = document.getElementById('wallMosaicTargetPreview');
const wallBackdropOpacity = document.getElementById('wallBackdropOpacity');
const wallBackdropOpacityLabel = document.getElementById('wallBackdropOpacityLabel');
const wallBrandRevealEnabled = document.getElementById('wallBrandRevealEnabled');
const wallBrandRevealSeconds = document.getElementById('wallBrandRevealSeconds');
const wallBrandRevealHoldSeconds = document.getElementById('wallBrandRevealHoldSeconds');
const wallShowOriginalPhotos = document.getElementById('wallShowOriginalPhotos');
const wallModeStatus = document.getElementById('wallModeStatus');
const photoAlbum = document.getElementById('photoAlbum');
const photoGrid = document.getElementById('photoGrid');
const photoPreview = document.getElementById('photoPreview');
const photoSelectionMeta = document.getElementById('photoSelectionMeta');
const btnBulkDeletePhotos = document.getElementById('btnBulkDeletePhotos');
const btnOpenAlbum = document.getElementById('btnOpenAlbum');
const uploadTokenEl = document.getElementById('uploadToken');
const publicBaseUrlEl = document.getElementById('publicBaseUrl');
const tokenMetaEl = document.getElementById('tokenMeta');

/** @type {any[]} */
let albumsCache = [];
/** @type {any[]} */
let photosCache = [];
let photoPage = 1;
const PHOTO_PAGE_SIZE = 24;
/** @type {string | null} */
let selectedPreviewId = null;
/** @type {Set<string>} */
const selectedPhotoIds = new Set();

function syncBackdropOpacityLabel(value) {
  const pct = Math.round(Number(value) || 0);
  if (wallBackdropOpacityLabel) wallBackdropOpacityLabel.textContent = `${pct}%`;
}

function updatePhotoSelectionUi() {
  const n = selectedPhotoIds.size;
  if (btnBulkDeletePhotos) btnBulkDeletePhotos.disabled = n === 0;
  if (photoSelectionMeta) {
    photoSelectionMeta.textContent =
      n === 0
        ? 'Select photos with the checkboxes to delete several at once.'
        : `${n} photo${n === 1 ? '' : 's'} selected.`;
  }
}

function mosaicBackdropPreviewText(url) {
  return url
    ? 'Backdrop on file ? centered behind the wall, glimpsed when photos swap.'
    : 'No backdrop yet ? choose a file, then click Upload backdrop.';
}

function syncWallModeStatus(completed) {
  if (!wallModeStatus) return;
  wallModeStatus.textContent = completed
    ? 'Completed filled grid ? dense end-of-show layout on /wall.'
    : 'Live collage ? photos float and swap during the event.';
  const btnCompleted = document.getElementById('btnShowCompletedView');
  const btnLive = document.getElementById('btnShowLiveCollage');
  if (btnCompleted) btnCompleted.disabled = !!completed;
  if (btnLive) btnLive.disabled = !completed;
}

async function setWallCompletedView(completed) {
  const r = await api('/api/admin/wall/settings', {
    method: 'PATCH',
    body: JSON.stringify({ completedView: !!completed }),
  });
  syncWallModeStatus(!!r.wall?.completedView);
  setStatus(
    r.wall?.completedView
      ? 'Wall switched to completed filled grid'
      : 'Wall switched back to live collage',
  );
  return r;
}

function pin() {
  return pinEl.value.trim();
}

function isAppleTouchDevice() {
  return (
    /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
  );
}

/** iPhone: native share tray (Save Image / AirDrop). Desktop: file download. */
async function shareOrDownloadBlob(blob, filename, mimeFallback = 'image/png') {
  const type = blob.type && blob.type !== 'application/octet-stream' ? blob.type : mimeFallback;
  if (isAppleTouchDevice() && navigator.share && navigator.canShare) {
    try {
      const file = new File([blob], filename, { type });
      if (navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file], title: 'inmoment' });
        return 'shared';
      }
    } catch (e) {
      if (e?.name === 'AbortError') return 'aborted';
    }
  }
  const obj = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = obj;
  a.download = filename;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(obj), 1500);
  return 'downloaded';
}

function setStatus(msg) {
  adminStatus.textContent = msg || '';
}

async function api(path, opts = {}) {
  const headers = {
    ...(opts.body instanceof FormData ? {} : { 'Content-Type': 'application/json' }),
    'X-Admin-Pin': pin(),
    ...(opts.headers || {}),
  };
  const res = await fetch(path, { ...opts, headers });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || res.statusText);
  return data;
}

function setTab(tab) {
  const name = String(tab || 'overview');
  document.querySelectorAll('.admin-tab').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.tab === name);
  });
  document.querySelectorAll('.admin-section').forEach((sec) => {
    const on = sec.dataset.section === name;
    sec.classList.toggle('is-active', on);
    sec.hidden = !on;
  });
  if (name === 'photos') void refreshPhotos();
  if (name === 'frames') void refreshFrames();
  if (name === 'physical') void refreshPhysicalFrames();
  if (name === 'albums') void refreshAlbums();
  if (name === 'qr') void refreshQrSection();
  if (name === 'booth') void refreshBoothUpdates();
  if (name === 'overview') void refreshQrOverviewStats();
}

function unlockAdmin() {
  document.body.classList.add('is-unlocked');
  if (loginCard) loginCard.hidden = true;
  if (panel) {
    panel.hidden = false;
    panel.removeAttribute('hidden');
  }
}

function updateOpenAlbumLink() {
  if (!btnOpenAlbum) return;
  const slug = photoAlbum?.value || '';
  btnOpenAlbum.href = slug ? `/${encodeURIComponent(slug)}` : '#';
}

document.getElementById('adminNav')?.addEventListener('click', (e) => {
  const btn = e.target.closest('.admin-tab');
  if (!btn) return;
  setTab(btn.dataset.tab);
});

async function refreshFrames() {
  const list = await api('/api/admin/frames');
  document.getElementById('statFrames').textContent = String(list.frames?.length || 0);
  frameList.innerHTML = '';
  for (const f of list.frames || []) {
    const div = document.createElement('div');
    div.className = 'frame-card';
    const ratio = frameRatioNote(f);
    div.innerHTML = `
      <img src="${f.url}?v=${Date.now()}" alt="" />
      <strong>${f.label}</strong>
      <code>${f.filename}</code>
      ${ratio ? `<p class="meta ${f.fitsGallery ? '' : 'frame-ratio-warn'}">${ratio}</p>` : ''}
      <button type="button" class="btn ghost delete">Delete</button>
    `;
    div.querySelector('.delete').addEventListener('click', async () => {
      if (!confirm(`Delete frame ${f.filename}?`)) return;
      await api(`/api/admin/frames/${encodeURIComponent(f.filename)}`, { method: 'DELETE' });
      setStatus(`Deleted frame ${f.filename}`);
      await refreshFrames();
    });
    frameList.appendChild(div);
  }
  if (!(list.frames || []).length) {
    frameList.innerHTML = '<p class="meta">No frames on the server yet — upload a PNG overlay.</p>';
  }
}

function frameRatioNote(f) {
  if (!f.width || !f.height) return '';
  if (f.fitsGallery) return `${f.width}×${f.height} · 3:2 (fills gallery)`;
  const ar = Number(f.aspectRatio) || f.width / f.height;
  if (ar > 1.65) {
    return `${f.width}×${f.height} · ~16:9 — gallery needs 3:2 (6×4, e.g. 1800×1200)`;
  }
  return `${f.width}×${f.height} · ${ar.toFixed(2)}:1 — gallery needs 3:2 (6×4)`;
}

function fillAlbumSelect() {
  if (!photoAlbum) return;
  const prev = photoAlbum.value;
  photoAlbum.innerHTML = '';
  for (const s of albumsCache) {
    const opt = document.createElement('option');
    opt.value = s.slug;
    opt.textContent = `${s.slug} (${s.photoCount} photos)`;
    photoAlbum.appendChild(opt);
  }
  if (prev && [...photoAlbum.options].some((o) => o.value === prev)) {
    photoAlbum.value = prev;
  }
  updateOpenAlbumLink();
}

async function refreshAlbums() {
  const list = await api('/api/admin/sessions');
  albumsCache = list.sessions || [];
  document.getElementById('statAlbums').textContent = String(albumsCache.length);
  document.getElementById('statPhotos').textContent = String(
    albumsCache.reduce((n, s) => n + (s.photoCount || 0), 0),
  );
  fillAlbumSelect();

  sessionList.innerHTML = '';
  if (!albumsCache.length) {
    sessionList.innerHTML = '<p class="meta">No albums yet. Use ?Add sample photos? or capture from a booth.</p>';
    return;
  }
  for (const s of albumsCache) {
    const div = document.createElement('div');
    div.className = `session-item${s.expired ? ' expired' : ''}`;
    div.innerHTML = `
      <strong>${s.slug}</strong>
      <span class="meta">${s.title} ? ${s.photoCount} photos ? expires ${new Date(s.expiresAt).toLocaleString()}${s.expired ? ' ? EXPIRED' : ''}</span>
      <div class="row wrap">
        <input class="input ttl-days" type="number" min="1" max="3650" placeholder="Extend days" style="max-width:8rem" />
        <button type="button" class="btn ghost extend">Set TTL days</button>
        <button type="button" class="btn ghost view-photos">Manage photos</button>
        <a class="btn ghost" href="/${encodeURIComponent(s.slug)}" target="_blank" rel="noopener">Grid</a>
        <a class="btn ghost" href="/${encodeURIComponent(s.slug)}/wall" target="_blank" rel="noopener">Wall</a>
        <button type="button" class="btn ghost delete">Delete album</button>
      </div>
    `;
    div.querySelector('.extend').addEventListener('click', async () => {
      const days = Number(div.querySelector('.ttl-days').value);
      if (!days) return;
      await api(`/api/admin/sessions/${encodeURIComponent(s.slug)}`, {
        method: 'PATCH',
        body: JSON.stringify({ ttlDays: days }),
      });
      setStatus(`Updated ${s.slug}`);
      await refreshAlbums();
    });
    div.querySelector('.view-photos').addEventListener('click', () => {
      photoAlbum.value = s.slug;
      updateOpenAlbumLink();
      setTab('photos');
    });
    div.querySelector('.delete').addEventListener('click', async () => {
      if (!confirm(`Delete album "${s.slug}" and all its photos?`)) return;
      await api(`/api/admin/sessions/${encodeURIComponent(s.slug)}`, { method: 'DELETE' });
      setStatus(`Deleted album ${s.slug}`);
      await refreshAll();
    });
    sessionList.appendChild(div);
  }
}

async function downloadAdminPhoto(slug, photo) {
  if (!photo?.id) return;
  setStatus('Downloading…');
  const ext =
    photo.url?.match(/\.(jpe?g|png|webp)/i)?.[0] ||
    (photo.mime?.includes('png') ? '.png' : photo.mime?.includes('webp') ? '.webp' : '.jpg');
  const filename = `${photo.variant || 'photo'}-${photo.id}${ext}`;
  const mime =
    photo.mime ||
    (ext === '.png' ? 'image/png' : ext === '.webp' ? 'image/webp' : 'image/jpeg');
  try {
    const res = await fetch(
      `/api/admin/sessions/${encodeURIComponent(slug)}/photos/${encodeURIComponent(photo.id)}/file`,
      { headers: { 'X-Admin-Pin': pin() } },
    );
    if (res.ok) {
      const how = await shareOrDownloadBlob(await res.blob(), filename, mime);
      if (how !== 'aborted') setStatus(how === 'shared' ? 'Share sheet opened.' : 'Download started.');
      return;
    }
  } catch {
    /* fall through to media URL */
  }
  try {
    if (!photo.url) throw new Error('No photo URL');
    const res = await fetch(photo.url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const how = await shareOrDownloadBlob(await res.blob(), filename, mime);
    if (how !== 'aborted') setStatus(how === 'shared' ? 'Share sheet opened.' : 'Download started.');
  } catch (e) {
    setStatus(`Download failed: ${e.message || e}`);
  }
}

function sharePageHref(slug, photo) {
  // Always same-origin relative path — never PUBLIC_BASE_URL (often wrong on Pi).
  if (slug && photo?.id) {
    return `/${encodeURIComponent(slug)}/p/${encodeURIComponent(photo.id)}`;
  }
  return photo?.sharePath || '#';
}

function startOfLocalDay(d) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

function currentPhotoKind() {
  return document.querySelector('#photoKindChips .photo-chip.is-on')?.getAttribute('data-kind') || 'all';
}

function currentPhotoWhen() {
  return document.querySelector('#photoWhenChips .photo-chip.is-on')?.getAttribute('data-when') || 'all';
}

function photoFilterRange() {
  const when = currentPhotoWhen();
  const now = new Date();
  if (when === 'today') return { from: startOfLocalDay(now), to: null };
  if (when === 'yesterday') {
    const start = startOfLocalDay(now) - 86400000;
    return { from: start, to: startOfLocalDay(now) - 1 };
  }
  if (when === 'week') return { from: startOfLocalDay(now) - 6 * 86400000, to: null };
  if (when === 'month') return { from: new Date(now.getFullYear(), now.getMonth(), 1).getTime(), to: null };
  if (when === 'custom') {
    const fromVal = document.getElementById('photoFrom')?.value;
    const toVal = document.getElementById('photoTo')?.value;
    const from = fromVal ? new Date(`${fromVal}T00:00:00`).getTime() : null;
    const to = toVal ? new Date(`${toVal}T23:59:59.999`).getTime() : null;
    return { from: Number.isFinite(from) ? from : null, to: Number.isFinite(to) ? to : null };
  }
  return { from: null, to: null };
}

function filteredAdminPhotos() {
  const kind = currentPhotoKind();
  const { from, to } = photoFilterRange();
  return photosCache.filter((p) => {
    if (kind === 'physical' && p.variant !== 'physical') return false;
    if (kind === 'normal' && p.variant === 'physical') return false;
    if (kind === 'original' && p.variant !== 'original') return false;
    if (kind === 'framed' && p.variant !== 'framed') return false;
    if (kind === 'ai' && p.variant !== 'ai') return false;
    const t = Date.parse(p.createdAt || '');
    if (Number.isFinite(t)) {
      if (from != null && t < from) return false;
      if (to != null && t > to) return false;
    }
    return true;
  });
}

function renderPhotoPager(filteredLen, pageCount) {
  const pager = document.getElementById('photoPager');
  const meta = document.getElementById('photoPagerMeta');
  if (meta) {
    meta.textContent = `${filteredLen} photo${filteredLen === 1 ? '' : 's'} · page ${photoPage} of ${pageCount}`;
  }
  if (!pager) return;
  pager.innerHTML = '';
  if (pageCount <= 1) return;
  const prev = document.createElement('button');
  prev.type = 'button';
  prev.className = 'btn ghost';
  prev.textContent = 'Prev';
  prev.disabled = photoPage <= 1;
  prev.addEventListener('click', () => {
    photoPage = Math.max(1, photoPage - 1);
    renderPhotoGrid();
  });
  const next = document.createElement('button');
  next.type = 'button';
  next.className = 'btn ghost';
  next.textContent = 'Next';
  next.disabled = photoPage >= pageCount;
  next.addEventListener('click', () => {
    photoPage = Math.min(pageCount, photoPage + 1);
    renderPhotoGrid();
  });
  pager.append(prev, next);
}

function renderPhotoPreview(photo, slug) {
  if (!photoPreview) return;
  if (!photo) {
    photoPreview.innerHTML = '<p class="meta">Tap a thumbnail to preview.</p>';
    return;
  }
  const missing = photo.fileExists === false;
  const shareHref = sharePageHref(slug, photo);
  const when = photo.createdAt ? new Date(photo.createdAt).toLocaleString() : '';
  photoPreview.innerHTML = `
    ${
      missing
        ? `<div class="photo-preview-missing">File missing</div>`
        : `<img src="${photo.url}" alt="" />`
    }
    <div class="photo-preview-bar">
      <span class="badge">${photo.variant || ''}</span>
      <span class="photo-when">${when}</span>
      <a class="btn ghost" href="${shareHref}" target="_blank" rel="noopener" ${missing ? 'aria-disabled="true" tabindex="-1"' : ''}>Open</a>
      <button type="button" class="btn ghost" id="btnPreviewDownload" ${missing ? 'disabled' : ''}>Download</button>
      <button type="button" class="btn ghost" id="btnPreviewDelete">Delete</button>
    </div>
  `;
  photoPreview.querySelector('#btnPreviewDownload')?.addEventListener('click', () => {
    if (missing) return;
    void downloadAdminPhoto(slug, photo);
  });
  photoPreview.querySelector('#btnPreviewDelete')?.addEventListener('click', async () => {
    if (!confirm(missing ? 'Remove this broken DB entry (file already missing)?' : 'Delete this photo from the album?')) return;
    await api(`/api/admin/sessions/${encodeURIComponent(slug)}/photos/${encodeURIComponent(photo.id)}`, {
      method: 'DELETE',
    });
    setStatus(`Deleted photo ${photo.id}`);
    selectedPreviewId = null;
    await refreshAll();
    await refreshPhotos();
  });
}

function renderPhotoGrid() {
  const slug = photoAlbum?.value;
  if (photoGrid) {
    photoGrid.style.display = 'grid';
    photoGrid.style.gridTemplateColumns = 'repeat(auto-fill, minmax(104px, 1fr))';
    photoGrid.style.gap = '0.55rem';
  }
  photoGrid.innerHTML = '';
  if (!slug) {
    photoGrid.innerHTML = '<p class="meta">No album selected.</p>';
    renderPhotoPreview(null, slug);
    return;
  }
  const filtered = filteredAdminPhotos();
  if (!filtered.length) {
    photoGrid.innerHTML = '<p class="meta">No photos match these filters.</p>';
    renderPhotoPager(0, 1);
    renderPhotoPreview(null, slug);
    return;
  }
  const pageCount = Math.max(1, Math.ceil(filtered.length / PHOTO_PAGE_SIZE));
  if (photoPage > pageCount) photoPage = pageCount;
  const start = (photoPage - 1) * PHOTO_PAGE_SIZE;
  const pageItems = filtered.slice(start, start + PHOTO_PAGE_SIZE);
  renderPhotoPager(filtered.length, pageCount);

  if (!selectedPreviewId || !pageItems.some((p) => p.id === selectedPreviewId)) {
    selectedPreviewId = pageItems[0]?.id || null;
  }
  renderPhotoPreview(
    pageItems.find((p) => p.id === selectedPreviewId) || pageItems[0] || null,
    slug,
  );

  for (const p of pageItems) {
    const card = document.createElement('article');
    card.className = 'photo-admin-card';
    if (p.fileExists === false) card.classList.add('is-missing-file');
    if (selectedPhotoIds.has(p.id)) card.classList.add('is-selected');
    if (p.id === selectedPreviewId) card.classList.add('is-preview');
    const missing = p.fileExists === false;
    const when = p.createdAt ? new Date(p.createdAt).toLocaleString() : '';
    card.innerHTML = `
      <label class="photo-select">
        <input type="checkbox" class="photo-check" data-id="${p.id}" ${selectedPhotoIds.has(p.id) ? 'checked' : ''} />
        <span class="sr-only">Select photo</span>
      </label>
      ${
        missing
          ? `<div class="photo-missing" title="DB row exists but file is gone from disk">File missing</div>`
          : `<img src="${p.url}" alt="" loading="lazy" data-photo-id="${p.id}" />`
      }
      <div class="meta-block">
        <span class="badge">${p.variant}</span>
        ${missing ? `<span class="badge badge-warn">missing</span>` : ''}
        <span class="photo-when">${when}</span>
      </div>
    `;
    const thumb = card.querySelector('img[data-photo-id]');
    if (thumb) {
      thumb.style.width = '100%';
      thumb.style.height = '88px';
      thumb.style.objectFit = 'cover';
      thumb.addEventListener('error', () => {
        card.classList.add('is-missing-file');
        const wrap = document.createElement('div');
        wrap.className = 'photo-missing';
        wrap.title = 'Image failed to load — file missing or unreadable on disk';
        wrap.textContent = 'File missing';
        thumb.replaceWith(wrap);
      });
    }
    card.addEventListener('click', (e) => {
      if (e.target.closest('.photo-select')) return;
      selectedPreviewId = p.id;
      renderPhotoPreview(p, slug);
      photoGrid.querySelectorAll('.photo-admin-card').forEach((el) => el.classList.remove('is-preview'));
      card.classList.add('is-preview');
    });
    const check = card.querySelector('.photo-check');
    check?.addEventListener('change', () => {
      if (check.checked) {
        selectedPhotoIds.add(p.id);
        card.classList.add('is-selected');
      } else {
        selectedPhotoIds.delete(p.id);
        card.classList.remove('is-selected');
      }
      updatePhotoSelectionUi();
    });
    photoGrid.appendChild(card);
  }
}

async function refreshPhotos() {
  if (!photoAlbum.value) {
    if (albumsCache[0]) photoAlbum.value = albumsCache[0].slug;
  }
  updateOpenAlbumLink();
  const slug = photoAlbum.value;
  selectedPhotoIds.clear();
  updatePhotoSelectionUi();
  photosCache = [];
  photoPage = 1;
  selectedPreviewId = null;
  photoGrid.innerHTML = '';
  if (!slug) {
    photoGrid.innerHTML = '<p class="meta">No album selected.</p>';
    return;
  }
  const data = await api(`/api/admin/sessions/${encodeURIComponent(slug)}`);
  photosCache = data.session?.photos || [];
  if (!photosCache.length) {
    photoGrid.innerHTML = '<p class="meta">This album has no photos.</p>';
    renderPhotoPager(0, 1);
    return;
  }
  renderPhotoGrid();
}

function applyTokenSettings(settings) {
  if (uploadTokenEl) uploadTokenEl.value = settings.uploadToken || '';
  if (publicBaseUrlEl) {
    publicBaseUrlEl.textContent = settings.publicBaseUrl || '?';
    const local = /^https?:\/\/(127\.0\.0\.1|localhost)(:|\/|$)/i.test(settings.publicBaseUrl || '');
    publicBaseUrlEl.classList.toggle('warn', local);
    const src = settings.publicBaseUrlSource || '';
    publicBaseUrlEl.title = local
      ? 'Local dev only. On the Pi, unset ALLOW_LOCAL_PUBLIC_URL and restart — URLs default to production.'
      : src === 'production-default'
        ? 'Using production default (moments.inmomentservices.com). Set PUBLIC_BASE_URL in .env to override.'
        : '';
  }
  if (tokenMetaEl) {
    const src =
      settings.uploadTokenSource === 'settings'
        ? 'saved in admin'
        : settings.uploadTokenSource === 'env'
          ? 'from server .env'
          : 'not set';
    tokenMetaEl.textContent = settings.uploadTokenConfigured
      ? `Token active (${src}). Paste into Photobooth Admin ? Gallery.`
      : 'No token set ? booth uploads will fail until you save one.';
  }
}

function generateUploadToken() {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

function applyWallForm(wall) {
  if (!wall) return;
  if (wallTitle) wallTitle.value = wall.title || '';
  if (wallOverlay) wallOverlay.value = wall.overlay || '';
  if (wallColumns) wallColumns.value = String(wall.columns ?? 16);
  if (wallBrandText) wallBrandText.value = wall.brandText || '';
  if (wallBackdropOpacity) {
    const pct = Math.round((wall.backdropOpacity ?? 0.55) * 100);
    wallBackdropOpacity.value = String(pct);
    syncBackdropOpacityLabel(pct);
  }
  if (wallBrandRevealEnabled) wallBrandRevealEnabled.checked = wall.brandRevealEnabled === true;
  if (wallBrandRevealSeconds) wallBrandRevealSeconds.value = String(wall.brandRevealSeconds ?? 45);
  if (wallBrandRevealHoldSeconds) wallBrandRevealHoldSeconds.value = String(wall.brandRevealHoldSeconds ?? 6);
  if (wallShowOriginalPhotos) wallShowOriginalPhotos.checked = wall.showOriginalPhotos !== false;
  if (wallBrandPreview) {
    wallBrandPreview.textContent = wall.brandLogoUrl
      ? `Partner logo on file${wall.brandText ? ` ? ${wall.brandText}` : ''}${
          wall.brandRevealEnabled ? ' ? reveal on' : ' ? reveal off'
        }`
      : wall.brandText
        ? `Partner text: ${wall.brandText}`
        : 'No partner brand set ? upload a logo to use reveal.';
  }
  if (wallMosaicTargetPreview) {
    wallMosaicTargetPreview.textContent = mosaicBackdropPreviewText(wall.mosaicTargetUrl);
  }
  syncWallModeStatus(!!wall.completedView);
}

async function refreshAll() {
  const settings = await api('/api/admin/settings');
  ttlEl.value = String(settings.settings.defaultTtlDays);
  applyTokenSettings(settings.settings);
  const wall = await api('/api/admin/wall/settings');
  applyWallForm(wall.wall);
  await refreshAlbums();
  await refreshFrames();
  await loadPhysicalDefaults();
  await refreshQrOverviewStats();
}

document.getElementById('loginForm')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  loginErr.hidden = true;
  try {
    await refreshAll();
    unlockAdmin();
    setTab('overview');
  } catch (err) {
    document.body.classList.remove('is-unlocked');
    if (loginCard) loginCard.hidden = false;
    if (panel) panel.hidden = true;
    loginErr.hidden = false;
    loginErr.textContent = String(err.message || err);
  }
});

document.getElementById('btnSaveTtl').addEventListener('click', async () => {
  try {
    await api('/api/admin/settings', {
      method: 'PATCH',
      body: JSON.stringify({ defaultTtlDays: Number(ttlEl.value) }),
    });
    setStatus('Default TTL saved');
  } catch (e) {
    setStatus(String(e.message || e));
  }
});

document.getElementById('btnSaveToken')?.addEventListener('click', async () => {
  try {
    const token = uploadTokenEl?.value?.trim() || '';
    const r = await api('/api/admin/settings', {
      method: 'PATCH',
      body: JSON.stringify({ uploadToken: token }),
    });
    applyTokenSettings(r.settings);
    setStatus(token ? 'Upload token saved' : 'Upload token cleared');
  } catch (e) {
    setStatus(String(e.message || e));
  }
});

document.getElementById('btnCopyToken')?.addEventListener('click', async () => {
  const token = uploadTokenEl?.value?.trim() || '';
  if (!token) {
    setStatus('Nothing to copy ? generate or enter a token first');
    return;
  }
  try {
    await navigator.clipboard.writeText(token);
    setStatus('Upload token copied');
  } catch {
    uploadTokenEl?.select();
    setStatus('Select the token and copy manually (Ctrl+C)');
  }
});

document.getElementById('btnGenerateToken')?.addEventListener('click', () => {
  if (uploadTokenEl) uploadTokenEl.value = generateUploadToken();
  setStatus('Generated a new token ? click Save token, then paste it into the photobooth');
});

document.getElementById('btnSaveWall').addEventListener('click', async () => {
  try {
    const opacityPct = Number(wallBackdropOpacity?.value ?? 55);
    await api('/api/admin/wall/settings', {
      method: 'PATCH',
      body: JSON.stringify({
        title: wallTitle.value,
        overlay: wallOverlay.value,
        brandText: wallBrandText?.value || '',
        columns: Number(wallColumns?.value || 16),
        backdropOpacity: Math.min(1, Math.max(0, opacityPct / 100)),
        brandRevealEnabled: !!wallBrandRevealEnabled?.checked,
        brandRevealSeconds: Number(wallBrandRevealSeconds?.value || 45),
        brandRevealHoldSeconds: Number(wallBrandRevealHoldSeconds?.value || 6),
        showOriginalPhotos: !!wallShowOriginalPhotos?.checked,
      }),
    });
    setStatus('Wall settings saved');
    const wall = await api('/api/admin/wall/settings');
    applyWallForm(wall.wall);
  } catch (e) {
    setStatus(String(e.message || e));
  }
});

document.getElementById('btnShowCompletedView')?.addEventListener('click', async () => {
  try {
    await setWallCompletedView(true);
  } catch (e) {
    setStatus(String(e.message || e));
  }
});

document.getElementById('btnShowLiveCollage')?.addEventListener('click', async () => {
  try {
    await setWallCompletedView(false);
  } catch (e) {
    setStatus(String(e.message || e));
  }
});

document.getElementById('btnUploadWallBrand')?.addEventListener('click', async () => {
  const input = document.getElementById('wallBrandLogo');
  const file = input?.files?.[0];
  if (!file) {
    setStatus('Choose a partner logo image first');
    return;
  }
  try {
    const fd = new FormData();
    fd.append('logo', file, file.name);
    const r = await api('/api/admin/wall/brand-logo', { method: 'POST', body: fd });
    if (input) input.value = '';
    applyWallForm(r.wall);
    setStatus('Partner brand logo uploaded');
  } catch (e) {
    setStatus(String(e.message || e));
  }
});

document.getElementById('btnClearWallBrand')?.addEventListener('click', async () => {
  try {
    const r = await api('/api/admin/wall/settings', {
      method: 'PATCH',
      body: JSON.stringify({ clearBrandLogo: true }),
    });
    applyWallForm(r.wall);
    setStatus('Partner logo cleared');
  } catch (e) {
    setStatus(String(e.message || e));
  }
});

document.getElementById('btnUploadMosaicTarget')?.addEventListener('click', async () => {
  const input = document.getElementById('wallMosaicTarget');
  const file = input?.files?.[0];
  if (!file) {
    setStatus('Choose a backdrop image first');
    return;
  }
  try {
    const fd = new FormData();
    fd.append('target', file, file.name);
    const r = await api('/api/admin/wall/mosaic-target', { method: 'POST', body: fd });
    if (input) input.value = '';
    applyWallForm(r.wall);
    setStatus('Backdrop image uploaded');
  } catch (e) {
    setStatus(String(e.message || e));
  }
});

document.getElementById('btnClearMosaicTarget')?.addEventListener('click', async () => {
  try {
    const r = await api('/api/admin/wall/settings', {
      method: 'PATCH',
      body: JSON.stringify({ clearMosaicTarget: true }),
    });
    applyWallForm(r.wall);
    setStatus('Backdrop cleared');
  } catch (e) {
    setStatus(String(e.message || e));
  }
});

let pfDefaults = {
  cellWidthCm: 5.3,
  cellHeightCm: 7.8,
  innerPaddingMm: 3,
  safeInsetTopMm: 0.2,
  safeInsetBottomMm: 0.2,
  safeInsetLeftMm: 3,
  safeInsetRightMm: 1,
  gapMm: 4,
  marginMm: 0,
  printerCropInsetMm: 0,
  dpi: 300,
  rotateDegrees: -90,
  borderEnabled: true,
};

function fillPhysicalForm(src = pfDefaults) {
  document.getElementById('pfCellW').value = src.cellWidthCm;
  document.getElementById('pfCellH').value = src.cellHeightCm;
  document.getElementById('pfInset').value = src.innerPaddingMm;
  document.getElementById('pfSafeTop').value = src.safeInsetTopMm;
  document.getElementById('pfSafeBot').value = src.safeInsetBottomMm;
  document.getElementById('pfSafeLeft').value = src.safeInsetLeftMm;
  document.getElementById('pfSafeRight').value = src.safeInsetRightMm;
  document.getElementById('pfRotate').value = String(src.rotateDegrees);
  document.getElementById('pfBorder').checked = src.borderEnabled !== false;
}

const pfCrop = { zoom: 1, panX: 0, panY: 0 };
let pfAdjustImg = null;
let pfDragging = false;
let pfLastX = 0;
let pfLastY = 0;

function pfNum(id, fallback) {
  const n = Number(document.getElementById(id)?.value);
  return Number.isFinite(n) ? n : fallback;
}

function drawPhysicalAdjust() {
  const canvas = document.getElementById('pfAdjustCanvas');
  const img = pfAdjustImg;
  if (!canvas || !img) return;
  const cellWcm = pfNum('pfCellW', 5.3);
  const cellHcm = pfNum('pfCellH', 7.8);
  const pageW = 148;
  const pageH = 100;
  const leftoverW = pageW - cellWcm * 10 * 2;
  const leftoverH = pageH - cellHcm * 10;
  const gap = leftoverW >= 8 ? 4 : Math.max(0, leftoverW * 0.2);
  const mx = Math.max(0, (leftoverW - gap) / 2);
  const my = Math.max(0, leftoverH / 2);
  const cssW = Math.min(640, canvas.parentElement?.clientWidth || 640);
  const scale = cssW / pageW;
  canvas.width = Math.round(cssW);
  canvas.height = Math.round(pageH * scale);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  const rot = Number(document.getElementById('pfRotate').value) === 90 ? 90 : -90;
  const off = document.createElement('canvas');
  off.width = img.naturalHeight;
  off.height = img.naturalWidth;
  const octx = off.getContext('2d');
  octx.translate(off.width / 2, off.height / 2);
  octx.rotate((rot * Math.PI) / 180);
  octx.drawImage(img, -img.naturalWidth / 2, -img.naturalHeight / 2);
  const cellW = cellWcm * 10 * scale;
  const cellH = cellHcm * 10 * scale;
  const pad = (pfNum('pfInset', 3) / 10) * scale;
  const sL = (pfNum('pfSafeLeft', 3) / 10) * scale;
  const sR = (pfNum('pfSafeRight', 1) / 10) * scale;
  const sT = (pfNum('pfSafeTop', 0.2) / 10) * scale;
  const sB = (pfNum('pfSafeBot', 0.2) / 10) * scale;
  const safeW = Math.max(8, cellW - pad * 2 - sL - sR);
  const safeH = Math.max(8, cellH - pad * 2 - sT - sB);
  const cover = Math.max(safeW / off.width, safeH / off.height);
  const visW = Math.min(off.width, safeW / (cover * pfCrop.zoom));
  const visH = Math.min(off.height, visW / (safeW / safeH));
  const maxL = Math.max(0, off.width - visW);
  const maxT = Math.max(0, off.height - visH);
  const sx = Math.round(maxL / 2 + pfCrop.panX * (maxL / 2));
  const sy = Math.round(maxT / 2 + pfCrop.panY * (maxT / 2));
  const drawOne = (x) => {
    ctx.drawImage(
      off,
      sx,
      sy,
      visW,
      visH,
      x + pad + sL,
      my * scale + pad + sT,
      safeW,
      safeH,
    );
    ctx.strokeStyle = 'rgba(139,115,72,0.9)';
    ctx.strokeRect(x + pad, my * scale + pad, cellW - pad * 2, cellH - pad * 2);
  };
  drawOne(mx * scale);
  drawOne(mx * scale + cellW + gap * scale);
}

function bindPhysicalAdjust() {
  const input = document.getElementById('pfPhoto');
  const box = document.getElementById('pfAdjustBox');
  const canvas = document.getElementById('pfAdjustCanvas');
  const zoom = document.getElementById('pfZoom');
  if (!input || !box || !canvas || !zoom) return;
  input.addEventListener('change', () => {
    const file = input.files?.[0];
    pfCrop.zoom = 1;
    pfCrop.panX = 0;
    pfCrop.panY = 0;
    zoom.value = '1';
    if (!file) {
      pfAdjustImg = null;
      box.hidden = true;
      return;
    }
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      pfAdjustImg = img;
      box.hidden = false;
      drawPhysicalAdjust();
    };
    img.src = url;
  });
  zoom.addEventListener('input', () => {
    pfCrop.zoom = Math.min(4, Math.max(1, Number(zoom.value) || 1));
    drawPhysicalAdjust();
  });
  canvas.addEventListener('pointerdown', (ev) => {
    pfDragging = true;
    pfLastX = ev.clientX;
    pfLastY = ev.clientY;
    canvas.setPointerCapture(ev.pointerId);
  });
  canvas.addEventListener('pointermove', (ev) => {
    if (!pfDragging) return;
    const dx = ev.clientX - pfLastX;
    const dy = ev.clientY - pfLastY;
    pfLastX = ev.clientX;
    pfLastY = ev.clientY;
    const span = Math.max(80, canvas.clientWidth * 0.35 * pfCrop.zoom);
    pfCrop.panX = Math.min(1, Math.max(-1, pfCrop.panX - dx / span));
    pfCrop.panY = Math.min(1, Math.max(-1, pfCrop.panY - dy / span));
    drawPhysicalAdjust();
  });
  canvas.addEventListener('pointerup', (ev) => {
    pfDragging = false;
    if (canvas.hasPointerCapture(ev.pointerId)) canvas.releasePointerCapture(ev.pointerId);
  });
}

bindPhysicalAdjust();

async function loadPhysicalDefaults() {
  try {
    const d = await api('/api/admin/physical-frame/defaults');
    if (d?.defaults) pfDefaults = { ...pfDefaults, ...d.defaults };
  } catch {
    /* keep local defaults */
  }
  fillPhysicalForm(pfDefaults);
}

function physicalSheetLabel(sheet) {
  if (!sheet) return '';
  const dpi = Number(sheet.settings?.dpi || sheet.dpi || 300) || 300;
  const w = Number(sheet.width);
  const h = Number(sheet.height);
  if (!w || !h) return '';
  const wCm = ((w / dpi) * 2.54).toFixed(2);
  const hCm = ((h / dpi) * 2.54).toFixed(2);
  return `Sheet size ≈ ${wCm} × ${hCm} cm · file = ${w}×${h} px at ${dpi} DPI`;
}

async function fetchPhysicalBlob(id) {
  const r = await fetch(`/api/admin/physical-frame/${encodeURIComponent(id)}/file`, {
    headers: { 'X-Admin-Pin': pin() },
  });
  if (!r.ok) {
    const data = await r.json().catch(() => ({}));
    throw new Error(data.error || r.statusText);
  }
  return r.blob();
}

function renderPhysicalPreview(id, sheet) {
  const box = document.getElementById('pfPreview');
  box.innerHTML = '';
  const label = physicalSheetLabel(sheet);
  if (label) {
    const p = document.createElement('p');
    p.className = 'meta';
    p.textContent = label;
    box.appendChild(p);
  }
  const img = document.createElement('img');
  img.alt = 'Physical cut sheet';
  img.className = 'photo-preview-img';
  box.appendChild(img);
  const actions = document.createElement('div');
  actions.className = 'row wrap';
  const dl = document.createElement('button');
  dl.type = 'button';
  dl.className = 'btn primary';
  dl.textContent = 'Download PNG';
  dl.addEventListener('click', () => void downloadPhysicalSheet(id));
  actions.appendChild(dl);
  box.appendChild(actions);
  void fetchPhysicalBlob(id)
    .then((blob) => {
      img.src = URL.createObjectURL(blob);
    })
    .catch((e) => setStatus(String(e.message || e)));
}

async function downloadPhysicalSheet(id) {
  try {
    const blob = await fetchPhysicalBlob(id);
    const how = await shareOrDownloadBlob(blob, `physical-frame-${id}.png`, 'image/png');
    if (how === 'shared') setStatus('Share sheet opened.');
    else if (how === 'downloaded') setStatus('Download started.');
  } catch (e) {
    setStatus(String(e.message || e));
  }
}

async function refreshPhysicalFrames() {
  const host = document.getElementById('pfList');
  if (!host) return;
  try {
    const data = await api('/api/admin/physical-frame');
    const rows = Array.isArray(data.sheets) ? data.sheets : [];
    host.innerHTML = '';
    if (!rows.length) {
      host.innerHTML = '<p class="meta">No custom sheets yet.</p>';
      return;
    }
    for (const row of rows) {
      const item = document.createElement('div');
      item.className = 'session-item';
      const left = document.createElement('div');
      const t = document.createElement('strong');
      t.textContent = row.originalName || row.id;
      left.appendChild(t);
      const m = document.createElement('div');
      m.className = 'meta';
      m.textContent = new Date(row.createdAt).toLocaleString();
      left.appendChild(m);
      const actions = document.createElement('div');
      actions.className = 'row wrap';
      const prev = document.createElement('button');
      prev.type = 'button';
      prev.className = 'btn ghost';
      prev.textContent = 'Preview';
      prev.addEventListener('click', () => renderPhysicalPreview(row.id, row));
      const dl = document.createElement('button');
      dl.type = 'button';
      dl.className = 'btn ghost';
      dl.textContent = 'Download';
      dl.addEventListener('click', () => void downloadPhysicalSheet(row.id));
      const del = document.createElement('button');
      del.type = 'button';
      del.className = 'btn danger';
      del.textContent = 'Delete';
      del.addEventListener('click', async () => {
        if (!confirm('Delete this cut sheet?')) return;
        try {
          await api(`/api/admin/physical-frame/${encodeURIComponent(row.id)}`, { method: 'DELETE' });
          await refreshPhysicalFrames();
        } catch (e) {
          setStatus(String(e.message || e));
        }
      });
      actions.append(prev, dl, del);
      item.append(left, actions);
      host.appendChild(item);
    }
  } catch (e) {
    host.innerHTML = `<p class="meta">${String(e.message || e).replace(/[<>&]/g, '')}</p>`;
  }
}

document.getElementById('btnPfDefaults').addEventListener('click', () => fillPhysicalForm(pfDefaults));

document.getElementById('btnPfGenerate').addEventListener('click', async () => {
  const input = document.getElementById('pfPhoto');
  const file = input.files?.[0];
  if (!file) {
    setStatus('Choose a landscape photo first');
    return;
  }
  const fd = new FormData();
  fd.append('photo', file, file.name);
  fd.append('cellWidthCm', document.getElementById('pfCellW').value);
  fd.append('cellHeightCm', document.getElementById('pfCellH').value);
  fd.append('innerPaddingMm', document.getElementById('pfInset').value);
  fd.append('safeInsetTopMm', document.getElementById('pfSafeTop').value);
  fd.append('safeInsetBottomMm', document.getElementById('pfSafeBot').value);
  fd.append('safeInsetLeftMm', document.getElementById('pfSafeLeft').value);
  fd.append('safeInsetRightMm', document.getElementById('pfSafeRight').value);
  fd.append('rotateDegrees', document.getElementById('pfRotate').value);
  fd.append('borderEnabled', document.getElementById('pfBorder').checked ? 'true' : 'false');
  fd.append('cropZoom', String(pfCrop.zoom));
  fd.append('cropPanX', String(pfCrop.panX));
  fd.append('cropPanY', String(pfCrop.panY));
  try {
    setStatus('Generating cut sheet…');
    const out = await api('/api/admin/physical-frame/generate', { method: 'POST', body: fd });
    if (!out.sheet?.id) throw new Error('Generate failed');
    input.value = '';
    renderPhysicalPreview(out.sheet.id, out.sheet);
    await refreshPhysicalFrames();
    setStatus('Cut sheet ready — admin only (not on the wall)');
  } catch (e) {
    setStatus(String(e.message || e));
  }
});

document.getElementById('btnUploadFrame').addEventListener('click', async () => {
  const input = document.getElementById('frameFile');
  const file = input.files?.[0];
  if (!file) {
    setStatus('Choose a frame image first');
    return;
  }
  try {
    const fd = new FormData();
    fd.append('frame', file, file.name);
    const out = await api('/api/admin/frames', { method: 'POST', body: fd });
    input.value = '';
    const hint = document.getElementById('frameRatioHint');
    if (hint) hint.textContent = '';
    const note = out.frame ? frameRatioNote(out.frame) : '';
    setStatus(
      out.frame?.fitsGallery === false
        ? `Uploaded ${file.name}. ${note}`
        : `Uploaded ${file.name}${note ? ` — ${note}` : ''}`,
    );
    await refreshFrames();
  } catch (e) {
    setStatus(String(e.message || e));
  }
});

document.getElementById('frameFile')?.addEventListener('change', () => {
  const input = document.getElementById('frameFile');
  const hint = document.getElementById('frameRatioHint');
  const file = input?.files?.[0];
  if (!hint) return;
  if (!file) {
    hint.textContent = '';
    return;
  }
  const url = URL.createObjectURL(file);
  const img = new Image();
  img.onload = () => {
    URL.revokeObjectURL(url);
    const ar = img.naturalWidth / img.naturalHeight;
    const fits = Math.abs(ar - 1.5) / 1.5 <= 0.04;
    hint.textContent = fits
      ? `${img.naturalWidth}×${img.naturalHeight} · 3:2 — this will fill the gallery.`
      : `${img.naturalWidth}×${img.naturalHeight} · ${ar.toFixed(2)}:1 — gallery tiles are 3:2 (6×4). Use 1800×1200 (or 2400×1600) to fill with no gap at the top.`;
    hint.classList.toggle('frame-ratio-warn', !fits);
  };
  img.onerror = () => {
    URL.revokeObjectURL(url);
    hint.textContent = '';
  };
  img.src = url;
});

document.getElementById('btnPurge').addEventListener('click', async () => {
  try {
    const r = await api('/api/admin/purge-expired', { method: 'POST', body: '{}' });
    setStatus(`Purged ${r.sessionsRemoved} albums (${r.photosRemoved} photos)`);
    await refreshAll();
  } catch (e) {
    setStatus(String(e.message || e));
  }
});

document.getElementById('btnSeed').addEventListener('click', async () => {
  try {
    const r = await api('/api/admin/seed-samples', { method: 'POST', body: '{}' });
    setStatus(
      `Sample album ready: ${r.session?.slug} (+${r.photosAdded} photos, +${r.framesAdded} frames)`,
    );
    await refreshAll();
    if (r.session?.slug) {
      photoAlbum.value = r.session.slug;
      setTab('photos');
    }
  } catch (e) {
    setStatus(String(e.message || e));
  }
});

document.getElementById('btnRefreshPhotos')?.addEventListener('click', () => void refreshPhotos());

document.getElementById('btnResolveBrokenPhotos')?.addEventListener('click', async () => {
  try {
    setStatus('Checking for broken photos…');
    const check = await api('/api/admin/photos/missing-files');
    const brokenMeta = document.getElementById('photoBrokenMeta');
    if (!check.count) {
      if (brokenMeta) brokenMeta.textContent = 'All photos have files on disk.';
      setStatus('No broken photos found.');
      return;
    }
    const preview = (check.items || [])
      .slice(0, 5)
      .map((p) => `${p.id} (${p.album})`)
      .join(', ');
    const more = check.count > 5 ? ` …and ${check.count - 5} more` : '';
    const msg = `Remove ${check.count} broken photo record${check.count === 1 ? '' : 's'} with no file on disk?\n\n${preview}${more}`;
    if (!confirm(msg)) {
      if (brokenMeta) {
        brokenMeta.textContent = `${check.count} broken photo${check.count === 1 ? '' : 's'} found (not removed).`;
      }
      setStatus(`Found ${check.count} broken — cancelled.`);
      return;
    }
    const r = await api('/api/admin/photos/resolve-missing', { method: 'POST', body: '{}' });
    if (brokenMeta) brokenMeta.textContent = 'Broken = DB record exists but image file is missing on disk (shows as black thumbnail).';
    setStatus(`Removed ${r.photosRemoved} broken photo record${r.photosRemoved === 1 ? '' : 's'}.`);
    await refreshAll();
    await refreshPhotos();
  } catch (e) {
    setStatus(String(e.message || e));
  }
});

photoAlbum?.addEventListener('change', () => {
  updateOpenAlbumLink();
  void refreshPhotos();
});

function onPhotoFilterChange() {
  photoPage = 1;
  if (photosCache.length) renderPhotoGrid();
}

function bindPhotoChips(rootId, attr) {
  document.getElementById(rootId)?.addEventListener('click', (e) => {
    const btn = e.target.closest('.photo-chip');
    if (!btn) return;
    document.querySelectorAll(`#${rootId} .photo-chip`).forEach((el) => el.classList.toggle('is-on', el === btn));
    const custom = document.getElementById('photoCustomDates');
    if (custom && attr === 'when') custom.hidden = btn.getAttribute('data-when') !== 'custom';
    onPhotoFilterChange();
  });
}

bindPhotoChips('photoKindChips', 'kind');
bindPhotoChips('photoWhenChips', 'when');
document.getElementById('photoFrom')?.addEventListener('change', onPhotoFilterChange);
document.getElementById('photoTo')?.addEventListener('change', onPhotoFilterChange);

wallBackdropOpacity?.addEventListener('input', () => {
  syncBackdropOpacityLabel(wallBackdropOpacity.value);
});

document.getElementById('btnSelectAllPhotos')?.addEventListener('click', () => {
  photoGrid?.querySelectorAll('.photo-check').forEach((el) => {
    const input = /** @type {HTMLInputElement} */ (el);
    input.checked = true;
    const id = input.dataset.id;
    if (id) selectedPhotoIds.add(id);
    input.closest('.photo-admin-card')?.classList.add('is-selected');
  });
  updatePhotoSelectionUi();
});

document.getElementById('btnClearPhotoSelection')?.addEventListener('click', () => {
  selectedPhotoIds.clear();
  photoGrid?.querySelectorAll('.photo-check').forEach((el) => {
    /** @type {HTMLInputElement} */ (el).checked = false;
    el.closest('.photo-admin-card')?.classList.remove('is-selected');
  });
  updatePhotoSelectionUi();
});

document.getElementById('btnBulkDeletePhotos')?.addEventListener('click', async () => {
  const slug = photoAlbum?.value;
  const ids = [...selectedPhotoIds];
  if (!slug || !ids.length) return;
  if (!confirm(`Delete ${ids.length} selected photo${ids.length === 1 ? '' : 's'}?`)) return;
  try {
    const r = await api(`/api/admin/sessions/${encodeURIComponent(slug)}/photos/bulk-delete`, {
      method: 'POST',
      body: JSON.stringify({ ids }),
    });
    setStatus(`Deleted ${r.count || ids.length} photo${(r.count || ids.length) === 1 ? '' : 's'}`);
    selectedPhotoIds.clear();
    await refreshAll();
    await refreshPhotos();
  } catch (e) {
    setStatus(String(e.message || e));
  }
});

/** ??? QR events ??? */
let qrSelectedBatchId = '';

async function refreshQrOverviewStats() {
  try {
    const s = await api('/api/admin/qr/stats/today');
    const scans = String(s.totalScans ?? 0);
    const rem = String(s.remaining ?? 0);
    const elScans = document.getElementById('statQrScans');
    const elRem = document.getElementById('statQrRemaining');
    if (elScans) elScans.textContent = scans;
    if (elRem) elRem.textContent = rem;
    const qs = document.getElementById('qrStatScans');
    const qr = document.getElementById('qrStatRemaining');
    const ql = document.getElementById('qrStatLinked');
    const qa = document.getElementById('qrStatActive');
    if (qs) qs.textContent = scans;
    if (qr) qr.textContent = rem;
    if (ql) ql.textContent = String(s.linked ?? 0);
    if (qa) qa.textContent = String(s.activeEvents ?? 0);
  } catch (_) {
    /* ignore on overview if qr routes unavailable */
  }
}

async function updateQrEstimate() {
  const qty = Number(document.getElementById('qrQty')?.value) || 100;
  const paper = document.getElementById('qrPaper')?.value || 'a4';
  try {
    const e = await api(`/api/admin/qr/estimate?quantity=${qty}&paperSize=${paper}`);
    const el = document.getElementById('qrEstimate');
    if (el) {
      el.textContent = `About ${e.pages} page(s) ? ${e.perPage} cards/page (${e.cols}?${e.rows}) on ${paper.toUpperCase()}`;
    }
  } catch (_) {}
}

async function refreshQrTemplates() {
  const list = await api('/api/admin/qr/templates');
  const wrap = document.getElementById('qrTemplateList');
  if (!wrap) return;
  wrap.innerHTML = '';
  for (const t of list.templates || []) {
    const div = document.createElement('div');
    div.className = 'frame-card';
    div.innerHTML = `
      <img src="${t.url}" alt="" />
      <strong>${t.name}${t.active ? ' ? active' : ''}</strong>
      <code>${t.source}</code>
      <div class="row wrap">
        <button type="button" class="btn ghost set-active" ${t.active ? 'disabled' : ''}>Use</button>
        ${t.source === 'upload' ? '<button type="button" class="btn ghost delete">Delete</button>' : ''}
      </div>
    `;
    div.querySelector('.set-active')?.addEventListener('click', async () => {
      await api('/api/admin/qr/templates/active', { method: 'POST', body: JSON.stringify({ id: t.id }) });
      setStatus(`Active template: ${t.name}`);
      await refreshQrTemplates();
    });
    div.querySelector('.delete')?.addEventListener('click', async () => {
      if (!confirm('Delete this template?')) return;
      await api(`/api/admin/qr/templates/${encodeURIComponent(t.id)}`, { method: 'DELETE' });
      await refreshQrTemplates();
    });
    wrap.appendChild(div);
  }
}

async function refreshQrBatches() {
  const list = await api('/api/admin/qr/batches');
  const sessions = await api('/api/admin/sessions').catch(() => ({ sessions: [] }));
  const albumOptions = (sessions.sessions || []).filter((s) => !s.expired);
  const wrap = document.getElementById('qrBatchList');
  if (!wrap) return;
  wrap.innerHTML = '';
  const batches = list.batches || [];
  if (!batches.length) {
    wrap.innerHTML = '<p class="meta">No QR batches yet ? create one above.</p>';
  } else {
    for (const b of batches) wrap.appendChild(renderQrBatchCard(b, false, albumOptions));
  }

  const archivedWrap = document.getElementById('qrArchivedList');
  if (archivedWrap) {
    const archived = await api('/api/admin/qr/batches/archived');
    archivedWrap.innerHTML = '';
    const rows = archived.batches || [];
    if (!rows.length) {
      archivedWrap.innerHTML = '<p class="meta">No archived batches.</p>';
    } else {
      for (const b of rows) archivedWrap.appendChild(renderQrBatchCard(b, true, albumOptions));
    }
  }
}

function renderQrBatchCard(b, isArchived, albumOptions = []) {
  const div = document.createElement('div');
  div.className = 'session-item';
  const st = b.stats || {};
  const album = b.linkedAlbum;
  const albumLabel = album
    ? `Album: ${album.title}${album.expired ? ' (expired)' : ''} ? ${album.photoCount} photos`
    : 'No album connected';

  const albumSelect = isArchived
    ? ''
    : `<div class="row wrap" style="margin-top:0.35rem;align-items:center">
        <label class="meta" style="margin:0">Connect album</label>
        <select class="input album-link" style="max-width:16rem">
          <option value="">? none ?</option>
          ${albumOptions
            .map(
              (s) =>
                `<option value="${s.id}" ${b.linkedSessionId === s.id ? 'selected' : ''}>${s.title || s.slug}</option>`,
            )
            .join('')}
        </select>
        <button type="button" class="btn ghost save-album">Save</button>
        ${album?.galleryUrl ? `<a class="btn ghost" href="${album.galleryUrl}" target="_blank" rel="noopener">Open album</a>` : ''}
      </div>`;

  const actions = isArchived
    ? `<button type="button" class="btn danger delete-forever">Delete permanently</button>
        <button type="button" class="btn ghost restore">Restore to draft</button>`
    : `<button type="button" class="btn ghost open-detail">Codes</button>
        ${b.status !== 'active' ? '<button type="button" class="btn primary activate">Activate</button>' : '<button type="button" class="btn ghost deactivate">Deactivate</button>'}
        <button type="button" class="btn ghost reset">Reset session</button>
        <a class="btn ghost" href="/api/admin/qr/batches/${encodeURIComponent(b.id)}/pdf" data-pdf>PDF</a>
        <button type="button" class="btn ghost regen-a4">Regen A4</button>
        <button type="button" class="btn ghost regen-a3">Regen A3</button>
        <a class="btn ghost" href="/qr-scan?batch=${encodeURIComponent(b.id)}" target="_blank" rel="noopener">Attendant</a>
        <a class="btn ghost" href="/api/admin/qr/batches/${encodeURIComponent(b.id)}/codes.csv" data-csv>CSV</a>
        <button type="button" class="btn ghost feature">${b.featured ? 'Unfeature' : 'Feature'}</button>
        <button type="button" class="btn ghost archive">Archive</button>
        ${b.status !== 'active' ? '<button type="button" class="btn danger delete-forever">Delete</button>' : ''}`;

  div.innerHTML = `
      <strong>${b.name}</strong>
      <span class="meta">${b.eventLabel || '?'} ? ${b.quantity} cards ? ${b.paperSize?.toUpperCase()} ? ${b.status}
      ? scanned ${st.scanned ?? 0}/${st.total ?? b.quantity} ? linked ${st.linked ?? 0}${b.featured ? ' ? featured' : ''}</span>
      <span class="meta">${albumLabel}</span>
      ${albumSelect}
      <div class="row wrap">${actions}</div>
    `;

  const withPin = async (url) => {
    const res = await fetch(url, { headers: { 'X-Admin-Pin': pin() } });
    if (!res.ok) {
      let msg = `Download failed (${res.status})`;
      try {
        const data = await res.json();
        if (data?.error) msg = data.error;
      } catch {
        /* not json */
      }
      throw new Error(msg);
    }
    const blob = await res.blob();
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = url.includes('csv') ? `${b.name}-codes.csv` : `${b.name}.pdf`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  div.querySelector('[data-pdf]')?.addEventListener('click', async (e) => {
    e.preventDefault();
    try {
      await withPin(`/api/admin/qr/batches/${encodeURIComponent(b.id)}/pdf`);
    } catch (err) {
      setStatus(String(err.message || err));
    }
  });
  div.querySelector('[data-csv]')?.addEventListener('click', async (e) => {
    e.preventDefault();
    try {
      await withPin(`/api/admin/qr/batches/${encodeURIComponent(b.id)}/codes.csv`);
    } catch (err) {
      setStatus(String(err.message || err));
    }
  });
  div.querySelector('.save-album')?.addEventListener('click', async () => {
    const sel = div.querySelector('.album-link');
    const linkedSessionId = sel?.value || null;
    await api(`/api/admin/qr/batches/${encodeURIComponent(b.id)}`, {
      method: 'PATCH',
      body: JSON.stringify({ linkedSessionId }),
    });
    setStatus(
      linkedSessionId ? `Connected ${b.name} to album` : `Disconnected album from ${b.name}`,
    );
    await refreshQrBatches();
  });
  div.querySelector('.open-detail')?.addEventListener('click', () => {
    qrSelectedBatchId = b.id;
    void refreshQrDetail();
  });
  div.querySelector('.activate')?.addEventListener('click', async () => {
    await api(`/api/admin/qr/batches/${encodeURIComponent(b.id)}`, {
      method: 'PATCH',
      body: JSON.stringify({ status: 'active' }),
    });
    setStatus(`Activated ${b.name}`);
    await refreshQrSection();
  });
  div.querySelector('.deactivate')?.addEventListener('click', async () => {
    await api(`/api/admin/qr/batches/${encodeURIComponent(b.id)}`, {
      method: 'PATCH',
      body: JSON.stringify({ status: 'inactive' }),
    });
    await refreshQrSection();
  });
  div.querySelector('.reset')?.addEventListener('click', async () => {
    if (
      !confirm(
        `Reset session for "${b.name}"? ${st.scanned || 0} scans will move to history; cards become reusable.`,
      )
    )
      return;
    const r = await api(`/api/admin/qr/batches/${encodeURIComponent(b.id)}/reset`, {
      method: 'POST',
    });
    setStatus(`Reset complete ? archived ${r.archivedScans || 0} scans`);
    await refreshQrSection();
  });
  div.querySelector('.regen-a4')?.addEventListener('click', async () => {
    await api(`/api/admin/qr/batches/${encodeURIComponent(b.id)}/regenerate-pdf`, {
      method: 'POST',
      body: JSON.stringify({ paperSize: 'a4' }),
    });
    setStatus('A4 PDF regenerated');
    await refreshQrBatches();
  });
  div.querySelector('.regen-a3')?.addEventListener('click', async () => {
    await api(`/api/admin/qr/batches/${encodeURIComponent(b.id)}/regenerate-pdf`, {
      method: 'POST',
      body: JSON.stringify({ paperSize: 'a3' }),
    });
    setStatus('A3 PDF regenerated');
    await refreshQrBatches();
  });
  div.querySelector('.feature')?.addEventListener('click', async () => {
    await api(`/api/admin/qr/batches/${encodeURIComponent(b.id)}`, {
      method: 'PATCH',
      body: JSON.stringify({ featured: !b.featured }),
    });
    await refreshQrBatches();
  });
  div.querySelector('.archive')?.addEventListener('click', async () => {
    if (b.status === 'active') {
      alert('Deactivate the batch before archiving.');
      return;
    }
    if (!confirm(`Archive "${b.name}"?`)) return;
    await api(`/api/admin/qr/batches/${encodeURIComponent(b.id)}`, {
      method: 'PATCH',
      body: JSON.stringify({ status: 'archived' }),
    });
    qrSelectedBatchId = '';
    document.getElementById('qrDetail').hidden = true;
    await refreshQrSection();
  });
  div.querySelector('.restore')?.addEventListener('click', async () => {
    await api(`/api/admin/qr/batches/${encodeURIComponent(b.id)}`, {
      method: 'PATCH',
      body: JSON.stringify({ status: 'draft' }),
    });
    setStatus(`Restored ${b.name} to draft`);
    await refreshQrSection();
  });
  div.querySelector('.delete-forever')?.addEventListener('click', async () => {
    if (
      !confirm(
        `Permanently delete "${b.name}"? All codes and PDFs will be removed. This cannot be undone.`,
      )
    )
      return;
    await api(`/api/admin/qr/batches/${encodeURIComponent(b.id)}`, { method: 'DELETE' });
    if (qrSelectedBatchId === b.id) {
      qrSelectedBatchId = '';
      document.getElementById('qrDetail').hidden = true;
    }
    setStatus(`Deleted ${b.name}`);
    await refreshQrSection();
  });
  return div;
}

async function refreshQrDetail() {
  const detail = document.getElementById('qrDetail');
  if (!qrSelectedBatchId || !detail) return;
  detail.hidden = false;
  const filter = document.getElementById('qrCodeFilter')?.value || 'all';
  const q = document.getElementById('qrCodeSearch')?.value || '';
  const data = await api(
    `/api/admin/qr/batches/${encodeURIComponent(qrSelectedBatchId)}?filter=${encodeURIComponent(filter)}&q=${encodeURIComponent(q)}`,
  );
  const b = data.batch;
  document.getElementById('qrDetailMeta').textContent =
    `${b.name} ? epoch ${b.sessionEpoch} ? ${data.codes?.length || 0} shown ? ~${data.estimate?.pages || '?'} PDF pages`;
  const table = document.getElementById('qrCodeTable');
  table.innerHTML = '';
  for (const c of data.codes || []) {
    const row = document.createElement('div');
    row.className = 'qr-code-row';
    row.innerHTML = `
      <span>#${c.serial}</span>
      <code>${c.code}</code>
      <span>${c.status}</span>
      <span class="meta">${c.scannedAt ? new Date(c.scannedAt).toLocaleString() : '?'}</span>
      <span>${c.photo ? `<a href="${c.photo.url}" target="_blank" rel="noopener">photo</a>` : '?'}</span>
      <button type="button" class="btn ghost void" ${c.status === 'void' ? 'disabled' : ''}>Void</button>
    `;
    row.querySelector('.void')?.addEventListener('click', async () => {
      if (!confirm(`Void code #${c.serial}?`)) return;
      await api(`/api/admin/qr/batches/${encodeURIComponent(qrSelectedBatchId)}/void/${encodeURIComponent(c.id)}`, {
        method: 'POST',
      });
      await refreshQrDetail();
      await refreshQrBatches();
    });
    table.appendChild(row);
  }
}

async function refreshQrSection() {
  await refreshQrOverviewStats();
  await updateQrEstimate();
  await refreshQrTemplates();
  await refreshQrBatches();
  if (qrSelectedBatchId) await refreshQrDetail();
}

document.querySelectorAll('.qr-qty').forEach((btn) => {
  btn.addEventListener('click', () => {
    document.getElementById('qrQty').value = btn.dataset.qty;
    void updateQrEstimate();
  });
});
document.getElementById('qrQty')?.addEventListener('input', () => void updateQrEstimate());
document.getElementById('qrPaper')?.addEventListener('change', () => void updateQrEstimate());

document.getElementById('btnQrCreate')?.addEventListener('click', async () => {
  const name = String(document.getElementById('qrName')?.value || '').trim();
  const quantity = Number(document.getElementById('qrQty')?.value);
  if (!name) {
    setStatus('Enter an event name before generating.');
    document.getElementById('qrName')?.focus();
    return;
  }
  if (!Number.isFinite(quantity) || quantity < 1 || quantity > 500) {
    setStatus('Quantity must be between 1 and 500.');
    document.getElementById('qrQty')?.focus();
    return;
  }
  setStatus('Generating QR batch + PDF?');
  try {
    const r = await api('/api/admin/qr/batches', {
      method: 'POST',
      body: JSON.stringify({
        name,
        eventLabel: document.getElementById('qrLabel')?.value,
        quantity,
        paperSize: document.getElementById('qrPaper')?.value,
        notes: document.getElementById('qrNotes')?.value,
      }),
    });
    setStatus(`Created ${r.batch?.name} ? ${r.pdf?.pages || '?'} PDF page(s). Activate it to use on /qr-scan.`);
    document.getElementById('qrName').value = '';
    qrSelectedBatchId = r.batch?.id || '';
    await refreshQrSection();
  } catch (e) {
    setStatus(`QR generate failed: ${e.message || e}`);
  }
});

document.getElementById('btnQrResetAll')?.addEventListener('click', async () => {
  if (!confirm('Reset ALL active QR event sessions? Cards become reusable.')) return;
  const r = await api('/api/admin/qr/reset-active', { method: 'POST' });
  setStatus(`Reset ${r.batchesReset} events`);
  await refreshQrSection();
});

document.getElementById('btnQrRefreshDetail')?.addEventListener('click', () => void refreshQrDetail());
document.getElementById('qrCodeFilter')?.addEventListener('change', () => void refreshQrDetail());
document.getElementById('qrCodeSearch')?.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') void refreshQrDetail();
});

document.getElementById('btnQrUploadTemplate')?.addEventListener('click', async () => {
  const file = document.getElementById('qrTemplateFile')?.files?.[0];
  if (!file) return;
  try {
    const fd = new FormData();
    fd.append('file', file);
    fd.append('setActive', '1');
    const res = await fetch('/api/admin/qr/templates/upload', {
      method: 'POST',
      headers: { 'X-Admin-Pin': pin() },
      body: fd,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || res.statusText);
    setStatus('Template uploaded and set active');
    await refreshQrTemplates();
  } catch (e) {
    setStatus(String(e.message || e));
  }
});

function formatBytes(n) {
  const v = Number(n) || 0;
  if (v < 1024) return `${v} B`;
  if (v < 1024 * 1024) return `${(v / 1024).toFixed(1)} KB`;
  return `${(v / (1024 * 1024)).toFixed(1)} MB`;
}

async function refreshBoothUpdates() {
  const statusEl = document.getElementById('boothUpdateStatus');
  const listEl = document.getElementById('boothUpdateList');
  if (!listEl) return;
  try {
    const data = await api('/api/admin/booth-updates');
    const activeId = data.activeId || null;
    if (statusEl && !document.getElementById('boothUpdateProgressWrap')?.hidden) {
      /* keep upload progress text */
    } else if (statusEl) {
      const active = (data.releases || []).find((r) => r.id === activeId);
      statusEl.textContent = active
        ? `Published: v${active.version} (${active.buildId}) — install manually on each booth.`
        : 'No package published — upload a zip, then click Roll out.';
    }
    listEl.innerHTML = '';
    for (const r of data.releases || []) {
      const div = document.createElement('div');
      div.className = 'session-card';
      const dlPath = r.adminDownloadUrl || `/api/admin/booth-updates/${encodeURIComponent(r.id)}/download`;
      const boothUrl = r.downloadUrl || '';
      div.innerHTML = `
        <div>
          <strong>v${r.version}</strong>
          ${r.active ? '<span class="badge">rolled out</span>' : ''}
          <p class="meta">build ${r.buildId} · ${formatBytes(r.bytes)} · ${r.createdAt || ''}</p>
          ${r.notes ? `<p class="meta">${r.notes}</p>` : ''}
          <p class="meta"><code>${r.filename}</code></p>
          ${
            boothUrl
              ? `<p class="meta booth-dl-link">Booth API: <code>${boothUrl}</code> (Bearer upload token)</p>`
              : ''
          }
        </div>
        <div class="row wrap">
          ${
            r.active
              ? ''
              : `<button type="button" class="btn primary rollout">Roll out</button>`
          }
          <button type="button" class="btn ghost download">Download</button>
          <button type="button" class="btn danger delete">Delete</button>
        </div>
      `;
      div.querySelector('.rollout')?.addEventListener('click', async () => {
        if (
          !confirm(
            `Publish v${r.version} as the available update?\nBooths will not install until an operator taps Install on each machine.`,
          )
        ) {
          return;
        }
        await api(`/api/admin/booth-updates/${encodeURIComponent(r.id)}/rollout`, {
          method: 'POST',
        });
        setStatus(`Published v${r.version} for manual booth install`);
        await refreshBoothUpdates();
      });
      div.querySelector('.download')?.addEventListener('click', async () => {
        try {
          setStatus(`Downloading v${r.version}?`);
          const res = await fetch(dlPath, { headers: { 'X-Admin-Pin': pin() } });
          if (!res.ok) {
            const data = await res.json().catch(() => ({}));
            throw new Error(data.error || res.statusText);
          }
          const blob = await res.blob();
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = r.filename || `PhotoBooth-${r.version}.zip`;
          document.body.appendChild(a);
          a.click();
          a.remove();
          URL.revokeObjectURL(url);
          setStatus(`Downloaded v${r.version}`);
        } catch (e) {
          setStatus(String(e.message || e));
        }
      });
      div.querySelector('.delete')?.addEventListener('click', async () => {
        if (!confirm(`Delete release v${r.version}?`)) return;
        await api(`/api/admin/booth-updates/${encodeURIComponent(r.id)}`, { method: 'DELETE' });
        setStatus(`Deleted v${r.version}`);
        await refreshBoothUpdates();
      });
      listEl.appendChild(div);
    }
    if (!(data.releases || []).length) {
      listEl.innerHTML = '<p class="meta">No booth packages uploaded yet.</p>';
    }
  } catch (e) {
    if (statusEl) statusEl.textContent = String(e.message || e);
  }
}

document.getElementById('btnBoothUpdateRefresh')?.addEventListener('click', () => {
  void refreshBoothUpdates();
});

document.getElementById('btnBoothClearRollout')?.addEventListener('click', async () => {
  await api('/api/admin/booth-updates/clear-rollout', { method: 'POST' });
  setStatus('Booth rollout cleared');
  await refreshBoothUpdates();
});


function parseBoothZipFilename(name) {
  const base = String(name || '').replace(/^.*[\\/]/, '');
  const m = base.match(
    /^PhotoBooth-Folder-(\d+\.\d+\.\d+(?:[.-][\w.]+)?)-(\d{8}-\d{6})\.zip$/i,
  );
  if (!m) return null;
  return { version: m[1], buildId: m[2], source: 'filename' };
}

function fillBoothUpdateFieldsFromZip(file) {
  const statusEl = document.getElementById('boothUpdateStatus');
  const verEl = document.getElementById('boothUpdateVersion');
  const buildEl = document.getElementById('boothUpdateBuildId');
  const notesEl = document.getElementById('boothUpdateNotes');
  if (!file) {
    if (verEl) verEl.value = '';
    if (buildEl) buildEl.value = '';
    return;
  }
  // Large Folder zips (~150MB+) must not be fully parsed in-browser.
  const meta = parseBoothZipFilename(file.name);
  if (!meta?.version) {
    if (verEl) verEl.value = '';
    if (buildEl) buildEl.value = '';
    if (statusEl) {
      statusEl.textContent =
        'Name must look like PhotoBooth-Folder-1.1.0-20260820-232309.zip';
    }
    return;
  }
  if (verEl) verEl.value = meta.version;
  if (buildEl) buildEl.value = meta.buildId || '';
  if (notesEl && !notesEl.value.trim()) {
    notesEl.value = `Folder build v${meta.version} · build ${meta.buildId} · ${formatBytes(file.size)}`;
  }
  if (statusEl) {
    statusEl.textContent = `Ready to upload v${meta.version} (${meta.buildId}) · ${formatBytes(file.size)}`;
  }
}

function setBoothUploadProgress(pct, label) {
  const wrap = document.getElementById('boothUpdateProgressWrap');
  const bar = document.getElementById('boothUpdateProgressBar');
  const lab = document.getElementById('boothUpdateProgressLabel');
  if (wrap) wrap.hidden = false;
  if (bar) bar.style.width = `${Math.max(0, Math.min(100, pct))}%`;
  if (lab) lab.textContent = label || `${Math.round(pct)}%`;
}

function hideBoothUploadProgress() {
  const wrap = document.getElementById('boothUpdateProgressWrap');
  const bar = document.getElementById('boothUpdateProgressBar');
  if (wrap) wrap.hidden = true;
  if (bar) bar.style.width = '0%';
}

async function uploadBoothPackageXhr(file, version, buildId, notes) {
  // 512KB multipart chunks — self-signed HTTPS often dies on large raw bodies.
  const chunkSize = 512 * 1024;
  const totalChunks = Math.ceil(file.size / chunkSize);
  setBoothUploadProgress(
    0,
    `Chunked upload · 0 / ${totalChunks} · ${formatBytes(file.size)}`,
  );

  const initRes = await fetch('/api/admin/booth-updates/init', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Admin-Pin': pin(),
    },
    body: JSON.stringify({
      version,
      buildId,
      notes,
      bytes: file.size,
      totalChunks,
    }),
  });
  const initData = await initRes.json().catch(() => ({}));
  if (!initRes.ok || !initData.ok || !initData.uploadId) {
    throw new Error(initData.error || `Init failed (HTTP ${initRes.status})`);
  }
  const uploadId = initData.uploadId;

  for (let i = 0; i < totalChunks; i += 1) {
    const start = i * chunkSize;
    const end = Math.min(file.size, start + chunkSize);
    const blob = file.slice(start, end);
    let lastErr = null;
    for (let attempt = 1; attempt <= 5; attempt += 1) {
      try {
        // eslint-disable-next-line no-await-in-loop
        await new Promise((resolve, reject) => {
          const fd = new FormData();
          fd.append('chunk', blob, `part-${i}.bin`);
          const xhr = new XMLHttpRequest();
          xhr.open(
            'POST',
            `/api/admin/booth-updates/chunk/${encodeURIComponent(uploadId)}`,
          );
          xhr.setRequestHeader('X-Admin-Pin', pin());
          xhr.setRequestHeader('X-Chunk-Index', String(i));
          xhr.timeout = 120000;
          xhr.upload.onprogress = (e) => {
            if (!e.lengthComputable) return;
            const loaded = start + e.loaded;
            const pct = (loaded / file.size) * 100;
            setBoothUploadProgress(
              pct,
              `Chunk ${i + 1}/${totalChunks} · ${formatBytes(loaded)} / ${formatBytes(file.size)}`,
            );
          };
          xhr.onload = () => {
            let data = {};
            try {
              data = JSON.parse(xhr.responseText || '{}');
            } catch {
              data = {};
            }
            if (xhr.status >= 200 && xhr.status < 300 && data.ok) {
              resolve(data);
              return;
            }
            reject(new Error(data.error || `Chunk ${i} failed (HTTP ${xhr.status})`));
          };
          xhr.onerror = () =>
            reject(new Error(`Chunk ${i} network/SSL error — retrying…`));
          xhr.ontimeout = () => reject(new Error(`Chunk ${i} timed out`));
          xhr.send(fd);
        });
        lastErr = null;
        break;
      } catch (e) {
        lastErr = e;
        setBoothUploadProgress(
          (start / file.size) * 100,
          `Chunk ${i + 1}/${totalChunks} failed (${attempt}/5): ${e.message || e}`,
        );
        // eslint-disable-next-line no-await-in-loop
        await new Promise((r) => setTimeout(r, 500 * attempt));
      }
    }
    if (lastErr) throw lastErr;
    setBoothUploadProgress(
      (end / file.size) * 100,
      `Chunk ${i + 1}/${totalChunks} done · ${formatBytes(end)} / ${formatBytes(file.size)}`,
    );
  }

  setBoothUploadProgress(99, 'Assembling on server…');
  const doneRes = await fetch(
    `/api/admin/booth-updates/complete/${encodeURIComponent(uploadId)}`,
    {
      method: 'POST',
      headers: { 'X-Admin-Pin': pin() },
    },
  );
  const doneData = await doneRes.json().catch(() => ({}));
  if (!doneRes.ok || !doneData.ok) {
    throw new Error(doneData.error || `Complete failed (HTTP ${doneRes.status})`);
  }
  return doneData;
}

document.getElementById('boothUpdateFile')?.addEventListener('change', (e) => {
  const file = e.target?.files?.[0] || null;
  fillBoothUpdateFieldsFromZip(file);
});

document.getElementById('btnBoothUpdateUpload')?.addEventListener('click', async () => {
  const file = document.getElementById('boothUpdateFile')?.files?.[0];
  let version = document.getElementById('boothUpdateVersion')?.value?.trim();
  let buildId = document.getElementById('boothUpdateBuildId')?.value?.trim();
  const notes = document.getElementById('boothUpdateNotes')?.value?.trim();
  const statusEl = document.getElementById('boothUpdateStatus');
  const btn = document.getElementById('btnBoothUpdateUpload');
  if (!file) {
    if (statusEl) statusEl.textContent = 'Choose a .zip file first.';
    return;
  }
  if (!version) {
    fillBoothUpdateFieldsFromZip(file);
    version = document.getElementById('boothUpdateVersion')?.value?.trim();
    buildId = document.getElementById('boothUpdateBuildId')?.value?.trim();
  }
  if (!version) {
    if (statusEl) statusEl.textContent = 'Version missing — use a stamped Folder build zip.';
    return;
  }
  try {
    if (btn) btn.disabled = true;
    setBoothUploadProgress(0, 'Starting upload…');
    if (statusEl) statusEl.textContent = 'Uploading — keep this tab open.';
    const data = await uploadBoothPackageXhr(file, version, buildId, notes);
    setBoothUploadProgress(100, 'Upload complete');
    setStatus(`Uploaded v${data.release?.version || version}`);
    if (statusEl) {
      statusEl.textContent = `Uploaded v${data.release?.version || version}. Click Roll out when ready.`;
    }
    const verEl = document.getElementById('boothUpdateVersion');
    const buildEl = document.getElementById('boothUpdateBuildId');
    const notesEl = document.getElementById('boothUpdateNotes');
    const fileEl = document.getElementById('boothUpdateFile');
    if (verEl) verEl.value = '';
    if (buildEl) buildEl.value = '';
    if (notesEl) notesEl.value = '';
    if (fileEl) fileEl.value = '';
    setTimeout(() => hideBoothUploadProgress(), 1200);
    await refreshBoothUpdates();
  } catch (e) {
    hideBoothUploadProgress();
    if (statusEl) statusEl.textContent = String(e.message || e);
  } finally {
    if (btn) btn.disabled = false;
  }
});
