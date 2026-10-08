/** Portable byte-identical preparation for the original capacity-four PAEG.
 * Fixed PC23 balance source/change/recovery only. Data encoding grants neither
 * a backend WeakMap capability nor U/S proof, ledger membership or dispatch.
 * The genuine backend must recompile through compileFundedGraph before using
 * this data. This module receives no signing key, root, callbacks or entropy. */
import { sha256 } from '@noble/hashes/sha2.js';
import { localBalanceCommitmentMessageV1, localNoteHexBytesV1, localNoteUintBytesV1 } from './balance-note-codec-v1.mjs';
const ZERO = '0'.repeat(64), PROFILE = 'LIANUM_PAEG_FUNDED_4_V1';
const HASH_FIELDS = ['scope', 'policy', 'asset', 'operationId', 'inputCommitment', 'inputNullifier',
  'reservationIntent', 'graphCommitment', 'treeRoot', 'reserveCommitment', 'reserveNullifier', 'changeCommitment'];
const TIMES = ['fundingNotBefore', 'fundingValidUntil', 'settleBefore'];
function need(condition, code = 'MOBILE_FUNDED_OWNER_ENCODING_INVALID') { if (!condition) throw Error(code); }
function exact(value, fields) {
  need(value && Object.getPrototypeOf(value) === Object.prototype && Reflect.ownKeys(value).length === fields.length);
  for (const field of fields) { const row = Object.getOwnPropertyDescriptor(value, field);
    need(row?.enumerable && Object.hasOwn(row, 'value')); }
}
const hex = bytes => Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
const hash = (value, zero = false) => { const bytes = localNoteHexBytesV1(value); need(zero || value !== ZERO); return bytes; };
const uint = value => localNoteUintBytesV1(value);
const ascii = value => new TextEncoder().encode(value);
const concat = parts => { const result = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
  let cursor = 0; for (const part of parts) { result.set(part, cursor); cursor += part.length; } return result; };
