import fs from 'node:fs';
import Database from 'better-sqlite3';
import { config } from './config.js';

/** @type {import('better-sqlite3').Database | null} */
let db = null;

export function getDb() {
  if (!db) throw new Error('Database not initialized');
  return db;
}

export function initDb() {
  fs.mkdirSync(config.dataDir, { recursive: true });
  fs.mkdirSync(config.photosDir, { recursive: true });
  db = new Database(config.dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.exec(`
    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      slug TEXT NOT NULL UNIQUE,
      title TEXT NOT NULL,
      event_date TEXT NOT NULL,
      created_at TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      theme TEXT
    );
    CREATE TABLE IF NOT EXISTS photos (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
      variant TEXT NOT NULL,
      filename TEXT NOT NULL,
      mime TEXT NOT NULL,
      bytes INTEGER NOT NULL,
      source_local_name TEXT,
      width INTEGER,
      height INTEGER,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_photos_session ON photos(session_id, created_at);
    CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions(expires_at);
  `);
  return db;
}

export function loadSettings() {
  try {
    if (!fs.existsSync(config.settingsPath)) {
      return { defaultTtlDays: config.defaultTtlDays };
    }
    const raw = JSON.parse(fs.readFileSync(config.settingsPath, 'utf8'));
    return {
      defaultTtlDays:
        typeof raw.defaultTtlDays === 'number' && raw.defaultTtlDays > 0
          ? raw.defaultTtlDays
          : config.defaultTtlDays,
    };
  } catch {
    return { defaultTtlDays: config.defaultTtlDays };
  }
}

export function saveSettings(patch) {
  const cur = loadSettings();
  const next = { ...cur, ...patch };
  fs.writeFileSync(config.settingsPath, JSON.stringify(next, null, 2), 'utf8');
  return next;
}

export function isSessionExpired(session, now = new Date()) {
  return new Date(session.expires_at).getTime() <= now.getTime();
}

export function publicPhoto(sessionSlug, row) {
  return {
    id: row.id,
    variant: row.variant,
    mime: row.mime,
    bytes: row.bytes,
    sourceLocalName: row.source_local_name,
    width: row.width,
    height: row.height,
    createdAt: row.created_at,
    url: `/media/${encodeURIComponent(sessionSlug)}/${encodeURIComponent(row.filename)}`,
    shareUrl: `${config.publicBaseUrl}/${encodeURIComponent(sessionSlug)}/p/${encodeURIComponent(row.id)}`,
  };
}

export function publicSession(row, photos = []) {
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    eventDate: row.event_date,
    createdAt: row.created_at,
    expiresAt: row.expires_at,
    theme: row.theme,
    galleryUrl: `${config.publicBaseUrl}/${encodeURIComponent(row.slug)}`,
    photos: photos.map((p) => publicPhoto(row.slug, p)),
  };
}
