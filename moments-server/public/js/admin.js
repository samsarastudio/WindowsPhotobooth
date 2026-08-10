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
const wallEmpty = document.getElementById('wallEmpty');
const photoAlbum = document.getElementById('photoAlbum');
const photoGrid = document.getElementById('photoGrid');
const btnOpenAlbum = document.getElementById('btnOpenAlbum');

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
  document.querySelectorAll('.admin-tab').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.tab === tab);
  });
  document.querySelectorAll('.admin-section').forEach((sec) => {
    sec.hidden = sec.dataset.section !== tab;
  });
  if (tab === 'photos') void refreshPhotos();
  if (tab === 'frames') void refreshFrames();
  if (tab === 'albums') void refreshAlbums();
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

function updateOpenAlbumLink() {
  const slug = photoAlbum.value;
  btnOpenAlbum.href = slug ? `/${encodeURIComponent(slug)}` : '#';
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

async function refreshAll() {
  const settings = await api('/api/admin/settings');
  ttlEl.value = String(settings.settings.defaultTtlDays);
  const wall = await api('/api/admin/wall/settings');
  wallTitle.value = wall.wall.title || '';
  wallOverlay.value = wall.wall.overlay || '';
  wallColumns.value = String(wall.wall.columns ?? 14);
  wallEmpty.value = String(wall.wall.emptyRatio ?? 0.22);
  await refreshAlbums();
  await refreshFrames();
}

document.getElementById('btnLogin').addEventListener('click', async () => {
  loginErr.hidden = true;
  try {
    await refreshAll();
    loginCard.hidden = true;
    panel.hidden = false;
    setTab('overview');
  } catch (e) {
    loginErr.hidden = false;
    loginErr.textContent = String(e.message || e);
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

document.getElementById('btnSaveWall').addEventListener('click', async () => {
  try {
    await api('/api/admin/wall/settings', {
      method: 'PATCH',
      body: JSON.stringify({
        title: wallTitle.value,
        overlay: wallOverlay.value,
        columns: Number(wallColumns.value),
        emptyRatio: Number(wallEmpty.value),
      }),
    });
    setStatus('Wall settings saved');
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
