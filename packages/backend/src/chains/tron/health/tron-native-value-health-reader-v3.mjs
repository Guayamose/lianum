/** Fixed original TRX reader. Every result is INACTIVE and unsigned. SolidityNode
 * and the named historical replay capability are registered trust assumptions,
 * not consensus proofs. No synthetic RPC method, account-at-latest fallback,
 * private-balance transition, replacement wire, signer or broadcast exists. */
import { types } from 'node:util';
import { fields, need, freeze, safeMilliseconds, checkFreshBlock, ObservationError } from '../../shared/portfolio/portfolio-registry.mjs';
import { normalizeTronBlock } from '../observations/tron-observation-adapter.mjs';
import { createTronNativeTransferObserver } from '../observations/tron-native-transfer-observer.mjs';
import { cloneInput } from '@lianum/components/plain-input';
import { exact, integer, hex, sha256, FACTS_SCHEMA, REPLAY_SCHEMA, OBLIGATION,
  assertRegistration, assertSource, sourceCommitment, registryCommitment, bindOriginalTronGraphTransfer,
  tronGraphObservedEffect, encodeFacts, bindTronGraphReadiness, assertTronGraphCurrentState } from '../transfers/tron-native-graph-profile.mjs';
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const digest = (tag, v) => sha256(tag + '\0' + JSON.stringify(v));
const limits = Object.freeze({ activation: 'INACTIVE', graphAdmissionEligible: false, creditEligible: false, privateSpendableAtomic: null,
  independentConsensusVerified: false, recipientControlVerified: false, recipientRetainedValueVerified: false, factsQuorumVerified: false });
function list(v, max) {
  need(Array.isArray(v) && !types.isProxy(v) && Object.getPrototypeOf(v) === Array.prototype && v.length <= max
    && Reflect.ownKeys(v).length === v.length + 1, 'TRON_GRAPH_ARRAY');
  return Array.from({ length: v.length }, (_, i) => { const d = Object.getOwnPropertyDescriptor(v, String(i));
    need(d?.enumerable && Object.hasOwn(d, 'value'), 'TRON_GRAPH_ARRAY'); return d.value; });
}
/** The callback's data must be from real replay just BEFORE the exact transaction,
 * after every preceding transaction in that block. This checks arithmetic and
 * binding independently; it cannot establish the replay engine's truth. */
