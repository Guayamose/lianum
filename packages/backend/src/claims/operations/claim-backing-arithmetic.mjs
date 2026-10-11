import {NATIVE_SPL_CLAIM_INTENT_PROFILE_V1,encodeNativeSplClaimUnsignedWireV1} from '../../chains/solana/dispatch/native-spl-custody-codec-v1.mjs';
import {OWNED_NATIVE_SPL_INVENTORY_PROFILE_V1,assertNativeSplClaimPreparationV1,auditNativeSplClaimInventoryV1} from './native-spl-backing-audit-v1.mjs';
/** Pure arithmetic over complete owned snapshots. Supplying these records does
 * not turn them into trusted observations or mint/signing capabilities. */
import assert from 'node:assert/strict';
import { exactRecord, bytes32, ZERO } from '@lianum/components/encoding/commitments';
import { cloneInput, frozenInput } from '@lianum/components/plain-input';
import { summarizeOwnedBitcoinCoins, ownedCustodyFeeAudit, assertOwnedCustodyIntent,
  auditOwnedSolanaNonceInfrastructure } from '../../chains/shared/runtime/owned-native-custody.mjs';
import { encodeBitcoinBinding, encodeSolanaBindingMessage, receiptKeyCommitment } from '@lianum/engine/native/native-receipt-binding';
import { encodeSolanaNonceBindingMessage } from '../../chains/solana/runtime/owned-solana-nonce-binding.mjs';
import { claimUint, claimDomainCommitment, claimIntentId, claimTicketCommitment, validateClaimTicket,
  nativeClaimEndpointCommitment, claimDestinationCommitment, claimTicketSecret } from '@lianum/engine/claims/framing';
import { claimFrame, claimHash, claimRouteCommitment, claimUnsignedWireCommitment } from '@lianum/engine/claims/permits';

export const CLAIM_LIFETIME_LIMITS = Object.freeze({ ingress: 16, tickets: 32, originalNativeIdentities: 48 });
const u = value => claimUint(value, 256);
const sum = rows => rows.reduce((n, row) => n + u(row.amount), 0n);
function checkedEqual(value, actual, code) { assert.equal(u(value), actual, code); }
/** Equal economic facts at independently observed fresh native heads. Exclude
 * ONLY the volatile head metadata. Even BTC confirmations remain exact; any
 * balance, UTXO, lock, fee, unknown status or native identity change disagrees. */
export function claimEconomicInventory(raw) {
  const value = cloneInput(raw); bytes32(value.nativeHead.id, true); claimUint(value.nativeHead.height);
  if (value.family === '2') claimUint(value.nativeHead.slot);
  delete value.nativeHead; return frozenInput(value);
}
/** Pure checks only; the operator additionally requires the live owned
 * runtime.assertPrepared window before and after its independent full audit. */
