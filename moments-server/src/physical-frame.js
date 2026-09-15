import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { nanoid } from 'nanoid';
import { config } from './config.js';

/** Matches booth Admin → Modes cut-sheet defaults (SELPHY 148×100 mm). */
export const PHYSICAL_FRAME_DEFAULTS = {
  cellWidthCm: 5.3,
  cellHeightCm: 7.8,
  innerPaddingMm: 3,
  safeInsetTopMm: 0.2,
  safeInsetBottomMm: 0.2,
  safeInsetLeftMm: 3,
  safeInsetRightMm: 1,
  gapMm: 4,
  marginMm: 0,
  printerCropInsetMm: 0,
  dpi: 300,
  rotateDegrees: -90,
  borderEnabled: true,
  cropZoom: 1,
  cropPanX: 0,
  cropPanY: 0,
  // Nameplate (optional second upload) — STL recess ≈ 52 × 8.5 mm capsule
  nameplateEnabled: false,
  nameplateWidthMm: 52,
  nameplateHeightMm: 8.5,
  nameplateSafeInsetMm: 0.75,
  nameplateGapMm: 2,
  nameplateFit: 'contain',
  nameplateCropZoom: 1,
  nameplateCropPanX: 0,
  nameplateCropPanY: 0,
  nameplateCutGuide: true,
};

const MAX_DECODED_PIXELS = 40_000_000;

export function ensurePhysicalDir() {
  fs.mkdirSync(config.physicalDir, { recursive: true });
  return config.physicalDir;
}

export function cmToPx(cm, dpi) {
  return Math.round((Number(cm) / 2.54) * dpi);
}

export function mmToPx(mm, dpi) {
  return Math.round((Number(mm) / 25.4) * dpi);
}

function num(v, fallback) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function parseBool(raw, fallback) {
  if (raw === undefined || raw === null || raw === '') return fallback;
  if (raw === true || raw === false) return raw;
  const s = String(raw).trim().toLowerCase();
  if (s === 'true' || s === '1' || s === 'yes' || s === 'on') return true;
  if (s === 'false' || s === '0' || s === 'no' || s === 'off') return false;
  throw new Error(`Invalid boolean value: ${raw}`);
}

function clamp(n, lo, hi) {
  return Math.min(hi, Math.max(lo, n));
}

/**
 * @param {Record<string, unknown>} raw
 * @param {{ hasNameplateFile?: boolean }} [ctx]
 */
