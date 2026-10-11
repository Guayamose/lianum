/** Flat P42/R50 -> one owned native signer boundary. The production factory
 * requires the actual branded pinned verifier. Native/state/store/provider
 * capabilities are trusted BOOTSTRAP seams, never fields of public requests.
 *
 * A journal claims the dispatch before native preparation. Only the identical
 * exception from this gate's unfinished beforeSign callback proves no key use.
 * All other uncertainty is latched: reconcile the SAME ID, never sign/resend.
 */
import assert from 'node:assert/strict';
import { createHash, createPublicKey, verify } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import { assertPinnedVerifier } from '@lianum/proofs/verification';
import { createCommitmentCodec, exactRecord, fixedArray, bytes32, canonicalField,
  validateStruct, ZERO } from '@lianum/components/encoding/commitments';
import { cloneInput, frozenInput, inputUint, inputPath, readyDescriptorWords } from '../../../execution/account/preparation/readiness-inputs.mjs';
import { decodeStatement, joinReadiness } from '@lianum/components/encoding/statements';
import { receiptKeyCommitment, nativeRuleCommitment, nativeCustodyCommitment, nativeFactIdentity,
  encodeBitcoinBinding, validateBitcoinBinding, encodeSolanaBindingMessage,
  validateSolanaBindingTransaction, assertMemoProgramAccount } from '@lianum/engine/native/native-receipt-binding';
import { assertFlatNativeHealth } from '../health/native-health.mjs';
import { evmFundingEndpointCommitment, validateEvmDeliveryWire } from '../../evm/dispatch/evm-facts-binding.mjs';
import { validateEvmGraphDeliveryDescriptorV1, evmGraphDeliveryDescriptorCommitmentV1,
  encodeEvmGraphDeliveryCallV1, evmGraphDeliveryTermsV1 } from '../../evm/dispatch/evm-graph-delivery-codec-v1.mjs';
import { assertSignedEvmTransaction, encodeCanonicalEvmUnsignedTransaction } from '../../evm/contracts/transaction-wire-codec.mjs';
import { LOCAL_EVM_PROFILE } from '../../evm/runtime/local-evm-profiles.mjs';
import { nativeTransferActionCommitment } from '@lianum/engine/execution/native/dispatch/native-capsules';
import { nativeAdmissionChainDomain, nativeAdmissionRuleRoot, nativeProviderIdentity,
  nativeDeliveryRiskCommitment, nativeReadyStatementDigest, nativeDispatchStatementFrame,
  NATIVE_ADMISSION_LOSS_CLAUSE } from '@lianum/engine/execution/native/dispatch/native-admission';
import { nativeQuorumRegistryCommitment, createNativeQuorumHostVerifier }
  from '@lianum/engine/evidence/native-quorum';
import { snapshotDigest, SNAPSHOT_FIELDS, boundedListDigest, membership }
  from '@lianum/engine/execution/native/state/native-state';
import { inspectGenericSnapshot } from '@lianum/engine/execution/local/local-ledger';
import { decodeBitcoinTransaction } from '@lianum/engine/chains/bitcoin/bitcoin-runtime';

export const NATIVE_DISPATCH_GATE_PROFILE = 'LIANUM_FLAT_NATIVE_DISPATCH_GATE_V1';
export const NATIVE_DISPATCH_JOURNAL_SCHEMA = 'LIANUM_FLAT_NATIVE_DISPATCH_JOURNAL_V1';
export const NATIVE_DISPATCH_ASSURANCE = 'OWNED_CAPABILITY_BOUNDARY_NOT_NATIVE_CONSENSUS_OR_INDEPENDENT_OPERATORS';
const ORDER = 0xfffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141n;
const PHASES = ['INTENT', 'PREPARED', 'PRE_SIGN_REJECTED', 'NATIVE_SIGNED', 'SIGNED', 'BROADCAST', 'UNCERTAIN', 'OBSERVED', 'ADVERSE'];
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const prefix = value => '0x' + value;
const fail = code => { throw new Error(code); };
const equal = (left, right) => assert.deepEqual(left, right, 'DISPATCH_REBOUND');
function canonical(value) {
  const sorted = item => Array.isArray(item) ? item.map(sorted) : item && typeof item === 'object'
    ? Object.fromEntries(Object.keys(item).sort().map(key => [key, sorted(item[key])])) : item;
  return JSON.stringify(sorted(value));
}
function hex(value, size) {
  assert.equal(typeof value, 'string'); assert.equal(value.length, size * 2);
  assert.match(value, /^[0-9a-f]+$/); return Buffer.from(value, 'hex');
}
function wireHex(value, maximum) {
  assert.equal(typeof value, 'string'); assert.ok(value.length > 0 && value.length <= maximum && value.length % 2 === 0);
  assert.equal(/^[0-9a-f]+$/.exec(value)?.[0], value, 'DISPATCH_WIRE_HEX'); return value;
}
function prefixedHex(value, size) {
  assert.equal(typeof value, 'string'); assert.equal(value.length, size * 2 + 2);
  assert.equal(value.slice(0, 2), '0x'); hex(value.slice(2), size); return value.slice(2);
}
function point(value) {
  exactRecord(value, ['x', 'y']); const x = hex(value.x, 32), y = hex(value.y, 32);
  return createPublicKey({ format: 'jwk', key: { kty: 'EC', crv: 'secp256k1',
    x: x.toString('base64url'), y: y.toString('base64url') } });
}
function assertProviderSignature(key, signature, statement) {
  const raw = hex(signature, 64), r = BigInt('0x' + signature.slice(0, 64)), s = BigInt('0x' + signature.slice(64));
  assert.ok(r > 0n && r < ORDER && s > 0n && s <= ORDER / 2n, 'DISPATCH_PROVIDER_LOW_S');
  assert.ok(verify('sha256', nativeDispatchStatementFrame(statement),
    { key: point(key), dsaEncoding: 'ieee-p1363' }, raw), 'DISPATCH_PROVIDER_SIGNATURE');
}
function endpoint(family, genesis, asset, raw) {
  const bytes = hex(raw, family === '1' ? 22 : 32);
  if (family === '1') assert.match(raw, /^0014[0-9a-f]{40}$/);
  else bytes32(raw, true);
  const parts = [Buffer.from('LIANUM/PAEG/native-endpoint/2'), Buffer.from('LIANUM_PAEG_NATIVE_4_V2'),
    Buffer.from(family === '1' ? 'BTC' : 'SOL'), hex(genesis, 32), hex(asset, 32),
    Buffer.from(family === '1' ? 'BTC_P2WPKH_SCRIPT' : 'SOL_PUBLIC_KEY'), bytes];
  return sha(Buffer.concat(parts.flatMap(part => {
    const length = Buffer.alloc(4); length.writeUInt32BE(part.length); return [length, part];
  })));
}
function action(value) {
  // The original commitment validates the complete, exact Action shape.
  nativeTransferActionCommitment(value);
  for (const [key, item] of Object.entries(value)) {
    if (key === 'amount') assert.ok(inputUint(item, 128) > 0n);
    else if (['executionFrom', 'executionUntil', 'settleBefore'].includes(key)) inputUint(item);
    else if (key === 'custodyKind') assert.equal(item, 1, 'DISPATCH_CUSTODY_KIND');
    else bytes32(item, true);
  }
  assert.ok(inputUint(value.executionFrom) < inputUint(value.executionUntil)
    && inputUint(value.executionUntil) <= inputUint(value.settleBefore), 'DISPATCH_EXECUTION_WINDOW');
}

