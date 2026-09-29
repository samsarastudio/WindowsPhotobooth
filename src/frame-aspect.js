import sharp from 'sharp';

/** Guest gallery, live wall mosaic, and 6×4 / SELPHY postcard. */
export const GALLERY_FRAME_ASPECT = 1.5;
/** AI Portrait / 4×6 portrait print. */
export const PORTRAIT_FRAME_ASPECT = 2 / 3;
export const GALLERY_FRAME_ASPECT_TOLERANCE = 0.04;

export function describeFrameAspect(width, height) {
  const w = Number(width) || 0;
  const h = Number(height) || 0;
  if (w < 1 || h < 1) {
    return {
      width: w || null,
      height: h || null,
      aspectRatio: null,
      fitsGallery: false,
      fitsPortrait: false,
      orientation: 'other',
    };
  }
  const aspectRatio = Math.round((w / h) * 10000) / 10000;
  const fitsGallery =
    Math.abs(aspectRatio - GALLERY_FRAME_ASPECT) / GALLERY_FRAME_ASPECT <=
    GALLERY_FRAME_ASPECT_TOLERANCE;
  const fitsPortrait =
    Math.abs(aspectRatio - PORTRAIT_FRAME_ASPECT) / PORTRAIT_FRAME_ASPECT <=
    GALLERY_FRAME_ASPECT_TOLERANCE;
  let orientation = 'other';
  if (fitsGallery) orientation = 'landscape';
  else if (fitsPortrait) orientation = 'portrait';
  else if (aspectRatio > 1.05) orientation = 'landscape';
  else if (aspectRatio < 0.95) orientation = 'portrait';
  return {
    width: w,
    height: h,
    aspectRatio,
    fitsGallery,
    fitsPortrait,
    orientation,
  };
}

export async function readFrameAspect(filePath) {
  try {
    const m = await sharp(filePath).metadata();
    return describeFrameAspect(m.width, m.height);
  } catch {
    return {
      width: null,
      height: null,
      aspectRatio: null,
      fitsGallery: false,
      fitsPortrait: false,
      orientation: 'other',
    };
  }
}

export async function readFrameAspectFromBuffer(buf) {
  try {
    const m = await sharp(buf).metadata();
    return describeFrameAspect(m.width, m.height);
  } catch {
    return {
      width: null,
      height: null,
      aspectRatio: null,
      fitsGallery: false,
      fitsPortrait: false,
      orientation: 'other',
    };
  }
}
