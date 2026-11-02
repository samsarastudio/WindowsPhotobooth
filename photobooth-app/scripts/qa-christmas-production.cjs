'use strict';
// Drive the packaged UI with a prerecorded camera. No renderer/API mocks.
const fs=require('fs'),path=require('path'),assert=require('assert/strict'),{execFileSync}=require('child_process');
const {_electron:electron}=require('C:/Users/Unity/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const root=path.resolve(__dirname,'../..'),app=path.join(root,'photobooth-app');
const out=path.join(root,'output/christmas/production-qa'),kind=process.argv[2]||'family';
const depth=process.argv.find(x=>x.startsWith('--depth='))?.split('=')[1];
const tag=depth?kind+'-'+depth+'-v122':kind;
const limit=Number(process.argv.find(x=>x.startsWith('--scene-limit='))?.split('=')[1]||10);
const indices=process.argv.find(x=>x.startsWith('--scene-indices='))?.split('=')[1].split(',').map(Number);
const runtime=path.join(out,'runtime-'+tag+'-halloween-logic');fs.mkdirSync(path.join(runtime,'config'),{recursive:true});
const env=require(path.join(root,'moments-server/node_modules/dotenv')).parse(fs.readFileSync(path.join(root,'moments-server/.env')));
const config=JSON.parse(fs.readFileSync(path.join(app,'config/photobooth-config.default.json')));
config.camera={source:'webcam',sdkCameraIndex:0,webcamDeviceId:null};config.capture.countdownSeconds=2;
config.aiGenerationEnabled=true;config.print.enabled=false;config.guestFlow={...config.guestFlow,skipAiPreviewToThanks:false,skipPortraitPreviewToThanks:false,skipBackgroundPreviewToThanks:false,thanksAutoReturnSec:0,boothId:'christmas-production-qa'};
config.gallery={...config.gallery,uploadToken:env.UPLOAD_TOKEN,sessionPrefix:'christmas-production-qa',apiBaseUrl:'https://moments.inmomentservices.com'};
config.boothUpdates={enabled:false};config.releaseProfileVersion='1.2.0-christmas';
const cfgPath=path.join(runtime,'config/photobooth-config.json');fs.writeFileSync(cfgPath,JSON.stringify(config));
const clip=path.join(out,tag+'.y4m');
if(!fs.existsSync(clip))execFileSync('ffmpeg',['-y','-v','error','-loop','1','-i',depth?path.join(root,'output/christmas/samples-depth','sample-'+depth+'.png'):path.join(root,'moments-server/public/assets/halloween/samples',kind==='family'?'scene-original.png':'portrait-original.png'),'-t','2','-vf','scale=960:640:force_original_aspect_ratio=decrease,pad=960:640:(ow-iw)/2:(oh-ih)/2:color=white','-r','15','-pix_fmt','yuv420p','-f','yuv4mpegpipe',clip],{windowsHide:true});
let instance,page;const report={kind,hardware:'Prerecorded camera input; no physical printing',results:[],errors:[]};
async function screenshot(name){await page.waitForTimeout(450);const png=await instance.evaluate(async({BrowserWindow})=>(await BrowserWindow.getAllWindows()[0].webContents.capturePage()).toPNG().toString('base64'));fs.writeFileSync(path.join(out,tag+'-'+name+'.png'),Buffer.from(png,'base64'));}
async function goHome(){await page.evaluate(()=>{location.hash='/';});await page.locator('.pb-kia-cta').waitFor();await page.locator('.pb-kia-cta').click();await page.locator('.pb-exp-card').first().waitFor();}
async function capture(){await page.waitForURL(/#\/prepare/, {timeout:45000});await page.getByRole('button',{name:'Use this photo',exact:true}).waitFor();await screenshot('prepare');await page.getByRole('button',{name:'Use this photo',exact:true}).click();await Promise.race([page.waitForURL(/#\/(result|thanks)/,{timeout:420000}),page.locator('.prepare-card .error').waitFor({timeout:420000}).then(async()=>{throw Error(await page.locator('.prepare-card .error').innerText());})]);}
async function collect(name){await page.locator('.pb-result-img').waitFor();await page.waitForFunction(()=>document.querySelector('.pb-result-img')?.naturalWidth>0);await screenshot(name+'-result');const history=await page.evaluate(()=>window.pbApi.listCaptureHistory({limit:1}));const item=history.photos?.[0];assert(item,'Capture history missing');if(!item.hasPhysical){const deadline=Date.now()+60000;let delivered=false;while(Date.now()<deadline){const feed=await(await fetch(config.gallery.apiBaseUrl+'/api/tablet/today?prefix=christmas-production-qa')).json();if(feed.photos?.some(p=>p.sourceLocalName===path.basename(item.displayPath))){delivered=true;break;}await page.waitForTimeout(1500);}assert(delivered,'Result did not reach the live tablet feed');}const result={scenario:name,status:'passed',history:item};report.results.push(result);fs.writeFileSync(path.join(out,tag+'-report.json'),JSON.stringify(report,null,2));console.log('PASS packaged UI',name);}
(async()=>{
 try{
  const settingsResponse=await fetch('https://moments.inmomentservices.com/api/admin/settings',{headers:{'x-admin-pin':env.ADMIN_PIN}});
  assert(settingsResponse.ok,'Unable to retrieve authoritative production upload credential');
  const settings=await settingsResponse.json();
  console.log('Production AI configured:',!!settings.settings?.halloweenApiKeyConfigured,'remaining:',settings.settings?.halloweenGenerationRemaining);
  const token=settings.settings?.uploadToken||settings.uploadToken;
  assert(token,'Production upload token missing');config.gallery.uploadToken=token;fs.writeFileSync(cfgPath,JSON.stringify(config));
  const launchEnv={...process.env,PORTABLE_EXECUTABLE_DIR:runtime};delete launchEnv.ELECTRON_RUN_AS_NODE;
  instance=await electron.launch({executablePath:path.join(app,'release/win-unpacked/PhotoBooth.exe'),args:['--disable-gpu','--disable-backgrounding-occluded-windows','--disable-renderer-backgrounding','--use-fake-ui-for-media-stream','--use-fake-device-for-media-stream','--use-file-for-fake-video-capture='+clip],env:launchEnv,timeout:60000});
  page=await instance.firstWindow();page.on('pageerror',e=>report.errors.push(e.message));
  await instance.evaluate(({BrowserWindow})=>{const w=BrowserWindow.getAllWindows()[0];w.setFullScreen(false);w.setSize(1366,900);});
  await page.locator('.pb-kia-cta').waitFor({timeout:60000});await screenshot('home');
  const paths=await page.evaluate(()=>window.pbApi.getPaths());assert(paths.captureDir.startsWith(runtime),'QA capture escaped isolated runtime');
  await goHome();await screenshot('menu');await page.waitForTimeout(4500);
  for(const name of ['halloween-haunt.png','halloween-haunt-portrait.png'])assert(fs.existsSync(path.join(runtime,'config/photo-frames',name)),'Automatic sync removed configured frame '+name);
  console.log('MENU',await page.locator('.pb-exp-card').allTextContents());
  if(process.argv.includes('--inspect')){await page.waitForTimeout(15000);console.log('CONFIG READY',await page.evaluate(async()=>{const r=await window.pbApi.adminGetConfig();return {aiGenerationEnabled:r.config.aiGenerationEnabled,openAiConfigured:r.config.openAiConfigured,camera:r.config.camera};}));return;}
  if(kind==='family'||kind==='solo-scenes'){
   await page.locator('.pb-exp-card').first().click();await capture();await collect('classic');
   await page.getByRole('button',{name:'Share',exact:true}).waitFor({timeout:45000});
   await page.getByRole('button',{name:'Share',exact:true}).click();await page.locator('.pb-share-qr').waitFor();await screenshot('share-qr');await page.locator('.pb-share-back').click();
   report.results.push({scenario:'live-upload-share-qr',status:'passed'});
   await page.locator('.pb-result-physical-btn').click();await page.locator('.pb-pf-actions .pb-btn-primary').waitFor();
   await page.locator('.pb-pf-actions .pb-btn-primary').click();await page.getByRole('heading',{name:'Your magnet layout is ready'}).waitFor({timeout:30000});await collect('magnet-layout');
   await goHome();await page.locator('.pb-exp-card').nth(2).click();await page.locator('.pb-scene-card').first().waitFor();await screenshot('scene-menu');
   const names=await page.locator('.pb-scene-card-label').allTextContents();assert.equal(names.length,10);
   for(let i=0;i<Math.min(limit,kind==='solo-scenes'?3:names.length);i++){
    if(indices&&!indices.includes(i))continue;
    if(i){await goHome();await page.locator('.pb-exp-card').nth(2).click();await page.locator('.pb-scene-card').first().waitFor();}
    try{await page.locator('.pb-scene-card').nth(i).click();await capture();await collect('scene-'+i+'-'+names[i].trim());}catch(e){report.results.push({scenario:names[i],status:'failed',error:e.message});console.error('FAIL scene',names[i],e.message);}
   }
  }else{
   await page.locator('.pb-exp-card').nth(1).click();await page.locator('.pb-portrait-card').first().waitFor();await screenshot('portrait-menu');
   const names=await page.locator('.pb-portrait-card-label').allTextContents();assert.equal(names.length,7);
   for(let i=0;i<names.length;i++){
    if(i){await goHome();await page.locator('.pb-exp-card').nth(1).click();await page.locator('.pb-portrait-card').first().waitFor();}
    try{await page.locator('.pb-portrait-card').nth(i).click();await capture();await collect('portrait-'+i+'-'+names[i].trim());}catch(e){report.results.push({scenario:names[i],status:'failed',error:e.message});console.error('FAIL portrait',names[i],e.message);}
   }
  }
 }catch(e){report.errors.push(e.message);console.error(e.message);process.exitCode=1;}
 finally{if(report.results.some(r=>r.status==='failed')||report.errors.length)process.exitCode=1;if(!process.argv.includes('--inspect'))fs.writeFileSync(path.join(out,tag+'-report.json'),JSON.stringify(report,null,2));if(instance)await instance.close();const safe=JSON.parse(fs.readFileSync(cfgPath));if(safe.gallery)safe.gallery.uploadToken='';safe.openAiApiKey='';fs.writeFileSync(cfgPath,JSON.stringify(safe));}
})();
