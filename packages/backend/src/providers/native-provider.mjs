/** Owned flat provider bootstrap. One dedicated synthetic provider key; the
 * actual owned adapter alone holds native source custody. No caller signer,
 * verifier, state/health reader, RPC, key import, or proof backend is accepted.
 * Vault and the common trusted OS retain their durability/rollback assumptions.
 */
import assert from 'node:assert/strict';
import { lstat, realpath } from 'node:fs/promises';
import { isAbsolute, join, relative, resolve, sep } from 'node:path';
import { Vault } from '@lianum/engine/crypto/vault';
import { freshKey, signature } from '@lianum/engine/notes/private-note-encoding';
import { assertLocalEvm } from '../chains/evm/runtime/local-evm-ownership.mjs';
import { assertOwnedNativeRecipientProcess } from '../execution/native/recipients/native-recipient-process.mjs';
import { nativeTransferActionCommitment } from '@lianum/engine/execution/native/dispatch/native-capsules';
import { nativeAdmissionChainDomain, nativeAdmissionRuleRoot, nativeProviderIdentity,
  nativeDeliveryRiskCommitment, nativeDispatchStatementFrame, NATIVE_ADMISSION_LOSS_CLAUSE }
  from '@lianum/engine/execution/native/dispatch/native-admission';
import { nativeFixtureEndpointCommitment } from '../evidence/native-quorum-observer.mjs';
import { nativeQuorumRegistryCommitment, createNativeQuorumHostVerifier }
  from '@lianum/engine/evidence/native-quorum';
import { assertOwnedFlatSystem } from '../operations/deployments/system/deploy-system.mjs';
import { assertOwnedFlatOperatorQuorum } from '../operations/operators/claims/native-operators.mjs';
import { createFlatSystemStateReader } from '../execution/account/reconciliation/flat-system-state.mjs';
import { exactRecord, fixedArray, bytes32, canonicalField, validateStruct, FIELD_MODULUS }
  from '@lianum/components/encoding/commitments';
import { cloneInput, frozenInput, inputUint } from "@lianum/components/plain-input";
import { assertOwnedBitcoinRuntime } from '../chains/bitcoin/runtime/owned-bitcoin-runtime.mjs';
import { assertOwnedSolanaRuntime } from '../chains/solana/runtime/owned-solana-runtime.mjs';
import { nativeRuleCommitment, nativeCustodyCommitment } from '@lianum/engine/native/native-receipt-binding';
import { createNativeDispatchGate, createNativeDispatchJournal, normalizeNativeDispatchBinding }
  from '../chains/shared/dispatch/native-dispatch-gate.mjs';
import { createPinnedVerifier } from '@lianum/proofs/verification';
import { loadPinned, resourceModuleURL } from '@lianum/proofs/tooling/tooling';

export const OWNED_FLAT_NATIVE_PROVIDER_PROFILE = 'OWNED_SYNTHETIC_FLAT_NATIVE_PROVIDER_V1';
const ownedProviders = new WeakMap(), originalSolanaSplSourcesV1 = new WeakMap();
/** Only a live ORIGINAL provider with its verified OBSERVED journal can mint
 * this one-use source. No supplied wire, amount, callback or metadata is accepted. */
export async function captureOwnedFlatSolanaSourceForSplV1(provider) {
  assert.equal(arguments.length,1,'SPL_SOURCE_CAPTURE_NO_OPTIONS');
  const original=ownedProviders.get(provider);assert.ok(original&&original.family==='2','SPL_SOURCE_ORIGINAL_SOL_PROVIDER');
  original.assertLive();return original.captureSolanaSplSource();
}
export async function consumeOwnedFlatSolanaSourceForSplV1(token, nativeRuntime) {
  assert.equal(arguments.length,2,'SPL_SOURCE_CONSUME_NO_OPTIONS');const original=originalSolanaSplSourcesV1.get(token);
  assert.ok(original&&!original.consumed,'SPL_SOURCE_ORIGINAL_TOKEN_REQUIRED');
  original.consumed=true;assert.equal(original.nativeRuntime,nativeRuntime,'SPL_SOURCE_ORIGINAL_RUNTIME_BINDING');await original.assertCurrent();return original.value;
}
export function assertOwnedFlatNativeProvider(provider, expected) {
  const retained = ownedProviders.get(provider);
  assert.ok(retained, 'FLAT_PROVIDER_OWNED_CAPABILITY'); retained.assertLive();
  for (const [name, value] of Object.entries(expected)) {
    assert.ok(['runtime', 'system', 'poolIndex', 'nativeRuntime', 'operatorQuorum', 'family', 'recipientIndex'].includes(name),
      'FLAT_PROVIDER_EXPECTED_BINDING');
    assert.equal(retained[name], value, 'FLAT_PROVIDER_OWNED_BINDING');
  }
  return provider;
}
export function ownedFlatNativeProviderReview(provider,expected){assertOwnedFlatNativeProvider(provider,expected);return ownedProviders.get(provider).manualReview();}
const SCHEMA = 'OWNED_FLAT_NATIVE_PROVIDER_CUSTODY_V1';
const TERMS = ['scope', 'policy', 'asset', 'amount', 'executionFrom', 'executionUntil', 'settleBefore'];
const TEMPLATE = ['chainDomain', 'signerIdentity', 'sourceCommitment', 'destinationCommitment', 'amount',
  'custodyKind', 'custodyCommitment', 'executionFrom', 'executionUntil', 'settleBefore'];
