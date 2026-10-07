import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { EVM_VAULT_DELIVERY_SELECTOR, EVM_VAULT_DEPOSIT_SELECTOR, EVM_VAULT_DELIVERY_TOPIC,
  EVM_VAULT_IDENTITY_FIELDS, EVM_VAULT_DELIVERY_LIMITS, decodeEvmVaultDepositStatement,
  validateEvmVaultDeliveryDescriptor, evmVaultDeliveryFrame, evmVaultDeliveryDescriptorCommitment,
  encodeEvmVaultDeliveryCall, decodeEvmVaultDeliveryCall, validateEvmVaultDeliveryReceipt,
  inspectEvmVaultDeliveryTransition } from './evm-vault-delivery.mjs';

const zero = '0'.repeat(64), digest = n => n.toString(16).padStart(2, '0').repeat(32);
const address = n => n.toString(16).padStart(2, '0').repeat(20);
const word = n => BigInt(n).toString(16).padStart(64, '0');
const sha = value => createHash('sha256').update(value).digest('hex');
const copy = value => structuredClone(value);
const limbs = value => value.match(/.{8}/g).map(value => value.padStart(64, '0'));
function root(commitments) {
  const heap = [...Array(64).fill(zero), ...commitments];
  for (let i = 63; i >= 1; --i) heap[i] = sha(Buffer.from('01' + heap[i * 2] + heap[i * 2 + 1], 'hex'));
  return heap[1];
}
function fixture() {
  const identity = { chainId: '31337', genesisHash: digest(1), ledgerNamespace: digest(2), adapterVersion: '1',
    router: address(3), routerCodeSHA256: digest(4), routerVersion: '1', solver: address(5),
    asset: address(6), assetCodeSHA256: digest(7), assetIdentity: digest(8), vault: address(9),
    vaultCodeSHA256: digest(10), shareIdentity: digest(11), vaultDomain: digest(12), vaultRuntimeId: digest(13),
    targetPool: address(14), targetPoolCodeSHA256: digest(15), targetDomain: digest(16), targetScope: digest(17), targetPolicy: digest(18) };
  const publicInputs = [...limbs(identity.targetScope), ...limbs(identity.targetPolicy),
    word(900), word(1200), word(100), ...limbs(digest(19))];
  const descriptor = { identity, route: { assetAmount: '100', shareAmount: '100', executionFrom: '1000', executionUntil: '1100' }, publicInputs };
  const call = { descriptor, receiptKeyCommitment: digest(20), proof: 'deadbeef' };
  const receipt = { transactionHash: digest(21), blockNumber: '11', blockHash: digest(22), blockTimestamp: '1001',
    status: '1', from: identity.solver, to: identity.router, value: '0', input: encodeEvmVaultDeliveryCall(call),
    logs: [{ address: identity.router, topics: [EVM_VAULT_DELIVERY_TOPIC, identity.ledgerNamespace,
      call.receiptKeyCommitment, evmVaultDeliveryDescriptorCommitment(descriptor)], data: digest(19) + word(100),
    logIndex: '37', removed: false }] };
  const before = { snapshot: { blockNumber: '10', blockHash: digest(23), blockTimestamp: '1000' },
    assetSupply: '20000', solverAssets: '10000', solverShares: '100', routerAssets: '7', routerShares: '3',
    routerNative: '4', vaultAssets: '1000', vaultShares: '1000', poolAssets: '5', poolShares: '2', poolNative: '6', poolBacked: '0',
    leaves: '0', spent: '0', reservations: '0', outputs: '0', sequence: '0', historyCount: '1',
    authorizationLeaves: '0', authorizationHistoryCount: '1', deliveryCount: '0', root: root(Array(64).fill(zero)),
    spentDigest: digest(24), authorizationRoot: digest(25), commitments: Array(64).fill(zero),
    consumedReceiptKey: '0', insertedOutput: '0', solverAllowance: '100', vaultAllowance: '0', poolAllowance: '0' };
  const after = copy(before);
  Object.assign(after, { snapshot: { blockNumber: '11', blockHash: digest(22), blockTimestamp: '1001' },
    solverAssets: '9900', vaultAssets: '1100', vaultShares: '1100', poolShares: '102', poolBacked: '100', leaves: '1',
    outputs: '1', sequence: '1', historyCount: '2', deliveryCount: '1', consumedReceiptKey: '1', insertedOutput: '1', solverAllowance: '0' });
  after.commitments[0] = digest(19); after.root = root(after.commitments);
  return { call, receipt, before, after, parentHash: before.snapshot.blockHash };
}

