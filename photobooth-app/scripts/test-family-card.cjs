const fs=require('fs'),path=require('path'),assert=require('assert/strict'),sharp=require('sharp');
const {layout,cutout,renderCard}=require('../electron/family-card.cjs');
const root=path.resolve(__dirname,'../..'),out=path.join(root,'output/christmas/family-card-tests');fs.mkdirSync(out,{recursive:true});
(async()=>{
 const art=path.join(__dirname,'../themes/christmas/artwork/family-card-window.png');
 const fixtures=['graveyard','witch-lantern-garden'];
 const people=[];
 for(const id of fixtures){const p=path.join(out,id+'-cutout.png');if(!fs.existsSync(p))fs.writeFileSync(p,await cutout(path.join(root,'deliverables/christmas/approved-samples-2026-11-02/01-source-photos',id+'.png'),path.join(__dirname,'../config/ai-models/birefnet-lite.onnx')));people.push(p);}
 for(const person of people){
  const {data,info}=await sharp(person).ensureAlpha().raw().toBuffer({resolveWithObject:true});let left=info.width,right=0,top=info.height;
  for(let i=0;i<info.width*info.height;i++)if(data[i*4+3]>32){left=Math.min(left,i%info.width);right=Math.max(right,i%info.width);top=Math.min(top,Math.floor(i/info.width));}
  assert(Math.abs((left+right)/2-info.width/2)<info.width*.06,'Cutout alpha must remain aligned after crop');assert(top<info.height*.08,'Head must not acquire a large transparent margin');
 }
 for(const invalid of [0,11,-1,1.5,NaN])assert.throws(()=>layout(invalid));
 const results=[];
 for(let n=1;n<=10;n++){
  const cells=layout(n);assert.equal(cells.length,n);
  for(const c of cells){assert(c.left>=80&&c.top>=390&&c.left+c.width<=1720&&c.top+c.height<=2210);for(const d of cells){if(c!==d)assert(c.left+c.width<=d.left||d.left+d.width<=c.left||c.top+c.height<=d.top||d.top+d.height<=c.top);}}
  for(const y of new Set(cells.map(c=>c.top))){const row=cells.filter(c=>c.top===y);assert(Math.abs(row[0].left+row.at(-1).left+row.at(-1).width-1800)<=1);}
  const file=path.join(out,`family-card-${String(n).padStart(2,'0')}.jpg`);fs.writeFileSync(file,await renderCard(Array.from({length:n},(_,i)=>people[i%people.length]),art,'The Williams Family'));
  const m=await sharp(file).metadata();assert.equal(m.width,1800);assert.equal(m.height,2400);results.push({count:n,file,cells});console.log('PASS',n);
 }
 const tiles=await Promise.all(results.map(async(r,i)=>({input:await sharp(r.file).resize(360,480).toBuffer(),left:i%5*360,top:Math.floor(i/5)*480})));
 await sharp({create:{width:1800,height:960,channels:3,background:'#eee'}}).composite(tiles).jpeg().toFile(path.join(out,'all-counts.jpg'));
 await sharp(results[5].file).resize(600,800).jpeg({quality:90}).toFile(path.join(__dirname,'../public/christmas/family-card.jpg'));
 fs.writeFileSync(path.join(out,'report.json'),JSON.stringify({note:'Actual ONNX background removal on two approved solo fixtures, reused to exercise counts 1–10. No physical printing.',results},null,2));
})().catch(e=>{console.error(e);process.exitCode=1});
