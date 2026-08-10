const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const { pathToFileURL, URL } = require('url');
const https = require('https');
const fs = require('fs');
const os = require('os');
const { spawn, execFile, execFileSync } = require('child_process');
const { promisify } = require('util');
const readline = require('readline');

const execFileAsync = promisify(execFile);

/**
 * Writable data beside the portable launcher (config, capture, user themes).
 * Portable .exe unpacks to %TEMP% each run — use PORTABLE_EXECUTABLE_DIR so
 * settings persist next to the launcher the user placed.
 */
function getPortableRoot() {
  if (app.isPackaged) {
    const portableDir = process.env.PORTABLE_EXECUTABLE_DIR;
    if (portableDir && typeof portableDir === 'string' && portableDir.trim()) {
      return portableDir.trim();
    }
    return path.dirname(app.getPath('exe'));
  }
  return path.join(__dirname, '..');
}

/** Shipped app files (themes, default config, bridge) — the unpacked exe directory. */
function getBundleRoot() {
  if (app.isPackaged) {
    return path.dirname(app.getPath('exe'));
  }
  return path.join(__dirname, '..');
}

if (process.env.PORTABLE_EXECUTABLE_DIR) {
  const dataDir = path.join(process.env.PORTABLE_EXECUTABLE_DIR.trim(), 'data');
  app.setPath('userData', dataDir);
  app.setPath('sessionData', dataDir);
}

function getConfigDir() {
  return path.join(getPortableRoot(), 'config');
}

function getLogsDir() {
  const dir = path.join(getPortableRoot(), 'logs');
  try {
    fs.mkdirSync(dir, { recursive: true });
  } catch (_) {}
  return dir;
}

function getLogFilePath() {
  return path.join(getLogsDir(), 'photobooth.log');
}

const LOG_MAX_BYTES = 2 * 1024 * 1024;

/**
 * Local file logger — works fully offline. Writes next to the portable exe:
 *   <exe folder>/logs/photobooth.log
 */
function appendAppLog(level, scope, message, detail) {
  try {
    const logPath = getLogFilePath();
    const ts = new Date().toISOString();
    let line = `[${ts}] [${String(level || 'info').toUpperCase()}] [${scope || 'app'}] ${message || ''}`;
    if (detail !== undefined && detail !== null && detail !== '') {
      let extra = detail;
      if (typeof detail === 'object') {
        try {
          extra = JSON.stringify(detail);
        } catch (_) {
          extra = String(detail);
        }
      }
      line += ` | ${extra}`;
    }
    line += '\n';
    try {
      const st = fs.existsSync(logPath) ? fs.statSync(logPath) : null;
      if (st && st.size > LOG_MAX_BYTES) {
        const buf = fs.readFileSync(logPath);
        const keep = buf.subarray(Math.floor(buf.length / 2));
        const cut = keep.indexOf(0x0a);
        const trimmed = cut >= 0 ? keep.subarray(cut + 1) : keep;
        fs.writeFileSync(logPath, trimmed);
      }
    } catch (_) {}
    fs.appendFileSync(logPath, line, 'utf8');
  } catch (e) {
    try {
      console.error('[log-write-failed]', e);
    } catch (_) {}
  }
}

process.on('uncaughtException', (err) => {
  appendAppLog('error', 'main', 'uncaughtException', String(err?.stack || err));
});
process.on('unhandledRejection', (reason) => {
  appendAppLog('error', 'main', 'unhandledRejection', String(reason?.stack || reason));
});

function getUserThemesDir() {
  const dir = path.join(getPortableRoot(), 'themes');
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function getBundledThemesDir() {
  return path.join(getBundleRoot(), 'themes');
}

/** User-installed themes (admin zip uploads). */
function getThemesDir() {
  return getUserThemesDir();
}

function listThemeSearchRoots() {
  const roots = [];
  const bundled = getBundledThemesDir();
  const user = getUserThemesDir();
  if (fs.existsSync(bundled)) roots.push(bundled);
  if (user !== bundled && fs.existsSync(user)) roots.push(user);
  return roots;
}

function getBrandingDir() {
  return path.join(getConfigDir(), 'branding');
}

function getBrandingLogoAbsPath() {
  const cfg = loadMergedConfig();
  const name = cfg.branding && typeof cfg.branding.logoFile === 'string' ? cfg.branding.logoFile : null;
  if (!name) return null;
  const safe = path.basename(name);
  if (safe !== name || safe.includes('..')) return null;
  return path.join(getBrandingDir(), safe);
}

function getAiBrandLogoAbsPath() {
  const cfg = loadMergedConfig();
  const name =
    cfg.branding && typeof cfg.branding.aiLogoFile === 'string' ? cfg.branding.aiLogoFile : null;
  if (!name) return null;
  const safe = path.basename(name);
  if (safe !== name || safe.includes('..')) return null;
  return path.join(getBrandingDir(), safe);
}

function getConfigDefaultPath() {
  const candidates = [
    path.join(getPortableRoot(), 'config', 'photobooth-config.default.json'),
    path.join(getBundleRoot(), 'config', 'photobooth-config.default.json'),
    path.join(__dirname, '..', 'config', 'photobooth-config.default.json'),
  ];
  for (const p of candidates) {
    if (fs.existsSync(p)) return p;
  }
  return candidates[candidates.length - 1];
}

function getConfigPath() {
  return path.join(getConfigDir(), 'photobooth-config.json');
}

function deepMerge(a, b) {
  const out = { ...a };
  for (const k of Object.keys(b || {})) {
    const v = b[k];
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      out[k] = deepMerge(a[k] || {}, v);
    } else {
      out[k] = v;
    }
  }
  return out;
}

function readJsonSafe(p) {
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

function ensureConfigFiles() {
  const dir = getConfigDir();
  fs.mkdirSync(dir, { recursive: true });
  const cfgPath = getConfigPath();
  if (!fs.existsSync(cfgPath)) {
    const def = getConfigDefaultPath();
    if (fs.existsSync(def)) {
      fs.copyFileSync(def, cfgPath);
    } else {
      fs.writeFileSync(cfgPath, '{}', 'utf8');
    }
  }
}

function loadMergedConfig() {
  ensureConfigFiles();
  const defaults = fs.existsSync(getConfigDefaultPath())
    ? readJsonSafe(getConfigDefaultPath())
    : {};
  const user = fs.existsSync(getConfigPath()) ? readJsonSafe(getConfigPath()) : {};
  return deepMerge(defaults, user);
}

function psQuote(s) {
  return "'" + String(s).replace(/'/g, "''") + "'";
}

function expandZip(zipPath, destDir) {
  fs.mkdirSync(destDir, { recursive: true });
  execFileSync(
    'powershell.exe',
    [
      '-NoProfile',
      '-NonInteractive',
      '-Command',
      `Expand-Archive -LiteralPath ${psQuote(zipPath)} -DestinationPath ${psQuote(destDir)} -Force`,
    ],
    { windowsHide: true, stdio: 'pipe' },
  );
}

function findDirectoryContainingThemeJson(root) {
  const stack = [root];
  while (stack.length) {
    const d = stack.pop();
    try {
      if (fs.existsSync(path.join(d, 'theme.json'))) return d;
      for (const ent of fs.readdirSync(d, { withFileTypes: true })) {
        if (ent.isDirectory()) stack.push(path.join(d, ent.name));
      }
    } catch (_) {}
  }
  return null;
}

function sanitizeThemeId(id) {
  const s = String(id || '').toLowerCase().replace(/[^a-z0-9-]/g, '');
  return s || 'imported';
}

/** Resolve folder on disk for a theme id or folder name (handles legacy `kia` → circuit). */
function resolveThemeDirectoryInRoot(root, themeId) {
  const raw = String(themeId || '').trim();
  if (!raw) return null;
  const normalized = raw === 'kia' ? 'circuit' : raw;
  const tryDirs = [path.join(root, normalized), path.join(root, sanitizeThemeId(normalized))];
  for (const d of tryDirs) {
    if (fs.existsSync(path.join(d, 'theme.json'))) return d;
  }
  try {
    for (const ent of fs.readdirSync(root, { withFileTypes: true })) {
      if (!ent.isDirectory()) continue;
      const tj = path.join(root, ent.name, 'theme.json');
      if (!fs.existsSync(tj)) continue;
      try {
        const meta = readJsonSafe(tj);
        const mid = meta.id || ent.name;
        if (mid === normalized || ent.name === normalized || mid === raw) {
          return path.join(root, ent.name);
        }
      } catch (_) {}
    }
  } catch (_) {}
  return null;
}

function resolveThemeDirectory(themeId) {
  for (const root of listThemeSearchRoots()) {
    const found = resolveThemeDirectoryInRoot(root, themeId);
    if (found) return found;
  }
  return null;
}

/**
 * Still + preview files. Dev: `<repo>/build/capture`. Packaged: `<folder of exe>/capture`.
 */
function getCaptureDir() {
  const fromEnv = process.env.PHOTOBOOTH_CAPTURE_DIR?.trim();
  if (fromEnv) {
    try {
      fs.mkdirSync(fromEnv, { recursive: true });
    } catch (_) {}
    return fromEnv;
  }
  const dir = app.isPackaged
    ? path.join(getPortableRoot(), 'capture')
    : path.join(__dirname, '..', 'build', 'capture');
  try {
    fs.mkdirSync(dir, { recursive: true });
  } catch (_) {}
  return dir;
}

function isPathUnder(filePath, parentDir) {
  const rel = path.relative(path.resolve(parentDir), path.resolve(filePath));
  return rel !== '' && !rel.startsWith('..') && !path.isAbsolute(rel);
}

function isPathUnderOrEqual(filePath, parentDir) {
  const rel = path.relative(path.resolve(parentDir), path.resolve(filePath));
  return !rel.startsWith('..') && !path.isAbsolute(rel);
}

const IMAGE_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.webp']);

function sanitizeModeId(id) {
  const s = String(id || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-_]/g, '');
  return s || 'mode';
}

function getAiBackgroundsRoot() {
  return path.join(getPortableRoot(), 'config', 'ai-backgrounds');
}

function getPhotoFramesDir() {
  const dir = path.join(getPortableRoot(), 'config', 'photo-frames');
  fs.mkdirSync(dir, { recursive: true });
  // Seed from bundled defaults on first run
  const bundled = path.join(getBundleRoot(), 'config', 'photo-frames');
  if (fs.existsSync(bundled)) {
    try {
      for (const ent of fs.readdirSync(bundled, { withFileTypes: true })) {
        if (!ent.isFile()) continue;
        const ext = path.extname(ent.name).toLowerCase();
        if (!IMAGE_EXTENSIONS.has(ext)) continue;
        const dest = path.join(dir, ent.name);
        if (!fs.existsSync(dest)) {
          fs.copyFileSync(path.join(bundled, ent.name), dest);
        }
      }
    } catch (_) {}
  }
  return dir;
}

function listPhotoFrameFiles() {
  const dir = getPhotoFramesDir();
  const files = [];
  try {
    for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
      if (!ent.isFile()) continue;
      const ext = path.extname(ent.name).toLowerCase();
      if (!IMAGE_EXTENSIONS.has(ext)) continue;
      files.push(ent.name);
    }
  } catch (_) {}
  files.sort((a, b) => a.localeCompare(b));
  return files;
}

