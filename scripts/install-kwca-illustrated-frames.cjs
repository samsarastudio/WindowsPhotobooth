const fs=require('fs'),path=require('path'),sharp=require('../photobooth-app/node_modules/sharp');
const root=path.resolve(__dirname,'..'),out=path.join(root,'deliverables/skin-packages/kwca/illustrated-final');
const generated='C:/Users/Unity/.codex/generated_images/01a1efa0-b35c-7262-b881-9d5ae59e5de0';
(async()=>{
 fs.mkdirSync(out,{recursive:true});
 const original=path.join(out,'KWCA-original-logo.jpg');
 if(!fs.existsSync(original))fs.copyFileSync('C:/Users/Unity/.codex/codex-remote-attachments/01a1efa0-b35c-7262-b881-9d5ae59e5de0/A26A1424-0E8D-4E7A-9735-7F5BC8F1FE76/2-Photo-2.jpg',original);
 const assets=[['landscape',1800,1200,'exec-5539fcc0-a5af-4104-b114-beb32a6eea9a.png',166,1114,158],['portrait',1200,1800,'exec-6bb89c39-6319-45b7-98f7-ecee50087e5c.png',129,1735,127]];
 for(const [orientation,w,h,source,diameter,cy,size]of assets){
  const art=path.join(out,`illustration-${orientation}.png`);if(!fs.existsSync(art))fs.copyFileSync(path.join(generated,source),art);
  // Preserve the supplied logo pixels/colours. Clip only the black square corners
  // outside its circular badge; never regenerate lettering or player silhouettes.
  const mask=Buffer.from(`<svg width="${size}" height="${size}"><circle cx="${size/2}" cy="${size/2}" r="${size/2}" fill="white"/></svg>`);
  const logo=await sharp(original).resize(size,size).composite([{input:mask,blend:'dest-in'}]).png().toBuffer();
  const target=path.join(root,'skin-packages/sports-cricket/config/photo-frames',`cricket-${orientation}.png`);
  await sharp(art).resize(w,h).composite([{input:logo,left:Math.round((w-size)/2),top:Math.round(cy-size/2)}]).png().toFile(target);
  fs.copyFileSync(target,path.join(out,`kwca-${orientation}.png`));
 }
 console.log('Installed illustrated frames with original supplied circular KWCA logo.');
})().catch(e=>{console.error(e);process.exitCode=1;});
