/** Fresh regtest state and wallets under the standard deterministic genesis.
 * Genuine original custody ingress and separate solver only. No claim credit,
 * native payout authority, node restart or public-network acceptance. */
import assert from 'node:assert/strict';
import { createHash, randomBytes } from 'node:crypto';
import { readFile, readdir, readlink, lstat, realpath, mkdir, mkdtemp, writeFile, statfs, open, unlink } from 'node:fs/promises';
import { join, resolve, dirname, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { homedir } from 'node:os';
import { startBitcoinAcceptanceGuard, BITCOIN_ACCEPTANCE_GUARD_POLICY } from './bitcoin-runtime-guard.mjs';
import { createOwnedCombinedBitcoinRuntime, assertOwnedBitcoinRuntime, BITCOIN_REGTEST_GENESIS,
  BITCOIN_TRANSFER_LIMITS, decodeBitcoinTransaction, validateBitcoinTransferWire }
  from '../../../../packages/backend/src/chains/bitcoin/runtime/owned-bitcoin-runtime.mjs';
import { projectRoot } from '../../../../packages/engine/src/chains/shared/runtime-harness.mjs';
import { PRIVATE_RESOURCE_FLOORS } from '../../../../packages/engine/src/crypto/private-resource-policy.mjs';
import { ROOT, FLAT, GOLDEN } from '../../../../packages/proofs/src/catalog.mjs';

const HERE = fileURLToPath(import.meta.url), OPT_IN = '--run-owned-regtest';
const sha = value => createHash('sha256').update(value).digest('hex');
const clone = value => structuredClone(value), absent = error => ['ENOENT', 'ESRCH'].includes(error.code);
const safeCode = error => String(error?.message ?? '').match(/\bBITCOIN_ACCEPTANCE_[A-Z0-9_]+\b/)?.[0]
  ?? (['ENOENT', 'EACCES'].includes(error?.code) ? 'BITCOIN_ACCEPTANCE_LOCAL_INPUT_' + error.code : 'BITCOIN_ACCEPTANCE_ASSERTION_OR_IO_FAILED');
export function assertBitcoinAcceptanceGate(args) { assert.deepEqual(args, [OPT_IN], 'BITCOIN_ACCEPTANCE_EXACT_OPT_IN'); }
function inventoryState(value) {
  return { family: value.family, genesis: value.genesis, asset: value.asset,
    // Extra solver confirmation blocks can mature custody mining rewards. The
    // owned UTXO identities and principals must remain exactly unchanged.
    accounts: value.accounts.map(({ role, endpoint, address, total, utxos }) =>
      ({ role, endpoint, address, total, utxos: utxos.map(({ confirmations, ...coin }) => coin) })),
    feeAudit: value.feeAudit, signingUnresolved: value.signingUnresolved,
    syntheticPrefunding: value.syntheticPrefunding };
}
async function resources() {
  const match = /^MemAvailable:\s+([0-9]+) kB$/m.exec(await readFile('/proc/meminfo', 'utf8'));
  assert.ok(match); const disk = await statfs(projectRoot, { bigint: true });
  const availableRAM = Number(match[1]) * 1024, freeDisk = Number(disk.bavail * disk.bsize);
  assert.ok(availableRAM >= PRIVATE_RESOURCE_FLOORS.availableRAM, 'BITCOIN_ACCEPTANCE_RAM_FLOOR');
  assert.ok(freeDisk >= PRIVATE_RESOURCE_FLOORS.freeDisk, 'BITCOIN_ACCEPTANCE_DISK_FLOOR');
  return { availableRAM, freeDisk };
}
export function isKnownIdleGradleDaemon(first, second) {
  if (!first || !second || !Array.isArray(first.args) || !Array.isArray(second.args)
    || !Array.isArray(first.threadTicks) || !Array.isArray(second.threadTicks) || first.state !== 'S' || second.state !== 'S'
    || first.pid !== second.pid || first.start !== second.start || first.parent !== second.parent
    || first.executable !== '/usr/lib/jvm/java-21-openjdk-amd64/bin/java'
    || second.executable !== first.executable || first.cwd !== second.cwd
    || first.args.at(-2) !== 'org.gradle.launcher.daemon.bootstrap.GradleDaemon') return false;
  const version = first.args.at(-1);
  if (!/^[0-9]+\.[0-9]+(?:\.[0-9]+)?$/.test(version)
    || first.cwd !== join(homedir(), '.gradle/daemon', version)
    || first.args[0] !== first.executable || JSON.stringify(first.args) !== JSON.stringify(second.args)
    || !first.threadTicks.length || JSON.stringify(first.threadTicks) !== JSON.stringify(second.threadTicks)) return false;
  return true;
}
async function gradleSnapshot(pid) {
  const row = await proc(pid); if (!row) return null;
  const executable = await readlink('/proc/' + pid + '/exe'), cwd = await readlink('/proc/' + pid + '/cwd');
  const args = (await readFile('/proc/' + pid + '/cmdline')).toString('utf8').split('\0').filter(Boolean);
  const threadTicks = [];
  for (const name of await readdir('/proc/' + pid + '/task')) {
    const text = await readFile('/proc/' + pid + '/task/' + name + '/stat', 'utf8');
    const fields = text.slice(text.lastIndexOf(') ') + 2).split(/\s+/);
    assert.ok(/^[0-9]+$/.test(name) && /^[0-9]+$/.test(fields[11]) && /^[0-9]+$/.test(fields[12]), 'BITCOIN_ACCEPTANCE_GRADLE_STAT');
    if (fields[0] !== 'S') return null;
    threadTicks.push([name, fields[11], fields[12]]);
  }
  threadTicks.sort((a,b) => Number(a[0]) - Number(b[0]));
  const after = await proc(pid);
  assert.ok(after?.start === row.start && after.parent === row.parent, 'BITCOIN_ACCEPTANCE_GRADLE_IDENTITY_CHANGED');
  return { ...row, executable, cwd, args, threadTicks };
}
async function proc(pid) {
  let text; try { text = await readFile('/proc/' + pid + '/stat', 'utf8'); } catch (error) { if (absent(error)) return null; throw error; }
  const end = text.lastIndexOf(') '), fields = text.slice(end + 2).split(/\s+/);
  assert.ok(text.startsWith(pid + ' (') && end > 0 && /^[0-9]+$/.test(fields[19]), 'BITCOIN_ACCEPTANCE_PROCESS_STAT');
  return { pid, parent: Number(fields[1]), start: fields[19], state: fields[0], rss: Number(fields[21]) * 4096 };
}
async function assertProofHostIdle() {
  for (const path of ['/tmp/lianum-paeg-proof-host.lock', join(ROOT, '.local/proof-workers/active.lock'),
    join(ROOT, '.local/proof-workers-native-ingress-v3/active.lock')]) {
    try { await lstat(path); throw Error('BITCOIN_ACCEPTANCE_PROOF_HOST_BUSY'); }
    catch (error) { if (!absent(error)) throw error; }
  }
}
async function preflight() {
  await assertProofHostIdle();
  assert.equal(process.platform, 'linux'); assert.equal(process.arch, 'x64');
  for (const name of await readdir('/proc')) {
    if (!/^[1-9][0-9]*$/.test(name)) continue;
    try {
      if ((await lstat('/proc/' + name)).uid !== process.getuid()) continue;
      const text = await readFile('/proc/' + name + '/stat', 'utf8'); const comm = text.slice(text.indexOf('(') + 1, text.lastIndexOf(') '));
      if (comm === 'node') {
        // WASM proving is a Node process; the proof locks are the primary
        // interlock and these fixed worker paths cover initialization too.
        const args = (await readFile('/proc/' + name + '/cmdline')).toString('utf8').split('\0').filter(Boolean);
        const fixedWorkers = [join(ROOT, 'proof-workers/worker.mjs'), join(ROOT, 'proof-workers/native-claims-build-worker.mjs'),
          join(GOLDEN, 'src/paeg/proof-worker.mjs')];
        for (const argument of args.slice(1)) {
          if (argument.startsWith('-')) continue;
          const path = resolve(await readlink('/proc/' + name + '/cwd'), argument);
          assert.equal(fixedWorkers.includes(path), false, 'BITCOIN_ACCEPTANCE_PARALLEL_WASM_PROVER');
        }
      }
      if (comm === 'java') {
        const first = await gradleSnapshot(Number(name));
        if (first?.executable === '/usr/lib/jvm/java-21-openjdk-amd64/bin/java'
          && first.args.at(-2) === 'org.gradle.launcher.daemon.bootstrap.GradleDaemon') {
          await new Promise(resolve => setTimeout(resolve, 250));
          if (isKnownIdleGradleDaemon(first, await gradleSnapshot(Number(name)))) continue;
        }
      }
      assert.equal(/^(?:solana-test-val|agave-validator|solana-validato|bitcoind|anvil|bb|nargo|cargo|rustc|java)$/.test(comm), false,
        'BITCOIN_ACCEPTANCE_PARALLEL_HEAVY_WORK');
    } catch (error) { if (!absent(error)) throw error; }
  }
  await resources();
}
const ipv4Loopback = raw => raw.length === 8 && raw.endsWith('7F');
function ipv6Loopback(raw) {
  return raw === '00000000000000000000000001000000'
    || /^0000000000000000FFFF0000[0-9A-F]{6}7F$/i.test(raw);
}
export async function auditOwnedBitcoinSockets(runtime) {
  assertOwnedBitcoinRuntime(runtime); const processState = runtime.processStatus();
  assert.ok(processState.running && !processState.closed); const pid = processState.processId;
  const inodeTargets = new Map();
  for (const name of await readdir('/proc/' + pid + '/fd')) {
    try { const target = await readlink('/proc/' + pid + '/fd/' + name), match = /^socket:\[([0-9]+)\]$/.exec(target);
      if (match) inodeTargets.set(match[1], name); } catch (error) { if (!absent(error)) throw error; }
  }
  const rows = new Map();
  for (const table of ['tcp', 'tcp6', 'udp', 'udp6']) {
    for (const line of (await readFile('/proc/' + pid + '/net/' + table, 'utf8')).trim().split('\n').slice(1)) {
      const fields = line.trim().split(/\s+/); if (!inodeTargets.has(fields[9])) continue;
      const local = fields[1].split(':')[0], remote = fields[2].split(':')[0], loopback = table.endsWith('6') ? ipv6Loopback : ipv4Loopback;
      assert.ok(loopback(local), 'BITCOIN_ACCEPTANCE_NON_LOOPBACK_LOCAL_SOCKET');
      assert.ok(/^0+$/.test(remote) || loopback(remote), 'BITCOIN_ACCEPTANCE_NON_LOOPBACK_REMOTE_SOCKET');
      rows.set(fields[9], { protocol: table, local, remote });
    }
  }
  for (const line of (await readFile('/proc/' + pid + '/net/unix', 'utf8')).trim().split('\n').slice(1)) {
    const fields = line.trim().split(/\s+/); if (!inodeTargets.has(fields[6])) continue;
    assert.equal(fields.length, 7, 'BITCOIN_ACCEPTANCE_NAMED_UNIX_SOCKET');
    rows.set(fields[6], { protocol: 'unix', ownedInternal: true });
  }
  for (const [inode, fd] of inodeTargets) if (!rows.has(inode)) {
    try { assert.notEqual(await readlink('/proc/' + pid + '/fd/' + fd), 'socket:[' + inode + ']', 'BITCOIN_ACCEPTANCE_SOCKET_IDENTITY_UNAVAILABLE'); }
    catch (error) { if (!absent(error)) throw error; }
  }
  assert.ok([...rows.values()].some(row => row.protocol === 'tcp'), 'BITCOIN_ACCEPTANCE_ORIGINAL_RPC_SOCKET_REQUIRED');
  return { loopbackNetworkSockets: [...rows.values()].filter(row => row.protocol !== 'unix').length,
    internalUnixSockets: [...rows.values()].filter(row => row.protocol === 'unix').length, nonLoopbackSockets: 0 };
}
async function sourcePins() {
  const files = new Map();
  async function visit(path) {
    assert.ok([ROOT, FLAT, GOLDEN].some(root => path.startsWith(root + sep)) && path.endsWith('.mjs'), 'BITCOIN_ACCEPTANCE_LOCAL_SOURCE');
    if (files.has(path)) return;
    assert.equal(await realpath(path), path, 'BITCOIN_ACCEPTANCE_SOURCE_PATH');
    const bytes = await readFile(path), source = bytes.toString('utf8');
    files.set(path, { path: relative(ROOT, path), bytes: bytes.length, sha256: sha(bytes) });
    const imports = new Set();
    for (const match of source.matchAll(/\b(?:import|export)\s+(?:[^;'"\n]*?\s+from\s*)?(['"])([^'"]+)\1/g)) imports.add(match[2]);
    for (const match of source.matchAll(/^\s*(?:import|export)\s+(?:[^;'"]*?\s+from\s*)?(['"])([^'"]+)\1/gm)) imports.add(match[2]);
    for (const match of source.matchAll(/\bimport\s*\(\s*(['"])([^'"]+)\1\s*\)/g)) imports.add(match[2]);
    for (const match of source.matchAll(/\bnew\s+URL\s*\(\s*(['"])([^'"]+\.mjs)\1\s*,\s*import\.meta\.url\s*\)/g)) imports.add(match[2]);
    for (const name of imports) {
      if (name.startsWith('node:')) continue;
      if (['@aztec/bb.js', '@noir-lang/noir_js', '@noir-lang/noir_wasm'].includes(name)) continue;
      assert.ok(name.startsWith('.'), 'BITCOIN_ACCEPTANCE_STATIC_IMPORT');
      await visit(resolve(dirname(path), name));
    }
  }
  await visit(HERE); return [...files.values()].sort((a,b) => a.path.localeCompare(b.path));
}
async function executeBitcoinRuntimeAcceptance() {
  assert.equal(arguments.length, 0); assertBitcoinAcceptanceGate(process.argv.slice(2)); await preflight();
  const before = await sourcePins(); const directory = join(ROOT, '.local/bitcoin-runtime-acceptance');
  await mkdir(directory, { recursive: true, mode: 0o700 }); const run = await mkdtemp(join(directory, 'attempt-'));
  const write = (name, value) => writeFile(join(run, name), JSON.stringify(value), { flag: 'wx', mode: 0o600 });
  const report = { schema: 'LIANUM_OWNED_BITCOIN_RUNTIME_ACCEPTANCE_V1', scope: 'runtime-ingress-and-solver-only',
    success: false, publicNetwork: false, deterministicStandardRegtestGenesis: BITCOIN_REGTEST_GENESIS,
    privateCreditEstablished: false, payoutEstablished: false, nativeProcessRestartEstablished: false,
    blockers: ['ORIGINAL_PAYOUT_CONTROLLER_AUTHORITY_REQUIRED'], checks: {}, cleanup: null };
  let pair, errorCode, cleanupPromise, lastResources;
  const closeOwned = async () => {
    if (!pair) return null;
    cleanupPromise ??= (async () => {
      const cleanup = await pair.custody.close(); assert.deepEqual(await pair.graph.close(), cleanup);
      assert.equal(cleanup.ownedProcessStopped, true); assert.equal(cleanup.syntheticWalletsAndLedgerRemoved, true);
      await assert.rejects(pair.custody.inventory(), /RUNTIME_CLOSED/); await assert.rejects(pair.graph.health(), /RUNTIME_CLOSED/);
      report.checks.sharedOriginalCleanupAndClosedFacades = true; report.cleanup = cleanup; return cleanup;
    })();
    return cleanupPromise;
  };
  const guard = startBitcoinAcceptanceGuard(closeOwned, async () => {
    await assertProofHostIdle(); lastResources = await resources();
    if (pair) await auditOwnedBitcoinSockets(pair.custody);
  });
  report.guardPolicy = BITCOIN_ACCEPTANCE_GUARD_POLICY;
  try {
    guard.assertActive();
    pair = await createOwnedCombinedBitcoinRuntime();
    // A signal during bootstrap cannot authorize any following native action.
    if (guard.failure) { await closeOwned(); guard.assertActive(); }
    const { custody, graph } = pair;
    assertOwnedBitcoinRuntime(custody); assertOwnedBitcoinRuntime(graph); assert.equal(custody.close, graph.close);
    assert.equal(custody.metadata.processId, graph.metadata.processId); report.runtimePins = custody.metadata.runtimePins;
    await auditOwnedBitcoinSockets(custody); const health = await custody.health();
    assert.equal(health.networkActive, false); assert.equal(health.connections, 0); report.checks.freshOwnedNodeAndNetworkDisabled = true;
    const asset = sha('UNREGISTERED_BITCOIN_RUNTIME_ACCEPTANCE_ONLY'), depositAdapter = custody.adapter({ asset, route: 'deposit' });
    graph.adapter({ asset }); const initial = await custody.inventory(); await write('inventory-before-private.json', initial);
    async function send(runtime, adapter, amount) {
      guard.assertActive();
      const wireKeyCommitment = randomBytes(32).toString('hex'); let prepared, signed;
      const result = await adapter.transfer({ amount, wireKeyCommitment }, {
        async beforeSign(value) { guard.assertActive(); prepared = clone(value); await adapter.assertPrepared(value);
          assert.equal(value.genesis, BITCOIN_REGTEST_GENESIS); assert.equal(value.intent.amountSatoshi, amount);
          assert.equal(value.intent.wireKeyCommitment, wireKeyCommitment); await auditOwnedBitcoinSockets(runtime); },
        async onSigned(value) { guard.assertActive(); signed = clone(value); const decoded = validateBitcoinTransferWire(value.nativeWire, prepared.intent, { signed: true });
          assert.equal(decoded.unsignedTransaction, prepared.unsignedWire); await write('signed-' + decoded.txid + '-private.json', { prepared, signed }); },
      });
      guard.assertActive(); const record = runtime.transfers.find(row => row.txid === result.nativeId); assert.ok(record);
      assert.equal(record.broadcastAttempts, 1); assert.equal(record.confirmationMiningAttempts, 0);
      assert.equal(record.rawTransaction, signed.nativeWire); assert.equal(decodeBitcoinTransaction(record.rawTransaction).transactionSHA256, result.transactionSHA256);
      assert.equal((await adapter.observe({ nativeId: result.nativeId })).status, 'pending');
      guard.assertActive(); const confirmed = await runtime.confirm(result.nativeId); assert.equal(confirmed.finalized, true);
      assert.equal(confirmed.confirmations, BITCOIN_TRANSFER_LIMITS.minimumConfirmations);
      await assert.rejects(runtime.confirm(result.nativeId), /MINING_ALREADY_USED/);
      const first = await adapter.observe({ nativeId: result.nativeId }), second = await adapter.observe({ nativeId: result.nativeId });
      assert.equal(first.status, 'observed'); assert.deepEqual(first, second); assert.equal(first.nativeWire, record.rawTransaction);
      const retained = runtime.transfers.find(row => row.txid === result.nativeId);
      assert.equal(retained.broadcastAttempts, 1); assert.equal(retained.confirmationMiningAttempts, 1);
      await auditOwnedBitcoinSockets(runtime); await resources(); return { result, record: retained, confirmed };
    }
    const deposit = await send(custody, depositAdapter, '1000000'); const afterDeposit = await custody.inventory();
    assert.equal(BigInt(afterDeposit.escrow.total) - BigInt(initial.escrow.total), 1000000n);
    assert.equal(afterDeposit.feeAudit.transfers.length, 1); assert.equal(afterDeposit.feeAudit.transfers[0].nativeId, deposit.result.nativeId);
    assert.equal(afterDeposit.feeAudit.actualFees, deposit.record.intent.feeSatoshi);
    assert.equal(afterDeposit.signingUnresolved, false); report.checks.originalDepositAndSixConfirmations = true;
    const solver = await send(graph, graph.adapter({ asset, recipientIndex: 1 }), '250000');
    assert.equal(solver.record.intent.sourceScript, graph.sourceScript);
    assert.notEqual(solver.record.intent.sourceScript, custody.roles.escrow.endpoint);
    assert.notEqual(solver.record.intent.sourceScript, custody.roles.depositor.endpoint);
    assert.deepEqual(inventoryState(await custody.inventory()), inventoryState(afterDeposit));
    assert.equal(custody.transfers.length, 1); assert.equal(graph.transfers.length, 1);
    assert.ok(BigInt(graph.syntheticFunding.confirmations) >= 101n); assert.notEqual(graph.syntheticFunding.nativeId, custody.syntheticPrefunding.nativeId);
    await assert.rejects(custody.observe(solver.result.nativeId), /UNKNOWN_SIGNED_IDENTITY/);
    await assert.rejects(graph.observe(deposit.result.nativeId), /UNKNOWN_SIGNED_IDENTITY/);
    report.checks.separateSolverLiquidityAndCustodyNamespaces = true;
    await write('original-records-private.json', { custody: custody.transfers, graph: graph.transfers,
      initial, afterDeposit, final: await custody.inventory() });
    guard.assertActive(); assert.deepEqual(await sourcePins(), before); report.checks.sourceUnchanged = true;
    report.fixedAmountsSatoshi = { deposit: '1000000', solver: '250000' };
    report.observedFeesSatoshi = { deposit: deposit.record.intent.feeSatoshi, solver: solver.record.intent.feeSatoshi };
    report.checks.ownedInodeLoopbackSocketAudits = true; report.success = true;
  } catch (error) { errorCode = guard.failure ?? safeCode(error); report.cleanup = error.cleanup ?? null;
    await write('stopped-private.json', { errorCode, diagnostic: String(error.stack ?? error).slice(0, 8000) });
  } finally {
    try {
      const ended = await guard.finish(); errorCode ??= ended.failure ?? ended.cleanupFailure;
      report.cleanup ??= ended.cleanup; report.latestPeriodicResources = lastResources ?? null;
      report.checks.signalDeadlineAndPeriodicGuardClosed = !ended.failure && !ended.cleanupFailure;
    } catch (error) { errorCode ??= safeCode(error); }
    report.errorCode = errorCode ?? null; report.success &&= !errorCode && report.cleanup?.ownedProcessStopped === true
      && report.cleanup?.syntheticWalletsAndLedgerRemoved === true && report.cleanup?.forced === false;
    report.disclosures = ['Fresh state and synthetic owned wallets under the standard deterministic Bitcoin regtest genesis',
      'Genuine original Bitcoin Core signing, broadcast, UTXO receipt and six mined regtest confirmations',
      'Network disabled and owned socket inodes inspected for loopback; internal unnamed Unix sockets may exist',
      'Trusted same-host native observation; no public consensus, private claims, payout authority or node restart established'];
    await write('report.json', report);
  }
  return { report, reportPath: join(run, 'report.json') };
}
export async function runBitcoinRuntimeAcceptance() {
  assert.equal(arguments.length, 0);
  assertBitcoinAcceptanceGate(process.argv.slice(2));
  const directory = join(ROOT, '.local/bitcoin-runtime-acceptance');
  await mkdir(directory, { recursive: true, mode: 0o700 });
  assert.equal(await realpath(directory), directory, 'BITCOIN_ACCEPTANCE_LOCK_DIRECTORY_PATH');
  const lockPath = join(directory, 'active.lock'), owner = await open(lockPath, 'wx', 0o600);
  const identity = await owner.stat(); let result;
  try {
    await owner.writeFile(JSON.stringify({ pid: process.pid, startedAt: new Date().toISOString(), fixedLocalFixture: true }));
    await owner.sync();
    result = await executeBitcoinRuntimeAcceptance(); return result;
  } finally {
    await owner.close();
    if (result?.report.cleanup?.ownedProcessStopped === true && result?.report.cleanup?.syntheticWalletsAndLedgerRemoved === true) {
      const retained = await lstat(lockPath);
      assert.ok(retained.isFile() && !retained.isSymbolicLink() && retained.ino === identity.ino
        && retained.dev === identity.dev && retained.uid === process.getuid(), 'BITCOIN_ACCEPTANCE_LOCK_OWNER');
      await unlink(lockPath);
    }
  }
}
if (process.argv[1] && resolve(process.argv[1]) === HERE) {
  try { const result = await runBitcoinRuntimeAcceptance(); console.log(JSON.stringify(result)); process.exitCode = result.report.success ? 0 : 1; }
  catch (error) {
    const directory = join(ROOT, '.local/bitcoin-runtime-acceptance'); await mkdir(directory, { recursive: true, mode: 0o700 });
    const attempt = await mkdtemp(join(directory, 'preflight-'));
    await writeFile(join(attempt, 'stopped-private.json'), JSON.stringify({ errorCode: safeCode(error), diagnostic: String(error.stack ?? error) }), { flag: 'wx', mode: 0o600 });
    console.error(safeCode(error)); process.exitCode = 2;
  }
}
