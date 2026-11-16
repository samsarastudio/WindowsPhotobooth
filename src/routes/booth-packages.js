import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import multer from 'multer';
import { Router } from 'express';
import { config } from '../config.js';
import { requireAdminPin, requireUploadToken } from '../auth.js';
import format from '../lib/theme-package-format.cjs';
const root=()=>{const p=path.join(config.dataDir,'booth-packages');fs.mkdirSync(p,{recursive:true});return p;};
function key(id,version){if(!/^[a-z][a-z0-9-]{0,47}$/.test(id)||!/^\d{1,4}\.\d{1,4}\.\d{1,4}$/.test(version))throw Error('Invalid package reference');return `${id}@${version}`;}
function catalog(){return fs.readdirSync(root()).filter(f=>f.endsWith('.json')).flatMap(f=>{try{return [JSON.parse(fs.readFileSync(path.join(root(),f),'utf8'))];}catch{return [];}});}
function write(meta){const dest=path.join(root(),key(meta.id,meta.version)+'.json'),tmp=dest+'.'+crypto.randomUUID();fs.writeFileSync(tmp,JSON.stringify(meta,null,2));fs.renameSync(tmp,dest);}
export const boothPackagesRouter=Router(),adminBoothPackagesRouter=Router();
boothPackagesRouter.use(requireUploadToken);adminBoothPackagesRouter.use(requireAdminPin);
boothPackagesRouter.get('/',(_req,res)=>res.json({ok:true,packages:catalog().filter(p=>p.published)}));
adminBoothPackagesRouter.get('/',(_req,res)=>res.json({ok:true,packages:catalog()}));
const upload=multer({storage:multer.memoryStorage(),limits:{fileSize:format.MAX_ZIP,files:1,fields:1}});
adminBoothPackagesRouter.post('/',upload.single('package'),(req,res)=>{
 try{if(!req.file)throw Error('Choose a package ZIP');const p=format.readPackage(req.file.buffer),m=p.manifest,k=key(m.id,m.version),zip=path.join(root(),k+'.zip');if(fs.existsSync(zip))return res.status(409).json({ok:false,error:'Version already exists. Publish a new version.'});
 const temp=zip+'.'+crypto.randomUUID();fs.writeFileSync(temp,req.file.buffer);fs.renameSync(temp,zip);
 const meta={id:m.id,version:m.version,name:m.name,description:m.description||'',minAppVersion:m.minAppVersion,bytes:p.bytes,sha256:p.sha256,published:false,createdAt:new Date().toISOString()};write(meta);res.status(201).json({ok:true,package:meta});
 }catch(e){res.status(400).json({ok:false,error:e.message});}
});
adminBoothPackagesRouter.patch('/:id/:version',(req,res)=>{try{const k=key(req.params.id,req.params.version),meta=JSON.parse(fs.readFileSync(path.join(root(),k+'.json'),'utf8'));if(typeof req.body.published!=='boolean')throw Error('published must be a boolean');meta.published=req.body.published;write(meta);res.json({ok:true,package:meta});}catch(e){res.status(400).json({ok:false,error:e.message});}});
boothPackagesRouter.get('/:id/:version/download',(req,res)=>{try{const k=key(req.params.id,req.params.version),meta=JSON.parse(fs.readFileSync(path.join(root(),k+'.json'),'utf8'));if(!meta.published)return res.sendStatus(404);res.set('Cache-Control','private, no-store');res.download(path.join(root(),k+'.zip'),k+'.zip');}catch{res.sendStatus(404);}});
adminBoothPackagesRouter.use((err,_req,res,_next)=>res.status(400).json({ok:false,error:err.message}));
