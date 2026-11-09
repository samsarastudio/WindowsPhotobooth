export async function photoboothControls(app,events,{api,send,notice,escape}) {
  const state=await api('/admin/photobooth');
  if(!state.configured)return;
  for(const card of app.querySelectorAll('[data-wall]')) {
    const e=events.find(e=>e.slug===card.dataset.wall),linked=state.links.find(l=>l.event===e.id);
    if(!state.available&&!linked)continue;
    const section=document.createElement('details');section.className='advanced-settings';
    section.innerHTML='<summary>Photobooth gallery</summary><div></div>';card.after(section);
    const content=section.querySelector('div');
    const render=link=>{
      content.innerHTML=`<p class="muted">Connect an existing photobooth album to this event’s mosaic wall and album designer. New photos sync every minute, up to 50 at a time, using this event’s approval settings.</p>
        ${link?`<p>${link.enabled?'Connected':'Paused'}: <strong>${escape(state.sessions.find(s=>s.slug===link.slug)?.title||link.slug)}</strong></p><p class="muted">${link.last_sync?'Last synced '+escape(new Date(link.last_sync).toLocaleString()):'Not synced yet'}${link.error?' · '+escape(link.error):''}</p>`:''}
        ${state.available?`<label>Photobooth album<select aria-label="Photobooth album"><option value="">Choose an album</option>${state.sessions.map(s=>`<option value="${escape(s.slug)}" ${s.slug===link?.slug?'selected':''}>${escape(s.title)}</option>`).join('')}</select></label><div class="actions"><button type="button" data-connect>Connect & sync</button>${link?.enabled?'<button type="button" class="secondary" data-sync>Sync now</button>':''}</div>`:'<p>Photobooth connection is unavailable or disabled. Existing imported photos are retained.</p>'}
        ${link?.enabled?'<button type="button" class="secondary" data-stop>Pause connection</button>':''}
        <p class="muted">Copies are saved as high-quality JPGs. Review or remove them in Manage event. Removing a copy here prevents it from returning on sync. Source gallery changes and deletions do not alter imported copies. Pausing keeps existing copies.</p>`;
      const run=async task=>{const buttons=[...content.querySelectorAll('button')];buttons.forEach(b=>b.disabled=true);try{await task();}catch(err){notice(err.message,true);}finally{buttons.forEach(b=>b.disabled=false);}};
      content.querySelector('[data-connect]')?.addEventListener('click',()=>run(async()=>{const slug=content.querySelector('select').value;if(!slug)throw Error('Choose a photobooth album');const result=await send(`/admin/events/${e.slug}/photobooth`,{slug},'PUT');render(result.link);notice(`${result.imported} photobooth photos imported. Open Manage event to review.`);}));
      content.querySelector('[data-sync]')?.addEventListener('click',()=>run(async()=>{const result=await send(`/admin/events/${e.slug}/photobooth/sync`);render(result.link);notice(`${result.imported} new photos imported`);}));
      content.querySelector('[data-stop]')?.addEventListener('click',()=>run(async()=>{await send(`/admin/events/${e.slug}/photobooth`,{},'DELETE');render({...link,enabled:0});notice('Photobooth connection paused');}));
    };
    render(linked);
  }
}
