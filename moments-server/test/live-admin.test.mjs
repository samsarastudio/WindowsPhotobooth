import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createLiveApp } from '../src/live/server.js';

test('Admin setup, sessions, owner management, direct events, recovery and expiry', async t => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'live-admin-'));
  const adminKey = 'test-administrator-key-longer-than-32-characters';
  let time = Date.now(), live, server, base;
  async function start() {
    live = createLiveApp({ dataDir, adminKey, baseUrl: 'http://localhost', clock: () => time });
    server = live.app.listen(0, '127.0.0.1'); await new Promise(r => server.once('listening', r));
    base = `http://127.0.0.1:${server.address().port}`;
  }
  async function stop() { await new Promise(r => server.close(r)); live.close(); }
  await start(); t.after(async () => { await stop(); fs.rmSync(dataDir, { recursive: true, force: true }); });
  async function call(url, method = 'GET', body, cookie = '', extra = {}) {
    const r = await fetch(base + url, { method, headers: { cookie, ...(body ? { 'Content-Type': 'application/json' } : {}), ...extra }, body: body ? JSON.stringify(body) : undefined });
    return { status: r.status, cookie: r.headers.get('set-cookie')?.split(';')[0], headers: r.headers, body: r.headers.get('content-type')?.includes('json') ? await r.json() : await r.text() };
  }
  const credentials = { email: 'admin@example.com', password: 'a-long-admin-password' };
  assert.equal((await call('/api/admin/owners')).status, 401);
  assert.equal((await call('/api/admin/auth')).body.configured, false);
  assert.equal((await call('/api/admin/auth/setup', 'POST', { ...credentials, key: 'wrong' })).status, 401);
  assert.equal((await call('/api/admin/auth/setup', 'POST', { ...credentials, key: adminKey, password: 'short' })).status, 400);
  let result = await call('/api/admin/auth/setup', 'POST', { ...credentials, key: adminKey });
  assert.equal(result.status, 200); let admin = result.cookie;
  const stored = live.db.prepare('SELECT * FROM administrators').get();
  assert.notEqual(stored.password, credentials.password); assert.equal(stored.password.length, 128);
  assert.notEqual(live.db.prepare('SELECT hash FROM admin_sessions').get().hash, admin.split('=')[1]);
  assert.match(result.headers.get('set-cookie'), /HttpOnly/); assert.match(result.headers.get('set-cookie'), /SameSite=Lax/);
  assert.equal((await call('/api/admin/auth/setup', 'POST', { ...credentials, key: adminKey })).status, 409);
  assert.equal((await call('/api/admin/auth/login', 'POST', { ...credentials, password: 'wrong' })).status, 401);
  const second = (await call('/api/admin/auth/login', 'POST', credentials)).cookie;
  assert.equal((await call('/api/admin/features', 'PATCH', { webApp: false }, admin, { Origin: 'https://evil.example' })).status, 403);
  const invited = await call('/api/admin/invitations', 'POST', { email: 'owner@example.com', name: 'Owner' }, admin);
  assert.equal(invited.status, 201); const o = invited.body.owner;
  const token = new URLSearchParams(new URL(invited.body.url).hash.slice(1)).get('access');
  const owner = (await call('/api/auth/accept', 'POST', { token })).cookie;
  assert.equal((await call('/api/admin/owners', 'GET', undefined, owner)).status, 401);
  const e = (await call('/api/admin/events', 'POST', { owner: o.id, title: 'Admin created', status: 'published' }, admin)).body;
  assert.equal(e.owner, o.id); assert.equal(e.status, 'published');
  assert.equal((await call(`/api/events/${e.slug}`, 'GET', undefined, owner)).status, 200);
  assert.equal((await call(`/api/events/${e.slug}`, 'PATCH', { title: 'Updated by admin' }, admin)).status, 200);
  assert.equal((await call(`/api/events/${e.slug}/qr`, 'GET', undefined, admin)).status, 200);
  await call('/api/admin/features', 'PATCH', { webApp: false }, admin);
  assert.equal((await call('/admin')).status, 200);
  assert.equal((await call(`/host/${e.slug}`, 'GET', undefined, admin)).status, 200);
  assert.equal((await call(`/host/${e.slug}`, 'GET', undefined, owner)).status, 503);
  const pending = await call('/api/admin/invitations', 'POST', { email: o.email }, admin);
  await call(`/api/admin/owners/${o.id}`, 'PATCH', { disabled: true }, admin);
  assert.equal((await call('/api/me', 'GET', undefined, owner)).status, 401);
  assert.equal((await call('/api/auth/accept', 'POST', { token: new URLSearchParams(new URL(pending.body.url).hash.slice(1)).get('access') })).status, 401);
  assert.equal((await call('/api/admin/events', 'POST', { owner: o.id, title: 'Blocked' }, admin)).status, 400);
  assert.equal((await call('/api/admin/invitations', 'POST', { email: o.email }, admin)).status, 403);
  assert.equal((await call(`/api/guest/${e.slug}`)).status, 200, 'Suspension retains guest gallery');
  await call(`/api/admin/owners/${o.id}`, 'PATCH', { disabled: false, name: 'Renamed', email: 'new@example.com' }, admin);
  assert.equal((await call('/api/admin/owners', 'GET', undefined, admin)).body[0].name, 'Renamed');
  const other = await call('/api/admin/invitations', 'POST', { email: 'other@example.com' }, admin);
  assert.equal((await call(`/api/admin/owners/${o.id}`, 'PATCH', { email: other.body.owner.email }, admin)).status, 409);
  assert.equal((await call('/api/admin/events', 'GET', undefined, admin)).body.length, 1);
  // Sessions and login configuration survive restart.
  await stop(); await start();
  assert.equal((await call('/api/admin/auth', 'GET', undefined, admin)).body.admin.role, 'admin');
  result = await call('/api/admin/auth/password', 'POST', { current_password: credentials.password, password: 'a-changed-admin-password' }, admin);
  assert.equal(result.status, 200); const changed = result.cookie;
  assert.equal((await call('/api/admin/owners', 'GET', undefined, second)).status, 401);
  assert.equal((await call('/api/admin/owners', 'GET', undefined, admin)).status, 401);
  assert.equal((await call('/api/admin/auth/login', 'POST', credentials)).status, 401);
  await call('/api/admin/auth/logout', 'POST', {}, changed);
  assert.equal((await call('/api/admin/owners', 'GET', undefined, changed)).status, 401);
  assert.equal((await call('/api/admin/auth/recover', 'POST', { ...credentials, key: 'wrong' })).status, 401);
  const beforeRecovery = (await call('/api/admin/auth/login', 'POST', { ...credentials, password: 'a-changed-admin-password' })).cookie;
  result = await call('/api/admin/auth/recover', 'POST', { ...credentials, key: adminKey });
  assert.equal(result.status, 200); admin = result.cookie;
  assert.equal((await call('/api/admin/owners', 'GET', undefined, beforeRecovery)).status, 401);
  time += 7 * 86400000;
  assert.equal((await call('/api/admin/owners', 'GET', undefined, admin)).status, 401);
  for (let i = 0; i < 10; i++) await call('/api/admin/auth/login', 'POST', { ...credentials, password: 'wrong' });
  assert.equal((await call('/api/admin/auth/login', 'POST', credentials)).status, 429);
});
