const { chromium, webkit } = require(process.env.PLAYWRIGHT_MODULE || 'C:/Users/Unity/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const assert = require('node:assert/strict');
const sharp = require('sharp');

const sizes = [
  ['compact',320,480], ['small',320,568], ['android-small',360,640], ['classic',375,667],
  ['standard',390,844], ['notched',393,852], ['android-large',412,915], ['large',430,932],
  ['landscape-small',568,320], ['landscape-classic',667,375], ['landscape',844,390], ['landscape-large',932,430],
  ['browser-bars',390,600], ['keyboard',320,400],
  ['safe-area',393,852,{top:59,bottom:34,left:0,right:0}],
  ['safe-landscape',852,393,{top:0,bottom:21,left:59,right:59}]
];
(async () => {
  const root = path.resolve(__dirname, '..');
  const out = path.join(root, 'output/camera-responsive'); fs.mkdirSync(out, { recursive: true });
  const data = fs.mkdtempSync(path.join(os.tmpdir(), 'live-camera-layout-'));
  const base = 'http://127.0.0.1:3193', key = 'camera-layout-test-administrator-key-32-characters';
  const server = spawn(process.execPath, ['src/live/index.js'], { cwd: root, windowsHide: true, env: { ...process.env, LIVE_PORT: '3193', LIVE_BASE_URL: base, LIVE_DATA_DIR: data, LIVE_ADMIN_KEY: key }, stdio: 'pipe' });
  let logs = '', browser; server.stderr.on('data', b => { logs += b; });
  const results = [];
  async function api(url, body, headers = {}) { const r = await fetch(base + '/api' + url, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body) }); assert.ok(r.ok, await r.clone().text()); return { body: await r.json(), cookie: r.headers.get('set-cookie')?.split(';')[0] }; }
  try {
    let ready = false;
    for (let i=0;i<100;i++) { if (server.exitCode !== null) throw new Error(logs); try { if ((await fetch(base+'/api/health')).ok) { ready=true; break; } } catch {} await new Promise(r=>setTimeout(r,100)); }
    assert.ok(ready,'Test server starts');
    const invite = await api('/admin/invitations',{name:'Camera QA',email:'camera@example.com'},{'X-Live-Admin-Key':key});
    const auth = await api('/auth/accept',{token:new URLSearchParams(new URL(invite.body.url).hash.slice(1)).get('access')});
    const event = (await api('/events',{title:'A night to remember',status:'published',visibility:'own'}, {cookie:auth.cookie})).body;
    for (const engine of (process.env.CAMERA_ENGINES || 'chromium,webkit').split(',')) {
      browser = await (engine === 'chromium' ? chromium.launch({ channel:'chrome',headless:true }) : webkit.launch({headless:true}));
      for (const [name,width,height,insets] of sizes) {
        const context = await browser.newContext({viewport:{width,height},deviceScaleFactor:1,hasTouch:true,isMobile:true});
        // Deterministic canvas camera, not a hardware/device certification.
        await context.addInitScript(() => {
          if (!navigator.mediaDevices) Object.defineProperty(navigator, 'mediaDevices', { value: {} });
          navigator.mediaDevices.getUserMedia = async () => {
            const c=document.createElement('canvas'); c.width=720; c.height=1280; const x=c.getContext('2d');
            const gradient=x.createLinearGradient(0,0,720,1280); gradient.addColorStop(0,'#b9c7ac'); gradient.addColorStop(.55,'#e3d4b5'); gradient.addColorStop(1,'#7e9b8c');
            x.fillStyle=gradient; x.fillRect(0,0,720,1280);
            x.strokeStyle='#ffffff55'; x.lineWidth=2;
            for(let y=0;y<1280;y+=80){x.beginPath();x.moveTo(0,y);x.lineTo(720,y);x.stroke();}
            for(let v=0;v<720;v+=80){x.beginPath();x.moveTo(v,0);x.lineTo(v,1280);x.stroke();}
            x.fillStyle='#253c33'; x.beginPath();x.arc(360,600,180,0,Math.PI*2);x.fill();
            x.strokeStyle='#f9f9ed';x.lineWidth=3;x.strokeRect(210,450,300,300);
            x.fillStyle='#fff';x.textAlign='center';x.font='bold 24px sans-serif';x.fillText('CAMERA TEST',360,592);x.font='18px sans-serif';x.fillText('Live preview',360,628);
            if (c.captureStream) return c.captureStream(10);
            // Windows WebKit has no media stack. Exercise layout using a poster/track stub.
            const track={readyState:'live',stop(){this.readyState='ended';}};
            Object.defineProperty(HTMLMediaElement.prototype,'srcObject',{configurable:true,get(){return this._testStream;},set(value){this._testStream=value;if(value)this.poster=c.toDataURL();}});
            HTMLMediaElement.prototype.play=async function(){};
            return {getVideoTracks:()=>[track],getTracks:()=>[track]};
          };
        });
        const page=await context.newPage(); const errors=[];page.on('pageerror',e=>errors.push(e.message));
        await page.goto(`${base}/e/${event.slug}`);
        if(insets) await page.evaluate(v=>{for(const [k,value] of Object.entries(v))document.body.style.setProperty(`--safe-${k}`,`${value}px`);},insets);
        await page.locator('#join [name=name]').fill('Guest'); await page.getByRole('button',{name:'Join event',exact:true}).click();
        await page.locator('#camera').click(); await page.locator('#shutter:not([disabled])').waitFor().catch(async e=>{console.error(engine, await page.locator('body').innerText(), errors);throw e;});
        const check = async selector => {
          const r=await page.locator(selector).boundingBox(); assert.ok(r,`${engine}/${name} ${selector} visible`);
          assert.ok(r.x>=-1&&r.y>=-1&&r.x+r.width<=width+1&&r.y+r.height<=height+1,`${engine}/${name} ${selector} inside viewport: ${JSON.stringify(r)}`);
          return r;
        };
        assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth&&document.documentElement.scrollHeight<=innerHeight),true,`${engine}/${name}: no page scroll`);
        assert.equal(await page.locator('body>header').isVisible(),false);
        const preview=await check('#camera-preview'); assert.ok(preview.width>100&&preview.height>100);
        for(const selector of ['#shutter','#open-gallery','#open-camera-settings','#quick-flip']) {const r=await check(selector);assert.ok(r.width>=44&&r.height>=44,`${selector} touch target`);}
        const shutter=await check('#shutter'); const gallery=await check('#open-gallery');
        assert.ok(shutter.x+shutter.width<=gallery.x||gallery.x+gallery.width<=shutter.x||shutter.y+shutter.height<=gallery.y||gallery.y+gallery.height<=shutter.y,'Controls do not overlap');
        if(insets) assert.ok(gallery.x+gallery.width<=width-insets.right+1 && gallery.y+gallery.height<=height-insets.bottom+1,'Gallery clears safe area');
        if(['compact','standard','landscape','safe-area','safe-landscape'].includes(name)) await page.screenshot({path:path.join(out,`${engine}-${name}-camera.png`)});
        // Validate capture framing against the visible preview, plus popup containment.
        if(engine==='chromium') await page.locator('#shutter').click();
        else {
          await page.locator('#open-camera-settings').click();
          const fixture=await sharp({create:{width:720,height:1280,channels:3,background:'#a8baa0'}}).jpeg().toBuffer();
          await page.locator('#upload').setInputFiles({name:'test-frame.jpg',mimeType:'image/jpeg',buffer:fixture});
        }
        await page.waitForFunction(()=>document.querySelector('.shot-count strong')?.textContent==='24');
        await page.locator('#open-gallery').click(); await page.locator('.photo img').waitFor();
        await check('#gallery-dialog'); await check('[data-close="gallery-dialog"]');
        const src=await page.locator('.photo img').last().getAttribute('src'); const photo=await context.request.get(base+src);const metadata=await sharp(await photo.body()).metadata();
        if(engine==='chromium') assert.ok(Math.abs(metadata.width/metadata.height-preview.width/preview.height)<.015,'Captured frame matches viewfinder aspect');
        if(name==='standard') await page.screenshot({path:path.join(out,`${engine}-gallery.png`)});
        await page.getByRole('button',{name:'Close gallery',exact:true}).click();
        await page.locator('#open-camera-settings').click();await check('#camera-settings');await check('[data-close="camera-settings"]');
        await page.locator('#settings-camera').click();await page.getByRole('button',{name:'Close camera settings',exact:true}).click();
        assert.equal(await page.locator('#shutter').isDisabled(),true);
        assert.deepEqual(errors,[]);
        results.push({engine,name,width,height,safeArea:insets||null,result:'PASS',coverage:engine==='chromium'?'layout + canvas-stream capture + gallery + settings':'layout + mocked preview + file upload + gallery + settings'});console.log(`PASS ${engine} ${name} ${width}x${height}`);
        await context.close();
      }
      await browser.close(); browser=null;
    }
    fs.writeFileSync(path.join(out,'results.json'),JSON.stringify({note:'Desktop Chromium and WebKit, touch viewport emulation, synthetic camera stream in Chromium; WebKit uses a poster/track mock because its Windows build has no media stack. Safe-area values are simulated. Not physical iPhone/Android testing.',cases:results},null,2));
    console.log(`PASS ${results.length} camera layouts. Screenshots: ${out}`);
  } finally {if(browser)await browser.close();server.kill();if(server.exitCode===null)await new Promise(r=>server.once('exit',r));fs.rmSync(data,{recursive:true,force:true});}
})().catch(e=>{console.error(e);process.exitCode=1;});
