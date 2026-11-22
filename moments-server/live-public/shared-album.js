import {renderDesignPage} from './print-page.js';
import {downloadSavedPDF} from './print-download.js';
export async function sharedAlbum({app,slug,api}){
 const sheet=document.createElement('link');sheet.rel='stylesheet';sheet.href='/print-studio.css';document.head.append(sheet);
 app.innerHTML=`<section class="shared-album"><div class="toolbar"><div><p class="eyebrow">OUR ALBUM</p><h1 id="album-title"></h1></div><a class="button secondary" href="/gallery/${encodeURIComponent(slug)}">Photo gallery</a></div><div class="actions"><button id="album-prev" aria-label="Previous page">Previous</button><span id="album-position"></span><button id="album-next" aria-label="Next page">Next</button><button id="album-download">Download PDF</button></div><p id="album-status" role="status">Latest saved album</p><div id="design-preview"></div></section>`;
 let pages=[],index=0,revision='',timer,available=true;
 const status=app.querySelector('#album-status');
 function render(){renderDesignPage(app.querySelector('#design-preview'),pages[index],{slug});app.querySelector('#album-position').textContent=`${index+1} / ${pages.length}`;app.querySelector('#album-prev').disabled=index===0;app.querySelector('#album-next').disabled=index===pages.length-1;}
 async function refresh(){try{const result=await api(`/gallery/${slug}/album`);if(result.revision!==revision){revision=result.revision;pages=result.pages;index=Math.min(index,pages.length-1);app.querySelector('#album-title').textContent=result.title;render();}}catch(err){available=false;clearInterval(timer);app.querySelector('#design-preview').replaceChildren();app.querySelectorAll('button').forEach(b=>b.disabled=true);status.textContent=err.message;}}
 app.querySelector('#album-prev').onclick=()=>{index--;render();};app.querySelector('#album-next').onclick=()=>{index++;render();};
 const button=app.querySelector('#album-download');button.onclick=async()=>{button.disabled=true;try{await downloadSavedPDF(`/api/gallery/${slug}/album`,message=>status.textContent=message);}catch(err){status.textContent=err.message;}finally{button.disabled=!available;}};
 const config=await api('/config');button.hidden=!config.features.downloads;
 await refresh();if(available)timer=setInterval(()=>{if(!document.hidden)void refresh();},30000);window.addEventListener('pagehide',()=>clearInterval(timer),{once:true});
}
