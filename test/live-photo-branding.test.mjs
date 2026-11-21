import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import {createLiveApp} from '../src/live/server.js';
import {applyPhotoBranding} from '../src/live/photo-branding.js';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'C:/Users/Unity/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
test('Admin photo border persists and brands new portrait, landscape and square photos after filters',async t=>{
 const dataDir=fs.mkdtempSync(path.join(os.tmpdir(),'live-branding-')),key='branding-test-key-at-least-32-characters';
 const live=createLiveApp({dataDir,adminKey:key,baseUrl:'http://127.0.0.1:3198'}),server=live.app.listen(3198,'127.0.0.1');await new Promise(r=>server.once('listening',r));const base=`http://127.0.0.1:${server.address().port}`;
 let browser;t.after(async()=>{await browser?.close();await new Promise(r=>server.close(r));live.close();fs.rmSync(dataDir,{recursive:true,force:true});});
 async function api(url,method='GET',body,cookie='',admin=false){const r=await fetch(base+url,{method,headers:{cookie,...(admin?{'X-Live-Admin-Key':key}:{}),...(body&&!(body instanceof FormData)?{'Content-Type':'application/json'}:{})},body:body instanceof FormData?body:body?JSON.stringify(body):undefined});return {status:r.status,body:await r.json(),cookie:r.headers.get('set-cookie')?.split(';')[0]};}
 const invite=(await api('/api/admin/invitations','POST',{email:'border@example.com'},'',true)).body;
 const owner=(await api('/api/auth/accept','POST',{token:new URLSearchParams(new URL(invite.url).hash.slice(1)).get('access')})).cookie;
 const event=(await api('/api/events','POST',{title:'KWCA branding QA',status:'published'},owner)).body;
 assert.equal(event.photo_branding,'none');
 assert.equal((await api(`/api/events/${event.slug}`,'PATCH',{photo_branding:'invalid'},owner)).status,400);
 browser=await chromium.launch({channel:'chrome',headless:true});const context=await browser.newContext();
 const equals=owner.indexOf('=');await context.addCookies([{name:owner.slice(0,equals),value:owner.slice(equals+1),url:base}]);const page=await context.newPage();
 await page.goto(`${base}/host/${event.slug}`);await page.getByText('Cover & branding',{exact:true}).click();
 await page.locator('#photo-branding select').selectOption('kwca_gold');await page.getByRole('button',{name:'Save photo border',exact:true}).click();
 await page.getByText('Photo border saved for new photos',{exact:true}).waitFor();await page.reload();
 assert.equal(await page.locator('#photo-branding select').inputValue(),'kwca_gold');
 const guest=(await api(`/api/guest/${event.slug}/join`,'POST',{name:'QA'})).cookie;
 let n=0;const saved=[];
 for(const [width,height] of [[900,1200],[1200,900],[900,900]]){
  const source=await sharp({create:{width,height,channels:3,background:'#687981'}}).png().toBuffer();
  const form=new FormData();form.append('photo',new Blob([source]),'source.png');form.append('request_id',`border-${n++}`);form.append('photo_look','mono');form.append('look_strength','100');
  const uploaded=await api(`/api/guest/${event.slug}/photos`,'POST',form,guest);assert.equal(uploaded.status,201,JSON.stringify(uploaded));
  const file=path.join(dataDir,'photos',live.db.prepare('SELECT filename FROM photos WHERE id=?').get(uploaded.body.id).filename),bytes=fs.readFileSync(file);saved.push([file,bytes]);
  const meta=await sharp(bytes).metadata();assert.equal(meta.width,width);assert.equal(meta.height,height);
  const {data}=await sharp(bytes).removeAlpha().raw().toBuffer({resolveWithObject:true});
  const at=(x,y)=>Array.from(data.slice((y*width+x)*3,(y*width+x)*3+3));
  const center=at(Math.floor(width/2),Math.floor(height/2));assert(Math.max(...center)-Math.min(...center)<3,'Mono center remains unchanged by branding');
  const edge=at(Math.round(Math.min(width,height)*.012),Math.round(height/2));assert(edge[0]>edge[2]+10,'Gold border is present');
  let coloured=0;for(let y=height-100;y<height-15;y++)for(let x=width-100;x<width-15;x++){const rgb=at(x,y);if(Math.max(...rgb)-Math.min(...rgb)>35)coloured++;}assert(coloured>100,'Bottom-right logo keeps brand colours after Mono');
 }
 await api(`/api/events/${event.slug}`,'PATCH',{photo_branding:'none'},owner);
 for(const [file,bytes] of saved)assert.deepEqual(fs.readFileSync(file),bytes,'Changing settings does not rewrite existing photos');
 const input=await sharp({create:{width:100,height:150,channels:3,background:'#123456'}}).jpeg().toBuffer();assert.deepEqual(await applyPhotoBranding(input,'none'),input);
 await api('/api/admin/features','PATCH',{branding:false},'',true);
 assert.equal((await api(`/api/events/${event.slug}`,'PATCH',{photo_branding:'kwca_gold'},owner)).status,403);
});
