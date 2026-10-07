/**
 * Owner-private preparation for reusable balance custody and exact native C129.
 *
 * This module creates native action blindings, never source notes or signing
 * keys. The custody owner chooses an existing funded note and constructs A0.
 * Persist the complete preparation in authenticated owner storage before
 * acknowledging preparation. On retry, validate and reuse that record; a
 * missing or invalid record is an error, not permission to create new salts.
 *
 * The record, signed graph, and returned capsule capability remain owner-only.
 * Give each actor only its selected role packet under the existing C129
 * non-collusion assumptions. These host encoders neither generate proofs nor
 * establish chain acceptance, native finality, or independent OS isolation.
 */
import { createPublicKey, randomBytes } from 'node:crypto';
import { canonical } from '../privacy.mjs';
import { walletNoteCommitment } from '../private-wallet-note-encoding.mjs';
import {
  NATIVE_OWNER_ACTION_TEMPLATE_FIELDS, canonicalNativeOwnerNodes,
  nativeOwnerExact, nativeOwnerHash, nativeOwnerNeed, nativeOwnerPayoutNote,
  nativeOwnerUint,
} from './native-owner.mjs';
import { compileFundedGraph, fundedAuthorizationWords } from './funded-graph.mjs';
import {
  nativeReceiptKeyCommitment, nativeTransferActionCommitment,
  prepareNativeCapsules,
} from './native-capsules.mjs';
import {
  nativeDeliveryRiskCommitment, NATIVE_ADMISSION_LOSS_CLAUSE,
} from './native-admission.mjs';
import {
  nativeRecipientInvoiceRequest, nativeRecipientInvoiceMessage,
} from './native-recipient-custody.mjs';

export const GENERIC_BALANCE_NATIVE_PREPARATION_SCHEMA = 'LIANUM_GENERIC_BALANCE_NATIVE_PREPARATION_V1';

const HASH_FIELDS = ['scope', 'policy', 'asset', 'hubDomain', 'registryCommitment', 'operationId'];
const TIME_FIELDS = ['fundingNotBefore', 'fundingValidUntil', 'settleBefore'];
const CONFIG_FIELDS = [...HASH_FIELDS, ...TIME_FIELDS, 'nodes'];
const SALT_FIELDS = ['targetSalt', 'localCapsuleSalt', 'dependencyCapsuleSalt'];
const UNUSED_ACTIVE_PADDING = '0'.repeat(63) + '1';

// canonical rejects proxies, accessors, hidden fields, sparse arrays and cycles
// before any caller-controlled values are read. All records are JSON-only.
const copy = value => JSON.parse(canonical(value));
const same = (actual, expected, code) => nativeOwnerNeed(canonical(actual) === canonical(expected), code);
const need = (condition, suffix) => nativeOwnerNeed(condition, 'PAEG_BALANCE_NATIVE_' + suffix);
const freshHash = () => randomBytes(32).toString('hex');

function count(value, minimum, maximum) {
  need(Array.isArray(value) && value.length >= minimum && value.length <= maximum, 'COUNT');
}

