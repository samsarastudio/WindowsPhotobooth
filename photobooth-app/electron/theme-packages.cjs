'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {readPackage,compatible,sha,MAX_ZIP}=require('./theme-package-format.cjs');
class PackageStore {
 constructor(root,version){this.root=root;this.version=version;fs.mkdirSync(root,{recursive:true});}
 state(){try{return JSON.parse(fs.readFileSync(path.join(this.root,'state.json'),'utf8'));}catch{return {active:null,previous:null};}}
 directory(ref){if(!ref||!/^[a-z][a-z0-9-]{0,47}$/.test(ref.id)||!/^\d{1,4}\.\d{1,4}\.\d{1,4}$/.test(ref.version))throw Error('Invalid package reference');return path.join(this.root,ref.id,ref.version);}
 manifest(ref){return JSON.parse(fs.readFileSync(path.join(this.directory(ref),'package.json'),'utf8'));}
 active(){const s=this.state();if(!s.active)return null;return {dir:this.directory(s.active),manifest:this.manifest(s.active)};}
 list(){const found=[];for(const id of fs.readdirSync(this.root,{withFileTypes:true})){if(!id.isDirectory()||id.name.startsWith('.'))continue;for(const version of fs.readdirSync(path.join(this.root,id.name))){try{const m=this.manifest({id:id.name,version});found.push({...m,files:undefined,config:undefined,compatible:compatible(m.minAppVersion,this.version)});}catch{}}}return found;}
 install(buffer,expected){if(expected&&sha(buffer)!==expected)throw Error('Download checksum mismatch');const p=readPackage(buffer);if(!compatible(p.manifest.minAppVersion,this.version))throw Error('Update booth app to '+p.manifest.minAppVersion+' before installing this package');const dest=this.directory(p.manifest);
  if(fs.existsSync(dest)){const old=this.manifest(p.manifest);if(JSON.stringify(old)!==JSON.stringify(p.manifest))throw Error('This version already exists with different content; publish a new version');this.verify(p.manifest);return p.manifest;}
  const stage=path.join(this.root,'.install-'+crypto.randomUUID());fs.mkdirSync(stage);
  try{for(const [name,b]of p.files){const f=path.join(stage,...name.split('/'));fs.mkdirSync(path.dirname(f),{recursive:true});fs.writeFileSync(f,b);}fs.mkdirSync(path.dirname(dest),{recursive:true});fs.renameSync(stage,dest);}finally{fs.rmSync(stage,{recursive:true,force:true});}return p.manifest;
 }
 verify(ref){const m=this.manifest(ref);if(!compatible(m.minAppVersion,this.version))throw Error('Package needs a newer app');for(const [f,hash]of Object.entries(m.files)){if(sha(fs.readFileSync(path.join(this.directory(ref),f)))!==hash)throw Error('Installed package damaged: '+f);}return m;}
 activate(ref){if(ref)this.verify(ref);const old=this.state(),next={active:ref?{id:ref.id,version:ref.version}:null,previous:old.active,activatedAt:new Date().toISOString()};const tmp=path.join(this.root,'.state-'+crypto.randomUUID());fs.writeFileSync(tmp,JSON.stringify(next));fs.renameSync(tmp,path.join(this.root,'state.json'));return next;}
 rollback(){return this.activate(this.state().previous);}
 remove(ref){const s=this.state();for(const locked of [s.active,s.previous])if(locked?.id===ref.id&&locked?.version===ref.version)throw Error('Active and rollback packages must be retained');fs.rmSync(this.directory(ref),{recursive:true,force:true});}
}
async function downloadPackage(base,token,ref){
 const u=new URL(base);if(u.protocol!=='https:'&&!['localhost','127.0.0.1'].includes(u.hostname))throw Error('Moments must use HTTPS');
 const headers={Authorization:'Bearer '+token},signal=AbortSignal.timeout(180000);
 const catalog=await fetch(new URL('/api/booth-packages',u),{headers,signal,redirect:'error'});if(!catalog.ok)throw Error('Moments catalog: HTTP '+catalog.status);
 const data=await catalog.json(),entry=data.packages?.find(p=>p.id===ref.id&&p.version===ref.version);if(!entry)throw Error('Package no longer published');
 const response=await fetch(new URL(`/api/booth-packages/${encodeURIComponent(ref.id)}/${encodeURIComponent(ref.version)}/download`,u),{headers,signal,redirect:'error'});if(!response.ok)throw Error('Download: HTTP '+response.status);
 const chunks=[];let bytes=0;for await(const chunk of response.body){bytes+=chunk.length;if(bytes>MAX_ZIP||bytes>entry.bytes)throw Error('Download exceeds advertised size');chunks.push(chunk);}if(bytes!==entry.bytes)throw Error('Incomplete download');const buffer=Buffer.concat(chunks);if(sha(buffer)!==entry.sha256)throw Error('Download checksum mismatch');return buffer;
}
module.exports={PackageStore,downloadPackage};