/** Public bootstrap data, including a prior explicitly accepted provider-loss
 * quote. This is not a user-facing signer/configuration selection interface.
 */
export function normalizeNativeDispatchBinding(raw) {
  const value = cloneInput(raw);
  exactRecord(value, ['domain', 'pool', 'registry', 'rule', 'rulePath', 'providerKey',
    'native', 'quote', 'acceptedLossClause']);
  validateStruct('domain', value.domain); hex(value.pool, 20);
  assert.notEqual(value.pool, '0'.repeat(40));
  assert.equal(value.domain.ledgerNamespace, value.domain.hubDomain, 'DISPATCH_INITIAL_NAMESPACE');
  assert.equal(value.acceptedLossClause, NATIVE_ADMISSION_LOSS_CLAUSE, 'DISPATCH_EXPLICIT_LOSS_ACCEPTANCE');
  point(value.providerKey);
  assert.equal(value.registry.hubDomain, value.domain.hubDomain, 'DISPATCH_REGISTRY_HUB');
  assert.equal(nativeQuorumRegistryCommitment(value.registry), value.domain.registryCommitment, 'DISPATCH_REGISTRY');
  // Validate all four points and aliases now, even before the first permit.
  createNativeQuorumHostVerifier({ registry: value.registry, expectedRegistryCommitment: value.domain.registryCommitment });
  inputUint(value.registry.registryEpoch);
  nativeRuleCommitment(value.rule);
  exactRecord(value.rulePath, ['index', 'siblings']); inputUint(value.rulePath.index, 8, 7n);
  fixedArray(value.rulePath.siblings, 3); value.rulePath.siblings.forEach(item => bytes32(item));
  assert.equal(nativeAdmissionRuleRoot(value.rule, value.rulePath), value.registry.rulesRoot, 'DISPATCH_RULE_MEMBERSHIP');
  const native = value.native;
  const evm = native.family === '3';
  exactRecord(native, ['family', 'genesis', 'asset', 'sourceEndpoint', 'destinationEndpoint', 'changeEndpoint',
    ...(evm ? ['descriptor', 'depositProof'] : [])]);
  for (const name of ['family', 'genesis', 'asset']) assert.equal(native[name], value.rule[name], 'DISPATCH_NATIVE_DOMAIN');
  let source, destination;
  if (evm) {
    validateEvmGraphDeliveryDescriptorV1(native.descriptor);
    const identity = evmGraphDeliveryTermsV1(native.descriptor).identity;
    assert.equal(identity.genesisHash, native.genesis, 'DISPATCH_EVM_GENESIS');
    assert.equal(identity.shareIdentity, native.asset, 'DISPATCH_EVM_ASSET');
    assert.equal(identity.assetIdentity, value.domain.asset, 'DISPATCH_EVM_SOURCE_ASSET');
    assert.equal(identity.ledgerNamespace, value.domain.ledgerNamespace, 'DISPATCH_EVM_NAMESPACE');
    assert.equal(identity.solver, native.sourceEndpoint, 'DISPATCH_EVM_SOLVER');
    assert.equal(identity.router, native.destinationEndpoint, 'DISPATCH_EVM_ROUTER');
    assert.equal(native.changeEndpoint, null, 'DISPATCH_EVM_CHANGE_PADDING');
    wireHex(native.depositProof, 131072);
    source = evmFundingEndpointCommitment({ genesis: native.genesis, asset: native.asset, address: native.sourceEndpoint });
    destination = evmGraphDeliveryDescriptorCommitmentV1(native.descriptor);
  } else {
    source = endpoint(native.family, native.genesis, native.asset, native.sourceEndpoint);
    destination = endpoint(native.family, native.genesis, native.asset, native.destinationEndpoint);
    if (native.family === '1') {
      endpoint(native.family, native.genesis, native.asset, native.changeEndpoint);
      assert.notEqual(native.changeEndpoint, native.destinationEndpoint, 'DISPATCH_CHANGE_RECIPIENT');
    } else assert.equal(native.changeEndpoint, null, 'DISPATCH_SOL_CHANGE_PADDING');
  }
  assert.notEqual(source, destination, 'DISPATCH_NATIVE_SELF_PAYMENT');
  exactRecord(value.quote, ['action', 'payoutCommitment', 'deliveryRiskSalt']);
  action(value.quote.action); bytes32(value.quote.payoutCommitment, true); bytes32(value.quote.deliveryRiskSalt, true);
  const quoted = value.quote.action;
  assert.equal(quoted.signerIdentity, nativeProviderIdentity(value.providerKey), 'DISPATCH_PROVIDER_IDENTITY');
  assert.equal(quoted.chainDomain, nativeAdmissionChainDomain(value.rule), 'DISPATCH_QUOTE_CHAIN');
  assert.equal(quoted.sourceCommitment, source, 'DISPATCH_QUOTE_SOURCE');
  assert.equal(quoted.destinationCommitment, destination, 'DISPATCH_QUOTE_DESTINATION');
  assert.equal(quoted.custodyCommitment, nativeCustodyCommitment({ family: native.family, genesis: native.genesis,
    asset: native.asset, sourceCommitment: source, destinationCommitment: destination }), 'DISPATCH_CUSTODY');
  if (evm) {
    assert.equal(quoted.amount, evmGraphDeliveryTermsV1(native.descriptor).route.shareAmount, 'DISPATCH_EVM_EXACT_SHARES');
    for (const name of ['executionFrom', 'executionUntil'])
      assert.equal(quoted[name], evmGraphDeliveryTermsV1(native.descriptor).route[name], 'DISPATCH_EVM_EXACT_WINDOW');
    inputUint(quoted.amount, 64);
  } else assert.ok(inputUint(quoted.amount, 128) <= (native.family === '1' ? 1_000_000_000n : BigInt(Number.MAX_SAFE_INTEGER)),
    'DISPATCH_NATIVE_AMOUNT');
  const domain = value.domain;
  assert.equal(quoted.deliveryRiskCommitment, nativeDeliveryRiskCommitment({ clause: value.acceptedLossClause,
    hubDomain: domain.hubDomain, registryCommitment: domain.registryCommitment, chainDomain: quoted.chainDomain,
    sourceCommitment: source, destinationCommitment: destination, amount: quoted.amount, scope: domain.scope,
    policy: domain.policy, asset: domain.asset, payoutCommitment: value.quote.payoutCommitment,
    settleBefore: quoted.settleBefore, salt: value.quote.deliveryRiskSalt }), 'DISPATCH_DELIVERY_RISK');
  return frozenInput(value);
}

function proof(value, relation) {
  exactRecord(value, ['proof', 'publicInputs']); wireHex(value.proof, 2_097_152);
  assert.equal(value.proof.length % 64, 0, 'DISPATCH_PROOF_FIELD_ENCODING');
  return decodeStatement(relation, value.publicInputs);
}

/** Pure binding/encoding only. It does NOT verify either proof or authorize
 * funds. The returned intent deliberately omits the receipt spend secret.
 */
