/** Moving shared code must not create a second state or function identity. */
import test from 'node:test';
import assert from 'node:assert/strict';

const pairs = [
  ['@lianum/mobile-protocol/wallet/client', '../src/wallet/client/view-model.mjs'],
  ['@lianum/mobile-protocol/wallet/owner-graph-review-v1', '../src/wallet/contracts/owner-graph-review-v1.mjs'],
  ['@lianum/mobile-protocol/wallet/owner-portfolio-contract', '../src/wallet/contracts/owner-portfolio-contract.mjs'],
  ['@lianum/mobile-protocol/wallet/generation-position-state-v2', '../src/wallet/contracts/generation-position-state-v2.mjs'],
  ['@lianum/crypto/portable-poseidon2', '../../crypto/src/portable/poseidon2-bn254-v1.mjs'],
  ['@lianum/engine/storage/records', '../../backend/src/claims/storage/segmented-record-store.mjs'],
  ['@lianum/proofs/host/process-files', '../../../tests/integration/native/native-flow-owned-files-v1.mjs'],
  ['@lianum/proofs/host/process-rss', '../../../tests/integration/native/native-flow-owned-rss-v1.mjs'],
];

test('compatibility entries and public APIs share every exported function and object', async () => {
  for (const [specifier, previous] of pairs) {
    const canonical = await import(specifier);
    const compatibility = await import(new URL(previous, import.meta.url));
    assert.deepEqual(Object.keys(compatibility), Object.keys(canonical), specifier);
    for (const key of Object.keys(canonical)) assert.equal(compatibility[key], canonical[key], `${specifier}:${key}`);
  }
});

test('original parser error identity crosses old and new monitor entries unchanged', async () => {
  const shared = await import('@lianum/proofs/host/process-files');
  const previous = await import('../../../tests/integration/native/native-flow-owned-files-v1.mjs');
  const fields = Array(22).fill('0');
  fields[0] = 'R'; fields[1] = '1'; fields[2] = '-1'; fields[3] = '42'; fields[19] = '100';
  let original;
  try { previous.parseNativeProcStat(42, `42 (identity fixture) ${fields.join(' ')}`); }
  catch (error) { original = error; }
  assert.ok(original);
  assert.equal(shared.isOriginalNativeProcStatMinusOneV1(original), true);
  assert.equal(shared.nativeProcStatIntegerDiagnosticV1(original), previous.nativeProcStatIntegerDiagnosticV1(original));
  assert.equal(shared.isOriginalNativeProcStatMinusOneV1(new Error(original.message)), false);
});
