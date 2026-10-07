/** Genuine R98 -> owned native signing boundary for the common-host fixture.
 * No graph/slot/nk, caller verifier, key, RPC or executable is accepted. The
 * provider's fresh attestation key is encrypted in its own Vault; native keys
 * remain in the factory-marked adapter. Same-host roles are not independent.
 *
 * Vault durability/rollback/OS assumptions apply. A dispatch is durably claimed
 * before transfer() and checked signed bytes are persisted before broadcast.
 * Only an exact exception from our beforeSign callback, before it returns,
 * proves no key use and permits retry. Every other uncertainty means NO RESEND.
 * FULL_OWNER_REFUND_PROVIDER_LOSS_V1 allows partial delivery and full owner
 * refund at the provider's loss. It provides no insurance or recovery promise.
 */
import { createHash, createPrivateKey, createPublicKey, verify } from 'node:crypto';
import { types } from 'node:util';
import { isAbsolute } from 'node:path';
import { canonical } from '../privacy.mjs';
import { Vault } from '../vault.mjs';
import { freshKey, signature } from '../private-note-encoding.mjs';
import { SECP256K1_ORDER } from '../private-native-certificate.mjs';
import { createProofProcess } from './proof-process.mjs';
import { loadProofProfile } from './proof-worker.mjs';
import { assertOwnedNativeSystem } from './native-deployment.mjs';
import { readNativeSystemState } from './native-system-state.mjs';
import { assertOwnedNativeRecipientProcess } from './native-recipient-process.mjs';
import { nativeTransferActionCommitment } from './native-capsules.mjs';
import { canonicalNativeEffectId } from './native-receipt.mjs';
import { nativeProviderIdentity, nativeAdmissionChainDomain, nativeAdmissionRuleCommitment,
  nativeDeliveryRiskCommitment, nativeReadyStatementDigest, nativeDispatchStatementFrame,
  NATIVE_ADMISSION_LOSS_CLAUSE } from './native-admission.mjs';
import { createNativeHubMessageHostVerifier, assertFinalityHealthValid } from '../evidence/native-hub-messages.mjs';
import { assertTrustedLocalNativeQuorumObserver, nativeFixtureEndpointCommitment,
  nativeFixtureCustodyCommitment } from '../evidence/native-quorum-observer.mjs';
import { assertOwnedSolanaRuntime, assertOwnedSolanaRecipientView, base58Decode,
  decodeSolanaTransfer } from '../chains/solana-runtime.mjs';
import { assertOwnedBitcoinRuntime, validateBitcoinTransferWire } from '../chains/bitcoin-runtime.mjs';

export const NATIVE_DISPATCH_GATE_PROFILE = 'LIANUM_PAEG_NATIVE_DISPATCH_GATE_V1';
const TERMS = ['scope', 'policy', 'asset', 'amount', 'executionFrom', 'executionUntil', 'settleBefore'];
const TEMPLATE = ['chainDomain', 'signerIdentity', 'sourceCommitment', 'destinationCommitment', 'amount',
  'custodyKind', 'custodyCommitment', 'executionFrom', 'executionUntil', 'settleBefore'];
const QUOTE = ['scope', 'policy', 'asset', 'hubDomain', 'registryCommitment', 'action', 'payoutCommitment', 'deliveryRiskSalt'];
const R_DIGEST_FIELDS = ['scope', 'policy', 'asset', 'hubDomain', 'registryCommitment', 'snapshotDigest',
  'localCommitment', 'dispatchId', 'chainDomain', 'evidencePolicy', 'actionCommitment', 'payoutCommitment'];
const FIELD = 21888242871839275222246405745257275088548364400416034343698204186575808495617n;
const fail = code => { throw Object.assign(new Error(code), { code }); };
const need = (ok, code = 'PAEG_DISPATCH_INPUT') => { if (!ok) fail(code); };
const copy = value => JSON.parse(canonical(value));
const equal = (a, b) => canonical(a) === canonical(b);
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const freeze = value => { for (const child of Object.values(value)) if (child && typeof child === 'object' && !(child instanceof Uint8Array)) freeze(child); return Object.freeze(value); };
function exact(value, fields) {
  need(value && !types.isProxy(value) && Object.getPrototypeOf(value) === Object.prototype);
  const descriptors = Object.getOwnPropertyDescriptors(value), keys = Reflect.ownKeys(descriptors);
  need(keys.length === fields.length && fields.every(name => keys.includes(name))
    && fields.every(name => descriptors[name].enumerable && Object.hasOwn(descriptors[name], 'value')));
}
function hash(value) { need(typeof value === 'string' && /^[0-9a-f]{64}$/.test(value) && value.length === 64 && value !== '0'.repeat(64)); return value; }
function uint(value, bits = 64, positive = false) {
  need(typeof value === 'string' && /^(0|[1-9][0-9]*)$/.test(value) && value.length <= 39
    && BigInt(value).toString() === value && BigInt(value) < (1n << BigInt(bits)) && (!positive || BigInt(value) > 0n));
  return value;
}
const at = (inputs, offset) => inputs.slice(offset, offset + 8).map(word => BigInt(word).toString(16).padStart(8, '0')).join('');
function actionCopy(input) {
  const action = copy(input); nativeTransferActionCommitment(action);
  for (const [field, value] of Object.entries(action)) {
    if (field === 'amount') uint(value, 128, true);
    else if (['executionFrom', 'executionUntil', 'settleBefore'].includes(field)) uint(value);
    else if (field !== 'custodyKind') hash(value);
  }
  return action;
}

