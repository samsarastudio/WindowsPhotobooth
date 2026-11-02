'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),sharp=require('sharp');
const {resolveDepthBackground}=require('../electron/background-depth.cjs');
const {detectFaces}=require('../electron/face-geometry.cjs');
const root=path.resolve(__dirname,'../..'),app=path.join(root,'photobooth-app'),dir=path.join(app,'config/ai-backgrounds/scene'),out=path.join(root,'output/christmas');
(async()=>{
 const files=fs.readdirSync(dir).filter(x=>/\.(png|webp)$/.test(x));assert.equal(files.length,10);
 let sets=0;const tiles=[];
 for(const [i,file]of files.entries()){
  const base=path.join(dir,file),sidecar=JSON.parse(fs.readFileSync(base.replace(/\.[^.]+$/,'.depths.json')));assert(sidecar.displayName);
  if(sidecar.version===1){sets++;for(const [depth,h]of [['close',350],['medium',200],['wide',100]]){
   const selected=resolveDepthBackground(base,[{h}],1024);assert.equal(selected.depth,depth);
   const meta=await sharp(selected.path).metadata();assert.equal(meta.width,1536);assert.equal(meta.height,1024);
   const faces=await detectFaces(selected.path,path.join(app,'config/ai-models/yunet.onnx'));
   assert(!faces.some(f=>f.h>1024*.22),'Unexpected foreground person in '+file+' '+depth);
  }}
  tiles.push({input:await sharp(base).resize(384,256).png().toBuffer(),left:(i%5)*384,top:Math.floor(i/5)*256});
 }
 assert.equal(sets,7);fs.mkdirSync(out,{recursive:true});
 await sharp({create:{width:1920,height:512,channels:3,background:'#09251f'}}).composite(tiles).png().toFile(path.join(out,'scenes-review.png'));
 const config=JSON.parse(fs.readFileSync(path.join(app,'config/photobooth-config.default.json')));assert.equal(config.aiModes.filter(x=>x.pipeline==='head-swap').length,7);assert.equal(config.photoFrames.guestFrameFiles.length,8);
 for(const file of config.photoFrames.guestFrameFiles){const meta=await sharp(path.join(app,'config/photo-frames',file)).metadata();assert(meta.hasAlpha);assert.equal(meta.width/meta.height,file.includes('portrait')?2/3:3/2);}
 console.log('PASS 10 choices, 7 checksum-valid depth sets, 24 plates, 7 portraits, 8 transparent guest frames; no detected foreground-sized faces in scene sets.');
})().catch(e=>{console.error(e);process.exitCode=1});
