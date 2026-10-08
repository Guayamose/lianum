/** HOST only: genuine owner-parent capability/checkpoint Vault, inert IPC child.
 * This checks causal ChildProcess ownership, not native owner/proof/OS acceptance.
 * Original child exit/IPC/socket closure remains part of the genuine profile. */
import test, { mock } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { createHash } from 'node:crypto';
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Vault } from '../../../engine/src/crypto/vault.mjs';
import { ownerDigest } from '../../src/signing/native-value-owner-custody-v3.mjs';
const h = v => createHash('sha256').update('inert owner recovery HOST:' + v).digest('hex');
const mapped = fileURLToPath(import.meta.url).includes('/mobile-core/');
const paths = mapped ? { owner: './native-value-owner-process-v2.mjs', wallet: '../wallet-platform/modules/ops/native-value-wallet-binding-v2.mjs',
  source: '../wallet-platform/modules/ops/native-value-system-v2.mjs', observer: './native-value-owner-observer-v2.mjs',
  authority: '../wallet-platform/modules/native-claims/wrapped-recovery-authority-v1.mjs' } : {
  owner: '../../src/processes/native-value-owner-process-v2.mjs', wallet: '../../../backend/src/operations/deployments/native-value/native-value-wallet-binding-v2.mjs',
  source: '../../../backend/src/operations/deployments/native-value/native-value-system-v2.mjs', observer: '../../src/observers/native-value-owner-observer-v2.mjs',
  authority: '../../../backend/src/claims/wrapped/recovery/wrapped-recovery-authority-v1.mjs' };
const urls = Object.fromEntries(Object.entries(paths).map(([key, value]) => [key, new URL(value, import.meta.url).href]));
const worlds = new WeakMap(), observations = new WeakMap(), issuers = new WeakSet(), tokens = new WeakMap(), children = new Map();
const original = (runtime, system) => { const f = worlds.get(runtime); assert.ok(f && f.system === system, 'HOST_ORIGINAL_SYSTEM'); return f; };
mock.module(urls.wallet, { exports: { assertOwnedNativeValueWalletSystem: original } });
mock.module(urls.source, { exports: { nativeValueOriginalRecoverySourceV1(runtime, system) { original(runtime, system); return h('source'); } } });
mock.module(urls.observer, { exports: {
  async createNativeValueOwnerObserver({ runtime, system }) { const f = original(runtime, system);
    const observer = { identity: f.identity, poolArtifact: {} }; observations.set(observer, f); return observer; },
  assertOwnedNativeValueOwnerObserver(observer, { runtime, system }) { assert.equal(observations.get(observer), original(runtime, system)); },
} });
const actualAuthority = await import(urls.authority);
const identity = { profile: 'NATIVE_VALUE_ECONOMIC_RECOVERY_V1', directory: '/HOST_ONLY', sourceSHA256: h('source'),
  runId: '00000000-0000-4000-8000-000000000003', deadlineMs: 1234567890000 };