/** Pure wire validation only. This never authenticates or verifies a proof.
 * Takes an owned copy before any await; the caller cannot mutate a checked R.
 */
export function normalizeNativeDispatchRequest(input) {
  exact(input, ['readyProof', 'action', 'deliveryRiskSalt']);
  exact(input.readyProof, ['proof', 'publicInputs']);
  const source = input.readyProof.proof;
  need(source instanceof Uint8Array && !types.isProxy(source) && source.length === 458 * 32,
    'PAEG_DISPATCH_READY_PROOF_BYTES');
  need([Buffer.prototype, Uint8Array.prototype].includes(Object.getPrototypeOf(source))
    && Reflect.ownKeys(source).length === source.length, 'PAEG_DISPATCH_READY_PROOF_BYTES');
  const proof = Buffer.from(source), publicInputs = copy(input.readyProof.publicInputs);
  need(Array.isArray(publicInputs) && publicInputs.length === 98, 'PAEG_DISPATCH_READY_INPUTS');
  publicInputs.forEach((word, index) => uint(word, index < 96 ? 32 : 64));
  // The proof worker's official deflattenFields uses the same 32-byte BE fields.
  const proofFields = Array.from({ length: 458 }, (_, index) => {
    const field = BigInt('0x' + proof.subarray(index * 32, (index + 1) * 32).toString('hex'));
    need(field < FIELD, 'PAEG_DISPATCH_READY_PROOF_FIELD'); return field.toString();
  });
  const action = actionCopy(input.action);
  const deliveryRiskSalt = hash(input.deliveryRiskSalt);
  return freeze({ readyProof: { proof, publicInputs }, proofFields, action, deliveryRiskSalt });
}

/** Pure local terms binding. Synthetic bytes passing this are NOT verified. */
export function assertNativeDispatchBinding(binding, input) {
  exact(binding, ['terms', 'hubDomain', 'registryCommitment', 'providerKey', 'evidencePolicy', 'quote']);
  const terms = copy(binding.terms), quote = copy(binding.quote);
  exact(terms, TERMS); exact(quote, QUOTE);
  const request = normalizeNativeDispatchRequest(input), r = request.readyProof.publicInputs;
  const statement = Object.fromEntries(R_DIGEST_FIELDS.map((field, index) => [field, hash(at(r, index * 8))]));
  statement.readyFrom = r[96]; statement.readyUntil = r[97];
  for (const name of ['scope', 'policy', 'asset']) need(statement[name] === terms[name] && quote[name] === terms[name], 'PAEG_DISPATCH_TERMS_CHANGED');
  for (const name of ['hubDomain', 'registryCommitment']) need(statement[name] === binding[name] && quote[name] === binding[name], 'PAEG_DISPATCH_HUB_CHANGED');
  need(equal(request.action, quote.action) && request.deliveryRiskSalt === quote.deliveryRiskSalt, 'PAEG_DISPATCH_QUOTE_CHANGED');
  const action = request.action;
  need(action.signerIdentity === nativeProviderIdentity(binding.providerKey), 'PAEG_DISPATCH_PROVIDER_CHANGED');
  for (const name of ['amount', 'executionFrom', 'executionUntil', 'settleBefore']) need(action[name] === terms[name], 'PAEG_DISPATCH_TERMS_CHANGED');
  need(statement.actionCommitment === nativeTransferActionCommitment(action), 'PAEG_DISPATCH_ACTION_CHANGED');
  need(statement.chainDomain === action.chainDomain && statement.evidencePolicy === binding.evidencePolicy,
    'PAEG_DISPATCH_CHAIN_CHANGED');
  need(statement.payoutCommitment === quote.payoutCommitment, 'PAEG_DISPATCH_PAYOUT_CHANGED');
  const risk = nativeDeliveryRiskCommitment({ clause: NATIVE_ADMISSION_LOSS_CLAUSE,
    hubDomain: binding.hubDomain, registryCommitment: binding.registryCommitment,
    chainDomain: action.chainDomain, sourceCommitment: action.sourceCommitment,
    destinationCommitment: action.destinationCommitment, amount: action.amount,
    scope: terms.scope, policy: terms.policy, asset: terms.asset, payoutCommitment: quote.payoutCommitment,
    settleBefore: action.settleBefore, salt: request.deliveryRiskSalt });
  need(risk === action.deliveryRiskCommitment, 'PAEG_DISPATCH_RISK_CHANGED');
  need(BigInt(action.executionFrom) <= BigInt(statement.readyFrom)
    && BigInt(statement.readyFrom) < BigInt(statement.readyUntil)
    && BigInt(statement.readyUntil) <= BigInt(action.executionUntil)
    && BigInt(statement.readyUntil) <= BigInt(action.settleBefore), 'PAEG_DISPATCH_READY_WINDOW');
  const intent = { statement, readyInputs: [...r], readyStatement: nativeReadyStatementDigest(r),
    readyProofSHA256: sha(request.readyProof.proof), action: copy(action), deliveryRiskSalt: request.deliveryRiskSalt };
  return { request, intent: freeze(intent) };
}

