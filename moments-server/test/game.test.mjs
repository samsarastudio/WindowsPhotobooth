import test from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import {randomUUID} from 'node:crypto';
import {createGameStore} from '../src/game-store.js';
const id=()=>randomUUID();

test('main-extension-main-extension uses one player QR and one extension per main',()=>{
 const {s,p,grant,claim,finish}=fixture();
 for(let cycle=0;cycle<2;cycle++){
   grant();const main=claim();assert.equal(main.extension,false);assert.equal(main.shots,10);finish(main,1);
   const payment={requestId:id(),playerId:p.id,kind:'extension',count:1,roundId:main.roundId,pin:'0707',expectedPrice:500};
   s.grant(payment);assert.equal(s.status(p.token).extensionReady,1);
   assert.throws(()=>s.grant({...payment,requestId:id()}),/not eligible/);
   const extra=claim();assert.equal(extra.extension,true);assert.equal(extra.shots,3);finish(extra,0);
   assert.throws(()=>s.grant({...payment,requestId:id()}),/not eligible/);
 }
 assert.equal(s.view(p.id).completedPlays,2);assert.equal(s.view(p.id).earned,4);assert.equal(s.view(p.id).credits,0);
});

test('Moments difficulty and target are configurable and frozen for a running game',()=>{
 const {s,grant,claim,finish}=fixture();assert.equal(s.settings().difficulty,1);
 grant(2);const first=claim();s.configure({pin:'0707',difficulty:2,bonusScore:650});
 assert.equal(first.rules.difficulty,1);assert.equal(first.rules.bonusScore,666);finish(first,0);
 const second=claim();assert.equal(second.rules.difficulty,2);assert.equal(second.rules.bonusScore,650);
 assert.throws(()=>s.configure({pin:'0707',difficulty:3}),/difficulty/);
});

test('graded scores validate every attempt and threshold, including proximity misses',()=>{
 const {s,grant,claim}=fixture();grant();const c=claim();
 const req={requestId:id(),roundId:c.roundId,runId:c.runId,kiosk:'test-kiosk',extension:false,attempts:10,made:4,score:300,grades:[0,1,2,3,4,5,6,7,8,9]};
 assert.throws(()=>s.result({...req,score:301}),/shot grades/);
 assert.throws(()=>s.result({...req,made:5}),/shot grades/);
 assert.throws(()=>s.result({...req,grades:[...req.grades.slice(0,9),99]}),/shot grades/);
 assert.throws(()=>s.result({...req,grades:undefined}),/shot grades/);
 assert.equal(s.result(req).score,300);assert.deepEqual(s.result(req),s.result(req));
 assert.throws(()=>s.configure({pin:'0707',extraShots:10}),/exactly 3/);
 assert.throws(()=>s.configure({pin:'0707',bonusScore:901}),/target/);
 assert.equal(s.configure({pin:'0707',bonusScore:666}).bonusScore,666);
});

test('same home QR prioritizes extension, preserves base credit and carries saved score',()=>{
 const {s,p,grant,claim,finish}=fixture();grant(2);const base=claim();finish(base,3);
 s.grant({requestId:id(),playerId:p.id,kind:'extension',count:1,roundId:base.roundId,pin:'0707',expectedPrice:500});
 const extra=claim();assert(extra.extension);assert.equal(extra.shots,3);assert.equal(extra.baseScore,270);assert.equal(extra.player.credits,1);
 const r=finish(extra,1);assert.equal(r.score,360);assert.equal(r.photos,2);
 const next=claim();assert(!next.extension);assert.equal(next.shots,10);assert.equal(next.baseScore,0);
});

test('F9 restores base credit exactly once, blocks stale results and wrong kiosks',()=>{
 const {s,p,grant,claim,finish}=fixture();grant();const c=claim();
 const req={requestId:id(),roundId:c.roundId,runId:c.runId,kiosk:'test-kiosk'};
 assert.throws(()=>s.resetRun({...req,kiosk:'other'}),/replaced/);
 assert.equal(s.resetRun(req).refunded,true);s.resetRun(req);s.resetRun({...req,requestId:id()});
 assert.equal(s.view(p.id).credits,1);assert.throws(()=>finish(c,1),/not active/);
 const retry=claim();assert.notEqual(retry.roundId,c.roundId);assert.equal(s.view(p.id).credits,0);
});

