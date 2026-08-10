import fs from 'node:fs';
import path from 'node:path';
import { deflateSync } from 'node:zlib';
import { nanoid } from 'nanoid';
import { config } from './config.js';
import { getDb, loadSettings, publicSession } from './db.js';
import { ensureFramesDir, listFrames } from './routes/frames.js';

function makePng(r, g, b, w = 360, h = 480) {
  const rows = [];
  for (let y = 0; y < h; y++) {
    const row = Buffer.alloc(1 + w * 3);
    for (let x = 0; x < w; x++) {
      const o = 1 + x * 3;
      const t = y / h;
      row[o] = Math.min(255, Math.round(r * (0.75 + 0.25 * t)));
      row[o + 1] = Math.min(255, Math.round(g * (0.75 + 0.25 * (1 - t))));
      row[o + 2] = Math.min(255, Math.round(b * (0.85 + 0.15 * (x / w))));
    }
    rows.push(row);
  }
  const compressed = deflateSync(Buffer.concat(rows));

  function crc32(buf) {
    let c = ~0;
    for (let i = 0; i < buf.length; i++) {
      c ^= buf[i];
      for (let k = 0; k < 8; k++) c = c & 1 ? (0xedb88320 ^ (c >>> 1)) : c >>> 1;
    }
    return ~c >>> 0;
  }
  function chunk(type, data) {
    const typeBuf = Buffer.from(type);
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length, 0);
    const crcBuf = Buffer.alloc(4);
    crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
    return Buffer.concat([len, typeBuf, data, crcBuf]);
  }
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  return Buffer.concat([
    signature,
    chunk('IHDR', ihdr),
    chunk('IDAT', compressed),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

function todayIso() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function addDaysIso(from, days) {
  const d = new Date(from);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString();
}

/** Creates a demo album with sample photos + a placeholder frame if none exist. */
export function seedSampleGallery() {
  const db = getDb();
  const settings = loadSettings();
  const eventDate = todayIso();
  const slug = `demo-${eventDate}`;
  const now = new Date();
  let session = db.prepare('SELECT * FROM sessions WHERE slug = ?').get(slug);
  if (!session) {
    session = {
      id: nanoid(12),
      slug,
      title: 'Demo album (sample photos)',
      event_date: eventDate,
      created_at: now.toISOString(),
      expires_at: addDaysIso(now, settings.defaultTtlDays || 30),
      theme: 'inmoment',
    };
    db.prepare(
      `INSERT INTO sessions (id, slug, title, event_date, created_at, expires_at, theme)
       VALUES (@id, @slug, @title, @event_date, @created_at, @expires_at, @theme)`,
    ).run(session);
  }

  const sessionDir = path.join(config.photosDir, session.slug);
  fs.mkdirSync(sessionDir, { recursive: true });

  const samples = [
    { variant: 'original', rgb: [45, 90, 60], name: 'sample-original' },
    { variant: 'framed', rgb: [180, 70, 70], name: 'sample-framed' },
    { variant: 'ai', rgb: [40, 70, 140], name: 'sample-ai' },
    { variant: 'original', rgb: [120, 90, 40], name: 'sample-guest-2' },
    { variant: 'framed', rgb: [90, 50, 110], name: 'sample-guest-2-framed' },
    { variant: 'original', rgb: [30, 120, 130], name: 'sample-guest-3' },
  ];

  let added = 0;
  for (const s of samples) {
    const existing = db
      .prepare(`SELECT id FROM photos WHERE session_id = ? AND source_local_name = ?`)
      .get(session.id, `${s.name}.png`);
    if (existing) continue;
    const id = nanoid(14);
    const filename = `${id}.png`;
    const buf = makePng(...s.rgb);
    fs.writeFileSync(path.join(sessionDir, filename), buf);
    db.prepare(
      `INSERT INTO photos
       (id, session_id, variant, filename, mime, bytes, source_local_name, width, height, created_at)
       VALUES (?, ?, ?, ?, 'image/png', ?, ?, 360, 480, ?)`,
    ).run(
      id,
      session.id,
      s.variant,
      filename,
      buf.length,
      `${s.name}.png`,
      new Date().toISOString(),
    );
    added += 1;
  }

  ensureFramesDir();
  let framesAdded = 0;
  if (listFrames().length === 0) {
    const frameName = 'demo-frame.png';
    fs.writeFileSync(path.join(config.framesDir, frameName), makePng(20, 80, 40, 640, 480));
    framesAdded = 1;
  }

  const photos = db
    .prepare('SELECT * FROM photos WHERE session_id = ? ORDER BY created_at ASC')
    .all(session.id);

  return {
    session: publicSession(session, photos),
    photosAdded: added,
    framesAdded,
    galleryUrl: `${config.publicBaseUrl}/${encodeURIComponent(session.slug)}`,
    wallUrl: `${config.publicBaseUrl}/wall`,
  };
}