/** Pure journal rule, used by the durable gate. Reconciliation NEVER means
 * calling transfer again. Only our persisted no-key-use rejection can retry. */
export function nativeDispatchRetryDecision(previous, nextIntent) {
  canonical(nextIntent);
  if (previous === null) return 'FIRST';
  exact(previous, ['phase', 'intent']);
  const previousIntent = previous.intent;
  for (const field of R_DIGEST_FIELDS.filter(field => field !== 'snapshotDigest')) {
    need(previousIntent.statement[field] === nextIntent.statement[field], 'PAEG_DISPATCH_REBOUND');
  }
  need(equal(previousIntent.action, nextIntent.action)
    && previousIntent.deliveryRiskSalt === nextIntent.deliveryRiskSalt, 'PAEG_DISPATCH_REBOUND');
  if (previous.phase === 'PRE_SIGN_REJECTED') return 'RETRY_PRE_SIGN';
  need(equal(previousIntent, nextIntent), 'PAEG_DISPATCH_REBOUND');
  need(['INTENT', 'PREPARED', 'SIGNED', 'BROADCAST', 'UNCERTAIN', 'OBSERVED'].includes(previous.phase), 'PAEG_DISPATCH_JOURNAL_PHASE');
  return 'RECONCILE';
}

function configuration(input) {
  exact(input, ['path', 'password', 'evmRuntime', 'system', 'poolIndex', 'nativeRuntime', 'observer', 'rule',
    'recipientIndex', 'terms', 'acceptedLossClause']);
  need(typeof input.path === 'string' && isAbsolute(input.path) && !input.path.includes('\0'));
  need(typeof input.password === 'string' && input.password.length > 0 && Buffer.byteLength(input.password) <= 1024);
  need((input.poolIndex === 0 || input.poolIndex === 1) && !Object.is(input.poolIndex, -0));
  need(Number.isInteger(input.recipientIndex) && input.recipientIndex >= 0 && input.recipientIndex < 2 && !Object.is(input.recipientIndex, -0));
  need(input.acceptedLossClause === NATIVE_ADMISSION_LOSS_CLAUSE, 'PAEG_DISPATCH_EXPLICIT_LOSS_ACCEPTANCE');
  assertOwnedNativeSystem(input.evmRuntime, input.system);
  assertTrustedLocalNativeQuorumObserver(input.observer, input.evmRuntime, input.system);
  const terms = copy(input.terms); exact(terms, TERMS);
  for (const key of ['scope', 'policy', 'asset']) hash(terms[key]);
  uint(terms.amount, 128, true); for (const name of ['executionFrom', 'executionUntil', 'settleBefore']) uint(terms[name]);
  need(BigInt(terms.executionFrom) < BigInt(terms.executionUntil) && BigInt(terms.executionUntil) <= BigInt(terms.settleBefore));
  const rule = copy(input.rule), chainDomain = nativeAdmissionChainDomain(rule), evidencePolicy = nativeAdmissionRuleCommitment(rule);
  need(input.observer.rules.some(value => equal(value, rule)), 'PAEG_DISPATCH_UNREGISTERED_RULE');
  const family = rule.family === '1' ? 'BTC' : rule.family === '2' ? 'SOL' : null;
  need(family, 'PAEG_DISPATCH_UNSUPPORTED_NATIVE_FAMILY');
  let native = input.nativeRuntime, genesis, source, destination, sourceRaw, destinationRaw;
  if (family === 'SOL') {
    assertOwnedSolanaRuntime(native);
    native = typeof native.recipientView === 'function' ? native.recipientView(input.recipientIndex) : (need(input.recipientIndex === 0), native);
    assertOwnedSolanaRecipientView(native);
    genesis = base58Decode(native.genesis, 32).toString('hex'); source = native.solver; destination = native.recipient;
    sourceRaw = base58Decode(source, 32).toString('hex'); destinationRaw = base58Decode(destination, 32).toString('hex');
    need(BigInt(terms.amount) <= BigInt(Number.MAX_SAFE_INTEGER), 'PAEG_DISPATCH_NATIVE_AMOUNT');
  } else {
    assertOwnedBitcoinRuntime(native); genesis = native.genesis; source = native.source; destination = native.recipients[input.recipientIndex];
    sourceRaw = native.sourceScript; destinationRaw = native.recipientScripts[input.recipientIndex];
    need(BigInt(terms.amount) <= 1000000000n, 'PAEG_DISPATCH_NATIVE_AMOUNT');
  }
  need(rule.genesis === genesis, 'PAEG_DISPATCH_NATIVE_GENESIS');
  const pool = input.system.pools[input.poolIndex];
  for (const [field, expected] of [['scope', pool.scope], ['policy', pool.policy], ['asset', pool.assetIdentity]])
    need('0x' + terms[field] === expected, 'PAEG_DISPATCH_POOL_TERMS');
  const sourceCommitment = nativeFixtureEndpointCommitment({ family, genesis, asset: rule.asset, rawHex: sourceRaw });
  const destinationCommitment = nativeFixtureEndpointCommitment({ family, genesis, asset: rule.asset, rawHex: destinationRaw });
  const custodyCommitment = nativeFixtureCustodyCommitment({ chainDomain, sourceCommitment, destinationCommitment });
  const bootstrap = { profile: NATIVE_DISPATCH_GATE_PROFILE, pool: pool.address, hubDomain: input.system.hubDomain.slice(2),
    registryCommitment: input.system.registryCommitment.slice(2), rule, recipientIndex: input.recipientIndex, terms,
    acceptedLossClause: input.acceptedLossClause, family, genesis, source, destination, sourceRaw, destinationRaw,
    chainDomain, evidencePolicy, sourceCommitment, destinationCommitment, custodyCommitment,
    changeAddress: family === 'BTC' ? native.changeAddress : null,
    changeScript: family === 'BTC' ? native.changeScript : null };
  return { ...input, terms, native, bootstrap: freeze(bootstrap) };
}
function template(bootstrap, providerKey) {
  return { chainDomain: bootstrap.chainDomain, signerIdentity: nativeProviderIdentity(providerKey),
    sourceCommitment: bootstrap.sourceCommitment, destinationCommitment: bootstrap.destinationCommitment,
    amount: bootstrap.terms.amount, custodyKind: 1, custodyCommitment: bootstrap.custodyCommitment,
    ...Object.fromEntries(['executionFrom', 'executionUntil', 'settleBefore'].map(field => [field, bootstrap.terms[field]])) };
}
function keyPair(state) {
  const privateKey = createPrivateKey(state.privateKeyPem), publicKey = createPublicKey(privateKey), jwk = publicKey.export({ format: 'jwk' });
  need(jwk.crv === 'secp256k1' && jwk.kty === 'EC', 'PAEG_DISPATCH_PROVIDER_KEY');
  need(equal(state.providerKey, { x: Buffer.from(jwk.x, 'base64url').toString('hex'), y: Buffer.from(jwk.y, 'base64url').toString('hex') }), 'PAEG_DISPATCH_PROVIDER_KEY');
  return { privateKey, publicKey };
}
function bindingFor(state) { return { terms: state.bootstrap.terms, hubDomain: state.bootstrap.hubDomain,
  registryCommitment: state.bootstrap.registryCommitment, providerKey: state.providerKey,
  evidencePolicy: state.bootstrap.evidencePolicy, quote: state.quote }; }