export async function assertNativeDispatchBinding(rawBinding, raw, options) {
  exactRecord(options, ['hashFields']); const binding = normalizeNativeDispatchBinding(rawBinding), request = cloneInput(raw);
  exactRecord(request, ['dependencyProof', 'readyProof', 'readinessOpening', 'action', 'deliveryRiskSalt', 'receiptSpendSecret']);
  const dependency = proof(request.dependencyProof, 'dependency'), ready = proof(request.readyProof, 'ready');
  joinReadiness(dependency, ready);
  exactRecord(request.readinessOpening, ['domain', 'descriptor', 'readinessBlind']);
  const opening = request.readinessOpening, descriptor = validateStruct('ready', opening.descriptor);
  equal(opening.domain, binding.domain); bytes32(opening.readinessBlind, true);
  const codec = createCommitmentCodec(options), d = await codec.domainCommitment(binding.domain);
  assert.equal(ready.domainCommitment, d, 'DISPATCH_DOMAIN_OPENING');
  assert.equal(await codec.readinessCommitment(d, ready.joinCommitment, opening.readinessBlind, descriptor),
    ready.readinessCommitment, 'DISPATCH_READY_SEAL');
  for (const name of ['scope', 'policy', 'asset', 'hubDomain', 'registryCommitment'])
    assert.equal(descriptor[name], binding.domain[name], 'DISPATCH_DESCRIPTOR_DOMAIN');
  assert.equal(descriptor.snapshotDigest, ready.checkpoint, 'DISPATCH_DESCRIPTOR_CHECKPOINT');
  assert.equal(descriptor.readyFrom, ready.readyFrom, 'DISPATCH_DESCRIPTOR_WINDOW');
  assert.equal(descriptor.readyUntil, ready.readyUntil, 'DISPATCH_DESCRIPTOR_WINDOW');
  bytes32(descriptor.localCommitment, true); bytes32(descriptor.dispatchId, true);
  equal(request.action, binding.quote.action); assert.equal(request.deliveryRiskSalt, binding.quote.deliveryRiskSalt, 'DISPATCH_QUOTE');
  assert.equal(descriptor.payoutCommitment, binding.quote.payoutCommitment, 'DISPATCH_PAYOUT');
  assert.equal(descriptor.chainDomain, request.action.chainDomain, 'DISPATCH_CHAIN');
  assert.equal(descriptor.evidencePolicy, nativeRuleCommitment(binding.rule), 'DISPATCH_RULE');
  assert.equal(descriptor.actionCommitment, nativeTransferActionCommitment(request.action), 'DISPATCH_ACTION');
  assert.equal(receiptKeyCommitment({ ledgerNamespace: binding.domain.ledgerNamespace, secret: request.receiptSpendSecret }),
    request.action.receiptKeyCommitment, 'DISPATCH_RECEIPT_KEY');
  assert.ok(inputUint(request.action.executionFrom) <= inputUint(ready.readyFrom)
    && inputUint(ready.readyFrom) < inputUint(ready.readyUntil)
    && inputUint(ready.readyUntil) <= inputUint(request.action.executionUntil)
    && inputUint(ready.readyUntil) <= inputUint(request.action.settleBefore), 'DISPATCH_READY_WINDOW');
  const intent = frozenInput({ dependency, ready, readinessOpening: opening, action: request.action,
    deliveryRiskSalt: request.deliveryRiskSalt,
    readyStatement: nativeReadyStatementDigest([...readyDescriptorWords(descriptor)]),
    dependencyProofSHA256: sha(Buffer.from(request.dependencyProof.proof, 'hex')),
    readyProofSHA256: sha(Buffer.from(request.readyProof.proof, 'hex')) });
  return { request: frozenInput(request), intent };
}

function snapshot(value) {
  exactRecord(value, SNAPSHOT_FIELDS);
  const counts = ['poolSpentCount', 'receiptCount', 'spentTagCount', 'revokedCount'];
  const times = ['poolStateSequence', 'spentTagSequence', 'revocationSequence', 'hubStateSequence', 'registryEpoch', 'timestamp'];
  for (const [key, item] of Object.entries(value)) {
    if (counts.includes(key)) inputUint(item, 32, 64n);
    else if (times.includes(key)) inputUint(item);
    else if (key === 'halt') inputUint(item, 8, 1n);
    else prefixedHex(item, key === 'pool' ? 20 : 32);
  }
  snapshotDigest(value); return value;
}

/** Independent reconstruction of the owned reader's values. Raw state must
 * be fetched from pinned contracts at this exact head; bytes alone never prove
 * that provenance. R authenticates hidden reserve membership/non-spend. Exact
 * current checkpoint equality preserves that guarantee without revealing NF.
 */
