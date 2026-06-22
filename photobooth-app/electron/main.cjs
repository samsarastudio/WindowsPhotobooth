const { app, BrowserWindow, ipcMain, dialog, net } = require('electron');
const path = require('path');
const { pathToFileURL, fileURLToPath, URL } = require('url');
const https = require('https');
const http = require('http');
const fs = require('fs');
const { spawn, execFileSync, exec } = require('child_process');
const readline = require('readline');
const { ScannerService } = require('./scanner-service.cjs');
const { KiaApiService } = require('./kia-api-service.cjs');
const { bundledAssetPath } = require('./frame-fallbacks.cjs');
const { cropPhotoTo45Top, cropBufferTo45Top } = require('./image-process.cjs');

function loadSharp() {
  try {
    return require('sharp');
  } catch (_) {
    return null;
  }
}

function loadCameraOrientation() {
  try {
    const cam = loadMergedConfig()?.camera || {};
    const version = cam.orientationVersion;
    const raw = cam.orientation;
    if (version === 2 && (raw === 'portrait' || raw === 'landscape')) {
      return raw;
    }
    if (raw === 'portrait') return 'portrait';
    if (raw === 'portrait-default') return 'landscape';
    if (raw === 'landscape') return 'portrait';
    return 'portrait';
  } catch (_) {
    return 'portrait';
  }
}

async function cropCaptureFile(filePath) {
  const sharpMod = loadSharp();
  if (!sharpMod || !filePath) return;
  try {
    await cropPhotoTo45Top(sharpMod, filePath, { orientation: loadCameraOrientation() });
  } catch (e) {
    console.error('[crop]', filePath, e);
  }
}

/** Portable root: folder containing the app exe (portable) or photobooth-app in dev. */
function getPortableRoot() {
  if (app.isPackaged) {
    return path.dirname(app.getPath('exe'));
  }
  return path.join(__dirname, '..');
}

function getConfigDir() {
  return path.join(getPortableRoot(), 'config');
}

function getThemesDir() {
  return path.join(getPortableRoot(), 'themes');
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

function getConfigDefaultPath() {
  return path.join(__dirname, '..', 'config', 'photobooth-config.default.json');
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
function resolveThemeDirectory(themeId) {
  const raw = String(themeId || '').trim();
  if (!raw) return null;
  const normalized = raw === 'kia' ? 'circuit' : raw;
  const root = getThemesDir();
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
    ? path.join(path.dirname(app.getPath('exe')), 'capture')
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
  const root = getPortableRoot();
  const candidates = [
    path.join(root, 'edsdk-bridge.exe'),
    path.join(__dirname, 'edsdk-bridge.exe'),
    path.join(root, 'resources', 'edsdk-bridge.exe'),
  ];
  for (const p of candidates) {
    if (fs.existsSync(p)) return p;
  }
  return null;
}

let mainWindow = null;
let bridgeProc = null;
let bridgeReadline = null;
const bridgeQueue = [];
const scannerService = new ScannerService();
let kiaApiService = null;

function getSyncQueueDir() {
  return path.join(getPortableRoot(), 'sync-data');
}

function ensureKiaApiService() {
  if (!kiaApiService) {
    kiaApiService = new KiaApiService(getSyncQueueDir());
  }
  return kiaApiService;
}

function kiaApiFromMerged(cfg) {
  const k = cfg?.kiaApi || {};
  const sync = cfg?.sync || {};
  const copy = cfg?.copy || {};
  let baseUrl = typeof k.baseUrl === 'string' ? k.baseUrl.trim() : '';
  if (!baseUrl && sync.apiBaseUrl) baseUrl = String(sync.apiBaseUrl).trim().replace(/\/$/, '');
  if (!baseUrl) baseUrl = 'https://dev-kiaforum2026.thetunagroup.com';
  if (baseUrl.endsWith('/api')) baseUrl = baseUrl.slice(0, -4);
  let uploadBaseUrl = typeof k.uploadBaseUrl === 'string' ? k.uploadBaseUrl.trim() : '';
  if (uploadBaseUrl.endsWith('/api')) uploadBaseUrl = uploadBaseUrl.slice(0, -4);
  const paths = k.paths || {};
  return {
    baseUrl,
    uploadBaseUrl,
    bearerToken: typeof k.bearerToken === 'string' ? k.bearerToken : '',
    qrPrefix: k.qrPrefix || sync.qrPrefix || 'KIA-PHOTO-',
    bypassCode: k.bypassCode || '12345',
    devBypassEmail:
      typeof k.devBypassEmail === 'string' && k.devBypassEmail.trim()
        ? k.devBypassEmail.trim()
        : 'test@csgnow.com',
    offlineAllowPrefix: k.offlineAllowPrefix !== false,
    paths: {
      authenticate: paths.authenticate || '/api/kia/authenticate',
      validate: paths.validate || '/api/kia/photo-booth/validate',
      frames: paths.frames || '/api/kia/photo-booth/frames',
      media: paths.media || '/api/kia/photo-booth/media',
      gallery: paths.gallery || '/api/kia/photo-booth/gallery',
      qrCode: paths.qrCode || '/api/kia/photo-booth/qr-code',
    },
    debugMode: k.debugMode === true,
    onDebug: broadcastKiaApiDebug,
    bundledFramesRoot: getPortableRoot(),
    uploadImageFormat:
      String(k.uploadImageFormat || 'png').trim().toLowerCase() === 'jpeg' ||
      String(k.uploadImageFormat || 'png').trim().toLowerCase() === 'jpg'
        ? 'jpeg'
        : 'png',
  };
}

function applyKiaApiConfigFromMerged(cfg) {
  ensureKiaApiService().configure(kiaApiFromMerged(cfg));
}

function broadcastKiaApiDebug(entry) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('kia:apiDebug', entry);
  }
}

