import test from 'node:test';
import {derivePrivateAssetIdentity,derivePrivateAssetPoolScope} from '../../src/notes/private-asset-runtime.mjs';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createOwnerRefundWithdrawalRecovery, ownerRefundWithdrawalInput } from '../../src/recovery/private-owner-refund-recovery.mjs';
import { persistOriginalOwnerRefundCustody, recoverOwnerRefundCustody } from '../../src/recovery/private-owner-refund-custody.mjs';
import { nullifier, freshKey, paymentCommitment, signature, withdrawFrame } from '../../src/notes/private-note-encoding.mjs';
import { derivePrivatePoolScope, encodePrivatePoolInputs, noteWordsToHash, PrivateNoteTree, privateSpentDigest } from '../../src/notes/private-note-tree.mjs';
import { privateVerifierCalldata } from '../../src/assembly/private-assembly-runtime.mjs';

// These are deterministic protocol-shape tests with fake chain receipts and
// fake proofs. They do not claim a real verifier, native send or funded payout.
const h = (n = 32) => randomBytes(n).toString('hex');
const pref = b => `0x${Buffer.from(b).toString('hex')}`;
const word = n => BigInt(n).toString(16).padStart(64, '0');
const topic = '0x8c6afca18616d300c4fb7eff2f714229e89e93825b143dc4ecc04231972aa19f';
const YES = `0x${word(1)}`, NO = `0x${word(0)}`;

