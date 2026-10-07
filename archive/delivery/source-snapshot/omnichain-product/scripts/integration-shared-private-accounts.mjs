import {PRIVATE_RESOURCE_POLICY} from '../src/private-resource-policy.mjs';
/** One explicitly authorized, local-only M26 functional acceptance attempt.
 * This CLI is deliberately inert when imported. It uses the production HTTP,
 * encrypted account, surviving keeper, proof and native-runtime paths. Only
 * coarse facts, pinned source bytes and allowlisted numeric metrics are public.
 * Original receipts, native wires, note identities and account views stay in
 * .local. Public-observer evaluation is NOT_EVALUATED throughout this harness.
 */
import assert from 'node:assert/strict';
import {readFile, writeFile, mkdir, readdir, copyFile, lstat} from 'node:fs/promises';
import {join, dirname, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {randomUUID, createHash} from 'node:crypto';

export const M26_ARGUMENT = '--authorized-local-shared-private-accounts';
export const M26_SOURCE_PROFILE = 'evidence/m26-shared-private-accounts-observer-recovery-v3-source-profile.json';
export const M26_BALANCE_ARGUMENT = '--balance-recovery-only';
export function m26RunProfile(argv){
  const balanceOnly=argv.length===2&&argv[1]===M26_BALANCE_ARGUMENT;
  assert.deepEqual(argv,balanceOnly?[M26_ARGUMENT,M26_BALANCE_ARGUMENT]:[M26_ARGUMENT],'PC26_EXPLICIT_FIXED_LOCAL_AUTHORIZATION');
  return balanceOnly?'BALANCE_RECOVERY_ONLY':'PAID_COHORT';
}
export const M26_TERMS = Object.freeze({budget:'1000000', solCompensation:'500000', amountSol:'3000000', numerator:'1', denominator:'30'});
const sha = value => createHash('sha256').update(value).digest('hex');
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
const safeCode = error => /^([A-Z][A-Z0-9_]{1,100})(?:\n|$)/.exec(error?.message ?? '')?.[1] ?? 'PC26_ACCEPTANCE_ASSERTION_OR_OPERATION_FAILED';
const numeric = value => typeof value === 'number' && Number.isFinite(value) && value >= 0;
const selectNumbers = (value, keys) => Object.fromEntries(keys.filter(key => numeric(value?.[key])).map(key => [key, value[key]]));
const isHash = value => typeof value === 'string' && /^[0-9a-f]{64}$/.test(value);

/** Do not copy whole proof records: recursive A/J/L inputs are private even
 * when a producer calls them publicInputs. No proof bytes or tuples export. */
export function publicProofMetrics(record) {
  assert.ok(record && typeof record === 'object', 'PC26_PROOF_METRICS_RECORD');
  const result = {};
  for (const key of ['classification','mode','operation','target','phase','failedPhase'])
    if (typeof record[key] === 'string' && /^[A-Za-z0-9_-]{1,160}$/.test(record[key])) result[key] = record[key];
  for (const key of ['startedAt','completedAt'])
    if (typeof record[key] === 'string' && /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(record[key])) result[key] = record[key];
  for (const key of ['proofGenerated','verified','zeroKnowledgeEnabled','readiness600SecondWindowExceeded'])
    if (typeof record[key] === 'boolean') result[key] = record[key];
  Object.assign(result, selectNumbers(record, ['maximumPages','witnessMilliseconds','proofMilliseconds','verificationMilliseconds','totalMilliseconds','proofBytes','publicInputCount']));
  for (const key of ['circuitSHA256','sourceSHA256','verificationKeySHA256'])
    if (isHash(record[key])) result[key] = record[key];
  for (const key of ['resources','latestResources','resourcesAfter'])
    if (record[key]) result[key] = selectNumbers(record[key], ['availableRAM','freeDisk','rss','external','arrayBuffers']);
  const usage = record.processResourceUsage ?? record.resourceUsage;
  if (usage) result.processResourceUsage = selectNumbers(usage, ['userCPUTime','systemCPUTime','maxRSS','minorPageFault','majorPageFault','fsRead','fsWrite','voluntaryContextSwitches','involuntaryContextSwitches']);
  if (typeof record.failure?.code === 'string' && /^[A-Z][A-Z0-9_]{1,100}$/.test(record.failure.code)) result.failureCode = record.failure.code;
  return result;
}

export function publicRuntimeResources(record) {
  assert.equal(record?.kind, 'private-owned-runtime-resource-summary', 'PC26_RESOURCE_SUMMARY_REQUIRED');
  const result = {classification:'DIAGNOSTIC_OWNED_RUNTIME_NUMERIC_RESOURCE_TELEMETRY', diagnosticOnly:true, floorsUnchanged:record.floorsUnchanged === true, resourcePolicy:record.resourcePolicy??null};
  if(result.resourcePolicy)assert.deepEqual(result.resourcePolicy,PRIVATE_RESOURCE_POLICY,'PC26_RESOURCE_POLICY');
  Object.assign(result, selectNumbers(record, ['elapsedMilliseconds','sampleCount','persistedSampleCount','attemptedSampleWrites','droppedOverlapCount','recordLimitCount','diagnosticReadFailures','diagnosticWriteFailures','writeTimeouts','minimumAvailableRAM','minimumFreeDisk','controllerPeakRSS','controllerPeakExternal','controllerPeakArrayBuffers','periodMs','maxPersistedSamples','retainedRawSamples']));
  result.stages = selectNumbers(record.stages, ['STARTUP','NATIVE_STARTED','ALL_RUNTIMES_STARTED','BEFORE_HEAVY','AFTER_HEAVY','PERIODIC','GUARD_ABORT','BEFORE_CLOSE','AFTER_CLOSE']);
  result.processPeaks = Object.fromEntries(['evm','btc','sol'].map(role => {
    const peak = record.processPeaks?.[role];
    return [role, {exitedObserved:peak?.exitedObserved === true, ...selectNumbers(peak, ['samples','rssBytes','pssBytes','privateBytes','anonymousBytes','rssAnonBytes','rssFileBytes','rssShmemBytes','swapBytes','highWaterRSSBytes','threads'])}];
  }));
  result.exactOwnedRuntimesExited = Object.values(result.processPeaks).every(peak => peak.exitedObserved);
  if (/^[A-Z][A-Z0-9_]{1,100}$/.test(record.faultCode ?? '')) result.faultCode = record.faultCode;
  return result;
}

/** Only material custody/native counters enter the public report or equality
 * checks; normal block advancement does not masquerade as new exposure. */
export function publicPoolCounters(inspected, registry) {
  assert.equal(inspected.trackedAssetPoolCount, 2, 'PC26_TWO_SHARED_ASSET_POOLS');
  return registry.map(asset => {
    const s = inspected.pools.find(pool => pool.assetId === asset.assetId)?.snapshot;
    assert.ok(s, 'PC26_ORIGINAL_POOL_REQUIRED');
    return {kind:asset.kind, leaves:s.leafCount, spent:s.spentCount, liveReservations:s.liveReservations, liveOutputNotes:s.liveOutputNotes,
      solEffects:s.solEffectCount, btcEffects:s.btcEffectCount, backedAmount:s.backedAmount, assetBalance:s.assetBalance, deficit:s.assetDeficit};
  });
}

export function requireCommandOutcome(snapshot, requestId, expectedError = null) {
  const row = snapshot.requests.find(row => row.id === requestId) ?? (snapshot.lastControl?.id === requestId ? snapshot.lastControl : null);
  assert.ok(row, 'PC26_COMMAND_RESULT_MISSING');
  assert.equal(row.state, expectedError ? 'FAILED' : 'FINISHED', row.errorCode ?? 'PC26_COMMAND_NOT_FINISHED');
  assert.equal(row.errorCode, expectedError, 'PC26_UNEXPECTED_COMMAND_ERROR');
  return row;
}

async function readJSON(path, maximum = 2 * 1024 * 1024) {
  const stat = await lstat(path);
  assert.ok(stat.isFile() && !stat.isSymbolicLink() && stat.size <= maximum, 'PC26_EVIDENCE_READ_BOUND');
  const bytes = await readFile(path);
  assert.ok(bytes.length <= maximum, 'PC26_EVIDENCE_READ_BOUND');
  return {bytes, value:JSON.parse(bytes)};
}
async function names(path) {
  try { const entries = await readdir(path); assert.ok(entries.length <= 20_000, 'PC26_EVIDENCE_FILE_BOUND'); return entries.sort(); }
  catch (error) { if (error.code === 'ENOENT') return []; throw error; }
}
async function records(path, include = () => true) {
  const selected = (await names(path)).filter(name => /^[A-Za-z0-9_.-]+\.json$/.test(name) && include(name));
  assert.ok(selected.length <= 4096, 'PC26_AUDIT_RECORD_BOUND');
  const result = [];
  for (const name of selected) { const record = await readJSON(join(path, name)); result.push({name, ...record}); }
  return result;
}
async function bounded(work, milliseconds, code) {
  let timer;
  try { return await Promise.race([Promise.resolve().then(work), new Promise((_, reject) => { timer = setTimeout(() => reject(Error(code)), milliseconds); })]); }
  finally { clearTimeout(timer); }
}

export async function runSharedPrivateAccountsAcceptance(argv = process.argv.slice(2)) {
  const runProfile=m26RunProfile(argv),balanceOnly=runProfile==='BALANCE_RECOVERY_ONLY';
  const {startLocalServer} = await import('../src/server.mjs');
  const {projectRoot} = await import('../src/chains/runtime-harness.mjs');
  const {createPrivateAccountCohortService, PRIVATE_ACCOUNT_COHORT_PROFILE} = await import('../src/private-account-cohort-service.mjs');
  const {PRIVATE_WALLET_SOURCE_PROFILE, checkPrivateWalletSourcePrerequisites} = await import('../src/private-wallet-prerequisites.mjs');
  const {isPrivateWalletExitReceipt} = await import('./lib/private-wallet-exit-receipts.mjs');
  const runId = new Date().toISOString().replace(/[:.]/g, '-');
  const folder = join(projectRoot, 'evidence/m26-shared-account-native', runId);
  const local = join(projectRoot, '.local', 'shared-account-client-' + runId);
  const file = join(folder, 'report.json');
  await mkdir(folder, {recursive:true});
  await mkdir(local, {recursive:true, mode:0o700});
  const started = performance.now(), deadline = started + 180 * 60_000;
  const report = {schemaVersion:1, runId, startedAt:new Date().toISOString(), phase:'preflight', classification:'IN_PROGRESS_ACTUAL_SHARED_PRIVATE_ACCOUNTS',
    runProfile, resourcePolicy:PRIVATE_RESOURCE_POLICY, realFunds:false, publicNetwork:false, fullAcceptance:false, actualFunctionalCompleted:false, actualPaidRounds:0, secondActualPaidRoundClaimed:false,
    privacyEvaluation:'NOT_EVALUATED', generalPrivacyClaim:false, performanceBenchmark:false, visualBrowserQA:false, hostileOSCustodyClaimed:false,
    keeperRestartClaimed:false, nodeRestartClaimed:false, originalCustodyRequired:true, ethBackingRetested:false, privateAuditExcluded:true,
    publicObserverInputPolicy:'GLOBAL_O_W_ONLY_NO_PRIVATE_A_J_TUPLES_OR_NATIVE_WIRES', sourceProfile:PRIVATE_WALLET_SOURCE_PROFILE,
    sources:{}, stages:[], actions:[], expectedRefusals:[], cleanup:{attempted:false, completed:false, boundMilliseconds:120_000}};
  const privateRecord = {runId, checkpoints:[], nativeAuditPaths:[]};
  const metricDirectories = ['evidence/m23-wallet-proof-attempts','evidence/m18-proof-attempts'];
  const metricBaseline = new Map();
  let app, history, service, headers, groupId, registry, auditRoot, last = '', functionalFinished = false, runtimeAdmissionAttempted = false;
  const save = () => writeFile(file, JSON.stringify(report, null, 2) + '\n');
  const savePrivate = () => writeFile(join(local, 'private-acceptance-checkpoints.json'), JSON.stringify(privateRecord, null, 2) + '\n', {mode:0o600});
  const request = (url, options = {}) => {
    assert.match(url, /^http:\/\/127\.0\.0\.1:[1-9][0-9]{0,4}(?:\/|$)/, 'PC26_LOOPBACK_ONLY');
    return fetch(url, {...options, redirect:'error', signal:AbortSignal.timeout(20_000)});
  };
  async function connect(instance) {
    const response = await request(instance.origin), html = await response.text();
    assert.equal(response.status, 200, 'PC26_CLIENT_READ');
    const token = html.match(/name="local-token" content="([0-9a-f]+)"/)?.[1];
    assert.ok(token && html.includes('/private-account.mjs'), 'PC26_CLIENT_TOKEN');
    return {'X-Local-Token':token, 'Content-Type':'application/json', Origin:instance.origin};
  }
  async function get(path) {
    const response = await request(app.origin + path, {headers});
    assert.equal(response.status, 200, 'PC26_API_READ');
    assert.equal(response.headers.get('cache-control'), 'no-store', 'PC26_PRIVATE_API_NO_STORE');
    return response.json();
  }
  const status = () => get('/api/private-accounts');
  const view = index => get(`/api/private-accounts/owners/${index}/private`);
  async function post(body, index = null) {
    const path = index === null ? '/api/private-accounts/action' : `/api/private-accounts/owners/${index}/action`;
    const response = await request(app.origin + path, {method:'POST', headers, body:JSON.stringify(body)}), value = await response.json();
    assert.equal(response.status, 202, value.error ?? 'PC26_API_ADMISSION');
    if (value.snapshot?.group) {
      groupId ??= value.snapshot.group.groupId;
      assert.equal(value.snapshot.group.groupId, groupId, 'PC26_ORIGINAL_SHARED_LIFETIME');
      auditRoot ??= join(projectRoot, '.local/private-wallets', groupId);
    }
    return value;
  }
  async function idle() {
    for (;;) {
      assert.ok(performance.now() < deadline, 'PC26_FUNCTIONAL_RUN_BOUND');
      const snapshot = await status(), g = snapshot.group;
      if (g) {
        groupId ??= g.groupId;
        auditRoot ??= join(projectRoot, '.local/private-wallets', groupId);
        assert.equal(g.groupId, groupId, 'PC26_ORIGINAL_SHARED_LIFETIME');
        assert.equal(g.privacyEvaluation, 'NOT_EVALUATED');
        assert.equal(g.transparentFallback, false);
        const stage = {phase:g.phase, state:g.cohort?.state ?? null, round:g.cohort?.roundNumber ?? null,
          counts:g.cohort?.counts ?? null, busy:snapshot.busy, errorCode:g.cohort?.errorCode ?? null};
        const key = JSON.stringify(stage);
        if (key !== last) {
          last = key; report.phase = stage.state ?? stage.phase;
          report.stages.push({at:new Date().toISOString(), ...stage});
          await save(); console.log(JSON.stringify(stage));
        }
      }
      if (!snapshot.busy) { assert.equal(snapshot.storageError, null, 'PC26_STORAGE_ERROR'); return snapshot; }
      await pause(5000);
    }
  }
  async function command(action, extra = {}, index = null, {expectedError = null, replay = false} = {}) {
    const body = {action, requestId:randomUUID(), ...extra};
    await post(body, index);
    if (replay && !['prepare','enroll'].includes(action)) assert.equal((await post(body, index)).replayed, true, 'PC26_COMMAND_REPLAY');
    const snapshot = await idle();
    requireCommandOutcome(snapshot, body.requestId, expectedError);
    if (expectedError) report.expectedRefusals.push({action, errorCode:expectedError});
    else report.actions.push({action, ownerIndex:index, finished:true});
    await save();
    return {snapshot, body};
  }
  async function prepare(index, kind, terms) {
    const {body} = await command('prepare', {assetId:registry.find(asset => asset.kind === 'ERC20').assetId, kind, terms}, index);
    const v = await view(index), original = v.requests.find(row => row.requestId === body.requestId);
    assert.equal(original?.state, 'PREPARED', 'PC26_ORIGINAL_PREPARED_REQUEST');
    assert.equal((await post(body, index)).replayed, true, 'PC26_PREPARE_REPLAY');
    const repeated = (await view(index)).requests.find(row => row.requestId === body.requestId);
    assert.deepEqual(repeated, original, 'PC26_PREPARE_REPLACED_ORIGINAL');
    return original;
  }
  async function execute(index, original) {
    await command('execute', {preparedRequestId:original.requestId}, index, {replay:true});
    const v = await view(index);
    assert.equal(v.requests.find(row => row.requestId === original.requestId)?.state, 'CONFIRMED', 'PC26_ORIGINAL_EXECUTION_UNCONFIRMED');
    return v;
  }
  async function inspect() {
    const value = await service.inspectForTest();
    assert.equal(value.ownerCount, 2, 'PC26_ORIGINAL_OWNERS_REQUIRED');
    return value;
  }
  const counters = async () => publicPoolCounters(await inspect(), registry);
  const authorityRows = () => records(join(auditRoot, 'authority-audit'), name => /-(?:wallet-transition|wallet-action-completed|shared-asset-evm|owner-native-destination)\.json$/.test(name));
  async function nativeRows(index, payment) {
    const v = await view(index), asset = registry.find(asset => asset.kind === 'ERC20');
    const path = join(auditRoot, 'owners', v.accountId, 'assets', asset.assetId, 'operations', payment.operationId, 'native-audit');
    if (!privateRecord.nativeAuditPaths.includes(path)) privateRecord.nativeAuditPaths.push(path);
    return records(path);
  }
  async function nativeFingerprint(payments, {settled = false} = {}) {
    const summary = [];
    for (const index of [0,1]) {
      const rows = await nativeRows(index, payments[index]);
      const signed = rows.filter(row => row.value.kind === 'signed-native-dispatch');
      if (settled) {
        assert.equal(signed.length, 2, 'PC26_EXACTLY_TWO_NATIVE_DISPATCHES_PER_OWNER');
        for (const role of ['sol','btc']) {
          assert.equal(signed.filter(row => row.value.role === role).length, 1, 'PC26_ONE_DISPATCH_PER_ROLE');
          // Certification and the mandatory current-finality permit both
          // observe the same original native effect. They are not resends.
          const certificates = rows.filter(row => row.value.kind === 'native-certificate' && row.value.role === role);
          assert.ok(certificates.length >= 2, 'PC26_ORIGINAL_AND_FRESH_NATIVE_RECEIPTS_REQUIRED');
          const originalEffect = certificates[0].value.envelope.certificate.canonicalEffect;
          assert.ok(originalEffect, 'PC26_ORIGINAL_NATIVE_EFFECT_REQUIRED');
          for (const certificate of certificates) assert.deepEqual(certificate.value.envelope.certificate.canonicalEffect, originalEffect, 'PC26_NATIVE_EFFECT_CHANGED');
        }
        const done = rows.find(row => row.value.kind === 'private-wallet-operation-settled-in-pool')?.value;
        assert.equal(done?.owner.closed, true, 'PC26_OWNER_PROCESS_EXIT_REQUIRED');
        assert.equal(done.owner.writesAfterExit, 0, 'PC26_NO_OWNER_WRITES_AFTER_EXIT');
        assert.equal(rows.find(row => row.value.kind === 'private-settled-operation-process-retirement')?.value.branch, 'CLAIMED', 'PC26_SETTLED_PROCESS_RETIREMENT_REQUIRED');
        for (const role of ['sol','btc']) {
          assert.equal(done.services[role].retainedNativeHandle, true, 'PC26_ORIGINAL_NATIVE_HANDLE_REQUIRED');
          assert.equal(done.services[role].retainedCertificate, true, 'PC26_ORIGINAL_NATIVE_CERTIFICATE_REQUIRED');
          assert.equal(done.services[role].events.filter(event => event.operation === 'native-broadcast-returned').length, 1, 'PC26_EXACTLY_ONE_NATIVE_BROADCAST');
        }
      }
      // Used privately for before/after equality, never assigned to report.
      summary.push(signed.map(row => sha(row.bytes)).sort());
    }
    return summary;
  }
  async function checkpoint(label) {
    const views = [await view(0), await view(1)], runtime = await inspect();
    privateRecord.checkpoints.push({label, at:new Date().toISOString(), views, runtime});
    await savePrivate();
    return {views, runtime};
  }
  async function closeAndReloadHistory(){
    await command('close');
    const terminal = await status();
    assert.equal(terminal.group.phase, 'CLOSED'); assert.equal(terminal.available, false);
    report.closedAfterAllOriginalExits = true;
    await bounded(() => app.close(), 120_000, 'PC26_SERVER_CLOSE_BOUND'); app = null;
    history = await startLocalServer({port:0, directory:join(local, 'history'), sharedAccountDirectory:join(local, 'journal'),
      sharedAccountSessionOptions:{createService:() => { throw Error('PC26_UNEXPECTED_HISTORY_EXECUTION'); }}});
    const historyHeaders = await connect(history), response = await request(history.origin + '/api/private-accounts', {headers:historyHeaders});
    assert.equal(response.status, 200); const restored = await response.json();
    assert.equal(restored.group.groupId, groupId); assert.equal(restored.group.phase, 'CLOSED'); assert.equal(restored.available, false);
    report.closedHistoryReloadedWithoutExecution = true;
    await bounded(() => history.close(), 120_000, 'PC26_HISTORY_CLOSE_BOUND'); history = null;
  }
  async function collectMetrics() {
    const attempts = [];
    for (const path of metricDirectories) {
      const baseline = metricBaseline.get(path);
      if (!baseline) continue;
      for (const name of (await names(join(projectRoot, path))).filter(name => name.endsWith('.json') && !baseline.has(name))) {
        const {bytes, value} = await readJSON(join(projectRoot, path, name));
        attempts.push({source:path + '/' + name, sourceRecordSHA256:sha(bytes), ...publicProofMetrics(value)});
      }
    }
    assert.ok(attempts.length <= 256, 'PC26_PROOF_ATTEMPT_BOUND');
    const value = {classification:'ACTUAL_ATTEMPTS_NUMERIC_METRICS_AND_HASHES_ONLY', attribution:'NEW_FILES_DURING_EXCLUSIVE_LOCAL_ACCEPTANCE_ATTEMPT', attempts};
    const bytes = Buffer.from(JSON.stringify(value, null, 2) + '\n');
    await writeFile(join(folder, 'proof-attempts.json'), bytes);
    report.proofs = {file:'proof-attempts.json', sha256:sha(bytes), attempts:attempts.length,
      completed:attempts.filter(row => row.phase === 'completed' && row.verified === true).length,
      failedOrIncomplete:attempts.filter(row => row.phase !== 'completed' || row.verified !== true).length,
      metricsOnly:true, newCircuitOrKeyClaimed:false};
  }
  try {
    await save();
    assert.equal(PRIVATE_WALLET_SOURCE_PROFILE.file, M26_SOURCE_PROFILE, 'PC26_REVIEWED_SOURCE_PROFILE_REQUIRED');
    await checkPrivateWalletSourcePrerequisites();
    const {value:profile} = await readJSON(join(projectRoot, PRIVATE_WALLET_SOURCE_PROFILE.file), 4 * 1024 * 1024);
    for (const path of [...Object.keys(profile.files), PRIVATE_WALLET_SOURCE_PROFILE.file, 'src/private-wallet-prerequisites.mjs',
      'scripts/integration-shared-private-accounts.mjs','scripts/lib/private-wallet-exit-receipts.mjs','client/private-account.mjs','client/index.html','client/style.css']) {
      if (report.sources[path]) continue;
      assert.ok(!path.startsWith('/') && !path.includes('\\') && !path.split('/').some(part => ['', '.', '..'].includes(part)), 'PC26_SOURCE_PATH');
      const bytes = await readFile(join(projectRoot, path)), target = join(folder, 'source', path);
      report.sources[path] = {bytes:bytes.length, sha256:sha(bytes)};
      await mkdir(dirname(target), {recursive:true}); await copyFile(join(projectRoot, path), target);
    }
    for (const path of metricDirectories) metricBaseline.set(path, new Set(await names(join(projectRoot, path))));
    report.phase = 'opening'; await save();
    app = await startLocalServer({port:0, directory:join(local, 'client'), sharedAccountDirectory:join(local, 'journal'),
      sharedAccountSessionOptions:{createService:(options, dependencies) => {
        assert.equal(service, undefined, 'PC26_ONE_SHARED_SERVICE_LIFETIME');
        service = createPrivateAccountCohortService(options, dependencies); return service;
      }}});
    headers = await connect(app);
    runtimeAdmissionAttempted = true;
    const opened = await command('open', {profile:PRIVATE_ACCOUNT_COHORT_PROFILE}, null, {replay:true});
    assert.equal(opened.snapshot.available, true, 'PC26_SHARED_RUNTIME_OPEN_REQUIRED');
    auditRoot = join(projectRoot, '.local/private-wallets', groupId);
    const initial = await checkpoint('original-two-accounts');
    registry = initial.views[0].registry;
    assert.deepEqual(initial.views[1].registry, registry, 'PC26_SAME_IMMUTABLE_ASSET_REGISTRY');
    assert.deepEqual(registry.map(asset => asset.kind), ['NATIVE','ERC20']);
    assert.equal(registry[1].symbol, 'PALT'); assert.equal(registry[1].decimals, 6);
    assert.notEqual(registry[0].pool, registry[1].pool);
    assert.notEqual(initial.views[0].accountId, initial.views[1].accountId);
    assert.equal(initial.views[0].lifetime, initial.views[1].lifetime, 'PC26_SAME_ISSUER_LIFETIME');
    const assetWallets = initial.runtime.owners.flatMap(owner => owner.assetWalletIds.map(asset => asset.walletId));
    assert.equal(new Set(assetWallets).size, 4, 'PC26_FOUR_INDEPENDENT_ASSET_CUSTODIES');
    assert.notEqual(initial.runtime.owners[0].native.solRecipient, initial.runtime.owners[1].native.solRecipient);
    for(const v of initial.views)for(const chain of ['SOLANA','BITCOIN']){
      const holding=v.nativeHoldings.find(h=>h.chain===chain);
      assert.equal(holding?.observation,'LIVE','PC26_INITIAL_NATIVE_OBSERVATION');
      assert.equal(holding.amountBaseUnits,'0');
    }
    const vaults = [];
    for (const v of initial.views) {
      const {value:envelope} = await readJSON(join(auditRoot, 'owners', v.accountId, 'account.vault'));
      assert.deepEqual(Object.keys(envelope).sort(), ['cipher','ciphertext','kdf','version']);
      assert.equal(envelope.cipher.name, 'aes-256-gcm');
      vaults.push(envelope);
    }
    assert.notEqual(vaults[0].kdf.salt, vaults[1].kdf.salt);
    report.twoIndependentEncryptedOwnerAccounts = true;
    report.sameTwoAssetPoolsAndIssuerLifetime = true;
    const topups=[];
    for (const index of [0,1]) {
      const original=await prepare(index,'topup',{amount:'2500000'});topups.push(original);
      const v = await execute(index, original);
      assert.equal(v.assets.find(asset => asset.assetId === registry[1].assetId).available, '2500000');
      assert.equal(v.assets.find(asset => asset.assetId === registry[0].assetId).available, '0');
    }
    const afterFunding = await counters();
    assert.deepEqual(afterFunding.map(pool => [pool.kind,pool.leaves,pool.spent,pool.liveReservations,pool.liveOutputNotes,pool.solEffects,pool.btcEffects,pool.backedAmount,pool.assetBalance]),
      [['NATIVE',0,0,0,0,0,0,'0','0'],['ERC20',2,0,0,2,0,0,'5000000','5000000']]);
    report.twoPaltTopups = {owners:2, eachBaseUnits:'2500000', totalBackedBaseUnits:'5000000'};
    if(balanceOnly){
      // Each proof may outlast the portfolio freshness window. Read both owners
      // explicitly before asserting current observations.
      for(const index of [0,1])await command('refresh',{},index);
      const funded=await checkpoint('new-fixture-two-owner-funded-balances');
      const originalNotes=funded.views.map(v=>v.assets.find(a=>a.assetId===registry[1].assetId).positions);
      for(const [index,v] of funded.views.entries()){
        assert.deepEqual(originalNotes[index].map(n=>[n.type,n.state,n.amountBaseUnits]),[['OWNER_BALANCE','AVAILABLE','2500000']]);
        for(const chain of ['SOLANA','BITCOIN']){const h=v.nativeHoldings.find(h=>h.chain===chain);assert.equal(h.observation,'LIVE','PC26_LIVE_NATIVE_OBSERVATION');assert.equal(h.amountBaseUnits,'0');assert.equal(h.spendability,'OBSERVATION_ONLY');}
        assert.equal(funded.runtime.owners[index].native.btcRegisteredDestinations,0);
      }
      const generation=(await status()).group.owners[0].status.generationCount;
      await command('restart',{},0);
      await command('reconcile',{preparedRequestId:topups[0].requestId},0);
      assert.equal((await status()).group.owners[0].status.generationCount,generation+1,'PC26_REAL_COORDINATOR_RESTART');
      const recovered=await checkpoint('new-fixture-original-balances-after-restart');
      for(const index of [0,1]){
        assert.equal(recovered.views[index].accountId,funded.views[index].accountId);
        assert.equal(recovered.views[index].lifetime,funded.views[index].lifetime);
        assert.deepEqual(recovered.views[index].registry,registry);
        assert.deepEqual(recovered.runtime.owners[index].assetWalletIds,funded.runtime.owners[index].assetWalletIds);
        assert.deepEqual(recovered.views[index].assets.find(a=>a.assetId===registry[1].assetId).positions,originalNotes[index]);
      }
      assert.deepEqual(await counters(),afterFunding,'PC26_RESTART_CHANGED_ORIGINAL_POOL');
      report.coordinatorRestart={ownerIndex:0,originalAccountAndCustodyRetained:true,originalNotesRetained:true,nativeResend:false,newFixture:true,afterPaidRound:false};
      const waiting=await prepare(0,'payment',M26_TERMS);
      await command('enroll',{preparedRequestId:waiting.requestId,consentToWait:true,expiresAt:Date.now()+15*60_000},0);
      await command('start',{},null,{expectedError:'PC26_ROUND_NOT_READY'});
      const waitingStatus=(await status()).group.cohort;
      assert.equal(waitingStatus.state,'WAITING_FOR_COHORT');assert.equal(waitingStatus.joined,1);
      assert.deepEqual(waitingStatus.counts,{joined:1,reservations:0,solCompleted:0,btcCompleted:0,settled:0});
      assert.deepEqual(await counters(),afterFunding,'PC26_WAITING_RESERVED_OR_SPENT');
      assert.equal((await nativeRows(0,waiting)).length,0,'PC26_WAITING_CREATED_NATIVE_HOST');
      await command('cancel',{},0);assert.equal((await status()).group.cohort.state,'CANCELLED_NO_DISPATCH');
      await command('next');assert.equal((await status()).group.cohort.roundNumber,2);
      assert.deepEqual(await counters(),afterFunding,'PC26_CANCEL_CHANGED_POOL');
      report.reuse={newFixture:true,afterPaidRound:false,originalBalanceEnrolledInSameAssetPool:true,waitingDidNotReserveOrDispatch:true,explicitCancellation:'CANCELLED_NO_DISPATCH',nextRoundAvailable:true,secondActualPaidRound:false};
      for(const index of [0,1])await execute(index,await prepare(index,'exit',{noteId:originalNotes[index][0].id}));
      for(const index of [0,1])await command('refresh',{},index);
      const empty=await checkpoint('new-fixture-two-original-balance-exits');
      for(const v of empty.views)for(const a of v.assets){for(const k of ['available','pending','unavailable'])assert.equal(a[k],'0');assert.equal(a.backing.liabilities,'0');assert.equal(a.backing.held,'0');assert.ok(a.positions.every(n=>['SPENT','WITHDRAWN','DISCARDED'].includes(n.state)));}
      report.finalCounters=await counters();
      assert.deepEqual(report.finalCounters,[{kind:'NATIVE',leaves:0,spent:0,liveReservations:0,liveOutputNotes:0,solEffects:0,btcEffects:0,backedAmount:'0',assetBalance:'0',deficit:'0'},{kind:'ERC20',leaves:2,spent:2,liveReservations:0,liveOutputNotes:0,solEffects:0,btcEffects:0,backedAmount:'0',assetBalance:'0',deficit:'0'}]);
      const rows=await authorityRows(),exits=rows.filter(r=>r.value.receipt?.status==='0x1'&&isPrivateWalletExitReceipt(r.value));
      assert.equal(exits.length,2,'PC26_TWO_ORIGINAL_BALANCE_EXITS');assert.equal(new Set(exits.map(r=>r.value.receipt.transactionHash)).size,2);
      report.originalBalanceNotesWithdrawnExactlyOnce=2;
      report.foreignNativeTransfers=0;report.payoutExitsRetested=false;report.paidRoundStateReused=false;
      await closeAndReloadHistory();functionalFinished=true;
    }else{
    const payments = [await prepare(0, 'payment', M26_TERMS), await prepare(1, 'payment', M26_TERMS)];
    assert.notEqual(payments[0].operationId, payments[1].operationId);
    const enroll = index => command('enroll', {preparedRequestId:payments[index].requestId, consentToWait:true, expiresAt:Date.now() + 15 * 60_000}, index);
    await enroll(0);
    const single = (await status()).group.cohort;
    assert.equal(single.state, 'WAITING_FOR_COHORT'); assert.equal(single.joined, 1);
    await command('start', {}, null, {expectedError:'PC26_ROUND_NOT_READY'});
    assert.deepEqual(await counters(), afterFunding, 'PC26_SINGLE_OWNER_START_EXPOSURE');
    assert.deepEqual(await nativeFingerprint(payments), [[],[]], 'PC26_SINGLE_OWNER_NATIVE_EXPOSURE');
    report.oneOwnerRefusedBeforeReservationOrNativeDispatch = true;
    await enroll(1);
    assert.equal((await status()).group.cohort.state, 'READY_FOR_REVIEW');
    const startedRound = await command('start', {}, null, {replay:true});
    assert.equal(startedRound.snapshot.group.cohort.state, 'SETTLED_IN_POOL');
    assert.deepEqual(startedRound.snapshot.group.cohort.counts, {joined:2,reservations:2,solCompleted:2,btcCompleted:2,settled:2});
    report.actualPaidRounds = 1;
    for (const index of [0,1]) await command('refresh', {}, index);
    const settled = await checkpoint('settled-first-round');
    const originalNotes = [];
    for (const [index, v] of settled.views.entries()) {
      const asset = v.assets.find(asset => asset.assetId === registry[1].assetId);
      assert.equal(asset.observation, 'LIVE'); assert.equal(asset.available, '1500000');
      assert.equal(asset.backing.liabilities, '5000000'); assert.equal(asset.backing.deficit, '0');
      const notes = asset.positions.filter(note => ['AVAILABLE','ISSUED'].includes(note.state));
      assert.equal(notes.length, 3);
      assert.deepEqual(notes.map(note => [note.type,note.amountBaseUnits]).sort(), [['BTC_PAYOUT','500000'],['OWNER_BALANCE','1500000'],['SOL_PAYOUT','500000']]);
      assert.equal(v.requests.find(row => row.requestId === payments[index].requestId)?.state, 'CONFIRMED');
      for (const [chain, amount] of [['SOLANA','3000000'],['BITCOIN','100000']]) {
        const holding = v.nativeHoldings.find(holding => holding.chain === chain);
        assert.equal(holding?.observation, 'LIVE', 'PC26_LIVE_NATIVE_OBSERVATION');
        assert.equal(holding.amountBaseUnits, amount, 'PC26_OWNER_NATIVE_HOLDING');
        assert.equal(holding.spendability, 'OBSERVATION_ONLY');
      }
      assert.equal(settled.runtime.owners[index].native.btcRegisteredDestinations, 1);
      originalNotes.push(notes);
    }
    const paidCounters = await counters();
    assert.deepEqual(paidCounters[1], {kind:'ERC20',leaves:10,spent:4,liveReservations:0,liveOutputNotes:6,solEffects:2,btcEffects:2,backedAmount:'5000000',assetBalance:'5000000',deficit:'0'});
    const nativeBeforeRestart = await nativeFingerprint(payments, {settled:true});
    const beforeRestart = await authorityRows();
    assert.equal(beforeRestart.filter(row => row.value.receipt?.status === '0x1' && isPrivateWalletExitReceipt(row.value)).length, 0, 'PC26_NO_AUTOMATIC_EXIT');
    report.firstRound = {samePaltPool:true, retainedOwnerChangeEachBaseUnits:'1500000', retainedCompensationNotes:4,
      compensationEachBaseUnits:'500000', solPayments:2, btcPayments:2, ownerFilteredBitcoinTotalBaseUnits:'200000', nativeHoldingsPrivateSpendable:false, sixOriginalNotesRetained:true};
    const generation = (await status()).group.owners[0].status.generationCount;
    await command('restart', {}, 0);
    await command('reconcile', {preparedRequestId:payments[0].requestId}, 0);
    assert.equal((await post(startedRound.body)).replayed, true, 'PC26_SETTLED_START_REPLAY');
    assert.equal((await status()).group.owners[0].status.generationCount, generation + 1, 'PC26_REAL_COORDINATOR_RESTART');
    const recovered = await checkpoint('same-original-notes-after-coordinator-restart');
    for (const index of [0,1]) {
      assert.equal(recovered.views[index].accountId, settled.views[index].accountId);
      assert.equal(recovered.views[index].lifetime, settled.views[index].lifetime);
      assert.deepEqual(recovered.views[index].registry, registry);
      assert.deepEqual(recovered.runtime.owners[index].assetWalletIds, settled.runtime.owners[index].assetWalletIds);
      assert.deepEqual(recovered.views[index].assets.find(asset => asset.assetId === registry[1].assetId).positions, settled.views[index].assets.find(asset => asset.assetId === registry[1].assetId).positions);
    }
    assert.deepEqual(await counters(), paidCounters, 'PC26_RESTART_CHANGED_ORIGINAL_POOL');
    assert.deepEqual(await nativeFingerprint(payments, {settled:true}), nativeBeforeRestart, 'PC26_RESTART_NATIVE_RESEND');
    report.coordinatorRestart = {ownerIndex:0, originalAccountAndCustodyRetained:true, originalNotesRetained:true, originalNativeReceiptsRetained:true, nativeResend:false};
    await command('next');
    assert.equal((await status()).group.cohort.roundNumber, 2);
    const waiting = await prepare(0, 'payment', M26_TERMS);
    assert.equal(waiting.assetId, payments[0].assetId, 'PC26_RETAINED_CHANGE_SAME_ASSET');
    await command('enroll', {preparedRequestId:waiting.requestId, consentToWait:true, expiresAt:Date.now() + 15 * 60_000}, 0);
    await pause(1000);
    const waitingStatus = (await status()).group.cohort;
    assert.equal(waitingStatus.state, 'WAITING_FOR_COHORT'); assert.equal(waitingStatus.joined, 1);
    assert.deepEqual(waitingStatus.counts, {joined:1,reservations:0,solCompleted:0,btcCompleted:0,settled:0});
    assert.deepEqual(await counters(), paidCounters, 'PC26_WAITING_RESERVED_OR_SPENT');
    assert.deepEqual(await nativeFingerprint(payments, {settled:true}), nativeBeforeRestart, 'PC26_WAITING_NATIVE_RESEND');
    assert.equal((await nativeRows(0, waiting)).length, 0, 'PC26_WAITING_CREATED_NATIVE_HOST');
    assert.deepEqual((await view(0)).assets.find(asset => asset.assetId === registry[1].assetId).positions, settled.views[0].assets.find(asset => asset.assetId === registry[1].assetId).positions, 'PC26_WAITING_CHANGED_RETAINED_NOTE');
    await command('cancel', {}, 0);
    assert.equal((await status()).group.cohort.state, 'CANCELLED_NO_DISPATCH');
    await command('next');
    const readyNext = (await status()).group.cohort;
    assert.equal(readyNext.roundNumber, 3); assert.equal(readyNext.state, 'WAITING_FOR_COHORT'); assert.equal(readyNext.joined, 0);
    assert.deepEqual(await counters(), paidCounters, 'PC26_CANCEL_CHANGED_POOL');
    report.reuse = {retainedChangePreparedAndEnrolledInSameAssetPool:true, waitingDidNotReserveOrDispatch:true,
      explicitCancellation:'CANCELLED_NO_DISPATCH', nextRoundAvailable:true, secondActualPaidRound:false};
    await checkpoint('cancelled-second-round-next-round-available');
    for (const index of [0,1]) for (const note of originalNotes[index]) {
      const terms = note.type === 'OWNER_BALANCE' ? {noteId:note.id} : {operationId:note.operationId, role:note.type === 'SOL_PAYOUT' ? 'sol' : 'btc'};
      await execute(index, await prepare(index, 'exit', terms));
    }
    for (const index of [0,1]) await command('refresh', {}, index);
    const empty = await checkpoint('six-original-token-exits');
    for (const v of empty.views) for (const asset of v.assets) {
      for (const key of ['available','pending','unavailable']) assert.equal(asset[key], '0');
      assert.equal(asset.backing.liabilities, '0'); assert.equal(asset.backing.held, '0');
      assert.ok(asset.positions.every(note => ['SPENT','WITHDRAWN','DISCARDED'].includes(note.state)), 'PC26_ORIGINAL_NOTES_NOT_CLOSED');
    }
    report.finalCounters = await counters();
    assert.deepEqual(report.finalCounters[0], {kind:'NATIVE',leaves:0,spent:0,liveReservations:0,liveOutputNotes:0,solEffects:0,btcEffects:0,backedAmount:'0',assetBalance:'0',deficit:'0'});
    assert.deepEqual(report.finalCounters[1], {kind:'ERC20',leaves:10,spent:10,liveReservations:0,liveOutputNotes:0,solEffects:2,btcEffects:2,backedAmount:'0',assetBalance:'0',deficit:'0'});
    const rows = await authorityRows(), exits = rows.filter(row => row.value.receipt?.status === '0x1' && isPrivateWalletExitReceipt(row.value));
    assert.equal(new Set(exits.map(row => row.value.receipt.transactionHash)).size, 6, 'PC26_SIX_DISTINCT_ORIGINAL_EXIT_RECEIPTS');
    assert.equal(exits.length, 6, 'PC26_SIX_ORIGINAL_EXIT_RECEIPTS');
    assert.deepEqual(await nativeFingerprint(payments, {settled:true}), nativeBeforeRestart, 'PC26_EXIT_NATIVE_RESEND');
    report.sixOriginalTokenNotesWithdrawnExactlyOnce = true;
    await closeAndReloadHistory();
    functionalFinished = true;
    }
  } catch (error) {
    report.failedPhase = report.phase;
    report.failureCode = safeCode(error);
    privateRecord.failure = {name:error.name, message:error.message, stack:error.stack};
    // Retain remaining read-only observations before shutting down owned nodes.
    if(app&&service&&registry)try{await bounded(()=>checkpoint('failure-read-only-diagnostics'),20_000,'PC26_DIAGNOSTIC_BOUND');}catch(diagnosticError){privateRecord.diagnosticFailure=safeCode(diagnosticError);}
    process.exitCode = 1;
  } finally {
    if (groupId) auditRoot ??= join(projectRoot, '.local/private-wallets', groupId);
    report.cleanup.attempted = true;
    try {
      await bounded(async () => {
        if (app) { await app.close(); app = null; }
        if (history) { await history.close(); history = null; }
      }, 120_000, 'PC26_CLEANUP_BOUND');
      report.cleanup.closeReturned = true;
      report.cleanup.completed = !runtimeAdmissionAttempted;
    } catch (error) { report.cleanup.errorCode = safeCode(error); report.failureCode ??= report.cleanup.errorCode; process.exitCode = 1; }
    try {
      await collectMetrics();
      if (auditRoot) {
        const telemetry = await records(join(auditRoot, 'authority-audit'), name => /-runtime-resource-summary\.json$/.test(name));
        if (telemetry.length) {
          assert.equal(telemetry.length, 1, 'PC26_ONE_RUNTIME_RESOURCE_SUMMARY');
          const resources = publicRuntimeResources(telemetry[0].value), bytes = Buffer.from(JSON.stringify(resources, null, 2) + '\n');
          await writeFile(join(folder, 'runtime-resource-summary.json'), bytes);
          report.runtime = {resources:{file:'runtime-resource-summary.json', sha256:sha(bytes), sourceSHA256:sha(telemetry[0].bytes),
            exactOwnedRuntimesExited:resources.exactOwnedRuntimesExited, diagnosticOnly:true}};
          report.cleanup.completed = report.cleanup.closeReturned === true && resources.exactOwnedRuntimesExited;
          if (!report.cleanup.completed) report.cleanup.errorCode ??= 'PC26_OWNED_RUNTIME_EXIT_NOT_OBSERVED';
          if (functionalFinished) assert.equal(resources.exactOwnedRuntimesExited, true, 'PC26_OWNED_RUNTIME_EXIT_NOT_OBSERVED');
        } else {
          report.cleanup.errorCode ??= 'PC26_RUNTIME_CLEANUP_UNOBSERVED';
          if (functionalFinished) throw Error('PC26_RESOURCE_SUMMARY_REQUIRED');
        }
        const manifests = await records(join(auditRoot, 'authority-audit'), name => /-cohort-public-manifest-\d+\.json$/.test(name));
        const final = manifests.filter(row => row.value.final).at(-1);
        if (final) report.publicCapture = {classification:final.value.classification, complete:final.value.complete,
          chunks:final.value.chunks.length, bytes:final.value.totalBytes, manifestSHA256:sha(final.bytes), privacyEvaluation:'NOT_EVALUATED', rawTranscriptsRetainedPrivately:true};
        if (functionalFinished) assert.ok(final, 'PC26_FINAL_PUBLIC_CAPTURE_MANIFEST_REQUIRED');
      }
      for (const [path, pin] of Object.entries(report.sources)) assert.equal(sha(await readFile(join(projectRoot, path))), pin.sha256, 'PC26_SOURCE_CHANGED_DURING_RUN');
      report.sourcesUnchanged = Object.keys(report.sources).length > 0;
      if (functionalFinished) {
        assert.ok(report.proofs.attempts > 0, 'PC26_ACTUAL_PROOF_ATTEMPTS_REQUIRED');
        assert.equal(report.proofs.failedOrIncomplete, 0, 'PC26_FAILED_OR_INCOMPLETE_PROOF_ATTEMPT');
      }
    } catch (error) { report.evidenceErrorCode = safeCode(error); report.failureCode ??= report.evidenceErrorCode; process.exitCode = 1; }
    if (!report.cleanup.completed) {
      report.cleanup.errorCode ??= 'PC26_RUNTIME_CLEANUP_UNOBSERVED';
      report.failureCode ??= report.cleanup.errorCode;
      process.exitCode = 1;
    }
    report.actualFunctionalCompleted = functionalFinished && report.cleanup.completed && !report.failureCode;
    report.phase = report.actualFunctionalCompleted ? 'completed' : 'failed';
    report.classification = report.actualFunctionalCompleted
      ? (balanceOnly?'ACTUAL_NEW_TWO_OWNER_BALANCE_FIXTURE_COORDINATOR_RESTART_WAIT_CANCEL_TWO_ORIGINAL_EXITS_NO_FOREIGN_PAYMENTS':'ACTUAL_TWO_SHARED_ASSET_ACCOUNTS_ONE_PAID_COHORT_COORDINATOR_RESTART_WAIT_CANCEL_REUSE_SIX_ORIGINAL_TOKEN_EXITS')
      : 'FAILED_ACTUAL_SHARED_PRIVATE_ACCOUNTS';
    report.finishedAt = new Date().toISOString(); report.elapsedMilliseconds = Math.floor(performance.now() - started);
    await savePrivate(); await save();
  }
  console.log(JSON.stringify({phase:report.phase, evidence:file, classification:report.classification, failureCode:report.failureCode,
    actualPaidRounds:report.actualPaidRounds, privacyEvaluation:'NOT_EVALUATED', cleanup:report.cleanup}));
  return report;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { await runSharedPrivateAccountsAcceptance(); }
  catch (error) { console.error(JSON.stringify({phase:safeCode(error) === 'PC26_EXPLICIT_FIXED_LOCAL_AUTHORIZATION' ? 'rejected-before-attempt' : 'failed', failureCode:safeCode(error)})); process.exitCode = 1; }
}
