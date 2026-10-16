import test from 'node:test';
import assert from 'node:assert/strict';
import {sepoliaDefiFixtureV7,defiHashV7 as h} from './helpers/sepolia-defi-fixture-v7.mjs';
test('the DeFi TLS realm pins pairing and permits only fixed matching review-reference metadata',async t=>{
  const {connection}=sepoliaDefiFixtureV7(),posts=[];let closed=false;
  const bridge={async open(group,origin,certificate,hash,deadline,pairing){assert.equal(group,'SEPOLIA_DEFI_V7');assert.equal(origin,connection.descriptor.origin);assert.equal(pairing,connection.descriptor.pairingId);return'host-original-defi';},async post(session,id,path,body){assert.equal(arguments.length,4);posts.push({path,body});return{status:200,body:'{}',contentType:'application/json',contentLength:'2'};},cancel(){},async close(){closed=true;},readConnectionProfile:async()=>JSON.stringify(connection)};
  t.mock.module('react-native',{exports:{Platform:{OS:'android'},TurboModuleRegistry:{get:()=>bridge}}});t.mock.module('expo-crypto',{exports:{}});
  const {createDeviceSepoliaDefiPinnedTransportV7}=await import('../src/api/device-paged-connection-transport-v3.ts'),transport=await createDeviceSepoliaDefiPinnedTransportV7(connection);t.after(()=>transport.close());
  const headers={Accept:'application/json',Origin:connection.descriptor.origin,'Content-Type':'application/json','x-lianum-defi-pairing-id':connection.descriptor.pairingId},path=connection.descriptor.origin+'/v1/mobile/sepolia-defi-shares/';
  await transport.fetchImpl(path+'financial-observe',{method:'POST',headers,body:'{}'});assert.equal(posts.length,1);
  const reference=h('review');await transport.fetchImpl(path+'reviews',{method:'POST',headers:{...headers,'x-lianum-defi-review-reference':reference},body:JSON.stringify({reference})});assert.equal(posts.length,2);
  for(const [route,extra,body]of [['financial-submit',{'x-lianum-defi-pairing-id':h('foreign')},'{}'],['reviews',{'x-lianum-defi-review-reference':h('foreign')},JSON.stringify({reference})],['reviews',{},JSON.stringify({reference})],['financial-submit',{Authorization:'caller'},'{}']])await assert.rejects(transport.fetchImpl(path+route,{method:'POST',headers:{...headers,...extra},body}),/MOBILE_PAGED_TLS_REQUEST/);
  await assert.rejects(transport.fetchImpl(connection.descriptor.origin+'/v1/mobile/external-flat-share/status',{method:'POST',headers,body:'{}'}),/MOBILE_PAGED_TLS_REQUEST/);assert.equal(posts.length,2);
  await transport.close();assert.equal(closed,true);
});
