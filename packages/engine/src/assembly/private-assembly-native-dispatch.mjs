/** PC18 trusted surviving role broker. This is an owner-independent availability
 * service in the common trusted harness, NOT malicious-host/process isolation.
 * The original bridge's WeakMap handle remains here; IPC gets only a random,
 * role-bound one-use routing token. No owner callback is accepted by this API.
 * Importing the module starts no runtime, proof, process or network operation.
 */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { canonical } from '../crypto/privacy.mjs';
import { localCommitment } from '../notes/private-note-encoding.mjs';
import { validateRecipientTerms } from '../recipients/private-recipient-custody.mjs';
import { assertAssemblyStatement } from './private-assembly-encoding.mjs';
import { validateAssemblyProofPackage, decodeAssemblyProofPackage, exactAssemblyFields } from './private-assembly-actors.mjs';
import { assertPrivateRootHistory } from './private-assembly-history.mjs';
import { assertPrivateAssemblyRevocations } from './private-assembly-revocations.mjs';
import { PrivateNoteTree, noteWordsToHash, privateSpentDigest, privateEffectDigest, assertPrivateNoteHeadroom } from '../notes/private-note-tree.mjs';
import { assertPrivateSnapshotCanonical } from './private-assembly-runtime.mjs';
import { base58Encode, base58Decode } from '../chains/solana/solana-runtime.mjs';

const fail = code => { throw Object.assign(new Error(code), { code }); };
const need = (ok, code) => { if (!ok) fail(code); };
const stamp = () => process.hrtime.bigint().toString();
const digest = value => createHash('sha256').update(typeof value === 'string' || value instanceof Uint8Array ? value : canonical(value)).digest('hex');
const clone = value => JSON.parse(canonical(value));
const words = value => noteWordsToHash(value);
const hex32 = value => need(typeof value === 'string' && /^[0-9a-f]{64}$/.test(value), 'PC18_DISPATCH_HASH');
export function assemblyFieldInventory(value, prefix = '') {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return [];
  return Object.entries(value).flatMap(([key, child]) => {
    const name = prefix ? `${prefix}.${key}` : key;
    return [name, ...assemblyFieldInventory(child, name)];
  }).sort();
}
export function assemblyProofDigest(pkg) {
  return { mode: pkg.mode, proofSHA256: createHash('sha256').update(Buffer.from(pkg.proofBase64, 'base64')).digest('hex'),
    statementSHA256: digest(pkg.publicInputs), statementWords: pkg.publicInputs.length, packageSHA256: digest(pkg) };
}
export function assemblyEvmProof(pkg) {
  const decoded = decodeAssemblyProofPackage(pkg);
  return { proof: decoded.proof, publicInputs: decoded.publicInputs.map(value => `0x${BigInt(value).toString(16).padStart(64, '0')}`) };
}

/** All equality checks are host boundary checks. The caller MUST subsequently
 * invoke the deployed genuine verifier and recheck the same canonical header.
 * These checks are never reported as cryptographic verification evidence.
 */
