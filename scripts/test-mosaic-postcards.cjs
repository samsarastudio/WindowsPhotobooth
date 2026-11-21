// Pixel regression: postcard top/bottom borders must survive both mosaic modes.
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'C:/Users/Unity/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),sharp=require('sharp');
(async()=>{
 const browser=await chromium.launch({channel:'chrome',headless:true});
 try{
  const page=await browser.newPage({viewport:{width:900,height:500},reducedMotion:'reduce'});
  for(const sheet of ['public/css/gallery.css','live-public/mosaic-source.css']){
   for(const completed of [false,true]){
    const images=await Promise.all([[400,600],[600,400],[400,400]].map(async([w,h])=>{
     const svg=`<svg width="${w}" height="${h}"><rect width="100%" height="100%" fill="#116633"/><rect width="100%" height="40" fill="#ff0000"/><rect y="${h-40}" width="100%" height="40" fill="#0000ff"/></svg>`;
     return 'data:image/png;base64,'+(await sharp(Buffer.from(svg)).png().toBuffer()).toString('base64');
    }));
    await page.setContent(`<style>${fs.readFileSync(path.join(__dirname,'..',sheet),'utf8')}</style><style>body{margin:0}.mosaic-stage{width:880px;height:240px}.mosaic-slot{--sz:260px;--sz-h:200px;--rot:0deg;--my:10px;--float-dur:8s;--float-delay:0s}.mosaic-stage.is-completed{--completed-cols:3;--completed-rows:1}*,*::before,*::after{animation:none!important;transition:none!important}</style><main class="mosaic-stage ${completed?'is-completed':''}">${images.map((src,i)=>`<div class="mosaic-slot is-filled" style="--mx:${i*290}px"><span class="mosaic-slot-card"><img class="mosaic-slot-photo" src="${src}"/></span></div>`).join('')}</main>`);
    await page.locator('img').evaluateAll(imgs=>Promise.all(imgs.map(i=>i.decode())));
    for(const image of await page.locator('img').all()){
     const geometry=await image.evaluate(i=>({fit:getComputedStyle(i).objectFit,w:i.clientWidth,h:i.clientHeight,nw:i.naturalWidth,nh:i.naturalHeight}));
     assert.equal(geometry.fit,'contain',sheet+' preserves whole postcard');
     const {data,info}=await sharp(await image.screenshot()).removeAlpha().raw().toBuffer({resolveWithObject:true});
     const scale=Math.min(info.width/geometry.nw,info.height/geometry.nh),height=geometry.nh*scale,offset=(info.height-height)/2,x=Math.floor(info.width/2);
     for(const [y,color]of [[Math.floor(offset+10*scale),[255,0,0]],[Math.floor(offset+height-10*scale),[0,0,255]]]){
      const n=(y*info.width+x)*info.channels;assert.deepEqual([...data.subarray(n,n+3)],color,`${sheet} completed=${completed}: postcard edge visible`);
     }
    }
   }
  }
  console.log('PASS Gallery and Live: portrait, landscape and square postcards retain top/bottom borders in animated and completed mosaics.');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
