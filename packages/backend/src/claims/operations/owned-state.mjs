/** Fixed-head claim accounting from an actual owned deployment. Parser exports
 * cannot mint the private observer brand. Native inventory is deliberately not
 * supplied here: each operator must independently inspect its owned native chain. */
import assert from 'node:assert/strict';
import {isOwnedSolanaSplCustodyV1} from '../../chains/solana/runtime/owned-solana-runtime.mjs';
import { createHash } from 'node:crypto';
import { assertOwnedNativeClaimSystem } from '../../operations/deployments/claims/deploy-native-claims.mjs';
import { assertOwnedFlatSystem } from '../../operations/deployments/system/deploy-system.mjs';
import { assertLocalEvm } from '../../chains/evm/runtime/local-evm-ownership.mjs';
import { evmRuntimeCodeHash } from '../../chains/evm/contracts/evm-code-hash.mjs';
import { FLAT_HEALTH_FIELDS } from '../../chains/shared/health/native-health.mjs';
import { createFlatSystemStateReader, decodeFlatWords } from '../../execution/account/reconciliation/flat-system-state.mjs';
import { exactRecord, bytes32, canonicalField, ZERO } from '@lianum/components/encoding/commitments';
import { CLAIM_CONFIG_SCHEMA, CLAIM_TICKET_FIELDS, claimUint, validateClaimConfig,
  claimDomainCommitment, claimVerifierSetCommitment, claimIntentId, claimTicketId,
  validateClaimTicket, claimTicketCommitment } from '@lianum/engine/claims/framing';

const owned = new WeakMap(), ZERO_ADDRESS = '0'.repeat(40);
const freeze = value => {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.values(value).forEach(freeze); Object.freeze(value);
  }
  return value;
};
const copy = value => freeze(structuredClone(value));
const prefix = value => '0x' + value;
const word = value => '0x' + BigInt(value).toString(16).padStart(64, '0');
const one = raw => decodeFlatWords(raw, 1)[0];
function bare(value, width = 32) {
  assert.ok(typeof value === 'string' && value.length === 2 + 2 * width
    && new RegExp(`^0x[0-9a-f]{${2 * width}}$`).test(value), 'CLAIM_STATE_RPC_HEX');
  return value.slice(2);
}
function integer(value, bits = 64, max = (1n << BigInt(bits)) - 1n) {
  const n = BigInt(value);
  assert.ok(n >= 0n && n <= max, 'CLAIM_STATE_INTEGER'); return n.toString();
}
function addressWord(value) {
  bare(value); assert.ok(BigInt(value) < 1n << 160n, 'CLAIM_STATE_ADDRESS'); return value.slice(-40);
}
const bool = value => integer(value, 1) === '1';
const sum = (values, key) => values.reduce((total, item) => total + BigInt(item[key]), 0n);
function sameHead(expected, actual) {
  for (const name of ['number', 'hash', 'timestamp'])
    assert.equal(actual[name], expected[name], 'CLAIM_STATE_HEAD_CHANGED');
}
async function collect(calls) {
  const names = Object.keys(calls), values = await Promise.all(Object.values(calls));
  return Object.fromEntries(names.map((name, i) => [name, values[i]]));
}

