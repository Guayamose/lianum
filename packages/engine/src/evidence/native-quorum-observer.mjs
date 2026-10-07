/** BOUNDED LOCAL FIXTURE ONLY. Four fresh secp256k1 keys belong to ONE operator.
 * This is neither an independent quorum nor a native consensus verifier. Only
 * exact owned BTC/SOL adapters and an exact owned deployed hub are accepted.
 * The observer receives one action and its R98/read opening, never A0, a graph,
 * terminal tags or receipt spending keys. Private keys and issued certificates
 * stay in an encrypted Vault. Its local filesystem/rollback assumptions apply.
 * EVM's explicitly fake fixture clock timestamps observations and permits.
 */
import { createHash, createPrivateKey, createPublicKey, generateKeyPairSync, sign, verify } from 'node:crypto';
import { Vault } from '../crypto/vault.mjs';
import { canonical } from '../crypto/privacy.mjs';
import { assertOwnedBitcoinRuntime } from '../chains/bitcoin/bitcoin-runtime.mjs';
import { assertOwnedSolanaRuntime, assertOwnedSolanaRecipientView, base58Decode } from '../chains/solana/solana-runtime.mjs';
import { assertLocalEvm } from '../execution/local/local-evm.mjs';
import { assertOwnedNativeSystem } from '../execution/native/dispatch/native-deployment.mjs';
import { readNativeSystemState } from '../execution/native/state/native-system-state.mjs';
import { fundedFrame } from '../execution/graph/funded-graph.mjs';
import { nativeTransferActionCommitment } from '../execution/native/dispatch/native-capsules.mjs';
import { NATIVE_EXECUTION_PROFILE, canonicalNativeEffectId, nativeReceiptReadOpening, nativeReceiptCommitment } from '../execution/native/state/native-receipt.mjs';
import { nativeAdmissionRulesTree, nativeAdmissionRuleCommitment, nativeAdmissionChainDomain,
  nativeAdmissionObservationToNoir, nativeReadyStatementDigest, nativeProviderIdentity,
  nativeDispatchStatementFrame, nativeDispatchStatementDigest, nativeAttestationStatementFrame } from '../execution/native/dispatch/native-admission.mjs';
import { NATIVE_QUORUM_PROFILE, normalizeNativeQuorumRegistry, nativeQuorumRegistryCommitment } from './native-quorum.mjs';
import { checkpointAuthorizationFrame, assertCheckpointAuthorizationValid, finalityHealthFrame,
  assertFinalityHealthValid, revocationFrame, assertRevocationAuthorizationValid, nativeHubSignatureToAbi } from './native-hub-messages.mjs';

export const LOCAL_NATIVE_OBSERVER_PROFILE = 'BOUNDED_LOCAL_ONE_OPERATOR_NATIVE_OBSERVER_V1';
export const LOCAL_NATIVE_OBSERVER_LIMITS = Object.freeze({ facts: 64, historyBlocks: 4096, historyTransactions: 8192, healthSeconds: 30 });
const CLASSIFICATION = 'LOCAL_FIXTURE_ONE_OPERATOR_FOUR_KEYS_NOT_INDEPENDENT_QUORUM_OR_CONSENSUS';
const PROFILE = Buffer.from(NATIVE_EXECUTION_PROFILE, 'ascii');
const ORDER = 0xfffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141n;
const bindings = new WeakMap();
const sha = value => createHash('sha256').update(value).digest('hex');
const frameHash = (tag, values) => sha(fundedFrame(tag, values));
const snapshot = value => JSON.parse(canonical(value));
const freeze = value => { if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); } return value; };
const need = (value, code) => { if (!value) throw new Error(code); };
const code = value => `NATIVE_OBSERVER_${value}`;
function exact(value, fields, label) {
  need(value && Object.getPrototypeOf(value) === Object.prototype, code(label));
  need(Reflect.ownKeys(value).length === fields.length && fields.every(key => Object.hasOwn(value, key)), code(label));
  need(fields.every(key => Object.hasOwn(Object.getOwnPropertyDescriptor(value, key), 'value')), code(label));
}
function optional(value, fields, label) {
  need(value && Object.getPrototypeOf(value) === Object.prototype, code(label));
  need(Reflect.ownKeys(value).every(key => fields.includes(key) && Object.hasOwn(Object.getOwnPropertyDescriptor(value, key), 'value')), code(label));
}
function bytes(value, length = 32) { need(typeof value === 'string' && new RegExp(`^[0-9a-f]{${length * 2}}$`).test(value), code('HEX')); return Buffer.from(value, 'hex'); }
function uint(value, width = 8) { need(typeof value === 'string' && /^(0|[1-9][0-9]*)$/.test(value) && value.length <= 39 && BigInt(value) < (1n << BigInt(width * 8)), code('UINT')); return Buffer.from(BigInt(value).toString(16).padStart(width * 2, '0'), 'hex'); }
const digestAt = (values, offset) => values.slice(offset, offset + 8).map(value => BigInt(value).toString(16).padStart(8, '0')).join('');
const bare = value => { need(typeof value === 'string' && /^0x[0-9a-f]{64}$/.test(value), code('PREFIXED_HASH')); return value.slice(2); };
const word = value => BigInt(value).toString(16).padStart(64, '0');
function publicPoint(key) { const jwk = createPublicKey(key).export({ format: 'jwk' }); return { x: Buffer.from(jwk.x, 'base64url').toString('hex'), y: Buffer.from(jwk.y, 'base64url').toString('hex') }; }
function lowSignature(key, message) { const sig = sign('sha256', message, { key, dsaEncoding: 'ieee-p1363' }); const s = BigInt('0x' + sig.subarray(32).toString('hex')); return sig.subarray(0, 32).toString('hex') + (s > ORDER / 2n ? ORDER - s : s).toString(16).padStart(64, '0'); }

