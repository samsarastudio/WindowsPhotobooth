const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('fs'),os=require('os'),path=require('path');
const {seedVibrantScenes,VIBRANT_SCENES}=require('../electron/ota-assets.cjs');
test('new scenes seed on upgraded kiosks once, preserve custom art and credentials, respect individual removals',()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'scenes-ota-')),bundle=path.join(root,'bundle'),config=path.join(root,'config'),dest=path.join(config,'ai-backgrounds/scene');
 try{
  fs.mkdirSync(path.join(bundle,'ai-backgrounds/scene'),{recursive:true});fs.mkdirSync(path.join(dest,'.removed/old'),{recursive:true});
  for(const name of VIBRANT_SCENES)fs.writeFileSync(path.join(bundle,'ai-backgrounds/scene',name),'new asset');
  fs.writeFileSync(path.join(dest,'.removed/old/old-scene.png'),'old removed asset');
  fs.writeFileSync(path.join(dest,VIBRANT_SCENES[0]),'custom');
  fs.writeFileSync(path.join(config,'photobooth-config.json'),JSON.stringify({secret:'preserve-me',aiModes:[{pipeline:'scene',allowBackgroundChoice:false}]}));
  fs.writeFileSync(path.join(config,'.assets-1.1.47'),'old');
  seedVibrantScenes(bundle,config);
  for(const name of VIBRANT_SCENES)assert(fs.existsSync(path.join(dest,name)));
  assert.equal(fs.readFileSync(path.join(dest,VIBRANT_SCENES[0]),'utf8'),'custom');
  const saved=JSON.parse(fs.readFileSync(path.join(config,'photobooth-config.json')));assert.equal(saved.secret,'preserve-me');assert.equal(saved.aiModes[0].allowBackgroundChoice,true);
  fs.unlinkSync(path.join(dest,VIBRANT_SCENES[1]));seedVibrantScenes(bundle,config);assert(!fs.existsSync(path.join(dest,VIBRANT_SCENES[1])));
 }finally{fs.rmSync(root,{recursive:true,force:true});}
});
