import sharp from 'sharp';

/** Guest gallery, live wall mosaic, and 6×4 / SELPHY postcard. */
export const GALLERY_FRAME_ASPECT = 1.5;
export const GALLERY_FRAME_ASPECT_TOLERANCE = 0.04;

export function describeFrameAspect(width, height) {
  const w = Number(width) || 0;
  const h = Number(height) || 0;
  if (w < 1 || h < 1) {
    return { width: w || null, height: h || null, aspectRatio: null, fitsGallery: false };
  }
  const aspectRatio = Math.round((w / h) * 10000) / 10000;
  const fitsGallery =
    Math.abs(aspectRatio - GALLERY_FRAME_ASPECT) / GALLERY_FRAME_ASPECT <= GALLERY_FRAME_ASPECT_TOLERANCE;
  return { width: w, height: h, aspectRatio, fitsGallery };
}

export async function readFrameAspect(filePath) {
  try {
    const m = await sharp(filePath).metadata();
    return describeFrameAspect(m.width, m.height);
  } catch {
    return { width: null, height: null, aspectRatio: null, fitsGallery: false };
  }
}

export async function readFrameAspectFromBuffer(buf) {
  try {
    const m = await sharp(buf).metadata();
    return describeFrameAspect(m.width, m.height);
  } catch {
    return { width: null, height: null, aspectRatio: null, fitsGallery: false };
  }
}
