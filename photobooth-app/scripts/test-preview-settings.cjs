const fs=require('fs'),vm=require('vm'),assert=require('node:assert/strict'),path=require('path');const ts=require('typescript');
const source=fs.readFileSync(path.join(__dirname,'../src/app/services/booth-config.service.ts'),'utf8'),start=source.indexOf('function normalizeGuestFlowConfig('),end=source.indexOf('\nfunction normalizeConfigPayload',start);
const c={PHOTOBOOTH_DEFAULT_GUEST_FLOW:{thanksAutoReturnSec:8,boothId:'booth-1'}};vm.createContext(c);vm.runInContext(ts.transpile(source.slice(start,end)),c);
for(const legacy of [true,false]){const value=c.normalizeGuestFlowConfig({skipAiPreviewToThanks:legacy});assert.equal(value.skipPortraitPreviewToThanks,legacy);assert.equal(value.skipBackgroundPreviewToThanks,legacy);}
for(const portrait of [true,false])for(const background of [true,false]){const value=c.normalizeGuestFlowConfig({skipAiPreviewToThanks:true,skipPortraitPreviewToThanks:portrait,skipBackgroundPreviewToThanks:background});assert.equal(value.skipPortraitPreviewToThanks,portrait);assert.equal(value.skipBackgroundPreviewToThanks,background);}
console.log('PASS independent preview controls and legacy migration');
