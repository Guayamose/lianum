/** Original same-host solver provider custody and immutable once-only lease.
 * The actual NEW system, original native fixture and original operator bootstrap
 * are required before allocation. Importing this module creates no key/runtime.
 * Public operations accept data and an original recipient process, never a
 * signer, transport, journal, clock, verifier or hash implementation.
 * All native funds belong to the original solver runtime, separately from the
 * user's reserved private asset/payout. Native delivery creates no private credit.
 * Economic reopening consumes a separate native AEAD issuer and the original
 * key/journal; it cannot reset a missing record or replace a retained wire. */
import assert from 'node:assert/strict';
import { createPrivateKey,createPublicKey,createHash } from 'node:crypto';
import { constants } from 'node:fs';
import { lstat, realpath, open } from 'node:fs/promises';
import { isAbsolute,join,relative,resolve,sep } from 'node:path';
import { Vault } from '@lianum/engine/crypto/vault';
import { freshKey, signature } from '@lianum/engine/notes/private-note-encoding';
import { assertOwnedNativeRecipientProcess } from '../../../execution/native/recipients/native-recipient-process.mjs';
import { nativeProviderIdentity, NATIVE_ADMISSION_LOSS_CLAUSE, nativeDispatchStatementFrame } from '@lianum/engine/execution/native/dispatch/native-admission';
import { PROFILE_SCHEMA as TRON_SCHEMA, tronGraphAsset, tronGraphEndpoint, tronGraphCustody } from '../../tron/transfers/tron-native-graph-profile.mjs';
import { assertOwnedLocalEvmNativeValueRuntime, assertOwnedLocalEvmObservedClockV1 } from '../../evm/runtime/owned-evm-v2-runtime.mjs';
import { assertOwnedNativeValueSystem,nativeValueOriginalRecoverySourceV1 } from '../../../operations/deployments/native-value/native-value-system-v2.mjs';
import { assertNativeValueOperatorBootstrapForSystem, assertNativeValueBootstrapNativeRuntime } from '../../../operations/operators/native-value/native-value-local-operator-bootstrap-v4.mjs';
import { assertOwnedNativeValueQuorum } from '../../../operations/operators/native-value/native-value-operators-v4.mjs';
import { createNativeValueSystemStateReader } from '../../../execution/native-value/reconciliation/native-value-system-state-v2.mjs';
import { exactRecord,bytes32,canonicalField,FIELD_MODULUS } from '@lianum/components/encoding/commitments';
import { cloneInput, frozenInput, inputUint } from "@lianum/components/plain-input";
import { profileCommitment,chainDomain } from '../transfers/generic-native-value-v2.mjs';
import { PROFILE_SCHEMA,CHAINS } from '../../evm/transfers/evm-native-value-v2.mjs';
import { evmNativeTransferNetwork } from '../../evm/observations/evm-native-transfer-observer.mjs';
import { evmFundingEndpointCommitment } from '../../evm/dispatch/evm-facts-binding.mjs';
import { nativeCustodyCommitment } from '@lianum/engine/native/native-receipt-binding';
import { normalizeNativeValueDispatchBinding,bindNativeValueDispatchRequest,equal,sha256 } from './native-value-dispatch-binding-v2.mjs';
import { createNativeValueDispatchJournal,readNativeValueDispatchJournal,assertNativeValueRetainedIntent } from './native-value-dispatch-journal-v2.mjs';
import { loadPinned,resourceModuleURL } from '@lianum/proofs/tooling/tooling';
import { assertNativeProviderRecoveryAuthorityV1,retainNativeProviderRecoveryV1,nativeProviderRecoverySectionIdentityV1,consumeNativeProviderRecoverySectionV1 } from '../../../claims/wrapped/recovery/wrapped-recovery-authority-v1.mjs';
import { nativeSourceRecoverySectionIdentityV1, nativeSourceRecoveryOwnedProcessV1, retainOriginalNativeSourceSectionV1, updateOriginalNativeSourceSectionV1, consumeOriginalNativeSourceSectionV1, resumeOriginalNativeSourceSectionV1 } from '../../../operations/recovery/native-original-source-lifecycle-v1.mjs';
import {openOriginalOwnedRollupNativeValueSourcesV1} from '../../evm/runtime/owned-evm-v2-runtime.mjs';
const leases=new WeakMap(),custodies=new WeakMap(),copy=cloneInput,freeze=frozenInput;
export const NATIVE_VALUE_DISPATCH_OWNER_BLOCKERS=Object.freeze(['NEW_NATIVE_VALUE_SYSTEM_RELEASE_ARTIFACTS_ABSENT','ACTUAL_LOCAL_NATIVE_PROVIDER_INTEGRATION_UNEXECUTED','ACTUAL_TRON_NATIVE_AND_DISPATCH_ACCEPTANCE_UNEXECUTED']);
const SCHEMA='OWNED_NATIVE_VALUE_PROVIDER_CUSTODY_V2';
const ciphertextFields=Object.freeze(['dev','ino','mode','uid','gid','nlink','size','mtimeMs','ctimeMs']);
const ciphertextIdentityFields=Object.freeze(['dev','ino','mode','uid','gid','nlink','size']);
const MAX_PROVIDER_CIPHERTEXT_BYTES=2*1024*1024;
export function assertOwnedNativeValueProviderCustody(custody,expected){
 exactRecord(expected,['runtime','system','poolIndex']);const state=custodies.get(custody);
 assert.ok(state,'NATIVE_VALUE_ORIGINAL_PROVIDER_CUSTODY_REQUIRED');for(const k of Object.keys(expected))assert.equal(state[k],expected[k]);state.live();
}
export function ownedNativeValueProviderCustodyReview(custody,expected){
 assertOwnedNativeValueProviderCustody(custody,expected);return custodies.get(custody).review();
}

