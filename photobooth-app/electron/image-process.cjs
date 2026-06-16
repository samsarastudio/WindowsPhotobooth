'use strict';

const fs = require('fs');
const path = require('path');

const PHOTO_WIDTH = 4;
const PHOTO_HEIGHT = 5;
const PHOTO_ASPECT = PHOTO_WIDTH / PHOTO_HEIGHT;

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
        .jpeg({ quality: 95, mozjpeg: true })
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
  orientationRotateDegrees,
  applyOrientationRotate,
  cropRegionFor45Top,
  cropPhotoTo45Top,
  cropBufferTo45Top,
  photoAreaForFrame,
  composePhotoWithFrame,
  createFramePickerThumbnail,
};
