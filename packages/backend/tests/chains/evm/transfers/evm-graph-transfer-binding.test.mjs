import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { bindOriginalEvmGraphTransfer, encodeEvmGraphTransferMemo, assertEvmGraphTransferAction }
  from '../../../../src/chains/evm/transfers/evm-graph-transfer-binding.mjs';
import { decodeEvmSignedTransactionWire } from '../../../../src/chains/evm/transfers/evm-signed-transaction-wire.mjs';
import { decodeEvmNativeTransferWire } from '../../../../src/chains/evm/transfers/evm-native-transfer-wire.mjs';
import { createEvmNativeTransferObserver } from '../../../../src/chains/evm/observations/evm-native-transfer-observer.mjs';
import { originalFixture, fixtureRlp } from '../../../fixtures/chains/evm/transfers/evm-native-transfer-fixture.mjs';
import { receiptKeyCommitment, nativeAdmissionNullifier, validateNativeFacts }
  from '../../../../src/chains/shared/dispatch/native-receipt-binding.mjs';
import { nativeAdmissionChainDomain } from '../../../../../engine/src/execution/native/dispatch/native-admission.mjs';
import { nativeTransferActionCommitment } from '../../../../../engine/src/execution/native/dispatch/native-capsules.mjs';
import { canonicalNativeEffectId } from '../../../../../engine/src/execution/native/state/native-receipt.mjs';

// Test-only public mathematical fixtures: fixed r=Gx, s=1 determine public
// recovered senders for each EIP signing preimage. No keys or signing API.
const H = 'ab'.repeat(32), SECRET = 'cd'.repeat(32);
const K = receiptKeyCommitment({ ledgerNamespace: H, secret: SECRET });
const MEMO = encodeEvmGraphTransferMemo(K);
const CHAINS = ['ethereum', 'base', 'arbitrum', 'bnb'];
const ORDER = 0xfffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141n;
function fixture(chain = 'ethereum', type = 2, overrides = {}) {
  const f = originalFixture(chain, type, { data: MEMO, ...overrides });
  const network = { chain, genesisHash: f.genesisHash };
  const fees = type === 2 ? { maxPriorityFeePerGas: f.expected.maxPriorityFeePerGas, maxFeePerGas: f.expected.maxFeePerGas }
    : { gasPrice: f.expected.gasPrice };
  const original = { nativeWire: f.original.nativeWire, expected: { ...f.original.expected,
    chainId: f.expected.chainId, genesisHash: network.genesisHash, type: String(type), gas: f.expected.gas, fees, wireKeyCommitment: K } };
  return { ...f, original, network };
}
const bind = f => bindOriginalEvmGraphTransfer(f.original, f.network);
function actionFor(binding) {
  return { ...binding.actionTerms, signerIdentity: H, executionFrom: '100', executionUntil: '200', settleBefore: '300',
    receiptRho: H, deliveryRiskCommitment: H, actionSalt: H };
}
const mutateExpected = (f, patch) => ({ ...f.original, expected: { ...f.original.expected, ...patch } });

test('one exact-K codec covers the 12 EIP/chain combinations and existing PAEG identities', () => {
  const gids = new Set(), sources = new Set();
  for (const chain of CHAINS) for (const type of [0, 1, 2]) {
    const f = fixture(chain, type), bound = bind(f), identity = bound.identity;
    assert.equal(bound.signed.data, MEMO);
    assert.equal(bound.wireKeyCommitment, K);
    assert.equal(bound.signed.nativeWire, f.original.nativeWire);
    assert.equal(bound.signed.nativeId.slice(2), f.original.expected.nativeId);
    assert.equal(bound.signed.chainId, f.original.expected.chainId);
    assert.equal(identity.transactionSHA256, createHash('sha256').update(Buffer.from(f.original.nativeWire.slice(2), 'hex')).digest('hex'));
    assert.equal(identity.transactionId, identity.nativeId + '0'.repeat(64));
    assert.equal(identity.nativeGid, canonicalNativeEffectId({ chainDomain: { chain: 'EVM', genesis: identity.genesis, asset: identity.asset },
      effectIdentity: { transactionId: identity.nativeId, effectIndex: '0' } }));
    // Compare the existing chain-frame codec only: this synthetic Rule is NOT
    // registration or acceptance of a native-transfer finality policy.
    assert.equal(bound.actionTerms.chainDomain, nativeAdmissionChainDomain({ family: '3', genesis: identity.genesis,
      asset: identity.asset, finalityKind: '3', minimumConfirmations: '1', maximumEvidenceLifetime: '30', maximumClockSkew: '1' }));
    const action = actionFor(bound);
    assert.equal(assertEvmGraphTransferAction(bound, action), nativeTransferActionCommitment(action));
    assert.ok(Object.isFrozen(bound) && Object.isFrozen(bound.signed.signature) && Object.isFrozen(bound.actionTerms));
    gids.add(identity.nativeGid); sources.add(identity.sourceCommitment);
    assert.equal(f.calls.length, 0);
  }
  assert.equal(gids.size, 12); assert.equal(sources.size, 12);
});

