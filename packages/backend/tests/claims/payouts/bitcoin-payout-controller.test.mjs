/** SOURCE-ONLY BTC controller lifecycle tests.
 * Actual controller, reservation codec and encrypted Vault/CAS are exercised.
 * EVM/observer/operator ownership and native transport are explicit test doubles.
 * BTC witness is dummy DER syntax only: NO ECDSA, UTXO, chain, native signing,
 * compiler or proof evidence. Generated encrypted journals are retained. */
import test, { mock } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { CLAIM_CONFIG_SCHEMA, claimDomainCommitment, claimTicketId, claimTicketSecret,
  claimDestinationCommitment, nativeClaimEndpointCommitment, encodeClaimIngressInputs, encodeClaimDischargeInputs } from '@lianum/engine/claims/framing';
import { CLAIM_ACTIONS as A, CLAIM_BACKING_FIELDS, claimFrame, claimHash, claimRouteCommitment } from '@lianum/engine/claims/permits';
import { encodeDepositIntentInputs } from '@lianum/engine/execution/inputs/deposit-intent';
import { balanceCommitment } from '@lianum/engine/wallet/notes/private-wallet-note-encoding';
import * as originalAdmission from '@lianum/engine/execution/native/dispatch/native-admission';
import * as originalWireCodec from '../../../src/chains/evm/contracts/transaction-wire-codec.mjs';
import * as originalTooling from '@lianum/proofs/tooling/tooling';
import { publicKeccak256 } from '@lianum/engine/cohorts/private-cohort-public-native';
import { claimABIType } from '@lianum/engine/claims/abi';
import { encodeBitcoinBinding, validateBitcoinBinding, receiptKeyCommitment } from '@lianum/engine/native/native-receipt-binding';
import { createClaimReservationBinding } from '../../../src/claims/authorization/reservation-facts-gate.mjs';
import { ownerDigest, FLAT_OWNER_CLAIM_HANDOFF_PROFILE, FLAT_OWNER_CLAIM_HANDOFF_TRUST } from '@lianum/custody/owner';
const url = p => new URL(p, import.meta.url).href, hash = v => createHash('sha256').update(v).digest('hex');
const systems = new WeakMap(), observers = new WeakMap(), hands = new WeakMap(), roles = new WeakMap();
const poisonedOperators = new WeakSet(), poisonedQuorums = new WeakSet(), bitcoinAuthorizations = new WeakMap();
// Explicit synthetic V4 issuer. This is test scaffolding only, never a runtime
// authority: the real operators are covered in their own original-frame suite.
const testV4Tokens = new WeakMap();
function v4Quorum(target, control) {
  const originals = new WeakMap();
  const methods = {backing:'backing',reservation:'reservation',health:'health',authorizePayout:'payout',
    authorizeBroadcast:'broadcast',authorizeBitcoinBroadcast:'bitcoinBroadcast'};
  let quorum;
  quorum = new Proxy(target, { get(target, key) {
    if (key === 'authorizationLifecycleProfile') return 'CLAIM_AUTHORIZATION_LIFECYCLE_V4';
    if (key === 'validateOriginalAuthorizationV4') return async result => {
      const original = originals.get(result); assert.ok(original?.v4, 'TEST_ORIGINAL_V4_RESULT');
      if(['backing','reservation','health'].includes(original.method))assert.ok(control.isOriginalAuthorization(result),'TEST_ORIGINAL_QUORUM_RESULT');
      const auditStarted = performance.now();
      control.finalAudits = (control.finalAudits ?? 0) + 1;
      const snapshot=await target.observer.read();assert.deepEqual(snapshot.head,result.head,'TEST_CURRENT_HEAD_CHANGED');
      await control.finalAuditHook?.(result);
      await target.observer.assertCurrent(snapshot);
      assert.deepEqual(result, original.captured, 'TEST_ORIGINAL_V4_CHANGED');
      const token = Object.freeze({});
      testV4Tokens.set(token, {quorum,result,original,auditStarted}); return token;
    };
    const value = Reflect.get(target,key);
    if (!methods[key] || typeof value !== 'function') return value;
    return async (...args) => { const result = await value(...args);
      const request=args[0],v4=['authorizePayout','authorizeBroadcast','authorizeBitcoinBroadcast'].includes(key)||key==='health'&&request?.mode==='debt'||key==='backing'&&[A.REDEEM,A.BEGIN_PAYOUT].includes(request?.terms?.action)||key==='reservation'&&request?.terms?.action===A.RESERVE_PAYOUT;
      originals.set(result,{method:methods[key],captured:structuredClone(result),v4});
      return result; };
  } });
  return quorum;
}

mock.module(url('../../../src/operations/deployments/claims/deploy-native-claims.mjs'), { exports: { assertOwnedNativeClaimSystem(runtime, claims) { assert.equal(systems.get(claims), runtime, 'TEST_OWNED_CLAIMS'); } } });
mock.module(url('../../../src/chains/evm/runtime/local-evm-ownership.mjs'),{exports:{async assertLocalEvm(runtime){assert.equal(runtime.testOwned,true);},async assertLocalEvmDeploymentProfile(runtime){assert.equal(runtime.testOwned,true);}}});
mock.module(url('../../../src/chains/evm/contracts/transaction-wire-codec.mjs'),{exports:{...originalWireCodec,assertSignedEvmTransaction(wire,expected){assert.ok(wire.startsWith('0x'));assert.ok(expected.data);}}});
mock.module(url('../../../src/chains/evm/runtime/owned-evm-v2-runtime.mjs'), { exports: { LOCAL_EVM_PROFILE: { maxGas: 30000000 },
  async assertOwnedLocalEvmV2(runtime) { assert.equal(runtime.testOwned, true); },
  async refreshNativeValueReceiverClock(runtime) { assert.equal(runtime.testOwned, true); },
  nativeValueReceiverInclusionSecondV1(runtime) { assert.equal(runtime.testOwned, true); return null; },
  assertSignedEvmTransaction(wire, expected) { assert.ok(wire.startsWith('0x')); assert.ok(expected.data); } } });
