const fs=require('node:fs');
const path=require('node:path');
const prep=require('../electron/ai-edit-preparation.cjs');
const {callOpenAiImageEdit,httpsPostMultipart}=require('../electron/openai-image-edit.cjs');
const FormData=require('form-data');
const root=path.resolve(__dirname,'../..');
const output=path.join(root,'builds/ai-flow-qa');
const config=JSON.parse(fs.readFileSync(path.join(root,'builds/midnight-manor-preview/config/photobooth-config.json'),'utf8'));
async function run(kind) {
 const start=Date.now();
 const modelDir=path.join(root,'photobooth-app/config/ai-models');
 const head=kind==='head';
 const p=head?await prep.prepareHead(path.join(output,'single.png'),path.join(root,'photobooth-app/config/compositions/vampire/composition.png'),modelDir)
 :await prep.prepareScene(path.join(output,kind+'.png'),path.join(root,'photobooth-app/public/halloween/scene.png'),modelDir);
 if(!head){fs.writeFileSync(path.join(output,kind+'-strict-result.png'),p.image);console.log(kind,p.model,Date.now()-start+'ms');return;}
 const prompt=prep.HEAD_PROMPT;
 fs.writeFileSync(path.join(output,kind+'-api-mask.png'),p.mask);
 const r=await callOpenAiImageEdit(config.openAiApiKey,p.image,prompt,httpsPostMultipart,FormData,[{buf:p.reference,filename:head?'guest-reference.png':'selected-background.png'}],head?'1024x1536':'1536x1024',p.mask,{preferMax:true,allowDalle2Fallback:false});
 if(!r.ok) throw new Error(r.error);
 fs.writeFileSync(path.join(output,kind+'-api-raw.png'),r.outBuf);
 const result=head?await prep.preservePortraitPlate(p,r.outBuf):await prep.preserveSceneSubjects(p,r.outBuf);
 fs.writeFileSync(path.join(output,kind+'-api-result.png'),result);
 fs.writeFileSync(path.join(output,kind+'-api-report.json'),JSON.stringify({model:r.model,elapsedMs:Date.now()-start,prompt},null,2));
 console.log(kind, r.model, Date.now()-start+'ms');
}
run(process.argv[2]||'group').catch(e=>{console.error(e.message);process.exitCode=1});
