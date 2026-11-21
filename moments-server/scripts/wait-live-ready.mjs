import {setTimeout as delay} from 'node:timers/promises';
const url=process.argv[2]||'http://127.0.0.1:3021/api/health';
const deadline=Date.now()+30000;
let detail='No response';
while(Date.now()<deadline){
  try{
    const response=await fetch(url,{signal:AbortSignal.timeout(2000),cache:'no-store'});
    const body=await response.json();
    if(response.ok&&body.ok===true&&body.service==='moments-live'){
      console.log('Moments Live is ready.');process.exit(0);
    }
    detail=`HTTP ${response.status}: unexpected health response`;
  }catch(error){detail=error.message;}
  await delay(500);
}
console.error(`Moments Live did not become ready within 30 seconds: ${detail}`);
process.exit(1);
