'use strict';
const sharp=require('sharp');
const PRESETS={
 vampire:{eye:'#341526',lip:'#6c1932',contour:'#4d354d'},
 witch:{eye:'#38243e',lip:'#60304f',contour:'#51404e'},
 werewolf:{eye:'#38291e',lip:null,contour:'#624634',marks:true},
 reaper:{eye:'#20212c',lip:'#55444f',contour:'#414653'},
 phantom:{eye:'#424c67',lip:'#5b4b65',contour:'#555c73'},
 bride:{eye:'#292523',lip:null,contour:'#6c4b35',scar:true}, // Pirate; legacy id retained.
 morticia:{eye:'#372738',lip:'#652541',contour:'#4b3b4a'}
};
async function applyCharacterMakeup(image,face,id){
 const preset=PRESETS[id];if(!preset)return image;
 const meta=await sharp(image).metadata(),w=face.w,h=face.h,p=face.points;
 let art='';
 for(const eye of p.slice(0,2))art+=`<ellipse cx="${eye.x}" cy="${eye.y-h*.015}" rx="${w*.15}" ry="${h*.05}" fill="${preset.eye}" opacity=".35" filter="url(#soft)"/>`;
 for(const side of [-1,1])art+=`<ellipse cx="${face.x+w*.5+side*w*.34}" cy="${face.y+h*.65}" rx="${w*.1}" ry="${h*.14}" fill="${preset.contour}" opacity=".25" filter="url(#soft)"/>`;
 if(preset.lip)art+=`<path d="M ${p[3].x} ${p[3].y} Q ${(p[3].x+p[4].x)/2} ${(p[3].y+p[4].y)/2+h*.025} ${p[4].x} ${p[4].y}" stroke="${preset.lip}" stroke-width="${h*.023}" opacity=".25" fill="none" filter="url(#fine)"/>`;
 if(id==='vampire')art+=`<path d="M ${p[4].x} ${p[4].y+h*.02} l ${w*.008} ${h*.075}" stroke="#6c1924" stroke-width="${w*.012}" opacity=".52" fill="none" filter="url(#fine)"/>`;
 if(preset.marks)for(let i=0;i<3;i++)art+=`<path d="M ${face.x+w*(.76+i*.045)} ${face.y+h*.52} l ${-w*.045} ${h*.18}" stroke="#6b493c" stroke-width="${w*.008}" opacity=".38" filter="url(#fine)"/>`;
 if(preset.scar)art+=`<path d="M ${face.x+w*.82} ${face.y+h*.31} l ${-w*.08} ${h*.20}" stroke="#835849" stroke-width="${w*.012}" opacity=".45" filter="url(#fine)"/>`;
 // Eye whites, iris, pupil, smile and all geometry are preserved; these are translucent paints.
 const eyeHoles=p.slice(0,2).map(e=>`<ellipse cx="${e.x}" cy="${e.y}" rx="${w*.11}" ry="${h*.027}" fill="black"/>`).join('');
 const svg=`<svg width="${meta.width}" height="${meta.height}" xmlns="http://www.w3.org/2000/svg"><defs><filter id="soft"><feGaussianBlur stdDeviation="${w*.025}"/></filter><filter id="fine"><feGaussianBlur stdDeviation="${w*.006}"/></filter><mask id="eyes"><rect width="100%" height="100%" fill="white"/>${eyeHoles}</mask></defs><g mask="url(#eyes)">${art}</g></svg>`;
 return sharp(image).composite([{input:Buffer.from(svg)}]).png().toBuffer();
}
module.exports={applyCharacterMakeup,PRESETS};
