const fs=require('fs'),path=require('path');
const root=path.resolve(__dirname,'../..'),out=path.join(root,'builds/ai-flow-qa'),samples=path.join(root,'moments-server/public/assets/halloween/samples');
fs.mkdirSync(out,{recursive:true});
for(const [from,to] of [['portrait-original.png','single.png'],['scene-original.png','group.png'],['scene-original.png','family-kids.png']])fs.copyFileSync(path.join(samples,from),path.join(out,to));
fs.copyFileSync(path.join(__dirname,'fixtures/vampire-api-response.png'),path.join(out,'head-api-raw.png'));
console.log('QA fixtures ready: generated sample guests and recorded portrait API response.');
