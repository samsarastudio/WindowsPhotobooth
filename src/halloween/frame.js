import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { halloweenPublicAssets } from './paths.js';

const BLACK_MAX = 10;

function floodFillHole(data, w, h, seedX, seedY) {
  const total = w * h;
  const mask = new Uint8Array(total);
  const isHole = (i) =>
    data[i + 3] < 16 ||
    (data[i] <= BLACK_MAX && data[i + 1] <= BLACK_MAX && data[i + 2] <= BLACK_MAX);
  const si = (seedY * w + seedX) * 4;
  if (!isHole(si)) return mask;
  const stack = [seedY * w + seedX];
  mask[stack[0]] = 1;
  while (stack.length) {
    const p = stack.pop();
    const x = p % w;
    const y = (p - x) / w;
    const nbs = [
      [x > 0, p - 1],
      [x < w - 1, p + 1],
      [y > 0, p - w],
      [y < h - 1, p + w],
    ];
    for (const [ok, np] of nbs) {
      if (!ok || mask[np]) continue;
      if (!isHole(np * 4)) continue;
      mask[np] = 1;
      stack.push(np);
    }
  }
  return mask;
}

async function prepareFrameOverlay(framePath) {
  const meta = await sharp(framePath).metadata();
  const w = meta.width || 1;
  const h = meta.height || 1;
  const { data, info } = await sharp(framePath).ensureAlpha().raw().toBuffer({
    resolveWithObject: true,
  });
  const channels = info.channels || 4;
  const total = w * h;

  let alphaHoles = 0;
  let minX = w;
  let minY = h;
  let maxX = 0;
  let maxY = 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const a = data[(y * w + x) * channels + 3];
      if (a >= 16) continue;
      alphaHoles += 1;
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
    }
  }

  if (meta.hasAlpha === true && alphaHoles > total * 0.05) {
    const padX = Math.round((maxX - minX) * 0.01);
    const padY = Math.round((maxY - minY) * 0.01);
    const hole = {
      left: Math.max(0, minX + padX),
      top: Math.max(0, minY + padY),
      width: Math.max(32, Math.min(w - minX, maxX - minX - padX * 2)),
      height: Math.max(32, Math.min(h - minY, maxY - minY - padY * 2)),
    };
    const overlay = await sharp(framePath).ensureAlpha().png().toBuffer();
    return { hole, overlay, fw: w, fh: h };
  }

  // Opaque JPEG/PNG — chroma-key pure black hole from center.
  const mask = floodFillHole(data, w, h, Math.floor(w / 2), Math.floor(h / 2));
  minX = w;
  minY = h;
  maxX = 0;
  maxY = 0;
  let count = 0;
  for (let p = 0; p < total; p++) {
    if (!mask[p]) continue;
    count += 1;
    data[p * channels + 3] = 0;
    const x = p % w;
    const y = (p - x) / w;
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
  }
  if (count < 80) {
    minX = Math.round(w * 0.06);
    minY = Math.round(h * 0.12);
    maxX = w - minX;
    maxY = h - Math.round(h * 0.12);
  }
  const hole = {
    left: minX,
    top: minY,
    width: Math.max(32, maxX - minX),
    height: Math.max(32, maxY - minY),
  };
  const overlay = await sharp(data, { raw: { width: w, height: h, channels } }).png().toBuffer();
  return { hole, overlay, fw: w, fh: h };
}

export function halloweenFramePath(pipeline) {
  const name =
    pipeline === 'head-swap' ? 'halloween-haunt-portrait.png' : 'halloween-haunt.png';
  return path.join(halloweenPublicAssets, 'frames', name);
}

/**
 * Composite photo into HauntBooth Halloween frame (portrait or landscape).
 * @param {Buffer|string} photoInput
 * @param {'head-swap'|'scene'} pipeline
 */
export async function applyHalloweenFrame(photoInput, pipeline) {
  const framePath = halloweenFramePath(pipeline);
  if (!fs.existsSync(framePath)) {
    if (Buffer.isBuffer(photoInput)) return photoInput;
    return sharp(photoInput).png().toBuffer();
  }
  const { hole, overlay, fw, fh } = await prepareFrameOverlay(framePath);
  const photoBuf = await sharp(photoInput)
    .resize(hole.width, hole.height, { fit: 'cover', position: 'centre' })
    .ensureAlpha()
    .png()
    .toBuffer();
  const base = await sharp({
    create: {
      width: fw,
      height: fh,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 1 },
    },
  })
    .composite([{ input: photoBuf, left: hole.left, top: hole.top }])
    .png()
    .toBuffer();
  return sharp(base)
    .composite([{ input: overlay, left: 0, top: 0 }])
    .png({ compressionLevel: 9, effort: 8 })
    .toBuffer();
}
