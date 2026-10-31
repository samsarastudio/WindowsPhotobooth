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
 $('playerName').textContent=p.name;$('photos').textContent=p.available;$('photos').closest('.stats').hidden=p.available===0&&!p.latestRound;
 const r=p.latestRound,active=r&&['active','extension_active'].includes(r.state);
 $('readyButton').hidden=true;$('rejoinButton').hidden=true;
 $('offerButton').hidden=active||(!p.offers?.length&&!p.available);$('offerButton').textContent=p.available?'Show my paid photo pass':'Show my photo offer to the host';
 $('turnBadge').textContent='YOUR PLAYER QR';
 $('turnTitle').textContent=active?'Your game is in progress':p.offers?.length?'Photo offer unlocked!':p.available?'Your photos are ready to collect':'Scan your QR to play';
 $('turnCopy').textContent=active?'Follow the instructions on the big screen. Your result will appear here.':p.offers?.length?'You reached the target! Show your pass to the photobooth host for your photo offer.':p.available?'Your payment is confirmed. Show your paid photo pass at the photobooth to collect.':`Scan the QR below at the game scanner, then stand on the floor marker. ${config.baseShots} shots. Free retries start from zero using this same QR.`;
 $('resultPanel').hidden=!r||active||r.state==='cancelled';
 if(r){$('playerScore').textContent=r.score+' HAUNT POINTS';const offer=p.offers?.[0];$('rewardCopy').textContent=offer?`Chance to get 2 photos for ${money(offer.price)} CAD. Show your pass to the host to purchase.`:r.rewardReason==='offer-purchased'?`Payment confirmed. ${p.available} photos left to collect at the photobooth.`:r.rules.eventMode?`${Math.max(0,r.rules.bonusScore-r.score)} points short of the target. Scan the same QR to try again for free — ${config.baseShots} new shots, starting from zero.`:`${p.available} photos available. Visit the photobooth host.`;}
 $('hostPass').open=true;loadQr();

}
async function refresh(){if(!token||pollBusy)return;pollBusy=true;const current=generation;try{const d=await api('status',{token});if(current===generation)render(d.player);}catch(e){if(current===generation)message(e.status===404?'This registration is no longer available. Use Register another person to start again.':e.message);}finally{pollBusy=false;}}
async function loadQr(){if(!token||$('qr').src)return;const current=token;try{const r=await fetch('/api/game/qr',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({token})});if(!r.ok)throw Error('Could not load your host pass. Try again.');const blob=await r.blob();if(current!==token)return;blobUrl=URL.createObjectURL(blob);$('qr').src=blobUrl;$('save').href=blobUrl;}catch(e){message(e.message);}}
$('offerButton').onclick=()=>{$('hostPass').open=true;$('hostPass').scrollIntoView({behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth',block:'center'});};
$('hostPass').addEventListener('toggle',()=>{if($('hostPass').open)loadQr();});
$('registerForm').elements.dob.max=new Date().toISOString().slice(0,10);
$('registerForm').onsubmit=async e=>{e.preventDefault();e.submitter.disabled=true;try{const values=Object.fromEntries(new FormData(e.target));const d=await api('register',{...values,consent:values.consent==='on',requestId});token=d.player.token;localStorage.setItem('momentsGameToken',token);await refresh();}catch(e){message(e.message);}finally{e.submitter.disabled=false;}};
$('refresh').onclick=refresh;
$('newPlayer').onclick=()=>{generation++;token=null;player=null;localStorage.removeItem('momentsGameToken');requestId=crypto.randomUUID();document.body.classList.remove('pass-visible');$('promotion').hidden=false;$('ticket').hidden=true;$('registration').hidden=false;$('registerForm').reset();$('hostPass').open=false;$('qr').removeAttribute('src');if(blobUrl)URL.revokeObjectURL(blobUrl);message('');window.scrollTo(0,0);};
(async()=>{try{config=(await api('config')).config;$('gameTitle').textContent=config.title;$('gameRules').textContent=`${config.baseShots} SHOTS · SCORE ${config.bonusScore}`;$('photoTargetPoints').textContent=config.bonusScore+' POINTS';$('photoTargetPrice').textContent='Register, then scan your player QR to play';$('offerTerms').textContent=`Play and retry for free. Reach ${config.bonusScore} points to unlock your photo offer. Scan your player QR at the game scanner to start.`;$('stepTarget').textContent='SCORE '+config.bonusScore;$('stepOffer').textContent='UNLOCK YOUR PHOTO OFFER';if(!config.eventMode){$('joinButton').textContent='Create my player QR →';$('emailOptional').textContent='';$('registerForm').elements.email.required=true;}await refresh();}catch(e){message(e.message);}})();
setInterval(()=>{if(!document.hidden&&config)refresh();},2500);
document.addEventListener('visibilitychange',()=>{if(!document.hidden&&config)refresh();});
