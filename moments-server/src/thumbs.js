import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { config } from './config.js';

/** Long edge for grid/mosaic tiles — keeps Pi bandwidth and decode cost down. */
export const THUMB_MAX_EDGE = 480;

function thumbDirForSlug(slug) {
  return path.join(config.photosDir, slug, '.thumbs');
}

export function thumbPathFor(slug, filename) {
  const base = path.basename(filename);
  const stem = base.replace(/\.[^.]+$/, '') || base;
  return path.join(thumbDirForSlug(slug), `${stem}.jpg`);
}

/**
 * Ensure a JPEG thumbnail exists for a photo file. Concurrent callers share one promise.
 * @returns {Promise<string | null>} absolute thumb path, or null if source missing/failed
 */
const inflight = new Map();

export async function ensureThumb(slug, filename) {
  const src = path.join(config.photosDir, slug, path.basename(filename));
  if (!fs.existsSync(src)) return null;
  const dest = thumbPathFor(slug, filename);
  if (fs.existsSync(dest)) {
    try {
      const [a, b] = [fs.statSync(src), fs.statSync(dest)];
      if (b.mtimeMs >= a.mtimeMs && b.size > 0) return dest;
    } catch {
      /* regenerate */
    }
  }

  const key = `${slug}/${path.basename(filename)}`;
  if (inflight.has(key)) return inflight.get(key);

  const job = (async () => {
    try {
      fs.mkdirSync(thumbDirForSlug(slug), { recursive: true });
      const tmp = `${dest}.${process.pid}.tmp`;
      await sharp(src, { failOn: 'none' })
        .rotate()
        .resize(THUMB_MAX_EDGE, THUMB_MAX_EDGE, {
          fit: 'inside',
          withoutEnlargement: true,
        })
        .jpeg({ quality: 72, mozjpeg: true })
        .toFile(tmp);
      fs.renameSync(tmp, dest);
      return dest;
    } catch (e) {
      console.warn('[thumbs] failed', slug, filename, e.message || e);
      try {
        fs.unlinkSync(`${dest}.${process.pid}.tmp`);
      } catch {
        /* ignore */
      }
      return null;
    } finally {
      inflight.delete(key);
    }
  })();

  inflight.set(key, job);
  return job;
}

/** Fire-and-forget after upload so the first gallery open is warmer. */
export function warmThumb(slug, filename) {
  void ensureThumb(slug, filename).catch(() => {});
}

/**
 * Warm missing thumbs for an album with limited concurrency (Pi-friendly).
 * @param {string} slug
 * @param {Array<{ filename?: string }>} photos
 * @param {{ concurrency?: number }} [opts]
 */
export function warmAlbumThumbs(slug, photos, opts = {}) {
  const list = (Array.isArray(photos) ? photos : [])
    .map((p) => path.basename(String(p.filename || '')))
    .filter(Boolean);
  if (!list.length) return;
  const concurrency = Math.max(1, Math.min(4, opts.concurrency || 2));
  let i = 0;
  const run = async () => {
    while (i < list.length) {
      const filename = list[i++];
      await ensureThumb(slug, filename);
    }
  };
  void Promise.all(Array.from({ length: concurrency }, () => run())).catch(() => {});
}
