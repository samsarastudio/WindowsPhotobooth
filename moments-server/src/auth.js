import { config } from './config.js';

export function requireUploadToken(req, res, next) {
  if (!config.uploadToken) {
    return res.status(503).json({ ok: false, error: 'UPLOAD_TOKEN not configured on server' });
  }
  const header = req.get('authorization') || '';
  const bearer = header.toLowerCase().startsWith('bearer ')
    ? header.slice(7).trim()
    : '';
  const token = bearer || req.get('x-moments-token') || '';
  if (token !== config.uploadToken) {
    return res.status(401).json({ ok: false, error: 'Invalid upload token' });
  }
  return next();
}

export function requireAdminPin(req, res, next) {
  const pin = req.get('x-admin-pin') || req.body?.pin || '';
  if (!pin || pin !== config.adminPin) {
    return res.status(401).json({ ok: false, error: 'Invalid admin PIN' });
  }
  return next();
}
