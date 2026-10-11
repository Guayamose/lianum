/** Pure shared-I84 provider binding. These functions validate DATA, never mint
 * a signer, lease, source reader, custody claim, proof acceptance or authority. */
import assert from 'node:assert/strict';
import { createHash, createPublicKey } from 'node:crypto';
import { exactRecord, bytes32, validateStruct, createCommitmentCodec } from '@lianum/components/encoding/commitments';
import { cloneInput, frozenInput, inputUint } from "@lianum/components/plain-input";
import { readyDescriptorWords } from "../../../execution/account/preparation/readiness-inputs.mjs";
import { decodeStatement, joinReadiness } from '@lianum/components/encoding/statements';
import { assertCombinedAdapterRegistrationsV2 } from '../../../claims/protocol/registry-envelope-v2.mjs';
import { profileCommitment, chainDomain, registryCommitment } from '../transfers/generic-native-value-v2.mjs';
import { PROFILE_SCHEMA as EVM_SCHEMA, CHAINS } from '../../evm/transfers/evm-native-value-v2.mjs';
import { evmFundingEndpointCommitment } from '../../evm/dispatch/evm-facts-binding.mjs';
import { bindOriginalEvmGraphTransfer, encodeEvmGraphTransferMemo } from '../../evm/transfers/evm-graph-transfer-binding.mjs';
import { decodeEvmSignedTransactionWire } from '../../evm/transfers/evm-signed-transaction-wire.mjs';
import { ownedEvmNativeValueAuditCommitments } from '../../evm/transfers/owned-evm-native-value-profile.mjs';
import { PROFILE_SCHEMA as TRON_SCHEMA, bindOriginalTronGraphTransfer, tronGraphEndpoint, tronGraphCustody } from '../../tron/transfers/tron-native-graph-profile.mjs';
import { validateOwnedTronPreparation, OWNED_TRON_NATIVE_VALUE_PROFILE } from '../../tron/transfers/owned-tron-native-value-profile.mjs';
import { decodeTronNativeTransferWire } from '../../tron/transfers/tron-native-transfer-wire.mjs';
import { receiptKeyCommitment, nativeAdmissionNullifier, nativeCustodyCommitment } from '@lianum/engine/native/native-receipt-binding';
import { nativeTransferActionCommitment } from '@lianum/engine/execution/native/dispatch/native-capsules';
import { nativeProviderIdentity, nativeReadyStatementDigest, nativeDeliveryRiskCommitment, NATIVE_ADMISSION_LOSS_CLAUSE }
  from '@lianum/engine/execution/native/dispatch/native-admission';
import { nativeQuorumRegistryCommitment, createNativeQuorumHostVerifier } from '@lianum/engine/evidence/native-quorum';
export const DISPATCH_PROFILE = 'LIANUM_WRAPPED_CLAIM_ORIGINAL_GRAPH_DISPATCH_V1';
export const sha256 = v => createHash('sha256').update(v).digest('hex');
export const canonicalData = value => JSON.stringify((function sort(v){return Array.isArray(v)?v.map(sort):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().map(k=>[k,sort(v[k])])):v;})(value));
export const equal = (a,b) => assert.deepEqual(a,b,'NATIVE_VALUE_DISPATCH_REBOUND');
const frozen = v => frozenInput(cloneInput(v));
function hex(v,n) { assert.equal(typeof v,'string'); assert.equal(v.length,n*2); assert.match(v,/^[0-9a-f]+$/); return Buffer.from(v,'hex'); }
function address(v,evm) { const raw=evm ? (assert.ok(v.startsWith('0x')),v.slice(2)) : v; hex(raw,evm?20:21);
  assert.ok(/[1-9a-f]/.test(raw)); if(!evm)assert.ok(raw.startsWith('41')); return raw; }
function wire(v,maximum,prefixed=false) { assert.equal(typeof v,'string'); const b=prefixed?(assert.ok(v.startsWith('0x')),v.slice(2)):v;
  assert.ok(b.length>0&&b.length<=maximum*2&&/^(?:[0-9a-f]{2})+$/.test(b),'NATIVE_VALUE_DISPATCH_WIRE'); return Buffer.from(b,'hex'); }
