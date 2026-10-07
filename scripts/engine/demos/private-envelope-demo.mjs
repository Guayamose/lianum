/** Local in-memory cryptographic demo. No RPC, network transport or wallet SDK. */
import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { performance } from 'node:perf_hooks';
import assert from 'node:assert/strict';
import { canonical } from '../../../packages/engine/src/crypto/privacy.mjs';
import {
  newExecutorIdentity, newLegBinding, sealLeg, openLeg, ReplayGuard,
  inspectPublicEnvelope, COMPACT_ENVELOPE_BYTES, PLAINTEXT_SLOT_BYTES,
} from '../../../packages/engine/src/crypto/private-envelope.mjs';

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DEFAULT_OUTPUT = resolve(projectRoot, 'evidence', 'm4-private-envelope.json');
const FORBIDDEN_PUBLIC_FIELDS = ['graphHash', 'graphId', 'ownerPublicKey', 'globalCommitment', 'siblingLegs'];

function safeMessage(message) {
  // This evidence is deliberately less sensitive than the real receiver's view.
  const { returnCapability, ...view } = message;
  return { ...view, returnCapability: '[REDACTED: executor receives the actual secret]' };
}

export function buildPrivateEnvelopeEvidence() {
  const generatedAt = new Date().toISOString();
  const syntheticNow = 1_800_000_000_000;
  const executors = [newExecutorIdentity(), newExecutorIdentity()];
  const guards = executors.map(() => new ReplayGuard());
  const plans = [
    { label: 'owner-local-ethereum-leg', executor: 0, chain: 'ethereum', asset: 'ethereum:local:wei', amount: '200', recipient: 'synthetic:output:eth' },
    { label: 'owner-local-solana-leg', executor: 1, chain: 'solana', asset: 'solana:local:lamport', amount: '300', recipient: 'synthetic:output:sol' },
    { label: 'owner-local-bitcoin-leg', executor: 0, chain: 'bitcoin', asset: 'bitcoin:regtest:satoshi', amount: '400', recipient: 'synthetic:output:btc' },
    { label: 'owner-local-correlation-a', executor: 0, chain: 'ethereum', asset: 'ethereum:local:wei', amount: '777', recipient: 'synthetic:output:candidate-a' },
    { label: 'owner-local-correlation-b', executor: 1, chain: 'ethereum', asset: 'ethereum:local:wei', amount: '777', recipient: 'synthetic:output:candidate-b' },
  ];
  const captures = [];
  const privateMaterial = [];
  const start = performance.now();
  for (const plan of plans) {
    const binding = newLegBinding();
    privateMaterial.push(binding.authPrivateKey, binding.returnCapability);
    const executor = executors[plan.executor];
    const input = { chain: plan.chain, asset: plan.asset, amount: plan.amount, maxFee: '7',
      recipient: plan.recipient, expiresAt: syntheticNow + 60000 };
    const compact = sealLeg(input, binding, executor.publicKey);
    const publicView = inspectPublicEnvelope(compact);
    const callerLog = {
      callOrdinal: captures.length + 1,
      elapsedMsAtLocalDelivery: Math.round(performance.now() - start),
      recipientKid: publicView.header.kid,
      wireBytes: Buffer.byteLength(compact),
      packetDigest: createHash('sha256').update(compact, 'ascii').digest('hex'),
      transport: 'in-memory function call',
    };
    // The expected key/context are a separately supplied trusted local binding.
    // They are not extracted from encrypted content or a public sender identity.
    const actualOpened = openLeg(compact, {
      executorPrivateKey: executor.privateKey, expectedContext: binding.context,
      expectedAuthPublicKey: binding.authPublicKey, replayGuard: guards[plan.executor], now: syntheticNow,
    });
    assert.equal(actualOpened.returnCapability, binding.returnCapability);
    for (const field of FORBIDDEN_PUBLIC_FIELDS) assert.equal(Object.hasOwn(actualOpened, field), false);
    captures.push({ plan, callerLog, publicView, actualOpened, authPublicKey: binding.authPublicKey });
  }
  const individualExecutors = executors.map((executor, index) => ({
    role: `executor-${index + 1}`,
    recipientKid: executor.kid,
    receivedCount: captures.filter((item) => item.plan.executor === index).length,
    decryptedViews: captures.filter((item) => item.plan.executor === index).map((item) => ({
      callerLog: item.callerLog,
      trustedLocalBinding: { context: item.actualOpened.context, expectedAuthPublicKey: item.authPublicKey },
      message: safeMessage(item.actualOpened),
    })),
  }));
  const a = captures[3]; const b = captures[4];
  const equalityCandidate = {
    packetDigests: [a.callerLog.packetDigest, b.callerLog.packetDigest],
    sameAsset: a.actualOpened.asset === b.actualOpened.asset,
    sameAmount: a.actualOpened.amount === b.actualOpened.amount,
    sameDeadline: a.actualOpened.expiresAt === b.actualOpened.expiresAt,
    distinctContexts: a.actualOpened.context !== b.actualOpened.context,
    distinctAuthenticationKeys: a.authPublicKey !== b.authPublicKey,
    distinctRoutingRecipients: a.actualOpened.recipientKid !== b.actualOpened.recipientKid,
    equalWireLengths: a.callerLog.wireBytes === b.callerLog.wireBytes,
    actualLocalDeliveryGapMs: b.callerLog.elapsedMsAtLocalDelivery - a.callerLog.elapsedMsAtLocalDelivery,
    conclusion: 'A shared operator can form a correlation candidate from equal asset/amount/deadline and adjacent local delivery, despite independent contexts and equal-length envelopes. This is not proof that arbitrary observations share an owner.',
  };
  const evidence = {
    milestone: 'M4', generatedAt, runtime: process.version,
    mode: 'LOCAL_CRYPTO_ONLY_SYNTHETIC_INSTRUCTIONS',
    execution: { transport: 'in-memory calls only', chains: 'chain labels only; no runtimes, RPCs or transactions invoked',
      walletSdkImported: false, zkVerification: 'NOT_IMPLEMENTED', nativeSigning: 'NOT_IMPLEMENTED',
      funds: 'NONE', trustedBootstrap: 'local expected context and per-leg Ed25519 public key supplied separately' },
    standards: {
      compactJwe: 'https://www.rfc-editor.org/rfc/rfc7516.html#section-3.1',
      algorithms: 'https://www.rfc-editor.org/rfc/rfc7518.html#section-4.3',
      subset: 'RSA-OAEP-256 + A256GCM; RSA2048 exponent65537; IV12/tag16 bytes; protected header is GCM AAD',
    },
    slotBytes: PLAINTEXT_SLOT_BYTES, wireBytesPerEnvelope: COMPACT_ENVELOPE_BYTES,
    provenance: 'Every message below is the actual return value of openLeg after sealLeg; caller timings were measured around real local function calls. Public packet digests identify individual ciphertexts, not graphs. Private keys and actual return capabilities are omitted.',
    roleViews: {
      owner: {
        explanation: 'Only this trusted local issuer has the complete plan-to-packet mapping. These labels were never embedded in the envelopes.',
        planMapping: captures.map((item) => ({ label: item.plan.label, packetDigest: item.callerLog.packetDigest,
          context: item.actualOpened.context, recipientKid: item.actualOpened.recipientKid })),
      },
      publicEnvelopeObserver: {
        explanation: 'A hypothetical transport observer could see the headers and delivery metadata. No actual transport or endpoint privacy is implemented.',
        observations: captures.map((item) => ({ callerLog: item.callerLog, visibleHeader: item.publicView.header })),
      },
      individualExecutors,
      sharedOperator: {
        explanation: 'Counterfactual collusion of both locally instantiated executor roles exposes the union of their actual decrypted views and caller logs.',
        union: individualExecutors.flatMap((executor) => executor.decryptedViews),
        equalityCandidate,
      },
    },
    checks: {
      sealedAndOpenedEnvelopes: captures.length,
      observedWireLengths: [...new Set(captures.map((item) => item.callerLog.wireBytes))],
      uniqueLegContexts: new Set(captures.map((item) => item.actualOpened.context)).size,
      uniqueAuthPublicKeys: new Set(captures.map((item) => item.authPublicKey)).size,
      forbiddenGlobalFieldsAbsent: captures.every((item) => FORBIDDEN_PUBLIC_FIELDS.every((field) => !Object.hasOwn(item.actualOpened, field))),
      capabilitiesMatchedOnOpening: true,
      staticRecipientKidGroupsVisible: executors.map((executor) => ({ kid: executor.kid,
        count: captures.filter((item) => item.publicView.header.kid === executor.kid).length })),
      consumedBindingsPerExecutor: guards.map((guard) => guard.size),
    },
    limitations: [
      'No graph membership, graph authorization proof, ZK verification, payment guarantee or on-chain effect is established.',
      'Trusted local binding is assumed; remote origin bootstrap and durable one-use execution transaction remain unimplemented.',
      'ReplayGuard is bounded volatile memory: a restart loses consumption records; capacity refuses new records without eviction.',
      'Static recipient RSA keys leak routing identity and provide no forward secrecy after key compromise.',
      'Padding conceals only instruction-length variation within the fixed slot, not metadata or values after executor decryption.',
      'The shared-operator counterexample is a candidate linkage, not a measured anonymity level or proof of common ownership.',
      'No independent JOSE library interoperability check, cryptographic audit, production safety or dependable JS zeroization claim.',
    ],
  };
  const serialized = canonical(evidence);
  for (const executor of executors) privateMaterial.push(executor.privateKey);
  assert.equal(serialized.includes('PRIVATE KEY'), false);
  for (const secret of privateMaterial) assert.equal(serialized.includes(secret), false);
  assert.equal(equalityCandidate.sameAsset && equalityCandidate.sameAmount && equalityCandidate.distinctContexts, true);
  return evidence;
}

export async function writePrivateEnvelopeEvidence(outputPath = DEFAULT_OUTPUT) {
  const resolved = resolve(outputPath);
  // This demo writes only its explicitly owned evidence artifact.
  if (resolved !== DEFAULT_OUTPUT) throw new Error('Evidence path must be the project M4 private-envelope artifact');
  const evidence = buildPrivateEnvelopeEvidence();
  await mkdir(dirname(resolved), { recursive: true });
  await writeFile(resolved, JSON.stringify(evidence, null, 2) + '\n', { encoding: 'utf8', mode: 0o600 });
  return { outputPath: resolved, envelopes: evidence.checks.sealedAndOpenedEnvelopes,
    wireBytes: evidence.wireBytesPerEnvelope, checks: evidence.checks };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const result = await writePrivateEnvelopeEvidence();
  process.stdout.write(JSON.stringify({ outputPath: result.outputPath, envelopes: result.envelopes, wireBytes: result.wireBytes }) + '\n');
}
