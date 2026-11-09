export async function wallControls(target, slug, { api, send, notice }) {
  const current = await api(`/events/${slug}/wall`);
  target.replaceChildren();
  const title = document.createElement('h3'); title.textContent = 'Share a mosaic wall';
  const hint = document.createElement('p'); hint.className='muted';hint.textContent='Anyone with this link can view approved photos after the reveal time. The event must be published with visibility set to everyone.';
  target.append(title,hint);
  if(!current.available){const p=document.createElement('p');p.textContent='Mosaic walls are disabled by the administrator.';target.append(p);}
  if(current.url&&current.enabled){
    const field=document.createElement('input');field.readOnly=true;field.value=current.url;field.setAttribute('aria-label','Mosaic wall link');target.append(field);
    const open=document.createElement('a');open.href=current.url;open.target='_blank';open.rel='noopener';open.className='button small secondary';open.textContent='Open wall';target.append(open);
    const copy=document.createElement('button');copy.type='button';copy.className='small';copy.textContent='Copy wall link';copy.onclick=async()=>{try{await navigator.clipboard.writeText(current.url);notice('Mosaic wall link copied');}catch{field.select();notice('Select and copy the wall link above.');}};target.append(copy);
  }
  function button(label, patch) {
    const b=document.createElement('button');b.type='button';b.className='small secondary';b.textContent=label;target.append(b);
    b.onclick=async()=>{b.disabled=true;try{await send(`/events/${slug}/wall`,patch,'PATCH');await wallControls(target,slug,{api,send,notice});notice(patch.rotate?'New link created. The old wall link no longer works.':patch.enabled?'Mosaic wall link enabled.':'Mosaic wall disabled.');}catch(err){notice(err.message,true);}finally{b.disabled=false;}};
    return b;
  }
  button(current.enabled?'Disable wall':'Enable wall link',{enabled:!current.enabled}).disabled=!current.enabled&&!current.available;
  if(current.url)button('Replace link (invalidates old link)',{rotate:true});
}