function frame(tag, fields) {
  return concat([ascii(tag), ...fields].flatMap(value => [localNoteUintBytesV1(String(value.length), 4), value]));
}
const digest = (tag, fields) => hex(sha256(frame(tag, fields)));
const scopes = value => ['scope', 'policy', 'asset'].map(name => hash(value[name]));
const cm = (scope, policy, opening) => hex(sha256(localBalanceCommitmentMessageV1(scope, policy, opening)));
function opening(value, allowEmpty = false) {
  exact(value, ['type', 'rho', 'x', 'y', 'value', 'secret']); need(value.type === 4);
  ['rho', 'x', 'y', 'secret'].forEach(name => hash(value[name], true)); uint(value.value);
  need(allowEmpty || BigInt(value.value) > 0n);
  if (value.value === '0') ['rho', 'x', 'y', 'secret'].forEach(name => need(value[name] === ZERO));
  return { ...value };
}
/** Original PC15 SHA nullifier; no reduction into the BN254 field. */
export function localFundedSpendNullifierV1(scope, commitment, secret) {
  const tag = ascii('PC15/note-spend/1');
  return hex(sha256(concat([localNoteUintBytesV1(String(tag.length), 2), tag,
    ...[scope, commitment, secret].flatMap(value => [localNoteUintBytesV1('32', 4), hash(value, true)])])));
}
export function normalizeLocalFundedProposalV1(value) {
  exact(value, ['scope', 'policy', 'asset', 'operationId', 'budget', ...TIMES, 'nodes']);
  scopes(value); hash(value.operationId); uint(value.budget); need(BigInt(value.budget) > 0n);
  TIMES.forEach(name => uint(value[name]));
  need(BigInt(value.fundingNotBefore) < BigInt(value.fundingValidUntil)
    && BigInt(value.fundingValidUntil) <= BigInt(value.settleBefore));
  const nodes = ordered(value.nodes).map(node => ({ id: node.id, chainDomain: node.chainDomain,
    evidencePolicy: node.evidencePolicy, actionCommitment: node.actionCommitment,
    dependsOn: [...node.dependsOn].sort(), payout: { ...node.payout } }));
  need(nodes.reduce((sum, node) => sum + BigInt(node.payout.value), 0n) === BigInt(value.budget), 'MOBILE_FUNDED_PAYOUT_SUM');
  return { scope: value.scope, policy: value.policy, asset: value.asset, operationId: value.operationId,
    budget: value.budget, fundingNotBefore: value.fundingNotBefore,
    fundingValidUntil: value.fundingValidUntil, settleBefore: value.settleBefore, nodes };
}
function ordered(nodes) {
  need(Array.isArray(nodes) && nodes.length >= 1 && nodes.length <= 4);
  const byId = new Map();
  for (const node of nodes) {
    exact(node, ['id', 'chainDomain', 'evidencePolicy', 'actionCommitment', 'dependsOn', 'payout']);
    need(typeof node.id === 'string' && /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/.test(node.id) && !byId.has(node.id));
    ['chainDomain', 'evidencePolicy', 'actionCommitment'].forEach(name => hash(node[name]));
    need(Array.isArray(node.dependsOn) && node.dependsOn.every(id => typeof id === 'string')
      && new Set(node.dependsOn).size === node.dependsOn.length);
    exact(node.payout, ['x', 'y', 'value', 'secret', 'randomness']);
    ['x', 'y', 'secret', 'randomness'].forEach(name => hash(node.payout[name], true));
    uint(node.payout.value); need(BigInt(node.payout.value) > 0n);
    byId.set(node.id, node);
  }
  for (const node of nodes) for (const id of node.dependsOn) need(id !== node.id && byId.has(id));
  const remaining = new Set(byId.keys()), complete = new Set(), result = [];
  while (remaining.size) {
    const ready = [...remaining].filter(id => byId.get(id).dependsOn.every(id => complete.has(id))).sort(); need(ready.length);
    for (const id of ready) { result.push(byId.get(id)); remaining.delete(id); complete.add(id); }
  }
  return result;
}
function graph(input, nodes, payouts, reservationIntent, recoveryCommitment) {
  const indexes = new Map(nodes.map((node, index) => [node.id, index]));
  const actual = nodes.map((node, index) => {
    const dependencyIndexes = node.dependsOn.map(id => indexes.get(id)).sort((a, b) => a - b);
    need(dependencyIndexes.every(i => i < index));
    const dependencyMask = dependencyIndexes.reduce((mask, i) => mask | (1 << i), 0);
    const salt = digest('LIANUM/PAEG/node-salt/1', [hash(input.graphNonce), ascii(node.id)]);
    const payoutCommitment = cm(input.scope, input.policy, payouts[index]);
    const commitment = digest('LIANUM/PAEG/node/1', [hash(input.scope), hash(input.policy), hash(input.operationId),
      new Uint8Array([index, dependencyMask]), hash(node.chainDomain), hash(node.evidencePolicy),
      hash(node.actionCommitment), hash(payoutCommitment), hash(salt)]);
    return { id: node.id, chainDomain: node.chainDomain, evidencePolicy: node.evidencePolicy,
      actionCommitment: node.actionCommitment, dependsOn: [...node.dependsOn].sort(), payoutCommitment,
      index, dependencyIndexes, dependencyMask, salt, commitment };
  });
  const leaves = actual.map(node => node.commitment);
  while (leaves.length < 4) leaves.push(digest('LIANUM/PAEG/empty-node/1', [hash(input.scope), hash(input.policy),
    hash(input.operationId), new Uint8Array([leaves.length]), hash(input.graphNonce)]));
  const pair = (left, right) => digest('LIANUM/PAEG/tree/1', [hash(left), hash(right)]);
  const treeRoot = pair(pair(leaves[0], leaves[1]), pair(leaves[2], leaves[3]));
  const graphCommitment = digest('LIANUM/PAEG/graph/1', [ascii('LIANUM_PAEG_GRAPH_4_V1'), hash(input.scope),
    hash(input.policy), hash(input.operationId), uint(input.settleBefore), hash(reservationIntent), hash(recoveryCommitment),
    hash(treeRoot), new Uint8Array([actual.length]), hash(input.graphNonce)]);
  return { graphCommitment, ownerWitness: { nonce: input.graphNonce, activeCount: actual.length, treeRoot, nodes: actual, leaves } };
}
function fields(statement) {
  exact(statement, ['profile', ...HASH_FIELDS, 'outputs', 'recoveryCommitment', ...TIMES]); need(statement.profile === PROFILE);
  need(Array.isArray(statement.outputs) && statement.outputs.length === 4);
  TIMES.forEach(name => uint(statement[name]));
  need(BigInt(statement.fundingNotBefore) < BigInt(statement.fundingValidUntil)
    && BigInt(statement.fundingValidUntil) <= BigInt(statement.settleBefore));
  return [...HASH_FIELDS.map(name => hash(statement[name])), ...statement.outputs.map(value => hash(value)),
    hash(statement.recoveryCommitment), ...TIMES.map(name => uint(statement[name]))];
}
/** Exact 139-word intermediate signed statement; this is not the final U
 * envelope/Poseidon domain nor the original ledger's SHA root. */
