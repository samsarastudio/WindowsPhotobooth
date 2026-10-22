'use strict';
const sharp=require('sharp');
const path=require('node:path');
const {replaceBackground,subjectMask}=require('./subject-compositor.cjs');
const {detectFaces}=require('./face-geometry.cjs');
const {resolveDepthBackground}=require('./background-depth.cjs');

async function prepareScene(source,background,modelDir) {
  let original=await sharp(source).rotate().resize(1536,1024,{fit:'contain',background:'#202020'}).removeAlpha().png().toBuffer();
  let faces=await detectFaces(original,path.join(modelDir,'yunet.onnx'));
  if(!faces.length) throw new Error('No clear face was found. Please face the camera and retake.');
  const crop=require('./portrait-framing.cjs').portraitCrop(faces,1536,1024);
  if(crop){
    original=await sharp(original).extract(crop).resize(1536,1024,{fit:'fill'}).png().toBuffer();
    faces=faces.map(f=>({...f,x:(f.x-crop.left)*1536/crop.width,y:f.y*1024/crop.height,w:f.w*1536/crop.width,h:f.h*1024/crop.height}));
  }
  const faceRatio=faces.reduce((sum,f)=>sum+f.w/1536,0)/faces.length;
  // Optical depth treatment, without changing the chosen scene's geometry/artwork.
  const selected=resolveDepthBackground(background,faces,1024);
  const blur=selected.depth?0:Math.max(1.5,Math.min(5,.9+faceRatio*14));
  let plate=sharp(selected.path).rotate().resize(1536,1024,{fit:'cover'});
  if(blur>0)plate=plate.blur(blur);
  const reference=await plate.png().toBuffer();
  const composed=await replaceBackground(original,reference,path.join(modelDir,'birefnet-lite.onnx'));
  // Scene replacement never exposes guest pixels to a generative image editor.
  return {image:composed.output,original,reference,alpha:composed.alpha,lightingWeights:composed.lightingWeights,faceProtection:composed.faceProtection,crop,blur,depth:selected.depth,backgroundPath:selected.path,
    width:1536,height:1024,strictScene:true,model:'birefnet-lite'};
}

async function prepareHead(source,plate,modelDir,fallbackFace) {
  const image=await sharp(plate).rotate().resize(1024,1536,{fit:'cover'}).removeAlpha().png().toBuffer();
  const reference=await sharp(source).rotate().resize(1536,1536,{fit:'inside'}).removeAlpha().png().toBuffer();
  const guestFaces=await detectFaces(reference,path.join(modelDir,'yunet.onnx'));
  if(guestFaces.length!==1) throw new Error('Portraits need one clearly visible face. Please retake alone or choose AI background for a group.');
  const targets=await detectFaces(image,path.join(modelDir,'yunet.onnx'));
  let f=targets[0];
  if(targets.length===0 && fallbackFace) {
    const r=fallbackFace;
    if([r.xPercent,r.yPercent,r.widthPercent,r.heightPercent].every(Number.isFinite)) {
      f={x:r.xPercent*10.24,y:r.yPercent*15.36,w:r.widthPercent*10.24,h:r.heightPercent*15.36};
    }
  }
  if(!f||targets.length>1) throw new Error('This character needs a face alignment. Please choose another character.');
  // Include the jaw-to-collar connection. A face-only opening restored the
  // blank template neck over an otherwise complete generated portrait.
  const svg=Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1536"><rect width="100%" height="100%" fill="white"/><ellipse cx="${f.x+f.w/2}" cy="${f.y+f.h*.65}" rx="${f.w*.9}" ry="${f.h*1.25}" fill="black"/><ellipse cx="${f.x+f.w/2}" cy="${f.y+f.h*1.1}" rx="${f.w*1.7}" ry="${f.h*.7}" fill="black"/></svg>`);
  const alpha=await sharp(svg).greyscale().raw().toBuffer();
  const mask=await sharp({create:{width:1024,height:1536,channels:3,background:'#000'}})
    .joinChannel(alpha,{raw:{width:1024,height:1536,channels:1}}).png().toBuffer();
  return {image,reference,mask,face:f,guestFace:guestFaces[0],characterId:path.basename(path.dirname(plate)),modelDir,width:1024,height:1536};
}

