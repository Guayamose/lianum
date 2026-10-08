/** Host-only process-label regression. No PID, Chrome or sandbox is created. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { walletChromeCommandLineObservation as observe } from './wallet-browser-process-observation.mjs';
const image = '/opt/google/chrome/chrome';
test('exact renderer switch is recognized for original argv and Linux zygote proctitle', () => {
  assert.deepEqual(observe(image + '\0--type=renderer\0--lang=en-US\0'),
    { role:'renderer',form:'NUL_ARGUMENTS',sandboxDisabled:false });
  assert.deepEqual(observe(image + ' --type=renderer --lang=en-US\0'),
    { role:'renderer',form:'CHROME_LINUX_PROCTITLE',sandboxDisabled:false });
});
test('renderer words inside a different image, option value or larger type cannot label a renderer', () => {
  for (const title of [image+'-other --type=renderer', '/usr/bin/node --type=renderer',
    image+' --user-data-dir=/tmp/--type=renderer --lang=en',
    image+' --note=prefix--type=renderer --type=utility',
    image+' --type=renderer-other --lang=en', image+' --type=rendererish --lang=en',
    image+'\0--note=--type=renderer\0', image+'\0--type=utility\0--note=--type=renderer\0'])
    assert.notEqual(observe(title).role, 'renderer');
});
test('actual no-sandbox switches are rejected even in a flattened title', () => {
  for (const title of [image+'\0--type=renderer\0--no-sandbox\0',
    image+' --type=renderer --no-sandbox --lang=en\0', image+' --type=renderer --no-sandbox\0',
    image+'\0--type=renderer\0--no-sandbox=false\0',image+' --type=renderer --no-sandbox=false'])
    assert.equal(observe(title).sandboxDisabled, true);
  assert.equal(observe(image+'\0--type=renderer\0--user-data-dir=/tmp/--no-sandbox\0').sandboxDisabled, false);
});
test('conflicting types and unbounded observations fail without selecting a process', () => {
  assert.throws(()=>observe(image+'\0--type=renderer\0--type=utility\0'), /BROWSER_AMBIGUOUS_PROCESS_TYPE/);
  assert.throws(()=>observe(image+' --type=renderer --type=utility'), /BROWSER_AMBIGUOUS_PROCESS_TYPE/);
  assert.throws(()=>observe('x'.repeat(1024**2+1)), /BROWSER_COMMAND_LINE_BOUND/);
});
