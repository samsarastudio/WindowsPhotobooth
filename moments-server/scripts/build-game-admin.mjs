import {spawnSync} from 'node:child_process';
import {build} from 'esbuild';
import {readFile} from 'node:fs/promises';
import {transformAsync} from '@babel/core';
import linker from '@angular/compiler-cli/linker/babel';
const compile=spawnSync(process.execPath,['node_modules/@angular/compiler-cli/bundles/src/bin/ngc.js','-p','game-admin-ui/tsconfig.json'],{stdio:'inherit'});
if(compile.status!==0)process.exit(compile.status||1);
await build({entryPoints:['game-admin-ui/compiled/main.js'],bundle:true,format:'esm',minify:true,target:['es2022'],outfile:'public/js/game-admin-angular.js',define:{ngDevMode:'false',ngJitMode:'false'},legalComments:'linked',plugins:[{name:'angular-aot-linker',setup(builder){builder.onLoad({filter:/\.m?js$/},async({path})=>{if(!path.includes('node_modules'))return;const code=await readFile(path,'utf8');if(!code.includes('ɵɵngDeclare'))return;const linked=await transformAsync(code,{filename:path,configFile:false,babelrc:false,plugins:[[linker,{linkerJitMode:false}]]});return {contents:linked.code,loader:'js'};});}}]});
