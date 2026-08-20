import fs from 'node:fs';
import path from 'node:path';
import selfsigned from 'selfsigned';
import { config } from './config.js';

/**
 * Ensure a self-signed cert exists for LAN HTTPS (phone camera requires secure context).
 * @param {string[]} hosts  e.g. ['10.0.0.140', 'localhost']
 */
export async function ensureHttpsCerts(hosts = []) {
  const dir = path.join(config.dataDir, 'certs');
  fs.mkdirSync(dir, { recursive: true });
  const keyPath = path.join(dir, 'dev-key.pem');
  const certPath = path.join(dir, 'dev-cert.pem');

  const names = [...new Set(['localhost', '127.0.0.1', ...hosts.filter(Boolean)])];

  if (fs.existsSync(keyPath) && fs.existsSync(certPath)) {
    return { key: fs.readFileSync(keyPath), cert: fs.readFileSync(certPath), keyPath, certPath };
  }

  const attrs = [{ name: 'commonName', value: names[0] || 'localhost' }];
  const altNames = names.flatMap((h) => {
    if (/^\d+\.\d+\.\d+\.\d+$/.test(h)) {
      return [{ type: 7, ip: h }];
    }
    return [{ type: 2, value: h }];
  });

  const pems = await selfsigned.generate(attrs, {
    days: 825,
    keySize: 2048,
    algorithm: 'sha256',
    extensions: [
      { name: 'basicConstraints', cA: true },
      {
        name: 'subjectAltName',
        altNames: altNames.length ? altNames : [{ type: 2, value: 'localhost' }],
      },
    ],
  });

  const key = pems.private || pems.key;
  const cert = pems.cert;
  if (!key || !cert) {
    throw new Error('selfsigned.generate did not return key/cert');
  }

  fs.writeFileSync(keyPath, key);
  fs.writeFileSync(certPath, cert);
  console.log(`[moments] wrote LAN HTTPS cert → ${certPath}`);
  return { key: Buffer.from(key), cert: Buffer.from(cert), keyPath, certPath };
}
