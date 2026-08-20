import fs from 'node:fs';
import path from 'node:path';
import { Router } from 'express';
import multer from 'multer';
import { nanoid } from 'nanoid';
import { config } from '../config.js';
import { getDb } from '../db.js';
import { requireAdminPin } from '../auth.js';
import { createBatchRecord, generateBatchPdf, pagesEstimate } from '../qr/pdf-batch.js';
import {
  batchStats,
  dayKey,
  ensureQrDirs,
  extractCodeFromInput,
  getActiveTemplateId,
  hashIp,
  listTemplates,
  livePayload,
  publicBatch,
  rateLimit,
  recentScans,
  resolveAttachedPhoto,
  resolveLinkedAlbum,
  setActiveTemplateId,
  templateFilePath,
} from '../qr/store.js';
import { isSessionExpired } from '../db.js';

ensureQrDirs();

export const qrRouter = Router();
export const adminQrRouter = Router();
adminQrRouter.use(requireAdminPin);

const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => {
      ensureQrDirs();
      cb(null, config.qrFramesDir);
    },
    filename: (_req, file, cb) => {
      const ext = path.extname(file.originalname || '').toLowerCase() || '.png';
      cb(null, `upload-${nanoid(8)}${ext}`);
    },
  }),
  limits: { fileSize: 8 * 1024 * 1024 },
});

function clientIp(req) {
  return req.ip || req.socket?.remoteAddress || '';
}

/** Public live stats for attendant page */
qrRouter.get('/live', (req, res) => {
  const batchId = req.query.batchId || req.query.batch || '';
  return res.json(livePayload(batchId || null));
});

qrRouter.get('/stats/today', (_req, res) => {
  const db = getDb();
  const key = dayKey();
  const totalScans = db
    .prepare(`SELECT COUNT(*) AS c FROM qr_scans WHERE day_key = ? AND result = 'valid'`)
    .get(key).c;
  const uniqueCodes = db
    .prepare(
      `SELECT COUNT(DISTINCT code_id) AS c FROM qr_scans WHERE day_key = ? AND result = 'valid'`,
    )
    .get(key).c;
  return res.json({ ok: true, dayKey: key, totalScans, uniqueCodes });
});

qrRouter.get('/preview/:code', (req, res) => {
  const code = extractCodeFromInput(req.params.code);
  const db = getDb();
  const row = db.prepare('SELECT * FROM qr_codes WHERE code = ?').get(code);
  if (!row) {
    return res.json({
      ok: true,
      found: false,
      status: 'unknown',
      message: 'This card is not recognized.',
      photo: null,
      eventLabel: '',
    });
  }
  const batch = db.prepare('SELECT * FROM qr_batches WHERE id = ?').get(row.batch_id);
  if (!batch || batch.status === 'archived') {
    return res.json({
      ok: true,
      found: true,
      status: 'inactive',
      message: 'This event card is no longer active.',
      photo: null,
      eventLabel: batch?.event_label || batch?.name || '',
    });
  }
  const photo = resolveAttachedPhoto(row.attached_photo_id);
  const linkedAlbum = resolveLinkedAlbum(batch.linked_session_id);
  if (photo) {
    return res.json({
      ok: true,
      found: true,
      status: 'linked',
      message: '',
      photo,
      eventLabel: batch.event_label || batch.name,
      serial: row.serial,
      linkedAlbum,
    });
  }
  return res.json({
    ok: true,
    found: true,
    status: 'waiting',
    message: linkedAlbum
      ? 'Get your photo taken, then open the gallery and tap Link my card'
      : 'Get your photo taken — it will appear here',
    photo: null,
    eventLabel: batch.event_label || batch.name,
    serial: row.serial,
    linkedAlbum,
  });
});

