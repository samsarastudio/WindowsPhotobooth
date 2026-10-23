import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'tablet-magnet-test-'));process.env.DATA_DIR=dir;
const {initDb,getDb,closeDb,captureFamilyKey,selectGuestPhotos}=await import('../src/db.js');
const {ensureTabletSchema}=await import('../src/routes/tablet.js');const {initPortraitJobs}=await import('../src/routes/portrait-jobs.js');const {createTabletMagnet,magnetSource}=await import('../src/tablet-magnet.js');const {config}=await import('../src/config.js');const {default:sharp}=await import('sharp');
initDb();ensureTabletSchema();initPortraitJobs();const db=getDb();const now=new Date().toISOString();
db.prepare('INSERT INTO sessions VALUES(?,?,?,?,?,?,?)').run('s','magnet-test','Test','2026-10-23',now,'2099-01-01T00:00:00Z',null);
const folder=path.join(config.photosDir,'magnet-test');fs.mkdirSync(folder,{recursive:true});
async function photo(id,variant,source,color){const png=await sharp({create:{width:120,height:80,channels:3,background:color}}).png().toBuffer();fs.writeFileSync(path.join(folder,id+'.png'),png);db.prepare('INSERT INTO photos(id,session_id,variant,filename,mime,bytes,source_local_name,created_at,process_status) VALUES(?,?,?,?,?,?,?,?,?)').run(id,'s',variant,id+'.png','image/png',png.length,source,now,'ready');}
test('classic and background magnets exclude frames; portraits denied; duplicate creation reused',async()=>{try{
 await photo('original','original','capture.jpg','#0000ff');await photo('framed','framed','capture_framed.png','#ff0000');
 const classic=await createTabletMagnet('framed');assert.equal(classic.variant,'physical');
 const decoded=await sharp(path.join(folder,classic.id+'.png')).removeAlpha().raw().toBuffer();for(let i=0;i<decoded.length;i+=3)assert(!(decoded[i]>200&&decoded[i+1]<40&&decoded[i+2]<40),'Frame red must never appear');
 assert.equal((await createTabletMagnet('framed')).id,classic.id);
 await photo('ai','ai','capture_ai.png','#ff0000');await assert.rejects(createTabletMagnet('ai'));
 await photo('raw','magnet-source','capture_ai_raw.png','#00ff00');assert.equal(captureFamilyKey('capture_ai_raw.png'),'capture');
 const [a,b]=await Promise.all([createTabletMagnet('ai'),createTabletMagnet('ai')]);assert.equal(a.id,b.id);assert.notEqual(a.id,classic.id);
 db.prepare("INSERT INTO portrait_jobs(id,request_key,original_id,status,prompt,created_at) VALUES('j','k','original','ready','test',?)").run(now);await assert.rejects(createTabletMagnet('ai'));
 assert.equal(magnetSource([{variant:'original',process_status:'processing'}],null),null);
}finally{closeDb();fs.rmSync(dir,{recursive:true,force:true});}});
