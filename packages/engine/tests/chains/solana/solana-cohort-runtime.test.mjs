/** Host-only codec/boundary fixtures. No validator, native RPC or proof runs. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { base58Encode, createBoundSolanaRecipientViews, createOwnedSolanaCohortRuntime, createOwnedSolanaRuntime, SOLANA_PRIVATE_COHORT_OPTIONS, solanaLedgerRetentionArguments, signSolanaTransfer } from '../../../src/chains/solana/solana-runtime.mjs';
import { createOwnedNativeCohortRuntime } from '../../../src/chains/shared/native-runtime.mjs';
const address = n => base58Encode(Buffer.alloc(32, n));
function fixture() {
  const genesis = address(8), seed = Buffer.alloc(32, 3), solver = signSolanaTransfer({ seed, recipient: address(4), recentBlockhash: address(6), lamports: '1' }).solver;
  const recipients = [address(4), address(5)], calls = [], records = new Map();
  const own = (recipient, signature) => { const record = records.get(signature); assert.ok(record, 'SOLANA_UNKNOWN_SIGNED_IDENTITY'); assert.equal(record.recipient, recipient, 'SOLANA_BOUND_RECIPIENT_MISMATCH'); return record; };
  const operations = {
    async transfer(recipient, lamports, { beforeSign, onSigned }) { await beforeSign({ genesis, solver, recipient, lamports: String(lamports) }); const signed = { ...signSolanaTransfer({ seed, recipient, recentBlockhash: address(6), lamports }), genesis }; records.set(signed.signature, signed); calls.push('signed:' + recipient); await onSigned(structuredClone(signed)); calls.push('broadcast:' + recipient); return structuredClone(signed); },
    async observe(recipient, signature) { calls.push('observe:' + recipient); return structuredClone(own(recipient, signature)); },
    async balance(recipient) { calls.push('balance:' + recipient); return '1000000'; },
    async replayFinalizedForReview(recipient, signature) { own(recipient, signature); calls.push('replay:' + recipient); return { signature }; },
    transfers(recipient) { return [...records.values()].filter(record => record.recipient === recipient); },
  };
  const views = createBoundSolanaRecipientViews({ genesis, solver, recipients }, operations);
  return { genesis, solver, recipients, calls, records, operations, views };
}
test('all fixed recipients are registered and frozen before either view dispatches', async () => {
  const f = fixture(); assert.equal(f.views.length, 2); assert.ok(Object.isFrozen(f.views)); assert.ok(f.views.every(Object.isFrozen));
  assert.equal(f.views[0].solver, f.views[1].solver); assert.equal(f.views[0].genesis, f.views[1].genesis); assert.notEqual(f.views[0].recipient, f.views[1].recipient);
  f.recipients[0] = address(10); const signed = await f.views[0].transfer('3000000', { onSigned: async record => { assert.equal(record.recipient, address(4)); assert.equal(f.calls.some(x => x.startsWith('broadcast')), false); f.calls.push('retained'); } });
  assert.deepEqual(f.calls, ['signed:' + address(4), 'retained', 'broadcast:' + address(4)]); assert.equal(signed.recipient, address(4));
  const second = await f.views[1].transfer('3000000'); assert.notEqual(signed.signature, second.signature);
  assert.equal(f.views[0].transfers.length, 1); assert.equal(f.views[1].transfers.length, 1);
  assert.equal((await f.views[1].observe(second.signature)).recipient, address(5));
});
test('cross-recipient observation, replay, balance and arbitrary knobs are rejected', async () => {
  const f = fixture(), signed = await f.views[0].transfer('2');
  await assert.rejects(f.views[1].observe(signed.signature), /BOUND_RECIPIENT/);
  await assert.rejects(f.views[1].replayFinalizedForReview(signed.signature), /BOUND_RECIPIENT/);
  await assert.rejects(f.views[1].balance(f.views[0].recipient), /OWNED_ADDRESS/);
  for (const options of [{ recipient: address(11) }, { seed: Buffer.alloc(32) }, { endpoint: 'http://example.com' }, { onSigned: async () => {}, count: 7 }]) await assert.rejects(f.views[0].transfer('1', options), /INVALID_BOUND_OPTIONS/);
  await assert.rejects(f.views[0].observe(signed.signature, { recipient: address(5) }), /INVALID_BOUND_OPTIONS/);
  await assert.rejects(f.views[0].transfer('1', { onSigned: 'not-function' }), /INVALID_SIGNED_CALLBACK/);
});
test('captured native operations cannot be replaced after recipient registration', async () => {
  const f = fixture(); f.operations.transfer = () => { throw Error('mutated'); };
  assert.equal((await f.views[0].transfer('1')).recipient, address(4));
  const copy = f.views[0].transfers; copy[0].recipient = address(5); assert.equal(f.views[0].transfers[0].recipient, address(4));
});
test('wrong signed recipient fails before caller retention or broadcast', async () => {
  const f = fixture(); let called = false;
  const views = createBoundSolanaRecipientViews({ genesis: f.genesis, solver: f.solver, recipients: [address(4), address(5)] }, { ...f.operations, async transfer(_recipient, amount, options) { return f.operations.transfer(address(5), amount, options); } });
  await assert.rejects(views[0].transfer('1', { onSigned: () => { called = true; } }), /BOUND_RECIPIENT/);
  assert.equal(called, false); assert.equal(f.calls.some(x => x.startsWith('broadcast')), false);
});
test('duplicate or arbitrary recipient registration shapes fail closed', () => {
  const f = fixture();
  for (const recipients of [[], [address(4), address(4)], [f.solver], [address(4), address(5), address(6)], ['invalid']]) assert.throws(() => createBoundSolanaRecipientViews({ genesis: f.genesis, solver: f.solver, recipients }, f.operations));
});
test('cohort constructors reject option overrides before touching any native binary', async () => {
  for (const constructor of [createOwnedSolanaCohortRuntime, createOwnedNativeCohortRuntime]) { await assert.rejects(constructor({ endpoint: 'http://example.com' }), /FIXED_CONSTRUCTOR/); await assert.rejects(constructor(async () => {}, { accounts: 9 }), /FIXED_CONSTRUCTOR/); }
  await assert.rejects(createOwnedSolanaRuntime(async () => {}, { recipients: [address(4), address(5)] }), /INVALID_RETENTION_OPTIONS/);
  assert.deepEqual(SOLANA_PRIVATE_COHORT_OPTIONS, { ledgerRetentionShreds: 1000000, ticksPerSlot: 64, resourceProfile: 'PC23_BOUNDED_LEDGER_V1' });
  assert.deepEqual(solanaLedgerRetentionArguments(), []);
});
test('static startup profile preserves historical five accounts and fixed nine cohort accounts', async () => {
  const native = await readFile(new URL('../../../src/chains/shared/native-runtime.mjs', import.meta.url), 'utf8');
  assert.match(native, /'--accounts', cohort \? '9' : '5'/);
  assert.match(native, /createOwnedNativeRuntimeProfile\(progress, false\)/);
  const solana = await readFile(new URL('../../../src/chains/solana/solana-runtime.mjs', import.meta.url), 'utf8');
  assert.match(solana, /createOwnedSolanaRuntimeProfile\(progress, options, false\)/);
  assert.match(solana, /createOwnedSolanaRuntimeProfile\(progress, SOLANA_PRIVATE_COHORT_OPTIONS, true\)/);
  assert.match(solana, /READ_METHODS\.has\(method\)/);
});

test('the bound pre-sign gate rejects before any signature or broadcast', async () => {
  const f = fixture();
  await assert.rejects(f.views[0].transfer('3000000', {
    beforeSign: async intent => {
      assert.equal(intent.recipient, f.views[0].recipient);
      assert.equal(intent.lamports, '3000000');
      assert.equal(f.calls.length, 0);
      throw new Error('CURRENT_READY_STATE_REJECTED');
    },
  }), /CURRENT_READY_STATE_REJECTED/);
  assert.equal(f.calls.length, 0);
  assert.equal(f.views[0].transfers.length, 0);
  await assert.rejects(f.views[0].transfer('1', { beforeSign: true }), /INVALID_PRE_SIGN_CALLBACK/);
});
