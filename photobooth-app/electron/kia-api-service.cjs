'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const https = require('https');
const http = require('http');
const { URL, pathToFileURL, fileURLToPath } = require('url');
const { composePhotoWithFrame, createFramePickerThumbnail } = require('./image-process.cjs');
const {
  bundledAssetFileUrl,
  bundledAssetPath,
  BUNDLED_FRAME_IDS,
} = require('./frame-fallbacks.cjs');

const SYNC_INTERVAL_MS = 30_000;
const MAX_UPLOAD_ATTEMPTS = 1000;
const DEFAULT_DEV_BYPASS_EMAIL = 'nandu@tuna.group';

function isLikelyPhotoBoothSessionToken(value, bypassCode) {
  const s = normalizeSessionToken(value);
  if (!s) return false;
  if (isBypassToken(s, bypassCode)) return false;
  return matchesQrTokenFormat(s, 'KIA-PHOTO-') || s.length >= 12;
}

function matchesQrTokenFormat(token, prefix) {
  const p = String(prefix || '')
    .trim()
    .toUpperCase();
  if (!p || !token.startsWith(p)) return false;
  const suffix = token.slice(p.length);
  return /^[A-Z0-9-]{4,40}$/.test(suffix);
}

function isBypassToken(token, bypassCode) {
  const expected = String(bypassCode || '').trim();
  if (!expected) return false;
  return token === expected;
}

function looksLikeEmail(value) {
  const s = String(value || '').trim();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
}

/** Parse validate `data` — object, JSON string, email, or session token. */
function parseValidateData(data) {
  if (data == null || data === '') {
    return { email: null, sessionToken: null };
  }
  if (typeof data === 'object') {
    const j = data;
    const email =
      (typeof j.email === 'string' && j.email) ||
      (j.user && typeof j.user.email === 'string' && j.user.email) ||
      null;
    const sessionToken =
      (typeof j.session_token === 'string' && j.session_token) ||
      (typeof j.sessionToken === 'string' && j.sessionToken) ||
      (typeof j.token === 'string' && j.token) ||
      null;
    return { email: email || null, sessionToken: sessionToken || null };
  }
  const s = String(data).trim();
  if (looksLikeEmail(s)) {
    return { email: s, sessionToken: null };
  }
  try {
    const j = JSON.parse(s);
    if (j && typeof j === 'object') {
      const email =
        (typeof j.email === 'string' && j.email) ||
        (j.user && typeof j.user.email === 'string' && j.user.email) ||
        null;
      const sessionToken =
        (typeof j.session_token === 'string' && j.session_token) ||
        (typeof j.sessionToken === 'string' && j.sessionToken) ||
        (typeof j.token === 'string' && j.token) ||
        null;
      return { email: email || null, sessionToken: sessionToken || null };
    }
  } catch (_) {
    /* plain string session token */
  }
  return { email: null, sessionToken: s };
}

function normalizeSessionToken(value) {
  if (value == null || value === '') return '';
  if (typeof value === 'object') {
    const parsed = parseValidateData(value);
    return parsed.sessionToken ? String(parsed.sessionToken).trim() : '';
  }
  const s = String(value).trim();
  if (s === '[object Object]') return '';
  return s;
}

/**
 * Kia Forum photo-booth API client + persistent upload queue.
 * Bearer tokens are obtained via POST /api/kia/authenticate (email).
 */
class KiaApiService {
  constructor(dataDir) {
    this._dataDir = dataDir;
    this._queueFile = path.join(dataDir, 'upload-queue.json');
    this._legacyQueueFile = path.join(dataDir, 'sync-queue.json');
    this._framesCacheFile = path.join(dataDir, 'frames-cache.json');
    this._baseUrl = '';
    this._bearerToken = '';
    this._sessionBearer = '';
    this._qrPrefix = 'KIA-PHOTO-';
    this._bypassCode = '12345';
    this._devBypassEmail = DEFAULT_DEV_BYPASS_EMAIL;
    this._offlineAllowPrefix = true;
    this._paths = {
      authenticate: '/api/kia/authenticate',
      validate: '/api/kia/photo-booth/validate',
      frames: '/api/kia/photo-booth/frames',
      media: '/api/kia/photo-booth/media',
      gallery: '/api/kia/photo-booth/gallery',
      qrCode: '/api/kia/photo-booth/qr-code',
    };
    this._timer = null;
    this._processing = false;
    this._lastPublish = null;
    this._debugMode = false;
    this._onDebug = null;
    this._bundledFramesRoot = '';
    this._uploadImageFormat = 'png';
  }

  configure(cfg) {
    const c = cfg || {};
    this._debugMode = c.debugMode === true;
    this._onDebug = typeof c.onDebug === 'function' ? c.onDebug : null;
    this._bundledFramesRoot = String(c.bundledFramesRoot || '').trim();
    const fmt = String(c.uploadImageFormat || 'png').trim().toLowerCase();
    this._uploadImageFormat = fmt === 'jpeg' || fmt === 'jpg' ? 'jpeg' : 'png';
    let baseUrl = String(c.baseUrl || '')
      .trim()
      .replace(/\/$/, '');
    if (baseUrl.endsWith('/api')) {
      baseUrl = baseUrl.slice(0, -4);
    }
    this._baseUrl = baseUrl;
    this._bearerToken = String(c.bearerToken || '').trim();
    this._qrPrefix = String(c.qrPrefix || 'KIA-PHOTO-').trim();
    this._bypassCode = String(c.bypassCode || '12345').trim();
    this._devBypassEmail = String(c.devBypassEmail || DEFAULT_DEV_BYPASS_EMAIL).trim();
    this._offlineAllowPrefix = c.offlineAllowPrefix !== false;
    const p = c.paths || {};
    this._paths = {
      authenticate: p.authenticate || this._paths.authenticate,
      validate: p.validate || this._paths.validate,
      frames: p.frames || this._paths.frames,
      media: p.media || this._paths.media,
      gallery: p.gallery || this._paths.gallery,
      qrCode: p.qrCode || this._paths.qrCode,
    };
  }