/** Pure strict ABI parser. It does not confer ownership or canonicality. */
export function decodeClaimConfiguration(raw) {
  const values = decodeFlatWords(raw, CLAIM_CONFIG_SCHEMA.length);
  return validateClaimConfig(Object.fromEntries(CLAIM_CONFIG_SCHEMA.map(([name, type], i) =>
    [name, type.startsWith('u') ? integer(values[i], Number(type.slice(1)))
      : type === 'address' ? addressWord(values[i]) : bare(values[i])])));
}
export function decodeClaimIntent(raw, id, claimDomain) {
  bytes32(id, true); bytes32(claimDomain, true);
  const w = decodeFlatWords(raw, 9), result = { id, state: integer(w[0], 8, 3n), output: bare(w[1]),
    amount: integer(w[2]), validFrom: integer(w[3]), validUntil: integer(w[4]), revision: integer(w[5]),
    proofHash: bare(w[6]), nullifier: bare(w[7]), refundDestination: bare(w[8]) };
  assert.notEqual(result.state, '0', 'CLAIM_STATE_MISSING_INTENT');
  assert.ok(BigInt(result.amount) > 0n && BigInt(result.revision) > 0n, 'CLAIM_STATE_INTENT_AMOUNT_REVISION');
  assert.ok(BigInt(result.validFrom) < BigInt(result.validUntil), 'CLAIM_STATE_INTENT_WINDOW');
  bytes32(result.proofHash, true);
  assert.equal(result.id, claimIntentId({ claimDomain, outputQ: result.output, amount: result.amount }), 'CLAIM_STATE_INTENT_ID');
  assert.equal(result.nullifier === ZERO, result.refundDestination === ZERO, 'CLAIM_STATE_INTENT_RESERVATION');
  if (result.state !== '1') bytes32(result.nullifier, true);
  return copy(result);
}
export function decodeClaimTicket(raw, rawState, rawRoute, claimDomain, nonce) {
  bytes32(claimDomain, true); claimUint(nonce);
  const w = decodeFlatWords(raw, 8), ticket = validateClaimTicket(Object.fromEntries(CLAIM_TICKET_FIELDS.map((name, i) =>
    [name, ['kind', 'amount', 'maxFee'].includes(name) ? integer(w[i], name === 'kind' ? 8 : 64) : bare(w[i])])));
  assert.equal(ticket.claimDomain, claimDomain, 'CLAIM_STATE_TICKET_DOMAIN');
  assert.equal(ticket.id, claimTicketId({ claimDomain, kind: ticket.kind, nonce }), 'CLAIM_STATE_TICKET_ID');
  assert.ok(BigInt(ticket.maxFee) > 0n, 'CLAIM_STATE_TICKET_FEE');
  const state = integer(one(rawState), 8, 4n), payoutRouteCommitment = bare(one(rawRoute));
  // OBSERVED is only an intermediate state inside one atomic discharge call.
  assert.ok(['1', '2', '4'].includes(state), 'CLAIM_STATE_TICKET_STATE');
  assert.equal(payoutRouteCommitment === ZERO, state === '1', 'CLAIM_STATE_TICKET_ROUTE');
  return copy({ ticket, state, payoutRouteCommitment });
}

/** Reconstruct every obligation from bounded lifetime history. Totals are
 * checked against independent wrapper supply, never accepted as native assets. */
