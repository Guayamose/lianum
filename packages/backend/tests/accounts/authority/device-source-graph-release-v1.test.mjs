/** Full source account with real consent, private send/claim state and AEAD CAS.
 * Graph certificates, chain observations, proof workers and retained storage
 * are fixed lower ports; this test does not establish financial acceptance. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {createHash} from 'node:crypto';
import * as P from '@lianum/mobile-protocol/device/source-note-v1';
import {createBalanceNote,walletDepositInput} from '@lianum/engine/wallet/notes/private-wallet-note-encoding';
import {derivePrivateAssetIdentity} from '@lianum/engine/notes/private-asset-runtime';
import {Vault} from '@lianum/engine/crypto/vault';
import {devicePublicKey,signDeviceMessage} from '../../../../../apps/mobile/src/custody/signing.mjs';
import {loadDeviceNoteAuthorityHost} from '../../support/device-note-authority-host.mjs';
const h=value=>createHash('sha256').update(value).digest('hex');

test('HOST source release uses the original account and fresh certificate before durable CAS, including idempotent retry',async t=>{
 const scratch=await mkdtemp(join(tmpdir(),'source-graph-release-'));t.after(()=>rm(scratch,{recursive:true,force:true}));
 let api,account,retained,claim,authorized=true,proofs=0,sends=0,certificateReads=0;
 const bridge=Object.freeze({}),recovery=Object.freeze({}),identity=Object.freeze({hostOnly:true}),handle=Object.freeze({});
 const token='34'.repeat(20),code='0x'+h('release-token'),domain=Object.fromEntries(['scope','policy','hubDomain','registryCommitment','verifierSetCommitment','ledgerNamespace'].map(k=>[k,h('release-'+k)]));domain.ledgerNamespace=domain.hubDomain;domain.asset=derivePrivateAssetIdentity('31337','0x'+token,code).slice(2);
 const asset=Object.freeze({metadata:{kind:'ERC20',address:'0x'+token,codeHash:code,symbol:'USDC',decimals:6,chainId:'31337',genesisHash:'0x'+h('genesis')},async allowance(){return 20n;},async balance(){return 100n;}});
 const pool={address:'0x'+'12'.repeat(20),codeHash:'0x'+h('pool'),asset:'0x'+token,assetCodeHash:code,assetCapability:asset,assetMetadata:asset.metadata,domain,domainCommitment:'0x'+'01'.repeat(32),artifact:{}};
 const system={pools:[pool],sender:'0x'+'56'.repeat(20),hub:{address:'0x'+'78'.repeat(20),codeHash:'0x'+h('hub')},async verify(){return true;}};
 const view={head:{number:'1',hash:h('head'),timestamp:'6000'},header:{number:'0x1'},ledger:{commitments:[],nullifiers:[],roots:[],publicState:{leaves:0,spent:0,liveReservations:0,outputCapacity:0,actualAssetBalance:'0',backedAmount:'0',surplus:'0'}},poolObservation:{rawState:'0x00',rawHistory:'0x00',rawBacking:'0x00'}};
 const observation={transaction:{hash:h('wire')},receipt:{blockHash:h('receipt')}};
 const runtime={metadata:{scratchDirectory:scratch,evmGenesis:'0x'+h('genesis')},async dispatchOriginalDeviceExternalFlatNoteV1(request){
  const scope=api.consumeOriginalDeviceExternalFlatSendV1(request,runtime),expected={from:system.sender,to:pool.address,data:scope.transaction.data,value:'0',chainId:'31337',nonce:'0'};
  assert.throws(()=>api.consumeOriginalDeviceExternalFlatSendV1(request,runtime));await scope.beforeKey(expected);scope.assertBeforeKey(expected);await scope.onSigned({nativeId:'0x'+h('wire')},expected);await scope.beforeBroadcast(expected);scope.assertBeforeBroadcast(expected);sends++;
  view.ledger.commitments=[retained.confirmed.record.data.jobs[0].consent.statement.output].map(value=>'0x'+value);view.ledger.publicState={...view.ledger.publicState,leaves:1,outputCapacity:1,actualAssetBalance:'20',backedAmount:'20'};
  return{transactionHash:'0x'+h('wire')};
 }};
 const observer={async readTransaction(query){assert.equal(query.kind,'deposit');assert.equal(query.transactionHash,h('wire'));return observation;}};
 api=await loadDeviceNoteAuthorityHost(t,{
  assertOwnedLocalEvmV2:r=>assert.equal(r,runtime),assertOwnedDeviceExternalFlatReceiverV1:r=>assert.equal(r,runtime),assertLocalEvm:async r=>assert.equal(r,runtime),assertOwnedFlatSystem:(r,s)=>{assert.equal(r,runtime);assert.equal(s,system);},assertOwnedPoolAsset:(r,a)=>{assert.equal(r,runtime);assert.equal(a,asset);},
  createFlatSystemStateReader:async()=>({async read(){return view;},async assertCurrent(v){assert.equal(v,view);}}),createFlatOwnerObserver:async()=>observer,assertOwnedFlatOwnerObserver:o=>assert.equal(o,observer),
  validateFlatAccountOwnerObservation({submission,observation:value}){assert.equal(value,observation);assert.equal(submission.kind,'deposit');assert.equal(submission.transactionHash,h('wire'));assert.equal(submission.publicInputs.length,26);},
  createProofProcess:()=>({async prove(mode,input,words){assert.equal(mode,'deposit_balance');proofs++;return{proof:Buffer.from('ab'.repeat(64),'hex'),publicInputs:words.map(String),metrics:{acceptedResult:true}};},async close(){}}),
  assertOriginalDeviceGraphSourceAvailableV2:value=>assert.equal(value,account),beginOriginalDeviceGraphSourceActivityV2:async value=>{assert.equal(value,account);return value;},endOriginalDeviceGraphSourceActivityV2:async value=>assert.equal(value,account),
  assertOriginalDeviceExternalFlatGraphAccountBindingV1(b,a){assert.equal(b,bridge);assert.equal(a,account);},
  assertOriginalDeviceExternalFlatSourceGraphV1(b,a){assert.equal(b,bridge,'HOST_ORIGINAL_BRIDGE');assert.equal(a,account);},
  readOriginalDeviceExternalFlatSourceGraphClaimV1:b=>{assert.equal(b,bridge);return structuredClone(claim);},
  readOriginalDeviceExternalFlatSourceGraphReleaseV1:b=>{assert.equal(b,bridge);certificateReads++;assert.ok(authorized,'HOST_RELEASE_CERTIFICATE');return structuredClone(claim);},
  assertDeviceExternalFlatRecoveryAuthorityV1:r=>{assert.equal(r,recovery);return identity;},assertWrappedPrivateLifetimeAttemptV1:(r,i)=>{assert.equal(r,runtime);assert.equal(i,identity);},
  retainWrappedPrivateLifetimePartV1:async(r,slot,i,state)=>{assert.equal(r,runtime);assert.equal(slot,'device-external-flat-account-0');retained=structuredClone(state);return handle;},
  updateWrappedPrivateLifetimePartV1:async(h,state)=>{assert.equal(h,handle);retained=structuredClone(state);},readWrappedPrivateLifetimePartV1:async r=>{assert.equal(r,runtime);return{handle,privateState:structuredClone(retained)};},assertWrappedPrivateLifetimePartSealedV1:h=>assert.equal(h,handle),
 });
 const key=new Uint8Array(32);key[31]=20;const sign=c=>signDeviceMessage(key,P.externalFlatPermissionMessageV1(c));let witness;
 try{
  account=await api.createOriginalDeviceExternalFlatNoteAuthorityV1({runtime,system,poolIndex:0,origin:'https://localhost:9443',devicePublicKey:devicePublicKey(key)});await api.retainOriginalDeviceExternalFlatGraphAccountV1(account,bridge,recovery);
  const note=createBalanceNote({scope:domain.scope,policy:domain.policy,value:'20'});witness=walletDepositInput({scope:domain.scope,policy:domain.policy,epoch:'10',note});const bytes=P.externalFlatWitnessBytesV1('deposit_balance',witness);
  const draft={action:'PROVE_D26',jobId:null,rootId:h('root'),noteRevision:1,recipient:'90'.repeat(20),statement:{scope:domain.scope,policy:domain.policy,epoch:'10',amount:'20',output:note.commitment.toString('hex')},path:null,witnessSHA256:h(bytes)};bytes.fill(0);
  const review=async draft=>{const access=account.challenge();return(await account.review({access,signature:sign(access),draft})).consent;};
  const proof=await review(draft),row=await account.operate({consent:proof,signature:sign(proof),witness});
  const consent=await review({action:'FUND_D26',...Object.fromEntries(['jobId','rootId','noteRevision','recipient','statement','path','witnessSHA256'].map(k=>[k,row.consentFields[k]]))});
  const confirmed=await account.operate({consent,signature:sign(consent),witness:null});assert.equal(confirmed.stage,'CONFIRMED');assert.equal(sends,1);assert.equal(proofs,1);
  claim={depositJobId:confirmed.jobId,rootId:confirmed.consentFields.rootId,jobId:h('graph-job'),statementSHA256:h('statement')};const input={runtime,system,poolIndex:0,...claim};
  await api.latchOriginalDeviceExternalFlatSourceGraphV1(account,bridge,input);const original=structuredClone(retained.confirmed),store=new Vault(original.file),read=()=>store.read(original.password),before=await read();assert.deepEqual(before.data.graphClaim,claim);
  const release=(b=bridge,value=input)=>api.releaseOriginalDeviceExternalFlatSourceGraphV1(account,b,value),unchanged=async()=>assert.deepEqual(await read(),before);
  await assert.rejects(api.releaseOriginalDeviceExternalFlatSourceGraphV1({...account},bridge,input),/DEVICE_EXTERNAL_FLAT_SOURCE_REQUIRED/);
  await assert.rejects(release({...bridge}),/HOST_ORIGINAL_BRIDGE/);await assert.rejects(release(bridge,{...input,rootId:h('foreign-root')}),/DEVICE_EXTERNAL_FLAT_SOURCE_GRAPH_CLAIM/);
  const nullifier='0x'+before.data.jobs[0].nullifier;view.ledger.nullifiers.push(nullifier);await assert.rejects(release(),/DEVICE_EXTERNAL_FLAT_SOURCE_NOT_AVAILABLE/);view.ledger.nullifiers.pop();
  authorized=false;await assert.rejects(release(),/HOST_RELEASE_CERTIFICATE/);await unchanged();authorized=true;
  const readsBefore=certificateReads;assert.deepEqual(await release(),{released:true});assert.ok(certificateReads>=readsBefore+3);
  const after=await read();assert.equal(after.revision,before.revision+1);assert.equal(Object.hasOwn(after.data,'graphClaim'),false);const {graphClaim,...expected}=before.data;assert.deepEqual(after.data,expected);
  const ciphertext=await readFile(original.file);assert.deepEqual(await release(),{released:true});assert.deepEqual(await read(),after);assert.deepEqual(await readFile(original.file),ciphertext);
  authorized=false;await assert.rejects(release(),/HOST_RELEASE_CERTIFICATE/);authorized=true;view.ledger.nullifiers.push(nullifier);await assert.rejects(release(),/DEVICE_EXTERNAL_FLAT_SOURCE_NOT_AVAILABLE/);view.ledger.nullifiers.pop();assert.deepEqual(await read(),after);
  // An authenticated but unrelated current record cannot replace the owner's
  // private revision, even for an otherwise idempotent release.
  await store.update(original.password,after.revision,data=>({...data,jobs:[]}));await assert.rejects(release(),/DEVICE_EXTERNAL_FLAT_JOURNAL_CHANGED/);assert.equal(sends,1);assert.equal(proofs,1);
  ciphertext.fill(0);
 }finally{await account?.close();key.fill(0);P.externalFlatWipeV1(witness);}
});
