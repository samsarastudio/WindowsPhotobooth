import fs from 'node:fs';
import path from 'node:path';
import { config } from './config.js';
import { getDb } from './db.js';

export function purgeExpiredSessions(now = new Date()) {
  const db = getDb();
  const iso = now.toISOString();
  const expired = db.prepare('SELECT * FROM sessions WHERE expires_at <= ?').all(iso);
  let photosRemoved = 0;
  for (const row of expired) {
    const count = db.prepare('SELECT COUNT(*) AS c FROM photos WHERE session_id = ?').get(row.id).c;
    photosRemoved += count;
    db.prepare('DELETE FROM sessions WHERE id = ?').run(row.id);
    const dir = path.join(config.photosDir, row.slug);
    fs.rmSync(dir, { recursive: true, force: true });
  }
  return { sessionsRemoved: expired.length, photosRemoved };
}

/**
 * Remove photo DB rows whose image file is missing/empty on disk.
 * Prevents black/broken admin thumbnails from lingering orphan records.
 */
export function purgeMissingPhotoFiles() {
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT p.id AS photo_id, p.filename, s.slug AS session_slug
       FROM photos p
       JOIN sessions s ON s.id = p.session_id`,
    )
    .all();
  const del = db.prepare('DELETE FROM photos WHERE id = ?');
  let removed = 0;
  for (const row of rows) {
    const filePath = path.join(config.photosDir, row.session_slug, row.filename);
    let ok = false;
    try {
      const st = fs.statSync(filePath);
      ok = st.isFile() && st.size > 0;
    } catch {
      ok = false;
    }
    if (!ok) {
      del.run(row.photo_id);
      removed += 1;
    }
  }
  return { photosRemoved: removed };
}
