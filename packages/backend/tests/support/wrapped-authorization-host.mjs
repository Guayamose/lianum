/** Real wrapped combined/claim/typed-GRAPH factories over explicitly inert
 * ownership, EVM/current/native-read and in-memory CAS ports. Real registration,
 * inventory audits, clocks, codecs, ephemeral test signatures and quorum checks.
 * No native node, proof, compiler, wallet, network, funding or production keys. */
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test, { mock } from 'node:test';
import assert from 'node:assert/strict';
import { originalFixture, hash, quantity } from '../fixtures/chains/evm/transfers/evm-native-transfer-fixture.mjs';
import { bindOriginalEvmGraphTransfer, encodeEvmGraphTransferMemo } from '../../src/chains/evm/transfers/evm-graph-transfer-binding.mjs';
import { createHash, generateKeyPairSync, sign } from 'node:crypto';
import { createCustodyProfile, custodyProfileCommitment } from '../../src/claims/protocol/registry-envelope-v2.mjs';
import { profileCommitment } from '../../src/chains/shared/transfers/generic-native-value-v2.mjs';
import { nativeClaimEndpointCommitment, claimIntentId, claimTicketId, claimTicketSecret, claimDestinationCommitment } from '@lianum/engine/claims/framing';
import { receiptKeyCommitment, encodeSolanaBindingMessage, encodeBitcoinBinding, validateBitcoinBinding } from '@lianum/engine/native/native-receipt-binding';
import { encodeSolanaNonceBindingMessage } from '../../src/chains/solana/runtime/owned-solana-nonce-binding.mjs';
import { createClaimReservationBinding } from '../../src/claims/authorization/reservation-facts-gate.mjs';
import { CLAIM_ACTIONS, claimHash, claimFrame, claimRouteCommitment } from '@lianum/engine/claims/permits';
import { currentFixture, tree, h, copy, ZERO } from '../fixtures/operations/deployments/wrapped/wrapped-v4-host-fixtures.mjs';
import { checkpointAuthorizationDigest } from '../../src/operations/recovery/native-value-checkpoint-v4.mjs';
import { frozenInput as freeze } from '../../src/execution/account/preparation/readiness-inputs.mjs';
import { registryCommitment } from '../../src/chains/shared/transfers/generic-native-value-v2.mjs';
import { claimDomainCommitment } from '@lianum/engine/claims/framing';
import { ownedCustodyRoute, ownedCustodyFeeAudit, summarizeOwnedBitcoinCoins } from '../../src/chains/shared/runtime/owned-native-custody.mjs';
import { recoverSecp256k1Sender } from '../../src/chains/evm/contracts/transaction-wire-codec.mjs';
import * as originalBitcoin from '../../src/chains/bitcoin/runtime/owned-bitcoin-runtime.mjs';
import * as originalSolana from '../../src/chains/solana/runtime/owned-solana-runtime.mjs';
import * as noteEncoding from '@lianum/engine/notes/private-note-encoding';
import {wrappedSourceWorkDiagnosticV2} from '@lianum/components/verification/wrapped-installation';
/** Optional test diagnostics; never replace or skip a source inspection. */
export function wrappedHostDiagnostic(stage){if(process.env.LIANUM_WRAPPED_TEST_DIAGNOSTICS==='1')console.error(JSON.stringify({stage,...wrappedSourceWorkDiagnosticV2()}));}
const url = p => new URL(p,import.meta.url).href;
const observers = new WeakMap(), systems = new WeakMap(), views = new WeakMap();
export const natives = new WeakMap();
const custodyBootstraps=new WeakMap(),graphNativeEntries=new WeakMap(),observerByClaims=new WeakMap();
let activeGraphStores=null;
const moduleMocks=new Map();
export async function mockLower(location,options){const original=await import(location);moduleMocks.get(location)?.restore();const handle=mock.module(location,{exports:{...original,...options.exports}});moduleMocks.set(location,handle);return handle;}
const testRoot=await mkdtemp(join(tmpdir(),'wrapped-lifecycle-'));
test.after(()=>rm(testRoot,{recursive:true,force:true}));
await mockLower('@lianum/proofs/catalog',{exports:{ROOT:testRoot}});
const records = new Map(); export let keys = 0; let serial = 0, beforeSignature, sourceKey;
export function observeWrappedHostKeys({signature,freshKey}={}) {beforeSignature=signature;sourceKey=freshKey;}

