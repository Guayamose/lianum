import {PRIVATE_RESOURCE_FLOORS,PRIVATE_RESOURCE_POLICY,PRIVATE_PROOF_WORKER_RSS_LIMIT} from '../crypto/private-resource-policy.mjs';
/** PC18 actor boundaries on a trusted shared OS, not an adversarial sandbox.
 * No proof/native action runs on import. Engines require explicit callbacks.
 * Operational A/J/L packages are private to their designated verifier, never
 * public readiness data. Optional owner-only M21 custody persists only the
 * original encrypted refund note/key through its trusted bootstrap config.
 */
import { createHash, createPublicKey, verify } from 'node:crypto';
import { spawn } from 'node:child_process';
import { createReadStream, readFileSync, statfsSync, mkdirSync, writeFileSync } from 'node:fs';
import { Socket } from 'node:net';
import { fileURLToPath } from 'node:url';
import { canonical } from '../crypto/privacy.mjs';
import { createRecipientGraphPlan } from '../recipients/private-recipient-graph.mjs';
import { persistOriginalOwnerRefundCustody, validateOwnerRefundCustodyConfig } from '../recovery/private-owner-refund-custody.mjs';
import { importRecipientInvoice, validateRecipientTerms } from '../recipients/private-recipient-custody.mjs';
import { reserveInput, policyCommitment, wordsBE } from '../notes/private-note-encoding.mjs';
import { verifyPrivateNotePath, privateSpentDigest, privateEffectDigest, ZERO_NOTE_HASH, PrivateNoteTree, assertPrivateNoteHeadroom, noteWordsToHash } from '../notes/private-note-tree.mjs';
import { assertPrivateRootHistory } from './private-assembly-history.mjs';
import { assertPrivateAssemblyRevocations } from './private-assembly-revocations.mjs';
import { encodeNativeCertificate, SECP256K1_ORDER } from '../notes/private-native-certificate.mjs';
import { assemblyAuthorizationInput, assemblyLocalInput, assemblyRecursiveInput,
  assertAssemblyStatement, ASSEMBLY_PUBLIC_WORDS, ASSEMBLY_RECURSIVE_MODES } from './private-assembly-encoding.mjs';

export const ASSEMBLY_IPC_MAX_BYTES = 1024 * 1024;
export const ASSEMBLY_PROOF_MAX_BYTES = 256 * 1024;
const FIELD = 21888242871839275222246405745257275088548364400416034343698204186575808495617n;
const ROLES = ['sol', 'btc'];
const WALLET_WORDS = Object.freeze({deposit_balance:26,reserve_from_note:74,withdraw_balance:39});
const MODES = ['reserve', ...Object.keys(ASSEMBLY_PUBLIC_WORDS), ...Object.keys(WALLET_WORDS)];
const recursive = mode => ASSEMBLY_RECURSIVE_MODES.includes(mode);
const clone = value => JSON.parse(canonical(value));
const sha = value => createHash('sha256').update(value).digest('hex');
const fail = code => { throw Object.assign(new Error(code), { code }); };
const need = (condition, code = 'PC18_ACTOR_INPUT') => { if (!condition) fail(code); };
const same = (a, b, code) => need(canonical(a) === canonical(b), code);
const hex = (value, width = 32) => { need(typeof value === 'string' && new RegExp(`^[0-9a-f]{${width * 2}}$`).test(value)); return value; };
const uint = value => { need(typeof value === 'string' && /^(0|[1-9][0-9]{0,19})$/.test(value) && BigInt(value) < (1n << 64n)); return BigInt(value); };
export function exactAssemblyFields(value, fields) {
  canonical(value);
  need(value && typeof value === 'object' && !Array.isArray(value) && Object.keys(value).length === fields.length && fields.every(k => Object.hasOwn(value, k)), 'PC18_ACTOR_FIELDS');
}
function policyInput(value) {
  exactAssemblyFields(value, ['sol', 'btc', 'minimumBtcConfirmations']);
  need(Number.isSafeInteger(value.minimumBtcConfirmations) && value.minimumBtcConfirmations >= 6 && value.minimumBtcConfirmations <= 0xffffffff, 'PC18_POLICY_CONFIRMATIONS');
  for (const role of ROLES) { exactAssemblyFields(value[role], ['policyId', 'identityNamespace', 'genesis', 'x', 'y']); for (const v of Object.values(value[role])) hex(v); }
  return clone(value);
}
function fields(values, count) {
  need(Array.isArray(values) && values.length === count, 'PC18_ACTOR_FIELD_COUNT');
  return values.map(value => {
    need(typeof value === 'string' && /^(0|[1-9][0-9]{0,76})$/.test(value) && BigInt(value) < FIELD, 'PC18_ACTOR_FIELD_ENCODING'); return value;
  });
}
const fromBackendFields = values => { need(Array.isArray(values)); return values.map(value => {
  need(typeof value === 'string' && /^(?:0|[1-9][0-9]*|0x[0-9a-f]+)$/i.test(value) || typeof value === 'bigint' || typeof value === 'number' && Number.isSafeInteger(value));
  return BigInt(value).toString();
}); };
const hashWords = value => wordsBE(Buffer.from(value.replace(/^0x/, ''), 'hex')).map(String);

/** Exact public projection. The rest of each proving input stays in its actor. */
export function assemblyActorPublicInputs(mode, input) {
  const order = {
    deposit_balance: ['scope','policy','epoch','amount','output'],
    reserve_from_note: ['scope','policy','epoch','root','spent','output','change','admission_tag','expected_base_root','expected_sequence','expected_post_root'],
    withdraw_balance: ['scope','policy','epoch','root','spent','amount','recipient'],
    reserve: ['scope', 'policy', 'epoch', 'amount', 'output', 'admission_tag'],
    authorization: ['schema', 'scope', 'policy', 'root', 'spent', 'local_sol', 'local_btc', 'output_sol', 'output_btc', 'output_recovery', 'cutoff'],
    sol_local: ['schema', 'scope', 'policy', 'local', 'effect', 'observed_at', 'valid_from', 'valid_until'],
    btc_local: ['schema', 'scope', 'policy', 'local', 'effect', 'observed_at', 'valid_from', 'valid_until'],
    sol_join: ['schema', 'authorization_inputs', 'effect_sol', 'observed_at', 'valid_from', 'valid_until'],
    sol_ready: ['schema', 'scope', 'policy', 'epoch', 'history_digest', 'history_count', 'current_root', 'spent_digest', 'spent_count', 'state_sequence', 'local', 'coverage_halted'],
    btc_ready: ['schema', 'scope', 'policy', 'epoch', 'history_digest', 'history_count', 'current_root', 'spent_digest', 'spent_count', 'state_sequence', 'local', 'coverage_halted', 'sol_effect_digest', 'sol_effect_count', 'sol_revoked_digest', 'sol_revoked_count'],
    fulfill: ['scope', 'policy', 'epoch', 'root', 'spent', 'effect_sol', 'effect_btc', 'output_sol', 'output_btc'],
    refund: ['scope', 'policy', 'epoch', 'root', 'spent', 'output_recovery'],
  }[mode];
  need(order, 'PC18_ACTOR_MODE');
  return fromBackendFields(order.flatMap(k => { need(Object.hasOwn(input, k), 'PC18_PUBLIC_INPUT_MISSING'); return input[k]; }));
}
function statement(mode, input) {
  fields(input, mode === 'reserve' ? 34 : WALLET_WORDS[mode] ?? ASSEMBLY_PUBLIC_WORDS[mode]);
  if (mode !== 'reserve' && !WALLET_WORDS[mode]) assertAssemblyStatement(mode, input);
  // Hash words are u32; only explicit scalar positions may be u64.
  const scalars = { deposit_balance:[16,17], reserve_from_note:[16,65], withdraw_balance:[16,33], reserve: [16, 17], authorization: [80], sol_local: [40, 41, 42], btc_local: [40, 41, 42], sol_join: [88, 97, 98, 99], sol_ready: [24, 51], btc_ready: [24, 51], fulfill: [16], refund: [16] }[mode];
  input.forEach((value, i) => need(BigInt(value) < (1n << BigInt(scalars.includes(i) ? 64 : 32)), 'PC18_PUBLIC_WORD_BOUND'));
  if (mode.endsWith('_ready')) need(input[60] === '0' || input[60] === '1', 'PC18_PUBLIC_HALT_BOOLEAN');
  if (mode === 'sol_join') assertAssemblyStatement('authorization', input.slice(8, 89));
}

