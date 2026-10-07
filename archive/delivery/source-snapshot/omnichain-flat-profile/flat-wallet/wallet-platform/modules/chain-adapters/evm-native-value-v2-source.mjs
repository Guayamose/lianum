/** Native-only independent V2 observation source. No private graph input.
 * Produces native facts for its dedicated peer; no proof/signing authority.
 * Trusted bootstrap pins transport, client/config identity and current-state
 * reader. RPC/traces remain assertions, not native consensus/state proofs. */
import { createHash } from 'node:crypto';
import { fields, need, freeze, rpcQuantity as rawRpcQuantity, safeMilliseconds,
  observationBootstrap, checkFreshBlock, ObservationError } from './portfolio-registry.mjs';
import { normalizeEvmBlock } from './evm-observation-adapter.mjs';
import { normalizeObservedEvmTransaction, normalizeObservedEvmReceipt, normalizeEvmInclusionBlock }
  from './evm-transfer-observation-codec.mjs';
import { nativeObservedEffectCommitment } from './native-receipt-binding.mjs';
import { cloneInput } from '../paeg/readiness-inputs.mjs';
import { assertSource, validateProfile, assertRegistration, profileCommitment, registryCommitment,
  encodeFacts, FACTS_SCHEMA, CHAINS, TRACE, OBLIGATION } from './evm-native-value-v2.mjs';
import { bindOriginalEvmGraphTransfer } from './evm-graph-transfer-binding.mjs';

const owners = new WeakSet(), issued = new WeakMap();
const sha = b => createHash('sha256').update(b).digest('hex');
const digest = (tag, value) => sha(Buffer.from(tag + '\0' + JSON.stringify(value)));
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const exact = (v, names) => fields(v, names, [], true);
const rpcQuantity = (v, bits) => {const n=rawRpcQuantity(v,bits);need(v==='0x'+n.toString(16),'EVM_GRAPH_CANONICAL_RPC_QUANTITY');return n;};
const quantity = v => '0x' + BigInt(v).toString(16);
const traceCallOptions = freeze({ tracer: 'callTracer', timeout: '5s', reexec: 128, tracerConfig: { onlyTopCall: true, withLog: false } });
const traceStateOptions = freeze({ tracer: 'prestateTracer', timeout: '5s', reexec: 128,
  tracerConfig: { diffMode: false, disableCode: false, disableStorage: true } });
function bytes(value, max) {
  need(typeof value === 'string' && value.length <= 2 + max * 2
    && /^0x(?:[0-9a-f]{2})*$/.exec(value)?.[0] === value, 'EVM_GRAPH_TRACE_BYTES'); return value;
}
function projectTopCall(raw, signed) {
  const t = fields(raw, ['type', 'from', 'to', 'value', 'input', 'gas', 'gasUsed'], ['output', 'error', 'revertReason', 'calls']);
  need(t.type === 'CALL' && t.from === signed.from && t.to === signed.to
    && rpcQuantity(t.value).toString() === signed.value && t.input === signed.data, 'EVM_GRAPH_TRACE_ORIGINAL_CALL');
  const gas = rpcQuantity(t.gas), gasUsed = rpcQuantity(t.gasUsed);
  need(gas <= BigInt(signed.gas) && gasUsed > 0n && gasUsed <= BigInt(signed.gas), 'EVM_GRAPH_TRACE_GAS');
  need(t.error === undefined && t.revertReason === undefined && t.calls === undefined, 'EVM_GRAPH_TRACE_FAILED_OR_WRONG_MODE');
  const output = t.output === undefined ? '0x' : bytes(t.output, 65536);
  return freeze({ type: t.type, from: t.from, to: t.to, value: signed.value, input: t.input,
    gas: gas.toString(), gasUsed: gasUsed.toString(), outputSHA256: sha(Buffer.from(output.slice(2), 'hex')) });
}
function projectRecipientPrestate(raw, signed) {
  // Select the exact account touched at this transaction's position. A missing
  // account is unavailable evidence, never an inferred empty EOA. In the pinned
  // Geth-compatible profile, omitted code on a PRESENT account encodes empty
  // code. This source-profile assumption is versioned and must be reviewed.
  const entry = fields(raw, [signed.to])[signed.to];
  const a = fields(entry, ['balance'], ['nonce', 'code']);
  rpcQuantity(a.balance);
  need(a.nonce === undefined || Number.isSafeInteger(a.nonce) && a.nonce >= 0, 'EVM_GRAPH_TRACE_NONCE');
  const code = a.code === undefined ? '0x' : bytes(a.code, 65536);
  const delegated = /^0xef0100[0-9a-f]{40}$/.test(code);
  return freeze({ address: signed.to, codeSHA256: sha(Buffer.from(code.slice(2), 'hex')),
    codeBytes: String((code.length - 2) / 2), classification: delegated ? 'delegation-designator'
      : code === '0x' ? 'empty-code-not-control-or-system-account-proof' : 'code-bearing',
    delegationTarget: delegated ? '0x' + code.slice(8) : null,
    accountControlVerified: false, retainedValueVerified: false, systemAccountExcluded: false });
}
export function assertNativeValueObservation(value, source) {
  need(owners.has(source) && issued.get(value) === source, 'EVM_GRAPH_SOURCE_OBSERVATION_PROVENANCE');
}

