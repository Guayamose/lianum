/** Original JS transport and SDK routing; native TLS bridge is explicitly
 * HOST inert. No certificate, hardware, signature or financial acceptance. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {generateKeyPairSync} from 'node:crypto';

test('constructor-scoped Paged pairing reaches TLS session; caller cannot change routing headers',async t=>{
 const sessions=new Map(),posts=[],openedDeadlines=[];let count=0,responseDescriptor;
 const descriptor={profile:'LIANUM_DEVICE_PAGED_OWNER_V3',graphProfile:'LIANUM_PAEG_FUNDED_PAGED_V3',sparseEncoding:'BN254_POSEIDON2_SPARSE_V3',origin:'https://api.lianum.oryontechnology.com',pairingId:'paged-routing-original-one',deadlineMs:Date.now()+60000,chainId:'31337',genesis:'1'.repeat(64),pool:'0x'+'a'.repeat(40),state:'0x'+'b'.repeat(40),native:'0x'+'c'.repeat(40),scope:'2'.repeat(64),policy:'3'.repeat(64),assetIdentity:'4'.repeat(64),domain:'5'.repeat(64),hubDomain:'6'.repeat(64),registryCommitment:'7'.repeat(64),manifestSHA256:'8'.repeat(64),consumerSHA256:'9'.repeat(64),poolCodeHash:'a'.repeat(64),stateCodeHash:'b'.repeat(64),nativeCodeHash:'c'.repeat(64),math:'0x'+'d'.repeat(40),mathCodeHash:'d'.repeat(64)};
 const device=generateKeyPairSync('ec',{namedCurve:'secp256k1'}),jwk=device.publicKey.export({format:'jwk'});descriptor.devicePublicKey='04'+Buffer.from(jwk.x,'base64url').toString('hex')+Buffer.from(jwk.y,'base64url').toString('hex');
 const bridge={async open(group,origin,certificate,hash,deadline,pairingId){assert.equal(arguments.length,6);assert.equal(group,'PAGED');assert.equal(origin,descriptor.origin);assert.equal(pairingId,descriptor.pairingId);assert.ok(deadline>Date.now()&&deadline-Date.now()<=9*60*60*1000,'Android requires a live TLS session of at most nine hours');openedDeadlines.push(deadline);const session='host-tls-'+(++count);sessions.set(session,Object.freeze({group,origin,pairingId}));return session;},async post(id,requestId,path,body){const session=sessions.get(id);assert.ok(session);assert.equal(arguments.length,4,'no per-request routing override reaches bridge');posts.push({session,requestId,path,body});return{status:200,body:JSON.stringify({profile:'LIANUM_DEVICE_PAGED_GRAPH_OWNER_V3',descriptor:responseDescriptor??descriptor}),contentType:'application/json',contentLength:null};},cancel(){},async close(id){sessions.delete(id);},async readConnectionProfile(){throw Error('HOST_NO_CLIPBOARD');}};
 t.mock.module('react-native',{exports:{Platform:{OS:'android'},TurboModuleRegistry:{get:()=>bridge}}});
 t.mock.module('expo-crypto',{exports:{getRandomBytesAsync:async()=>{throw Error('HOST_NO_PROOF_OR_PERMISSION');},AESEncryptionKey:{},AESSealedData:{},aesEncryptAsync:async()=>{throw Error('HOST_NO_ENCRYPTED_COMMAND');},aesDecryptAsync:async()=>{throw Error('HOST_NO_ENCRYPTED_REPLY');}}});
 const {createDevicePagedConnectionTransportV3}=await import('../src/api/device-paged-connection-transport-v3.ts'),{createDevicePagedGraphApiV3}=await import('../src/api/device-paged-graph-api-v3.mjs');
 const profile={format:'DEVICE_PAGED_PRIVATE_GRAPH_CONNECTION_V3',descriptor,transport:{type:'ANDROID_PINNED_TLS_V1',certificatePEM:'-----BEGIN CERTIFICATE-----\nAA==\n-----END CERTIFICATE-----\n',certificateSHA256:'e'.repeat(64)}},transport=await createDevicePagedConnectionTransportV3(profile);
 t.after(()=>transport.close());const sdk=createDevicePagedGraphApiV3({descriptor,fetchImpl:transport.fetchImpl});t.after(()=>sdk.close());
 await sdk.pairing();assert.equal(posts.length,1);assert.equal(posts[0].session.pairingId,descriptor.pairingId);
 const input=descriptor.origin+'/v1/mobile/paged-owner/graph/pairing';
 for(const headers of [{'Content-Type':'application/json'},{'Content-Type':'application/json','x-lianum-paged-pairing-id':'paged-routing-foreign-two'},{'Content-Type':'application/json','x-lianum-paged-pairing-id':descriptor.pairingId,Authorization:'caller'}])await assert.rejects(transport.fetchImpl(input,{method:'POST',headers,body:'{}'}),/MOBILE_PAGED_TLS_REQUEST/);
 assert.equal(posts.length,1,'invalid routes never enter native post');await sdk.close();await transport.close();assert.equal(sessions.size,0);
 assert.equal(openedDeadlines[0],descriptor.deadlineMs,'short permissions retain their original expiry');
 const longDeadline=Date.now()+40*24*60*60*1000,longDescriptor={...descriptor,deadlineMs:longDeadline};responseDescriptor=longDescriptor;
 const longTransport=await createDevicePagedConnectionTransportV3({...profile,descriptor:longDescriptor});t.after(()=>longTransport.close());
 const longSdk=createDevicePagedGraphApiV3({descriptor:longDescriptor,fetchImpl:longTransport.fetchImpl});t.after(()=>longSdk.close());
 await longSdk.pairing();assert.equal(longDescriptor.deadlineMs,longDeadline,'financial permission is not shortened or renewed');
 assert.ok(openedDeadlines[1]<longDeadline);await longSdk.close();await longTransport.close();
 await assert.rejects(createDevicePagedConnectionTransportV3({...profile,descriptor:{...descriptor,deadlineMs:Date.now()-1}}),/live TLS session/);
 assert.equal(sessions.size,0);
});