/** No Buffer.toJSON objects, unknown metrics, witness or arbitrary extensions. */
export function validateAssemblyProofPackage(value, expectedMode) {
  need(MODES.includes(expectedMode), 'PC18_ACTOR_MODE');
  exactAssemblyFields(value, ['version', 'mode', 'target', 'proofBase64', 'publicInputs', ...(recursive(expectedMode) ? ['vkFields', 'proofFields'] : [])]);
  need(value.version === 1 && value.mode === expectedMode && value.target === (recursive(expectedMode) ? 'noir-recursive' : 'evm'), 'PC18_PROOF_MODE_BINDING');
  need(typeof value.proofBase64 === 'string' && value.proofBase64.length > 0 && value.proofBase64.length <= Math.ceil(ASSEMBLY_PROOF_MAX_BYTES / 3) * 4, 'PC18_PROOF_SIZE');
  const proof = Buffer.from(value.proofBase64, 'base64');
  need(proof.length > 0 && proof.length <= ASSEMBLY_PROOF_MAX_BYTES, 'PC18_PROOF_SIZE');
  need(proof.toString('base64') === value.proofBase64, 'PC18_PROOF_CANONICAL_BASE64');
  statement(expectedMode, value.publicInputs);
  if (recursive(expectedMode)) {
    fields(value.vkFields, 115); fields(value.proofFields, 458);
    const fieldBytes = Buffer.concat(value.proofFields.map(f => Buffer.from(BigInt(f).toString(16).padStart(64, '0'), 'hex')));
    need(proof.equals(fieldBytes), 'PC18_PROOF_FIELD_BYTES');
  }
  return clone(value);
}
export function decodeAssemblyProofPackage(value, mode = value?.mode) {
  const p = validateAssemblyProofPackage(value, mode);
  return { proof: Uint8Array.from(Buffer.from(p.proofBase64, 'base64')), publicInputs: p.publicInputs,
    ...(recursive(mode) ? { vkFields: p.vkFields, proofFields: p.proofFields } : {}) };
}
export const assemblyPackageDigest = value => sha(canonical(value));
async function provePackage(mode, input, callback) {
  need(typeof callback === 'function', 'PC18_PROVER_REQUIRED');
  const started = performance.now();
  const result = await callback(mode, input, `pc18-${mode}`);
  if (mode.endsWith('_ready')) need(performance.now() - started < 600000, 'PC18_READINESS_TIMING_REDESIGN_REQUIRED');
  need(result?.proof instanceof Uint8Array, 'PC18_PROOF_BYTES');
  const p = { version: 1, mode, target: recursive(mode) ? 'noir-recursive' : 'evm', proofBase64: Buffer.from(result.proof).toString('base64'), publicInputs: fromBackendFields(result.publicInputs),
    ...(recursive(mode) ? { vkFields: fromBackendFields(result.vkFields), proofFields: fromBackendFields(result.proofFields) } : {}) };
  same(p.publicInputs, assemblyActorPublicInputs(mode, input), 'PC18_PROVER_PUBLIC_MISMATCH');
  return validateAssemblyProofPackage(p, mode);
}
function actorGuard(kind) {
  let closed = false, busy = false, calls = 0;
  return {
    async run(work) { need(!closed, 'PC18_ACTOR_CLOSED'); need(!busy, 'PC18_ACTOR_BUSY'); need(++calls <= 4096, 'PC18_ACTOR_CALL_LIMIT'); busy = true; try { return await work(); } finally { busy = false; } },
    close() { closed = true; },
    status() { return { kind, closed, calls }; },
  };
}
function planInput(value) {
  canonical(value);
  const required = ['scope', 'policy', 'epoch', 'sourceSol', 'recipientSol', 'recipientBtc'];
  const optional = ['amountSol', 'numerator', 'denominator', 'budget', 'solCompensation', 'claimEpoch'];
  need(required.every(k => Object.hasOwn(value, k)) && Object.keys(value).every(k => [...required, ...optional].includes(k)), 'PC18_OWNER_PLAN_FIELDS');
  for (const key of ['scope', 'sourceSol', 'recipientSol', 'recipientBtc']) hex(value[key]);
  for (const key of ['epoch', ...optional]) if (Object.hasOwn(value, key)) uint(value[key]);
  policyInput(value.policy); return clone(value);
}
export function validateAssemblyRolePackage(value, role) {
  exactAssemblyFields(value, ['version', 'role', 'terms', 'invoice', 'policy', 'bridgeToken']);
  need(ROLES.includes(role) && value.version === 1 && value.role === role, 'PC18_ROLE_PACKAGE');
  const terms = validateRecipientTerms(value.terms); need(terms.role === role, 'PC18_ROLE_PACKAGE');
  policyInput(value.policy); hex(value.bridgeToken);
  need(policyCommitment(value.policy).toString('hex') === terms.policy, 'PC18_ROLE_POLICY');
  importRecipientInvoice(terms, value.invoice); // Exact independent opening/signature and own C recomputation.
  return clone(value);
}

export const ASSEMBLY_OPERATION_INVENTORY = Object.freeze({
  owner: { control: ['status', 'proveReserve', 'proveAuthorization', 'completePackages', 'shutdown'], sol: ['terms', 'acceptInvoice', 'ownPackage', 'acknowledgePackage'], btc: ['terms', 'acceptInvoice', 'ownPackage', 'acknowledgePackage'], assembler: ['authorization', 'acknowledgePackage'], wallet: ['prepareWalletReserve','proveWalletReserve'] },
  producer: { control: ['status', 'shutdown'], owner: ['retainPackage'], broker: ['bridgeBinding', 'proveLocal'], assembler: ['localProof'] },
  assembler: { control: ['status', 'proveJoin', 'proveReadiness', 'proveFulfillment', 'proveRefund', 'terminalProof', 'shutdown'], owner: ['retainAuthorization'], sol: ['retainLocal', 'readiness'], btc: ['retainLocal', 'readiness'] },
});
function allow(kind, channel, operation) { need(ASSEMBLY_OPERATION_INVENTORY[kind]?.[channel]?.includes(operation), 'PC18_OPERATION_DENIED'); }

/** Owner graph and KeyObjects exist only in this closure in the owner process.
 * A path passed here must be independently authenticated by the public pool
 * reader. Host path consistency alone is not funding; readiness checks history.
 */
