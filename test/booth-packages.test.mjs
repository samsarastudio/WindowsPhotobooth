import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import express from 'express';
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'moments-skins-'));
process.env.DATA_DIR=dir;process.env.ADMIN_PIN='skin-test-pin';process.env.UPLOAD_TOKEN='skin-test-token';
const {boothPackagesRouter,adminBoothPackagesRouter}=await import('../src/routes/booth-packages.js');
test('authenticated upload → draft → publish → download → unpublish; immutable versions',async()=>{
 const app=express();app.use(express.json());app.use('/api/booth-packages',boothPackagesRouter);app.use('/api/admin/booth-packages',adminBoothPackagesRouter);const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));const base='http://127.0.0.1:'+server.address().port;
 const auth={'x-admin-pin':'skin-test-pin'},booth={Authorization:'Bearer skin-test-token'};
 try{
 assert.equal((await fetch(base+'/api/booth-packages')).status,401);
 const buffer=fs.readFileSync(new URL('../../deliverables/skin-packages/sports-cricket-1.0.0.booth.zip',import.meta.url));
 const body=new FormData();body.append('package',new Blob([buffer]),'cricket.zip');
 const post=await fetch(base+'/api/admin/booth-packages',{method:'POST',headers:auth,body});assert.equal(post.status,201,await post.text());
 let cat=await(await fetch(base+'/api/booth-packages',{headers:booth})).json();assert.equal(cat.packages.length,0);
 const resource='/sports-cricket/1.0.0';
 const publish=flag=>fetch(base+'/api/admin/booth-packages'+resource,{method:'PATCH',headers:{...auth,'Content-Type':'application/json'},body:JSON.stringify({published:flag})});
 assert.equal((await publish(true)).status,200);cat=await(await fetch(base+'/api/booth-packages',{headers:booth})).json();assert.equal(cat.packages.length,1);
 const downloaded=await fetch(base+'/api/booth-packages'+resource+'/download',{headers:booth});assert.equal(downloaded.status,200);assert.deepEqual(Buffer.from(await downloaded.arrayBuffer()),buffer);
 const duplicate=new FormData();duplicate.append('package',new Blob([buffer]),'cricket.zip');assert.equal((await fetch(base+'/api/admin/booth-packages',{method:'POST',headers:auth,body:duplicate})).status,409);
 await publish(false);assert.equal((await fetch(base+'/api/booth-packages'+resource+'/download',{headers:booth})).status,404);
 }finally{await new Promise(r=>server.close(r));fs.rmSync(dir,{recursive:true,force:true});}
});
