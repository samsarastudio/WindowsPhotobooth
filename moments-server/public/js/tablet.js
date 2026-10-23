import { attachPhotoSharing } from './tablet-share.js?v=20261023';
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
  es: null, streamPath: null, page: 1, selectedId: null, loading: false, pendingPrints: new Set(),
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

const PAGE_SIZE = 8;
const preview = document.getElementById('tbPreview');
const pageSelect = document.getElementById('tbPage');
for (const [id, delta] of [['tbPrev',-1],['tbNext',1]]) document.getElementById(id).addEventListener('click',()=>{state.page+=delta;state.selectedId=null;render();});
pageSelect.addEventListener('change',()=>{state.page=Number(pageSelect.value);state.selectedId=null;render();});
el.refresh.addEventListener('click', () => void loadToday());

function setStatus(msg, show = true) {
  el.status.hidden = !show;
  el.status.textContent = msg || '';
}

function formatTime(iso) {
  try {
    return new Date(iso).toLocaleString([], { month:'short',day:'numeric',hour: '2-digit', minute: '2-digit', second: '2-digit' });
  } catch {
    return '';
  }
}

let lastRenderKey = '';
function renderKey() {
  return JSON.stringify([state.photos, state.page, state.selectedId, [...state.pendingPrints]]);
}
function render() {
  // Polling unchanged data must not tear down images, buttons, or an active touch.
  if (renderKey() === lastRenderKey) return;
  el.grid.innerHTML = '';
  preview.replaceChildren();
  const pages=Math.max(1,Math.ceil(state.photos.length/PAGE_SIZE));
  state.page=Math.min(pages,Math.max(1,state.page));
  pageSelect.replaceChildren(...Array.from({length:pages},(_,i)=>new Option(String(i+1),String(i+1),false,i+1===state.page)));
  document.getElementById('tbPrev').disabled=state.page<=1;
  document.getElementById('tbNext').disabled=state.page>=pages;
  const start=(state.page-1)*PAGE_SIZE, items=state.photos.slice(start,start+PAGE_SIZE);
  document.getElementById('tbPageMeta').textContent=state.photos.length?`${start+1}–${start+items.length} of ${state.photos.length} · page ${state.page} of ${pages}`:'No photos';
  if(!items.some(p=>p.id===state.selectedId))state.selectedId=items[0]?.id;

  if (!state.photos.length) {
    const empty = document.createElement('p');
    empty.className = 'tb-empty';
    empty.textContent = 'Ready for your first guest. New photos will appear here automatically.';
    el.grid.appendChild(empty);
    lastRenderKey = renderKey();
    return;
  }
  for (const photo of items) {
    const node = el.tpl.content.firstElementChild.cloneNode(true);
    const img = node.querySelector('.tb-thumb');
    const badge = node.querySelector('.tb-badge');
    const variant = node.querySelector('.tb-variant');
    const time = node.querySelector('.tb-time');
    const printBtn = node.querySelector('.tb-print');
    const jobEl = node.querySelector('.tb-job');
    const retryBtn = node.querySelector('.tb-retry');
    const magnetBtn = node.querySelector('.tb-magnet');
    magnetBtn.hidden = !photo.canMakeMagnet;
    magnetBtn.onclick = () => void makeMagnet(photo, magnetBtn);
    retryBtn.hidden = !photo.canRetryPortrait;
    retryBtn.onclick = async () => {
      const pin = el.pin.value.trim();
      if (!pin) { setStatus('Enter your operator PIN to retry this portrait.'); el.pin.focus(); return; }
      if (!confirm('Retry this portrait? A new OpenAI generation may use credits.')) return;
      retryBtn.disabled = true;
      try {
        const response = await fetch(`/api/tablet/photos/${encodeURIComponent(photo.retryPhotoId || photo.id)}/retry`, {
          method: 'POST', headers: {'X-Admin-Pin': pin},
        });
        const result = await response.json();
        if (!response.ok || !result.ok) throw new Error(result.error || 'Retry could not start');
        setStatus('Portrait queued on Moments. It will appear here when ready.');
        await loadToday({silent:true});
      } catch (error) { setStatus(error.message || 'Retry could not start. Refresh to check the job before trying again.'); }
      finally { retryBtn.disabled = false; }
    };

    img.src = photo.thumbUrl || photo.url;
    img.decoding = 'async';
    img.alt = photo.variant || 'photo';
    const processing = photo.processStatus === 'processing';
    const failed = photo.processStatus === 'failed';
    const qrButton = node.querySelector('.tb-qr');
    qrButton.disabled = processing || failed;
    qrButton.onclick = async () => {
      qrButton.disabled = true;
      try {
        const response = await fetch(`/api/tablet/photos/${encodeURIComponent(photo.id)}/qr`,{signal:AbortSignal.timeout(15000)});
        const result = await response.json();
        if (!response.ok || !result.ok) throw Error(result.error || 'Could not create QR');
        const dialog = document.getElementById('tbQrDialog');
        dialog.querySelector('.tb-qr-image').src = result.qr;
        dialog.querySelector('.tb-qr-link').href = result.url;
        dialog.querySelector('.tb-close').onclick = () => dialog.close();
        dialog.showModal();
      } catch(error) {setStatus(error.message);}
      finally {qrButton.disabled=false;}
    };
    badge.textContent = failed ? 'AI photo failed' : processing ? 'Creating AI photo' : 'Ready to print';
    badge.classList.add(failed ? 'is-failed' : processing ? 'is-processing' : 'is-ready');
    variant.textContent = failed ? (photo.processError || 'Ask the booth operator to check generation') : processing ? ({'server-queued':'Portrait queued on Moments','server-generating':'Moments is generating your portrait','kiosk-processing':'Waiting for processing on the kiosk'}[photo.processingStage] || 'AI photo') : ({ ai: 'AI photo', framed: 'Framed photo', original: 'Classic photo', physical: 'Magnet print' })[photo.variant] || 'Photo';
    time.textContent = formatTime(photo.capturedAt || photo.createdAt);
    if (processing && photo.queuePosition) variant.textContent = photo.processingStage === 'server-generating' ? 'Creating your portrait · first in queue' : `Portrait queue · position ${photo.queuePosition}`;
    if (processing && photo.processingStage === 'kiosk-processing' && Date.now() - Date.parse(photo.createdAt) > 10 * 60 * 1000) {
      variant.textContent = 'Still waiting for the kiosk. If the kiosk stopped, retake there: no portrait inputs reached Moments.';
    }
    if (!processing && !failed && photo.variant === 'ai' && photo.generationType === 'portrait') {
      variant.textContent = 'AI portrait · OpenAI';
    }

    if (processing || failed) {
      printBtn.disabled = true;
      printBtn.textContent = failed ? 'AI photo unavailable' : 'Creating photo…';
    }

    if (photo.printJob) {
      jobEl.hidden = false;
      jobEl.textContent = ({ queued: 'Waiting for the booth to collect this print.', claimed: 'The booth is preparing your print.', done: 'Accepted by the Windows print queue. Printing waits if the printer is offline.', error: 'Print unsuccessful. Check the booth and printer, then try again.' })[photo.printJob.status] || 'Checking print status…';
      if (photo.printJob.status === 'queued' || photo.printJob.status === 'claimed') {
        printBtn.disabled = true;
        printBtn.textContent = 'Print requested';
      } else if (photo.printJob.status === 'done') {
        printBtn.textContent = 'Print again';
      }
    }

    if(state.pendingPrints.has(photo.id)){printBtn.disabled=true;printBtn.textContent='Sending…';}
    if (!processing && !failed) {
      printBtn.addEventListener('click', () => void sendPrint(photo, printBtn, jobEl));
    }
    const thumb=document.createElement('button');thumb.type='button';thumb.className='tb-film-thumb';thumb.setAttribute('aria-label',`${variant.textContent}, ${time.textContent}`);thumb.setAttribute('aria-pressed',String(photo.id===state.selectedId));
    const small=img.cloneNode(true),stamp=document.createElement('span');stamp.textContent=time.textContent;thumb.append(small,stamp);
    thumb.addEventListener('click',()=>{state.selectedId=photo.id;render();});el.grid.appendChild(thumb);
    if(photo.id===state.selectedId){
      img.src=photo.url||photo.thumbUrl;img.loading='eager';preview.appendChild(node);
      attachPhotoSharing(node, photo, !processing && !failed, setStatus);
    }

  }
  lastRenderKey = renderKey();
}