test('published official EIP-155 bytes remain unchanged and are not accepted as graph memo', () => {
  // Official EIP-155 signed example (CC0). No published example key is loaded.
  // https://eips.ethereum.org/EIPS/eip-155#example
  const wire = '0xf86c098504a817c800825208943535353535353535353535353535353535353535880de0b6b3a76400008025a028ef61340bd939bc2195fe537567866003e1a15d3c71ff63e1590620aa636276a067cbe9d8997f761aecb703304b3800ccf555c9f3dc64214b297fb1966a3b6d83';
  const decoded = decodeEvmSignedTransactionWire(wire);
  assert.equal(decoded.from, '0x9d8a62f656a8d1615c1294fd71e9cfb3e4855a4f');
  assert.equal(decoded.unsignedWire, '0xec098504a817c800825208943535353535353535353535353535353535353535880de0b6b3a764000080018080');
  assert.deepEqual(decoded, decodeEvmNativeTransferWire(wire));
  const f = fixture('ethereum', 0), expected = { ...f.original.expected, nativeId: decoded.nativeId.slice(2),
    from: decoded.from, to: decoded.to, nonce: decoded.nonce, value: decoded.value, gas: decoded.gas,
    fees: { gasPrice: decoded.gasPrice } };
  assert.throws(() => bindOriginalEvmGraphTransfer({ nativeWire: wire, expected }, f.network), /EXACT_K_MEMO/);
});

test('the existing native observer rejects graph calldata before any I/O', () => {
  for (const chain of CHAINS) for (const type of [0, 1, 2]) {
    const f = fixture(chain, type);
    assert.throws(() => decodeEvmNativeTransferWire(f.original.nativeWire), /NATIVE_VALUE_PROFILE/);
    const expected = Object.fromEntries(['nativeId', 'from', 'to', 'value', 'nonce'].map(name => [name, f.original.expected[name]]));
    assert.throws(() => createEvmNativeTransferObserver({ ...f.network, transport: f.transport,
      original: { nativeWire: f.original.nativeWire, expected } }), /NATIVE_VALUE_PROFILE/);
    assert.equal(f.calls.length, 0);
  }
});

test('every original identity, exact gas and fee field is independently pinned', () => {
  for (const type of [0, 1, 2]) {
    const f = fixture('base', type);
    for (const patch of [{ nativeId: H }, { from: '0x' + 'ab'.repeat(20) }, { to: '0x' + 'cd'.repeat(20) },
      { value: '1' }, { nonce: '8' }, { gas: '100001' }, { type: String((type + 1) % 3) },
      { chainId: '1' }, { genesisHash: '0x' + H }, { wireKeyCommitment: H }])
      assert.throws(() => bindOriginalEvmGraphTransfer(mutateExpected(f, patch), f.network));
    for (const name of Object.keys(f.original.expected.fees)) {
      const fees = { ...f.original.expected.fees, [name]: '99' };
      assert.throws(() => bindOriginalEvmGraphTransfer(mutateExpected(f, { fees }), f.network), /ORIGINAL_FEES/);
    }
    const fees = { ...f.original.expected.fees, effectiveGasPrice: '20' };
    assert.throws(() => bindOriginalEvmGraphTransfer(mutateExpected(f, { fees }), f.network), /UNEXPECTED_FIELD/);
  }
});

test('same wire cannot be reopened against a different retained genesis or signed chain expectation', () => {
  const f = fixture();
  assert.throws(() => bindOriginalEvmGraphTransfer(f.original, { ...f.network, chain: 'base' }), /EXPECTED_NETWORK/);
  assert.throws(() => bindOriginalEvmGraphTransfer(f.original, { ...f.network, genesisHash: '0x' + H }), /EXPECTED_NETWORK/);
  // Genesis is not cryptographically in the wire. Changing BOTH expectations
  // changes the domain but must never be reported as observed genesis proof.
  const alternate = bindOriginalEvmGraphTransfer(mutateExpected(f, { genesisHash: '0x' + H }),
    { ...f.network, genesisHash: '0x' + H });
  assert.notEqual(alternate.identity.nativeGid, bind(f).identity.nativeGid);
  assert.equal(alternate.networkGenesisVerified, false);
  const changedChain = mutateExpected(f, { chainId: '8453' });
  assert.throws(() => bindOriginalEvmGraphTransfer(changedChain, { ...f.network, chain: 'base' }), /ORIGINAL_IDENTITY/);
  assert.throws(() => bindOriginalEvmGraphTransfer(mutateExpected(f, { genesisHash: f.network.genesisHash + '\n' }),
    { ...f.network, genesisHash: f.network.genesisHash + '\n' }), /INVALID_HASH/);
});