export function normalizeNativeValueDispatchBinding(raw) {
  const b=cloneInput(raw); exactRecord(b,['domain','pool','registry','profiles','profileCommitment','providerKey','native','quote','acceptedLossClause','leaseId']);
  validateStruct('domain',b.domain); address('0x'+b.pool,true); bytes32(b.leaseId,true); bytes32(b.profileCommitment,true);
  assert.equal(b.domain.ledgerNamespace,b.domain.hubDomain,'NATIVE_VALUE_DISPATCH_NAMESPACE');
  assert.equal(b.domain.hubDomain,b.registry.quorum.hubDomain,'NATIVE_VALUE_DISPATCH_HUB');
  assert.equal(registryCommitment(b.registry),b.domain.registryCommitment,'NATIVE_VALUE_DISPATCH_WRAPPED_REGISTRY');
  assertCombinedAdapterRegistrationsV2({registry:b.registry,profiles:b.profiles});
  createNativeQuorumHostVerifier({registry:b.registry.quorum,expectedRegistryCommitment:nativeQuorumRegistryCommitment(b.registry.quorum)});
  const entry=b.profiles.find(e=>e.kind==='native-value'&&profileCommitment(e.profile)===b.profileCommitment); assert.ok(entry,'NATIVE_VALUE_DISPATCH_REGISTERED_PROFILE');
  const p=entry.profile,evm=p.schema===EVM_SCHEMA;
  exactRecord(b.providerKey,['x','y']); createPublicKey({format:'jwk',key:{kty:'EC',crv:'secp256k1',x:hex(b.providerKey.x,32).toString('base64url'),y:hex(b.providerKey.y,32).toString('base64url')}});
  exactRecord(b.native,['solverEndpoint','recipientEndpoint']); const sourceRaw=address(b.native.solverEndpoint,evm),targetRaw=address(b.native.recipientEndpoint,evm);
  assert.notEqual(sourceRaw,targetRaw,'NATIVE_VALUE_DISPATCH_SELF_TRANSFER');
  const endpoint=a=>evm?evmFundingEndpointCommitment({genesis:p.genesis,asset:p.asset,address:a}):tronGraphEndpoint(p.genesis,p.asset,a);
  const source=endpoint(sourceRaw),destination=endpoint(targetRaw);
  exactRecord(b.quote,['action','payoutCommitment','deliveryRiskSalt']); const a=b.quote.action; nativeTransferActionCommitment(a);
  bytes32(b.quote.payoutCommitment,true);bytes32(b.quote.deliveryRiskSalt,true);
  assert.equal(b.acceptedLossClause,NATIVE_ADMISSION_LOSS_CLAUSE,'NATIVE_VALUE_DISPATCH_EXPLICIT_LOSS_ACCEPTANCE');
  const terms={chainDomain:chainDomain(p),signerIdentity:nativeProviderIdentity(b.providerKey),sourceCommitment:source,destinationCommitment:destination,custodyKind:1,
    custodyCommitment:evm?nativeCustodyCommitment({family:'3',genesis:p.genesis,asset:p.asset,sourceCommitment:source,destinationCommitment:destination})
      :tronGraphCustody({genesis:p.genesis,asset:p.asset,sourceCommitment:source,destinationCommitment:destination})};
  for(const [k,v] of Object.entries(terms))assert.equal(a[k],v,'NATIVE_VALUE_DISPATCH_ACTION_TERMS');
  assert.ok(inputUint(a.amount,evm?128:63)>0n,'NATIVE_VALUE_DISPATCH_AMOUNT');
  assert.ok(inputUint(a.executionFrom)<inputUint(a.executionUntil)&&inputUint(a.executionUntil)<=inputUint(a.settleBefore),'NATIVE_VALUE_DISPATCH_WINDOW');
  assert.equal(a.deliveryRiskCommitment,nativeDeliveryRiskCommitment({clause:b.acceptedLossClause,hubDomain:b.domain.hubDomain,
    registryCommitment:b.domain.registryCommitment,chainDomain:a.chainDomain,sourceCommitment:source,destinationCommitment:destination,amount:a.amount,
    scope:b.domain.scope,policy:b.domain.policy,asset:b.domain.asset,payoutCommitment:b.quote.payoutCommitment,settleBefore:a.settleBefore,salt:b.quote.deliveryRiskSalt}),'NATIVE_VALUE_DISPATCH_LOSS_TERMS');
  return frozenInput(b);
}
export function selectedNativeValueProfile(binding) { return binding.profiles.find(e=>e.kind==='native-value'&&profileCommitment(e.profile)===binding.profileCommitment).profile; }
export function nativeValueBindingDigest(binding) { return sha256(canonicalData(normalizeNativeValueDispatchBinding(binding))); }
function proof(raw,relation) { exactRecord(raw,['proof','publicInputs']);wire(raw.proof,1048576);assert.equal(raw.proof.length%64,0);return decodeStatement(relation,raw.publicInputs); }
/** Pure P42/R50/opening check; actual proof verification belongs to the fixed
 * original system. The returned immutable intent never contains the K secret. */
