/** Pure host conformance only: no native daemon, proof, compiler or deployment.
 * Synthetic observation inputs here do not carry the production owned brand. */
import test from 'node:test';
import * as publicBacking from '../../../src/claims/operations/backing-audit.mjs';
import * as backingArithmetic from '../../../src/claims/operations/claim-backing-arithmetic.mjs';
import assert from 'node:assert/strict';
import { createHash, generateKeyPairSync, sign } from 'node:crypto';
import { CLAIM_CONFIG_SCHEMA, claimDomainCommitment, claimIntentId, claimTicketId, claimTicketSecret,
  claimDestinationCommitment, nativeClaimEndpointCommitment } from '../../../src/claims/protocol/framing.mjs';
import { claimBackingFrame, claimActionFrame, claimSignedWireCommitment, claimRouteCommitment,
  assertClaimBackingQuorum, CLAIM_BACKING_FIELDS, claimFrame, claimHash, claimIngressAuthorizationFrame,
  claimPayoutAuthorizationFrame } from '../../../src/claims/authorization/permits.mjs';
import { createClaimReservationBinding, assertCanonicalClaimReservation, claimFactsRequest,
  observeReservedClaimFact } from '../../../src/claims/authorization/reservation-facts-gate.mjs';
import { auditClaimGateway, auditClaimNativeInventory, assertClaimHealthState, assertClaimRoute, claimEconomicInventory,
  auditClaimIngressPreparation, auditClaimPayoutPreparation } from '../../../src/claims/operations/backing-audit.mjs';
import { createLocalClaimOperator, createClaimOperatorQuorum, assertOwnedClaimOperatorQuorum } from '../../../src/claims/operations/operators.mjs';
import { receiptKeyCommitment, encodeSolanaBindingMessage } from '../../../src/chains/shared/dispatch/native-receipt-binding.mjs';
import { summarizeOwnedBitcoinCoins, ownedCustodyFeeAudit } from '../../../src/chains/shared/runtime/owned-native-custody.mjs';
import { nativeFactsRegistryCommitment, FACTS_QUORUM_PROFILE } from '../../../src/chains/shared/dispatch/native-facts-peer.mjs';
import { createNativeQuorumHostVerifier } from '../../../../engine/src/evidence/native-quorum.mjs';

const h = value => createHash('sha256').update(value).digest('hex'), ZERO = '0'.repeat(64);
const copy = value => structuredClone(value);
const point = key => { const p = key.export({ format: 'jwk' }); return {
  x: Buffer.from(p.x, 'base64url').toString('hex'), y: Buffer.from(p.y, 'base64url').toString('hex') }; };
