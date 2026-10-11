/** Internal, fixed relation catalog. This module grants no proof or signing authority. */
import assert from 'node:assert/strict';
import { resolve, join } from 'node:path';
import { legacyDataRoot } from '@lianum/environment';
import { RELATIONS } from '@lianum/components/encoding/statements';

// These names identify retained artifacts and private job state. Source imports
// resolve independently through package exports; moving this module does not
// relocate original artifacts or manufacture a replacement custody lifetime.
export const ROOT = legacyDataRoot('wallet');
export const FLAT = resolve(ROOT, '..');
export const CANDIDATE = legacyDataRoot('crypto');
export const GOLDEN = legacyDataRoot('engine');
export const EXPERIMENT = join(GOLDEN, 'experiments/private-core-proof');
export const LOCAL = join(ROOT, '.local/proof-workers');
export const PROFILE = 'LIANUM_PAEG_P2_V1';
export const NOIR_VERSION = '1.0.0-beta.25+75061fab15986eedee4e7d9104ff87dd9fa4ca10';
export const SETTINGS = Object.freeze({ ipaAccumulation: false, oracleHashType: 'keccak',
  disableZk: false, optimizedSolidityVerifier: false });
export const LIMITS = Object.freeze({ availableRAM: 2684354560, freeDisk: 5368709120,
  workerRSS: 3221225472, sampleMilliseconds: 250, phaseTimeoutMilliseconds: 600000,
  killGraceMilliseconds: 5000, outputBytes: 1048576, jobBytes: 2097152,
  threads: 1, maximumDyadicGates: 2097152, provingCRSPoints: 2097152 });
export const MEMORY = Object.freeze({ standard: 32768, dyadic21: 65536 });
export const MODES = Object.freeze(['compile', 'stats', 'prepare-key', 'prove', 'verify',
  'prepare-key-dyadic21', 'prove-dyadic21']);
export const DISCLOSURE = 'Source integration of flat, nonrecursive EVM/Keccak/ZK relations. '
  + 'Proofs require the documented atomic joins and current native/onchain checks. '
  + 'No deployment, native finality, protocol acceptance or performance improvement is established. '
  + 'This target differs from the earlier recursive N51 profile.';
const uint = width => ({ kind: 'integer', sign: 'unsigned', width });
const array = (type, length) => ({ kind: 'array', length, type });
const wordDigest = array(uint(32), 8);
const commonPrivate = ['domain', 'envelope', 'authorization_siblings', 'authorization_index',
  'core', 'core_blind', 'core_siblings'];
const commonReady = ['domain_commitment', 'authorization_root', 'checkpoint',
  'readiness_evidence_state', 'join_commitment'];