  clearSessionBearer() {
    this._sessionBearer = '';
  }

  start() {
    this.stop();
    this._timer = setInterval(() => this.processQueue().catch(() => {}), SYNC_INTERVAL_MS);
    void this.processQueue();
  }

  stop() {
    if (this._timer) {
      clearInterval(this._timer);
      this._timer = null;
    }
  }

  _url(pathKey) {
    const p = this._paths[pathKey];
    const rel = p.startsWith('/') ? p : `/${p}`;
    return `${this._baseUrl}${rel}`;
  }

  _hasBaseUrl() {
    return Boolean(this._baseUrl);
  }

  /** Admin bearer, session bearer from guest authenticate, or per-queue item bearer. */
  _resolveBearer(preferred) {
    return preferred || this._sessionBearer || this._bearerToken || '';
  }

  _canCallApi(preferredBearer) {
    return Boolean(this._baseUrl && this._resolveBearer(preferredBearer));
  }

  _emitDebug(entry) {
    if (!this._debugMode || typeof this._onDebug !== 'function') return;
    try {
      this._onDebug(entry);
    } catch (_) {}
  }

  _pathForLog(urlStr) {
    const s = String(urlStr || '');
    if (this._baseUrl && s.startsWith(this._baseUrl)) {
      return s.slice(this._baseUrl.length) || '/';
    }
    try {
      return new URL(s).pathname + new URL(s).search;
    } catch (_) {
      return s;
    }
  }

  _summaryRequestBody(jsonBody, multipart) {
    if (multipart) return '[multipart]';
    if (jsonBody === undefined) return undefined;
    if (!jsonBody || typeof jsonBody !== 'object') return jsonBody;
    const copy = { ...jsonBody };
    if (typeof copy.image === 'string' && copy.image.length > 80) {
      copy.image = `[base64 ${copy.image.length} chars]`;
    }
    if (typeof copy.token === 'string' && copy.token.length > 16) {
      copy.token = `${copy.token.slice(0, 8)}…`;
    }
    return copy;
  }

  _summaryResponse(json, body) {
    if (json && typeof json === 'object') {
      const copy = JSON.parse(JSON.stringify(json));
      if (typeof copy.token === 'string') copy.token = '[redacted]';
      if (copy.data && typeof copy.data.token === 'string') copy.data.token = '[redacted]';
      return copy;
    }
    if (typeof body === 'string' && body.length > 800) {
      return `${body.slice(0, 800)}…`;
    }
    return body || null;
  }

  _request(method, urlStr, { jsonBody, multipart, bearerToken } = {}) {
    const started = Date.now();
    const pathForLog = this._pathForLog(urlStr);
    const reqSummary = this._summaryRequestBody(jsonBody, multipart);
    return new Promise((resolve, reject) => {
      let url;
      try {
        url = new URL(urlStr);
      } catch (e) {
        reject(e);
        return;
      }
      const bearer = this._resolveBearer(bearerToken);
      const lib = url.protocol === 'https:' ? https : http;
      const headers = {
        Accept: 'application/json',
        ...(bearer ? { Authorization: `Bearer ${bearer}` } : {}),
      };
      let bodyBuf = null;
      if (multipart) {
        bodyBuf = multipart.body;
        headers['Content-Type'] = `multipart/form-data; boundary=${multipart.boundary}`;
        headers['Content-Length'] = bodyBuf.length;
      } else if (jsonBody !== undefined) {
        const payload = JSON.stringify(jsonBody);
        bodyBuf = Buffer.from(payload, 'utf8');
        headers['Content-Type'] = 'application/json';
        headers['Content-Length'] = bodyBuf.length;
      }
      const req = lib.request(
        {
          method,
          hostname: url.hostname,
          port: url.port || (url.protocol === 'https:' ? 443 : 80),
          path: url.pathname + url.search,
          headers,
          timeout: 60000,
        },
        (res) => {
          let data = '';
          res.on('data', (c) => {
            data += c;
          });
          res.on('end', () => {
            let json = null;
            try {
              json = data ? JSON.parse(data) : null;
            } catch (_) {}
            const statusCode = res.statusCode || 0;
            this._emitDebug({
              at: new Date().toISOString(),
              kind: 'http',
              method,
              url: pathForLog,
              statusCode,
              ok: statusCode >= 200 && statusCode < 300,
              durationMs: Date.now() - started,
              request: reqSummary,
              response: this._summaryResponse(json, data),
            });
            resolve({ statusCode, json, body: data });
          });
        },
      );
      req.on('error', (err) => {
        this._emitDebug({
          at: new Date().toISOString(),
          kind: 'http',
          method,
          url: pathForLog,
          ok: false,
          error: String(err),
          durationMs: Date.now() - started,
          request: reqSummary,
        });
        reject(err);
      });
      req.on('timeout', () => {
        req.destroy(new Error('Request timeout'));
      });
      if (bodyBuf) req.write(bodyBuf);
      req.end();
    });
  }

