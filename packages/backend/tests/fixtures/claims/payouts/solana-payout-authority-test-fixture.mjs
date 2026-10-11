/** Explicit synthetic capability/backend host tests. Real Vault/CAS and
 * controller are exercised; no chain, compiler, proof or genuine brand is made. */
import test, { mock } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, rename, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash, generateKeyPairSync, sign } from 'node:crypto';
import { CLAIM_CONFIG_SCHEMA, claimDomainCommitment, claimTicketId, claimTicketSecret,
  claimDestinationCommitment, nativeClaimEndpointCommitment, encodeClaimIngressInputs, encodeClaimDischargeInputs } from '@lianum/engine/claims/framing';
import { CLAIM_BACKING_FIELDS, claimFrame, claimHash, claimRouteCommitment } from '@lianum/engine/claims/permits';
import { encodeDepositIntentInputs } from '@lianum/engine/execution/inputs/deposit-intent';
import { balanceCommitment } from '@lianum/engine/wallet/notes/private-wallet-note-encoding';
import * as originalAdmission from '@lianum/engine/execution/native/dispatch/native-admission';
import * as originalTooling from '@lianum/proofs/tooling/tooling';
import { publicKeccak256 } from '@lianum/engine/cohorts/private-cohort-public-native';
import { claimABIType } from '@lianum/engine/claims/abi';
import { encodeSolanaBindingMessage, receiptKeyCommitment } from '@lianum/engine/native/native-receipt-binding';
import { encodeSolanaNonceBindingMessage, validateSolanaNonceBindingTransaction } from '../../../../src/chains/solana/runtime/owned-solana-nonce-binding.mjs';
import { createClaimReservationBinding } from '../../../../src/claims/authorization/reservation-facts-gate.mjs';
import { decryptJson } from '@lianum/engine/crypto/privacy';
import { ownerDigest, FLAT_OWNER_CLAIM_HANDOFF_PROFILE, FLAT_OWNER_CLAIM_HANDOFF_TRUST } from '@lianum/custody/owner';
const url = p => new URL(p, import.meta.url).href, hash = v => createHash('sha256').update(v).digest('hex');
const systems = new WeakMap(), observers = new WeakMap(), hands = new WeakMap(), roles = new WeakMap();
const poisonedOperators = new WeakSet(), poisonedQuorums = new WeakSet();
mock.module(url('../ops/deploy-native-claims.mjs'), { exports: { assertOwnedNativeClaimSystem(runtime, claims) { assert.equal(systems.get(claims), runtime, 'TEST_OWNED_CLAIMS'); } } });
mock.module(url('../chain-adapters/owned-evm-v2-runtime.mjs'), { exports: { LOCAL_EVM_PROFILE: { maxGas: 30000000 },
  async assertOwnedLocalEvmV2(runtime) { assert.equal(runtime.testOwned, true); },
  async refreshNativeValueReceiverClock(runtime) { assert.equal(runtime.testOwned, true); },
  nativeValueReceiverInclusionSecondV1(runtime) { assert.equal(runtime.testOwned, true); return null; },
  assertSignedEvmTransaction(wire, expected) { assert.ok(wire.startsWith('0x')); assert.ok(expected.data); } } });
mock.module(url('./owned-state.mjs'), { exports: { assertOwnedClaimObserver(o) { assert.ok(observers.has(o)); }, ownedClaimObserverBindings(o) { return observers.get(o); } } });
mock.module(url('./operators.mjs'), { exports: {
  assertOwnedClaimOperator(op, observer) { assert.equal(op.observer, observer); assert.ok(!poisonedOperators.has(op), 'COMBINED_OPERATOR_CLOSED_OR_POISONED'); },
  assertOwnedClaimOperatorQuorum(q, observer) { assert.equal(q.observer, observer); assert.ok(!poisonedQuorums.has(q), 'COMBINED_OPERATOR_CLOSED_OR_POISONED'); },
} });
mock.module(url('../../../proof-workers/role-client.mjs'), { exports: { assertRoleProofClient(client, role) { assert.equal(roles.get(client), role); } } });
mock.module(url('../../../mobile-core/flat-owner-process.mjs'), { exports: { assertOwnedNativeClaimIngressHandoff(h, expected) {
  assert.ok(hands.has(h), 'TEST_REAL_HANDOFF_ONLY'); for (const [k, v] of Object.entries(expected)) assert.equal(hands.get(h)[k], v); } } });