function broadcastScanner(channel, payload) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send(channel, payload);
  }
}

function wireScannerListeners() {
  scannerService.setListeners({
    onCode: (code) => broadcastScanner('scanner:code', { code }),
    onStatus: (status) => broadcastScanner('scanner:status', { status }),
    onError: (error) => broadcastScanner('scanner:error', { error }),
  });
}

async function startScannerFromConfig() {
  wireScannerListeners();
  const cfg = loadMergedConfig();
  const sc = cfg.scanner || {};
  if (!sc.enabled || !sc.comPort || !String(sc.comPort).trim()) {
    await scannerService.close();
    broadcastScanner('scanner:status', { status: 'disconnected' });
    return;
  }
  const baud = typeof sc.baudRate === 'number' ? sc.baudRate : 9600;
  await scannerService.open(String(sc.comPort).trim(), baud);
}

function killBridge() {
  if (bridgeReadline) {
    bridgeReadline.close();
    bridgeReadline = null;
  }
  if (bridgeProc) {
    try {
      bridgeProc.kill();
    } catch (_) {}
    bridgeProc = null;
  }
}

function ensureBridgeProcess() {
  if (bridgeProc && !bridgeProc.killed) return true;
  const exe = findBridgeExecutable();
  if (!exe) return false;

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
    console.error('[edsdk-bridge]', d.toString());
  });

  bridgeProc.on('exit', () => {
    bridgeProc = null;
    bridgeReadline = null;
    while (bridgeQueue.length) {
      const p = bridgeQueue.shift();
      p.reject(new Error('Bridge exited'));
    }
  });

  return true;
}

function sendBridge(jsonObj) {
  return new Promise((resolve, reject) => {
    if (!ensureBridgeProcess()) {
      resolve({ ok: false, err: 'NO_BRIDGE', msg: 'edsdk-bridge.exe not found next to app' });
      return;
    }
    bridgeQueue.push({ resolve, reject });
    const line = JSON.stringify(jsonObj);
    bridgeProc.stdin.write(line + '\n');
  });
}

