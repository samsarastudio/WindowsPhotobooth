import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import { createLiveApp } from '../src/live/server.js';

test('Moments Live account isolation, private media, moderation, capacity and upload atomicity', async t => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'moments-live-'));
  const adminKey = 'test-only-administrator-secret-at-least-32-characters';
  const live = createLiveApp({ dataDir, adminKey, baseUrl: 'http://localhost', sendMail: async () => true });
  const server = live.app.listen(0, '127.0.0.1'); await new Promise(r => server.once('listening', r));
  const base = `http://127.0.0.1:${server.address().port}`;
  t.after(async () => { await new Promise(r => server.close(r)); live.close(); fs.rmSync(dataDir, { recursive: true, force: true }); });
  async function call(url, { method = 'GET', body, cookie = '', headers = {} } = {}) {
    const response = await fetch(base + url, { method, headers: { cookie, ...(body && !(body instanceof FormData) ? { 'Content-Type': 'application/json' } : {}), ...headers }, body: body instanceof FormData ? body : body ? JSON.stringify(body) : undefined });
    const content = response.headers.get('content-type') || '';
    return { status: response.status, cookie: response.headers.get('set-cookie')?.split(';')[0], body: content.includes('json') ? await response.json() : Buffer.from(await response.arrayBuffer()) };
  }
  async function account(email) {
    const invitation = await call('/api/admin/invitations', { method: 'POST', body: { email, name: 'Test owner' }, headers: { 'X-Live-Admin-Key': adminKey } });
    assert.equal(invitation.status, 201);
    const token = new URLSearchParams(new URL(invitation.body.url).hash.slice(1)).get('access');
    const login = await call('/api/auth/accept', { method: 'POST', body: { token } }); assert.equal(login.status, 200);
    assert.equal((await call('/api/auth/accept', { method: 'POST', body: { token } })).status, 401, 'one-time invitation');
    return login.cookie;
  }
  assert.equal((await call('/api/admin/invitations', { method: 'POST', body: { email: 'bad@example.com' } })).status, 401);
  const a = await account('a@example.com'); const b = await account('b@example.com');
  const created = await call('/api/events', { method: 'POST', cookie: a, body: { title: 'Wedding', shot_limit: 1, guest_limit: 2, moderation: 1, reveal: Date.now() + 600000 } });
  assert.equal(created.status, 201); const slug = created.body.slug;
  assert.equal((await call(`/api/events/${slug}`, { cookie: b })).status, 404, 'owner isolation');
  assert.equal((await call(`/api/guest/${slug}`)).status, 404, 'draft hidden');
  assert.equal((await call(`/api/events/${slug}`, { method: 'PATCH', cookie: a, headers: { origin: 'https://evil.example' }, body: { status: 'published' } })).status, 403);
  await call(`/api/events/${slug}`, { method: 'PATCH', cookie: a, body: { status: 'published' } });
  assert.equal((await call(`/api/events/${slug}/qr`, { cookie: a })).status, 200);
  const g1 = await call(`/api/guest/${slug}/join`, { method: 'POST', body: { name: 'One' } });
  const g2 = await call(`/api/guest/${slug}/join`, { method: 'POST', body: { name: 'Two' } });
  assert.equal((await call(`/api/guest/${slug}/join`, { method: 'POST', body: { name: 'Three' } })).status, 409, 'capacity enforced');
  const jpeg = await sharp({ create: { width: 80, height: 100, channels: 3, background: 'red' } }).jpeg().toBuffer();
  function payload(requestId, image = jpeg) { const f = new FormData(); f.append('photo', new Blob([image], { type: 'image/jpeg' }), 'test.jpg'); f.append('request_id', requestId); return f; }
  const invalid = await call(`/api/guest/${slug}/photos`, { method: 'POST', cookie: g1.cookie, body: payload('bad', Buffer.from('not-an-image')) }); assert.equal(invalid.status, 400);
  const outcomes = await Promise.all(['one','two'].map(key => call(`/api/guest/${slug}/photos`, { method: 'POST', cookie: g1.cookie, body: payload(key) })));
  assert.deepEqual(outcomes.map(r => r.status).sort(), [201,409], 'concurrent uploads cannot bypass quota');
  const photo = outcomes.find(r => r.status === 201).body; const requestId = outcomes[0].status === 201 ? 'one' : 'two';
  assert.equal((await call(`/api/guest/${slug}/photos`, { method: 'POST', cookie: g1.cookie, body: payload(requestId) })).body.id, photo.id, 'retry idempotency');
  const imagePath = `/api/guest/${slug}/photos/${photo.id}/image`;
  assert.equal((await call(imagePath, { cookie: g1.cookie })).status, 404, 'direct media blocked before reveal');
  assert.equal((await call(imagePath, { cookie: a })).status, 200, 'owner preview works');
  assert.equal((await call(imagePath, { cookie: b })).status, 404);
  await call(`/api/events/${slug}`, { method: 'PATCH', cookie: a, body: { reveal: 0, visibility: 'own' } });
  assert.equal((await call(imagePath, { cookie: g1.cookie })).status, 404, 'unapproved remains hidden');
  await call(`/api/events/${slug}/photos/${photo.id}`, { method: 'PATCH', cookie: a, body: { approved: 1, favorite: 1 } });
  assert.equal((await call(imagePath, { cookie: g1.cookie })).status, 200);
  assert.equal((await call(imagePath, { cookie: g2.cookie })).status, 404, 'own-photo privacy enforced on bytes');
  assert.equal((await call(imagePath, { headers: { 'X-Guest-Token': g1.body.guest_token } })).status, 200, 'native guest authorization');
  assert.equal((await call(`/api/events/${slug}/download`, { cookie: b })).status, 404);
  assert.equal((await call(`/api/events/${slug}/download`, { cookie: a })).body.subarray(0,2).toString(), 'PK');
  assert.equal((await call(`/api/events/${slug}/photobook`, { cookie: a })).body.subarray(0,4).toString(), '%PDF');
  assert.equal((await call(`/api/events/${slug}/photobook`, { cookie: b })).status, 404);
  const assetForm = new FormData(); assetForm.append('photo', new Blob([jpeg]), 'cover.jpg');
  assert.equal((await call(`/api/events/${slug}/assets/cover`, { method: 'POST', cookie: a, body: assetForm })).status, 200);
  assert.equal((await call(`/api/guest/${slug}/cover`)).status, 200);
  assert.equal((await call(imagePath + '?thumb=1', { cookie: g2.cookie })).status, 404);
  assert.equal((await call(imagePath + '?thumb=1', { cookie: g1.cookie })).status, 200);
  await call(`/api/events/${slug}`, { method: 'PATCH', cookie: a, body: { status: 'closed' } });
  assert.equal((await call(`/api/guest/${slug}/photos`, { method: 'POST', cookie: g2.cookie, body: payload('closed') })).status, 403);
  assert.equal((await call('/.well-known/apple-app-site-association')).status, 503, 'no fabricated Apple association');
  assert.equal((await call('/.well-known/assetlinks.json')).status, 503);
  await call(`/api/events/${slug}/photos/${photo.id}`, { method: 'DELETE', cookie: a });
  assert.equal((await call(imagePath, { cookie: a })).status, 404);
  assert.equal((await call(`/api/events/${slug}`, { method: 'DELETE', cookie: b })).status, 404);
  assert.equal((await call(`/api/events/${slug}`, { method: 'DELETE', cookie: a })).status, 200);
  assert.equal((await call(`/api/guest/${slug}/cover`)).status, 404);
  await call('/api/auth/logout', { method: 'POST', cookie: a });
  assert.equal((await call('/api/events', { cookie: a })).status, 401);
});