test('only one complete exact ASCII K memo is allowed, including byte-level prefix/suffix attacks', () => {
  for (const key of ['', '0'.repeat(64), K.toUpperCase(), '0x' + K, K + '\n', K.slice(2)])
    assert.throws(() => encodeEvmGraphTransferMemo(key));
  const payloads = ['0x', '0x12', MEMO + '00', MEMO + MEMO.slice(2), '0x12345678' + MEMO.slice(2),
    '0x' + Buffer.from('lnrb1:' + K).toString('hex'), encodeEvmGraphTransferMemo(H),
    '0x' + Buffer.from('LNRB1:' + K.toUpperCase()).toString('hex'),
    '0x' + Buffer.from('LNRB1:' + '0'.repeat(64)).toString('hex')];
  for (const data of payloads) assert.throws(() => bind(fixture('ethereum', 2, { data })), /EXACT_K_MEMO/);
  const f = fixture();
  assert.throws(() => bindOriginalEvmGraphTransfer(mutateExpected(f, { data: MEMO }), f.network), /UNEXPECTED_FIELD/);
});

test('positive bounded value, direct nonzero recipient, empty access list and necessary gas floor', () => {
  for (const overrides of [{ value: '0' }, { value: (1n << 128n).toString() }, { gas: '21000' },
    { gas: '23799' }, { to: '0x' + '00'.repeat(20) }]) assert.throws(() => bind(fixture('bnb', 1, overrides)));
  assert.equal(bind(fixture('bnb', 1, { gas: '23800' })).signed.gas, '23800');
  assert.equal(bind(fixture('bnb', 1, { value: ((1n << 128n) - 1n).toString() })).signed.value, ((1n << 128n) - 1n).toString());
  // Official EIP-2930 example access list. Valid syntax remains in the shared
  // parser, including duplicate entries; this graph profile rejects all lists.
  const item = { address: '0xde0b295669a9fd93d5f28d9ec85e40f4cb697bae',
    storageKeys: ['0x' + '0'.repeat(63) + '3', '0x' + '0'.repeat(63) + '7'] };
  for (const type of [1, 2]) {
    const f = fixture('arbitrum', type, { accessList: [item, item] });
    assert.deepEqual(decodeEvmSignedTransactionWire(f.original.nativeWire).accessList, [item, item]);
    assert.throws(() => bind(f), /EMPTY_ACCESS_LIST_REQUIRED/);
  }
  assert.throws(() => bind(fixture('ethereum', 2, { maxPriorityFeePerGas: '31' })), /FEE_CAP/);
});

test('full existing Action join rejects every wire term substitution without claiming authorization', () => {
  const bound = bind(fixture()), action = actionFor(bound);
  for (const name of Object.keys(bound.actionTerms)) {
    const value = name === 'amount' ? '1' : name === 'custodyKind' ? 2 : H;
    assert.throws(() => assertEvmGraphTransferAction(bound, { ...action, [name]: value }));
  }
  assert.throws(() => assertEvmGraphTransferAction({ ...bound }, action), /PROVENANCE/);
  assert.throws(() => assertEvmGraphTransferAction(bound, { ...action, verified: true }));
  assert.throws(() => assertEvmGraphTransferAction(bound, { ...action, executionUntil: '99' }));
  assert.throws(() => assertEvmGraphTransferAction(bound, { ...action, settleBefore: '150' }));
  assert.throws(() => assertEvmGraphTransferAction(bound, { ...action, get signerIdentity() { throw new Error('getter called'); } }), /INVALID_DATA_FIELD/);
  assert.equal(bound.permissionVerified, false);
});