export function normalizePhysicalOpts(raw = {}, ctx = {}) {
  const d = PHYSICAL_FRAME_DEFAULTS;
  const hasFile = !!ctx.hasNameplateFile;
  let nameplateEnabled;
  if (raw.nameplateEnabled === undefined || raw.nameplateEnabled === null || raw.nameplateEnabled === '') {
    nameplateEnabled = hasFile;
  } else {
    nameplateEnabled = parseBool(raw.nameplateEnabled, false);
  }

  const rot = Number(raw.rotateDegrees);
  const z = num(raw.cropZoom ?? raw.zoom, d.cropZoom);
  const px = num(raw.cropPanX ?? raw.panX, d.cropPanX);
  const py = num(raw.cropPanY ?? raw.panY, d.cropPanY);

  const fitRaw = String(raw.nameplateFit ?? d.nameplateFit).toLowerCase();
  if (fitRaw !== 'contain' && fitRaw !== 'cover') {
    throw new Error('nameplateFit must be "contain" (Fit artwork) or "cover" (Fill label).');
  }

  const nz = num(raw.nameplateCropZoom, d.nameplateCropZoom);
  const npx = num(raw.nameplateCropPanX, d.nameplateCropPanX);
  const npy = num(raw.nameplateCropPanY, d.nameplateCropPanY);

  return {
    cellWidthCm: clamp(num(raw.cellWidthCm, d.cellWidthCm), 3, 7.4),
    cellHeightCm: clamp(num(raw.cellHeightCm, d.cellHeightCm), 4, 9.8),
    innerPaddingMm: clamp(num(raw.innerPaddingMm, d.innerPaddingMm), 0, 12),
    safeInsetTopMm: clamp(num(raw.safeInsetTopMm, d.safeInsetTopMm), 0, 20),
    safeInsetBottomMm: clamp(num(raw.safeInsetBottomMm, d.safeInsetBottomMm), 0, 25),
    safeInsetLeftMm: clamp(num(raw.safeInsetLeftMm, d.safeInsetLeftMm), 0, 15),
    safeInsetRightMm: clamp(num(raw.safeInsetRightMm, d.safeInsetRightMm), 0, 15),
    gapMm: clamp(num(raw.gapMm, d.gapMm), 0, 15),
    marginMm: clamp(num(raw.marginMm, d.marginMm), 0, 15),
    printerCropInsetMm: clamp(num(raw.printerCropInsetMm, d.printerCropInsetMm), 0, 12),
    dpi: Math.round(clamp(num(raw.dpi, d.dpi), 72, 600)),
    rotateDegrees: rot === 90 ? 90 : -90,
    borderEnabled: parseBool(raw.borderEnabled, d.borderEnabled),
    cropZoom: clamp(z, 1, 4),
    cropPanX: clamp(px, -1, 1),
    cropPanY: clamp(py, -1, 1),
    nameplateEnabled,
    nameplateWidthMm: clamp(num(raw.nameplateWidthMm, d.nameplateWidthMm), 45, 55),
    nameplateHeightMm: clamp(num(raw.nameplateHeightMm, d.nameplateHeightMm), 6, 11),
    nameplateSafeInsetMm: clamp(num(raw.nameplateSafeInsetMm, d.nameplateSafeInsetMm), 0, 2),
    nameplateGapMm: clamp(num(raw.nameplateGapMm, d.nameplateGapMm), 1, 5),
    nameplateFit: fitRaw,
    nameplateCropZoom: clamp(nz, 0.25, 4),
    nameplateCropPanX: clamp(npx, -1, 1),
    nameplateCropPanY: clamp(npy, -1, 1),
    nameplateCutGuide: parseBool(raw.nameplateCutGuide, d.nameplateCutGuide),
  };
}

export function computeRotatedCrop(rw, rh, safeW, safeH, crop) {
  const zoom = clamp(Number(crop?.cropZoom ?? crop?.zoom) || 1, 1, 4);
  const panX = clamp(Number(crop?.cropPanX ?? crop?.panX) || 0, -1, 1);
  const panY = clamp(Number(crop?.cropPanY ?? crop?.panY) || 0, -1, 1);
  const srcW = Math.max(1, rw);
  const srcH = Math.max(1, rh);
  const destW = Math.max(1, safeW);
  const destH = Math.max(1, safeH);
  const cover = Math.max(destW / srcW, destH / srcH);
  const scale = cover * zoom;
  const safeAr = destW / destH;
  let visW = Math.min(srcW, destW / scale);
  let visH = Math.min(srcH, destH / scale);
  if (visW / visH > safeAr) visW = visH * safeAr;
  else visH = visW / safeAr;
  visW = Math.min(srcW, Math.max(1, visW));
  visH = Math.min(srcH, Math.max(1, visH));
  const maxL = Math.max(0, srcW - visW);
  const maxT = Math.max(0, srcH - visH);
  const left = Math.round(Math.min(maxL, Math.max(0, maxL / 2 + panX * (maxL / 2))));
  const top = Math.round(Math.min(maxT, Math.max(0, maxT / 2 + panY * (maxT / 2))));
  const width = Math.max(1, Math.min(Math.round(visW), srcW - left));
  const height = Math.max(1, Math.min(Math.round(visH), srcH - top));
  return { left, top, width, height };
}

export function resolveLayoutPx(opts, dpi) {
  const cellW = cmToPx(opts.cellWidthCm, dpi);
  const cellH = cmToPx(opts.cellHeightCm, dpi);
  const pageW = mmToPx(148, dpi);
  const pageH = mmToPx(100, dpi);
  const leftoverW = pageW - cellW * 2;
  const leftoverH = pageH - cellH;
  const gap = leftoverW >= mmToPx(8, dpi) ? mmToPx(4, dpi) : Math.max(0, Math.round(leftoverW * 0.2));
  const marginX = Math.max(0, Math.round((leftoverW - gap) / 2));
  const marginY = Math.max(0, Math.round(leftoverH / 2));
  return {
    cellW,
    cellH,
    gap,
    marginX,
    marginY,
    pageW,
    pageH,
    innerPad: mmToPx(opts.innerPaddingMm, dpi),
    safeTop: mmToPx(opts.safeInsetTopMm, dpi),
    safeBottom: mmToPx(opts.safeInsetBottomMm, dpi),
    safeLeft: mmToPx(opts.safeInsetLeftMm, dpi),
    safeRight: mmToPx(opts.safeInsetRightMm, dpi),
  };
}

