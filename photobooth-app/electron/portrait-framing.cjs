'use strict';
// Wide captures use a tighter 3:2 portrait crop to avoid unsupported foot/ground
// contact in replacement scenes. This is a framing heuristic, not foot detection.
function portraitCrop(faces,width,height){
 if(!faces.length||Math.max(...faces.map(f=>f.h/height))>=.16)return null;
 const cropHeight=Math.floor(height*.78),cropWidth=Math.round(cropHeight*width/height);
 const minX=Math.min(...faces.map(f=>f.x-f.w*.65));
 const maxX=Math.max(...faces.map(f=>f.x+f.w*1.65));
 const maxY=Math.max(...faces.map(f=>f.y+f.h*1.4));
 if(maxX-minX>cropWidth||maxY>cropHeight)throw Error('Please move closer together and frame everyone from the waist up, then retake.');
 const left=Math.max(0,Math.min(width-cropWidth,Math.round((minX+maxX-cropWidth)/2)));
 if(minX<left||maxX>left+cropWidth)throw Error('Please frame everyone from the waist up, then retake.');
 return {left,top:0,width:cropWidth,height:cropHeight};
}
module.exports={portraitCrop};
