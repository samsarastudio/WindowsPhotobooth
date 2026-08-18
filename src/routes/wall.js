import fs from 'node:fs';
import path from 'node:path';
import multer from 'multer';
import { Router } from 'express';
import { config } from '../config.js';
import { getDb, isSessionExpired, publicPhoto, loadSettings, saveSettings } from '../db.js';
import { subscribeSession, broadcastPhotoAdded, broadcastEvent } from '../sse.js';
import { requireAdminPin } from '../auth.js';

const WALL_CHANNEL = '__wall__';
const IMAGE_EXT = new Set(['.png', '.jpg', '.jpeg', '.webp', '.svg']);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024 },
});

function ensureBrandingDir() {
  fs.mkdirSync(config.brandingDir, { recursive: true });
  return config.brandingDir;
}

function listActiveSessions(now = new Date()) {
  return getDb()
    .prepare('SELECT * FROM sessions ORDER BY created_at DESC')
    .all()
    .filter((s) => !isSessionExpired(s, now));
}

function listWallPhotos(limit = 4000) {
  const sessions = listActiveSessions();
  const byId = new Map(sessions.map((s) => [s.id, s]));
  if (!sessions.length) return { photos: [], sessions: [] };
  const placeholders = sessions.map(() => '?').join(',');
  const rows = getDb()
    .prepare(
      `SELECT * FROM photos WHERE session_id IN (${placeholders})
       ORDER BY created_at DESC LIMIT ?`,
    )
    .all(...sessions.map((s) => s.id), limit);
  const photos = rows
    .map((row) => {
      const session = byId.get(row.session_id);
      if (!session) return null;
      if (row.variant === 'original') return null;
      return {
        ...publicPhoto(session.slug, row),
        sessionSlug: session.slug,
        sessionTitle: session.title,
      };
    })
    .filter(Boolean)
    .reverse();
  return {
    photos,
    sessions: sessions.map((s) => ({
      slug: s.slug,
      title: s.title,
      galleryUrl: `${s.slug}`,
      expiresAt: s.expires_at,
    })),
  };
}

export function wallSettings() {
  const s = loadSettings();
  const logo =
    typeof s.wallBrandLogo === 'string' && s.wallBrandLogo.trim()
      ? path.basename(s.wallBrandLogo.trim())
      : '';
  const logoPath = logo ? path.join(config.brandingDir, logo) : '';
  const hasLogo = !!(logo && fs.existsSync(logoPath));

  const target =
    typeof s.wallMosaicTarget === 'string' && s.wallMosaicTarget.trim()
      ? path.basename(s.wallMosaicTarget.trim())
      : '';
  const targetPath = target ? path.join(config.brandingDir, target) : '';
  const hasTarget = !!(target && fs.existsSync(targetPath));

  return {
    title: typeof s.wallTitle === 'string' && s.wallTitle.trim() ? s.wallTitle.trim() : 'Wall of moments',
    overlay: typeof s.wallOverlay === 'string' ? s.wallOverlay : '',
    columns: typeof s.wallColumns === 'number' && s.wallColumns >= 8 && s.wallColumns <= 28
      ? s.wallColumns
      : 16,
    emptyRatio:
      typeof s.wallEmptyRatio === 'number' && s.wallEmptyRatio >= 0 && s.wallEmptyRatio <= 0.6
        ? s.wallEmptyRatio
        : 0.22,
    brandText: typeof s.wallBrandText === 'string' ? s.wallBrandText.trim().slice(0, 80) : '',
    brandLogo: hasLogo ? logo : '',
    brandLogoUrl: hasLogo
      ? `/media/branding/${encodeURIComponent(logo)}?v=${fs.statSync(logoPath).mtimeMs}`
      : '',
    mosaicTarget: hasTarget ? target : '',
    mosaicTargetUrl: hasTarget
      ? `/media/branding/${encodeURIComponent(target)}?v=${fs.statSync(targetPath).mtimeMs}`
      : '',
    /** Centered brand artwork under the collage — glimpsed when tiles swap. */
    backdropOpacity:
      typeof s.wallBackdropOpacity === 'number' &&
      s.wallBackdropOpacity >= 0 &&
      s.wallBackdropOpacity <= 1
        ? s.wallBackdropOpacity
        : 0.55,
    /** End-of-show: dense filled CSS grid instead of live collage motion. */
    completedView: s.wallCompletedView === true,
    brandRevealEnabled: s.wallBrandRevealEnabled === true,
    brandRevealSeconds:
      typeof s.wallBrandRevealSeconds === 'number'
        ? Math.min(600, Math.max(10, Math.round(s.wallBrandRevealSeconds)))
        : 45,
    brandRevealHoldSeconds:
      typeof s.wallBrandRevealHoldSeconds === 'number'
        ? Math.min(30, Math.max(3, Math.round(s.wallBrandRevealHoldSeconds)))
        : 6,
  };
}

/** Re-export so sessions upload can notify the global wall. */
export function notifyWallPhoto(photo) {
  broadcastPhotoAdded(WALL_CHANNEL, photo);
}

export const wallRouter = Router();

wallRouter.get('/', (_req, res) => {
  const { photos, sessions } = listWallPhotos();
  res.json({
    ok: true,
    wall: wallSettings(),
    photoCount: photos.length,
    sessions,
    photos,
  });
});