/**
 * Find the largest near-black rectangle (photo hole) in a frame PNG.
 * Falls back to a centered content box if detection is weak.
 */
async function detectPhotoHole(sharpMod, framePath) {
  const img = sharpMod(framePath);
  const meta = await img.metadata();
  const width = meta.width || 1;
  const height = meta.height || 1;
  const { data, info } = await img
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const w = info.width;
  const h = info.height;
  const channels = info.channels || 4;
  const threshold = 40;
  let minX = w;
  let minY = h;
  let maxX = 0;
  let maxY = 0;
  let darkCount = 0;
  // Sample every 2nd pixel for speed
  for (let y = 0; y < h; y += 2) {
    for (let x = 0; x < w; x += 2) {
      const i = (y * w + x) * channels;
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      if (r <= threshold && g <= threshold && b <= threshold) {
        darkCount += 1;
        if (x < minX) minX = x;
        if (y < minY) minY = y;
        if (x > maxX) maxX = x;
        if (y > maxY) maxY = y;
      }
    }
  }
  const area = Math.max(0, maxX - minX) * Math.max(0, maxY - minY);
  const coverage = area / (w * h);
  if (darkCount < 80 || coverage < 0.12) {
    // Fallback: left-centered window typical of banner frames
    return {
      left: Math.round(w * 0.06),
      top: Math.round(h * 0.08),
      width: Math.round(w * 0.62),
      height: Math.round(h * 0.72),
    };
  }
  // Inset slightly so we sit inside the gold border
  const padX = Math.round((maxX - minX) * 0.015);
  const padY = Math.round((maxY - minY) * 0.015);
  return {
    left: Math.max(0, minX + padX),
    top: Math.max(0, minY + padY),
    width: Math.max(32, maxX - minX - padX * 2),
    height: Math.max(32, maxY - minY - padY * 2),
  };
}

/**
 * Convert near-black pixels in a frame to transparent so the guest photo shows through
 * and frame artwork can sit on top of the photo.
 */
async function makeFrameOverlay(sharpMod, framePath, blackThreshold = 48) {
  const { data, info } = await sharpMod(framePath)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const { width, height, channels } = info;
  for (let i = 0; i < data.length; i += channels) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    if (r <= blackThreshold && g <= blackThreshold && b <= blackThreshold) {
      data[i + 3] = 0;
    }
  }
  return sharpMod(data, { raw: { width, height, channels } }).png().toBuffer();
}

/**
 * Guest photo UNDER the frame overlay (frame artwork sits on top).
 * Photo fills the detected hole (photoScale defaults to 1 — no inset / black gap).
 */
async function compositePhotoIntoFrame(sharpMod, framePath, photoPath, photoScale = 1) {
  const scale = Math.min(1, Math.max(0.5, Number(photoScale) || 1));
  const meta = await sharpMod(framePath).metadata();
  const fw = meta.width || 1;
  const fh = meta.height || 1;
  const hole = await detectPhotoHole(sharpMod, framePath);
  // Fill the full hole; only shrink if an admin explicitly sets photoScale < 1
  const targetW = Math.max(8, Math.round(hole.width * scale));
  const targetH = Math.max(8, Math.round(hole.height * scale));
  const left = hole.left + Math.round((hole.width - targetW) / 2);
  const top = hole.top + Math.round((hole.height - targetH) / 2);

  const photoBuf = await sharpMod(photoPath)
    .resize(targetW, targetH, { fit: 'cover', position: 'centre' })
    .ensureAlpha()
    .png()
    .toBuffer();

  // Base matches hole fill — no visible gap when scale === 1
  const base = await sharpMod({
    create: {
      width: fw,
      height: fh,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 1 },
    },
  })
    .composite([{ input: photoBuf, left, top }])
    .png()
    .toBuffer();

  const frameOverlay = await makeFrameOverlay(sharpMod, framePath);
  return sharpMod(base)
    .composite([{ input: frameOverlay, left: 0, top: 0 }])
    .png()
    .toBuffer();
}

function getAiBackgroundsDir(modeId) {
  const dir = path.join(getAiBackgroundsRoot(), sanitizeModeId(modeId));
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function listBackgroundImageFiles(modeId) {
  const dir = getAiBackgroundsDir(modeId);
  const files = [];
  try {
    for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
      if (!ent.isFile()) continue;
      const ext = path.extname(ent.name).toLowerCase();
      if (!IMAGE_EXTENSIONS.has(ext)) continue;
      files.push(ent.name);
    }
  } catch (_) {}
  files.sort((a, b) => a.localeCompare(b));
  return files;
}

function pickBackgroundImage(modeId, randomize) {
  const files = listBackgroundImageFiles(modeId);
  if (!files.length) return null;
  const pick = randomize ? files[Math.floor(Math.random() * files.length)] : files[0];
  return path.join(getAiBackgroundsDir(modeId), pick);
}

function resolveAiBackgroundPath(modeId, filename) {
  const dir = getAiBackgroundsDir(modeId);
  const safe = path.basename(filename);
  if (!safe || safe !== filename || safe.includes('..')) return null;
  const full = path.join(dir, safe);
  if (!isPathUnderOrEqual(full, dir) || !fs.existsSync(full)) return null;
  return full;
}

const MAX_IMAGE_BYTES = 4 * 1024 * 1024 - 8192;
const LANDSCAPE_SIZES = [
  [1536, 1024],
  [1440, 960],
  [1296, 864],
  [1152, 768],
  [1024, 682],
  [960, 640],
  [768, 512],
];

async function pngBufferUnderLimit(sharpMod, buildAtSize) {
  for (const [w, h] of LANDSCAPE_SIZES) {
    const candidate = await buildAtSize(w, h);
    if (candidate && candidate.length <= MAX_IMAGE_BYTES) {
      return candidate;
    }
  }
  return null;
}

async function preparePersonPng(sharpMod, absImage) {
  return pngBufferUnderLimit(sharpMod, (w, h) =>
    sharpMod(absImage)
      .resize(w, h, {
        fit: 'contain',
        position: 'center',
        background: { r: 255, g: 255, b: 255, alpha: 1 },
      })
      .ensureAlpha()
      .png({ compressionLevel: 9, effort: 10, palette: true })
      .toBuffer(),
  );
}

async function buildInpaintComposite(sharpMod, backgroundPath, personPath, logoPath = null) {
  return pngBufferUnderLimit(sharpMod, async (w, h) => {
    const personMaxW = Math.round(w * 0.52);
    const personMaxH = Math.round(h * 0.72);
    let bgBuf = await sharpMod(backgroundPath)
      .resize(w, h, { fit: 'cover', position: 'center' })
      .ensureAlpha()
      .toBuffer();
    if (logoPath && fs.existsSync(logoPath)) {
      bgBuf = await overlayBrandLogosOnScene(sharpMod, bgBuf, w, h, logoPath);
    }
    const personBuf = await sharpMod(personPath)
      .resize(personMaxW, personMaxH, {
        fit: 'contain',
        position: 'south',
        background: { r: 0, g: 0, b: 0, alpha: 0 },
      })
      .ensureAlpha()
      .toBuffer();
    const personMeta = await sharpMod(personBuf).metadata();
    const pw = personMeta.width || personMaxW;
    const ph = personMeta.height || personMaxH;
    const left = Math.round((w - pw) / 2);
    const top = Math.round(h - ph - h * 0.06);
    const layers = [{ input: personBuf, left, top }];
    if (logoPath && fs.existsSync(logoPath)) {
      const accessoryLogo = await prepareBrandLogoPng(
        sharpMod,
        logoPath,
        Math.round(w * 0.09),
        Math.round(h * 0.07),
      );
      const accessoryMeta = await sharpMod(accessoryLogo).metadata();
      const aw = accessoryMeta.width || Math.round(w * 0.09);
      const ah = accessoryMeta.height || Math.round(h * 0.07);
      layers.push({
        input: accessoryLogo,
        left: Math.round(left + pw * 0.62),
        top: Math.round(top + ph * 0.08),
      });
      layers.push({
        input: accessoryLogo,
        left: Math.round(left + pw * 0.12),
        top: Math.round(top + ph * 0.42),
      });
    }
    return sharpMod(bgBuf)
      .composite(layers)
      .ensureAlpha()
      .png({ compressionLevel: 9, effort: 10, palette: true })
      .toBuffer();
  });
}

function getBrandContext(cfg) {
  const branding = cfg && cfg.branding && typeof cfg.branding === 'object' ? cfg.branding : {};
  const brandName =
    typeof branding.brandName === 'string' && branding.brandName.trim()
      ? branding.brandName.trim()
      : '';
  const applyBrandToAi = branding.applyBrandToAi !== false;
  const logoPath = getAiBrandLogoAbsPath();
  const hasLogo = !!(logoPath && fs.existsSync(logoPath));
  return {
    brandName,
    applyBrandToAi,
    logoPath: hasLogo ? logoPath : null,
    hasLogo,
  };
}

function applyBrandTokens(prompt, brandName) {
  const name = brandName && brandName.trim() ? brandName.trim() : 'the brand';
  return String(prompt || '').replace(/\{brand\}/gi, name);
}

async function prepareBrandLogoPng(sharpMod, logoPath, maxW, maxH) {
  return sharpMod(logoPath)
    .resize(maxW, maxH, { fit: 'inside', withoutEnlargement: false })
    .ensureAlpha()
    .png({ compressionLevel: 9, effort: 6 })
    .toBuffer();
}