mock.module(url('../../../src/claims/operations/owned-state.mjs'), { exports: { assertOwnedClaimObserver(o) { assert.ok(observers.has(o)); }, ownedClaimObserverBindings(o) { return observers.get(o); } } });
mock.module(url('../../../src/claims/operations/operators.mjs'), { exports: { createScopedClaimOperator(){assert.fail('UNUSED_SCOPED_CLAIM');},consumeClaimOperatorKeyLeaseV4(){assert.fail('UNUSED_SCOPED_CLAIM');},consumeClaimPayoutFactsKeyLeaseV4(){assert.fail('UNUSED_SCOPED_CLAIM');},
  openClaimOriginalAuthorizationLeaseV4(token, quorum, result) {
    const state = testV4Tokens.get(token); testV4Tokens.delete(token);
    assert.ok(state && state.quorum===quorum && state.result===result,'TEST_ORIGINAL_V4_TRIPLE');
    let consumed = false, keySucceeded = false, continued = false;
    return Object.freeze({profile:'CLAIM_ORIGINAL_AUTHORIZATION_LEASE_V4',auditStarted:state.auditStarted,
      method:state.original.method,head:structuredClone(result.head),assertBeforeKey() {
        assert.equal(consumed,false,'TEST_ORIGINAL_V4_REPLAY'); consumed=true;
        assert.deepEqual(result,state.original.captured,'TEST_ORIGINAL_V4_CHANGED');
        assert.ok(!poisonedQuorums.has(quorum),'COMBINED_OPERATOR_CLOSED_OR_POISONED');
        for(const message of [result.message,result.authorization?.permit]) if(message?.validUntil) {
          assert.ok(BigInt(message.validFrom)<=BigInt(result.head.timestamp) && BigInt(result.head.timestamp)+1n<BigInt(message.validUntil),'TEST_ORIGINAL_V4_CERTIFICATE_EXPIRED');
        }
        const elapsed=performance.now()-state.auditStarted;
        assert.ok(Number.isFinite(elapsed)&&elapsed>=0&&elapsed<30000,'CLAIM_ORIGINAL_V4_AUDIT_TOO_OLD');keySucceeded=true;
      },assertContinuationSourceCurrent(){assert.equal(continued,false,'TEST_V4_CONTINUATION_REPLAY');continued=true;assert.ok(keySucceeded,'TEST_V4_KEY_NOT_CONSUMED');
        assert.deepEqual(result,state.original.captured,'TEST_ORIGINAL_V4_CHANGED');assert.ok(!poisonedQuorums.has(quorum),'COMBINED_OPERATOR_CLOSED_OR_POISONED');
        const elapsed=performance.now()-state.auditStarted;assert.ok(Number.isFinite(elapsed)&&elapsed>=0&&elapsed<30000,'CLAIM_ORIGINAL_V4_AUDIT_TOO_OLD');
      }});
  },

  assertOriginalBitcoinPayoutBroadcastAuthorization(quorum, result, request) {
    const original = bitcoinAuthorizations.get(result);
    assert.ok(original && original.quorum === quorum && original.request === request, 'TEST_BITCOIN_ORIGINAL_CERTIFICATE');
    assert.deepEqual(result, original.captured, 'TEST_BITCOIN_CERTIFICATE_CHANGED');
  },
  assertOwnedClaimOperator(op, observer) { assert.equal(op.observer, observer); assert.ok(!poisonedOperators.has(op), 'COMBINED_OPERATOR_CLOSED_OR_POISONED'); },
  assertOwnedClaimOperatorQuorum(q, observer) { assert.equal(q.observer, observer); assert.ok(!poisonedQuorums.has(q), 'COMBINED_OPERATOR_CLOSED_OR_POISONED'); },
} });
mock.module(url('../../../src/proving/roles/role-client.mjs'), { exports: {createRoleProofClient(){assert.fail('UNUSED_REAL_PROVER');},readOriginalDeviceRootClaimDerivationV2(){assert.fail('UNUSED_ROOT_DERIVATION');},assertRoleProofClient(client, role) { assert.equal(roles.get(client), role); } } });
mock.module(url('../../../src/custody/processes/flat-owner-process.mjs'), { exports: {assertOwnedPrivateNativeClaimIngressHandoffV2(){assert.fail('UNUSED_PRIVATE_INGRESS');},assertOwnedFlatOwnerProcess(){assert.fail('UNUSED_OWNER');},assertOwnedNativeClaimIngressHandoff(h, expected) {
  assert.ok(hands.has(h), 'TEST_REAL_HANDOFF_ONLY'); for (const [k, v] of Object.entries(expected)) assert.equal(hands.get(h)[k], v); } } });
