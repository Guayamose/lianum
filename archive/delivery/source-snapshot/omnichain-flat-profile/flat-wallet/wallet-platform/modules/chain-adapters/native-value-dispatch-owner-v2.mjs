/** Original same-host solver provider custody and immutable once-only lease.
 * The actual NEW system, original native fixture and original operator bootstrap
 * are required before allocation. Importing this module creates no key/runtime.
 * Public operations accept data and an original recipient process, never a
 * signer, transport, journal, clock, verifier or hash implementation.
 * All native funds belong to the original solver runtime, separately from the
 * user's reserved private asset/payout. Native delivery creates no private credit.
 * Session-only keys: no copied-key, missing-journal reset or replacement recovery. */
import assert from 'node:assert/strict';
import { lstat, realpath } from 'node:fs/promises';
import { isAbsolute,join,relative,resolve,sep } from 'node:path';
import { Vault } from '../../../../../omnichain-product/src/vault.mjs';
import { freshKey, signature } from '../../../../../omnichain-product/src/private-note-encoding.mjs';
import { assertOwnedNativeRecipientProcess } from '../../../../../omnichain-product/src/paeg/native-recipient-process.mjs';
import { nativeProviderIdentity, NATIVE_ADMISSION_LOSS_CLAUSE, nativeDispatchStatementFrame } from '../../../../../omnichain-product/src/paeg/native-admission.mjs';
import { PROFILE_SCHEMA as TRON_SCHEMA, tronGraphAsset, tronGraphEndpoint, tronGraphCustody } from './tron-native-graph-profile.mjs';
import { assertOwnedLocalEvmNativeValueRuntime, assertOwnedLocalEvmObservedClockV1 } from './owned-evm-v2-runtime.mjs';
import { assertOwnedNativeValueSystem } from '../ops/native-value-system-v2.mjs';
import { assertNativeValueOperatorBootstrapForSystem, assertNativeValueBootstrapNativeRuntime } from '../ops/native-value-local-operator-bootstrap-v4.mjs';
import { assertOwnedNativeValueQuorum } from '../ops/native-value-operators-v4.mjs';
import { createNativeValueSystemStateReader } from '../paeg/native-value-system-state-v2.mjs';
import { exactRecord,bytes32,canonicalField,FIELD_MODULUS } from '../paeg/commitments.mjs';
import { cloneInput,frozenInput,inputUint } from '../paeg/readiness-inputs.mjs';
import { profileCommitment,chainDomain } from './generic-native-value-v2.mjs';
import { PROFILE_SCHEMA,CHAINS } from './evm-native-value-v2.mjs';
import { evmNativeTransferNetwork } from './evm-native-transfer-observer.mjs';
import { evmFundingEndpointCommitment } from './evm-facts-binding.mjs';
import { nativeCustodyCommitment } from './native-receipt-binding.mjs';
import { normalizeNativeValueDispatchBinding,bindNativeValueDispatchRequest,equal,sha256 } from './native-value-dispatch-binding-v2.mjs';
import { createNativeValueDispatchJournal,readNativeValueDispatchJournal } from './native-value-dispatch-journal-v2.mjs';
import { loadPinned,resourceModuleURL } from '../../../proof-workers/tooling.mjs';
const leases=new WeakMap(),custodies=new WeakMap(),copy=cloneInput,freeze=frozenInput;
export const NATIVE_VALUE_DISPATCH_OWNER_BLOCKERS=Object.freeze(['NEW_NATIVE_VALUE_SYSTEM_RELEASE_ARTIFACTS_ABSENT','ACTUAL_LOCAL_NATIVE_PROVIDER_INTEGRATION_UNEXECUTED','ACTUAL_TRON_NATIVE_AND_DISPATCH_ACCEPTANCE_UNEXECUTED']);
const SCHEMA='OWNED_NATIVE_VALUE_PROVIDER_CUSTODY_V2';
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
 const {consumeNativeValueProviderBindRequest}=await import('./native-value-evm-dispatch-gate.mjs');
 consumeNativeValueProviderBindRequest(request,{...expected,lease});
 r.resources.assertLive();assert.equal(r.opened,false,'NATIVE_VALUE_LEASE_ALREADY_OPENED');r.opened=true;return r.resources;
}
async function privateDirectory(nativeRuntime,directory){assert.ok(typeof directory==='string'&&isAbsolute(directory)&&resolve(directory)===directory&&!directory.includes('\0'),'NATIVE_VALUE_PRIVATE_DIRECTORY');
 const root=nativeRuntime.metadata.scratchDirectory;assert.ok(isAbsolute(root)&&resolve(root)===root);const suffix=relative(root,directory);
 assert.ok(suffix===''||(!suffix.startsWith('..'+sep)&&suffix!=='..'&&!isAbsolute(suffix)),'NATIVE_VALUE_OWNED_SCRATCH');
 const paths=[root];if(suffix)for(const part of suffix.split(sep))paths.push(join(paths.at(-1),part));
 for(const path of paths){assert.equal(await realpath(path),path);const stat=await lstat(path);assert.ok(stat.isDirectory()&&!stat.isSymbolicLink()&&(stat.mode&0o777)===0o700);
   if(typeof process.getuid==='function')assert.equal(stat.uid,process.getuid());}return directory;}
