/**
 * Local smoke checks for share deep-links.
 * Usage (from moments-server/): node scripts/qa-share.mjs [baseUrl]
 * Default baseUrl: http://127.0.0.1:3020
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const base = (process.argv[2] || 'http://127.0.0.1:3020').replace(/\/$/, '');
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

async function getJson(url) {
  const res = await fetch(url);
  const text = await res.text();
  let data = null;
  try {
    data = JSON.parse(text);
  } catch {
    data = { _raw: text.slice(0, 200) };
  }
  return { res, data, text };
}

async function main() {
  console.log(`[qa-share] base=${base}`);

  const health = await getJson(`${base}/api/health`);
  assert(health.res.ok, `health failed: ${health.res.status}`);
  assert(health.data?.ok === true, 'health.ok != true');
  console.log('[qa-share] health', {
    build: health.data.build,
    shareApi: health.data.shareApi,
  });
  if (health.data.shareApi !== true) {
    console.warn(
      '[qa-share] WARNING: shareApi flag missing — Node process may be stale (restart required).',
    );
  }

  // Static share client must include media fallback.
  const galleryPath = path.join(root, 'public', 'js', 'gallery.js');
  const gallerySrc = fs.readFileSync(galleryPath, 'utf8');
  assert(gallerySrc.includes('guessMediaPhoto'), 'gallery.js missing guessMediaPhoto');
  assert(gallerySrc.includes('loadSharePhoto'), 'gallery.js missing loadSharePhoto');
  assert(gallerySrc.includes('probeImageUrl'), 'gallery.js missing probeImageUrl');
  console.log('[qa-share] gallery.js share helpers OK');

  const indexHtml = fs.readFileSync(path.join(root, 'public', 'index.html'), 'utf8');
  assert(/gallery\.js\?v=/.test(indexHtml), 'index.html missing gallery.js cache bust');
  console.log('[qa-share] index.html cache-bust OK');

  // Live route presence (may 404 for unknown id, but must not be Express "Cannot GET").
  for (const pathTry of ['/api/photos/__qa_missing__', '/api/share/__qa_missing__']) {
    const r = await getJson(`${base}${pathTry}`);
    const cannotGet = typeof r.text === 'string' && r.text.includes('Cannot GET');
    assert(!cannotGet, `${pathTry} not registered (Cannot GET) — restart Moments`);
    assert(r.res.status === 404 || r.res.status === 200, `${pathTry} unexpected ${r.res.status}`);
    console.log(`[qa-share] ${pathTry} → ${r.res.status} (route present)`);
  }

  console.log('[qa-share] PASS');
}

main().catch((e) => {
  console.error('[qa-share] FAIL', e.message || e);
  process.exit(1);
});
