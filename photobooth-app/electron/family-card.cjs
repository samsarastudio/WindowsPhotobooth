'use strict';
const sharp=require('sharp');
const {subjectMask,removeEdgeSpill}=require('./subject-compositor.cjs');
const ROWS={1:[1],2:[1,1],3:[2,1],4:[2,2],5:[2,2,1],6:[2,2,2],7:[3,2,2],8:[3,3,2],9:[3,3,3],10:[3,3,2,2]};
function layout(count){
 if(!Number.isInteger(count)||!ROWS[count])throw Error('A card needs between 1 and 10 photos.');
 const rows=ROWS[count],width=1500,height=2040;
 const left=(1800-width)/2,top=480;
 return rows.flatMap((n,r)=>Array.from({length:n},(_,c)=>({left:Math.round(left+c*width/n),top:Math.round(top+r*height/rows.length),width:Math.round(left+(c+1)*width/n)-Math.round(left+c*width/n),height:Math.round(top+(r+1)*height/rows.length)-Math.round(top+r*height/rows.length)})));
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
 const path=require('path'),fs=require('fs'),cells=layout(people.length),layers=[];
 const stylePath=path.join(path.dirname(art),'family-card-style.json');
 const style=fs.existsSync(stylePath)?JSON.parse(fs.readFileSync(stylePath,'utf8')):{};
 const cricket=style.variant==='cricket';
 const left=Math.min(...cells.map(c=>c.left)),top=Math.min(...cells.map(c=>c.top));
 const right=Math.max(...cells.map(c=>c.left+c.width)),bottom=Math.max(...cells.map(c=>c.top+c.height));
 // A single continuous backdrop. Portraits have no individual rectangular frame.
 const meta=await sharp(art).metadata();
 const interior=await sharp(art).extract({left:Math.round(meta.width*.22),top:Math.round(meta.height*.22),width:Math.round(meta.width*.56),height:Math.round(meta.height*.48)}).resize(right-left,bottom-top,{fit:'fill'}).png().toBuffer();
 layers.push({input:interior,left,top});
 for(let i=0;i<cells.length;i++){
  const c=cells[i],mx=Math.min(65,Math.round(c.width*.10)),my=5;
  const person=await sharp(people[i]).resize(c.width-mx*2,c.height-140,{fit:'inside'}).png().toBuffer();
  const m=await sharp(person).metadata();
  layers.push({input:person,left:Math.round(c.left+(c.width-m.width)/2),top:c.top+c.height-my-m.height});
 }
 const divider=path.join(path.dirname(art),'family-card-evergreen-divider.png');
 const thickness=220,half=thickness/2,overlap=90;
 const branch=await sharp(divider).trim().resize({height:thickness}).png().toBuffer();
 const bm=await sharp(branch).metadata();
 async function strip(length,flip){
  // Start within dense foliage, not at a tapered transparent branch tip.
  const dense=await sharp(branch).flop(flip).extract({left:Math.round(bm.width*.18),top:0,width:Math.floor(bm.width*.64),height:thickness}).png().toBuffer();
  const dm=await sharp(dense).metadata(),pieces=[];let x=0;
  while(x<length){const w=Math.min(dm.width,length-x);pieces.push({input:await sharp(dense).extract({left:0,top:0,width:w,height:thickness}).png().toBuffer(),left:x,top:0});x+=Math.max(1,dm.width-110);}
  const joined=await sharp({create:{width:length,height:thickness,channels:4,background:'#00000000'}}).composite(pieces).png().toBuffer();
  const cap=Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${length}" height="${thickness}"><rect width="${length}" height="${thickness}" rx="${half}" fill="white"/></svg>`);
  return sharp(joined).composite([{input:cap,blend:'dest-in'}]).png().toBuffer();
 }
 const horizontal=async(x,y,w,flip=false)=>({input:await strip(w,flip),left:Math.round(x),top:Math.round(y-half)});
 const vertical=async(x,y,h,flip=false)=>({input:await sharp(await strip(h,flip)).rotate(90).png().toBuffer(),left:Math.round(x-half),top:Math.round(y)});
 // Shared divisions are drawn once, on top of guests, like the reference cubby.
 const rowTops=[...new Set(cells.map(c=>c.top))];
 for(let r=0;r<rowTops.length;r++){
  const row=cells.filter(c=>c.top===rowTops[r]);
  for(let i=1;i<row.length;i++)layers.push(await vertical(row[i].left,row[i].top-overlap,row[i].height+overlap*2,(r+i)%2===0));
  if(r>0)layers.push(await horizontal(left,row[0].top,right-left,r%2===0));
 }
 layers.push(await vertical(left,top-overlap,bottom-top+overlap*2),await vertical(right,top-overlap,bottom-top+overlap*2,true),await horizontal(left-overlap,top,right-left+overlap*2),await horizontal(left-overlap,bottom,right-left+overlap*2,true));
 const fontfile=path.join(path.dirname(art),'../fonts/GreatVibes-Regular.ttf');
 const script=async(text,size,maxWidth)=>{
  let buf=await sharp({text:{text:`<span foreground="#fff3df">${escape(text)}</span>`,font:cricket?`Segoe UI Bold ${size}`:`Great Vibes ${size}`,...(cricket?{}:{fontfile}),rgba:true,dpi:72}}).png().toBuffer();
  const m=await sharp(buf).metadata();if(m.width>maxWidth)buf=await sharp(buf).resize({width:maxWidth}).png().toBuffer();return buf;
 };
 const heading=await script(cricket?'KWCA TEAM CARD':'Merry Christmas',cricket?100:164,1380),hm=await sharp(heading).metadata();layers.push({input:heading,left:Math.round((1800-hm.width)/2),top:100});
 const line=name.trim().slice(0,60)||(cricket?'One team. One card.':'Together at Christmas');
 const sub=await script(line.replace(/ /g,'\u2002'),83,1380),sm=await sharp(sub).metadata();layers.push({input:sub,left:Math.round((1800-sm.width)/2),top:275});
 let svg=Buffer.from(`<svg width="1800" height="2700" xmlns="http://www.w3.org/2000/svg"><defs><radialGradient id="b"><stop stop-color="#884047"/><stop offset="1" stop-color="#682d36"/></radialGradient><pattern id="winter" width="210" height="210" patternUnits="userSpaceOnUse"><g stroke="#f1d6b7" stroke-width="1.4" opacity=".075" fill="none"><path d="M42 24v36M26 33l32 18M26 51l32-18M37 29l5 5 5-5M37 55l5-5 5 5M28 38l7-2-1-7M50 55l-1-7 7-2"/><path d="M151 123v16M143 131h16M147 127l8 8M147 135l8-8"/></g><circle cx="103" cy="77" r="1.8" fill="#f1d6b7" opacity=".09"/><circle cx="73" cy="172" r="1.2" fill="#f1d6b7" opacity=".07"/></pattern></defs><rect width="1800" height="2700" fill="url(#b)"/><rect width="1800" height="2700" fill="url(#winter)"/></svg>`);
 if(cricket)svg=Buffer.from(`<svg width="1800" height="2700" xmlns="http://www.w3.org/2000/svg"><defs><radialGradient id="b"><stop stop-color="#163a46"/><stop offset="1" stop-color="#071b29"/></radialGradient><pattern id="p" width="160" height="160" patternUnits="userSpaceOnUse"><path d="M0 160L160 0M60 160L160 60" stroke="#edb957" stroke-width="1" opacity=".08"/></pattern></defs><rect width="1800" height="2700" fill="url(#b)"/><rect width="1800" height="2700" fill="url(#p)"/></svg>`);
 return sharp(svg).composite(layers).withMetadata({density:450}).jpeg({quality:97,chromaSubsampling:'4:4:4'}).toBuffer();
}
module.exports={layout,cutout,renderCard};
