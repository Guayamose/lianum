/** Fixed synthetic owner process for local fake-fund acceptance only.
 * No signing key, note opening, full graph, or A0 witness leaves this process.
 * D26/W39 proofs are public; the two A0 packages are PRIVATE coordinator inputs.
 * Node KeyObjects cannot promise perfect zeroization; exit reclaims the process.
 */
import { createHash, randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { createProofProcess } from '../../../packages/protocol/src/execution/proofs/proof-process.mjs';
import { encodeProofMessage, decodeProofMessage, encodePrivateProof, wipePrivate } from '../../../packages/protocol/src/execution/proofs/proof-worker.mjs';
import {
  GENERIC_OWNER_PROTOCOL, OWNER_MAX_REQUEST_BYTES, ownerError, ownerNeed, ownerExact,
  normalizeOwnerInit, normalizeOwnerWithdrawal,
} from '../../../packages/protocol/src/execution/local/local-owner.mjs';
import { compileFundedGraph, fundedSigningRequests, attachFundedSignatures, fundedAuthorizationWords } from '../../../packages/protocol/src/execution/graph/funded-graph.mjs';
import { authorizationInputs } from '../../../packages/protocol/circuits/generic-funding/witness.mjs';
import { freshKey, signature } from '../../../packages/protocol/src/notes/private-note-encoding.mjs';
import {
  walletNoteCommitment, walletDepositInput, walletWithdrawInput, walletInputPublicWords,
} from '../../../packages/protocol/src/wallet/notes/private-wallet-note-encoding.mjs';

const hash = value => createHash('sha256').update(value).digest('hex');
const freshHash = () => randomBytes(32).toString('hex');
const hex = value => Buffer.from(value).toString('hex');
const ZERO = '0'.repeat(64);
const safeCode = error => /^PAEG_(?:OWNER|PROOF)_[A-Z_]+$/.test(error?.code ?? '')
  ? error.code : 'PAEG_OWNER_CONSTRAINT_OR_TOOLCHAIN_FAILURE';
const note = (key, value) => ({ type: 4, rho: freshHash(), x: hex(key.x), y: hex(key.y), value, secret: freshHash() });
const emptyNote = () => ({ type: 4, rho: ZERO, x: ZERO, y: ZERO, value: '0', secret: ZERO });
const signedWalletNote = (opening, key) => ({ ...opening, privateKey: key.privateKey, publicKey: key.publicKey });

function proofMetrics(mode, proof) {
  const measured = proof.metrics;
  ownerNeed(measured.acceptedResult === true && measured.exit?.code === 0 && measured.worker?.verified === true,
    'PAEG_OWNER_PROOF_INCOMPLETE');
  return {
    mode, proofProcessId: measured.id, keySHA256: measured.keySHA256,
    artifactSHA256: measured.artifactSHA256, sourceTreeSHA256: measured.sourceTreeSHA256,
    proofSHA256: hash(proof.proof), publicInputsSHA256: hash(JSON.stringify(proof.publicInputs)),
    ...(mode === 'authorization' ? {
      proofFieldsSHA256: hash(JSON.stringify(proof.proofFields)), vkFieldsSHA256: hash(JSON.stringify(proof.vkFields)),
      proofFieldCount: proof.proofFields.length, vkFieldCount: proof.vkFields.length,
    } : {}),
    proofBytes: proof.proof.length, publicInputCount: proof.publicInputs.length,
    totalMilliseconds: measured.totalMilliseconds, verified: true, workerExitCode: measured.exit.code,
    zeroKnowledgeEnabled: measured.zeroKnowledgeEnabled, maximumPages: measured.maximumPages, threads: measured.threads,
  };
}
function prepareIntent(config, source, sourceKey, change, recovery, chains) {
  const recipients = chains.map(() => freshKey());
  const input = {
    scope: config.scope, policy: config.policy, asset: config.asset, operationId: freshHash(), budget: '100',
    fundingNotBefore: config.fundingNotBefore, fundingValidUntil: config.fundingValidUntil, settleBefore: config.settleBefore,
    reservationNonce: freshHash(), reserveSecret: freshHash(), graphNonce: freshHash(),
    inputNote: source, changeNote: change, recoveryNote: recovery,
    nodes: chains.map((chain, index) => ({
      id: `leg-${index}`, chainDomain: hash(`LIANUM/synthetic-local-chain/${chain}/1`),
      evidencePolicy: hash(`LIANUM/synthetic-local-evidence/${chain}/1`), actionCommitment: freshHash(),
      dependsOn: index === 0 ? [] : [`leg-${index - 1}`],
      payout: { x: hex(recipients[index].x), y: hex(recipients[index].y),
        value: chains.length === 2 ? '50' : index === 2 ? '34' : '33', secret: freshHash(), randomness: freshHash() },
    })).reverse(),
    paddingSalts: Array.from({ length: 4 }, freshHash),
  };
  const compiled = compileFundedGraph(input), requests = fundedSigningRequests(compiled);
  const signed = attachFundedSignatures(compiled, {
    ownerSignature: hex(signature(sourceKey, requests.owner.message)),
    invoiceSignatures: requests.invoices.map(request => hex(signature(recipients[request.slot], request.message))),
  });
  const statement = compiled.authorizationStatement;
  return {
    witness: authorizationInputs(signed), expected: fundedAuthorizationWords(statement), recipientKeys: recipients,
    exposed: {
      admissionTag: compiled.admissionTag, reserveCommitment: statement.reserveCommitment,
      changeCommitment: statement.changeCommitment, recoveryCommitment: statement.recoveryCommitment,
      settleBefore: config.settleBefore,
      graphShape: {
        classification: 'TEST_ORACLE_ONLY_SYNTHETIC_GRAPH_SHAPE', chains: [...chains],
        dependencyMasks: chains.map((_, index) => index === 0 ? 0 : 1 << (index - 1)),
        activeCount: chains.length, capacity: 4, inactiveSlots: 4 - chains.length,
        inputValue: source.value, budget: '100', changeValue: change.value, zeroChangePadding: change.value === '0',
      },
    },
  };
}

export async function runGenericOwnerWorker() {
  ownerNeed(typeof process.send === 'function' && process.connected, 'PAEG_OWNER_PRIVATE_IPC_REQUIRED');
  // The generic proof facade still performs all pinned ABI/key/CRS checks and
  // owns its external watchdog. Do not duplicate or weaken the proof launcher.
  let prover, config, retained, initialized = false, busy = false, stopping = false, nextId = 1;
  const withdrawn = new Set();
  const send = value => new Promise((resolve, reject) => {
    const bytes = encodeProofMessage(value);
    try { process.send(bytes, error => { bytes.fill(0); error ? reject(ownerError('PAEG_OWNER_IO')) : resolve(); }); }
    catch { bytes.fill(0); reject(ownerError('PAEG_OWNER_IO')); }
  });
  async function stop(code) {
    if (stopping) return; stopping = true;
    await prover?.close().catch(() => {});
    // Drop private references; no private material has ever been written to disk.
    retained = null; config = null;
    process.removeListener('disconnect', disconnected);
    if (process.connected) process.disconnect();
    process.exit(code);
  }
  const disconnected = () => { void stop(2); };
  process.once('disconnect', disconnected);
  process.once('SIGTERM', () => { void stop(2); });
  process.once('SIGINT', () => { void stop(2); });

  async function initialize(input) {
    ownerNeed(!initialized && !config, 'PAEG_OWNER_INIT_ONCE');
    config = normalizeOwnerInit(input);
    const fundingKey = freshKey(), changeKey = freshKey(), recoveryKeys = [freshKey(), freshKey()];
    const funding = note(fundingKey, '200'), change = note(changeKey, '100');
    const recoveries = recoveryKeys.map(key => note(key, '100'));
    retained = { fundingKey, changeKey, recoveryKeys, funding, change, recoveries, recipientKeys: [] };
    prover = createProofProcess({ purpose: 'owner', modes: ['authorization', 'deposit_balance', 'withdraw_balance'] });
    const depositInput = walletDepositInput({ ...config, note: signedWalletNote(funding, fundingKey) });
    let deposit;
    const metrics = [], intents = [];
    try {
      deposit = await prover.prove('deposit_balance', depositInput,
        walletInputPublicWords('deposit_balance', depositInput), 'generic-owner-deposit');
      metrics.push(proofMetrics('deposit_balance', deposit));
      for (let index = 0; index < 2; index++) {
        const intent = prepareIntent(config, index === 0 ? funding : change, index === 0 ? fundingKey : changeKey,
          index === 0 ? change : emptyNote(), recoveries[index], index === 0 ? ['SOL', 'BTC'] : ['BTC', 'SOL', 'EVM']);
        retained.recipientKeys.push(...intent.recipientKeys);
        let authorization;
        try {
          authorization = await prover.prove('authorization', intent.witness, intent.expected, `generic-owner-authorization-${index}`);
          metrics.push(proofMetrics('authorization', authorization));
          intents.push({ authorization: encodePrivateProof('authorization', authorization), ...intent.exposed });
        } finally { wipePrivate(intent.witness); wipePrivate(intent.expected); wipePrivate(authorization); }
      }
      ownerNeed(metrics[1].keySHA256 === metrics[2].keySHA256
        && metrics[1].vkFieldsSHA256 === metrics[2].vkFieldsSHA256, 'PAEG_OWNER_REUSED_PROFILE');
      initialized = true;
      return {
        deposit: encodePrivateProof('deposit_balance', deposit),
        fundingCommitment: walletNoteCommitment(config.scope, config.policy, funding).toString('hex'), intents,
        metrics: { classification: 'SYNTHETIC_OWNER_HASH_ONLY_PROOF_METRICS', proofs: metrics },
      };
    } finally { wipePrivate(depositInput); wipePrivate(deposit); }
  }
  async function withdraw(input) {
    ownerNeed(initialized, 'PAEG_OWNER_NOT_READY');
    const request = normalizeOwnerWithdrawal(input), index = request.recoveryIndex;
    ownerNeed(!withdrawn.has(index), 'PAEG_OWNER_WITHDRAW_ONCE');
    ownerNeed(BigInt(request.epoch) >= BigInt(config.epoch), 'PAEG_OWNER_EPOCH');
    const recovery = retained.recoveries[index];
    ownerNeed(request.path.leaf === walletNoteCommitment(config.scope, config.policy, recovery).toString('hex'), 'PAEG_OWNER_RECOVERY_MEMBERSHIP');
    const witness = walletWithdrawInput({ scope: config.scope, policy: config.policy, epoch: request.epoch,
      note: signedWalletNote(recovery, retained.recoveryKeys[index]), path: request.path, recipient: config.recipient });
    let proof;
    try {
      proof = await prover.prove('withdraw_balance', witness, walletInputPublicWords('withdraw_balance', witness), `generic-owner-withdraw-${index}`);
      withdrawn.add(index);
      return { proofPackage: encodePrivateProof('withdraw_balance', proof), metrics: proofMetrics('withdraw_balance', proof) };
    } finally { wipePrivate(witness); wipePrivate(proof); }
  }
  process.on('message', async bytes => {
    let request, result;
    try {
      ownerNeed(bytes instanceof Uint8Array && bytes.length > 0 && bytes.length <= OWNER_MAX_REQUEST_BYTES, 'PAEG_OWNER_MESSAGE_LIMIT');
      request = decodeProofMessage(bytes);
      ownerExact(request, ['protocol', 'id', 'operation', 'input']);
      ownerNeed(!busy && !stopping && request.protocol === GENERIC_OWNER_PROTOCOL
        && request.id === nextId && ['init', 'withdraw', 'close'].includes(request.operation), 'PAEG_OWNER_PROTOCOL');
      busy = true; nextId++;
      if (request.operation === 'init') result = await initialize(request.input);
      else if (request.operation === 'withdraw') result = await withdraw(request.input);
      else { ownerNeed(request.input === null, 'PAEG_OWNER_EXACT_FIELDS'); await prover?.close(); result = { closed: true }; }
      await send({ event: 'result', id: request.id, result });
      if (request.operation === 'close') await stop(0);
      busy = false;
    } catch (error) {
      await send({ event: 'failure', id: request?.id ?? 0, code: safeCode(error) }).catch(() => {});
      await stop(1);
    } finally { wipePrivate(request); wipePrivate(result); }
  });
  await send({ event: 'ready', protocol: GENERIC_OWNER_PROTOCOL });
}
if (process.argv[1] === fileURLToPath(import.meta.url)) runGenericOwnerWorker().catch(() => process.exit(1));
