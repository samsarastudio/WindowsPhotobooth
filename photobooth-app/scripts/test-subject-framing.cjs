const {test}=require('node:test');
const assert=require('node:assert/strict');
const {subjectCrop}=require('../electron/subject-framing.cjs');
function mask(rects){const a=Buffer.alloc(600*400);for(const [left,top,right,bottom] of rects)for(let y=top;y<bottom;y++)for(let x=left;x<right;x++)a[y*600+x]=255;return a;}
test('low group gets uniform crop with every head and side inside',()=>{
 const crop=subjectCrop(mask([[110,190,250,400],[265,210,460,400]]),600,400);
 assert(crop);assert(crop.top>0);assert(Math.abs(crop.width/crop.height-1.5)<.005,'aspect ratio within one raster pixel');
 assert(crop.left<110);assert(crop.left+crop.width>460);assert(crop.top<190);
 assert((190-crop.top)/crop.height<190/400);
 assert.equal(crop.top+crop.height,400,'bottom stays attached to image edge');
});
test('masked subject without face detection uses the same silhouette rule',()=>assert(subjectCrop(mask([[210,180,390,400]]),600,400)));
test('wide or already well-framed groups are not clipped to force headroom',()=>{
 assert.equal(subjectCrop(mask([[0,190,600,400]]),600,400),null);
 assert.equal(subjectCrop(mask([[110,50,460,400]]),600,400),null);
 assert.equal(subjectCrop(Buffer.alloc(600*400),600,400),null);
});
