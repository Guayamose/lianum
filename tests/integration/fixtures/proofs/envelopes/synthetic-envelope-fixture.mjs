/** SYNTHETIC INTEGRATION FIXTURE ONLY. Every key, secret and salt is publicly
 * derivable test material. The SHA note roots and authorization root describe
 * fabricated test state, never deposits, accepted U/S, native facts or funds.
 * Uses real signatures/codecs; never creates child proofs or starts a backend. */
import assert from 'node:assert/strict';
import { createHash, createECDH, createPrivateKey, createPublicKey, sign } from 'node:crypto';
import { compileFundedGraph, fundedSigningRequests, attachFundedSignatures, fundedHash, FUNDED_DOMAINS }
  from '../../../../../packages/engine/src/execution/graph/funded-graph.mjs';
import { nativeReceiptKeyCommitment, nativeTransferActionCommitment }
  from '../../../../../packages/engine/src/execution/native/dispatch/native-capsules.mjs';
import { nativeAdmissionChainDomain, nativeAdmissionRuleCommitment, nativeAdmissionRulesTree,
  nativeProviderIdentity, nativeDeliveryRiskCommitment, nativeDispatchStatementFrame, NATIVE_ADMISSION_LOSS_CLAUSE }
  from '../../../../../packages/engine/src/execution/native/dispatch/native-admission.mjs';
import { NATIVE_QUORUM_PROFILE, nativeQuorumRegistryCommitment }
  from '../../../../../packages/engine/src/evidence/native-quorum.mjs';
import { signature, uintBE } from '../../../../../packages/engine/src/notes/private-note-encoding.mjs';
import { walletNoteCommitment } from '../../../../../packages/engine/src/wallet/notes/private-wallet-note-encoding.mjs';
import { PrivateNoteTree } from '../../../../../packages/engine/src/notes/private-note-tree.mjs';
import { buildAuthorizedEnvelope } from '../../../../../packages/custody/src/signing/authorized-envelope.mjs';
import { createCommitmentCodec, exactRecord, ZERO } from '../../../../../packages/backend/src/execution/encoding/commitments.mjs';
import { encodeStatement, RELATIONS } from '../../../../../packages/backend/src/execution/encoding/statements.mjs';
import { nativeCustodyCommitment, encodeNativeFacts, encodeSolanaBindingMessage }
  from '../../../../../packages/backend/src/chains/shared/dispatch/native-receipt-binding.mjs';
import { reservationWitness, recoveryWitness } from '../../../../../packages/backend/src/execution/account/preparation/funding-inputs.mjs';

const ORDER = 0xfffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141n;
const LABEL = 'LIANUM flat synthetic BTC-to-SOL fixture v1: ';
const h = label => createHash('sha256').update(LABEL + label).digest('hex');
const hx = bytes => Buffer.from(bytes).toString('hex');
const bytes = hex => Buffer.from(hex, 'hex');
function freeze(value) {
  if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); }
  return value;
}
const copy = value => freeze(structuredClone(value));

