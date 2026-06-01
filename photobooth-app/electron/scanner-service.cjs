'use strict';

const { SerialPort } = require('serialport');
const { ReadlineParser } = require('@serialport/parser-readline');

const DUPLICATE_COOLDOWN_MS = 3000;
const RECONNECT_DELAY_MS = 5000;

/**
 * GFS4400 USB-COM scanner (presentation / object sense).
 * Reads line-delimited codes (CR suffix from scanner config).
 */
class ScannerService {
  constructor() {
    this._port = null;
    this._parser = null;
    this._status = 'disconnected';
    this._lastCode = '';
    this._lastCodeTime = 0;
    this._reconnectTimer = null;
    this._portPath = '';
    this._baudRate = 9600;
    this._autoReconnect = true;
    this._onCode = null;
    this._onStatus = null;
    this._onError = null;
  }

  setListeners({ onCode, onStatus, onError }) {
    this._onCode = onCode || null;
    this._onStatus = onStatus || null;
    this._onError = onError || null;
  }

  getStatus() {
    return this._status;
  }

  getLastCode() {
    return this._lastCode;
  }

  async listPorts() {
    try {
      const ports = await SerialPort.list();
      return ports.map((p) => ({
        path: p.path,
        manufacturer: p.manufacturer || '',
        vendorId: p.vendorId || '',
        productId: p.productId || '',
        friendlyName: p.friendlyName || '',
      }));
    } catch (err) {
      console.error('[scanner] listPorts error:', err.message);
      return [];
    }
  }

  async open(portPath, baudRate) {
    if (this._port && this._port.isOpen) {
      await this.close(false);
    }

    this._portPath = portPath;
    this._baudRate = baudRate || 9600;
    this._autoReconnect = true;
    this._clearReconnectTimer();
    this._setStatus('connecting');

    return new Promise((resolve) => {
      try {
        this._port = new SerialPort({
          path: portPath,
          baudRate: this._baudRate,
          dataBits: 8,
          parity: 'none',
          stopBits: 1,
          autoOpen: false,
        });
      } catch (err) {
        this._setStatus('error');
        if (this._onError) this._onError(err.message);
        resolve({ ok: false, error: err.message, status: 'error' });
        return;
      }

      this._parser = this._port.pipe(new ReadlineParser({ delimiter: '\r' }));

      this._parser.on('data', (line) => {
        const code = String(line).trim();
        if (!code) return;

        const now = Date.now();
        if (code === this._lastCode && now - this._lastCodeTime < DUPLICATE_COOLDOWN_MS) {
          return;
        }

        this._lastCode = code;
        this._lastCodeTime = now;
        if (this._onCode) this._onCode(code);
      });

      this._port.on('open', () => {
        this._setStatus('connected');
        console.log('[scanner] Port opened:', portPath);
      });

      this._port.on('close', () => {
        this._setStatus('disconnected');
        console.log('[scanner] Port closed:', portPath);
        this._scheduleReconnect();
      });

      this._port.on('error', (err) => {
        this._setStatus('error');
        console.error('[scanner] Port error:', err.message);
        if (this._onError) this._onError(err.message);
        this._scheduleReconnect();
      });

      this._port.open((err) => {
        if (err) {
          this._setStatus('error');
          console.error('[scanner] Open failed:', err.message);
          if (this._onError) this._onError(err.message);
          this._scheduleReconnect();
          resolve({ ok: false, error: err.message, status: 'error' });
          return;
        }
        resolve({ ok: true, status: 'connected' });
      });
    });
  }

  close(disableReconnect = true) {
    if (disableReconnect) {
      this._autoReconnect = false;
    }
    this._clearReconnectTimer();

    return new Promise((resolve) => {
      if (!this._port) {
        this._setStatus('disconnected');
        resolve({ ok: true, status: 'disconnected' });
        return;
      }

      const port = this._port;
      this._port = null;
      this._parser = null;

      if (port.isOpen) {
        port.close((err) => {
          this._setStatus('disconnected');
          resolve({ ok: !err, error: err ? err.message : undefined, status: 'disconnected' });
        });
      } else {
        this._setStatus('disconnected');
        resolve({ ok: true, status: 'disconnected' });
      }
    });
  }

  _setStatus(status) {
    this._status = status;
    if (this._onStatus) this._onStatus(status);
  }

  _clearReconnectTimer() {
    if (this._reconnectTimer) {
      clearTimeout(this._reconnectTimer);
      this._reconnectTimer = null;
    }
  }

  _scheduleReconnect() {
    if (!this._autoReconnect || !this._portPath) return;
    this._clearReconnectTimer();
    this._reconnectTimer = setTimeout(() => {
      this._reconnectTimer = null;
      if (this._autoReconnect && this._portPath) {
        console.log('[scanner] Attempting reconnect to', this._portPath);
        void this.open(this._portPath, this._baudRate);
      }
    }, RECONNECT_DELAY_MS);
  }
}

module.exports = { ScannerService };
