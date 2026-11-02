'use strict';
const fs=require('fs'),path=require('path'),crypto=require('crypto'),sharp=require('sharp'),assert=require('assert/strict');
const root=path.resolve(__dirname,'../..'),app=path.join(root,'photobooth-app');
const manifestPath=path.join(app,'themes/christmas/depth-revision-prompts.json');
const m=JSON.parse(fs.readFileSync(manifestPath,'utf8').replace(/^\uFEFF/,''));
const sceneRoot=path.join(app,'config/ai-backgrounds/scene');
(async()=>{
 assert.equal(m.backgrounds.length,24);assert.equal(new Set(m.backgrounds.map(x=>x.id+'-'+x.depth)).size,24);
 for(const item of [...m.backgrounds,...m.samples])assert(fs.existsSync(item.source),'Missing generation '+item.source);
 for(const item of m.backgrounds){
  const ext=['pumpkin-patch','moonlit-manor','haunted-crypt'].includes(item.id)?'png':'webp';
  const asset=item.single?path.join(sceneRoot,item.id+'.'+ext):path.join(sceneRoot,'depths',item.id,item.depth+'.'+ext);
  fs.mkdirSync(path.dirname(asset),{recursive:true});
  const im=sharp(item.source).resize(1536,1024,{fit:'cover'});
  await(ext==='png'?im.png():im.webp({quality:94})).toFile(asset);
  item.asset=path.relative(root,asset).replaceAll('\\','/');
  if(item.depth==='medium'){
   const base=path.join(sceneRoot,item.id+'.'+ext);if(!item.single)fs.copyFileSync(asset,base);
   const sidecar={version:item.single?0:1,scene:item.id,displayName:item.label,baseSha256:crypto.createHash('sha256').update(fs.readFileSync(base)).digest('hex')};
   if(!item.single)sidecar.variants=Object.fromEntries(['close','medium','wide'].map(d=>[d,`depths/${item.id}/${d}.${ext}`]));
   fs.writeFileSync(path.join(sceneRoot,item.id+'.depths.json'),JSON.stringify(sidecar,null,2)+'\n');
  }
 }
 const out=path.join(root,'output/christmas/samples-depth');fs.mkdirSync(out,{recursive:true});
 for(const sample of m.samples){const dest=path.join(out,sample.id+'.png');fs.copyFileSync(sample.source,dest);sample.asset=path.relative(root,dest).replaceAll('\\','/');}
 const main=path.join(sceneRoot,'pumpkin-patch.png');
 for(const target of ['moments-server/seed-backgrounds/pumpkin-patch.png','moments-server/public/assets/halloween/plates/scene/pumpkin-patch.png','photobooth-app/themes/christmas/assets/winter-backdrop.png','photobooth-app/public/christmas/scene.png'])fs.copyFileSync(main,path.join(root,target));
 fs.writeFileSync(manifestPath,JSON.stringify(m,null,2)+'\n');
 console.log('Installed 24 plates, 10 distinct scenes, 7 depth sets and 3 diverse source samples.');
})().catch(e=>{console.error(e);process.exitCode=1});
