export const featureLabels = {
  webApp: ['Web app', 'Owner and guest browser pages. Admin and native APIs remain available.'],
  guestUploads: ['Guest participation', 'Allow new guests and photo uploads from web, iOS, App Clip and Android.'],
  scheduledClosing: ['Scheduled closing editor', 'Allow owners to set or change upload deadlines. Existing deadlines remain enforced.'],
  scheduledReveal: ['Scheduled reveal editor', 'Allow owners to set or change reveal times. Existing hidden photos stay hidden.'],
  hostOnlyGallery: ['Host-only gallery option', 'Allow choosing host-only visibility. Existing host-only galleries remain private.'],
  revealExperience: ['Countdown and reveal experience', 'Show countdowns and the gallery-opening announcement.'],
  branding: ['Covers and branding', 'Enable cover display and branding on new photos. Existing photo pixels are unchanged.'],
  filters: ['Photo filters', 'Enable photo styles for new uploads. Existing photos are unchanged.'],
  slideshow: ['Live slideshow', 'Enable the host slideshow page and feed.'],
  downloads: ['Download controls and ZIP export', 'Enable download buttons and ZIPs. Visible images can still be saved by the device.'],
  photobooks: ['Photobook PDFs', 'Enable printable PDF generation.']
};

export function applyCapabilities(flags) {
  const fields = { closes_at: 'scheduledClosing', reveal: 'scheduledReveal', style: 'filters', overlay: 'branding' };
  for (const [field, key] of Object.entries(fields)) {
    const input = document.querySelector(`#settings [name="${field}"]`);
    if (input) { input.disabled = flags[key] === false; input.title = input.disabled ? 'Disabled by administrator. Existing setting remains in effect.' : ''; }
  }
  const hostOption = document.querySelector('#settings [name=visibility] option[value=host]');
  if (hostOption) hostOption.disabled = flags.hostOnlyGallery === false && !hostOption.selected;
  const assets = document.querySelector('#assets'); if (assets) assets.hidden = flags.branding === false;
  for (const [key, selector] of Object.entries({ downloads: 'a[href*="?download="],a[href$="/download"]', photobooks: 'a[href$="/photobook"]', slideshow: 'a[href$="/slideshow"]' })) {
    document.querySelectorAll(selector).forEach(el => { el.hidden = flags[key] === false; });
  }
}

export function mountFeatureAdmin({ api, send, notice, form }) {
  const section = document.createElement('section'); section.className = 'guest feature-admin';
  section.innerHTML = '<div class="card"><h2>Feature controls</h2><p>Changes take effect immediately and survive server restarts.</p><form id="unlock-features"><label>Administrator key<input name="key" type="password" required autocomplete="off"></label><button type="submit">Load feature settings</button></form><div id="feature-controls"></div></div>';
  document.querySelector('#app').append(section);
  let key = '';
  form('#unlock-features', async (body, unlock) => {
    const values = await api('/admin/features', { headers: { 'X-Live-Admin-Key': body.key } });
    key = body.key; unlock.reset();
    const controls = section.querySelector('#feature-controls');
    controls.innerHTML = `<form id="features-form">${Object.entries(featureLabels).map(([name, [label, hint]]) => `<label class="feature-switch"><span class="check"><input type="checkbox" name="${name}" ${values[name] ? 'checked' : ''}>${label}</span><span class="muted">${hint}</span></label>`).join('')}<button type="submit">Save feature settings</button><button type="button" class="secondary" id="lock-features">Lock controls</button></form>`;
    form('#features-form', async (_body, f) => {
      const patch = Object.fromEntries(Object.keys(featureLabels).map(name => [name, f.elements[name].checked]));
      await send('/admin/features', patch, 'PATCH', { 'X-Live-Admin-Key': key }); notice('Feature settings saved');
    });
    controls.querySelector('#lock-features').onclick = () => { key = ''; controls.replaceChildren(); };
  });
}

export function countdown(data, refresh) {
  const section = document.querySelector('.guest-head');
  if (!section || data.features.revealExperience === false) return () => {};
  const e = data.event;
  const tick = document.createElement('div'); tick.className = 'countdown card'; section.after(tick);
  const started = performance.now();
  let refreshing = false;
  const update = () => {
    const serverNow = data.server_time + performance.now() - started;
    const closing = e.status === 'published' && e.closes_at > data.server_time;
    const revealing = !data.revealed && e.visibility !== 'host';
    if ((closing && e.closes_at <= serverNow) || (revealing && e.reveal <= serverNow)) {
      if (!refreshing) { refreshing = true; refresh().catch(() => { refreshing = false; }); }
    }
    const format = deadline => {
      const seconds = Math.max(0, Math.ceil((deadline - serverNow) / 1000));
      const days = Math.floor(seconds / 86400);
      return `${days ? days + 'd ' : ''}${String(Math.floor(seconds / 3600) % 24).padStart(2, '0')}:${String(Math.floor(seconds / 60) % 60).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
    };
    tick.replaceChildren();
    for (const [show, title, deadline] of [[closing, 'Camera closes in', e.closes_at], [revealing, 'Your moments reveal in', e.reveal]]) {
      if (!show) continue;
      const label = document.createElement('p'); label.textContent = title;
      const value = document.createElement('strong'); value.textContent = format(deadline);
      tick.append(label, value);
    }
    tick.hidden = !closing && !revealing;
  };
  update(); const timer = setInterval(update, 1000);
  return () => { clearInterval(timer); tick.remove(); };
}
