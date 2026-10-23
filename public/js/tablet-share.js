// Prepare files before the tap: iOS requires native sharing during user activation.
const files = new Map();
function prepare(photo) {
  const url = new URL(photo.url, location.origin);
  if (url.origin !== location.origin) return Promise.reject(new Error('Invalid photo URL'));
  const key = `${photo.id}:${url.href}`;
  if (!files.has(key)) {
    const pending = fetch(url, {signal: AbortSignal.timeout(30000)}).then(async response => {
      if (!response.ok) throw new Error('Photo could not be downloaded');
      const blob = await response.blob();
      if (!blob.type.startsWith('image/')) throw new Error('Photo is not available yet');
      const ext = blob.type === 'image/jpeg' ? 'jpg' : blob.type === 'image/webp' ? 'webp' : 'png';
      return new File([blob], `Moments-${photo.id.replace(/[^a-z0-9_-]/gi, '')}.${ext}`, { type: blob.type });
    });
    files.set(key, pending);
    pending.catch(() => files.delete(key));
    while (files.size > 1) files.delete(files.keys().next().value);
  }
  return files.get(key);
}

function download(file) {
  const url = URL.createObjectURL(file);
  const link = document.createElement('a');
  link.href = url;
  link.download = file.name;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}

export function attachPhotoSharing(node, photo, ready, report) {
  const save = node.querySelector('.tb-download');
  const share = node.querySelector('.tb-share');
  save.disabled = share.disabled = true;
  share.hidden = !(navigator.share && navigator.canShare);
  if (!ready) return;
  save.textContent = 'Preparing download…';
  prepare(photo).then(file => {
    save.textContent = 'Download photo';
    save.disabled = false;
    save.onclick = () => download(file);
    if (!navigator.canShare?.({ files: [file] })) { share.hidden = true; return; }
    share.disabled = false;
    share.onclick = () => {
      // No await before this call: retain the iOS tap's transient activation.
      navigator.share({ files: [file] }).catch(error => {
        if (error.name !== 'AbortError') report('Sharing could not open. Use Download photo or try again.');
      });
    };
  }).catch(() => {
    save.textContent = 'Retry download';
    save.disabled = false;
    save.onclick = () => attachPhotoSharing(node, photo, ready, report);
    report('Photo download could not load. Tap Retry download.');
  });
}
