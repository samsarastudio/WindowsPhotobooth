'use strict';

const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');
const { URL } = require('url');

const SYNC_INTERVAL_MS = 30_000;

/**
 * Validates booth QR tokens and uploads session photos when online.
 */
class SyncService {
  constructor(queueDir) {
    this._queueDir = queueDir;
    this._queueFile = path.join(queueDir, 'sync-queue.json');
    this._apiBaseUrl = '';
    this._validatePath = '/api/photobooth/validate-token';
    this._uploadPath = '/api/kia/photobooth/upload';
    this._boothId = '';
    this._timer = null;
    this._processing = false;
  }

  configure({ apiBaseUrl, validatePath, uploadPath, boothId }) {
    this._apiBaseUrl = String(apiBaseUrl || '').trim().replace(/\/$/, '');
    this._validatePath = String(validatePath || '/api/photobooth/validate-token');
    this._uploadPath = String(uploadPath || '/api/kia/photobooth/upload');
    this._boothId = String(boothId || '').trim();
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

  _readQueue() {
    try {
      if (!fs.existsSync(this._queueFile)) return [];
      const raw = JSON.parse(fs.readFileSync(this._queueFile, 'utf8'));
      return Array.isArray(raw) ? raw : [];
    } catch (_) {
      return [];
    }
  }

  _writeQueue(items) {
    fs.mkdirSync(this._queueDir, { recursive: true });
    fs.writeFileSync(this._queueFile, JSON.stringify(items, null, 2), 'utf8');
  }

  enqueueSession(entry) {
    const token = entry && typeof entry.token === 'string' ? entry.token.trim() : '';
    const photos = Array.isArray(entry?.photos) ? entry.photos.filter((p) => typeof p === 'string') : [];
    if (!token || photos.length === 0) {
      return { ok: false, error: 'Missing token or photos' };
    }
    const queue = this._readQueue();
    queue.push({
      id: `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      token,
      photos,
      boothId: this._boothId,
      enqueuedAt: new Date().toISOString(),
      attempts: 0,
    });
    this._writeQueue(queue);
    void this.processQueue();
    return { ok: true };
  }

  _requestJson(method, urlStr, body) {
    return new Promise((resolve, reject) => {
      let url;
      try {
        url = new URL(urlStr);
      } catch (e) {
        reject(e);
        return;
      }
      const payload = body ? JSON.stringify(body) : '';
      const lib = url.protocol === 'https:' ? https : http;
      const req = lib.request(
        {
          method,
          hostname: url.hostname,
          port: url.port || (url.protocol === 'https:' ? 443 : 80),
          path: url.pathname + url.search,
          headers: {
            'Content-Type': 'application/json',
            Accept: 'application/json',
            ...(payload ? { 'Content-Length': Buffer.byteLength(payload) } : {}),
          },
          timeout: 15000,
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
            resolve({ statusCode: res.statusCode || 0, json, body: data });
          });
        },
      );
      req.on('error', reject);
      req.on('timeout', () => {
        req.destroy(new Error('Request timeout'));
      });
      if (payload) req.write(payload);
      req.end();
    });
  }

  async validateToken(token) {
    const t = String(token || '').trim();
    if (!t) return { ok: false, valid: false, error: 'Empty token' };
    if (!this._apiBaseUrl) {
      return { ok: true, valid: true, offline: true };
    }
    const url = `${this._apiBaseUrl}${this._validatePath.startsWith('/') ? '' : '/'}${this._validatePath}`;
    try {
      const res = await this._requestJson('POST', url, {
        token: t,
        boothId: this._boothId || undefined,
      });
      const ok = res.statusCode >= 200 && res.statusCode < 300;
      const valid =
        ok &&
        (res.json?.valid === true ||
          res.json?.success === true ||
          res.json?.ok === true);
      return {
        ok: true,
        valid,
        statusCode: res.statusCode,
        message: res.json?.message || res.json?.error || null,
        offline: false,
      };
    } catch (e) {
      return { ok: false, valid: false, error: String(e), offline: true };
    }
  }

  async processQueue() {
    if (this._processing || !this._apiBaseUrl) return;
    const queue = this._readQueue();
    if (queue.length === 0) return;

    this._processing = true;
    const remaining = [];

    try {
      for (const item of queue) {
        const uploaded = await this._uploadItem(item);
        if (!uploaded) {
          item.attempts = (item.attempts || 0) + 1;
          remaining.push(item);
        }
      }
      this._writeQueue(remaining);
    } finally {
      this._processing = false;
    }
  }

  async _uploadItem(item) {
    const url = `${this._apiBaseUrl}${this._uploadPath.startsWith('/') ? '' : '/'}${this._uploadPath}`;
    try {
      const res = await this._requestJson('POST', url, {
        token: item.token,
        boothId: item.boothId || this._boothId || undefined,
        photos: item.photos,
      });
      return res.statusCode >= 200 && res.statusCode < 300;
    } catch (_) {
      return false;
    }
  }
}

module.exports = { SyncService };
