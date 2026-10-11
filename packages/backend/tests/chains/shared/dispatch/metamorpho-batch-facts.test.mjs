/** HOST batch boundaries: complete original observer and facts peers. Only
 * lower runtime/RPC, protocol ownership and D27 arrival ports are fixtures.
 * No node, proof, native consensus or financial acceptance is claimed. */
import test,{mock} from 'node:test';
import assert from 'node:assert/strict';
import {createHash,generateKeyPairSync} from 'node:crypto';
import {nativeRuleCommitment} from '@lianum/engine/native/native-receipt-binding';
import {encodeDepositIntentInputs} from '@lianum/engine/execution/inputs/deposit-intent';
import {evmDeliveryFixture,signedDeliveryWire,TEST_EVM_SOLVER} from '../../../fixtures/chains/evm/transfers/test-fixtures/evm-delivery-wire.mjs';
import {decodeCanonicalEvmTransaction} from '../../../../src/chains/evm/contracts/transaction-wire-codec.mjs';
import {evmRuntimeCodeHash} from '../../../../src/chains/evm/contracts/evm-code-hash.mjs';
import {LOCAL_EVM_PROFILE} from '../../../../src/chains/evm/runtime/local-evm-profiles.mjs';
import {encodeEvmGraphDeliveryCallV1} from '../../../../src/chains/evm/dispatch/evm-graph-delivery-codec-v1.mjs';
const sha=value=>createHash('sha256').update(value).digest('hex'),addr=value=>sha(value).slice(0,40),quantity=value=>'0x'+BigInt(value).toString(16);
const backend=new URL('../../../../src/',import.meta.url),ZERO='0'.repeat(64),code='0x60006000';
const point=key=>{const value=key.export({format:'jwk'});return{x:Buffer.from(value.x,'base64url').toString('hex'),y:Buffer.from(value.y,'base64url').toString('hex')};};
const no=()=>{throw Error('HOST_UNUSED_PROTOCOL');};

