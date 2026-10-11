/** Pure formatter/shared-workflow checks. No listener, provider, native node,
 * proof, original journal, account keys or funds are opened by this suite. */
import test from 'node:test';
import assert, { AssertionError } from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { publicCode } from '../../../../packages/backend/src/api/wallet/http/public-errors.mjs';
import { createWalletClient, WALLET_PROFILE, NATIVE_IDENTITY_PROFILE } from '../../../../packages/mobile-protocol/src/wallet/client/view-model.mjs';

const failure = code => Object.assign(new Error(code), { code });
const fallback = native => native ? 'NATIVE_CLAIM_OPERATION_FAILED' : 'WALLET_OPERATION_FAILED';
const prefixes = ['WALLET', 'PRIVATE_VAULT_EXIT', 'BACKED_VAULT', 'NATIVE_CLAIM', 'CLAIM',
  'VAULT', 'SOLANA', 'BITCOIN', 'LOCAL_EVM', 'ROLE_CLIENT', 'FLAT_OPERATOR', 'COMBINED_OPERATOR', 'FLAT_ACCOUNT', 'JOURNAL'];
const formatterURL = import.meta.resolve('@lianum/backend/api/wallet/http/public-errors');

// Exercise every literal in the explicit vocabulary through real own-data and
// Node assertion producers, while testing intended public codes independently.
test('every fixed contract code remains exact through each supported owned error shape', async () => {
  const source = await readFile(new URL(formatterURL), 'utf8');
  assert.equal(publicCode, (await import(formatterURL)).publicCode, 'App facade preserves the backend formatter');
  const list = source.slice(source.indexOf('const publicCodes = new Set(['), source.indexOf('\n]);'));
  const codes = [...list.matchAll(/'([A-Z][A-Z0-9_]+)'/g)].map(match => match[1]);
  assert.equal(codes.length, 225); assert.equal(new Set(codes).size, codes.length);
  for (const code of codes) for (const native of [false, true]) {
    assert.equal(publicCode(failure(code), native), code);
    assert.equal(publicCode(new Error(code), native), code);
    assert.equal(publicCode(Object.assign(Object.create(null), { code }), native), code);
    const error = new AssertionError({ message: code, actual: 'PRIVATE_ACTUAL_SENTINEL',
      expected: 'PRIVATE_EXPECTED_SENTINEL', operator: 'deepStrictEqual' });
    assert.equal(publicCode(error, native), code);
  }
  for (const code of ['WALLET_ACTION_ACCESS_REQUIRED', 'WALLET_INVALID_ORIGIN', 'WALLET_BODY_TOO_LARGE',
    'WALLET_OPERATION_IN_PROGRESS', 'WALLET_ACCOUNT_REQUEST_CONFLICT', 'WALLET_WRAPPED_WITHDRAWAL_EXACT_ACCESS_REQUIRED',
    'FLAT_ACCOUNT_KEEPER_UNAVAILABLE', 'FLAT_ACCOUNT_OWNER_VIEW_BUSY', 'NATIVE_CLAIM_BUSY',
    'NATIVE_CLAIM_STORAGE_UNAVAILABLE', 'NATIVE_CLAIM_REQUEST_REBOUND', 'NATIVE_CLAIM_UNKNOWN_REQUEST',
    'CLAIM_KEEPER_RECONCILIATION_REQUIRED', 'CLAIM_KEEPER_WRITE_UNCERTAIN', 'JOURNAL_STORAGE_UNAVAILABLE',
    'PRIVATE_VAULT_EXIT_RECONCILE_REQUIRED', 'PRIVATE_VAULT_EXIT_STORAGE_UNAVAILABLE']) {
    assert.equal(publicCode(failure(code)), code);
  }
});

test('all formerly accepted prefixes reject synthetic private labels and provider details', () => {
  for (const prefix of prefixes) for (const native of [false, true]) {
    for (const suffix of ['PRIVATE_PROVIDER_ACCOUNT_8675309', 'PRIVATE_BALANCE_123456789', 'PRIVATE_IDENTIFIER_AABBCC']) {
      const label = prefix + '_' + suffix;
      for (const error of [failure(label), new Error(label), { code: label },
        new AssertionError({ message: label, actual: 'secret', expected: 'another', operator: 'strictEqual' })]) {
        assert.equal(publicCode(error, native), fallback(native));
      }
    }
  }
  for (const text of ['provider https://private.invalid/rpc?token=PRIVATE_SECRET balance=42',
    '/home/private/keys/provider.json', '0x' + 'a'.repeat(64), '8675309',
    'WRAPPED_WITHDRAWAL_APPROVED_HEAD_CHANGED', 'PRIVATE_VAULT_GENERATION_VAULT_CHANGED',
    'FLAT_ACCOUNT_VOLATILE_ADMISSION_V1']) {
    assert.equal(publicCode(failure(text)), fallback(false));
    assert.equal(publicCode(new Error(text), true), fallback(true));
  }
});

