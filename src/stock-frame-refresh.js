import fs from 'node:fs';import path from 'node:path';import {createHash} from 'node:crypto';
// Replace only known stock revisions; never overwrite custom or deleted frames.
function refreshStockFrames(source, destination) {
  const previous = {
  "screampark-logo-halloween-2026-slim.png": "61079e1b200eba8bc92aa0ed13e30f4566b5b616497c85ee056e78f1c974fca7",
  "screampark-logo-halloween-2026-slim-portrait.png": "78391c171b6d6ffdfc20958c0c9e53b50a04c94c74e34efd9e70f5a3a55583f4"
};
  for (const [name, hash] of Object.entries(previous)) {
    const from = path.join(source, name), to = path.join(destination, name);
    if (!fs.existsSync(from) || !fs.existsSync(to)) continue;
    if (createHash('sha256').update(fs.readFileSync(to)).digest('hex') !== hash) continue;
    const backup = path.join(destination, '.stock-backup-1.1.54');
    fs.mkdirSync(backup, { recursive: true });
    if (!fs.existsSync(path.join(backup, name))) fs.copyFileSync(to, path.join(backup, name));
    fs.copyFileSync(from, to);
  }
}
export {refreshStockFrames};
