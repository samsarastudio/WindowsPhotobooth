const assert=require('node:assert/strict');const {printerConnectionError}=require('../electron/printer-readiness.cjs');
assert.match(printerConnectionError({name:'Canon SELPHY CP1500',workOffline:true,printerStatus:3}),/offline/);
assert.match(printerConnectionError({name:'Canon',workOffline:false,printerStatus:7}),/offline/);
assert.equal(printerConnectionError({name:'Canon',workOffline:false,printerStatus:3}),null);
assert.equal(printerConnectionError({name:'Canon',workOffline:false,printerStatus:4}),null);
assert.match(printerConnectionError(null),/no longer installed/);
console.log('PASS printer readiness: offline flag, offline status, online, printing, missing queue');
