'use strict';
const fs=require('node:fs'),path=require('node:path'),sharp=require('sharp');
const root=path.resolve(__dirname,'../..'),samples=path.join(root,'moments-server/public/assets/halloween/samples'),frames=path.join(root,'photobooth-app/config/photo-frames');
async function framed(source,portrait=false){const w=portrait?1200:1800,h=portrait?1800:1200;return sharp(source).resize(w,h,{fit:'cover'}).composite([{input:path.join(frames,'halloween-haunt'+(portrait?'-portrait':'')+'.png')}]).png().toBuffer();}
(async()=>{
 const classic=await framed(path.join(samples,'scene-original.png'));
 fs.writeFileSync(path.join(root,'photobooth-app/public/christmas/classic.png'),classic);
 const scene=await framed(path.join(root,'output/christmas/qa/family-pumpkin-patch.png'));
 fs.writeFileSync(path.join(samples,'scene-ai.png'),scene);
 const portrait=await framed(path.join(root,'photobooth-app/config/compositions/vampire/composition.png'),true);
 fs.writeFileSync(path.join(samples,'portrait-ai.png'),portrait);
 for(const [name,source]of [['curtain-group-manor-gates-20261028.jpg','family-pumpkin-patch.png'],['curtain-group-zombie-gates-20261028.jpg','family-haunted-crypt.png'],['curtain-couple-graveyard-20261028.jpg','family-moonlit-manor.png'],['curtain-couple-evil-dead-cabin-20261028.jpg','family-pumpkin-patch.png']]){
  const image=await framed(path.join(root,'output/christmas/qa',source));await sharp(image).resize(720,480).jpeg({quality:90}).toFile(path.join(samples,name));
 }
 await sharp(scene).resize(720,480).webp({quality:88}).toFile(path.join(samples,'game-postcard-family.webp'));
 await sharp(classic).resize(720,480).webp({quality:88}).toFile(path.join(samples,'game-postcard-solo.webp'));
 fs.mkdirSync(path.join(root,'builds/ai-flow-qa'),{recursive:true});fs.copyFileSync(path.join(samples,'scene-original.png'),path.join(root,'builds/ai-flow-qa/family-kids.png'));
 console.log('Refreshed booth menu, companion samples and game postcards. Portrait preview is labeled as a character template.');
})().catch(e=>{console.error(e);process.exitCode=1});
