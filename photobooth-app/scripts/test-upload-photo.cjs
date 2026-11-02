const fs=require('fs'),path=require('path'),os=require('os'),assert=require('assert/strict'),sharp=require('sharp');
const {prepareUploadPhoto}=require('../electron/upload-photo.cjs');
(async()=>{const root=fs.mkdtempSync(path.join(os.tmpdir(),'upload-jpeg-'));try{
 const file=path.join(root,'capture_ai.png');
 const input=await sharp({create:{width:120,height:180,channels:4,background:{r:255,g:0,b:0,alpha:0}}}).png().toBuffer();fs.writeFileSync(file,input);
 const r=await prepareUploadPhoto(file),m=await sharp(r.buffer).metadata();assert.equal(r.filename,'capture_ai.jpg');assert.equal(r.contentType,'image/jpeg');assert.equal(m.format,'jpeg');assert.equal(m.width,120);assert.equal(m.height,180);assert.equal(m.chromaSubsampling,'4:4:4');assert.deepEqual(fs.readFileSync(file),input);
 const pixel=await sharp(r.buffer).raw().toBuffer();assert(pixel[0]>250&&pixel[1]>250&&pixel[2]>250,'Transparency flattened to white');
 const jpg=path.join(root,'capture.jpg');fs.writeFileSync(jpg,r.buffer);assert.deepEqual((await prepareUploadPhoto(jpg)).buffer,r.buffer,'Existing JPEG is not recompressed');
 console.log('PASS JPEG format, dimensions, 4:4:4, alpha handling, unchanged master, JPEG passthrough');
}finally{fs.rmSync(root,{recursive:true,force:true});}})().catch(e=>{console.error(e);process.exitCode=1});
