'use strict';
const fs=require('node:fs');
const path=require('node:path');
const {randomUUID}=require('node:crypto');

function backgroundSetInfo(full) {
 const metadata=full.replace(/\.[^.]+$/,'.depths.json');
 if(!fs.existsSync(metadata))return {isSet:false,variantCount:0};
 const data=JSON.parse(fs.readFileSync(metadata,'utf8'));
 return {isSet:data.version===1,variantCount:Object.keys(data.variants||{}).length,displayName:typeof data.displayName==='string'?data.displayName:undefined};
}

function removeBackgroundSet(directory,filename) {
 const root=fs.realpathSync(directory);
 if(!filename||path.basename(filename)!==filename||filename.includes('..'))throw Error('Invalid background filename.');
 const base=path.join(root,filename),stem=path.parse(filename).name;
 const sidecar=path.join(root,stem+'.depths.json');
 const files=[base];
 if(fs.existsSync(sidecar)){
  const data=JSON.parse(fs.readFileSync(sidecar,'utf8'));
  const variantRoot=path.join(root,'depths',stem)+path.sep;
  for(const relative of Object.values(data.variants||{})){
   if(typeof relative!=='string')throw Error('Invalid background set.');
   const file=path.resolve(root,relative);
   if(!file.startsWith(variantRoot))throw Error('Variant is outside this background set.');
   if(fs.existsSync(file))files.push(file);
  }
  files.push(sidecar);
 }
 // Validate every file before any mutation, including junction/symlink targets.
 for(const file of files){
  const real=fs.realpathSync(file);
  const relative=path.relative(root,real);
  if(relative.startsWith('..')||path.isAbsolute(relative)||!fs.statSync(file).isFile())throw Error('Unsafe background set path.');
 }
 const archive=path.join(root,'.removed',randomUUID());
 const moved=[];
 try {
  for(const file of new Set(files)){
   const target=path.join(archive,path.relative(root,file));
   fs.mkdirSync(path.dirname(target),{recursive:true});fs.renameSync(file,target);moved.push([file,target]);
  }
 } catch(error){
  for(const [file,target] of moved.reverse())fs.renameSync(target,file);
  throw error;
 }
 return {removed:filename,removedFiles:moved.length};
}
module.exports={backgroundSetInfo,removeBackgroundSet};
