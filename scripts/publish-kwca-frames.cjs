// Publish the approved KWCA frames to the existing Moments admin frame library.
// Credentials stay in moments-server/.env and are never printed or committed.
const fs=require('fs'),path=require('path'),crypto=require('crypto');
const root=path.resolve(__dirname,'..');
const env=require(path.join(root,'moments-server/node_modules/dotenv')).parse(fs.readFileSync(path.join(root,'moments-server/.env')));
const base=process.env.MOMENTS_BASE_URL||'https://moments.inmomentservices.com';
const sha=buffer=>crypto.createHash('sha256').update(buffer).digest('hex');
(async()=>{
 for(const orientation of ['landscape','portrait']){
  const filename=`cricket-${orientation}.png`,bytes=fs.readFileSync(path.join(root,'skin-packages/sports-cricket/config/photo-frames',filename));
  const body=new FormData();body.append('frame',new Blob([bytes],{type:'image/png'}),filename);body.append('filename',filename);
  const response=await fetch(base+'/api/admin/frames',{method:'POST',headers:{'x-admin-pin':env.ADMIN_PIN},body,signal:AbortSignal.timeout(60000)});
  if(!response.ok)throw Error(`Upload ${filename}: HTTP ${response.status}`);
  const result=await response.json();if(!result.ok||result.frame.filename!==filename)throw Error('Unexpected frame response');
  const download=await fetch(base+'/media/frames/'+filename+'?verify='+Date.now(),{signal:AbortSignal.timeout(60000)});
  if(!download.ok)throw Error('Frame download failed');
  const downloaded=Buffer.from(await download.arrayBuffer());if(sha(downloaded)!==sha(bytes))throw Error('Frame checksum mismatch');
  console.log(JSON.stringify({filename,bytes:bytes.length,sha256:sha(bytes),verified:true}));
 }
})().catch(e=>{console.error(e.message);process.exitCode=1});
