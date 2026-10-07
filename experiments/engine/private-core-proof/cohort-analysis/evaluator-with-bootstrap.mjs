/**
 * Bounded, read-only PC24 public-transcript consistency evaluator.
 *
 * This module neither collects RPC data nor reads private execution journals.
 * Its normalized input and detailed result belong in the PRIVATE audit. Only
 * publicCohortMetrics() is an allow-listed publication surface. Completeness is
 * conditional on the adapter's evidence-backed coverage/edge review; it is not
 * a proof that every possible metadata attack has been discovered.
 */
import { createHash } from 'node:crypto';

export const COHORT_PUBLIC_SCHEMA = 'PC24_PUBLIC_TRANSCRIPT_V1';
export const COHORT_PUBLIC_PROFILE = 'TWO_OWNER_UNIFORM_FUNCTIONAL_V1';
export const COHORT_COVERAGE = Object.freeze([
  'evmCalldata', 'evmEvents', 'evmHeaders', 'evmAddressesNoncesValuesGas',
  'evmOrdering', 'poolStateHistory', 'solTransactionsBlocksAccountFunding',
  'btcTransactionsBlocksUtxoFunding', 'nativeTimestampsAndOrdering',
  'eventualExits', 'knownTemplateAndDeployment', 'publicMetadataEdgeReview',
]);
export const COHORT_TERMS = Object.freeze({
  owners: 2, depositWei: '1500000000000000', budgetWei: '1000000000000000',
  outputWei: '500000000000000', solLamports: '3000000', btcSats: '100000',
  solUnitsPerBtcUnit: '30', outputs: 6,
});
const KINDS = ['DEPOSIT', 'RESERVE', 'SOL', 'BTC', 'TERMINAL', 'PERMIT', 'EXIT'];
const EDGE_KINDS = ['SAME_INTENT_BTC_PAYOUT', 'SAME_INTENT_SOL_PAYOUT', 'SAME_INTENT', 'DIFFERENT_INTENT', 'SAME_NATIVE_PAYOUT', 'BEFORE', 'READY_BEFORE', 'BEFORE_READY', 'READY_BEFORE_READY', 'OBSERVATION_ONLY'];
const EDGE_BASES = ['ADDRESS', 'FUNDING', 'CALLDATA', 'EVENT', 'TAG', 'TIMING', 'KNOWN_TEMPLATE', 'OTHER'];
const LIMITATIONS = Object.freeze([
  'Finite feasibility counts are not posterior probabilities, entropy, or a real-world anonymity population.',
  'S.expectedPostRoot equals O.originalAroot: reservation-to-terminal linkage is public.',
  'Public permit effectHash equals the corresponding O effect tag. Secret per-chain HMAC prevents a public-namespace/raw-transaction dictionary from computing that tag without the issuer key; this is not issuer privacy.',
  'An issuer or full-certificate observer can map native effects to public tags; that separate disclosure model is evaluated explicitly when supplied.',
  'The common trusted host/controller, owners, role holders, and colluding services may know routes. Two independent synthetic note/graph keys do not provide hostile-host isolation.',
  'Global network observers, RPC-provider logs, mempool/propagation fingerprints, external address ownership, statistical timing/gas likelihoods, and later activity can reduce ambiguity. Unsupported public edges make this evaluation incomplete.',
  'Raw transcripts, normalized records, private route fingerprints, certificates, and A/J tuples are not public-proof exports. Coverage must retain public data in the private audit rather than hiding it.',
  'The evaluator trusts reviewed normalization and capture completeness. It does not validate consensus, proofs, HMAC keys, independent ownership, or genuine functional execution.',
]);
const exact = (value, keys, at) => {
  if (!value || typeof value !== 'object' || Array.isArray(value) ||
      Object.keys(value).length !== keys.length || !keys.every(k => Object.hasOwn(value, k))) {
    throw new TypeError(`PC24_SCHEMA:${at}:exact fields required`);
  }
};
const check = (condition, at) => { if (!condition) throw new TypeError(`PC24_SCHEMA:${at}`); };
const string = (value, at) => check(typeof value === 'string' && value.length > 0 && value.length <= 4096, at);
const id = (value, at) => check(typeof value === 'string' && /^[A-Za-z0-9_.:/-]{1,200}$/.test(value), at);
const uint = (value, at) => {
  check(typeof value === 'string' && /^(0|[1-9][0-9]*)$/.test(value) && value.length <= 78, at);
  return BigInt(value);
};
const hash = (value, at) => check(typeof value === 'string' && /^0x[0-9a-f]{64}$/.test(value), at);
const list = (value, at) => check(Array.isArray(value), at);
const unique = (values, at) => check(new Set(values).size === values.length, at);
const interval = (value, at) => {
  exact(value, ['earliestMs', 'latestMs'], at);
  check(uint(value.earliestMs, at) <= uint(value.latestMs, at), `${at}:inverted interval`);
};
const canonical = value => value && typeof value === 'object'
  ? Array.isArray(value) ? value.map(canonical) : Object.fromEntries(Object.keys(value).sort().map(k => [k, canonical(value[k])]))
  : value;
const digest = value => createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex');
const sorted = values => [...new Set(values)].sort();
const permutations = values => values.length === 0 ? [[]] : values.flatMap((v, i) =>
  permutations(values.filter((_, j) => i !== j)).map(rest => [v, ...rest]));
