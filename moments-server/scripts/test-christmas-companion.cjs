'use strict';
const fs=require('node:fs'),path=require('node:path'),{spawn}=require('node:child_process'),assert=require('node:assert/strict');
const {chromium}=require('C:/Users/Unity/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const root=path.resolve(__dirname,'..'),out=path.resolve(root,'../output/christmas/companion');fs.mkdirSync(out,{recursive:true});
const data=fs.mkdtempSync(path.join(out,'data-')),port=32187,url='http://127.0.0.1:'+port;
const child=spawn(process.execPath,['src/index.js'],{cwd:root,windowsHide:true,stdio:'ignore',env:{...process.env,PORT:String(port),HOST:'127.0.0.1',HTTPS:'0',DATA_DIR:data,PUBLIC_BASE_URL:url,ALLOW_LOCAL_PUBLIC_URL:'1'}});
(async()=>{let ready=false;for(let i=0;i<80;i++){try{const r=await fetch(url+'/game-register.html');if(r.ok){ready=true;break;}}catch{}await new Promise(r=>setTimeout(r,250));}assert(ready,'Isolated server must start');
 const browser=await chromium.launch({channel:'chrome',headless:true});try{
  for(const route of ['game-register.html','admin.html','tablet.html','halloween.html','index.html']){
   const page=await browser.newPage({viewport:{width:390,height:844}}),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto(url+'/'+route);await page.waitForTimeout(700);assert.deepEqual(errors,[]);assert(await page.locator('link[href*="christmas.css"]').count());await page.screenshot({path:path.join(out,route+'.png'),fullPage:true});await page.close();
  }console.log('PASS five companion screens on isolated data, real server, mobile width, no browser exceptions.');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1}).finally(()=>child.kill());
