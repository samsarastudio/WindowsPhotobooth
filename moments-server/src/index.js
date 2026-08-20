import fs from 'node:fs';
import http from 'node:http';
import https from 'node:https';
import path from 'node:path';
import express from 'express';
import cors from 'cors';
import { config } from './config.js';
import { initDb, getDb, isSessionExpired } from './db.js';
import { getUploadToken } from './auth.js';
import { sessionsRouter } from './routes/sessions.js';
import { adminRouter } from './routes/admin.js';
import { framesRouter, adminFramesRouter, ensureFramesDir } from './routes/frames.js';
import { wallRouter, adminWallRouter, ensureBrandingDir } from './routes/wall.js';
import { qrRouter, adminQrRouter } from './routes/qr.js';
import { ensureQrDirs } from './qr/store.js';
import { purgeExpiredSessions } from './purge.js';
import { ensureHttpsCerts } from './https-certs.js';

initDb();
ensureFramesDir();
ensureBrandingDir();
ensureQrDirs();

const app = express();
app.disable('x-powered-by');
app.use(cors());
app.use((_req, res, next) => {
  res.setHeader('Permissions-Policy', 'camera=(self), microphone=()');
  next();
});
app.use(express.json({ limit: '1mb' }));

app.get('/api/health', (_req, res) => {
  res.json({
    ok: true,
    service: 'moments-server',
    port: config.port,
    publicBaseUrl: config.publicBaseUrl,
  });
});

app.use('/api/sessions', sessionsRouter);
app.use('/api/frames', framesRouter);
app.use('/api/wall', wallRouter);
app.use('/api/qr', qrRouter);
app.use('/api/admin/frames', adminFramesRouter);
app.use('/api/admin/wall', adminWallRouter);
app.use('/api/admin/qr', adminQrRouter);
app.use('/api/admin', adminRouter);

app.get('/media/frames/:filename', (req, res) => {
  const filename = path.basename(req.params.filename);
  if (filename.includes('..')) return res.status(400).end();
  const filePath = path.join(config.framesDir, filename);
  if (!fs.existsSync(filePath)) return res.status(404).end();
  res.setHeader('Cache-Control', 'public, max-age=3600');
  return res.sendFile(filePath);
});

app.get('/media/branding/:filename', (req, res) => {
  const filename = path.basename(req.params.filename);
  if (filename.includes('..')) return res.status(400).end();
  const filePath = path.join(config.brandingDir, filename);
  if (!fs.existsSync(filePath)) return res.status(404).end();
  res.setHeader('Cache-Control', 'public, max-age=3600');
  return res.sendFile(filePath);
});

app.get('/media/qr-frames/:filename', (req, res) => {
  const filename = path.basename(req.params.filename);
  if (filename.includes('..')) return res.status(400).end();
  const filePath = path.join(config.qrFramesDir, filename);
  if (!fs.existsSync(filePath)) return res.status(404).end();
  res.setHeader('Cache-Control', 'public, max-age=3600');
  return res.sendFile(filePath);
});

app.get('/media/:slug/:filename', (req, res) => {
  const slug = path.basename(req.params.slug);
  const filename = path.basename(req.params.filename);
  if (filename.includes('..') || slug.includes('..')) {
    return res.status(400).end();
  }
  const session = getDb().prepare('SELECT * FROM sessions WHERE slug = ?').get(slug);
  if (!session) return res.status(404).end();
  if (isSessionExpired(session)) return res.status(410).end();
  const filePath = path.join(config.photosDir, slug, filename);
  if (!fs.existsSync(filePath)) return res.status(404).end();
  res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
  return res.sendFile(filePath);
});

app.use(express.static(config.publicDir, { index: false, maxAge: '1h' }));

app.get(['/admin', '/admin/*'], (_req, res) => {
  res.sendFile(path.join(config.publicDir, 'admin.html'));
});

app.get(['/qr-scan', '/qr-scan/*'], (_req, res) => {
  res.sendFile(path.join(config.publicDir, 'qr-scan.html'));
});

app.get(['/q', '/q/:code'], (_req, res) => {
  res.sendFile(path.join(config.publicDir, 'q.html'));
});

app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api') || req.path.startsWith('/media')) return next();
  res.sendFile(path.join(config.publicDir, 'index.html'));
});

app.use((err, _req, res, _next) => {
  console.error('[moments]', err);
  res.status(500).json({ ok: false, error: err?.message || 'Server error' });
});

const PURGE_MS = 6 * 60 * 60 * 1000;
setInterval(() => {
  try {
    const r = purgeExpiredSessions();
    if (r.sessionsRemoved) {
      console.log(`[moments] purged ${r.sessionsRemoved} sessions, ${r.photosRemoved} photos`);
    }
  } catch (e) {
    console.error('[moments] purge failed', e);
  }
}, PURGE_MS);
purgeExpiredSessions();

function lanHostsFromPublicUrl() {
  try {
    const u = new URL(config.publicBaseUrl);
    return [u.hostname];
  } catch {
    return [];
  }
}

const onListen = () => {
  const scheme = config.https ? 'https' : 'http';
  console.log(
    `[moments] listening on ${scheme}://${config.host}:${config.port} → ${config.publicBaseUrl}`,
  );
  if (config.https) {
    console.log(
      '[moments] Phone camera needs HTTPS. On first visit, accept the certificate warning, then tap Enable camera.',
    );
  }
  if (!getUploadToken()) {
    console.warn('[moments] WARNING: UPLOAD_TOKEN is empty — set it in Admin → Settings or .env');
  }
};

if (config.https) {
  const { key, cert } = await ensureHttpsCerts(lanHostsFromPublicUrl());
  https.createServer({ key, cert }, app).listen(config.port, config.host, onListen);
} else {
  http.createServer(app).listen(config.port, config.host, onListen);
}
