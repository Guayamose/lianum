/** Pure regression tests only: no constructors that pass their argument guards,
 * native nodes, proof workers, compiler invocations or broadcasts.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash, generateKeyPairSync, sign } from 'node:crypto';
import { OWNED_CUSTODY_ROUTES, ownedCustodyRoute, assertOwnedCustodyIntent,
  summarizeOwnedBitcoinCoins, ownedCustodyFeeAudit, createOwnedCustodyReservationReadWindow,
  auditOwnedSolanaNonceInfrastructure } from '../../../../src/chains/shared/runtime/owned-native-custody.mjs';
import { createOwnedBitcoinCustodyRuntime, createOwnedFlatBitcoinRuntime, decodeBitcoinTransaction }
  from '../../../../src/chains/bitcoin/runtime/owned-bitcoin-runtime.mjs';
import { createOwnedSolanaCustodyRuntime, createOwnedSolanaCohortRuntime } from '../../../../src/chains/solana/runtime/owned-solana-runtime.mjs';
import { encodeBitcoinBinding, validateBitcoinBinding, encodeSolanaBindingMessage,
  validateSolanaBindingTransaction } from '../../../../src/chains/shared/dispatch/native-receipt-binding.mjs';

const h = value => createHash('sha256').update(value).digest('hex');
const btcRoles = Object.fromEntries(['depositor', 'escrow', 'recipient'].map(role => [role, { endpoint: '0014' + h(role).slice(0, 40) }]));
const btcIntent = routeName => {
  const route = ownedCustodyRoute(routeName), source = btcRoles[route.sourceRole].endpoint;
  return { sourceTxid: h('source'), sourceVout: '0', sourceScript: source, sourceSatoshi: '1200000',
    recipientScript: btcRoles[route.destinationRole].endpoint, amountSatoshi: '1000000', changeScript: source,
    feeSatoshi: '500', wireKeyCommitment: h('K') };
};

test('fixed custody factories reject options before any process or binary work; graph factories keep their guards', async () => {
  await assert.rejects(createOwnedBitcoinCustodyRuntime({ rpc: 'forbidden' }), /FIXED_CONSTRUCTOR/);
  await assert.rejects(createOwnedSolanaCustodyRuntime({ rpc: 'forbidden' }), /FIXED_CONSTRUCTOR/);
  await assert.rejects(createOwnedSolanaCustodyRuntime(async () => {}, { keys: 'forbidden' }), /FIXED_CONSTRUCTOR/);
  await assert.rejects(createOwnedFlatBitcoinRuntime({ custody: true }), /FIXED_CONSTRUCTOR/);
  await assert.rejects(createOwnedSolanaCohortRuntime(async () => {}, { custody: true }), /FIXED_CONSTRUCTOR/);
});

test('fixed routes identify refund original source and explicit second owned recipient; aliases cannot invent routes', () => {
  assert.deepEqual(OWNED_CUSTODY_ROUTES, {
    deposit: { sourceRole: 'depositor', destinationRole: 'escrow', recipientIndex: 0 },
    refund: { sourceRole: 'escrow', destinationRole: 'depositor', recipientIndex: 0 },
    redeem: { sourceRole: 'escrow', destinationRole: 'recipient', recipientIndex: 1 },
  });
  for (const name of ['__proto__', 'constructor', 'send', 'refund\n', { route: 'refund' }, null])
    assert.throws(() => ownedCustodyRoute(name), /CUSTODY_FIXED_ROUTE/);
  assert.throws(() => { OWNED_CUSTODY_ROUTES.refund.sourceRole = 'depositor'; });
});

test('BTC all custody routes retain one input, recipient0/change1/K2 and exact principal plus fee accounting', () => {
  for (const routeName of Object.keys(OWNED_CUSTODY_ROUTES)) {
    const intent = btcIntent(routeName); assertOwnedCustodyIntent(routeName, btcRoles, '1', intent);
    const raw = encodeBitcoinBinding(intent), binding = validateBitcoinBinding(raw, intent), decoded = decodeBitcoinTransaction(raw);
    assert.equal(decoded.vin.length, 1); assert.equal(decoded.vout.length, 3);
    assert.equal(decoded.vout[0].script, intent.recipientScript); assert.equal(decoded.vout[0].amountSatoshi, '1000000');
    assert.equal(decoded.vout[1].script, intent.sourceScript); assert.equal(decoded.vout[1].amountSatoshi, '199500');
    assert.equal(binding.wireBindingPosition, '2');
    assert.equal(BigInt(intent.sourceSatoshi) - decoded.vout.reduce((sum, output) => sum + BigInt(output.amountSatoshi), 0n), 500n);
  }
});

test('BTC refund and redemption reject retained depositor source, other recipient and escaped change', () => {
  for (const routeName of ['refund', 'redeem']) {
    for (const mutation of [
      value => { value.sourceScript = btcRoles.depositor.endpoint; },
      value => { value.recipientScript = btcRoles.escrow.endpoint; },
      value => { value.changeScript = btcRoles.recipient.endpoint; },
    ]) { const intent = btcIntent(routeName); mutation(intent); assert.throws(() => assertOwnedCustodyIntent(routeName, btcRoles, '1', intent)); }
  }
  assert.throws(() => assertOwnedCustodyIntent('refund', btcRoles, '1', btcIntent('deposit')), /CUSTODY_SOURCE_ROLE/);
  const exactPrincipalOnly = { ...btcIntent('refund'), sourceSatoshi: '1000000' };
  assert.throws(() => encodeBitcoinBinding(exactPrincipalOnly), /BINDING_CHANGE_AMOUNT/);
});

test('SOL all custody routes remain genuine one-signer System+Memo wires, with route source as fee payer', () => {
  const keys = Object.fromEntries(['depositor', 'escrow', 'recipient'].map(role => [role, generateKeyPairSync('ed25519')]));
  const roles = Object.fromEntries(Object.entries(keys).map(([role, pair]) => [role, {
    endpoint: Buffer.from(pair.publicKey.export({ format: 'jwk' }).x, 'base64url').toString('hex') }]));
  for (const [name, route] of Object.entries(OWNED_CUSTODY_ROUTES)) {
    const intent = { sourcePublicKey: roles[route.sourceRole].endpoint, recipientPublicKey: roles[route.destinationRole].endpoint,
      recentBlockhash: h('block'), lamports: '1000000', wireKeyCommitment: h('K') };
    assertOwnedCustodyIntent(name, roles, '2', intent);
    const message = Buffer.from(encodeSolanaBindingMessage(intent), 'hex');
    const wire = Buffer.concat([Buffer.from([1]), sign(null, message, keys[route.sourceRole].privateKey), message]);
    assert.equal(wire.length, 321); validateSolanaBindingTransaction(wire.toString('base64'), intent);
    const wrongRole = route.sourceRole === 'escrow' ? 'depositor' : 'escrow';
    const wrongSignature = Buffer.concat([Buffer.from([1]), sign(null, message, keys[wrongRole].privateKey), message]);
    assert.throws(() => validateSolanaBindingTransaction(wrongSignature.toString('base64'), intent));
    assert.throws(() => assertOwnedCustodyIntent(name, roles, '2', { ...intent, sourcePublicKey: roles[wrongRole].endpoint }), /CUSTODY_SOURCE_ROLE/);
  }
});

const coin = (id, amount, changes = {}) => ({ txid: h(id), vout: '0', script: btcRoles.escrow.endpoint,
  amount, confirmations: '6', spendable: true, solvable: true, safe: true, locked: false, coinbase: false, ...changes });
test('aggregate BTC inventory distinguishes spendable, locked, pending, immature and fragmented exact-payment capacity', () => {
  const coins = [coin('a', '1000000'), coin('b', '1000000', { locked: true }),
    coin('pending', '1000000', { confirmations: '5' }), coin('immature', '5000000000', { coinbase: true, confirmations: '100' }),
    coin('mempool-spent', '1000000', { spendable: false, safe: false })];
  assert.deepEqual(summarizeOwnedBitcoinCoins(coins), { total: '5004000000', spendable: '2000000',
    unlockedSpendable: '1000000', largestSpendableUtxo: '1000000' });
  const summary = summarizeOwnedBitcoinCoins(coins);
  assert.ok(BigInt(summary.spendable) > 1000000n + 500n);
  assert.ok(BigInt(summary.largestSpendableUtxo) <= 1000000n + 500n); // cannot deliver principal with this grammar
  assert.equal(summarizeOwnedBitcoinCoins([coin('mature', '5000000000', { coinbase: true, confirmations: '101' })]).spendable, '5000000000');
  assert.throws(() => summarizeOwnedBitcoinCoins([coins[0], coins[0]]), /DUPLICATE_UTXO/);
  assert.throws(() => summarizeOwnedBitcoinCoins([coin('wrong', '01')]));
  assert.throws(() => summarizeOwnedBitcoinCoins([coin('wrong', '1', { locked: 'false' })]));
});

test('fee audit preserves actual fees and reserves unresolved escrow cost without calling prefunding user backing', () => {
  const record = (route, preparedFee, actualFee, phase = 'OBSERVED_CONFIRMED') => ({
    nativeId: h(route), route, phase, amount: '1000000', preparedFee, actualFee, broadcastAttempts: 1 });
  const records = [record('deposit', '501', '501'), record('refund', '502', '502'),
    record('redeem', '503', null, 'BROADCAST_UNKNOWN')];
  const result = ownedCustodyFeeAudit(records);
  assert.equal(result.actualFees, '1003'); assert.equal(result.escrowActualFees, '502');
  assert.equal(result.unresolvedEscrowPreparedFees, '503');
  assert.equal(result.transfers[2].phase, 'BROADCAST_UNKNOWN');
  assert.throws(() => ownedCustodyFeeAudit([record('refund', '502', '503')]), /OBSERVED_FEE_CHANGED/);
  assert.throws(() => ownedCustodyFeeAudit([{ ...records[0], broadcastAttempts: 2 }]), /BROADCAST_COUNT/);
  const failed = ownedCustodyFeeAudit([record('redeem', '503', '503', 'OBSERVED_ADVERSE')]);
  assert.equal(failed.escrowActualFees, '503'); assert.equal(failed.unresolvedEscrowPreparedFees, '0');
  assert.equal(failed.transfers[0].phase, 'OBSERVED_ADVERSE'); // fee truth does not discharge the payment
});

test('nonce bootstrap rent and actual fee are separate infrastructure, with no authority or balance substitution', () => {
  const value = { classification: 'SYNTHETIC_NONCE_INFRASTRUCTURE_NOT_USER_BACKING', genesisGrant: '10000000',
    payerPublicKey: h('bootstrap payer'), nonceAccountPublicKey: h('escrow nonce'), authorityPublicKey: h('escrow'),
    bootstrapNativeId: h('bootstrap signature left') + h('bootstrap signature right'), bootstrapTransactionSHA256: h('bootstrap wire'),
    bootstrapRentLamports: '1447680', bootstrapFeeLamports: '10000', bootstrapBroadcastAttempts: 1, payerBalance: '8542320',
    nonceRentExemptMinimum: '1447680', nonceAccount: { publicKey: h('escrow nonce'), owner: '0'.repeat(64), executable: false,
      lamports: '1447680', authorityPublicKey: h('escrow'), durableNonce: h('nonce'), lamportsPerSignature: '5000' } };
  assert.deepEqual(auditOwnedSolanaNonceInfrastructure(value), value);
  for (const mutation of [
    v => { v.classification = 'USER_BACKING'; }, v => { v.bootstrapBroadcastAttempts = 2; },
    v => { v.payerBalance = '8542321'; }, v => { v.bootstrapFeeLamports = '0'; },
    v => { v.nonceAccount.authorityPublicKey = h('wrong authority'); },
    v => { v.nonceAccount.publicKey = h('replacement nonce account'); },
    v => { v.nonceAccount.lamports = '1447681'; }, v => { v.nonceAccount.executable = true; },
    v => { v.nonceRentExemptMinimum = '1447681'; },
  ]) { const changed = structuredClone(value); mutation(changed); assert.throws(() => auditOwnedSolanaNonceInfrastructure(changed)); }
});


test('persisted-signature reservation window admits serialized inventory/history only and refuses unawaited reads before broadcast', async () => {
  const window = createOwnedCustodyReservationReadWindow();
  let reading = false, broadcasts = 0, release;
  const assertIdle = () => assert.equal(reading, false, 'READ_NOT_AWAITED');
  const read = async () => {
    assert.ok(window.active, 'WINDOW_REQUIRED'); assertIdle(); reading = true;
    try { await new Promise(resolve => { release = resolve; }); }
    finally { reading = false; }
  };
  assert.equal(window.active, false);
  await window.run(async () => {
    assert.equal(window.allowsObservation('OBSERVED_CONFIRMED'), true);
    assert.equal(window.allowsObservation('OBSERVED_FINALIZED'), true);
    for (const phase of ['SIGNED_NOT_BROADCAST', 'BROADCAST_UNKNOWN', 'BROADCAST', 'OBSERVED_PENDING', 'OBSERVATION_UNAVAILABLE'])
      assert.equal(window.allowsObservation(phase), false);
    const pending = read(); await assert.rejects(read(), /READ_NOT_AWAITED/);
    release(); await pending;
  }, assertIdle);
  assert.equal(window.active, false); broadcasts++;
  let unawaited;
  await assert.rejects(async () => {
    await window.run(async () => { unawaited = read(); }, assertIdle); broadcasts++;
  }, /READ_NOT_AWAITED/);
  assert.equal(window.active, false); assert.equal(broadcasts, 1);
  release(); await unawaited;
  await assert.rejects(window.run(async () => { throw new Error('RESERVATION_REJECTED'); }, assertIdle), /RESERVATION_REJECTED/);
  assert.equal(window.active, false); assert.equal(window.allowsObservation('OBSERVED_CONFIRMED'), false);
});