export function auditClaimIngressPreparationBase({ gateway, config, intentId, prepared: raw, wireSalt, roles, timestamp, infrastructure = null }) {
  const prepared = cloneInput(raw); exactRecord(prepared, ['genesis', 'intent', 'unsignedWire', 'funds']);
  const spl=config.nativeFamily==='2'&&prepared.intent.profile===NATIVE_SPL_CLAIM_INTENT_PROFILE_V1;if(spl)assertNativeSplClaimPreparationV1(prepared,config);
  const intent = gateway.intents.find(row => row.id === intentId);
  assert.ok(intent && intent.state === '1' && intent.nullifier === ZERO, 'CLAIM_PRESIGN_PENDING_INTENT');
  assert.equal(gateway.activePayout, ZERO, 'CLAIM_PRESIGN_PAYOUT_FENCE');
  assert.ok(claimUint(intent.validFrom) <= claimUint(timestamp) && claimUint(timestamp) < claimUint(intent.validUntil), 'CLAIM_PRESIGN_OWNER_EXPIRED');
  assert.equal(prepared.genesis, config.nativeGenesis, 'CLAIM_PRESIGN_GENESIS');
  assertOwnedCustodyIntent('deposit', roles, config.nativeFamily, prepared.intent);
  const btc = config.nativeFamily === '1', amount = btc ? prepared.intent.amountSatoshi : spl ? prepared.intent.amount : prepared.intent.lamports;
  assert.equal(amount, intent.amount, 'CLAIM_PRESIGN_EXACT_AMOUNT');
  assert.equal(prepared.unsignedWire, btc ? encodeBitcoinBinding(prepared.intent) : spl ? encodeNativeSplClaimUnsignedWireV1(prepared.intent) : encodeSolanaBindingMessage(prepared.intent), 'CLAIM_PRESIGN_EXACT_UNSIGNED_WIRE');
  const fee = btc ? prepared.intent.feeSatoshi : prepared.funds.feeLamports;
  assert.ok(claimUint(fee) > 0n && claimUint(fee) <= claimUint(config.refundMaxFee), 'CLAIM_PRESIGN_FEE_BOUND');
  bytes32(prepared.intent.wireKeyCommitment, true); bytes32(wireSalt, true);
  const unsignedWireCommitment = claimUnsignedWireCommitment({ claimDomain: gateway.claimDomain, intentId, revision: intent.revision,
    wireKeyCommitment: prepared.intent.wireKeyCommitment, unsignedWire: prepared.unsignedWire, wireSalt });
  return frozenInput({ revision: intent.revision, amount, wireKeyCommitment: prepared.intent.wireKeyCommitment,
    unsignedWireCommitment, maxFee: config.refundMaxFee, actualPreparedFee: fee });
}
export function auditClaimPayoutPreparation({ gateway, config, ticketId, prepared: raw, route, wireSalt, roles, requireSigning = true }) {
  const prepared = cloneInput(raw); exactRecord(prepared, ['genesis', 'intent', 'unsignedWire', 'funds']);
  const spl=config.nativeFamily==='2'&&prepared.intent.profile===NATIVE_SPL_CLAIM_INTENT_PROFILE_V1;if(spl)assertNativeSplClaimPreparationV1(prepared,config);
  const row = gateway.tickets.find(entry => entry.ticket.id === ticketId), ticket = row?.ticket;
  assert.equal(row?.state, requireSigning ? '2' : '1', 'CLAIM_PRESIGN_EXACT_TICKET_STATE');
  assert.equal(gateway.activePayout, requireSigning ? ticketId : ZERO, 'CLAIM_PRESIGN_EXACT_PAYOUT_FENCE');
  assert.equal(prepared.genesis, config.nativeGenesis, 'CLAIM_PRESIGN_GENESIS');
  assertOwnedCustodyIntent(ticket.kind === '2' ? 'refund' : 'redeem', roles, config.nativeFamily, prepared.intent);
  const btc = config.nativeFamily === '1', amount = btc ? prepared.intent.amountSatoshi : spl ? prepared.intent.amount : prepared.intent.lamports;
  assert.equal(amount, ticket.amount, 'CLAIM_PRESIGN_EXACT_AMOUNT');
  const noncePayout = !btc && Object.hasOwn(prepared.intent, 'nonceAccountPublicKey');
  assert.equal(prepared.unsignedWire, btc ? encodeBitcoinBinding(prepared.intent)
    : noncePayout ? encodeSolanaNonceBindingMessage(prepared.intent) : spl ? encodeNativeSplClaimUnsignedWireV1(prepared.intent) : encodeSolanaBindingMessage(prepared.intent),
  'CLAIM_PRESIGN_EXACT_UNSIGNED_WIRE');
  assert.equal(prepared.intent.wireKeyCommitment, receiptKeyCommitment({ ledgerNamespace: config.ledgerNamespace,
    secret: claimTicketSecret({ claimDomain: gateway.claimDomain, ticketId }) }), 'CLAIM_PRESIGN_TICKET_K');
  const fee = btc ? prepared.intent.feeSatoshi : prepared.funds.feeLamports;
  assert.ok(claimUint(fee) > 0n && claimUint(fee) <= claimUint(ticket.maxFee), 'CLAIM_PRESIGN_FEE_BOUND');
  assert.equal(route.quotedFee, fee, 'CLAIM_PRESIGN_EXACT_FEE');
  assert.equal(route.endpoint, btc ? prepared.intent.recipientScript : prepared.intent.recipientPublicKey, 'CLAIM_PRESIGN_EXACT_DESTINATION');
  if (btc) assert.equal(route.selectedInputValue, prepared.intent.sourceSatoshi, 'CLAIM_PRESIGN_EXACT_INPUT');
  if (requireSigning) assert.equal(claimRouteCommitment(route), row.payoutRouteCommitment, 'CLAIM_PRESIGN_ORIGINAL_ROUTE');
  const unsignedWireCommitment = !requireSigning && wireSalt === undefined ? null
    : claimUnsignedWireCommitment({ claimDomain: gateway.claimDomain, intentId: ticketId,
      revision: '1', wireKeyCommitment: prepared.intent.wireKeyCommitment, unsignedWire: prepared.unsignedWire, wireSalt });
  return frozenInput({ revision: '1', amount, wireKeyCommitment: prepared.intent.wireKeyCommitment,
    unsignedWireCommitment, maxFee: ticket.maxFee, actualPreparedFee: fee });
}
export function auditClaimGateway(raw, config) {
  const g = cloneInput(raw);
  assert.equal(g.claimDomain, claimDomainCommitment(config), 'CLAIM_GATEWAY_DOMAIN');
  assert.ok(Array.isArray(g.intents) && g.intents.length <= CLAIM_LIFETIME_LIMITS.ingress, 'CLAIM_INGRESS_CAPACITY');
  assert.ok(Array.isArray(g.tickets) && g.tickets.length <= CLAIM_LIFETIME_LIMITS.tickets, 'CLAIM_TICKET_CAPACITY');
  checkedEqual(g.intentCount, BigInt(g.intents.length), 'CLAIM_COMPLETE_INTENT_HISTORY');
  checkedEqual(g.ticketCount, BigInt(g.tickets.length), 'CLAIM_COMPLETE_TICKET_HISTORY');
  const ids = new Set();
  for (const row of g.intents) {
    assert.ok(['1', '2', '3'].includes(row.state), 'CLAIM_INTENT_STATE');
    bytes32(row.id, true); assert.ok(!ids.has(row.id), 'CLAIM_DUPLICATE_INTENT'); ids.add(row.id);
    assert.equal(row.id, claimIntentId({ claimDomain: g.claimDomain, outputQ: row.output, amount: row.amount }), 'CLAIM_INTENT_ID');
    assert.ok(claimUint(row.revision) > 0n && claimUint(row.validFrom) < claimUint(row.validUntil), 'CLAIM_INTENT_WINDOW');
    bytes32(row.proofHash, true); bytes32(row.nullifier); bytes32(row.refundDestination);
  }
  ids.clear();
  for (const row of g.tickets) {
    const ticket = validateClaimTicket(row.ticket);
    assert.ok(['1', '2', '3', '4'].includes(row.state), 'CLAIM_TICKET_STATE');
    assert.equal(ticket.claimDomain, g.claimDomain, 'CLAIM_TICKET_DOMAIN');
    assert.ok(!ids.has(ticket.id), 'CLAIM_DUPLICATE_TICKET'); ids.add(ticket.id);
    bytes32(row.payoutRouteCommitment); claimTicketCommitment(ticket);
  }
  const held = g.intents.filter(row => row.state === '1');
  const pending = g.tickets.filter(row => row.state !== '4').map(row => row.ticket);
  checkedEqual(g.heldUnissued, sum(held), 'CLAIM_HELD_COUNTER');
  checkedEqual(g.pendingRedemptions, sum(pending.filter(row => row.kind === '1')), 'CLAIM_REDEEM_COUNTER');
  checkedEqual(g.pendingRefunds, sum(pending.filter(row => row.kind === '2')), 'CLAIM_REFUND_COUNTER');
  checkedEqual(g.reservedRefundTickets, BigInt(held.length), 'CLAIM_REFUND_CAPACITY_COUNTER');
  assert.ok(g.tickets.length + held.length <= CLAIM_LIFETIME_LIMITS.tickets, 'CLAIM_RESERVED_TICKET_CAPACITY');
  const fees = BigInt(held.length) * claimUint(config.refundMaxFee) + pending.reduce((n, row) => n + claimUint(row.maxFee), 0n);
  checkedEqual(g.reservedFees, fees, 'CLAIM_EXACT_FEE_RESERVATIONS');
  claimUint(g.claimSequence); claimUint(g.nextTicketNonce); bytes32(g.revocationState, true); bytes32(g.activePayout);
  const active = g.tickets.filter(row => ['2', '3'].includes(row.state));
  assert.ok(active.length <= 1, 'CLAIM_MULTIPLE_ACTIVE_PAYOUTS');
  assert.equal(g.activePayout, active[0]?.ticket.id ?? ZERO, 'CLAIM_ACTIVE_PAYOUT_FENCE');
  const liabilities = u(g.wrapperSupply) + u(g.pendingRedemptions) + u(g.pendingRefunds) + u(g.heldUnissued);
  assert.ok(liabilities < 1n << 256n, 'CLAIM_LIABILITY_OVERFLOW');
  return frozenInput({ liabilities: liabilities.toString(), reservedFees: fees.toString(),
    remainingIngress: String(16 - g.intents.length), remainingTickets: String(32 - g.tickets.length - held.length) });
}

