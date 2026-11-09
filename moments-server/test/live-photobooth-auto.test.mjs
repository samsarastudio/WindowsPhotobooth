import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import http from 'node:http';import sharp from 'sharp';import {createLiveApp} from '../src/live/server.js';
test('Background sync keeps importing later captures, survives broken files and restarts, and stops on removal',async t=>{
 const dataDir=fs.mkdtempSync(path.join(os.tmpdir(),'live-auto-booth-')),key='auto-sync-test-admin-key-at-least-32-characters';
 const bytes=await sharp({create:{width:60,height:40,channels:3,background:'gold'}}).jpeg().toBuffer();let photos=[],offline=false;let calls=0;
 const photo=(id,extra={})=>({id,variant:'framed',processStatus:'ready',url:'/media/booth/'+id+'.jpg',...extra});
 const source=http.createServer((req,res)=>{if(offline){res.writeHead(503);return res.end();}if(req.url.startsWith('/media/booth/')){if(req.url.includes('broken')){res.writeHead(404);return res.end();}return res.end(bytes);}res.setHeader('Content-Type','application/json');if(req.url==='/api/wall')return res.end(JSON.stringify({ok:true,sessions:[{slug:'booth',title:'Booth'}]}));calls++;assert.match(req.url,/_live=/);assert.match(req.headers['cache-control'],/no-cache/);res.end(JSON.stringify({ok:true,session:{slug:'booth',photos}}));}).listen(0,'127.0.0.1');await new Promise(r=>source.once('listening',r));
 let live,server,base,cookie='';const galleryUrl=`http://127.0.0.1:${source.address().port}`;
 async function start(){live=createLiveApp({dataDir,adminKey:key,baseUrl:'http://localhost',galleryUrl,galleryPollMs:40});server=live.app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));base=`http://127.0.0.1:${server.address().port}`;}
 async function stop(){live.close();await new Promise(r=>server.close(r));}
 async function call(url,method='GET',body){const r=await fetch(base+url,{method,headers:{cookie,'X-Live-Admin-Key':key,...(body?{'Content-Type':'application/json'}:{})},body:body?JSON.stringify(body):undefined});return {status:r.status,body:await r.json(),cookie:r.headers.get('set-cookie')?.split(';')[0]};}
 async function until(check){const end=Date.now()+5000;while(Date.now()<end){if(await check())return;await new Promise(r=>setTimeout(r,25));}assert.fail('Background update did not arrive');}
 await start();t.after(async()=>{await stop();await new Promise(r=>source.close(r));fs.rmSync(dataDir,{recursive:true,force:true});});
 cookie=(await call('/api/admin/auth/setup','POST',{key,email:'auto@example.com',password:'automatic-sync-test-password'})).cookie;
 const invite=(await call('/api/admin/invitations','POST',{email:'owner@example.com'})).body;
 const e=(await call('/api/admin/events','POST',{owner:invite.owner.id,title:'Auto capture',status:'published',moderation:0})).body;
 const endpoint=`/api/admin/events/${e.slug}/photobooth`,wall=(await call(`/api/events/${e.slug}/wall`,'PATCH',{enabled:true})).body;
 const feed='/api/wall/'+new URL(wall.url).pathname.split('/')[2];
 photos=[photo('first')];assert.equal((await call(endpoint,'PUT',{slug:'booth'})).body.imported,1);
 photos.push(photo('second'),photo('broken'),photo('pending',{processStatus:'processing'}),photo('original',{variant:'original'}));
 await until(()=>live.db.prepare('SELECT count(*) n FROM photos').get().n===2);
 await until(()=>Boolean(live.db.prepare('SELECT error FROM live_booth_links').get().error));
 assert.equal((await call(feed)).body.photos.length,2);
 photos.find(p=>p.id==='pending').processStatus='ready';
 await until(()=>live.db.prepare('SELECT count(*) n FROM photos').get().n===3);
 assert.equal((await call(`/api/events/${e.slug}/print/album/preview`)).body.included,3);
 offline=true;await until(()=>live.db.prepare('SELECT error FROM live_booth_links').get().error.startsWith('Sync failed'));
 offline=false;photos.push(photo('after-outage'));await until(()=>live.db.prepare('SELECT count(*) n FROM photos').get().n===4);
 await stop();await start();photos.push(photo('after-restart'));await until(()=>live.db.prepare('SELECT count(*) n FROM photos').get().n===5);
 const status=(await call('/api/admin/photobooth/status')).body;assert.equal(status.links[0].imported,5);assert.equal(status.links[0].pending,0);assert.ok(calls>4);
 await call(endpoint,'DELETE',{});photos.push(photo('after-pause'));await new Promise(r=>setTimeout(r,130));assert.equal(live.db.prepare('SELECT count(*) n FROM photos').get().n,5);
 assert.equal((await call(endpoint+'/remove','DELETE',{})).body.removed,5);photos.push(photo('after-remove'));await new Promise(r=>setTimeout(r,130));assert.equal(live.db.prepare('SELECT count(*) n FROM photos').get().n,0);
});
