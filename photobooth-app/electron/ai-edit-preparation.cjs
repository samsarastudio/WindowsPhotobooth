'use strict';
const sharp=require('sharp');
const path=require('node:path');
const {replaceBackground,subjectMask}=require('./subject-compositor.cjs');
const {detectFaces}=require('./face-geometry.cjs');
const {resolveDepthBackground}=require('./background-depth.cjs');

async function prepareScene(source,background,modelDir) {
  let original=await sharp(source).rotate().resize(1536,1024,{fit:'cover',position:'centre'}).removeAlpha().png().toBuffer();
  let faces=await detectFaces(original,path.join(modelDir,'yunet.onnx'));
  // Costumes and full-face masks are valid subjects; segmentation does not require a human face.
  const faceRatio=faces.length ? faces.reduce((sum,f)=>sum+f.w/1536,0)/faces.length : .15;
  // Optical depth treatment, without changing the chosen scene's geometry/artwork.
  const selected=resolveDepthBackground(background,faces,1024);
  const blur=selected.depth?0:Math.max(1.5,Math.min(5,.9+faceRatio*14));
  let plate=sharp(selected.path).rotate().resize(1536,1024,{fit:'cover'});
  if(blur>0)plate=plate.blur(blur);
  let reference=await plate.png().toBuffer();
  const composed=await replaceBackground(original,reference,path.join(modelDir,'birefnet-lite.onnx'));
  // A guest-approved source crop must not be automatically reframed again.
  const crop=/_crop\.(?:jpe?g|png)$/i.test(String(source)) ? null : require('./subject-framing.cjs').subjectCrop(composed.alpha,1536,1024);
  if(crop){
    const reframe=buf=>sharp(buf).extract(crop).resize(1536,1024).png().toBuffer();
    [original,reference,composed.output]=await Promise.all([reframe(original),reframe(reference),reframe(composed.output)]);
    for(const key of ['alpha','lightingWeights','faceProtection']) composed[key]=await sharp(composed[key],{raw:{width:1536,height:1024,channels:1}}).extract(crop).resize(1536,1024).raw().toBuffer();
  }
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
// Compatibility export: never repaint or paste a guest face over OpenAI's portrait.
async function preservePortraitPlate(prepared, generated) { return generated; }
const PORTRAIT_MAKEUP = {
 vampire: 'Refined vampire makeup: subtle smoky eyes and dark wine lip tint, preserving natural skin texture and facial hair; no exaggerated fangs or changed mouth shape.',
 witch: 'Elegant witch makeup: plum smoky eye shadow, fine eyeliner and muted berry lips. No green skin, altered nose or exaggerated features.',
 werewolf: 'Subtle theatrical werewolf makeup: textured brown shading at temples and cheek edges, a few delicate fur-like brush strokes outside the central face. Keep a human nose, jaw and mouth; no muzzle, animal eyes or facial prosthetic.',
 reaper: 'Haunting reaper makeup: soft charcoal eye shadow and restrained cool gray shading. No skull replacement, opaque face paint or hollow eyes.',
 phantom: 'Ghostly phantom makeup: delicate cool silver eye shadow and lightly desaturated theatrical complexion with natural skin texture. No opaque mask or changed eye color.',
 bride: 'Adventurous pirate makeup: subtle weathered bronzer and light kohl eyeliner. Keep facial features, natural skin tone and facial hair recognizable; no added scars.',
 morticia: 'Elegant gothic countess makeup: defined fine eyeliner, smoky plum eye shadow and deep berry lipstick following the original lip contour. Preserve the guest natural skin texture and recognizable features.'
};
function buildPortraitPrompt(characterId) {
 return HEAD_PROMPT + ' COSTUME MAKEUP: ' + (PORTRAIT_MAKEUP[characterId] || 'Use subtle theatrical makeup appropriate to the supplied costume.') + ' Makeup is cosmetic pigment only, not a different face: retain exact eye spacing, facial width, nose shape, jaw, mouth, age, expression, hairline and distinctive marks. Integrate scene lighting and makeup in this generated image; it is the final portrait and will receive no face replacement or makeup overlays afterward.';
}
const SCENE_PROMPT="Image 1 is the exact photographic layout to finish, with the original guests already placed in the selected Halloween setting. Image 2 is the same selected background for reference. Edit ONLY the transparent boundary band, which includes both sides of the hair and clothing silhouette. Remove ALL remnants of the original gray studio backdrop, including gray wedges behind heads, gray outlines embedded between curls and the pale rim around hair. Reconstruct fine individual hair strands against the selected scene. The hair must meet the new background naturally without a pasted-on cutout edge. Blend the adjacent background into a coherent photograph. Do not move, resize, recolor or regenerate any person. Keep faces, expressions, skin texture, eyewear, clothing, hands, handbag and all accessories absolutely unchanged. Keep the background architecture, objects and composition unchanged. Preserve the existing camera viewpoint and foreground scale: guests are near the camera at the gate and the manor is far behind them. No extra glow, halos, outlines, duplicate edges or double exposures. No changes outside the mask.";
const HEAD_PROMPT='Image 1 is the costume portrait template. Image 2 is the original guest photo and sole identity reference. Replace ONLY the template head inside the mask with the exact guest head: same face, expression, eyes, nose, mouth, beard, skin texture, age and hair. Do not blend their identity with the template model. Preserve facial proportions and distinctive details. Match the existing template head size, position, angle and collar connection naturally. No elongated neck, floating head, oval cutout, doubled hair, or extra face. Keep all costume, body, pose, props and scenery outside the head mask unchanged. The result must look like the same guest wearing the costume, not a similar person.';
module.exports={prepareScene,prepareHead,preserveSceneSubjects,preservePortraitPlate,SCENE_PROMPT,HEAD_PROMPT,buildPortraitPrompt,PORTRAIT_MAKEUP};
