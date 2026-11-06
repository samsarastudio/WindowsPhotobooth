const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'C:/Users/Unity/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const assert = require('node:assert/strict');
const sharp = require('sharp');

(async () => {
  const root = path.resolve(__dirname, '..');
  const data = fs.mkdtempSync(path.join(os.tmpdir(), 'moments-live-browser-'));
  const output = path.join(root, 'output/live-qa'); fs.mkdirSync(output, { recursive: true });
  const base = 'http://127.0.0.1:3191';
  const key = 'browser-test-administrator-key-32-characters';
  const server = spawn(process.execPath, ['src/live/index.js'], { cwd: root, windowsHide: true, env: { ...process.env, LIVE_PORT: '3191', LIVE_BASE_URL: base, LIVE_DATA_DIR: data, LIVE_ADMIN_KEY: key }, stdio: 'pipe' });
  let browser;
  try {
    for (let i = 0; i < 100; i++) { try { if ((await fetch(base + '/api/health')).ok) break; } catch {} await new Promise(r => setTimeout(r, 100)); }
    browser = await chromium.launch({ channel: 'chrome', headless: true });
    const host = await browser.newPage({ viewport: { width: 1440, height: 1000 } }); const errors = [];
    host.on('pageerror', e => errors.push(e.message));
    await host.goto(base); await host.getByRole('heading', { name: 'Your people. Your moments.' }).waitFor();
    await host.screenshot({ path: path.join(output, 'home-desktop.png'), fullPage: true });
    await host.goto(base + '/admin'); await host.locator('[name=key]').fill(key); await host.locator('[name=name]').fill('Emma & James'); await host.locator('[name=email]').fill('owner@example.com'); await host.getByRole('button', { name: 'Create account & invitation' }).click();
    await host.locator('#invite-url').waitFor(); const invitation = await host.locator('#invite-url').inputValue(); await host.goto(invitation);
    await host.getByRole('heading', { name: 'Your events.' }).waitFor(); await host.getByRole('button', { name: 'Create an event' }).click();
    await host.locator('#create-form [name=title]').fill('Emma & James'); await host.locator('#create-form [type=submit]').click(); await host.waitForURL('**/host/**');
    const slug = new URL(host.url()).pathname.split('/')[2];
    await host.locator('[name=description]').fill('Our favourite people. One unforgettable weekend.');
    await host.locator('[name=status]').selectOption('published'); await host.locator('[name=moderation]').check();
    await host.getByRole('button', { name: 'Save event settings' }).click(); await host.locator('#notice').filter({ hasText: 'saved' }).waitFor();
    const jpeg = await sharp({ create: { width: 1200, height: 900, channels: 3, background: '#adbc9a' } }).composite([{ input: Buffer.from('<svg width="1200" height="900"><circle cx="600" cy="360" r="180" fill="#eac7a1"/><rect x="300" y="570" width="600" height="330" rx="160" fill="#214e40"/></svg>') }]).jpeg().toBuffer();
    const guestContext = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const guest = await guestContext.newPage(); guest.on('pageerror', e => errors.push(e.message));
    await guest.goto(base + '/e/' + slug); await guest.locator('[name=name]').fill('Jamie'); await guest.getByRole('button', { name: 'Join the moment' }).click(); await guest.locator('#upload').waitFor();
    await guest.locator('#upload').setInputFiles({ name: 'photo.jpg', mimeType: 'image/jpeg', buffer: jpeg });
    await guest.locator('#notice').filter({ hasText: 'photo shared' }).waitFor();
    assert.equal(await guest.locator('.photo').count(), 0, 'moderation hides photo from guest');
    await host.reload(); await host.locator('[data-approve]').waitFor(); await host.locator('[data-approve]').click();
    await guest.reload(); await guest.locator('.photo img').waitFor();
    for (const width of [320, 390, 768]) { await guest.setViewportSize({ width, height: 844 }); assert.equal(await guest.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, `guest viewport ${width}`); }
    await guest.setViewportSize({ width: 390, height: 844 }); await guest.screenshot({ path: path.join(output, 'guest-mobile.png'), fullPage: true });
    await host.screenshot({ path: path.join(output, 'studio-desktop.png'), fullPage: true });
    await host.setViewportSize({ width: 390, height: 844 }); assert.equal(await host.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, 'host mobile viewport');
    await host.goto(base + '/host/' + slug + '/print'); await host.locator('.print-card .qr').waitFor();
    await host.goto(base + '/host/' + slug + '/slideshow'); await host.locator('#slide img').waitFor();
    assert.deepEqual(errors, []);
    console.log('PASS: invitation, login, event creation, publish, guest join, upload, moderation, reveal, mobile layout, QR print and slideshow. Screenshots: ' + output);
  } finally { if (browser) await browser.close(); server.kill(); await new Promise(r => server.once('exit', r)); fs.rmSync(data, { recursive: true, force: true }); }
})().catch(e => { console.error(e); process.exitCode = 1; });
