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
    ? 'Backdrop on file — centered behind the wall, glimpsed when photos swap.'
    : 'No backdrop yet — choose a file, then click Upload backdrop.';
}

function syncWallModeStatus(completed) {
  if (!wallModeStatus) return;
  wallModeStatus.textContent = completed
    ? 'Completed filled grid — dense end-of-show layout on /wall.'
    : 'Live collage — photos float and swap during the event.';
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
    frameList.innerHTML = '<p class="meta">No frames on the server yet — upload a PNG overlay.</p>';
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
    sessionList.innerHTML = '<p class="meta">No albums yet. Use “Add sample photos” or capture from a booth.</p>';
    return;
  }
  for (const s of albumsCache) {
    const div = document.createElement('div');
    div.className = `session-item${s.expired ? ' expired' : ''}`;
    div.innerHTML = `
      <strong>${s.slug}</strong>
      <span class="meta">${s.title} · ${s.photoCount} photos · expires ${new Date(s.expiresAt).toLocaleString()}${s.expired ? ' · EXPIRED' : ''}</span>
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
  if (publicBaseUrlEl) publicBaseUrlEl.textContent = settings.publicBaseUrl || '—';
  if (tokenMetaEl) {
    const src =
      settings.uploadTokenSource === 'settings'
        ? 'saved in admin'
        : settings.uploadTokenSource === 'env'
          ? 'from server .env'
          : 'not set';
    tokenMetaEl.textContent = settings.uploadTokenConfigured
      ? `Token active (${src}). Paste into Photobooth Admin → Gallery.`
      : 'No token set — booth uploads will fail until you save one.';
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
      ? `Partner logo on file${wall.brandText ? ` · ${wall.brandText}` : ''}${
          wall.brandRevealEnabled ? ' · reveal on' : ' · reveal off'
        }`
      : wall.brandText
        ? `Partner text: ${wall.brandText}`
        : 'No partner brand set — upload a logo to use reveal.';
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
    setStatus('Nothing to copy — generate or enter a token first');
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
  setStatus('Generated a new token — click Save token, then paste it into the photobooth');
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