const choose = (events, kind) => events.filter(e => e.kind === kind);
const positionCompare = (a, b) => {
  for (const key of ['block', 'transaction', 'sub']) {
    const x = BigInt(a.position[key]), y = BigInt(b.position[key]);
    if (x !== y) return x < y ? -1 : 1;
  }
  return 0;
};

/** Strict unknown-field rejection prevents accidentally feeding private A/J or owner journals. */
export function validatePublicCohortTranscript(input) {
  exact(input, ['schema', 'profile', 'evidenceKind', 'runId', 'pool', 'evidence', 'coverage', 'events', 'roots', 'publicEdges'], 'transcript');
  check(input.schema === COHORT_PUBLIC_SCHEMA, 'schema');
  check(input.profile === COHORT_PUBLIC_PROFILE, 'profile');
  check(['SYNTHETIC_FIXTURE', 'ACTUAL_RPC'].includes(input.evidenceKind), 'evidenceKind');
  id(input.runId, 'runId'); string(input.pool, 'pool');
  list(input.evidence, 'evidence');
  const evidenceIds = new Set();
  for (const item of input.evidence) {
    exact(item, ['id', 'sha256', 'kind'], 'evidence item'); id(item.id, 'evidence.id');
    check(!evidenceIds.has(item.id), 'duplicate evidence id'); evidenceIds.add(item.id);
    hash(item.sha256, 'evidence.sha256');
    check(['RAW_PUBLIC_RPC', 'PUBLIC_PROTOCOL_RULE', 'PUBLIC_EDGE_REVIEW', 'SYNTHETIC_FIXTURE'].includes(item.kind), 'evidence.kind');
    if (input.evidenceKind === 'ACTUAL_RPC') check(item.kind !== 'SYNTHETIC_FIXTURE', 'synthetic evidence in actual capture');
  }
  const refs = (value, at, nonempty = true) => {
    list(value, at); if (nonempty) check(value.length > 0, `${at}:missing evidence`);
    unique(value, `${at}:duplicates`);
    for (const ref of value) check(evidenceIds.has(ref), `${at}:unknown evidence ${ref}`);
  };
  exact(input.coverage, COHORT_COVERAGE, 'coverage');
  for (const category of COHORT_COVERAGE) {
    const entry = input.coverage[category]; exact(entry, ['status', 'evidenceRefs', 'detail'], `coverage.${category}`);
    check(['COMPLETE', 'MISSING', 'UNSUPPORTED'].includes(entry.status), 'coverage.status');
    refs(entry.evidenceRefs, `coverage.${category}.evidenceRefs`, entry.status === 'COMPLETE');
    string(entry.detail, `coverage.${category}.detail`);
    if (input.evidenceKind === 'ACTUAL_RPC' && entry.status === 'COMPLETE') {
      const requiredKind = category === 'knownTemplateAndDeployment' ? 'PUBLIC_PROTOCOL_RULE'
        : category === 'publicMetadataEdgeReview' ? 'PUBLIC_EDGE_REVIEW' : 'RAW_PUBLIC_RPC';
      check(entry.evidenceRefs.some(ref => input.evidence.find(e => e.id === ref).kind === requiredKind), `coverage.${category}:missing ${requiredKind}`);
    }
  }
  list(input.events, 'events'); check(input.events.length <= 128, 'bounded event count');
  const eventIds = new Set(), txEffects = new Set();
  for (const event of input.events) {
    exact(event, ['id', 'kind', 'chain', 'txid', 'position', 'time', 'metadata', 'fundingEvidenceRefs', 'evidenceRefs', 'data'], 'event');
    id(event.id, 'event.id'); check(!eventIds.has(event.id), 'duplicate event id'); eventIds.add(event.id);
    check(KINDS.includes(event.kind), 'event.kind');
    check(event.chain === (['SOL', 'BTC'].includes(event.kind) ? event.kind : 'EVM'), 'event.chain');
    string(event.txid, 'event.txid');
    exact(event.position, ['block', 'transaction', 'sub'], 'event.position');
    for (const [key, value] of Object.entries(event.position)) uint(value, `event.position.${key}`);
    const effectKey = `${event.chain}:${event.txid}:${event.position.sub}`;
    check(!txEffects.has(effectKey), 'duplicate canonical public effect'); txEffects.add(effectKey);
    interval(event.time, 'event.time'); refs(event.evidenceRefs, 'event.evidenceRefs');
    refs(event.fundingEvidenceRefs, 'event.fundingEvidenceRefs');
    if (event.chain === 'EVM') {
      exact(event.metadata, ['from', 'to', 'nonce', 'valueWei', 'gasLimit', 'gasUsed', 'gasPriceWei', 'blockTimestampSeconds', 'calldataHash', 'logsHash', 'headerHash'], 'evm metadata');
      string(event.metadata.from, 'evm.from'); string(event.metadata.to, 'evm.to');
      check(event.metadata.to === input.pool, 'event targets another pool');
      for (const key of ['nonce', 'valueWei', 'gasLimit', 'gasUsed', 'gasPriceWei', 'blockTimestampSeconds']) uint(event.metadata[key], `evm.${key}`);
      check(BigInt(event.metadata.gasUsed) <= BigInt(event.metadata.gasLimit), 'evm gas exceeds limit');
      for (const key of ['calldataHash', 'logsHash', 'headerHash']) hash(event.metadata[key], `evm.${key}`);
    } else if (event.chain === 'SOL') {
      exact(event.metadata, ['feePayer', 'feeLamports', 'accountKeys', 'instructionsHash', 'blockHash', 'blockTimeSeconds'], 'sol metadata');
      string(event.metadata.feePayer, 'sol.feePayer'); uint(event.metadata.feeLamports, 'sol.fee');
      list(event.metadata.accountKeys, 'sol.accountKeys'); check(event.metadata.accountKeys.length > 0, 'sol.accountKeys');
      event.metadata.accountKeys.forEach(v => string(v, 'sol.accountKey'));
      hash(event.metadata.instructionsHash, 'sol.instructionsHash'); string(event.metadata.blockHash, 'sol.blockHash');
      uint(event.metadata.blockTimeSeconds, 'sol.blockTimeSeconds');
    } else {
      exact(event.metadata, ['inputOutpoints', 'inputAddresses', 'feeSats', 'rawTransactionHash', 'blockHash', 'blockTimeSeconds'], 'btc metadata');
      for (const key of ['inputOutpoints', 'inputAddresses']) {
        list(event.metadata[key], `btc.${key}`); check(event.metadata[key].length > 0, `btc.${key}`);
        event.metadata[key].forEach(v => string(v, `btc.${key}`));
      }
      unique(event.metadata.inputOutpoints, 'btc duplicate input'); uint(event.metadata.feeSats, 'btc.feeSats');
      hash(event.metadata.rawTransactionHash, 'btc.rawTransactionHash'); string(event.metadata.blockHash, 'btc.blockHash');
      uint(event.metadata.blockTimeSeconds, 'btc.blockTimeSeconds');
    }
    const layouts = {
      DEPOSIT: ['amountWei', 'commitment'],
      RESERVE: ['root', 'expectedPostRoot', 'reservedCommitment', 'changeCommitment'],
      SOL: ['amount', 'source', 'recipient', 'readyTime'],
      BTC: ['amount', 'recipientScript', 'vout', 'readyTime'],
      TERMINAL: ['originalAroot', 'solEffectTag', 'btcEffectTag', 'solOutputCommitment', 'btcOutputCommitment', 'statementHash', 'solAuthorityVersion', 'btcAuthorityVersion'],
      PERMIT: ['nativeChain', 'effectHash', 'statementHash', 'authorityVersion', 'observedAt', 'validUntil', 'observationTime'],
      EXIT: ['amountWei', 'noteClass', 'recipient', 'root'],
    };
    exact(event.data, layouts[event.kind], `${event.kind}.data`);
    for (const [key, value] of Object.entries(event.data)) {
      if (['amount', 'amountWei', 'vout', 'authorityVersion', 'solAuthorityVersion', 'btcAuthorityVersion', 'observedAt', 'validUntil'].includes(key)) uint(value, `${event.kind}.${key}`);
      else if (['readyTime', 'observationTime'].includes(key)) interval(value, `${event.kind}.${key}`);
      else if (key === 'nativeChain') check(['SOL', 'BTC'].includes(value), 'permit.nativeChain');
      else if (key === 'noteClass') check(['BALANCE', 'PAYOUT'].includes(value), 'exit.noteClass');
      else if (['source', 'recipient', 'recipientScript'].includes(key)) string(value, `${event.kind}.${key}`);
      else hash(value, `${event.kind}.${key}`);
    }
  }
  list(input.roots, 'roots'); const rootIds = new Set();
  for (const root of input.roots) {
    exact(root, ['root', 'commitments', 'evidenceRefs'], 'root'); hash(root.root, 'root.root');
    check(!rootIds.has(root.root), 'duplicate root'); rootIds.add(root.root);
    list(root.commitments, 'root.commitments'); unique(root.commitments, 'duplicate root commitment');
    root.commitments.forEach(v => hash(v, 'root.commitment')); refs(root.evidenceRefs, 'root.evidenceRefs');
  }
  list(input.publicEdges, 'publicEdges');
  for (const edge of input.publicEdges) {
    exact(edge, ['kind', 'from', 'to', 'basis', 'detail', 'evidenceRefs'], 'edge');
    // An unknown kind is retained and reported INCOMPLETE, never silently ignored.
    string(edge.kind, 'edge.kind');
    check(eventIds.has(edge.from) && eventIds.has(edge.to) && edge.from !== edge.to, 'edge endpoints');
    check(EDGE_BASES.includes(edge.basis), 'edge.basis'); string(edge.detail, 'edge.detail');
    refs(edge.evidenceRefs, 'edge.evidenceRefs');
    if(['SAME_INTENT_SOL_PAYOUT','SAME_INTENT_BTC_PAYOUT'].includes(edge.kind)){const from=input.events.find(e=>e.id===edge.from),to=input.events.find(e=>e.id===edge.to);check(from.kind==='DEPOSIT'&&to.kind==='EXIT'&&to.data.noteClass==='PAYOUT','bootstrap SOL payout edge endpoints');}
    if (edge.kind === 'SAME_NATIVE_PAYOUT') {
      const from = input.events.find(e => e.id === edge.from), to = input.events.find(e => e.id === edge.to);
      check(['SOL', 'BTC'].includes(from.kind) && to.kind === 'EXIT' && to.data.noteClass === 'PAYOUT', 'native payout edge endpoints');
    }
    if (edge.kind.includes('READY')) {
      const from = input.events.find(e => e.id === edge.from), to = input.events.find(e => e.id === edge.to);
      if (edge.kind.startsWith('READY')) check(['SOL', 'BTC'].includes(from.kind), 'ready edge source');
      if (edge.kind.endsWith('READY')) check(['SOL', 'BTC'].includes(to.kind), 'ready edge target');
    }
  }
  return input;
}

