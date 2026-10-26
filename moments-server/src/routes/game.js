import { Router } from 'express';
import QRCode from 'qrcode';
import { createGameStore } from '../game-store.js';
import { getDb } from '../db.js';
import { requireAdminPin, requireUploadToken } from '../auth.js';

export const gameRouter = Router(), adminGameRouter = Router();
let store;
const get = () => store || (store=createGameStore(getDb()));
const action = fn => async (req,res) => { try { res.set('Cache-Control','no-store'); res.json({ok:true,...await fn(req)}); } catch(e) { if(!e.status) console.error('[game]',e); res.status(e.status||500).json({ok:false,error:e.status?e.message:'Unable to complete this action. Please retry with the same request.'}); } };
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
gameRouter.post('/result',requireUploadToken,action(req=>({round:get().result(req.body)})));
adminGameRouter.use(rate(100),requireAdminPin);
adminGameRouter.get('/',action(req=>({players:get().list(req.query.q),config:get().settings(),audit:get().history()})));
adminGameRouter.post('/grant',action(req=>({player:get().grant(req.body)})));
adminGameRouter.post('/redeem',action(req=>({player:get().redeem(req.body)})));
adminGameRouter.post('/recover',action(req=>({player:get().recover(req.body)})));
adminGameRouter.post('/settings',action(req=>({config:get().configure(req.body)})));
