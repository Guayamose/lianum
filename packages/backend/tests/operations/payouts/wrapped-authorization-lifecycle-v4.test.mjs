/** Real wrapped combined/claim/typed-GRAPH factories over explicitly inert
 * ownership, EVM/current/native-read and in-memory CAS ports. Real registration,
 * inventory audits, clocks, codecs, ephemeral test signatures and quorum checks.
 * No native node, proof, compiler, wallet, network, funding or production keys. */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test, { mock } from 'node:test';
import assert from 'node:assert/strict';
import { originalFixture, hash, quantity } from '../../fixtures/chains/evm/transfers/evm-native-transfer-fixture.mjs';
import { bindOriginalEvmGraphTransfer, encodeEvmGraphTransferMemo } from '../../../src/chains/evm/transfers/evm-graph-transfer-binding.mjs';
import { randomBytes, createHash, generateKeyPairSync, sign } from 'node:crypto';
import { createCustodyProfile, custodyProfileCommitment, assertCombinedAdapterRegistrationsV2 } from '../../../src/claims/protocol/registry-envelope-v2.mjs';
import { profileCommitment } from '../../../src/chains/shared/transfers/generic-native-value-v2.mjs';
import { nativeClaimEndpointCommitment, claimIntentId, claimTicketId, claimTicketSecret, claimDestinationCommitment } from '@lianum/engine/claims/framing';
import { receiptKeyCommitment, encodeSolanaBindingMessage, encodeBitcoinBinding, validateBitcoinBinding } from '@lianum/engine/native/native-receipt-binding';
import { encodeSolanaNonceBindingMessage } from '../../../src/chains/solana/runtime/owned-solana-nonce-binding.mjs';
import { createClaimReservationBinding } from '../../../src/claims/authorization/reservation-facts-gate.mjs';
import { CLAIM_ACTIONS, claimHash, claimFrame, claimRouteCommitment } from '@lianum/engine/claims/permits';
import { currentFixture, tree, h, copy, ZERO } from '../../fixtures/operations/deployments/wrapped/wrapped-v4-host-fixtures.mjs';
import { checkpointAuthorizationDigest } from '../../../src/operations/recovery/native-value-checkpoint-v4.mjs';
import { exactRecord } from '@lianum/components/encoding/commitments';
import { frozenInput as freeze } from '../../../src/execution/account/preparation/readiness-inputs.mjs';
import { registryCommitment } from '../../../src/chains/shared/transfers/generic-native-value-v2.mjs';
import { claimDomainCommitment } from '@lianum/engine/claims/framing';
import { ownedCustodyRoute, ownedCustodyFeeAudit, summarizeOwnedBitcoinCoins } from '../../../src/chains/shared/runtime/owned-native-custody.mjs';
import { recoverSecp256k1Sender } from '../../../src/chains/evm/contracts/transaction-wire-codec.mjs';
import { nativeValueInventoryBinding, createNativeValueOperatorInventory, nativeValuePolicy, validateNativeValueOperatorInventory } from '../../../src/operations/operators/wrapped/wrapped-claim-graph-inventory-v1.mjs';
import * as originalBitcoin from '../../../src/chains/bitcoin/runtime/owned-bitcoin-runtime.mjs';
import * as originalSolana from '../../../src/chains/solana/runtime/owned-solana-runtime.mjs';
import * as noteEncoding from '@lianum/engine/notes/private-note-encoding';
const url = p => new URL(p,import.meta.url).href;
const construction = new WeakMap(), observers = new WeakMap(), systems = new WeakMap(), natives = new WeakMap(), views = new WeakMap();
const records = new Map(); let keys = 0, serial = 0, beforeSignature;
mock.module(url('../../../../../omnichain-product/src/private-note-encoding.mjs'), {exports:{...noteEncoding,
  signature(...args) { beforeSignature?.(); keys++; return noteEncoding.signature(...args); }
}});
mock.module(url('./wrapped-claim-operator-bootstrap-v1.mjs'), {exports:{
  consumeWrappedClaimOperatorConstructionV1(token) { const value=construction.get(token); assert.ok(value,'TEST_PRIVATE_CONSTRUCTION'); construction.delete(token); return value; }
}});
mock.module(url('../native-claims/wrapped-owned-state-v1.mjs'), {exports:{
  assertOwnedWrappedClaimObserverV1(value) { assert.ok(observers.has(value),'TEST_ORIGINAL_WRAPPED_OBSERVER'); },
  ownedWrappedClaimObserverBindingsV1(value) { assert.ok(observers.has(value)); return observers.get(value); }
}});
for (const [family,name] of [['1','Bitcoin'],['2','Solana']]) mock.module(url('../chain-adapters/owned-'+name.toLowerCase()+'-runtime.mjs'), {exports:{
  ...(family==='1'?originalBitcoin:originalSolana),
  ...(family==='2'?{SOLANA_NONCE_INGRESS_PROFILE:'LIANUM_GENERIC_NATIVE_CLAIM_INGRESS_V3'}:{}),
  ['assertOwned'+name+'Runtime'](value) { assert.equal(natives.get(value)?.family,family,'TEST_ORIGINAL_NATIVE'); },
  ['assertOwned'+name+'RuntimeLive'](value) { const row=natives.get(value);assert.equal(row?.family,family);assert.equal(row.closed,false,'TEST_NATIVE_CLOSED'); },
  ['readOwned'+name+'RuntimeAuditState'](value) { const row=natives.get(value);assert.ok(row);assert.equal(row.closed,false,'TEST_NATIVE_CLOSED');return freeze(copy(row.snapshot())); }
}});
mock.module(url('../native-claims/segmented-record-store.mjs'), {exports:{
 async createClaimRecordStore({path},data) { assert.ok(!records.has(path));const state={revision:0,data:copy(data),closed:false,updates:[]};records.set(path,state);
  const read=async()=>{await state.beforeRead?.();assert.equal(state.closed,false);return {revision:state.revision,data:copy(state.data),commitment:h('revision'+state.revision)};};
  return {read,async update(revision,fn){assert.equal(revision,state.revision);state.data=copy(fn(copy(state.data)));state.revision++;state.updates.push(copy(state.data));await state.beforeUpdate?.();return read();},close(){state.closed=true;}};
 }
}});
mock.module(url('./wrapped-claim-system-v1.mjs'), {exports:{
 assertOwnedWrappedClaimGraphSystem(runtime,system){assert.equal(systems.get(system)?.runtime,runtime,'TEST_ORIGINAL_WRAPPED_GRAPH_SYSTEM');},
 wrappedClaimGraphOperatorResources(runtime,system,request){const owner=systems.get(system);assert.equal(owner?.runtime,runtime);return owner.resources(request);}
}});
mock.module(url('../paeg/wrapped-claim-system-state-v1.mjs'), {exports:{
 async createWrappedClaimGraphStateReaderV1({runtime,system,poolIndex}) {const f=systems.get(system);assert.equal(f?.runtime,runtime);
  return {async read(){await f.controls.beforeGraphView?.();const value=freeze(f.graphView(poolIndex));views.set(value,{runtime,system,poolIndex});return value;},
   async assertCurrent(value){assert.deepEqual(views.get(value),{runtime,system,poolIndex});await f.controls.beforeGraphCurrent?.();assert.deepEqual(value,f.graphView(poolIndex));}};
 },
 assertWrappedClaimGraphCurrentViewV1(value,expected){assert.deepEqual(views.get(value),expected);}
}});
// Lower runtime/gate ownership port only. The real combined, reverse claim,
// GRAPH operator, key codec, retained journal and all-signer lease code executes.
const testGraphOperationsV4 = new WeakMap();
mock.module(url('../chain-adapters/wrapped-claim-graph-dispatch-gate-v1.mjs'), {exports:{
 readWrappedGraphDispatchOperationV4(token) {
  const read=testGraphOperationsV4.get(token);assert.ok(read,'TEST_ORIGINAL_GRAPH_OPERATION_REQUIRED');return freeze(copy(read()));
 }
}});
const bridge=await import('../../../src/operations/operators/wrapped/wrapped-claim-combined-operators-v1.mjs');
const graphModule=await import('../../../src/operations/operators/wrapped/wrapped-claim-graph-operators-v1.mjs');
const claimModule=await import('../../../src/claims/wrapped/operations/wrapped-operators-v1.mjs');
const nativeClaimModule=await import('../../../src/claims/operations/operators.mjs');
const {createOwnedEvmNativeValueHealthSource}=await import('../../../src/chains/evm/health/evm-native-value-health-source-v4.mjs');