  async _authenticateEmail(email) {
    const normalized = String(email || '').trim();
    if (!normalized) {
      return { ok: false, error: 'Missing email for authentication.' };
    }
    if (!this._hasBaseUrl()) {
      return { ok: false, error: 'API base URL not configured.' };
    }
    try {
      const res = await this._request('POST', this._url('authenticate'), {
        jsonBody: { email: normalized },
      });
      const ok = res.statusCode >= 200 && res.statusCode < 300;
      const token =
        (ok && typeof res.json?.token === 'string' && res.json.token) ||
        (ok && res.json?.data && typeof res.json.data.token === 'string' && res.json.data.token) ||
        null;
      if (token) {
        return { ok: true, token, email: normalized };
      }
      return {
        ok: false,
        error: res.json?.message || res.json?.error || `Authentication failed (HTTP ${res.statusCode})`,
        statusCode: res.statusCode,
      };
    } catch (e) {
      return { ok: false, error: String(e) };
    }
  }

  async _ensureBootstrapBearer() {
    if (this._bearerToken || this._sessionBearer) {
      return { ok: true, token: this._bearerToken || this._sessionBearer };
    }
    const auth = await this._authenticateEmail(this._devBypassEmail);
    if (auth.ok && auth.token) {
      return { ok: true, token: auth.token, bootstrap: true };
    }
    return auth;
  }

  async _establishSessionBearer(email) {
    const auth = await this._authenticateEmail(email);
    if (!auth.ok || !auth.token) {
      return auth;
    }
    this._sessionBearer = auth.token;
    return auth;
  }

  /** Dev bypass: authenticate, fetch QR, validate → real KIA-PHOTO session token for upload. */
  async _provisionDevBoothSession() {
    const auth = await this._establishSessionBearer(this._devBypassEmail);
    if (!auth.ok || !auth.token) {
      return { ok: false, error: auth.error || `Could not authenticate ${this._devBypassEmail}` };
    }
    const qrRes = await this._request('GET', this._url('qrCode'), { bearerToken: auth.token });
    const qrToken =
      (qrRes.json && typeof qrRes.json.token === 'string' && qrRes.json.token.trim()) || '';
    if (qrRes.statusCode < 200 || qrRes.statusCode >= 300 || !qrToken) {
      return {
        ok: false,
        error: qrRes.json?.message || qrRes.json?.error || 'Could not fetch dev photo booth QR session',
      };
    }
    const validated = await this._validateWithApi(qrToken, auth.token);
    if (!validated.valid || !validated.sessionData) {
      return {
        ok: false,
        error: validated.message || 'Dev photo booth session validate failed',
      };
    }
    return {
      ok: true,
      sessionData: validated.sessionData,
      email: this._devBypassEmail,
      qrToken,
    };
  }

  async _validateWithApi(token, bearerToken) {
    const res = await this._request('POST', this._url('validate'), {
      jsonBody: { token },
      bearerToken,
    });
    const ok = res.statusCode >= 200 && res.statusCode < 300;
    const valid = ok && res.json?.success === true;
    if (!valid) {
      return {
        ok: true,
        valid: false,
        offline: false,
        message: res.json?.message || res.json?.error || 'Invalid token',
        statusCode: res.statusCode,
      };
    }
    const parsed = parseValidateData(res.json?.data);
    return {
      ok: true,
      valid: true,
      offline: false,
      sessionData: parsed.sessionToken || token,
      email: parsed.email,
      message: res.json?.message || null,
    };
  }

  async validateToken(token) {
    const t = String(token || '')
      .trim()
      .toUpperCase();
    if (!t) return { ok: false, valid: false, error: 'Empty token' };

    if (isBypassToken(t, this._bypassCode)) {
      if (!this._hasBaseUrl()) {
        return {
          ok: true,
          valid: true,
          offline: true,
          usedPrefixFallback: true,
          sessionData: t,
        };
      }
      const devSession = await this._provisionDevBoothSession();
      if (!devSession.ok) {
        return {
          ok: false,
          valid: false,
          offline: false,
          error: devSession.error || 'Dev booth session could not be created',
        };
      }
      return {
        ok: true,
        valid: true,
        offline: false,
        sessionData: devSession.sessionData,
        email: devSession.email,
      };
    }

    if (!this._hasBaseUrl()) {
      if (this._offlineAllowPrefix && matchesQrTokenFormat(t, this._qrPrefix)) {
        return {
          ok: true,
          valid: true,
          offline: true,
          usedPrefixFallback: true,
          sessionData: t,
        };
      }
      return { ok: false, valid: false, error: 'API base URL not configured' };
    }

    const bootstrap = await this._ensureBootstrapBearer();
    if (!bootstrap.ok) {
      if (this._offlineAllowPrefix && matchesQrTokenFormat(t, this._qrPrefix)) {
        return {
          ok: true,
          valid: true,
          offline: true,
          usedPrefixFallback: true,
          sessionData: t,
        };
      }
      return {
        ok: false,
        valid: false,
        offline: true,
        error: bootstrap.error || 'Could not obtain API bearer for validation',
      };
    }

    try {
      const validated = await this._validateWithApi(t, bootstrap.token);
      if (!validated.valid) {
        return validated;
      }

      const guestEmail = validated.email;
      if (guestEmail) {
        const guestAuth = await this._establishSessionBearer(guestEmail);
        if (!guestAuth.ok) {
          return {
            ok: false,
            valid: false,
            offline: false,
            error: guestAuth.error || 'Guest authentication failed',
          };
        }
      } else if (bootstrap.bootstrap) {
        await this._establishSessionBearer(this._devBypassEmail);
      }

      return {
        ok: true,
        valid: true,
        offline: false,
        sessionData: validated.sessionData || t,
        email: guestEmail || null,
        message: validated.message,
      };
    } catch (e) {
      if (this._offlineAllowPrefix && matchesQrTokenFormat(t, this._qrPrefix)) {
        return {
          ok: true,
          valid: true,
          offline: true,
          usedPrefixFallback: true,
          sessionData: t,
        };
      }
      return { ok: false, valid: false, error: String(e), offline: true };
    }
  }

