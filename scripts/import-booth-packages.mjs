import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from '../src/config.js';
import format from '../src/lib/theme-package-format.cjs';
// Run on the Moments host after deploying code. No network credentials required.
const here=path.dirname(fileURLToPath(import.meta.url));
const source=process.argv.find(a=>a.startsWith('--from='))?.slice(7)||path.resolve(here,'../../deliverables/skin-packages');
const publish=process.argv.includes('--publish');
const root=path.join(config.dataDir,'booth-packages');fs.mkdirSync(root,{recursive:true});
for(const file of fs.readdirSync(source).filter(f=>f.endsWith('.booth.zip'))){
 const input=path.join(source,file),p=format.readPackage(input),m=p.manifest,key=m.id+'@'+m.version,dest=path.join(root,key+'.zip'),meta=path.join(root,key+'.json');
 if(fs.existsSync(dest)&&format.sha(fs.readFileSync(dest))!==p.sha256)throw Error('Existing version differs: '+key);
 if(!fs.existsSync(dest)){fs.copyFileSync(input,dest+'.tmp');fs.renameSync(dest+'.tmp',dest);}
 const old=fs.existsSync(meta)?JSON.parse(fs.readFileSync(meta,'utf8')):{};
 const record={id:m.id,version:m.version,name:m.name,description:m.description||'',minAppVersion:m.minAppVersion,bytes:p.bytes,sha256:p.sha256,published:publish||old.published===true,createdAt:old.createdAt||new Date().toISOString()};
 fs.writeFileSync(meta+'.tmp',JSON.stringify(record,null,2));fs.renameSync(meta+'.tmp',meta);console.log(key,record.published?'published':'draft');
}