function directLinks(input) {
  const links = [], gaps = [], terminals = choose(input.events, 'TERMINAL'), reserves = choose(input.events, 'RESERVE');
  for (const terminal of terminals) {
    const matches = reserves.filter(reserve => reserve.data.expectedPostRoot === terminal.data.originalAroot);
    if (matches.length !== 1) gaps.push(`terminal ${terminal.id}: expected exactly one public S post-root match, found ${matches.length}`);
    for (const reserve of matches) links.push({ kind: 'RESERVE_TO_TERMINAL', from: reserve.id, to: terminal.id, basis: 'S_EXPECTED_POST_ROOT_EQUALS_O_ORIGINAL_A_ROOT' });
    for (const chain of ['SOL', 'BTC']) {
      const tag = terminal.data[chain === 'SOL' ? 'solEffectTag' : 'btcEffectTag'];
      const permits = choose(input.events, 'PERMIT').filter(p => p.data.nativeChain === chain && p.data.effectHash === tag);
      if (!permits.length) gaps.push(`terminal ${terminal.id}: missing matching ${chain} public permit`);
      for (const permit of permits) links.push({ kind: 'PERMIT_TO_TERMINAL', from: permit.id, to: terminal.id, basis: 'PERMIT_EFFECT_HASH_EQUALS_O_EFFECT_TAG', statementMatches: permit.data.statementHash === terminal.data.statementHash });
    }
  }
  for (const reserve of reserves) if (links.filter(l => l.kind === 'RESERVE_TO_TERMINAL' && l.from === reserve.id).length !== 1) {
    gaps.push(`reserve ${reserve.id}: non-unique terminal linkage`);
  }
  for (const permit of choose(input.events, 'PERMIT')) if (links.filter(l => l.kind === 'PERMIT_TO_TERMINAL' && l.from === permit.id).length !== 1) {
    gaps.push(`permit ${permit.id}: unmatched or non-unique terminal linkage`);
  }
  return { links, gaps };
}

