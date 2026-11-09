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
  const form=document.createElement('form');form.className='wall-display-settings';
  const heading=document.createElement('h3');heading.textContent='Wall display';form.append(heading);
  const fields=[['completedView','Completed grid (turn off for live collage)','checkbox'],['title','Wall title (browser tab only)','text'],['overlay','Center overlay text (optional)','text'],['columns','Completed grid density (columns)','number',8,28],['backdropOpacity','Backdrop opacity (0–1)','number',0,1,0.05],['brandRevealEnabled','Enable brand partner reveal','checkbox'],['brandRevealSeconds','Show partner every (seconds)','number',10,600],['brandRevealHoldSeconds','Hold partner on screen (seconds)','number',3,30],['brandText','Partner brand text','text']];
  for(const [name,text,type,min,max,step] of fields){
    const label=document.createElement('label');label.textContent=text;const input=document.createElement('input');input.name=name;input.type=type;
    if(type==='checkbox'){input.checked=current.config[name];label.className='check';}else{input.value=current.config[name];if(type==='text')input.maxLength=120;else{input.min=min;input.max=max;input.step=step||1;input.required=true;}}
    label.append(input);form.append(label);
  }
  const save=document.createElement('button');save.textContent='Save wall display';save.type='submit';form.append(save);
  form.onsubmit=async event=>{event.preventDefault();save.disabled=true;try{const config={};for(const [name,,type] of fields){const input=form.elements[name];config[name]=type==='checkbox'?input.checked:type==='number'?Number(input.value):input.value;}await send(`/events/${slug}/wall`,{config},'PATCH');notice('Wall display saved. Open walls update automatically.');}catch(err){notice(err.message,true);}finally{save.disabled=false;}};
  target.append(form);
  for(const [kind,label,exists] of [['backdrop','Backdrop',current.hasBackdrop],['logo','Partner logo',current.hasLogo]]){
    const group=document.createElement('div');group.className='wall-asset';const caption=document.createElement('label');caption.textContent=label+(exists?' — uploaded':'');
    const input=document.createElement('input');input.type='file';input.accept='image/png,image/jpeg,image/webp';caption.append(input);group.append(caption);
    const upload=document.createElement('button');upload.type='button';upload.className='small secondary';upload.textContent='Upload '+label.toLowerCase();
    upload.onclick=async()=>{if(!input.files[0]){notice('Choose an image first.',true);return;}upload.disabled=true;try{const body=new FormData();body.append('photo',input.files[0]);await api(`/events/${slug}/wall/assets/${kind}`,{method:'POST',body});await wallControls(target,slug,{api,send,notice});notice(label+' uploaded');}catch(err){notice(err.message,true);}finally{upload.disabled=false;}};group.append(upload);
    if(exists){const clear=document.createElement('button');clear.type='button';clear.className='small secondary';clear.textContent='Clear '+label.toLowerCase();clear.onclick=async()=>{try{await send(`/events/${slug}/wall/assets/${kind}`,{},'DELETE');await wallControls(target,slug,{api,send,notice});notice(label+' cleared');}catch(err){notice(err.message,true);}};group.append(clear);}
    target.append(group);
  }
}
