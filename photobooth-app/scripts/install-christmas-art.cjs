'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),sharp=require('sharp');
const root=path.resolve(__dirname,'../..'),app=path.join(root,'photobooth-app');
const manifest=JSON.parse(fs.readFileSync(path.join(app,'themes/christmas/artwork-prompts.json')));
const sceneRoot=path.join(app,'config/ai-backgrounds/scene');
const pngIds=['pumpkin-patch','moonlit-manor','haunted-crypt'];
const singles=['haunted-harvest-carnival','witch-lantern-garden','vampire-candlelit-ballroom'];
(async()=>{
 for(const item of manifest.assets){
  if(!item.source||!fs.existsSync(item.source))throw Error('Missing generated artwork '+item.id+' '+item.depth);
  const ext=pngIds.includes(item.id)?'png':'webp',single=singles.includes(item.id);
  const file=single?path.join(sceneRoot,item.id+'.'+ext):path.join(sceneRoot,'depths',item.id,item.depth+'.'+ext);
  fs.mkdirSync(path.dirname(file),{recursive:true});
  const im=sharp(item.source).resize(1536,1024,{fit:'cover'});
  await (ext==='png'?im.png():im.webp({quality:94})).toFile(file);
  item.asset=path.relative(root,file).replaceAll('\\','/');
  if(item.depth==='medium'){
   const base=path.join(sceneRoot,item.id+'.'+ext);if(!single)fs.copyFileSync(file,base);
   const data={version:single?0:1,scene:item.id,displayName:item.label,baseSha256:crypto.createHash('sha256').update(fs.readFileSync(base)).digest('hex')};
   if(!single)data.variants=Object.fromEntries(['close','medium','wide'].map(d=>[d,`depths/${item.id}/${d}.${ext}`]));
   fs.writeFileSync(path.join(sceneRoot,item.id+'.depths.json'),JSON.stringify(data,null,2)+'\n');
  }
 }
 fs.writeFileSync(path.join(app,'themes/christmas/artwork-prompts.json'),JSON.stringify(manifest,null,2)+'\n');
 const main=path.join(sceneRoot,'pumpkin-patch.png');
 for(const target of ['moments-server/seed-backgrounds/pumpkin-patch.png','moments-server/public/assets/halloween/plates/scene/pumpkin-patch.png','photobooth-app/themes/christmas/assets/winter-backdrop.png','photobooth-app/public/christmas/scene.png']){const dest=path.join(root,target);fs.mkdirSync(path.dirname(dest),{recursive:true});fs.copyFileSync(main,dest);}
 console.log('Installed '+manifest.assets.length+' plates across 10 scene choices.');
})().catch(e=>{console.error(e);process.exitCode=1});