/**
 * Photo cell rectangles + optional single nameplate strip (after quarter-turn).
 * @returns {{ photoCells: Array<{x,y,width,height}>, nameplates: Array<{x,y,width,height}> }}
 */
export function resolveSheetRects(opts, dpi = opts.dpi) {
  const layout = resolveLayoutPx(opts, dpi);
  const photoCells = [
    { x: layout.marginX, y: layout.marginY, width: layout.cellW, height: layout.cellH },
    {
      x: layout.marginX + layout.cellW + layout.gap,
      y: layout.marginY,
      width: layout.cellW,
      height: layout.cellH,
    },
  ];
  const nameplates = [];
  if (opts.nameplateEnabled) {
    const nameW = mmToPx(opts.nameplateWidthMm, dpi);
    const nameH = mmToPx(opts.nameplateHeightMm, dpi);
    const stripW = nameH;
    const stripH = nameW;
    const stripGap = mmToPx(opts.nameplateGapMm, dpi);
    const photo2X = layout.marginX + layout.cellW + layout.gap;
    const stripY = layout.marginY + Math.round((layout.cellH - stripH) / 2);
    nameplates.push({
      x: photo2X + layout.cellW + stripGap,
      y: stripY,
      width: stripW,
      height: stripH,
    });
  }
  return { layout, photoCells, nameplates, pageW: layout.pageW, pageH: layout.pageH };
}

function rectsOverlap(a, b) {
  return !(
    a.x + a.width <= b.x ||
    b.x + b.width <= a.x ||
    a.y + a.height <= b.y ||
    b.y + b.height <= a.y
  );
}

export function validateSheetLayout(opts, dpi = opts.dpi) {
  const { layout, photoCells, nameplates, pageW, pageH } = resolveSheetRects(opts, dpi);
  const pieces = [...photoCells, ...nameplates];
  for (const r of pieces) {
    if (r.width <= 0 || r.height <= 0) {
      throw new Error('Layout produced a zero-size cut piece. Check cell and nameplate dimensions.');
    }
    if (r.x < 0 || r.y < 0 || r.x + r.width > pageW || r.y + r.height > pageH) {
      throw new Error(
        'This cell width leaves insufficient room for the nameplate. Reset to the 5.3 × 7.8 cm photo layout or reduce the cell width.',
      );
    }
  }
  for (let i = 0; i < pieces.length; i++) {
    for (let j = i + 1; j < pieces.length; j++) {
      if (rectsOverlap(pieces[i], pieces[j])) {
        throw new Error(
          'Nameplate overlaps a photo cell. Reduce the cell width or nameplate gap, or reset to defaults.',
        );
      }
    }
  }
  if (opts.nameplateEnabled) {
    if (nameplates.length !== 1) {
      throw new Error('Nameplate mode requires exactly one nameplate rectangle.');
    }
    const edgeClear = mmToPx(5, dpi);
    const np = nameplates[0];
    if (
      np.x < edgeClear ||
      np.y < edgeClear ||
      np.x + np.width > pageW - edgeClear ||
      np.y + np.height > pageH - edgeClear
    ) {
      throw new Error(
        'This cell width leaves insufficient room for the nameplate. Reset to the 5.3 × 7.8 cm photo layout or reduce the cell width.',
      );
    }
  }
  return { layout, photoCells, nameplates, pageW, pageH };
}

