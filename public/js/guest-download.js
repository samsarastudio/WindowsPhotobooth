import {attachPhotoSharing} from './tablet-share.js?v=20261023';
const status = document.getElementById('guestStatus');
try {
  const id = decodeURIComponent(location.pathname.split('/').filter(Boolean)[1] || '');
  if (!id) throw Error('This photo link is incomplete. Please scan the QR again.');
  const response = await fetch('/api/share/' + encodeURIComponent(id), {signal:AbortSignal.timeout(20000)});
  const result = await response.json();
  const photo = result.photo;
  if (!response.ok || !photo?.url || photo.variant === 'magnet-source' || ['processing','failed'].includes(photo.processStatus)) throw Error('This photo is not available. Please ask the photo desk.');
  const image = document.querySelector('.guest-photo');
  image.src = photo.url;
  image.hidden = false;
  document.querySelector('.guest-actions').hidden = false;
  status.textContent = 'On iPhone or iPad, tap Share / Save to Photos, then choose Save Image.';
  attachPhotoSharing(document, photo, true, message => {status.textContent=message;});
} catch(error) {status.textContent=error.message || 'Could not load your photo. Please try again.';}
