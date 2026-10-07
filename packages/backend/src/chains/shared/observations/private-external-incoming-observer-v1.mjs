/** Fixed incoming D27 observer. No dispatch, key access, provider eligibility,
 * refund execution or PAEG reimbursement is issued by this capability. */
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {assertOwnedLocalEvmV2} from '../../evm/runtime/owned-evm-v2-runtime.mjs';
import {assertOwnedPoolAsset} from '../contracts/owned-pool-asset.mjs';
import {assertOwnedFlatSystem} from '../../../operations/deployments/system/deploy-system.mjs';
import {assertOwnedPrivateExternalRouterV1} from '../../../operations/deployments/defi/deploy-private-external-router-v1.mjs';
import {exactRecord} from '../../../execution/encoding/commitments.mjs';
import {createFlatSystemStateReader,decodeFlatWords} from '../../../execution/account/reconciliation/flat-system-state.mjs';
import {decodeDepositIntentInputs} from '../../../execution/account/preparation/deposit-intent.mjs';
import {decodePrivateExternalDeliveryCall,decodePrivateExternalDeliveryEvent} from '../../../defi/delivery/private-external-delivery.mjs';
import {flatOwnerIdentity,flatOwnerSnapshot,ownerDigest,ownerCopy,FLAT_OWNER_OBSERVATION_TRUST} from '../../../../../custody/src/signing/flat-owner-custody.mjs';
import {FLAT_OWNER_EXTERNAL_D27_DELIVERY_V1,inspectExternalIncomingLedgerV1} from '../../../../../custody/src/claims/flat-owner-external-incoming-v1.mjs';
import {publicKeccak256} from '../../../../../engine/src/cohorts/private-cohort-public-native.mjs';
import {decodeGenericBalanceStateAdvanced} from '../../../../../engine/src/execution/balances/generic-balance-observer.mjs';
const owned=new WeakMap(),observations=new WeakMap();
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const bare=(value,bytes=32)=>{assert.ok(typeof value==='string'&&new RegExp(`^0x[0-9a-f]{${bytes*2}}$`).test(value),'EXTERNAL_INCOMING_RPC_HEX');return value.slice(2);};
const hash=value=>{assert.ok(typeof value==='string'&&/^[0-9a-f]{64}$/.test(value),'EXTERNAL_INCOMING_HASH');return value;};
const quantity=value=>{assert.ok(typeof value==='string'&&/^0x(?:0|[1-9a-f][0-9a-f]*)$/.test(value)&&value.length<=66,'EXTERNAL_INCOMING_RPC_QUANTITY');return BigInt(value);};
const freeze=value=>{if(value&&typeof value==='object'&&!Object.isFrozen(value)){Object.values(value).forEach(freeze);Object.freeze(value);}return value;};
const detached=value=>freeze(ownerCopy(value));
const data=(signature,args=[])=>'0x'+publicKeccak256(Buffer.from(signature)).subarray(0,4).toString('hex')+args.map(value=>BigInt(value).toString(16).padStart(64,'0')).join('');
const uintResult=raw=>BigInt(decodeFlatWords(raw,1)[0]).toString();
export const isOwnedPrivateExternalIncomingObserverV1=value=>owned.has(value);
export function assertOwnedPrivateExternalIncomingObserverV1(observer,{runtime,system,poolIndex}) {
  const binding=owned.get(observer);
  assert.ok(binding&&binding.runtime===runtime&&binding.system===system&&binding.poolIndex===poolIndex,'EXTERNAL_INCOMING_ORIGINAL_OBSERVER_REQUIRED');
  assertOwnedFlatSystem(runtime,system);assertOwnedPrivateExternalRouterV1(binding.router,{runtime,system,poolIndex});
}
export function assertOwnedPrivateExternalIncomingObservationV1(value,{observer}) {
  assert.ok(owned.has(observer)&&observations.get(value)===observer,'EXTERNAL_INCOMING_ORIGINAL_OBSERVATION_REQUIRED');
}
export async function createPrivateExternalIncomingObserverV1(input) {
  assert.equal(arguments.length,1);exactRecord(input,['runtime','system','poolIndex','router']);
  const {runtime,system,poolIndex,router}=input;
  await assertOwnedLocalEvmV2(runtime);assertOwnedFlatSystem(runtime,system);assertOwnedPrivateExternalRouterV1(router,{runtime,system,poolIndex});
  assert.ok(poolIndex===0||poolIndex===1);const pool=system.pools[poolIndex],id=detached(router.identity);
  assertOwnedPoolAsset(runtime,pool.assetCapability);const asset=pool.assetCapability.metadata;
  assert.deepEqual(asset,pool.assetMetadata);assert.equal(asset.kind,'ERC20');assert.equal(asset.chainId,id.chainId);
  assert.equal(asset.address,'0x'+id.outputAsset);assert.equal(pool.address,'0x'+id.targetPool);
  assert.equal(pool.domain.scope,id.scope);assert.equal(pool.domain.policy,id.policy);assert.equal(pool.assetCodeHash,asset.codeHash);
  const identity=flatOwnerIdentity({pool:bare(pool.address,20),domain:pool.domain,domainCommitment:bare(pool.domainCommitment),
    assetBinding:{token:bare(asset.address,20),codeHash:bare(asset.codeHash)}}),identitySHA256=ownerDigest(identity);
  const reader=await createFlatSystemStateReader({runtime,system,poolIndex});
  const token=async(address,signature,args,at)=>uintResult(await runtime.call({to:'0x'+address,data:data(signature,args)},at));
  const routerWord=async(signature,args,at)=>uintResult(await runtime.call({to:router.address,data:data(signature,args)},at));
  async function readAt(at,call) {
    assertOwnedPrivateExternalRouterV1(router,{runtime,system,poolIndex});
    const head=await reader.readHistorical(at),pins=await router.read(at);
    assert.deepEqual(pins.identity,id);assert.equal(pins.blockHash,head.header.hash);
    const assetRead=await pool.assetCapability.read({holder:pool.address,blockNumber:at});
    assert.deepEqual(assetRead.metadata,asset);assert.equal(assetRead.holder,pool.address);
    assert.equal(assetRead.blockNumber,at);assert.equal(assetRead.blockHash,head.header.hash);
    const snapshot={identitySHA256,blockHash:head.head.hash,canonicalBlockHashBefore:head.head.hash,canonicalBlockHashAfter:head.head.hash,
      timestamp:head.head.timestamp,...Object.fromEntries(['rawState','rawHistory','rawBacking'].map(key=>[key,head.poolObservation[key]]))};
    const decoded=flatOwnerSnapshot(snapshot,identity);assert.equal(assetRead.balance,decoded.publicState.actualAssetBalance);
    const statement=decodeDepositIntentInputs(call.plan.ownerPublicInputs);
    const pending={
      solverInput:token(id.inputAsset,'balanceOf(address)',['0x'+id.solver],at),
      routerInput:token(id.inputAsset,'balanceOf(address)',[router.address],at),
      routerOutput:token(id.outputAsset,'balanceOf(address)',[router.address],at),
      solverAllowance:token(id.inputAsset,'allowance(address,address)',['0x'+id.solver,router.address],at),
      protocolAllowance:token(id.inputAsset,'allowance(address,address)',[router.address,'0x'+id.protocol],at),
      poolAllowance:token(id.outputAsset,'allowance(address,address)',[router.address,pool.address],at),
      consumed:routerWord('consumed(bytes32)',['0x'+call.receiptCommitment],at),
      inserted:pool.call('insertedCommitments(bytes32)',['0x'+statement.output],at).then(uintResult),
      authorizationNodes:pool.call('authorizationTreeNodes()',[],at),authorizationHistory:pool.call('authorizationRootHistory()',[],at),
    };
    const values=Object.fromEntries(await Promise.all(Object.entries(pending).map(async([key,value])=>[key,await value])));
    await reader.assertCanonical(head);await runtime.assertCanonical(head.header);
    return {head,snapshot,decoded,values,balances:{blockHash:head.head.hash,poolOutput:assetRead.balance,
      ...Object.fromEntries(['solverInput','routerInput','routerOutput','solverAllowance','protocolAllowance','poolAllowance'].map(key=>[key,values[key]]))}};
  }
  const observer=Object.freeze({async observe(input) {
    exactRecord(input,['transactionHash','calldataSHA256']);const query=detached(input);hash(query.transactionHash);hash(query.calldataSHA256);
    assertOwnedPrivateExternalIncomingObserverV1(observer,{runtime,system,poolIndex});await assertOwnedLocalEvmV2(runtime);
    const genesis=await runtime.block('0x0');await runtime.assertCanonical(genesis);
    assert.equal(genesis.hash,runtime.metadata.evmGenesis,'EXTERNAL_INCOMING_GENESIS');
    const txHash='0x'+query.transactionHash;
    const [transaction,receipt]=await Promise.all([runtime.transaction(txHash),runtime.receipt(txHash)]);
    if(transaction===null||receipt===null||transaction.blockHash===null||receipt.status==='0x0')return null;
    assert.equal(transaction.hash,txHash);assert.equal(receipt.transactionHash,txHash);assert.equal(receipt.status,'0x1');assert.equal(receipt.contractAddress,null);
    assert.equal(transaction.from,'0x'+id.solver);assert.equal(transaction.to,router.address);
    assert.equal(receipt.from,transaction.from);assert.equal(receipt.to,transaction.to);assert.equal(quantity(transaction.value),0n);
    assert.equal(quantity(transaction.chainId).toString(),id.chainId);
    assert.equal(sha(Buffer.from(transaction.input.slice(2),'hex')),query.calldataSHA256,'EXTERNAL_INCOMING_CALLDATA');
    assert.equal(transaction.blockHash,receipt.blockHash);assert.equal(transaction.blockNumber,receipt.blockNumber);
    assert.equal(transaction.transactionIndex,receipt.transactionIndex);assert.equal(quantity(receipt.transactionIndex),0n);
    await runtime.checkReceipt(receipt);const header=await runtime.assertCanonical(receipt),height=quantity(header.number);
    assert.ok(height>0n);assert.equal(header.number,receipt.blockNumber);assert.deepEqual(header.transactions,[txHash],'EXTERNAL_INCOMING_SINGLE_TRANSACTION_BLOCK');
    const call=decodePrivateExternalDeliveryCall({calldata:transaction.input,identity:id,protocolKind:router.protocolKind,fee:router.fee});
    const matches=[];
    const topic='0x'+publicKeccak256(Buffer.from('Delivered(bytes32,bytes32,bytes32,uint256,uint64)')).toString('hex');
    for(const [index,log]of receipt.logs.entries()) {
      assert.equal(log.transactionHash,txHash);assert.equal(log.blockHash,header.hash);assert.equal(log.blockNumber,header.number);
      assert.equal(log.transactionIndex,receipt.transactionIndex);assert.equal(log.removed,false);assert.equal(quantity(log.logIndex),BigInt(index));
      if(log.address===router.address&&log.topics[0]===topic)matches.push({index,log});
    }
    assert.equal(matches.length,1,'EXTERNAL_INCOMING_SOLE_DELIVERY');
    const emitted=decodePrivateExternalDeliveryEvent({...Object.fromEntries(['address','topics','data'].map(key=>[key,matches[0].log[key]])),call});
    const [before,after]=await Promise.all([readAt('0x'+(height-1n).toString(16),call),readAt(header.number,call)]);
    assert.equal(header.parentHash,before.head.header.hash);assert.equal(header.hash,after.head.header.hash);
    assert.equal(before.values.consumed,'0');assert.equal(after.values.consumed,'1');
    assert.equal(before.values.inserted,'0');assert.equal(after.values.inserted,'1');
    assert.equal(after.values.authorizationNodes,before.values.authorizationNodes);assert.equal(after.values.authorizationHistory,before.values.authorizationHistory);
    assert.equal(await system.verify('deposit_intent',Buffer.from(call.proof,'hex'),call.plan.ownerPublicInputs,before.head.header.number),true,'EXTERNAL_INCOMING_D27_PROOF');
    const stateAdvanced=decodeGenericBalanceStateAdvanced(receipt,pool.address);
    const observation=detached({kind:FLAT_OWNER_EXTERNAL_D27_DELIVERY_V1,identitySHA256,
      transaction:{hash:query.transactionHash,from:id.solver,to:id.router,value:'0',calldata:transaction.input,
        ...Object.fromEntries(['chainId','nonce','gas','gasPrice'].map(key=>[key,quantity(transaction[key]).toString()]))},
      receipt:{transactionHash:query.transactionHash,blockHash:bare(header.hash),blockNumber:height.toString(),status:1},
      chainContext:{genesisHash:bare(genesis.hash),parentBlockHash:bare(header.parentHash),minimumConfirmations:'1',classification:FLAT_OWNER_OBSERVATION_TRUST},
      before:before.snapshot,after:after.snapshot,stateAdvanced,
      delivery:{identity:id,protocolKind:router.protocolKind,fee:router.fee,descriptor:call.descriptor,receiptCommitment:call.receiptCommitment,publicInputs:call.plan.ownerPublicInputs},
      deliveryEvent:{address:id.router,transactionHash:query.transactionHash,blockHash:bare(header.hash),position:matches[0].index,
        ...Object.fromEntries(['descriptor','ownerOutput','receiptCommitment','inputSpent','outputAmount'].map(key=>[key,emitted[key]]))},
      assetObservation:{kind:'PRIVATE_EXTERNAL_D27_INCOMING',token:id.outputAsset,codeHash:bare(asset.codeHash),pool:id.targetPool,
        inputAsset:id.inputAsset,inputCodeSHA256:id.inputCode,router:id.router,solver:id.solver,before:before.balances,after:after.balances}});
    inspectExternalIncomingLedgerV1(observation,identity);
    // Fresh tip/code check after the historical proof. This establishes only
    // the owned local one-confirmation policy, never external consensus finality.
    const current=await reader.read(),pins=await router.read(current.header.number);
    assert.deepEqual(pins.identity,id);assert.equal(pins.blockHash,current.header.hash);assert.ok(quantity(current.header.number)>=height);
    await runtime.checkReceipt(receipt);await reader.assertCanonical(before.head);await reader.assertCanonical(after.head);await reader.assertCurrent(current);
    observations.set(observation,observer);return observation;
  }});
  owned.set(observer,{runtime,system,poolIndex,router});return observer;
}