/** Exact current capacity-four native configuration, with no deposit or Vault. */
export function normalizeGenericBalanceNativeConfig(input) {
  const config = copy(input);
  nativeOwnerExact(config, CONFIG_FIELDS);
  HASH_FIELDS.forEach(field => nativeOwnerHash(config[field]));
  TIME_FIELDS.forEach(field => nativeOwnerUint(config[field]));
  need(BigInt(config.fundingNotBefore) < BigInt(config.fundingValidUntil)
    && BigInt(config.fundingValidUntil) <= BigInt(config.settleBefore), 'DEADLINES');
  count(config.nodes, 1, 4);

  for (const node of config.nodes) {
    nativeOwnerExact(node, ['id', 'dependsOn', 'evidencePolicy', 'actionTemplate', 'recipientOffer']);
    nativeOwnerHash(node.evidencePolicy);
    nativeOwnerExact(node.actionTemplate, NATIVE_OWNER_ACTION_TEMPLATE_FIELDS);
    const action = node.actionTemplate;
    for (const field of NATIVE_OWNER_ACTION_TEMPLATE_FIELDS) {
      if (field === 'custodyKind') need(action[field] === 1, 'CUSTODY_KIND');
      else if (field === 'amount') nativeOwnerUint(action[field], 128, true);
      else if (['executionFrom', 'executionUntil'].includes(field)) nativeOwnerUint(action[field]);
      else nativeOwnerHash(action[field]);
    }
    need(BigInt(action.executionFrom) < BigInt(action.executionUntil)
      && BigInt(action.executionUntil) <= BigInt(config.settleBefore), 'ACTION_INTERVAL');
    nativeOwnerExact(node.recipientOffer, ['x', 'y', 'value', 'secret', 'randomness']);
    for (const field of ['x', 'y', 'secret', 'randomness']) nativeOwnerHash(node.recipientOffer[field]);
    nativeOwnerUint(node.recipientOffer.value, 64, true);
    try {
      createPublicKey({ format: 'jwk', key: {
        kty: 'EC', crv: 'secp256k1',
        x: Buffer.from(node.recipientOffer.x, 'hex').toString('base64url'),
        y: Buffer.from(node.recipientOffer.y, 'hex').toString('base64url'),
      } });
    } catch {
      need(false, 'RECIPIENT_KEY');
    }
  }

  // The graph codec sorts ready nodes in waves and treats edge order as a set.
  config.nodes = canonicalNativeOwnerNodes(config.nodes).map(node => ({
    ...node, dependsOn: [...node.dependsOn].sort(),
  }));
  nativeOwnerUint(config.nodes.reduce((sum, node) => sum + BigInt(node.recipientOffer.value), 0n).toString(), 64, true);
  return config;
}

function riskCommitment(config, action, payout, salt) {
  return nativeDeliveryRiskCommitment({
    clause: NATIVE_ADMISSION_LOSS_CLAUSE,
    hubDomain: config.hubDomain,
    registryCommitment: config.registryCommitment,
    chainDomain: action.chainDomain,
    sourceCommitment: action.sourceCommitment,
    destinationCommitment: action.destinationCommitment,
    amount: action.amount,
    scope: config.scope,
    policy: config.policy,
    asset: config.asset,
    payoutCommitment: walletNoteCommitment(config.scope, config.policy, payout).toString('hex'),
    settleBefore: config.settleBefore,
    salt,
  });
}

/** Call once inside the owner, before its atomic preparation write. */
export function createGenericBalanceNativePreparation(input) {
  const config = normalizeGenericBalanceNativeConfig(input);
  const nodes = config.nodes.map((node, slot) => {
    const payout = nativeOwnerPayoutNote(config, node.recipientOffer, slot);
    const receiptSpendSecret = freshHash();
    const deliveryRiskSalt = freshHash();
    const action = {
      ...node.actionTemplate,
      settleBefore: config.settleBefore,
      receiptKeyCommitment: nativeReceiptKeyCommitment(config.hubDomain, receiptSpendSecret),
      receiptRho: freshHash(),
      deliveryRiskCommitment: riskCommitment(config, node.actionTemplate, payout, deliveryRiskSalt),
      actionSalt: freshHash(),
    };
    return { id: node.id, action, receiptSpendSecret, deliveryRiskSalt, payout };
  });
  const slotSalts = Array.from({ length: 4 }, () => Object.fromEntries(SALT_FIELDS.map(field => [field, freshHash()])));
  return validateGenericBalanceNativePreparation({
    schema: GENERIC_BALANCE_NATIVE_PREPARATION_SCHEMA, config, nodes, slotSalts,
  }, config);
}

/**
 * Validate every derived relation and return a detached JSON record. The caller
 * supplies expectedConfig on request replay to detect changed terms. Storage
 * authentication binds the original randomness; representation checks cannot
 * establish its entropy or authenticate a record supplied by another party.
 */
