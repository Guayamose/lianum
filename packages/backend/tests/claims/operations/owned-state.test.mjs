/** Pure synthetic ABI/accounting/query fixtures only. No compiler, proof worker,
 * node or deployment runs; these tests cannot establish onchain acceptance. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { CLAIM_CONFIG_SCHEMA, claimDomainCommitment, claimIntentId, claimTicketId } from '../../../src/claims/protocol/framing.mjs';
import { decodeClaimConfiguration, decodeClaimIntent, decodeClaimTicket, assertClaimAccounting,
  createOwnedClaimObserver, assertOwnedClaimObserver, ownedClaimObserverBindings } from '../../../src/claims/operations/owned-state.mjs';
import { createFlatOwnerNativeClaimObserver, assertOwnedFlatOwnerNativeClaimObserver,
  validateFlatOwnerNativeClaimQuery, decodeNativeClaimIssueEvents } from '../../../../custody/src/observers/flat-owner-native-claim-observer.mjs';
import { FLAT_OWNER_CLAIM_HANDOFF_PROFILE, flatOwnerIdentity, ownerDigest } from '../../../../custody/src/signing/flat-owner-custody.mjs';
import { derivePrivateAssetIdentity } from '../../../../engine/src/notes/private-asset-runtime.mjs';
import { publicKeccak256 } from '../../../../engine/src/cohorts/private-cohort-public-native.mjs';
import { ZERO } from '../../../src/execution/encoding/commitments.mjs';

const h = value => createHash('sha256').update('synthetic claim observer fixture/' + value).digest('hex');
const p = value => '0x' + value;
const word = value => BigInt(value).toString(16).padStart(64, '0');
const abi = values => '0x' + values.map(word).join('');
function fixtureConfig() {
  const config = Object.fromEntries(CLAIM_CONFIG_SCHEMA.map(([key, type]) => [key,
    type === 'address' ? h(key).slice(0, 40) : type === 'u256' ? '31337' : type === 'u8' ? '2'
      : type === 'u64' ? '7' : type === 'field32' ? '01' + h(key).slice(2) : h(key)]));
  config.ledgerNamespace = config.hubDomain;
  config.wrapperAssetIdentity = derivePrivateAssetIdentity(31337, p(config.wrapper), p(config.wrapperCodeHash)).slice(2);
  return config;
}
function intent(config, label, amount, state, revision = '1') {
  const domain = claimDomainCommitment(config), output = h(label), id = claimIntentId({ claimDomain: domain, outputQ: output, amount });
  return decodeClaimIntent(abi([state, p(output), amount, '5', '30', revision, p(h(label + '/proof')),
    p(state === '1' ? ZERO : h(label + '/N')), p(state === '1' ? ZERO : h(label + '/refund'))]), id, domain);
}
function ticket(config, nonce, kind, state, amount, reference = undefined) {
  const domain = claimDomainCommitment(config), id = claimTicketId({ claimDomain: domain, kind, nonce });
  return decodeClaimTicket(abi([kind, p(id), p(domain), amount, p(reference?.refundDestination ?? h('destination')),
    reference ? config.refundMaxFee : '3', p(reference?.nullifier ?? ZERO), p(reference?.output ?? ZERO)]),
  abi([state]), abi([p(state === '1' ? ZERO : h('route'))]), domain, nonce);
}
function accountingFixture() {
  const config = fixtureConfig(), intents = [intent(config, 'active', '100', '1', '2'),
    intent(config, 'issued', '200', '2'), intent(config, 'voided', '50', '3')];
  const tickets = [ticket(config, '0', '1', '1', '80'), ticket(config, '1', '2', '2', '50', intents[2])];
  return { config, view: { claimDomain: claimDomainCommitment(config), claimSequence: '10', wrapperSupply: '120', pendingRedemptions: '80',
    pendingRefunds: '50', heldUnissued: '100', reservedFees: '17', activePayout: tickets[1].ticket.id,
    intentCount: '3', ticketCount: '2', reservedRefundTickets: '1', nextTicketNonce: '2', intents, tickets } };
}

test('configuration parser enforces exact ABI words, narrow integers and bare field framing', () => {
  const config = fixtureConfig(), raw = abi(CLAIM_CONFIG_SCHEMA.map(([key, type]) => type.startsWith('u') ? config[key] : p(config[key])));
  assert.deepEqual(decodeClaimConfiguration(raw), config);
  assert.ok(Object.isFrozen(decodeClaimConfiguration(raw)));
  for (const changed of [raw + '00', raw + '\n', raw.slice(0, -64), raw.toUpperCase()])
    assert.throws(() => decodeClaimConfiguration(changed), /ABI/);
  const values = CLAIM_CONFIG_SCHEMA.map(([key, type]) => type.startsWith('u') ? config[key] : p(config[key]));
  values[2] = 1n << 160n; assert.throws(() => decodeClaimConfiguration(abi(values)), /ADDRESS/);
  values[2] = p(config.gateway); values[18] = '258'; assert.throws(() => decodeClaimConfiguration(abi(values)), /INTEGER/);
});

test('intent and ticket parsing reject absent, intermediate, retargeted and malformed states', () => {
  const config = fixtureConfig(), domain = claimDomainCommitment(config), row = intent(config, 'i', '5', '1');
  const fields = ['state', 'output', 'amount', 'validFrom', 'validUntil', 'revision', 'proofHash', 'nullifier', 'refundDestination'];
  const raw = values => abi(fields.map(key => ['output', 'proofHash', 'nullifier', 'refundDestination'].includes(key) ? p(values[key]) : values[key]));
  for (const [change, pattern] of [[{ state: '0' }, /MISSING/], [{ state: '4' }, /INTEGER/], [{ revision: '0' }, /REVISION/],
    [{ validUntil: '5' }, /WINDOW/], [{ amount: '6' }, /INTENT_ID/], [{ nullifier: h('N') }, /RESERVATION/],
    [{ state: '2' }, /ZERO/], [{ proofHash: ZERO }, /ZERO/]])
    assert.throws(() => decodeClaimIntent(raw({ ...row, ...change }), row.id, domain), pattern);
  const t = ticket(config, '0', '1', '1', '8');
  const encoded = abi(Object.entries(t.ticket).map(([key, value]) => ['kind', 'amount', 'maxFee'].includes(key) ? value : p(value)));
  assert.throws(() => decodeClaimTicket(encoded, abi(['3']), abi([p(h('route'))]), domain, '0'), /TICKET_STATE/);
  assert.throws(() => decodeClaimTicket(encoded, abi(['2']), abi([p(ZERO)]), domain, '0'), /TICKET_ROUTE/);
  assert.throws(() => decodeClaimTicket(encoded, abi(['1']), abi([p(ZERO)]), domain, '1'), /TICKET_ID/);
});

test('full lifetime history independently reconstructs supply, held claims, fees, refunds and serial payout', () => {
  const { config, view } = accountingFixture();
  assert.equal(assertClaimAccounting(view, config), undefined);
  assert.equal(assertClaimAccounting({ ...view, claimSequence: '11' }, config), undefined);
  for (const [key, value, pattern] of [['wrapperSupply', '121', /SUPPLY/], ['heldUnissued', '99', /HELD/],
    ['pendingRedemptions', '0', /REDEMPTION/], ['pendingRefunds', '0', /REFUND_TOTAL/], ['reservedFees', '18', /FEE/],
    ['reservedRefundTickets', '0', /CAPACITY/], ['nextTicketNonce', '3', /NONCE/], ['intentCount', '2', /INTENT_COUNT/],
    ['activePayout', ZERO, /ACTIVE_PAYOUT/], ['claimSequence', '12', /SEQUENCE/], ['wrapperSupply', '0120', /CANONICAL/]])
    assert.throws(() => assertClaimAccounting({ ...view, [key]: value }, config), pattern);
  const mutated = structuredClone(view); mutated.tickets[1].ticket.referenceQ = h('wrong original Q');
  assert.throws(() => assertClaimAccounting(mutated, config), /REFUND_INTENT/);
  const invalid = structuredClone(view); invalid.intents[0].state = '99';
  assert.throws(() => assertClaimAccounting(invalid, config), /INTENT_STATE/);
  const duplicate = structuredClone(view); duplicate.intents[1] = duplicate.intents[0];
  assert.throws(() => assertClaimAccounting(duplicate, config), /DUPLICATE/);
});

test('owner renewal query binds exact owner identity, claim domain, original Q/q and canonical D27 fields', () => {
  const config = fixtureConfig(), domain = { scope: config.scope, policy: config.policy, asset: config.wrapperAssetIdentity,
    hubDomain: config.hubDomain, registryCommitment: config.registryCommitment, verifierSetCommitment: h('flat verifiers'), ledgerNamespace: config.ledgerNamespace };
  const identity = flatOwnerIdentity({ pool: config.pool, domain, domainCommitment: config.poolDomain,
    assetBinding: { token: config.wrapper, codeHash: config.wrapperCodeHash } });
  const statement = { scope: config.scope, policy: config.policy, validFrom: '1', validUntil: '30', amount: '9', output: h('original Q') };
  const query = { identitySHA256: ownerDigest(identity), claimDomain: claimDomainCommitment(config), handoffIdentitySHA256: h('handoff'),
    statement, proofSHA256: h('raw D27 proof bytes'), submission: null };
  query.intentIdentitySHA256 = ownerDigest({ profile: FLAT_OWNER_CLAIM_HANDOFF_PROFILE, identitySHA256: query.identitySHA256,
    claimDomain: query.claimDomain, scope: statement.scope, policy: statement.policy, amount: statement.amount, output: statement.output });
  assert.deepEqual(validateFlatOwnerNativeClaimQuery(query, identity, config), query);
  for (const key of ['identitySHA256', 'claimDomain', 'intentIdentitySHA256'])
    assert.throws(() => validateFlatOwnerNativeClaimQuery({ ...query, [key]: h('other') }, identity, config), /CLAIM_/);
  for (const changed of [{ amount: '10' }, { output: h('replacement Q') }, { validFrom: '01' }, { validUntil: '1' }])
    assert.throws(() => validateFlatOwnerNativeClaimQuery({ ...query, statement: { ...statement, ...changed } }, identity, config));
  assert.throws(() => validateFlatOwnerNativeClaimQuery({ ...query, submission: { transactionHash: h('tx'), calldataSHA256: h('call'), reverted: true } }, identity, config), /EXACT_FIELDS/);
});

test('lookalike callbacks, synthetic parsed records and copied capabilities cannot mint production observers', async () => {
  let reads = 0;
  const runtime = { block() { reads++; }, health() { reads++; } }, claims = { flatSystem: {} };
  await assert.rejects(createOwnedClaimObserver({ runtime, claims }), /OWNED.*CLAIM|CLAIM.*OWNED/);
  await assert.rejects(createOwnedClaimObserver({ runtime, claims, read: () => accountingFixture().view }), /EXACT_FIELDS/);
  const forged = { read: () => accountingFixture().view, assertCurrent() {}, readReservation() {} };
  assert.throws(() => assertOwnedClaimObserver(forged), /OWNED_OBSERVER/);
  assert.throws(() => ownedClaimObserverBindings(forged), /OWNED_OBSERVER/);
  await assert.rejects(createFlatOwnerNativeClaimObserver({ runtime, system: claims.flatSystem, poolIndex: 0, claims, claimObserver: forged }), /OWNED_SYSTEM/);
  assert.throws(() => assertOwnedFlatOwnerNativeClaimObserver({ readNativeClaimIntent: () => ({ status: 'ACTIVE_UNISSUED' }) },
    { runtime, system: claims.flatSystem, poolIndex: 0 }), /OWNED_NATIVE_CLAIM_OBSERVER/);
  assert.equal(reads, 0);
});

test('native issue event requires the exact mint then gateway-to-pool transfer and canonical receipt anchors', () => {
  const config = fixtureConfig(), expected = { gateway: config.gateway, wrapper: config.wrapper, pool: config.pool,
    intentId: h('intent'), admissionN: h('N'), output: h('Q'), amount: '100' };
  const hashTopic = name => p(publicKeccak256(Buffer.from(name)).toString('hex'));
  const addressTopic = address => p(address.padStart(64, '0'));
  const tx = p(h('tx')), block = p(h('block'));
  const log = (address, topics, data, logIndex) => ({ address: p(address), topics, data, logIndex: '0x' + logIndex.toString(16),
    transactionHash: tx, blockHash: block, blockNumber: '0x2', transactionIndex: '0x0', removed: false });
  const transfer = hashTopic('Transfer(address,address,uint256)'), issue = hashTopic('IntentIssued(bytes32,bytes32,bytes32,uint64)');
  const receipt = { status: '0x1', transactionHash: tx, blockHash: block, blockNumber: '0x2', transactionIndex: '0x0', logs: [
    log(config.wrapper, [transfer, addressTopic('0'.repeat(40)), addressTopic(config.gateway)], abi(['100']), 0),
    log(config.wrapper, [transfer, addressTopic(config.gateway), addressTopic(config.pool)], abi(['100']), 1),
    log(config.gateway, [issue, p(expected.intentId), p(expected.admissionN)], abi([p(expected.output), '100']), 2),
  ] };
  assert.equal(decodeNativeClaimIssueEvents(receipt, expected).position, 2);
  for (const mutate of [r => { r.status = '0x0'; }, r => { r.logs[2].removed = true; },
    r => { r.logs[2].topics[2] = p(h('another N')); }, r => { r.logs[1].topics[2] = addressTopic(config.gateway); },
    r => { r.logs[0].data = abi(['99']); }, r => { r.logs[2].blockHash = p(h('another block')); },
    r => { r.logs[2].logIndex = '0x4'; }, r => { r.logs.push({ ...r.logs[0], logIndex: '0x3' }); }]) {
    const changed = structuredClone(receipt); mutate(changed); assert.throws(() => decodeNativeClaimIssueEvents(changed, expected));
  }
});
