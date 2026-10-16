/** Close a dead installation through its Original storage owners only.
 * This command cannot renew a wallet, open a signer or send a transaction. */
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {join, resolve} from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {
  PUBLIC_OPERATOR_STATE_V4, PUBLIC_NATIVE_DIRECTORY_V4,
  readPrivateOperatorFileV4,
} from './public-operator-state-v4.mjs';
import {publicUniswapConfigurationV6, readPublicUniswapModeV6} from './public-uniswap-mode-v6.mjs';

assert.equal(process.argv.length, 2);
assert.equal(process.platform, 'linux');
assert.equal(process.arch, 'x64');
assert.ok(process.getuid() > 0);
assert.deepEqual(process.execArgv, ['--max-old-space-size=384']);
for (const name of ['NODE_OPTIONS', 'NODE_PATH', 'LD_PRELOAD', 'LD_LIBRARY_PATH']) {
  assert.equal(process.env[name], undefined);
}

const root = resolve(fileURLToPath(new URL('../candidate/', import.meta.url)));
const load = path => import(pathToFileURL(join(root, path)).href);
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const emit = data => process.stdout.write(JSON.stringify(data) + '\n');
let configuration;

async function unchangedFiles() {
  const files = [
    'source-operations/native-wallet.json',
    'source-operations/financial-epochs.vault',
    'dispatch-journal/native-wallet.json',
    'keys/provider-keys.aead',
    'keys/wrapping-key.bin',
  ];
  const result = {};
  for (const name of files) {
    const bytes = await readFile(join(PUBLIC_NATIVE_DIRECTORY_V4, name));
    try { result[name] = digest(bytes); } finally { bytes.fill(0); }
  }
  return result;
}

try {
  const bytes = await readPrivateOperatorFileV4(PUBLIC_OPERATOR_STATE_V4, 'operator.json');
  try { configuration = JSON.parse(bytes.toString('utf8')); } finally { bytes.fill(0); }
  assert.equal(configuration.nativeDirectory, PUBLIC_NATIVE_DIRECTORY_V4);
  assert.equal(configuration.supervisorDirectory, join(PUBLIC_OPERATOR_STATE_V4, 'supervisor'));

  const mixed = await load('packages/backend/src/operations/recovery/paged-public-uniswap-mixed-supervisor-v4.mjs');
  const native = await load('packages/backend/src/operations/recovery/paged-runtime-recovery-authority-v3.mjs');
  const before = await unchangedFiles();
  const mode = await readPublicUniswapModeV6(root, configuration);
  assert.ok(mode, 'PAEG_STORAGE_ORIGINAL_UNISWAP_REQUIRED');
  const input = publicUniswapConfigurationV6(configuration, mode.input.mixed.devicePublicKey);
  const location = {
    directory: join(PUBLIC_OPERATOR_STATE_V4, 'supervisor-uniswap-v6'),
    password: configuration.journal.password,
    mixedJournalPassword: input.mixed.journal.password,
    flatJournalPassword: input.mixed.flatJournal.password,
  };
  const result = await mixed.sealOriginalPagedPublicUniswapMixedDeadStorageV8(location);
  assert.equal(result.financialSourcePermissionIssued, false);
  assert.equal(result.transactionsBroadcast, 0);
  const parent = await native.readOriginalPagedPublicRecoveryModeV4({
    directory: configuration.supervisorDirectory,
    password: configuration.journal.password,
  });
  const retained = await mixed.readOriginalPagedPublicUniswapMixedRecoveryModeV6({
    directory: location.directory, password: location.password,
  });
  assert.equal(parent.mode, 'CAPTURED', 'PAEG_STORAGE_PARENT_CAPTURE_REQUIRED');
  assert.equal(retained.phase, 'CAPTURED', 'PAEG_STORAGE_MIXED_CAPTURE_REQUIRED');
  assert.deepEqual(await unchangedFiles(), before, 'PAEG_STORAGE_FINANCIAL_STATE_CHANGED');
  emit({stage: 'EXPIRED_PUBLIC_STORAGE_CAPTURED', parentPhase: parent.checkpoint.phase,
    mixedPhase: retained.phase, financialSourcePermissionIssued: false,
    transactionsBroadcast: 0, financialFilesUnchanged: true,
    originalResult: result?.profile ?? null});
} catch (error) {
  process.exitCode = 1;
  const first = typeof error?.message === 'string' ? error.message.split('\n', 1)[0] : '';
  const locations = String(error?.stack ?? '').split('\n')
    .filter(line => /^\s+at /.test(line)).slice(0, 8)
    .map(line => line.match(/([a-z0-9-]+\.mjs:\d+:\d+)\)?$/i)?.[1]).filter(Boolean);
  emit({stage: 'EXPIRED_PUBLIC_STORAGE_CAPTURE_REJECTED',
    reason: /^[A-Z][A-Z0-9_]{1,120}$/.test(first) ? first : 'ORIGINAL_STORAGE_REJECTED',
    locations, financialSourcePermissionIssued: false, transactionsBroadcast: 0});
} finally {
  if (configuration) configuration.journal.password = null;
}
