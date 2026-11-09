import { adminDashboard } from './admin.js';
import { applyCapabilities, countdown } from './features.js';
const app = document.querySelector('#app');
const nav = document.querySelector('#nav');
const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
let user, stream, refreshTimer, slideTimer, noticeTimer;
let capabilities = {}, clearCountdown = () => {}, capabilityTimer;
const parts = location.pathname.split('/').filter(Boolean);
const slug = parts[1];
document.body.dataset.screen = parts[0] === 'e' ? 'guest' : parts[0] === 'host' ? 'studio' : 'home';
const api = async (url, options = {}) => {
  const response = await fetch(`/api${url}`, { ...options, headers: { ...(options.body && !(options.body instanceof FormData) ? { 'Content-Type': 'application/json' } : {}), ...options.headers } });
  const body = await response.json();
  if (!response.ok) throw new Error(body.error || 'Request failed');
  return body;
};
const send = (url, body = {}, method = 'POST', headers) => api(url, { method, body: JSON.stringify(body), headers });
function notice(message, error = false) {
  const n = document.querySelector('#notice'); n.textContent = message; n.className = `visible ${error ? 'error' : ''}`;
  clearTimeout(noticeTimer); noticeTimer = setTimeout(() => { n.className = ''; }, 7000);
}
function action(selector, callback) {
  document.querySelectorAll(selector).forEach(el => el.addEventListener('click', async event => {
    event.preventDefault(); el.disabled = true;
    try { await callback(el, event); } catch (err) { notice(err.message, true); } finally { el.disabled = false; }
  }));
}
function form(selector, callback) {
  document.querySelector(selector)?.addEventListener('submit', async event => {
    event.preventDefault(); const button = event.target.querySelector('[type=submit]'); if (button) button.disabled = true;
    try { await callback(Object.fromEntries(new FormData(event.target)), event.target); } catch (err) { notice(err.message, true); } finally { if (button) button.disabled = false; }
  });
}
function navigation() {
  if (user?.role === 'admin') {
    nav.innerHTML = '<a href="/admin">Admin dashboard</a><button class="secondary small" id="logout">Sign out</button>';
    action('#logout', async () => { await send('/admin/auth/logout'); location.href = '/admin'; }); return;
  }
  nav.innerHTML = user ? `<a href="/">My events</a><span>${escape(user.name)}</span><button class="secondary small" id="logout">Sign out</button>` : '<span>Every perspective, together.</span>';
  action('#logout', async () => { await send('/auth/logout'); location.href = '/'; });
}
async function home() {
  if (user?.role === 'admin') return admin();
  if (!user) {
    app.innerHTML = `<section class="hero"><div><p class="eyebrow">EVERY PERSPECTIVE, TOGETHER</p><h1>Your people.<br>Your moments.</h1><p>One shared gallery. All the little moments you might have missed.<br>Guests scan, snap and share — right from their phones.</p><div class="card"><h3>Welcome, event owner.</h3><p class="muted">Use the invitation from your Moments administrator, or request a fresh sign-in link below.</p><form id="login"><label>Email address<input type="email" name="email" autocomplete="email" required placeholder="you@example.com"></label><button type="submit">Send me an access link ↗</button></form></div><p class="muted">Joining an event? Open the link or scan the QR shared by your host.</p></div><div class="hero-art" aria-hidden="true"><div class="rings"></div><small>COLLECT THE UNPOSED.</small></div></section>`;
    form('#login', async b => notice((await send('/auth/request', b)).message)); return;
  }
  const events = await api('/events');
  app.innerHTML = `<div class="toolbar"><div><p class="eyebrow">YOUR MOMENTS, COLLECTED</p><h1>Your events.</h1></div><button id="new-event">＋ Create an event</button></div><div class="grid">${events.map(e => `<a class="card" href="/host/${e.slug}"><span class="pill">${escape(e.status)}</span><h2>${escape(e.title)}</h2><div class="stats"><div class="stat">${e.photo_count}<span>PHOTOS</span></div><div class="stat">${e.guest_count}<span>GUESTS</span></div></div><p class="muted">Manage event ↗</p></a>`).join('') || '<div class="empty">Your next good memory starts here. Create your first event.</div>'}</div><section id="create" class="card inline-create" hidden><h2>Create an event</h2><form id="create-form"><label>Event name<input name="title" required maxlength="120" placeholder="Emma & James · Wedding weekend"></label><div class="actions"><button type="submit">Create event</button><button id="cancel-create" class="secondary" type="button">Cancel</button></div></form></section>`;
  action('#new-event', () => { document.querySelector('#create').hidden = false; document.querySelector('#create [name=title]').focus(); });
  action('#cancel-create', () => { document.querySelector('#create').hidden = true; });
  form('#create-form', async b => { const e = await send('/events', b); location.href = `/host/${e.slug}`; });
}
function datetime(ms) { if (!ms) return ''; const date = new Date(ms); return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16); }
function fields(e) {
  return `<label>Event name<input name="title" required maxlength="120" value="${escape(e.title)}"></label><label>Welcome message<textarea name="description" maxlength="1500">${escape(e.description)}</textarea></label><div class="split"><label>Photos per guest<input type="number" name="shot_limit" min="1" max="1000" value="${e.shot_limit}" required></label><label>Guest capacity<input type="number" name="guest_limit" min="1" max="10000" value="${e.guest_limit}" required></label></div><label>Gallery reveal time<input type="datetime-local" name="reveal" value="${datetime(e.reveal)}"><span class="muted">Leave blank for immediate reveal. Times are local to your device.</span></label><label>Guest visibility<select name="visibility"><option value="all" ${e.visibility === 'all' ? 'selected' : ''}>Everyone's approved photos</option><option value="own" ${e.visibility === 'own' ? 'selected' : ''}>Only their own approved photos</option></select></label><label>Photo caption / brand<input name="overlay" maxlength="80" value="${escape(e.overlay)}" placeholder="A day to remember"></label><label class="check"><input type="checkbox" name="moderation" value="1" ${e.moderation ? 'checked' : ''}>Approve new photos before guests see them</label><label>Event status<select name="status">${['draft','published','closed'].map(v => `<option ${e.status === v ? 'selected' : ''}>${v}</option>`).join('')}</select></label><p class="muted">Draft: hidden from guests. Published: open for joining and uploads. Closed: gallery remains available; uploads stop.</p>`;
}
async function host() {
  if (!user) return home();
  const e = await api(`/events/${slug}`);
  capabilities = e.features;
  if (parts[2] === 'print') {
    app.innerHTML = `<div class="print-card"><p class="eyebrow">CAPTURE YOUR POINT OF VIEW</p><h1>${escape(e.title)}</h1><p>Scan. Snap. Share the moment.</p><img class="qr" src="/api/events/${slug}/qr" alt="Scan to join ${escape(e.title)}"><p>No app download needed.</p><p class="share-url">${escape(e.url)}</p><button class="no-print" id="print">Print invitation</button></div>`;
    action('#print', () => window.print()); return;
  }
  if (parts[2] === 'slideshow') return slideshow(e);
  app.innerHTML = `<div class="toolbar"><div><p class="eyebrow">EVENT STUDIO</p><h2>${escape(e.title)}</h2></div><div class="actions"><a class="button secondary" href="${e.url}" target="_blank" rel="noopener">Guest view ↗</a><a class="button secondary" href="/host/${slug}/slideshow">Live slideshow</a></div></div><div class="workspace"><div class="settings card"><h3>Event settings</h3><form id="settings">${fields(e)}<button type="submit">Save event settings</button></form><hr><h3>Cover & branding</h3><p class="muted">Cover: JPEG/PNG. Overlay: transparent PNG. Branding applies to new photos.</p><form id="assets"><label>Asset type<select name="kind"><option value="cover">Event cover</option><option value="overlay">Photo graphic overlay</option></select></label><label>Image<input name="photo" type="file" accept="image/jpeg,image/png,image/webp" required></label><button type="submit" class="secondary">Upload image</button></form></div><section><div class="card"><span class="pill">${escape(e.status)}</span><div class="stats"><div class="stat">${e.photo_count}<span>PHOTOS</span></div><div class="stat">${e.guest_count} / ${e.guest_limit}<span>GUESTS</span></div></div><div class="split"><div><h3>Share with guests</h3><p class="share-url">${escape(e.url)}</p><div class="actions"><button id="copy" class="small">Copy link</button><button id="share" class="small secondary">Share</button><a href="/host/${slug}/print" class="button small secondary">Print QR</a></div></div><a href="/api/events/${slug}/qr" download="${slug}-qr.png"><img class="qr" src="/api/events/${slug}/qr" alt="Event invitation QR"></a></div></div><div class="toolbar"><h3>Event photos</h3><div class="actions"><select id="sort" aria-label="Sort photos"><option value="new">Newest first</option><option value="old">Oldest first</option><option value="favorites">Favorites</option><option value="pending">Awaiting approval</option></select><a class="button small secondary" href="/api/events/${slug}/download">Download all</a></div></div><div id="photos" class="gallery"></div></section></div>`;
  const schedule = document.createElement('label'); schedule.textContent = 'Close camera and uploads at';
  const deadline = document.createElement('input'); deadline.type = 'datetime-local'; deadline.name = 'closes_at'; deadline.value = datetime(e.closes_at); schedule.append(deadline);
  document.querySelector('#settings [name=reveal]').closest('label').before(schedule);
  const hostOnly = new Option('Only the event owner', 'host'); hostOnly.selected = e.visibility === 'host'; document.querySelector('#settings [name=visibility]').append(hostOnly);
  document.querySelector('#settings [name=status]').value = e.configured_status;
  const book = document.createElement('a'); book.className = 'button small secondary'; book.href = `/api/events/${slug}/photobook`; book.textContent = 'Photobook PDF'; document.querySelector('#sort').parentElement.append(book);
  const advanced = document.createElement('details'); advanced.className = 'advanced-settings';
  advanced.innerHTML = '<summary>Privacy, timing & limits</summary><div class="advanced-fields"></div>';
  const target = advanced.querySelector('div');
  for (const name of ['shot_limit', 'closes_at', 'reveal', 'visibility', 'overlay', 'moderation']) {
    const input = document.querySelector(`#settings [name=${name}]`);
    const field = name === 'shot_limit' ? input.closest('.split') : input.closest('label'); target.append(field);
  }
  document.querySelector('#settings [type=submit]').before(advanced);
  const branding = document.createElement('details'); branding.className = 'advanced-settings'; branding.innerHTML = '<summary>Cover & branding</summary>';
  const assetsForm = document.querySelector('#assets'); const assetsHelp = assetsForm.previousElementSibling; const assetsTitle = assetsHelp.previousElementSibling; const divider = assetsTitle.previousElementSibling;
  assetsForm.before(branding); branding.append(assetsHelp, assetsForm); assetsTitle.remove(); divider.remove();
  const danger = document.createElement('details'); danger.className = 'advanced-settings';
  danger.innerHTML = `<summary>Delete this event</summary><p>This permanently removes the event and its photos.</p><form id="delete-event-form"><label>Type the event name to confirm<input name="confirmation" required autocomplete="off" placeholder="${escape(e.title)}"></label><button type="submit" class="danger">Delete event permanently</button></form>`;
  document.querySelector('.settings').append(danger);
  form('#delete-event-form', async b => { if (b.confirmation !== e.title) throw new Error('Enter the event name exactly to confirm deletion.'); await send(`/events/${slug}`, {}, 'DELETE'); location.href = user?.role === 'admin' ? '/admin' : '/'; });
  const shareCard = document.querySelector('.workspace > section > .card');
  document.querySelector('.workspace').before(shareCard); shareCard.classList.add('event-share');
  const status = document.createElement('p'); status.className = 'event-status'; status.textContent = e.status === 'draft' ? 'Draft — set status to Published below before sharing.' : e.status === 'closed' ? 'Uploads are closed. Guests who joined can still view their gallery.' : 'Ready to share — guests can join and upload photos.'; shareCard.prepend(status);
  form('#settings', async b => { for (const name of ['reveal', 'closes_at']) if (name in b) b[name] = b[name] ? new Date(b[name]).getTime() : 0; b.moderation = b.moderation ? 1 : 0; const updated = await send(`/events/${slug}`, b, 'PATCH'); document.querySelector('.event-status').textContent = updated.status === 'published' ? 'Ready to share — guests can join and upload photos.' : updated.status === 'draft' ? 'Draft — publish before sharing.' : 'Uploads are closed. The gallery remains available.'; document.querySelector('.event-share .pill').textContent = updated.status; notice('Event settings saved'); });
  form('#assets', async (_b, f) => { await api(`/events/${slug}/assets/${f.kind.value}`, { method: 'POST', body: new FormData(f) }); notice('Event image saved'); });
  action('#copy', async () => { await navigator.clipboard.writeText(e.url); notice('Event link copied'); });
  action('#share', async () => { if (navigator.share) await navigator.share({ title: e.title, url: e.url }); else { await navigator.clipboard.writeText(e.url); notice('Event link copied'); } });
  document.querySelector('#sort').addEventListener('change', () => loadPhotos(true).catch(err => notice(err.message, true)));
  await loadPhotos(true); refreshTimer = setInterval(() => { if (!document.hidden) loadPhotos(true).catch(() => {}); }, 8000);
  applyCapabilities(capabilities);
}
async function loadPhotos(isHost = false) {
  let photos = await api(`/guest/${slug}/photos`);
  const sort = document.querySelector('#sort')?.value;
  if (sort === 'old') photos.reverse();
  if (sort === 'favorites') photos = photos.filter(p => p.favorite);
  if (sort === 'pending') photos = photos.filter(p => !p.approved);
  const target = document.querySelector('#photos'); if (!target) return;
  const signature = JSON.stringify(photos);
  if (target.dataset.signature === signature) return;
  target.dataset.signature = signature;
  target.innerHTML = photos.map(p => `<figure class="photo"><a href="${p.url}" data-preview="${p.url}"><img loading="lazy" src="${p.url}" alt="Photo shared by ${escape(p.guest_name)}"></a><figcaption><span>${escape(p.guest_name)}${!p.approved ? ' · Awaiting approval' : ''}${p.favorite ? ' · ★' : ''}</span><div class="actions"><a class="button small secondary" href="${p.url}?download=1">Save</a>${isHost ? `<button class="small secondary" data-favorite="${p.id}" data-value="${p.favorite ? 0 : 1}">${p.favorite ? 'Unfavorite' : 'Favorite'}</button><button class="small secondary" data-approve="${p.id}" data-value="${p.approved ? 0 : 1}">${p.approved ? 'Hide' : 'Approve'}</button><button class="small danger" data-delete="${p.id}">Delete</button>` : ''}</div></figcaption></figure>`).join('') || (isHost ? '<div class="empty">No photos yet. Share the event link or QR code to get started.</div>' : '<div class="empty">No shared photos yet. Yours could be the first.</div>');
  action('[data-favorite]', async el => { await send(`/events/${slug}/photos/${el.dataset.favorite}`, { favorite: Number(el.dataset.value) }, 'PATCH'); await loadPhotos(true); });
  action('[data-approve]', async el => { await send(`/events/${slug}/photos/${el.dataset.approve}`, { approved: Number(el.dataset.value) }, 'PATCH'); await loadPhotos(true); });
  action('[data-delete]', el => {
    if (el.parentElement.querySelector('.delete-confirm')) return;
    const box = document.createElement('div'); box.className = 'delete-confirm';
    box.innerHTML = '<p>Delete this photo permanently?</p><button class="danger small" type="button">Delete photo</button><button class="secondary small" type="button">Keep photo</button>';
    el.parentElement.append(box);
    box.lastElementChild.onclick = () => box.remove();
    box.querySelector('button').onclick = async () => {
      box.querySelector('button').disabled = true;
      try { await send(`/events/${slug}/photos/${el.dataset.delete}`, {}, 'DELETE'); await loadPhotos(true); }
      catch (err) { notice(err.message, true); box.querySelector('button').disabled = false; }
    };
  });
  action('[data-preview]', el => {
    const d = document.createElement('dialog'); d.innerHTML = `<img src="${el.dataset.preview}" alt="Event photo"><div><button class="secondary">Close</button></div>`;
    document.body.append(d); d.querySelector('button').onclick = () => d.close(); d.addEventListener('close', () => d.remove()); d.showModal();
  });
  applyCapabilities(capabilities);
}
let guestState, cameraFacing = 'environment', cameraAttempt = 0, uploadBusy = false, pendingUploads = [];
const canCapture = () => guestState?.joined && guestState.uploads_enabled && guestState.remaining > 0;
function cameraControls() {
  const active = stream?.getVideoTracks().some(t => t.readyState === 'live');
  const video = document.querySelector('#camera-preview');
  if (video) video.hidden = !active;
  const placeholder = document.querySelector('#camera-placeholder'); if (placeholder) placeholder.hidden = Boolean(active);
  const shutter = document.querySelector('#shutter'); if (shutter) shutter.disabled = !active || !canCapture() || uploadBusy || pendingUploads.length > 0;
  const toggle = document.querySelector('#settings-camera'); if (toggle) { toggle.textContent = active ? 'Turn camera off' : 'Turn camera on'; toggle.disabled = !canCapture() || uploadBusy; }
  const upload = document.querySelector('#upload'); if (upload) upload.disabled = !canCapture() || uploadBusy || pendingUploads.length > 0;
  document.querySelectorAll('#camera, #flip-camera, #quick-flip').forEach(el => { el.disabled = !canCapture() || uploadBusy; });
}
async function guestView() {
  if (uploadBusy) return;
  const data = await api(`/guest/${slug}`); const e = data.event;
  if (uploadBusy) return;
  const galleryOpen = document.querySelector('#gallery-dialog')?.open;
  const settingsOpen = document.querySelector('#camera-settings')?.open;
  guestState = data; clearCountdown(); capabilities = data.features;
  if (!capabilities.webApp) { stopCamera(); location.reload(); return; }
  if (!canCapture()) stopCamera();
  const stateMessage = e.status === 'closed' ? 'The camera is closed. Your event gallery is still here.' : !data.uploads_enabled ? 'Photo sharing is paused by your host.' : data.remaining === 0 ? 'All your shots are shared. Enjoy the gallery.' : 'Enable your camera to start capturing.';
  app.innerHTML = `<section class="camera-shell" aria-label="${escape(e.title)} camera">
    <div class="viewfinder"><video id="camera-preview" autoplay playsinline muted aria-label="Camera preview" hidden></video>
    <div id="camera-placeholder"><div class="camera-mark" aria-hidden="true"></div><h1>${escape(e.title)}</h1>
    ${!data.joined && data.uploads_enabled ? `<p>Join once. Capture the moments.</p><form id="join"><label>Your name<input name="name" maxlength="60" required autocomplete="given-name" placeholder="Enter your name"></label><p class="camera-consent">Your photos are shared with ${e.visibility === 'all' ? 'the host and other guests' : 'the host'}. Only share photos you have permission to upload.</p><button type="submit">Join event</button></form>` : `<p id="camera-message" role="status">${escape(stateMessage)}</p>${canCapture() ? '<button id="camera">Enable camera</button><p class="camera-consent">Allow camera access when your browser asks.</p>' : ''}`}
    </div></div>
    <button id="quick-flip" class="camera-settings-trigger camera-flip-trigger" aria-label="Switch front or back camera" ${canCapture() ? '' : 'disabled'}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 8h3l2-3h6l2 3h3v12H4z"/><path d="M9 12a4 4 0 0 1 7 2m0-3v3h-3m2 3a4 4 0 0 1-7-2m0 3v-3h3"/></svg></button><button id="open-camera-settings" class="camera-settings-trigger" aria-label="Camera settings"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 3h6l1 3 3 1 2 5-2 5-3 1-1 3H9l-1-3-3-1-2-5 2-5 3-1z"/><circle cx="12" cy="12" r="3"/></svg></button>
    <div class="camera-bottom"><p id="upload-status" role="status"></p><div id="upload-recovery"></div><div class="camera-event-name">${escape(e.title)}</div><div class="camera-mode" aria-hidden="true">PHOTO</div><div class="capture-controls"><div class="shot-count"><strong>${data.remaining}</strong><span>of ${e.shot_limit} shots left</span></div><button id="shutter" aria-label="Take and share photo" disabled><span></span></button><button id="open-gallery" class="gallery-trigger"><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="9" cy="9" r="2"/><path d="m4 19 5-5 3 3 4-6 5 8"/></svg>Gallery</button></div><p class="capture-hint">${canCapture() ? 'Tap the shutter to share a photo' : data.joined ? 'Your moments, together' : 'Join to start taking photos'}</p></div>
    </section>
    <dialog id="gallery-dialog" class="camera-sheet" aria-labelledby="gallery-title"><div class="sheet-toolbar"><h2 id="gallery-title">Event gallery</h2><button type="button" data-close="gallery-dialog" aria-label="Close gallery">Close</button></div><div class="guest-head"><p>${escape(e.title)}</p></div><div id="gallery-state"></div><div id="photos" class="gallery"></div></dialog>
    <dialog id="camera-settings" class="camera-sheet" aria-labelledby="camera-settings-title"><div class="sheet-toolbar"><h2 id="camera-settings-title">Camera settings</h2><button type="button" data-close="camera-settings" aria-label="Close camera settings">Close</button></div><p>${escape(e.title)}</p>${e.description ? `<p class="muted">${escape(e.description)}</p>` : ''}<div class="camera-options"><button id="settings-camera" ${canCapture() ? '' : 'disabled'}>Turn camera on</button><button id="flip-camera" class="secondary" ${canCapture() ? '' : 'disabled'}>Switch front / back camera</button><label class="button secondary file-button">Upload from phone<input id="upload" type="file" accept="image/*" multiple ${canCapture() ? '' : 'disabled'}></label></div><p class="muted">${e.moderation ? 'Your host reviews photos before they appear in the gallery.' : 'Photos are shared immediately when you take or upload them.'} Photos keep their natural colour.</p>${e.closes_at ? `<p class="muted">Camera closes ${escape(new Date(e.closes_at).toLocaleString())}.</p>` : ''}<p class="muted">Camera permission is controlled by your browser. If access was blocked, enable it in your browser’s site settings.</p></dialog>`;
  if (stream) { const video = document.querySelector('#camera-preview'); video.srcObject = stream; await video.play().catch(() => stopCamera()); }
  cameraControls();
  const show = id => { document.querySelectorAll('.camera-sheet[open]').forEach(d => d.close()); document.querySelector(`#${id}`).showModal(); };
  action('#open-gallery', async () => { show('gallery-dialog'); if (data.joined && data.revealed && e.visibility !== 'host') await loadPhotos(); });
  action('#open-camera-settings', () => show('camera-settings'));
  action('[data-close]', el => document.getElementById(el.dataset.close).close());
  form('#join', async b => { await send(`/guest/${slug}/join`, b); await guestView(); });
  renderUploadRecovery();
  action('#camera', openCamera);
  action('#settings-camera', async () => { if (stream) stopCamera(); else { document.querySelector('#camera-settings').close(); await openCamera(); } });
  action('#quick-flip', async () => { cameraFacing = cameraFacing === 'environment' ? 'user' : 'environment'; await openCamera(); });
  action('#flip-camera', async () => { cameraFacing = cameraFacing === 'environment' ? 'user' : 'environment'; document.querySelector('#camera-settings').close(); await openCamera(); });
  action('#shutter', async () => {
    const video = document.querySelector('#camera-preview');
    if (!canCapture() || uploadBusy || pendingUploads.length || !video?.videoWidth || !stream) return;
    // Crop the capture to exactly the same centre crop shown in the viewfinder.
    const ratio = video.clientWidth / video.clientHeight;
    const sw = Math.min(video.videoWidth, video.videoHeight * ratio);
    const sh = Math.min(video.videoHeight, video.videoWidth / ratio);
    const canvas = document.createElement('canvas'); canvas.width = Math.round(sw); canvas.height = Math.round(sh);
    canvas.getContext('2d').drawImage(video, (video.videoWidth-sw)/2, (video.videoHeight-sh)/2, sw, sh, 0, 0, canvas.width, canvas.height);
    uploadBusy = true; cameraControls();
    try { const blob = await new Promise(r => canvas.toBlob(r, 'image/jpeg', .92)); if (!blob) throw new Error('Could not take a photo. Please try again.'); uploadBusy = false; await uploadFiles([blob]); }
    finally { uploadBusy = false; cameraControls(); }
  });
  document.querySelector('#upload').addEventListener('change', event => { document.querySelector('#camera-settings').close(); void uploadFiles([...event.target.files]); });
  const state = document.querySelector('#gallery-state');
  if (e.visibility === 'host') state.textContent = 'This is a private collection for your host. Thank you for sharing your perspective.';
  else if (!data.joined) state.textContent = 'Join this event to see its gallery. If the event has closed, use the device you joined with.';
  else if (!data.revealed) state.textContent = `Photos will be visible on ${new Date(e.reveal).toLocaleString()}.`;
  else await loadPhotos();
  const revealKey = `moments-reveal-${slug}-${e.reveal}`;
  if (!data.revealed && e.visibility !== 'host') sessionStorage.setItem(revealKey, 'waiting');
  if (data.revealed && e.visibility !== 'host' && capabilities.revealExperience && sessionStorage.getItem(revealKey) === 'waiting') {
    sessionStorage.setItem(revealKey, 'revealed'); state.className = 'reveal-banner'; state.textContent = 'The wait is over. Your moments are ready.'; notice('Your event gallery is ready.');
  }
  clearCountdown = countdown(data, guestView);
  if (galleryOpen) show('gallery-dialog'); else if (settingsOpen) show('camera-settings');
  clearInterval(refreshTimer); refreshTimer = setInterval(async () => {
    if (document.hidden || uploadBusy) return;
    try {
      const next = await api(`/guest/${slug}`);
      if (next.remaining !== data.remaining || next.revealed !== data.revealed || JSON.stringify(next.features) !== JSON.stringify(data.features) || JSON.stringify(next.event) !== JSON.stringify(e)) await guestView();
      else if (document.querySelector('#gallery-dialog')?.open && data.joined && data.revealed && e.visibility !== 'host') await loadPhotos();
    } catch { /* Keep the camera usable through a temporary connection loss. */ }
  }, 8000);
}
function renderUploadRecovery() {
  const box = document.querySelector('#upload-recovery'); if (!box) return;
  box.innerHTML = pendingUploads.length ? `<div class="upload-retry"><span>${pendingUploads.length} photo${pendingUploads.length === 1 ? '' : 's'} waiting to send. Keep this page open.</span><button id="retry-upload" ${uploadBusy || !guestState?.uploads_enabled ? 'disabled' : ''}>Retry</button><button id="discard-upload" class="secondary" ${uploadBusy ? 'disabled' : ''}>Discard</button></div>` : '';
  action('#retry-upload', () => uploadFiles([], true));
  action('#discard-upload', () => { if (uploadBusy) return; pendingUploads = []; renderUploadRecovery(); cameraControls(); });
}
async function uploadFiles(files, retry = false) {
  if (uploadBusy || (retry ? !pendingUploads.length || !guestState?.uploads_enabled : !files.length || !canCapture() || pendingUploads.length)) return;
  uploadBusy = true; cameraControls(); renderUploadRecovery(); let completed = 0;
  try {
    if (!retry && files.length > guestState.remaining) throw new Error(`Choose up to ${guestState.remaining} photos for your remaining shots.`);
    if (!retry) pendingUploads = files.map(file => ({ file, requestId: crypto.randomUUID() }));
    const total = pendingUploads.length;
    while (pendingUploads.length) {
      const { file, requestId } = pendingUploads[0];
      const status = document.querySelector('#upload-status'); if (status) status.textContent = `Sharing ${completed + 1} of ${total}…`;
      const body = new FormData(); body.append('photo', file, file.name || 'capture.jpg'); body.append('request_id', requestId);
      await api(`/guest/${slug}/photos`, { method: 'POST', body }); completed++; pendingUploads.shift();
    }
    notice(`${completed} ${completed === 1 ? 'photo' : 'photos'} shared${guestState.event.moderation ? ' — waiting for host approval.' : '.'}`);
  } catch (err) { notice(`${completed ? completed + ' shared. ' : ''}${err.message} ${pendingUploads.length ? 'Your photo is kept here for retry. Keep this page open.' : ''}`, true); }
  finally { uploadBusy = false; renderUploadRecovery(); try { await guestView(); } catch { const status = document.querySelector('#upload-status'); if (status) status.textContent = 'Could not refresh. Check your connection.'; } cameraControls(); }
}
function stopCamera() {
  cameraAttempt++; stream?.getTracks().forEach(t => t.stop()); stream = null;
  const video = document.querySelector('#camera-preview'); if (video) { video.srcObject = null; video.hidden = true; }
  cameraControls();
}
async function openCamera() {
  stopCamera();
  if (!canCapture() || uploadBusy) return;
  const attempt = cameraAttempt;
  const message = document.querySelector('#camera-message'); if (message) message.textContent = 'Starting camera…';
  try {
    if (!navigator.mediaDevices?.getUserMedia) throw new Error('Camera access needs HTTPS. You can upload photos from Camera settings.');
    const media = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: cameraFacing }, width: { ideal: 1920 } }, audio: false });
    if (attempt !== cameraAttempt || document.hidden || !canCapture()) { media.getTracks().forEach(t => t.stop()); return; }
    stream = media;
    const video = document.querySelector('#camera-preview'); video.srcObject = stream; await video.play();
    if (attempt !== cameraAttempt) return;
    clearTimeout(noticeTimer); document.querySelector('#notice').className = '';
    if (message) message.textContent = 'Camera is off. Enable it to keep capturing.';
    cameraControls();
  } catch (err) {
    if (attempt !== cameraAttempt) return;
    stopCamera();
    const help = err.name === 'NotAllowedError' ? 'Camera access is blocked. Allow it in your browser’s site settings, or upload photos from Camera settings.' : err.name === 'NotFoundError' ? 'No camera found. Upload photos from Camera settings instead.' : err.message;
    if (message) message.textContent = help; notice(help, true);
  }
}
async function slideshow(e) {
  let photos = [], index = 0;
  app.innerHTML = `<div class="slideshow"><div class="actions"><button id="fullscreen" class="secondary">Fullscreen</button><a class="button" href="/host/${slug}">Exit</a></div><div id="slide"><h2>Waiting for the first moment…</h2></div><p>${escape(e.title)}</p></div>`;
  action('#fullscreen', () => document.documentElement.requestFullscreen());
  const refresh = async () => { photos = await api(`/events/${slug}/slideshow`); };
  const draw = () => { if (photos.length) { const p = photos[index++ % photos.length]; document.querySelector('#slide').innerHTML = `<img src="${p.url}" alt="Event slideshow photo">`; } };
  await refresh(); draw(); slideTimer = setInterval(draw, 5000); refreshTimer = setInterval(() => refresh().catch(err => { photos = []; document.querySelector('#slide').textContent = err.message; }), 8000);
}
async function admin() {
  return adminDashboard({ app, nav, api, send, form, action, notice, escape });
}
document.addEventListener('visibilitychange', () => { if (document.hidden) stopCamera(); });
window.addEventListener('hashchange', async () => {
  const access = new URLSearchParams(location.hash.slice(1)).get('access');
  if (!access) return;
  history.replaceState(null, '', location.pathname);
  try { await send('/auth/accept', { token: access }); location.reload(); }
  catch (err) { notice(err.message, true); }
});
window.addEventListener('pagehide', () => { stopCamera(); clearCountdown(); clearInterval(refreshTimer); clearInterval(slideTimer); clearInterval(capabilityTimer); });
try {
  capabilities = (await api('/config')).features;
  if (parts[0] !== 'admin' && parts[0] !== 'e') capabilityTimer = setInterval(async () => {
    try { capabilities = (await api('/config')).features; if (!capabilities.webApp && user?.role !== 'admin') location.reload(); else applyCapabilities(capabilities); } catch { /* Retry on the next refresh. */ }
  }, 8000);
  const access = new URLSearchParams(location.hash.slice(1)).get('access');
  if (access) { history.replaceState(null, '', location.pathname); await send('/auth/accept', { token: access }); notice('Welcome to Moments Live'); }
  try { user = await api('/me'); } catch { user = null; }
  navigation();
  if (parts[0] === 'admin') await admin(); else if (parts[0] === 'e') await guestView(); else if (parts[0] === 'host') await host(); else await home();
} catch (err) { app.innerHTML = `<section class="guest"><p class="eyebrow">MOMENTS LIVE</p><h1>Let’s try that again.</h1><p>${escape(err.message)}</p><a class="button" href="/">Return home</a></section>`; }
app.setAttribute('aria-busy', 'false');