async function preserveSceneSubjects(prepared) {
  if (!prepared.strictScene) throw new Error('Background replacement requires strict subject preservation.');
  return prepared.image;
}
async function preservePortraitPlate(prepared,generated) {
  const generatedSized=await sharp(generated).resize(prepared.width,prepared.height,{fit:'fill'}).png().toBuffer();
  const faces=await detectFaces(generatedSized,path.join(prepared.modelDir,'yunet.onnx'));
  if(faces.length!==1) throw new Error('The portrait did not produce one clear face. Please try again.');
  const g=prepared.guestFace,d=faces[0];
  const distance=f=>Math.hypot(f.points[1].x-f.points[0].x,f.points[1].y-f.points[0].y);
  const angle=f=>Math.atan2(f.points[1].y-f.points[0].y,f.points[1].x-f.points[0].x);
  if(Math.abs(angle(g)-angle(d))>.1) throw new Error('The portrait changed the head angle. Please regenerate with the guest facing forward.');
  const scale=distance(d)/distance(g);
  const gm=await sharp(prepared.reference).metadata();
  const left=Math.max(0,Math.floor(g.x-g.w*.08)),top=Math.max(0,Math.floor(g.y));
  const width=Math.min(gm.width-left,Math.ceil(g.w*1.16)),height=Math.min(gm.height-top,Math.ceil(g.h*1.05));
  const faceMask=Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><defs><radialGradient id="f"><stop offset="0.65" stop-color="white"/><stop offset="1" stop-color="white" stop-opacity="0"/></radialGradient></defs><ellipse cx="${width/2}" cy="${height/2}" rx="${width*.43}" ry="${height*.48}" fill="url(#f)"/></svg>`);
  const subjectAlpha=await subjectMask(prepared.reference,path.join(prepared.modelDir,'u2net.onnx'));
  const isolated=await sharp(prepared.reference).joinChannel(subjectAlpha,{raw:{width:gm.width,height:gm.height,channels:1}}).png().toBuffer();
  const crop=await sharp(isolated).extract({left,top,width,height}).composite([{input:faceMask,blend:'dest-in'}]).png().toBuffer();
  let scaled=await sharp(crop).resize(Math.round(width*scale),Math.round(height*scale)).png().toBuffer();
  const px=Math.round(d.points[0].x-(g.points[0].x-left)*scale),py=Math.round(d.points[0].y-(g.points[0].y-top)*scale);
  if(px<0||py<0||px+Math.round(width*scale)>prepared.width||py+Math.round(height*scale)>prepared.height) throw new Error('The portrait face alignment is out of bounds. Please retry.');
  const lightingTarget=await sharp(generatedSized).extract({left:px,top:py,width:Math.round(width*scale),height:Math.round(height*scale)}).png().toBuffer();
  scaled=await require('./portrait-lighting.cjs').matchPortraitLighting(scaled,lightingTarget);
  // Feather the preservation boundary to avoid a hard oval at the neck.
  const alpha=await sharp(prepared.mask).extractChannel('alpha').blur(24).raw().toBuffer();
  const original=await sharp(prepared.image).joinChannel(alpha,{raw:{width:prepared.width,height:prepared.height,channels:1}}).png().toBuffer();
  const composed=await sharp(generatedSized).composite([{input:original},{input:scaled,left:px,top:py}]).png().toBuffer();
  return require('./character-makeup.cjs').applyCharacterMakeup(composed,d,prepared.characterId);
}
const SCENE_PROMPT="Image 1 is the exact photographic layout to finish, with the original guests already placed in the selected Halloween setting. Image 2 is the same selected background for reference. Edit ONLY the transparent boundary band, which includes both sides of the hair and clothing silhouette. Remove ALL remnants of the original gray studio backdrop, including gray wedges behind heads, gray outlines embedded between curls and the pale rim around hair. Reconstruct fine individual hair strands against the selected scene. The hair must meet the new background naturally without a pasted-on cutout edge. Blend the adjacent background into a coherent photograph. Do not move, resize, recolor or regenerate any person. Keep faces, expressions, skin texture, eyewear, clothing, hands, handbag and all accessories absolutely unchanged. Keep the background architecture, objects and composition unchanged. Preserve the existing camera viewpoint and foreground scale: guests are near the camera at the gate and the manor is far behind them. No extra glow, halos, outlines, duplicate edges or double exposures. No changes outside the mask.";
const HEAD_PROMPT='Image 1 is the costume portrait template. Image 2 is the original guest photo and sole identity reference. Replace ONLY the template head inside the mask with the exact guest head: same face, expression, eyes, nose, mouth, beard, skin texture, age and hair. Do not blend their identity with the template model. Preserve facial proportions and distinctive details. Match the existing template head size, position, angle and collar connection naturally. No elongated neck, floating head, oval cutout, doubled hair, or extra face. Keep all costume, body, pose, props and scenery outside the head mask unchanged. The result must look like the same guest wearing the costume, not a similar person.';
module.exports={prepareScene,prepareHead,preserveSceneSubjects,preservePortraitPlate,SCENE_PROMPT,HEAD_PROMPT};