export function localFundedAuthorizationWordsV1(statement) {
  const values = fields(statement);
  return values.flatMap((bytes, index) => index < 17 ? Array.from({ length: 8 }, (_, word) => {
    let value = 0; for (const byte of bytes.subarray(word * 4, word * 4 + 4)) value = value * 256 + byte;
    return String(value);
  }) : [BigInt('0x' + hex(bytes)).toString()]);
}
export function localFundedOwnerFrameV1(statement) { return frame('LIANUM/PAEG/funded-authorize/1', [ascii(PROFILE), ...fields(statement)]); }
export function localFundedInvoiceFrameV1(statement, node, slot) {
  fields(statement); need(Number.isInteger(slot) && slot >= 0 && slot < 4);
  return frame('LIANUM/PAEG/transfer-quote/1', [ascii(PROFILE), ...scopes(statement), hash(statement.operationId),
    new Uint8Array([slot]), hash(node.chainDomain), hash(node.evidencePolicy), hash(node.actionCommitment),
    hash(node.payoutCommitment), uint(statement.settleBefore)]);
}
/** All private openings are data for an eventual scoped original worker.
 * The output remains private and is not an account authorization capability. */
export function compileLocalFundedBalanceGraphV1(input) {
  exact(input, ['scope', 'policy', 'asset', 'operationId', 'budget', ...TIMES,
    'reservationNonce', 'reserveSecret', 'graphNonce', 'inputNote', 'changeNote', 'recoveryNote', 'nodes', 'paddingSalts']);
  scopes(input); hash(input.operationId); ['reservationNonce', 'reserveSecret', 'graphNonce'].forEach(name => hash(input[name]));
  uint(input.budget); need(BigInt(input.budget) > 0n);
  TIMES.forEach(name => uint(input[name]));
  need(BigInt(input.fundingNotBefore) < BigInt(input.fundingValidUntil) && BigInt(input.fundingValidUntil) <= BigInt(input.settleBefore));
  const source = opening(input.inputNote), change = opening(input.changeNote, true), recovery = opening(input.recoveryNote);
  need(BigInt(source.value) === BigInt(input.budget) + BigInt(change.value), 'MOBILE_FUNDED_CONSERVATION');
  need(recovery.value === input.budget, 'MOBILE_FUNDED_RECOVERY_VALUE');
  need(Array.isArray(input.paddingSalts) && input.paddingSalts.length === 4); input.paddingSalts.forEach(value => hash(value));
  const nodes = ordered(input.nodes), inputCommitment = cm(input.scope, input.policy, source);
  const inputNullifier = localFundedSpendNullifierV1(input.scope, inputCommitment, source.secret);
  const recoveryCommitment = cm(input.scope, input.policy, recovery);
  const reservationIntent = digest('LIANUM/PAEG/reservation-intent/1', [ascii(PROFILE), ...scopes(input), hash(input.operationId),
    hash(input.reservationNonce), uint(input.budget), uint(input.settleBefore), hash(recoveryCommitment), hash(input.reserveSecret)]);
  const payoutNotes = nodes.map((node, slot) => ({ type: 4,
    rho: digest('LIANUM/PAEG/payout-origin/1', [...scopes(input), hash(input.operationId), new Uint8Array([slot]), hash(node.payout.randomness, true)]),
    x: node.payout.x, y: node.payout.y, value: node.payout.value, secret: node.payout.secret }));
  need(payoutNotes.reduce((sum, note) => sum + BigInt(note.value), 0n) === BigInt(input.budget), 'MOBILE_FUNDED_PAYOUT_SUM');
  const preparedGraph = graph(input, nodes, payoutNotes, reservationIntent, recoveryCommitment);
  const graphCommitment = preparedGraph.graphCommitment;
  const reserveCommitment = digest('LIANUM/PAEG/reserved-note/1', [ascii(PROFILE), ...scopes(input), hash(reservationIntent), hash(graphCommitment)]);
  const changeCommitment = change.value === '0'
    ? digest('LIANUM/PAEG/empty-change/1', [ascii(PROFILE), ...scopes(input), hash(inputNullifier), hash(input.operationId), hash(input.reservationNonce)])
    : cm(input.scope, input.policy, change);
  const outputs = Array.from({ length: 4 }, (_, slot) => slot < nodes.length ? cm(input.scope, input.policy, payoutNotes[slot])
    : digest('LIANUM/PAEG/empty-payout/1', [...scopes(input), hash(graphCommitment), new Uint8Array([slot]), hash(input.paddingSalts[slot])]));
  const actual = [inputCommitment, reserveCommitment, changeCommitment, recoveryCommitment, ...outputs];
  need(new Set(actual).size === actual.length, 'MOBILE_FUNDED_DISTINCT_NOTES');
  const authorizationStatement = { profile: PROFILE, scope: input.scope, policy: input.policy, asset: input.asset,
    operationId: input.operationId, inputCommitment, inputNullifier, reservationIntent, graphCommitment,
    treeRoot: preparedGraph.ownerWitness.treeRoot, reserveCommitment,
    reserveNullifier: localFundedSpendNullifierV1(input.scope, reserveCommitment, input.reserveSecret),
    changeCommitment, outputs, recoveryCommitment, fundingNotBefore: input.fundingNotBefore,
    fundingValidUntil: input.fundingValidUntil, settleBefore: input.settleBefore };
  fields(authorizationStatement);
  return { authorizationStatement,
    admissionTag: digest('LIANUM/PAEG/reservation-admission/1', [ascii(PROFILE), ...scopes(input), hash(input.operationId)]),
    ownerWitness: { budget: input.budget, reservationNonce: input.reservationNonce, reserveSecret: input.reserveSecret,
      inputNote: source, changeNote: change, recoveryNote: recovery,
      payouts: payoutNotes.map((note, slot) => ({ ...note, randomness: nodes[slot].payout.randomness })),
      paddingSalts: input.paddingSalts.map((salt, slot) => slot < nodes.length ? ZERO : salt), graph: preparedGraph.ownerWitness } };
}

