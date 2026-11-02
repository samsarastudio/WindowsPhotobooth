'use strict';
const fs=require('node:fs'),path=require('node:path'),sharp=require('sharp');
const {detectFaces}=require('../electron/face-geometry.cjs');
const root=path.resolve(__dirname,'../..'),app=path.join(root,'photobooth-app'),manifestFile=path.join(app,'themes/christmas/portrait-prompts.json');
const manifest=JSON.parse(fs.readFileSync(manifestFile));
(async()=>{
 const tiles=[];
 for(const [i,item]of manifest.assets.entries()){
  if(!item.source)throw Error('Missing portrait '+item.id);
  const dest=path.join(app,'config/compositions',item.id,'composition.png');
  await sharp(item.source).resize(1024,1536,{fit:'cover'}).png().toFile(dest);
  const faces=await detectFaces(dest,path.join(app,'config/ai-models/yunet.onnx'));
  if(faces.length!==1)throw Error(`${item.id}: expected one template head, got ${faces.length}`);
  const f=faces[0],meta={id:item.id,label:item.label,face:{xPercent:f.x/1024*100,yPercent:f.y/1536*100,widthPercent:f.w/1024*100,heightPercent:f.h/1536*100}};
  fs.writeFileSync(path.join(path.dirname(dest),'composition.json'),JSON.stringify(meta,null,2)+'\n');
  item.asset=path.relative(root,dest).replaceAll('\\','/');
  tiles.push({input:await sharp(dest).resize(256,384).png().toBuffer(),left:(i%4)*256,top:Math.floor(i/4)*384});
  if(item.id==='vampire'){
   fs.copyFileSync(dest,path.join(app,'public/christmas/portrait.png'));
   const server=path.join(root,'moments-server/public/assets/halloween/plates/vampire');fs.copyFileSync(dest,path.join(server,'composition.png'));fs.writeFileSync(path.join(server,'composition.json'),JSON.stringify(meta,null,2));
  }
  console.log(item.id,JSON.stringify(meta.face));
 }
 fs.writeFileSync(manifestFile,JSON.stringify(manifest,null,2)+'\n');fs.mkdirSync(path.join(root,'output/christmas'),{recursive:true});
 await sharp({create:{width:1024,height:768,channels:3,background:'#0b2d24'}}).composite(tiles).png().toFile(path.join(root,'output/christmas/portraits-review.png'));
})().catch(e=>{console.error(e);process.exitCode=1});