export async function bindNativeValueDispatchRequest(rawBinding,raw,{hashFields}) {
  const b=normalizeNativeValueDispatchBinding(rawBinding),r=cloneInput(raw);
  exactRecord(r,['dependencyProof','readyProof','readinessOpening','action','deliveryRiskSalt','receiptSpendSecret']);
  const dependency=proof(r.dependencyProof,'dependency'),ready=proof(r.readyProof,'ready');joinReadiness(dependency,ready);
  exactRecord(r.readinessOpening,['domain','descriptor','readinessBlind']); const o=r.readinessOpening,d=validateStruct('ready',o.descriptor);
  equal(o.domain,b.domain);bytes32(o.readinessBlind,true); const codec=createCommitmentCodec({hashFields});
  assert.equal(await codec.domainCommitment(b.domain),ready.domainCommitment,'NATIVE_VALUE_DISPATCH_DOMAIN_OPENING');
  assert.equal(await codec.readinessCommitment(ready.domainCommitment,ready.joinCommitment,o.readinessBlind,d),ready.readinessCommitment,'NATIVE_VALUE_DISPATCH_READY_SEAL');
  for(const k of ['scope','policy','asset','hubDomain','registryCommitment'])assert.equal(d[k],b.domain[k],'NATIVE_VALUE_DISPATCH_READY_DOMAIN');
  equal(r.action,b.quote.action);assert.equal(r.deliveryRiskSalt,b.quote.deliveryRiskSalt,'NATIVE_VALUE_DISPATCH_RISK');
  assert.equal(d.payoutCommitment,b.quote.payoutCommitment,'NATIVE_VALUE_DISPATCH_PAYOUT');
  assert.equal(d.snapshotDigest,ready.checkpoint);assert.equal(d.readyFrom,ready.readyFrom);assert.equal(d.readyUntil,ready.readyUntil);
  assert.equal(d.actionCommitment,nativeTransferActionCommitment(r.action));assert.equal(d.chainDomain,r.action.chainDomain);assert.equal(d.evidencePolicy,b.profileCommitment);
  bytes32(d.localCommitment,true);bytes32(d.dispatchId,true);
  assert.equal(receiptKeyCommitment({ledgerNamespace:b.domain.ledgerNamespace,secret:r.receiptSpendSecret}),r.action.receiptKeyCommitment,'NATIVE_VALUE_DISPATCH_K');
  assert.ok(inputUint(r.action.executionFrom)<=inputUint(ready.readyFrom)&&inputUint(ready.readyFrom)<inputUint(ready.readyUntil)
    &&inputUint(ready.readyUntil)<=inputUint(r.action.executionUntil)&&inputUint(ready.readyUntil)<=inputUint(r.action.settleBefore),'NATIVE_VALUE_DISPATCH_READY_WINDOW');
  return frozen({dependency,ready,readinessOpening:o,action:r.action,deliveryRiskSalt:r.deliveryRiskSalt,
    readyStatement:nativeReadyStatementDigest([...readyDescriptorWords(d)]),dependencyProofSHA256:sha256(Buffer.from(r.dependencyProof.proof,'hex')),
    readyProofSHA256:sha256(Buffer.from(r.readyProof.proof,'hex')),leaseId:b.leaseId});
}
const uintBytes=n=>{const v=BigInt(n);if(v===0n)return Buffer.alloc(0);const h=v.toString(16);return Buffer.from(h.length%2?'0'+h:h,'hex');};
function rlp(value) { const prefix=(n,base)=>n<56?Buffer.from([base+n]):Buffer.concat([Buffer.from([base+55+uintBytes(n).length]),uintBytes(n)]);
  if(Array.isArray(value)){const body=Buffer.concat(value.map(rlp));return Buffer.concat([prefix(body.length,192),body]);}
  return value.length===1&&value[0]<128?value:Buffer.concat([prefix(value.length,128),value]); }