export function assertAssemblyReadinessSnapshot(role, proof, state, binding) {
  need(role === 'sol' || role === 'btc', 'PC18_DISPATCH_ROLE');
  const mode = `${role}_ready`, p = validateAssemblyProofPackage(proof, mode), inputs = p.publicInputs;
  assertAssemblyStatement(mode, inputs);
  const t = validateRecipientTerms(binding.terms), d = t.descriptor;
  need(t.role === role && state.scope === `0x${t.scope}` && state.policy === `0x${t.policy}`, 'PC18_DISPATCH_DOMAIN');
  need(binding.localCommitment === localCommitment(t.scope, t.policy, { ...d, payout: binding.paymentCommitment }).toString('hex'), 'PC18_DISPATCH_LOCAL_OPENING');
  need(BigInt(state.epoch) === BigInt(state.blockTimestamp) / 600n && state.sequence === state.stateSequence, 'PC18_DISPATCH_SNAPSHOT_EPOCH');
  assertPrivateRootHistory(state);
  assertPrivateAssemblyRevocations(state);
  need(!state.revocationCoverageHalted, 'PC18_REVOCATION_COVERAGE_HALTED');
  need(new PrivateNoteTree(state.leaves.slice(0, state.leafCount)).root === state.root, 'PC18_DISPATCH_CANONICAL_TREE');
  need(privateSpentDigest(state.scope, state.nullifiers, state.spentCount) === state.spentDigest, 'PC18_DISPATCH_SPENT_DIGEST');
  for (const own of ['sol', 'btc']) need(privateEffectDigest(own.toUpperCase(), state.scope, state[`${own}Effects`], state[`${own}EffectCount`]) === state[`${own}EffectDigest`], 'PC18_DISPATCH_EFFECT_DIGEST');
  assertPrivateNoteHeadroom(state);
  need(state.liveReservations > 0, 'PC18_DISPATCH_NO_RESERVATION');
  const hashes = [[8, state.scope], [16, state.policy], [25, state.rootHistoryDigest], [34, state.root], [42, state.spentDigest], [52, `0x${binding.localCommitment}`]];
  const scalars = [[24, state.epoch], [33, state.rootHistoryCount], [50, state.spentCount], [51, state.stateSequence], [60, state.revocationCoverageHalted ? 1 : 0]];
  if (role === 'btc') { hashes.push([61, state.solEffectDigest], [70, state.solRevokedDigest]); scalars.push([69, state.solEffectCount], [78, state.solRevokedCount]); }
  for (const [offset, expected] of hashes) need(words(inputs.slice(offset, offset + 8)) === expected, 'PC18_READINESS_STALE_OR_MISMATCH');
  for (const [offset, expected] of scalars) need(BigInt(inputs[offset]) === BigInt(expected), 'PC18_READINESS_STALE_OR_MISMATCH');
  const now = BigInt(state.blockTimestamp), epoch = BigInt(state.epoch);
  need(now >= BigInt(d.executeAfter) && now < BigInt(d.executeBefore) && epoch >= BigInt(d.validFrom) && epoch < BigInt(d.validUntil), 'PC18_DISPATCH_DEADLINE');
  return p;
}

/** Factory injects only trusted, already-owned local adapters. One instance is
 * one role of one reservation, so it never sees a sibling descriptor/opening.
 * createBridge receives immutable PC15 authorization/retention callbacks.
 * Its handle and envelope are retained privately for PC16 fresh observation.
 */
