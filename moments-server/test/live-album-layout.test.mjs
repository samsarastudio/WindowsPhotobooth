import test from 'node:test';import assert from 'node:assert/strict';
import {printDefaults} from '../live-public/print-catalog.js';import {printPlan,photoGeometry} from '../live-public/print-layout.js';
test('Editorial album cycles eight compositions without losing or duplicating photos',()=>{
  const photos=Array.from({length:60},(_,i)=>({url:`/photo/${i}`}));const pages=printPlan('album',{...printDefaults,layout:'editorial'},{title:'A day together'},photos);
  assert.equal(new Set(pages.filter(p=>p.layout).map(p=>p.layout)).size,8);
  const rendered=pages.flatMap(p=>p.elements.filter(e=>e.kind==='photo'));
  assert.deepEqual(rendered.map(e=>e.url),photos.map(p=>p.url));
  for(const page of pages)for(const el of page.elements){assert.ok(el.x>=0&&el.y>=0&&el.x+el.w<=page.w+.01&&el.y+el.h<=page.h+.01);}
  for(const page of pages.filter(p=>p.layout))for(const text of page.elements.filter(e=>e.kind==='text'))for(const photo of page.elements.filter(e=>e.kind==='photo'))assert.ok(text.x+text.w<=photo.x||photo.x+photo.w<=text.x||text.y+text.h<=photo.y||photo.y+photo.h<=text.y,'Text has its own space');
});
test('Fit follows portrait and landscape proportions; Fill uses the chosen frame box',()=>{
  for(const frame of ['none','rounded','glass','gold','botanical'])for(const [iw,ih] of [[600,900],[900,600],[500,500]]){
    const el={x:25,y:35,w:400,h:250,frame,art:['glass','gold','botanical'].includes(frame),fit:'contain'};const g=photoGeometry(el,iw,ih);assert.ok(Math.abs(g.iw/g.ih-iw/ih)<.0001);assert.ok(g.x>=el.x&&g.y>=el.y&&g.x+g.w<=el.x+el.w+.001&&g.y+g.h<=el.y+el.h+.001);
    const fill=photoGeometry({...el,fit:'cover'},iw,ih);assert.equal(fill.w,400);assert.equal(fill.h,250);
  }
});

test('Keepsake spreads preserve every photo, alternate sides and handle incomplete final spreads',()=>{
  for(let count=1;count<=19;count++)for(const size of ['a4','letter','classic','large','custom']){
    const photos=Array.from({length:count},(_,i)=>({url:`/photo/${i}`}));
    const config={...printDefaults,albumStyle:'keepsake',layout:'keepsake',photoFrame:'gold-line',photoFit:'cover',border:'none',albumSize:size,albumWidth:300,albumHeight:180,eventType:'wedding'};
    const pages=printPlan('album',config,{title:'Our wedding'},photos);
    assert.ok(pages.every(p=>p.paper==='#f8efdd'&&p.background===null));
    const rendered=pages.flatMap(p=>p.elements.filter(e=>e.kind==='photo'));
    assert.deepEqual(rendered.map(p=>p.url),photos.map(p=>p.url));
    for(const page of pages){
      for(const el of page.elements)assert.ok(el.x>=0&&el.y>=0&&el.x+el.w<=page.w+.01&&el.y+el.h<=page.h+.01,JSON.stringify(el));
      for(const text of page.elements.filter(e=>e.kind==='text'))for(const photo of page.elements.filter(e=>e.kind==='photo'))assert.ok(text.x+text.w<=photo.x+.01||photo.x+photo.w<=text.x+.01||text.y+text.h<=photo.y+.01||photo.y+photo.h<=text.y+.01,'Caption never overlaps a photograph');
    }
    if(count>4){const spread=pages.filter(p=>p.layout);assert.ok(spread[0].elements.find(e=>e.kind==='photo').x<spread[1].elements.find(e=>e.kind==='photo').x);}
    const qr=printPlan('qr',config,{title:'Join',url:'https://example.com'});assert.ok(qr[0].background,'Album paper does not change QR artwork');
  }
});

