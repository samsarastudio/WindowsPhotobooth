import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');

dotenv.config({ path: path.join(root, '.env') });

/** Canonical guest-facing host (share links, event QR PDFs). */
export const PRODUCTION_PUBLIC_BASE_URL = (
  process.env.PRODUCTION_PUBLIC_BASE_URL || 'https://moments.inmomentservices.com'
).replace(/\/$/, '');

function intEnv(name, fallback) {
  const n = Number.parseInt(process.env[name] ?? '', 10);
  return Number.isFinite(n) ? n : fallback;
}

function dataDirPath() {
  return process.env.DATA_DIR ? path.resolve(process.env.DATA_DIR) : path.join(root, 'data');
}

function readSettingsJson() {
  try {
    const settingsPath = path.join(dataDirPath(), 'settings.json');
    if (!fs.existsSync(settingsPath)) return {};
    return JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
  } catch {
    return {};
  }
}

export function allowLocalPublicBaseUrl() {
  return String(process.env.ALLOW_LOCAL_PUBLIC_URL || '').toLowerCase() === '1';
}

/** Strip internal listen port from public URLs (Cloudflare serves 443, not :3020). */
export function normalizePublicBaseUrl(raw) {
  const fallback = 'http://127.0.0.1:3020';
  const s = String(raw || fallback).trim().replace(/\/$/, '');
  try {
    const u = new URL(s);
    const isLocal = u.hostname === '127.0.0.1' || u.hostname === 'localhost';
    if (!isLocal && u.port === '3020') {
      u.port = '';
    }
    return u.toString().replace(/\/$/, '');
  } catch {
    return s;
  }
}

export function isLocalPublicBaseUrl(url) {
  try {
    const u = new URL(String(url || ''));
    return u.hostname === '127.0.0.1' || u.hostname === 'localhost';
  } catch {
    return true;
  }
}

/**
 * Guest-facing base URL for share links, QR PDFs, and booth download URLs.
 * Priority: non-local PUBLIC_BASE_URL → non-local settings.publicBaseUrl → production default.
 * Localhost is only used when ALLOW_LOCAL_PUBLIC_URL=1 (dev).
 */
export function getPublicBaseUrl() {
  const envUrl = normalizePublicBaseUrl(process.env.PUBLIC_BASE_URL);
  if (!isLocalPublicBaseUrl(envUrl)) return envUrl;

  const settingsUrl = normalizePublicBaseUrl(readSettingsJson().publicBaseUrl);
  if (!isLocalPublicBaseUrl(settingsUrl)) return settingsUrl;

  if (allowLocalPublicBaseUrl()) return envUrl;

  return normalizePublicBaseUrl(PRODUCTION_PUBLIC_BASE_URL);
}

export const config = {
  root,
  port: intEnv('PORT', 3020),
  host: process.env.HOST || '127.0.0.1',
  /** When true, serve HTTPS (needed for phone camera on LAN; uses data/certs self-signed). */
  https:
    String(process.env.HTTPS || '').toLowerCase() === '1' ||
    String(process.env.HTTPS || '').toLowerCase() === 'true',
  get publicBaseUrl() {
    return getPublicBaseUrl();
  },
  uploadToken: process.env.UPLOAD_TOKEN || '',
  adminPin: process.env.ADMIN_PIN || '2727',
  defaultTtlDays: intEnv('DEFAULT_TTL_DAYS', 30),
  dataDir: dataDirPath(),
  get dbPath() {
    return path.join(this.dataDir, 'moments.sqlite');
  },
  get photosDir() {
    return path.join(this.dataDir, 'photos');
  },
  get framesDir() {
    return path.join(this.dataDir, 'frames');
  },
  get brandingDir() {
    return path.join(this.dataDir, 'branding');
  },
  get qrPdfsDir() {
    return path.join(this.dataDir, 'qr-pdfs');
  },
  get qrFramesDir() {
    return path.join(this.dataDir, 'qr-frames');
  },
  get settingsPath() {
    return path.join(this.dataDir, 'settings.json');
  },
  get boothUpdatesDir() {
    return path.join(this.dataDir, 'booth-updates');
  },
  get physicalDir() {
    return path.join(this.dataDir, 'physical-frames');
  },
  /** Minutes unused — kept for future; attach is guest-driven. */
  qrMatchWindowMinutes: intEnv('QR_MATCH_WINDOW_MINUTES', 10),
  publicDir: path.join(root, 'public'),
  builtinQrFramesDir: path.join(root, 'public', 'qr-frames'),
};
