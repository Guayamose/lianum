import {privateAssemblyRevocationDigest} from '../src/private-assembly-revocations.mjs';
/** HOST-ONLY mocks: no native node, backend, proof generation or deployment.
 * Mock verifier successes exercise boundaries, never cryptographic evidence. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { syntheticSetup } from '../experiments/private-core-proof/native-notes/fixtures.mjs';
import { assemblySchema } from '../src/private-assembly-encoding.mjs';
import { wordsBE } from '../src/private-note-encoding.mjs';
import { PrivateNoteTree, ZERO_NOTE_HASH, privateSpentDigest, privateEffectDigest } from '../src/private-note-tree.mjs';
import { privateRootHistoryDigest } from '../src/private-assembly-history.mjs';
import { base58Encode } from '../src/chains/solana-runtime.mjs';
import { assertAssemblyReadinessSnapshot, createAssemblyNativeDispatch, assemblyProofDigest, assemblyEvmProof, assemblyFieldInventory } from '../src/private-assembly-native-dispatch.mjs';

const hash = b => `0x${b.toString('hex')}`;
const hwords = h => wordsBE(Buffer.from(h.replace(/^0x/, ''), 'hex')).map(String);
function fixture(role = 'sol') {
  const { graph: g, epoch } = syntheticSetup(), l = g[role], scope = hash(g.scope), policy = hash(g.policy), tree = new PrivateNoteTree([g.reserved]);
  const terms = { scope: scope.slice(2), policy: policy.slice(2), role, originSlot: role === 'sol' ? 1 : 2, origin: g[`${role}Note`].origin.toString('hex'), value: g[`${role}Note`].value.toString(), descriptor: Object.fromEntries(['chain','nonce','source','recipient','amount','executeAfter','executeBefore','validFrom','validUntil'].map(key => [key, Buffer.isBuffer(l[key]) ? l[key].toString('hex') : key === 'chain' ? l[key] : l[key].toString()])) };
  const bridgeToken = randomBytes(32).toString('hex'), binding = { role, bridgeToken, terms, paymentCommitment: l.payout.toString('hex'), localCommitment: l.commitment.toString('hex') };
  const history = [new PrivateNoteTree().root, tree.root];
  const state = { blockNumber: '0x1', blockHash: '0x'+'11'.repeat(32), blockTimestamp: (epoch*600n+10n).toString(), epoch: epoch.toString(), scope, policy, root: tree.root, stateSequence:'1', sequence:'1', leafCount:1, liveReservations:1,liveOutputNotes:0,spentCount:0,leaves:[hash(g.reserved),...Array(63).fill(ZERO_NOTE_HASH)],nullifiers:Array(64).fill(ZERO_NOTE_HASH),spentDigest:privateSpentDigest(scope,[]),solEffects:Array(64).fill(ZERO_NOTE_HASH),btcEffects:Array(64).fill(ZERO_NOTE_HASH),solEffectCount:0,btcEffectCount:0,solEffectDigest:privateEffectDigest('SOL',scope,[]),btcEffectDigest:privateEffectDigest('BTC',scope,[]),rootHistory:[...history,...Array(63).fill(ZERO_NOTE_HASH)],rootHistoryCount:2,rootHistoryDigest:privateRootHistoryDigest(scope,history),revocationCoverageHalted:false,solRevokedCount:0,solRevokedEffects:Array(64).fill(ZERO_NOTE_HASH),solRevokedDigest:privateAssemblyRevocationDigest(scope,[]) };
  const publicInputs = [...hwords(hash(assemblySchema(`${role}_ready`))),...hwords(scope),...hwords(policy),state.epoch,...hwords(state.rootHistoryDigest),'2',...hwords(state.root),...hwords(state.spentDigest),'0','1',...hwords('0x'+binding.localCommitment),'0',...(role==='btc'?[...hwords(state.solEffectDigest),'0',...hwords(state.solRevokedDigest),'0']:[])];
  const proof = {version:1, mode:`${role}_ready`,target:'evm',proofBase64:Buffer.from('HOST MOCK ONLY').toString('base64'),publicInputs};
  return {binding,state,proof,bridgeToken,role};
}
function service(f, opts={}) {
  let signing=0, dispatched=0, remembered, observed, callbacks;
  const handles=new WeakMap(); const events=[];
  const pool={scope:f.state.scope,policy:f.state.policy,snapshot:async()=>structuredClone(f.state),verify:async()=>opts.verify!==false};
  const runtime={evm:async()=>({hash:opts.changedHeader?'0x'+'ee'.repeat(32):f.state.blockHash})};
  const bridge={policy:{chainDomain:{chain:f.role.toUpperCase()}},async dispatch(request){dispatched++;opts.beforeAuthorize?.();await callbacks.authorizeLocalInvocation(request,this.policy);signing++;await callbacks.retainSignedDispatch(request,{fakeSignedData:'HOST_MOCK_NOT_TRANSACTION'},this.policy);const handle={};handles.set(handle,{});return{handle,nativeReceipt:{mock:true}};},async observeAndCertify(handle){assert.ok(handles.has(handle));observed=handle;return{mockCertificate:true};}};
  const broker=createAssemblyNativeDispatch({role:f.role,bridgeToken:f.bridgeToken,createBridge:c=>(callbacks=c,bridge),recipientAck:async input=>({acknowledged:opts.ack!==false,paymentCommitment:input.paymentCommitment,localCommitment:input.localCommitment}),nativeDestination:base58Encode(Buffer.from(f.binding.terms.descriptor.recipient,'hex')),nowSeconds:()=>f.state.blockTimestamp,onEvent:x=>events.push(x)});
  broker.attachPool(pool,runtime);broker.retainBinding(f.binding);broker.attachAuthority(()=>({remember(handle){remembered=handle;},async observeAndPermit(){throw Error('not invoked in this host test');}}));
  return{broker,events,get signing(){return signing;},get dispatched(){return dispatched;},get remembered(){return remembered;},get observed(){return observed;}};
}
test('exact R_SOL61 and R_BTC79 boundaries bind canonical history/state/own C',()=>{
  for(const role of ['sol','btc']){const f=fixture(role);assert.equal(f.proof.publicInputs.length,role==='sol'?61:79);assertAssemblyReadinessSnapshot(role,f.proof,f.state,f.binding);for(const offset of [8,16,24,25,33,34,42,50,51,52,60,...(role==='btc'?[61,69,70,78]:[])]){const changed=structuredClone(f.proof);changed.publicInputs[offset]=(BigInt(changed.publicInputs[offset])+1n).toString();assert.throws(()=>assertAssemblyReadinessSnapshot(role,changed,f.state,f.binding),/PC18_READINESS_STALE_OR_MISMATCH/);}}
});
test('pre-sign preflight rejects missing/genuine-false/stale proof, wrong token, no ACK and changed canonical header',async()=>{
  for(const opt of [{verify:false},{ack:false},{changedHeader:true},{}]){const f=fixture(),s=service(f,opt);const p=structuredClone(f.proof);if(!Object.keys(opt).length)p.publicInputs[51]='2';await assert.rejects(s.broker.dispatch({bridgeToken:f.bridgeToken,readiness:p}));assert.equal(s.signing,0);assert.equal(s.dispatched,0);assert.equal(s.broker.audit().phase,'READY');}
  const f=fixture(),s=service(f);await assert.rejects(s.broker.dispatch({bridgeToken:'00'.repeat(32),readiness:f.proof}),/PC18_DISPATCH_CAPABILITY/);await assert.rejects(s.broker.dispatch({bridgeToken:f.bridgeToken,readiness:null}));assert.equal(s.signing,0);
});
test('stale preflight permits fresh public-state retry, genuine bridge dispatch is one-use, retained handle survives owner absence',async()=>{
  const f=fixture(),s=service(f),stale=structuredClone(f.proof);stale.publicInputs[51]='0';await assert.rejects(s.broker.dispatch({bridgeToken:f.bridgeToken,readiness:stale}),/PC18_READINESS_STALE_OR_MISMATCH/);await s.broker.dispatch({bridgeToken:f.bridgeToken,readiness:f.proof});assert.equal(s.signing,1);await assert.rejects(s.broker.dispatch({bridgeToken:f.bridgeToken,readiness:f.proof}),/PC18_DISPATCH_CAPABILITY_USED_OR_BUSY/);await s.broker.certify(f.bridgeToken);assert.equal(s.remembered,s.observed);assert.equal(s.broker.audit().retainedNativeHandle,true);assert.equal(s.events.filter(x=>x.operation==='genuine-readiness-current-header-ack').length,2);assert.ok(BigInt(s.broker.audit().authorizedAtNs)<=BigInt(s.broker.audit().firstSignedAtNs));
});
test('deadline, mutated own opening, duplicate binding and sibling-role substitution fail closed',()=>{
  const f=fixture();const late=structuredClone(f.state);late.blockTimestamp=f.binding.terms.descriptor.executeBefore;late.epoch=(BigInt(late.blockTimestamp)/600n).toString();const rp=structuredClone(f.proof);rp.publicInputs[24]=late.epoch;assert.throws(()=>assertAssemblyReadinessSnapshot('sol',rp,late,f.binding),/PC18_DISPATCH_DEADLINE/);const bad=structuredClone(f.binding);bad.terms.descriptor.amount='1';assert.throws(()=>assertAssemblyReadinessSnapshot('sol',f.proof,f.state,bad),/PC18_DISPATCH_LOCAL_OPENING/);const s=service(f);assert.throws(()=>s.broker.retainBinding(f.binding),/PC18_DISPATCH_BINDING_PHASE/);assert.throws(()=>assertAssemblyReadinessSnapshot('btc',f.proof,f.state,f.binding));
});
test('public audit contains hashes/field inventories without own descriptor, token, proof statement or receipt',async()=>{
  const f=fixture(),s=service(f);await s.broker.dispatch({bridgeToken:f.bridgeToken,readiness:f.proof});const text=JSON.stringify(s.broker.audit());for(const secret of [f.bridgeToken,f.binding.terms.origin,f.binding.terms.descriptor.nonce,'HOST_MOCK_NOT_TRANSACTION',JSON.stringify(f.proof.publicInputs)])assert.ok(!text.includes(secret));const p=assemblyProofDigest(f.proof);assert.equal(p.statementWords,61);assert.ok(!Object.hasOwn(p,'publicInputs'));const evm=assemblyEvmProof(f.proof);assert.equal(evm.publicInputs.length,61);assert.ok(evm.publicInputs.every(x=>/^0x[0-9a-f]{64}$/.test(x)));assert.deepEqual(assemblyFieldInventory({a:{b:3},array:[1]}),['a','a.b','array']);
});

test('late state race after preflight burns immutable bridge attempt and fails closed without signing or reset',async()=>{
  const f=fixture(),s=service(f,{beforeAuthorize(){f.state.stateSequence='2';f.state.sequence='2';}});
  await assert.rejects(s.broker.dispatch({bridgeToken:f.bridgeToken,readiness:f.proof}),/PC18_READINESS_STALE_OR_MISMATCH/);
  assert.equal(s.dispatched,1);assert.equal(s.signing,0);assert.equal(s.broker.audit().phase,'FAILED_OR_AMBIGUOUS');
  const refreshed=structuredClone(f.proof);refreshed.publicInputs[51]='2';
  await assert.rejects(s.broker.dispatch({bridgeToken:f.bridgeToken,readiness:refreshed}),/PC18_DISPATCH_CAPABILITY_USED_OR_BUSY/);
  assert.equal(s.dispatched,1);assert.equal(s.signing,0);
});
test('native integration import is inert and execution refuses without both explicit native and recovery approvals',async()=>{
  const {runAssemblyNativeIntegration}=await import('../scripts/integration-private-assembly-native.mjs');
  await assert.rejects(runAssemblyNativeIntegration(),/PC18_EXPLICIT_POST_CAPABILITY_NATIVE_GO_REQUIRED/);
  await assert.rejects(runAssemblyNativeIntegration({authorizedNativeRun:true}),/PC18_RECOVERY_ISSUANCE_ONLY_APPROVAL_REQUIRED/);
  await assert.rejects(runAssemblyNativeIntegration({authorizedNativeRun:true,refundIssuanceOnly:true}),/PC18_REVISION4_REPAIR_REQUIRED_BEFORE_NATIVE_RUN/);
});

test('v2 stale-after-adverse state and global coverage halt deny both roles before signing',async()=>{for(const role of ['sol','btc']){const f=fixture(role),s=service(f);f.state.solRevokedEffects[0]='0x'+'21'.repeat(32);f.state.solRevokedCount=1;f.state.solRevokedDigest=privateAssemblyRevocationDigest(f.state.scope,f.state.solRevokedEffects,1);f.state.stateSequence=f.state.sequence='2';await assert.rejects(s.broker.dispatch({bridgeToken:f.bridgeToken,readiness:f.proof}),/READINESS_STALE/);assert.equal(s.signing,0);const halted=fixture(role),hs=service(halted);halted.state.solRevokedEffects=Array.from({length:64},(_,i)=>'0x'+BigInt(i+1).toString(16).padStart(64,'0'));halted.state.solRevokedCount=64;halted.state.solRevokedDigest=privateAssemblyRevocationDigest(halted.state.scope,halted.state.solRevokedEffects);halted.state.revocationCoverageHalted=true;await assert.rejects(hs.broker.dispatch({bridgeToken:halted.bridgeToken,readiness:halted.proof}),/REVOCATION_COVERAGE_HALTED/);}});