await mockLower('@lianum/engine/notes/private-note-encoding', {exports:{...noteEncoding,
  freshKey(...args) {return sourceKey?sourceKey(...args):noteEncoding.freshKey(...args);},
  signature(...args) { beforeSignature?.(...args); keys++; return noteEncoding.signature(...args); }
}});
await mockLower(url('../../src/claims/wrapped/operations/wrapped-owned-state-v1.mjs'), {exports:{
  async createOwnedWrappedClaimObserverV1({runtime,claims}){const observer=observerByClaims.get(claims);assert.ok(observer);assert.equal(observers.get(observer).runtime,runtime);return observer;},
  assertOwnedWrappedClaimObserverV1(value) { assert.ok(observers.has(value),'TEST_ORIGINAL_WRAPPED_OBSERVER'); },
  ownedWrappedClaimObserverBindingsV1(value) { assert.ok(observers.has(value)); return observers.get(value); }
}});
for (const [family,name] of [['1','Bitcoin'],['2','Solana']]) await mockLower(url('../../src/chains/'+name.toLowerCase()+'/runtime/owned-'+name.toLowerCase()+'-runtime.mjs'), {exports:{
  ...(family==='1'?originalBitcoin:originalSolana),
  ...(family==='2'?{SOLANA_NONCE_INGRESS_PROFILE:'LIANUM_GENERIC_NATIVE_CLAIM_INGRESS_V3'}:{}),
  ['assertOwned'+name+'Runtime'](value) { assert.equal(natives.get(value)?.family,family,'TEST_ORIGINAL_NATIVE'); },
  ['assertOwned'+name+'RuntimeLive'](value) { const row=natives.get(value);assert.equal(row?.family,family);assert.equal(row.closed,false,'TEST_NATIVE_CLOSED'); },
  ['readOwned'+name+'RuntimeAuditState'](value) { const row=natives.get(value);assert.ok(row);assert.equal(row.closed,false,'TEST_NATIVE_CLOSED');return freeze(copy(row.snapshot())); }
}});
await mockLower('@lianum/engine/storage/records', {exports:{
 async createClaimRecordStore({path,identity},data) {
  if(identity?.profile==='WRAPPED_CLAIM_GRAPH_CHECKPOINT_INVENTORY_V1'){
   const {graphRecords,controls}=activeGraphStores,i=Number(identity.binding.signerIndex),row={record:{revision:'0',state:copy(data)}};graphRecords[i]=row;
   return {async read(){await controls.beforeGraphStore?.(i);return {revision:Number(row.record.revision),data:copy(row.record.state)};},
    async update(revision,fn){assert.equal(revision,Number(row.record.revision));row.record={revision:String(revision+1),state:copy(fn(copy(row.record.state)))};return {revision:revision+1,data:copy(row.record.state)};},close(){}};
  }
 assert.ok(!records.has(path));const state={revision:0,data:copy(data),closed:false,updates:[]};records.set(path,state);
  const read=async()=>{await state.beforeRead?.();assert.equal(state.closed,false);return {revision:state.revision,data:copy(state.data),commitment:h('revision'+state.revision)};};
  return {read,async update(revision,fn){assert.equal(revision,state.revision);state.data=copy(fn(copy(state.data)));state.revision++;state.updates.push(copy(state.data));await state.beforeUpdate?.();return read();},close(){state.closed=true;}};
 }
}});
await mockLower(url('../../src/operations/deployments/wrapped/wrapped-claim-system-v1.mjs'), {exports:{
 assertOwnedWrappedClaimGraphSystem(runtime,system){assert.equal(systems.get(system)?.runtime,runtime,'TEST_ORIGINAL_WRAPPED_GRAPH_SYSTEM');},
 wrappedClaimGraphOperatorResources(runtime,system,request){const owner=systems.get(system);assert.equal(owner?.runtime,runtime);return owner.resources(request);}
}});
await mockLower(url('../../src/execution/wrapped/reconciliation/wrapped-claim-system-state-v1.mjs'), {exports:{
 async createWrappedClaimGraphStateReaderV1({runtime,system,poolIndex}) {const f=systems.get(system);assert.equal(f?.runtime,runtime);
  return {async read(){await f.controls.beforeGraphView?.();const value=freeze(f.graphView(poolIndex));views.set(value,{runtime,system,poolIndex});return value;},
   async assertCurrent(value){assert.deepEqual(views.get(value),{runtime,system,poolIndex});await f.controls.beforeGraphCurrent?.();assert.deepEqual(value,f.graphView(poolIndex));}};
 },
 assertWrappedClaimGraphCurrentViewV1(value,expected){assert.deepEqual(views.get(value),expected);}
}});
// Lower runtime/gate ownership port only. The real combined, reverse claim,
// GRAPH operator, key codec, retained journal and all-signer lease code executes.
export const testGraphOperationsV4 = new WeakMap();
let physicalOperationReader;
export function readWrappedHostPhysicalOperations(reader){physicalOperationReader=reader;}
await mockLower(url('../../src/chains/shared/dispatch/wrapped-claim-graph-dispatch-gate-v1.mjs'), {exports:{
 readWrappedGraphDispatchOperationV4(token) {
  if(physicalOperationReader)return physicalOperationReader(token);
  const read=testGraphOperationsV4.get(token);assert.ok(read,'TEST_ORIGINAL_GRAPH_OPERATION_REQUIRED');return freeze(copy(read()));
 }
}});
await mockLower(url('../../src/operations/operators/wrapped/wrapped-claim-custody-bootstrap-v1.mjs'),{exports:{
 assertOwnedWrappedClaimBootstrap(runtime,bootstrap){assert.equal(custodyBootstraps.get(bootstrap)?.runtime,runtime,'TEST_LOWER_CUSTODY_BOOTSTRAP');},
 ownedWrappedClaimBootstrapBindings(bootstrap){const state=custodyBootstraps.get(bootstrap);assert.ok(state);return state;}
}});
await mockLower(url('../../src/chains/evm/runtime/owned-evm-v2-runtime.mjs'),{exports:{
 isOwnedLocalEvmNativeValueRuntime(native){return graphNativeEntries.get(native)?.family==='EVM';},
 assertOwnedLocalEvmNativeValueRuntimeLive(native){assert.ok(graphNativeEntries.has(native));assert.equal(graphNativeEntries.get(native).readNativeStateV4().closed,false);},
 readOwnedLocalEvmNativeValueAuditStateV4(native){return graphNativeEntries.get(native).readNativeStateV4();},
 async describeOwnedLocalEvmNativeValueSource(native,index){return graphNativeEntries.get(native).descriptors[index];},
 async createOwnedLocalEvmNativeValueHealthSource({nativeRuntime,...raw}){return graphNativeEntries.get(nativeRuntime).createSource(raw);}
}});
await mockLower(url('../../src/chains/tron/health/owned-tron-native-value-health-source-v4.mjs'),{exports:{
 describeOwnedLocalTronNativeValueSource(native,{sourceIndex}) {const entry=graphNativeEntries.get(native);assert.equal(entry?.family,'TRON');return {...entry.descriptors[Number(sourceIndex)],genesis:native.metadata.genesis,chainId:null};}
}});
// Load the complete read-queue owner after its lower native ports are fixed.
// Its private reader/lease maps are shared by every operator in this host.
const readsURL=url('../../src/operations/operators/claims/owned-native-operator-reads.mjs');
await mockLower(readsURL,{exports:await import(readsURL+'?wrapped-lifecycle-full-reads')});
// Every private map/key/constructor belongs to the complete original owner.
// Forward cyclic public APIs to isolated whole-module instances; never mint a
// construction request or execute selected source text in the fixture.
const owners = {
 bridge:'operations/operators/wrapped/wrapped-claim-combined-operators-v1.mjs',
 graph:'operations/operators/wrapped/wrapped-claim-graph-operators-v1.mjs',
 claim:'claims/wrapped/operations/wrapped-operators-v1.mjs',
 bootstrap:'operations/operators/wrapped/wrapped-claim-operator-bootstrap-v1.mjs',
};
const liveOwners = {};
for (const [name,path] of Object.entries(owners)) {
 const location=url('../../src/'+path), original=await import(location);
 await mockLower(location,{exports:Object.fromEntries(Object.entries(original).map(([key,value])=>[key,
  typeof value==='function'?(...args)=>liveOwners[name][key](...args):value]))});
}
for(const [name,path] of Object.entries(owners)) liveOwners[name]=await import(url('../../src/'+path)+'?wrapped-lifecycle-full-owner');
export const {graph:graphModule,claim:claimModule,bootstrap:bootstrapModule}=liveOwners;
export const nativeClaimModule=await import('../../src/claims/operations/operators.mjs');
const {createOwnedEvmNativeValueHealthSource}=await import('../../src/chains/evm/health/evm-native-value-health-source-v4.mjs?wrapped-lifecycle-source');

