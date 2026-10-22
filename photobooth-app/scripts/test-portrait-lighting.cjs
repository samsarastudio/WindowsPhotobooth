const assert=require('node:assert/strict'),sharp=require('sharp');
const {matchPortraitLighting}=require('../electron/portrait-lighting.cjs');
(async()=>{
 const w=120,h=160,raw=Buffer.alloc(w*h*4);
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){
  const i=(y*w+x)*4,v=((x>35&&x<42)||(x>78&&x<85))&&y>48&&y<66?75:180;
  raw[i]=v;raw[i+1]=v-15;raw[i+2]=v-30;raw[i+3]=x<8?0:255;
 }
 const face=await sharp(raw,{raw:{width:w,height:h,channels:4}}).png().toBuffer();
 const target=await sharp({create:{width:w,height:h,channels:3,background:{r:100,g:95,b:90}}}).png().toBuffer();
 const result=await matchPortraitLighting(face,target);
 const {data,info}=await sharp(result).raw().toBuffer({resolveWithObject:true});
 assert.equal(info.width,w);assert.equal(info.height,h);
 for(let i=0;i<w*h;i++)assert.equal(data[i*4+3],raw[i*4+3],'Alpha/geometry must remain unchanged');
 const at=(x,y)=>data[(y*w+x)*4];assert.ok(at(60,80)<150,'Bright face must adopt darker illumination');
 assert.ok(at(38,55)<at(50,55),'Existing facial feature stays at exactly the same location');
 assert.ok(at(81,55)<at(70,55),'Second feature remains at the same location');
 console.log('PASS illumination matching darkens face, retains dimensions, alpha and feature locations');
})().catch(e=>{console.error(e);process.exitCode=1});
