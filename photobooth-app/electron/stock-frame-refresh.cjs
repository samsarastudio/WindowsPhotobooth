const fs=require('fs'),path=require('path');const {createHash}=require('crypto');
// Replace only known stock revisions; never overwrite custom or deleted frames.
function refreshStockFrames(source, destination) {
  const previous = {
  "screampark-logo-halloween-2026-slim.png": [
    "61079e1b200eba8bc92aa0ed13e30f4566b5b616497c85ee056e78f1c974fca7",
    "f93374ff5ca109bb9ea827123b23e405175102eeea2288a31f6a45eab021b6bd",
    "b46b3830510147879188a320ecf127d428f2b4fd558d88440e5c2ab2c0199b75"
  ],
  "screampark-logo-halloween-2026-slim-portrait.png": [
    "78391c171b6d6ffdfc20958c0c9e53b50a04c94c74e34efd9e70f5a3a55583f4",
    "fe5d86f74ce2c9884006eba24228df1a67ecdb6b88b81c736d51ced87c402ecc",
    "c42e161dd17343e99ae9a2c53a1076d677d16dd5c2c988c967997f9623e4b342"
  ]
};
  for (const [name, hashes] of Object.entries(previous)) {
    const from = path.join(source, name), to = path.join(destination, name);
    if (!fs.existsSync(from) || !fs.existsSync(to)) continue;
    if (!hashes.includes(createHash('sha256').update(fs.readFileSync(to)).digest('hex'))) continue;
    const backup = path.join(destination, '.stock-backup-1.1.54');
    fs.mkdirSync(backup, { recursive: true });
    if (!fs.existsSync(path.join(backup, name))) fs.copyFileSync(to, path.join(backup, name));
    fs.copyFileSync(from, to);
  }
}
module.exports={refreshStockFrames};
