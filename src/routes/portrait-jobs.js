import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { Router } from 'express';
import multer from 'multer';
import sharp from 'sharp';
import { nanoid } from 'nanoid';
import { config } from '../config.js';
import { getDb, publicPhoto, isSessionExpired } from '../db.js';
import { requireUploadToken } from '../auth.js';
import { getHalloweenApiKey } from '../halloween/store.js';
import { callOpenAiImageEdit } from '../halloween/openai-edit.js';
import frameOverlay from '../frame-overlay.cjs';
import {fileURLToPath} from 'node:url';
import { broadcastPhotoAdded } from '../sse.js';
import {initPortraitQueue,nextPortraitOrder,portraitQueuePosition,claimNextPortrait} from '../portrait-queue.js';

export const portraitJobsRouter = Router();
portraitJobsRouter.use(requireUploadToken);
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20*1024*1024, files: 4, fields: 4, fieldSize: 20000 } });
const jobDir = id => path.join(config.dataDir, 'portrait-jobs', id);
let active = false;
export function retryPortrait(photoId) {
  const db = getDb();
  const job = db.prepare('SELECT * FROM portrait_jobs WHERE original_id=? OR photo_id=? ORDER BY created_at DESC LIMIT 1').get(photoId, photoId);
  if (!job) return { status: 409, error: 'Portrait inputs never reached Moments. Retake this photo on the kiosk; the server cannot recreate the selected portrait from the capture alone.' };
  const original = db.prepare('SELECT * FROM photos WHERE id=?').get(job.original_id);
  const session = original && db.prepare('SELECT * FROM sessions WHERE id=?').get(original.session_id);
  if (!session || isSessionExpired(session)) return { status: 410, error: 'This capture has expired. Please take a new photo.' };
  if (job.status !== 'failed') return { status: 200, job: jobView(job), reused: true };
  if (!(job.job_kind==='background'?['image','reference']:['image','reference','mask']).every(name => fs.existsSync(path.join(jobDir(job.id), name + '.png')))) return { status: 409, error: 'Portrait inputs are missing. Please retake this photo on the kiosk.' };
  if (!getHalloweenApiKey()) return { status: 503, error: 'Configure the OpenAI key in Moments admin first.' };
  if (db.prepare("SELECT count(*) AS n FROM portrait_jobs WHERE status IN ('queued','running')").get().n >= 20) return { status: 429, error: 'Portrait queue is full. Try again shortly.' };
  db.transaction(() => {
    db.prepare("UPDATE portrait_jobs SET status='queued',error=NULL,queue_order=? WHERE id=? AND status='failed'").run(nextPortraitOrder(db),job.id);
    db.prepare("UPDATE photos SET process_status='processing' WHERE id=?").run(job.original_id);
  })();
  setImmediate(() => void drain());
  return { status: 202, job: jobView(db.prepare('SELECT * FROM portrait_jobs WHERE id=?').get(job.id)) };
}
export function initPortraitJobs() {
  getDb().exec(`CREATE TABLE IF NOT EXISTS portrait_jobs (id TEXT PRIMARY KEY, request_key TEXT UNIQUE NOT NULL, original_id TEXT NOT NULL, status TEXT NOT NULL, prompt TEXT NOT NULL, created_at TEXT NOT NULL, error TEXT, photo_id TEXT, model TEXT)`);
  initPortraitQueue(getDb());
  if(!getDb().prepare('PRAGMA table_info(portrait_jobs)').all().some(c=>c.name==='job_kind'))getDb().exec("ALTER TABLE portrait_jobs ADD COLUMN job_kind TEXT NOT NULL DEFAULT 'portrait'");
  // A running paid request has an unknown outcome after a server crash. Never bill twice automatically.
  const interrupted=getDb().prepare("SELECT original_id FROM portrait_jobs WHERE status='running'").all();
  for(const row of interrupted)getDb().prepare("UPDATE photos SET process_status='failed' WHERE id=?").run(row.original_id);
  getDb().prepare("UPDATE portrait_jobs SET status='failed', error='Server restarted during generation. Use Retry AI portrait to try again.' WHERE status='running'").run();
  void drain();
}
function jobView(job) {
  const row=job.photo_id?getDb().prepare('SELECT * FROM photos WHERE id=?').get(job.photo_id):null;
  const session=row?getDb().prepare('SELECT * FROM sessions WHERE id=?').get(row.session_id):null;
  return {id:job.id,status:job.status,queuePosition:portraitQueuePosition(getDb(),job),createdAt:job.created_at,error:job.error,model:job.model,photo:row&&session?publicPhoto(session.slug,row):null};
}
portraitJobsRouter.get('/capabilities',(_req,res)=>res.json({ok:true,portraitGeneration:true,configured:!!getHalloweenApiKey()}));
portraitJobsRouter.get('/by-photo/:photoId',(req,res)=>{const job=getDb().prepare('SELECT * FROM portrait_jobs WHERE original_id=? OR photo_id=? ORDER BY created_at DESC LIMIT 1').get(req.params.photoId,req.params.photoId);return res.json({ok:true,job:job?jobView(job):null});});
portraitJobsRouter.get('/:id',(req,res)=>{const job=getDb().prepare('SELECT * FROM portrait_jobs WHERE id=?').get(req.params.id);return job?res.json({ok:true,job:jobView(job)}):res.status(404).json({ok:false,error:'Portrait job not found'});});
portraitJobsRouter.post('/',upload.fields([{name:'image',maxCount:1},{name:'reference',maxCount:1},{name:'mask',maxCount:1},{name:'frame',maxCount:1}]),async(req,res)=>{
 try {
  if(!getHalloweenApiKey())return res.status(503).json({ok:false,error:'Configure the OpenAI key in Moments admin before using portraits.'});
  const original=getDb().prepare("SELECT * FROM photos WHERE id=? AND variant='original'").get(String(req.body.originalPhotoId||''));
  const session=original?getDb().prepare('SELECT * FROM sessions WHERE id=?').get(original.session_id):null;
  if(!original||!session||isSessionExpired(session))return res.status(400).json({ok:false,error:'Original capture is unavailable or expired.'});
  const prompt=String(req.body.prompt||'').trim();if(!prompt||prompt.length>16000)throw Error('Invalid portrait prompt');
  const files={};for(const name of ['image','reference','mask','frame']){const file=req.files?.[name]?.[0];if(!file){if(name==='frame')continue;throw Error('Missing '+name);}const m=await sharp(file.buffer,{limitInputPixels:24e6}).metadata();if(m.format!=='png')throw Error('Portrait inputs must be PNG');files[name]=file.buffer;}
  const m=await sharp(files.image).metadata(),mask=await sharp(files.mask).metadata();if(m.width!==mask.width||m.height!==mask.height||!mask.hasAlpha)throw Error('Invalid portrait mask dimensions or transparency');
  const hash=createHash('sha256').update(original.id).update(prompt);for(const name of ['image','reference','mask','frame'])hash.update(files[name]||'');const key=hash.digest('hex');
  const existing=getDb().prepare('SELECT * FROM portrait_jobs WHERE request_key=?').get(key);if(existing)return res.json({ok:true,job:jobView(existing)});
  if(getDb().prepare("SELECT count(*) AS n FROM portrait_jobs WHERE status IN ('queued','running')").get().n>=20)return res.status(429).json({ok:false,error:'Portrait queue is full. Please try again shortly.'});
  const id=nanoid(20),dir=jobDir(id);fs.mkdirSync(dir,{recursive:true});for(const [name,buffer]of Object.entries(files))fs.writeFileSync(path.join(dir,name+'.png'),buffer);
  getDb().transaction(()=>{getDb().prepare("INSERT INTO portrait_jobs(id,request_key,original_id,status,prompt,created_at,queue_order) VALUES(?,?,?,'queued',?,?,?)").run(id,key,original.id,prompt,new Date().toISOString(),nextPortraitOrder(getDb()));getDb().prepare("UPDATE photos SET process_status='processing' WHERE id=?").run(original.id);})();
  res.status(202).json({ok:true,job:jobView(getDb().prepare('SELECT * FROM portrait_jobs WHERE id=?').get(id))});void drain();
 }catch(e){res.status(400).json({ok:false,error:String(e.message||e)});}
});
async function drain(){
 if(active)return;active=true;
 try {while(true){const job=claimNextPortrait(getDb());if(!job)break;
  try{
   const original=getDb().prepare('SELECT * FROM photos WHERE id=?').get(job.original_id);const session=original?getDb().prepare('SELECT * FROM sessions WHERE id=?').get(original.session_id):null;if(!session||isSessionExpired(session))throw Error('Capture session expired');
   const dir=jobDir(job.id),read=name=>fs.readFileSync(path.join(dir,name+'.png'));
   const backgroundJob=job.job_kind==='background';
   const result=fs.existsSync(path.join(dir,'openai.png'))
     ? {ok:true,outBuf:read('openai'),model:job.model}
     : await callOpenAiImageEdit(getHalloweenApiKey(),read('image'),job.prompt,[{buf:read('reference'),filename:'guest-reference.png'}],backgroundJob?'1536x1024':'1024x1536',backgroundJob?null:read('mask'),{preferMax:!backgroundJob,maxAttempts:backgroundJob?1:3});
   if(!result.ok)throw Error(result.error);
   fs.writeFileSync(path.join(dir,'openai.png'),result.outBuf);
   getDb().prepare('UPDATE portrait_jobs SET model=? WHERE id=?').run(result.model || null,job.id);
   let output=await sharp(result.outBuf).resize(backgroundJob?1800:1200,backgroundJob?1200:1800,{fit:'cover',position:'centre'}).png().toBuffer();
   const unframed=output;
   if(fs.existsSync(path.join(dir,'frame.png'))){const frame=read('frame'),meta=await sharp(frame).metadata();if(!meta.hasAlpha)throw Error('The portrait frame needs a transparent opening');if(backgroundJob){const {hole,overlay}=await frameOverlay.prepareFrameOverlay(sharp,path.join(dir,'frame.png'));const photo=await sharp(output).resize(hole.width,hole.height,{fit:'cover'}).png().toBuffer();output=await sharp({create:{width:meta.width,height:meta.height,channels:4,background:'#000'}}).composite([{input:photo,left:hole.left,top:hole.top},{input:overlay}]).png().toBuffer();}else{output=await sharp(output).resize(meta.width,meta.height,{fit:'cover'}).composite([{input:frame}]).png().toBuffer();}}
   const id=nanoid(14),filename=id+'.png',dest=path.join(config.photosDir,session.slug);fs.mkdirSync(dest,{recursive:true});fs.writeFileSync(path.join(dest,filename),output);const meta=await sharp(output).metadata();
   const row={id,session_id:session.id,variant:'ai',filename,mime:'image/png',bytes:output.length,source_local_name:path.parse(original.source_local_name||original.filename).name+'_ai.png',width:meta.width,height:meta.height,created_at:new Date().toISOString(),process_status:'ready'};
   getDb().transaction(()=>{getDb().prepare('INSERT INTO photos(id,session_id,variant,filename,mime,bytes,source_local_name,width,height,created_at,process_status) VALUES(@id,@session_id,@variant,@filename,@mime,@bytes,@source_local_name,@width,@height,@created_at,@process_status)').run(row);getDb().prepare("UPDATE photos SET process_status='ready' WHERE id=?").run(original.id);getDb().prepare("UPDATE portrait_jobs SET status='ready',photo_id=?,model=? WHERE id=?").run(id,result.model,job.id);})();
   if(backgroundJob){
    const rawId=nanoid(14),rawName=rawId+'.png';fs.writeFileSync(path.join(dest,rawName),unframed);
    getDb().prepare("INSERT INTO photos(id,session_id,variant,filename,mime,bytes,source_local_name,width,height,created_at,process_status) VALUES(?,?,'magnet-source',?,'image/png',?,?,1800,1200,?,'ready')").run(rawId,session.id,rawName,unframed.length,path.parse(original.source_local_name||original.filename).name+'_ai_raw.png',row.created_at);
   }
   broadcastPhotoAdded(session.slug,publicPhoto(session.slug,row));
  }catch(e){getDb().prepare("UPDATE portrait_jobs SET status='failed',error=? WHERE id=?").run(String(e.message||e).slice(0,500),job.id);getDb().prepare("UPDATE photos SET process_status='failed' WHERE id=?").run(job.original_id);}
 }}finally{active=false;}
}