// Publicly reproducible fixture key generation, isolated from production
// witness converters. No scalar, KeyObject or key bundle is returned/logged.
function syntheticKey(label) {
  const scalar = (BigInt('0x' + h('key:' + label)) % (ORDER - 1n)) + 1n;
  const raw = Buffer.from(scalar.toString(16).padStart(64, '0'), 'hex');
  const ecdh = createECDH('secp256k1'); ecdh.setPrivateKey(raw);
  const point = ecdh.getPublicKey(undefined, 'uncompressed'), x = point.subarray(1, 33), y = point.subarray(33);
  const privateKey = createPrivateKey({ format: 'jwk', key: { kty: 'EC', crv: 'secp256k1',
    x: x.toString('base64url'), y: y.toString('base64url'), d: raw.toString('base64url') } });
  raw.fill(0);
  return { privateKey, publicKey: createPublicKey(privateKey), x: Buffer.from(x), y: Buffer.from(y) };
}
const publicKey = key => ({ x: hx(key.x), y: hx(key.y) });
function compressedPublicKey(key) { return Buffer.concat([Buffer.from([2 + (key.y[31] & 1)]), key.x]); }
function bitcoinScript(key) {
  return '0014' + createHash('ripemd160').update(createHash('sha256').update(compressedPublicKey(key)).digest()).digest('hex');
}
function syntheticEd25519(label) {
  const seed = bytes(h('ed25519:' + label));
  const privateKey = createPrivateKey({ key: Buffer.concat([Buffer.from('302e020100300506032b657004220420', 'hex'), seed]),
    type: 'pkcs8', format: 'der' });
  seed.fill(0);
  const publicKey = createPublicKey(privateKey);
  return { privateKey, publicKey, rawPublicKey: Buffer.from(publicKey.export({ format: 'jwk' }).x, 'base64url').toString('hex') };
}
function solanaSigner(key) {
  let retained = key;
  key = null;
  const result = Object.create(null);
  Object.defineProperty(result, 'signTransaction', { value(intent) {
    assert.ok(retained, 'SYNTHETIC_SIGNER_DESTROYED');
    assert.equal(intent.sourcePublicKey, retained.rawPublicKey, 'SYNTHETIC_SOL_SOURCE');
    const message = bytes(encodeSolanaBindingMessage(intent));
    const signature = sign(null, message, retained.privateKey);
    return Buffer.concat([Buffer.from([1]), signature, message]).toString('base64');
  } });
  Object.defineProperty(result, 'destroy', { value() { retained = null; } });
  Object.defineProperty(result, 'toJSON', { value() { throw Error('SYNTHETIC_SIGNER_NOT_SERIALIZABLE'); } });
  return Object.freeze(result);
}
function endpointCommitment(rule, rawHex) {
  const family = rule.family === '1' ? 'BTC' : 'SOL';
  assert.match(rawHex, family === 'BTC' ? /^0014[0-9a-f]{40}$/ : /^[0-9a-f]{64}$/);
  // Exact original nativeFixtureEndpointCommitment H4 bytes, using the golden
  // fundedHash primitive without importing its runtime-owning observer module.
  return fundedHash('LIANUM/PAEG/native-endpoint/2', [Buffer.from('LIANUM_PAEG_NATIVE_4_V2'), Buffer.from(family),
    bytes(rule.genesis), bytes(rule.asset), Buffer.from(family === 'BTC' ? 'BTC_P2WPKH_SCRIPT' : 'SOL_PUBLIC_KEY'), bytes(rawHex)]);
}
function oneSigner(key, method, encode) {
  let retained = key;
  key = null;
  const result = Object.create(null);
  Object.defineProperty(result, method, { value(...args) {
    assert.ok(retained, 'SYNTHETIC_SIGNER_DESTROYED');
    return hx(signature(retained, encode(...args)));
  } });
  Object.defineProperty(result, 'destroy', { value() { retained = null; } });
  Object.defineProperty(result, 'toJSON', { value() { throw Error('SYNTHETIC_SIGNER_NOT_SERIALIZABLE'); } });
  return Object.freeze(result);
}
function makeNote(key, value, label) {
  return { type: 4, rho: h(label + ':rho'), ...publicKey(key), value: String(value), secret: h(label + ':secret') };
}
function notePath(path) {
  return { leaf: path.leaf.slice(2), index: path.index, siblings: path.siblings.map(value => value.slice(2)) };
}
function negative(name, relation, valid, mutate) {
  const inputs = structuredClone(valid); mutate(inputs);
  // Derive words from the MUTATED ABI value, so public-NF negatives reach
  // ACVM rather than fail an unrelated host expected-word comparison.
  const publicInputs = RELATIONS[relation].fields.flatMap(({ name: field }) => {
    const value = inputs[field.replace(/[A-Z]/g, letter => '_' + letter.toLowerCase())];
    return (Array.isArray(value) ? value.flat(Infinity) : [value]).map(String);
  });
  return { name, relation, inputs, publicInputs };
}

