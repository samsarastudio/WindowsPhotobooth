const token = location.pathname.split('/')[2];
const stage = document.querySelector('#stage'), state = document.querySelector('#state');
let photos = [], cursor = 0, signature = '', count = 0, timer, refreshing = false;
function layout() {
  const cols = Math.max(2, Math.min(8, Math.floor(stage.clientWidth / 210)));
  const rows = Math.max(2, Math.min(5, Math.floor(stage.clientHeight / 170)));
  const hero = cols >= 4 && rows >= 3;
  count = cols * rows - (hero ? 3 : 0);
  stage.style.gridTemplateColumns = `repeat(${cols},minmax(0,1fr))`;
  stage.style.gridTemplateRows = `repeat(${rows},minmax(0,1fr))`;
  stage.replaceChildren();
  for (let i=0;i<count;i++) { const tile=document.createElement('div');tile.className='tile empty';if(i===0&&hero){tile.style.gridColumn='span 2';tile.style.gridRow='span 2';}stage.append(tile); }
  draw();
}
function draw() {
  [...stage.children].forEach((tile,i) => {
    const photo = i < photos.length ? photos[(i+cursor)%photos.length] : null;
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
    const data=await response.json();document.querySelector('#title').textContent=data.title;document.title=`${data.title} · Moments Live`;
    document.querySelector('#count').textContent=`${data.total} approved ${data.total===1?'photo':'photos'}`;
    document.querySelector('#connection').textContent='Live · updates automatically';
    const next=JSON.stringify(data.photos);if(next!==signature){signature=next;photos=data.photos;cursor=0;draw();}
    state.hidden=photos.length>0;
    state.textContent=data.revealed?'Your moments will appear here as approved photos arrive.':`The wall opens ${new Date(data.reveal).toLocaleString()}.`;
  } catch(err) {
    photos=[];signature='';draw();state.hidden=false;state.textContent=err.message;
    document.querySelector('#count').textContent='';document.querySelector('#connection').textContent='Waiting to reconnect';
  } finally {refreshing=false;}
}
document.querySelector('#fullscreen').onclick=async()=>{try{if(document.fullscreenElement)await document.exitFullscreen();else await document.documentElement.requestFullscreen();}catch{document.querySelector('#connection').textContent='Use your browser’s fullscreen option.';}};
document.addEventListener('fullscreenchange',()=>{document.querySelector('#fullscreen').textContent=document.fullscreenElement?'Exit fullscreen':'Fullscreen';});
new ResizeObserver(layout).observe(stage);
document.addEventListener('visibilitychange',()=>{if(!document.hidden)void refresh();});
layout();await refresh();timer=setInterval(()=>{if(!document.hidden)void refresh();},5000);
const rotate=setInterval(()=>{if(!document.hidden&&photos.length>count){cursor=(cursor+Math.max(1,Math.floor(count/3)))%photos.length;draw();}},7000);
window.addEventListener('pagehide',()=>{clearInterval(timer);clearInterval(rotate);});
