const fs=require('fs'),path=require('path'),assert=require('node:assert/strict'),sharp=require('sharp');
const {_electron}=require('C:/Users/Unity/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const root=path.resolve(__dirname,'../..'),out=path.join(root,'output/gallery-actions-qa'),runtime=path.join(out,'runtime');
(async()=>{
 for(const scenario of ['standard','scene-preview','scene-thanks']){
  const skip=scenario==='scene-thanks',standard=scenario==='standard';
  const configFile=path.join(runtime,'config/photobooth-config.json'),config=JSON.parse(fs.readFileSync(configFile));
  config.guestFlow={...config.guestFlow,skipAiPreviewToThanks:skip,skipBackgroundPreviewToThanks:skip,skipPortraitPreviewToThanks:skip};fs.writeFileSync(configFile,JSON.stringify(config));
  const scene=config.aiModes.find(m=>m.pipeline==='scene');assert(scene);
  const app=await _electron.launch({executablePath:path.join(root,'photobooth-app/release/win-unpacked/PhotoBooth.exe'),env:{...process.env,PORTABLE_EXECUTABLE_DIR:runtime},timeout:60000});
  try{
   await app.evaluate(({ipcMain,BrowserWindow})=>{globalThis.qaGenerations=[];ipcMain.removeHandler('openai:generateImage');ipcMain.handle('openai:generateImage',(_e,p)=>{globalThis.qaGenerations.push(p);return {ok:false,error:'QA: generation intercepted after verifying crop'};});const w=BrowserWindow.getAllWindows()[0];w.setFullScreen(false);w.setSize(1366,900);});
   const page=await app.firstWindow();page.setDefaultTimeout(30000);await page.waitForFunction(()=>!!window.pbApi);await page.locator('.pb-attract-history').waitFor();
   const original=path.join(runtime,'capture/capture_1792860000000.jpg');
   await page.evaluate(state=>{history.pushState(state,'','#/prepare');window.dispatchEvent(new PopStateEvent('popstate',{state}));},{path:original,kind:standard?'standard':'ai',modeId:scene.id});
   await page.getByRole('slider',{name:'Zoom',exact:true}).waitFor();
   await page.waitForTimeout(500);
   const snapshot=()=>page.locator('canvas').evaluate(c=>c.toDataURL());
   const before=await snapshot();
   const zoom=page.getByRole('slider',{name:'Zoom',exact:true});await zoom.fill('1.7');await zoom.dispatchEvent('input');
   const zoomed=await snapshot();assert.notEqual(zoomed,before,'Zoom must change actual preview pixels');
   const box=await page.locator('canvas').boundingBox();await page.mouse.move(box.x+box.width/2,box.y+box.height/2);await page.mouse.down();await page.mouse.move(box.x+box.width/2,box.y+box.height/2-80,{steps:8});await page.mouse.up();
   assert.notEqual(await snapshot(),zoomed,'Dragging must change actual preview pixels');
   const dragged=await snapshot();
   const cdp=await page.context().newCDPSession(page);
   const touch={x:box.x+box.width/2,y:box.y+box.height/2,id:1,radiusX:3,radiusY:3,force:1};
   await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[touch]});
   await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{...touch,x:touch.x+50,y:touch.y+20}]});
   await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
   await cdp.detach();
   assert.notEqual(await snapshot(),dragged,'Touch dragging must change actual preview pixels');
   await page.screenshot({path:path.join(out,`crop-${scenario}.png`)});
   await page.getByRole('button',{name:'Use this photo',exact:true}).click();
   if(standard){await page.getByRole('heading',{name:'Your photo is ready'}).waitFor();const result=await page.evaluate(()=>history.state.path);assert(result.endsWith('_framed.png'));assert(fs.existsSync(result));console.log('PASS: standard zoom + drag changes pixels and saves framed result');continue;}
   let calls=[];for(let i=0;i<60;i++){calls=await app.evaluate(()=>globalThis.qaGenerations);if(calls.length)break;await page.waitForTimeout(100);}
   assert.equal(calls.length,1);assert(calls[0].imagePath.endsWith('_crop.jpg'));assert.notEqual(calls[0].imagePath,original);
   const metadata=await sharp(calls[0].imagePath).metadata();assert.equal(metadata.width,1800);assert.equal(metadata.height,1200);
   if(skip)assert(page.url().includes('/thanks'));else await page.getByText('QA: generation intercepted after verifying crop',{exact:true}).waitFor();
   console.log('PASS: saved adjusted scene source before '+(skip?'Thank you handoff':'processing preview')+'; no paid generation called');
  }finally{await app.close();}
 }
})().catch(e=>{console.error(e);process.exitCode=1});
