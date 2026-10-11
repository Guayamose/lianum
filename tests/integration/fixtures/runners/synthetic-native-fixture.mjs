/** SYNTHETIC HOST/CONSTRAINT FIXTURE ONLY. Builds P/R/I from the SAME supplied
 * corrected owner envelope. Real synthetic provider/facts signatures establish
 * message consistency only. Fabricated BTC fact identity/block history and
 * synthetic SOL wire are not consensus, admission, funds or native execution.
 * No backend, RPC, process startup, key generation or native send occurs here.
 */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { PrivateNoteTree } from '@lianum/engine/notes/private-note-tree';
import { boundedListDigest } from '@lianum/engine/execution/native/state/native-state';
import { nativeReadyStatementDigest } from '@lianum/engine/execution/native/dispatch/native-admission';
import { createCommitmentCodec, exactRecord, digestBytes, digestWords, FIELD_MODULUS, ZERO }
  from '@lianum/components/encoding/commitments';
import { cloneInput, frozenInput } from "@lianum/components/plain-input";
import { buildDependencyInputs, buildReadyInputs, readyDescriptorWords, validateFlatInputs } from "../../../../packages/backend/src/execution/account/preparation/readiness-inputs.mjs";
import { buildAdmissionInputs } from '../../../../packages/backend/src/execution/account/preparation/admission-inputs.mjs';
import { joinReadiness, joinAdmission } from '@lianum/components/encoding/statements';
import { FACTS_SCHEMA, nativeFactIdentity, nativeRuleCommitment, nativeCustodyCommitment,
  nativeObservedEffectCommitment, encodeNativeFacts, nativeFactsDigest,
  validateSolanaBindingTransaction } from '@lianum/engine/native/native-receipt-binding';

const LABEL = 'LIANUM flat synthetic native fixture v1: ';
const h = name => createHash('sha256').update(LABEL + name).digest('hex');
const prefixed = value => '0x' + value;
const path = (root, opening, prefixedBytes = false) => ({ root: prefixedBytes ? root.slice(2) : root,
  index: opening.index, siblings: opening.siblings.map(value => prefixedBytes ? value.slice(2) : value) });

