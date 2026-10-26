function subjectCrop(alpha,width,height) {
 let minX=width,maxX=-1,minY=height;
 for(let y=0;y<height;y++)for(let x=0;x<width;x++)if(alpha[y*width+x]>32){minX=Math.min(minX,x);maxX=Math.max(maxX,x);minY=Math.min(minY,y);}
 if(maxX<minX||minY<height*.25)return null;
 // Frame a tighter portrait, allowing ordinary edge cropping of lower arms or
 // clothing. Protect the entire upper silhouette (including masked heads).
 minX=width;maxX=-1;
 for(let y=minY;y<Math.min(height,minY+Math.ceil(height*.28));y++)for(let x=0;x<width;x++)if(alpha[y*width+x]>32){minX=Math.min(minX,x);maxX=Math.max(maxX,x);}
 const margin=Math.ceil(width*.035);
 const targetHeight=(height-minY)/.85;
 const cropW=Math.min(width,Math.max(Math.ceil(width*.55),Math.ceil(targetHeight*width/height),maxX-minX+1+2*margin));
 const cropH=Math.round(cropW*height/width);
 if(cropH>=height)return null;
 const left=Math.max(0,Math.min(width-cropW,Math.round((minX+maxX-cropW)/2)));
 const top=height-cropH;
 if(minX<left||maxX>=left+cropW||top>minY-margin)return null;
 return {left,top,width:cropW,height:cropH};
}
module.exports={subjectCrop};
