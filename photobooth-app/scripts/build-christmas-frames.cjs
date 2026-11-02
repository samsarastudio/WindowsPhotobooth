'use strict';
// Illustrated default frames plus optional vector styles, all using the PNG print contract.
const fs=require('node:fs'),path=require('node:path'),sharp=require('sharp');
const root=path.resolve(__dirname,'../..');
const designs=[['halloween-haunt','Evergreen','#103c30','#dfc18b',false],['halloween-horror','Winter Ivory','#f8f2e6','#9c2935',false],['screampark-logo-halloween-2026','Christmas Gold','#132d25','#e9c980',false],['screampark-logo-halloween-2026-slim','Christmas Minimal','#13372c','#e9c980',true]];
function artwork(w,h,bg,gold,slim,text=true){
 const edge=slim?24:48,bottom=slim?105:160;
 const holly=(x,y,flip=1)=>`<g transform="translate(${x} ${y}) scale(${flip} 1)"><path d="M0 0 Q65 -15 110 36 Q58 22 0 0 M0 0 Q40 60 100 70 Q72 12 0 0" fill="#327653"/><path d="M0 0 Q-12 44 40 78 Q45 20 0 0" fill="#205c41"/><circle cx="9" cy="9" r="13" fill="#b12d40"/><circle cx="30" cy="12" r="11" fill="#922135"/><circle cx="18" cy="31" r="11" fill="#c6464d"/><path d="M0 0 L87 48" stroke="${gold}" stroke-width="2"/></g>`;
 return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"><path d="M0 0H${w}V${h}H0Z M${edge} ${edge}V${h-bottom}H${w-edge}V${edge}Z" fill="${bg}" fill-rule="evenodd"/><rect x="${edge/2}" y="${edge/2}" width="${w-edge}" height="${h-edge}" fill="none" stroke="${gold}" stroke-width="3"/>${slim?'':holly(18,18)+holly(w-18,18,-1)}<path d="M${w*.18} ${h-bottom/2}H${w*.30} M${w*.70} ${h-bottom/2}H${w*.82}" stroke="${gold}" stroke-width="2"/>${text?`<text x="50%" y="${h-bottom*.53}" text-anchor="middle" fill="${gold}" font-family="Georgia,serif" font-size="${slim?34:44}" letter-spacing="3">Merry Christmas</text><text x="50%" y="${h-bottom*.22}" text-anchor="middle" fill="${gold}" font-family="Segoe UI,sans-serif" font-size="${slim?17:22}" letter-spacing="5">INMOMENT · 2026</text>`:''}</svg>`;
}
(async()=>{
 const sourceDir=path.join(root,'photobooth-app/themes/christmas/artwork');fs.mkdirSync(sourceDir,{recursive:true});
 for(const [id,label,bg,gold,slim]of designs)for(const portrait of [false,true]){
  const w=portrait?1200:1800,h=portrait?1800:1200,name=id+(portrait?'-portrait':'');
  if(id==='halloween-haunt'){
   const master=path.join(sourceDir,'christmas-frame-'+(portrait?'portrait':'landscape')+'.png');
   const png=await sharp(master).resize(w,h,{fit:'fill'}).png().toBuffer();
   const raw=await sharp(png).ensureAlpha().raw().toBuffer();assertTransparentCenter(raw,w,h);
   for(const dir of ['photobooth-app/config/photo-frames','moments-server/seed-frames','moments-server/public/assets/halloween/frames'])fs.writeFileSync(path.join(root,dir,name+'.png'),png);
   console.log('Illustrated Christmas',portrait?'portrait':'landscape');continue;
  }
  const svg=artwork(w,h,bg,gold,slim);fs.writeFileSync(path.join(sourceDir,name+'.svg'),svg);
  const png=await sharp(Buffer.from(svg)).png().toBuffer();
  for(const dir of ['photobooth-app/config/photo-frames','moments-server/seed-frames','moments-server/public/assets/halloween/frames']){const dest=path.join(root,dir);fs.mkdirSync(dest,{recursive:true});fs.writeFileSync(path.join(dest,name+'.png'),png);}
  if(id==='halloween-horror')await sharp(Buffer.from(artwork(w,h,bg,gold,slim,false))).png().toFile(path.join(root,'moments-server/public/assets/frame-templates',name+(portrait?'':'')+'-textless.png'));
  const raw=await sharp(png).raw().toBuffer();assertTransparentCenter(raw,w,h);console.log(label,portrait?'portrait':'landscape');
 }
})().catch(e=>{console.error(e);process.exitCode=1});
function assertTransparentCenter(raw,w,h){
 // Allow one alpha level from resampling feathered edges, but reject a tinted
 // photo opening. Check the central guest area, not just a single lucky pixel.
 for(let y=Math.floor(h*.25);y<Math.floor(h*.65);y++)for(let x=Math.floor(w*.25);x<Math.floor(w*.75);x++){
  if(raw[(y*w+x)*4+3]>1)throw Error('Photo window must be transparent');
 }
}