export async function assertNativeDispatchState(rawBinding, intent, raw, options) {
  exactRecord(options, ['hashFields']); const binding = normalizeNativeDispatchBinding(rawBinding), observed = cloneInput(raw);
  exactRecord(observed, ['head', 'domainCommitment', 'authorizationRoots', 'checkpointSnapshot',
    'checkpointPath', 'checkpointCount', 'snapshot', 'poolState', 'receiptLeaves', 'revokedEntries', 'spentTags',
    'evidenceState', 'revocationOverflowDigest', 'revocationOverflowCount', 'health']);
  exactRecord(observed.head, ['number', 'hash', 'timestamp']); inputUint(observed.head.number);
  bytes32(observed.head.hash, true); inputUint(observed.head.timestamp);
  const current = snapshot(observed.snapshot), recorded = snapshot(observed.checkpointSnapshot), ready = intent.ready;
  const codec = createCommitmentCodec(options), d = await codec.domainCommitment(binding.domain);
  assert.equal(observed.domainCommitment, d, 'DISPATCH_REGISTERED_DOMAIN');
  assert.equal(ready.domainCommitment, d, 'DISPATCH_PROOF_DOMAIN');
  for (const [name, source] of [['hubDomain', 'hubDomain'], ['registryCommitment', 'registryCommitment'],
    ['scope', 'scope'], ['policy', 'policy'], ['assetIdentity', 'asset']])
    assert.equal(current[name], prefix(binding.domain[source]), 'DISPATCH_CURRENT_DOMAIN');
  assert.equal(current.pool, prefix(binding.pool), 'DISPATCH_CURRENT_POOL');
  assert.equal(current.timestamp, observed.head.timestamp, 'DISPATCH_CURRENT_TIMESTAMP');
  assert.equal(current.registryEpoch, binding.registry.registryEpoch, 'DISPATCH_REGISTRY_EPOCH');
  assert.equal(current.halt, '0', 'DISPATCH_HALTED');
  assert.equal(snapshotDigest(recorded), prefix(ready.checkpoint), 'DISPATCH_HISTORICAL_CHECKPOINT');
  equal({ ...current, timestamp: recorded.timestamp }, recorded);
  assert.ok(inputUint(recorded.timestamp) <= inputUint(current.timestamp), 'DISPATCH_CLOCK_ROLLBACK');
  const path = inputPath(observed.checkpointPath, 6);
  assert.ok(BigInt(path.index) < inputUint(observed.checkpointCount, 32, 64n), 'DISPATCH_CHECKPOINT_INDEX');
  membership(prefix(ready.checkpoint), path.siblings.map(prefix), String(path.index), prefix(path.root));
  // Reader supplies the actual current checkpoint root and accepted G history,
  // not caller paths or booleans. Full path membership proves recorded presence.
  assert.ok(Array.isArray(observed.authorizationRoots) && observed.authorizationRoots.length > 0
    && observed.authorizationRoots.length <= 65, 'DISPATCH_AUTHORIZATION_HISTORY');
  fixedArray(observed.authorizationRoots, observed.authorizationRoots.length);
  observed.authorizationRoots.forEach(root => canonicalField(root));
  assert.equal(new Set(observed.authorizationRoots).size, observed.authorizationRoots.length);
  assert.ok(observed.authorizationRoots.includes(ready.authorizationRoot), 'DISPATCH_UNKNOWN_AUTHORIZATION_ROOT');
  exactRecord(observed.poolState, ['rawState', 'rawHistory', 'rawBacking']);
  for (const key of ['rawState', 'rawHistory', 'rawBacking']) {
    const sizes = { rawState: 135, rawHistory: 68, rawBacking: 6 };
    prefixedHex(observed.poolState[key], sizes[key] * 32);
  }
  const ledger = inspectGenericSnapshot({ ...observed.poolState, scope: prefix(binding.domain.scope) });
  for (const [snapshotKey, ledgerKey] of [['poolRoot', 'root'], ['poolSpentDigest', 'spentDigest'], ['poolStateSequence', 'sequence']])
    assert.equal(current[snapshotKey], ledger.publicState[ledgerKey], 'DISPATCH_POOL_STATE');
  assert.equal(current.poolSpentCount, String(ledger.publicState.spent), 'DISPATCH_POOL_SPENT_COUNT');
  fixedArray(observed.receiptLeaves, 64); fixedArray(observed.revokedEntries, 64); fixedArray(observed.spentTags, 64);
  const count = Number(inputUint(current.receiptCount, 32, 64n));
  const emptyReceipt = await codec.emptyLeaf(d, 2);
  observed.receiptLeaves.forEach((leaf, index) => { canonicalField(leaf); if (index >= count) assert.equal(leaf, emptyReceipt); });
  const receiptTree = await codec.buildTree(d, 2, observed.receiptLeaves.slice(0, count));
  assert.equal(prefix(receiptTree.root), current.receiptRoot, 'DISPATCH_RECEIPT_ROOT');
  assert.equal(prefix(await codec.revokedDigest(d, binding.domain.hubDomain, observed.revokedEntries, current.revokedCount)),
    current.revokedDigest, 'DISPATCH_CURRENT_REVOCATIONS');
  observed.spentTags.forEach(value => bytes32(value));
  assert.equal(boundedListDigest(0x31, prefix(binding.domain.hubDomain), observed.spentTags.map(prefix), current.spentTagCount),
    current.spentTagDigest, 'DISPATCH_SPENT_TAGS');
  const evidence = { hubDomain: binding.domain.hubDomain, registryCommitment: binding.domain.registryCommitment,
    receiptRoot: current.receiptRoot.slice(2), receiptCount: current.receiptCount,
    revokedDigest: current.revokedDigest.slice(2), revokedCount: current.revokedCount, revocationSequence: current.revocationSequence };
  assert.equal(await codec.evidenceStateDigest(d, evidence), observed.evidenceState, 'DISPATCH_EVIDENCE_STATE');
  assert.equal(observed.evidenceState, ready.readinessEvidenceState, 'DISPATCH_READY_STATE_STALE');
  bytes32(observed.revocationOverflowDigest); inputUint(observed.revocationOverflowCount);
  assertFlatNativeHealth(observed.health, { pool: binding.pool, domain: d,
    ...evidence, evidenceState: observed.evidenceState, spentTagDigest: current.spentTagDigest.slice(2),
    spentTagCount: current.spentTagCount, spentTagSequence: current.spentTagSequence,
    stateSequence: current.hubStateSequence, revocationOverflowDigest: observed.revocationOverflowDigest,
    revocationOverflowCount: observed.revocationOverflowCount, halted: current.halt, timestamp: current.timestamp }, binding.registry);
  const now = inputUint(current.timestamp);
  assert.ok(inputUint(ready.readyFrom) <= now && now < inputUint(ready.readyUntil)
    && inputUint(intent.action.executionFrom) <= now && now < inputUint(intent.action.executionUntil), 'DISPATCH_OUTSIDE_READY_WINDOW');
  return frozenInput({ head: observed.head, signedAt: current.timestamp });
}

/** An owned adapter's prepared data, never a request field. Native-RPC truth
 * (including ownership/unspent status) remains that capability's obligation.
 * The gate independently checks wire bytes, selected source value, conservation,
 * endpoint/custody/K identity, system account funds and the pinned Memo code.
 */