const QUOTE = ['scope', 'policy', 'asset', 'hubDomain', 'registryCommitment', 'action', 'payoutCommitment', 'deliveryRiskSalt'];
const copy = cloneInput, freeze = frozenInput;
const equal = (left, right) => assert.deepEqual(left, right, 'FLAT_PROVIDER_CHANGED_BINDING');
function index(value) {
  assert.ok(Number.isSafeInteger(value) && !Object.is(value, -0) && value >= 0 && value < 2, 'FLAT_PROVIDER_INDEX');
  return value;
}
function bare(value, bytes = 32) {
  assert.equal(typeof value, 'string'); assert.equal(value.length, 2 + bytes * 2);
  assert.match(value, /^0x[0-9a-f]+$/); return value.slice(2);
}

// The directory is already private and belongs to this exact owned EVM run.
// No alternate location, creation fallback, existing-vault reset or symlink is
// accepted. The trusted local filesystem/OS remains an explicit assumption.
async function privateDirectory(runtime, directory) {
  assert.ok(typeof directory === 'string' && isAbsolute(directory) && !directory.includes('\0'), 'FLAT_PROVIDER_DIRECTORY');
  assert.equal(resolve(directory), directory, 'FLAT_PROVIDER_DIRECTORY_CANONICAL');
  const root = runtime.metadata.scratchDirectory;
  assert.ok(isAbsolute(root) && resolve(root) === root, 'FLAT_PROVIDER_OWNED_SCRATCH');
  const suffix = relative(root, directory);
  assert.ok(suffix === '' || (!suffix.startsWith('..' + sep) && suffix !== '..' && !isAbsolute(suffix)), 'FLAT_PROVIDER_OWNED_SCRATCH');
  const paths = [root];
  if (suffix) for (const part of suffix.split(sep)) paths.push(join(paths.at(-1), part));
  for (const path of paths) {
    assert.equal(await realpath(path), path, 'FLAT_PROVIDER_DIRECTORY_SYMLINK');
    const stat = await lstat(path);
    assert.ok(stat.isDirectory() && !stat.isSymbolicLink() && (stat.mode & 0o777) === 0o700, 'FLAT_PROVIDER_PRIVATE_DIRECTORY');
    if (typeof process.getuid === 'function') assert.equal(stat.uid, process.getuid(), 'FLAT_PROVIDER_DIRECTORY_OWNER');
  }
  return directory;
}

// Official locally pinned Poseidon2; a backend exists only during one gate
// operation. skipSrsInit avoids any implicit SRS download for host hashing.
async function withPinnedHash(work) {
  const helpers = await import(resourceModuleURL), toolchain = helpers.verifyToolchain();
  assert.equal(toolchain.barretenberg, '5.2.0', 'FLAT_PROVIDER_HASH_VERSION');
  const bb = await loadPinned('@aztec/bb.js'); let backend;
  try {
    backend = await bb.Barretenberg.new({ backend: bb.BackendType.Wasm, threads: 1,
      skipSrsInit: true, memory: { initial: 37, maximum: 32768 } });
    return await work(async fields => {
      assert.ok(Array.isArray(fields) && fields.length > 0 && fields.length <= 137, 'FLAT_PROVIDER_HASH_TUPLE');
      const inputs = fields.map(value => {
        assert.ok(typeof value === 'bigint' && value >= 0n && value < FIELD_MODULUS, 'FLAT_PROVIDER_HASH_FIELD');
        return Buffer.from(value.toString(16).padStart(64, '0'), 'hex');
      });
      const result = Buffer.from((await backend.poseidon2Hash({ inputs })).hash).toString('hex');
      canonicalField(result); return result;
    });
  } finally { await backend?.destroy(); }
}

