'use strict';
const fs=require('node:fs');
const path=require('node:path');
const assert=require('node:assert/strict');
const sharp=require('sharp');
const {replaceBackground}=require('../electron/subject-compositor.cjs');
const {classifyFraming}=require('../electron/background-depth.cjs');
const {detectFaces}=require('../electron/face-geometry.cjs');
const root=path.resolve(__dirname,'../..');
const qa=path.join(root,'builds/ai-flow-qa');
const models=path.join(root,'photobooth-app/config/ai-models');
const scenes=['pumpkin-patch','moonlit-manor','haunted-crypt'];
const depths=['close','medium','wide'];
const names={'pumpkin-patch':'Original Halloween set','moonlit-manor':'Moonlit Manor','haunted-crypt':'Haunted Crypt'};

async function main(){
 const only=process.argv[2];
 const results=only?JSON.parse(fs.readFileSync(path.join(qa,'six-background-results.json'))).results.filter(r=>r.scene!==only):[];
 for(const person of ['single','group']){
  const original=await sharp(path.join(qa,person+'.png')).rotate().resize(1536,1024,{fit:'contain',background:'#202020'}).removeAlpha().png().toBuffer();
  const rgb=await sharp(original).raw().toBuffer();
  const faces=await detectFaces(original,path.join(models,'yunet.onnx'));
  const recommended=classifyFraming(faces,1024);
  for(const scene of scenes.filter(s=>!only||s===only))for(const depth of depths){
   const start=Date.now();
   const plate=path.join(root,'photobooth-app/config/ai-backgrounds/scene/depths',scene,depth+'.png');
   // Force each plate through the actual compositor, bypassing only automatic
   // variant choice so all six scenarios are exercised, with no extra blur.
   const r=await replaceBackground(original,plate,path.join(models,'birefnet-lite.onnx'));
   const out=await sharp(r.output).removeAlpha().raw().toBuffer();
   const bg=await sharp(r.plate).removeAlpha().raw().toBuffer();
   let opaquePixels=0,changedOpaquePixels=0,changedBackgroundPixels=0,litEdgePixels=0,changedFacePixels=0;
   for(let i=0;i<r.alpha.length;i++){
    if(r.lightingWeights[i]>0)litEdgePixels++;
    if(r.faceProtection[i]&&r.alpha[i]===255&&[0,1,2].some(c=>out[i*3+c]!==rgb[i*3+c]))changedFacePixels++;
    if(r.alpha[i]===255&&r.lightingWeights[i]===0){opaquePixels++;if([0,1,2].some(c=>out[i*3+c]!==rgb[i*3+c]))changedOpaquePixels++;}
    if(r.alpha[i]===0&&[0,1,2].some(c=>out[i*3+c]!==bg[i*3+c]))changedBackgroundPixels++;
   }
   assert.equal(changedFacePixels,0);assert.ok(litEdgePixels>1000);assert.equal(changedOpaquePixels,0);assert.equal(changedBackgroundPixels,0);
   const filename=`matrix-${person}-${scene}-${depth}.png`;
   fs.writeFileSync(path.join(qa,filename),r.output);
   const row={person,scene,depth,recommended:depth===recommended,faces:faces.length,opaquePixels,changedOpaquePixels,changedBackgroundPixels,litEdgePixels,changedFacePixels,elapsedMs:Date.now()-start,filename};
   results.push(row);console.log(JSON.stringify(row));
  }
 }
 fs.writeFileSync(path.join(qa,'six-background-results.json'),JSON.stringify({method:'Actual local BiRefNet compositor; explicit plate selection; original generated fixtures; no generative person edits',results},null,2));
 for(const person of ['single','group']){
  const tiles=[];
  for(const [i,row] of results.filter(r=>r.person===person).entries()){
   const tile=await sharp(path.join(qa,row.filename)).resize(512,342).png().toBuffer();
   tiles.push({input:tile,left:(i%3)*512,top:Math.floor(i/3)*342});
  }
  await sharp({create:{width:1536,height:1026,channels:3,background:'#15121d'}}).composite(tiles).png().toFile(path.join(qa,`matrix-${person}-overview.png`));
 }
 const html=`<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>18 background tests</title><style>body{margin:0;background:#100e15;color:#fff4df;font:16px/1.6 system-ui}main{max-width:1500px;margin:auto;padding:32px 24px}h1,h2{font-family:Georgia,serif;font-weight:400}h1{font-size:42px}.grid{display:grid;grid-template-columns:repeat(3,1fr);gap:18px}.card{padding:12px;background:#211c29;border:1px solid #65523d;border-radius:12px}.recommended{border-color:#e9ae66}img{display:block;width:100%;border-radius:6px}a{color:#f4bd73}p,small{color:#cfc5ce}.badge{color:#f4bd73}h3{margin:8px 0;font-size:18px}.note{padding:16px;border-left:3px solid #f4bd73;background:#211c29}@media(max-width:800px){.grid{grid-template-columns:1fr}}</style><main><h1>Nine backgrounds × two guest photos</h1><p class="note">All 18 outputs use the real app compositor and the same original generated single/group photos. Every depth is forced for comparison; guests are never scaled or redrawn to fit it. Highlighted cards match the app's automatic face-size estimate. A wide plate does not turn a waist-up input into a full-length photo.</p><p>Pixel checks passed: zero changed protected face or unlit opaque subject pixels and zero changed fully exposed background pixels in all 18 outputs. An inward edge band receives restrained background-coloured light; face regions are protected. Fine-hair matting artifacts remain; these checks do not certify visual realism.</p>${['single','group'].map(person=>`<h2>${person==='single'?'Single guest':'Three-person group'}</h2><p><a href="${person}.png">Original input</a> · <a href="matrix-${person}-overview.png">Nine-up overview</a></p>${scenes.map(scene=>`<h3>${names[scene]}</h3><div class="grid">${results.filter(r=>r.person===person&&r.scene===scene).map(r=>`<div class="card ${r.recommended?'recommended':''}"><a href="${r.filename}"><img src="${r.filename}" alt="${person}, ${names[scene]}, ${r.depth}"></a><h3>${r.depth==='close'?'Close portrait':r.depth==='medium'?'Waist-up / medium':'Full-length / wide'}</h3><small>${(r.elapsedMs/1000).toFixed(1)}s · ${r.recommended?'<span class="badge">Automatic choice</span>':'Forced comparison'}</small></div>`).join('')}</div>`).join('')}`).join('')}<p><a href="six-background-results.json">All timings and pixel checks</a> · <a href="background-depths.html">Background plates</a></p></main></html>`;
 fs.writeFileSync(path.join(qa,'six-background-tests.html'),html);
}
main().catch(error=>{console.error(error);process.exitCode=1;});
