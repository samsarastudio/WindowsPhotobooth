import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { nanoid } from 'nanoid';
import { config } from './config.js';

/** Matches booth Admin → Modes cut-sheet defaults (SELPHY 6×4). */
export const PHYSICAL_FRAME_DEFAULTS = {
  cellWidthCm: 5.3,
  cellHeightCm: 7,
  innerPaddingMm: 3,
  safeInsetTopMm: 0.2,
  safeInsetBottomMm: 0.2,
  safeInsetLeftMm: 3,
  safeInsetRightMm: 1,
  gapMm: 6.35,
  marginMm: 6.35,
  dpi: 300,
  rotateDegrees: -90,
  borderEnabled: true,
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
  return {
    cellWidthCm: Math.min(12, Math.max(3, num(raw.cellWidthCm, d.cellWidthCm))),
    cellHeightCm: Math.min(15, Math.max(4, num(raw.cellHeightCm, d.cellHeightCm))),
    innerPaddingMm: Math.min(12, Math.max(0, num(raw.innerPaddingMm, d.innerPaddingMm))),
    safeInsetTopMm: Math.min(20, Math.max(0, num(raw.safeInsetTopMm, d.safeInsetTopMm))),
    safeInsetBottomMm: Math.min(25, Math.max(0, num(raw.safeInsetBottomMm, d.safeInsetBottomMm))),
    safeInsetLeftMm: Math.min(15, Math.max(0, num(raw.safeInsetLeftMm, d.safeInsetLeftMm))),
    safeInsetRightMm: Math.min(15, Math.max(0, num(raw.safeInsetRightMm, d.safeInsetRightMm))),
    gapMm: Math.min(15, Math.max(0, num(raw.gapMm, d.gapMm))),
    marginMm: Math.min(15, Math.max(0, num(raw.marginMm, d.marginMm))),
    dpi: Math.round(Math.min(600, Math.max(72, num(raw.dpi, d.dpi)))),
    rotateDegrees: rot === 90 ? 90 : -90,
    borderEnabled: raw.borderEnabled === false || raw.borderEnabled === 'false' ? false : true,
  };
}

function resolveLayoutPx(opts, dpi) {
  return {
    cellW: cmToPx(opts.cellWidthCm, dpi),
    cellH: cmToPx(opts.cellHeightCm, dpi),
    gap: mmToPx(opts.gapMm, dpi),
    margin: mmToPx(opts.marginMm, dpi),
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

async function fitPhoto(inputBuf, safeW, safeH, rotateDeg) {
  const oriented = await sharp(inputBuf).rotate().toBuffer();
  const rot = Number(rotateDeg) === 90 ? 90 : -90;
  const buf = await sharp(oriented)
    .rotate(rot, { background: { r: 255, g: 255, b: 255 } })
    .resize(safeW, safeH, { fit: 'inside', withoutEnlargement: false })
    .jpeg({ quality: 94, mozjpeg: true })
    .toBuffer();
  const after = await sharp(buf).metadata();
  return {
    buf,
    width: after.width || safeW,
    height: after.height || safeH,
  };
}

async function buildCell(inputBuf, layout, rotate, borderEnabled, dpi) {
  const { cellW, cellH, innerPad, safeTop, safeBottom, safeLeft, safeRight } = layout;
  const frameW = Math.max(8, cellW - innerPad * 2);
  const frameH = Math.max(8, cellH - innerPad * 2);
  const safeW = Math.max(8, frameW - safeLeft - safeRight);
  const safeH = Math.max(8, frameH - safeTop - safeBottom);
  const photo = await fitPhoto(inputBuf, safeW, safeH, rotate);
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
  const { cellW, cellH, gap, margin } = layout;
  const sheetW = margin * 2 + cellW * 2 + gap;
  const sheetH = margin * 2 + cellH;
  const photoCell = await buildCell(inputBuf, layout, opts.rotateDegrees, opts.borderEnabled, dpi);
  const png = await sharp({
    create: {
      width: sheetW,
      height: sheetH,
      channels: 4,
      background: { r: 255, g: 255, b: 255, alpha: 1 },
    },
  })
    .composite([
      { input: photoCell, left: margin, top: margin },
      { input: photoCell, left: margin + cellW + gap, top: margin },
    ])
    .png()
    .toBuffer();
  return { png, width: sheetW, height: sheetH, opts };
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
