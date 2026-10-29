import { EventEmitter } from 'node:events';
import { Router } from 'express';
import QRCode from 'qrcode';
import { createGameStore } from '../game-store.js';
import { getDb } from '../db.js';
import { requireAdminPin, requireUploadToken } from '../auth.js';

export const gameRouter = Router(), adminGameRouter = Router();
let store;
const get = () => store || (store=createGameStore(getDb()));
const changes=new EventEmitter();changes.setMaxListeners(0);
const action = fn => async (req,res) => { try { const value=await fn(req);res.set('Cache-Control','no-store'); res.json({ok:true,...value});if(req.method==='POST' && req.path!=='/status' && value?.changed!==false)changes.emit('change');else if(value?.presence)changes.emit('presence',value.presence); } catch(e) { if(!e.status) console.error('[game]',e); res.status(e.status||500).json({ok:false,error:e.status?e.message:'Unable to complete this action. Please retry with the same request.'}); } };
const rates = new Map();
function rate(limit) { return (req,res,next) => {
  const key=req.ip+req.path, now=Date.now(); let row=rates.get(key);
  if(!row || now>row.until) { row={count:0,until:now+60000}; rates.set(key,row); }
  if(rates.size>10000) for(const [k,v] of rates) if(v.until<now) rates.delete(k);
  if(++row.count>limit) return res.status(429).json({ok:false,error:'Too many attempts. Wait one minute.'}); next();
}; }
gameRouter.get('/config', action(()=>({config:get().settings()})));
gameRouter.post('/register',rate(20),action(req=>({player:get().register(req.body)})));
gameRouter.post('/status',rate(60),action(req=>({player:get().status(String(req.body.token||''))})));
gameRouter.get('/registration-qr',async(req,res)=> { res.type('png').send(await QRCode.toBuffer(`${req.protocol}://${req.get('host')}/play`,{width:480,margin:3})); });
gameRouter.post('/qr',rate(60),async(req,res)=> { try { const token=String(req.body.token||''); get().status(token); res.type('png').send(await QRCode.toBuffer(token,{width:480,margin:3})); } catch { res.sendStatus(404); } });
gameRouter.post('/claim',requireUploadToken,action(req=>get().claim(req.body)));
gameRouter.post('/progress',requireUploadToken,action(req=>get().progress(req.body)));
gameRouter.post('/result',requireUploadToken,action(req=>({round:get().result(req.body)})));
gameRouter.post('/reset',requireUploadToken,action(req=>get().resetRun(req.body)));
adminGameRouter.use(rate(100),requireAdminPin);
adminGameRouter.get('/events',(req,res)=>{
  res.set({'Content-Type':'text/event-stream','Cache-Control':'no-cache, no-transform','Connection':'keep-alive','X-Accel-Buffering':'no'});res.flushHeaders();
  let queued=false;
  const send=()=>{if(!res.writableEnded){res.write('event: change\ndata: {}\n\n');res.flush?.();}};
  const changed=()=>{if(queued)return;queued=true;timer=setTimeout(()=>{queued=false;send();},150);};
  const presence=value=>{if(!res.writableEnded)res.write('event: presence\ndata: '+JSON.stringify(value)+'\n\n');};
  let timer;changes.on('change',changed);changes.on('presence',presence);send();
  const heartbeat=setInterval(()=>{if(!res.writableEnded)res.write(': heartbeat\n\n');},15000);
  req.on('close',()=>{clearTimeout(timer);clearInterval(heartbeat);changes.off('change',changed);changes.off('presence',presence);});
});
adminGameRouter.get('/',action(req=>({players:get().list(req.query.q),config:get().settings(),audit:get().history(),report:get().report()})));
adminGameRouter.get('/players/:id/qr',async(req,res)=>{try{const player=get().view(req.params.id,true);res.set('Cache-Control','no-store').type('png').send(await QRCode.toBuffer(player.token,{width:480,margin:3}));}catch(e){res.sendStatus(e.status||500);}});
adminGameRouter.post('/grant',action(req=>({player:get().grant(req.body)})));
adminGameRouter.post('/redeem',action(req=>({player:get().redeem(req.body)})));
adminGameRouter.post('/recover',action(req=>({player:get().recover(req.body)})));
adminGameRouter.post('/settings',action(req=>({config:get().configure(req.body)})));
