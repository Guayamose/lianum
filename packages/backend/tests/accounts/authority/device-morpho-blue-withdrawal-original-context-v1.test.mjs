/** HOST regression: trusted runtime/system are opaque references, not JSON.
 * Explicit observer/row ports below issue no financial or native authority. */
import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import {types} from 'node:util';
import {externalFlatExactV1} from '../../../../mobile-protocol/src/device-external-flat-note-v1.mjs';
const source=readFileSync(new URL('../../../src/accounts/authority/device-external-flat-note-authority-v1.mjs',import.meta.url),'utf8');
const start=source.indexOf('const blueWithdrawal=raw=>run(async()=>{'),end=source.indexOf('\n const shareCapability=',start);
assert(start>=0&&end>start);
test('Blue confirmed W39 retains opaque original runtime identity and denies replacement or proxy',async()=>{
 let visited=0,observations=0,currentReads=0;
 const runtime=Object.freeze(Object.defineProperty({},'nativeProcess',{enumerable:true,get(){visited++;throw Error('HOST_OPAQUE_RUNTIME_VISITED');}}));
 const system=Object.freeze(Object.defineProperty({},'ownedDeployment',{enumerable:true,get(){visited++;throw Error('HOST_OPAQUE_SYSTEM_VISITED');}})),poolIndex=1;
 const jobId='ab'.repeat(32),nullifier='cd'.repeat(32);
 const retained={jobId,mode:'withdraw_balance',stage:'CONFIRMED',submission:{dispatchLatched:true,transactionHash:'ef'.repeat(32)},observation:{confirmed:true},nullifier};
 const view={ledger:{nullifiers:['0x'+nullifier]}};
 const need=(ok,code)=>{if(!ok)throw Object.assign(Error(code),{code});};
 const ports={run:work=>work(),need,types,protocol:{externalFlatExactV1},share:{},runtime,system,poolIndex,
  row:id=>{assert.equal(id,jobId);return retained;},observe:async row=>{assert.equal(row,retained);observations++;},
  current:async()=>{currentReads++;return view;},reader:{assertCurrent:async current=>assert.equal(current,view)},
  observed:current=>{assert.equal(current,view);return {confirmed:true};},admitted:()=>{},copy:structuredClone,publicRow:row=>({jobId:row.jobId,stage:row.stage})};
 const check=new Function(...Object.keys(ports),source.slice(start,end)+'\nreturn blueWithdrawal;')(...Object.values(ports));
 const actual=await check({runtime,system,poolIndex,jobId});assert.equal(actual.row.stage,'CONFIRMED');assert.equal(visited,0);assert.equal(observations,1);assert.equal(currentReads,1);
 for(const raw of [{runtime:{},system,poolIndex,jobId},{runtime,system:{},poolIndex,jobId},{runtime,system,poolIndex:0,jobId},new Proxy({runtime,system,poolIndex,jobId},{})])
  await assert.rejects(check(raw),{code:'DEVICE_EXTERNAL_FLAT_SHARE_CONTEXT'});
 assert.equal(observations,1);assert.equal(currentReads,1);assert.equal(visited,0);
});


