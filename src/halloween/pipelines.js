import fs from 'node:fs';
import sharp from 'sharp';

const MAX_IMAGE_BYTES = 4 * 1024 * 1024;

const DEFAULT_HEAD_FACE = {
  xPercent: 40,
  yPercent: 1,
  widthPercent: 17,
  heightPercent: 19,
};

const PORTRAIT_SIZES = [
  [1024, 1536],
  [768, 1152],
  [682, 1024],
  [512, 768],
];

const LANDSCAPE_SIZES = [
  [1536, 1024],
  [1440, 960],
  [1296, 864],
  [1152, 768],
  [1024, 682],
  [960, 640],
  [768, 512],
];

function clampFace(raw) {
  const o = raw && typeof raw === 'object' ? raw : {};
  const n = (v, fallback) => {
    const x = Number(v);
    return Number.isFinite(x) ? x : fallback;
  };
  const xPercent = Math.min(96, Math.max(0, n(o.xPercent, DEFAULT_HEAD_FACE.xPercent)));
  const yPercent = Math.min(96, Math.max(0, n(o.yPercent, DEFAULT_HEAD_FACE.yPercent)));
  const widthPercent = Math.min(80, Math.max(4, n(o.widthPercent, DEFAULT_HEAD_FACE.widthPercent)));
  const heightPercent = Math.min(80, Math.max(4, n(o.heightPercent, DEFAULT_HEAD_FACE.heightPercent)));
  return {
    xPercent,
    yPercent,
    widthPercent: Math.min(widthPercent, 100 - xPercent),
    heightPercent: Math.min(heightPercent, 100 - yPercent),
  };
}

export function loadFaceJson(filePath) {
  try {
    if (!fs.existsSync(filePath)) return clampFace(DEFAULT_HEAD_FACE);
    const j = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    const f = j?.face || j;
    return clampFace(f);
  } catch {
    return clampFace(DEFAULT_HEAD_FACE);
  }
}

async function pngBufferUnderLimit(buildAtSize, sizes) {
  for (const [w, h] of sizes) {
    const candidate = await buildAtSize(w, h);
    if (candidate && candidate.length <= MAX_IMAGE_BYTES) return candidate;
  }
  return null;
}