/** Audit a non-dual-nonce snapshot after the ingress layer has removed and
 * independently checked its infrastructure. SPL retains its own fixed audit. */
export function auditClaimNativeInventoryBase(raw, config, roles) {
  if(raw.profile===OWNED_NATIVE_SPL_INVENTORY_PROFILE_V1)return auditNativeSplClaimInventoryV1(raw,config,roles);
  return auditClaimStandardNativeInventory(raw, config, roles);
}

/** BTC/SOL economic balances only. The composition layer owns profile dispatch. */
export function auditClaimStandardNativeInventory(raw, config, roles) {
  const inventory = cloneInput(raw);
  assert.equal(inventory.family, config.nativeFamily, 'CLAIM_CUSTODY_FAMILY');
  assert.equal(inventory.genesis, config.nativeGenesis, 'CLAIM_CUSTODY_GENESIS');
  assert.equal(inventory.asset, config.nativeAsset, 'CLAIM_CUSTODY_ASSET');
  bytes32(inventory.nativeHead.id, true); claimUint(inventory.nativeHead.height);
  assert.equal(typeof inventory.signingUnresolved, 'boolean', 'CLAIM_SIGNING_STATUS');
  assert.equal(inventory.signingUnresolved, false, 'CLAIM_UNKNOWN_KEY_USE');
  assert.equal(inventory.escrow.role, 'escrow', 'CLAIM_ESCROW_ROLE');
  assert.equal(inventory.escrow.endpoint, roles.escrow.endpoint, 'CLAIM_ESCROW_ENDPOINT');
  assert.equal(nativeClaimEndpointCommitment({ family: config.nativeFamily, genesis: config.nativeGenesis,
    asset: config.nativeAsset, endpoint: inventory.escrow.endpoint }), config.escrowEndpointCommitment, 'CLAIM_ESCROW_PIN');
  assert.equal(inventory.accounts.length, 3, 'CLAIM_ALL_CUSTODY_ACCOUNTS');
  for (const role of ['depositor', 'escrow', 'recipient']) {
    const accounts = inventory.accounts.filter(row => row.role === role);
    assert.equal(accounts.length, 1, 'CLAIM_CUSTODY_ACCOUNT_DUPLICATE');
    assert.equal(accounts[0].endpoint, roles[role].endpoint, 'CLAIM_CUSTODY_ROLE_CHANGED');
    assert.equal(accounts[0].address, roles[role].address, 'CLAIM_CUSTODY_ADDRESS_CHANGED');
  }
  assert.deepEqual(inventory.escrow, inventory.accounts.find(row => row.role === 'escrow'), 'CLAIM_ESCROW_SNAPSHOT_CHANGED');
  const fees = ownedCustodyFeeAudit(inventory.feeAudit.transfers);
  assert.deepEqual(fees, inventory.feeAudit, 'CLAIM_ACTUAL_FEE_ACCOUNTING');
  const seen = new Set();
  for (const row of fees.transfers) {
    assert.ok(!seen.has(row.nativeId), 'CLAIM_DUPLICATE_NATIVE_TRANSFER'); seen.add(row.nativeId);
    assert.ok(!String(row.phase).includes('ADVERSE'), 'CLAIM_NATIVE_ADVERSE');
  }
  const prefund = inventory.syntheticPrefunding;
  assert.equal(prefund.classification, 'SYNTHETIC_LOCAL_FEE_SURPLUS_NOT_USER_BACKING', 'CLAIM_SYNTHETIC_SURPLUS_CLASSIFICATION');
  const initialSurplus = u(prefund.amount), spentFees = u(fees.escrowActualFees);
  assert.ok(initialSurplus >= spentFees, 'CLAIM_SYNTHETIC_FEE_SURPLUS_EXHAUSTED');
  const surplus = initialSurplus - spentFees;
  let total, spendable, rent = 0n;
  if (config.nativeFamily === '1') {
    const computed = summarizeOwnedBitcoinCoins(inventory.escrow.utxos);
    for (const [name, value] of Object.entries(computed)) assert.equal(inventory.escrow[name], value, 'CLAIM_UTXO_SUMMARY');
    for (const coin of inventory.escrow.utxos) assert.equal(coin.script, roles.escrow.endpoint, 'CLAIM_UTXO_CUSTODY');
    total = u(computed.total); spendable = u(computed.spendable);
  } else {
    assert.equal(inventory.finality, 'finalized', 'CLAIM_SOL_FINALITY'); claimUint(inventory.nativeHead.slot);
    if (inventory.nonceInfrastructure) {
      auditOwnedSolanaNonceInfrastructure(inventory.nonceInfrastructure);
      const infrastructure = inventory.nonceInfrastructure;
      assert.equal(infrastructure.authorityPublicKey, roles.escrow.endpoint, 'CLAIM_NONCE_ESCROW_AUTHORITY');
      for (const account of inventory.accounts) {
        assert.notEqual(account.endpoint, infrastructure.payerPublicKey, 'CLAIM_NONCE_PAYER_NOT_PRINCIPAL');
        assert.notEqual(account.endpoint, infrastructure.nonceAccountPublicKey, 'CLAIM_NONCE_RENT_NOT_PRINCIPAL');
      }
      // Its payer grant and nonce rent are operational resources. The values
      // below still use only the three economic roles and escrow fee surplus.
    }
    assert.equal(inventory.escrow.exists, true, 'CLAIM_SOL_ESCROW_MISSING');
    total = u(inventory.escrow.total); spendable = u(inventory.escrow.spendable);
    assert.equal(spendable, total, 'CLAIM_SOL_ACCOUNT_BALANCE'); rent = u(inventory.escrow.rentExemptMinimum);
    assert.ok(rent > 0n && spendable >= rent, 'CLAIM_SOL_RENT'); spendable -= rent;
  }
  // Initial synthetic liquidity is deliberately excluded from user principal.
  // Fees reduce this separate reserve; rent remains unavailable to both pools.
  assert.ok(surplus >= rent, 'CLAIM_SURPLUS_RENT_DEFICIT');
  const feeSurplus = surplus - rent;
  const availableFee = spendable < feeSurplus ? spendable : feeSurplus;
  const principal = spendable - availableFee;
  return frozenInput({ nativeTotal: total.toString(), nativeSpendable: spendable.toString(),
    nativePrincipalAvailable: principal.toString(), feeReserveAvailable: availableFee.toString(),
    syntheticFeeLiquiditySurplus: feeSurplus.toString(), rentExcluded: rent.toString(),
    unresolvedPreparedFees: fees.unresolvedEscrowPreparedFees, actualFees: fees.actualFees });
}