/** Private bootstrap only. currentRegistry.read/assertCurrent must be wired to
 * the actual authenticated deployment reader. Facts peers receive no graph state. Their
 * source pins are not caller-selected request fields. */
export async function createNativeValueSource(raw) {
  const o = exact(raw, ['policy', 'source', 'original', 'currentRegistry', 'now']);
  const policy = cloneInput(o.policy);
  exact(policy, ['ledgerNamespace', 'registry', 'profile', 'profilePath']);
  const registered = validateProfile(policy.profile);
  const registeredCommitment = assertRegistration(registered, policy.registry, policy.profilePath);
  need(policy.ledgerNamespace === policy.registry.quorum.hubDomain, 'EVM_GRAPH_INITIAL_NAMESPACE');
  const profile = { ...registered, chain: CHAINS[registered.chainId][0], genesisHash: '0x' + registered.genesis,
    finalitySource: CHAINS[registered.chainId][1], traceProfile: TRACE, obligation: OBLIGATION };
  const sourceInput = exact(o.source, ['identity', 'index', 'siblings', 'transport']);
  const source = { identity: cloneInput(sourceInput.identity), index: sourceInput.index,
    siblings: cloneInput(sourceInput.siblings), transport: sourceInput.transport };
  const sourcePin = assertSource(registered, { identity: source.identity, index: source.index, siblings: source.siblings });
  const binding = bindOriginalEvmGraphTransfer(o.original, { chain: profile.chain, genesisHash: profile.genesisHash });
  const { identity, signed } = binding;
  need(identity.asset === registered.asset, 'EVM_GRAPH_REGISTERED_NATIVE_ASSET');
  const current = exact(o.currentRegistry, ['read', 'assertCurrent']);
  need(typeof current.read === 'function' && typeof current.assertCurrent === 'function', 'EVM_GRAPH_REGISTRY_READER');
  const readState = current.read.bind(current), assertCurrent = current.assertCurrent.bind(current);
  async function checkState() {
    const state = cloneInput(await readState());
    exact(state, ['registryCommitment', 'registryEpoch', 'halt', 'head']);
    need(state.registryCommitment === registeredCommitment
      && state.registryEpoch === policy.registry.quorum.registryEpoch && state.halt === '0', 'EVM_GRAPH_CURRENT_REGISTRY_CHANGED');
    need(typeof state.head === 'string' && /^[0-9a-f]{64}$/.test(state.head) && /[1-9a-f]/.test(state.head), 'EVM_GRAPH_CURRENT_HEAD');
    return state;
  }
  const config = observationBootstrap({ chain: profile.chain, genesisHash: profile.genesisHash,
    transport: source.transport, now: o.now, freshness: { maxBlockAgeMs: Number(profile.maximumBlockAgeMs),
      maxFutureSkewMs: Number(profile.maximumClockSkewMs), maxQueryMs: Number(profile.maximumQueryMs) } }, 'evm');
  let retained = binding.inclusion, established = false, busy = false, adverse = null;
  function output(status, reason, at, proposal = null) {
    const value = freeze({ schema: 'flat-evm-native-value-source/2', status, reason,
      nativeId: identity.nativeId, nativeGid: identity.nativeGid,
      sourceIndex: sourcePin.index, observedAtMs: String(at), proposal });
    issued.set(value, observer); return value;
  }
  const observer = Object.freeze({
    identity, sourceIndex: sourcePin.index, profileCommitment: profileCommitment(registered),
    async observe(rawQuery) {
      const q = exact(rawQuery, ['nativeId']); need(q.nativeId === identity.nativeId, 'EVM_GRAPH_ORIGINAL_QUERY');
      const started = safeMilliseconds(config.now());
      if (adverse) return output('reorged', adverse, started);
      if (busy) return output('unknown', 'EVM_GRAPH_SOURCE_BUSY', started);
      busy = true; const controller = new AbortController(); let timer;
      const call = async (method, params) => {
        need(!controller.signal.aborted, 'EVM_GRAPH_SOURCE_TIMEOUT');
        try { const answer = await config.transport(method, freeze(params), { signal: controller.signal });
          need(!controller.signal.aborted, 'EVM_GRAPH_SOURCE_TIMEOUT'); return answer; }
        catch { throw new ObservationError('EVM_GRAPH_SOURCE_UNAVAILABLE'); }
      };
      const checkNetwork = async () => {
        need(rpcQuantity(await call('eth_chainId', []), 64).toString() === binding.network.chainId, 'EVM_GRAPH_OBSERVED_CHAIN');
        const genesis = normalizeEvmBlock(await call('eth_getBlockByNumber', ['0x0', false]));
        need(genesis.height === '0' && genesis.hash === profile.genesisHash, 'EVM_GRAPH_OBSERVED_GENESIS');
        return genesis;
      };
      const readOriginal = async () => {
        const txRaw = await call('eth_getTransactionByHash', [signed.nativeId]);
        const receiptRaw = await call('eth_getTransactionReceipt', [signed.nativeId]);
        need(txRaw !== null && receiptRaw !== null, 'EVM_GRAPH_ORIGINAL_HISTORY_UNAVAILABLE');
        const tx = normalizeObservedEvmTransaction(txRaw, signed);
        need(tx.blockId !== null, 'EVM_GRAPH_ORIGINAL_NOT_INCLUDED');
        const receipt = normalizeObservedEvmReceipt(receiptRaw, tx);
        // No fallback to latest, nearest surviving block or replacement hash.
        const block = normalizeEvmInclusionBlock(await call('eth_getBlockByNumber', [quantity(tx.blockHeight), false]), tx);
        const inclusion = freeze({ blockId: tx.blockId, blockHeight: tx.blockHeight, transactionIndex: tx.transactionIndex,
          receiptCommitment: digest('LIANUM/original-evm-receipt/1', receipt) });
        return { tx, receipt, block, inclusion };
      };
      const readTrace = async () => ({ call: projectTopCall(await call('debug_traceTransaction', [signed.nativeId, traceCallOptions]), signed),
        recipient: projectRecipientPrestate(await call('debug_traceTransaction', [signed.nativeId, traceStateOptions]), signed) });
      try {
        const result = await Promise.race([(async () => {
          const state = await checkState();
          const genesis = await checkNetwork();
          if (retained) {
            const old = normalizeEvmBlock(await call('eth_getBlockByNumber', [quantity(retained.blockHeight), false]));
            need(old.height === retained.blockHeight, 'EVM_GRAPH_OLD_INCLUSION_UNAVAILABLE');
            if (old.hash.slice(2) !== retained.blockId) {
              await checkNetwork();
              return { status: established ? 'reorged' : 'unknown', reason: 'EVM_GRAPH_ORIGINAL_CANONICAL_BLOCK_CHANGED' };
            }
          }
          const original = await readOriginal();
          if (retained) need(same(retained, original.inclusion), 'EVM_GRAPH_ORIGINAL_INCLUSION_CHANGED');
          need(original.receipt.status === 'success', 'EVM_GRAPH_EXECUTION_REVERTED', 'reverted');
          // Common nonzero-calldata intrinsic cost. The stronger EIP-7623
          // floor remains fork-dependent and is not inferred from this receipt.
          need(BigInt(original.receipt.gasUsed) >= 21000n + 16n * 70n, 'EVM_GRAPH_RECEIPT_INTRINSIC_GAS');
          // The trace lookup is by exact original transaction hash. The canonical
          // transaction/receipt/index is read before AND after both trace reads.
          // This supports ordinary multi-transaction blocks without whole-block
          // balance deltas or an assertion that recipient code stayed unchanged.
          const trace = await readTrace();
          const finalized = normalizeEvmBlock(await call('eth_getBlockByNumber', ['finalized', false]));
          need(BigInt(finalized.height) >= BigInt(original.block.height), 'EVM_GRAPH_NOT_FINALIZED');
          const distance = BigInt(finalized.height) - BigInt(original.block.height);
          need(distance <= BigInt(profile.maximumAncestry), 'EVM_GRAPH_ANCESTRY_UNAVAILABLE');
          const ancestry = [finalized]; let child = finalized;
          while (child.height !== original.block.height) {
            const height = BigInt(child.height) - 1n;
            const parent = normalizeEvmBlock(await call('eth_getBlockByNumber', [quantity(height), false]));
            need(BigInt(parent.height) === height && parent.hash === child.parentHash
              && BigInt(parent.timestampMs) <= BigInt(child.timestampMs), 'EVM_GRAPH_FINALIZED_ANCESTRY_CHANGED');
            ancestry.push(parent); child = parent;
          }
          need(same(child, original.block), 'EVM_GRAPH_FINALIZED_INCLUSION_CHANGED');
          const repeatedTrace = await readTrace(), repeated = await readOriginal();
          need(same(trace, repeatedTrace), 'EVM_GRAPH_TRANSACTION_TRACE_CHANGED');
          need(same(original, repeated), 'EVM_GRAPH_ORIGINAL_INCLUSION_CHANGED');
          const repeatedFinalized = normalizeEvmBlock(await call('eth_getBlockByNumber', ['finalized', false]));
          need(same(finalized, repeatedFinalized), 'EVM_GRAPH_FINALIZED_SOURCE_CHANGED');
          need(same(finalized, normalizeEvmBlock(await call('eth_getBlockByNumber', [quantity(finalized.height), false]))),
            'EVM_GRAPH_FINALIZED_CANONICAL_CHANGED');
          need(same(genesis, await checkNetwork()), 'EVM_GRAPH_OBSERVED_GENESIS');
          // Require same authenticated current state across all awaited native
          // reads; no caller-provided verified/live flags or historical substitute.
          need(await assertCurrent(state) === undefined, 'EVM_GRAPH_CURRENT_STATE_ASSERTION');
          const endState = await checkState();
          need(same(state, endState), 'EVM_GRAPH_CURRENT_STATE_CHANGED');
          const at = safeMilliseconds(config.now()); checkFreshBlock(finalized, at, config.freshness);
          const observedAt = BigInt(Math.floor(at / 1000));
          const evidenceUntil = observedAt + BigInt(profile.maximumEvidenceLifetime);
          need(evidenceUntil < 1n << 64n, 'EVM_GRAPH_EVIDENCE_OVERFLOW');
          need(evidenceUntil * 1000n <= BigInt(finalized.timestampMs) + BigInt(profile.maximumBlockAgeMs),
            'EVM_GRAPH_FINALITY_FRESHNESS_WINDOW_TOO_SHORT');
          const executionEvidence = { traceProfile: profile.traceProfile,
            nativeId: identity.nativeId, transactionSHA256: identity.transactionSHA256, ...original.inclusion,
            ...trace, obligation: profile.obligation, traceConsensusVerified: false };
          const finalityEvidence = { source: profile.finalitySource,
            observedGenesis: genesis.hash, finalized, ancestry,
            consensusVerified: false, l1SettlementVerified: false };
          const observation = { blockId: original.inclusion.blockId, blockHeight: original.inclusion.blockHeight,
            observedAt: observedAt.toString(), evidenceFrom: observedAt.toString(), evidenceUntil: evidenceUntil.toString(),
            stateCommitment: nativeObservedEffectCommitment({ family: identity.family, genesis: identity.genesis, asset: identity.asset,
              nativeGid: identity.nativeGid, blockId: original.inclusion.blockId, blockHeight: original.inclusion.blockHeight,
              transactionSHA256: identity.transactionSHA256, sourceCommitment: identity.sourceCommitment,
              destinationCommitment: identity.destinationCommitment, amount: identity.amount }),
            ...binding.actionTerms };
          const executionEvidenceCommitment = digest('LIANUM/evm-native-execution-evidence/2', executionEvidence);
          const finalityEvidenceCommitment = digest('LIANUM/evm-native-finality-evidence/2', finalityEvidence);
          const facts = { schema: FACTS_SCHEMA,
            ledgerNamespace: policy.ledgerNamespace, hubDomain: policy.registry.quorum.hubDomain,
            registryCommitment: registeredCommitment, registryEpoch: policy.registry.quorum.registryEpoch,
            profileCommitment: profileCommitment(registered), sourceSetRoot: profile.sourceSetRoot,
            ...Object.fromEntries(['family','genesis','asset','transactionId','effectIndex','nativeGid','transactionSHA256'].map(k=>[k,identity[k]])),
            wireKeyCommitment: binding.wireKeyCommitment,
            observation: { ...Object.fromEntries(['blockId','stateCommitment','blockHeight','observedAt','sourceCommitment','destinationCommitment',
              'amount','custodyCommitment','evidenceFrom','evidenceUntil'].map(k=>[k,observation[k]])), custodyKind: String(observation.custodyKind) },
            finalizedBlockId: finalized.hash.slice(2), finalizedBlockHeight: finalized.height,
            executionEvidenceCommitment, finalityEvidenceCommitment };
          const frame = encodeFacts(facts, policy);
          const proposal = { facts, frameHex: frame.toString('hex'), digest: sha(frame), nativeWire: signed.nativeWire,
            inclusion: original.inclusion, executionEvidenceCommitment, finalityEvidenceCommitment };
          return { status: 'observed', reason: null, proposal, inclusion: original.inclusion };
        })(), new Promise((_, reject) => { timer = setTimeout(() => {
          controller.abort(); reject(new ObservationError('EVM_GRAPH_SOURCE_TIMEOUT'));
        }, config.freshness.maxQueryMs); })]);
        const at = safeMilliseconds(config.now());
        need(at >= started && at - started < config.freshness.maxQueryMs, 'EVM_GRAPH_SOURCE_TIMEOUT');
        if (result.inclusion) { retained ??= result.inclusion; established = true; }
        if (result.status === 'reorged') adverse = result.reason;
        return output(result.status, result.reason, at, result.proposal ?? null);
      } catch (error) {
        return output(error instanceof ObservationError ? error.status : 'unknown',
          error instanceof ObservationError ? error.code : 'EVM_GRAPH_SOURCE_INVALID', safeMilliseconds(config.now()));
      } finally { clearTimeout(timer); controller.abort(); busy = false; }
    },
  });
  owners.add(observer); return observer;
}
