/** Broadcast-stage host boundary only. Test-owned observer/native brands replace
 * external construction. Real operator EC signatures, strict SOL wire codecs,
 * complete backing audits and encrypted V3 stores execute. No native process,
 * proof, compiler, deployment, broadcast, benchmark or wall-clock wait runs.
 * Run with --experimental-test-module-mocks, as for operator-store.test.mjs.
 */
import test, { mock } from 'node:test';
import assert from 'node:assert/strict';
import { createHash, generateKeyPairSync, sign } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import * as stores from './segmented-record-store.mjs';
import { recoverSecp256k1Sender } from '../chain-adapters/owned-evm-v2-runtime.mjs';
import { encodeSolanaNonceBindingMessage } from '../chain-adapters/owned-solana-nonce-binding.mjs';
import { receiptKeyCommitment, nativeRuleCommitment } from '../chain-adapters/native-receipt-binding.mjs';
import { nativeFactsRegistryCommitment, FACTS_QUORUM_PROFILE } from '../chain-adapters/native-facts-peer.mjs';
import { ownedCustodyRoute, ownedCustodyFeeAudit } from '../chain-adapters/owned-native-custody.mjs';
import { nativeAdmissionRulesTree } from '../../../../../omnichain-product/src/paeg/native-admission.mjs';
import { createNativeQuorumHostVerifier } from '../../../../../omnichain-product/src/evidence/native-quorum.mjs';
import { CLAIM_CONFIG_SCHEMA, claimDomainCommitment, claimTicketId, claimTicketSecret,
  nativeClaimEndpointCommitment, claimDestinationCommitment } from './framing.mjs';
import { claimFrame, claimHash, claimRouteCommitment, claimPayoutAuthorizationFrame,
  claimPayoutBroadcastFrame } from './permits.mjs';
import { createClaimReservationBinding } from './reservation-facts-gate.mjs';

const hash = value => createHash('sha256').update('synthetic broadcast boundary/' + value).digest('hex');
const copy = value => structuredClone(value);
const ZERO = '0'.repeat(64);
const observers = new WeakMap(), natives = new WeakSet(), actualStores = new Map();
const url = path => new URL(path, import.meta.url).href;
mock.module(url('./owned-state.mjs'), { exports: {
  assertOwnedClaimObserver(observer) { assert.ok(observers.has(observer), 'TEST_OWNED_OBSERVER'); },
  ownedClaimObserverBindings(observer) { assert.ok(observers.has(observer)); return observers.get(observer); },
} });
mock.module(url('../chain-adapters/owned-solana-runtime.mjs'), { exports: {
  SOLANA_NONCE_INGRESS_PROFILE: 'LIANUM_GENERIC_NATIVE_CLAIM_INGRESS_V3',
  assertOwnedSolanaRuntime(native) { assert.ok(natives.has(native), 'TEST_OWNED_SOLANA'); },
} });
mock.module(url('./segmented-record-store.mjs'), { exports: { ...stores,
  async createClaimRecordStore(input, initial) {
    const actual = await stores.createClaimRecordStore(input, initial);
    actualStores.set(input.path, actual); return actual;
  },
} });
const { createLocalClaimOperator, createClaimOperatorQuorum } = await import('./operators.mjs');

