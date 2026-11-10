const fs=require('fs');
const {cutout}=require('./family-card.cjs');
(async()=>{const [source,model,out]=process.argv.slice(2);fs.writeFileSync(out,await cutout(source,model));})().then(()=>process.exit(0)).catch(e=>{console.error(e.message);process.exit(1)});
