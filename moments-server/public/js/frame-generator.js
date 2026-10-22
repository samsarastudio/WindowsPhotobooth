/** Offline PNG renderer: no remote generation, credentials or SVG output. */
export const FRAME_FONTS = ['Screampark Distressed','Halloween Horror','Georgia','Arial','Verdana','Trebuchet MS','Times New Roman','cursive'];
export async function renderFrame(canvas, image, options) {
  const w=image.naturalWidth||image.width,h=image.naturalHeight||image.height;
  if(!w||!h||w*h>24000000)throw new Error('Choose a frame up to 24 megapixels.');
  canvas.width=w;canvas.height=h;
  const ctx=canvas.getContext('2d');ctx.clearRect(0,0,w,h);ctx.drawImage(image,0,0);
  const n=(key,fallback,min,max)=>Math.min(max,Math.max(min,Number.isFinite(Number(options[key]))?Number(options[key]):fallback));
  const cx=w*n('centerX',50,0,100)/100,cy=h*n('centerY',90,0,100)/100;
  const pw=w*n('plateWidth',w>h?38:52,5,100)/100,ph=h*n('plateHeight',9,2,40)/100;
  const stretch=n('plateStretch',1.2,1,1.8);
  // Stretch only the selected existing ornamental plaque; no rectangular plate is invented.
  if(stretch>1){ctx.drawImage(image,cx-pw/2,cy-ph/2,pw,ph,cx-pw/2,cy-ph*stretch/2,pw,ph*stretch);}
  const font=FRAME_FONTS.includes(options.font)?options.font:FRAME_FONTS[0];
  await document.fonts.load(`bold 40px "${font}"`);
  const ink=/^#[\da-f]{6}$/i.test(options.color)?options.color:'#f5c26e';
  const draw=(text,x,y,max,size)=>{text=String(text||'').slice(0,300);ctx.font=`bold ${size}px "${font}"`;while(size>8&&ctx.measureText(text).width>max){size--;ctx.font=`bold ${size}px "${font}"`;}
    ctx.textAlign='center';ctx.textBaseline='middle';ctx.lineJoin='round';ctx.strokeStyle='#100a08';ctx.lineWidth=Math.max(2,size*.07);ctx.strokeText(text,x,y);ctx.fillStyle=ink;ctx.fillText(text,x,y);};
  draw(options.title,cx,cy-ph*.22,pw*.85,h*n('titleSize',4,1,12)/100);
  draw(options.subtitle,cx,cy+ph*.25,pw*.85,h*n('subtitleSize',2.4,1,8)/100);
  draw(options.tagline,w/2,h*n('taglineY',98,0,100)/100,w*.92,h*n('taglineSize',2.5,1,8)/100);
  return canvas;
}
export function pngBlob(canvas){return new Promise((resolve,reject)=>canvas.toBlob(b=>b?resolve(b):reject(new Error('PNG export failed.')),'image/png'));}
export function initFrameGenerator({api,setStatus,refreshFrames}){
 const host=document.getElementById('frameGenerator');if(!host)return;
 const controls={title:'Halloween 2026',subtitle:'Screampark',tagline:"Ontario's most terrifying haunted attraction is back with even more horror and gore."};
 host.innerHTML=`<h3>PNG frame generator</h3><p class="meta">Upload a text-free frame. Add editable title, subtitle and a single-line tagline, then download or save a transparent PNG at its original dimensions. No generation credits required.</p><p class="meta">Blank Halloween artwork: <a href="/assets/frame-templates/halloween-horror-textless.png" download>Landscape PNG</a> · <a href="/assets/frame-templates/halloween-horror-portrait-textless.png" download>Portrait PNG</a></p><label>Frame artwork<input id="fgFile" type="file" accept="image/png,image/jpeg,image/webp"></label><div class="fg-layout"><div class="fg-controls"></div><canvas id="fgCanvas" aria-label="Generated PNG frame preview"></canvas></div><div class="row wrap"><button class="btn" id="fgDownload" disabled>Download PNG</button><button class="btn primary" id="fgSave" disabled>Save PNG to frame library</button></div><p id="fgMessage" class="meta" role="status">Choose frame artwork to begin.</p>`;
 const box=host.querySelector('.fg-controls'),fields={};
 const add=(name,label,type,value,min,max,step)=>{const lab=document.createElement('label');lab.textContent=label;const input=document.createElement('input');input.type=type;input.value=value;input.id='fg-'+name;if(min!=null){input.min=min;input.max=max;input.step=step||1;}lab.append(input);box.append(lab);fields[name]=input;input.addEventListener('input',()=>void update());};
 for(const [name,value] of Object.entries(controls))add(name,name==='subtitle'?'Subtitle':name==='tagline'?'Bottom tagline (one line)':'Title','text',value);
 const lab=document.createElement('label');lab.textContent='Font';const select=document.createElement('select');for(const name of FRAME_FONTS)select.add(new Option(name,name));select.id='fg-font';lab.append(select);box.append(lab);fields.font=select;select.addEventListener('change',()=>void update());
 add('color','Text colour','color','#f5c26e');
 for(const [key,label,value,min,max,step] of [['centerX','Nameplate centre X (%)',50,0,100],['centerY','Nameplate centre Y (%)',90,0,100],['plateWidth','Nameplate width (%)',38,5,100],['plateHeight','Original nameplate height (%)',9,2,40],['plateStretch','Nameplate thickness',1.2,1,1.8,.05],['titleSize','Title size (% of frame height)',4,1,12,.1],['subtitleSize','Subtitle size (%)',2.4,1,8,.1],['taglineSize','Tagline size (%)',2.5,1,8,.1],['taglineY','Tagline position Y (%)',98,0,100,.1]])add(key,label,'number',value,min,max,step);
 const canvas=host.querySelector('canvas'),message=host.querySelector('#fgMessage'),download=host.querySelector('#fgDownload'),save=host.querySelector('#fgSave');let source=null,filename='frame',revision=0;
 async function update(){if(!source)return;const rev=++revision;download.disabled=save.disabled=true;try{const staging=document.createElement('canvas');await renderFrame(staging,source,Object.fromEntries(Object.entries(fields).map(([k,v])=>[k,v.value])));if(rev!==revision)return;canvas.width=staging.width;canvas.height=staging.height;canvas.getContext('2d').drawImage(staging,0,0);download.disabled=save.disabled=false;message.textContent=`${canvas.width} × ${canvas.height} · PNG · transparency preserved`;}catch(e){message.textContent=e.message;}}
 host.querySelector('#fgFile').addEventListener('change',async event=>{const file=event.target.files[0];if(!file)return;download.disabled=save.disabled=true;source=null;const rev=++revision;const url=URL.createObjectURL(file);try{const img=new Image();img.src=url;await img.decode();if(rev!==revision)return;if(img.naturalWidth*img.naturalHeight>24000000)throw Error('Choose a frame up to 24 megapixels.');source=img;filename=file.name.replace(/\.[^.]+$/,'').replace(/[^a-z0-9_-]/gi,'-');fields.plateWidth.value=img.naturalWidth>img.naturalHeight?38:52;await update();}catch(e){message.textContent='Could not open frame: '+e.message;}finally{URL.revokeObjectURL(url);}});
 download.addEventListener('click',async()=>{try{const url=URL.createObjectURL(await pngBlob(canvas)),a=document.createElement('a');a.href=url;a.download=filename+'-personalized.png';a.click();setTimeout(()=>URL.revokeObjectURL(url),2000);}catch(e){message.textContent=e.message;}});
 save.addEventListener('click',async()=>{save.disabled=true;try{const fd=new FormData();fd.append('frame',await pngBlob(canvas),filename+'-personalized-'+Date.now()+'.png');await api('/api/admin/frames',{method:'POST',body:fd});setStatus('Generated PNG saved. Sync frames on the booth to use it.');await refreshFrames();}catch(e){message.textContent='Save failed: '+e.message;}finally{save.disabled=false;}});
}
