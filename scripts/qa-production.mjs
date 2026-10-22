// Isolated release smoke test. No production writes or physical printing.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const data = fs.mkdtempSync(path.join(os.tmpdir(), 'moments-release-qa-'));
Object.assign(process.env, { DATA_DIR: data, HOST: '127.0.0.1', PORT: '0', HTTPS: '0',
  ADMIN_PIN: 'qa-pin', UPLOAD_TOKEN: 'qa-token', OPENAI_API_KEY: '',
  PUBLIC_BASE_URL: 'http://127.0.0.1:3020', ALLOW_LOCAL_PUBLIC_URL: '1' });
const { initDb, closeDb } = await import('../src/db.js');
initDb();
const { seedSampleGallery } = await import('../src/seed-samples.js');
seedSampleGallery();
closeDb();
let server;
let base;
let failures = 0;
let start;
async function stop() {
  if (server && server.exitCode === null) { const done = once(server, 'exit'); server.kill(); await done; }
}
async function request(route, { method = 'GET', body, auth = false } = {}) {
  const res = await fetch(base + route, { method, signal: AbortSignal.timeout(10000), headers: {
    'Content-Type': 'application/json', ...(auth ? { 'X-Admin-Pin': 'qa-pin', Authorization: 'Bearer qa-token' } : {})
  }, body: body === undefined ? undefined : JSON.stringify(body) });
  const text = await res.text();
  let json; try { json = JSON.parse(text); } catch { json = null; }
  return { status: res.status, json, text };
}
async function check(name, fn) {
  try { await fn(); console.log('PASS', name); }
  catch (e) { failures++; console.log('FAIL', name, '-', e.message); }
}
try {
  // Reserve an available localhost port, then start the server with isolated data.
  const net = await import('node:net');
  const probe = net.createServer(); probe.listen(0, '127.0.0.1'); await once(probe, 'listening');
  const port = probe.address().port; await new Promise(resolve => probe.close(resolve));
  process.env.PORT = String(port); process.env.PUBLIC_BASE_URL = `http://127.0.0.1:${port}`;
  base = process.env.PUBLIC_BASE_URL;
  start = async () => {
    server = spawn(process.execPath, ['src/index.js'], { cwd: root, env: process.env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    let logs = ''; server.stdout.on('data', b => logs += b); server.stderr.on('data', b => logs += b);
    for (let i = 0; i < 600; i++) {
      if (server.exitCode !== null) throw new Error(logs);
      try { if ((await request('/api/health')).status === 200) return; } catch {}
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    throw new Error('Server startup timed out: ' + logs);
  };
  await start();
  await check('pages and API routes', async () => {
    for (const route of ['/api/health', '/halloween', '/tablet/demo', '/admin', '/api/halloween/meta', '/api/frames'])
      assert.equal((await request(route)).status, 200, route);
  });
  await check('print endpoints reject unauthenticated requests', async () => {
    assert.equal((await request('/api/booth/print-jobs')).status, 401);
    assert.equal((await request('/api/tablet/photos/missing/print', { method: 'POST', body: {} })).status, 401);
  });
  await check('tablet queue, deduplication, booth targeting, claim and acknowledgement', async () => {
    const feed = (await request('/api/tablet/today?prefix=demo')).json;
    assert.ok(feed.photos.length > 0);
    const route = `/api/tablet/photos/${feed.photos[0].id}/print`;
    const options = { method: 'POST', auth: true, body: { boothId: 'qa-booth' } };
    const created = await request(route, options); assert.equal(created.status, 201);
    assert.equal((await request(route, options)).json.deduped, true);
    assert.equal((await request('/api/booth/print-jobs?boothId=other', { auth: true })).json.jobs.length, 0);
    const jobs = (await request('/api/booth/print-jobs?boothId=qa-booth', { auth: true })).json.jobs;
    assert.equal(jobs.length, 1);
    assert.equal((await fetch(jobs[0].mediaUrl)).status, 200);
    assert.equal((await request('/api/booth/print-jobs?boothId=qa-booth', { auth: true })).json.jobs.length, 0);
    assert.equal((await request(`/api/booth/print-jobs/${jobs[0].id}/ack`, { method: 'POST', auth: true, body: { status: 'done' } })).json.job.status, 'done');
  });
  await check('analytics records and deduplicates visits', async () => {
    const options = { method: 'POST', body: { visitorId: 'qa-visitor', utmSource: 'instagram' } };
    assert.equal((await request('/api/halloween/visit', options)).json.recorded, true);
    assert.equal((await request('/api/halloween/visit', options)).json.recorded, false);
  });
  await check('analytics accepts reserved object-property source without poisoning store', async () => {
    assert.equal((await request('/api/halloween/visit', { method: 'POST', body: { visitorId: 'qa-reserved', utmSource: 'constructor' } })).status, 200);
  });
  await check('normal analytics visits still work after reserved source', async () => {
    assert.equal((await request('/api/halloween/visit', { method: 'POST', body: { visitorId: 'qa-after' } })).status, 200);
  });
  await check('generated PNG uploads with dimensions and transparent opening intact', async () => {
    const file=path.resolve(root,'../builds/release-1.1.53-qa/landscape-generated.png');
    const bytes=fs.readFileSync(file), form=new FormData();form.append('frame',new Blob([bytes],{type:'image/png'}),'generated-qa.png');
    const res=await fetch(base+'/api/admin/frames',{method:'POST',headers:{'X-Admin-Pin':'qa-pin'},body:form});assert.equal(res.status,201);
    assert.deepEqual(fs.readFileSync(path.join(data,'frames','generated-qa.png')),bytes);
  });
  await check('deleting every frame stays deleted after restart', async () => {
    const frames = (await request('/api/frames')).json.frames;
    for (const frame of frames) assert.equal((await request(`/api/admin/frames/${encodeURIComponent(frame.filename)}`, { method: 'DELETE', auth: true })).status, 200);
    assert.equal((await request('/api/frames')).json.frames.length, 0);
    await stop(); await start();
    assert.equal((await request('/api/frames')).json.frames.length, 0);
  });
} finally {
  await stop();
  fs.rmSync(data, { recursive: true, force: true });
}
console.log(`${failures} failing checks`);
process.exitCode = failures ? 1 : 0;
