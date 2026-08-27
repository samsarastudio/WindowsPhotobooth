import fs from 'node:fs';
import path from 'node:path';
import { Router } from 'express';
import { config } from '../config.js';
import {
  getDb,
  isSessionExpired,
  loadSettings,
  publicPhoto,
  publicSession,
  saveSettings,
} from '../db.js';
import { getUploadToken, requireAdminPin } from '../auth.js';
import { purgeExpiredSessions } from '../purge.js';
import { seedSampleGallery } from '../seed-samples.js';

export const adminRouter = Router();

adminRouter.use(requireAdminPin);

function adminSettingsPayload() {
  const settings = loadSettings();
  const uploadToken = getUploadToken();
  return {
    defaultTtlDays: settings.defaultTtlDays,
    uploadToken,
    uploadTokenConfigured: !!uploadToken,
    uploadTokenSource: settings.uploadToken?.trim()
      ? 'settings'
      : config.uploadToken
        ? 'env'
        : 'none',
    publicBaseUrl: config.publicBaseUrl,
  };
}

adminRouter.get('/settings', (_req, res) => {
  res.json({ ok: true, settings: adminSettingsPayload() });
});

adminRouter.patch('/settings', (req, res) => {
  const patch = {};

  if (req.body?.defaultTtlDays !== undefined) {
    const days = Number(req.body.defaultTtlDays);
    if (!Number.isFinite(days) || days < 1 || days > 3650) {
      return res.status(400).json({ ok: false, error: 'defaultTtlDays must be 1–3650' });
    }
    patch.defaultTtlDays = Math.floor(days);
  }

  if (req.body?.uploadToken !== undefined) {
    if (typeof req.body.uploadToken !== 'string') {
      return res.status(400).json({ ok: false, error: 'uploadToken must be a string' });
    }
    const token = req.body.uploadToken.trim();
    if (token && token.length < 8) {
      return res.status(400).json({ ok: false, error: 'uploadToken must be at least 8 characters' });
    }
    patch.uploadToken = token;
  }

  if (!Object.keys(patch).length) {
    return res.status(400).json({ ok: false, error: 'No settings to update' });
  }

  saveSettings(patch);
  return res.json({ ok: true, settings: adminSettingsPayload() });
});

adminRouter.get('/sessions', (_req, res) => {
  const rows = getDb()
    .prepare('SELECT * FROM sessions ORDER BY created_at DESC')
    .all();
  const now = new Date();
  const sessions = rows.map((row) => {
    const count = getDb()
      .prepare('SELECT COUNT(*) AS c FROM photos WHERE session_id = ?')
      .get(row.id).c;
    return {
      ...publicSession(row, []),
      photoCount: count,
      expired: isSessionExpired(row, now),
    };
  });
  return res.json({ ok: true, sessions });
});

adminRouter.get('/sessions/:slug', (req, res) => {
  const row = getDb().prepare('SELECT * FROM sessions WHERE slug = ?').get(req.params.slug);
  if (!row) return res.status(404).json({ ok: false, error: 'Session not found' });
  const photos = getDb()
    .prepare('SELECT * FROM photos WHERE session_id = ? ORDER BY created_at DESC')
    .all(row.id);
  const session = {
    ...publicSession(row, photos),
    expired: isSessionExpired(row),
    photoCount: photos.length,
  };
  // Mark rows whose file is gone from disk (broken thumbnail / Open fails).
  session.photos = session.photos.map((p, i) => {
    const raw = photos[i];
    const filePath = path.join(config.photosDir, row.slug, raw.filename);
    const fileExists = fs.existsSync(filePath);
    return { ...p, fileExists, filename: raw.filename };
  });
  return res.json({ ok: true, session });
});

adminRouter.patch('/sessions/:slug', (req, res) => {
  const row = getDb().prepare('SELECT * FROM sessions WHERE slug = ?').get(req.params.slug);
  if (!row) return res.status(404).json({ ok: false, error: 'Session not found' });

  let expiresAt = row.expires_at;
  if (typeof req.body?.expiresAt === 'string' && req.body.expiresAt.trim()) {
    const d = new Date(req.body.expiresAt);
    if (Number.isNaN(d.getTime())) {
      return res.status(400).json({ ok: false, error: 'Invalid expiresAt' });
    }
    expiresAt = d.toISOString();
  } else if (typeof req.body?.ttlDays === 'number' && req.body.ttlDays > 0) {
    const d = new Date();
    d.setUTCDate(d.getUTCDate() + Math.floor(req.body.ttlDays));
    expiresAt = d.toISOString();
  }

  let title = row.title;
  if (typeof req.body?.title === 'string' && req.body.title.trim()) {
    title = req.body.title.trim();
  }

  getDb()
    .prepare('UPDATE sessions SET expires_at = ?, title = ? WHERE id = ?')
    .run(expiresAt, title, row.id);
  const updated = getDb().prepare('SELECT * FROM sessions WHERE id = ?').get(row.id);
  return res.json({ ok: true, session: publicSession(updated, []) });
});

