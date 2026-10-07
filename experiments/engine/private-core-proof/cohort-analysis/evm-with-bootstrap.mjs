/** Read-only PC24 EVM normalization. Accepts public RPC records and reviewed
 * public compilation/deployment pins only. No RPC, files, journals, certificates,
 * participants, proof execution, or native-route inference is used here.
 *
 * The frozen PC23 source has NO NoteInserted event: exact successful calldata
 * supplies inserted leaves and StateAdvanced authenticates their final root,
 * count and spent digest. Intermediate append roots are never accepted roots.
 * Compiler/source pin provenance and capture completeness remain adapter duties.
 */
import { createHash } from 'node:crypto';
import { PrivateNoteTree, noteWordsToHash, derivePrivatePoolScope, privateSpentDigest, ZERO_NOTE_HASH, assertPrivateNoteHeadroom } from '../../../../packages/engine/src/notes/private-note-tree.mjs';

export const PUBLIC_COHORT_EVM_SOURCE_SHA256 = '4f180ee3ab38e59790c6e0229bd1086d0b8c17f917d9bbef9fabefb5f1a133e3';
// Keccak-256 of exact Solidity signatures, not FIPS SHA3. These are checked
// against the supplied compiler artifact before any successful call is decoded.
export const PUBLIC_COHORT_EVM_SELECTORS = Object.freeze({
  'depositBalance(bytes,bytes32[])': '4d62f43f',
  'reserveFromNoteGuarded(bytes,bytes32[])': 'e5bc4abd',
  'fulfill(bytes,bytes32[])': '92f8339e',
  'withdraw(bytes,bytes32[])': '67843a5b',
  'withdrawBalance(bytes,bytes32[])': '6e359c06',
  'recordPermit(uint8,bytes32,bytes32,uint64,uint64,uint64)': '71a91281',
  'recordAdverse(uint8,bytes32,bytes32)': 'e8e60d3d',
});
export const PUBLIC_COHORT_EVM_TOPICS = Object.freeze({
  StateAdvanced: '0x3d5d716b1a3d4959e2b29a1d38e0735b523cf62b1a1292d2a2870d669706653c',
  Withdrawal: '0x8c6afca18616d300c4fb7eff2f714229e89e93825b143dc4ecc04231972aa19f',
  FinalityPermitRecorded: '0xce979073632cdc9e3bce034f8e59fe9f165d6857f4ea1606df5b55264b50141a',
  AdverseFactRecorded: '0xb0d20d2919fa25992e2eab6f7b3b81f7257642aed0bc5ae99b3a94dac16db06c',
});
const EVENT_LAYOUTS = Object.freeze({
  StateAdvanced: [['uint64', true], ['bytes32', false], ['bytes32', false], ['uint32', false], ['uint32', false]],
  Withdrawal: [['address', true], ['uint64', false], ['bytes32', false]],
  FinalityPermitRecorded: [['uint8', true], ['bytes32', true], ['bytes32', true], ['uint64', false], ['uint64', false], ['uint64', false], ['bytes32', false]],
  AdverseFactRecorded: [['uint8', true], ['bytes32', true], ['bytes32', false], ['uint64', false]],
});
const MODES = Object.freeze({ '4d62f43f': ['DEPOSIT', 26], e5bc4abd: ['RESERVE', 74], '92f8339e': ['TERMINAL', 65], '67843a5b': ['EXIT', 39], '6e359c06': ['EXIT', 39] });
const must = (ok, code) => { if (!ok) throw new Error(`PC24_EVM_${code}`); };
const hex = (v, bytes, label) => { must(typeof v === 'string' && new RegExp(`^0x[0-9a-fA-F]{${bytes * 2}}$`).test(v), label); return v.toLowerCase(); };
const address = v => hex(v, 20, 'ADDRESS');
const hash = v => hex(v, 32, 'HASH');
const quantity = v => { must(typeof v === 'string' && /^0x(?:0|[1-9a-f][0-9a-f]*)$/i.test(v), 'QUANTITY'); return BigInt(v); };
const decimal = v => { must(typeof v === 'string' && /^(0|[1-9][0-9]*)$/.test(v), 'DECIMAL'); return BigInt(v); };
const rawBytes = v => { must(typeof v === 'string' && /^0x(?:[0-9a-f]{2})*$/i.test(v), 'BYTES'); return Buffer.from(v.slice(2), 'hex'); };
const sha = v => `0x${createHash('sha256').update(v).digest('hex')}`;
const canonical = v => Array.isArray(v) ? v.map(canonical) : v && typeof v === 'object' ? Object.fromEntries(Object.keys(v).sort().map(k => [k, canonical(v[k])])) : v;
const jsonHash = v => sha(JSON.stringify(canonical(v)));
const be = (v, width) => { const n = BigInt(v); must(n >= 0n && n < (1n << BigInt(width * 8)), 'UINT_RANGE'); return Buffer.from(n.toString(16).padStart(width * 2, '0'), 'hex'); };
const wordUint = (v, bits = 64) => { const n = BigInt(hash(v)); must(n < (1n << BigInt(bits)), 'PUBLIC_UINT_RANGE'); return n; };
const wordAddress = v => { const w = hash(v); must(w.slice(2, 26) === '0'.repeat(24), 'ADDRESS_PADDING'); return `0x${w.slice(26)}`; };
const refs = v => { must(Array.isArray(v) && v.length > 0 && v.every(x => typeof x === 'string' && /^[A-Za-z0-9_.:/-]{1,200}$/.test(x)) && new Set(v).size === v.length, 'EVIDENCE_REFS'); return [...v]; };
const interval = v => { must(v && decimal(v.earliestMs) <= decimal(v.latestMs), 'CLOCK_INTERVAL'); return { earliestMs: v.earliestMs, latestMs: v.latestMs }; };
const publicWordHash = (words, start) => noteWordsToHash(words.slice(start, start + 8));
const signature = abi => `${abi.name}(${abi.inputs.map(x => x.type).join(',')})`;

