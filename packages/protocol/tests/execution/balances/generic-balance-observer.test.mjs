import test from 'node:test';
import assert from 'node:assert/strict';
import { publicKeccak256 } from '../../../src/crypto/private-cohort-public-native.mjs';
import { genericProofCalldata } from '../../../src/execution/local/local-deployment.mjs';
import { decodeGenericBalanceCalldata, decodeGenericBalanceStateAdvanced, decodeGenericBalanceWithdrawal,
  assertOwnedGenericBalanceObserver, createOwnedGenericBalanceObserver }
  from '../../../src/execution/balances/generic-balance-observer.mjs';

// ABI fixtures deliberately contain invalid proof bytes. These tests establish
// strict parsing/identity boundaries; they do not claim proof or chain acceptance.
const artifact = {
  abi: [
    { type: 'function', name: 'depositBalance', inputs: [{ type: 'bytes' }, { type: 'bytes32[]' }] },
    { type: 'function', name: 'withdrawBalance', inputs: [{ type: 'bytes' }, { type: 'bytes32[]' }] },
    { type: 'function', name: 'recoverGeneric', inputs: [{ type: 'bytes' }, { type: 'bytes32[]' }] },
    { type: 'function', name: 'reserveGenericGuarded', inputs: [
      { type: 'bytes' }, { type: 'bytes32[]' }, { type: 'uint64' }, { type: 'bytes32' },
    ] },
  ],
  evm: { methodIdentifiers: {
    'depositBalance(bytes,bytes32[])': '4d62f43f',
    'withdrawBalance(bytes,bytes32[])': 'abcd1234',
    'recoverGeneric(bytes,bytes32[])': 'aabbccdd',
    'reserveGenericGuarded(bytes,bytes32[],uint64,bytes32)': '474df794',
  } },
};
const word = value => BigInt(value).toString(16).padStart(64, '0');
const patchWord = (data, index, replacement) => data.slice(0, 10 + index * 64)
  + word(replacement) + data.slice(10 + (index + 1) * 64);
const digestFrom = values => values.map(value => BigInt(value).toString(16).padStart(8, '0')).join('');

test('D26, guarded S66, W39 and F51 recover exactly the original public transition', () => {
  for (const [kind, count, signature] of [
    ['D26', 26, 'depositBalance(bytes,bytes32[])'],
    ['S66', 66, 'reserveGenericGuarded(bytes,bytes32[],uint64,bytes32)'],
    ['W39', 39, 'withdrawBalance(bytes,bytes32[])'],
    ['F51', 51, 'recoverGeneric(bytes,bytes32[])'],
  ]) {
    const inputs = Array.from({ length: count }, (_, index) => String(index + 1));
    const guards = kind === 'S66' ? { expectedSequence: '7', expectedPostRoot: '0x' + 'ab'.repeat(32) } : undefined;
    const calldata = genericProofCalldata(artifact, signature, Buffer.from('c0ffee', 'hex'), inputs, guards);
    const decoded = decodeGenericBalanceCalldata(artifact, calldata);
    assert.equal(decoded.kind, kind);
    assert.deepEqual(decoded.publicInputs, inputs);
    assert.deepEqual(decoded.guards, guards ?? null);
    assert.deepEqual(decoded.transition, kind === 'D26' ? {
      insertedCommitments: [digestFrom(inputs.slice(18, 26))], spentNullifiers: [], admissionTag: null,
    } : kind === 'S66' ? {
      insertedCommitments: [digestFrom(inputs.slice(40, 48)), digestFrom(inputs.slice(48, 56))],
      spentNullifiers: [digestFrom(inputs.slice(32, 40))], admissionTag: digestFrom(inputs.slice(56, 64)),
    } : kind === 'W39' ? {
      insertedCommitments: [], spentNullifiers: [digestFrom(inputs.slice(25, 33))], admissionTag: null,
    } : {
      insertedCommitments: [digestFrom(inputs.slice(40, 48))],
      spentNullifiers: [digestFrom(inputs.slice(32, 40))], admissionTag: null,
    });
    if (kind === 'F51') assert.deepEqual(decoded.recovery, {
      scope: digestFrom(inputs.slice(0, 8)), policy: digestFrom(inputs.slice(8, 16)),
      asset: digestFrom(inputs.slice(16, 24)), acceptedRoot: digestFrom(inputs.slice(24, 32)),
      reserveNullifier: digestFrom(inputs.slice(32, 40)), recoveryCommitment: digestFrom(inputs.slice(40, 48)),
      settleBefore: inputs[48], validFrom: inputs[49], validUntil: inputs[50],
    });
  }
});

