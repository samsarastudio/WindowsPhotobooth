const $=id=>document.getElementById(id);let adminPin='',data,selected,requestId,loadVersion=0;
const money=n=>new Intl.NumberFormat('en-CA',{style:'currency',currency:'CAD'}).format(n/100);
async function api(path='',body){const r=await fetch('/api/admin/game'+path,{method:body?'POST':'GET',cache:'no-store',headers:{'Content-Type':'application/json','X-Admin-Pin':adminPin},body:body?JSON.stringify(body):undefined});const d=await r.json();if(!r.ok)throw Error(d.error||'Request failed');return d;}
function el(tag,text,cls){const e=document.createElement(tag);if(text!==undefined)e.textContent=text;if(cls)e.className=cls;return e;}
async function load(live=false){const version=++loadVersion,pin=adminPin;const fresh=await api("?q="+encodeURIComponent($("search").value));if(version!==loadVersion || pin!==adminPin)return;data=fresh;$('login').hidden=true;$('desk').hidden=false;render();$('liveStatus').textContent='Live · updated '+new Date().toLocaleTimeString();const f=$('settingsForm');if(!live)for(const [k,v]of Object.entries(data.config))if(f.elements[k])f.elements[k].value=k.includes('Price')?v/100:v;$('audit').replaceChildren(...data.audit.map(a=>{const e=el('div',undefined,'audit');e.append(el('strong',a.kind+' · '+new Date(a.created).toLocaleString()),el('div',a.player_id||'System','muted'),el('div',a.detail,'muted'));return e;}));}
function render(){window.momentsLive?.update(data);}
document.addEventListener('moments-angular-ready',()=>render());
document.addEventListener('moments-player-action',e=>{const p=data?.players.find(p=>p.id===e.detail.playerId);if(!p)return;if(e.detail.kind==='qr')showPlayerQr(p);else open(p,e.detail.kind,p.rounds.find(r=>r.id===e.detail.roundId));});
function open(p,kind,r){selected={p,kind,r};requestId=crypto.randomUUID();$('confirmForm').reset();$('dialogError').textContent='';$('quantity').value=1;$('quantityLabel').hidden=['extension','recover'].includes(kind);$('quantity').max=kind==='redeem'?p.available:20;$('confirmTitle').textContent=kind==='redeem'?'Redeem earned photos':kind==='recover'?'Restore an interrupted play':kind==='extension'?'Add the second-photo extension':'Add paid chance credits';$('confirmCopy').textContent=p.name+' · '+(kind==='extension'?`${r.rules.extraShots} extra shots to increase their chances. One extension per eligible chance.`:kind==='recover'?'Stop the game on the kiosk first. This restores an interrupted entitlement; old results will be rejected.':'Credits and rewards belong to this player.');$('ackText').textContent=kind==='redeem'?'I am redeeming these photos with the guest at the photobooth.':kind==='recover'?'The kiosk game has been stopped and this play was interrupted.':'I have received the payment shown above.';amount();$('confirm').showModal();$('confirmPin').focus();}
function amount(){if(!selected)return;const n=Number($('quantity').value);$('amount').textContent=selected.kind==='play'?money(data.config.playPrice*n)+' PAYMENT RECEIVED':selected.kind==='extension'?money(selected.r.rules.extensionPrice)+' PAYMENT RECEIVED':selected.kind==='redeem'?n+' PHOTO(S) TO REDEEM':'RESTORE CREDIT · NO NEW PAYMENT';}
$('quantity').oninput=()=>{requestId=crypto.randomUUID();amount();};$('cancel').onclick=()=>$('confirm').close();
$('confirmForm').onsubmit=async e=>{e.preventDefault();$('confirmSubmit').disabled=true;try{const {p,kind,r}=selected,count=kind==='extension'?1:Number($('quantity').value);const body={requestId,playerId:p.id,count,kind,roundId:r?.id,pin:$('confirmPin').value};if(kind==='play')body.expectedPrice=count*data.config.playPrice;if(kind==='extension')body.expectedPrice=r.rules.extensionPrice;await api(kind==='redeem'?'/redeem':kind==='recover'?'/recover':'/grant',body);$('confirm').close();$('message').textContent='Confirmed. Player balance updated.';await load();}catch(e){$('dialogError').textContent=e.message;}finally{$('confirmSubmit').disabled=false;}};
$('loginForm').onsubmit=async e=>{e.preventDefault();adminPin=$('adminPin').value;try{await load();startLive();$('adminPin').value='';$('message').textContent='';}catch(e){$('message').textContent=e.message;}};
$('settingsForm').onsubmit=async e=>{e.preventDefault();const b=e.submitter;b.disabled=true;try{const body=Object.fromEntries(new FormData(e.target));for(const k of ['playPrice','extensionPrice'])body[k]=Math.round(Number(body[k])*100);for(const k of ['baseShots','extraShots','bonusScore'])body[k]=Number(body[k]);await api('/settings',body);e.target.elements.pin.value='';e.target.elements.newPin.value='';await load();$('message').textContent='Settings saved. New rounds use these rules.';}catch(e){$('message').textContent=e.message;}finally{b.disabled=false;}};
let searchTimer;$('search').oninput=()=>{clearTimeout(searchTimer);searchTimer=setTimeout(()=>load(true).catch(e=>$('message').textContent=e.message),250);};$('refresh').onclick=()=>load().catch(e=>$('message').textContent=e.message);$('lock').onclick=()=>{stopLive();adminPin='';loadVersion++;data=null;window.momentsLive?.update(null);$('desk').hidden=true;$('login').hidden=false;$('audit').replaceChildren();};document.querySelectorAll('[data-tab]').forEach(b=>b.onclick=()=>{for(const id of ['players','system','history','reports'])$(id).hidden=id!==b.dataset.tab;document.querySelectorAll('[data-tab]').forEach(x=>x.classList.toggle('active',x===b));});

