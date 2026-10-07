/** Execute only the source-extracted evidence checkpoint. Never import/run the
 * funded harness. The journal is synthetic; the safe projection is production. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { captureLoadedV3RedemptionAudit } from './native-claim-loaded-v3-policy.mjs';
const source=readFileSync(new URL('./native-claim-flow.mjs',import.meta.url),'utf8');
const duplicate=source.indexOf("assert.equal(runtime.transactions.length, burnCount, 'NATIVE_CLAIM_DUPLICATE_BURN');");
const begin=source.indexOf('        if (loadedV3Profile) {',duplicate),end=source.indexOf('        let paid = await controller.payout',begin);
assert.ok(duplicate>=0&&begin>duplicate&&end>begin);
const checkpoint=source.slice(begin,end);
const record=()=>({stage:'REDEEM',method:'requestRedemption',status:'SUCCEEDED',receipt:{status:'0x1'},
  signed:{nativeId:'PRIVATE_SYNTHETIC_ID',nativeWire:'PRIVATE_SYNTHETIC_WIRE',signature:'PRIVATE_SYNTHETIC_SIGNATURE'},prepared:{private:'PRIVATE_SYNTHETIC_PREPARATION'},
  finalAudit:{profile:'CLAIM_EVM_ORIGINAL_CERTIFICATE_FINAL_AUDIT_V4',phase:'CONSUMED_BEFORE_KEY',limitMilliseconds:30000,
    auditElapsedMilliseconds:29999,originalAuthorizationSHA256:'11'.repeat(32),preparedSHA256:'22'.repeat(32)}});
function execute(environment){return vm.runInThisContext('(async function({loadedV3Profile,ownedClaimControllerJournal,controllerKeeper,runtime,claims,result,captureLoadedV3RedemptionAudit,save}){'+checkpoint+'})')({...environment,captureLoadedV3RedemptionAudit});}
test('consumed REDEEM audit is safely saved before later payout failure from original live journal only',async()=>{
  const controllerKeeper={},runtime={},claims={},result={},retained=record(),before=structuredClone(retained);let reads=0,saved;
  await execute({loadedV3Profile:true,controllerKeeper,runtime,claims,result,
    ownedClaimControllerJournal(k,r,c){assert.equal(k,controllerKeeper);assert.equal(r,runtime);assert.equal(c,claims);return {async read(){reads++;return {evm:[retained]};}};},
    save(){saved=structuredClone(result);}});
  assert.equal(reads,1);assert.deepEqual(retained,before);assert.deepEqual(saved.redemptionAuthorization,captureLoadedV3RedemptionAudit([retained]));
  assert.equal(JSON.stringify(saved).includes('PRIVATE_SYNTHETIC'),false);
  assert.throws(()=>{throw Error('LATER_PAYOUT_FAILED');},/LATER_PAYOUT_FAILED/);
  assert.deepEqual(result.redemptionAuthorization,saved.redemptionAuthorization);
});
test('evidence checkpoint remains loaded-V3-only and missing consumed audit cannot be fabricated',async()=>{
  let calls=0;const dependencies={ownedClaimControllerJournal(){calls++;return {async read(){return {evm:[]};}};},save(){calls++;},result:{}};
  await execute({...dependencies,loadedV3Profile:false});assert.equal(calls,0);
  await assert.rejects(execute({...dependencies,loadedV3Profile:true}),/ONE_REDEMPTION_DISPATCH/);assert.equal(calls,1);
  assert.deepEqual(dependencies.result,{});
});
