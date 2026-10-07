/** Environment verification only: no proving keys, proofs, chain nodes or transfers. */
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { gunzipSync } from 'node:zlib';

const root = resolve(fileURLToPath(new URL('../../', import.meta.url)));
const project = join(root, '.internal/runtime'), dev = join(root, '.internal/dev');
const report = { schema: 'LIANUM_DEVELOPMENT_SMOKE_V1', node: process.version, checks: [],
  proofGenerated: false, chainNodeStarted: false, transferSent: false };
const originalFetch = globalThis.fetch;
const save = () => writeFileSync(join(dev, 'reports/smoke.json'), JSON.stringify(report, null, 2) + '\n');
mkdirSync(join(dev, 'reports'), { recursive: true });

async function check(name, task) {
  const started = performance.now();
  try {
    const details = await task();
    report.checks.push({ name, status: 'PASS', milliseconds: performance.now() - started, ...details });
    process.stdout.write(`${name}: PASS\n`);
  } catch (error) {
    report.checks.push({ name, status: 'FAIL', code: error.code ?? error.name,
      message: String(error.message).slice(0, 2000), milliseconds: performance.now() - started });
    process.stdout.write(`${name}: FAIL (${String(error.message).slice(0, 300)})\n`);
    process.exitCode = 1;
  }
  save();
}

assert.equal(process.version, 'v24.19.0', 'Use ./dev smoke');

await check('solidity-source-compilation', async () => {
  const require = createRequire(join(dev, 'npm-solc/package.json'));
  const solc = require('solc');
  assert.match(solc.version(), /^0\.8\.37\+commit\.f401782d/);
  const freeze = JSON.parse(readFileSync(join(root, 'archive/delivery/CLOSED1684-FREEZE.json')));
  // The ops snapshot is historical text whose relative imports refer to its
  // former location. Only compile source units in their actual contract tree.
  const build = JSON.parse(readFileSync(join(dev, 'reports/workspace-build.json')));
  const contractRows = Object.keys(build.files)
    .filter(path => path.endsWith('.sol') && path.includes('/contracts/')).map(path => ({ path }));
  const sources = Object.fromEntries(contractRows
    .map(row => [row.path, { content: readFileSync(join(project, row.path), 'utf8') }]));
  const output = JSON.parse(solc.compile(JSON.stringify({ language: 'Solidity', sources,
    settings: { evmVersion: 'cancun', outputSelection: { '*': { '*': ['abi'] } } } })));
  const errors = (output.errors ?? []).filter(row => row.severity === 'error');
  assert.equal(errors.length, 0, errors.map(row => row.formattedMessage).join('\n'));
  return { compiler: solc.version(), sourceFiles: Object.keys(sources).length,
    historicalSnapshotsExcluded: freeze.files.filter(row => row.path.endsWith('.sol') && !row.path.includes('/contracts/'))
      .map(row => row.path),
    contracts: Object.values(output.contracts).reduce((n, value) => n + Object.keys(value).length, 0),
    scope: 'ABI compilation/type checking; no deployable bytecode or deployment acceptance' };
});

await check('noir-compiler-and-barretenberg-wasm', async () => {
  const require = createRequire(join(dev, 'npm-proof/package.json'));
  const { compile, createFileManager } = await import(pathToFileURL(require.resolve('@noir-lang/noir_wasm')));
  const { Barretenberg, BackendType } = await import(pathToFileURL(require.resolve('@aztec/bb.js')));
  const circuit = join(dev, 'smoke/noir');
  mkdirSync(join(circuit, 'src'), { recursive: true });
  writeFileSync(join(circuit, 'Nargo.toml'), '[package]\nname = "development_smoke"\ntype = "bin"\nauthors = []\n\n[dependencies]\n');
  writeFileSync(join(circuit, 'src/main.nr'), 'fn main(square: pub Field, value: Field) { assert(square == value * value); }\n');
  globalThis.fetch = async (input, options) => {
    assert.ok(String(input).startsWith('data:'), 'Compiler/statistics must stay offline');
    return originalFetch(input, options);
  };
  let api;
  try {
    const result = await compile(createFileManager(circuit), undefined, () => {});
    assert.match(result.program.noir_version, /1\.0\.0-beta\.25/);
    api = await Barretenberg.new({ backend: BackendType.Wasm, threads: 1, skipSrsInit: true,
      memory: { initial: 37, maximum: 32768 }, logger: () => {} });
    const stats = await api.circuitStats({ circuit: { name: 'development_smoke',
      bytecode: gunzipSync(Buffer.from(result.program.bytecode, 'base64')), verificationKey: new Uint8Array() },
    includeGatesPerOpcode: false, settings: { ipaAccumulation: false, oracleHashType: 'keccak',
      disableZk: false, optimizedSolidityVerifier: false } });
    writeFileSync(join(dev, 'smoke/noir/program.json'), JSON.stringify(result.program));
    return { noirVersion: result.program.noir_version, statistics: stats,
      scope: 'New arithmetic diagnostic; original PAEG artifacts and proofs are untouched' };
  } finally {
    await api?.destroy();
    globalThis.fetch = originalFetch;
  }
});

await check('disconnected-wallet-http', async () => {
  const { startWalletApplication } = await import(pathToFileURL(join(project,
    'omnichain-flat-profile/flat-wallet/wallet-app/server.mjs')));
  const app = await startWalletApplication({ actionAccessMode: 'exact-only' });
  try {
    assert.equal(new URL(app.origin).hostname, '127.0.0.1');
    const page = await fetch(app.origin);
    assert.equal(page.status, 200);
    assert.match(await page.text(), /LIANUM|Lianum/);
    const response = await fetch(app.origin + '/api/wallet/state', {
      headers: { Origin: app.origin, 'x-wallet-owner-token': app.ownerAccess.token },
    });
    assert.equal(response.status, 200);
    const state = await response.json();
    assert.equal(state.connection, 'DISCONNECTED');
    assert.equal(state.portfolio, null);
    assert.ok(Object.values(state.capabilities).every(value => value === false));
    return { connection: state.connection, loopbackListenerClosed: true, effectfulCapabilities: false };
  } finally { await app.close(); }
});
