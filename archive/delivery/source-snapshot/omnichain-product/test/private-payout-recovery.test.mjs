import test from 'node:test';
import {derivePrivateAssetIdentity,derivePrivateAssetPoolScope} from '../src/private-asset-runtime.mjs';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRecipientPayoutRecovery } from '../src/private-payout-recovery.mjs';
import { createRecipientCustody, recoverRecipientCustody } from '../src/private-recipient-custody.mjs';
import { nullifier } from '../src/private-note-encoding.mjs';
import { derivePrivatePoolScope, encodePrivatePoolInputs, noteWordsToHash, PrivateNoteTree, privateSpentDigest } from '../src/private-note-tree.mjs';
import { privateVerifierCalldata } from '../src/private-assembly-runtime.mjs';

// These are deterministic protocol-shape tests with fake chain receipts and
// fake proofs. They do not claim a real verifier, native send or funded payout.
const h = (n = 32) => randomBytes(n).toString('hex');
const pref = b => `0x${Buffer.from(b).toString('hex')}`;
const word = n => BigInt(n).toString(16).padStart(64, '0');
const topic = '0x8c6afca18616d300c4fb7eff2f714229e89e93825b143dc4ecc04231972aa19f';
const YES = `0x${word(1)}`, NO = `0x${word(0)}`;

async function fixture(t, { role = 'sol', authorizeAdapter, assetKind } = {}) {
  const directory = await mkdtemp(join(tmpdir(), 'payout-recovery-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const address = `0x${h(20)}`, deploymentDomain = `0x${h()}`, chainId = '31337';
  const assetFields=assetKind?{asset:assetKind==='NATIVE'?'0x'+'00'.repeat(20):'0x'+h(20),assetCodeHash:assetKind==='NATIVE'?'0x'+'00'.repeat(32):'0x'+h()}:{};
  if(assetKind)assetFields.assetIdentity=derivePrivateAssetIdentity(chainId,assetFields.asset,assetFields.assetCodeHash);
  const scope = assetKind?derivePrivateAssetPoolScope(chainId,address,deploymentDomain,assetFields.assetIdentity):derivePrivatePoolScope(chainId, address, deploymentDomain), recipient = h(20), policy = `0x${h()}`;
  const epoch = 3166667n;
  const terms = { scope: scope.slice(2), policy: policy.slice(2), role, originSlot: role === 'sol' ? 1 : 2,
    origin: h(), value: '500000000000000', descriptor: { chain: role === 'sol' ? 1 : 2, nonce: h(),
      source: role === 'sol' ? h() : '00'.repeat(32), recipient: h(), amount: role === 'sol' ? '3000000' : '100000',
      executeAfter: (epoch * 600n).toString(), executeBefore: ((epoch + 11n) * 600n).toString(), validFrom: epoch.toString(), validUntil: (epoch + 12n).toString() } };
  const cfg = { path: join(directory, `${role}.vault`), password: h(), expectedTerms: terms, withdrawalRecipient: recipient };
  let wallet = await createRecipientCustody(cfg);
  const { termsDigest, value, paymentCommitment, localCommitment } = wallet.reviewCompensation();
  await wallet.acknowledgeCompensation({ termsDigest, value, paymentCommitment, localCommitment });
  const invoice = wallet.invoice(terms);
  t.after(() => wallet.close());
  const noteNullifier = pref(nullifier(terms.scope, invoice.paymentCommitment, invoice.note.secret));
  const tree = new PrivateNoteTree([h(), invoice.paymentCommitment]);
  const snapshot = { blockNumber: '0x2', blockHash: `0x${h()}`, blockTimestamp: (epoch * 600n + 1n).toString(), epoch: epoch.toString(),
    scope, policy, root: tree.root, leaves: tree.leaves, leafCount: 2, nullifiers: [], spentCount: 0 };
  snapshot.spentDigest = privateSpentDigest(scope, [], 0);
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
      topics: [topic, `0x${'0'.repeat(24)}${recipient}`], data: `0x${word(terms.value)}${noteNullifier.slice(2)}` };
    const transaction = { hash, blockNumber: snapshot.blockNumber, blockHash: snapshot.blockHash, to: address,
      from: `0x${h(20)}`, input: privateVerifierCalldata('67843a5b', proof.proof, proof.publicInputs), value: '0x0' };
    const receipt = { status: '0x1', transactionHash: hash, blockNumber: snapshot.blockNumber, blockHash: snapshot.blockHash,
      to: address, from: transaction.from, logs: [structuredClone(log)] };
    transactions.set(hash, transaction); receipts.set(hash, receipt); logs.push(log);
    if (controls.submitError) throw controls.submitError;
    return receipt;
  }
  const options = { pool, runtime, terms, invoice, recipient,
    authorize: async request => { controls.signs++; return authorizeAdapter?authorizeAdapter(request):wallet.authorizeWithdrawal(request); },
    prove: async input => { controls.proofs++; await controls.duringProof?.(); const proof = makeProof(input); controls.mutateProof?.(proof); return proof; },
    submit: send,
    persist: async state => { if (controls.persistError?.(state)) throw new Error('SIMULATED_DURABLE_WRITE_FAILURE'); persisted.push(state); },
    onConfirmed: state => confirmed.push(state) };
  const recovery = createRecipientPayoutRecovery(options);
  async function restartRecipient() {
    wallet.close(); wallet = await recoverRecipientCustody(cfg);
    assert.deepEqual(wallet.invoice(terms), invoice, 'Recovery must retain the original note and signature');
  }
  return { ...options, recovery, controls, snapshot, blocks, transactions, receipts, logs, calls, persisted, confirmed,
    spend, send, makeProof, restartRecipient, currentWallet:()=>wallet, options, noteNullifier, installHeader };
}

