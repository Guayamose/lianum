/** Same-authority, read-only branch discovery. All pins come from the original
 * owner authorization already genuinely verified by the retained assembler.
 * Public journals and controller status are never evidence of reserve state. */
import assert from 'node:assert/strict';
import { assertAssemblyStatement } from './private-assembly-encoding.mjs';
import { derivePrivatePoolScope, noteWordsToHash, PrivateNoteTree, privateSpentDigest, ZERO_NOTE_HASH } from './private-note-tree.mjs';
import {derivePrivateAssetPoolScope} from './private-asset-runtime.mjs';
import {privateWalletPoolAssetDescriptor,assertPrivateWalletPoolAsset} from './private-wallet-asset-binding.mjs';
const TRUE=`0x${'0'.repeat(63)}1`;
const quantity=value=>{assert.match(value,/^0x(?:0|[1-9a-f][0-9a-f]*)$/,'OWNER_REFUND_SETTLEMENT_QUANTITY');return BigInt(value);};
const hash=value=>{assert.match(value,/^0x[0-9a-f]{64}$/,'OWNER_REFUND_SETTLEMENT_HASH');return value;};
export function createOwnerRefundSettlementReconciler({pool,runtime,authorizationInputs,reservedCommitment}) {
  const asset=privateWalletPoolAssetDescriptor(pool,String(runtime.metadata.chainId));
  const a=assertAssemblyStatement('authorization',authorizationInputs).map(n=>BigInt(n).toString());
  assert.ok(BigInt(a[80])<1n<<64n,'OWNER_REFUND_SETTLEMENT_CUTOFF_RANGE');
  for(const value of a.slice(0,80))assert.ok(BigInt(value)<1n<<32n,'OWNER_REFUND_SETTLEMENT_WORD_RANGE');
  const pin=Object.freeze({pool:pool.address,scope:noteWordsToHash(a.slice(8,16)),policy:noteWordsToHash(a.slice(16,24)),
    domain:hash(pool.deploymentDomain),chainId:String(runtime.metadata.chainId),root:noteWordsToHash(a.slice(24,32)),
    reserveNullifier:noteWordsToHash(a.slice(32,40)),reservedCommitment:hash(reservedCommitment),
    outputSol:noteWordsToHash(a.slice(56,64)),outputBtc:noteWordsToHash(a.slice(64,72)),outputRecovery:noteWordsToHash(a.slice(72,80)),claimEpoch:a[80]});
  assert.match(pin.pool,/^0x[0-9a-f]{40}$/,'OWNER_REFUND_SETTLEMENT_POOL');
  assert.equal(pool.scope,pin.scope,'OWNER_REFUND_SETTLEMENT_SCOPE');assert.equal(pool.policy,pin.policy,'OWNER_REFUND_SETTLEMENT_POLICY');
  assert.equal(asset?derivePrivateAssetPoolScope(pin.chainId,pin.pool,pin.domain,'0x'+asset.identity):derivePrivatePoolScope(pin.chainId,pin.pool,pin.domain),pin.scope,'OWNER_REFUND_SETTLEMENT_POOL_BINDING');
  assert.equal(new Set([pin.reservedCommitment,pin.outputSol,pin.outputBtc,pin.outputRecovery]).size,4,'OWNER_REFUND_SETTLEMENT_DISTINCT_OUTPUTS');
  async function canonical(snapshot) {
    quantity(snapshot.blockNumber);hash(snapshot.blockHash);
    const header=await runtime.evm('eth_getBlockByNumber',[snapshot.blockNumber,false]);
    assert.equal(header?.hash,snapshot.blockHash,'OWNER_REFUND_SETTLEMENT_BLOCK_CHANGED');assert.equal(header.number,snapshot.blockNumber,'OWNER_REFUND_SETTLEMENT_HEIGHT');
    assert.equal(quantity(header.timestamp).toString(),snapshot.blockTimestamp,'OWNER_REFUND_SETTLEMENT_TIME');
  }
  async function reconcile() {
    assert.equal(pool.address,pin.pool,'OWNER_REFUND_SETTLEMENT_POOL');assert.equal(pool.scope,pin.scope,'OWNER_REFUND_SETTLEMENT_SCOPE');assert.equal(pool.policy,pin.policy,'OWNER_REFUND_SETTLEMENT_POLICY');assert.equal(pool.deploymentDomain,pin.domain,'OWNER_REFUND_SETTLEMENT_DOMAIN');
    assert.equal(String(runtime.metadata.chainId),pin.chainId,'OWNER_REFUND_SETTLEMENT_CHAIN');assert.equal(quantity(await runtime.evm('eth_chainId',[])),BigInt(pin.chainId),'OWNER_REFUND_SETTLEMENT_CHAIN');
    const s=await pool.snapshot();assert.equal(s.scope,pin.scope,'OWNER_REFUND_SETTLEMENT_SCOPE');assert.equal(s.policy,pin.policy,'OWNER_REFUND_SETTLEMENT_POLICY');
    assert.equal(s.epoch,(BigInt(s.blockTimestamp)/600n).toString(),'OWNER_REFUND_SETTLEMENT_EPOCH');
    for(const [count,list] of [[s.leafCount,s.leaves],[s.spentCount,s.nullifiers]]) {
      assert.ok(Number.isSafeInteger(count)&&count>=0&&count<=64&&Array.isArray(list)&&list.length===64,'OWNER_REFUND_SETTLEMENT_COUNTS');
      assert.ok(list.slice(count).every(v=>v===ZERO_NOTE_HASH),'OWNER_REFUND_SETTLEMENT_PADDING');
      assert.equal(new Set(list.slice(0,count)).size,count,'OWNER_REFUND_SETTLEMENT_DUPLICATES');
    }
    assert.equal(new PrivateNoteTree(s.leaves.slice(0,s.leafCount)).root,s.root,'OWNER_REFUND_SETTLEMENT_ROOT');
    assert.equal(privateSpentDigest(pin.scope,s.nullifiers,s.spentCount),s.spentDigest,'OWNER_REFUND_SETTLEMENT_SPENT_DIGEST');
    const block=s.blockNumber;
    await assertPrivateWalletPoolAsset(pool,asset,pin.chainId,block);
    for(const [method,expected] of [['scope()',pin.scope],['policy()',pin.policy],['deploymentDomain()',pin.domain]])assert.equal(await pool.call(method,[],block),expected,'OWNER_REFUND_SETTLEMENT_IDENTITY');
    for(const root of [s.root,pin.root])assert.equal(await pool.call('acceptedRoots(bytes32)',[root],block),TRUE,'OWNER_REFUND_SETTLEMENT_ROOT_NOT_ACCEPTED');
    const leaves=s.leaves.slice(0,s.leafCount),spent=s.nullifiers.slice(0,s.spentCount).includes(pin.reserveNullifier),present={};
    for(const name of ['reservedCommitment','outputSol','outputBtc','outputRecovery']) {
      present[name]=leaves.includes(pin[name]);assert.equal(await pool.call('insertedCommitments(bytes32)',[pin[name]],block),present[name]?TRUE:ZERO_NOTE_HASH,'OWNER_REFUND_SETTLEMENT_INSERTION_DISAGREEMENT');
    }
    assert.equal(await pool.call('spentNullifiers(bytes32)',[pin.reserveNullifier],block),spent?TRUE:ZERO_NOTE_HASH,'OWNER_REFUND_SETTLEMENT_SPENT_DISAGREEMENT');
    await canonical(s);
    let state='UNKNOWN';
    if(present.reservedCommitment) {
      if(!spent&&!present.outputSol&&!present.outputBtc&&!present.outputRecovery)state='FUNDED';
      if(spent&&present.outputSol&&present.outputBtc&&!present.outputRecovery)state='CLAIMED';
      if(spent&&!present.outputSol&&!present.outputBtc&&present.outputRecovery&&BigInt(s.epoch)>=BigInt(pin.claimEpoch))state='NOTE_ISSUED';
    }
    return {state,claimEpoch:pin.claimEpoch,epoch:s.epoch,blockNumber:s.blockNumber,blockHash:s.blockHash,blockTimestamp:s.blockTimestamp,
      pool:pin.pool,reserveNullifier:pin.reserveNullifier,recoveryCommitment:pin.outputRecovery};
  }
  return Object.freeze({pin,reconcile});
}
