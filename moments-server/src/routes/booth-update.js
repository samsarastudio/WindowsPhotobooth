import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import multer from 'multer';
import { Router } from 'express';
import { nanoid } from 'nanoid';
import { config } from '../config.js';
import { getDb, loadSettings, saveSettings } from '../db.js';
import { requireAdminPin, requireUploadToken } from '../auth.js';

const CHUNK_STAGING = () => path.join(ensureUpdatesDir(), '_chunks');

function ensureUpdatesDir() {
  fs.mkdirSync(config.boothUpdatesDir, { recursive: true });
  return config.boothUpdatesDir;
}

function stagingDir(uploadId) {
  const dir = path.join(CHUNK_STAGING(), path.basename(String(uploadId || '')));
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function readStagingMeta(uploadId) {
  const metaPath = path.join(stagingDir(uploadId), 'meta.json');
  if (!fs.existsSync(metaPath)) return null;
  return JSON.parse(fs.readFileSync(metaPath, 'utf8'));
}

function cleanupStaging(uploadId) {
  const dir = path.join(CHUNK_STAGING(), path.basename(String(uploadId || '')));
  try {
    fs.rmSync(dir, { recursive: true, force: true });
  } catch {
    /* ignore */
  }
}

function sha256File(filePath) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256');
    const stream = fs.createReadStream(filePath);
    stream.on('data', (chunk) => hash.update(chunk));
    stream.on('error', reject);
    stream.on('end', () => resolve(hash.digest('hex')));
  });
}

function parseVersionParts(v) {
  return String(v || '0')
    .replace(/^v/i, '')
    .split(/[.+-]/)
    .map((p) => {
      const n = Number.parseInt(p, 10);
      return Number.isFinite(n) ? n : 0;
    });
}

/** @returns {-1|0|1} */
export function compareVersions(a, b) {
  const pa = parseVersionParts(a);
  const pb = parseVersionParts(b);
  const len = Math.max(pa.length, pb.length);
  for (let i = 0; i < len; i += 1) {
    const x = pa[i] || 0;
    const y = pb[i] || 0;
    if (x < y) return -1;
    if (x > y) return 1;
  }
  return 0;
}

function publicRelease(row) {
  return {
    id: row.id,
    version: row.version,
    buildId: row.build_id,
    bytes: row.bytes,
    sha256: row.sha256 || '',
    notes: row.notes || '',
    createdAt: row.created_at,
    filename: row.filename,
    downloadUrl: `${config.publicBaseUrl}/api/booth-update/download/${encodeURIComponent(row.id)}`,
    adminDownloadUrl: `/api/admin/booth-updates/${encodeURIComponent(row.id)}/download`,
  };
}

function getActiveReleaseId() {
  const s = loadSettings();
  return typeof s.boothUpdateActiveId === 'string' ? s.boothUpdateActiveId.trim() : '';
}

function getActiveRelease() {
  const id = getActiveReleaseId();
  if (!id) return null;
  return getDb().prepare('SELECT * FROM booth_releases WHERE id = ?').get(id) || null;
}

const diskUpload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => {
      cb(null, ensureUpdatesDir());
    },
    filename: (_req, file, cb) => {
      const safe = path
        .basename(file.originalname || 'update.zip')
        .replace(/[^a-zA-Z0-9._-]+/g, '-');
      cb(null, `upload-${Date.now()}-${safe}`);
    },
  }),
  limits: { fileSize: 600 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const name = (file.originalname || '').toLowerCase();
    if (!name.endsWith('.zip')) {
      cb(new Error('Upload must be a .zip of the PhotoBooth Folder build'));
      return;
    }
    cb(null, true);
  },
});

export const boothUpdateRouter = Router();
export const adminBoothUpdateRouter = Router();

adminBoothUpdateRouter.use(requireAdminPin);

adminBoothUpdateRouter.get('/', (_req, res) => {
  const rows = getDb()
    .prepare('SELECT * FROM booth_releases ORDER BY created_at DESC')
    .all();
  const activeId = getActiveReleaseId();
  return res.json({
    ok: true,
    activeId: activeId || null,
    releases: rows.map((r) => ({
      ...publicRelease(r),
      active: r.id === activeId,
    })),
  });
});