mock.module(url('../paeg/flat-system-state.mjs'), { exports: { async createFlatSystemStateReader({ runtime }) { return {
  async read() { return { head: structuredClone(runtime.testState.head),
    state: { revokedDigest: zero, revokedCount: '0', revocationSequence: '0' }, revokedEntries: [] }; },
}; } } });
// Explicit host-only proof scaffolding for lifecycle ordering tests. Neither a
// compiler, hash backend nor prover can run through these replacements.
mock.module(url('../../../proof-workers/tooling.mjs'), { exports: { ...originalTooling,
  resourceModuleURL: 'data:text/javascript,export function verifyToolchain() {}',
  async loadPinned(name) { assert.equal(name, '@aztec/bb.js'); return { BackendType: { Wasm: 'TEST_ONLY' }, Barretenberg: {
    async new() { return { async poseidon2Hash() { assert.fail('TEST_NO_REAL_HASH_BACKEND'); }, async destroy() {} }; },
  } }; },
} });
mock.module(url('./inputs.mjs'), { exports: {
  buildClaimIngressInputs: raw => { const statement = { claimDomain: claimDomainCommitment(raw.config), outputQ: hash('synthetic Q'),
    admissionN: hash('synthetic N'), refundDestination: hash('synthetic refund'), admissionRevocationState: '01'.repeat(32),
    ingressReceiptLeaf: '02'.repeat(32), amountQ: raw.noteOpening.value, evidenceFrom: '1', evidenceUntil: '1000000' };
    return { inputs: { syntheticLifecycleOnly: true }, expectedPublicInputs: [...encodeClaimIngressInputs(statement)], statement }; },
  buildClaimDischargeInputs: raw => { const statement = { claimDomain: claimDomainCommitment(raw.config), ticketId: raw.ticket.id,
    ticketCommitment: hash('synthetic ticket'), dischargeN: hash('synthetic discharge'), admissionRevocationState: '01'.repeat(32),
    evidenceFrom: '1', evidenceUntil: '1000000' };
    return { inputs: { syntheticLifecycleOnly: true }, expectedPublicInputs: [...encodeClaimDischargeInputs(statement)], statement }; },
} });
mock.module(url('../../../../../omnichain-product/src/paeg/native-admission.mjs'), { exports: { ...originalAdmission,
  nativeAdmissionRulesTree: () => ({ paths: [{ index: '0', siblings: Array(3).fill('0'.repeat(64)) }] }), nativeAdmissionChainDomain: rule => claimHash(claimFrame('LIANUM/evidence-chain/1', [Buffer.from('SOL'),Buffer.from(rule.genesis,'hex'),Buffer.from(rule.asset,'hex')])) } });
const { createNativeClaimController, createNativeClaimControllerKeeper, createDurableNativeClaimControllerKeeper,
  restartNativeClaimController, openNativeClaimControllerDispatch, openNativeClaimSolanaPayoutAuthority } = await import('../../../../src/claims/controller/controller.mjs');
