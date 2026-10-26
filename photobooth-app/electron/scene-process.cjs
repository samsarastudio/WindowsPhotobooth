'use strict';
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
let tail = Promise.resolve();
function prepareSceneIsolated(source, background, modelDir, fork) {
  const job = tail.then(() => run(source, background, modelDir, fork));
  tail = job.catch(() => undefined);
  return job;
}
async function run(source, background, modelDir, fork) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pb-scene-worker-'));
  const request = path.join(dir, 'request.json');
  fs.writeFileSync(request, JSON.stringify({ source, background, modelDir, dir }));
  try {
    await new Promise((resolve, reject) => {
      const child = fork(path.join(__dirname, 'scene-worker.cjs'), [request]);
      const timeout = setTimeout(() => { child.kill(); reject(new Error('Background processing timed out. Please retake the photo.')); }, 120000);
      child.once('error', () => { clearTimeout(timeout); reject(new Error('Background processor could not start.')); });
      child.once('exit', code => {
        clearTimeout(timeout);
        let result;
        try { result = JSON.parse(fs.readFileSync(path.join(dir, 'result.json'), 'utf8')); } catch {}
        if (code !== 0 || !result?.ok) reject(new Error(result?.error || 'Background processor stopped. Please retake the photo.'));
        else resolve();
      });
    });
    const metadata = JSON.parse(fs.readFileSync(path.join(dir, 'result.json'), 'utf8'));
    return { image: fs.readFileSync(path.join(dir, 'image.png')), reference: fs.readFileSync(path.join(dir, 'reference.png')), strictScene: true, model: 'birefnet-lite', depth: metadata.depth, width:1536, height:1024 };
  } finally {
    fs.rmSync(dir, {recursive:true, force:true});
  }
}
module.exports = { prepareSceneIsolated };
