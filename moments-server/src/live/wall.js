import crypto from 'node:crypto';
import path from 'node:path';
import fs from 'node:fs';
import sharp from 'sharp';

export function registerWall({ app, db, owned, features, now, base, data, root, wrap, fail }) {
  db.exec('CREATE TABLE IF NOT EXISTS live_walls(event TEXT PRIMARY KEY REFERENCES events(id) ON DELETE CASCADE,token TEXT UNIQUE NOT NULL,enabled INTEGER NOT NULL DEFAULT 0)');
  const enabled = () => { if (!features().mosaic) throw fail(403, 'Mosaic walls are disabled by the administrator'); };
  const settings = e => {
    const row = db.prepare('SELECT * FROM live_walls WHERE event=?').get(e.id);
    return { enabled: Boolean(row?.enabled), url: row ? `${base}/wall/${row.token}` : null, available: features().mosaic, visibility: e.visibility, status: e.status, reveal: e.reveal };
  };
  app.get('/api/events/:slug/wall', wrap((req, res) => res.json(settings(owned(req)))));
  app.patch('/api/events/:slug/wall', wrap((req, res) => {
    const e = owned(req);
    if (!req.body || Object.keys(req.body).some(k => !['enabled', 'rotate'].includes(k)) || (req.body.enabled !== undefined && typeof req.body.enabled !== 'boolean') || (req.body.rotate !== undefined && typeof req.body.rotate !== 'boolean')) throw fail(400, 'Provide boolean enabled or rotate settings');
    const old = db.prepare('SELECT * FROM live_walls WHERE event=?').get(e.id);
    const active = req.body.enabled ?? Boolean(old?.enabled);
    if (active) { enabled(); if (e.visibility !== 'all') throw fail(400, 'Set guest visibility to everyone before enabling a shared mosaic wall'); }
    const token = !old || req.body.rotate ? crypto.randomBytes(32).toString('base64url') : old.token;
    db.prepare('INSERT INTO live_walls VALUES(?,?,?) ON CONFLICT(event) DO UPDATE SET token=excluded.token,enabled=excluded.enabled').run(e.id, token, Number(active));
    res.json(settings(e));
  }));
  const access = req => {
    enabled();
    const e = db.prepare('SELECT e.* FROM events e JOIN live_walls w ON w.event=e.id WHERE w.token=? AND w.enabled=1').get(req.params.token);
    if (!e || e.status === 'draft' || e.visibility !== 'all') throw fail(404, 'This mosaic wall is not available');
    return e;
  };
  app.get('/api/wall/:token', wrap((req, res) => {
    const e = access(req); const revealed = e.reveal <= now();
    const photos = revealed ? db.prepare('SELECT id FROM photos WHERE event=? AND approved=1 ORDER BY created DESC,id DESC LIMIT 200').all(e.id) : [];
    res.set('X-Robots-Tag', 'noindex, nofollow');
    res.json({ title: e.title, revealed, reveal: e.reveal, server_time: now(), total: revealed ? db.prepare('SELECT count(*) n FROM photos WHERE event=? AND approved=1').get(e.id).n : 0, photos: photos.map(p => ({ id: p.id, url: `/api/wall/${req.params.token}/photos/${p.id}/image` })) });
  }));
  app.get('/api/wall/:token/photos/:photo/image', wrap(async (req, res) => {
    const e = access(req);
    const p = db.prepare('SELECT * FROM photos WHERE id=? AND event=? AND approved=1').get(req.params.photo, e.id);
    if (e.reveal > now() || !p) throw fail(404, 'Photo not available');
    const bytes = await sharp(fs.readFileSync(path.join(data, 'photos', p.filename))).resize({ width: 900, height: 900, fit: 'inside', withoutEnlargement: true }).jpeg({ quality: 82 }).toBuffer();
    // Recheck access after asynchronous image work in case the wall was revoked.
    const current = access(req);
    if (current.reveal > now() || !db.prepare('SELECT 1 FROM photos WHERE id=? AND event=? AND approved=1').get(p.id, current.id)) throw fail(404, 'Photo not available');
    res.set('X-Robots-Tag', 'noindex, nofollow').type('jpeg').send(bytes);
  }));
  app.get('/wall/:token', wrap((req, res) => {
    try { access(req); } catch (err) { if (![403,404].includes(err.status)) throw err; res.status(err.status); }
    res.set('X-Robots-Tag', 'noindex, nofollow'); res.sendFile(path.join(root, 'live-public/wall.html'));
  }));
}
