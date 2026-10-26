'use strict';
const fs = require('node:fs');
const path = require('node:path');
const request = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
(async () => {
  try {
    const result = await require('./ai-edit-preparation.cjs').prepareScene(request.source, request.background, request.modelDir);
    fs.writeFileSync(path.join(request.dir, 'image.png'), result.image);
    fs.writeFileSync(path.join(request.dir, 'reference.png'), result.reference);
    fs.writeFileSync(path.join(request.dir, 'result.json'), JSON.stringify({ok:true,depth:result.depth}));
    process.exit(0);
  } catch (error) {
    fs.writeFileSync(path.join(request.dir, 'result.json'), JSON.stringify({ok:false,error:String(error.message || error)}));
    process.exit(1);
  }
})();