test('F9 restores extension on same QR without granting full-game credits',()=>{
 const {s,p,grant,claim,finish}=fixture();grant();const base=claim();finish(base,2);
 s.grant({requestId:id(),playerId:p.id,kind:'extension',count:1,roundId:base.roundId,pin:'0707',expectedPrice:500});
 const extra=claim(),req={requestId:id(),roundId:extra.roundId,runId:extra.runId,kiosk:'test-kiosk'};
 s.resetRun(req);s.resetRun(req);assert.equal(s.view(p.id).credits,0);
 const next=claim();assert(next.extension);assert.equal(next.shots,3);assert.equal(next.baseScore,180);
 assert.throws(()=>finish(extra,0),/recovered or replaced/);assert.equal(finish(next,1).score,270);
});

test('F9 after a saved result never refunds earned rewards or duplicates credits',()=>{
 const {s,p,grant,claim,finish}=fixture();grant();const c=claim();finish(c,8);
 const req={requestId:id(),roundId:c.roundId,runId:c.runId,kiosk:'test-kiosk'};
 assert.equal(s.resetRun(req).refunded,false);assert.equal(s.view(p.id).credits,0);assert.equal(s.view(p.id).earned,2);
});

test('graded migration keeps old rounds and custom targets, changes previous default once',()=>{
 const {db,s,grant,claim}=fixture();
 db.prepare('UPDATE game_settings SET json=? WHERE id=1').run(JSON.stringify({...s.settings(),scoringVersion:1,bonusScore:99}));
 grant();const old=claim();db.prepare("DELETE FROM game_migrations WHERE id='graded-scoring-v2'").run();
 const next=createGameStore(db);assert.equal(next.settings().bonusScore,666);assert.equal(next.settings().scoringVersion,2);
 assert.equal(next.result({requestId:id(),roundId:old.roundId,runId:old.runId,kiosk:'test-kiosk',extension:false,attempts:10,made:10,score:100}).photos,2);
 next.configure({pin:'0707',bonusScore:555});assert.equal(createGameStore(db).settings().bonusScore,555);
});
function fixture(){const db=new Database(':memory:');db.pragma('foreign_keys=ON');const s=createGameStore(db);const p=s.register({requestId:id(),name:'Test Player',email:'test@example.com',dob:'2000-02-29'});const grant=(count=1)=>s.grant({requestId:id(),playerId:p.id,kind:'play',count,pin:'0707',expectedPrice:1000*count});const claim=()=>s.claim({requestId:id(),token:p.token,kiosk:'test-kiosk'});const finish=(r,made)=>s.result({requestId:id(),roundId:r.roundId,runId:r.runId,kiosk:'test-kiosk',extension:r.extension,attempts:r.shots,made,score:made*(r.rules.scoringVersion>=2?90:10),grades:[...Array(made).fill(0),...Array(r.shots-made).fill(9)]});return {db,s,p,grant,claim,finish};}
test('registration grants no play; bypass codes and unregistered QR rejected',()=>{const {s,p,claim}=fixture();assert.equal(p.credits,0);assert.throws(claim,/purchase a chance/);assert.throws(()=>s.claim({requestId:id(),token:'123456',kiosk:'test'}),/Scan your Moments/);});
test('manual grant requires PIN, correct price, and is idempotent',()=>{const {s,p}=fixture();const payload={requestId:id(),playerId:p.id,kind:'play',count:2,pin:'0707',expectedPrice:2000};assert.throws(()=>s.grant({...payload,pin:'0000'}),/PIN/);assert.throws(()=>s.grant({...payload,expectedPrice:1000}),/Price changed/);assert.equal(s.view(p.id).credits,0);s.grant(payload);s.grant(payload);assert.equal(s.view(p.id).credits,2);assert.throws(()=>s.grant({...payload,count:3}),/already used/);});
test('claim is atomic, duplicate claim cannot consume twice, parallel kiosk blocked',()=>{const {s,p,grant}=fixture();grant(2);const payload={requestId:id(),token:p.token,kiosk:'one'};const a=s.claim(payload);assert.deepEqual(s.claim(payload),a);assert.equal(s.view(p.id).credits,1);assert.throws(()=>s.claim({...payload,requestId:id(),kiosk:'two'}),/already in progress/);assert.equal(s.view(p.id).credits,1);});
test('minimum photo, threshold bonus, two-play minimum and result idempotency',()=>{const {s,p,grant,claim,finish}=fixture();grant(2);const a=claim();const first=finish(a,0);assert.equal(first.photos,1);assert.equal(first.player.earned,1);assert.equal(finish(a,0).player.earned,1);assert.throws(()=>finish(a,1),/Conflicting/);const second=finish(claim(),0);assert.equal(second.player.earned,3);assert.equal(second.player.pairBonus,1);assert.equal(s.view(p.id).credits,0);});
test('two skilled plays earn four photos',()=>{const {grant,claim,finish}=fixture();grant(2);assert.equal(finish(claim(),10).photos,2);assert.equal(finish(claim(),10).player.earned,4);});
test('extension requires host payment; three shots guarantee second photo even at zero score',()=>{const {s,p,grant,claim,finish}=fixture();grant();const base=claim();finish(base,0);assert.throws(claim,/purchase a chance/);s.grant({requestId:id(),playerId:p.id,kind:'extension',count:1,roundId:base.roundId,pin:'0707',expectedPrice:500});const ext=claim();assert.equal(ext.extension,true);assert.equal(ext.shots,3);const r=finish(ext,0);assert.equal(r.photos,2);assert.equal(r.player.earned,2);assert.equal(r.player.completedPlays,1);assert.throws(()=>s.grant({requestId:id(),playerId:p.id,kind:'extension',count:1,roundId:base.roundId,pin:'0707',expectedPrice:500}),/not eligible/);});
test('pair guarantee completes the second play; any sold extension adds an actual photo',()=>{const {s,p,grant,claim,finish}=fixture();grant(2);const first=claim();finish(first,0);const second=claim();const result=finish(second,0);assert.equal(result.photos,2);assert.equal(result.rewardReason,'two-play-guarantee');assert.throws(()=>s.grant({requestId:id(),playerId:p.id,kind:'extension',count:1,roundId:second.roundId,pin:'0707',expectedPrice:500}),/not eligible/);s.grant({requestId:id(),playerId:p.id,kind:'extension',count:1,roundId:first.roundId,pin:'0707',expectedPrice:500});assert.equal(finish(claim(),0).player.earned,4);});
test('redemption is authorized, atomic, idempotent and cannot overdraw',()=>{const {s,p,grant,claim,finish}=fixture();grant();finish(claim(),10);const req={requestId:id(),playerId:p.id,count:2,pin:'0707'};s.redeem(req);s.redeem(req);assert.equal(s.view(p.id).available,0);assert.throws(()=>s.redeem({...req,requestId:id(),count:1}),/Not enough/);});
test('round rules are frozen; system PIN can change',()=>{const {s,grant,claim,finish}=fixture();grant();s.configure({pin:'0707',bonusScore:60});const r=claim();s.configure({pin:'0707',bonusScore:99,newPin:'1234'});assert.equal(finish(r,6).photos,2);assert.throws(()=>s.configure({pin:'0707',title:'No'}),/PIN/);assert.equal(s.configure({pin:'1234',title:'WINTER HOOPS'}).title,'WINTER HOOPS');});
test('operator recovery restores one credit and rejects late results',()=>{const {s,p,grant,claim,finish}=fixture();grant();const r=claim();const req={requestId:id(),roundId:r.roundId,pin:'0707'};s.recover(req);s.recover(req);assert.equal(s.view(p.id).credits,1);assert.throws(()=>finish(r,5),/not active/);});
test('invalid DOB, score, fractional counts and excessive shots rejected',()=>{const {s,grant,claim}=fixture();assert.throws(()=>s.register({requestId:id(),name:'X',email:'x@y.ca',dob:'2020-02-31'}),/date of birth/);grant();const r=claim();assert.throws(()=>s.result({requestId:id(),roundId:r.roundId,runId:r.runId,kiosk:'test-kiosk',extension:false,attempts:10,made:11,score:110}),/Invalid/);assert.throws(()=>s.configure({pin:'0707',baseShots:1,bonusScore:91}),/Check prices/);});
test('late extension results cannot complete a recovered replacement attempt',()=>{const {s,p,grant,claim,finish}=fixture();grant();const base=claim();finish(base,0);s.grant({requestId:id(),playerId:p.id,kind:'extension',count:1,roundId:base.roundId,pin:'0707',expectedPrice:500});const old=claim();s.recover({requestId:id(),roundId:old.roundId,pin:'0707'});const replacement=claim();assert.throws(()=>finish(old,0),/recovered or replaced/);assert.equal(finish(replacement,0).photos,2);});
test('reinitialization preserves settings, balances, and confirmation PIN',()=>{const {db,s,p,grant}=fixture();grant(2);s.configure({pin:'0707',newPin:'4567',playPrice:1200});const restarted=createGameStore(db);assert.equal(restarted.settings().playPrice,1200);assert.equal(restarted.view(p.id).credits,2);assert.throws(()=>restarted.configure({pin:'0707'}),/PIN/);restarted.configure({pin:'4567'});});

