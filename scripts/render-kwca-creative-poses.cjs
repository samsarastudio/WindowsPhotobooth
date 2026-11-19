const fs=require('fs'),path=require('path'),sharp=require('../photobooth-app/node_modules/sharp');
const {cutout,renderCard}=require('../photobooth-app/electron/family-card.cjs');
const root=path.resolve(__dirname,'..');
const out=process.env.KWCA_SAMPLE_OUTPUT||'C:/Users/Unity/.codex/visualizations/2026/11/18/01a1efa0-b35c-7262-b881-9d5ae59e5de0/kwca-creative-poses';
const generated='C:/Users/Unity/.codex/generated_images/01a1efa0-b35c-7262-b881-9d5ae59e5de0';
const files=['exec-a9c687e9-f529-4446-9584-855e916095a4.png','exec-8eb76b2a-d542-4fa0-bc24-0655fb798197.png','exec-95ed8222-3370-4eb0-ae60-ab2429f8a1e7.png','exec-be1328b9-eae3-483b-983f-9a991b4f3078.png','exec-4415040c-444e-4bf3-a7d3-2832a281c781.png','exec-6adc2d72-41c8-492a-b43e-bc13e635d097.png'];
(async()=>{
 fs.mkdirSync(out,{recursive:true});
 const people=[];
 for(let i=0;i<files.length;i++){
  const source=path.join(out,`source-${i+1}.png`),target=path.join(out,`cutout-${i+1}.png`);
  if(!fs.existsSync(source))fs.copyFileSync(path.join(generated,files[i]),source);
  if(!fs.existsSync(target))fs.writeFileSync(target,await cutout(source,path.join(root,'photobooth-app/config/ai-models/birefnet-lite.onnx')));
  people.push(target);console.log('Cutout',i+1);
 }
 const tiles=[];
 for(const [i,n]of [4,6].entries()){
  const card=await renderCard(people.slice(0,n),path.join(root,'skin-packages/sports-cricket/theme/artwork/family-card-window.png'),'ONE TEAM. SHARED MEMORIES.',Array(n).fill('over-frame'));
  fs.writeFileSync(path.join(out,`creative-${n}.jpg`),card);
  tiles.push({input:await sharp(card).resize(600,900).toBuffer(),left:i*600,top:0});
 }
 await sharp({create:{width:1200,height:900,channels:3,background:'#071825'}}).composite(tiles).jpeg().toFile(path.join(out,'four-and-six.jpg'));
 console.log('Saved',out);
})().catch(e=>{console.error(e);process.exitCode=1});