function currentProof(f) {
  return { proof: Buffer.from([1, 2, 3]), publicInputs: encodePrivatePoolInputs('withdraw', { scope: f.pool.scope, policy: f.pool.policy,
    epoch: f.snapshot.epoch, root: f.snapshot.root, nullifier: f.noteNullifier, amount: f.terms.value, recipient: `0x${f.recipient}` }) };
}
function rewriteInput(f, modify) {
  const tx = f.transactions.get(f.logs[0].transactionHash), proof = currentProof(f); modify(proof.publicInputs);
  tx.input = privateVerifierCalldata('67843a5b', proof.proof, proof.publicInputs);
}

test('original separate encrypted recipient vault recovers exact invoice and payout after coordinator loss', async t => {
  for (const role of ['sol', 'btc']) {
    const f = await fixture(t, { role });
    assert.equal((await f.recovery.reconcile()).state, 'READY');
    await f.restartRecipient();
    const result = await f.recovery.recover();
    assert.equal(result.state, 'WITHDRAWN'); assert.equal(result.role, role); assert.equal(result.amount, f.terms.value);
    assert.equal(result.recipient, `0x${f.recipient}`); assert.equal(f.controls.sends, 1);
    assert.equal(f.confirmed.length, 1); assert.deepEqual(f.persisted.map(x => x.state), ['SUBMITTING', 'WITHDRAWN']);
    assert.ok(f.calls.some(c => c.method === 'eth_getLogs'));
    assert.ok(f.calls.every(c => !/sendRawTransaction|sendTransaction|btc|solana/.test(c.method)));
  }
});

test('duplicate and concurrent recovery reconcile the original receipt without signing or sending again', async t => {
  const f = await fixture(t);
  const results = await Promise.all([f.recovery.recover(), f.recovery.recover(), f.recovery.recover()]);
  assert.ok(results.every(x => x.state === 'WITHDRAWN'));
  assert.equal(new Set(results.map(x => x.transactionHash)).size, 1);
  assert.equal(f.controls.sends, 1); assert.equal(f.controls.signs, 1); assert.equal(f.controls.proofs, 1);
  const freshCoordinator = createRecipientPayoutRecovery(f.options);
  assert.equal((await freshCoordinator.recover()).transactionHash, results[0].transactionHash);
  assert.equal(f.controls.sends, 1);
});

