import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import express from 'express';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'admin-photo-print-'));
process.env.DATA_DIR = dir;
process.env.ADMIN_PIN = 'test-print-pin';
const { initDb, getDb, closeDb } = await import('../src/db.js');
const { ensureTabletSchema, tabletRouter } = await import('../src/routes/tablet.js');

test('admin queues the exact unframed photo, deduplicates and rejects unfinished photos', async () => {
  initDb(); ensureTabletSchema();
  const db = getDb(), now = new Date().toISOString();
  db.prepare('INSERT INTO sessions(id,slug,title,event_date,created_at,expires_at) VALUES(?,?,?,?,?,?)')
    .run('s', 'admin-print-test', 'Test', now.slice(0,10), now, '2099-01-01');
  for (const [id, variant, state] of [['raw','original','ready'],['scene','magnet-source','ready'],['pending','original','processing'],['failed','original','failed']]) {
    db.prepare('INSERT INTO photos(id,session_id,variant,filename,mime,bytes,source_local_name,created_at,process_status) VALUES(?,?,?,?,?,?,?,?,?)')
      .run(id,'s',variant,id+'.jpg','image/jpeg',100,id+'.jpg',now,state);
  }
  const app = express(); app.use(express.json()); app.use('/api/tablet', tabletRouter);
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const post = (id, pin='test-print-pin') => fetch(`${base}/api/tablet/photos/${id}/print`, {
    method:'POST', headers:{'Content-Type':'application/json','X-Admin-Pin':pin}, body:'{}',
  });
  try {
    assert.equal((await post('raw','wrong')).status,401);
    for (const id of ['raw','scene']) {
      const response = await post(id); assert.equal(response.status,201);
      const { job } = await response.json();
      assert.equal(job.photoId,id); assert.equal(job.layoutMode,null);
      assert(job.mediaUrl.endsWith(`/${id}.jpg`));
      assert.equal((await (await post(id)).json()).deduped,true);
    }
    assert.equal((await post('pending')).status,409);
    assert.equal((await post('failed')).status,409);
    assert.equal(db.prepare('SELECT count(*) n FROM print_jobs').get().n,2);
  } finally {
    await new Promise(resolve => server.close(resolve)); closeDb();
    fs.rmSync(dir,{recursive:true,force:true});
  }
});