const varint=n=>{n=BigInt(n);const a=[];do{let b=Number(n&127n);n>>=7n;a.push(b|(n?128:0));}while(n);return Buffer.from(a);};
const pb=(n,type,b)=>Buffer.concat([varint(BigInt(n)*8n+BigInt(type)),...(type===2?[varint(b.length),b]:[varint(b)])]);
/** Narrow canonical unsigned encodings only. No arbitrary calldata/access-list,
 * extra contract, permission selection or generic byte-signing input exists. */
export function nativeValueUnsignedWire(rawBinding,rawTransaction) {
  const b=normalizeNativeValueDispatchBinding(rawBinding),p=selectedNativeValueProfile(b),t=cloneInput(rawTransaction),a=b.quote.action;
  if(p.schema===EVM_SCHEMA){
    exactRecord(t,['type','chainId','nonce','from','to','value','gas','fees','wireKeyCommitment']); assert.ok(['0','1','2'].includes(t.type));
    assert.equal(t.chainId,p.chainId);assert.equal(t.from,b.native.solverEndpoint);assert.equal(t.to,b.native.recipientEndpoint);assert.equal(t.value,a.amount);
    assert.equal(t.wireKeyCommitment,a.receiptKeyCommitment);for(const k of ['chainId','nonce','gas','value'])inputUint(t[k],256);
    assert.ok(BigInt(t.gas)>=23800n,'NATIVE_VALUE_DISPATCH_GAS_FLOOR');
    const names=t.type==='2'?['maxPriorityFeePerGas','maxFeePerGas']:['gasPrice'];exactRecord(t.fees,names);for(const k of names)inputUint(t.fees[k],256);
    if(t.type==='2')assert.ok(BigInt(t.fees.maxPriorityFeePerGas)<=BigInt(t.fees.maxFeePerGas),'NATIVE_VALUE_DISPATCH_FEE_CAP');
    const to=Buffer.from(t.to.slice(2),'hex'),data=Buffer.from(encodeEvmGraphTransferMemo(t.wireKeyCommitment).slice(2),'hex');
    const values=t.type==='0'?[uintBytes(t.nonce),uintBytes(t.fees.gasPrice),uintBytes(t.gas),to,uintBytes(t.value),data,uintBytes(t.chainId),Buffer.alloc(0),Buffer.alloc(0)]
      :[uintBytes(t.chainId),uintBytes(t.nonce),...names.map(k=>uintBytes(t.fees[k])),uintBytes(t.gas),to,uintBytes(t.value),data,[]];
    return '0x'+Buffer.concat([...(t.type==='0'?[]:[Buffer.from([Number(t.type)])]),rlp(values)]).toString('hex');
  }
  exactRecord(t,['ownerAddress','recipientAddress','amountSun','refBlockBytes','refBlockHash','timestampMs','expirationMs','permissionId','wireKeyCommitment']);
  assert.equal(t.ownerAddress,b.native.solverEndpoint);assert.equal(t.recipientAddress,b.native.recipientEndpoint);assert.equal(t.amountSun,a.amount);
  assert.equal(t.wireKeyCommitment,a.receiptKeyCommitment);assert.equal(t.permissionId,'0');
  assert.ok(inputUint(t.timestampMs,63)>0n&&inputUint(t.timestampMs,63)<inputUint(t.expirationMs,63));
  const transfer=Buffer.concat([pb(1,2,hex(t.ownerAddress,21)),pb(2,2,hex(t.recipientAddress,21)),pb(3,0,BigInt(t.amountSun))]);
  const parameter=Buffer.concat([pb(1,2,Buffer.from('type.googleapis.com/protocol.TransferContract')),pb(2,2,transfer)]);
  const contract=Buffer.concat([pb(1,0,1n),pb(2,2,parameter)]);
  return Buffer.concat([pb(1,2,hex(t.refBlockBytes,2)),pb(4,2,hex(t.refBlockHash,8)),pb(8,0,BigInt(t.expirationMs)),
    pb(10,2,hex(t.wireKeyCommitment,32)),pb(11,2,contract),pb(14,0,BigInt(t.timestampMs))]).toString('hex');
}
export function assertNativeValuePrepared(rawBinding,raw) {
  const b=normalizeNativeValueDispatchBinding(rawBinding),p=selectedNativeValueProfile(b),v=cloneInput(raw);
  exactRecord(v,['leaseId','profileCommitment','genesis','nativeHead','transaction','unsignedWire','liquidity']);
  assert.equal(v.leaseId,b.leaseId);assert.equal(v.profileCommitment,b.profileCommitment);assert.equal(v.genesis,p.genesis);
  exactRecord(v.nativeHead,['hash','number','timestamp']);bytes32(v.nativeHead.hash,true);inputUint(v.nativeHead.number);inputUint(v.nativeHead.timestamp);
  assert.equal(v.unsignedWire,nativeValueUnsignedWire(b,v.transaction),'NATIVE_VALUE_DISPATCH_UNSIGNED_WIRE');
  const f=v.liquidity;exactRecord(f,['sourceEndpoint','balanceAtomic','maximumFeeAtomic','estimatedFeeAtomic','ownershipCommitment','observationCommitment']);
  assert.equal(f.sourceEndpoint,b.native.solverEndpoint,'NATIVE_VALUE_DISPATCH_SOLVER_OWN_LIQUIDITY');
  const balance=inputUint(f.balanceAtomic,256),fee=inputUint(f.maximumFeeAtomic,256),estimate=inputUint(f.estimatedFeeAtomic,256);
  bytes32(f.ownershipCommitment,true);bytes32(f.observationCommitment,true);
  assert.ok(estimate<=fee&&balance>=BigInt(b.quote.action.amount)+fee,'NATIVE_VALUE_DISPATCH_SOLVER_FUNDS');
  if(p.schema===EVM_SCHEMA)assert.equal(fee,BigInt(v.transaction.gas)*BigInt(v.transaction.fees[v.transaction.type==='2'?'maxFeePerGas':'gasPrice']),'NATIVE_VALUE_DISPATCH_EXACT_FEE_CAP');
  else {assert.ok(BigInt(v.transaction.expirationMs)>BigInt(v.nativeHead.timestamp)*1000n,'NATIVE_VALUE_DISPATCH_EXPIRED');}
  return frozenInput(v);
}
/** Reuses the original chain-native parsers. Signature bytes may not replace
 * preparation, memo K, canonical txid/GID, native profile or endpoints. */
