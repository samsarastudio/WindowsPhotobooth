import fs from 'node:fs';
import path from 'node:path';
import {Router} from 'express';
import multer from 'multer';
import sharp from 'sharp';

// Live sources use the same wall metadata and photo.added stream as booth captures.
// A short renewable lease prevents disconnected/crashed Live servers leaving old photos visible.
export function createLiveWallBridge({dir,authorize,notify,clock=Date.now}) {
 const router=Router(),valid=v=>typeof v==='string'&&/^[a-zA-Z0-9-]{1,80}$/.test(v);
 const root=()=>{fs.mkdirSync(dir,{recursive:true});return dir;};
 const read=id=>{try{return JSON.parse(fs.readFileSync(path.join(root(),id+'.json'),'utf8'));}catch{return null;}};
 const write=(id,s)=>{const f=path.join(root(),id+'.json');fs.writeFileSync(f+'.tmp',JSON.stringify(s));fs.renameSync(f+'.tmp',f);};
 const photo=(id,p)=>({id:`live-${id}-${p}`,variant:'framed',processStatus:'ready',url:`/api/wall/live/${id}/photos/${p}`,thumbUrl:`/api/wall/live/${id}/photos/${p}`,sourceLocalName:`live-${id}-${p}.jpg`});
 const exists=(id,p)=>fs.existsSync(path.join(root(),`${id}-${p}.jpg`));
 function list(){return fs.readdirSync(root()).filter(f=>f.endsWith('.json')).flatMap(f=>{const id=f.slice(0,-5),s=read(id);return s&&s.until>clock()?s.ids.filter(p=>exists(id,p)).map(p=>photo(id,p)):[];});}
 router.get('/',authorize,(_req,res)=>res.json({ok:true,liveWallBridge:1}));
 router.put('/:source',authorize,(req,res)=>{
  const id=req.params.source,ids=req.body?.ids;
  if(!valid(id)||!Array.isArray(ids)||ids.length>4000||ids.some(p=>!valid(p))||new Set(ids).size!==ids.length)return res.status(400).json({error:'Invalid Live photo list'});
  const old=read(id),prior=old?.until>clock()?old.ids:[],keep=new Set(ids);
  write(id,{ids,until:clock()+60000});
  for(const p of old?.ids||[])if(!keep.has(p)){fs.rmSync(path.join(root(),`${id}-${p}.jpg`),{force:true});notify('photo.removed',{id:photo(id,p).id});}
  for(const p of ids)if(!prior.includes(p)&&exists(id,p))notify('photo.added',photo(id,p));
  res.set('Cache-Control','no-store').json({ok:true,missing:ids.filter(p=>!exists(id,p))});
 });
 const upload=multer({storage:multer.memoryStorage(),limits:{fileSize:25*1024*1024,files:1}}).single('photo');
 router.post('/:source/photos/:photo',authorize,upload,async(req,res,next)=>{try{
  const {source:id,photo:p}=req.params;if(!valid(id)||!valid(p)||!req.file)return res.status(400).json({error:'Invalid Live photo'});
  const active=()=>{const s=read(id);return s&&s.until>clock()&&s.ids.includes(p);};
  if(!active())return res.sendStatus(409);
  const bytes=await sharp(req.file.buffer,{limitInputPixels:40000000}).rotate().resize({width:2400,height:2400,fit:'inside',withoutEnlargement:true}).jpeg({quality:88}).toBuffer();
  if(!active())return res.sendStatus(409);
  fs.writeFileSync(path.join(root(),`${id}-${p}.jpg`),bytes);notify('photo.added',photo(id,p));res.json({ok:true});
 }catch(err){next(err);}});
 router.get('/:source/photos/:photo',(req,res)=>{const {source:id,photo:p}=req.params;if(!valid(id)||!valid(p))return res.sendStatus(404);const s=read(id);if(!s||s.until<=clock()||!s.ids.includes(p)||!exists(id,p))return res.sendStatus(404);res.set('Cache-Control','no-store').type('jpeg').send(fs.readFileSync(path.join(root(),`${id}-${p}.jpg`)));});
 let visible=new Set();const timer=setInterval(()=>{const next=new Set(list().map(p=>p.id));for(const id of visible)if(!next.has(id))notify('photo.removed',{id});visible=next;},5000);timer.unref();
 return {router,list,close:()=>clearInterval(timer)};
}