export function createAssemblyOwner(config, { proveReserve, proveAssembly, proveWallet, ownerRefundVaultFactory } = {}) {
  exactAssemblyFields(config, ['plan', 'bridgeTokens', ...(Object.hasOwn(config, 'ownerRefundCustody') ? ['ownerRefundCustody'] : []), ...(Object.hasOwn(config, 'walletCustody') ? ['walletCustody'] : [])]);
  // Trusted owner fd3 only. No control/producer/assembler custody operations.
  const refundConfig = Object.hasOwn(config, 'ownerRefundCustody') ? validateOwnerRefundCustodyConfig(config.ownerRefundCustody) : undefined;
  const cfg = { plan: planInput(config.plan), bridgeTokens: clone(config.bridgeTokens) };
  exactAssemblyFields(cfg.bridgeTokens, ROLES); for (const token of Object.values(cfg.bridgeTokens)) hex(token);
  need(cfg.bridgeTokens.sol !== cfg.bridgeTokens.btc, 'PC18_DISTINCT_ROLE_CAPABILITIES');
  let plan = createRecipientGraphPlan(cfg.plan), graph, authorization, complete = false;
  let invoices = {}, reserveProved = false, refundCustody, walletCustody, walletPrepared;
  if (config.walletCustody) { exactAssemblyFields(config.walletCustody,['path','password','identity','checkpoint','terms']); need(refundConfig,'PC18_WALLET_ORIGINAL_REFUND_REQUIRED'); }
  const delivered = new Set(), issued = new Map(), guard = actorGuard('owner');
  return Object.freeze({ async request(channel, operation, input) {
    return guard.run(async () => {
      allow('owner', channel, operation);
      if (operation === 'status') { need(input === null); return { ...guard.status(), reserveProved, authorizationReady: Boolean(authorization), complete, delivered: [...delivered].sort() }; }
      if (operation === 'shutdown') { need(input === null); if (refundConfig && reserveProved) await refundCustody.authenticate(); if(walletCustody)await walletCustody.authenticate(); refundCustody?.close(); walletCustody?.close(); graph = plan = authorization = undefined; invoices = {}; guard.close(); return { closed: true }; }
      need(!complete, 'PC18_OWNER_PACKAGES_FINAL');
      if (operation === 'terms') { need(input === null); return plan.terms(channel); }
      if (operation === 'acceptInvoice') {
        need(!graph && !Object.hasOwn(invoices, channel), 'PC18_INVOICE_ALREADY_RETAINED');
        importRecipientInvoice(plan.terms(channel), input); invoices[channel] = clone(input);
        return { role: channel, retained: true, invoiceSHA256: assemblyPackageDigest(input) };
      }
      if (operation === 'prepareWalletReserve') {
        need(config.walletCustody && !reserveProved && !walletPrepared,'PC18_WALLET_PREPARATION_PHASE');
        exactAssemblyFields(input,['requestId','operationId','inputCommitment','snapshot']);
        need(ROLES.every(role => Object.hasOwn(invoices, role)), 'PC18_INDEPENDENT_INVOICES_REQUIRED');
        graph ??= plan.assemble(invoices);
        refundCustody ??= await persistOriginalOwnerRefundCustody(graph, refundConfig, { vaultFactory: ownerRefundVaultFactory });
        await refundCustody.authenticate();
        const {recoverPrivateWalletCustody}=await import('../wallet/custody/private-wallet-custody.mjs');
        const {terms,...custodyConfig}=config.walletCustody;
        walletCustody=await recoverPrivateWalletCustody(custodyConfig);
        walletPrepared=await walletCustody.prepareSpend({...input,approvedGraph:reserveInput(graph,cfg.plan.epoch),terms});
        return {preparation:walletPrepared,checkpoint:walletCustody.checkpoint()};
      }
      if (operation === 'proveWalletReserve') {
        need(config.walletCustody && walletPrepared && !reserveProved,'PC18_WALLET_PREPARATION_PHASE');
        need(input===null,'PC18_ACTOR_FIELDS');
        const witness=await walletCustody.reserveInput({requestId:walletPrepared.requestId,graph,epoch:cfg.plan.epoch,path:walletPrepared.inputPath ?? walletPrepared.path,expectedBaseRoot:walletPrepared.expectedBaseRoot ?? walletPrepared.statement.expectedBaseRoot,expectedSequence:walletPrepared.expectedSequence ?? walletPrepared.statement.expectedSequence,expectedPostRoot:walletPrepared.expectedPostRoot ?? walletPrepared.statement.expectedPostRoot});
        const result=await provePackage('reserve_from_note',witness,proveWallet);
        await refundCustody.authenticate();await walletCustody.authenticate();reserveProved=true;return {proof:result,checkpoint:walletCustody.checkpoint()};
      }
      if (operation === 'proveReserve') {
        exactAssemblyFields(input, ['epoch']); uint(input.epoch);
        need(input.epoch === cfg.plan.epoch && !reserveProved, 'PC18_RESERVE_PHASE');
        need(ROLES.every(role => Object.hasOwn(invoices, role)), 'PC18_INDEPENDENT_INVOICES_REQUIRED');
        graph ??= plan.assemble(invoices);
        if (refundConfig) {
          refundCustody ??= await persistOriginalOwnerRefundCustody(graph, refundConfig, { vaultFactory: ownerRefundVaultFactory });
          await refundCustody.authenticate();
        }
        const result = await provePackage('reserve', reserveInput(graph, input.epoch), proveReserve);
        // A file removed/substituted while proving must prevent proof release.
        if (refundConfig) await refundCustody.authenticate();
        reserveProved = true; return result;
      }
      if (operation === 'proveAuthorization') {
        exactAssemblyFields(input, ['path']); exactAssemblyFields(input.path, ['index', 'leaf', 'root', 'siblings']);
        need(reserveProved && !authorization, 'PC18_AUTHORIZATION_PHASE');
        need(input.path.leaf === `0x${graph.reserved.toString('hex')}` && verifyPrivateNotePath(input.path), 'PC18_RESERVED_MEMBERSHIP');
        const path = clone(input.path);
        authorization = await provePackage('authorization', assemblyAuthorizationInput(graph, { path: () => path }, path.index), proveAssembly);
        return { authorizationReady: true, authorizationSHA256: assemblyPackageDigest(authorization) };
      }
      need(authorization, 'PC18_AUTHORIZATION_REQUIRED');
      if (operation === 'ownPackage') {
        need(input === null);
        const p = validateAssemblyRolePackage({ version: 1, role: channel, terms: plan.terms(channel), invoice: invoices[channel], policy: cfg.plan.policy, bridgeToken: cfg.bridgeTokens[channel] }, channel);
        issued.set(channel, assemblyPackageDigest(p)); return p;
      }
      if (operation === 'authorization') { need(input === null); issued.set('assembler', assemblyPackageDigest(authorization)); return clone(authorization); }
      if (operation === 'acknowledgePackage') { exactAssemblyFields(input, ['packageSHA256']); hex(input.packageSHA256); need(issued.get(channel) === input.packageSHA256, 'PC18_PACKAGE_ACK_MISMATCH'); delivered.add(channel); return { acknowledged: true, role: channel }; }
      if (operation === 'completePackages') {
        need(input === null && delivered.size === 3, 'PC18_PACKAGES_NOT_DELIVERED');
        if (refundConfig) await refundCustody.authenticate();
        complete = true;
        return { event: 'complete-packages-ready', delivered: ['assembler', 'btc', 'sol'], authorizationSHA256: assemblyPackageDigest(authorization) };
      }
      fail('PC18_OPERATION_DENIED');
    });
  } });
}

function authenticOwnCertificate(envelope, pkg) {
  exactAssemblyFields(envelope, ['certificate', 'signature', 'issuerPublicKey']);
  exactAssemblyFields(envelope.issuerPublicKey, ['x', 'y']); hex(envelope.signature, 64);
  const c = envelope.certificate, role = pkg.role, p = pkg.policy[role], d = pkg.terms.descriptor;
  const frame = encodeNativeCertificate(c);
  same(envelope.issuerPublicKey, { x: p.x, y: p.y }, 'PC18_CERTIFICATE_ISSUER');
  need(c.policyId === p.policyId && c.identityNamespace === p.identityNamespace && c.chainDomain.chain === role.toUpperCase() && c.chainDomain.genesis === p.genesis, 'PC18_CERTIFICATE_POLICY');
  for (const [certKey, expected] of Object.entries({ localInstructionCommitment: pkg.invoice.localCommitment, source: d.source, recipientOrScriptHash: d.recipient, amount: d.amount, validFromEpoch: d.validFrom, validUntilEpoch: d.validUntil })) need(c[certKey] === expected, 'PC18_CERTIFICATE_ACTION');
  const observed = uint(c.observedAt), start = uint(d.validFrom), end = uint(d.validUntil);
  need(observed >= uint(d.executeAfter) && observed < uint(d.executeBefore) && observed / 600n >= start && observed / 600n < end, 'PC18_CERTIFICATE_TIME');
  need(BigInt(c.finalityMeasure) >= BigInt(role === 'btc' ? pkg.policy.minimumBtcConfirmations : 1), 'PC18_CERTIFICATE_FINALITY');
  const s = BigInt(`0x${envelope.signature.slice(64)}`), r = BigInt(`0x${envelope.signature.slice(0, 64)}`);
  need(r > 0n && r < SECP256K1_ORDER && s > 0n && s <= SECP256K1_ORDER / 2n, 'PC18_CERTIFICATE_LOW_S');
  const key = createPublicKey({ key: { kty: 'EC', crv: 'secp256k1', x: Buffer.from(p.x, 'hex').toString('base64url'), y: Buffer.from(p.y, 'hex').toString('base64url') }, format: 'jwk' });
  need(verify('sha256', frame, { key, dsaEncoding: 'ieee-p1363' }, Buffer.from(envelope.signature, 'hex')), 'PC18_CERTIFICATE_SIGNATURE');
  return clone(envelope);
}

