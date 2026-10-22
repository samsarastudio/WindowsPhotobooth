'use strict';
const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');

function classifyFraming(faces,height) {
  // Apparent face size estimates framing, not physical distance. Use the largest
  // face so a child or a farther guest does not select a wide plate for a close group.
  const ratio=Math.max(0,...faces.map(f=>f.h/height));
  return ratio>=.30?'close':ratio>=.16?'medium':'wide';
}

function resolveDepthBackground(background,faces,height) {
  const sidecar=background.replace(/\.[^.]+$/,'.depths.json');
  if(!fs.existsSync(sidecar))return {path:background,depth:null};
  const config=JSON.parse(fs.readFileSync(sidecar,'utf8'));
  // Replacing a plate in Admin disables old variants automatically.
  const hash=crypto.createHash('sha256').update(fs.readFileSync(background)).digest('hex');
  if(config.version!==1||config.baseSha256!==hash)return {path:background,depth:null};
  const depth=classifyFraming(faces,height);
  const relative=config.variants?.[depth];
  if(typeof relative!=='string')throw new Error(`Missing ${depth} background variant.`);
  const root=path.dirname(background),resolved=path.resolve(root,relative),check=path.relative(root,resolved);
  if(check.startsWith('..')||path.isAbsolute(check)||!fs.existsSync(resolved))throw new Error('Background depth variant is unavailable.');
  return {path:resolved,depth};
}
module.exports={classifyFraming,resolveDepthBackground};
