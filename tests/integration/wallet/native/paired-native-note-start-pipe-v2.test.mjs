/** Host contract of the exact private startup reader; in-memory streams, no
 * original parent/process capability, native runtime or economic acceptance. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PassThrough } from 'node:stream';
import vm from 'node:vm';
import { ROOT } from '@lianum/proofs/catalog';
const text = readFileSync(join(ROOT, 'integration/native-flow-supervisor.mjs'), 'utf8');
const start = text.indexOf('async function consumePairedNativeNoteStartPipeV2() {');
const end = text.indexOf('export async function runDevelopmentOsakaSmokeSupervisor()', start);
assert.ok(start >= 0 && end > start, 'EXACT_PRIVATE_PIPE_FUNCTION_REQUIRED');
const original = text.slice(start, end);
function consume({ fd = '7', uid = 1000, fifo = true, mode = 0o600, frames = [Buffer.from('G')],
  failure = null, close = false, deadline = false } = {}) {
  const state = { streamCreated: 0, deadlineMilliseconds: null, destroyed: false };
  const hostProcess = { env: { LIANUM_PAIRED_ORIGINAL_START_FD_V2: fd }, getuid: () => 1000 };
  const stream = new PassThrough(); stream.once('close', () => { state.destroyed = true; });
  const context = vm.createContext({ assert, process: hostProcess,
    fstatSync: value => { assert.equal(value, Number(fd)); return { uid, mode, isFIFO: () => fifo }; },
    createReadStream: (path, options) => {
      assert.equal(path, null); assert.equal(options.fd, Number(fd));
      assert.equal(options.autoClose, true); assert.equal(options.highWaterMark, 2);
      state.streamCreated++;
      if (!deadline) setImmediate(() => {
        if (failure) stream.destroy(Error(failure));
        else if (close) stream.emit('close');
        else { for (const bytes of frames) stream.write(bytes); stream.end(); }
      });
      return stream;
    },
    setTimeout: (callback, milliseconds) => {
      state.deadlineMilliseconds = milliseconds;
      return deadline ? setImmediate(callback) : setTimeout(callback, milliseconds);
    }, clearTimeout: value => { if (deadline) clearImmediate(value); else clearTimeout(value); },
  });
  const promise = new vm.Script(original + '\nconsumePairedNativeNoteStartPipeV2();').runInContext(context);
  return { promise, state, hostProcess, stream };
}
test('one original grant followed by EOF completes and removes only the private env marker', async () => {
  const row = consume(); await row.promise;
  assert.equal(row.state.deadlineMilliseconds, 2000); assert.equal(row.state.streamCreated, 1);
  assert.equal(row.hostProcess.env.LIANUM_PAIRED_ORIGINAL_START_FD_V2, undefined);
});
for (const [name, options, code] of [
  ['EOF before grant', {frames: []}, 'START_CANCELLED'],
  ['wrong grant', {frames: [Buffer.from('X')]}, 'START_GRANT_CHANGED'],
  ['two grant bytes', {frames: [Buffer.from('GG')]}, 'START_GRANT_CHANGED'],
  ['duplicate grant frames', {frames: [Buffer.from('G'), Buffer.from('G')]}, 'START_GRANT_CHANGED'],
  ['stream error', {failure: 'PRIVATE_FIXTURE_ERROR'}, 'START_PIPE_ERROR'],
  ['close before EOF', {close: true}, 'START_PIPE_CLOSED'],
  ['deadline without grant', {deadline: true}, 'START_PIPE_DEADLINE'],
]) test('exact startup reader rejects ' + name + ' without worker admission', async () => {
  const row = consume(options); await assert.rejects(row.promise, new RegExp(code));
  assert.equal(row.state.streamCreated, 1); assert.equal(row.state.deadlineMilliseconds, 2000);
  row.stream.destroy();
});
for (const options of [{fd:'0'}, {fd:'-7'}, {fd:'caller'}, {uid:0}, {fifo:false}, {mode:0o644}])
  test('startup reader rejects an unbound/nonprivate descriptor ' + JSON.stringify(options), async () => {
    const row = consume(options); await assert.rejects(row.promise, /START_PIPE_REQUIRED/);
    assert.equal(row.state.streamCreated, 0); row.stream.destroy();
  });
