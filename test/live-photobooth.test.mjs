import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import sharp from 'sharp';
import {createLiveApp} from '../src/live/server.js';

test('Optional photobooth connection imports JPGs once, respects moderation and rejects foreign media',async t=>{
  const dataDir=fs.mkdtempSync(path.join(os.tmpdir(),'live-booth-')),key='booth-test-administrator-key-32-characters';
  const bytes=await sharp({create:{width:2800,height:1600,channels:3,background:'gold'}}).png().toBuffer();
  let available=true,photos=[{id:'capture-1',url:'/media/booth/one.png',variant:'framed',processStatus:'ready'}];
  const source=http.createServer((req,res)=>{
    if(!available){res.writeHead(503);return res.end();}
    if(req.url==='/media/booth/one.png'){res.setHeader('Content-Type','image/png');return res.end(bytes);}
    res.setHeader('Content-Type','application/json');
    if(req.url==='/api/wall')return res.end(JSON.stringify({ok:true,sessions:[{slug:'booth',title:'Reception booth'}]}));
    if(req.url==='/api/sessions/booth')return res.end(JSON.stringify({ok:true,session:{slug:'booth',photos}}));
    res.writeHead(404);res.end('{}');
  }).listen(0,'127.0.0.1');await new Promise(r=>source.once('listening',r));
  const galleryUrl=`http://127.0.0.1:${source.address().port}`;
  let live=createLiveApp({dataDir,adminKey:key,baseUrl:'http://localhost',galleryUrl}),server=live.app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));let base=`http://127.0.0.1:${server.address().port}`;
  t.after(async()=>{await new Promise(r=>server.close(r));live.close();await new Promise(r=>source.close(r));fs.rmSync(dataDir,{recursive:true,force:true});});
  async function call(url,method='GET',body,cookie='',admin=false){const r=await fetch(base+url,{method,headers:{cookie,...(admin?{'X-Live-Admin-Key':key}:{}),...(body?{'Content-Type':'application/json'}:{})},body:body?JSON.stringify(body):undefined});return {status:r.status,body:await r.json(),cookie:r.headers.get('set-cookie')?.split(';')[0]};}
  const invite=(await call('/api/admin/invitations','POST',{email:'booth@example.com'},'',true)).body;
  const owner=(await call('/api/auth/accept','POST',{token:new URLSearchParams(new URL(invite.url).hash.slice(1)).get('access')})).cookie;
  const e=(await call('/api/events','POST',{title:'Reception',status:'published',moderation:1},owner)).body;
  const endpoint=`/api/admin/events/${e.slug}/photobooth`;
  assert.equal((await call('/api/admin/photobooth')).status,401);
  assert.equal((await call(endpoint,'PUT',{slug:'booth'},owner)).status,401);
  assert.equal((await call(endpoint,'PUT',{slug:'unknown'},'',true)).status,400);
  assert.equal((await call('/api/admin/photobooth','GET',null,'',true)).body.available,true);
  assert.equal((await call(endpoint,'PUT',{slug:'booth'},'',true)).body.imported,1);
  const p=live.db.prepare('SELECT * FROM photos WHERE event=?').get(e.id);assert.equal(p.approved,0);
  const meta=await sharp(path.join(dataDir,'photos',p.filename)).metadata();assert.equal(meta.format,'jpeg');assert.equal(meta.width,2400);
  assert.equal((await call(endpoint+'/sync','POST',{},'',true)).body.imported,0);
  const wall=(await call(`/api/events/${e.slug}/wall`,'PATCH',{enabled:true},owner)).body;
  const feed='/api/wall/'+new URL(wall.url).pathname.split('/')[2];
  assert.equal((await call(feed)).body.photos.length,0);
  assert.equal((await call(`/api/events/${e.slug}/print/album/preview`,'GET',null,owner)).status,400);
  await call(`/api/events/${e.slug}/photos/${p.id}`,'PATCH',{approved:true},owner);
  assert.equal((await call(feed)).body.photos.length,1);
  assert.equal((await call(`/api/events/${e.slug}/print/album/preview`,'GET',null,owner)).body.included,1);
  await call(`/api/events/${e.slug}/photos/${p.id}`,'DELETE',{},owner);
  assert.equal((await call(endpoint+'/sync','POST',{},'',true)).body.imported,0);
  assert.equal(live.db.prepare('SELECT count(*) n FROM photos').get().n,0);
  assert.equal(live.db.prepare('SELECT photo FROM live_booth_imports').get().photo,null);
  photos.push({id:'foreign',url:'http://example.com/photo.jpg'});
  assert.equal((await call(endpoint+'/sync','POST',{},'',true)).status,502);
  photos.pop();available=false;
  assert.equal((await call('/api/admin/photobooth','GET',null,'',true)).body.available,false);
  assert.equal((await call(endpoint+'/sync','POST',{},'',true)).status,502);
  available=true;
  await call('/api/admin/features','PATCH',{photoboothGallery:false},'',true);
  assert.equal((await call(endpoint+'/sync','POST',{},'',true)).status,503);
  await call('/api/admin/features','PATCH',{photoboothGallery:true},'',true);
  await call(endpoint,'DELETE',{},'',true);
  assert.equal((await call(endpoint+'/sync','POST',{},'',true)).status,400);
  await call(endpoint,'PUT',{slug:'booth'},'',true);
  assert.equal(live.db.prepare('SELECT count(*) n FROM photos').get().n,0);
  await new Promise(r=>server.close(r));live.close();
  live=createLiveApp({dataDir,adminKey:key,baseUrl:'http://localhost',galleryUrl:''});server=live.app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));base=`http://127.0.0.1:${server.address().port}`;
  assert.equal((await call('/api/admin/photobooth','GET',null,'',true)).body.configured,false);
  assert.equal((await call(endpoint+'/sync','POST',{},'',true)).status,503);
});