export function assertClaimAccounting(view, config) {
  validateClaimConfig(config);
  for (const key of ['claimSequence', 'intentCount', 'ticketCount', 'reservedRefundTickets', 'nextTicketNonce']) claimUint(view[key]);
  for (const key of ['wrapperSupply', 'pendingRedemptions', 'pendingRefunds', 'heldUnissued', 'reservedFees']) claimUint(view[key], 256);
  assert.equal(view.claimDomain, claimDomainCommitment(config), 'CLAIM_STATE_ACCOUNTING_DOMAIN');
  assert.ok(Array.isArray(view.intents) && view.intents.length <= 16 && Array.isArray(view.tickets)
    && view.tickets.length <= 32, 'CLAIM_STATE_HISTORY_BOUND');
  for (const row of view.intents) {
    exactRecord(row, ['id', 'state', 'output', 'amount', 'validFrom', 'validUntil', 'revision', 'proofHash', 'nullifier', 'refundDestination']);
    assert.ok(['1', '2', '3'].includes(row.state), 'CLAIM_STATE_INTENT_STATE');
    for (const key of ['amount', 'validFrom', 'validUntil', 'revision']) claimUint(row[key]);
    for (const key of ['id', 'output', 'proofHash']) bytes32(row[key], true);
    for (const key of ['nullifier', 'refundDestination']) bytes32(row[key], row.state !== '1');
    assert.ok(BigInt(row.amount) > 0n && BigInt(row.revision) > 0n && BigInt(row.validFrom) < BigInt(row.validUntil), 'CLAIM_STATE_INTENT_FIELDS');
    assert.equal(row.nullifier === ZERO, row.refundDestination === ZERO, 'CLAIM_STATE_INTENT_RESERVATION');
    assert.equal(row.id, claimIntentId({ claimDomain: view.claimDomain, outputQ: row.output, amount: row.amount }), 'CLAIM_STATE_INTENT_ID');
  }
  view.tickets.forEach((row, nonce) => {
    exactRecord(row, ['ticket', 'state', 'payoutRouteCommitment']); validateClaimTicket(row.ticket);
    assert.ok(['1', '2', '4'].includes(row.state), 'CLAIM_STATE_TICKET_STATE'); bytes32(row.payoutRouteCommitment);
    assert.equal(row.payoutRouteCommitment === ZERO, row.state === '1', 'CLAIM_STATE_TICKET_ROUTE');
    assert.equal(row.ticket.claimDomain, view.claimDomain, 'CLAIM_STATE_TICKET_DOMAIN');
    assert.ok(BigInt(row.ticket.maxFee) > 0n, 'CLAIM_STATE_TICKET_FEE');
    assert.equal(row.ticket.id, claimTicketId({ claimDomain: view.claimDomain, kind: row.ticket.kind, nonce: String(nonce) }), 'CLAIM_STATE_TICKET_ID');
  });
  assert.equal(view.intents.length, Number(view.intentCount), 'CLAIM_STATE_INTENT_COUNT');
  assert.equal(view.tickets.length, Number(view.ticketCount), 'CLAIM_STATE_TICKET_COUNT');
  assert.equal(view.nextTicketNonce, view.ticketCount, 'CLAIM_STATE_TICKET_NONCE');
  assert.equal(new Set(view.intents.map(row => row.id)).size, view.intents.length, 'CLAIM_STATE_DUPLICATE_INTENT');
  assert.equal(new Set(view.tickets.map(row => row.ticket.id)).size, view.tickets.length, 'CLAIM_STATE_DUPLICATE_TICKET');
  const active = view.intents.filter(row => row.state === '1'), issued = view.intents.filter(row => row.state === '2');
  const voided = view.intents.filter(row => row.state === '3'), refunds = view.tickets.filter(row => row.ticket.kind === '2');
  const redemptions = view.tickets.filter(row => row.ticket.kind === '1'), open = view.tickets.filter(row => row.state !== '4');
  assert.equal(view.reservedRefundTickets, String(active.length), 'CLAIM_STATE_REFUND_CAPACITY');
  assert.ok(view.tickets.length + active.length <= 32, 'CLAIM_STATE_TICKET_CAPACITY');
  assert.equal(BigInt(view.heldUnissued), sum(active, 'amount'), 'CLAIM_STATE_HELD_TOTAL');
  assert.equal(BigInt(view.pendingRedemptions), sum(open.filter(row => row.ticket.kind === '1').map(row => row.ticket), 'amount'),
    'CLAIM_STATE_REDEMPTION_TOTAL');
  assert.equal(BigInt(view.pendingRefunds), sum(open.filter(row => row.ticket.kind === '2').map(row => row.ticket), 'amount'),
    'CLAIM_STATE_REFUND_TOTAL');
  assert.equal(BigInt(view.reservedFees), BigInt(active.length) * BigInt(config.refundMaxFee) + sum(open.map(row => row.ticket), 'maxFee'),
    'CLAIM_STATE_FEE_TOTAL');
  assert.equal(BigInt(view.wrapperSupply), sum(issued, 'amount') - sum(redemptions.map(row => row.ticket), 'amount'), 'CLAIM_STATE_SUPPLY_TOTAL');
  assert.equal(refunds.length, voided.length, 'CLAIM_STATE_REFUND_INTENT_COUNT');
  for (const row of voided) {
    const matches = refunds.filter(({ ticket }) => ticket.referenceIngressN === row.nullifier && ticket.referenceQ === row.output);
    assert.equal(matches.length, 1, 'CLAIM_STATE_REFUND_INTENT');
    const ticket = matches[0].ticket;
    assert.equal(ticket.amount, row.amount, 'CLAIM_STATE_REFUND_AMOUNT');
    assert.equal(ticket.destinationCommitment, row.refundDestination, 'CLAIM_STATE_REFUND_DESTINATION');
    assert.equal(ticket.maxFee, config.refundMaxFee, 'CLAIM_STATE_REFUND_FEE');
  }
  const signing = view.tickets.filter(row => row.state === '2');
  assert.ok(signing.length <= 1, 'CLAIM_STATE_MULTIPLE_PAYOUTS');
  assert.equal(view.activePayout, signing[0]?.ticket.id ?? ZERO, 'CLAIM_STATE_ACTIVE_PAYOUT');
  // Every revision, reservation and final transition advances the sequence.
  const intentSteps = view.intents.reduce((n, row) => n + BigInt(row.revision)
    + (row.nullifier === ZERO ? 0n : 1n) + (row.state === '1' ? 0n : 1n), 0n);
  const ticketSteps = view.tickets.reduce((n, row) => n + (row.ticket.kind === '1' ? 1n : 0n)
    + (row.state === '1' ? 0n : 1n) + (row.state === '4' ? 1n : 0n), 0n);
  // A signing ticket may or may not have reserved its signed native effect yet.
  const lower = intentSteps + ticketSteps + BigInt(view.tickets.filter(row => row.state === '4').length);
  assert.ok(BigInt(view.claimSequence) >= lower && BigInt(view.claimSequence) <= lower + BigInt(signing.length),
    'CLAIM_STATE_SEQUENCE_ACCOUNTING');
}

export function assertOwnedClaimObserver(observer) {
  const record = owned.get(observer);
  assert.ok(record, 'CLAIM_OWNED_OBSERVER_REQUIRED');
  assertOwnedNativeClaimSystem(record.runtime, record.claims);
}
export function ownedClaimObserverBindings(observer) {
  assertOwnedClaimObserver(observer); return owned.get(observer).bindings;
}

