const pinEl = document.getElementById('pin');
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

function pin() {
  return pinEl.value.trim();
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

async function refreshFrames() {
  const list = await api('/api/admin/frames');
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
      adminStatus.textContent = `Deleted frame ${f.filename}`;
      await refreshFrames();
    });
    frameList.appendChild(div);
  }
  if (!(list.frames || []).length) {
    frameList.innerHTML = '<p class="meta">No frames yet — upload a PNG overlay.</p>';
  }
}

async function refresh() {
  const settings = await api('/api/admin/settings');
  ttlEl.value = String(settings.settings.defaultTtlDays);
  const wall = await api('/api/admin/wall/settings');
  wallTitle.value = wall.wall.title || '';
  wallOverlay.value = wall.wall.overlay || '';
  wallColumns.value = String(wall.wall.columns ?? 14);
  wallEmpty.value = String(wall.wall.emptyRatio ?? 0.22);

  await refreshFrames();

  const list = await api('/api/admin/sessions');
  sessionList.innerHTML = '';
  for (const s of list.sessions) {
    const div = document.createElement('div');
    div.className = `session-item${s.expired ? ' expired' : ''}`;
    div.innerHTML = `
      <strong>${s.slug}</strong>
      <span class="meta">${s.title} · ${s.photoCount} photos · expires ${new Date(s.expiresAt).toLocaleString()}${s.expired ? ' · EXPIRED' : ''}</span>
      <div class="row">
        <input class="input ttl-days" type="number" min="1" max="3650" placeholder="Extend days" style="max-width:8rem" />
        <button type="button" class="btn ghost extend">Set TTL days</button>
        <a class="btn ghost" href="/${encodeURIComponent(s.slug)}" target="_blank" rel="noopener">Grid</a>
        <a class="btn ghost" href="/${encodeURIComponent(s.slug)}/wall" target="_blank" rel="noopener">Wall</a>
        <a class="btn ghost" href="/${encodeURIComponent(s.slug)}/slideshow" target="_blank" rel="noopener">Slideshow</a>
        <button type="button" class="btn ghost delete">Delete</button>
      </div>
    `;
    div.querySelector('.extend').addEventListener('click', async () => {
      const days = Number(div.querySelector('.ttl-days').value);
      if (!days) return;
      await api(`/api/admin/sessions/${encodeURIComponent(s.slug)}`, {
        method: 'PATCH',
        body: JSON.stringify({ ttlDays: days }),
      });
      adminStatus.textContent = `Updated ${s.slug}`;
      await refresh();
    });
    div.querySelector('.delete').addEventListener('click', async () => {
      if (!confirm(`Delete session ${s.slug}?`)) return;
      await api(`/api/admin/sessions/${encodeURIComponent(s.slug)}`, { method: 'DELETE' });
      adminStatus.textContent = `Deleted ${s.slug}`;
      await refresh();
    });
    sessionList.appendChild(div);
  }
}

document.getElementById('btnLogin').addEventListener('click', async () => {
  loginErr.hidden = true;
  try {
    await refresh();
    panel.hidden = false;
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
    adminStatus.textContent = 'Default TTL saved';
  } catch (e) {
    adminStatus.textContent = String(e.message || e);
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
    adminStatus.textContent = 'Wall settings saved';
  } catch (e) {
    adminStatus.textContent = String(e.message || e);
  }
});

document.getElementById('btnUploadFrame').addEventListener('click', async () => {
  const input = document.getElementById('frameFile');
  const file = input.files?.[0];
  if (!file) {
    adminStatus.textContent = 'Choose a frame image first';
    return;
  }
  try {
    const fd = new FormData();
    fd.append('frame', file, file.name);
    await api('/api/admin/frames', { method: 'POST', body: fd });
    input.value = '';
    adminStatus.textContent = `Uploaded ${file.name}`;
    await refreshFrames();
  } catch (e) {
    adminStatus.textContent = String(e.message || e);
  }
});

document.getElementById('btnPurge').addEventListener('click', async () => {
  try {
    const r = await api('/api/admin/purge-expired', { method: 'POST', body: '{}' });
    adminStatus.textContent = `Purged ${r.sessionsRemoved} sessions (${r.photosRemoved} photos)`;
    await refresh();
  } catch (e) {
    adminStatus.textContent = String(e.message || e);
  }
});
