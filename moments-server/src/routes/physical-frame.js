import multer from 'multer';
import path from 'node:path';
import { Router } from 'express';
import { requireAdminPin } from '../auth.js';
import {
  PHYSICAL_FRAME_DEFAULTS,
  compositePhysicalFrameDual,
  deleteGeneratedSheet,
  ensurePhysicalDir,
  getGeneratedSheet,
  listGeneratedSheets,
  normalizePhysicalOpts,
  padToSelphyPostcard,
  saveGeneratedSheet,
} from '../physical-frame.js';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024 },
});

export const adminPhysicalFrameRouter = Router();
adminPhysicalFrameRouter.use(requireAdminPin);

adminPhysicalFrameRouter.get('/defaults', (_req, res) => {
  res.json({ ok: true, defaults: PHYSICAL_FRAME_DEFAULTS });
});

adminPhysicalFrameRouter.get('/', (_req, res) => {
  ensurePhysicalDir();
  res.json({ ok: true, sheets: listGeneratedSheets() });
});

adminPhysicalFrameRouter.post('/generate', upload.single('photo'), async (req, res) => {
  if (!req.file?.buffer?.length) {
    return res.status(400).json({ ok: false, error: 'Upload a photo (field: photo).' });
  }
  try {
    const opts = normalizePhysicalOpts(req.body || {});
    const sheet = await compositePhysicalFrameDual(req.file.buffer, opts);
    const padded = await padToSelphyPostcard(sheet.png, opts.dpi, opts.printerCropInsetMm);
    const record = saveGeneratedSheet(padded.png, {
      originalName: req.file.originalname || null,
      width: padded.width,
      height: padded.height,
      settings: opts,
    });
    return res.status(201).json({
      ok: true,
      sheet: record,
      downloadPath: `/api/admin/physical-frame/${encodeURIComponent(record.id)}/file`,
    });
  } catch (e) {
    return res.status(500).json({ ok: false, error: e?.message || 'Generate failed' });
  }
});

adminPhysicalFrameRouter.get('/:id/file', (req, res) => {
  const rec = getGeneratedSheet(req.params.id);
  if (!rec) return res.status(404).json({ ok: false, error: 'Sheet not found' });
  res.setHeader('Content-Type', 'image/png');
  res.setHeader(
    'Content-Disposition',
    `inline; filename="physical-frame-${rec.id}.png"`,
  );
  return res.sendFile(path.resolve(rec.pngPath));
});

adminPhysicalFrameRouter.delete('/:id', (req, res) => {
  if (!deleteGeneratedSheet(req.params.id)) {
    return res.status(404).json({ ok: false, error: 'Sheet not found' });
  }
  return res.json({ ok: true });
});