const order = 0xfffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141n;
function signLow(pair, frame) {
  const bytes = sign('sha256', frame, { key: pair.privateKey, dsaEncoding: 'ieee-p1363' });
  const s = BigInt('0x' + bytes.subarray(32).toString('hex'));
  return bytes.subarray(0, 32).toString('hex') + (s > order / 2n ? order - s : s).toString(16).padStart(64, '0');
}
function config(family = '2') {
  const c = Object.fromEntries(CLAIM_CONFIG_SCHEMA.map(([name, type]) => [name,
    type === 'address' ? h(name).slice(0, 40) : type === 'u256' ? '31337'
      : type === 'u64' ? '1000' : type === 'u8' ? family : type === 'field32' ? '01' + h(name).slice(2) : h(name)]));
  c.ledgerNamespace = c.hubDomain; return c;
}
function reservationFixture(ingress = true) {
  const source = generateKeyPairSync('ed25519'), c = config(), domain = claimDomainCommitment(c), operationId = h('operation');
  const receiptSecret = ingress ? h('private-receipt-secret') : claimTicketSecret({ claimDomain: domain, ticketId: operationId });
  const K = receiptKeyCommitment({ ledgerNamespace: c.ledgerNamespace, secret: receiptSecret });
  const intent = { sourcePublicKey: Buffer.from(source.publicKey.export({ format: 'jwk' }).x, 'base64url').toString('hex'),
    recipientPublicKey: h('recipient'), recentBlockhash: h('blockhash'), lamports: '1000000', wireKeyCommitment: K };
  const message = Buffer.from(encodeSolanaBindingMessage(intent), 'hex'), signature = sign(null, message, source.privateKey);
  const wire = Buffer.concat([Buffer.from([1]), signature, message]).toString('base64');
  const binding = createClaimReservationBinding({ claimDomain: domain, gateway: c.gateway, ledgerNamespace: c.ledgerNamespace,
    genesis: c.nativeGenesis, asset: c.nativeAsset, operationId, revision: '1', ingress, receiptSecret,
    wireSalt: h('fresh-test-salt'), nativeWire: wire, intent,
    request: { family: '2', recipientIndex: '0', nativeId: signature.toString('hex'), wireKeyCommitment: K } });
  const reservation = { gateway: c.gateway, operationId, revision: '1', wireBindingCommitment: binding.wireBindingCommitment,
    ingress, consumed: false };
  const observed = { status: 'observed', nativeWire: wire, intent, genesis: c.nativeGenesis, asset: c.nativeAsset };
  return { binding, reservation, observed };
}
test('backing permit is exact 18-field H4 with u256 counters and a maximum 30-second window', () => {
  const message = Object.fromEntries(CLAIM_BACKING_FIELDS.map(([name, type]) => [name, type === 'b32' ? h(name) : type === 'u256' ? (1n << 255n).toString() : '4']));
  message.validFrom = '10'; message.validUntil = '40';
  const expected = claimFrame('LIANUM/PAEG/native-claim-backing-permit/1', CLAIM_BACKING_FIELDS.map(([name, type]) =>
    type === 'b32' ? Buffer.from(message[name], 'hex') : Buffer.from(BigInt(message[name]).toString(16).padStart(Number(type.slice(1)) / 4, '0'), 'hex')));
  assert.equal(CLAIM_BACKING_FIELDS.length, 18); assert.deepEqual(claimBackingFrame(message), expected);
  for (const changed of [{ ...message, validUntil: '41' }, { ...message, validUntil: '10' }, { ...message, nativePrincipalAvailable: '01' },
    { ...message, unknownExposure: (1n << 256n).toString() }, { ...message, inventedHealthy: true }]) assert.throws(() => claimBackingFrame(changed));
});
test('actual ordered low-S signatures require three distinct positions in the pinned four-key registry', () => {
  const keys = Array.from({ length: 4 }, () => generateKeyPairSync('ec', { namedCurve: 'secp256k1' }));
  const registry = { profile: FACTS_QUORUM_PROFILE, hubDomain: h('hub'), registryEpoch: '1', rulesRoot: h('root'), keys: keys.map(k => point(k.publicKey)) };
  const message = Object.fromEntries(CLAIM_BACKING_FIELDS.map(([name, type]) => [name, type === 'b32' ? h(name) : '0']));
  message.validFrom = '10'; message.validUntil = '40';
  const frame = claimBackingFrame(message), signatures = keys.slice(0, 3).map(key => signLow(key, frame));
  const expected = { registry, registryCommitment: nativeFactsRegistryCommitment(registry), timestamp: '15' };
  const permit = { message, indexes: [0, 1, 2], signatures };
  assertClaimBackingQuorum(permit, expected);
  for (const bad of [ { ...permit, indexes: [0, 0, 2] }, { ...permit, indexes: [2, 1, 0] },
    { ...permit, indexes: [0], signatures: [signatures[0]] }, { ...permit, signatures: [signatures[0], signatures[0], signatures[0]] },
    { ...permit, message: { ...message, nativePrincipalAvailable: '1' } } ]) assert.throws(() => assertClaimBackingQuorum(bad, expected));
  const high = signatures.slice(), s = BigInt('0x' + high[0].slice(64)); high[0] = high[0].slice(0, 64) + (order - s).toString(16).padStart(64, '0');
  assert.throws(() => assertClaimBackingQuorum({ ...permit, signatures: high }, expected), /HIGH_S/);
  assert.throws(() => assertClaimBackingQuorum(permit, { ...expected, timestamp: '40' }), /EXPIRED/);
});
test('action frame commits all identities, revisions, fee and sequence terms with exact widths', () => {
  const terms = { action: '2', operationId: h('op'), revision: '1', amount: '2000', destinationCommitment: h('dst'), maxFee: '100',
    nullifier: h('N'), wireBindingCommitment: h('wire-salted'), routeCommitment: ZERO, claimSequence: '8', hubSequence: '9' };
  const original = claimHash(claimActionFrame(h('domain'), terms));
  for (const [key, value] of Object.entries(terms)) {
    const changed = { ...terms, [key]: value.length === 64 ? h('change:' + key) : String(BigInt(value) + 1n) };
    assert.notEqual(claimHash(claimActionFrame(h('domain'), changed)), original, key);
  }
});
test('reservation binds genuine signed bytes, original K/GID/N and a private nonzero salt', () => {
  const { binding } = reservationFixture();
  assert.notEqual(binding.admissionN, ZERO); assert.notEqual(binding.wireBindingCommitment, binding.transactionSHA256);
  const fields = ['claimDomain', 'operationId', 'revision', 'admissionN', 'wireKeyCommitment', 'nativeGid', 'transactionSHA256', 'wireSalt'];
  const input = Object.fromEntries(fields.map(name => [name, name === 'wireKeyCommitment' ? binding.request.wireKeyCommitment : binding[name]]));
  assert.equal(claimSignedWireCommitment(input), binding.wireBindingCommitment);
  assert.throws(() => claimSignedWireCommitment({ ...input, wireSalt: ZERO }));
  for (const name of fields.filter(name => name !== 'revision')) assert.notEqual(claimSignedWireCommitment({ ...input, [name]: h('changed-' + name) }), binding.wireBindingCommitment);
});
test('facts interface rejects Q, opening, graph and private reservation data', () => {
  const { binding } = reservationFixture(); claimFactsRequest(binding.request);
  for (const name of ['Q', 'opening', 'graph', 'receiptSecret', 'admissionN']) assert.throws(() => claimFactsRequest({ ...binding.request, [name]: h(name) }));
});
test('leaked early broadcast cannot even reach native observation without canonical reservation', async () => {
  const { binding, observed } = reservationFixture(); let calls = 0;
  await assert.rejects(observeReservedClaimFact({ binding, request: binding.request, readReservation: async () => null,
    observe: async () => { calls++; return observed; }, assertCurrent: async () => {} }), /NOT_INCLUDED/);
  assert.equal(calls, 0);
});
test('facts gate rechecks the exact immutable reservation after original observation', async () => {
  for (const field of ['gateway', 'operationId', 'revision', 'wireBindingCommitment', 'ingress', 'consumed']) {
    const { binding, reservation, observed } = reservationFixture(); let calls = 0;
    const after = { ...reservation, [field]: typeof reservation[field] === 'boolean' ? !reservation[field]
      : field === 'gateway' ? h('other').slice(0, 40) : field === 'revision' ? '2' : h('other') };
    await assert.rejects(observeReservedClaimFact({ binding, request: binding.request,
      readReservation: async lookup => { assert.deepEqual(lookup, { claimDomain: binding.claimDomain, admissionN: binding.admissionN }); return ++calls === 1 ? reservation : after; },
      observe: async () => observed, assertCurrent: async () => {} }), /RESERVATION/);
    assert.equal(calls, 2);
  }
});
test('consumed reservations refresh only their same permanent exact native binding', async () => {
  const { binding, reservation, observed } = reservationFixture(); reservation.consumed = true;
  assertCanonicalClaimReservation(binding, reservation);
  const result = await observeReservedClaimFact({ binding, request: binding.request, readReservation: async () => reservation,
    observe: async () => observed, assertCurrent: async () => {} });
  assert.deepEqual(result, observed);
  await assert.rejects(observeReservedClaimFact({ binding, request: { ...binding.request, wireKeyCommitment: h('other K') },
    readReservation: async () => reservation, observe: async () => observed, assertCurrent: async () => {} }), /REQUEST_CHANGED/);
  await assert.rejects(observeReservedClaimFact({ binding, request: binding.request, readReservation: async () => reservation,
    observe: async () => ({ ...observed, nativeWire: 'changed' }), assertCurrent: async () => {} }), /ORIGINAL_WIRE_CHANGED/);
});
test('ticket reservation uses public deterministic ticket secret rather than a caller-selected receipt secret', () => {
  const { binding } = reservationFixture(false); assert.equal(binding.receiptSecret,
    claimTicketSecret({ claimDomain: binding.claimDomain, ticketId: binding.operationId }));
  assert.throws(() => assertCanonicalClaimReservation({ ...binding, operationId: h('another ticket') },
    { gateway: binding.gateway, operationId: h('another ticket'), revision: '1', wireBindingCommitment: binding.wireBindingCommitment, ingress: false, consumed: false }));
});