async function overlayBrandLogosOnScene(sharpMod, sceneBuf, w, h, logoPath) {
  const signLogo = await prepareBrandLogoPng(
    sharpMod,
    logoPath,
    Math.round(w * 0.24),
    Math.round(h * 0.13),
  );
  const signMeta = await sharpMod(signLogo).metadata();
  const boxLogo = await prepareBrandLogoPng(
    sharpMod,
    logoPath,
    Math.round(w * 0.15),
    Math.round(h * 0.1),
  );
  const boxMeta = await sharpMod(boxLogo).metadata();
  const boothLogo = await prepareBrandLogoPng(
    sharpMod,
    logoPath,
    Math.round(w * 0.11),
    Math.round(h * 0.08),
  );
  const boothMeta = await sharpMod(boothLogo).metadata();
  return sharpMod(sceneBuf)
    .composite([
      {
        input: signLogo,
        left: Math.round((w - (signMeta.width || 0)) / 2),
        top: Math.round(h * 0.04),
      },
      {
        input: boxLogo,
        left: Math.round(w * 0.05),
        top: Math.round(h * 0.54),
      },
      {
        input: boxLogo,
        left: Math.round(w - (boxMeta.width || 0) - w * 0.05),
        top: Math.round(h * 0.47),
      },
      {
        input: boothLogo,
        left: Math.round((w - (boothMeta.width || 0)) / 2),
        top: Math.round(h * 0.68),
      },
    ])
    .png()
    .toBuffer();
}

async function prepareLogoReferencePng(sharpMod, logoPath) {
  return pngBufferUnderLimit(sharpMod, (w, h) => {
    const side = Math.min(w, h, 768);
    return prepareBrandLogoPng(sharpMod, logoPath, side, side);
  });
}

const BRAND_LOGO_AI_SNIPPET =
  'Use the brand logo from the reference image(s) exactly — reproduce it on booth signage, product boxes, DJ equipment, headphones, and clothing where natural. Do not invent a different logo or mascot.';

function buildGptImageEditForm(FormData, sceneBuf, fullPrompt, logoBuf = null, model = 'gpt-image-1.5') {
  const form = new FormData();
  form.append('model', model);
  form.append('image[]', sceneBuf, { filename: 'scene.png', contentType: 'image/png' });
  if (logoBuf) {
    form.append('image[]', logoBuf, { filename: 'brand-logo-ref.png', contentType: 'image/png' });
  }
  form.append('prompt', fullPrompt);
  form.append('n', '1');
  form.append('size', '1536x1024');
  form.append('quality', 'high');
  if (model !== 'gpt-image-2' && !model.startsWith('gpt-image-2')) {
    form.append('input_fidelity', 'high');
  }
  return form;
}

function buildEditPrompt(rawPrompt, options = {}) {
  const DALLE2_PROMPT_MAX = 1000;
  const { inpainting = false, brandName = '', hasLogoRef = false } = options;
  let raw = applyBrandTokens(rawPrompt, brandName);
  const suffixParts = [];
  if (inpainting) {
    suffixParts.push('Blend the person naturally into the scene. Preserve their exact face and likeness.');
  } else {
    suffixParts.push(
      'Use the entire visible scene (letterboxed in the square). Transform the whole composition—do not output a tighter zoom or headshot crop unless the uploaded image already is.',
    );
  }
  if (hasLogoRef) {
    suffixParts.push(BRAND_LOGO_AI_SNIPPET);
  }
  const suffix = ` ${suffixParts.join(' ')}`;
  const newspaperHeadlineGuard =
    raw.toLowerCase().includes('newspaper') && !raw.toUpperCase().includes('HAPPENING NOW!')
      ? ' Ensure the primary newspaper masthead headline reads exactly: HAPPENING NOW!'
      : '';
  let fullPrompt = raw + newspaperHeadlineGuard + suffix;
  if (fullPrompt.length > DALLE2_PROMPT_MAX) {
    fullPrompt = fullPrompt.slice(0, DALLE2_PROMPT_MAX);
  }
  return fullPrompt;
}

async function callOpenAiImageEdit(
  apiKey,
  pngBuf,
  fullPrompt,
  httpsPostMultipart,
  FormData,
  logoBuf = null,
) {
  const parseJsonSafe = (text) => {
    try {
      return JSON.parse(text);
    } catch (_) {
      return null;
    }
  };
  const makeErr = (statusCode, json, text) =>
    json?.error?.message || json?.message || text.slice(0, 400) || `HTTP ${statusCode}`;

  const auth = { Authorization: `Bearer ${apiKey.trim()}` };
  const gptModels = ['gpt-image-1.5', 'gpt-image-2'];
  let json = null;
  let modelUsed = gptModels[0];
  let lastErr = 'GPT image edit failed.';

  for (const model of gptModels) {
    const form = buildGptImageEditForm(FormData, pngBuf, fullPrompt, logoBuf, model);
    const gptRes = await httpsPostMultipart('https://api.openai.com/v1/images/edits', form, auth);
    const gptJson = parseJsonSafe(gptRes.body);
    if (gptRes.statusCode >= 200 && gptRes.statusCode < 300 && gptJson) {
      json = gptJson;
      modelUsed = model;
      break;
    }
    lastErr = makeErr(gptRes.statusCode, gptJson, gptRes.body);
  }

  if (!json) {
    // DALL·E 2 edits: single image only (no reference-image array). Logo is already composited locally.
    const form = new FormData();
    form.append('image', pngBuf, { filename: 'photo.png', contentType: 'image/png' });
    form.append('prompt', fullPrompt);
    form.append('model', 'dall-e-2');
    form.append('n', '1');
    form.append('size', '1536x1024');
    form.append('response_format', 'b64_json');
    const d2Res = await httpsPostMultipart('https://api.openai.com/v1/images/edits', form, auth);
    const d2Json = parseJsonSafe(d2Res.body);
    const d2Ok = d2Res.statusCode >= 200 && d2Res.statusCode < 300 && !!d2Json;
    if (!d2Ok) {
      const fallbackErr = makeErr(d2Res.statusCode, d2Json, d2Res.body);
      return {
        ok: false,
        error: `${lastErr} (GPT image edits failed; fallback dall-e-2 also failed: ${fallbackErr})`,
      };
    }
    json = d2Json;
    modelUsed = 'dall-e-2';
  }

  const entry = json.data && json.data[0];
  const b64 = entry && entry.b64_json;
  const imageUrl = entry && entry.url;
  let outBuf;
  if (b64) {
    outBuf = Buffer.from(b64, 'base64');
  } else if (imageUrl) {
    const imgRes = await fetch(imageUrl);
    if (!imgRes.ok) {
      return { ok: false, error: 'Could not download generated image.' };
    }
    const ab = await imgRes.arrayBuffer();
    outBuf = Buffer.from(ab);
  } else {
    return { ok: false, error: 'No image data in API response.' };
  }
  return { ok: true, outBuf, model: modelUsed };
}

/**
 * POST multipart/form-data using Node https + form.pipe().
 * Electron/Node global fetch (undici) often corrupts the `form-data` stream and OpenAI returns
 * "failed to parse multipart/form-data".
 */
function httpsPostMultipart(urlString, form, authHeaders) {
  return new Promise((resolve, reject) => {
    const u = new URL(urlString);
    const req = https.request(
      {
        hostname: u.hostname,
        port: u.port || 443,
        path: `${u.pathname}${u.search}`,
        method: 'POST',
        headers: {
          ...authHeaders,
          ...form.getHeaders(),
        },
      },
      (res) => {
        const chunks = [];
        res.on('data', (chunk) => chunks.push(chunk));
        res.on('end', () => {
          resolve({
            statusCode: res.statusCode,
            body: Buffer.concat(chunks).toString('utf8'),
          });
        });
      },
    );
    req.on('error', reject);
    form.pipe(req);
  });
}

function httpsGet(urlString, authHeaders) {
  return new Promise((resolve, reject) => {
    const u = new URL(urlString);
    const req = https.request(
      {
        hostname: u.hostname,
        port: u.port || 443,
        path: `${u.pathname}${u.search}`,
        method: 'GET',
        headers: { ...authHeaders },
      },
      (res) => {
        const chunks = [];
        res.on('data', (chunk) => chunks.push(chunk));
        res.on('end', () => {
          resolve({
            statusCode: res.statusCode,
            body: Buffer.concat(chunks).toString('utf8'),
          });
        });
      },
    );
    req.on('error', reject);
    req.end();
  });
}