/** Directed causal order + interval feasibility. Chain clocks need justified bounds,
 * not an assumption that EVM/SOL/BTC block timestamps form one precise clock. */
function timeFeasible(events, extraEdges) {
  const nodes = new Map(events.map(e => [e.id, e.time])), edges = [...extraEdges];
  for (const event of events.filter(e => ['SOL', 'BTC'].includes(e.kind))) {
    nodes.set(`${event.id}/ready`, event.data.readyTime); edges.push([event.id, `${event.id}/ready`]);
  }
  for (const permit of events.filter(e => e.kind === 'PERMIT')) {
    nodes.set(`${permit.id}/observation`, permit.data.observationTime); edges.push([`${permit.id}/observation`, permit.id]);
  }
  for (const chain of ['EVM', 'SOL', 'BTC']) {
    const ordered = events.filter(e => e.chain === chain).sort(positionCompare);
    for (let i = 1; i < ordered.length; i++) edges.push([ordered[i - 1].id, ordered[i].id]);
  }
  const next = new Map([...nodes.keys()].map(k => [k, new Set()])), degree = new Map([...nodes.keys()].map(k => [k, 0]));
  for (const [from, to] of edges) {
    if (!nodes.has(from) || !nodes.has(to)) return false;
    if (!next.get(from).has(to)) { next.get(from).add(to); degree.set(to, degree.get(to) + 1); }
  }
  const earliest = new Map([...nodes].map(([key, time]) => [key, BigInt(time.earliestMs)]));
  const queue = [...degree].filter(([, d]) => d === 0).map(([key]) => key); let visited = 0;
  while (queue.length) {
    const from = queue.pop(); visited++;
    if (earliest.get(from) > BigInt(nodes.get(from).latestMs)) return false;
    for (const to of next.get(from)) {
      if (earliest.get(to) < earliest.get(from)) earliest.set(to, earliest.get(from));
      degree.set(to, degree.get(to) - 1); if (degree.get(to) === 0) queue.push(to);
    }
  }
  return visited === nodes.size;
}

function projected(rows, key) { return new Set(rows.map(row => JSON.stringify(row[key]))).size; }
function candidates(rows, events, getTargets) {
  return events.map(event => ({ id: event.id, candidates: sorted(rows.flatMap(row => getTargets(row, event.id))) }))
    .map(row => ({ ...row, count: row.candidates.length, forced: row.candidates.length === 1 }));
}
function blankResult(input, direct, issues) {
  return {
    schema: 'PC24_PUBLIC_EVALUATION_V1', profile: input.profile, runId: input.runId, evidenceKind: input.evidenceKind,
    observer: 'PUBLIC_ONLY', transcriptSha256: digest(input), status: 'INCOMPLETE', conclusion: 'NO_PRIVACY_CONCLUSION',
    fullPrivacyAccepted: false, issues, directLinks: direct.links, counts: null, candidateSets: null,
    assignments: [], limitations: [...LIMITATIONS],
  };
}