export function assertNativeValueSigned(rawBinding,rawPrepared,raw) {
  const b=normalizeNativeValueDispatchBinding(rawBinding),p=selectedNativeValueProfile(b),prepared=assertNativeValuePrepared(b,rawPrepared),v=cloneInput(raw);
  exactRecord(v,['nativeWire']);let bound;
  if(p.schema===EVM_SCHEMA){const decoded=decodeEvmSignedTransactionWire(v.nativeWire),t=prepared.transaction;
    bound=bindOriginalEvmGraphTransfer({nativeWire:v.nativeWire,expected:{nativeId:decoded.nativeId.slice(2),genesisHash:'0x'+p.genesis,...t}},
      {chain:CHAINS[p.chainId][0],genesisHash:'0x'+p.genesis});
  }else{const decoded=decodeTronNativeTransferWire(v.nativeWire);
    assert.equal(decoded.rawDataHex,prepared.unsignedWire,'NATIVE_VALUE_DISPATCH_SIGNED_RAW_DATA');
    const {permissionId,...t}=prepared.transaction;
    bound=bindOriginalTronGraphTransfer({nativeWire:v.nativeWire,expected:{nativeId:decoded.nativeId,transactionSHA256:decoded.transactionSHA256,...t}},p.genesis);
  }
  assert.equal(bound.identity.asset,p.asset);for(const [k,value] of Object.entries(bound.actionTerms))assert.equal(value,b.quote.action[k],'NATIVE_VALUE_DISPATCH_SIGNED_ACTION');
  return frozen({nativeWire:v.nativeWire,nativeId:bound.identity.nativeId,transactionSHA256:bound.identity.transactionSHA256,nativeGid:bound.identity.nativeGid,
    preparationSHA256:sha256(canonicalData(prepared))});
}
export function nativeValueDispatchNullifier(rawBinding,signed,secret) {
  const b=normalizeNativeValueDispatchBinding(rawBinding);bytes32(signed.nativeGid,true);
  assert.equal(receiptKeyCommitment({ledgerNamespace:b.domain.ledgerNamespace,secret}),b.quote.action.receiptKeyCommitment,'NATIVE_VALUE_DISPATCH_K');
  return nativeAdmissionNullifier({ledgerNamespace:b.domain.ledgerNamespace,secret,nativeGid:signed.nativeGid});
}
/** Exact private scope consumed once by the separate original EVM runtime. */
export function nativeValueEvmScopeBinding(rawBinding,intent) {
  const b=normalizeNativeValueDispatchBinding(rawBinding),p=selectedNativeValueProfile(b);assert.equal(p.schema,EVM_SCHEMA,'NATIVE_VALUE_DISPATCH_EVM_ONLY');
  return frozen({leaseId:b.leaseId,profileCommitment:b.profileCommitment,chainId:p.chainId,genesis:p.genesis,
    actionCommitment:intent.readinessOpening.descriptor.actionCommitment,receiptKeyCommitment:intent.action.receiptKeyCommitment,
    readyStatement:intent.readyStatement,dependencyProofSHA256:intent.dependencyProofSHA256,readyProofSHA256:intent.readyProofSHA256});
}
export function normalizeOriginalNativeValueEvmPreparation(rawBinding,intent,raw) {
  const b=normalizeNativeValueDispatchBinding(rawBinding),v=cloneInput(raw);
  exactRecord(v,['profile','binding','genesis','head','transaction','unsignedWire','funds']);
  assert.equal(v.profile,'LIANUM_OWNED_LOCAL_EVM_NATIVE_VALUE_V1');equal(v.binding,nativeValueEvmScopeBinding(b,intent));
  assert.equal(v.genesis,'0x'+selectedNativeValueProfile(b).genesis);exactRecord(v.head,['number','hash','timestamp']);
  assert.match(v.head.hash,/^0x[0-9a-f]{64}$/);
  for(const k of ['number','timestamp'])assert.match(v.head[k],/^0x(?:0|[1-9a-f][0-9a-f]*)$/);
  const t=v.transaction;exactRecord(t,['chainId','from','to','nonce','gasPrice','gas','value','data']);
  assert.equal(t.data,encodeEvmGraphTransferMemo(b.quote.action.receiptKeyCommitment));
  const f=v.funds;exactRecord(f,['balanceWei','estimatedGas','targetCodeHash','maximumFeeWei','estimatedFeeWei','ownershipCommitment','observationCommitment']);
  assert.match(f.targetCodeHash,/^0x[0-9a-f]{64}$/);assert.ok(inputUint(f.estimatedGas,256)>0n&&BigInt(f.estimatedGas)<=BigInt(t.gas));
  assert.equal(BigInt(f.estimatedFeeWei),BigInt(f.estimatedGas)*BigInt(t.gasPrice));
  equal({ownershipCommitment:f.ownershipCommitment,observationCommitment:f.observationCommitment},ownedEvmNativeValueAuditCommitments({binding:nativeValueEvmScopeBinding(b,intent),
    transaction:Object.fromEntries(['chainId','from','to','nonce','gasPrice','gas','value','data'].map(k=>[k,t[k]])),
    head:Object.fromEntries(['number','hash','timestamp'].map(k=>[k,v.head[k]])),
    balanceWei:f.balanceWei,estimatedGas:f.estimatedGas,targetCodeHash:f.targetCodeHash}));
  const nextTime=BigInt(v.head.timestamp)+1n;
  assert.ok(BigInt(b.quote.action.executionFrom)<=nextTime&&nextTime<BigInt(b.quote.action.executionUntil)
    &&BigInt(intent.ready.readyFrom)<=nextTime&&nextTime<BigInt(intent.ready.readyUntil),'NATIVE_VALUE_ORIGINAL_NATIVE_INCLUSION_WINDOW');
  return assertNativeValuePrepared(b,{leaseId:b.leaseId,profileCommitment:b.profileCommitment,genesis:selectedNativeValueProfile(b).genesis,
    nativeHead:{hash:v.head.hash.slice(2),number:BigInt(v.head.number).toString(),timestamp:BigInt(v.head.timestamp).toString()},
    transaction:{type:'0',chainId:t.chainId,nonce:t.nonce,from:t.from,to:t.to,value:t.value,gas:t.gas,fees:{gasPrice:t.gasPrice},wireKeyCommitment:b.quote.action.receiptKeyCommitment},
    unsignedWire:v.unsignedWire,liquidity:{sourceEndpoint:t.from,balanceAtomic:f.balanceWei,maximumFeeAtomic:f.maximumFeeWei,estimatedFeeAtomic:f.estimatedFeeWei,
      ownershipCommitment:f.ownershipCommitment,observationCommitment:f.observationCommitment}});
}