/** One original consumer gets the lease; it cannot be copied or reopened after
 * uncertainty. An economic reopen issues a new opaque lease only from the same
 * captured key/journal. Public custody exposes no resources or key material. */
export async function openNativeValueDispatchLease(lease,expected,request) {
 exactRecord(expected,['runtime','system','poolIndex']);const r=leases.get(lease);
 assert.ok(r,'NATIVE_VALUE_ORIGINAL_DISPATCH_LEASE_REQUIRED');for(const k of Object.keys(expected))assert.equal(r[k],expected[k],'NATIVE_VALUE_LEASE_OWNER_BINDING');
 const {consumeNativeValueProviderBindRequest}=await import('../../evm/dispatch/native-value-evm-dispatch-gate.mjs');
 consumeNativeValueProviderBindRequest(request,{...expected,lease});
 r.resources.assertLive();assert.equal(r.opened,false,'NATIVE_VALUE_LEASE_ALREADY_OPENED');if(r.openSource)return r.openSource();r.opened=true;return r.resources;
}
async function privateDirectory(nativeRuntime,directory){assert.ok(typeof directory==='string'&&isAbsolute(directory)&&resolve(directory)===directory&&!directory.includes('\0'),'NATIVE_VALUE_PRIVATE_DIRECTORY');
 const root=nativeRuntime.metadata.scratchDirectory;assert.ok(isAbsolute(root)&&resolve(root)===root);const suffix=relative(root,directory);
 assert.ok(suffix===''||(!suffix.startsWith('..'+sep)&&suffix!=='..'&&!isAbsolute(suffix)),'NATIVE_VALUE_OWNED_SCRATCH');
 const paths=[root];if(suffix)for(const part of suffix.split(sep))paths.push(join(paths.at(-1),part));
 for(const path of paths){assert.equal(await realpath(path),path);const stat=await lstat(path);assert.ok(stat.isDirectory()&&!stat.isSymbolicLink()&&(stat.mode&0o777)===0o700);
   if(typeof process.getuid==='function')assert.equal(stat.uid,process.getuid());}return directory;}
