import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import { createLiveApp } from '../src/live/server.js';
test('Live feature controls enforce deadlines, preserve privacy and persist across restart', async t => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'moments-feature-'));
  const adminKey = 'test-administrator-key-longer-than-32-characters';
  let time = Date.now(), live, server, base;
  async function start() {
    live = createLiveApp({ dataDir, adminKey, baseUrl: 'http://localhost', clock: () => time });
    server = live.app.listen(0, '127.0.0.1'); await new Promise(r => server.once('listening', r));
    base = `http://127.0.0.1:${server.address().port}`;
  }
  async function stop() { await new Promise(r => server.close(r)); live.close(); }
  await start();
  t.after(async () => { await stop(); fs.rmSync(dataDir, { recursive: true, force: true }); });
  async function call(url, method = 'GET', body, cookie = '', admin = false, extra = {}) {
    const response = await fetch(base + url, { method, headers: { cookie, ...(body && !(body instanceof FormData) ? { 'Content-Type': 'application/json' } : {}), ...(admin ? { 'X-Live-Admin-Key': adminKey } : {}), ...extra }, body: body instanceof FormData ? body : body ? JSON.stringify(body) : undefined });
    return { status: response.status, cookie: response.headers.get('set-cookie')?.split(';')[0], body: response.headers.get('content-type')?.includes('json') ? await response.json() : Buffer.from(await response.arrayBuffer()) };
  }
  const flags = body => call('/api/admin/features', 'PATCH', body, '', true);
  assert.equal((await flags({ nonExistent: false })).status, 400);
  assert.equal((await flags({ downloads: 'false' })).status, 400);
  assert.equal((await call('/api/admin/features')).status, 401);
  assert.equal((await call('/api/admin/features', 'PATCH', { webApp: false })).status, 401);
  const invitation = await call('/api/admin/invitations', 'POST', { email: 'owner@example.com' }, '', true);
  const raw = new URLSearchParams(new URL(invitation.body.url).hash.slice(1)).get('access');
  const owner = (await call('/api/auth/accept', 'POST', { token: raw })).cookie;
  const e = (await call('/api/events', 'POST', { title: 'Private party', status: 'published', visibility: 'host', closes_at: time + 1000, reveal: time + 2000 }, owner)).body;
  const route = `/api/guest/${e.slug}`;
  const joined = await call(`${route}/join`, 'POST', { name: 'Guest' }); const guest = joined.cookie;
  const native = { 'X-Guest-Token': joined.body.guest_token };
  const bytes = await sharp({ create: { width: 20, height: 20, channels: 3, background: 'red' } }).jpeg().toBuffer();
  const photo = key => { const form = new FormData(); form.append('photo', new Blob([bytes]), 'picture.jpg'); form.append('request_id', key); return form; };
  live.db.prepare("UPDATE events SET style='mono' WHERE slug=?").run(e.slug); // Legacy event setting must not recolor new uploads.
  const uploaded = await call(`${route}/photos`, 'POST', photo('first'), guest); assert.equal(uploaded.status, 201);
  const media = `${route}/photos/${uploaded.body.id}/image`;
  assert.equal((await call(media, 'GET', undefined, guest)).status, 404);
  const originalColor = await call(media, 'GET', undefined, owner);
  assert.equal(originalColor.status, 200);
  const channels = (await sharp(originalColor.body).stats()).channels;
  assert.ok(channels[0].mean > channels[1].mean + 100, 'Red capture stays red even for a legacy mono event');
  time += 1000; // Exact boundary: no cron job, client clock or browser tab required.
  assert.equal((await call(route, 'GET', undefined, guest)).body.event.status, 'closed');
  assert.equal((await call(`${route}/join`, 'POST', { name: 'Late' })).status, 403);
  assert.equal((await call(`${route}/photos`, 'POST', photo('late'), '', false, native)).status, 403);
  await flags({ scheduledClosing: false, scheduledReveal: false, hostOnlyGallery: false });
  assert.equal((await call(`/api/events/${e.slug}`, 'PATCH', { closes_at: 0 }, owner)).status, 403);
  assert.equal((await call(`/api/events/${e.slug}`, 'PATCH', { reveal: 0 }, owner)).status, 403);
  assert.equal((await call('/api/events', 'POST', { title: 'Other', visibility: 'host' }, owner)).status, 403);
  time += 1000;
  assert.equal((await call(`${route}/photos`, 'GET', undefined, '', false, native)).body.length, 0, 'host-only remains hidden even after reveal and feature disabled');
  assert.equal((await call(media, 'GET', undefined, '', false, native)).status, 404);
  await flags({ webApp: false, downloads: false, photobooks: false, slideshow: false, branding: false, filters: false, guestUploads: false });
  for (const page of ['/', '/access', '/index.html', `/e/${e.slug}`, `/host/${e.slug}`]) assert.equal((await call(page)).status, 503);
  assert.equal((await call('/admin')).status, 200, 'admin cannot lock themselves out');
  assert.equal((await call('/api/health')).status, 200);
  assert.equal((await call(route, 'GET', undefined, '', false, native)).status, 200, 'native API survives web switch');
  for (const endpoint of ['download', 'photobook', 'slideshow']) assert.equal((await call(`/api/events/${e.slug}/${endpoint}`, 'GET', undefined, owner)).status, 403);
  assert.equal((await call(media + '?download=1', 'GET', undefined, owner)).status, 403);
  assert.equal((await call(media, 'GET', undefined, owner)).status, 200, 'display access is not DRM');
  assert.equal((await call(`/api/events/${e.slug}/assets/cover`, 'POST', photo('cover'), owner)).status, 403);
  assert.equal((await call(`/api/events/${e.slug}`, 'PATCH', { style: 'mono' }, owner)).body.style, 'classic');
  assert.equal((await flags({ filters: true })).body.filters, true, 'Administrator can enable photo looks');
  const fresh = (await call('/api/events', 'POST', { title: 'Natural', status: 'published' }, owner)).body;
  assert.equal(fresh.style, 'classic');
  assert.equal((await call(`/api/guest/${fresh.slug}/join`, 'POST', { name: 'Paused' })).status, 403);
  assert.equal((await call(route, 'GET', undefined, guest)).body.uploads_enabled, false);
  // Simulate an older schema; restart must add the deadline column without losing events.
  live.db.exec('ALTER TABLE events DROP COLUMN closes_at');
  await stop(); await start();
  assert.equal((await call('/api/config')).body.features.webApp, false);
  assert.equal((await call(`/api/events/${e.slug}`, 'GET', undefined, owner)).body.closes_at, 0);
  assert.equal((await call(media, 'GET', undefined, guest)).status, 404, 'privacy preserved after migration');
  await flags({ webApp: true, downloads: true, guestUploads: true });
  assert.equal((await call(`/e/${e.slug}`)).status, 200);
  assert.equal((await call(`${route}/photos`, 'POST', photo('resumed'), guest)).status, 201);
  assert.equal((await call(media + '?download=1', 'GET', undefined, owner)).status, 200);
});
