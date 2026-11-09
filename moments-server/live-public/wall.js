import {createMosaic} from './mosaic-renderer.js';
const token = location.pathname.split('/')[2];
const stage = document.querySelector('#stage'), state = document.querySelector('#state');
let controlsTimer,timer,refreshing=false;
const mosaic=createMosaic(stage);
async function refresh() {
  if(refreshing)return;refreshing=true;
  try {
    const response=await fetch(`/api/wall/${encodeURIComponent(token)}`,{cache:'no-store'});
    if(!response.ok)throw new Error(response.status===403||response.status===404?'This wall is no longer available. Ask the host for a current link.':'Connection lost. Reconnecting…');
    const data=await response.json();document.title=`${data.title} · Moments Live`;
    document.querySelector('#overlay').textContent=data.config.overlay;
    mosaic.update(data.photos,data.config);state.hidden=data.photos.length>0;
    state.textContent=data.revealed?'Your moments will appear here as approved photos arrive.':`The wall opens ${new Date(data.reveal).toLocaleString()}.`;
  } catch(err) {
    mosaic.clear();state.hidden=false;state.textContent=err.message;document.querySelector('#overlay').textContent='';
  } finally {refreshing=false;}
}
document.querySelector('#fullscreen').onclick=async()=>{try{if(document.fullscreenElement)await document.exitFullscreen();else await document.documentElement.requestFullscreen();}catch{document.querySelector('#fullscreen').textContent='Use browser fullscreen';}};
document.addEventListener('fullscreenchange',()=>{document.querySelector('#fullscreen').textContent=document.fullscreenElement?'Exit fullscreen':'Fullscreen';});

document.addEventListener('visibilitychange',()=>{if(!document.hidden)void refresh();});
await refresh();timer=setInterval(()=>{if(!document.hidden)void refresh();},5000);
function showControls(){document.body.classList.add('controls-visible');clearTimeout(controlsTimer);controlsTimer=setTimeout(()=>document.body.classList.remove('controls-visible'),2500);}
document.addEventListener('pointermove',showControls);document.addEventListener('pointerdown',showControls);document.addEventListener('keydown',showControls);
window.addEventListener('pagehide',()=>{clearInterval(timer);mosaic.destroy();clearTimeout(controlsTimer);});
window.addEventListener('pageshow',event=>{if(event.persisted)location.reload();});
