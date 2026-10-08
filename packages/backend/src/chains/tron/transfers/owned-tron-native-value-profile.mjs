/** Data-only owned TRX profile. Never a signer, permission certificate or graph permit. */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { types } from 'node:util';
import { decodeTronNativeTransferWire } from './tron-native-transfer-wire.mjs';
import { canonical } from '../../../../../engine/src/crypto/privacy.mjs';
export const OWNED_TRON_NATIVE_VALUE_PROFILE = 'LIANUM_OWNED_LOCAL_TRON_NATIVE_VALUE_V1';
export const TRON_LOCAL_CLASSIFICATION = 'LOCAL_SYNTHETIC_TRON_JAVA_TRON_CONSENSUS';
export const PROFILE = Object.freeze({ classification: TRON_LOCAL_CLASSIFICATION, publicNetwork: false,
  p2pVersion: '2026100501', maximumTransferSun: '1000000000000', maximumFeeSun: '10000000',
  maximumValidityMs: '60000', maximumTaposDistance: '32', maximumPreparationAgeMs: '30000', maximumHeadAgeMs: '15000',
  genesisTimestampMs: '1750000000000', permissionId: '0', singleWitness: true, networkSockets: false });
export const sha256 = b => createHash('sha256').update(b).digest('hex');
export function exact(value, names) {
  assert.ok(value && typeof value === 'object' && !types.isProxy(value) && Object.getPrototypeOf(value) === Object.prototype, 'OWNED_TRON_RECORD');
  assert.deepEqual(Reflect.ownKeys(value).sort(), [...names].sort(), 'OWNED_TRON_RECORD_FIELDS');
  for (const name of names) assert.ok(Object.hasOwn(Object.getOwnPropertyDescriptor(value, name) ?? {}, 'value'), 'OWNED_TRON_DATA_ONLY');
  return value;
}
export function uint(value, positive = false) {
  assert.ok(typeof value === 'string' && value.length <= 19 && /^(0|[1-9][0-9]*)$/.exec(value)?.[0] === value, 'OWNED_TRON_INTEGER');
  assert.ok(BigInt(value) <= (1n << 63n) - 1n && (!positive || BigInt(value) > 0n), 'OWNED_TRON_INTEGER_RANGE'); return BigInt(value);
}
export function hex(value, bytes, nonzero = false) {
  assert.ok(typeof value === 'string' && value.length === bytes * 2 && /^[0-9a-f]+$/.exec(value)?.[0] === value && (!nonzero || /[1-9a-f]/.test(value)), 'OWNED_TRON_HEX');
  return Buffer.from(value, 'hex');
}
export function address(value) { hex(value,21); assert.ok(value.startsWith('41') && /[1-9a-f]/.test(value.slice(2)), 'OWNED_TRON_ADDRESS'); return value; }
export function freeze(value) { if (value && typeof value === 'object') { for (const x of Object.values(value)) freeze(x); Object.freeze(value); } return value; }
export const clone = value => freeze(structuredClone(value));
export const digest = value => sha256(JSON.stringify(value));
// Encrypted custody canonicalizes object keys. These content commitments must
// survive that storage round trip while binding every original snapshot field.
const preparationDigest = value => sha256(canonical(value));
export function normalizeBinding(raw) {
  exact(raw,['leaseId','profileCommitment','genesis','actionCommitment','receiptKeyCommitment','readyStatement','dependencyProofSHA256','readyProofSHA256']);
  for(const name of Object.keys(raw))hex(raw[name],32,true);
  assert.ok(raw.genesis.startsWith('0000000000000000'),'OWNED_TRON_GENESIS_BLOCK_ID');return clone(raw);
}
export function normalizeIntent(raw) {
  exact(raw,['ownerAddress','recipientAddress','amountSun','wireKeyCommitment']);address(raw.ownerAddress);address(raw.recipientAddress);
  assert.notEqual(raw.ownerAddress,raw.recipientAddress,'OWNED_TRON_SELF_TRANSFER');
  assert.ok(uint(raw.amountSun,true)<=BigInt(PROFILE.maximumTransferSun),'OWNED_TRON_TRANSFER_LIMIT');hex(raw.wireKeyCommitment,32,true);return clone(raw);
}
const varint=n=>{let x=BigInt(n);const b=[];do{b.push(Number(x&127n)|(x>127n?128:0));x>>=7n;}while(x);return Buffer.from(b);};
const pb=(n,t,b)=>Buffer.concat([varint(BigInt(n)*8n+BigInt(t)),...(t===2?[varint(b.length),b]:[varint(b)])]);
export function normalizeTransaction(t) {
  exact(t,['ownerAddress','recipientAddress','amountSun','wireKeyCommitment','refBlockBytes','refBlockHash','timestampMs','expirationMs','permissionId']);
  normalizeIntent(Object.fromEntries(['ownerAddress','recipientAddress','amountSun','wireKeyCommitment'].map(k=>[k,t[k]])));
  hex(t.refBlockBytes,2);hex(t.refBlockHash,8);assert.equal(t.permissionId,'0','OWNED_TRON_OWNER_PERMISSION_ONLY');
  assert.ok(uint(t.timestampMs,true)<uint(t.expirationMs,true)&&BigInt(t.expirationMs)-BigInt(t.timestampMs)<=BigInt(PROFILE.maximumValidityMs),'OWNED_TRON_EXPIRATION');return clone(t);
}
export function encodeOwnedTronUnsigned(raw) {
  const t=normalizeTransaction(raw),transfer=Buffer.concat([pb(1,2,hex(t.ownerAddress,21)),pb(2,2,hex(t.recipientAddress,21)),pb(3,0,t.amountSun)]);
  const parameter=Buffer.concat([pb(1,2,Buffer.from('type.googleapis.com/protocol.TransferContract')),pb(2,2,transfer)]);
  const contract=Buffer.concat([pb(1,0,1),pb(2,2,parameter)]);
  return Buffer.concat([pb(1,2,hex(t.refBlockBytes,2)),pb(4,2,hex(t.refBlockHash,8)),pb(8,0,t.expirationMs),
    pb(10,2,hex(t.wireKeyCommitment,32)),pb(11,2,contract),pb(14,0,t.timestampMs)]).toString('hex');
}
export function bindOwnedTronSigned(t,nativeWire) {
  const decoded=decodeTronNativeTransferWire(nativeWire);assert.equal(decoded.rawDataHex,encodeOwnedTronUnsigned(t),'OWNED_TRON_ORIGINAL_RAW_DATA');
  return clone({nativeWire:decoded.nativeWire,nativeId:decoded.nativeId,transactionSHA256:decoded.transactionSHA256});
}
export function assertOwnedTronSnapshot(raw,{genesis,ownerAddress,recipientAddress,nowMs}) {
  exact(raw,['genesis','head','solid','reference','ownerAddress','recipientAddress','ownerPermission','ownerBalanceSun','recipientExists','recipientType','transactionFeeSun','memoFeeSun','pendingCount','chainParametersSHA256','resourcesSHA256','configurationSHA256']);
  hex(genesis,32,true);assert.equal(raw.genesis,genesis,'OWNED_TRON_CHAIN_CHANGED');assert.equal(raw.ownerAddress,ownerAddress);assert.equal(raw.recipientAddress,recipientAddress);
  for(const k of ['head','solid','reference']){const b=raw[k];exact(b,['id','number','timestampMs']);hex(b.id,32,true);uint(b.number);uint(b.timestampMs);
    assert.equal(BigInt('0x'+b.id.slice(0,16)),BigInt(b.number),'OWNED_TRON_BLOCK_ID_HEIGHT');}
  assert.ok(BigInt(raw.solid.number)<=BigInt(raw.head.number),'OWNED_TRON_SOLID_AHEAD');assert.ok(BigInt(raw.reference.number)<=BigInt(raw.solid.number)&&BigInt(raw.head.number)-BigInt(raw.reference.number)<=BigInt(PROFILE.maximumTaposDistance),'OWNED_TRON_RECENT_TAPOS');
  const now=uint(nowMs,true),head=BigInt(raw.head.timestampMs);assert.ok(head<=now+3000n&&now-head<=BigInt(PROFILE.maximumHeadAgeMs),'OWNED_TRON_STALE_NATIVE_HEAD');
  const p=raw.ownerPermission;exact(p,['id','type','threshold','keys']);assert.equal(p.id,'0');assert.equal(p.type,'Owner');assert.equal(p.threshold,'1');
  assert.ok(Array.isArray(p.keys)&&p.keys.length===1);exact(p.keys[0],['address','weight']);assert.equal(p.keys[0].address,ownerAddress);assert.equal(p.keys[0].weight,'1');
  uint(raw.ownerBalanceSun);assert.equal(raw.recipientExists,true,'OWNED_TRON_PREFUNDED_RECIPIENT_REQUIRED');assert.equal(raw.recipientType,'Normal','OWNED_TRON_NO_CONTRACT_RECIPIENT');
  assert.equal(raw.pendingCount,'0','OWNED_TRON_PENDING_TRANSACTION');uint(raw.transactionFeeSun,true);uint(raw.memoFeeSun);
  for(const k of ['chainParametersSHA256','resourcesSHA256','configurationSHA256'])hex(raw[k],32,true);return clone(raw);
}
export function prepareOwnedTronNative({binding,intent,snapshot,nowMs}) {
  const b=normalizeBinding(binding),t=normalizeIntent(intent);assert.equal(t.wireKeyCommitment,b.receiptKeyCommitment);
  const s=assertOwnedTronSnapshot(snapshot,{genesis:b.genesis,ownerAddress:t.ownerAddress,recipientAddress:t.recipientAddress,nowMs});
  assert.deepEqual(s.reference,s.solid,'OWNED_TRON_INITIAL_SOLID_REFERENCE');
  const transaction={...t,refBlockBytes:s.reference.id.slice(12,16),refBlockHash:s.reference.id.slice(16,32),timestampMs:nowMs,
    expirationMs:(BigInt(nowMs)+BigInt(PROFILE.maximumValidityMs)).toString(),permissionId:'0'};
  const unsignedWire=encodeOwnedTronUnsigned(transaction);
  // Worst-case entire signed wire plus java-tron's result reservation. Free
  // bandwidth is intentionally not relied upon. Existing Normal recipient only.
  const maximumBytes=512n+64n,estimatedFee=maximumBytes*BigInt(s.transactionFeeSun)+BigInt(s.memoFeeSun);
  assert.ok(estimatedFee<=BigInt(PROFILE.maximumFeeSun),'OWNED_TRON_FEE_PROFILE');
  assert.ok(BigInt(s.ownerBalanceSun)>=BigInt(t.amountSun)+BigInt(PROFILE.maximumFeeSun),'OWNED_TRON_SOLVER_BALANCE');
  return clone({profile:OWNED_TRON_NATIVE_VALUE_PROFILE,binding:b,genesis:b.genesis,head:s.head,transaction,unsignedWire,snapshot:s,
    funds:{balanceSun:s.ownerBalanceSun,maximumFeeSun:PROFILE.maximumFeeSun,estimatedFeeSun:estimatedFee.toString(),
      ownershipCommitment:preparationDigest({genesis:b.genesis,ownerAddress:t.ownerAddress,permission:s.ownerPermission}),observationCommitment:preparationDigest(s)}});
}
export function assertPreparationCurrent(prepared,snapshot,nowMs) {
  assert.equal(prepared.profile,OWNED_TRON_NATIVE_VALUE_PROFILE);const t=prepared.transaction;
  assertOwnedTronSnapshot(snapshot,{genesis:prepared.genesis,ownerAddress:t.ownerAddress,recipientAddress:t.recipientAddress,nowMs});
  assert.ok(uint(nowMs)>=uint(t.timestampMs)&&BigInt(nowMs)-BigInt(t.timestampMs)<BigInt(PROFILE.maximumPreparationAgeMs),'OWNED_TRON_PREPARATION_EXPIRED');
  assert.ok(BigInt(snapshot.head.timestampMs)<BigInt(t.expirationMs),'OWNED_TRON_CHAIN_EXPIRED');
  // Autonomous native blocks may advance. The ORIGINAL reference remains
  // canonical/recent; no transaction rebase or nonce-like replacement exists.
  assert.ok(BigInt(snapshot.head.number)>=BigInt(prepared.snapshot.head.number)&&BigInt(snapshot.solid.number)>=BigInt(prepared.snapshot.solid.number),'OWNED_TRON_NATIVE_HEAD_ROLLBACK');
  assert.ok(BigInt(snapshot.head.timestampMs)>=BigInt(prepared.snapshot.head.timestampMs),'OWNED_TRON_NATIVE_TIME_ROLLBACK');
  const stable=v=>Object.fromEntries(Object.entries(v).filter(([k])=>k!=='head'&&k!=='solid'));
  assert.deepEqual(stable(snapshot),stable(prepared.snapshot),'OWNED_TRON_ORIGINAL_SNAPSHOT_CHANGED');return undefined;
}

export function validateOwnedTronPreparation(raw){exact(raw,['profile','binding','genesis','head','transaction','unsignedWire','snapshot','funds']);const intent=Object.fromEntries(['ownerAddress','recipientAddress','amountSun','wireKeyCommitment'].map(k=>[k,raw.transaction[k]]));const value=prepareOwnedTronNative({binding:raw.binding,intent,snapshot:raw.snapshot,nowMs:raw.transaction.timestampMs});assert.deepEqual(raw,value,'OWNED_TRON_PREPARATION_REBOUND');return value;}