let playerQrUrl, playerQrRequest=0;
async function showPlayerQr(player){
 const request=++playerQrRequest;
 $('playerQrName').textContent=player.name;$('playerQrImage').hidden=true;$('playerQrStatus').textContent='Loading QR…';$('playerQrDialog').showModal();
 try{
  const response=await fetch('/api/admin/game/players/'+encodeURIComponent(player.id)+'/qr',{headers:{'X-Admin-Pin':adminPin},cache:'no-store'});
  if(!response.ok)throw Error('Could not load QR. Close and try again.');
  const blob=await response.blob();if(request!==playerQrRequest)return;
  playerQrUrl=URL.createObjectURL(blob);$('playerQrImage').src=playerQrUrl;$('playerQrImage').hidden=false;$('playerQrStatus').textContent='Scan this QR at the game.';
 }catch(error){if(request===playerQrRequest)$('playerQrStatus').textContent=error.message;}
}
$('closePlayerQr').onclick=()=>$('playerQrDialog').close();
$('playerQrDialog').addEventListener('close',()=>{playerQrRequest++;$('playerQrImage').removeAttribute('src');if(playerQrUrl)URL.revokeObjectURL(playerQrUrl);playerQrUrl=null;});

let liveController,liveRetry,liveRefreshTimer,liveBackoff=1000;
function stopLive(){clearTimeout(liveRetry);clearTimeout(liveRefreshTimer);liveController?.abort();liveController=null;}
function queueLiveRefresh(){clearTimeout(liveRefreshTimer);liveRefreshTimer=setTimeout(()=>load(true).catch(e=>$('liveStatus').textContent='Update failed · '+e.message),180);}
async function startLive(){
 stopLive();if(!adminPin)return;const controller=new AbortController();liveController=controller;
 try{
  const response=await fetch('/api/admin/game/events',{headers:{'X-Admin-Pin':adminPin},signal:controller.signal,cache:'no-store'});
  if(!response.ok)throw Error('Live connection unavailable ('+response.status+')');
  liveBackoff=1000;$('liveStatus').textContent='Live · server-connected';
  const reader=response.body.getReader(),decoder=new TextDecoder();let pending='';
  while(true){const {done,value}=await reader.read();if(done)throw Error('Live connection closed');pending+=decoder.decode(value,{stream:true});let end;
   while((end=pending.indexOf('\n\n'))>=0){const message=pending.slice(0,end);pending=pending.slice(end+2);if(message.includes('event: change'))queueLiveRefresh();else if(message.includes('event: presence')){const line=message.split('\n').find(l=>l.startsWith('data: '));if(line){const presence=JSON.parse(line.slice(6));for(const p of data?.players||[])for(const r of p.runs)if(r.id===presence.runId)r.last_seen=presence.lastSeen;for(const r of [...(data?.report.live||[]),...(data?.report.recent||[])])if(r.id===presence.runId)r.last_seen=presence.lastSeen;window.momentsLive?.presence(presence);}}else if(message.startsWith(':')&&data){window.momentsLive?.tick();}}
  }
 }catch(e){if(controller.signal.aborted)return;$('liveStatus').textContent='Reconnecting to live updates…';liveRetry=setTimeout(startLive,liveBackoff);liveBackoff=Math.min(liveBackoff*2,30000);}
}
document.addEventListener('visibilitychange',()=>{if(!document.hidden&&adminPin){load(true).catch(e=>$('liveStatus').textContent=e.message);if(!liveController)startLive();}});

document.addEventListener('moments-export-report',()=>{if(!data)return;const rows=[['Player','Kiosk','Type','Status','Accepted at','Playing at','Result at','Shots','Baskets','Score'],...data.report.recent.map(r=>[r.name,r.kiosk,r.extension?'Extension':'Base chance',r.phase,r.scanned_at,r.started_at||'',r.phase==='completed'?r.finished_at:'',r.phase==='completed'?r.attempts:'',r.phase==='completed'?r.made:'',r.phase==='completed'?r.score:''])];const cell=v=>'"'+String(v??'').replace(/^[=+@-]/,"'$&").replaceAll('"','""')+'"';const blob=new Blob(['\ufeff'+rows.map(row=>row.map(cell).join(',')).join('\r\n')],{type:'text/csv;charset=utf-8'});const url=URL.createObjectURL(blob),a=el('a');a.href=url;a.download='moments-game-attempts.csv';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);});
