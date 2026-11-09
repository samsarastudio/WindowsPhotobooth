import {themes,phrases,qrSizes,albumSizes} from './print-catalog.js';
// One layout plan drives both the browser preview and PDF export. Coordinates are PDF points.
export function printPlan(kind,c,event,photos=[],logo=null){
  const theme=c.theme==='auto'?c.eventType:c.theme,keepsake=kind==='album'&&c.albumStyle==='keepsake',t=keepsake?{ink:'#243d31',accent:'#a88d53',paper:'#f8efdd'}:themes[theme];
  let mm=kind==='qr'?(qrSizes[c.qrSize]||[c.qrWidth,c.qrHeight]):(albumSizes[c.albumSize]||[c.albumWidth,c.albumHeight]);
  if(kind==='qr'&&c.qrLandscape)mm=[mm[1],mm[0]];
  const [w,h]=mm.map(v=>v*72/25.4),pages=[];
  const background=`/print-themes/${theme}${kind==='album'||w>h?'-album':''}.jpg`;
  function page(){const p={w,h,background:keepsake?null:background,paper:keepsake?t.paper:null,elements:[]};pages.push(p);if(c.border!=='none'){p.elements.push({kind:'border',x:w*.045,y:h*.045,w:w*.91,h:h*.91,color:t.accent,double:c.border==='double',rounded:c.border==='rounded'});}return p;}
  function text(p,value,x,y,bw,bh,size=18,font='serif',align='center',color=t.ink){if(value)p.elements.push({kind:'text',text:value,x:x*w,y:y*h,w:bw*w,h:bh*h,size:size*Math.min(w/595,h/595),font,align,color});}
  function img(p,url,x,y,bw,bh){p.elements.push({kind:'image',url,x:x*w,y:y*h,w:bw*w,h:bh*h});}
  function photo(p,item,x,y,bw,bh){const frame=c.photoFrame||'glass';p.elements.push({kind:'photo',url:item.url,x:x*w,y:y*h,w:bw*w,h:bh*h,frame,fit:c.photoFit||'contain',art:['glass','gold','botanical'].includes(frame)?`/album-frames/${frame}.png`:null,paper:t.paper,accent:t.accent});}
  function rule(p,x,y,bw){p.elements.push({kind:'rule',x:x*w,y:y*h,w:bw*w,h:1,color:t.accent});}
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
  const sequence=['hero','offset-duo','trio','hero-right','duo','panorama','gallery','grid'];
  while(offset<photos.length){
    const p=page();let layout=c.layout==='editorial'?sequence[(index+(c.layoutOffset||0))%sequence.length]:c.layout;
    const remaining=photos.length-offset;
    if(layout!=='keepsake'&&remaining===1&&!['hero','hero-right','panorama'].includes(layout))layout=index%2?'hero-right':'hero';
    else if(remaining===2&&['trio','gallery','grid'].includes(layout))layout='offset-duo';else if(remaining===3&&layout==='grid')layout='gallery';
    const take={keepsake:Math.min(4,remaining),hero:1,'hero-right':1,panorama:1,duo:2,'offset-duo':2,trio:3,gallery:3,grid:4}[layout];const batch=photos.slice(offset,offset+take);p.layout=layout;
    const wording=c.wording?(custom[index]||library[(index+c.wordingOffset)%library.length]):'';
    const kicker=`${String(index+1).padStart(2,'0')}  /  ${title}`;
    if(layout==='keepsake'){
      // A landscape PDF sheet is a complete two-page composition, not two clipped pages.
      p.elements.push({kind:'fold',x:w*.499,y:0,w:w*.002,h});
      const mirrored=index%2===1;
      const place=(item,x,y,bw,bh)=>photo(p,item,mirrored?1-x-bw:x,y,bw,bh);
      const label=(value,x,y,bw,bh,size=22,font='serif',color=t.ink)=>text(p,value,mirrored?1-x-bw:x,y,bw,bh,size,font,'center',color);
      const ornament=(x,y,bw)=>p.elements.push({kind:'ornament',x:(mirrored?1-x-bw:x)*w,y:y*h,w:bw*w,h:h*.025,color:t.accent});
      const headings={wedding:'Our Wedding',birthday:'Birthday Celebration',celebration:'Our Celebration',family:'Our Family Story',corporate:'Together, We Celebrate'};
      const subtitles={wedding:'A DAY TO REMEMBER',birthday:'ANOTHER BEAUTIFUL CHAPTER',celebration:'THE JOY OF BEING TOGETHER',family:'THE PEOPLE WE CALL HOME',corporate:'PEOPLE. MOMENTS. MILESTONES.'};
      if(batch.length===1){place(batch[0],.055,.10,.39,.76);}
      else {place(batch[0],.055,.09,.39,.40);place(batch[1],.055,.54,.19,.33);}
      if(batch.length>=3){place(batch[2],.55,.09,.395,batch.length===3?.56:.32);}
      if(batch.length===4)place(batch[3],.55,.45,.395,.32);
      const captionX=batch.length>1?.265:.55,captionY=batch.length>1?.55:.28,captionW=batch.length>1?.18:.395;
      if(c.wording){label(headings[c.eventType],captionX,captionY,captionW,.10,26);label(c.subtitle||subtitles[c.eventType],captionX,captionY+.105,captionW,.065,9,'sans',t.accent);ornament(captionX+.02,captionY+.185,captionW-.04);label(wording,captionX,captionY+.235,captionW,.10,15);}
      if(batch.length>=3&&c.wording){label(title,.55,batch.length===4?.795:.70,.395,.085,25);ornament(.65,batch.length===4?.885:.81,.195);}
      else if(batch.length===2&&c.wording){label(title,.56,.27,.37,.15,34);ornament(.66,.47,.17);label(details||'The people, the moments, the celebration.',.57,.55,.35,.13,19);}
    }else if(layout==='hero'||layout==='hero-right'){
      const right=layout==='hero-right',tx=right?.09:.69;
      photo(p,batch[0],right?.39:.065,.13,.54,.72);
      if(wording){text(p,kicker,tx,.25,.23,.055,9,'sans','left',t.accent);rule(p,tx,.335,.09);text(p,wording,tx,.39,.23,.32,26,'serif','left');}
    }else if(layout==='panorama'){
      photo(p,batch[0],.08,.10,.84,.59);
      if(wording){text(p,kicker,.12,.76,.20,.07,9,'sans','left',t.accent);rule(p,.35,.79,.06);text(p,wording,.45,.74,.43,.12,23,'serif','left');}
    }else if(layout==='offset-duo'){
      photo(p,batch[0],.07,.14,.41,.55);photo(p,batch[1],.52,.31,.41,.55);
      if(wording){text(p,kicker,.55,.13,.33,.045,9,'sans','left',t.accent);rule(p,.55,.21,.10);text(p,wording,.10,.75,.34,.12,21,'serif','left');}
    }else if(layout==='gallery'){
      photo(p,batch[0],.07,.18,.26,.52);photo(p,batch[1],.37,.24,.26,.52);photo(p,batch[2],.67,.18,.26,.52);
      if(wording){text(p,kicker,.12,.09,.76,.04,9,'sans','center',t.accent);text(p,wording,.18,.81,.64,.08,22);}
    }else{
      if(wording){text(p,kicker,.10,.09,.80,.035,9,'sans','center',t.accent);text(p,wording,.1,.15,.8,.11,23);}
      const rects=layout==='duo'?[[.075,.29,.405,.53],[.52,.29,.405,.53]]:layout==='trio'?[[.065,.29,.48,.55],[.58,.29,.35,.25],[.58,.58,.35,.25]]:[[.075,.29,.405,.25],[.52,.29,.405,.25],[.075,.58,.405,.25],[.52,.58,.405,.25]];
      batch.forEach((item,i)=>photo(p,item,...rects[i]));
    }
    if(c.pageNumbers)text(p,String(index+1).padStart(2,'0'),.43,.92,.14,.025,8,'sans');offset+=batch.length;index++;
  }
  const close=page();text(close,c.closing,.17,.34,.66,.26,30);text(close,title,.2,.68,.6,.08,14);text(close,c.footer,.15,.84,.7,.04,10,'sans');
  return pages;
}