/** Returns deterministic public statements for the injected pinned hasher.
 * ECDSA signatures may vary; they verify the same fixed canonical messages.
 * hashFields(bigint[]) -> canonical hex32 is the only runtime dependency. */
export async function buildSyntheticEnvelopeFixture(options) {
  exactRecord(options, ['hashFields']);
  const codec = createCommitmentCodec(options);
  const ownerKey = syntheticKey('owner'), changeKey = syntheticKey('change'), recoveryKey = syntheticKey('recovery');
  const payoutKeys = [syntheticKey('btc-payout'), syntheticKey('sol-payout')];
  const providerKeys = [syntheticKey('btc-provider'), syntheticKey('sol-provider')];
  const attesterKeys = Array.from({ length: 4 }, (_, i) => syntheticKey('attester-' + i));
  const btcSource = syntheticKey('btc-native-source'), btcRecipient = syntheticKey('btc-native-recipient');
  const solSource = syntheticEd25519('sol-native-source'), solRecipient = syntheticEd25519('sol-native-recipient');
  const scope = h('scope'), policy = h('policy'), asset = h('pool-asset'), operationId = h('operation');
  const hubDomain = h('hub');
  const rules = ['1', '2'].map((family, i) => ({ family, genesis: h(i ? 'sol-genesis' : 'btc-genesis'),
    asset: h(i ? 'sol-native-asset' : 'btc-native-asset'), finalityKind: family,
    minimumConfirmations: i ? '0' : '6', maximumEvidenceLifetime: '300', maximumClockSkew: '30' }));
  const rulesTree = nativeAdmissionRulesTree(rules);
  const endpoints = [
    { sourceEndpoint: bitcoinScript(btcSource), destinationEndpoint: bitcoinScript(btcRecipient),
      sourceCompressedPublicKey: hx(compressedPublicKey(btcSource)) },
    { sourceEndpoint: solSource.rawPublicKey, destinationEndpoint: solRecipient.rawPublicKey },
  ].map((value, slot) => ({ ...value, sourceCommitment: endpointCommitment(rules[slot], value.sourceEndpoint),
    destinationCommitment: endpointCommitment(rules[slot], value.destinationEndpoint) }));
  const registry = { profile: NATIVE_QUORUM_PROFILE, hubDomain, registryEpoch: '1',
    rulesRoot: rulesTree.root, keys: attesterKeys.map(publicKey) };
  const registryCommitment = nativeQuorumRegistryCommitment(registry);
  const domain = { scope, policy, asset, hubDomain, registryCommitment,
    verifierSetCommitment: h('synthetic-verifier-set'), ledgerNamespace: hubDomain };
  const payoutValues = ['40000', '60000'];
  const payoutTerms = payoutKeys.map((key, slot) => ({ ...publicKey(key), value: payoutValues[slot],
    secret: h('payout-secret-' + slot), randomness: h('payout-randomness-' + slot) }));
  // The original payout rho precedes graph construction and has no action
  // dependency, so exact risk terms can bind the final payout CM without a
  // circular action/risk/graph commitment or a placeholder quote.
  const payoutCommitments = payoutTerms.map((payout, slot) => {
    const rho = fundedHash(FUNDED_DOMAINS.payoutOrigin,
      [bytes(scope), bytes(policy), bytes(asset), bytes(operationId), uintBE(slot, 1), bytes(payout.randomness)]);
    return walletNoteCommitment(scope, policy, { type: 4, rho, ...publicKey(payoutKeys[slot]),
      value: payout.value, secret: payout.secret }).toString('hex');
  });
  const riskSalts = [h('btc-risk-salt'), h('sol-risk-salt')];
  const nativeAmounts = ['50000', '1000000'];
  const riskTerms = [];
  const nodes = rules.map((rule, slot) => {
    const chainDomain = nativeAdmissionChainDomain(rule);
    const { sourceCommitment, destinationCommitment } = endpoints[slot];
    const receiptSpendSecret = h('receipt-secret-' + slot);
    const risk = { clause: NATIVE_ADMISSION_LOSS_CLAUSE, hubDomain, registryCommitment, chainDomain,
      sourceCommitment, destinationCommitment, amount: nativeAmounts[slot], scope, policy, asset,
      payoutCommitment: payoutCommitments[slot], settleBefore: '2000', salt: riskSalts[slot] };
    riskTerms.push(risk);
    const action = { chainDomain, signerIdentity: nativeProviderIdentity(publicKey(providerKeys[slot])),
      sourceCommitment, destinationCommitment, amount: nativeAmounts[slot], custodyKind: 1,
      custodyCommitment: nativeCustodyCommitment({ family: rule.family, genesis: rule.genesis, asset: rule.asset,
        sourceCommitment, destinationCommitment }), executionFrom: '1100', executionUntil: '1900', settleBefore: '2000',
      receiptKeyCommitment: nativeReceiptKeyCommitment(hubDomain, receiptSpendSecret), receiptRho: h('receipt-rho-' + slot),
      deliveryRiskCommitment: nativeDeliveryRiskCommitment(risk), actionSalt: h('action-salt-' + slot) };
    return { id: slot === 0 ? 'btc-leg' : 'sol-leg', action, receiptSpendSecret };
  });
  const compiled = compileFundedGraph({ scope, policy, asset, operationId, budget: '100000',
    fundingNotBefore: '1000', fundingValidUntil: '1100', settleBefore: '2000',
    reservationNonce: h('reservation-nonce'), reserveSecret: h('reserve-secret'), graphNonce: h('graph-nonce'),
    inputNote: makeNote(ownerKey, 100007, 'input'), changeNote: makeNote(changeKey, 7, 'change'),
    recoveryNote: makeNote(recoveryKey, 100000, 'recovery'),
    nodes: nodes.map((node, slot) => ({ id: node.id, chainDomain: node.action.chainDomain,
      evidencePolicy: nativeAdmissionRuleCommitment(rules[slot]), actionCommitment: nativeTransferActionCommitment(node.action),
      dependsOn: slot === 0 ? [] : ['btc-leg'], payout: payoutTerms[slot] })),
    paddingSalts: Array.from({ length: 4 }, (_, slot) => h('padding-salt-' + slot)) });
  assert.deepEqual(compiled.authorizationStatement.outputs.slice(0, 2), payoutCommitments, 'SYNTHETIC_PAYOUT_JOIN');
  const requests = fundedSigningRequests(compiled);
  const signed = attachFundedSignatures(compiled, { ownerSignature: hx(signature(ownerKey, requests.owner.message)),
    invoiceSignatures: requests.invoices.map(request => hx(signature(payoutKeys[request.slot], request.message))) });
  const owner = await buildAuthorizedEnvelope({ signed, domain, capsuleOptions: { nodes,
    slotSalts: Array.from({ length: 4 }, (_, slot) => ({ targetSalt: h('target-salt-' + slot),
      localCapsuleSalt: h('local-salt-' + slot), dependencyCapsuleSalt: h('dependency-salt-' + slot) })) },
    joinBlinds: Array.from({ length: 4 }, (_, slot) => h('join-blind-' + slot)),
    leafBlinds: Array.from({ length: 16 }, (_, index) => h('leaf-blind-' + index)) }, options);
  const uStatement = owner.publicStatement();
  const scoped = { reservation: owner.reservation().select(), recovery: owner.recovery().select(), assembler: owner.assembler().select(),
    local: Array.from({ length: 4 }, (_, slot) => owner.local(slot).select()),
    dependency: Array.from({ length: 4 }, (_, slot) => owner.dependency(slot).select()) };
  const u = { inputs: owner.ownerAuthorizationInputs(), statement: uStatement,
    publicInputs: [...encodeStatement('authorization', uStatement)] };
  owner.destroy();
  const terms = signed.authorizationStatement;
  // Actual original depth6 SHA tree algorithm. Initial input itself is a
  // synthetic fixture note, not a verified deposit or backed balance.
  const pool = new PrivateNoteTree([terms.inputCommitment]);
  const poolBefore = { root: pool.root.slice(2), count: pool.leafCount, inputPath: notePath(pool.path(0)) };
  const reserveIndex = pool.append(terms.reserveCommitment), changeIndex = pool.append(terms.changeCommitment);
  const poolAfter = { root: pool.root.slice(2), count: pool.leafCount, reservePath: notePath(pool.path(reserveIndex)),
    changePath: notePath(pool.path(changeIndex)) };
  const authorizationLeaf = await codec.authorizationLeaf(uStatement.domainCommitment, uStatement.envelope);
  const authorizationTree = await codec.buildTree(uStatement.domainCommitment, 0, [authorizationLeaf]);
  const authorization = { root: authorizationTree.root, count: authorizationTree.count, path: authorizationTree.opening(0) };
  const s = await reservationWitness(scoped.reservation,
    { inputRoot: poolBefore.root, inputPath: poolBefore.inputPath }, options);
  const f = await recoveryWitness(scoped.recovery, { authorizationRoot: authorization.root, authorizationPath: authorization.path,
    poolRoot: poolAfter.root, reservePath: poolAfter.reservePath }, options);
  const jobs = { authorization: u, reservation: s, recovery: f };
  const negativeCases = [
    negative('u-changed-owner-scope', 'authorization', u.inputs, value => { value.owner_statement.scope[0] ^= 1; }),
    negative('s-changed-operation-id', 'reservation', s.inputs, value => { value.funding.operation_id[0] ^= 1; }),
    negative('s-changed-input-nullifier', 'reservation', s.inputs, value => { value.input_nullifier[0] = (value.input_nullifier[0] + 1) >>> 0; }),
    negative('s-changed-input-path', 'reservation', s.inputs, value => { value.input_siblings[0][0] ^= 1; }),
    negative('f-changed-reserve-nullifier', 'recovery', f.inputs, value => { value.reserve_nullifier[0] = (value.reserve_nullifier[0] + 1) >>> 0; }),
    negative('f-changed-authorization-path', 'recovery', f.inputs,
      value => { value.authorization_siblings[0] = Array(32).fill(0); }),
  ];
  // Each capability factory closes over exactly one test key. None closes
  // over the owner graph or the other signers' key objects.
  const signers = {
    providers: providerKeys.map(key => oneSigner(key, 'signDispatch', nativeDispatchStatementFrame)),
    attesters: attesterKeys.map(key => oneSigner(key, 'signFacts', encodeNativeFacts)),
    native: { solana: solanaSigner(solSource) },
  };
  const publicValues = { domain, statements: { authorization: u.statement, reservation: s.statement, recovery: f.statement },
    poolBefore, poolAfter, authorization,
    native: { registry, rules, rulePaths: rulesTree.paths, providers: providerKeys.map(publicKey), riskSalts, riskTerms, endpoints,
      chains: ['BTC', 'SOL'], readiness: [{ readyFrom: '1100', readyUntil: '1600' }, { readyFrom: '1200', readyUntil: '1400' }],
      observedAt: ['1150', '1250'], completion: { validFrom: '1300', validUntil: '1350' } } };
  const stop = [...signers.providers, ...signers.attesters, signers.native.solana];
  return Object.freeze({ synthetic: true, public: copy(publicValues), jobs: copy(jobs), scoped: copy(scoped),
    signers: Object.freeze({ providers: Object.freeze(signers.providers), attesters: Object.freeze(signers.attesters),
      native: Object.freeze(signers.native) }),
    negativeCases: copy(negativeCases), destroy() { stop.forEach(signer => signer.destroy()); } });
}
