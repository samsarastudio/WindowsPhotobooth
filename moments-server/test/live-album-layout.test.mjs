import test from 'node:test';import assert from 'node:assert/strict';
import {printDefaults} from '../live-public/print-catalog.js';import {printPlan,photoGeometry} from '../live-public/print-layout.js';
test('Editorial album cycles eight compositions without losing or duplicating photos',()=>{
  const photos=Array.from({length:60},(_,i)=>({url:`/photo/${i}`}));const pages=printPlan('album',printDefaults,{title:'A day together'},photos);
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