test('lost submit response is reconciled from canonical logs, transaction calldata and receipt', async t => {
  const f = await fixture(t); f.controls.submitError = new Error('SIMULATED_LOST_SUBMIT_RESPONSE');
  assert.equal((await f.recovery.recover()).state, 'WITHDRAWN');
  assert.equal(f.controls.sends, 1); assert.equal(f.confirmed.length, 1);
  assert.equal((await f.recovery.recover()).state, 'WITHDRAWN'); assert.equal(f.controls.sends, 1);
});

test('a pre-submit durable write failure prevents all sends and allows a later exact retry', async t => {
  const f = await fixture(t); f.controls.persistError = state => state.state === 'SUBMITTING';
  await assert.rejects(f.recovery.recover(), /SIMULATED_DURABLE_WRITE_FAILURE/);
  assert.equal(f.controls.sends, 0); assert.equal(f.confirmed.length, 0);
  f.controls.persistError = null;
  assert.equal((await f.recovery.recover()).state, 'WITHDRAWN'); assert.equal(f.controls.sends, 1);
});

test('verified confirmation occurs before a post-submit audit failure; retry cannot double-pay', async t => {
  const f = await fixture(t); f.controls.persistError = state => state.state === 'WITHDRAWN';
  await assert.rejects(f.recovery.recover(), /SIMULATED_DURABLE_WRITE_FAILURE/);
  assert.equal(f.controls.sends, 1); assert.equal(f.confirmed[0].state, 'WITHDRAWN');
  f.controls.persistError = null;
  assert.equal((await f.recovery.recover()).state, 'WITHDRAWN'); assert.equal(f.controls.sends, 1);
});

test('spent original note with absent evidence stays unknown and is never submitted', async t => {
  const f = await fixture(t); f.spend();
  for (const invoke of [() => f.recovery.reconcile(), () => f.recovery.recover()]) {
    const result = await invoke(); assert.equal(result.state, 'UNKNOWN'); assert.equal(result.reason, 'SPENT_WITHOUT_VERIFIED_WITHDRAWAL');
  }
  assert.equal(f.controls.sends, 0); assert.equal(f.controls.signs, 0); assert.equal(f.confirmed.length, 0);
});

test('missing receipt or temporary logs failure after a lost response stays unknown until proven', async t => {
  const f = await fixture(t); f.controls.submitError = new Error('lost response'); f.controls.missingReceipt = true;
  assert.equal((await f.recovery.recover()).state, 'UNKNOWN'); assert.equal(f.controls.sends, 1); assert.equal(f.confirmed.length, 0);
  f.controls.missingReceipt = false; f.controls.logsError = true;
  assert.equal((await f.recovery.recover()).state, 'UNKNOWN'); assert.equal(f.controls.sends, 1);
  f.controls.logsError = false;
  assert.equal((await f.recovery.recover()).state, 'WITHDRAWN'); assert.equal(f.controls.sends, 1);
});

test('ambiguous submission while still unspent is not retried by the surviving host', async t => {
  const f = await fixture(t);
  const recovery = createRecipientPayoutRecovery({ ...f.options, submit: async () => { f.controls.sends++; throw new Error('unknown broadcast'); } });
  assert.equal((await recovery.recover()).state, 'UNKNOWN');
  assert.equal((await recovery.recover()).state, 'UNKNOWN');
  assert.equal(f.controls.sends, 1); assert.equal(f.controls.proofs, 1);
});

test('not-yet-issued original commitment remains pending and never signs or submits', async t => {
  const f = await fixture(t); const tree = new PrivateNoteTree([]);
  f.snapshot.leaves = tree.leaves; f.snapshot.leafCount = 0; f.snapshot.root = tree.root;
  const oldCall = f.pool.call; f.pool.call = async (method, args, block) => method === 'acceptedRoots(bytes32)' ? YES : oldCall(method, args, block);
  assert.equal((await f.recovery.recover()).state, 'PENDING');
  assert.equal(f.controls.signs, 0); assert.equal(f.controls.sends, 0);
});

