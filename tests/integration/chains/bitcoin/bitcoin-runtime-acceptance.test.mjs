/** Host-only rejection checks; importing creates no native process. */
import assert from 'node:assert/strict';
import test from 'node:test';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { assertBitcoinAcceptanceGate, isKnownIdleGradleDaemon } from './bitcoin-runtime-acceptance.mjs';

test('regtest ingress acceptance rejects absent, duplicated and caller-directed opt-ins', () => {
  assertBitcoinAcceptanceGate(['--run-owned-regtest']);
  for (const args of [[], ['--run'], ['--run-owned-regtest', '--url'],
    ['--run-owned-regtest', '--run-owned-regtest']]) {
    assert.throws(() => assertBitcoinAcceptanceGate(args), /EXACT_OPT_IN/);
  }
});

test('parallel-work classification authenticates both fixed idle Gradle process snapshots', () => {
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
});
