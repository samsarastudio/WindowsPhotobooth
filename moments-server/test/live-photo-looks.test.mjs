import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import sharp from 'sharp';import {createLiveApp} from '../src/live/server.js';
test('Photo looks alter new JPEGs, preserve Natural, respect event defaults and the administrator switch',async t=>{
 const dataDir=fs.mkdtempSync(path.join(os.tmpdir(),'live-looks-')),key='photo-looks-test-admin-key-at-least-32';const live=createLiveApp({dataDir,adminKey:key,baseUrl:'http://localhost'}),server=live.app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));const base=`http://127.0.0.1:${server.address().port}`;t.after(async()=>{await new Promise(r=>server.close(r));live.close();fs.rmSync(dataDir,{recursive:true,force:true});});
 async function call(url,method='GET',body,cookie='',admin=false){const r=await fetch(base+url,{method,headers:{cookie,...(admin?{'X-Live-Admin-Key':key}:{}),...(body&&!(body instanceof FormData)?{'Content-Type':'application/json'}:{})},body:body instanceof FormData?body:body?JSON.stringify(body):undefined});return {status:r.status,body:await r.json(),cookie:r.headers.get('set-cookie')?.split(';')[0]};}
 const invite=(await call('/api/admin/invitations','POST',{email:'looks@example.com'},'',true)).body;const owner=(await call('/api/auth/accept','POST',{token:new URLSearchParams(new URL(invite.url).hash.slice(1)).get('access')})).cookie;
 const e=(await call('/api/events','POST',{title:'Photo looks',status:'published'},owner)).body;assert.equal(e.photo_look,'natural');const guest=(await call(`/api/guest/${e.slug}/join`,'POST',{name:'Guest'})).cookie;
 const input=await sharp({create:{width:100,height:100,channels:3,background:{r:180,g:100,b:70}}}).png().toBuffer();let n=0;
 async function upload(look,strength=100){const form=new FormData();form.append('photo',new Blob([input]),'input.png');form.append('request_id','look-'+n++);if(look!==undefined){form.append('photo_look',look);form.append('look_strength',String(strength));}return call(`/api/guest/${e.slug}/photos`,'POST',form,guest);}
 const file=id=>path.join(dataDir,'photos',live.db.prepare('SELECT filename FROM photos WHERE id=?').get(id).filename);
 const natural=(await upload('natural')).body;assert.ok(natural.id);const naturalBytes=fs.readFileSync(file(natural.id));
 const zero=(await upload('vivid',0)).body;assert.deepEqual(fs.readFileSync(file(zero.id)),naturalBytes);
 for(const look of ['vivid','golden','soft','vintage','mono']){const result=await upload(look);assert.equal(result.status,201,JSON.stringify(result));const meta=await sharp(file(result.body.id)).metadata();assert.equal(meta.format,'jpeg');const raw=await sharp(file(result.body.id)).removeAlpha().raw().toBuffer();assert.notDeepEqual(fs.readFileSync(file(result.body.id)),naturalBytes);if(look==='mono'){assert.ok(Math.abs(raw[0]-raw[1])<3);assert.ok(Math.abs(raw[1]-raw[2])<3);}}
 assert.equal((await upload('bogus')).status,400);assert.equal((await upload('vivid',101)).status,400);
 assert.equal((await call(`/api/events/${e.slug}`,'PATCH',{photo_look:'mono',look_strength:100},owner)).status,200);
 const defaulted=(await upload()).body;const raw=await sharp(file(defaulted.id)).removeAlpha().raw().toBuffer();assert.ok(Math.abs(raw[0]-raw[2])<3);
 await call('/api/admin/features','PATCH',{filters:false},'',true);assert.equal((await call(`/api/guest/${e.slug}`,'GET',null,guest)).body.event.photo_look,'natural');
 const disabled=(await upload('mono')).body;assert.deepEqual(fs.readFileSync(file(disabled.id)),naturalBytes);
 assert.equal((await call(`/api/events/${e.slug}`,'PATCH',{photo_look:'golden'},owner)).status,403);assert.deepEqual(fs.readFileSync(file(natural.id)),naturalBytes);
});