test('withdrawal event binds the exact recipient, amount and canonical nullifier', () => {
  const { pool, receipt } = receiptFixture();
  const recipient = 'ab'.repeat(20), nullifier = 'bc'.repeat(32);
  const log = { address: pool, transactionHash: receipt.transactionHash, blockHash: receipt.blockHash,
    removed: false, topics: ['0x' + publicKeccak256(Buffer.from('Withdrawal(address,uint64,bytes32)')).toString('hex'),
      '0x' + '0'.repeat(24) + recipient], data: '0x' + word(30000) + nullifier };
  receipt.logs.push(log);
  assert.deepEqual(decodeGenericBalanceWithdrawal(receipt, pool), {
    address: pool.slice(2), transactionHash: receipt.transactionHash.slice(2), blockHash: receipt.blockHash.slice(2),
    recipient, amount: '30000', nullifier,
  });
  for (const change of [
    value => { value.logs.push(structuredClone(value.logs[1])); },
    value => { value.logs[1].topics[1] = '0x' + '1' + '0'.repeat(23) + recipient; },
    value => { value.logs[1].data = '0x' + word(1n << 64n) + nullifier; },
    value => { value.logs[1].removed = true; },
  ]) {
    const changed = structuredClone(receipt); change(changed);
    assert.throws(() => decodeGenericBalanceWithdrawal(changed, pool));
  }
});

test('offset, padding, surplus bytes, count, selector and wide digest substitutions fail closed', () => {
  const signature = 'depositBalance(bytes,bytes32[])';
  const inputs = Array.from({ length: 26 }, () => '1');
  const data = genericProofCalldata(artifact, signature, Buffer.from('c0ffee', 'hex'), inputs);
  const invalid = [
    patchWord(data, 0, 96), patchWord(data, 1, 64), patchWord(data, 2, 0),
    patchWord(data, 4, 25), data + '00', data.slice(0, -2),
    '0xdeadbeef' + data.slice(10),
    data.slice(0, 10 + 3 * 64 + 6) + '01' + data.slice(10 + 3 * 64 + 8),
    patchWord(data, 5 + 18, 1n << 32n),
  ];
  for (const malformed of invalid) assert.throws(() => decodeGenericBalanceCalldata(artifact, malformed));
});

function receiptFixture() {
  const pool = '0x' + '12'.repeat(20), transactionHash = '0x' + '23'.repeat(32);
  const blockHash = '0x' + '34'.repeat(32);
  const topic = '0x' + publicKeccak256(Buffer.from('StateAdvanced(uint64,bytes32,bytes32,uint32,uint32)')).toString('hex');
  const log = { address: pool, transactionHash, blockHash, removed: false,
    topics: [topic, '0x' + word(4)], data: '0x' + '45'.repeat(32) + '56'.repeat(32) + word(7) + word(2) };
  return { pool, receipt: { transactionHash, blockHash, logs: [log] } };
}

test('StateAdvanced decoding requires the unique exact pool event in the canonical receipt', () => {
  const { pool, receipt } = receiptFixture();
  assert.deepEqual(decodeGenericBalanceStateAdvanced(receipt, pool), {
    address: pool.slice(2), transactionHash: receipt.transactionHash.slice(2), blockHash: receipt.blockHash.slice(2),
    sequence: '4', root: '0x' + '45'.repeat(32), spent: '0x' + '56'.repeat(32), leaves: 7, consumed: 2,
  });
  for (const change of [
    value => { value.logs.push(structuredClone(value.logs[0])); },
    value => { value.logs[0].removed = true; },
    value => { value.logs[0].blockHash = '0x' + '67'.repeat(32); },
    value => { value.logs[0].transactionHash = '0x' + '78'.repeat(32); },
    value => { value.logs[0].address = '0x' + '89'.repeat(20); },
    value => { value.logs[0].data += word(0); },
    value => { value.logs[0].topics[1] = '0x' + word(1n << 64n); },
    value => { value.logs[0].data = value.logs[0].data.slice(0, -64) + word(65); },
  ]) {
    const changed = structuredClone(receipt);
    change(changed);
    assert.throws(() => decodeGenericBalanceStateAdvanced(changed, pool));
  }
});

test('an endpoint-shaped or copied observer cannot impersonate owned runtime capabilities', async () => {
  assert.throws(() => assertOwnedGenericBalanceObserver({}, { runtime: {}, system: {}, poolIndex: 0 }),
    /BALANCE_OBSERVER_OWNED_CAPABILITY/);
  await assert.rejects(createOwnedGenericBalanceObserver({ runtime: {}, system: {}, poolIndex: 0,
    bitcoin: {}, solana: {}, walletId: 'test-wallet', issuerLifetime: 'ab'.repeat(32) }),
  /LOCAL_EVM_OWNED_CAPABILITY_REQUIRED/);
});