test('matching registration returns existing QR and preserves paid balances',()=>{const {db,s,p,grant,claim,finish}=fixture();grant(2);finish(claim(),10);const again=s.register({requestId:id(),name:' test   PLAYER ',email:' TEST@example.com ',dob:'2000-02-29'});assert.equal(again.id,p.id);assert.equal(again.token,p.token);assert.equal(again.credits,1);assert.equal(again.available,2);assert.equal(db.prepare('SELECT count(*) AS n FROM game_players').get().n,1);});
test('registration recovery requires matching name, email and DOB',()=>{const {s,p}=fixture();for(const changed of [{name:'Someone Else'},{email:'other@example.com'},{dob:'2000-02-28'}]){const other=s.register({requestId:id(),name:'Test Player',email:'test@example.com',dob:'2000-02-29',...changed});assert.notEqual(other.token,p.token);}});

test('666-point target is valid, 630 earns one and 720 earns two',()=>{const {s,grant,claim,finish}=fixture();assert.equal(s.settings().bonusScore,666);s.configure({pin:'0707',bonusScore:666});grant(2);assert.equal(finish(claim(),7).photos,1);assert.equal(finish(claim(),8).photos,2);});
test('progress tracks lifecycle without spending credits and rejects obsolete runs',()=>{const {s,p,grant,claim,finish}=fixture();grant(2);const c=claim();const payload={roundId:c.roundId,runId:c.runId,kiosk:'test-kiosk',phase:'playing',attempts:2,made:1,score:10};s.progress(payload);s.progress(payload);assert.equal(s.view(p.id).credits,1);let row=s.list()[0];assert.equal(row.runs[0].phase,'playing');assert(row.runs[0].started_at);assert(row.runs[0].last_seen);s.progress({...payload,phase:'preparing',attempts:0,made:0,score:0});assert.equal(s.list()[0].runs[0].score,0);assert.throws(()=>s.progress({...payload,runId:id()}),/no longer active/);assert.throws(()=>s.progress({...payload,phase:'unknown'}),/Invalid game progress/);finish(c,3);row=s.list()[0];assert.equal(row.runs[0].phase,'completed');assert(row.runs[0].finished_at);assert.equal(row.runs[0].score,270);assert.throws(()=>s.progress(payload),/no longer active/);const report=s.report();assert.equal(report.revenue,2000);assert.equal(report.creditsGranted,2);assert.equal(report.creditsReady,1);assert.equal(report.completedRuns,1);assert.equal(report.shots,10);assert.equal(report.baskets,3);assert.equal(report.live.length,0);assert(row.timeline.some(a=>a.kind==='manual-payment'));});
test('recovery and extension remain separate report attempts without duplicate sales',()=>{const {s,p,grant,claim,finish}=fixture();grant();let c=claim();s.recover({requestId:id(),roundId:c.roundId,pin:'0707'});c=claim();finish(c,0);const payment={requestId:id(),playerId:p.id,kind:'extension',count:1,roundId:c.roundId,pin:'0707',expectedPrice:500};s.grant(payment);s.grant(payment);const e=claim();finish(e,0);const r=s.report();assert.equal(r.revenue,1500);assert.equal(r.recovered,1);assert.equal(r.scans,3);assert.equal(r.completedChances,1);assert.equal(r.completedRuns,2);assert.equal(r.earned,2);assert.equal(r.extensionsSold,1);});