const NATIVE_PUBLIC_KEYS = Object.freeze({
  depositor: '0279be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798',
  escrow: '0379be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798',
  graph: '02f9308a019258c31049344f85f89d5229b531c845836f99b08601f113bce036f9',
});
const keyScript = key => '0014' + createHash('ripemd160').update(createHash('sha256').update(Buffer.from(key,'hex')).digest()).digest('hex');
function bitcoinIntent({ sourceScript, recipientScript, wireKeyCommitment, tag }) {
  return { sourceTxid: h(tag), sourceVout: '0', sourceScript, sourceSatoshi: '20000000',
    recipientScript, amountSatoshi: '12345', changeScript: sourceScript, feeSatoshi: '5000', wireKeyCommitment };
}
function witnessSyntax(intent, publicKey) {
  const unsigned = Buffer.from(encodeBitcoinBinding(intent), 'hex');
  // Canonical DER plus SIGHASH_ALL, deliberately fake r=s=1, not a signature.
  const witness = Buffer.concat([Buffer.from('020930060201010201010121', 'hex'), Buffer.from(publicKey, 'hex')]);
  const rawTransaction = Buffer.concat([unsigned.subarray(0, 4), Buffer.from('0001', 'hex'),
    unsigned.subarray(4, -4), witness, unsigned.subarray(-4)]).toString('hex');
  const parsed = validateBitcoinBinding(rawTransaction, intent);
  assert.equal(parsed.containsWitness, true);
  assert.equal(parsed.assurance, 'wire-and-witness-syntax-only-no-ecdsa-utxo-finality-or-authorization');
  return { txid: parsed.txid, rawTransaction };
}
function observedSyntax(rule, wire, intent) {
  return { status: 'observed', genesis: rule.genesis, asset: rule.asset, nativeWire: wire.rawTransaction, intent,
    blockId: h('synthetic-block'), blockHeight: '50', finalityKind: '1', confirmations: '6',
    nativeContext: { observedTipId: h('synthetic-tip'), observedTipHeight: '55', transactionSlot: '0', parentSlot: '0', observedSlot: '0' } };
}