function getAppIconPath() {
  const candidates = [
    path.join(__dirname, '..', 'build', 'icon.png'),
    path.join(__dirname, '..', 'public', 'kia', 'booth-icon.png'),
  ];
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate;
  }
  return null;
}

function createWindow() {
  const iconPath = getAppIconPath();
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 720,
    fullscreen: true,
    autoHideMenuBar: true,
    ...(iconPath ? { icon: iconPath } : {}),
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

app.whenReady().then(async () => {
  ensureConfigFiles();
  const cfg = loadMergedConfig();
  applyKiaApiConfigFromMerged(cfg);
  ensureKiaApiService().start();
  if (net?.on) {
    net.on('online', () => {
      void ensureKiaApiService().processQueue();
    });
  }
  createWindow();
  await startScannerFromConfig();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  killBridge();
  if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', () => {
  killBridge();
  if (kiaApiService) kiaApiService.stop();
  void scannerService.close();
});

ipcMain.handle('app:getPaths', () => {
  const captureDir = getCaptureDir();
  return {
    portableRoot: getPortableRoot(),
    captureDir,
    themesDir: getThemesDir(),
    configPath: getConfigPath(),
    hasBridge: !!findBridgeExecutable(),
  };
});

ipcMain.handle('camera:invoke', async (_e, cmd) => {
  const res = await sendBridge(cmd);
  if (res && res.ok && cmd.cmd === 'capture' && res.path) {
    await cropCaptureFile(res.path);
  }
  if (res && res.ok && cmd.cmd === 'preview' && res.path) {
    try {
      res.previewFileUrl = pathToFileURL(res.path).href;
    } catch (err) {
      res.previewFileUrl = null;
      res.readErr = String(err);
    }
  }
  return res;
});

ipcMain.handle('file:readBase64', async (_e, filePath) => {
  let abs = String(filePath || '').trim();
  if (abs.startsWith('file://')) {
    try {
      abs = fileURLToPath(abs);
    } catch (e) {
      throw new Error(`Invalid file URL: ${abs}`);
    }
  } else {
    abs = path.resolve(abs);
  }
  if (!fs.existsSync(abs)) {
    throw new Error(`File not found: ${abs}`);
  }
  const buf = fs.readFileSync(abs);
  if (!buf.length) {
    throw new Error(`File is empty: ${abs}`);
  }
  let mime = 'image/jpeg';
  if (buf[0] === 0x89 && buf[1] === 0x50) mime = 'image/png';
  else if (buf[0] === 0x47 && buf[1] === 0x49) mime = 'image/gif';
  else if (buf[0] === 0x52 && buf[1] === 0x49) mime = 'image/webp';
  else {
    const ext = path.extname(abs).toLowerCase();
    if (ext === '.png') mime = 'image/png';
    else if (ext === '.webp') mime = 'image/webp';
  }
  return `data:${mime};base64,${buf.toString('base64')}`;
});

function fetchUrlBuffer(urlStr) {
  return new Promise((resolve, reject) => {
    let parsed;
    try {
      parsed = new URL(urlStr);
    } catch (e) {
      reject(e);
      return;
    }
    const lib = parsed.protocol === 'https:' ? https : http;
    lib
      .get(
        urlStr,
        {
          headers: { Accept: 'image/*,*/*', 'User-Agent': 'PhotoBooth-KIA/1.0' },
          timeout: 30000,
        },
        (res) => {
          if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
            fetchUrlBuffer(new URL(res.headers.location, urlStr).href).then(resolve).catch(reject);
            return;
          }
          if (!res.statusCode || res.statusCode < 200 || res.statusCode >= 300) {
            reject(new Error(`HTTP ${res.statusCode || 0}`));
            res.resume();
            return;
          }
          const chunks = [];
          res.on('data', (c) => chunks.push(c));
          res.on('end', () => {
            resolve({
              buf: Buffer.concat(chunks),
              contentType: res.headers['content-type'] || 'image/png',
            });
          });
        },
      )
      .on('error', reject)
      .on('timeout', function onTimeout() {
        this.destroy(new Error('Request timeout'));
      });
  });
}

