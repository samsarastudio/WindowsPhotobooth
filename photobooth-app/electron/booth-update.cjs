/**
 * Moments-hosted OTA updates for Folder builds (manual install only).
 * Booth Admin checks for a rolled-out package, then the operator confirms
 * Install — which downloads the zip and spawns a detached PowerShell script
 * that waits for PhotoBooth to exit, replaces files (preserving config /
 * capture / data / logs / updates), relaunches, and cleans up.
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { spawn, execFileSync } = require('child_process');

const PRESERVE = new Set(['config', 'capture', 'data', 'logs', 'updates']);

function readLocalVersion(portableRoot, bundleRoot) {
  const candidates = [
    path.join(portableRoot, 'version.json'),
    path.join(bundleRoot, 'version.json'),
    path.join(__dirname, '..', 'version.json'),
  ];
  for (const p of candidates) {
    try {
      if (!fs.existsSync(p)) continue;
      const j = JSON.parse(fs.readFileSync(p, 'utf8'));
      if (j?.version) {
        return {
          version: String(j.version),
          buildId: String(j.buildId || ''),
          channel: String(j.channel || ''),
          path: p,
        };
      }
    } catch (_) {
      /* ignore */
    }
  }
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf8'));
    return { version: String(pkg.version || '0.0.0'), buildId: '', channel: 'dev', path: null };
  } catch (_) {
    return { version: '0.0.0', buildId: '', channel: 'unknown', path: null };
  }
}

function canSelfUpdate(app, portableRoot) {
  if (!app?.isPackaged) return false;
  if (process.env.PORTABLE_EXECUTABLE_DIR) return false;
  if (process.platform !== 'win32') return false;
  return fs.existsSync(path.join(portableRoot, 'PhotoBooth.exe'));
}

function galleryBaseUrl(raw) {
  return String(raw || '')
    .trim()
    .replace(/\/$/, '');
}

