/** Pure report/command gates only: importing the CLI must not start a runtime,
 * create a native acceptance artifact, invoke a prover or open a listener. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {publicProofMetrics, publicRuntimeResources, publicPoolCounters, requireCommandOutcome, runSharedPrivateAccountsAcceptance, m26RunProfile, M26_ARGUMENT, M26_BALANCE_ARGUMENT} from '../../../../scripts/engine/integration/accounts/integration-shared-private-accounts.mjs';

test('M26 evidence projection never exports recursive tuples, native wires or private diagnostic strings', () => {
  const secret = 'private-should-never-export';
  const result = publicProofMetrics({classification:'REAL_PC18_PROOF_ATTEMPT_PUBLIC_METRICS_ONLY',mode:'join',target:'noir-recursive',phase:'completed',
    startedAt:'2026-10-03T00:00:00.000Z',proofGenerated:true,verified:true,proofMilliseconds:123,maximumPages:32768,proofSHA256:'a'.repeat(64),publicInputsSHA256:'b'.repeat(64),
    publicInputs:[secret],proof:secret,proofFields:[secret],vkFields:[secret],wire:secret,label:secret,failure:{message:secret},
    resources:{rss:32,freeDisk:100,secret},processResourceUsage:{maxRSS:64,secret}});
  assert.equal(result.mode, 'join'); assert.equal(result.verified, true); assert.equal(result.proofMilliseconds, 123);
  assert.deepEqual(result.resources, {freeDisk:100,rss:32});
  assert.equal(JSON.stringify(result).includes(secret), false);
  assert.equal(Object.hasOwn(result, 'publicInputs'), false);
  assert.equal(Object.hasOwn(result, 'proofSHA256'), false);
  assert.equal(Object.hasOwn(result, 'publicInputsSHA256'), false);
  assert.equal(publicProofMetrics({proofMilliseconds:NaN,totalMilliseconds:-1}).proofMilliseconds, undefined);
});

test('M26 cleanup cannot claim all native runtimes exited when one has no observed exit', () => {
  const result = publicRuntimeResources({kind:'private-owned-runtime-resource-summary',floorsUnchanged:true,sampleCount:2,
    processPeaks:{evm:{pid:123,exitedObserved:true,rssBytes:100},btc:{pid:456,exitedObserved:true},sol:{pid:789,exitedObserved:false}},
    stages:{AFTER_CLOSE:1,privateLabel:'secret'},wire:'secret'});
  assert.equal(result.exactOwnedRuntimesExited, false);
  assert.equal(Object.hasOwn(result.processPeaks.evm, 'pid'), false);
  assert.equal(JSON.stringify(result).includes('secret'), false);
  assert.throws(() => publicRuntimeResources({kind:'not-a-summary'}), /PC26_RESOURCE_SUMMARY_REQUIRED/);
});

test('M26 expected one-owner refusal is distinct from a failed successful command', () => {
  const snapshot = {requests:[{id:'request_1',state:'FAILED',errorCode:'PC26_ROUND_NOT_READY'}],lastControl:null};
  assert.equal(requireCommandOutcome(snapshot,'request_1','PC26_ROUND_NOT_READY').state, 'FAILED');
  assert.throws(() => requireCommandOutcome(snapshot,'request_1'), /PC26_ROUND_NOT_READY/);
  assert.throws(() => requireCommandOutcome(snapshot,'request_1','PC26_OTHER_ERROR'), /PC26_UNEXPECTED_COMMAND_ERROR/);
  assert.throws(() => requireCommandOutcome(snapshot,'missing'), /PC26_COMMAND_RESULT_MISSING/);
  assert.equal(requireCommandOutcome({requests:[],lastControl:{id:'control_1',state:'FINISHED',errorCode:null}},'control_1').state, 'FINISHED');
});

test('M26 material equality ignores block advancement but observes any custody or native effect', () => {
  const registry = [{assetId:'eth',kind:'NATIVE'},{assetId:'palt',kind:'ERC20'}];
  const snapshot = {leafCount:2,spentCount:0,liveReservations:0,liveOutputNotes:2,solEffectCount:0,btcEffectCount:0,backedAmount:'5000000',assetBalance:'5000000',assetDeficit:'0',blockNumber:'0x1',leaves:['private']};
  const inspected = {trackedAssetPoolCount:2,pools:registry.map(asset => ({assetId:asset.assetId,snapshot:{...snapshot}}))};
  const before = publicPoolCounters(inspected,registry);
  inspected.pools[1].snapshot.blockNumber = '0x2';
  assert.deepEqual(publicPoolCounters(inspected,registry),before);
  inspected.pools[1].snapshot.btcEffectCount++;
  assert.notDeepEqual(publicPoolCounters(inspected,registry),before);
  assert.equal(JSON.stringify(before).includes('private'),false);
});

test('M26 run rejects missing or extra authorization arguments before loading native modules', async () => {
  await assert.rejects(runSharedPrivateAccountsAcceptance([]), /PC26_EXPLICIT_FIXED_LOCAL_AUTHORIZATION/);
  await assert.rejects(runSharedPrivateAccountsAcceptance(['--authorized-local-shared-private-accounts','extra']), /PC26_EXPLICIT_FIXED_LOCAL_AUTHORIZATION/);
});

test('M26 balance recovery is an explicit separate profile with no paid-round attribution',()=>{
  assert.equal(m26RunProfile([M26_ARGUMENT]),'PAID_COHORT');
  assert.equal(m26RunProfile([M26_ARGUMENT,M26_BALANCE_ARGUMENT]),'BALANCE_RECOVERY_ONLY');
  for(const argv of [[M26_BALANCE_ARGUMENT],[M26_ARGUMENT,M26_BALANCE_ARGUMENT,'extra'],[M26_BALANCE_ARGUMENT,M26_ARGUMENT]])assert.throws(()=>m26RunProfile(argv),/PC26_EXPLICIT_FIXED_LOCAL_AUTHORIZATION/);
});