test('pool address, derived chain scope, policy and live authority mutations fail closed', async t => {
  for (const field of ['address', 'scope', 'policy', 'deploymentDomain']) {
    const f = await fixture(t); f.pool[field] = `0x${h(field === 'address' ? 20 : 32)}`;
    await assert.rejects(f.recovery.recover(), /PAYOUT_RECOVERY_/); assert.equal(f.controls.sends, 0);
  }
  const f = await fixture(t);
  assert.throws(() => createRecipientPayoutRecovery({ ...f.options, pool: { ...f.pool, address: `0x${h(20)}` } }), /POOL_BINDING/);
  f.runtime.metadata.chainId = '31338'; await assert.rejects(f.recovery.reconcile(), /PAYOUT_RECOVERY_CHAIN/);
});

test('different pinned destination cannot reuse another recipient withdrawal receipt', async t => {
  const f = await fixture(t); await f.send(currentProof(f));
  const recovery = createRecipientPayoutRecovery({ ...f.options, recipient: h(20) });
  assert.equal((await recovery.recover()).state, 'UNKNOWN'); assert.equal(f.controls.sends, 1);
});

test('exact receipt validation rejects wrong scope, policy, nullifier, amount, destination and method', async t => {
  const changes = [
    f => rewriteInput(f, words => { words[0] = (BigInt(words[0]) ^ 1n).toString(); }),
    f => rewriteInput(f, words => { words[8] = (BigInt(words[8]) ^ 1n).toString(); }),
    f => rewriteInput(f, words => { words[25] = (BigInt(words[25]) ^ 1n).toString(); }),
    f => rewriteInput(f, words => { words[33] = '1'; }),
    f => rewriteInput(f, words => { words[34] = (BigInt(words[34]) ^ 1n).toString(); }),
    f => { const tx = f.transactions.get(f.logs[0].transactionHash); tx.input = '0xdeadbeef' + tx.input.slice(10); },
    f => { f.transactions.get(f.logs[0].transactionHash).to = `0x${h(20)}`; },
    f => { f.receipts.get(f.logs[0].transactionHash).status = '0x0'; },
    f => { f.receipts.get(f.logs[0].transactionHash).logs[0].data = `0x${word(1)}${f.noteNullifier.slice(2)}`; },
  ];
  for (const change of changes) {
    const f = await fixture(t); await f.send(currentProof(f)); change(f);
    const result = await f.recovery.recover(); assert.equal(result.state, 'UNKNOWN');
    assert.equal(f.controls.sends, 1); assert.equal(f.confirmed.length, 0);
  }
});

test('receipt reorg, nonmembership, removed event and future receipt cannot establish payment', async t => {
  const changes = [
    f => { f.blocks.get(f.logs[0].blockNumber).hash = `0x${h()}`; },
    f => { f.blocks.get(f.logs[0].blockNumber).transactions = []; },
    f => { f.logs[0].removed = true; },
    f => { f.logs[0].blockNumber = '0xffff'; },
    f => { f.logs.push(structuredClone(f.logs[0])); },
  ];
  for (const change of changes) {
    const f = await fixture(t); await f.send(currentProof(f)); change(f);
    // A changed current canonical header fails at discovery; other inconsistencies
    // preserve the explicit spent-without-evidence UNKNOWN state.
    try { assert.equal((await f.recovery.recover()).state, 'UNKNOWN'); }
    catch (error) { assert.match(error.message, /PAYOUT_RECOVERY_BLOCK_CHANGED/); }
    assert.equal(f.controls.sends, 1); assert.equal(f.confirmed.length, 0);
  }
});