/** Own-role descriptor/opening only; no graph closure, owner callback, raw
 * sibling certificate, reserve witness or serializable native dispatch handle. */
export function createAssemblyProducer(config, { proveAssembly } = {}) {
  exactAssemblyFields(config, ['role', 'policy', 'bridgeToken']); need(ROLES.includes(config.role));
  const cfg = clone(config); policyInput(cfg.policy); hex(cfg.bridgeToken);
  let pkg, localProof;
  const guard = actorGuard('producer');
  return Object.freeze({ async request(channel, operation, input) { return guard.run(async () => {
    allow('producer', channel, operation);
    if (operation === 'status') { need(input === null); return { ...guard.status(), role: cfg.role, retained: Boolean(pkg), localProofReady: Boolean(localProof), packageSHA256: pkg ? assemblyPackageDigest(pkg) : null }; }
    if (operation === 'shutdown') { need(input === null); pkg = localProof = undefined; guard.close(); return { closed: true }; }
    if (operation === 'retainPackage') {
      need(!pkg, 'PC18_ROLE_PACKAGE_ALREADY_RETAINED'); const candidate = validateAssemblyRolePackage(input, cfg.role);
      same(candidate.policy, cfg.policy, 'PC18_ROLE_POLICY'); need(candidate.bridgeToken === cfg.bridgeToken, 'PC18_ROLE_CAPABILITY');
      pkg = candidate; return { retained: true, role: cfg.role, packageSHA256: assemblyPackageDigest(pkg) };
    }
    need(pkg, 'PC18_ROLE_PACKAGE_REQUIRED');
    if (operation === 'bridgeBinding') { need(input === null); return { role: cfg.role, bridgeToken: cfg.bridgeToken, terms: clone(pkg.terms), paymentCommitment: pkg.invoice.paymentCommitment, localCommitment: pkg.invoice.localCommitment }; }
    if (operation === 'proveLocal') {
      exactAssemblyFields(input, ['certificate']); need(!localProof, 'PC18_LOCAL_PROOF_ALREADY_RETAINED');
      const certificate = authenticOwnCertificate(input.certificate, pkg), { local } = importRecipientInvoice(pkg.terms, pkg.invoice);
      const witness = assemblyLocalInput({ role: cfg.role, scope: pkg.terms.scope, policy: pkg.policy, local, certificate });
      localProof = await provePackage(`${cfg.role}_local`, witness, proveAssembly);
      return { localProofReady: true, proofSHA256: assemblyPackageDigest(localProof) };
    }
    if (operation === 'localProof') { need(input === null && localProof, 'PC18_LOCAL_PROOF_REQUIRED'); return clone(localProof); }
    fail('PC18_OPERATION_DENIED');
  }); } });
}

const SNAPSHOT_FIELDS = ['blockNumber', 'blockHash', 'blockTimestamp', 'epoch', 'scope', 'policy', 'root', 'spentDigest', 'stateSequence', 'sequence', 'leafCount', 'spentCount', 'liveReservations', 'liveOutputNotes', 'leaves', 'nullifiers', 'solEffectDigest', 'btcEffectDigest', 'rootHistoryDigest', 'rootHistoryCount', 'rootHistory', 'solEffectCount', 'btcEffectCount', 'solEffects', 'btcEffects', 'revocationCoverageHalted', 'solRevokedDigest', 'solRevokedCount', 'solRevokedEffects'];
function snapshotInput(value) {
  exactAssemblyFields(value, SNAPSHOT_FIELDS);
  need(typeof value.blockNumber === 'string' && /^0x(?:0|[1-9a-f][0-9a-f]*)$/.test(value.blockNumber));
  for (const key of ['blockHash', 'scope', 'policy', 'root', 'spentDigest', 'solEffectDigest', 'btcEffectDigest', 'rootHistoryDigest', 'solRevokedDigest']) { need(/^0x[0-9a-f]{64}$/.test(value[key])); }
  for (const key of ['blockTimestamp', 'epoch', 'stateSequence', 'sequence']) uint(value[key]);
  need(value.stateSequence === value.sequence && BigInt(value.blockTimestamp) / 600n === BigInt(value.epoch), 'PC18_SNAPSHOT_EPOCH_SEQUENCE');
  for (const key of ['leafCount', 'spentCount', 'liveReservations', 'liveOutputNotes', 'solEffectCount', 'btcEffectCount', 'rootHistoryCount', 'solRevokedCount']) need(Number.isSafeInteger(value[key]) && value[key] >= 0 && value[key] <= (key === 'rootHistoryCount' ? 65 : 64), 'PC18_SNAPSHOT_COUNT');
  for (const [key, countKey, cap] of [['leaves', 'leafCount', 64], ['nullifiers', 'spentCount', 64], ['solEffects', 'solEffectCount', 64], ['btcEffects', 'btcEffectCount', 64], ['rootHistory', 'rootHistoryCount', 65], ['solRevokedEffects', 'solRevokedCount', 64]]) {
    need(Array.isArray(value[key]) && value[key].length === cap && value[key].every(x => typeof x === 'string' && /^0x[0-9a-f]{64}$/.test(x)), 'PC18_SNAPSHOT_ARRAY');
    need(value[key].slice(value[countKey]).every(x => x === ZERO_NOTE_HASH), 'PC18_SNAPSHOT_PADDING');
  }
  assertPrivateRootHistory(value);
  assertPrivateAssemblyRevocations(value);
  need(new PrivateNoteTree(value.leaves.slice(0, value.leafCount)).root === value.root, 'PC18_SNAPSHOT_TREE');
  assertPrivateNoteHeadroom(value);
  need(privateSpentDigest(value.scope, value.nullifiers, value.spentCount) === value.spentDigest, 'PC18_SNAPSHOT_SPENT');
  for (const role of ROLES) need(privateEffectDigest(role.toUpperCase(), value.scope, value[`${role}Effects`], value[`${role}EffectCount`]) === value[`${role}EffectDigest`], 'PC18_SNAPSHOT_EFFECT');
  return clone(value);
}

/** Normalize only exact trusted prepared-key records, never caller-selected keys. */
export function assemblyActorVerificationPins(value) {
  exactAssemblyFields(value, ASSEMBLY_RECURSIVE_MODES);
  const output = {};
  for (const mode of ASSEMBLY_RECURSIVE_MODES) {
    exactAssemblyFields(value[mode], ['target', 'keySHA256', 'circuitSHA256', 'statementWords', 'vkFields']);
    const pin = clone(value[mode]);
    need(pin.target === 'noir-recursive' && pin.statementWords === ASSEMBLY_PUBLIC_WORDS[mode], 'PC18_PIN_MODE');
    hex(pin.keySHA256); hex(pin.circuitSHA256); pin.vkFields = fromBackendFields(pin.vkFields); fields(pin.vkFields, 115); output[mode] = pin;
  }
  return output;
}

/** Only A/J/L proof packages and public canonical state reach this engine.
 * verifyAssembly is mandatory: shape/VK equality is NOT proof verification.
 * Proof validity does not authenticate a host's snapshot; actual canonical RPC
 * reads and the final header recheck remain executor/bridge responsibilities.
 */
