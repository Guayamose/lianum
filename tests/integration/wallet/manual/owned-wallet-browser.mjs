/** Owned local Chrome CDP runtime; no economic authority or proof.
 * A fixed acceptance must pin this source/package/binary before using it. */
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { readFileSync, readdirSync, realpathSync } from 'node:fs';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import { setTimeout as delay } from 'node:timers/promises';
import { nativeProcStatV1 as procStat }
  from '../../native/native-flow-owned-files-v1.mjs';
import { WALLET_BROWSER_VERSION } from './wallet-browser-runtime-pins.mjs';
import { walletChromeCommandLineObservation } from './wallet-browser-process-observation.mjs';

const CHROME = '/opt/google/chrome/chrome';
// Fixed external distribution: the browser profile's collector verifies every
// file against wallet-browser-runtime-pins before this module is loaded. Other
// profiles never load this helper or execute the package.
const { chromium } = createRequire(import.meta.url)('playwright-core');
const live = row => Boolean(row) && !['Z', 'X'].includes(row.state);
const identity = row => ({ pid: row.pid, startTimeTicks: row.startTimeTicks, pgrp: row.pgrp, session: row.session });
const same = (left, right) => Boolean(left && right && ['pid','startTimeTicks'].every(key => left[key] === right[key]));

