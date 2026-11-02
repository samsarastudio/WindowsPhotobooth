const fs=require('fs'),path=require('path'),vm=require('vm'),assert=require('node:assert/strict'),sharp=require('sharp');
const source=fs.readFileSync(path.join(__dirname,'../electron/main.cjs'),'utf8');
function fn(name){const start=source.search(new RegExp('(?:async )?function '+name+'\\('));const end=source.indexOf('\n}',start)+2;return source.slice(start,end);}
const context={require,fs,Buffer,Uint8Array};vm.createContext(context);
vm.runInContext('const FRAME_HOLE_BLACK_MAX=18;'+['isChromaHolePixel','floodFillHoleMask','fallbackHoleRect','holeRectFromBounds','prepareFrameOverlay','compositePhotoIntoFrame','clampPhysicalCrop','computeRotatedCrop'].map(fn).join('\n'),context);
(async()=>{
 const out=path.resolve(__dirname,'../../output/frame-qa');fs.mkdirSync(out,{recursive:true});
 const white=await sharp({create:{width:1800,height:1200,channels:3,background:'#ffffff'}}).png().toBuffer();
 for(const file of ['halloween-haunt.png','halloween-haunt-portrait.png']){
  const frame=path.resolve(__dirname,'../config/photo-frames',file);const prepared=await context.prepareFrameOverlay(sharp,frame);
  const overlay=await sharp(prepared.overlay).ensureAlpha().raw().toBuffer();
  const frameMeta=await sharp(frame).metadata();
  const expected=await sharp({create:{width:frameMeta.width,height:frameMeta.height,channels:4,background:'#ffffff'}}).composite([{input:prepared.overlay}]).raw().toBuffer();
  const serverPrepared=await require('../../moments-server/src/frame-overlay.cjs').prepareFrameOverlay(sharp,frame);
  assert.equal(JSON.stringify(serverPrepared.hole),JSON.stringify(prepared.hole),'Booth/server frame bounds differ');
  for(const scale of [1,.8]){
   const result=await context.compositePhotoIntoFrame(sharp,frame,white,scale);const pixels=await sharp(result).ensureAlpha().raw().toBuffer();let checked=0;
   for(let i=0;i<overlay.length;i+=4)if(overlay[i+3]===0){assert.equal(pixels[i],255,'Uncovered opening');checked++;}
   for(let i=0;i<overlay.length;i+=4)if(overlay[i+3]<255)for(let c=0;c<3;c++)assert(Math.abs(pixels[i+c]-expected[i+c])<=1,'Black backing under translucent edge');
   assert(checked>100000);console.log('PASS full opening coverage',file,scale,checked);
  }
  const photo=path.resolve(__dirname,'../../moments-server/public/assets/halloween/samples',file.includes('portrait')?'portrait-original.png':'scene-original.png');
  fs.writeFileSync(path.join(out,file),await context.compositePhotoIntoFrame(sharp,frame,photo));
 }
 // Transparent custom artwork is not chroma-keyed.
 const custom=path.join(out,'custom.png');await sharp({create:{width:200,height:200,channels:4,background:'#000'}}).composite([{input:Buffer.from('<svg width="160" height="160"><rect width="160" height="160" fill="white"/></svg>'),left:20,top:20,blend:'dest-out'}]).png().toFile(custom);
 const p=await context.prepareFrameOverlay(sharp,custom);assert.equal(p.keyed,false);
 console.log('PASS custom frame preserved');
})().catch(e=>{console.error(e);process.exitCode=1});
