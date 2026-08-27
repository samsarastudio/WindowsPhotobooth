function codeFromPath() {
  const parts = location.pathname.replace(/^\/+|\/+$/g, '').split('/');
  if (parts[0] === 'q' && parts[1]) return decodeURIComponent(parts[1]);
  return new URLSearchParams(location.search).get('code') || '';
}

const stateEl = document.getElementById('qState');
const eventEl = document.getElementById('qEvent');

function isAppleTouchDevice() {
  return (
    /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
  );
}

async function savePhotoToDevice(url, filename = 'inmoment-photo.jpg') {
  if (!url) return;
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const blob = await res.blob();
    const type = blob.type || 'image/jpeg';
    if (isAppleTouchDevice() && navigator.share && navigator.canShare) {
      try {
        const file = new File([blob], filename, { type });
        if (navigator.canShare({ files: [file] })) {
          await navigator.share({ files: [file], title: 'inmoment' });
          return;
        }
      } catch (e) {
        if (e?.name === 'AbortError') return;
      }
    }
    const obj = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = obj;
    a.download = filename;
    a.rel = 'noopener';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(obj), 1500);
  } catch (e) {
    console.warn('savePhotoToDevice failed', e);
    window.open(url, '_blank', 'noopener');
  }
}

function renderWaiting(data) {
  if (data.eventLabel) {
    eventEl.hidden = false;
    eventEl.textContent = data.eventLabel;
  }
  const album = data.linkedAlbum;
  const albumCta =
    album && !album.expired && album.galleryUrl
      ? `<a class="q-save" href="${escapeAttr(album.galleryUrl)}">Open ${escapeHtml(album.title || 'gallery')}</a>
         <p class="q-sub">Open your photo, then tap <strong>Link my card</strong>.</p>`
      : `<p class="q-sub">Come find the inmoment booth, then scan again.</p>`;
  stateEl.innerHTML = `
    <div class="q-empty-art" aria-hidden="true">◇</div>
    <p class="q-msg">${escapeHtml(data.message || 'Get your photo taken — it will appear here')}</p>
    ${albumCta}
  `;
}

function renderPhoto(data) {
  if (data.eventLabel) {
    eventEl.hidden = false;
    eventEl.textContent = data.eventLabel;
  }
  const url = data.photo?.url || '';
  const shareUrl = data.photo?.shareUrl || '';
  stateEl.innerHTML = `
    <div class="q-photo-wrap"><img src="${escapeAttr(url)}" alt="Your moment" /></div>
    <div class="q-actions">
      <button type="button" class="q-save" id="qSaveBtn">Save photo</button>
      ${
        shareUrl
          ? `<a class="q-save q-save-ghost" href="${escapeAttr(shareUrl)}">Open share page</a>`
          : ''
      }
    </div>
  `;
  document.getElementById('qSaveBtn')?.addEventListener('click', () => {
    void savePhotoToDevice(url, `inmoment-${data.serial || 'photo'}.jpg`);
  });
}

function renderSoftError(message) {
  stateEl.innerHTML = `
    <div class="q-empty-art" aria-hidden="true">·</div>
    <p class="q-msg">${escapeHtml(message)}</p>
    <p class="q-sub">Follow us for more moments.</p>
  `;
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function escapeAttr(s) {
  return escapeHtml(s).replace(/'/g, '&#39;');
}

async function main() {
  const code = codeFromPath();
  if (!code) {
    renderSoftError('Open a card QR to see your moment here.');
    return;
  }
  try {
    const res = await fetch(`/api/qr/preview/${encodeURIComponent(code)}`);
    const data = await res.json();
    if (data.status === 'linked' && data.photo?.url) renderPhoto(data);
    else if (data.status === 'waiting') renderWaiting(data);
    else renderSoftError(data.message || 'This card is not available.');
  } catch {
    renderSoftError('Could not load this card. Check your connection.');
  }
}

main();