async function fixture(t,{assetKind}={}) {
  const directory = await mkdtemp(join(tmpdir(), 'owner-refund-recovery-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const address = `0x${h(20)}`, deploymentDomain = `0x${h()}`, chainId = '31337';
  const assetFields=assetKind?{asset:assetKind==='NATIVE'?'0x'+'00'.repeat(20):'0x'+h(20),assetCodeHash:assetKind==='NATIVE'?'0x'+'00'.repeat(32):'0x'+h()}:{};
  if(assetKind)assetFields.assetIdentity=derivePrivateAssetIdentity(chainId,assetFields.asset,assetFields.assetCodeHash);
  const scope = assetKind?derivePrivateAssetPoolScope(chainId,address,deploymentDomain,assetFields.assetIdentity):derivePrivatePoolScope(chainId, address, deploymentDomain), recipient = h(20), policy = `0x${h()}`;
  const epoch = 3166667n;
  const budget = '1000000000000000', reserveSecret = h(), reservedCommitment = h();
  const original = { type: 3, origin: randomBytes(32), ...freshKey(), value: BigInt(budget), secret: randomBytes(32) };
  original.commitment = paymentCommitment(scope.slice(2), original);
  const graph = { scope: Buffer.from(scope.slice(2), 'hex'), policy: Buffer.from(policy.slice(2), 'hex'),
    budget: BigInt(budget), claimEpoch: epoch - 1n, reserved: Buffer.from(reservedCommitment, 'hex'),
    reserveSecret: Buffer.from(reserveSecret, 'hex'), recovery: original };
  graph.nullifier = nullifier(scope.slice(2), reservedCommitment, reserveSecret);
  const cfg = { path: join(directory, 'owner.vault'), password: h(), withdrawalRecipient: recipient };
  let wallet = await persistOriginalOwnerRefundCustody(graph, cfg);
  const opening = wallet.opening(), binding = opening.binding;
  t.after(() => wallet.close());
  const noteNullifier = pref(nullifier(binding.scope, binding.paymentCommitment, opening.note.secret));
  const reserveNullifier = `0x${binding.reserveNullifier}`;
  const tree = new PrivateNoteTree([binding.reservedCommitment, binding.paymentCommitment]);
  const snapshot = { blockNumber: '0x2', blockHash: `0x${h()}`, blockTimestamp: (epoch * 600n + 1n).toString(), epoch: epoch.toString(),
    scope, policy, root: tree.root, leaves: tree.leaves, leafCount: 2, nullifiers: [reserveNullifier], spentCount: 1 };
  snapshot.spentDigest = privateSpentDigest(scope, snapshot.nullifiers, snapshot.spentCount);
  const blocks = new Map(), transactions = new Map(), receipts = new Map(), calls = [], persisted = [], confirmed = [], logs = [];
  const controls = { sends: 0, signs: 0, proofs: 0, persistError: null, submitError: null, missingReceipt: false, logsError: false, mutateProof: null, duringProof: null };
  const installHeader = (txs = []) => blocks.set(snapshot.blockNumber, { number: snapshot.blockNumber, hash: snapshot.blockHash,
    timestamp: `0x${BigInt(snapshot.blockTimestamp).toString(16)}`, transactions: txs });
  installHeader();
  const pool = { address, scope, policy, deploymentDomain,...assetFields,
    snapshot: async () => structuredClone(snapshot),
    call: async (method, args, block) => {
      calls.push({ kind: 'pool', method, args, block });
      if (method === 'asset()') return '0x'+'0'.repeat(24)+assetFields.asset.slice(2);
      if (method === 'assetCodeHash()') return assetFields.assetCodeHash;
      if (method === 'assetIdentity()') return controls.assetReadMismatch?YES:assetFields.assetIdentity;
      if (method === 'scope()') return pool.scope;
      if (method === 'policy()') return pool.policy;
      if (method === 'deploymentDomain()') return pool.deploymentDomain;
      if (method === 'acceptedRoots(bytes32)') return args[0] === tree.root ? YES : NO;
      if (method === 'insertedCommitments(bytes32)') return snapshot.leaves.slice(0, snapshot.leafCount).includes(args[0]) ? YES : NO;
      if (method === 'spentNullifiers(bytes32)') return snapshot.nullifiers.includes(args[0]) ? YES : NO;
      throw new Error(`UNEXPECTED_POOL_CALL_${method}`);
    } };
  const runtime = { metadata: { chainId }, evm: async (method, args) => {
    calls.push({ kind: 'evm', method, args });
    if (method === 'eth_chainId') return '0x7a69';
    if (method === 'eth_getBlockByNumber') return structuredClone(blocks.get(args[0]));
    if (method === 'eth_getTransactionByHash') return structuredClone(transactions.get(args[0]) ?? null);
    if (method === 'eth_getTransactionReceipt') return controls.missingReceipt ? null : structuredClone(receipts.get(args[0]) ?? null);
    if (method === 'eth_getLogs') { if (controls.logsError) throw new Error('lost RPC response'); return structuredClone(logs); }
    throw new Error(`UNEXPECTED_EVM_CALL_${method}`);
  } };
  function spend() {
    if (!snapshot.nullifiers.includes(noteNullifier)) snapshot.nullifiers.push(noteNullifier);
    snapshot.spentCount = snapshot.nullifiers.length;
    snapshot.spentDigest = privateSpentDigest(scope, snapshot.nullifiers, snapshot.spentCount);
  }
  function makeProof(input) {
    return { proof: Buffer.from([1, 2, 3]), publicInputs: [...input.scope, ...input.policy, input.epoch, ...input.root, ...input.spent, input.amount, ...input.recipient].map(String) };
  }
  async function send(proof) {
    controls.sends++;
    const hash = `0x${h()}`;
    snapshot.blockNumber = `0x${(BigInt(snapshot.blockNumber) + 1n).toString(16)}`;
    snapshot.blockHash = `0x${h()}`; snapshot.blockTimestamp = (BigInt(snapshot.blockTimestamp) + 1n).toString();
    snapshot.epoch = (BigInt(snapshot.blockTimestamp) / 600n).toString();
    spend(); installHeader([hash]);
    const log = { address, transactionHash: hash, blockNumber: snapshot.blockNumber, blockHash: snapshot.blockHash,
      transactionIndex: '0x0', logIndex: '0x0', removed: false,
      topics: [topic, `0x${'0'.repeat(24)}${recipient}`], data: `0x${word(binding.budget)}${noteNullifier.slice(2)}` };
    const transaction = { hash, blockNumber: snapshot.blockNumber, blockHash: snapshot.blockHash, to: address,
      from: `0x${h(20)}`, input: privateVerifierCalldata('67843a5b', proof.proof, proof.publicInputs), value: '0x0' };
    const receipt = { status: '0x1', transactionHash: hash, blockNumber: snapshot.blockNumber, blockHash: snapshot.blockHash,
      to: address, from: transaction.from, logs: [structuredClone(log)] };
    transactions.set(hash, transaction); receipts.set(hash, receipt); logs.push(log);
    if (controls.submitError) throw controls.submitError;
    return receipt;
  }
  const options = { pool, runtime, binding, opening,
    authorize: async request => { controls.signs++; return wallet.authorizeWithdrawal(request); },
    prove: async input => { controls.proofs++; await controls.duringProof?.(); const proof = makeProof(input); controls.mutateProof?.(proof); return proof; },
    submit: send,
    persist: async state => { if (controls.persistError?.(state)) throw new Error('SIMULATED_DURABLE_WRITE_FAILURE'); persisted.push(state); },
    onConfirmed: state => confirmed.push(state) };
  const recovery = createOwnerRefundWithdrawalRecovery(options);
  async function restartCustody() {
    wallet.close(); wallet = await recoverOwnerRefundCustody({ path: cfg.path, password: cfg.password, expectedBinding: binding });
    assert.deepEqual(wallet.opening(), opening, 'Recovery retains the exact original note opening');
  }
  return { ...options, recovery, controls, snapshot, blocks, transactions, receipts, logs, calls, persisted, confirmed,
    spend, send, makeProof, restartCustody, options, noteNullifier, reserveNullifier, installHeader, recipient, original, tree };
}

function currentProof(f) {
  return { proof: Buffer.from([1, 2, 3]), publicInputs: encodePrivatePoolInputs('withdraw', { scope: f.pool.scope, policy: f.pool.policy,
    epoch: f.snapshot.epoch, root: f.snapshot.root, nullifier: f.noteNullifier, amount: f.binding.budget, recipient: `0x${f.recipient}` }) };
}
function rewriteInput(f, modify) {
  const tx = f.transactions.get(f.logs[0].transactionHash), proof = currentProof(f); modify(proof.publicInputs);
  tx.input = privateVerifierCalldata('67843a5b', proof.proof, proof.publicInputs);
}


test('original encrypted type3 note withdraws its entire budget with unchanged 39-word statement', async t => {
  const f = await fixture(t);
  assert.equal((await f.recovery.reconcile()).state, 'READY');
  await f.restartCustody();
  const originalProve = f.options.prove;
  const recovery = createOwnerRefundWithdrawalRecovery({ ...f.options, prove: async input => {
    assert.equal(input.note_type, 3); assert.equal(input.value, f.binding.budget); assert.equal(input.amount, f.binding.budget);
    const proof = await originalProve(input); assert.equal(proof.publicInputs.length, 39); return proof;
  } });
  const result = await recovery.recover();
  assert.equal(result.state, 'WITHDRAWN'); assert.equal(result.role, 'owner');
  assert.equal(result.amount, f.binding.budget); assert.equal(result.recipient, `0x${f.recipient}`);
  assert.equal(result.paymentCommitment, `0x${f.binding.paymentCommitment}`);
  assert.equal(f.controls.sends, 1); assert.equal(f.confirmed.length, 1);
  assert.deepEqual(f.persisted.map(x => x.state), ['SUBMITTING', 'WITHDRAWN']);
  assert.ok(f.calls.some(c => c.method === 'insertedCommitments(bytes32)' && c.args[0] === `0x${f.binding.reservedCommitment}`));
  assert.ok(f.calls.some(c => c.method === 'spentNullifiers(bytes32)' && c.args[0] === f.reserveNullifier));
});

test('type3 rejects swapped opening, key, note type, budget and every original binding field', async t => {
  const f = await fixture(t), otherKey = freshKey();
  const mutations = [
    o => { o.note.x = otherKey.x.toString('hex'); o.note.y = otherKey.y.toString('hex'); },
    o => { o.note.secret = h(); }, o => { o.note.origin = h(); },
    o => { o.note.type = 2; }, o => { o.note.value = '500000000000000'; },
    o => { o.invoiceSignature = h(64); },
    ...Object.keys(f.binding).map(k => o => { o.binding[k] = k === 'budget' || k === 'cutoff' ? '1' : h(k === 'withdrawalRecipient' ? 20 : 32); }),
  ];
  for (const mutate of mutations) {
    const opening = structuredClone(f.opening); mutate(opening);
    assert.throws(() => createOwnerRefundWithdrawalRecovery({ ...f.options, opening }), /OWNER_REFUND_/);
  }
  assert.equal(f.controls.signs, 0); assert.equal(f.controls.sends, 0);
});

test('type3 signing is pinned to original pool identity and live chain authority', async t => {
  for (const field of ['address', 'scope', 'policy', 'deploymentDomain']) {
    const f = await fixture(t); f.pool[field] = `0x${h(field === 'address' ? 20 : 32)}`;
    await assert.rejects(f.recovery.recover(), /PAYOUT_RECOVERY_/); assert.equal(f.controls.sends, 0);
  }
  const f = await fixture(t);
  assert.throws(() => createOwnerRefundWithdrawalRecovery({ ...f.options, pool: { ...f.pool, address: `0x${h(20)}` } }), /POOL_BINDING/);
  f.runtime.metadata.chainId = '31338'; await assert.rejects(f.recovery.reconcile(), /PAYOUT_RECOVERY_CHAIN/);
});

test('unissued refund remains pending; spent original reserve alone cannot authorize payout', async t => {
  const f = await fixture(t), tree = new PrivateNoteTree([f.binding.reservedCommitment]);
  f.snapshot.leaves = tree.leaves; f.snapshot.leafCount = 1; f.snapshot.root = tree.root;
  const oldCall = f.pool.call; f.pool.call = async (method, args, block) => method === 'acceptedRoots(bytes32)' ? YES : oldCall(method, args, block);
  const result = await f.recovery.recover(); assert.equal(result.state, 'PENDING');
  assert.equal(f.controls.signs, 0); assert.equal(f.controls.sends, 0);
});

test('refund issuance requires original reserve consumption, cutoff, and map/list agreement', async t => {
  for (const mutate of [
    f => { f.snapshot.nullifiers = []; f.snapshot.spentCount = 0; f.snapshot.spentDigest = privateSpentDigest(f.pool.scope, [], 0); },
    f => { f.snapshot.epoch = (BigInt(f.binding.cutoff) - 1n).toString(); f.snapshot.blockTimestamp = (BigInt(f.snapshot.epoch) * 600n).toString(); f.installHeader(); },
    f => { const old = f.pool.call; f.pool.call = async (method, args, block) => method === 'spentNullifiers(bytes32)' && args[0] === f.reserveNullifier ? NO : old(method, args, block); },
    f => { const old = f.pool.call; f.pool.call = async (method, args, block) => method === 'insertedCommitments(bytes32)' && args[0] === `0x${f.binding.reservedCommitment}` ? NO : old(method, args, block); },
  ]) {
    const f = await fixture(t); mutate(f);
    await assert.rejects(f.recovery.recover(), /OWNER_REFUND_RECOVERY_/);
    assert.equal(f.controls.sends, 0); assert.equal(f.controls.signs, 0);
  }
});

test('type3 rejects swapped-key signature, wrong amount/destination, extra fields and stale signed epoch', async t => {
  const f = await fixture(t);
  for (const mutate of [
    (a, key) => { a.signature = signature(key, withdrawFrame(a.scope, a.policy, a.paymentCommitment, Buffer.from(a.recipient, 'hex'), a.amount, a.epoch)).toString('hex'); },
    a => { a.amount = '500000000000000'; }, a => { a.recipient = h(20); },
    a => { a.paymentCommitment = h(); }, a => { a.policy = h(); }, a => { a.scope = h(); },
    a => { a.extra = true; }, a => { a.signature = '00'.repeat(64); },
    a => { a.epoch = (BigInt(a.epoch) - 1n).toString(); a.signature = signature(f.original, withdrawFrame(a.scope, a.policy, a.paymentCommitment, Buffer.from(a.recipient, 'hex'), a.amount, a.epoch)).toString('hex'); },
  ]) {
    const key = freshKey();
    const recovery = createOwnerRefundWithdrawalRecovery({ ...f.options, authorize: async request => { const auth = await f.options.authorize(request); mutate(auth, key); return auth; } });
    await assert.rejects(recovery.recover(), /OWNER_REFUND_|PAYOUT_RECOVERY_AUTHORIZATION/);
  }
  assert.equal(f.controls.sends, 0); assert.equal(f.controls.proofs, 0);
});

test('input builder rejects invented or altered membership without changing the withdraw witness schema', async t => {
  const f = await fixture(t), request = { scope: f.binding.scope, policy: f.binding.policy,
    paymentCommitment: f.binding.paymentCommitment, recipient: f.recipient, amount: f.binding.budget, epoch: f.snapshot.epoch };
  const auth = await f.options.authorize(request), path = f.tree.path(1);
  for (const mutate of [p => { p.leaf = `0x${h()}`; }, p => { p.index = 0; }, p => { p.siblings[0] = `0x${h()}`; }, p => { p.extra = 1; }]) {
    const changed = structuredClone(path); mutate(changed);
    assert.throws(() => ownerRefundWithdrawalInput(f.binding, f.opening, auth, changed), /OWNER_REFUND_/);
  }
});

test('duplicate concurrent recovery and signer restart reconcile one exact original withdrawal', async t => {
  const f = await fixture(t);
  const results = await Promise.all([f.recovery.recover(), f.recovery.recover(), f.recovery.recover()]);
  assert.ok(results.every(r => r.state === 'WITHDRAWN'));
  assert.equal(new Set(results.map(r => r.transactionHash)).size, 1);
  await f.restartCustody();
  assert.equal((await f.recovery.recover()).transactionHash, results[0].transactionHash);
  assert.equal(f.controls.sends, 1); assert.equal(f.controls.signs, 1); assert.equal(f.controls.proofs, 1);
});

test('lost submission response reconciles canonical receipt; missing receipt stays UNKNOWN without resubmit', async t => {
  const f = await fixture(t); f.controls.submitError = new Error('lost response'); f.controls.missingReceipt = true;
  assert.equal((await f.recovery.recover()).state, 'UNKNOWN');
  await f.restartCustody(); assert.equal((await f.recovery.recover()).state, 'UNKNOWN');
  assert.equal(f.controls.sends, 1); assert.equal(f.confirmed.length, 0);
  f.controls.missingReceipt = false;
  assert.equal((await f.recovery.recover()).state, 'WITHDRAWN'); assert.equal(f.controls.sends, 1);
});

test('uncertain unspent type3 send never retries in surviving factory even after signer recovery', async t => {
  const f = await fixture(t);
  const recovery = createOwnerRefundWithdrawalRecovery({ ...f.options, submit: async () => { f.controls.sends++; throw new Error('unknown send'); } });
  assert.equal((await recovery.recover()).state, 'UNKNOWN'); await f.restartCustody();
  assert.equal((await recovery.recover()).state, 'UNKNOWN');
  assert.equal(f.controls.sends, 1); assert.equal(f.controls.signs, 1); assert.equal(f.controls.proofs, 1);
});

test('private pre-submit write failure sends nothing, confirmed accounting precedes fallible post-write', async t => {
  const f = await fixture(t); f.controls.persistError = r => r.state === 'SUBMITTING';
  await assert.rejects(f.recovery.recover(), /SIMULATED_DURABLE_WRITE_FAILURE/);
  assert.equal(f.controls.sends, 0); assert.equal(f.confirmed.length, 0);
  f.controls.persistError = r => r.state === 'WITHDRAWN';
  await assert.rejects(f.recovery.recover(), /SIMULATED_DURABLE_WRITE_FAILURE/);
  assert.equal(f.controls.sends, 1); assert.equal(f.confirmed[0].state, 'WITHDRAWN');
  f.controls.persistError = null;
  assert.equal((await f.recovery.recover()).state, 'WITHDRAWN'); assert.equal(f.controls.sends, 1);
});

test('wrong type3 proof public statement fails before any submit', async t => {
  const f = await fixture(t); f.controls.mutateProof = proof => { proof.publicInputs[33] = '1'; };
  await assert.rejects(f.recovery.recover(), /PAYOUT_RECOVERY_PUBLIC_BINDING/); assert.equal(f.controls.sends, 0);
});

test('wrong owner withdrawal receipt calldata, pool, status, event and historic cutoff never confirms', async t => {
  const changes = [
    f => rewriteInput(f, w => { w[0] = (BigInt(w[0]) ^ 1n).toString(); }),
    f => rewriteInput(f, w => { w[8] = (BigInt(w[8]) ^ 1n).toString(); }),
    f => rewriteInput(f, w => { w[25] = (BigInt(w[25]) ^ 1n).toString(); }),
    f => rewriteInput(f, w => { w[33] = '500000000000000'; }),
    f => rewriteInput(f, w => { w[34] = (BigInt(w[34]) ^ 1n).toString(); }),
    f => rewriteInput(f, w => { w[16] = (BigInt(f.binding.cutoff) - 1n).toString(); }),
    f => { const tx = f.transactions.get(f.logs[0].transactionHash); tx.input = '0xdeadbeef' + tx.input.slice(10); },
    f => { f.transactions.get(f.logs[0].transactionHash).to = `0x${h(20)}`; },
    f => { f.receipts.get(f.logs[0].transactionHash).status = '0x0'; },
    f => { f.receipts.get(f.logs[0].transactionHash).logs[0].data = `0x${word(1)}${f.noteNullifier.slice(2)}`; },
    f => { f.blocks.get(f.logs[0].blockNumber).transactions = []; },
    f => { f.logs[0].removed = true; },
    f => { f.logs.push(structuredClone(f.logs[0])); },
  ];
  for (const change of changes) {
    const f = await fixture(t); await f.send(currentProof(f)); change(f);
    assert.equal((await f.recovery.recover()).state, 'UNKNOWN');
    assert.equal(f.controls.sends, 1); assert.equal(f.confirmed.length, 0);
  }
});

test('owner withdrawal records never contain encrypted opening, signing key, signature or proof', async t => {
  const f = await fixture(t); await f.recovery.recover();
  const encoded = JSON.stringify(f.persisted);
  for (const secret of [f.opening.note.secret, f.opening.note.x, f.opening.note.y, 'privateKeyPem', 'password', 'siblings', 'signature', 'note_type']) assert.equal(encoded.includes(secret), false);
  assert.ok(f.persisted.every(state => !Object.hasOwn(state, 'proof')));
});

test('constructor pins copied original owner binding and note against later caller mutation', async t => {
  const f = await fixture(t), expectedAmount = f.binding.budget, expectedRecipient = f.binding.withdrawalRecipient;
  const opening = structuredClone(f.opening), binding = structuredClone(f.binding);
  const recovery = createOwnerRefundWithdrawalRecovery({ ...f.options, binding, opening });
  opening.note.secret = h(); opening.binding.withdrawalRecipient = h(20);
  binding.budget = '1'; binding.paymentCommitment = h();
  const result = await recovery.recover();
  assert.equal(result.state, 'WITHDRAWN'); assert.equal(result.amount, expectedAmount);
  assert.equal(result.recipient, `0x${expectedRecipient}`); assert.equal(f.controls.sends, 1);
});

for(const assetKind of ['ERC20','NATIVE'])test('asset-scoped owner refund recovery keeps original signing and canonical withdrawal checks: '+assetKind,async t=>{
 const f=await fixture(t,{assetKind});assert.equal((await f.recovery.reconcile()).state,'READY');
 f.controls.assetReadMismatch=true;await assert.rejects(f.recovery.reconcile(),/ASSET_DEPLOYMENT_CHANGED/);f.controls.assetReadMismatch=false;
 const original=f.pool.assetIdentity;f.pool.assetIdentity='0x'+h();await assert.rejects(f.recovery.reconcile(),/ASSET/);f.pool.assetIdentity=original;
 const result=await f.recovery.recover();assert.equal(result.state,'WITHDRAWN');assert.equal(f.controls.sends,1);assert.equal(f.controls.signs,1);
 const changed={...f.pool,asset:'0x'+h(20),assetCodeHash:'0x'+h()};changed.assetIdentity=derivePrivateAssetIdentity('31337',changed.asset,changed.assetCodeHash);
 assert.throws(()=>createOwnerRefundWithdrawalRecovery({...f.options,pool:changed}),/POOL_BINDING/);
});