// Frames follow the actual photograph when Fit is selected; no empty rectangular image wells.
export function photoGeometry(el,iw,ih){
  const framed=el.frame!=='none',art=!!el.art,px=el.frame==='gold-line'?0:framed?(art?.085:.025):0,py=el.frame==='gold-line'?0:framed?(art?.13:.025):0;
  let w=el.w,h=el.h;
  if(el.fit==='contain'&&iw>0&&ih>0){const scale=Math.min(w*(1-2*px)/iw,h*(1-2*py)/ih);w=iw*scale/(1-2*px);h=ih*scale/(1-2*py);}
  const x=el.x+(el.w-w)/2,y=el.y+(el.h-h)/2;
  return {x,y,w,h,ix:x+w*px,iy:y+h*py,iw:w*(1-2*px),ih:h*(1-2*py),radius:framed?Math.min(w,h)*.065:0};
}

// Shared vector flourish keeps the browser and exported ornament identical.
export const keepsakeFlourish='M0 7H100 M35 7Q28 -1 35 1Q41 2 35 7Z M43 7Q37 15 44 13Q49 11 43 7Z M51 7Q44 -1 51 1Q57 2 51 7Z M59 7Q53 15 60 13Q65 11 59 7Z M67 7Q60 -1 67 1Q73 2 67 7Z';
