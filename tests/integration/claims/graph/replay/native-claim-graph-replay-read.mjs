/** Diagnostic-only public parsers over a separately replayed EVM. This module
 * never creates an owned runtime, observer, operator, or current native claim. */
import assert from 'node:assert/strict';
import { encodeClaimABI } from '@lianum/engine/claims/abi';
import { decodeFlatWords, decodeFlatPoolObservation, decodeFlatHubState, decodeFlatFieldTree }
  from '../../../../../packages/backend/src/execution/account/reconciliation/flat-system-state.mjs';
import { createFlatPureMathLease } from '../../../../../packages/backend/src/execution/encoding/flat-pure-math-cache.mjs';
import { decodeClaimConfiguration, decodeClaimIntent, assertClaimAccounting }
  from '../../../../../packages/backend/src/claims/operations/owned-state.mjs';
import { claimDomainCommitment } from '@lianum/engine/claims/framing';
import { auditClaimGateway, auditClaimNativeInventory } from '../../../../../packages/backend/src/claims/operations/backing-audit.mjs';
import { ownedCustodyFeeAudit } from '../../../../../packages/backend/src/chains/shared/runtime/owned-native-custody.mjs';
import { validateSolanaBindingTransaction } from '@lianum/engine/native/native-receipt-binding';

const bare = value => value.slice(2), prefix = value => '0x' + value;
const one = raw => decodeFlatWords(raw, 1)[0];
const decimal = raw => BigInt(one(raw)).toString();
const zero = '0'.repeat(64);
function abiValue(input, value) {
  const array = /^(.*)\[([0-9]*)\]$/.exec(input.type);
  if (array) return value.map(item => abiValue({ ...input, type: array[1] }, item));
  if (input.type === 'tuple') return Object.fromEntries(input.components.map(item => [item.name, abiValue(item, value[item.name])]));
  return input.type.startsWith('uint') ? BigInt(value).toString() : value;
}

/** Only ABI-declared view/pure methods are encodable. Compiler selectors retain
 * nominal struct names for libraries; this is not an arbitrary RPC interface. */
export function diagnosticReadCalldata(artifact, signature, args) {
  const name = signature.slice(0, signature.indexOf('('));
  const entries = artifact.abi.filter(item => item.type === 'function' && item.name === name);
  assert.equal(entries.length, 1, 'REPLAY_SINGLE_READ_ABI');
  const entry = entries[0];
  assert.ok(['view', 'pure'].includes(entry.stateMutability), 'REPLAY_READ_ONLY_ABI');
  assert.equal(args.length, entry.inputs.length, 'REPLAY_READ_ARITY');
  const methods = Object.entries(artifact.evm.methodIdentifiers).filter(([key]) => key.startsWith(name + '('));
  assert.equal(methods.length, 1, 'REPLAY_SINGLE_READ_SELECTOR');
  return '0x' + methods[0][1] + encodeClaimABI(entry.inputs, args.map((value, i) => abiValue(entry.inputs[i], value))).slice(2);
}

export function createDiagnosticReadFacade({ source, contractName, address, expectedCode, codeHash, artifact, read }) {
  return Object.freeze({ source, contractName, address, expectedCode, codeHash,
    call(signature, args = [], at) { return read(address, diagnosticReadCalldata(artifact, signature, args), at); } });
}

