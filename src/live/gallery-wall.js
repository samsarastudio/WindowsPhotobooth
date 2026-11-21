import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

export function registerGalleryWall({app,db,mustAdmin,event,features,data,wrap,fail,now=Date.now,pollMs=5000}) {
 db.exec(`CREATE TABLE IF NOT EXISTS live_gallery_walls(event TEXT PRIMARY KEY,source TEXT NOT NULL,url TEXT NOT NULL,token TEXT NOT NULL,last_sync INTEGER NOT NULL DEFAULT 0,error TEXT NOT NULL DEFAULT '')`);
 let stopped=false,sweeping=false;const busy=new Set();
 const get=id=>db.prepare('SELECT * FROM live_gallery_walls WHERE event=?').get(id);
 const publicLink=l=>l?{connected:true,url:l.url+'/wall',lastSync:l.last_sync,error:l.error}: {connected:false};
 function origin(value){let u;try{u=new URL(value);}catch{throw fail(400,'Enter the Moments wall URL');}if(u.username||u.password||u.search||u.hash||!['','/','/wall'].includes(u.pathname)||!(u.protocol==='https:'||u.protocol==='http:'&&['localhost','127.0.0.1','[::1]'].includes(u.hostname)))throw fail(400,'Use an HTTPS Moments server /wall URL');return u.origin;}
 async function remote(link,route,method='GET',body){const headers={Authorization:'Bearer '+link.token};if(body&&!(body instanceof FormData))headers['Content-Type']='application/json';const r=await fetch(link.url+'/api/wall/live'+route,{method,headers,body:body instanceof FormData?body:body?JSON.stringify(body):undefined,redirect:'error',signal:AbortSignal.timeout(15000)});if(!r.ok)throw fail(502,`Moments wall returned HTTP ${r.status}. Check its server update and upload token.`);return r.json();}
 const eligible=e=>e&&features().mosaic&&e.status!=='draft'&&e.visibility==='all'&&e.reveal<=now();
 const rows=e=>eligible(e)?db.prepare(`SELECT p.* FROM photos p WHERE p.event=? AND p.approved=1 AND p.source_visible=1 AND NOT EXISTS(SELECT 1 FROM live_booth_imports i WHERE i.photo=p.id) ORDER BY p.created DESC LIMIT 4000`).all(e.id):[];
 async function sync(link){
  if(stopped||busy.has(link.event))return;busy.add(link.event);
  try{
   const e=db.prepare('SELECT * FROM events WHERE id=?').get(link.event),photos=rows(e);
   const result=await remote(link,'/'+link.source,'PUT',{ids:photos.map(p=>p.id)});
   if(stopped)return;
   for(const id of result.missing.slice(0,50)){
    if(stopped)break;const p=rows(db.prepare('SELECT * FROM events WHERE id=?').get(link.event)).find(p=>p.id===id);if(!p)continue;
    const form=new FormData();form.append('photo',new Blob([fs.readFileSync(path.join(data,'photos',p.filename))]),p.filename);
    await remote(link,'/'+link.source+'/photos/'+id,'POST',form);
   }
   if(!stopped){if(!e)db.prepare('DELETE FROM live_gallery_walls WHERE event=?').run(link.event);else db.prepare("UPDATE live_gallery_walls SET last_sync=?,error='' WHERE event=?").run(now(),link.event);}
  }catch(err){if(!stopped)db.prepare('UPDATE live_gallery_walls SET error=? WHERE event=?').run(err.message,link.event);}finally{busy.delete(link.event);}
 }
 app.get('/api/admin/events/:slug/gallery-wall',wrap((req,res)=>{mustAdmin(req);res.json(publicLink(get(event(req).id)));}));
 app.put('/api/admin/events/:slug/gallery-wall',wrap(async(req,res)=>{
  mustAdmin(req);const e=event(req);if(busy.has(e.id))throw fail(409,'A wall sync is running. Try again shortly.');
  const old=get(e.id),url=origin(req.body.url),token=String(req.body.token||old?.token||'').trim();if(!token||token.length>2000)throw fail(400,'Enter the Moments Gallery upload token');
  if(old&&old.url!==url)throw fail(409,'Disconnect the current wall before choosing another');
  const link={event:e.id,source:old?.source||crypto.randomUUID(),url,token};
  if(!(await remote(link,'/')).liveWallBridge)throw fail(502,'Update Moments Gallery to enable Live wall connections');
  event(req);if(busy.has(e.id))throw fail(409,'A wall sync is running. Try again shortly.');
  db.prepare('INSERT INTO live_gallery_walls(event,source,url,token) VALUES(?,?,?,?) ON CONFLICT(event) DO UPDATE SET url=excluded.url,token=excluded.token').run(e.id,link.source,url,token);
  await sync(link);res.json(publicLink(get(e.id)));
 }));
 app.delete('/api/admin/events/:slug/gallery-wall',wrap(async(req,res)=>{mustAdmin(req);const e=event(req);if(busy.has(e.id))throw fail(409,'A wall sync is running. Try again shortly.');const link=get(e.id);if(link){busy.add(e.id);try{await remote(link,'/'+link.source,'PUT',{ids:[]});db.prepare('DELETE FROM live_gallery_walls WHERE event=?').run(e.id);}finally{busy.delete(e.id);}}res.json({connected:false});}));
 const timer=setInterval(async()=>{if(stopped||sweeping)return;sweeping=true;try{for(const l of db.prepare('SELECT * FROM live_gallery_walls').all()){if(stopped)break;await sync(l);}}finally{sweeping=false;}},pollMs);timer.unref();
 return ()=>{stopped=true;clearInterval(timer);};
}