function psQuote(s) {
  return "'" + String(s).replace(/'/g, "''") + "'";
}

function sha256File(filePath) {
  const hash = crypto.createHash('sha256');
  hash.update(fs.readFileSync(filePath));
  return hash.digest('hex');
}

function findPayloadRoot(stagingDir) {
  if (fs.existsSync(path.join(stagingDir, 'PhotoBooth.exe'))) return stagingDir;
  try {
    for (const ent of fs.readdirSync(stagingDir, { withFileTypes: true })) {
      if (!ent.isDirectory()) continue;
      const nested = path.join(stagingDir, ent.name);
      if (fs.existsSync(path.join(nested, 'PhotoBooth.exe'))) return nested;
    }
  } catch (_) {}
  return stagingDir;
}

function writeUpdaterScript({ installRoot, stagingDir, zipPath, logPath }) {
  const scriptPath = path.join(installRoot, 'updates', `apply-update-${Date.now()}.ps1`);
  fs.mkdirSync(path.dirname(scriptPath), { recursive: true });
  const preserve = [...PRESERVE].map((p) => `'${p}'`).join(', ');
  const script = `
$ErrorActionPreference = 'Continue'
$InstallRoot = ${JSON.stringify(installRoot)}
$StagingDir = ${JSON.stringify(stagingDir)}
$ZipPath = ${JSON.stringify(zipPath)}
$LogPath = ${JSON.stringify(logPath)}
$Preserve = @(${preserve})
function Log($m) {
  $line = "$(Get-Date -Format o) $m"
  Add-Content -LiteralPath $LogPath -Value $line -ErrorAction SilentlyContinue
}
Log 'updater started'
for ($i = 0; $i -lt 90; $i++) {
  $procs = @(Get-Process -Name 'PhotoBooth' -ErrorAction SilentlyContinue)
  if ($procs.Count -eq 0) { break }
  Start-Sleep -Seconds 1
}
Get-Process -Name 'edsdk-bridge','PhotoBooth' -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
Start-Sleep -Seconds 2
Log 'processes cleared'

$payload = $StagingDir
if (-not (Test-Path -LiteralPath (Join-Path $payload 'PhotoBooth.exe'))) {
  Get-ChildItem -LiteralPath $StagingDir -Directory -ErrorAction SilentlyContinue | ForEach-Object {
    if (Test-Path -LiteralPath (Join-Path $_.FullName 'PhotoBooth.exe')) { $payload = $_.FullName }
  }
}
Log "payload=$payload"

Get-ChildItem -LiteralPath $payload -Force -ErrorAction SilentlyContinue | ForEach-Object {
  if ($Preserve -contains $_.Name) { return }
  $dest = Join-Path $InstallRoot $_.Name
  if ($_.PSIsContainer) {
    if (Test-Path -LiteralPath $dest) {
      & robocopy $_.FullName $dest /E /IS /IT /NFL /NDL /NJH /NJS /nc /ns /np | Out-Null
    } else {
      Copy-Item -LiteralPath $_.FullName -Destination $dest -Recurse -Force
    }
  } else {
    Copy-Item -LiteralPath $_.FullName -Destination $dest -Force
  }
}

$exe = Join-Path $InstallRoot 'PhotoBooth.exe'
if (Test-Path -LiteralPath $exe) {
  Log "starting $exe"
  Start-Process -FilePath $exe -WorkingDirectory $InstallRoot
} else {
  Log 'PhotoBooth.exe missing after copy'
}

Start-Sleep -Seconds 2
Remove-Item -LiteralPath $StagingDir -Recurse -Force -ErrorAction SilentlyContinue
Remove-Item -LiteralPath $ZipPath -Force -ErrorAction SilentlyContinue
Remove-Item -LiteralPath $PSCommandPath -Force -ErrorAction SilentlyContinue
Log 'updater done'
`;
  fs.writeFileSync(scriptPath, script, 'utf8');
  return scriptPath;
}

let applying = false;

async function pollAndApply(deps) {
  const {
    app,
    loadMergedConfig,
    getPortableRoot,
    getBundleRoot,
    appendAppLog,
    killBridge,
    apply = false,
  } = deps;
  if (applying) return { ok: true, skipped: true, reason: 'busy' };

  const portableRoot = getPortableRoot();
  const local = readLocalVersion(portableRoot, getBundleRoot());
  if (!canSelfUpdate(app, portableRoot)) {
    return { ok: true, skipped: true, reason: 'not-folder-build', local };
  }

  const cfg = loadMergedConfig();
  const base = galleryBaseUrl(cfg?.gallery?.apiBaseUrl);
  const token = String(cfg?.gallery?.uploadToken || '').trim();
  if (!base || !token || cfg?.gallery?.enabled === false) {
    return { ok: true, skipped: true, reason: 'gallery-not-configured', local };
  }

  const checkUrl =
    `${base}/api/booth-update/check?currentVersion=${encodeURIComponent(local.version)}` +
    `&buildId=${encodeURIComponent(local.buildId || '')}`;

  let checkRes;
  let checkData;
  try {
    checkRes = await fetch(checkUrl, { headers: { Authorization: `Bearer ${token}` } });
    checkData = await checkRes.json().catch(() => null);
  } catch (e) {
    appendAppLog?.('warn', 'booth-update', 'check failed', String(e));
    return { ok: false, error: String(e), local };
  }
  if (!checkRes.ok || !checkData?.ok) {
    return {
      ok: false,
      error: checkData?.error || `HTTP ${checkRes.status}`,
      local,
    };
  }
  if (!checkData.updateAvailable || !checkData.active?.id) {
    return { ok: true, updateAvailable: false, local, active: checkData.active || null };
  }

  const release = checkData.active;
  if (!apply) {
    appendAppLog?.('info', 'booth-update', 'update available (manual install)', {
      from: local,
      to: { version: release.version, buildId: release.buildId },
    });
    return { ok: true, updateAvailable: true, local, active: release, release };
  }

  appendAppLog?.('info', 'booth-update', 'manual update — downloading', {
    from: local,
    to: { version: release.version, buildId: release.buildId },
  });

  applying = true;
  try {
    const updatesDir = path.join(portableRoot, 'updates');
    fs.mkdirSync(updatesDir, { recursive: true });
    const zipPath = path.join(updatesDir, `incoming-${release.version}-${release.buildId}.zip`);
    const stagingDir = path.join(updatesDir, `staging-${release.version}-${release.buildId}`);
    if (fs.existsSync(stagingDir)) fs.rmSync(stagingDir, { recursive: true, force: true });
    fs.mkdirSync(stagingDir, { recursive: true });

    const downloadUrl = `${base}/api/booth-update/download/${encodeURIComponent(release.id)}`;
    const dlRes = await fetch(downloadUrl, { headers: { Authorization: `Bearer ${token}` } });
    if (!dlRes.ok) {
      throw new Error(`Download failed HTTP ${dlRes.status}`);
    }
    const buf = Buffer.from(await dlRes.arrayBuffer());
    fs.writeFileSync(zipPath, buf);

    const expectedSha = release.sha256 || dlRes.headers.get('x-content-sha256') || '';
    if (expectedSha) {
      const got = sha256File(zipPath);
      if (got.toLowerCase() !== String(expectedSha).toLowerCase()) {
        throw new Error(`SHA-256 mismatch (expected ${expectedSha}, got ${got})`);
      }
    }

    execFileSync(
      'powershell.exe',
      [
        '-NoProfile',
        '-NonInteractive',
        '-Command',
        `Expand-Archive -LiteralPath ${psQuote(zipPath)} -DestinationPath ${psQuote(stagingDir)} -Force`,
      ],
      { windowsHide: true, stdio: 'pipe' },
    );
    const payload = findPayloadRoot(stagingDir);
    if (!fs.existsSync(path.join(payload, 'PhotoBooth.exe'))) {
      throw new Error('Downloaded package does not contain PhotoBooth.exe');
    }

    const logPath = path.join(portableRoot, 'logs', 'booth-update.log');
    fs.mkdirSync(path.dirname(logPath), { recursive: true });
    const scriptPath = writeUpdaterScript({
      installRoot: portableRoot,
      stagingDir,
      zipPath,
      logPath,
    });

    appendAppLog?.('info', 'booth-update', 'quitting to apply update', {
      version: release.version,
      buildId: release.buildId,
      scriptPath,
    });

    const child = spawn(
      'powershell.exe',
      ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', scriptPath],
      {
        detached: true,
        stdio: 'ignore',
        windowsHide: true,
        cwd: portableRoot,
      },
    );
    child.unref();

    try {
      killBridge?.();
    } catch (_) {}
    setTimeout(() => {
      app.exit(0);
    }, 400);
    return { ok: true, applying: true, release };
  } catch (e) {
    applying = false;
    appendAppLog?.('error', 'booth-update', 'apply failed', String(e));
    return { ok: false, error: String(e), local };
  }
}

module.exports = {
  readLocalVersion,
  canSelfUpdate,
  pollAndApply,
};