/** Strict canonical two-dynamic-argument ABI; never confuse S74 with the legacy
 * five-argument reserveGuarded call. Public input words retain all 256 bits. */
export function decodePublicCohortProofCalldata(input, selector, count) {
  const bytes = rawBytes(input); must(bytes.length >= 4 + 96 && bytes.length <= 300000, 'CALLDATA_SIZE');
  must(bytes.subarray(0, 4).toString('hex') === selector, 'CALLDATA_SELECTOR');
  const body = bytes.subarray(4);
  const at = p => { must(Number.isSafeInteger(p) && p >= 0 && p + 32 <= body.length, 'ABI_BOUNDS'); return BigInt(`0x${body.subarray(p, p + 32).toString('hex')}`); };
  must(at(0) === 64n, 'ABI_PROOF_OFFSET');
  const proofLength = at(64); must(proofLength > 0n && proofLength <= 262144n, 'ABI_PROOF_LENGTH');
  const end = 96 + Math.ceil(Number(proofLength) / 32) * 32;
  must(at(32) === BigInt(end), 'ABI_INPUT_OFFSET');
  must(body.subarray(96 + Number(proofLength), end).every(x => x === 0), 'ABI_PROOF_PADDING');
  must(at(end) === BigInt(count) && body.length === end + 32 + count * 32, 'ABI_INPUT_COUNT');
  return Array.from({ length: count }, (_, i) => `0x${body.subarray(end + 32 + i * 32, end + 64 + i * 32).toString('hex')}`);
}
function staticWords(input, selector, count) {
  const bytes = rawBytes(input); must(bytes.length === 4 + count * 32 && bytes.subarray(0, 4).toString('hex') === selector, 'STATIC_CALLDATA');
  return Array.from({ length: count }, (_, i) => `0x${bytes.subarray(4 + i * 32, 36 + i * 32).toString('hex')}`);
}
function validateArtifact(artifact, sourcePin) {
  must(sourcePin?.sha256?.replace(/^0x/, '') === PUBLIC_COHORT_EVM_SOURCE_SHA256, 'SOURCE_PIN'); refs(sourcePin.evidenceRefs);
  must(Array.isArray(artifact?.abi) && artifact?.evm?.methodIdentifiers, 'ARTIFACT');
  for (const [sig, selector] of Object.entries(PUBLIC_COHORT_EVM_SELECTORS)) {
    must(artifact.evm.methodIdentifiers[sig] === selector, 'SELECTOR_PIN');
    must(artifact.abi.filter(x => x.type === 'function' && signature(x) === sig).length === 1, 'FUNCTION_ABI');
  }
  for (const [name, layout] of Object.entries(EVENT_LAYOUTS)) {
    const entries = artifact.abi.filter(x => x.type === 'event' && x.name === name);
    must(entries.length === 1 && entries[0].anonymous === false && JSON.stringify(entries[0].inputs.map(x => [x.type, x.indexed])) === JSON.stringify(layout), 'EVENT_ABI');
  }
  // The reviewed source has exactly these events; a guessed NoteInserted ABI
  // is not a substitute for the actual compiler output or insertion calldata.
  must(artifact.abi.filter(x => x.type === 'event').length === 4, 'EXTRA_EVENT_ABI');
  const creation = artifact.evm.bytecode?.object;
  must(typeof creation === 'string' && /^(?:[0-9a-f]{2})+$/i.test(creation), 'CREATION_BYTECODE');
  const constructors = artifact.abi.filter(x => x.type === 'constructor');
  must(constructors.length === 1 && JSON.stringify(constructors[0].inputs.map(x => x.type)) === JSON.stringify(['bytes32', 'bytes32', ...Array(9).fill('address')]), 'CONSTRUCTOR_ABI');
  return creation.toLowerCase();
}
function parseLog(log, transaction, receipt, block) {
  must(log.removed !== true, 'REMOVED_LOG');
  must(hash(log.transactionHash) === hash(transaction.hash) && hash(log.blockHash) === hash(block.hash), 'LOG_MEMBERSHIP');
  must(quantity(log.blockNumber) === quantity(block.number) && quantity(log.transactionIndex) === quantity(receipt.transactionIndex), 'LOG_POSITION');
  quantity(log.logIndex); address(log.address);
  must(Array.isArray(log.topics) && log.topics.length > 0, 'LOG_TOPICS');
  const topic = hash(log.topics[0]), name = Object.keys(PUBLIC_COHORT_EVM_TOPICS).find(k => PUBLIC_COHORT_EVM_TOPICS[k] === topic);
  must(name, 'UNKNOWN_POOL_LOG');
  const layout = EVENT_LAYOUTS[name], bytes = rawBytes(log.data), nonIndexed = layout.filter(x => !x[1]).length;
  must(log.topics.length === 1 + layout.filter(x => x[1]).length && bytes.length === nonIndexed * 32, 'LOG_LAYOUT');
  let ti = 1, di = 0;
  const values = layout.map(([type, indexed]) => {
    const value = indexed ? hash(log.topics[ti++]) : `0x${bytes.subarray(di * 32, ++di * 32).toString('hex')}`;
    return type === 'bytes32' ? value : type === 'address' ? wordAddress(value) : wordUint(value, Number(type.slice(4))).toString();
  });
  return { name, values, index: quantity(log.logIndex).toString() };
}
function permitKey(state, chainId, pool, chain, effect, statement, version) {
  const profile = sha('PC16_CURRENT_OBSERVATION_AUTHORITY_V1');
  return sha(Buffer.concat([Buffer.from([0x16]), rawBytes(profile), be(chainId, 32), rawBytes(pool), rawBytes(state.scope), rawBytes(state.policy), be(chain, 1), rawBytes(effect), rawBytes(statement), be(version, 8)]));
}