/** Exact fixed Tron scope. It is public DATA only; the original request identity
 * is issued exclusively by the real provider's private execution closure. */
export function nativeValueTronScopeBinding(rawBinding,intent) {
  const b=normalizeNativeValueDispatchBinding(rawBinding),p=selectedNativeValueProfile(b);
  assert.equal(p.schema,TRON_SCHEMA,'NATIVE_VALUE_DISPATCH_TRON_ONLY');
  return frozen({leaseId:b.leaseId,profileCommitment:b.profileCommitment,genesis:p.genesis,
    actionCommitment:intent.readinessOpening.descriptor.actionCommitment,receiptKeyCommitment:intent.action.receiptKeyCommitment,
    readyStatement:intent.readyStatement,dependencyProofSHA256:intent.dependencyProofSHA256,readyProofSHA256:intent.readyProofSHA256});
}
export function normalizeOriginalNativeValueTronPreparation(rawBinding,intent,raw) {
  const b=normalizeNativeValueDispatchBinding(rawBinding),p=selectedNativeValueProfile(b);
  const v=validateOwnedTronPreparation(cloneInput(raw));
  assert.equal(v.profile,OWNED_TRON_NATIVE_VALUE_PROFILE);equal(v.binding,nativeValueTronScopeBinding(b,intent));
  assert.equal(v.genesis,p.genesis);const t=v.transaction,f=v.funds;
  // Real Java-Tron wall-clock timestamps and exact original validity only. We
  // never predict/relabel inclusion or widen the already approved P/R/Action.
  const from=[BigInt(b.quote.action.executionFrom),BigInt(intent.ready.readyFrom)].reduce((a,b)=>a>b?a:b)*1000n;
  const until=[BigInt(b.quote.action.executionUntil),BigInt(intent.ready.readyUntil),BigInt(b.quote.action.settleBefore)].reduce((a,b)=>a<b?a:b)*1000n;
  assert.ok(BigInt(t.timestampMs)>=from && BigInt(t.timestampMs)<until
    &&BigInt(v.head.timestampMs)>=from &&BigInt(v.head.timestampMs)<until,'NATIVE_VALUE_ORIGINAL_TRON_WINDOW');
  // The fixed native sixty-second validity must fit in the original consent.
  // A short existing window is rejected; there is no expiry clipping/reprepare.
  assert.ok(BigInt(t.expirationMs)<=until,'NATIVE_VALUE_ORIGINAL_TRON_EXPIRY_OUTSIDE_WINDOW');
  return assertNativeValuePrepared(b,{leaseId:b.leaseId,profileCommitment:b.profileCommitment,genesis:p.genesis,
    nativeHead:{hash:v.head.id,number:v.head.number,timestamp:(BigInt(v.head.timestampMs)/1000n).toString()},
    transaction:t,unsignedWire:v.unsignedWire,liquidity:{sourceEndpoint:t.ownerAddress,balanceAtomic:f.balanceSun,
      maximumFeeAtomic:f.maximumFeeSun,estimatedFeeAtomic:f.estimatedFeeSun,
      ownershipCommitment:f.ownershipCommitment,observationCommitment:f.observationCommitment}});
}
