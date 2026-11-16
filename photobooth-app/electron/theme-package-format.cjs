'use strict';
// Data-only ZIP contract shared by Moments and Electron. No archive paths reach disk before validation.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const zlib = require('node:zlib');
const MAX_ZIP = 90 * 1024 * 1024, MAX_TOTAL = 400 * 1024 * 1024;
const ID = /^[a-z][a-z0-9-]{0,47}$/, VERSION = /^\d{1,4}\.\d{1,4}\.\d{1,4}$/;
const CONFIG_KEYS = new Set(['aiModes','defaultAiModeId','aiGenerationEnabled','guestModes','photoFrames','copy']);
const sha = b => crypto.createHash('sha256').update(b).digest('hex');
function safeName(name) {
 if(typeof name !== 'string'||name.length>220||!name||name.includes('\\')||/[:\x00-\x1f]/.test(name)||name.split('/').some(s=>!s||s==='.'||s==='..'||/[. ]$/.test(s)||/^(con|prn|aux|nul|com\d|lpt\d)(\.|$)/i.test(s)))throw Error('Unsafe package path');
 if(!/\.(json|css|png|jpg|jpeg|webp|ttf|woff2|txt|md)$/i.test(name))throw Error('Unsupported package file: '+name);
 return name;
}
function cleanObject(obj){if(obj&&typeof obj==='object')for(const [k,v]of Object.entries(obj)){if(['__proto__','prototype','constructor'].includes(k))throw Error('Unsafe configuration key');cleanObject(v);}}
function validateManifest(m, files) {
 cleanObject(m);
 if(m.schemaVersion!==1||!ID.test(m.id)||!VERSION.test(m.version)||!VERSION.test(m.minAppVersion)||typeof m.name!=='string'||!m.name.trim()||m.name.length>100)throw Error('Invalid package manifest');
 if(!m.config||typeof m.config!=='object'||Array.isArray(m.config))throw Error('Missing package configuration');
 if(m.config.copy?.qr?.bypassCode!==undefined)throw Error('Package cannot change QR access codes');
 for(const k of Object.keys(m.config))if(!CONFIG_KEYS.has(k))throw Error('Package cannot change '+k);
 if(!m.files||typeof m.files!=='object'||Array.isArray(m.files))throw Error('Missing file inventory');
 const listed=Object.keys(m.files);if(listed.length!==files.size-1)throw Error('File inventory mismatch');
 for(const name of listed){safeName(name);const b=files.get(name);if(name==='package.json'||!b||!/^([a-f0-9]{64})$/.test(m.files[name])||sha(b)!==m.files[name])throw Error('Checksum mismatch: '+name);}
 for(const name of ['theme/theme.json','theme/styles.css'])if(!files.has(name))throw Error('Missing '+name);
 const theme=JSON.parse(files.get('theme/theme.json'));if(theme.id!==m.id)throw Error('Theme ID must match package');
 for(const [name,b]of files){
  if(name.endsWith('.json')){const j=JSON.parse(b);cleanObject(j);
   if(name.endsWith('.depths.json'))for(const ref of Object.values(j.variants||{})){safeName(ref);const f=path.posix.join(path.posix.dirname(name),ref);if(!files.has(f))throw Error('Missing depth plate '+f);}
  }
  if(name.endsWith('.css')){
   const css=b.toString('utf8').replace(/\/\*[\s\S]*?\*\//g,'');if(/https?:|data:|file:|javascript:|image-set\s*\(|@import|expression\s*\(|-moz-binding|behavior\s*:/i.test(css)||/\\/.test(css))throw Error('Unsafe CSS');
   for(const match of css.matchAll(/url\s*\(\s*['"]?([^)'"\s]+)['"]?\s*\)/gi)){
    const ref=match[1];if(/^[a-z]+:|^\/|[?#%]/i.test(ref))throw Error('CSS resources must be packaged');
    const resolved=path.posix.normalize(path.posix.join(path.posix.dirname(name),ref));safeName(resolved);if(!files.has(resolved))throw Error('Missing CSS resource: '+ref);
   }
  }
 }
 const p=m.presentation||{};
 for(const k of ['hero','photo','portrait','scene','familyCard'])if(p[k]){safeName(p[k]);if(!files.has(p[k]))throw Error('Missing presentation asset');}
 if(p.familyCardEnabled===true)for(const f of ['theme/artwork/family-card-window.png','theme/artwork/family-card-evergreen-divider.png','theme/fonts/GreatVibes-Regular.ttf'])if(!files.has(f))throw Error('Missing family card artwork');
 for(const f of [m.config.photoFrames?.defaultFrameFile,m.config.photoFrames?.defaultPortraitFrameFile,...(m.config.photoFrames?.guestFrameFiles||[])])if(f&&(!files.has('config/photo-frames/'+f)||path.posix.basename(f)!==f))throw Error('Missing frame '+f);
 return m;
}
function readPackage(input) {
 const b=Buffer.isBuffer(input)?input:fs.readFileSync(input);if(b.length>MAX_ZIP||b.length<22)throw Error('Invalid package size');
 let end=-1;for(let i=b.length-22;i>=Math.max(0,b.length-65557);i--)if(b.readUInt32LE(i)===0x06054b50&&i+22+b.readUInt16LE(i+20)===b.length){end=i;break;}
 if(end<0||b.readUInt16LE(end+4)||b.readUInt16LE(end+6))throw Error('Unsupported ZIP');
 const count=b.readUInt16LE(end+10),size=b.readUInt32LE(end+12);let at=b.readUInt32LE(end+16),total=0;
 if(count<2||count>2000||at+size!==end||b.readUInt16LE(end+8)!==count)throw Error('Invalid ZIP directory');
 const files=new Map(),seen=new Set();
 for(let i=0;i<count;i++){
  if(at+46>end||b.readUInt32LE(at)!==0x02014b50)throw Error('Invalid ZIP entry');
  const flags=b.readUInt16LE(at+8),method=b.readUInt16LE(at+10),compressed=b.readUInt32LE(at+20),length=b.readUInt32LE(at+24),nl=b.readUInt16LE(at+28),el=b.readUInt16LE(at+30),cl=b.readUInt16LE(at+32),offset=b.readUInt32LE(at+42),mode=b.readUInt32LE(at+38)>>>16;
  const name=b.subarray(at+46,at+46+nl).toString('utf8');at+=46+nl+el+cl;
  if(at>end||flags&1||![0,8].includes(method)||(mode&0xf000)===0xa000)throw Error('Unsupported ZIP entry');
  if(name.endsWith('/')){safeName(name.slice(0,-1)+'/folder.txt');continue;}
  safeName(name);const key=name.toLowerCase();if(seen.has(key))throw Error('Duplicate ZIP path');seen.add(key);
  total+=length;if(length>80*1024*1024||total>MAX_TOTAL)throw Error('Package expands beyond limit');
  if(offset+30>b.length||b.readUInt32LE(offset)!==0x04034b50)throw Error('Invalid ZIP offset');
  const start=offset+30+b.readUInt16LE(offset+26)+b.readUInt16LE(offset+28);
  if(start+compressed>b.readUInt32LE(end+16))throw Error('Invalid ZIP data');
  const raw=b.subarray(start,start+compressed),data=method===0?raw:zlib.inflateRawSync(raw,{maxOutputLength:Math.max(1,length)});
  if(data.length!==length)throw Error('ZIP length mismatch');files.set(name,data);
 }
 if(at!==end||!files.has('package.json'))throw Error('Root package.json required');
 const manifest=validateManifest(JSON.parse(files.get('package.json')),files);
 return {manifest,files,sha256:sha(b),bytes:b.length};
}
function compatible(required,actual){const a=actual.split('.').map(Number),r=required.split('.').map(Number);for(let i=0;i<3;i++){if(a[i]>r[i])return true;if(a[i]<r[i])return false;}return true;}
module.exports={readPackage,validateManifest,safeName,sha,compatible,MAX_ZIP};