export function assertClaimHealthState(gateway, { allocateIngress = false } = {}) {
  const h = gateway.healthState;
  assert.equal(h.halted, '0', 'CLAIM_HALTED');
  assert.equal(h.revocationOverflowCount, '0', 'CLAIM_REVOCATION_OVERFLOW');
  assert.ok(claimUint(h.revokedCount, 32) <= 64n, 'CLAIM_REVOKED_CAPACITY');
  for (const name of ['receiptCount', 'spentTagCount']) assert.ok(claimUint(h[name], 32) <= 64n, 'CLAIM_HEALTH_COUNT');
  if (allocateIngress) {
    assert.equal(gateway.poolHeadroom, true, 'CLAIM_POOL_HEADROOM');
    assert.ok(claimUint(h.receiptCount, 32) < 64n && claimUint(h.spentTagCount, 32) < 64n, 'CLAIM_INGRESS_HEADROOM');
  }
}
export function assertClaimRoute({ config, claimDomain, amount, destinationCommitment, maxFee, route, inventory, roles, prepared = null }) {
  claimRouteCommitment(route);
  assert.ok(claimUint(amount) > 0n && claimUint(maxFee) > 0n && claimUint(route.quotedFee) > 0n
    && claimUint(route.quotedFee) <= claimUint(maxFee), 'CLAIM_ROUTE_FEE');
  assert.ok([roles.depositor.endpoint, roles.recipient.endpoint].includes(route.endpoint), 'CLAIM_ROUTE_OWNED_DESTINATION');
  const endpoint = nativeClaimEndpointCommitment({ family: config.nativeFamily, genesis: config.nativeGenesis,
    asset: config.nativeAsset, endpoint: route.endpoint });
  const chainDomain = claimHash(claimFrame('LIANUM/evidence-chain/1', [Buffer.from(config.nativeFamily === '1' ? 'BTC' : 'SOL'),
    Buffer.from(config.nativeGenesis, 'hex'), Buffer.from(config.nativeAsset, 'hex')]));
  assert.equal(claimDestinationCommitment({ claimDomain, nativeChainDomain: chainDomain, endpoint,
    amount, maxFee, salt: route.salt }), destinationCommitment, 'CLAIM_ROUTE_DESTINATION');
  if (config.nativeFamily === '1') {
    assert.ok(claimUint(amount) >= 546n && claimUint(route.changeFloor) >= 546n, 'CLAIM_BTC_OUTPUT_FLOOR');
    assert.ok(claimUint(route.selectedInputValue) >= claimUint(amount) + claimUint(maxFee) + claimUint(route.changeFloor), 'CLAIM_BTC_DELIVERABILITY');
    assert.ok(inventory.escrow.utxos.some(coin => coin.amount === route.selectedInputValue && coin.spendable && coin.solvable
      && coin.safe && (!coin.locked || (prepared && coin.txid === prepared.intent.sourceTxid && coin.vout === prepared.intent.sourceVout
        && coin.amount === prepared.intent.sourceSatoshi))
      && claimUint(coin.confirmations) >= (coin.coinbase ? 101n : 6n)), 'CLAIM_BTC_ONE_INPUT_REQUIRED');
  } else {
    assert.equal(route.selectedInputValue, '0', 'CLAIM_SOL_ROUTE_INPUT'); assert.equal(route.changeFloor, '0', 'CLAIM_SOL_ROUTE_CHANGE');
    const account = inventory.accounts.find(row => row.endpoint === route.endpoint);
    if(inventory.profile===OWNED_NATIVE_SPL_INVENTORY_PROFILE_V1){assert.ok(route.destinationFunded&&account?.exists&&account.mint==='EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v','CLAIM_SPL_DESTINATION_INITIALIZED');}
    else assert.ok(route.destinationFunded && account?.exists && u(account.total) >= u(account.rentExemptMinimum), 'CLAIM_SOL_DESTINATION_FUNDED');
  }
}
