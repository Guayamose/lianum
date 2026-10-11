/** Owner request codecs shared by custody and process orchestration.
 * Pure validation and framing; no worker, proof backend or runtime authority. */
import { createPublicKey } from 'node:crypto';
import { isAbsolute } from 'node:path';
import { types } from 'node:util';
import { FUNDED_DOMAINS, fundedHash } from '../../graph/funded-graph.mjs';
import { uintBE } from '../../../notes/private-note-encoding.mjs';
export const NATIVE_OWNER_PROTOCOL = 'LIANUM_SYNTHETIC_NATIVE_OWNER_V1';
export const NATIVE_OWNER_MAX_REQUEST_BYTES = 64 * 1024;
export const NATIVE_OWNER_ACTION_TEMPLATE_FIELDS = Object.freeze(['chainDomain', 'signerIdentity',
  'sourceCommitment', 'destinationCommitment', 'amount', 'custodyKind', 'custodyCommitment',
  'executionFrom', 'executionUntil']);
const CONFIG_FIELDS = ['scope', 'policy', 'asset', 'hubDomain', 'registryCommitment', 'operationId',
  'epoch', 'fundingNotBefore', 'fundingValidUntil', 'settleBefore', 'fundingAmount', 'nodes', 'vault'];
const ZERO = '0'.repeat(64);
export const nativeOwnerError = code => Object.assign(new Error(code), { code });
export function nativeOwnerNeed(condition, code) { if (!condition) throw nativeOwnerError(code); }
export function nativeOwnerExact(value, keys) {
  nativeOwnerNeed(value && !types.isProxy(value) && Object.getPrototypeOf(value) === Object.prototype,
    'PAEG_NATIVE_OWNER_EXACT_FIELDS');
  const own = Reflect.ownKeys(value);
  nativeOwnerNeed(own.length === keys.length && own.every(key => typeof key === 'string' && keys.includes(key))
    && keys.every(key => { const d = Object.getOwnPropertyDescriptor(value, key); return d && d.enumerable && Object.hasOwn(d, 'value'); }),
  'PAEG_NATIVE_OWNER_EXACT_FIELDS');
}
export function nativeOwnerArray(value, maximum, minimum = 0) {
  nativeOwnerNeed(Array.isArray(value) && !types.isProxy(value) && Object.getPrototypeOf(value) === Array.prototype
    && value.length >= minimum && value.length <= maximum, 'PAEG_NATIVE_OWNER_ARRAY');
  nativeOwnerNeed(Reflect.ownKeys(value).length === value.length + 1
    && Array.from({ length: value.length }, (_, i) => Object.getOwnPropertyDescriptor(value, String(i)))
      .every(d => d && d.enumerable && Object.hasOwn(d, 'value')), 'PAEG_NATIVE_OWNER_ARRAY');
}
export function nativeOwnerHash(value, allowZero = false) {
  nativeOwnerNeed(typeof value === 'string' && value.length === 64 && /^[0-9a-f]{64}$/.test(value)
    && (allowZero || value !== ZERO), 'PAEG_NATIVE_OWNER_HASH');
  return value;
}
export function nativeOwnerUint(value, bits = 64, positive = false) {
  nativeOwnerNeed(typeof value === 'string' && value.length <= Math.ceil(bits / 3)
    && /^(0|[1-9][0-9]*)$/.test(value) && !/\s/.test(value), 'PAEG_NATIVE_OWNER_INTEGER');
  const number = BigInt(value);
  nativeOwnerNeed(number < (1n << BigInt(bits)) && (!positive || number > 0n), 'PAEG_NATIVE_OWNER_INTEGER');
  return value;
}
const nodeId = value => {
  nativeOwnerNeed(typeof value === 'string' && value.length <= 64 && /^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(value)
    && !/\s/.test(value), 'PAEG_NATIVE_OWNER_NODE_ID'); return value;
};

/** Same wave-by-wave canonical topological order as compileGraph. No temporary
 * graph with made-up action commitments is created to discover payout slots. */
export function canonicalNativeOwnerNodes(nodes) {
  nativeOwnerArray(nodes, 4, 1);
  const byId = new Map();
  for (const node of nodes) {
    nativeOwnerNeed(node && !types.isProxy(node) && Object.getPrototypeOf(node) === Object.prototype
      && ['id', 'dependsOn'].every(key => Object.hasOwn(Object.getOwnPropertyDescriptor(node, key) ?? {}, 'value')),
    'PAEG_NATIVE_OWNER_NODE_FIELDS');
    nodeId(node.id); nativeOwnerArray(node.dependsOn, 3); node.dependsOn.forEach(nodeId);
    nativeOwnerNeed(!byId.has(node.id) && new Set(node.dependsOn).size === node.dependsOn.length,
      'PAEG_NATIVE_OWNER_DUPLICATE_GRAPH'); byId.set(node.id, node);
  }
  for (const node of nodes) nativeOwnerNeed(node.dependsOn.every(id => id !== node.id && byId.has(id)),
    'PAEG_NATIVE_OWNER_GRAPH_EDGE');
  const remaining = new Set(byId.keys()), complete = new Set(), result = [];
  while (remaining.size) {
    const ready = [...remaining].filter(id => byId.get(id).dependsOn.every(id => complete.has(id))).sort();
    nativeOwnerNeed(ready.length > 0, 'PAEG_NATIVE_OWNER_GRAPH_CYCLE');
    for (const id of ready) { result.push(byId.get(id)); remaining.delete(id); complete.add(id); }
  }
  return result;
}

