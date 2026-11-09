import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import multer from 'multer';
import sharp from 'sharp';
import PDFDocument from 'pdfkit';
import QRCode from 'qrcode';
import {themes,printDefaults,qrSizes,albumSizes} from '../../live-public/print-catalog.js';
import {printPlan} from '../../live-public/print-layout.js';

export function registerPrintStudio({app,db,owned,requireFeature,base,data,root,wrap,fail}){
  db.exec("CREATE TABLE IF NOT EXISTS live_print_designs(event TEXT PRIMARY KEY REFERENCES events(id) ON DELETE CASCADE,config TEXT NOT NULL)");
  const config=e=>({...printDefaults,...JSON.parse(db.prepare('SELECT config FROM live_print_designs WHERE event=?').get(e.id)?.config||'{}')});
  const logo=e=>db.prepare("SELECT filename FROM assets WHERE event=? AND kind='print-logo'").get(e.id);
  const logoUrl=e=>logo(e)?`/api/events/${e.slug}/print/logo?v=${logo(e).filename}`:null;
  const choices={eventType:Object.keys(themes),theme:['auto',...Object.keys(themes)],border:['none','fine','double','rounded'],qrSize:[...Object.keys(qrSizes),'custom'],albumSize:[...Object.keys(albumSizes),'custom'],layout:['editorial','hero','duo','trio','grid'],order:['chronological','favorites','manual']};
  function validate(old,patch){
    if(!patch||typeof patch!=='object'||Array.isArray(patch))throw fail(400,'Provide design settings');
    const c={...old};
    for(const [k,v] of Object.entries(patch)){
      if(!Object.hasOwn(printDefaults,k))throw fail(400,'Unknown design setting: '+k);
      if(k==='selectedPhotos'){
        if(!Array.isArray(v)||v.length>300||v.some(id=>typeof id!=='string'||! /^[a-f0-9-]{36}$/.test(id))||new Set(v).size!==v.length)throw fail(400,'Choose up to 300 unique photos');
      }else if(typeof v!==typeof printDefaults[k])throw fail(400,'Invalid design setting: '+k);
      if(choices[k]&&!choices[k].includes(v))throw fail(400,'Invalid choice: '+k);
      const ranges={qrWidth:[70,420],qrHeight:[70,594],albumWidth:[180,420],albumHeight:[120,297],photoLimit:[1,300],wordingOffset:[0,149]};
      if(ranges[k]&&(!Number.isFinite(v)||v<ranges[k][0]||v>ranges[k][1]||(['photoLimit','wordingOffset'].includes(k)&&!Number.isInteger(v))))throw fail(400,'Invalid range: '+k);
      if(typeof v==='string'&&v.length>({intro:1200,closing:400,customCaptions:12000,qrInstructions:160}[k]||120))throw fail(400,'Text is too long: '+k);
      if(k==='customCaptions'&&(v.split('\n').length>150||v.split('\n').some(line=>line.length>180)))throw fail(400,'Use up to 150 captions, each at most 180 characters');
      c[k]=v;
    }
    if(c.albumSize==='custom'&&c.albumWidth<=c.albumHeight)throw fail(400,'Album width must be greater than height (landscape)');
    return c;
  }
  function selected(e,c){
    const list=db.prepare('SELECT id,filename,favorite,created FROM photos WHERE event=? AND approved=1 ORDER BY created ASC,id ASC').all(e.id);
    let rows=c.favoritesOnly?list.filter(p=>p.favorite):list;
    if(c.selectedPhotos.length){const positions=new Map(c.selectedPhotos.map((id,i)=>[id,i]));rows=rows.filter(p=>positions.has(p.id));if(c.order==='manual')rows.sort((a,b)=>positions.get(a.id)-positions.get(b.id));}
    if(c.order==='favorites')rows.sort((a,b)=>b.favorite-a.favorite);
    return {total:rows.length,rows:rows.slice(0,c.photoLimit).map(p=>({...p,url:`/api/guest/${e.slug}/photos/${p.id}/image`}))};
  }
  app.get('/api/events/:slug/print',wrap((req,res)=>{const e=owned(req),c=config(e),list=selected(e,c);res.json({config:c,logo:logoUrl(e),eligible:list.total,included:list.rows.length,photos:db.prepare('SELECT id,favorite FROM photos WHERE event=? AND approved=1 ORDER BY created ASC,id ASC').all(e.id).map(p=>({...p,url:`/api/guest/${e.slug}/photos/${p.id}/image?thumb=1`}))});}));
  app.patch('/api/events/:slug/print',wrap((req,res)=>{const e=owned(req),c=validate(config(e),req.body);db.prepare('INSERT INTO live_print_designs VALUES(?,?) ON CONFLICT(event) DO UPDATE SET config=excluded.config').run(e.id,JSON.stringify(c));res.json({config:c});}));
  const upload=multer({storage:multer.memoryStorage(),limits:{fileSize:8*1024*1024,files:1,fields:0}}).single('photo');
  app.post('/api/events/:slug/print/logo',(req,res,next)=>{try{owned(req);next();}catch(err){next(err);}},upload,wrap(async(req,res)=>{
    const e=owned(req);if(!req.file)throw fail(400,'Choose a logo');
    let bytes;try{bytes=await sharp(req.file.buffer,{limitInputPixels:24000000}).rotate().resize({width:1200,height:1200,fit:'inside',withoutEnlargement:true}).png().toBuffer();}catch{throw fail(400,'Choose a valid PNG, JPEG or WebP image');}
    owned(req);const filename=crypto.randomUUID()+'.png',old=logo(e);fs.writeFileSync(path.join(data,'assets',filename),bytes);db.prepare('INSERT OR REPLACE INTO assets VALUES(?,?,?)').run(e.id,'print-logo',filename);if(old)fs.rmSync(path.join(data,'assets',old.filename),{force:true});res.json({logo:logoUrl(e)});
  }));
  app.get('/api/events/:slug/print/logo',wrap((req,res)=>{const e=owned(req),a=logo(e);if(!a)throw fail(404,'Logo not found');res.type('png').send(fs.readFileSync(path.join(data,'assets',a.filename)));}));
  app.delete('/api/events/:slug/print/logo',wrap((req,res)=>{const e=owned(req),a=logo(e);db.prepare("DELETE FROM assets WHERE event=? AND kind='print-logo'").run(e.id);if(a)fs.rmSync(path.join(data,'assets',a.filename),{force:true});res.json({ok:true});}));
  app.get('/api/events/:slug/print/qr/image',wrap(async(req,res)=>{const e=owned(req);requireFeature('qrPrints');res.type('png').send(await QRCode.toBuffer(`${base}/e/${e.slug}`,{width:900,margin:4,errorCorrectionLevel:'M'}));}));
  function prepare(req){const e=owned(req),kind=req.params.kind;if(!['qr','album'].includes(kind))throw fail(404,'Unknown print format');requireFeature(kind==='album'?'photobooks':'qrPrints');const c=config(e),selection=selected(e,c);if(kind==='album'&&!selection.rows.length)throw fail(400,'Approve or select at least one photo before creating an album');return {e,c,kind,selection,pages:printPlan(kind,c,{...e,url:`${base}/e/${e.slug}`},selection.rows,logoUrl(e))};}
  app.get('/api/events/:slug/print/:kind/preview',wrap((req,res)=>{const {pages,selection}=prepare(req);res.json({pages,included:selection.rows.length,eligible:selection.total});}));
  const busy=new Set();
  app.get('/api/events/:slug/print/:kind/pdf',wrap(async(req,res)=>{
    const {e,kind,selection,pages}=prepare(req);if(busy.has(e.id)||busy.size>=2)throw fail(429,'Another PDF is being prepared for this event. Try again shortly.');busy.add(e.id);
    try{
      const images=new Map();
      for(const p of kind==='album'?selection.rows:[]){images.set(p.url,await sharp(fs.readFileSync(path.join(data,'photos',p.filename))).resize({width:2400,height:1800,fit:'inside',withoutEnlargement:true}).jpeg({quality:90}).toBuffer());}
      const a=logo(e);if(a)images.set(logoUrl(e),fs.readFileSync(path.join(data,'assets',a.filename)));
      const bytes=await renderPrintPDF(pages,{root,images,fail});
      owned(req);requireFeature(kind==='album'?'photobooks':'qrPrints');
      // Do not deliver a stale export if photos were hidden/deleted during rendering.
      if(kind==='album'&&selection.rows.some(p=>!db.prepare('SELECT 1 FROM photos WHERE event=? AND id=? AND approved=1').get(e.id,p.id)))throw fail(409,'Photos changed during export. Please generate the album again.');
      res.set('Content-Disposition',`${req.query.view==='1'?'inline':'attachment'}; filename="${e.slug}-${kind}.pdf"`);res.type('pdf').send(bytes);
    }finally{busy.delete(e.id);}
  }));
}