  _readQueue() {
    for (const file of [this._queueFile, this._legacyQueueFile]) {
      try {
        if (!fs.existsSync(file)) continue;
        const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
        const items = Array.isArray(raw) ? raw : [];
        if (file === this._legacyQueueFile && items.length > 0) {
          const migrated = items.flatMap((item) => this._migrateLegacyQueueItem(item) || []);
          this._writeQueue(migrated);
          try {
            fs.unlinkSync(this._legacyQueueFile);
          } catch (_) {}
          return migrated;
        }
        return items
          .map((item) => this._sanitizeQueueItem(item))
          .filter(Boolean);
      } catch (_) {}
    }
    return [];
  }

  _sanitizeQueueItem(item) {
    if (!item || typeof item !== 'object') return null;
    const sessionToken = normalizeSessionToken(item.sessionToken);
    if (!sessionToken || !isLikelyPhotoBoothSessionToken(sessionToken, this._bypassCode)) {
      return null;
    }
    let guestEmail =
      typeof item.guestEmail === 'string' && item.guestEmail.trim() ? item.guestEmail.trim() : null;
    if (guestEmail && guestEmail.toLowerCase() === 'test@csgnow.com') {
      guestEmail = this._devBypassEmail;
    }
    return {
      ...item,
      sessionToken,
      guestEmail,
      frameId:
        item.frameId === null || item.frameId === undefined ? null : Number(item.frameId),
    };
  }

  _migrateLegacyQueueItem(item) {
    if (!item || typeof item !== 'object') return null;
    const token = normalizeSessionToken(item.token || item.sessionToken);
    const photos = Array.isArray(item.photos) ? item.photos : item.imagePath ? [item.imagePath] : [];
    if (!token || photos.length === 0) return null;
    return photos.map((imagePath, i) => ({
      id: `${item.id || Date.now()}_${i}`,
      sessionToken: token,
      frameId: item.frameId ?? null,
      imagePath,
      bearerToken: item.bearerToken || null,
      guestEmail: item.guestEmail || null,
      enqueuedAt: item.enqueuedAt || new Date().toISOString(),
      attempts: item.attempts || 0,
      lastError: item.lastError || null,
    }));
  }

  _writeQueue(items) {
    fs.mkdirSync(this._dataDir, { recursive: true });
    fs.writeFileSync(this._queueFile, JSON.stringify(items.flat(), null, 2), 'utf8');
  }

  _parseFramesData(data) {
    if (Array.isArray(data)) return data.map((f) => this._normalizeFrameRecord(f));
    if (typeof data === 'string') {
      try {
        const parsed = JSON.parse(data);
        return Array.isArray(parsed) ? parsed.map((f) => this._normalizeFrameRecord(f)) : [];
      } catch (_) {
        return [];
      }
    }
    if (data && typeof data === 'object') return [this._normalizeFrameRecord(data)];
    return [];
  }

  /** Map API field aliases and resolve relative storage paths to absolute URLs. */
  _normalizeFrameRecord(frame) {
    if (!frame || typeof frame !== 'object') return frame;
    const copy = { ...frame };
    const frameImage =
      copy.frame_image ||
      copy.frameImage ||
      copy.image ||
      copy.image_url ||
      copy.imageUrl ||
      copy.file_path ||
      '';
    const thumbnail = copy.thumbnail || copy.thumb || copy.thumbnail_url || copy.thumbnailUrl || '';
    copy.frame_image = this._resolveAssetUrl(frameImage);
    copy.thumbnail = this._resolveAssetUrl(thumbnail);
    return copy;
  }

  _resolveAssetUrl(ref) {
    const s = String(ref || '').trim();
    if (!s) return '';
    if (/^https?:\/\//i.test(s) || s.startsWith('file:')) return s;
    if (!this._baseUrl) return s;
    if (s.startsWith('/')) {
      try {
        return new URL(s, `${this._baseUrl}/`).href;
      } catch (_) {
        return s;
      }
    }
    return s;
  }

  /** Only send booth JWT to our API host — S3/CDN URLs reject foreign Authorization headers. */
  _shouldAttachBearer(urlStr) {
    if (!this._baseUrl) return false;
    try {
      const target = new URL(urlStr);
      const api = new URL(this._baseUrl);
      return target.hostname === api.hostname;
    } catch (_) {
      return false;
    }
  }

  _readFramesCache() {
    try {
      if (!fs.existsSync(this._framesCacheFile)) return { frames: [], fetchedAt: null };
      const raw = JSON.parse(fs.readFileSync(this._framesCacheFile, 'utf8'));
      const frames = Array.isArray(raw.frames) ? raw.frames : [];
      return {
        frames: this._usableCachedFrames(frames),
        fetchedAt: raw.fetchedAt || null,
      };
    } catch (_) {
      return { frames: [], fetchedAt: null };
    }
  }

  _usableCachedFrames(frames) {
    return (Array.isArray(frames) ? frames : []).filter((f) => {
      if (!f || typeof f !== 'object') return false;
      const normalized = this._normalizeFrameRecord(f);
      return Boolean(normalized.frame_image || normalized.thumbnail);
    });
  }

  _writeFramesCache(frames) {
    fs.mkdirSync(this._dataDir, { recursive: true });
    fs.writeFileSync(
      this._framesCacheFile,
      JSON.stringify({ frames, fetchedAt: new Date().toISOString() }, null, 2),
      'utf8',
    );
  }

  _frameAssetsDir() {
    return path.join(this._dataDir, 'frame-assets');
  }

  _fetchBinaryUrl(urlStr, bearerToken) {
    const shouldAttachBearer = (href) => this._shouldAttachBearer(href);
    return new Promise((resolve, reject) => {
      let url;
      try {
        url = new URL(urlStr);
      } catch (e) {
        reject(e);
        return;
      }
      const lib = url.protocol === 'https:' ? https : http;
      const bearer = this._resolveBearer(bearerToken);
      const attachBearer = Boolean(bearer && shouldAttachBearer(urlStr));
      const req = lib.get(
        urlStr,
        {
          headers: {
            Accept: 'image/*,*/*',
            'User-Agent': 'PhotoBooth-KIA/1.0',
            ...(attachBearer ? { Authorization: `Bearer ${bearer}` } : {}),
          },
          timeout: 30000,
        },
        (res) => {
          if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
            fetchBinaryFollow(new URL(res.headers.location, urlStr).href, bearer)
              .then(resolve)
              .catch(reject);
            res.resume();
            return;
          }
          if (!res.statusCode || res.statusCode < 200 || res.statusCode >= 300) {
            reject(new Error(`HTTP ${res.statusCode || 0}`));
            res.resume();
            return;
          }
          const chunks = [];
          res.on('data', (c) => chunks.push(c));
          res.on('end', () => resolve(Buffer.concat(chunks)));
        },
      );
      req.on('error', reject);
      req.on('timeout', function onTimeout() {
        this.destroy(new Error('Request timeout'));
      });
    });

    function fetchBinaryFollow(href, bearer) {
      return new Promise((resolve, reject) => {
        const lib = href.startsWith('https:') ? https : http;
        const attachBearer = Boolean(bearer && shouldAttachBearer(href));
        lib
          .get(href, {
            headers: {
              Accept: 'image/*,*/*',
              'User-Agent': 'PhotoBooth-KIA/1.0',
              ...(attachBearer ? { Authorization: `Bearer ${bearer}` } : {}),
            },
            timeout: 30000,
          }, (res) => {
            if (!res.statusCode || res.statusCode < 200 || res.statusCode >= 300) {
              reject(new Error(`HTTP ${res.statusCode || 0}`));
              res.resume();
              return;
            }
            const chunks = [];
            res.on('data', (c) => chunks.push(c));
            res.on('end', () => resolve(Buffer.concat(chunks)));
          })
          .on('error', reject);
      });
    }
  }

