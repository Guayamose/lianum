/** DATA-only canonical reader; the issuer binds its original runtime/Target. */
import assert from 'node:assert/strict';
import {inspectGenericSnapshot} from '@lianum/engine/execution/local/local-ledger';
import {readOriginalPagedSepoliaHistoricalBalanceV4} from './sepolia-receiver-rpc-v4.mjs';
import {publicKeccak256} from '@lianum/engine/cohorts/private-cohort-public-native';
const selector=s=>publicKeccak256(Buffer.from(s)).subarray(0,4).toString('hex'),bare=s=>s.slice(2);
export async function readSepoliaDefiSharesLedgerDataV4(runtime,target,head){
 assert.equal(arguments.length,3);const pool=target.target.pools[1],at=head.number;
 const [rawState,rawHistory,rawBacking,assetBalance,nativeBalance,assetCode]=await Promise.all([
  ...['canonicalState()','canonicalRootHistory()','canonicalBacking()'].map(name=>runtime.call({to:pool.address,data:'0x'+selector(name)},at)),
  runtime.call({to:pool.asset,data:'0x'+selector('balanceOf(address)')+pool.address.slice(2).padStart(64,'0')},at),
  readOriginalPagedSepoliaHistoricalBalanceV4(runtime,pool.address,head),runtime.code(pool.asset,at)
 ]);
 assert.match(assetBalance,/^0x[0-9a-f]{64}$/);assert.equal('0x'+publicKeccak256(Buffer.from(assetCode.slice(2),'hex')).toString('hex'),pool.assetCodeHash);
 const inspected=inspectGenericSnapshot({scope:'0x'+pool.domain.scope,asset:pool.asset,rawState,rawHistory,rawBacking}),s=inspected.publicState;
 assert.equal(BigInt(s.actualAssetBalance),BigInt(assetBalance));assert.equal(BigInt(s.unrelatedNative),BigInt(nativeBalance));assert.ok(s.leaves+4*s.liveReservations<=64&&s.spent+5*s.liveReservations+s.outputCapacity<=64);assert.ok(s.rootCount>=1&&s.rootCount<=s.leaves+1);assert.equal(new Set(inspected.commitments).size,inspected.commitments.length);assert.equal(new Set(inspected.nullifiers).size,inspected.nullifiers.length);await runtime.assertCanonical(head);
 const paths=inspected.commitments.map((_,index)=>{const p=inspected.tree.path(index);return{root:bare(p.root),index,leaf:bare(p.leaf),siblings:p.siblings.map(bare)};});
 return{profile:'PUBLIC_SEPOLIA_DEFI_SHARES_LEDGER_DATA_V4',head:structuredClone(head),pool:pool.address,asset:pool.asset,scope:pool.domain.scope,policy:pool.domain.policy,commitments:inspected.commitments.map(bare),nullifiers:inspected.nullifiers.map(bare),roots:inspected.roots.map(bare),paths,publicState:structuredClone(s),raw:{rawState,rawHistory,rawBacking,assetBalance,nativeBalance:BigInt(nativeBalance).toString()}};
}
