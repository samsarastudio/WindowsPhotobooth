const fs=require('fs'),path=require('path'),sharp=require('../photobooth-app/node_modules/sharp');
const {renderCard,layout}=require('../photobooth-app/electron/family-card.cjs');
const assert=require('assert/strict');
const root=path.resolve(__dirname,'..'),pkg=path.join(root,'skin-packages/sports-cricket');
const art=path.join(pkg,'theme/artwork'),out=process.env.KWCA_SAMPLE_OUTPUT||path.join(root,'deliverables/skin-packages/kwca/team-card-samples');
(async()=>{
 fs.mkdirSync(art,{recursive:true});fs.mkdirSync(out,{recursive:true});fs.mkdirSync(path.join(pkg,'theme/fonts'),{recursive:true});
 fs.copyFileSync(path.join(root,'photobooth-app/themes/christmas/fonts/GreatVibes-Regular.ttf'),path.join(pkg,'theme/fonts/GreatVibes-Regular.ttf'));
 fs.writeFileSync(path.join(art,'family-card-style.json'),JSON.stringify({variant:'cricket'},null,2));
 const divider=path.join(art,'family-card-evergreen-divider.png');
 if(!fs.existsSync(divider)){
  const source='C:/Users/Unity/.codex/generated_images/01a1efa0-b35c-7262-b881-9d5ae59e5de0/exec-466b1c79-16cc-4694-afa0-1f98344d92a0.png';
  const {data,info}=await sharp(source).ensureAlpha().raw().toBuffer({resolveWithObject:true});
  for(let i=3;i<data.length;i+=4)data[i]=data[i]<160?0:Math.round((data[i]-160)*255/95);
  await sharp(data,{raw:info}).trim().png({palette:true,quality:95}).toFile(divider);
 }
 const window=path.join(art,'family-card-window.png');
 await sharp(Buffer.from('<svg width="800" height="800"><defs><radialGradient id="b"><stop stop-color="#d6ab70"/><stop offset="1" stop-color="#71421e"/></radialGradient></defs><rect width="800" height="800" fill="url(#b)"/></svg>')).png().toFile(window);
 const people=Array.from({length:10},(_,i)=>path.join(root,'deliverables/christmas/family-card-samples/02-cutouts',`person-${String(i+1).padStart(2,'0')}.png`));
 const tiles=[];
 for(const n of (process.env.KWCA_SAMPLE_COUNTS||'1,2,3,4,5,6,7,8,9,10').split(',').map(Number)){
  assert.equal(layout(n).length,n);
  const result=await renderCard(people.slice(0,n),window,'TEAM PORTRAITS');
  const meta=await sharp(result).metadata();assert.equal(meta.width,1800);assert.equal(meta.height,2700);
  const file=path.join(out,`team-card-${String(n).padStart(2,'0')}.jpg`);fs.writeFileSync(file,result);
  tiles.push({input:await sharp(result).resize(300,450).toBuffer(),left:(n-1)%5*300,top:Math.floor((n-1)/5)*450});
  if(n===6)await sharp(result).resize(600,900).jpeg({quality:90}).toFile(path.join(pkg,'presentation/team-card.jpg'));
  console.log('PASS KWCA card',n);
 }
 await sharp({create:{width:1500,height:900,channels:3,background:'#071b29'}}).composite(tiles).jpeg().toFile(path.join(out,'all-counts.jpg'));
})().catch(e=>{console.error(e);process.exitCode=1});
