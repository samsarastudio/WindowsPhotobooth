const fs=require('fs'),path=require('path'),crypto=require('crypto'),sharp=require('../photobooth-app/node_modules/sharp');
const root=path.resolve(__dirname,'..'),sceneRoot=path.join(root,'skin-packages/sports-cricket/config/ai-backgrounds/scene');
const generated='C:/Users/Unity/.codex/generated_images/01a1efa0-b35c-7262-b881-9d5ae59e5de0';
const sets=[
 {id:'kwca-trophy-gallery',name:'KWCA Trophy Gallery',direction:'Travertine, champagne brass, orange/gold jersey inlays; dimensional enamel logo on upper right wall.',sources:{wide:'exec-32a13779-64b1-4d09-938b-70a46c0a9e7f.png',medium:'exec-17a6dbce-7e2a-4684-ad22-7d60a517e005.png',close:'exec-82a285a3-0f05-459a-861c-7140a42cd09d.png'}},
 {id:'kwca-players-pavilion',name:'KWCA Players Pavilion',direction:'Midnight navy, illuminated orange/gold ribs, stadium glazing and jersey vitrine; dimensional logo on upper left wall.',sources:{wide:'exec-7c43f275-249f-4d52-8bab-6c99e5fcd737.png',medium:'exec-239003a6-cd7e-4209-b72f-80497b0a2473.png',close:'exec-7e82b33c-0a6a-4474-b52a-9a992c29c442.png'}}
];
(async()=>{
 const out=path.join(root,'deliverables/skin-packages/kwca');fs.mkdirSync(out,{recursive:true});const panels=[];
 for(const [row,set]of sets.entries()){
  const variants={};
  for(const [col,depth]of ['wide','medium','close'].entries()){
   const rel=`depths/${set.id}/${depth}.webp`,dest=path.join(sceneRoot,rel);fs.mkdirSync(path.dirname(dest),{recursive:true});
   await sharp(path.join(generated,set.sources[depth])).resize(1536,1024).webp({quality:96}).toFile(dest);variants[depth]=rel;
   fs.copyFileSync(dest,path.join(out,`${set.id}-${depth}.webp`));
   panels.push({input:await sharp(dest).resize(600,400).toBuffer(),left:col*600,top:row*445+45});
   panels.push({input:Buffer.from(`<svg width="600" height="45"><rect width="600" height="45" fill="#102733"/><text x="16" y="29" fill="#f4d5a5" font-family="Arial" font-size="18">${set.name} / ${depth}</text></svg>`),left:col*600,top:row*445});
  }
  const base=path.join(sceneRoot,set.id+'.webp');fs.copyFileSync(path.join(sceneRoot,variants.wide),base);
  fs.writeFileSync(base.replace('.webp','.depths.json'),JSON.stringify({version:1,scene:set.id,displayName:set.name,baseSha256:crypto.createHash('sha256').update(fs.readFileSync(base)).digest('hex'),variants},null,2));
 }
 await sharp({create:{width:1800,height:890,channels:3,background:'#102733'}}).composite(panels).jpeg({quality:93}).toFile(path.join(out,'KWCA-six-depths.jpg'));
 fs.writeFileSync(path.join(out,'artwork-provenance.json'),JSON.stringify({date:'2026-11-18',generator:'Built-in image generation',references:'User-provided KWCA logo and orange/yellow team jersey photographs. People in reference were not reproduced.',sets},null,2));
 console.log('Installed two KWCA settings with six independent depth plates.');
})().catch(e=>{console.error(e);process.exitCode=1;});
