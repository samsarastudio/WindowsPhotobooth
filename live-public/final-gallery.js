export async function finalGallery({app,slug,api,escape}) {
  document.body.classList.add('final-gallery-page');
  const sheet=document.createElement('link');sheet.rel='stylesheet';sheet.href='/final-gallery.css';document.head.append(sheet);
  const data=await api(`/gallery/${slug}`);
  app.innerHTML=`<section class="released-header"><p class="eyebrow">THE MOMENTS WE SHARED</p><h1>${escape(data.title)}</h1><p>${escape(data.description||'A collection to keep, from everyone who was there.')}</p><span>${data.photos.length} photos</span><p><a class="button secondary" href="/album/${encodeURIComponent(slug)}">View album & PDF</a></p></section><div class="released-grid"></div><dialog class="released-viewer"><div class="released-actions"><button type="button" id="release-prev" aria-label="Previous photo">←</button><span id="release-position"></span><button type="button" id="release-next" aria-label="Next photo">→</button><a id="release-save" class="button" ${data.downloads?'':'hidden'}>Save photo</a><button type="button" id="release-close">Close</button></div><img alt="Event photo"></dialog>`;
  const grid=app.querySelector('.released-grid'),dialog=app.querySelector('dialog');let selected=0;
  const show=i=>{selected=(i+data.photos.length)%data.photos.length;dialog.querySelector('img').src=data.photos[selected].url;app.querySelector('#release-save').href=data.photos[selected].url+'?download=1';app.querySelector('#release-position').textContent=`${selected+1} / ${data.photos.length}`;if(!dialog.open)dialog.showModal();};
  data.photos.forEach((p,i)=>{const b=document.createElement('button'),img=document.createElement('img');b.type='button';b.setAttribute('aria-label',`Open photo ${i+1}`);img.src=p.url+'?thumb=1';img.alt=`Event photo ${i+1}`;img.loading='lazy';b.append(img);b.onclick=()=>show(i);grid.append(b);});
  if(!data.photos.length)grid.textContent='Photos will appear here when approved.';
  app.querySelector('#release-prev').onclick=()=>show(selected-1);app.querySelector('#release-next').onclick=()=>show(selected+1);app.querySelector('#release-close').onclick=()=>dialog.close();
  dialog.addEventListener('keydown',e=>{if(e.key==='ArrowLeft')show(selected-1);if(e.key==='ArrowRight')show(selected+1);});
}

export async function finalGalleryControls({slug,api,send,notice}) {
  const panel=document.createElement('section');panel.className='card';
  panel.innerHTML='<h3>Release final gallery</h3><p>A view-only link for everyone. No joining or camera required. Only approved, visible photos are shared.</p><p class="final-release-status"></p><div class="actions"><button type="button" class="final-release-toggle"></button><button type="button" class="secondary final-release-copy">Copy gallery link</button><button type="button" class="secondary final-album-copy">Copy album link</button><a class="button secondary final-release-open" target="_blank" rel="noopener">Open gallery ↗</a></div>';
  document.querySelector('#sort').closest('.toolbar').before(panel);
  let state=await api(`/events/${slug}/final-gallery`);
  function draw(){panel.querySelector('.final-release-status').textContent=state.available?'Released — ready to share':state.released?'Release paused by event privacy or reveal settings':'Not released';panel.querySelector('.final-release-toggle').textContent=state.released?'Unrelease gallery':'Release gallery';panel.querySelector('.final-release-copy').disabled=!state.available;panel.querySelector('.final-album-copy').disabled=!state.available;const link=panel.querySelector('a');link.href=state.url;link.hidden=!state.available;}
  draw();panel.querySelector('.final-release-toggle').onclick=async()=>{const b=panel.querySelector('.final-release-toggle');b.disabled=true;try{state=await send(`/events/${slug}/final-gallery`,{released:!state.released},'PATCH');draw();notice(state.released?'Final gallery released':'Gallery link disabled');}catch(e){notice(e.message,true);}finally{b.disabled=false;}};
  panel.querySelector('.final-album-copy').onclick=async()=>{const url=state.url.replace('/gallery/','/album/');try{await navigator.clipboard.writeText(url);notice('Album link copied');}catch{notice(url);}};
  panel.querySelector('.final-release-copy').onclick=async()=>{try{await navigator.clipboard.writeText(state.url);notice('Gallery link copied');}catch{notice(state.url);}};
}
