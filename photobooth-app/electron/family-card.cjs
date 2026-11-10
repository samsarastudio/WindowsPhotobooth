'use strict';
const sharp=require('sharp');
const {subjectMask,removeEdgeSpill}=require('./subject-compositor.cjs');
const ROWS={1:[1],2:[1,1],3:[2,1],4:[2,2],5:[3,2],6:[3,3],7:[3,2,2],8:[3,3,2],9:[3,3,3],10:[4,3,3]};
function layout(count){
 if(!Number.isInteger(count)||!ROWS[count])throw Error('A card needs between 1 and 10 photos.');
 const rows=ROWS[count],size=Math.floor(Math.min((1560-18*(Math.max(...rows)-1))/Math.max(...rows),(1820-18*(rows.length-1))/rows.length,1400)),gap=18;
 const total=rows.length*size+(rows.length-1)*gap,top=390+(1820-total)/2;
 return rows.flatMap((n,r)=>Array.from({length:n},(_,c)=>({left:Math.round((1800-n*size-(n-1)*gap)/2+c*(size+gap)),top:Math.round(top+r*(size+gap)),width:size,height:size})));
}
async function cutout(source,model){
 const image=await sharp(source).rotate().resize(1400,1400,{fit:'inside',withoutEnlargement:true}).removeAlpha().png().toBuffer();
 const {width,height}=await sharp(image).metadata(),alpha=await subjectMask(image,model);
 let l=width,t=height,r=0,b=0,pixels=0;
 for(let i=0;i<alpha.length;i++)if(alpha[i]>32){l=Math.min(l,i%width);r=Math.max(r,i%width);t=Math.min(t,Math.floor(i/width));b=Math.max(b,Math.floor(i/width));pixels++;}
 if(pixels<width*height*.01)throw Error('No clear person found. Please retake the photo.');
 const pad=Math.round(width*.025);l=Math.max(0,l-pad);t=Math.max(0,t-pad);r=Math.min(width-1,r+pad);b=Math.min(height-1,b+pad);
 const rgb=removeEdgeSpill(await sharp(image).raw().toBuffer(),alpha,width,height);
 const rgba=await sharp(rgb,{raw:{width,height,channels:3}}).joinChannel(alpha,{raw:{width,height,channels:1}}).png().toBuffer();
 return sharp(rgba).extract({left:l,top:t,width:r-l+1,height:b-t+1}).png().toBuffer();
}
const escape=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]));
async function renderCard(people,art,name=''){
 const cells=layout(people.length),layers=[];
 for(let i=0;i<cells.length;i++){
  const c=cells[i],s=c.width,margin=Math.round(s*.10);
  const person=await sharp(people[i]).resize(s-margin*2,Math.round(s*.80),{fit:'inside'}).png().toBuffer();
  const m=await sharp(person).metadata();
  const tile=await sharp(art).resize(s,s).composite([{input:person,left:Math.round((s-m.width)/2),top:s-margin-m.height}]).png().toBuffer();
  layers.push({input:tile,left:c.left,top:c.top});
 }
 const svg=Buffer.from(`<svg width="1800" height="2400" xmlns="http://www.w3.org/2000/svg"><defs><radialGradient id="b"><stop stop-color="#914149"/><stop offset="1" stop-color="#56232e"/></radialGradient></defs><rect width="1800" height="2400" fill="url(#b)"/><rect x="48" y="48" width="1704" height="2304" rx="32" fill="none" stroke="#d3b583" stroke-opacity=".6" stroke-width="2"/><text x="900" y="220" text-anchor="middle" fill="#fff2dc" font-family="Georgia" font-style="italic" font-size="132">Merry Christmas</text><text x="900" y="315" text-anchor="middle" fill="#eddbbb" font-family="Georgia" font-size="44">${escape(name.trim().slice(0,60)||'Together is our favourite place to be')}</text><text x="900" y="2300" text-anchor="middle" fill="#eddbbb" font-family="Georgia" font-size="32" letter-spacing="5">A LITTLE CHRISTMAS MAGIC</text></svg>`);
 return sharp(svg).composite(layers).jpeg({quality:97,chromaSubsampling:'4:4:4'}).toBuffer();
}
module.exports={layout,cutout,renderCard};
