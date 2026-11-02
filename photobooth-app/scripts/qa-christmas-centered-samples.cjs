'use strict';
const fs=require('fs'),path=require('path'),sharp=require('sharp'),assert=require('assert/strict'),crypto=require('crypto'),{execFileSync}=require('child_process');
const root=path.resolve(__dirname,'../..'),app=path.join(root,'photobooth-app'),out=path.join(root,'output/christmas/samples-centered');
const {prepareScene}=require('../electron/ai-edit-preparation.cjs');
(async()=>{
 const id=process.argv[2];
 if(id){
  const meta=JSON.parse(fs.readFileSync(path.join(out,id+'-prompt.json'))),source=path.join(root,meta.asset);
  const ext=['pumpkin-patch','moonlit-manor','haunted-crypt'].includes(id)?'.png':'.webp';
  const p=await prepareScene(source,path.join(app,'config/ai-backgrounds/scene',id+ext),path.join(app,'config/ai-models'));
  const original=await sharp(p.original).removeAlpha().raw().toBuffer(),actual=await sharp(p.image).removeAlpha().raw().toBuffer();let left=1536,right=0,checked=0,changed=0,visible=0;
  for(let i=0;i<p.alpha.length;i++){
   if(p.alpha[i]>=245){left=Math.min(left,i%1536);right=Math.max(right,i%1536);}
   if(p.alpha[i]<10)visible++;
   if(p.alpha[i]===255&&p.lightingWeights[i]===0){checked++;if([0,1,2].some(c=>actual[i*3+c]!==original[i*3+c]))changed++;}
  }
  const centerOffset=Math.abs((left+right)/2-768)/1536;
  assert(centerOffset<=.05,`Source off center: ${id} ${(centerOffset*100).toFixed(1)}%`);assert.equal(changed,0);assert(checked>10000);assert.equal(p.crop,null);
  const result=path.join(out,id+'-result.png'),framed=path.join(out,id+'-framed.png');fs.writeFileSync(result,p.image);
  await sharp(p.image).resize(1800,1200).composite([{input:path.join(app,'config/photo-frames/halloween-haunt.png')}]).png().toFile(framed);
  const entry={scene:id,label:meta.label,source,result,framed,selectedDepth:p.depth,sourceSha256:crypto.createHash('sha256').update(fs.readFileSync(source)).digest('hex'),centerOffset,subjectBounds:{left,right},visibleBackground:visible/p.alpha.length,protectedPixels:checked,changedPixels:changed};
  fs.writeFileSync(path.join(out,id+'-qa.json'),JSON.stringify(entry,null,2));console.log('PASS',meta.label,'center offset',Math.round(centerOffset*1000)/10+'%','depth',p.depth,'background',Math.round(100*visible/p.alpha.length)+'%');return;
 }
 const jobs=fs.readdirSync(out).filter(x=>x.endsWith('-prompt.json')).sort();assert.equal(jobs.length,10);
 for(const file of jobs)execFileSync(process.execPath,[__filename,file.replace('-prompt.json','')],{stdio:'inherit',windowsHide:true});
 const results=jobs.map(x=>JSON.parse(fs.readFileSync(path.join(out,x.replace('-prompt.json','-qa.json')))));
 assert.equal(new Set(results.map(x=>x.sourceSha256)).size,10);
 fs.writeFileSync(path.join(out,'report.json'),JSON.stringify({pipeline:'Production prepareScene with actual ONNX segmentation; ten unique centered sources; no subject repositioning',results},null,2));
 for(const field of ['source','framed']){
  const tiles=await Promise.all(results.map(async(x,i)=>({input:await sharp(x[field]).resize(480,320).toBuffer(),left:i%5*480,top:Math.floor(i/5)*320})));
  await sharp({create:{width:2400,height:640,channels:3,background:'#fff4e7'}}).composite(tiles).jpeg({quality:93}).toFile(path.join(out,field+'-contact-sheet.jpg'));
 }
})().catch(e=>{console.error(e);process.exitCode=1});
