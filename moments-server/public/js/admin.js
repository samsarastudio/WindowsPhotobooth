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
const wallBrandText = document.getElementById('wallBrandText');
const wallBrandPreview = document.getElementById('wallBrandPreview');
const photoAlbum = document.getElementById('photoAlbum');
const photoGrid = document.getElementById('photoGrid');
const btnOpenAlbum = document.getElementById('btnOpenAlbum');
const uploadTokenEl = document.getElementById('uploadToken');
const publicBaseUrlEl = document.getElementById('publicBaseUrl');
const tokenMetaEl = document.getElementById('tokenMeta');

/** @type {any[]} */
let albumsCache = [];

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
      <img src="${p.url}" alt="" loading="lazy" />
      <div class="meta-block">
        <span class="badge">${p.variant}</span>
        <code style="font-size:0.68rem;word-break:break-all">${p.id}</code>
        <a class="btn ghost" href="${p.shareUrl}" target="_blank" rel="noopener">Open</a>
        <button type="button" class="btn ghost delete">Delete photo</button>
      </div>
    `;
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

async function refreshAll() {
  const settings = await api('/api/admin/settings');
  ttlEl.value = String(settings.settings.defaultTtlDays);
  applyTokenSettings(settings.settings);
  const wall = await api('/api/admin/wall/settings');
  wallTitle.value = wall.wall.title || '';
  wallOverlay.value = wall.wall.overlay || '';
  if (wallBrandText) wallBrandText.value = wall.wall.brandText || '';
  if (wallBrandPreview) {
    wallBrandPreview.textContent = wall.wall.brandLogoUrl
      ? `Partner logo on file${wall.wall.brandText ? ` · ${wall.wall.brandText}` : ''}`
      : wall.wall.brandText
        ? `Partner text: ${wall.wall.brandText}`
        : 'No partner brand set — inmoment shows alone.';
  }
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
    await api('/api/admin/wall/settings', {
      method: 'PATCH',
      body: JSON.stringify({
        title: wallTitle.value,
        overlay: wallOverlay.value,
        brandText: wallBrandText?.value || '',
      }),
    });
    setStatus('Wall settings saved');
    const wall = await api('/api/admin/wall/settings');
    if (wallBrandPreview) {
      wallBrandPreview.textContent = wall.wall.brandLogoUrl
        ? `Partner logo on file${wall.wall.brandText ? ` · ${wall.wall.brandText}` : ''}`
        : wall.wall.brandText
          ? `Partner text: ${wall.wall.brandText}`
          : 'No partner brand set — inmoment shows alone.';
    }
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
    if (wallBrandPreview) {
      wallBrandPreview.textContent = r.wall?.brandLogoUrl
        ? `Partner logo uploaded${r.wall.brandText ? ` · ${r.wall.brandText}` : ''}`
        : 'Partner logo uploaded';
    }
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
    if (wallBrandPreview && r.wall) {
      wallBrandPreview.textContent = r.wall.brandLogoUrl
        ? `Partner logo on file${r.wall.brandText ? ` · ${r.wall.brandText}` : ''}`
        : r.wall.brandText
          ? `Partner text: ${r.wall.brandText}`
          : 'No partner brand set — inmoment shows alone.';
    }
    setStatus('Partner logo cleared');
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