/** Returns exact consistent assignments, not guessed private truth or a likelihood score. */
export function evaluatePublicCohort(input) {
  validatePublicCohortTranscript(input);
  // Derive direct public links FIRST, even when a later coverage check fails.
  const direct = directLinks(input), issues = [...direct.gaps];
  for (const category of COHORT_COVERAGE) if (input.coverage[category].status !== 'COMPLETE') issues.push(`coverage ${category}: ${input.coverage[category].status}`);
  for (const edge of input.publicEdges) if (!EDGE_KINDS.includes(edge.kind)) issues.push(`unrecognized public edge ${edge.kind}: ${edge.from} -> ${edge.to}`);
  for (const kind of ['DEPOSIT', 'RESERVE', 'SOL', 'BTC', 'TERMINAL']) if (choose(input.events, kind).length !== 2) issues.push(`${kind}: expected exactly two records`);
  if (choose(input.events, 'EXIT').length !== 6) issues.push('EXIT: six eventual exits required; retained notes are not exit coverage');
  const roots = new Map(input.roots.map(r => [r.root, new Set(r.commitments)]));
  for (const event of input.events) {
    for (const key of ['root', 'expectedPostRoot', 'originalAroot']) if (event.data[key] && !roots.has(event.data[key])) issues.push(`${event.id}: missing public membership snapshot ${key}`);
  }
  const result = blankResult(input, direct, issues);
  if (issues.length) return result;
  const ev = input.events, byId = new Map(ev.map(e => [e.id, e]));
  const deposits = choose(ev, 'DEPOSIT'), reserves = choose(ev, 'RESERVE'), terminals = choose(ev, 'TERMINAL').sort((a, b) => a.id.localeCompare(b.id));
  const sols = choose(ev, 'SOL'), btcs = choose(ev, 'BTC'), exits = choose(ev, 'EXIT');
  const balanceExits = exits.filter(e => e.data.noteClass === 'BALANCE'), payoutExits = exits.filter(e => e.data.noteClass === 'PAYOUT');
  const reserveFor = new Map(direct.links.filter(l => l.kind === 'RESERVE_TO_TERMINAL').map(l => [l.to, l.from]));
  const fixedIntent = new Map(terminals.map(t => [t.id, t.id]));
  for (const link of direct.links) fixedIntent.set(link.from, link.to);
  const contradictions = [];
  if (balanceExits.length !== 2 || payoutExits.length !== 4) contradictions.push('Known public exit method classes require two balance and four payout withdrawals');
  for (const d of deposits) if (d.data.amountWei !== COHORT_TERMS.depositWei || d.metadata.valueWei !== d.data.amountWei) contradictions.push(`${d.id}: public deposit amount/value contradicts known uniform template`);
  for (const s of sols) if (s.data.amount !== COHORT_TERMS.solLamports) contradictions.push(`${s.id}: SOL amount contradicts known uniform template`);
  for (const b of btcs) if (b.data.amount !== COHORT_TERMS.btcSats) contradictions.push(`${b.id}: BTC amount contradicts known uniform template`);
  for (const x of exits) if (x.data.amountWei !== COHORT_TERMS.outputWei) contradictions.push(`${x.id}: exit amount contradicts known uniform template`);
  for (const permit of choose(ev, 'PERMIT')) {
    if (BigInt(permit.data.observedAt) >= BigInt(permit.data.validUntil)) contradictions.push(`${permit.id}: invalid public observation lease`);
    if (BigInt(permit.data.observedAt) > BigInt(permit.metadata.blockTimestampSeconds)) contradictions.push(`${permit.id}: observedAt is after its EVM inclusion timestamp`);
  }
  for (const terminal of terminals) for (const chain of ['SOL', 'BTC']) {
    const timestamp = BigInt(terminal.metadata.blockTimestampSeconds);
    const version = terminal.data[chain === 'SOL' ? 'solAuthorityVersion' : 'btcAuthorityVersion'];
    const permits = direct.links.filter(l => l.kind === 'PERMIT_TO_TERMINAL' && l.to === terminal.id)
      .map(l => byId.get(l.from)).filter(p => p.data.nativeChain === chain);
    if (!permits.some(p => p.data.statementHash === terminal.data.statementHash && p.data.authorityVersion === version
      && BigInt(p.data.observedAt) <= timestamp && timestamp < BigInt(p.data.validUntil)
      && positionCompare(p, terminal) < 0)) contradictions.push(`${terminal.id}: no included, statement-bound, current-version ${chain} permit at O`);
  }
  // Tags have chain domains: equality across chains is not a duplicate consumption.
  for (const field of ['solEffectTag', 'btcEffectTag']) if (new Set(terminals.map(t => t.data[field])).size !== 2) contradictions.push(`duplicate consumed ${field}`);
  const commitments = [...deposits.map(d => d.data.commitment), ...reserves.flatMap(s => [s.data.reservedCommitment, s.data.changeCommitment]), ...terminals.flatMap(t => [t.data.solOutputCommitment, t.data.btcOutputCommitment])];
  if (new Set(commitments).size !== commitments.length) contradictions.push('duplicate note commitment');
  for (const s of reserves) for (const cm of [s.data.reservedCommitment, s.data.changeCommitment]) if (!roots.get(s.data.expectedPostRoot).has(cm)) contradictions.push(`${s.id}: S post-root excludes its inserted notes`);
  for (const chain of ['EVM', 'SOL', 'BTC']) {
    const positions = ev.filter(e => e.chain === chain).map(e => JSON.stringify(e.position));
    if (new Set(positions).size !== positions.length) contradictions.push(`${chain}: duplicate event position`);
  }
  const baseEdges = input.publicEdges.filter(e => ['BEFORE', 'READY_BEFORE', 'BEFORE_READY', 'READY_BEFORE_READY'].includes(e.kind))
    .map(e => [e.kind.startsWith('READY') ? `${e.from}/ready` : e.from, e.kind.endsWith('READY') ? `${e.to}/ready` : e.to]);
  // These are advertised fixed-template barriers, not private controller order.
  for (const d of deposits) for (const s of reserves) baseEdges.push([d.id, s.id]);
  for (const s of sols) for (const b of btcs) baseEdges.push([s.id, b.id]);
  for (const b of btcs) for (const t of terminals) baseEdges.push([b.id, t.id]);
  for (const link of direct.links) baseEdges.push([link.from, link.to]);
  if (!timeFeasible(ev, baseEdges)) contradictions.push('Public ordering/time intervals contradict the fixed-template barriers');
  if (contradictions.length) return { ...result, status: 'INCONSISTENT', issues: contradictions };
  const outputSlots = terminals.flatMap(t => {
    const s = byId.get(reserveFor.get(t.id));
    return [
      { id: `${t.id}/CHANGE`, intent: t.id, creator: s.id, commitment: s.data.changeCommitment, noteClass: 'BALANCE' },
      { id: `${t.id}/SOL_PAYOUT`, intent: t.id, creator: t.id, commitment: t.data.solOutputCommitment, noteClass: 'PAYOUT' },
      { id: `${t.id}/BTC_PAYOUT`, intent: t.id, creator: t.id, commitment: t.data.btcOutputCommitment, noteClass: 'PAYOUT' },
    ];
  });
  const changes = outputSlots.filter(s => s.noteClass === 'BALANCE'), payouts = outputSlots.filter(s => s.noteClass === 'PAYOUT');
  const exitOrders = permutations(balanceExits).flatMap(bs => permutations(payoutExits).map(ps => [...bs, ...ps]));
  const slots = [...changes, ...payouts], assignments = [];
  for (const ds of permutations(deposits)) for (const ss of permutations(sols)) for (const bs of permutations(btcs)) {
    const owner = new Map(fixedIntent), causal = [...baseEdges], depositToReserve = [], solToTerminal = [], btcToTerminal = [], solToBtc = [];
    let possible = true;
    for (let i = 0; i < 2; i++) {
      const t = terminals[i], r = byId.get(reserveFor.get(t.id)), d = ds[i], s = ss[i], b = bs[i];
      if (!roots.get(r.data.root).has(d.data.commitment) || BigInt(s.data.amount) !== BigInt(b.data.amount) * 30n) { possible = false; break; }
      for (const event of [d, s, b]) owner.set(event.id, t.id);
      causal.push([d.id, r.id], [r.id, s.id], [`${s.id}/ready`, b.id], [`${b.id}/ready`, t.id]);
      for (const link of direct.links.filter(l => l.kind === 'PERMIT_TO_TERMINAL' && l.to === t.id)) {
        const native = byId.get(link.from).data.nativeChain === 'SOL' ? s : b;
        causal.push([`${native.id}/ready`, `${link.from}/observation`]);
      }
      depositToReserve.push([d.id, r.id]); solToTerminal.push([s.id, t.id]); btcToTerminal.push([b.id, t.id]); solToBtc.push([s.id, b.id]);
    }
    if (!possible || !timeFeasible(ev, causal)) continue;
    for (const xs of exitOrders) {
      const thisOwner = new Map(owner), thisCausal = [...causal], exitToOutput = [];
      let compatible = true;
      for (let i = 0; i < slots.length; i++) {
        const x = xs[i], slot = slots[i];
        if (!roots.get(x.data.root).has(slot.commitment)) { compatible = false; break; }
        thisOwner.set(x.id, slot.intent); thisCausal.push([slot.creator, x.id]); exitToOutput.push([x.id, slot.id]);
      }
      if (!compatible) continue;
      for (const edge of input.publicEdges) {
        if(['SAME_INTENT_SOL_PAYOUT','SAME_INTENT_BTC_PAYOUT'].includes(edge.kind)){const output=exitToOutput.find(([exit])=>exit===edge.to)?.[1],role=edge.kind==='SAME_INTENT_SOL_PAYOUT'?'SOL':'BTC';if(thisOwner.get(edge.from)!==thisOwner.get(edge.to)||output!==`${thisOwner.get(edge.from)}/${role}_PAYOUT`)compatible=false;}
        if (edge.kind === 'SAME_INTENT' && thisOwner.get(edge.from) !== thisOwner.get(edge.to)) compatible = false;
        if (edge.kind === 'DIFFERENT_INTENT' && thisOwner.get(edge.from) === thisOwner.get(edge.to)) compatible = false;
        if (edge.kind === 'SAME_NATIVE_PAYOUT') {
          const output = exitToOutput.find(([exit]) => exit === edge.to)?.[1];
          if (output !== `${thisOwner.get(edge.from)}/${byId.get(edge.from).kind}_PAYOUT`) compatible = false;
        }
      }
      if (!compatible || !timeFeasible(ev, thisCausal)) continue;
      const sortPairs = pairs => pairs.slice().sort(([a], [b]) => a.localeCompare(b));
      assignments.push({ depositToReserve: sortPairs(depositToReserve), solToTerminal: sortPairs(solToTerminal), btcToTerminal: sortPairs(btcToTerminal), solToBtc: sortPairs(solToBtc), exitToOutput: sortPairs(exitToOutput) });
    }
  }
  result.status = assignments.length ? 'EVALUATED' : 'INCONSISTENT';
  result.issues = assignments.length ? [] : ['No one-use assignment satisfies all public constraints'];
  result.assignments = assignments;
  if (!assignments.length) return result;
  const nativeProjection = new Set(assignments.map(a => JSON.stringify([a.solToTerminal, a.btcToTerminal])));
  result.counts = { joint: assignments.length, nativeToTerminal: nativeProjection.size, depositToReserve: projected(assignments, 'depositToReserve'), solToBtc: projected(assignments, 'solToBtc'), exitToOutput: projected(assignments, 'exitToOutput') };
  const target = key => (row, eid) => row[key].filter(([from]) => from === eid).map(([, to]) => to);
  result.candidateSets = {
    depositToReserve: candidates(assignments, deposits, target('depositToReserve')),
    solToTerminal: candidates(assignments, sols, target('solToTerminal')),
    btcToTerminal: candidates(assignments, btcs, target('btcToTerminal')),
    solToBtc: candidates(assignments, sols, target('solToBtc')),
    exitToOutput: candidates(assignments, exits, target('exitToOutput')),
  };
  const targets = ['depositToReserve', 'solToTerminal', 'btcToTerminal', 'solToBtc'];
  result.conclusion = targets.every(key => result.candidateSets[key].every(row => row.count > 1))
    ? 'BOUNDED_PUBLIC_AMBIGUITY' : 'FORCED_TARGET_LINKS_REMAIN';
  return result;
}

