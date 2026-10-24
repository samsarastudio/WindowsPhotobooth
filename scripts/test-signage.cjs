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
    const playing = layout => page.waitForFunction(l => {
      const v = document.querySelector('video');
      return v.dataset.layout === l && v.currentTime > .1 && !v.paused;
    }, layout, { timeout: 60000 });
    await page.goto(`${base}/signage?layout=landscape`);
    await playing('landscape');
    assert.equal(downloads, 1);
    assert.match(await page.locator('#status').textContent(), /Saved on this device/);
    assert.equal(await page.locator('video').evaluate(v => v.videoWidth), 1920);
    await page.locator('video').evaluate(v => { v.currentTime = v.duration - .25; });
    await wait(1000);
    assert(await page.locator('video').evaluate(v => v.currentTime < 3 && !v.paused), 'Loops across video end');
    await context.setOffline(true);
    const before = await page.locator('video').evaluate(v => v.currentTime);
    await wait(800);
    assert(await page.locator('video').evaluate((v, t) => v.currentTime > t, before), 'Playback continues offline');
    await context.setOffline(false);
    await page.reload(); await playing('landscape');
    assert.equal(downloads, 1, 'Reload reuses IndexedDB video without downloading');
    await page.route('**/assets/signage/manifest.json', route => route.abort());
    await page.reload(); await playing('landscape');
    assert.equal(downloads, 1, 'Cached video survives manifest failure');
    await page.unroute('**/assets/signage/manifest.json');
    await page.locator('#layout').selectOption('portrait'); await playing('portrait');
    assert.equal(downloads, 2);
    assert.equal(await page.locator('video').evaluate(v => v.videoHeight), 1920);
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.locator('#layout').selectOption('auto'); await playing('landscape');
    await page.setViewportSize({ width: 720, height: 1280 }); await playing('portrait');
    assert.equal(downloads, 2, 'Auto rotation reuses both cached layouts');
    if (fs.existsSync(path.join(root, 'public/assets/signage/video2.json'))) {
      await page.goto(`${base}/signage?video=2&layout=portrait`); await playing('portrait');
      const version2 = await page.locator('video').getAttribute('data-version');
      assert.match(await page.locator('#status').textContent(), /Video 2/);
      await page.goto(`${base}/signage?video=1&layout=portrait`); await playing('portrait');
      assert.notEqual(await page.locator('video').getAttribute('data-version'), version2, 'Original campaign is preserved');
      const beforeReturn = downloads;
      await page.goto(`${base}/signage?video=2&layout=portrait`); await playing('portrait');
      assert.equal(downloads, beforeReturn, 'Named campaign has a separate reusable cache');
    }
    await page.screenshot({ path: path.join(data, 'portrait-player.png') });
    const memory = await browser.newContext();
    await memory.addInitScript(() => { indexedDB.open = () => { throw Error('Storage unavailable'); }; });
    const memoryPage = await memory.newPage();
    await memoryPage.goto(`${base}/signage?layout=landscape`);
    await memoryPage.waitForFunction(() => document.querySelector('video').currentTime > .1, null, { timeout: 60000 });
    assert.match(await memoryPage.locator('#status').textContent(), /Loaded in memory/);
    assert.deepEqual(errors, []);
    console.log(JSON.stringify({ passed: ['server route', 'landscape playback', 'portrait playback', 'loop boundary', 'offline continuation', 'persistent cache reuse', 'manifest failure fallback', 'automatic orientation', 'storage unavailable fallback', 'no browser errors'], screenshot: path.join(data, 'portrait-player.png') }, null, 2));
  } finally { await browser?.close(); server.kill(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