export function assertNativeDispatchPrepared(rawBinding, dispatchIntent, raw) {
  const binding = normalizeNativeDispatchBinding(rawBinding), value = cloneInput(raw), native = binding.native;
  if (native.family === '3') {
    exactRecord(value, ['genesis', 'head', 'transaction', 'unsignedWire', 'funds']);
    assert.equal(prefixedHex(value.genesis, 32), native.genesis, 'DISPATCH_EVM_GENESIS');
    exactRecord(value.head, ['number', 'hash', 'timestamp']); prefixedHex(value.head.hash, 32);
    for (const name of ['number', 'timestamp']) {
      assert.ok(typeof value.head[name] === 'string' && /^0x(?:0|[1-9a-f][0-9a-f]*)$/.exec(value.head[name])?.[0] === value.head[name],
        'DISPATCH_EVM_HEAD_QUANTITY');
      inputUint(BigInt(value.head[name]).toString());
    }
    const tx = value.transaction;
    exactRecord(tx, ['chainId', 'from', 'to', 'nonce', 'gasPrice', 'gas', 'value', 'data']);
    for (const name of ['chainId', 'nonce', 'gasPrice', 'gas', 'value']) inputUint(tx[name], 256);
    assert.equal(tx.chainId, evmGraphDeliveryTermsV1(native.descriptor).identity.chainId, 'DISPATCH_EVM_CHAIN_ID');
    assert.equal(prefixedHex(tx.from, 20), native.sourceEndpoint, 'DISPATCH_EVM_SOURCE');
    assert.equal(prefixedHex(tx.to, 20), native.destinationEndpoint, 'DISPATCH_EVM_ROUTER');
    assert.equal(tx.value, '0', 'DISPATCH_EVM_NATIVE_VALUE');
    assert.equal(tx.gasPrice, '1000000000', 'DISPATCH_EVM_GAS_PRICE');
    assert.ok(BigInt(tx.gas) > 0n && BigInt(tx.gas) <= BigInt(LOCAL_EVM_PROFILE.maxGas), 'DISPATCH_EVM_GAS_LIMIT');
    assert.equal(dispatchIntent.action.amount, evmGraphDeliveryTermsV1(native.descriptor).route.shareAmount, 'DISPATCH_EVM_EXACT_SHARES');
    assert.equal(tx.data, encodeEvmGraphDeliveryCallV1({ descriptor: native.descriptor,
      receiptKeyCommitment: dispatchIntent.action.receiptKeyCommitment, proof: native.depositProof }), 'DISPATCH_EVM_FULL_CALLDATA');
    assert.equal(value.unsignedWire, encodeCanonicalEvmUnsignedTransaction(tx), 'DISPATCH_EVM_UNSIGNED_WIRE');
    exactRecord(value.funds, ['balanceWei', 'estimatedGas', 'targetCodeHash']);
    const balance = inputUint(value.funds.balanceWei, 256), estimate = inputUint(value.funds.estimatedGas, 256);
    assert.ok(balance >= BigInt(tx.gas) * BigInt(tx.gasPrice), 'DISPATCH_EVM_GAS_FUNDS');
    assert.ok(estimate > 0n && estimate <= BigInt(tx.gas), 'DISPATCH_EVM_GAS_ESTIMATE');
    prefixedHex(value.funds.targetCodeHash, 32);
    return frozenInput(value);
  }
  exactRecord(value, ['genesis', 'intent', 'unsignedWire', 'funds']);
  assert.equal(value.genesis, native.genesis, 'DISPATCH_NATIVE_GENESIS');
  const funds = value.funds, wireIntent = value.intent;
  if (native.family === '1') {
    exactRecord(funds, ['nativeHead', 'sourceTransaction', 'sourceTxid', 'sourceVout', 'sourceSatoshi',
      'sourceScript', 'sourceConfirmations', 'sourceCoinbase', 'spendable', 'solvable', 'safe',
      'sourceOwnedScript', 'changeOwnedScript']);
    assert.equal(wireIntent.sourceScript, native.sourceEndpoint, 'DISPATCH_NATIVE_SOURCE');
    assert.equal(wireIntent.recipientScript, native.destinationEndpoint, 'DISPATCH_NATIVE_DESTINATION');
    assert.equal(wireIntent.changeScript, native.changeEndpoint, 'DISPATCH_NATIVE_CHANGE');
    assert.equal(wireIntent.amountSatoshi, dispatchIntent.action.amount, 'DISPATCH_NATIVE_AMOUNT');
    assert.equal(wireIntent.wireKeyCommitment, dispatchIntent.action.receiptKeyCommitment, 'DISPATCH_NATIVE_KEY');
    assert.equal(value.unsignedWire, encodeBitcoinBinding(wireIntent), 'DISPATCH_UNSIGNED_BTC_WIRE');
    wireHex(funds.sourceTransaction, 200_000);
    const source = decodeBitcoinTransaction(funds.sourceTransaction), output = source.vout[Number(inputUint(wireIntent.sourceVout, 32))];
    assert.equal(source.txid, wireIntent.sourceTxid, 'DISPATCH_SOURCE_TRANSACTION');
    assert.ok(output, 'DISPATCH_SOURCE_OUTPUT');
    assert.equal(output.script, wireIntent.sourceScript, 'DISPATCH_SOURCE_SCRIPT');
    assert.equal(output.amountSatoshi, wireIntent.sourceSatoshi, 'DISPATCH_SOURCE_VALUE');
    for (const name of ['sourceTxid', 'sourceVout', 'sourceSatoshi', 'sourceScript'])
      assert.equal(funds[name], wireIntent[name], 'DISPATCH_UTXO_IDENTITY');
    assert.equal(funds.sourceOwnedScript, native.sourceEndpoint, 'DISPATCH_OWNED_SOURCE');
    assert.equal(funds.changeOwnedScript, native.changeEndpoint, 'DISPATCH_OWNED_CHANGE');
    for (const name of ['spendable', 'solvable', 'safe']) assert.equal(funds[name], true, 'DISPATCH_UNAVAILABLE_UTXO');
    assert.equal(typeof funds.sourceCoinbase, 'boolean');
    // Infer coinbase syntax from the actual source wire, not just RPC metadata.
    const coinbase = source.vin.length === 1 && source.vin[0].txid === ZERO && source.vin[0].vout === 0xffffffff;
    assert.equal(funds.sourceCoinbase, coinbase, 'DISPATCH_COINBASE_SOURCE');
    assert.ok(inputUint(funds.sourceConfirmations, 32) >= (coinbase ? 101n : 1n), 'DISPATCH_IMMATURE_SOURCE');
  } else {
    exactRecord(funds, ['nativeHead', 'sourceAccount', 'recipientAccount', 'feeLamports', 'lastValidBlockHeight', 'memoProgram']);
    assert.equal(wireIntent.sourcePublicKey, native.sourceEndpoint, 'DISPATCH_NATIVE_SOURCE');
    assert.equal(wireIntent.recipientPublicKey, native.destinationEndpoint, 'DISPATCH_NATIVE_DESTINATION');
    assert.equal(wireIntent.lamports, dispatchIntent.action.amount, 'DISPATCH_NATIVE_AMOUNT');
    assert.equal(wireIntent.wireKeyCommitment, dispatchIntent.action.receiptKeyCommitment, 'DISPATCH_NATIVE_KEY');
    assert.equal(value.unsignedWire, encodeSolanaBindingMessage(wireIntent), 'DISPATCH_UNSIGNED_SOL_WIRE');
    for (const [name, endpoint] of [['sourceAccount', native.sourceEndpoint], ['recipientAccount', native.destinationEndpoint]]) {
      const account = funds[name]; exactRecord(account, ['publicKey', 'exists', 'owner', 'executable', 'lamports']);
      assert.equal(account.publicKey, endpoint, 'DISPATCH_NATIVE_ACCOUNT');
      assert.equal(typeof account.exists, 'boolean', 'DISPATCH_ACCOUNT_EXISTENCE');
      if (name === 'sourceAccount') assert.equal(account.exists, true, 'DISPATCH_SOURCE_ACCOUNT_MISSING');
      assert.equal(account.owner, ZERO, 'DISPATCH_SYSTEM_ACCOUNT');
      assert.equal(account.executable, false, 'DISPATCH_SYSTEM_ACCOUNT'); inputUint(account.lamports);
      if (!account.exists) assert.equal(account.lamports, '0', 'DISPATCH_MISSING_RECIPIENT_BALANCE');
    }
    const fee = inputUint(funds.feeLamports); assert.ok(fee > 0n, 'DISPATCH_NATIVE_FEE');
    assert.ok(inputUint(funds.sourceAccount.lamports) >= inputUint(wireIntent.lamports) + fee, 'DISPATCH_NATIVE_FUNDS');
    assert.ok(inputUint(funds.nativeHead.height) < inputUint(funds.lastValidBlockHeight), 'DISPATCH_BLOCKHASH_EXPIRED');
    assertMemoProgramAccount(funds.memoProgram);
  }
  exactRecord(funds.nativeHead, ['id', 'height']); bytes32(funds.nativeHead.id, true); inputUint(funds.nativeHead.height);
  return frozenInput(value);
}