qrRouter.post('/scan', (req, res) => {
  const ip = clientIp(req);
  if (!rateLimit(`scan:${ip}`, 120, 60_000)) {
    return res.status(429).json({ ok: false, error: 'Too many scans — slow down' });
  }
  const code = extractCodeFromInput(req.body?.code);
  if (!code) return res.status(400).json({ ok: false, error: 'code required' });

  const db = getDb();
  const now = new Date();
  const nowIso = now.toISOString();
  const row = db.prepare('SELECT * FROM qr_codes WHERE code = ?').get(code);

  const respond = (result, extra = {}) => {
    const batch = row
      ? db.prepare('SELECT * FROM qr_batches WHERE id = ?').get(row.batch_id)
      : null;
    const stats = batch ? batchStats(batch.id, batch.session_epoch) : null;
    return res.json({
      ok: true,
      result,
      scannedAt: extra.scannedAt || null,
      event: batch
        ? { id: batch.id, name: batch.name, eventLabel: batch.event_label || '' }
        : null,
      stats,
      serial: row?.serial ?? null,
      quantity: batch?.quantity ?? null,
      code: code,
      recent: batch ? recentScans(batch.id) : [],
    });
  };

  if (!row) {
    return respond('unknown');
  }
  if (row.status === 'void') {
    return respond('inactive');
  }

  const batch = db.prepare('SELECT * FROM qr_batches WHERE id = ?').get(row.batch_id);
  if (!batch || batch.status !== 'active') {
    return respond('inactive');
  }

  if (row.status === 'scanned' && row.session_epoch === batch.session_epoch) {
    db.prepare(
      `INSERT INTO qr_scans (id, code_id, batch_id, day_key, scanned_at, user_agent, ip_hash, result, session_epoch)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'already', ?)`,
    ).run(
      nanoid(12),
      row.id,
      batch.id,
      dayKey(now),
      nowIso,
      String(req.get('user-agent') || '').slice(0, 240),
      hashIp(ip),
      batch.session_epoch,
    );
    return respond('already', { scannedAt: row.scanned_at });
  }

  db.prepare(
    `UPDATE qr_codes SET status = 'scanned', scanned_at = ?, session_epoch = ? WHERE id = ?`,
  ).run(nowIso, batch.session_epoch, row.id);
  db.prepare(
    `INSERT INTO qr_scans (id, code_id, batch_id, day_key, scanned_at, user_agent, ip_hash, result, session_epoch)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'valid', ?)`,
  ).run(
    nanoid(12),
    row.id,
    batch.id,
    dayKey(now),
    nowIso,
    String(req.get('user-agent') || '').slice(0, 240),
    hashIp(ip),
    batch.session_epoch,
  );

  return respond('valid', { scannedAt: nowIso });
});

qrRouter.post('/attach', (req, res) => {
  const ip = clientIp(req);
  if (!rateLimit(`attach:${ip}`, 40, 60_000)) {
    return res.status(429).json({ ok: false, error: 'Too many attempts' });
  }
  const code = extractCodeFromInput(req.body?.code);
  const photoId = String(req.body?.photoId || '').trim();
  if (!code || !photoId) {
    return res.status(400).json({ ok: false, error: 'code and photoId required' });
  }

  const db = getDb();
  const photo = db.prepare('SELECT * FROM photos WHERE id = ?').get(photoId);
  if (!photo || photo.variant === 'original') {
    return res.status(404).json({ ok: false, error: 'Photo not found' });
  }
  const row = db.prepare('SELECT * FROM qr_codes WHERE code = ?').get(code);
  if (!row) return res.status(404).json({ ok: false, error: 'Card not found' });
  if (row.status === 'void') {
    return res.status(400).json({ ok: false, error: 'This card is voided' });
  }
  const batch = db.prepare('SELECT * FROM qr_batches WHERE id = ?').get(row.batch_id);
  if (!batch || batch.status === 'archived') {
    return res.status(400).json({ ok: false, error: 'Event is not available' });
  }

  if (batch.linked_session_id && photo.session_id !== batch.linked_session_id) {
    const album = resolveLinkedAlbum(batch.linked_session_id);
    return res.status(400).json({
      ok: false,
      error: album
        ? `This card is connected to “${album.title}”. Open a photo from that album, then Link my card.`
        : 'This card is connected to a different album.',
      linkedAlbum: album,
    });
  }

  const replace = !!req.body?.replace;
  if (row.attached_photo_id && row.attached_photo_id !== photoId && !replace) {
    return res.status(409).json({
      ok: false,
      error: 'Card already linked to another photo',
      needsConfirm: true,
    });
  }

  // Clear this photo from any other code in same epoch
  db.prepare(
    `UPDATE qr_codes SET attached_photo_id = NULL, attached_at = NULL
     WHERE attached_photo_id = ? AND id != ?`,
  ).run(photoId, row.id);

  const nowIso = new Date().toISOString();
  db.prepare(
    `UPDATE qr_codes SET attached_photo_id = ?, attached_at = ? WHERE id = ?`,
  ).run(photoId, nowIso, row.id);

  return res.json({
    ok: true,
    previewUrl: `${config.publicBaseUrl}/q/${encodeURIComponent(code)}`,
    photo: resolveAttachedPhoto(photoId),
  });
});

