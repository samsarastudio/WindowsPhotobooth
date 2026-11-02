import test from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import {createGameStore} from '../src/game-store.js';
test('Christmas only migrates the old stock title, preserving rules and later custom branding',()=>{
 const db=new Database(':memory:');try{
  createGameStore(db);
  const before={...JSON.parse(db.prepare('SELECT json FROM game_settings WHERE id=1').get().json),title:'HAUNTED HOOPS',playPrice:1700,bonusScore:300};
  db.prepare('UPDATE game_settings SET json=? WHERE id=1').run(JSON.stringify(before));
  db.prepare("DELETE FROM game_migrations WHERE id='christmas-brand-2026'").run();
  const store=createGameStore(db);assert.deepEqual(store.settings(),{...before,title:'JINGLE HOOPS'});
  db.prepare('UPDATE game_settings SET json=? WHERE id=1').run(JSON.stringify({...before,title:'My Event'}));
  assert.equal(createGameStore(db).settings().title,'My Event');
 }finally{db.close();}
});