async function assertPins(runtime, claims, header) {
  assertOwnedNativeClaimSystem(runtime, claims); assertOwnedFlatSystem(runtime, claims.flatSystem);
  const system = claims.flatSystem, at = header.number, unique = new Map();
  for (const record of [claims.authority, ...claims.gateways, ...claims.wrappers,
    ...Object.values(claims.verifiers), ...Object.values(claims.libraries)]) {
    bare(record.address, 20); bare(record.codeHash);
    assert.ok(typeof record.expectedCode === 'string' && /^0x(?:[0-9a-f]{2})+$/.test(record.expectedCode), 'CLAIM_STATE_CODE_BYTES');
    if (unique.has(record.address)) assert.deepEqual(unique.get(record.address), [record.expectedCode, record.codeHash], 'CLAIM_STATE_CODE_PIN_CONFLICT');
    unique.set(record.address, [record.expectedCode, record.codeHash]);
  }
  await Promise.all([...unique].map(async ([target, [expected, hash]]) => {
    const actual = await runtime.code(target, at);
    assert.equal(actual, expected, 'CLAIM_STATE_CODE_CHANGED');
    assert.equal(evmRuntimeCodeHash(actual), hash, 'CLAIM_STATE_CODE_HASH');
  }));
  const expect = async (facade, signature, args, expected) =>
    assert.equal(one(await facade.call(signature, args, at)), expected, 'CLAIM_STATE_PIN_' + signature);
  await Promise.all([
    expect(claims.authority, 'hub()', [], word(system.hub.address)),
    expect(claims.authority, 'isSealed()', [], word(1)),
    expect(system.hub, 'claimAuthority()', [], word(claims.authority.address)),
  ]);
  const commitment = claimVerifierSetCommitment(claims.verifierPins);
  const verifierWords = claims.verifierPins.flatMap(pin => [word(prefix(pin.address)), prefix(pin.codeHash),
    prefix(pin.sourceCommitment), prefix(pin.keyCommitment)]);
  ['CI51', 'CO42'].forEach((role, i) => {
    assert.equal(bare(claims.verifiers[role].address, 20), claims.verifierPins[i].address, 'CLAIM_STATE_VERIFIER_ADDRESS');
    assert.equal(bare(claims.verifiers[role].codeHash), claims.verifierPins[i].codeHash, 'CLAIM_STATE_VERIFIER_CODE');
  });
  const genesis = await runtime.block('0x0');
  await runtime.assertCanonical(genesis);
  await Promise.all(claims.gateways.map(async (gateway, i) => {
    const config = validateClaimConfig(claims.configs[i]), wrapper = claims.wrappers[i], pool = system.pools[i];
    const identities = { gateway: bare(gateway.address, 20), gatewayCodeHash: bare(gateway.codeHash),
      wrapper: bare(wrapper.address, 20), wrapperCodeHash: bare(wrapper.codeHash), pool: bare(pool.address, 20),
      poolCodeHash: bare(pool.codeHash), poolDomain: bare(pool.domainCommitment), scope: bare(pool.scope), policy: bare(pool.policy),
      wrapperAssetIdentity: bare(pool.assetIdentity), hub: bare(system.hub.address, 20), hubCodeHash: bare(system.hub.codeHash),
      hubDomain: bare(system.hubDomain), ledgerNamespace: bare(system.ledgerNamespace), registryCommitment: bare(system.registryCommitment),
      evmChainId: runtime.metadata.chainId, evmGenesis: bare(genesis.hash), claimVerifierSetCommitment: commitment };
    for (const [key, expected] of Object.entries(identities)) assert.equal(config[key], expected, 'CLAIM_STATE_CONFIGURATION_' + key);
    assert.equal(pool.asset, wrapper.address, 'CLAIM_STATE_POOL_WRAPPER');
    assert.equal(pool.assetCodeHash, wrapper.codeHash, 'CLAIM_STATE_POOL_WRAPPER_CODE');
    const raw = await collect({ configuration: gateway.call('claimConfiguration()', [], at), verifiers: gateway.call('verifierConfiguration()', [], at) });
    assert.deepEqual(decodeClaimConfiguration(raw.configuration), config, 'CLAIM_STATE_CONFIGURATION');
    assert.deepEqual(decodeFlatWords(raw.verifiers, 8), verifierWords, 'CLAIM_STATE_VERIFIER_CONFIGURATION');
    bare(gateway.configurationCommitment);
    assert.ok(Array.isArray(gateway.payoutEndpointCommitments) && gateway.payoutEndpointCommitments.length === 2,
      'CLAIM_STATE_PAYOUT_PINS');
    // Native BTC/SOL are identified by family and genesis. A caller's asset
    // label must not permit two gateways to double count the same custody.
    const assetKey = '0x' + createHash('sha256').update(Buffer.from([
      word(config.nativeFamily), prefix(config.nativeGenesis)].map(v => v.slice(2)).join(''), 'hex')).digest('hex');
    await Promise.all([
      ...Object.entries({ claimDomain: prefix(claimDomainCommitment(config)), hub: word(system.hub.address), pool: word(pool.address),
        authority: word(claims.authority.address), authorityCodeHash: claims.authority.codeHash,
        codecCodeHash: claims.libraries.nativeClaimCodec.codeHash, validationCodeHash: claims.nativeSplCustodyProfile===true&&i===1?claims.libraries.nativeSplClaimValidation.codeHash:claims.libraries.nativeClaimValidation.codeHash,
        configurationCommitment: gateway.configurationCommitment,
        custodyInventoryDomain: prefix(config.custodyInventoryDomain), nativeAssetKey: assetKey, isSealed: word(1),
        MAX_INTENTS: word(16), MAX_TICKETS: word(32) }).map(([key, value]) => expect(gateway, key + '()', [], value)),
      expect(wrapper, 'gateway()', [], word(gateway.address)), expect(wrapper, 'decimals()', [], word(config.nativeFamily === '1' ? 8 : claims.nativeSplCustodyProfile===true?6:9)),
      expect(claims.authority, 'gateways(uint256)', [i], word(gateway.address)),
      expect(claims.authority, 'gatewayPool(address)', [gateway.address], word(pool.address)),
      expect(claims.authority, 'gatewayCodeHash(address)', [gateway.address], gateway.codeHash),
      expect(claims.authority, 'gatewayConfiguration(address)', [gateway.address], gateway.configurationCommitment),
      ...gateway.payoutEndpointCommitments.map((value, index) => {
        bare(value); assert.notEqual(value, prefix(config.escrowEndpointCommitment), 'CLAIM_STATE_PAYOUT_ESCROW');
        return expect(gateway, 'payoutEndpointCommitments(uint256)', [index], value);
      }),
    ]);
    assert.notEqual(...gateway.payoutEndpointCommitments, 'CLAIM_STATE_PAYOUT_DUPLICATE');
  }));
  if (claims.gateways.length === 1) await expect(claims.authority, 'gateways(uint256)', [1], word(0));
}

