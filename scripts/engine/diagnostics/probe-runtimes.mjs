import { spawnSync } from 'node:child_process';
import { access, mkdir, writeFile } from 'node:fs/promises';
import { constants } from 'node:fs';
import { delimiter, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const names = ['node', 'rustc', 'cargo', 'anvil', 'forge', 'solana', 'solana-test-validator', 'bitcoind', 'bitcoin-cli', 'docker', 'wsl'];
const results = [];
for (const name of names) {
  const candidates = (process.env.PATH ?? '').split(delimiter).filter(Boolean).map(p => join(p, name + (process.platform === 'win32' ? '.exe' : '')));
  let available = false;
  for (const path of candidates) {
    try { await access(path, constants.F_OK); available = true; break; } catch { /* PATH presence only; no scan of user data. */ }
  }
  results.push({ executable: name, onPath: available });
}
const report = {
  schemaVersion: 1, recordedAt: new Date().toISOString(), platform: process.platform,
  architecture: process.arch, node: process.version, runtimePresence: results,
  localPortableRuntimeDirectory: '.local/runtimes',
  boundary: 'Presence check only. No RPC call, chain proof, wallet config, credentials or user data read. Portable binaries are checked by isolated integration scripts.',
};
if (process.argv.includes('--inspect-wsl') && results.find(r => r.executable === 'wsl')?.onPath) {
  const r = spawnSync('wsl.exe', ['--list', '--quiet'], { timeout: 5000, windowsHide: true, encoding: 'buffer', maxBuffer: 32768 });
  report.wslEnumeration = { status: r.status, readable: r.status === 0, error: r.status === 0 ? null : 'WSL_ENUMERATION_UNAVAILABLE' };
  // Do not persist distro names or raw process output.
}
await mkdir(join(root, 'evidence'), { recursive: true });
await writeFile(join(root, 'evidence', 'chains-runtime-probe.json'), JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify(report, null, 2));
