import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readdirSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve, relative, dirname, isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const output = resolve(root, process.argv[2] || '.local/current-tests.tap');
const within = relative(root, output);
assert.ok(within && !isAbsolute(within) && !within.split(/[\\/]/).includes('..'));
const tests = readdirSync(resolve(root, 'test')).filter(p => p.endsWith('.test.mjs')).sort().map(p => 'test/' + p);
const result = spawnSync(process.execPath, ['--test', '--test-reporter=tap', ...tests], { cwd: root, encoding: 'utf8', timeout: 180000, maxBuffer: 8 * 1024 * 1024 });
assert.equal(result.error, undefined); assert.equal(result.signal, null);
mkdirSync(dirname(output), { recursive: true }); writeFileSync(output, result.stdout);
if (result.stderr) process.stderr.write(result.stderr);
console.log(JSON.stringify({ testFiles: tests.length, exitCode: result.status, summary: result.stdout.split('\n').filter(s => /^# (tests|pass|fail|cancelled|skipped|todo|duration_ms) /.test(s)) }));
process.exitCode = result.status;
