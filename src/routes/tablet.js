import { Router } from 'express';
import { nanoid } from 'nanoid';
import { config } from '../config.js';
import {
  captureFamilyKey,
  getDb,
  isSessionExpired,
  publicPhoto,
} from '../db.js';
import { requireAdminPin, requireUploadToken } from '../auth.js';
import { subscribeSession } from '../sse.js';

function todayIso(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function slugifyPrefix(raw) {
  const s = String(raw || 'session')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
  return s || 'session';
}

function getSessionBySlug(slug) {
  return getDb().prepare('SELECT * FROM sessions WHERE slug = ?').get(slug);
}

function resolveTodaySession(prefix) {
  const eventPrefix = slugifyPrefix(prefix);
  const slug = `${eventPrefix}-${todayIso()}`;
  const session = getSessionBySlug(slug);
  return { eventPrefix, slug, session };
}

function listPhotos(sessionId) {
  return getDb()
    .prepare('SELECT * FROM photos WHERE session_id = ? ORDER BY created_at DESC')
    .all(sessionId);
}

function ensurePrintJobsTable() {
  getDb().exec(`
    CREATE TABLE IF NOT EXISTS print_jobs (
      id TEXT PRIMARY KEY,
      photo_id TEXT NOT NULL,
      session_id TEXT NOT NULL,
      booth_id TEXT,
      status TEXT NOT NULL,
      created_at TEXT NOT NULL,
      claimed_at TEXT,
      done_at TEXT,
      error TEXT,
      media_url TEXT,
      layout_mode TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_print_jobs_status ON print_jobs(status, created_at);
    CREATE INDEX IF NOT EXISTS idx_print_jobs_booth ON print_jobs(booth_id, status);
  `);
}

function ensureProcessStatusColumn() {
  const cols = getDb().prepare(`PRAGMA table_info(photos)`).all();
  if (!cols.some((c) => c.name === 'process_status')) {
    getDb().exec(`ALTER TABLE photos ADD COLUMN process_status TEXT NOT NULL DEFAULT 'ready'`);
  }
}

ensurePrintJobsTable();
ensureProcessStatusColumn();

function tabletPhoto(sessionSlug, row, siblings = []) {
  const base = publicPhoto(sessionSlug, row);
  const family = captureFamilyKey(row.source_local_name, row.filename);
  const hasAi = siblings.some((p) => p.variant === 'ai');
  const hasFramed = siblings.some((p) => p.variant === 'framed');
  const processStatus =
    row.process_status === 'processing' ||
    (row.variant === 'original' && !hasAi && !hasFramed && row.process_status !== 'ready')
      ? row.process_status || 'ready'
      : row.process_status || 'ready';
  // If booth marked processing and AI/framed arrived, treat family as ready.
  const familyProcessing =
    processStatus === 'processing' && !hasAi && !hasFramed;
  const printJob = getDb()
    .prepare(
      `SELECT id, status, created_at, done_at, error FROM print_jobs
       WHERE photo_id = ? ORDER BY created_at DESC LIMIT 1`,
    )
    .get(row.id);
  return {
    ...base,
    processStatus: familyProcessing ? 'processing' : 'ready',
    familyKey: family,
    hasAi,
    hasFramed,
    printJob: printJob
      ? {
          id: printJob.id,
          status: printJob.status,
          createdAt: printJob.created_at,
          doneAt: printJob.done_at,
          error: printJob.error || null,
        }
      : null,
  };
}

export const tabletRouter = Router();
export const boothJobsRouter = Router();

/** Public tablet feed for today's album. */
tabletRouter.get('/today', (req, res) => {
  const prefix = req.query.prefix || req.query.eventPrefix || 'session';
  const { eventPrefix, slug, session } = resolveTodaySession(prefix);
  if (!session) {
    return res.json({
      ok: true,
      empty: true,
      eventPrefix,
      slug,
      date: todayIso(),
      photos: [],
      tabletUrl: `${config.publicBaseUrl}/tablet/${encodeURIComponent(eventPrefix)}`,
      message: 'No album for today yet — captures will appear after the booth uploads.',
    });
  }
  if (isSessionExpired(session)) {
    return res.status(410).json({ ok: false, error: 'Session expired', slug });
  }
  const rows = listPhotos(session.id).filter((p) => p.variant !== 'physical');
  const byFamily = new Map();
  for (const row of rows) {
    const key = captureFamilyKey(row.source_local_name, row.filename);
    if (!byFamily.has(key)) byFamily.set(key, []);
    byFamily.get(key).push(row);
  }
  // Prefer AI > framed > original for the tile hero.
  const photos = [];
  for (const siblings of byFamily.values()) {
    const preferred =
      siblings.find((p) => p.variant === 'ai') ||
      siblings.find((p) => p.variant === 'framed') ||
      siblings.find((p) => p.variant === 'original') ||
      siblings[0];
    if (preferred) photos.push(tabletPhoto(session.slug, preferred, siblings));
  }
  photos.sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
  return res.json({
    ok: true,
    empty: false,
    eventPrefix,
    slug: session.slug,
    title: session.title,
    date: session.event_date,
    photos,
    streamPath: `/api/sessions/${encodeURIComponent(session.slug)}/stream`,
    tabletUrl: `${config.publicBaseUrl}/tablet/${encodeURIComponent(eventPrefix)}`,
  });
});

tabletRouter.get('/today/stream', (req, res) => {
  const prefix = req.query.prefix || req.query.eventPrefix || 'session';
  const { session, slug } = resolveTodaySession(prefix);
  if (!session) {
    res.status(404).json({ ok: false, error: 'No album for today', slug });
    return;
  }
  if (isSessionExpired(session)) {
    return res.status(410).json({ ok: false, error: 'Session expired', slug });
  }
  subscribeSession(session.slug, res);
});

/**
 * Queue a print job for the booth kiosk.
 * Auth: admin PIN (tablet) or upload token (automation).
 */
function acceptPrintRequest(req, res) {
  const photoId = String(req.params.photoId || '').trim();
  if (!photoId) return res.status(400).json({ ok: false, error: 'Missing photo id' });
  const row = getDb().prepare('SELECT * FROM photos WHERE id = ?').get(photoId);
  if (!row) return res.status(404).json({ ok: false, error: 'Photo not found' });
  const session = getDb().prepare('SELECT * FROM sessions WHERE id = ?').get(row.session_id);
  if (!session) return res.status(404).json({ ok: false, error: 'Session not found' });

  const boothId =
    typeof req.body?.boothId === 'string' && req.body.boothId.trim()
      ? req.body.boothId.trim().slice(0, 64)
      : null;
  const layoutMode =
    row.variant === 'physical' || req.body?.layoutMode === 'physicalFrame'
      ? 'physicalFrame'
      : null;

  // Avoid duplicate queued jobs for same photo.
  const existing = getDb()
    .prepare(
      `SELECT * FROM print_jobs WHERE photo_id = ? AND status IN ('queued','claimed')
       ORDER BY created_at DESC LIMIT 1`,
    )
    .get(photoId);
  if (existing) {
    return res.json({
      ok: true,
      deduped: true,
      job: {
        id: existing.id,
        status: existing.status,
        photoId,
        boothId: existing.booth_id,
      },
    });
  }

  const photo = publicPhoto(session.slug, row);
  const id = nanoid(14);
  const now = new Date().toISOString();
  getDb()
    .prepare(
      `INSERT INTO print_jobs
       (id, photo_id, session_id, booth_id, status, created_at, media_url, layout_mode)
       VALUES (?, ?, ?, ?, 'queued', ?, ?, ?)`,
    )
    .run(id, photoId, session.id, boothId, now, photo.url, layoutMode);

  return res.status(201).json({
    ok: true,
    job: { id, status: 'queued', photoId, boothId, mediaUrl: photo.url, layoutMode },
  });
}

tabletRouter.post('/photos/:photoId/print', requireAdminPin, acceptPrintRequest);
// Allow booth/upload token as well for ops automation.
boothJobsRouter.post('/photos/:photoId/print', requireUploadToken, acceptPrintRequest);

/** Booth claims the next queued print job(s). */
boothJobsRouter.get('/print-jobs', requireUploadToken, (req, res) => {
  const boothId =
    typeof req.query.boothId === 'string' && req.query.boothId.trim()
      ? req.query.boothId.trim().slice(0, 64)
      : '';
  const limit = Math.min(5, Math.max(1, Number(req.query.limit) || 1));
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT * FROM print_jobs
       WHERE status = 'queued' AND (booth_id IS NULL OR booth_id = '' OR booth_id = ?)
       ORDER BY created_at ASC LIMIT ?`,
    )
    .all(boothId || '', limit);

  const now = new Date().toISOString();
  const jobs = [];
  for (const row of rows) {
    db.prepare(
      `UPDATE print_jobs SET status = 'claimed', claimed_at = ?, booth_id = COALESCE(NULLIF(booth_id,''), ?)
       WHERE id = ? AND status = 'queued'`,
    ).run(now, boothId || row.booth_id || 'booth', row.id);
    const photo = db.prepare('SELECT * FROM photos WHERE id = ?').get(row.photo_id);
    const session = photo
      ? db.prepare('SELECT * FROM sessions WHERE id = ?').get(photo.session_id)
      : null;
    const mediaUrl =
      row.media_url ||
      (photo && session ? publicPhoto(session.slug, photo).url : null);
    jobs.push({
      id: row.id,
      photoId: row.photo_id,
      status: 'claimed',
      mediaUrl: mediaUrl
        ? mediaUrl.startsWith('http')
          ? mediaUrl
          : `${config.publicBaseUrl}${mediaUrl}`
        : null,
      layoutMode: row.layout_mode || null,
      createdAt: row.created_at,
    });
  }
  return res.json({ ok: true, jobs });
});

boothJobsRouter.post('/print-jobs/:jobId/ack', requireUploadToken, (req, res) => {
  const jobId = String(req.params.jobId || '').trim();
  const status = String(req.body?.status || '').toLowerCase();
  if (!jobId) return res.status(400).json({ ok: false, error: 'Missing job id' });
  if (status !== 'done' && status !== 'error') {
    return res.status(400).json({ ok: false, error: 'status must be done|error' });
  }
  const row = getDb().prepare('SELECT * FROM print_jobs WHERE id = ?').get(jobId);
  if (!row) return res.status(404).json({ ok: false, error: 'Job not found' });
  const now = new Date().toISOString();
  const error = status === 'error' ? String(req.body?.error || 'Print failed').slice(0, 500) : null;
  getDb()
    .prepare(
      `UPDATE print_jobs SET status = ?, done_at = ?, error = ? WHERE id = ?`,
    )
    .run(status === 'done' ? 'done' : 'error', now, error, jobId);
  return res.json({ ok: true, job: { id: jobId, status: status === 'done' ? 'done' : 'error' } });
});
