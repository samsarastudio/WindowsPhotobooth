import crypto from 'node:crypto';
import path from 'node:path';
import fs from 'node:fs';
import sharp from 'sharp';
import multer from 'multer';
const defaults = {title:'',overlay:'',columns:16,backdropOpacity:0.55,completedView:false,brandText:'',brandRevealEnabled:false,brandRevealSeconds:45,brandRevealHoldSeconds:6};

export function registerWall({ app, db, owned, features, now, base, data, root, wrap, fail }) {
  db.exec('CREATE TABLE IF NOT EXISTS live_walls(event TEXT PRIMARY KEY REFERENCES events(id) ON DELETE CASCADE,token TEXT UNIQUE NOT NULL,enabled INTEGER NOT NULL DEFAULT 0)');
  if (!db.prepare('PRAGMA table_info(live_walls)').all().some(c=>c.name==='config')) db.exec("ALTER TABLE live_walls ADD COLUMN config TEXT NOT NULL DEFAULT '{}'");
  const config = e => ({...defaults,...JSON.parse(db.prepare('SELECT config FROM live_walls WHERE event=?').get(e.id)?.config || '{}')});
  const asset = (e,kind) => db.prepare('SELECT * FROM assets WHERE event=? AND kind=?').get(e.id, 'wall-'+kind);
  const enabled = () => { if (!features().mosaic) throw fail(403, 'Mosaic walls are disabled by the administrator'); };
  const settings = e => {
    const row = db.prepare('SELECT * FROM live_walls WHERE event=?').get(e.id);
    return { config:config(e), hasBackdrop:!!asset(e,'backdrop'), hasLogo:!!asset(e,'logo'), enabled: Boolean(row?.enabled), url: row ? `${base}/wall/${row.token}` : null, available: features().mosaic, visibility: e.visibility, status: e.status, reveal: e.reveal };
  };
  app.get('/api/events/:slug/wall', wrap((req, res) => res.json(settings(owned(req)))));
  app.patch('/api/events/:slug/wall', wrap((req, res) => {
    const e = owned(req);
    if (!req.body || Object.keys(req.body).some(k => !['enabled', 'rotate', 'config'].includes(k)) || (req.body.enabled !== undefined && typeof req.body.enabled !== 'boolean') || (req.body.rotate !== undefined && typeof req.body.rotate !== 'boolean')) throw fail(400, 'Provide boolean enabled or rotate settings');
    const cfg=config(e);
    if(req.body.config!==undefined){
      if(!req.body.config || typeof req.body.config!=='object' || Array.isArray(req.body.config))throw fail(400,'Invalid wall settings');
      for(const [k,v] of Object.entries(req.body.config)){
        if(!Object.hasOwn(defaults,k) || typeof v!==typeof defaults[k])throw fail(400,'Invalid wall setting: '+k);
        if(typeof v==='string' && v.length>120)throw fail(400,'Wall text must be 120 characters or less');
        const range={columns:[8,28],backdropOpacity:[0,1],brandRevealSeconds:[10,600],brandRevealHoldSeconds:[3,30]}[k];
        if(range&&(!Number.isFinite(v)||v<range[0]||v>range[1]||(k!=='backdropOpacity'&&!Number.isInteger(v))))throw fail(400,'Invalid range for '+k);
        cfg[k]=v;
      }
    }
    const old = db.prepare('SELECT * FROM live_walls WHERE event=?').get(e.id);
    const active = req.body.enabled ?? Boolean(old?.enabled);
    if (active) { enabled(); if (e.visibility !== 'all') throw fail(400, 'Set guest visibility to everyone before enabling a shared mosaic wall'); }
    const token = !old || req.body.rotate ? crypto.randomBytes(32).toString('base64url') : old.token;
    db.prepare('INSERT INTO live_walls(event,token,enabled,config) VALUES(?,?,?,?) ON CONFLICT(event) DO UPDATE SET token=excluded.token,enabled=excluded.enabled,config=excluded.config').run(e.id, token, Number(active),JSON.stringify(cfg));
    res.json(settings(e));
  }));
  const upload=multer({storage:multer.memoryStorage(),limits:{fileSize:8*1024*1024,files:1,fields:0}}).single('photo');
  const authorizeAsset=(req,_res,next)=>{try{owned(req);if(!['backdrop','logo'].includes(req.params.kind))throw fail(400,'Invalid wall asset');next();}catch(err){next(err);}};
  app.post('/api/events/:slug/wall/assets/:kind',authorizeAsset,upload,wrap(async(req,res)=>{
    const e=owned(req);if(!req.file)throw fail(400,'Choose an image');
    let bytes;try{bytes=await sharp(req.file.buffer,{limitInputPixels:24000000}).rotate().resize({width:1920,height:1920,fit:'inside',withoutEnlargement:true}).png().toBuffer();}catch{throw fail(400,'Choose a valid image (up to 24 megapixels)');}
    owned(req);const filename=crypto.randomUUID()+'.png';const old=asset(e,req.params.kind);
    fs.writeFileSync(path.join(data,'assets',filename),bytes);
    db.prepare('INSERT OR REPLACE INTO assets VALUES(?,?,?)').run(e.id,'wall-'+req.params.kind,filename);
    if(old)fs.rmSync(path.join(data,'assets',old.filename),{force:true});res.json(settings(e));
  }));
  app.delete('/api/events/:slug/wall/assets/:kind',authorizeAsset,wrap((req,res)=>{
    const e=owned(req),old=asset(e,req.params.kind);db.prepare('DELETE FROM assets WHERE event=? AND kind=?').run(e.id,'wall-'+req.params.kind);
    if(old)fs.rmSync(path.join(data,'assets',old.filename),{force:true});res.json(settings(e));
  }));
  const access = req => {
    enabled();
    const e = db.prepare('SELECT e.* FROM events e JOIN live_walls w ON w.event=e.id WHERE w.token=? AND w.enabled=1').get(req.params.token);
    if (!e || e.status === 'draft' || e.visibility !== 'all') throw fail(404, 'This mosaic wall is not available');
    return e;
  };
  app.get('/api/wall/:token', wrap((req, res) => {
    const e = access(req); const revealed = e.reveal <= now();
    const photos = revealed ? db.prepare('SELECT id FROM photos WHERE event=? AND approved=1 AND source_visible=1 ORDER BY created DESC,id DESC LIMIT 200').all(e.id) : [];
    res.set('X-Robots-Tag', 'noindex, nofollow');
    const cfg=config(e);
    res.json({ config:{...cfg,backdropUrl:asset(e,'backdrop')?`/api/wall/${req.params.token}/assets/backdrop?v=${asset(e,'backdrop').filename}`:null,logoUrl:asset(e,'logo')?`/api/wall/${req.params.token}/assets/logo?v=${asset(e,'logo').filename}`:null}, title: cfg.title || e.title, revealed, reveal: e.reveal, server_time: now(), total: revealed ? db.prepare('SELECT count(*) n FROM photos WHERE event=? AND approved=1 AND source_visible=1').get(e.id).n : 0, photos: photos.map(p => ({ id: p.id, url: `/api/wall/${req.params.token}/photos/${p.id}/image` })) });
  }));
  app.get('/api/wall/:token/assets/:kind',wrap((req,res)=>{
    const e=access(req);if(!['backdrop','logo'].includes(req.params.kind))throw fail(404,'Image not found');
    const a=asset(e,req.params.kind);if(!a)throw fail(404,'Image not found');res.type('png').send(fs.readFileSync(path.join(data,'assets',a.filename)));
  }));
  app.get('/api/wall/:token/photos/:photo/image', wrap(async (req, res) => {
    const e = access(req);
    const p = db.prepare('SELECT * FROM photos WHERE id=? AND event=? AND approved=1 AND source_visible=1').get(req.params.photo, e.id);
    if (e.reveal > now() || !p) throw fail(404, 'Photo not available');
    const bytes = await sharp(fs.readFileSync(path.join(data, 'photos', p.filename))).resize({ width: 900, height: 900, fit: 'inside', withoutEnlargement: true }).jpeg({ quality: 82 }).toBuffer();
    // Recheck access after asynchronous image work in case the wall was revoked.
    const current = access(req);
    if (current.reveal > now() || !db.prepare('SELECT 1 FROM photos WHERE id=? AND event=? AND approved=1 AND source_visible=1').get(p.id, current.id)) throw fail(404, 'Photo not available');
    res.set('X-Robots-Tag', 'noindex, nofollow').type('jpeg').send(bytes);
  }));
  app.get('/wall/:token', wrap((req, res) => {
    try { access(req); } catch (err) { if (![403,404].includes(err.status)) throw err; res.status(err.status); }
    res.set('X-Robots-Tag', 'noindex, nofollow'); res.sendFile(path.join(root, 'live-public/wall.html'));
  }));
}
