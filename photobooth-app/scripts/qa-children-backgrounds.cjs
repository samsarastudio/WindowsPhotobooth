'use strict';
const fs=require('node:fs'),path=require('node:path'),sharp=require('sharp');
const {prepareScene}=require('../electron/ai-edit-preparation.cjs');
const {detectFaces}=require('../electron/face-geometry.cjs');
const root=path.resolve(__dirname,'../..'),qa=path.join(root,'builds/ai-flow-qa');
const models=path.join(root,'photobooth-app/config/ai-models');
const scenes=['pumpkin-patch','moonlit-manor','haunted-crypt'];
async function main(){
 const fixtures=JSON.parse(fs.readFileSync(path.join(qa,'children-fixtures.json')));
 const results=[];
 for(const f of fixtures)for(const scene of scenes){
  const start=Date.now();
  const p=await prepareScene(path.join(qa,f.id+'.png'),path.join(root,'photobooth-app/config/ai-backgrounds/scene',scene+'.png'),models);
  const faces=await detectFaces(p.original,path.join(models,'yunet.onnx'));
  const original=await sharp(p.original).removeAlpha().raw().toBuffer(),out=await sharp(p.image).removeAlpha().raw().toBuffer(),bg=await sharp(p.reference).removeAlpha().raw().toBuffer();
  let changedFacePixels=0,changedInteriorPixels=0,changedBackgroundPixels=0,checkedFacePixels=0;
  for(let i=0;i<p.alpha.length;i++){
   const changed=[0,1,2].some(c=>original[i*3+c]!==out[i*3+c]);
   if(p.faceProtection[i]&&p.alpha[i]===255){checkedFacePixels++;if(changed)changedFacePixels++;}
   if(p.alpha[i]===255&&!p.lightingWeights[i]&&changed)changedInteriorPixels++;
   if(p.alpha[i]===0&&[0,1,2].some(c=>out[i*3+c]!==bg[i*3+c]))changedBackgroundPixels++;
  }
  const filename=`children-${f.id}-${scene}.png`;
  fs.writeFileSync(path.join(qa,filename),p.image);
  const row={fixture:f.id,scene,depth:p.depth,crop:p.crop,expectedFaces:f.faces,detectedFaces:faces.length,checkedFacePixels,changedFacePixels,changedInteriorPixels,changedBackgroundPixels,elapsedMs:Date.now()-start,filename};
  row.pixelChecksPass=faces.length===f.faces&&checkedFacePixels>0&&changedFacePixels===0&&changedInteriorPixels===0&&changedBackgroundPixels===0;
  results.push(row);console.log(JSON.stringify(row));
 }
 fs.writeFileSync(path.join(qa,'children-test-results.json'),JSON.stringify({scope:'Generated fictional inputs; real prepareScene pipeline, automatic depth; no upload or printing tested',results},null,2));
 for(const f of fixtures){
  const files=[f.id+'.png',...results.filter(r=>r.fixture===f.id).map(r=>r.filename)];
  const tiles=[];
  for(const [i,file]of files.entries())tiles.push({input:await sharp(path.join(qa,file)).resize(600,400,{fit:'contain'}).png().toBuffer(),left:(i%2)*600,top:Math.floor(i/2)*400});
  await sharp({create:{width:1200,height:800,channels:3,background:'#15121a'}}).composite(tiles).png().toFile(path.join(qa,f.id+'-overview.png'));
 }
 const html=`<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Children and families — background tests</title><style>body{background:#15121a;color:#f5edde;font:16px/1.6 system-ui;margin:auto;max-width:1500px;padding:24px}.grid{display:grid;grid-template-columns:repeat(4,1fr);gap:14px}img{width:100%}figure{margin:0}a{color:#ffc479}aside{background:#302530;padding:18px}section{margin:36px 0}@media(max-width:850px){.grid{grid-template-columns:1fr 1fr}}</style><h1>Children and families: 12 background tests</h1><aside>Fictional AI-generated test photographs. Outputs use the app's actual background pipeline and automatic depth selection. Wide captures receive a proportional portrait crop; checks compare against that cropped input. Pixel checks cover opaque protected face regions, unlit opaque interiors and exposed backgrounds. They do not certify fine-hair quality or realism. Visual review remains separate.</aside>${fixtures.map(f=>`<section><h2>${f.description}</h2><div class="grid"><figure><a href="${f.id}.png"><img src="${f.id}.png" alt="Original ${f.description}"></a><figcaption>Original · ${f.faces} people</figcaption></figure>${results.filter(r=>r.fixture===f.id).map(r=>`<figure><a href="${r.filename}"><img src="${r.filename}" alt="${r.scene} result"></a><figcaption>${({"pumpkin-patch":"Original Pumpkin Patch","moonlit-manor":"Enchanted Harvest Garden","haunted-crypt":"Pumpkin Lantern Cottage"})[r.scene]} · ${r.depth}<br>${r.detectedFaces}/${r.expectedFaces} faces detected · ${(r.elapsedMs/1000).toFixed(1)}s<br>Pixel checks: ${r.pixelChecksPass?'pass':'FAIL'}</figcaption></figure>`).join('')}</div></section>`).join('')}<a href="children-test-results.json">Detailed checks and timings</a></html>`;
 fs.writeFileSync(path.join(qa,'children-tests.html'),html);
 if(results.some(r=>!r.pixelChecksPass))process.exitCode=1;
}
main().catch(e=>{console.error(e);process.exitCode=1;});
