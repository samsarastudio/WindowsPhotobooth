import { wallControls } from './wall-controls.js';
import { featureLabels } from './features.js';
let activePanel;
export async function adminDashboard({ app, nav, api, send, form, action, notice, escape }) {
  app.classList.add('admin-dashboard');
  const state = await api('/admin/auth');
  const emailField = '<label>Email address<input type="email" name="email" required maxlength="254" autocomplete="username"></label>';
  const passwordField = '<label>Password<input type="password" name="password" required minlength="12" maxlength="256" autocomplete="new-password"><span class="muted">Use at least 12 characters.</span></label>';
  const keyField = '<label>Server setup key<input type="password" name="key" required autocomplete="off"><span class="muted">Use LIVE_ADMIN_KEY once to authorize setup or recovery.</span></label>';
  document.body.dataset.screen = state.admin ? 'admin' : 'login';
  if (!state.admin) {
    activePanel = undefined;
    nav.innerHTML = '<a href="/">Moments Live</a>';
    app.innerHTML = `<section class="guest"><p class="eyebrow">MOMENTS ADMINISTRATION</p><h1>${state.configured ? 'Welcome back.' : 'Set up your login.'}</h1><div class="card"><form id="admin-login">${state.configured ? '' : keyField}${emailField}${state.configured ? '<label>Password<input type="password" name="password" required maxlength="256" autocomplete="current-password"></label>' : passwordField}<button type="submit">${state.configured ? 'Sign in' : 'Create administrator login'}</button></form></div>${state.configured ? `<details class="card"><summary>Forgot your password?</summary><p>Recover access using the server setup key. This signs out all administrator sessions.</p><form id="admin-recover">${keyField}${emailField}${passwordField}<button type="submit">Reset administrator login</button></form></details>` : '<p>The server key is only needed for this first setup or account recovery. Future visits use your email and password.</p>'}</section>`;
    form('#admin-login', async b => { await send(`/admin/auth/${state.configured ? 'login' : 'setup'}`, b); location.reload(); });
    form('#admin-recover', async b => { await send('/admin/auth/recover', b); location.reload(); });
    return;
  }
  nav.innerHTML = `<span>${escape(state.admin.email)}</span><button id="admin-logout" class="secondary small">Sign out</button>`;
  action('#admin-logout', async () => { await send('/admin/auth/logout'); location.href = '/admin'; });
  const [owners, events, flags] = await Promise.all([api('/admin/owners'), api('/admin/events'), api('/admin/features')]);
  const ownerNames = new Map(owners.map(o => [o.id, o.name]));
  app.innerHTML = `<div class="toolbar"><div><p class="eyebrow">MOMENTS ADMINISTRATION</p><h1>Your dashboard.</h1><p class="muted">Every event. Every perspective. One place.</p></div><span>${owners.length} owners · ${events.length} events</span></div>
    <div class="grid"><section class="card"><h2>Add an owner</h2><p class="muted">Give someone access to manage their events.</p><form id="invite"><label>Owner name<input name="name" required maxlength="120"></label><label>Owner email<input name="email" type="email" required maxlength="254"></label><button type="submit">Create account & invitation</button></form></section>
    <section class="card"><h2>Create an event</h2><form id="admin-event"><label>Event owner<select name="owner" required><option value="">Choose an owner</option>${owners.filter(o => !o.disabled).map(o => `<option value="${o.id}">${escape(o.name)} (${escape(o.email)})</option>`).join('')}</select></label><label>Event name<input name="title" required maxlength="120"></label><label>Status<select name="status"><option value="published">Published — ready to share</option><option value="draft">Draft — finish setup first</option></select></label><p class="muted">Guests can share 25 photos each. The gallery opens immediately. You can change these settings after creating the event.</p><button type="submit" ${owners.some(o => !o.disabled) ? '' : 'disabled'}>Create event link</button></form></section></div>
    <div id="invitation" aria-live="polite"></div><div id="created-event" aria-live="polite"></div>
    <section><h2>Owners</h2><p class="muted">Suspending an owner revokes their sign-in access. Their events and guest galleries remain available. Changing an email also revokes existing owner sessions and invitations.</p><div class="grid">${owners.map(o => `<article class="card"><h3>${escape(o.name)}</h3><p>${escape(o.email)} · ${o.disabled ? 'Access suspended' : 'Active'}</p><details class="owner-editor"><summary>Edit owner</summary><form data-owner="${o.id}"><label>Name<input name="name" value="${escape(o.name)}" required maxlength="120"></label><label>Email<input name="email" type="email" value="${escape(o.email)}" required maxlength="254"></label><label class="check"><input name="disabled" type="checkbox" ${o.disabled ? 'checked' : ''}>Suspend owner access</label><p>${o.event_count} events</p><button type="submit" class="small">Save owner</button></form></details><button type="button" class="secondary small" data-invite="${o.id}" ${o.disabled ? 'disabled' : ''}>New sign-in link</button></article>`).join('') || '<p>No owners yet. Invite the first owner above.</p>'}</div></section>
    <section><h2>All events</h2><div class="grid">${events.map(e => `<article class="card"><span class="pill">${escape(e.status)}</span><h3>${escape(e.title)}</h3><p>${escape(ownerNames.get(e.owner))} · ${e.photo_count} photos · ${e.guest_count} guests</p><p class="share-url">${escape(e.url)}</p><div class="actions"><a class="button small" href="/host/${e.slug}">Manage event</a><a class="button small secondary" href="/host/${e.slug}#photos">Review photos</a><button class="secondary small" data-copy="${escape(e.url)}">Copy guest link</button><a class="button small secondary" href="/api/events/${e.slug}/qr" download="${e.slug}-qr.png">Download QR</a></div><details class="wall-controls advanced-settings" data-wall="${e.slug}"><summary>Mosaic wall link</summary><div></div></details></article>`).join('') || '<p>No events yet.</p>'}</div></section>
    <details class="card feature-admin"><summary>Feature controls</summary><form id="features-form">${Object.entries(featureLabels).map(([key, [label, hint]]) => `<label class="feature-switch"><span class="check"><input type="checkbox" name="${key}" ${flags[key] ? 'checked' : ''}>${label}</span><span class="muted">${hint}</span></label>`).join('')}<button type="submit">Save feature settings</button></form></details>
    <details class="card"><summary>Change administrator password</summary><form id="admin-password"><label>Current password<input type="password" name="current_password" autocomplete="current-password" required></label>${passwordField}<button type="submit">Change password</button></form></details>`;
  const toolbar = app.querySelector('.toolbar');
  toolbar.lastElementChild.remove();
  const overview = document.createElement('div'); overview.className = 'admin-overview';
  overview.innerHTML = `<div><strong>${events.length}</strong><span>Events</span></div><div><strong>${events.filter(e => e.status === 'published').length}</strong><span>Open for photos</span></div><div><strong>${owners.length}</strong><span>Event owners</span></div><div><strong>${events.reduce((sum,e) => sum + e.photo_count, 0)}</strong><span>Photos collected</span></div>`;
  toolbar.after(overview);
  const tabs = document.createElement('nav'); tabs.className = 'admin-tabs'; tabs.setAttribute('aria-label', 'Dashboard sections');
  tabs.innerHTML = ['events','owners','settings'].map(key => `<button type="button" data-panel="${key}" aria-controls="panel-${key}">${key[0].toUpperCase()+key.slice(1)}</button>`).join('');
  overview.after(tabs);
  const sections = [...app.querySelectorAll(':scope > section')];
  const createGrid = app.querySelector(':scope > .grid');
  const panels = {};
  for (const key of ['events','owners','settings']) {
    const panel = document.createElement('div'); panel.id = `panel-${key}`; panel.className = 'admin-panel'; panel.setAttribute('aria-label', key); app.append(panel); panels[key] = panel;
  }
  panels.owners.append(createGrid.firstElementChild, document.querySelector('#invitation'), sections[0]);
  panels.events.append(createGrid.firstElementChild, document.querySelector('#created-event'), sections[1]);
  createGrid.remove();
  panels.settings.append(...app.querySelectorAll(':scope > details'));
  const switchPanel = key => {
    activePanel = key;
    for (const [name,panel] of Object.entries(panels)) panel.hidden = name !== key;
    tabs.querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.panel === key)));
  };
  if (!owners.some(o => !o.disabled)) {
    const link = document.createElement('button'); link.type = 'button'; link.className = 'secondary'; link.textContent = 'Add an owner first';
    panels.events.querySelector('form').before(link); link.onclick = () => { switchPanel('owners'); document.querySelector('#invite [name=name]').focus(); };
  }
  tabs.querySelectorAll('button').forEach(b => { b.onclick = () => switchPanel(b.dataset.panel); });
  switchPanel(activePanel || (owners.length ? 'events' : 'owners'));
  const render = () => adminDashboard({ app, nav, api, send, form, action, notice, escape });
  async function invitation(body) {
    const result = await send('/admin/invitations', body);
    await render();
    document.querySelector('#invitation').innerHTML = `<section class="card"><h3>Invitation ready.</h3><p>${result.delivery === 'sent' ? 'Email sent.' : 'Share this link securely with the owner. Email was not sent.'}</p><label>One-time owner access link<input id="invite-url" readonly value="${escape(result.url)}"></label><p>Expires in 30 minutes. This is an owner sign-in link, not a guest event link.</p><button id="copy-invite" class="secondary">Copy invitation</button></section>`;
    action('#copy-invite', async () => { await navigator.clipboard.writeText(result.url); notice('Invitation copied'); });
    document.querySelector('#invitation').scrollIntoView({ behavior: 'smooth' });
  }
  form('#invite', invitation);
  action('[data-invite]', el => { const o = owners.find(o => o.id === el.dataset.invite); return invitation({ email: o.email, name: o.name }); });
  for (const o of owners) form(`[data-owner="${o.id}"]`, async (b, f) => {
    await send(`/admin/owners/${o.id}`, { ...b, disabled: f.elements.disabled.checked }, 'PATCH'); await render(); notice('Owner updated');
  });
  form('#admin-event', async b => {
    const e = await send('/admin/events', b); activePanel = 'events'; await render();
    document.querySelector('#created-event').innerHTML = `<section class="card"><h3>${e.status === 'published' ? 'Your event link is ready.' : 'Draft created. Publish in the studio before sharing.'}</h3><p class="share-url">${escape(e.url)}</p><div class="actions"><button id="copy-created">Copy guest link</button><a class="button secondary" href="/host/${e.slug}">Manage event</a><a class="button secondary" href="/api/events/${e.slug}/qr" download="${e.slug}-qr.png">Download QR</a></div></section>`;
    action('#copy-created', async () => { await navigator.clipboard.writeText(e.url); notice('Event link copied'); });
    document.querySelector('#created-event').scrollIntoView({ behavior: 'smooth' });
  });
  app.querySelectorAll('[data-wall]').forEach(d => d.addEventListener('toggle', () => { if(d.open) wallControls(d.querySelector('div'),d.dataset.wall,{api,send,notice}).catch(err=>notice(err.message,true)); }));
  action('[data-copy]', async el => { await navigator.clipboard.writeText(el.dataset.copy); notice('Event link copied'); });
  form('#features-form', async (_b, f) => { await send('/admin/features', Object.fromEntries(Object.keys(featureLabels).map(k => [k, f.elements[k].checked])), 'PATCH'); notice('Feature settings saved'); });
  form('#admin-password', async (b, f) => { await send('/admin/auth/password', b); f.reset(); notice('Password changed. Other administrator sessions have been signed out.'); });
}
