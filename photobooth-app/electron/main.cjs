const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const { pathToFileURL } = require('url');
const fs = require('fs');
const { spawn, execFileSync } = require('child_process');
const readline = require('readline');

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
    hasBridge: !!findBridgeExecutable(),
  };
});

ipcMain.handle('camera:invoke', async (_e, cmd) => {
  const res = await sendBridge(cmd);
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
  const buf = fs.readFileSync(filePath);
  return `data:image/jpeg;base64,${buf.toString('base64')}`;
});

ipcMain.handle('file:saveJpeg', async (_e, fullPath, base64Body) => {
  const dir = path.dirname(fullPath);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(fullPath, Buffer.from(base64Body, 'base64'));
  return { ok: true, path: fullPath };
});

function configForRenderer(full) {
  if (!full || typeof full !== 'object') return full;
  const { adminPin: _omit, ...rest } = full;
  return rest;
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
