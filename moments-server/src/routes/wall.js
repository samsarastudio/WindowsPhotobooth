import { Router } from 'express';
import { getDb, isSessionExpired, publicPhoto, loadSettings, saveSettings } from '../db.js';
import { subscribeSession, broadcastPhotoAdded } from '../sse.js';
import { requireAdminPin } from '../auth.js';

const WALL_CHANNEL = '__wall__';

function listActiveSessions(now = new Date()) {
  return getDb()
    .prepare('SELECT * FROM sessions ORDER BY created_at DESC')
    .all()
    .filter((s) => !isSessionExpired(s, now));
}

function listWallPhotos(limit = 500) {
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
  return {
    title: typeof s.wallTitle === 'string' && s.wallTitle.trim() ? s.wallTitle.trim() : 'Wall of moments',
    overlay: typeof s.wallOverlay === 'string' ? s.wallOverlay : '',
    columns: typeof s.wallColumns === 'number' && s.wallColumns >= 6 && s.wallColumns <= 24
      ? s.wallColumns
      : 14,
    emptyRatio:
      typeof s.wallEmptyRatio === 'number' && s.wallEmptyRatio >= 0 && s.wallEmptyRatio <= 0.6
        ? s.wallEmptyRatio
        : 0.22,
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
  if (typeof req.body?.columns === 'number') {
    patch.wallColumns = Math.min(24, Math.max(6, Math.floor(req.body.columns)));
  }
  if (typeof req.body?.emptyRatio === 'number') {
    patch.wallEmptyRatio = Math.min(0.6, Math.max(0, req.body.emptyRatio));
  }
  saveSettings(patch);
  res.json({ ok: true, wall: wallSettings() });
});
