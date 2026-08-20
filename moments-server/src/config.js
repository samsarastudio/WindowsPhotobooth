import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');

dotenv.config({ path: path.join(root, '.env') });

function intEnv(name, fallback) {
  const n = Number.parseInt(process.env[name] ?? '', 10);
  return Number.isFinite(n) ? n : fallback;
}

export const config = {
  root,
  port: intEnv('PORT', 3020),
  host: process.env.HOST || '127.0.0.1',
  /** When true, serve HTTPS (needed for phone camera on LAN; uses data/certs self-signed). */
  https: String(process.env.HTTPS || '').toLowerCase() === '1' || String(process.env.HTTPS || '').toLowerCase() === 'true',
  publicBaseUrl: (process.env.PUBLIC_BASE_URL || 'http://127.0.0.1:3020').replace(/\/$/, ''),
  uploadToken: process.env.UPLOAD_TOKEN || '',
  adminPin: process.env.ADMIN_PIN || '2727',
  defaultTtlDays: intEnv('DEFAULT_TTL_DAYS', 30),
  dataDir: process.env.DATA_DIR
    ? path.resolve(process.env.DATA_DIR)
    : path.join(root, 'data'),
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
  /** Minutes unused — kept for future; attach is guest-driven. */
  qrMatchWindowMinutes: intEnv('QR_MATCH_WINDOW_MINUTES', 10),
  publicDir: path.join(root, 'public'),
  builtinQrFramesDir: path.join(root, 'public', 'qr-frames'),
};