export function createAssemblyAssembler(config, { proveAssembly, verifyAssembly } = {}) {
  exactAssemblyFields(config, ['scope', 'policy', 'pins']); hex(config.scope); hex(config.policy);
  const cfg = clone(config); cfg.pins = assemblyActorVerificationPins(config.pins);
  need(typeof verifyAssembly === 'function', 'PC18_VERIFIER_REQUIRED');
  let retained = {}, terminal, readiness = {};
  const guard = actorGuard('assembler');
  async function admit(value, mode) {
    const pkg = validateAssemblyProofPackage(value, mode); same(pkg.vkFields, cfg.pins[mode].vkFields, 'PC18_UNAPPROVED_COMPLETE_VK');
    const offset = mode === 'sol_join' ? 16 : 8;
    same(pkg.publicInputs.slice(offset, offset + 8), hashWords(cfg.scope), 'PC18_ASSEMBLER_SCOPE');
    same(pkg.publicInputs.slice(offset + 8, offset + 16), hashWords(cfg.policy), 'PC18_ASSEMBLER_POLICY');
    need(await verifyAssembly(mode, decodeAssemblyProofPackage(pkg)) === true, 'PC18_GENUINE_PROOF_REJECTED'); return pkg;
  }
  return Object.freeze({ async request(channel, operation, input) { return guard.run(async () => {
    allow('assembler', channel, operation);
    if (operation === 'status') { need(input === null); return { ...guard.status(), retained: Object.keys(retained).sort(), readyRoles: Object.keys(readiness).sort(), terminalMode: terminal?.mode ?? null }; }
    if (operation === 'shutdown') { need(input === null); retained = {}; readiness = {}; terminal = undefined; guard.close(); return { closed: true }; }
    if (operation === 'retainAuthorization' || operation === 'retainLocal') {
      const mode = operation === 'retainAuthorization' ? 'authorization' : `${channel}_local`;
      need(!retained[mode], 'PC18_PROOF_ALREADY_RETAINED');
      const candidate = await admit(input, mode);
      if (mode !== 'authorization') {
        need(retained.authorization, 'PC18_AUTHORIZATION_REQUIRED'); const a = retained.authorization.publicInputs, offset = channel === 'sol' ? 40 : 48;
        same(candidate.publicInputs.slice(24, 32), a.slice(offset, offset + 8), 'PC18_CHILD_JOIN');
      }
      retained[mode] = candidate; return { retained: true, mode, packageSHA256: assemblyPackageDigest(candidate) };
    }
    if (operation === 'readiness') { need(input === null && readiness[channel], 'PC18_READINESS_REQUIRED'); return clone(readiness[channel]); }
    if (operation === 'terminalProof') { need(input === null && terminal, 'PC18_TERMINAL_REQUIRED'); return clone(terminal); }
    need(retained.authorization, 'PC18_AUTHORIZATION_REQUIRED');
    const a = retained.authorization.publicInputs;
    let mode, epoch, snapshot;
    if (operation === 'proveJoin') { need(input === null && !retained.sol_join && retained.sol_local, 'PC18_SOL_JOIN_PHASE'); mode = 'sol_join'; }
    else {
      exactAssemblyFields(input, operation === 'proveReadiness' ? ['role', 'snapshot', 'epoch'] : ['epoch']); epoch = uint(input.epoch);
      if (operation === 'proveReadiness') { need(ROLES.includes(input.role)); mode = `${input.role}_ready`; snapshot = snapshotInput(input.snapshot); }
      else mode = operation === 'proveFulfillment' ? 'fulfill' : 'refund';
      need(mode === 'refund' ? epoch >= BigInt(a[80]) : epoch < BigInt(a[80]), 'PC18_CUTOFF');
      if (mode === 'btc_ready' || mode === 'fulfill') need(retained.sol_join, 'PC18_SOL_JOIN_REQUIRED');
      if (mode === 'fulfill') need(retained.btc_local, 'PC18_BTC_LOCAL_REQUIRED');
      if (snapshot) {
        need(!snapshot.revocationCoverageHalted, 'PC18_REVOCATION_COVERAGE_HALTED');
        need(snapshot.rootHistory.slice(0, snapshot.rootHistoryCount).includes(noteWordsToHash(a.slice(24, 32))), 'PC18_AUTHORIZATION_ROOT_NOT_ACCEPTED');
        need(!snapshot.nullifiers.slice(0, snapshot.spentCount).includes(noteWordsToHash(a.slice(32, 40))), 'PC18_RESERVE_ALREADY_SPENT');
      }
      if (mode === 'btc_ready' || mode === 'fulfill') {
        const j = retained.sol_join.publicInputs;
        need(epoch >= BigInt(j[98]) && epoch < BigInt(j[99]) && BigInt(j[97]) < (epoch + 1n) * 600n, 'PC18_SOL_NOT_CURRENT');
        if (snapshot) { need(!snapshot.solEffects.slice(0, snapshot.solEffectCount).includes(noteWordsToHash(j.slice(89, 97))), 'PC18_SOL_EFFECT_ALREADY_SPENT'); need(!snapshot.solRevokedEffects.slice(0, snapshot.solRevokedCount).includes(noteWordsToHash(j.slice(89, 97))), 'PC18_SOL_EFFECT_REVOKED'); }
        if (mode === 'fulfill') {
          const b = retained.btc_local.publicInputs;
          need(epoch >= BigInt(b[41]) && epoch < BigInt(b[42]) && BigInt(b[40]) < (epoch + 1n) * 600n && BigInt(b[40]) >= BigInt(j[97]), 'PC18_BTC_NOT_CURRENT_OR_ORDERED');
        }
      }
    }
    const witness = assemblyRecursiveInput(mode, { authorization: retained.authorization, sol: retained.sol_local, btc: retained.btc_local, joined: retained.sol_join, snapshot, epoch });
    const result = await provePackage(mode, witness, proveAssembly);
    if (mode === 'sol_join') retained.sol_join = await admit(result, mode);
    else { need(await verifyAssembly(mode, decodeAssemblyProofPackage(result)) === true, 'PC18_GENUINE_PROOF_REJECTED'); if (mode.endsWith('_ready')) readiness[input.role] = result; else terminal = result; }
    return { mode, proofReady: true, packageSHA256: assemblyPackageDigest(result) };
  }); } });
}

/** Bounded byte framing: decode UTF-8 only after a complete newline frame.
 * Reject malformed UTF-8, incomplete EOF, large frames and Buffer JSON forms.
 */
export function createAssemblyFrameDecoder(onFrame, onError, maximum = ASSEMBLY_IPC_MAX_BYTES) {
  let pending = Buffer.alloc(0), failed = false;
  const reject = error => { if (!failed) { failed = true; pending.fill(0); pending = Buffer.alloc(0); onError(error); } };
  return Object.freeze({ push(chunk) {
    if (failed) return;
    try {
      need(chunk instanceof Uint8Array, 'PC18_IPC_BYTES');
      let offset = 0;
      while (offset < chunk.length) {
        const end = chunk.indexOf(10, offset), last = end < 0 ? chunk.length : end;
        need(pending.length + last - offset <= maximum, 'PC18_IPC_SIZE');
        pending = Buffer.concat([pending, chunk.subarray(offset, last)]);
        if (end < 0) return;
        need(pending.length > 0, 'PC18_IPC_EMPTY');
        const text = new TextDecoder('utf-8', { fatal: true }).decode(pending), value = JSON.parse(text);
        canonical(value); pending.fill(0); pending = Buffer.alloc(0); onFrame(value); offset = end + 1;
      }
    } catch (error) { reject(error); }
  }, end() { if (pending.length) reject(Object.assign(new Error('PC18_IPC_TRUNCATED'), { code: 'PC18_IPC_TRUNCATED' })); }, close() { failed = true; pending.fill(0); pending = Buffer.alloc(0); } });
}
export function encodeAssemblyFrame(value) {
  const text = canonical(value); need(Buffer.byteLength(text) <= ASSEMBLY_IPC_MAX_BYTES, 'PC18_IPC_SIZE'); return Buffer.from(`${text}\n`, 'utf8');
}
const safeCode = error => /^(PC18|PC23|WALLET_CUSTODY)_[A-Z0-9_]+$/.test(error?.code ?? error?.message ?? '') ? error.code ?? error.message : 'PC18_REQUEST_REJECTED';
const stamp = () => process.hrtime.bigint().toString();
const sendFrame = (stream, frame) => new Promise((resolve, reject) => stream.write(encodeAssemblyFrame(frame), error => error ? reject(error) : resolve()));

