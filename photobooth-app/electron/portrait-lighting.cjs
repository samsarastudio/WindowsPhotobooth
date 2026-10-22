'use strict';
const sharp=require('sharp');
/** Transfer only broad illumination and colour; never warp or synthesize features. */
async function matchPortraitLighting(face,target){
 const {data,info}=await sharp(face).ensureAlpha().raw().toBuffer({resolveWithObject:true});
 const blur=Math.max(8,Math.min(info.width,info.height)*.10);
 const sourceLight=await sharp(face).removeAlpha().blur(blur).raw().toBuffer();
 const targetLight=await sharp(target).resize(info.width,info.height,{fit:'fill'}).removeAlpha().blur(blur).raw().toBuffer();
 for(let i=0;i<info.width*info.height;i++){
  for(let c=0;c<3;c++){
   const gain=Math.max(.55,Math.min(1.08,.92*(targetLight[i*3+c]+12)/(sourceLight[i*3+c]+12)));
   data[i*4+c]=Math.round(Math.min(255,data[i*4+c]*gain));
  }
 }
 return sharp(data,{raw:info}).png().toBuffer();
}
module.exports={matchPortraitLighting};
