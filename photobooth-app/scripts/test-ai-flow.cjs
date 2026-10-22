'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const sharp=require('sharp');
const p=require('../electron/ai-edit-preparation.cjs');
const dir=path.resolve(__dirname,'../../builds/ai-flow-qa');
const models=path.resolve(__dirname,'../config/ai-models');
const plate=path.resolve(__dirname,'../public/halloween/scene.png');
async function main(){
 const results=[];
 for(const name of ['single','group']){
   const input=path.join(dir,name+'.png');
   const prepared=await p.prepareScene(input,plate,models);
   assert.equal(prepared.alpha.length,1536*1024);
   assert.equal(prepared.strictScene,true);
   const output=await p.preserveSceneSubjects(prepared,Buffer.from('untrusted generated pixels'));
   assert.deepEqual(output,prepared.image,'Generated people must never enter strict background output');
   const rgb=await sharp(output).removeAlpha().raw().toBuffer();
   const original=await sharp(prepared.original).removeAlpha().raw().toBuffer();
   const background=await sharp(prepared.reference).removeAlpha().raw().toBuffer();
   let subjectPixels=0,changedSubject=0,backgroundPixels=0,changedBackground=0;
   for(let i=0;i<prepared.alpha.length;i++){
     if(prepared.alpha[i]===255 && prepared.lightingWeights[i]===0){subjectPixels++;for(let c=0;c<3;c++)if(rgb[i*3+c]!==original[i*3+c]){changedSubject++;break;}}
     if(prepared.alpha[i]===0){backgroundPixels++;for(let c=0;c<3;c++)if(rgb[i*3+c]!==background[i*3+c]){changedBackground++;break;}}
   }
   assert.equal(changedSubject,0,'All opaque source pixels, including hair and outer face, must remain exact');
   assert.equal(changedBackground,0);
   assert.ok(subjectPixels>300000);
   fs.writeFileSync(path.join(dir,name+'-strict-result.png'),output);
   await sharp(prepared.alpha,{raw:{width:1536,height:1024,channels:1}}).png().toFile(path.join(dir,name+'-strict-mask.png'));
   results.push({name,subjectPixels,changedSubject,backgroundPixels,changedBackground,backgroundBlur:prepared.blur});
 }
 await assert.rejects(()=>p.prepareHead(path.join(dir,'group.png'),path.resolve(__dirname,'../config/compositions/vampire/composition.png'),models),/one clearly visible face/);
 for(const name of ['vampire','witch','bride','morticia','phantom','reaper','werewolf']){
   const folder=path.resolve(__dirname,'../config/compositions',name);
   const face=JSON.parse(fs.readFileSync(path.join(folder,'composition.json'),'utf8')).face;
   const prepared=await p.prepareHead(path.join(dir,'single.png'),path.join(folder,'composition.png'),models,face);
   assert.equal((await sharp(prepared.mask).metadata()).width,1024);
 }
 const head=await p.prepareHead(path.join(dir,'single.png'),path.resolve(__dirname,'../config/compositions/vampire/composition.png'),models);
 const headResult=await p.preservePortraitPlate(head,fs.readFileSync(path.join(dir,'head-api-raw.png')));
 fs.writeFileSync(path.join(dir,'head-api-result.png'),headResult);
 fs.writeFileSync(path.join(dir,'validation.json'),JSON.stringify({results,groupPortraitRejected:true,characterMasks:7},null,2));
 console.log(JSON.stringify({results,groupPortraitRejected:true,characterMasks:7},null,2));
}
main().catch(e=>{console.error(e);process.exitCode=1});