test('proof, authorization and stale epoch cannot redirect or reuse discovery', async t => {
  const f = await fixture(t); f.controls.mutateProof = proof => { proof.publicInputs[33] = '1'; };
  await assert.rejects(f.recovery.recover(), /PAYOUT_RECOVERY_PUBLIC_BINDING/); assert.equal(f.controls.sends, 0);
  f.controls.mutateProof = null;
  f.controls.duringProof = () => { f.snapshot.blockTimestamp = (BigInt(f.snapshot.blockTimestamp) + 600n).toString(); f.snapshot.epoch = (BigInt(f.snapshot.epoch) + 1n).toString(); f.installHeader(); };
  const result = await f.recovery.recover(); assert.equal(result.state, 'PENDING'); assert.equal(result.reason, 'EPOCH_CHANGED_BEFORE_SUBMIT');
  assert.equal(f.controls.sends, 0);
});

test('completion persistence never receives proof, invoice opening, signature, password or key', async t => {
  const f = await fixture(t); await f.recovery.recover();
  const encoded = JSON.stringify(f.persisted);
  for (const secret of [f.invoice.note.secret, f.invoice.note.x, f.invoice.invoiceSignature, 'privateKeyPem', 'password', 'siblings']) assert.equal(encoded.includes(secret), false);
  assert.ok(f.persisted.every(state => !Object.hasOwn(state, 'proof')));
});

test('historic successful withdrawal is accepted in a new epoch only while its own height stays canonical', async t => {
  const f = await fixture(t); await f.send(currentProof(f));
  const receiptBlock = f.logs[0].blockNumber;
  f.snapshot.blockNumber = `0x${(BigInt(f.snapshot.blockNumber) + 1n).toString(16)}`;
  f.snapshot.blockHash = `0x${h()}`;
  f.snapshot.blockTimestamp = (BigInt(f.snapshot.blockTimestamp) + 600n).toString();
  f.snapshot.epoch = (BigInt(f.snapshot.epoch) + 1n).toString(); f.installHeader();
  assert.equal((await f.recovery.reconcile()).state, 'WITHDRAWN');
  f.confirmed.length = 0;
  f.blocks.get(receiptBlock).hash = `0x${h()}`;
  const result = await f.recovery.recover();
  assert.equal(result.state, 'UNKNOWN'); assert.equal(result.reason, 'SPENT_WITHOUT_VERIFIED_WITHDRAWAL');
  assert.equal(f.confirmed.length, 0); assert.equal(f.controls.sends, 1);
});

test('fresh discovery detects spent-map/list disagreement before any signature or send', async t => {
  const f = await fixture(t); const original = f.pool.call;
  f.pool.call = async (method, args, block) => method === 'spentNullifiers(bytes32)' ? YES : original(method, args, block);
  await assert.rejects(f.recovery.recover(), /PAYOUT_RECOVERY_SPENT_DISAGREEMENT/);
  assert.equal(f.controls.sends, 0); assert.equal(f.controls.signs, 0);
});

test('receipt ABI rejects extra trailing words, noncanonical offsets and nonzero proof padding', async t => {
  const mutations = [
    input => `${input}${word(0)}`,
    input => `${input.slice(0, 10)}${word(96)}${input.slice(74)}`,
    input => `${input.slice(0, 10 + 96 * 2 + 6)}01${input.slice(10 + 96 * 2 + 8)}`,
  ];
  for (const mutate of mutations) {
    const f = await fixture(t); await f.send(currentProof(f));
    const tx = f.transactions.get(f.logs[0].transactionHash); tx.input = mutate(tx.input);
    assert.equal((await f.recovery.recover()).state, 'UNKNOWN');
    assert.equal(f.controls.sends, 1); assert.equal(f.confirmed.length, 0);
  }
});

test('shared withdrawal extraction does not admit a type3 note or fabricated invoice in type2 wrapper', async t => {
  const f = await fixture(t);
  const changedType = structuredClone(f.invoice); changedType.note.type = 3;
  assert.throws(() => createRecipientPayoutRecovery({ ...f.options, invoice: changedType }), /RECIPIENT_NOTE_MISMATCH/);
  const missingSignature = structuredClone(f.invoice); delete missingSignature.invoiceSignature;
  assert.throws(() => createRecipientPayoutRecovery({ ...f.options, invoice: missingSignature }), /RECIPIENT_INPUT/);
  const forgedSignature = structuredClone(f.invoice); forgedSignature.invoiceSignature = '00'.repeat(64);
  assert.throws(() => createRecipientPayoutRecovery({ ...f.options, invoice: forgedSignature }), /RECIPIENT_INVOICE_SIGNATURE/);
  assert.equal(f.controls.sends, 0); assert.equal(f.controls.signs, 0);
});


