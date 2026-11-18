const fs=require('fs'),path=require('path'),sharp=require('../photobooth-app/node_modules/sharp');
const root=path.resolve(__dirname,'..');
// Keep the approved print opening and footer geometry in both orientations.
// Render vector artwork so lettering and transparent openings remain exact.
(async()=>{
 for(const [w,h,orientation]of [[1800,1200,'landscape'],[1200,1800,'portrait']]){
  const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
  <defs><linearGradient id="jersey" x1="0" x2="1" y1="0" y2="0"><stop stop-color="#f04b12"/><stop offset=".48" stop-color="#ff830b"/><stop offset="1" stop-color="#ffc928"/></linearGradient></defs>
  <path d="M0 0H${w}V${h}H0ZM20 20V${h-104}H${w-20}V20Z" fill="#091e29" fill-rule="evenodd"/>
  <rect x="13" y="13" width="${w-26}" height="${h-26}" rx="3" fill="none" stroke="url(#jersey)" stroke-width="4"/>
  <path d="M20 ${h-104}H${w-20}" stroke="#ffb719" stroke-width="2"/>
  <path d="M20 ${h-102}H${w*.27}L${w*.27-115} ${h-19}H20Z" fill="url(#jersey)"/>
  <path d="M${w-20} ${h-102}H${w*.73}L${w*.73+115} ${h-19}H${w-20}Z" fill="url(#jersey)"/>
  <path d="M${w*.12} ${h-102}l-95 83h28l95-83ZM${w*.21} ${h-102}l-95 83h12l95-83Z" fill="#ffcf33" opacity=".8"/>
  <path d="M${w*.88} ${h-102}l95 83h-28l-95-83ZM${w*.79} ${h-102}l95 83h-12l-95-83Z" fill="#ffcf33" opacity=".8"/>
  <text x="${w/2}" y="${h-39}" text-anchor="middle" font-family="Segoe UI,Arial,sans-serif" font-size="49" font-weight="800" letter-spacing="9" fill="#fff6dd">KWCA</text>
  <path d="M${w/2-48} ${h-24}H${w/2+48}" stroke="#ffbd20" stroke-width="3"/>
  </svg>`;
  const dest=path.join(root,'skin-packages/sports-cricket/config/photo-frames',`cricket-${orientation}.png`);
  await sharp(Buffer.from(svg)).png().toFile(dest);
  const out=path.join(root,'deliverables/skin-packages/kwca/frames');fs.mkdirSync(out,{recursive:true});
  fs.writeFileSync(path.join(out,`kwca-${orientation}.svg`),svg);
  fs.copyFileSync(dest,path.join(out,`kwca-${orientation}.png`));
 }
})().catch(e=>{console.error(e);process.exitCode=1;});
