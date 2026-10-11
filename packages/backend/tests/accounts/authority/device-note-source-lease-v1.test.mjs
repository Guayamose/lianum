/** Actual account, journal, consent/signature and send scope. Chain/proof and
 * SOURCE checkpoint resources are explicit inert lower ports. */
import test,{mock} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {createHash} from 'node:crypto';
import * as P from '@lianum/mobile-protocol/device/source-note-v1';
import {createBalanceNote,walletDepositInput} from '@lianum/engine/wallet/notes/private-wallet-note-encoding';
import {derivePrivateAssetIdentity} from '@lianum/engine/notes/private-asset-runtime';
import {devicePublicKey,signDeviceMessage} from '../../../../../apps/mobile/src/custody/signing.mjs';
import {loadDeviceNoteAuthorityHost} from '../../support/device-note-authority-host.mjs';
const h=value=>createHash('sha256').update(value).digest('hex');
const deferred=()=>{let resolve;const promise=new Promise(r=>{resolve=r;});return{promise,resolve};};

test('HOST SOURCE readonly review preserves its original lease while admitted mutations still await checkpoint',async t=>{
 const scratch=await mkdtemp(join(tmpdir(),'device-note-lease-'));t.after(()=>rm(scratch,{recursive:true,force:true}));
 let clock=1000,available=true,begins=0,checkpoints=0,availabilityChecks=0,economicAdmissions=0,holdCheckpoint=false,account,api,retained;
 const sourceToken=Object.freeze({}),requestToken=Object.freeze({}),retainedHandle=Object.freeze({}),bridge=Object.freeze({}),recovery=Object.freeze({}),identity=Object.freeze({hostOnly:true}),proofGate=deferred(),proofStarted=deferred(),checkpointGate=deferred(),checkpointStarted=deferred();
 const token='34'.repeat(20),code='0x'+h('lease-token'),domain=Object.fromEntries(['scope','policy','hubDomain','registryCommitment','verifierSetCommitment','ledgerNamespace'].map(k=>[k,h('lease-'+k)]));domain.ledgerNamespace=domain.hubDomain;domain.asset=derivePrivateAssetIdentity('31337','0x'+token,code).slice(2);
 const asset=Object.freeze({metadata:{kind:'ERC20',address:'0x'+token,codeHash:code,symbol:'USDC',decimals:6,chainId:'31337',genesisHash:'0x'+h('lease-genesis')},async allowance(){return 20n;},async balance(){return 100n;}});
 const pool={address:'0x'+'12'.repeat(20),codeHash:'0x'+h('lease-pool'),asset:'0x'+token,assetCodeHash:code,assetCapability:asset,assetMetadata:asset.metadata,domain,domainCommitment:'0x'+'01'.repeat(32),artifact:{}};
 const system={pools:[pool],sender:'0x'+'56'.repeat(20),hub:{address:'0x'+'78'.repeat(20),codeHash:'0x'+h('lease-hub')},async verify(){return true;}};
 const runtime={metadata:{scratchDirectory:scratch,evmGenesis:'0x'+h('lease-genesis')},async dispatchOriginalDeviceExternalFlatNoteV1(request){
  const scope=api.consumeOriginalDeviceExternalFlatSendV1(request,runtime);assert.throws(()=>api.consumeOriginalDeviceExternalFlatSendV1(request,runtime));
  const wire={from:system.sender,to:pool.address,data:scope.transaction.data,value:'0',chainId:'31337',nonce:'0'};
  await scope.beforeKey(wire);scope.assertBeforeKey(wire);await scope.onSigned({nativeId:'0x'+h('lease-wire')},wire);await scope.beforeBroadcast(wire);scope.assertBeforeBroadcast(wire);economicAdmissions++;return{transactionHash:'0x'+h('lease-wire')};
 }};
 const view={head:{number:'1',hash:h('lease-head'),timestamp:'6000'},header:{number:'0x1'},ledger:{commitments:[],nullifiers:[],roots:[],publicState:{leaves:0,spent:0,liveReservations:0,outputCapacity:0}},poolObservation:{rawState:'0x00',rawHistory:'0x00',rawBacking:'0x00'}},observer={async readTransaction(){return null;}};
 api=await loadDeviceNoteAuthorityHost(t,{
  assertOwnedLocalEvmV2:r=>assert.equal(r,runtime),assertOwnedDeviceExternalFlatReceiverV1:r=>assert.equal(r,runtime),assertLocalEvm:async r=>assert.equal(r,runtime),assertOwnedFlatSystem:(r,s)=>{assert.equal(r,runtime);assert.equal(s,system);},assertOwnedPoolAsset:(r,a)=>{assert.equal(r,runtime);assert.equal(a,asset);},
  createFlatSystemStateReader:async()=>({async read(){return view;},async assertCurrent(v){assert.equal(v,view);}}),createFlatOwnerObserver:async()=>observer,assertOwnedFlatOwnerObserver:o=>assert.equal(o,observer),
  createProofProcess:()=>({async prove(mode,input,words){assert.equal(mode,'deposit_balance');proofStarted.resolve();await proofGate.promise;return{proof:Buffer.from('ab'.repeat(64),'hex'),publicInputs:words.map(String),metrics:{acceptedResult:true}};},async close(){}}),
  assertOriginalDeviceGraphSourceAvailableV2(value){assert.equal(value,account);availabilityChecks++;assert.ok(available,'DEVICE_GRAPH_SOURCE_UNAVAILABLE');},
  async beginOriginalDeviceGraphSourceActivityV2(value){assert.equal(value,account);begins++;return sourceToken;},
  async endOriginalDeviceGraphSourceActivityV2(token){assert.equal(token,sourceToken);checkpoints++;if(holdCheckpoint){clock+=16000;checkpointStarted.resolve();await checkpointGate.promise;}},
  consumeOriginalDeviceGraphSourceRequestV2(token,kind,value){assert.equal(token,requestToken);assert.equal(kind,'account-checkpoint');assert.equal(value,account);},
  assertOriginalDeviceExternalFlatGraphAccountBindingV1(b,a){assert.equal(b,bridge);assert.equal(a,account);},
  assertDeviceExternalFlatRecoveryAuthorityV1:a=>{assert.equal(a,recovery);return identity;},assertWrappedPrivateLifetimeAttemptV1:(r,i)=>{assert.equal(r,runtime);assert.equal(i,identity);},
  async retainWrappedPrivateLifetimePartV1(r,slot,i,state){assert.equal(r,runtime);assert.equal(slot,'device-external-flat-account-0');retained=structuredClone(state);return retainedHandle;},
  async updateWrappedPrivateLifetimePartV1(handle,state){assert.equal(handle,retainedHandle);retained=structuredClone(state);},async readWrappedPrivateLifetimePartV1(r){assert.equal(r,runtime);return{handle:retainedHandle,privateState:structuredClone(retained)};},assertWrappedPrivateLifetimePartSealedV1:handle=>assert.equal(handle,retainedHandle),
 });
 const date=mock.method(Date,'now',()=>clock),perf=mock.method(performance,'now',()=>clock);t.after(()=>{date.mock.restore();perf.mock.restore();});
 const key=new Uint8Array(32);key[31]=19;const sign=c=>signDeviceMessage(key,P.externalFlatPermissionMessageV1(c));
 try{
  account=await api.createOriginalDeviceExternalFlatNoteAuthorityV1({runtime,system,poolIndex:0,origin:'https://localhost:9443',devicePublicKey:devicePublicKey(key)});
  await api.retainOriginalDeviceExternalFlatGraphAccountV1(account,bridge,recovery);
  const note=createBalanceNote({scope:domain.scope,policy:domain.policy,value:'20'}),witness=walletDepositInput({scope:domain.scope,policy:domain.policy,epoch:'10',note}),bytes=P.externalFlatWitnessBytesV1('deposit_balance',witness);
  const draft={action:'PROVE_D26',jobId:null,rootId:h('lease-root'),noteRevision:1,recipient:'90'.repeat(20),statement:{scope:domain.scope,policy:domain.policy,epoch:'10',amount:'20',output:note.commitment.toString('hex')},path:null,witnessSHA256:h(bytes)};bytes.fill(0);
  const access=account.challenge(),review=await account.review({access,signature:sign(access),draft});const proving=account.operate({consent:review.consent,signature:sign(review.consent),witness});await proofStarted.promise;
  assert.equal(await api.checkpointOriginalDeviceExternalFlatGraphAccountSourceV2(account,requestToken),null);
  proofGate.resolve();const original=await proving;assert.equal(original.stage,'PROVED');assert.equal(economicAdmissions,0);assert.ok(await api.checkpointOriginalDeviceExternalFlatGraphAccountSourceV2(account,requestToken));
  begins=0;checkpoints=0;availabilityChecks=0;
  const a=account.challenge(),fields=original.consentFields,input={access:a,signature:sign(a),draft:{action:'FUND_D26',...Object.fromEntries(['jobId','rootId','noteRevision','recipient','statement','path','witnessSHA256'].map(k=>[k,fields[k]]))}};
  let response;const reviewed=account.review(input).then(value=>{response=value;return value;});const result=await reviewed;assert.ok(response);assert.equal(begins,0);assert.equal(checkpoints,0);assert.equal(clock,1000);assert.equal(result.consent.expiresAt,16000);assert.equal(result.consent.proofSHA256,fields.proofSHA256);assert.equal(availabilityChecks,2);
  await assert.rejects(account.review(input),/DEVICE_EXTERNAL_FLAT_PERMISSION/);
  holdCheckpoint=true;let settled=false;const operation=account.operate({consent:result.consent,signature:sign(result.consent),witness:null}).then(value=>{settled=true;return value;});await checkpointStarted.promise;
  assert.equal(begins,1);assert.equal(checkpoints,1);assert.equal(economicAdmissions,1);assert.equal(settled,false);assert.ok(clock>=result.consent.expiresAt);checkpointGate.resolve();assert.equal((await operation).stage,'FUNDING_UNKNOWN');assert.equal(economicAdmissions,1);
  available=false;const next=account.challenge();await assert.rejects(account.review({access:next,signature:sign(next),draft:input.draft}),/DEVICE_GRAPH_SOURCE_UNAVAILABLE/);assert.equal(begins,1);
 }finally{proofGate.resolve();checkpointGate.resolve();await account?.close();key.fill(0);}
});