function snapshot(envelope, receiptTree, revokedDigest, timestamp) {
  const domain = envelope.public.domain;
  return { hubDomain: prefixed(domain.hubDomain), registryCommitment: prefixed(domain.registryCommitment),
    pool: '0x' + h('fake-pool-address').slice(0, 40), scope: prefixed(domain.scope), policy: prefixed(domain.policy),
    assetIdentity: prefixed(domain.asset), poolRoot: prefixed(envelope.public.poolAfter.root),
    poolSpentDigest: boundedListDigest(2, prefixed(domain.scope), [], '0'), poolSpentCount: '0', poolStateSequence: '1',
    receiptRoot: prefixed(receiptTree.root), receiptCount: String(receiptTree.count),
    spentTagDigest: boundedListDigest(0x31, prefixed(domain.hubDomain), [], '0'), spentTagCount: '0', spentTagSequence: '0',
    revokedDigest: prefixed(revokedDigest), revokedCount: '0', revocationSequence: '0',
    hubStateSequence: String(receiptTree.count), registryEpoch: envelope.public.native.registry.registryEpoch,
    halt: '0', timestamp };
}
function nativeFacts(envelope, slot) {
  const { domain, native } = envelope.public, rule = native.rules[slot], action = envelope.scoped.local[slot].action;
  const family = rule.family, observedAt = native.observedAt[slot];
  let transactionId, transactionSHA256, nativeWire = null;
  if (family === '1') {
    // Explicit synthetic fact identity; no fake BTC DER witness or assertion
    // that a real/native transaction was signed, broadcast or finalized.
    transactionId = h('synthetic-btc-id-with-K:' + action.receiptKeyCommitment) + ZERO;
    transactionSHA256 = h('synthetic-btc-wire-claim-not-executed:' + action.receiptKeyCommitment);
  } else {
    assert.equal(family, '2', 'SYNTHETIC_TWO_NATIVE_FAMILIES');
    const endpoints = native.endpoints[slot];
    const intent = { sourcePublicKey: endpoints.sourceEndpoint, recipientPublicKey: endpoints.destinationEndpoint,
      recentBlockhash: h('synthetic-sol-recent-blockhash'), lamports: action.amount, wireKeyCommitment: action.receiptKeyCommitment };
    nativeWire = envelope.signers.native.solana.signTransaction(intent);
    const checked = validateSolanaBindingTransaction(nativeWire, intent);
    transactionId = checked.signatureHex; transactionSHA256 = checked.transactionSHA256;
  }
  const nativeGid = nativeFactIdentity({ family, genesis: rule.genesis, asset: rule.asset, transactionId, effectIndex: '0' });
  const endpoints = { family, genesis: rule.genesis, asset: rule.asset,
    sourceCommitment: action.sourceCommitment, destinationCommitment: action.destinationCommitment };
  // Owner actions already contain the exact endpoint hashes, not placeholders.
  assert.equal(action.sourceCommitment, native.endpoints[slot].sourceCommitment, 'SYNTHETIC_SOURCE_JOIN');
  assert.equal(action.destinationCommitment, native.endpoints[slot].destinationCommitment, 'SYNTHETIC_DESTINATION_JOIN');
  const blockId = h('synthetic-native-block-' + slot), blockHeight = '100';
  const observation = { blockId, stateCommitment: nativeObservedEffectCommitment({ ...endpoints,
    nativeGid, blockId, blockHeight, transactionSHA256, amount: action.amount }), blockHeight, observedAt,
    finalityKind: family, confirmations: family === '1' ? '6' : '0', sourceCommitment: action.sourceCommitment,
    destinationCommitment: action.destinationCommitment, amount: action.amount, custodyKind: '1',
    custodyCommitment: nativeCustodyCommitment(endpoints), evidenceFrom: observedAt,
    evidenceUntil: String(BigInt(observedAt) + BigInt(rule.maximumEvidenceLifetime)) };
  const facts = { ledgerNamespace: domain.ledgerNamespace, hubDomain: domain.hubDomain,
    registryCommitment: domain.registryCommitment, ruleCommitment: nativeRuleCommitment(rule), family,
    genesis: rule.genesis, asset: rule.asset, transactionId, effectIndex: '0', nativeGid, transactionSHA256,
    wireBindingVersion: '1', wireBindingKind: family, wireBindingPosition: family === '1' ? '2' : '1',
    wireKeyCommitment: action.receiptKeyCommitment, observation,
    nativeContext: family === '1'
      ? { observedTipId: h('synthetic-btc-tip'), observedTipHeight: '105', transactionSlot: '0', parentSlot: '0', observedSlot: '0' }
      : { observedTipId: ZERO, observedTipHeight: '0', transactionSlot: '120', parentSlot: '119', observedSlot: '130' } };
  return { facts, nativeWire };
}
function admissionRequest(envelope, slot, ready, facts, checkpointOpening, currentRevocation) {
  const { domain, native } = envelope.public, action = envelope.scoped.local[slot].action;
  const descriptor = ready.admissionOpening.descriptor, rule = native.rules[slot];
  const policy = { ledgerNamespace: domain.ledgerNamespace, hubDomain: domain.hubDomain,
    registryCommitment: domain.registryCommitment, rule };
  const frameHex = encodeNativeFacts(facts, policy).toString('hex'), digest = nativeFactsDigest(facts, policy);
  const certificates = [0, 1, 2].map(index => ({ schema: FACTS_SCHEMA, signerIndex: String(index), facts,
    frameHex, digest, signature: envelope.signers.attesters[index].signFacts(facts, policy) }));
  const dispatchStatement = { hubDomain: domain.hubDomain, registryCommitment: domain.registryCommitment,
    readyStatement: nativeReadyStatementDigest([...readyDescriptorWords(descriptor)]),
    localCommitment: descriptor.localCommitment, dispatchId: descriptor.dispatchId,
    actionCommitment: descriptor.actionCommitment, globalEffectId: facts.nativeGid,
    deliveryRiskCommitment: action.deliveryRiskCommitment, signedAt: descriptor.readyFrom };
  const receiptOpening = Object.fromEntries(['hubDomain', 'registryCommitment', 'scope', 'policy', 'localCommitment',
    'dispatchId', 'chainDomain', 'evidencePolicy', 'actionCommitment', 'payoutCommitment'].map(name => [name, descriptor[name]]));
  Object.assign(receiptOpening, { globalEffectId: facts.nativeGid, validFrom: facts.observation.evidenceFrom,
    validUntil: BigInt(facts.observation.evidenceUntil) < BigInt(action.settleBefore) ? facts.observation.evidenceUntil : action.settleBefore,
    receiptKeyCommitment: action.receiptKeyCommitment, receiptRho: action.receiptRho });
  return { readyStatement: ready.statement, readinessOpening: ready.admissionOpening,
    action, receiptSpendSecret: envelope.scoped.local[slot].receiptSpendSecret, receiptOpening,
    checkpointOpening, registry: native.registry, rule, rulePath: native.rulePaths[slot],
    provider: { publicKey: native.providers[slot], dispatchStatement,
      signature: envelope.signers.providers[slot].signDispatch(dispatchStatement), deliveryRiskSalt: native.riskSalts[slot] },
    certificates, currentRevocation, admissionFrom: receiptOpening.validFrom, admissionUntil: receiptOpening.validUntil };
}
function negative(name, slot, abi, original, mutate) {
  const inputs = cloneInput(original.inputs), statement = cloneInput(original.statement);
  mutate(inputs, statement);
  // Exact ABI and expected words are rederived AFTER mutation, so these reach
  // actual circuit constraints rather than a mismatched host words check.
  return { name, relation: 'admission', slot, ...validateFlatInputs('admission', abi, inputs, statement) };
}

