export async function downloadSavedPDF(endpoint,status){
 for(let attempt=0;attempt<600;attempt++){
  let response;try{response=await fetch(endpoint+'/export',{cache:'no-store'});}catch{throw new Error('Connection interrupted. Please retry; your saved album is unchanged.');}
  const result=await response.json().catch(()=>({error:'The server could not prepare the PDF. Please retry shortly.'}));
  if(!response.ok||result.state==='error')throw new Error(result.error||'Unable to prepare PDF');
  if(result.state==='ready'){const link=document.createElement('a');link.href=endpoint+'/pdf';link.download='';document.body.append(link);link.click();link.remove();status('PDF ready - download started');return;}
  status(`Preparing PDF - ${result.completed||0} of ${result.total||0} pages`);await new Promise(resolve=>setTimeout(resolve,1500));
 }
 throw new Error('The album is still processing. Try downloading again shortly.');
}