test('HOST original MetaMorpho batch binds four exact routers, original observed facts and unchanged I84 limits',async t=>{
 const ports=[],routers=new WeakSet(),arrivals=new WeakMap(),wires=new Map(),receipts=new Map(),intents=new Map();let born=0,funded=false,canonicalChecks=0;
 const install=(relative,exports)=>ports.push(mock.module(new URL(relative,backend),{exports}));
 t.after(()=>{for(const port of ports.reverse())port.restore();});
 const context={genesisHash:sha('genesis'),ledgerNamespace:sha('ledger'),sourceLedgerNamespace:sha('ledger'),sourceAssetIdentity:sha('asset-id'),targetAssetIdentity:sha('share-id')};
 const fixtureABI={encodeFunctionData:(method,args)=>({method,args}),decodeFunctionResult:(_method,value)=>value};
 const first={address:'0x'+addr('asset'),code,iface:fixtureABI},vault={address:'0x'+addr('vault'),code,iface:fixtureABI},blue={address:'0x'+addr('blue'),code,iface:fixtureABI};
 const protocolFixture=Object.freeze({first,vault,blue,marketId:sha('market')});
 const header=number=>({number:quantity(number),hash:'0x'+sha('block-'+number),timestamp:'0x3e8',parentHash:'0x'+sha('block-'+(number-1))});
 const beforeView=number=>({header:header(number),poolObservation:{rawState:'same-state',rawHistory:'same-history',rawBacking:'same-backing'},authorizationRoots:['same-root']});
 const system=Object.freeze({ledgerNamespace:'0x'+context.ledgerNamespace,pools:[
  {asset:first.address,assetMetadata:{address:first.address,kind:'ERC20',genesisHash:'0x'+context.genesisHash},domain:{asset:context.sourceAssetIdentity}},
  {address:'0x'+addr('pool'),domain:{asset:context.targetAssetIdentity}},
 ]});
 const runtime=Object.freeze({metadata:{evmGenesis:'0x'+context.genesisHash},transactions:[],
  async signedTransaction(hash){assert.ok(wires.has(hash));return wires.get(hash);},
  async receipt(hash){assert.ok(receipts.has(hash));return receipts.get(hash);},
  async checkReceipt(value){assert.deepEqual(value,receipts.get(value.transactionHash));canonicalChecks++;},
  async assertCanonical(value){assert.deepEqual(value,receipts.get(value.transactionHash));return{...header(Number(BigInt(value.blockNumber))),transactions:[value.transactionHash]};},
  async code(){return code;},async balance(){return 999979000000000000n;},
  async call({to,data},at){
   const count=BigInt(Math.max(0,Number(BigInt(at))-49)),{method,args}=data;
   if(to===vault.address){
    if(method==='asset')return[first.address];if(method==='MORPHO')return[blue.address];
    if(method==='totalAssets')return[1000n+234n*count];if(method==='totalSupply')return[1000n+100n*count];
    if(method==='previewMint')return[234n];if(method==='maxMint')return[10000n];if(method==='balanceOf')return[0n];
   }
   if(to===first.address&&method==='balanceOf')return[args[0]===blue.address?1000n+234n*count:0n];
   if(to===blue.address&&method==='market')return[1000n+234n*count,1000n+100n*count,0n,0n,1000n,0n];
   if(to===blue.address&&method==='position')return[1000n+100n*count,0n,0n];
   throw Error('HOST_UNEXPECTED_PROTOCOL_READ');
  },
 });
 install('chains/evm/runtime/owned-evm-v2-runtime.mjs',{assertOwnedLocalEvmV2:async value=>assert.equal(value,runtime)});
 install('operations/deployments/system/deploy-system.mjs',{assertOwnedFlatSystem:(r,s)=>{assert.equal(r,runtime);assert.equal(s,system);}});
 install('operations/deployments/defi/official-protocol-fixture-v3.mjs',{assertOfficialProtocolFixture:(r,p)=>{assert.equal(r,runtime);assert.equal(p,protocolFixture);}});
 install('operations/deployments/defi/deploy-morpho-blue-position-v1.mjs',{assertOwnedOriginalMorphoBluePositionV1:no,readOwnedOriginalMorphoBluePositionContextV1:no});
 install('operations/deployments/defi/deploy-private-external-router-v1.mjs',{
  assertOwnedPrivateExternalRouterV1(value,expected){assert.ok(routers.has(value));assert.equal(expected.runtime,runtime);assert.equal(expected.system,system);assert.equal(expected.poolIndex,1);},
  async createOwnedPrivateExternalRouterV1(input){
   assert.equal(input.runtime,runtime);assert.equal(input.system,system);assert.equal(input.poolIndex,1);assert.equal(input.protocolFixture,protocolFixture);assert.equal(input.protocolKind,'METAMORPHO_V1_EXACT_SHARE_MINT');
   const identity={chainId:'31337',router:addr('batch-router-'+born++),solver:TEST_EVM_SOLVER,inputAsset:first.address.slice(2),outputAsset:vault.address.slice(2),protocol:vault.address.slice(2),targetPool:system.pools[1].address.slice(2),inputCode:sha('input-code'),outputCode:sha('output-code'),protocolCode:sha('output-code'),poolCode:sha('pool-code'),scope:sha('scope'),policy:sha('policy')};
   const router=Object.freeze({identity,address:'0x'+identity.router,protocolKind:input.protocolKind,fee:null,sourcePoolIndex:0,
    async read(){return{identity,context,routerRuntimeCodeSHA256:sha(Buffer.from(code.slice(2),'hex')),blockNumber:'0x64'};}});routers.add(router);return router;
  },
 });
 install('execution/account/reconciliation/flat-system-state.mjs',{async createFlatSystemStateReader({runtime:r,system:s,poolIndex}){
  assert.equal(r,runtime);assert.equal(s,system);assert.ok([0,1].includes(poolIndex));return{
   async read(){return{header:header(100),ledger:{commitments:funded?['HOST_FUNDED']:[],nullifiers:[],publicState:{actualAssetBalance:'1100',backedAmount:'1000',surplus:'100'}}};},
   async assertCurrent(view){assert.deepEqual(view.header,header(100));canonicalChecks++;},
   async readHistorical(at){return beforeView(Number(BigInt(at)));},
   async assertCanonical(view){assert.deepEqual(view,beforeView(Number(BigInt(view.header.number))));canonicalChecks++;},
  };
 }});
 install('chains/shared/observations/private-external-incoming-observer-v1.mjs',{
  async createPrivateExternalIncomingObserverV1({runtime:r,system:s,poolIndex,router}){
   assert.equal(r,runtime);assert.equal(s,system);assert.equal(poolIndex,1);assert.ok(routers.has(router));
   const observer=Object.freeze({async observe(query){const intent=intents.get('0x'+query.transactionHash);assert.equal(intent.descriptor.plan.identity.router,router.identity.router);
    const result={delivery:{publicInputs:intent.descriptor.plan.ownerPublicInputs,receiptCommitment:intent.receiptKeyCommitment},deliveryEvent:{inputSpent:'234'},assetObservation:{before:{solverInput:'10000'},after:{solverInput:'9766'}}};arrivals.set(result,observer);return result;}});return observer;
  },
  assertOwnedPrivateExternalIncomingObservationV1(value,{observer}){assert.equal(arrivals.get(value),observer);},
 });
 // Complete owners are imported after their lower fixtures. No constructor,
 // issuer or private membership map is rewritten or replaced.
 const observer=await import('../../../../src/chains/evm/vault/metamorpho-graph-delivery-observer-v1.mjs');
 const api=await import('../../../../src/chains/shared/dispatch/native-facts-peer.mjs');
 const attesters=Array.from({length:4},()=>generateKeyPairSync('ec',{namedCurve:'secp256k1'}));
 const rule={family:'3',genesis:context.genesisHash,asset:context.targetAssetIdentity,finalityKind:'3',minimumConfirmations:'1',maximumEvidenceLifetime:'120',maximumClockSkew:'30'};
 const siblings=[ZERO,ZERO,ZERO];let root=nativeRuleCommitment(rule);for(const sibling of siblings)root=sha(Buffer.concat([Buffer.from([1]),Buffer.from(root,'hex'),Buffer.from(sibling,'hex')]));
 const registry={profile:api.FACTS_QUORUM_PROFILE,hubDomain:sha('hub'),registryEpoch:'1',rulesRoot:root,keys:attesters.map(pair=>point(pair.publicKey))};
 const policy={ledgerNamespace:context.ledgerNamespace,hubDomain:registry.hubDomain,registryCommitment:api.nativeFactsRegistryCommitment(registry),rule};
 const clock={async read(){return{timestamp:'1000',head:sha('head-1000')};},async assertCurrent(value){assert.deepEqual(value,{timestamp:'1000',head:sha('head-1000')});}};
 const batch=await observer.createOwnedMetaMorphoGraphDeliveryBatchV4({runtime,system,poolIndex:1,protocolFixture,count:4});
 const originalRouters=observer.readOriginalMetaMorphoGraphBatchRoutersV4(batch,{runtime,system,poolIndex:1});assert.equal(born,4);assert.equal(new Set(originalRouters.map(v=>v.address)).size,4);
 assert.throws(()=>observer.readOriginalMetaMorphoGraphBatchFactsBindingsV4({...batch}));assert.throws(()=>observer.readOriginalMetaMorphoGraphBatchRoutersV4(batch,{runtime:{...runtime},system,poolIndex:1}));
 const foreignBatch=await observer.createOwnedMetaMorphoGraphDeliveryBatchV4({runtime,system,poolIndex:1,protocolFixture,count:2});
 assert.equal(born,6);funded=true;await assert.rejects(observer.createOwnedMetaMorphoGraphDeliveryBatchV4({runtime,system,poolIndex:1,protocolFixture,count:4}),/BEFORE_FUNDING/);assert.equal(born,6);funded=false;
 const recipients=[{recipientIndex:'1',sourceEndpoint:originalRouters[0].identity.solver,destinationEndpoint:originalRouters[0].identity.router}],peers=[];
 for(let index=0;index<3;index++){
  const signer=api.createNativeFactsSigner({privateKey:attesters[index].privateKey,policy}),config={policy,signerIndex:String(index),publicKey:signer.publicKey,recipients};
  let durable={revision:'0',state:api.createOriginalMetaMorphoBatchFactsInventoryV4(config,batch)},signs=0,commits=0;
  const input={policy,signerIndex:String(index),recipients,signer:{publicKey:signer.publicKey,async signFacts(value){assert.ok(durable.state.entries.some(row=>row.facts.nativeGid===value.nativeGid));signs++;return signer.signFacts(value);}},
   reader:{observe:async query=>batch.observeFacts({transactionHash:query.nativeId,calldataSHA256:wires.get('0x'+query.nativeId).calldataSHA256})},clock,
   store:{load:async()=>structuredClone(durable),async commit(value){assert.equal(value.expectedRevision,durable.revision);commits++;durable={revision:String(BigInt(durable.revision)+1n),state:structuredClone(value.nextState)};return structuredClone(durable);}}};
  const peer=await api.createOriginalMetaMorphoBatchFactsPeerV4(input,batch);peers.push({peer,input,snapshot:()=>structuredClone(durable),signs:()=>signs,commits:()=>commits});
  await assert.rejects(api.createNativeFactsPeer(input));assert.throws(()=>api.createOriginalMetaMorphoBatchFactsInventoryV4(config,{...batch}));
 }
 const requests=[];
 for(let slot=0;slot<5;slot++){
  const router=slot<4?originalRouters[slot]:{identity:{...originalRouters[0].identity,router:addr('foreign-router')},fee:null};
  const ownerPublicInputs=encodeDepositIntentInputs({scope:router.identity.scope,policy:router.identity.policy,validFrom:'800',validUntil:'1200',amount:'100',output:sha('Q-'+slot)});
  const descriptor=slot<4?observer.prepareOwnedMetaMorphoGraphDescriptorV1({observer:batch,router,route:{maximumInput:'234',outputAmount:'100',validFrom:'900',validUntil:'1100'},ownerPublicInputs}):{...requests[0].descriptor,plan:{...requests[0].descriptor.plan,identity:router.identity,ownerPublicInputs}};
  const intent={descriptor,receiptKeyCommitment:sha('K-'+slot),proof:'deadbeef'},data=encodeEvmGraphDeliveryCallV1(intent);
  const signed=signedDeliveryWire(evmDeliveryFixture().intent,{to:router.identity.router,data,gas:String(LOCAL_EVM_PROFILE.maxGas),nonce:String(slot)}),wire=decodeCanonicalEvmTransaction('0x'+signed.nativeWire);
  const transaction=Object.fromEntries(['chainId','from','to','nonce','gasPrice','gas','value','data'].map(k=>[k,wire[k]])),transactionHash='0x'+signed.nativeId;
  const retained={nativeWire:'0x'+signed.nativeWire,nativeId:transactionHash,transactionSHA256:signed.transactionSHA256,calldataSHA256:sha(Buffer.from(data.slice(2),'hex'))};
  const {number,hash,timestamp}=header(49+slot),receipt={transactionHash,status:'0x1',blockNumber:quantity(50+slot),blockHash:header(50+slot).hash,gasUsed:'0x5208',effectiveGasPrice:'0x3b9aca00',logs:[]};
  const prepared={genesis:runtime.metadata.evmGenesis,head:{number,hash,timestamp},transaction,unsignedWire:wire.unsignedWire,funds:{targetCodeHash:evmRuntimeCodeHash(code),balanceWei:'1000000000000000000'}};
  runtime.transactions.push({label:'gated EVM vault delivery',transactionHash,phase:'mined',prepared,signed:retained,senderNonce:quantity(slot),request:{from:wire.from,to:wire.to,data,gas:quantity(wire.gas),value:'0x0'},receipt});
  wires.set(transactionHash,retained);receipts.set(transactionHash,receipt);intents.set(transactionHash,intent);
  const request={family:'3',recipientIndex:'1',nativeId:signed.nativeId,wireKeyCommitment:intent.receiptKeyCommitment};requests.push({request,descriptor});
  if(slot<4){
   const facts=await batch.observeFacts({transactionHash:signed.nativeId,calldataSHA256:retained.calldataSHA256});assert.equal(facts.status,'observed',JSON.stringify(facts));
   observer.assertOwnedMetaMorphoGraphDeliveryFactsV1(facts,{observer:batch});assert.throws(()=>observer.assertOwnedMetaMorphoGraphDeliveryFactsV1({...facts},{observer:batch}));
   assert.throws(()=>observer.assertOwnedMetaMorphoGraphDeliveryFactsV1(facts,{observer:foreignBatch}),/ORIGINAL_FACTS_REQUIRED/);
   assert.throws(()=>observer.readOriginalEvmGraphDeliveryEconomicFactsV1(facts,foreignBatch),/ORIGINAL_ECONOMIC_FACTS/);
   assert.equal(observer.readOriginalEvmGraphDeliveryEconomicFactsV1(facts,batch).status,'OBSERVED');
   const certificates=await Promise.all(peers.map(p=>p.peer.certify(request))),collected=await api.createNativeFactsCollector({policy,registry,rulePath:{index:'0',siblings},clock}).collect({certificates});
   assert.equal(collected.frameHex.length,829*2);assert.deepEqual(collected.indexes,['0','1','2']);
   for(const p of peers){assert.equal(p.snapshot().state.entries.length,slot+1);assert.equal(p.signs(),slot+1);}
  }else{await assert.rejects(peers[0].peer.certify(request));assert.equal(peers[0].snapshot().state.entries.length,4);assert.equal(peers[0].signs(),4);}
 }
 for(const p of peers){const count=p.commits();assert.equal((await p.peer.auditInventory()).ready,true);assert.equal(p.commits(),count);}
 assert.throws(()=>api.createNativeFactsInventory({policy,signerIndex:'0',publicKey:point(attesters[0].publicKey),recipients:originalRouters.map(router=>({recipientIndex:'1',sourceEndpoint:router.identity.solver,destinationEndpoint:router.identity.router}))}));
 const before=peers[0].signs();await peers[0].peer.certify(requests[0].request);assert.equal(peers[0].signs(),before);assert.equal(peers[0].snapshot().state.entries.length,4);assert.ok(canonicalChecks>=24);
});
