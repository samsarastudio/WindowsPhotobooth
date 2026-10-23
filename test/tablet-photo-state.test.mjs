import test from 'node:test';
import assert from 'node:assert/strict';
import { tabletProcessStatus } from '../src/tablet-photo-state.js';
test('AI processing and failures are never replaced by a ready classic frame',()=>{
 for(const status of ['processing','failed','ready']){
 const source={variant:'original',process_status:status};
 assert.equal(tabletProcessStatus([source]),status);
 assert.equal(tabletProcessStatus([source,{variant:'framed',process_status:'ready'}]),status);
 assert.equal(tabletProcessStatus([source,{variant:'ai',process_status:'ready'}]),'ready');
 }
});
