import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from '../config.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const momentsRoot = path.join(__dirname, '..', '..');

export const halloweenPublicAssets = path.join(
  momentsRoot,
  'public',
  'assets',
  'halloween',
);

export const halloweenSamplesDir = path.join(halloweenPublicAssets, 'samples');
export const halloweenPlatesDir = path.join(halloweenPublicAssets, 'plates');

export function halloweenGalleryDir() {
  const dir = path.join(config.dataDir, 'halloween-gallery');
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

export const SAMPLE_DEFS = [
  {
    id: 'portrait',
    title: 'AI Portrait',
    subtitle: 'Vampire costume · 4×6 print',
    pipeline: 'head-swap',
    modeId: 'vampire',
    originalFile: 'portrait-original.png',
    aiFile: 'portrait-ai.png',
  },
  {
    id: 'scene',
    title: 'Scene Addition',
    subtitle: 'Family in pumpkin patch · 6×4 print',
    pipeline: 'scene',
    modeId: 'scene',
    originalFile: 'scene-original.png',
    aiFile: 'scene-ai.png',
  },
];

export function sampleOriginalPath(sampleId) {
  const def = SAMPLE_DEFS.find((s) => s.id === sampleId);
  if (!def) return null;
  return path.join(halloweenSamplesDir, def.originalFile);
}

export function vampireCompositionPath() {
  return path.join(halloweenPlatesDir, 'vampire', 'composition.png');
}

export function vampireFacePath() {
  return path.join(halloweenPlatesDir, 'vampire', 'composition.json');
}

export function pumpkinPatchPath() {
  return path.join(halloweenPlatesDir, 'scene', 'pumpkin-patch.png');
}
