/** Original same-host solver provider custody and immutable once-only lease.
 * The actual NEW system, original native fixture and original operator bootstrap
 * are required before allocation. Importing this module creates no key/runtime.
 * Public operations accept data and an original recipient process, never a
 * signer, transport, journal, clock, verifier or hash implementation.
 * All native funds belong to the original solver runtime, separately from the
 * user's reserved private asset/payout. Native delivery creates no private credit.
 * Session-only keys: no copied-key, missing-journal reset or replacement recovery. */
import assert from 'node:assert/strict';
import { createPrivateKey,createPublicKey } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import { lstat, realpath } from 'node:fs/promises';
import { isAbsolute,join,relative,resolve,sep } from 'node:path';
import { Vault } from '@lianum/engine/crypto/vault';
import { freshKey, signature } from '@lianum/engine/notes/private-note-encoding';
import { assertOwnedNativeRecipientProcess } from '../../../execution/native/recipients/native-recipient-process.mjs';
import { nativeProviderIdentity, NATIVE_ADMISSION_LOSS_CLAUSE, nativeDispatchStatementFrame } from '@lianum/engine/execution/native/dispatch/native-admission';
import { PROFILE_SCHEMA as TRON_SCHEMA, tronGraphAsset, tronGraphEndpoint, tronGraphCustody } from '../../tron/transfers/tron-native-graph-profile.mjs';
import { assertOwnedLocalEvmNativeValueRuntime, assertOwnedLocalEvmObservedClockV1 } from '../../evm/runtime/owned-evm-v2-runtime.mjs';
import { assertOwnedWrappedClaimGraphSystem } from '../../../operations/deployments/wrapped/wrapped-claim-system-v1.mjs';
import { assertWrappedClaimOperatorBootstrapForSystemV1, assertWrappedClaimBootstrapNativeRuntimeV1 } from '../../../operations/operators/wrapped/wrapped-claim-operator-bootstrap-v1.mjs';
import { assertOwnedNativeValueQuorum } from '../../../operations/operators/wrapped/wrapped-claim-graph-operators-v1.mjs';
import { createWrappedClaimGraphStateReaderV1 } from '../../../execution/wrapped/reconciliation/wrapped-claim-system-state-v1.mjs';
import { exactRecord,bytes32,canonicalField,FIELD_MODULUS } from '@lianum/components/encoding/commitments';
import { cloneInput,frozenInput,inputUint } from '../../../execution/account/preparation/readiness-inputs.mjs';
import { profileCommitment,chainDomain } from '../transfers/generic-native-value-v2.mjs';
import { PROFILE_SCHEMA,CHAINS } from '../../evm/transfers/evm-native-value-v2.mjs';
import { evmNativeTransferNetwork } from '../../evm/observations/evm-native-transfer-observer.mjs';
import { evmFundingEndpointCommitment } from '../../evm/dispatch/evm-facts-binding.mjs';
import { nativeCustodyCommitment } from '@lianum/engine/native/native-receipt-binding';
import { normalizeNativeValueDispatchBinding,bindNativeValueDispatchRequest,equal,sha256 } from './wrapped-claim-dispatch-binding-v1.mjs';
import { createNativeValueDispatchJournal,readNativeValueDispatchJournal } from './wrapped-claim-dispatch-journal-v1.mjs';
import { loadPinned,resourceModuleURL } from '@lianum/proofs/tooling/tooling';
import { consumeWrappedGraphProviderAuthorityV4 } from './wrapped-claim-graph-dispatch-gate-v1.mjs';
const leases=new WeakMap(),custodies=new WeakMap(),copy=cloneInput,freeze=frozenInput;
export const NATIVE_VALUE_DISPATCH_OWNER_BLOCKERS=Object.freeze(['NEW_NATIVE_VALUE_SYSTEM_RELEASE_ARTIFACTS_ABSENT','ACTUAL_LOCAL_NATIVE_PROVIDER_INTEGRATION_UNEXECUTED','ACTUAL_TRON_NATIVE_AND_DISPATCH_ACCEPTANCE_UNEXECUTED']);
const SCHEMA='OWNED_WRAPPED_CLAIM_GRAPH_PROVIDER_CUSTODY_V1';
// Proof transport is canonical bounded hex; the deployed verifier requires bytes.
// Validate before decoding because Buffer.from(hex) silently truncates bad input.
function wrappedProofBytes(proof) {
  assert.ok(typeof proof === 'string' && proof.length > 0 && proof.length <= 2 * 1048576
    && proof.length % 64 === 0 && !/[^0-9a-f]/.test(proof), 'WRAPPED_NATIVE_PROOF_HEX');
  return Buffer.from(proof, 'hex');
}
export function assertOwnedNativeValueProviderCustody(custody,expected){
 exactRecord(expected,['runtime','system','poolIndex']);const state=custodies.get(custody);
 assert.ok(state,'NATIVE_VALUE_ORIGINAL_PROVIDER_CUSTODY_REQUIRED');for(const k of Object.keys(expected))assert.equal(state[k],expected[k]);state.live();
}
export function ownedNativeValueProviderCustodyReview(custody,expected){
 assertOwnedNativeValueProviderCustody(custody,expected);return custodies.get(custody).review();
}

