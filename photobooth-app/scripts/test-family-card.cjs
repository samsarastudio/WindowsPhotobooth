const fs=require('fs'),path=require('path'),assert=require('assert/strict'),sharp=require('sharp');
const {layout,cutout,renderCard}=require('../electron/family-card.cjs');
const root=path.resolve(__dirname,'../..'),out=path.join(root,'output/christmas/family-card-tests');fs.mkdirSync(out,{recursive:true});
(async()=>{
 const art=path.join(__dirname,'../themes/christmas/artwork/family-card-window.png');
 const samples=path.join(root,'deliverables/christmas/family-card-samples');
 const fixtures=JSON.parse(fs.readFileSync(path.join(samples,'manifest.json'))).people;
 if(process.argv[2]){const item=fixtures.find(p=>p.id===process.argv[2]);const target=path.join(samples,'02-cutouts',`person-${item.id}.png`);fs.writeFileSync(target,await cutout(path.join(root,item.asset),path.join(__dirname,'../config/ai-models/birefnet-lite.onnx')));console.log('Cutout',item.id);return;}
 const people=[];
 for(const item of fixtures){const p=path.join(samples,'02-cutouts',`person-${item.id}.png`);if(!fs.existsSync(p)||fs.statSync(p).mtimeMs<fs.statSync(path.join(root,item.asset)).mtimeMs)require('child_process').execFileSync(process.execPath,[__filename,item.id],{stdio:'inherit',windowsHide:true});people.push(p);}
 assert.equal(new Set(people.map(p=>require('crypto').createHash('sha256').update(fs.readFileSync(p)).digest('hex'))).size,10);
 for(const person of people){
  const {data,info}=await sharp(person).ensureAlpha().raw().toBuffer({resolveWithObject:true});let left=info.width,right=0,top=info.height;
  for(let i=0;i<info.width*info.height;i++)if(data[i*4+3]>32){left=Math.min(left,i%info.width);right=Math.max(right,i%info.width);top=Math.min(top,Math.floor(i/info.width));}
  assert(Math.abs((left+right)/2-info.width/2)<info.width*.06,'Cutout alpha must remain aligned after crop');assert(top<info.height*.08,'Head must not acquire a large transparent margin');
 }
 for(const invalid of [0,11,-1,1.5,NaN])assert.throws(()=>layout(invalid));
 assert.equal(new Set(layout(6).map(c=>c.top)).size,3,'Six portraits must use three rows');assert.equal(layout(6).filter(c=>c.top===layout(6)[0].top).length,2,'Six portraits must use two columns');
 const results=[];
 for(let n=1;n<=10;n++){
  const cells=layout(n);assert.equal(cells.length,n);
  for(const c of cells){assert(c.left>=80&&c.top>=390&&c.left+c.width<=1720&&c.top+c.height<=2520);for(const d of cells){if(c!==d)assert(c.left+c.width<=d.left||d.left+d.width<=c.left||c.top+c.height<=d.top||d.top+d.height<=c.top);}}
  for(const y of new Set(cells.map(c=>c.top))){const row=cells.filter(c=>c.top===y);assert(Math.abs(row[0].left+row.at(-1).left+row.at(-1).width-1800)<=1);for(let i=1;i<row.length;i++)assert.equal(row[i-1].left+row[i-1].width,row[i].left,'No burgundy gap between portraits');}
  const file=path.join(out,`family-card-${String(n).padStart(2,'0')}.jpg`);fs.writeFileSync(file,await renderCard(people.slice(0,n),art,'The Williams Family'));
  fs.copyFileSync(file,path.join(samples,'03-cards',path.basename(file)));
  const m=await sharp(file).metadata();assert.equal(m.width,1800);assert.equal(m.height,2700);results.push({count:n,file,cells});console.log('PASS',n);
 }
 const tiles=await Promise.all(results.map(async(r,i)=>({input:await sharp(r.file).resize(360,540).toBuffer(),left:i%5*360,top:Math.floor(i/5)*540})));
 await sharp({create:{width:1800,height:1080,channels:3,background:'#eee'}}).composite(tiles).jpeg().toFile(path.join(out,'all-counts.jpg'));
 fs.copyFileSync(path.join(out,'all-counts.jpg'),path.join(samples,'all-counts.jpg'));
 const sources=await Promise.all(fixtures.map(async(x,i)=>({input:await sharp(path.join(root,x.asset)).resize(260,340,{fit:'contain',background:'#eee'}).toBuffer(),left:i%5*260,top:Math.floor(i/5)*340})));
 await sharp({create:{width:1300,height:680,channels:3,background:'#eee'}}).composite(sources).jpeg().toFile(path.join(samples,'source-contact-sheet.jpg'));
 fs.copyFileSync(path.join(samples,'03-cards/family-card-10.jpg'),path.join(samples,'ten-person-card.jpg'));
 await sharp(results[8].file).resize(600,900).jpeg({quality:90}).toFile(path.join(__dirname,'../public/christmas/family-card.jpg'));
 fs.writeFileSync(path.join(out,'report.json'),JSON.stringify({note:'Actual ONNX background removal on two approved solo fixtures, reused to exercise counts 1–10. No physical printing.',results},null,2));
})().catch(e=>{console.error(e);process.exitCode=1});
