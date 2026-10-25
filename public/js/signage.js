const video = document.querySelector('#video');
const status = document.querySelector('#status');
const layout = document.querySelector('#layout');
const campaign = document.querySelector('#campaign');
const start = document.querySelector('#start');
const params = new URLSearchParams(location.search);
let campaignNumber = /^[1-9][0-9]*$/.test(params.get('video') || '') ? params.get('video') : '';
if (![...campaign.options].some(option => option.value === campaignNumber)) campaign.add(new Option(`Video ${campaignNumber}`, campaignNumber));
campaign.value = campaignNumber;
layout.value = ['portrait', 'landscape'].includes(params.get('layout')) ? params.get('layout') : 'auto';
const screenShape = matchMedia('(orientation: portrait)');
let currentUrl, idleTimer, wakeLock, requestId = 0, activeController;

function openCache() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('moments-signage', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('videos');
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
async function cache(mode, key, value) {
  const db = await openCache();
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction('videos', mode);
      const store = tx.objectStore('videos');
      const request = mode === 'readonly' ? store.get(key) : store.put(value, key);
      tx.oncomplete = () => resolve(request.result);
      tx.onerror = tx.onabort = () => reject(tx.error || Error('Cache unavailable'));
    });
  } finally { db.close(); }
}
function showControls() {
  document.body.classList.remove('idle');
  clearTimeout(idleTimer);
  idleTimer = setTimeout(() => {
    if (!document.querySelector('#tools').contains(document.activeElement)) document.body.classList.add('idle');
  }, 4000);
}
async function keepAwake() {
  if (document.visibilityState !== 'visible' || wakeLock) return;
  try {
    wakeLock = await navigator.wakeLock?.request('screen');
    wakeLock?.addEventListener('release', () => { wakeLock = null; });
  } catch { /* The display can still play when wake locks are unavailable. */ }
}
async function play() {
  try { await video.play(); start.hidden = true; await keepAwake(); }
  catch { start.hidden = false; status.textContent = 'Ready — tap to start playback.'; }
}
async function download(url, signal, id) {
  const response = await fetch(url, { signal });
  if (!response.ok) throw Error('Video download failed');
  const total = Number(response.headers.get('content-length'));
  const reader = response.body.getReader();
  const chunks = []; let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value); size += value.byteLength;
    if (id === requestId) status.textContent = `Saving video for looping… ${total ? Math.round(size / total * 100) + '%' : Math.round(size / 1048576) + ' MB'}`;
  }
  if (!size || (total && size !== total)) throw Error('Incomplete video download');
  return new Blob(chunks, { type: 'video/mp4' });
}
async function load() {
  const id = ++requestId;
  activeController?.abort();
  activeController = new AbortController();
  const signal = activeController.signal;
  const manifestUrl = `/assets/signage/${campaignNumber ? 'video' + campaignNumber : 'manifest'}.json`;
  const orientation = campaignNumber === '3' ? 'portrait' : layout.value === 'auto' ? (screenShape.matches ? 'portrait' : 'landscape') : layout.value;
  layout.disabled = campaignNumber === '3';
  if (campaignNumber === '3') layout.value = 'portrait';
  layout.title = campaignNumber === '3' ? 'Video 3 is portrait only' : '';
  const cacheKey = campaignNumber ? `video${campaignNumber}:${orientation}` : orientation;
  status.textContent = `Loading ${orientation} signage…`;
  let previous;
  try { previous = await cache('readonly', cacheKey); } catch { /* Memory playback works without persistent storage. */ }
  try {
    let asset;
    try {
      const response = await fetch(manifestUrl, { cache: 'no-store', signal });
      if (!response.ok) throw Error('No signage published');
      asset = (await response.json())[orientation];
      if (!asset?.version || !asset?.url) throw Error('Missing signage layout');
      const url = new URL(asset.url, location.origin);
      if (url.origin !== location.origin || !url.pathname.startsWith('/assets/signage/')) throw Error('Invalid signage asset');
    } catch (error) {
      if (signal.aborted || !previous) throw error;
      asset = previous;
    }
    let blob = previous?.version === asset.version ? previous.blob : null;
    let persistent = !!blob;
    if (!blob) {
      try { blob = await download(asset.url, signal, id); }
      catch (error) {
        if (signal.aborted || !previous) throw error;
        blob = previous.blob; asset = previous; persistent = true;
      }
      if (!persistent) {
        try { await cache('readwrite', cacheKey, { ...asset, blob }); persistent = true; }
        catch { /* Quota/private browsing: retain the complete blob in memory. */ }
      }
    }
    if (id !== requestId) return;
    const oldUrl = currentUrl;
    currentUrl = URL.createObjectURL(blob);
    video.src = currentUrl;
    if (oldUrl) URL.revokeObjectURL(oldUrl);
    video.dataset.layout = orientation;
    video.dataset.version = asset.version;
    video.dataset.campaign = campaignNumber;
    status.textContent = `${asset.title ? asset.title + ' · ' : ''}${orientation === 'portrait' ? 'Portrait' : 'Landscape'} · ${persistent ? 'Saved on this device' : 'Loaded in memory'} · Continuous loop`;
    await play();
  } catch (error) {
    if (id !== requestId || signal.aborted) return;
    status.textContent = currentUrl ? 'Update unavailable. Current video continues playing.' : 'Signage unavailable. Check the connection and try again.';
    showControls();
  }
}
video.addEventListener('playing', () => { document.body.classList.add('playing'); showControls(); });
video.addEventListener('error', () => { status.textContent = 'Unable to play this video. Try checking for an update.'; document.body.classList.remove('playing'); });
start.addEventListener('click', play);
document.querySelector('#reload').addEventListener('click', load);
document.querySelector('#fullscreen').addEventListener('click', async () => {
  try { await document.documentElement.requestFullscreen(); await keepAwake(); }
  catch { status.textContent = 'Use your browser’s full-screen mode on this device.'; }
  document.activeElement?.blur(); showControls();
});
layout.addEventListener('change', () => {
  params.set('layout', layout.value); history.replaceState(null, '', `${location.pathname}?${params}`);
  layout.blur(); load();
});
campaign.addEventListener('change', () => {
  campaignNumber = campaign.value;
  if (campaignNumber) params.set('video', campaignNumber); else params.delete('video');
  history.replaceState(null, '', `${location.pathname}?${params}`);
  campaign.blur(); load();
});
screenShape.addEventListener('change', () => { if (layout.value === 'auto') load(); });
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') keepAwake(); });
for (const event of ['pointermove', 'pointerdown', 'keydown']) document.addEventListener(event, showControls);
load();
