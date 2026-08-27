import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { customAlphabet } from 'nanoid';
import { config } from '../config.js';
import { getDb, isSessionExpired, publicPhoto, selectDisplayPhotos, loadSettings } from '../db.js';

const codeAlphabet = customAlphabet('23456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz', 8);

export function ensureQrDirs() {
  fs.mkdirSync(config.qrPdfsDir, { recursive: true });
  fs.mkdirSync(config.qrFramesDir, { recursive: true });
  fs.mkdirSync(config.builtinQrFramesDir, { recursive: true });
}

export function dayKey(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function hashIp(ip) {
  if (!ip) return '';
  return crypto.createHash('sha256').update(String(ip)).digest('hex').slice(0, 16);
}

export function previewUrlForCode(code) {
  return `${config.publicBaseUrl}/q/${encodeURIComponent(code)}`;
}

export function newQrCodeValue() {
  return codeAlphabet();
}

export function getActiveTemplateId() {
  const db = getDb();
  const settings = JSON.parse(
    fs.existsSync(config.settingsPath) ? fs.readFileSync(config.settingsPath, 'utf8') : '{}',
  );
  if (settings.activeQrTemplateId) {
    const t = db.prepare('SELECT id FROM qr_templates WHERE id = ?').get(settings.activeQrTemplateId);
    if (t) return t.id;
  }
  const builtin = db.prepare(`SELECT id FROM qr_templates WHERE source = 'builtin' LIMIT 1`).get();
  return builtin?.id || null;
}

export function setActiveTemplateId(id) {
  const cur = fs.existsSync(config.settingsPath)
    ? JSON.parse(fs.readFileSync(config.settingsPath, 'utf8'))
    : {};
  cur.activeQrTemplateId = id;
  fs.writeFileSync(config.settingsPath, JSON.stringify(cur, null, 2), 'utf8');
}

export function templateFilePath(template) {
  if (!template) return null;
  if (template.source === 'builtin') {
    return path.join(config.builtinQrFramesDir, template.filename);
  }
  return path.join(config.qrFramesDir, template.filename);
}

export function listTemplates() {
  const activeId = getActiveTemplateId();
  return getDb()
    .prepare('SELECT * FROM qr_templates ORDER BY source ASC, created_at DESC')
    .all()
    .map((t) => ({
      id: t.id,
      name: t.name,
      filename: t.filename,
      source: t.source,
      createdAt: t.created_at,
      active: t.id === activeId,
      url:
        t.source === 'builtin'
          ? `/qr-frames/${encodeURIComponent(t.filename)}`
          : `/media/qr-frames/${encodeURIComponent(t.filename)}`,
    }));
}

export function batchStats(batchId, sessionEpoch) {
  const db = getDb();
  const batch = db.prepare('SELECT * FROM qr_batches WHERE id = ?').get(batchId);
  if (!batch) return null;
  const epoch = sessionEpoch ?? batch.session_epoch;
  const scanned = db
    .prepare(
      `SELECT COUNT(*) AS c FROM qr_codes
       WHERE batch_id = ? AND session_epoch = ? AND status = 'scanned'`,
    )
    .get(batchId, epoch).c;
  const linked = db
    .prepare(
      `SELECT COUNT(*) AS c FROM qr_codes
       WHERE batch_id = ? AND session_epoch = ? AND attached_photo_id IS NOT NULL`,
    )
    .get(batchId, epoch).c;
  const voided = db
    .prepare(`SELECT COUNT(*) AS c FROM qr_codes WHERE batch_id = ? AND status = 'void'`)
    .get(batchId).c;
  const total = batch.quantity;
  const remaining = Math.max(0, total - scanned - voided);
  return {
    scanned,
    total,
    remaining,
    linked,
    voided,
    sessionEpoch: epoch,
  };
}

export function resolveLinkedAlbum(sessionId) {
  if (!sessionId) return null;
  const db = getDb();
  const session = db.prepare('SELECT * FROM sessions WHERE id = ?').get(sessionId);
  if (!session) return null;
  const expired = isSessionExpired(session);
  const photoCount = selectDisplayPhotos(
    db.prepare(`SELECT * FROM photos WHERE session_id = ?`).all(session.id),
    { includeOriginals: loadSettings().showOriginalPhotos !== false },
  ).length;
  return {
    id: session.id,
    slug: session.slug,
    title: session.title,
    galleryUrl: `${config.publicBaseUrl}/${encodeURIComponent(session.slug)}`,
    expired,
    photoCount,
  };
}

export function publicBatch(row, withStats = true) {
  const stats = withStats ? batchStats(row.id, row.session_epoch) : null;
  const linkedAlbum = resolveLinkedAlbum(row.linked_session_id);
  return {
    id: row.id,
    name: row.name,
    eventLabel: row.event_label || '',
    quantity: row.quantity,
    status: row.status,
    paperSize: row.paper_size,
    templateId: row.template_id,
    notes: row.notes || '',
    featured: !!row.featured,
    createdAt: row.created_at,
    activatedAt: row.activated_at,
    pdfFilename: row.pdf_filename,
    sessionEpoch: row.session_epoch,
    linkedSessionId: row.linked_session_id || null,
    linkedAlbum,
    previewBaseUrl: `${config.publicBaseUrl}/q/`,
    attendantUrl: `${config.publicBaseUrl}/qr-scan?batch=${encodeURIComponent(row.id)}`,
    stats,
  };
}

export function recentScans(batchId, limit = 8) {
  const db = getDb();
  const batch = db.prepare('SELECT session_epoch FROM qr_batches WHERE id = ?').get(batchId);
  if (!batch) return [];
  return db
    .prepare(
      `SELECT s.scanned_at AS scannedAt, s.result AS result, c.code AS code, c.serial AS serial
       FROM qr_scans s
       JOIN qr_codes c ON c.id = s.code_id
       WHERE s.batch_id = ? AND s.session_epoch = ?
       ORDER BY s.scanned_at DESC
       LIMIT ?`,
    )
    .all(batchId, batch.session_epoch, limit);
}

export function livePayload(batchId) {
  const db = getDb();
  let batch = null;
  if (batchId) {
    batch = db.prepare('SELECT * FROM qr_batches WHERE id = ?').get(batchId);
  }
  if (!batch) {
    batch = db
      .prepare(
        `SELECT * FROM qr_batches WHERE status = 'active'
         ORDER BY featured DESC, activated_at DESC, created_at DESC LIMIT 1`,
      )
      .get();
  }
  if (!batch) {
    const active = db
      .prepare(`SELECT * FROM qr_batches WHERE status = 'active' ORDER BY created_at DESC`)
      .all()
      .map((b) => publicBatch(b));
    return {
      ok: true,
      event: null,
      scanned: 0,
      total: 0,
      remaining: 0,
      linked: 0,
      recent: [],
      activeEvents: active,
    };
  }
  const stats = batchStats(batch.id, batch.session_epoch);
  const activeEvents = db
    .prepare(`SELECT * FROM qr_batches WHERE status = 'active' ORDER BY featured DESC, name ASC`)
    .all()
    .map((b) => publicBatch(b, false));
  return {
    ok: true,
    event: {
      id: batch.id,
      name: batch.name,
      eventLabel: batch.event_label || '',
      status: batch.status,
    },
    scanned: stats.scanned,
    total: stats.total,
    remaining: stats.remaining,
    linked: stats.linked,
    recent: recentScans(batch.id),
    activeEvents,
  };
}

export function resolveAttachedPhoto(photoId) {
  if (!photoId) return null;
  const db = getDb();
  const photo = db.prepare('SELECT * FROM photos WHERE id = ?').get(photoId);
  if (!photo) return null;
  const session = db.prepare('SELECT * FROM sessions WHERE id = ?').get(photo.session_id);
  if (!session) return null;
  return publicPhoto(session.slug, photo);
}

export function extractCodeFromInput(raw) {
  const s = String(raw || '').trim();
  if (!s) return '';
  try {
    if (s.includes('/q/')) {
      const u = new URL(s, config.publicBaseUrl);
      const parts = u.pathname.split('/').filter(Boolean);
      const i = parts.indexOf('q');
      if (i >= 0 && parts[i + 1]) return decodeURIComponent(parts[i + 1]);
    }
  } catch {
    /* plain code */
  }
  const m = s.match(/\/q\/([A-Za-z0-9_-]+)/);
  if (m) return m[1];
  return s.replace(/[^A-Za-z0-9_-]/g, '');
}

/** Simple in-memory rate limit: max N hits per IP per window. */
const rateBuckets = new Map();
export function rateLimit(key, max = 60, windowMs = 60_000) {
  const now = Date.now();
  let b = rateBuckets.get(key);
  if (!b || now - b.start > windowMs) {
    b = { start: now, count: 0 };
    rateBuckets.set(key, b);
  }
  b.count += 1;
  return b.count <= max;
}
