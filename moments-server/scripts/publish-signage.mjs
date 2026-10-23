import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = path.resolve(process.argv[2] || path.join(root, '../output/signage/current-app'));
const dest = path.join(root, 'public/assets/signage');
const validation = JSON.parse(fs.readFileSync(path.join(source, 'video-validation.json'), 'utf8'));
fs.mkdirSync(dest, { recursive: true });
const manifest = {};
for (const layout of ['portrait', 'landscape']) {
  if (validation[layout]?.decode !== 'passed') throw Error(`Validate ${layout} before publishing`);
  const data = fs.readFileSync(path.join(source, `halloween-${layout}.mp4`));
  const version = crypto.createHash('sha256').update(data).digest('hex');
  const name = `${layout}-${version.slice(0, 16)}.mp4`;
  fs.writeFileSync(path.join(dest, name), data);
  manifest[layout] = { version, url: `/assets/signage/${name}`, bytes: data.length, ...validation[layout] };
}
fs.writeFileSync(path.join(dest, 'manifest.json.tmp'), JSON.stringify(manifest, null, 2));
fs.renameSync(path.join(dest, 'manifest.json.tmp'), path.join(dest, 'manifest.json'));
console.log('Published validated portrait and landscape signage assets.');