const { ownedClaimControllerJournal } = await import('../../../../src/claims/controller/controller-journal.mjs');
const { createNativeClaimSession, nativeClaimSessionController } = await import('../../../../src/api/claims/native-claim-session.mjs');
const { startNativeClaimHttp } = await import('../../../../src/api/claims/native-claim-http.mjs');
const { assertOwnedClaimEvmDispatchRequest, createClaimEvmDispatchRequest } = await import('../../../../src/claims/protocol/evm-dispatch-gate.mjs');
const zero = '0'.repeat(64), p = v => '0x' + v;
async function fixture({ durable = false } = {}) {
  const directory = await mkdtemp(join(tmpdir(), 'claim-controller-host-')), path = join(directory, 'controller.vault');
  const config = Object.fromEntries(CLAIM_CONFIG_SCHEMA.map(([key, type]) => [key, type === 'address' ? hash(key).slice(0, 40)
    : type === 'u256' ? '31337' : type === 'u64' ? '5000' : type === 'u8' ? '2' : type === 'field32' ? '01' + hash(key).slice(2) : hash(key)]));
  config.ledgerNamespace = config.hubDomain; const domain = claimDomainCommitment(config);
  const opening = { rho: hash('rho'), x: hash('x'), y: hash('y'), value: '1000000', noteSecret: hash('PRIVATE NOTE SECRET') };
  const statement = { scope: config.scope, policy: config.policy, validFrom: '1', validUntil: '1000', amount: opening.value,
    output: balanceCommitment(config.scope, config.policy, { type: 4, ...opening, secret: opening.noteSecret }).toString('hex') };
  const proof = 'abcd', evidence = { relation: 'deposit_intent', role: 'owner',
    runId: '11111111-1111-4111-8111-111111111111', jobId: '22222222-2222-4222-8222-222222222222',
    proofSHA256: hash(Buffer.from(proof, 'hex')), keySHA256: hash('synthetic key'), manifestSHA256: hash('synthetic manifest'),
    metricUnits: 'milliseconds', metrics: Object.fromEntries(['initializationMilliseconds', 'jobPreparationMilliseconds',
      'witnessMilliseconds', 'proofMilliseconds', 'verificationMilliseconds', 'totalMilliseconds', 'otherMilliseconds'].map(key => [key, '1.25'])) };
  const packet = { version: 1, profile: FLAT_OWNER_CLAIM_HANDOFF_PROFILE, trust: FLAT_OWNER_CLAIM_HANDOFF_TRUST,
    ownerIdentitySHA256: hash('owner identity'), claimDomain: domain, ingressProverIdentity: hash('prover'), revision: 0,
    opening, statement, proofResult: { proof, publicInputs: [...encodeDepositIntentInputs(statement)], evidence } };
  packet.intentIdentitySHA256 = ownerDigest({ profile: packet.profile, identitySHA256: packet.ownerIdentitySHA256, claimDomain: domain,
    scope: statement.scope, policy: statement.policy, amount: statement.amount, output: statement.output });
  packet.handoffIdentitySHA256 = ownerDigest(packet);
  const handoff = { select: () => structuredClone(packet) }; hands.set(handoff, packet);
  const proofSchema = { name: 'ownerProof', type: 'tuple', components: [{ name: 'proof', type: 'bytes' }, { name: 'inputs', type: 'bytes32[]' }] };
  const sig = name => ({ name, type: 'tuple[3]', components: [{name:'signerIndex',type:'uint8'},{name:'v',type:'uint8'},{name:'r',type:'bytes32'},{name:'s',type:'bytes32'}] });
  const authSchema = { name: 'authorization', type: 'tuple', components: [{ name: 'permit', type: 'tuple', components: CLAIM_BACKING_FIELDS.map(([name, t]) => ({ name, type: t === 'b32' ? 'bytes32' : 'uint' + t.slice(1) })) }, sig('signatures'), {name:'healthFrom',type:'uint64'},{name:'healthUntil',type:'uint64'},sig('healthSignatures')] };
  const signature = 'preposition(' + [proofSchema, authSchema].map(claimABIType).join(',') + ')';
  const artifact = { abi: [{ type: 'function', name: 'preposition', inputs: [proofSchema, authSchema] }], evm: { methodIdentifiers: { [signature]: publicKeccak256(Buffer.from(signature)).subarray(0, 4).toString('hex') } } };
  const state = { head: { number: '1', hash: hash('evmhead'), timestamp: '10' }, hubStateSequence: '0',
    gateways: [{ claimDomain: domain, claimSequence: '0', nextTicketNonce: '0', intents: [], tickets: [] }] };
  const control = { dispatches: 0, loseReply: false, included: false, reconciledTransactions: [] };
  const runtime = { ingressSendState: Object.freeze({epoch:'0',busy:false,uncertain:false}), testOwned: true, testState: state, accounts: ['0x' + '11'.repeat(20)], transactions: [], mutationStatus: { uncertain: false },
    metadata: { evmGenesis: p(hash('genesis')), chainId: '31337' },
    async dispatch(request) {
      const scope = assertOwnedClaimEvmDispatchRequest(request, runtime); control.dispatches++;
      const prepared = { genesis: p(hash('genesis')), head: { number: '0x' + BigInt(state.head.number).toString(16),
        hash: p(state.head.hash), timestamp: '0x' + BigInt(state.head.timestamp).toString(16) },
        transaction: { ...scope.transaction, chainId: '31337', nonce: String(control.dispatches - 1), gasPrice: '1000000000',
          gas: BigInt(scope.transaction.gas).toString(), value: '0' }, unsignedWire: p(hash('unsigned' + control.dispatches)), funds: { balanceWei: '1000000000000' } };
      await control.preparedHook?.(prepared);
      control.activePrepared = prepared; control.lastGuard = scope.beforeSign;
      if (control.parallelGuard) {
        const results = await Promise.allSettled([scope.beforeSign(prepared), scope.beforeSign(prepared)]);
        assert.equal(results[0].status, 'fulfilled'); assert.equal(results[1].status, 'rejected');
        results[1].reason.transactionRecord = { phase: 'pre-sign-rejected' }; throw results[1].reason;
      }
      if (control.replayGuard) {
        await scope.beforeSign(prepared);
        try { await scope.beforeSign(prepared); } catch (error) {
          error.transactionRecord = { phase: 'pre-sign-rejected' }; throw error;
        }
        assert.fail('TEST_DUPLICATE_GUARD_MUST_REJECT');
      }
      await scope.beforeSign(prepared); const signed = { nativeWire: '0x1122', nativeId: p(hash('tx' + control.dispatches)), transactionSHA256: hash('wire') };
      const original = { request: scope.transaction, prepared, signed, transactionHash: signed.nativeId, phase: 'signed-not-broadcast' };
      runtime.transactions.push(original);
      await scope.onSigned(signed);
      if (control.loseReply) { original.phase = 'uncertain-no-resend'; original.uncertaintyCause = 'original-signed-broadcast';
        runtime.mutationStatus.uncertain = true; throw Error('TEST_LOST_EVM_REPLY'); }
      original.phase = 'mined'; control.included = true;
      if (control.nativeBinding) control.reservationIncluded = true;
      await control.includedHook?.(original);
      return { nativeId: signed.nativeId, transactionSHA256: signed.transactionSHA256 };
    },
    async signedTransaction(id) { return structuredClone(runtime.transactions.find(v => v.transactionHash === id).signed); },
    async receipt(id) { return control.included ? { transactionHash: id, status: '0x1', blockHash: p(hash('block')) } : null; },
    async transaction(id) { const row = runtime.transactions.find(v => v.transactionHash === id); return control.included ? { ...row.request, from: row.request.from, to: row.request.to, input: row.request.data } : null; },
    async checkReceipt() {}, async assertCanonical() {},
    async reconcileSignedTransaction(id) {
      control.reconciledTransactions.push(id);
      const original = runtime.transactions.find(row => row.transactionHash === id);
      assert.equal(original.phase, 'uncertain-no-resend'); assert.equal(original.uncertaintyCause, 'original-signed-broadcast');
      assert.ok(await runtime.receipt(id)); original.phase = 'reconciled-mined'; delete original.uncertaintyCause;
      runtime.mutationStatus.uncertain = runtime.transactions.some(row => row.phase === 'uncertain-no-resend');
    },
  };
  const claims = { configs: [config], gateways: [{ address: p(config.gateway), artifact }], policies: [{ rule: {family:config.nativeFamily,genesis:config.nativeGenesis,asset:config.nativeAsset} }],
    nativeRuntimes: [{ roles: { depositor: { endpoint: hash('depositor') } } }], verifierPins: [], flatSystem: { pools: [{}], registry: [] } };
  systems.set(claims, runtime);
  const observer = { async read() {
    if (control.included && control.intentId && !state.gateways[0].intents.length) state.gateways[0].intents.push({ id: control.intentId, state: '1',
      output: statement.output, amount: statement.amount, validFrom: statement.validFrom, validUntil: statement.validUntil,
      revision: '1', proofHash: evidence.proofSHA256, nullifier: zero, refundDestination: zero });
    if (control.reservationIncluded) Object.assign(state.gateways[0].intents[0], {
      nullifier: control.nativeBinding.admissionN, refundDestination: control.refundDestination });
    return structuredClone(state); }, async assertCurrent() {},
    async readReservation(query) { if (!control.reservationIncluded) return null;
      const b=control.nativeBinding; assert.equal(query.admissionN,b.admissionN);
      return {gateway:b.gateway,operationId:b.operationId,revision:b.revision,wireBindingCommitment:b.wireBindingCommitment,ingress:true,consumed:false}; } };
  observers.set(observer, { runtime, system: claims });
  const operators = Array.from({length:4}, (_, signerIndex) => ({signerIndex,observer}));
  const completedAuthorizations = new WeakSet();
  const quorum = { observer, async backing(request) {
    control.backingCalls = (control.backingCalls ?? 0) + 1;
    if (control.nativeBinding) control.refundDestination = request.terms.destinationCommitment;
    const sig = i => ({signerIndex:i,v:27,r:hash('r'),s:hash('s')});
    const result = { head: structuredClone(state.head), authorization: { permit: {
      ...Object.fromEntries(CLAIM_BACKING_FIELDS.map(([n,t])=>[n,t==='b32'?hash(n):'1'])),
      validFrom: state.head.timestamp, validUntil: String(BigInt(state.head.timestamp) + 30n) },
      signatures:[0,1,2].map(sig),healthFrom:state.head.timestamp,healthUntil:String(BigInt(state.head.timestamp) + 30n),healthSignatures:[0,1,2].map(sig) } };
    completedAuthorizations.add(result); control.lastAuthorization = result; return result; },
    async assertOriginalAuthorizationCurrent(result) {
      assert.ok(completedAuthorizations.has(result), 'TEST_ORIGINAL_QUORUM_RESULT');
      control.finalAudits = (control.finalAudits ?? 0) + 1;
      await control.finalAuditHook?.(result);
    },
  };
  control.registerAuthorization = result => { completedAuthorizations.add(result); return result; };
  const proofClients = Object.fromEntries(['claim_ingress','claim_discharge'].map(role => { const client = {}; roles.set(client, role); return [role,client]; }));
  const keeper = await (durable ? createDurableNativeClaimControllerKeeper : createNativeClaimControllerKeeper)(
    { runtime, claims, path, password: 'TEST ONLY PASSWORD '.repeat(4) });
  const options = { runtime, claims, observer, operators, quorum, proofClients, keeper, ingressProverIdentity: packet.ingressProverIdentity };
  let controller = await createNativeClaimController(options);
  return { options, control, packet, handoff, path, runtime, keeper, config, state, artifact, authSchema, get controller(){return controller;},
    async reopen(){controller.close();controller=await createNativeClaimController(options);},
    async reopenKeeper(){controller.close();await keeper.restart();controller=await createNativeClaimController(options);},
    async restart(){controller=await restartNativeClaimController(controller);return controller;},
    async close(){try{controller.close();}catch(error){assert.match(error.message,/CLAIM_CONTROLLER_CLOSED/);}
      await keeper.close(); /* Retain host evidence; no fixture deletion in this candidate. */} };
}
async function installRetainedNoncePayout(f, { status = 'SIGNED_UNRESERVED', kind = '1' } = {}) {
  const domain = f.packet.claimDomain, source = generateKeyPairSync('ed25519');
  const sourcePublicKey = Buffer.from(source.publicKey.export({ format: 'jwk' }).x, 'base64url').toString('hex');
  const id = claimTicketId({ claimDomain: domain, kind, nonce: '0' });
  const secret = claimTicketSecret({ claimDomain: domain, ticketId: id });
  const key = receiptKeyCommitment({ ledgerNamespace: f.config.ledgerNamespace, secret });
  const intent = { sourcePublicKey, recipientPublicKey: hash('nonce payout recipient'), nonceAccountPublicKey: hash('nonce payout account'),
    durableNonce: hash('original nonce payout value'), lamports: '1000000', wireKeyCommitment: key };
  const unsignedWire = encodeSolanaNonceBindingMessage(intent), message = Buffer.from(unsignedWire, 'hex');
  const signature = sign(null, message, source.privateKey), nativeId = signature.toString('hex');
  const nativeWire = Buffer.concat([Buffer.from([1]), signature, message]).toString('base64');
  assert.equal(validateSolanaNonceBindingTransaction(nativeWire, intent).signatureHex, nativeId);
  const prepared = { genesis: f.config.nativeGenesis, intent, unsignedWire, funds: { feeLamports: '5000' } };
  const wireSalt = hash('retained payout wire salt'), salt = hash('retained payout destination salt');
  const route = { endpoint: intent.recipientPublicKey, salt, quotedFee: '5000', selectedInputValue: '0', changeFloor: '0', destinationFunded: true };
  const destinationCommitment = claimDestinationCommitment({ claimDomain: domain,
    nativeChainDomain: claimHash(claimFrame('LIANUM/evidence-chain/1', [Buffer.from('SOL'), Buffer.from(f.config.nativeGenesis, 'hex'), Buffer.from(f.config.nativeAsset, 'hex')])),
    endpoint: nativeClaimEndpointCommitment({ family: '2', genesis: f.config.nativeGenesis, asset: f.config.nativeAsset, endpoint: route.endpoint }),
    amount: intent.lamports, maxFee: '5000', salt });
  const ticket = { kind, id, claimDomain: domain, amount: intent.lamports, maxFee: '5000', destinationCommitment,
    referenceIngressN: zero, referenceQ: zero };
  const binding = createClaimReservationBinding({ claimDomain: domain, gateway: f.config.gateway, ledgerNamespace: f.config.ledgerNamespace,
    genesis: f.config.nativeGenesis, asset: f.config.nativeAsset, operationId: id, revision: '1', ingress: false,
    receiptSecret: secret, wireSalt, nativeWire, intent, request: { family: '2', recipientIndex: '0', nativeId, wireKeyCommitment: key } });
  const original = { route: kind === '2' ? 'refund' : 'redeem', recipientIndex: 0, nativeId, nativeWire, transactionSHA256: binding.transactionSHA256, intent: structuredClone(intent),
    phase: 'SIGNED_NOT_BROADCAST', broadcastAttempts: 0 };
  const row = { id, claimDomain: domain, ticket, secret, key, salt, route, proofs: [], status: 'UNKNOWN',
    native: { status, wireSalt, prepared, nativeId, signed: { nativeWire }, binding } };
  const journal = ownedClaimControllerJournal(f.keeper, f.runtime, f.options.claims);
  await journal.update(data => { data.tickets.push(row); return data; });
  Object.assign(f.state.gateways[0], { tickets: [{ ticket: structuredClone(ticket), state: '2', payoutRouteCommitment: claimRouteCommitment(route) }],
    activePayout: id, nextTicketNonce: '1' });
  const control = { observationStatus: 'unknown', afterSendStatus: 'pending', resumeCalls: 0, sends: 0, signingCalls: 0,
    authorizationCalls: 0, factsCalls: 0, preparedChecks: 0, unrevokedChecks: 0, observations: [], events: [],
    currentNonce: intent.durableNonce, revoked: false, reservation: {
      gateway: binding.gateway, operationId: id, revision: binding.revision, wireBindingCommitment: binding.wireBindingCommitment,
      ingress: false, consumed: false,
    } };
  f.options.observer.readReservation = async (query, snapshot) => {
    assert.deepEqual(query, { claimDomain: domain, admissionN: binding.admissionN });
    assert.equal(snapshot.head.hash, f.state.head.hash); control.events.push('reservation');
    return structuredClone(control.reservation);
  };
  f.options.observer.assertUnrevoked = async (query, snapshot) => {
    assert.deepEqual(query, { claimDomain: domain, nativeGid: binding.nativeGid }); assert.equal(snapshot.head.hash, f.state.head.hash);
    control.unrevokedChecks++; control.events.push('unrevoked'); assert.equal(control.revoked, false, 'TEST_REVOKED_NATIVE_GID');
  };
  f.options.quorum.authorizeBroadcast = async request => {
    assert.deepEqual(request, { claimDomain: domain, ticketId: id, prepared, route, wireSalt, nativeId });
    control.authorizationCalls++; control.events.push('authorize');
    const authorization = { head: structuredClone(f.state.head), message: {
      claimDomain: domain, ticketId: id, revision: '1', claimSequence: '0', hubStateSequence: '0', amount: intent.lamports,
      wireKeyCommitment: key, unsignedWireCommitment: hash('original-unsigned-wire'), maxFee: '5000',
      revocationState: hash('revocation'), inventoryCommitment: hash('inventory'), obligationsCommitment: hash('obligations'),
      validFrom: f.state.head.timestamp, validUntil: String(BigInt(f.state.head.timestamp) + 30n),
      admissionN: binding.admissionN, nativeGid: binding.nativeGid, wireBindingCommitment: binding.wireBindingCommitment,
    } };
    authorization.indexes = [0, 1, 2];
    authorization.signatures = ['11', '22', '33'].map(byte => byte.repeat(65));
    authorization.abiSignatures = [0, 1, 2].map(signerIndex => ({ signerIndex, v: 27, r: hash('synthetic r'), s: hash('synthetic s') }));
    control.originalAuthorization = authorization; await control.authorizationHook?.(authorization); return authorization;
  };
  f.options.quorum.facts = async request => {
    assert.deepEqual(request, binding.request); control.factsCalls++;
    throw Error('TEST_STOP_BEFORE_NATIVE_PROOF_CONSTRUCTION');
  };
  const adapter = {
    async transfer() { control.signingCalls++; assert.fail('TEST_NO_FRESH_SIGNING_ON_RETAINED_PAYOUT'); },
    async assertPrepared(value) { control.preparedChecks++; control.events.push('prepared');
      assert.deepEqual(value, prepared); assert.equal(value.intent.durableNonce, control.currentNonce, 'TEST_ORIGINAL_NONCE_CHANGED'); },
    async observe(request) { assert.deepEqual(request, { nativeId }); control.observations.push(request.nativeId); control.events.push('observe');
      return { status: control.observationStatus, nativeId, nativeWire: control.observationStatus === 'observed' ? nativeWire : null }; },
    async resumeReservedPayout(request, callbacks) {
      assert.deepEqual(request, { nativeId }); assert.deepEqual(Object.keys(callbacks), ['beforeBroadcast']);
      control.resumeCalls++; assert.equal(original.broadcastAttempts, 0); assert.equal(original.phase, 'SIGNED_NOT_BROADCAST');
      const activePrepared = structuredClone(prepared); control.activePrepared = activePrepared;
      const token = await callbacks.beforeBroadcast(activePrepared);
      const native = f.options.claims.nativeRuntimes[0];
      const gate = openNativeClaimSolanaPayoutAuthority(token, native.close, native.genesis, activePrepared, original);
      control.finalCallbacks = gate;
      original.broadcastAttempts = 1; original.phase = 'BROADCAST_UNKNOWN'; control.events.push('persist-latch');
      await control.afterLatch?.(activePrepared);
      await gate.beforeSend(activePrepared); control.events.push('before-send');
      await control.afterFinalAwait?.(activePrepared);
      assert.equal(gate.assertBeforeSend(activePrepared), undefined); control.events.push('final-sync');
      control.events.push('send'); control.sends++;
      control.observationStatus = control.afterSendStatus; return { nativeId };
    },
  };
  Object.assign(f.options.claims.nativeRuntimes[0], { payoutFinalSendProfile: 'OWNED_SOLANA_PAYOUT_AUTHORITY_LIFETIME_V2', close() {}, genesis: f.config.nativeGenesis, nonceInfrastructure: { syntheticFixture: true }, transfers: [original],
    adapter(request) { assert.deepEqual(request, { asset: f.config.nativeAsset, route: kind === '2' ? 'refund' : 'redeem' }); return adapter; } });
  return { id, nativeId, nativeWire, prepared, binding, original, control, journal, adapter, ticket, route, wireSalt,
    retained: async () => (await journal.read()).tickets[0] };
}