const definitions = {
  native_claim_ingress: ['CI51', 'claim_ingress', ['claim_domain', 'output_q', 'admission_n',
    'refund_destination', 'admission_revocation_state', 'ingress_receipt_leaf'],
    ['amount_q', 'evidence_from', 'evidence_until'], [], ['config', 'domain', 'evidence', 'note_opening']],
  native_claim_discharge: ['CO42', 'claim_discharge', ['claim_domain', 'ticket_id',
    'ticket_commitment', 'discharge_n', 'admission_revocation_state'],
    ['evidence_from', 'evidence_until'], [],
    ['config', 'domain', 'evidence', 'ticket', 'destination_endpoint', 'destination_salt']],
  deposit_intent: ['D27', 'owner', [], [], [], ['rho', 'key_x', 'key_y', 'secret', 'signature']],
  authorization: ['U', 'owner', ['domain_commitment', 'envelope'], [], [],
    ['domain', 'owner_statement', 'owner_witness', 'capsule_witness', 'join_blinds', 'leaf_blinds']],
  reservation: ['S', 'reservation', ['domain_commitment', 'envelope', 'input_root', 'input_nullifier',
    'reserve_commitment', 'change_commitment', 'admission_tag'], ['funding_not_before', 'funding_valid_until'], [],
    ['domain', 'core', 'core_blind', 'core_siblings', 'funding', 'funding_blind', 'funding_siblings',
      'input_commitment', 'input_siblings', 'input_leaf_index']],
  dependency: ['P', 'dependency', commonReady, ['ready_from', 'ready_until'], [],
    [...commonPrivate, 'dependency', 'dependency_blind', 'dependency_siblings', 'snapshot',
      'predecessor_receipts', 'receipt_siblings', 'receipt_indexes', 'revoked_entries']],
  ready: ['R', 'local', [...commonReady, 'readiness_commitment'], ['ready_from', 'ready_until'], [],
    [...commonPrivate, 'local', 'local_blind', 'local_siblings', 'action', 'snapshot',
      'reserve_siblings', 'reserve_index', 'pool_spent_entries', 'readiness_blind']],
  admission: ['I', 'local', [...commonReady, 'readiness_commitment', 'accepted_checkpoint_root',
    'admission_revocation_state', 'receipt_leaf', 'admission_nullifier'],
    ['ready_from', 'ready_until', 'admission_from', 'admission_until'], [],
    ['domain', 'descriptor', 'readiness_blind', 'checkpoint_siblings', 'checkpoint_index', 'registry',
      'rule', 'rule_siblings', 'rule_index', 'action', 'effect', 'opening', 'observation', 'wire',
      'native_context', 'provider_key_x', 'provider_key_y', 'dispatch_signed_at', 'dispatch_signature',
      'delivery_risk_salt', 'receipt_secret', 'attester_indexes', 'attester_signatures',
      'current_revoked_entries', 'current_revoked_digest', 'current_revoked_count', 'current_revocation_sequence']],
  node: ['N', 'local', ['domain_commitment', 'authorization_root', 'evidence_state', 'completion_commitment'], [], [],
    [...commonPrivate, 'local', 'local_blind', 'local_siblings', 'completion', 'completion_blind',
      'state_opening', 'own_receipt', 'receipt_spend_secret', 'receipt_siblings', 'receipt_index', 'revoked_entries']],
  settlement: ['T', 'assembler', ['domain_commitment', 'authorization_root', 'evidence_state',
    'pool_root', 'reserve_nullifier'], ['valid_from', 'valid_until'],
    ['outputs', 'terminal_tags', 'completion_commitments'],
    [...commonPrivate, 'settlement', 'settlement_blind', 'settlement_siblings', 'completions',
      'completion_blinds', 'reserve_siblings', 'reserve_index']],
  recovery: ['F', 'recovery', ['domain_commitment', 'authorization_root', 'pool_root',
    'reserve_nullifier', 'recovery_commitment'], ['settle_before'], [],
    [...commonPrivate, 'recovery', 'recovery_blind', 'recovery_siblings', 'reserve_siblings', 'reserve_leaf_index']],
};
const camel = name => name.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
export const CATALOG = Object.freeze(Object.fromEntries(Object.entries(definitions).map(([name, value]) => {
  const [symbol, role, digests, times, vectors, privateNames] = value;
  const publicABI = name === 'deposit_intent' ? [
    { name: 'scope', type: wordDigest, visibility: 'public' },
    { name: 'policy', type: wordDigest, visibility: 'public' },
    ...['valid_from', 'valid_until', 'amount'].map(name => ({ name, type: uint(64), visibility: 'public' })),
    { name: 'output', type: wordDigest, visibility: 'public' },
  ] : [...digests.map(name => ({ name, type: wordDigest, visibility: 'public' })),
    ...vectors.map(name => ({ name, type: array(wordDigest, 4), visibility: 'public' })),
    ...times.map(name => ({ name, type: uint(64), visibility: 'public' }))];
  const statement = RELATIONS[name];
  assert.deepEqual(publicABI.map(item => camel(item.name)), statement.fields.map(item => item.name), 'PW_STATEMENT_ORDER');
  assert.equal(role, statement.role, 'PW_STATEMENT_ROLE');
  const expectedTypes = name === 'deposit_intent' ? ['digest', 'digest', 'time', 'time', 'time', 'digest']
    : [...digests.map(() => 'digest'), ...vectors.map(() => 'vector'), ...times.map(() => 'time')];
  assert.deepEqual(statement.fields.map(item => item.type === 'u64' ? 'time' : item.type.endsWith('[4]') ? 'vector' : 'digest'),
    expectedTypes, 'PW_STATEMENT_WIDTH');
  return [name, Object.freeze({ name, symbol, role, publicABI, privateNames, publicWords: statement.wordCount,
    circuit: name === 'node' ? join(CANDIDATE, 'circuits/node-component')
      : join(ROOT, 'proof-relations', name.replaceAll('_', '-')) })];
})));
export function relation(name) {
  assert.ok(typeof name === 'string' && Object.hasOwn(CATALOG, name), 'PW_FIXED_RELATION');
  return CATALOG[name];
}
export function operation(mode) {
  assert.ok(MODES.includes(mode), 'PW_FIXED_MODE');
  return mode.endsWith('-dyadic21') ? mode.slice(0, -9) : mode;
}
export function pagesFor(mode, stats) {
  if (mode.endsWith('-dyadic21')) {
    assert.equal(stats?.numGatesDyadic, 2097152, 'PW_LARGE_PROFILE_REQUIRES_ACTUAL_DYADIC21');
    return MEMORY.dyadic21;
  }
  if (['prepare-key', 'prove'].includes(mode))
    assert.ok(stats?.numGatesDyadic <= 1048576, 'PW_EXPLICIT_DYADIC21_PROFILE_REQUIRED');
  return MEMORY.standard;
}
// Retained artifacts are imported read-only. Never regenerate N through this worker.
export const NODE_PINS = Object.freeze({
  toolingSHA256: 'f2e6576097e1aca87ef57d0869fe6c07c4214ee1f7a509de9e5f0d18f97dd063',
  compiledManifestSHA256: '29084da7f9d90365578b32a87e54b9e4ce165ae7e3701b803df250db738c4004',
  artifactSHA256: '6c2d09943e6b138bb67b8133f33331adf08263dc12210b2d1a62d78c56fce38e',
  bytecodeSHA256: '9e4f613e46a682115b18b268cb637f9b6d1ca2eea03e9a0acc6068dcd2c6d29f',
  sourceTreeSHA256: 'de10082899aee53f9e0190a27b04277a0e66306077e5556b44e38763a00a1c0b',
  statsManifestSHA256: '85d0ddd2f3160767dd34ce7c42810f759af8e2509d413b6bdd3146ab9c83448c',
  pinFileSHA256: '95a561fdf1c92187407daede21b490673f572ddf5ca0337c4cf00606bef20b96',
  keySHA256: '7db1eb6975fad4fda0ebac6b7e9ad3861604f4eb8d1231b9c2ff8ccf661d5fe4',
});
// Exact source-pinned one-job role. It receives only private IPC and returns
// public proof metadata. Circuit/ABI checks remain in the inner bounded worker.
export const TRUSTED_JOB_SOURCES = Object.freeze(Object.fromEntries(
  Object.keys(CATALOG).map(name => [name, Object.freeze(['proof-workers/trusted-jobs.mjs',
    'wallet-platform/modules/paeg/statements.mjs', 'proof-workers/role-process.mjs'])])));
export const TRUSTED_PARENTS = Object.freeze(Object.fromEntries(
  Object.keys(CATALOG).map(name => [name, Object.freeze({
    script: 'proof-workers/role-process.mjs', arguments: Object.freeze([name]),
  })])));