/** Start a chunked upload (avoids SSL failures on huge single POSTs). */
adminBoothUpdateRouter.post('/init', (req, res) => {
  const version = String(req.body?.version || '').trim();
  if (!/^\d+\.\d+\.\d+([.-][\w.]+)?$/.test(version)) {
    return res.status(400).json({ ok: false, error: 'version required (semver, e.g. 1.1.0)' });
  }
  const buildId =
    String(req.body?.buildId || '').trim() ||
    new Date().toISOString().replace(/[-:TZ.]/g, '').slice(0, 14);
  const notes = String(req.body?.notes || '').trim().slice(0, 2000);
  const bytes = Number(req.body?.bytes);
  const totalChunks = Number(req.body?.totalChunks);
  if (!Number.isFinite(bytes) || bytes < 1 || bytes > 600 * 1024 * 1024) {
    return res.status(400).json({ ok: false, error: 'bytes required (1…600MB)' });
  }
  if (!Number.isFinite(totalChunks) || totalChunks < 1 || totalChunks > 5000) {
    return res.status(400).json({ ok: false, error: 'totalChunks invalid' });
  }
  const uploadId = nanoid(16);
  const dir = stagingDir(uploadId);
  const meta = {
    uploadId,
    version,
    buildId,
    notes,
    bytes,
    totalChunks,
    received: [],
    createdAt: new Date().toISOString(),
  };
  fs.writeFileSync(path.join(dir, 'meta.json'), JSON.stringify(meta, null, 2), 'utf8');
  return res.json({ ok: true, uploadId, chunkSizeHint: 512 * 1024 });
});

const chunkUpload = multer({
  storage: multer.diskStorage({
    destination: (req, _file, cb) => {
      const uploadId = path.basename(String(req.params.uploadId || ''));
      cb(null, stagingDir(uploadId));
    },
    filename: (req, _file, cb) => {
      const index = Number(req.get('x-chunk-index') || req.body?.index);
      const n = Number.isInteger(index) ? index : -1;
      cb(null, `part-${String(n).padStart(5, '0')}.uploading`);
    },
  }),
  limits: { fileSize: 4 * 1024 * 1024, files: 1 },
});

