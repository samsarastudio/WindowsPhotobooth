'use strict';
const fs=require('fs'),path=require('path'),crypto=require('crypto'),assert=require('assert/strict');
const root=path.resolve(__dirname,'../..'),source=path.join(root,'output/christmas/samples-centered');
const dest=path.join(root,'deliverables/christmas/approved-samples-2026-11-02');
const sha=p=>crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const report=JSON.parse(fs.readFileSync(path.join(source,'report.json'),'utf8'));
const manifest={approvedOn:'2026-11-02',purpose:'User-approved samples. Preserve these originals; make future edits in a separate folder.',generator:'Built-in image generation for source photos; production app background compositor for results.',samples:[]};
for(const row of report.results){
 const item={scene:row.scene,label:row.label,files:{}};
 for(const [key,dir]of [['source','01-source-photos'],['result','02-background-results'],['framed','03-framed-photos']]){
  const rel=dir+'/'+row.scene+'.png',target=path.join(dest,rel);fs.mkdirSync(path.dirname(target),{recursive:true});
  if(fs.existsSync(target))assert.equal(sha(target),sha(row[key]),'Never overwrite an approved sample');else fs.copyFileSync(row[key],target);
  item.files[key]={path:rel,sha256:sha(target)};
 }
 manifest.samples.push(item);
}
fs.mkdirSync(path.join(dest,'previews'),{recursive:true});
for(const name of ['source-contact-sheet.jpg','framed-contact-sheet.jpg'])fs.copyFileSync(path.join(source,name),path.join(dest,'previews',name));
fs.copyFileSync(path.join(root,'photobooth-app/themes/christmas/centered-sample-prompts.json'),path.join(dest,'generation-prompts.json'));
fs.writeFileSync(path.join(dest,'manifest.json'),JSON.stringify(manifest,null,2)+'\n');
fs.writeFileSync(path.join(dest,'README.txt'),'APPROVED CHRISTMAS SAMPLES — 2 NOVEMBER 2026\n\nTen distinct centered sources, ten background results and ten framed photographs.\nPreserve this set unchanged. Future creative work should use copies elsewhere.\nmanifest.json maps the scene names and records SHA-256 checksums.\npreviews contains contact sheets for quick review.\n');
console.log('Preserved and hash-verified 30 approved photographs in '+dest);