/** H4 over tagged raw bytes. Endpoints are public keys/scripts, never addresses
 * encoded as ambiguous text. The same endpoint has the same source/dest hash. */
export function nativeFixtureEndpointCommitment(input) {
  exact(input, ['family', 'genesis', 'asset', 'rawHex'], 'ENDPOINT_FIELDS');
  need(['BTC', 'SOL'].includes(input.family), code('FAMILY'));
  bytes(input.rawHex, input.family === 'SOL' ? 32 : 22);
  if (input.family === 'BTC') need(/^0014[0-9a-f]{40}$/.test(input.rawHex), code('BTC_P2WPKH'));
  return frameHash('LIANUM/PAEG/native-endpoint/2', [PROFILE, Buffer.from(input.family), bytes(input.genesis), bytes(input.asset),
    Buffer.from(input.family === 'SOL' ? 'SOL_PUBLIC_KEY' : 'BTC_P2WPKH_SCRIPT'), bytes(input.rawHex, input.family === 'SOL' ? 32 : 22)]);
}
/** Kind 1 is fixed registered-recipient delivery. No private balance, key
 * possession by a remote user, or onward spending policy is asserted. */
export function nativeFixtureCustodyCommitment(input) {
  exact(input, ['chainDomain', 'sourceCommitment', 'destinationCommitment'], 'CUSTODY_FIELDS');
  return frameHash('LIANUM/PAEG/native-recipient-custody/2', [PROFILE, ...['chainDomain', 'sourceCommitment', 'destinationCommitment'].map(key => bytes(input[key]))]);
}
export function assertTrustedLocalNativeQuorumObserver(observer, runtime, system) {
  const binding = bindings.get(observer);
  need(binding && binding.runtime === runtime && binding.system === system, code('OWNED_BOUND_CAPABILITY'));
}
function solanaCapability(adapter) {
  try { assertOwnedSolanaRecipientView(adapter); } catch { assertOwnedSolanaRuntime(adapter); }
  need(Object.isFrozen(adapter), code('SOLANA_IMMUTABLE_CAPABILITY'));
}
function configuration(input) {
  exact(input, ['vaultPath', 'password', 'solana', 'bitcoin', 'rules', 'registryEpoch'], 'BOOTSTRAP_FIELDS');
  need(typeof input.password === 'string' && input.password.length >= 16, code('VAULT_PASSWORD'));
  need(Array.isArray(input.solana) && input.solana.length >= 1 && input.solana.length <= 2, code('SOLANA_VIEWS'));
  input.solana.forEach(solanaCapability); assertOwnedBitcoinRuntime(input.bitcoin);
  need(Object.isFrozen(input.bitcoin), code('BITCOIN_IMMUTABLE_CAPABILITY'));
  const rules = snapshot(input.rules), tree = nativeAdmissionRulesTree(rules);
  need(rules.length === 2 && new Set(rules.map(rule => rule.family)).size === 2 && rules.every(rule => ['1', '2'].includes(rule.family)), code('FIXED_BTC_SOL_RULES'));
  uint(input.registryEpoch);
  const solana = input.solana.map(view => ({ genesis: base58Decode(view.genesis, 32).toString('hex'), source: base58Decode(view.solver, 32).toString('hex'), recipient: base58Decode(view.recipient, 32).toString('hex') }));
  need(solana.every(row => row.genesis === solana[0].genesis && row.source === solana[0].source), code('SOLANA_DOMAIN'));
  need(new Set(solana.map(row => row.recipient)).size === solana.length, code('SOLANA_DUPLICATE_VIEW'));
  const bitcoin = { genesis: input.bitcoin.genesis, source: input.bitcoin.sourceScript, recipients: [...input.bitcoin.recipientScripts] };
  bytes(bitcoin.genesis); need(bitcoin.recipients.length === 2 && new Set(bitcoin.recipients).size === 2, code('BTC_RECIPIENTS'));
  for (const rule of rules) need(rule.genesis === (rule.family === '1' ? bitcoin.genesis : solana[0].genesis), code('RULE_GENESIS'));
  return { profile: LOCAL_NATIVE_OBSERVER_PROFILE, registryEpoch: input.registryEpoch, rules, rulesRoot: tree.root, solana, bitcoin };
}

