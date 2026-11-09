const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'C:/Users/Unity/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const {spawn}=require('node:child_process'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),assert=require('node:assert/strict');
(async()=>{
 const root=path.resolve(__dirname,'..'),data=fs.mkdtempSync(path.join(os.tmpdir(),'live-landing-')),out=path.join(root,'output/live-qa'),base='http://127.0.0.1:3196';fs.mkdirSync(out,{recursive:true});
 const server=spawn(process.execPath,['src/live/index.js'],{cwd:root,windowsHide:true,env:{...process.env,LIVE_PORT:'3196',LIVE_BASE_URL:base,LIVE_DATA_DIR:data,LIVE_ADMIN_KEY:'marketing-test-admin-key-more-than-32-characters'},stdio:'pipe'});let browser;
 try{
  for(let i=0;i<100;i++){try{if((await fetch(base+'/api/health')).ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}
  browser=await chromium.launch({channel:'chrome',headless:true});const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(base);await page.locator('.landing-hero').waitFor();await page.evaluate(()=>document.fonts.ready);
  assert.equal(await page.locator('#login').count(),0);
  await page.evaluate(async()=>{for(const i of document.images)i.loading='eager';await Promise.all([...document.images].map(i=>i.decode()));});
  for(const width of [320,390,768,1440]){await page.setViewportSize({width,height:900});await page.evaluate(()=>document.fonts.ready);assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`Homepage overflow at ${width}`);await page.evaluate(()=>scrollTo(0,document.body.scrollHeight));await page.waitForTimeout(150);await page.evaluate(()=>scrollTo(0,0));await page.waitForTimeout(150);await page.screenshot({path:path.join(out,`landing-${width}.png`),fullPage:true});if(width===1440)await page.screenshot({path:path.join(out,'landing-hero.png')});}
  await page.setViewportSize({width:390,height:844});await page.locator('.landing-menu summary').click();await page.getByRole('link',{name:'Event owner access',exact:true}).click();await page.locator('#login').waitFor();
  assert.equal(await page.locator('#login input[type=email]').count(),1);
  await page.goto(base+'/marketing/');await page.locator('.banner').first().waitFor();await page.evaluate(()=>document.fonts.ready);
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'Campaign collection overflow');
  await page.setViewportSize({width:1920,height:1080});await page.evaluate(()=>document.body.classList.add('export'));
  await page.evaluate(async()=>{await Promise.all([...document.images].map(i=>i.decode()));await document.fonts.ready;});
  const items=JSON.parse(fs.readFileSync(path.join(root,'live-public/marketing/campaign.json')));
  for(const item of items){const banner=page.locator('#'+item.slug);assert.ok(await banner.evaluate(el=>el.querySelector('.copy').getBoundingClientRect().bottom<el.querySelector('.banner-footer').getBoundingClientRect().top),'Banner text overlaps footer');await banner.screenshot({path:path.join(root,'live-public/marketing',item.slug+'-banner.jpg'),type:'jpeg',quality:95});}
  assert.deepEqual(errors,[]);console.log('PASS: landing page at 320/390/768/1440, owner access menu, campaign collection and five 1920x1080 JPG exports.');
 }finally{if(browser)await browser.close();server.kill();if(server.exitCode===null)await new Promise(r=>server.once('exit',r));fs.rmSync(data,{recursive:true,force:true});}
})().catch(e=>{console.error(e);process.exitCode=1;});
