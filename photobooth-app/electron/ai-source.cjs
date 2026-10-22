'use strict';
const fs=require('node:fs');
function resolveAiSource(imagePath){
 if(!/_(?:framed|physical)(?:_(?:framed|physical))*\.png$/i.test(imagePath))return imagePath;
 const original=imagePath.replace(/(?:_(?:framed|physical|ai))+\.png$/i,'.jpg');
 if(!fs.existsSync(original))throw Error('The original capture is missing. Please retake the photo.');
 return original;
}
module.exports={resolveAiSource};
