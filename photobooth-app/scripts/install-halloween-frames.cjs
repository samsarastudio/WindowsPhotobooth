/**
 * Convert JPEG Halloween frames → PNG overlays with transparent photo holes.
 * Uses strict near-black threshold so dark wood/art is kept.
 */
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const assets =
  'C:/Users/Unity/.cursor/projects/f-Workspace-Important-Projects-AI-Photobooth/assets';
const framesDir = path.join(
  'f:/Workspace Important Projects/AI Photobooth/photobooth-app/config/photo-frames',
);
const momentsFrames = path.join(
  'f:/Workspace Important Projects/AI Photobooth/moments-server/public/assets/halloween/frames',
);

const LANDSCAPE_SRC = path.join(
  assets,
  'c__Users_Unity_AppData_Roaming_Cursor_User_workspaceStorage_d38c61f06db92cc4406f181cc1123d4d_images_HalloweenFrame-cf133cc4-7551-4882-b7a5-5a763194e364.jpg',
);
const PORTRAIT_SRC = path.join(
  assets,
  'c__Users_Unity_AppData_Roaming_Cursor_User_workspaceStorage_d38c61f06db92cc4406f181cc1123d4d_images_Frame_Portrait-8c5e6960-da66-4b94-93b7-e62e0f4b884c.jpg',
);

/** Pure black hole only — keep dark brown frame art. */
const BLACK_MAX = 10;

function floodFill(data, w, h, seedX, seedY) {
  const total = w * h;
  const mask = new Uint8Array(total);
  const ch = 4;
  const isHole = (i) =>
    data[i + 3] < 16 ||
    (data[i] <= BLACK_MAX && data[i + 1] <= BLACK_MAX && data[i + 2] <= BLACK_MAX);
  const si = (seedY * w + seedX) * ch;
  if (!isHole(si)) return { mask, count: 0, minX: 0, minY: 0, maxX: 0, maxY: 0 };
  const stack = [seedY * w + seedX];
  mask[stack[0]] = 1;
  let count = 0;
  let minX = w;
  let minY = h;
  let maxX = 0;
  let maxY = 0;
  while (stack.length) {
    const p = stack.pop();
    const x = p % w;
    const y = (p - x) / w;
    count += 1;
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
    const nbs = [
      [x > 0, p - 1],
      [x < w - 1, p + 1],
      [y > 0, p - w],
      [y < h - 1, p + w],
    ];
    for (const [ok, np] of nbs) {
      if (!ok || mask[np]) continue;
      if (!isHole(np * ch)) continue;
      mask[np] = 1;
      stack.push(np);
    }
  }
  return { mask, count, minX, minY, maxX, maxY };
}

async function makeFrame(src, outW, outH, outPath) {
  const { data, info } = await sharp(src)
    .resize(outW, outH, { fit: 'fill' })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const w = info.width;
  const h = info.height;
  const total = w * h;
  const fill = floodFill(data, w, h, Math.floor(w / 2), Math.floor(h / 2));
  const coverage = fill.count / total;
  console.log(path.basename(outPath), {
    holePx: fill.count,
    coverage: Number(coverage.toFixed(3)),
    bounds: [fill.minX, fill.minY, fill.maxX, fill.maxY],
  });
  if (fill.count < 1000 || coverage < 0.2) {
    throw new Error(`Hole detection failed for ${outPath}`);
  }
  // Guard: top banner (SCREAM) and bottom plaque must remain opaque.
  const topBand = Math.round(h * 0.08);
  const botBand = Math.round(h * 0.88);
  let topLeak = 0;
  let botLeak = 0;
  for (let p = 0; p < total; p++) {
    if (!fill.mask[p]) continue;
    const y = Math.floor(p / w);
    if (y < topBand) topLeak++;
    if (y > botBand) botLeak++;
  }
  console.log('  banner leak', { topLeak, botLeak, topBand, botBand });
  for (let p = 0; p < total; p++) {
    if (fill.mask[p]) data[p * 4 + 3] = 0;
  }
  // Force-restore top/bottom decorative bands if flood leaked.
  if (topLeak > 50 || botLeak > 50) {
    const orig = await sharp(src)
      .resize(outW, outH, { fit: 'fill' })
      .ensureAlpha()
      .raw()
      .toBuffer();
    for (let y = 0; y < h; y++) {
      if (y >= topBand && y <= botBand) continue;
      for (let x = 0; x < w; x++) {
        const i = (y * w + x) * 4;
        data[i] = orig[i];
        data[i + 1] = orig[i + 1];
        data[i + 2] = orig[i + 2];
        data[i + 3] = 255;
      }
    }
    console.log('  restored top/bottom bands');
  }
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  await sharp(data, { raw: { width: w, height: h, channels: 4 } })
    .png({ compressionLevel: 9 })
    .toFile(outPath);
  return outPath;
}

async function main() {
  fs.mkdirSync(framesDir, { recursive: true });
  fs.mkdirSync(momentsFrames, { recursive: true });

  const land = path.join(framesDir, 'halloween-haunt.png');
  const port = path.join(framesDir, 'halloween-haunt-portrait.png');
  await makeFrame(LANDSCAPE_SRC, 1800, 1200, land);
  await makeFrame(PORTRAIT_SRC, 1200, 1800, port);
  fs.copyFileSync(land, path.join(momentsFrames, 'halloween-haunt.png'));
  fs.copyFileSync(port, path.join(momentsFrames, 'halloween-haunt-portrait.png'));

  const buildsRoot = 'f:/Workspace Important Projects/AI Photobooth/builds';
  if (fs.existsSync(buildsRoot)) {
    for (const name of fs.readdirSync(buildsRoot)) {
      const frameDir = path.join(buildsRoot, name, 'config', 'photo-frames');
      if (!fs.existsSync(frameDir)) continue;
      fs.copyFileSync(land, path.join(frameDir, 'halloween-haunt.png'));
      fs.copyFileSync(port, path.join(frameDir, 'halloween-haunt-portrait.png'));
    }
  }
  console.log('ok');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