async function sendPrint(photo, btn, jobEl) {
  if(state.pendingPrints.has(photo.id))return;
  const pin = el.pin.value.trim();
  if (!pin) {
    setStatus('Enter your operator PIN to print this photo.');
    el.pin.focus();
    return;
  }
  state.pendingPrints.add(photo.id);
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
    jobEl.textContent = j.deduped ? 'Print already queued' : 'Print requested. Waiting for the booth.';
    btn.textContent = 'Print requested';
    state.pendingPrints.delete(photo.id);
    await loadToday({ silent: true });
  } catch (e) {
    btn.disabled = false;
    btn.textContent = 'Print photo';
    setStatus(String(e.message || e));
  } finally { state.pendingPrints.delete(photo.id); }
}

async function makeMagnet(photo, button) {
  const pin = el.pin.value.trim();
  if (!pin) { setStatus('Enter your operator PIN to create a magnet.'); el.pin.focus(); return; }
  button.disabled = true;
  button.textContent = 'Creating magnet…';
  try {
    const response = await fetch(`/api/tablet/photos/${encodeURIComponent(photo.id)}/magnet`, {
      method:'POST', headers:{'X-Admin-Pin':pin}, signal:AbortSignal.timeout(60000),
    });
    const result = await response.json();
    if (!response.ok || !result.ok) throw Error(result.error || 'Could not create magnet');
    const dialog = document.getElementById('tbMagnetDialog');
    dialog.querySelector('.tb-magnet-image').src = result.photo.url;
    const print = dialog.querySelector('.tb-print'), job = dialog.querySelector('.tb-job');
    print.disabled = false; print.textContent = 'Print magnet'; job.hidden = true;
    print.onclick = () => void sendPrint(result.photo, print, job);
    dialog.querySelector('.tb-close').onclick = () => dialog.close();
    attachPhotoSharing(dialog, result.photo, true, setStatus);
    dialog.showModal();
  } catch(error) { setStatus(error.message || 'Could not create magnet'); }
  finally { button.disabled = false; button.textContent = 'Create magnet'; }
}

