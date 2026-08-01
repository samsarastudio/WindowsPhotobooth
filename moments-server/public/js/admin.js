const pinEl = document.getElementById('pin');
const panel = document.getElementById('panel');
const loginErr = document.getElementById('loginErr');
const adminStatus = document.getElementById('adminStatus');
const sessionList = document.getElementById('sessionList');
const ttlEl = document.getElementById('ttl');

function pin() {
  return pinEl.value.trim();
}

async function api(path, opts = {}) {
  const headers = {
    'Content-Type': 'application/json',
    'X-Admin-Pin': pin(),
    ...(opts.headers || {}),
  };
  const res = await fetch(path, { ...opts, headers });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || res.statusText);
  return data;
}

async function refresh() {
  const settings = await api('/api/admin/settings');
  ttlEl.value = String(settings.settings.defaultTtlDays);
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
        <a class="btn ghost" href="/${encodeURIComponent(s.slug)}" target="_blank" rel="noopener">Open</a>
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

document.getElementById('btnPurge').addEventListener('click', async () => {
  try {
    const r = await api('/api/admin/purge-expired', { method: 'POST', body: '{}' });
    adminStatus.textContent = `Purged ${r.sessionsRemoved} sessions (${r.photosRemoved} photos)`;
    await refresh();
  } catch (e) {
    adminStatus.textContent = String(e.message || e);
  }
});