/* ——— Admin ——— */

adminQrRouter.get('/batches', (_req, res) => {
  const rows = getDb()
    .prepare(`SELECT * FROM qr_batches WHERE status != 'archived' ORDER BY created_at DESC`)
    .all();
  res.json({ ok: true, batches: rows.map((r) => publicBatch(r)) });
});

adminQrRouter.get('/batches/archived', (_req, res) => {
  const rows = getDb()
    .prepare(`SELECT * FROM qr_batches WHERE status = 'archived' ORDER BY created_at DESC`)
    .all();
  res.json({ ok: true, batches: rows.map((r) => publicBatch(r)) });
});

adminQrRouter.post('/batches', async (req, res) => {
  try {
    const name = String(req.body?.name || '').trim();
    if (!name) {
      return res.status(400).json({ ok: false, error: 'Event name is required' });
    }
    const qty = Number(req.body?.quantity);
    if (!Number.isFinite(qty) || qty < 1 || qty > 500) {
      return res.status(400).json({ ok: false, error: 'Quantity must be a number from 1 to 500' });
    }
    const batch = createBatchRecord({
      name,
      eventLabel: req.body?.eventLabel,
      quantity: Math.floor(qty),
      paperSize: req.body?.paperSize,
      notes: req.body?.notes,
      templateId: req.body?.templateId,
    });
    const pdf = await generateBatchPdf({
      batchId: batch.id,
      paperSize: batch.paper_size,
    });
    const fresh = getDb().prepare('SELECT * FROM qr_batches WHERE id = ?').get(batch.id);
    return res.json({
      ok: true,
      batch: publicBatch(fresh),
      pdf,
      estimate: pagesEstimate(fresh.quantity, fresh.paper_size),
    });
  } catch (e) {
    console.error('[qr] create batch failed', e);
    return res.status(400).json({ ok: false, error: e.message || String(e) });
  }
});

adminQrRouter.get('/batches/:id', (req, res) => {
  const batch = getDb().prepare('SELECT * FROM qr_batches WHERE id = ?').get(req.params.id);
  if (!batch) return res.status(404).json({ ok: false, error: 'Not found' });
  const q = String(req.query.q || '').trim().toLowerCase();
  const filter = String(req.query.filter || 'all');
  let codes = getDb()
    .prepare(`SELECT * FROM qr_codes WHERE batch_id = ? ORDER BY serial ASC`)
    .all(batch.id);
  if (filter === 'unused') codes = codes.filter((c) => c.status === 'unused');
  if (filter === 'scanned') codes = codes.filter((c) => c.status === 'scanned');
  if (filter === 'linked') codes = codes.filter((c) => c.attached_photo_id);
  if (filter === 'void') codes = codes.filter((c) => c.status === 'void');
  if (q) {
    codes = codes.filter(
      (c) =>
        c.code.toLowerCase().includes(q) ||
        String(c.serial).includes(q),
    );
  }
  return res.json({
    ok: true,
    batch: publicBatch(batch),
    codes: codes.map((c) => ({
      id: c.id,
      code: c.code,
      serial: c.serial,
      status: c.status,
      scannedAt: c.scanned_at,
      attachedPhotoId: c.attached_photo_id,
      attachedAt: c.attached_at,
      previewUrl: `${config.publicBaseUrl}/q/${encodeURIComponent(c.code)}`,
      photo: resolveAttachedPhoto(c.attached_photo_id),
    })),
    estimate: pagesEstimate(batch.quantity, batch.paper_size),
  });
});

adminQrRouter.delete('/batches/:id', (req, res) => {
  const db = getDb();
  const batch = db.prepare('SELECT * FROM qr_batches WHERE id = ?').get(req.params.id);
  if (!batch) return res.status(404).json({ ok: false, error: 'Not found' });
  if (batch.status === 'active') {
    return res.status(400).json({
      ok: false,
      error: 'Deactivate or archive the batch before deleting',
    });
  }
  // Remove PDF files for this batch (any paper size)
  try {
    for (const size of ['a3', 'a4']) {
      const name = `${batch.id}-${size}.pdf`;
      const fp = path.join(config.qrPdfsDir, name);
      if (fs.existsSync(fp)) fs.unlinkSync(fp);
    }
    if (batch.pdf_filename) {
      const fp = path.join(config.qrPdfsDir, batch.pdf_filename);
      if (fs.existsSync(fp)) fs.unlinkSync(fp);
    }
  } catch (e) {
    console.warn('[qr] pdf cleanup', e.message);
  }
  db.prepare('DELETE FROM qr_scan_history WHERE batch_id = ?').run(batch.id);
  db.prepare('DELETE FROM qr_batches WHERE id = ?').run(batch.id);
  return res.json({ ok: true });
});