/** Global actor queue bound; one active frame is included in this budget. */
export function createAssemblyQueueBudget({maxFrames=16,maxBytes=8*1024*1024}={}) {
  need(Number.isSafeInteger(maxFrames)&&maxFrames>0&&maxFrames<=16&&Number.isSafeInteger(maxBytes)&&maxBytes>0&&maxBytes<=8*1024*1024,'PC18_IPC_QUEUE_CONFIG');
  let frames=0,bytes=0;
  return Object.freeze({reserve(size){need(Number.isSafeInteger(size)&&size>=0&&frames<maxFrames&&bytes+size<=maxBytes,'PC18_IPC_QUEUE_LIMIT');frames++;bytes+=size;let released=false;return()=>{if(!released){released=true;frames--;bytes-=size;}};},status(){return{frames,bytes,maxFrames,maxBytes};}});
}

export async function runAssemblyProcess(kind, callbacks) {
  need(['owner', 'producer', 'assembler'].includes(kind), 'PC18_PROCESS_KIND');
  const bootstrap = createReadStream(null, { fd: 3, autoClose: true }), chunks = []; let size = 0, config;
  try {
    for await (const chunk of bootstrap) { size += chunk.length; need(size <= ASSEMBLY_IPC_MAX_BYTES, 'PC18_BOOTSTRAP_SIZE'); chunks.push(chunk); }
    config = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks))); canonical(config);
  } finally { for (const chunk of chunks) chunk.fill(0); }
  if (kind !== 'owner') { exactAssemblyFields(config, kind === 'producer' ? ['kind', 'role', 'policy', 'bridgeToken'] : ['kind', 'scope', 'policy', 'pins']); need(config.kind === kind); const { kind: ignored, ...rest } = config; config = rest; }
  const actor = (kind === 'owner' ? createAssemblyOwner : kind === 'producer' ? createAssemblyProducer : createAssemblyAssembler)(config, callbacks);
  const channelNames = kind === 'owner' ? ['sol', 'btc', 'assembler', ...(config.walletCustody ? ['wallet'] : [])] : kind === 'producer' ? ['owner', 'broker', 'assembler'] : ['owner', 'sol', 'btc'];
  const sides = channelNames.map((name, i) => ({ name, stream: new Socket({ fd: i + 4, readable: true, writable: true }) }));
  let queue = Promise.resolve(), stopping = false, accepted = 0; const operations = {}, startedAtNs = stamp();
  const decoders = [], queueBudget=createAssemblyQueueBudget();
  function close() { if (stopping) return; stopping = true; for (const d of decoders) d.close(); for (const side of sides) side.stream.destroy(); process.stdin.destroy(); }
  async function handle(value, channel, output) {
    if (stopping) return; let id = null;
    try {
      exactAssemblyFields(value, ['id', 'operation', 'input']); need(typeof value.id === 'string' && /^[A-Za-z0-9_-]{1,48}$/.test(value.id), 'PC18_IPC_ID'); id = value.id;
      need(typeof value.operation === 'string' && value.operation.length <= 48, 'PC18_IPC_OPERATION'); allow(kind, channel, value.operation);
      const result = await actor.request(channel, value.operation, value.input); accepted++; operations[`${channel}:${value.operation}`] = (operations[`${channel}:${value.operation}`] ?? 0) + 1;
      const provenance = { pid: process.pid, atNs: stamp(), accepted, operation: value.operation, channel };
      await sendFrame(output, { id, ok: true, value: result, provenance });
      if (value.operation === 'shutdown') close();
    } catch (error) { await sendFrame(output, { id, ok: false, code: safeCode(error) }); }
  }
  for (const { name, stream, output = stream } of [{ name: 'control', stream: process.stdin, output: process.stdout }, ...sides]) {
    const decoder = createAssemblyFrameDecoder(value => { let release;try{release=queueBudget.reserve(Buffer.byteLength(canonical(value)));}catch{void sendFrame(output,{id:null,ok:false,code:'PC18_IPC_QUEUE_LIMIT'}).catch(()=>{}).finally(close);process.exitCode=1;return;}queue = queue.then(() => handle(value, name, output)).catch(() => { close(); process.exitCode = 1; }).finally(release); }, error => { queue = queue.then(async () => { await sendFrame(output, { id: null, ok: false, code: safeCode(error) }); close(); process.exitCode = 1; }).catch(close); });
    decoders.push(decoder); stream.on('data', chunk => decoder.push(chunk)); stream.on('error', () => { queue = queue.then(close); });
    stream.on('end', () => { decoder.end(); if (name === 'control') queue = queue.then(close); });
  }
  process.once('SIGTERM', () => { close(); process.exitCode = 0; });
  await sendFrame(process.stdout, { event: 'ready', kind, pid: process.pid, startedAtNs, operations: clone(ASSEMBLY_OPERATION_INVENTORY[kind]) });
}

/** Control stdout never exposes owner terms/openings/A or producer L packages.
 * Side streams are handed to trusted role-to-role routing, not decoded here.
 * Counters distinguish locally refused calls from writes sent to a dead owner.
 */
