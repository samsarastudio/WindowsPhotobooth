import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import express from 'express';
import sharp from 'sharp';
import {createLiveWallBridge} from '../src/live-wall-bridge.js';
import {createLiveApp} from '../src/live/server.js';

test('Live photos join Gallery wall stream; moderation, removals, outage leases and disconnect reconcile',async t=>{
 const data=fs.mkdtempSync(path.join(os.tmpdir(),'gallery-wall-')),key='test-gallery-wall-admin-key-32-characters',token='gallery-upload-token';let clock=Date.now();const notifications=[];
 const sessions=[{id:'gallery-a',slug:'event-a',title:'Event A'},{id:'gallery-b',slug:'event-b',title:'Event B'}];
 const bridge=createLiveWallBridge({resolveSession:slug=>sessions.find(s=>s.slug===slug),sessions:()=>sessions,dir:path.join(data,'bridge'),clock:()=>clock,authorize:(req,res,next)=>req.get('authorization')==='Bearer '+token?next():res.sendStatus(401),notify:(type,p,slug)=>notifications.push({type,...p,slug})});
 const ga=express();ga.use(express.json());ga.use('/api/wall/live',bridge.router);const gs=ga.listen(0,'127.0.0.1');await new Promise(r=>gs.once('listening',r));const gallery='http://127.0.0.1:'+gs.address().port;
 const live=createLiveApp({dataDir:path.join(data,'live'),adminKey:key,baseUrl:'http://localhost',clock:()=>clock,galleryPollMs:80});const server=live.app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));const base='http://127.0.0.1:'+server.address().port;
 t.after(async()=>{await new Promise(r=>server.close(r));live.close();bridge.close();await new Promise(r=>gs.close(r));fs.rmSync(data,{recursive:true,force:true});});
 const call=async(route,method='GET',body,admin=true)=>{const r=await fetch(base+route,{method,headers:{...(admin?{'X-Live-Admin-Key':key}:{}),'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined});return {status:r.status,body:await r.json()};};
 const until=async fn=>{for(let i=0;i<100;i++){if(await fn())return;await new Promise(r=>setTimeout(r,40));}assert.fail('Timed out');};
 const owner=(await call('/api/admin/invitations','POST',{email:'wall@example.com'})).body.owner;
 const e=(await call('/api/admin/events','POST',{owner:owner.id,title:'Mixed wall',status:'published',moderation:0})).body;
 const ep='/api/admin/events/'+e.slug+'/gallery-wall';
 assert.equal((await call(ep,'GET',null,false)).status,401);
 assert.equal((await call(ep,'PUT',{url:gallery+'/wall',token:'wrong'})).status,502);
 const bytes=await sharp({create:{width:400,height:600,channels:3,background:'gold'}}).jpeg().toBuffer();
 // Seed an approved camera capture and an imported booth photo to check loop prevention.
 live.db.prepare('INSERT INTO guests VALUES(?,?,?,?,0,?)').run('g',e.id,'guest-token','Guest',clock);
 for(const id of ['camera','booth']){fs.writeFileSync(path.join(data,'live/photos',id+'.jpg'),bytes);live.db.prepare('INSERT INTO photos(id,event,guest,filename,approved,favorite,created,request_id) VALUES(?,?,?,?,1,0,?,?)').run(id,e.id,'g',id+'.jpg',clock,id);}
 live.db.prepare('INSERT INTO live_booth_imports VALUES(?,?,?,?,?)').run(e.id,'gallery','booth-source','booth','framed');
 const catalog=await call(ep+'/catalog','POST',{url:gallery+'/event-a/wall/',token});assert.equal(catalog.body.sessions.length,2);assert.equal(catalog.body.suggestedSlug,'event-a');
 assert.equal((await call(ep,'PUT',{url:gallery+'/wall',token})).status,400,'Global destinations must not publish');
 const linked=await call(ep,'PUT',{url:gallery+'/event-a/wall/',token});assert.equal(linked.status,200);assert(!JSON.stringify(linked.body).includes(token));
 await until(()=>bridge.list('event-a').length===1);assert(bridge.list('event-a')[0].id.endsWith('-camera'));assert(notifications.some(p=>p.type==='photo.added'));
 assert.equal(bridge.list('event-b').length,0,'Unrelated event starts empty');
 assert(notifications.filter(p=>p.type==='photo.added').every(p=>p.slug==='event-a'),'SSE scoped to the selected event');
 const other=(await call('/api/admin/events','POST',{owner:owner.id,title:'Other wall',status:'published',moderation:0})).body;
 live.db.prepare('INSERT INTO guests VALUES(?,?,?,?,0,?)').run('other-guest',other.id,'other-token','Other',clock);
 fs.writeFileSync(path.join(data,'live/photos','other.jpg'),bytes);
 live.db.prepare('INSERT INTO photos(id,event,guest,filename,approved,favorite,created,request_id) VALUES(?,?,?,?,1,0,?,?)').run('other-camera',other.id,'other-guest','other.jpg',clock,'other-camera');
 assert.equal((await call('/api/admin/events/'+other.slug+'/gallery-wall','PUT',{url:gallery,sessionSlug:'event-b',token})).status,200);
 await until(()=>bridge.list('event-b').length===1);
 const otherUrl=bridge.list('event-b')[0].url;
 const imageUrl=bridge.list('event-a')[0].url;assert.equal((await fetch(gallery+imageUrl)).status,200);
 await new Promise(r=>setTimeout(r,200));assert.equal(bridge.list('event-a').length,1,'No duplicates');
 live.db.prepare('UPDATE photos SET approved=0 WHERE id=?').run('camera');await until(()=>bridge.list('event-a').length===0);assert.equal((await fetch(gallery+imageUrl)).status,404);assert(notifications.some(p=>p.type==='photo.removed'));
 live.db.prepare('UPDATE photos SET approved=1 WHERE id=?').run('camera');await until(()=>bridge.list('event-a').length===1);
 live.db.prepare("UPDATE events SET visibility='host' WHERE id=?").run(e.id);await until(()=>bridge.list('event-a').length===0);
 live.db.prepare("UPDATE events SET visibility='all' WHERE id=?").run(e.id);await until(()=>bridge.list('event-a').length===1);
 // An expired lease hides pixels immediately, before the next periodic sweep.
 clock+=61000;assert.equal(bridge.list('event-a').length,0);assert.equal((await fetch(gallery+imageUrl)).status,404);await until(()=>bridge.list('event-a').length===1);
 const originalId=sessions[0].id;sessions[0].id='recreated-gallery';
 assert.equal(bridge.list('event-a').length,0,'Reusing a slug cannot expose the previous event');assert.equal((await fetch(gallery+imageUrl)).status,404);
 sessions[0].id=originalId;
 let removed;await until(async()=>{removed=await call(ep,'DELETE');return removed.status===200;});assert.equal(bridge.list('event-a').length,0);assert.equal((await fetch(gallery+imageUrl)).status,404);
 assert.equal(live.db.prepare('SELECT count(*) n FROM photos').get().n,3,'Disconnect preserves original Live and booth photos');
 assert.equal(bridge.list('event-b').length,1,'Disconnecting A does not remove B');assert.equal((await fetch(gallery+otherUrl)).status,200);
 const join=await fetch(base+'/api/guest/'+e.slug+'/join',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:'Phone guest'})});
 const cookie=join.headers.get('set-cookie').split(';')[0];
 const rotated=await sharp({create:{width:600,height:400,channels:3,background:'blue'}}).withMetadata({orientation:6}).jpeg().toBuffer();
 const form=new FormData();form.append('photo',new Blob([rotated],{type:'image/jpeg'}),'phone.jpg');form.append('request_id','phone-orientation');
 const uploaded=await fetch(base+'/api/guest/'+e.slug+'/photos',{method:'POST',headers:{cookie},body:form});assert.equal(uploaded.status,201);
 const saved=await uploaded.json(),row=live.db.prepare('SELECT filename FROM photos WHERE id=?').get(saved.id),meta=await sharp(path.join(data,'live/photos',row.filename)).metadata();assert.equal(meta.width,400);assert.equal(meta.height,600);assert(!meta.orientation||meta.orientation===1,'EXIF rotation normalized exactly once');

});
