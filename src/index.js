import fs from 'node:fs';
import path from 'node:path';
import express from 'express';
import cors from 'cors';
import { config } from './config.js';
import { initDb, getDb, isSessionExpired } from './db.js';
import { getUploadToken } from './auth.js';
import { sessionsRouter } from './routes/sessions.js';
import { adminRouter } from './routes/admin.js';
import { framesRouter, adminFramesRouter, ensureFramesDir } from './routes/frames.js';
import { wallRouter, adminWallRouter } from './routes/wall.js';
import { purgeExpiredSessions } from './purge.js';

initDb();
ensureFramesDir();

const app = express();
app.disable('x-powered-by');
app.use(cors());
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
app.use('/api/admin/frames', adminFramesRouter);
app.use('/api/admin/wall', adminWallRouter);
app.use('/api/admin', adminRouter);

app.get('/media/frames/:filename', (req, res) => {
  const filename = path.basename(req.params.filename);
  if (filename.includes('..')) return res.status(400).end();
  const filePath = path.join(config.framesDir, filename);
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

app.listen(config.port, config.host, () => {
  console.log(
    `[moments] listening on http://${config.host}:${config.port} → ${config.publicBaseUrl}`,
  );
  if (!getUploadToken()) {
    console.warn('[moments] WARNING: UPLOAD_TOKEN is empty — set it in Admin → Settings or .env');
  }
});