export function validateTronExecutionContext(raw, signed, inclusion, parent, reference, genesis) {
  const c = exact(raw, ['schema', 'genesis', 'nativeId', 'transactionSHA256', 'blockId', 'blockHeight', 'transactionIndex', 'parentBlockId',
    'ownerAddress', 'ownerPermission', 'validationHeadId', 'validationHeadTimeMs', 'consensusLogicOptimization', 'maintenanceStateFlag', 'maintenanceSkipSlots']);
  need(c.schema === REPLAY_SCHEMA && c.genesis === genesis && c.nativeId === signed.nativeId && c.transactionSHA256 === signed.transactionSHA256,
    'TRON_GRAPH_REPLAY_ORIGINAL');
  for (const k of ['blockId', 'blockHeight', 'transactionIndex']) need(c[k] === inclusion[k], 'TRON_GRAPH_REPLAY_POSITION');
  need(c.parentBlockId === parent.hash && c.validationHeadId === parent.hash && c.validationHeadTimeMs === parent.timestampMs
    && BigInt(parent.height) + 1n === BigInt(inclusion.blockHeight), 'TRON_GRAPH_REPLAY_PARENT_CONTEXT');
  need(c.ownerAddress === signed.ownerAddress && signed.permissionId === '0', 'TRON_GRAPH_REPLAY_OWNER');
  const p = exact(c.ownerPermission, ['type', 'id', 'threshold', 'keys']);
  need(p.type === 'Owner' && p.id === '0', 'TRON_GRAPH_PERMISSION_ID');
  const threshold = integer(p.threshold, 63); need(threshold > 0n, 'TRON_GRAPH_PERMISSION_THRESHOLD');
  const keys = list(p.keys, 5).map(rawKey => {
    const k = exact(rawKey, ['address', 'weight']); hex(k.address, 21); need(k.address.startsWith('41'), 'TRON_GRAPH_PERMISSION_ADDRESS');
    need(integer(k.weight, 63) > 0n, 'TRON_GRAPH_PERMISSION_WEIGHT'); return k;
  }).sort((a, b) => a.address.localeCompare(b.address));
  need(keys.length > 0 && new Set(keys.map(k => k.address)).size === keys.length, 'TRON_GRAPH_PERMISSION_DUPLICATE');
  const matched = keys.find(k => k.address === signed.signature.signerAddress);
  need(matched !== undefined && BigInt(matched.weight) >= threshold, 'TRON_GRAPH_PERMISSION_NOT_AUTHORIZED');
  const h = BigInt(parent.height), suffix = BigInt('0x' + signed.refBlockBytes);
  const refHeight = h - ((h - suffix + 65536n) % 65536n);
  need(refHeight >= 0n && BigInt(reference.height) === refHeight && h - refHeight < 65536n
    && reference.hash.slice(12, 16) === signed.refBlockBytes && reference.hash.slice(16, 32) === signed.refBlockHash,
    'TRON_GRAPH_TAPOS_REFERENCE');
  const expiry = BigInt(signed.expirationMs), headTime = BigInt(parent.timestampMs);
  need(expiry > headTime && expiry <= headTime + 86400000n, 'TRON_GRAPH_EXPIRATION_PARENT_WINDOW');
  need(['0', '1'].includes(c.consensusLogicOptimization) && ['0', '1'].includes(c.maintenanceStateFlag), 'TRON_GRAPH_REPLAY_FORK_FLAGS');
  const skip = integer(c.maintenanceSkipSlots, 32);
  // getNextBlockSlotTime uses stateFlag and maintenanceSkipSlots. Do not replace
  // it with the original timestamp, wall clock or containing block timestamp.
  const nextSlot = headTime + (1n + (c.maintenanceStateFlag === '1' ? skip : 0n)) * 3000n;
  if (c.consensusLogicOptimization === '1') need(expiry >= nextSlot, 'TRON_GRAPH_EXPIRATION_NEXT_SLOT');
  return freeze({ ...c, ownerPermission: { type: 'Owner', id: '0', threshold: p.threshold, keys },
    recoveredSignerAddress: signed.signature.signerAddress, authorizedWeight: matched.weight, referenceBlockId: reference.hash, referenceBlockHeight: reference.height,
    nextBlockSlotTimeMs: nextSlot.toString(), permissionCheck: 'independent-threshold-check-on-trusted-historical-prestate',
    taposCheck: 'exact-recent-canonical-reference-under-registered-source', expirationCheck: 'parent-window-and-pinned-fork-rule' });
}
function retained(raw, identity, registration) {
  const r = exact(raw, ['schema', 'nativeId', 'nativeGid', 'transactionSHA256', 'profileCommitment', 'registryCommitment', 'inclusion', 'executionEvidenceCommitment']);
  need(r.schema === 'LIANUM_TRON_GRAPH_RETAINED_ORIGINAL_V1', 'TRON_GRAPH_RETAINED_SCHEMA');
  for (const k of ['nativeId', 'nativeGid', 'transactionSHA256']) need(r[k] === identity[k], 'TRON_GRAPH_RETAINED_IDENTITY');
  need(r.profileCommitment === registration.profileCommitment && r.registryCommitment === registration.registryCommitment, 'TRON_GRAPH_RETAINED_PROFILE');
  hex(r.executionEvidenceCommitment); const i = exact(r.inclusion, ['blockId', 'blockHeight', 'transactionIndex', 'receiptCommitment']);
  hex(i.blockId); hex(i.receiptCommitment); integer(i.blockHeight, 63); need(integer(i.transactionIndex, 32) < 131072n, 'TRON_GRAPH_RETAINED_INDEX');
  need(BigInt('0x' + i.blockId.slice(0, 16)) === BigInt(i.blockHeight) && i.blockHeight !== '0', 'TRON_GRAPH_RETAINED_HEIGHT');
  return freeze({ ...r, inclusion: i });
}
export function prepareTronNativeValueHealthReaderV3(raw) {
  const o = exact(raw, ['policy', 'source', 'original', 'currentRegistry', 'now', 'history']);
  const policy = cloneInput(o.policy), registration = assertRegistration(policy), profile = registration.profile;
  const s = exact(o.source, ['identity', 'index', 'siblings', 'transport'], ['readReplayContext']);
  const pin = assertSource(profile, { identity: cloneInput(s.identity), index: s.index, siblings: cloneInput(s.siblings) });
  const current = exact(o.currentRegistry, ['read', 'assertCurrent']);
  need(typeof s.transport === 'function' && typeof current.read === 'function' && typeof current.assertCurrent === 'function' && typeof o.now === 'function', 'TRON_GRAPH_BOOTSTRAP_CAPABILITY');
  need(s.readReplayContext === undefined || typeof s.readReplayContext === 'function', 'TRON_GRAPH_REPLAY_CAPABILITY');
  // Hold functions by value: later mutation of the private bootstrap cannot
  // switch the source used by an already registered observer.
  const transport = s.transport, replay = s.readReplayContext, readRegistry = current.read, assertCurrent = current.assertCurrent, now = o.now;
  const binding = bindOriginalTronGraphTransfer(o.original, profile.genesis), { identity, signed } = binding;
  const original = cloneInput(binding.original);
  return {policy,registration,profile,pin,transport,replay,readRegistry,assertCurrent,now,binding,identity,signed,original,historyToken:o.history};
}

