'use strict';

/**
 * Upload matrix: dev + live × normal (online) + queue (offline enqueue → online sync).
 * Usage: node scripts/test-upload-matrix.cjs
 */
const path = require('path');
const fs = require('fs');
const os = require('os');
const { KiaApiService } = require('../electron/kia-api-service.cjs');

const DEV_EMAIL = 'nandu@tuna.group';
const APIS = {
  dev: 'https://dev-kiaforum2026.thetunagroup.com',
  live: 'https://admin.kiaexperience.info',
};

const PHOTOS = {
  devNormal: path.join(__dirname, '..', '..', 'Image Assets', 'Phone tab back.png'),
  devQueue: path.join(__dirname, '..', '..', 'Image Assets', 'Phone.png'),
  liveNormal: path.join(__dirname, '..', 'public', 'kia', 'photo.jpg'),
  liveQueue: path.join(__dirname, '..', '..', 'Image Assets', 'BackdropMain.png'),
};

function mockNet(online) {
  require('module').Module._cache[require.resolve('electron')] = {
    exports: { net: { isOnline: () => online } },
  };
}

function makeSvc(label) {
  const dataDir = path.join(__dirname, 'api-test-output', `upload-matrix-${label}-${Date.now()}`);
  fs.mkdirSync(dataDir, { recursive: true });
  const svc = new KiaApiService(dataDir);
  svc.configure({
    baseUrl: APIS[label.startsWith('dev') ? 'dev' : 'live'],
    bearerToken: '',
    bypassCode: '12345',
    devBypassEmail: DEV_EMAIL,
    offlineAllowPrefix: true,
    qrPrefix: 'KIA-PHOTO-',
  });
  return svc;
}

async function getSession(svc) {
  mockNet(true);
  const val = await svc.validateToken('12345');
  if (!val.valid || !val.sessionData) {
    throw new Error(val.error || 'Could not create dev booth session');
  }
  return { sessionToken: val.sessionData, guestEmail: val.email || DEV_EMAIL, qr: val.sessionData };
}

async function waitForDrain(svc, uploadId, maxMs = 45000) {
  const start = Date.now();
  while (Date.now() - start < maxMs) {
    await svc.processQueue();
    const q = svc.getUploadQueueStatus();
    const item = q.items.find((i) => i.id === uploadId);
    if (!item && svc._lastPublish?.id === uploadId) {
      return { ok: true, publish: svc._lastPublish };
    }
    if (!item && q.pending === 0 && svc._lastPublish) {
      return { ok: true, publish: svc._lastPublish };
    }
    await new Promise((r) => setTimeout(r, 400));
  }
  return { ok: false, queue: svc.getUploadQueueStatus(), lastPublish: svc._lastPublish };
}

async function testNormal(apiKey, photoKey) {
  const label = `${apiKey}-normal`;
  const imagePath = PHOTOS[photoKey];
  if (!fs.existsSync(imagePath)) throw new Error(`Missing photo: ${imagePath}`);

  const svc = makeSvc(label);
  mockNet(true);
  const session = await getSession(svc);

  const enq = await svc.enqueueMedia({
    sessionToken: session.sessionToken,
    scannedQrToken: session.qr,
    pendingValidate: false,
    imagePath,
    guestEmail: session.guestEmail,
  });
  if (!enq.ok) throw new Error(enq.error || 'enqueue failed');

  const done = await waitForDrain(svc, enq.uploadId);
  return {
    label,
    api: APIS[apiKey],
    mode: 'normal-online',
    photo: path.basename(imagePath),
    enqueue: enq,
    ok: done.ok,
    message: done.publish?.response?.message,
    filePath: done.publish?.response?.data?.file_path,
    mediaId: done.publish?.response?.data?.id,
    queuePending: done.queue?.pending,
    error: done.queue?.items?.[0]?.lastError,
  };
}

async function testQueue(apiKey, photoKey) {
  const label = `${apiKey}-queue`;
  const imagePath = PHOTOS[photoKey];
  if (!fs.existsSync(imagePath)) throw new Error(`Missing photo: ${imagePath}`);

  const svc = makeSvc(label);

  // Step 1: get real QR while online (simulates prior registration)
  mockNet(true);
  const session = await getSession(svc);

  // Step 2: offline scan + enqueue
  mockNet(false);
  const offlineVal = await svc.validateToken(session.qr);
  if (!offlineVal.valid || !offlineVal.offline) {
    throw new Error('Offline QR validation did not activate');
  }

  const enq = await svc.enqueueMedia({
    sessionToken: session.qr,
    scannedQrToken: session.qr,
    pendingValidate: true,
    imagePath,
    guestEmail: session.guestEmail,
  });
  if (!enq.ok) throw new Error(enq.error || 'offline enqueue failed');

  const qOffline = svc.getUploadQueueStatus();
  if (qOffline.pending !== 1) throw new Error(`Expected 1 queued item, got ${qOffline.pending}`);

  // Step 3: back online → sync
  mockNet(true);
  svc._sessionBearer = '';
  const done = await waitForDrain(svc, enq.uploadId);

  return {
    label,
    api: APIS[apiKey],
    mode: 'queue-offline-then-sync',
    photo: path.basename(imagePath),
    offlineValidate: { valid: offlineVal.valid, offline: offlineVal.offline },
    enqueue: enq,
    ok: done.ok,
    message: done.publish?.response?.message,
    filePath: done.publish?.response?.data?.file_path,
    mediaId: done.publish?.response?.data?.id,
    queuePending: done.queue?.pending,
    error: done.queue?.items?.[0]?.lastError,
  };
}

async function main() {
  for (const p of Object.values(PHOTOS)) {
    if (!fs.existsSync(p)) {
      console.error('Missing test photo:', p);
      process.exitCode = 1;
      return;
    }
  }

  const tests = [
    () => testNormal('dev', 'devNormal'),
    () => testQueue('dev', 'devQueue'),
    () => testNormal('live', 'liveNormal'),
    () => testQueue('live', 'liveQueue'),
  ];

  const results = [];
  for (const run of tests) {
    const name = run.name || 'test';
    process.stdout.write(`Running ${name}…\n`);
    try {
      const r = await run();
      results.push(r);
      console.log(JSON.stringify(r, null, 2));
      console.log('---');
    } catch (e) {
      const err = { ok: false, error: String(e.message || e) };
      results.push(err);
      console.error(JSON.stringify(err, null, 2));
      console.log('---');
    }
  }

  const passed = results.filter((r) => r.ok).length;
  const failed = results.length - passed;
  console.log(`\nSUMMARY: ${passed}/${results.length} passed, ${failed} failed`);
  if (failed > 0) process.exitCode = 1;
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
