const fs=require('fs'),path=require('path'),http=require('http'),assert=require('node:assert/strict');
const {chromium}=require('C:/Users/Unity/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const root=path.resolve(__dirname,'..'),qa=path.resolve(root,'../builds/ai-flow-qa');
const config=JSON.parse(fs.readFileSync(path.join(root,'config/photobooth-config.default.json')));
delete config.openAiApiKey;delete config.adminPin;
const fixture='data:image/png;base64,'+fs.readFileSync(path.join(qa,'family-kids.png')).toString('base64');
const server=http.createServer((req,res)=>{
 const url=new URL(req.url,'http://localhost');let base=path.join(root,'dist/photobooth-app/browser'),rel=url.pathname;
 if(rel.startsWith('/themes/')){base=root;}else if(rel==='/')rel='/index.html';
 const file=path.resolve(base,'.'+rel);if(!file.startsWith(path.resolve(base)+path.sep)){res.writeHead(403).end();return;}
 try{const data=fs.readFileSync(file);res.setHeader('Content-Type',file.endsWith('.js')?'application/javascript':file.endsWith('.css')?'text/css':file.endsWith('.png')?'image/png':'text/html');res.end(data);}catch{res.writeHead(404).end();}
});
(async()=>{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const url='http://127.0.0.1:'+server.address().port;
 const browser=await chromium.launch({channel:'chrome',headless:true});const results=[];
 try{
 for(const c of [{id:'ai-retake',kind:'ai',pipeline:'scene',retake:true},{id:'standard-no-frame',kind:'standard',frame:false},{id:'standard-frame',kind:'standard',frame:true},{id:'scene-preview',kind:'ai',pipeline:'scene'},{id:'portrait-preview',kind:'ai',pipeline:'head-swap'},{id:'scene-tablet',kind:'ai',pipeline:'scene',skip:true},{id:'portrait-tablet',kind:'ai',pipeline:'head-swap',skip:true},{id:'ai-retry',kind:'ai',pipeline:'scene',fail:true}]){
  const page=await browser.newPage({viewport:{width:1366,height:900}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.addInitScript(({config,fixture,c})=>{
   const cfg={...config,openAiConfigured:true,aiGenerationEnabled:true,activeThemeId:'halloween',gallery:{enabled:true,apiBaseUrl:'https://example.test',uploadToken:'test-only',uploadOriginal:true,uploadAi:true,uploadFramed:true,uploadPhysical:true},debug:{enabled:false},print:{enabled:true},guestModes:{physicalFrameEnabled:true},guestFlow:{skipAiPreviewToThanks:!!c.skip,thanksAutoReturnSec:0},photoFrames:{enabled:c.frame!==false,autoApplyFrame:true,defaultFrameFile:'test.png',guestFrameFiles:['test.png'],photoScale:1},aiModes:[{id:'test-ai',label:'Halloween',prompt:'test',pipeline:c.pipeline||'scene',useInpainting:true,enabled:true}]};
   window.calls=[];window.saved={};
   history.replaceState({path:'C:/capture/test.jpg',kind:c.kind,modeId:'test-ai'},'',location.pathname+'#/prepare');
   window.pbApi={
    adminGetConfig:async()=>({ok:true,config:cfg}),adminGetThemeStylesheetUrl:async()=>({ok:true,url:'/themes/halloween/styles.css'}),
    readFileBase64:async p=>window.saved[p]||fixture,
    listPhotoFrames:async()=>({ok:true,frames:[{filename:'test.png',label:'Halloween',orientation:'landscape'}]}),
    saveJpeg:async(p,b)=>{window.calls.push(['save',p]);window.saved[p]='data:image/jpeg;base64,'+b;return {ok:true,path:p};},
    applyPhotoFrame:async p=>{window.calls.push(['frame',p]);return {ok:true,path:'C:/capture/test_crop_framed.png'};},
    openAiGenerateImage:async p=>{window.calls.push(['ai',p]);await new Promise(r=>setTimeout(r,1200));if(c.fail&&window.calls.filter(x=>x[0]==='ai').length===1)return {ok:false,error:'Test generation failure. Please try again.'};return {ok:true,path:'C:/capture/test_ai.png'};},
    galleryUploadPhoto:async p=>{window.calls.push(['upload',p]);return {ok:true,shareUrl:'https://example.test/photo',photoId:'test'};},
    applyPhysicalFrameLayout:async p=>{window.calls.push(['magnet',p]);window.saved['C:/capture/test_crop_physical.png']=document.querySelector('.pb-pf-canvas').toDataURL();return {ok:true,path:'C:/capture/test_crop_physical.png'};},
    printPhoto:async p=>{window.calls.push(['print',p]);return {ok:true};},
    log:async()=>({ok:true}),cameraInvoke:async()=>({ok:true}),
   };
  },{config,fixture,c});
  await page.goto(url);await page.getByRole('heading',{name:c.kind==='standard'?'Adjust your photo':'Check your photo'}).waitFor().catch(async e=>{if(!c.skip)throw e;});
  if(c.kind==='standard'){
   await page.getByRole('button',{name:'Use this photo'}).waitFor();
   await page.screenshot({path:path.join(qa,'flow-'+c.id+'-crop.png')});
   await page.setViewportSize({width:768,height:1024});
   await page.screenshot({path:path.join(qa,'flow-'+c.id+'-tablet-crop.png')});
   const cropOverflow=await page.getByRole('button').evaluateAll(bs=>bs.some(b=>b.getBoundingClientRect().bottom>innerHeight));assert.equal(cropOverflow,false);
   await page.setViewportSize({width:1366,height:900});
   await page.getByRole('button',{name:'Use this photo'}).click();
  }else {
   await page.getByRole('button',{name:'Use this photo'}).waitFor();
   await page.waitForTimeout(300);
   assert.equal(await page.evaluate(()=>window.calls.filter(x=>x[0]==='ai').length),0,'No AI request before approval');
   await page.screenshot({path:path.join(qa,'flow-'+c.id+'-review.png')});
   if(c.retake){await page.getByRole('button',{name:'Retake photo'}).click();await page.waitForURL('**/#/capture');assert.equal(await page.evaluate(()=>window.calls.filter(x=>x[0]==='ai').length),0);results.push({case:c.id,pass:true});console.log('PASS',c.id);await page.close();continue;}
   await page.getByRole('button',{name:'Use this photo'}).click();
   if(!c.skip)await page.screenshot({path:path.join(qa,'flow-'+c.id+'-processing.png')});
  }
  if(c.fail){await page.getByRole('button',{name:'Try again',exact:true}).waitFor();await page.screenshot({path:path.join(qa,'flow-error.png')});await page.getByRole('button',{name:'Try again',exact:true}).click();}
  if(c.skip){await page.waitForURL('**/#/thanks');await page.getByText('Follow its progress on the tablet.',{exact:false}).waitFor();}
  else{
   await page.getByRole('heading',{name:'Your photo is ready'}).waitFor();
   assert.equal(await page.getByRole('button',{name:/Create AI version|Change frame/}).count(),0);
   assert.ok(await page.getByRole('button',{name:/magnet|physical/i}).count()>0,'Magnet action must remain');
   await page.getByRole('button',{name:'Share',exact:true}).click();
   await page.getByRole('dialog').waitFor();await page.screenshot({path:path.join(qa,'flow-'+c.id+'-share.png')});
   await page.getByRole('dialog').getByRole('button').click();
   await page.getByRole('button',{name:'Print',exact:true}).click();
   if(c.id==='standard-frame'){
    await page.getByRole('button',{name:/Create.*magnet/i}).click();
    await page.getByRole('button',{name:'Create sheet',exact:true}).click();
    await page.getByRole('button',{name:'Print magnet sheet',exact:true}).click();
    const magnetCalls=await page.evaluate(()=>window.calls);
    assert.equal(magnetCalls.find(x=>x[0]==='magnet')[1].imagePath,'C:/capture/test_crop_framed.png');
    assert.equal(magnetCalls.filter(x=>x[0]==='print').at(-1)[1].layoutMode,'physicalFrame');
   }
  }
  await page.screenshot({path:path.join(qa,'flow-'+c.id+'-final.png')});
  const calls=await page.evaluate(()=>window.calls);
  if(c.kind==='standard'){assert.equal(calls.filter(x=>x[0]==='ai').length,0);assert.equal(calls.filter(x=>x[0]==='frame').length,c.frame?1:0);}
  else{assert.equal(calls.filter(x=>x[0]==='ai').length,c.fail?2:1);assert.equal(calls.find(x=>x[0]==='ai')[1].imagePath,'C:/capture/test.jpg');}
  assert.deepEqual(errors,[]);results.push({case:c.id,pass:true});console.log('PASS',c.id);
  if(c.id==='standard-frame'){
   await page.setViewportSize({width:768,height:1024});await page.screenshot({path:path.join(qa,'flow-tablet-result.png')});
   const clipped=await page.getByRole('button').evaluateAll(bs=>bs.some(b=>{const r=b.getBoundingClientRect();return r.width&&r.height&&(r.bottom>innerHeight||r.right>innerWidth||r.left<0);}));assert.equal(clipped,false,'Tablet actions must fit');
  }
  await page.close();
 }
 fs.writeFileSync(path.join(qa,'guest-flow-tests.json'),JSON.stringify({scope:'Production Angular build with mocked local camera/generation/print APIs; no physical print or live backend',results},null,2));
 }finally{await browser.close();server.close();}
})().catch(e=>{console.error(e);server.close();process.exitCode=1;});
