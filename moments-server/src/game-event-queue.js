import {randomUUID} from 'node:crypto';

// A phone reserves a turn; only the authenticated kiosk can consume it.
export function createEventQueue(db, {settings, view, claim, fail}) {
  db.exec(`CREATE TABLE IF NOT EXISTS game_queue (
    id TEXT PRIMARY KEY, player_id TEXT NOT NULL, kiosk TEXT NOT NULL,
    state TEXT NOT NULL, created INTEGER NOT NULL, expires INTEGER NOT NULL,
    ready INTEGER NOT NULL DEFAULT 0);
    CREATE UNIQUE INDEX IF NOT EXISTS game_queue_player ON game_queue(player_id) WHERE state IN ('waiting','called','playing');
    CREATE UNIQUE INDEX IF NOT EXISTS game_queue_called ON game_queue(kiosk) WHERE state='called';`);
  function expire() {
    db.prepare("UPDATE game_queue SET state='skipped',ready=0 WHERE state IN ('waiting','called') AND expires<?").run(Date.now());
  }
  function identity(token) {
    const p=db.prepare('SELECT * FROM game_players WHERE token=?').get(String(token||''));
    if(!p)fail('Player not found.',404);return p;
  }
  function kioskId(kiosk) {if(typeof kiosk!=='string'||!/^[a-zA-Z0-9_-]{1,64}$/.test(kiosk))fail('Invalid kiosk ID.');}
  function canJoin(id) {
    return !db.prepare("SELECT id FROM game_rounds WHERE player_id=? AND state IN ('active','extension_active')").get(id);
  }
  function ticket(q) {
    if(!q)return null;
    const position=q.state==='waiting'?db.prepare("SELECT COUNT(*) n FROM game_queue WHERE kiosk=? AND state IN ('waiting','called') AND rowid<=(SELECT rowid FROM game_queue WHERE id=?)").get(q.kiosk,q.id).n:0;
    const p=db.prepare('SELECT name FROM game_players WHERE id=?').get(q.player_id);
    return {id:q.id,kiosk:q.kiosk,state:q.state,ready:!!q.ready,expires:q.expires,position,name:p?.name.split(/\s+/)[0]||'Player',number:q.id.slice(0,4).toUpperCase()};
  }
  function status(id) {expire();return ticket(db.prepare('SELECT * FROM game_queue WHERE player_id=? ORDER BY rowid DESC LIMIT 1').get(id));}
  function join(input) {
    return db.transaction(()=>{
      if(!settings().eventMode)fail('Automatic event entry is not enabled.',409);
      const p=identity(input.token),kiosk=input.kiosk||'haunted-hoops-01';kioskId(kiosk);expire();
      if(!canJoin(p.id))fail('Visit the host for a paid retry. Your saved points stay on your player pass.',402);
      const current=db.prepare("SELECT * FROM game_queue WHERE player_id=? AND state IN ('waiting','called','playing')").get(p.id);
      if(current)return ticket(current);
      const id=randomUUID();db.prepare("INSERT INTO game_queue(id,player_id,kiosk,state,created,expires) VALUES (?,?,?,'waiting',?,?)").run(id,p.id,kiosk,Date.now(),Date.now()+600000);
      return status(p.id);
    }).immediate();
  }
  function ready(input) {
    return db.transaction(()=>{
      const p=identity(input.token);expire();
      const q=db.prepare("SELECT * FROM game_queue WHERE id=? AND player_id=? AND state='called'").get(input.queueId,p.id);
      if(!q)fail('Your invitation expired. Rejoin the queue to get another turn.',409);
      db.prepare('UPDATE game_queue SET ready=1 WHERE id=?').run(q.id);return status(p.id);
    }).immediate();
  }
  function next(input) {
    return db.transaction(()=>{
      kioskId(input.kiosk);expire();
      if(!settings().eventMode)return null;
      if(db.prepare("SELECT id FROM game_rounds WHERE kiosk=? AND state IN ('active','extension_active')").get(input.kiosk))return null;
      let q=db.prepare("SELECT * FROM game_queue WHERE kiosk=? AND state='called'").get(input.kiosk);
      if(!q){
        q=db.prepare("SELECT * FROM game_queue WHERE kiosk=? AND state='waiting' ORDER BY rowid LIMIT 1").get(input.kiosk);
        if(q){db.prepare("UPDATE game_queue SET state='called',expires=? WHERE id=?").run(Date.now()+settings().arrivalTimeoutSeconds*1000,q.id);q=db.prepare('SELECT * FROM game_queue WHERE id=?').get(q.id);}
      }
      return ticket(q);
    }).immediate();
  }
  function admit(input) {
    // claim owns the idempotency transaction. It checks the invitation within that transaction.
    const q=db.prepare('SELECT q.*,p.token FROM game_queue q JOIN game_players p ON p.id=q.player_id WHERE q.id=?').get(input.queueId);
    if(!q || q.kiosk!==input.kiosk)fail('Turn not found for this kiosk.',404);
    return claim({...input,token:q.token});
  }
  return {join,ready,next,admit,status,canJoin};
}
