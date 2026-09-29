/**
 * Prepare Moments /halloween showcase samples:
 * - Portrait AI preview = user-provided vampire AI + portrait frame
 * - Scene original = generated family photo
 * - Scene AI = live HauntBooth pipeline + landscape frame
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { initDb, saveSettings } from '../src/db.js';
import { applyHalloweenFrame } from '../src/halloween/frame.js';
import { generateFromSample } from '../src/halloween/generate.js';
import { halloweenSamplesDir } from '../src/halloween/paths.js';

const samples = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  'public',
  'assets',
  'halloween',
  'samples',
);
const PORTRAIT_AI_SRC = path.join(samples, '_portrait-ai-src.jpg');
const FAMILY_SRC = path.join(samples, '_family-src.png');

async function main() {
  initDb();
  fs.mkdirSync(halloweenSamplesDir, { recursive: true });

  // Reset demo counter so showcase generation can run.
  saveSettings({ halloweenGenerationCount: 0, halloweenGenerationLimit: 5 });

  if (!fs.existsSync(PORTRAIT_AI_SRC)) {
    throw new Error(`Missing portrait AI source: ${PORTRAIT_AI_SRC}`);
  }
  if (!fs.existsSync(FAMILY_SRC)) {
    throw new Error(`Missing family sample: ${FAMILY_SRC}`);
  }

  // Portrait AI showcase: attached vampire result → 4×6 → portrait frame.
  const portraitRaw = await sharp(PORTRAIT_AI_SRC)
    .resize(1200, 1800, { fit: 'cover', position: 'centre' })
    .png()
    .toBuffer();
  const portraitFramed = await applyHalloweenFrame(portraitRaw, 'head-swap');
  fs.writeFileSync(path.join(halloweenSamplesDir, 'portrait-ai.png'), portraitFramed);
  console.log('wrote portrait-ai.png (framed attached vampire)');

  // Scene original: family posing photo.
  const family = await sharp(FAMILY_SRC)
    .resize(1800, 1200, { fit: 'cover', position: 'centre' })
    .png()
    .toBuffer();
  fs.writeFileSync(path.join(halloweenSamplesDir, 'scene-original.png'), family);
  console.log('wrote scene-original.png (family)');

  console.log('Running live Scene Addition pipeline (OpenAI)…');
  const scene = await generateFromSample('scene');
  if (!scene.ok) {
    console.error('scene generate failed', scene);
    process.exit(1);
  }
  const { halloweenGalleryDir } = await import('../src/halloween/paths.js');
  const livePath = path.join(halloweenGalleryDir(), scene.filename);
  fs.copyFileSync(livePath, path.join(halloweenSamplesDir, 'scene-ai.png'));
  console.log('wrote scene-ai.png from live pipeline', {
    model: scene.model,
    remaining: scene.remaining,
    file: scene.filename,
  });

  console.log('done');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
