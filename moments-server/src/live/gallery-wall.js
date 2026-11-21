import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

export function registerGalleryWall({app,db,mustAdmin,event,features,data,wrap,fail,now=Date.now,pollMs=5000}) {
 db.exec(`CREATE TABLE IF NOT EXISTS live_gallery_walls(event TEXT PRIMARY KEY,source TEXT NOT NULL,url TEXT NOT NULL,token TEXT NOT NULL,last_sync INTEGER NOT NULL DEFAULT 0,error TEXT NOT NULL DEFAULT '')`);
 for(const col of ['session_slug','session_id'])if(!db.prepare('PRAGMA table_info(live_gallery_walls)').all().some(c=>c.name===col))db.exec(`ALTER TABLE live_gallery_walls ADD COLUMN ${col} TEXT NOT NULL DEFAULT ''`);
 let stopped=false,sweeping=false;const busy=new Set();
 const get=id=>db.prepare('SELECT * FROM live_gallery_walls WHERE event=?').get(id);
 const publicLink=l=>l?{connected:Boolean(l.session_slug),hasToken:true,requiresSelection:!l.session_slug,url:l.url+(l.session_slug?'/'+encodeURIComponent(l.session_slug)+'/wall':''),sessionSlug:l.session_slug,lastSync:l.last_sync,error:l.error}: {connected:false};
 function destination(value){let u;try{u=new URL(value);}catch{throw fail(400,'Enter the Moments Gallery event link');}
  const parts=u.pathname.split('/').filter(Boolean).map(p=>decodeURIComponent(p));
  if(u.username||u.password||u.search||u.hash||parts.length>2||(parts.length===2&&parts[1]!=='wall')||!(u.protocol==='https:'||u.protocol==='http:'&&['localhost','127.0.0.1','[::1]'].includes(u.hostname)))throw fail(400,'Use an HTTPS Gallery event link, such as /your-event/wall');
  const slug=parts[0]==='wall'?'':parts[0]||'';
  if(slug&&!/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,127}$/.test(slug))throw fail(400,'Invalid Gallery event link');
  return {url:u.origin,slug};
 }
 async function catalog(req){
  const e=event(req),old=get(e.id),target=destination(req.body.url);
  if(old&&old.url!==target.url)throw fail(409,'Disconnect the current wall before choosing another server');
  const token=String(req.body.token||old?.token||'').trim();if(!token||token.length>2000)throw fail(400,'Enter the Moments Gallery upload token');
  const capability=await remote({...target,token},'/');
  if(capability.liveWallBridge<2||!Array.isArray(capability.sessions))throw fail(502,'Update Moments Gallery to enable event-specific wall connections');
  return {e,old,target,token,sessions:capability.sessions};
 }
 async function remote(link,route,method='GET',body){const headers={Authorization:'Bearer '+link.token};if(body&&!(body instanceof FormData))headers['Content-Type']='application/json';const r=await fetch(link.url+'/api/wall/live'+route,{method,headers,body:body instanceof FormData?body:body?JSON.stringify(body):undefined,redirect:'error',signal:AbortSignal.timeout(15000)});if(!r.ok)throw fail(502,`Moments wall returned HTTP ${r.status}. Check its server update and upload token.`);return r.json();}
 const eligible=e=>e&&features().mosaic&&e.status!=='draft'&&e.visibility==='all'&&e.reveal<=now();
 const rows=e=>eligible(e)?db.prepare(`SELECT p.* FROM photos p WHERE p.event=? AND p.approved=1 AND p.source_visible=1 AND NOT EXISTS(SELECT 1 FROM live_booth_imports i WHERE i.photo=p.id) ORDER BY p.created DESC LIMIT 4000`).all(e.id):[];
 async function sync(link){
  if(stopped||busy.has(link.event))return;busy.add(link.event);
  try{
   const e=db.prepare('SELECT * FROM events WHERE id=?').get(link.event),photos=link.session_slug?rows(e):[];
   const result=await remote(link,'/'+link.source,'PUT',{ids:photos.map(p=>p.id),sessionSlug:link.session_slug,sessionId:link.session_id});
   if(stopped)return;
   for(const id of result.missing.slice(0,50)){
    if(stopped)break;const p=rows(db.prepare('SELECT * FROM events WHERE id=?').get(link.event)).find(p=>p.id===id);if(!p)continue;
    const form=new FormData();form.append('photo',new Blob([fs.readFileSync(path.join(data,'photos',p.filename))]),p.filename);
    await remote(link,'/'+link.source+'/photos/'+id,'POST',form);
   }
   if(!stopped&&e&&!link.session_slug){db.prepare('UPDATE live_gallery_walls SET error=? WHERE event=?').run('Select a Gallery event to resume sharing. Global wall connections are disabled.',link.event);return;}
   if(!stopped){if(!e)db.prepare('DELETE FROM live_gallery_walls WHERE event=?').run(link.event);else db.prepare("UPDATE live_gallery_walls SET last_sync=?,error='' WHERE event=?").run(now(),link.event);}
  }catch(err){if(!stopped)db.prepare('UPDATE live_gallery_walls SET error=? WHERE event=?').run(err.message,link.event);}finally{busy.delete(link.event);}
 }
 app.get('/api/admin/events/:slug/gallery-wall',wrap((req,res)=>{mustAdmin(req);res.json(publicLink(get(event(req).id)));}));
 app.post('/api/admin/events/:slug/gallery-wall/catalog',wrap(async(req,res)=>{mustAdmin(req);const {target,sessions}=await catalog(req);res.json({sessions,suggestedSlug:target.slug});}));
 app.put('/api/admin/events/:slug/gallery-wall',wrap(async(req,res)=>{
  mustAdmin(req);const {e,old,target,token,sessions}=await catalog(req);
  if(busy.has(e.id))throw fail(409,'A wall sync is running. Try again shortly.');
  const selected=sessions.find(s=>s.slug===(req.body.sessionSlug||target.slug));
  if(!selected)throw fail(400,'Choose a specific Gallery event; the global wall cannot be linked');
  const current=get(e.id);
  if(current&&(current.url!==target.url||(current.session_id&&current.session_id!==selected.id)))throw fail(409,'Disconnect the current event wall before choosing another');
  event(req);
  const link={event:e.id,source:old?.source||crypto.randomUUID(),url:target.url,token,session_slug:selected.slug,session_id:selected.id};
  db.prepare('INSERT INTO live_gallery_walls(event,source,url,token,session_slug,session_id) VALUES(?,?,?,?,?,?) ON CONFLICT(event) DO UPDATE SET url=excluded.url,token=excluded.token,session_slug=excluded.session_slug,session_id=excluded.session_id').run(e.id,link.source,link.url,token,selected.slug,selected.id);
  await sync(link);res.json(publicLink(get(e.id)));
 }));
 app.delete('/api/admin/events/:slug/gallery-wall',wrap(async(req,res)=>{mustAdmin(req);const e=event(req);if(busy.has(e.id))throw fail(409,'A wall sync is running. Try again shortly.');const link=get(e.id);if(link){busy.add(e.id);try{await remote(link,'/'+link.source,'PUT',{ids:[]});db.prepare('DELETE FROM live_gallery_walls WHERE event=?').run(e.id);}finally{busy.delete(e.id);}}res.json({connected:false});}));
 const timer=setInterval(async()=>{if(stopped||sweeping)return;sweeping=true;try{for(const l of db.prepare('SELECT * FROM live_gallery_walls').all()){if(stopped)break;await sync(l);}}finally{sweeping=false;}},pollMs);timer.unref();
 return ()=>{stopped=true;clearInterval(timer);};
}