async function readReservationAt(claims, i, admissionN, at) {
  bytes32(admissionN, true);
  const authority = claims.authority, gateway = claims.gateways[i], hub = claims.flatSystem.hub;
  const raw = await collect({ row: authority.call('reservations(bytes32)', [prefix(admissionN)], at),
    owner: authority.call('reservationOwner(bytes32)', [prefix(admissionN)], at),
    consumed: hub.call('admissionNullifiers(bytes32)', [prefix(admissionN)], at) });
  const w = decodeFlatWords(raw.row, 6), row = { gateway: addressWord(w[0]), operationId: bare(w[1]), revision: integer(w[2]),
    wireBindingCommitment: bare(w[3]), ingress: bool(w[4]), consumed: bool(w[5]) };
  const owner = addressWord(one(raw.owner)), consumed = bool(one(raw.consumed));
  if (row.gateway === ZERO_ADDRESS) {
    assert.ok(w.every(value => BigInt(value) === 0n), 'CLAIM_STATE_EMPTY_RESERVATION');
    assert.equal(owner, ZERO_ADDRESS, 'CLAIM_STATE_EMPTY_RESERVATION_OWNER'); return null;
  }
  assert.equal(row.gateway, bare(gateway.address, 20), 'CLAIM_STATE_RESERVATION_GATEWAY');
  assert.equal(owner, row.gateway, 'CLAIM_STATE_RESERVATION_OWNER');
  assert.equal(consumed, row.consumed, 'CLAIM_STATE_CONSUMED_N');
  bytes32(row.operationId, true); bytes32(row.wireBindingCommitment, true);
  assert.ok(BigInt(row.revision) > 0n, 'CLAIM_STATE_RESERVATION_REVISION');
  const joined = await collect({ operation: authority.call('operationNullifier(address,bytes32)', [gateway.address, prefix(row.operationId)], at),
    signed: gateway.call('claimReservation(bytes32)', [prefix(row.operationId)], at) });
  assert.equal(bare(one(joined.operation)), admissionN, 'CLAIM_STATE_OPERATION_N');
  assert.deepEqual(decodeFlatWords(joined.signed, 4), [prefix(admissionN), word(row.revision), prefix(row.wireBindingCommitment), word(row.ingress ? 1 : 0)],
    'CLAIM_STATE_PERMANENT_RESERVATION');
  return copy(row);
}

