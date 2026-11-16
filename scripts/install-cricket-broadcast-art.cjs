const fs=require('fs'),path=require('path'),sharp=require('../photobooth-app/node_modules/sharp'),crypto=require('crypto');
const root=path.resolve(__dirname,'../skin-packages/sports-cricket'),out=path.resolve(__dirname,'../deliverables/skin-packages');
const data=JSON.parse(fs.readFileSync(path.join(out,'cricket-broadcast-artwork-prompts.json'),'utf8'));
(async()=>{
 const panels=[];let row=0;
 for(const set of data.sets){const variants={};let col=0;for(const depth of ['wide','medium','close']){const source=set.variants[depth].source,relative=`depths/${set.id}/${depth}.webp`,dest=path.join(root,'config/ai-backgrounds/scene',relative);fs.mkdirSync(path.dirname(dest),{recursive:true});await sharp(source).resize(1536,1024,{fit:'cover'}).webp({quality:94}).toFile(dest);variants[depth]=relative;
 const tile=await sharp(dest).resize(600,400).toBuffer();panels.push({input:tile,left:col*600,top:row*445+45});const label=Buffer.from(`<svg width="600" height="45"><rect width="600" height="45" fill="#091e29"/><text x="16" y="29" fill="#f4ebd8" font-family="Arial" font-size="18">${set.name} / ${depth}</text></svg>`);panels.push({input:label,left:col*600,top:row*445});col++;}
 const base=path.join(root,'config/ai-backgrounds/scene',set.id+'.webp');fs.copyFileSync(path.join(root,'config/ai-backgrounds/scene',variants.wide),base);
 fs.writeFileSync(base.replace('.webp','.depths.json'),JSON.stringify({version:1,scene:set.id,displayName:set.name,baseSha256:crypto.createHash('sha256').update(fs.readFileSync(base)).digest('hex'),variants},null,2));row++;}
 fs.copyFileSync(path.join(root,'config/ai-backgrounds/scene/stadium-lights.webp'),path.join(root,'theme/assets/stadium.webp'));
 fs.writeFileSync(path.join(root,'artwork-provenance.json'),JSON.stringify(data,null,2));
 await sharp({create:{width:1800,height:1335,channels:3,background:'#091e29'}}).composite(panels).jpeg({quality:94}).toFile(path.join(out,'cricket-1.1.0-depth-contact-sheet.jpg'));
})();
