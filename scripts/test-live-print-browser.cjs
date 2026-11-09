const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'C:/Users/Unity/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const {spawn}=require('node:child_process');const fs=require('node:fs');const os=require('node:os');const path=require('node:path');const assert=require('node:assert/strict');const sharp=require('sharp');
(async()=>{
  const root=path.resolve(__dirname,'..'),data=fs.mkdtempSync(path.join(os.tmpdir(),'print-browser-')),out=path.join(root,'output/live-qa');fs.mkdirSync(out,{recursive:true});
  const base='http://127.0.0.1:3195',key='wall-browser-administrator-key-32-characters';
  const boothBytes=await sharp({create:{width:600,height:400,channels:3,background:'gold'}}).png().toBuffer();
  const boothPhotos=[{id:'booth-photo',url:'/media/booth/photo.png',variant:'framed'}];
  const booth=require('node:http').createServer((req,res)=>{if(req.url==='/media/booth/photo.png'){res.end(boothBytes);return;}res.setHeader('Content-Type','application/json');res.end(JSON.stringify(req.url==='/api/wall'?{ok:true,sessions:[{slug:'booth',title:'Reception photobooth'}]}:{ok:true,session:{slug:'booth',photos:boothPhotos}}));}).listen(0,'127.0.0.1');await new Promise(r=>booth.once('listening',r));
  const server=spawn(process.execPath,['src/live/index.js'],{cwd:root,windowsHide:true,env:{...process.env,LIVE_GALLERY_URL:'',LIVE_PORT:'3195',LIVE_BASE_URL:base,LIVE_DATA_DIR:data,LIVE_ADMIN_KEY:key},stdio:'pipe'});let browser;
  try{
    for(let i=0;i<100;i++){try{if((await fetch(base+'/api/health')).ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}
    browser=await chromium.launch({channel:'chrome',headless:true});const admin=await browser.newPage({viewport:{width:1440,height:1000}});const errors=[];admin.on('pageerror',e=>errors.push(e.message));
    assert.equal((await admin.request.post(base+'/api/admin/auth/setup',{data:{key,email:'admin@example.com',password:'wall-test-admin-password'}})).status(),200);
    const owner=await (await admin.request.post(base+'/api/admin/invitations',{data:{email:'owner@example.com',name:'Event owner'}})).json();
    const e=await (await admin.request.post(base+'/api/admin/events',{data:{owner:owner.owner.id,title:'Every moment, together',status:'published',moderation:1}})).json();
    const guest=await browser.newContext();await guest.request.post(base+`/api/guest/${e.slug}/join`,{data:{name:'Guest'}});
    const ids=[];
    for(let i=0;i<12;i++){
      const colors=['#a7bda4','#d6b397','#90acb5','#c3a5b9'];
      const svg=Buffer.from(`<svg width="480" height="640"><rect width="480" height="640" fill="${colors[i%4]}"/><circle cx="240" cy="240" r="95" fill="#f0d8b6"/><rect x="90" y="350" width="300" height="300" rx="120" fill="${colors[(i+1)%4]}"/><text x="30" y="600" fill="#fff" font-size="34">Moment ${i+1}</text></svg>`);
      const bytes=await sharp(svg).jpeg().toBuffer();
      const photo=await (await guest.request.post(base+`/api/guest/${e.slug}/photos`,{multipart:{photo:{name:'photo.jpg',mimeType:'image/jpeg',buffer:bytes},request_id:`photo-${i}`}})).json();ids.push(photo.id);
      if(i<11)await admin.request.patch(base+`/api/events/${e.slug}/photos/${photo.id}`,{data:{approved:true}});
    }

    await admin.goto(base+'/admin');
    await admin.getByLabel('Moments gallery link',{exact:true}).fill(`http://127.0.0.1:${booth.address().port}/booth`);
    await admin.getByRole('button',{name:'Save & test connection',exact:true}).click();
    await admin.getByText('Photobooth gallery',{exact:true}).click();
    assert.equal(await admin.getByLabel('Photobooth album',{exact:true}).inputValue(),'booth');
    assert.equal(await admin.getByLabel('Framed',{exact:true}).isChecked(),true);
    assert.equal(await admin.getByLabel('Original (unframed)',{exact:true}).isChecked(),false);
    await admin.getByRole('button',{name:'Connect & sync',exact:true}).click();
    await admin.getByRole('button',{name:'Pause connection',exact:true}).waitFor();
    const initialBooth=(await (await admin.request.get(base+`/api/guest/${e.slug}/photos`)).json()).find(p=>p.guest_name==='Photobooth');
    const wall=await (await admin.request.patch(base+`/api/events/${e.slug}/wall`,{data:{enabled:true,config:{completedView:true}}})).json();
    const wallPage=await browser.newPage({viewport:{width:1280,height:720}});await wallPage.goto(wall.url);await wallPage.locator('[data-id]').first().waitFor();
    boothPhotos.push({id:'later-capture',url:'/media/booth/photo.png',variant:'framed'});
    let laterPhoto;const syncDeadline=Date.now()+15000;
    while(Date.now()<syncDeadline){laterPhoto=(await (await admin.request.get(base+`/api/guest/${e.slug}/photos`)).json()).find(p=>p.guest_name==='Photobooth'&&p.id!==initialBooth.id);if(laterPhoto)break;await new Promise(r=>setTimeout(r,200));}
    assert.ok(laterPhoto,'A later photobooth capture arrives without pressing Sync now');assert.equal(laterPhoto.approved,0);
    assert.equal(await wallPage.locator(`[data-id="${laterPhoto.id}"]`).count(),0);
    await admin.request.patch(base+`/api/events/${e.slug}/photos/${laterPhoto.id}`,{data:{approved:true}});
    await wallPage.locator(`[data-id="${laterPhoto.id}"]`).first().waitFor({timeout:15000});await wallPage.close();
    await admin.bringToFront();await admin.locator('[data-sync-state]').filter({hasText:'2 imported'}).waitFor({timeout:10000});
    await admin.screenshot({path:path.join(out,'photobooth-connection.png'),fullPage:true});
    await admin.getByRole('button',{name:'Pause connection',exact:true}).click();
    await admin.getByText('Paused:',{exact:false}).waitFor();
    await admin.getByText('Remove connected gallery',{exact:true}).click();
    await admin.getByRole('button',{name:'Remove gallery & imported photos',exact:true}).click();
    await admin.locator('#notice').filter({hasText:'2 imported photos removed'}).waitFor();
    assert.equal(await admin.getByText('Remove connected gallery',{exact:true}).count(),0);
    await admin.getByRole('link',{name:'QR print studio',exact:true}).click();
    await admin.locator('.design-page').waitFor();await admin.getByLabel('Event type',{exact:true}).selectOption('wedding');
    await admin.getByLabel('Paper size',{exact:true}).selectOption('custom');await admin.getByLabel('Custom width (mm)',{exact:true}).fill('100');await admin.getByLabel('Custom height (mm)',{exact:true}).fill('150');
    await admin.getByLabel('Event title override',{exact:true}).fill('Emma & James');await admin.getByLabel('Date as printed',{exact:true}).fill('12 December 2026');
    await admin.getByRole('button',{name:'Save & preview',exact:true}).click();await admin.locator('#preview-label').filter({hasText:'100.0 × 150.0'}).waitFor();
    await admin.getByText('Upload your logo',{exact:true}).click();
    const bytes=await sharp({create:{width:160,height:80,channels:3,background:'#a4ba91'}}).png().toBuffer();await admin.getByLabel('Print logo',{exact:true}).setInputFiles({name:'logo.png',mimeType:'image/png',buffer:bytes});await admin.getByRole('button',{name:'Upload logo',exact:true}).click();await admin.getByRole('button',{name:'Remove logo',exact:true}).waitFor();
    let download=admin.waitForEvent('download');await admin.getByRole('button',{name:'Download PDF',exact:true}).click();await (await download).saveAs(path.join(out,'browser-qr.pdf'));
    await admin.evaluate(()=>document.fonts.ready);await admin.screenshot({path:path.join(out,'print-studio-desktop.png'),fullPage:true});
    await admin.getByRole('link',{name:'Landscape album',exact:true}).click();await admin.locator('.design-page').waitFor();
    await admin.getByLabel('Photo frame',{exact:true}).selectOption('gold');await admin.getByLabel('Photo fitting',{exact:true}).selectOption('cover');
    await admin.getByLabel('Album cover title',{exact:true}).fill('A day held close');await admin.getByLabel('Opening note (optional)',{exact:true}).fill('All our favorite people, together. A collection of moments from every perspective.');
    await admin.getByText('Photos & ordering',{exact:true}).click();await admin.getByLabel('Include photo 1',{exact:true}).check();await admin.getByLabel('Include photo 3',{exact:true}).check();
    await admin.getByLabel('Photo order',{exact:true}).selectOption('manual');await admin.getByRole('button',{name:'Save & preview',exact:true}).click();await admin.locator('#export-summary').filter({hasText:'2 of 2'}).waitFor();
    await admin.getByRole('button',{name:'Next page',exact:true}).click();await admin.getByRole('button',{name:'Next page',exact:true}).click();await admin.evaluate(()=>document.fonts.ready);await admin.locator('.design-page img[src="/album-frames/gold.png"]').waitFor();await admin.screenshot({path:path.join(out,'album-studio-desktop.png'),fullPage:true});
    for(const size of [{width:390,height:844},{width:320,height:568},{width:844,height:390}]){await admin.setViewportSize(size);const overflow=await admin.evaluate(()=>({width:innerWidth,total:document.documentElement.scrollWidth,els:[...document.querySelectorAll('body *')].filter(el=>el.getBoundingClientRect().right>innerWidth+1).map(el=>({tag:el.tagName,cls:el.className,id:el.id,width:el.getBoundingClientRect().width})).slice(0,15)}));assert.equal(overflow.total<=size.width,true,JSON.stringify(overflow));}
    await admin.setViewportSize({width:390,height:844});await admin.screenshot({path:path.join(out,'album-studio-mobile.png'),fullPage:true});
    download=admin.waitForEvent('download');await admin.getByRole('button',{name:'Download PDF',exact:true}).click();await (await download).saveAs(path.join(out,'browser-album.pdf'));
    assert.deepEqual(errors,[]);console.log('PASS: ongoing photobooth capture sync and open wall updates, connect/pause/remove, QR custom sizes, logo upload, landscape album selection and order, previews, PDF downloads and responsive print studio.');
  }finally{if(browser)await browser.close();server.kill();if(server.exitCode===null)await new Promise(r=>server.once('exit',r));await new Promise(r=>booth.close(r));fs.rmSync(data,{recursive:true,force:true});}
})().catch(e=>{console.error(e);process.exitCode=1;});
