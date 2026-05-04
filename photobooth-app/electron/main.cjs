const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const { pathToFileURL } = require('url');
const fs = require('fs');
const { spawn } = require('child_process');
const readline = require('readline');

/** Portable root: folder containing the app exe (portable) or project root in dev. */
function getPortableRoot() {
  if (app.isPackaged) {
    return path.dirname(app.getPath('exe'));
  }
  return path.join(__dirname, '..');
}

/**
 * Still + preview files. Dev: `<repo>/build/capture`. Packaged: `<folder of exe>/capture`.
 * Override: set env PHOTOBOOTH_CAPTURE_DIR to an absolute path.
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
