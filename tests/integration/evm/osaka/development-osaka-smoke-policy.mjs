/** Results only; no runtime authority or caller-controlled fork/profile. */
import assert from 'node:assert/strict';
export const OSAKA_SMOKE_PROFILE='ORIGINAL_OSAKA_DEPLOYMENT_AND_ONE_PUBLIC_TOKEN_TRANSFER_V1';
export const OSAKA_SMOKE_RESULT='LIANUM_DEVELOPMENT_OSAKA_SMOKE_RESULT_V1';
export function osakaSmokeProcessFailure(processes) {
  assert.ok(Array.isArray(processes));
  return processes.some(row => row.proofWorker || !['main-worker','evm-runtime'].includes(row.role))
    ? 'OSAKA_SMOKE_UNEXPECTED_PROCESS_OR_PROOF' : null;
}
export function assertOsakaSmokeResult(value) {
  assert.equal(value.format,OSAKA_SMOKE_RESULT);assert.equal(value.profile,OSAKA_SMOKE_PROFILE);
  assert.equal(value.phase,'completed');assert.equal(value.success,true);assert.equal(value.sourceUnchanged,true);
  for(const k of ['localOnly','fakeFundsOnly'])assert.equal(value[k],true);
  for(const k of ['publicNetwork','proofAcceptanceEstablished','privateLifecycleEstablished','fullWalletAcceptance',
    'productionClientAcceptanceEstablished','publicConsensusOrFinalityVerified'])assert.equal(value[k],false,'OSAKA_SMOKE_SCOPE');
  assert.deepEqual(value.proofs,[]);assert.equal(value.fork,'osaka');assert.equal(value.transactionGasCap,'16777216');
  assert.equal(value.blockGasLimit,'30000000');assert.equal(value.observedGenesisBlockGasLimit,'30000000');assert.equal(value.nodeTransactionGasLimitEnabled,true);
  assert.equal(value.cleanup.closedEvm,true);assert.equal(value.cleanup.evm.stopped,true);
  const stopped=value.cleanup.stoppedOwnedEvmEvent;
  assert.equal(stopped.event,'stopped-owned-process');assert.equal(stopped.forced,false);
  assert.ok(Number.isSafeInteger(value.runtimeProcessId)&&value.runtimeProcessId>1);assert.equal(stopped.pid,value.runtimeProcessId);
  for(const key of ['pid','exitObserved','exitCode','signal','spawnErrorCode','stopped'])
    assert.equal(stopped[key],value.cleanup.evm[key],'OSAKA_SMOKE_ORIGINAL_STOP_JOIN');
  assert.equal(stopped.exitObserved,true);assert.equal(stopped.exitCode,0);assert.equal(stopped.signal,null);assert.equal(stopped.spawnErrorCode,null);assert.equal(value.cleanup.evm.scratchRemoved,true);assert.deepEqual(value.cleanup.errors,[]);
  assert.equal(value.originalVerifierCount,12);assert.equal(value.originalPoolCount,2);assert.equal(value.creations.length,44);
  assert.equal(new Set(value.creations.map(row=>row.address)).size,44);
  assert.equal(value.transactions.length,47);
  assert.equal(new Set(value.transactions.map(row=>row.transactionHash)).size,value.transactions.length);
  assert.equal(value.transactions.filter(row=>row.create).length,44);
  for(const tx of value.transactions) {
    assert.match(tx.transactionHash,/^0x[0-9a-f]{64}$/);assert.match(tx.blockHash,/^0x[0-9a-f]{64}$/);
    assert.equal(tx.phase,'mined');assert.equal(tx.status,'0x1');assert.equal(tx.originalReceiptCanonical,true);
    assert.ok(BigInt(tx.gas)>0n&&BigInt(tx.gas)<=16777216n);assert.equal(tx.requestGas,tx.gas);
    assert.ok(BigInt(tx.gasUsed)>0n&&BigInt(tx.gasUsed)<=BigInt(tx.gas));
    if(tx.create)assert.ok(tx.initcodeBytes>0&&tx.initcodeBytes<=49152);
  }
  for(const creation of value.creations) {
    assert.match(creation.address,/^0x[0-9a-f]{40}$/);assert.match(creation.runtimeSHA256,/^[0-9a-f]{64}$/);
    assert.match(creation.creationSHA256,/^[0-9a-f]{64}$/);
    assert.ok(creation.initcodeBytes>0&&creation.initcodeBytes<=49152);
    assert.ok(creation.runtimeBytes>0&&creation.runtimeBytes<=24576);assert.equal(creation.originalCompleteCodeMatched,true);
    const tx=value.transactions.find(row=>row.transactionHash===creation.transactionHash);
    assert.ok(tx&&tx.create);assert.equal(tx.contractAddress,creation.address);assert.equal(tx.initcodeBytes,creation.initcodeBytes);
  }
  assert.deepEqual(value.runtimeGasRejections.map(row=>row.gas),['0','16777217','30000000']);
  for(const row of value.runtimeGasRejections)assert.equal(row.noJournalNonceBalanceOrHeadEffect,true);
  const probe=value.nodeCapRejection;
  assert.equal(probe.schema,'ORIGINAL_OWNED_OSAKA_NODE_GAS_REJECTION_V1');assert.equal(probe.attempts,1);
  assert.equal(probe.gas,'16777217');assert.equal(probe.cap,'16777216');assert.equal(probe.zeroValue,true);
  assert.equal(probe.originalStateUnchanged,true);assert.deepEqual(probe.after,probe.before);
  assert.equal(probe.originalNodeRejection.schema,'ORIGINAL_OWNED_LOOPBACK_RPC_FAILURE_V1');
  assert.equal(probe.originalNodeRejection.method,'eth_sendTransaction');
  assert.equal(probe.originalNodeRejection.message.text,
    'Transaction gas limit is greater than the block gas limit, gas_limit: 16777217, cap: 16777216');
  const t=value.publicTransfer;assert.equal(t.amount,'1');assert.equal(t.senderNonceDelta,'1');
  assert.equal(t.sourceTokenDelta,'-1');assert.equal(t.recipientTokenDelta,'1');assert.equal(t.contractCodesUnchanged,true);
  assert.equal(t.broadcasts,1);assert.equal(t.originalCanonicalReceipt,true);assert.equal(t.signedWireAcceptanceEstablished,false);
  assert.equal(value.originalPoolRegistrationTransactionHashes.length,2);
  assert.equal(new Set(value.originalPoolRegistrationTransactionHashes).size,2);
  assert.ok(!value.originalPoolRegistrationTransactionHashes.includes(t.transactionHash));
  assert.deepEqual(value.transactions.filter(row=>!row.create).map(row=>row.transactionHash).sort(),
    [...value.originalPoolRegistrationTransactionHashes,t.transactionHash].sort());
  return {scope:'ORIGINAL_OSAKA_DEPLOYMENT_AND_ONE_PUBLIC_SYNTHETIC_TOKEN_TRANSFER',
    fork:'osaka',transactionGasCap:'16777216',nodeCapRejectionObserved:true,
    proofAcceptanceEstablished:false,privateLifecycleEstablished:false,fullWalletAcceptance:false,
    productionClientAcceptanceEstablished:false,publicConsensusOrFinalityVerified:false};
}