/** Unbranded reader: only the fixed operator kernel can authenticate outputs. */
export function createTronNativeValueHealthReaderV3(prepared,history){
  const {policy,registration,profile,pin,transport,replay,readRegistry,assertCurrent,now,binding,identity,signed,original}=prepared;
  if (history) need(history.original.nativeWire === signed.nativeWire && same(history.original.inclusion, original.inclusion), 'TRON_GRAPH_PRIVATE_HISTORY_ORIGINAL');
  const prior = history?.original;
  let saved = prior ? retained({ schema: 'LIANUM_TRON_GRAPH_RETAINED_ORIGINAL_V1', nativeId: identity.nativeId,
    nativeGid: identity.nativeGid, transactionSHA256: identity.transactionSHA256,
    profileCommitment: registration.profileCommitment, registryCommitment: registration.registryCommitment,
    inclusion: prior.inclusion, executionEvidenceCommitment: prior.facts.executionEvidenceCommitment }, identity, registration) : null;
  let established = !!history?.history.length, adverse = null, busy = false, nativeReads = 0;
  if (saved) { if (original.inclusion) need(same(original.inclusion, saved.inclusion), 'TRON_GRAPH_ORIGINAL_RETAINED_MISMATCH'); original.inclusion = saved.inclusion; }
  const freshness = { maxBlockAgeMs: Number(profile.maximumBlockAgeMs), maxFutureSkewMs: Number(profile.maximumClockSkewMs), maxQueryMs: Number(profile.maximumQueryMs) };
  function output(status, reason, at, proposal = null) {
    const result = freeze({ schema: 'flat-tron-native-value-health-source/3', status, reason, nativeId: identity.nativeId, nativeGid: identity.nativeGid,
      transactionSHA256: identity.transactionSHA256, profileCommitment: registration.profileCommitment, sourceCommitment: sourceCommitment(pin.identity),
      sourceSignerIndex: pin.index, sourceIndex: pin.index, nativeReadCount: String(nativeReads), observedAtMs: String(at), proposal, retained: saved, ...limits });
    return result;
  }
  const reader = Object.freeze({ identity, sourceIndex: pin.index, profileCommitment: registration.profileCommitment,
    async observe(rawQuery) {
      const q = exact(rawQuery, ['nativeId']); need(q.nativeId === identity.nativeId, 'TRON_GRAPH_ORIGINAL_QUERY');
      const started = safeMilliseconds(now()); if (adverse) return output('reorged', adverse, started);
      if (busy) return output('unknown', 'TRON_GRAPH_BUSY', started);
      busy = true; nativeReads = 0; const controller = new AbortController(); let timer, nativeWork;
      const live = () => need(!controller.signal.aborted, 'TRON_GRAPH_TIMEOUT');
      // Per-round observer: an expired round cannot mutate another round's latch.
      const originalObserver = createTronNativeTransferObserver({ chain: 'tron', genesisHash: profile.genesis,
        original: { ...original, ...(saved ? { inclusion: saved.inclusion } : {}) }, now, freshness,
        transport: async (path, body, options) => { live(); nativeReads++; const answer = await transport(path, body,
          { signal: AbortSignal.any([controller.signal, options.signal]) }); live(); return answer; } });
      const atBlock = async height => { live(); let value; try { nativeReads++; value = await transport('/walletsolidity/getblockbynum', freeze({ num: height }), { signal: controller.signal }); }
        catch { throw new ObservationError('TRON_GRAPH_HISTORY_UNAVAILABLE'); } live(); const block = normalizeTronBlock(value, height === '0');
        need(block.height === height, 'TRON_GRAPH_REQUESTED_HEIGHT'); return block; };
      const registry = async () => { live(); const r = exact(await readRegistry(), ['registryCommitment', 'registryEpoch', 'halt', 'head']); live();
        hex(r.head); need(r.registryCommitment === registration.registryCommitment && r.registryEpoch === registration.registry.quorum.registryEpoch
          && r.halt === '0', 'TRON_GRAPH_CURRENT_REGISTRY_CHANGED'); return freeze(r); };
      const observeOriginal = async () => { live(); const v = await originalObserver.observe({ nativeId: identity.nativeId }); live();
        need(v.status === 'observed', v.reason ?? 'TRON_GRAPH_ORIGINAL_UNKNOWN'); return v.evidence; };
      try {
        const result = await Promise.race([nativeWork = (async () => {
          const startRegistry = await registry();
          if (saved) {
            const old = await atBlock(saved.inclusion.blockHeight);
            if (old.hash !== saved.inclusion.blockId) {
              need((await atBlock('0')).hash === profile.genesis, 'TRON_GRAPH_GENESIS_CHANGED');
              need(await assertCurrent(startRegistry) === undefined, 'TRON_GRAPH_CURRENT_ASSERTION');
              need(same(startRegistry, await registry()), 'TRON_GRAPH_CURRENT_REGISTRY_CHANGED');
              return { status: established ? 'reorged' : 'unknown', reason: 'TRON_GRAPH_ORIGINAL_CANONICAL_BLOCK_CHANGED' };
            }
          }
          const first = await observeOriginal(), inc = first.inclusion, block = first.block, solid = first.solidified;
          if (saved) need(same(saved.inclusion, inc), 'TRON_GRAPH_ORIGINAL_INCLUSION_CHANGED');
          need(BigInt(solid.height) - BigInt(block.height) <= BigInt(profile.maximumAncestry), 'TRON_GRAPH_SOLIDIFIED_ANCESTRY_BOUND');
          const parentHeight = BigInt(block.height) - 1n, suffix = BigInt('0x' + signed.refBlockBytes);
          const referenceHeight = parentHeight - ((parentHeight - suffix + 65536n) % 65536n);
          need(referenceHeight >= 0n && parentHeight - referenceHeight <= BigInt(profile.maximumTaposDistance), 'TRON_GRAPH_TAPOS_HISTORY_BOUND');
          const ancestry = [solid]; let child = solid, parent, reference;
          while (BigInt(child.height) > referenceHeight) {
            const next = await atBlock((BigInt(child.height) - 1n).toString());
            need(child.parentHash === next.hash && BigInt(next.timestampMs) <= BigInt(child.timestampMs), 'TRON_GRAPH_CANONICAL_ANCESTRY_CHANGED');
            ancestry.push(next); child = next;
            if (child.height === block.height) need(same(child, block), 'TRON_GRAPH_SOLIDIFIED_INCLUSION_CHANGED');
            if (BigInt(child.height) === parentHeight) parent = child;
          }
          reference = child; need(parent !== undefined, 'TRON_GRAPH_PARENT_UNAVAILABLE');
          need(block.parentHash === parent.hash, 'TRON_GRAPH_PARENT_MISMATCH');
          need(typeof replay === 'function', 'TRON_GRAPH_HISTORICAL_PERMISSION_UNAVAILABLE');
          const query = freeze({ schema: REPLAY_SCHEMA, genesis: profile.genesis, nativeId: identity.nativeId, transactionSHA256: identity.transactionSHA256,
            blockId: inc.blockId, blockHeight: inc.blockHeight, transactionIndex: inc.transactionIndex, parentBlockId: parent.hash, ownerAddress: signed.ownerAddress });
          const readReplay = async () => { live(); let value; try { nativeReads++; value = await replay(query, { signal: controller.signal }); }
            catch { throw new ObservationError('TRON_GRAPH_HISTORICAL_REPLAY_UNAVAILABLE'); } live();
            return validateTronExecutionContext(value, signed, inc, parent, reference, profile.genesis); };
          const executionContext = await readReplay(), repeatedContext = await readReplay();
          need(same(executionContext, repeatedContext), 'TRON_GRAPH_REPLAY_CHANGED');
          const last = await observeOriginal();
          for (const k of ['inclusion', 'receipt', 'block', 'solidified']) need(same(first[k], last[k]), 'TRON_GRAPH_ORIGINAL_OR_SOLIDIFIED_CHANGED');
          // Recheck every header read for TAPOS/finality, not just the endpoint.
          for (const old of ancestry) need(same(await atBlock(old.height), old), 'TRON_GRAPH_ANCESTRY_CHANGED');
          need(await assertCurrent(startRegistry) === undefined, 'TRON_GRAPH_CURRENT_ASSERTION'); live();
          need(same(startRegistry, await registry()), 'TRON_GRAPH_CURRENT_REGISTRY_CHANGED');
          const at = safeMilliseconds(now()); checkFreshBlock(solid, at, freshness);
          const from = BigInt(Math.floor(at / 1000)), until = from + BigInt(profile.maximumEvidenceLifetime);
          need(until * 1000n <= BigInt(solid.timestampMs) + BigInt(profile.maximumBlockAgeMs), 'TRON_GRAPH_FRESHNESS_WINDOW_TOO_SHORT');
          const executionEvidence = { obligation: OBLIGATION, inclusion: inc, receipt: first.receipt, executionContext };
          const executionEvidenceCommitment = digest('LIANUM/tron-native-execution-evidence/2', executionEvidence);
          if (saved) need(saved.executionEvidenceCommitment === executionEvidenceCommitment, 'TRON_GRAPH_ORIGINAL_EXECUTION_CONTEXT_CHANGED');
          const finalityEvidence = { policy: profile.finalityPolicy, genesis: profile.genesis, solidified: solid, ancestry };
          const observation = { blockId: inc.blockId, blockHeight: inc.blockHeight, observedAt: from.toString(), evidenceFrom: from.toString(), evidenceUntil: until.toString(),
            sourceCommitment: identity.sourceCommitment, destinationCommitment: identity.destinationCommitment, amount: identity.amount,
            custodyKind: '1', custodyCommitment: binding.actionTerms.custodyCommitment,
            stateCommitment: tronGraphObservedEffect({ ...identity, blockId: inc.blockId, blockHeight: inc.blockHeight }) };
          const facts = { schema: FACTS_SCHEMA, ledgerNamespace: registration.ledgerNamespace, hubDomain: registration.registry.quorum.hubDomain,
            registryCommitment: registration.registryCommitment, registryEpoch: registration.registry.quorum.registryEpoch, profileCommitment: registration.profileCommitment,
            sourceSetRoot: profile.sourceSetRoot, ...Object.fromEntries(['family', 'genesis', 'asset', 'transactionId', 'effectIndex', 'nativeGid', 'transactionSHA256'].map(k => [k, identity[k]])),
            wireKeyCommitment: signed.wireKeyCommitment, observation, finalizedBlockId: solid.hash, finalizedBlockHeight: solid.height,
            executionEvidenceCommitment, finalityEvidenceCommitment: digest('LIANUM/tron-native-finality-evidence/2', finalityEvidence) };
          const frame = encodeFacts(facts, policy);
          return { status: 'observed', reason: null, retained: { schema: 'LIANUM_TRON_GRAPH_RETAINED_ORIGINAL_V1', nativeId: identity.nativeId, nativeGid: identity.nativeGid,
            transactionSHA256: identity.transactionSHA256, profileCommitment: registration.profileCommitment, registryCommitment: registration.registryCommitment,
            inclusion: inc, executionEvidenceCommitment }, proposal: { facts, frameHex: frame.toString('hex'), factsDigest: sha256(frame),
              digest: sha256(frame), nativeWire: signed.nativeWire, inclusion: inc, executionEvidenceCommitment, finalityEvidenceCommitment: facts.finalityEvidenceCommitment,
              executionEvidence, finalityEvidence, obligation: OBLIGATION, custodyMeaning: 'authorized-endpoint-binding-only', ...limits } };
        })(), new Promise((_, reject) => { timer = setTimeout(() => { controller.abort(); reject(new ObservationError('TRON_GRAPH_TIMEOUT')); }, freshness.maxQueryMs); })]);
        const at = safeMilliseconds(now()); need(at >= started && at - started < freshness.maxQueryMs, 'TRON_GRAPH_TIMEOUT');
        if (result.retained) { saved ??= retained(result.retained, identity, registration); established = true; }
        if (result.status === 'reorged') adverse = result.reason;
        return output(result.status, result.reason, at, result.proposal ?? null);
      } catch (e) { return output('unknown', e instanceof ObservationError ? e.code : 'TRON_GRAPH_SOURCE_INVALID', safeMilliseconds(now())); }
      finally { clearTimeout(timer); controller.abort(); if (nativeWork) await Promise.allSettled([nativeWork]); busy = false; }
    },
  }); return reader;
}
