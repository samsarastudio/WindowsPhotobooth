import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';

// Read-only integration. Gallery credentials, database and original files are never touched.
export function registerPhotobooth({app,db,mustAdmin,event,features,data,wrap,fail,url}) {
  function parseOrigin(value){
    let candidate;try{candidate=new URL(value);}catch{throw fail(400,'Enter the Moments Gallery server address');}
    if(!['http:','https:'].includes(candidate.protocol)||candidate.username||candidate.password||candidate.pathname.split('/').filter(Boolean).length>1||candidate.search||candidate.hash)throw fail(400,'Paste a Moments gallery URL or server address without a query or credentials');
    return candidate;
  }
  const saved=db.prepare("SELECT value FROM live_settings WHERE key='photoboothOrigin'").get()?.value;
  let origin=(saved||url)?parseOrigin(saved||url):null;
  db.exec(`CREATE TABLE IF NOT EXISTS live_booth_links(event TEXT PRIMARY KEY REFERENCES events(id) ON DELETE CASCADE,slug TEXT NOT NULL,enabled INTEGER NOT NULL DEFAULT 1,last_sync INTEGER NOT NULL DEFAULT 0,error TEXT NOT NULL DEFAULT '');
    CREATE TABLE IF NOT EXISTS live_booth_imports(event TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,slug TEXT NOT NULL,source_id TEXT NOT NULL,photo TEXT REFERENCES photos(id) ON DELETE SET NULL,PRIMARY KEY(event,slug,source_id));`);
  if(!db.prepare('PRAGMA table_info(live_booth_links)').all().some(c=>c.name==='variants'))db.exec(`ALTER TABLE live_booth_links ADD COLUMN variants TEXT NOT NULL DEFAULT '["framed","ai","original"]'`);
  if(!db.prepare('PRAGMA table_info(live_booth_imports)').all().some(c=>c.name==='variant'))db.exec("ALTER TABLE live_booth_imports ADD COLUMN variant TEXT NOT NULL DEFAULT 'unknown'");
  const chosen=source=>JSON.parse(source.variants);
  function applyTypes(e,source){
    const rows=db.prepare('SELECT photo,variant FROM live_booth_imports WHERE event=? AND slug=?').all(e.id,source.slug);
    for(const row of rows)if(row.photo)db.prepare('UPDATE photos SET source_visible=? WHERE id=?').run(Number(chosen(source).includes(row.variant)||(row.variant==='unknown'&&chosen(source).length===3)),row.photo);
  }
  let stopped=false;
  const busy=new Set();
  const enabled=()=>origin && features().photoboothGallery;
  async function read(route,limit=8*1024*1024,server=origin) {
    const target=new URL(route,server);
    if(target.origin!==server.origin) throw fail(502,'Invalid gallery media address');
    const response=await fetch(target,{redirect:'error',signal:AbortSignal.timeout(15000)});
    if(!response.ok) throw fail(502,'Photobooth gallery is unavailable or this album has expired');
    const chunks=[];let size=0;
    for await(const chunk of response.body) {size+=chunk.length;if(size>limit)throw fail(502,'Gallery response exceeds the import size limit');chunks.push(chunk);}
    return Buffer.concat(chunks);
  }
  const json=async (route,server=origin)=>JSON.parse((await read(route,8*1024*1024,server)).toString());
  async function catalog(server=origin){const result=await json('/api/wall',server);if(!result.ok||!Array.isArray(result.sessions))throw fail(502,'Photobooth gallery is unavailable');return result.sessions.filter(s=>typeof s.slug==='string').map(s=>({slug:s.slug,title:String(s.title||s.slug)}));}
  const link=e=>db.prepare('SELECT * FROM live_booth_links WHERE event=?').get(e.id)||null;
  async function sync(e) {
    if(!enabled())throw fail(503,'Photobooth connection is disabled or not configured');
    if(busy.has(e.id))throw fail(409,'This event is already syncing');
    const source=link(e);if(!source?.enabled)throw fail(400,'Connect a photobooth album first');
    busy.add(e.id);let imported=0;
    const current=()=>!stopped&&enabled()&&link(e)?.enabled&&link(e)?.slug===source.slug;
    try {
      const result=await json(`/api/sessions/${encodeURIComponent(source.slug)}?variants=${chosen(source).join(",")}`);
      if(!result.ok||result.session?.slug!==source.slug||!Array.isArray(result.session.photos))throw fail(502,'Invalid gallery album');
      for(const p of result.session.photos) {
        if(!current()||imported>=50)break;
        if(typeof p.id!=='string'||p.id.length>200||p.processStatus==='processing'||['physical','magnet-source'].includes(p.variant))continue;
        const previous=db.prepare('SELECT photo FROM live_booth_imports WHERE event=? AND slug=? AND source_id=?').get(e.id,source.slug,p.id);
        if(previous){db.prepare('UPDATE live_booth_imports SET variant=? WHERE event=? AND slug=? AND source_id=?').run(p.variant||'unknown',e.id,source.slug,p.id);if(previous.photo)db.prepare('UPDATE photos SET source_visible=? WHERE id=?').run(Number(chosen(source).includes(p.variant)),previous.photo);continue;}
        if(!chosen(source).includes(p.variant))continue;
        // Accept only this album's media route, never arbitrary URLs from the upstream response.
        const media=new URL(p.url,origin);
        if(media.origin!==origin.origin||!media.pathname.startsWith(`/media/${encodeURIComponent(source.slug)}/`)||media.search||media.hash)throw fail(502,'Invalid gallery media address');
        const raw=await read(media.href,25*1024*1024);
        const bytes=await sharp(raw,{limitInputPixels:40000000}).rotate().resize({width:2400,height:2400,fit:'inside',withoutEnlargement:true}).jpeg({quality:88,mozjpeg:true}).toBuffer();
        if(!current())break;
        const id=crypto.randomUUID(),filename=id+'.jpg',file=path.join(data,'photos',filename);
        fs.writeFileSync(file,bytes);
        try {db.transaction(()=>{
          const fresh=db.prepare('SELECT moderation FROM events WHERE id=?').get(e.id);
          const guestId='photobooth-'+e.id;
          let guest=db.prepare('SELECT id FROM guests WHERE event=? AND id=?').get(e.id,guestId);
          if(!guest){guest={id:guestId};db.prepare('INSERT INTO guests VALUES(?,?,?,?,0,?)').run(guest.id,e.id,crypto.randomBytes(32).toString('hex'),'Photobooth',Date.now());}
          db.prepare('INSERT INTO photos(id,event,guest,filename,approved,favorite,created,request_id) VALUES(?,?,?,?,?,0,?,?)').run(id,e.id,guest.id,filename,fresh.moderation?0:1,Date.now(),id);
          db.prepare('INSERT INTO live_booth_imports VALUES(?,?,?,?,?)').run(e.id,source.slug,p.id,id,p.variant);
        })();}catch(err){fs.rmSync(file,{force:true});throw err;}
        imported++;
      }
      if(current())db.prepare("UPDATE live_booth_links SET last_sync=?,error='' WHERE event=?").run(Date.now(),e.id);
      return {imported,link:stopped?null:link(e)};
    } catch(err) {
      if(current())db.prepare('UPDATE live_booth_links SET error=? WHERE event=?').run('Sync failed. Check the gallery connection and album availability.',e.id);
      throw err;
    } finally {busy.delete(e.id);}
  }
  app.get('/api/admin/photobooth',wrap(async(req,res)=>{
    mustAdmin(req);const details={url:origin?.origin||'',suggestedSlug:db.prepare("SELECT value FROM live_settings WHERE key='photoboothSuggestedSlug'").get()?.value||'',enabled:Boolean(features().photoboothGallery)};const links=db.prepare('SELECT * FROM live_booth_links').all();
    if(!enabled())return res.json({...details,configured:Boolean(origin),available:false,sessions:[],links});
    try{res.json({...details,configured:true,available:true,sessions:await catalog(),links});}
    catch{res.json({...details,configured:true,available:false,sessions:[],links});}
  }));
  app.put('/api/admin/photobooth',wrap(async(req,res)=>{
    mustAdmin(req);const candidate=parseOrigin(req.body.url);
    const check=()=>{
      if(busy.size)throw fail(409,'Wait for current photo syncing to finish');

    };
    check();let sessions;
    try{sessions=await catalog(candidate);}catch{throw fail(502,'Cannot reach a Moments Gallery at this address. Check that its public gallery API is available from the Live server.');}
    if(origin&&candidate.origin!==origin.origin&&db.prepare('SELECT 1 FROM live_booth_imports LIMIT 1').get()) {
      // A local and public address may identify the same Gallery. Verify album identities before switching.
      for(const row of db.prepare('SELECT DISTINCT slug FROM live_booth_imports').all()) {
        let oldAlbum,newAlbum;
        try{[oldAlbum,newAlbum]=await Promise.all([json(`/api/sessions/${encodeURIComponent(row.slug)}`,origin),json(`/api/sessions/${encodeURIComponent(row.slug)}`,candidate)]);}catch{throw fail(409,'Cannot verify that both addresses identify the same Gallery. Keep the current address until both are available.');}
        if(!oldAlbum.session?.id||oldAlbum.session.id!==newAlbum.session?.id)throw fail(409,'This is a different Gallery. Existing imported albums must keep their source identity.');
      }
    }
    check();
    const suggestedSlug=decodeURIComponent(candidate.pathname.split('/').filter(Boolean)[0]||'');
    if(suggestedSlug&&!sessions.some(s=>s.slug===suggestedSlug))throw fail(400,'That gallery is not available. Check the link or its expiry.');
    db.prepare("INSERT INTO live_settings(key,value) VALUES('photoboothSuggestedSlug',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").run(suggestedSlug);
    db.prepare("INSERT INTO live_settings(key,value) VALUES('photoboothOrigin',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").run(candidate.origin);
    origin=candidate;res.json({configured:true,available:true,url:origin.origin,sessions});
  }));
  app.put('/api/admin/events/:slug/photobooth',wrap(async(req,res)=>{
    mustAdmin(req);const e=event(req);
    if(busy.has(e.id))throw fail(409,'Wait for the current sync to finish');
    if(!enabled())throw fail(503,'Photobooth connection is disabled or not configured');
    const variants=req.body.variants??['framed'];
    if(!Array.isArray(variants)||!variants.length||variants.some(v=>!['framed','ai','original'].includes(v))||new Set(variants).size!==variants.length)throw fail(400,'Choose Framed, AI or Original photo types');
    const sessions=await catalog();const selected=sessions.find(s=>s.slug===req.body.slug);
    if(!selected)throw fail(400,'Choose an available photobooth album');
    // Recheck the event after the network request, in case it was deleted meanwhile.
    event(req);
    if(busy.has(e.id))throw fail(409,'Wait for the current sync to finish');
    db.prepare("INSERT INTO live_booth_links(event,slug,variants) VALUES(?,?,?) ON CONFLICT(event) DO UPDATE SET slug=excluded.slug,variants=excluded.variants,enabled=1,last_sync=0,error=''").run(e.id,selected.slug,JSON.stringify(variants));
    applyTypes(e,link(e));
    res.json(await sync(e));
  }));
  app.post('/api/admin/events/:slug/photobooth/sync',wrap(async(req,res)=>{mustAdmin(req);res.json(await sync(event(req)));}));
  app.delete('/api/admin/events/:slug/photobooth',wrap((req,res)=>{mustAdmin(req);const e=event(req);db.prepare('UPDATE live_booth_links SET enabled=0 WHERE event=?').run(e.id);res.json({ok:true});}));
  const timer=setInterval(async()=>{
    if(stopped||!enabled())return;
    for(const e of db.prepare('SELECT e.* FROM events e JOIN live_booth_links l ON e.id=l.event WHERE l.enabled=1').all()) {
      if(stopped)break;
      try{await sync(e);}catch{/* Retain per-event error for the administrator; retry next minute. */}
    }
  },60000);
  timer.unref();
  return ()=>{stopped=true;clearInterval(timer);};
}
