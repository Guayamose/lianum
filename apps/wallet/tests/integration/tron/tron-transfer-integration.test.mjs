/** Real shared server/SDK/view-model, with synthetic read-only node responses.
 * No signer, private note, funded chain, proof job, or browser visual acceptance. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { startWalletApplication } from '../../../src/server/server.mjs';
import { validateWalletState, projectWalletState } from '../../../../../packages/mobile-protocol/src/wallet/client/view-model.mjs';
import { createWalletApplicationClient } from '../../../../../packages/backend/src/api/wallet/wallet-application-client.mjs';
import { createFlatAccountSession } from '../../../../../packages/backend/src/api/accounts/flat-account-session.mjs';
import { createTronNativeTransferObserver } from '../../../../../packages/backend/src/chains/tron/observations/tron-native-transfer-observer.mjs';
import { createHttpTronNativeTransferObserver } from '../../../../../packages/backend/src/chains/tron/transfers/tron-native-transfer-http.mjs';
import { createEvmNativeTransferObserver } from '../../../../../packages/backend/src/chains/evm/observations/evm-native-transfer-observer.mjs';
import { originalFixture as evmFixture } from '../../../../../packages/backend/tests/fixtures/chains/evm/transfers/evm-native-transfer-fixture.mjs';
import { fixture, fixtureHttp, serve, respond, signal, http, NOW } from '../../../../../packages/backend/tests/fixtures/chains/tron/transfers/tron-native-transfer-fixture.mjs';
async function app(t, options) { const value = await startWalletApplication(options); t.after(() => value.close()); return value; }
async function setup(t) {
  const f = await fixtureHttp(t);
  const observer = createHttpTronNativeTransferObserver({ chain: 'tron', genesisHash: f.genesisHash, endpoint: f.endpoint,
    original: f.original, now: () => f.state.now });
  return { ...f, observer, options: { networkConfig: f.networkConfig, transferObservers: [observer] } };
}
function assertMetadata(value) {
  const row = value.transfers.rows[0], status = row.status;
  assert.equal(status.schema, 'flat-tron-original-transfer-status/1'); assert.equal(status.family, 'tron');
  assert.equal(status.chainId, null); assert.equal(status.nonce, null); assert.equal(status.asset.decimals, 6);
  for (const flag of ['currentFinalityVerified', 'independentConsensusVerified', 'accountPermissionVerified', 'taposVerified',
    'expirationVerified', 'creditEligible', 'graphAdmissionEligible', 'deliveryVerified', 'recipientRetainedValueVerified']) assert.equal(status[flag], false);
  assert.equal(status.privateSpendableAtomic, null); assert.equal(status.metadataOnly, true);
  assert.equal(status.source, 'retained-observation-metadata'); assert.equal(status.freshness, 'not-revalidated');
  assert.equal(status.finalitySource, 'rpc-solidified');
  assert.doesNotMatch(JSON.stringify(value.transfers), /nativeWire|raw_data|signature|transactionSHA256|receipt|endpoint|transport/);
  return row;
}

test('Tron shares authenticated wallet status, owner association and existing read-only Node client', async t => {
  const f = await setup(t), server = await app(t, f.options);
  const denied = await http(server, '/api/wallet/state', false); assert.equal(denied.status, 403); assert.equal(f.packets.length, 0);
  const result = await http(server); assert.equal(result.status, 200); const value = validateWalletState(result.json);
  assert.equal(value.transfers.profile, 'FIXED_ORIGINAL_NATIVE_TRANSFERS_V2'); const row = assertMetadata(value);
  assert.equal(row.status.status, 'observed'); assert.equal(row.ownerAddress, f.signed.ownerAddress); assert.equal(row.direction, 'outgoing');
  assert.equal(value.errors.transfers, null); assert.equal(value.portfolio, null); assert.equal(value.networks.privateSpendable, false);
  assert.ok(Object.values(value.capabilities).every(value => value === false));
  const view = projectWalletState(value); assert.equal(view.transfers[0].display, '1.250001'); assert.equal(view.transfers[0].family, 'tron');
  assert.equal(view.assets.length, 0); assert.equal(view.transfers[0].currentFinalityVerified, false);
  assert.equal(f.packets.length, 17, 'five holdings reads and twelve original transaction reads');
  const client = createWalletApplicationClient({ origin: server.origin, ownerToken: server.ownerAccess.token });
  await client.refresh(); assert.equal(client.getState().data.transfers.rows[0].status.status, 'observed');
  assertMetadata(client.getState().data);
});

test('Tron/EVM mixed status reuses one route and EVM-only V1 remains backward compatible', async t => {
  const tron = fixture(), evm = evmFixture('ethereum');
  const local = await serve(t, async (packet, res) => {
    if (packet.path === '/evm') respond(res, { jsonrpc: '2.0', id: packet.body.id,
      result: await evm.transport(packet.body.method, packet.body.params, signal()) });
    else respond(res, await tron.transport(packet.path, packet.body, signal()));
  });
  const evmObserver = createEvmNativeTransferObserver(evm.config), tronObserver = createTronNativeTransferObserver(tron.config);
  const networks = [{ chain: 'tron', genesisHash: tron.genesisHash, endpoint: local.endpoint },
    { chain: 'ethereum', genesisHash: evm.genesisHash, endpoint: local.endpoint + 'evm' }];
  const accounts = [{ chain: 'tron', address: tron.signed.ownerAddress }, { chain: 'ethereum', address: evm.original.expected.from }];
  const mixed = await app(t, { networkConfig: { networks, accounts }, transferObservers: [tronObserver, evmObserver] });
  const value = validateWalletState((await http(mixed)).json); assert.equal(value.transfers.rows.length, 2);
  assert.equal(value.transfers.profile, 'FIXED_ORIGINAL_NATIVE_TRANSFERS_V2');
  assert.deepEqual(value.transfers.rows.map(row => row.status.status), ['observed', 'observed']);
  assert.deepEqual(projectWalletState(value).transfers.map(row => row.family), ['tron', 'evm']);
  const old = await app(t, { networkConfig: { networks: [networks[1]], accounts: [accounts[1]] }, transferObservers: [evmObserver] });
  const prior = validateWalletState((await http(old)).json); assert.equal(prior.transfers.profile, 'FIXED_ORIGINAL_EVM_TRANSFERS_V1');
  assert.equal(prior.transfers.rows[0].status.schema, 'flat-evm-original-transfer-status/1');
  assert.equal(prior.transfers.rows[0].status.status, 'observed'); assert.equal(Object.hasOwn(prior.transfers.rows[0].status, 'finalitySource'), false);
});

test('bootstrap refuses unassociated owner/network, duplicate IDs and forged observers without I/O', async t => {
  const f = await setup(t);
  const bad = [{ transferObservers: [f.observer] },
    { ...f.options, networkConfig: { ...f.networkConfig, accounts: [] } },
    { ...f.options, networkConfig: { ...f.networkConfig, networks: [] } },
    { ...f.options, networkConfig: { ...f.networkConfig, accounts: [{ chain: 'tron', address: '41' + 'f'.repeat(40) }] } },
    { ...f.options, networkConfig: { ...f.networkConfig, networks: [{ ...f.networkConfig.networks[0], genesisHash: 'a'.repeat(64) }] } },
    { ...f.options, transferObservers: [f.observer, createTronNativeTransferObserver(f.config)] }];
  let touched = 0; const forged = { originalIdentity() { touched++; }, observe() { touched++; }, status() { touched++; } };
  const getter = []; Object.defineProperty(getter, '0', { enumerable: true, get() { touched++; return f.observer; } });
  for (const observers of [[forged], [{ ...f.observer }], [new Proxy(f.observer, {})], Array(1), getter,
    Array(9).fill(f.observer), new Proxy([f.observer], {})]) bad.push({ ...f.options, transferObservers: observers });
  for (const options of bad) await assert.rejects(startWalletApplication(options));
  assert.equal(touched, 0); assert.equal(f.packets.length, 0);
  const incoming = await app(t, { ...f.options, networkConfig: { ...f.networkConfig,
    accounts: [{ chain: 'tron', address: f.signed.recipientAddress }] } });
  assert.equal((await http(incoming)).json.transfers.rows[0].direction, 'incoming');
});

test('fixed shared route cannot select another transaction, send, rebind or expose raw data', async t => {
  const f = await setup(t), server = await app(t, f.options);
  f.options.transferObservers.length = 0; f.networkConfig.accounts[0].address = '41' + 'e'.repeat(40);
  const initial = await http(server); assert.equal(initial.json.transfers.rows[0].ownerAddress, f.signed.ownerAddress);
  const count = f.packets.length;
  for (const route of ['/api/wallet/state?nativeId=' + f.query.nativeId, '/api/wallet/transfers', '/api/wallet/transfers/observe',
    '/api/wallet/transfers/broadcast', '/api/wallet/rpc']) assert.ok((await http(server, route)).status >= 400);
  assert.equal(f.packets.length, count);
  assert.throws(() => server.bindSessions({ networkConfig: f.networkConfig, transferObservers: [f.observer] }));
});

test('unavailable original account journal suppresses transfer refresh and downgrades retained success', async t => {
  const f = await setup(t); let unavailable = false, ownerReads = 0;
  const keeper = Object.fromEntries(['prepare', 'execute', 'reconcile', 'recover', 'restartCoordinator', 'close']
    .map(name => [name, async () => { if (name !== 'close') assert.fail('UNEXPECTED_ACCOUNT_MUTATION'); }]));
  keeper.snapshot = async () => { if (unavailable) throw new Error('PRIVATE_JOURNAL_CANARY');
    return { version: 1, revision: 0, storageAvailable: true, requests: [] }; };
  const session = await createFlatAccountSession({ keeper, ownerHandoff: { async ownerView() { ownerReads++; return null; } } });
  t.after(() => session.close());
  const server = await app(t, { ...f.options, accountSession: session });
  assert.equal((await http(server)).json.transfers.rows[0].status.status, 'observed');
  unavailable = true; const before = f.packets.filter(packet => packet.path.includes('transaction')).length, reads = ownerReads;
  const result = await http(server), row = assertMetadata(result.json);
  assert.equal(row.refreshStatus, 'BLOCKED'); assert.equal(row.status.status, 'stale'); assert.equal(row.status.validUntilMs, null);
  assert.equal(f.packets.filter(packet => packet.path.includes('transaction')).length, before); assert.equal(ownerReads, reads);
  assert.doesNotMatch(result.text, /PRIVATE_JOURNAL_CANARY/);
  assert.equal(projectWalletState(validateWalletState(result.json)).transfers[0].historical, true);
});

test('failed read removes earlier success and strict shared schema rejects false authority or family aliasing', async t => {
  const f = await setup(t), server = await app(t, f.options);
  const success = validateWalletState((await http(server)).json);
  for (const mutate of [v => v.transfers.profile = 'FIXED_ORIGINAL_EVM_TRANSFERS_V1',
    v => v.transfers.rows[0].status.chainId = '1', v => v.transfers.rows[0].status.nonce = '0',
    v => v.transfers.rows[0].status.asset.decimals = 18, v => v.transfers.rows[0].status.asset.id = 'TRX',
    v => v.transfers.rows[0].status.genesisHash = '0x' + f.genesisHash, v => v.transfers.rows[0].status.independentConsensusVerified = true,
    v => v.transfers.rows[0].status.currentFinalityVerified = true, v => v.transfers.rows[0].status.privateSpendableAtomic = '1',
    v => v.transfers.rows[0].status.nativeWire = f.original.nativeWire, v => v.transfers.rows[0].status.value = '9223372036854775808',
    v => v.transfers.rows[0].status.from = '0x' + 'a'.repeat(40), v => v.transfers.rows.push(v.transfers.rows[0])]) {
    const value = structuredClone(success); mutate(value); assert.throws(() => validateWalletState(value), /WALLET_TRANSFERS_CONTRACT/);
  }
  f.state.transaction = {}; f.state.info = {};
  const failure = validateWalletState((await http(server)).json), row = assertMetadata(failure);
  assert.equal(row.status.status, 'unknown'); assert.equal(row.status.validUntilMs, null);
  assert.equal(failure.errors.transfers, 'WALLET_TRANSFER_OBSERVATION_UNAVAILABLE'); assert.equal(failure.portfolio, null);
  assert.equal(projectWalletState(failure).transfers[0].historical, true);
});

test('draft UI displays Tron-specific lack of nonce and finality/permission limits without new actions', async () => {
  const source = await readFile(new URL('../../../src/client/app.mjs', import.meta.url), 'utf8');
  assert.match(source, /transfer\.family === 'tron' \? 'Tipo original'/);
  assert.match(source, /solidificación reportada por RPC; sin consenso independiente/);
  assert.match(source, /TAPOS ni expiración verificados/);
  assert.doesNotMatch(source, /\/api\/wallet\/transfers\/|setInterval/);
  const html = await readFile(new URL('../../../src/client/index.html', import.meta.url), 'utf8');
  assert.match(html, /REDES NATIVAS · ORIGINALES FIJADOS POR EL HOST/);
  assert.doesNotMatch(html, /EVM · ORIGINALES FIJADOS/);
});

test('busy original account queue blocks Tron observation before any transaction lookup', async t => {
  const f = await setup(t); let enter, release;
  const entered = new Promise(resolve => enter = resolve), gate = new Promise(resolve => release = resolve);
  const keeper = Object.fromEntries(['prepare', 'execute', 'recover', 'restartCoordinator', 'close']
    .map(name => [name, async () => { if (name !== 'close') assert.fail('UNEXPECTED_ACCOUNT_MUTATION'); }]));
  keeper.reconcile = async () => { enter(); await gate; };
  keeper.snapshot = async () => ({ version: 1, revision: 0, storageAvailable: true,
    requests: [{ requestId: 'original_request_01', kind: 'TOP_UP', state: 'CONFIRMED', errorCode: null }] });
  const session = await createFlatAccountSession({ keeper, ownerHandoff: { async ownerView() { return null; } } });
  t.after(async () => { release(); await session.close(); });
  const server = await app(t, { ...f.options, accountSession: session });
  assert.equal((await http(server)).json.transfers.rows[0].status.status, 'observed');
  session.submit('reconcile', { requestId: 'original_request_01' }); await entered;
  const count = f.packets.filter(packet => packet.path.includes('transaction')).length;
  const value = validateWalletState((await http(server)).json), row = assertMetadata(value);
  assert.equal(row.refreshStatus, 'BLOCKED'); assert.equal(row.status.reason, 'WALLET_OPERATION_IN_PROGRESS');
  assert.equal(row.status.status, 'stale'); assert.equal(row.status.validUntilMs, null);
  assert.equal(f.packets.filter(packet => packet.path.includes('transaction')).length, count);
  release(); await session.idle();
  assert.equal((await http(server)).json.transfers.rows[0].status.status, 'observed');
});

test('thrown clock read is a failed refresh without carrying forward earlier Tron success', async t => {
  const f = await setup(t), server = await app(t, f.options);
  assert.equal((await http(server)).json.transfers.rows[0].status.status, 'observed');
  f.state.now = 'PRIVATE_CLOCK_CANARY';
  const result = await http(server), row = assertMetadata(result.json);
  assert.equal(row.refreshStatus, 'FAILED'); assert.equal(row.status.status, 'unknown'); assert.equal(row.status.validUntilMs, null);
  assert.equal(row.errorCode, 'WALLET_TRANSFER_OBSERVATION_UNAVAILABLE'); assert.doesNotMatch(result.text, /PRIVATE_CLOCK_CANARY/);
});
