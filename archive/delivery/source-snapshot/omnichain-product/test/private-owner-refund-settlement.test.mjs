import test from 'node:test';
import {derivePrivateAssetIdentity,derivePrivateAssetPoolScope} from '../src/private-asset-runtime.mjs';
import assert from 'node:assert/strict';
import { createOwnerRefundSettlementReconciler } from '../src/private-owner-refund-settlement.mjs';
import { assemblySchema } from '../src/private-assembly-encoding.mjs';
import { derivePrivatePoolScope, noteHashToWords, PrivateNoteTree, privateSpentDigest, ZERO_NOTE_HASH } from '../src/private-note-tree.mjs';
const h=n=>'0x'+n.toString(16).padStart(64,'0'),TRUE=h(1),pad=a=>[...a,...Array(64-a.length).fill(ZERO_NOTE_HASH)];
function fixture(assetKind) {
  const pool={address:'0x'+'11'.repeat(20),policy:h(2),deploymentDomain:h(3)};
  const assetFields=assetKind?{asset:assetKind==='NATIVE'?'0x'+'00'.repeat(20):'0x'+'22'.repeat(20),assetCodeHash:assetKind==='NATIVE'?h(0):h(90)}:{};
  if(assetKind){assetFields.assetIdentity=derivePrivateAssetIdentity('31337',assetFields.asset,assetFields.assetCodeHash);Object.assign(pool,assetFields);}
  pool.scope=assetKind?derivePrivateAssetPoolScope('31337',pool.address,pool.deploymentDomain,pool.assetIdentity):derivePrivatePoolScope('31337',pool.address,pool.deploymentDomain);
  const reserved=h(4),nf=h(5),sol=h(6),btc=h(7),recovery=h(8),root=new PrivateNoteTree([reserved]).root;
  const a=[...noteHashToWords(assemblySchema('authorization')),...noteHashToWords(pool.scope),...noteHashToWords(pool.policy),...noteHashToWords(root),...noteHashToWords(nf),...noteHashToWords(h(9)),...noteHashToWords(h(10)),...noteHashToWords(sol),...noteHashToWords(btc),...noteHashToWords(recovery),'12'];
  let snapshot;const control={mapMismatch:false,reorg:false,chain:'0x7a69',rootRejected:false};
  const set=(leaves=[reserved],nullifiers=[],epoch='11')=>{
    const tree=new PrivateNoteTree(leaves);snapshot={scope:pool.scope,policy:pool.policy,root:tree.root,leaves:pad(leaves),leafCount:leaves.length,nullifiers:pad(nullifiers),spentCount:nullifiers.length,spentDigest:privateSpentDigest(pool.scope,nullifiers),blockNumber:'0x1',blockHash:h(20),blockTimestamp:(BigInt(epoch)*600n).toString(),epoch};
  };set();
  const runtime={metadata:{chainId:'31337'},evm:async(method,args)=>{
    if(method==='eth_chainId')return control.chain;
    assert.equal(method,'eth_getBlockByNumber');assert.equal(args[0],snapshot.blockNumber);
    return {number:snapshot.blockNumber,hash:control.reorg?h(21):snapshot.blockHash,timestamp:'0x'+BigInt(snapshot.blockTimestamp).toString(16)};
  }};
  pool.snapshot=async()=>structuredClone(snapshot);
  pool.call=async(method,args,block)=>{
    assert.equal(block,snapshot.blockNumber);
    if(method==='asset()')return '0x'+'0'.repeat(24)+assetFields.asset.slice(2);if(method==='assetCodeHash()')return assetFields.assetCodeHash;if(method==='assetIdentity()')return control.assetReadMismatch?h(99):assetFields.assetIdentity;
    if(method==='scope()')return pool.scope;if(method==='policy()')return pool.policy;if(method==='deploymentDomain()')return pool.deploymentDomain;
    if(method==='acceptedRoots(bytes32)')return control.rootRejected?ZERO_NOTE_HASH:[root,snapshot.root].includes(args[0])?TRUE:ZERO_NOTE_HASH;
    if(method==='insertedCommitments(bytes32)')return control.mapMismatch?ZERO_NOTE_HASH:snapshot.leaves.slice(0,snapshot.leafCount).includes(args[0])?TRUE:ZERO_NOTE_HASH;
    assert.equal(method,'spentNullifiers(bytes32)');return snapshot.nullifiers.slice(0,snapshot.spentCount).includes(args[0])?TRUE:ZERO_NOTE_HASH;
  };
  const create=()=>createOwnerRefundSettlementReconciler({pool,runtime,authorizationInputs:a,reservedCommitment:reserved});
  return {pool,runtime,a,create,set,control,reserved,nf,sol,btc,recovery,get snapshot(){return snapshot;}};
}
test('original reserve reconciler distinguishes funded claim and exact refund shapes on canonical same pool',async()=>{
  const f=fixture(),r=f.create();assert.equal((await r.reconcile()).state,'FUNDED');
  f.set([f.reserved,f.sol,f.btc],[f.nf]);assert.equal((await r.reconcile()).state,'CLAIMED');
  f.set([f.reserved,f.recovery],[f.nf],'12');assert.equal((await r.reconcile()).state,'NOTE_ISSUED');
  assert.equal(r.pin.claimEpoch,'12');assert.equal(r.pin.reserveNullifier,f.nf);
});
test('consumed reserve alone, partial/mixed outputs, missing reserve and pre-cutoff refund stay UNKNOWN',async()=>{
  const f=fixture(),r=f.create();
  for(const [leaves,nfs,epoch] of [
    [[f.reserved],[f.nf],'12'],[[f.reserved,f.sol],[f.nf],'12'],[[f.reserved,f.sol,f.btc,f.recovery],[f.nf],'12'],
    [[f.reserved,f.recovery],[],'12'],[[f.recovery],[f.nf],'12'],[[f.reserved,f.recovery],[f.nf],'11'],
  ]){f.set(leaves,nfs,epoch);assert.equal((await r.reconcile()).state,'UNKNOWN');}
});
test('changed pool, root, map, canonical header, chain, digest or padding fail closed',async()=>{
  for(const change of ['address','scope','policy','deploymentDomain','chain','reorg','mapMismatch','rootRejected','root','spentDigest','padding']) {
    const f=fixture(),r=f.create();
    if(['address','scope','policy','deploymentDomain'].includes(change))f.pool[change]=change==='address'?'0x'+'22'.repeat(20):h(100);
    else if(change==='chain')f.control.chain='0x1';else if(['reorg','mapMismatch','rootRejected'].includes(change))f.control[change]=true;
    else if(change==='padding')f.snapshot.leaves[63]=h(111);else f.snapshot[change]=h(123);
    await assert.rejects(r.reconcile(),undefined,change);
  }
});
test('original cutoff and public hash words are bounded and caller A mutations cannot repin authority',async()=>{
  const f=fixture(),r=f.create();f.a[80]='99';assert.equal(r.pin.claimEpoch,'12');
  f.a[80]=(1n<<64n).toString();assert.throws(f.create,/CUTOFF_RANGE/);
  f.a[80]='12';f.a[40]=(1n<<32n).toString();assert.throws(f.create,/WORD_RANGE/);
});

for(const assetKind of ['ERC20','NATIVE'])test('asset-scoped original refund settlement validates immutable deployment identity: '+assetKind,async()=>{
 const f=fixture(assetKind),r=f.create();assert.equal((await r.reconcile()).state,'FUNDED');
 f.control.assetReadMismatch=true;await assert.rejects(r.reconcile(),/ASSET_DEPLOYMENT_CHANGED/);f.control.assetReadMismatch=false;
 const original=f.pool.assetIdentity;f.pool.assetIdentity=h(88);await assert.rejects(r.reconcile(),/ASSET/);f.pool.assetIdentity=original;
 f.set([f.reserved,f.recovery],[f.nf],'12');assert.equal((await r.reconcile()).state,'NOTE_ISSUED');
 f.pool.asset='0x'+'33'.repeat(20);f.pool.assetCodeHash=h(91);f.pool.assetIdentity=derivePrivateAssetIdentity('31337',f.pool.asset,f.pool.assetCodeHash);assert.throws(f.create,/POOL_BINDING/);
});