export function validateGenericBalanceNativePreparation(input, expectedConfig) {
  const record = copy(input);
  nativeOwnerExact(record, ['schema', 'config', 'nodes', 'slotSalts']);
  need(record.schema === GENERIC_BALANCE_NATIVE_PREPARATION_SCHEMA, 'SCHEMA');
  const config = normalizeGenericBalanceNativeConfig(record.config);
  same(record.config, config, 'PAEG_BALANCE_NATIVE_CANONICAL_CONFIG');
  if (expectedConfig !== undefined) {
    same(config, normalizeGenericBalanceNativeConfig(expectedConfig), 'PAEG_BALANCE_NATIVE_CONFIG_BINDING');
  }
  count(record.nodes, config.nodes.length, config.nodes.length);
  record.nodes.forEach((node, slot) => {
    nativeOwnerExact(node, ['id', 'action', 'receiptSpendSecret', 'deliveryRiskSalt', 'payout']);
    const expected = config.nodes[slot];
    need(node.id === expected.id, 'NODE_BINDING');
    nativeOwnerHash(node.receiptSpendSecret);
    nativeOwnerHash(node.deliveryRiskSalt);
    same(node.payout, nativeOwnerPayoutNote(config, expected.recipientOffer, slot), 'PAEG_BALANCE_NATIVE_PAYOUT_BINDING');
    nativeTransferActionCommitment(node.action);
    NATIVE_OWNER_ACTION_TEMPLATE_FIELDS.forEach(field => {
      need(node.action[field] === expected.actionTemplate[field], 'ACTION_BINDING');
    });
    need(node.action.settleBefore === config.settleBefore, 'ACTION_BINDING');
    need(node.action.receiptKeyCommitment === nativeReceiptKeyCommitment(config.hubDomain, node.receiptSpendSecret),
      'RECEIPT_BINDING');
    need(node.action.deliveryRiskCommitment === riskCommitment(config, node.action, node.payout, node.deliveryRiskSalt),
      'RISK_BINDING');
  });
  count(record.slotSalts, 4, 4);
  record.slotSalts.forEach(salts => {
    nativeOwnerExact(salts, SALT_FIELDS);
    SALT_FIELDS.forEach(field => nativeOwnerHash(salts[field]));
  });
  return record;
}

function termsFor(record) {
  const { config } = record;
  return {
    operationId: config.operationId,
    budget: config.nodes.reduce((sum, node) => sum + BigInt(node.recipientOffer.value), 0n).toString(),
    ...Object.fromEntries(TIME_FIELDS.map(field => [field, config[field]])),
    nodes: config.nodes.map((node, slot) => ({
      id: node.id,
      chainDomain: node.actionTemplate.chainDomain,
      evidencePolicy: node.evidencePolicy,
      actionCommitment: nativeTransferActionCommitment(record.nodes[slot].action),
      dependsOn: [...node.dependsOn],
      payout: { ...node.recipientOffer },
    })),
  };
}

/** Exact prepareOperation().terms. Custody supplies its own source and keys. */
export function genericBalanceNativeTerms(preparation) {
  return termsFor(validateGenericBalanceNativePreparation(preparation));
}

function invoicesFor(record) {
  const { config } = record;
  return config.nodes.map((node, slot) => ({
    id: node.id,
    slot,
    invoice: nativeRecipientInvoiceRequest({
      ...Object.fromEntries(['scope', 'policy', 'asset', 'hubDomain', 'registryCommitment', 'operationId', 'settleBefore']
        .map(field => [field, config[field]])),
      slot,
      evidencePolicy: node.evidencePolicy,
      value: node.recipientOffer.value,
      actionTemplate: { ...node.actionTemplate, settleBefore: config.settleBefore },
    }, node.recipientOffer, {
      action: record.nodes[slot].action,
      deliveryRiskSalt: record.nodes[slot].deliveryRiskSalt,
    }),
  }));
}