test('exact membership rejects suffixes, terminators, unicode and oversized labels without coercion', () => {
  for (const code of ['WALLET_ACTION_ACCESS_REQUIRED', 'NATIVE_CLAIM_BUSY', 'PRIVATE_VAULT_EXIT_STORAGE_UNAVAILABLE']) {
    for (const suffix of ['\n', '\r', '\r\n', '\u2028', '\u2029', '\0', ' ', '_PRIVATE_42', '\nPRIVATE_DETAILS']) {
      assert.equal(publicCode(failure(code + suffix)), fallback(false));
      assert.equal(publicCode(new Error(code + suffix), true), fallback(true));
    }
    for (const label of [' ' + code, code.toLowerCase(), code.replace('_', '\uff3f'), code + 'A'.repeat(1_000_000)]) {
      assert.equal(publicCode(failure(label)), fallback(false));
    }
  }
  const value = { toString() { assert.fail('Error code coercion is forbidden'); } };
  assert.equal(publicCode({ code: value, message: 'WALLET_ACTION_ACCESS_REQUIRED' }), fallback(false));
});

test('assertions reveal only the exact custom code, never diagnostic suffixes, causes or stacks', () => {
  const code = 'NATIVE_CLAIM_REQUEST_REBOUND';
  const error = new AssertionError({ message: code, actual: { amount: 'PRIVATE_AMOUNT_42' },
    expected: { account: 'PRIVATE_ACCOUNT_99' }, operator: 'deepStrictEqual' });
  // Node may append diagnostic output; explicitly cover a long suffix too.
  error.message = code + '\n' + 'PRIVATE_CAUSE_STACK_AND_DETAILS'.repeat(100_000);
  assert.equal(publicCode(error, true), code);
  const ordinary = Object.assign(new Error(code + '\nPRIVATE_SUFFIX'), { generatedMessage: false });
  assert.equal(publicCode(ordinary, true), fallback(true));
  assert.equal(publicCode({ code: 'ERR_ASSERTION', generatedMessage: false, message: code + '\nPRIVATE_SUFFIX' }), fallback(false));
  const generated = new AssertionError({ actual: 'PRIVATE_ACTUAL', expected: 'PRIVATE_EXPECTED', operator: 'strictEqual' });
  assert.equal(publicCode(generated), fallback(false));
  assert.equal(publicCode({ code: 'PRIVATE_UNKNOWN', message: code }), fallback(false));
  assert.equal(publicCode({ code, message: 'PRIVATE_PROVIDER_TEXT' }, true), code);
});

test('hostile properties and proxies cannot execute accessors or escape the formatter', () => {
  let touched = 0;
  const touch = () => { touched++; throw new Error('PRIVATE_ACCESSOR'); };
  const descriptors = Object.fromEntries(['code', 'message', 'generatedMessage', 'stack', 'cause', 'name']
    .map(key => [key, { get: touch }]));
  const hostile = Object.defineProperties({}, descriptors);
  Object.defineProperty(hostile, Symbol.toStringTag, { get: touch });
  const native = Object.defineProperties(new Error(), descriptors);
  const proxy = new Proxy({}, Object.fromEntries(['get', 'getOwnPropertyDescriptor', 'getPrototypeOf', 'ownKeys', 'has']
    .map(key => [key, touch])));
  const revoked = Proxy.revocable(new Error('WALLET_ACTION_ACCESS_REQUIRED'), {}); revoked.revoke();
  const prototype = new Proxy({}, { get: touch, getPrototypeOf: touch, getOwnPropertyDescriptor: touch });
  for (const error of [hostile, native, proxy, revoked.proxy, Object.create(prototype),
    Object.create({ code: 'WALLET_ACTION_ACCESS_REQUIRED', message: 'PRIVATE_INHERITED' }),
    null, undefined, false, 1, 1n, Symbol('PRIVATE_SYMBOL'), 'WALLET_ACTION_ACCESS_REQUIRED', () => {}]) {
    for (const isNative of [false, true]) assert.equal(publicCode(error, isNative), fallback(isNative));
  }
  const withSafeCode = Object.defineProperties({}, { code: { value: 'WALLET_ACTION_ACCESS_REQUIRED' },
    message: { get: touch }, generatedMessage: { get: touch }, cause: { get: touch }, stack: { get: touch } });
  assert.equal(publicCode(withSafeCode), 'WALLET_ACTION_ACCESS_REQUIRED');
  const withSafeMessage = Object.defineProperties({}, { message: { value: 'WALLET_ACTION_ACCESS_REQUIRED' }, code: { get: touch } });
  assert.equal(publicCode(withSafeMessage), 'WALLET_ACTION_ACCESS_REQUIRED');
  assert.equal(touched, 0);
});

