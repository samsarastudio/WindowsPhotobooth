const fs=require('fs'),sharp=require('../photobooth-app/node_modules/sharp');
(async()=>{const chunks=[];for await(const b of process.stdin)chunks.push(b);const input=Buffer.concat(chunks);const out=await sharp(input).webp({lossless:true,effort:4}).toBuffer();process.stdout.write(out);})();