  _looksLikeImage(buf) {
    if (!buf || buf.length < 4) return false;
    if (buf[0] === 0xff && buf[1] === 0xd8) return true;
    if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return true;
    if (buf[0] === 0x47 && buf[1] === 0x49 && buf[2] === 0x46) return true;
    if (buf[0] === 0x52 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x46) return true;
    return false;
  }

  _bundledFrameAsset(frameId, kind) {
    if (!this._bundledFramesRoot) return '';
    return bundledAssetFileUrl(this._bundledFramesRoot, frameId, kind);
  }

  async _cacheFrameAssetRemote(urlStr, frameId, kind) {
    const remote = String(urlStr || '').trim();
    if (!remote) {
      const fallback = this._bundledFrameAsset(frameId, kind);
      this._emitDebug({
        at: new Date().toISOString(),
        kind: 'frame-asset',
        method: 'CACHE',
        ok: Boolean(fallback),
        url: `frame-${frameId}/${kind}`,
        response: { source: 'empty-url', fallback: fallback || null },
      });
      return fallback || '';
    }
    if (remote.startsWith('file:')) {
      this._emitDebug({
        at: new Date().toISOString(),
        kind: 'frame-asset',
        method: 'CACHE',
        ok: true,
        url: `frame-${frameId}/${kind}`,
        response: { source: 'file-ref', path: remote.slice(0, 120) },
      });
      return remote;
    }

    const hash = crypto.createHash('sha256').update(remote).digest('hex').slice(0, 24);
    let ext = '.png';
    try {
      ext = path.extname(new URL(remote).pathname) || '.png';
    } catch (_) {}
    const cachePath = path.join(this._frameAssetsDir(), `${hash}${ext}`);
    if (fs.existsSync(cachePath)) {
      const stat = fs.statSync(cachePath);
      if (stat.size > 64) {
        const cachedBuf = fs.readFileSync(cachePath);
        if (this._looksLikeImage(cachedBuf)) {
          const href = pathToFileURL(cachePath).href;
          this._emitDebug({
            at: new Date().toISOString(),
            kind: 'frame-asset',
            method: 'CACHE',
            ok: true,
            url: `frame-${frameId}/${kind}`,
            response: { source: 'disk-cache', bytes: stat.size, path: href.slice(0, 120) },
          });
          return href;
        }
        try {
          fs.unlinkSync(cachePath);
        } catch (_) {}
        this._emitDebug({
          at: new Date().toISOString(),
          kind: 'frame-asset',
          method: 'CACHE',
          ok: false,
          url: `frame-${frameId}/${kind}`,
          error: 'Stale cache file is not an image — re-downloading',
        });
      }
    }

    const dlStarted = Date.now();
    try {
      const buf = await this._fetchBinaryUrl(remote);
      if (!this._looksLikeImage(buf)) {
        console.warn('[kia-api] frame asset is not an image:', remote);
        const fallback = this._bundledFrameAsset(frameId, kind);
        this._emitDebug({
          at: new Date().toISOString(),
          kind: 'frame-asset',
          method: 'DOWNLOAD',
          ok: Boolean(fallback || remote),
          url: remote.slice(0, 120),
          error: 'Response is not an image',
          response: { fallback: fallback || null, keptRemote: !fallback && Boolean(remote) },
          durationMs: Date.now() - dlStarted,
        });
        return fallback || remote;
      }
      fs.mkdirSync(path.dirname(cachePath), { recursive: true });
      fs.writeFileSync(cachePath, buf);
      const href = pathToFileURL(cachePath).href;
      this._emitDebug({
        at: new Date().toISOString(),
        kind: 'frame-asset',
        method: 'DOWNLOAD',
        ok: true,
        url: remote.slice(0, 120),
        response: { source: 'remote', bytes: buf.length, cached: href.slice(0, 120) },
        durationMs: Date.now() - dlStarted,
      });
      return href;
    } catch (e) {
      console.warn('[kia-api] frame asset download failed:', remote, e.message);
      const fallback = this._bundledFrameAsset(frameId, kind);
      if (fallback) {
        console.log('[kia-api] using bundled frame fallback for frame', frameId, kind);
      }
      this._emitDebug({
        at: new Date().toISOString(),
        kind: 'frame-asset',
        method: 'DOWNLOAD',
        ok: Boolean(fallback || remote),
        url: remote.slice(0, 120),
        error: String(e.message || e),
        response: { fallback: fallback || null, keptRemote: !fallback && Boolean(remote) },
        durationMs: Date.now() - dlStarted,
      });
      return fallback || remote;
    }
  }

