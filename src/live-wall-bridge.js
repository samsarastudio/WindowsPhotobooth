import fs from 'node:fs';
import path from 'node:path';
import {Router} from 'express';
import multer from 'multer';
import sharp from 'sharp';

// Live sources use the same wall metadata and photo.added stream as booth captures.
// A short renewable lease prevents disconnected/crashed Live servers leaving old photos visible.
export function createLiveWallBridge({dir,authorize,notify,resolveSession=()=>null,sessions=()=>[],clock=Date.now}) {
 let visible=new Map();
 const emit=(type,p,slug)=>{if(type==='photo.added')visible.set(p.id,slug);else if(type==='photo.removed')visible.delete(p.id);notify(type,p,slug);};
 const router=Router(),valid=v=>typeof v==='string'&&/^[a-zA-Z0-9-]{1,80}$/.test(v);
 const root=()=>{fs.mkdirSync(dir,{recursive:true});return dir;};
 const read=id=>{try{return JSON.parse(fs.readFileSync(path.join(root(),id+'.json'),'utf8'));}catch{return null;}};
 const write=(id,s)=>{const f=path.join(root(),id+'.json');fs.writeFileSync(f+'.tmp',JSON.stringify(s));fs.renameSync(f+'.tmp',f);};
 const photo=(id,p)=>({id:`live-${id}-${p}`,variant:'framed',wallOnly:true,processStatus:'ready',url:`/api/wall/live/${id}/photos/${p}`,thumbUrl:`/api/wall/live/${id}/photos/${p}`,sourceLocalName:`live-${id}-${p}.jpg`});
 const exists=(id,p)=>fs.existsSync(path.join(root(),`${id}-${p}.jpg`));
 const active=s=>{const target=s?.sessionSlug&&resolveSession(s.sessionSlug);return s&&s.until>clock()&&target&&target.id===s.sessionId;};
 function list(sessionSlug){return fs.readdirSync(root()).filter(f=>f.endsWith('.json')).flatMap(f=>{const id=f.slice(0,-5),s=read(id);return active(s)&&(sessionSlug===undefined||s.sessionSlug===sessionSlug)?s.ids.filter(p=>exists(id,p)).map(p=>({...photo(id,p),sessionSlug:s.sessionSlug})):[];});}
 router.get('/',authorize,(_req,res)=>res.json({ok:true,liveWallBridge:2,sessions:sessions()}));
 router.put('/:source',authorize,(req,res)=>{
  const id=req.params.source,ids=req.body?.ids;
  if(!valid(id)||!Array.isArray(ids)||ids.length>4000||ids.some(p=>!valid(p))||new Set(ids).size!==ids.length)return res.status(400).json({error:'Invalid Live photo list'});
  const old=read(id),target=resolveSession(req.body.sessionSlug);
  // Empty snapshots can always revoke a source, even after its destination expires.
  if(ids.length&&(!target||target.id!==req.body.sessionId))return res.status(409).json({error:'Choose an active Gallery event'});
  if(ids.length&&old?.ids.length&&old.sessionId&&old.sessionId!==target.id)return res.status(409).json({error:'Disconnect before changing the Gallery event'});
  const sessionSlug=target?.slug||old?.sessionSlug,sessionId=target?.id||old?.sessionId;
  const prior=active(old)&&old.sessionId===sessionId?old.ids:[],keep=new Set(ids);
  write(id,{ids,sessionSlug,sessionId,until:clock()+60000});
  for(const p of old?.ids||[])if(!keep.has(p)){fs.rmSync(path.join(root(),`${id}-${p}.jpg`),{force:true});emit('photo.removed',{id:photo(id,p).id},old?.sessionSlug);}
  for(const p of ids)if(!prior.includes(p)&&exists(id,p))emit('photo.added',photo(id,p),sessionSlug);
  res.set('Cache-Control','no-store').json({ok:true,missing:ids.filter(p=>!exists(id,p))});
 });
 const upload=multer({storage:multer.memoryStorage(),limits:{fileSize:25*1024*1024,files:1}}).single('photo');
 router.post('/:source/photos/:photo',authorize,upload,async(req,res,next)=>{try{
  const {source:id,photo:p}=req.params;if(!valid(id)||!valid(p)||!req.file)return res.status(400).json({error:'Invalid Live photo'});
  const uploadActive=()=>{const s=read(id);return active(s)&&s.ids.includes(p);};
  if(!uploadActive())return res.sendStatus(409);
  const bytes=await sharp(req.file.buffer,{limitInputPixels:40000000}).rotate().resize({width:2400,height:2400,fit:'inside',withoutEnlargement:true}).jpeg({quality:88}).toBuffer();
  if(!uploadActive())return res.sendStatus(409);
  fs.writeFileSync(path.join(root(),`${id}-${p}.jpg`),bytes);emit('photo.added',photo(id,p),read(id).sessionSlug);res.json({ok:true});
 }catch(err){next(err);}});
 router.get('/:source/photos/:photo',(req,res)=>{const {source:id,photo:p}=req.params;if(!valid(id)||!valid(p))return res.sendStatus(404);const s=read(id);if(!active(s)||!s.ids.includes(p)||!exists(id,p))return res.sendStatus(404);res.set('Cache-Control','no-store').type('jpeg').send(fs.readFileSync(path.join(root(),`${id}-${p}.jpg`)));});
 const timer=setInterval(()=>{const next=new Map(list().map(p=>[p.id,p.sessionSlug]));for(const [id,slug] of visible)if(!next.has(id))emit('photo.removed',{id},slug);visible=next;},5000);timer.unref();
 return {router,list,close:()=>clearInterval(timer)};
}