async function eraseOriginalHead(bgBuf, w, h, face) {
  const boxW = Math.max(24, Math.round((Number(face.widthPercent) / 100) * w));
  const boxH = Math.max(24, Math.round((Number(face.heightPercent) / 100) * h));
  const eraseW = Math.round(boxW * 0.92);
  const eraseH = Math.round(boxH * 0.95);
  const cx = (Number(face.xPercent) / 100) * w + boxW / 2;
  const cy = (Number(face.yPercent) / 100) * h + boxH / 2;
  const left = Math.max(0, Math.min(w - eraseW, Math.round(cx - eraseW / 2)));
  const top = Math.max(0, Math.min(h - eraseH, Math.round(cy - eraseH / 2)));
  const sampleY = Math.min(h - 2, Math.round(cy + boxH * 0.55));
  const sampleX = Math.min(w - 2, Math.max(0, Math.round(cx)));
  let fill = { r: 40, g: 30, b: 35, alpha: 1 };
  try {
    const { data } = await sharp(bgBuf)
      .extract({ left: sampleX, top: sampleY, width: 1, height: 1 })
      .raw()
      .toBuffer({ resolveWithObject: true });
    if (data?.length >= 3) fill = { r: data[0], g: data[1], b: data[2], alpha: 1 };
  } catch {
    /* keep default */
  }
  const coverSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="${eraseW}" height="${eraseH}">
    <defs>
      <radialGradient id="e" cx="50%" cy="48%" r="62%">
        <stop offset="0%" stop-color="rgb(${fill.r},${fill.g},${fill.b})" stop-opacity="1"/>
        <stop offset="70%" stop-color="rgb(${fill.r},${fill.g},${fill.b})" stop-opacity="0.85"/>
        <stop offset="100%" stop-color="rgb(${fill.r},${fill.g},${fill.b})" stop-opacity="0"/>
      </radialGradient>
    </defs>
    <ellipse cx="${eraseW / 2}" cy="${eraseH * 0.48}" rx="${eraseW * 0.48}" ry="${eraseH * 0.49}" fill="url(#e)"/>
  </svg>`;
  const cover = await sharp(Buffer.from(coverSvg)).png().toBuffer();
  return sharp(bgBuf)
    .composite([{ input: cover, left, top }])
    .ensureAlpha()
    .png()
    .toBuffer();
}

export async function buildHeadEraseScene(backgroundPath, faceRegion) {
  const face = clampFace(faceRegion || DEFAULT_HEAD_FACE);
  const buf = await pngBufferUnderLimit(async (w, h) => {
    let bgBuf = await sharp(backgroundPath)
      .resize(w, h, { fit: 'cover', position: 'centre' })
      .ensureAlpha()
      .toBuffer();
    bgBuf = await eraseOriginalHead(bgBuf, w, h, face);
    return sharp(bgBuf).ensureAlpha().png({ compressionLevel: 9, effort: 10 }).toBuffer();
  }, PORTRAIT_SIZES);
  return { buf, face };
}

export async function prepareGuestHeadPng(absImage, outW = 1024, outH = 1024) {
  return sharp(absImage)
    .resize(outW, outH, { fit: 'cover', position: 'centre' })
    .ensureAlpha()
    .png({ compressionLevel: 9, effort: 8 })
    .toBuffer();
}

export async function buildHeadEditMaskPng(w, h, faceRegion) {
  const face = faceRegion || DEFAULT_HEAD_FACE;
  const boxW = Math.max(24, Math.round((Number(face.widthPercent) / 100) * w));
  const boxH = Math.max(24, Math.round((Number(face.heightPercent) / 100) * h));
  const rx = Math.round(boxW * 0.52);
  const ry = Math.round(boxH * 0.55);
  const cx = (Number(face.xPercent) / 100) * w + boxW / 2;
  const cy = (Number(face.yPercent) / 100) * h + boxH / 2;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">
    <rect width="100%" height="100%" fill="black"/>
    <ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="white"/>
  </svg>`;
  const { data, info } = await sharp(Buffer.from(svg))
    .resize(w, h)
    .greyscale()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const rgba = Buffer.alloc(info.width * info.height * 4);
  for (let i = 0; i < data.length; i++) {
    const p = i * 4;
    rgba[p] = 0;
    rgba[p + 1] = 0;
    rgba[p + 2] = 0;
    rgba[p + 3] = data[i] > 127 ? 0 : 255;
  }
  return sharp(rgba, { raw: { width: info.width, height: info.height, channels: 4 } })
    .png()
    .toBuffer();
}

async function softFeatherPersonPng(personBuf, w, h) {
  const fx = Math.max(10, Math.round(w * 0.045));
  const fy = Math.max(10, Math.round(h * 0.05));
  const edgeSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">
    <defs>
      <linearGradient id="l" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0%" stop-color="#000"/>
        <stop offset="${((fx / w) * 100).toFixed(2)}%" stop-color="#fff"/>
        <stop offset="${(100 - (fx / w) * 100).toFixed(2)}%" stop-color="#fff"/>
        <stop offset="100%" stop-color="#000"/>
      </linearGradient>
    </defs>
    <rect width="100%" height="100%" fill="#fff"/>
    <rect width="100%" height="100%" fill="url(#l)" opacity="1"/>
  </svg>`;
  const horiz = await sharp(Buffer.from(edgeSvg))
    .resize(w, h)
    .greyscale()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const vertSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">
    <defs>
      <linearGradient id="t" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="#000"/>
        <stop offset="${((fy / h) * 100).toFixed(2)}%" stop-color="#fff"/>
        <stop offset="100%" stop-color="#fff"/>
      </linearGradient>
    </defs>
    <rect width="100%" height="100%" fill="url(#t)"/>
  </svg>`;
  const vert = await sharp(Buffer.from(vertSvg))
    .resize(w, h)
    .greyscale()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const rgba = Buffer.alloc(w * h * 4);
  for (let i = 0; i < w * h; i++) {
    const a = Math.round((horiz.data[i] * vert.data[i]) / 255);
    const p = i * 4;
    rgba[p] = 255;
    rgba[p + 1] = 255;
    rgba[p + 2] = 255;
    rgba[p + 3] = a;
  }
  const softMask = await sharp(rgba, { raw: { width: w, height: h, channels: 4 } })
    .png()
    .toBuffer();
  return sharp(personBuf)
    .ensureAlpha()
    .composite([{ input: softMask, blend: 'dest-in' }])
    .png()
    .toBuffer();
}