async function fixture({ prepare = true } = {}) {
  const directory = await mkdtemp(join(tmpdir(), 'claim-broadcast-host-'));
  const operators = [0, 1, 2, 3].map(signerIndex => createLocalClaimOperator({ signerIndex }));
  const selected = operators.slice(0, 3), source = generateKeyPairSync('ed25519');
  const roles = Object.fromEntries(['depositor', 'escrow', 'recipient'].map(role => [role, {
    endpoint: role === 'escrow' ? Buffer.from(source.publicKey.export({ format: 'jwk' }).x, 'base64url').toString('hex') : hash(role),
    address: 'synthetic-owned-' + role,
  }]));
  const rule = { family: '2', genesis: hash('genesis'), asset: hash('native-asset'), finalityKind: '2',
    minimumConfirmations: '0', maximumEvidenceLifetime: '120', maximumClockSkew: '30' };
  const tree = nativeAdmissionRulesTree([rule]);
  const registry = { profile: FACTS_QUORUM_PROFILE, hubDomain: hash('hub'), registryEpoch: '1',
    rulesRoot: tree.root, keys: operators.map(operator => operator.publicKey) };
  const registryCommitment = nativeFactsRegistryCommitment(registry);
  const config = { ...Object.fromEntries(CLAIM_CONFIG_SCHEMA.map(([name, type]) => [name,
    type === 'address' ? hash(name).slice(0, 40) : type === 'field32' ? '01' + hash(name).slice(2)
      : type === 'u256' ? '31337' : type === 'u64' ? '5000' : type === 'u8' ? '2' : hash(name)])),
  hubDomain: registry.hubDomain, ledgerNamespace: registry.hubDomain, registryCommitment,
  nativeGenesis: rule.genesis, nativeAsset: rule.asset, nativeRuleCommitment: nativeRuleCommitment(rule),
  escrowEndpointCommitment: nativeClaimEndpointCommitment({ family: '2', genesis: rule.genesis,
    asset: rule.asset, endpoint: roles.escrow.endpoint }) };
  const policy = { rule, ledgerNamespace: config.ledgerNamespace, hubDomain: config.hubDomain, registryCommitment };
  const claimDomain = claimDomainCommitment(config), ticketId = claimTicketId({ claimDomain, kind: '1', nonce: '0' });
  const amount = '1000000', maxFee = '5000', wireSalt = hash('wire-salt');
  const route = { endpoint: roles.recipient.endpoint, salt: hash('destination-salt'), quotedFee: maxFee,
    selectedInputValue: '0', changeFloor: '0', destinationFunded: true };
  const nativeChainDomain = claimHash(claimFrame('LIANUM/evidence-chain/1', [Buffer.from('SOL'),
    Buffer.from(rule.genesis, 'hex'), Buffer.from(rule.asset, 'hex')]));
  const destinationCommitment = claimDestinationCommitment({ claimDomain, nativeChainDomain,
    endpoint: nativeClaimEndpointCommitment({ family: '2', genesis: rule.genesis, asset: rule.asset, endpoint: route.endpoint }),
    amount, maxFee, salt: route.salt });
  const ticket = { kind: '1', id: ticketId, claimDomain, amount, destinationCommitment, maxFee,
    referenceIngressN: ZERO, referenceQ: ZERO };
  const receiptSecret = claimTicketSecret({ claimDomain, ticketId });
  const intent = { sourcePublicKey: roles.escrow.endpoint, recipientPublicKey: roles.recipient.endpoint,
    nonceAccountPublicKey: hash('nonce-account'), durableNonce: hash('stored-durable-nonce'), lamports: amount,
    wireKeyCommitment: receiptKeyCommitment({ ledgerNamespace: config.ledgerNamespace, secret: receiptSecret }) };
  const prepared = { genesis: rule.genesis, intent, unsignedWire: encodeSolanaNonceBindingMessage(intent),
    funds: { feeLamports: maxFee } };
  const presignRequest = { claimDomain, ticketId, prepared, route, wireSalt };
  const gateway = { claimDomain, claimSequence: '2', wrapperSupply: '0', pendingRedemptions: amount,
    pendingRefunds: '0', heldUnissued: '0', reservedFees: maxFee, activePayout: ticketId,
    intentCount: '0', ticketCount: '1', reservedRefundTickets: '0', nextTicketNonce: '1', intents: [],
    tickets: [{ ticket, state: '2', payoutRouteCommitment: claimRouteCommitment(route) }], revocationState: hash('revocation-state'),
    poolHeadroom: true, healthState: { halted: '0', revocationOverflowCount: '0', revokedCount: '0', receiptCount: '0', spentTagCount: '0' } };
  const view = { head: { hash: hash('evm-head'), timestamp: '1000', number: '10' }, hubStateSequence: '8', gateways: [gateway] };
  const control = { currentNonce: intent.durableNonce, currentNonceAccount: intent.nonceAccountPublicKey,
    escrowTotal: '11000000', revoked: false, reservation: null, observation: null,
    preparedCalls: 0, unrevokedCalls: 0, inventoryCalls: 0, factCalls: 0, recoveryCalls: 0,
    onPrepared: null, onUnrevoked: null, onRead: null };
  const prefunding = { amount: '10000000', classification: 'SYNTHETIC_LOCAL_FEE_SURPLUS_NOT_USER_BACKING', fee: '0' };
  const transfers = [];
  const native = { roles, transfers, syntheticPrefunding: prefunding, close() {},
    adapter({ asset, route: routeName }) {
      assert.equal(asset, rule.asset); const spec = ownedCustodyRoute(routeName);
      return { binding: { sourceEndpoint: roles[spec.sourceRole].endpoint, destinationEndpoint: roles[spec.destinationRole].endpoint },
        async assertPrepared(value) {
          control.preparedCalls++; control.onPrepared?.();
          assert.equal(routeName, 'redeem'); assert.deepEqual(value, prepared, 'TEST_PREPARED_BYTES');
          assert.equal(value.intent.durableNonce, control.currentNonce, 'TEST_CURRENT_NONCE_CHANGED');
          assert.equal(value.intent.nonceAccountPublicKey, control.currentNonceAccount, 'TEST_NONCE_ACCOUNT_CHANGED');
        } };
    },
    async inventory() {
      control.inventoryCalls++;
      const accounts = Object.entries(roles).map(([role, account]) => ({ role, ...account, exists: true,
        total: role === 'escrow' ? control.escrowTotal : '10000000',
        spendable: role === 'escrow' ? control.escrowTotal : '10000000', rentExemptMinimum: '890880' }));
      return { family: '2', genesis: rule.genesis, asset: rule.asset,
        nativeHead: { id: hash('native-head'), height: '50', slot: '60' }, accounts,
        escrow: copy(accounts.find(row => row.role === 'escrow')), finality: 'finalized', signingUnresolved: false,
        syntheticPrefunding: copy(prefunding), feeAudit: ownedCustodyFeeAudit(transfers.map(row => ({
          nativeId: row.nativeId, route: row.route, phase: row.phase, amount: row.intent.lamports,
          preparedFee: maxFee, actualFee: row.actualFee, broadcastAttempts: row.broadcastAttempts,
        }))) };
    },
    factReader() { return { async observe() { control.factCalls++; return copy(control.observation); } }; },
  };
  Object.freeze(native); natives.add(native);
  let binding;
  const observer = {
    async read() { control.onRead?.(); return copy(view); },
    async assertCurrent(value) { assert.deepEqual(value, view, 'TEST_CANONICAL_HEAD_CHANGED'); },
    async readReservation(request, anchor) {
      assert.deepEqual(request, { claimDomain, admissionN: binding.admissionN });
      assert.deepEqual(anchor, view, 'TEST_RESERVATION_HEAD_CHANGED'); return copy(control.reservation);
    },
    async assertUnrevoked(request, anchor) {
      control.unrevokedCalls++; control.onUnrevoked?.();
      assert.deepEqual(request, { claimDomain, nativeGid: binding.nativeGid });
      assert.deepEqual(anchor, view, 'TEST_REVOCATION_HEAD_CHANGED');
      assert.equal(control.revoked, false, 'TEST_REVOKED_NATIVE_GID');
    },
  };
  // Offline public secp256k1 recovery models only the fixed precompile result;
  // actual operator signatures are independently verified below.
  const runtime = { async call({ to, data }, block) {
    control.recoveryCalls++; assert.equal(to, '0x' + '0'.repeat(39) + '1');
    assert.equal(block, '0xa'); assert.match(data, /^0x[0-9a-f]{256}$/);
    const raw = data.slice(2), parity = Number(BigInt('0x' + raw.slice(64, 128))) - 27;
    const address = recoverSecp256k1Sender({ digest: raw.slice(0, 64), r: raw.slice(128, 192), s: raw.slice(192), parity });
    return '0x' + '00'.repeat(12) + address.slice(2);
  } };
  observers.set(observer, { configs: [config], policies: [policy], registry, nativeRuntimes: [native], runtime, journalRoot: directory });
  try {
    for (const operator of selected) await operator.bind(observer);
    const quorum = createClaimOperatorQuorum({ operators: selected });
    const presign = prepare ? await quorum.authorizePayout(presignRequest) : null;
    const message = Buffer.from(prepared.unsignedWire, 'hex'), signature = sign(null, message, source.privateKey);
    const nativeId = signature.toString('hex'), nativeWire = Buffer.concat([Buffer.from([1]), signature, message]).toString('base64');
    transfers.push({ nativeId, nativeWire, intent: copy(intent), route: 'redeem', recipientIndex: 1,
      phase: 'SIGNED_NOT_BROADCAST', broadcastAttempts: 0, actualFee: null });
    binding = createClaimReservationBinding({ claimDomain, gateway: config.gateway, ledgerNamespace: config.ledgerNamespace,
      genesis: rule.genesis, asset: rule.asset, operationId: ticketId, revision: '1', ingress: false,
      receiptSecret, wireSalt, nativeWire, intent,
      request: { family: '2', recipientIndex: '1', nativeId, wireKeyCommitment: intent.wireKeyCommitment } });
    for (const operator of selected) await operator.retainSignedEffect({ claimDomain, operationId: ticketId, receiptSecret, wireSalt, nativeId });
    control.reservation = { gateway: config.gateway, operationId: ticketId, revision: '1',
      wireBindingCommitment: binding.wireBindingCommitment, ingress: false, consumed: false };
    control.observation = { status: 'observed', genesis: rule.genesis, asset: rule.asset, nativeWire, intent: copy(intent),
      blockId: hash('payment-block'), blockHeight: '50', finalityKind: '2', confirmations: '0',
      nativeContext: { observedTipId: ZERO, observedTipHeight: '0', transactionSlot: '60', parentSlot: '59', observedSlot: '64' } };
    return { operators: selected, quorum, presign, config, registry, gateway, view, native, control, binding,
      request: { ...copy(presignRequest), nativeId },
      async journal(index = 0) { return (await actualStores.get(join(directory, 'claim-operator-' + index + '.v3')).read()).data; },
      async close() {
        operators.forEach(operator => operator.close());
        for (let i = 0; i < 3; i++) actualStores.delete(join(directory, 'claim-operator-' + i + '.v3'));
        await rm(directory, { recursive: true, force: true });
      } };
  } catch (error) {
    operators.forEach(operator => operator.close());
    await rm(directory, { recursive: true, force: true }); throw error;
  }
}