adminQrRouter.patch('/batches/:id', (req, res) => {
  const db = getDb();
  const batch = db.prepare('SELECT * FROM qr_batches WHERE id = ?').get(req.params.id);
  if (!batch) return res.status(404).json({ ok: false, error: 'Not found' });

  const status = req.body?.status;
  const allowed = ['draft', 'active', 'inactive', 'archived'];
  if (status && !allowed.includes(status)) {
    return res.status(400).json({ ok: false, error: 'Invalid status' });
  }

  if (req.body?.featured !== undefined) {
    const featured = req.body.featured ? 1 : 0;
    if (featured) {
      db.prepare(`UPDATE qr_batches SET featured = 0`).run();
    }
    db.prepare(`UPDATE qr_batches SET featured = ? WHERE id = ?`).run(featured, batch.id);
  }

  if (status) {
    const activatedAt =
      status === 'active' && batch.status !== 'active'
        ? new Date().toISOString()
        : batch.activated_at;
    db.prepare(`UPDATE qr_batches SET status = ?, activated_at = ? WHERE id = ?`).run(
      status,
      activatedAt,
      batch.id,
    );
  }

  if (typeof req.body?.name === 'string' && req.body.name.trim()) {
    db.prepare(`UPDATE qr_batches SET name = ? WHERE id = ?`).run(req.body.name.trim(), batch.id);
  }
  if (typeof req.body?.eventLabel === 'string') {
    db.prepare(`UPDATE qr_batches SET event_label = ? WHERE id = ?`).run(
      req.body.eventLabel.trim(),
      batch.id,
    );
  }
  if (typeof req.body?.notes === 'string') {
    db.prepare(`UPDATE qr_batches SET notes = ? WHERE id = ?`).run(req.body.notes.trim(), batch.id);
  }

  if (Object.prototype.hasOwnProperty.call(req.body || {}, 'linkedSessionId')) {
    const raw = req.body.linkedSessionId;
    if (raw === null || raw === '') {
      db.prepare(`UPDATE qr_batches SET linked_session_id = NULL WHERE id = ?`).run(batch.id);
    } else {
      const sessionId = String(raw).trim();
      const session = db.prepare('SELECT * FROM sessions WHERE id = ?').get(sessionId);
      if (!session) {
        return res.status(400).json({ ok: false, error: 'Album not found' });
      }
      if (isSessionExpired(session)) {
        return res.status(400).json({ ok: false, error: 'That album has expired' });
      }
      db.prepare(`UPDATE qr_batches SET linked_session_id = ? WHERE id = ?`).run(sessionId, batch.id);
    }
  }

  const fresh = db.prepare('SELECT * FROM qr_batches WHERE id = ?').get(batch.id);
  return res.json({ ok: true, batch: publicBatch(fresh) });
});

