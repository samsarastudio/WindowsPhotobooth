const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'C:/Users/Unity/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const {spawn}=require('node:child_process');const fs=require('node:fs');const os=require('node:os');const path=require('node:path');const assert=require('node:assert/strict');const sharp=require('sharp');
(async()=>{
  const root=path.resolve(__dirname,'..'),data=fs.mkdtempSync(path.join(os.tmpdir(),'wall-browser-')),out=path.join(root,'output/live-qa');fs.mkdirSync(out,{recursive:true});
  const base='http://127.0.0.1:3194',key='wall-browser-administrator-key-32-characters';
  const server=spawn(process.execPath,['src/live/index.js'],{cwd:root,windowsHide:true,env:{...process.env,LIVE_PORT:'3194',LIVE_BASE_URL:base,LIVE_DATA_DIR:data,LIVE_ADMIN_KEY:key},stdio:'pipe'});let browser;
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
    await admin.goto(base+'/admin');await admin.getByText('Mosaic wall link',{exact:true}).click();await admin.getByRole('button',{name:'Enable wall link',exact:true}).click();
    const link=admin.getByRole('textbox',{name:'Mosaic wall link',exact:true});await link.waitFor();const url=await link.inputValue();
    const wall=await browser.newPage({viewport:{width:1920,height:1080}});wall.on('pageerror',e=>errors.push(e.message));
    assert.equal((await wall.request.get(base+'/api/me')).status(),401,'Wall viewer has no owner/admin session');
    await wall.goto(url);await wall.locator('.mosaic-slot.is-filled img').first().waitFor();await wall.waitForTimeout(2200);assert.equal(await wall.locator('.mosaic-slot.is-filled img').count(),11,'Each photo appears once, not repeated');assert.equal(await wall.locator('header,footer,#count').count(),0,'No header, footer or photo count');assert.equal(await wall.evaluate(()=>new Set([...document.querySelectorAll('.mosaic-slot[data-id]')].map(el=>el.dataset.id)).size),11,'Pending photo excluded');
    await wall.waitForFunction(()=>[...document.querySelectorAll('.mosaic-slot.is-filled img')].every(img=>img.complete&&img.naturalWidth>0));
    await wall.waitForTimeout(900);
    await wall.screenshot({path:path.join(out,'mosaic-wall-desktop.png')});
    for(const size of [{width:390,height:844},{width:844,height:390},{width:1920,height:1080}]){await wall.setViewportSize(size);assert.equal(await wall.evaluate(()=>document.documentElement.scrollWidth<=innerWidth&&document.documentElement.scrollHeight<=innerHeight),true,'Wall fits viewport');}
    const logoBytes=await sharp({create:{width:100,height:60,channels:3,background:'#caff45'}}).png().toBuffer();
    await admin.getByLabel('Partner logo',{exact:true}).setInputFiles({name:'logo.png',mimeType:'image/png',buffer:logoBytes});
    await admin.getByRole('button',{name:'Upload partner logo',exact:true}).click();
    await admin.getByRole('button',{name:'Clear partner logo',exact:true}).waitFor();
    await admin.getByLabel('Completed grid (turn off for live collage)',{exact:true}).check();
    await admin.getByLabel('Completed grid density (columns)',{exact:true}).fill('12');
    await admin.getByLabel('Partner brand text',{exact:true}).fill('Event partner');
    await admin.getByLabel('Enable brand partner reveal',{exact:true}).check();
    await admin.getByLabel('Show partner every (seconds)',{exact:true}).fill('10');
    await admin.getByLabel('Hold partner on screen (seconds)',{exact:true}).fill('3');
    await admin.getByRole('button',{name:'Save wall display',exact:true}).click();
    await wall.locator('#stage.is-completed').waitFor({timeout:12000});
    await wall.waitForFunction(()=>document.querySelector('#stage').getBoundingClientRect().height===innerHeight);
    await wall.locator('#mosaicBrandReveal.is-on').waitFor({timeout:15000});
    assert.equal(await wall.locator('#mosaicBrandRevealText').textContent(),'Event partner');
    assert.equal(await wall.locator('#mosaicBrandRevealLogo').isVisible(),true);
    assert.equal(await wall.locator('#mosaicBrandRevealLogo').evaluate(img=>img.complete&&img.naturalWidth>0),true);
    await wall.locator('#mosaicBrandReveal:not(.is-on)').waitFor({state:'attached',timeout:5000});
    await wall.waitForTimeout(800);
    await wall.screenshot({path:path.join(out,'mosaic-wall-completed.png')});
    const image=await wall.locator(`.mosaic-slot[data-id="${ids[0]}"] img`).first().getAttribute('src');
    // Hide the photo through the actual studio control, then remove another permanently.
    await admin.goto(base+`/host/${e.slug}`);await admin.locator(`[data-approve="${ids[0]}"]`).click();
    await wall.locator(`.mosaic-slot[data-id="${ids[0]}"]`).first().waitFor({state:'detached',timeout:12000});assert.equal((await wall.request.get(base+image)).status(),404);
    await admin.locator(`[data-delete="${ids[1]}"]`).click();await admin.getByRole('button',{name:'Delete photo',exact:true}).click();
    await wall.locator(`.mosaic-slot[data-id="${ids[1]}"]`).first().waitFor({state:'detached',timeout:12000});
    await admin.getByText('Mosaic wall link',{exact:true}).click();await admin.getByRole('button',{name:'Disable wall',exact:true}).click();
    await wall.locator('#state').filter({hasText:'no longer available'}).waitFor({timeout:12000});assert.equal(await wall.locator('.mosaic-slot.is-filled img').count(),0);
    assert.deepEqual(errors,[]);console.log('PASS: admin wall sharing, anonymous viewing, pending-photo exclusion, live hide/delete, disabling, and responsive wall layout.');
  }finally{if(browser)await browser.close();server.kill();if(server.exitCode===null)await new Promise(r=>server.once('exit',r));fs.rmSync(data,{recursive:true,force:true});}
})().catch(e=>{console.error(e);process.exitCode=1;});
