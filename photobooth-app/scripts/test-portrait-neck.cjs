const assert=require('node:assert/strict'),path=require('path'),sharp=require('sharp');
const {prepareHead}=require('../electron/ai-edit-preparation.cjs');
const {expandFaceForHair}=require('../electron/ai-pipelines.cjs');
(async()=>{
 const app=path.resolve(__dirname,'..'),root=path.resolve(app,'..');
 const face=require('../config/compositions/witch/composition.json').face;
 const p=await prepareHead(path.join(root,'output/signage/current-app/woman-original.png'),path.join(app,'config/compositions/witch/composition.png'),path.join(app,'config/ai-models'),expandFaceForHair(face));
 const alpha=await sharp(p.mask).extractChannel('alpha').raw().toBuffer();
 // Regression: the old face-only mask restored a grey template patch at the collar.
 const x=Math.round(p.face.x+p.face.w/2),y=Math.round(p.face.y+p.face.h*1.5);
 assert.equal(alpha[y*1024+x],0,'Jaw-to-collar join must retain the generated pixels');
 assert.equal(alpha[0],255,'Unrelated background remains protected');
 assert.equal(alpha[1535*1024+1023],255,'Lower costume remains protected');
 console.log('PASS portrait mask includes collar connection and protects outer plate');
})().catch(e=>{console.error(e);process.exitCode=1;});