export function assertNativeDispatchSigned(rawBinding, prepared, raw) {
  const binding = normalizeNativeDispatchBinding(rawBinding), value = cloneInput(raw);
  const family = binding.native.family;
  if (family === '3') {
    // Runtime callback has prefixed wire/hash; the authenticated journal retains
    // one bare canonical encoding shared with the facts reader. Recovery only
    // accepts that retained encoding and recomputes every identity again.
    const runtimeResult = Object.hasOwn(value, 'nativeId');
    exactRecord(value, runtimeResult ? ['nativeWire', 'nativeId', 'transactionSHA256'] : ['nativeWire']);
    const nativeWire = runtimeResult ? (assert.equal(value.nativeWire.slice(0, 2), '0x'), value.nativeWire.slice(2)) : value.nativeWire;
    wireHex(nativeWire, 262144);
    const signed = assertSignedEvmTransaction('0x' + nativeWire, prepared.transaction);
    assert.equal(signed.unsignedWire, prepared.unsignedWire, 'DISPATCH_EVM_SIGNED_INTENT');
    const decoded = validateEvmDeliveryWire(nativeWire, { descriptor: binding.native.descriptor,
      receiptKeyCommitment: binding.quote.action.receiptKeyCommitment, proof: binding.native.depositProof });
    if (runtimeResult) {
      assert.equal(prefixedHex(value.nativeId, 32), decoded.nativeId, 'DISPATCH_EVM_SIGNED_ID');
      assert.equal(value.transactionSHA256, decoded.transactionSHA256, 'DISPATCH_EVM_SIGNED_HASH');
    }
    const globalEffectId = nativeFactIdentity({ family, genesis: binding.native.genesis, asset: binding.native.asset,
      transactionId: decoded.transactionId, effectIndex: '0' });
    return frozenInput({ nativeWire, nativeId: decoded.nativeId, transactionSHA256: decoded.transactionSHA256, globalEffectId });
  }
  exactRecord(value, ['nativeWire']);
  let decoded, nativeId;
  if (family === '1') {
    wireHex(value.nativeWire, 2000);
    decoded = validateBitcoinBinding(value.nativeWire, prepared.intent);
    assert.equal(decoded.containsWitness, true, 'DISPATCH_UNSIGNED_NATIVE_RESULT');
    assert.equal(decoded.unsignedTransaction, prepared.unsignedWire, 'DISPATCH_SIGNED_INTENT'); nativeId = decoded.txid;
  } else {
    decoded = validateSolanaBindingTransaction(value.nativeWire, prepared.intent);
    assert.equal(Buffer.from(value.nativeWire, 'base64').subarray(65).toString('hex'), prepared.unsignedWire, 'DISPATCH_SIGNED_INTENT');
    nativeId = decoded.signatureHex;
  }
  assert.equal(decoded.wireKeyCommitment, prepared.intent.wireKeyCommitment, 'DISPATCH_SIGNED_KEY');
  const globalEffectId = nativeFactIdentity({ family, genesis: binding.native.genesis, asset: binding.native.asset,
    transactionId: family === '1' ? nativeId + ZERO : nativeId, effectIndex: '0' });
  return frozenInput({ nativeWire: value.nativeWire, nativeId, transactionSHA256: decoded.transactionSHA256, globalEffectId });
}

/** Only the proven no-key-use phase permits a fresh proof/checkpoint retry.
 * Every potentially signed phase reconciles one exact retained intent/identity.
 */
export function nativeDispatchRetryDecision(previous, nextIntent) {
  if (previous === null) return 'FIRST';
  exactRecord(previous, ['phase', 'intent']); assert.ok(PHASES.includes(previous.phase), 'DISPATCH_JOURNAL_PHASE');
  const prior = previous.intent;
  equal(prior.action, nextIntent.action); assert.equal(prior.deliveryRiskSalt, nextIntent.deliveryRiskSalt, 'DISPATCH_REBOUND');
  equal(prior.readinessOpening.domain, nextIntent.readinessOpening.domain);
  for (const name of Object.keys(prior.readinessOpening.descriptor).filter(name => !['snapshotDigest', 'readyFrom', 'readyUntil'].includes(name)))
    assert.equal(prior.readinessOpening.descriptor[name], nextIntent.readinessOpening.descriptor[name], 'DISPATCH_REBOUND');
  if (previous.phase === 'PRE_SIGN_REJECTED') return 'RETRY_PRE_SIGN';
  equal(prior, nextIntent); return 'RECONCILE';
}

/** Explicit first creation only. Never use an empty state to recover a missing
 * or unreadable journal. Store encryption/authentication, fsync/CAS and external
 * rollback protection are required trusted bootstrap responsibilities.
 */
export function createNativeDispatchJournal(binding) {
  const normalized = normalizeNativeDispatchBinding(binding);
  return frozenInput({ schema: NATIVE_DISPATCH_JOURNAL_SCHEMA, configurationDigest: sha(canonical(normalized)),
    lastTimestamp: '0', journal: null });
}

function dispatchStatement(binding, intent, signed, signedAt) {
  return { hubDomain: binding.domain.hubDomain, registryCommitment: binding.domain.registryCommitment,
    readyStatement: intent.readyStatement, localCommitment: intent.readinessOpening.descriptor.localCommitment,
    dispatchId: intent.readinessOpening.descriptor.dispatchId, actionCommitment: intent.readinessOpening.descriptor.actionCommitment,
    globalEffectId: signed.globalEffectId, deliveryRiskCommitment: intent.action.deliveryRiskCommitment, signedAt };
}

/** Trusted bootstrap only. No caller verifier/key/RPC/path override is accepted
 * by execute(). The actual verifier brand is mandatory even when recovering.
 * The caller owns its verifier lifetime and must dispose it after this role.
 */
