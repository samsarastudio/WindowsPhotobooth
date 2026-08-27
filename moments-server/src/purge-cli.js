import { purgeExpiredSessions, purgeMissingPhotoFiles } from './purge.js';
import { initDb } from './db.js';

initDb();
const expired = purgeExpiredSessions();
const missing = purgeMissingPhotoFiles();
console.log(
  JSON.stringify(
    { ok: true, ...expired, missingFilesRemoved: missing.photosRemoved },
    null,
    2,
  ),
);
