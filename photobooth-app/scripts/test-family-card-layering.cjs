const test=require('node:test'),assert=require('node:assert/strict'),path=require('path'),sharp=require('sharp');
const {renderCard,layout}=require('../electron/family-card.cjs');
test('over-frame upper silhouette crosses the shared border; legacy and invalid effects stay behind',async()=>{
 const art=path.resolve(__dirname,'../../skin-packages/sports-cricket/theme/artwork/family-card-window.png');
 const person=await sharp({create:{width:400,height:1200,channels:4,background:'#ff0000'}}).png().toBuffer();
 for(let count=1;count<=10;count++){
  const people=Array(count).fill(person),effects=Array(count).fill('over-frame');
  const image=await renderCard(people,art,'Layer test',effects),meta=await sharp(image).metadata();assert.equal(meta.width,1800);assert.equal(meta.height,2700);
  const c=layout(count)[0],pixel=await sharp(image).extract({left:Math.round(c.left+c.width/2),top:c.top,width:1,height:1}).removeAlpha().raw().toBuffer();assert(pixel[0]>230&&pixel[1]<30,'Upper silhouette must cover the top frame');
 }
 const base=await renderCard([person],art,'Legacy');
 assert.deepEqual(base,await renderCard([person],art,'Legacy',['unknown']));
 assert.deepEqual(base,await renderCard([person],art,'Legacy',null));
});
