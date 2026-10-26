const fs=require('fs'),path=require('path'),assert=require('node:assert/strict');
const sharp=require('sharp');
const {_electron}=require('C:/Users/Unity/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const root=path.resolve(__dirname,'../..'),out=path.join(root,'output/gallery-actions-qa'),runtime=path.join(out,'runtime');
async function verifyTouchCrop(page){
 const canvas=page.locator('.pb-pf-canvas'),before=await canvas.evaluate(c=>c.toDataURL()),box=await canvas.boundingBox();
 const cdp=await page.context().newCDPSession(page),touch={x:box.x+box.width/2,y:box.y+box.height/2,id:1,radiusX:3,radiusY:3,force:1};
 await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[touch]});
 await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{...touch,x:touch.x+35,y:touch.y-20}]});
 await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await cdp.detach();
 assert.notEqual(await canvas.evaluate(c=>c.toDataURL()),before,'Touch drag changes the crop preview pixels');
}
(async()=>{
 fs.mkdirSync(path.join(runtime,'config/photo-frames'),{recursive:true});fs.mkdirSync(path.join(runtime,'capture'),{recursive:true});
 const config=JSON.parse(fs.readFileSync(path.join(root,'photobooth-app/config/photobooth-config.default.json')));
 config.gallery={...config.gallery,enabled:false};config.print={...config.print,enabled:true};config.boothUpdates={enabled:false};
 config.photoFrames={...config.photoFrames,enabled:true,defaultFrameFile:'qa-frame.png'};
 fs.writeFileSync(path.join(runtime,'config/photobooth-config.json'),JSON.stringify(config));fs.writeFileSync(path.join(runtime,'config/.release-1.1.53'),'');
 fs.copyFileSync(path.join(root,'output/failure-review-2026-10-23/live-frame.png'),path.join(runtime,'config/photo-frames/qa-frame.png'));
 const original=path.join(runtime,'capture/capture_1792860000000.jpg');
 await sharp(path.join(root,'output/failure-review-2026-10-23/group-original.png')).jpeg().toFile(original);
 fs.copyFileSync(path.join(root,'output/failure-review-2026-10-23/friends-group-gallery.png'),original.replace('.jpg','_framed.png'));
 const app=await _electron.launch({executablePath:path.join(root,'photobooth-app/release/win-unpacked/PhotoBooth.exe'),env:{...process.env,PORTABLE_EXECUTABLE_DIR:runtime},timeout:60000});
 try{
  await app.evaluate(({ipcMain,BrowserWindow})=>{globalThis.qaPrints=[];ipcMain.removeHandler('print:photo');ipcMain.handle('print:photo',(_e,p)=>{globalThis.qaPrints.push(p);return {ok:true};});const w=BrowserWindow.getAllWindows()[0];w.setFullScreen(false);w.setSize(1366,900);});
  const page=await app.firstWindow();page.setDefaultTimeout(30000);await page.waitForFunction(()=>!!window.pbApi);
  await page.locator('.pb-attract-history').click();
  await page.locator('.pb-cb-card').filter({hasText:'Original'}).first().click();
  assert(await page.locator('.pb-cb-card').filter({hasText:'Framed'}).count());
  await page.getByRole('button',{name:'Change frame / crop',exact:true}).click();
  await page.screenshot({path:path.join(out,'frame-picker.png')});console.log('Frame options',await page.locator('.pb-cb-frame-opt').allTextContents());
  await page.locator('.pb-cb-frame-opt').filter({hasText:/2026 slim\s*$/i}).click();
  await page.locator('.pb-cb-frame-pick .pb-btn-primary').click();
  const range=page.locator('.pb-pf-zoom-range');await range.waitFor();
  await page.waitForFunction(()=>!document.querySelector('.pb-pf-actions .pb-btn-primary').disabled);
  await range.fill('1.3');await range.dispatchEvent('input');
  await page.getByRole('button',{name:'Reset crop / fill frame'}).click();assert.equal(await range.inputValue(),'1');
  await range.fill('1.2');await range.dispatchEvent('input');
  await verifyTouchCrop(page);
  await page.locator('.pb-pf-actions .pb-btn-primary').click();await page.locator('.pb-pf-overlay').waitFor({state:'detached'});
  await page.getByRole('button',{name:'Print selected photo',exact:true}).click();
  await page.getByRole('button',{name:'Make magnet / crop',exact:true}).click();
  await page.waitForFunction(()=>!document.querySelector('.pb-pf-actions .pb-btn-primary').disabled);
  await range.fill('1.15');await range.dispatchEvent('input');
  const canvas=page.locator('.pb-pf-canvas'),box=await canvas.boundingBox();await page.mouse.move(box.x+box.width/2,box.y+box.height/2);await page.mouse.down();await page.mouse.move(box.x+box.width/2+25,box.y+box.height/2-15);await page.mouse.up();
  await verifyTouchCrop(page);
  await page.screenshot({path:path.join(out,'magnet-crop.png')});
  await page.locator('.pb-pf-actions .pb-btn-primary').click();await page.locator('.pb-pf-overlay').waitFor({state:'detached'});
  await page.getByRole('button',{name:'Print selected photo',exact:true}).click();
  const prints=await app.evaluate(()=>globalThis.qaPrints);assert.equal(prints.length,2);assert(prints[0].filePath.endsWith('_framed.png'));assert.equal(prints[0].layoutMode,undefined);assert(prints[1].filePath.endsWith('_physical.png'));assert.equal(prints[1].layoutMode,'physicalFrame');
  for(const p of prints)assert(fs.existsSync(p.filePath));
  await page.screenshot({path:path.join(out,'magnet-ready.png')});
  fs.writeFileSync(path.join(out,'report.json'),JSON.stringify({ok:true,prints,actualPrinterUsed:false},null,2));console.log('PASS: originals + framed, frame crop, magnet crop, generated files, correct print payloads. Printer dispatch intercepted.');
 }catch(e){const page=await app.firstWindow();await page.screenshot({path:path.join(out,'failure.png')});console.log((await page.locator('body').innerText()).slice(-2000));throw e;}finally{await app.close();}
})().catch(e=>{console.error(e);process.exitCode=1});