export async function createOwnedNativeValueProviderCustody(input){
 assert.equal(arguments.length,1);return createProviderCustody(input);
}
async function createProviderCustody(input,recovery=null){
 exactRecord(input,['runtime','system','poolIndex','nativeRuntime','bootstrap','profileCommitment','recipientEndpoint','terms','acceptedLossClause','directory','password']);
 const {runtime,system,poolIndex,nativeRuntime,bootstrap}=input,terms=copy(input.terms),directory=input.directory,providerProfileCommitment=input.profileCommitment;
 assert.ok(Number.isSafeInteger(poolIndex)&&!Object.is(poolIndex,-0)&&poolIndex>=0&&poolIndex<2);assertOwnedNativeValueSystem(runtime,system);
 assertOwnedNativeValueQuorum(system.quorum,{runtime,system});
 const metadata=assertNativeValueOperatorBootstrapForSystem(bootstrap,{runtime,system});equal(metadata.adapterProfiles,system.adapterProfiles);equal(metadata.attesterKeys,system.registry.quorum.keys);
 const entry=system.adapterProfiles.find(e=>profileCommitment(e.profile)===providerProfileCommitment);assert.ok(entry,'NATIVE_VALUE_REGISTERED_NATIVE_PROFILE');
 const p=entry.profile,evm=p.schema===PROFILE_SCHEMA;assert.ok(evm||p.schema===TRON_SCHEMA,'NATIVE_VALUE_NATIVE_PROFILE_REQUIRED');
 const tronRuntimeModule=evm?null:await import('../../tron/runtime/owned-tron-native-value-runtime.mjs');
 const ownRollup=evm?await openOriginalOwnedRollupNativeValueSourcesV1(nativeRuntime):null;
 if(ownRollup){
   // Actual fixed own-client WeakMap only; BSC714 is local and distinct from BNB56. Base retains its original GPO L1/
   // operator fee budget privately before KEY. No Anvil fallback or mark.
   assert.ok(['OWNED_ARBITRUM_NITRO_NATIVE_VALUE_POS_V1','OWNED_BASE_NATIVE_VALUE_ROLLUP_POS_V1','OWNED_BSC_POSA_NATIVE_VALUE_714_V3'].includes(nativeRuntime.profile),'NATIVE_VALUE_ORIGINAL_ROLLUP_DISPATCH_NOT_IMPLEMENTED');
   for(const method of ['dispatchNativeValueV1','assertNativeValuePreparedCurrent','observeNativeValueOriginal'])assert.equal(typeof nativeRuntime[method],'function','NATIVE_VALUE_ORIGINAL_ROLLUP_DISPATCH_REQUIRED');
   assert.equal(recovery,null,'NATIVE_VALUE_ROLLUP_LEGACY_RECOVERY_DENIED');
 }
 const nativeLive=()=>evm?(ownRollup?ownRollup.assertCurrent():assertOwnedLocalEvmNativeValueRuntime(nativeRuntime)):tronRuntimeModule.assertOwnedLocalTronNativeValueV1(nativeRuntime);
 await nativeLive();assertNativeValueBootstrapNativeRuntime(bootstrap,{runtime,system,nativeRuntime,profileCommitment:providerProfileCommitment});
 if(evm){assert.equal(p.chainId,nativeRuntime.metadata.chainId);assert.equal('0x'+p.genesis,nativeRuntime.metadata.evmGenesis,'NATIVE_VALUE_ACTUAL_NATIVE_GENESIS');
   assert.equal(evmNativeTransferNetwork({chain:CHAINS[p.chainId][0],genesisHash:'0x'+p.genesis}).nativeAssetCommitment,p.asset);
 }else{assertOwnedLocalEvmObservedClockV1(runtime);assert.equal(p.genesis,nativeRuntime.metadata.genesis,'NATIVE_VALUE_ACTUAL_NATIVE_GENESIS');assert.equal(p.asset,tronGraphAsset(p.genesis));
   assert.equal(nativeRuntime.metadata.publicNetwork,false);}

 const pool=system.pools[poolIndex],domain=copy(pool.domain),native={solverEndpoint:nativeRuntime.accounts[0],recipientEndpoint:input.recipientEndpoint};
 assert.match(native.recipientEndpoint,evm?/^0x[0-9a-f]{40}$/:/^41[0-9a-f]{40}$/);assert.notEqual(native.solverEndpoint,native.recipientEndpoint);
 assert.notEqual(native.recipientEndpoint,(evm?'0x':'41')+'00'.repeat(20));
 if(!evm)assert.equal(native.recipientEndpoint,nativeRuntime.accounts[1],'NATIVE_VALUE_TRON_FIXED_ORIGINAL_RECIPIENT');
 exactRecord(terms,['scope','policy','asset','amount','executionFrom','executionUntil','settleBefore']);for(const k of ['scope','policy','asset'])assert.equal(terms[k],domain[k]);
 assert.ok(inputUint(terms.amount,evm?128:63)>0n&&inputUint(terms.executionFrom)<inputUint(terms.executionUntil)&&inputUint(terms.executionUntil)<=inputUint(terms.settleBefore));
 assert.equal(input.acceptedLossClause,NATIVE_ADMISSION_LOSS_CLAUSE);let password=input.password;assert.ok(typeof password==='string'&&password.length>0&&Buffer.byteLength(password)<=1024);
 await privateDirectory(nativeRuntime,directory);const reader=await createNativeValueSystemStateReader({runtime,system,poolIndex});const view=await reader.read();await reader.assertCurrent(view);
 await nativeLive();
 // Allocation is after all genuine ownership and fixed profile checks.
 const vault=new Vault(join(directory,'native-value-provider.vault'));let record=recovery?await vault.read(password):undefined;
 if(recovery)equal(record,recovery.record);
 let key;
 if(recovery){const privateKey=createPrivateKey(record.data.privateKeyPem),publicKey=createPublicKey(privateKey),j=publicKey.export({format:'jwk'});
   assert.equal(j.crv,'secp256k1');key={privateKey,publicKey,x:Buffer.from(j.x,'base64url'),y:Buffer.from(j.y,'base64url')};}
 else key=freshKey();
 let closed=false,poisoned=false,busy=false,lease=null,backend,backendPending,capturing=false,captureStarted=false,captured=false,captureToken,
   activeResourceOperations=0,recoveredLeaseTaken=false,closePrivatePromise,captureIdentity,authenticatedCiphertext;
 let sourceHandle=null,sourceToken=null,sourceData=null,sourceSnapshotBusy=false;
 const recovered=Boolean(recovery),recoveredLeasePresent=Boolean(recovery?.lease);
 let privateInput=copy(Object.fromEntries(['poolIndex','profileCommitment','recipientEndpoint','terms','acceptedLossClause','directory','password'].map(k=>[k,input[k]])));
 const nativeIdentity={family:evm?'3':'4',genesis:p.genesis,chainId:evm?p.chainId:null,solver:native.solverEndpoint,recipient:native.recipientEndpoint};
 const receiverIdentity={genesis:runtime.metadata.evmGenesis,chainId:runtime.metadata.chainId,hub:system.hub.address,pool:pool.address};
 async function resourceTask(work){live();assert.equal(sourceSnapshotBusy,false,'NATIVE_SOURCE_PROVIDER_SNAPSHOT_BUSY');activeResourceOperations++;try{return await work();}finally{activeResourceOperations--;}}
 const publicKey=freeze({x:key.x.toString('hex'),y:key.y.toString('hex')}),source=evm?evmFundingEndpointCommitment({genesis:p.genesis,asset:p.asset,address:native.solverEndpoint.slice(2)}):tronGraphEndpoint(p.genesis,p.asset,native.solverEndpoint),destination=evm?evmFundingEndpointCommitment({genesis:p.genesis,asset:p.asset,address:native.recipientEndpoint.slice(2)}):tronGraphEndpoint(p.genesis,p.asset,native.recipientEndpoint);
 const actionTemplate=freeze({chainDomain:chainDomain(p),signerIdentity:nativeProviderIdentity(publicKey),sourceCommitment:source,destinationCommitment:destination,amount:terms.amount,custodyKind:1,
   custodyCommitment:evm?nativeCustodyCommitment({family:'3',genesis:p.genesis,asset:p.asset,sourceCommitment:source,destinationCommitment:destination}):tronGraphCustody({genesis:p.genesis,asset:p.asset,sourceCommitment:source,destinationCommitment:destination}),
   executionFrom:terms.executionFrom,executionUntil:terms.executionUntil,settleBefore:terms.settleBefore});
 const base=freeze({domain,pool:pool.address.slice(2),registry:system.registry,profiles:system.adapterProfiles,profileCommitment:providerProfileCommitment,providerKey:publicKey,native,
   acceptedLossClause:NATIVE_ADMISSION_LOSS_CLAUSE,leaseId:sha256('LIANUM/original-native-value-provider/2\0'+publicKey.x+publicKey.y+domain.hubDomain)});
 function live(){assert.ok(!closed&&!poisoned&&!capturing,'NATIVE_VALUE_PROVIDER_CUSTODY_CLOSED_OR_UNCERTAIN');assertOwnedNativeValueSystem(runtime,system);assertOwnedNativeValueQuorum(system.quorum,{runtime,system});assertNativeValueBootstrapNativeRuntime(bootstrap,{runtime,system,nativeRuntime,profileCommitment:providerProfileCommitment});}
 // The retained ciphertext is authenticated after creation/reopen and every
 // original CAS write. Every current check still reads the complete physical
 // file; native heads, health inventories and certificates are never cached.
 async function ciphertext(guard=live){
  guard();await privateDirectory(nativeRuntime,directory);guard();
  assert.equal(await realpath(vault.path),vault.path);guard();
  const before=await lstat(vault.path);guard();
  assert.ok(before.isFile()&&!before.isSymbolicLink()&&before.nlink===1&&(before.mode&0o777)===0o600,'NATIVE_VALUE_PROVIDER_CIPHERTEXT_FILE');
  assert.equal(before.uid,process.getuid(),'NATIVE_VALUE_PROVIDER_CIPHERTEXT_OWNER');
  assert.ok(before.size>0&&before.size<=MAX_PROVIDER_CIPHERTEXT_BYTES,'NATIVE_VALUE_PROVIDER_CIPHERTEXT_SIZE');
  const handle=await open(vault.path,constants.O_RDONLY|constants.O_NOFOLLOW);let result;
  try{
   guard();const opened=await handle.stat();guard();
   for(const field of ciphertextFields)assert.equal(opened[field],before[field],'NATIVE_VALUE_PROVIDER_CIPHERTEXT_CHANGED');
   const bytes=Buffer.alloc(before.size+1);let offset=0;
   while(offset<bytes.length){const {bytesRead}=await handle.read(bytes,offset,bytes.length-offset,offset);guard();if(!bytesRead)break;offset+=bytesRead;}
   assert.equal(offset,before.size,'NATIVE_VALUE_PROVIDER_CIPHERTEXT_CHANGED');
   const sha256=createHash('sha256').update(bytes.subarray(0,offset)).digest('hex');
   const after=await handle.stat();guard();const named=await lstat(vault.path);guard();
   for(const field of ciphertextFields){assert.equal(after[field],before[field],'NATIVE_VALUE_PROVIDER_CIPHERTEXT_CHANGED');assert.equal(named[field],before[field],'NATIVE_VALUE_PROVIDER_CIPHERTEXT_CHANGED');}
   await privateDirectory(nativeRuntime,directory);guard();
   result=Object.freeze({sha256,identity:Object.freeze(Object.fromEntries(ciphertextIdentityFields.map(field=>[field,before[field]])))});
  }finally{await handle.close();}
  guard();return result;
 }
 async function authenticate(expected,{replace=false,guard=live}={}){
  const before=await ciphertext(guard);guard();
  if(!replace){assert.ok(authenticatedCiphertext,'NATIVE_VALUE_PROVIDER_AUTHENTICATED_CIPHERTEXT_REQUIRED');equal(before,authenticatedCiphertext);}
  const actual=await vault.read(password);guard();equal(actual,expected);
  const after=await ciphertext(guard);guard();equal(after,before);
  // No await follows publication of this authenticated identity and byte hash.
  authenticatedCiphertext=after;return actual;
 }
 async function unchanged(){live();try{const actual=await ciphertext();live();assert.ok(authenticatedCiphertext,'NATIVE_VALUE_PROVIDER_AUTHENTICATED_CIPHERTEXT_REQUIRED');equal(actual,authenticatedCiphertext);}catch(cause){poisoned=true;throw new Error('NATIVE_VALUE_PROVIDER_ORIGINAL_CUSTODY_UNAVAILABLE',{cause});}}
 async function save(next){await unchanged();try{
  if(sourceHandle)await sourceCandidate({kind:'PROVIDER_VAULT_CAS',record:{revision:record.revision+1,data:copy(next)}});
  const saved=await vault.update(password,record.revision,()=>copy(next));live();await authenticate(saved,{replace:true});live();record=saved;
  if(sourceHandle)await sourceConfirm();
 }catch(cause){poisoned=true;throw new Error('NATIVE_VALUE_PROVIDER_CUSTODY_WRITE_UNCERTAIN',{cause});}}
 async function hashFields(fields){live();if(!backendPending)backendPending=(async()=>{const helpers=await import(resourceModuleURL);assert.equal(helpers.verifyToolchain().barretenberg,'5.2.0');const bb=await loadPinned('@aztec/bb.js');
   backend=await bb.Barretenberg.new({backend:bb.BackendType.Wasm,threads:1,skipSrsInit:true,memory:{initial:37,maximum:32768}});return backend;})();
   const h=await backendPending;live();assert.ok(Array.isArray(fields)&&fields.length>0&&fields.length<=137);const inputs=fields.map(v=>{assert.ok(typeof v==='bigint'&&v>=0n&&v<FIELD_MODULUS);return Buffer.from(v.toString(16).padStart(64,'0'),'hex');});
   const result=Buffer.from((await h.poseidon2Hash({inputs})).hash).toString('hex');canonicalField(result);return result;}
 function closeOwner(){assert.ok(!capturing||closed,'NATIVE_VALUE_PROVIDER_CAPTURE_OWNS_LIFETIME');assert.ok(!busy&&activeResourceOperations===0,'NATIVE_VALUE_PROVIDER_CLOSE_BUSY');return closePrivate();}
 function closePrivate(){if(closePrivatePromise)return closePrivatePromise;closed=true;key=password=record=privateInput=authenticatedCiphertext=undefined;input=recovery=null;closePrivatePromise=(async()=>{try{await backendPending;}finally{await backend?.destroy();backend=backendPending=undefined;}})();return closePrivatePromise;}
 try{if(recovery){exactRecord(record.data,['schema','base','terms','publicKey','privateKeyPem','quote','approvedIntent','dispatch']);
   assert.equal(record.data.schema,SCHEMA);equal(record.data.base,base);equal(record.data.terms,terms);equal(record.data.publicKey,publicKey);
   equal(recovery.nativeIdentity,nativeIdentity);equal(recovery.receiverIdentity,receiverIdentity);
   assert.equal(recovery.sourceSHA256,nativeValueOriginalRecoverySourceV1(runtime,system),'NATIVE_PROVIDER_REOPEN_ORIGINAL_SOURCE');}
 else record=await vault.create({schema:SCHEMA,base,terms,publicKey,privateKeyPem:key.privateKey.export({type:'pkcs8',format:'pem'}),quote:null,approvedIntent:null,dispatch:null},password);await authenticate(record,{replace:true});}
 catch(error){await closePrivate();throw error;}
 async function serial(work){live();assert.equal(busy,false,'NATIVE_VALUE_PROVIDER_CUSTODY_BUSY');busy=true;try{await unchanged();await nativeLive();return await work();}finally{busy=false;}}
 function restoreLease(binding,approvedIntent,recoveryLease){
    let keyStarted=recoveryLease?.keyStarted??false;const scoped=Object.freeze(Object.create(null));
    const store=Object.freeze({load(){return resourceTask(async()=>{await unchanged();return copy(record.data.dispatch);});},commit(raw){return resourceTask(async()=>{const update=copy(raw);exactRecord(update,['expectedRevision','nextState']);await unchanged();
      const old=record.data.dispatch;assert.equal(old.revision,update.expectedRevision);readNativeValueDispatchJournal(binding,update.nextState);
      assert.equal(update.nextState.events.length,old.state.events.length+1,'NATIVE_VALUE_APPEND_EXACTLY_ONE_EVENT');equal(update.nextState.events.slice(0,-1),old.state.events);
      const dispatch={revision:(BigInt(old.revision)+1n).toString(),state:update.nextState};await save({...record.data,dispatch});return copy(dispatch);});}});
    const resources=Object.freeze({binding,approvedIntent,nativeRuntime,store,hashFields:fields=>resourceTask(()=>hashFields(fields)),gasLimit:'100000',assertLive:live,
      assertLeaseCurrent(){return resourceTask(async()=>{await unchanged();assert.ok(lease===scoped);equal(record.data.approvedIntent,approvedIntent);await nativeLive();});},
      assertPreparedCurrent:original=>resourceTask(()=>nativeRuntime.assertNativeValuePreparedCurrent(original)),
      signDispatchOnce(statement){live();assert.equal(keyStarted,false,'NATIVE_VALUE_PROVIDER_KEY_ALREADY_STARTED');const retained=record,requested=copy(statement);
        const pending=readNativeValueDispatchJournal(binding,record.data.dispatch.state);assert.equal(pending.phase,'PROVIDER_KEY_PENDING');equal(pending.dispatchStatement,requested);
        keyStarted=true;return resourceTask(async()=>{try{await authenticate(retained);live();assert.equal(record,retained,'NATIVE_VALUE_PROVIDER_SIGNING_RECORD_CHANGED');
          const state=readNativeValueDispatchJournal(binding,record.data.dispatch.state);
          assert.equal(state.phase,'PROVIDER_KEY_PENDING');equal(state.dispatchStatement,requested);const frame=nativeDispatchStatementFrame(requested);
          return signature(key,frame).toString('hex');
        }catch(cause){poisoned=true;throw new Error('NATIVE_VALUE_PROVIDER_ORIGINAL_CUSTODY_UNAVAILABLE',{cause});}});},
      observeOriginal:query=>resourceTask(()=>nativeRuntime.observeNativeValueOriginal(query)),
      retainOriginal(raw){return resourceTask(async()=>{live();exactRecord(raw,['profileCommitment','originalPreparation','signed']);assert.equal(raw.profileCommitment,binding.profileCommitment);
        const t=raw.originalPreparation.transaction;if(!evm){const {permissionId,...expected}=t;assert.equal(permissionId,'0');
          return bootstrap.retainOriginal({profileCommitment:binding.profileCommitment,original:{nativeWire:raw.signed.nativeWire,expected:{nativeId:raw.signed.nativeId,transactionSHA256:raw.signed.transactionSHA256,...expected}}});}
        return bootstrap.retainOriginal({profileCommitment:binding.profileCommitment,original:{nativeWire:raw.signed.nativeWire,
          expected:{nativeId:raw.signed.nativeId,chainId:t.chainId,genesisHash:'0x'+p.genesis,from:t.from,to:t.to,value:t.value,nonce:t.nonce,type:'0',gas:t.gas,
            fees:{gasPrice:t.gasPrice},wireKeyCommitment:binding.quote.action.receiptKeyCommitment}}});});},close:closeOwner});
    leases.set(scoped,{runtime,system,poolIndex,resources,opened:false,originalOpened:recoveryLease?.opened??false,keyStarted:()=>keyStarted,
      async openSource(){
        const state=leases.get(scoped);live();assert.equal(state.opened,false);
        if(sourceHandle){state.opened=true;try{await sourceCandidate({kind:'PROVIDER_LEASE_OPEN',lease:{opened:true,keyStarted:state.keyStarted()}});live();await sourceConfirm();return resources;}
          catch(error){poisoned=true;throw error;}}
        state.opened=true;return resources;
      }});lease=scoped;return scoped;
 }
 function sourceConfirmed(){
  const state=lease?leases.get(lease):null;
  const dispatch=record.data.dispatch?readNativeValueDispatchJournal(normalizeNativeValueDispatchBinding({...base,quote:record.data.quote}),record.data.dispatch.state):null;
  const leaseState=state?{opened:state.opened,keyStarted:state.keyStarted()||dispatch?.providerKeyStarted===true}
    :record.data.approvedIntent?{opened:false,keyStarted:dispatch?.providerKeyStarted===true}:null;
  return {schema:'ORIGINAL_NATIVE_PROVIDER_ECONOMIC_RECOVERY_V1',sourceSHA256:sourceData.sourceSHA256,input:copy(privateInput),record:copy(record),nativeIdentity:copy(nativeIdentity),receiverIdentity:copy(receiverIdentity),lease:leaseState};
 }
 async function sourceCandidate(candidate){
  assert.equal(sourceData.candidate,null,'NATIVE_SOURCE_PROVIDER_PENDING');const next={...sourceData,candidate:copy(candidate)};
  await updateOriginalNativeSourceSectionV1(sourceHandle,next);sourceData=next;
 }
 async function sourceConfirm(){
  const next={...sourceData,confirmed:sourceConfirmed(),candidate:null};await updateOriginalNativeSourceSectionV1(sourceHandle,next);sourceData=next;
 }
 const custody=Object.freeze({
  offer(){live();return freeze(copy({providerKey:publicKey,signerIdentity:actionTemplate.signerIdentity,actionTemplate,evidencePolicy:base.profileCommitment,acceptedLossClause:NATIVE_ADMISSION_LOSS_CLAUSE}));},
  bindQuote(raw){exactRecord(raw,['recipientCustody']);assertOwnedNativeRecipientProcess(raw.recipientCustody);const recipient=raw.recipientCustody;return serial(async()=>{
    assert.equal(lease,null,'NATIVE_VALUE_ORIGINAL_LEASE_ALREADY_BOUND');const quote=copy(await recipient.acceptedQuote());
    exactRecord(quote,['scope','policy','asset','hubDomain','registryCommitment','action','payoutCommitment','deliveryRiskSalt']);
    for(const k of ['scope','policy','asset','hubDomain','registryCommitment'])assert.equal(quote[k],domain[k]);
    for(const [k,v] of Object.entries(actionTemplate))assert.equal(quote.action[k],v,'NATIVE_VALUE_ORIGINAL_INVOICE_TERMS');
    const bound=normalizeNativeValueDispatchBinding({...base,quote:{action:quote.action,payoutCommitment:quote.payoutCommitment,deliveryRiskSalt:quote.deliveryRiskSalt}});
    if(record.data.quote!==null)equal(record.data.quote,bound.quote);else await save({...record.data,quote:bound.quote});
    return freeze({bound:true,payoutCommitment:quote.payoutCommitment});});},
  bindDispatch(raw){const request=copy(raw);exactRecord(request,['request']);return serial(async()=>{
    assert.equal(lease,null,'NATIVE_VALUE_ORIGINAL_LEASE_ALREADY_BOUND');assert.ok(record.data.quote,'NATIVE_VALUE_ORIGINAL_ACCEPTED_QUOTE_REQUIRED');
    const binding=normalizeNativeValueDispatchBinding({...base,quote:record.data.quote}),approvedIntent=await bindNativeValueDispatchRequest(binding,request.request,{hashFields});
    // Exact immutable first P/R and opening. Failure is never a permit to issue
    // another lease or overwrite an existing prepared/signed original.
    assert.equal(record.data.approvedIntent,null);assert.equal(record.data.dispatch,null);
    for(const [role,value] of [['dependency',request.request.dependencyProof],['ready',request.request.readyProof]])
      assert.equal(await system.verify(role,Buffer.from(value.proof,'hex'),value.publicInputs.map(v=>'0x'+BigInt(v).toString(16).padStart(64,'0'))),true,'NATIVE_VALUE_ORIGINAL_PROOF_REJECTED');
    await save({...record.data,approvedIntent,dispatch:{revision:'0',state:createNativeValueDispatchJournal(binding)}});
    return restoreLease(binding,approvedIntent,null);
  });},
  close(){assert.ok(!capturing||closed,'NATIVE_VALUE_PROVIDER_CAPTURE_OWNS_LIFETIME');assert.equal(busy,false);if(lease!==null){const original=leases.get(lease);assert.ok(original&&!original.opened,'NATIVE_VALUE_OPEN_LEASE_OWNS_LIFETIME');
    leases.delete(lease);lease=null;}return closePrivate();},
  report(){return freeze({profile:SCHEMA,closed,persistenceUncertain:poisoned,quoteBound:Boolean(record?.data.quote),leaseIssued:lease!==null,creditEligible:false});},
  toJSON(){throw new Error('NATIVE_VALUE_PROVIDER_CUSTODY_NOT_SERIALIZABLE');},
 });custodies.set(custody,{runtime,system,poolIndex,live,abortSource:closePrivate,
 async sourceRetain(token){
  assert.equal(ownRollup,null,'NATIVE_VALUE_ROLLUP_LEGACY_SOURCE_DENIED');
  const identity=nativeSourceRecoverySectionIdentityV1(token,'provider');live();assert.equal(evm,true,'NATIVE_SOURCE_PROVIDER_EVM_ONLY');
  assert.equal(identity.sourceSHA256,nativeValueOriginalRecoverySourceV1(runtime,system));
  assert.ok(!sourceHandle&&!sourceSnapshotBusy&&!busy&&activeResourceOperations===0,'NATIVE_SOURCE_PROVIDER_NOT_IDLE');
  sourceSnapshotBusy=true;busy=true;sourceToken=token;sourceData={schema:'ORIGINAL_NATIVE_PROVIDER_DURABLE_SOURCE_V1',sourceSHA256:identity.sourceSHA256,ownedProcesses:[],confirmed:null,candidate:null};
  try{await authenticate(record);await nativeLive();const owned=await nativeSourceRecoveryOwnedProcessV1(token,'provider',process.pid);
    const next={...sourceData,ownedProcesses:[owned],confirmed:sourceConfirmed()};sourceHandle=await retainOriginalNativeSourceSectionV1(token,'provider',next);sourceData=next;
    return {retained:true,originalResourcesStopped:false};
  }catch(error){poisoned=true;throw error;}finally{sourceSnapshotBusy=false;busy=false;}
 },
 async sourceResume(token,data){
  live();assert.ok(!sourceHandle&&!sourceSnapshotBusy&&!busy&&activeResourceOperations===0,'NATIVE_SOURCE_PROVIDER_NOT_IDLE');
  sourceToken=token;sourceData=copy(data);sourceHandle=await resumeOriginalNativeSourceSectionV1(token,'provider');
  const owned=await nativeSourceRecoveryOwnedProcessV1(token,'provider',process.pid);
  sourceData={...sourceData,ownedProcesses:[owned]};await sourceConfirm();
 },
 fence(authority){assert.equal(ownRollup,null,'NATIVE_VALUE_ROLLUP_LEGACY_CAPTURE_DENIED');live();assert.ok(!sourceHandle&&!sourceSnapshotBusy,'NATIVE_SOURCE_PROVIDER_LEGACY_CAPTURE_DENIED');assert.equal(evm,true,'NATIVE_PROVIDER_EVM_RECOVERY_ONLY');
   const identity=assertNativeProviderRecoveryAuthorityV1(authority);
   assert.equal(identity.sourceSHA256,nativeValueOriginalRecoverySourceV1(runtime,system),'NATIVE_PROVIDER_CAPTURE_ORIGINAL_SOURCE');
   assert.ok(!busy&&activeResourceOperations===0,'NATIVE_VALUE_PROVIDER_CAPTURE_BUSY');captureIdentity=copy(identity);capturing=true;},
 async capture(token){const identity=nativeProviderRecoverySectionIdentityV1(token);assert.ok(capturing&&!closed&&!poisoned&&!busy&&activeResourceOperations===0,'NATIVE_VALUE_PROVIDER_CAPTURE_FENCE_REQUIRED');
   assert.equal(captureStarted,false,'NATIVE_VALUE_PROVIDER_CAPTURE_ONCE');captureStarted=true;captureToken=token;
   equal(identity,captureIdentity);
   const captureLive=()=>assert.ok(capturing&&!closed&&!poisoned&&!busy&&activeResourceOperations===0,'NATIVE_VALUE_PROVIDER_CAPTURE_FENCE_REQUIRED');
   await authenticate(record,{guard:captureLive});captureLive();await nativeLive();captureLive();
   const state=lease?leases.get(lease):null;
   const value={schema:'ORIGINAL_NATIVE_PROVIDER_ECONOMIC_RECOVERY_V1',sourceSHA256:identity.sourceSHA256,input:copy(privateInput),record:copy(record),
     nativeIdentity:copy(nativeIdentity),receiverIdentity:copy(receiverIdentity),lease:state?{opened:state.opened,keyStarted:state.keyStarted()}:null};
   captured=true;return value;},
 async stopCaptured(token){nativeProviderRecoverySectionIdentityV1(token);assert.equal(captureToken,token);
   assert.ok(capturing&&captured&&!busy&&activeResourceOperations===0,'NATIVE_VALUE_PROVIDER_CAPTURE_REQUIRED');await closePrivate();
   return {closed:true,originalPrivateStateRetained:true};},
 async abortCaptured(token){nativeProviderRecoverySectionIdentityV1(token);if(captureToken)assert.equal(captureToken,token);
   assert.ok(capturing&&!busy&&activeResourceOperations===0,'NATIVE_VALUE_PROVIDER_CAPTURE_FENCE_REQUIRED');await closePrivate();
   return {closed:true,recoveryIncomplete:true,originalPrivateStateRetained:true};},
 takeRecoveredLease(){live();assert.ok(recovered&&!recoveredLeaseTaken,'NATIVE_VALUE_ORIGINAL_RECOVERED_LEASE_REQUIRED');recoveredLeaseTaken=true;
   if(!recoveredLeasePresent){assert.equal(lease,null,'NATIVE_VALUE_ORIGINAL_LEASE_ABSENT');return null;}assert.ok(lease,'NATIVE_VALUE_ORIGINAL_RECOVERED_LEASE_REQUIRED');return lease;},
 review(){live();assert.ok(record.data.quote,'NATIVE_VALUE_ORIGINAL_ACCEPTED_QUOTE_REQUIRED');
    return freeze(copy({routeProfile:'OWNED_LOCAL_NATIVE_VALUE_GRAPH_V2',family:evm?'3':'4',chainId:evm?p.chainId:null,genesis:p.genesis,
      sourcePool:pool.address,sourceAssetIdentity:domain.asset,nativeAsset:p.asset,solver:native.solverEndpoint,recipient:native.recipientEndpoint,
      nativeAmount:terms.amount,executionFrom:terms.executionFrom,executionUntil:terms.executionUntil,settleBefore:terms.settleBefore,
      payoutCommitment:record.data.quote.payoutCommitment,deliveryRiskCommitment:record.data.quote.action.deliveryRiskCommitment,
      deliveryLossClause:NATIVE_ADMISSION_LOSS_CLAUSE,creditEligible:false,privateSpendableAtomic:null,publicNetwork:false}));}});
 try{if(recovery?.lease){exactRecord(recovery.lease,['opened','keyStarted']);assert.equal(typeof recovery.lease.opened,'boolean');assert.equal(typeof recovery.lease.keyStarted,'boolean');
   assert.ok(record.data.quote&&record.data.approvedIntent&&record.data.dispatch,'NATIVE_VALUE_MISSING_ORIGINAL_LEASE');
   exactRecord(record.data.dispatch,['revision','state']);inputUint(record.data.dispatch.revision);
   const binding=normalizeNativeValueDispatchBinding({...base,quote:record.data.quote}),intent=assertNativeValueRetainedIntent(binding,record.data.approvedIntent),state=readNativeValueDispatchJournal(binding,record.data.dispatch.state);
   if(state.intent)equal(intent,state.intent);
   if(recovery.lease.keyStarted)assert.equal(state.providerKeyStarted,true,'NATIVE_PROVIDER_KEY_HISTORY_REQUIRED');
   if(state.dispatchSignature!==null||state.sendStarted)assert.equal(recovery.lease.keyStarted,true,'NATIVE_PROVIDER_KEY_USE_RETAINED');
   restoreLease(binding,intent,recovery.lease);
 }else if(recovery)assert.ok(record.data.approvedIntent===null&&record.data.dispatch===null,'NATIVE_VALUE_MISSING_ORIGINAL_LEASE');
 recovery=null;return custody;}catch(error){recovery=null;await closePrivate();throw error;}
}