export async function reconstructPostReservation({ pools, wrappers, gateways, authority, hub, poseidon, head, balance }) {
  const at = head.number, call = createFlatPureMathLease(poseidon, at);
  const math = {
    emptyLeaf: (domain, kind) => call('emptyLeaf(uint256,uint256)', [prefix(domain), kind]),
    nodeHash: (domain, kind, level, left, right) => call('nodeHash(uint256,uint256,uint256,uint256,uint256)',
      [prefix(domain), kind, level, prefix(left), prefix(right)]),
    revokedDigest: (domain, hubDomain, entries, count) => call('revokedDigest(uint256,bytes32,bytes32[64],uint256)',
      [prefix(domain), prefix(hubDomain), entries.map(prefix), count]),
    evidenceState: (domain, value) => call('evidenceState(uint256,(bytes32,bytes32,uint256,uint256,uint256,uint256,uint256))',
      [prefix(domain), { ...value, hubDomain: prefix(value.hubDomain), registryCommitment: prefix(value.registryCommitment),
        receiptRoot: prefix(value.receiptRoot), revokedDigest: prefix(value.revokedDigest) }]),
  };
  const flats = await Promise.all(pools.map(async (pool, i) => {
    const names = ['scope', 'policy', 'assetIdentity', 'hubDomain', 'registryCommitment', 'verifierSetCommitment', 'ledgerNamespace', 'domainCommitment', 'asset'];
    const identities = Object.fromEntries(await Promise.all(names.map(async name => [name, one(await pool.call(name + '()', [], at))])));
    const domain = Object.fromEntries(['scope', 'policy', 'hubDomain', 'registryCommitment', 'verifierSetCommitment', 'ledgerNamespace']
      .map(name => [name, bare(identities[name])])); domain.asset = bare(identities.assetIdentity);
    const d = bare(identities.domainCommitment), asset = '0x' + identities.asset.slice(-40);
    assert.equal(asset, wrappers[i].address);
    assert.equal(await call('domainCommitment(bytes32,bytes32,bytes32,bytes32,bytes32,bytes32,bytes32)',
      ['scope', 'policy', 'asset', 'hubDomain', 'registryCommitment', 'verifierSetCommitment', 'ledgerNamespace'].map(key => prefix(domain[key]))), d);
    const requests = { rawState: pool.call('canonicalState()', [], at), rawHistory: pool.call('canonicalRootHistory()', [], at),
      rawBacking: pool.call('canonicalBacking()', [], at), nodes: pool.call('treeNodes()', [], at),
      hubState: hub.call('canonicalState(address)', [pool.address], at),
      receiptNodes: hub.call('receiptTreeNodes(bytes32)', [identities.domainCommitment], at),
      authNodes: pool.call('authorizationTreeNodes()', [], at), authRoot: pool.call('authorizationRoot()', [], at),
      authCount: pool.call('authorizationLeafCount()', [], at),
      authHistory: pool.call('authorizationRootHistory()', [], at), authHistoryCount: pool.call('authorizationRootHistoryCount()', [], at),
      tokenBalance: wrappers[i].call('balanceOf(address)', [pool.address], at), nativeBalance: balance(pool.address, at) };
    const raw = Object.fromEntries(await Promise.all(Object.entries(requests).map(async ([name, value]) => [name, await value])));
    const ledger = decodeFlatPoolObservation({ header: head, blockNumber: head.number, blockHash: head.hash,
      scope: identities.scope, policy: identities.policy, asset, assetIdentity: identities.assetIdentity,
      rawState: raw.rawState, rawHistory: raw.rawHistory, rawBacking: raw.rawBacking },
    { assetBalance: BigInt(one(raw.tokenBalance)), nativeBalance: BigInt(raw.nativeBalance) });
    assert.deepEqual(decodeFlatWords(raw.nodes, 128), ledger.tree.nodes);
    const native = await decodeFlatHubState(raw.hubState, { domain, domainCommitment: d }, math);
    assert.equal(BigInt(native.state.reservedTagCapacity), 4n * BigInt(ledger.publicState.liveReservations));
    const receiptTree = await decodeFlatFieldTree(raw.receiptNodes, native.state.receiptCount, native.state.receiptRoot, d, 2, math);
    assert.deepEqual(receiptTree.leaves, native.commitments);
    const authorizationTree = await decodeFlatFieldTree(raw.authNodes, decimal(raw.authCount), bare(one(raw.authRoot)), d, 0, math, true);
    const history = decodeFlatWords(raw.authHistory, 65).map(bare), count = Number(decimal(raw.authHistoryCount));
    assert.deepEqual(history.slice(0, count), [...new Set(authorizationTree.prefixRoots)]);
    assert.ok(history.slice(count).every(value => value === zero));
    const revocationState = await call('admissionRevocationState(uint256,uint256,uint256,uint256)',
      [prefix(d), prefix(native.state.revokedDigest), native.state.revokedCount, native.state.revocationSequence]);
    return { ledger, native, authorizationCount: authorizationTree.count, domain, revocationState };
  }));
  const claims = await Promise.all(gateways.map(async (gateway, i) => {
    const config = decodeClaimConfiguration(await gateway.call('claimConfiguration()', [], at));
    const domain = claimDomainCommitment(config), fields = ['claimSequence', 'pendingRedemptions', 'pendingRefunds', 'heldUnissued',
      'reservedFees', 'activePayout', 'intentCount', 'ticketCount', 'reservedRefundTickets', 'nextTicketNonce'];
    const view = { claimDomain: domain, revocationState: flats[i].revocationState };
    await Promise.all(fields.map(async key => {
      const raw = await gateway.call(key + '()', [], at); view[key] = key === 'activePayout' ? bare(one(raw)) : decimal(raw);
    }));
    view.wrapperSupply = decimal(await wrappers[i].call('totalSupply()', [], at));
    // The fixed retained post-S transcript has no redemption tickets. Read all
    // bounded history slots, as the production observer does, before asserting.
    const [intents, tickets] = await Promise.all([['intentHistory', 16], ['ticketHistory', 32]].map(async ([name, count]) =>
      Promise.all(Array.from({ length: count }, async (_, slot) => bare(one(await gateway.call(name + '(uint256)', [slot], at)))))));
    assert.equal(view.ticketCount, '0'); assert.ok(tickets.every(value => value === zero)); view.tickets = [];
    assert.ok(intents.slice(Number(view.intentCount)).every(value => value === zero));
    view.intents = await Promise.all(intents.slice(0, Number(view.intentCount)).map(async id =>
      decodeClaimIntent(await gateway.call('intents(bytes32)', [prefix(id)], at), id, domain)));
    assertClaimAccounting(view, config);
    const obligations = auditClaimGateway(view, config);
    assert.equal(decimal(await gateway.call('liabilities()', [], at)), obligations.liabilities);
    for (const intent of view.intents) {
      assert.equal(intent.state, '2');
      assert.ok(flats[i].ledger.commitments.includes(prefix(intent.output)));
      const record = decodeFlatWords(await authority.call('reservations(bytes32)', [prefix(intent.nullifier)], at), 6);
      assert.equal(record[0].slice(-40), config.gateway); assert.equal(bare(record[1]), intent.id);
      assert.equal(BigInt(record[4]), 1n); assert.equal(BigInt(record[5]), 1n);
      assert.equal(decimal(await hub.call('admissionNullifiers(bytes32)', [prefix(intent.nullifier)], at)), '1');
    }
    return { config, view, obligations };
  }));
  assert.equal(flats[0].ledger.publicState.backedAmount, '0');
  assert.equal(flats[1].ledger.publicState.backedAmount, '3000000');
  assert.equal(flats[1].ledger.publicState.actualAssetBalance, '3000000');
  assert.equal(flats[1].ledger.publicState.liveReservations, 1);
  assert.equal(flats[1].authorizationCount, 1);
  assert.equal(flats[1].native.state.reservedTagCapacity, '4');
  assert.equal(flats[1].native.state.receiptCount, '0');
  assert.equal(flats[1].native.state.spentTagCount, '0');
  assert.equal(claims[1].view.wrapperSupply, '3000000');
  return { classification: 'ACTUAL_REPLAYED_EVM_COMPONENT_RECONSTRUCTION_NOT_OWNED_OBSERVER',
    pools: flats.map(flat => ({ ...flat.ledger.publicState, authorizationCount: flat.authorizationCount,
      reservedTagCapacity: flat.native.state.reservedTagCapacity, receiptCount: flat.native.state.receiptCount,
      spentTagCount: flat.native.state.spentTagCount })), claims: claims.map(row => ({ ...row.view, config: row.config })) };
}

