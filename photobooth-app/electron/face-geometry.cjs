'use strict';
const sharp = require('sharp');
const fs = require('node:fs');
const ort = require('onnxruntime-node');
let sessionPromise;
function overlap(a, b) {
  const area = Math.max(0, Math.min(a.x+a.w,b.x+b.w)-Math.max(a.x,b.x)) * Math.max(0, Math.min(a.y+a.h,b.y+b.h)-Math.max(a.y,b.y));
  return area / (a.w*a.h+b.w*b.h-area);
}
async function detectFaces(source, modelPath) {
  sessionPromise ||= ort.InferenceSession.create(fs.readFileSync(modelPath), { executionProviders: ['cpu'], intraOpNumThreads: 2 }).catch(error => { sessionPromise = null; throw error; });
  const session = await sessionPromise;
  const {width,height} = await sharp(source).metadata();
  const size = 640, scale = size / Math.max(width,height);
  const rw=Math.round(width*scale), rh=Math.round(height*scale);
  const rgb = await sharp(source).removeAlpha().resize(rw,rh).extend({left:0,top:0,right:size-rw,bottom:size-rh,background:'#000'}).raw().toBuffer();
  const pixels=size*size, tensor=new Float32Array(pixels*3);
  for(let i=0;i<pixels;i++) for(let c=0;c<3;c++) tensor[c*pixels+i]=rgb[i*3+2-c];
  const result=await session.run({input:new ort.Tensor('float32',tensor,[1,3,size,size])});
  const candidates=[];
  for(const stride of [8,16,32]) {
    const cls=result['cls_'+stride].data,obj=result['obj_'+stride].data,box=result['bbox_'+stride].data,kps=result['kps_'+stride].data;
    const cols=size/stride;
    for(let i=0;i<cls.length;i++) {
      const score=Math.sqrt(Math.max(0,Math.min(1,cls[i]))*Math.max(0,Math.min(1,obj[i])));
      if(score<.8) continue;
      const row=Math.floor(i/cols), col=i%cols;
      const w=Math.exp(box[i*4+2])*stride/scale,h=Math.exp(box[i*4+3])*stride/scale;
      const x=(col+box[i*4])*stride/scale-w/2,y=(row+box[i*4+1])*stride/scale-h/2;
      const points=[];
      for(let p=0;p<5;p++) points.push({x:(kps[i*10+p*2]+col)*stride/scale,y:(kps[i*10+p*2+1]+row)*stride/scale});
      candidates.push({x,y,w,h,points,score});
    }
  }
  const faces=[];
  for(const f of candidates.sort((a,b)=>b.score-a.score)) if(!faces.some(g=>overlap(f,g)>.3)) faces.push(f);
  return faces;
}
module.exports={detectFaces};
