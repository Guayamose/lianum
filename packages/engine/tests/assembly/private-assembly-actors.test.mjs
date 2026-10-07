import {createAssemblyQueueBudget} from '../../src/assembly/private-assembly-actors.mjs';
import {privateAssemblyRevocationDigest} from '../../src/assembly/private-assembly-revocations.mjs';
/** HOST-ONLY TEST DOUBLES. No Noir/bb import, native runtime, network, funds,
 * deployment, real proof generation or proof-validity claim in this file. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { spawn } from 'node:child_process';
import {
  createAssemblyOwner, createAssemblyProducer, createAssemblyAssembler, assemblyActorPublicInputs,
  validateAssemblyProofPackage, decodeAssemblyProofPackage, assemblyPackageDigest,
  createAssemblyFrameDecoder, encodeAssemblyFrame, attachAssemblyControl, launchAssemblyProcess, createAssemblyProofWorkerRunner, createAssemblyVerificationWorkerRunner,
  ASSEMBLY_IPC_MAX_BYTES, ASSEMBLY_PROOF_MAX_BYTES, ASSEMBLY_OPERATION_INVENTORY,
} from '../../src/assembly/private-assembly-actors.mjs';
import { assemblyBackendVerificationPackage } from '../../src/assembly/private-assembly-actor-process.mjs';
import { ASSEMBLY_PUBLIC_WORDS, ASSEMBLY_RECURSIVE_MODES } from '../../src/assembly/private-assembly-encoding.mjs';
import { freshKey, signature, invoiceFrame, paymentCommitment, localCommitment, policyCommitment } from '../../src/notes/private-note-encoding.mjs';
import { PrivateNoteTree, privateSpentDigest, privateEffectDigest, noteWordsToHash, ZERO_NOTE_HASH } from '../../src/notes/private-note-tree.mjs';
import { privateRootHistoryDigest, PRIVATE_EMPTY_NOTE_ROOT } from '../../src/assembly/private-assembly-history.mjs';
import { encodeNativeCertificate, PRIVATE_NATIVE_PROFILE } from '../../src/notes/private-native-certificate.mjs';
import { base58Encode } from '../../src/chains/solana/solana-runtime.mjs';

const h = () => randomBytes(32).toString('hex');
const modes = ['reserve', ...Object.keys(ASSEMBLY_PUBLIC_WORDS)];
const mockField = mode => ((1n << 200n) + BigInt(modes.indexOf(mode) + 1)).toString();
const mockFields = mode => Array(458).fill(mockField(mode));
const mockVk = mode => Array(115).fill(String(modes.indexOf(mode) + 1));
const mockBytes = mode => ASSEMBLY_RECURSIVE_MODES.includes(mode)
  ? Buffer.concat(mockFields(mode).map(f => Buffer.from(BigInt(f).toString(16).padStart(64, '0'), 'hex')))
  : Buffer.from(`HOST-ONLY-TEST-PROOF:${mode}`);
const mockPins = () => Object.fromEntries(ASSEMBLY_RECURSIVE_MODES.map(mode => [mode, {
  target: 'noir-recursive', keySHA256: h(), circuitSHA256: h(), statementWords: ASSEMBLY_PUBLIC_WORDS[mode], vkFields: mockVk(mode),
}]));
function hostOnlyCallbacks(calls = []) {
  return {
    async proveAssembly(mode, input) {
      calls.push({ mode, keys: Object.keys(input), input: structuredClone(input) });
      return { proof: mockBytes(mode), publicInputs: assemblyActorPublicInputs(mode, input),
        ...(ASSEMBLY_RECURSIVE_MODES.includes(mode) ? { vkFields: mockVk(mode), proofFields: mockFields(mode) } : {}),
        metrics: { deliberatelyNotExported: 'owner witness must never be projected from backend metadata' } };
    },
    async proveReserve(mode, input) { return this.proveAssembly(mode, input); },
    async verifyAssembly(mode, pkg) { return Buffer.from(pkg.proof).equals(mockBytes(mode)); },
  };
}
function setup() {
  const keys = { sol: freshKey(), btc: freshKey() }, policy = { minimumBtcConfirmations: 6 };
  for (const role of ['sol', 'btc']) policy[role] = { policyId: h(), identityNamespace: h(), genesis: h(), x: keys[role].x.toString('hex'), y: keys[role].y.toString('hex') };
  const config = { plan: { scope: h(), policy, epoch: '1000', sourceSol: h(), recipientSol: h(), recipientBtc: h(), claimEpoch: '1012' }, bridgeTokens: { sol: h(), btc: h() } };
  return { config, keys, calls: [], pins: mockPins() };
}
function invoice(terms) {
  // Independent recipient signing key never goes to the owner API.
  const key = freshKey(), note = { type: 2, origin: terms.origin, x: key.x.toString('hex'), y: key.y.toString('hex'), value: terms.value, secret: h() };
  const payout = paymentCommitment(terms.scope, note).toString('hex');
  const local = localCommitment(terms.scope, terms.policy, { ...terms.descriptor, payout }).toString('hex');
  return { version: 1, role: terms.role, scope: terms.scope, policy: terms.policy, originSlot: terms.originSlot, paymentCommitment: payout, localCommitment: local,
    invoiceSignature: signature(key, invoiceFrame(terms.scope, local, payout)).toString('hex'), note };
}
function certificate(pkg, key, at = '600100') {
  const role = pkg.role, d = pkg.terms.descriptor, p = pkg.policy[role], sol = role === 'sol';
  const c = { version: 1, profile: PRIVATE_NATIVE_PROFILE, policyId: p.policyId, identityNamespace: p.identityNamespace,
    chainDomain: { chain: role.toUpperCase(), genesis: p.genesis },
    canonicalEffect: sol ? { signature: base58Encode(randomBytes(64)), instructionIndex: 0 } : { txid: h(), vout: 0 },
    localInstructionCommitment: pkg.invoice.localCommitment, source: d.source, recipientOrScriptHash: d.recipient, amount: d.amount, success: true,
    finalityKind: sol ? 'SOL_FINALIZED' : 'BTC_CONFIRMATIONS', finalityMeasure: sol ? '1' : '6', observedBlockIdentity: h(), observedBlockNumber: '1',
    observedTipIdentity: sol ? '00'.repeat(32) : h(), observedTipNumber: sol ? '1' : '6', observedAt: at,
    validFromEpoch: d.validFrom, validUntilEpoch: d.validUntil, opaqueTag: h() };
  return { certificate: c, signature: signature(key, encodeNativeCertificate(c)).toString('hex'), issuerPublicKey: { x: p.x, y: p.y } };
}
async function prepared(f = setup()) {
  const callbacks = hostOnlyCallbacks(f.calls); callbacks.proveReserve = callbacks.proveAssembly;
  const owner = createAssemblyOwner(f.config, callbacks), terms = {}, invoices = {};
  for (const role of ['sol', 'btc']) {
    terms[role] = await owner.request(role, 'terms', null); invoices[role] = invoice(terms[role]);
    await owner.request(role, 'acceptInvoice', invoices[role]);
  }
  const reserve = await owner.request('control', 'proveReserve', { epoch: '1000' });
  const tree = new PrivateNoteTree([noteWordsToHash(reserve.publicInputs.slice(18, 26))]);
  await owner.request('control', 'proveAuthorization', { path: tree.path(0) });
  const authorization = await owner.request('assembler', 'authorization', null), packages = {};
  for (const role of ['sol', 'btc']) packages[role] = await owner.request(role, 'ownPackage', null);
  for (const role of ['sol', 'btc', 'assembler']) await owner.request(role, 'acknowledgePackage', { packageSHA256: assemblyPackageDigest(role === 'assembler' ? authorization : packages[role]) });
  return { ...f, owner, callbacks, terms, invoices, reserve, tree, authorization, packages };
}
function snapshot(f, epoch = '1000', extra = false) {
  const tree = new PrivateNoteTree(f.tree.leaves.slice(0, f.tree.leafCount)); if (extra) tree.append(h());
  const scope = `0x${f.config.plan.scope}`, history = [PRIVATE_EMPTY_NOTE_ROOT, f.tree.root, ...(extra ? [tree.root] : [])];
  return { blockNumber: '0x1', blockHash: `0x${h()}`, blockTimestamp: (BigInt(epoch) * 600n + 200n).toString(), epoch,
    scope, policy: `0x${policyCommitment(f.config.plan.policy).toString('hex')}`, root: tree.root,
    spentDigest: privateSpentDigest(scope, []), stateSequence: extra ? '2' : '1', sequence: extra ? '2' : '1',
    leafCount: tree.leafCount, spentCount: 0, liveReservations: 1, liveOutputNotes: 0, leaves: tree.leaves,
    nullifiers: Array(64).fill(ZERO_NOTE_HASH), solEffectDigest: privateEffectDigest('SOL', scope, []), btcEffectDigest: privateEffectDigest('BTC', scope, []),
    rootHistoryDigest: privateRootHistoryDigest(scope, history), rootHistoryCount: history.length, rootHistory: [...history, ...Array(65 - history.length).fill(ZERO_NOTE_HASH)],
    revocationCoverageHalted:false,solRevokedCount:0,solRevokedEffects:Array(64).fill(ZERO_NOTE_HASH),solRevokedDigest:privateAssemblyRevocationDigest(scope,[]),
    solEffectCount: 0, btcEffectCount: 0, solEffects: Array(64).fill(ZERO_NOTE_HASH), btcEffects: Array(64).fill(ZERO_NOTE_HASH) };
}
function assembler(f, callbacks = f.callbacks) { return createAssemblyAssembler({ scope: f.config.plan.scope, policy: policyCommitment(f.config.plan.policy).toString('hex'), pins: f.pins }, callbacks); }
async function producers(f) {
  const p = {};
  for (const role of ['sol', 'btc']) {
    p[role] = createAssemblyProducer({ role, policy: f.config.plan.policy, bridgeToken: f.config.bridgeTokens[role] }, f.callbacks);
    await p[role].request('owner', 'retainPackage', f.packages[role]);
  }
  return p;
}

test('HOST ONLY: owner keeps graph witness private, accepts independent invoices, and emits only exact per-channel packages', async () => {
  const f = await prepared();
  assert.deepEqual(Object.keys(f.owner), ['request']);
  assert.deepEqual(Object.keys(f.authorization).sort(), ['version', 'mode', 'target', 'proofBase64', 'publicInputs', 'vkFields', 'proofFields'].sort());
  assert.equal(f.authorization.publicInputs.length, 81);
  for (const role of ['sol', 'btc']) {
    const p = f.packages[role], other = role === 'sol' ? 'btc' : 'sol', text = JSON.stringify(p);
    assert.deepEqual(Object.keys(p).sort(), ['version', 'role', 'terms', 'invoice', 'policy', 'bridgeToken'].sort());
    for (const secret of [f.packages[other].invoice.note.secret, f.packages[other].terms.descriptor.nonce, f.config.bridgeTokens[other]]) assert.equal(text.includes(secret), false);
    for (const forbidden of ['graphSalt', 'originSeed', 'reserveSecret', 'ownerSignature', 'privateKey', 'numerator', 'denominator', 'siblings']) assert.equal(text.includes(`"${forbidden}"`), false);
  }
  const reserveWitness = f.calls.find(call => call.mode === 'reserve').input;
  const authWitness = f.calls.find(call => call.mode === 'authorization').input;
  assert.ok(reserveWitness.owner_signature && authWitness.siblings);
  assert.equal(JSON.stringify(f.authorization).includes(Buffer.from(reserveWitness.reserve_secret).toString('hex')), false);
  await assert.rejects(f.owner.request('control', 'ownPackage', null), /PC18_OPERATION_DENIED/);
  await assert.rejects(f.owner.request('sol', 'authorization', null), /PC18_OPERATION_DENIED/);
  await assert.rejects(f.owner.request('assembler', 'terms', null), /PC18_OPERATION_DENIED/);
  for (const op of ['exportGraph', 'sign', 'eval', 'exportKey', 'policyOpening']) await assert.rejects(f.owner.request('control', op, null), /PC18_OPERATION_DENIED/);
  const done = await f.owner.request('control', 'completePackages', null);
  assert.equal(done.event, 'complete-packages-ready');
  await assert.rejects(f.owner.request('sol', 'terms', null), /PC18_OWNER_PACKAGES_FINAL/);
  await f.owner.request('control', 'shutdown', null);
  await assert.rejects(f.owner.request('control', 'status', null), /PC18_ACTOR_CLOSED/);
});

test('HOST ONLY: recipient role mixups, changed invoice/opening, early A, and unacknowledged delivery fail closed', async () => {
  const f = setup(), cb = hostOnlyCallbacks(); cb.proveReserve = cb.proveAssembly;
  const owner = createAssemblyOwner(f.config, cb), sol = await owner.request('sol', 'terms', null), btc = await owner.request('btc', 'terms', null);
  await assert.rejects(owner.request('sol', 'acceptInvoice', invoice(btc)));
  const bad = invoice(sol); bad.note.secret = h(); await assert.rejects(owner.request('sol', 'acceptInvoice', bad));
  await assert.rejects(owner.request('control', 'proveReserve', { epoch: '1000' }), /PC18_INDEPENDENT_INVOICES_REQUIRED/);
  await assert.rejects(owner.request('control', 'proveAuthorization', { path: new PrivateNoteTree([h()]).path(0) }), /PC18_AUTHORIZATION_PHASE/);
  const g = await prepared();
  await assert.rejects(g.owner.request('sol', 'acknowledgePackage', { packageSHA256: h() }), /PC18_PACKAGE_ACK_MISMATCH/);
  await assert.rejects(g.owner.request('control', 'proveAuthorization', { path: { ...g.tree.path(0), witness: [] } }), /PC18_ACTOR_FIELDS/);
  await owner.request('control', 'shutdown', null);
});

test('HOST ONLY: owner stop precedes local leaf/J/readiness/O/F; only actor-owned witness categories reach callbacks', async () => {
  const f = await prepared(), p = await producers(f), a = assembler(f);
  await a.request('owner', 'retainAuthorization', f.authorization);
  await f.owner.request('control', 'completePackages', null); await f.owner.request('control', 'shutdown', null);
  const oldOwnerCalls = f.calls.filter(x => ['reserve', 'authorization'].includes(x.mode)).length;
  await a.request('control', 'proveReadiness', { role: 'sol', snapshot: snapshot(f, '1000', true), epoch: '1000' });
  const solReady = await a.request('sol', 'readiness', null);
  assert.equal(solReady.publicInputs.length, 61);
  assert.equal(Object.hasOwn(solReady, 'vkFields'), false);
  await p.sol.request('broker', 'proveLocal', { certificate: certificate(f.packages.sol, f.keys.sol) });
  const solLeaf = await p.sol.request('assembler', 'localProof', null);
  await a.request('sol', 'retainLocal', solLeaf); await a.request('control', 'proveJoin', null);
  await a.request('control', 'proveReadiness', { role: 'btc', snapshot: snapshot(f, '1000', true), epoch: '1000' });
  const btcReady = await a.request('btc', 'readiness', null); assert.equal(btcReady.publicInputs.length, 79);
  assert.equal(JSON.stringify(btcReady).includes(f.packages.sol.invoice.note.secret), false);
  await p.btc.request('broker', 'proveLocal', { certificate: certificate(f.packages.btc, f.keys.btc, '600150') });
  await a.request('btc', 'retainLocal', await p.btc.request('assembler', 'localProof', null));
  await a.request('control', 'proveFulfillment', { epoch: '1000' });
  const o = await a.request('control', 'terminalProof', null); assert.equal(o.publicInputs.length, 65);
  await assert.rejects(a.request('control', 'proveRefund', { epoch: '1011' }), /PC18_CUTOFF/);
  await a.request('control', 'proveRefund', { epoch: '1012' }); const refund = await a.request('control', 'terminalProof', null);
  assert.equal(refund.publicInputs.length, 41); assert.deepEqual(refund.publicInputs.slice(25, 33), o.publicInputs.slice(25, 33));
  assert.deepEqual(refund.publicInputs.slice(33, 41), f.authorization.publicInputs.slice(72, 80));
  assert.equal(f.calls.filter(x => ['reserve', 'authorization'].includes(x.mode)).length, oldOwnerCalls);
  const j = f.calls.find(x => x.mode === 'sol_join').input;
  assert.deepEqual(j.authorization_inputs, f.authorization.publicInputs);
  for (const call of f.calls.filter(x => !['reserve', 'authorization'].includes(x.mode))) {
    for (const forbidden of ['origin_seed', 'graph_salt', 'reserve_secret', 'owner_signature', 'numerator', 'denominator', 'recovery_note_secret', 'sol_note_secret', 'btc_note_secret']) assert.equal(call.keys.includes(forbidden), false, `${call.mode}:${forbidden}`);
    if (call.mode.endsWith('_local')) { assert.equal(call.keys.includes(call.mode === 'sol_local' ? 'btc_nonce' : 'sol_nonce'), false); assert.equal(call.keys.includes('a_inputs'), false); }
    else for (const forbidden of ['sol_nonce', 'btc_nonce', 'sol_amount', 'btc_amount', 'sol_certificate_signature', 'btc_certificate_signature']) assert.equal(call.keys.includes(forbidden), false);
  }
  const btcWitness = f.calls.find(x => x.mode === 'btc_ready').input;
  assert.equal(btcWitness.j_inputs.length, 100); assert.equal(Object.hasOwn(btcWitness, 'a_inputs'), false);
  await assert.rejects(a.request('btc', 'retainAuthorization', f.authorization), /PC18_OPERATION_DENIED/);
  await assert.rejects(p.btc.request('owner', 'retainPackage', { ...f.packages.btc, authorization: f.authorization }), /PC18_ROLE_PACKAGE_ALREADY_RETAINED/);
});

test('HOST ONLY: producer independently recomputes C, exact role/token/policy and actual issuer signature before building its leaf', async () => {
  const f = await prepared();
  const fresh = () => createAssemblyProducer({ role: 'sol', policy: f.config.plan.policy, bridgeToken: f.config.bridgeTokens.sol }, f.callbacks);
  await assert.rejects(fresh().request('owner', 'retainPackage', f.packages.btc));
  for (const change of [p => { p.terms.descriptor.amount = '1'; }, p => { p.bridgeToken = h(); }, p => { p.invoice.note.value = '1'; }, p => { p.policy.sol.policyId = h(); }, p => { p.graph = {}; }]) {
    const pkg = structuredClone(f.packages.sol); change(pkg); await assert.rejects(fresh().request('owner', 'retainPackage', pkg));
  }
  const producer = fresh(); await producer.request('owner', 'retainPackage', f.packages.sol);
  const binding = await producer.request('broker', 'bridgeBinding', null); assert.equal(binding.bridgeToken, f.config.bridgeTokens.sol); assert.equal(binding.localCommitment, f.packages.sol.invoice.localCommitment);
  for (const change of [e => { e.signature = '00'.repeat(64); }, e => { e.certificate.amount = '1'; }, e => { e.certificate.observedAt = '599999'; }, e => { e.issuerPublicKey.x = h(); }, e => { e.nativeHandle = {}; }]) {
    const e = certificate(f.packages.sol, f.keys.sol); change(e); await assert.rejects(producer.request('broker', 'proveLocal', { certificate: e }));
  }
  await producer.request('broker', 'proveLocal', { certificate: certificate(f.packages.sol, f.keys.sol) });
  await assert.rejects(producer.request('broker', 'proveLocal', { certificate: certificate(f.packages.sol, f.keys.sol) }), /PC18_LOCAL_PROOF_ALREADY_RETAINED/);
  await assert.rejects(producer.request('control', 'localProof', null), /PC18_OPERATION_DENIED/);
});

test('HOST ONLY: proof admission demands exact fields, full pins, canonical bytes and an actual verifier callback', async () => {
  const f = await prepared();
  assert.throws(() => createAssemblyAssembler({ scope: f.config.plan.scope, policy: policyCommitment(f.config.plan.policy).toString('hex'), pins: f.pins }, { proveAssembly: f.callbacks.proveAssembly }), /PC18_VERIFIER_REQUIRED/);
  const badVerifier = assembler(f, { ...f.callbacks, verifyAssembly: async () => false });
  await assert.rejects(badVerifier.request('owner', 'retainAuthorization', f.authorization), /PC18_GENUINE_PROOF_REJECTED/);
  for (const change of [p => { p.vkFields[114] = '999'; }, p => { p.proofFields[457] = '1'; }, p => { p.publicInputs[8] = String(BigInt(p.publicInputs[8]) + 1n); }, p => { p.target = 'evm'; }, p => { p.publicInputs.push('0'); }, p => { p.metrics = {}; }, p => { p.proofBase64 += '\n'; }]) {
    const candidate = structuredClone(f.authorization); change(candidate); await assert.rejects(assembler(f).request('owner', 'retainAuthorization', candidate));
  }
  const decoded = decodeAssemblyProofPackage(f.authorization); assert.ok(decoded.proof instanceof Uint8Array); assert.equal(decoded.proof.length, 458 * 32);
  assert.ok(encodeAssemblyFrame(f.authorization).length > 32 * 1024, 'test uses a recursive package larger than the old PC17 bound');
  const wrong = structuredClone(f.authorization); wrong.publicInputs[24] = '4294967296'; assert.throws(() => validateAssemblyProofPackage(wrong, 'authorization'), /PC18_PUBLIC_WORD_BOUND/);
  const reserve = structuredClone(f.reserve); reserve.proofBase64 = Buffer.alloc(ASSEMBLY_PROOF_MAX_BYTES + 1).toString('base64'); assert.throws(() => validateAssemblyProofPackage(reserve, 'reserve'), /PC18_PROOF_SIZE/);
  reserve.proofBase64 = Buffer.alloc(64 * 1024, 3).toString('base64'); assert.equal(decodeAssemblyProofPackage(reserve).proof.length, 64 * 1024);
});

test('HOST ONLY: stale/spent history and unrelated reserve/J/leaf splice reject before another proof callback', async () => {
  const f = await prepared(), a = assembler(f); await a.request('owner', 'retainAuthorization', f.authorization);
  for (const change of [s => { s.rootHistory[1] = `0x${h()}`; }, s => { s.rootHistoryCount = 1; }, s => { s.nullifiers[0] = noteWordsToHash(f.authorization.publicInputs.slice(32, 40)); s.spentCount = 1; s.spentDigest = privateSpentDigest(s.scope, s.nullifiers, 1); }, s => { s.leaves[10] = `0x${h()}`; }, s => { s.graph = {}; }, s => { s.epoch = '1001'; }]) {
    const s = snapshot(f); change(s); await assert.rejects(a.request('control', 'proveReadiness', { role: 'sol', snapshot: s, epoch: '1000' }));
  }
  await assert.rejects(a.request('control', 'proveReadiness', { role: 'btc', snapshot: snapshot(f), epoch: '1000' }), /PC18_SOL_JOIN_REQUIRED/);
  await assert.rejects(a.request('control', 'proveReadiness', { role: 'sol', snapshot: snapshot(f, '1012'), epoch: '1012' }), /PC18_CUTOFF/);
  const p = await producers(f); await p.sol.request('broker', 'proveLocal', { certificate: certificate(f.packages.sol, f.keys.sol) });
  const leaf = await p.sol.request('assembler', 'localProof', null), bad = structuredClone(leaf); bad.publicInputs[24] = String(BigInt(bad.publicInputs[24]) + 1n);
  await assert.rejects(a.request('sol', 'retainLocal', bad), /PC18_CHILD_JOIN/);
  await a.request('sol', 'retainLocal', leaf); await a.request('control', 'proveJoin', null);
  const stale = snapshot(f); stale.solEffects[0] = noteWordsToHash(leaf.publicInputs.slice(32, 40)); stale.solEffectCount = 1; stale.solEffectDigest = privateEffectDigest('SOL', stale.scope, stale.solEffects, 1);
  await assert.rejects(a.request('control', 'proveReadiness', { role: 'btc', snapshot: stale, epoch: '1000' }), /PC18_SOL_EFFECT_ALREADY_SPENT/);
});

test('HOST ONLY: framed IPC survives every split UTF-8 byte, enforces size/EOF and rejects malformed UTF-8', () => {
  const expected = { id: 'unicode', input: '🔐保管é', operation: 'test-only' }, bytes = encodeAssemblyFrame(expected);
  for (let split = 1; split < bytes.length; split++) {
    const frames = [], errors = [], d = createAssemblyFrameDecoder(v => frames.push(v), e => errors.push(e));
    d.push(bytes.subarray(0, split)); d.push(bytes.subarray(split)); d.end(); assert.deepEqual(frames, [expected]); assert.deepEqual(errors, []);
  }
  for (const payload of [Buffer.from([0xc3, 0x28, 10]), Buffer.alloc(ASSEMBLY_IPC_MAX_BYTES + 1, 32), Buffer.from('{"a":')]) {
    const errors = [], d = createAssemblyFrameDecoder(() => assert.fail('malformed frame accepted'), e => errors.push(e)); d.push(payload); d.end(); assert.equal(errors.length, 1);
  }
  assert.throws(() => encodeAssemblyFrame({ proof: Buffer.alloc(8) }));
});

// This test-only child explicitly injects mock callbacks. The production entry
// point has no TEST/MOCK environment switch, arbitrary import or eval IPC route.
function spawnHostOnlyActor(kind, config) {
  const actorURL = new URL('../src/private-assembly-actors.mjs', import.meta.url).href;
  const entryURL = new URL(kind === 'owner' ? '../src/private-assembly-owner-process.mjs' : '../src/private-assembly-actor-process.mjs', import.meta.url).href;
  const code = `import {${kind === 'owner' ? 'runAssemblyOwnerProcess' : 'runAssemblyActorProcess'}} from ${JSON.stringify(entryURL)};
    import {assemblyActorPublicInputs} from ${JSON.stringify(actorURL)};
    const modes=${JSON.stringify(modes)};
    const prove=async(mode,input)=>{const r=['authorization','sol_local','btc_local','sol_join'].includes(mode);const field=((1n<<200n)+BigInt(modes.indexOf(mode)+1)).toString();return {proof:r?Buffer.concat(Array(458).fill(0).map(()=>Buffer.from(BigInt(field).toString(16).padStart(64,'0'),'hex'))):Buffer.from('HOST-ONLY-TEST-PROOF:'+mode),publicInputs:assemblyActorPublicInputs(mode,input),...(r?{vkFields:Array(115).fill(String(modes.indexOf(mode)+1)),proofFields:Array(458).fill(field)}:{})};};
    const callbacks={proveReserve:prove,proveAssembly:prove,verifyAssembly:async(mode,p)=>{const r=['authorization','sol_local','btc_local','sol_join'].includes(mode);const field=((1n<<200n)+BigInt(modes.indexOf(mode)+1)).toString();const bytes=r?Buffer.concat(Array(458).fill(0).map(()=>Buffer.from(BigInt(field).toString(16).padStart(64,'0'),'hex'))):Buffer.from('HOST-ONLY-TEST-PROOF:'+mode);return Buffer.from(p.proof).equals(bytes);}};
    await ${kind === 'owner' ? 'runAssemblyOwnerProcess(callbacks)' : `runAssemblyActorProcess(${JSON.stringify(kind)},callbacks)`};`;
  const child = spawn(process.execPath, ['--input-type=module', '-e', code], { stdio: ['pipe', 'pipe', 'pipe', 'pipe', 'pipe', 'pipe', 'pipe'] });
  const control = attachAssemblyControl(child, kind); child.stdio[3].end(JSON.stringify(config));
  return { child, control };
}
function sideClient(stream) {
  let counter = 0; const pending = new Map();
  const decoder = createAssemblyFrameDecoder(frame => { const p = pending.get(frame.id); assert.ok(p, 'exact request/reply ID'); pending.delete(frame.id); frame.ok ? p.resolve(frame.value) : p.reject(new Error(frame.code)); }, e => { for (const p of pending.values()) p.reject(e); pending.clear(); });
  stream.on('data', data => decoder.push(data)); stream.on('error', e => { for (const p of pending.values()) p.reject(e); pending.clear(); });
  return { request(operation, input = null) { return new Promise((resolve, reject) => { const id = `side_${++counter}`; pending.set(id, { resolve, reject }); stream.write(encodeAssemblyFrame({ id, operation, input })); }); } };
}

test('HOST ONLY actual owner PID: private channels package, complete ack, real exit/closed channels and zero post-stop writes', { timeout: 20000 }, async t => {
  const f = setup(), { child, control } = spawnHostOnlyActor('owner', f.config); t.after(() => control.terminate());
  const publicFrames = []; child.stdout.on('data', chunk => publicFrames.push(Buffer.from(chunk)));
  const sides = { sol: sideClient(child.stdio[4]), btc: sideClient(child.stdio[5]), assembler: sideClient(child.stdio[6]) };
  await control.ready; assert.notEqual(control.pid, process.pid);
  const packages = {};
  for (const role of ['sol', 'btc']) { const terms = await sides[role].request('terms'); await sides[role].request('acceptInvoice', invoice(terms)); }
  await assert.rejects(control.request('exportGraph'), /PC18_OPERATION_DENIED/);
  const reserve = await control.request('proveReserve', { epoch: '1000' }), tree = new PrivateNoteTree([noteWordsToHash(reserve.publicInputs.slice(18, 26))]);
  await control.request('proveAuthorization', { path: tree.path(0) });
  packages.assembler = await sides.assembler.request('authorization');
  for (const role of ['sol', 'btc']) packages[role] = await sides[role].request('ownPackage');
  await assert.rejects(control.request('completePackages'), /PC18_PACKAGES_NOT_DELIVERED/);
  for (const role of ['sol', 'btc', 'assembler']) await sides[role].request('acknowledgePackage', { packageSHA256: assemblyPackageDigest(packages[role]) });
  await control.request('completePackages');
  const before = control.provenance(); assert.equal(before.lastOwnerMessage.operation, 'completePackages');
  const exit = await control.stop(); assert.equal(exit.code, 0); assert.equal(exit.pid, child.pid);
  assert.throws(() => process.kill(child.pid, 0), error => error.code === 'ESRCH');
  await assert.rejects(control.request('status'), /PC18_PROCESS_STOPPED/);
  const trace = control.provenance(); assert.equal(trace.closed, true); assert.equal(trace.channelsClosed, true); assert.equal(trace.writesAfterExit, 0); assert.equal(trace.rejectedAfterExit, 1);
  assert.ok(BigInt(trace.exitedAtNs) > BigInt(trace.lastOwnerMessage.atNs));
  assert.equal(trace.lastOwnerMessage.operation, 'completePackages');
  const transcript = Buffer.concat(publicFrames).toString('utf8');
  for (const secret of [packages.sol.invoice.note.secret, packages.btc.invoice.note.secret, f.config.bridgeTokens.sol, f.config.bridgeTokens.btc]) assert.equal(transcript.includes(secret), false);
  assert.equal(transcript.includes(packages.assembler.proofBase64), false);
  assert.equal(transcript.includes('owner_signature'), false);
  assert.equal(trace.events.filter(x => x.operation === 'proveAuthorization').length, 1);
});

test('production entry points start/status/terminate without importing or invoking any prover', { timeout: 10000 }, async t => {
  const f = setup();
  for (const [kind, bootstrap] of [
    ['owner', f.config],
    ['producer', { kind: 'producer', role: 'sol', policy: f.config.plan.policy, bridgeToken: f.config.bridgeTokens.sol }],
    ['assembler', { kind: 'assembler', scope: f.config.plan.scope, policy: policyCommitment(f.config.plan.policy).toString('hex'), pins: f.pins }],
  ]) {
    const { control } = launchAssemblyProcess(kind, bootstrap); t.after(() => control.terminate());
    const ready = await control.ready; assert.deepEqual(ready.operations, ASSEMBLY_OPERATION_INVENTORY[kind]);
    assert.equal((await control.request('status')).kind, kind);
    const result = await control.stop(); assert.equal(result.code, 0); assert.equal(control.provenance().writesAfterExit, 0);
  }
});


test('HOST ONLY four actual processes: independent producers and assembler build J/R/O/F after owner PID exits', { timeout: 20000 }, async t => {
  const f = setup(), owner = spawnHostOnlyActor('owner', f.config), processes = [owner];
  t.after(async () => { for (const p of processes) await p.control.terminate(); });
  const ownerSides = { sol: sideClient(owner.child.stdio[4]), btc: sideClient(owner.child.stdio[5]), assembler: sideClient(owner.child.stdio[6]) };
  await owner.control.ready;
  for (const role of ['sol', 'btc']) { const terms = await ownerSides[role].request('terms'); await ownerSides[role].request('acceptInvoice', invoice(terms)); }
  const reserve = await owner.control.request('proveReserve', { epoch: '1000' }), tree = new PrivateNoteTree([noteWordsToHash(reserve.publicInputs.slice(18, 26))]);
  await owner.control.request('proveAuthorization', { path: tree.path(0) });
  const authorization = await ownerSides.assembler.request('authorization'), packages = {};
  const ac = spawnHostOnlyActor('assembler', { kind: 'assembler', scope: f.config.plan.scope, policy: policyCommitment(f.config.plan.policy).toString('hex'), pins: f.pins });
  processes.push(ac); await ac.control.ready;
  const assemblerPorts = { owner: sideClient(ac.child.stdio[4]), sol: sideClient(ac.child.stdio[5]), btc: sideClient(ac.child.stdio[6]) };
  const aAck = await assemblerPorts.owner.request('retainAuthorization', authorization);
  await ownerSides.assembler.request('acknowledgePackage', { packageSHA256: aAck.packageSHA256 });
  const producers = {};
  for (const role of ['sol', 'btc']) {
    packages[role] = await ownerSides[role].request('ownPackage');
    const p = spawnHostOnlyActor('producer', { kind: 'producer', role, policy: f.config.plan.policy, bridgeToken: f.config.bridgeTokens[role] });
    processes.push(p); await p.control.ready;
    producers[role] = { ...p, broker: sideClient(p.child.stdio[5]), assembler: sideClient(p.child.stdio[6]) };
    const ack = await sideClient(p.child.stdio[4]).request('retainPackage', packages[role]);
    await ownerSides[role].request('acknowledgePackage', { packageSHA256: ack.packageSHA256 });
  }
  await owner.control.request('completePackages'); const ownerExit = await owner.control.stop();
  assert.equal(ownerExit.code, 0);
  assert.throws(() => process.kill(owner.control.pid, 0), e => e.code === 'ESRCH');
  const state = snapshot({ ...f, tree });
  await ac.control.request('proveReadiness', { role: 'sol', snapshot: state, epoch: '1000' });
  assert.equal((await assemblerPorts.sol.request('readiness')).publicInputs.length, 61);
  for (const role of ['sol', 'btc']) {
    if (role === 'btc') {
      await ac.control.request('proveJoin');
      await ac.control.request('proveReadiness', { role, snapshot: state, epoch: '1000' });
      assert.equal((await assemblerPorts.btc.request('readiness')).publicInputs.length, 79);
    }
    await producers[role].broker.request('proveLocal', { certificate: certificate(packages[role], f.keys[role], role === 'sol' ? '600100' : '600150') });
    await assemblerPorts[role].request('retainLocal', await producers[role].assembler.request('localProof'));
  }
  await ac.control.request('proveFulfillment', { epoch: '1000' }); assert.equal((await ac.control.request('terminalProof')).publicInputs.length, 65);
  await ac.control.request('proveRefund', { epoch: '1012' }); assert.equal((await ac.control.request('terminalProof')).publicInputs.length, 41);
  for (const event of ac.control.provenance().events.filter(e => e.operation.startsWith('prove'))) assert.ok(BigInt(event.atNs) > BigInt(ownerExit.exitedAtNs));
  await assert.rejects(owner.control.request('status'), /PC18_PROCESS_STOPPED/);
  assert.equal(owner.control.provenance().writesAfterExit, 0);
  assert.equal(new Set(processes.map(p => p.control.pid)).size, 4);
  for (const p of processes.slice(1)) assert.equal((await p.control.stop()).code, 0);
});


test('HOST ONLY backend verification boundary preserves decimal words exactly as fixed-width hex for bb.js', () => {
  const words = ['0', '10', '4294967295', '18446744073709551615', '21888242871839275222246405745257275088548364400416034343698204186575808495616'];
  const input = { proof: Uint8Array.from([1, 2, 3]), publicInputs: words, vkFields: ['17'], proofFields: ['19'] };
  const output = assemblyBackendVerificationPackage(input);
  assert.deepEqual(output.publicInputs.map(BigInt), words.map(BigInt));
  assert.ok(output.publicInputs.every(word => /^0x[0-9a-f]{64}$/.test(word)));
  assert.equal(output.publicInputs[1], `0x${'0'.repeat(63)}a`);
  assert.strictEqual(output.proof, input.proof); assert.strictEqual(output.vkFields, input.vkFields); assert.strictEqual(output.proofFields, input.proofFields);
  assert.deepEqual(input.publicInputs, words);
  for (const value of ['0x10', '-1', '01', '21888242871839275222246405745257275088548364400416034343698204186575808495617']) assert.throws(() => assemblyBackendVerificationPackage({ proof: input.proof, publicInputs: [value] }), /PC18_VERIFICATION_FIELD/);
});


test('HOST ONLY nested noisy proof worker cannot corrupt actor stdout; fd3 result waits for actual worker exit', { timeout: 10000 }, async () => {
  const f = await prepared(), actorURL = new URL('../src/private-assembly-actors.mjs', import.meta.url).href;
  const wire = { proof: f.reserve.proofBase64, publicInputs: f.reserve.publicInputs, metrics: { milliseconds: 1.25, privateDiagnostic: 'DO_NOT_FORWARD_TEST_ONLY' } };
  const workerCode = `import {writeSync} from 'node:fs';
    let input='';for await(const chunk of process.stdin)input+=chunk;
    const r=JSON.parse(input);if(r.operation!=='prove'||r.input.testSecret!=='actor-local-test-secret')process.exit(2);
    console.log('NOISY_GENERATED_PROOF_DO_NOT_FORWARD');console.error('PRIVATE_DIAGNOSTIC_DO_NOT_FORWARD');
    writeSync(3,JSON.stringify({ok:true,result:${JSON.stringify(wire)}})+String.fromCharCode(10));
    await new Promise(resolve=>setTimeout(resolve,30));`;
  const outerCode = `import {spawn} from 'node:child_process';import {createAssemblyProofWorkerRunner} from ${JSON.stringify(actorURL)};
    let worker,closed=false;const run=createAssemblyProofWorkerRunner({spawnWorker:()=>{worker=spawn(process.execPath,['--input-type=module','-e',${JSON.stringify(workerCode)}],{stdio:['pipe','pipe','pipe','pipe']});worker.once('close',()=>closed=true);return worker;},timeoutMs:3000});
    const p=await run('reserve',{testSecret:'actor-local-test-secret'},'host-only-noise');
    let gone=false;try{process.kill(worker.pid,0);}catch(e){gone=e.code==='ESRCH';}
    process.stdout.write(JSON.stringify({closed,gone,proof:Buffer.from(p.proof).toString('base64'),publicInputs:p.publicInputs,fields:Object.keys(p).sort()})+String.fromCharCode(10));`;
  const outer = spawn(process.execPath, ['--input-type=module', '-e', outerCode], { stdio: ['ignore', 'pipe', 'pipe'] });
  const stdout = [], stderr = []; outer.stdout.on('data', c => stdout.push(c)); outer.stderr.on('data', c => stderr.push(c));
  const code = await new Promise(resolve => outer.once('close', resolve));
  assert.equal(code, 0, Buffer.concat(stderr).toString());
  const text = Buffer.concat(stdout).toString('utf8'), parsed = JSON.parse(text);
  assert.equal(parsed.closed, true); assert.equal(parsed.gone, true); assert.equal(parsed.proof, wire.proof);
  assert.deepEqual(parsed.publicInputs, wire.publicInputs); assert.deepEqual(parsed.fields, ['proof', 'publicInputs']);
  assert.equal(text.includes('DO_NOT_FORWARD'), false); assert.equal(text.includes('actor-local-test-secret'), false); assert.equal(Buffer.concat(stderr).length, 0);
});

test('HOST ONLY child protocol rejects extra result fields, noisy overflow, error details and bounded hangs', { timeout: 10000 }, async () => {
  const f = await prepared(), valid = { proof: f.reserve.proofBase64, publicInputs: f.reserve.publicInputs, metrics: {} };
  const runWith = (code, timeoutMs = 3000) => createAssemblyProofWorkerRunner({ spawnWorker: () => spawn(process.execPath, ['--input-type=module', '-e', code], { stdio: ['pipe', 'pipe', 'pipe', 'pipe'] }), timeoutMs });
  const extra = `import {writeSync} from 'node:fs';for await(const c of process.stdin){};writeSync(3,${JSON.stringify(JSON.stringify({ok:true,result:{...valid,privateWitness:'NEVER EXPORTED'}}))});`;
  await assert.rejects(runWith(extra)('reserve', {}, 'test-only'), /PC18_WORKER_RESULT_FIELDS/);
  const failure = `import {writeSync} from 'node:fs';for await(const c of process.stdin){};writeSync(3,JSON.stringify({ok:false,code:'PC18_TEST_REJECTED',name:'Error'}));process.exitCode=1;`;
  await assert.rejects(runWith(failure)('reserve', {}, 'test-only'), /PC18_TEST_REJECTED/);
  const overflow = `process.stdout.write(Buffer.alloc(1024*1024+1,65));setInterval(()=>{},1000);`;
  await assert.rejects(runWith(overflow)('reserve', {}, 'test-only'), /PC18_WORKER_LOG_SIZE/);
  await assert.rejects(runWith('setInterval(()=>{},1000)', 50)('reserve', {}, 'test-only'), /PC18_WORKER_TIMEOUT/);
});

test('HOST ONLY verifier child uses exact proof-only request, preserves words and returns typed boolean after exit', { timeout: 10000 }, async () => {
  const f = await prepared(), pkg = decodeAssemblyProofPackage(f.authorization);
  for (const accepted of [true, false]) {
    let child;
    const code = `import {writeSync} from 'node:fs';let raw='';for await(const c of process.stdin)raw+=c;const r=JSON.parse(raw);
      if(r.operation!=='verify'||Object.keys(r.input).sort().join(',')!=='proofBase64,proofFields,publicInputs,vkFields'||JSON.stringify(r.input.publicInputs)!==${JSON.stringify(JSON.stringify(f.authorization.publicInputs))})process.exit(2);
      console.log('NOISY_VERIFICATION_DO_NOT_FORWARD');writeSync(3,JSON.stringify({ok:true,result:{verified:${accepted}}}));`;
    const verify = createAssemblyVerificationWorkerRunner({ spawnWorker: () => (child = spawn(process.execPath, ['--input-type=module', '-e', code], { stdio: ['pipe', 'pipe', 'pipe', 'pipe'] })), timeoutMs: 3000 });
    assert.equal(await verify('authorization', assemblyBackendVerificationPackage(pkg)), accepted);
    assert.throws(() => process.kill(child.pid, 0), e => e.code === 'ESRCH');
  }
  const code = `import {writeSync} from 'node:fs';for await(const c of process.stdin){};writeSync(3,JSON.stringify({ok:true,result:{verified:true,privateWitness:'reject'}}));`;
  const verify = createAssemblyVerificationWorkerRunner({ spawnWorker: () => spawn(process.execPath, ['--input-type=module', '-e', code], { stdio: ['pipe', 'pipe', 'pipe', 'pipe'] }), timeoutMs: 3000 });
  await assert.rejects(verify('authorization', pkg), /PC18_WORKER_RESULT_FIELDS/);
  await assert.rejects(verify('reserve', pkg), /PC18_WORKER_VERIFY_MODE/);
});

test('HOST ONLY v2: complete revocation state blocks exact hidden predecessor while unrelated tag remains usable',async()=>{const f=await prepared(),p=await producers(f),a=assembler(f);await a.request('owner','retainAuthorization',f.authorization);await p.sol.request('broker','proveLocal',{certificate:certificate(f.packages.sol,f.keys.sol)});const leaf=await p.sol.request('assembler','localProof',null);await a.request('sol','retainLocal',leaf);await a.request('control','proveJoin',null);const revoked=snapshot(f);revoked.solRevokedEffects[0]=noteWordsToHash(leaf.publicInputs.slice(32,40));revoked.solRevokedCount=1;revoked.solRevokedDigest=privateAssemblyRevocationDigest(revoked.scope,revoked.solRevokedEffects,1);revoked.stateSequence=revoked.sequence='2';await assert.rejects(a.request('control','proveReadiness',{role:'btc',snapshot:revoked,epoch:'1000'}),/PC18_SOL_EFFECT_REVOKED/);revoked.solRevokedEffects[0]='0x'+h();revoked.solRevokedDigest=privateAssemblyRevocationDigest(revoked.scope,revoked.solRevokedEffects,1);await a.request('control','proveReadiness',{role:'btc',snapshot:revoked,epoch:'1000'});const proof=await a.request('btc','readiness',null);for(const index of [33,50,69,78]){const bad=structuredClone(proof);bad.publicInputs[index]=(1n<<32n).toString();assert.throws(()=>validateAssemblyProofPackage(bad,'btc_ready'),/PUBLIC_WORD_BOUND/);}const bad=structuredClone(proof);bad.publicInputs[60]='2';assert.throws(()=>validateAssemblyProofPackage(bad,'btc_ready'),/HALT_BOOLEAN/);const halted=snapshot(f);halted.solRevokedEffects=Array.from({length:64},(_,i)=>'0x'+BigInt(i+1).toString(16).padStart(64,'0'));halted.solRevokedCount=64;halted.solRevokedDigest=privateAssemblyRevocationDigest(halted.scope,halted.solRevokedEffects);halted.revocationCoverageHalted=true;for(const role of ['sol','btc'])await assert.rejects(a.request('control','proveReadiness',{role,snapshot:halted,epoch:'1000'}),/COVERAGE_HALTED/);});

test('HOST ONLY actor aggregate queue bounds pending frames and bytes during long child work',()=>{const q=createAssemblyQueueBudget({maxFrames:2,maxBytes:1024}),a=q.reserve(600);assert.throws(()=>q.reserve(425),/QUEUE_LIMIT/);const b=q.reserve(400);assert.deepEqual(q.status(),{frames:2,bytes:1000,maxFrames:2,maxBytes:1024});assert.throws(()=>q.reserve(1),/QUEUE_LIMIT/);a();a();assert.equal(q.status().bytes,400);const c=q.reserve(600);b();c();assert.equal(q.status().frames,0);assert.equal(q.status().bytes,0);assert.throws(()=>createAssemblyQueueBudget({maxFrames:17}),/QUEUE_CONFIG/);});