export async function submitBackgroundRecovery(photoId) {
 const db=getDb();const original=db.prepare("SELECT * FROM photos WHERE id=? AND variant='original'").get(photoId);
 const session=original&&db.prepare('SELECT * FROM sessions WHERE id=?').get(original.session_id);
 if(!session||isSessionExpired(session))throw Error('Original is unavailable or expired');
 const activeJob=db.prepare("SELECT * FROM portrait_jobs WHERE original_id=? AND status IN ('queued','running','ready') ORDER BY created_at DESC LIMIT 1").get(photoId);
 if(activeJob)return jobView(activeJob);
 if(!getHalloweenApiKey())throw Error('Configure the OpenAI key in Moments admin first');
 if(db.prepare("SELECT count(*) AS n FROM portrait_jobs WHERE status IN ('queued','running')").get().n>=20)throw Error('AI queue is full. Try again shortly');
 const key='background-recovery:'+photoId;
 const previous=db.prepare('SELECT * FROM portrait_jobs WHERE request_key=?').get(key);
 if(previous){const retry=retryPortrait(photoId);if(retry.error)throw Error(retry.error);return retry.job;}
 const id=nanoid(20),dir=jobDir(id);fs.mkdirSync(dir,{recursive:true});
 const image=await sharp(path.join(config.photosDir,session.slug,original.filename)).rotate().resize(1536,1024,{fit:'cover'}).png().toBuffer();
 const reference=fs.readFileSync(fileURLToPath(new URL('../../seed-backgrounds/pumpkin-patch.png',import.meta.url)));
 // Recheck after decoding: concurrent taps must not create two paid jobs.
 const duplicate=db.prepare('SELECT * FROM portrait_jobs WHERE request_key=?').get(key);if(duplicate){fs.rmSync(dir,{recursive:true,force:true});return jobView(duplicate);}
 fs.writeFileSync(path.join(dir,'image.png'),image);fs.writeFileSync(path.join(dir,'reference.png'),reference);
 const frame=path.join(config.framesDir,'halloween-haunt.png');if(fs.existsSync(frame))fs.copyFileSync(frame,path.join(dir,'frame.png'));
 const prompt='Replace ONLY the background of image 1 with the Halloween pumpkin patch scenery from image 2. Preserve ALL people and costumes exactly, including full-face Ghostface or LED masks, hood, hair, hands, accessories and props. A costume mask is part of the person: never remove it, reveal or invent a face, change expression or reshape the body. Keep number, identity, proportions and relative positions unchanged. Frame the group slightly higher with comfortable headroom and upper bodies clear; no clipped heads or floating cutout edges. Match backdrop scale, perspective, focus and lighting naturally. No new people, no text or decorative frame. Image 2 supplies scenery only.';
 db.transaction(()=>{db.prepare("INSERT INTO portrait_jobs(id,request_key,original_id,status,prompt,created_at,queue_order,job_kind) VALUES(?,?,?,'queued',?,?,?,'background')").run(id,key,photoId,prompt,new Date().toISOString(),nextPortraitOrder(db));db.prepare("UPDATE photos SET process_status='processing' WHERE id=?").run(photoId);})();
 setImmediate(()=>void drain());return jobView(db.prepare('SELECT * FROM portrait_jobs WHERE id=?').get(id));
}