/** A deliberately separate, PRIVATE observer experiment. Never supply keys or full
 * certificates here: normalize their verified native-effect -> consumption-hash
 * mapping in the private audit. Public-only inputs never accept these mappings. */
export function evaluateCohortIssuerDisclosure(input, disclosure) {
  validatePublicCohortTranscript(input);
  exact(disclosure, ['kind', 'mappings'], 'disclosure');
  check(disclosure.kind === 'PRIVATE_ISSUER_OR_FULL_CERTIFICATE', 'disclosure.kind');
  list(disclosure.mappings, 'disclosure.mappings'); check(disclosure.mappings.length === 4, 'four complete issuer mappings required');
  const copy = structuredClone(input), ids = new Set();
  const mappingEvidence = 'private-disclosure-review';
  check(!copy.evidence.some(e => e.id === mappingEvidence), 'reserved disclosure evidence id');
  copy.evidence.push({ id: mappingEvidence, sha256: `0x${digest(disclosure)}`, kind: input.evidenceKind === 'SYNTHETIC_FIXTURE' ? 'SYNTHETIC_FIXTURE' : 'PUBLIC_EDGE_REVIEW' });
  for (const mapping of disclosure.mappings) {
    exact(mapping, ['effectId', 'nativeChain', 'effectHash'], 'issuer mapping');
    check(!ids.has(mapping.effectId), 'duplicate issuer mapping'); ids.add(mapping.effectId);
    const effect = copy.events.find(e => e.id === mapping.effectId);
    check(effect && effect.kind === mapping.nativeChain && ['SOL', 'BTC'].includes(mapping.nativeChain), 'issuer mapping native effect');
    hash(mapping.effectHash, 'issuer effectHash');
    const permits = copy.events.filter(e => e.kind === 'PERMIT' && e.data.nativeChain === mapping.nativeChain && e.data.effectHash === mapping.effectHash);
    check(permits.length > 0, 'issuer mapping missing public tag');
    for (const permit of permits) copy.publicEdges.push({ kind: 'SAME_INTENT', from: mapping.effectId, to: permit.id, basis: 'TAG', detail: 'Separate private issuer/full-certificate disclosure; unavailable to public observer', evidenceRefs: [mappingEvidence] });
  }
  const evaluated = evaluatePublicCohort(copy);
  evaluated.observer = 'ISSUER_OR_FULL_CERTIFICATE';
  evaluated.transcriptSha256 = digest(input);
  evaluated.disclosureSha256 = digest(disclosure);
  evaluated.limitations.unshift('This result uses private issuer/certificate mappings and must never be represented as a public-only inference.');
  return evaluated;
}

