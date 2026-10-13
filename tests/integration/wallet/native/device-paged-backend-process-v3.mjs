/** Actual backend in its own PID. IPC is a private control/read boundary only;
 * economic commands still use the original signed, encrypted mobile TLS API. */
import assert from 'node:assert/strict';
import { constants } from 'node:fs';
import { open, lstat, realpath } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Vault } from '@lianum/engine/crypto/vault';
import { assertOriginalPagedNativeFinancialSourceV3 } from '@lianum/backend/operations/local/funded-paged-native-source-v3';
import { startOriginalPagedNativeOperatorV3, reopenOriginalPagedNativeOperatorV3,
  readOriginalPagedNativeExecutionContextV3, captureOriginalPagedNativeOperatorV3 } from '@lianum/backend/operations/local/funded-paged-native-operator-v3';
import { readOriginalFundedPagedGraphDeploymentV3 } from '@lianum/backend/operations/local/funded-graph-paged-deployment-v3';
import * as P from '@lianum/mobile-protocol/device/paged-owner-v3';
import {ownedEvmRecoveryStateBoundFailureV1} from '../../../../packages/backend/src/chains/evm/runtime/owned-evm-recovery-state-bound-v1.mjs';
import {ownedPagedHubEvmStateBoundFailureV3} from '../../../../packages/backend/src/chains/evm/runtime/owned-paged-hub-evm-state-v3.mjs';

const root = resolve(fileURLToPath(new URL('../../../../', import.meta.url)));
assert.equal(process.argv.length, 4); assert.equal(process.argv[1], fileURLToPath(import.meta.url));
assert.equal(process.execPath, join(root, '.internal/dev/toolchains/node-v24.19.0-linux-x64/bin/node'));
assert.deepEqual(process.execArgv, ['--max-old-space-size=384']);
assert.equal(process.env.NODE_OPTIONS, undefined); assert.equal(process.env.NODE_PATH, undefined);
assert.ok(process.connected && ['new', 'reopen'].includes(process.argv[2]));
const path = process.argv[3], directory = dirname(path);
assert.equal(resolve(path), path); assert.equal(await realpath(path), path);
assert.equal(dirname(directory), join(root, '.local/device-paged-cold-v3'));
assert.match(directory.slice(dirname(directory).length + 1), /^attempt-[0-9a-f-]{36}$/);
assert.equal(path, join(directory, 'operator.json'));
const dir = await lstat(directory); assert.ok(dir.isDirectory() && !dir.isSymbolicLink()
  && dir.uid === process.getuid() && (dir.mode & 0o777) === 0o700);