export function attachAssemblyControl(child, kind) {
  need(child?.stdin && child?.stdout && Number.isSafeInteger(child.pid), 'PC18_CHILD_PROCESS_REQUIRED');
  const pending = new Map(), seen = [], counts = {}; let serial = 0, closed = false, closing = false, rejectedAfterExit = 0, writesAfterExit = 0, readyResolve, readyReject, exitResolve;
  const ready = new Promise((resolve, reject) => { readyResolve = resolve; readyReject = reject; });
  const exited = new Promise(resolve => { exitResolve = resolve; });
  let lastOwnerMessage = null, startedAtNs = stamp(), exitedAtNs = null;
  const finish = (code, signal) => {
    if (closed) return; closed = true; closing = true; exitedAtNs = stamp();
    for (const entry of pending.values()) entry.reject(Object.assign(new Error('PC18_PROCESS_EXITED'), { code: 'PC18_PROCESS_EXITED' })); pending.clear();
    readyReject(new Error('PC18_PROCESS_EXITED'));
    for (const stream of child.stdio) if (stream && !stream.destroyed) stream.destroy();
    exitResolve({ pid: child.pid, code, signal, exitedAtNs });
  };
  const decoder = createAssemblyFrameDecoder(frame => {
    try {
      if (frame.event === 'ready') { exactAssemblyFields(frame, ['event', 'kind', 'pid', 'startedAtNs', 'operations']); need(frame.kind === kind && frame.pid === child.pid); same(frame.operations, ASSEMBLY_OPERATION_INVENTORY[kind], 'PC18_PROCESS_INVENTORY'); startedAtNs = frame.startedAtNs; readyResolve(clone(frame)); return; }
      need(typeof frame.id === 'string' && pending.has(frame.id), 'PC18_UNKNOWN_REPLY');
      const entry = pending.get(frame.id); pending.delete(frame.id);
      if (frame.ok === true) {
        exactAssemblyFields(frame, ['id', 'ok', 'value', 'provenance']); exactAssemblyFields(frame.provenance, ['pid', 'atNs', 'accepted', 'operation', 'channel']);
        need(frame.provenance.pid === child.pid && frame.provenance.channel === 'control' && frame.provenance.operation === entry.operation, 'PC18_REPLY_PROVENANCE');
        if (entry.operation !== 'shutdown') lastOwnerMessage = { operation: entry.operation, atNs: frame.provenance.atNs, valueSHA256: assemblyPackageDigest(frame.value) };
        if (seen.length < 4096) seen.push(clone(frame.provenance)); entry.resolve(frame.value);
      } else { exactAssemblyFields(frame, ['id', 'ok', 'code']); need(frame.ok === false && /^(PC18|PC23|WALLET_CUSTODY)_[A-Z0-9_]+$/.test(frame.code)); entry.reject(Object.assign(new Error(frame.code), { code: frame.code })); }
    } catch (error) { for (const entry of pending.values()) entry.reject(error); pending.clear(); child.kill('SIGTERM'); readyReject(error); }
  }, error => { readyReject(error); for (const entry of pending.values()) entry.reject(error); pending.clear(); child.kill('SIGTERM'); });
  child.stdout.on('data', chunk => decoder.push(chunk)); child.stdout.on('end', () => decoder.end());
  child.stdin.on('error', () => {}); child.stderr?.resume(); child.once('error', error => { readyReject(error); finish(null, 'error'); }); child.once('close', finish);
  async function request(operation, input = null) {
    if (closed || closing) { rejectedAfterExit++; fail('PC18_PROCESS_STOPPED'); }
    allow(kind, 'control', operation); await ready;
    if (closed || closing) { rejectedAfterExit++; fail('PC18_PROCESS_STOPPED'); }
    const id = `control_${++serial}`; counts[operation] = (counts[operation] ?? 0) + 1;
    return new Promise((resolve, reject) => { pending.set(id, { resolve, reject, operation }); if (closed) { writesAfterExit++; pending.delete(id); reject(new Error('PC18_PROCESS_STOPPED')); return; } child.stdin.write(encodeAssemblyFrame({ id, operation, input }), error => { if (error) { pending.delete(id); reject(error); } }); });
  }
  return Object.freeze({ pid: child.pid, ready, exited, request,
    async stop() { if (!closed && !closing) { await request('shutdown'); closing = true; child.stdin.end(); } return exited; },
    async terminate({ forceAfterMs = 5000 } = {}) {
      need(Number.isSafeInteger(forceAfterMs) && forceAfterMs > 0 && forceAfterMs <= 5000, 'PC18_TERMINATION_BOUND');
      if (closed) return exited;
      closing = true; child.kill('SIGTERM');
      const timer = setTimeout(() => { if (!closed) child.kill('SIGKILL'); }, forceAfterMs);
      try { return await exited; } finally { clearTimeout(timer); }
    },
    provenance() { return { kind, pid: child.pid, startedAtNs, exitedAtNs, closed, callsByOperation: { ...counts }, events: clone(seen), lastOwnerMessage: lastOwnerMessage && clone(lastOwnerMessage), rejectedAfterExit, writesAfterExit, channelsClosed: closed && child.stdio.every(stream => !stream || stream.destroyed) }; },
  });
}
export function launchAssemblyProcess(kind, bootstrap) {
  need(['owner', 'producer', 'assembler'].includes(kind), 'PC18_PROCESS_KIND'); canonical(bootstrap);
  const path = fileURLToPath(new URL(kind === 'owner' ? './private-assembly-owner-process.mjs' : './private-assembly-actor-process.mjs', import.meta.url));
  const child = spawn(process.execPath, [path, ...(kind === 'owner' ? [] : [kind])], { stdio: ['pipe', 'pipe', 'pipe', 'pipe', 'pipe', 'pipe', 'pipe', ...(kind === 'owner' && bootstrap.walletCustody ? ['pipe'] : [])], env: { PATH: process.env.PATH, HOME: process.env.HOME, LANG: 'C.UTF-8' } });
  const control = attachAssemblyControl(child, kind); child.stdio[3].end(Buffer.from(canonical(bootstrap)));
  const names = kind === 'owner' ? ['sol', 'btc', 'assembler', ...(bootstrap.walletCustody ? ['wallet'] : [])] : kind === 'producer' ? ['owner', 'broker', 'assembler'] : ['owner', 'sol', 'btc'];
  return Object.freeze({ control, channels: Object.freeze(Object.fromEntries(names.map((name, i) => [name, child.stdio[i + 4]]))) });
}

/** Fixed local proof-worker isolation. A private witness goes straight from its
 * actor into this child, never via controller IPC. stdout/stderr are discarded
 * with byte caps; only bounded fd3 JSON is parsed. Wait for close before return
 * so actor idleness cannot retain the worker's Wasm address space.
 * spawnWorker/timeout injection is a host-test seam, never an IPC operation or
 * a bootstrap option. Production uses only fixed repository proof/note/verifier workers.
 */
export const ASSEMBLY_WORKER_RESOURCE_FLOORS = PRIVATE_RESOURCE_FLOORS;
export function assemblyWorkerResourceViolations(snapshot) {
  need(snapshot && ['availableRAM', 'freeDisk'].every(k => Number.isSafeInteger(snapshot[k]) && snapshot[k] >= 0), 'PC18_WORKER_RESOURCE_SAMPLE');
  const result=Object.keys(ASSEMBLY_WORKER_RESOURCE_FLOORS).filter(k => snapshot[k] < ASSEMBLY_WORKER_RESOURCE_FLOORS[k]);
  if(snapshot.childRSS!==undefined){need(Number.isSafeInteger(snapshot.childRSS)&&snapshot.childRSS>=0,'PC18_WORKER_RESOURCE_SAMPLE');if(snapshot.childRSS>PRIVATE_PROOF_WORKER_RSS_LIMIT)result.push('childRSS');}return result;
}
/** Only numerical resource diagnostics, no witness, proof, IPC data or process
 * arguments. The exact trip sample is captured before terminating this child. */
