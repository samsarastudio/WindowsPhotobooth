'use strict';

/**
 * End-to-end KIA API flow: auth → dev session → frames → download → upload.
 * Usage: node scripts/run-kia-full-flow.cjs [imagePath]
 */
const path = require('path');
const fs = require('fs');
const { pathToFileURL, fileURLToPath } = require('url');
const { KiaApiService } = require('../electron/kia-api-service.cjs');

const DEV_EMAIL = 'nandu@tuna.group';
const BASE_URL = 'https://dev-kiaforum2026.thetunagroup.com';
const DEFAULT_IMAGE = path.join(
  __dirname,
  '..',
  '..',
  'Image Assets',
  'Phone tab back.png',
);
const OUT_DIR = path.join(__dirname, 'api-test-output');

function localFromRef(ref) {
  const s = String(ref || '').trim();
  if (!s) return null;
  if (s.startsWith('file://')) {
    try {
      return fileURLToPath(s);
    } catch (_) {
      return null;
    }
  }
  if (path.isAbsolute(s) && fs.existsSync(s)) return s;
  return null;
}

async function downloadFrameUrl(svc, url, destPath) {
  const remote = String(url || '').trim();
  if (!remote || remote.startsWith('file:')) return { ok: true, path: localFromRef(remote), skipped: true };
  try {
    const buf = await svc._fetchBinaryUrl(remote);
    fs.mkdirSync(path.dirname(destPath), { recursive: true });
    fs.writeFileSync(destPath, buf);
    return { ok: true, path: destPath, bytes: buf.length };
  } catch (e) {
    return { ok: false, error: String(e.message || e) };
  }
}

async function waitForUpload(svc, maxMs = 15000) {
  const start = Date.now();
  while (Date.now() - start < maxMs) {
    const q = svc.getUploadQueueStatus();
    if (q.pending === 0 && svc._lastPublish) {
      return { ok: true, publish: svc._lastPublish, queue: q };
    }
    await svc.processQueue();
    await new Promise((r) => setTimeout(r, 500));
  }
  return { ok: false, queue: svc.getUploadQueueStatus(), lastPublish: svc._lastPublish };
}

async function main() {
  const imagePath = path.resolve(process.argv[2] || DEFAULT_IMAGE);
  if (!fs.existsSync(imagePath)) {
    console.error('Image not found:', imagePath);
    process.exitCode = 1;
    return;
  }

  const dataDir = path.join(OUT_DIR, 'sync-data');
  const framesDir = path.join(OUT_DIR, 'frames');
  fs.mkdirSync(dataDir, { recursive: true });
  fs.mkdirSync(framesDir, { recursive: true });

  const svc = new KiaApiService(dataDir);
  svc.configure({
    baseUrl: BASE_URL,
    bearerToken: '',
    bypassCode: '12345',
    devBypassEmail: DEV_EMAIL,
    offlineAllowPrefix: true,
    debugMode: true,
    onDebug: (e) => console.log('[api-debug]', JSON.stringify(e)),
  });

  console.log('=== 1. authenticate ===');
  console.log('email:', DEV_EMAIL);
  const auth = await svc._authenticateEmail(DEV_EMAIL);
  console.log(JSON.stringify({ ok: auth.ok, error: auth.error, hasToken: Boolean(auth.token) }, null, 2));
  if (!auth.ok) {
    process.exitCode = 1;
    return;
  }

  console.log('\n=== 2. dev bypass session (12345 → QR validate) ===');
  const val = await svc.validateToken('12345');
  console.log(
    JSON.stringify(
      {
        valid: val.valid,
        sessionData: val.sessionData,
        error: val.error,
        offline: val.offline,
      },
      null,
      2,
    ),
  );
  if (!val.valid || !val.sessionData) {
    process.exitCode = 1;
    return;
  }

  console.log('\n=== 3. fetch frames ===');
  const fr = await svc.fetchFrames();
  console.log(
    JSON.stringify(
      {
        ok: fr.ok,
        count: fr.frames?.length,
        debug: fr.debug,
        frames: fr.frames?.map((f) => ({
          id: f.id,
          name: f.name,
          unlocked: f.is_unlocked,
          thumbnail: f.thumbnail,
          frame_image: f.frame_image,
        })),
      },
      null,
      2,
    ),
  );

  console.log('\n=== 4. download frame assets locally ===');
  const downloads = [];
  for (const frame of fr.frames || []) {
    const slug = String(frame.name || frame.id).replace(/[^\w.-]+/g, '_');
    if (frame.thumbnail) {
      const thumbUrl =
        frame.thumbnail.startsWith('file:') ? null : String(frame.thumbnail);
      const thumbDest = path.join(framesDir, `${slug}_thumb${path.extname(new URL(thumbUrl || frame.thumbnail).pathname) || '.png'}`);
      const r = thumbUrl
        ? await downloadFrameUrl(svc, thumbUrl, thumbDest)
        : { ok: true, path: localFromRef(frame.thumbnail), fromCache: true };
      downloads.push({ frame: frame.name, type: 'thumbnail', ...r });
    }
    if (frame.frame_image) {
      const imgUrl =
        frame.frame_image.startsWith('file:') ? null : String(frame.frame_image);
      const imgDest = path.join(framesDir, `${slug}_frame${path.extname(new URL(imgUrl || frame.frame_image).pathname) || '.png'}`);
      const r = imgUrl
        ? await downloadFrameUrl(svc, imgUrl, imgDest)
        : { ok: true, path: localFromRef(frame.frame_image), fromCache: true };
      downloads.push({ frame: frame.name, type: 'frame_image', ...r });
    }
  }
  console.log(JSON.stringify(downloads, null, 2));
  console.log('frames saved under:', framesDir);

  console.log('\n=== 5. upload image (no frame overlay) ===');
  console.log('image:', imagePath);
  const up = await svc.enqueueMedia({
    sessionToken: val.sessionData,
    imagePath,
    guestEmail: DEV_EMAIL,
    // no frameId — raw photo only
  });
  console.log('enqueue:', up);

  console.log('\n=== 6. process upload queue ===');
  const done = await waitForUpload(svc);
  console.log(JSON.stringify(done, null, 2));

  if (!done.ok) {
    process.exitCode = 1;
  }
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
