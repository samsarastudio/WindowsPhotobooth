/**
 * Halloween AI pipelines: Scene Addition (face-locked scenery) + AI Portrait (head-swap).
 * Adapted from Zyn Photobooth-AICore head-swap helpers.
 */
'use strict';

const fs = require('fs');
const path = require('path');

const DEFAULT_HEAD_FACE = {
  // Match Zyn Photobooth-AICore — small head box relative to full plate.
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

/** Mild expand so hair is covered without blowing up head size vs the costume body (Zyn). */
function expandFaceForHair(face) {
  const f = clampFace(face);
  const widthPercent = Math.min(28, Math.max(14, f.widthPercent * 1.12));
  const heightPercent = Math.min(30, Math.max(16, f.heightPercent * 1.28));
  const xPercent = Math.max(0, f.xPercent - (widthPercent - f.widthPercent) / 2);
  const yPercent = Math.max(0, f.yPercent - (heightPercent - f.heightPercent) * 0.55);
  return clampFace({ xPercent, yPercent, widthPercent, heightPercent });
}

function readFaceJson(filePath) {
  try {
    if (!fs.existsSync(filePath)) return null;
    const j = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    const f = j?.face || j;
    if (![f?.xPercent, f?.yPercent, f?.widthPercent, f?.heightPercent].every((v) => Number.isFinite(Number(v)))) {
      return null;
    }
    return clampFace(f);
  } catch (_) {
    return null;
  }
}

function createPipelineHelpers(ctx) {
  const {
    getPortableRoot,
    sanitizeModeId,
    IMAGE_EXTENSIONS,
    pngBufferUnderLimit,
    LANDSCAPE_SIZES,
  } = ctx;

  function getCompositionsDir(modeId) {
    return path.join(getPortableRoot(), 'config', 'compositions', sanitizeModeId(modeId));
  }

  function getSharedCompositionsDir() {
    return path.join(getPortableRoot(), 'config', 'compositions', '_shared');
  }

  function listCompositionImageNames(dir) {
    const names = [];
    try {
      for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
        if (!ent.isFile()) continue;
        if (!IMAGE_EXTENSIONS.has(path.extname(ent.name).toLowerCase())) continue;
        names.push(ent.name);
      }
    } catch (_) {}
    names.sort((a, b) => a.localeCompare(b));
    return names;
  }

  function pickCompositionFile(dir, names) {
    const pick =
      names.find((n) => /^composition\.jpe?g$/i.test(n)) ||
      names.find((n) => /^composition\.png$/i.test(n)) ||
      names.find((n) => /^composition\./i.test(n)) ||
      names[0];
    return pick ? path.join(dir, pick) : null;
  }

  function resolveComposition(modeId) {
    const id = sanitizeModeId(modeId);
    const canDir = getCompositionsDir(id);
    const canNames = listCompositionImageNames(canDir);
    if (canNames.length) {
      const imagePath = pickCompositionFile(canDir, canNames);
      return {
        canId: id,
        source: 'character',
        dir: canDir,
        imagePath,
        filename: path.basename(imagePath || ''),
      };
    }
    const sharedDir = getSharedCompositionsDir();
    const sharedNames = listCompositionImageNames(sharedDir);
    if (sharedNames.length) {
      const imagePath = pickCompositionFile(sharedDir, sharedNames);
      return {
        canId: id,
        source: 'shared',
        dir: sharedDir,
        imagePath,
        filename: path.basename(imagePath || ''),
      };
    }
    return null;
  }

  function loadCompositionFace(modeId, overrideFace) {
    const id = sanitizeModeId(modeId);
    const canFace = readFaceJson(path.join(getCompositionsDir(id), 'composition.json'));
    if (canFace) return expandFaceForHair(canFace);
    if (overrideFace && typeof overrideFace === 'object') {
      const clamped = clampFace(overrideFace);
      if (Number.isFinite(clamped.xPercent)) return expandFaceForHair(clamped);
    }
    const resolved = resolveComposition(id);
    if (resolved?.source === 'shared') {
      return expandFaceForHair(
        readFaceJson(path.join(resolved.dir, 'composition.json')) || { ...DEFAULT_HEAD_FACE },
      );
    }
    return expandFaceForHair({ ...DEFAULT_HEAD_FACE });
  }

  async function sceneIsPortrait(sharpMod, imagePath) {
    try {
      const meta = await sharpMod(imagePath).metadata();
      return (meta.height || 0) > (meta.width || 0);
    } catch (_) {
      return false;
    }
  }

  async function prepareGuestHeadPng(sharpMod, absImage, outW, outH) {
    const meta = await sharpMod(absImage).metadata();
    const srcW = meta.width || outW;
    const srcH = meta.height || outH;
    const cropW = Math.max(8, Math.round(srcW * 0.56));
    const cropH = Math.max(8, Math.round(srcH * 0.62));
    const left = Math.max(0, Math.round((srcW - cropW) / 2));
    const top = Math.max(0, Math.round(srcH * 0.01));
    const width = Math.min(cropW, srcW - left);
    const height = Math.min(cropH, srcH - top);
    return sharpMod(absImage)
      .extract({ left, top, width, height })
      .resize(outW, outH, { fit: 'cover', position: 'attention' })
      .ensureAlpha()
      .png({ compressionLevel: 9, effort: 8 })
      .toBuffer();
  }

  async function ovalMaskPng(sharpMod, w, h, soft = false) {
    const feather = soft
      ? `<radialGradient id="g" cx="50%" cy="44%" r="68%">
          <stop offset="0%" stop-color="#fff" stop-opacity="1"/>
          <stop offset="48%" stop-color="#fff" stop-opacity="1"/>
          <stop offset="70%" stop-color="#fff" stop-opacity="0.55"/>
          <stop offset="88%" stop-color="#fff" stop-opacity="0.12"/>
          <stop offset="100%" stop-color="#fff" stop-opacity="0"/>
        </radialGradient>`
      : `<radialGradient id="g" cx="50%" cy="44%" r="64%">
          <stop offset="0%" stop-color="#fff" stop-opacity="1"/>
          <stop offset="52%" stop-color="#fff" stop-opacity="1"/>
          <stop offset="78%" stop-color="#fff" stop-opacity="0.4"/>
          <stop offset="100%" stop-color="#fff" stop-opacity="0"/>
        </radialGradient>`;
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">
      <defs>${feather}</defs>
      <rect width="100%" height="100%" fill="#000" fill-opacity="0"/>
      <ellipse cx="${w / 2}" cy="${h * 0.48}" rx="${w * 0.49}" ry="${h * 0.5}" fill="url(#g)"/>
    </svg>`;
    return sharpMod(Buffer.from(svg)).resize(w, h).png().toBuffer();
  }

  async function eraseOriginalHead(sharpMod, bgBuf, w, h, face) {
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
      const { data } = await sharpMod(bgBuf)
        .extract({ left: sampleX, top: sampleY, width: 1, height: 1 })
        .raw()
        .toBuffer({ resolveWithObject: true });
      if (data?.length >= 3) fill = { r: data[0], g: data[1], b: data[2], alpha: 1 };
    } catch (_) {}
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
    const cover = await sharpMod(Buffer.from(coverSvg)).png().toBuffer();
    return sharpMod(bgBuf)
      .composite([{ input: cover, left, top }])
      .ensureAlpha()
      .png()
      .toBuffer();
  }

  function letterboxPlateLayout(canvasW, canvasH, plateW, plateH) {
    const pw = Math.max(1, plateW);
    const ph = Math.max(1, plateH);
    const plateAr = pw / ph;
    const canvasAr = canvasW / canvasH;
    let contentW;
    let contentH;
    let left;
    let top;
    if (plateAr > canvasAr) {
      contentW = canvasW;
      contentH = Math.max(1, Math.round(canvasW / plateAr));
      left = 0;
      top = Math.round((canvasH - contentH) / 2);
    } else {
      contentH = canvasH;
      contentW = Math.max(1, Math.round(canvasH * plateAr));
      left = Math.round((canvasW - contentW) / 2);
      top = 0;
    }
    return { contentW, contentH, left, top };
  }

  function remapFaceToLetterbox(faceIn, canvasW, canvasH, layout) {
    const { contentW, contentH, left, top } = layout;
    return clampFace({
      xPercent: (left / canvasW) * 100 + faceIn.xPercent * (contentW / canvasW),
      yPercent: (top / canvasH) * 100 + faceIn.yPercent * (contentH / canvasH),
      widthPercent: faceIn.widthPercent * (contentW / canvasW),
      heightPercent: faceIn.heightPercent * (contentH / canvasH),
    });
  }

  async function letterboxPlateOntoCanvas(sharpMod, backgroundPath, w, h) {
    const meta = await sharpMod(backgroundPath).metadata();
    const layout = letterboxPlateLayout(w, h, meta.width || 1024, meta.height || 1536);
    const plateBuf = await sharpMod(backgroundPath)
      .resize(layout.contentW, layout.contentH, { fit: 'fill' })
      .ensureAlpha()
      .toBuffer();
    let bgBuf = await sharpMod({
      create: {
        width: w,
        height: h,
        channels: 4,
        background: { r: 12, g: 8, b: 14, alpha: 1 },
      },
    })
      .png()
      .toBuffer();
    bgBuf = await sharpMod(bgBuf)
      .composite([{ input: plateBuf, left: layout.left, top: layout.top }])
      .ensureAlpha()
      .toBuffer();
    return { bgBuf, layout };
  }

  async function buildHeadEraseScene(sharpMod, backgroundPath, faceRegion) {
    // Portrait character plates stay portrait (4×6). Landscape plates stay landscape (6×4).
    const face = clampFace(faceRegion || DEFAULT_HEAD_FACE);
    const portrait = await sceneIsPortrait(sharpMod, backgroundPath);
    const sizes = portrait ? PORTRAIT_SIZES : LANDSCAPE_SIZES;
    const buf = await pngBufferUnderLimit(
      sharpMod,
      async (w, h) => {
        let bgBuf = await sharpMod(backgroundPath)
          .resize(w, h, { fit: 'cover', position: 'centre' })
          .ensureAlpha()
          .toBuffer();
        bgBuf = await eraseOriginalHead(sharpMod, bgBuf, w, h, face);
        return sharpMod(bgBuf)
          .ensureAlpha()
          .png({ compressionLevel: 9, effort: 10 })
          .toBuffer();
      },
      sizes,
    );
    return { buf, face };
  }

  async function buildHeadEditMaskPng(sharpMod, w, h, faceRegion) {
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
    const { data, info } = await sharpMod(Buffer.from(svg))
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
    return sharpMod(rgba, { raw: { width: info.width, height: info.height, channels: 4 } })
      .png()
      .toBuffer();
  }

  /**
   * Scene Addition mask: protect the placed guest region (opaque) so the model
   * only blends scenery around people — no regenerated legs/bodies.
   * Convention matches head mask: alpha 0 = editable, alpha 255 = keep.
   */
  async function buildScenePreserveMask(sharpMod, w, h) {
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
    const { data, info } = await sharpMod(Buffer.from(svg))
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
      // White (outer) → editable (alpha 0); dark (guest zone) → keep (alpha 255)
      rgba[p + 3] = 255 - data[i];
    }
    return sharpMod(rgba, { raw: { width: info.width, height: info.height, channels: 4 } })
      .png()
      .toBuffer();
  }

  async function blendHeadOntoOriginalScene(sharpMod, scenePath, aiBuf, faceRegion) {
    const aiMeta = await sharpMod(aiBuf).metadata();
    const w = aiMeta.width || 1536;
    const h = aiMeta.height || 1024;
    let sceneBuf = await sharpMod(scenePath)
      .resize(w, h, { fit: 'cover', position: 'centre' })
      .ensureAlpha()
      .toBuffer();
    const face = clampFace(faceRegion || DEFAULT_HEAD_FACE);
    sceneBuf = await eraseOriginalHead(sharpMod, sceneBuf, w, h, face);
    const boxW = Math.max(24, Math.round((Number(face.widthPercent) / 100) * w));
    const boxH = Math.max(24, Math.round((Number(face.heightPercent) / 100) * h));
    const extractW = Math.max(48, Math.round(boxW * 1.0));
    const extractH = Math.max(48, Math.round(boxH * 0.98));
    const pasteW = Math.max(40, Math.round(boxW * 0.82));
    const pasteH = Math.max(40, Math.round(boxH * 0.86));
    const cx = (Number(face.xPercent) / 100) * w + boxW / 2;
    const cy = (Number(face.yPercent) / 100) * h + boxH / 2;
    const extractLeft = Math.max(0, Math.min(w - extractW, Math.round(cx - extractW / 2)));
    const extractTop = Math.max(
      0,
      Math.min(h - extractH, Math.round(cy - extractH / 2 - boxH * 0.04)),
    );
    const mask = await ovalMaskPng(sharpMod, pasteW, pasteH, true);
    const headCrop = await sharpMod(aiBuf)
      .extract({ left: extractLeft, top: extractTop, width: extractW, height: extractH })
      .resize(pasteW, pasteH, { fit: 'cover', position: 'north' })
      .ensureAlpha()
      .toBuffer();
    const headBuf = await sharpMod(headCrop)
      .composite([{ input: mask, blend: 'dest-in' }])
      .png()
      .toBuffer();
    const pasteLeft = Math.max(0, Math.round(cx - pasteW / 2));
    const pasteTop = Math.max(0, Math.round(cy - pasteH / 2 + pasteH * 0.1));
    return sharpMod(sceneBuf)
      .composite([{ input: headBuf, left: pasteLeft, top: pasteTop }])
      .png({ compressionLevel: 9, effort: 8 })
      .toBuffer();
  }

  /**
   * Soft-paste the pre-AI composite guest region back onto the AI result
   * so faces/bodies stay identical for Scene Addition.
   */
  async function lockGuestSubjectsOntoAi(sharpMod, compositeBuf, aiBuf) {
    const aiMeta = await sharpMod(aiBuf).metadata();
    const w = aiMeta.width || 1536;
    const h = aiMeta.height || 1024;
    const guest = await sharpMod(compositeBuf)
      .resize(w, h, { fit: 'fill' })
      .ensureAlpha()
      .toBuffer();
    // Center-bottom soft window covering typical guest placement (~52%×72% south-anchored).
    const maskW = Math.round(w * 0.56);
    const maskH = Math.round(h * 0.76);
    const left = Math.round((w - maskW) / 2);
    const top = Math.round(h - maskH - h * 0.04);
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">
      <defs>
        <radialGradient id="g" cx="50%" cy="42%" r="68%">
          <stop offset="0%" stop-color="#fff" stop-opacity="1"/>
          <stop offset="55%" stop-color="#fff" stop-opacity="1"/>
          <stop offset="78%" stop-color="#fff" stop-opacity="0.45"/>
          <stop offset="100%" stop-color="#fff" stop-opacity="0"/>
        </radialGradient>
      </defs>
      <rect width="100%" height="100%" fill="black"/>
      <ellipse cx="${left + maskW / 2}" cy="${top + maskH * 0.42}" rx="${maskW * 0.48}" ry="${maskH * 0.48}" fill="url(#g)"/>
    </svg>`;
    const { data, info } = await sharpMod(Buffer.from(svg))
      .resize(w, h)
      .greyscale()
      .raw()
      .toBuffer({ resolveWithObject: true });
    const rgba = Buffer.alloc(info.width * info.height * 4);
    for (let i = 0; i < data.length; i++) {
      const p = i * 4;
      rgba[p] = 255;
      rgba[p + 1] = 255;
      rgba[p + 2] = 255;
      rgba[p + 3] = data[i];
    }
    const softMask = await sharpMod(rgba, {
      raw: { width: info.width, height: info.height, channels: 4 },
    })
      .png()
      .toBuffer();
    const guestMasked = await sharpMod(guest)
      .composite([{ input: softMask, blend: 'dest-in' }])
      .png()
      .toBuffer();
    return sharpMod(aiBuf)
      .composite([{ input: guestMasked, left: 0, top: 0 }])
      .png({ compressionLevel: 9, effort: 8 })
      .toBuffer();
  }

  return {
    DEFAULT_HEAD_FACE,
    resolveComposition,
    loadCompositionFace,
    prepareGuestHeadPng,
    buildHeadEraseScene,
    buildHeadEditMaskPng,
    buildScenePreserveMask,
    blendHeadOntoOriginalScene,
    lockGuestSubjectsOntoAi,
    sceneIsPortrait,
    PORTRAIT_SIZES,
  };
}

module.exports = {
  createPipelineHelpers,
  DEFAULT_HEAD_FACE,
  clampFace,
  expandFaceForHair,
};
