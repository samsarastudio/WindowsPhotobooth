'use strict';

const fs = require('fs');
const path = require('path');

const PHOTO_WIDTH = 4;
const PHOTO_HEIGHT = 5;
const PHOTO_ASPECT = PHOTO_WIDTH / PHOTO_HEIGHT;

/** Gallery / frame layout — cap upload dimensions (no upscale). */
const UPLOAD_MAX_WIDTH = 1080;
const UPLOAD_MAX_HEIGHT = 1350;
/** Raw file size budget before base64 inflation (~33% overhead in JSON). */
const UPLOAD_MAX_BYTES = Math.floor(2.5 * 1024 * 1024);
const UPLOAD_JPEG_QUALITY = 90;
const UPLOAD_JPEG_QUALITY_MIN = 78;

/** Crop region for object-cover + object-top alignment at 4:5. */
function cropRegionFor45Top(width, height) {
  const sourceAspect = width / height;
  if (Math.abs(sourceAspect - PHOTO_ASPECT) < 0.001) {
    return { left: 0, top: 0, width, height };
  }
  if (sourceAspect > PHOTO_ASPECT) {
    const cropW = Math.round(height * PHOTO_ASPECT);
    const left = Math.round((width - cropW) / 2);
    return { left, top: 0, width: cropW, height };
  }
  const cropH = Math.round(width / PHOTO_ASPECT);
  return { left: 0, top: 0, width, height: cropH };
}

/** Degrees to rotate before crop — portrait booth mounts need 90° CW. */
function orientationRotateDegrees(orientation) {
  return orientation === 'landscape' ? 0 : 90;
}

async function applyOrientationRotate(sharpMod, inputBuf, orientation) {
  const deg = orientationRotateDegrees(orientation);
  if (!deg) return inputBuf;
  return sharpMod(inputBuf).rotate(deg).toBuffer();
}

/**
 * Center-crop (width) or top-crop (height) to 4:5 and overwrite the file.
 * Supports JPEG and PNG inputs; JPEG output for .jpg/.jpeg, PNG for .png.
 */
async function cropPhotoTo45Top(sharpMod, filePath, { overwrite = true, orientation = 'portrait' } = {}) {
  if (!sharpMod || !filePath || !fs.existsSync(filePath)) {
    return { ok: false, error: 'Missing sharp module or file path.' };
  }
  const abs = path.resolve(filePath);
  let inputBuf = fs.readFileSync(abs);
  inputBuf = await applyOrientationRotate(sharpMod, inputBuf, orientation);
  const meta = await sharpMod(inputBuf).metadata();
  const width = meta.width;
  const height = meta.height;
  if (!width || !height) {
    return { ok: false, error: 'Could not read image dimensions.' };
  }

  const region = cropRegionFor45Top(width, height);
  const ext = path.extname(abs).toLowerCase();
  const isPng = ext === '.png';
  let pipeline = sharpMod(inputBuf).extract(region);
  if (isPng) {
    pipeline = pipeline.png({ compressionLevel: 9 });
  } else {
    pipeline = pipeline.jpeg({ quality: 92, mozjpeg: true });
  }

  const outPath = overwrite
    ? abs
    : path.join(
        path.dirname(abs),
        `${path.basename(abs, ext)}_45${isPng ? '.png' : '.jpg'}`,
      );

  const outBuf = await pipeline.toBuffer();
  if (overwrite) {
    fs.writeFileSync(abs, outBuf);
    return { ok: true, path: abs, width: region.width, height: region.height };
  }

  fs.writeFileSync(outPath, outBuf);
  return { ok: true, path: outPath, width: region.width, height: region.height };
}

/** Crop a buffer to 4:5 top-aligned; returns JPEG buffer by default. */
async function cropBufferTo45Top(sharpMod, inputBuf, { format = 'jpeg', orientation = 'portrait' } = {}) {
  let buf = await applyOrientationRotate(sharpMod, inputBuf, orientation);
  const meta = await sharpMod(buf).metadata();
  const region = cropRegionFor45Top(meta.width, meta.height);
  let pipeline = sharpMod(buf).extract(region);
  if (format === 'png') {
    return pipeline.png({ compressionLevel: 9 }).toBuffer();
  }
  return pipeline.jpeg({ quality: 92, mozjpeg: true }).toBuffer();
}

/** Photo window inside frame overlay (matches kiaexperience.info 1080×1350 layout). */
function photoAreaForFrame(frameWidth, frameHeight) {
  const sx = frameWidth / 1080;
  const sy = frameHeight / 1350;
  return {
    left: Math.round(54 * sx),
    top: Math.round(54 * sy),
    width: Math.round(972 * sx),
    height: Math.round(1242 * sy),
  };
}