test('Meta device underlying redemption journals before the effect and reopens only the same observed SHARE withdrawal',async t=>{
 // Actual exit body, protocol/PoP and AES storage; runtime/adapter/lifetime
 // ports are inert and issue no native or financial authority in this HOST.
 const {mkdtemp,chmod,rm}=await import('node:fs/promises'),{tmpdir}=await import('node:os'),{join,dirname}=await import('node:path'),{randomBytes,createHash,createPublicKey,generateKeyPairSync,sign,verify}=await import('node:crypto');
 const {Vault}=await import('../../../../engine/src/crypto/vault.mjs'),P=await import('../../../../mobile-protocol/src/device-morpho-blue-redemption-v1.mjs');
 const scratch=await mkdtemp(join(tmpdir(),'meta-underlying-host-'));t.after(()=>rm(scratch,{recursive:true,force:true}));
 const {privateKey,publicKey}=generateKeyPairSync('ec',{namedCurve:'secp256k1'}),jwk=publicKey.export({format:'jwk'}),pub='04'+Buffer.from(jwk.x,'base64url').toString('hex')+Buffer.from(jwk.y,'base64url').toString('hex'),hex=n=>n.toString(16).padStart(64,'0'),addr=n=>n.toString(16).padStart(40,'0');
 const descriptor={profile:'LIANUM_DEVICE_EXTERNAL_FLAT_SHARE_NOTE_V1',origin:'https://original.local:9557',pairingId:hex(1),devicePublicKey:pub,lifetime:hex(2),poolTerms:{pool:addr(1),poolCodeHash:hex(3),scope:hex(4),policy:hex(5),assetIdentity:hex(6),asset:addr(2),assetCodeHash:hex(7),genesis:hex(8),domainCommitment:hex(9),hub:addr(3),hubCodeHash:hex(10),hubDomain:hex(11),ledgerNamespace:hex(12)},assetMetadata:{kind:'ERC20',symbol:'MMV',decimals:6}},runtime={metadata:{scratchDirectory:scratch}},system={},account={},protocols={vault:{address:'0x'+addr(2)}},binding={sender:addr(4),receiver:addr(4),identity:{asset:addr(5)}},requests=new WeakMap(),owned=new WeakMap(),fresh=()=>randomBytes(32).toString('hex'),observed={blockNumber:'20',blockHash:hex(20),timestamp:'1000'},jobId=hex(22);
 let effectCount=0,quoteCount=0,closed=0,sameSubjectReads=0,currentAdapter;
 const actualRow={mode:'withdraw_balance',stage:'CONFIRMED',observation:{status:'CONFIRMED',recipient:binding.sender,commitment:hex(23),amount:'100',transactionHash:hex(24)},consentFields:{rootId:hex(25),recipient:binding.sender,statement:{commitment:hex(23),amount:'100'}}};
 const result={phase:'OBSERVED',execution:{confirmation:{assets:'100'}}},costs={approval:null,redemption:null};
 const adapter={async validateQuote(intent){assert.equal(intent.amount,'100');assert.equal(intent.minimumOutput,'100');quoteCount++;},async prepareOnce(){},async execute(reference,request){const r=requests.get(request);assert.equal(r.adapter,adapter);assert.equal(r.reference,reference);assert.equal(r.originalMeta,true);r.check();const state=await new Vault(currentAdapter.path).read(currentAdapter.password);assert.equal(state.data.operations[0].stage,'REDEMPTION_UNKNOWN');effectCount++;return result;},async reconcile(){return result;},async close(){closed++;}};
 const lifetime={async check(){},async before(){},async acknowledged(){},async capture(record){return{credentials:currentAdapter,record};}};
 const text=readFileSync(new URL('../../../src/defi/withdrawals/device-morpho-blue-private-exit-v1.mjs',import.meta.url),'utf8'),start=text.indexOf('async function create(raw,saved,'),body=text.slice(start);
 const ports={assert,types,randomBytes,createHash,createPublicKey,verify,mkdtemp,chmod,join,dirname,Vault,canonicalClaimRecordDataV1:JSON.stringify,assertOwnedFlatSystem:(r,s)=>{assert.equal(r,runtime);assert.equal(s,system);},assertOfficialProtocolFixture:(r,p)=>{assert.equal(r,runtime);assert.equal(p,protocols);},assertOfficialAaveFixtureV1(){assert.fail('META_IS_NOT_AAVE');},assertOwnedOriginalMorphoBluePositionV1(){assert.fail('META_IS_NOT_BLUE');},assertOwnedMetaMorphoVault:(r,a)=>{assert.equal(r,runtime);assert.equal(a,adapter);},isOwnedDeviceMetaMorphoVaultV2:a=>a===adapter,isOwnedDeviceAaveStaticVaultV1:()=>false,isOwnedMorphoBluePositionVaultV1:()=>false,ownedMetaMorphoVaultBinding:()=>binding,assertOriginalDeviceExternalFlatNoteAuthorityV1:a=>{assert.equal(a,account);return descriptor;},readOriginalDeviceExternalFlatShareWithdrawalV1:async(a,q)=>{assert.equal(a,account);assert.equal(q.jobId,jobId);sameSubjectReads++;return{row:actualRow,observed};},readOriginalOfficialVaultNativeCostsV1:()=>costs,createRetainedPrivateVaultExitJournalV1:async(_r,_id,credentials)=>{currentAdapter=credentials;return lifetime;},openRetainedPrivateVaultExitJournalV1:async(_r,_id,credentials)=>{currentAdapter=credentials;return lifetime;},assertOriginalExternalVaultJournalV1:async()=>{},captureRetainedOwnedOfficialStaticVaultV1:async()=>({sameOriginalAdapter:true}),checkpointRetainedOwnedDeviceAaveStaticVaultSourceV3(){assert.fail('META_IS_NOT_SOURCE_AAVE');},externalFlatExactV1,normalizeExternalFlatSignatureV1:s=>s,P,owned,requests,fresh,copy:structuredClone,need:(v,c)=>assert.ok(v,c),exact:externalFlatExactV1,sha:v=>createHash('sha256').update(JSON.stringify(v)).digest('hex'),bare:v=>v.slice(2),assertOriginalDeviceGraphSourceAvailableV2(){},beginOriginalDeviceGraphSourceActivityV2:async()=>null,endOriginalDeviceGraphSourceActivityV2:async()=>{}};
 const create=new Function(...Object.keys(ports),body+';return create;')(...Object.values(ports));
 function signature(value){const bytes=P.deviceMetaMorphoRedemptionPermissionMessageV2(value),raw=sign('sha256',bytes,{key:privateKey,dsaEncoding:'ieee-p1363'});bytes.fill(0);const n=BigInt('0xfffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141'),s=BigInt('0x'+raw.subarray(32).toString('hex'));if(s>n/2n)Buffer.from((n-s).toString(16).padStart(64,'0'),'hex').copy(raw,32);return raw.toString('hex');}
 const first=await create({runtime,system,account,protocols,adapter},null,false,true),before=first.challenge(),initialRead=await first.status({access:before,signature:signature(before)});assert.equal(initialRead.redemptionRecipient,binding.sender);assert.equal(initialRead.operations.length,0);assert.equal(effectCount,0);const access=first.challenge();assert.throws(()=>P.normalizeDeviceMorphoBlueRedemptionAccessV1(access));const {consent}=await first.review({access,signature:signature(access),draft:{action:'REDEEM_META',withdrawalJobId:jobId,minimumAssets:'100',deadline:'1180'}});assert.ok(P.deviceMetaMorphoRedemptionPermissionMessageV2(consent).length<=4096);
 const row=await first.operate({consent,signature:signature(consent)});assert.equal(row.stage,'REDEEMED');assert.equal(row.redeemedUnderlying,'100');assert.equal(effectCount,1);await assert.rejects(first.operate({consent,signature:signature(consent)}));assert.equal(effectCount,1);
 const saved=await owned.get(first).capture();assert.equal(saved.schema,'DEVICE_METAMORPHO_REDEMPTION_PRIVATE_V2');const reopened=await create({runtime,system,account,protocols,adapter},saved,false,true),freshAccess=reopened.challenge();await assert.rejects(reopened.review({access:freshAccess,signature:signature(freshAccess),draft:{action:'REDEEM_META',withdrawalJobId:jobId,minimumAssets:'100',deadline:'1180'}}));
 const freshRead=reopened.challenge(),{consent:read}=await reopened.review({access:freshRead,signature:signature(freshRead),draft:{action:'OBSERVE_META',withdrawalJobId:jobId,minimumAssets:'100',deadline:'1180'}}),readRow=await reopened.operate({consent:read,signature:signature(read)});assert.equal(readRow.reference,row.reference);assert.equal(readRow.stage,'REDEEMED');assert.equal(effectCount,1);assert.ok(sameSubjectReads>=4);assert.ok(quoteCount>=2);await reopened.close();assert.equal(closed,1);
});


