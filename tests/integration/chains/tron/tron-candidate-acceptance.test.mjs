import assert from 'node:assert/strict';
import test from 'node:test';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { once } from 'node:events';
import { fileURLToPath } from 'node:url';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { assertTronCandidateGate, TRON_CANDIDATE_OPT_IN, isKnownIdleGradleDaemon } from './tron-candidate-acceptance.mjs';
import { OWNED_TRON_RUNTIME_RELEASE } from '../../../../packages/backend/src/chains/tron/transfers/owned-tron-node-driver.mjs';

test('candidate acceptance requires the sole reviewed opt-in and preserves the canonical gate', () => {
  assert.equal(OWNED_TRON_RUNTIME_RELEASE, null);
  assertTronCandidateGate([TRON_CANDIDATE_OPT_IN]);
  for (const args of [[], ['--run'], [TRON_CANDIDATE_OPT_IN, '--url'], [TRON_CANDIDATE_OPT_IN, TRON_CANDIDATE_OPT_IN]]) {
    assert.throws(() => assertTronCandidateGate(args), /EXACT_OPT_IN_REQUIRED/);
  }
  assert.equal(OWNED_TRON_RUNTIME_RELEASE, null);
});

test('native child guard denies network syscalls, permits only anonymous JDK pairs, and leaves host sockets usable',
  { skip: process.platform !== 'linux' || process.arch !== 'x64' }, async () => {
    const helper = fileURLToPath(new URL('./fixtures/tron-candidate-seccomp.py', import.meta.url));
    const child = spawn('/usr/bin/python3', [helper, '--check-socket-guard'], { stdio: ['ignore', 'pipe', 'pipe'] });
    let output = '', diagnostic = '';
    child.stdout.on('data', bytes => output += bytes.toString());
    child.stderr.on('data', bytes => diagnostic += bytes.toString());
    const [code, signal] = await once(child, 'exit');
    assert.equal(code, 0, diagnostic); assert.equal(signal, null);
    assert.deepEqual(JSON.parse(output), { socketSyscallsDenied: true, networkSocketpairDenied: true,
      anonymousUnixPairPermitted: true, pipesPreserved: true, hostPolicyChanged: false });
    const server = createServer();
    try { server.listen(0, '127.0.0.1'); await once(server, 'listening'); assert.ok(server.address().port > 0); }
    finally { await new Promise(resolve => server.close(resolve)); }
  });


test('the Java service exception rejects forged arguments, other paths and active or replaced threads', () => {
  const first = { pid: 1000, parent: 900, start: '125000', state: 'S',
    executable: '/usr/lib/jvm/java-21-openjdk-amd64/bin/java', cwd: join(homedir(), '.gradle/daemon/8.9'),
    args: ['/usr/lib/jvm/java-21-openjdk-amd64/bin/java', '-Xmx512m', 'org.gradle.launcher.daemon.bootstrap.GradleDaemon', '8.9'],
    threadTicks: [['1000', '20', '1'], ['1001', '10', '3']] };
  assert.equal(isKnownIdleGradleDaemon(first, structuredClone(first)), true);
  for (const change of [value => value.executable = '/tmp/java', value => value.cwd = '/tmp/.gradle/daemon/8.9',
    value => value.args.push('OwnedTronNativeDriver'), value => value.state = 'R',
    value => value.start = '125001', value => value.threadTicks[1][1] = '11',
    value => value.threadTicks.push(['1002', '0', '0'])]) {
    const second = structuredClone(first); change(second); assert.equal(isKnownIdleGradleDaemon(first, second), false);
  }
  const forged = structuredClone(first); forged.executable = '/tmp/java'; forged.args[0] = '/tmp/java';
  assert.equal(isKnownIdleGradleDaemon(forged, structuredClone(forged)), false);
});
