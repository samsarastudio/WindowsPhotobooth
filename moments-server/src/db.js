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
  fs.mkdirSync(config.framesDir, { recursive: true });
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

    CREATE TABLE IF NOT EXISTS qr_templates (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      filename TEXT NOT NULL,
      source TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS qr_batches (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      event_label TEXT,
      quantity INTEGER NOT NULL,
      status TEXT NOT NULL,
      paper_size TEXT NOT NULL,
      template_id TEXT,
      notes TEXT,
      featured INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      activated_at TEXT,
      pdf_filename TEXT,
      session_epoch INTEGER NOT NULL DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS qr_codes (
      id TEXT PRIMARY KEY,
      batch_id TEXT NOT NULL REFERENCES qr_batches(id) ON DELETE CASCADE,
      code TEXT NOT NULL UNIQUE,
      serial INTEGER NOT NULL,
      status TEXT NOT NULL,
      created_at TEXT NOT NULL,
      scanned_at TEXT,
      session_epoch INTEGER NOT NULL DEFAULT 1,
      attached_photo_id TEXT,
      attached_at TEXT
    );

    CREATE TABLE IF NOT EXISTS qr_scans (
      id TEXT PRIMARY KEY,
      code_id TEXT NOT NULL REFERENCES qr_codes(id) ON DELETE CASCADE,
      batch_id TEXT NOT NULL REFERENCES qr_batches(id) ON DELETE CASCADE,
      day_key TEXT NOT NULL,
      scanned_at TEXT NOT NULL,
      user_agent TEXT,
      ip_hash TEXT,
      result TEXT NOT NULL,
      session_epoch INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS qr_scan_history (
      id TEXT PRIMARY KEY,
      batch_id TEXT NOT NULL,
      code_id TEXT NOT NULL,
      code TEXT NOT NULL,
      scanned_at TEXT,
      day_key TEXT,
      session_epoch INTEGER NOT NULL,
      attached_photo_id TEXT,
      reset_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_qr_codes_batch ON qr_codes(batch_id, serial);
    CREATE INDEX IF NOT EXISTS idx_qr_codes_code ON qr_codes(code);
    CREATE INDEX IF NOT EXISTS idx_qr_scans_batch_epoch ON qr_scans(batch_id, session_epoch, scanned_at);
    CREATE INDEX IF NOT EXISTS idx_qr_scans_day ON qr_scans(day_key);

    CREATE TABLE IF NOT EXISTS booth_releases (
      id TEXT PRIMARY KEY,
      version TEXT NOT NULL,
      build_id TEXT NOT NULL,
      filename TEXT NOT NULL,
      bytes INTEGER NOT NULL,
      sha256 TEXT,
      notes TEXT,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_booth_releases_created ON booth_releases(created_at);
  `);

  ensureColumn(db, 'qr_batches', 'linked_session_id', 'TEXT');
  fs.mkdirSync(config.boothUpdatesDir, { recursive: true });
  ensureBuiltinQrTemplate(db);
  return db;
}

function ensureColumn(database, table, column, typeSql) {
  const cols = database.prepare(`PRAGMA table_info(${table})`).all();
  if (cols.some((c) => c.name === column)) return;
  database.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${typeSql}`);
}

function ensureBuiltinQrTemplate(database) {
  const now = new Date().toISOString();
  const builtins = [
    { id: 'tpl_default_inmoment', name: 'inmoment default', filename: 'default-inmoment.png' },
    { id: 'tpl_botanical_blush', name: 'Botanical blush', filename: 'frame-botanical-blush.png' },
    { id: 'tpl_classic_gold', name: 'Classic gold', filename: 'frame-classic-gold.png' },
    { id: 'tpl_sage_minimal', name: 'Sage minimal', filename: 'frame-sage-minimal.png' },
  ];
  const insert = database.prepare(
    `INSERT OR IGNORE INTO qr_templates (id, name, filename, source, created_at)
     VALUES (?, ?, ?, 'builtin', ?)`,
  );
  const update = database.prepare(
    `UPDATE qr_templates SET name = ?, filename = ?, source = 'builtin' WHERE id = ?`,
  );
  for (const t of builtins) {
    insert.run(t.id, t.name, t.filename, now);
    update.run(t.name, t.filename, t.id);
  }
  // Keep legacy single-builtin row pointed at default if it used another id
  const any = database
    .prepare(`SELECT id FROM qr_templates WHERE source = 'builtin' AND id = 'tpl_default_inmoment'`)
    .get();
  if (!any) {
    insert.run('tpl_default_inmoment', 'inmoment default', 'default-inmoment.png', now);
  }
}

export function loadSettings() {
  const defaults = {
    defaultTtlDays: config.defaultTtlDays,
    wallTitle: 'Wall of moments',
    wallOverlay: '',
    wallColumns: 14,
    wallEmptyRatio: 0.22,
    wallBrandText: '',
    wallBrandLogo: '',
    wallMosaicTarget: '',
    wallBackdropOpacity: 0.55,
    /** End-of-show dense filled grid instead of live collage. */
    wallCompletedView: false,
    wallBrandRevealEnabled: false,
    wallBrandRevealSeconds: 45,
    wallBrandRevealHoldSeconds: 6,
    /** Active booth app release id rolled out to kiosks (empty = no forced update). */
    boothUpdateActiveId: '',
  };
  try {
    if (!fs.existsSync(config.settingsPath)) {
      return { ...defaults };
    }
    const raw = JSON.parse(fs.readFileSync(config.settingsPath, 'utf8'));
    return {
      ...defaults,
      ...raw,
      defaultTtlDays:
        typeof raw.defaultTtlDays === 'number' && raw.defaultTtlDays > 0
          ? raw.defaultTtlDays
          : defaults.defaultTtlDays,
    };
  } catch {
    return { ...defaults };
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