test('fixed signatures and strict H4 frame match an independently assembled vector', () => {
  const { descriptor } = fixture().call;
  assert.equal(EVM_VAULT_DELIVERY_SELECTOR, 'c523b849');
  assert.equal(EVM_VAULT_DEPOSIT_SELECTOR, 'e4cb6f9a');
  assert.equal(EVM_VAULT_DELIVERY_TOPIC, '90f0becb74f6830fb553af42dae278c709efe692342522add5f4baec9b6e2a45');
  // This reference lists the full wire schema independently of exported fields.
  const fields = [Buffer.from('LIANUM/PAEG/evm-vault-delivery/1'), Buffer.from(word(31337), 'hex'),
    ...[digest(1), digest(2), '00000001', address(3), digest(4), '00000001', address(5), address(6),
      digest(7), digest(8), address(9), digest(10), digest(11), digest(12), digest(13), address(14),
      digest(15), digest(16), digest(17), digest(18), 'c523b849', 'e4cb6f9a',
      '00000000000000000000000000000064', '0000000000000064', '00000000000003e8', '000000000000044c',
      zero, descriptor.publicInputs.join('')].map(value => Buffer.from(value, 'hex'))];
  const reference = Buffer.concat(fields.flatMap(value => {
    const length = Buffer.alloc(4); length.writeUInt32BE(value.length); return [length, value];
  }));
  assert.deepEqual(evmVaultDeliveryFrame(descriptor), reference);
  assert.equal(evmVaultDeliveryDescriptorCommitment(descriptor), sha(reference));
  assert.equal(reference.length, 1652);
});

test('all pinned identities affect the destination commitment; unsupported chain/versions fail', () => {
  const original = fixture().call.descriptor, originalHash = evmVaultDeliveryDescriptorCommitment(original);
  for (const [key, width, kind] of EVM_VAULT_IDENTITY_FIELDS) {
    const changed = copy(original);
    if (kind === 'uint') {
      changed.identity[key] = key === 'chainId' ? '1' : '2';
      assert.throws(() => evmVaultDeliveryDescriptorCommitment(changed));
    } else {
      changed.identity[key] = width === 20 ? address(50) : digest(50);
      if (key === 'targetScope') changed.publicInputs.splice(0, 8, ...limbs(changed.identity[key]));
      if (key === 'targetPolicy') changed.publicInputs.splice(8, 8, ...limbs(changed.identity[key]));
      assert.notEqual(evmVaultDeliveryDescriptorCommitment(changed), originalHash, key);
    }
  }
});

test('D27 exact statement, independent amounts and contained half-open windows are enforced', () => {
  const descriptor = fixture().call.descriptor;
  assert.deepEqual(decodeEvmVaultDepositStatement(descriptor.publicInputs), { scope: digest(17), policy: digest(18),
    validFrom: '900', validUntil: '1200', amount: '100', output: digest(19) });
  const change = mutate => { const value = copy(descriptor); mutate(value); return value; };
  for (const mutate of [d => d.publicInputs.pop(), d => d.publicInputs.push(zero),
    d => d.publicInputs[0] = word(1n << 32n), d => d.publicInputs[16] = word(1n << 64n),
    d => d.publicInputs[18] = word(99), d => d.publicInputs.splice(19, 8, ...Array(8).fill(zero)),
    d => d.route.assetAmount = '0', d => d.route.assetAmount = String(1n << 128n),
    d => d.route.shareAmount = String(1n << 64n), d => d.route.executionFrom = '899',
    d => d.route.executionUntil = '1201', d => d.route.executionUntil = '1000',
    d => d.publicInputs[17] = word(900), d => d.route.assetAmount = '0100',
    d => d.publicInputs[0] = '0x' + d.publicInputs[0]])
    assert.throws(() => validateEvmVaultDeliveryDescriptor(change(mutate)));
  assert.equal(validateEvmVaultDeliveryDescriptor(change(d => d.route.assetAmount = '200')).route.shareAmount, '100');
  assert.equal(validateEvmVaultDeliveryDescriptor(change(d => {
    d.route.executionFrom = '900'; d.route.executionUntil = '1200';
  })).route.executionUntil, '1200');
});