export function normalizeNativeOwnerPrepare(input) {
  nativeOwnerExact(input, CONFIG_FIELDS);
  const config = Object.fromEntries(CONFIG_FIELDS.slice(0, 6).map(key => [key, nativeOwnerHash(input[key])]));
  for (const key of ['epoch', 'fundingNotBefore', 'fundingValidUntil', 'settleBefore']) config[key] = nativeOwnerUint(input[key]);
  config.fundingAmount = nativeOwnerUint(input.fundingAmount, 64, true);
  nativeOwnerNeed(BigInt(config.fundingNotBefore) < BigInt(config.fundingValidUntil)
    && BigInt(config.fundingValidUntil) <= BigInt(config.settleBefore), 'PAEG_NATIVE_OWNER_DEADLINES');
  nativeOwnerExact(input.vault, ['path', 'password']);
  nativeOwnerNeed(typeof input.vault.path === 'string' && input.vault.path.isWellFormed()
    && isAbsolute(input.vault.path) && Buffer.byteLength(input.vault.path) <= 4096 && !input.vault.path.includes('\0'),
  'PAEG_NATIVE_OWNER_VAULT_PATH');
  nativeOwnerNeed(typeof input.vault.password === 'string' && input.vault.password.isWellFormed()
    && Buffer.byteLength(input.vault.password) >= 1 && Buffer.byteLength(input.vault.password) <= 1024,
  'PAEG_NATIVE_OWNER_VAULT_PASSWORD');
  config.vault = { path: input.vault.path, password: input.vault.password };
  nativeOwnerArray(input.nodes, 4, 1);
  config.nodes = input.nodes.map(node => {
    nativeOwnerExact(node, ['id', 'dependsOn', 'evidencePolicy', 'actionTemplate', 'recipientOffer']);
    nodeId(node.id); nativeOwnerArray(node.dependsOn, 3); node.dependsOn.forEach(nodeId);
    nativeOwnerExact(node.actionTemplate, NATIVE_OWNER_ACTION_TEMPLATE_FIELDS);
    const actionTemplate = {};
    for (const key of NATIVE_OWNER_ACTION_TEMPLATE_FIELDS) {
      actionTemplate[key] = key === 'custodyKind' ? node.actionTemplate[key]
        : key === 'amount' ? nativeOwnerUint(node.actionTemplate[key], 128, true)
          : ['executionFrom', 'executionUntil'].includes(key) ? nativeOwnerUint(node.actionTemplate[key])
            : nativeOwnerHash(node.actionTemplate[key]);
    }
    nativeOwnerNeed(actionTemplate.custodyKind === 1 && BigInt(actionTemplate.executionFrom) < BigInt(actionTemplate.executionUntil)
      && BigInt(actionTemplate.executionUntil) <= BigInt(config.settleBefore), 'PAEG_NATIVE_OWNER_ACTION_INTERVAL');
    nativeOwnerExact(node.recipientOffer, ['x', 'y', 'value', 'secret', 'randomness']);
    const recipientOffer = Object.fromEntries(['x', 'y', 'secret', 'randomness']
      .map(key => [key, nativeOwnerHash(node.recipientOffer[key])]));
    recipientOffer.value = nativeOwnerUint(node.recipientOffer.value, 64, true);
    try { createPublicKey({ format: 'jwk', key: { kty: 'EC', crv: 'secp256k1',
      x: Buffer.from(recipientOffer.x, 'hex').toString('base64url'), y: Buffer.from(recipientOffer.y, 'hex').toString('base64url') } }); }
    catch { throw nativeOwnerError('PAEG_NATIVE_OWNER_RECIPIENT_KEY'); }
    return { id: node.id, dependsOn: [...node.dependsOn], evidencePolicy: nativeOwnerHash(node.evidencePolicy), actionTemplate, recipientOffer };
  });
  canonicalNativeOwnerNodes(config.nodes);
  const total = config.nodes.reduce((sum, node) => sum + BigInt(node.recipientOffer.value), 0n);
  nativeOwnerNeed(total <= BigInt(config.fundingAmount), 'PAEG_NATIVE_OWNER_INSUFFICIENT_FUNDING');
  return config;
}

/** Slot-bound funded payout formula. The recipient can derive the same rho
 * independently; neither a signing key nor an owner graph is required. */
export function nativeOwnerPayoutNote(config, offer, slot) {
  nativeOwnerNeed(Number.isInteger(slot) && !Object.is(slot, -0) && slot >= 0 && slot < 4, 'PAEG_NATIVE_OWNER_SLOT');
  const rho = fundedHash(FUNDED_DOMAINS.payoutOrigin, [
    ...['scope', 'policy', 'asset', 'operationId'].map(key => Buffer.from(nativeOwnerHash(config[key]), 'hex')),
    uintBE(slot, 1), Buffer.from(nativeOwnerHash(offer.randomness), 'hex'),
  ]);
  return { type: 4, rho, x: nativeOwnerHash(offer.x), y: nativeOwnerHash(offer.y),
    value: nativeOwnerUint(offer.value, 64, true), secret: nativeOwnerHash(offer.secret) };
}
export function normalizeNativeOwnerAuthorize(input) {
  nativeOwnerExact(input, ['invoiceSignatures']); nativeOwnerArray(input.invoiceSignatures, 4, 1);
  const invoiceSignatures = input.invoiceSignatures.map(value => {
    nativeOwnerNeed(typeof value === 'string' && value.length === 128 && /^[0-9a-f]{128}$/.test(value),
      'PAEG_NATIVE_OWNER_INVOICE_SIGNATURE'); return value;
  });
  return { invoiceSignatures };
}
