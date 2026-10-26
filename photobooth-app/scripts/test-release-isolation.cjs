// Inspect the actual Windows release, not just the source checkout.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const asar = require('@electron/asar');
const app = path.resolve(__dirname, '..');
const release = path.join(app, 'release/win-unpacked');
const archive = path.join(release, 'resources/app.asar');
const pkg = JSON.parse(fs.readFileSync(path.join(app, 'package.json')));
const bundled = JSON.parse(asar.extractFile(archive, 'package.json'));
assert.equal(bundled.name, 'photobooth-app');
assert.equal(bundled.version, pkg.version);
assert.equal(pkg.build.appId, 'com.photobooth.app');
const entries = asar.listPackage(archive);
assert(!entries.some(name => /[\\/]hero[-/\\]/i.test(name)), 'Hero file leaked into Hauntbooth ASAR');
for (const file of ['electron/main.cjs', 'electron/preload.cjs', 'electron/scene-worker.cjs']) {
  const source = asar.extractFile(archive, file).toString();
  assert(!/hero:|HERO_DEMO|hero-integration|hero-portrait/.test(source), 'Hero runtime hook leaked into ' + file);
}
const hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
for (const name of ['haunted-harvest-carnival.webp', 'witch-lantern-garden.webp', 'vampire-candlelit-ballroom.webp']) {
  const relative = 'ai-backgrounds/scene/' + name;
  assert.equal(hash(fs.readFileSync(path.join(release, 'resources/bundled-config', relative))), hash(fs.readFileSync(path.join(app, 'config', relative))));
}
for (const name of ['PhotoBooth.exe', 'edsdk-bridge.exe', 'EDSDK.dll', 'EdsImage.dll', 'resources/bundled-config/ai-models/birefnet-lite.onnx', 'resources/bundled-config/ai-models/u2net.onnx', 'resources/bundled-config/ai-models/yunet.onnx']) assert(fs.existsSync(path.join(release, name)), 'Missing runtime dependency ' + name);
for (const name of ['hero-config.json', 'hero-backgrounds', 'photobooth-config.json']) assert(!fs.existsSync(path.join(release, 'resources/bundled-config', name)), 'Unexpected local/Hero config shipped: ' + name);
console.log('PASS: Windows release ' + pkg.version + ' contains camera bridge, models and all three vibrant scenes; no Hero hooks, assets or local operator config.');
