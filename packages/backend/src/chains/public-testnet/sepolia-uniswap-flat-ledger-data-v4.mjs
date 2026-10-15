/** Fixed PUBLIC flat-ledger observations. This leaf issues DATA only; its
 * caller must bind the runtime and compiled target in the Original owner. */
import assert from 'node:assert/strict';
import {inspectGenericSnapshot} from '@lianum/engine/execution/local/local-ledger';
import {readOriginalPagedSepoliaHistoricalBalanceV4} from './sepolia-receiver-rpc-v4.mjs';
import {publicKeccak256} from '@lianum/engine/cohorts/private-cohort-public-native';

const selector=s=>publicKeccak256(Buffer.from(s)).subarray(0,4).toString('hex');
const bare=s=>s.slice(2),word=v=>BigInt(v).toString(16).padStart(64,'0');
const freeze=v=>{if(v&&typeof v==='object'&&!Object.isFrozen(v)){Object.values(v).forEach(freeze);Object.freeze(v);}return v;};
export async function readSepoliaUniswapFlatLedgerDataV4(runtime,target,head){
 assert.equal(arguments.length,3);const pool=target.target.pools[1],at=head.number;
 const names=['canonicalState()','canonicalRootHistory()','canonicalBacking()'];
 const [rawState,rawHistory,rawBacking,assetBalance,nativeBalance,assetCode]=await Promise.all([
  ...names.map(name=>runtime.call({to:pool.address,data:'0x'+selector(name)},at)),
  runtime.call({to:pool.asset,data:'0x'+selector('balanceOf(address)')+pool.address.slice(2).padStart(64,'0')},at),
  readOriginalPagedSepoliaHistoricalBalanceV4(runtime,pool.address,head),runtime.code(pool.asset,at)
 ]);
 assert.match(assetBalance,/^0x[0-9a-f]{64}$/,'PUBLIC_UNISWAP_OUTPUT_BALANCE_ENCODING');
 assert.equal('0x'+publicKeccak256(Buffer.from(assetCode.slice(2),'hex')).toString('hex'),pool.assetCodeHash,'PUBLIC_UNISWAP_OUTPUT_ASSET_CODE');
 const inspected=inspectGenericSnapshot({scope:'0x'+pool.domain.scope,asset:pool.asset,rawState,rawHistory,rawBacking});
 assert.equal(BigInt(inspected.publicState.actualAssetBalance),BigInt(assetBalance),'PUBLIC_UNISWAP_OUTPUT_BACKING_BALANCE');
 assert.equal(BigInt(inspected.publicState.unrelatedNative),BigInt(nativeBalance),'PUBLIC_UNISWAP_OUTPUT_NATIVE_BALANCE');
 const s=inspected.publicState;assert.ok(s.leaves+4*s.liveReservations<=64&&s.spent+5*s.liveReservations+s.outputCapacity<=64,'PUBLIC_UNISWAP_OUTPUT_HEADROOM');
 assert.ok(s.rootCount>=1&&s.rootCount<=s.leaves+1,'PUBLIC_UNISWAP_OUTPUT_ROOT_COUNT');
 assert.equal(new Set(inspected.commitments).size,inspected.commitments.length,'PUBLIC_UNISWAP_OUTPUT_DUPLICATE_COMMITMENT');
 assert.equal(new Set(inspected.nullifiers).size,inspected.nullifiers.length,'PUBLIC_UNISWAP_OUTPUT_DUPLICATE_NULLIFIER');
 await runtime.assertCanonical(head);
 const paths=inspected.commitments.map((_,index)=>{const p=inspected.tree.path(index);return {root:bare(p.root),index,leaf:bare(p.leaf),siblings:p.siblings.map(bare)};});
 return freeze({profile:'PUBLIC_SEPOLIA_UNISWAP_FLAT_LEDGER_DATA_V4',head:structuredClone(head),pool:pool.address,asset:pool.asset,scope:pool.domain.scope,policy:pool.domain.policy,
  commitments:inspected.commitments.map(bare),nullifiers:inspected.nullifiers.map(bare),roots:inspected.roots.map(bare),paths,publicState:structuredClone(s),
  raw:{rawState,rawHistory,rawBacking,assetBalance:'0x'+word(BigInt(assetBalance)),nativeBalance:BigInt(nativeBalance).toString()}});
}
