/** One-operation synthetic generic native owner, available only over private IPC.
 * The graph and all source/change/recovery signing keys remain here. A trusted
 * bootstrap receives distinct role packets for assignment, not owner witnesses.
 * This common-host fixture relies on non-collusion and a trusted OS account.
 * The new client Vault contains encrypted recovery state before prepare replies;
 * it never contains the graph nonce, graph witness or recipient signing keys.
 */
import { createHash, randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { Vault } from '../../../packages/protocol/src/crypto/vault.mjs';
import { canonical } from '../../../packages/protocol/src/crypto/privacy.mjs';
import { createProofProcess } from '../../../packages/protocol/src/execution/proofs/proof-process.mjs';
import { encodeProofMessage, decodeProofMessage, encodePrivateProof, wipePrivate } from '../../../packages/protocol/src/execution/proofs/proof-worker.mjs';
import { NATIVE_OWNER_PROTOCOL, NATIVE_OWNER_MAX_REQUEST_BYTES, nativeOwnerError, nativeOwnerNeed,
  nativeOwnerExact, normalizeNativeOwnerPrepare, normalizeNativeOwnerAuthorize,
  canonicalNativeOwnerNodes, nativeOwnerPayoutNote } from '../../../packages/protocol/src/execution/native/dispatch/native-owner.mjs';
import { compileFundedGraph, fundedSigningRequests, attachFundedSignatures, fundedAuthorizationWords } from '../../../packages/protocol/src/execution/graph/funded-graph.mjs';
import { prepareNativeCapsules, nativeReceiptKeyCommitment, nativeTransferActionCommitment,
  capsuleAuthorizationWords } from '../../../packages/protocol/src/execution/native/dispatch/native-capsules.mjs';
import { nativeDeliveryRiskCommitment, NATIVE_ADMISSION_LOSS_CLAUSE } from '../../../packages/protocol/src/execution/native/dispatch/native-admission.mjs';
import { authorizationInputs } from '../../../packages/protocol/circuits/generic-funding/witness.mjs';
import { freshKey, signature } from '../../../packages/protocol/src/notes/private-note-encoding.mjs';
import { walletNoteCommitment, walletDepositInput, walletInputPublicWords } from '../../../packages/protocol/src/wallet/notes/private-wallet-note-encoding.mjs';

const ZERO = '0'.repeat(64);
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const objectHash = value => hash(canonical(value));
const freshHash = () => randomBytes(32).toString('hex');
const hex = bytes => Buffer.from(bytes).toString('hex');
const note = (key, value) => ({ type: 4, rho: freshHash(), x: hex(key.x), y: hex(key.y), value, secret: freshHash() });
const emptyNote = () => ({ type: 4, rho: ZERO, x: ZERO, y: ZERO, value: '0', secret: ZERO });
const safeCode = error => /^PAEG_(?:NATIVE_OWNER|PROOF)_[A-Z_]+$/.test(error?.code ?? '')
  ? error.code : /^VAULT_[A-Z_]+$/.test(error?.code ?? '') ? 'PAEG_NATIVE_OWNER_VAULT_FAILURE'
    : 'PAEG_NATIVE_OWNER_CONSTRAINT_OR_TOOLCHAIN_FAILURE';

function proofMetrics(mode, proof) {
  const m = proof.metrics;
  nativeOwnerNeed(m.acceptedResult === true && m.exit?.code === 0 && m.worker?.verified === true,
    'PAEG_NATIVE_OWNER_PROOF_INCOMPLETE');
  return { mode, keySHA256: m.keySHA256, artifactSHA256: m.artifactSHA256, sourceTreeSHA256: m.sourceTreeSHA256,
    proofSHA256: hash(proof.proof), publicInputsSHA256: objectHash(proof.publicInputs),
    ...(mode === 'deposit_balance' ? {} : { proofFieldsSHA256: objectHash(proof.proofFields), vkFieldsSHA256: objectHash(proof.vkFields) }),
    proofBytes: proof.proof.length, publicInputCount: proof.publicInputs.length, verified: true };
}

function buildOperation(config) {
  // All spend/signing keys are fresh and independently generated in this owner.
  // Recipient offers contain public coordinates/openings, never signing keys.
  const sourceKey = freshKey(), changeKey = freshKey(), recoveryKey = freshKey();
  const ordered = canonicalNativeOwnerNodes(config.nodes);
  const budget = ordered.reduce((sum, node) => sum + BigInt(node.recipientOffer.value), 0n).toString();
  const changeValue = (BigInt(config.fundingAmount) - BigInt(budget)).toString();
  const source = note(sourceKey, config.fundingAmount), recovery = note(recoveryKey, budget);
  const change = changeValue === '0' ? emptyNote() : note(changeKey, changeValue);
  const nodes = ordered.map((node, slot) => {
    const payout = nativeOwnerPayoutNote(config, node.recipientOffer, slot);
    const payoutCommitment = walletNoteCommitment(config.scope, config.policy, payout).toString('hex');
    const receiptSpendSecret = freshHash(), deliveryRiskSalt = freshHash();
    const template = node.actionTemplate;
    const deliveryRiskCommitment = nativeDeliveryRiskCommitment({ clause: NATIVE_ADMISSION_LOSS_CLAUSE,
      hubDomain: config.hubDomain, registryCommitment: config.registryCommitment,
      chainDomain: template.chainDomain, sourceCommitment: template.sourceCommitment,
      destinationCommitment: template.destinationCommitment, amount: template.amount,
      scope: config.scope, policy: config.policy, asset: config.asset, payoutCommitment,
      settleBefore: config.settleBefore, salt: deliveryRiskSalt });
    const action = { ...template, settleBefore: config.settleBefore,
      receiptKeyCommitment: nativeReceiptKeyCommitment(config.hubDomain, receiptSpendSecret),
      receiptRho: freshHash(), deliveryRiskCommitment, actionSalt: freshHash() };
    return { id: node.id, action, receiptSpendSecret, deliveryRiskSalt, payout };
  });
  const reserveSecret = freshHash();
  const compiled = compileFundedGraph({ scope: config.scope, policy: config.policy, asset: config.asset,
    operationId: config.operationId, budget, fundingNotBefore: config.fundingNotBefore,
    fundingValidUntil: config.fundingValidUntil, settleBefore: config.settleBefore,
    reservationNonce: freshHash(), reserveSecret, graphNonce: freshHash(),
    inputNote: source, changeNote: change, recoveryNote: recovery,
    nodes: ordered.map((node, slot) => ({ id: node.id, chainDomain: node.actionTemplate.chainDomain,
      evidencePolicy: node.evidencePolicy, actionCommitment: nativeTransferActionCommitment(nodes[slot].action),
      dependsOn: [...node.dependsOn], payout: { ...node.recipientOffer } })),
    paddingSalts: Array.from({ length: 4 }, freshHash) });
  const requests = fundedSigningRequests(compiled), s = compiled.authorizationStatement;
  // Verify the independent slot/rho calculation against the funded codec itself.
  requests.invoices.forEach((request, slot) => {
    nativeOwnerNeed(request.id === ordered[slot].id
      && canonical(compiled.ownerWitness.payouts[slot]) === canonical({ ...nodes[slot].payout, randomness: ordered[slot].recipientOffer.randomness }),
    'PAEG_NATIVE_OWNER_CANONICAL_PAYOUT');
  });
  const invoiceRequests = requests.invoices.map((request, slot) => ({ id: request.id, slot, invoice: {
    scope: config.scope, policy: config.policy, asset: config.asset, operationId: config.operationId, slot,
    chainDomain: ordered[slot].actionTemplate.chainDomain, evidencePolicy: ordered[slot].evidencePolicy,
    actionCommitment: compiled.ownerWitness.graph.nodes[slot].actionCommitment, payoutCommitment: s.outputs[slot],
    rho: nodes[slot].payout.rho, settleBefore: config.settleBefore,
    action: structuredClone(nodes[slot].action), deliveryRiskSalt: nodes[slot].deliveryRiskSalt,
  } }));
  const slotSalts = Array.from({ length: 4 }, () => ({ targetSalt: freshHash(), localCapsuleSalt: freshHash(), dependencyCapsuleSalt: freshHash() }));
  const { vault: ignoredVault, ...publicConfig } = config;
  return { sourceKey, changeKey, recoveryKey, source, change, recovery, reserveSecret, compiled, nodes, slotSalts,
    invoiceRequests, metrics: { classification: 'SYNTHETIC_NATIVE_OWNER_HASH_ONLY_METRICS',
      configurationSHA256: objectHash(publicConfig), invoiceRequestsSHA256: objectHash(invoiceRequests),
      recoveryStateSHA256: null, proofs: [] } };
}

/** Recovery document schema is versioned and deliberately excludes the graph.
 * Zero-change has a canonical empty opening and no persisted change key. */
function recoveryRecord(config, operation) {
  const s = operation.compiled.authorizationStatement;
  const storedNote = (opening, key) => ({ opening: structuredClone(opening), privateKeyPem: key.privateKey.export({ type: 'pkcs8', format: 'pem' }) });
  return { schema: 'LIANUM_SYNTHETIC_NATIVE_OWNER_RECOVERY_V1', state: 'prepared',
    binding: { ...Object.fromEntries(['scope', 'policy', 'asset', 'hubDomain', 'registryCommitment', 'operationId',
      'epoch', 'fundingNotBefore', 'fundingValidUntil', 'settleBefore'].map(key => [key, config[key]])),
    fundingCommitment: s.inputCommitment, admissionTag: operation.compiled.admissionTag,
    reserveCommitment: s.reserveCommitment, reserveNullifier: s.reserveNullifier,
    changeCommitment: s.changeCommitment, recoveryCommitment: s.recoveryCommitment },
    reserveSecret: operation.reserveSecret,
    source: storedNote(operation.source, operation.sourceKey), recovery: storedNote(operation.recovery, operation.recoveryKey),
    change: operation.change.value === '0' ? { opening: emptyNote(), privateKeyPem: null } : storedNote(operation.change, operation.changeKey),
    privateProofs: null };
}

export async function runGenericNativeOwnerWorker() {
  nativeOwnerNeed(typeof process.send === 'function' && process.connected, 'PAEG_NATIVE_OWNER_PRIVATE_IPC_REQUIRED');
  let config, operation, vault, vaultRevision, prover, prepared = false, authorized = false, busy = false, stopping = false, nextId = 1;
  const send = value => new Promise((resolve, reject) => {
    const bytes = encodeProofMessage(value);
    try { process.send(bytes, error => { bytes.fill(0); error ? reject(nativeOwnerError('PAEG_NATIVE_OWNER_IO')) : resolve(); }); }
    catch { bytes.fill(0); reject(nativeOwnerError('PAEG_NATIVE_OWNER_IO')); }
  });
  async function stop(code) {
    if (stopping) return; stopping = true;
    await prover?.close().catch(() => {});
    // KeyObjects/frozen codec closures and JS strings cannot promise erasure.
    // Dropping references followed by actual process exit reclaims this owner.
    if (config) wipePrivate(config); config = null; operation = null; vault = null; prover = null;
    process.removeListener('disconnect', disconnected);
    if (process.connected) process.disconnect(); process.exit(code);
  }
  const disconnected = () => { void stop(2); };
  process.once('disconnect', disconnected);
  process.once('SIGTERM', () => { void stop(2); }); process.once('SIGINT', () => { void stop(2); });

  async function prepare(input) {
    nativeOwnerNeed(!prepared && !config, 'PAEG_NATIVE_OWNER_PREPARE_ONCE');
    config = normalizeNativeOwnerPrepare(input); operation = buildOperation(config); vault = new Vault(config.vault.path);
    let state, written, reread;
    try {
      state = recoveryRecord(config, operation);
      operation.metrics.recoveryStateSHA256 = objectHash(state);
      // A new file only: never overwrite an existing or ambiguously committed
      // client recovery Vault. Vault performs file+directory fsync on Linux.
      written = await vault.create(state, config.vault.password);
      reread = await vault.read(config.vault.password);
      nativeOwnerNeed(reread.revision === written.revision && objectHash(reread.data) === operation.metrics.recoveryStateSHA256,
        'PAEG_NATIVE_OWNER_VAULT_READBACK');
      vaultRevision = reread.revision; prepared = true;
      return { invoiceRequests: structuredClone(operation.invoiceRequests), metrics: structuredClone(operation.metrics) };
    } finally { wipePrivate(state); wipePrivate(written); wipePrivate(reread); }
  }

  async function authorize(input) {
    nativeOwnerNeed(prepared && !authorized && operation, 'PAEG_NATIVE_OWNER_NOT_READY');
    const detached = normalizeNativeOwnerAuthorize(input);
    nativeOwnerNeed(detached.invoiceSignatures.length === operation.nodes.length, 'PAEG_NATIVE_OWNER_INVOICE_COUNT');
    const requests = fundedSigningRequests(operation.compiled);
    let ownerSignature;
    try { ownerSignature = signature(operation.sourceKey, requests.owner.message); }
    finally { wipePrivate(requests); }
    let signed, depositInput, a0Input, cInput, deposit, authorization, capsuleAuthorization, encodedAuthorization, encodedCapsule;
    try {
      // Both owner and recipient signatures are checked before starting proving.
      signed = attachFundedSignatures(operation.compiled, { ownerSignature: hex(ownerSignature), invoiceSignatures: detached.invoiceSignatures });
      // This is the existing fixed facade: prepared native pins, existing CRS,
      // resource caps, fresh proof processes and independent verification apply.
      prover = createProofProcess({ purpose: 'owner', modes: ['deposit_balance', 'authorization', 'capsule'] });
      depositInput = walletDepositInput({ scope: config.scope, policy: config.policy, epoch: config.epoch,
        note: { ...operation.source, privateKey: operation.sourceKey.privateKey, publicKey: operation.sourceKey.publicKey } });
      deposit = await prover.prove('deposit_balance', depositInput, walletInputPublicWords('deposit_balance', depositInput), 'generic-native-owner-deposit');
      operation.metrics.proofs.push(proofMetrics('deposit_balance', deposit));
      wipePrivate(depositInput); depositInput = null;
      a0Input = authorizationInputs(signed);
      authorization = await prover.prove('authorization', a0Input, fundedAuthorizationWords(signed.authorizationStatement), 'generic-native-owner-authorization');
      operation.metrics.proofs.push(proofMetrics('authorization', authorization));
      wipePrivate(a0Input); a0Input = null;
      // C and every role packet are prepared only after genuine A0 completion.
      const capsules = prepareNativeCapsules({ signed, hubDomain: config.hubDomain, registryCommitment: config.registryCommitment,
        nodes: operation.nodes.map(node => ({ id: node.id, action: node.action, receiptSpendSecret: node.receiptSpendSecret })), slotSalts: operation.slotSalts });
      cInput = capsules.ownerAuthorizationInputs({ publicInputs: authorization.publicInputs, proofFields: authorization.proofFields, vkFields: authorization.vkFields });
      capsuleAuthorization = await prover.prove('capsule', cInput, capsuleAuthorizationWords(capsules.statement), 'generic-native-owner-capsule');
      operation.metrics.proofs.push(proofMetrics('capsule', capsuleAuthorization));
      wipePrivate(cInput); cInput = null;
      encodedAuthorization = encodePrivateProof('authorization', authorization);
      encodedCapsule = encodePrivateProof('capsule', capsuleAuthorization);
      let updated, reread;
      try {
        updated = await vault.update(config.vault.password, vaultRevision, data => {
          nativeOwnerNeed(data.state === 'prepared' && objectHash(data) === operation.metrics.recoveryStateSHA256,
            'PAEG_NATIVE_OWNER_VAULT_BINDING');
          return { ...data, state: 'authorized', privateProofs: { authorization: encodedAuthorization, capsuleAuthorization: encodedCapsule } };
        });
        reread = await vault.read(config.vault.password);
        nativeOwnerNeed(reread.revision === updated.revision && objectHash(reread.data) === objectHash(updated.data), 'PAEG_NATIVE_OWNER_VAULT_READBACK');
        vaultRevision = reread.revision; operation.metrics.recoveryStateSHA256 = objectHash(reread.data);
      } finally { wipePrivate(updated); wipePrivate(reread); }
      const s = signed.authorizationStatement;
      const result = { deposit: encodePrivateProof('deposit_balance', deposit),
        authorization: structuredClone(encodedAuthorization), capsuleAuthorization: structuredClone(encodedCapsule),
        fundingCommitment: s.inputCommitment, admissionTag: signed.admissionTag,
        reserveCommitment: s.reserveCommitment, reserveNullifier: s.reserveNullifier,
        changeCommitment: s.changeCommitment, recoveryCommitment: s.recoveryCommitment, settleBefore: s.settleBefore,
        rolePackets: { ready: Array.from({ length: 4 }, (_, i) => i < operation.nodes.length ? structuredClone(capsules.readyRole(i)) : null),
          dependency: Array.from({ length: 4 }, (_, i) => structuredClone(capsules.dependencyRole(i))),
          node: Array.from({ length: 4 }, (_, i) => structuredClone(capsules.nodeRole(i))) },
        providerRiskSalts: Array.from({ length: 4 }, (_, i) => operation.nodes[i]?.deliveryRiskSalt ?? null),
        metrics: structuredClone(operation.metrics) };
      authorized = true; return result;
    } finally {
      ownerSignature?.fill(0); wipePrivate(detached); wipePrivate(depositInput); wipePrivate(a0Input); wipePrivate(cInput);
      wipePrivate(deposit); wipePrivate(authorization); wipePrivate(capsuleAuthorization);
      wipePrivate(encodedAuthorization); wipePrivate(encodedCapsule); signed = null;
    }
  }

  process.on('message', async bytes => {
    let request, result;
    try {
      nativeOwnerNeed(bytes instanceof Uint8Array && bytes.length > 0 && bytes.length <= NATIVE_OWNER_MAX_REQUEST_BYTES,
        'PAEG_NATIVE_OWNER_MESSAGE_LIMIT');
      request = decodeProofMessage(bytes); nativeOwnerExact(request, ['protocol', 'id', 'operation', 'input']);
      nativeOwnerNeed(!busy && !stopping && request.protocol === NATIVE_OWNER_PROTOCOL && request.id === nextId
        && ['prepare', 'authorize', 'close'].includes(request.operation), 'PAEG_NATIVE_OWNER_PROTOCOL');
      busy = true; nextId++;
      if (request.operation === 'prepare') result = await prepare(request.input);
      else if (request.operation === 'authorize') result = await authorize(request.input);
      else { nativeOwnerNeed(request.input === null, 'PAEG_NATIVE_OWNER_EXACT_FIELDS'); await prover?.close(); result = { closed: true }; }
      await send({ event: 'result', id: request.id, result });
      if (request.operation === 'close') await stop(0); busy = false;
    } catch (error) {
      await send({ event: 'failure', id: request?.id ?? 0, code: safeCode(error) }).catch(() => {}); await stop(1);
    } finally { wipePrivate(request); wipePrivate(result); }
  });
  await send({ event: 'ready', protocol: NATIVE_OWNER_PROTOCOL });
}
if (process.argv[1] === fileURLToPath(import.meta.url)) runGenericNativeOwnerWorker().catch(() => process.exit(1));
