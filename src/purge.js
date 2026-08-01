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
