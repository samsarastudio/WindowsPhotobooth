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
};

export function ensurePhysicalDir() {
  fs.mkdirSync(config.physicalDir, { recursive: true });
  return config.physicalDir;
}

function cmToPx(cm, dpi) {
  return Math.round((Number(cm) / 2.54) * dpi);
}

function mmToPx(mm, dpi) {
  return Math.round((Number(mm) / 25.4) * dpi);
}

function num(v, fallback) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

export function normalizePhysicalOpts(raw = {}) {
  const d = PHYSICAL_FRAME_DEFAULTS;
  const rot = Number(raw.rotateDegrees);
  const z = num(raw.cropZoom ?? raw.zoom, d.cropZoom);
  const px = num(raw.cropPanX ?? raw.panX, d.cropPanX);
  const py = num(raw.cropPanY ?? raw.panY, d.cropPanY);
  return {
    cellWidthCm: Math.min(7.4, Math.max(3, num(raw.cellWidthCm, d.cellWidthCm))),
    cellHeightCm: Math.min(9.8, Math.max(4, num(raw.cellHeightCm, d.cellHeightCm))),
    innerPaddingMm: Math.min(12, Math.max(0, num(raw.innerPaddingMm, d.innerPaddingMm))),
    safeInsetTopMm: Math.min(20, Math.max(0, num(raw.safeInsetTopMm, d.safeInsetTopMm))),
    safeInsetBottomMm: Math.min(25, Math.max(0, num(raw.safeInsetBottomMm, d.safeInsetBottomMm))),
    safeInsetLeftMm: Math.min(15, Math.max(0, num(raw.safeInsetLeftMm, d.safeInsetLeftMm))),
    safeInsetRightMm: Math.min(15, Math.max(0, num(raw.safeInsetRightMm, d.safeInsetRightMm))),
    gapMm: Math.min(15, Math.max(0, num(raw.gapMm, d.gapMm))),
    marginMm: Math.min(15, Math.max(0, num(raw.marginMm, d.marginMm))),
    printerCropInsetMm: Math.min(12, Math.max(0, num(raw.printerCropInsetMm, d.printerCropInsetMm))),
    dpi: Math.round(Math.min(600, Math.max(72, num(raw.dpi, d.dpi)))),
    rotateDegrees: rot === 90 ? 90 : -90,
    borderEnabled: raw.borderEnabled === false || raw.borderEnabled === 'false' ? false : true,
    cropZoom: Math.min(4, Math.max(1, z)),
    cropPanX: Math.min(1, Math.max(-1, px)),
    cropPanY: Math.min(1, Math.max(-1, py)),
  };
}

function computeRotatedCrop(rw, rh, safeW, safeH, crop) {
  const zoom = Math.min(4, Math.max(1, Number(crop?.cropZoom ?? crop?.zoom) || 1));
  const panX = Math.min(1, Math.max(-1, Number(crop?.cropPanX ?? crop?.panX) || 0));
  const panY = Math.min(1, Math.max(-1, Number(crop?.cropPanY ?? crop?.panY) || 0));
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

function resolveLayoutPx(opts, dpi) {
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

export async function compositePhysicalFrameDual(inputBuf, rawOpts = {}) {
  const opts = normalizePhysicalOpts(rawOpts);
  const dpi = opts.dpi;
  const layout = resolveLayoutPx(opts, dpi);
  const { cellW, cellH, gap, marginX, marginY, pageW, pageH } = layout;
  const photoCell = await buildCell(
    inputBuf,
    layout,
    opts.rotateDegrees,
    opts.borderEnabled,
    dpi,
    opts,
  );
  const png = await sharp({
    create: {
      width: pageW,
      height: pageH,
      channels: 4,
      background: { r: 255, g: 255, b: 255, alpha: 1 },
    },
  })
    .composite([
      { input: photoCell, left: marginX, top: marginY },
      { input: photoCell, left: marginX + cellW + gap, top: marginY },
    ])
    .png()
    .toBuffer();
  return { png, width: pageW, height: pageH, opts };
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
    return { png, width: pageW, height: pageH };
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
  const record = {
    id,
    filename,
    createdAt: new Date().toISOString(),
    originalName: meta.originalName || null,
    bytes: png.length,
    width: meta.width,
    height: meta.height,
    settings: meta.settings,
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
