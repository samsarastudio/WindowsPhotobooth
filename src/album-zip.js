import fs from 'node:fs';
import path from 'node:path';
import archiver from 'archiver';
import { config } from './config.js';
import { loadSettings, selectDisplayPhotos } from './db.js';

/** @typedef {'all'|'guest'|'framed'|'original'|'originals'|'ai'|'physical'} ZipScope */

/**
 * Normalize ZIP scope query values.
 * @param {unknown} raw
 * @returns {ZipScope}
 */
export function normalizeZipScope(raw) {
  const s = String(raw || 'guest').trim().toLowerCase();
  if (s === 'all' || s === 'everything') return 'all';
  if (s === 'framed' || s === 'frame' || s === 'frames') return 'framed';
  if (s === 'original' || s === 'originals' || s === 'raw') return 'original';
  if (s === 'ai') return 'ai';
  if (s === 'physical' || s === 'print' || s === 'prints') return 'physical';
  return 'guest';
}

/**
 * Filter album photo rows for ZIP download.
 * @param {Array<Record<string, unknown>>} all
 * @param {unknown} scopeRaw
 */
export function filterPhotosForZip(all, scopeRaw) {
  const list = Array.isArray(all) ? all : [];
  const scope = normalizeZipScope(scopeRaw);
  if (scope === 'all') return { scope, photos: list };
  if (scope === 'framed') {
    return { scope, photos: list.filter((p) => p.variant === 'framed') };
  }
  if (scope === 'original') {
    return { scope, photos: list.filter((p) => p.variant === 'original') };
  }
  if (scope === 'ai') {
    return { scope, photos: list.filter((p) => p.variant === 'ai') };
  }
  if (scope === 'physical') {
    return { scope, photos: list.filter((p) => p.variant === 'physical') };
  }
  return {
    scope: 'guest',
    photos: selectDisplayPhotos(list, {
      includeOriginals: loadSettings().showOriginalPhotos !== false,
    }),
  };
}

function scopeSuffix(scope) {
  if (scope === 'all') return 'all';
  if (scope === 'framed') return 'framed';
  if (scope === 'original') return 'originals';
  if (scope === 'ai') return 'ai';
  if (scope === 'physical') return 'physical';
  return 'gallery';
}

/**
 * Stream a ZIP of album photos to the response.
 * @param {import('express').Response} res
 * @param {{
 *   slug: string,
 *   title?: string,
 *   photos: Array<{ filename: string, variant?: string, id?: string }>,
 *   scope?: string,
 * }} opts
 */
export function streamAlbumZip(res, opts) {
  const slug = path.basename(String(opts.slug || ''));
  const photos = Array.isArray(opts.photos) ? opts.photos : [];
  const dir = path.join(config.photosDir, slug);
  const scope = normalizeZipScope(opts.scope || 'guest');
  const safeTitle = String(opts.title || slug)
    .replace(/[^\w.\- ]+/g, '_')
    .replace(/\s+/g, '_')
    .slice(0, 80) || slug;
  const zipName = `${safeTitle}-${scopeSuffix(scope)}.zip`;

  const entries = [];
  const usedNames = new Set();
  for (const photo of photos) {
    const filename = path.basename(String(photo.filename || ''));
    if (!filename || filename.includes('..')) continue;
    const abs = path.join(dir, filename);
    if (!fs.existsSync(abs)) continue;
    const variant = String(photo.variant || 'photo').replace(/[^\w-]+/g, '');
    const id = String(photo.id || path.parse(filename).name).replace(/[^\w-]+/g, '');
    const ext = path.extname(filename) || '.jpg';
    let entry = `${String(entries.length + 1).padStart(3, '0')}-${variant}-${id}${ext}`;
    if (usedNames.has(entry)) entry = `${path.parse(entry).name}-${entries.length}${ext}`;
    usedNames.add(entry);
    entries.push({ abs, entry });
  }

  if (!entries.length) {
    return res.status(404).json({
      ok: false,
      error: `No ${scopeSuffix(scope)} photo files found to zip`,
    });
  }

  const archive = archiver('zip', { zlib: { level: 5 } });
  archive.on('error', (err) => {
    console.error('[zip] archive error', err);
    if (!res.headersSent) {
      res.status(500).json({ ok: false, error: err.message || String(err) });
    } else {
      res.destroy(err);
    }
  });

  res.setHeader('Content-Type', 'application/zip');
  res.setHeader(
    'Content-Disposition',
    `attachment; filename="${zipName}"; filename*=UTF-8''${encodeURIComponent(zipName)}`,
  );
  res.setHeader('Cache-Control', 'no-store');
  archive.pipe(res);

  for (const { abs, entry } of entries) {
    archive.file(abs, { name: entry });
  }
  void archive.finalize();
}
