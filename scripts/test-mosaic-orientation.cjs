const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'C:/Users/Unity/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),sharp=require('sharp');
(async()=>{const root=path.resolve(__dirname,'..'),browser=await chromium.launch({channel:'chrome',headless:true});
try{const page=await browser.newPage({viewport:{width:1600,height:1000},reducedMotion:'reduce'}),errors=[];page.on('pageerror',e=>errors.push(e.message));
const photos=await Promise.all([[400,600],[600,400],[600,400],[400,600]].map(async([width,height],i)=>({id:'photo-'+i,variant:'framed',url:'data:image/jpeg;base64,'+(await sharp({create:{width,height,channels:3,background:i%2?'gold':'navy'}}).jpeg().toBuffer()).toString('base64')})));
await page.addInitScript(()=>{window.streams=[];window.EventSource=class extends EventTarget{constructor(){super();window.streams.push(this);}close(){}};});
await page.route('http://mosaic.test/**',async route=>{const u=new URL(route.request().url());if(u.pathname==='/api/wall')return route.fulfill({json:{ok:true,photos,sessions:[],wall:{}}});const rel=u.pathname==='/wall'?'public/index.html':u.pathname.startsWith('/live/')?'live-public/'+u.pathname.slice(6):'public/'+u.pathname.slice(1);let f=path.join(root,rel);if(!fs.existsSync(f))f=path.join(root,'live-public',u.pathname.slice(1));if(fs.existsSync(f)&&fs.statSync(f).isFile())return route.fulfill({path:f});return route.fulfill({status:404,body:''});});
for(const kind of ['gallery','live']){
 if(kind==='gallery')await page.goto('http://mosaic.test/wall');
 else{await page.goto('http://mosaic.test/wall');await page.evaluate(async()=>{document.querySelectorAll('script').forEach(s=>s.remove());const link=document.createElement('link');link.rel='stylesheet';link.href='/live/mosaic-source.css';document.head.append(link);await new Promise(r=>link.onload=r);});await page.evaluate(async photos=>{document.body.innerHTML='<main id="stage" class="mosaic-stage" style="width:100vw;height:100vh"></main>';const {createMosaic}=await import('/live/mosaic-renderer.js');window.testMosaic=createMosaic(document.querySelector('#stage'));testMosaic.update(photos,{});},photos);}
 await page.waitForFunction(()=>document.querySelectorAll('.mosaic-slot.is-filled img').length===4);await page.waitForTimeout(1800);
 const tiles=await page.locator('.mosaic-slot.is-filled img').evaluateAll(imgs=>imgs.map(i=>{const r=i.closest('.mosaic-slot').getBoundingClientRect();return {photo:i.naturalWidth/i.naturalHeight,tile:r.width/r.height,fit:getComputedStyle(i).objectFit};}));
 assert.equal(tiles.length,4);for(const t of tiles){assert.equal(t.fit,'contain');assert.equal(t.photo<1,t.tile<1,kind+' orientation matched');}
 assert(await page.locator('.mosaic-slot.is-span-2').count()>0,kind+' portrait slots exist');
 if(kind==='live'){await page.evaluate(()=>testMosaic.update([],{}));await page.waitForTimeout(800);assert.equal(await page.locator('.mosaic-slot.is-filled').count(),0,'Removed photos do not return from timers');}
 else{await page.evaluate(()=>{for(const s of streams)s.dispatchEvent(new MessageEvent('photo.removed',{data:JSON.stringify({id:'photo-0'})}));});await page.waitForTimeout(800);assert.equal(await page.locator('.mosaic-slot.is-filled img').count(),3);}
}
assert.deepEqual(errors,[]);console.log('PASS Gallery and Live portrait/landscape tile placement, portrait placeholders and stale-photo removal.');
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