export async function createOwnedNativeValueProviderCustody(input){
 exactRecord(input,['runtime','system','poolIndex','nativeRuntime','bootstrap','profileCommitment','recipientEndpoint','terms','acceptedLossClause','directory','password']);
 const {runtime,system,poolIndex,nativeRuntime,bootstrap}=input,terms=copy(input.terms),directory=input.directory;
 assert.ok(Number.isSafeInteger(poolIndex)&&!Object.is(poolIndex,-0)&&poolIndex>=0&&poolIndex<2);assertOwnedNativeValueSystem(runtime,system);
 assertOwnedNativeValueQuorum(system.quorum,{runtime,system});
 const metadata=assertNativeValueOperatorBootstrapForSystem(bootstrap,{runtime,system});equal(metadata.adapterProfiles,system.adapterProfiles);equal(metadata.attesterKeys,system.registry.quorum.keys);
 const entry=system.adapterProfiles.find(e=>profileCommitment(e.profile)===input.profileCommitment);assert.ok(entry,'NATIVE_VALUE_REGISTERED_NATIVE_PROFILE');
 const p=entry.profile,evm=p.schema===PROFILE_SCHEMA;assert.ok(evm||p.schema===TRON_SCHEMA,'NATIVE_VALUE_NATIVE_PROFILE_REQUIRED');
 const tronRuntimeModule=evm?null:await import('./owned-tron-native-value-runtime.mjs');
 const nativeLive=()=>evm?assertOwnedLocalEvmNativeValueRuntime(nativeRuntime):tronRuntimeModule.assertOwnedLocalTronNativeValueV1(nativeRuntime);
 await nativeLive();assertNativeValueBootstrapNativeRuntime(bootstrap,{runtime,system,nativeRuntime,profileCommitment:input.profileCommitment});
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
 const vault=new Vault(join(directory,'native-value-provider.vault'));let key=freshKey(),record,closed=false,poisoned=false,busy=false,lease=null,backend,backendPending;
 const publicKey=freeze({x:key.x.toString('hex'),y:key.y.toString('hex')}),source=evm?evmFundingEndpointCommitment({genesis:p.genesis,asset:p.asset,address:native.solverEndpoint.slice(2)}):tronGraphEndpoint(p.genesis,p.asset,native.solverEndpoint),destination=evm?evmFundingEndpointCommitment({genesis:p.genesis,asset:p.asset,address:native.recipientEndpoint.slice(2)}):tronGraphEndpoint(p.genesis,p.asset,native.recipientEndpoint);
 const actionTemplate=freeze({chainDomain:chainDomain(p),signerIdentity:nativeProviderIdentity(publicKey),sourceCommitment:source,destinationCommitment:destination,amount:terms.amount,custodyKind:1,
   custodyCommitment:evm?nativeCustodyCommitment({family:'3',genesis:p.genesis,asset:p.asset,sourceCommitment:source,destinationCommitment:destination}):tronGraphCustody({genesis:p.genesis,asset:p.asset,sourceCommitment:source,destinationCommitment:destination}),
   executionFrom:terms.executionFrom,executionUntil:terms.executionUntil,settleBefore:terms.settleBefore});
 const base=freeze({domain,pool:pool.address.slice(2),registry:system.registry,profiles:system.adapterProfiles,profileCommitment:input.profileCommitment,providerKey:publicKey,native,
   acceptedLossClause:NATIVE_ADMISSION_LOSS_CLAUSE,leaseId:sha256('LIANUM/original-native-value-provider/2\0'+publicKey.x+publicKey.y+domain.hubDomain)});
 function live(){assert.ok(!closed&&!poisoned,'NATIVE_VALUE_PROVIDER_CUSTODY_CLOSED_OR_UNCERTAIN');assertOwnedNativeValueSystem(runtime,system);assertOwnedNativeValueQuorum(system.quorum,{runtime,system});assertNativeValueBootstrapNativeRuntime(bootstrap,{runtime,system,nativeRuntime,profileCommitment:input.profileCommitment});}
 async function unchanged(){live();try{await privateDirectory(nativeRuntime,directory);equal(await vault.read(password),record);}catch(cause){poisoned=true;throw new Error('NATIVE_VALUE_PROVIDER_ORIGINAL_CUSTODY_UNAVAILABLE',{cause});}}
 async function save(next){await unchanged();try{const saved=await vault.update(password,record.revision,()=>copy(next));equal(await vault.read(password),saved);record=saved;}catch(cause){poisoned=true;throw new Error('NATIVE_VALUE_PROVIDER_CUSTODY_WRITE_UNCERTAIN',{cause});}}
 async function hashFields(fields){live();if(!backendPending)backendPending=(async()=>{const helpers=await import(resourceModuleURL);assert.equal(helpers.verifyToolchain().barretenberg,'5.2.0');const bb=await loadPinned('@aztec/bb.js');
   backend=await bb.Barretenberg.new({backend:bb.BackendType.Wasm,threads:1,skipSrsInit:true,memory:{initial:37,maximum:32768}});return backend;})();
   const h=await backendPending;live();assert.ok(Array.isArray(fields)&&fields.length>0&&fields.length<=137);const inputs=fields.map(v=>{assert.ok(typeof v==='bigint'&&v>=0n&&v<FIELD_MODULUS);return Buffer.from(v.toString(16).padStart(64,'0'),'hex');});
   const result=Buffer.from((await h.poseidon2Hash({inputs})).hash).toString('hex');canonicalField(result);return result;}
 async function closePrivate(){closed=true;key=password=record=undefined;try{await backendPending;}finally{await backend?.destroy();backend=backendPending=undefined;}}
 try{record=await vault.create({schema:SCHEMA,base,terms,publicKey,privateKeyPem:key.privateKey.export({type:'pkcs8',format:'pem'}),quote:null,approvedIntent:null,dispatch:null},password);await unchanged();}
 catch(error){await closePrivate();throw error;}
 async function serial(work){live();assert.equal(busy,false,'NATIVE_VALUE_PROVIDER_CUSTODY_BUSY');busy=true;try{await unchanged();await nativeLive();return await work();}finally{busy=false;}}
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
    let keyStarted=false;const scoped=Object.freeze(Object.create(null));
    const store=Object.freeze({async load(){await unchanged();return copy(record.data.dispatch);},async commit(raw){const update=copy(raw);exactRecord(update,['expectedRevision','nextState']);await unchanged();
      const old=record.data.dispatch;assert.equal(old.revision,update.expectedRevision);readNativeValueDispatchJournal(binding,update.nextState);
      assert.equal(update.nextState.events.length,old.state.events.length+1,'NATIVE_VALUE_APPEND_EXACTLY_ONE_EVENT');equal(update.nextState.events.slice(0,-1),old.state.events);
      const dispatch={revision:(BigInt(old.revision)+1n).toString(),state:update.nextState};await save({...record.data,dispatch});return copy(dispatch);}});
    const resources=Object.freeze({binding,approvedIntent,nativeRuntime,store,hashFields,gasLimit:'100000',assertLive:live,
      async assertLeaseCurrent(){await unchanged();assert.ok(lease===scoped);equal(record.data.approvedIntent,approvedIntent);await nativeLive();},
      assertPreparedCurrent:original=>nativeRuntime.assertNativeValuePreparedCurrent(original),
      signDispatchOnce(statement){live();assert.equal(keyStarted,false,'NATIVE_VALUE_PROVIDER_KEY_ALREADY_STARTED');const state=readNativeValueDispatchJournal(binding,record.data.dispatch.state);
        assert.equal(state.phase,'PROVIDER_KEY_PENDING');equal(state.dispatchStatement,statement);keyStarted=true;
        return signature(key,nativeDispatchStatementFrame(statement)).toString('hex');},
      observeOriginal:query=>nativeRuntime.observeNativeValueOriginal(query),
      retainOriginal(raw){live();exactRecord(raw,['profileCommitment','originalPreparation','signed']);assert.equal(raw.profileCommitment,binding.profileCommitment);
        const t=raw.originalPreparation.transaction;if(!evm){const {permissionId,...expected}=t;assert.equal(permissionId,'0');
          return bootstrap.retainOriginal({profileCommitment:binding.profileCommitment,original:{nativeWire:raw.signed.nativeWire,expected:{nativeId:raw.signed.nativeId,transactionSHA256:raw.signed.transactionSHA256,...expected}}});}
        return bootstrap.retainOriginal({profileCommitment:binding.profileCommitment,original:{nativeWire:raw.signed.nativeWire,
          expected:{nativeId:raw.signed.nativeId,chainId:t.chainId,genesisHash:'0x'+p.genesis,from:t.from,to:t.to,value:t.value,nonce:t.nonce,type:'0',gas:t.gas,
            fees:{gasPrice:t.gasPrice},wireKeyCommitment:binding.quote.action.receiptKeyCommitment}}});},close:closePrivate});
    leases.set(scoped,{runtime,system,poolIndex,resources,opened:false});lease=scoped;return scoped;
  });},
  close(){assert.equal(busy,false);if(lease!==null){const original=leases.get(lease);assert.ok(original&&!original.opened,'NATIVE_VALUE_OPEN_LEASE_OWNS_LIFETIME');
    leases.delete(lease);lease=null;}return closePrivate();},
  report(){return freeze({profile:SCHEMA,closed,persistenceUncertain:poisoned,quoteBound:Boolean(record?.data.quote),leaseIssued:lease!==null,creditEligible:false});},
  toJSON(){throw new Error('NATIVE_VALUE_PROVIDER_CUSTODY_NOT_SERIALIZABLE');},
 });custodies.set(custody,{runtime,system,poolIndex,live,review(){live();assert.ok(record.data.quote,'NATIVE_VALUE_ORIGINAL_ACCEPTED_QUOTE_REQUIRED');
    return freeze(copy({routeProfile:'OWNED_LOCAL_NATIVE_VALUE_GRAPH_V2',family:evm?'3':'4',chainId:evm?p.chainId:null,genesis:p.genesis,
      sourcePool:pool.address,sourceAssetIdentity:domain.asset,nativeAsset:p.asset,solver:native.solverEndpoint,recipient:native.recipientEndpoint,
      nativeAmount:terms.amount,executionFrom:terms.executionFrom,executionUntil:terms.executionUntil,settleBefore:terms.settleBefore,
      payoutCommitment:record.data.quote.payoutCommitment,deliveryRiskCommitment:record.data.quote.action.deliveryRiskCommitment,
      deliveryLossClause:NATIVE_ADMISSION_LOSS_CLAUSE,creditEligible:false,privateSpendableAtomic:null,publicNetwork:false}));}});return custody;
}