/** The public entry fences this original custody synchronously before any await.
 * Private key/lease material is delivered only to the native AEAD section token. */
export function retainOwnedNativeProviderEconomicRecoveryV1(custody,authority){
 assert.equal(arguments.length,2);const s=custodies.get(custody);assert.ok(s,'NATIVE_VALUE_ORIGINAL_PROVIDER_CUSTODY_REQUIRED');
 s.fence(authority);return retainNativeProviderRecoveryV1(authority,custody);
}
export function captureOriginalNativeProviderEconomicRecoveryV1(custody,token){
 assert.equal(arguments.length,2);const s=custodies.get(custody);assert.ok(s,'NATIVE_VALUE_ORIGINAL_PROVIDER_CUSTODY_REQUIRED');return s.capture(token);
}
export function stopCapturedNativeProviderEconomicRecoveryV1(custody,token){
 assert.equal(arguments.length,2);const s=custodies.get(custody);assert.ok(s,'NATIVE_VALUE_ORIGINAL_PROVIDER_CUSTODY_REQUIRED');return s.stopCaptured(token);
}
export function abortNativeProviderEconomicRecoveryV1(custody,token){
 assert.equal(arguments.length,2);const s=custodies.get(custody);assert.ok(s,'NATIVE_VALUE_ORIGINAL_PROVIDER_CUSTODY_REQUIRED');return s.abortCaptured(token);
}
export async function reopenOriginalNativeProviderEconomicRecoveryV1(token,contexts){
 assert.equal(arguments.length,2);exactRecord(contexts,['runtime','system','nativeRuntime','bootstrap']);
 const identity=nativeProviderRecoverySectionIdentityV1(token),retained=consumeNativeProviderRecoverySectionV1(token);
 exactRecord(retained,['schema','sourceSHA256','input','record','nativeIdentity','receiverIdentity','lease']);
 assert.equal(retained.schema,'ORIGINAL_NATIVE_PROVIDER_ECONOMIC_RECOVERY_V1');assert.equal(retained.sourceSHA256,identity.sourceSHA256);
 assert.equal(retained.nativeIdentity.family,'3','NATIVE_PROVIDER_EVM_RECOVERY_ONLY');
 return createProviderCustody({...retained.input,...contexts},retained);
}
export function takeOriginalNativeProviderRecoveredLeaseV1(custody){
 assert.equal(arguments.length,1);const s=custodies.get(custody);assert.ok(s,'NATIVE_VALUE_ORIGINAL_PROVIDER_CUSTODY_REQUIRED');return s.takeRecoveredLease();
}


