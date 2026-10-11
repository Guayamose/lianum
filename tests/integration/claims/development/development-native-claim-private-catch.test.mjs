/** Metadata/terminal-catch regressions only; no native node, key use or proof. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { privateFailureDiagnostic } from '../../../../packages/backend/src/execution/account/reconciliation/failure-diagnostics.mjs';
import {types} from 'node:util';
import {ROOT} from '@lianum/proofs/catalog';
import {ownedRuntimeRpc} from '@lianum/engine/chains/shared/runtime-harness';
import {privateNativeClaimBootstrapFirstErrorV1} from './development-native-claim-bootstrap-first-error-v1.mjs';
const source = readFileSync(new URL('./development-native-claim-flow.mjs', import.meta.url), 'utf8');
const begin = source.indexOf('  } catch (error) {\n    result.failedStage');
const end = source.indexOf('\n  } finally {', begin);
assert.ok(begin >= 0 && end > begin);
const body = source.slice(begin + '  } catch (error) {'.length, end);
const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
const originalCatch = new AsyncFunction('error', 'result', 'code', 'writeFixturePrivate', 'join', 'privateDirectory', 'audit', 'privateFailureDiagnostic', body);
async function exercise(error) {
  const row = { phase: 'redeem-original-btc-solver-payout', cleanup: {} };
  const writes = []; let audits = 0;
  await originalCatch(error, row, value => String(value.message).match(/CLAIM_[A-Z_]+/)?.[0],
    (path, value) => writes.push({ path, value }), join, '/private-audit', async () => { audits++; }, privateFailureDiagnostic);
  assert.equal(writes.length, 1); assert.equal(writes[0].path, '/private-audit/error-private.json');
  assert.equal(audits, 1);
  assert.equal(row.phase, 'failed'); assert.equal(row.success, false);
  assert.equal(row.failedStage, 'redeem-original-btc-solver-payout');
  return { row, saved: writes[0].value };
}
test('global original catch retains nested deadline budget privately without replacing its public error or terminal result', async () => {
  const cause = new Error('CLAIM_OPERATOR_AUDIT_TOO_OLD');
  cause.auditBudget = { phase: 'synchronous-v4-fence', method: 'presign-payout', round: 'pre-key', elapsedMilliseconds: 30001, limitMilliseconds: 30000 };
  const error = new Error('CLAIM_ATTESTATION_UNCERTAIN', { cause });
  error.fixtureCleanup = { closedController: false };
  const { row, saved } = await exercise(error);
  assert.equal(row.errorCode, 'CLAIM_ATTESTATION_UNCERTAIN'); assert.equal(row.cleanup.closedController, false);
  assert.equal(saved.message, error.message); assert.equal(saved.stack, error.stack); assert.equal(saved.cause, cause.stack);
  assert.deepEqual(saved.privateDiagnostic, { code: 'CLAIM_ATTESTATION_UNCERTAIN', causeCode: 'CLAIM_OPERATOR_AUDIT_TOO_OLD',
    causeCodes: ['CLAIM_OPERATOR_AUDIT_TOO_OLD'], auditBudget: cause.auditBudget });
  assert.equal(Object.hasOwn(row, 'privateDiagnostic'), false); assert.equal(Object.hasOwn(row, 'auditBudget'), false);
});
test('unknown RPC content receives only bounded diagnostic labels and does not synthesize an audit budget', async () => {
  const error = new Error('untrusted RPC comparison values', { cause: new Error('sensitive upstream payload') });
  const { saved } = await exercise(error);
  assert.deepEqual(saved.privateDiagnostic, { code: 'NATIVE_CLAIM_OPERATION_FAILED', causeCode: null, causeCodes: [] });
  assert.equal(Object.hasOwn(saved.privateDiagnostic, 'auditBudget'), false);
});

// Original formatter + original RPC error issuer with an inert fetch response.
// No socket, node, account, SDK, key, deployment or transaction is created.
function bootstrapCatch(){
 let fixture;
 try{fixture=readFileSync(new URL('../../fixtures/claims/lifecycle/owned-native-claim-fixture.mjs',import.meta.url),'utf8');}
 catch(error){if(error.code!=='ENOENT')throw error;fixture=readFileSync(join(ROOT,'integration/owned-native-claim-fixture.mjs'),'utf8');}
 const marker='  } catch (error) {\n    try { writeFixturePrivate',begin=fixture.indexOf(marker);
 const end=fixture.indexOf('throw error;',begin)+'throw error;'.length;
 assert.ok(begin>=0&&end>begin);
 return new AsyncFunction('error','runtime','writeFixturePrivate','join','directory',
  'privateNativeClaimBootstrapFirstErrorV1','fixture',fixture.slice(begin+'  } catch (error) {'.length,end));
}
test('HOST original bootstrap retains the deepest owned RPC cause before close without replacing errors',async()=>{
 const fetchDescriptor=Object.getOwnPropertyDescriptor(globalThis,'fetch');let remote;
 try{
  Object.defineProperty(globalThis,'fetch',{...fetchDescriptor,value:async()=>({ok:true,
   json:async()=>({error:{code:-32000,message:'PRIVATE-REMOTE-MESSAGE',data:'PRIVATE-REMOTE-DATA'}})})});
  try{await ownedRuntimeRpc('http://127.0.0.1:1','evm_mine',[]);}catch(error){remote=error;}
 }finally{Object.defineProperty(globalThis,'fetch',fetchDescriptor);}
 assert.ok(types.isNativeError(remote));assert.equal(remote.message,'OWNED_RPC_REMOTE_ERROR');
 const safeFrame='    at source ('+join(ROOT,'integration/claims/development/development-native-claim-flow.mjs')+':486:7)';
 remote.stack='Error: PRIVATE-STACK-MESSAGE\n'+safeFrame;
 const inner=new Error('FLAT_DEPLOYMENT_FAILED',{cause:remote});
 const outer=new Error('NATIVE_CLAIM_BOOTSTRAP_FAILED',{cause:inner}),calls=[];
 const cleanup={closedEvm:true},run=bootstrapCatch();
 await assert.rejects(run(outer,null,(path,value)=>{calls.push('write');
  assert.equal(path,'/fixed-private/bootstrap-first-error-private.json');
  assert.equal(value.causes.length,3);assert.equal(value.causes[2].errorType,'ERROR');
  assert.equal(value.causes[2].errorLabel,'OWNED_RPC_REMOTE_ERROR');
  assert.deepEqual(value.causes[2].rpc,{method:'evm_mine',rpcCode:-32000});
  assert.equal(value.causes[2].frames.length,1);assert.equal(value.causes[2].frames[0].line,486);
  assert.equal(value.causeChainTruncated,false);
  for(const sentinel of ['PRIVATE-REMOTE-MESSAGE','PRIVATE-REMOTE-DATA','PRIVATE-STACK-MESSAGE'])
   assert.equal(JSON.stringify(value).includes(sentinel),false);
 },join,'/fixed-private',privateNativeClaimBootstrapFirstErrorV1,{async close(){calls.push('close');return cleanup;}}),
 error=>error===outer);
 assert.deepEqual(calls,['write','close']);assert.equal(outer.cause,inner);assert.equal(inner.cause,remote);
 assert.equal(outer.fixtureCleanup,cleanup);
 const failingCalls=[];
 await assert.rejects(run(outer,null,()=>{failingCalls.push('write');throw Error('PRIVATE-STORAGE-FAILURE');},
  join,'/fixed-private',privateNativeClaimBootstrapFirstErrorV1,{async close(){failingCalls.push('close');return cleanup;}}),error=>error===outer);
 assert.deepEqual(failingCalls,['write','close']);
});
test('HOST original bootstrap diagnostic rejects opaque causes and arbitrary RPC methods without evaluating accessors',async()=>{
 let reads=0;
 const opaque={get message(){reads++;throw Error('PRIVATE');},get stack(){reads++;throw Error('PRIVATE');},get cause(){reads++;throw Error('PRIVATE');}};
 const proxy=new Proxy(new Error('PRIVATE'),{get(){reads++;throw Error('PRIVATE');},getPrototypeOf(){reads++;throw Error('PRIVATE');},getOwnPropertyDescriptor(){reads++;throw Error('PRIVATE');}});
 for(const error of [opaque,proxy]){
  const value=privateNativeClaimBootstrapFirstErrorV1(error);
  assert.equal(value.causes.length,1);assert.equal(value.causes[0].errorType,'THROWN_VALUE');
  assert.deepEqual(value.causes[0].frames,[]);assert.equal(value.causes[0].rpc,null);
 }
 const native=new Error('PRIVATE');Object.defineProperty(native,'cause',{get(){reads++;throw Error('PRIVATE');}});
 assert.equal(privateNativeClaimBootstrapFirstErrorV1(native).causes.length,1);assert.equal(reads,0);
 const copy=new Error('OWNED_RPC_REMOTE_ERROR');copy.rpcCode=-32000;copy.rpc={method:'evm_mine',rpcCode:-32000};
 assert.equal(privateNativeClaimBootstrapFirstErrorV1(copy).causes[0].rpc,null);
 const fetchDescriptor=Object.getOwnPropertyDescriptor(globalThis,'fetch');let arbitrary;
 try{
  Object.defineProperty(globalThis,'fetch',{...fetchDescriptor,value:async()=>({ok:true,
   json:async()=>({error:{code:-32000,message:'PRIVATE-REMOTE-MESSAGE'}})})});
  try{await ownedRuntimeRpc('http://127.0.0.1:1','arbitraryCallerMethod',[]);}catch(error){arbitrary=error;}
 }finally{Object.defineProperty(globalThis,'fetch',fetchDescriptor);}
 assert.deepEqual(privateNativeClaimBootstrapFirstErrorV1(arbitrary).causes[0].rpc,{method:null,rpcCode:-32000});
 let chain=new Error('PRIVATE');for(let i=0;i<6;i++)chain=new Error('PRIVATE',{cause:chain});
 const bounded=privateNativeClaimBootstrapFirstErrorV1(chain);assert.equal(bounded.causes.length,4);assert.equal(bounded.causeChainTruncated,true);
 const cycle=new Error('PRIVATE');cycle.cause=cycle;const cyclic=privateNativeClaimBootstrapFirstErrorV1(cycle);
 assert.equal(cyclic.causes.length,1);assert.equal(cyclic.causeChainTruncated,true);
});