test('QR normal is two portrait pages; fold card is one landscape sheet with QR left and instructions right',()=>{
  for(const size of ['a3','a4','a5','a6','postcard','invitation','custom'])for(const mode of ['text','logo','none'])for(const scale of [25,100,400]){
    const config={...printDefaults,qrSize:size,qrWidth:100,qrHeight:150,qrHeaderMode:mode,qrLogoScale:scale};
    const e={title:'Event name',url:'https://example.com/e/test'};
    const normal=printPlan('qr',{...config,qrLayout:'pages',qrLandscape:true},e,[],'/logo');assert.equal(normal.length,2);assert.ok(normal.every(p=>p.h>p.w));assert.equal(normal[0].elements.filter(e=>e.kind==='qr').length,1);assert.equal(normal[1].elements.filter(e=>e.kind==='qr').length,0);
    const folded=printPlan('qr',{...config,qrLayout:'fold'},e,[],'/logo');assert.equal(folded.length,1);const p=folded[0];assert.ok(p.w>p.h);const qr=p.elements.find(e=>e.kind==='qr');assert.ok(qr.x+qr.w<=p.w/2);assert.ok(p.elements.find(e=>e.kind==='fold'));
    const phone=p.elements.find(e=>e.url?.includes('qr-instruction'));assert.ok(phone.x>=p.w/2);
    if(mode!=='text')assert.ok(!p.elements.some(e=>e.text==='Event name'||e.text===config.qrHeading));
    for(const page of [...normal,...folded])for(const el of page.elements)assert.ok(el.x>=0&&el.y>=0&&el.x+el.w<=page.w+.01&&el.y+el.h<=page.h+.01,JSON.stringify(el));
    const mark=p.elements.find(e=>e.url==='/logo');if(mark)assert.ok(mark.x+mark.w<=qr.x||qr.x+qr.w<=mark.x||mark.y+mark.h<=qr.y||qr.y+qr.h<=mark.y);
  }
});

test('Compact albums fill the page, preserve order and handle partial pages',()=>{
  for(const layout of ['compact','tiles'])for(const count of [1,2,3,4,5,6,7,10,13,25])for(const per of [1,4,6,9,12]){
    const photos=Array.from({length:count},(_,i)=>({url:`/p/${i}`}));
    const pages=printPlan('album',{...printDefaults,layout,photosPerPage:per,wording:false},{title:'Photos'},photos).filter(p=>p.layout);
    assert.equal(pages.length,Math.ceil(count/per));
    assert.deepEqual(pages.flatMap(p=>p.elements.filter(e=>e.kind==='photo').map(e=>e.url)),photos.map(p=>p.url));
    for(const p of pages){const pics=p.elements.filter(e=>e.kind==='photo');
      assert.ok(pics.reduce((sum,e)=>sum+e.w*e.h,0)/(p.w*p.h)>.80);
      for(const a of pics){assert.equal(a.frame,'none');assert.equal(a.fit,layout==='tiles'?'cover':'contain');assert.ok(a.x>=0&&a.y>=0&&a.x+a.w<=p.w&&a.y+a.h<=p.h);}
      for(let i=0;i<pics.length;i++)for(let j=i+1;j<pics.length;j++){const a=pics[i],b=pics[j];assert.ok(a.x+a.w<=b.x+.01||b.x+b.w<=a.x+.01||a.y+a.h<=b.y+.01||b.y+b.h<=a.y+.01);}
    }
  }
});

test('Mosaic handles mixed orientations and partial pages without overlap or missing photos',()=>{
  for(let n=1;n<=12;n++){
    const photos=Array.from({length:n},(_,i)=>({url:`/p/${i}`,width:i%3===0?600:900,height:i%3===0?900:600}));
    const p=printPlan('album',{...printDefaults,layout:'mosaic',photosPerPage:12,wording:false,photoFit:'cover'},{title:'Mosaic'},photos).find(p=>p.layout);
    const pics=p.elements.filter(e=>e.kind==='photo');assert.deepEqual(pics.map(e=>e.url),photos.map(e=>e.url));
    for(const a of pics)assert.ok(a.w>0&&a.h>0&&a.x>=0&&a.y>=0&&a.x+a.w<=p.w+.01&&a.y+a.h<=p.h+.01);
    for(let i=0;i<pics.length;i++)for(let j=i+1;j<pics.length;j++){const a=pics[i],b=pics[j];assert.ok(a.x+a.w<=b.x+.01||b.x+b.w<=a.x+.01||a.y+a.h<=b.y+.01||b.y+b.h<=a.y+.01);}
    assert.ok(pics.reduce((s,e)=>s+e.w*e.h,0)/(p.w*p.h)>.8);
  }
});

test('Dense album layouts honor selected paper and keep theme text readable',()=>{
  for(const layout of ['mosaic','compact','tiles'])for(const theme of ['wedding','birthday','celebration','corporate','family'])for(const albumStyle of ['themed','keepsake']){
    const pages=printPlan('album',{...printDefaults,layout,theme,albumStyle,wording:true},{title:'Our event'},[{url:'/photo',width:600,height:900}]);
    const cover=pages[0],photoPage=pages.find(p=>p.layout);
    assert.equal(photoPage.background,cover.background);assert.equal(photoPage.paper,cover.paper);
    if(albumStyle==='themed')assert.equal(photoPage.background,`/print-themes/${theme}-album.jpg`);
    else assert.equal(photoPage.paper,'#f8efdd');
    const ink=cover.elements.find(e=>e.kind==='text').color;
    assert.ok(photoPage.elements.filter(e=>e.kind==='text').every(e=>e.color===ink));
  }
});