/** Composite photo under a transparent PNG frame. */
async function composePhotoWithFrame(sharpMod, photoPath, framePath, outputPath, options = {}) {
  const format = options.format === 'jpeg' ? 'jpeg' : 'png';
  if (!sharpMod || !photoPath || !framePath) {
    return { ok: false, error: 'Missing sharp module or paths.' };
  }
  const photoAbs = path.resolve(photoPath);
  const frameAbs = path.resolve(framePath);
  if (!fs.existsSync(photoAbs) || !fs.existsSync(frameAbs)) {
    return { ok: false, error: 'Photo or frame file not found.' };
  }

  try {
    const frameMeta = await sharpMod(frameAbs).metadata();
    const width = frameMeta.width;
    const height = frameMeta.height;
    if (!width || !height) {
      return { ok: false, error: 'Could not read frame dimensions.' };
    }

    const area = photoAreaForFrame(width, height);
    const photoBuf = await sharpMod(photoAbs)
      .resize(area.width, area.height, { fit: 'cover', position: 'top' })
      .toBuffer();

    let pipeline = sharpMod({
      create: { width, height, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
    }).composite([
      { input: photoBuf, top: area.top, left: area.left },
      { input: frameAbs, top: 0, left: 0 },
    ]);

    let outBuf;
    if (format === 'jpeg') {
      outBuf = await pipeline
        .flatten({ background: { r: 255, g: 255, b: 255 } })
        .jpeg({ quality: 90, mozjpeg: true, chromaSubsampling: '4:4:4' })
        .toBuffer();
    } else {
      outBuf = await pipeline.png({ compressionLevel: 9, adaptiveFiltering: true }).toBuffer();
    }

    const outAbs = path.resolve(outputPath);
    fs.mkdirSync(path.dirname(outAbs), { recursive: true });
    fs.writeFileSync(outAbs, outBuf);
    return { ok: true, path: outAbs, width, height, format };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}

/**
 * Resize (if needed) and re-encode for API upload — keeps visual quality while staying under POST limits.
 * PNG inputs larger than maxBytes fall back to high-quality JPEG (white matte).
 */
async function optimizeImageForUpload(sharpMod, inputPath, outputPath, options = {}) {
  if (!sharpMod || !inputPath) {
    return { ok: false, error: 'Missing sharp module or input path.' };
  }
  const absIn = path.resolve(inputPath);
  if (!fs.existsSync(absIn)) {
    return { ok: false, error: 'Input image not found.' };
  }

  const format = options.format === 'jpeg' ? 'jpeg' : 'png';
  const maxWidth = Number(options.maxWidth) > 0 ? Number(options.maxWidth) : UPLOAD_MAX_WIDTH;
  const maxHeight = Number(options.maxHeight) > 0 ? Number(options.maxHeight) : UPLOAD_MAX_HEIGHT;
  const maxBytes = Number(options.maxBytes) > 0 ? Number(options.maxBytes) : UPLOAD_MAX_BYTES;
  let jpegQuality =
    Number(options.jpegQuality) > 0 ? Math.round(Number(options.jpegQuality)) : UPLOAD_JPEG_QUALITY;

  const meta = await sharpMod(absIn).metadata();
  const needsResize =
    (meta.width ?? 0) > maxWidth || (meta.height ?? 0) > maxHeight;
  const resizeOpts = needsResize
    ? { width: maxWidth, height: maxHeight, fit: 'inside', withoutEnlargement: true }
    : null;

  async function render(fmt, quality) {
    let pipeline = sharpMod(absIn);
    if (resizeOpts) pipeline = pipeline.resize(resizeOpts);
    if (fmt === 'jpeg') {
      return pipeline
        .flatten({ background: { r: 255, g: 255, b: 255 } })
        .jpeg({ quality, mozjpeg: true, chromaSubsampling: '4:4:4' })
        .toBuffer();
    }
    return pipeline.png({ compressionLevel: 9, adaptiveFiltering: true }).toBuffer();
  }

  try {
    let outFormat = format;
    let outBuf = await render(format, jpegQuality);

    if (format === 'jpeg') {
      while (outBuf.length > maxBytes && jpegQuality > UPLOAD_JPEG_QUALITY_MIN) {
        jpegQuality -= 4;
        outBuf = await render('jpeg', jpegQuality);
      }
    } else if (outBuf.length > maxBytes) {
      outFormat = 'jpeg';
      jpegQuality = UPLOAD_JPEG_QUALITY;
      outBuf = await render('jpeg', jpegQuality);
      while (outBuf.length > maxBytes && jpegQuality > UPLOAD_JPEG_QUALITY_MIN) {
        jpegQuality -= 4;
        outBuf = await render('jpeg', jpegQuality);
      }
    }

    let absOut = path.resolve(outputPath);
    if (outFormat === 'jpeg' && /\.png$/i.test(absOut)) {
      absOut = absOut.replace(/\.png$/i, '.jpg');
    }

    fs.mkdirSync(path.dirname(absOut), { recursive: true });
    fs.writeFileSync(absOut, outBuf);
    return {
      ok: true,
      path: absOut,
      bytes: outBuf.length,
      format: outFormat,
      jpegQuality: outFormat === 'jpeg' ? jpegQuality : undefined,
      resized: needsResize,
    };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}

/** Square picker icon from a portrait frame PNG (contain, transparent background). */
async function createFramePickerThumbnail(sharpMod, framePath, outputPath, size = 128) {
  if (!sharpMod || !framePath) {
    return { ok: false, error: 'Missing sharp module or frame path.' };
  }
  const frameAbs = path.resolve(framePath);
  if (!fs.existsSync(frameAbs)) {
    return { ok: false, error: 'Frame file not found.' };
  }
  try {
    const outAbs = path.resolve(outputPath);
    fs.mkdirSync(path.dirname(outAbs), { recursive: true });
    await sharpMod(frameAbs)
      .resize(size, size, {
        fit: 'contain',
        background: { r: 0, g: 0, b: 0, alpha: 0 },
      })
      .png({ compressionLevel: 9 })
      .toFile(outAbs);
    return { ok: true, path: outAbs };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}

module.exports = {
  PHOTO_WIDTH,
  PHOTO_HEIGHT,
  PHOTO_ASPECT,
  UPLOAD_MAX_WIDTH,
  UPLOAD_MAX_HEIGHT,
  UPLOAD_MAX_BYTES,
  orientationRotateDegrees,
  applyOrientationRotate,
  cropRegionFor45Top,
  cropPhotoTo45Top,
  cropBufferTo45Top,
  photoAreaForFrame,
  composePhotoWithFrame,
  optimizeImageForUpload,
  createFramePickerThumbnail,
};
