'use strict';
const fs=require('node:fs'),path=require('node:path'),sharp=require('sharp'),assert=require('node:assert/strict');
const {prepareScene}=require('../electron/ai-edit-preparation.cjs');
const {detectFaces}=require('../electron/face-geometry.cjs');
const root=path.resolve(__dirname,'../..'),out=path.join(root,'output/christmas/qa');fs.mkdirSync(out,{recursive:true});
const models=path.join(root,'photobooth-app/config/ai-models');
(async()=>{
 const results=[];
 for(const [id,source] of [['single','moments-server/public/assets/halloween/samples/portrait-original.png'],['family','moments-server/public/assets/halloween/samples/scene-original.png']])for(const scene of ['pumpkin-patch','moonlit-manor','haunted-crypt']){
  const p=await prepareScene(path.join(root,source),path.join(root,'photobooth-app/config/ai-backgrounds/scene',scene+'.png'),models);
  const original=await sharp(p.original).removeAlpha().raw().toBuffer(),rgb=await sharp(p.image).removeAlpha().raw().toBuffer();let protectedPixels=0,changed=0;
  for(let i=0;i<p.alpha.length;i++)if(p.alpha[i]===255&&p.lightingWeights[i]===0){protectedPixels++;if(rgb[i*3]!==original[i*3]||rgb[i*3+1]!==original[i*3+1]||rgb[i*3+2]!==original[i*3+2])changed++;}
  assert.equal(changed,0);assert(protectedPixels>10000);
  const file=id+'-'+scene+'.png';fs.writeFileSync(path.join(out,file),p.image);
  const faces=await detectFaces(p.original,path.join(models,'yunet.onnx'));
  results.push({id,scene,depth:p.depth,crop:p.crop,faces:faces.length,protectedPixels,changed,file});console.log(JSON.stringify(results.at(-1)));
 }
 fs.writeFileSync(path.join(out,'results.json'),JSON.stringify(results,null,2));
 const tiles=await Promise.all(results.map(async(r,i)=>({input:await sharp(path.join(out,r.file)).resize(480,320).png().toBuffer(),left:(i%3)*480,top:Math.floor(i/3)*320})));
 await sharp({create:{width:1440,height:640,channels:3,background:'#102d24'}}).composite(tiles).png().toFile(path.join(out,'overview.png'));
})().catch(e=>{console.error(e);process.exitCode=1});
