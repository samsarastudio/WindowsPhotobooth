import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import multer from 'multer';
import sharp from 'sharp';
import PDFDocument from 'pdfkit';
import QRCode from 'qrcode';
import {themes,printDefaults,qrSizes,albumSizes} from '../../live-public/print-catalog.js';
import {printPlan,photoGeometry,keepsakeFlourish} from '../../live-public/print-layout.js';

export function registerPrintStudio({app,db,owned,requireFeature,base,data,root,wrap,fail,event,now=Date.now}){
  db.exec("CREATE TABLE IF NOT EXISTS live_print_designs(event TEXT PRIMARY KEY REFERENCES events(id) ON DELETE CASCADE,config TEXT NOT NULL)");
  const config=e=>{const saved=db.prepare('SELECT config FROM live_print_designs WHERE event=?').get(e.id);return {...printDefaults,...(saved?{qrLayout:'classic',...JSON.parse(saved.config)}:{})};};
  const logo=e=>db.prepare("SELECT filename FROM assets WHERE event=? AND kind='print-logo'").get(e.id);
  const instruction=e=>db.prepare("SELECT filename FROM assets WHERE event=? AND kind='print-instruction'").get(e.id);
  const instructionUrl=e=>instruction(e)?`/api/events/${e.slug}/print/instruction-image?v=${instruction(e).filename}`:'/print-themes/qr-instruction-phone.png';
  const logoUrl=e=>logo(e)?`/api/events/${e.slug}/print/logo?v=${logo(e).filename}`:null;
  const choices={qrLayout:['classic','pages','fold'],qrHeaderMode:['text','logo','none'],eventType:Object.keys(themes),theme:['auto',...Object.keys(themes)],border:['none','fine','double','rounded'],qrSize:[...Object.keys(qrSizes),'custom'],albumSize:[...Object.keys(albumSizes),'custom'],albumStyle:['themed','keepsake'],layout:['mosaic','compact','tiles','keepsake','editorial','hero','hero-right','duo','offset-duo','trio','panorama','gallery','grid'],photoFrame:['gold-line','none','rounded','glass','gold','botanical'],photoFit:['contain','cover'],order:['chronological','favorites','manual']};
  function validate(old,patch){
    if(!patch||typeof patch!=='object'||Array.isArray(patch))throw fail(400,'Provide design settings');
    const c={...old};
    for(const [k,v] of Object.entries(patch)){
      if(!Object.hasOwn(printDefaults,k))throw fail(400,'Unknown design setting: '+k);
      if(k==='selectedPhotos'){
        if(!Array.isArray(v)||v.length>300||v.some(id=>typeof id!=='string'||! /^[a-f0-9-]{36}$/.test(id))||new Set(v).size!==v.length)throw fail(400,'Choose up to 300 unique photos');
      }else if(typeof v!==typeof printDefaults[k])throw fail(400,'Invalid design setting: '+k);
      if(choices[k]&&!choices[k].includes(v))throw fail(400,'Invalid choice: '+k);
      const ranges={photosPerPage:[1,12],qrLogoScale:[25,400],qrWidth:[70,420],qrHeight:[70,594],albumWidth:[180,420],albumHeight:[120,297],photoLimit:[1,300],wordingOffset:[0,149],layoutOffset:[0,7]};
      if(ranges[k]&&(!Number.isFinite(v)||v<ranges[k][0]||v>ranges[k][1]||(['photosPerPage','photoLimit','wordingOffset','layoutOffset'].includes(k)&&!Number.isInteger(v))))throw fail(400,'Invalid range: '+k);
      if(typeof v==='string'&&v.length>({intro:1200,closing:400,customCaptions:12000,qrInstructions:160}[k]||120))throw fail(400,'Text is too long: '+k);
      if(k==='customCaptions'&&(v.split('\n').length>150||v.split('\n').some(line=>line.length>180)))throw fail(400,'Use up to 150 captions, each at most 180 characters');
      c[k]=v;
    }
    if(c.albumSize==='custom'&&c.albumWidth<=c.albumHeight)throw fail(400,'Album width must be greater than height (landscape)');
    return c;
  }
  function selected(e,c){
    const list=db.prepare('SELECT id,filename,favorite,created FROM photos WHERE event=? AND approved=1 AND source_visible=1 ORDER BY created ASC,id ASC').all(e.id);
    let rows=c.favoritesOnly?list.filter(p=>p.favorite):list;
    if(c.selectedPhotos.length){const positions=new Map(c.selectedPhotos.map((id,i)=>[id,i]));rows=rows.filter(p=>positions.has(p.id));if(c.order==='manual')rows.sort((a,b)=>positions.get(a.id)-positions.get(b.id));}
    if(c.order==='favorites')rows.sort((a,b)=>b.favorite-a.favorite);
    return {total:rows.length,rows:rows.slice(0,c.photoLimit).map(p=>({...p,url:`/api/guest/${e.slug}/photos/${p.id}/image`}))};
  }
  app.get('/api/events/:slug/print',wrap((req,res)=>{const e=owned(req),c=config(e),list=selected(e,c);res.json({config:c,logo:logoUrl(e),instructionImage:instructionUrl(e),customInstructionImage:!!instruction(e),eligible:list.total,included:list.rows.length,photos:db.prepare('SELECT id,favorite FROM photos WHERE event=? AND approved=1 AND source_visible=1 ORDER BY created ASC,id ASC').all(e.id).map(p=>({...p,url:`/api/guest/${e.slug}/photos/${p.id}/image?thumb=1`}))});}));
  app.patch('/api/events/:slug/print',wrap((req,res)=>{const e=owned(req),c=validate(config(e),req.body);db.prepare('INSERT INTO live_print_designs VALUES(?,?) ON CONFLICT(event) DO UPDATE SET config=excluded.config').run(e.id,JSON.stringify(c));res.json({config:c});}));
  const upload=multer({storage:multer.memoryStorage(),limits:{fileSize:8*1024*1024,files:1,fields:0}}).single('photo');
  app.post('/api/events/:slug/print/logo',(req,res,next)=>{try{owned(req);next();}catch(err){next(err);}},upload,wrap(async(req,res)=>{
    const e=owned(req);if(!req.file)throw fail(400,'Choose a logo');
    let bytes;try{bytes=await sharp(req.file.buffer,{limitInputPixels:24000000}).rotate().resize({width:1200,height:1200,fit:'inside',withoutEnlargement:true}).png().toBuffer();}catch{throw fail(400,'Choose a valid PNG, JPEG or WebP image');}
    owned(req);const filename=crypto.randomUUID()+'.png',old=logo(e);fs.writeFileSync(path.join(data,'assets',filename),bytes);db.prepare('INSERT OR REPLACE INTO assets VALUES(?,?,?)').run(e.id,'print-logo',filename);if(old)fs.rmSync(path.join(data,'assets',old.filename),{force:true});res.json({logo:logoUrl(e)});
  }));
  app.get('/api/events/:slug/print/logo',wrap((req,res)=>{const e=owned(req),a=logo(e);if(!a)throw fail(404,'Logo not found');res.type('png').send(fs.readFileSync(path.join(data,'assets',a.filename)));}));
  app.delete('/api/events/:slug/print/logo',wrap((req,res)=>{const e=owned(req),a=logo(e);db.prepare("DELETE FROM assets WHERE event=? AND kind='print-logo'").run(e.id);if(a)fs.rmSync(path.join(data,'assets',a.filename),{force:true});res.json({ok:true});}));
  app.post('/api/events/:slug/print/instruction-image',(req,res,next)=>{try{owned(req);next();}catch(err){next(err);}},upload,wrap(async(req,res)=>{
    const e=owned(req);if(!req.file)throw fail(400,'Choose an instruction image');
    let bytes;try{bytes=await sharp(req.file.buffer,{limitInputPixels:24000000}).rotate().resize({width:1800,height:2400,fit:'inside',withoutEnlargement:true}).png().toBuffer();}catch{throw fail(400,'Choose a valid PNG, JPEG or WebP image');}
    owned(req);const filename=crypto.randomUUID()+'.png',old=instruction(e);fs.writeFileSync(path.join(data,'assets',filename),bytes);db.prepare('INSERT OR REPLACE INTO assets VALUES(?,?,?)').run(e.id,'print-instruction',filename);if(old)fs.rmSync(path.join(data,'assets',old.filename),{force:true});res.json({instructionImage:instructionUrl(e)});
  }));
  app.get('/api/events/:slug/print/instruction-image',wrap((req,res)=>{const e=owned(req),a=instruction(e);if(!a)throw fail(404,'Instruction image not found');res.type('png').send(fs.readFileSync(path.join(data,'assets',a.filename)));}));
  app.delete('/api/events/:slug/print/instruction-image',wrap((req,res)=>{const e=owned(req),a=instruction(e);db.prepare("DELETE FROM assets WHERE event=? AND kind='print-instruction'").run(e.id);if(a)fs.rmSync(path.join(data,'assets',a.filename),{force:true});res.json({instructionImage:instructionUrl(e)});}));
  app.get('/api/events/:slug/print/qr/image',wrap(async(req,res)=>{const e=owned(req);requireFeature('qrPrints');res.type('png').send(await QRCode.toBuffer(`${base}/e/${e.slug}`,{width:900,margin:4,errorCorrectionLevel:'M'}));}));
  function publicEvent(req){const e=event(req);if(!e.gallery_released||e.status==='draft'||e.visibility!=='all'||e.reveal>now())throw fail(404,'This album has not been released.');requireFeature('photobooks');return e;}
  async function prepare(req,publicView=false){const e=publicView?publicEvent(req):owned(req),kind=publicView?'album':req.params.kind;if(!['qr','album'].includes(kind))throw fail(404,'Unknown print format');requireFeature(kind==='album'?'photobooks':'qrPrints');const c=config(e),selection=selected(e,c);if(kind==='album'&&!selection.rows.length)throw fail(400,'Approve or select at least one photo before creating an album');if(kind==='album'&&c.layout==='mosaic'){for(const p of selection.rows){const meta=await sharp(path.join(data,'photos',p.filename)).metadata();const swap=[5,6,7,8].includes(meta.orientation);p.width=swap?meta.height:meta.width;p.height=swap?meta.width:meta.height;}}return {e,c,kind,selection,pages:printPlan(kind,c,{...e,url:`${base}/e/${e.slug}`},selection.rows,logoUrl(e),instructionUrl(e))};}
  app.get('/api/events/:slug/print/:kind/preview',wrap(async(req,res)=>{const {pages,selection}=await prepare(req);res.json({pages,included:selection.rows.length,eligible:selection.total});}));
  const jobs=new Map(),exportDir=path.join(data,'print-exports');fs.mkdirSync(exportDir,{recursive:true});let queue=Promise.resolve();
  const signature=({e,c,kind,selection})=>crypto.createHash('sha256').update(JSON.stringify([e.title,e.description,e.slug,c,kind,selection.rows.map(p=>[p.id,p.filename,p.favorite]),logo(e),instruction(e)])).digest('hex');
  function exportJob(plan){
    const {e,kind,selection,pages}=plan,key=signature(plan),id=e.id+'-'+kind,previous=jobs.get(id);
    if(previous&&(previous.state==='pending'||previous.state==='error'&&Date.now()-previous.failedAt<30000||previous.key===key&&previous.state==='ready'&&fs.existsSync(previous.file)))return previous;
    const job={key,state:'pending',file:path.join(exportDir,id+'.pdf'),completed:0,total:pages.length};jobs.set(id,job);
    const run=async()=>{try{
      const sources=new Map(selection.rows.map(p=>[p.url,path.join(data,'photos',p.filename)]));
      const a=logo(e);if(a)sources.set(logoUrl(e),path.join(data,'assets',a.filename));
      if(kind==='qr'){const a=instruction(e);sources.set(instructionUrl(e),a?path.join(data,'assets',a.filename):path.join(root,'live-public/print-themes/qr-instruction-phone.png'));}
      const images={get:async url=>{const file=sources.get(url);if(!file)return;const bytes=await fs.promises.readFile(file);return url.includes('/photos/')?sharp(bytes).rotate().resize({width:2400,height:2400,fit:'inside',withoutEnlargement:true}).jpeg({quality:90}).toBuffer():bytes;}};
      await renderPrintPDF(pages,{root,images,fail,output:job.file+'.tmp',progress:n=>job.completed=n});
      await fs.promises.rename(job.file+'.tmp',job.file);job.state='ready';
    }catch(err){job.state='error';job.failedAt=Date.now();job.error=err.status?err.message:'Unable to generate PDF. Please try again or contact the event host.';console.error('[print-export]',err.message);await fs.promises.rm(job.file+'.tmp',{force:true});}};
    job.promise=queue.then(run);queue=job.promise.catch(()=>{});return job;
  }
  async function status(req,res,publicView=false){
    if(publicView)requireFeature('downloads');const plan=await prepare(req,publicView),job=exportJob(plan);
    if(job.key!==signature(plan))return res.status(202).json({state:'pending',completed:0,total:plan.pages.length});
    res.status(job.state==='pending'?202:job.state==='error'?500:200).json({state:job.state,completed:job.completed,total:job.total,error:job.error});
  }
  async function download(req,res,publicView=false){
    if(publicView)requireFeature('downloads');let plan=await prepare(req,publicView),job=exportJob(plan);
    if(publicView&&job.state!=='ready')return res.status(202).json({state:job.state,error:job.error});
    await job.promise;
    const fresh=await prepare(req,publicView);if(signature(fresh)!==job.key)throw fail(409,'Album changed. Please prepare the latest saved version.');
    if(job.state==='error')throw fail(500,job.error);
    res.set('Cache-Control','no-store');res.set('Content-Disposition',`${req.query.view==='1'?'inline':'attachment'}; filename="${plan.e.slug}-${plan.kind}.pdf"`);res.type('pdf').sendFile(path.resolve(job.file));
  }
  app.get('/api/events/:slug/print/:kind/export',wrap((req,res)=>status(req,res)));
  app.get('/api/events/:slug/print/:kind/pdf',wrap((req,res)=>download(req,res)));
  app.get('/api/gallery/:slug/album',wrap(async(req,res)=>{
    const plan=await prepare(req,true);const pages=structuredClone(plan.pages);
    for(const page of pages)for(const el of page.elements){if(el.kind==='qr')el.imageUrl=`/api/gallery/${plan.e.slug}/album/qr`;else if(el.kind==='photo')el.url=el.url.replace(`/api/guest/${plan.e.slug}/photos/`,`/api/gallery/${plan.e.slug}/photos/`).replace('/image','');else if(el.kind==='image'&&el.url===logoUrl(plan.e))el.url=`/api/gallery/${plan.e.slug}/album/logo`;}
    res.json({title:plan.e.title,pages,revision:signature(plan)});
  }));
  app.get('/api/gallery/:slug/album/qr',wrap(async(req,res)=>{const e=publicEvent(req);res.type('png').send(await QRCode.toBuffer(`${base}/e/${e.slug}`,{width:900,margin:4,errorCorrectionLevel:'M'}));}));
  app.get('/api/gallery/:slug/album/logo',wrap((req,res)=>{const e=publicEvent(req),a=logo(e);if(!a)throw fail(404,'Logo unavailable');res.type('png').sendFile(path.resolve(data,'assets',a.filename));}));
  app.get('/api/gallery/:slug/album/export',wrap((req,res)=>status(req,res,true)));
  app.get('/api/gallery/:slug/album/pdf',wrap((req,res)=>download(req,res,true)));

}

