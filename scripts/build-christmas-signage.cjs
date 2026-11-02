'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),{execFileSync}=require('node:child_process'),sharp=require('sharp');
const root=path.resolve(__dirname,'../..'),out=path.join(root,'output/christmas/signage'),dest=path.join(root,'moments-server/public/assets/signage');fs.mkdirSync(out,{recursive:true});
const slides=[
 ['A LITTLE CHRISTMAS MAGIC','MerryBooth','Gather close. Make a memory.','photobooth-app/public/christmas/classic.png','CLASSIC PHOTO · CAD $10'],
 ['YOUR CHRISTMAS KEEPSAKE','Print the moment','A postcard to keep. A memory to share.','moments-server/public/assets/halloween/samples/scene-ai.png','CLASSIC PHOTO · CAD $10'],
 ['MEET YOUR FESTIVE ALTER EGO','Christmas portraits','Seven characters. Your own likeness.','photobooth-app/config/compositions/witch/composition.png','AI PHOTO · CAD $15'],
 ['STEP INTO THE STORY','Choose your scene','Ten Christmas scenes, made for your group.','output/christmas/qa/family-moonlit-manor.png','CUSTOM CHRISTMAS BACKDROPS'],
 ['TAKE THE MAGIC HOME','The keepsake bundle','Postcard print · Photo magnet · Digital copy','moments-server/public/assets/halloween/samples/scene-ai.png','KEEPSAKE BUNDLE · CAD $25'],
 ['INMOMENT PRESENTS','Your Christmas moment','Visit the booth. We will take it from here.','output/christmas/qa/family-haunted-crypt.png','ASK YOUR HOST ABOUT TODAY’S OFFERS']
];
const esc=s=>s.replaceAll('&','&amp;').replaceAll('<','&lt;');
(async()=>{
 for(const [i,[eyebrow,title,sub,photo,footer]]of slides.entries()){
  const art=await sharp(path.join(root,photo)).resize(936,1100,{fit:'contain',background:'#10352b'}).png().toBuffer();
  const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1920"><rect width="1080" height="1920" fill="#09251f"/><rect x="32" y="32" width="1016" height="1856" rx="20" fill="none" stroke="#dfc18b" stroke-width="2"/><text x="540" y="145" text-anchor="middle" fill="#dfc18b" font-family="Segoe UI" font-size="23" letter-spacing="5">${esc(eyebrow)}</text><text x="540" y="255" text-anchor="middle" fill="#faf1df" font-family="Georgia" font-size="66">${esc(title)}</text><text x="540" y="325" text-anchor="middle" fill="#c9d9cd" font-family="Segoe UI" font-size="28">${esc(sub)}</text><rect x="60" y="406" width="960" height="1124" rx="12" fill="#dfc18b"/><text x="540" y="1660" text-anchor="middle" fill="#dfc18b" font-family="Segoe UI" font-size="29" font-weight="bold" letter-spacing="2">${esc(footer)}</text><text x="540" y="1780" text-anchor="middle" fill="#c9d9cd" font-family="Segoe UI" font-size="24" letter-spacing="6">INMOMENT · CHRISTMAS 2026</text></svg>`;
  const file=path.join(out,`slide-${i}.png`);await sharp(Buffer.from(svg)).composite([{input:art,left:72,top:418}]).png().toFile(file);
  execFileSync('ffmpeg',['-y','-v','error','-loop','1','-i',file,'-t','10','-vf','fade=t=in:st=0:d=0.5,fade=t=out:st=9.5:d=0.5','-r','30','-c:v','libx264','-preset','fast','-crf','22','-pix_fmt','yuv420p',path.join(out,`slide-${i}.mp4`)],{windowsHide:true});
 }
 const list=path.join(out,'concat.txt');fs.writeFileSync(list,slides.map((_,i)=>`file '${path.join(out,`slide-${i}.mp4`).replaceAll('\\','/')}'`).join('\n'));
 const video=path.join(out,'christmas-portrait.mp4');execFileSync('ffmpeg',['-y','-v','error','-f','concat','-safe','0','-i',list,'-c','copy','-movflags','+faststart',video],{windowsHide:true});
 execFileSync('ffmpeg',['-v','error','-i',video,'-f','null','-'],{windowsHide:true});
 const bytes=fs.readFileSync(video),hash=crypto.createHash('sha256').update(bytes).digest('hex'),name=`christmas-portrait-${hash.slice(0,16)}.mp4`;fs.copyFileSync(video,path.join(dest,name));
 fs.writeFileSync(path.join(dest,'manifest.json'),JSON.stringify({portrait:{version:hash,url:'/assets/signage/'+name,bytes:bytes.length,width:1080,height:1920,fps:'30/1',frames:1800,seconds:60,decode:'passed'}},null,2)+'\n');
 console.log('Christmas signage rendered and decoded successfully:',name);
})().catch(e=>{console.error(e);process.exitCode=1});