function archiveAssemblyWorkerResourceAbort(mode, operation, child, snapshot, violations) {
  let childRSS = null;
  if (Number.isSafeInteger(child.pid) && child.pid > 0) {
    try { const match = /VmRSS:\s+(\d+)/.exec(readFileSync(`/proc/${child.pid}/status`, 'utf8')); if (match) childRSS = Number(match[1]) * 1024; } catch {}
  }
  const directory = fileURLToPath(new URL('../evidence/m18-worker-resource-aborts/', import.meta.url));
  const at = new Date().toISOString();
  const record = { classification: 'EXACT_EXTERNAL_WORKER_RESOURCE_FLOOR_SAMPLE', at, mode, operation, resourcePolicy:PRIVATE_RESOURCE_POLICY, floorBytes: ASSEMBLY_WORKER_RESOURCE_FLOORS, observedBytes: snapshot, violated: violations, actorRSS: process.memoryUsage().rss, childRSS, noWitnessOrNativeIdentifiers: true };
  mkdirSync(directory, { recursive: true });
  writeFileSync(directory + at.replace(/[:.]/g, '-') + '-' + process.pid + '-' + process.hrtime.bigint() + '.json', JSON.stringify(record, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
}

function assemblyWorkerRunner(operation, { spawnWorker, timeoutMs = operation === 'verify' ? 330000 : 930000 } = {}) {
  need(Number.isSafeInteger(timeoutMs) && timeoutMs > 0 && timeoutMs <= 930000, 'PC18_WORKER_TIMEOUT_BOUND');
  const launch = spawnWorker ?? (mode => {
    const relative = WALLET_WORDS[mode] ? '../experiments/private-core-proof/wallet-notes/one-proof-worker.mjs' : operation === 'verify' ? '../experiments/private-core-proof/owner-independent/verify-worker.mjs'
      : mode === 'reserve' ? '../experiments/private-core-proof/owner-independent/note-prove-worker.mjs'
        : '../experiments/private-core-proof/owner-independent/prove-worker.mjs';
    return spawn(process.execPath, [fileURLToPath(new URL(relative, import.meta.url))], {
      stdio: ['pipe', 'pipe', 'pipe', 'pipe'], env: { PATH: process.env.PATH, HOME: process.env.HOME, LANG: 'C.UTF-8' },
    });
  });
  return async function proveInWorker(mode, input, label) {
    need(MODES.includes(mode), 'PC18_WORKER_MODE');
    need(typeof label === 'string' && /^[A-Za-z0-9_-]{1,100}$/.test(label), 'PC18_WORKER_LABEL');
    const request = Buffer.from(canonical({ mode, input, label, operation }));
    need(request.length <= 4 * 1024 * 1024, 'PC18_WORKER_REQUEST_SIZE');
    let child;
    try { child = launch(mode); } catch { request.fill(0); fail('PC18_WORKER_SPAWN'); }
    need(child?.stdin && child?.stdout && child?.stderr && child.stdio?.[3], 'PC18_WORKER_PIPES');
    const result = await new Promise((resolve, reject) => {
      const chunks = []; let size = 0, stdoutBytes = 0, stderrBytes = 0, failure = null, killTimer, closed = false;
      const abort = code => {
        if (closed) return; failure ??= code; child.kill('SIGTERM');
        killTimer ??= setTimeout(() => { if (!closed) child.kill('SIGKILL'); }, 5000);
      };
      const timer = setTimeout(() => abort('PC18_WORKER_TIMEOUT'), timeoutMs);
      // External to synchronous Wasm: parent remains responsive during proof work.
      const memoryWatch = setInterval(() => {
        const disk = statfsSync(process.cwd());
        const snapshot = { availableRAM: Number(/MemAvailable:\s+(\d+)/.exec(readFileSync('/proc/meminfo', 'utf8'))[1]) * 1024, freeDisk: disk.bavail * disk.bsize };
        if (Number.isSafeInteger(child.pid) && child.pid > 0 && child.exitCode === null && child.signalCode === null) {
          try { const match=/VmRSS:\s+(\d+)/.exec(readFileSync(`/proc/${child.pid}/status`,'utf8')); if(match) snapshot.childRSS=Number(match[1])*1024; } catch(error) { if(error.code!=='ENOENT') { abort('PC18_WORKER_RESOURCE_READ'); return; } }
        }
        const violations = assemblyWorkerResourceViolations(snapshot);
        if (violations.length) {
          // Telemetry failure must never prevent the original fail-closed action.
          if (!failure && !closed) try { archiveAssemblyWorkerResourceAbort(mode, operation, child, snapshot, violations); } catch {}
          abort(violations.includes('childRSS')?'PC18_WORKER_RSS_BUDGET':'PC18_WORKER_RESOURCE_FLOOR');
        }
      }, 250);
      const parentStopping = () => abort('PC18_WORKER_PARENT_STOPPING');
      const parentExiting = () => { if (!closed) child.kill('SIGKILL'); };
      process.once('SIGTERM', parentStopping); process.once('exit', parentExiting);
      child.stdout.on('data', chunk => { stdoutBytes += chunk.length; if (stdoutBytes > 1024 * 1024) abort('PC18_WORKER_LOG_SIZE'); });
      child.stderr.on('data', chunk => { stderrBytes += chunk.length; if (stderrBytes > 1024 * 1024) abort('PC18_WORKER_LOG_SIZE'); });
      child.stdio[3].on('data', chunk => { size += chunk.length; if (size > 2 * 1024 * 1024) abort('PC18_WORKER_RESULT_SIZE'); else chunks.push(Buffer.from(chunk)); });
      child.stdio[3].on('error', () => abort('PC18_WORKER_RESULT_IO'));
      child.stdin.on('error', () => abort('PC18_WORKER_REQUEST_IO'));
      child.once('error', () => abort('PC18_WORKER_SPAWN'));
      child.once('close', (code, signal) => {
        closed = true; clearTimeout(timer); clearTimeout(killTimer); clearInterval(memoryWatch); process.removeListener('SIGTERM', parentStopping); process.removeListener('exit', parentExiting); request.fill(0);
        try {
          need(!failure, failure ?? 'PC18_WORKER_FAILURE');
          const bytes = Buffer.concat(chunks), decoded = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
          bytes.fill(0); const envelope = JSON.parse(decoded);
          // Parsed JSON cannot have getters/proxies; backend metrics contain
          // fractional timings, so do not apply integer-only canonical() here.
          const exactJSON = (v, keys) => need(v && typeof v === 'object' && !Array.isArray(v) && Object.keys(v).length === keys.length && keys.every(k => Object.hasOwn(v, k)), 'PC18_WORKER_RESULT_FIELDS');
          if (envelope.ok === false) {
            exactJSON(envelope, ['ok', 'code', 'name']);
            need(typeof envelope.name === 'string' && /^[A-Za-z][A-Za-z0-9_]{0,63}$/.test(envelope.name), 'PC18_WORKER_ERROR_NAME');
            need(typeof envelope.code === 'string' && /^(PC18|PC23|WALLET)_[A-Z0-9_]+$/.test(envelope.code), 'PC18_WORKER_FAILURE'); fail(envelope.code);
          }
          need(code === 0 && signal === null, 'PC18_WORKER_EXIT'); exactJSON(envelope, ['ok', 'result']); need(envelope.ok === true, 'PC18_WORKER_RESULT');
          const raw = envelope.result;
          if (operation === 'verify') { exactJSON(raw, ['verified']); need(typeof raw.verified === 'boolean', 'PC18_WORKER_VERIFY_RESULT'); resolve(raw.verified); return; }
          exactJSON(raw, ['proof', 'publicInputs', 'metrics', ...(recursive(mode) ? ['vkFields', 'proofFields'] : [])]);
          need(raw.metrics && typeof raw.metrics === 'object' && !Array.isArray(raw.metrics), 'PC18_WORKER_METRICS');
          const wire = { version: 1, mode, target: recursive(mode) ? 'noir-recursive' : 'evm', proofBase64: raw.proof, publicInputs: fromBackendFields(raw.publicInputs),
            ...(recursive(mode) ? { vkFields: fromBackendFields(raw.vkFields), proofFields: fromBackendFields(raw.proofFields) } : {}) };
          // Drop every backend metric and any possible diagnostic before the
          // result enters actor state; only typed proof material is retained.
          resolve(decodeAssemblyProofPackage(wire, mode));
        } catch (error) { reject(Object.assign(new Error(safeCode(error)), { code: safeCode(error) })); }
        finally { for (const chunk of chunks) chunk.fill(0); for (const stream of child.stdio) if (stream && !stream.destroyed) stream.destroy(); }
      });
      child.stdin.end(request, () => request.fill(0));
    });
    return result;
  };
}
export const createAssemblyProofWorkerRunner = options => assemblyWorkerRunner('prove', options);
export function createAssemblyVerificationWorkerRunner(options) {
  const run = assemblyWorkerRunner('verify', options);
  return async (mode, proofPackage, label = `pc18-verify-${mode}`) => {
    need(mode !== 'reserve' && MODES.includes(mode), 'PC18_WORKER_VERIFY_MODE');
    need(proofPackage?.proof instanceof Uint8Array, 'PC18_PROOF_BYTES');
    const wire = validateAssemblyProofPackage({ version: 1, mode, target: recursive(mode) ? 'noir-recursive' : 'evm', proofBase64: Buffer.from(proofPackage.proof).toString('base64'),
      publicInputs: fromBackendFields(proofPackage.publicInputs), ...(recursive(mode) ? { vkFields: fromBackendFields(proofPackage.vkFields), proofFields: fromBackendFields(proofPackage.proofFields) } : {}) }, mode);
    const input = { proofBase64: wire.proofBase64, publicInputs: wire.publicInputs, ...(recursive(mode) ? { vkFields: wire.vkFields, proofFields: wire.proofFields } : {}) };
    return run(mode, input, label);
  };
}
export const proveAssemblyInWorker = createAssemblyProofWorkerRunner();
export const verifyAssemblyInWorker = createAssemblyVerificationWorkerRunner();