// Execute the ACTUAL fixed bootstrap resource/queue producer over named inert
// ownership, store and filesystem ports. No invented resource method stands in
// for the production queue, owner-token check, source creation or lease capture.
const bootstrapSource=readFileSync(new URL('./wrapped-claim-operator-bootstrap-v1.mjs',import.meta.url),'utf8');
const cut=(from,to)=>{const a=bootstrapSource.indexOf(from),b=bootstrapSource.indexOf(to,a);assert.ok(a>=0&&b>a);return bootstrapSource.slice(a,b);};
const bootstrapQueueSource=cut('const graphNativeQueuesV4 =', 'async function runtimeEntry(');
const bootstrapProvisionSource=cut('export async function provisionWrappedClaimOperatorsV1', 'export async function finishWrappedClaimOperatorsV1').replace('export ','');
async function originalBootstrapResources(f) {
 const bootstrap=Object.freeze({}),owner={used:false,custodyBinding:{runtime:f.runtime},runtime:null,
  metadata:{attesterKeys:f.pairs.map(p=>p.claim.publicKey),adapterProfiles:f.registration.profiles},operators:f.pairs.map(p=>p.graph),stores:[],entries:[f.entry],originals:new Map([[f.originalKey,f.original]]),
  live(){assert.notEqual(f.controls.graphClosed,true);}};
 const owns=new WeakMap([[bootstrap,owner]]);
 const env={assert,copy,freeze,profileCommitment,exactRecord,join,ROOT:'/inert-wrapped-host-'+f.id,randomBytes,
  mkdir:async()=>{},mkdtemp:async prefix=>prefix+'source-only',nativeValueInventoryBinding,createNativeValueOperatorInventory,nativeValuePolicy,validateNativeValueOperatorInventory,
  assertNativeValueRegistrations:assertCombinedAdapterRegistrationsV2,originalKey:(p,n)=>p+':'+n,owns,
  assertWrappedClaimOperatorBootstrapV1(value){assert.equal(value,bootstrap);owner.live();return owner.metadata;},
  async createClaimRecordStore({identity},initial){const i=Number(identity.binding.signerIndex),row={record:{revision:'0',state:copy(initial)}};f.graphRecords[i]=row;
   return {async read(){await f.controls.beforeGraphStore?.(i);return {revision:Number(row.record.revision),data:copy(row.record.state)};},
    async update(revision,fn){assert.equal(revision,Number(row.record.revision));row.record={revision:String(revision+1),state:copy(fn(copy(row.record.state)))};return {revision:revision+1,data:copy(row.record.state)};},close(){}};
  }
 };
 const provision=new Function(...Object.keys(env),bootstrapQueueSource+'\n'+bootstrapProvisionSource+'\nreturn provisionWrappedClaimOperatorsV1;')(...Object.values(env));
 return provision(bootstrap,{runtime:f.runtime,registry:f.registration.registry,adapterProfiles:f.registration.profiles});
}

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