mock.module(url('../../../src/execution/account/reconciliation/flat-system-state.mjs'), { exports: {decodeFlatWords(){assert.fail('UNUSED_FLAT_WORDS');},async createFlatSystemStateReader({ runtime }) { return {
  async read() { return { head: structuredClone(runtime.testState.head),
    state: { revokedDigest: zero, revokedCount: '0', revocationSequence: '0' }, revokedEntries: [] }; },
}; } } });
// Explicit host-only proof scaffolding for lifecycle ordering tests. Neither a
// compiler, hash backend nor prover can run through these replacements.
mock.module(url('../../../../proofs/src/tooling/tooling.mjs'), { exports: { ...originalTooling,
  resourceModuleURL: 'data:text/javascript,export function verifyToolchain() {}',
  async loadPinned(name) { assert.equal(name, '@aztec/bb.js'); return { BackendType: { Wasm: 'TEST_ONLY' }, Barretenberg: {
    async new() { return { async poseidon2Hash() { assert.fail('TEST_NO_REAL_HASH_BACKEND'); }, async destroy() {} }; },
  } }; },
} });
mock.module('@lianum/engine/claims/inputs', { exports: {
  buildClaimIngressInputs: raw => { const statement = { claimDomain: claimDomainCommitment(raw.config), outputQ: hash('synthetic Q'),
    admissionN: hash('synthetic N'), refundDestination: hash('synthetic refund'), admissionRevocationState: '01'.repeat(32),
    ingressReceiptLeaf: '02'.repeat(32), amountQ: raw.noteOpening.value, evidenceFrom: '1', evidenceUntil: '1000000' };
    return { inputs: { syntheticLifecycleOnly: true }, expectedPublicInputs: [...encodeClaimIngressInputs(statement)], statement }; },
  buildClaimDischargeInputs: raw => { const statement = { claimDomain: claimDomainCommitment(raw.config), ticketId: raw.ticket.id,
    ticketCommitment: hash('synthetic ticket'), dischargeN: hash('synthetic discharge'), admissionRevocationState: '01'.repeat(32),
    evidenceFrom: '1', evidenceUntil: '1000000' };
    return { inputs: { syntheticLifecycleOnly: true }, expectedPublicInputs: [...encodeClaimDischargeInputs(statement)], statement }; },
} });
mock.module('@lianum/engine/execution/native/dispatch/native-admission', { exports: { ...originalAdmission,
  nativeAdmissionRulesTree: () => ({ paths: [{ index: '0', siblings: Array(3).fill('0'.repeat(64)) }] }), nativeAdmissionChainDomain: rule => claimHash(claimFrame('LIANUM/evidence-chain/1', [Buffer.from(rule.family === '1' ? 'BTC' : 'SOL'),Buffer.from(rule.genesis,'hex'),Buffer.from(rule.asset,'hex')])) } });
const { createNativeClaimController, createNativeClaimControllerKeeper, createDurableNativeClaimControllerKeeper,
  restartNativeClaimController, assertNativeClaimBitcoinPayoutSendToken,
  authorizeNativeClaimBitcoinPayoutSend, authorizeNativeClaimBitcoinPayoutLatch, consumeNativeClaimBitcoinPayoutSend, consumeNativeClaimOriginalKeyAuthorityV4 } = await import('../../../src/claims/controller/controller.mjs');
