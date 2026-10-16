import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash,createECDH} from 'node:crypto';
import {DEVICE_EXTERNAL_FLAT_NOTE_V1,DEVICE_EXTERNAL_FLAT_SHARE_V1} from '../../../packages/mobile-protocol/src/device-external-flat-note-v1.mjs';
const h=value=>createHash('sha256').update(value).digest('hex');
function identity(byte){const curve=createECDH('secp256k1');curve.setPrivateKey(Buffer.alloc(32,byte));return curve.getPublicKey(null,'uncompressed').toString('hex');}
const key=identity(1),otherKey=identity(2);
// Public framing only; no TLS acceptance, private material or balance authority.
const pin={type:'ANDROID_PINNED_TLS_V1',certificatePEM:'-----BEGIN CERTIFICATE-----\nAAAA\n-----END CERTIFICATE-----\n',certificateSHA256:h('public-test-leaf')};
function descriptor(share=false){return{profile:share?DEVICE_EXTERNAL_FLAT_SHARE_V1:DEVICE_EXTERNAL_FLAT_NOTE_V1,origin:'https://127.0.0.1:9444',pairingId:h(share?'target-pair':'source-pair'),devicePublicKey:key,lifetime:h(share?'target-lifetime':'source-lifetime'),poolTerms:Object.fromEntries(['pool','poolCodeHash','scope','policy','assetIdentity','asset','assetCodeHash','genesis','domainCommitment','hub','hubCodeHash','hubDomain','ledgerNamespace'].map(name=>[name,h((share&&!['genesis','hub','hubCodeHash','hubDomain'].includes(name)?'target:':'')+name).slice(0,['pool','asset','hub'].includes(name)?40:64)])),assetMetadata:{kind:'ERC20',symbol:share?'OUT':'USDC',decimals:share?18:6}};}
const external=()=>JSON.stringify({format:'DEVICE_EXTERNAL_FLAT_CONNECTION_V1',pairing:{profile:'DEVICE_EXTERNAL_FLAT_AAVE_PAIRING_V1',source:descriptor(),target:descriptor(true)},transport:pin});
const positions=()=>JSON.stringify({format:'DEVICE_DEFI_POSITIONS_CONNECTION_V1',descriptor:{origin:'https://127.0.0.1:9555',pairingId:h('positions-pair'),devicePublicKey:key},transport:pin});
test('public profiles persist exact identities, stay UNKNOWN and never adopt custody or partial writes',async t=>{
 t.mock.module('expo-crypto',{exports:{CryptoDigestAlgorithm:{SHA256:'SHA-256'},async digest(algorithm,bytes){assert.equal(algorithm,'SHA-256');const result=createHash('sha256').update(bytes).digest();return result.buffer.slice(result.byteOffset,result.byteOffset+result.byteLength);}}});
 const {createPublicConnectionRegistryV1,normalizePublicWalletConnectionV1}=await import('../src/state/public-connection-registry-v1.mjs');
 const data=new Map();let failChunk=false,chunkWrites=0;
 const storage={get:async key=>data.get(key)??null,set:async(key,value)=>{assert.ok(value.length<=8192);if(failChunk&&key.includes('.profile.')&&++chunkWrites===2)throw Error('HOST_STORAGE_WRITE_REJECTED');data.set(key,value);},remove:async key=>{data.delete(key);}};
 const registry=createPublicConnectionRegistryV1({devicePublicKey:key,storage});
 const direct={format:'DEVICE_EXTERNAL_FLAT_CONNECTION_V1',descriptor:descriptor(true),transport:pin},decoded=normalizePublicWalletConnectionV1(JSON.stringify(direct),key);assert.equal(decoded.kind,'EXTERNAL_FLAT');assert.deepEqual(JSON.parse(decoded.profile),direct,'the actual cloud descriptor packet retains its public schema');assert.equal(decoded.descriptors.length,1);assert.throws(()=>normalizePublicWalletConnectionV1(JSON.stringify({...direct,pairing:descriptor(true)}),key));
 const saved=await registry.remember(external()),pos=await registry.remember(positions());assert.equal(saved.kind,'EXTERNAL_FLAT');assert.equal(saved.protocol,'AAVE');assert.equal(saved.observation,'UNKNOWN');assert.equal(pos.kind,'POSITIONS');
 assert.equal(await registry.remember(external()).then(value=>value.id),saved.id);assert.equal((await registry.list()).length,2);
 const reopened=createPublicConnectionRegistryV1({devicePublicKey:key,storage});assert.equal((await reopened.selected('EXTERNAL_FLAT')).id,saved.id);assert.equal((await reopened.selected('POSITIONS')).id,pos.id);
 const target=descriptor(true),route={origin:target.origin,pairingId:target.pairingId,pool:target.poolTerms.pool,assetId:target.poolTerms.assetIdentity,genesis:target.poolTerms.genesis,scope:target.poolTerms.scope,policy:target.poolTerms.policy,domain:target.poolTerms.domainCommitment,lifetime:target.lifetime};
 assert.equal((await reopened.forRoute(route)).id,saved.id);assert.equal(await reopened.forRoute({...route,pool:'0'.repeat(40)}),null);assert.equal(await reopened.forRoute({...route,origin:'https://127.0.0.1:9445'}),null);assert.equal(await reopened.forRoute({...route,devicePublicKey:otherKey}),null);
 assert.deepEqual(await createPublicConnectionRegistryV1({devicePublicKey:otherKey,storage}).list(),[]);
 for(const field of ['privateKey','witness','rootKey','balance']){const malicious=JSON.parse(external());malicious[field]='UNTRUSTED_PRIVATE_OR_BALANCE';assert.throws(()=>normalizePublicWalletConnectionV1(JSON.stringify(malicious),key));}
 const crossed=JSON.parse(external());crossed.pairing.target.devicePublicKey=otherKey;assert.throws(()=>normalizePublicWalletConnectionV1(JSON.stringify(crossed),key));assert.throws(()=>normalizePublicWalletConnectionV1(positions(),otherKey));
 const secretPin=JSON.parse(positions());secretPin.transport.privateKey='UNTRUSTED_TLS_KEY';assert.throws(()=>normalizePublicWalletConnectionV1(JSON.stringify(secretPin),key));
 failChunk=true;const another=JSON.parse(external());another.pairing.source.pairingId=h('second-source');await assert.rejects(registry.remember(JSON.stringify(another)),/HOST_STORAGE_WRITE_REJECTED/);failChunk=false;assert.equal(chunkWrites,2);
 assert.equal((await reopened.list()).length,2,'uncommitted profile chunks never enter the index');
 await reopened.forget(saved.id);assert.equal(await reopened.selected('EXTERNAL_FLAT'),null);assert.equal((await reopened.list()).length,1);assert.equal((await reopened.list())[0].observation,'UNKNOWN');
 const index=[...data.keys()].find(key=>key.endsWith('.index'));const value=JSON.parse(data.get(index));value.devicePublicKey=otherKey;data.set(index,JSON.stringify(value));await assert.rejects(reopened.list());
});