  async _ensurePickerThumbnail(frameFileUrl, frameId) {
    if (!frameFileUrl || !String(frameFileUrl).startsWith('file:')) return '';
    let frameAbs;
    try {
      frameAbs = fileURLToPath(frameFileUrl);
    } catch (_) {
      return '';
    }
    if (!fs.existsSync(frameAbs)) return '';

    const thumbPath = path.join(this._frameAssetsDir(), `picker-${frameId}.png`);
    if (fs.existsSync(thumbPath)) {
      const stat = fs.statSync(thumbPath);
      if (stat.size > 32) {
        return pathToFileURL(thumbPath).href;
      }
    }

    const sharpMod = (() => {
      try {
        return require('sharp');
      } catch (_) {
        return null;
      }
    })();
    if (!sharpMod) return frameFileUrl;

    const made = await createFramePickerThumbnail(sharpMod, frameAbs, thumbPath, 128);
    if (!made.ok) {
      this._emitDebug({
        at: new Date().toISOString(),
        kind: 'frame-asset',
        method: 'THUMB',
        ok: false,
        url: `frame-${frameId}/picker`,
        error: made.error || 'Could not create picker thumbnail',
      });
      return frameFileUrl;
    }
    const href = pathToFileURL(thumbPath).href;
    this._emitDebug({
      at: new Date().toISOString(),
      kind: 'frame-asset',
      method: 'THUMB',
      ok: true,
      url: `frame-${frameId}/picker`,
      response: { path: href.slice(0, 120) },
    });
    return href;
  }

  async _resolveFrameAssets(frames) {
    const list = Array.isArray(frames) ? frames : [];
    const out = [];
    for (const frame of list) {
      if (!frame || typeof frame !== 'object') continue;
      const copy = this._normalizeFrameRecord(frame);
      const frameId = copy.id;
      const hadApiThumbnail = Boolean(copy.thumbnail);
      if (copy.thumbnail) {
        copy.thumbnail = await this._cacheFrameAssetRemote(copy.thumbnail, frameId, 'thumbnail');
      }
      if (copy.frame_image) {
        copy.frame_image = await this._cacheFrameAssetRemote(copy.frame_image, frameId, 'frame_image');
      }
      if (!hadApiThumbnail && copy.frame_image) {
        copy.thumbnail = await this._ensurePickerThumbnail(copy.frame_image, frameId);
      }
      out.push(copy);
    }
    return out;
  }

  async fetchFrames() {
    const cached = this._readFramesCache();
    if (!this._canCallApi()) {
      const frames = await this._resolveFrameAssets(cached.frames);
      return {
        ok: true,
        frames,
        fromCache: true,
        offline: true,
        frameListSource: 'cache-offline',
        framesCachedAt: cached.fetchedAt,
        debug: {
          source: 'cache-offline',
          count: frames.length,
          cachedAt: cached.fetchedAt,
          message: 'No API credentials — showing last saved frame list',
        },
      };
    }
    try {
      const res = await this._request('GET', this._url('frames'));
      if (res.statusCode >= 200 && res.statusCode < 300 && res.json?.success !== false) {
        const rawFrames = this._parseFramesData(res.json?.data);
        const frames = await this._resolveFrameAssets(rawFrames);
        const fetchedAt = new Date().toISOString();
        this._writeFramesCache(frames);
        const unlocked = frames.filter((f) => f.is_unlocked === true || f.is_unlocked === 1).length;
        return {
          ok: true,
          frames,
          fromCache: false,
          offline: false,
          frameListSource: 'api-live',
          framesCachedAt: fetchedAt,
          debug: {
            source: 'api-live',
            count: frames.length,
            unlocked,
            totalPoints: res.json?.total_points ?? null,
            cachedAt: fetchedAt,
            message: 'Fresh frame list from API — saved locally',
          },
        };
      }
      const frames = await this._resolveFrameAssets(cached.frames);
      return {
        ok: true,
        frames,
        fromCache: true,
        offline: false,
        frameListSource: 'cache-fallback',
        framesCachedAt: cached.fetchedAt,
        error: res.json?.message || 'Frames request failed',
        debug: {
          source: 'cache-fallback',
          count: frames.length,
          statusCode: res.statusCode,
          cachedAt: cached.fetchedAt,
          message: 'API error — showing last saved frame list',
        },
      };
    } catch (e) {
      const frames = await this._resolveFrameAssets(cached.frames);
      return {
        ok: true,
        frames,
        fromCache: true,
        offline: true,
        frameListSource: 'cache-fallback',
        framesCachedAt: cached.fetchedAt,
        error: String(e),
        debug: {
          source: 'cache-fallback',
          count: frames.length,
          cachedAt: cached.fetchedAt,
          message: 'Network error — showing last saved frame list',
        },
      };
    }
  }