async function readGateway(claims, i, flat) {
  const at = flat.header.number, gateway = claims.gateways[i], config = claims.configs[i], claimDomain = claimDomainCommitment(config);
  const getters = ['claimSequence', 'pendingRedemptions', 'pendingRefunds', 'heldUnissued', 'reservedFees', 'activePayout',
    'intentCount', 'ticketCount', 'reservedRefundTickets', 'nextTicketNonce'];
  const raw = await collect({ ...Object.fromEntries(getters.map(key => [key, gateway.call(key + '()', [], at)])),
    wrapperSupply: claims.wrappers[i].call('totalSupply()', [], at), liabilities: gateway.call('liabilities()', [], at),
    reservedReceiptCapacity: claims.authority.call('reservedReceiptCapacity(address)', [claims.flatSystem.pools[i].address], at) });
  const result = { claimDomain, revocationState: flat.admissionRevocationState };
  for (const name of [...getters, 'wrapperSupply']) result[name] = name === 'activePayout' ? bare(one(raw[name]))
    : integer(one(raw[name]), ['wrapperSupply', 'pendingRedemptions', 'pendingRefunds', 'heldUnissued', 'reservedFees'].includes(name) ? 256 : 64,
      name === 'intentCount' ? 16n : ['ticketCount', 'reservedRefundTickets'].includes(name) ? 32n : undefined);
  canonicalField(result.revocationState, true);
  const histories = await Promise.all([['intentHistory', 16], ['ticketHistory', 32]].map(async ([name, limit]) => {
    const ids = await Promise.all(Array.from({ length: limit }, (_, j) => gateway.call(name + '(uint256)', [j], at).then(one).then(bare)));
    const count = Number(result[name === 'intentHistory' ? 'intentCount' : 'ticketCount']);
    assert.ok(ids.slice(count).every(id => id === ZERO), 'CLAIM_STATE_HISTORY_PADDING');
    ids.slice(0, count).forEach(id => bytes32(id, true)); return ids.slice(0, count);
  }));
  result.intents = await Promise.all(histories[0].map(async id => decodeClaimIntent(await gateway.call('intents(bytes32)', [prefix(id)], at), id, claimDomain)));
  result.tickets = await Promise.all(histories[1].map(async (id, nonce) => {
    const item = await collect({ ticket: gateway.call('ticket(bytes32)', [prefix(id)], at), state: gateway.call('ticketState(bytes32)', [prefix(id)], at),
      route: gateway.call('payoutRouteCommitment(bytes32)', [prefix(id)], at), commitment: gateway.call('ticketCommitments(bytes32)', [prefix(id)], at) });
    const row = decodeClaimTicket(item.ticket, item.state, item.route, claimDomain, String(nonce));
    assert.equal(row.ticket.id, id, 'CLAIM_STATE_TICKET_HISTORY');
    assert.equal(bare(one(item.commitment)), claimTicketCommitment(row.ticket), 'CLAIM_STATE_TICKET_COMMITMENT'); return row;
  }));
  assertClaimAccounting(result, config);
  assert.equal(integer(one(raw.liabilities), 256), String(BigInt(result.wrapperSupply) + BigInt(result.pendingRedemptions)
    + BigInt(result.pendingRefunds) + BigInt(result.heldUnissued)), 'CLAIM_STATE_LIABILITIES');
  assert.equal(integer(one(raw.reservedReceiptCapacity), 32, 64n), result.reservedRefundTickets, 'CLAIM_STATE_RECEIPT_CAPACITY');
  assert.ok(BigInt(flat.state.receiptCount) + BigInt(result.reservedRefundTickets) <= 64n, 'CLAIM_STATE_RECEIPT_HEADROOM');
  let reservations = 0n;
  await Promise.all(result.intents.map(async row => {
    const authority = await collect({ receipt: claims.authority.call('receiptReservation(address,bytes32)', [gateway.address, prefix(row.id)], at),
      operation: claims.authority.call('operationNullifier(address,bytes32)', [gateway.address, prefix(row.id)], at) });
    const receiptState = integer(one(authority.receipt), 8, 2n);
    assert.equal(receiptState, row.state === '1' ? '1' : '2', 'CLAIM_STATE_INTENT_RECEIPT');
    const signed = decodeFlatWords(await gateway.call('claimReservation(bytes32)', [prefix(row.id)], at), 4);
    assert.equal(bare(signed[0]), row.nullifier, 'CLAIM_STATE_INTENT_N');
    assert.equal(bare(one(authority.operation)), row.nullifier, 'CLAIM_STATE_INTENT_OPERATION_N');
    if (row.nullifier === ZERO) assert.ok(signed.every(value => BigInt(value) === 0n), 'CLAIM_STATE_UNSIGNED_INTENT');
    else {
      const record = await readReservationAt(claims, i, row.nullifier, at);
      assert.ok(record && record.ingress && record.operationId === row.id, 'CLAIM_STATE_INTENT_RESERVATION');
      assert.ok(BigInt(record.revision) <= BigInt(row.revision), 'CLAIM_STATE_ORIGINAL_REVISION');
      assert.equal(record.consumed, row.state !== '1', 'CLAIM_STATE_INTENT_CONSUMED');
    }
    const present = flat.ledger.tree.leaves.slice(0, flat.ledger.tree.count).includes(prefix(row.output));
    if (row.state === '2') assert.ok(present, 'CLAIM_STATE_ISSUED_Q_ABSENT');
  }));
  await Promise.all(result.tickets.map(async row => {
    const signed = decodeFlatWords(await gateway.call('claimReservation(bytes32)', [prefix(row.ticket.id)], at), 4), n = bare(signed[0]);
    assert.equal(bare(one(await claims.authority.call('operationNullifier(address,bytes32)', [gateway.address, prefix(row.ticket.id)], at))),
      n, 'CLAIM_STATE_TICKET_OPERATION_N');
    if (n === ZERO) {
      assert.ok(signed.every(value => BigInt(value) === 0n) && row.state !== '4', 'CLAIM_STATE_UNSIGNED_TICKET');
    } else {
      assert.notEqual(row.state, '1', 'CLAIM_STATE_PENDING_SIGNED_TICKET');
      const record = await readReservationAt(claims, i, n, at);
      assert.ok(record && !record.ingress && record.operationId === row.ticket.id && record.revision === '1', 'CLAIM_STATE_TICKET_RESERVATION');
      assert.equal(record.consumed, row.state === '4', 'CLAIM_STATE_TICKET_CONSUMED'); reservations++;
    }
  }));
  const exactSequence = result.intents.reduce((n, row) => n + BigInt(row.revision) + (row.nullifier === ZERO ? 0n : 1n)
    + (row.state === '1' ? 0n : 1n), 0n) + result.tickets.reduce((n, row) => n + (row.ticket.kind === '1' ? 1n : 0n)
    + (row.state === '1' ? 0n : 1n) + (row.state === '4' ? 1n : 0n), 0n) + reservations;
  assert.equal(BigInt(result.claimSequence), exactSequence, 'CLAIM_STATE_EXACT_SEQUENCE');
  result.healthState = Object.fromEntries(FLAT_HEALTH_FIELDS.slice(0, -2).map(([name]) => [name, flat.healthState[name]]));
  const p = flat.ledger.publicState;
  result.poolHeadroom = p.leaves + 1 + 4 * p.liveReservations <= 64 && p.spent + 5 * p.liveReservations + p.outputCapacity + 1 <= 64;
  return copy(result);
}