export async function buildInpaintComposite(backgroundPath, personPath) {
  return pngBufferUnderLimit(async (w, h) => {
    const personMaxW = Math.round(w * 0.86);
    const personMaxH = Math.round(h * 0.96);
    const bgBuf = await sharp(backgroundPath)
      .resize(w, h, { fit: 'cover', position: 'center' })
      .ensureAlpha()
      .toBuffer();
    let personBuf = await sharp(personPath)
      .resize(personMaxW, personMaxH, {
        fit: 'contain',
        position: 'south',
        background: { r: 0, g: 0, b: 0, alpha: 0 },
      })
      .ensureAlpha()
      .toBuffer();
    const personMeta = await sharp(personBuf).metadata();
    const pw = personMeta.width || personMaxW;
    const ph = personMeta.height || personMaxH;
    personBuf = await softFeatherPersonPng(personBuf, pw, ph);
    const left = Math.round((w - pw) / 2);
    const top = Math.round(h - ph - h * 0.012);
    return sharp(bgBuf)
      .composite([{ input: personBuf, left, top }])
      .ensureAlpha()
      .png({ compressionLevel: 9, effort: 10 })
      .toBuffer();
  }, LANDSCAPE_SIZES);
}

export async function buildScenePreserveMask(w, h) {
  const maskW = Math.round(w * 0.78);
  const maskH = Math.round(h * 0.9);
  const cx = w / 2;
  const cy = h - maskH * 0.48 - h * 0.012;
  const rx = maskW * 0.48;
  const ry = maskH * 0.48;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">
    <defs>
      <radialGradient id="p" cx="50%" cy="48%" r="68%">
        <stop offset="0%" stop-color="#000"/>
        <stop offset="62%" stop-color="#000"/>
        <stop offset="82%" stop-color="#666"/>
        <stop offset="100%" stop-color="#fff"/>
      </radialGradient>
    </defs>
    <rect width="100%" height="100%" fill="white"/>
    <ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="url(#p)"/>
  </svg>`;
  const { data, info } = await sharp(Buffer.from(svg))
    .resize(w, h)
    .greyscale()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const rgba = Buffer.alloc(info.width * info.height * 4);
  for (let i = 0; i < data.length; i++) {
    const p = i * 4;
    rgba[p] = 0;
    rgba[p + 1] = 0;
    rgba[p + 2] = 0;
    // OpenAI edits: alpha 0 = edit, alpha 255 = preserve
    rgba[p + 3] = data[i] < 128 ? 255 : Math.round(((255 - data[i]) / 255) * 255);
  }
  return sharp(rgba, { raw: { width: info.width, height: info.height, channels: 4 } })
    .png()
    .toBuffer();
}

export async function exportFinal(outBuf, pipeline) {
  const outMeta = await sharp(outBuf).metadata();
  const isPortrait = pipeline === 'head-swap' || (outMeta.height || 0) > (outMeta.width || 0);
  const outW = isPortrait ? 1200 : 1800;
  const outH = isPortrait ? 1800 : 1200;
  return sharp(outBuf)
    .resize(outW, outH, { fit: 'cover', position: 'centre' })
    .png({ compressionLevel: 9, effort: 8 })
    .toBuffer();
}
