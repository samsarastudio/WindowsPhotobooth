import fs from 'node:fs';
import path from 'node:path';
import { nanoid } from 'nanoid';
import multer from 'multer';
import { Router } from 'express';
import { config } from '../config.js';
import {
  getDb,
  isSessionExpired,
  loadSettings,
  publicPhoto,
  publicSession,
  selectDisplayPhotos,
} from '../db.js';
import { requireUploadToken } from '../auth.js';
import { broadcastPhotoAdded, subscribeSession } from '../sse.js';
import { notifyWallPhoto } from './wall.js';

const VARIANTS = new Set(['original', 'framed', 'ai']);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024 },
});

function slugifyPrefix(raw) {
  const s = String(raw || 'session')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
  return s || 'session';
}

function todayIso(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function addDaysIso(from, days) {
  const d = new Date(from);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString();
}

function getSessionBySlug(slug) {
  return getDb().prepare('SELECT * FROM sessions WHERE slug = ?').get(slug);
}

function listPhotos(sessionId) {
  return getDb()
    .prepare('SELECT * FROM photos WHERE session_id = ? ORDER BY created_at ASC')
    .all(sessionId);
}

/** Guest-facing: framed + AI; originals when admin enables Show non-framed photos. */
function listPublicPhotos(sessionId) {
  return selectDisplayPhotos(listPhotos(sessionId), {
    includeOriginals: loadSettings().showOriginalPhotos !== false,
  });
}

export const sessionsRouter = Router();

sessionsRouter.put('/day', requireUploadToken, (req, res) => {
  const eventPrefix = slugifyPrefix(req.body?.eventPrefix || req.body?.prefix || 'session');
  const eventDate =
    typeof req.body?.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(req.body.date)
      ? req.body.date
      : todayIso();
  const slug = `${eventPrefix}-${eventDate}`;
  const title =
    typeof req.body?.title === 'string' && req.body.title.trim()
      ? req.body.title.trim()
      : `Moments ${eventDate}`;
  const theme = typeof req.body?.theme === 'string' ? req.body.theme : 'inmoment';
  const settings = loadSettings();
  const now = new Date();
  const db = getDb();
  const existing = getSessionBySlug(slug);

  if (existing) {
    if (isSessionExpired(existing, now)) {
      return res.status(410).json({ ok: false, error: 'Session expired', slug });
    }
    return res.json({ ok: true, session: publicSession(existing, listPhotos(existing.id)) });
  }

  const row = {
    id: nanoid(12),
    slug,
    title,
    event_date: eventDate,
    created_at: now.toISOString(),
    expires_at: addDaysIso(now, settings.defaultTtlDays),
    theme,
  };
  db.prepare(
    `INSERT INTO sessions (id, slug, title, event_date, created_at, expires_at, theme)
     VALUES (@id, @slug, @title, @event_date, @created_at, @expires_at, @theme)`,
  ).run(row);

  return res.status(201).json({ ok: true, session: publicSession(row, []) });
});

sessionsRouter.get('/:slug', (req, res) => {
  const session = getSessionBySlug(req.params.slug);
  if (!session) return res.status(404).json({ ok: false, error: 'Session not found' });
  const wantId = String(req.query.photoId || req.query.p || '').trim();
  // Share deep-links (?photoId=) must work past album TTL; full album still blocks when expired.
  if (isSessionExpired(session) && !wantId) {
    return res.status(410).json({ ok: false, error: 'Session expired' });
  }
  const photos = wantId && isSessionExpired(session) ? [] : listPublicPhotos(session.id);
  // Share deep-link: include this photo even when filtered from the public gallery list.
  if (wantId && !photos.some((p) => p.id === wantId)) {
    const row = getDb()
      .prepare('SELECT * FROM photos WHERE id = ? AND session_id = ?')
      .get(wantId, session.id);
    if (row) photos.push(row);
  }
  return res.json({ ok: true, session: publicSession(session, photos) });
});

/** Single photo for share/QR deep links (any variant, including plain originals). */
sessionsRouter.get('/:slug/photos/:photoId', (req, res) => {
  const session = getSessionBySlug(req.params.slug);
  if (!session) return res.status(404).json({ ok: false, error: 'Session not found' });
  // Share links stay valid after TTL while the file remains on disk.
  const row = getDb()
    .prepare('SELECT * FROM photos WHERE id = ? AND session_id = ?')
    .get(req.params.photoId, session.id);
  if (!row) return res.status(404).json({ ok: false, error: 'Photo not found' });
  return res.json({ ok: true, photo: publicPhoto(session.slug, row) });
});

sessionsRouter.get('/:slug/stream', (req, res) => {
  const session = getSessionBySlug(req.params.slug);
  if (!session) return res.status(404).json({ ok: false, error: 'Session not found' });
  if (isSessionExpired(session)) {
    return res.status(410).json({ ok: false, error: 'Session expired' });
  }
  subscribeSession(session.slug, res);
});

sessionsRouter.post(
  '/:slug/photos',
  requireUploadToken,
  upload.single('photo'),
  (req, res) => {
    const session = getSessionBySlug(req.params.slug);
    if (!session) return res.status(404).json({ ok: false, error: 'Session not found' });
    if (isSessionExpired(session)) {
      return res.status(410).json({ ok: false, error: 'Session expired' });
    }
    if (!req.file?.buffer?.length) {
      return res.status(400).json({ ok: false, error: 'Missing photo file (field: photo)' });
    }
    const variant = String(req.body?.variant || 'original').toLowerCase();
    if (!VARIANTS.has(variant)) {
      return res.status(400).json({ ok: false, error: 'variant must be original|framed|ai' });
    }

    const width = req.body?.width ? Number(req.body.width) : null;
    const height = req.body?.height ? Number(req.body.height) : null;
    const sourceLocalName = String(req.body?.sourceLocalName || req.file.originalname || '').trim() || null;

    // Dedupe: same local capture filename + variant in this session → return existing.
    if (sourceLocalName) {
      const existing = getDb()
        .prepare(
          `SELECT * FROM photos
           WHERE session_id = ? AND variant = ? AND source_local_name = ?
           ORDER BY created_at DESC LIMIT 1`,
        )
        .get(session.id, variant, sourceLocalName);
      if (existing) {
        const photo = publicPhoto(session.slug, existing);
        return res.json({ ok: true, photo, deduped: true });
      }
    }

    const id = nanoid(14);
    const mime = req.file.mimetype || 'image/jpeg';
    const ext =
      mime.includes('png') ? '.png' : mime.includes('webp') ? '.webp' : '.jpg';
    const filename = `${id}${ext}`;
    const sessionDir = path.join(config.photosDir, session.slug);
    fs.mkdirSync(sessionDir, { recursive: true });
    const dest = path.join(sessionDir, filename);
    fs.writeFileSync(dest, req.file.buffer);

    const row = {
      id,
      session_id: session.id,
      variant,
      filename,
      mime,
      bytes: req.file.buffer.length,
      source_local_name: sourceLocalName,
      width: Number.isFinite(width) ? width : null,
      height: Number.isFinite(height) ? height : null,
      created_at: new Date().toISOString(),
    };
    getDb()
      .prepare(
        `INSERT INTO photos
         (id, session_id, variant, filename, mime, bytes, source_local_name, width, height, created_at)
         VALUES
         (@id, @session_id, @variant, @filename, @mime, @bytes, @source_local_name, @width, @height, @created_at)`,
      )
      .run(row);

    const photo = publicPhoto(session.slug, row);
    const showOriginals = loadSettings().showOriginalPhotos !== false;
    const pushLive = variant !== 'original' || showOriginals;
    if (pushLive) {
      broadcastPhotoAdded(session.slug, photo);
      notifyWallPhoto({
        ...photo,
        sessionSlug: session.slug,
        sessionTitle: session.title,
      });
    }
    return res.status(201).json({ ok: true, photo });
  },
);