function buildCellBorderSvg(w, h, dpi) {
  const stroke = Math.max(1, Math.round(dpi / 180));
  const hair = Math.max(1, Math.round(dpi / 360));
  const inset = Math.max(stroke * 2, Math.round(dpi / 120));
  const x = inset;
  const y = inset;
  const bw = w - inset * 2;
  const bh = h - inset * 2;
  const inner = stroke + hair + 2;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
  <rect x="${x}" y="${y}" width="${bw}" height="${bh}" fill="none" stroke="#8b7348" stroke-width="${stroke}" opacity="0.92"/>
  <rect x="${x + inner}" y="${y + inner}" width="${Math.max(1, bw - inner * 2)}" height="${Math.max(1, bh - inner * 2)}" fill="none" stroke="#dcc9a3" stroke-width="${hair}" opacity="0.78"/>
</svg>`;
}

async function assertDecodableImage(buf, label) {
  let meta;
  try {
    meta = await sharp(buf, { failOn: 'none', animated: false }).metadata();
  } catch (e) {
    throw new Error(`${label}: unreadable image (${e.message || e}).`);
  }
  const format = String(meta.format || '').toLowerCase();
  if (!['jpeg', 'jpg', 'png', 'webp'].includes(format)) {
    throw new Error(`${label}: unsupported format. Use JPEG, PNG, or WebP.`);
  }
  if (meta.pages && meta.pages > 1) {
    throw new Error(`${label}: multi-frame images are not supported.`);
  }
  const w = meta.width || 0;
  const h = meta.height || 0;
  if (w * h > MAX_DECODED_PIXELS) {
    throw new Error(`${label}: image is too large (max ~40 megapixels).`);
  }
  return meta;
}

async function fitPhoto(inputBuf, safeW, safeH, rotateDeg, crop) {
  const rot = Number(rotateDeg) === 90 ? 90 : -90;
  const rotated = await sharp(inputBuf)
    .rotate(rot, { background: { r: 255, g: 255, b: 255 } })
    .toBuffer();
  const rotMeta = await sharp(rotated).metadata();
  const rw = rotMeta.width || safeW;
  const rh = rotMeta.height || safeH;
  const box = computeRotatedCrop(rw, rh, safeW, safeH, crop);
  const buf = await sharp(rotated)
    .extract(box)
    .resize(safeW, safeH, { fit: 'fill' })
    .jpeg({ quality: 94, mozjpeg: true })
    .toBuffer();
  const after = await sharp(buf).metadata();
  return {
    buf,
    width: after.width || safeW,
    height: after.height || safeH,
  };
}

async function buildCell(inputBuf, layout, rotate, borderEnabled, dpi, crop) {
  const { cellW, cellH, innerPad, safeTop, safeBottom, safeLeft, safeRight } = layout;
  const frameW = Math.max(8, cellW - innerPad * 2);
  const frameH = Math.max(8, cellH - innerPad * 2);
  const safeW = Math.max(8, frameW - safeLeft - safeRight);
  const safeH = Math.max(8, frameH - safeTop - safeBottom);
  const photo = await fitPhoto(inputBuf, safeW, safeH, rotate, crop);
  const photoLeft = innerPad + safeLeft + Math.round((safeW - photo.width) / 2);
  const photoTop = innerPad + safeTop + Math.round((safeH - photo.height) / 2);
  const composites = [{ input: photo.buf, left: photoLeft, top: photoTop }];
  if (borderEnabled) {
    composites.push({
      input: Buffer.from(buildCellBorderSvg(frameW, frameH, dpi)),
      left: innerPad,
      top: innerPad,
    });
  }
  return sharp({
    create: {
      width: cellW,
      height: cellH,
      channels: 3,
      background: { r: 255, g: 255, b: 255 },
    },
  })
    .composite(composites)
    .png()
    .toBuffer();
}

/**
 * Shared nameplate artwork placement (horizontal canvas, before sheet rotation).
 * @returns {{ viewX: number, viewY: number, viewW: number, viewH: number, imageX: number, imageY: number, renderedW: number, renderedH: number, srcExtract: {left,top,width,height}|null }}
 */
export function computeNameplatePlacement(srcW, srcH, canvasW, canvasH, opts) {
  const W = canvasW;
  const H = canvasH;
  const R = H / 2;
  const S = mmToPx(opts.nameplateSafeInsetMm, opts.dpi);
  const fit = opts.nameplateFit === 'cover' ? 'cover' : 'contain';

  let viewX = 0;
  let viewY = 0;
  let viewW = W;
  let viewH = H;
  if (fit === 'contain') {
    const safeWmm = opts.nameplateWidthMm - 2 * (opts.nameplateHeightMm / 2) - 2 * opts.nameplateSafeInsetMm;
    const safeHmm = opts.nameplateHeightMm - 2 * opts.nameplateSafeInsetMm;
    if (safeWmm <= 0 || safeHmm <= 0) {
      throw new Error('Nameplate safe artwork box is nonpositive. Reduce safe inset or increase label size.');
    }
    viewW = Math.max(1, mmToPx(safeWmm, opts.dpi));
    viewH = Math.max(1, mmToPx(safeHmm, opts.dpi));
    // Prefer geometry from radius+inset when px rounding drifts
    const altW = Math.max(1, W - 2 * Math.round(R) - 2 * S);
    const altH = Math.max(1, H - 2 * S);
    viewW = Math.min(viewW, altW);
    viewH = Math.min(viewH, altH);
    viewX = Math.round((W - viewW) / 2);
    viewY = Math.round((H - viewH) / 2);
  }

  const baseScale =
    fit === 'contain' ? Math.min(viewW / srcW, viewH / srcH) : Math.max(viewW / srcW, viewH / srcH);
  const scale = baseScale * opts.nameplateCropZoom;
  const renderedW = srcW * scale;
  const renderedH = srcH * scale;
  const travelX = Math.abs(viewW - renderedW) / 2;
  const travelY = Math.abs(viewH - renderedH) / 2;
  const imageX = (viewW - renderedW) / 2 - opts.nameplateCropPanX * travelX;
  const imageY = (viewH - renderedH) / 2 - opts.nameplateCropPanY * travelY;

  // Intersection of transformed image with viewport (local to viewport)
  const ix0 = Math.max(0, imageX);
  const iy0 = Math.max(0, imageY);
  const ix1 = Math.min(viewW, imageX + renderedW);
  const iy1 = Math.min(viewH, imageY + renderedH);
  if (ix1 <= ix0 || iy1 <= iy0) {
    throw new Error('Nameplate crop is empty. Reset nameplate position.');
  }
  const srcLeft = Math.max(0, Math.round(((ix0 - imageX) / scale)));
  const srcTop = Math.max(0, Math.round(((iy0 - imageY) / scale)));
  const srcRight = Math.min(srcW, Math.round(((ix1 - imageX) / scale)));
  const srcBottom = Math.min(srcH, Math.round(((iy1 - imageY) / scale)));
  const srcExtract = {
    left: srcLeft,
    top: srcTop,
    width: Math.max(1, srcRight - srcLeft),
    height: Math.max(1, srcBottom - srcTop),
  };
  const destW = Math.max(1, Math.round(ix1 - ix0));
  const destH = Math.max(1, Math.round(iy1 - iy0));

  return {
    viewX,
    viewY,
    viewW,
    viewH,
    imageX: viewX + imageX,
    imageY: viewY + imageY,
    renderedW,
    renderedH,
    destLeft: viewX + Math.round(ix0),
    destTop: viewY + Math.round(iy0),
    destW,
    destH,
    srcExtract,
  };
}

function capsuleMaskSvg(w, h) {
  const rx = h / 2;
  return Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
  <rect x="0" y="0" width="${w}" height="${h}" rx="${rx}" ry="${rx}" fill="#fff"/>
</svg>`,
  );
}

