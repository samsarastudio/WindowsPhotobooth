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
async function guestView() {
  const data = await api(`/guest/${slug}`); const e = data.event;
  clearCountdown(); capabilities = data.features;
  if (!capabilities.webApp) { stopCamera(); location.reload(); return; }
  app.innerHTML = `<section class="guest"><div class="guest-head">${e.cover_url ? `<img class="cover" src="${e.cover_url}" alt="Event cover">` : ''}<p class="eyebrow">EVENT PHOTOS</p><h1>${escape(e.title)}</h1><p>${escape(e.description || 'Take a photo or upload from your phone to share it with this event.')}</p><span class="pill">${e.status === 'closed' ? 'Event gallery' : `${data.remaining} photos left for you`}</span></div>${!data.joined && e.status === 'published' ? `<div class="card"><h3>Join to share photos</h3><form id="join"><label>Your name<input name="name" maxlength="60" required autocomplete="given-name" placeholder="Enter your name"></label><p class="muted">Photos are shared with the event owner${e.visibility === 'all' ? ' and other event guests' : ''}. Only upload photos you have permission to share. Your place is remembered on this device.</p><button type="submit">Join event</button></form></div>` : ''}${data.joined && e.status === 'published' ? `<div class="capture-box" id="capture"><div class="toolbar"><div><h3>Add your photos</h3><p class="muted">${e.moderation ? 'Your host reviews photos before they appear.' : 'Photos are shared as soon as you upload.'}</p></div><div class="actions"><button id="camera" ${!data.remaining ? 'disabled' : ''}>Take a photo</button><label class="button secondary file-button">Upload photos<input id="upload" type="file" accept="image/*" multiple ${!data.remaining ? 'disabled' : ''}></label></div></div><div id="camera-area"></div><p id="upload-status" role="status"></p></div>` : ''}${!data.revealed ? `<div class="empty">Photos will be visible on ${escape(new Date(e.reveal).toLocaleString())}.</div>` : ''}${!data.joined && e.status === 'closed' ? '<p class="empty">This event has closed. Use the device you joined with to view its gallery.</p>' : ''}<div id="photos" class="gallery"></div></section>`;
  document.querySelector('.guest-dock')?.remove();
  if (data.joined) {
    const dock = document.createElement('nav'); dock.className = 'guest-dock'; dock.setAttribute('aria-label', 'Event navigation');
    dock.innerHTML = `${data.uploads_enabled && data.remaining > 0 ? '<a href="#capture"><span aria-hidden="true">＋</span>Add photos</a>' : ''}<a href="#photos"><span aria-hidden="true">▦</span>Gallery</a>`;
    const updateDock = () => dock.querySelectorAll('a').forEach(a => { if (a.hash === (location.hash || (data.uploads_enabled && data.remaining > 0 ? '#capture' : '#photos'))) a.setAttribute('aria-current', 'location'); else a.removeAttribute('aria-current'); });
    dock.querySelectorAll('a').forEach(a => a.addEventListener('click', () => { dock.querySelectorAll('a').forEach(link => link.removeAttribute('aria-current')); a.setAttribute('aria-current', 'location'); }));
    updateDock(); document.body.append(dock);
  }
  form('#join', async b => { await send(`/guest/${slug}/join`, b); await guestView(); });
  if (data.joined) {
    const heading = document.createElement('h2'); heading.className = 'gallery-title'; heading.textContent = e.visibility === 'host' ? 'Private collection' : 'Event gallery'; document.querySelector('#photos').before(heading);
  }
  if (data.joined && data.remaining === 0 && e.status === 'published') {
    const done = document.createElement('p'); done.className = 'empty'; done.textContent = 'You’ve shared all your photos. Thank you!'; document.querySelector('.capture-box')?.replaceWith(done);
  }
  if (!data.uploads_enabled) {
    document.querySelector('#join')?.remove(); document.querySelector('.capture-box')?.remove(); stopCamera();
    if (e.status === 'published') { const pause = document.createElement('p'); pause.className = 'empty'; pause.textContent = 'Photo submissions are paused by the administrator.'; document.querySelector('.guest-head').after(pause); }
  }
  if (e.visibility === 'host') {
    const privacy = document.createElement('p'); privacy.className = 'empty'; privacy.textContent = 'This is a private collection for your host. Thank you for sharing your perspective.';
    document.querySelector('#photos').append(privacy);
    document.querySelectorAll('.guest > .empty').forEach(el => { if (el.textContent.includes('Photos will be visible on')) el.remove(); });
  }
  if (!data.revealed && e.visibility !== 'host') { const waiting = document.querySelector('.guest > .empty'); if (waiting) document.querySelector('#photos').append(waiting); }
  const revealKey = `moments-reveal-${slug}-${e.reveal}`;
  if (!data.revealed && e.visibility !== 'host') sessionStorage.setItem(revealKey, 'waiting');
  if (data.revealed && e.visibility !== 'host' && capabilities.revealExperience && sessionStorage.getItem(revealKey) === 'waiting') {
    sessionStorage.setItem(revealKey, 'revealed');
    const banner = document.createElement('div'); banner.className = 'reveal-banner'; banner.setAttribute('role', 'status'); banner.textContent = 'The wait is over. Your moments are ready.'; document.querySelector('#photos').before(banner);
  }
  clearCountdown = countdown(data, async () => { stopCamera(); await guestView(); });
  action('#camera', openCamera);
  document.querySelector('#upload')?.addEventListener('change', event => uploadFiles([...event.target.files]));
  if (data.joined && data.revealed && e.visibility !== 'host') await loadPhotos();
  clearInterval(refreshTimer); refreshTimer = setInterval(async () => {
    if (document.hidden) return;
    try { const next = await api(`/guest/${slug}`); if (next.revealed !== data.revealed || JSON.stringify(next.features) !== JSON.stringify(data.features) || JSON.stringify(next.event) !== JSON.stringify(e)) { stopCamera(); await guestView(); } else if (data.joined && data.revealed && e.visibility !== 'host') await loadPhotos(); } catch { /* Preserve current view on temporary network loss. */ }
  }, 8000);
}
async function uploadFiles(files) {
  if (!files.length) return;
  document.querySelectorAll('#camera, #upload, #shutter').forEach(el => { el.disabled = true; });
  stopCamera(); let completed = 0;
  try {
    for (const file of files) {
      const status = document.querySelector('#upload-status'); if (status) status.textContent = `Sharing ${completed + 1} of ${files.length}… Keep this page open.`;
      const body = new FormData(); body.append('photo', file, file.name || 'capture.jpg'); body.append('request_id', crypto.randomUUID());
      await api(`/guest/${slug}/photos`, { method: 'POST', body }); completed++;
    }
    notice(`${completed} ${completed === 1 ? 'photo' : 'photos'} shared. Thank you!`);
  } catch (err) { notice(`${completed} shared. ${err.message} Your original photos remain on your device.`, true); }
  finally { await guestView(); }
}
function stopCamera() { stream?.getTracks().forEach(t => t.stop()); stream = null; document.querySelector('#camera-area')?.replaceChildren(); }
async function openCamera() {
  stopCamera();
  if (!navigator.mediaDevices?.getUserMedia) throw new Error('Camera access needs HTTPS. Use Upload photos to share from your phone.');
  stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment', width: { ideal: 1920 } }, audio: false });
  document.querySelector('#camera-area').innerHTML = '<video autoplay playsinline muted aria-label="Camera preview"></video><div class="camera-tools"><button id="shutter">Take & share photo</button><button id="stop-camera" class="secondary">Close camera</button></div>';
  const video = document.querySelector('video'); video.srcObject = stream; await video.play();
  action('#stop-camera', stopCamera);
  action('#shutter', async () => {
    if (!video.videoWidth) throw new Error('Camera is still starting');
    const canvas = document.createElement('canvas'); canvas.width = video.videoWidth; canvas.height = video.videoHeight; canvas.getContext('2d').drawImage(video, 0, 0);
    const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', .92));
    if (!blob) throw new Error('Could not capture photo'); await uploadFiles([blob]);
  });
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
