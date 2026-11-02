'use strict';
// Deterministic geometry regression: real image resizing and depth resolver,
// synthetic segmentation/face detections so no model or guest data is needed.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),sharp=require('sharp');
const {createHash}=require('node:crypto');
const root=path.resolve(__dirname,'../../output/christmas-framing-tests');
fs.mkdirSync(root,{recursive:true});
let current,maskCalls=0;
const compositor=require('../electron/subject-compositor.cjs');
const geometry=require('../electron/face-geometry.cjs');
const originals={mask:compositor.subjectMask,replace:compositor.replaceBackground,detect:geometry.detectFaces};
compositor.subjectMask=async()=>{maskCalls++;const alpha=Buffer.alloc(1536*1024);for(const [x,y,w,h] of current.rects)for(let row=y;row<y+h;row++)alpha.fill(255,row*1536+x,row*1536+x+w);return alpha;};
geometry.detectFaces=async()=>current.faces;
compositor.replaceBackground=async(source,plate,model,alpha)=>{
 alpha=alpha||await compositor.subjectMask();
 assert.equal(alpha.length,1536*1024);const fg=await sharp(source).removeAlpha().joinChannel(alpha,{raw:{width:1536,height:1024,channels:1}}).png().toBuffer();
 return {output:await sharp(plate).composite([{input:fg}]).png().toBuffer(),alpha,lightingWeights:Buffer.alloc(alpha.length),faceProtection:Buffer.alloc(alpha.length)};
};
const {prepareScene}=require('../electron/ai-edit-preparation.cjs');
(async()=>{
 const variants={};
 for(const [depth,color] of [['close','#a03030'],['medium','#30a030'],['wide','#3030a0']]){
  const name=depth+'.png';variants[depth]=name;
  // Distinct edges reveal whether the Halloween composite crop is applied.
  await sharp(Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="1536" height="1024"><rect width="1536" height="1024" fill="${color}"/><rect x="0" y="0" width="40" height="1024" fill="white"/><rect x="1496" y="0" width="40" height="1024" fill="white"/></svg>`)).png().toFile(path.join(root,name));
 }
 const base=path.join(root,'scene.png');fs.copyFileSync(path.join(root,'medium.png'),base);
 fs.writeFileSync(path.join(root,'scene.depths.json'),JSON.stringify({version:1,variants,baseSha256:createHash('sha256').update(fs.readFileSync(base)).digest('hex')}));
 const source=await sharp({create:{width:1536,height:1024,channels:3,background:'#808080'}}).png().toBuffer();
 const scenarios=[
  {name:'close portrait',faces:[{x:600,y:90,w:220,h:330}],rects:[[500,80,500,944]],depth:'close',crop:false},
  {name:'waist-up group',faces:[{x:400,y:100,w:160,h:200},{x:850,y:150,w:150,h:180}],rects:[[300,90,850,934]],depth:'medium',crop:false},
  {name:'low child retains Halloween pre-crop depth',faces:[{x:650,y:520,w:100,h:140}],rects:[[600,500,300,524]],depth:'wide',crop:true},
  {name:'adult and smaller child use largest face',faces:[{x:400,y:80,w:220,h:330},{x:900,y:430,w:100,h:140}],rects:[[300,70,400,954],[800,420,350,604]],depth:'close',crop:false},
  {name:'guest-approved crop stays unchanged',faces:[{x:650,y:520,w:100,h:140}],rects:[[600,500,300,524]],depth:'wide',crop:false,approved:true},
  {name:'masked guest uses silhouette without inventing a face',faces:[],rects:[[600,500,300,524]],depth:'wide',crop:true},
  {name:'wide group stays wide',faces:[{x:100,y:100,w:80,h:120},{x:1300,y:130,w:80,h:120}],rects:[[0,90,1536,934]],depth:'wide',crop:false}
 ];
 for(current of scenarios){
  const file=path.join(root,current.approved?'input_crop.png':'input.png');fs.writeFileSync(file,source);maskCalls=0;
  const result=await prepareScene(file,base,root);
  assert.equal(result.depth,current.depth,current.name);assert.equal(!!result.crop,current.crop,current.name);assert.equal(maskCalls,1,'reuse segmentation');
  let expectedImage=sharp(path.join(root,variants[current.depth]));
  if(result.crop)expectedImage=expectedImage.extract(result.crop).resize(1536,1024);
  const expected=await expectedImage.raw().toBuffer();
  assert.deepEqual(await sharp(result.reference).raw().toBuffer(),expected,'Halloween reframing applies the same crop to guest and background');
  assert.equal(result.blur,0);assert.equal(result.strictScene,true);
  console.log('PASS',current.name);
 }
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(()=>{compositor.subjectMask=originals.mask;compositor.replaceBackground=originals.replace;geometry.detectFaces=originals.detect;});