/** Trusted fixture bootstrap only. Caller-selected signing keys, observed
 * facts, verifier callbacks and verification booleans are not supported. */
export async function bootstrapTrustedLocalNativeQuorumObserver(input) { return createObserver(input, false); }
/** Reopen the same encrypted observer only against the exact retained native
 * domains/endpoints. bindDeployment must still authenticate the original hub. */
export async function reopenTrustedLocalNativeQuorumObserver(input) { return createObserver(input, true); }
async function createObserver(input, reopening) {
  const config = configuration(input), solana = [...input.solana], bitcoin = input.bitcoin;
  const vault = new Vault(input.vaultPath), password = input.password;
  let saved;
  if (reopening) saved = await vault.read(password);
  else {
    const privateKeys = Array.from({ length: 4 }, () => generateKeyPairSync('ec', { namedCurve: 'secp256k1' }).privateKey.export({ type: 'pkcs8', format: 'der' }).toString('base64'));
    saved = await vault.create({ version: 1, config, privateKeys, deployment: null, facts: [], checkpoints: [], lastHealth: null, revocationRequests: [] }, password);
  }
  exact(saved.data, ['version', 'config', 'privateKeys', 'deployment', 'facts', 'checkpoints', 'lastHealth', 'revocationRequests'], 'VAULT_FIELDS');
  need(saved.data.version === 1 && canonical(saved.data.config) === canonical(config), code('VAULT_CONFIGURATION_CHANGED'));
  need(saved.data.privateKeys.length === 4 && saved.data.facts.length <= 64 && saved.data.checkpoints.length <= 64, code('VAULT_BOUNDS'));
  const keys = saved.data.privateKeys.map(value => createPrivateKey({ key: Buffer.from(value, 'base64'), format: 'der', type: 'pkcs8' }));
  const points = keys.map(publicPoint);
  normalizeNativeQuorumRegistry({ profile: NATIVE_QUORUM_PROFILE, hubDomain: '00'.repeat(32), registryEpoch: config.registryEpoch, rulesRoot: config.rulesRoot, keys: points });
  let state = saved.data, revision = saved.revision, runtime, system, registry, attesterAddresses, busy = false, poisoned = false;
  const rules = freeze(snapshot(config.rules));
  const ruleFor = family => { need(['BTC', 'SOL'].includes(family), code('FAMILY')); return rules.find(rule => rule.family === (family === 'BTC' ? '1' : '2')); };
  const commit = async next => {
    try { const result = await vault.update(password, revision, () => next); state = result.data; revision = result.revision; }
    catch (cause) { poisoned = true; throw new Error(code('DURABLE_WRITE_FAILED_REOPEN_REQUIRED'), { cause }); }
  };
  const serial = async work => {
    need(!busy && !poisoned, code(poisoned ? 'REOPEN_REQUIRED' : 'BUSY')); busy = true;
    try {
      const current = await vault.read(password);
      need(current.revision === revision && canonical(current.data) === canonical(state), code('VAULT_STATE_CHANGED'));
      return await work();
    } finally { busy = false; }
  };
  const bound = async () => { need(runtime && system, code('DEPLOYMENT_NOT_BOUND')); assertOwnedNativeSystem(runtime, system); await assertLocalEvm(runtime); };
  const sameHead = async header => { await runtime.assertCanonical(header); need((await runtime.block()).hash === header.hash, code('HUB_CHANGED_DURING_OBSERVATION')); };
  async function signFrame(messageBytes, header, abi = true) {
    const signatures = [0, 1, 2].map(index => lowSignature(keys[index], messageBytes));
    const result = { indexes: [0, 1, 2], signatures };
    if (abi) {
      const digest = sha(messageBytes), abiSignatures = [];
      for (let i = 0; i < 3; i++) {
        const signature = signatures[i], candidates = [];
        for (const v of ['27', '28']) {
          const recovered = await runtime.call({ to: '0x0000000000000000000000000000000000000001', data: `0x${digest}${word(v)}${signature}` }, header.number);
          if (/^0x[0-9a-f]{64}$/.test(recovered) && recovered.slice(-40) === attesterAddresses[i].slice(2)) candidates.push(v);
        }
        need(candidates.length === 1, code('EVM_RECOVERY_FAILED'));
        abiSignatures.push(nativeHubSignatureToAbi({ signerIndex: String(i), v: candidates[0], signature }));
      }
      result.abiSignatures = abiSignatures;
    }
    return result;
  }
  async function readHub(poolIndex = 0) {
    await bound(); const view = await readNativeSystemState(runtime, system, poolIndex);
    need(view.state.halt === '0', code('HUB_HALTED')); return view;
  }
  async function admittedHistory(view) {
    const start = BigInt(system.hub.receipt.blockNumber), stop = BigInt(view.header.number);
    need(stop >= start && stop - start < BigInt(LOCAL_NATIVE_OBSERVER_LIMITS.historyBlocks), code('HISTORY_BOUND'));
    const topic = await runtime.keccak('0x' + Buffer.from('ReceiptAdmitted(bytes32,bytes32,uint32,bytes32)').toString('hex'));
    const entries = []; let transactionCount = 0;
    for (let height = start; height <= stop; height++) {
      const header = await runtime.block('0x' + height.toString(16));
      need(Array.isArray(header.transactions), code('HISTORY_MISSING'));
      transactionCount += header.transactions.length; need(transactionCount <= LOCAL_NATIVE_OBSERVER_LIMITS.historyTransactions, code('HISTORY_BOUND'));
      for (const hash of header.transactions) {
        const receipt = await runtime.receipt(hash); need(receipt && Array.isArray(receipt.logs), code('HISTORY_MISSING'));
        need(receipt.blockHash === header.hash, code('HISTORY_INCOHERENT'));
        for (const log of receipt.logs) if (log.address?.toLowerCase() === system.hub.address && log.topics?.[0] === topic) {
          need(receipt.status === '0x1' && !log.removed && log.topics.length === 3 && /^0x[0-9a-f]{128}$/.test(log.data), code('ADMISSION_EVENT'));
          const gid = bare(log.topics[1]), commitment = bare(log.topics[2]), index = BigInt('0x' + log.data.slice(2, 66));
          need(index === BigInt(entries.length) && entries.length < 64, code('ADMISSION_EVENT_ORDER'));
          const fact = state.facts.find(fact => fact.gid === gid && fact.commitment === commitment);
          need(fact, code('UNKNOWN_ADMITTED_GID_OR_COMMITMENT'));
          entries.push({ gid, commitment });
        }
      }
      await runtime.assertCanonical(header);
    }
    need(entries.length === Number(view.state.receiptCount), code('HISTORY_INCOMPLETE'));
    for (let i = 0; i < entries.length; i++) need(view.commitments[i] === '0x' + entries[i].commitment, code('HISTORY_COMMITMENT_MISMATCH'));
    for (const fact of state.facts) {
      const admitted = await system.hub.call('admitted(bytes32)', ['0x' + fact.gid], view.header.number);
      need(BigInt(admitted) === (entries.some(row => row.gid === fact.gid) ? 1n : 0n), code('ADMISSION_MAP_MISMATCH'));
    }
    return entries;
  }
  function mapFact(family, recipientIndex, nativeId, fact, at, opening) {
    const rule = ruleFor(family), chainDomain = nativeAdmissionChainDomain(rule);
    need(Number.isSafeInteger(recipientIndex) && recipientIndex >= 0 && !Object.is(recipientIndex, -0), code('RECIPIENT_INDEX'));
    let genesis, source, destination, transactionId, effectIndex, blockId, blockHeight, amount, confirmations;
    if (family === 'SOL') {
      const endpoint = config.solana[recipientIndex]; need(endpoint, code('RECIPIENT_INDEX'));
      genesis = base58Decode(fact.genesis, 32).toString('hex'); source = base58Decode(fact.solver, 32).toString('hex'); destination = base58Decode(fact.recipient, 32).toString('hex');
      need(source === endpoint.source && destination === endpoint.recipient && fact.signature === nativeId, code('NATIVE_ENDPOINT_SUBSTITUTION'));
      transactionId = base58Decode(fact.signature, 64).toString('hex'); effectIndex = String(fact.instructionIndex);
      blockId = base58Decode(fact.blockhash, 32).toString('hex'); blockHeight = String(fact.blockHeight); amount = fact.lamports; confirmations = '0';
      need(fact.confirmationStatus === 'finalized' && fact.recipientDeltaLamports === amount, code('NATIVE_FINALITY_ADVERSE'));
    } else {
      need(recipientIndex < config.bitcoin.recipients.length, code('RECIPIENT_INDEX'));
      genesis = fact.genesis; source = fact.sourceScript; destination = fact.recipientScript;
      need(source === config.bitcoin.source && destination === config.bitcoin.recipients[recipientIndex] && fact.txid === nativeId, code('NATIVE_ENDPOINT_SUBSTITUTION'));
      transactionId = fact.txid; effectIndex = String(fact.vout); blockId = fact.blockhash; blockHeight = String(fact.blockHeight); amount = fact.amountSatoshi; confirmations = String(fact.confirmations);
    }
    need(fact.finalized === true && fact.success === true && BigInt(confirmations) >= BigInt(rule.minimumConfirmations), code('NATIVE_FINALITY_ADVERSE'));
    need(genesis === rule.genesis && effectIndex === '0', code('NATIVE_DOMAIN_SUBSTITUTION'));
    const effect = { chainDomain: { chain: family, genesis: rule.genesis, asset: rule.asset }, effectIdentity: { transactionId, effectIndex } };
    const gid = canonicalNativeEffectId(effect);
    const sourceCommitment = nativeFixtureEndpointCommitment({ family, genesis, asset: rule.asset, rawHex: source });
    const destinationCommitment = nativeFixtureEndpointCommitment({ family, genesis, asset: rule.asset, rawHex: destination });
    const custodyCommitment = nativeFixtureCustodyCommitment({ chainDomain, sourceCommitment, destinationCommitment });
    // A transparent hash of the exact observed effect, not a claimed chain state root.
    const stateCommitment = frameHash('LIANUM/PAEG/local-native-observed-effect/2', [PROFILE, bytes(chainDomain), bytes(gid), bytes(blockId), uint(blockHeight), bytes(fact.transactionSHA256), bytes(sourceCommitment), bytes(destinationCommitment), uint(amount, 16)]);
    const observation = { blockId, stateCommitment, blockHeight, observedAt: at, finalityKind: rule.finalityKind, confirmations,
      sourceCommitment, destinationCommitment, amount, custodyKind: '1', custodyCommitment, evidenceFrom: opening.validFrom, evidenceUntil: opening.validUntil };
    nativeAdmissionObservationToNoir(observation); return { effect, gid, observation };
  }
  async function observe(request, at) {
    const { family, recipientIndex, nativeId, opening } = request;
    let fact;
    if (family === 'SOL') {
      need(Number.isSafeInteger(recipientIndex) && solana[recipientIndex], code('RECIPIENT_INDEX'));
      solanaCapability(solana[recipientIndex]);
      fact = await solana[recipientIndex].observe(nativeId, { expectedLamports: request.action.amount, commitment: 'finalized', timeoutMs: 1000 });
    } else { need(family === 'BTC', code('FAMILY')); assertOwnedBitcoinRuntime(bitcoin); fact = await bitcoin.observe(nativeId); }
    return mapFact(family, recipientIndex, nativeId, fact, at, opening);
  }
  const adverseCodes = new Set(['NATIVE_OBSERVER_NATIVE_FINALITY_ADVERSE', 'NATIVE_OBSERVER_NATIVE_ENDPOINT_SUBSTITUTION', 'NATIVE_OBSERVER_NATIVE_DOMAIN_SUBSTITUTION', 'NATIVE_OBSERVER_CERTIFIED_FACT_CHANGED',
    'BITCOIN_BLOCK_NOT_CANONICAL', 'BITCOIN_OBSERVED_WIRE_MISMATCH', 'BITCOIN_PREVIOUS_OUTPUT_MISMATCH', 'BITCOIN_RECIPIENT_SCRIPT_CHANGED', 'BITCOIN_SOURCE_SCRIPT_CHANGED', 'SOLANA_OBSERVED_EXECUTION_FAILURE', 'SOLANA_BALANCE_DELTA_MISMATCH', 'SOLANA_SIGNATURE_INVALID']);
  async function scan(view) {
    await admittedHistory(view);
    const next = snapshot(state), at = BigInt(view.header.timestamp).toString(), pending = [];
    let unavailable;
    for (const fact of next.facts) {
      const isRevoked = BigInt(await system.hub.call('revoked(bytes32)', ['0x' + fact.gid], view.header.number));
      need(isRevoked === 0n || isRevoked === 1n, code('REVOCATION_MAP'));
      if (isRevoked === 1n) { fact.revoked = true; continue; }
      if (fact.revoked) throw new Error(code('REVOCATION_DISAPPEARED'));
      if (fact.adverse) { pending.push(fact); continue; }
      if (BigInt(at) >= BigInt(fact.request.opening.validUntil)) continue;
      try {
        const current = await observe(fact.request, at);
        need(current.gid === fact.gid && current.observation.stateCommitment === fact.observation.stateCommitment, code('CERTIFIED_FACT_CHANGED'));
        for (const name of ['sourceCommitment', 'destinationCommitment', 'amount', 'custodyCommitment']) need(current.observation[name] === fact.request.action[name], code('CERTIFIED_FACT_CHANGED'));
        fact.lastReobservedAt = at;
      } catch (error) {
        if (adverseCodes.has(error.message)) {
          fact.adverse = { code: error.message, reasonCommitment: frameHash('LIANUM/PAEG/local-native-adverse/2', [PROFILE, bytes(fact.gid), bytes(fact.commitment), Buffer.from(error.message)]) };
          pending.push(fact);
        } else unavailable ??= error;
      }
    }
    // Persist newly learned adverse facts even if a different RPC was unavailable.
    await commit(next); await sameHead(view.header);
    if (unavailable && pending.length === 0) throw new Error(code('FRESH_NATIVE_HISTORY_UNAVAILABLE'), { cause: unavailable });
    return { pending, at };
  }
  async function revocations(view, pending) {
    const requests = [], expiry = (BigInt(view.header.timestamp) + 30n).toString();
    const ordered = [...pending].sort((a, b) => a.gid.localeCompare(b.gid));
    for (let i = 0; i < ordered.length; i++) {
      const fact = ordered[i], message = { hubDomain: system.hubDomain, registryCommitment: system.registryCommitment,
        gid: '0x' + fact.gid, expectedSequence: (BigInt(view.state.revocationSequence) + BigInt(i)).toString(), reasonCommitment: '0x' + fact.adverse.reasonCommitment, authorizationExpiry: expiry };
      assertRevocationAuthorizationValid(message, { hubDomain: system.hubDomain, registryCommitment: system.registryCommitment, revocationSequence: message.expectedSequence, timestamp: BigInt(view.header.timestamp).toString() });
      requests.push({ message, ...await signFrame(revocationFrame(message), view.header) });
    }
    await sameHead(view.header); const next = snapshot(state); next.revocationRequests = requests; await commit(next);
    return freeze({ status: 'REVOCATION_REQUIRED', classification: CLASSIFICATION, requests });
  }
  const observer = {
    classification: CLASSIFICATION, clock: 'OWNED_EVM_FAKE_CLOCK', attesterKeys: freeze(snapshot(points)), rules, rulesRoot: config.rulesRoot, registryEpoch: config.registryEpoch,
    get registry() { need(registry, code('DEPLOYMENT_NOT_BOUND')); return registry; },
    bindDeployment(input) {
      exact(input, ['runtime', 'system'], 'BIND_FIELDS'); const proposedRuntime = input.runtime, proposedSystem = input.system;
      return serial(async () => {
        need(!runtime && !system, code('ALREADY_BOUND')); assertOwnedNativeSystem(proposedRuntime, proposedSystem); await assertLocalEvm(proposedRuntime);
        const expected = normalizeNativeQuorumRegistry({ profile: NATIVE_QUORUM_PROFILE, hubDomain: bare(proposedSystem.hubDomain), registryEpoch: config.registryEpoch, rulesRoot: config.rulesRoot, keys: points });
        need(canonical(expected) === canonical(proposedSystem.registry) && '0x' + nativeQuorumRegistryCommitment(expected) === proposedSystem.registryCommitment, code('DEPLOYED_REGISTRY_MISMATCH'));
        const header = await proposedRuntime.block();
        const deployment = { hub: proposedSystem.hub.address, hubDomain: proposedSystem.hubDomain, registryCommitment: proposedSystem.registryCommitment,
          genesis: proposedRuntime.metadata.evmGenesis, deploymentTransaction: proposedSystem.hub.receipt.transactionHash };
        if (state.deployment) need(canonical(state.deployment) === canonical(deployment), code('DEPLOYMENT_SUBSTITUTION'));
        const addresses = [];
        for (let index = 0; index < 4; index++) {
          const raw = await proposedSystem.hub.call('attester(uint8)', [index], header.number);
          need(/^0x[0-9a-f]{192}$/.test(raw) && raw.slice(2, 66) === points[index].x && raw.slice(66, 130) === points[index].y && /^0{24}[0-9a-f]{40}$/.test(raw.slice(130)), code('REGISTERED_ATTESTER_MISMATCH'));
          const expectedAddress = '0x' + (await proposedRuntime.keccak('0x' + points[index].x + points[index].y)).slice(-40);
          need(raw.slice(-40) === expectedAddress.slice(2), code('REGISTERED_ADDRESS_MISMATCH')); addresses.push(expectedAddress);
        }
        await proposedRuntime.assertCanonical(header);
        const next = snapshot(state); next.deployment = deployment; await commit(next);
        runtime = proposedRuntime; system = proposedSystem; registry = expected; attesterAddresses = addresses;
        bindings.set(observer, { runtime, system }); return freeze({ classification: CLASSIFICATION, registry, registryCommitment: system.registryCommitment });
      });
    },
    certify(input) {
      const request = snapshot(input);
      exact(request, ['family', 'recipientIndex', 'nativeId', 'action', 'opening', 'readyInputs', 'providerKey', 'dispatchSignedAt', 'dispatchSignature'], 'CERTIFY_FIELDS');
      return serial(async () => {
        const view = await readHub(), { pending, at } = await scan(view);
        need(pending.length === 0, code('REVOCATION_REQUIRED'));
        const rule = ruleFor(request.family), opening = nativeReceiptReadOpening(request.opening), action = request.action;
        const readyStatement = nativeReadyStatementDigest(request.readyInputs), actionCommitment = nativeTransferActionCommitment(action), ruleCommitment = nativeAdmissionRuleCommitment(rule);
        const current = await observe(request, at), { gid, effect, observation } = current;
        need(BigInt(opening.validFrom) <= BigInt(at) && BigInt(at) < BigInt(opening.validUntil) && BigInt(opening.validUntil) - BigInt(opening.validFrom) <= BigInt(rule.maximumEvidenceLifetime) && BigInt(opening.validUntil) <= BigInt(action.settleBefore), code('EVIDENCE_WINDOW'));
        for (const key of ['sourceCommitment', 'destinationCommitment', 'amount', 'custodyCommitment']) need(action[key] === observation[key], code('ACTION_NATIVE_MISMATCH'));
        need(action.custodyKind === 1 && action.chainDomain === nativeAdmissionChainDomain(rule), code('ACTION_DOMAIN'));
        const r = request.readyInputs;
        const expected = { hubDomain: registry.hubDomain, registryCommitment: nativeQuorumRegistryCommitment(registry), globalEffectId: gid,
          scope: digestAt(r, 0), policy: digestAt(r, 8), localCommitment: digestAt(r, 48), dispatchId: digestAt(r, 56), chainDomain: action.chainDomain,
          evidencePolicy: ruleCommitment, actionCommitment, payoutCommitment: digestAt(r, 88), receiptKeyCommitment: action.receiptKeyCommitment, receiptRho: action.receiptRho };
        for (const [key, value] of Object.entries(expected)) need(opening[key] === value, code('RECEIPT_' + key));
        for (const [offset, value] of [[24, expected.hubDomain], [32, expected.registryCommitment], [64, action.chainDomain], [72, ruleCommitment], [80, actionCommitment]]) need(digestAt(r, offset) === value, code('READY_BINDING'));
        need(system.pools.some(pool => bare(pool.scope) === opening.scope && bare(pool.policy) === opening.policy && bare(pool.assetIdentity) === digestAt(r, 16)), code('READY_POOL_DOMAIN'));
        uint(request.dispatchSignedAt);
        const signedAt = BigInt(request.dispatchSignedAt);
        need(BigInt(r[96]) <= signedAt && signedAt < BigInt(r[97]) && BigInt(action.executionFrom) <= signedAt && signedAt < BigInt(action.executionUntil) && (signedAt <= BigInt(at) || signedAt - BigInt(at) <= BigInt(rule.maximumClockSkew)), code('DISPATCH_WINDOW'));
        need(nativeProviderIdentity(request.providerKey) === action.signerIdentity, code('PROVIDER_IDENTITY'));
        const dispatch = { hubDomain: expected.hubDomain, registryCommitment: expected.registryCommitment, readyStatement, localCommitment: opening.localCommitment, dispatchId: opening.dispatchId, actionCommitment, globalEffectId: gid, deliveryRiskCommitment: action.deliveryRiskCommitment, signedAt: request.dispatchSignedAt };
        bytes(request.dispatchSignature, 64); const s = BigInt('0x' + request.dispatchSignature.slice(64));
        need(s > 0n && s <= ORDER / 2n, code('PROVIDER_LOW_S'));
        const key = createPublicKey({ format: 'jwk', key: { kty: 'EC', crv: 'secp256k1', x: bytes(request.providerKey.x).toString('base64url'), y: bytes(request.providerKey.y).toString('base64url') } });
        need(verify('sha256', nativeDispatchStatementFrame(dispatch), { key, dsaEncoding: 'ieee-p1363' }, bytes(request.dispatchSignature, 64)), code('PROVIDER_SIGNATURE'));
        const commitment = nativeReceiptCommitment(opening), prior = state.facts.find(fact => fact.gid === gid || fact.commitment === commitment);
        if (prior) {
          need(canonical(prior.request) === canonical(request) && !prior.adverse && !prior.revoked, code('CERTIFICATE_REBIND'));
          await sameHead(view.header); return freeze(snapshot(prior.result));
        }
        need(state.facts.length < 64, code('FACT_CAPACITY'));
        need(BigInt(await system.hub.call('revoked(bytes32)', ['0x' + gid], view.header.number)) === 0n, code('GID_REVOKED'));
        const statement = { hubDomain: expected.hubDomain, registryCommitment: expected.registryCommitment, ruleCommitment, readyStatement,
          dispatchStatement: nativeDispatchStatementDigest(dispatch), receiptCommitment: commitment, globalEffectId: gid, observation };
        const signed = await signFrame(nativeAttestationStatementFrame(statement), view.header, false);
        const result = { classification: CLASSIFICATION, recursiveReadyProofVerification: 'NOT_PERFORMED_OBSERVER_BINDS_R98_ONLY', effect, observation, statement, rule,
          rulePath: nativeAdmissionRulesTree(rules).paths[rules.indexOf(rule)], receiptCommitment: commitment, globalEffectId: gid, ...signed,
          attesterIndexes: signed.indexes.map(String), attesterSignatures: signed.signatures };
        await sameHead(view.header);
        const next = snapshot(state); next.facts.push({ gid, commitment, request, observation, result, lastReobservedAt: at, adverse: null, revoked: false });
        await commit(next); return freeze(snapshot(result));
      });
    },
    health(input = {}) {
      optional(input, ['validUntil'], 'HEALTH_FIELDS'); const request = snapshot(input);
      return serial(async () => {
        const view = await readHub(), { pending, at } = await scan(view);
        if (pending.length) return revocations(view, pending);
        const message = { ...view.evidence, validFrom: at, validUntil: request.validUntil ?? (BigInt(at) + 30n).toString() };
        assertFinalityHealthValid(message, { ...view.evidence, halt: view.state.halt, timestamp: at });
        const result = { status: 'HEALTHY', classification: CLASSIFICATION, message, ...await signFrame(finalityHealthFrame(message), view.header) };
        await sameHead(view.header); const next = snapshot(state); next.lastHealth = result; await commit(next); return freeze(snapshot(result));
      });
    },
    checkpoint(input) {
      exact(input, ['poolIndex', 'requestId', 'validUntil'], 'CHECKPOINT_FIELDS'); const request = snapshot(input);
      return serial(async () => {
        const view = await readHub(request.poolIndex), { pending } = await scan(view);
        need(pending.length === 0, code('REVOCATION_REQUIRED'));
        const message = { hubDomain: system.hubDomain, registryCommitment: system.registryCommitment, pool: system.pools[request.poolIndex].address,
          expectedPoolSequence: view.snapshot.poolStateSequence, expectedHubStateSequence: view.snapshot.hubStateSequence, requestId: request.requestId, validUntil: request.validUntil };
        const previous = state.checkpoints.find(entry => entry.message.requestId === request.requestId);
        if (previous) {
          need(previous.message.pool === message.pool && previous.message.validUntil === message.validUntil, code('CHECKPOINT_REBIND'));
          return freeze(snapshot(previous)); // Original request retains its original state sequences.
        }
        assertCheckpointAuthorizationValid(message, { hubDomain: system.hubDomain, registryCommitment: system.registryCommitment, pool: message.pool,
          poolStateSequence: view.snapshot.poolStateSequence, hubStateSequence: view.snapshot.hubStateSequence, checkpointCount: view.checkpointCount, timestamp: BigInt(view.header.timestamp).toString() });
        need(state.checkpoints.length < 64, code('CHECKPOINT_CAPACITY'));
        const result = { classification: CLASSIFICATION, message, ...await signFrame(checkpointAuthorizationFrame(message), view.header) };
        await sameHead(view.header); const next = snapshot(state); next.checkpoints.push(result); await commit(next); return freeze(snapshot(result));
      });
    },
    status() { return freeze({ classification: CLASSIFICATION, bound: !!system, reopenRequired: poisoned, revision, knownFacts: state.facts.length,
      pendingRevocations: state.facts.filter(fact => fact.adverse && !fact.revoked).length }); },
  };
  return Object.freeze(observer);
}