const { ownedClaimControllerJournal } = await import('../../../src/claims/controller/controller-journal.mjs');
const { assertOwnedClaimEvmDispatchRequest, createClaimEvmDispatchRequest } = await import('../../../src/claims/controller/controller.mjs');
const zero = '0'.repeat(64), p = v => '0x' + v;
async function fixture({ durable = false } = {}) {
  const directory = await mkdtemp(join(tmpdir(), 'claim-bitcoin-controller-source-only-')), path = join(directory, 'controller.vault');
  const config = Object.fromEntries(CLAIM_CONFIG_SCHEMA.map(([key, type]) => [key, type === 'address' ? hash(key).slice(0, 40)
    : type === 'u256' ? '31337' : type === 'u64' ? '5000' : type === 'u8' ? '1' : type === 'field32' ? '01' + hash(key).slice(2) : hash(key)]));
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
    close(){}, metadata: { evmGenesis: p(hash('genesis')), chainId: '31337' },
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
      const keyToken=await scope.beforeSign(prepared);scope.consumeBeforeKey(keyToken,prepared);const signed = { nativeWire: '0x1122', nativeId: p(hash('tx' + control.dispatches)), transactionSHA256: hash('wire') };
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
  const quorum = v4Quorum({ observer, async backing(request) {
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
  }, control);
  control.isOriginalAuthorization = result => completedAuthorizations.has(result);
  control.registerAuthorization = result => { completedAuthorizations.add(result); return result; };
  const proofClients = Object.fromEntries(['claim_ingress','claim_discharge'].map(role => { const client = {}; roles.set(client, role); return [role,client]; }));
  const keeper = await (durable ? createDurableNativeClaimControllerKeeper : createNativeClaimControllerKeeper)(
    { runtime, claims, path, password: 'TEST ONLY PASSWORD '.repeat(4) });
  const options = { runtime, claims, observer, operators, quorum, proofClients, keeper, ingressProverIdentity: packet.ingressProverIdentity };
  let controller = await createNativeClaimController(options);
  return { options, control, packet, handoff, directory, path, runtime, keeper, config, state, artifact, authSchema, get controller(){return controller;},
    async reopen(){controller.close();controller=await createNativeClaimController(options);},
    async reopenKeeper(){controller.close();await keeper.restart();controller=await createNativeClaimController(options);},
    async restart(){controller=await restartNativeClaimController(controller);return controller;},
    async close(){try{controller.close();}catch(error){assert.match(error.message,/CLAIM_CONTROLLER_CLOSED/);}
      await keeper.close(); /* Preserve test journals; never remove generated data. */} };
}

const deepFreeze = value => { if (value && typeof value === 'object') { Object.values(value).forEach(deepFreeze); Object.freeze(value); } return value; };
function addMethod(f, name, inputs) {
  const signature = name + '(' + inputs.map(claimABIType).join(',') + ')';
  f.artifact.abi.push({ type: 'function', name, inputs });
  f.artifact.evm.methodIdentifiers[signature] = publicKeccak256(Buffer.from(signature)).subarray(0, 4).toString('hex');
}
const routeSchema = { name: 'route', type: 'tuple', components: [{ name: 'endpoint', type: 'bytes' }, { name: 'salt', type: 'bytes32' },
  ...['quotedFee', 'selectedInputValue', 'changeFloor'].map(name => ({ name, type: 'uint64' })), { name: 'destinationFunded', type: 'bool' }] };
function advanceHead(f) {
  f.state.head = { number: String(BigInt(f.state.head.number) + 1n), hash: hash('new head/' + f.state.head.hash),
    timestamp: String(BigInt(f.state.head.timestamp) + 1n) };
  f.runtime.ingressSendState = Object.freeze({ epoch: String(BigInt(f.runtime.ingressSendState.epoch) + 1n), busy: false, uncertain: false });
}
function dummyBitcoinWitness(intent) {
  // Generator pubkey plus r=1, s=1, SIGHASH_ALL. Not an ECDSA signature.
  const publicKey = Buffer.from('0279be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798', 'hex');
  const signature = Buffer.from('300602010102010101', 'hex'), unsigned = Buffer.from(encodeBitcoinBinding(intent), 'hex');
  return Buffer.concat([unsigned.subarray(0,4), Buffer.from([0,1]), unsigned.subarray(4,-4),
    Buffer.from([2,signature.length]), signature, Buffer.from([publicKey.length]), publicKey, unsigned.subarray(-4)]).toString('hex');
}
async function bitcoinFixture(kind = '1') {
  const f = await fixture(), native = f.options.claims.nativeRuntimes[0], domain = f.packet.claimDomain;
  const id = claimTicketId({ claimDomain: domain, kind, nonce: '0' });
  const secret = claimTicketSecret({ claimDomain: domain, ticketId: id });
  const key = receiptKeyCommitment({ ledgerNamespace: f.config.ledgerNamespace, secret });
  const routeName = kind === '2' ? 'refund' : 'redeem', salt = hash('synthetic BTC destination salt/' + kind);
  native.roles = { escrow: { endpoint: '0014751e76e8199196d454941c45d1b3a323f1433bd6' },
    depositor: { endpoint: '0014' + '11'.repeat(20) }, recipient: { endpoint: '0014' + '22'.repeat(20) } };
  const intent = { sourceTxid: hash('synthetic prevout'), sourceVout: '0', sourceScript: native.roles.escrow.endpoint,
    sourceSatoshi: '2000000', recipientScript: native.roles[kind === '2' ? 'depositor' : 'recipient'].endpoint,
    amountSatoshi: '1000000', changeScript: native.roles.escrow.endpoint, feeSatoshi: '5000', wireKeyCommitment: key };
  const prepared = { genesis: f.config.nativeGenesis, intent, unsignedWire: encodeBitcoinBinding(intent), funds: { syntheticOnly: true } };
  const nativeWire = dummyBitcoinWitness(intent), decoded = validateBitcoinBinding(nativeWire, intent), nativeId = decoded.txid;
  assert.equal(decoded.assurance, 'wire-and-witness-syntax-only-no-ecdsa-utxo-finality-or-authorization');
  const route = { endpoint: intent.recipientScript, salt, quotedFee: intent.feeSatoshi, selectedInputValue: intent.sourceSatoshi,
    changeFloor: '1000', destinationFunded: false };
  const destinationCommitment = claimDestinationCommitment({ claimDomain: domain,
    nativeChainDomain: claimHash(claimFrame('LIANUM/evidence-chain/1', [Buffer.from('BTC'), Buffer.from(f.config.nativeGenesis,'hex'), Buffer.from(f.config.nativeAsset,'hex')])),
    endpoint: nativeClaimEndpointCommitment({ family: '1', genesis: f.config.nativeGenesis, asset: f.config.nativeAsset, endpoint: route.endpoint }),
    amount: intent.amountSatoshi, maxFee: '5000', salt });
  const ticket = { kind, id, claimDomain: domain, amount: intent.amountSatoshi, maxFee: '5000', destinationCommitment,
    referenceIngressN: kind === '2' ? hash('synthetic refund ingress') : zero, referenceQ: kind === '2' ? hash('synthetic refund Q') : zero };
  const journal = ownedClaimControllerJournal(f.keeper, f.runtime, f.options.claims);
  await journal.update(data => { data.tickets.push({ id, claimDomain: domain, ticket, secret, key, salt, route: null, native: null, proofs: [],
    status: kind === '2' ? 'REFUND_PENDING' : 'REDEMPTION_PENDING' }); return data; });
  Object.assign(f.state.gateways[0], { tickets: [{ ticket: structuredClone(ticket), state: '1', payoutRouteCommitment: zero }], activePayout: zero, nextTicketNonce: '1' });
  const c = { transferCalls: 0, syntheticSigningSteps: 0, sends: 0, authorizeCalls: 0, preparedChecks: 0, currentChecks: 0,
    events: [], reservation: null, revoked: false, finalNativeDone: false, postReservationSnapshots: [], observationStatus: 'unknown' };
  native.transfers = []; native.payoutFinalSendProfile = 'OWNED_BITCOIN_PAYOUT_FINAL_SEND_V1';
  native.inventory = async () => ({ escrow: { utxos: [{ txid: intent.sourceTxid, vout: intent.sourceVout, amount: intent.sourceSatoshi,
    script: intent.sourceScript, spendable: true, solvable: true, safe: true, locked: false, confirmations: '6', coinbase: false }] } });
  addMethod(f, 'beginPayout', [{ name: 'ticketId', type: 'bytes32' }, routeSchema, f.authSchema]);
  addMethod(f, 'reserveSignedEffect', [...'operationId nullifier wireBindingCommitment refundDestination'.split(' ').map(name => ({ name, type: 'bytes32' })), f.authSchema]);
  f.control.includedHook = async () => {
    const row = (await journal.read()).tickets[0];
    if (f.control.dispatches === 1) {
      f.state.gateways[0].tickets[0].state = '2'; f.state.gateways[0].tickets[0].payoutRouteCommitment = claimRouteCommitment(row.route);
      f.state.gateways[0].activePayout = id; c.events.push('beginPayout-included');
    } else {
      assert.equal(f.control.dispatches, 2); const b = row.native.binding;
      c.reservation = { gateway: b.gateway, operationId: id, revision: b.revision, wireBindingCommitment: b.wireBindingCommitment, ingress: false, consumed: false };
      c.events.push('reservePayout-included');
    }
    advanceHead(f);
  };
  const issued = new WeakSet(), read = f.options.observer.read;
  f.options.observer.read = async () => { const snapshot = deepFreeze(await read()); issued.add(snapshot);
    if (c.authorizeCalls) c.postReservationSnapshots.push(snapshot); return snapshot; };
  f.options.observer.assertCurrent = async snapshot => {
    assert.ok(issued.has(snapshot), 'TEST_EXACT_OWNED_SNAPSHOT_REQUIRED'); c.currentChecks++;
    assert.deepEqual(snapshot.head, f.state.head, 'TEST_CURRENT_HEAD_CHANGED');
    if (c.authorizeCalls && c.finalNativeDone) { c.events.push('final-current-await'); await c.currentHook?.(snapshot); }
    assert.deepEqual(snapshot.head, f.state.head, 'TEST_CURRENT_HEAD_CHANGED');
  };
  f.options.observer.readReservation = async (query, snapshot) => {
    assert.equal(query.claimDomain, domain); assert.equal(query.admissionN, c.binding.admissionN);
    assert.deepEqual(snapshot.head, f.state.head, 'TEST_RESERVATION_HEAD'); c.events.push('reservation-read');
    return structuredClone(c.reservation);
  };
  f.options.observer.assertUnrevoked = async (query, snapshot) => {
    assert.deepEqual(query, { claimDomain: domain, nativeGid: c.binding.nativeGid });
    assert.deepEqual(snapshot.head, f.state.head); assert.equal(c.revoked, false, 'TEST_REVOKED_NATIVE_GID'); c.events.push('unrevoked');
  };
  for (const op of f.options.operators) op.retainSignedEffect = async request => {
    c.binding = (await journal.read()).tickets[0].native.binding;
    assert.deepEqual(request, { claimDomain: domain, operationId: id, receiptSecret: secret, wireSalt: c.binding.wireSalt, nativeId });
    c.events.push('retain-operator-' + op.signerIndex); return c.binding;
  };
  f.options.quorum.reservation = request => f.options.quorum.backing(request);
  f.options.quorum.authorizePayout = async request => {
    assert.equal(request.ticketId, id); assert.deepEqual(request.prepared, prepared); c.events.push('presign-authorization');
    return { head: structuredClone(f.state.head), message: { syntheticOnly: true } };
  };
  f.options.quorum.authorizeBitcoinBroadcast = async request => {
    c.authorizeCalls++; c.events.push('BTC-broadcast-authorization'); c.request = request;
    assert.deepEqual(request, { claimDomain: domain, ticketId: id, prepared, route, wireSalt: c.binding.wireSalt, nativeId });
    assert.equal(f.control.dispatches, 2); assert.ok(c.events.includes('reservePayout-included')); c.authorizedHead = structuredClone(f.state.head);
    const authorization = { head: structuredClone(f.state.head), message: { claimDomain: domain, ticketId: id,
      admissionN: c.binding.admissionN, nativeGid: c.binding.nativeGid, wireBindingCommitment: c.binding.wireBindingCommitment,
      validFrom: f.state.head.timestamp, validUntil: String(BigInt(f.state.head.timestamp) + 30n) }, syntheticOnly: true };
    c.authorization = authorization;
    bitcoinAuthorizations.set(authorization, { quorum: f.options.quorum, request, captured: structuredClone(authorization) });
    await c.authorizationHook?.(authorization); return authorization;
  };
  f.options.quorum.facts = async () => { throw Error('TEST_NO_NATIVE_PROOF_CONSTRUCTION'); };
  const adapter = {
    async assertPrepared(value) {
      c.preparedChecks++; assert.deepEqual(value, prepared, 'TEST_ORIGINAL_NATIVE_PREPARATION');
      if (c.authorizeCalls) { c.finalNativeDone = true; c.events.push('final-native-await'); await c.nativeHook?.(value); }
    },
    async observe(request) { assert.deepEqual(request, { nativeId }); c.events.push('observe-original');
      return { status: c.observationStatus, nativeId, nativeWire: null }; },
    async transfer(request, callbacks) {
      assert.deepEqual(request, { amount: intent.amountSatoshi, wireKeyCommitment: key }); c.transferCalls++; c.token = callbacks.payoutSendToken;
      assert.ok(c.token); assertNativeClaimBitcoinPayoutSendToken(c.token, native, routeName);
      assert.throws(() => assertNativeClaimBitcoinPayoutSendToken(c.token, native, routeName === 'redeem' ? 'refund' : 'redeem'), /PRIVATE_SEND_TOKEN_REQUIRED/);
      assert.throws(() => assertNativeClaimBitcoinPayoutSendToken(c.token, { ...native }, routeName), /PRIVATE_SEND_TOKEN_REQUIRED/);
      const keyToken=await callbacks.beforeSign(prepared);consumeNativeClaimOriginalKeyAuthorityV4(keyToken,'payout',native.close,native.genesis,routeName,prepared);c.events.push('synthetic-wire-created'); c.syntheticSigningSteps++;
      const original = { route: routeName, recipientIndex: kind === '2' ? 0 : 1, txid: nativeId, rawTransaction: nativeWire,
        transactionSHA256: decoded.transactionSHA256, intent: structuredClone(intent), phase: 'SIGNED_NOT_BROADCAST', broadcastAttempts: 0 };
      native.transfers.push(original); c.original = original; c.signed = { nativeWire };
      await callbacks.onSigned(c.signed); c.events.push('reservation-persisted');
      await c.beforeAuthorize?.(); c.events.push('mock-health-and-mempool-read-complete');
      await authorizeNativeClaimBitcoinPayoutSend(c.token, prepared, c.signed); c.events.push('authorization-ready');
      authorizeNativeClaimBitcoinPayoutLatch(c.token,prepared,c.signed);
      original.phase = 'BROADCAST_UNKNOWN'; original.broadcastAttempts = 1; c.events.push('attempt-latched');
      await c.beforeConsume?.();
      consumeNativeClaimBitcoinPayoutSend(c.token, c.consumePrepared ?? prepared, c.consumeSigned ?? c.signed);
      c.events.push('final-sync-consumed'); c.sends++; c.events.push('mock-send');
      if (c.loseReply) throw Error('TEST_LOST_BITCOIN_REPLY'); return { nativeId };
    },
  };
  native.close=()=>{};native.genesis=f.config.nativeGenesis;
  native.adapter = request => { assert.deepEqual(request, { asset: f.config.nativeAsset, route: routeName }); return adapter; };
  return { ...f, f, c, id, nativeId, nativeWire, prepared, route, ticket, native, adapter, journal,
    payout: () => f.controller.payout({ ticketId: id }), retained: async () => (await journal.read()).tickets[0] };
}

test('BTC controller accepts both fixed payout routes only after begin and reservation, with one private final permission', async t => {
  for (const kind of ['1', '2']) await t.test(kind === '1' ? 'redeem' : 'refund', async () => {
    const n = await bitcoinFixture(kind);
    try {
      const result = await n.payout(); assert.equal(result.status, 'UNKNOWN');
      assert.equal(n.c.transferCalls, 1); assert.equal(n.c.syntheticSigningSteps, 1); assert.equal(n.c.sends, 1); assert.equal(n.c.authorizeCalls, 1);
      assert.equal(n.c.original.phase, 'BROADCAST_UNKNOWN'); assert.equal(n.c.original.broadcastAttempts, 1);
      assert.equal(n.c.authorizedHead.number, '3'); assert.deepEqual(n.c.authorization.head, n.f.state.head);
      assert.deepEqual((await n.retained()).native.bitcoinBroadcastAuthorization, n.c.authorization);
      const events = n.c.events, ordered = ['beginPayout-included', 'presign-authorization', 'synthetic-wire-created', 'retain-operator-0',
        'retain-operator-3', 'reservePayout-included', 'reservation-persisted', 'mock-health-and-mempool-read-complete', 'BTC-broadcast-authorization',
        'final-native-await', 'final-current-await', 'authorization-ready', 'attempt-latched', 'final-sync-consumed', 'mock-send'];
      for (let i = 1; i < ordered.length; i++) assert.ok(events.indexOf(ordered[i-1]) < events.indexOf(ordered[i]), ordered[i]);
      assert.throws(() => assertNativeClaimBitcoinPayoutSendToken(n.c.token, n.native, kind === '2' ? 'refund' : 'redeem'), /PRIVATE_SEND_TOKEN_REQUIRED/);
      await assert.rejects(authorizeNativeClaimBitcoinPayoutSend(n.c.token, n.prepared, n.c.signed), /PRIVATE_SEND_TOKEN_REQUIRED/);
      assert.throws(() => consumeNativeClaimBitcoinPayoutSend(n.c.token, n.prepared, n.c.signed), /SEND_PERMISSION_REQUIRED/);
    } finally { await n.close(); }
  });
});

test('BTC final native and original-current awaits preserve original head, liveness and strict 30-second clock', async t => {
  for (const phase of ['native', 'current']) for (const fault of ['head', 'operator', 'quorum', 'keeper', 'deadline', 'pass-29999']) {
    await t.test(phase + '/' + fault, async () => {
      const n = await bitcoinFixture(); let now = 0, injected = false;
      const clock = t.mock.method(performance, 'now', () => now);
      try {
        const inject = async () => {
          if (injected) return; injected = true; await Promise.resolve();
          if (fault === 'head') advanceHead(n.f);
          if (fault === 'operator') poisonedOperators.add(n.options.operators[0]);
          if (fault === 'quorum') poisonedQuorums.add(n.options.quorum);
          if (fault === 'keeper') {
            await writeFile(n.path, Buffer.from('SOURCE ONLY: intentional test keeper corruption'));
            await assert.rejects(n.journal.read(), /KEEPER_READ_UNCERTAIN/);
          }
          if (fault === 'deadline') now = 30000;
          if (fault === 'pass-29999') now = 29999;
        };
        if(['deadline','pass-29999'].includes(fault))n.control.finalAuditHook=async result=>{if(result===n.c.authorization)await inject();};
        else n.c[phase === 'native' ? 'nativeHook' : 'currentHook'] = inject;
        if (fault === 'pass-29999') await n.payout();
        else await assert.rejects(n.payout(), fault === 'head' ? /TEST_CURRENT_HEAD_CHANGED/
          : fault === 'keeper' ? /KEEPER_UNAVAILABLE|KEEPER_READ_UNCERTAIN/
          : fault === 'deadline' ? /CLAIM_BITCOIN_FINAL_AUDIT_TOO_OLD/ : /CLOSED_OR_POISONED/);
        assert.ok(injected); assert.equal(n.c.authorizeCalls, 1); assert.equal(n.c.syntheticSigningSteps, 1);
        assert.equal(n.c.original.broadcastAttempts, fault === 'pass-29999' ? 1 : 0);
        assert.equal(n.c.sends, fault === 'pass-29999' ? 1 : 0);
        assert.deepEqual(n.c.authorization.head, n.c.authorizedHead, 'no replacement certificate or original head');
        await assert.rejects(authorizeNativeClaimBitcoinPayoutSend(n.c.token, n.prepared, n.c.signed), /PRIVATE_SEND_TOKEN_REQUIRED/);
        if (fault !== 'keeper') {
          poisonedOperators.delete(n.options.operators[0]); poisonedQuorums.delete(n.options.quorum);
          n.c.nativeHook = null; n.c.currentHook = null;
          assert.equal((await n.payout()).status, 'UNKNOWN');
          assert.equal(n.c.authorizeCalls, 1); assert.equal(n.c.transferCalls, 1);
          assert.equal(n.c.sends, fault === 'pass-29999' ? 1 : 0, 'UNKNOWN never becomes a fresh first-send request');
        }
      } finally {
        clock.mock.restore(); poisonedOperators.delete(n.options.operators[0]); poisonedQuorums.delete(n.options.quorum); await n.close();
      }
    });
  }
});

test('BTC post-await consume burns the first attempt and rejects local epoch, original-byte, object-identity and liveness changes', async t => {
  for (const fault of ['epoch', 'busy', 'uncertain', 'wire', 'wire-hash', 'runtime-intent', 'runtime-route', 'duplicate-original', 'adverse',
    'prepared-copy', 'signed-copy', 'signed-bytes', 'certificate', 'operator', 'quorum', 'keeper', 'deadline', 'pass-29999']) {
    await t.test(fault, async () => {
      const n = await bitcoinFixture(); let now = 0;
      const clock = t.mock.method(performance, 'now', () => now);
      try {
        n.c.beforeConsume = async () => {
          assert.ok(n.c.events.includes('final-current-await')); assert.equal(n.c.original.broadcastAttempts, 1);
          assert.equal(n.c.original.phase, 'BROADCAST_UNKNOWN'); await Promise.resolve();
          if (fault === 'epoch') n.runtime.ingressSendState = Object.freeze({ epoch: '999', busy: false, uncertain: false });
          if (fault === 'busy') n.runtime.ingressSendState = Object.freeze({ ...n.runtime.ingressSendState, busy: true });
          if (fault === 'uncertain') n.runtime.ingressSendState = Object.freeze({ ...n.runtime.ingressSendState, uncertain: true });
          if (fault === 'wire') n.c.original.rawTransaction += '00';
          if (fault === 'wire-hash') n.c.original.transactionSHA256 = hash('changed exact bytes');
          if (fault === 'runtime-intent') n.c.original.intent.feeSatoshi = '4999';
          if (fault === 'runtime-route') n.c.original.route = 'refund';
          if (fault === 'duplicate-original') n.native.transfers.push(structuredClone(n.c.original));
          if (fault === 'adverse') n.c.original.adverseReason = 'synthetic rejection';
          if (fault === 'prepared-copy') n.c.consumePrepared = structuredClone(n.prepared);
          if (fault === 'signed-copy') n.c.consumeSigned = structuredClone(n.c.signed);
          if (fault === 'signed-bytes') n.c.signed.nativeWire += '00';
          if (fault === 'certificate') n.c.authorization.message.validUntil = '999999';
          if (fault === 'operator') poisonedOperators.add(n.options.operators[3]);
          if (fault === 'quorum') poisonedQuorums.add(n.options.quorum);
          if (fault === 'keeper') {
            await writeFile(n.path, Buffer.from('SOURCE ONLY: intentional test keeper corruption'));
            await assert.rejects(n.journal.read(), /KEEPER_READ_UNCERTAIN/);
          }
          if (fault === 'deadline') now = 30000;
          if (fault === 'pass-29999') now = 29999;
        };
        const expected = {
          epoch: /CLAIM_BITCOIN_EVM_MUTATION_CHANGED/, busy: /CLAIM_BITCOIN_EVM_MUTATION_CHANGED/,
          uncertain: /CLAIM_BITCOIN_EVM_MUTATION_CHANGED/, wire: /CLAIM_BITCOIN_ORIGINAL_WIRE/,
          'wire-hash': /CLAIM_BITCOIN_ORIGINAL_WIRE_HASH/, 'runtime-intent': /CLAIM_BITCOIN_ORIGINAL_INTENT/,
          'runtime-route': /CLAIM_BITCOIN_RUNTIME_ROUTE/, 'duplicate-original': /CLAIM_BITCOIN_ORIGINAL_RUNTIME/,
          adverse: /CLAIM_BITCOIN_ORIGINAL_ADVERSE/, 'prepared-copy': /CLAIM_BITCOIN_ORIGINAL_PREPARATION_IDENTITY/,
          'signed-copy': /CLAIM_BITCOIN_ORIGINAL_SIGNED_IDENTITY/, 'signed-bytes': /CLAIM_BITCOIN_SIGNED_CHANGED/,
          certificate: /TEST_BITCOIN_CERTIFICATE_CHANGED/, operator: /CLOSED_OR_POISONED/, quorum: /CLOSED_OR_POISONED/,
          keeper: /CLAIM_BITCOIN_KEEPER_UNAVAILABLE/, deadline: /CLAIM_BITCOIN_FINAL_AUDIT_TOO_OLD/,
        }[fault];
        if (fault === 'pass-29999') await n.payout();
        else await assert.rejects(n.payout(), expected);
        assert.equal(n.c.syntheticSigningSteps, 1); assert.equal(n.c.authorizeCalls, 1); assert.equal(n.c.sends, fault === 'pass-29999' ? 1 : 0);
        assert.equal(n.c.original.broadcastAttempts, 1); assert.equal(n.c.original.phase, 'BROADCAST_UNKNOWN');
        assert.throws(() => consumeNativeClaimBitcoinPayoutSend(n.c.token, n.prepared, n.c.signed), /SEND_PERMISSION_REQUIRED/,
          'a failed synchronous check consumes the private capability');
        await assert.rejects(authorizeNativeClaimBitcoinPayoutSend(n.c.token, n.prepared, n.c.signed), /PRIVATE_SEND_TOKEN_REQUIRED/);
        assert.ok(Object.isFrozen(n.prepared) && Object.isFrozen(n.prepared.intent), 'captured request freezes original preparation');
        if (fault !== 'keeper') {
          assert.equal((await n.retained()).status, 'UNKNOWN');
          assert.equal((await n.retained()).native.status, fault === 'pass-29999' ? 'UNKNOWN' : 'RESERVED_BEFORE_BROADCAST');
        }
      } finally {
        clock.mock.restore(); poisonedOperators.delete(n.options.operators[3]); poisonedQuorums.delete(n.options.quorum); await n.close();
      }
    });
  }
});

test('BTC source-only canonical reservation and revocation failures cannot create send permission', async t => {
  for (const fault of ['consumed-reservation', 'missing-reservation', 'revoked', 'evm-busy', 'evm-uncertain']) await t.test(fault, async () => {
    const n = await bitcoinFixture();
    try {
      n.c.beforeAuthorize = async () => {
        if (fault === 'consumed-reservation') n.c.reservation.consumed = true;
        if (fault === 'missing-reservation') n.c.reservation = null;
        if (fault === 'revoked') n.c.revoked = true;
        if (fault === 'evm-busy') n.runtime.ingressSendState = Object.freeze({ ...n.runtime.ingressSendState, busy: true });
        if (fault === 'evm-uncertain') n.runtime.ingressSendState = Object.freeze({ ...n.runtime.ingressSendState, uncertain: true });
      };
      await assert.rejects(n.payout(), /CLAIM_BITCOIN_RESERVATION_CONSUMED|CLAIM_RESERVATION_NOT_INCLUDED|TEST_REVOKED_NATIVE_GID|CLAIM_BITCOIN_EVM_FENCE_REQUIRED/);
      assert.equal(n.c.sends, 0); assert.equal(n.c.original.broadcastAttempts, 0);
      assert.equal(n.c.authorizeCalls, fault.startsWith('evm-') ? 0 : 1);
      assert.throws(() => consumeNativeClaimBitcoinPayoutSend(n.c.token, n.prepared, n.c.signed), /SEND_PERMISSION_REQUIRED/);
      await assert.rejects(authorizeNativeClaimBitcoinPayoutSend(n.c.token, n.prepared, n.c.signed), /PRIVATE_SEND_TOKEN_REQUIRED/);
    } finally { await n.close(); }
  });
});

test('BTC private send token rejects counterfeit, cross-runtime and premature consumption without minting public authority', async () => {
  const counterfeit = Object.freeze({ profile: 'CLAIM_BITCOIN_PAYOUT_ORIGINAL_FINAL_SEND_V1' });
  for (const token of [{}, counterfeit, Object.create(null), null]) {
    assert.throws(() => assertNativeClaimBitcoinPayoutSendToken(token, {}, 'redeem'), /PRIVATE_SEND_TOKEN_REQUIRED/);
    await assert.rejects(authorizeNativeClaimBitcoinPayoutSend(token, {}, {}), /PRIVATE_SEND_TOKEN_REQUIRED/);
    assert.throws(() => consumeNativeClaimBitcoinPayoutSend(token, {}, {}), /SEND_PERMISSION_REQUIRED/);
  }
  const n = await bitcoinFixture();
  try {
    n.c.beforeAuthorize = async () => {
      assert.throws(() => consumeNativeClaimBitcoinPayoutSend(n.c.token, n.prepared, n.c.signed), /SEND_PERMISSION_REQUIRED/);
      assert.throws(() => assertNativeClaimBitcoinPayoutSendToken({ ...n.c.token }, n.native, 'redeem'), /PRIVATE_SEND_TOKEN_REQUIRED/);
    };
    await n.payout(); assert.equal(n.c.sends, 1);
  } finally { await n.close(); }
});

test('BTC lost send reply stays UNKNOWN across controller reopen and permits observation only, never re-sign or resend', async t => {
  for (const kind of ['1', '2']) await t.test(kind === '1' ? 'redeem' : 'refund', async () => {
    const n = await bitcoinFixture(kind);
    try {
      n.c.loseReply = true;
      await assert.rejects(n.payout(), /TEST_LOST_BITCOIN_REPLY/);
      assert.equal((await n.retained()).status, 'UNKNOWN'); assert.equal(n.c.original.broadcastAttempts, 1);
      await n.f.reopen();
      assert.equal((await n.payout()).status, 'UNKNOWN');
      assert.equal((await n.payout()).status, 'UNKNOWN');
      assert.equal(n.c.transferCalls, 1); assert.equal(n.c.syntheticSigningSteps, 1); assert.equal(n.c.authorizeCalls, 1); assert.equal(n.c.sends, 1);
      assert.equal(n.c.original.broadcastAttempts, 1); assert.ok(n.c.events.filter(event => event === 'observe-original').length >= 2);
      assert.equal((await n.retained()).native.binding.request.nativeId, n.nativeId);
    } finally { await n.close(); }
  });
});

test('BTC fresh V4 original validation, native and current awaits spend one non-resetting monotonic budget', async t => {
  for (const total of [29999, 30000]) await t.test(String(total) + ' milliseconds from original validation start', async () => {
    const n = await bitcoinFixture(); let now = 100000;
    const clock = t.mock.method(performance, 'now', () => now);
    try {
      n.c.authorizationHook = async () => { await Promise.resolve(); now += 10000; };
      n.control.finalAuditHook = async result => { if(result===n.c.authorization){await Promise.resolve();now+=total;} };
      n.c.nativeHook = async () => { await Promise.resolve(); now += 10000; };
      let advanced = false;
      n.c.currentHook = async () => { if (!advanced) { advanced = true; await Promise.resolve(); now += total - 20000; } };
      if (total === 29999) await n.payout();
      else await assert.rejects(n.payout(), /CLAIM_BITCOIN_FINAL_AUDIT_TOO_OLD/);
      assert.equal(now, 100000 + 2*total); assert.equal(n.c.authorizeCalls, 1); assert.equal(n.c.sends, total === 29999 ? 1 : 0);
      assert.equal(n.c.original.broadcastAttempts, total === 29999 ? 1 : 0);
    } finally { clock.mock.restore(); await n.close(); }
  });
});