export async function fixture(t, {family='2',nativeGraph=null,receiver=null,hubDomain=null,timestamp=null,deployment=null} = {}) {
 const selectedIndex=Number(family)-1;
 const id=++serial,c=currentFixture(),controls={inventoryReads:[0,0],graphViews:0,currentChecks:0,recovery:0,evmEpoch:0};
 if(hubDomain){c.registration.registry.quorum.hubDomain=hubDomain;for(const row of c.registration.claims)row.config.hubDomain=row.config.ledgerNamespace=hubDomain;
  for(const gateway of c.gateways)gateway.healthState.hubDomain=hubDomain;}
 if(timestamp)c.head.timestamp=timestamp;
 const claimSigner=generateKeyPairSync('ed25519'),payoutSigner=generateKeyPairSync('ed25519');
 const claimSource=Buffer.from(claimSigner.publicKey.export({format:'jwk'}).x,'base64url').toString('hex'),payoutSource=Buffer.from(payoutSigner.publicKey.export({format:'jwk'}).x,'base64url').toString('hex');
 c.inventories[1].roles.depositor.endpoint=claimSource;c.inventories[1].roles.escrow.endpoint=payoutSource;
 for(const row of c.inventories[1].inventory.accounts)Object.assign(row,c.inventories[1].roles[row.role],{exists:true,total:'1000000',spendable:'1000000',rentExemptMinimum:'1000'});
 Object.assign(c.inventories[1].inventory.escrow,c.inventories[1].roles.escrow);
 const solConfig=c.registration.claims[1].config;solConfig.refundMaxFee='5000';
 solConfig.escrowEndpointCommitment=nativeClaimEndpointCommitment({family:'2',genesis:solConfig.nativeGenesis,asset:solConfig.nativeAsset,endpoint:payoutSource});
 const custodyProfile=createCustodyProfile({config:solConfig,sourceSetRoot:c.registration.profiles[1].profile.sourceSetRoot});
 c.registration.claims[1].profileCommitment=custodyProfileCommitment(custodyProfile);c.registration.profiles[1].profile=custodyProfile;
 c.registration.claims[0].config.refundMaxFee='5000';
 c.inventories[0].roles.depositor.endpoint=keyScript(NATIVE_PUBLIC_KEYS.depositor);c.inventories[0].roles.escrow.endpoint=keyScript(NATIVE_PUBLIC_KEYS.escrow);
 const btcConfig=c.registration.claims[0].config;btcConfig.escrowEndpointCommitment=nativeClaimEndpointCommitment({family:'1',genesis:btcConfig.nativeGenesis,asset:btcConfig.nativeAsset,endpoint:c.inventories[0].roles.escrow.endpoint});
 const btcProfile=createCustodyProfile({config:btcConfig,sourceSetRoot:c.registration.profiles[0].profile.sourceSetRoot});c.registration.claims[0].profileCommitment=custodyProfileCommitment(btcProfile);c.registration.profiles[0].profile=btcProfile;
 const selectedConfig=c.registration.claims[selectedIndex].config;
 const registrationTree=tree(c.registration.profiles.map(row=>row.kind==='custody'?custodyProfileCommitment(row.profile):profileCommitment(row.profile)));
 c.registration.registry.quorum.rulesRoot=registrationTree.root;c.registration.profiles.forEach((row,i)=>row.profilePath=registrationTree.paths[i]);
 Object.assign(controls,{principal:'0',liability:'0',intents:[],tickets:[],activePayout:ZERO,reservations:new Map()});
 const advanceState=()=>{c.head.number=String(BigInt(c.head.number)+1n);c.head.hash=h('head'+c.head.number);};
 const claimObservations=new Map();
 let pairs,root;
 const head=c.head;
 const receiverReads={
  async block(){return {number:'0x'+BigInt(head.number).toString(16),hash:'0x'+head.hash,timestamp:'0x'+BigInt(head.timestamp).toString(16)};},
  async call({to,data},at){assert.equal(to,'0x0000000000000000000000000000000000000001');assert.equal(at,'0x'+BigInt(head.number).toString(16));controls.recovery++;await controls.beforeRecovery?.();
   const w=data.slice(2).match(/.{64}/g),sender=recoverSecp256k1Sender({digest:w[0],r:w[2],s:w[3],parity:Number(BigInt('0x'+w[1])-27n)});return '0x'+'00'.repeat(12)+sender.slice(2);}
 };
 const runtime=receiver??Object.freeze({get ingressSendState(){return {epoch:String(controls.evmEpoch),busy:controls.receiverBusy??false,uncertain:false};},...receiverReads});
 if(receiver)for(const [name,method] of Object.entries(receiverReads)){assert.equal(receiver[name],undefined);Object.defineProperty(receiver,name,{value:method});}
 const nativeRuntimes=c.inventories.map((entry,i)=>{
  const config=c.registration.claims[i].config,state={family:String(i+1),closed:false,generation:0,mutations:0,activeReads:0,transfers:[],graphTransfers:[],activePrepared:null,activeRoute:null};
  const read=async work=>{state.generation++;state.activeReads++;try{return await work();}finally{state.activeReads--;}};
  const native=Object.freeze({metadata:{runtimePins:{family:String(i+1),fixture:'wrapped-lifecycle'}},roles:entry.roles,syntheticPrefunding:entry.syntheticPrefunding,close(){state.closed=true;},get transfers(){return copy(state.transfers);},
   adapter({asset,route}){assert.equal(asset,config.nativeAsset);const spec=ownedCustodyRoute(route);return {binding:{sourceEndpoint:entry.roles[spec.sourceRole].endpoint,destinationEndpoint:entry.roles[spec.destinationRole].endpoint},
    assertPrepared:prepared=>read(async()=>{assert.equal(route,state.activeRoute);assert.deepEqual(prepared,state.activePrepared);await controls.beforePrepared?.(i);})};},
   factReader(){return {observe:request=>read(async()=>{assert.ok(claimObservations.has(request.nativeId),'TEST_NO_RETAINED_FACT');if(controls.claimAdverse)return {status:'adverse',reason:'TEST_NATIVE_ADVERSE'};return copy(claimObservations.get(request.nativeId));})};},
   inventory:()=>read(async()=>{controls.inventoryReads[i]++;await controls.beforeInventory?.(i);const value=copy(entry.inventory);delete value.nonceInfrastructureByAuthority;if(i===1&&selectedIndex===1){const fees=state.transfers.filter(row=>row.route!=='deposit').reduce((n,row)=>n+BigInt(row.actualFee??0),0n);value.escrow.total=value.escrow.spendable=String(1000000n+BigInt(controls.principal)-fees);Object.assign(value.accounts[1],value.escrow);value.feeAudit=ownedCustodyFeeAudit(state.transfers.map(row=>({nativeId:row.nativeId,route:row.route,phase:row.phase,amount:row.intent.lamports,preparedFee:'5000',actualFee:row.actualFee,broadcastAttempts:row.broadcastAttempts})));}if(i===0){const roles=entry.roles;const utxo={txid:h('escrow-outpoint'),vout:'0',script:roles.escrow.endpoint,amount:String(1000000n+BigInt(selectedIndex===0?controls.principal:'0')),confirmations:'6',spendable:true,solvable:true,safe:true,locked:true,coinbase:false};value.accounts=Object.entries(roles).map(([role,account])=>{const utxos=role==='escrow'?[utxo]:[];return {role,...account,...summarizeOwnedBitcoinCoins(utxos),utxos};});value.escrow=copy(value.accounts[1]);value.nativeHead.height='55';value.feeAudit=ownedCustodyFeeAudit(state.transfers.map(row=>({nativeId:row.txid,route:row.route,phase:row.phase,amount:row.intent.amountSatoshi,preparedFee:row.intent.feeSatoshi,actualFee:row.actualFee,broadcastAttempts:row.broadcastAttempts})));value.unconfirmedOutputsIncluded=false;}return value;})
  });
  state.snapshot=()=>({profile:'OWNED_NATIVE_RUNTIME_AUDIT_STATE_V1',family:state.family,lifetimeId:h('lifetime'+id+':'+i),facade:'custody',genesis:config.nativeGenesis,
   readGeneration:String(state.generation),mutationGeneration:String(state.mutations),activeReads:state.activeReads,activeMutations:0,readsIdle:state.activeReads===0,
   operationBusy:false,observationBusy:state.activeReads!==0,inventoryBusy:false,signingUnresolved:false,persistenceFailed:false,isolationFailed:false,adverseHistory:false,
   activeRoute:state.activeRoute,activePrepared:state.activePrepared,transfers:state.transfers,custodyTransfers:state.transfers,graphTransfers:state.graphTransfers});
  natives.set(native,state);return native;
 });
 const claimView=()=>{const gateways=copy(c.gateways);Object.assign(gateways[selectedIndex],{
 intentCount:String(controls.intents.length),ticketCount:String(controls.tickets.length),reservedRefundTickets:String(controls.intents.filter(row=>row.state==='1').length),nextTicketNonce:String(controls.tickets.length),
 wrapperSupply:controls.liability,pendingRedemptions:controls.tickets.filter(row=>row.state!=='4'&&row.ticket.kind==='1').reduce((n,row)=>n+BigInt(row.ticket.amount),0n).toString(),
 pendingRefunds:controls.tickets.filter(row=>row.state!=='4'&&row.ticket.kind==='2').reduce((n,row)=>n+BigInt(row.ticket.amount),0n).toString(),
 heldUnissued:controls.intents.filter(row=>row.state==='1').reduce((n,row)=>n+BigInt(row.amount),0n).toString(),reservedFees:String(BigInt(selectedConfig.refundMaxFee)*BigInt(controls.intents.filter(row=>row.state==='1').length+controls.tickets.filter(row=>row.state!=='4').length)),
 activePayout:controls.activePayout,intents:copy(controls.intents),tickets:copy(controls.tickets)});return freeze({head:copy(head),hubStateSequence:c.hubStateSequence,gateways});},issued=new WeakSet();
 const observer=Object.freeze({async read(){await controls.beforeClaimRead?.();const value=claimView();issued.add(value);return value;},
  async assertCurrent(value){assert.ok(issued.has(value));controls.currentChecks++;await controls.beforeClaimCurrent?.();assert.deepEqual(value,claimView());},
  async readReservation(request){return copy(controls.reservations.get(request.admissionN)??null);},async assertUnrevoked(){assert.notEqual(controls.revoked,true);}
 });
 const graphView=poolIndex=>{const value=({poolIndex,poolAddress:'0x'+c.registration.claims[poolIndex].config.pool,head:copy(head),
  header:{number:'0x'+BigInt(head.number).toString(16),hash:'0x'+head.hash,timestamp:'0x'+BigInt(head.timestamp).toString(16)},
  snapshot:{poolStateSequence:'0',hubStateSequence:c.hubStateSequence},checkpointCount:'0',healthState:{...copy(c.gateways[poolIndex].healthState),timestamp:head.timestamp}});return deployment?.view?deployment.view(value):value;};
 const graphRecords=[];
 const graphNative={profile:'OWNED_WRAPPED_GRAPH_NATIVE_AUDIT_STATE_V4',family:'EVM',lifetimeId:h('graph-lifetime'+id),genesis:c.registration.profiles[2].profile.genesis,
  readGeneration:'0',activeReads:0,readsIdle:true,mutationGeneration:'0',activeMutations:0,busy:false,closed:false,uncertain:false,pending:false,adverseHistory:false,
  transactions:[],receipts:[],lifecycle:[],lastTimestamp:'0'};
 const graphFixtures=[0,1,2,3].map(()=>{
  const wireKeyCommitment=h('typed-graph-wire-key'),f=originalFixture('ethereum',2,{data:encodeEvmGraphTransferMemo(wireKeyCommitment)});
  const original={nativeWire:f.original.nativeWire,expected:{...f.original.expected,chainId:f.expected.chainId,genesisHash:f.genesisHash,type:'2',gas:f.expected.gas,fees:{maxPriorityFeePerGas:f.expected.maxPriorityFeePerGas,maxFeePerGas:f.expected.maxFeePerGas},wireKeyCommitment}};
  const binding=bindOriginalEvmGraphTransfer(original,{chain:'ethereum',genesisHash:f.genesisHash});
  for(let height=11;height<20;height++)f.state.headers.set(quantity(height),{number:quantity(height),hash:hash(1000+height),parentHash:hash(999+height),timestamp:quantity(900+height),transactions:[]});
  f.state.included.timestamp=quantity(910);f.state.finalized.timestamp=quantity(920);f.state.receipt.gasUsed='0x6000';f.state.receipt.cumulativeGasUsed='0xc000';
  f.state.override=async(method,params)=>{await controls.beforeGraphNativeRead?.();if(controls.graphUnknown)throw Error('TEST_GRAPH_SOURCE_UNAVAILABLE');
   if(method==='debug_traceTransaction')return params[1].tracer==='callTracer'?{type:'CALL',from:binding.signed.from,to:binding.signed.to,value:quantity(binding.signed.value),input:binding.signed.data,gas:quantity(binding.signed.gas),gasUsed:'0x6000',output:'0x'}:{[binding.signed.to]:{balance:'0x0',nonce:1,code:'0x'}};
   return undefined;
  };
  return {...f,original,binding};
 });
 const graphEntry={nativeRuntime:nativeGraph?.runtime??Object.freeze({}),family:nativeGraph?.family??'EVM',profile:c.registration.profiles[2].profile,readNativeStateV4:()=>{const state=nativeGraph?nativeGraph.read():graphNative;(controls.graphSnapshotSamples??=[]).push(copy(state));return freeze(copy(state));},
   async createSource(raw){const f=graphFixtures[Number(raw.source.index)];
    const transport=async(...args)=>{graphNative.activeReads++;graphNative.readsIdle=false;graphNative.readGeneration=String(BigInt(graphNative.readGeneration)+1n);
     (controls.graphNativeReadEvents??=[]).push({signerIndex:Number(raw.source.index),phase:'start',generation:graphNative.readGeneration});
     try{return await f.transport(...args);}finally{graphNative.activeReads--;graphNative.readsIdle=graphNative.activeReads===0;graphNative.readGeneration=String(BigInt(graphNative.readGeneration)+1n);
      controls.graphNativeReadEvents.push({signerIndex:Number(raw.source.index),phase:'end',generation:graphNative.readGeneration});}};
    (controls.graphNativeTransports??=[])[Number(raw.source.index)]=transport;
    return createOwnedEvmNativeValueHealthSource({...raw,source:{...raw.source,transport}});
   }
  };
 const custodyBootstrap=Object.freeze({});
 custodyBootstraps.set(custodyBootstrap,{runtime,nativeRuntimes,nativeRoles:c.inventories.map(row=>row.roles),
  rules:c.registration.claims.map(row=>row.rule),inventoryDomains:c.registration.claims.map(row=>row.config.custodyInventoryDomain)});
 graphNativeEntries.set(graphEntry.nativeRuntime,{...graphEntry,descriptors:c.registration.profiles[2].sources.map((row,i)=>({
  publicNetwork:false,genesis:nativeGraph?.genesis??c.registration.profiles[2].profile.genesis,chainId:nativeGraph?.chainId??c.registration.profiles[2].profile.chainId,identity:Object.fromEntries(Object.entries(row.identity).filter(([name])=>name!=='operatorIdentity'))}))});
 const bootstrap=await bootstrapModule.createWrappedClaimOperatorBootstrapV1({runtime,custodyBootstrap,nativeRuntimes:[graphEntry.nativeRuntime]});
 wrappedHostDiagnostic('bootstrap-created');
 const metadata=bootstrapModule.assertWrappedClaimOperatorBootstrapV1(bootstrap);
 c.registration.profiles=copy(metadata.adapterProfiles);c.registration.registry.quorum.keys=copy(metadata.attesterKeys);
 c.registration.registry.quorum.rulesRoot=metadata.rulesRoot.slice(2);
 c.registration.claims.forEach((row,i)=>{row.profileCommitment=custodyProfileCommitment(c.registration.profiles[i].profile);});
 root=registryCommitment(c.registration.registry);
 c.registration.claims.forEach(({config},i)=>{config.registryCommitment=root;c.gateways[i].claimDomain=claimDomainCommitment(config);c.inventories[i].claimDomain=c.gateways[i].claimDomain;c.gateways[i].healthState.registryCommitment=root;});
 if(!nativeGraph)bootstrap.retainOriginal({profileCommitment:profileCommitment(c.registration.profiles[2].profile),original:graphFixtures[0].original});
 const systemExtras=await deployment?.prepare?.({registration:c.registration,runtime,bootstrap});
 activeGraphStores={graphRecords,controls};
 let resources;
 try{resources=await bootstrapModule.provisionWrappedClaimOperatorsV1(bootstrap,{runtime,registry:c.registration.registry,adapterProfiles:c.registration.profiles});}
 finally{activeGraphStores=null;}
 wrappedHostDiagnostic('operators-provisioned');
 let originalGraphQuorum;
 const system=({...systemExtras,get quorum(){return originalGraphQuorum;},profile:'LIANUM_OWNED_WRAPPED_CUSTODY_NATIVE_GRAPH_V1',claimsEnabled:true,registry:c.registration.registry,
  adapterProfiles:c.registration.profiles,custodyRegistration:c.registration,hubDomain:'0x'+c.registration.registry.quorum.hubDomain,registryCommitment:'0x'+root,
  hub:{address:'0x'+h('test-hub').slice(0,40),async call(method,args,at){if(deployment&&method==='admissionNullifiers(bytes32)'){assert.equal(at,'0x'+BigInt(head.number).toString(16));return '0x'+'00'.repeat(32);}
   assert.equal(method,'checkpointAuthorizationDigest(address,uint64,uint64,bytes32,uint64)');assert.equal(at,'0x'+BigInt(head.number).toString(16));
   const [pool,expectedPoolSequence,expectedHubStateSequence,requestId,validUntil]=args;
   return checkpointAuthorizationDigest({hubDomain:'0x'+c.registration.registry.quorum.hubDomain,registryCommitment:'0x'+root,pool,expectedPoolSequence,expectedHubStateSequence,requestId,validUntil});}}});
 const claims={flatSystem:system,nativeRuntimes};system.claims=claims;Object.freeze(system);
 systems.set(system,{runtime,controls,graphView,resources(request){const identity=graphModule.consumeWrappedClaimGraphOperatorBootstrapRequestV1(request,{runtime,system});
  assert.deepEqual(identity.publicKey,metadata.attesterKeys[identity.signerIndex]);return resources[identity.signerIndex];
 }});
 const configs=c.registration.claims.map(row=>row.config),policies=c.registration.claims.map(({config,rule})=>({ledgerNamespace:config.ledgerNamespace,hubDomain:config.hubDomain,registryCommitment:root,rule}));
 observers.set(observer,{runtime,system:Object.assign(claims,{custodyRegistration:c.registration}),registry:c.registration.registry,configs,policies,nativeRuntimes,journalRoot:'/wrapped-v4-host-'+id});
 t.after(()=>{beforeSignature=undefined;for(const pair of pairs??[]){pair.claim.close();}for(const path of records.keys())if(path.startsWith('/wrapped-v4-host-'+id+'/'))records.delete(path);});
 observerByClaims.set(claims,observer);
 const finished=await bootstrapModule.finishWrappedClaimOperatorsV1(bootstrap,{runtime,system,claims});
 wrappedHostDiagnostic('operators-bound');
 originalGraphQuorum=finished.quorum;
 pairs=finished.operators.map((graph,i)=>({graph,claim:finished.claimOperators[i]}));
 const quorum=claimModule.createClaimOperatorQuorum({operators:pairs.slice(0,3).map(p=>p.claim)});
 const config=configs[selectedIndex],rule=c.registration.claims[selectedIndex].rule,domain=claimDomainCommitment(config),roles=c.inventories[selectedIndex].roles,sha=h,frozen=freeze;
 const claimTransfers=natives.get(nativeRuntimes[selectedIndex]).transfers;
 const coin=()=>({txid:h('escrow-outpoint'),vout:'0',script:roles.escrow.endpoint,amount:String(1000000n+BigInt(controls.principal))});
 for(const [name,field]of [['originalPrepared','activePrepared'],['preparedRoute','activeRoute']])Object.defineProperty(controls,name,{get:()=>natives.get(nativeRuntimes[selectedIndex])[field],set:v=>{natives.get(nativeRuntimes[selectedIndex])[field]=v;}});
 return {c,controls,pairs,quorum,graphQuorum:finished.quorum,bootstrap,runtime,system,observer,nativeRuntimes,graphRecords,graphFixtures,graphNative,head,
  async addGraphFact(){const request={poolIndex:0,profileCommitment:profileCommitment(c.registration.profiles.find(row=>row.kind==='native-value').profile),nativeId:graphFixtures[0].binding.identity.nativeId};for(const pair of pairs.slice(0,3))await pair.graph.certify(request);return request;},
    async addClaimFact({ staged = false } = {}) {
      assert.equal(family, '2');
      const seq = controls.intents.length, receiptSecret = sha('claim-secret-' + seq), wireSalt = sha('claim-salt-' + seq), amount = '12345', output = sha('claim-Q-' + seq);
      const operationId = claimIntentId({ claimDomain: domain, outputQ: output, amount });
      const wireKeyCommitment = receiptKeyCommitment({ ledgerNamespace: config.ledgerNamespace, secret: receiptSecret });
      const intent = { sourcePublicKey: claimSource, recipientPublicKey: roles.escrow.endpoint,
        recentBlockhash: sha('claim-blockhash'), lamports: amount, wireKeyCommitment };
      const message = Buffer.from(encodeSolanaBindingMessage(intent), 'hex'), signature = sign(null, message, claimSigner.privateKey);
      const nativeId = signature.toString('hex'), nativeWire = Buffer.concat([Buffer.from([1]), signature, message]).toString('base64');
      const request = { family, recipientIndex: '0', nativeId, wireKeyCommitment };
      const binding = createClaimReservationBinding({ claimDomain: domain, gateway: config.gateway,
        ledgerNamespace: config.ledgerNamespace, genesis: config.nativeGenesis, asset: config.nativeAsset,
        operationId, revision: '1', ingress: true, receiptSecret, wireSalt, nativeWire, intent, request });
      controls.intents.push({ id: operationId, state: '1', output, amount, validFrom: '990', validUntil: '1030', revision: '1',
        proofHash: sha('claim-proof'), nullifier: staged ? ZERO : binding.admissionN, refundDestination: staged ? ZERO : sha('claim-refund') });
      controls.principal = String(BigInt(controls.principal) + (staged ? 0n : BigInt(amount)));
      claimTransfers.push({ nativeId, nativeWire, intent, route: 'deposit', recipientIndex: 0,
        phase: staged ? 'SIGNED_NOT_BROADCAST' : 'OBSERVED_FINALIZED', broadcastAttempts: staged ? 0 : 1, actualFee: staged ? null : '5000' });
      claimObservations.set(nativeId, { status: 'observed', genesis: rule.genesis, asset: rule.asset, nativeWire, intent,
        blockId: sha('claim-block'), blockHeight: '50', finalityKind: '2', confirmations: '0',
        nativeContext: { observedTipId: ZERO, observedTipHeight: '0', transactionSlot: '60', parentSlot: '59', observedSlot: '64' } });
      if (!staged) controls.reservations.set(binding.admissionN, { gateway: config.gateway, operationId, revision: '1',
        wireBindingCommitment: binding.wireBindingCommitment, ingress: true, consumed: false });
      advanceState();
      for (const pair of pairs.slice(0, 3)) await pair.claim.retainSignedEffect({ claimDomain: domain, operationId, receiptSecret, wireSalt, nativeId });
      return request;
    },
    preparePayout(kind = '1') {
      const old = controls.intents[0]; assert.ok(old); old.state = kind === '1' ? '2' : '3';
      const ticketId = claimTicketId({ claimDomain: domain, kind, nonce: '0' });
      const secret = claimTicketSecret({ claimDomain: domain, ticketId });
      const routeName = kind === '2' ? 'refund' : 'redeem';
      const route = { endpoint: roles[kind === '2' ? 'depositor' : 'recipient'].endpoint, salt: sha('payout-route'),
        quotedFee: '5000', selectedInputValue: '0', changeFloor: '0', destinationFunded: true };
      const nativeChainDomain = claimHash(claimFrame('LIANUM/evidence-chain/1', [Buffer.from('SOL'), Buffer.from(rule.genesis, 'hex'), Buffer.from(rule.asset, 'hex')]));
      const ticket = { kind, id: ticketId, claimDomain: domain, amount: old.amount, maxFee: '5000',
        destinationCommitment: claimDestinationCommitment({ claimDomain: domain, nativeChainDomain,
          endpoint: nativeClaimEndpointCommitment({ family, genesis: rule.genesis, asset: rule.asset, endpoint: route.endpoint }),
          amount: old.amount, maxFee: '5000', salt: route.salt }),
        referenceIngressN: kind === '2' ? old.nullifier : ZERO, referenceQ: kind === '2' ? old.output : ZERO };
      const row = { ticket, state: '1', payoutRouteCommitment: ZERO }; controls.tickets.push(row); advanceState();
      const intent = { sourcePublicKey: payoutSource, recipientPublicKey: route.endpoint, nonceAccountPublicKey: sha('escrow-nonce-account'),
        durableNonce: sha('escrow-nonce-value'), lamports: ticket.amount,
        wireKeyCommitment: receiptKeyCommitment({ ledgerNamespace: config.ledgerNamespace, secret }) };
      const prepared = frozen({ genesis: rule.genesis, intent, unsignedWire: encodeSolanaNonceBindingMessage(intent), funds: { feeLamports: '5000' } });
      controls.originalPrepared = prepared; controls.preparedRoute = routeName;
      const request = { claimDomain: domain, ticketId, prepared, route, wireSalt: sha('payout-wire-salt') };
      const terms = action => ({ action, operationId: ticketId, revision: '1', amount: ticket.amount,
        destinationCommitment: ticket.destinationCommitment, maxFee: '5000', routeCommitment: claimRouteCommitment(route),
        nullifier: ZERO, wireBindingCommitment: ZERO, claimSequence: '0', hubSequence: c.hubStateSequence });
      let binding, nativeId;
      return { request, prepared, ticket, routeName,
        begin: { claimDomain: domain, terms: terms(CLAIM_ACTIONS.BEGIN_PAYOUT), route, ownerAuthorization: null, prepared },
        beginIncluded() { row.state = '2'; row.payoutRouteCommitment = claimRouteCommitment(route); controls.activePayout = ticketId; advanceState(); },
        async retain() {
          const message = Buffer.from(prepared.unsignedWire, 'hex'), signature = sign(null, message, payoutSigner.privateKey);
          nativeId = signature.toString('hex'); const nativeWire = Buffer.concat([Buffer.from([1]), signature, message]).toString('base64');
          const spec = ownedCustodyRoute(routeName);
          claimTransfers.push({ nativeId, nativeWire, intent: copy(intent), route: routeName, recipientIndex: spec.recipientIndex,
            phase: 'SIGNED_NOT_BROADCAST', broadcastAttempts: 0, actualFee: null });
          binding = createClaimReservationBinding({ claimDomain: domain, gateway: config.gateway, ledgerNamespace: config.ledgerNamespace,
            genesis: rule.genesis, asset: rule.asset, operationId: ticketId, revision: '1', ingress: false, receiptSecret: secret,
            wireSalt: request.wireSalt, nativeWire, intent,
            request: { family, recipientIndex: String(spec.recipientIndex), nativeId, wireKeyCommitment: intent.wireKeyCommitment } });
          const results = [];
          for (const pair of pairs) results.push(await pair.claim.retainSignedEffect({ claimDomain: domain, operationId: ticketId,
            receiptSecret: secret, wireSalt: request.wireSalt, nativeId }));
          results.forEach(value => assert.deepEqual(value, results[0]));
          return { claimDomain: domain, terms: { ...terms(CLAIM_ACTIONS.RESERVE_PAYOUT), nullifier: binding.admissionN,
            wireBindingCommitment: binding.wireBindingCommitment }, route, ownerAuthorization: null };
        },
        reserved() { controls.reservations.set(binding.admissionN, { gateway: config.gateway, operationId: ticketId, revision: '1',
          wireBindingCommitment: binding.wireBindingCommitment, ingress: false, consumed: false }); advanceState(); return { ...request, nativeId }; },
        observed() {
          const transfer = claimTransfers.find(row => row.nativeId === nativeId); transfer.phase = 'OBSERVED_FINALIZED';
          transfer.broadcastAttempts = 1; transfer.actualFee = '5000'; controls.principal = String(BigInt(controls.principal) - BigInt(ticket.amount));
          claimObservations.set(nativeId, { status: 'observed', genesis: rule.genesis, asset: rule.asset, nativeWire: transfer.nativeWire, intent: copy(intent),
            blockId: sha('payout-block'), blockHeight: '50', finalityKind: '2', confirmations: '0',
            nativeContext: { observedTipId: ZERO, observedTipHeight: '0', transactionSlot: '61', parentSlot: '60', observedSlot: '64' } });
          row.state = '3'; advanceState(); return binding.request;
        },
        discharge() { row.state = '4'; controls.activePayout = ZERO; advanceState(); },
      };
    },

    async addBitcoinClaimFact() {
      const seq = controls.intents.length, receiptSecret = sha('claim-secret-' + seq), wireSalt = sha('claim-salt-' + seq), amount = '12345', output = sha('claim-Q-' + seq);
      const operationId = claimIntentId({ claimDomain: domain, outputQ: output, amount });
      const wireKeyCommitment = receiptKeyCommitment({ ledgerNamespace: config.ledgerNamespace, secret: receiptSecret });
      const intent = bitcoinIntent({ sourceScript: roles.depositor.endpoint, recipientScript: roles.escrow.endpoint,
        wireKeyCommitment, tag: 'deposit-' + seq });
      const wire = witnessSyntax(intent, NATIVE_PUBLIC_KEYS.depositor), nativeId = wire.txid;
      const request = { family, recipientIndex: '0', nativeId, wireKeyCommitment };
      const binding = createClaimReservationBinding({ claimDomain: domain, gateway: config.gateway,
        ledgerNamespace: config.ledgerNamespace, genesis: config.nativeGenesis, asset: config.nativeAsset,
        operationId, revision: '1', ingress: true, receiptSecret, wireSalt, nativeWire: wire.rawTransaction, intent, request });
      controls.intents.push({ id: operationId, state: '1', output, amount, validFrom: '990', validUntil: '1030', revision: '1',
        proofHash: sha('synthetic-proof-label-only'), nullifier: binding.admissionN, refundDestination: sha('claim-refund') });
      controls.principal = String(BigInt(controls.principal) + BigInt(amount));
      claimTransfers.push({ txid: nativeId, rawTransaction: wire.rawTransaction, intent, route: 'deposit', recipientIndex: 0,
        phase: 'OBSERVED_CONFIRMED', broadcastAttempts: 1, actualFee: '5000' });
      claimObservations.set(nativeId, observedSyntax(rule, wire, intent));
      controls.reservations.set(binding.admissionN, { gateway: config.gateway, operationId, revision: '1',
        wireBindingCommitment: binding.wireBindingCommitment, ingress: true, consumed: false });
      advanceState();
      for (const pair of pairs) await pair.claim.retainSignedEffect({ claimDomain: domain, operationId, receiptSecret, wireSalt, nativeId });
      return request;
    },
    prepareBitcoinPayout(kind = '1') {
      const old = controls.intents[0]; assert.ok(old); old.state = kind === '1' ? '2' : '3';
      const ticketId = claimTicketId({ claimDomain: domain, kind, nonce: '0' });
      const secret = claimTicketSecret({ claimDomain: domain, ticketId });
      const routeName = kind === '2' ? 'refund' : 'redeem';
      const route = { endpoint: roles[kind === '2' ? 'depositor' : 'recipient'].endpoint, salt: sha('payout-route'),
        quotedFee: '5000', selectedInputValue: coin().amount, changeFloor: '546', destinationFunded: false };
      const nativeChainDomain = claimHash(claimFrame('LIANUM/evidence-chain/1', [Buffer.from('BTC'), Buffer.from(rule.genesis, 'hex'), Buffer.from(rule.asset, 'hex')]));
      const ticket = { kind, id: ticketId, claimDomain: domain, amount: old.amount, maxFee: '5000',
        destinationCommitment: claimDestinationCommitment({ claimDomain: domain, nativeChainDomain,
          endpoint: nativeClaimEndpointCommitment({ family, genesis: rule.genesis, asset: rule.asset, endpoint: route.endpoint }),
          amount: old.amount, maxFee: '5000', salt: route.salt }),
        referenceIngressN: kind === '2' ? old.nullifier : ZERO, referenceQ: kind === '2' ? old.output : ZERO };
      const row = { ticket, state: '1', payoutRouteCommitment: ZERO }; controls.tickets.push(row); advanceState();
      const intent = { sourceTxid: coin().txid, sourceVout: coin().vout, sourceScript: roles.escrow.endpoint,
        sourceSatoshi: coin().amount, recipientScript: route.endpoint, amountSatoshi: ticket.amount,
        changeScript: roles.escrow.endpoint, feeSatoshi: '5000',
        wireKeyCommitment: receiptKeyCommitment({ ledgerNamespace: config.ledgerNamespace, secret }) };
      const prepared = frozen({ genesis: rule.genesis, intent, unsignedWire: encodeBitcoinBinding(intent), funds: { feeSatoshi: '5000' } });
      controls.originalPrepared = prepared; controls.preparedRoute = routeName;
      const request = { claimDomain: domain, ticketId, prepared, route, wireSalt: sha('payout-wire-salt') };
      const terms = action => ({ action, operationId: ticketId, revision: '1', amount: ticket.amount,
        destinationCommitment: ticket.destinationCommitment, maxFee: '5000', routeCommitment: claimRouteCommitment(route),
        nullifier: ZERO, wireBindingCommitment: ZERO, claimSequence: '0', hubSequence: c.hubStateSequence });
      let binding, nativeId;
      return { request, prepared, ticket, routeName,
        begin: { claimDomain: domain, terms: terms(CLAIM_ACTIONS.BEGIN_PAYOUT), route, ownerAuthorization: null, prepared },
        beginIncluded() { row.state = '2'; row.payoutRouteCommitment = claimRouteCommitment(route); controls.activePayout = ticketId; advanceState(); },
        async retain() {
          const wire = witnessSyntax(intent, NATIVE_PUBLIC_KEYS.escrow); nativeId = wire.txid;
          const nativeWire = wire.rawTransaction, spec = ownedCustodyRoute(routeName);
          claimTransfers.push({ txid: nativeId, rawTransaction: nativeWire, intent: copy(intent), route: routeName,
            recipientIndex: spec.recipientIndex, phase: 'SIGNED_NOT_BROADCAST', broadcastAttempts: 0, actualFee: null });
          binding = createClaimReservationBinding({ claimDomain: domain, gateway: config.gateway, ledgerNamespace: config.ledgerNamespace,
            genesis: rule.genesis, asset: rule.asset, operationId: ticketId, revision: '1', ingress: false, receiptSecret: secret,
            wireSalt: request.wireSalt, nativeWire, intent,
            request: { family, recipientIndex: String(spec.recipientIndex), nativeId, wireKeyCommitment: intent.wireKeyCommitment } });
          const results = [];
          for (const pair of pairs) results.push(await pair.claim.retainSignedEffect({ claimDomain: domain, operationId: ticketId,
            receiptSecret: secret, wireSalt: request.wireSalt, nativeId }));
          results.forEach(value => assert.deepEqual(value, results[0]));
          return { claimDomain: domain, terms: { ...terms(CLAIM_ACTIONS.RESERVE_PAYOUT), nullifier: binding.admissionN,
            wireBindingCommitment: binding.wireBindingCommitment }, route, ownerAuthorization: null };
        },
        observed() {
          const original = claimTransfers.at(-1), wire = witnessSyntax(intent, NATIVE_PUBLIC_KEYS.escrow);
          assert.equal(original.txid, nativeId);
          Object.assign(original, { phase: 'OBSERVED_CONFIRMED', broadcastAttempts: 1, actualFee: '5000' });
          controls.principal = String(BigInt(controls.principal) - BigInt(ticket.amount));
          claimObservations.set(nativeId, observedSyntax(rule, wire, intent));
          return copy(binding.request);
        },
        reserved() { controls.reservations.set(binding.admissionN, { gateway: config.gateway, operationId: ticketId, revision: '1',
          wireBindingCommitment: binding.wireBindingCommitment, ingress: false, consumed: false }); advanceState(); return { ...request, nativeId }; },
      };
    },

  request:{claimDomain:claimDomainCommitment(configs[0]),mode:'debt'},
  store:i=>records.get('/wrapped-v4-host-'+id+'/claim-operator-'+i+'.wrapped-v1')};
}
