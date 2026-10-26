const fs = require('fs');
function resolveMagnetSource(imagePath) {
  let source = imagePath.replace(/_framed\.png$/i, '.png');
  if (/_ai\.png$/i.test(source)) {
    source = source.replace(/_ai\.png$/i, '_ai_raw.png');
    if (!fs.existsSync(source)) throw Error('This AI photo has no unframed background source. Portraits cannot be made into magnets.');
  } else if (source !== imagePath && !fs.existsSync(source)) {
    source = source.replace(/\.png$/i, '.jpg');
  }
  if (!fs.existsSync(source)) throw Error('Unframed photo not found. Please retake the photo.');
  return source;
}
module.exports = {resolveMagnetSource};