function validateQuote(state, input) {
  exact(input, QUOTE); const quote = copy(input), boot = state.bootstrap;
  for (const field of ['scope', 'policy', 'asset']) need(quote[field] === boot.terms[field], 'PAEG_DISPATCH_QUOTE_TERMS');
  for (const field of ['hubDomain', 'registryCommitment']) need(quote[field] === boot[field], 'PAEG_DISPATCH_QUOTE_HUB');
  hash(quote.payoutCommitment); hash(quote.deliveryRiskSalt); actionCopy(quote.action);
  need(equal(Object.fromEntries(TEMPLATE.map(field => [field, quote.action[field]])), template(boot, state.providerKey)), 'PAEG_DISPATCH_QUOTE_TEMPLATE');
  const risk = nativeDeliveryRiskCommitment({ clause: NATIVE_ADMISSION_LOSS_CLAUSE, hubDomain: boot.hubDomain,
    registryCommitment: boot.registryCommitment, chainDomain: quote.action.chainDomain,
    sourceCommitment: quote.action.sourceCommitment, destinationCommitment: quote.action.destinationCommitment,
    amount: quote.action.amount, scope: quote.scope, policy: quote.policy, asset: quote.asset,
    payoutCommitment: quote.payoutCommitment, settleBefore: quote.action.settleBefore, salt: quote.deliveryRiskSalt });
  need(risk === quote.action.deliveryRiskCommitment, 'PAEG_DISPATCH_QUOTE_RISK'); return quote;
}
function nativeUnsigned(boot, input) {
  const value = copy(input);
  if (boot.family === 'SOL') {
    need(base58Decode(value.genesis, 32).toString('hex') === boot.genesis, 'PAEG_DISPATCH_NATIVE_GENESIS');
    need(value.genesisHex === '0x' + boot.genesis && value.solver === boot.source && value.solverHex === '0x' + boot.sourceRaw
      && value.recipient === boot.destination && value.recipientHex === '0x' + boot.destinationRaw && value.lamports === boot.terms.amount,
    'PAEG_DISPATCH_NATIVE_INTENT');
    base58Decode(value.recentBlockhash, 32);
    need(Number.isSafeInteger(value.lastValidBlockHeight) && value.lastValidBlockHeight >= 0, 'PAEG_DISPATCH_NATIVE_INTENT');
  } else {
    need(value.genesis === boot.genesis && value.source === boot.source && value.recipient === boot.destination
      && value.recipientIndex === boot.recipientIndex && value.intent.sourceScript === boot.sourceRaw
      && value.intent.recipientScript === boot.destinationRaw && value.intent.amountSatoshi === boot.terms.amount
      && value.changeAddress === boot.changeAddress && value.intent.changeScript === boot.changeScript,
    'PAEG_DISPATCH_NATIVE_INTENT');
    const decoded = validateBitcoinTransferWire(value.unsignedTransaction, value.intent);
    need(decoded.transactionSHA256 === value.transactionSHA256, 'PAEG_DISPATCH_NATIVE_WIRE');
  }
  return value;
}
function nativeSigned(boot, unsigned, input) {
  const value = copy(input); let transactionId;
  if (boot.family === 'SOL') {
    const decoded = decodeSolanaTransfer(value.transactionBase64);
    for (const key of ['signature', 'signatureHex', 'solver', 'solverHex', 'recipient', 'recipientHex', 'lamports', 'recentBlockhash', 'instructionIndex', 'transactionSHA256'])
      need(value[key] === decoded[key], 'PAEG_DISPATCH_NATIVE_WIRE');
    for (const key of ['solver', 'solverHex', 'recipient', 'recipientHex', 'lamports', 'recentBlockhash', 'lastValidBlockHeight', 'genesis', 'genesisHex'])
      need(value[key] === unsigned[key], 'PAEG_DISPATCH_NATIVE_INTENT');
    need(value.instructionIndex === 0 && value.phase === 'SIGNED_NOT_BROADCAST' && value.broadcastAttempts === 0, 'PAEG_DISPATCH_NATIVE_PREBROADCAST');
    transactionId = base58Decode(value.signature, 64).toString('hex');
  } else {
    const decoded = validateBitcoinTransferWire(value.rawTransaction, unsigned.intent, { signed: true });
    need(decoded.unsignedTransaction === unsigned.unsignedTransaction && decoded.txid === value.txid && decoded.wtxid === value.wtxid
      && decoded.transactionSHA256 === value.transactionSHA256 && value.vout === 0 && equal(value.intent, unsigned.intent)
      && value.genesis === boot.genesis && value.source === boot.source && value.recipient === boot.destination
      && value.recipientIndex === boot.recipientIndex && value.amountSatoshi === boot.terms.amount
      && value.changeAddress === unsigned.changeAddress, 'PAEG_DISPATCH_NATIVE_WIRE');
    need(value.phase === 'SIGNED_NOT_BROADCAST' && value.broadcastAttempts === 0, 'PAEG_DISPATCH_NATIVE_PREBROADCAST'); transactionId = decoded.txid;
  }
  const effect = { chainDomain: { chain: boot.family, genesis: boot.genesis, asset: boot.rule.asset },
    effectIdentity: { transactionId, effectIndex: '0' } };
  return { signedNative: value, globalEffectId: canonicalNativeEffectId(effect), effect };
}