test('exact signed-unsent wire plus current nonce, canonical reservation and fresh head gets a distinct three-signature broadcast permit', async () => {
  const f = await fixture();
  try {
    const inventoryBefore = f.control.inventoryCalls, preparationsBefore = f.control.preparedCalls;
    const permit = await f.quorum.authorizeBroadcast(f.request);
    assert.deepEqual(permit.indexes, [0, 1, 2]); assert.equal(permit.independentOperators, false);
    assert.deepEqual(permit.head, f.view.head);
    assert.equal(permit.message.validFrom, '1000'); assert.equal(permit.message.validUntil, '1030');
    for (const name of ['admissionN', 'nativeGid', 'wireBindingCommitment']) assert.equal(permit.message[name], f.binding[name]);
    const verifier = createNativeQuorumHostVerifier({ registry: f.registry, expectedRegistryCommitment: f.config.registryCommitment });
    verifier.assertQuorumForMessage({ messageBytes: claimPayoutBroadcastFrame(permit.message),
      indexes: permit.indexes, signatures: permit.signatures });
    const beforeSign = copy(permit.message);
    for (const name of ['admissionN', 'nativeGid', 'wireBindingCommitment']) delete beforeSign[name];
    assert.notEqual(claimHash(claimPayoutBroadcastFrame(permit.message)), claimHash(claimPayoutAuthorizationFrame(beforeSign)));
    assert.throws(() => verifier.assertQuorumForMessage({ messageBytes: claimPayoutAuthorizationFrame(beforeSign),
      indexes: permit.indexes, signatures: permit.signatures }));
    assert.throws(() => verifier.assertQuorumForMessage({ messageBytes: claimPayoutBroadcastFrame(permit.message),
      indexes: f.presign.indexes, signatures: f.presign.signatures }));
    assert.equal(f.control.inventoryCalls - inventoryBefore, 3);
    assert.equal(f.control.preparedCalls - preparationsBefore, 6);
    assert.equal(f.control.unrevokedCalls, 6); assert.equal(f.control.factCalls, 0);
    assert.equal(f.native.transfers[0].phase, 'SIGNED_NOT_BROADCAST'); assert.equal(f.native.transfers[0].broadcastAttempts, 0);
    for (let i = 0; i < 3; i++) {
      const journal = await f.journal(i), authorization = journal.authorizations.at(-1);
      assert.equal(journal.schema, 'NATIVE_CLAIM_OPERATOR_JOURNAL_V3');
      assert.equal(authorization.kind, 'broadcast-payout-v2');
      assert.equal(authorization.digest, claimHash(claimPayoutBroadcastFrame(permit.message)));
      assert.equal(authorization.signature, permit.signatures[i]);
      assert.deepEqual(journal.bindings, [f.binding]);
    }
  } finally { await f.close(); }
});

