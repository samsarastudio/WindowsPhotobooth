const fs=require('fs'),path=require('path'),assert=require('node:assert/strict'),sharp=require('sharp');
const {resolveAiSource}=require('../electron/ai-source.cjs');
const {prepareScene}=require('../electron/ai-edit-preparation.cjs');
const {detectFaces}=require('../electron/face-geometry.cjs');
(async()=>{
 const root=path.resolve(__dirname,'../..');
 const capture=path.join(root,'builds/midnight-manor-preview/capture/capture_2026-10-19T21-14-51-637Z');
 for(const suffix of ['_framed.png','_framed_framed.png','_physical.png'])assert.equal(resolveAiSource(capture+suffix),capture+'.jpg');
 assert.equal(resolveAiSource(capture+'.jpg'),capture+'.jpg');
 assert.throws(()=>resolveAiSource(capture+'-missing_framed.png'),/original capture is missing/);
 const models=path.join(root,'photobooth-app/config/ai-models');
 const source=resolveAiSource(capture+'_framed.png');
 const p=await prepareScene(source,path.join(root,'photobooth-app/config/ai-backgrounds/scene/pumpkin-patch.png'),models);
 const faces=await detectFaces(p.original,path.join(models,'yunet.onnx'));assert.equal(faces.length,4);
 const before=await sharp(p.original).removeAlpha().raw().toBuffer(),after=await sharp(p.image).removeAlpha().raw().toBuffer();
 for(let i=0;i<p.alpha.length;i++)if(p.faceProtection[i]&&p.alpha[i]===255)for(let c=0;c<3;c++)assert.equal(before[i*3+c],after[i*3+c]);
 fs.writeFileSync(path.join(root,'builds/ai-flow-qa/framed-source-fixed.png'),p.image);
 console.log('PASS: original capture selected for single/double frames and physical sheets; missing original rejected; actual failing family capture completes with four protected faces.');
})().catch(e=>{console.error(e);process.exitCode=1});