adminRouter.delete('/sessions/:slug', (req, res) => {
  const row = getDb().prepare('SELECT * FROM sessions WHERE slug = ?').get(req.params.slug);
  if (!row) return res.status(404).json({ ok: false, error: 'Session not found' });
  getDb().prepare('DELETE FROM sessions WHERE id = ?').run(row.id);
  const dir = path.join(config.photosDir, row.slug);
  fs.rmSync(dir, { recursive: true, force: true });
  return res.json({ ok: true, removed: row.slug });
});

adminRouter.get('/sessions/:slug/photos/:photoId/file', (req, res) => {
  const row = getDb().prepare('SELECT * FROM sessions WHERE slug = ?').get(req.params.slug);
  if (!row) return res.status(404).json({ ok: false, error: 'Session not found' });
  const photo = getDb()
    .prepare('SELECT * FROM photos WHERE id = ? AND session_id = ?')
    .get(req.params.photoId, row.id);
  if (!photo) return res.status(404).json({ ok: false, error: 'Photo not found' });
  const filePath = path.join(config.photosDir, row.slug, photo.filename);
  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ ok: false, error: 'Photo file missing on disk' });
  }
  const ext = path.extname(photo.filename) || '.jpg';
  res.setHeader('Content-Type', photo.mime || 'application/octet-stream');
  res.setHeader(
    'Content-Disposition',
    `attachment; filename="${photo.variant}-${photo.id}${ext}"`,
  );
  return res.sendFile(filePath);
});

adminRouter.delete('/sessions/:slug/photos/:photoId', (req, res) => {
  const row = getDb().prepare('SELECT * FROM sessions WHERE slug = ?').get(req.params.slug);
  if (!row) return res.status(404).json({ ok: false, error: 'Session not found' });
  const photo = getDb()
    .prepare('SELECT * FROM photos WHERE id = ? AND session_id = ?')
    .get(req.params.photoId, row.id);
  if (!photo) return res.status(404).json({ ok: false, error: 'Photo not found' });
  getDb().prepare('DELETE FROM photos WHERE id = ?').run(photo.id);
  const filePath = path.join(config.photosDir, row.slug, photo.filename);
  fs.rmSync(filePath, { force: true });
  return res.json({ ok: true, removed: photo.id, photo: publicPhoto(row.slug, photo) });
});

adminRouter.post('/sessions/:slug/photos/bulk-delete', (req, res) => {
  const row = getDb().prepare('SELECT * FROM sessions WHERE slug = ?').get(req.params.slug);
  if (!row) return res.status(404).json({ ok: false, error: 'Session not found' });
  const ids = Array.isArray(req.body?.ids)
    ? [...new Set(req.body.ids.map((id) => String(id || '').trim()).filter(Boolean))]
    : [];
  if (!ids.length) {
    return res.status(400).json({ ok: false, error: 'ids array required' });
  }
  const removed = [];
  const del = getDb().prepare('DELETE FROM photos WHERE id = ? AND session_id = ?');
  const get = getDb().prepare('SELECT * FROM photos WHERE id = ? AND session_id = ?');
  for (const id of ids) {
    const photo = get.get(id, row.id);
    if (!photo) continue;
    del.run(id, row.id);
    fs.rmSync(path.join(config.photosDir, row.slug, photo.filename), { force: true });
    removed.push(id);
  }
  return res.json({ ok: true, removed, count: removed.length });
});

adminRouter.post('/purge-expired', (_req, res) => {
  const result = purgeExpiredSessions();
  return res.json({ ok: true, ...result });
});

adminRouter.post('/seed-samples', (_req, res) => {
  try {
    const result = seedSampleGallery();
    return res.json({ ok: true, ...result });
  } catch (e) {
    return res.status(500).json({ ok: false, error: e?.message || String(e) });
  }
});
