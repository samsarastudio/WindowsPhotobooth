export async function galleryWallControls(app,events,{api,send,notice,escape}){
 for(const card of app.querySelectorAll('[data-wall]')){
  const e=events.find(e=>e.slug===card.dataset.wall);if(!e)continue;
  const section=document.createElement('details');section.className='advanced-settings';section.innerHTML='<summary>Send to Moments wall</summary><div></div>';card.after(section);
  const content=section.querySelector('div'),endpoint=`/admin/events/${e.slug}/gallery-wall`;
  async function render(){const state=await api(endpoint);if(!section.isConnected)return;
   content.innerHTML=`<p>Show approved Live camera photos alongside photobooth pictures on your Moments Gallery mosaic. Photobooth imports are excluded to avoid duplicates.</p><form><label>Moments wall URL<input name="url" type="url" required placeholder="https://moments.inmomentservices.com/wall" value="${escape(state.url||'')}"></label><label>Gallery upload token<input name="token" type="password" autocomplete="new-password" ${state.connected?'':'required'} placeholder="${state.connected?'Leave blank to keep saved token':'From Moments Gallery admin settings'}"></label><p class="muted">Only published, revealed events visible to everyone can share photos. Hiding or deleting a photo removes it from the wall on the next sync. If Live goes offline, its photos leave the wall within one minute.</p><button>Connect wall</button></form><p role="status">${state.connected?'Connected':'Not connected'}${state.lastSync?' · Last synced '+escape(new Date(state.lastSync).toLocaleString()):''}${state.error?' · '+escape(state.error):''}</p>${state.connected?'<button class="secondary" data-disconnect>Disconnect & remove Live photos</button>':''}`;
   const run=async task=>{content.querySelectorAll('button').forEach(b=>b.disabled=true);try{await task();await render();}catch(err){notice(err.message,true);content.querySelectorAll('button').forEach(b=>b.disabled=false);}};
   content.querySelector('form').onsubmit=ev=>{ev.preventDefault();const f=ev.currentTarget;void run(async()=>{await send(endpoint,{url:f.elements.url.value,token:f.elements.token.value},'PUT');notice('Moments wall connection saved');});};
   content.querySelector('[data-disconnect]')?.addEventListener('click',()=>run(async()=>{await send(endpoint,{},'DELETE');notice('Live photos removed from the Moments wall');}));
  }
  section.addEventListener('toggle',()=>{if(section.open)render().catch(err=>notice(err.message,true));});
 }
}
