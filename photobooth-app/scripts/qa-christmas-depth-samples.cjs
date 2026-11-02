'use strict';
const fs=require('fs'),path=require('path'),sharp=require('sharp'),assert=require('assert/strict'),crypto=require('crypto');
const root=path.resolve(__dirname,'../..'),app=path.join(root,'photobooth-app'),out=path.join(root,'output/christmas/samples-depth');
const comp=require('../electron/subject-compositor.cjs'),realReplace=comp.replaceBackground,cache=new Map();
// Reuse real ONNX segmentation per source; every scene still uses the production compositor.
comp.replaceBackground=async(src,bg,model)=>{const key=crypto.createHash('sha256').update(src).digest('hex');if(!cache.has(key))cache.set(key,await comp.subjectMask(src,model));return realReplace(src,bg,model,cache.get(key));};
const {prepareScene}=require('../electron/ai-edit-preparation.cjs');
(async()=>{
 const manifestPath=path.join(app,'themes/christmas/depth-revision-prompts.json'),m=JSON.parse(fs.readFileSync(manifestPath,'utf8'));
 const wide=JSON.parse(fs.readFileSync(path.join(out,'wide-prompt.json'),'utf8'));Object.assign(m.samples.find(x=>x.id==='sample-wide'),wide);fs.writeFileSync(manifestPath,JSON.stringify(m,null,2)+'\n');
 const scenes=m.backgrounds.filter(x=>x.depth==='medium'),results=[];
 for(const depth of ['close','medium','wide']){
  const src=path.join(out,`sample-${depth}_crop.png`);fs.copyFileSync(path.join(out,`sample-${depth}.png`),src);
  for(const scene of scenes){
   const base=path.join(app,'config/ai-backgrounds/scene',scene.id+(['pumpkin-patch','moonlit-manor','haunted-crypt'].includes(scene.id)?'.png':'.webp'));
   const p=await prepareScene(src,base,path.join(app,'config/ai-models'));if(!scene.single)assert.equal(p.depth,depth,scene.id);
   assert.equal(p.crop,null);const original=await sharp(p.original).removeAlpha().raw().toBuffer(),actual=await sharp(p.image).removeAlpha().raw().toBuffer();let checked=0,changed=0,visible=0;
   for(let i=0;i<p.alpha.length;i++){if(p.alpha[i]<10)visible++;if(p.alpha[i]===255&&p.lightingWeights[i]===0){checked++;if([0,1,2].some(c=>actual[i*3+c]!==original[i*3+c]))changed++;}}
   assert.equal(changed,0);assert(checked>10000);
   const result=path.join(out,`${depth}-${scene.id}.png`),framed=result.replace('.png','-framed.png');fs.writeFileSync(result,p.image);
   await sharp(p.image).resize(1800,1200).composite([{input:path.join(app,'config/photo-frames/halloween-haunt.png')}]).png().toFile(framed);
   results.push({depth,scene:scene.id,label:scene.label,selectedDepth:p.depth,source:src,result,framed,protectedPixels:checked,changedPixels:changed,visibleBackground:visible/p.alpha.length});console.log('PASS',depth,scene.label,'background',Math.round(100*visible/p.alpha.length)+'%');
  }
 }
 fs.writeFileSync(path.join(out,'report.json'),JSON.stringify({pipeline:'production prepareScene; real cached ONNX masks; guest-approved input crop',results},null,2));
 const tiles=await Promise.all(results.map(async(x,i)=>({input:await sharp(x.framed).resize(360,240).toBuffer(),left:(i%10)*360,top:Math.floor(i/10)*240})));
 await sharp({create:{width:3600,height:720,channels:3,background:'#102720'}}).composite(tiles).jpeg({quality:90}).toFile(path.join(out,'all-depths.jpg'));
})().catch(e=>{console.error(e);process.exitCode=1;});
