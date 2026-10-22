'use strict';
const assert=require('node:assert/strict');
const sharp=require('sharp');
const {applyEdgeLighting}=require('../electron/subject-compositor.cjs');
(async()=>{
 const width=128,height=128,alpha=Buffer.alloc(width*height),rgb=Buffer.alloc(width*height*3,100);
 for(let y=15;y<120;y++)for(let x=25;x<103;x++)alpha[y*width+x]=255;
 const originalAlpha=Buffer.from(alpha);
 const face={x:40,y:20,w:48,h:48};
 const warm=await sharp({create:{width,height,channels:3,background:'#ffae60'}}).png().toBuffer();
 const r=await applyEdgeLighting(rgb,alpha,warm,width,height,[face]);
 assert.deepEqual(alpha,originalAlpha,'Lighting must never change the silhouette');
 let changed=0;
 for(let i=0;i<alpha.length;i++)for(let c=0;c<3;c++){
  assert.ok(Math.abs(rgb[i*3+c]-100)<=18,'Lighting must remain restrained');
  if(alpha[i]===0||r.faceProtection[i])assert.equal(rgb[i*3+c],100,'Outside silhouette and faces must stay untouched');
  if(rgb[i*3+c]!==100)changed++;
 }
 assert.ok(changed>0);assert.equal(rgb[(110*width+64)*3],100,'Subject interior must stay unchanged');
 assert.ok(rgb[(90*width+25)*3]>rgb[(90*width+25)*3+2],'Warm plate must produce warm edge light');
 console.log('PASS: unchanged alpha/face/interior, no outside glow, bounded lighting, background colour response. Visual blend review is separate.');
})().catch(error=>{console.error(error);process.exitCode=1});
