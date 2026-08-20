function codeFromPath() {
  const parts = location.pathname.replace(/^\/+|\/+$/g, '').split('/');
  if (parts[0] === 'q' && parts[1]) return decodeURIComponent(parts[1]);
  return new URLSearchParams(location.search).get('code') || '';
}

const stateEl = document.getElementById('qState');
const eventEl = document.getElementById('qEvent');

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
  stateEl.innerHTML = `
    <div class="q-photo-wrap"><img src="${escapeAttr(url)}" alt="Your moment" /></div>
    <a class="q-save" href="${escapeAttr(url)}" download>Save photo</a>
  `;
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
