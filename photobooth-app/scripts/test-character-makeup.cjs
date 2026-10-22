const assert=require('node:assert/strict'),sharp=require('sharp');
const {PRESETS,applyCharacterMakeup}=require('../electron/character-makeup.cjs');
(async()=>{
 const image=await sharp({create:{width:400,height:600,channels:3,background:'#b89b87'}}).png().toBuffer();
 const face={x:100,y:100,w:200,h:250,points:[{x:155,y:185},{x:245,y:185},{x:200,y:245},{x:167,y:295},{x:233,y:295}]};
 const original=await sharp(image).ensureAlpha().raw().toBuffer();
 for(const id of Object.keys(PRESETS)){
  const result=await applyCharacterMakeup(image,face,id),m=await sharp(result).metadata();assert.equal(m.width,400);assert.equal(m.height,600);
  const pixels=await sharp(result).ensureAlpha().raw().toBuffer();
  for(const point of [{x:0,y:0},...face.points.slice(0,2)]){
   const i=(point.y*400+point.x)*4;assert.deepEqual(pixels.subarray(i,i+4),original.subarray(i,i+4),id+' must preserve eye centres and background');
  }
  assert.notDeepEqual(pixels,original,id+' must add visible paint');
 }
 console.log('PASS all seven makeup presets preserve dimensions, eye centres and background');
})().catch(e=>{console.error(e);process.exitCode=1});
