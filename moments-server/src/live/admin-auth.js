import crypto from 'node:crypto';
import { promisify } from 'node:util';

const scrypt = promisify(crypto.scrypt);
const digest = value => crypto.createHash('sha256').update(value).digest('hex');
const fail = (status, message) => Object.assign(new Error(message), { status });
const wrap = fn => (req, res, next) => Promise.resolve().then(() => fn(req, res)).catch(next);

export function adminAuth({ app, db, now, cookie, cookies, limit, adminKey }) {
  db.exec(`CREATE TABLE IF NOT EXISTS administrators(id INTEGER PRIMARY KEY CHECK(id=1),email TEXT NOT NULL,salt TEXT NOT NULL,password TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS admin_sessions(hash TEXT PRIMARY KEY,expires INTEGER NOT NULL);`);
  const account = () => db.prepare('SELECT * FROM administrators WHERE id=1').get();
  const principal = req => {
    const session = db.prepare('SELECT 1 FROM admin_sessions WHERE hash=? AND expires>?').get(digest(cookies(req).live_admin || ''), now());
    const a = session && account();
    return a ? { id: 'administrator', email: a.email, name: 'Administrator', role: 'admin' } : null;
  };
  const validPassword = p => {
    if (typeof p !== 'string' || p.length < 12 || p.length > 256) throw fail(400, 'Use a password between 12 and 256 characters');
  };
  const verify = async (password, a) => {
    const value = typeof password === 'string' && password.length <= 256 ? password : '';
    const computed = await scrypt(value, a?.salt || 'unconfigured-administrator', 64);
    return Boolean(a) && crypto.timingSafeEqual(computed, Buffer.from(a.password, 'hex'));
  };
  const issue = res => {
    const raw = crypto.randomBytes(32).toString('base64url');
    db.prepare('DELETE FROM admin_sessions WHERE expires<=?').run(now());
    db.prepare('INSERT INTO admin_sessions VALUES(?,?)').run(digest(raw), now() + 7 * 86400000);
    cookie(res, 'live_admin', raw, 7 * 86400);
  };
  app.get('/api/admin/auth', wrap((req, res) => res.json({ configured: Boolean(account()), admin: principal(req) })));
  for (const mode of ['setup', 'recover']) app.post(`/api/admin/auth/${mode}`, wrap(async (req, res) => {
    limit(req, 'admin-auth', 10);
    const key = typeof req.body.key === 'string' ? req.body.key : '';
    if (!crypto.timingSafeEqual(Buffer.from(digest(key)), Buffer.from(digest(adminKey)))) throw fail(401, 'Administrator setup key is incorrect');
    if (mode === 'setup' && account()) throw fail(409, 'Administrator login is already configured');
    const email = String(req.body.email || '').trim().toLowerCase();
    if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw fail(400, 'Enter a valid email address');
    validPassword(req.body.password);
    const salt = crypto.randomBytes(32).toString('hex');
    const password = (await scrypt(req.body.password, salt, 64)).toString('hex');
    db.transaction(() => {
      if (mode === 'setup' && account()) throw fail(409, 'Administrator login is already configured');
      db.prepare('INSERT OR REPLACE INTO administrators VALUES(1,?,?,?)').run(email, salt, password);
      db.prepare('DELETE FROM admin_sessions').run();
    })();
    issue(res); res.json({ ok: true });
  }));
  app.post('/api/admin/auth/login', wrap(async (req, res) => {
    limit(req, 'admin-auth', 10);
    const a = account();
    const correct = await verify(req.body.password, a);
    if (!correct || String(req.body.email || '').trim().toLowerCase() !== a.email || account()?.password !== a.password) throw fail(401, 'Email or password is incorrect');
    issue(res); res.json({ ok: true });
  }));
  app.post('/api/admin/auth/password', wrap(async (req, res) => {
    limit(req, 'admin-auth', 10);
    if (!principal(req)) throw fail(401, 'Administrator sign-in required');
    const a = account();
    if (!await verify(req.body.current_password, a)) throw fail(401, 'Current password is incorrect');
    validPassword(req.body.password);
    const salt = crypto.randomBytes(32).toString('hex');
    const password = (await scrypt(req.body.password, salt, 64)).toString('hex');
    db.transaction(() => {
      if (!principal(req) || account().password !== a.password) throw fail(401, 'Sign in again before changing the password');
      db.prepare('UPDATE administrators SET salt=?,password=? WHERE id=1').run(salt, password);
      db.prepare('DELETE FROM admin_sessions').run();
    })();
    issue(res); res.json({ ok: true });
  }));
  app.post('/api/admin/auth/logout', wrap((req, res) => {
    db.prepare('DELETE FROM admin_sessions WHERE hash=?').run(digest(cookies(req).live_admin || ''));
    cookie(res, 'live_admin', '', 0); res.json({ ok: true });
  }));
  return principal;
}
