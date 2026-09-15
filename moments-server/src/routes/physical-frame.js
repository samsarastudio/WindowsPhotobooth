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
  limits: {
    fileSize: 25 * 1024 * 1024,
    files: 2,
    fields: 40,
    parts: 42,
    fieldSize: 64 * 1024,
  },
});

const uploadImages = upload.fields([
  { name: 'photo', maxCount: 1 },
  { name: 'nameplate', maxCount: 1 },
]);

function runUpload(req, res) {
  return new Promise((resolve, reject) => {
    uploadImages(req, res, (err) => {
      if (err) reject(err);
      else resolve();
    });
  });
}

export const adminPhysicalFrameRouter = Router();
adminPhysicalFrameRouter.use(requireAdminPin);

adminPhysicalFrameRouter.get('/defaults', (_req, res) => {
  res.json({ ok: true, defaults: PHYSICAL_FRAME_DEFAULTS });
});

adminPhysicalFrameRouter.get('/', (_req, res) => {
  ensurePhysicalDir();
  res.json({ ok: true, sheets: listGeneratedSheets() });
});

adminPhysicalFrameRouter.post('/generate', async (req, res) => {
  try {
    await runUpload(req, res);
  } catch (err) {
    if (err instanceof multer.MulterError) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(413).json({ ok: false, error: 'File exceeds 25 MiB limit.' });
      }
      if (err.code === 'LIMIT_UNEXPECTED_FILE') {
        return res.status(400).json({ ok: false, error: `Unexpected file field: ${err.field || 'unknown'}.` });
      }
      if (err.code === 'LIMIT_FILE_COUNT') {
        return res.status(400).json({ ok: false, error: 'Too many files. Upload one main photo and optionally one nameplate.' });
      }
      return res.status(400).json({ ok: false, error: err.message || 'Upload failed' });
    }
    return res.status(400).json({ ok: false, error: err?.message || 'Upload failed' });
  }

  const photoFile = req.files?.photo?.[0];
  const nameplateFile = req.files?.nameplate?.[0] ?? null;

  if (!photoFile?.buffer?.length) {
    return res.status(400).json({ ok: false, error: 'Upload a main photo (field: photo).' });
  }

  try {
    const opts = normalizePhysicalOpts(req.body || {}, {
      hasNameplateFile: !!nameplateFile?.buffer?.length,
    });
    if (opts.nameplateEnabled && !nameplateFile?.buffer?.length) {
      return res
        .status(400)
        .json({ ok: false, error: 'Choose a nameplate image or disable the nameplate.' });
    }
    if (!opts.nameplateEnabled && nameplateFile?.buffer?.length) {
      return res.status(400).json({
        ok: false,
        error: 'Nameplate was uploaded but nameplateEnabled is false. Enable it or clear the file.',
      });
    }

    const sheet = await compositePhysicalFrameDual(
      photoFile.buffer,
      opts,
      opts.nameplateEnabled ? nameplateFile.buffer : null,
    );
    const padded = await padToSelphyPostcard(sheet.png, opts.dpi, opts.printerCropInsetMm);
    const record = saveGeneratedSheet(padded.png, {
      originalName: photoFile.originalname || null,
      nameplateOriginalName: nameplateFile?.originalname || null,
      hasNameplate: !!opts.nameplateEnabled,
      width: padded.width,
      height: padded.height,
      settings: opts,
      layout: sheet.layout,
    });
    return res.status(201).json({
      ok: true,
      sheet: record,
      downloadPath: `/api/admin/physical-frame/${encodeURIComponent(record.id)}/file`,
    });
  } catch (e) {
    const msg = e?.message || 'Generate failed';
    const client =
      /nameplate|photo|layout|insufficient|upload|boolean|fit|crop|unsupported|unreadable|megapixel/i.test(
        msg,
      );
    return res.status(client ? 400 : 500).json({ ok: false, error: msg });
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
