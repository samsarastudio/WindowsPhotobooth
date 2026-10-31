const $=id=>document.getElementById(id);
let token=localStorage.getItem('momentsGameToken'),requestId=crypto.randomUUID(),config,player,blobUrl,pollBusy=false,actionBusy=false,generation=0;
const kiosk=new URLSearchParams(location.search).get('kiosk')||'haunted-hoops-01';
const money=n=>'$'+(n/100).toLocaleString('en-CA');
async function api(path,body){const r=await fetch('/api/game/'+path,{method:body?'POST':'GET',cache:'no-store',headers:{'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined});const d=await r.json();if(!r.ok)throw Object.assign(Error(d.error||'Please try again.'),{status:r.status});return d;}
function message(text){$('message').textContent=text;}
function render(p){
 player=p;const opening=$('ticket').hidden;
 if(opening){document.activeElement?.blur();window.scrollTo(0,0);}
 document.body.classList.add('pass-visible');$('promotion').hidden=true;$('registration').hidden=true;$('ticket').hidden=false;
 $('playerName').textContent=p.name;$('photos').textContent=p.available;
 const q=p.queue,r=p.latestRound,active=q&&['waiting','called','playing'].includes(q.state);
 $('readyButton').hidden=!(q?.state==='called'&&!q.ready);$('rejoinButton').hidden=active||!p.canJoin||!config.eventMode||p.offers?.length>0||p.available>0;
 $('offerButton').hidden=active||(!p.offers?.length&&!p.available);$('offerButton').textContent=p.available?'Show my paid photo pass':'Show my photo offer to the host';
 $('rejoinButton').textContent=r?'Try again for free · start from zero':'Join the queue';
 $('turnBadge').textContent=q&&active?'TURN '+q.number:'YOUR PLAYER PASS';
 $('turnTitle').textContent=q?.state==='waiting'?'You’re in the queue':q?.state==='called'?'It’s your turn!':q?.state==='playing'?'Your game is in progress':q?.state==='skipped'?'Missed your turn?':p.offers?.length?'Photo offer unlocked!':p.available?'Your photos are ready to collect':r?'Try again!':'You’re registered';
 $('turnCopy').textContent=q?.state==='waiting'?`Queue position ${q.position}. Stay nearby and keep this page open. We’ll call your first name and turn number.`:q?.state==='called'?q.ready?'Put your phone away. Stand on the floor marker; the game will detect you and start.':'Step onto the floor marker, then confirm below. Your invitation is held briefly.':q?.state==='playing'?'Follow the instructions on the big screen. Your result will appear here.':p.offers?.length?'You reached the target! Show your pass to the photobooth host to purchase your two photos.':p.available?'Your payment is confirmed. Show your paid photo pass at the photobooth to collect.':p.canJoin?`Another ${config.baseShots} shots? Join the end of the queue for free. Every game starts from zero.`:'Your game is being saved. Please wait.';
 $('resultPanel').hidden=!r||r.state==='active'||r.state==='cancelled';
 if(r){$('playerScore').textContent=r.score+' HAUNT POINTS';const offer=p.offers?.[0];$('rewardCopy').textContent=offer?`UNLOCKED! Get 2 Halloween photos for ${money(offer.price)} CAD. Show your pass to the host to purchase.`:r.rewardReason==='offer-purchased'?`Payment confirmed. ${p.available} photos left to collect at the photobooth.`:r.rules.eventMode?`${Math.max(0,r.rules.bonusScore-r.score)} points short of the target. Try again for free — ${config.baseShots} new shots, starting from zero.`:`${p.available} photos available. Visit the photobooth host.`;}
 if(!config.eventMode){$('turnTitle').textContent='Your player pass';$('turnCopy').textContent='Visit the host to add a paid chance, then scan your pass at the game.';$('hostPass').open=true;loadQr();}
}
async function refresh(){if(!token||pollBusy)return;pollBusy=true;const current=generation;try{const d=await api('status',{token});if(current===generation)render(d.player);}catch(e){if(current===generation)message(e.status===404?'This registration is no longer available. Use Register another person to start again.':e.message);}finally{pollBusy=false;}}
async function join(){if(actionBusy)return;actionBusy=true;$('rejoinButton').disabled=true;try{await api('queue/join',{token,kiosk});message('');await refresh();}catch(e){message(e.message);}finally{actionBusy=false;$('rejoinButton').disabled=false;}}
async function loadQr(){if(!token||$('qr').src)return;const current=token;try{const r=await fetch('/api/game/qr',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({token})});if(!r.ok)throw Error('Could not load your host pass. Try again.');const blob=await r.blob();if(current!==token)return;blobUrl=URL.createObjectURL(blob);$('qr').src=blobUrl;$('save').href=blobUrl;}catch(e){message(e.message);}}
$('offerButton').onclick=()=>{$('hostPass').open=true;$('hostPass').scrollIntoView({behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth',block:'center'});};
$('hostPass').addEventListener('toggle',()=>{if($('hostPass').open)loadQr();});
$('registerForm').elements.dob.max=new Date().toISOString().slice(0,10);
$('registerForm').onsubmit=async e=>{e.preventDefault();e.submitter.disabled=true;try{const values=Object.fromEntries(new FormData(e.target));const d=await api('register',{...values,consent:values.consent==='on',requestId});token=d.player.token;localStorage.setItem('momentsGameToken',token);await refresh();if(config.eventMode)await join();}catch(e){message(e.message);}finally{e.submitter.disabled=false;}};
$('readyButton').onclick=async()=>{if(actionBusy)return;actionBusy=true;$('readyButton').disabled=true;try{await api('queue/ready',{token,queueId:player.queue.id});message('');await refresh();}catch(e){message(e.message);}finally{actionBusy=false;$('readyButton').disabled=false;}};
$('rejoinButton').onclick=join;$('refresh').onclick=refresh;
$('newPlayer').onclick=()=>{generation++;token=null;player=null;localStorage.removeItem('momentsGameToken');requestId=crypto.randomUUID();document.body.classList.remove('pass-visible');$('promotion').hidden=false;$('ticket').hidden=true;$('registration').hidden=false;$('registerForm').reset();$('hostPass').open=false;$('qr').removeAttribute('src');if(blobUrl)URL.revokeObjectURL(blobUrl);message('');window.scrollTo(0,0);};
(async()=>{try{config=(await api('config')).config;$('gameTitle').textContent=config.title;$('gameRules').textContent=`${config.baseShots} SHOTS · SCORE ${config.bonusScore}`;$('offerTerms').textContent=`Play and retry for free. Reach ${config.bonusScore} points to unlock 2 Halloween photos for ${money(config.playPrice)} CAD. Photos require purchase at the host.`;$('stepTarget').textContent='SCORE '+config.bonusScore;$('stepOffer').textContent='2 PHOTOS FOR '+money(config.playPrice);if(!config.eventMode){$('joinButton').textContent='Create my player QR →';$('emailOptional').textContent='';$('registerForm').elements.email.required=true;}await refresh();}catch(e){message(e.message);}})();
setInterval(()=>{if(!document.hidden&&config)refresh();},2500);
document.addEventListener('visibilitychange',()=>{if(!document.hidden&&config)refresh();});