export async function startOwnedWalletBrowser(privateDirectory, origin) {
  assert.equal(process.platform, 'linux');
  assert.match(origin, /^http:\/\/127\.0\.0\.1:[1-9][0-9]{0,4}$/);
  assert.equal(realpathSync(CHROME), CHROME);
  await mkdir(privateDirectory, { recursive: true, mode: 0o700 });
  const profile = await mkdtemp(join(privateDirectory, 'wallet-browser-'));
  await mkdir(join(profile, 'artifacts'), { mode: 0o700 });
  const parent = procStat(process.pid), observed = new Map();
  const expectedUID = process.getuid();
  const stableFields = (before, after) => same(before, after)
    && ['ppid','pgrp','session'].every(key => before[key] === after[key]);
  function authenticatedOwnedProcess(candidate) {
    const before = procStat(candidate.pid);
    if (!live(before)) throw Object.assign(new Error('BROWSER_OWNED_PROCESS_GONE'), { code: 'ESRCH' });
    assert.ok(stableFields(candidate, before), 'BROWSER_OWNED_PROCESS_CHANGED_BEFORE_ENROLMENT');
    assert.equal(before.pgrp, parent.pgrp, 'BROWSER_PROCESS_ESCAPED_GROUP');
    assert.equal(before.session, parent.session, 'BROWSER_PROCESS_ESCAPED_SESSION');
    const status = readFileSync('/proc/' + before.pid + '/status', 'utf8');
    const uids = /^Uid:\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)$/m.exec(status);
    assert.ok(uids, 'BROWSER_OWNED_UID_UNAVAILABLE');
    assert.deepEqual(uids.slice(1).map(Number), Array(4).fill(expectedUID), 'BROWSER_OWNED_UID_CHANGED');
    const after = procStat(before.pid);
    if (!live(after)) throw Object.assign(new Error('BROWSER_OWNED_PROCESS_GONE'), { code: 'ESRCH' });
    assert.ok(stableFields(before, after), 'BROWSER_OWNED_PROCESS_CHANGED_DURING_AUTHENTICATION');
    return { ...identity(after), ppid: after.ppid, uids: uids.slice(1).map(Number) };
  }
  const baselineChrome = new Map();
  function chromeInventory() {
    return readdirSync('/proc').filter(name => /^[1-9][0-9]*$/.test(name)).flatMap(name => {
      const row = procStat(Number(name));
      if (!live(row)) return [];
      try {
        const comm = readFileSync('/proc/' + name + '/comm', 'utf8').trim();
        if (!comm.startsWith('chrome')) return [];
        const executable = realpathSync('/proc/' + name + '/exe');
        if (!executable.startsWith('/opt/google/chrome/')) return [];
        const after = procStat(row.pid);
        if (!same(row, after)) return [];
        return [{ ...identity(row), ppid: row.ppid, executable, comm }];
      } catch (error) { if (['ENOENT','ESRCH'].includes(error.code)) return []; throw error; }
    });
  }
  for (const row of chromeInventory()) baselineChrome.set(row.pid, row);
  let browser, closed = false, closing = null, monitor, failure = null, endpoint = null, stderr = '', cleanupResult = null;
  let sandboxedRendererObserved = false, maximumOwnedBrowserRSSBytes = 0;
  const outsideOwnedGroup = new Map();
  const sandboxedRenderers = new Map();
  const signals = [];
  const child = spawn(CHROME, ['--headless=new', '--remote-debugging-port=0', '--remote-debugging-address=127.0.0.1',
    '--enable-automation', '--disable-crashpad-for-testing', '--enable-features=NetworkServiceInProcess2',
    '--disable-breakpad', '--disable-background-networking', '--disable-component-update',
    '--disable-domain-reliability', '--disable-default-apps', '--disable-sync', '--no-first-run', '--no-default-browser-check',
    '--disable-field-trial-config', '--disable-background-timer-throttling', '--disable-backgrounding-occluded-windows',
    '--disable-back-forward-cache', '--disable-client-side-phishing-detection', '--disable-component-extensions-with-background-pages',
    '--disable-dev-shm-usage', '--disable-extensions', '--allow-pre-commit-input', '--disable-hang-monitor',
    '--disable-ipc-flooding-protection', '--disable-popup-blocking', '--disable-prompt-on-repost', '--disable-renderer-backgrounding',
    '--disable-features=AvoidUnnecessaryBeforeUnloadCheckSync,DestroyProfileOnBrowserClose,DialMediaRouteProvider,GlobalMediaControls,HttpsUpgrades,LensOverlay,MediaRouter,PaintHolding,ThirdPartyStoragePartitioning,BlockOriginHeaderModificationOnRedirect,Translate,AutoDeElevate,OptimizationHints,NetworkTimeServiceQuerying,AimEnabled',
    '--force-color-profile=srgb', '--use-mock-keychain', '--no-service-autorun', '--disable-search-engine-choice-screen',
    '--metrics-recording-only', '--password-store=basic', '--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1',
    '--user-data-dir=' + profile, 'about:blank'], {
      detached: false, env: { PATH: '/usr/bin:/bin', LANG: 'C.UTF-8',
        XDG_CONFIG_HOME: join(profile, 'config'), XDG_CACHE_HOME: join(profile, 'cache') },
      stdio: ['ignore', 'ignore', 'pipe'],
  });
  const ended = new Promise(resolve => child.once('close', (code, signal) => resolve({ code, signal })));
  child.once('error', error => { failure = error; });
  child.stderr.setEncoding('utf8');
  child.stderr.on('data', chunk => {
    stderr = (stderr + chunk).slice(-32768);
    const match = /DevTools listening on (ws:\/\/127\.0\.0\.1:[1-9][0-9]{0,4}\/devtools\/browser\/[0-9a-f-]+)/.exec(stderr);
    if (match) endpoint = match[1];
  });
  const root = procStat(child.pid);
  let initialAuthenticationFailure = null;
  try { if (root) observed.set(root.pid, authenticatedOwnedProcess(root)); }
  catch (error) { initialAuthenticationFailure = error; failure ??= error; }
  function retainFreshDescendant(candidate) {
    const chain = [], visited = new Set();
    let now = procStat(candidate.pid);
    if (!same(candidate, now)) return false;
    while (now && !visited.has(now.pid)) {
      visited.add(now.pid);
      const known = observed.get(now.pid);
      if (same(known, now)) {
        // Confirm every parent identity again before adopting children born
        // between the first process table and the later Chrome inventory.
        let anchor = authenticatedOwnedProcess(now);
        for (const row of chain.reverse()) {
          const current = procStat(row.pid), parentNow = procStat(anchor.pid);
          if (!same(row, current) || !same(anchor, parentNow) || current.ppid !== anchor.pid) return false;
          const authenticated = authenticatedOwnedProcess(current);
          authenticatedOwnedProcess(parentNow);
          observed.set(current.pid, authenticated); anchor = authenticated;
        }
        return true;
      }
      chain.push(now); now = procStat(now.ppid);
    }
    return false;
  }
  function sample(checkBoundary = true) {
    const table = new Map(readdirSync('/proc').filter(name => /^[1-9][0-9]*$/.test(name))
      .map(name => procStat(Number(name))).filter(Boolean).map(row => [row.pid, row]));
    let changed = true;
    while (changed) {
      changed = false;
      for (const row of table.values()) {
        const ancestor = observed.get(row.ppid);
        if (!observed.has(row.pid) && ancestor && same(ancestor, table.get(row.ppid))) {
          let parentBefore, parentAfter, authenticated;
          try {
            parentBefore = authenticatedOwnedProcess(table.get(row.ppid));
            if (!same(ancestor, parentBefore)) continue;
            authenticated = authenticatedOwnedProcess(row);
            parentAfter = authenticatedOwnedProcess(parentBefore);
          }
          catch (error) { if (['ENOENT','ESRCH'].includes(error.code)) continue; throw error; }
          assert.ok(stableFields(parentBefore, parentAfter), 'BROWSER_OWNED_PARENT_CHANGED_DURING_ENROLMENT');
          assert.equal(authenticated.ppid, parentAfter.pid, 'BROWSER_OWNED_PARENT_CHANGED_DURING_ENROLMENT');
          observed.set(row.pid, authenticated); changed = true;
        }
      }
    }
    let ownedRSSBytes = 0;
    for (const [pid, original] of observed) {
      const now = table.get(pid);
      if (!live(now)) continue;
      if (!same(original, now)) {
        if (checkBoundary) throw new Error('BROWSER_OWNED_IDENTITY_CHANGED');
        continue; // A reused PID is never our signal target.
      }
      if (checkBoundary) {
        assert.equal(now.pgrp, parent.pgrp, 'BROWSER_PROCESS_ESCAPED_GROUP');
        assert.equal(now.session, parent.session, 'BROWSER_PROCESS_ESCAPED_SESSION');
      }
      try {
        const status = readFileSync('/proc/' + pid + '/status', 'utf8');
        const observation = walletChromeCommandLineObservation(readFileSync('/proc/' + pid + '/cmdline', 'utf8'));
        const executable = observation.role === 'renderer' ? realpathSync('/proc/' + pid + '/exe') : null;
        const after = procStat(pid);
        if (!live(after)) continue;
        assert.ok(stableFields(now, after), 'BROWSER_PROCESS_CHANGED_DURING_OBSERVATION');
        ownedRSSBytes += Number(/^VmRSS:\s+(\d+) kB$/m.exec(status)?.[1] ?? 0) * 1024;
        if (checkBoundary) {
          assert.deepEqual(/^Uid:\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)$/m.exec(status)?.slice(1).map(Number),
            Array(4).fill(expectedUID), 'BROWSER_OWNED_UID_CHANGED');
          assert.equal(observation.sandboxDisabled, false, 'BROWSER_SANDBOX_DISABLED');
          if (observation.role === 'renderer') {
            assert.equal(executable, CHROME, 'BROWSER_RENDERER_IMAGE_CHANGED');
            assert.match(status, /^NoNewPrivs:\s+1$/m, 'BROWSER_RENDERER_PRIVILEGES_NOT_DROPPED');
            assert.match(status, /^Seccomp:\s+2$/m, 'BROWSER_RENDERER_FILTER_UNAVAILABLE');
            sandboxedRendererObserved = true;
            sandboxedRenderers.set(pid + ':' + now.startTimeTicks, { ...identity(now), ppid: now.ppid,
              uids: Array(4).fill(expectedUID), commandLineForm: observation.form, noNewPrivileges: 1, seccomp: 2 });
          }
        }
      } catch (error) { if (!['ENOENT','ESRCH'].includes(error.code)) throw error; }
    }
    maximumOwnedBrowserRSSBytes = Math.max(maximumOwnedBrowserRSSBytes, ownedRSSBytes);
    if (checkBoundary) assert.ok(ownedRSSBytes <= 1024 ** 3, 'BROWSER_OWNED_RSS_EXCEEDED');
    for (const row of chromeInventory()) {
      if (same(baselineChrome.get(row.pid), row) || same(observed.get(row.pid), row)) continue;
      let retained = false;
      try { retained = retainFreshDescendant(row); }
      catch (error) { if (['ENOENT','ESRCH'].includes(error.code)) continue; throw error; }
      if (retained) {
        if (checkBoundary) {
          assert.equal(row.pgrp, parent.pgrp, 'BROWSER_PROCESS_ESCAPED_GROUP');
          assert.equal(row.session, parent.session, 'BROWSER_PROCESS_ESCAPED_SESSION');
        }
        continue;
      }
      outsideOwnedGroup.set(row.pid + ':' + row.startTimeTicks, row);
      if (checkBoundary) throw new Error('BROWSER_NEW_CHROME_OUTSIDE_OWNED_GROUP');
    }
    return [...observed].filter(([pid, original]) => {
      const now = table.get(pid); return live(now) && same(original, now);
    }).map(([pid]) => pid);
  }
  monitor = setInterval(() => {
    try { sample(); }
    catch (error) {
      failure ??= error;
      // A boundary failure closes this owned browser immediately. The rejected
      // cleanup remains attached to the fixed worker's result; never signal an
      // unknown Chrome merely because it appeared in the inventory.
      void close().catch(() => {});
    }
  }, 50);
  async function bounded(operation, ms) {
    let timer;
    try { return await Promise.race([operation, new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error('BROWSER_PROTOCOL_CLOSE_TIMEOUT')), ms);
    })]); } finally { clearTimeout(timer); }
  }
  function close() { closing ??= closeOnce(); return closing; }
  async function closeOnce() {
    if (closed) return cleanupResult; closed = true;
    let cleanupConfirmed = false;
    try {
      if (browser?.isConnected()) {
        const control = await bounded(browser.newBrowserCDPSession(), 1000).catch(() => null);
        if (control) await bounded(control.send('Browser.close'), 1000).catch(() => {});
      }
      if (browser) await bounded(browser.close(), 1000).catch(() => {});
      const deadline = Date.now() + 10000;
      while (sample(false).length > 0 && Date.now() < deadline) await delay(50);
      if (sample(false).length > 0) {
        for (const pid of sample(false)) {
          const retained = observed.get(pid), current = procStat(pid);
          assert.equal(same(retained, current), true, 'BROWSER_SIGNAL_IDENTITY_CHANGED');
          const authenticated = authenticatedOwnedProcess(current);
          assert.equal(authenticated.ppid, retained.ppid, 'BROWSER_SIGNAL_PARENT_CHANGED');
          assert.equal(authenticated.pgrp, retained.pgrp, 'BROWSER_SIGNAL_GROUP_CHANGED');
          assert.equal(authenticated.session, retained.session, 'BROWSER_SIGNAL_SESSION_CHANGED');
          assert.deepEqual(authenticated.uids, retained.uids, 'BROWSER_SIGNAL_UID_CHANGED');
          assert.ok(stableFields(authenticated, procStat(pid)), 'BROWSER_SIGNAL_IDENTITY_CHANGED');
          process.kill(pid, 'SIGTERM'); signals.push({ pid, signal: 'SIGTERM' });
        }
        const stopDeadline = Date.now() + 5000;
        while (sample(false).length > 0 && Date.now() < stopDeadline) await delay(50);
      }
      assert.deepEqual(sample(false), [], 'BROWSER_OWNED_PROCESSES_NOT_CLOSED');
      const exit = await bounded(ended, 1000);
      const remainingChrome = chromeInventory().filter(row => !same(baselineChrome.get(row.pid), row));
      assert.deepEqual(remainingChrome, [], 'BROWSER_NEW_CHROME_PROCESSES_REMAIN');
      cleanupConfirmed = true;
      if (exit.code !== 0 || exit.signal !== null) failure ??= new Error('BROWSER_OWNED_EXIT_FAILURE');
      cleanupResult = Object.freeze({ browserOwnedCleanupConfirmed: true, observedProcesses: observed.size,
        signals: signals.map(row => ({ ...row })), guardPassed: failure === null,
        maximumOwnedBrowserRSSBytes, sandboxedRendererObserved,
        sandboxedRenderers: [...sandboxedRenderers.values()],
        exit: { code: exit.code, signal: exit.signal },
        outsideOwnedGroup: [...outsideOwnedGroup.values()], newChromeProcessesRemaining: remainingChrome.length });
      if (failure) throw Object.assign(new Error('BROWSER_GUARD_FAILED', { cause: failure }), { browserCleanup: cleanupResult });
      return cleanupResult;
    } finally { clearInterval(monitor); if (cleanupConfirmed) await rm(profile, { recursive: true, force: true }); }
  }
  try {
    if (initialAuthenticationFailure) throw initialAuthenticationFailure;
    assert.ok(root && root.ppid === process.pid && root.pgrp === parent.pgrp && root.session === parent.session,
      'BROWSER_MUST_INHERIT_OWNED_GROUP');
    const deadline = Date.now() + 20000;
    while (!endpoint && Date.now() < deadline) {
      if (failure) throw failure;
      assert.ok(live(procStat(child.pid)), 'BROWSER_EXITED_BEFORE_CDP'); await delay(25);
    }
    assert.ok(endpoint, 'BROWSER_CDP_STARTUP_DEADLINE');
    browser = await chromium.connectOverCDP(endpoint, { timeout: 10000, artifactsDir: join(profile, 'artifacts') });
    assert.equal(browser.version(), WALLET_BROWSER_VERSION, 'BROWSER_REVIEWED_VERSION_REQUIRED');
    const startupPages = browser.contexts().flatMap(context => context.pages());
    assert.ok(startupPages.every(page => page.url() === 'about:blank'), 'BROWSER_FRESH_STARTUP_PAGES_REQUIRED');
    const context = await bounded(browser.newContext({ serviceWorkers: 'block', viewport: { width: 1440, height: 1000 } }), 10000);
    assert.ok(context);
    await bounded(context.route('**/*', route => new URL(route.request().url()).origin === origin
      ? route.continue() : route.abort()), 10000);
    const page = await bounded(context.newPage(), 10000);
    await bounded(page.setViewportSize({ width: 1440, height: 1000 }), 10000);
    // These exact references belong to our fresh private profile and were
    // captured before the acceptance page existed. Closing only those blank
    // targets releases the unused default renderer without disabling isolation.
    for (const startupPage of startupPages) await bounded(startupPage.close({ runBeforeUnload: false }), 1000);
    if (failure) throw failure;
    return Object.freeze({ page, version: browser.version(),
      inspect() { if (failure) throw failure; return { liveProcesses: sample().length, observedProcesses: observed.size,
        inheritedGroup: true, inheritedSession: true, sandboxDisabled: false }; }, close });
  } catch (error) {
    await close().catch(cleanup => {
      throw Object.assign(new AggregateError([error, cleanup], cleanupResult?.browserOwnedCleanupConfirmed === true
        ? 'BROWSER_REJECTED_AFTER_CONFIRMED_OWNED_CLEANUP' : 'BROWSER_FAILED_AND_CLEANUP_UNCONFIRMED'),
      { browserCleanup: cleanupResult });
    });
    throw error;
  }
}