  _localPathFromAssetRef(ref) {
    const s = String(ref || '').trim();
    if (!s) return null;
    if (s.startsWith('file://')) {
      try {
        return fileURLToPath(s);
      } catch (_) {
        return null;
      }
    }
    const abs = path.resolve(s);
    return fs.existsSync(abs) ? abs : null;
  }

  _frameImagePathForId(frameId, preferredPath) {
    const direct = this._localPathFromAssetRef(preferredPath);
    if (direct) return direct;
    const id = Number(frameId);
    if (!Number.isFinite(id)) return null;
    const cached = this._readFramesCache().frames || [];
    const frame = cached.find((f) => Number(f.id) === id);
    if (frame) {
      const fromCache =
        this._localPathFromAssetRef(frame.frame_image) ||
        this._localPathFromAssetRef(frame.frameImage) ||
        this._localPathFromAssetRef(frame.thumbnail);
      if (fromCache) return fromCache;
    }
    if (this._bundledFramesRoot) {
      return bundledAssetPath(this._bundledFramesRoot, id, 'frame_image');
    }
    return null;
  }

  async _prepareUploadImage(imagePath, frameId, frameImagePath) {
    const absPhoto = path.resolve(imagePath);
    if (frameId == null || !Number.isFinite(frameId)) {
      return { ok: true, path: absPhoto, composed: false };
    }
    const framePath = this._frameImagePathForId(frameId, frameImagePath);
    if (!framePath) {
      console.warn('[kia-api] frame image missing for frame', frameId, '- uploading photo without composite');
      return { ok: true, path: absPhoto, composed: false };
    }
    let sharpMod;
    try {
      sharpMod = require('sharp');
    } catch (_) {
      return { ok: true, path: absPhoto, composed: false };
    }
    const ext = this._uploadImageFormat === 'jpeg' ? '.jpg' : '.png';
    const outPath = path.join(
      path.dirname(absPhoto),
      `${path.basename(absPhoto, path.extname(absPhoto))}_framed_${frameId}${ext}`,
    );
    const composed = await composePhotoWithFrame(sharpMod, absPhoto, framePath, outPath, {
      format: this._uploadImageFormat,
    });
    if (!composed.ok) {
      console.warn('[kia-api] frame composite failed:', composed.error);
      return { ok: true, path: absPhoto, composed: false };
    }
    return { ok: true, path: composed.path, composed: true };
  }

