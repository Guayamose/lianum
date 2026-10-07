import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { pinnedBinary, scratchDirectory, removeOwnScratch, projectRoot } from '../../../packages/engine/src/chains/shared/runtime-harness.mjs';

const pins = { 'solana-test-validator.exe': 'cf6709cef5d1b9d46bb27ab255c68c9e2100a472559b650e34fec74803025be5', 'solana.exe': 'c3820df6dd2537023892998aef1ceaabe27557953fee8d46b9a9eba7cf175b4c', 'solana-keygen.exe': '9a7b1d93f6d70479311b3841f8e3c2060c9c9731e5bb62fb65b3b4daf059fc03' };
pins['agave-validator.exe'] = '3120a0cc5d6994ec014404b1615ddc2ac47580681ba0a44ad047e329c65e3a8e';
pins['solana-genesis.exe'] = 'ccb91ad12262f853accd38104f2280c688d3b7f236ca31658a276058ac0f18d9';
const dir = await scratchDirectory('m10-solana-probe-');
const report = { classification: 'OFFICIAL_WINDOWS_BINARY_VERSION_HELP_ONLY', phase: 'starting', commands: [], validatorStarted: false, publicNetworkRequested: false, hostSecurityChanged: false, wslRetried: false };
try {
  for (const [name, expected] of Object.entries(pins)) {
    const binary = await pinnedBinary('agave-v4.3.0-portable/' + name, expected);
    for (const args of [['--version'], ['--help']]) {
      const r = spawnSync(binary, args, { cwd: dir, windowsHide: true, env: { SystemRoot: process.env.SystemRoot, WINDIR: process.env.WINDIR, USERPROFILE: dir, APPDATA: dir, LOCALAPPDATA: dir, TEMP: dir, TMP: dir }, encoding: 'utf8', timeout: 15000, maxBuffer: 256 * 1024 });
      report.commands.push({ name, sha256: expected, args, exitCode: r.status, signal: r.signal, error: r.error ? { code: r.error.code, message: r.error.message.replaceAll(binary, name) } : null, stdout: r.stdout, stderr: r.stderr });
      assert.equal(r.error, undefined); assert.equal(r.signal, null); assert.equal(r.status, 0, name + ' version/help must load without OS changes');
    }
  }
  report.phase = 'completed';
} catch (e) { report.phase = 'blocked'; report.failure = e.message; process.exitCode = 1; }
finally { await removeOwnScratch(dir); report.scratchRemoved = true; await writeFile(join(projectRoot, 'evidence/m10-solana-cli-probe.json'), JSON.stringify(report, null, 2) + '\n'); }
console.log(JSON.stringify({ phase: report.phase, commands: report.commands.map(c => ({ name:c.name,args:c.args,exitCode:c.exitCode,error:c.error })), failure: report.failure }));
