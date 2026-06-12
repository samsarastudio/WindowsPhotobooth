'use strict';

const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');

/** API frame id → bundled overlay + selector thumb (matches kiaexperience.info). */
const BY_FRAME_ID = {
  1: { frame_image: 'frame1.png', thumbnail: 'frame-2-sel.png' },
  2: { frame_image: 'frame2.png', thumbnail: 'fram-1-sel.png' },
};

function bundledFramesDir(rootDir) {
  const root = String(rootDir || '').trim();
  if (!root) return '';
  return path.join(root, 'assets', 'frames');
}

function bundledAssetPath(rootDir, frameId, kind) {
  const id = Number(frameId);
  if (!Number.isFinite(id)) return null;
  const entry = BY_FRAME_ID[id];
  if (!entry) return null;
  const file = kind === 'thumbnail' ? entry.thumbnail : entry.frame_image;
  if (!file) return null;
  const abs = path.join(bundledFramesDir(rootDir), file);
  return fs.existsSync(abs) ? abs : null;
}

function bundledAssetFileUrl(rootDir, frameId, kind) {
  const abs = bundledAssetPath(rootDir, frameId, kind);
  if (!abs) return '';
  return pathToFileURL(abs).href;
}

const BUNDLED_FRAME_IDS = Object.keys(BY_FRAME_ID)
  .map((k) => Number(k))
  .filter((id) => Number.isFinite(id));

function hasBundledFallback(frameId) {
  return BUNDLED_FRAME_IDS.includes(Number(frameId));
}

module.exports = {
  BY_FRAME_ID,
  BUNDLED_FRAME_IDS,
  bundledFramesDir,
  bundledAssetPath,
  bundledAssetFileUrl,
  hasBundledFallback,
};
