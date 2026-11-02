'use strict';
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
const {chromium}=require('C:/Users/Unity/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const app=path.resolve(__dirname,'..'),out=path.resolve(app,'../output/christmas/ui');fs.mkdirSync(out,{recursive:true});
const config=JSON.parse(fs.readFileSync(path.join(app,'config/photobooth-config.default.json')));delete config.adminPin;
const backgrounds=fs.readdirSync(path.join(app,'config/ai-backgrounds/scene')).filter(f=>/\.(png|webp)$/.test(f)).map(filename=>({filename,url:'/config/ai-backgrounds/scene/'+filename,displayName:JSON.parse(fs.readFileSync(path.join(app,'config/ai-backgrounds/scene',filename.replace(/\.[^.]+$/,'.depths.json')))).displayName}));
const server=http.createServer((req,res)=>{const u=new URL(req.url,'http://localhost');let base=path.join(app,'dist/photobooth-app/browser');if(u.pathname.startsWith('/themes/'))base=app;const rel=u.pathname==='/'?'/index.html':u.pathname,file=path.resolve(base,'.'+rel);if(!file.startsWith(base+path.sep)){res.writeHead(403).end();return;}try{res.setHeader('Content-Type',({'.js':'application/javascript','.css':'text/css','.png':'image/png','.webp':'image/webp','.json':'application/json'})[path.extname(file)]||'text/html');res.end(fs.readFileSync(file));}catch{res.writeHead(404).end();}});
(async()=>{await new Promise(r=>server.listen(0,'127.0.0.1',r));const browser=await chromium.launch({channel:'chrome',headless:true});try{
 for(const [name,width,height]of [['desktop',1366,900],['tablet',768,1024]]){
  const page=await browser.newPage({viewport:{width,height}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.addInitScript(({config,backgrounds})=>{window.pbApi={adminGetConfig:async()=>({ok:true,config:{...config,aiGenerationEnabled:true,openAiConfigured:true}}),adminGetThemeStylesheetUrl:async()=>({ok:true,url:'/themes/christmas/styles.css'}),adminListAiBackgrounds:async()=>({ok:true,backgrounds}),portraitThumbnails:async()=>({ok:true,items:config.aiModes.filter(m=>m.pipeline==='head-swap').map(m=>({modeId:m.id,url:'/config/compositions/'+m.id+'/composition.png'}))}),log:async()=>({ok:true})};},{config,backgrounds});
  for(const route of ['', 'booth-mode','scene-select','portrait-select']){
   await page.goto('http://127.0.0.1:'+server.address().port+'/#/'+route);await page.locator('h1').waitFor();await page.evaluate(()=>Promise.all(Array.from(document.images).map(i=>i.decode().catch(()=>{}))));
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,'No horizontal overflow');
   assert(await page.locator('h1').evaluate(e=>e.getBoundingClientRect().top>=0),'Heading must stay visible above scrollable choices');
   if(route==='scene-select'||route==='portrait-select')assert(await page.getByRole('link',{name:'Back',exact:true}).evaluate(e=>e.getBoundingClientRect().bottom<=innerHeight),'Back must remain reachable');
   if(route==='scene-select')assert.equal(await page.locator('.pb-scene-card').count(),10);
   if(route==='portrait-select')assert.equal(await page.locator('.pb-portrait-card').count(),7);
   await page.screenshot({path:path.join(out,name+'-'+(route||'home')+'.png'),fullPage:true});
  }assert.deepEqual(errors,[]);await page.close();
 }
 console.log('PASS Christmas home, experience picker, 10 scenes and 7 portraits at desktop/tablet widths, no page errors or horizontal overflow.');
}finally{await browser.close();server.close();}})().catch(e=>{console.error(e);server.close();process.exitCode=1});
