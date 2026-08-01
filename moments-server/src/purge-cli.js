import { purgeExpiredSessions } from './purge.js';
import { initDb } from './db.js';

initDb();
const result = purgeExpiredSessions();
console.log(JSON.stringify({ ok: true, ...result }, null, 2));
