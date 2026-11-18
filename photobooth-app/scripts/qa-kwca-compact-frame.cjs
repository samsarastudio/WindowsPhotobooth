const fs=require('fs'),path=require('path'),os=require('os'),assert=require('assert/strict'),sharp=require('sharp');
const {_electron}=require('C:/Users/Unity/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const {PackageStore}=require('../electron/theme-packages.cjs');
const appRoot=path.resolve(__dirname,'..'),root=path.dirname(appRoot),out=path.join(root,'deliverables/skin-packages/kwca/illustrated-final');
(async()=>{
 const runtime=fs.mkdtempSync(path.join(os.tmpdir(),'kwca-frame-qa-'));
 const store=new PackageStore(path.join(runtime,'skin-packages'),'1.3.1');store.install(fs.readFileSync(path.join(root,'deliverables/skin-packages/sports-cricket-1.3.0.booth.zip')));store.activate({id:'sports-cricket',version:'1.3.0'});
 const env={...process.env,PB_QA_RUNTIME:runtime,PORTABLE_EXECUTABLE_DIR:runtime};delete env.ELECTRON_RUN_AS_NODE;
 const app=await _electron.launch({executablePath:process.env.PB_QA_PACKAGE_EXE||path.join(appRoot,'node_modules/electron/dist/electron.exe'),args:[...(process.env.PB_QA_PACKAGE_EXE?[]:[appRoot]),'--disable-gpu'],env});
 try{
  const page=await app.firstWindow();await page.waitForFunction(()=>!!window.pbApi);
  const samples=[['01-family-trophy-landscape','01-family-trophy-landscape','landscape'],['02-couple-pavilion-landscape','02-couple-pavilion-landscape','landscape'],['03-family-trophy-portrait','01-family-trophy-landscape','portrait'],['04-couple-pavilion-portrait','02-couple-pavilion-landscape','portrait']];
  const tiles=[];
  for(let i=0;i<samples.length;i++){
   const [name,source,orientation]=samples[i];const original=path.join(os.tmpdir(),'booth-skins-qa-UQLttx','capture',source+'_ai_raw.png');
   const found=fs.existsSync(original)?original:path.join(os.tmpdir(),'booth-skins-qa-UQLttx',source+'_ai_raw.png');assert(fs.existsSync(found),found);
   const raw=path.join(runtime,name+'.png');fs.copyFileSync(found,raw);
   const result=await page.evaluate(p=>window.pbApi.applyPhotoFrame(p),{imagePath:raw,frameFile:'cricket-'+orientation+'.webp'});
   console.log(name,JSON.stringify(result));
   const file=raw.replace('.png','_framed.png');assert(fs.existsSync(file));
   await sharp(file).jpeg({quality:95}).toFile(path.join(out,name+'.jpg'));
   tiles.push({input:await sharp(file).resize(720,800,{fit:'contain',background:'#071b29'}).jpeg().toBuffer(),left:i%2*720,top:Math.floor(i/2)*800});
  }
  await sharp({create:{width:1440,height:1600,channels:3,background:'#071b29'}}).composite(tiles).jpeg().toFile(path.join(out,'four-final-samples.jpg'));
 }finally{await app.close();}
})().catch(e=>{console.error(e);process.exitCode=1});