mock.module(urls.authority, { exports: { ...actualAuthority,
  assertNativeEconomicRecoveryCaptureV1(authority) { assert.ok(issuers.has(authority), 'HOST_ORIGINAL_ISSUER_REQUIRED'); return identity; },
  nativeEconomicRecoverySectionIdentityV1(token, section) { assert.equal(section, 'owner'); assert.ok(tokens.has(token), 'HOST_ORIGINAL_OWNER_TOKEN'); return identity; },
  consumeNativeEconomicRecoverySectionV1(token, section) { assert.equal(section, 'owner'); const row = tokens.get(token);
    assert.ok(row, 'HOST_ORIGINAL_OWNER_TOKEN'); assert.equal(row.consumed, false, 'HOST_OWNER_TOKEN_CONSUMED');
    row.consumed = true; return structuredClone(row.record); },
} });
const childProcess = await import('node:child_process');
mock.module('node:child_process', { exports: { ...childProcess, fork(_file, argv, options) {
  assert.deepEqual(argv, ['--native-value-owner-child-v2']); assert.deepEqual(options.execArgv, []);
  const f = children.get(options.cwd); assert.ok(f); f.starts++;
  const child = new EventEmitter(); child.stderr = new PassThrough(); child.connected = true; child.exitCode = null; child.signalCode = null;
  let session, pendingConfig;
  const end = signal => { if (child.exitCode !== null || child.signalCode !== null) return;
    child.connected = false; child.exitCode = signal ? null : 0; child.signalCode = signal; f.exits++;
    child.emit('exit', child.exitCode, child.signalCode); child.stderr.end(); setImmediate(() => child.emit('close', child.exitCode, child.signalCode)); };
  child.kill = signal => { end(signal); return true; };
  child.send = (message, callback) => { setImmediate(() => callback?.(null));
    if (message.type === 'boot') { session = message.session; pendingConfig = message.config;
      void (async () => {
        if (message.config.create) await writeFile(join(options.cwd, 'native-value-owner-v2.vault'), 'HOST_CIPHERTEXT_NOT_CUSTODY', { flag: 'wx', mode: 0o600 });
        else assert.equal(message.config.processIdentitySHA256, f.firstIdentity);
        f.firstIdentity ??= message.config.processIdentitySHA256;
        f.generations.push(message.config.processGeneration);
        const checkpoint = message.config.checkpoint ?? { version: 1, identitySHA256: ownerDigest(message.config.identity),
          acknowledged: { revision: 0, stateSHA256: h('original state') }, pending: null };
        child.emit('message', { protocol: message.protocol, session, type: 'host', id: 1, method: 'checkpoint', input: checkpoint });
      })().catch(error => child.emit('error', error));
    } else if (message.type === 'hostResult') { assert.equal(message.ok, true); assert.ok(pendingConfig); pendingConfig.password = '';
      setImmediate(() => child.emit('message', { protocol: message.protocol, session, type: 'ready' }));
    } else if (message.type === 'request') { assert.equal(message.method, 'close');
      setImmediate(() => { child.emit('message', { protocol: message.protocol, session, type: 'result', id: message.id, ok: true, result: { closed: true } }); end(null); }); }
  }; return child;
} } });
const api = await import(urls.owner);
async function setup(t) {
  const directory = await mkdtemp(join(tmpdir(), 'native-owner-parent-host-'));
  const f = { directory, runtime: {}, system: {}, identity: { originalHost: true }, starts: 0, exits: 0, generations: [], checkpoint: null, owner: null };
  worlds.set(f.runtime, f); children.set(directory, f);
  t.after(async () => { if (f.owner) await f.owner.close(); children.delete(directory); await rm(directory, { recursive: true, force: true }); });
  f.owner = await api.createNativeValueOwnerProcess({ runtime: f.runtime, system: f.system, poolIndex: 0, directory,
    password: 'HOST_ONLY_NOT_SECRET', create: true, checkpoint: null, onCheckpoint: async cp => { f.checkpoint = structuredClone(cp); } });
  const authority = Object.freeze({}); issuers.add(authority); const token = Object.freeze({}); tokens.set(token, { record: null, consumed: false });
  return { f, authority, token };
}
test('owner parent retention waits causal child close and keeps process identity/checkpoint across one-use reopen', async t => {
  const { f, authority, token } = await setup(t);
  const old = api.nativeValueOwnerEconomicIdentityV1(f.owner, { runtime: f.runtime, system: f.system, poolIndex: 0 });
  assert.throws(() => api.fenceOriginalNativeOwnerEconomicRecoveryV1({ ...f.owner }, authority), /ORIGINAL_PROCESS_REQUIRED/);
  api.fenceOriginalNativeOwnerEconomicRecoveryV1(f.owner, authority);
  await assert.rejects(f.owner.owner.prepareDeposit({}), /BUSY_OR_UNAVAILABLE/);
  const record = await api.captureOriginalNativeOwnerEconomicRecoveryV1(f.owner, token); tokens.get(token).record = record;
  assert.deepEqual(await api.stopCapturedNativeOwnerEconomicRecoveryV1(f.owner, token), { closed: true, originalResourcesStopped: true });
  assert.equal(f.exits, 1); assert.equal(f.owner.report().childExited, true); assert.deepEqual(f.owner.report().exit, { code: 0, signal: null });
  f.owner = await api.reopenOriginalNativeOwnerEconomicRecoveryV1(token, { runtime: f.runtime, system: f.system });
  const next = api.nativeValueOwnerEconomicIdentityV1(f.owner, { runtime: f.runtime, system: f.system, poolIndex: 0 });
  assert.equal(next.processIdentitySHA256, old.processIdentitySHA256); assert.equal(next.generation, old.generation + 1);
  assert.deepEqual(f.generations, [1, 2]); assert.equal(f.starts, 2);
  const parent = await new Vault(join(f.directory, 'native-owner-parent-checkpoint.vault')).read('HOST_ONLY_NOT_SECRET');
  assert.deepEqual(parent.data.checkpoint, f.checkpoint);
  await assert.rejects(api.reopenOriginalNativeOwnerEconomicRecoveryV1(token, { runtime: f.runtime, system: f.system }), /TOKEN_CONSUMED/);
});
test('changed original ciphertext rejects reopen before another child is created', async t => {
  const { f, authority, token } = await setup(t);
  api.fenceOriginalNativeOwnerEconomicRecoveryV1(f.owner, authority);
  const record = await api.captureOriginalNativeOwnerEconomicRecoveryV1(f.owner, token); tokens.get(token).record = record;
  await api.stopCapturedNativeOwnerEconomicRecoveryV1(f.owner, token);
  const path = join(f.directory, 'native-value-owner-v2.vault'), before = await readFile(path);
  await writeFile(path, Buffer.concat([before, Buffer.from('TAMPER')]));
  await assert.rejects(api.reopenOriginalNativeOwnerEconomicRecoveryV1(token, { runtime: f.runtime, system: f.system }), /ORIGINAL_VAULT_CHANGED/);
  assert.equal(f.starts, 1); assert.equal(f.exits, 1);
});