export function createAssemblyNativeDispatch({ role, bridgeToken, createBridge, recipientAck, nativeDestination, nowSeconds, onEvent = () => {}, archivePrivate = async () => {} }) {
  need(role === 'sol' || role === 'btc', 'PC18_DISPATCH_ROLE'); hex32(bridgeToken);
  need(typeof createBridge === 'function' && typeof recipientAck === 'function' && typeof nowSeconds === 'function', 'PC18_DISPATCH_CALLBACK');
  let pool, runtime, binding, currentProof, nativeHandle, envelope, authority, phase = 'UNBOUND', busy = false;
  let firstSignedAtNs = null, authorizedAtNs = null, dispatchEnteredAtNs = null, certifiedAtNs = null;
  const events = [];
  const event = (operation, extra = {}) => { const item = { role, operation, atNs: stamp(), ...extra }; events.push(item); onEvent(clone(item)); return item; };
  const token = supplied => { hex32(supplied); need(supplied === bridgeToken, 'PC18_DISPATCH_CAPABILITY'); };
  const requestFor = () => {
    need(binding, 'PC18_DISPATCH_BINDING_REQUIRED');
    const d = binding.terms.descriptor;
    return { localInstructionCommitment: binding.localCommitment, invocationNonce: d.nonce,
      source: role === 'sol' ? base58Encode(Buffer.from(d.source, 'hex')) : d.source,
      recipient: role === 'sol' ? base58Encode(Buffer.from(d.recipient, 'hex')) : nativeDestination,
      amount: d.amount, executeAfter: d.executeAfter, executeBefore: d.executeBefore,
      validFromEpoch: d.validFrom, validUntilEpoch: d.validUntil };
  };
  async function checkReadiness(proof) {
    need(pool && runtime && binding, 'PC18_DISPATCH_BINDING_REQUIRED');
    const state = await pool.snapshot(), validated = assertAssemblyReadinessSnapshot(role, proof, state, binding);
    need(BigInt(state.blockTimestamp) === BigInt(nowSeconds()), 'PC18_DISPATCH_CLOCK');
    need(await pool.verify(`${role}_ready`, Buffer.from(validated.proofBase64, 'base64'), validated.publicInputs, state.blockNumber) === true, 'PC18_DISPATCH_GENUINE_READINESS');
    // Independently resolve the retained own native target at the same checked
    // state. These reads do not supply a predecessor descriptor to BTC.
    if (role === 'btc') {
      const address = await runtime.btc('getaddressinfo', [nativeDestination], 'm9-recipient');
      need(address.ismine === true && digest(Buffer.from(address.scriptPubKey, 'hex')) === binding.terms.descriptor.recipient, 'PC18_DISPATCH_NATIVE_RECIPIENT');
    } else need(base58Decode(nativeDestination, 32).toString('hex') === binding.terms.descriptor.recipient, 'PC18_DISPATCH_NATIVE_RECIPIENT');
    const ack = await recipientAck({ terms: binding.terms, paymentCommitment: binding.paymentCommitment, localCommitment: binding.localCommitment });
    need(ack?.acknowledged === true && ack.paymentCommitment === binding.paymentCommitment && ack.localCommitment === binding.localCommitment, 'PC18_DISPATCH_RECIPIENT_ACK');
    await assertPrivateSnapshotCanonical(runtime, state);
    event('genuine-readiness-current-header-ack', { blockNumber: state.blockNumber, blockHash: state.blockHash, stateSequence: state.stateSequence, ...assemblyProofDigest(validated) });
    return validated;
  }
  const bridge = createBridge({
    async authorizeLocalInvocation(request, policy) {
      need(phase === 'DISPATCHING' && currentProof, 'PC18_DISPATCH_PHASE');
      need(policy.chainDomain.chain === role.toUpperCase(), 'PC18_DISPATCH_ROLE');
      need(canonical(request) === canonical(requestFor()), 'PC18_DISPATCH_EXACT_REQUEST');
      await checkReadiness(currentProof);
      authorizedAtNs = event('authorized-before-native-signing').atNs;
    },
    async retainSignedDispatch(request, signed, policy) {
      need(phase === 'DISPATCHING' && authorizedAtNs && !firstSignedAtNs, 'PC18_DISPATCH_SIGN_ORDER');
      need(policy.chainDomain.chain === role.toUpperCase() && canonical(request) === canonical(requestFor()), 'PC18_DISPATCH_EXACT_REQUEST');
      await archivePrivate({kind:'signed-native-dispatch',role,request:clone(request),signed:clone(signed),policy:clone(policy)});
      firstSignedAtNs = event('actual-signature-retained-before-broadcast', { signedFields: assemblyFieldInventory(signed) }).atNs;
    },
    async archiveCertificate(candidate, policy) {
      need(policy.chainDomain.chain === role.toUpperCase(), 'PC18_DISPATCH_ROLE');
      await archivePrivate({kind:'native-certificate',role,envelope:clone(candidate),policy:clone(policy)});
      event('own-certificate-authentic-observation', { fields: assemblyFieldInventory(candidate) });
    },
  });
  need(bridge?.policy?.chainDomain?.chain === role.toUpperCase(), 'PC18_DISPATCH_BRIDGE_ROLE');
  return Object.freeze({
    policy: bridge.policy,
    attachPool(ownedPool, ownedRuntime) { need(!pool && phase === 'UNBOUND', 'PC18_DISPATCH_POOL_ALREADY_BOUND'); pool = ownedPool; runtime = ownedRuntime; },
    retainBinding(value) {
      exactAssemblyFields(value, ['role', 'bridgeToken', 'terms', 'paymentCommitment', 'localCommitment']); token(value.bridgeToken);
      need(!binding && phase === 'UNBOUND' && value.role === role, 'PC18_DISPATCH_BINDING_PHASE');
      hex32(value.paymentCommitment); hex32(value.localCommitment); const t = validateRecipientTerms(value.terms);
      need(t.role === role && t.descriptor.chain === (role === 'sol' ? 1 : 2), 'PC18_DISPATCH_ROLE');
      need(localCommitment(t.scope, t.policy, { ...t.descriptor, payout: value.paymentCommitment }).toString('hex') === value.localCommitment, 'PC18_DISPATCH_LOCAL_OPENING');
      binding = clone(value); phase = 'READY'; event('own-binding-retained', { bindingSHA256: digest(value), fields: assemblyFieldInventory(value) });
      return { role, retained: true, bindingSHA256: digest(value) };
    },
    attachAuthority(factory) { need(!authority && typeof factory === 'function', 'PC18_DISPATCH_AUTHORITY_PHASE'); authority = factory(bridge); },
    async dispatch(input) {
      exactAssemblyFields(input, ['bridgeToken', 'readiness']); token(input.bridgeToken);
      need(!busy && phase === 'READY', 'PC18_DISPATCH_CAPABILITY_USED_OR_BUSY'); busy = true;
      try {
        // Preflight before immutable bridge nonce consumption. A stale proof
        // rejected here permits one caller-managed refresh without exposure.
        currentProof = await checkReadiness(input.readiness);
        phase = 'DISPATCHING'; dispatchEnteredAtNs = event('bridge-dispatch-entry').atNs;
        try { const dispatched = await bridge.dispatch(requestFor()); nativeHandle = dispatched.handle; need(nativeHandle && typeof nativeHandle === 'object', 'PC18_DISPATCH_HANDLE_REQUIRED'); phase = 'SUBMITTED'; }
        catch (error) { nativeHandle = error.dispatchHandle; phase = 'FAILED_OR_AMBIGUOUS'; event('dispatch-failed-no-retry', { hasRetainedHandle: Boolean(nativeHandle), signatureRetained: Boolean(firstSignedAtNs) }); throw error; }
        event('native-broadcast-returned'); return { submitted: true, role, dispatchEnteredAtNs, firstSignedAtNs };
      } finally { currentProof = undefined; busy = false; }
    },
    async certify(supplied) {
      token(supplied); need(!busy && phase === 'SUBMITTED' && nativeHandle && !envelope, 'PC18_DISPATCH_CERTIFY_PHASE'); busy = true;
      try { envelope = await bridge.observeAndCertify(nativeHandle); need(authority, 'PC18_DISPATCH_AUTHORITY_REQUIRED'); authority.remember(nativeHandle, envelope); phase = 'CERTIFIED'; certifiedAtNs = event('retained-handle-certified').atNs; return clone(envelope); }
      finally { busy = false; }
    },
    async permit(supplied, terminalPackage) {
      token(supplied); need(!busy && phase === 'CERTIFIED' && authority && nativeHandle, 'PC18_DISPATCH_PERMIT_PHASE'); busy = true;
      try { const result = await authority.observeAndPermit(nativeHandle, assemblyEvmProof(validateAssemblyProofPackage(terminalPackage, 'fulfill'))); event('fresh-current-authority-permit', { transactionHash: result.receipt.transactionHash, permitKey: result.permitKey }); return { chain: result.chain, receipt: result.receipt, permitKey: result.permitKey, statement: result.statement, observedAt: result.observedAt, validUntil: result.validUntil }; }
      finally { busy = false; }
    },
    audit() { return { role, phase, dispatchEnteredAtNs, authorizedAtNs, firstSignedAtNs, certifiedAtNs, retainedNativeHandle: Boolean(nativeHandle), retainedCertificate: Boolean(envelope), events: clone(events), classification: 'TRUSTED_SURVIVING_ROLE_SERVICE_HASH_ONLY_NOT_HOSTILE_HOST_ISOLATION' }; },
  });
}
