const fs=require('fs'),path=require('path');
async function retrySubmission(action, sleep = ms => new Promise(resolve => setTimeout(resolve, ms))) {
 for (let attempt = 0; ; attempt++) {
  try { return await action(); }
  catch (error) {
   if (attempt >= 3 || (error.status && error.status < 500 && error.status !== 429)) throw error;
   await sleep(1000 * 2 ** attempt);
  }
 }
}
async function generateServerPortrait({base,token,originalPhotoId,prepared,prompt,framePath,outputPath}) {
 const request=async(url,options={})=>{const r=await fetch(base+url,{...options,headers:{Authorization:'Bearer '+token,...options.headers},signal:AbortSignal.timeout(60000)});let j;try{j=await r.json()}catch{throw Error('Moments portrait service is unavailable. Deploy the matching server update.')}if(!r.ok||!j.ok){const e=Error(j.error||'Moments portrait request failed');e.status=r.status;throw e;}return j;};
 const capability=await retrySubmission(()=>request('/api/portrait-jobs/capabilities'));if(!capability.configured)throw Error('Configure the OpenAI key in Moments admin before using portraits.');
 const form=new FormData();form.append('originalPhotoId',originalPhotoId);form.append('prompt',prompt);
 for(const [name,data]of Object.entries({image:prepared.image,reference:prepared.reference,mask:prepared.mask,...(framePath?{frame:fs.readFileSync(framePath)}:{})}))form.append(name,new Blob([data],{type:'image/png'}),name+'.png');
 // Identical inputs have a server-side request key: a lost response must not create a second paid job.
 let {job}=await retrySubmission(()=>request('/api/portrait-jobs',{method:'POST',body:form}));
 const deadline=Date.now()+30*60*1000;
 while(job.status==='queued'||job.status==='running'){
  if(Date.now()>deadline)throw Error('Portrait is still running on Moments. Check the tablet for the result.');
  await new Promise(r=>setTimeout(r,2000));
  try{({job}=await request('/api/portrait-jobs/'+encodeURIComponent(job.id)))}catch(e){if((e.status && e.status<500)||Date.now()+60000>=deadline)throw e;}
 }
 if(job.status!=='ready'||!job.photo?.url)throw Error(job.error||'Portrait generation failed on Moments.');
 const url=new URL(job.photo.url,base);if(url.origin!==new URL(base).origin)throw Error('Unexpected portrait download host');
 const response=await fetch(url,{signal:AbortSignal.timeout(60000)});if(!response.ok)throw Error('Portrait finished on Moments but could not download to kiosk. Check the tablet.');
 const buffer=Buffer.from(await response.arrayBuffer());await require('sharp')(buffer).metadata();fs.writeFileSync(outputPath,buffer);
 return {ok:true,path:outputPath,model:job.model,pipeline:'head-swap',serverGenerated:true};
}
module.exports={generateServerPortrait,retrySubmission};
