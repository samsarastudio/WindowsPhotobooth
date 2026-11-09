import {photoLooks,svgLookMatrix} from './photo-looks.js';
export function mountPhotoLooks({app,enabled,selection,onChange}){
  if(!enabled)return;
  app.querySelector('.camera-shell').classList.add('has-photo-looks');
  const ns='http://www.w3.org/2000/svg',svg=document.createElementNS(ns,'svg');svg.classList.add('look-definitions');svg.setAttribute('aria-hidden','true');svg.setAttribute('width','0');svg.setAttribute('height','0');
  const defs=document.createElementNS(ns,'defs');svg.append(defs);
  const matrix=(id,look,strength)=>{const f=document.createElementNS(ns,'filter');f.id=id;f.setAttribute('color-interpolation-filters','sRGB');const m=document.createElementNS(ns,'feColorMatrix');m.setAttribute('type','matrix');m.setAttribute('values',svgLookMatrix(look,strength));f.append(m);defs.append(f);return m;};
  const current=matrix('current-photo-look',selection.id,selection.strength);
  photoLooks.forEach(l=>matrix('look-sample-'+l.id,l.id,70));app.append(svg);
  const trigger=document.createElement('button');trigger.id='open-photo-looks';trigger.type='button';trigger.className='photo-looks-trigger';app.querySelector('.camera-bottom').prepend(trigger);
  const dialog=document.createElement('dialog');dialog.id='photo-looks-dialog';dialog.className='camera-sheet photo-looks-sheet';dialog.setAttribute('aria-labelledby','photo-looks-title');
  dialog.innerHTML=`<div class="sheet-toolbar"><h2 id="photo-looks-title">Photo looks</h2><button type="button" data-done>Done</button></div><p class="muted">Choose a look for your next photos. Camera preview updates live.</p><div class="look-tiles">${photoLooks.map(l=>`<button type="button" data-look="${l.id}" aria-pressed="false"><img src="/marketing/live-every-perspective.jpg" alt="${l.name} example" class="sample-${l.id}"><strong>${l.name}</strong></button>`).join('')}</div><p id="look-description"></p><label>Strength <output id="look-value"></output><input id="look-strength" type="range" min="0" max="100" step="5" aria-label="Look strength"></label><div class="look-preview-box"><img src="/marketing/live-every-perspective.jpg" alt="Example preview of the selected photo look"></div><p class="muted">Example image. Your chosen look is applied once when sharing new camera photos and phone uploads. Existing gallery and photobooth photos are unchanged.</p><button type="button" class="secondary" data-natural>Reset to Natural</button>`;
  app.append(dialog);
  const update=()=>{const look=photoLooks.find(l=>l.id===selection.id)||photoLooks[0];trigger.textContent=`Looks · ${look.name}`;trigger.setAttribute('aria-label',`Photo looks: ${look.name}`);current.setAttribute('values',svgLookMatrix(selection.id,selection.strength));dialog.querySelectorAll('[data-look]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.look===selection.id)));dialog.querySelector('#look-description').textContent=look.description;dialog.querySelector('#look-strength').value=selection.strength;dialog.querySelector('#look-strength').disabled=selection.id==='natural';dialog.querySelector('#look-value').textContent=selection.id==='natural'?'Original colour':selection.strength+'%';onChange({...selection});};
  trigger.onclick=()=>{app.querySelectorAll('.camera-sheet[open]').forEach(d=>d.close());dialog.showModal();};
  dialog.querySelector('[data-done]').onclick=()=>dialog.close();
  dialog.querySelectorAll('[data-look]').forEach(b=>b.onclick=()=>{selection.id=b.dataset.look;update();});
  dialog.querySelector('#look-strength').oninput=event=>{selection.strength=Number(event.target.value);update();};
  dialog.querySelector('[data-natural]').onclick=()=>{selection.id='natural';selection.strength=70;update();};
  update();
}