/** Exact amount-only control, intentionally not a full-transcript privacy result. */
export function enumeratePublicAmountPairs(solAmounts, btcAmounts, ratio = '30') {
  check(Array.isArray(solAmounts) && Array.isArray(btcAmounts) && solAmounts.length === 2 && btcAmounts.length === 2, 'two amount pairs required');
  const factor = uint(ratio, 'ratio'); check(factor > 0n, 'positive ratio');
  solAmounts.forEach(v => uint(v, 'SOL amount')); btcAmounts.forEach(v => uint(v, 'BTC amount'));
  const assignments = permutations([0, 1]).filter(order => order.every((j, i) => BigInt(solAmounts[i]) === BigInt(btcAmounts[j]) * factor));
  return { classification: 'AMOUNT_ONLY_CONTROL_NOT_FULL_TRANSCRIPT', assignments, candidateCounts: solAmounts.map((_, i) => new Set(assignments.map(a => a[i])).size), count: assignments.length };
}

export const M23_DISTINCTIVE_AMOUNT_BASELINE = Object.freeze({
  runId: '2026-10-03T09-24-29-226Z',
  source: 'evidence/m23-private-reusable-balance-2026-10-03T09-24-29-226Z.json',
  interpretation: 'Actual sequential two-payment, one-deposit/reused-change run. Original report FAILED before exits; not an actual two-owner cohort or complete privacy evaluation.',
  solAmounts: Object.freeze(['3000000', '3600000']), btcAmounts: Object.freeze(['100000', '120000']),
});