function httpsPostJson(urlString, jsonBody, authHeaders) {
  return new Promise((resolve, reject) => {
    const u = new URL(urlString);
    const body = JSON.stringify(jsonBody);
    const req = https.request(
      {
        hostname: u.hostname,
        port: u.port || 443,
        path: `${u.pathname}${u.search}`,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(body),
          ...authHeaders,
        },
      },
      (res) => {
        const chunks = [];
        res.on('data', (chunk) => chunks.push(chunk));
        res.on('end', () => {
          resolve({
            statusCode: res.statusCode,
            body: Buffer.concat(chunks).toString('utf8'),
          });
        });
      },
    );
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

function findBridgeExecutable() {
  const portable = getPortableRoot();
  const bundle = getBundleRoot();
  const candidates = [
    path.join(portable, 'edsdk-bridge.exe'),
    path.join(bundle, 'edsdk-bridge.exe'),
    path.join(__dirname, 'edsdk-bridge.exe'),
    path.join(portable, 'resources', 'edsdk-bridge.exe'),
    path.join(bundle, 'resources', 'edsdk-bridge.exe'),
  ];
  for (const p of candidates) {
    if (fs.existsSync(p)) return p;
  }
  return null;
}

const NATIVE_CAMERA_FILES = ['edsdk-bridge.exe', 'EDSDK.dll', 'EdsImage.dll'];

/**
 * Copy Canon bridge + DLLs from the unpacked app bundle next to the portable
 * launcher (PORTABLE_EXECUTABLE_DIR) so they persist and load reliably.
 */
function ensureNativeCameraAssets() {
  const destRoot = getPortableRoot();
  const sources = [getBundleRoot(), path.join(__dirname, '..', 'bin'), __dirname];
  let copied = 0;
  for (const file of NATIVE_CAMERA_FILES) {
    const dest = path.join(destRoot, file);
    if (fs.existsSync(dest)) continue;
    let src = null;
    for (const root of sources) {
      const candidate = path.join(root, file);
      if (fs.existsSync(candidate)) {
        src = candidate;
        break;
      }
    }
    if (!src) {
      appendAppLog('warn', 'edsdk-bridge', `missing native file, cannot stage: ${file}`);
      continue;
    }
    try {
      fs.mkdirSync(destRoot, { recursive: true });
      fs.copyFileSync(src, dest);
      copied += 1;
      appendAppLog('info', 'edsdk-bridge', `staged ${file} → ${dest}`);
    } catch (e) {
      appendAppLog('error', 'edsdk-bridge', `failed staging ${file}`, String(e));
    }
  }
  const bridge = findBridgeExecutable();
  appendAppLog('info', 'edsdk-bridge', 'ensureNativeCameraAssets', {
    destRoot,
    copied,
    bridgeFound: !!bridge,
    bridgePath: bridge,
  });
  return bridge;
}

let mainWindow = null;
let bridgeProc = null;
let bridgeReadline = null;
const bridgeQueue = [];
/** Delayed full release after `close` — cancelled if another camera cmd arrives (close→init). */
let bridgeReleaseTimer = null;

function cancelBridgeRelease() {
  if (bridgeReleaseTimer) {
    clearTimeout(bridgeReleaseTimer);
    bridgeReleaseTimer = null;
  }
}

function scheduleBridgeRelease() {
  cancelBridgeRelease();
  bridgeReleaseTimer = setTimeout(() => {
    bridgeReleaseTimer = null;
    void (async () => {
      try {
        if (bridgeProc && !bridgeProc.killed) {
          await sendBridge({ cmd: 'shutdown' });
        }
      } catch (e) {
        appendAppLog('warn', 'edsdk-bridge', 'deferred shutdown', String(e));
      } finally {
        killBridge();
      }
    })();
  }, 800);
}

function killBridge() {
  cancelBridgeRelease();
  if (bridgeReadline) {
    try {
      bridgeReadline.close();
    } catch (_) {}
    bridgeReadline = null;
  }
  if (bridgeProc) {
    try {
      bridgeProc.kill();
    } catch (_) {}
    bridgeProc = null;
  }
  while (bridgeQueue.length) {
    const p = bridgeQueue.shift();
    try {
      p.reject(new Error('Bridge killed'));
    } catch (_) {}
  }
}

/** Orphan bridges hold the Canon USB lock and make the next session fail. */
function killOrphanBridgeProcesses() {
  if (process.platform !== 'win32') return;
  try {
    execFileSync('taskkill', ['/F', '/IM', 'edsdk-bridge.exe', '/T'], {
      windowsHide: true,
      stdio: 'ignore',
    });
    appendAppLog('info', 'edsdk-bridge', 'cleared orphan edsdk-bridge.exe processes');
  } catch (_) {
    /* none running — taskkill exits non-zero */
  }
}

function ensureBridgeProcess() {
  if (bridgeProc && !bridgeProc.killed) return true;
  let exe = findBridgeExecutable();
  if (!exe) {
    ensureNativeCameraAssets();
    exe = findBridgeExecutable();
  }
  if (!exe) {
    appendAppLog('error', 'edsdk-bridge', 'edsdk-bridge.exe not found', {
      portableRoot: getPortableRoot(),
      bundleRoot: getBundleRoot(),
    });
    return false;
  }

  // Ensure no leftover bridge from a crashed/previous run owns the camera.
  killOrphanBridgeProcesses();

  appendAppLog('info', 'edsdk-bridge', 'spawning', { exe, cwd: path.dirname(exe) });
  const cwd = path.dirname(exe);
  bridgeProc = spawn(exe, [], {
    cwd,
    stdio: ['pipe', 'pipe', 'pipe'],
    windowsHide: true,
  });

  bridgeReadline = readline.createInterface({ input: bridgeProc.stdout });

  bridgeReadline.on('line', (line) => {
    const pending = bridgeQueue.shift();
    if (!pending) return;
    try {
      const msg = JSON.parse(line);
      pending.resolve(msg);
    } catch (e) {
      pending.reject(new Error(line || String(e)));
    }
  });

  bridgeProc.stderr.on('data', (d) => {
    const text = d.toString();
    console.error('[edsdk-bridge]', text);
    appendAppLog('warn', 'edsdk-bridge', 'stderr', text.trim().slice(0, 500));
  });

  bridgeProc.on('exit', (code, signal) => {
    appendAppLog('warn', 'edsdk-bridge', 'process exited', { code, signal });
    bridgeProc = null;
    // Let a final stdout line resolve before rejecting leftovers (shutdown race).
    setImmediate(() => {
      if (bridgeReadline) {
        try {
          bridgeReadline.close();
        } catch (_) {}
        bridgeReadline = null;
      }
      while (bridgeQueue.length) {
        const p = bridgeQueue.shift();
        p.reject(new Error('Bridge exited'));
      }
    });
  });

  return true;
}

const BRIDGE_CMD_TIMEOUT_MS = 8000;

function sendBridge(jsonObj) {
  return new Promise((resolve) => {
    // Any live camera command cancels a pending idle release (e.g. close → init).
    if (jsonObj?.cmd !== 'shutdown') {
      cancelBridgeRelease();
    }
    if (!ensureBridgeProcess()) {
      resolve({ ok: false, err: 'NO_BRIDGE', msg: 'edsdk-bridge.exe not found next to app' });
      return;
    }
    let settled = false;
    const finish = (msg) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(msg);
    };
    const entry = {
      resolve: (msg) => finish(msg),
      reject: (err) =>
        finish({ ok: false, err: 'BRIDGE_ERROR', msg: String(err?.message || err) }),
    };
    const timer = setTimeout(() => {
      const idx = bridgeQueue.indexOf(entry);
      if (idx >= 0) bridgeQueue.splice(idx, 1);
      appendAppLog('error', 'edsdk-bridge', 'command timed out', {
        cmd: jsonObj?.cmd,
        timeoutMs: BRIDGE_CMD_TIMEOUT_MS,
      });
      finish({
        ok: false,
        err: 'BRIDGE_TIMEOUT',
        msg: `Camera SDK timed out (${jsonObj?.cmd || 'cmd'}, ${BRIDGE_CMD_TIMEOUT_MS}ms)`,
      });
    }, BRIDGE_CMD_TIMEOUT_MS);
    bridgeQueue.push(entry);
    try {
      const line = JSON.stringify(jsonObj);
      bridgeProc.stdin.write(line + '\n');
    } catch (e) {
      const idx = bridgeQueue.indexOf(entry);
      if (idx >= 0) bridgeQueue.splice(idx, 1);
      finish({ ok: false, err: 'BRIDGE_WRITE', msg: String(e) });
    }
  });
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 720,
    fullscreen: true,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  const distIndex = path.join(__dirname, '..', 'dist', 'photobooth-app', 'browser', 'index.html');
  if (fs.existsSync(distIndex)) {
    mainWindow.loadFile(distIndex);
  } else {
    mainWindow.loadURL('http://localhost:4200');
  }
}

app.whenReady().then(() => {
  ensureConfigFiles();
  getLogsDir();
  ensureNativeCameraAssets();
  appendAppLog('info', 'main', 'app ready', {
    packaged: app.isPackaged,
    portableRoot: getPortableRoot(),
    bundleRoot: getBundleRoot(),
    hasBridge: !!findBridgeExecutable(),
    bridgePath: findBridgeExecutable(),
    platform: process.platform,
    arch: process.arch,
    versions: process.versions,
  });
  // Tablets / Windows often need an explicit grant for getUserMedia.
  const { session } = require('electron');
  session.defaultSession.setPermissionRequestHandler((_wc, permission, callback) => {
    appendAppLog('info', 'permissions', 'permission request', { permission });
    if (permission === 'media' || permission === 'camera' || permission === 'microphone') {
      callback(true);
      return;
    }
    callback(false);
  });
  session.defaultSession.setPermissionCheckHandler((_wc, permission) => {
    return permission === 'media' || permission === 'camera' || permission === 'microphone';
  });
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  killBridge();
  if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', () => killBridge());

ipcMain.handle('app:getPaths', () => {
  const captureDir = getCaptureDir();
  return {
    portableRoot: getPortableRoot(),
    captureDir,
    themesDir: getThemesDir(),
    configPath: getConfigPath(),
    logsDir: getLogsDir(),
    logFile: getLogFilePath(),
    hasBridge: !!findBridgeExecutable(),
  };
});

ipcMain.handle('app:log', async (_e, payload) => {
  try {
    const level = payload?.level || 'info';
    const scope = payload?.scope || 'renderer';
    const message = payload?.message || '';
    const detail = payload?.detail;
    appendAppLog(level, scope, message, detail);
    return { ok: true, logFile: getLogFilePath() };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
});

ipcMain.handle('app:openLogsFolder', async () => {
  try {
    const { shell } = require('electron');
    const dir = getLogsDir();
    const err = await shell.openPath(dir);
    if (err) return { ok: false, error: err, path: dir };
    return { ok: true, path: dir };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
});

ipcMain.handle('camera:invoke', async (_e, cmd) => {
  const cmdName = cmd?.cmd || 'unknown';
  if (cmdName !== 'preview') {
    appendAppLog('info', 'camera', `invoke ${cmdName}`, cmd);
  }
  const res = await sendBridge(cmd);
  if (res && !res.ok && cmdName !== 'preview') {
    appendAppLog('error', 'camera', `${cmdName} failed`, {
      err: res.err,
      msg: res.msg,
    });
  }
  if (res && res.ok && cmd.cmd === 'preview' && res.path) {
    try {
      res.previewFileUrl = pathToFileURL(res.path).href;
    } catch (err) {
      res.previewFileUrl = null;
      res.readErr = String(err);
      appendAppLog('warn', 'camera', 'preview url failed', String(err));
    }
  }
  // After close, release the bridge once idle so Canon isn't held warm between guests.
  // Debounced + cancelled by the next cmd so close→init on capture open still works.
  if (cmdName === 'close' && res && res.ok) {
    scheduleBridgeRelease();
  }
  return res;
});

ipcMain.handle('file:readBase64', async (_e, filePath) => {
  const buf = fs.readFileSync(filePath);
  const ext = path.extname(filePath).toLowerCase();
  const mime =
    ext === '.png' ? 'image/png' : ext === '.webp' ? 'image/webp' : 'image/jpeg';
  return `data:${mime};base64,${buf.toString('base64')}`;
});

ipcMain.handle('file:saveJpeg', async (_e, fullPath, base64Body) => {
  const dir = path.dirname(fullPath);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(fullPath, Buffer.from(base64Body, 'base64'));
  return { ok: true, path: fullPath };
});

ipcMain.handle('openai:generateImage', async (_e, payload) => {
  appendAppLog('info', 'openai', 'generateImage start', {
    modeId: payload?.modeId,
    useInpainting: !!payload?.useInpainting,
    hasPrompt: !!(payload && payload.prompt),
  });
  try {
    let sharpMod;
    let FormData;
    try {
      sharpMod = require('sharp');
      FormData = require('form-data');
    } catch (_dep) {
      appendAppLog('error', 'openai', 'missing sharp/form-data');
      return {
        ok: false,
        error: 'Server dependencies missing: run npm install sharp form-data in the app folder.',
      };
    }
    const imagePath =
      payload && typeof payload.imagePath === 'string' ? payload.imagePath : '';
    const prompt = payload && typeof payload.prompt === 'string' ? payload.prompt : '';
    const modeId = payload && typeof payload.modeId === 'string' ? payload.modeId.trim() : '';
    const useInpainting = !!(payload && payload.useInpainting);
    const randomizeBackground = payload?.randomizeBackground !== false;
    const inpaintPrompt =
      payload && typeof payload.inpaintPrompt === 'string' ? payload.inpaintPrompt.trim() : '';
    if (!imagePath.trim() || !prompt.trim()) {
      return { ok: false, error: 'Missing image path or prompt.' };
    }
    const cfg = loadMergedConfig();
    const apiKey = cfg.openAiApiKey;
    const brand = getBrandContext(cfg);
    const useBrandLogo = brand.applyBrandToAi && brand.hasLogo;
    if (!apiKey || typeof apiKey !== 'string' || !apiKey.trim()) {
      return { ok: false, error: 'OpenAI API key not configured.' };
    }
    const captureRoot = path.resolve(getCaptureDir());
    const absImage = path.resolve(imagePath);
    if (!fs.existsSync(absImage)) {
      return { ok: false, error: 'Source image not found.' };
    }
    if (!isPathUnder(absImage, captureRoot)) {
      return { ok: false, error: 'Invalid image path.' };
    }

    let pngBuf = null;
    let backgroundUsed = null;
    let effectivePrompt = prompt;

    if (useInpainting && modeId) {
      const bgPath = pickBackgroundImage(modeId, randomizeBackground);
      if (!bgPath) {
        return {
          ok: false,
          error: `No background images found for mode "${modeId}". Upload backgrounds in Admin → AI.`,
        };
      }
      backgroundUsed = path.basename(bgPath);
      pngBuf = await buildInpaintComposite(
        sharpMod,
        bgPath,
        absImage,
        useBrandLogo ? brand.logoPath : null,
      );
      effectivePrompt = inpaintPrompt || prompt;
    } else {
      pngBuf = await preparePersonPng(sharpMod, absImage);
    }

    if (!pngBuf) {
      return { ok: false, error: 'Prepared PNG is still above 4 MB.' };
    }

    let logoRefBuf = null;
    if (useBrandLogo && brand.logoPath) {
      logoRefBuf = await prepareLogoReferencePng(sharpMod, brand.logoPath);
    }

    const fullPrompt = buildEditPrompt(effectivePrompt, {
      inpainting: useInpainting,
      brandName: brand.brandName,
      hasLogoRef: !!logoRefBuf,
    });
    const editRes = await callOpenAiImageEdit(
      apiKey,
      pngBuf,
      fullPrompt,
      httpsPostMultipart,
      FormData,
      logoRefBuf,
    );
    if (!editRes.ok) {
      appendAppLog('error', 'openai', 'image edit failed', editRes.error);
      return { ok: false, error: editRes.error };
    }
    const dir = path.dirname(absImage);
    const base = path.basename(absImage, path.extname(absImage));
    const outPath = path.join(dir, `${base}_ai.png`);
    fs.writeFileSync(outPath, editRes.outBuf);
    appendAppLog('info', 'openai', 'generateImage ok', {
      model: editRes.model,
      outPath,
      inpainting: useInpainting,
    });
    return {
      ok: true,
      path: outPath,
      model: editRes.model,
      backgroundUsed,
      inpainting: useInpainting,
      brandApplied: useBrandLogo,
    };
  } catch (e) {
    appendAppLog('error', 'openai', 'generateImage exception', String(e));
    return { ok: false, error: String(e) };
  }
});

function configForRenderer(full) {
  if (!full || typeof full !== 'object') return full;
  const { adminPin: _omit, openAiApiKey: _key, ...rest } = full;
  return {
    ...rest,
    openAiConfigured:
      typeof full.openAiApiKey === 'string' && full.openAiApiKey.trim().length > 0,
  };
}

ipcMain.handle('admin:getConfig', async () => {
  try {
    return { ok: true, config: configForRenderer(loadMergedConfig()) };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
});

ipcMain.handle('admin:verifyPin', async (_e, pin) => {
  try {
    const full = loadMergedConfig();
    const expected = String(full.adminPin ?? '2727');
    return { ok: true, valid: expected === String(pin ?? '') };
  } catch (e) {
    return { ok: false, error: String(e), valid: false };
  }
});

ipcMain.handle('admin:saveConfig', async (_e, partial) => {
  try {
    ensureConfigFiles();
    const merged = deepMerge(loadMergedConfig(), partial || {});
    fs.mkdirSync(getConfigDir(), { recursive: true });
    fs.writeFileSync(getConfigPath(), JSON.stringify(merged, null, 2), 'utf8');
    return { ok: true, config: configForRenderer(merged) };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
});

ipcMain.handle('admin:testOpenAiKey', async (_e, draftKey) => {
  try {
    const cfg = loadMergedConfig();
    const fromDraft = typeof draftKey === 'string' ? draftKey.trim() : '';
    const key = fromDraft || (typeof cfg.openAiApiKey === 'string' ? cfg.openAiApiKey.trim() : '');
    if (!key) {
      return { ok: false, error: 'No API key to test. Enter a key or save one first.' };
    }
    const res = await httpsGet('https://api.openai.com/v1/models', {
      Authorization: `Bearer ${key}`,
    });
    if (res.statusCode >= 200 && res.statusCode < 300) {
      return { ok: true, message: 'API key is valid.' };
    }
    let detail = res.body;
    try {
      const j = JSON.parse(res.body);
      detail = j.error?.message || j.message || res.body;
    } catch (_) {}
    return {
      ok: false,
      error: `HTTP ${res.statusCode}: ${String(detail).slice(0, 240)}`,
    };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
});

ipcMain.handle('admin:listThemes', async () => {
  try {
    const byId = new Map();
    for (const root of listThemeSearchRoots()) {
      let entries = [];
      try {
        entries = fs.readdirSync(root, { withFileTypes: true });
      } catch (_) {
        continue;
      }
      for (const name of entries) {
        if (!name.isDirectory()) continue;
        const tj = path.join(root, name.name, 'theme.json');
        if (!fs.existsSync(tj)) continue;
        try {
          const meta = readJsonSafe(tj);
          const id = meta.id || name.name;
          byId.set(id, {
            id,
            folder: name.name,
            name: meta.name || name.name,
            version: meta.version,
            author: meta.author,
            description: meta.description,
          });
        } catch (_) {}
      }
    }
    return { ok: true, themes: [...byId.values()] };
  } catch (e) {
    return { ok: false, error: String(e), themes: [] };
  }
});

ipcMain.handle('admin:getThemeStylesheetUrl', async () => {
  try {
    const cfg = loadMergedConfig();
    const raw = cfg.activeThemeId || 'default';
    const id = raw === 'kia' ? 'circuit' : raw;
    const themeDir = resolveThemeDirectory(id);
    if (!themeDir) return { ok: true, url: null };
    const cssPath = path.join(themeDir, 'styles.css');
    if (!fs.existsSync(cssPath)) return { ok: true, url: null };
    return { ok: true, url: pathToFileURL(cssPath).href };
  } catch (e) {
    return { ok: false, error: String(e), url: null };
  }
});

ipcMain.handle('admin:pickThemeZip', async () => {
  const win = BrowserWindow.getFocusedWindow() || mainWindow;
  const r = await dialog.showOpenDialog(win, {
    title: 'Select theme zip',
    properties: ['openFile'],
    filters: [{ name: 'Zip', extensions: ['zip'] }],
  });
  if (r.canceled || !r.filePaths?.length) return { ok: false, canceled: true };
  return { ok: true, path: r.filePaths[0] };
});

ipcMain.handle('admin:exportThemeZip', async (_e, themeId) => {
  try {
    const themeDir = resolveThemeDirectory(themeId);
    if (!themeDir || !fs.existsSync(themeDir)) {
      return { ok: false, error: 'Theme not found.' };
    }
    let meta = {};
    try {
      meta = readJsonSafe(path.join(themeDir, 'theme.json'));
    } catch (_) {}
    const slug = sanitizeThemeId(meta.id || path.basename(themeDir));
    const downloads = app.getPath('downloads');
    const out = path.join(downloads, `Photobooth-theme-${slug}.zip`);
    const glob = path.join(themeDir, '*');
    execFileSync(
      'powershell.exe',
      [
        '-NoProfile',
        '-NonInteractive',
        '-Command',
        `Compress-Archive -Path ${psQuote(glob)} -DestinationPath ${psQuote(out)} -Force`,
      ],
      { windowsHide: true, stdio: 'pipe' },
    );
    return { ok: true, path: out };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
});

ipcMain.handle('admin:deleteTheme', async (_e, themeId) => {
  try {
    const themeDir = resolveThemeDirectory(themeId);
    if (!themeDir || !fs.existsSync(themeDir)) {
      return { ok: false, error: 'Theme not found.' };
    }
    const userThemes = getUserThemesDir();
    if (!isPathUnderOrEqual(themeDir, userThemes)) {
      return { ok: false, error: 'Cannot remove built-in themes.' };
    }
    const folderName = path.basename(themeDir);
    let meta = {};
    try {
      meta = readJsonSafe(path.join(themeDir, 'theme.json'));
    } catch (_) {}
    const deletedId = meta.id || folderName;

    ensureConfigFiles();
    const cfg = loadMergedConfig();
    let active = cfg.activeThemeId || 'default';
    if (active === 'kia') active = 'circuit';

    fs.rmSync(themeDir, { recursive: true, force: true });

    const activeMatches =
      active === deletedId ||
      active === folderName ||
      sanitizeThemeId(active) === sanitizeThemeId(deletedId);

    if (activeMatches) {
      const merged = deepMerge(loadMergedConfig(), { activeThemeId: 'default' });
      fs.writeFileSync(getConfigPath(), JSON.stringify(merged, null, 2), 'utf8');
      return { ok: true, removedId: deletedId, switchedActiveToDefault: true };
    }
    return { ok: true, removedId: deletedId, switchedActiveToDefault: false };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
});

ipcMain.handle('admin:installThemeFromZip', async (_e, zipPath) => {
  const tmp = path.join(app.getPath('temp'), `pb-theme-${Date.now()}`);
  try {
    expandZip(zipPath, tmp);
    const themeDir = findDirectoryContainingThemeJson(tmp);
    if (!themeDir) {
      return { ok: false, error: 'No theme.json found in archive.' };
    }
    const meta = readJsonSafe(path.join(themeDir, 'theme.json'));
    const id = sanitizeThemeId(meta.id);
    const dest = path.join(getUserThemesDir(), id);
    fs.mkdirSync(getUserThemesDir(), { recursive: true });
    if (fs.existsSync(dest)) {
      fs.rmSync(dest, { recursive: true, force: true });
    }
    fs.cpSync(themeDir, dest, { recursive: true });
    const metaPath = path.join(dest, 'theme.json');
    const fixed = { ...meta, id };
    fs.writeFileSync(metaPath, JSON.stringify(fixed, null, 2), 'utf8');
    fs.rmSync(tmp, { recursive: true, force: true });
    return { ok: true, id };
  } catch (e) {
    try {
      fs.rmSync(tmp, { recursive: true, force: true });
    } catch (_) {}
    return { ok: false, error: String(e) };
  }
});

ipcMain.handle('admin:pickLogoImage', async () => {
  const win = BrowserWindow.getFocusedWindow() || mainWindow;
  const r = await dialog.showOpenDialog(win, {
    title: 'Select booth logo',
    properties: ['openFile'],
    filters: [
      {
        name: 'Images',
        extensions: ['png', 'jpg', 'jpeg', 'webp', 'gif', 'svg'],
      },
    ],
  });
  if (r.canceled || !r.filePaths?.length) return { ok: false, canceled: true };
  return { ok: true, path: r.filePaths[0] };
});

ipcMain.handle('admin:installLogo', async (_e, sourcePath) => {
  try {
    if (!sourcePath || typeof sourcePath !== 'string' || !fs.existsSync(sourcePath)) {
      return { ok: false, error: 'Invalid source file.' };
    }
    const ext = path.extname(sourcePath).toLowerCase() || '.png';
    const allowed = ['.png', '.jpg', '.jpeg', '.webp', '.gif', '.svg'];
    const useExt = allowed.includes(ext) ? ext : '.png';
    const destName = `booth-logo${useExt}`;
    ensureConfigFiles();
    const brandingDir = getBrandingDir();
    fs.mkdirSync(brandingDir, { recursive: true });
    const dest = path.join(brandingDir, destName);
    try {
      const prev = getBrandingLogoAbsPath();
      if (prev && fs.existsSync(prev) && path.normalize(prev) !== path.normalize(dest)) {
        fs.unlinkSync(prev);
      }
    } catch (_) {}
    fs.copyFileSync(sourcePath, dest);
    const merged = deepMerge(loadMergedConfig(), {
      branding: { logoFile: destName },
    });
    fs.writeFileSync(getConfigPath(), JSON.stringify(merged, null, 2), 'utf8');
    const url = `${pathToFileURL(dest).href}?v=${Date.now()}`;
    return { ok: true, logoFile: destName, url };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
});

ipcMain.handle('admin:clearLogo', async () => {
  try {
    ensureConfigFiles();
    const p = getBrandingLogoAbsPath();
    if (p && fs.existsSync(p)) fs.unlinkSync(p);
    const merged = deepMerge(loadMergedConfig(), {
      branding: { logoFile: null },
    });
    fs.writeFileSync(getConfigPath(), JSON.stringify(merged, null, 2), 'utf8');
    return { ok: true };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
});

ipcMain.handle('admin:getBrandingLogoUrl', async () => {
  try {
    const p = getBrandingLogoAbsPath();
    if (!p || !fs.existsSync(p)) return { ok: true, url: null };
    return { ok: true, url: `${pathToFileURL(p).href}?v=${Date.now()}` };
  } catch (e) {
    return { ok: false, error: String(e), url: null };
  }
});

ipcMain.handle('admin:pickAiLogoImage', async () => {
  const win = BrowserWindow.getFocusedWindow() || mainWindow;
  const r = await dialog.showOpenDialog(win, {
    title: 'Select AI brand reference logo',
    properties: ['openFile'],
    filters: [
      {
        name: 'Images',
        extensions: ['png', 'jpg', 'jpeg', 'webp', 'gif', 'svg'],
      },
    ],
  });
  if (r.canceled || !r.filePaths?.length) return { ok: false, canceled: true };
  return { ok: true, path: r.filePaths[0] };
});

ipcMain.handle('admin:installAiLogo', async (_e, sourcePath) => {
  try {
    if (!sourcePath || typeof sourcePath !== 'string' || !fs.existsSync(sourcePath)) {
      return { ok: false, error: 'Invalid source file.' };
    }
    const ext = path.extname(sourcePath).toLowerCase() || '.png';
    const allowed = ['.png', '.jpg', '.jpeg', '.webp', '.gif', '.svg'];
    const useExt = allowed.includes(ext) ? ext : '.png';
    const destName = `ai-brand-logo${useExt}`;
    ensureConfigFiles();
    const brandingDir = getBrandingDir();
    fs.mkdirSync(brandingDir, { recursive: true });
    const dest = path.join(brandingDir, destName);
    try {
      const prev = getAiBrandLogoAbsPath();
      if (prev && fs.existsSync(prev) && path.normalize(prev) !== path.normalize(dest)) {
        fs.unlinkSync(prev);
      }
    } catch (_) {}
    fs.copyFileSync(sourcePath, dest);
    const merged = deepMerge(loadMergedConfig(), {
      branding: { aiLogoFile: destName },
    });
    fs.writeFileSync(getConfigPath(), JSON.stringify(merged, null, 2), 'utf8');
    const url = `${pathToFileURL(dest).href}?v=${Date.now()}`;
    return { ok: true, aiLogoFile: destName, url };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
});

ipcMain.handle('admin:clearAiLogo', async () => {
  try {
    ensureConfigFiles();
    const p = getAiBrandLogoAbsPath();
    if (p && fs.existsSync(p)) fs.unlinkSync(p);
    const merged = deepMerge(loadMergedConfig(), {
      branding: { aiLogoFile: null },
    });
    fs.writeFileSync(getConfigPath(), JSON.stringify(merged, null, 2), 'utf8');
    return { ok: true };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
});

ipcMain.handle('admin:getAiBrandLogoUrl', async () => {
  try {
    const p = getAiBrandLogoAbsPath();
    if (!p || !fs.existsSync(p)) return { ok: true, url: null };
    return { ok: true, url: `${pathToFileURL(p).href}?v=${Date.now()}` };
  } catch (e) {
    return { ok: false, error: String(e), url: null };
  }
});

ipcMain.handle('admin:listAiBackgrounds', async (_e, modeId) => {
  try {
    const id = sanitizeModeId(modeId);
    const files = listBackgroundImageFiles(id);
    const items = files.map((filename) => {
      const full = path.join(getAiBackgroundsDir(id), filename);
      return {
        filename,
        url: `${pathToFileURL(full).href}?v=${Date.now()}`,
      };
    });
    return { ok: true, modeId: id, backgrounds: items };
  } catch (e) {
    return { ok: false, error: String(e), backgrounds: [] };
  }
});

ipcMain.handle('frames:list', async () => {
  try {
    const files = listPhotoFrameFiles();
    const frames = files.map((filename) => {
      const full = path.join(getPhotoFramesDir(), filename);
      const label = filename
        .replace(/\.[^.]+$/, '')
        .replace(/[-_]+/g, ' ')
        .trim();
      return {
        filename,
        label,
        url: `${pathToFileURL(full).href}?v=${Date.now()}`,
      };
    });
    return { ok: true, frames };
  } catch (e) {
    return { ok: false, error: String(e), frames: [] };
  }
});

ipcMain.handle('frames:apply', async (_e, payload) => {
  try {
    let sharpMod;
    try {
      sharpMod = require('sharp');
    } catch (_dep) {
      return { ok: false, error: 'sharp is not available.' };
    }
    const imagePath =
      payload && typeof payload.imagePath === 'string' ? payload.imagePath.trim() : '';
    const frameFile =
      payload && typeof payload.frameFile === 'string' ? path.basename(payload.frameFile.trim()) : '';
    const photoScale =
      payload && typeof payload.photoScale === 'number' ? payload.photoScale : 1;
    if (!imagePath || !frameFile) {
      return { ok: false, error: 'Missing image or frame.' };
    }
    if (!fs.existsSync(imagePath)) {
      return { ok: false, error: 'Source photo not found.' };
    }
    const framePath = path.join(getPhotoFramesDir(), frameFile);
    if (!fs.existsSync(framePath)) {
      return { ok: false, error: `Frame not found: ${frameFile}` };
    }
    appendAppLog('info', 'frames', 'apply start', { imagePath, frameFile, photoScale });
    const outBuf = await compositePhotoIntoFrame(sharpMod, framePath, imagePath, photoScale);
    const dir = path.dirname(imagePath);
    const base = path.basename(imagePath, path.extname(imagePath));
    const outPath = path.join(dir, `${base}_framed.png`);
    fs.writeFileSync(outPath, outBuf);
    appendAppLog('info', 'frames', 'apply ok', { outPath });
    return { ok: true, path: outPath, frameFile };
  } catch (e) {
    appendAppLog('error', 'frames', 'apply failed', String(e));
    return { ok: false, error: String(e) };
  }
});

ipcMain.handle('admin:pickPhotoFrameImage', async () => {
  const win = BrowserWindow.getFocusedWindow() || mainWindow;
  const r = await dialog.showOpenDialog(win, {
    title: 'Select photo frame PNG',
    properties: ['openFile'],
    filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'webp'] }],
  });
  if (r.canceled || !r.filePaths?.length) return { ok: false, canceled: true };
  return { ok: true, path: r.filePaths[0] };
});

ipcMain.handle('admin:installPhotoFrame', async (_e, sourcePath) => {
  try {
    if (!sourcePath || typeof sourcePath !== 'string' || !fs.existsSync(sourcePath)) {
      return { ok: false, error: 'Invalid source file.' };
    }
    const ext = path.extname(sourcePath).toLowerCase() || '.png';
    const allowed = ['.png', '.jpg', '.jpeg', '.webp'];
    const useExt = allowed.includes(ext) ? ext : '.png';
    const base =
      path
        .basename(sourcePath, path.extname(sourcePath))
        .toLowerCase()
        .replace(/[^a-z0-9-_]+/g, '-')
        .replace(/^-+|-+$/g, '') || `frame-${Date.now()}`;
    const destName = `${base}${useExt}`;
    const dest = path.join(getPhotoFramesDir(), destName);
    fs.copyFileSync(sourcePath, dest);
    return {
      ok: true,
      filename: destName,
      url: `${pathToFileURL(dest).href}?v=${Date.now()}`,
    };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
});

ipcMain.handle('admin:deletePhotoFrame', async (_e, filename) => {
  try {
    const safe = path.basename(String(filename || ''));
    if (!safe || safe.includes('..')) return { ok: false, error: 'Invalid filename.' };
    const full = path.join(getPhotoFramesDir(), safe);
    if (!isPathUnderOrEqual(full, getPhotoFramesDir())) {
      return { ok: false, error: 'Invalid path.' };
    }
    if (fs.existsSync(full)) fs.unlinkSync(full);
    return { ok: true, removed: safe };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
});

ipcMain.handle('admin:pickAiBackgroundImage', async () => {
  const win = BrowserWindow.getFocusedWindow() || mainWindow;
  const r = await dialog.showOpenDialog(win, {
    title: 'Select AI background image',
    properties: ['openFile'],
    filters: [
      {
        name: 'Images',
        extensions: ['png', 'jpg', 'jpeg', 'webp'],
      },
    ],
  });
  if (r.canceled || !r.filePaths?.length) return { ok: false, canceled: true };
  return { ok: true, path: r.filePaths[0] };
});

ipcMain.handle('admin:installAiBackground', async (_e, modeId, sourcePath) => {
  try {
    if (!sourcePath || typeof sourcePath !== 'string' || !fs.existsSync(sourcePath)) {
      return { ok: false, error: 'Invalid source file.' };
    }
    const id = sanitizeModeId(modeId);
    const ext = path.extname(sourcePath).toLowerCase() || '.jpg';
    const allowed = ['.png', '.jpg', '.jpeg', '.webp'];
    const useExt = allowed.includes(ext) ? ext : '.jpg';
    const base = path.basename(sourcePath, path.extname(sourcePath)).replace(/[^a-zA-Z0-9-_]/g, '_');
    const destName = `${base || 'background'}_${Date.now()}${useExt}`;
    const dir = getAiBackgroundsDir(id);
    const dest = path.join(dir, destName);
    fs.copyFileSync(sourcePath, dest);
    return {
      ok: true,
      modeId: id,
      filename: destName,
      url: `${pathToFileURL(dest).href}?v=${Date.now()}`,
    };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
});

ipcMain.handle('admin:deleteAiBackground', async (_e, modeId, filename) => {
  try {
    const full = resolveAiBackgroundPath(modeId, filename);
    if (!full) {
      return { ok: false, error: 'Background file not found.' };
    }
    fs.unlinkSync(full);
    return { ok: true, removed: path.basename(full) };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
});

ipcMain.handle('admin:exportThemeTemplate', async () => {
  try {
    const src = path.join(getBundleRoot(), 'theme-template');
    if (!fs.existsSync(src)) {
      return { ok: false, error: 'theme-template folder not found next to app.' };
    }
    const downloads = app.getPath('downloads');
    const out = path.join(downloads, 'Photobooth-theme-template.zip');
    const glob = path.join(src, '*');
    execFileSync(
      'powershell.exe',
      [
        '-NoProfile',
        '-NonInteractive',
        '-Command',
        `Compress-Archive -Path ${psQuote(glob)} -DestinationPath ${psQuote(out)} -Force`,
      ],
      { windowsHide: true, stdio: 'pipe' },
    );
    return { ok: true, path: out };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
});

function galleryBaseUrl(raw) {
  return String(raw || '')
    .trim()
    .replace(/\/$/, '');
}

async function galleryFetchJson(url, opts) {
  const res = await fetch(url, opts);
  let data = null;
  try {
    data = await res.json();
  } catch (_) {
    data = null;
  }
  return { res, data };
}

ipcMain.handle('gallery:ensureDaySession', async (_e, payload) => {
  try {
    const base = galleryBaseUrl(payload?.apiBaseUrl);
    const token = String(payload?.uploadToken || '').trim();
    const eventPrefix = String(payload?.eventPrefix || 'session').trim() || 'session';
    if (!base || !token) {
      return { ok: false, error: 'Gallery API URL and upload token are required.' };
    }
    const { res, data } = await galleryFetchJson(`${base}/api/sessions/day`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ eventPrefix }),
    });
    if (!res.ok || !data?.ok) {
      return { ok: false, error: data?.error || `HTTP ${res.status}` };
    }
    return {
      ok: true,
      slug: data.session?.slug,
      galleryUrl: data.session?.galleryUrl,
      expiresAt: data.session?.expiresAt,
    };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
});

ipcMain.handle('gallery:uploadPhoto', async (_e, payload) => {
  try {
    const base = galleryBaseUrl(payload?.apiBaseUrl);
    const token = String(payload?.uploadToken || '').trim();
    const eventPrefix = String(payload?.eventPrefix || 'session').trim() || 'session';
    const variant = String(payload?.variant || 'original');
    const filePath = String(payload?.filePath || '');
    if (!base || !token) {
      return { ok: false, error: 'Gallery API URL and upload token are required.' };
    }
    if (!filePath) return { ok: false, error: 'Missing filePath' };
    const abs = path.resolve(filePath);
    const captureRoot = path.resolve(getCaptureDir());
    if (!isPathUnder(abs, captureRoot)) {
      return { ok: false, error: 'Photo path outside capture directory.' };
    }
    if (!fs.existsSync(abs)) return { ok: false, error: 'Photo file not found.' };

    const ensure = await galleryFetchJson(`${base}/api/sessions/day`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ eventPrefix }),
    });
    if (!ensure.res.ok || !ensure.data?.ok) {
      return { ok: false, error: ensure.data?.error || `Session HTTP ${ensure.res.status}` };
    }
    const slug = ensure.data.session?.slug;
    if (!slug) return { ok: false, error: 'No session slug returned' };

    const FormData = require('form-data');
    const buf = fs.readFileSync(abs);
    const ext = path.extname(abs).toLowerCase();
    const mime =
      ext === '.png' ? 'image/png' : ext === '.webp' ? 'image/webp' : 'image/jpeg';
    const form = new FormData();
    form.append('photo', buf, {
      filename: path.basename(abs),
      contentType: mime,
      knownLength: buf.length,
    });
    form.append('variant', variant);
    form.append('sourceLocalName', path.basename(abs));

    const uploadUrl = `${base}/api/sessions/${encodeURIComponent(slug)}/photos`;
    const bodyBuf = form.getBuffer();
    const res = await fetch(uploadUrl, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        ...form.getHeaders(),
        'Content-Length': String(bodyBuf.length),
      },
      body: bodyBuf,
    });
    let data = null;
    try {
      data = await res.json();
    } catch (_) {}
    if (!res.ok || !data?.ok) {
      return { ok: false, error: data?.error || `Upload HTTP ${res.status}` };
    }
    return {
      ok: true,
      slug,
      photoId: data.photo?.id,
      shareUrl: data.photo?.shareUrl,
      url: data.photo?.url,
      variant: data.photo?.variant,
    };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
});

ipcMain.handle('gallery:syncFrames', async (_e, payload) => {
  try {
    const base = galleryBaseUrl(payload?.apiBaseUrl);
    if (!base) return { ok: false, error: 'Gallery API URL is required.' };
    const res = await fetch(`${base}/api/frames`);
    let data = null;
    try {
      data = await res.json();
    } catch (_) {}
    if (!res.ok || !data?.ok) {
      return { ok: false, error: data?.error || `HTTP ${res.status}` };
    }
    const dir = getPhotoFramesDir();
    const synced = [];
    const failed = [];
    for (const frame of data.frames || []) {
      const filename = path.basename(String(frame.filename || ''));
      if (!filename || filename.includes('..')) continue;
      const url = frame.downloadUrl || `${base}${frame.url}`;
      try {
        const imgRes = await fetch(url);
        if (!imgRes.ok) {
          failed.push({ filename, error: `HTTP ${imgRes.status}` });
          continue;
        }
        const buf = Buffer.from(await imgRes.arrayBuffer());
        fs.writeFileSync(path.join(dir, filename), buf);
        synced.push(filename);
      } catch (e) {
        failed.push({ filename, error: String(e) });
      }
    }
    return { ok: true, synced, failed, count: synced.length };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
});

ipcMain.handle('gallery:publishFrame', async (_e, payload) => {
  try {
    const base = galleryBaseUrl(payload?.apiBaseUrl);
    const token = String(payload?.uploadToken || '').trim();
    const filename = path.basename(String(payload?.filename || ''));
    if (!base || !token) {
      return { ok: false, error: 'Gallery API URL and upload token are required.' };
    }
    if (!filename) return { ok: false, error: 'Missing filename' };
    const full = path.join(getPhotoFramesDir(), filename);
    if (!isPathUnderOrEqual(full, getPhotoFramesDir()) || !fs.existsSync(full)) {
      return { ok: false, error: 'Frame not found locally.' };
    }
    const FormData = require('form-data');
    const buf = fs.readFileSync(full);
    const ext = path.extname(full).toLowerCase();
    const mime =
      ext === '.png' ? 'image/png' : ext === '.webp' ? 'image/webp' : 'image/jpeg';
    const form = new FormData();
    form.append('frame', buf, {
      filename,
      contentType: mime,
      knownLength: buf.length,
    });
    form.append('filename', filename);
    const bodyBuf = form.getBuffer();
    const res = await fetch(`${base}/api/frames`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        ...form.getHeaders(),
        'Content-Length': String(bodyBuf.length),
      },
      body: bodyBuf,
    });
    let data = null;
    try {
      data = await res.json();
    } catch (_) {}
    if (!res.ok || !data?.ok) {
      return { ok: false, error: data?.error || `HTTP ${res.status}` };
    }
    return { ok: true, frame: data.frame };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
});

ipcMain.handle('gallery:deleteRemoteFrame', async (_e, payload) => {
  try {
    const base = galleryBaseUrl(payload?.apiBaseUrl);
    const token = String(payload?.uploadToken || '').trim();
    const filename = path.basename(String(payload?.filename || ''));
    if (!base || !token) {
      return { ok: false, error: 'Gallery API URL and upload token are required.' };
    }
    if (!filename) return { ok: false, error: 'Missing filename' };
    const res = await fetch(`${base}/api/frames/${encodeURIComponent(filename)}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    });
    let data = null;
    try {
      data = await res.json();
    } catch (_) {}
    if (!res.ok || !data?.ok) {
      return { ok: false, error: data?.error || `HTTP ${res.status}` };
    }
    return { ok: true, removed: data.removed };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
});

ipcMain.handle('print:listPrinters', async () => {
  try {
    /** Enrich with Win32 driver/port so admin can spot Microsoft IPP vs real Canon. */
    let winDetails = [];
    try {
      const { stdout } = await execFileAsync(
        'powershell.exe',
        [
          '-NoProfile',
          '-NonInteractive',
          '-ExecutionPolicy',
          'Bypass',
          '-Command',
          `Get-CimInstance Win32_Printer | Select-Object Name,DriverName,PortName,Default | ConvertTo-Json -Compress`,
        ],
        { windowsHide: true, encoding: 'utf8', timeout: 20000, maxBuffer: 4 * 1024 * 1024 },
      );
      const parsed = JSON.parse(String(stdout || '[]').trim() || '[]');
      winDetails = Array.isArray(parsed) ? parsed : parsed ? [parsed] : [];
    } catch (e) {
      appendAppLog('warn', 'print', 'Win32_Printer enrich failed', String(e));
    }

    const byName = new Map();
    for (const w of winDetails) {
      if (w && w.Name) byName.set(String(w.Name), w);
    }

    const classify = (driverName, portName) => {
      const d = String(driverName || '');
      const p = String(portName || '');
      const isIppClass = /ipp|wsd|microsoft\s+ipp|class\s+driver/i.test(d) || /ipp|wsd|https?:/i.test(p);
      const isCanonDriver = /canon|selphy/i.test(d) && !isIppClass;
      return { isIppClass, isCanonDriver };
    };

    if (!mainWindow || mainWindow.isDestroyed()) {
      // Still return Win32 list if Electron printers unavailable
      const printers = winDetails.map((w) => {
        const flags = classify(w.DriverName, w.PortName);
        return {
          name: String(w.Name),
          displayName: String(w.Name),
          description: String(w.DriverName || ''),
          isDefault: !!w.Default,
          status: 0,
          driverName: String(w.DriverName || ''),
          portName: String(w.PortName || ''),
          ...flags,
        };
      });
      return { ok: true, printers };
    }

    const electronPrinters = await mainWindow.webContents.getPrintersAsync();
    const printers = (electronPrinters || []).map((p) => {
      const w = byName.get(p.name);
      const driverName = w ? String(w.DriverName || '') : '';
      const portName = w ? String(w.PortName || '') : '';
      const flags = classify(driverName, portName);
      return {
        name: p.name,
        displayName: p.displayName || p.name,
        description: p.description || driverName || '',
        isDefault: !!p.isDefault || !!(w && w.Default),
        status: p.status,
        driverName,
        portName,
        ...flags,
      };
    });

    // Include any Win32 printers Electron missed
    for (const w of winDetails) {
      const name = String(w.Name);
      if (printers.some((p) => p.name === name)) continue;
      const flags = classify(w.DriverName, w.PortName);
      printers.push({
        name,
        displayName: name,
        description: String(w.DriverName || ''),
        isDefault: !!w.Default,
        status: 0,
        driverName: String(w.DriverName || ''),
        portName: String(w.PortName || ''),
        ...flags,
      });
    }

    return { ok: true, printers };
  } catch (e) {
    appendAppLog('error', 'print', 'listPrinters failed', String(e));
    return { ok: false, printers: [], error: String(e) };
  }
});

/**
 * Windows photo print for kiosk / Canon SELPHY CP1500 — postcard 6″×4″ landscape.
 * Prefer the USB (or Canon TCP/IP) queue — Microsoft IPP Wi‑Fi queues print wrong.
 */
async function printPhotoViaWindowsSpooler(imagePath, printerName, bleedScale = 1.06) {
  const abs = path.resolve(imagePath);
  if (!fs.existsSync(abs)) {
    throw new Error('Photo file not found.');
  }
  const bleed = Math.min(1.12, Math.max(1.0, Number(bleedScale) || 1.06));
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pb-spool-'));
  const ps1 = path.join(tmpDir, 'photoprint.ps1');
  const script = `
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing
$imgPath = ${psQuote(abs)}
$printerName = ${printerName ? psQuote(printerName) : "''"}
$bleed = ${bleed}
$img = [System.Drawing.Image]::FromFile($imgPath)
try {
  $doc = New-Object System.Drawing.Printing.PrintDocument
  $doc.DocumentName = 'PhotoBooth SELPHY'
  $doc.OriginAtMargins = $false
  $doc.PrintController = New-Object System.Drawing.Printing.StandardPrintController

  if ($printerName -and $printerName.Trim().Length -gt 0) {
    $doc.PrinterSettings.PrinterName = $printerName
  }
  if (-not $doc.PrinterSettings.IsValid) {
    throw "Printer is not valid or not installed: $printerName"
  }

  $drv = [string]$doc.PrinterSettings.PrinterName
  # Soft warning path — IPP class drivers ignore color/layout; still attempt print
  $script:driverNote = ''

  $doc.PrinterSettings.Copies = 1
  $doc.DefaultPageSettings.Color = $true
  try { $doc.PrinterSettings.DefaultPageSettings.Color = $true } catch {}
  $doc.DefaultPageSettings.Margins = New-Object System.Drawing.Printing.Margins(0, 0, 0, 0)

  # Canon SELPHY postcard: 6" wide × 4" high (landscape)
  $chosenPaper = $null
  foreach ($ps in $doc.PrinterSettings.PaperSizes) {
    $n = [string]$ps.PaperName
    if ($n -match '(?i)postcard|card\\s*size|4\\s*[x×]\\s*6|6\\s*[x×]\\s*4|100\\s*[x×]\\s*148|hagaki|kp-?108|l\\s*size') {
      $chosenPaper = $ps
      break
    }
  }
  if ($chosenPaper -eq $null) {
    foreach ($ps in $doc.PrinterSettings.PaperSizes) {
      $a = [Math]::Min($ps.Width, $ps.Height)
      $b = [Math]::Max($ps.Width, $ps.Height)
      if ($a -ge 390 -and $a -le 420 -and $b -ge 580 -and $b -le 620) {
        $chosenPaper = $ps
        break
      }
    }
  }
  if ($chosenPaper -eq $null) {
    $chosenPaper = New-Object System.Drawing.Printing.PaperSize('PhotoBooth 6x4', 600, 400)
    try { $doc.PrinterSettings.PaperSizes.Add($chosenPaper) } catch {}
  }
  $doc.DefaultPageSettings.PaperSize = $chosenPaper
  if ($chosenPaper.Width -ge $chosenPaper.Height) {
    $doc.DefaultPageSettings.Landscape = $false
  } else {
    $doc.DefaultPageSettings.Landscape = $true
  }

  $script:pbImg = $img
  $script:paperName = $chosenPaper.PaperName
  $script:bleed = $bleed
  $doc.add_PrintPage({
    param($sender, $e)
    # Use full physical page; overscan kills thin white borders on SELPHY USB
    $page = $e.PageBounds
    $iw = [double]$script:pbImg.Width
    $ih = [double]$script:pbImg.Height
    if ($iw -le 0 -or $ih -le 0) { throw 'Image has zero size' }
    $scale = [Math]::Max(($page.Width / $iw), ($page.Height / $ih)) * [double]$script:bleed
    $w = [int]([Math]::Ceiling($iw * $scale))
    $h = [int]([Math]::Ceiling($ih * $scale))
    $x = $page.X + [int]([Math]::Floor(($page.Width - $w) / 2.0))
    $y = $page.Y + [int]([Math]::Floor(($page.Height - $h) / 2.0))
    $e.Graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $e.Graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
    $e.Graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
    $e.Graphics.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality
    $e.Graphics.DrawImage($script:pbImg, $x, $y, $w, $h)
    $e.HasMorePages = $false
  })

  $doc.Print()
  Write-Output ("OK|" + $doc.PrinterSettings.PrinterName + "|" + $script:paperName + "|" + $script:bleed)
} finally {
  if ($img) { $img.Dispose() }
}
`;
  fs.writeFileSync(ps1, script, 'utf8');
  try {
    const { stdout, stderr } = await execFileAsync(
      'powershell.exe',
      [
        '-NoProfile',
        '-STA',
        '-NonInteractive',
        '-ExecutionPolicy',
        'Bypass',
        '-WindowStyle',
        'Hidden',
        '-File',
        ps1,
      ],
      {
        windowsHide: true,
        timeout: 120000,
        maxBuffer: 2 * 1024 * 1024,
        encoding: 'utf8',
      },
    );
    const line = String(stdout || '')
      .split(/\r?\n/)
      .map((s) => s.trim())
      .find((s) => s.startsWith('OK|'));
    if (!line) {
      const errTail = String(stderr || stdout || '').trim().slice(0, 300);
      throw new Error(errTail || 'Print spooler returned no confirmation.');
    }
    const parts = line.split('|');
    return {
      printer: parts[1] || printerName || null,
      paper: parts[2] || null,
      bleed: parts[3] || String(bleed),
    };
  } catch (e) {
    const detail = [e.stderr, e.stdout, e.message].filter(Boolean).join(' | ');
    throw new Error(String(detail || e).replace(/\s+/g, ' ').trim().slice(0, 500));
  } finally {
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch (_) {}
  }
}

/**
 * One-shot photo print of the original capture file (DSLR → SELPHY postcard).
 */
ipcMain.handle('print:photo', async (_e, payload) => {
  try {
    const filePath = String(payload?.filePath || '').trim();
    const deviceName =
      typeof payload?.deviceName === 'string' && payload.deviceName.trim()
        ? payload.deviceName.trim()
        : null;
    if (!filePath || !fs.existsSync(filePath)) {
      return { ok: false, error: 'Photo file not found.' };
    }
    const cfg = loadMergedConfig();
    const printCfg = cfg.print || {};
    if (printCfg.enabled !== true) {
      return { ok: false, error: 'Printing is disabled in Admin → Print.' };
    }
    const chosen =
      deviceName ||
      (typeof printCfg.printerName === 'string' && printCfg.printerName.trim()
        ? printCfg.printerName.trim()
        : null);
    const bleedScale =
      typeof printCfg.bleedScale === 'number' && Number.isFinite(printCfg.bleedScale)
        ? printCfg.bleedScale
        : 1.06;

    const abs = path.resolve(filePath);
    if (process.platform !== 'win32') {
      return { ok: false, error: 'Photo printing is only supported on Windows.' };
    }

    const result = await printPhotoViaWindowsSpooler(abs, chosen, bleedScale);
    appendAppLog('info', 'print', 'photoprint spooled', {
      filePath: abs,
      bytes: fs.statSync(abs).size,
      deviceName: result.printer || chosen || 'default',
      paper: result.paper || null,
      bleed: result.bleed || bleedScale,
    });
    return {
      ok: true,
      deviceName: result.printer || chosen || null,
      paper: result.paper || null,
    };
  } catch (e) {
    const msg = String(e?.message || e);
    appendAppLog('error', 'print', 'print:photo failed', msg);
    return { ok: false, error: msg.replace(/\s+/g, ' ').trim().slice(0, 400) };
  }
});