adminQrRouter.post('/batches/:id/reset', (req, res) => {
  const db = getDb();
  const batch = db.prepare('SELECT * FROM qr_batches WHERE id = ?').get(req.params.id);
  if (!batch) return res.status(404).json({ ok: false, error: 'Not found' });

  const codes = db.prepare(`SELECT * FROM qr_codes WHERE batch_id = ?`).all(batch.id);
  const scannedCount = codes.filter(
    (c) => c.status === 'scanned' && c.session_epoch === batch.session_epoch,
  ).length;
  const resetAt = new Date().toISOString();
  const nextEpoch = batch.session_epoch + 1;

  const tx = db.transaction(() => {
    const hist = db.prepare(
      `INSERT INTO qr_scan_history (
        id, batch_id, code_id, code, scanned_at, day_key, session_epoch, attached_photo_id, reset_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    for (const c of codes) {
      if (c.scanned_at || c.attached_photo_id) {
        hist.run(
          nanoid(12),
          batch.id,
          c.id,
          c.code,
          c.scanned_at,
          c.scanned_at ? dayKey(new Date(c.scanned_at)) : null,
          batch.session_epoch,
          c.attached_photo_id,
          resetAt,
        );
      }
    }
    db.prepare(
      `UPDATE qr_codes SET status = CASE WHEN status = 'void' THEN 'void' ELSE 'unused' END,
        scanned_at = NULL, attached_photo_id = NULL, attached_at = NULL, session_epoch = ?
       WHERE batch_id = ?`,
    ).run(nextEpoch, batch.id);
    db.prepare(`UPDATE qr_batches SET session_epoch = ? WHERE id = ?`).run(nextEpoch, batch.id);
  });
  tx();

  const fresh = db.prepare('SELECT * FROM qr_batches WHERE id = ?').get(batch.id);
  return res.json({
    ok: true,
    batch: publicBatch(fresh),
    archivedScans: scannedCount,
  });
});

adminQrRouter.post('/reset-active', (_req, res) => {
  const db = getDb();
  const active = db.prepare(`SELECT id FROM qr_batches WHERE status = 'active'`).all();
  let total = 0;
  for (const a of active) {
    // reuse reset logic inline via HTTP-less call
    const batch = db.prepare('SELECT * FROM qr_batches WHERE id = ?').get(a.id);
    const codes = db.prepare(`SELECT * FROM qr_codes WHERE batch_id = ?`).all(batch.id);
    const resetAt = new Date().toISOString();
    const nextEpoch = batch.session_epoch + 1;
    const tx = db.transaction(() => {
      const hist = db.prepare(
        `INSERT INTO qr_scan_history (
          id, batch_id, code_id, code, scanned_at, day_key, session_epoch, attached_photo_id, reset_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      );
      for (const c of codes) {
        if (c.scanned_at || c.attached_photo_id) {
          hist.run(
            nanoid(12),
            batch.id,
            c.id,
            c.code,
            c.scanned_at,
            c.scanned_at ? dayKey(new Date(c.scanned_at)) : null,
            batch.session_epoch,
            c.attached_photo_id,
            resetAt,
          );
          total += 1;
        }
      }
      db.prepare(
        `UPDATE qr_codes SET status = CASE WHEN status = 'void' THEN 'void' ELSE 'unused' END,
          scanned_at = NULL, attached_photo_id = NULL, attached_at = NULL, session_epoch = ?
         WHERE batch_id = ?`,
      ).run(nextEpoch, batch.id);
      db.prepare(`UPDATE qr_batches SET session_epoch = ? WHERE id = ?`).run(nextEpoch, batch.id);
    });
    tx();
  }
  return res.json({ ok: true, batchesReset: active.length, rowsArchived: total });
});

adminQrRouter.post('/batches/:id/void/:codeId', (req, res) => {
  const db = getDb();
  const code = db
    .prepare(`SELECT * FROM qr_codes WHERE id = ? AND batch_id = ?`)
    .get(req.params.codeId, req.params.id);
  if (!code) return res.status(404).json({ ok: false, error: 'Code not found' });
  db.prepare(
    `UPDATE qr_codes SET status = 'void', scanned_at = NULL, attached_photo_id = NULL, attached_at = NULL WHERE id = ?`,
  ).run(code.id);
  return res.json({ ok: true });
});

adminQrRouter.get('/batches/:id/pdf', (req, res) => {
  const batch = getDb().prepare('SELECT * FROM qr_batches WHERE id = ?').get(req.params.id);
  if (!batch?.pdf_filename) return res.status(404).json({ ok: false, error: 'PDF not generated' });
  const filePath = path.join(config.qrPdfsDir, batch.pdf_filename);
  if (!fs.existsSync(filePath)) return res.status(404).json({ ok: false, error: 'PDF missing' });
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader(
    'Content-Disposition',
    `attachment; filename="${batch.name.replace(/[^\w.-]+/g, '_')}-${batch.paper_size}.pdf"`,
  );
  return res.sendFile(filePath);
});

adminQrRouter.post('/batches/:id/regenerate-pdf', async (req, res) => {
  try {
    const paperSize = req.body?.paperSize === 'a3' ? 'a3' : req.body?.paperSize === 'a4' ? 'a4' : undefined;
    const pdf = await generateBatchPdf({ batchId: req.params.id, paperSize });
    const batch = getDb().prepare('SELECT * FROM qr_batches WHERE id = ?').get(req.params.id);
    return res.json({ ok: true, batch: publicBatch(batch), pdf });
  } catch (e) {
    return res.status(400).json({ ok: false, error: e.message || String(e) });
  }
});

