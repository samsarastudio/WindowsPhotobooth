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
import { broadcastPhotoAdded } from '../sse.js';

export const portraitJobsRouter = Router();
portraitJobsRouter.use(requireUploadToken);
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20*1024*1024, files: 4, fields: 4, fieldSize: 20000 } });
const jobDir = id => path.join(config.dataDir, 'portrait-jobs', id);
let active = false;
export function initPortraitJobs() {
  getDb().exec(`CREATE TABLE IF NOT EXISTS portrait_jobs (id TEXT PRIMARY KEY, request_key TEXT UNIQUE NOT NULL, original_id TEXT NOT NULL, status TEXT NOT NULL, prompt TEXT NOT NULL, created_at TEXT NOT NULL, error TEXT, photo_id TEXT, model TEXT)`);
  // A running paid request has an unknown outcome after a server crash. Never bill twice automatically.
  const interrupted=getDb().prepare("SELECT original_id FROM portrait_jobs WHERE status='running'").all();
  for(const row of interrupted)getDb().prepare("UPDATE photos SET process_status='failed' WHERE id=?").run(row.original_id);
  getDb().prepare("UPDATE portrait_jobs SET status='failed', error='Server restarted during generation. Please retake the photo.' WHERE status='running'").run();
  void drain();
}
function jobView(job) {
  const row=job.photo_id?getDb().prepare('SELECT * FROM photos WHERE id=?').get(job.photo_id):null;
  const session=row?getDb().prepare('SELECT * FROM sessions WHERE id=?').get(row.session_id):null;
  return {id:job.id,status:job.status,error:job.error,model:job.model,photo:row&&session?publicPhoto(session.slug,row):null};
}
portraitJobsRouter.get('/capabilities',(_req,res)=>res.json({ok:true,portraitGeneration:true,configured:!!getHalloweenApiKey()}));
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
  getDb().transaction(()=>{getDb().prepare("INSERT INTO portrait_jobs(id,request_key,original_id,status,prompt,created_at) VALUES(?,?,?,'queued',?,?)").run(id,key,original.id,prompt,new Date().toISOString());getDb().prepare("UPDATE photos SET process_status='processing' WHERE id=?").run(original.id);})();
  res.status(202).json({ok:true,job:jobView(getDb().prepare('SELECT * FROM portrait_jobs WHERE id=?').get(id))});void drain();
 }catch(e){res.status(400).json({ok:false,error:String(e.message||e)});}
});
async function drain(){
 if(active)return;active=true;
 try {while(true){const job=getDb().prepare("SELECT * FROM portrait_jobs WHERE status='queued' ORDER BY created_at LIMIT 1").get();if(!job)break;
  getDb().prepare("UPDATE portrait_jobs SET status='running' WHERE id=?").run(job.id);
  try{
   const original=getDb().prepare('SELECT * FROM photos WHERE id=?').get(job.original_id);const session=original?getDb().prepare('SELECT * FROM sessions WHERE id=?').get(original.session_id):null;if(!session||isSessionExpired(session))throw Error('Capture session expired');
   const dir=jobDir(job.id),read=name=>fs.readFileSync(path.join(dir,name+'.png'));
   const result=await callOpenAiImageEdit(getHalloweenApiKey(),read('image'),job.prompt,[{buf:read('reference'),filename:'guest-reference.png'}],'1024x1536',read('mask'),{preferMax:true});
   if(!result.ok)throw Error(result.error);
   fs.writeFileSync(path.join(dir,'openai.png'),result.outBuf);
   let output=await sharp(result.outBuf).resize(1200,1800,{fit:'cover',position:'centre'}).png().toBuffer();
   if(fs.existsSync(path.join(dir,'frame.png'))){const frame=read('frame'),meta=await sharp(frame).metadata();if(!meta.hasAlpha)throw Error('The portrait frame needs a transparent opening');output=await sharp(output).resize(meta.width,meta.height,{fit:'cover'}).composite([{input:frame}]).png().toBuffer();}
   const id=nanoid(14),filename=id+'.png',dest=path.join(config.photosDir,session.slug);fs.mkdirSync(dest,{recursive:true});fs.writeFileSync(path.join(dest,filename),output);const meta=await sharp(output).metadata();
   const row={id,session_id:session.id,variant:'ai',filename,mime:'image/png',bytes:output.length,source_local_name:path.parse(original.source_local_name||original.filename).name+'_ai.png',width:meta.width,height:meta.height,created_at:new Date().toISOString(),process_status:'ready'};
   getDb().transaction(()=>{getDb().prepare('INSERT INTO photos(id,session_id,variant,filename,mime,bytes,source_local_name,width,height,created_at,process_status) VALUES(@id,@session_id,@variant,@filename,@mime,@bytes,@source_local_name,@width,@height,@created_at,@process_status)').run(row);getDb().prepare("UPDATE photos SET process_status='ready' WHERE id=?").run(original.id);getDb().prepare("UPDATE portrait_jobs SET status='ready',photo_id=?,model=? WHERE id=?").run(id,result.model,job.id);})();
   broadcastPhotoAdded(session.slug,publicPhoto(session.slug,row));
  }catch(e){getDb().prepare("UPDATE portrait_jobs SET status='failed',error=? WHERE id=?").run(String(e.message||e).slice(0,500),job.id);getDb().prepare("UPDATE photos SET process_status='failed' WHERE id=?").run(job.original_id);}
 }}finally{active=false;}
}
