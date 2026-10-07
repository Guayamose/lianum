/** Actual source-only physical guard closures. These lower inert runtime ports
 * cannot issue production brands; no node, compiler, prover or native key runs. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { exactRecord, bytes32 } from '../paeg/commitments.mjs';
import { cloneInput as copy, frozenInput as freeze, inputUint } from '../paeg/readiness-inputs.mjs';
const source = readFileSync(new URL('./wrapped-claim-graph-operators-v1.mjs', import.meta.url), 'utf8');
const a = source.indexOf('function graphNativeProjectionV4('), b = source.indexOf('function assertMessageWindowV4(', a);
assert.ok(a > 0 && b > a);
const operations = new WeakMap();
const readWrappedGraphDispatchOperationV4 = token => { const read = operations.get(token); assert.ok(read, 'TEST_ORIGINAL_OPERATION_REQUIRED'); return freeze(copy(read())); };
const api = new Function('assert','copy','freeze','inputUint','exactRecord','bytes32','readWrappedGraphDispatchOperationV4','equal',
  source.slice(a,b) + '\nreturn {graphNativeStateV4,graphNativeProjectionV4};')(assert,copy,freeze,inputUint,exactRecord,bytes32,readWrappedGraphDispatchOperationV4,assert.deepEqual);
const h = digit => digit.repeat(64);
function fixture(family = 'EVM') {
  const state = { profile:'OWNED_WRAPPED_GRAPH_NATIVE_AUDIT_STATE_V4',family,lifetimeId:h('1'),genesis:h('2'),readGeneration:'0',activeReads:0,readsIdle:true,
    mutationGeneration:'4',activeMutations:1,busy:true,closed:false,uncertain:false,pending:true,adverseHistory:false,
    ...(family === 'EVM' ? {transactions:[],receipts:[],lifecycle:[],lastTimestamp:'1000'} : {entry:{phase:'KEY_PENDING'},journal:[]}) };
  const rows = [{profileCommitment:h('3'),state}], token = Object.freeze(Object.create(null));
  const descriptor = {profile:'WRAPPED_GRAPH_DISPATCH_OPERATION_V4',profileCommitment:h('3'),family,lifetimeId:h('1'),phase:'native-key',
    prepared:{unsignedWire:'0011',intent:{amount:'1'}},signed:null,nativeAuditStarted:0};
  operations.set(token, () => ({...descriptor,physicalState:state}));
  return {rows,token,state,descriptor};
}
for (const family of ['EVM','TRON']) test('fixed GRAPH physical guard accepts only exact '+family+' operation plus idle sibling', () => {
  const f = fixture(family), sibling = copy(f.rows[0]); sibling.profileCommitment=h('4'); sibling.state.lifetimeId=h('5');
  Object.assign(sibling.state,{busy:false,pending:false,activeMutations:0}); f.rows.push(sibling);
  assert.equal(api.graphNativeStateV4(f.rows,f.token),f.rows);
  sibling.state.busy=true; assert.throws(()=>api.graphNativeStateV4(f.rows,f.token),/STATE_busy/);
  sibling.state.busy=false; sibling.state.pending=true; assert.throws(()=>api.graphNativeStateV4(f.rows,f.token),/STATE_pending/);
  sibling.state.pending=false; sibling.state.activeMutations=1; assert.throws(()=>api.graphNativeStateV4(f.rows,f.token),/MUTATION_IN_FLIGHT/);
});
for (const change of ['family','lifetime','phase','profile','activeReads','adverse','uncertain','copy']) test('fixed GRAPH physical guard rejects '+change, () => {
  const f=fixture();
  if(change==='family')f.descriptor.family='TRON'; if(change==='lifetime')f.descriptor.lifetimeId=h('9');
  if(change==='phase')f.descriptor.phase='caller-selected'; if(change==='profile')f.descriptor.profileCommitment=h('9');
  if(change==='activeReads')f.state.activeReads=1;if(change==='adverse')f.state.adverseHistory=true;if(change==='uncertain')f.state.uncertain=true;
  assert.throws(()=>api.graphNativeStateV4(f.rows,change==='copy'?{...f.token}:f.token));
});
test('cross-signer GRAPH progress allows monotonic reads only; every physical history and mutation fence stays exact',()=>{
  const f=fixture(),before=copy(f.rows);f.state.readGeneration='2';api.graphNativeProjectionV4(before,f.rows);
  assert.throws(()=>api.graphNativeProjectionV4(f.rows,before),/READ_GENERATION_ROLLBACK/);
  for(const key of ['mutationGeneration','lifetimeId','lastTimestamp']){const changed=copy(f.rows);changed[0].state[key]='9';assert.throws(()=>api.graphNativeProjectionV4(f.rows,changed));}
  const changed=copy(f.rows);changed[0].state.transactions.push({phase:'unknown'});assert.throws(()=>api.graphNativeProjectionV4(f.rows,changed));
});
test('reverse claim ticket is completed inside original serial after final awaits and fixed native quiescence',()=>{
  const claim=readFileSync(new URL('../native-claims/wrapped-operators-v1.mjs',import.meta.url),'utf8');
  const start=claim.indexOf('if (reverseCoverageTicketsV4.has(result))'),capture=claim.indexOf('reverseCoverageStatesV4.set(result, snapshot)',start);
  const body=claim.slice(start,capture);
  assert.ok(body.includes('await readVault(); await current();'));
  assert.ok(body.includes('await quiesceOwnedOperatorNativeReads([...nativeReads.values()])'));
  assert.ok(body.includes('performance.now() - started'));assert.ok(claim.indexOf('return result;',capture)>capture);
  assert.ok(source.includes('consumeWrappedGraphOperatorKeyLeaseV4'));assert.ok(!source.includes('signWrappedGraphAuthorizationV1'));
  const combined=readFileSync(new URL('./wrapped-claim-combined-operators-v1.mjs',import.meta.url),'utf8');
  assert.ok(!combined.includes('export function signWrappedGraphAuthorizationV1'));assert.ok(combined.includes('consumeWrappedGraphOperatorKeyLeaseV4(lease, token, kind, message, policy, frame)'));
});
