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
const wallModeStatus = document.getElementById('wallModeStatus');
const photoAlbum = document.getElementById('photoAlbum');
const photoGrid = document.getElementById('photoGrid');
const photoSelectionMeta = document.getElementById('photoSelectionMeta');
const btnBulkDeletePhotos = document.getElementById('btnBulkDeletePhotos');
const btnOpenAlbum = document.getElementById('btnOpenAlbum');
const uploadTokenEl = document.getElementById('uploadToken');
const publicBaseUrlEl = document.getElementById('publicBaseUrl');
const tokenMetaEl = document.getElementById('tokenMeta');

/** @type {any[]} */
let albumsCache = [];
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
    div.innerHTML = `
      <img src="${f.url}?v=${Date.now()}" alt="" />
      <strong>${f.label}</strong>
      <code>${f.filename}</code>
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
    frameList.innerHTML = '<p class="meta">No frames on the server yet ? upload a PNG overlay.</p>';
  }
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

async function refreshPhotos() {
  if (!photoAlbum.value) {
    if (albumsCache[0]) photoAlbum.value = albumsCache[0].slug;
  }
  updateOpenAlbumLink();
  const slug = photoAlbum.value;
  selectedPhotoIds.clear();
  updatePhotoSelectionUi();
  photoGrid.innerHTML = '';
  if (!slug) {
    photoGrid.innerHTML = '<p class="meta">No album selected.</p>';
    return;
  }
  const data = await api(`/api/admin/sessions/${encodeURIComponent(slug)}`);
  const photos = data.session?.photos || [];
  if (!photos.length) {
    photoGrid.innerHTML = '<p class="meta">This album has no photos.</p>';
    return;
  }
  for (const p of photos) {
    const card = document.createElement('article');
    card.className = 'photo-admin-card';
    card.innerHTML = `
      <label class="photo-select">
        <input type="checkbox" class="photo-check" data-id="${p.id}" />
        <span class="sr-only">Select photo</span>
      </label>
      <img src="${p.url}" alt="" loading="lazy" />
      <div class="meta-block">
        <span class="badge">${p.variant}</span>
        <code style="font-size:0.68rem;word-break:break-all">${p.id}</code>
        <a class="btn ghost" href="${p.shareUrl}" target="_blank" rel="noopener">Open</a>
        <button type="button" class="btn ghost delete">Delete photo</button>
      </div>
    `;
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
    card.querySelector('.delete').addEventListener('click', async () => {
      if (!confirm('Delete this photo from the album?')) return;
      await api(`/api/admin/sessions/${encodeURIComponent(slug)}/photos/${encodeURIComponent(p.id)}`, {
        method: 'DELETE',
      });
      setStatus(`Deleted photo ${p.id}`);
      await refreshAll();
      await refreshPhotos();
    });
    photoGrid.appendChild(card);
  }
}

function applyTokenSettings(settings) {
  if (uploadTokenEl) uploadTokenEl.value = settings.uploadToken || '';
  if (publicBaseUrlEl) publicBaseUrlEl.textContent = settings.publicBaseUrl || '?';
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
    await api('/api/admin/frames', { method: 'POST', body: fd });
    input.value = '';
    setStatus(`Uploaded ${file.name}`);
    await refreshFrames();
  } catch (e) {
    setStatus(String(e.message || e));
  }
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
photoAlbum?.addEventListener('change', () => {
  updateOpenAlbumLink();
  void refreshPhotos();
});

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
    if (!res.ok) throw new Error('Download failed');
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
  const chunkSize = 2 * 1024 * 1024; // 2MB — keeps TLS records small
  const totalChunks = Math.ceil(file.size / chunkSize);
  setBoothUploadProgress(0, `Preparing ${totalChunks} chunks…`);

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
    const buf = await blob.arrayBuffer();
    // retry each chunk a few times (SSL blips)
    let lastErr = null;
    for (let attempt = 1; attempt <= 4; attempt += 1) {
      try {
        // eslint-disable-next-line no-await-in-loop
        await new Promise((resolve, reject) => {
          const xhr = new XMLHttpRequest();
          xhr.open('PUT', `/api/admin/booth-updates/chunk/${encodeURIComponent(uploadId)}`);
          xhr.setRequestHeader('X-Admin-Pin', pin());
          xhr.setRequestHeader('Content-Type', 'application/octet-stream');
          xhr.setRequestHeader('X-Chunk-Index', String(i));
          xhr.timeout = 0;
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
          xhr.onerror = () => reject(new Error(`Chunk ${i} network error`));
          xhr.ontimeout = () => reject(new Error(`Chunk ${i} timed out`));
          xhr.send(buf);
        });
        lastErr = null;
        break;
      } catch (e) {
        lastErr = e;
        // brief backoff
        // eslint-disable-next-line no-await-in-loop
        await new Promise((r) => setTimeout(r, 400 * attempt));
      }
    }
    if (lastErr) throw lastErr;
    const loaded = end;
    const pct = (loaded / file.size) * 100;
    setBoothUploadProgress(
      pct,
      `Uploading chunk ${i + 1}/${totalChunks} · ${formatBytes(loaded)} / ${formatBytes(file.size)}`,
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
