const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const ts=require('typescript');
const root=path.resolve(__dirname,'../..'),dir=path.join(root,'builds/ai-flow-qa');
const source=fs.readFileSync(path.join(root,'photobooth-app/electron/main.cjs'),'utf8');
const ast=ts.createSourceFile('main.cjs',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.JS);
const cfg=JSON.parse(fs.readFileSync(path.join(root,'builds/midnight-manor-preview/config/photobooth-config.json'))).gallery;
const context={fs,path,fetch,URL,require,getCaptureDir:()=>dir};vm.createContext(context);
for(const name of ['isPathUnder','galleryBaseUrl','normalizeGalleryPublicUrl','galleryFetchJson','uploadPhotoOnce']){
 const fn=ast.statements.find(n=>ts.isFunctionDeclaration(n)&&n.name?.text===name);vm.runInContext(fn.getText(ast),context);
}
(async()=>{
 const results=[];
 for(const name of ['single','group']){
  const original=path.join(dir,`strict-qa-${name}.png`),result=path.join(dir,`strict-qa-${name}_ai.png`);
  fs.copyFileSync(path.join(dir,`${name}.png`),original);fs.copyFileSync(path.join(dir,`${name}-strict-result.png`),result);
  for(const [filePath,variant,processStatus] of [[original,'original','processing'],[result,'ai','ready'],[original,'original','ready']]){
   const r=await context.uploadPhotoOnce({apiBaseUrl:cfg.apiBaseUrl,uploadToken:cfg.uploadToken,eventPrefix:'ai-quality-qa',filePath,variant,processStatus},AbortSignal.timeout(30000));
   if(!r.ok)throw Error(r.error);results.push({...r,processStatus});
  }
 }
 const feed=await fetch(cfg.apiBaseUrl+'/api/tablet/today?prefix=ai-quality-qa').then(r=>r.json());
 const photos=(feed.photos||[]).map(p=>({id:p.id,variant:p.variant,processStatus:p.processStatus,hasAi:p.hasAi,url:p.url}));
 if(!photos.some(p=>p.variant==='ai'&&p.processStatus==='ready'))throw Error('Uploaded but no ready AI photo in tablet feed');
 fs.writeFileSync(path.join(dir,'backend-validation.json'),JSON.stringify({results,photos,tabletUrl:cfg.apiBaseUrl+'/tablet/ai-quality-qa'},null,2));
 console.log(JSON.stringify({uploadCalls:results.length,photos,tabletUrl:cfg.apiBaseUrl+'/tablet/ai-quality-qa'},null,2));
})().catch(e=>{console.error(e.message);process.exitCode=1});
