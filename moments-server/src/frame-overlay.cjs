const fs=require('fs');
const FRAME_HOLE_BLACK_MAX = 18;

function isChromaHolePixel(r, g, b, a, threshold) {
  if (a < 16) return true;
  return r <= threshold && g <= threshold && b <= threshold;
}

function floodFillHoleMask(data, width, height, channels, seedX, seedY, threshold) {
  const mask = new Uint8Array(width * height);
  const seedI = (seedY * width + seedX) * channels;
  if (!isChromaHolePixel(data[seedI], data[seedI + 1], data[seedI + 2], data[seedI + 3], threshold)) {
    return { mask, count: 0, minX: 0, minY: 0, maxX: 0, maxY: 0 };
  }
  const stack = [seedY * width + seedX];
  mask[stack[0]] = 1;
  let count = 0;
  let minX = width;
  let minY = height;
  let maxX = 0;
  let maxY = 0;
  while (stack.length) {
    const p = stack.pop();
    const x = p % width;
    const y = (p - x) / width;
    count += 1;
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
    const neighbors = [p - 1, p + 1, p - width, p + width];
    const valid = [x > 0, x < width - 1, y > 0, y < height - 1];
    for (let n = 0; n < 4; n++) {
      if (!valid[n]) continue;
      const np = neighbors[n];
      if (mask[np]) continue;
      const i = np * channels;
      if (!isChromaHolePixel(data[i], data[i + 1], data[i + 2], data[i + 3], threshold)) continue;
      mask[np] = 1;
      stack.push(np);
    }
  }
  return { mask, count, minX, minY, maxX, maxY };
}

function fallbackHoleRect(w, h) {
  return {
    left: Math.round(w * 0.06),
    top: Math.round(h * 0.08),
    width: Math.round(w * 0.62),
    height: Math.round(h * 0.72),
  };
}

function holeRectFromBounds(minX, minY, maxX, maxY, w, h) {
  // Inclusive bounds with bleed under antialiased artwork, never an inset.
  const left = Math.max(0, minX - 2), top = Math.max(0, minY - 2);
  return { left, top, width: Math.min(w, maxX + 3) - left,
    height: Math.min(h, maxY + 3) - top };
}

/**
 * Build the overlay that sits on top of the guest photo.
 * Prefer the file's own alpha channel (real PNGs). Only chroma-key a painted
 * black rectangle when the file has no usable transparency (JPEG / opaque PNG).
 */
async function prepareFrameOverlay(sharpMod, framePath) {
  const meta = await sharpMod(framePath).metadata();
  const w = meta.width || 1;
  const h = meta.height || 1;
  const { data, info } = await sharpMod(framePath).ensureAlpha().raw().toBuffer({
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

  const hasUsableAlpha = meta.hasAlpha === true && alphaHoles > total * 0.05;
  if (hasUsableAlpha) {
    // The shipped Halloween overlays contain an opaque black matte beyond
    // their rectangular alpha window. Key only those exact legacy assets;
    // custom transparent frames must retain all their original artwork.
    const stockMattes = new Set([
      'c04e35619b3e2efe375d97ca3551fab6c02e2a3700ac261178d94c1076b6a9e5',
      '4758793237ee5ac6cab39800f4e4d717e2c61e545601f13a7f6cede072cbfa4e',
    ]);
    const hash = require('crypto').createHash('sha256').update(fs.readFileSync(framePath)).digest('hex');
    if (stockMattes.has(hash)) {
      const fill = floodFillHoleMask(data, w, h, channels, Math.floor(w / 2), Math.floor(h / 2), 18);
      for (let p = 0; p < total; p++) if (fill.mask[p]) data[p * channels + 3] = 0;
      minX = Math.min(minX, fill.minX); minY = Math.min(minY, fill.minY);
      maxX = Math.max(maxX, fill.maxX); maxY = Math.max(maxY, fill.maxY);
    }
    const hole = holeRectFromBounds(minX, minY, maxX, maxY, w, h);
    const overlay = await sharpMod(data, { raw: { width: w, height: h, channels } }).png().toBuffer();
    return { hole, overlay, keyed: stockMattes.has(hash) };
  }

  const seeds = [[Math.floor(w / 2), Math.floor(h / 2)]];
  for (let y = Math.floor(h * 0.2); y < h * 0.8; y += Math.max(8, Math.floor(h / 20))) {
    for (let x = Math.floor(w * 0.2); x < w * 0.8; x += Math.max(8, Math.floor(w / 20))) {
      seeds.push([x, y]);
    }
  }
  let best = { mask: new Uint8Array(total), count: 0, minX: 0, minY: 0, maxX: 0, maxY: 0 };
  const tried = new Uint8Array(total);
  for (const [sx, sy] of seeds) {
    const sp = sy * w + sx;
    if (tried[sp]) continue;
    const fill = floodFillHoleMask(data, w, h, channels, sx, sy, FRAME_HOLE_BLACK_MAX);
    if (fill.count > 0) {
      for (let p = 0; p < total; p++) {
        if (fill.mask[p]) tried[p] = 1;
      }
    }
    if (fill.count > best.count) best = fill;
  }

  const coverage = best.count / total;
  const hole =
    best.count < 80 || coverage < 0.08
      ? fallbackHoleRect(w, h)
      : holeRectFromBounds(best.minX, best.minY, best.maxX, best.maxY, w, h);

  if (best.count >= 80 && coverage >= 0.08) {
    for (let p = 0; p < total; p++) {
      if (best.mask[p]) data[p * channels + 3] = 0;
    }
  }

  const overlay = await sharpMod(data, { raw: { width: w, height: h, channels } })
    .png()
    .toBuffer();
  return { hole, overlay, keyed: true };
}


module.exports={prepareFrameOverlay};
