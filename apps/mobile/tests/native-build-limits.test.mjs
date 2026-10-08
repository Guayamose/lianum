/** Real CMake/Ninja scheduling only. No Gradle, Metro, device or chain. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdtemp, readFile, writeFile, rm, mkdir } from 'node:fs/promises';
import { existsSync, accessSync, constants } from 'node:fs';
import { tmpdir, homedir } from 'node:os';
import { join, delimiter } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const require = createRequire(import.meta.url);
const { NATIVE_CMAKE_ARGUMENTS, applyAppBuildLimits, applyLibraryBuildLimits } =
  require('../plugins/with-native-build-limits.cjs');
const command = promisify(execFile);

function executable(name) {
  for (const directory of (process.env.PATH || '').split(delimiter)) {
    const path = join(directory, name);
    try { accessSync(path, constants.X_OK); return path; } catch { /* Try the next public tool directory. */ }
  }
  throw new Error('MOBILE_NATIVE_FIXTURE_TOOL_MISSING:' + name);
}

test('Expo Gradle mods retain one fixed compile/link pool for app and Android libraries', () => {
  for (const transform of [applyAppBuildLimits, applyLibraryBuildLimits]) {
    const original = '// Synthetic generated Gradle fixture\n';
    const changed = transform(original);
    assert.ok(changed.startsWith(original));
    assert.equal(transform(changed), changed);
    for (const argument of NATIVE_CMAKE_ARGUMENTS) {
      assert.equal(changed.split(argument).length - 1, 1);
    }
    assert.match(changed, /CMAKE_JOB_POOLS=owned_build=1/);
    assert.match(changed, /CMAKE_JOB_POOL_COMPILE=owned_build/);
    assert.match(changed, /CMAKE_JOB_POOL_LINK=owned_build/);
  }
  assert.match(applyAppBuildLimits(''), /externalNativeBuild/);
  assert.match(applyLibraryBuildLimits(''), /withPlugin\('com\.android\.library'\)/);
  assert.throws(() => applyAppBuildLimits('// BEGIN LIANUM NATIVE BUILD LIMITS'),
    /MOBILE_NATIVE_BUILD_LIMITS_MARKER_CHANGED/);
});

test('direct Ninja jobs share a single real compile/link slot despite -j8', { timeout: 30_000 }, async () => {
  const directory = await mkdtemp(join(tmpdir(), 'lianum-native-job-pool-'));
  const sdk = process.env.ANDROID_HOME || process.env.ANDROID_SDK_ROOT || join(homedir(), 'Android/Sdk');
  const installedCmake = join(sdk, 'cmake/3.22.1/bin/cmake');
  const installedNinja = join(sdk, 'cmake/3.22.1/bin/ninja');
  const cmake = existsSync(installedCmake) ? installedCmake : executable('cmake');
  const ninja = existsSync(installedNinja) ? installedNinja : executable('ninja');
  const launcher = join(directory, 'compiler-launcher.py');
  const counter = join(directory, 'counter.json');
  try {
    await writeFile(launcher, `import fcntl, json, os, subprocess, sys, time
from pathlib import Path
counter = Path(os.environ['LIANUM_NATIVE_TEST_COUNTER'])
def update(delta):
    with counter.open('r+') as stream:
        fcntl.flock(stream, fcntl.LOCK_EX)
        value = json.load(stream)
        value['active'] += delta
        value['maximum'] = max(value['maximum'], value['active'])
        if delta > 0:
            value['kinds'].append('compile' if '-c' in sys.argv else 'link')
        stream.seek(0); json.dump(value, stream); stream.truncate(); stream.flush()
        fcntl.flock(stream, fcntl.LOCK_UN)
update(1)
try:
    time.sleep(0.08)
    result = subprocess.run(sys.argv[1:])
finally:
    update(-1)
sys.exit(result.returncode)
`);
    await writeFile(join(directory, 'CMakeLists.txt'), `cmake_minimum_required(VERSION 3.22)
project(LianumSchedulingFixture LANGUAGES C)
foreach(name alpha beta gamma)
  add_executable(\${name} main.c helper.c)
endforeach()
`);
    await writeFile(join(directory, 'main.c'), 'int helper(void); int main(void) { return helper(); }\n');
    await writeFile(join(directory, 'helper.c'), 'int helper(void) { return 0; }\n');
    const env = { ...process.env, LIANUM_NATIVE_TEST_COUNTER: counter };
    const results = [];
    for (const limited of [false, true]) {
      const build = join(directory, limited ? 'bounded' : 'unbounded');
      await mkdir(build);
      await writeFile(counter, JSON.stringify({ active: 0, maximum: 0, kinds: [] }));
      await command(cmake, ['-S', directory, '-B', build, '-G', 'Ninja',
        '-DCMAKE_MAKE_PROGRAM=' + ninja,
        '-DCMAKE_C_COMPILER_LAUNCHER=python3;' + launcher,
        '-DCMAKE_C_LINKER_LAUNCHER=python3;' + launcher,
        ...(limited ? NATIVE_CMAKE_ARGUMENTS : [])], { env, timeout: 15_000 });
      const generated = await readFile(join(build, 'build.ninja'), 'utf8');
      if (limited) {
        assert.equal((generated.match(/pool = owned_build/g) || []).length, 9);
        assert.match(await readFile(join(build, 'CMakeFiles/rules.ninja'), 'utf8'),
          /pool owned_build\s+depth = 1/);
      }
      await command(ninja, ['-C', build, '-j8'], { env, timeout: 15_000 });
      const observed = JSON.parse(await readFile(counter, 'utf8'));
      assert.equal(observed.active, 0);
      assert.equal(observed.kinds.filter(value => value === 'compile').length, 6);
      assert.equal(observed.kinds.filter(value => value === 'link').length, 3);
      results.push(observed.maximum);
    }
    assert.ok(results[0] > 1, 'Without pools, direct Ninja starts simultaneous compiler/linker jobs');
    assert.equal(results[1], 1);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