function inventoryFixture(family = '2', principal = 1000000n) {
  const c = config(family), roles = Object.fromEntries(['depositor', 'escrow', 'recipient'].map(role => [role,
    { endpoint: family === '1' ? '0014' + h(role).slice(0, 40) : h(role), address: 'owned-' + role }]));
  c.escrowEndpointCommitment = nativeClaimEndpointCommitment({ family, genesis: c.nativeGenesis, asset: c.nativeAsset, endpoint: roles.escrow.endpoint });
  const surplus = 10000000n, coins = [{ txid: h('coin'), vout: '0', script: roles.escrow.endpoint, amount: (surplus + principal).toString(),
    confirmations: '6', spendable: true, solvable: true, safe: true, locked: false, coinbase: false }];
  const accounts = Object.entries(roles).map(([role, account]) => ({ role, ...account,
    ...(family === '1' ? { ...summarizeOwnedBitcoinCoins(role === 'escrow' ? coins : []), utxos: role === 'escrow' ? coins : [] }
      : { exists: true, total: (surplus + (role === 'escrow' ? principal : 0n)).toString(),
        spendable: (surplus + (role === 'escrow' ? principal : 0n)).toString(), rentExemptMinimum: '890880' }) }));
  const inventory = { family, genesis: c.nativeGenesis, asset: c.nativeAsset,
    nativeHead: { id: h('head'), height: '10', ...(family === '2' ? { slot: '11' } : {}) }, accounts,
    escrow: copy(accounts.find(row => row.role === 'escrow')), feeAudit: ownedCustodyFeeAudit([]), signingUnresolved: false,
    syntheticPrefunding: { amount: surplus.toString(), classification: 'SYNTHETIC_LOCAL_FEE_SURPLUS_NOT_USER_BACKING', fee: '0' },
    ...(family === '2' ? { finality: 'finalized' } : { unconfirmedOutputsIncluded: false }) };
  return { c, roles, inventory };
}
test('BTC and SOL native totals preserve exact user principal separately from synthetic liquidity, fees and rent', () => {
  for (const family of ['1', '2']) {
    const { c, roles, inventory } = inventoryFixture(family), result = auditClaimNativeInventory(inventory, c, roles);
    assert.equal(result.nativeTotal, '11000000'); assert.equal(result.nativePrincipalAvailable, '1000000');
    assert.equal(result.feeReserveAvailable, family === '1' ? '10000000' : '9109120');
    assert.equal(auditClaimNativeInventory(inventoryFixture(family, 0n).inventory, c, roles).nativePrincipalAvailable, '0');
  }
});
test('current balance loss cannot be replaced with historical incoming sums; unknown key use fails closed', () => {
  const { c, roles, inventory } = inventoryFixture(), lost = copy(inventory);
  lost.escrow.total = lost.escrow.spendable = '10000000'; lost.accounts[1] = copy(lost.escrow);
  assert.equal(auditClaimNativeInventory(lost, c, roles).nativePrincipalAvailable, '0');
  assert.throws(() => auditClaimNativeInventory({ ...inventory, signingUnresolved: true }, c, roles), /UNKNOWN_KEY_USE/);
  const fees = copy(inventory); fees.feeAudit.escrowActualFees = '1';
  assert.throws(() => auditClaimNativeInventory(fees, c, roles), /ACTUAL_FEE_ACCOUNTING/);
});
test('BTC one-input deliverability rejects fragmentation, locked coins and missing positive change', () => {
  const { c, roles, inventory } = inventoryFixture('1'), domain = claimDomainCommitment(c);
  const chainDomain = claimHash(claimFrame('LIANUM/evidence-chain/1', [Buffer.from('BTC'), Buffer.from(c.nativeGenesis, 'hex'), Buffer.from(c.nativeAsset, 'hex')]));
  const route = { endpoint: roles.recipient.endpoint, salt: h('dst-salt'), quotedFee: '500', selectedInputValue: '11000000', changeFloor: '546', destinationFunded: false };
  const endpoint = nativeClaimEndpointCommitment({ family: '1', genesis: c.nativeGenesis, asset: c.nativeAsset, endpoint: route.endpoint });
  const args = { config: c, claimDomain: domain, amount: '1000000', maxFee: '1000', route, inventory, roles,
    destinationCommitment: claimDestinationCommitment({ claimDomain: domain, nativeChainDomain: chainDomain, endpoint, amount: '1000000', maxFee: '1000', salt: route.salt }) };
  assertClaimRoute(args); assert.equal(typeof claimRouteCommitment(route), 'string');
  assert.throws(() => assertClaimRoute({ ...args, route: { ...route, selectedInputValue: '1001000' } }), /DELIVERABILITY/);
  assert.throws(() => assertClaimRoute({ ...args, route: { ...route, changeFloor: '0' } }), /OUTPUT_FLOOR/);
  const locked = copy(inventory); locked.escrow.utxos[0].locked = true;
  assert.throws(() => assertClaimRoute({ ...args, inventory: locked }), /ONE_INPUT/);
  const fragmented = copy(inventory); fragmented.escrow.utxos = [0, 1].map(i => ({ ...fragmented.escrow.utxos[0], txid: h('coin-' + i), amount: '5500000' }));
  assert.throws(() => assertClaimRoute({ ...args, inventory: fragmented }), /ONE_INPUT/);
});
test('complete canonical history reconstructs held, redemption, refund, supply-independent liabilities and exact fees', () => {
  const c = config(), domain = claimDomainCommitment(c), output = h('Q');
  const intent = { id: claimIntentId({ claimDomain: domain, outputQ: output, amount: '1000000' }), state: '1', output,
    amount: '1000000', validFrom: '1', validUntil: '20', revision: '1', proofHash: h('proof'), nullifier: ZERO, refundDestination: ZERO };
  const ticket = { kind: '1', id: claimTicketId({ claimDomain: domain, kind: '1', nonce: '0' }), claimDomain: domain,
    amount: '2000', destinationCommitment: h('dst'), maxFee: '300', referenceIngressN: ZERO, referenceQ: ZERO };
  const g = { claimDomain: domain, claimSequence: '2', wrapperSupply: '4000', pendingRedemptions: '2000', pendingRefunds: '0',
    heldUnissued: '1000000', reservedFees: '1300', activePayout: ZERO, intentCount: '1', ticketCount: '1', reservedRefundTickets: '1', nextTicketNonce: '1',
    intents: [intent], tickets: [{ ticket, state: '1', payoutRouteCommitment: ZERO }], revocationState: h('rev') };
  assert.equal(auditClaimGateway(g, c).liabilities, '1006000');
  for (const changed of [{ ...g, intentCount: '2' }, { ...g, intents: [] }, { ...g, reservedFees: '1000' },
    { ...g, heldUnissued: '0' }, { ...g, pendingRedemptions: '0' }, { ...g, activePayout: ticket.id }]) assert.throws(() => auditClaimGateway(changed, c));
  assert.throws(() => auditClaimGateway({ ...g, intents: Array.from({ length: 17 }, () => intent) }, c), /INGRESS_CAPACITY/);
  assert.throws(() => auditClaimGateway({ ...g, tickets: Array.from({ length: 33 }, () => g.tickets[0]) }, c), /TICKET_CAPACITY/);
});
test('debt health remains available at full receipt capacity but preserves halt and overflow refusal', () => {
  const g = { poolHeadroom: false, healthState: { halted: '0', revocationOverflowCount: '0', revokedCount: '64', receiptCount: '64', spentTagCount: '64' } };
  assertClaimHealthState(g); assert.throws(() => assertClaimHealthState(g, { allocateIngress: true }), /HEADROOM/);
  for (const [name, value] of [['halted', '1'], ['revocationOverflowCount', '1'], ['revokedCount', '65']])
    assert.throws(() => assertClaimHealthState({ ...g, healthState: { ...g.healthState, [name]: value } }));
});
test('economic snapshot excludes only volatile native heads, preserving all balance, coin, fee and identity disagreements', () => {
  const { inventory } = inventoryFixture('1'), later = copy(inventory);
  later.nativeHead = { id: h('later-head'), height: '11' };
  assert.deepEqual(claimEconomicInventory(inventory), claimEconomicInventory(later));
  for (const mutate of [i => { i.escrow.total = '1'; }, i => { i.escrow.utxos[0].locked = true; },
    i => { i.escrow.utxos[0].confirmations = '7'; }, i => { i.feeAudit.actualFees = '1'; },
    i => { i.signingUnresolved = true; }, i => { i.escrow.utxos[0].txid = h('changed-original'); }]) {
    const changed = copy(inventory); mutate(changed);
    assert.notDeepEqual(claimEconomicInventory(inventory), claimEconomicInventory(changed));
  }
});
test('four synthetic operator keys expose only scoped methods and reject fake ownership before accessors run', async () => {
  const peers = [0, 1, 2, 3].map(signerIndex => createLocalClaimOperator({ signerIndex }));
  try {
    assert.equal(new Set(peers.map(peer => peer.publicKey.x)).size, 4);
    for (const peer of peers) {
      assert.deepEqual(Object.keys(peer).sort(), ['profile', 'publicKey', 'signerIndex']);
      for (const name of ['sign', 'signDigest', 'signFrame', 'privateKey', 'exportKey', 'reader', 'store']) assert.equal(peer[name], undefined);
      for (const name of ['signFacts', 'signBacking', 'signReservation', 'signHealth']) assert.equal(typeof peer[name], 'function');
      assert.throws(() => JSON.stringify(peer), /NOT_SERIALIZABLE/);
      assert.equal(peer.status().independentOperators, false);
    }
    let read = false;
    const fake = { get publicKey() { read = true; throw Error('accessor'); } };
    assert.throws(() => createClaimOperatorQuorum({ operators: [fake, fake, fake] }), /OWNED_OPERATOR/);
    assert.throws(() => assertOwnedClaimOperatorQuorum({}, fake), /OWNED_QUORUM/); assert.equal(read, false);
    await assert.rejects(peers[0].bind(fake), /BIND_FAILED/); assert.equal(read, false);
    assert.equal(peers[0].status().poisoned, true);
    await assert.rejects(peers[0].bind(fake), /CLOSED_OR_POISONED/);
    assert.throws(() => createClaimOperatorQuorum({ operators: peers.slice(1) }), /NOT_BOUND/);
  } finally { peers.forEach(peer => peer.close()); }
  assert.throws(() => createLocalClaimOperator({ signerIndex: 0, privateKey: 'caller material' }), /EXACT_FIELDS/);
});
test('dedicated pre-sign gates bind exact unexpired ingress or active payout wires and real signatures cannot cross roles', () => {
  const { c, roles } = inventoryFixture(), domain = claimDomainCommitment(c), output = h('presign-Q');
  const intentId = claimIntentId({ claimDomain: domain, outputQ: output, amount: '1000000' });
  const gateway = { claimDomain: domain, activePayout: ZERO, intents: [{ id: intentId, state: '1', nullifier: ZERO,
    amount: '1000000', validFrom: '100', validUntil: '200', revision: '2' }], tickets: [] };
  const nativeIntent = { sourcePublicKey: roles.depositor.endpoint, recipientPublicKey: roles.escrow.endpoint,
    recentBlockhash: h('prepared-blockhash'), lamports: '1000000', wireKeyCommitment: h('owner-K') };
  const prepared = { genesis: c.nativeGenesis, intent: nativeIntent, unsignedWire: encodeSolanaBindingMessage(nativeIntent), funds: { feeLamports: '500' } };
  const args = { gateway, config: c, intentId, prepared, wireSalt: h('presign-salt'), roles, timestamp: '150' };
  const terms = auditClaimIngressPreparation(args);
  assert.equal(terms.amount, '1000000'); assert.equal(terms.actualPreparedFee, '500');
  assert.throws(() => auditClaimIngressPreparation({ ...args, timestamp: '200' }), /OWNER_EXPIRED/);
  assert.throws(() => auditClaimIngressPreparation({ ...args, prepared: { ...prepared, funds: { feeLamports: '1001' } } }), /FEE_BOUND/);
  assert.throws(() => auditClaimIngressPreparation({ ...args, prepared: { ...prepared, unsignedWire: prepared.unsignedWire + '00' } }), /UNSIGNED_WIRE/);
  assert.throws(() => auditClaimIngressPreparation({ ...args, prepared: { ...prepared, intent: { ...nativeIntent, lamports: '999999' } } }), /EXACT_AMOUNT/);
  assert.throws(() => auditClaimIngressPreparation({ ...args, prepared: { ...prepared, intent: { ...nativeIntent, sourcePublicKey: roles.recipient.endpoint } } }), /SOURCE_ROLE/);
  const message = { claimDomain: domain, intentId, revision: terms.revision, claimSequence: '2', hubStateSequence: '3', amount: terms.amount,
    wireKeyCommitment: terms.wireKeyCommitment, unsignedWireCommitment: terms.unsignedWireCommitment, maxFee: terms.maxFee,
    revocationState: h('rev'), inventoryCommitment: h('inventory'), obligationsCommitment: h('obligations'), validFrom: '150', validUntil: '180' };
  const ingressFrame = claimIngressAuthorizationFrame(message);
  assert.throws(() => claimBackingFrame(message));
  assert.throws(() => claimIngressAuthorizationFrame({ ...message, validUntil: '181' }), /WINDOW/);
  const ticketId = claimTicketId({ claimDomain: domain, kind: '1', nonce: '0' });
  const route = { endpoint: roles.recipient.endpoint, salt: h('route-salt'), quotedFee: '500', selectedInputValue: '0', changeFloor: '0', destinationFunded: true };
  const ticket = { kind: '1', id: ticketId, claimDomain: domain, amount: '1000000', maxFee: '1000', destinationCommitment: h('destination'), referenceIngressN: ZERO, referenceQ: ZERO };
  const payoutIntent = { ...nativeIntent, sourcePublicKey: roles.escrow.endpoint, recipientPublicKey: roles.recipient.endpoint,
    wireKeyCommitment: receiptKeyCommitment({ ledgerNamespace: c.ledgerNamespace, secret: claimTicketSecret({ claimDomain: domain, ticketId }) }) };
  const payoutPrepared = { ...prepared, intent: payoutIntent, unsignedWire: encodeSolanaBindingMessage(payoutIntent) };
  const payoutGateway = { ...gateway, activePayout: ticketId, tickets: [{ ticket, state: '2', payoutRouteCommitment: claimRouteCommitment(route) }] };
  const payoutArgs = { gateway: payoutGateway, config: c, ticketId, prepared: payoutPrepared, route, wireSalt: h('payout-salt'), roles };
  const payoutTerms = auditClaimPayoutPreparation(payoutArgs);
  assert.throws(() => auditClaimPayoutPreparation({ ...payoutArgs, gateway: { ...payoutGateway, activePayout: ZERO } }), /PAYOUT_FENCE/);
  assert.throws(() => auditClaimPayoutPreparation({ ...payoutArgs, route: { ...route, quotedFee: '501' } }), /EXACT_FEE/);
  assert.throws(() => auditClaimPayoutPreparation({ ...payoutArgs, prepared: { ...payoutPrepared, intent: { ...payoutIntent, wireKeyCommitment: h('other-K') } } }));
  const payoutMessage = { ...message, ticketId, revision: '1', wireKeyCommitment: payoutTerms.wireKeyCommitment,
    unsignedWireCommitment: payoutTerms.unsignedWireCommitment }; delete payoutMessage.intentId;
  const payoutFrame = claimPayoutAuthorizationFrame(payoutMessage);
  assert.notDeepEqual(ingressFrame, payoutFrame);
  const pairs = Array.from({ length: 4 }, () => generateKeyPairSync('ec', { namedCurve: 'secp256k1' }));
  const registry = { profile: FACTS_QUORUM_PROFILE, hubDomain: h('hub'), registryEpoch: '1', rulesRoot: h('root'), keys: pairs.map(k => point(k.publicKey)) };
  const verifier = createNativeQuorumHostVerifier({ registry, expectedRegistryCommitment: nativeFactsRegistryCommitment(registry) });
  const indexes = [0, 1, 2], signatures = pairs.slice(0, 3).map(pair => signLow(pair, ingressFrame));
  verifier.assertQuorumForMessage({ messageBytes: ingressFrame, indexes, signatures });
  assert.throws(() => verifier.assertQuorumForMessage({ messageBytes: payoutFrame, indexes, signatures }), /SIGNATURE_INVALID/);
  verifier.assertQuorumForMessage({ messageBytes: payoutFrame, indexes, signatures: pairs.slice(0, 3).map(pair => signLow(pair, payoutFrame)) });
});

test('public backing exports keep the same pure functions across the composition boundary', () => {
  for (const name of ['CLAIM_LIFETIME_LIMITS', 'claimEconomicInventory', 'auditClaimPayoutPreparation',
    'auditClaimGateway', 'assertClaimHealthState', 'assertClaimRoute']) {
    assert.equal(publicBacking[name], backingArithmetic[name], name);
  }
});