const requestId = 'original_request_01', intentId = 'c'.repeat(64);
function state() {
  return { version: 1, profile: WALLET_PROFILE, connection: 'CONNECTED', portfolio: null,
    nativeClaims: { identity: { version: 1, profile: NATIVE_IDENTITY_PROFILE, accountId: 'original_account_01',
      claimDomain: '1'.repeat(64), nativeFamily: '1', nativeGenesis: '2'.repeat(64), nativeAsset: '3'.repeat(64),
      wrapperAssetIdentity: '4'.repeat(64), claimSymbol: 'cBTC', nativeSymbol: 'BTC', decimals: 8, atomicUnit: 'satoshi',
      observation: 'ORIGINAL_BOUND_CONFIGURATION_ONLY' },
      snapshot: { phase: 'READY', storageAvailable: true, busy: false, queued: 0,
        observation: 'DURABLE_JOURNAL_ONLY', requests: [] }, owner: { deposits: [], tickets: [], requests: [] } },
    capabilities: { nativeDeposit: true, nativeRedeem: true, nativeRefund: true, nativeReconcile: true, nativeResume: true, graphExecution: false },
    errors: { portfolio: null, nativeClaims: null } };
}
const response = (value, status = 200) => ({ status, ok: status >= 200 && status < 300, json: async () => structuredClone(value) });

test('public and opaque failures preserve SDK UNKNOWN and require manual original reconciliation', async () => {
  for (const error of [failure('NATIVE_CLAIM_BUSY'), failure('NATIVE_CLAIM_STORAGE_UNAVAILABLE'),
    failure('NATIVE_CLAIM_PRIVATE_BALANCE_123456789'), new Error('private provider response')]) {
    const calls = []; let value = state();
    const client = createWalletClient({ ownerToken: 'a'.repeat(64), actionToken: 'b'.repeat(64),
      fetchImpl: async (path, options) => {
        calls.push({ path, method: options.method, body: options.body });
        return options.method === 'GET' ? response(value) : response({ error: publicCode(error, true) }, 400);
      } });
    assert.equal(await client.refresh(), true);
    client.review('deposit', { requestId, intentId }); assert.equal(await client.confirm(), false);
    assert.deepEqual(client.getState().outcome, { state: 'UNKNOWN', action: 'deposit', requestId });
    assert.equal(client.getState().originalRequestIds.native, requestId);
    assert.equal(client.getState().stale, true); assert.equal(client.can('deposit'), false);
    assert.equal(await client.confirm(), false); assert.equal(calls.filter(call => call.method === 'POST').length, 1);
    // Current original journal still permits reconciliation when owner read
    // failure becomes the generic opaque code. Stale or busy journals do not.
    value.nativeClaims.owner = null; value.errors.nativeClaims = publicCode(error, true);
    assert.equal(await client.refresh(), true); assert.equal(client.can('reconcile'), true);
    assert.equal(client.can('deposit'), false); assert.equal(client.getState().originalRequestIds.native, requestId);
    client.review('reconcile', { requestId }); assert.equal(client.getState().review.body.requestId, requestId);
    assert.equal(calls.filter(call => call.method === 'POST').length, 1);
    value.nativeClaims.snapshot.busy = true; await client.refresh(); assert.equal(client.can('reconcile'), false);
    assert.equal(client.getState().review, null);
    value.nativeClaims.snapshot = null; await client.refresh(); assert.equal(client.can('reconcile'), false);
  }
});

test('server uses the private helper at every existing thrown-error boundary', async () => {
  const serverURL = new URL(import.meta.resolve('@lianum/backend/wallet/http-service'));
  const server = await readFile(serverURL, 'utf8');
  const importedHelper = /import \{ publicCode \} from '([^']+)';/.exec(server);
  assert.ok(importedHelper, 'Server must import the shared public error formatter');
  assert.equal(new URL(importedHelper[1], serverURL).href,
    formatterURL);
  assert.doesNotMatch(server, /function publicCode\(/);
  assert.equal([...server.matchAll(/publicCode\(error/g)].length, 5);
  const app = await readFile(new URL('../../src/server/server.mjs', import.meta.url), 'utf8');
  assert.doesNotMatch(app, /public-errors/);
});

// Preserve the existing consumed-token failure response asserted by
// exact-action-capabilities.test.mjs; the fixed label grants no retry authority.
test('established unresolved-outcome wire label remains exact with opaque diagnostic text', () => {
  const code = 'NATIVE_CLAIM_ORIGINAL_OUTCOME_UNRESOLVED';
  for (const native of [false, true]) {
    const error = failure(code);
    error.message = 'PRIVATE_PROVIDER_DIAGNOSTIC';
    error.cause = new Error('PRIVATE_CAUSE');
    assert.equal(publicCode(error, native), code);
    assert.equal(publicCode(failure(code + '_PRIVATE_DETAIL'), native), fallback(native));
  }
});
