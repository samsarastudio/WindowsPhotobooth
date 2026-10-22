'use strict';
const fs = require('node:fs');
const sharp = require('sharp');
const sessions = new Map();

async function subjectMask(image, modelPath) {
  if (!fs.existsSync(modelPath)) throw new Error('Subject isolation model is missing. Reinstall the complete folder build.');
  const ort = require('onnxruntime-node');
  const highResolution = /birefnet/i.test(modelPath);
  const size = highResolution ? 1024 : 320;
  if (!sessions.has(modelPath)) sessions.set(modelPath, ort.InferenceSession.create(fs.readFileSync(modelPath), {
    executionProviders: ['cpu'], intraOpNumThreads: 4,
    // Avoid the arena's large reserve allocations on a shared kiosk PC.
    // This changes allocation strategy, not model resolution or predictions.
    enableCpuMemArena: false, enableMemPattern: false,
  }).catch(error => { sessions.delete(modelPath); throw error; }));
  const session = await sessions.get(modelPath);
  const rgb = await sharp(image).rotate().removeAlpha().resize(size, size, { fit: 'fill' }).raw().toBuffer();
  const values = new Float32Array(3 * size * size);
  let max = 1;
  for (const v of rgb) max = Math.max(max, v);
  const mean = [.485, .456, .406], std = [.229, .224, .225];
  for (let i = 0; i < size * size; i++) for (let c = 0; c < 3; c++) {
    values[c * size * size + i] = (rgb[i * 3 + c] / max - mean[c]) / std[c];
  }
  const result = await session.run({ [session.inputNames[0]]: new ort.Tensor('float32', values, [1, 3, size, size]) });
  const rawPrediction = result[session.outputNames[0]].data;
  const prediction = highResolution ? Float32Array.from(rawPrediction, v => 1 / (1 + Math.exp(-v))) : rawPrediction;
  let low = Infinity, high = -Infinity;
  for (const v of prediction) { low = Math.min(low, v); high = Math.max(high, v); }
  if (high - low < .01) throw new Error('No clear subject found. Please retake with everyone fully visible.');
  const bytes = Buffer.alloc(prediction.length);
  for (let i = 0; i < bytes.length; i++) bytes[i] = Math.round(255 * Math.max(0, Math.min(1, (prediction[i] - low) / (high - low))));
  const meta = await sharp(image).metadata();
  const alpha = await sharp(bytes, { raw: { width: size, height: size, channels: 1 } })
    .resize(meta.width, meta.height, { fit: 'fill', kernel: 'lanczos3' }).greyscale().raw().toBuffer();
  // Keep subject interiors fully opaque: no accidental facial color blending.
  for (let i = 0; i < alpha.length; i++) alpha[i] = alpha[i] > (highResolution ? 253 : 235) ? 255 : alpha[i] < (highResolution ? 2 : 10) ? 0 : alpha[i];
  return alpha;
}

async function replaceBackground(source, background, modelPath) {
  const normalized = await sharp(source).rotate().removeAlpha().png().toBuffer();
  const { width, height } = await sharp(normalized).metadata();
  const alpha = await subjectMask(normalized, modelPath);
  const sourceRgb = await sharp(normalized).raw().toBuffer();
  const foregroundRgb = /birefnet/i.test(modelPath) ? removeEdgeSpill(sourceRgb, alpha, width, height) : sourceRgb;
  const plate = await sharp(background).rotate().resize(width, height, { fit: 'cover', position: 'centre' }).removeAlpha().png().toBuffer();
  let lightingWeights=Buffer.alloc(alpha.length);
  let faceProtection=Buffer.alloc(alpha.length);
  if (/birefnet/i.test(modelPath)) {
    const {detectFaces}=require('./face-geometry.cjs');
    const faces=await detectFaces(normalized,require('node:path').join(require('node:path').dirname(modelPath),'yunet.onnx'));
    const lighting=await applyEdgeLighting(foregroundRgb,alpha,plate,width,height,faces);
    lightingWeights=lighting.weights;faceProtection=lighting.faceProtection;
  }
  const foreground = await sharp(foregroundRgb,{raw:{width,height,channels:3}}).joinChannel(alpha, { raw: { width, height, channels: 1 } }).png().toBuffer();
  const output = await sharp(plate).composite([{ input: foreground }]).png().toBuffer();
  return { output, alpha, foreground, plate, width, height, lightingWeights, faceProtection };
}

async function applyEdgeLighting(rgb,alpha,plate,width,height,faces) {
  const radius=Math.max(2,8*width/1536);
  const soft=await sharp(alpha,{raw:{width,height,channels:1}}).blur(radius).greyscale().raw().toBuffer();
  const light=await sharp(plate).removeAlpha().blur(radius*4).raw().toBuffer();
  const weights=Buffer.alloc(alpha.length),faceProtection=Buffer.alloc(alpha.length);
  for(const f of faces)for(let y=Math.max(0,Math.floor(f.y-f.h*.18));y<Math.min(height,f.y+f.h*1.2);y++){
    for(let x=Math.max(0,Math.floor(f.x-f.w*.2));x<Math.min(width,f.x+f.w*1.2);x++){
      if(Math.hypot((x-f.x-f.w/2)/(f.w*.7),(y-f.y-f.h*.5)/(f.h*.7))<=1)faceProtection[y*width+x]=255;
    }
  }
  // A smooth inward light wrap, rather than a luminous outline. Scene colour is
  // sampled locally; dark crypts do not receive the warm porch's orange light.
  // No alpha/position changes, no face edits, and no global subject grading.
  for(let i=0;i<alpha.length;i++){
    if(alpha[i]===0||faceProtection[i])continue;
    const boundary=Math.max(0,Math.min(1,(255-soft[i])/128));
    const luminance=(light[i*3]*.2126+light[i*3+1]*.7152+light[i*3+2]*.0722)/255;
    const weight=.24*boundary*(.55+.45*luminance);
    weights[i]=Math.round(weight*255);
    for(let c=0;c<3;c++){
      const original=rgb[i*3+c];
      const adjustment=Math.max(-18,Math.min(18,(light[i*3+c]-original)*weight));
      rgb[i*3+c]=Math.round(original+adjustment);
    }
  }
  return {weights,faceProtection};
}

// Recover foreground color at mixed edge pixels using the nearest known old
// background. This changes neither coordinates nor opaque subject pixels, and
// never synthesizes hair, skin, clothing, or geometry.
function removeEdgeSpill(rgb, alpha, width, height) {
  const count=alpha.length, nearest=new Int32Array(count).fill(-1), queue=new Int32Array(count);
  let head=0,tail=0;
  for(let i=0;i<count;i++) if(alpha[i]<=1){nearest[i]=i;queue[tail++]=i;}
  while(head<tail){
    const i=queue[head++],x=i%width;
    for(const j of [x>0?i-1:-1,x<width-1?i+1:-1,i-width,i+width]){
      if(j<0||j>=count||nearest[j]>=0||alpha[j]===255)continue;
      nearest[j]=nearest[i];queue[tail++]=j;
    }
  }
  const output=Buffer.from(rgb);
  for(let i=0;i<count;i++){
    const a=alpha[i]/255,b=nearest[i];
    if(a<=0||a>=1||b<0)continue;
    for(let c=0;c<3;c++) output[i*3+c]=Math.round(Math.max(0,Math.min(255,(rgb[i*3+c]-(1-a)*rgb[b*3+c])/a)));
  }
  return output;
}

module.exports = { subjectMask, replaceBackground, removeEdgeSpill, applyEdgeLighting };