async function openGate(input, recover) {
  const cfg = configuration(input), vault = new Vault(cfg.path);
  let password = cfg.password, record, closed = false, busy = false, uncertain = false, proofProcess;
  delete cfg.password;
  if (recover) record = await vault.read(password);
  else {
    const key = freshKey();
    record = await vault.create({ version: 1, bootstrap: cfg.bootstrap, privateKeyPem: key.privateKey.export({ type: 'pkcs8', format: 'pem' }),
      providerKey: { x: key.x.toString('hex'), y: key.y.toString('hex') }, quote: null, journal: null, preSignRejections: 0 }, password);
  }
  let state = record.data;
  exact(state, ['version', 'bootstrap', 'privateKeyPem', 'providerKey', 'quote', 'journal', 'preSignRejections']);
  need(state.version === 1 && equal(state.bootstrap, cfg.bootstrap), 'PAEG_DISPATCH_RECOVERY_BINDING');
  need(Number.isSafeInteger(state.preSignRejections) && state.preSignRejections >= 0, 'PAEG_DISPATCH_RECOVERY_JOURNAL');
  let key = keyPair(state);
  if (state.quote !== null) validateQuote(state, state.quote);
  if (state.journal !== null) {
    const journal = state.journal;
    exact(journal, ['phase', 'intent', 'unsigned', 'signed', 'observation']);
    need(state.quote, 'PAEG_DISPATCH_RECOVERY_JOURNAL');
    exact(journal.intent, ['statement', 'readyInputs', 'readyStatement', 'readyProofSHA256', 'action', 'deliveryRiskSalt']);
    const intent = journal.intent, r = intent.readyInputs, boot = state.bootstrap;
    need(intent.readyStatement === nativeReadyStatementDigest(r), 'PAEG_DISPATCH_RECOVERY_READY');
    hash(intent.readyProofSHA256);
    const statement = Object.fromEntries(R_DIGEST_FIELDS.map((field, index) => [field, hash(at(r, index * 8))]));
    Object.assign(statement, { readyFrom: r[96], readyUntil: r[97] });
    need(equal(statement, intent.statement) && equal(intent.action, state.quote.action)
      && intent.deliveryRiskSalt === state.quote.deliveryRiskSalt, 'PAEG_DISPATCH_RECOVERY_READY');
    for (const [field, expected] of Object.entries({ ...Object.fromEntries(['scope', 'policy', 'asset'].map(field => [field, boot.terms[field]])),
      hubDomain: boot.hubDomain, registryCommitment: boot.registryCommitment, chainDomain: boot.chainDomain,
      evidencePolicy: boot.evidencePolicy, actionCommitment: nativeTransferActionCommitment(intent.action), payoutCommitment: state.quote.payoutCommitment }))
      need(statement[field] === expected, 'PAEG_DISPATCH_RECOVERY_READY');
    need(BigInt(intent.action.executionFrom) <= BigInt(statement.readyFrom) && BigInt(statement.readyFrom) < BigInt(statement.readyUntil)
      && BigInt(statement.readyUntil) <= BigInt(intent.action.executionUntil), 'PAEG_DISPATCH_RECOVERY_READY');
    // Authenticated recovery accepts only the state this gate could persist.
    nativeDispatchRetryDecision({ phase: journal.phase, intent: journal.intent }, journal.intent);
    need(!['INTENT', 'PREPARED', 'PRE_SIGN_REJECTED'].includes(journal.phase) || journal.signed === null, 'PAEG_DISPATCH_RECOVERY_JOURNAL');
    need(!['SIGNED', 'BROADCAST', 'OBSERVED'].includes(journal.phase) || journal.signed !== null, 'PAEG_DISPATCH_RECOVERY_JOURNAL');
    need(journal.phase !== 'PREPARED' || journal.unsigned !== null, 'PAEG_DISPATCH_RECOVERY_JOURNAL');
    if (journal.unsigned !== null) nativeUnsigned(state.bootstrap, journal.unsigned);
    if (journal.signed !== null) {
      const checked = nativeSigned(state.bootstrap, journal.unsigned, journal.signed.signedNative);
      need(equal(checked.effect, journal.signed.effect) && checked.globalEffectId === journal.signed.globalEffectId, 'PAEG_DISPATCH_RECOVERY_WIRE');
      const dispatch = journal.signed.dispatchStatement;
      need(equal(dispatch, { hubDomain: boot.hubDomain, registryCommitment: boot.registryCommitment,
        readyStatement: intent.readyStatement, localCommitment: statement.localCommitment, dispatchId: statement.dispatchId,
        actionCommitment: statement.actionCommitment, globalEffectId: checked.globalEffectId,
        deliveryRiskCommitment: intent.action.deliveryRiskCommitment, signedAt: dispatch.signedAt }), 'PAEG_DISPATCH_RECOVERY_DISPATCH');
      uint(dispatch.signedAt);
      need(BigInt(statement.readyFrom) <= BigInt(dispatch.signedAt) && BigInt(dispatch.signedAt) < BigInt(statement.readyUntil), 'PAEG_DISPATCH_RECOVERY_DISPATCH');
      const signed = journal.signed.dispatchSignature; need(typeof signed === 'string' && /^[0-9a-f]{128}$/.test(signed), 'PAEG_DISPATCH_RECOVERY_SIGNATURE');
      const s = BigInt('0x' + signed.slice(64));
      need(s > 0n && s <= SECP256K1_ORDER / 2n && verify('sha256', nativeDispatchStatementFrame(dispatch),
        { key: key.publicKey, dsaEncoding: 'ieee-p1363' }, Buffer.from(signed, 'hex')), 'PAEG_DISPATCH_RECOVERY_SIGNATURE');
    }
  }
  const healthVerifier = createNativeHubMessageHostVerifier({ registry: cfg.system.registry, expectedRegistryCommitment: cfg.system.registryCommitment.slice(2) });
  const live = () => need(!closed && !uncertain, uncertain ? 'PAEG_DISPATCH_JOURNAL_UNCERTAIN_RECOVER' : 'PAEG_DISPATCH_CLOSED');
  async function persist(next) {
    live();
    try { const saved = await vault.update(password, record.revision, () => next); record = saved; state = saved.data; }
    catch (cause) { uncertain = true; const error = new Error('PAEG_DISPATCH_JOURNAL_UNCERTAIN_RECOVER'); error.code = error.message; error.cause = cause; throw error; }
  }
  async function current(intent) {
    const began = performance.now();
    assertTrustedLocalNativeQuorumObserver(cfg.observer, cfg.evmRuntime, cfg.system);
    const health = await cfg.observer.health({});
    need(health.status === 'HEALTHY', 'PAEG_DISPATCH_GLOBAL_HEALTH_UNAVAILABLE');
    const observed = await readNativeSystemState(cfg.evmRuntime, cfg.system, cfg.poolIndex);
    const checkpointCurrent = await cfg.system.hub.call('isCheckpointCurrent(bytes32)', ['0x' + intent.statement.snapshotDigest], observed.header.number);
    await cfg.evmRuntime.assertCanonical(observed.header);
    const latest = await cfg.evmRuntime.block();
    need(latest.hash === observed.header.hash && latest.number === observed.header.number, 'PAEG_DISPATCH_STATE_CHANGED_DURING_CHECK');
    need(checkpointCurrent === '0x' + '0'.repeat(63) + '1', 'PAEG_DISPATCH_CHECKPOINT_STALE');
    need(observed.snapshot.halt === '0', 'PAEG_DISPATCH_HALTED');
    const now = BigInt(observed.snapshot.timestamp), statement = intent.statement;
    need(BigInt(statement.readyFrom) <= now && now < BigInt(statement.readyUntil)
      && BigInt(intent.action.executionFrom) <= now && now < BigInt(intent.action.executionUntil), 'PAEG_DISPATCH_OUTSIDE_READY_WINDOW');
    assertFinalityHealthValid(health.message, { ...observed.evidence, halt: observed.snapshot.halt, timestamp: observed.snapshot.timestamp });
    healthVerifier.assertFinalityHealthQuorum({ message: health.message, indexes: health.indexes, signatures: health.signatures });
    need(performance.now() - began <= 30000, 'PAEG_DISPATCH_HEALTH_CHECK_TOO_OLD');
    return observed.snapshot.timestamp;
  }
  function result() {
    const journal = state.journal;
    need(journal?.signed, 'PAEG_DISPATCH_NO_KNOWN_IDENTITY_NO_RESEND');
    return copy({ ...journal.signed, providerKey: state.providerKey, phase: journal.phase,
      readyStatement: journal.intent.readyStatement, readyProofSHA256: journal.intent.readyProofSHA256,
      readyInputs: journal.intent.readyInputs, deliveryRiskAcceptance: state.bootstrap.acceptedLossClause,
      observation: journal.observation, classification: 'COMMON_HOST_OWNED_NATIVE_DISPATCH_NOT_INDEPENDENT_OPERATORS' });
  }
  async function reconcile() {
    live(); const journal = state.journal;
    need(journal?.signed, 'PAEG_DISPATCH_NO_KNOWN_IDENTITY_NO_RESEND');
    const native = journal.signed.signedNative, boot = state.bootstrap;
    const observation = boot.family === 'SOL'
      ? await cfg.native.observe(native.signature, { expectedLamports: boot.terms.amount, commitment: 'finalized', timeoutMs: 0 })
      : await cfg.native.observe(native.txid);
    need(observation.success === true && observation.finalized === true, 'PAEG_DISPATCH_OBSERVATION_PENDING_NO_RESEND');
    need(boot.family === 'SOL' ? observation.signature === native.signature && observation.transactionSHA256 === native.transactionSHA256
      : observation.txid === native.txid && observation.transactionSHA256 === native.transactionSHA256, 'PAEG_DISPATCH_OBSERVATION_IDENTITY');
    await persist({ ...state, journal: { ...journal, phase: 'OBSERVED', observation: copy(observation) } });
    return result();
  }
  return Object.freeze({
    offer() { live(); return freeze(copy({ providerKey: state.providerKey, signerIdentity: nativeProviderIdentity(state.providerKey),
      actionTemplate: template(state.bootstrap, state.providerKey), evidencePolicy: state.bootstrap.evidencePolicy,
      acceptedLossClause: state.bootstrap.acceptedLossClause })); },
    async bindQuote(input) {
      exact(input, ['recipientCustody']); live(); need(!busy, 'PAEG_DISPATCH_BUSY');
      assertOwnedNativeRecipientProcess(input.recipientCustody); busy = true;
      try {
        const quote = validateQuote(state, await input.recipientCustody.acceptedQuote());
        if (state.quote !== null) { need(equal(state.quote, quote), 'PAEG_DISPATCH_QUOTE_REBOUND'); return { bound: true, payoutCommitment: quote.payoutCommitment }; }
        need(state.journal === null, 'PAEG_DISPATCH_QUOTE_REBOUND');
        await persist({ ...state, quote }); return { bound: true, payoutCommitment: quote.payoutCommitment };
      } finally { busy = false; }
    },
    async execute(input) {
      live(); need(!busy && state.quote, 'PAEG_DISPATCH_BUSY_OR_UNBOUND');
      const { request, intent } = assertNativeDispatchBinding(bindingFor(state), input);
      const decision = nativeDispatchRetryDecision(state.journal && { phase: state.journal.phase, intent: state.journal.intent }, intent);
      busy = true;
      try {
        if (decision === 'RECONCILE') return await reconcile();
        proofProcess ??= createProofProcess({ purpose: 'ready', modes: ['ready'] });
        const pinned = loadProofProfile('ready');
        const checked = await proofProcess.verify('ready', { ...request.readyProof, proofFields: request.proofFields,
          vkFields: pinned.vkFields }, [...request.readyProof.publicInputs], 'native-provider-ready');
        need(checked.verified === true, 'PAEG_DISPATCH_INVALID_READY_PROOF');
        await current(intent);
        await persist({ ...state, journal: { phase: 'INTENT', intent, unsigned: null, signed: null, observation: null } });
        let beforeSignError, beforeSignCalled = false, authorizationReturned = false, signedAt, onSignedCalled = false;
        const beforeSign = async input => {
          try {
            need(!beforeSignCalled, 'PAEG_DISPATCH_REPEATED_BEFORE_SIGN'); beforeSignCalled = true;
            const unsigned = nativeUnsigned(state.bootstrap, input);
            await persist({ ...state, journal: { ...state.journal, phase: 'PREPARED', unsigned } });
            // This is the final awaited authorization step before native key use.
            signedAt = await current(intent); authorizationReturned = true;
          } catch (error) { beforeSignError = error; throw error; }
        };
        const onSigned = async input => {
          need(authorizationReturned && !onSignedCalled, 'PAEG_DISPATCH_SIGNING_ORDER'); onSignedCalled = true;
          const checked = nativeSigned(state.bootstrap, state.journal.unsigned, input);
          const statement = intent.statement, dispatchStatement = { hubDomain: state.bootstrap.hubDomain,
            registryCommitment: state.bootstrap.registryCommitment, readyStatement: intent.readyStatement,
            localCommitment: statement.localCommitment, dispatchId: statement.dispatchId, actionCommitment: statement.actionCommitment,
            globalEffectId: checked.globalEffectId, deliveryRiskCommitment: intent.action.deliveryRiskCommitment, signedAt };
          const dispatchSignature = signature(key, nativeDispatchStatementFrame(dispatchStatement)).toString('hex');
          await persist({ ...state, journal: { ...state.journal, phase: 'SIGNED',
            signed: { ...checked, dispatchStatement, dispatchSignature } } });
          // Resolving authorizes the adapter's sole broadcast, after durable save.
        };
        try {
          const native = state.bootstrap.family === 'SOL'
            ? await cfg.native.transfer(state.bootstrap.terms.amount, { beforeSign, onSigned })
            : await cfg.native.transfer(state.bootstrap.terms.amount, { recipientIndex: state.bootstrap.recipientIndex, beforeSign, onSigned });
          need(onSignedCalled && state.journal.signed, 'PAEG_DISPATCH_SIGNING_ORDER');
          const retained = state.journal.signed.signedNative;
          need(state.bootstrap.family === 'SOL' ? native.signature === retained.signature && native.transactionSHA256 === retained.transactionSHA256
            : native.txid === retained.txid && native.transactionSHA256 === retained.transactionSHA256, 'PAEG_DISPATCH_BROADCAST_IDENTITY');
          await persist({ ...state, journal: { ...state.journal, phase: 'BROADCAST' } }); return result();
        } catch (error) {
          if (!uncertain) {
            const provenNoKeyUse = error === beforeSignError && !authorizationReturned && !onSignedCalled;
            await persist({ ...state, preSignRejections: state.preSignRejections + (provenNoKeyUse ? 1 : 0),
              journal: { ...state.journal, phase: provenNoKeyUse ? 'PRE_SIGN_REJECTED' : 'UNCERTAIN' } });
          }
          throw error;
        }
      } finally { request.readyProof.proof.fill(0); busy = false; }
    },
    async reconcile() { live(); need(!busy, 'PAEG_DISPATCH_BUSY'); busy = true; try { return await reconcile(); } finally { busy = false; } },
    report() { return { profile: NATIVE_DISPATCH_GATE_PROFILE, phase: state.journal?.phase ?? (state.quote ? 'BOUND' : 'OFFERED'),
      closed, uncertain, preSignRejections: state.preSignRejections, proofVerification: proofProcess?.report() ?? null,
      commonHostFixture: true, independentOperators: false }; },
    async close() { need(!busy, 'PAEG_DISPATCH_BUSY'); if (!closed) { closed = true; password = ''; key = null; state.privateKeyPem = ''; await proofProcess?.close(); } return { closed: true }; },
  });
}
export const createNativeDispatchGate = input => openGate(input, false);
export const recoverNativeDispatchGate = input => openGate(input, true);
