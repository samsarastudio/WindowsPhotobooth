'use strict';
const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const dir=path.resolve(__dirname,'../config/ai-models');
const models=[
  ['birefnet-lite.onnx','https://github.com/danielgatis/rembg/releases/download/v0.0.0/BiRefNet-general-bb_swin_v1_tiny-epoch_232.onnx','5600024376f572a557870a5eb0afb1e5961636bef4e1e22132025467d0f03333'],
  ['u2net.onnx','https://github.com/danielgatis/rembg/releases/download/v0.0.0/u2net.onnx','8d10d2f3bb75ae3b6d527c77944fc5e7dcd94b29809d47a739a7a728a912b491'],
  ['yunet.onnx','https://github.com/opencv/opencv_zoo/raw/refs/heads/main/models/face_detection_yunet/face_detection_yunet_2023mar.onnx','8f2383e4dd3cfbb4553ea8718107fc0423210dc964f9f4280604804ed2552fa4'],
];
async function main(){
  fs.mkdirSync(dir,{recursive:true});
  for(const [name,url,hash] of models){
    const file=path.join(dir,name);
    let data=fs.existsSync(file)?fs.readFileSync(file):null;
    if(!data||crypto.createHash('sha256').update(data).digest('hex')!==hash){
      const response=await fetch(url,{signal:AbortSignal.timeout(180000)});
      if(!response.ok)throw Error(`Model download failed: ${name} (${response.status})`);
      data=Buffer.from(await response.arrayBuffer());
      if(crypto.createHash('sha256').update(data).digest('hex')!==hash)throw Error(`Model checksum mismatch: ${name}`);
      fs.writeFileSync(file,data);
    }
    console.log(`${name}: verified`);
  }
}
main().catch(error=>{console.error(error.message);process.exitCode=1});