/** Byte-identical native V2 action commitment from the original fixed quote.
 * Does not authenticate delivery or grant dispatch. */
function nativeAmount128(value) {
  need(typeof value === 'string' && /^(0|[1-9][0-9]{0,38})$/.test(value));
  let amount = BigInt(value); need(amount > 0n && amount < (1n << 128n));
  const out = new Uint8Array(16);
  for (let i = 15; i >= 0; i--) { out[i] = Number(amount & 255n); amount >>= 8n; }
  return out;
}
export function localNativeTransferActionCommitmentV1(action) {
  const fields = ['chainDomain','signerIdentity','sourceCommitment','destinationCommitment','amount','custodyKind',
    'custodyCommitment','executionFrom','executionUntil','settleBefore','receiptKeyCommitment','receiptRho','deliveryRiskCommitment','actionSalt'];
  exact(action, fields); need(action.custodyKind === 1);
  need(BigInt(action.executionFrom) < BigInt(action.executionUntil) && BigInt(action.executionUntil) <= BigInt(action.settleBefore));
  return digest('LIANUM/PAEG/native-transfer-action/2', [ascii('LIANUM_PAEG_NATIVE_4_V2'), ...fields.map(name =>
    name === 'amount' ? nativeAmount128(action[name])
      : name === 'custodyKind' ? localNoteUintBytesV1(String(action[name]), 1)
        : ['executionFrom','executionUntil','settleBefore'].includes(name) ? uint(action[name]) : hash(action[name]))]);
}
