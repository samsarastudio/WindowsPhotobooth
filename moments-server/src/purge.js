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
    if (db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='portrait_jobs'").get()) {
      const jobs = db.prepare('SELECT j.id FROM portrait_jobs j JOIN photos p ON p.id=j.original_id WHERE p.session_id=?').all(row.id);
      for (const job of jobs) {
        if (/^[A-Za-z0-9_-]{20}$/.test(job.id)) {
          fs.rmSync(path.join(config.dataDir, 'portrait-jobs', job.id), { recursive: true, force: true });
        }
        db.prepare('DELETE FROM portrait_jobs WHERE id=?').run(job.id);
      }
    }
    const count = db.prepare('SELECT COUNT(*) AS c FROM photos WHERE session_id = ?').get(row.id).c;
    photosRemoved += count;
    db.prepare('DELETE FROM sessions WHERE id = ?').run(row.id);
    const dir = path.join(config.photosDir, row.slug);
    fs.rmSync(dir, { recursive: true, force: true });
  }
  return { sessionsRemoved: expired.length, photosRemoved };
}

/**
 * Find photo DB rows whose image file is missing or empty on disk.
 */
export function scanMissingPhotoFiles() {
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT p.id AS photo_id, p.filename, p.variant, s.slug AS session_slug
       FROM photos p
       JOIN sessions s ON s.id = p.session_id`,
    )
    .all();
  const missing = [];
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
      missing.push({
        id: row.photo_id,
        album: row.session_slug,
        filename: row.filename,
        variant: row.variant,
      });
    }
  }
  return { count: missing.length, items: missing };
}

/** Remove photo DB rows whose image file is missing/empty on disk. */
export function purgeMissingPhotoFiles() {
  const { items } = scanMissingPhotoFiles();
  const db = getDb();
  const del = db.prepare('DELETE FROM photos WHERE id = ?');
  let removed = 0;
  for (const row of items) {
    del.run(row.id);
    removed += 1;
  }
  return { photosRemoved: removed };
}
