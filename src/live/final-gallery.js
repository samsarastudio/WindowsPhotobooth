import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';

export function registerFinalGallery({app,db,owned,event,features,requireFeature,base,data,now,wrap,fail}) {
  if(!db.prepare('PRAGMA table_info(events)').all().some(c=>c.name==='gallery_released'))db.exec('ALTER TABLE events ADD COLUMN gallery_released INTEGER NOT NULL DEFAULT 0');
  const eligible=e=>e.status!=='draft'&&e.visibility==='all'&&e.reveal<=now();
  const released=req=>{const e=event(req);if(!e.gallery_released||!eligible(e))throw fail(404,'This gallery has not been released.');return e;};
  const info=e=>({released:!!e.gallery_released,available:!!e.gallery_released&&eligible(e),url:`${base}/gallery/${e.slug}`});
  app.get('/api/events/:slug/final-gallery',wrap((req,res)=>res.json(info(owned(req)))));
  app.patch('/api/events/:slug/final-gallery',wrap((req,res)=>{
    const e=owned(req);if(typeof req.body.released!=='boolean')throw fail(400,'Choose whether to release the gallery.');
    if(req.body.released&&!eligible(e))throw fail(409,'Publish or close the event, reveal its photos, and set visibility to everyone before releasing the gallery.');
    db.prepare('UPDATE events SET gallery_released=? WHERE id=?').run(Number(req.body.released),e.id);
    res.json(info({...e,gallery_released:Number(req.body.released)}));
  }));
  app.get('/api/gallery/:slug',wrap((req,res)=>{
    const e=released(req),photos=db.prepare('SELECT id,created FROM photos WHERE event=? AND approved=1 AND source_visible=1 ORDER BY created ASC,id ASC').all(e.id);
    res.json({title:e.title,description:e.description,downloads:features().downloads,photos:photos.map(p=>({...p,url:`/api/gallery/${e.slug}/photos/${p.id}`}))});
  }));
  app.get('/api/gallery/:slug/photos/:photo',wrap(async(req,res)=>{
    const e=released(req),p=db.prepare('SELECT filename FROM photos WHERE event=? AND id=? AND approved=1 AND source_visible=1').get(e.id,req.params.photo);
    if(!p)throw fail(404,'Photo not available');
    if(req.query.download)requireFeature('downloads');
    const file=path.join(data,'photos',p.filename);
    if(!fs.existsSync(file))throw fail(404,'Photo not available');
    res.set('Cache-Control','no-store');
    if(req.query.thumb==='1')return res.type('jpeg').send(await sharp(await fs.promises.readFile(file)).rotate().resize({width:640,height:640,fit:'inside',withoutEnlargement:true}).jpeg({quality:80}).toBuffer());
    if(req.query.download)res.attachment(`${req.params.photo}.jpg`);
    res.sendFile(path.resolve(file));
  }));
}
