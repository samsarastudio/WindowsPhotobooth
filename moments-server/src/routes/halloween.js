import fs from 'node:fs';
import path from 'node:path';
import multer from 'multer';
import { Router } from 'express';
import { generateFromSample, generateFromUpload } from '../halloween/generate.js';
import {
  halloweenGalleryDir,
  halloweenSamplesDir,
  SAMPLE_DEFS,
} from '../halloween/paths.js';
import { publicHalloweenMeta } from '../halloween/store.js';

export const halloweenRouter = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 12 * 1024 * 1024 },
  fileFilter(_req, file, cb) {
    const ok = /^image\/(jpeg|jpg|png|webp|heic|heif)$/i.test(file.mimetype || '');
    cb(ok ? null : new Error('Upload a JPG, PNG, or WebP photo'), ok);
  },
});

halloweenRouter.get('/meta', (_req, res) => {
  return res.json(publicHalloweenMeta());
});

halloweenRouter.post('/generate', async (req, res) => {
  const sampleId = String(req.body?.sampleId || '').trim().toLowerCase();
  if (!SAMPLE_DEFS.some((s) => s.id === sampleId)) {
    return res.status(400).json({ ok: false, error: 'sampleId must be portrait or scene' });
  }
  const result = await generateFromSample(sampleId);
  if (!result.ok) {
    const status = /limit reached/i.test(result.error || '')
      ? 429
      : /api key/i.test(result.error || '')
        ? 503
        : 500;
    return res.status(status).json(result);
  }
  return res.json(result);
});

halloweenRouter.post('/generate-upload', (req, res) => {
  upload.single('photo')(req, res, async (err) => {
    if (err) {
      return res.status(400).json({ ok: false, error: err.message || 'Upload failed' });
    }
    const mode = String(req.body?.mode || '').trim().toLowerCase();
    if (!SAMPLE_DEFS.some((s) => s.id === mode)) {
      return res.status(400).json({ ok: false, error: 'mode must be portrait or scene' });
    }
    if (!req.file?.buffer?.length) {
      return res.status(400).json({ ok: false, error: 'Photo file required' });
    }
    const result = await generateFromUpload(mode, req.file.buffer);
    if (!result.ok) {
      const status = /limit reached/i.test(result.error || '')
        ? 429
        : /api key/i.test(result.error || '')
          ? 503
          : 500;
      return res.status(status).json(result);
    }
    return res.json(result);
  });
});

export function halloweenMediaHandler(req, res) {
  const kind = String(req.params.kind || '');
  const filename = path.basename(String(req.params.filename || ''));
  if (!filename || filename.includes('..')) {
    return res.status(400).end();
  }
  let base = null;
  if (kind === 'samples') {
    base = halloweenSamplesDir;
  } else if (kind === 'gallery') {
    base = halloweenGalleryDir();
  } else {
    return res.status(404).end();
  }
  const filePath = path.join(base, filename);
  if (!fs.existsSync(filePath)) return res.status(404).end();
  // Samples change during demos — avoid sticky browser cache of old single-person scene.
  res.setHeader('Cache-Control', 'no-store');
  return res.sendFile(filePath);
}
