import {themes,phrases,qrSizes,albumSizes} from './print-catalog.js';
// One layout plan drives both the browser preview and PDF export. Coordinates are PDF points.
export function printPlan(kind,c,event,photos=[],logo=null){
  const theme=c.theme==='auto'?c.eventType:c.theme,t=themes[theme];
  let mm=kind==='qr'?(qrSizes[c.qrSize]||[c.qrWidth,c.qrHeight]):(albumSizes[c.albumSize]||[c.albumWidth,c.albumHeight]);
  if(kind==='qr'&&c.qrLandscape)mm=[mm[1],mm[0]];
  const [w,h]=mm.map(v=>v*72/25.4),pages=[];
  const background=`/print-themes/${theme}${kind==='album'||w>h?'-album':''}.jpg`;
  function page(){const p={w,h,background,elements:[]};pages.push(p);if(c.border!=='none'){p.elements.push({kind:'border',x:w*.045,y:h*.045,w:w*.91,h:h*.91,color:t.accent,double:c.border==='double',rounded:c.border==='rounded'});}return p;}
  function text(p,value,x,y,bw,bh,size=18,font='serif',align='center',color=t.ink){if(value)p.elements.push({kind:'text',text:value,x:x*w,y:y*h,w:bw*w,h:bh*h,size:size*Math.min(w/595,h/595),font,align,color});}
  function img(p,url,x,y,bw,bh){p.elements.push({kind:'image',url,x:x*w,y:y*h,w:bw*w,h:bh*h});}
  function brand(p){if(c.showLogo&&logo)img(p,logo,.42,.075,.16,.08);}
  const title=c.title||event.title,details=[c.date,c.location].filter(Boolean).join('  /  ');
  if(kind==='qr'){
    const p=page();brand(p);
    const landscape=w>h;
    if(landscape){
      text(p,c.qrHeading,.08,.23,.4,.1,17,'sans');text(p,title,.08,.35,.4,.24,34);text(p,c.subtitle,.08,.60,.4,.08,13,'sans');text(p,details,.08,.70,.4,.08,10,'sans');
      const size=Math.min(w*.32,h*.46);p.elements.push({kind:'qr',x:w*.56,y:h*.22,w:size,h:size,url:event.url});text(p,c.qrInstructions,.54,.72,.38,.1,12,'sans');
    }else{
      text(p,c.qrHeading,.12,.18,.76,.055,14,'sans');text(p,title,.12,.25,.76,.14,31);text(p,c.subtitle,.14,.39,.72,.045,12,'sans');text(p,details,.14,.445,.72,.03,9,'sans');
      const size=Math.min(w*.46,h*.30);p.elements.push({kind:'qr',x:(w-size)/2,y:h*.49,w:size,h:size,url:event.url});text(p,c.qrInstructions,.12,.80,.76,.06,12,'sans');
    }
    if(c.showUrl)text(p,event.url,.10,.875,.8,.03,8,'sans');text(p,c.footer,.10,.915,.8,.025,8,'sans');
    return pages;
  }
  const cover=page();brand(cover);text(cover,c.albumTitle||title,.12,.28,.76,.23,42);text(cover,c.subtitle,.15,.54,.70,.10,17);text(cover,details,.15,.67,.7,.07,11,'sans');text(cover,c.footer,.15,.84,.7,.04,10,'sans');
  if(c.intro){const p=page();text(p,'THE STORY',.15,.17,.7,.05,11,'sans');text(p,c.intro,.18,.32,.64,.42,24);}
  const custom=c.customCaptions.split('\n').map(v=>v.trim()).filter(Boolean),library=phrases[c.eventType];
  let offset=0,index=0;
  while(offset<photos.length){
    const p=page();let layout=c.layout==='editorial'?['hero','duo','trio','grid'][index%4]:c.layout;
    const remaining=photos.length-offset;if(remaining===1)layout='hero';else if(remaining===2&&['trio','grid'].includes(layout))layout='duo';else if(remaining===3&&layout==='grid')layout='trio';
    const take={hero:1,duo:2,trio:3,grid:4}[layout];const batch=photos.slice(offset,offset+take);
    const wording=c.wording?(custom[index]||library[(index+c.wordingOffset)%library.length]):'';
    if(layout==='hero'){
      img(p,batch[0].url,.075,.14,.57,.70);text(p,wording,.69,.32,.23,.30,25,'serif','left');
    }else{
      text(p,wording,.1,.10,.8,.12,22);
      const rects=layout==='duo'?[[.08,.27,.40,.56],[.52,.27,.40,.56]]:layout==='trio'?[[.075,.26,.48,.59],[.59,.26,.335,.275],[.59,.575,.335,.275]]:[[.08,.26,.40,.275],[.52,.26,.40,.275],[.08,.575,.40,.275],[.52,.575,.40,.275]];
      batch.forEach((photo,i)=>img(p,photo.url,...rects[i]));
    }
    if(c.pageNumbers)text(p,String(index+1).padStart(2,'0'),.43,.91,.14,.03,9,'sans');offset+=batch.length;index++;
  }
  const close=page();text(close,c.closing,.17,.34,.66,.26,30);text(close,title,.2,.68,.6,.08,14);text(close,c.footer,.15,.84,.7,.04,10,'sans');
  return pages;
}
