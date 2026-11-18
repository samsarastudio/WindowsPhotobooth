const fs=require('fs'),path=require('path'),sharp=require('../photobooth-app/node_modules/sharp');
const root=path.resolve(__dirname,'..'),out=path.join(root,'deliverables/skin-packages/kwca/illustrated-final');
const generated='C:/Users/Unity/.codex/generated_images/01a1efa0-b35c-7262-b881-9d5ae59e5de0';
(async()=>{
 fs.mkdirSync(out,{recursive:true});
 const original=path.join(out,'KWCA-original-logo.jpg');
 if(!fs.existsSync(original))fs.copyFileSync('C:/Users/Unity/.codex/codex-remote-attachments/01a1efa0-b35c-7262-b881-9d5ae59e5de0/A26A1424-0E8D-4E7A-9735-7F5BC8F1FE76/2-Photo-2.jpg',original);
 const assets=[['landscape',1800,1200,'exec-a9b2e268-ee20-4bbf-84f9-6fc8f124464a.png',240,1090,180],['portrait',1200,1800,'exec-38b3623b-b4e6-41bb-adf3-3da5d788a8c0.png',200,1710,150]];
 for(const [orientation,w,h,source,diameter,cy,size]of assets){
  const art=path.join(out,`illustration-${orientation}.png`);if(!fs.existsSync(art))fs.copyFileSync(path.join(generated,source),art);
  // Preserve the supplied logo pixels/colours. Clip only the black square corners
  // outside its circular badge; never regenerate lettering or player silhouettes.
  const mask=Buffer.from(`<svg width="${size}" height="${size}"><circle cx="${size/2}" cy="${size/2}" r="${size/2}" fill="white"/></svg>`);
  const logo=await sharp(original).resize(size,size).composite([{input:mask,blend:'dest-in'}]).png().toBuffer();
  const target=path.join(root,'skin-packages/sports-cricket/config/photo-frames',`cricket-${orientation}.png`);
  const {data,info}=await sharp(art).resize(w,h).ensureAlpha().raw().toBuffer({resolveWithObject:true});
  // Remove residual near-transparent export haze; keep decorative alpha edges.
  for(let k=3;k<data.length;k+=4)data[k]=data[k]<=110?0:Math.round((data[k]-110)*255/145);
  if(orientation==='portrait'){const old=await sharp(path.join(out,'portrait-alpha-reference.webp')).ensureAlpha().raw().toBuffer();for(let k=3;k<data.length;k+=4)data[k]=Math.min(data[k],old[k]);}
  if(orientation==='portrait'){for(let y=h-210;y<h-45;y++)for(let x=w/2-120;x<w/2+120;x++){const dx=Math.abs(x-w/2)/120,dy=Math.abs(y-(h-125))/85;const t=Math.min(1,Math.max(0,(Math.max(dx,dy)-.55)/.45));data[(y*w+x)*4+3]=Math.round(data[(y*w+x)*4+3]*t*t*(3-2*t));}}
  const bleed=Buffer.from(`<svg width="${w}" height="${h}"><path d="M0 0H${w}V${h}H0ZM6 6V${h-24}H${w-6}V6Z" fill="#071d2a" fill-rule="evenodd"/></svg>`);
  const artwork=await sharp(data,{raw:info}).png().toBuffer();
  const badgeLeft=24,badgeTop=Math.round(cy-size/2);
  const ring=Buffer.from(`<svg width="${size+8}" height="${size+8}"><defs><linearGradient id="gold" x2="1" y2="1"><stop stop-color="#fff1aa"/><stop offset=".45" stop-color="#b77719"/><stop offset=".7" stop-color="#f6d471"/><stop offset="1" stop-color="#8d570d"/></linearGradient></defs><circle cx="${size/2+4}" cy="${size/2+4}" r="${size/2+3}" fill="url(#gold)" stroke="#fff0b0" stroke-width="2"/></svg>`);
  await sharp(bleed).composite([{input:artwork},{input:ring,left:badgeLeft-4,top:badgeTop-4},{input:logo,left:badgeLeft,top:badgeTop}]).png().toFile(target);
  fs.copyFileSync(target,path.join(out,`kwca-${orientation}.png`));
 }
 console.log('Installed illustrated frames with original supplied circular KWCA logo.');
})().catch(e=>{console.error(e);process.exitCode=1;});
