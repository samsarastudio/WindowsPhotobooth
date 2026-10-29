const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const net = require('node:net');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..');
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
(async () => {
  const probe = net.createServer();
  await new Promise(resolve => probe.listen(0, '127.0.0.1', resolve));
  const port = probe.address().port;
  await new Promise(resolve => probe.close(resolve));
  const base = `http://127.0.0.1:${port}`;
  const data = fs.mkdtempSync(path.join(os.tmpdir(), 'moments-signage-qa-'));
  const server = spawn(process.execPath, ['src/index.js'], { cwd: root, env: { ...process.env, PORT: String(port), HOST: '127.0.0.1', HTTPS: '0', DATA_DIR: data, PUBLIC_BASE_URL: base, ALLOW_LOCAL_PUBLIC_URL: '1' }, stdio: ['ignore', 'ignore', 'pipe'], windowsHide: true });
  let serverErrors = '';
  server.stderr.on('data', chunk => { serverErrors += chunk.toString(); });
  let browser;
  try {
    let ready = false;
    for (let i = 0; i < 400; i++) {
      if (server.exitCode !== null) throw Error(`Server exited: ${serverErrors}`);
      try { if ((await fetch(`${base}/api/health`)).ok) { ready = true; break; } } catch {}
      await wait(150);
    }
    assert(ready, `Isolated Moments server starts: ${serverErrors}`);
    browser = await chromium.launch({ channel: 'chrome', headless: true });
    const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
    const page = await context.newPage();
    const errors = []; page.on('pageerror', e => errors.push(e.message));
    let downloads = 0;
    page.on('request', req => { if (req.url().endsWith('.mp4')) downloads++; });
    const playing = () => page.waitForFunction(() => {
      const v = document.querySelector('video');
      return v.dataset.layout === 'portrait' && v.currentTime > .1 && !v.paused;
    }, null, { timeout: 60000 });
    const manifest = await fetch(base+'/assets/signage/manifest.json').then(r=>r.json());
    assert.deepEqual(Object.keys(manifest),['portrait']);
    await page.goto(base+'/signage?video=1&layout=landscape');
    await playing();
    assert.equal(await page.locator('#campaign, #layout').count(),0);
    assert.equal(new URL(page.url()).search,'');
    assert.equal(await page.locator('video').getAttribute('data-version'),manifest.portrait.version);
    assert.equal(await page.locator('video').evaluate(v=>v.videoWidth),1080);
    assert.equal(downloads,1);
    await page.locator('video').evaluate(v=>{v.currentTime=v.duration-.25;});
    await wait(1000);
    assert(await page.locator('video').evaluate(v=>v.currentTime<3&&!v.paused),'Loops');
    await context.setOffline(true);
    const before=await page.locator('video').evaluate(v=>v.currentTime);
    await wait(800);
    assert(await page.locator('video').evaluate((v,t)=>v.currentTime>t,before));
    await context.setOffline(false);
    await page.reload();await playing();assert.equal(downloads,1,'Cache reused');
    await page.route('**/assets/signage/manifest.json',route=>route.abort());
    await page.locator('#reload').click();await playing();
    assert.equal(downloads,1,'Manifest failure uses current cache');
    const keys=await page.evaluate(()=>new Promise((resolve,reject)=>{const r=indexedDB.open('moments-signage',1);r.onsuccess=()=>{const db=r.result,tx=db.transaction('videos');const q=tx.objectStore('videos').getAllKeys();q.onsuccess=()=>{resolve(q.result);db.close();};};r.onerror=()=>reject(r.error);}));
    assert.deepEqual(keys,['main-portrait']);
    const memory=await browser.newContext();
    await memory.addInitScript(()=>{indexedDB.open=()=>{throw Error('Storage unavailable');};});
    const mp=await memory.newPage();await mp.goto(base+'/signage?video=2');
    await mp.waitForFunction(()=>document.querySelector('video').currentTime>.1,null,{timeout:60000});
    assert.match(await mp.locator('#status').textContent(),/Loaded in memory/);
    assert.deepEqual(errors,[]);
    console.log('PASS: latest portrait only, legacy links, looping, offline playback, cache reuse, fallback, single cached video, memory mode');
  } finally { await browser?.close(); server.kill(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