/** Translate only custody's matching detached requests into scoped invoices. */
export function genericBalanceNativeInvoiceRequests(preparation, custodyInvoiceRequests) {
  const record = validateGenericBalanceNativePreparation(preparation);
  const requests = copy(custodyInvoiceRequests);
  const invoices = invoicesFor(record);
  count(requests, invoices.length, invoices.length);
  requests.forEach((request, slot) => {
    nativeOwnerExact(request, ['id', 'slot', 'x', 'y', 'message']);
    same(request, {
      id: invoices[slot].id,
      slot,
      x: record.config.nodes[slot].recipientOffer.x,
      y: record.config.nodes[slot].recipientOffer.y,
      message: nativeRecipientInvoiceMessage(invoices[slot].invoice).toString('hex'),
    }, 'PAEG_BALANCE_NATIVE_INVOICE_BINDING');
  });
  return invoices;
}

/**
 * Bind the signed custody result to the retained native preparation and the
 * current ownerPlan(ref).authorizationPublicInputs, then use the existing C129
 * codec. authorizationWords is mandatory: even another valid A0 with the same
 * native terms but a different source or graph nonce must not be substituted.
 *
 * capsules.ownerAuthorizationInputs(a0) performs the existing exact A0 word
 * comparison when the owner later supplies its verified recursive proof data.
 * This function itself performs host signature/codec checks only.
 */
export function prepareGenericBalanceNativeCapsules(input) {
  nativeOwnerExact(input, ['preparation', 'signed', 'authorizationWords']);
  const record = validateGenericBalanceNativePreparation(input.preparation);
  const signed = copy(input.signed);
  nativeOwnerExact(signed, ['authorizationStatement', 'admissionTag', 'ownerWitness', 'signatures']);
  const authorizationWords = copy(input.authorizationWords);
  same(fundedAuthorizationWords(signed.authorizationStatement), authorizationWords,
    'PAEG_BALANCE_NATIVE_A0_BINDING');

  const witness = signed.ownerWitness;
  nativeOwnerExact(witness, ['budget', 'reservationNonce', 'reserveSecret', 'inputNote', 'changeNote',
    'recoveryNote', 'payouts', 'paddingSalts', 'graph']);
  count(witness.paddingSalts, 4, 4);
  const terms = termsFor(record);
  const compiled = compileFundedGraph({
    scope: record.config.scope,
    policy: record.config.policy,
    asset: record.config.asset,
    ...terms,
    reservationNonce: witness.reservationNonce,
    reserveSecret: witness.reserveSecret,
    graphNonce: witness.graph.nonce,
    inputNote: witness.inputNote,
    changeNote: witness.changeNote,
    recoveryNote: witness.recoveryNote,
    // compileFundedGraph canonicalizes active padding to zero but requires
    // nonzero input salts. This fixed ignored value introduces no randomness.
    paddingSalts: witness.paddingSalts.map((salt, slot) => slot < record.nodes.length ? UNUSED_ACTIVE_PADDING : salt),
  });
  const { signatures, ...unsigned } = signed;
  same(unsigned, compiled, 'PAEG_BALANCE_NATIVE_FUNDED_BINDING');
  // The proven codec verifies every owner/recipient signature and all inactive
  // signature slots. Rebuilding above also binds the economic note openings.
  const capsules = prepareNativeCapsules({
    signed: { ...unsigned, signatures },
    hubDomain: record.config.hubDomain,
    registryCommitment: record.config.registryCommitment,
    nodes: record.nodes.map(({ id, action, receiptSpendSecret }) => ({ id, action, receiptSpendSecret })),
    slotSalts: record.slotSalts,
  });
  return {
    capsules,
    invoiceRequests: invoicesFor(record),
    rolePackets: {
      ready: Array.from({ length: 4 }, (_, slot) => slot < record.nodes.length ? capsules.readyRole(slot) : null),
      dependency: Array.from({ length: 4 }, (_, slot) => capsules.dependencyRole(slot)),
      node: Array.from({ length: 4 }, (_, slot) => capsules.nodeRole(slot)),
    },
    providerRiskSalts: Array.from({ length: 4 }, (_, slot) => record.nodes[slot]?.deliveryRiskSalt ?? null),
  };
}
