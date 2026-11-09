import {registerPhotobooth} from './photobooth.js';
import {registerPrintStudio} from './print-studio.js';
import { registerWall } from './wall.js';
import { adminAuth } from './admin-auth.js';
import express from 'express';
import Database from 'better-sqlite3';
import multer from 'multer';
import sharp from 'sharp';
import QRCode from 'qrcode';
import archiver from 'archiver';
import nodemailer from 'nodemailer';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const token = () => crypto.randomBytes(32).toString('base64url');
const hash = value => crypto.createHash('sha256').update(value).digest('hex');
const id = () => crypto.randomUUID();
const now = () => Date.now();
const fail = (status, message) => Object.assign(new Error(message), { status });
const wrap = fn => (req, res, next) => Promise.resolve().then(() => fn(req, res)).catch(next);
const safeEqual = (a, b) => Boolean(a && b) && crypto.timingSafeEqual(Buffer.from(hash(a)), Buffer.from(hash(b)));
const text = (value, max = 120) => String(value ?? '').trim().slice(0, max);
export function createLiveApp(options = {}) {
  const now = options.clock || Date.now;
  const base = (options.baseUrl || process.env.LIVE_BASE_URL || 'https://live.inmomentservices.com').replace(/\/$/, '');
  const secure = new URL(base).protocol === 'https:';
  const data = options.dataDir || process.env.LIVE_DATA_DIR || path.join(root, 'live-data');
  const adminKey = options.adminKey || process.env.LIVE_ADMIN_KEY;
  if (!adminKey || adminKey.length < 32) throw new Error('LIVE_ADMIN_KEY must contain at least 32 characters');
  fs.mkdirSync(path.join(data, 'photos'), { recursive: true });
  fs.mkdirSync(path.join(data, 'assets'), { recursive: true });
  const db = new Database(path.join(data, 'live.sqlite'));
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.exec(`
    CREATE TABLE IF NOT EXISTS owners(id TEXT PRIMARY KEY,email TEXT UNIQUE NOT NULL,name TEXT NOT NULL,created INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS invitations(hash TEXT PRIMARY KEY,owner TEXT NOT NULL REFERENCES owners(id),expires INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS credentials(hash TEXT PRIMARY KEY,owner TEXT NOT NULL REFERENCES owners(id),expires INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS events(id TEXT PRIMARY KEY,owner TEXT NOT NULL REFERENCES owners(id),slug TEXT UNIQUE NOT NULL,title TEXT NOT NULL,description TEXT NOT NULL DEFAULT '',style TEXT NOT NULL DEFAULT 'warm',shot_limit INTEGER NOT NULL DEFAULT 25,guest_limit INTEGER NOT NULL DEFAULT 250,reveal INTEGER NOT NULL DEFAULT 0,visibility TEXT NOT NULL DEFAULT 'all',status TEXT NOT NULL DEFAULT 'draft',moderation INTEGER NOT NULL DEFAULT 0,overlay TEXT NOT NULL DEFAULT '',created INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS guests(id TEXT PRIMARY KEY,event TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,hash TEXT UNIQUE NOT NULL,name TEXT NOT NULL,shots INTEGER NOT NULL DEFAULT 0,created INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS photos(id TEXT PRIMARY KEY,event TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,guest TEXT NOT NULL REFERENCES guests(id),filename TEXT NOT NULL,approved INTEGER NOT NULL DEFAULT 1,favorite INTEGER NOT NULL DEFAULT 0,created INTEGER NOT NULL,request_id TEXT NOT NULL,UNIQUE(guest,request_id));
    CREATE INDEX IF NOT EXISTS photos_event ON photos(event,created);
    CREATE INDEX IF NOT EXISTS guests_event ON guests(event);
    CREATE TABLE IF NOT EXISTS assets(event TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,kind TEXT NOT NULL,filename TEXT NOT NULL,PRIMARY KEY(event,kind));
    CREATE TABLE IF NOT EXISTS live_settings(key TEXT PRIMARY KEY,value TEXT NOT NULL);
  `);
  if (!db.prepare('PRAGMA table_info(events)').all().some(c => c.name === 'closes_at')) db.exec('ALTER TABLE events ADD COLUMN closes_at INTEGER NOT NULL DEFAULT 0');
  if (!db.prepare('PRAGMA table_info(owners)').all().some(c => c.name === 'disabled')) db.exec('ALTER TABLE owners ADD COLUMN disabled INTEGER NOT NULL DEFAULT 0');
  const defaults = { webApp: true, guestUploads: true, scheduledClosing: true, scheduledReveal: true, hostOnlyGallery: true, revealExperience: true, branding: true, filters: false, slideshow: true, qrPrints: true, mosaic: true, downloads: true, photobooks: true, photoboothGallery: true };
  const features = () => ({ ...defaults, ...JSON.parse(db.prepare("SELECT value FROM live_settings WHERE key='features'").get()?.value || '{}'), filters: false });
  const requireFeature = key => { if (!features()[key]) throw fail(403, 'This feature is disabled by the administrator'); };
  // Existing privacy and timing rules stay enforced even when their editor is disabled.
  const statusOf = e => e.status === 'published' && e.closes_at > 0 && e.closes_at <= now() ? 'closed' : e.status;
  const app = express();
  app.disable('x-powered-by');
  // Trust only the local reverse proxy, never arbitrary forwarded addresses.
  app.set('trust proxy', 'loopback');
  app.use(express.json({ limit: '32kb' }));
  app.use((req, res, next) => {
    res.set({ 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer', 'Permissions-Policy': 'camera=(self), microphone=()', 'Content-Security-Policy': "default-src 'self'; img-src 'self' blob: data:; media-src 'self' blob:; style-src 'self'; script-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'" });
    if (secure) res.set('Strict-Transport-Security', 'max-age=31536000');
    if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
      if (req.headers.origin && req.headers.origin !== base) return res.status(403).json({ error: 'Origin not allowed' });
      if (req.headers['sec-fetch-site'] === 'cross-site') return res.status(403).json({ error: 'Cross-site request blocked' });
    }
    next();
  });
  const buckets = new Map();
  const limit = (req, key, max = 20) => {
    const time = now();
    if (buckets.size > 10000) for (const [k, v] of buckets) if (v.until < time) buckets.delete(k);
    const k = `${key}:${req.ip}`;
    let b = buckets.get(k);
    if (!b || b.until < time) { b = { count: 0, until: time + 15 * 60000 }; buckets.set(k, b); }
    if (++b.count > max) throw fail(429, 'Too many attempts. Try again in 15 minutes.');
  };
  const cookies = req => Object.fromEntries((req.headers.cookie || '').split(';').map(x => x.trim().split('=')));
  const cookie = (res, key, value, seconds) => res.cookie(key, value, { httpOnly: true, secure, sameSite: 'lax', path: '/', maxAge: seconds * 1000 });
  const owner = req => {
    const bearer = req.headers.authorization?.replace(/^Bearer /, '');
    const raw = cookies(req).live_owner || bearer || '';
    return db.prepare('SELECT o.* FROM owners o JOIN credentials c ON o.id=c.owner WHERE c.hash=? AND c.expires>? AND o.disabled=0').get(hash(raw), now());
  };
  const admin = adminAuth({ app, db, now, cookie, cookies, limit, adminKey });
  const mustOwner = req => { const o = owner(req); if (!o) throw fail(401, 'Sign in to manage your events'); return o; };
  const mustAdmin = req => { if (admin(req)) return; limit(req, 'admin', 100); if (!safeEqual(req.headers['x-live-admin-key'], adminKey)) throw fail(401, 'Administrator access required'); };
  const event = req => { const e = db.prepare('SELECT * FROM events WHERE slug=?').get(req.params.slug); if (!e) throw fail(404, 'Event not found'); return e; };
  const owned = req => { const e = event(req); if (admin(req)) return e; const o = mustOwner(req); if (e.owner !== o.id) throw fail(404, 'Event not found'); return e; };
  const guest = (req, e) => db.prepare('SELECT * FROM guests WHERE event=? AND hash=?').get(e.id, hash(req.headers['x-guest-token'] || cookies(req)[`live_guest_${e.id}`] || ''));
  const summary = e => ({ ...e, configured_status: e.status, status: statusOf(e), features: features(), url: `${base}/e/${e.slug}`, photo_count: db.prepare('SELECT count(*) n FROM photos WHERE event=?').get(e.id).n, guest_count: db.prepare('SELECT count(*) n FROM guests WHERE event=?').get(e.id).n });
  const canSee = (req, e, p) => {
    if (admin(req) || owner(req)?.id === e.owner) return true;
    const g = guest(req, e);
    return e.status !== 'draft' && e.reveal <= now() && p.approved === 1 && Boolean(g) && (e.visibility === 'all' || (e.visibility === 'own' && p.guest === g.id));
  };
  const publicEvent = e => ({ slug: e.slug, title: e.title, description: e.description, style: 'classic', shot_limit: e.shot_limit, closes_at: e.closes_at, reveal: e.reveal, visibility: e.visibility, status: statusOf(e), moderation: e.moderation, overlay: features().branding ? e.overlay : '', cover_url: features().branding && db.prepare("SELECT 1 FROM assets WHERE event=? AND kind='cover'").get(e.id) ? `/api/guest/${e.slug}/cover` : null });
  const mail = options.sendMail || (async (email, url) => {
    if (!process.env.LIVE_SMTP_URL || !process.env.LIVE_MAIL_FROM) return false;
    const transport = nodemailer.createTransport(process.env.LIVE_SMTP_URL);
    await transport.sendMail({ from: process.env.LIVE_MAIL_FROM, to: email, subject: 'Your Moments Live access link', text: `Open this one-time link to access your Moments Live events. It expires in 30 minutes.\n\n${url}\n\nIf you did not request this, ignore this email.` });
    return true;
  });
  async function invite(o) {
    if (o.disabled) throw fail(403, 'Enable this owner before issuing an invitation');
    const raw = token();
    db.prepare('DELETE FROM invitations WHERE owner=? OR expires<?').run(o.id, now());
    db.prepare('INSERT INTO invitations VALUES(?,?,?)').run(hash(raw), o.id, now() + 30 * 60000);
    const url = `${base}/#access=${raw}`;
    let delivery = 'manual';
    try { if (await mail(o.email, url)) delivery = 'sent'; } catch { delivery = 'failed'; }
    return { url, delivery, expires_in_minutes: 30 };
  }
  app.get('/api/health', (_req, res) => res.json({ ok: true, service: 'moments-live', version: 2 }));
  app.get('/api/config', (_req, res) => res.json({ features: features(), server_time: now() }));
  app.get('/api/admin/features', wrap((req, res) => { mustAdmin(req); res.json(features()); }));
  app.patch('/api/admin/features', wrap((req, res) => {
    mustAdmin(req);
    if (!req.body || Array.isArray(req.body) || Object.entries(req.body).some(([k, v]) => !Object.hasOwn(defaults, k) || typeof v !== 'boolean')) throw fail(400, 'Provide known feature names with boolean values');
    const updated = { ...features(), ...req.body, filters: false };
    db.prepare("INSERT OR REPLACE INTO live_settings VALUES('features',?)").run(JSON.stringify(updated));
    res.json(updated);
  }));
  app.post('/api/admin/invitations', wrap(async (req, res) => {
    mustAdmin(req);
    const email = text(req.body.email, 254).toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw fail(400, 'Enter a valid email address');
    let o = db.prepare('SELECT * FROM owners WHERE email=?').get(email);
    if (!o) { o = { id: id(), email, name: text(req.body.name) || email }; db.prepare('INSERT INTO owners(id,email,name,created) VALUES(?,?,?,?)').run(o.id, o.email, o.name, now()); }
    res.status(201).json({ owner: o, ...await invite(o) });
  }));
  app.get('/api/admin/owners', wrap((req, res) => { mustAdmin(req); res.json(db.prepare('SELECT id,email,name,created,disabled,(SELECT count(*) FROM events WHERE owner=owners.id) AS event_count FROM owners ORDER BY created DESC').all()); }));
  app.post('/api/auth/request', wrap(async (req, res) => {
    limit(req, 'login', 8);
    if (!process.env.LIVE_SMTP_URL && !options.sendMail) throw fail(503, 'Ask your Moments administrator for a new access link. Email delivery is not configured.');
    const o = db.prepare('SELECT * FROM owners WHERE email=?').get(text(req.body.email, 254).toLowerCase());
    if (o && !o.disabled) await invite(o);
    res.json({ message: 'If your email has been invited, an access link will be sent.' });
  }));
  app.post('/api/auth/accept', wrap((req, res) => {
    limit(req, 'accept');
    const o = db.transaction(() => {
      const row = db.prepare('SELECT * FROM invitations WHERE hash=? AND expires>?').get(hash(String(req.body.token || '')), now());
      if (!row) throw fail(401, 'This access link has expired or has already been used');
      if (db.prepare('SELECT disabled FROM owners WHERE id=?').get(row.owner)?.disabled) throw fail(401, 'Owner access is disabled');
      db.prepare('DELETE FROM invitations WHERE hash=?').run(row.hash);
      return db.prepare('SELECT * FROM owners WHERE id=?').get(row.owner);
    })();
    const raw = token();
    db.prepare('DELETE FROM credentials WHERE expires<?').run(now());
    db.prepare('INSERT INTO credentials VALUES(?,?,?)').run(hash(raw), o.id, now() + 7 * 86400000);
    cookie(res, 'live_owner', raw, 7 * 86400);
    res.json({ owner: o });
  }));
  app.post('/api/auth/logout', wrap((req, res) => { db.prepare('DELETE FROM credentials WHERE hash=?').run(hash(cookies(req).live_owner || '')); cookie(res, 'live_owner', '', 0); res.json({ ok: true }); }));
  app.get('/api/me', wrap((req, res) => res.json(admin(req) || mustOwner(req))));
  app.get('/api/events', wrap((req, res) => res.json(db.prepare('SELECT * FROM events WHERE owner=? ORDER BY created DESC').all(mustOwner(req).id).map(summary))));
  function settings(b, previous = {}) {
    const controlled = { closes_at: 'scheduledClosing', reveal: 'scheduledReveal', overlay: 'branding' };
    for (const [field, flag] of Object.entries(controlled)) if (b[field] !== undefined && String(b[field]) !== String(previous[field] ?? (field === 'style' ? 'classic' : field === 'overlay' ? '' : 0))) requireFeature(flag);
    if (b.visibility === 'host' && previous.visibility !== 'host') requireFeature('hostOnlyGallery');
    const value = { title: text(b.title ?? previous.title), description: text(b.description ?? previous.description, 1500), style: 'classic', shot_limit: Number(b.shot_limit ?? previous.shot_limit ?? 25), guest_limit: Number(b.guest_limit ?? previous.guest_limit ?? 250), reveal: Number(b.reveal ?? previous.reveal ?? 0), visibility: b.visibility ?? previous.visibility ?? 'all', status: b.status ?? previous.status ?? 'draft', moderation: Number(b.moderation ?? previous.moderation ?? 0), overlay: text(b.overlay ?? previous.overlay, 80) };
    value.closes_at = Number(b.closes_at ?? previous.closes_at ?? 0);
    if (!value.title || !['warm', 'mono', 'classic'].includes(value.style) || !['all', 'own', 'host'].includes(value.visibility) || !['draft', 'published', 'closed'].includes(value.status) || ![0, 1].includes(value.moderation) || !Number.isInteger(value.shot_limit) || value.shot_limit < 1 || value.shot_limit > 1000 || !Number.isInteger(value.guest_limit) || value.guest_limit < 1 || value.guest_limit > 10000 || !Number.isSafeInteger(value.reveal) || value.reveal < 0 || !Number.isSafeInteger(value.closes_at) || value.closes_at < 0) throw fail(400, 'Check event settings: valid times, 1–1000 photos and 1–10000 guests');
    return value;
  }
  app.post('/api/events', wrap((req, res) => {
    const o = mustOwner(req); res.status(201).json(createEvent(o.id, req.body));
  }));
  function createEvent(ownerId, body) {
    const s = settings(body);
    const slug = `${s.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'event'}-${crypto.randomBytes(9).toString('hex')}`;
    db.prepare(`INSERT INTO events(id,owner,slug,${Object.keys(s).join(',')},created) VALUES(${Array(4 + Object.keys(s).length).fill('?').join(',')})`).run(id(), ownerId, slug, ...Object.values(s), now());
    return summary(db.prepare('SELECT * FROM events WHERE slug=?').get(slug));
  }
  app.get('/api/admin/events', wrap((req, res) => { mustAdmin(req); res.json(db.prepare('SELECT * FROM events ORDER BY created DESC').all().map(summary)); }));
  app.post('/api/admin/events', wrap((req, res) => {
    mustAdmin(req); const o = db.prepare('SELECT * FROM owners WHERE id=? AND disabled=0').get(String(req.body.owner || ''));
    if (!o) throw fail(400, 'Choose an active event owner');
    res.status(201).json(createEvent(o.id, req.body));
  }));
  app.patch('/api/admin/owners/:id', wrap((req, res) => {
    mustAdmin(req); const o = db.prepare('SELECT * FROM owners WHERE id=?').get(req.params.id);
    if (!o) throw fail(404, 'Owner not found');
    const name = text(req.body.name ?? o.name); const email = text(req.body.email ?? o.email, 254).toLowerCase();
    const disabled = req.body.disabled ?? Boolean(o.disabled);
    if (!name || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || typeof disabled !== 'boolean') throw fail(400, 'Provide a name, valid email and boolean access setting');
    if (db.prepare('SELECT 1 FROM owners WHERE email=? AND id<>?').get(email, o.id)) throw fail(409, 'This email belongs to another owner');
    db.transaction(() => {
      db.prepare('UPDATE owners SET name=?,email=?,disabled=? WHERE id=?').run(name, email, Number(disabled), o.id);
      if (disabled || email !== o.email) { db.prepare('DELETE FROM credentials WHERE owner=?').run(o.id); db.prepare('DELETE FROM invitations WHERE owner=?').run(o.id); }
    })();
    res.json({ ok: true });
  }));
  app.patch('/api/events/:slug', wrap((req, res) => {
    const e = owned(req); const s = settings(req.body, e);
    db.prepare(`UPDATE events SET ${Object.keys(s).map(k => `${k}=?`).join(',')} WHERE id=?`).run(...Object.values(s), e.id);
    res.json(summary(event(req)));
  }));
  app.get('/api/events/:slug', wrap((req, res) => res.json(summary(owned(req)))));
  app.get('/api/events/:slug/qr', wrap(async (req, res) => { const e = owned(req); res.type('png').send(await QRCode.toBuffer(`${base}/e/${e.slug}`, { width: 1000, margin: 3, errorCorrectionLevel: 'M' })); }));
  app.get('/api/guest/:slug', wrap((req, res) => {
    const e = event(req);
    if (e.status === 'draft' && !admin(req) && owner(req)?.id !== e.owner) throw fail(404, 'Event not published yet');
    const g = guest(req, e);
    res.json({ event: publicEvent(e), features: features(), server_time: now(), uploads_enabled: features().guestUploads && statusOf(e) === 'published', joined: Boolean(g), remaining: g ? Math.max(0, e.shot_limit - g.shots) : e.shot_limit, revealed: e.reveal <= now(), guest_name: g?.name });
  }));
  app.post('/api/guest/:slug/join', wrap((req, res) => {
    limit(req, 'join', 100); const e = event(req);
    requireFeature('guestUploads');
    if (statusOf(e) !== 'published') throw fail(403, 'This event is not accepting guests');
    const old = guest(req, e); if (old) return res.json({ joined: true, remaining: Math.max(0, e.shot_limit - old.shots) });
    const raw = token();
    db.transaction(() => {
      if (db.prepare('SELECT count(*) n FROM guests WHERE event=?').get(e.id).n >= e.guest_limit) throw fail(409, 'This event has reached its guest capacity');
      db.prepare('INSERT INTO guests VALUES(?,?,?,?,0,?)').run(id(), e.id, hash(raw), text(req.body.name, 60) || 'Guest', now());
    })();
    cookie(res, `live_guest_${e.id}`, raw, 365 * 86400);
    res.status(201).json({ joined: true, guest_token: raw, remaining: e.shot_limit });
  }));
  const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 15 * 1024 * 1024, files: 1, fields: 2 } }).single('photo');
  let activeUploads = 0;
  app.use(['/api/guest/:slug/photos', '/api/events/:slug/assets/:kind'], (req, res, next) => {
    if (req.method !== 'POST') return next();
    if (activeUploads >= 2) return res.status(429).json({ error: 'The camera is busy processing photos. Please try again shortly.' });
    activeUploads++;
    let released = false;
    const release = () => { if (!released) { activeUploads--; released = true; } };
    res.once('finish', release); res.once('close', release);
    next();
  });
  app.post('/api/events/:slug/assets/:kind', (req, _res, next) => {
    try { owned(req); requireFeature('branding'); if (!['cover', 'overlay'].includes(req.params.kind)) throw fail(400, 'Unknown asset type'); next(); } catch (err) { next(err); }
  }, upload, wrap(async (req, res) => {
    const e = owned(req); requireFeature('branding'); if (!req.file) throw fail(400, 'Choose an image');
    let bytes;
    try { bytes = await sharp(req.file.buffer, { limitInputPixels: 40000000 }).rotate().resize({ width: 2400, height: 2400, fit: 'inside', withoutEnlargement: true }).png().toBuffer(); } catch { throw fail(400, 'Choose a valid image'); }
    const filename = `${id()}.png`;
    fs.writeFileSync(path.join(data, 'assets', filename), bytes);
    const old = db.prepare('SELECT * FROM assets WHERE event=? AND kind=?').get(e.id, req.params.kind);
    db.prepare('INSERT OR REPLACE INTO assets VALUES(?,?,?)').run(e.id, req.params.kind, filename);
    if (old) fs.rmSync(path.join(data, 'assets', old.filename), { force: true });
    res.json({ ok: true });
  }));
  app.get('/api/guest/:slug/cover', wrap((req, res) => {
    requireFeature('branding');
    const e = event(req); if (e.status === 'draft' && !admin(req) && owner(req)?.id !== e.owner) throw fail(404, 'Event not found');
    const asset = db.prepare("SELECT * FROM assets WHERE event=? AND kind='cover'").get(e.id);
    if (!asset) throw fail(404, 'No event cover');
    res.sendFile(path.resolve(data, 'assets', asset.filename));
  }));
  // Authenticate before buffering any upload.
  app.post('/api/guest/:slug/photos', (req, res, next) => {
    try { const e = event(req); if (!guest(req, e)) throw fail(401, 'Join the event first'); requireFeature('guestUploads'); if (statusOf(e) !== 'published') throw fail(403, 'Uploads are closed'); limit(req, 'upload', 300); next(); } catch (err) { next(err); }
  }, upload, wrap(async (req, res) => {
    const e = event(req); const g = guest(req, e); const requestId = text(req.body.request_id, 100);
    if (!requestId) throw fail(400, 'An upload request ID is required');
    const existing = db.prepare('SELECT id FROM photos WHERE guest=? AND request_id=?').get(g.id, requestId);
    if (existing) return res.json(existing);
    if (g.shots >= e.shot_limit) throw fail(409, 'You have used all your photos');
    if (!req.file) throw fail(400, 'Choose a photo');
    let bytes;
    try {
      let pipeline = sharp(req.file.buffer, { limitInputPixels: 40000000 }).rotate().resize({ width: 2400, height: 2400, fit: 'inside', withoutEnlargement: true });
      bytes = await pipeline.jpeg({ quality: 88 }).toBuffer();
    } catch { throw fail(400, 'Use a valid JPEG, PNG, WebP or supported phone photo'); }
    const graphic = db.prepare("SELECT * FROM assets WHERE event=? AND kind='overlay'").get(e.id);
    if (features().branding && (graphic || e.overlay)) {
      const { width, height } = await sharp(bytes).metadata(); const layers = [];
      if (graphic) layers.push({ input: await sharp(fs.readFileSync(path.join(data, 'assets', graphic.filename))).resize(width, height, { fit: 'fill' }).png().toBuffer() });
      if (e.overlay) {
        const escaped = e.overlay.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[c]));
        const font = Math.max(10, Math.round(width / 42));
        layers.push({ input: Buffer.from(`<svg width="${width}" height="${height}"><rect x="0" y="${height - font * 3}" width="${width}" height="${font * 3}" fill="#173e35" fill-opacity=".8"/><text x="50%" y="${height - font}" text-anchor="middle" font-family="sans-serif" font-size="${font}" fill="white">${escaped}</text></svg>`) });
      }
      bytes = await sharp(bytes).composite(layers).jpeg({ quality: 88 }).toBuffer();
    }
    const photoId = id(); const filename = `${photoId}.jpg`; const filepath = path.join(data, 'photos', filename);
    fs.writeFileSync(filepath, bytes, { flag: 'wx' });
    try {
      db.transaction(() => {
        const current = db.prepare('SELECT * FROM events WHERE id=?').get(e.id);
        requireFeature('guestUploads');
        if (statusOf(current) !== 'published') throw fail(403, 'Uploads are closed');
        const duplicate = db.prepare('SELECT id FROM photos WHERE guest=? AND request_id=?').get(g.id, requestId);
        if (duplicate) throw fail(409, 'This upload already completed. Refresh your gallery.');
        const changed = db.prepare('UPDATE guests SET shots=shots+1 WHERE id=? AND shots<?').run(g.id, current.shot_limit);
        if (!changed.changes) throw fail(409, 'You have used all your photos');
        db.prepare('INSERT INTO photos VALUES(?,?,?,?,?,0,?,?)').run(photoId, e.id, g.id, filename, current.moderation ? 0 : 1, now(), requestId);
      })();
    } catch (err) { fs.unlinkSync(filepath); throw err; }
    res.status(201).json({ id: photoId });
  }));
  app.get('/api/guest/:slug/photos', wrap((req, res) => {
    const e = event(req); if (!guest(req, e) && !admin(req) && owner(req)?.id !== e.owner) throw fail(401, 'Join the event first');
    const photos = db.prepare('SELECT p.*,g.name guest_name FROM photos p JOIN guests g ON p.guest=g.id WHERE p.event=? ORDER BY p.created DESC').all(e.id);
    res.json(photos.filter(p => canSee(req, e, p)).map(p => ({ id: p.id, approved: p.approved, favorite: p.favorite, created: p.created, guest_name: p.guest_name, url: `/api/guest/${e.slug}/photos/${p.id}/image` })));
  }));
  app.get('/api/guest/:slug/photos/:photo/image', wrap(async (req, res) => {
    if (req.query.download) requireFeature('downloads');
    const e = event(req); const p = db.prepare('SELECT * FROM photos WHERE id=? AND event=?').get(req.params.photo, e.id);
    if (!p || !canSee(req, e, p)) throw fail(404, 'Photo not available');
    if (req.query.thumb === '1') return res.type('jpeg').send(await sharp(fs.readFileSync(path.join(data, 'photos', p.filename))).resize({ width: 640, height: 640, fit: 'inside', withoutEnlargement: true }).jpeg({ quality: 75 }).toBuffer());
    if (req.query.download) res.attachment(`${p.id}.jpg`);
    res.sendFile(path.resolve(data, 'photos', p.filename));
  }));
  app.patch('/api/events/:slug/photos/:photo', wrap((req, res) => {
    const e = owned(req); const p = db.prepare('SELECT * FROM photos WHERE id=? AND event=?').get(req.params.photo, e.id);
    if (!p) throw fail(404, 'Photo not found');
    db.prepare('UPDATE photos SET approved=?,favorite=? WHERE id=?').run(req.body.approved === undefined ? p.approved : Number(Boolean(req.body.approved)), req.body.favorite === undefined ? p.favorite : Number(Boolean(req.body.favorite)), p.id);
    res.json({ ok: true });
  }));
  app.delete('/api/events/:slug/photos/:photo', wrap((req, res) => {
    const e = owned(req); const p = db.prepare('SELECT * FROM photos WHERE id=? AND event=?').get(req.params.photo, e.id);
    if (!p) throw fail(404, 'Photo not found');
    db.prepare('DELETE FROM photos WHERE id=?').run(p.id);
    fs.rmSync(path.join(data, 'photos', p.filename), { force: true });
    res.json({ ok: true });
  }));
  app.get('/api/events/:slug/download', wrap((req, res) => {
    requireFeature('downloads');
    const e = owned(req); const photos = db.prepare('SELECT * FROM photos WHERE event=?').all(e.id);
    res.attachment(`${e.slug}.zip`);
    const zip = archiver('zip', { zlib: { level: 0 } });
    zip.on('error', () => res.destroy()); res.on('close', () => zip.abort()); zip.pipe(res);
    for (const p of photos) zip.file(path.join(data, 'photos', p.filename), { name: p.filename });
    void zip.finalize();
  }));
  app.get('/api/events/:slug/photobook', wrap((req,res)=>{owned(req);requireFeature('photobooks');res.redirect(307,`/api/events/${req.params.slug}/print/album/pdf`);}));
  app.delete('/api/events/:slug', wrap((req, res) => {
    const e = owned(req);
    const photos = db.prepare('SELECT filename FROM photos WHERE event=?').all(e.id);
    const assets = db.prepare('SELECT filename FROM assets WHERE event=?').all(e.id);
    db.prepare('DELETE FROM events WHERE id=?').run(e.id);
    for (const p of photos) fs.rmSync(path.join(data, 'photos', p.filename), { force: true });
    for (const a of assets) fs.rmSync(path.join(data, 'assets', a.filename), { force: true });
    res.json({ ok: true });
  }));
  app.get('/.well-known/apple-app-site-association', (_req, res) => {
    const team = process.env.LIVE_APPLE_TEAM_ID; const bundle = process.env.LIVE_IOS_BUNDLE_ID || 'com.inmomentservices.live';
    if (!team) return res.status(503).json({ error: 'Apple association has not been configured' });
    res.json({ appclips: { apps: [`${team}.${bundle}.Clip`] }, applinks: { details: [{ appIDs: [`${team}.${bundle}`], components: [{ '/': '/e/*' }] }] } });
  });
  app.get('/.well-known/assetlinks.json', (_req, res) => {
    const fingerprints = (process.env.LIVE_ANDROID_SHA256 || '').split(',').map(x => x.trim()).filter(Boolean);
    if (!fingerprints.length) return res.status(503).json({ error: 'Android signing certificate has not been configured' });
    res.json([{ relation: ['delegate_permission/common.handle_all_urls'], target: { namespace: 'android_app', package_name: process.env.LIVE_ANDROID_PACKAGE || 'com.inmomentservices.live', sha256_cert_fingerprints: fingerprints } }]);
  });
  app.get('/api/events/:slug/slideshow', wrap((req, res) => {
    const e = owned(req); requireFeature('slideshow');
    res.json(db.prepare('SELECT id FROM photos WHERE event=? AND approved=1 ORDER BY created DESC').all(e.id).map(p => ({ id: p.id, url: `/api/guest/${e.slug}/photos/${p.id}/image` })));
  }));
  const stopPhotobooth = registerPhotobooth({app,db,mustAdmin,event,features,data,wrap,fail,url:options.galleryUrl ?? process.env.LIVE_GALLERY_URL});
  registerPrintStudio({app,db,owned,requireFeature,base,data,root,wrap,fail});
  registerWall({ app, db, owned, features, now, base, data, root, wrap, fail });
  app.use('/api', (_req, res) => res.status(404).json({ error: 'Endpoint not found' }));
  app.use((req, res, next) => {
    if (/^\/index\.html\/?$/i.test(req.path) || req.path === '/' || /^\/(e|host)(\/|$)/i.test(req.path)) {
      if (!features().webApp && !(admin(req) && /^\/host(\/|$)/i.test(req.path))) return res.status(503).type('html').send('<!doctype html><html lang="en"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Moments Live</title><body><h1>The web experience is currently unavailable.</h1><p>Your event data is retained. Contact your event host or use the Moments app.</p></body></html>');
      if (/\/slideshow\/?$/.test(req.path) && !features().slideshow) return res.status(403).send('Slideshow disabled by administrator');
    }
    next();
  });
  app.use(express.static(path.join(root, 'live-public'), { index: false }));
  app.get(['/', '/admin', '/e/:slug', '/host/:slug', '/host/:slug/slideshow', '/host/:slug/print', '/host/:slug/album'], (req, res) => {
    const storeId = process.env.LIVE_APPLE_APP_STORE_ID || '';
    const bundle = process.env.LIVE_IOS_BUNDLE_ID || 'com.inmomentservices.live';
    if (req.path.startsWith('/e/') && /^\d+$/.test(storeId) && /^[a-zA-Z0-9.-]+$/.test(bundle)) {
      const html = fs.readFileSync(path.join(root, 'live-public/index.html'), 'utf8');
      return res.type('html').send(html.replace('</head>', `<meta name="apple-itunes-app" content="app-id=${storeId}, app-clip-bundle-id=${bundle}.Clip"></head>`));
    }
    res.sendFile(path.join(root, 'live-public/index.html'));
  });
  app.use((err, _req, res, _next) => {
    const status = err.status || (err instanceof multer.MulterError ? 400 : 500);
    if (status === 500) console.error('[moments-live]', err.message);
    res.status(status).json({ error: status === 500 ? 'Unable to complete this request' : err.message });
  });
  return { app, db, close: () => { stopPhotobooth(); db.close(); } };
}
