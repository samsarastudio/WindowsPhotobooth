import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import sharp from 'sharp';import {createLiveApp} from '../src/live/server.js';
test('Shared saved albums update and export with release and privacy checks',async t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'final-gallery-')),key='final-gallery-test-key-at-least-32-characters';const live=createLiveApp({dataDir:dir,adminKey:key,baseUrl:'http://localhost'}),server=live.app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));const base=`http://127.0.0.1:${server.address().port}`;
 t.after(async()=>{await new Promise(r=>server.close(r));live.close();fs.rmSync(dir,{recursive:true,force:true});});
 async function call(url,method='GET',body,cookie='',admin=false){const r=await fetch(base+url,{method,headers:{cookie,...(admin?{'X-Live-Admin-Key':key}:{}),...(body?{'Content-Type':'application/json'}:{})},body:body?JSON.stringify(body):undefined});return {status:r.status,body:r.headers.get('content-type')?.includes('json')?await r.json():Buffer.from(await r.arrayBuffer()),cookie:r.headers.get('set-cookie')?.split(';')[0],cache:r.headers.get('cache-control')};}
 async function owner(email){const i=(await call('/api/admin/invitations','POST',{email},'',true)).body;return (await call('/api/auth/accept','POST',{token:new URLSearchParams(new URL(i.url).hash.slice(1)).get('access')})).cookie;}
 const cookie=await owner('release@example.com'),other=await owner('other@example.com');const e=(await call('/api/events','POST',{title:'Final gallery',status:'published'},cookie)).body;const host=`/api/events/${e.slug}/final-gallery`,pub=`/api/gallery/${e.slug}`;
 assert.equal((await call(pub)).status,404);assert.equal((await call(host,'PATCH',{released:true})).status,401);assert.equal((await call(host,'PATCH',{released:true},other)).status,404);
 const event=live.db.prepare('SELECT * FROM events WHERE slug=?').get(e.slug);live.db.prepare('INSERT INTO guests(id,event,hash,name,created) VALUES(?,?,?,?,?)').run('guest',event.id,'unique-test-hash','Private guest name',Date.now());
 const img=await sharp({create:{width:300,height:450,channels:3,background:'#487b99'}}).jpeg().toBuffer();fs.writeFileSync(path.join(dir,'photos','sample.jpg'),img);
 for(const [id,approved,visible]of [['yes',1,1],['hidden',0,1],['removed',1,0]])live.db.prepare('INSERT INTO photos(id,event,guest,filename,approved,source_visible,created,request_id) VALUES(?,?,?,?,?,?,?,?)').run(id,event.id,'guest','sample.jpg',approved,visible,Date.now(),id);
 assert.equal((await call('/api/gallery/'+e.slug+'/album')).status,404);
 await call(host,'PATCH',{released:true},cookie);
 const album='/api/gallery/'+e.slug+'/album',design='/api/events/'+e.slug+'/print';
 assert.equal((await call('/album/'+e.slug)).status,200);
 let view=await call(album);assert.equal(view.status,200);const revision=view.body.revision;
 assert.ok(!JSON.stringify(view.body).includes('/api/guest/'));assert.ok(!JSON.stringify(view.body).includes('/api/events/'));
 const first=await call(album+'/export');assert.ok([200,202].includes(first.status));
 async function ready(){for(let i=0;i<100;i++){const r=await call(album+'/export');assert.ok([200,202].includes(r.status),JSON.stringify(r.body));if(r.body.state==='ready')return;await new Promise(r=>setTimeout(r,50));}assert.fail('Export did not finish');}
 await ready();const pdf=await call(album+'/pdf');assert.equal(pdf.status,200);assert.equal(pdf.body.subarray(0,5).toString(),'%PDF-');
 assert.deepEqual((await call(album+'/pdf')).body,pdf.body);
 await call(design,'PATCH',{subtitle:'Our updated saved album',layout:'mosaic'},cookie);
 view=await call(album);assert.notEqual(view.body.revision,revision);assert.ok(JSON.stringify(view.body).includes('Our updated saved album'));
 await ready();assert.notDeepEqual((await call(album+'/pdf')).body,pdf.body);
 await call(host,'PATCH',{released:false},cookie);for(const suffix of ['', '/pdf','/export','/qr','/logo'])assert.equal((await call(album+suffix)).status,404);
 await call(host,'PATCH',{released:true},cookie);
 await call('/api/events/'+e.slug,'PATCH',{visibility:'own'},cookie);assert.equal((await call(album)).status,404);assert.equal((await call(album+'/pdf')).status,404);
 await call('/api/events/'+e.slug,'PATCH',{visibility:'all',status:'closed'},cookie);assert.equal((await call(album)).status,200);
 live.db.prepare('UPDATE photos SET approved=0 WHERE id=?').run('yes');assert.equal((await call(album+'/pdf')).status,400);
 live.db.prepare('UPDATE photos SET approved=1 WHERE id=?').run('yes');
 await call('/api/admin/features','PATCH',{downloads:false},'',true);assert.equal((await call(album+'/pdf')).status,403);assert.equal((await call(album+'/export')).status,403);
 await call('/api/admin/features','PATCH',{downloads:false},'',true);assert.equal((await call(pub+'/photos/yes?download=1')).status,403);assert.equal((await call(pub)).body.downloads,false);
 await call(host,'PATCH',{released:false},cookie);assert.equal((await call(pub)).status,404);assert.equal((await call(pub+'/photos/yes')).status,404);
 assert.equal((await call('/gallery/'+e.slug)).status,200);
});