adminQrRouter.get('/batches/:id/codes.csv', (req, res) => {
  const batch = getDb().prepare('SELECT * FROM qr_batches WHERE id = ?').get(req.params.id);
  if (!batch) return res.status(404).json({ ok: false, error: 'Not found' });
  const codes = getDb()
    .prepare(`SELECT * FROM qr_codes WHERE batch_id = ? ORDER BY serial ASC`)
    .all(batch.id);
  const lines = [
    'serial,code,status,scanned_at,attached_photo_id,preview_url',
    ...codes.map(
      (c) =>
        `${c.serial},${c.code},${c.status},${c.scanned_at || ''},${c.attached_photo_id || ''},${config.publicBaseUrl}/q/${c.code}`,
    ),
  ];
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader(
    'Content-Disposition',
    `attachment; filename="${batch.name.replace(/[^\w.-]+/g, '_')}-codes.csv"`,
  );
  return res.send(lines.join('\n'));
});

adminQrRouter.get('/templates', (_req, res) => {
  res.json({ ok: true, templates: listTemplates(), activeId: getActiveTemplateId() });
});

adminQrRouter.post('/templates/active', (req, res) => {
  const id = String(req.body?.id || '');
  const t = getDb().prepare('SELECT id FROM qr_templates WHERE id = ?').get(id);
  if (!t) return res.status(404).json({ ok: false, error: 'Template not found' });
  setActiveTemplateId(id);
  return res.json({ ok: true, templates: listTemplates() });
});

adminQrRouter.post('/templates/upload', upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ ok: false, error: 'file required' });
  const id = nanoid(12);
  const name = String(req.body?.name || req.file.originalname || 'Custom frame').trim();
  getDb()
    .prepare(
      `INSERT INTO qr_templates (id, name, filename, source, created_at) VALUES (?, ?, ?, 'upload', ?)`,
    )
    .run(id, name, req.file.filename, new Date().toISOString());
  if (req.body?.setActive === '1' || req.body?.setActive === true) {
    setActiveTemplateId(id);
  }
  return res.json({ ok: true, templates: listTemplates() });
});

adminQrRouter.delete('/templates/:id', (req, res) => {
  const db = getDb();
  const t = db.prepare('SELECT * FROM qr_templates WHERE id = ?').get(req.params.id);
  if (!t) return res.status(404).json({ ok: false, error: 'Not found' });
  if (t.source === 'builtin') {
    return res.status(400).json({ ok: false, error: 'Cannot delete built-in template' });
  }
  const fp = templateFilePath(t);
  if (fp && fs.existsSync(fp)) fs.unlinkSync(fp);
  db.prepare('DELETE FROM qr_templates WHERE id = ?').run(t.id);
  if (getActiveTemplateId() === t.id) {
    const builtin = db.prepare(`SELECT id FROM qr_templates WHERE source = 'builtin' LIMIT 1`).get();
    if (builtin) setActiveTemplateId(builtin.id);
  }
  return res.json({ ok: true, templates: listTemplates() });
});

adminQrRouter.get('/stats/today', (_req, res) => {
  const key = dayKey();
  const db = getDb();
  const totalScans = db
    .prepare(`SELECT COUNT(*) AS c FROM qr_scans WHERE day_key = ? AND result = 'valid'`)
    .get(key).c;
  const active = db.prepare(`SELECT * FROM qr_batches WHERE status = 'active'`).all();
  let remaining = 0;
  let linked = 0;
  for (const b of active) {
    const s = batchStats(b.id, b.session_epoch);
    remaining += s.remaining;
    linked += s.linked;
  }
  const last = db
    .prepare(`SELECT scanned_at FROM qr_scans WHERE result = 'valid' ORDER BY scanned_at DESC LIMIT 1`)
    .get();
  return res.json({
    ok: true,
    dayKey: key,
    totalScans,
    remaining,
    linked,
    activeEvents: active.length,
    lastScanAt: last?.scanned_at || null,
  });
});

adminQrRouter.get('/estimate', (req, res) => {
  const qty = Number(req.query.quantity) || 100;
  const paper = req.query.paperSize === 'a3' ? 'a3' : 'a4';
  return res.json({ ok: true, ...pagesEstimate(qty, paper) });
});
