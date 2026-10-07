/** Host storage/identity conformance. Synthetic public signatures; no node,
 * private signing key, proof, compiler or benchmark. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { canonical } from '../../../../../omnichain-product/src/privacy.mjs';
import { decodeCanonicalEvmTransaction, assertSignedEvmTransaction } from '../chain-adapters/owned-evm-v2-runtime.mjs';
import { compactClaimEvmRequest, compactClaimEvmPreparation, originalClaimEvmRecord } from './controller-evm-record.mjs';
import { createClaimVaultSession } from './vault-session.mjs';
import { MEMO_PROGRAM, assertMemoProgramAccount, encodeSolanaBindingMessage } from '../chain-adapters/native-receipt-binding.mjs';
const hash = value => createHash('sha256').update(value).digest('hex');
const copy = value => structuredClone(value);
const integer = value => { let text = BigInt(value).toString(16); if (text === '0') return Buffer.alloc(0);
  if (text.length % 2) text = '0' + text; return Buffer.from(text, 'hex'); };
function rlp(value) {
  const prefix = (n, base) => n < 56 ? Buffer.from([base + n])
    : Buffer.concat([Buffer.from([base + 55 + integer(n).length]), integer(n)]);
  if (Array.isArray(value)) { const body = Buffer.concat(value.map(rlp)); return Buffer.concat([prefix(body.length, 192), body]); }
  return value.length === 1 && value[0] < 128 ? value : Buffer.concat([prefix(value.length, 128), value]);
}
function fixture(data = '0xabcd') {
  // Public recovery vector r=Gx,s=1; it conveys no private-key capability.
  const raw = '0x' + rlp([integer(7), integer(1000000000), integer(30000000), Buffer.from('11'.repeat(20), 'hex'),
    integer(0), Buffer.from(data.slice(2), 'hex'), integer(35n + 2n * 31337n),
    Buffer.from('79be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798', 'hex'), integer(1)]).toString('hex');
  const decoded = decodeCanonicalEvmTransaction(raw);
  const transaction = Object.fromEntries(['chainId', 'from', 'to', 'nonce', 'gasPrice', 'gas', 'value', 'data'].map(key => [key, decoded[key]]));
  const request = { from: decoded.from, to: decoded.to, gas: '0x1c9c380', value: '0x0', data };
  const prepared = { genesis: '0x' + hash('genesis'), head: { number: '0x7', hash: '0x' + hash('head'), timestamp: '0x10' },
    transaction, unsignedWire: decoded.unsignedWire, funds: { balanceWei: '10000000000000000000', estimatedGas: '100000', targetCodeHash: '0x' + hash('code') } };
  const signed = { nativeWire: decoded.nativeWire, nativeId: decoded.nativeId, transactionSHA256: decoded.transactionSHA256 };
  const original = { request, prepared, signed, transactionHash: signed.nativeId, phase: 'native-signed-durable' };
  const row = { transaction: compactClaimEvmRequest(request), prepared: compactClaimEvmPreparation(prepared), signed,
    calldataSHA256: hash(Buffer.from(data.slice(2), 'hex')) };
  return { row, original };
}
test('exact signed bytes reconstruct every original EVM field from compact evidence', () => {
  const { row, original } = fixture();
  const found = originalClaimEvmRecord(row, [original]);
  assert.equal(found, original);
  const decoded = assertSignedEvmTransaction(row.signed.nativeWire, found.prepared.transaction);
  assert.equal(decoded.unsignedWire, found.prepared.unsignedWire);
  assert.equal(decoded.nativeId, row.signed.nativeId); assert.equal(decoded.transactionSHA256, row.signed.transactionSHA256);
  assert.equal(row.transaction.data, undefined); assert.equal(row.prepared.transaction.data, undefined);
  assert.equal(row.prepared.unsignedWire, undefined);
  for (const field of ['from', 'to', 'nonce', 'gas', 'gasPrice', 'value', 'chainId', 'data']) {
    const changed = copy(original); changed.prepared.transaction[field] = field === 'data' ? '0xaaaa'
      : ['from', 'to'].includes(field) ? '0x' + '22'.repeat(20) : '8';
    assert.throws(() => originalClaimEvmRecord(row, [changed]), /ORIGINAL_PREPARATION/);
  }
  for (const field of ['genesis', 'head', 'funds', 'unsignedWire']) {
    const changed = copy(original); changed.prepared[field] = field === 'head' ? { ...changed.prepared.head, hash: '0x' + hash('changed') }
      : field === 'funds' ? { ...changed.prepared.funds, balanceWei: '1' } : '0xaaaa';
    assert.throws(() => originalClaimEvmRecord(row, [changed]), /ORIGINAL_/);
  }
  for (const field of ['nativeWire', 'nativeId', 'transactionSHA256']) {
    const changed = copy(original); changed.signed[field] = '0xaaaa';
    assert.throws(() => originalClaimEvmRecord(row, [changed]), /ORIGINAL_SIGNED_WIRE/);
  }
});
test('known no-key predecessor allows one original; absent and ambiguous signing candidates stay blocked', () => {
  const { row, original } = fixture(), rejected = { ...copy(original), signed: null, phase: 'pre-sign-rejected' };
  assert.equal(originalClaimEvmRecord(row, [rejected, original]), original);
  assert.throws(() => originalClaimEvmRecord(row, []), /ORIGINAL_RUNTIME_REQUIRED/);
  assert.throws(() => originalClaimEvmRecord(row, [original, copy(original)]), /MULTIPLE_ORIGINAL/);
  const unknown = { ...copy(original), signed: null, phase: 'signing-outcome-unknown' };
  assert.throws(() => originalClaimEvmRecord(row, [unknown, original]), /MULTIPLE_ORIGINAL/);
  assert.throws(() => originalClaimEvmRecord(row, [{ ...copy(original), phase: 'pre-sign-rejected' }, original]), /MULTIPLE_ORIGINAL/);
  assert.equal(originalClaimEvmRecord({ ...row, signed: null }, []), null);
});
test('duplicated proof-bearing history exceeds the unchanged vault bound; compact history preserves exact wire and CAS', async () => {
  const { row, original } = fixture('0x' + 'ab'.repeat(50000));
  const legacy = Array.from({ length: 3 }, () => ({ transaction: original.request, prepared: original.prepared, signed: original.signed }));
  assert.throws(() => canonical({ revision: 0, data: { evm: legacy } }), /Canonical JSON exceeds byte limit/);
  const compact = Array.from({ length: 3 }, () => copy(row));
  assert.ok(Buffer.byteLength(canonical({ revision: 0, data: { evm: compact } })) < 320000);
  const directory = await mkdtemp(join(tmpdir(), 'claim-compact-evm-'));
  const vault = createClaimVaultSession({ path: join(directory, 'journal.vault'), password: 'host-only compact EVM storage password' });
  try {
    await vault.create({ evm: compact });
    const actual = await vault.read(); assert.deepEqual(actual.data.evm, compact);
    assertSignedEvmTransaction(actual.data.evm[0].signed.nativeWire, original.prepared.transaction);
    const updated = await vault.update(0, data => ({ ...data, knownReceipt: { status: '0x1' } }));
    await assert.rejects(vault.update(0, data => data), /revision|Revision/); assert.deepEqual(await vault.read(), updated);
  } finally { vault.close(); await rm(directory, { recursive: true, force: true }); }
});
test('SOL issue/redemption/expiry/refund storage includes four complete pinned Memo preparations', async () => {
  const memo = await readFile(new URL('../../../../../omnichain-product/.local/agave-linux-bounded-build/derived/'
    + 'agave-2.3.13-loopback-memtable-128m/program-test/src/programs/spl_memo-3.0.0.so', import.meta.url));
  const memoProgram = { address: MEMO_PROGRAM.address, owner: MEMO_PROGRAM.owner, executable: true, dataBase64: memo.toString('base64') };
  assertMemoProgramAccount(memoProgram); assert.equal(memoProgram.dataBase64.length, 99736);
  const native = index => {
    const intent = { sourcePublicKey: hash('source' + index), recipientPublicKey: hash('recipient' + index),
      recentBlockhash: hash('block' + index), lamports: '3000000', wireKeyCommitment: hash('K' + index) };
    const account = publicKey => ({ publicKey, exists: true, owner: '0'.repeat(64), executable: false, lamports: '10000000' });
    return { genesis: hash('genesis'), intent, unsignedWire: encodeSolanaBindingMessage(intent), funds: {
      nativeHead: { id: intent.recentBlockhash, height: '1000' }, sourceAccount: account(intent.sourcePublicKey),
      recipientAccount: account(intent.recipientPublicKey), feeLamports: '5000', lastValidBlockHeight: '1100', memoProgram: copy(memoProgram) } };
  };
  // Three 50,000-byte calldata wires exceed the combined retained signed-wire
  // payload of the expected SOL-only issue/redemption/void/refund sequence.
  // Keep another 200 KiB for D27/CI51/CO42 results and 32 KiB for other records.
  // These are synthetic storage records, not accepted proofs or native facts.
  const { row } = fixture('0x' + 'ab'.repeat(50000));
  const data = { evm: Array.from({ length: 3 }, () => copy(row)),
    deposits: [0, 1].map(index => ({ native: { prepared: native(index) } })),
    tickets: [2, 3].map(index => ({ native: { prepared: native(index) } })),
    retainedProofResults: 'ab'.repeat(100 * 1024), otherRecordAllowance: 'x'.repeat(32 * 1024) };
  const size = Buffer.byteLength(canonical({ revision: 0, data }));
  assert.ok(size < 950000, 'Four full SOL preparations must fit without changing the 1 MiB cap');
  const directory = await mkdtemp(join(tmpdir(), 'claim-sol-full-preparations-'));
  const vault = createClaimVaultSession({ path: join(directory, 'journal.vault'), password: 'host-only complete SOL preparation capacity' });
  try {
    await vault.create(data); const retained = (await vault.read()).data;
    for (const record of [...retained.deposits, ...retained.tickets]) assert.deepEqual(record.native.prepared.funds.memoProgram, memoProgram);
    assert.deepEqual(retained, data);
  } finally { vault.close(); await rm(directory, { recursive: true, force: true }); }
});
