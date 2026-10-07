/** Synthetic host-boundary fixtures. BTC uses witness syntax only; these
 * tests establish no native-chain, independent-operator or finality truth.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash, generateKeyPairSync, sign } from 'node:crypto';
import { encodeBitcoinBinding, validateBitcoinBinding, encodeSolanaBindingMessage }
  from '../../../../src/chains/shared/dispatch/native-receipt-binding.mjs';
import { encodeSolanaNonceBindingMessage } from '../../../../src/chains/solana/runtime/owned-solana-nonce-binding.mjs';
import { createNativeFactsSigner, createNativeFactsInventory, createNativeFactsPeer,
  createNativeClaimFactsSigner, createNativeClaimFactsInventory, createNativeClaimFactsPeer }
  from '../../../../src/chains/shared/dispatch/native-facts-peer.mjs';
import { assertStableOperatorFact, assertStableClaimOperatorFact } from '../../../../src/operations/operators/claims/operator-fact-audit.mjs';
import { evmDeliveryFixture } from '../../../fixtures/chains/evm/transfers/test-fixtures/evm-delivery-wire.mjs';

const sha = value => createHash('sha256').update(value).digest('hex');
const copy = value => structuredClone(value);
const ZERO = '0'.repeat(64);
const BTC_KEY = '0279be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798';

async function fixture(family, claim = false, durableNonce = false) {
  const evm = family === '3' ? evmDeliveryFixture() : null;
  const source = generateKeyPairSync('ed25519');
  const sourceEndpoint = evm ? evm.identity.solver : family === '1'
    ? '0014' + createHash('ripemd160').update(Buffer.from(sha(Buffer.from(BTC_KEY, 'hex')), 'hex')).digest('hex')
    : Buffer.from(source.publicKey.export({ format: 'jwk' }).x, 'base64url').toString('hex');
  const destinationEndpoint = evm ? evm.identity.router : family === '1' ? '0014' + sha('recipient').slice(0, 40) : sha('recipient');
  const policy = { ledgerNamespace: sha('ledger'), hubDomain: sha('hub'), registryCommitment: sha('registry'),
    rule: { family, genesis: sha('genesis'), asset: evm ? evm.rule.asset : sha('asset'), finalityKind: family,
      minimumConfirmations: family === '1' ? '6' : evm ? '1' : '0', maximumEvidenceLifetime: '120', maximumClockSkew: '30' } };
  const wireKeyCommitment = evm ? evm.intent.receiptKeyCommitment : sha('K');
  let nativeWire, intent, nativeId;
  if (evm) {
    ({ nativeWire, intent, nativeId } = evm);
  } else if (family === '1') {
    intent = { sourceTxid: sha('prevout'), sourceVout: '0', sourceScript: sourceEndpoint,
      sourceSatoshi: '100000', recipientScript: destinationEndpoint, amountSatoshi: '12345',
      changeScript: '0014' + sha('change').slice(0, 40), feeSatoshi: '1000', wireKeyCommitment };
    const raw = encodeBitcoinBinding(intent);
    nativeWire = raw.slice(0, 8) + '0001' + raw.slice(8, -8)
      + '020930060201010201010121' + BTC_KEY + raw.slice(-8);
    nativeId = validateBitcoinBinding(nativeWire, intent).txid;
  } else {
    intent = { sourcePublicKey: sourceEndpoint, recipientPublicKey: destinationEndpoint,
      recentBlockhash: sha('blockhash'), lamports: '12345', wireKeyCommitment };
    if (durableNonce) {
      intent.nonceAccountPublicKey = sha('nonce-account'); intent.durableNonce = intent.recentBlockhash; delete intent.recentBlockhash;
    }
    const message = Buffer.from((durableNonce ? encodeSolanaNonceBindingMessage : encodeSolanaBindingMessage)(intent), 'hex');
    const signature = sign(null, message, source.privateKey);
    nativeWire = Buffer.concat([Buffer.from([1]), signature, message]).toString('base64'); nativeId = signature.toString('hex');
  }
  const request = { family, recipientIndex: '0', nativeId, wireKeyCommitment };
  const observation = { status: 'observed', genesis: policy.rule.genesis, asset: policy.rule.asset,
    nativeWire, intent, blockId: sha('block'), blockHeight: '50', finalityKind: family,
    confirmations: family !== '2' ? '11' : '0', nativeContext: family !== '2'
      ? { observedTipId: sha('tip'), observedTipHeight: '60', transactionSlot: '0', parentSlot: '0', observedSlot: '0' }
      : { observedTipId: ZERO, observedTipHeight: '0', transactionSlot: '60', parentSlot: '59', observedSlot: '70' } };
  const signer = (claim ? createNativeClaimFactsSigner : createNativeFactsSigner)({ privateKey: generateKeyPairSync('ec', { namedCurve: 'secp256k1' }).privateKey, policy });
  const config = { policy, signerIndex: '0', publicKey: signer.publicKey,
    recipients: [{ recipientIndex: '0', sourceEndpoint, destinationEndpoint }] };
  let durable = { revision: '0', state: (claim ? createNativeClaimFactsInventory : createNativeFactsInventory)(config) };
  const clock = { async read() { return { timestamp: '1000', head: sha('head') }; },
    async assertCurrent(header) { assert.deepEqual(header, await this.read()); } };
  const peer = await (claim ? createNativeClaimFactsPeer : createNativeFactsPeer)({ policy, signerIndex: '0', recipients: config.recipients, signer, clock,
    reader: { async observe(input) {
      assert.deepEqual(input, { family, recipientIndex: '0', nativeId }); return copy(observation);
    } }, store: { async load() { return copy(durable); }, async commit({ expectedRevision, nextState }) {
      assert.equal(expectedRevision, durable.revision);
      durable = { revision: String(BigInt(durable.revision) + 1n), state: copy(nextState) }; return copy(durable);
    } } });
  await peer.certify(request);
  return { entry: copy(durable.state.entries[0]), observation, policy };
}

function rejects(entry, observation, policy) {
  assert.throws(() => assertStableOperatorFact(entry, observation, policy), error =>
    error.message === 'OPERATOR_FACT' && error.code === 'OPERATOR_FACT' && error.cause instanceof Error);
}

for (const family of ['1', '2', '3']) {
  test(`family ${family}: retained expired facts stay auditable without extending evidence`, async () => {
    const { entry, observation, policy } = await fixture(family);
    entry.lastCheckedAt = '5000'; // The retained certificate expired at 1120.
    assert.ok(BigInt(entry.maximumEvidenceUntil) < BigInt(entry.lastCheckedAt));
    const current = copy(observation);
    if (family !== '2') {
      current.nativeContext.observedTipHeight = '61'; current.nativeContext.observedTipId = sha('next-tip'); current.confirmations = '12';
    } else current.nativeContext.observedSlot = '71';
    const before = copy({ entry, current, policy });
    assert.equal(assertStableOperatorFact(entry, current, policy), undefined);
    assert.deepEqual({ entry, current, policy }, before);
    for (const change of [value => { value.blockId = sha('replacement-block'); }, value => { value.blockHeight = '51'; },
      value => { value.genesis = sha('other-chain'); }, value => { value.asset = sha('other-asset'); },
      value => { value.status = 'unknown'; }, value => { value.intent[family === '3' ? 'receiptKeyCommitment' : 'wireKeyCommitment'] = sha('other-K'); }]) {
      const changed = copy(current); change(changed); rejects(entry, changed, policy);
    }
    rejects(entry, { status: 'unavailable', reason: 'RPC_DOWN' }, policy);
    const invalidFacts = copy(entry); invalidFacts.facts.observation.amount = '54321';
    rejects(invalidFacts, current, policy);
    const invalidRequest = copy(entry); invalidRequest.request.nativeId = 'ff'.repeat(family !== '2' ? 32 : 64);
    rejects(invalidRequest, current, policy);
  });
}

test('BTC rejects a lower still-final tip, a changed same-height tip and unsigned wire', async () => {
  const { entry, observation, policy } = await fixture('1');
  const lower = copy(observation); lower.nativeContext.observedTipHeight = '59'; lower.confirmations = '10';
  rejects(entry, lower, policy);
  const changedTip = copy(observation); changedTip.nativeContext.observedTipId = sha('replacement-tip');
  rejects(entry, changedTip, policy);
  const unsigned = copy(observation); unsigned.nativeWire = encodeBitcoinBinding(unsigned.intent);
  rejects(entry, unsigned, policy);
});

test('EVM rejects tip rollback, same-height hash replacement and changes to descriptor or complete wire', async () => {
  const { entry, observation, policy } = await fixture('3');
  for (const change of [value => { value.nativeContext.observedTipHeight = '59'; value.confirmations = '10'; },
    value => { value.nativeContext.observedTipId = sha('different-tip'); },
    value => { value.intent.descriptor.publicInputs[26] = '01'.padStart(64, '0'); },
    value => { value.nativeWire += '00'; }, value => { value.nativeContext.transactionSlot = '1'; }]) {
    const changed = copy(observation); change(changed); rejects(entry, changed, policy);
  }
});

test('SOL rejects observed-slot rollback and changes to transaction or parent slots', async () => {
  const { entry, observation, policy } = await fixture('2');
  for (const [field, value] of [['observedSlot', '69'], ['transactionSlot', '61'], ['parentSlot', '58']]) {
    const changed = copy(observation); changed.nativeContext[field] = value; rejects(entry, changed, policy);
  }
});

test('observation accessors and extra fields fail without executing a getter', async () => {
  const { entry, observation, policy } = await fixture('2'); let invoked = false;
  const accessor = copy(observation);
  Object.defineProperty(accessor, 'status', { enumerable: true, get() { invoked = true; return 'observed'; } });
  rejects(entry, accessor, policy); assert.equal(invoked, false);
  rejects(entry, { ...observation, callerApproved: true }, policy);
});

test('claim audit accepts BTC v1, SOL v1 ingress and exact SOL nonce v2 payout, including retained expired facts', async () => {
  for (const [family, nonce] of [['1', false], ['2', false], ['2', true]]) {
    const { entry, observation, policy } = await fixture(family, true, nonce);
    entry.lastCheckedAt = '5000';
    const before = copy({ entry, observation, policy });
    assert.equal(assertStableClaimOperatorFact(entry, observation, policy), undefined);
    assert.deepEqual({ entry, observation, policy }, before);
    assert.equal(entry.facts.effectIndex, nonce ? '1' : '0');
    if (nonce) rejects(entry, observation, policy);
  }
  const evm = await fixture('3');
  assert.throws(() => assertStableClaimOperatorFact(evm.entry, evm.observation, evm.policy), /OPERATOR_FACT/);
});

test('claim audit joins effect-1 facts to both retained and observed exact wires and rejects nonce advancement without payment', async () => {
  const { entry, observation, policy } = await fixture('2', true, true);
  const reject = (saved, observed) => assert.throws(() => assertStableClaimOperatorFact(saved, observed, policy), /OPERATOR_FACT/);
  for (const change of [value => { value.intent.nonceAccountPublicKey = sha('different-nonce-account'); },
    value => { value.intent.durableNonce = sha('different-durable-nonce'); },
    value => { value.intent.lamports = '54321'; }, value => { value.nativeWire += 'AAAA'; },
    value => { value.blockId = sha('different-block'); }, value => { value.nativeContext.observedSlot = '69'; },
    value => { value.nativeContext.transactionSlot = '61'; }, value => { value.nativeContext.parentSlot = '58'; }]) {
    const changed = copy(observation); change(changed); reject(entry, changed);
  }
  for (const change of [value => { value.intent.durableNonce = sha('different-durable-nonce'); },
    value => { value.facts.effectIndex = '0'; }, value => { value.facts.wireBindingVersion = '1'; },
    value => { value.facts.wireBindingPosition = '1'; }, value => { value.request.nativeId = '11'.repeat(64); }]) {
    const changed = copy(entry); change(changed); reject(changed, observation);
  }
  reject(entry, { status: 'adverse', reason: 'NONCE_ADVANCED_PAYMENT_FAILED' });
  reject(entry, { ...observation, nonceAdvanced: true });
});