function cutGuideSvg(w, h, dpi) {
  const stroke = Math.max(1, Math.round(mmToPx(0.1, dpi)));
  const rx = h / 2;
  const inset = stroke;
  return Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
  <rect x="${inset}" y="${inset}" width="${Math.max(1, w - inset * 2)}" height="${Math.max(1, h - inset * 2)}" rx="${Math.max(0, rx - inset)}" ry="${Math.max(0, rx - inset)}" fill="none" stroke="#c8c2b8" stroke-width="${stroke}" opacity="0.55"/>
</svg>`,
  );
}

/**
 * Build horizontal nameplate PNG with alpha capsule, then rotate for sheet.
 * @returns {Promise<{ buf: Buffer, width: number, height: number, horizontal: { width: number, height: number } }>}
 */
export async function buildNameplate(buffer, opts) {
  await assertDecodableImage(buffer, 'Nameplate image');
  // Normalize EXIF orientation into pixel data (one rotate per pipeline).
  const oriented = await sharp(buffer, { failOn: 'none' }).rotate().png().toBuffer();
  const meta = await sharp(oriented).metadata();
  const srcW = meta.width || 1;
  const srcH = meta.height || 1;
  const dpi = opts.dpi;
  const canvasW = mmToPx(opts.nameplateWidthMm, dpi);
  const canvasH = mmToPx(opts.nameplateHeightMm, dpi);
  const place = computeNameplatePlacement(srcW, srcH, canvasW, canvasH, opts);

  const art = await sharp(oriented)
    .extract(place.srcExtract)
    .resize(place.destW, place.destH, { fit: 'fill' })
    .png()
    .toBuffer();

  const composites = [{ input: art, left: place.destLeft, top: place.destTop }];
  if (opts.nameplateCutGuide) {
    composites.push({ input: cutGuideSvg(canvasW, canvasH, dpi), left: 0, top: 0 });
  }

  const masked = await sharp({
    create: {
      width: canvasW,
      height: canvasH,
      channels: 4,
      background: { r: 255, g: 255, b: 255, alpha: 1 },
    },
  })
    .composite([
      ...composites,
      { input: capsuleMaskSvg(canvasW, canvasH), blend: 'dest-in' },
    ])
    .png()
    .toBuffer();

  const rot = opts.rotateDegrees === 90 ? 90 : -90;
  const rotated = await sharp(masked)
    .rotate(rot, { background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer();
  const rm = await sharp(rotated).metadata();
  return {
    buf: rotated,
    width: rm.width || canvasH,
    height: rm.height || canvasW,
    horizontal: { width: canvasW, height: canvasH },
  };
}

/**
 * Dual photo cells (+ optional single nameplate strip).
 * @param {Buffer} inputBuf
 * @param {Record<string, unknown>} rawOpts
 * @param {Buffer|null} [nameplateBuf]
 */
export async function compositePhysicalFrameDual(inputBuf, rawOpts = {}, nameplateBuf = null) {
  await assertDecodableImage(inputBuf, 'Main photo');
  const opts = normalizePhysicalOpts(rawOpts, { hasNameplateFile: !!nameplateBuf });
  if (opts.nameplateEnabled && !nameplateBuf) {
    throw new Error('Choose a nameplate image or disable the nameplate.');
  }
  if (!opts.nameplateEnabled && nameplateBuf) {
    throw new Error('Nameplate was uploaded but nameplateEnabled is false. Enable it or clear the file.');
  }

  const dpi = opts.dpi;
  const { layout, photoCells, nameplates, pageW, pageH } = validateSheetLayout(opts, dpi);
  const photoCell = await buildCell(
    inputBuf,
    layout,
    opts.rotateDegrees,
    opts.borderEnabled,
    dpi,
    opts,
  );

  const composites = [
    { input: photoCell, left: photoCells[0].x, top: photoCells[0].y },
    { input: photoCell, left: photoCells[1].x, top: photoCells[1].y },
  ];

  if (opts.nameplateEnabled && nameplateBuf) {
    const plate = await buildNameplate(nameplateBuf, opts);
    const target = nameplates[0];
    if (plate.width !== target.width || plate.height !== target.height) {
      // Tolerate 1px rounding drift by centering within target rect
      const left = target.x + Math.round((target.width - plate.width) / 2);
      const top = target.y + Math.round((target.height - plate.height) / 2);
      composites.push({ input: plate.buf, left, top });
    } else {
      composites.push({ input: plate.buf, left: target.x, top: target.y });
    }
  }

  let png = await sharp({
    create: {
      width: pageW,
      height: pageH,
      channels: 4,
      background: { r: 255, g: 255, b: 255, alpha: 1 },
    },
  })
    .composite(composites)
    .png()
    .toBuffer();

  png = await sharp(png).withMetadata({ density: dpi }).png().toBuffer();

  return {
    png,
    width: pageW,
    height: pageH,
    opts,
    layout: {
      page: { width: pageW, height: pageH, dpi },
      photoCells,
      nameplates,
    },
  };
}

const SELPHY_POSTCARD_W_MM = 148;
const SELPHY_POSTCARD_H_MM = 100;

/** Sheets are already 148×100 mm at 1:1. Never shrink cells. */
export async function padToSelphyPostcard(png, dpi = 300, _cropInsetMm = 0) {
  const pageW = Math.max(1, Math.round((SELPHY_POSTCARD_W_MM / 25.4) * dpi));
  const pageH = Math.max(1, Math.round((SELPHY_POSTCARD_H_MM / 25.4) * dpi));
  const meta = await sharp(png).metadata();
  const fw = meta.width || pageW;
  const fh = meta.height || pageH;
  if (fw === pageW && fh === pageH) {
    const withDpi = await sharp(png).withMetadata({ density: dpi }).png().toBuffer();
    return { png: withDpi, width: pageW, height: pageH };
  }
  const fitted = await sharp(png)
    .resize(pageW, pageH, { fit: 'inside', withoutEnlargement: true })
    .png()
    .toBuffer();
  const sm = await sharp(fitted).metadata();
  const sw = sm.width || fw;
  const sh = sm.height || fh;
  const out = await sharp({
    create: {
      width: pageW,
      height: pageH,
      channels: 3,
      background: { r: 255, g: 255, b: 255 },
    },
  })
    .composite([
      {
        input: fitted,
        left: Math.round((pageW - sw) / 2),
        top: Math.round((pageH - sh) / 2),
      },
    ])
    .withMetadata({ density: dpi })
    .png()
    .toBuffer();
  return { png: out, width: pageW, height: pageH };
}

export function saveGeneratedSheet(png, meta) {
  ensurePhysicalDir();
  const id = nanoid(12);
  const filename = `${id}.png`;
  const pngPath = path.join(config.physicalDir, filename);
  const jsonPath = path.join(config.physicalDir, `${id}.json`);
  fs.writeFileSync(pngPath, png);
  const hasNameplate = !!meta.hasNameplate;
  const record = {
    id,
    filename,
    createdAt: new Date().toISOString(),
    schemaVersion: 2,
    originalName: meta.originalName || null,
    hasNameplate,
    nameplateOriginalName: hasNameplate ? meta.nameplateOriginalName || null : null,
    bytes: png.length,
    width: meta.width,
    height: meta.height,
    settings: meta.settings,
    layout: meta.layout || {
      page: { width: meta.width, height: meta.height, dpi: meta.settings?.dpi || 300 },
      photoCells: [],
      nameplates: [],
    },
  };
  fs.writeFileSync(jsonPath, JSON.stringify(record, null, 2), 'utf8');
  return record;
}

export function listGeneratedSheets() {
  ensurePhysicalDir();
  const items = [];
  for (const name of fs.readdirSync(config.physicalDir)) {
    if (!name.endsWith('.json')) continue;
    try {
      const rec = JSON.parse(fs.readFileSync(path.join(config.physicalDir, name), 'utf8'));
      const pngPath = path.join(config.physicalDir, rec.filename || `${rec.id}.png`);
      rec.fileExists = fs.existsSync(pngPath);
      if (rec.hasNameplate === undefined) rec.hasNameplate = false;
      items.push(rec);
    } catch {
      /* skip */
    }
  }
  items.sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
  return items.slice(0, 40);
}

export function getGeneratedSheet(id) {
  const safe = String(id || '').replace(/[^a-zA-Z0-9_-]/g, '');
  if (!safe) return null;
  const jsonPath = path.join(config.physicalDir, `${safe}.json`);
  const pngPath = path.join(config.physicalDir, `${safe}.png`);
  if (!fs.existsSync(pngPath)) return null;
  let record = { id: safe, filename: `${safe}.png` };
  if (fs.existsSync(jsonPath)) {
    try {
      record = { ...record, ...JSON.parse(fs.readFileSync(jsonPath, 'utf8')) };
    } catch {
      /* use defaults */
    }
  }
  return { ...record, pngPath };
}

export function deleteGeneratedSheet(id) {
  const rec = getGeneratedSheet(id);
  if (!rec) return false;
  try {
    fs.unlinkSync(rec.pngPath);
  } catch {
    /* ignore */
  }
  try {
    fs.unlinkSync(path.join(config.physicalDir, `${rec.id}.json`));
  } catch {
    /* ignore */
  }
  return true;
}
