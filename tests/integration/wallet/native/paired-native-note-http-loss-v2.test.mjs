/** Host-only execution of the exact original worker transport adapter.
 * Synthetic HTTP responses here issue no account/runtime/proof authority. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, mkdirSync, writeFileSync, lstatSync, rmSync, existsSync, realpathSync, symlinkSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { runInNewContext } from 'node:vm';
const source = readFileSync(new URL('./paired-native-note-flow-v2.mjs', import.meta.url), 'utf8');
const begin = source.indexOf('      const translate = async (target, options) =>');
const end = source.indexOf('      const api = createOriginalAccountApiV2', begin);
assert.ok(begin >= 0 && end > begin);
const adapterSource = source.slice(begin, end);
function transport(status, discard = true) {
  let received = 0, cancelCalls = 0, bodyReadCalls = 0;
  const response = { status, bodyUsed: false, headers: {},
    body: { cancel: async () => { cancelCalls++; }, getReader: () => { bodyReadCalls++; throw Error('UNEXPECTED_READ'); } } };
  const api = runInNewContext(`(function(){ let calls=0, diagnosticsPosts=0, dropNext=${discard}, loss=null;
    ${adapterSource}
    return { translate, current:()=>({calls,diagnosticsPosts,dropNext,loss}) };
  })()`, { assert, URL, Response, descriptor: { origin: 'https://paired-native-note-v2.example' },
    server: { url: 'http://127.0.0.1:1234' }, active() {},
    fetch: async (target, options) => { received++; assert.equal(target, 'http://127.0.0.1:1234/v2/mobile/original-account/diagnostics');
      assert.equal(options.method, 'POST'); return response; } });
  return { api, observed: () => ({ received, cancelCalls, bodyReadCalls }) };
}
test('real adapter discards the owned HTTP200 body before delivering it to the mobile API, with one fixed POST', async () => {
  const value = transport(200);
  await assert.rejects(value.api.translate('https://paired-native-note-v2.example/v2/mobile/original-account/diagnostics',
    { method: 'POST' }), /HTTP_REPLY_LOST_BEFORE_API/);
  assert.deepEqual(value.observed(), { received: 1, cancelCalls: 1, bodyReadCalls: 0 });
  const { diagnosticsPosts, dropNext, loss } = value.api.current();
  assert.equal(diagnosticsPosts, 1); assert.equal(dropNext, false);
  assert.equal(loss.actualHttpStatus, 200); assert.equal(loss.responseBodyDeliveredToApi, false);
  assert.equal(loss.diagnosticsPostsBefore, 0); assert.equal(loss.diagnosticsPostsAfter, 1);
});
test('adapter cannot label a rejected original response as completed loss or target another origin', async () => {
  const rejected = transport(403);
  await assert.rejects(rejected.api.translate('https://paired-native-note-v2.example/v2/mobile/original-account/diagnostics',
    { method: 'POST' }), /REAL_COMPLETED_HTTP_REPLY_REQUIRED/);
  assert.equal(rejected.api.current().loss, null); assert.deepEqual(rejected.observed(), { received: 1, cancelCalls: 0, bodyReadCalls: 0 });
  const other = transport(200);
  await assert.rejects(other.api.translate('https://elsewhere.example/v2/mobile/original-account/diagnostics',
    { method: 'POST' }));
  assert.deepEqual(other.observed(), { received: 0, cancelCalls: 0, bodyReadCalls: 0 });
});

const removeBegin = source.indexOf('      async function removeOwnSyntheticState(target)');
const removeEnd = source.indexOf('      if (result.cleanup.closedOwner === true)', removeBegin);
assert.ok(removeBegin >= 0 && removeEnd > removeBegin);
const removeSource = source.slice(removeBegin, removeEnd);
test('fixed cleanup removes only its own isolated synthetic vault/journal directories and retains evidence', async t => {
  const privateDirectory = mkdtempSync(join(tmpdir(), 'paired-note-cleanup-host-'));
  t.after(() => rmSync(privateDirectory, { recursive: true, force: true }));
  const ownerDirectory = join(privateDirectory, 'owner'), journalDirectory = join(privateDirectory, 'session-journal');
  for (const target of [ownerDirectory, journalDirectory]) { mkdirSync(target, { mode: 0o700 });
    writeFileSync(join(target, 'synthetic-marker.vault'), 'NO_KEYS_NO_FINANCIAL_STATE', { mode: 0o600 }); }
  const evidence = join(privateDirectory, 'public-receipt.json'); writeFileSync(evidence, '{}', { mode: 0o600 });
  const remove = runInNewContext(`(function(){ ${removeSource}; return removeOwnSyntheticState; })()`,
    { assert, privateDirectory, ownerDirectory, journalDirectory, lstatSync, rmSync, existsSync, realpathSync, process });
  await assert.rejects(remove(privateDirectory)); assert.equal(existsSync(evidence), true);
  await remove(ownerDirectory); await remove(journalDirectory);
  assert.equal(existsSync(ownerDirectory), false); assert.equal(existsSync(journalDirectory), false);
  assert.equal(readFileSync(evidence, 'utf8'), '{}');
  mkdirSync(journalDirectory, { mode: 0o700 }); symlinkSync(journalDirectory, ownerDirectory);
  await assert.rejects(remove(ownerDirectory)); assert.equal(existsSync(journalDirectory), true);
});