test('canonical ABI round trip freezes K and proof separately from the semantic descriptor', () => {
  const { call } = fixture(), encoded = encodeEvmVaultDeliveryCall(call);
  const decoded = decodeEvmVaultDeliveryCall(encoded, call.descriptor.identity);
  assert.deepEqual(decoded, { ...call, descriptorCommitment: evmVaultDeliveryDescriptorCommitment(call.descriptor) });
  assert.ok(Object.isFrozen(decoded.descriptor.publicInputs));
  for (const patch of [{ receiptKeyCommitment: digest(40) }, { proof: 'cafe' }]) {
    const alternate = { ...call, ...patch }, wire = encodeEvmVaultDeliveryCall(alternate);
    assert.notEqual(wire, encoded);
    assert.equal(decodeEvmVaultDeliveryCall(wire, call.descriptor.identity).descriptorCommitment, decoded.descriptorCommitment);
  }
  assert.throws(() => encodeEvmVaultDeliveryCall({ ...call, actionHash: digest(41) }));
  assert.throws(() => evmVaultDeliveryDescriptorCommitment({ ...call.descriptor, receiptKeyCommitment: call.receiptKeyCommitment }));
  for (const proof of ['', '0x01', 'AA', '0', '01'.repeat(65537)])
    assert.throws(() => encodeEvmVaultDeliveryCall({ ...call, proof }));
  const maximum = encodeEvmVaultDeliveryCall({ ...call, proof: '01'.repeat(65536) });
  assert.equal(decodeEvmVaultDeliveryCall(maximum, call.descriptor.identity).proof.length, 131072);
});

test('ABI rejects aliased offsets, nonzero padding, high bits, substituted descriptor and trailing bytes', () => {
  const { call } = fixture(), encoded = encodeEvmVaultDeliveryCall(call);
  const replaceWord = (index, value) => encoded.slice(0, 10 + index * 64) + value + encoded.slice(10 + (index + 1) * 64);
  const badPadding = encoded.slice(0, 10 + 9 * 64 + 8) + '01' + encoded.slice(10 + 9 * 64 + 10);
  for (const wire of [encoded + '00', encoded.slice(0, -2), encoded.replace(/^0xc523b849/, '0xe4cb6f9a'),
    replaceWord(0, zero), replaceWord(1, digest(33)), replaceWord(2, word(1n << 128n)),
    replaceWord(6, word(288)), replaceWord(7, word(256)), replaceWord(8, word(0)),
    replaceWord(10, word(26)), badPadding, encoded.toUpperCase()])
    assert.throws(() => decodeEvmVaultDeliveryCall(wire, call.descriptor.identity));
});

