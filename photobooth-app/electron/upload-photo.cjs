const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

// Preserve local print masters. Only the gallery transport copy is JPEG.
async function prepareUploadPhoto(file) {
  const source = fs.readFileSync(file);
  const metadata = await sharp(source).metadata();
  const buffer = metadata.format === 'jpeg' ? source : await sharp(source)
    .rotate().flatten({ background: '#ffffff' }).toColourspace('srgb')
    .jpeg({ quality: 98, chromaSubsampling: '4:4:4' }).toBuffer();
  return { buffer, filename: path.parse(file).name + '.jpg', contentType: 'image/jpeg' };
}
module.exports = { prepareUploadPhoto };