/** Explicit new custody only. The recipient must actually accept the original
 * invoice before bindQuote; the clause string by itself is never acceptance.
 */
export async function createOwnedFlatNativeProvider(input) {
  exactRecord(input, ['runtime', 'system', 'poolIndex', 'nativeRuntime', 'operatorQuorum', 'rule', 'rulePath',
    'recipientIndex', 'terms', 'acceptedLossClause', 'directory', 'password']);
  const { runtime, system, nativeRuntime, operatorQuorum } = input;
  const poolIndex = index(input.poolIndex), recipientIndex = index(input.recipientIndex);
  const terms = copy(input.terms), rule = copy(input.rule), rulePath = copy(input.rulePath);
  const directory = input.directory;
  let password = input.password;
  exactRecord(terms, TERMS); for (const name of ['scope', 'policy', 'asset']) bytes32(terms[name], true);
  assert.ok(inputUint(terms.amount, 128) > 0n, 'FLAT_PROVIDER_AMOUNT');
  assert.ok(inputUint(terms.executionFrom) < inputUint(terms.executionUntil)
    && inputUint(terms.executionUntil) <= inputUint(terms.settleBefore), 'FLAT_PROVIDER_WINDOW');
  assert.equal(input.acceptedLossClause, NATIVE_ADMISSION_LOSS_CLAUSE, 'FLAT_PROVIDER_EXPLICIT_LOSS_ACCEPTANCE');
  assert.ok(typeof password === 'string' && password.length > 0 && Buffer.byteLength(password) <= 1024, 'FLAT_PROVIDER_PASSWORD');
  nativeRuleCommitment(rule);
  assert.ok(['1', '2'].includes(rule.family), 'FLAT_PROVIDER_NATIVE_FAMILY');
  const assertNative = rule.family === '1' ? assertOwnedBitcoinRuntime : assertOwnedSolanaRuntime;
  assertOwnedFlatSystem(runtime, system); assertNative(nativeRuntime);
  const quorumBinding = { runtime, system, nativeRuntime, family: rule.family };
  assertOwnedFlatOperatorQuorum(operatorQuorum, quorumBinding);
  assert.ok(Object.isFrozen(nativeRuntime), 'FLAT_PROVIDER_IMMUTABLE_RUNTIME');
  const pool = system.pools[poolIndex], domain = copy(validateStruct('domain', pool.domain));
  for (const name of ['scope', 'policy', 'asset']) assert.equal(terms[name], domain[name], 'FLAT_PROVIDER_POOL_TERMS');
  equal([domain.scope, domain.policy, domain.asset], [bare(pool.scope), bare(pool.policy), bare(pool.assetIdentity)]);
  assert.equal(domain.hubDomain, bare(system.hubDomain), 'FLAT_PROVIDER_HUB');
  assert.equal(domain.ledgerNamespace, domain.hubDomain, 'FLAT_PROVIDER_INITIAL_NAMESPACE');
  assert.equal(domain.registryCommitment, bare(system.registryCommitment), 'FLAT_PROVIDER_REGISTRY');
  assert.equal(domain.verifierSetCommitment, bare(system.verifierSetCommitment), 'FLAT_PROVIDER_VERIFIERS');
  const registry = copy(system.registry);
  assert.equal(nativeQuorumRegistryCommitment(registry), domain.registryCommitment, 'FLAT_PROVIDER_REGISTRY');
  createNativeQuorumHostVerifier({ registry, expectedRegistryCommitment: domain.registryCommitment });
  exactRecord(rulePath, ['index', 'siblings']); inputUint(rulePath.index, 8, 7n);
  fixedArray(rulePath.siblings, 3); rulePath.siblings.forEach(value => bytes32(value));
  assert.equal(nativeAdmissionRuleRoot(rule, rulePath), registry.rulesRoot, 'FLAT_PROVIDER_RULE_MEMBERSHIP');
  const nativeAdapter = nativeRuntime.adapter({ asset: rule.asset, recipientIndex });
  assert.ok(Object.isFrozen(nativeAdapter), 'FLAT_PROVIDER_IMMUTABLE_ADAPTER');
  exactRecord(nativeAdapter, ['binding', 'transfer', 'assertPrepared', 'observe']);
  const native = copy(nativeAdapter.binding);
  exactRecord(native, ['family', 'genesis', 'asset', 'sourceEndpoint', 'destinationEndpoint', 'changeEndpoint']);
  for (const name of ['family', 'genesis', 'asset']) assert.equal(native[name], rule[name], 'FLAT_PROVIDER_NATIVE_DOMAIN');
  assert.equal(native.genesis, rule.family === '1' ? nativeRuntime.genesis : bare(nativeRuntime.genesisHex), 'FLAT_PROVIDER_NATIVE_GENESIS');
  assert.ok(inputUint(terms.amount, 128) <= (rule.family === '1' ? 1_000_000_000n : BigInt(Number.MAX_SAFE_INTEGER)), 'FLAT_PROVIDER_NATIVE_AMOUNT');
  const endpoint = rawHex => nativeFixtureEndpointCommitment({ family: rule.family === '1' ? 'BTC' : 'SOL',
    genesis: rule.genesis, asset: rule.asset, rawHex });
  const sourceCommitment = endpoint(native.sourceEndpoint), destinationCommitment = endpoint(native.destinationEndpoint);
  assert.notEqual(sourceCommitment, destinationCommitment, 'FLAT_PROVIDER_SELF_PAYMENT');
  if (rule.family === '1') { endpoint(native.changeEndpoint); assert.notEqual(native.changeEndpoint, native.destinationEndpoint); }
  else assert.equal(native.changeEndpoint, null, 'FLAT_PROVIDER_SOL_CHANGE_PADDING');
  const bootstrap = freeze({ profile: OWNED_FLAT_NATIVE_PROVIDER_PROFILE, pool: bare(pool.address, 20),
    poolIndex, recipientIndex, domain, registry, rule, rulePath, native, terms,
    acceptedLossClause: input.acceptedLossClause, chainDomain: nativeAdmissionChainDomain(rule),
    evidencePolicy: nativeRuleCommitment(rule), sourceCommitment, destinationCommitment,
    custodyCommitment: nativeCustodyCommitment({ family: rule.family, genesis: rule.genesis, asset: rule.asset,
      sourceCommitment, destinationCommitment }) });
  await assertLocalEvm(runtime); await privateDirectory(runtime, directory);
  const stateReader = await createFlatSystemStateReader({ runtime, system, poolIndex });
  const initialView = await stateReader.read();
  assert.equal(initialView.domainCommitment, bare(pool.domainCommitment), 'FLAT_PROVIDER_CURRENT_DOMAIN');
  await stateReader.assertCurrent(initialView);
  const vault = new Vault(join(directory, 'native-provider.vault'));
  let key = freshKey(), record, busy = false, closed = false, poisoned = false;
  const providerKey = freeze({ x: key.x.toString('hex'), y: key.y.toString('hex') });
  const live = () => assert.ok(!closed && !poisoned, 'FLAT_PROVIDER_CLOSED_OR_POISONED');
  async function unchanged() {
    live();
    try { await privateDirectory(runtime, directory); equal(await vault.read(password), record); }
    catch (cause) { poisoned = true; throw new Error('FLAT_PROVIDER_CUSTODY_UNAVAILABLE_OR_CHANGED', { cause }); }
  }
  async function save(data) {
    await unchanged();
    try {
      const next = await vault.update(password, record.revision, () => copy(data));
      equal(await vault.read(password), next); record = next;
    } catch (cause) { poisoned = true; throw new Error('FLAT_PROVIDER_DURABLE_WRITE_UNCERTAIN', { cause }); }
  }
  try {
    record = await vault.create({ schema: SCHEMA, bootstrap, providerKey,
      privateKeyPem: key.privateKey.export({ type: 'pkcs8', format: 'pem' }), quote: null,
      dispatch: null, providerSigning: null, splSource: null }, password);
    await unchanged();
  } catch (error) { key = password = record = undefined; throw error; }
  const actionTemplate = freeze({ chainDomain: bootstrap.chainDomain, signerIdentity: nativeProviderIdentity(providerKey),
    sourceCommitment, destinationCommitment, amount: terms.amount, custodyKind: 1,
    custodyCommitment: bootstrap.custodyCommitment,
    ...Object.fromEntries(['executionFrom', 'executionUntil', 'settleBefore'].map(name => [name, terms[name]])) });
  const bindingFor = quote => normalizeNativeDispatchBinding({ domain, pool: bootstrap.pool, registry, rule, rulePath,
    providerKey, native, quote: Object.fromEntries(['action', 'payoutCommitment', 'deliveryRiskSalt'].map(name => [name, quote[name]])),
    acceptedLossClause: bootstrap.acceptedLossClause });
  function checkedQuote(raw) {
    const quote = copy(raw); exactRecord(quote, QUOTE);
    for (const name of ['scope', 'policy', 'asset', 'hubDomain', 'registryCommitment'])
      assert.equal(quote[name], domain[name], 'FLAT_PROVIDER_QUOTE_DOMAIN');
    nativeTransferActionCommitment(quote.action); bytes32(quote.payoutCommitment, true); bytes32(quote.deliveryRiskSalt, true);
    equal(Object.fromEntries(TEMPLATE.map(name => [name, quote.action[name]])), actionTemplate);
    assert.equal(quote.action.deliveryRiskCommitment, nativeDeliveryRiskCommitment({ clause: bootstrap.acceptedLossClause,
      hubDomain: domain.hubDomain, registryCommitment: domain.registryCommitment, chainDomain: actionTemplate.chainDomain,
      sourceCommitment, destinationCommitment, amount: terms.amount, scope: domain.scope, policy: domain.policy,
      asset: domain.asset, payoutCommitment: quote.payoutCommitment, settleBefore: terms.settleBefore,
      salt: quote.deliveryRiskSalt }), 'FLAT_PROVIDER_QUOTE_RISK');
    bindingFor(quote); return quote;
  }
  const store = Object.freeze({ async load() { await unchanged(); return copy(record.data.dispatch); },
    async commit(request) {
      const next = copy(request); exactRecord(next, ['expectedRevision', 'nextState']); await unchanged();
      const previous = record.data.dispatch;
      assert.equal(next.expectedRevision, previous.revision, 'FLAT_PROVIDER_DISPATCH_CAS');
      const revision = inputUint(previous.revision) + 1n; inputUint(revision.toString());
      const dispatch = { revision: revision.toString(), state: next.nextState };
      await save({ ...record.data, dispatch }); return copy(dispatch);
    } });
  const healthReader = Object.freeze({ async read(request) {
    exactRecord(request, ['pool', 'domainCommitment']);
    assert.equal(request.pool, bootstrap.pool); assert.equal(request.domainCommitment, bare(pool.domainCommitment));
    assertOwnedFlatOperatorQuorum(operatorQuorum, quorumBinding);
    const permit = await operatorQuorum.health({ poolIndex });
    return copy({ message: permit.message, indexes: permit.indexes, signatures: permit.signatures });
  } });
  const providerSigner = Object.freeze({ publicKey: providerKey, async signDispatch(raw) {
    const statement = copy(raw); nativeDispatchStatementFrame(statement); await unchanged();
    const journal = record.data.dispatch.state.journal;
    assert.ok(journal?.phase === 'NATIVE_SIGNED' && journal.signed, 'FLAT_PROVIDER_NATIVE_JOURNAL_REQUIRED');
    const descriptor = journal.intent.readinessOpening.descriptor;
    equal(statement, { hubDomain: domain.hubDomain, registryCommitment: domain.registryCommitment,
      readyStatement: journal.intent.readyStatement, localCommitment: descriptor.localCommitment,
      dispatchId: descriptor.dispatchId, actionCommitment: descriptor.actionCommitment,
      globalEffectId: journal.signed.globalEffectId, deliveryRiskCommitment: record.data.quote.action.deliveryRiskCommitment,
      signedAt: journal.signedAt });
    if (record.data.providerSigning !== null) {
      equal(record.data.providerSigning.statement, statement);
      assert.ok(record.data.providerSigning.signature !== null, 'FLAT_PROVIDER_SIGNING_UNCERTAIN_NO_RETRY');
      return record.data.providerSigning.signature;
    }
    // Claim this exact H4 frame durably before sole SHA256/ECDSA key use. An
    // uncertain intent/signature write is never permission to sign again.
    await save({ ...record.data, providerSigning: { statement, signature: null } });
    const signed = signature(key, nativeDispatchStatementFrame(statement)).toString('hex');
    await save({ ...record.data, providerSigning: { statement, signature: signed } }); return signed;
  } });
  async function serial(work) {
    live(); assert.ok(!busy, 'FLAT_PROVIDER_BUSY'); busy = true;
    try { await unchanged(); assertOwnedFlatSystem(runtime, system); assertNative(nativeRuntime);
      assertOwnedFlatOperatorQuorum(operatorQuorum, quorumBinding); return await work(); }
    finally { busy = false; }
  }
  async function operation(method, request) {
    return serial(async () => {
      assert.ok(record.data.quote && record.data.dispatch, 'FLAT_PROVIDER_QUOTE_REQUIRED');
      let verifier, gate;
      try {
        verifier = await createPinnedVerifier('dispatch');
        return await withPinnedHash(async hashFields => {
          gate = await createNativeDispatchGate({ binding: bindingFor(record.data.quote), hashFields, verifier,
            providerSigner, nativeAdapter, stateReader, healthReader, store });
          try { return method === 'execute' ? await gate.execute(request) : await gate.reconcile(); }
          finally { gate.close(); gate = undefined; }
        });
      } finally { try { gate?.close(); } finally { await verifier?.dispose(); } }
    });
  }
  const provider = Object.create(null);
  Object.defineProperties(provider, {
    offer: { value() { live(); return freeze(copy({ providerKey, signerIdentity: actionTemplate.signerIdentity,
      actionTemplate, evidencePolicy: bootstrap.evidencePolicy, acceptedLossClause: bootstrap.acceptedLossClause })); } },
    bindQuote: { value(request) {
      exactRecord(request, ['recipientCustody']); assertOwnedNativeRecipientProcess(request.recipientCustody);
      const recipientCustody = request.recipientCustody;
      return serial(async () => {
        const quote = checkedQuote(await recipientCustody.acceptedQuote());
        if (record.data.quote !== null) equal(record.data.quote, quote);
        else {
          assert.equal(record.data.dispatch, null, 'FLAT_PROVIDER_QUOTE_REBOUND');
          await save({ ...record.data, quote,
            dispatch: { revision: '0', state: createNativeDispatchJournal(bindingFor(quote)) } });
        }
        return freeze({ bound: true, payoutCommitment: quote.payoutCommitment });
      });
    } },
    execute: { value(request) {
      const ownedRequest = copy(request);
      exactRecord(ownedRequest, ['dependencyProof', 'readyProof', 'readinessOpening', 'action', 'deliveryRiskSalt', 'receiptSpendSecret']);
      return operation('execute', ownedRequest);
    } },
    reconcile: { value() { assert.equal(arguments.length, 0, 'FLAT_PROVIDER_RECONCILE_FIELDS'); return operation('reconcile'); } },
    report: { value() { return freeze({ profile: OWNED_FLAT_NATIVE_PROVIDER_PROFILE, closed, persistenceUncertain: poisoned,
      quoteBound: Boolean(record?.data.quote), phase: record?.data.dispatch?.state.journal?.phase ?? (record?.data.quote ? 'BOUND' : 'OFFERED'),
      providerSigningStarted: Boolean(record?.data.providerSigning),
      assurance: 'COMMON_TRUSTED_HOST_SYNTHETIC_CUSTODY_NOT_INDEPENDENT_OPERATORS' }); } },
    close: { value() { assert.ok(!busy, 'FLAT_PROVIDER_BUSY'); closed = true;
      // Drop references only: JavaScript/KeyObject memory is not strongly zeroized.
      key = password = record = undefined; return freeze({ closed: true }); } },
    toJSON: { value() { throw new Error('FLAT_PROVIDER_NOT_SERIALIZABLE'); } },
  });
  ownedProviders.set(provider, { runtime, system, poolIndex, nativeRuntime, operatorQuorum,
    family: rule.family, recipientIndex, assertLive: live,
    captureSolanaSplSource(){return serial(async()=>{
      assert.equal(rule.family,'2','SPL_SOURCE_SOL_ONLY');
      const {assertOwnedSolanaSplGraphSourceV1}=await import('../chains/solana/runtime/owned-solana-runtime.mjs');
      assertOwnedSolanaSplGraphSourceV1(nativeRuntime);
      assert.equal(terms.amount,'10000000','SPL_SOURCE_FIXED_ORIGINAL_INPUT');
      assert.equal(recipientIndex,1,'SPL_SOURCE_FIXED_ORIGINAL_RECIPIENT');
      assert.equal(record.data.splSource,null,'SPL_SOURCE_ALREADY_RESERVED_NO_REPLACEMENT');
      const journal=record.data.dispatch?.state.journal;
      assert.ok(journal&&journal.phase==='OBSERVED'&&journal.signed&&journal.observation,'SPL_SOURCE_ORIGINAL_OBSERVED_REQUIRED');
      assert.equal(journal.observation.status,'observed');assert.equal(journal.observation.nativeId,journal.signed.nativeId);
      assert.equal(journal.observation.nativeWire,journal.signed.nativeWire);
      const signed=freeze(copy(journal.signed)),dispatch=freeze(copy(record.data.dispatch));
      const observation=copy(await nativeAdapter.observe({nativeId:signed.nativeId}));
      exactRecord(observation,['status','nativeId','nativeWire']);assert.equal(observation.status,'observed');
      assert.equal(observation.nativeId,signed.nativeId);assert.equal(observation.nativeWire,signed.nativeWire);
      const current=await stateReader.read();await stateReader.assertCurrent(current);await unchanged();
      equal(record.data.dispatch,dispatch,'SPL_SOURCE_ORIGINAL_DISPATCH_CHANGED');
      const retained={schema:'ORIGINAL_FLAT_SOLANA_SOURCE_RESERVED_FOR_SPL_V1',nativeId:signed.nativeId,
        transactionSHA256:signed.transactionSHA256,amount:terms.amount,sourceEndpoint:native.sourceEndpoint,
        destinationEndpoint:native.destinationEndpoint,genesis:rule.genesis,asset:rule.asset,payoutCommitment:record.data.quote.payoutCommitment};
      // The encrypted original provider journal reserves this SOURCE before
      // the token exists. Failure/closure never permits replacement or retry.
      await save({...record.data,splSource:retained});
      const token=Object.freeze({profile:'ORIGINAL_FLAT_SOLANA_SOURCE_FOR_SPL_V1'}),began=performance.now();
      const value=freeze({...copy(retained),nativeWire:signed.nativeWire});
      originalSolanaSplSourcesV1.set(token,{nativeRuntime,value,consumed:false,async assertCurrent(){
        live();assertOwnedSolanaSplGraphSourceV1(nativeRuntime);assert.ok(performance.now()-began<30000,'SPL_SOURCE_ORIGINAL_30S_BUDGET');
        await unchanged();equal(record.data.splSource,retained,'SPL_SOURCE_RESERVATION_CHANGED');equal(record.data.dispatch,dispatch,'SPL_SOURCE_ORIGINAL_DISPATCH_CHANGED');
        const observed=copy(await nativeAdapter.observe({nativeId:signed.nativeId}));exactRecord(observed,['status','nativeId','nativeWire']);
        equal(observed,observation,'SPL_SOURCE_CANONICAL_OUTCOME_CHANGED');await unchanged();
        assert.ok(performance.now()-began<30000,'SPL_SOURCE_ORIGINAL_30S_BUDGET');
      }});return token;
    });},
    manualReview(){
      live();assert.ok(record.data.quote&&record.data.dispatch,'FLAT_PROVIDER_QUOTE_REQUIRED');
      return freeze({routeProfile:'REGISTERED_LOCAL_NATIVE_DELIVERY_V1',family:rule.family,chainId:null,genesis:rule.genesis,
        sourcePool:pool.address,sourceAssetIdentity:domain.asset,nativeAsset:rule.asset,solver:native.sourceEndpoint,recipient:native.destinationEndpoint,
        nativeAmount:terms.amount,executionFrom:terms.executionFrom,executionUntil:terms.executionUntil,settleBefore:terms.settleBefore,
        payoutCommitment:record.data.quote.payoutCommitment,deliveryRiskCommitment:record.data.quote.action.deliveryRiskCommitment,
        deliveryLossClause:bootstrap.acceptedLossClause,creditEligible:false,privateSpendableAtomic:null,publicNetwork:false});
    } });
  return Object.freeze(provider);
}
