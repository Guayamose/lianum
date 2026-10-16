/** Mechanical body limits only. Callback DATA does not create an Original
 * account/channel or authorize spending. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {Readable} from 'node:stream';
import {createHash} from 'node:crypto';
import {createDevicePagedAgentMechanicalTransportV4,handleDevicePagedAgentMechanicalTransportV4} from '../../src/api/mobile/device-paged-agent-transport-v4.mjs';
import * as P from '../../../mobile-protocol/src/device-paged-owner-v3.mjs';
const h=v=>createHash('sha256').update(v).digest('hex');
test('only agent challenges admit the bounded full V5 grant body, other routes retain 8 KiB',async()=>{
 const point='0479be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798483ada7726a3c4655da4fbfc0e1108a8fd17b448a68554199c47d08ffb10d4b8',descriptor=P.normalizeDevicePagedDescriptorV3({profile:P.DEVICE_PAGED_OWNER_V3,graphProfile:P.DEVICE_PAGED_GRAPH_V3,sparseEncoding:P.DEVICE_PAGED_SPARSE_V3,origin:'https://localhost:9444',pairingId:'host-agent-bounds-v5',devicePublicKey:point,deadlineMs:Date.now()+60000,chainId:'11155111',...Object.fromEntries(['genesis','scope','policy','assetIdentity','domain','hubDomain','registryCommitment','manifestSHA256','consumerSHA256','poolCodeHash','stateCodeHash','nativeCodeHash','mathCodeHash'].map(k=>[k,h(k)])),...Object.fromEntries(['pool','state','native','math'].map((k,i)=>[k,'0x'+String(i+1).repeat(40)]))});let dispatches=0;
 const port=createDevicePagedAgentMechanicalTransportV4(descriptor,async(_path,body)=>{dispatches++;assert.equal(typeof body.data,'string');return{ok:true};});
 async function request(route,length){const input=Readable.from([Buffer.from(JSON.stringify({data:'x'.repeat(length)}))]);Object.assign(input,{method:'POST',url:'/v1/mobile/paged-owner/agent/'+route,headers:{'x-lianum-paged-pairing-id':descriptor.pairingId,'content-type':'application/json'}});let status=null;const response={writeHead(code){status=code;},end(){}};await handleDevicePagedAgentMechanicalTransportV4(port,input,response,()=>true);assert.equal(status,200);}
 try{await request('challenges',160000);assert.equal(dispatches,1);await assert.rejects(request('challenges',262144),/BODY_LIMIT/);for(const route of ['observations','revocations'])await assert.rejects(request(route,8192),/BODY_LIMIT/);assert.equal(dispatches,1);}finally{port.close();}
});
