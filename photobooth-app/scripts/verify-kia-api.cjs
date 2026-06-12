'use strict';

/**
 * Smoke-test KIA API auth, dev session, frames, and upload.
 * Usage: node scripts/verify-kia-api.cjs
 */
const path = require('path');
const fs = require('fs');
const os = require('os');
const { KiaApiService } = require('../electron/kia-api-service.cjs');

const DEV_EMAIL = 'nandu@tuna.group';

async function main() {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pb-kia-verify-'));
  const svc = new KiaApiService(tmpDir);
  svc.configure({
    baseUrl: 'https://dev-kiaforum2026.thetunagroup.com',
    bearerToken: '',
    bypassCode: '12345',
    devBypassEmail: DEV_EMAIL,
    offlineAllowPrefix: true,
  });

  console.log('=== authenticate ===');
  const auth = await svc._authenticateEmail(DEV_EMAIL);
  console.log(JSON.stringify({ ok: auth.ok, error: auth.error }, null, 2));
  if (!auth.ok) {
    process.exitCode = 1;
    return;
  }

  console.log('\n=== bypass validate (12345 → dev QR session) ===');
  const val = await svc.validateToken('12345');
  console.log(JSON.stringify(val, null, 2));
  if (!val.valid || !val.sessionData) {
    process.exitCode = 1;
    return;
  }

  console.log('\n=== fetch frames ===');
  const fr = await svc.fetchFrames();
  console.log(
    JSON.stringify(
      {
        ok: fr.ok,
        count: fr.frames?.length,
        debug: fr.debug,
        unlocked: fr.frames?.filter((f) => f.is_unlocked === true || f.is_unlocked === 1).length,
        first: fr.frames?.[0]
          ? { id: fr.frames[0].id, name: fr.frames[0].name, thumb: !!fr.frames[0].thumbnail }
          : null,
      },
      null,
      2,
    ),
  );

  console.log('\n=== test media upload (tiny image) ===');
  const testJpg = path.join(tmpDir, 'test.jpg');
  const tiny =
    '/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////2wBDAf//////////////////////////////////////////////////////////////////////////////////////wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAX/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIQAxAAAAGfAP/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAQUCf//EABQRAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQMBAT8Bf//EABQRAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQIBAT8Bf//EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEABj8Cf//EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAT8hf//Z';
  fs.writeFileSync(testJpg, Buffer.from(tiny, 'base64'));
  const up = await svc.enqueueMedia({
    sessionToken: val.sessionData,
    imagePath: testJpg,
    guestEmail: DEV_EMAIL,
  });
  console.log('enqueue', up);
  await new Promise((r) => setTimeout(r, 3000));
  console.log('queue', svc.getUploadQueueStatus());
  console.log('lastPublish', svc._lastPublish);
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
