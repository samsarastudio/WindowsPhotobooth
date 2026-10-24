import fs from 'node:fs';
import path from 'node:path';
import { nanoid } from 'nanoid';
import sharp from 'sharp';
import { config } from './config.js';
import { getDb, captureFamilyKey, isSessionExpired, publicPhoto } from './db.js';
import { compositePhysicalFrameDual } from './physical-frame.js';

export function magnetSource(siblings, portrait) {
  if (portrait || siblings.some(p => ['processing','failed'].includes(p.process_status))) return null;
  if (siblings.some(p => p.variant === 'ai')) return siblings.find(p => p.variant === 'magnet-source') || null;
  return siblings.find(p => p.variant === 'original') || null;
}
const pending = new Map();
export async function createTabletMagnet(photoId) {
  const db = getDb(), row = db.prepare('SELECT * FROM photos WHERE id=?').get(photoId);
  const session = row && db.prepare('SELECT * FROM sessions WHERE id=?').get(row.session_id);
  if (!session || isSessionExpired(session)) throw Error('Photo unavailable or expired');
  const family = captureFamilyKey(row.source_local_name, row.filename);
  const siblings = db.prepare('SELECT * FROM photos WHERE session_id=?').all(session.id).filter(p => captureFamilyKey(p.source_local_name,p.filename) === family);
  const original = siblings.find(p => p.variant === 'original');
  const portrait = original && db.prepare("SELECT id FROM portrait_jobs WHERE original_id=? AND job_kind='portrait'").get(original.id);
  const source = magnetSource(siblings, portrait);
  if (!source) throw Error('Magnet requires a finished Classic photo or an unframed Background photo. Portraits are not supported.');
  const sourceName = `magnet-${source.id}_physical.png`;
  const existing = db.prepare("SELECT * FROM photos WHERE session_id=? AND variant='physical' AND source_local_name=?").get(session.id,sourceName);
  if (existing) return publicPhoto(session.slug,existing);
  if (pending.has(source.id)) return pending.get(source.id);
  const work = (async () => {
    const input = fs.readFileSync(path.join(config.photosDir,session.slug,source.filename));
    const {png:output} = await compositePhysicalFrameDual(input,{borderEnabled:false});
    const id=nanoid(14), filename=id+'.png', meta=await sharp(output).metadata();
    fs.writeFileSync(path.join(config.photosDir,session.slug,filename),output);
    const result={id,session_id:session.id,variant:'physical',filename,mime:'image/png',bytes:output.length,source_local_name:sourceName,width:meta.width,height:meta.height,created_at:new Date().toISOString(),process_status:'ready'};
    db.prepare('INSERT INTO photos(id,session_id,variant,filename,mime,bytes,source_local_name,width,height,created_at,process_status) VALUES(@id,@session_id,@variant,@filename,@mime,@bytes,@source_local_name,@width,@height,@created_at,@process_status)').run(result);
    return publicPhoto(session.slug,result);
  })();
  pending.set(source.id,work);
  try { return await work; } finally { pending.delete(source.id); }
}