const deepFreeze = value => { if (value && typeof value === 'object') { Object.values(value).forEach(deepFreeze); Object.freeze(value); } return value; };
function trackLifecycle(f) {
  const observer = f.options.observer, read = observer.read, issued = new WeakSet();
  const track = { reads: [], checks: [], permits: [] };
  observer.read = async () => {
    const result = deepFreeze(await read()); issued.add(result); track.reads.push(result); return result;
  };
  observer.assertCurrent = async snapshot => {
    assert.ok(issued.has(snapshot), 'TEST_EXACT_OWNED_SNAPSHOT_REQUIRED');
    assert.ok(Object.isFrozen(snapshot) && Object.isFrozen(snapshot.head));
    assert.deepEqual(snapshot.head, f.state.head, 'TEST_CURRENT_HEAD_CHANGED');
    track.checks.push(snapshot); await track.currentHook?.(snapshot);
    assert.deepEqual(snapshot.head, f.state.head, 'TEST_CURRENT_HEAD_CHANGED');
  };
  track.wrap = method => {
    const original = f.options.quorum[method]; assert.equal(typeof original, 'function');
    f.options.quorum[method] = async request => {
      const anchor = track.reads.at(-1), readCount = track.reads.length;
      await track.beforeAuthorization?.(method, request);
      const result = deepFreeze(await original(request));
      track.permits.push({ method, anchor, result, readCount });
      await track.afterAuthorization?.(method, result); return result;
    };
  };
  return track;
}
function addLifecycleMethod(f, name, inputs) {
  const signature = name + '(' + inputs.map(claimABIType).join(',') + ')';
  f.artifact.abi.push({ type: 'function', name, inputs });
  f.artifact.evm.methodIdentifiers[signature] = publicKeccak256(Buffer.from(signature)).subarray(0, 4).toString('hex');
}
const lifecycleProof = name => ({ name, type: 'tuple', components: [{ name: 'proof', type: 'bytes' }, { name: 'inputs', type: 'bytes32[]' }] });
const lifecycleRoute = { name: 'route', type: 'tuple', components: [{ name: 'endpoint', type: 'bytes' }, { name: 'salt', type: 'bytes32' },
  ...['quotedFee', 'selectedInputValue', 'changeFloor'].map(name => ({ name, type: 'uint64' })), { name: 'destinationFunded', type: 'bool' }] };
function advanceLifecycleHead(f) {
  f.state.head = { number: String(BigInt(f.state.head.number) + 1n), hash: hash('next head/' + f.state.head.hash),
    timestamp: String(BigInt(f.state.head.timestamp) + 1n) };
}

export { fixture, installRetainedNoncePayout, trackLifecycle, addLifecycleMethod, lifecycleRoute, advanceLifecycleHead,
  poisonedOperators, poisonedQuorums, openNativeClaimSolanaPayoutAuthority, hash, zero, ownedClaimControllerJournal,
  createClaimReservationBinding, claimABIType, publicKeccak256 };
