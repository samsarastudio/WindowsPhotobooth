import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import express from 'express';import sharp from 'sharp';
sharp.cache(false);
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'gallery-types-'));process.env.DATA_DIR=dir;
const {initDb,getDb,closeDb,saveSettings}=await import('../src/db.js');const {sessionsRouter}=await import('../src/routes/sessions.js');
test('Gallery type selection preserves legacy deduplication and original-photo visibility',async()=>{
 initDb();const db=getDb(),now=new Date().toISOString();db.prepare('INSERT INTO sessions(id,slug,title,event_date,created_at,expires_at) VALUES(?,?,?,?,?,?)').run('s','types','Types','2026-11-09',now,'2099-01-01');
 const folder=path.join(dir,'photos','types');fs.mkdirSync(folder,{recursive:true});
 for(const variant of ['original','framed','ai','physical']){await sharp({create:{width:30,height:20,channels:3,background:'gold'}}).jpeg().toFile(path.join(folder,variant+'.jpg'));db.prepare('INSERT INTO photos(id,session_id,variant,filename,mime,bytes,source_local_name,created_at,process_status) VALUES(?,?,?,?,?,?,?,?,?)').run(variant,'s',variant,variant+'.jpg','image/jpeg',100,'same-capture.jpg',now,'ready');}
 const app=express();app.use('/api/sessions',sessionsRouter);const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));const base=`http://127.0.0.1:${server.address().port}/api/sessions/types`;
 try{const read=async q=>(await (await fetch(base+q)).json()).session.photos.map(p=>p.variant);
 assert.deepEqual(new Set(await read('')),new Set(['framed','ai']));assert.deepEqual(await read('?variants=framed'),['framed']);assert.deepEqual(await read('?variants=original'),['original']);
 assert.equal((await fetch(base+'?variants=physical')).status,400);saveSettings({showOriginalPhotos:false});assert.deepEqual(await read('?variants=original'),[]);
 db.prepare("UPDATE sessions SET expires_at='2000-01-01' WHERE id='s'").run();assert.equal((await fetch(base+'?variants=framed')).status,410);
 }finally{await new Promise(r=>server.close(r));await new Promise(r=>setTimeout(r,100));closeDb();fs.rmSync(dir,{recursive:true,force:true,maxRetries:5,retryDelay:100});}
});