/** One original consumer gets the lease; it cannot be copied or reopened after
 * uncertainty. Public custody never returns writable resources or key material. */
export async function openNativeValueDispatchLease(lease,expected,request) {
 exactRecord(expected,['runtime','system','poolIndex']);const r=leases.get(lease);
 assert.ok(r,'NATIVE_VALUE_ORIGINAL_DISPATCH_LEASE_REQUIRED');for(const k of Object.keys(expected))assert.equal(r[k],expected[k],'NATIVE_VALUE_LEASE_OWNER_BINDING');
 const {consumeNativeValueProviderBindRequest}=await import('./wrapped-claim-graph-dispatch-gate-v1.mjs');
 consumeNativeValueProviderBindRequest(request,{...expected,lease});
 r.resources.assertLive();assert.equal(r.opened,false,'NATIVE_VALUE_LEASE_ALREADY_OPENED');r.opened=true;await r.persistLifetime();return r.resources;
}
async function privateDirectory(nativeRuntime,directory){assert.ok(typeof directory==='string'&&isAbsolute(directory)&&resolve(directory)===directory&&!directory.includes('\0'),'NATIVE_VALUE_PRIVATE_DIRECTORY');
 const root=nativeRuntime.metadata.scratchDirectory;assert.ok(isAbsolute(root)&&resolve(root)===root);const suffix=relative(root,directory);
 assert.ok(suffix===''||(!suffix.startsWith('..'+sep)&&suffix!=='..'&&!isAbsolute(suffix)),'NATIVE_VALUE_OWNED_SCRATCH');
 const paths=[root];if(suffix)for(const part of suffix.split(sep))paths.push(join(paths.at(-1),part));
 for(const path of paths){assert.equal(await realpath(path),path);const stat=await lstat(path);assert.ok(stat.isDirectory()&&!stat.isSymbolicLink()&&(stat.mode&0o777)===0o700);
   if(typeof process.getuid==='function')assert.equal(stat.uid,process.getuid());}return directory;}
