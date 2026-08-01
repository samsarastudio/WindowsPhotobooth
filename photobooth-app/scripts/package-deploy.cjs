/**
 * After electron-builder: stage a deploy folder that matches win-unpacked
 * (edsdk-bridge + Canon DLLs + config + themes) and pair the portable exe
 * with native sidecar files so the SDK is next to the launcher.
 */
const fs = require('fs');
const path = require('path');

const appRoot = path.join(__dirname, '..');
const releaseDir = path.join(appRoot, 'release');
const binDir = path.join(appRoot, 'bin');
const buildsRoot = path.join(appRoot, '..', 'builds');
const unpacked = path.join(releaseDir, 'win-unpacked');
const portableExe = path.join(releaseDir, 'PhotoBooth-Portable-1.0.0.exe');

const NATIVE = ['edsdk-bridge.exe', 'EDSDK.dll', 'EdsImage.dll'];

function stamp() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return (
    d.getFullYear() +
    p(d.getMonth() + 1) +
    p(d.getDate()) +
    '-' +
    p(d.getHours()) +
    p(d.getMinutes()) +
    p(d.getSeconds())
  );
}

function copyFile(src, dest) {
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.copyFileSync(src, dest);
}

function copyDir(src, dest) {
  if (!fs.existsSync(src)) return;
  fs.mkdirSync(dest, { recursive: true });
  for (const ent of fs.readdirSync(src, { withFileTypes: true })) {
    const from = path.join(src, ent.name);
    const to = path.join(dest, ent.name);
    if (ent.isDirectory()) copyDir(from, to);
    else fs.copyFileSync(from, to);
  }
}

function assertNativeIn(dir, label) {
  const missing = NATIVE.filter((f) => !fs.existsSync(path.join(dir, f)));
  if (missing.length) {
    throw new Error(`${label} missing native camera files: ${missing.join(', ')}`);
  }
  console.log(`[package-deploy] ${label}: OK (${NATIVE.join(', ')})`);
}

function main() {
  if (!fs.existsSync(unpacked)) {
    throw new Error(`Missing win-unpacked at ${unpacked}. Run electron-builder first.`);
  }
  if (!fs.existsSync(binDir)) {
    throw new Error(`Missing bin/ at ${binDir}. Place edsdk-bridge.exe + EDSDK DLLs there.`);
  }
  for (const f of NATIVE) {
    if (!fs.existsSync(path.join(binDir, f))) {
      throw new Error(`bin/${f} is required for Canon SDK support.`);
    }
  }

  // Ensure win-unpacked always has fresh natives from bin/
  for (const f of NATIVE) {
    copyFile(path.join(binDir, f), path.join(unpacked, f));
  }
  assertNativeIn(unpacked, 'win-unpacked');

  const ts = stamp();
  fs.mkdirSync(buildsRoot, { recursive: true });

  // 1) Full folder build (same layout as release/win-unpacked) — preferred for DSLR
  const folderOut = path.join(buildsRoot, `PhotoBooth-Folder-1.0.0-${ts}`);
  console.log(`[package-deploy] Copying folder build → ${folderOut}`);
  copyDir(unpacked, folderOut);
  assertNativeIn(folderOut, 'folder build');

  // 2) Portable exe + native sidecars + default config/themes next to it
  if (fs.existsSync(portableExe)) {
    const portableDir = path.join(buildsRoot, `PhotoBooth-Portable-1.0.0-${ts}`);
    fs.mkdirSync(portableDir, { recursive: true });
    const portableName = `PhotoBooth-Portable-1.0.0-${ts}.exe`;
    copyFile(portableExe, path.join(portableDir, portableName));
    // Also keep a flat copy at builds/ root for convenience
    copyFile(portableExe, path.join(buildsRoot, portableName));

    for (const f of NATIVE) {
      copyFile(path.join(binDir, f), path.join(portableDir, f));
    }
    copyDir(path.join(appRoot, 'config'), path.join(portableDir, 'config'));
    copyDir(path.join(appRoot, 'themes'), path.join(portableDir, 'themes'));
    if (fs.existsSync(path.join(appRoot, 'theme-template'))) {
      copyDir(path.join(appRoot, 'theme-template'), path.join(portableDir, 'theme-template'));
    }
    assertNativeIn(portableDir, 'portable package');
    console.log(`[package-deploy] Portable package → ${portableDir}`);
    console.log(`[package-deploy] Flat portable exe → ${path.join(buildsRoot, portableName)}`);
  } else {
    console.warn(`[package-deploy] Portable exe not found at ${portableExe}`);
  }

  console.log('[package-deploy] Done.');
  console.log('[package-deploy] For Canon DSLR on tablets/kiosks, prefer the Folder build (PhotoBooth.exe + edsdk-bridge beside it).');
}

main();