test('changed native identity, signed wire, preparation, nonce, route, ticket and reservation cannot authorize a broadcast', async () => {
  const f = await fixture();
  try {
    const originalTransfer = copy(f.native.transfers[0]), originalGateway = copy(f.gateway), originalReservation = copy(f.control.reservation);
    const cases = [
      ['already attempted', request => { f.native.transfers[0].broadcastAttempts = 1; }, /ALREADY_ATTEMPTED/],
      ['wrong phase', request => { f.native.transfers[0].phase = 'BROADCAST_UNKNOWN'; }, /ORIGINAL_PHASE/],
      ['wrong native ID', request => { request.nativeId = '11'.repeat(64); }, /ORIGINAL_ID/],
      ['changed signed wire', request => { f.native.transfers[0].nativeWire += 'AAAA'; }, /ORIGINAL_SIGNED_BYTES/],
      ['changed unsigned preparation', request => { request.prepared.unsignedWire += '00'; }, /PREPARATION_CHANGED/],
      ['changed preparation fee', request => { request.prepared.funds.feeLamports = '5001'; }, /PREPARATION_CHANGED/],
      ['changed nonce account', request => { f.control.currentNonceAccount = hash('other-account'); }, /NONCE_ACCOUNT_CHANGED/],
      ['advanced nonce', request => { f.control.currentNonce = hash('advanced-nonce'); }, /CURRENT_NONCE_CHANGED/],
      ['changed wire salt', request => { request.wireSalt = hash('other-salt'); }, /ORIGINAL_SALT/],
      ['changed route', request => { request.route.quotedFee = '4999'; }, /ROUTE_CHANGED/],
      ['unknown ticket', request => { request.ticketId = hash('unknown-ticket'); }, /ORIGINAL_BINDING/],
      ['ticket no longer signing', request => { f.gateway.tickets[0].state = '3'; }, /EXACT_TICKET_STATE/],
      ['ticket amount changed', request => { f.gateway.tickets[0].ticket.amount = '999999'; }, /EXACT_AMOUNT/],
      ['payout fence changed', request => { f.gateway.activePayout = ZERO; }, /EXACT_PAYOUT_FENCE/],
      ['missing reservation', request => { f.control.reservation = null; }, /RESERVATION_NOT_INCLUDED/],
      ['different reservation', request => { f.control.reservation.wireBindingCommitment = hash('other-wire-binding'); }, /RESERVATION_CANONICAL/],
      ['consumed reservation', request => { f.control.reservation.consumed = true; }, /RESERVATION_CONSUMED/],
      ['revoked original GID', request => { f.control.revoked = true; }, /REVOKED_NATIVE_GID/],
    ];
    const before = (await f.journal()).authorizations.length;
    for (const [label, change, error] of cases) {
      f.native.transfers[0] = copy(originalTransfer); Object.assign(f.gateway, copy(originalGateway));
      f.control.reservation = copy(originalReservation); f.control.revoked = false;
      f.control.currentNonce = f.request.prepared.intent.durableNonce;
      f.control.currentNonceAccount = f.request.prepared.intent.nonceAccountPublicKey;
      const request = copy(f.request); change(request);
      await assert.rejects(f.operators[0].authorizeBroadcast(request), error, label);
      assert.equal((await f.journal()).authorizations.length, before, label);
    }
  } finally { await f.close(); }
});