test('Meta one and four fixed redemption adapters are born on the original empty pools before listener publication',async()=>{
 // Execute the actual finite branch with inert owned resource ports. This
 // proves acquisition order/binding, not a deployment or financial receipt.
 const text=readFileSync(new URL('../../../src/operations/local/device-external-flat-source-graph-service-v1.mjs',import.meta.url),'utf8'),start=text.indexOf('  if(originalMeta){const protocols=retention.protocols;'),end=text.indexOf('  if(originalBlue){s.position=',start);assert(start>=0&&end>start);
 for(const count of [1,4]){const runtime={},system={},protocols={},targets=Array.from({length:count},()=>Object.freeze({})),events=[],s={metaExits:[]},v={runtime,system,targetAccount:targets[0]},retention={protocols};let head=0;
  const ports={originalMeta:true,retention,v,s,multi:count===1?null:targets.map(account=>({account})),assert,need:(ok,code)=>assert.ok(ok,code),createFlatSystemStateReader:async raw=>{assert.equal(raw.runtime,runtime);assert.equal(raw.system,system);return{async read(){events.push('read-'+raw.poolIndex);return{head,ledger:{commitments:[],nullifiers:[]}};},async assertCurrent(view){assert.equal(view.head,head,'HOST_SAME_CURRENT_HEAD');}};},createRetainedOwnedDeviceMetaMorphoVaultV2:async raw=>{assert.equal(raw.runtime,runtime);assert.equal(raw.protocolFixture,protocols);events.push('adapter');head++;return Object.freeze({sameOriginalHolder:true,async close(){}});},createOriginalDeviceMetaMorphoPrivateExitV2:async raw=>{assert.equal(raw.runtime,runtime);assert.equal(raw.system,system);assert.equal(raw.protocols,protocols);assert.equal(raw.account,targets[s.metaExits.length]);assert.equal(raw.adapter.sameOriginalHolder,true);events.push('exit');return Object.freeze({slot:s.metaExits.length});}};
  await new Function(...Object.keys(ports),'return(async()=>{'+text.slice(start,end)+'})();')(...Object.values(ports));assert.equal(s.metaExits.length,count);assert.equal(events.filter(v=>v==='adapter').length,count);assert.equal(events.filter(v=>v==='exit').length,count);assert.deepEqual(events.slice(-2),['read-0','read-1']);
 }
});