const file = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
let bytes, config;
try {
  const before = await file.stat(); assert.ok(before.isFile() && before.nlink === 1
    && before.uid === process.getuid() && (before.mode & 0o777) === 0o600 && before.size <= 32768);
  bytes = await file.readFile(); const after = await file.stat();
  for (const key of ['dev', 'ino', 'size', 'mtimeMs', 'ctimeMs']) assert.equal(before[key], after[key]);
  config = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
} finally { bytes?.fill(0); await file.close(); }
assert.equal(config.journal.path, join(directory, 'authority/account.aead'));
assert.equal(config.nativeDirectory, join(directory, 'provider'));
assertOriginalPagedNativeFinancialSourceV3();
let product, acquisition, work = Promise.resolve(), stopping = false, intentionalDisconnect = false, stopWork;
const send = value => new Promise((resolveSend, reject) => {
  assert.ok(process.connected); process.send(value, error => error ? reject(error) : resolveSend());
});
const failure = error => ({ name: error?.name ?? 'Error',
  code: /^[A-Z][A-Z0-9_]{3,100}$/.test(error?.code ?? '') ? error.code
    : /^[A-Z][A-Z0-9_]{3,100}$/.test(error?.message ?? '') ? error.message : null,
  rpcCode: /^-?\d{1,8}$/.test(String(error?.rpcCode ?? '')) ? String(error.rpcCode) : null,
  stateBound: ownedEvmRecoveryStateBoundFailureV1(error)??ownedPagedHubEvmStateBoundFailureV3(error),
  frames: String(error?.stack ?? '').split('\n').filter(row => /^\s+at /.test(row)).slice(0, 6).map(row => row.trim()),
});
async function readJournal() {
  const record = await new Vault(config.journal.path).read(config.journal.password);
  assert.deepEqual(record.data.descriptor, product.descriptor); return record;
}
function contextData() {
  const original = readOriginalPagedNativeExecutionContextV3(product);
  return { profile: 'ORIGINAL_PAGED_BACKEND_PROCESS_V3', pid: process.pid,
    descriptor: product.descriptor, providerConfiguration: product.providerConfiguration,
    receiverAccounts: [...original.runtime.accounts],
    runtimeIdentities: { receiverPID: original.runtime.metadata.processId,
      nativeEvmPID: original.nativeRuntime.metadata.processId,
      receiverGenesis: original.runtime.metadata.evmGenesis,
      nativeEvmGenesis: original.nativeRuntime.metadata.evmGenesis },
    reopenedOriginalState: product.reopenedOriginalState === true };
}
async function query(raw) {
  const q = P.pagedOwnerExactV3(raw, ['method', 'args']); assert.ok(Array.isArray(q.args));
  const { runtime, system } = readOriginalPagedNativeExecutionContextV3(product);
  await runtime.health(); const head = await runtime.block(); await runtime.assertCanonical(head);
  let result;
  if (q.method === 'block') { assert.equal(q.args.length, 0); result = head; }
  else if (q.method === 'balance') {
    assert.equal(q.args.length, 1); assert.ok(runtime.accounts.includes(q.args[0])); result = (await runtime.balance(q.args[0])).toString();
  } else {
    assert.equal(q.args.length, 1); const value = q.args[0]; assert.match(value, /^0x[0-9a-f]{64}$/);
    const journal = await readJournal(), d = readOriginalFundedPagedGraphDeploymentV3(runtime, system);
    if (q.method === 'graph-outcome') {
      assert.equal(value, '0x' + journal.data.graph.public.authorizationRoot);
      result = await d.call('pool', 'graphOutcomes(bytes32)', [value], head.number);
    } else {
      assert.equal(q.method, 'spent-nullifier');
      const job = journal.data.graph.job; assert.equal(job.mode, 'withdraw');
      assert.equal(value, '0x' + P.devicePagedWordsHexV3(job.publicInputs, 25));
      result = await d.call('pool', 'spentNullifiers(bytes32)', [value], head.number);
    }
  }
  await runtime.assertCanonical(head); return result;
}
async function stop(capture) {
  if (stopWork) return stopWork; stopping = true;
  return stopWork = (async () => {
    if (acquisition) product = await acquisition;
    assert.ok(product, 'PAGED_BACKEND_ACQUISITION_FAILED');
    const result = capture ? await captureOriginalPagedNativeOperatorV3(product) : await product.close();
    assert.ok(result.closed && result.originalResourcesStopped && result.ownedSocketsRemaining === 0);
    config.journal.password = null; config.tls.key = null; return result;
  })();
}
process.once('disconnect', () => { if (!intentionalDisconnect) void work.finally(() => stop(false)).finally(() => { process.exitCode = 1; }); });
for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => {
  void work.finally(() => stop(false)).finally(() => { if (process.connected) process.disconnect(); process.exitCode = 1; });
});
try {
  acquisition = (process.argv[2] === 'new' ? startOriginalPagedNativeOperatorV3 : reopenOriginalPagedNativeOperatorV3)(config);
  acquisition.catch(() => {}); product = await acquisition; assert.ok(!stopping, 'PAGED_BACKEND_START_CANCELLED');
  assertOriginalPagedNativeFinancialSourceV3(); await send({ type: 'ready', value: contextData() });
  process.on('message', frame => {
    work = work.then(async () => {
      P.pagedOwnerExactV3(frame, ['type', 'id', 'method', 'args']); assert.equal(frame.type, 'control');
      assert.ok(Number.isSafeInteger(frame.id) && frame.id > 0 && !stopping);
      let value;
      if (frame.method === 'context') { assert.deepEqual(frame.args, []); value = contextData(); }
      else if (frame.method === 'query') { assert.equal(frame.args.length, 1); value = await query(frame.args[0]); }
      else { assert.ok(['capture', 'close'].includes(frame.method)); assert.deepEqual(frame.args, []); value = await stop(frame.method === 'capture'); }
      await send({ type: 'reply', id: frame.id, value });
      if (stopping && process.connected) { intentionalDisconnect = true; process.disconnect(); }
    }).catch(async error => {
      try { await send({ type: 'failed', id: frame?.id ?? null, error: failure(error) }); } finally {
        await stop(false).catch(() => {}); process.exitCode = 1; if (process.connected) process.disconnect();
      }
    });
  });
} catch (error) {
  if (product) await stop(false).catch(() => {});
  if (process.connected) { await send({ type: 'failed', id: null, error: failure(error) }); process.disconnect(); }
  process.exitCode = 1;
}