/** Multipart chunk POST — more reliable than raw PUT over flaky self-signed TLS. */
adminBoothUpdateRouter.post('/chunk/:uploadId', (req, res) => {
  req.setTimeout(0);
  res.setTimeout(0);
  chunkUpload.single('chunk')(req, res, (err) => {
    if (err) {
      console.error('[booth-update] chunk multer', err);
      return res.status(400).json({ ok: false, error: err.message || 'Chunk upload failed' });
    }
    try {
      const uploadId = path.basename(String(req.params.uploadId || ''));
      const meta = readStagingMeta(uploadId);
      if (!meta) {
        if (req.file?.path && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
        return res.status(404).json({ ok: false, error: 'Upload session not found' });
      }
      const index = Number(req.get('x-chunk-index') || req.body?.index);
      if (!Number.isInteger(index) || index < 0 || index >= meta.totalChunks) {
        if (req.file?.path && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
        return res.status(400).json({ ok: false, error: 'Invalid x-chunk-index' });
      }
      if (!req.file?.path) {
        return res.status(400).json({ ok: false, error: 'Missing chunk file' });
      }
      const chunkPath = path.join(stagingDir(uploadId), `part-${String(index).padStart(5, '0')}`);
      if (fs.existsSync(chunkPath)) fs.unlinkSync(chunkPath);
      fs.renameSync(req.file.path, chunkPath);
      if (!meta.received.includes(index)) meta.received.push(index);
      meta.received.sort((a, b) => a - b);
      fs.writeFileSync(
        path.join(stagingDir(uploadId), 'meta.json'),
        JSON.stringify(meta, null, 2),
        'utf8',
      );
      return res.json({
        ok: true,
        index,
        received: meta.received.length,
        totalChunks: meta.totalChunks,
      });
    } catch (e) {
      console.error('[booth-update] chunk', e);
      return res.status(500).json({ ok: false, error: e?.message || 'Chunk failed' });
    }
  });
});

adminBoothUpdateRouter.post('/complete/:uploadId', async (req, res) => {
  req.setTimeout(0);
  res.setTimeout(0);
  const uploadId = path.basename(String(req.params.uploadId || ''));
  const meta = readStagingMeta(uploadId);
  if (!meta) return res.status(404).json({ ok: false, error: 'Upload session not found' });
  if (meta.received.length !== meta.totalChunks) {
    return res.status(400).json({
      ok: false,
      error: `Missing chunks (${meta.received.length}/${meta.totalChunks})`,
    });
  }
  try {
    const id = nanoid(12);
    const filename = `PhotoBooth-${meta.version}-${meta.buildId}.zip`;
    const dest = path.join(ensureUpdatesDir(), filename);
    if (fs.existsSync(dest)) fs.unlinkSync(dest);
    const fd = fs.openSync(dest, 'w');
    try {
      for (let i = 0; i < meta.totalChunks; i += 1) {
        const chunkPath = path.join(stagingDir(uploadId), `part-${String(i).padStart(5, '0')}`);
        if (!fs.existsSync(chunkPath)) {
          cleanupStaging(uploadId);
          return res.status(400).json({ ok: false, error: `Missing chunk ${i}` });
        }
        const buf = fs.readFileSync(chunkPath);
        fs.writeSync(fd, buf);
      }
    } finally {
      fs.closeSync(fd);
    }
    const st = fs.statSync(dest);
    if (st.size !== meta.bytes) {
      try {
        fs.unlinkSync(dest);
      } catch {
        /* ignore */
      }
      cleanupStaging(uploadId);
      return res.status(400).json({
        ok: false,
        error: `Size mismatch (got ${st.size}, expected ${meta.bytes})`,
      });
    }
    const sha256 = await sha256File(dest);
    const createdAt = new Date().toISOString();
    getDb()
      .prepare(
        `INSERT INTO booth_releases (id, version, build_id, filename, bytes, sha256, notes, created_at)
         VALUES (@id, @version, @build_id, @filename, @bytes, @sha256, @notes, @created_at)`,
      )
      .run({
        id,
        version: meta.version,
        build_id: meta.buildId,
        filename,
        bytes: st.size,
        sha256,
        notes: meta.notes || '',
        created_at: createdAt,
      });
    cleanupStaging(uploadId);
    console.log(`[booth-update] chunked upload complete v${meta.version} (${meta.buildId}) ${st.size} bytes`);
    return res.json({
      ok: true,
      release: {
        ...publicRelease({
          id,
          version: meta.version,
          build_id: meta.buildId,
          filename,
          bytes: st.size,
          sha256,
          notes: meta.notes || '',
          created_at: createdAt,
        }),
        active: false,
      },
    });
  } catch (e) {
    console.error('[booth-update] complete', e);
    cleanupStaging(uploadId);
    return res.status(500).json({ ok: false, error: e?.message || 'Assemble failed' });
  }
});

adminBoothUpdateRouter.post('/', (req, res) => {
  // Large Folder zips (100–400MB) need a long-lived request.
  req.setTimeout(0);
  res.setTimeout(0);
  diskUpload.single('package')(req, res, async (err) => {
    if (err) {
      console.error('[booth-update] multer', err);
      return res.status(400).json({ ok: false, error: err.message || 'Upload failed' });
    }
    try {
      if (!req.file?.path) {
        return res.status(400).json({ ok: false, error: 'Missing package file (field: package)' });
      }
      const version = String(req.body?.version || '').trim();
      if (!/^\d+\.\d+\.\d+([.-][\w.]+)?$/.test(version)) {
        fs.unlinkSync(req.file.path);
        return res.status(400).json({
          ok: false,
          error: 'version required (semver, e.g. 1.1.0)',
        });
      }
      const buildId =
        String(req.body?.buildId || '').trim() ||
        new Date().toISOString().replace(/[-:TZ.]/g, '').slice(0, 14);
      const notes = String(req.body?.notes || '').trim().slice(0, 2000);
      const id = nanoid(12);
      const filename = `PhotoBooth-${version}-${buildId}.zip`;
      const dest = path.join(ensureUpdatesDir(), filename);
      if (fs.existsSync(dest)) fs.unlinkSync(dest);
      fs.renameSync(req.file.path, dest);
      const st = fs.statSync(dest);
      const sha256 = await sha256File(dest);
      const createdAt = new Date().toISOString();
      getDb()
        .prepare(
          `INSERT INTO booth_releases (id, version, build_id, filename, bytes, sha256, notes, created_at)
           VALUES (@id, @version, @build_id, @filename, @bytes, @sha256, @notes, @created_at)`,
        )
        .run({
          id,
          version,
          build_id: buildId,
          filename,
          bytes: st.size,
          sha256,
          notes,
          created_at: createdAt,
        });
      console.log(`[booth-update] uploaded v${version} (${buildId}) ${st.size} bytes`);
      return res.json({
        ok: true,
        release: {
          ...publicRelease({
            id,
            version,
            build_id: buildId,
            filename,
            bytes: st.size,
            sha256,
            notes,
            created_at: createdAt,
          }),
          active: false,
        },
      });
    } catch (e) {
      try {
        if (req.file?.path && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
      } catch {
        /* ignore */
      }
      console.error('[booth-update] upload', e);
      return res.status(500).json({ ok: false, error: e?.message || 'Upload failed' });
    }
  });
});

adminBoothUpdateRouter.get('/:id/download', (req, res) => {
  const row = getDb().prepare('SELECT * FROM booth_releases WHERE id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ ok: false, error: 'Release not found' });
  const filePath = path.join(ensureUpdatesDir(), row.filename);
  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ ok: false, error: 'Package file missing on server' });
  }
  res.setHeader('Content-Type', 'application/zip');
  res.setHeader('Content-Length', String(row.bytes));
  res.setHeader(
    'Content-Disposition',
    `attachment; filename="${row.filename.replace(/"/g, '')}"`,
  );
  if (row.sha256) res.setHeader('X-Content-SHA256', row.sha256);
  req.setTimeout(0);
  res.setTimeout(0);
  return fs.createReadStream(filePath).pipe(res);
});

adminBoothUpdateRouter.post('/:id/rollout', (req, res) => {
  const row = getDb().prepare('SELECT * FROM booth_releases WHERE id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ ok: false, error: 'Release not found' });
  saveSettings({ boothUpdateActiveId: row.id });
  return res.json({
    ok: true,
    activeId: row.id,
    release: { ...publicRelease(row), active: true },
  });
});

adminBoothUpdateRouter.post('/clear-rollout', (_req, res) => {
  saveSettings({ boothUpdateActiveId: '' });
  return res.json({ ok: true, activeId: null });
});

adminBoothUpdateRouter.delete('/:id', (req, res) => {
  const row = getDb().prepare('SELECT * FROM booth_releases WHERE id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ ok: false, error: 'Release not found' });
  const filePath = path.join(ensureUpdatesDir(), row.filename);
  getDb().prepare('DELETE FROM booth_releases WHERE id = ?').run(row.id);
  if (getActiveReleaseId() === row.id) {
    saveSettings({ boothUpdateActiveId: '' });
  }
  try {
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
  } catch (e) {
    console.warn('[booth-update] delete file', e);
  }
  return res.json({ ok: true });
});

/** Booths poll this with their current version. */
boothUpdateRouter.get('/check', requireUploadToken, (req, res) => {
  const currentVersion = String(req.query.currentVersion || req.query.version || '').trim();
  const currentBuildId = String(req.query.buildId || '').trim();
  const active = getActiveRelease();
  if (!active) {
    return res.json({ ok: true, updateAvailable: false, active: null });
  }
  const newerVersion = compareVersions(currentVersion, active.version) < 0;
  const sameVersionNewerBuild =
    compareVersions(currentVersion, active.version) === 0 &&
    currentBuildId &&
    active.build_id &&
    currentBuildId !== active.build_id &&
    currentBuildId < active.build_id;
  const updateAvailable = !currentVersion || newerVersion || sameVersionNewerBuild;
  return res.json({
    ok: true,
    updateAvailable,
    active: {
      ...publicRelease(active),
      downloadUrl: `/api/booth-update/download/${encodeURIComponent(active.id)}`,
    },
  });
});

boothUpdateRouter.get('/download/:id', requireUploadToken, (req, res) => {
  const row = getDb().prepare('SELECT * FROM booth_releases WHERE id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ ok: false, error: 'Release not found' });
  const filePath = path.join(ensureUpdatesDir(), row.filename);
  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ ok: false, error: 'Package file missing on server' });
  }
  res.setHeader('Content-Type', 'application/zip');
  res.setHeader('Content-Length', String(row.bytes));
  res.setHeader(
    'Content-Disposition',
    `attachment; filename="${row.filename.replace(/"/g, '')}"`,
  );
  if (row.sha256) res.setHeader('X-Content-SHA256', row.sha256);
  return fs.createReadStream(filePath).pipe(res);
});
