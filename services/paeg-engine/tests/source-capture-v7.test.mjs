import test from 'node:test';
import assert from 'node:assert/strict';
import {assertPreservedSourceCaptureV7} from '../src/public/assert-source-capture-v7.mjs';
const before={profile:'HOST_SOURCE_JOURNAL',configurationSHA256:'a'.repeat(64),revision:88,operations:[{id:'HOST_ORIGINAL_TRANSACTION',signed:{nativeWire:'HOST_SIGNED_WIRE'},phase:'FINALIZED'}]};
test('capture permits its single checkpoint increment with identical operations',()=>{
 assertPreservedSourceCaptureV7(before,{...structuredClone(before),revision:89});
});
for(const fault of ['revision','wire','additional','configuration','phase'])test('capture rejects changes to '+fault,()=>{
 const after={...structuredClone(before),revision:89};
 if(fault==='revision')after.revision++;
 if(fault==='wire')after.operations[0].signed.nativeWire='HOST_DIFFERENT_WIRE';
 if(fault==='additional')after.operations.push(structuredClone(after.operations[0]));
 if(fault==='configuration')after.configurationSHA256='b'.repeat(64);
 if(fault==='phase')after.operations[0].phase='UNKNOWN';
 assert.throws(()=>assertPreservedSourceCaptureV7(before,after));
});
