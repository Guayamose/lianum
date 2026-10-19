import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture} from '../../../packages/backend/tests/providers/fixtures/paged-mixed-host-v7.mjs';
import {createDevicePagedOwnerApiV3} from '../src/api/device-paged-owner-api-v3.mjs';
import {deviceSepoliaDefiFeedbackV7} from '../src/screens/sepolia-defi-feedback-v7.mjs';
test('SDK only exposes the exact typed short-epoch refusal; no private backend error reaches the UI',async()=>{
 const descriptor=fixture().authority.entries[0].authority.descriptor;
 const draft={action:'READ_STATE',jobId:'host-window-read',rootId:'a'.repeat(64),revision:1,mode:null,publicInputs:null,witnessSHA256:null,authorizationRoot:null,reserveNullifier:null,previousCommitment:null,nextCommitment:null,proofSHA256:null};
 for(const [body,expected]of [[{error:'PAGED_DEVICE_NOTE_EPOCH_TOO_SHORT'},'MOBILE_PAGED_NOTE_EPOCH_TOO_SHORT'],[{error:'PAGED_DEVICE_NOTE_EPOCH_CHANGED'},'MOBILE_PAGED_NOTE_EPOCH_CHANGED'],[{error:'PRIVATE_BACKEND_DETAILS'},'MOBILE_PAGED_SERVICE_UNAVAILABLE'],[{error:'PAGED_DEVICE_NOTE_EPOCH_TOO_SHORT',extra:'untrusted'},'MOBILE_PAGED_SERVICE_UNAVAILABLE']]){
  const api=createDevicePagedOwnerApiV3({descriptor,fetchImpl:async()=>new Response(JSON.stringify(body),{status:403})});try{await assert.rejects(api.challenge(draft),error=>error.message===expected);}finally{await api.close();}
 }
 assert.match(deviceSepoliaDefiFeedbackV7(Error('MOBILE_PAGED_NOTE_EPOCH_TOO_SHORT')),/Preparation has not started/);
});