/** Synchronous fence used by the fixed joint native coordinator before await. */
export function fenceOriginalNativeProviderEconomicRecoveryV1(custody,authority){
 assert.equal(arguments.length,2);const owned=custodies.get(custody);assert.ok(owned,'NATIVE_VALUE_ORIGINAL_PROVIDER_CUSTODY_REQUIRED');owned.fence(authority);
}

export function retainOriginalNativeSourceProviderV1(token,custody){
 assert.equal(arguments.length,2);const state=custodies.get(custody);assert.ok(state,'NATIVE_VALUE_ORIGINAL_PROVIDER_CUSTODY_REQUIRED');return state.sourceRetain(token);
}
export async function reopenOriginalNativeSourceProviderV1(token,contexts){
 assert.equal(arguments.length,2);exactRecord(contexts,['runtime','system','nativeRuntime','bootstrap']);const identity=nativeSourceRecoverySectionIdentityV1(token,'provider');
 const data=consumeOriginalNativeSourceSectionV1(token,'provider');exactRecord(data,['schema','sourceSHA256','ownedProcesses','confirmed','candidate']);
 assert.equal(data.schema,'ORIGINAL_NATIVE_PROVIDER_DURABLE_SOURCE_V1');assert.equal(data.sourceSHA256,identity.sourceSHA256);assert.equal(data.candidate,null,'NATIVE_SOURCE_PROVIDER_PENDING');
 const retained=data.confirmed;exactRecord(retained,['schema','sourceSHA256','input','record','nativeIdentity','receiverIdentity','lease']);
 assert.equal(retained.schema,'ORIGINAL_NATIVE_PROVIDER_ECONOMIC_RECOVERY_V1');assert.equal(retained.sourceSHA256,identity.sourceSHA256);assert.equal(retained.nativeIdentity.family,'3');
 const custody=await createProviderCustody({...retained.input,...contexts},retained);
 try{await custodies.get(custody).sourceResume(token,data);return custody;}catch(error){await custodies.get(custody).abortSource();throw error;}
}