test('signed wire without its original retained before-sign preparation cannot get broadcast authority', async () => {
  const f = await fixture({ prepare: false });
  try {
    await assert.rejects(f.quorum.authorizeBroadcast(f.request), /ORIGINAL_PREPARATION/);
    assert.equal((await f.journal()).authorizations.length, 0);
  } finally { await f.close(); }
});

test('broadcast audit grants no delivered principal credit to its exact signed-unsent payout', async () => {
  const f = await fixture();
  try {
    f.control.escrowTotal = '10000000'; // Only excluded synthetic fee surplus remains.
    const before = (await f.journal()).authorizations.length;
    await assert.rejects(f.quorum.authorizeBroadcast(f.request), /CURRENT_PRINCIPAL_DEFICIT/);
    assert.equal((await f.journal()).authorizations.length, before);
    assert.equal(f.control.factCalls, 0); assert.equal(f.native.transfers[0].actualFee, null);
    assert.equal(f.native.transfers[0].broadcastAttempts, 0);
  } finally { await f.close(); }
});

test('fresh broadcast authorization refuses a changed canonical head and rechecks nonce/revocation after signing', async () => {
  for (const mode of ['head', 'nonce', 'revocation']) {
    const f = await fixture();
    try {
      let calls = 0;
      if (mode === 'head') f.control.onPrepared = () => { if (++calls === 1) f.view.head.hash = hash('changed-head'); };
      if (mode === 'nonce') f.control.onPrepared = () => { if (++calls === 2) f.control.currentNonce = hash('advanced-after-signing'); };
      if (mode === 'revocation') f.control.onUnrevoked = () => { if (++calls === 2) f.control.revoked = true; };
      await assert.rejects(f.operators[0].authorizeBroadcast(f.request), mode === 'head' ? /HEAD_CHANGED/
        : mode === 'nonce' ? /CURRENT_NONCE_CHANGED/ : /REVOKED_NATIVE_GID/);
      assert.equal(f.native.transfers[0].broadcastAttempts, 0);
    } finally { await f.close(); }
  }
});

