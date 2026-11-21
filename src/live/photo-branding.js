import sharp from 'sharp';
import {fileURLToPath} from 'node:url';
const badge=fileURLToPath(new URL('../../live-public/branding/kwca-gold-badge.png',import.meta.url));

// Scale against the short edge so phone portrait, landscape and square keep
// identical visual weight. Composite after colour looks to preserve brand colours.
export async function applyPhotoBranding(bytes,style){
  if(style!=='kwca_gold')return bytes;
  const {width,height}=await sharp(bytes).metadata();
  const short=Math.min(width,height),inset=Math.max(2,Math.round(short*.012));
  const stroke=Math.max(1,short*.0018),size=Math.max(12,Math.round(short*.115));
  const border=Buffer.from(`<svg width="${width}" height="${height}"><defs><linearGradient id="gold" x2="1" y2="1"><stop stop-color="#a57a35"/><stop offset=".45" stop-color="#f1d99c"/><stop offset="1" stop-color="#ba9045"/></linearGradient></defs><rect x="${inset}" y="${inset}" width="${width-2*inset}" height="${height-2*inset}" rx="${short*.004}" fill="none" stroke="url(#gold)" stroke-width="${stroke}"/></svg>`);
  const logo=await sharp(badge).resize(size,size,{fit:'contain',background:'#00000000'}).png().toBuffer();
  return sharp(bytes).composite([{input:border},{input:logo,left:width-inset-size,top:height-inset-size}]).jpeg({quality:90}).toBuffer();
}