export async function createNativeDispatchGate(configuration) {
  exactRecord(configuration, ['binding', 'hashFields', 'verifier', 'providerSigner', 'nativeAdapter', 'stateReader', 'healthReader', 'store']);
  const { hashFields, verifier, providerSigner, nativeAdapter, stateReader, healthReader, store } = configuration;
  assertPinnedVerifier(verifier, 'dispatch');
  const binding = normalizeNativeDispatchBinding(configuration.binding), options = { hashFields };
  const codec = createCommitmentCodec(options);
  exactRecord(providerSigner, ['publicKey', 'signDispatch']); equal(providerSigner.publicKey, binding.providerKey);
  assert.equal(typeof providerSigner.signDispatch, 'function');
  exactRecord(nativeAdapter, ['binding', 'transfer', 'assertPrepared', 'observe']); equal(nativeAdapter.binding, binding.native);
  // The owned reader also exposes authorizationPath for other roles. Keep its
  // original capability and require only these two own data-methods here.
  for (const name of ['read', 'assertCurrent'])
    assert.equal(typeof Object.getOwnPropertyDescriptor(stateReader, name)?.value, 'function', 'DISPATCH_STATE_READER');
  exactRecord(healthReader, ['read']); exactRecord(store, ['load', 'commit']);
  for (const [capability, methods] of [[nativeAdapter, ['transfer', 'assertPrepared', 'observe']],
    [stateReader, ['read', 'assertCurrent']], [healthReader, ['read']], [store, ['load', 'commit']]])
    for (const method of methods) assert.equal(typeof capability[method], 'function');
  // Capture the exact authorized methods synchronously before the first await.
  // Replacing a caller-held capability property later cannot replace authority.
  const verifyProof = verifier.verify.bind(verifier), signDispatch = providerSigner.signDispatch.bind(providerSigner);
  const transferNative = nativeAdapter.transfer.bind(nativeAdapter), assertPrepared = nativeAdapter.assertPrepared.bind(nativeAdapter);
  const observeNative = nativeAdapter.observe.bind(nativeAdapter), readState = stateReader.read.bind(stateReader);
  const assertCurrent = stateReader.assertCurrent.bind(stateReader), readHealth = healthReader.read.bind(healthReader);
  const loadStore = store.load.bind(store), commitStore = store.commit.bind(store);
  const d = await codec.domainCommitment(binding.domain);
  const configurationDigest = sha(canonical(binding));
  let record, state, busy = false, poisoned = false, closed = false;
  const live = () => { assert.equal(closed, false, 'DISPATCH_CLOSED'); assert.equal(poisoned, false, 'DISPATCH_PERSISTENCE_UNCERTAIN_RECOVER'); };

  function recordShape(raw) {
    const checked = cloneInput(raw); exactRecord(checked, ['revision', 'state']); inputUint(checked.revision);
    exactRecord(checked.state, ['schema', 'configurationDigest', 'lastTimestamp', 'journal']);
    assert.equal(checked.state.schema, NATIVE_DISPATCH_JOURNAL_SCHEMA, 'DISPATCH_STORE_SCHEMA');
    assert.equal(checked.state.configurationDigest, configurationDigest, 'DISPATCH_STORE_BINDING');
    inputUint(checked.state.lastTimestamp); return checked;
  }
  async function unchanged() {
    try { equal(recordShape(await loadStore()), record); }
    catch (cause) { poisoned = true; throw new Error('DISPATCH_STORE_CHANGED_OR_UNAVAILABLE', { cause }); }
  }
  async function persist(next) {
    live(); await unchanged();
    try {
      const saved = recordShape(await commitStore({ expectedRevision: record.revision, nextState: cloneInput(next) }));
      assert.equal(inputUint(saved.revision), inputUint(record.revision) + 1n, 'DISPATCH_STORE_REVISION');
      equal(saved.state, next); equal(recordShape(await loadStore()), saved); record = saved; state = saved.state;
    } catch (cause) { poisoned = true; throw new Error('DISPATCH_PERSISTENCE_UNCERTAIN_RECOVER', { cause }); }
  }
  function result() {
    const journal = state.journal; assert.ok(journal?.signed, 'DISPATCH_NO_KNOWN_IDENTITY_NO_RESEND');
    return frozenInput(cloneInput({ phase: journal.phase, ...journal.signed,
      providerKey: binding.providerKey, dispatchStatement: journal.dispatchStatement, dispatchSignature: journal.dispatchSignature,
      readyStatement: journal.intent.readyStatement, dependencyProofSHA256: journal.intent.dependencyProofSHA256,
      readyProofSHA256: journal.intent.readyProofSHA256, deliveryRiskAcceptance: binding.acceptedLossClause,
      observation: journal.observation, assurance: NATIVE_DISPATCH_ASSURANCE }));
  }
  async function current(intent, prepared = null) {
    const started = performance.now();
    const read = await readState({ domainCommitment: d, authorizationRoot: intent.ready.authorizationRoot, checkpoint: intent.ready.checkpoint });
    const health = await readHealth({ pool: binding.pool, domainCommitment: d });
    const checked = await assertNativeDispatchState(binding, intent, { ...read.dispatch, health }, options);
    assert.ok(inputUint(checked.signedAt) >= inputUint(state.lastTimestamp), 'DISPATCH_CLOCK_ROLLBACK');
    if (prepared !== null) assert.equal(await assertPrepared(prepared), undefined, 'DISPATCH_NATIVE_ASSERT_ONLY');
    // No awaited work after this final fixed-head assertion in beforeSign.
    // Keep the reader's original minted head identity for its ownership brand;
    // the pure validator separately checked a defensive snapshot of its fields.
    assert.equal(await assertCurrent(read), undefined, 'DISPATCH_STATE_ASSERT_ONLY');
    assert.ok(performance.now() - started <= 30_000, 'DISPATCH_CURRENT_CHECK_TOO_OLD');
    return checked.signedAt;
  }

  record = recordShape(await loadStore()); state = record.state;
  if (state.journal !== null) {
    const journal = state.journal;
    exactRecord(journal, ['phase', 'intent', 'prepared', 'signedAt', 'signed', 'dispatchStatement', 'dispatchSignature', 'observation']);
    assert.ok(PHASES.includes(journal.phase), 'DISPATCH_JOURNAL_PHASE');
    const intent = journal.intent;
    exactRecord(intent, ['dependency', 'ready', 'readinessOpening', 'action', 'deliveryRiskSalt',
      'readyStatement', 'dependencyProofSHA256', 'readyProofSHA256']);
    bytes32(intent.dependencyProofSHA256, true); bytes32(intent.readyProofSHA256, true);
    // Validate all stored descriptor/binding constraints again. Proof hashes
    // attest the historical verified operation only under authenticated storage.
    // Recovery has intentionally discarded the spend secret. Recheck public K
    // and every other binding without inventing/recovering a secret or a proof.
    joinReadiness(intent.dependency, intent.ready); equal(intent.action, binding.quote.action);
    equal(intent.readinessOpening.domain, binding.domain);
    exactRecord(intent.readinessOpening, ['domain', 'descriptor', 'readinessBlind']);
    const descriptor = validateStruct('ready', intent.readinessOpening.descriptor);
    bytes32(intent.readinessOpening.readinessBlind, true);
    assert.equal(intent.ready.domainCommitment, d, 'DISPATCH_RECOVERY_DOMAIN');
    assert.equal(await codec.readinessCommitment(d, intent.ready.joinCommitment, intent.readinessOpening.readinessBlind, descriptor),
      intent.ready.readinessCommitment, 'DISPATCH_RECOVERY_SEAL');
    for (const name of ['scope', 'policy', 'asset', 'hubDomain', 'registryCommitment']) assert.equal(descriptor[name], binding.domain[name]);
    assert.equal(descriptor.snapshotDigest, intent.ready.checkpoint); assert.equal(descriptor.readyFrom, intent.ready.readyFrom);
    assert.equal(descriptor.readyUntil, intent.ready.readyUntil);
    assert.equal(descriptor.actionCommitment, nativeTransferActionCommitment(intent.action));
    assert.equal(descriptor.payoutCommitment, binding.quote.payoutCommitment);
    assert.equal(descriptor.chainDomain, intent.action.chainDomain); assert.equal(descriptor.evidencePolicy, nativeRuleCommitment(binding.rule));
    assert.equal(intent.deliveryRiskSalt, binding.quote.deliveryRiskSalt);
    assert.equal(intent.readyStatement, nativeReadyStatementDigest([...readyDescriptorWords(descriptor)]));
    assert.ok(inputUint(intent.action.executionFrom) <= inputUint(descriptor.readyFrom)
      && inputUint(descriptor.readyFrom) < inputUint(descriptor.readyUntil)
      && inputUint(descriptor.readyUntil) <= inputUint(intent.action.executionUntil), 'DISPATCH_RECOVERY_WINDOW');
    if (journal.prepared !== null) assertNativeDispatchPrepared(binding, intent, journal.prepared);
    if (journal.signedAt !== null) {
      const when = inputUint(journal.signedAt);
      assert.ok(inputUint(descriptor.readyFrom) <= when && when < inputUint(descriptor.readyUntil), 'DISPATCH_RECOVERY_SIGNED_AT');
      assert.ok(when <= inputUint(state.lastTimestamp), 'DISPATCH_RECOVERY_CLOCK');
    }
    if (journal.signed !== null) {
      assert.ok(journal.prepared !== null && journal.signedAt !== null, 'DISPATCH_RECOVERY_SIGNED_ORDER');
      equal(journal.signed, assertNativeDispatchSigned(binding, journal.prepared, { nativeWire: journal.signed.nativeWire }));
    }
    if (journal.dispatchSignature !== null) {
      assert.ok(journal.signed !== null);
      equal(journal.dispatchStatement, dispatchStatement(binding, intent, journal.signed, journal.signedAt));
      assertProviderSignature(binding.providerKey, journal.dispatchSignature, journal.dispatchStatement);
    } else assert.equal(journal.dispatchStatement, null, 'DISPATCH_RECOVERY_STATEMENT');
    if (['INTENT', 'PREPARED', 'PRE_SIGN_REJECTED'].includes(journal.phase)) {
      assert.equal(journal.signed, null); assert.equal(journal.dispatchSignature, null);
    }
    if (journal.phase === 'PREPARED') assert.ok(journal.prepared !== null);
    if (['NATIVE_SIGNED', 'SIGNED', 'BROADCAST', 'OBSERVED', 'ADVERSE'].includes(journal.phase)) assert.ok(journal.signed !== null);
    if (['SIGNED', 'BROADCAST'].includes(journal.phase)) assert.ok(journal.dispatchSignature !== null);
    if (['OBSERVED', 'ADVERSE'].includes(journal.phase)) {
      exactRecord(journal.observation, ['status', 'nativeId', 'nativeWire']);
      assert.equal(journal.observation.nativeId, journal.signed.nativeId, 'DISPATCH_RECOVERY_OBSERVATION');
      assert.equal(journal.observation.status, journal.phase === 'OBSERVED' ? 'observed' : 'adverse');
      if (journal.phase === 'OBSERVED') assert.equal(journal.observation.nativeWire, journal.signed.nativeWire);
      else assert.equal(journal.observation.nativeWire, null);
    } else assert.equal(journal.observation, null);
  }

  async function reconcile() {
    live(); await unchanged(); const journal = state.journal;
    assert.ok(journal?.signed, 'DISPATCH_NO_KNOWN_IDENTITY_NO_RESEND');
    assert.notEqual(journal.phase, 'ADVERSE', 'DISPATCH_ADVERSE_LATCHED_NO_RESEND');
    const observation = cloneInput(await observeNative({ nativeId: journal.signed.nativeId }));
    exactRecord(observation, ['status', 'nativeId', 'nativeWire']);
    assert.equal(observation.nativeId, journal.signed.nativeId, 'DISPATCH_OBSERVATION_IDENTITY');
    assert.ok(['observed', 'pending', 'unknown', 'unavailable', 'adverse'].includes(observation.status), 'DISPATCH_OBSERVATION_STATUS');
    if (observation.status !== 'observed') assert.equal(observation.nativeWire, null, 'DISPATCH_OBSERVATION_UNKNOWN_WIRE');
    if (observation.status === 'adverse')
      await persist({ ...state, journal: { ...journal, phase: 'ADVERSE', observation } });
    if (observation.status !== 'observed') fail('DISPATCH_OBSERVATION_' + observation.status.toUpperCase() + '_NO_RESEND');
    assert.equal(observation.nativeWire, journal.signed.nativeWire, 'DISPATCH_OBSERVATION_WIRE');
    equal(assertNativeDispatchSigned(binding, journal.prepared, { nativeWire: observation.nativeWire }), journal.signed);
    await persist({ ...state, journal: { ...journal, phase: 'OBSERVED', observation } }); return result();
  }

  return Object.freeze({
    async execute(raw) {
      live(); assert.equal(busy, false, 'DISPATCH_BUSY'); busy = true;
      try {
        const { request, intent } = await assertNativeDispatchBinding(binding, raw, options);
        await unchanged();
        const decision = nativeDispatchRetryDecision(state.journal && { phase: state.journal.phase, intent: state.journal.intent }, intent);
        if (decision === 'RECONCILE') return await reconcile();
        assertPinnedVerifier(verifier, 'dispatch');
        for (const [relation, proof] of [['dependency', request.dependencyProof], ['ready', request.readyProof]])
          assert.equal(await verifyProof({ relation, ...proof }), undefined, 'DISPATCH_VERIFIER_ASSERT_ONLY');
        const initialTime = await current(intent);
        await persist({ ...state, lastTimestamp: initialTime, journal: { phase: 'INTENT', intent, prepared: null,
          signedAt: null, signed: null, dispatchStatement: null, dispatchSignature: null, observation: null } });
        let callbackError, beforeCalled = false, authorizationReturned = false, signedCalled = false, signedAt;
        const beforeSign = async rawPrepared => {
          try {
            assert.equal(beforeCalled, false, 'DISPATCH_REPEATED_BEFORE_SIGN'); beforeCalled = true;
            const prepared = assertNativeDispatchPrepared(binding, intent, rawPrepared);
            await persist({ ...state, journal: { ...state.journal, phase: 'PREPARED', prepared } });
            signedAt = await current(intent, prepared); authorizationReturned = true;
          } catch (error) { callbackError = error; throw error; }
        };
        const onSigned = async rawSigned => {
          assert.ok(authorizationReturned && !signedCalled, 'DISPATCH_SIGNING_ORDER'); signedCalled = true;
          const signed = assertNativeDispatchSigned(binding, state.journal.prepared, rawSigned);
          // Retain exact signed native bytes BEFORE even asking the provider
          // attestation signer. Lost attestation replies still have an identity.
          await persist({ ...state, lastTimestamp: signedAt,
            journal: { ...state.journal, phase: 'NATIVE_SIGNED', signedAt, signed } });
          const statement = dispatchStatement(binding, intent, signed, signedAt);
          const signature = await signDispatch(frozenInput(cloneInput(statement)));
          assertProviderSignature(binding.providerKey, signature, statement);
          await persist({ ...state, journal: { ...state.journal, phase: 'SIGNED',
            dispatchStatement: statement, dispatchSignature: signature } });
          // Only now may the owned adapter perform its single broadcast.
        };
        try {
          const sent = cloneInput(await transferNative({ amount: intent.action.amount,
            wireKeyCommitment: intent.action.receiptKeyCommitment }, { beforeSign, onSigned }));
          assert.ok(signedCalled && state.journal?.signed && state.journal.dispatchSignature, 'DISPATCH_SIGNING_ORDER');
          exactRecord(sent, ['nativeId', 'transactionSHA256']);
          assert.equal(sent.nativeId, state.journal.signed.nativeId, 'DISPATCH_SEND_IDENTITY');
          assert.equal(sent.transactionSHA256, state.journal.signed.transactionSHA256, 'DISPATCH_SEND_WIRE');
          await persist({ ...state, journal: { ...state.journal, phase: 'BROADCAST' } }); return result();
        } catch (error) {
          if (!poisoned) {
            const noKeyUse = error === callbackError && !authorizationReturned && !signedCalled;
            await persist({ ...state, journal: { ...state.journal, phase: noKeyUse ? 'PRE_SIGN_REJECTED' : 'UNCERTAIN' } });
          }
          throw error;
        }
      } finally { busy = false; }
    },
    async reconcile() { live(); assert.equal(busy, false, 'DISPATCH_BUSY'); busy = true;
      try { return await reconcile(); } finally { busy = false; } },
    report() { return frozenInput({ profile: NATIVE_DISPATCH_GATE_PROFILE, phase: state.journal?.phase ?? 'BOUND',
      closed, persistenceUncertain: poisoned, assurance: NATIVE_DISPATCH_ASSURANCE }); },
    close() { assert.equal(busy, false, 'DISPATCH_BUSY'); closed = true; },
  });
}