test('legacy default target migrates once while purchased rules and later settings remain intact',()=>{const {db,s,grant,claim}=fixture();s.configure({pin:'0707',bonusScore:60});grant();const c=claim();db.prepare("DELETE FROM game_migrations WHERE id='reward-target-99'").run();const updated=createGameStore(db);assert.equal(updated.settings().bonusScore,99);assert.equal(updated.list()[0].rounds[0].rules.bonusScore,60);updated.configure({pin:'0707',bonusScore:70});assert.equal(createGameStore(db).settings().bonusScore,70);assert.equal(c.rules.bonusScore,60);});

test('status-only heartbeat never persists intermediate scores or invalidates cards',()=>{const {s,grant,claim,finish}=fixture();grant();const c=claim(),p={roundId:c.roundId,runId:c.runId,kiosk:'test-kiosk',phase:'playing'};assert.equal(s.progress(p).changed,true);const heartbeat=s.progress({...p,attempts:5,made:5,score:50});assert.equal(heartbeat.changed,false);assert(heartbeat.presence.lastSeen);const run=s.list()[0].runs[0];assert.equal(run.score,0);assert.equal(run.attempts,0);assert.equal(run.made,0);finish(c,5);assert.equal(s.list()[0].runs[0].score,450);});

 test('game timers default correctly, validate and freeze with each chance',()=>{
 const {s,grant,claim}=fixture();grant(2);const first=claim();
 assert.equal(first.rules.resultsTimeoutSeconds,5);assert.equal(first.rules.shotCountdownSeconds,3);
 for(const [field,values] of Object.entries({resultsTimeoutSeconds:[0,61,1.5],shotCountdownSeconds:[0,11,2.5]})) for(const value of values)assert.throws(()=>s.configure({pin:'0707',[field]:value}),/seconds/);
 const changed=s.configure({pin:'0707',resultsTimeoutSeconds:8,shotCountdownSeconds:2});
 assert.equal(changed.resultsTimeoutSeconds,8);assert.equal(changed.shotCountdownSeconds,2);
 assert.equal(first.rules.resultsTimeoutSeconds,5);assert.equal(first.rules.shotCountdownSeconds,3);
 });

test('deleting a registration requires PIN and confirmation, clears history and invalidates QR',()=>{
 const {s,p,grant,claim,finish}=fixture();grant(2);const c=claim();
 const deletion={requestId:id(),playerId:p.id,pin:'0707',confirmDelete:true};
 assert.throws(()=>s.deletePlayer({...deletion,pin:'bad'}),/PIN/);
 assert.throws(()=>s.deletePlayer({...deletion,confirmDelete:false}),/Confirm/);
 assert.throws(()=>s.deletePlayer(deletion),/active game/);
 finish(c,1);assert.equal(s.report().completedRuns,1);
 assert.equal(s.deletePlayer(deletion).deleted,true);
 assert.equal(s.deletePlayer(deletion).deleted,true);
 assert.equal(s.list().length,0);assert.equal(s.report().completedRuns,0);assert.equal(s.report().revenue,0);
 assert.throws(()=>s.status(p.token),/not found/);
 assert.throws(()=>s.claim({requestId:id(),token:p.token,kiosk:'test-kiosk'}));
});
