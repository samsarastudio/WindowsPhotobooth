const token = location.pathname.split('/')[2];
const stage = document.querySelector('#stage'), state = document.querySelector('#state');
let cfg={columns:16}, cfgSignature='', revealStart=Date.now(), controlsTimer;
let photos = [], cursor = 0, signature = '', count = 0, timer, refreshing = false;
function layout() {
  const cols = Math.max(2, Math.min(cfg.columns, Math.round(cfg.columns*stage.clientWidth/1920)));
  const rows = Math.max(1, Math.round(stage.clientHeight / (stage.clientWidth/cols/1.5)));
  const hero = !cfg.completedView && cols >= 4 && rows >= 3;
  count = cols * rows - (hero ? 3 : 0);
  stage.style.gridTemplateColumns = `repeat(${cols},minmax(0,1fr))`;
  stage.style.gridTemplateRows = `repeat(${rows},minmax(0,1fr))`;
  stage.replaceChildren();
  for (let i=0;i<count;i++) { const tile=document.createElement('div');tile.className='tile empty';tile.style.setProperty('--delay',`${-(i%7)}s`);if(i===0&&hero){tile.style.gridColumn='span 2';tile.style.gridRow='span 2';}stage.append(tile); }
  draw();
}
function draw() {
  [...stage.children].forEach((tile,i) => {
    const photo = photos.length ? photos[(i+cursor)%photos.length] : null;
    if (!photo) { tile.replaceChildren();tile.className='tile empty';delete tile.dataset.id;return; }
    if(tile.dataset.id===photo.id)return;
    const img=new Image();img.alt='Photo shared at this event';img.src=photo.url;img.decoding='async';
    tile.replaceChildren(img);tile.className='tile';tile.dataset.id=photo.id;
  });
}
async function refresh() {
  if(refreshing)return;refreshing=true;
  try {
    const response=await fetch(`/api/wall/${encodeURIComponent(token)}`,{cache:'no-store'});
    if(!response.ok)throw new Error(response.status===403||response.status===404?'This wall is no longer available. Ask the host for a current link.':'Connection lost. Reconnecting…');
    const data=await response.json();document.title=`${data.title} · Moments Live`;
    const settings=JSON.stringify(data.config);if(settings!==cfgSignature){cfgSignature=settings;cfg=data.config;revealStart=Date.now();document.body.classList.toggle('completed',cfg.completedView);document.querySelector('#overlay').textContent=cfg.overlay;document.querySelector('#brand').textContent=cfg.brandText;
      for(const [id,url] of [['backdrop',cfg.backdropUrl],['logo',cfg.logoUrl]]){const img=document.getElementById(id);img.hidden=!url;if(url)img.src=url;else img.removeAttribute('src');}
      document.querySelector('#backdrop').style.opacity=cfg.backdropOpacity;layout();updateReveal();
    }
    const next=JSON.stringify(data.photos);if(next!==signature){signature=next;photos=data.photos;cursor=0;draw();}
    state.hidden=photos.length>0;
    state.textContent=data.revealed?'Your moments will appear here as approved photos arrive.':`The wall opens ${new Date(data.reveal).toLocaleString()}.`;
  } catch(err) {
    photos=[];signature='';draw();state.hidden=false;state.textContent=err.message;
    document.querySelector('#overlay').textContent='';document.querySelector('#backdrop').hidden=true;cfgSignature='';document.querySelector('#partner').hidden=true;document.body.classList.remove('revealing');
  } finally {refreshing=false;}
}
document.querySelector('#fullscreen').onclick=async()=>{try{if(document.fullscreenElement)await document.exitFullscreen();else await document.documentElement.requestFullscreen();}catch{document.querySelector('#fullscreen').textContent='Use browser fullscreen';}};
document.addEventListener('fullscreenchange',()=>{document.querySelector('#fullscreen').textContent=document.fullscreenElement?'Exit fullscreen':'Fullscreen';});
new ResizeObserver(layout).observe(stage);
document.addEventListener('visibilitychange',()=>{if(!document.hidden)void refresh();});
layout();await refresh();timer=setInterval(()=>{if(!document.hidden)void refresh();},5000);
let rotationTick=0;
const rotate=setInterval(()=>{if(!document.hidden&&photos.length>1 && (!cfg.completedView || ++rotationTick%2===0)){cursor=(cursor+Math.max(1,Math.floor(count/3)))%photos.length;draw();}},7000);
function updateReveal(){const visible=photos.length>0&&cfg.brandRevealEnabled&&(cfg.brandText||cfg.logoUrl)&&((Date.now()-revealStart)/1000 % (cfg.brandRevealSeconds+cfg.brandRevealHoldSeconds))>=cfg.brandRevealSeconds;document.querySelector('#partner').hidden=!visible;document.body.classList.toggle('revealing',!!visible);}
const revealTimer=setInterval(updateReveal,500);
function showControls(){document.body.classList.add('controls-visible');clearTimeout(controlsTimer);controlsTimer=setTimeout(()=>document.body.classList.remove('controls-visible'),2500);}
document.addEventListener('pointermove',showControls);document.addEventListener('pointerdown',showControls);document.addEventListener('keydown',showControls);
window.addEventListener('pagehide',()=>{clearInterval(timer);clearInterval(rotate);clearInterval(revealTimer);clearTimeout(controlsTimer);});
window.addEventListener('pageshow',event=>{if(event.persisted)location.reload();});