export async function renderPrintPDF(pages,{root,images=new Map(),output,progress=()=>{},fail=(s,m)=>Object.assign(new Error(m),{status:s})}){
  const pdf=new PDFDocument({autoFirstPage:false,margin:0,compress:true,info:{Title:'Moments Live',Creator:'Moments Live Print Studio'}});
  pdf.registerFont('serif',path.join(root,'live-public/print-fonts/NotoSerif-Regular.ttf'));pdf.registerFont('sans',path.join(root,'live-public/print-fonts/NotoSans-Regular.ttf'));
  const chunks=[],stream=output?fs.createWriteStream(output):null;const done=new Promise((resolve,reject)=>{if(stream){pdf.pipe(stream);stream.on('finish',resolve);stream.on('error',reject);}else{pdf.on('data',b=>chunks.push(b));pdf.on('end',()=>resolve(Buffer.concat(chunks)));}pdf.on('error',reject);});done.catch(()=>{});let completed=0;
  try{for(const page of pages){
    pdf.addPage({size:[page.w,page.h],margin:0});if(page.paper)pdf.rect(0,0,page.w,page.h).fill(page.paper);else pdf.image(path.join(root,'live-public',page.background),0,0,{width:page.w,height:page.h});
    for(const el of page.elements){
      if(el.kind==='panel')pdf.rect(el.x,el.y,el.w,el.h).fill(el.color);
      if(el.kind==='border'){pdf.lineWidth(.6).strokeColor(el.color);if(el.rounded)pdf.roundedRect(el.x,el.y,el.w,el.h,12).stroke();else pdf.rect(el.x,el.y,el.w,el.h).stroke();if(el.double)pdf.rect(el.x+4,el.y+4,el.w-8,el.h-8).stroke();}
      if(el.kind==='text'){
        pdf.font(el.font).fillColor(el.color);let size=el.size;pdf.fontSize(size);while(pdf.heightOfString(el.text,{width:el.w,lineGap:1})>el.h&&size>4){size-=.5;pdf.fontSize(size);}if(pdf.heightOfString(el.text,{width:el.w,lineGap:1})>el.h)throw fail(400,'Shorten the text to fit this paper size');
        pdf.text(el.text,el.x,el.y,{width:el.w,height:el.h,align:el.align,lineGap:1});
      }
      if(el.kind==='photo'){
        const bytes=await images.get(el.url);if(bytes){
          const meta=await sharp(bytes).metadata(),g=photoGeometry(el,meta.width,meta.height);
          pdf.save();if(el.frame!=='none'){pdf.fillColor('#14251c').fillOpacity(.10).roundedRect(g.x+2,g.y+3,g.w,g.h,g.radius).fill();pdf.fillOpacity(el.frame==='glass'?.28:.92).fillColor(el.paper).roundedRect(g.x,g.y,g.w,g.h,g.radius).fill();}pdf.restore();
          pdf.save();pdf.roundedRect(g.ix,g.iy,g.iw,g.ih,el.frame==='none'?0:g.radius*(el.frame==='gold-line'?1:.65)).clip();pdf.image(bytes,g.ix,g.iy,{cover:[g.iw,g.ih],align:'center',valign:'center'});pdf.restore();
          if(el.art)pdf.image(path.join(root,'live-public',el.art),g.x,g.y,{width:g.w,height:g.h});
          else if(['rounded','gold-line'].includes(el.frame))pdf.save().strokeColor(el.frame==='gold-line'?'#b49552':el.accent).strokeOpacity(el.frame==='gold-line'?1:.35).lineWidth(el.frame==='gold-line'?.8:.6).roundedRect(g.x,g.y,g.w,g.h,g.radius).stroke().restore();
        }
      }
      if(el.kind==='fold'){pdf.save().rect(el.x,el.y,el.w,el.h).fill('#e9ddc7').restore();}
      if(el.kind==='ornament'){
        pdf.save().translate(el.x,el.y).scale(el.w/100,el.h/14).strokeColor(el.color).fillColor(el.color).lineWidth(.5).path(keepsakeFlourish).fillAndStroke().restore();
      }
      if(el.kind==='rule'){pdf.save().strokeColor(el.color).lineWidth(.7).moveTo(el.x,el.y).lineTo(el.x+el.w,el.y).stroke().restore();}
      if(el.kind==='image'){const bytes=await images.get(el.url);if(bytes)pdf.image(bytes,el.x,el.y,{fit:[el.w,el.h],align:'center',valign:'center'});}
      if(el.kind==='qr'){
        const qr=QRCode.create(el.url,{errorCorrectionLevel:'M'}),n=qr.modules.size,unit=el.w/(n+8);pdf.rect(el.x,el.y,el.w,el.h).fill('#fff');
        pdf.fillColor('#000');for(let row=0;row<n;row++)for(let col=0;col<n;col++)if(qr.modules.get(row,col))pdf.rect(el.x+(col+4)*unit,el.y+(row+4)*unit,unit+.015,unit+.015);pdf.fill();
      }
    }
    progress(++completed);
  }pdf.end();return await done;}catch(err){pdf.destroy(err);if(stream)stream.destroy(err);await done.catch(()=>{});throw err;}
}
