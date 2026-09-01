import fs from 'node:fs';
import path from 'node:path';
import multer from 'multer';
import { Router } from 'express';
import { config } from '../config.js';
import { requireAdminPin, requireUploadToken } from '../auth.js';
import { readFrameAspect } from '../frame-aspect.js';

const IMAGE_EXT = new Set(['.png', '.jpg', '.jpeg', '.webp']);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 },
});

function ensureFramesDir() {
  fs.mkdirSync(config.framesDir, { recursive: true });
  return config.framesDir;
}

function safeFrameName(name) {
  const base = path.basename(String(name || ''));
  if (!base || base.includes('..')) return null;
  const ext = path.extname(base).toLowerCase();
  if (!IMAGE_EXT.has(ext)) return null;
  return base;
}

function listFrames() {
  ensureFramesDir();
  const files = [];
  for (const ent of fs.readdirSync(config.framesDir, { withFileTypes: true })) {
    if (!ent.isFile()) continue;
    const ext = path.extname(ent.name).toLowerCase();
    if (!IMAGE_EXT.has(ext)) continue;
    const full = path.join(config.framesDir, ent.name);
    const st = fs.statSync(full);
    files.push({
      filename: ent.name,
      label: ent.name.replace(/\.[^.]+$/, '').replace(/[-_]+/g, ' ').trim(),
      bytes: st.size,
      updatedAt: st.mtime.toISOString(),
      url: `/media/frames/${encodeURIComponent(ent.name)}`,
      downloadUrl: `${config.publicBaseUrl}/media/frames/${encodeURIComponent(ent.name)}`,
    });
  }
  files.sort((a, b) => a.filename.localeCompare(b.filename));
  return files;
}

async function withFrameAspect(frames) {
  return Promise.all(
    frames.map(async (f) => {
      const full = path.join(config.framesDir, f.filename);
      const size = await readFrameAspect(full);
      return { ...f, ...size };
    }),
  );
}

export const framesRouter = Router();

/** Public list — booths sync from this. */
framesRouter.get('/', async (_req, res) => {
  res.json({ ok: true, frames: await withFrameAspect(listFrames()) });
});

/** Booth or admin may upload with upload token. */
framesRouter.post('/', requireUploadToken, upload.single('frame'), async (req, res) => {
  if (!req.file?.buffer?.length) {
    return res.status(400).json({ ok: false, error: 'Missing frame file (field: frame)' });
  }
  ensureFramesDir();
  const suggested =
    typeof req.body?.filename === 'string' && req.body.filename.trim()
      ? path.basename(req.body.filename.trim())
      : req.file.originalname || `frame-${Date.now()}.png`;
  let ext = path.extname(suggested).toLowerCase();
  if (!IMAGE_EXT.has(ext)) {
    const mime = req.file.mimetype || '';
    ext = mime.includes('png') ? '.png' : mime.includes('webp') ? '.webp' : '.jpg';
  }
  const base =
    path
      .basename(suggested, path.extname(suggested))
      .toLowerCase()
      .replace(/[^a-z0-9-_]+/g, '-')
      .replace(/^-+|-+$/g, '') || `frame-${Date.now()}`;
  const filename = `${base}${ext}`;
  const dest = path.join(config.framesDir, filename);
  fs.writeFileSync(dest, req.file.buffer);
  const frames = await withFrameAspect(listFrames());
  const frame = frames.find((f) => f.filename === filename);
  return res.status(201).json({ ok: true, frame, frames });
});

framesRouter.delete('/:filename', requireUploadToken, async (req, res) => {
  const safe = safeFrameName(req.params.filename);
  if (!safe) return res.status(400).json({ ok: false, error: 'Invalid filename' });
  const full = path.join(ensureFramesDir(), safe);
  if (!fs.existsSync(full)) return res.status(404).json({ ok: false, error: 'Not found' });
  fs.unlinkSync(full);
  return res.json({ ok: true, removed: safe, frames: await withFrameAspect(listFrames()) });
});

/** Admin PIN variants (same operations). */
export const adminFramesRouter = Router();
adminFramesRouter.use(requireAdminPin);

adminFramesRouter.get('/', async (_req, res) => {
  res.json({ ok: true, frames: await withFrameAspect(listFrames()) });
});

adminFramesRouter.post('/', upload.single('frame'), async (req, res) => {
  if (!req.file?.buffer?.length) {
    return res.status(400).json({ ok: false, error: 'Missing frame file (field: frame)' });
  }
  ensureFramesDir();
  const suggested =
    typeof req.body?.filename === 'string' && req.body.filename.trim()
      ? path.basename(req.body.filename.trim())
      : req.file.originalname || `frame-${Date.now()}.png`;
  let ext = path.extname(suggested).toLowerCase();
  if (!IMAGE_EXT.has(ext)) {
    const mime = req.file.mimetype || '';
    ext = mime.includes('png') ? '.png' : mime.includes('webp') ? '.webp' : '.jpg';
  }
  const base =
    path
      .basename(suggested, path.extname(suggested))
      .toLowerCase()
      .replace(/[^a-z0-9-_]+/g, '-')
      .replace(/^-+|-+$/g, '') || `frame-${Date.now()}`;
  const filename = `${base}${ext}`;
  fs.writeFileSync(path.join(config.framesDir, filename), req.file.buffer);
  const frames = await withFrameAspect(listFrames());
  return res.status(201).json({
    ok: true,
    frame: frames.find((f) => f.filename === filename),
    frames,
  });
});

adminFramesRouter.delete('/:filename', async (req, res) => {
  const safe = safeFrameName(req.params.filename);
  if (!safe) return res.status(400).json({ ok: false, error: 'Invalid filename' });
  const full = path.join(ensureFramesDir(), safe);
  if (!fs.existsSync(full)) return res.status(404).json({ ok: false, error: 'Not found' });
  fs.unlinkSync(full);
  return res.json({ ok: true, removed: safe, frames: await withFrameAspect(listFrames()) });
});

export { listFrames, ensureFramesDir };
