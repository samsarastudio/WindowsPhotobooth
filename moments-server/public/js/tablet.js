const PIN_KEY = 'moments-tablet-admin-pin';

function prefixFromPath() {
  const parts = location.pathname.split('/').filter(Boolean);
  // /tablet or /tablet/:prefix
  if (parts[0] === 'tablet' && parts[1]) return decodeURIComponent(parts[1]);
  const q = new URLSearchParams(location.search);
  return q.get('prefix') || q.get('eventPrefix') || 'halloween';
}

const state = {
  prefix: prefixFromPath(),
  pin: localStorage.getItem(PIN_KEY) || '',
  photos: [],
  slug: null,
  es: null,
};

const el = {
  title: document.getElementById('tbTitle'),
  sub: document.getElementById('tbSub'),
  grid: document.getElementById('tbGrid'),
  status: document.getElementById('tbStatus'),
  pin: document.getElementById('tbPin'),
  refresh: document.getElementById('tbRefresh'),
  tpl: document.getElementById('tbCardTpl'),
};

el.pin.value = state.pin;
el.pin.addEventListener('change', () => {
  state.pin = el.pin.value.trim();
  localStorage.setItem(PIN_KEY, state.pin);
});

el.refresh.addEventListener('click', () => void loadToday());

function setStatus(msg, show = true) {
  el.status.hidden = !show;
  el.status.textContent = msg || '';
}

function formatTime(iso) {
  try {
    return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  } catch {
    return '';
  }
}

function render() {
  el.grid.innerHTML = '';
  if (!state.photos.length) {
    const empty = document.createElement('p');
    empty.className = 'tb-empty';
    empty.textContent = 'No photos yet for today. Waiting for booth uploads…';
    el.grid.appendChild(empty);
    return;
  }
  for (const photo of state.photos) {
    const node = el.tpl.content.firstElementChild.cloneNode(true);
    const img = node.querySelector('.tb-thumb');
    const badge = node.querySelector('.tb-badge');
    const variant = node.querySelector('.tb-variant');
    const time = node.querySelector('.tb-time');
    const printBtn = node.querySelector('.tb-print');
    const jobEl = node.querySelector('.tb-job');

    img.src = photo.thumbUrl || photo.url;
    img.alt = photo.variant || 'photo';
    const processing = photo.processStatus === 'processing';
    badge.textContent = processing ? 'Processing' : 'Ready';
    badge.classList.add(processing ? 'is-processing' : 'is-ready');
    variant.textContent = `${(photo.variant || 'photo').toUpperCase()}${photo.hasAi ? ' · AI' : ''}`;
    time.textContent = formatTime(photo.createdAt);

    if (processing) {
      printBtn.disabled = true;
      printBtn.textContent = 'Waiting for AI…';
    }

    if (photo.printJob) {
      jobEl.hidden = false;
      jobEl.textContent = `Print: ${photo.printJob.status}${photo.printJob.error ? ` — ${photo.printJob.error}` : ''}`;
      if (photo.printJob.status === 'queued' || photo.printJob.status === 'claimed') {
        printBtn.disabled = true;
        printBtn.textContent = 'Print queued…';
      } else if (photo.printJob.status === 'done') {
        printBtn.textContent = 'Print again';
      }
    }

    if (!processing) {
      printBtn.addEventListener('click', () => void sendPrint(photo, printBtn, jobEl));
    }
    el.grid.appendChild(node);
  }
}

async function sendPrint(photo, btn, jobEl) {
  const pin = el.pin.value.trim();
  if (!pin) {
    setStatus('Enter the Moments Admin PIN to approve prints.');
    el.pin.focus();
    return;
  }
  btn.disabled = true;
  btn.textContent = 'Sending…';
  setStatus('', false);
  try {
    const r = await fetch(`/api/tablet/photos/${encodeURIComponent(photo.id)}/print`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Admin-Pin': pin,
      },
      body: JSON.stringify({}),
    });
    const j = await r.json();
    if (!r.ok || !j.ok) {
      throw new Error(j.error || `HTTP ${r.status}`);
    }
    localStorage.setItem(PIN_KEY, pin);
    jobEl.hidden = false;
    jobEl.textContent = j.deduped ? 'Print already queued' : 'Print queued for kiosk';
    btn.textContent = 'Print queued…';
    await loadToday({ silent: true });
  } catch (e) {
    btn.disabled = false;
    btn.textContent = 'Send print to kiosk';
    setStatus(String(e.message || e));
  }
}

async function loadToday({ silent = false } = {}) {
  if (!silent) setStatus('', false);
  try {
    const r = await fetch(`/api/tablet/today?prefix=${encodeURIComponent(state.prefix)}`);
    const j = await r.json();
    if (!r.ok || !j.ok) throw new Error(j.error || `HTTP ${r.status}`);
    state.slug = j.slug;
    state.photos = Array.isArray(j.photos) ? j.photos : [];
    el.title.textContent = j.title || `Today — ${j.date || ''}`;
    el.sub.textContent = j.empty
      ? `Waiting for album ${j.slug}`
      : `${state.photos.length} capture${state.photos.length === 1 ? '' : 's'} · ${j.slug}`;
    document.title = `Tablet · ${j.slug || state.prefix}`;
    render();
    connectStream(j.streamPath);
  } catch (e) {
    setStatus(String(e.message || e));
  }
}

function connectStream(streamPath) {
  if (!streamPath) return;
  if (state.es) {
    try {
      state.es.close();
    } catch (_) {}
    state.es = null;
  }
  try {
    const es = new EventSource(streamPath);
    state.es = es;
    es.addEventListener('photo.added', () => void loadToday({ silent: true }));
    es.onerror = () => {
      /* browser will retry; also poll */
    };
  } catch (_) {
    /* ignore */
  }
}

// Soft poll so print job status updates even without SSE events.
setInterval(() => void loadToday({ silent: true }), 8000);
void loadToday();