ipcMain.handle('net:fetchImageDataUrl', async (_e, urlStr) => {
  const url = String(urlStr || '').trim();
  if (!url || !/^https?:\/\//i.test(url)) {
    return { ok: false, error: 'Invalid URL' };
  }
  try {
    const svc = ensureKiaApiService();
    const buf = await svc._fetchBinaryUrl(url);
    if (!svc._looksLikeImage(buf)) {
      return { ok: false, error: 'Response is not an image' };
    }
    let mime = 'image/png';
    if (buf[0] === 0xff && buf[1] === 0xd8) mime = 'image/jpeg';
    else if (buf[0] === 0x89 && buf[1] === 0x50) mime = 'image/png';
    else if (buf[0] === 0x47 && buf[1] === 0x49) mime = 'image/gif';
    return { ok: true, dataUrl: `data:${mime};base64,${buf.toString('base64')}` };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
});

ipcMain.handle('file:saveJpeg', async (_e, fullPath, base64Body) => {
  const dir = path.dirname(fullPath);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(fullPath, Buffer.from(base64Body, 'base64'));
  await cropCaptureFile(fullPath);
  return { ok: true, path: fullPath };
});

ipcMain.handle('openai:generateImage', async (_e, payload) => {
  try {
    let sharpMod;
    let FormData;
    try {
      sharpMod = require('sharp');
      FormData = require('form-data');
    } catch (_dep) {
      return {
        ok: false,
        error: 'Server dependencies missing: run npm install sharp form-data in the app folder.',
      };
    }
    const imagePath =
      payload && typeof payload.imagePath === 'string' ? payload.imagePath : '';
    const prompt = payload && typeof payload.prompt === 'string' ? payload.prompt : '';
    if (!imagePath.trim() || !prompt.trim()) {
      return { ok: false, error: 'Missing image path or prompt.' };
    }
    const cfg = loadMergedConfig();
    const apiKey = cfg.openAiApiKey;
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
    await cropPhotoTo45Top(sharpMod, absImage);
    // Edit input hard limit: PNG and < 4 MB.
    // Build a 4:5 portrait letterboxed into 1024×1536 PNG; downscale until it fits.
    const MAX_IMAGE_BYTES = 4 * 1024 * 1024 - 8192; // Small safety margin.
    let pngBuf = null;
    let squarePngBuf = null;
    const PORTRAIT_CANVAS_SIZES = [
      [1024, 1536],
      [960, 1440],
      [864, 1296],
      [768, 1152],
      [640, 960],
    ];
    for (const [w, h] of PORTRAIT_CANVAS_SIZES) {
      const candidate = await sharpMod(absImage)
        .resize(w, h, {
          fit: 'contain',
          position: 'north',
          background: { r: 255, g: 255, b: 255, alpha: 1 },
        })
        .ensureAlpha()
        .png({ compressionLevel: 9, effort: 10, palette: true })
        .toBuffer();
      if (candidate.length <= MAX_IMAGE_BYTES) {
        pngBuf = candidate;
        break;
      }
    }
    if (!pngBuf) {
      return { ok: false, error: 'Prepared PNG is still above 4 MB.' };
    }
    for (const side of [1024, 960, 864, 768, 640]) {
      const candidate = await sharpMod(absImage)
        .resize(side, side, {
          fit: 'contain',
          position: 'north',
          background: { r: 255, g: 255, b: 255, alpha: 1 },
        })
        .ensureAlpha()
        .png({ compressionLevel: 9, effort: 10, palette: true })
        .toBuffer();
      if (candidate.length <= MAX_IMAGE_BYTES) {
        squarePngBuf = candidate;
        break;
      }
    }
    if (!squarePngBuf) {
      squarePngBuf = pngBuf;
    }
    /** DALL·E 2 image edit prompt max length — keep suffix within budget. */
    const DALLE2_PROMPT_MAX = 1000;
    const suffix =
      ' Use the entire visible scene (portrait 4:5 framing). Transform the whole composition—do not output a tighter zoom or headshot crop unless the uploaded image already is.';
    const rawPrompt = String(prompt).trim();
    const newspaperHeadlineGuard =
      rawPrompt.toLowerCase().includes('newspaper') &&
      !rawPrompt.toUpperCase().includes('HAPPENING NOW!')
        ? ' Ensure the primary newspaper masthead headline reads exactly: HAPPENING NOW!'
        : '';
    let fullPrompt = rawPrompt + newspaperHeadlineGuard + suffix;
    if (fullPrompt.length > DALLE2_PROMPT_MAX) {
      fullPrompt = fullPrompt.slice(0, DALLE2_PROMPT_MAX);
    }
    const parseJsonSafe = (text) => {
      try {
        return JSON.parse(text);
      } catch (_) {
        return null;
      }
    };

    const makeErr = (statusCode, json, text) =>
      json?.error?.message || json?.message || text.slice(0, 400) || `HTTP ${statusCode}`;

    let json = null;
    let modelUsed = 'gpt-image-1.5';
    const inputDataUrl = `data:image/png;base64,${pngBuf.toString('base64')}`;

    // Primary path: GPT image edits API (closer to ChatGPT image quality/features).
    const gptEditPayload = {
      model: 'gpt-image-1.5',
      images: [{ image_url: inputDataUrl }],
      prompt: fullPrompt,
      n: 1,
      size: '1024x1536',
      quality: 'high',
      input_fidelity: 'high',
    };
    const gptRes = await httpsPostJson('https://api.openai.com/v1/images/edits', gptEditPayload, {
      Authorization: `Bearer ${apiKey.trim()}`,
    });
    const gptJson = parseJsonSafe(gptRes.body);
    const gptOk = gptRes.statusCode >= 200 && gptRes.statusCode < 300 && !!gptJson;
    if (gptOk) {
      json = gptJson;
    } else {
      const primaryErr = makeErr(gptRes.statusCode, gptJson, gptRes.body);
      // Compatibility fallback for accounts that only allow DALL-E 2 on edits.
      const form = new FormData();
      form.append('image', squarePngBuf, { filename: 'photo.png', contentType: 'image/png' });
      form.append('prompt', fullPrompt);
      form.append('model', 'dall-e-2');
      form.append('n', '1');
      form.append('size', '1024x1024');
      form.append('response_format', 'b64_json');
      const d2Res = await httpsPostMultipart('https://api.openai.com/v1/images/edits', form, {
        Authorization: `Bearer ${apiKey.trim()}`,
      });
      const d2Json = parseJsonSafe(d2Res.body);
      const d2Ok = d2Res.statusCode >= 200 && d2Res.statusCode < 300 && !!d2Json;
      if (!d2Ok) {
        const fallbackErr = makeErr(d2Res.statusCode, d2Json, d2Res.body);
        return {
          ok: false,
          error: `${primaryErr} (GPT edits failed; fallback dall-e-2 also failed: ${fallbackErr})`,
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
    outBuf = await cropBufferTo45Top(sharpMod, outBuf, { format: 'png' });
    const dir = path.dirname(absImage);
    const base = path.basename(absImage, path.extname(absImage));
    const outPath = path.join(dir, `${base}_ai.png`);
    fs.writeFileSync(outPath, outBuf);
    return { ok: true, path: outPath, model: modelUsed };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
});

ipcMain.handle('scanner:listPorts', async () => {
  try {
    const ports = await scannerService.listPorts();
    return { ok: true, ports };
  } catch (e) {
    return { ok: false, error: String(e), ports: [] };
  }
});

ipcMain.handle('scanner:getStatus', async () => {
  return { ok: true, status: scannerService.getStatus(), lastCode: scannerService.getLastCode() };
});

ipcMain.handle('scanner:open', async (_e, portPath, baudRate) => {
  try {
    return await scannerService.open(portPath, baudRate);
  } catch (e) {
    return { ok: false, error: String(e), status: 'error' };
  }
});

ipcMain.handle('scanner:close', async () => {
  try {
    return await scannerService.close();
  } catch (e) {
    return { ok: false, error: String(e) };
  }
});

function handleKiaValidate(token) {
  applyKiaApiConfigFromMerged(loadMergedConfig());
  return ensureKiaApiService().validateToken(token);
}

ipcMain.handle('kia:validateToken', async (_e, token) => {
  try {
    return await handleKiaValidate(token);
  } catch (e) {
    return { ok: false, valid: false, error: String(e), offline: true };
  }
});

ipcMain.handle('sync:validateToken', async (_e, token) => {
  try {
    return await handleKiaValidate(token);
  } catch (e) {
    return { ok: false, valid: false, error: String(e), offline: true };
  }
});

ipcMain.handle('kia:fetchFrames', async () => {
  try {
    applyKiaApiConfigFromMerged(loadMergedConfig());
    return await ensureKiaApiService().fetchFrames();
  } catch (e) {
    return { ok: false, frames: [], error: String(e), offline: true };
  }
});

ipcMain.handle('kia:bundledFrameAsset', async (_e, frameId, kind) => {
  const started = Date.now();
  try {
    const abs = bundledAssetPath(getPortableRoot(), frameId, kind === 'thumbnail' ? 'thumbnail' : 'frame_image');
    if (!abs) {
      broadcastKiaApiDebug({
        at: new Date().toISOString(),
        kind: 'frame-asset',
        method: 'BUNDLED',
        ok: false,
        url: `frame-${frameId}/${kind}`,
        error: 'Bundled frame asset not found',
        durationMs: Date.now() - started,
      });
      return { ok: false, error: 'Bundled frame asset not found' };
    }
    const href = pathToFileURL(abs).href;
    broadcastKiaApiDebug({
      at: new Date().toISOString(),
      kind: 'frame-asset',
      method: 'BUNDLED',
      ok: true,
      url: `frame-${frameId}/${kind}`,
      response: { path: href.slice(0, 120), abs },
      durationMs: Date.now() - started,
    });
    return { ok: true, path: href };
  } catch (e) {
    broadcastKiaApiDebug({
      at: new Date().toISOString(),
      kind: 'frame-asset',
      method: 'BUNDLED',
      ok: false,
      url: `frame-${frameId}/${kind}`,
      error: String(e),
      durationMs: Date.now() - started,
    });
    return { ok: false, error: String(e) };
  }
});

ipcMain.handle('kia:enqueueMedia', async (_e, entry) => {
  try {
    applyKiaApiConfigFromMerged(loadMergedConfig());
    return ensureKiaApiService().enqueueMedia(entry);
  } catch (e) {
    return { ok: false, error: String(e) };
  }
});

ipcMain.handle('kia:waitForUpload', async (_e, uploadId, timeoutMs) => {
  try {
    applyKiaApiConfigFromMerged(loadMergedConfig());
    return await ensureKiaApiService().waitForUpload(uploadId, timeoutMs);
  } catch (e) {
    return { ok: false, error: String(e) };
  }
});

ipcMain.handle('kia:fetchGallery', async () => {
  try {
    applyKiaApiConfigFromMerged(loadMergedConfig());
    return await ensureKiaApiService().fetchGallery();
  } catch (e) {
    return { ok: false, items: [], error: String(e), offline: true };
  }
});

ipcMain.handle('kia:getUploadQueueStatus', async () => {
  try {
    return ensureKiaApiService().getUploadQueueStatus();
  } catch (e) {
    return { ok: false, pending: 0, error: String(e) };
  }
});

ipcMain.handle('kia:processUploadQueue', async () => {
  try {
    applyKiaApiConfigFromMerged(loadMergedConfig());
    return await ensureKiaApiService().processUploadQueue();
  } catch (e) {
    return { ok: false, error: String(e) };
  }
});

ipcMain.handle('kia:testConnection', async () => {
  try {
    applyKiaApiConfigFromMerged(loadMergedConfig());
    return await ensureKiaApiService().testConnection();
  } catch (e) {
    return { ok: false, error: String(e) };
  }
});

ipcMain.handle('sync:enqueueSession', async (_e, entry) => {
  try {
    applyKiaApiConfigFromMerged(loadMergedConfig());
    return ensureKiaApiService().enqueueSession(entry);
  } catch (e) {
    return { ok: false, error: String(e) };
  }
});

function configForRenderer(full) {
  if (!full || typeof full !== 'object') return full;
  const { adminPin: _omit, openAiApiKey: _key, ...rest } = full;
  const kiaApi = rest.kiaApi && typeof rest.kiaApi === 'object' ? { ...rest.kiaApi } : {};
  if (kiaApi.bearerToken) {
    delete kiaApi.bearerToken;
  }
  return {
    ...rest,
    kiaApi,
    openAiConfigured:
      typeof full.openAiApiKey === 'string' && full.openAiApiKey.trim().length > 0,
    bearerConfigured:
      full.kiaApi &&
      typeof full.kiaApi.bearerToken === 'string' &&
      full.kiaApi.bearerToken.trim().length > 0,
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

ipcMain.handle('app:shutdownSystem', async () => {
  try {
    if (kiaApiService) kiaApiService.stop();
    await scannerService.close();
    if (process.platform === 'win32') {
      exec('shutdown /s /t 0', { windowsHide: true });
    } else if (process.platform === 'darwin') {
      exec('shutdown -h now');
    } else {
      exec('systemctl poweroff');
    }
    setTimeout(() => app.quit(), 300);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
});

ipcMain.handle('admin:saveConfig', async (_e, partial) => {
  try {
    ensureConfigFiles();
    const merged = deepMerge(loadMergedConfig(), partial || {});
    fs.mkdirSync(getConfigDir(), { recursive: true });
    fs.writeFileSync(getConfigPath(), JSON.stringify(merged, null, 2), 'utf8');
    if (partial?.kiaApi && typeof partial.kiaApi === 'object') {
      const prev = loadMergedConfig();
      const incoming = partial.kiaApi;
      if (
        (!incoming.bearerToken || String(incoming.bearerToken).trim() === '') &&
        prev.kiaApi?.bearerToken
      ) {
        merged.kiaApi = { ...merged.kiaApi, bearerToken: prev.kiaApi.bearerToken };
      }
    }
    applyKiaApiConfigFromMerged(merged);
    ensureKiaApiService().start();
    await startScannerFromConfig();
    return { ok: true, config: configForRenderer(merged) };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
});

ipcMain.handle('admin:listThemes', async () => {
  try {
    const dir = getThemesDir();
    fs.mkdirSync(dir, { recursive: true });
    const themes = [];
    for (const name of fs.readdirSync(dir, { withFileTypes: true })) {
      if (!name.isDirectory()) continue;
      const tj = path.join(dir, name.name, 'theme.json');
      if (!fs.existsSync(tj)) continue;
      try {
        const meta = readJsonSafe(tj);
        themes.push({
          id: meta.id || name.name,
          folder: name.name,
          name: meta.name || name.name,
          version: meta.version,
          author: meta.author,
          description: meta.description,
        });
      } catch (_) {}
    }
    return { ok: true, themes };
  } catch (e) {
    return { ok: false, error: String(e), themes: [] };
  }
});

ipcMain.handle('admin:getThemeStylesheetUrl', async () => {
  try {
    const cfg = loadMergedConfig();
    const raw = cfg.activeThemeId || 'default';
    const id = raw === 'kia' ? 'circuit' : raw;
    const cssPath = path.join(getThemesDir(), id, 'styles.css');
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
    const folderName = path.basename(themeDir);
    if (folderName === 'default') {
      return { ok: false, error: 'Cannot remove the built-in default theme.' };
    }
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
    const dest = path.join(getThemesDir(), id);
    fs.mkdirSync(getThemesDir(), { recursive: true });
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

ipcMain.handle('admin:exportThemeTemplate', async () => {
  try {
    const src = path.join(getPortableRoot(), 'theme-template');
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
