const test=require('node:test'),assert=require('node:assert/strict'),fs=require('fs'),path=require('path'),os=require('os'),sharp=require('../node_modules/sharp');
const {PackageStore}=require('../electron/theme-packages.cjs'),{readPackage,sha}=require('../electron/theme-package-format.cjs'),{resolveDepthBackground,classifyFraming}=require('../electron/background-depth.cjs');
const root=path.resolve(__dirname,'../../deliverables/skin-packages');
test('cricket 1.2.5 carries five distinct sets and all fifteen original-logic depth selections',async()=>{
 const temp=fs.mkdtempSync(path.join(os.tmpdir(),'cricket-depth-test-'));
 try{const store=new PackageStore(temp,'1.3.0');const m=store.install(fs.readFileSync(path.join(root,'sports-cricket-1.2.5.booth.zip')));const dir=store.directory(m),seen=new Set();
 for(const id of ['stadium-lights','players-tunnel','pavilion','kwca-trophy-gallery','kwca-players-pavilion']){const bg=path.join(dir,'config/ai-backgrounds/scene',id+'.webp');const meta=JSON.parse(fs.readFileSync(bg.replace('.webp','.depths.json')));assert.deepEqual(Object.keys(meta.variants).sort(),['close','medium','wide']);
 for(const [depth,h]of [['wide',100],['medium',200],['close',350]]){const result=resolveDepthBackground(bg,[{h}],1024);assert.equal(result.depth,depth);assert.equal(result.path,path.join(path.dirname(bg),meta.variants[depth]));const bytes=fs.readFileSync(result.path),image=await sharp(bytes).metadata();assert.equal(image.width,1536);assert.equal(image.height,1024);seen.add(sha(bytes));}
 }
 assert.equal(seen.size,15,'Every depth must be a separately generated plate');assert.equal(classifyFraming([{h:80},{h:350}],1024),'close');assert.equal(classifyFraming([],1024),'wide');
 assert.equal(m.presentation.photo,'presentation/classic-black.webp');assert.match(m.config.copy.boothMode.defaultHint,/original photo.*black backdrop/);assert.equal(m.minAppVersion,'1.3.0');
 const before=readPackage(path.join(root,'sports-cricket-1.2.0.booth.zip'));for(const [name,hash]of Object.entries(before.manifest.files))if(name.startsWith('config/ai-backgrounds/'))assert.equal(m.files[name],hash,'Keep approved backdrops unchanged');
 assert.equal(m.config.photoFrames.guestTextCreditLine,'KWCA');
 for(const [orientation,w,h]of [['landscape',1800,1200],['portrait',1200,1800]]){const file=m.config.photoFrames[orientation==='landscape'?'defaultFrameFile':'defaultPortraitFrameFile'];const img=sharp(fs.readFileSync(path.join(dir,'config/photo-frames',file)));const meta=await img.metadata();assert.equal(meta.width,w);assert.equal(meta.height,h);assert.equal(meta.hasAlpha,true);const {data,info}=await img.ensureAlpha().raw().toBuffer({resolveWithObject:true});const alpha=(x,y)=>data[(y*info.width+x)*4+3];assert.ok(alpha(w/2,h/2)<=4);assert.ok(alpha(w/2,Math.floor(h*.3))<=4);assert.ok(alpha(w/2,Math.floor(h*.7))<=4);for(let x=0;x<w;x++)assert.equal(alpha(x,h-1),255);for(let y=0;y<h;y++){assert.equal(alpha(0,y),255);assert.equal(alpha(w-1,y),255);}}
 }finally{fs.rmSync(temp,{recursive:true,force:true});}
});