test('receipt-local event zero is independent of global logIndex and never enough for private credit', () => {
  const { call, receipt } = fixture();
  const observed = validateEvmVaultDeliveryReceipt(receipt, call);
  assert.equal(observed.effectIndex, '0'); assert.equal(receipt.logs[0].logIndex, '37');
  assert.equal(observed.privateSpendable, false); assert.equal(observed.privateDeFiAcceptance, false);
  assert.equal(EVM_VAULT_DELIVERY_LIMITS.privateDeFiAcceptance, false);
  for (const mutate of [r => r.status = '0', r => r.value = '1', r => r.from = address(33), r => r.to = address(33),
    r => r.blockTimestamp = '999', r => r.blockTimestamp = '1100', r => r.logs[0].removed = true,
    r => r.logs[0].address = address(33), r => r.logs[0].topics[1] = digest(33),
    r => r.logs[0].topics[2] = digest(33), r => r.logs[0].topics[3] = digest(33),
    r => r.logs[0].data = digest(33) + word(100), r => r.logs[0].data = digest(19) + word(101),
    r => r.logs.push({ ...r.logs[0], logIndex: '38' }),
    r => r.logs.unshift({ address: address(33), topics: [], data: '', logIndex: '36', removed: false })]) {
    const changed = copy(receipt); mutate(changed);
    assert.throws(() => validateEvmVaultDeliveryReceipt(changed, call));
  }
  const atStart = copy(receipt); atStart.blockTimestamp = '1000';
  assert.equal(validateEvmVaultDeliveryReceipt(atStart, call).blockTimestamp, '1000');
});

test('exact backed delivery preserves preexisting donations without converting them into claims', () => {
  const trace = fixture(), result = inspectEvmVaultDeliveryTransition(trace);
  assert.equal(result.after.poolShares, '102'); assert.equal(result.after.poolBacked, '100');
  assert.equal(result.after.routerAssets, '7'); assert.equal(result.after.routerShares, '3');
  assert.equal(result.privateSpendable, false);
  for (const key of ['assetSupply', 'solverAssets', 'solverShares', 'routerAssets', 'routerShares', 'routerNative',
    'vaultAssets', 'vaultShares', 'poolAssets', 'poolShares', 'poolNative', 'poolBacked', 'leaves', 'spent',
    'reservations', 'outputs', 'sequence', 'historyCount', 'authorizationLeaves', 'authorizationHistoryCount', 'deliveryCount']) {
    const changed = fixture(); changed.after[key] = String(BigInt(changed.after[key]) + 1n);
    assert.throws(() => inspectEvmVaultDeliveryTransition(changed), undefined, key);
  }
  for (const mutate of [t => t.before.solverAllowance = String((1n << 256n) - 1n),
    t => t.before.vaultAllowance = '1', t => t.before.poolAllowance = '1',
    t => t.after.solverAllowance = '1', t => t.after.vaultAllowance = '1', t => t.after.poolAllowance = '1',
    t => t.before.consumedReceiptKey = '1', t => t.after.consumedReceiptKey = '0', t => t.after.insertedOutput = '0',
    t => t.after.poolBacked = '102', t => t.after.routerAssets = '0',
    t => t.after.commitments[1] = digest(31), t => t.after.spentDigest = digest(31),
    t => t.after.authorizationRoot = digest(31), t => t.parentHash = digest(31),
    t => t.after.snapshot.blockNumber = '12', t => t.after.snapshot.blockTimestamp = '1100']) {
    const changed = fixture(); mutate(changed); assert.throws(() => inspectEvmVaultDeliveryTransition(changed));
  }
});

test('strict records reject extras, getters, sparse arrays, proxies and mutated snapshots', () => {
  const descriptor = fixture().call.descriptor;
  assert.throws(() => validateEvmVaultDeliveryDescriptor({ ...descriptor, verified: true }));
  assert.throws(() => validateEvmVaultDeliveryDescriptor(new Proxy(descriptor, {})));
  const getter = { ...descriptor };
  Object.defineProperty(getter, 'route', { enumerable: true, get() { throw new Error('getter ran'); } });
  assert.throws(() => validateEvmVaultDeliveryDescriptor(getter), /COMMITMENT_DATA_FIELDS/);
  const sparse = copy(descriptor); delete sparse.publicInputs[0];
  assert.throws(() => validateEvmVaultDeliveryDescriptor(sparse));
  const output = validateEvmVaultDeliveryDescriptor(descriptor); descriptor.route.assetAmount = '999';
  assert.equal(output.route.assetAmount, '100');
});
