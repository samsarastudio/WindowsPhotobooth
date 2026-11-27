import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const source=fs.readFileSync(new URL('../client-public/gallery.js',import.meta.url),'utf8');
const paint=source.slice(source.indexOf('  async function paintViewer()'),source.indexOf('  function moveViewer'));
function fixture(){
 const nodes=new Map(); const images=[]; const timers=[];
 const context=vm.createContext({
  visiblePhotos:[{id:'a',url:'a-large',thumbnailUrl:'a-small'},{id:'b',url:'b-large',thumbnailUrl:'b-small'}],
  viewerIndex:0,viewerRequest:0,viewerPhotoId:null,viewer:{open:true},collection:{brand:{}},slideTimer:null,
  settings:()=>({favoritesEnabled:false,slideshow:false}),canDownloadPhoto:()=>false,
  photoUrl:p=>p.url,thumbUrl:p=>p.thumbnailUrl,
  Image:class {constructor(){images.push(this);}},
  setTimeout:fn=>{timers.push(fn);return timers.length;},clearTimeout:()=>{},
  document:{getElementById:id=>{if(!nodes.has(id))nodes.set(id,{setAttribute(){},removeAttribute(){},replaceChildren(image){this.firstChild=image;}});return nodes.get(id);}}
 });
 vm.runInContext(paint,context);
 return {context,nodes,images,timers,paint:()=>vm.runInContext('paintViewer()',context)};
}
test('Swiping immediately changes the displayed preview even when full image never loads',async()=>{
 const f=fixture(); await f.paint(); f.context.viewerIndex=1; await f.paint();
 assert.equal(f.nodes.get('viewer-counter').textContent,'2 / 2');
 assert.equal(f.nodes.get('viewer-media').firstChild.src,'b-small');
 f.timers.at(-1)();
 assert.equal(f.nodes.get('viewer-media').firstChild.src,'b-small');
});
test('Out-of-order full image responses cannot restore a previous photo',async()=>{
 const f=fixture(); await f.paint(); const old=f.images[1];
 f.context.viewerIndex=1; await f.paint(); const latest=f.images[3];
 old.onload(); assert.equal(f.nodes.get('viewer-media').firstChild.src,'b-small');
 latest.onload(); assert.equal(f.nodes.get('viewer-media').firstChild.src,'b-large');
});
test('Failed full image retains selected preview and closed viewers reject late loads',async()=>{
 const f=fixture(); await f.paint(); f.images[1].onerror();
 assert.equal(f.nodes.get('viewer-media').firstChild.src,'a-small');
 f.context.viewerIndex=1; await f.paint(); f.context.viewer.open=false; f.images[3].onload();
 assert.equal(f.nodes.get('viewer-media').firstChild.src,'b-small');
});