test('deterministic monotonic clock rejects operator and whole-quorum work at the 30-second boundary', async () => {
  for (const mode of ['operator', 'quorum']) {
    const f = await fixture(); let time = 0;
    const mockedClock = mock.method(performance, 'now', () => time);
    try {
      if (mode === 'operator') f.control.onPrepared = () => { time = 30000; };
      else f.control.onRead = () => { time = 30000; };
      await assert.rejects(mode === 'operator' ? f.operators[0].authorizeBroadcast(f.request)
        : f.quorum.authorizeBroadcast(f.request), mode === 'operator' ? /OPERATOR_AUDIT_TOO_OLD/ : /QUORUM_AUDIT_TOO_OLD/);
      assert.equal(f.native.transfers[0].broadcastAttempts, 0);
    } finally { mockedClock.mock.restore(); await f.close(); }
  }
});

test('an actual fee on an adverse or unresolved payout cannot create observed-debt principal credit', async () => {
  for (const phase of ['ADVERSE_AFTER_NONCE_ADVANCE', 'BROADCAST_UNKNOWN']) {
    const f = await fixture();
    try {
      Object.assign(f.native.transfers[0], { phase, actualFee: '5000', broadcastAttempts: 1 });
      f.control.escrowTotal = '9995000'; // Fee was charged; principal is absent.
      // Even a supplied successful observation cannot override the owned
      // transfer phase when the full inventory is reconciled.
      await assert.rejects(f.operators[0].audit(), /COMPLETE_AUDIT_UNAVAILABLE/);
      await assert.rejects(f.operators[0].authorizeBroadcast(f.request), /ORIGINAL_PHASE/);
      assert.equal((await f.journal()).authorizations.filter(row => row.kind === 'broadcast-payout-v2').length, 0);
    } finally { await f.close(); }
  }
});

test('adverse native execution stays durably blocked even with actual fee and a later finalized label', async () => {
  const f = await fixture();
  try {
    Object.assign(f.native.transfers[0], { phase: 'OBSERVED_FINALIZED', actualFee: '5000', broadcastAttempts: 1 });
    f.control.escrowTotal = '9995000';
    const observed = copy(f.control.observation);
    f.control.observation = { status: 'adverse', reason: 'NONCE_ADVANCED_PAYMENT_FAILED' };
    await assert.rejects(f.operators[0].audit(), /PERMANENT_ADVERSE_HISTORY/);
    assert.equal((await f.journal()).adverse[f.binding.admissionN], 'NATIVE_ADVERSE');
    f.control.observation = observed;
    await assert.rejects(f.operators[0].audit(), /PERMANENT_ADVERSE_HISTORY/);
  } finally { await f.close(); }
});