/**
 * blocks: complete, contiguous, full eth_getBlockByNumber responses with every
 * receipt, including successful/reverted non-pool transactions and empty blocks.
 * sourcePin: {sha256,evidenceRefs}; artifact: pinned full pool solc artifact.
 * knownDeployments: public reviewed {address,creationBytecodeSha256,role,
 * evidenceRefs}, role verifier/generated-linked-library (not private journals).
 * clockTransform(seconds, context) or timeInterval supplies justified common-
 * clock uncertainty. With neither, times are null for the adapter to assign.
 * knownTemplate may enable ONLY D.sender == balance-exit.recipient bindings.
 * Returns partial verified records plus issues; any issue prevents a complete
 * public-coverage claim. This function never claims consensus or proof validity.
 */
export function normalizePublicCohortEvm({ blocks, pool, artifact, sourcePin, evidenceRefs, chainId,
  knownDeployments = [], knownTemplate = null, timeInterval = null, clockTransform = null }) {
  pool = address(pool); const rawRefs = refs(evidenceRefs), protocolRefs = refs(sourcePin?.evidenceRefs);
  const creation = validateArtifact(artifact, sourcePin), chain = decimal(chainId);
  must(Array.isArray(blocks) && blocks.length > 0 && blocks.length <= 100000, 'BLOCKS');
  must(clockTransform === null || typeof clockTransform === 'function', 'CLOCK_TRANSFORM');
  const getTime = (seconds, context) => clockTransform ? interval(clockTransform(seconds, context)) : timeInterval ? interval(timeInterval) : null;
  const events = [], roots = [], issues = [], classifications = [], transitions = [], publicEdges = [], metadataObservations = [];
  const addIssue = (code, detail, txid = null) => issues.push({ code, detail, txid, evidenceRefs: [...rawRefs] });
  const known = new Map();
  for (const d of knownDeployments) {
    const a = address(d.address); must(!known.has(a) && ['verifier', 'generated-linked-library', 'bootstrap-contract'].includes(d.role), 'KNOWN_DEPLOYMENT');
    known.set(a, { ...d, address: a, creationBytecodeSha256: hash(`0x${d.creationBytecodeSha256.replace(/^0x/, '')}`), evidenceRefs: refs(d.evidenceRefs) });
  }
  const seenTransactions = new Set(), seenDeployments = new Set(), counts = {};
  let state = null, previousBlock = null, stateBroken = false;
  const nextId = kind => `EVM_${kind}_${counts[kind] = (counts[kind] ?? 0) + 1}`;
  for (const bundle of blocks) {
    let block, receipts;
    try {
      block = bundle.block; hash(block.hash); hash(block.parentHash); quantity(block.number); quantity(block.timestamp);
      must(Array.isArray(block.transactions) && Array.isArray(bundle.receipts), 'BLOCK_TRANSACTIONS');
      if (previousBlock) must(quantity(block.number) === quantity(previousBlock.number) + 1n && hash(block.parentHash) === hash(previousBlock.hash), 'BLOCK_CONTINUITY');
      previousBlock = block;
      receipts = new Map();
      for (const r of bundle.receipts) { const txid = hash(r.transactionHash); must(!receipts.has(txid), 'DUPLICATE_RECEIPT'); receipts.set(txid, r); }
      must(receipts.size === block.transactions.length, 'RECEIPT_COMPLETENESS');
    } catch (error) { addIssue(error.message, 'Malformed or incomplete public block/receipt capture'); stateBroken = true; continue; }
    for (let txIndex = 0; txIndex < block.transactions.length; txIndex++) {
      const tx = block.transactions[txIndex]; let receipt, txid = null, summary, classification;
      try {
        txid = hash(tx.hash); must(!seenTransactions.has(txid), 'DUPLICATE_TRANSACTION'); seenTransactions.add(txid);
        receipt = receipts.get(txid); must(receipt, 'MISSING_RECEIPT');
        const sender = address(tx.from), target = tx.to === null ? null : address(tx.to), input = `0x${rawBytes(tx.input).toString('hex')}`;
        const value = quantity(tx.value), gasLimit = quantity(tx.gas), gasUsed = quantity(receipt.gasUsed), timestamp = quantity(block.timestamp);
        must(gasUsed <= gasLimit, 'GAS_LIMIT');
        for (const r of [tx, receipt]) {
          must(hash(r.blockHash) === hash(block.hash) && quantity(r.blockNumber) === quantity(block.number), 'TRANSACTION_BLOCK');
          must(quantity(r.transactionIndex) === BigInt(txIndex), 'TRANSACTION_INDEX');
          must(address(r.from) === sender && (r.to === null ? null : address(r.to)) === target, 'TRANSACTION_PARTIES');
        }
        const status = quantity(receipt.status); must(status === 0n || status === 1n, 'RECEIPT_STATUS');
        must(Array.isArray(receipt.logs), 'RECEIPT_LOGS');
        const metadata = { from: sender, to: target, nonce: quantity(tx.nonce).toString(), valueWei: value.toString(), gasLimit: gasLimit.toString(), gasUsed: gasUsed.toString(), gasPriceWei: quantity(receipt.effectiveGasPrice ?? tx.gasPrice).toString(), blockTimestampSeconds: timestamp.toString(), calldataHash: sha(rawBytes(input)), logsHash: jsonHash(receipt.logs), headerHash: hash(block.hash) };
        summary = { txid, position: { block: quantity(block.number).toString(), transaction: String(txIndex), sub: '0' }, metadata, selector: input.length >= 10 ? input.slice(2, 10) : null, status: status.toString(), evidenceRefs: [...rawRefs] };
        metadataObservations.push(structuredClone(summary));
        if (status === 0n) {
          must(receipt.logs.length === 0 && receipt.contractAddress === null, 'REVERTED_EFFECTS');
          classification = 'REVERTED_ATTEMPT';
        } else if (target === null) {
          const deployed = address(receipt.contractAddress);
          if (deployed === pool) {
            must(!state && !stateBroken, 'POOL_INITIAL_STATE');
            must(value === 0n && input === `0x${creation}${input.slice(2 + creation.length)}` && input.length === 2 + creation.length + 11 * 64, 'POOL_CREATION_BYTECODE');
            must(receipt.logs.length === 0, 'POOL_CREATION_LOGS');
            const words = input.slice(2 + creation.length).match(/.{64}/g).map(x => `0x${x}`);
            const authorities = { SOL: wordAddress(words[6]), BTC: wordAddress(words[7]) };
            must(words[0] !== ZERO_NOTE_HASH && words[1] !== ZERO_NOTE_HASH && authorities.SOL !== authorities.BTC && !Object.values(authorities).includes(`0x${'0'.repeat(40)}`), 'POOL_CONSTRUCTOR');
            const verifierAddresses = [2, 3, 4, 5, 8, 9, 10].map(i => wordAddress(words[i]));
            must(verifierAddresses.every(a => known.get(a)?.role === 'verifier' && seenDeployments.has(a)), 'POOL_VERIFIER_DEPLOYMENTS');
            state = { scope: derivePrivatePoolScope(chain, pool, words[0]), policy: words[1], deploymentDomain: words[0], authorities, versions: { SOL: 1n, BTC: 1n }, leaves: [], spent: [], admissions: [], solEffects: [], btcEffects: [], revoked: { SOL: [], BTC: [] }, permits: new Map(), sequence: 0n, liveReservations: 0, liveOutputNotes: 0, balance: 0n };
            roots.push({ root: new PrivateNoteTree().root, commitments: [], evidenceRefs: [...rawRefs, ...protocolRefs].filter((x, i, a) => a.indexOf(x) === i) });
            classification = 'POOL_DEPLOYMENT';
          } else if (known.has(deployed)) {
            const d = known.get(deployed); must(value === 0n && sha(rawBytes(input)) === d.creationBytecodeSha256 && receipt.logs.length === 0 && !seenDeployments.has(deployed), 'DEPLOYMENT_PIN');
            seenDeployments.add(deployed); classification = d.role === 'verifier' ? 'VERIFIER_DEPLOYMENT' : d.role === 'bootstrap-contract' ? 'REVIEWED_BOOTSTRAP_DEPLOYMENT' : 'LIBRARY_DEPLOYMENT';
          } else { classification = 'UNRESOLVED_METADATA'; addIssue('PC24_EVM_UNKNOWN_DEPLOYMENT', 'Creation does not match a reviewed public compiler/deployment pin', txid); }
        } else if (target !== pool) {
          // An exact 21000-gas empty-data transfer is retained as public funding,
          // including addresses/nonces/amounts. It does not imply common intent.
          if (input === '0x' && value > 0n && gasUsed === 21000n && receipt.logs.length === 0 && !known.has(target)) classification = 'SIMPLE_FUNDING';
          else { classification = 'UNRESOLVED_METADATA'; addIssue('PC24_EVM_UNKNOWN_EXTERNAL_TRANSACTION', 'Successful nonpayment EVM activity requires explicit metadata review', txid); }
        } else {
          must(state && !stateBroken, 'POOL_HISTORY_UNAVAILABLE');
          const selector = summary.selector, mode = MODES[selector];
          must(mode || ['71a91281', 'e8e60d3d'].includes(selector), 'UNKNOWN_POOL_CALL');
          must(receipt.contractAddress === null && receipt.logs.every(l => address(l.address) === pool), 'UNEXPECTED_EXTERNAL_LOG');
          const logs = receipt.logs.map(l => parseLog(l, tx, receipt, block));
          must(new Set(logs.map(l => l.index)).size === logs.length && logs.every((l, i) => !i || BigInt(l.index) > BigInt(logs[i - 1].index)), 'LOG_ORDER');
          // Transactional copy: a malformed/mismatching receipt never partially
          // advances our trusted root history or authority version.
          const next = structuredClone(state), beforeTree = new PrivateNoteTree(state.leaves), inserted = [];
          let data, kind, nullifier = null, advance = false;
          const expectLogs = names => must(JSON.stringify(logs.map(l => l.name)) === JSON.stringify(names), 'POOL_EVENT_SEQUENCE');
          if (mode) {
            [kind] = mode; const words = decodePublicCohortProofCalldata(input, selector, mode[1]);
            must(publicWordHash(words, 0) === state.scope && publicWordHash(words, 8) === state.policy, 'PUBLIC_DOMAIN');
            must(wordUint(words[16]) === timestamp / 600n, 'PUBLIC_EPOCH');
            if (kind !== 'DEPOSIT') {
              const memberRoot = publicWordHash(words, 17); must(roots.some(r => r.root === memberRoot), 'UNKNOWN_MEMBERSHIP_ROOT');
              nullifier = publicWordHash(words, 25); must(nullifier !== ZERO_NOTE_HASH && !next.spent.includes(nullifier), 'NULLIFIER_REUSE'); next.spent.push(nullifier);
            }
            must(kind === 'DEPOSIT' || value === 0n, 'NONPAYABLE_VALUE'); advance = true;
            if (kind === 'DEPOSIT') {
              const amount = wordUint(words[17]); must(amount > 0n && value === amount, 'DEPOSIT_VALUE');
              inserted.push(publicWordHash(words, 18)); next.liveOutputNotes++; next.balance += amount;
              data = { amountWei: amount.toString(), commitment: inserted[0] }; expectLogs(['StateAdvanced']);
            } else if (kind === 'RESERVE') {
              must(publicWordHash(words, 57) === beforeTree.root && wordUint(words[65]) === state.sequence, 'RESERVE_GUARDS');
              const admission = publicWordHash(words, 49); must(admission !== ZERO_NOTE_HASH && !next.admissions.includes(admission), 'ADMISSION_REUSE'); next.admissions.push(admission);
              must(next.liveOutputNotes > 0, 'NO_LIVE_BALANCE'); next.liveReservations++;
              inserted.push(publicWordHash(words, 33), publicWordHash(words, 41));
              data = { root: publicWordHash(words, 17), expectedPostRoot: publicWordHash(words, 66), reservedCommitment: inserted[0], changeCommitment: inserted[1] }; expectLogs(['StateAdvanced']);
            } else if (kind === 'TERMINAL') {
              must(next.liveReservations > 0, 'NO_LIVE_RESERVATION'); next.liveReservations--; next.liveOutputNotes += 2;
              const statementHash = sha(Buffer.concat([Buffer.from([0x17]), ...words.map(rawBytes)]));
              const effects = { SOL: publicWordHash(words, 33), BTC: publicWordHash(words, 41) };
              for (const role of ['SOL', 'BTC']) {
                const effect = effects[role], list = role === 'SOL' ? next.solEffects : next.btcEffects;
                must(effect !== ZERO_NOTE_HASH && !list.includes(effect) && !next.revoked[role].includes(effect), 'EFFECT_REUSE_OR_REVOKED'); list.push(effect);
                const p = next.permits.get(`${role}:${effect}:${statementHash}:${next.versions[role]}`);
                must(p && p.observedAt <= timestamp && timestamp < p.validUntil, 'TERMINAL_CURRENT_PERMIT');
              }
              inserted.push(publicWordHash(words, 49), publicWordHash(words, 57));
              data = { originalAroot: publicWordHash(words, 17), solEffectTag: effects.SOL, btcEffectTag: effects.BTC, solOutputCommitment: inserted[0], btcOutputCommitment: inserted[1], statementHash, solAuthorityVersion: next.versions.SOL.toString(), btcAuthorityVersion: next.versions.BTC.toString() }; expectLogs(['StateAdvanced']);
            } else {
              const amount = wordUint(words[33]), recipient = `0x${words.slice(34).map(w => wordUint(w, 32).toString(16).padStart(8, '0')).join('')}`;
              must(amount > 0n && recipient !== `0x${'0'.repeat(40)}` && next.liveOutputNotes > 0 && next.balance >= amount, 'WITHDRAWAL_TERMS');
              next.liveOutputNotes--; next.balance -= amount;
              data = { amountWei: amount.toString(), noteClass: selector === '6e359c06' ? 'BALANCE' : 'PAYOUT', recipient, root: publicWordHash(words, 17) };
              expectLogs(['StateAdvanced', 'Withdrawal']); must(JSON.stringify(logs[1].values) === JSON.stringify([recipient, amount.toString(), nullifier]), 'WITHDRAWAL_EVENT');
            }
          } else if (selector === '71a91281') {
            kind = 'PERMIT'; const w = staticWords(input, selector, 6), c = wordUint(w[0], 8), role = c === 1n ? 'SOL' : c === 2n ? 'BTC' : null;
            must(role && sender === state.authorities[role] && value === 0n, 'PERMIT_AUTHORITY');
            const version = wordUint(w[3]), observedAt = wordUint(w[4]), validUntil = wordUint(w[5]), effect = w[1], statement = w[2];
            must(version === state.versions[role] && effect !== ZERO_NOTE_HASH && statement !== ZERO_NOTE_HASH && !state.revoked[role].includes(effect), 'PERMIT_BINDING');
            must(observedAt <= timestamp && timestamp < validUntil && validUntil > observedAt && validUntil - observedAt <= 30n, 'PERMIT_LEASE');
            const key = `${role}:${effect}:${statement}:${version}`, previous = next.permits.get(key);
            must(observedAt > (previous?.observedAt ?? 0n), 'PERMIT_REPLAY'); next.permits.set(key, { observedAt, validUntil });
            expectLogs(['FinalityPermitRecorded']);
            const keyHash = permitKey(next, chain, pool, c, effect, statement, version), commitment = sha(Buffer.concat([rawBytes(keyHash), be(observedAt, 8), be(validUntil, 8)]));
            must(JSON.stringify(logs[0].values) === JSON.stringify([c.toString(), effect, statement, version.toString(), observedAt.toString(), validUntil.toString(), commitment]), 'PERMIT_EVENT');
            data = { nativeChain: role, effectHash: effect, statementHash: statement, authorityVersion: version.toString(), observedAt: observedAt.toString(), validUntil: validUntil.toString(), observationTime: getTime(observedAt.toString(), { kind: 'PERMIT_OBSERVATION', txid, block }) };
          } else {
            const w = staticWords(input, selector, 3), c = wordUint(w[0], 8), role = c === 1n ? 'SOL' : c === 2n ? 'BTC' : null;
            must(role && sender === state.authorities[role] && value === 0n && w[1] !== ZERO_NOTE_HASH && w[2] !== ZERO_NOTE_HASH, 'ADVERSE_BINDING');
            if (state.revoked[role].includes(w[1])) expectLogs([]);
            else {
              next.revoked[role].push(w[1]); next.versions[role]++; advance = true;
              expectLogs(['AdverseFactRecorded', 'StateAdvanced']);
              must(JSON.stringify(logs[0].values) === JSON.stringify([c.toString(), w[1], w[2], next.versions[role].toString()]), 'ADVERSE_EVENT');
            }
            // The finite two-owner successful template has no adverse flow;
            // retain public versions accurately but do not silently treat it as
            // a covered functional cohort.
            addIssue('PC24_EVM_ADVERSE_TEMPLATE_UNSUPPORTED', 'Public authority revocation changes the reviewed successful-cohort template', txid);
          }
          const tree = new PrivateNoteTree(next.leaves); for (const cm of inserted) { tree.append(cm); next.leaves.push(cm); }
          if (kind === 'RESERVE') must(tree.root === data.expectedPostRoot, 'RESERVE_POST_ROOT');
          if (advance) {
            next.sequence++; const stateLog = logs.find(l => l.name === 'StateAdvanced');
            must(JSON.stringify(stateLog?.values) === JSON.stringify([next.sequence.toString(), tree.root, privateSpentDigest(next.scope, next.spent), String(next.leaves.length), String(next.spent.length)]), 'STATE_EVENT');
            assertPrivateNoteHeadroom({ leafCount: next.leaves.length, spentCount: next.spent.length, liveReservations: next.liveReservations, liveOutputNotes: next.liveOutputNotes });
          }
          state = next;
          if (advance && !roots.some(r => r.root === tree.root)) roots.push({ root: tree.root, commitments: [...next.leaves], evidenceRefs: [...rawRefs] });
          if (advance) transitions.push({ txid, preRoot: beforeTree.root, postRoot: tree.root, sequence: next.sequence.toString(), insertedCommitments: inserted, nullifier, spentDigest: privateSpentDigest(next.scope, next.spent), evidenceRefs: [...rawRefs] });
          if (kind) {
            const event = { id: nextId(kind), kind, chain: 'EVM', txid, position: summary.position, time: getTime(timestamp.toString(), { kind, txid, block }), metadata, fundingEvidenceRefs: [...rawRefs], evidenceRefs: [...rawRefs], data };
            events.push(event); classification = 'POOL_PUBLIC_EFFECT'; summary.eventId = event.id;
          } else classification = 'POOL_ADVERSE_RECORD';
        }
      } catch (error) {
        classification = 'UNRESOLVED_METADATA'; addIssue(error.message?.startsWith('PC') ? error.message : 'PC24_EVM_INVALID_RECORD', 'Public EVM record failed normalization/reconciliation', txid);
        if (tx?.to?.toLowerCase() === pool || receipt?.contractAddress?.toLowerCase() === pool) stateBroken = true;
      }
      classifications.push({ txid, classification, ...(summary ? { selector: summary.selector, position: summary.position, ...(summary.eventId ? { eventId: summary.eventId } : {}) } : {}), evidenceRefs: [...rawRefs] });
    }
  }
  if (!state) addIssue('PC24_EVM_MISSING_POOL_DEPLOYMENT', 'Complete public history must include pinned pool creation');
  for (const a of known.keys()) if (!seenDeployments.has(a)) addIssue('PC24_EVM_MISSING_KNOWN_DEPLOYMENT', `Reviewed deployment ${a} was not captured`);
  if (knownTemplate?.oneOwnerOnePayment === true) {
    const templateRefs = refs(knownTemplate.evidenceRefs);
    for (const deposit of events.filter(e => e.kind === 'DEPOSIT')) for (const exit of events.filter(e => e.kind === 'EXIT' && e.data.noteClass === 'BALANCE')) {
      if (deposit.metadata.from === exit.data.recipient) publicEdges.push({ kind: 'SAME_INTENT', from: deposit.id, to: exit.id, basis: 'ADDRESS', detail: 'Public D sender equals balance exit recipient under the reviewed one-owner-one-payment template', evidenceRefs: [...new Set([...rawRefs, ...templateRefs])] });
    }
  }
  return {
    events, roots, issues, classifications, transitions, publicEdges, metadataObservations,
    complete: issues.length === 0,
    timesAssigned: events.every(e => e.time && (e.kind !== 'PERMIT' || e.data.observationTime)),
    state: state ? { scope: state.scope, policy: state.policy, root: new PrivateNoteTree(state.leaves).root, sequence: state.sequence.toString(), leaves: [...state.leaves], spentNullifiers: [...state.spent], authorityVersions: { SOL: state.versions.SOL.toString(), BTC: state.versions.BTC.toString() }, authorities: { ...state.authorities }, liveReservations: state.liveReservations, liveOutputNotes: state.liveOutputNotes, poolBalanceWei: state.balance.toString() } : null,
  };
}