export async function createOwnedNativeValueProviderCustody(input){assert.equal(arguments.length,1);return createProviderCustodyV1(input,null);}
async function createProviderCustodyV1(input,recovery){
 exactRecord(input,['runtime','system','poolIndex','nativeRuntime','bootstrap','profileCommitment','recipientEndpoint','terms','acceptedLossClause','directory','password']);
 const {runtime,system,poolIndex,nativeRuntime,bootstrap}=input,terms=copy(input.terms),directory=input.directory;
 assert.ok(Number.isSafeInteger(poolIndex)&&!Object.is(poolIndex,-0)&&poolIndex>=0&&poolIndex<2);assertOwnedWrappedClaimGraphSystem(runtime,system);
 assertOwnedNativeValueQuorum(system.quorum,{runtime,system});
 const metadata=assertWrappedClaimOperatorBootstrapForSystemV1(bootstrap,{runtime,system});equal(metadata.adapterProfiles,system.adapterProfiles);equal(metadata.attesterKeys,system.registry.quorum.keys);
 const entry=system.adapterProfiles.find(e=>e.kind==='native-value'&&profileCommitment(e.profile)===input.profileCommitment);assert.ok(entry,'NATIVE_VALUE_REGISTERED_NATIVE_PROFILE');
 const p=entry.profile,evm=p.schema===PROFILE_SCHEMA;assert.ok(evm||p.schema===TRON_SCHEMA,'NATIVE_VALUE_NATIVE_PROFILE_REQUIRED');
 const tronRuntimeModule=evm?null:await import('../../tron/runtime/owned-tron-native-value-runtime.mjs');
 const nativeLive=()=>evm?assertOwnedLocalEvmNativeValueRuntime(nativeRuntime):tronRuntimeModule.assertOwnedLocalTronNativeValueV1(nativeRuntime);
 await nativeLive();assertWrappedClaimBootstrapNativeRuntimeV1(bootstrap,{runtime,system,nativeRuntime,profileCommitment:input.profileCommitment});
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
 await privateDirectory(nativeRuntime,directory);const reader=await createWrappedClaimGraphStateReaderV1({runtime,system,poolIndex});const view=await reader.read();await reader.assertCurrent(view);
 await nativeLive();
 // Allocation is after all genuine ownership and fixed profile checks.
 const vault=new Vault(join(directory,'native-value-provider.vault'));let record=recovery?await vault.read(password):undefined;
 if(recovery)equal(record,recovery.record);
 let key;
 if(recovery){const privateKey=createPrivateKey(record.data.privateKeyPem),publicKey=createPublicKey(privateKey),j=publicKey.export({format:'jwk'});assert.equal(j.crv,'secp256k1');key={privateKey,publicKey,x:Buffer.from(j.x,'base64url'),y:Buffer.from(j.y,'base64url')};}
 else key=freshKey();
 let closed=false,poisoned=false,busy=false,lease=null,backend,backendPending,capturing=false,captureStarted=false,captured=false,activeResourceOperations=0,recoveredLeaseTaken=false,closePrivatePromise,lifetimeHandle;
 const privateInput=copy(Object.fromEntries(['poolIndex','profileCommitment','recipientEndpoint','terms','acceptedLossClause','directory','password'].map(k=>[k,input[k]])));
 async function resourceTask(work){live();activeResourceOperations++;try{return await work();}finally{activeResourceOperations--;}}
 const publicKey=freeze({x:key.x.toString('hex'),y:key.y.toString('hex')}),source=evm?evmFundingEndpointCommitment({genesis:p.genesis,asset:p.asset,address:native.solverEndpoint.slice(2)}):tronGraphEndpoint(p.genesis,p.asset,native.solverEndpoint),destination=evm?evmFundingEndpointCommitment({genesis:p.genesis,asset:p.asset,address:native.recipientEndpoint.slice(2)}):tronGraphEndpoint(p.genesis,p.asset,native.recipientEndpoint);
 const actionTemplate=freeze({chainDomain:chainDomain(p),signerIdentity:nativeProviderIdentity(publicKey),sourceCommitment:source,destinationCommitment:destination,amount:terms.amount,custodyKind:1,
   custodyCommitment:evm?nativeCustodyCommitment({family:'3',genesis:p.genesis,asset:p.asset,sourceCommitment:source,destinationCommitment:destination}):tronGraphCustody({genesis:p.genesis,asset:p.asset,sourceCommitment:source,destinationCommitment:destination}),
   executionFrom:terms.executionFrom,executionUntil:terms.executionUntil,settleBefore:terms.settleBefore});
 const base=freeze({domain,pool:pool.address.slice(2),registry:system.registry,profiles:system.adapterProfiles,profileCommitment:input.profileCommitment,providerKey:publicKey,native,
   acceptedLossClause:NATIVE_ADMISSION_LOSS_CLAUSE,leaseId:sha256('LIANUM/original-native-value-provider/2\0'+publicKey.x+publicKey.y+domain.hubDomain)});
 const lifetime=await import('../../../claims/wrapped/recovery/wrapped-private-lifetime-registry-v1.mjs');
 const lifetimeIdentity={profile:SCHEMA,receiverGenesis:runtime.metadata.evmGenesis,hub:system.hub.address,poolIndex,leaseId:base.leaseId,directory};
 function lifetimeState(){const state=lease?leases.get(lease):null;return {schema:'WRAPPED_PROVIDER_PRIVATE_INITIALIZATION_V1',input:copy(privateInput),record:copy(record),nativeIdentity:{family:evm?'3':'4',genesis:p.genesis,chainId:evm?p.chainId:null,solver:native.solverEndpoint,recipient:native.recipientEndpoint},lease:state?{opened:state.opened,keyStarted:state.keyStarted()}:null,recoveryAdmissionGranted:false};}
 async function persistLifetime(){assert.ok(lifetimeHandle,'NATIVE_VALUE_PROVIDER_INITIALIZATION_REQUIRED');await lifetime.updateWrappedPrivateLifetimePartV1(lifetimeHandle,lifetimeState());lifetime.assertWrappedPrivateLifetimePartSealedV1(lifetimeHandle);}
 function live(){assert.ok(!closed&&!poisoned&&!capturing,'NATIVE_VALUE_PROVIDER_CUSTODY_CLOSED_OR_UNCERTAIN');assertOwnedWrappedClaimGraphSystem(runtime,system);assertOwnedNativeValueQuorum(system.quorum,{runtime,system});assertWrappedClaimBootstrapNativeRuntimeV1(bootstrap,{runtime,system,nativeRuntime,profileCommitment:input.profileCommitment});}
 async function unchanged(){live();try{await privateDirectory(nativeRuntime,directory);equal(await vault.read(password),record);}catch(cause){poisoned=true;throw new Error('NATIVE_VALUE_PROVIDER_ORIGINAL_CUSTODY_UNAVAILABLE',{cause});}}
 async function save(next){await unchanged();try{const saved=await vault.update(password,record.revision,()=>copy(next));equal(await vault.read(password),saved);record=saved;await persistLifetime();}catch(cause){poisoned=true;throw new Error('NATIVE_VALUE_PROVIDER_CUSTODY_WRITE_UNCERTAIN',{cause});}}
 async function hashFields(fields){live();if(!backendPending)backendPending=(async()=>{const helpers=await import(resourceModuleURL);assert.equal(helpers.verifyToolchain().barretenberg,'5.2.0');const bb=await loadPinned('@aztec/bb.js');
   backend=await bb.Barretenberg.new({backend:bb.BackendType.Wasm,threads:1,skipSrsInit:true,memory:{initial:37,maximum:32768}});return backend;})();
   const h=await backendPending;live();assert.ok(Array.isArray(fields)&&fields.length>0&&fields.length<=137);const inputs=fields.map(v=>{assert.ok(typeof v==='bigint'&&v>=0n&&v<FIELD_MODULUS);return Buffer.from(v.toString(16).padStart(64,'0'),'hex');});
   const result=Buffer.from((await h.poseidon2Hash({inputs})).hash).toString('hex');canonicalField(result);return result;}
 function closePrivate(){if(closePrivatePromise)return closePrivatePromise;closed=true;key=password=record=undefined;closePrivatePromise=(async()=>{try{await backendPending;}finally{await backend?.destroy();backend=backendPending=undefined;}})();return closePrivatePromise;}
 try{if(recovery){assert.equal(record.data.schema,SCHEMA);equal(record.data.base,base);equal(record.data.terms,terms);equal(record.data.publicKey,publicKey);equal(recovery.nativeIdentity,{family:evm?'3':'4',genesis:p.genesis,chainId:evm?p.chainId:null,solver:native.solverEndpoint,recipient:native.recipientEndpoint});}
 else record=await vault.create({schema:SCHEMA,base,terms,publicKey,privateKeyPem:key.privateKey.export({type:'pkcs8',format:'pem'}),quote:null,approvedIntent:null,dispatch:null},password);await unchanged();
 if(recovery){equal(recovery.lifetimeIdentity,lifetimeIdentity);const registered=await lifetime.readWrappedPrivateLifetimeIndexedPartV1(runtime,'provider',lifetimeIdentity);equal(registered.privateState.record,record);equal(registered.privateState.input,privateInput);lifetimeHandle=registered.handle;}
 else lifetimeHandle=await lifetime.retainWrappedPrivateLifetimeIndexedPartV1(runtime,'provider',lifetimeIdentity,lifetimeState());lifetime.assertWrappedPrivateLifetimePartSealedV1(lifetimeHandle);}
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
      signDispatchOnce(statement,authority,operation){assert.equal(arguments.length,3,'WRAPPED_GRAPH_PROVIDER_KEY_NO_OPTIONS');live();assert.equal(keyStarted,false,'NATIVE_VALUE_PROVIDER_KEY_ALREADY_STARTED');const state=readNativeValueDispatchJournal(binding,record.data.dispatch.state);
        assert.equal(state.phase,'PROVIDER_KEY_PENDING');equal(state.dispatchStatement,statement);
        const frame=nativeDispatchStatementFrame(statement);
        const accepted=consumeWrappedGraphProviderAuthorityV4(authority,operation,scoped,nativeRuntime,statement),now=performance.now();
        for(const started of [accepted.auditStarted,accepted.nativeAuditStarted]){const elapsed=now-started;assert.ok(Number.isFinite(elapsed)&&elapsed>=0&&elapsed<30000,'WRAPPED_GRAPH_PROVIDER_AUTHORITY_TOO_OLD');}
        keyStarted=true;return signature(key,frame).toString('hex');},
      observeOriginal:query=>resourceTask(()=>nativeRuntime.observeNativeValueOriginal(query)),
      retainOriginal(raw){live();exactRecord(raw,['profileCommitment','originalPreparation','signed']);assert.equal(raw.profileCommitment,binding.profileCommitment);
        const t=raw.originalPreparation.transaction;if(!evm){const {permissionId,...expected}=t;assert.equal(permissionId,'0');
          return bootstrap.retainOriginal({profileCommitment:binding.profileCommitment,original:{nativeWire:raw.signed.nativeWire,expected:{nativeId:raw.signed.nativeId,transactionSHA256:raw.signed.transactionSHA256,...expected}}});}
        return bootstrap.retainOriginal({profileCommitment:binding.profileCommitment,original:{nativeWire:raw.signed.nativeWire,
          expected:{nativeId:raw.signed.nativeId,chainId:t.chainId,genesisHash:'0x'+p.genesis,from:t.from,to:t.to,value:t.value,nonce:t.nonce,type:'0',gas:t.gas,
            fees:{gasPrice:t.gasPrice},wireKeyCommitment:binding.quote.action.receiptKeyCommitment}}});},close:closePrivate});
    leases.set(scoped,{runtime,system,poolIndex,resources,opened:false,originalOpened:recoveryLease?.opened??false,keyStarted:()=>keyStarted,persistLifetime});lease=scoped;return scoped;
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
      assert.equal(await system.verify(role,wrappedProofBytes(value.proof),value.publicInputs.map(v=>'0x'+BigInt(v).toString(16).padStart(64,'0'))),true,'NATIVE_VALUE_ORIGINAL_PROOF_REJECTED');
    await save({...record.data,approvedIntent,dispatch:{revision:'0',state:createNativeValueDispatchJournal(binding)}});
    const originalLease=restoreLease(binding,approvedIntent,null);await persistLifetime();return originalLease;
  });},
  close(){assert.equal(busy,false);if(lease!==null){const original=leases.get(lease);assert.ok(original&&!original.opened,'NATIVE_VALUE_OPEN_LEASE_OWNS_LIFETIME');
    leases.delete(lease);lease=null;}return closePrivate();},
  report(){return freeze({profile:SCHEMA,closed,persistenceUncertain:poisoned,quoteBound:Boolean(record?.data.quote),leaseIssued:lease!==null,creditEligible:false});},
  toJSON(){throw new Error('NATIVE_VALUE_PROVIDER_CUSTODY_NOT_SERIALIZABLE');},
 });custodies.set(custody,{runtime,system,poolIndex,live,
 fence(){live();assert.ok(!busy&&activeResourceOperations===0,'NATIVE_VALUE_PROVIDER_CAPTURE_BUSY');capturing=true;},
 async capture(){if(!capturing)custodies.get(custody).fence();assert.ok(!captureStarted,'NATIVE_VALUE_PROVIDER_CAPTURE_ONCE');captureStarted=true;
  equal(await vault.read(password),record);await persistLifetime();const state=lease?leases.get(lease):null;
  const value={schema:'WRAPPED_NATIVE_PROVIDER_RECOVERY_V1',lifetimeIdentity:copy(lifetimeIdentity),input:copy(privateInput),record:copy(record),
   nativeIdentity:{family:evm?'3':'4',genesis:p.genesis,chainId:evm?p.chainId:null,solver:native.solverEndpoint,recipient:native.recipientEndpoint},
   lease:state?{opened:state.opened,keyStarted:state.keyStarted()}:null};captured=true;return value;},
 async abortCaptured(){assert.ok(capturing&&!busy&&activeResourceOperations===0,'NATIVE_VALUE_PROVIDER_CAPTURE_FENCE_REQUIRED');await closePrivate();return {closed:true,recoveryIncomplete:true,originalPrivateStateRetained:true};},
 async stopCaptured(){assert.ok(capturing&&captured&&!busy&&activeResourceOperations===0,'NATIVE_VALUE_PROVIDER_CAPTURE_REQUIRED');await closePrivate();return {closed:true,originalPrivateStateRetained:true};},
 takeRecoveredLease(){live();assert.ok(recovery&&recovery.lease&&lease&&!recoveredLeaseTaken,'NATIVE_VALUE_ORIGINAL_RECOVERED_LEASE_REQUIRED');recoveredLeaseTaken=true;return lease;},
 review(){live();assert.ok(record.data.quote,'NATIVE_VALUE_ORIGINAL_ACCEPTED_QUOTE_REQUIRED');
    return freeze(copy({routeProfile:'OWNED_LOCAL_WRAPPED_CLAIM_NATIVE_GRAPH_V1',family:evm?'3':'4',chainId:evm?p.chainId:null,genesis:p.genesis,
      sourcePool:pool.address,sourceAssetIdentity:domain.asset,nativeAsset:p.asset,solver:native.solverEndpoint,recipient:native.recipientEndpoint,
      nativeAmount:terms.amount,executionFrom:terms.executionFrom,executionUntil:terms.executionUntil,settleBefore:terms.settleBefore,
      payoutCommitment:record.data.quote.payoutCommitment,deliveryRiskCommitment:record.data.quote.action.deliveryRiskCommitment,
      deliveryLossClause:NATIVE_ADMISSION_LOSS_CLAUSE,creditEligible:false,privateSpendableAtomic:null,publicNetwork:false}));}});
 if(recovery?.lease){exactRecord(recovery.lease,['opened','keyStarted']);assert.equal(typeof recovery.lease.opened,'boolean');assert.equal(typeof recovery.lease.keyStarted,'boolean');assert.ok(record.data.quote&&record.data.approvedIntent&&record.data.dispatch);const binding=normalizeNativeValueDispatchBinding({...base,quote:record.data.quote});readNativeValueDispatchJournal(binding,record.data.dispatch.state);restoreLease(binding,record.data.approvedIntent,recovery.lease);}
 else if(recovery)assert.ok(record.data.approvedIntent===null&&record.data.dispatch===null,'NATIVE_VALUE_MISSING_ORIGINAL_LEASE');
 return custody;
}

