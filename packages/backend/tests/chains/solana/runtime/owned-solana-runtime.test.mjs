import { resourcePath } from '@lianum/environment';
/** Changed-boundary host tests only. Synthetic keys/raw RPC-shaped data and
 * official bundled Memo ELF bytes; no runtime constructor, node or network.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash, generateKeyPairSync, sign } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { validateSolanaPreparedState, revalidateSolanaPreparedState, validateSolanaBindingObservation, base58Encode,
  assertOwnedSolanaRuntime, createOwnedSolanaCohortRuntime, SOLANA_PRIVATE_COHORT_OPTIONS,
  validateSolanaNoncePreparedState, revalidateSolanaNoncePreparedState, validateSolanaNonceBindingObservation,
  validateSolanaNonceFailureObservation, validateSolanaNonceBootstrapObservation, assertSolanaNonceFirstSendState,
  solanaNonceBootstrapFundingReady }
  from '../../../../src/chains/solana/runtime/owned-solana-runtime.mjs';
import { encodeSolanaBindingMessage, validateSolanaBindingTransaction, MEMO_PROGRAM } from '@lianum/engine/native/native-receipt-binding';
import { encodeSolanaNonceBindingMessage, validateSolanaNonceBindingTransaction, encodeSolanaNonceBootstrapMessage,
  validateSolanaNonceBootstrapTransaction } from '../../../../src/chains/solana/runtime/owned-solana-nonce-binding.mjs';

const h = text => createHash('sha256').update(text).digest('hex');
const copy = value => structuredClone(value), encoded = text => base58Encode(Buffer.from(h(text), 'hex'));
const zero = '0'.repeat(64), system = '11111111111111111111111111111111';
const memoBytes = readFileSync(resourcePath('engine', '.local/test-programs/spl_memo-3.0.0.so'));

test('bootstrap waits only for a well-formed zero fee and retains all funding checks', () => {
  assert.equal(solanaNonceBootstrapFundingReady(1447680, 0, '10000000'), false);
  assert.equal(solanaNonceBootstrapFundingReady(1447680, 10000, '10000000'), true);
  for (const args of [[0, 0, '10000000'], [10000000, 0, '10000000'],
    [9990000, 10000, '10000000'], [1447680, 10000, '9999999'],
    [1447680, null, '10000000'], [1447680, -0, '10000000'], [NaN, 0, '10000000']]) {
    assert.throws(() => solanaNonceBootstrapFundingReady(...args));
  }
});

function fixture() {
  const pair = generateKeyPairSync('ed25519');
  const source = Buffer.from(pair.publicKey.export({ format: 'jwk' }).x, 'base64url').toString('hex');
  const intent = { sourcePublicKey: source, recipientPublicKey: h('synthetic recipient'), recentBlockhash: h('synthetic blockhash'),
    lamports: '1000000', wireKeyCommitment: h('synthetic exact K') };
  const account = lamports => ({ lamports, owner: system, executable: false, data: ['', 'base64'], rentEpoch: 0, space: 0 });
  const recent = { context: { slot: 100 }, value: { blockhash: base58Encode(Buffer.from(intent.recentBlockhash, 'hex')), lastValidBlockHeight: 250 } };
  const prepared = { genesis: encoded('synthetic genesis'), expectedGenesis: encoded('synthetic genesis'), intent,
    recent, repeatedRecent: copy(recent), accounts: { context: { slot: 100 }, value: [account(10000000), null,
      { owner: MEMO_PROGRAM.owner, executable: true, data: [memoBytes.toString('base64'), 'base64'], lamports: 1000000, rentEpoch: 0, space: memoBytes.length }] },
    fee: { context: { slot: 100 }, value: 5000 }, blockHeight: 100,
    blockhashValidity: { context: { slot: 100 }, value: true }, rentExemptMinimum: 890880 };
  const message = Buffer.from(encodeSolanaBindingMessage(intent), 'hex'), signature = sign(null, message, pair.privateKey);
  const wire = Buffer.concat([Buffer.from([1]), signature, message]).toString('base64');
  const decoded = validateSolanaBindingTransaction(wire, intent);
  const expected = { genesis: prepared.genesis, intent, nativeWire: wire, nativeId: decoded.signatureHex, transactionSHA256: decoded.transactionSHA256 };
  const transaction = { slot: 120, blockTime: 1234, transaction: [wire, 'base64'], meta: {
    err: null, fee: 5000, preBalances: [10000000, 0, 1, 1000000], postBalances: [8995000, 1000000, 1, 1000000],
    innerInstructions: [], preTokenBalances: [], postTokenBalances: [], loadedAddresses: { writable: [], readonly: [] } } };
  const block = { blockhash: encoded('transaction block'), previousBlockhash: encoded('parent block'), parentSlot: 119, blockHeight: 117,
    signatures: [base58Encode(signature)] };
  const status = { slot: 120, err: null, confirmationStatus: 'finalized', confirmations: null };
  const observation = { expected, genesis: prepared.genesis, status, statusAgain: copy(status), transaction, transactionAgain: copy(transaction),
    currentSlot: 130, currentSlotAgain: 131, block, blockAgain: copy(block) };
  return { prepared, observation };
}

test('fixed constructor/owned marker cannot be replaced with caller options or a fake runtime', async () => {
  assert.deepEqual(SOLANA_PRIVATE_COHORT_OPTIONS, { ledgerRetentionShreds: 1000000, ticksPerSlot: 64, resourceProfile: 'PC23_BOUNDED_LEDGER_V1' });
  assert.throws(() => assertOwnedSolanaRuntime({}));
  // The argument guard throws before binary reads or any constructor work.
  await assert.rejects(createOwnedSolanaCohortRuntime(async () => {}, { endpoint: 'forbidden' }), /FIXED_CONSTRUCTOR/);
});

test('preparation preserves explicit missing recipient and validates real bundled Memo bytes', () => {
  const { prepared } = fixture();
  prepared.accounts.value[0].rentEpoch = Number(0xffffffffffffffffn);
  prepared.accounts.value[2].rentEpoch = Number(0xffffffffffffffffn);
  const result = validateSolanaPreparedState(prepared);
  assert.equal(result.unsignedWire.length, 512);
  assert.deepEqual(result.funds.recipientAccount, { publicKey: prepared.intent.recipientPublicKey,
    exists: false, owner: zero, executable: false, lamports: '0' });
  assert.equal(result.funds.sourceAccount.exists, true); assert.equal(result.funds.feeLamports, '5000');
  assert.equal(createHash('sha256').update(memoBytes).digest('hex'), MEMO_PROGRAM.codeSHA256);
  assert.equal(result.funds.memoProgram.dataBase64, memoBytes.toString('base64'));
});

test('preparation rejects stale/noncanonical context, missing source, unsafe funds, expiry and changed Memo code/owner', () => {
  const { prepared } = fixture();
  for (const mutate of [
    value => { value.accounts.context.slot++; }, value => { value.fee.context.slot++; },
    value => { value.repeatedRecent.value.blockhash = encoded('different blockhash'); },
    value => { value.accounts.value[0] = null; }, value => { value.accounts.value[0].owner = MEMO_PROGRAM.address; },
    value => { value.accounts.value[0].lamports = 10; }, value => { value.accounts.value[0].lamports = Number.MAX_SAFE_INTEGER + 1; },
    value => { value.accounts.value[0].data = ['AA==', 'base64']; },
    value => { value.fee.value = null; }, value => { value.fee.value = -0; },
    value => { value.blockhashValidity.value = false; }, value => { value.blockHeight = value.recent.value.lastValidBlockHeight; },
    value => { value.intent.lamports += '\n'; }, value => { value.genesis = encoded('wrong genesis'); },
    value => { value.accounts.value[2].owner = system; }, value => { value.accounts.value[2].executable = false; },
    value => { value.accounts.value[2].data = [Buffer.from('different program').toString('base64'), 'base64']; },
  ]) { const bad = copy(prepared); mutate(bad); assert.throws(() => validateSolanaPreparedState(bad)); }
  let trapped = false;
  const proxy = fixture().prepared;
  proxy.accounts.value[0] = new Proxy(proxy.accounts.value[0], { ownKeys() { trapped = true; return []; } });
  assert.throws(() => validateSolanaPreparedState(proxy), /RPC_ACCOUNT_RECORD/);
  assert.equal(trapped, false);
});

test('rent rule covers missing recipient creation and avoids leaving nonzero source dust', () => {
  const { prepared } = fixture();
  const small = copy(prepared); small.intent.lamports = '1';
  assert.throws(() => validateSolanaPreparedState(small), /RECIPIENT_RENT_MINIMUM/);
  const dust = copy(prepared); dust.accounts.value[0].lamports = 1005001;
  assert.throws(() => validateSolanaPreparedState(dust), /SOURCE_RENT_MINIMUM/);
  const drained = copy(prepared); drained.accounts.value[0].lamports = 1005000;
  assert.equal(validateSolanaPreparedState(drained).funds.sourceAccount.lamports, '1005000');
});

test('pre-sign recheck permits an advanced bank while preserving the still-valid original wire and expiry', () => {
  const { prepared: initial } = fixture(), prepared = validateSolanaPreparedState(initial);
  const context = { slot: '100', height: '100', rentExemptMinimum: '890880' };
  const observations = copy(initial);
  for (const name of ['recent', 'repeatedRecent', 'accounts', 'fee', 'blockhashValidity']) observations[name].context.slot = 110;
  observations.recent.value = { blockhash: encoded('new latest blockhash'), lastValidBlockHeight: 260 };
  observations.repeatedRecent.value = copy(observations.recent.value); observations.blockHeight = 108;
  const before = copy(prepared);
  assert.deepEqual(revalidateSolanaPreparedState({ prepared, context, observations }),
    { slot: '110', height: '108', rentExemptMinimum: '890880' });
  assert.deepEqual(prepared, before);
  assert.equal(prepared.intent.recentBlockhash, initial.intent.recentBlockhash);
  assert.equal(prepared.funds.lastValidBlockHeight, '250');
  for (const mutate of [
    value => { value.blockhashValidity.value = false; },
    value => { value.blockHeight = 250; }, // new latest hash remains valid; ORIGINAL expiry is binding
    value => { value.blockHeight = 99; },
    value => { for (const name of ['recent', 'repeatedRecent', 'accounts', 'fee', 'blockhashValidity']) value[name].context.slot = 99; },
    value => { value.accounts.value[0].lamports++; }, value => { value.fee.value++; },
    value => { value.rentExemptMinimum++; }, value => { value.intent.recentBlockhash = h('changed original wire'); },
  ]) { const changed = copy(observations); mutate(changed);
    assert.throws(() => revalidateSolanaPreparedState({ prepared, context, observations: changed })); }
});

test('fresh finalized observation binds genuine 321-byte wire, K, native identity and four-account deltas', () => {
  const { observation } = fixture(), result = validateSolanaBindingObservation(observation);
  assert.equal(Buffer.from(result.nativeWire, 'base64').length, 321);
  assert.equal(result.nativeId, observation.expected.nativeId); assert.equal(result.intent.wireKeyCommitment, observation.expected.intent.wireKeyCommitment);
  assert.equal(result.transactionSlot, '120'); assert.equal(result.parentSlot, '119'); assert.equal(result.observedSlot, '131');
  assert.equal(result.feeLamports, '5000'); assert.equal(result.recipientBefore, '0'); assert.equal(result.recipientAfter, '1000000');
});

test('changed/failing/unknown finalized history, signature, wire, slot order or balances cannot become observations', () => {
  const { observation } = fixture();
  for (const mutate of [
    value => { value.status.err = 'failure'; }, value => { value.statusAgain = null; },
    value => { value.status.confirmationStatus = 'confirmed'; }, value => { value.status.confirmations = 1; },
    value => { value.transactionAgain = null; }, value => { value.transactionAgain.transaction[0] = value.transactionAgain.transaction[0].slice(0, -1); },
    value => { value.expected.nativeId = '01'.repeat(64); }, value => { value.expected.intent.wireKeyCommitment = h('wrong K'); },
    value => { value.currentSlotAgain = 119; }, value => { value.block.signatures = []; },
    value => { value.blockAgain.blockhash = encoded('changed finalized block'); },
    value => { value.block.parentSlot = value.blockAgain.parentSlot = 120; },
    value => { value.transaction.meta.postBalances[3]++; value.transactionAgain = copy(value.transaction); },
    value => { value.transaction.meta.preBalances.pop(); value.transactionAgain = copy(value.transaction); },
    value => { value.transaction.meta.fee++; value.transactionAgain = copy(value.transaction); },
    value => { value.transaction.meta.innerInstructions = [{}]; value.transactionAgain = copy(value.transaction); },
  ]) { const bad = copy(observation); mutate(bad); assert.throws(() => validateSolanaBindingObservation(bad)); }
});

function nonceFixture() {
  const value = fixture(), pair = generateKeyPairSync('ed25519');
  const source = Buffer.from(pair.publicKey.export({ format: 'jwk' }).x, 'base64url').toString('hex');
  const intent = { sourcePublicKey: source, recipientPublicKey: h('nonce recipient'), nonceAccountPublicKey: h('nonce account'),
    durableNonce: h('original durable nonce'), lamports: '1000000', wireKeyCommitment: h('nonce exact K') };
  const bytes = Buffer.alloc(80); bytes.writeUInt32LE(1, 0); bytes.writeUInt32LE(1, 4);
  Buffer.from(source, 'hex').copy(bytes, 8); Buffer.from(intent.durableNonce, 'hex').copy(bytes, 40); bytes.writeBigUInt64LE(5000n, 72);
  delete value.prepared.blockhashValidity;
  value.prepared.intent = intent; value.prepared.nonceRentExemptMinimum = 1447680;
  value.prepared.accounts.value.push({ owner: system, executable: false, lamports: 1447680, data: [bytes.toString('base64'), 'base64'] });
  const message = Buffer.from(encodeSolanaNonceBindingMessage(intent), 'hex');
  const wire = Buffer.concat([Buffer.from([1]), sign(null, message, pair.privateKey), message]).toString('base64');
  const decoded = validateSolanaNonceBindingTransaction(wire, intent);
  value.observation.expected = { genesis: value.prepared.genesis, intent, nativeWire: wire, nativeId: decoded.signatureHex,
    transactionSHA256: decoded.transactionSHA256 };
  value.observation.transaction.transaction[0] = wire;
  value.observation.transaction.meta.preBalances = [10000000, 0, 1447680, 1, 1, 1000000];
  value.observation.transaction.meta.postBalances = [8995000, 1000000, 1447680, 1, 1, 1000000];
  value.observation.transactionAgain = copy(value.observation.transaction);
  value.observation.block.signatures = [base58Encode(Buffer.from(decoded.signatureHex, 'hex'))];
  value.observation.blockAgain = copy(value.observation.block);
  return value;
}

test('nonce preparation survives arbitrary block-height advance but never changes original nonce, wire, fee or funds', () => {
  const initial = nonceFixture().prepared, prepared = validateSolanaNoncePreparedState(initial);
  const context = { slot: '100', height: '100', rentExemptMinimum: '890880', nonceRentExemptMinimum: '1447680' };
  const observations = copy(initial);
  for (const name of ['recent', 'repeatedRecent', 'accounts', 'fee']) observations[name].context.slot = 100000;
  observations.recent.value = { blockhash: encoded('far later block'), lastValidBlockHeight: 100150 };
  observations.repeatedRecent.value = copy(observations.recent.value); observations.blockHeight = 99998;
  const retained = copy(prepared);
  assert.equal(revalidateSolanaNoncePreparedState({ prepared, context, observations }).height, '99998');
  assert.deepEqual(prepared, retained); assert.equal(prepared.unsignedWire.length, 660);
  assert.equal(Object.hasOwn(prepared.funds, 'lastValidBlockHeight'), false);
  for (const mutation of [
    value => { value.accounts.context.slot++; }, value => { value.accounts.value[0].lamports++; },
    value => { value.accounts.value[3].owner = MEMO_PROGRAM.address; },
    value => { value.accounts.value[3].lamports--; }, value => { value.fee.value++; },
    value => { value.nonceRentExemptMinimum++; }, value => { value.intent.durableNonce = h('replacement'); },
    value => { const bytes = Buffer.from(value.accounts.value[3].data[0], 'base64'); bytes[8] ^= 1; value.accounts.value[3].data[0] = bytes.toString('base64'); },
    value => { const bytes = Buffer.from(value.accounts.value[3].data[0], 'base64'); bytes[40] ^= 1; value.accounts.value[3].data[0] = bytes.toString('base64'); },
    value => { value.blockHeight = 99; },
  ]) { const changed = copy(observations); mutation(changed);
    assert.throws(() => revalidateSolanaNoncePreparedState({ prepared, context, observations: changed })); }
});

test('nonce preparation rejects legacy/uninitialized data and nonce that cannot advance in the current bank', () => {
  for (const offset of [0, 4]) {
    const value = nonceFixture().prepared, bytes = Buffer.from(value.accounts.value[3].data[0], 'base64');
    bytes.writeUInt32LE(0, offset); value.accounts.value[3].data[0] = bytes.toString('base64');
    assert.throws(() => validateSolanaNoncePreparedState(value));
  }
  const value = nonceFixture().prepared, current = Buffer.from(h('synthetic blockhash'), 'hex');
  value.intent.durableNonce = createHash('sha256').update(Buffer.concat([Buffer.from('DURABLE_NONCE'), current])).digest('hex');
  assert.throws(() => validateSolanaNoncePreparedState(value), /NONCE_NOT_YET_ADVANCEABLE/);
});

test('nonce success validates exactly six balance effects; finalized failure can account only for fee and never discharge', () => {
  const { observation } = nonceFixture();
  const success = validateSolanaNonceBindingObservation(observation);
  assert.equal(success.recipientAfter, '1000000'); assert.equal(success.feeLamports, '5000');
  assert.throws(() => validateSolanaBindingObservation(observation));
  for (const index of [2, 3, 4, 5]) {
    const changed = copy(observation); changed.transaction.meta.postBalances[index]++;
    changed.transactionAgain = copy(changed.transaction);
    assert.throws(() => validateSolanaNonceBindingObservation(changed), /BALANCE_DELTA/);
  }
  const failed = copy(observation), error = { InstructionError: [1, { Custom: 1 }] };
  failed.status.err = copy(error); failed.statusAgain.err = copy(error);
  failed.transaction.meta.err = copy(error);
  failed.transaction.meta.postBalances = [9995000, 0, 1447680, 1, 1, 1000000];
  failed.transactionAgain = copy(failed.transaction);
  const evidence = validateSolanaNonceFailureObservation(failed);
  assert.equal(evidence.executionFailed, true); assert.equal(evidence.transferredLamports, '0');
  assert.equal(evidence.feeLamports, '5000'); assert.throws(() => validateSolanaNonceBindingObservation(failed));
  assert.throws(() => validateSolanaNonceFailureObservation(observation));
  for (const mutation of [
    value => { value.transaction.meta.postBalances[1] = 1000000; value.transactionAgain = copy(value.transaction); },
    value => { value.statusAgain.err = { InstructionError: [2, 'InvalidArgument'] }; },
    value => { value.transactionAgain.transaction[0] = observation.expected.nativeWire.slice(0, -4); },
    value => { value.status.confirmationStatus = 'confirmed'; },
  ]) { const changed = copy(failed); mutation(changed); assert.throws(() => validateSolanaNonceFailureObservation(changed)); }
});

test('nonce bootstrap observation binds both signatures and isolates exact grant, rent and two-signature fee', () => {
  const payer = generateKeyPairSync('ed25519'), nonce = generateKeyPairSync('ed25519');
  const pub = pair => Buffer.from(pair.publicKey.export({ format: 'jwk' }).x, 'base64url').toString('hex');
  const intent = { payerPublicKey: pub(payer), nonceAccountPublicKey: pub(nonce), authorityPublicKey: h('escrow authority'),
    recentBlockhash: h('bootstrap block'), rentLamports: '1447680' };
  const message = Buffer.from(encodeSolanaNonceBootstrapMessage(intent), 'hex');
  const signatures = [payer, nonce].map(pair => sign(null, message, pair.privateKey));
  const wire = Buffer.concat([Buffer.from([2]), ...signatures, message]).toString('base64');
  const decoded = validateSolanaNonceBootstrapTransaction(wire, intent), { observation } = fixture();
  observation.expected = { genesis: observation.genesis, intent, nativeWire: wire, nativeId: decoded.signatureHex,
    transactionSHA256: decoded.transactionSHA256 };
  observation.transaction.transaction[0] = wire; observation.transaction.meta.fee = 10000;
  observation.transaction.meta.preBalances = [10000000, 0, 1, 1, 1];
  observation.transaction.meta.postBalances = [8542320, 1447680, 1, 1, 1];
  observation.transactionAgain = copy(observation.transaction);
  observation.block.signatures = [base58Encode(signatures[0])]; observation.blockAgain = copy(observation.block);
  const result = validateSolanaNonceBootstrapObservation(observation);
  assert.equal(result.feeLamports, '10000'); assert.equal(result.recipientAfter, '1447680');
  assert.throws(() => validateSolanaNonceBindingObservation(observation));
  observation.transaction.meta.preBalances[1] = 1; observation.transaction.meta.postBalances[1]++;
  observation.transactionAgain = copy(observation.transaction);
  assert.throws(() => validateSolanaNonceBootstrapObservation(observation), /BOOTSTRAP_ORIGINAL_FUNDING/);
});

test('nonce first-send state accepts only the retained never-sent payout and cannot authorize an attempt-one resend', () => {
  const { observation } = nonceFixture(), expected = observation.expected;
  const state = { route: 'redeem', phase: 'SIGNED_NOT_BROADCAST', broadcastAttempts: 0, signingUnresolved: false,
    nativeId: expected.nativeId, transactionSHA256: expected.transactionSHA256, nativeWire: expected.nativeWire,
    intent: expected.intent, unsignedWire: encodeSolanaNonceBindingMessage(expected.intent) };
  assert.equal(assertSolanaNonceFirstSendState(state), undefined);
  assert.equal(assertSolanaNonceFirstSendState({ ...state, route: 'refund' }), undefined);
  assert.equal(assertSolanaNonceFirstSendState({ ...state, route: 'deposit' }), undefined);
  for (const change of [
    { broadcastAttempts: 1 }, { phase: 'BROADCAST_UNKNOWN' }, { phase: 'BROADCAST' },
    { phase: 'OBSERVED_FINALIZED' }, { phase: 'OBSERVED_ADVERSE' }, { route: 'unknown' },
    { signingUnresolved: true }, { nativeId: '01'.repeat(64) }, { transactionSHA256: h('wrong signed wire') },
    { unsignedWire: state.unsignedWire.slice(2) }, { intent: { ...state.intent, durableNonce: h('replacement nonce') } },
  ]) assert.throws(() => assertSolanaNonceFirstSendState({ ...state, ...change }));
});