async function fixture(t, {family='2'} = {}) {
 const selectedIndex=Number(family)-1;
 const id=++serial,c=currentFixture(),controls={inventoryReads:[0,0],graphViews:0,currentChecks:0,recovery:0,evmEpoch:0};
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
 const pairs=[0,1,2,3].map(signerIndex=>{const token=Object.freeze({});construction.set(token,{signerIndex});return bridge.createCombinedWrappedClaimOperatorV1(token);});
 c.registration.registry.quorum.keys=pairs.map(p=>copy(p.claim.publicKey));
 const root=registryCommitment(c.registration.registry);
 c.registration.claims.forEach(({config},i)=>{config.registryCommitment=root;c.gateways[i].claimDomain=claimDomainCommitment(config);c.inventories[i].claimDomain=c.gateways[i].claimDomain;c.gateways[i].healthState.registryCommitment=root;});
 const head=c.head;
 const runtime=Object.freeze({get ingressSendState(){return {epoch:String(controls.evmEpoch),busy:controls.receiverBusy??false,uncertain:false};},
  async block(){return {number:'0x'+BigInt(head.number).toString(16),hash:'0x'+head.hash,timestamp:'0x'+BigInt(head.timestamp).toString(16)};},
  async call({to,data},at){assert.equal(to,'0x0000000000000000000000000000000000000001');assert.equal(at,'0x'+BigInt(head.number).toString(16));controls.recovery++;await controls.beforeRecovery?.();
   const w=data.slice(2).match(/.{64}/g),sender=recoverSecp256k1Sender({digest:w[0],r:w[2],s:w[3],parity:Number(BigInt('0x'+w[1])-27n)});return '0x'+'00'.repeat(12)+sender.slice(2);}
 });
 const nativeRuntimes=c.inventories.map((entry,i)=>{
  const config=c.registration.claims[i].config,state={family:String(i+1),closed:false,generation:0,mutations:0,activeReads:0,transfers:[],graphTransfers:[],activePrepared:null,activeRoute:null};
  const read=async work=>{state.generation++;state.activeReads++;try{return await work();}finally{state.activeReads--;}};
  const native=Object.freeze({roles:entry.roles,syntheticPrefunding:entry.syntheticPrefunding,close(){state.closed=true;},get transfers(){return copy(state.transfers);},
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
 const graphView=poolIndex=>({poolIndex,poolAddress:'0x'+c.registration.claims[poolIndex].config.pool,head:copy(head),
  header:{number:'0x'+BigInt(head.number).toString(16),hash:'0x'+head.hash,timestamp:'0x'+BigInt(head.timestamp).toString(16)},
  snapshot:{poolStateSequence:'0',hubStateSequence:c.hubStateSequence},checkpointCount:'0',healthState:{...copy(c.gateways[poolIndex].healthState),timestamp:head.timestamp}});
 const system=Object.freeze({profile:'LIANUM_OWNED_WRAPPED_CUSTODY_NATIVE_GRAPH_V1',claimsEnabled:true,registry:c.registration.registry,
  adapterProfiles:c.registration.profiles,custodyRegistration:c.registration,hubDomain:'0x'+c.registration.registry.quorum.hubDomain,registryCommitment:'0x'+root,
  hub:{async call(method,args,at){assert.equal(method,'checkpointAuthorizationDigest(address,uint64,uint64,bytes32,uint64)');assert.equal(at,'0x'+BigInt(head.number).toString(16));
   const [pool,expectedPoolSequence,expectedHubStateSequence,requestId,validUntil]=args;
   return checkpointAuthorizationDigest({hubDomain:'0x'+c.registration.registry.quorum.hubDomain,registryCommitment:'0x'+root,pool,expectedPoolSequence,expectedHubStateSequence,requestId,validUntil});}}});
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
 const graphProfile=c.registration.profiles.find(row=>row.kind==='native-value').profile;
 const resources=await originalBootstrapResources({id,runtime,pairs,registration:c.registration,graphRecords,controls,
  originalKey:profileCommitment(graphProfile)+':'+graphFixtures[0].binding.identity.nativeId,original:graphFixtures[0].original,
  entry:{nativeRuntime:Object.freeze({}),profile:graphProfile,readNativeStateV4:()=>{(controls.graphSnapshotSamples??=[]).push(copy(graphNative));return freeze(copy(graphNative));},
   async createSource(raw){const f=graphFixtures[Number(raw.source.index)];
    const transport=async(...args)=>{graphNative.activeReads++;graphNative.readsIdle=false;graphNative.readGeneration=String(BigInt(graphNative.readGeneration)+1n);
     (controls.graphNativeReadEvents??=[]).push({signerIndex:Number(raw.source.index),phase:'start',generation:graphNative.readGeneration});
     try{return await f.transport(...args);}finally{graphNative.activeReads--;graphNative.readsIdle=graphNative.activeReads===0;graphNative.readGeneration=String(BigInt(graphNative.readGeneration)+1n);
      controls.graphNativeReadEvents.push({signerIndex:Number(raw.source.index),phase:'end',generation:graphNative.readGeneration});}};
    (controls.graphNativeTransports??=[])[Number(raw.source.index)]=transport;
    return createOwnedEvmNativeValueHealthSource({...raw,source:{...raw.source,transport}});
   }
  }});
 systems.set(system,{runtime,controls,graphView,resources(request){const identity=graphModule.consumeWrappedClaimGraphOperatorBootstrapRequestV1(request,{runtime,system});
  assert.deepEqual(identity.publicKey,pairs[identity.signerIndex].graph.publicKey);return resources[identity.signerIndex];
 }});
 const configs=c.registration.claims.map(row=>row.config),policies=c.registration.claims.map(({config,rule})=>({ledgerNamespace:config.ledgerNamespace,hubDomain:config.hubDomain,registryCommitment:root,rule}));
 observers.set(observer,{runtime,system:{flatSystem:system,custodyRegistration:c.registration},registry:c.registration.registry,configs,policies,nativeRuntimes,journalRoot:'/wrapped-v4-host-'+id});
 t.after(()=>{beforeSignature=undefined;for(const pair of pairs){pair.claim.close();}for(const path of records.keys())if(path.startsWith('/wrapped-v4-host-'+id+'/'))records.delete(path);});
 for(const pair of pairs){await pair.claim.bind(observer);await pair.graph.bind({runtime,system});}
 const quorum=claimModule.createClaimOperatorQuorum({operators:pairs.slice(0,3).map(p=>p.claim)});
 const config=configs[selectedIndex],rule=c.registration.claims[selectedIndex].rule,domain=claimDomainCommitment(config),roles=c.inventories[selectedIndex].roles,sha=h,frozen=freeze;
 const claimTransfers=natives.get(nativeRuntimes[selectedIndex]).transfers;
 const coin=()=>({txid:h('escrow-outpoint'),vout:'0',script:roles.escrow.endpoint,amount:String(1000000n+BigInt(controls.principal))});
 for(const [name,field]of [['originalPrepared','activePrepared'],['preparedRoute','activeRoute']])Object.defineProperty(controls,name,{get:()=>natives.get(nativeRuntimes[selectedIndex])[field],set:v=>{natives.get(nativeRuntimes[selectedIndex])[field]=v;}});
 return {c,controls,pairs,quorum,runtime,system,observer,nativeRuntimes,graphRecords,graphFixtures,graphNative,head,
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
const cause=regex=>error=>{for(let e=error;e;e=e.cause)if(regex.test(e.message))return true;return false;};

test('actual wrapped factories issue a separate V4 original lease after complete BTC/SOL and typed GRAPH validation',async t=>{
 t.mock.method(performance,'now',()=>0);const f=await fixture(t),before=keys;
 const result=await f.quorum.health(f.request);
 assert.equal(result.authorizationLifecycleProfile,'WRAPPED_CLAIM_AUTHORIZATION_LIFECYCLE_V4');assert.equal(keys-before,3);
 assert.ok(f.controls.inventoryReads.every(count=>count>=12));assert.ok(f.graphRecords.slice(0,3).every(row=>row.record.state.lastClock==='1000'));
 const saved=copy(result),count=keys;const token=await f.quorum.validateOriginalAuthorizationV4(result);
 assert.equal(keys,count);assert.deepEqual(result,saved);
 assert.throws(()=>nativeClaimModule.openClaimOriginalAuthorizationLeaseV4(token,f.quorum,result),/PRIVATE_ORIGINAL_LEASE/);
 const lease=claimModule.openWrappedClaimOriginalAuthorizationLeaseV4(token,f.quorum,result);
 assert.equal(lease.profile,'WRAPPED_CLAIM_ORIGINAL_AUTHORIZATION_LEASE_V4');assert.equal(lease.auditStarted,0);
 lease.assertBeforeKey();assert.throws(()=>lease.assertBeforeKey(),/ALREADY_CONSUMED/);assert.throws(()=>lease.assertContinuationSourceCurrent(),/BROADCAST_ONLY/);
 assert.throws(()=>claimModule.openWrappedClaimOriginalAuthorizationLeaseV4(token,f.quorum,result),/PRIVATE_ORIGINAL_LEASE/);
});

for(const change of ['copy','wrong-quorum','wrong-result']) test('wrapped original lease '+change+' refuses without adopting native identity and burns on open failure',async t=>{
 t.mock.method(performance,'now',()=>0);const f=await fixture(t),result=await f.quorum.health(f.request),token=await f.quorum.validateOriginalAuthorizationV4(result),count=keys;
 if(change==='copy'){assert.throws(()=>claimModule.openWrappedClaimOriginalAuthorizationLeaseV4({...token},f.quorum,result),/PRIVATE_ORIGINAL_LEASE/);claimModule.openWrappedClaimOriginalAuthorizationLeaseV4(token,f.quorum,result).assertBeforeKey();}
 else {assert.throws(()=>claimModule.openWrappedClaimOriginalAuthorizationLeaseV4(token,change==='wrong-quorum'?{}:f.quorum,change==='wrong-result'?copy(result):result),/LEASE_(QUORUM|ORIGINAL_RESULT)/);
  assert.throws(()=>claimModule.openWrappedClaimOriginalAuthorizationLeaseV4(token,f.quorum,result),/PRIVATE_ORIGINAL_LEASE/);}
 assert.equal(keys,count);
});
for(const delta of ['graph-operation','native-read','evm-epoch','native-close','claim-operation']) test('wrapped V4 lease rejects later '+delta+' and cannot revive',async t=>{
 t.mock.method(performance,'now',()=>0);const f=await fixture(t),result=await f.quorum.health(f.request),token=await f.quorum.validateOriginalAuthorizationV4(result),count=keys;
 const lease=claimModule.openWrappedClaimOriginalAuthorizationLeaseV4(token,f.quorum,result);
 if(delta==='graph-operation')await f.pairs[0].graph.audit({poolIndex:0});
 if(delta==='native-read')await f.nativeRuntimes[1].inventory();
 if(delta==='evm-epoch')f.controls.evmEpoch++;
 if(delta==='native-close')natives.get(f.nativeRuntimes[1]).closed=true;
 if(delta==='claim-operation')await f.pairs[0].claim.audit();
 assert.throws(()=>lease.assertBeforeKey(),/SOURCE_CHANGED|NATIVE_STATE_CHANGED|EVM_MUTATION_CHANGED|NATIVE_CLOSED|GENERATION_CHANGED/);
 assert.throws(()=>lease.assertBeforeKey(),/ALREADY_CONSUMED/);assert.equal(keys,count);
});
for(const elapsed of [-1,30_000,Infinity,NaN])test('wrapped V4 final authority rejects nonfinite, negative, and exact-thirty-second elapsed: '+elapsed,async t=>{
 let now=0;t.mock.method(performance,'now',()=>now);const f=await fixture(t),result=await f.quorum.health(f.request),token=await f.quorum.validateOriginalAuthorizationV4(result),lease=claimModule.openWrappedClaimOriginalAuthorizationLeaseV4(token,f.quorum,result);now=elapsed;
 assert.throws(()=>lease.assertBeforeKey(),/AUDIT_TOO_OLD/);assert.throws(()=>lease.assertBeforeKey(),/ALREADY_CONSUMED/);
});
test('wrapped independent complete rounds may exceed thirty seconds in total without relaxing any one round',async t=>{
 let now=0;t.mock.method(performance,'now',()=>now);const f=await fixture(t);f.controls.beforeInventory=async()=>{now+=1500;};
 const count=keys,result=await f.quorum.health(f.request);assert.equal(keys-count,3);assert.ok(now>30_000);
 const token=await f.quorum.validateOriginalAuthorizationV4(result),lease=claimModule.openWrappedClaimOriginalAuthorizationLeaseV4(token,f.quorum,result);
 lease.assertBeforeKey();assert.ok(now-lease.auditStarted<30_000);assert.equal(keys-count,3);
});
test('wrapped complete original revalidation is validation-only and rejects a removed durable signature',async t=>{
 t.mock.method(performance,'now',()=>0);const f=await fixture(t),result=await f.quorum.health(f.request),count=keys;
 // An external CAS-record change cannot be normalized into a new signature.
 f.store(0).data.authorizations[0].signature=null;
 await assert.rejects(f.quorum.validateOriginalAuthorizationV4(result),cause(/JOURNAL|CHANGED|UNFINISHED/));assert.equal(keys,count);
});
test('wrapped failure drains every started independent signer before releasing its reservation',async t=>{
 t.mock.method(performance,'now',()=>0);const f=await fixture(t);let release,entered;
 const waiting=new Promise(resolve=>entered=resolve),gate=new Promise(resolve=>release=resolve);let calls=0;
 f.controls.beforeInventory=async()=>{if(++calls===1){entered();await gate;throw Error('TEST_NATIVE_UNKNOWN');}};
 const work=f.quorum.health(f.request);await waiting;
 await assert.rejects(f.pairs[0].graph.audit({poolIndex:0}),/EXCLUSIVE|RESERVED/);assert.equal(f.pairs[0].claim.status().reserved,true);
 release();await assert.rejects(work,cause(/TEST_NATIVE_UNKNOWN|RETAINED_NATIVE|INVENTORY|COMPLETE_AUDIT/));
 for(const pair of f.pairs.slice(0,3))assert.equal(pair.claim.status().reserved,false);
 assert.ok(f.nativeRuntimes.every(native=>natives.get(native).activeReads===0));
});
test('wrapped private key and facts consumers reject public lookalikes before key use',()=>{
 const count=keys;assert.throws(()=>claimModule.consumeWrappedClaimOperatorKeyLeaseV4({}, {},'health',{},Buffer.alloc(0)),/PRIVATE_KEY_LEASE/);
 assert.throws(()=>claimModule.consumeWrappedClaimPayoutFactsKeyLeaseV4({}, {},{},Buffer.alloc(0)),/PRIVATE_FACTS_KEY_LEASE/);
 assert.equal(keys,count);
});
test('ordinary wrapped ingress health retains its original non-V4 result and full final coverage',async t=>{
 t.mock.method(performance,'now',()=>0);const f=await fixture(t),count=keys;
 const result=await f.quorum.health({...f.request,mode:'ingress'});assert.equal(result.authorizationLifecycleProfile,undefined);assert.equal(keys-count,3);
 const reads=f.controls.inventoryReads[0];await f.quorum.assertOriginalAuthorizationCurrent(result);assert.equal(keys-count,3);assert.ok(f.controls.inventoryReads[0]>reads);
 await assert.rejects(async()=>f.quorum.validateOriginalAuthorizationV4(result),/V4_ORIGINAL_AUTHORIZATION_REQUIRED/);
});
for(const kind of ['1','2'])test('actual wrapped SOL '+(kind==='1'?'redeem':'refund')+' retains original backing/presign/reservation/broadcast and payout facts signatures',async t=>{
 t.mock.method(performance,'now',()=>0);const f=await fixture(t);
 await f.addClaimFact();const p=f.preparePayout(kind),begin=await f.quorum.backing(p.begin);
 assert.equal(begin.authorizationLifecycleProfile,'WRAPPED_CLAIM_AUTHORIZATION_LIFECYCLE_V4');
 const beginKeys=keys;claimModule.openWrappedClaimOriginalAuthorizationLeaseV4(await f.quorum.validateOriginalAuthorizationV4(begin),f.quorum,begin).assertBeforeKey();assert.equal(keys,beginKeys);
 p.beginIncluded();const presign=await f.quorum.authorizePayout(p.request);assert.equal(presign.message.ticketId,p.ticket.id);
 const reservationRequest=await p.retain(),reservation=await f.quorum.reservation(reservationRequest);
 claimModule.openWrappedClaimOriginalAuthorizationLeaseV4(await f.quorum.validateOriginalAuthorizationV4(reservation),f.quorum,reservation).assertBeforeKey();
 const broadcastRequest=p.reserved(),broadcast=await f.quorum.authorizeBroadcast(broadcastRequest),lease=claimModule.openWrappedClaimOriginalAuthorizationLeaseV4(await f.quorum.validateOriginalAuthorizationV4(broadcast),f.quorum,broadcast);
 lease.assertBeforeKey();lease.assertContinuationSourceCurrent();assert.throws(()=>lease.assertContinuationSourceCurrent(),/ALREADY_CONSUMED/);
 const factsRequest=p.observed(),facts=await f.quorum.facts(factsRequest),factKeys=keys;
 assert.equal(facts.authorizationLifecycleProfile,'WRAPPED_CLAIM_AUTHORIZATION_LIFECYCLE_V4');assert.equal(facts.certificates.length,3);
 const again=await f.quorum.facts(factsRequest);assert.deepEqual(again,facts);assert.equal(keys,factKeys);
 for(let i=0;i<3;i++)assert.equal(f.store(i).data.wrappedFactsHistory.filter(row=>row.request.nativeId===factsRequest.nativeId).length,1);
 p.discharge();const health=await f.quorum.health({...f.request,claimDomain:p.request.claimDomain});assert.equal(health.authorizationLifecycleProfile,'WRAPPED_CLAIM_AUTHORIZATION_LIFECYCLE_V4');
});
test('loaded genuine typed GRAPH source histories are independently reopened in every wrapped V4 round',async t=>{
 t.mock.method(performance,'now',()=>0);const f=await fixture(t);await f.addGraphFact();const before=f.graphFixtures.map(row=>row.calls.length),count=keys;
 const result=await f.quorum.health(f.request);assert.equal(keys-count,3);
 for(let i=0;i<3;i++){assert.ok(f.graphFixtures[i].calls.length>before[i]);assert.equal(f.graphRecords[i].record.state.inventories[0].entries[0].history.length,1);}
 const token=await f.quorum.validateOriginalAuthorizationV4(result),lease=claimModule.openWrappedClaimOriginalAuthorizationLeaseV4(token,f.quorum,result);lease.assertBeforeKey();
});
test('loaded typed GRAPH unknown refuses all wrapped claim keys and later adverse history stays latched',async t=>{
 t.mock.method(performance,'now',()=>0);const f=await fixture(t);await f.addGraphFact();const count=keys;
 f.controls.graphUnknown=true;await assert.rejects(f.quorum.health(f.request),cause(/FULL_INVENTORY_BLOCKED/));assert.equal(keys,count);
 f.controls.graphUnknown=false;await f.quorum.health(f.request);
 // A changed inclusion is authenticated adverse, even when the same wire exists.
 const oldHash=f.graphFixtures[0].state.included.hash;f.graphFixtures[0].state.included.hash=hash(80000);
 await assert.rejects(f.quorum.health(f.request),cause(/FULL_INVENTORY_BLOCKED/));
 assert.equal(f.graphRecords[0].record.state.inventories[0].entries[0].status,'adverse');
 f.graphFixtures[0].state.included.hash=oldHash;
 await assert.rejects(f.quorum.health(f.request),cause(/FULL_INVENTORY_BLOCKED/));
 assert.equal(f.graphRecords[0].record.state.inventories[0].entries[0].status,'adverse');
});
for(const delta of ['read','mutation','pending','adverse','history'])test('wrapped original lease fences separate registered GRAPH native '+delta+' after complete audit',async t=>{
 t.mock.method(performance,'now',()=>0);const f=await fixture(t),result=await f.quorum.health(f.request),token=await f.quorum.validateOriginalAuthorizationV4(result),lease=claimModule.openWrappedClaimOriginalAuthorizationLeaseV4(token,f.quorum,result),count=keys;
 if(delta==='read')f.graphNative.readGeneration=String(BigInt(f.graphNative.readGeneration)+1n);
 if(delta==='mutation')f.graphNative.mutationGeneration='1';
 if(delta==='pending')f.graphNative.pending=true;
 if(delta==='adverse')f.graphNative.adverseHistory=true;
 if(delta==='history')f.graphNative.transactions.push({nativeId:h('unexpected-native-transaction')});
 assert.throws(()=>lease.assertBeforeKey(),/GRAPH_NATIVE_(STATE|HISTORY)_CHANGED/);assert.throws(()=>lease.assertBeforeKey(),/ALREADY_CONSUMED/);assert.equal(keys,count);
});
for(const kind of ['1','2'])test('actual wrapped BTC '+(kind==='1'?'redeem':'refund')+' signs exact original broadcast purpose and retains payout facts',async t=>{
 t.mock.method(performance,'now',()=>0);const f=await fixture(t,{family:'1'});await f.addBitcoinClaimFact();const p=f.prepareBitcoinPayout(kind);
 const begin=await f.quorum.backing(p.begin);claimModule.openWrappedClaimOriginalAuthorizationLeaseV4(await f.quorum.validateOriginalAuthorizationV4(begin),f.quorum,begin).assertBeforeKey();
 p.beginIncluded();const presign=await f.quorum.authorizePayout(p.request);assert.equal(presign.message.ticketId,p.ticket.id);
 const reservationRequest=await p.retain(),reservation=await f.quorum.reservation(reservationRequest);
 claimModule.openWrappedClaimOriginalAuthorizationLeaseV4(await f.quorum.validateOriginalAuthorizationV4(reservation),f.quorum,reservation).assertBeforeKey();
 const request=p.reserved(),broadcast=await f.quorum.authorizeBitcoinBroadcast(request),count=keys;
 claimModule.assertOriginalBitcoinPayoutBroadcastAuthorization(f.quorum,broadcast,request);
 const token=await f.quorum.validateOriginalAuthorizationV4(broadcast),lease=claimModule.openWrappedClaimOriginalAuthorizationLeaseV4(token,f.quorum,broadcast);
 lease.assertBeforeKey();lease.assertContinuationSourceCurrent();assert.equal(keys,count);
 await assert.rejects(f.quorum.authorizeBroadcast(request),/SOL|BITCOIN|FAMILY/);
 const factsRequest=p.observed(),facts=await f.quorum.facts(factsRequest),factKeys=keys;
 assert.equal(facts.authorizationLifecycleProfile,'WRAPPED_CLAIM_AUTHORIZATION_LIFECYCLE_V4');assert.deepEqual(await f.quorum.facts(factsRequest),facts);assert.equal(keys,factKeys);
 for(let i=0;i<3;i++)assert.equal(f.store(i).data.wrappedFactsHistory.filter(row=>row.request.nativeId===factsRequest.nativeId).length,1);
});

test('all signers share the final stable GRAPH physical snapshot after sequential independent reads without changing original signatures head or payout intent',async t=>{
 t.mock.method(performance,'now',()=>0);const f=await fixture(t);await f.addGraphFact();await f.addClaimFact();
 const p=f.preparePayout('1');await f.quorum.backing(p.begin);p.beginIncluded();
 const original=await f.quorum.authorizePayout(p.request),savedResult=copy(original),savedRequest=copy(p.request),count=keys;
 const reads=f.graphFixtures.map(row=>row.calls.length),sampleStart=f.controls.graphSnapshotSamples.length,eventStart=f.controls.graphNativeReadEvents.length;
 const token=await f.quorum.validateOriginalAuthorizationV4(original),lease=claimModule.openWrappedClaimOriginalAuthorizationLeaseV4(token,f.quorum,original);
 const samples=f.controls.graphSnapshotSamples.slice(sampleStart),finalGeneration=f.graphNative.readGeneration;
 for(let i=0;i<3;i++)assert.ok(f.graphFixtures[i].calls.length>reads[i],'each original registered source independently reopens');
 const events=f.controls.graphNativeReadEvents.slice(eventStart);assert.deepEqual([...new Set(events.map(row=>row.signerIndex))].sort(),[0,1,2]);
 assert.ok(events.length>=6);for(let i=0;i<events.length;i+=2){assert.equal(events[i].phase,'start');assert.equal(events[i+1].phase,'end');assert.equal(events[i].signerIndex,events[i+1].signerIndex);assert.equal(BigInt(events[i+1].generation),BigInt(events[i].generation)+1n);}
 assert.equal(events.at(-1).generation,finalGeneration,'all legitimate sequential reads precede the final stable snapshot');
 assert.equal(samples.at(-1).readGeneration,finalGeneration);assert.equal(samples.at(-1).activeReads,0);assert.equal(samples.at(-1).readsIdle,true);
 const calls=f.graphFixtures.map(row=>row.calls.length);lease.assertBeforeKey();
 assert.deepEqual(f.graphFixtures.map(row=>row.calls.length),calls,'terminal consumption performs no native reread');
 assert.deepEqual(original,savedResult);assert.deepEqual(p.request,savedRequest);assert.equal(keys,count);
 // The exact final fence is stricter than the cross-signer progress projection.
 const readLease=claimModule.openWrappedClaimOriginalAuthorizationLeaseV4(await f.quorum.validateOriginalAuthorizationV4(original),f.quorum,original);
 await f.controls.graphNativeTransports[0]('eth_chainId',[],{signal:new AbortController().signal});
 assert.throws(()=>readLease.assertBeforeKey(),/GRAPH_NATIVE_STATE_CHANGED/);
 const mutationLease=claimModule.openWrappedClaimOriginalAuthorizationLeaseV4(await f.quorum.validateOriginalAuthorizationV4(original),f.quorum,original);
 f.graphNative.mutationGeneration=String(BigInt(f.graphNative.mutationGeneration)+1n);
 assert.throws(()=>mutationLease.assertBeforeKey(),/GRAPH_NATIVE_HISTORY_CHANGED|GRAPH_NATIVE_STATE_CHANGED/);
 assert.deepEqual(original,savedResult);assert.deepEqual(p.request,savedRequest);assert.equal(keys,count);
});

test('wrapped original all-signer lease accepts the unchanged receiver busy dispatch section while separate GRAPH remains idle',async t=>{
 t.mock.method(performance,'now',()=>0);const f=await fixture(t);f.controls.receiverBusy=true;
 const result=await f.quorum.health(f.request),count=keys,token=await f.quorum.validateOriginalAuthorizationV4(result);
 const lease=claimModule.openWrappedClaimOriginalAuthorizationLeaseV4(token,f.quorum,result);
 assert.equal(f.runtime.ingressSendState.busy,true);assert.equal(f.graphNative.busy,false);lease.assertBeforeKey();assert.equal(keys,count);
});
for(const change of ['epoch','busy'])test('receiver '+change+' change after the busy original all-signer audit refuses without graph-idle relaxation',async t=>{
 t.mock.method(performance,'now',()=>0);const f=await fixture(t);f.controls.receiverBusy=true;
 const result=await f.quorum.health(f.request),token=await f.quorum.validateOriginalAuthorizationV4(result),lease=claimModule.openWrappedClaimOriginalAuthorizationLeaseV4(token,f.quorum,result),count=keys;
 if(change==='epoch')f.controls.evmEpoch++;else f.controls.receiverBusy=false;
 assert.throws(()=>lease.assertBeforeKey(),/EVM_MUTATION_CHANGED/);assert.throws(()=>lease.assertBeforeKey(),/ALREADY_CONSUMED/);assert.equal(keys,count);
});
test('a busy separate GRAPH native runtime refuses before claim keys even inside the legitimate receiver dispatch section',async t=>{
 t.mock.method(performance,'now',()=>0);const f=await fixture(t);f.controls.receiverBusy=true;f.graphNative.busy=true;const count=keys;
 await assert.rejects(f.quorum.health(f.request),cause(/GRAPH_NATIVE_STATE_busy/));assert.equal(keys,count);
 assert.equal(f.runtime.ingressSendState.busy,true);assert.equal(f.graphNative.busy,true);
});


const graphQuorumV4 = f => graphModule.createNativeValueOperatorQuorum({operators:f.pairs.slice(0,3).map(pair=>pair.graph)});
const graphHealthV4 = f => ({poolIndex:0,validUntil:String(BigInt(f.head.timestamp)+30n)});
function originalOperationPortV4(f, phase='native-key') {
 const token=Object.freeze(Object.create(null)), profile=profileCommitment(f.c.registration.profiles.find(row=>row.kind==='native-value').profile);
 const state={phase,nativeAuditStarted:performance.now(),prepared:{intent:{amount:'7'},unsignedWire:'0011'},signed:phase==='native-key'?null:{nativeId:h('dispatch-native-id'),nativeWire:'aabb',transactionSHA256:h('dispatch-wire')}};
 Object.assign(f.graphNative,{busy:true,pending:true,activeMutations:1});
 testGraphOperationsV4.set(token,()=>({profile:'WRAPPED_GRAPH_DISPATCH_OPERATION_V4',profileCommitment:profile,family:f.graphNative.family,lifetimeId:f.graphNative.lifetimeId,
  phase:state.phase,prepared:state.prepared,signed:state.signed,nativeAuditStarted:state.nativeAuditStarted,physicalState:f.graphNative}));
 return {token,state};
}
test('GRAPH V4 original factories sign and validate reciprocal original claim history with one-use unchanged health',async t=>{
 t.mock.method(performance,'now',()=>0);const f=await fixture(t),q=graphQuorumV4(f),count=keys,reads=[...f.controls.inventoryReads];
 const result=await q.health(graphHealthV4(f));assert.equal(keys-count,3);assert.ok(f.controls.inventoryReads.every((n,i)=>n>reads[i]));
 const saved=copy(result),signed=keys,lease=await graphModule.validateWrappedGraphOriginalAuthorizationV4(q,result);
 assert.equal(graphModule.consumeWrappedGraphOriginalAuthorizationV4(lease,q,result),0);
 assert.equal(keys,signed);assert.deepEqual(result,saved);assert.throws(()=>graphModule.consumeWrappedGraphOriginalAuthorizationV4(lease,q,result),/PRIVATE_ORIGINAL_LEASE_REQUIRED/);
});
for(const phase of ['native-key','provider-key','send'])test('GRAPH V4 exact original dispatch operation phase '+phase+' alone may be busy',async t=>{
 t.mock.method(performance,'now',()=>0);const f=await fixture(t),q=graphQuorumV4(f),op=originalOperationPortV4(f,phase),count=keys;
 const result=await graphModule.issueWrappedGraphDispatchHealthV4(q,graphHealthV4(f),op.token),saved=copy(result);assert.equal(keys-count,3);
 const lease=await graphModule.validateWrappedGraphOriginalAuthorizationV4(q,result);
 assert.equal(graphModule.consumeWrappedGraphOriginalAuthorizationV4(lease,q,result),0);assert.deepEqual(result,saved);
 assert.equal(f.graphNative.busy,true);assert.equal(f.graphNative.pending,true);assert.equal(f.graphNative.activeMutations,1);
});

for(const kind of ['checkpoint','certify'])test('GRAPH V4 '+kind+' fixed signing domain preserves exact retained original bytes',async t=>{
 t.mock.method(performance,'now',()=>0);const f=await fixture(t),q=graphQuorumV4(f);await f.addClaimFact();const count=keys;
 const request=kind==='checkpoint'?{poolIndex:0,requestId:h('original-checkpoint')}:{poolIndex:0,profileCommitment:profileCommitment(f.c.registration.profiles.find(row=>row.kind==='native-value').profile),nativeId:f.graphFixtures[0].binding.identity.nativeId};
 const result=await q[kind](request),saved=copy(result),signed=keys;assert.equal(signed-count,3);
 const lease=await graphModule.validateWrappedGraphOriginalAuthorizationV4(q,result);
 graphModule.consumeWrappedGraphOriginalAuthorizationV4(lease,q,result);assert.equal(keys,signed);assert.deepEqual(result,saved);
 if(kind==='certify')for(let i=0;i<3;i++)assert.equal(f.graphRecords[i].record.state.inventories[0].entries[0].history.length,1);
});
test('GRAPH V4 does not mistake copies, proxies, callbacks or booleans for original result/key authority',async t=>{
 t.mock.method(performance,'now',()=>0);const f=await fixture(t),q=graphQuorumV4(f),result=await q.health(graphHealthV4(f)),count=keys;
 for(const falseResult of [copy(result),new Proxy(result,{}),true,undefined])assert.throws(()=>graphModule.validateWrappedGraphOriginalAuthorizationV4(q,falseResult),/ORIGINAL_AUTHORIZATION_REQUIRED/);
 const lease=await graphModule.validateWrappedGraphOriginalAuthorizationV4(q,result);
 for(const falseLease of [{...lease},new Proxy(lease,{}),{assertCurrent(){}},true,undefined])assert.throws(()=>graphModule.consumeWrappedGraphOriginalAuthorizationV4(falseLease,q,result),/PRIVATE_ORIGINAL_LEASE_REQUIRED/);
 for(const falseLease of [{},true,undefined])assert.throws(()=>graphModule.consumeWrappedGraphOperatorKeyLeaseV4(falseLease,{},'health',result.message,null,Buffer.alloc(0)),/PRIVATE_KEY_LEASE_REQUIRED/);
 graphModule.consumeWrappedGraphOriginalAuthorizationV4(lease,q,result);assert.equal(keys,count);
});
for(const change of ['quorum','result','options'])test('GRAPH V4 mismatching '+change+' burns original final lease before checks',async t=>{
 t.mock.method(performance,'now',()=>0);const f=await fixture(t),q=graphQuorumV4(f),result=await q.health(graphHealthV4(f)),count=keys;
 const lease=await graphModule.validateWrappedGraphOriginalAuthorizationV4(q,result),args=[lease,change==='quorum'?{}:q,change==='result'?copy(result):result];if(change==='options')args.push({phase:'send'});
 assert.throws(()=>graphModule.consumeWrappedGraphOriginalAuthorizationV4(...args),/LEASE_QUORUM|LEASE_RESULT|NO_OPTIONS/);
 assert.throws(()=>graphModule.consumeWrappedGraphOriginalAuthorizationV4(lease,q,result),/PRIVATE_ORIGINAL_LEASE_REQUIRED/);assert.equal(keys,count);
});
for(const change of ['claim-read','claim-mutation','claim-operation','graph-read','graph-mutation','graph-operation','receiver','native-phase','prepared','signed'])test('GRAPH V4 terminal original authority rejects later '+change,async t=>{
 t.mock.method(performance,'now',()=>0);const f=await fixture(t),q=graphQuorumV4(f),op=originalOperationPortV4(f,'provider-key');
 const result=await graphModule.issueWrappedGraphDispatchHealthV4(q,graphHealthV4(f),op.token),lease=await graphModule.validateWrappedGraphOriginalAuthorizationV4(q,result),count=keys;
 if(change==='claim-read')await f.nativeRuntimes[0].inventory();if(change==='claim-mutation')natives.get(f.nativeRuntimes[0]).mutations++;
 if(change==='claim-operation')await f.pairs[0].claim.retainSignedEffect({claimDomain:h('nonregistered'),operationId:h('none'),receiptSecret:h('s'),wireSalt:h('w'),nativeId:h('n')}).catch(()=>{});
 if(change==='graph-read')f.graphNative.readGeneration=String(BigInt(f.graphNative.readGeneration)+1n);
 if(change==='graph-mutation')f.graphNative.mutationGeneration=String(BigInt(f.graphNative.mutationGeneration)+1n);
 if(change==='graph-operation')await f.pairs[0].graph.audit({poolIndex:0});if(change==='receiver')f.controls.evmEpoch++;
 if(change==='native-phase')op.state.phase='send';if(change==='prepared')op.state.prepared.intent.amount='8';if(change==='signed')op.state.signed.nativeWire+='00';
 assert.throws(()=>graphModule.consumeWrappedGraphOriginalAuthorizationV4(lease,q,result));
 assert.throws(()=>graphModule.consumeWrappedGraphOriginalAuthorizationV4(lease,q,result),/PRIVATE_ORIGINAL_LEASE_REQUIRED/);assert.equal(keys,count);
});
for(const elapsed of [-1,29999,30000,Infinity,NaN])test('GRAPH V4 strict final clock boundary '+elapsed,async t=>{
 let now=0;t.mock.method(performance,'now',()=>now);const f=await fixture(t),q=graphQuorumV4(f),result=await q.health(graphHealthV4(f));
 const lease=await graphModule.validateWrappedGraphOriginalAuthorizationV4(q,result);now=elapsed;
 if(elapsed===29999)assert.equal(graphModule.consumeWrappedGraphOriginalAuthorizationV4(lease,q,result),0);
 else assert.throws(()=>graphModule.consumeWrappedGraphOriginalAuthorizationV4(lease,q,result),/COMPLETE_AUDIT_DEADLINE/);
 assert.throws(()=>graphModule.consumeWrappedGraphOriginalAuthorizationV4(lease,q,result),/PRIVATE_ORIGINAL_LEASE_REQUIRED/);
});
test('GRAPH V4 complete rounds may exceed thirty seconds together without refreshing original certificate bytes',async t=>{
 let now=0;t.mock.method(performance,'now',()=>now);const f=await fixture(t),q=graphQuorumV4(f);f.controls.beforeInventory=async()=>{now+=1500;};
 const count=keys,result=await q.health(graphHealthV4(f)),saved=copy(result);assert.equal(keys-count,3);assert.ok(now>30000);
 const lease=await graphModule.validateWrappedGraphOriginalAuthorizationV4(q,result),start=graphModule.consumeWrappedGraphOriginalAuthorizationV4(lease,q,result);
 assert.ok(now-start<30000);assert.deepEqual(result,saved);assert.equal(keys-count,3);
});
test('GRAPH V4 one expired complete reciprocal round cannot be renewed with a cheap refresh',async t=>{
 let now=0;t.mock.method(performance,'now',()=>now);const f=await fixture(t),q=graphQuorumV4(f),count=keys;f.controls.beforeInventory=async()=>{now+=30000;};
 await assert.rejects(q.health(graphHealthV4(f)),cause(/AUDIT_TOO_OLD|COMPLETE_AUDIT_DEADLINE|COMPLETE_AUDIT_UNAVAILABLE/));assert.equal(keys,count);
});
test('GRAPH V4 fresh original native read can advance before validation, then its exact generation and clock are pinned',async t=>{
 let now=0;t.mock.method(performance,'now',()=>now);const f=await fixture(t),q=graphQuorumV4(f),op=originalOperationPortV4(f);
 const result=await graphModule.issueWrappedGraphDispatchHealthV4(q,graphHealthV4(f),op.token),saved=copy(result);now=90000;op.state.nativeAuditStarted=now;f.graphNative.readGeneration='12';
 const lease=await graphModule.validateWrappedGraphOriginalAuthorizationV4(q,result);assert.equal(graphModule.consumeWrappedGraphOriginalAuthorizationV4(lease,q,result),90000);assert.deepEqual(result,saved);
 const expired=await graphModule.validateWrappedGraphOriginalAuthorizationV4(q,result);op.state.nativeAuditStarted=90001;
 assert.throws(()=>graphModule.consumeWrappedGraphOriginalAuthorizationV4(expired,q,result));
});
for(const failure of ['unsigned-preparation','active-payout','claim-adverse','graph-unknown','changed-signature','omitted-claim-inventory'])test('GRAPH V4 full reciprocal retained history refuses '+failure+' without new key',async t=>{
 t.mock.method(performance,'now',()=>0);const f=await fixture(t),q=graphQuorumV4(f);
 if(failure==='graph-unknown')await f.addGraphFact();if(['claim-adverse','active-payout','unsigned-preparation'].includes(failure))await f.addClaimFact();
 let result;if(failure==='changed-signature')result=await q.health(graphHealthV4(f));const count=keys;
 if(failure==='unsigned-preparation')f.preparePayout();if(failure==='active-payout'){const p=f.preparePayout();p.beginIncluded();}
 if(failure==='claim-adverse')f.controls.claimAdverse=true;if(failure==='graph-unknown')f.controls.graphUnknown=true;
 if(failure==='changed-signature')f.graphRecords[0].record.state.authorizations[0].signature=null;
 if(failure==='omitted-claim-inventory')f.c.inventories[1].inventory.accounts=[];
 await assert.rejects(result?graphModule.validateWrappedGraphOriginalAuthorizationV4(q,result):q.health(graphHealthV4(f)));assert.equal(keys,count);
});

test('GRAPH V4 final stable all-signer snapshot follows actual sequential claim and typed GRAPH reads',async t=>{
 t.mock.method(performance,'now',()=>0);const f=await fixture(t);await f.addClaimFact();await f.addGraphFact();const q=graphQuorumV4(f),result=await q.health(graphHealthV4(f)),count=keys,saved=copy(result);
 const graphReads=f.graphFixtures.map(row=>row.calls.length),claimReads=[...f.controls.inventoryReads];
 const lease=await graphModule.validateWrappedGraphOriginalAuthorizationV4(q,result),generation=f.graphNative.readGeneration;
 for(let i=0;i<3;i++)assert.ok(f.graphFixtures[i].calls.length>graphReads[i]);assert.ok(f.controls.inventoryReads.every((n,i)=>n>claimReads[i]));
 const finalReads=f.graphFixtures.map(row=>row.calls.length),finalClaim=[...f.controls.inventoryReads];graphModule.consumeWrappedGraphOriginalAuthorizationV4(lease,q,result);
 assert.deepEqual(f.graphFixtures.map(row=>row.calls.length),finalReads);assert.deepEqual(f.controls.inventoryReads,finalClaim);assert.equal(f.graphNative.readGeneration,generation);
 const next=await graphModule.validateWrappedGraphOriginalAuthorizationV4(q,result);await f.controls.graphNativeTransports[0]('eth_chainId',[],{signal:new AbortController().signal});
 assert.throws(()=>graphModule.consumeWrappedGraphOriginalAuthorizationV4(next,q,result));assert.deepEqual(result,saved);assert.equal(keys,count);
});