wallRouter.get('/stream', (req, res) => {
  subscribeSession(WALL_CHANNEL, res);
});

export const adminWallRouter = Router();
adminWallRouter.use(requireAdminPin);

adminWallRouter.get('/settings', (_req, res) => {
  res.json({ ok: true, wall: wallSettings() });
});

adminWallRouter.patch('/settings', (req, res) => {
  const patch = {};
  if (typeof req.body?.title === 'string') patch.wallTitle = req.body.title.trim().slice(0, 80);
  if (typeof req.body?.overlay === 'string') patch.wallOverlay = req.body.overlay.trim().slice(0, 80);
  if (typeof req.body?.brandText === 'string') {
    patch.wallBrandText = req.body.brandText.trim().slice(0, 80);
  }
  if (typeof req.body?.columns === 'number') {
    patch.wallColumns = Math.min(24, Math.max(6, Math.floor(req.body.columns)));
  }
  if (typeof req.body?.emptyRatio === 'number') {
    patch.wallEmptyRatio = Math.min(0.6, Math.max(0, req.body.emptyRatio));
  }
  if (typeof req.body?.backdropOpacity === 'number') {
    patch.wallBackdropOpacity = Math.min(1, Math.max(0, req.body.backdropOpacity));
  }
  if (typeof req.body?.completedView === 'boolean') {
    patch.wallCompletedView = req.body.completedView;
  }
  if (typeof req.body?.brandRevealEnabled === 'boolean') {
    patch.wallBrandRevealEnabled = req.body.brandRevealEnabled;
  }
  if (typeof req.body?.brandRevealSeconds === 'number') {
    patch.wallBrandRevealSeconds = Math.min(600, Math.max(10, Math.round(req.body.brandRevealSeconds)));
  }
  if (typeof req.body?.brandRevealHoldSeconds === 'number') {
    patch.wallBrandRevealHoldSeconds = Math.min(30, Math.max(3, Math.round(req.body.brandRevealHoldSeconds)));
  }
  if (req.body?.clearBrandLogo === true) {
    const cur = loadSettings();
    if (cur.wallBrandLogo) {
      const full = path.join(config.brandingDir, path.basename(String(cur.wallBrandLogo)));
      try {
        fs.unlinkSync(full);
      } catch (_) {}
    }
    patch.wallBrandLogo = '';
  }
  if (req.body?.clearMosaicTarget === true) {
    const cur = loadSettings();
    if (cur.wallMosaicTarget) {
      const full = path.join(config.brandingDir, path.basename(String(cur.wallMosaicTarget)));
      try {
        fs.unlinkSync(full);
      } catch (_) {}
    }
    patch.wallMosaicTarget = '';
  }
  saveSettings(patch);
  const wall = wallSettings();
  broadcastEvent(WALL_CHANNEL, 'wall.settings', wall);
  res.json({ ok: true, wall });
});

adminWallRouter.post('/brand-logo', upload.single('logo'), (req, res) => {
  if (!req.file?.buffer?.length) {
    return res.status(400).json({ ok: false, error: 'Missing logo file (field: logo)' });
  }
  ensureBrandingDir();
  const suggested = req.file.originalname || `partner-${Date.now()}.png`;
  let ext = path.extname(suggested).toLowerCase();
  if (!IMAGE_EXT.has(ext)) {
    const mime = req.file.mimetype || '';
    ext = mime.includes('svg')
      ? '.svg'
      : mime.includes('png')
        ? '.png'
        : mime.includes('webp')
          ? '.webp'
          : '.jpg';
  }
  const filename = `wall-partner${ext}`;
  const dest = path.join(config.brandingDir, filename);
  // Remove previous partner logos with other extensions
  for (const ent of fs.readdirSync(config.brandingDir)) {
    if (ent.startsWith('wall-partner.')) {
      try {
        fs.unlinkSync(path.join(config.brandingDir, ent));
      } catch (_) {}
    }
  }
  fs.writeFileSync(dest, req.file.buffer);
  saveSettings({ wallBrandLogo: filename });
  const wall = wallSettings();
  broadcastEvent(WALL_CHANNEL, 'wall.settings', wall);
  return res.status(201).json({ ok: true, wall });
});

adminWallRouter.post('/mosaic-target', upload.single('target'), (req, res) => {
  if (!req.file?.buffer?.length) {
    return res.status(400).json({ ok: false, error: 'Missing target image (field: target)' });
  }
  ensureBrandingDir();
  const suggested = req.file.originalname || `mosaic-${Date.now()}.png`;
  let ext = path.extname(suggested).toLowerCase();
  if (!IMAGE_EXT.has(ext)) {
    const mime = req.file.mimetype || '';
    ext = mime.includes('png') ? '.png' : mime.includes('webp') ? '.webp' : '.jpg';
  }
  const filename = `wall-mosaic-target${ext}`;
  for (const ent of fs.readdirSync(config.brandingDir)) {
    if (ent.startsWith('wall-mosaic-target.')) {
      try {
        fs.unlinkSync(path.join(config.brandingDir, ent));
      } catch (_) {}
    }
  }
  fs.writeFileSync(path.join(config.brandingDir, filename), req.file.buffer);
  saveSettings({ wallMosaicTarget: filename });
  const wall = wallSettings();
  broadcastEvent(WALL_CHANNEL, 'wall.settings', wall);
  return res.status(201).json({ ok: true, wall });
});

export { ensureBrandingDir };
