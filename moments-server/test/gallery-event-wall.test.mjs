import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import express from 'express';
import sharp from 'sharp';
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'event-gallery-wall-'));process.env.DATA_DIR=dir;process.env.UPLOAD_TOKEN='scoped-test-token';
const {initDb,getDb,closeDb}=await import('../src/db.js');
const {sessionsRouter}=await import('../src/routes/sessions.js');
const {wallRouter}=await import('../src/routes/wall.js');
test('Real Gallery endpoints isolate two event walls from each other and the global wall',async()=>{
 initDb();const db=getDb(),now=new Date().toISOString();
 for(const slug of ['a','b']){db.prepare('INSERT INTO sessions(id,slug,title,event_date,created_at,expires_at) VALUES(?,?,?,?,?,?)').run(slug,slug,'Event '+slug,'2026-11-21',now,'2099-01-01');db.prepare('INSERT INTO photos(id,session_id,variant,filename,mime,bytes,source_local_name,created_at,process_status) VALUES(?,?,?,?,?,?,?,?,?)').run('booth-'+slug,slug,'framed','booth.jpg','image/jpeg',100,'booth-'+slug+'.jpg',now,'ready');}
 const app=express();app.use(express.json());app.use('/api/sessions',sessionsRouter);app.use('/api/wall',wallRouter);
 const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));const base='http://127.0.0.1:'+server.address().port,headers={Authorization:'Bearer scoped-test-token'};
 const snapshot=async(slug,ids)=>fetch(base+'/api/wall/live/source-'+slug,{method:'PUT',headers:{...headers,'Content-Type':'application/json'},body:JSON.stringify({sessionSlug:slug,sessionId:slug,ids})});
 try{
  const bytes=await sharp({create:{width:200,height:300,channels:3,background:'gold'}}).jpeg().toBuffer();
  for(const slug of ['a','b']){assert.equal((await snapshot(slug,['phone'])).status,200);const form=new FormData();form.append('photo',new Blob([bytes]),'phone.jpg');assert.equal((await fetch(base+'/api/wall/live/source-'+slug+'/photos/phone',{method:'POST',headers,body:form})).status,200);}
  const read=async route=>(await(await fetch(base+route)).json());
  assert.deepEqual((await read('/api/sessions/a?wall=1')).session.photos.map(p=>p.id),['booth-a','live-source-a-phone']);
  assert.deepEqual((await read('/api/sessions/b?wall=1')).session.photos.map(p=>p.id),['booth-b','live-source-b-phone']);
  assert.deepEqual((await read('/api/sessions/a')).session.photos.map(p=>p.id),['booth-a']);
  assert.deepEqual(new Set((await read('/api/wall')).photos.map(p=>p.id)),new Set(['booth-a','booth-b']));
  await snapshot('a',[]);
  assert.deepEqual((await read('/api/sessions/a?wall=1')).session.photos.map(p=>p.id),['booth-a']);
  assert.equal((await read('/api/sessions/b?wall=1')).session.photos.length,2);
  assert.equal((await fetch(base+'/api/wall/live/source-a/photos/phone')).status,404);
  db.prepare("UPDATE sessions SET expires_at='2000-01-01' WHERE id='b'").run();
  assert.equal((await fetch(base+'/api/sessions/b?wall=1')).status,410);
  assert.equal((await fetch(base+'/api/wall/live/source-b/photos/phone')).status,404);
 }finally{await new Promise(r=>server.close(r));await new Promise(r=>setTimeout(r,100));closeDb();fs.rmSync(dir,{recursive:true,force:true,maxRetries:5,retryDelay:100});}
});
