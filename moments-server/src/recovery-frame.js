import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {nanoid} from 'nanoid';
import sharp from 'sharp';
import overlay from './frame-overlay.cjs';
import {config} from './config.js';
import {getDb,publicPhoto} from './db.js';
export async function frameOriginal(id,frameName) {
 if(path.basename(frameName)!==frameName||!frameName.toLowerCase().endsWith('.png'))throw Error('Choose a PNG frame from the frame library');
 const row=getDb().prepare("SELECT * FROM photos WHERE id=? AND variant='original'").get(id);
 const session=row&&getDb().prepare('SELECT * FROM sessions WHERE id=?').get(row.session_id);
 if(!session)throw Error('Select original photos only');
 const frame=path.join(config.framesDir,frameName),input=path.join(config.photosDir,session.slug,row.filename);
 const hash=createHash('sha256').update(fs.readFileSync(frame)).digest('hex').slice(0,16);
 const sourceName=`recovery-${row.id}-${hash}_framed.png`;
 const existing=getDb().prepare('SELECT * FROM photos WHERE session_id=? AND source_local_name=?').get(session.id,sourceName);
 if(existing)return publicPhoto(session.slug,existing);
 const meta=await sharp(frame).metadata(),{hole,overlay:art}=await overlay.prepareFrameOverlay(sharp,frame);
 const photo=await sharp(input).rotate().resize(hole.width,hole.height,{fit:'cover',position:'centre'}).png().toBuffer();
 const png=await sharp({create:{width:meta.width,height:meta.height,channels:4,background:'#000000'}}).composite([{input:photo,left:hole.left,top:hole.top},{input:art,left:0,top:0}]).png().toBuffer();
 const result={id:nanoid(14),session_id:session.id,variant:'framed',filename:'',mime:'image/png',bytes:png.length,source_local_name:sourceName,width:meta.width,height:meta.height,created_at:new Date().toISOString(),process_status:'ready'};
 result.filename=result.id+'.png';fs.writeFileSync(path.join(config.photosDir,session.slug,result.filename),png);
 getDb().prepare('INSERT INTO photos(id,session_id,variant,filename,mime,bytes,source_local_name,width,height,created_at,process_status) VALUES(@id,@session_id,@variant,@filename,@mime,@bytes,@source_local_name,@width,@height,@created_at,@process_status)').run(result);
 return publicPhoto(session.slug,result);
}