/** abis is exactly {dependency,ready,admission}, loaded/pinned by primary.
 * Never creates another owner envelope. Inputs/roots remain synthetic even
 * when hashFields is the official pinned implementation used by primary.
 */
export async function buildSyntheticNativeFixture(envelope, options) {
  exactRecord(options, ['hashFields', 'abis']); exactRecord(options.abis, ['dependency', 'ready', 'admission']);
  assert.equal(envelope.synthetic, true, 'SYNTHETIC_FIXTURE_ONLY');
  const codec = createCommitmentCodec({ hashFields: options.hashFields }), { abis } = options;
  const d = envelope.public.statements.authorization.domainCommitment, domain = envelope.public.domain;
  const entries = Array(64).fill(ZERO), revokedDigest = await codec.revokedDigest(d, domain.hubDomain, entries, '0');
  const currentRevocation = { revokedDigest, revokedCount: '0', revocationSequence: '0', entries };
  const authorization = path(envelope.public.authorization.root, envelope.public.authorization.path);
  const reservePath = path(envelope.public.poolAfter.root, envelope.public.poolAfter.reservePath);
  const jobs = { dependency: [], ready: [], admission: [] }, receipts = [], snapshots = [], histories = [], observations = [];
  const checkpointTree = new PrivateNoteTree();
  let receiptTree = await codec.buildTree(d, 2, []);
  for (let slot = 0; slot < 2; slot++) {
    const window = envelope.public.native.readiness[slot], historic = snapshot(envelope, receiptTree, revokedDigest, window.readyFrom);
    snapshots.push(historic);
    const incoming = slot === 0 ? [] : [{ opening: receipts[0].opening, path: path(receiptTree.root, receiptTree.opening(0)) }];
    const dependency = await buildDependencyInputs({ packet: envelope.scoped.dependency[slot], authorization, snapshot: historic,
      ...window, predecessorReceipts: incoming, revokedEntries: entries }, { hashFields: options.hashFields, abi: abis.dependency });
    const ready = await buildReadyInputs({ packet: envelope.scoped.local[slot], authorization, snapshot: historic, ...window,
      reservePath, poolSpentEntries: entries, readinessBlind: h('ready-blind-' + slot) }, { hashFields: options.hashFields, abi: abis.ready });
    joinReadiness(dependency.statement, ready.statement);
    const checkpointIndex = checkpointTree.append(ready.statement.checkpoint);
    const checkpointOpening = path(checkpointTree.root, checkpointTree.path(checkpointIndex), true);
    histories.push({ root: checkpointOpening.root, count: checkpointTree.leafCount, path: checkpointOpening });
    const observed = nativeFacts(envelope, slot); observations.push(observed);
    const request = admissionRequest(envelope, slot, ready, observed.facts, checkpointOpening, currentRevocation);
    const admission = await buildAdmissionInputs(request, { hashFields: options.hashFields, abi: abis.admission });
    joinAdmission(dependency.statement, ready.statement, admission.statement);
    jobs.dependency.push(dependency); jobs.ready.push(ready); jobs.admission.push(admission);
    receipts.push({ opening: request.receiptOpening, commitment: admission.receiptCommitment, leaf: admission.statement.receiptLeaf });
    receiptTree = await codec.buildTree(d, 2, receipts.map(receipt => receipt.leaf));
  }
  receipts.forEach((receipt, index) => { receipt.path = path(receiptTree.root, receiptTree.opening(index)); });
  const stateOpening = { hubDomain: domain.hubDomain, registryCommitment: domain.registryCommitment,
    receiptRoot: receiptTree.root, receiptCount: String(receiptTree.count), revokedDigest,
    revokedCount: '0', revocationSequence: '0' };
  const evidenceState = await codec.evidenceStateDigest(d, stateOpening);
  const negativeCases = [
    negative('i-invalid-provider-signature', 0, abis.admission, jobs.admission[0], inputs => {
      inputs.dispatch_signature[0] = String(Number(inputs.dispatch_signature[0]) ^ 1);
    }),
    negative('i-invalid-facts-signature', 1, abis.admission, jobs.admission[1], inputs => {
      inputs.attester_signatures[0][0] = String(Number(inputs.attester_signatures[0][0]) ^ 1);
    }),
    negative('i-mismatched-historical-join', 1, abis.admission, jobs.admission[1], (inputs, statement) => {
      statement.joinCommitment = ((BigInt('0x' + statement.joinCommitment) + 1n) % FIELD_MODULUS).toString(16).padStart(64, '0');
      inputs.join_commitment = digestWords(statement.joinCommitment);
    }),
    negative('i-mismatched-historical-window', 1, abis.admission, jobs.admission[1], (inputs, statement) => {
      statement.readyUntil = String(BigInt(statement.readyUntil) - 1n); inputs.ready_until = statement.readyUntil;
    }),
  ];
  const revokedEntries = [...entries]; revokedEntries[0] = receipts[1].opening.globalEffectId;
  const changedDigest = await codec.revokedDigest(d, domain.hubDomain, revokedEntries, '1');
  const changedState = await codec.admissionRevocationState(d, { currentRevokedDigest: changedDigest,
    currentRevokedCount: '1', currentRevocationSequence: '1' });
  negativeCases.push(negative('i-current-gid-revoked-with-matching-p18', 1, abis.admission, jobs.admission[1], (inputs, statement) => {
    inputs.current_revoked_entries = revokedEntries.map(digestBytes); inputs.current_revoked_digest = digestBytes(changedDigest);
    inputs.current_revoked_count = '1'; inputs.current_revocation_sequence = '1';
    statement.admissionRevocationState = changedState; inputs.admission_revocation_state = digestWords(changedState);
  }));
  return frozenInput({ synthetic: true,
    assurance: 'SIGNED_SYNTHETIC_WITNESSES_NOT_NATIVE_FINALITY_PROOF_OR_ACCEPTANCE', jobs, receipts,
    public: { domainCommitment: d, authorizationRoot: authorization.root, receiptRoot: receiptTree.root,
      receiptCount: String(receiptTree.count), evidenceState, stateOpening, revokedEntries: entries,
      checkpointHistory: { root: checkpointTree.root.slice(2), count: checkpointTree.leafCount,
        submissionOpenings: histories, paths: [0, 1].map(index => path(checkpointTree.root, checkpointTree.path(index), true)) },
      snapshots, completion: envelope.public.native.completion },
    // Private synthetic evidence for source review, not a public hub event or
    // peer inventory/independence claim. BTC nativeWire is deliberately null.
    nativeEvidence: observations, negativeCases });
}