  async enqueueMedia(entry) {
    const sessionToken = normalizeSessionToken(entry?.sessionToken);
    const imagePath = entry && typeof entry.imagePath === 'string' ? entry.imagePath.trim() : '';
    if (!sessionToken || !imagePath) {
      return { ok: false, error: 'Missing sessionToken or imagePath' };
    }
    if (!isLikelyPhotoBoothSessionToken(sessionToken, this._bypassCode)) {
      return { ok: false, error: 'Invalid photo booth session token — scan QR again' };
    }
    if (!fs.existsSync(imagePath)) {
      return { ok: false, error: 'Image file not found' };
    }
    const frameId =
      entry.frameId === null || entry.frameId === undefined ? null : Number(entry.frameId);
    const frameImagePath =
      entry && typeof entry.frameImagePath === 'string' ? entry.frameImagePath.trim() : null;
    const prepared = await this._prepareUploadImage(imagePath, frameId, frameImagePath);
    if (!prepared.ok || !prepared.path) {
      return { ok: false, error: prepared.error || 'Could not prepare upload image' };
    }
    let guestEmail =
      entry && typeof entry.guestEmail === 'string' ? entry.guestEmail.trim() : null;
    if (guestEmail && guestEmail.toLowerCase() === 'test@csgnow.com') {
      guestEmail = this._devBypassEmail;
    }
    const bearerToken =
      (entry && typeof entry.bearerToken === 'string' && entry.bearerToken.trim()) ||
      this._sessionBearer ||
      this._bearerToken ||
      null;
    const queue = this._readQueue();
    queue.push({
      id: `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      sessionToken,
      frameId: Number.isFinite(frameId) ? frameId : null,
      imagePath: prepared.path,
      bearerToken,
      guestEmail,
      enqueuedAt: new Date().toISOString(),
      attempts: 0,
      lastError: null,
    });
    this._writeQueue(queue);
    const uploadId = queue[queue.length - 1].id;
    this._emitDebug({
      at: new Date().toISOString(),
      kind: 'upload',
      method: 'ENQUEUE',
      ok: true,
      url: uploadId,
      response: {
        queued: true,
        pending: queue.length,
        frameId: Number.isFinite(frameId) ? frameId : null,
        offlineReady: true,
      },
    });
    void this.processQueue();
    return { ok: true, queued: true, pending: queue.length, uploadId };
  }

  async waitForUpload(uploadId, timeoutMs = 60000) {
    const id = String(uploadId || '').trim();
    if (!id) {
      return { ok: false, error: 'Missing upload id' };
    }
    const deadline = Date.now() + Math.max(5000, Number(timeoutMs) || 60000);
    while (Date.now() < deadline) {
      await this.processQueue();
      const queue = this._readQueue();
      const item = queue.find((q) => q.id === id);
      if (!item) {
        return { ok: true, lastPublish: this._lastPublish };
      }
      if ((item.attempts || 0) >= MAX_UPLOAD_ATTEMPTS) {
        return { ok: false, error: item.lastError || 'Upload failed', lastPublish: this._lastPublish };
      }
      await new Promise((r) => setTimeout(r, 300));
    }
    return { ok: false, error: 'Upload timeout', pending: this._readQueue().length };
  }

  enqueueSession(entry) {
    const token = entry && typeof entry.token === 'string' ? entry.token.trim() : '';
    const sessionToken =
      entry && typeof entry.sessionToken === 'string' ? entry.sessionToken.trim() : token;
    const photos = Array.isArray(entry?.photos) ? entry.photos.filter((p) => typeof p === 'string') : [];
    const frameId = entry?.frameId ?? null;
    if (!sessionToken || photos.length === 0) {
      return { ok: false, error: 'Missing token or photos' };
    }
    for (const imagePath of photos) {
      const r = this.enqueueMedia({ sessionToken, frameId, imagePath });
      if (!r.ok) return r;
    }
    return { ok: true };
  }

  getUploadQueueStatus() {
    const queue = this._readQueue();
    return {
      ok: true,
      pending: queue.length,
      lastPublish: this._lastPublish,
      items: queue.map((i) => ({
        id: i.id,
        sessionToken: i.sessionToken,
        attempts: i.attempts || 0,
        enqueuedAt: i.enqueuedAt,
        lastError: i.lastError,
        hasBearer: Boolean(i.bearerToken || this._sessionBearer || this._bearerToken),
      })),
    };
  }

  async processQueue() {
    if (this._processing) return;
    const queue = this._readQueue();
    if (queue.length === 0) return;
    if (!this._hasBaseUrl()) return;

    this._processing = true;
    const remaining = [];

    try {
      for (const item of queue) {
        if ((item.attempts || 0) >= MAX_UPLOAD_ATTEMPTS) {
          remaining.push(item);
          continue;
        }
        const uploaded = await this._uploadItem(item);
        if (!uploaded.ok) {
          item.attempts = (item.attempts || 0) + 1;
          item.lastError = uploaded.error || 'Upload failed';
          remaining.push(item);
        } else {
          this._lastPublish = {
            id: item.id,
            sessionToken: item.sessionToken,
            imagePath: item.imagePath,
            publishedAt: new Date().toISOString(),
            response: uploaded.response || null,
          };
          console.log('[kia-api] Published media', this._lastPublish);
        }
      }
      this._writeQueue(remaining);
    } finally {
      this._processing = false;
    }
  }

  async _refreshItemBearer(item) {
    if (this._sessionBearer) {
      item.bearerToken = this._sessionBearer;
      return this._sessionBearer;
    }
    const email = item.guestEmail || this._devBypassEmail;
    if (email) {
      const auth = await this._authenticateEmail(email);
      if (auth.ok && auth.token) {
        this._sessionBearer = auth.token;
        item.bearerToken = auth.token;
        item.guestEmail = email;
        return auth.token;
      }
    }
    if (this._bearerToken) {
      item.bearerToken = this._bearerToken;
      return this._bearerToken;
    }
    return '';
  }

  async _uploadItem(item) {
    if (!fs.existsSync(item.imagePath)) {
      return { ok: false, error: 'File missing' };
    }
    const bearerToken = await this._refreshItemBearer(item);
    if (!bearerToken) {
      return { ok: false, error: 'No API bearer available for upload' };
    }

    try {
      const ext = path.extname(item.imagePath).toLowerCase();
      const mime =
        ext === '.png' ? 'image/png' : ext === '.webp' ? 'image/webp' : 'image/jpeg';
      const imageB64 = fs.readFileSync(item.imagePath).toString('base64');
      const jsonBody = {
        session_token: item.sessionToken,
        image: imageB64,
      };
      if (item.frameId != null && Number.isFinite(item.frameId)) {
        jsonBody.frame_id = item.frameId;
      }

      let res = await this._request('POST', this._url('media'), {
        jsonBody,
        bearerToken,
      });

      if (res.statusCode === 401) {
        const email = item.guestEmail || this._devBypassEmail;
        item.bearerToken = null;
        this._sessionBearer = '';
        const auth = await this._authenticateEmail(email);
        if (auth.ok && auth.token) {
          item.bearerToken = auth.token;
          this._sessionBearer = auth.token;
          res = await this._request('POST', this._url('media'), {
            jsonBody,
            bearerToken: auth.token,
          });
        }
      }

      if (res.statusCode >= 200 && res.statusCode < 300 && res.json?.success !== false) {
        return { ok: true, response: res.json || null, mime };
      }
      return {
        ok: false,
        error: res.json?.message || res.json?.error || `HTTP ${res.statusCode}`,
      };
    } catch (e) {
      return { ok: false, error: String(e) };
    }
  }

  async fetchGallery() {
    if (!this._canCallApi()) {
      return { ok: false, offline: true, error: 'API not configured', items: [] };
    }
    try {
      const res = await this._request('GET', this._url('gallery'));
      if (res.statusCode >= 200 && res.statusCode < 300) {
        const items = Array.isArray(res.json?.data) ? res.json.data : [];
        return { ok: true, items, offline: false };
      }
      return {
        ok: false,
        offline: false,
        error: res.json?.message || `HTTP ${res.statusCode}`,
        items: [],
      };
    } catch (e) {
      return { ok: false, offline: true, error: String(e), items: [] };
    }
  }

  async testConnection() {
    if (!this._baseUrl) {
      return { ok: false, error: 'Base URL not set' };
    }
    let bearer = this._bearerToken;
    if (!bearer) {
      const auth = await this._authenticateEmail(this._devBypassEmail);
      if (!auth.ok) {
        return {
          ok: false,
          error: auth.error || `Could not authenticate ${this._devBypassEmail}`,
        };
      }
      bearer = auth.token;
    }
    try {
      const res = await this._request('GET', this._url('qrCode'), { bearerToken: bearer });
      const reachable = res.statusCode > 0;
      return {
        ok: reachable && res.statusCode >= 200 && res.statusCode < 300,
        statusCode: res.statusCode,
        message: res.json?.message || (reachable ? 'API reachable' : 'No response'),
      };
    } catch (e) {
      return { ok: false, error: String(e) };
    }
  }
}

module.exports = { KiaApiService };