test('retired original signer does not reset SAME payout recovery ambiguous-send latch or trigger signing from reads',async t=>{
  const{createRetainedWalletRecipient}=await import('../src/private-wallet-retirement.mjs');let managed;const f=await fixture(t,{authorizeAdapter:request=>managed.authorizeWithdrawal(request)}),review={role:'sol',acknowledged:true,termsDigest:h(),value:f.terms.value,paymentCommitment:f.invoice.paymentCommitment,localCommitment:f.invoice.localCommitment};let starts=0;
  function processDouble(pid){let closed=false;return{pid,review,provenance:()=>({pid,closed,channelsClosed:closed}),request:async(operation,request)=>{assert.equal(operation,'authorizeWithdrawal');assert.equal(closed,false);return f.currentWallet().authorizeWithdrawal(request);},stop:async()=>{closed=true;f.currentWallet().close();return{pid,code:0,signal:null,exitedAtNs:'1'};},terminate:async()=>{closed=true;return{pid,code:null,signal:'SIGTERM',exitedAtNs:'1'};}};}
  managed=createRetainedWalletRecipient({role:'sol',initialRecipient:processDouble(100),custody:{path:'/unused-test-seam',password:'unused',expectedTerms:f.terms,withdrawalRecipient:f.recipient},expectedReview:review,startRecipient:async config=>{assert.equal(config.mode,'recover');starts++;await f.restartRecipient();return processDouble(100+starts);}});
  const originalRecovery=f.recovery;await managed.retire();assert.equal((await originalRecovery.reconcile()).state,'READY');assert.equal(starts,0);
  f.controls.submitError=new Error('SIMULATED_LOST_RESPONSE');f.controls.missingReceipt=true;assert.equal((await originalRecovery.recover()).state,'UNKNOWN');assert.equal(starts,1);assert.equal(f.controls.sends,1);await managed.retire();
  for(let n=0;n<3;n++){assert.equal((await originalRecovery.reconcile()).state,'UNKNOWN');assert.equal((await originalRecovery.recover()).state,'UNKNOWN');}assert.equal(starts,1);assert.equal(f.controls.signs,1);assert.equal(f.controls.proofs,1);assert.equal(f.controls.sends,1);
  f.controls.missingReceipt=false;assert.equal((await originalRecovery.recover()).state,'WITHDRAWN');assert.equal(starts,1);assert.equal(f.controls.sends,1);assert.equal(originalRecovery,f.recovery);
});

for(const assetKind of ['ERC20','NATIVE'])test('asset-scoped recipient recovery keeps original signing and canonical withdrawal checks: '+assetKind,async t=>{
 const f=await fixture(t,{assetKind});assert.equal((await f.recovery.reconcile()).state,'READY');
 f.controls.assetReadMismatch=true;await assert.rejects(f.recovery.reconcile(),/ASSET_DEPLOYMENT_CHANGED/);f.controls.assetReadMismatch=false;
 const original=f.pool.assetIdentity;f.pool.assetIdentity='0x'+h();await assert.rejects(f.recovery.reconcile(),/ASSET/);f.pool.assetIdentity=original;
 const result=await f.recovery.recover();assert.equal(result.state,'WITHDRAWN');assert.equal(f.controls.sends,1);assert.equal(f.controls.signs,1);
 const changed={...f.pool,asset:'0x'+h(20),assetCodeHash:'0x'+h()};changed.assetIdentity=derivePrivateAssetIdentity('31337',changed.asset,changed.assetCodeHash);
 assert.throws(()=>createRecipientPayoutRecovery({...f.options,pool:changed}),/POOL_BINDING/);
});