async function loadToday({ silent = false } = {}) {
  if(state.loading)return;state.loading=true;
  if (!silent) setStatus('', false);
  try {
    const r = await fetch(`/api/tablet/today?prefix=${encodeURIComponent(state.prefix)}`, {signal: AbortSignal.timeout(15000)});
    const j = await r.json();
    if (!r.ok || !j.ok) throw new Error(j.error || `HTTP ${r.status}`);
    state.slug = j.slug;
    const selectedFamily = state.photos.find(photo => photo.id === state.selectedId)?.familyKey;
    const previousFamilies = new Set(state.photos.map(photo => photo.familyKey || photo.id));
    const incoming = Array.isArray(j.photos) ? j.photos : [];
    const selectedReplacement = selectedFamily && incoming.find(photo => photo.familyKey === selectedFamily);
    if (selectedReplacement) state.selectedId = selectedReplacement.id;
    const arrived = incoming.find(photo => !previousFamilies.has(photo.familyKey || photo.id));
    // New captures and completed AI versions appear in the main preview.
    // Keep an in-flight print request stable until its submission completes.
    if (state.photos.length && arrived && !state.pendingPrints.size) {
      state.selectedId = arrived.id;
      state.page = 1;
    }
    state.photos = incoming;
    const selectedIndex=state.photos.findIndex(p=>p.id===state.selectedId);
    if(selectedIndex>=0)state.page=Math.floor(selectedIndex/PAGE_SIZE)+1;
    el.title.textContent = 'Today’s photos';
    el.sub.textContent = j.empty
      ? 'Photos appear automatically after each capture.'
      : `${state.photos.length} photo${state.photos.length === 1 ? '' : 's'} · ${state.photos.filter(p => p.processStatus === 'processing').length} processing`;
    document.title = `Tablet · ${j.slug || state.prefix}`;
    render();
    connectStream(j.streamPath);
  } catch (e) {
    setStatus(String(e.message || e));
  } finally {state.loading=false;}
}

function connectStream(streamPath) {
  if(state.streamPath===streamPath&&state.es)return;
  state.streamPath=streamPath;
  if (!streamPath) {state.es?.close();state.es=null;return;}
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
