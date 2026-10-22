const assert=require('node:assert/strict'),fs=require('fs'),path=require('path'),sharp=require('sharp');
const {classifyFraming,resolveDepthBackground}=require('../electron/background-depth.cjs');
const {prepareScene}=require('../electron/ai-edit-preparation.cjs');
const root=path.resolve(__dirname,'../..'),dir=path.join(root,'photobooth-app/config/ai-backgrounds/scene'),qa=path.join(root,'builds/ai-flow-qa');
(async()=>{
assert.equal(classifyFraming([{h:308}],1024),'close');assert.equal(classifyFraming([{h:200}],1024),'medium');assert.equal(classifyFraming([{h:120}],1024),'wide');assert.equal(classifyFraming([{h:320},{h:120}],1024),'close');
for(const scene of ['pumpkin-patch','moonlit-manor'])for(const [depth,h] of [['close',350],['medium',200],['wide',100]]){
 const r=resolveDepthBackground(path.join(dir,scene+'.png'),[{h}],1024);assert.equal(r.depth,depth);assert.ok(r.path.includes(scene));const meta=await sharp(r.path).metadata();assert.equal(meta.width,1536);assert.equal(meta.height,1024);
 fs.copyFileSync(r.path,path.join(qa,scene+'-'+depth+'.png'));
}
const results=[];
for(const [fixture,scene,depth] of [['single','pumpkin-patch','close'],['group','moonlit-manor','medium']]){
 const start=Date.now();const p=await prepareScene(path.join(qa,fixture+'.png'),path.join(dir,scene+'.png'),path.join(root,'photobooth-app/config/ai-models'));
 assert.equal(p.depth,depth);assert.equal(p.blur,0);
 const out=await sharp(p.image).removeAlpha().raw().toBuffer(),source=await sharp(p.original).removeAlpha().raw().toBuffer();let opaque=0;
 for(let i=0;i<p.alpha.length;i++)if(p.alpha[i]===255 && p.lightingWeights[i]===0){opaque++;for(let c=0;c<3;c++)assert.equal(out[i*3+c],source[i*3+c]);}
 fs.writeFileSync(path.join(qa,fixture+'-depth-result.png'),p.image);results.push({fixture,scene,depth,opaquePixelsUnchanged:opaque,elapsedMs:Date.now()-start});
}
fs.writeFileSync(path.join(qa,'depth-validation.json'),JSON.stringify(results,null,2));console.log(JSON.stringify(results,null,2));
})().catch(e=>{console.error(e);process.exitCode=1});
