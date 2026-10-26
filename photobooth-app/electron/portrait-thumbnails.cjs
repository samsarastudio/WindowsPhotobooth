const fs = require('fs');
const sharp = require('sharp');
const cache = new Map();
async function thumbnail(file) {
  const stat = await fs.promises.stat(file);
  const key = `${file}:${stat.size}:${stat.mtimeMs}`;
  if (!cache.has(key)) {
    const work = sharp(file).rotate().resize(360, 480, {fit:'contain', background:'#111111'})
      .jpeg({quality:82}).toBuffer().then(bytes => 'data:image/jpeg;base64,' + bytes.toString('base64'));
    cache.set(key, work);
    work.catch(() => cache.delete(key));
    while (cache.size > 32) cache.delete(cache.keys().next().value);
  }
  return cache.get(key);
}
async function portraitThumbnails(ids, resolve) {
  const items = [];
  // Avoid decoding all full-size composition plates simultaneously.
  for (const modeId of ids) {
    try {
      const file = resolve(modeId)?.imagePath;
      items.push({modeId, url: file ? await thumbnail(file) : null});
    } catch { items.push({modeId,url:null}); }
  }
  return {ok:true,items};
}
module.exports = {portraitThumbnails};