/** Private originals only; caller JSON cannot mint a recovered capability. */
export function fenceOwnedNativeValueProviderRecoveryV1(custody){assert.equal(arguments.length,1);const s=custodies.get(custody);assert.ok(s,'NATIVE_VALUE_ORIGINAL_PROVIDER_CUSTODY_REQUIRED');s.fence();}
export function captureOwnedNativeValueProviderRecoveryV1(custody){assert.equal(arguments.length,1);const s=custodies.get(custody);assert.ok(s,'NATIVE_VALUE_ORIGINAL_PROVIDER_CUSTODY_REQUIRED');return s.capture();}
export function abortOwnedNativeValueProviderRecoveryV1(custody){assert.equal(arguments.length,1);const s=custodies.get(custody);assert.ok(s,'NATIVE_VALUE_ORIGINAL_PROVIDER_CUSTODY_REQUIRED');return s.abortCaptured();}
export function stopCapturedNativeValueProviderRecoveryV1(custody){assert.equal(arguments.length,1);const s=custodies.get(custody);assert.ok(s,'NATIVE_VALUE_ORIGINAL_PROVIDER_CUSTODY_REQUIRED');return s.stopCaptured();}
export async function reopenOwnedNativeValueProviderRecoveryV1(token){
 assert.equal(arguments.length,1);const {consumeWrappedWalletRecoveryPartV1}=await import('../../../operations/wallet/wrapped-wallet-composition-v1.mjs');
 const {runtime,system,poolIndex,nativeRuntime,bootstrap,record}=consumeWrappedWalletRecoveryPartV1(token,'provider');
 exactRecord(record,['schema','input','record','nativeIdentity','lease','lifetimeIdentity']);assert.equal(record.schema,'WRAPPED_NATIVE_PROVIDER_RECOVERY_V1');assert.equal(poolIndex,record.input.poolIndex);
 return createProviderCustodyV1({...record.input,runtime,system,nativeRuntime,bootstrap},record);
}
export async function takeRecoveredNativeValueProviderLeaseV1(token){
 assert.equal(arguments.length,1);const {consumeWrappedWalletRecoveryPartV1}=await import('../../../operations/wallet/wrapped-wallet-composition-v1.mjs');
 const {custody}=consumeWrappedWalletRecoveryPartV1(token,'provider-lease');const s=custodies.get(custody);assert.ok(s,'NATIVE_VALUE_ORIGINAL_PROVIDER_CUSTODY_REQUIRED');return s.takeRecoveredLease();
}