export async function createOwnedClaimObserver(input) {
  exactRecord(input, ['runtime', 'claims']);
  const { runtime, claims } = input;
  assertOwnedNativeClaimSystem(runtime, claims); await assertLocalEvm(runtime);
  assertOwnedFlatSystem(runtime, claims.flatSystem);
  assert.ok(claims.gateways.length >= 1 && claims.gateways.length <= 2, 'CLAIM_STATE_GATEWAY_COUNT');
  for (const key of ['configs', 'wrappers', 'policies', 'nativeRuntimes'])
    assert.equal(claims[key].length, claims.gateways.length, 'CLAIM_STATE_BINDING_COUNT');
  const readers = await Promise.all(claims.gateways.map((_, poolIndex) => createFlatSystemStateReader({ runtime, system: claims.flatSystem, poolIndex })));
  const issued = new WeakMap(), currentPinChecks = new Map();
  async function assertCurrentPins(header) {
    // Public immutable-block deployment pins only. The original view ownership,
    // per-view pool checks and canonical head fences remain with every caller;
    // no native inventory, signer round or completed result is shared.
    const key = [header.number, header.hash, header.timestamp].join(':');
    let pending = currentPinChecks.get(key);
    if (!pending) {
      pending = Promise.resolve().then(() => assertPins(runtime, claims, header)).finally(() => {
        if (currentPinChecks.get(key) === pending) currentPinChecks.delete(key);
      });
      currentPinChecks.set(key, pending);
    }
    return pending;
  }
  async function readView(historical, blockNumber) {
    assertOwnedNativeClaimSystem(runtime, claims); await assertLocalEvm(runtime);
    const flats = await Promise.all(readers.map(reader => historical ? reader.readHistorical(blockNumber) : reader.read())), header = flats[0].header;
    flats.forEach(flat => sameHead(header, flat.header));
    if (historical) await assertPins(runtime, claims, header);
    else await assertCurrentPins(header);
    const gateways = await Promise.all(flats.map((flat, i) => readGateway(claims, i, flat)));
    flats.forEach(flat => assert.equal(flat.state.stateSequence, flats[0].state.stateSequence, 'CLAIM_STATE_HUB_SEQUENCE'));
    await runtime.assertCanonical(header);
    if (!historical) sameHead(header, await runtime.block());
    const view = copy({ head: flats[0].head, hubStateSequence: flats[0].state.stateSequence, gateways });
    issued.set(view, { header, flats, historical }); return view;
  }
  async function reservation(query, view, historical) {
    exactRecord(query, ['claimDomain', 'admissionN']); bytes32(query.claimDomain, true); bytes32(query.admissionN, true);
    const lookup = copy(query);
    assert.ok(issued.has(view), 'CLAIM_STATE_OWN_VIEW_REQUIRED');
    assert.equal(issued.get(view).historical, historical, 'CLAIM_STATE_VIEW_MODE');
    const check = () => historical ? observer.assertCanonical(view) : observer.assertCurrent(view);
    await check();
    const i = claims.configs.findIndex(config => claimDomainCommitment(config) === lookup.claimDomain);
    assert.ok(i >= 0, 'CLAIM_STATE_RESERVATION_DOMAIN');
    const result = await readReservationAt(claims, i, lookup.admissionN, issued.get(view).header.number);
    await check(); return result;
  }
  const observer = Object.freeze({
    read: () => readView(false),
    readHistorical: blockNumber => readView(true, blockNumber),
    async assertCurrent(view) {
      assert.ok(issued.has(view), 'CLAIM_STATE_OWN_VIEW_REQUIRED');
      assert.equal(issued.get(view).historical, false, 'CLAIM_STATE_HISTORICAL_NOT_CURRENT');
      const { header, flats } = issued.get(view);
      await assertLocalEvm(runtime); await runtime.assertCanonical(header); sameHead(header, await runtime.block());
      await Promise.all([assertCurrentPins(header), ...readers.map((reader, i) => reader.assertCurrent(flats[i]))]);
      sameHead(header, await runtime.block());
    },
    async assertCanonical(view) {
      assert.ok(issued.has(view), 'CLAIM_STATE_OWN_VIEW_REQUIRED');
      const { header, flats } = issued.get(view);
      await assertLocalEvm(runtime); await runtime.assertCanonical(header);
      await Promise.all([assertPins(runtime, claims, header), ...readers.map((reader, i) => reader.assertCanonical(flats[i]))]);
      await runtime.assertCanonical(header);
    },
    readReservation: (query, view) => reservation(query, view, false),
    readHistoricalReservation: (query, view) => reservation(query, view, true),
    async assertUnrevoked(query, view) {
      exactRecord(query, ['claimDomain', 'nativeGid']);
      bytes32(query.claimDomain, true); bytes32(query.nativeGid, true);
      await observer.assertCurrent(view);
      const index = claims.configs.findIndex(config => claimDomainCommitment(config) === query.claimDomain);
      assert.ok(index >= 0, 'CLAIM_STATE_RESERVATION_DOMAIN');
      const flat = issued.get(view).flats[index];
      assert.ok(!flat.revokedEntries.slice(0, Number(flat.state.revokedCount)).includes(query.nativeGid), 'CLAIM_GID_REVOKED');
      await observer.assertCurrent(view);
    },
  });
  const bindings = Object.freeze({ runtime, system: claims, registry: claims.flatSystem.registry, configs: claims.configs,
    policies: claims.policies, nativeRuntimes: claims.nativeRuntimes, registeredRules:claims.registeredRules??claims.policies.map(p=>p.rule),graphSolanaRule:claims.graphSolanaRule??null, journalRoot: claims.journalRoot });
  owned.set(observer, { runtime, claims, bindings });
  // Creating an observer is not enough: require a complete pinned canonical
  // reconstruction before publishing its capability to private operators.
  const initial = await observer.read(); await observer.assertCurrent(initial);
  for(const native of claims.nativeRuntimes)if(isOwnedSolanaSplCustodyV1(native))await native.initializeOriginalClaimRegistryV1(observer);
  await observer.assertCurrent(initial);return observer;
}
