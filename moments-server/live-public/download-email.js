let pending;
export async function ensureDownloadEmail(){
 const state=await fetch('/api/download-email',{cache:'no-store'}).then(r=>{if(!r.ok)throw new Error('Unable to check download email. Please retry.');return r.json();});
 if(state.email)return state.email;if(pending)return pending;
 pending=new Promise((resolve,reject)=>{
  if(!document.querySelector('link[data-download-email]')){const sheet=document.createElement('link');sheet.rel='stylesheet';sheet.href='/download-email.css';sheet.dataset.downloadEmail='1';document.head.append(sheet);}
  const dialog=document.createElement('dialog');dialog.className='download-email-dialog';dialog.innerHTML='<form><h2>Save your memories</h2><p>Enter your email for the event host’s download records. This does not subscribe you to marketing.</p><label>Email address<input type="email" name="email" autocomplete="email" required maxlength="254" placeholder="you@example.com"></label><p class="muted">We’ll remember this on this browser for future downloads.</p><p role="alert"></p><div class="actions"><button type="submit">Continue to download</button><button type="button" class="secondary">Cancel</button></div></form>';
  const close=()=>{dialog.close();dialog.remove();};dialog.addEventListener('cancel',e=>{e.preventDefault();close();reject(new Error('Download cancelled'));});dialog.querySelector('button[type=button]').onclick=()=>{close();reject(new Error('Download cancelled'));};
  dialog.querySelector('form').onsubmit=async e=>{e.preventDefault();const button=dialog.querySelector('button[type=submit]');button.disabled=true;try{const response=await fetch('/api/download-email',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:dialog.querySelector('input').value})});const result=await response.json();if(!response.ok)throw new Error(result.error||'Unable to save email');close();resolve(result.email);}catch(err){dialog.querySelector('[role=alert]').textContent=err.message;button.disabled=false;}};
  document.body.append(dialog);dialog.showModal();
 }).finally(()=>pending=null);return pending;
}
export async function emailDownload(url){await ensureDownloadEmail();const link=document.createElement('a');link.href=url;link.download='';document.body.append(link);link.click();link.remove();}
