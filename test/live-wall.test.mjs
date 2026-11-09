import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import { createLiveApp } from '../src/live/server.js';

test('Shared walls respect moderation, reveal, privacy, revocation and event deletion', async t => {
  const dataDir=fs.mkdtempSync(path.join(os.tmpdir(),'live-wall-'));
  const key='test-admin-key-longer-than-thirty-two-characters';let time=Date.now();
  let live,server,base;
  async function start(){live=createLiveApp({dataDir,adminKey:key,baseUrl:'http://localhost',clock:()=>time});server=live.app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));base=`http://127.0.0.1:${server.address().port}`;}
  async function stop(){await new Promise(r=>server.close(r));live.close();}
  await start();t.after(async()=>{await stop();fs.rmSync(dataDir,{recursive:true,force:true});});
  async function call(url,method='GET',body,cookie='',admin=false){
    const r=await fetch(base+url,{method,headers:{cookie,...(admin?{'X-Live-Admin-Key':key}:{}),...(body&&!(body instanceof FormData)?{'Content-Type':'application/json'}:{})},body:body instanceof FormData?body:body?JSON.stringify(body):undefined});
    return {status:r.status,body:r.headers.get('content-type')?.includes('json')?await r.json():Buffer.from(await r.arrayBuffer()),cookie:r.headers.get('set-cookie')?.split(';')[0],headers:r.headers};
  }
  const invitation=await call('/api/admin/invitations','POST',{email:'owner@example.com'},'',true);
  const owner=(await call('/api/auth/accept','POST',{token:new URLSearchParams(new URL(invitation.body.url).hash.slice(1)).get('access')})).cookie;
  const e=(await call('/api/events','POST',{title:'Wall party',status:'published',moderation:1,reveal:time+1000},owner)).body;
  const controls=`/api/events/${e.slug}/wall`;
  assert.equal((await call(controls)).status,401);
  assert.equal((await call(controls,'GET',undefined,owner)).body.enabled,false);
  assert.equal((await call(controls,'PATCH',{enabled:'yes'},owner)).status,400);
  assert.equal((await call(controls,'PATCH',{config:{columns:100}},owner)).status,400);
  assert.equal((await call(controls,'PATCH',{config:{brandRevealEnabled:'yes'}},owner)).status,400);
  assert.equal((await call(controls,'PATCH',{config:{title:'Wall title',columns:12,completedView:true,overlay:'Welcome',backdropOpacity:0.4,brandText:'Partner',brandRevealEnabled:true,brandRevealSeconds:20,brandRevealHoldSeconds:4}},owner)).status,200);
  const wall=(await call(controls,'PATCH',{enabled:true},owner)).body;
  let token=new URL(wall.url).pathname.split('/')[2];let feed=`/api/wall/${token}`;
  assert.equal((await call(`/wall/${token}`)).status,200);
  assert.match((await call(feed)).headers.get('cache-control'),/no-store/);
  const guest=(await call(`/api/guest/${e.slug}/join`,'POST',{name:'Guest'})).cookie;
  const bytes=await sharp({create:{width:30,height:40,channels:3,background:'red'}}).jpeg().toBuffer();
  const artwork=new FormData();artwork.append('photo',new Blob([bytes]),'brand.jpg');
  assert.equal((await call(controls+'/assets/logo','POST',artwork)).status,401);
  assert.equal((await call(controls+'/assets/logo','POST',artwork,owner)).status,200);
  assert.equal((await call(feed+'/assets/logo')).status,200);
  assert.equal((await call(feed)).body.config.columns,12);
  assert.equal((await call(feed)).body.config.completedView,true);
  const upload=new FormData();upload.append('photo',new Blob([bytes]),'photo.jpg');upload.append('request_id','wall-photo');
  const photo=(await call(`/api/guest/${e.slug}/photos`,'POST',upload,guest)).body;
  let image=`${feed}/photos/${photo.id}/image`;
  assert.equal((await call(image)).status,404);
  await call(`/api/events/${e.slug}/photos/${photo.id}`,'PATCH',{approved:true},owner);
  assert.equal((await call(feed)).body.photos.length,0,'Reveal still hides approved images');
  assert.equal((await call(image)).status,404);
  time+=1000;
  assert.equal((await call(feed)).body.photos.length,1);
  assert.equal((await call(image)).status,200);
  assert.equal((await call(`/api/events/${e.slug}/photos/${photo.id}`,'DELETE')).status,401,'Wall viewers cannot delete photos');
  await call(`/api/events/${e.slug}/photos/${photo.id}`,'PATCH',{approved:false},owner);
  assert.equal((await call(feed)).body.photos.length,0,'Hidden NSFW photo immediately leaves the public feed');
  assert.equal((await call(image)).status,404,'Hidden image cannot be fetched directly');
  await call(`/api/events/${e.slug}/photos/${photo.id}`,'PATCH',{approved:true},owner);
  for(const visibility of ['own','host']){
    await call(`/api/events/${e.slug}`,'PATCH',{visibility},owner);
    assert.equal((await call(feed)).status,404);assert.equal((await call(image)).status,404);
    assert.equal((await call(controls,'PATCH',{enabled:true},owner)).status,400);
  }
  await call(`/api/events/${e.slug}`,'PATCH',{visibility:'all',status:'draft'},owner);
  assert.equal((await call(feed)).status,404);
  await call(`/api/events/${e.slug}`,'PATCH',{status:'closed'},owner);
  assert.equal((await call(image)).status,200,'Closed event retains its revealed gallery');
  await call('/api/admin/features','PATCH',{mosaic:false},'',true);
  assert.equal((await call(feed)).status,403);assert.equal((await call(image)).status,403);
  await call('/api/admin/features','PATCH',{mosaic:true,webApp:false},'',true);
  assert.equal((await call(feed)).status,200,'Wall is independently controlled from the guest web app');
  await call(controls,'PATCH',{enabled:false},owner);assert.equal((await call(feed)).status,404);
  const rotated=(await call(controls,'PATCH',{enabled:true,rotate:true},owner)).body;
  assert.notEqual(rotated.url,wall.url);assert.equal((await call(image)).status,404);
  token=new URL(rotated.url).pathname.split('/')[2];feed=`/api/wall/${token}`;image=`${feed}/photos/${photo.id}/image`;
  await stop();await start();assert.equal((await call(image)).status,200,'Shared link survives restart');assert.equal((await call(feed)).body.config.overlay,'Welcome');assert.equal((await call(feed+'/assets/logo')).status,200);await call(controls+'/assets/logo','DELETE',{},owner);assert.equal((await call(feed+'/assets/logo')).status,404);
  await call(`/api/events/${e.slug}/photos/${photo.id}`,'DELETE',{},owner);
  assert.equal((await call(feed)).body.total,0);assert.equal((await call(image)).status,404);
  await call(`/api/events/${e.slug}`,'DELETE',{},owner);
  assert.equal((await call(feed)).status,404);
  assert.equal(live.db.prepare('SELECT count(*) n FROM live_walls').get().n,0,'Wall removed with event');
});