test('output is immutable, preserves retained original inclusion and is not an admission certificate', () => {
  const f = fixture();
  const inclusion = { blockId: H, blockHeight: '10', transactionIndex: '1', receiptCommitment: K };
  const bound = bindOriginalEvmGraphTransfer({ ...f.original, inclusion }, f.network);
  inclusion.blockHeight = '11'; assert.equal(bound.inclusion.blockHeight, '10');
  assert.throws(() => { bound.signed.gas = '21000'; });
  for (const key of ['networkGenesisVerified', 'recipientCodeVerified', 'recipientControlVerified', 'permissionVerified',
    'finalityVerified', 'deliveryVerified', 'graphAdmissionEligible', 'creditEligible']) assert.equal(bound[key], false);
  assert.equal(bound.privateSpendableAtomic, null);
  for (const key of ['wireBindingVersion', 'wireBindingKind', 'wireBindingPosition', 'facts', 'signature', 'sign', 'send'])
    assert.equal(Object.hasOwn(bound, key), false);
  assert.throws(() => validateNativeFacts(bound, {}));
  const nf = nativeAdmissionNullifier({ ledgerNamespace: H, secret: SECRET, nativeGid: bound.identity.nativeGid });
  assert.equal(nf, nativeAdmissionNullifier({ ledgerNamespace: H, secret: SECRET, nativeGid: bind(f).identity.nativeGid }));
  assert.throws(() => bindOriginalEvmGraphTransfer({ ...f.original, verified: true }, f.network));
  assert.throws(() => bindOriginalEvmGraphTransfer(f.original, { ...f.network, family: '3' }));
  assert.throws(() => bindOriginalEvmGraphTransfer(new Proxy(f.original, {}), f.network), /INVALID_RECORD/);
  assert.throws(() => bindOriginalEvmGraphTransfer({ ...f.original, get nativeWire() { throw new Error('getter called'); } }, f.network), /INVALID_DATA_FIELD/);
});

test('EIP envelope confusion, noncanonical RLP/integers, scalars and high-S twins fail closed', () => {
  const bytes = n => { if (n === 0n) return Buffer.alloc(0); let h = n.toString(16); return Buffer.from(h.length % 2 ? '0' + h : h, 'hex'); };
  const r = Buffer.from('79be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798', 'hex');
  for (const type of [0, 1, 2]) {
    const data = Buffer.from(MEMO.slice(2), 'hex'), to = Buffer.from('34'.repeat(20), 'hex');
    const base = type === 0 ? [bytes(7n), bytes(20n), bytes(100000n), to, bytes(1n), data]
      : type === 1 ? [bytes(1n), bytes(7n), bytes(20n), bytes(100000n), to, bytes(1n), data, []]
        : [bytes(1n), bytes(7n), bytes(2n), bytes(30n), bytes(100000n), to, bytes(1n), data, []];
    const parity = type === 0 ? bytes(37n) : bytes(0n);
    const wire = items => '0x' + (type ? '0' + type : '') + fixtureRlp(items).toString('hex');
    const original = [...base, parity, r, bytes(1n)];
    assert.equal(decodeEvmSignedTransactionWire(wire(original)).type, String(type));
    for (const scalar of [0n, ORDER / 2n + 1n, ORDER - 1n, ORDER])
      assert.throws(() => decodeEvmSignedTransactionWire(wire([...base, parity, r, bytes(scalar)])), /SIGNATURE/);
    assert.throws(() => decodeEvmSignedTransactionWire(wire([...base, type ? bytes(1n) : bytes(38n), r, bytes(ORDER - 1n)])), /SIGNATURE/);
    assert.throws(() => decodeEvmSignedTransactionWire(wire([...base, parity, bytes(0n), bytes(1n)])), /SIGNATURE/);
    assert.throws(() => decodeEvmSignedTransactionWire(wire([...base, type ? bytes(2n) : bytes(27n), r, bytes(1n)])), /SIGNATURE/);
    const badInteger = [...original]; badInteger[0] = Buffer.from([0, 1]);
    assert.throws(() => decodeEvmSignedTransactionWire(wire(badInteger)));
    assert.throws(() => decodeEvmSignedTransactionWire(wire(original) + '00'));
    assert.throws(() => decodeEvmSignedTransactionWire(wire(original).toUpperCase()));
    if (type) {
      const wrongType = '0x0' + (type === 1 ? '2' : '1') + wire(original).slice(4);
      assert.throws(() => decodeEvmSignedTransactionWire(wrongType), /WIRE_FIELDS/);
      const badZeroParity = [...original]; badZeroParity[badZeroParity.length - 3] = Buffer.from([0]);
      assert.throws(() => decodeEvmSignedTransactionWire(wire(badZeroParity)), /INTEGER/);
    }
  }
  for (const wire of ['0x03c0', '0x04c0', '0x7ec0', '0x02f80180', '0x01c0', '0x80', '0x' + '00'.repeat(131073)])
    assert.throws(() => decodeEvmSignedTransactionWire(wire));
});