/** Historic reconstruction only. The original native block/context is kept
 * verbatim; no new head, finality, live capability or native attestation exists. */
export function inspectRetainedNonemptySolInventory({ initial, native, config }) {
  assert.equal(native.transfers.length, 1);
  const transfer = native.transfers[0], observed = transfer.observation;
  assert.equal(transfer.route, 'deposit'); assert.equal(transfer.phase, 'OBSERVED_FINALIZED');
  assert.equal(transfer.broadcastAttempts, 1); assert.equal(transfer.intent.lamports, '3000000');
  const wire = validateSolanaBindingTransaction(transfer.nativeWire, transfer.intent);
  assert.equal(wire.signatureHex, transfer.nativeId); assert.equal(wire.transactionSHA256, transfer.transactionSHA256);
  assert.equal(observed.nativeId, transfer.nativeId); assert.equal(observed.nativeWire, transfer.nativeWire);
  assert.deepEqual(observed.intent, transfer.intent); assert.equal(observed.genesis, initial.genesis);
  const inventory = structuredClone(initial);
  for (const [role, amount] of [['depositor', observed.sourceAfter], ['escrow', observed.recipientAfter]]) {
    const account = inventory.accounts.find(row => row.role === role); account.total = amount; account.spendable = amount;
  }
  inventory.escrow = structuredClone(inventory.accounts.find(row => row.role === 'escrow'));
  inventory.nativeHead = { id: observed.blockId, height: observed.blockHeight, slot: observed.transactionSlot };
  inventory.feeAudit = ownedCustodyFeeAudit([{ nativeId: transfer.nativeId, route: transfer.route,
    phase: transfer.phase, amount: transfer.intent.lamports, preparedFee: transfer.preparedFee,
    actualFee: observed.feeLamports, broadcastAttempts: transfer.broadcastAttempts }]);
  const funds = auditClaimNativeInventory(inventory, config, native.metadata.custody.roles);
  assert.equal(funds.nativePrincipalAvailable, '3000000');
  return { classification: 'RETAINED_PUBLIC_NATIVE_EVIDENCE_ARITHMETIC_NOT_CURRENT_NATIVE_AUDIT',
    observedNativeEffects: 1, nativeReadsPerformed: 0, ...funds };
}