export async function renderPrintPDF(pages,{root,images=new Map(),fail=(s,m)=>Object.assign(new Error(m),{status:s})}){
  const pdf=new PDFDocument({autoFirstPage:false,margin:0,compress:true,info:{Title:'Moments Live',Creator:'Moments Live Print Studio'}});
  pdf.registerFont('serif',path.join(root,'live-public/print-fonts/NotoSerif-Regular.ttf'));pdf.registerFont('sans',path.join(root,'live-public/print-fonts/NotoSans-Regular.ttf'));
  const chunks=[];const done=new Promise((resolve,reject)=>{pdf.on('data',b=>chunks.push(b));pdf.on('end',()=>resolve(Buffer.concat(chunks)));pdf.on('error',reject);});
  try{for(const page of pages){
    pdf.addPage({size:[page.w,page.h],margin:0});pdf.image(path.join(root,'live-public',page.background),0,0,{width:page.w,height:page.h});
    for(const el of page.elements){
      if(el.kind==='border'){pdf.lineWidth(.6).strokeColor(el.color);if(el.rounded)pdf.roundedRect(el.x,el.y,el.w,el.h,12).stroke();else pdf.rect(el.x,el.y,el.w,el.h).stroke();if(el.double)pdf.rect(el.x+4,el.y+4,el.w-8,el.h-8).stroke();}
      if(el.kind==='text'){
        pdf.font(el.font).fillColor(el.color);let size=el.size;pdf.fontSize(size);while(pdf.heightOfString(el.text,{width:el.w,lineGap:1})>el.h&&size>4){size-=.5;pdf.fontSize(size);}if(pdf.heightOfString(el.text,{width:el.w,lineGap:1})>el.h)throw fail(400,'Shorten the text to fit this paper size');
        pdf.text(el.text,el.x,el.y,{width:el.w,height:el.h,align:el.align,lineGap:1});
      }
      if(el.kind==='image'){const bytes=images.get(el.url);if(bytes)pdf.image(bytes,el.x,el.y,{fit:[el.w,el.h],align:'center',valign:'center'});}
      if(el.kind==='qr'){
        const qr=QRCode.create(el.url,{errorCorrectionLevel:'M'}),n=qr.modules.size,unit=el.w/(n+8);pdf.rect(el.x,el.y,el.w,el.h).fill('#fff');
        pdf.fillColor('#000');for(let row=0;row<n;row++)for(let col=0;col<n;col++)if(qr.modules.get(row,col))pdf.rect(el.x+(col+4)*unit,el.y+(row+4)*unit,unit+.015,unit+.015);pdf.fill();
      }
    }
  }pdf.end();return await done;}catch(err){pdf.destroy(err);await done.catch(()=>{});throw err;}
}