/** Publication allow-list: no record IDs, addresses, tuples, assignment maps or raw
 * route fingerprints escape. A digest is an integrity handle, not anonymization. */
export function publicCohortMetrics(result) {
  check(result?.schema === 'PC24_PUBLIC_EVALUATION_V1', 'evaluation result required');
  check(['PUBLIC_ONLY', 'ISSUER_OR_FULL_CERTIFICATE'].includes(result.observer), 'observer result');
  check(['SYNTHETIC_FIXTURE', 'ACTUAL_RPC'].includes(result.evidenceKind), 'evidence kind result');
  check(['EVALUATED', 'INCOMPLETE', 'INCONSISTENT'].includes(result.status), 'status result');
  check(['NO_PRIVACY_CONCLUSION', 'BOUNDED_PUBLIC_AMBIGUITY', 'FORCED_TARGET_LINKS_REMAIN'].includes(result.conclusion), 'conclusion result');
  check(/^[0-9a-f]{64}$/.test(result.transcriptSha256), 'transcript digest result');
  const counts = result.counts ? Object.fromEntries(['joint', 'nativeToTerminal', 'depositToReserve', 'solToBtc', 'exitToOutput'].map(key => {
    check(Number.isSafeInteger(result.counts[key]) && result.counts[key] >= 0, 'count result'); return [key, result.counts[key]];
  })) : null;
  const sets = result.candidateSets ? Object.fromEntries(Object.entries(result.candidateSets).map(([key, rows]) => [key, {
    candidateCountHistogram: rows.reduce((out, row) => { out[row.count] = (out[row.count] ?? 0) + 1; return out; }, {}),
    forcedCount: rows.filter(row => row.forced).length,
  }])) : null;
  const baseline = enumeratePublicAmountPairs(M23_DISTINCTIVE_AMOUNT_BASELINE.solAmounts, M23_DISTINCTIVE_AMOUNT_BASELINE.btcAmounts);
  return {
    schema: 'PC24_PUBLIC_METRICS_V1', evidenceKind: result.evidenceKind, observer: result.observer,
    status: result.status, conclusion: result.conclusion, fullPrivacyAccepted: false,
    actualCohortEvaluated: result.evidenceKind === 'ACTUAL_RPC' && result.status === 'EVALUATED',
    transcriptSha256: result.transcriptSha256, counts,
    candidateCountHistograms: sets,
    directPublicLinkCounts: {
      reserveToTerminal: result.directLinks.filter(l => l.kind === 'RESERVE_TO_TERMINAL').length,
      permitToTerminal: result.directLinks.filter(l => l.kind === 'PERMIT_TO_TERMINAL').length,
    },
    historicalM23AmountControl: { runId: M23_DISTINCTIVE_AMOUNT_BASELINE.runId, count: baseline.count, candidateCounts: baseline.candidateCounts, completePrivacyBenchmark: false },
    comparison: result.observer !== 'PUBLIC_ONLY' ? 'SEPARATE_ISSUER_DISCLOSURE_NOT_PUBLIC_COMPARISON'
      : result.evidenceKind !== 'ACTUAL_RPC' ? 'SYNTHETIC_ONLY_ACTUAL_COHORT_PENDING'
      : result.status !== 'EVALUATED' ? 'ACTUAL_COHORT_INCOMPLETE_OR_INCONSISTENT'
      : result.counts.solToBtc > baseline.count ? 'MORE_FEASIBLE_NATIVE_PAIRINGS_THAN_M23_AMOUNT_ONLY_CONTROL' : 'NO_NATIVE_PAIRING_IMPROVEMENT_OVER_M23_AMOUNT_ONLY_CONTROL',
    limitations: [...LIMITATIONS],
  };
}
