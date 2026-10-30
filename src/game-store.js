import { randomBytes, randomUUID, scryptSync, timingSafeEqual, createHash } from 'node:crypto';

const defaults = { title: 'HAUNTED HOOPS', playPrice: 1000, extensionPrice: 500, baseShots: 10, extraShots: 3, bonusScore: 666, scoringVersion: 2, difficulty: 1, resultsTimeoutSeconds: 5, shotCountdownSeconds: 3, currency: 'CAD' };
// Unity ShotGrade order: Swish, NiceShot, GoodThrow, BankShot, SoClose,
// Brick, AirBall, Short, TooStrong, Miss, TooLow. Version is frozen per round.
const gradePoints = [90,70,50,60,20,10,0,0,0,0,0];
const fail = (message, status = 400) => { throw Object.assign(new Error(message), { status }); };
const integer = (value, min, max) => Number.isSafeInteger(value) && value >= min && value <= max;
const hashPin = (pin, salt) => scryptSync(pin, salt, 32).toString('hex');

export function createGameStore(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS game_settings (id INTEGER PRIMARY KEY CHECK(id=1), json TEXT NOT NULL, salt TEXT NOT NULL, pin_hash TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS game_players (id TEXT PRIMARY KEY, token TEXT UNIQUE NOT NULL, name TEXT NOT NULL, email TEXT NOT NULL, dob TEXT NOT NULL, credits INTEGER NOT NULL DEFAULT 0 CHECK(credits>=0), redeemed INTEGER NOT NULL DEFAULT 0 CHECK(redeemed>=0), created TEXT NOT NULL);
    CREATE INDEX IF NOT EXISTS game_player_identity ON game_players(email,dob);
    CREATE TABLE IF NOT EXISTS game_rounds (id TEXT PRIMARY KEY, player_id TEXT NOT NULL REFERENCES game_players(id), kiosk TEXT NOT NULL, state TEXT NOT NULL, rules TEXT NOT NULL, base_score INTEGER, base_made INTEGER, extra_score INTEGER, extra_made INTEGER, photos INTEGER NOT NULL DEFAULT 0, reward_reason TEXT NOT NULL DEFAULT '', created TEXT NOT NULL);
    CREATE UNIQUE INDEX IF NOT EXISTS game_one_active_player ON game_rounds(player_id) WHERE state IN ('active','extension_active');
    CREATE UNIQUE INDEX IF NOT EXISTS game_one_active_kiosk ON game_rounds(kiosk) WHERE state IN ('active','extension_active');
    CREATE TABLE IF NOT EXISTS game_actions (id TEXT PRIMARY KEY, kind TEXT NOT NULL, fingerprint TEXT NOT NULL, response TEXT NOT NULL, created TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS game_audit (id TEXT PRIMARY KEY, player_id TEXT, kind TEXT NOT NULL, detail TEXT NOT NULL, created TEXT NOT NULL);
  `);
  if (!db.prepare('PRAGMA table_info(game_rounds)').all().some(c=>c.name==='reward_reason')) db.exec("ALTER TABLE game_rounds ADD COLUMN reward_reason TEXT NOT NULL DEFAULT ''");
  if (!db.prepare('PRAGMA table_info(game_rounds)').all().some(c=>c.name==='run_id')) db.exec("ALTER TABLE game_rounds ADD COLUMN run_id TEXT NOT NULL DEFAULT ''");
  db.exec(`CREATE TABLE IF NOT EXISTS game_runs (id TEXT PRIMARY KEY, round_id TEXT NOT NULL, player_id TEXT NOT NULL, kiosk TEXT NOT NULL, extension INTEGER NOT NULL, phase TEXT NOT NULL, scanned_at TEXT NOT NULL, started_at TEXT, finished_at TEXT, last_seen TEXT, attempts INTEGER NOT NULL DEFAULT 0, made INTEGER NOT NULL DEFAULT 0, score INTEGER NOT NULL DEFAULT 0)`);
  const salt = randomBytes(16).toString('hex');
  db.prepare('INSERT OR IGNORE INTO game_settings VALUES (1,?,?,?)').run(JSON.stringify(defaults), salt, hashPin('0707', salt));
  db.exec('CREATE TABLE IF NOT EXISTS game_migrations (id TEXT PRIMARY KEY)');
  db.transaction(()=>{
    if(!db.prepare("SELECT id FROM game_migrations WHERE id='reward-target-99'").get()){
      const row=db.prepare('SELECT json FROM game_settings WHERE id=1').get(),old=JSON.parse(row.json);
      if(old.baseShots===10 && old.bonusScore===60)db.prepare('UPDATE game_settings SET json=? WHERE id=1').run(JSON.stringify({...old,bonusScore:99}));
      db.prepare("INSERT INTO game_migrations VALUES ('reward-target-99')").run();
    }
  }).immediate();
  db.transaction(()=>{
    if(!db.prepare("SELECT id FROM game_migrations WHERE id='graded-scoring-v2'").get()){
      const old=JSON.parse(db.prepare('SELECT json FROM game_settings WHERE id=1').get().json);
      const bonusScore=old.baseShots===10 && [60,99].includes(old.bonusScore)?666:old.bonusScore;
      db.prepare('UPDATE game_settings SET json=? WHERE id=1').run(JSON.stringify({...old,bonusScore,extraShots:3,scoringVersion:2}));
      db.prepare("INSERT INTO game_migrations VALUES ('graded-scoring-v2')").run();
    }
  }).immediate();
  const settings = () => ({difficulty:1,resultsTimeoutSeconds:5,shotCountdownSeconds:3,...JSON.parse(db.prepare('SELECT json FROM game_settings WHERE id=1').get().json)});
  const audit = (player, kind, detail) => db.prepare('INSERT INTO game_audit VALUES (?,?,?,?,?)').run(randomUUID(), player, kind, JSON.stringify(detail), new Date().toISOString());
  function checkPin(pin) {
    const row = db.prepare('SELECT * FROM game_settings WHERE id=1').get();
    if (typeof pin !== 'string' || pin.length > 32 || !timingSafeEqual(Buffer.from(hashPin(pin, row.salt), 'hex'), Buffer.from(row.pin_hash, 'hex'))) fail('Confirmation PIN is incorrect.', 403);
  }
  function once(id, kind, payload, work) {
    if (typeof id !== 'string' || !/^[a-zA-Z0-9-]{16,80}$/.test(id)) fail('A unique request ID is required.');
    const fingerprint = createHash('sha256').update(JSON.stringify(payload)).digest('hex');
    return db.transaction(() => {
      const old = db.prepare('SELECT * FROM game_actions WHERE id=?').get(id);
      if (old) {
        if (old.kind !== kind || old.fingerprint !== fingerprint) fail('Request ID already used for another action.', 409);
        return JSON.parse(old.response);
      }
      const result = work();
      db.prepare('INSERT INTO game_actions VALUES (?,?,?,?,?)').run(id, kind, fingerprint, JSON.stringify(result), new Date().toISOString());
      return result;
    }).immediate();
  }
  function player(id) {
    const p = db.prepare('SELECT * FROM game_players WHERE id=?').get(id);
    if (!p) fail('Player not found.', 404);
    return p;
  }
  function rounds(id) { return db.prepare('SELECT rowid AS sequence,* FROM game_rounds WHERE player_id=? ORDER BY rowid').all(id); }
  function balance(id) {
    const p = player(id), completed = rounds(id).filter(r => r.base_score !== null);
    const earned=completed.reduce((sum,r)=>sum+r.photos,0), pairBonus=completed.filter(r=>r.reward_reason==='two-play-guarantee').length;
    return { earned, available: earned - p.redeemed, redeemed: p.redeemed, pairBonus, completedPlays: completed.length };
  }
  function view(id, privateDetails = false) {
    const p = player(id);
    const extensionReady=rounds(id).filter(r=>r.state==='extension_ready').length;
    return { id: p.id, name: p.name, credits: p.credits, extensionReady, ...balance(id), ...(privateDetails ? { email: p.email, dob: p.dob, token: p.token, created: p.created } : {}) };
  }
  function roundView(r) {
    return { id: r.id, state: r.state, rules: JSON.parse(r.rules), score: (r.base_score || 0)+(r.extra_score || 0), photos: r.photos, rewardReason:r.reward_reason, player: view(r.player_id) };
  }
  function register(input) {
    const name = String(input.name || '').trim(), email = String(input.email || '').trim().toLowerCase(), dob = String(input.dob || '');
    if (name.length < 1 || name.length > 80 || /[<>\x00-\x1f]/.test(name)) fail('Enter your name (up to 80 characters).');
    if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) fail('Enter a valid email address.');
    const date = new Date(dob + 'T00:00:00Z');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dob) || !Number.isFinite(+date) || date.toISOString().slice(0,10) !== dob || dob < '1900-01-01' || dob > new Date().toISOString().slice(0,10)) fail('Enter a valid date of birth.');
    return once(input.requestId, 'register', { name, email, dob }, () => {
      // Reuse the oldest matching pass without changing paid credits or rewards.
      const normalizeName = value => value.trim().replace(/\s+/g,' ').normalize('NFKC').toLowerCase();
      const existing = db.prepare('SELECT id,token,name FROM game_players WHERE email=? AND dob=? ORDER BY rowid').all(email,dob).find(p=>normalizeName(p.name)===normalizeName(name));
      if (existing) return { ...view(existing.id), token: existing.token };
      const id = randomUUID(), token = 'MOMENTS-' + randomBytes(24).toString('hex');
      db.prepare('INSERT INTO game_players(id,token,name,email,dob,created) VALUES (?,?,?,?,?,?)').run(id,token,name,email,dob,new Date().toISOString());
      audit(id,'registered',{}); return { ...view(id), token };
    });
  }
  function deletePlayer(input) {
    checkPin(input.pin);
    if(input.confirmDelete!==true)fail('Confirm permanent deletion of this registration.');
    return once(input.requestId,'delete-player',{playerId:input.playerId},()=>{
      const p=player(input.playerId), owned=rounds(p.id);
      if(owned.some(r=>['active','extension_active'].includes(r.state)))fail('Stop and reset the active game before deleting this registration.',409);
      // Invalidate cached responses too, so old request retries cannot revive the deleted QR.
      const references=[p.id,p.token,...owned.map(r=>r.id)].map(v=>JSON.stringify(v));
      for(const a of db.prepare('SELECT id,response FROM game_actions').all())
        if(references.some(v=>a.response.includes(v)))db.prepare('DELETE FROM game_actions WHERE id=?').run(a.id);
      db.prepare('DELETE FROM game_runs WHERE player_id=?').run(p.id);
      db.prepare('DELETE FROM game_rounds WHERE player_id=?').run(p.id);
      db.prepare('DELETE FROM game_audit WHERE player_id=?').run(p.id);
      db.prepare('DELETE FROM game_players WHERE id=?').run(p.id);
      audit(null,'registration-deleted',{playerId:p.id});
      return {deleted:true,playerId:p.id};
    });
  }
  function grant(input) {
    checkPin(input.pin);
    const { playerId, count, kind, roundId, expectedPrice } = input;
    if (!['play','extension'].includes(kind) || !integer(count,1,20)) fail('Select 1–20 chances or one extension.');
    return once(input.requestId, 'grant', { playerId, count, kind, roundId: roundId || null, expectedPrice }, () => {
      player(playerId);
      let unitPrice = settings().playPrice;
      if (kind === 'extension') {
        const r = db.prepare('SELECT * FROM game_rounds WHERE id=? AND player_id=?').get(roundId,playerId);
        if (count !== 1 || !r || r.state !== 'eligible' || r.photos >= 2) fail('This chance is not eligible for extra shots.',409);
        unitPrice = JSON.parse(r.rules).extensionPrice;
        db.prepare("UPDATE game_rounds SET state='extension_ready',rules=? WHERE id=?").run(JSON.stringify({...JSON.parse(r.rules),extraShots:3}),roundId);
      } else db.prepare('UPDATE game_players SET credits=credits+? WHERE id=?').run(count,playerId);
      if (expectedPrice !== unitPrice * count) fail('Price changed. Review the payment amount again.',409);
      audit(playerId, 'manual-payment', { kind, count, amount: expectedPrice, currency:'CAD', roundId });
      return view(playerId);
    });
  }
  function claim(input) {
    const { token, kiosk, requestId } = input;
    if (typeof kiosk !== 'string' || !/^[a-zA-Z0-9_-]{1,64}$/.test(kiosk)) fail('Invalid kiosk ID.');
    return once(requestId,'claim',{token,kiosk},() => {
      const p = db.prepare('SELECT * FROM game_players WHERE token=?').get(String(token));
      if (!p) fail('Scan your Moments player QR.',404);
      if (db.prepare("SELECT id FROM game_rounds WHERE (player_id=? OR kiosk=?) AND state IN ('active','extension_active')").get(p.id,kiosk)) fail('A chance is already in progress. Ask the host to recover it.',409);
      let r = db.prepare("SELECT * FROM game_rounds WHERE player_id=? AND state='extension_ready' ORDER BY rowid LIMIT 1").get(p.id);
      const extension = !!r;
      if (r) { db.prepare("UPDATE game_rounds SET state='extension_active',kiosk=?,run_id=? WHERE id=?").run(kiosk,requestId,r.id); }
      else {
        if (p.credits < 1) fail('Registered! Visit the photobooth host to purchase a chance.',402);
        db.prepare('UPDATE game_players SET credits=credits-1 WHERE id=?').run(p.id);
        const id = randomUUID();
        db.prepare("INSERT INTO game_rounds(id,player_id,kiosk,state,rules,created) VALUES (?,?,?,'active',?,?)").run(id,p.id,kiosk,JSON.stringify(settings()),new Date().toISOString());
        r = db.prepare('SELECT * FROM game_rounds WHERE id=?').get(id);
        db.prepare('UPDATE game_rounds SET run_id=? WHERE id=?').run(requestId,id);
      }
      const rules = JSON.parse(r.rules);
      if(extension && rules.extraShots!==3){rules.extraShots=3;db.prepare('UPDATE game_rounds SET rules=? WHERE id=?').run(JSON.stringify(rules),r.id);}
      db.prepare("INSERT INTO game_runs(id,round_id,player_id,kiosk,extension,phase,scanned_at) VALUES (?,?,?,?,?,'scanned',?)").run(requestId,r.id,p.id,kiosk,extension?1:0,new Date().toISOString());
      audit(p.id,'started',{roundId:r.id,kiosk,extension});
      return { roundId:r.id, runId:requestId, name:p.name, extension, baseScore:extension?(r.base_score||0):0, shots: extension ? 3 : rules.baseShots, rules, player:view(p.id) };
    });
  }
  function result(input) {
    const { roundId, runId, kiosk, extension, attempts, made, score, grades } = input;
    return once(input.requestId,'result',{roundId,runId,kiosk,extension,attempts,made,score,...(Array.isArray(grades)&&grades.length?{grades}:{})},() => {
      const r = db.prepare('SELECT * FROM game_rounds WHERE id=?').get(roundId);
      if (!r || r.kiosk !== kiosk) fail('Unknown game session.',404);
      if(r.run_id !== runId) fail('This game attempt was recovered or replaced. Ask the host.',409);
      const rules = JSON.parse(r.rules), shots = extension ? rules.extraShots : rules.baseShots;
      if (typeof extension !== 'boolean' || attempts !== shots || !integer(made,0,shots) || !integer(score,0,shots*90)) fail('Invalid completed round.');
      if(rules.scoringVersion>=2){
        if(!Array.isArray(grades) || grades.length!==shots || grades.some(g=>!integer(g,0,gradePoints.length-1)) ||
          grades.reduce((n,g)=>n+gradePoints[g],0)!==score || grades.filter(g=>g<=3).length!==made) fail('Invalid shot grades or score.');
      }else if(score!==made*10)fail('Invalid completed round.');
      const previous = extension ? r.extra_score : r.base_score;
      if (previous !== null) {
        if (previous !== score || (extension ? r.extra_made : r.base_made) !== made) fail('Conflicting result.',409);
        return roundView(r);
      }
      if (r.state !== (extension ? 'extension_active' : 'active')) fail('Round is not active.',409);
      if (extension) db.prepare("UPDATE game_rounds SET extra_score=?,extra_made=?,photos=2,reward_reason='extension',state='complete' WHERE id=?").run(score,made,roundId);
      else {
        let photos = score >= rules.bonusScore ? 2 : 1, reason=photos===2?'score':'minimum';
        const completed=rounds(r.player_id).filter(x=>x.base_score!==null);
        // Assign the pair guarantee to this play, so a paid extension always adds a real photo.
        if(completed.length%2===1 && completed[completed.length-1].photos===1 && photos===1){photos=2;reason='two-play-guarantee';}
        db.prepare('UPDATE game_rounds SET base_score=?,base_made=?,photos=?,state=?,reward_reason=? WHERE id=?').run(score,made,photos,photos===2?'complete':'eligible',reason,roundId);
      }
      db.prepare("UPDATE game_runs SET phase='completed',finished_at=?,last_seen=?,attempts=?,made=?,score=? WHERE id=?").run(new Date().toISOString(),new Date().toISOString(),attempts,made,score,runId);
      audit(r.player_id,'result',{roundId,extension,score});
      return roundView(db.prepare('SELECT * FROM game_rounds WHERE id=?').get(roundId));
    });
  }
  function redeem(input) {
    checkPin(input.pin);
    return once(input.requestId,'redeem',{playerId:input.playerId,count:input.count},() => {
      if (!integer(input.count,1,100) || balance(input.playerId).available < input.count) fail('Not enough earned photos.',409);
      db.prepare('UPDATE game_players SET redeemed=redeemed+? WHERE id=?').run(input.count,input.playerId);
      audit(input.playerId,'photos-redeemed',{count:input.count}); return view(input.playerId);
    });
  }
  function recover(input) {
    checkPin(input.pin);
    return once(input.requestId,'recover',{roundId:input.roundId},() => {
      const r = db.prepare('SELECT * FROM game_rounds WHERE id=?').get(input.roundId);
      if (!r || !['active','extension_active'].includes(r.state)) fail('No active round to recover.',409);
      // Operator confirms abandoned play. Device must be stopped before this action.
      if (r.state === 'active') { db.prepare("UPDATE game_rounds SET state='cancelled' WHERE id=?").run(r.id); db.prepare('UPDATE game_players SET credits=credits+1 WHERE id=?').run(r.player_id); }
      else db.prepare("UPDATE game_rounds SET state='extension_ready',run_id=? WHERE id=?").run(randomUUID(),r.id);
      db.prepare("UPDATE game_runs SET phase='recovered',finished_at=? WHERE id=?").run(new Date().toISOString(),r.run_id);
      audit(r.player_id,'recovered',{roundId:r.id}); return view(r.player_id);
    });
  }
  function configure(input) {
    checkPin(input.pin);
    const next = { ...settings() };
    for (const key of ['playPrice','extensionPrice','baseShots','extraShots','bonusScore','difficulty','resultsTimeoutSeconds','shotCountdownSeconds']) if (input[key] !== undefined) next[key] = input[key];
    if(!integer(next.resultsTimeoutSeconds,1,60) || !integer(next.shotCountdownSeconds,1,10))fail('Results timeout must be 1–60 seconds and shot countdown 1–10 seconds.');
    if(!integer(next.difficulty,0,2))fail('Choose Easy, Normal or Hard difficulty.');
    if (!integer(next.playPrice,0,100000) || !integer(next.extensionPrice,0,100000) || !integer(next.baseShots,1,30) || next.extraShots!==3 || !integer(next.bonusScore,1,next.baseShots*90)) fail('Check prices, shot counts and reward threshold. Extensions are exactly 3 shots; the target cannot exceed 90 points per base shot.');
    if (input.title !== undefined) { next.title=String(input.title).trim(); if (!next.title || next.title.length>60 || /[<>]/.test(next.title)) fail('Invalid game title.'); }
    if (input.newPin && !/^\d{4,8}$/.test(input.newPin)) fail('PIN must have 4–8 digits.');
    db.transaction(() => {
      db.prepare('UPDATE game_settings SET json=? WHERE id=1').run(JSON.stringify(next));
      if (input.newPin) { const salt=randomBytes(16).toString('hex'); db.prepare('UPDATE game_settings SET salt=?,pin_hash=? WHERE id=1').run(salt,hashPin(input.newPin,salt)); }
      audit(null,'settings',next);
    }).immediate();
    return next;
  }
  function resetRun(input) {
    const {roundId,runId,kiosk}=input;
    return once(input.requestId,'kiosk-reset',{roundId,runId,kiosk},()=>{
      const r=db.prepare('SELECT * FROM game_rounds WHERE id=?').get(roundId);
      if(!r || r.kiosk!==kiosk || r.run_id!==runId)fail('This attempt was already replaced. Ask the host to check recovery.',409);
      if(!['active','extension_active'].includes(r.state))return {reset:true,refunded:false,round:roundView(r)};
      if(r.state==='active'){
        db.prepare("UPDATE game_rounds SET state='cancelled' WHERE id=?").run(r.id);
        db.prepare('UPDATE game_players SET credits=credits+1 WHERE id=?').run(r.player_id);
      }else db.prepare("UPDATE game_rounds SET state='extension_ready',run_id=? WHERE id=?").run(randomUUID(),r.id);
      db.prepare("UPDATE game_runs SET phase='recovered',finished_at=? WHERE id=?").run(new Date().toISOString(),runId);
      audit(r.player_id,'kiosk-reset',{roundId,runId,kiosk,restored:r.state==='active'?'base-credit':'extension'});
      return {reset:true,refunded:r.state==='active',player:view(r.player_id)};
    });
  }
  function progress(input) {
    const {runId,roundId,kiosk,phase}=input;
    return db.transaction(()=>{
      const r=db.prepare('SELECT * FROM game_rounds WHERE id=?').get(roundId);
      if(!r || r.kiosk!==kiosk || r.run_id!==runId || !['active','extension_active'].includes(r.state))fail('Game attempt is no longer active.',409);
      const run=db.prepare('SELECT * FROM game_runs WHERE id=?').get(runId);
      if(!run)fail('Game tracking unavailable for this older attempt.',409);
      if(!['preparing','playing','awaiting_result'].includes(phase))fail('Invalid game progress.');
      const rank={scanned:0,preparing:1,playing:2,awaiting_result:3};
      if(rank[phase]<rank[run.phase])return {tracked:true,changed:false};
      const now=new Date().toISOString();
      db.prepare('UPDATE game_runs SET phase=?,last_seen=?,started_at=COALESCE(started_at,?) WHERE id=?').run(phase,now,phase==='playing'||phase==='awaiting_result'?now:null,runId);
      if(phase!==run.phase)audit(r.player_id,'game-'+phase,{roundId,runId,kiosk});
      return {tracked:true,changed:phase!==run.phase,presence:{runId,lastSeen:now}};
    }).immediate();
  }
  const runScoreColumns = `CASE WHEN g.phase='completed' THEN CASE WHEN g.extension=1 THEN r.base_score ELSE g.score END END AS baseScore,
    CASE WHEN g.phase='completed' THEN CASE WHEN g.extension=1 THEN r.base_score+g.score ELSE g.score END END AS combinedScore`;
  function report() {
    const runs=db.prepare(`SELECT g.*,p.name,${runScoreColumns} FROM game_runs g JOIN game_players p ON p.id=g.player_id LEFT JOIN game_rounds r ON r.id=g.round_id ORDER BY g.scanned_at DESC`).all();
    const payments=db.prepare("SELECT detail FROM game_audit WHERE kind='manual-payment'").all().map(a=>JSON.parse(a.detail));
    const totals=db.prepare('SELECT COUNT(*) players,COALESCE(SUM(credits),0) creditsReady,COALESCE(SUM(redeemed),0) redeemed FROM game_players').get();
    const rewards=db.prepare('SELECT COALESCE(SUM(photos),0) earned,COUNT(*) completedChances FROM game_rounds WHERE base_score IS NOT NULL').get();
    const done=runs.filter(r=>r.phase==='completed');
    return {...totals,...rewards,available:rewards.earned-totals.redeemed,revenue:payments.reduce((n,p)=>n+p.amount,0),creditsGranted:payments.filter(p=>p.kind==='play').reduce((n,p)=>n+p.count,0),extensionsSold:payments.filter(p=>p.kind==='extension').reduce((n,p)=>n+p.count,0),scans:runs.length,completedRuns:done.length,recovered:runs.filter(r=>r.phase==='recovered').length,averageScore:done.length?Math.round(done.reduce((n,r)=>n+r.score,0)/done.length):0,baskets:done.reduce((n,r)=>n+r.made,0),shots:done.reduce((n,r)=>n+r.attempts,0),live:runs.filter(r=>!['completed','recovered'].includes(r.phase)),recent:runs.slice(0,200)};
  }
  return { settings, register, deletePlayer, grant, claim, result, redeem, recover, resetRun, configure, view, progress, report,
    list: (query='') => {
      query=String(query).trim().slice(0,254);
      const rows=query?db.prepare('SELECT id FROM game_players WHERE name LIKE ? OR email LIKE ? OR token=? ORDER BY rowid DESC LIMIT 500').all('%'+query+'%','%'+query+'%',query):db.prepare('SELECT id FROM game_players ORDER BY rowid DESC LIMIT 500').all();
      return rows.map(p=>({...view(p.id,true),rounds:rounds(p.id).map(roundView),timeline:db.prepare('SELECT kind,detail,created FROM game_audit WHERE player_id=? ORDER BY rowid DESC').all(p.id),runs:db.prepare(`SELECT g.*,${runScoreColumns} FROM game_runs g LEFT JOIN game_rounds r ON r.id=g.round_id WHERE g.player_id=? ORDER BY g.scanned_at DESC`).all(p.id)}));
    },
    status: token => { const p=db.prepare('SELECT id FROM game_players WHERE token=?').get(token); if(!p) fail('Player not found.',404); return view(p.id); },
    history: () => db.prepare('SELECT * FROM game_audit ORDER BY rowid DESC LIMIT 100').all() };
}
