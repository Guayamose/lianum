/** HOST observation/lifecycle only: genuine Vault AES/CAS, HTTP and consumer.
 * Lower original account/catalogue memberships are explicit synthetic ports;
 * no node, funded note, proof, native acceptance or signer is established. */
import test, {mock} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, readFile, writeFile, chmod, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {request} from 'node:http';
import {Vault} from '../../../../engine/src/crypto/vault.mjs';
import {sha, genericAccountIdentity} from '../../../../engine/src/execution/accounts/generic-account-journal.mjs';
import {createFlatAccountSession} from '../../../src/api/accounts/flat-account-session.mjs';
import {projectPrivatePositionStateV2} from '../../../src/defi/positions/private-position-state-v2.mjs';
import {validateOriginalWalletEconomicStateV1, projectOriginalWalletEconomicStateV1, originalEconomicRouteKeyV1}
  from '../../../../../apps/wallet/src/client/features/portfolio/original-economic-state-v1.mjs';
import {validateWalletState, projectWalletState} from '../../../../../apps/wallet/src/client/state/view-model.mjs';
const mapped = new URL(import.meta.url).pathname.includes('/wallet-platform/modules/');
const moduleURL = (raw, flat) => new URL(mapped ? flat : raw, import.meta.url);
const catalogues = new WeakMap(), natives = new WeakMap(), pairs = new WeakMap(), positions = new WeakMap();
const no = () => {throw Error('SYNTHETIC_LOWER_PORT_REJECTED');};
mock.module(moduleURL('../../../src/accounts/storage/flat-journal-catalogue.mjs', '../../global-state/flat-journal-catalogue.mjs'), {namedExports: {
  assertOwnedFlatJournalCatalogue(value, expected) {if (catalogues.get(value)?.runtime !== expected.runtime) no();},
  assertOwnedFlatJournalCatalogueAccount() {no();},
}});
mock.module(moduleURL('../../../src/accounts/authority/native-value-account-authority-v2.mjs', '../../global-state/native-value-account-authority-v2.mjs'), {namedExports: {
  assertOwnedNativeValueAccountAuthority(value, expected) {const row = natives.get(value); if (!row || row.runtime !== expected.runtime || row.system !== expected.system) no();},
}});
// This session is real. Only its catalogue membership assertion is a lower
// synthetic port; no copied session/portfolio is admitted by that port.
mock.module(moduleURL('../../../src/api/accounts/flat-manual-graph-session.mjs', '../../api/flat-manual-graph-session.mjs'), {namedExports: {
  assertFlatManualGraphCatalogueSession(session, expected) {const p = pairs.get(session); if (!p || p.runtime !== expected.runtime || p.catalogue !== expected.catalogue) no();},
  flatManualGraphReviews() {return [];}, flatManualGraphActionTarget() {return null;}, flatManualGraphHandoffBindings() {return [];},
  flatManualNativeNoteReviews() {return [];}, flatManualNativeNoteActionTarget() {return null;}, flatManualWrappedGraphActionTarget() {return null;},
}});
mock.module(moduleURL('../../../src/accounts/portfolio/wrapped-wallet-portfolio-v1.mjs', '../../global-state/wrapped-wallet-portfolio-v1.mjs'), {namedExports: {
  assertOwnedWrappedWalletPortfolioV1() {no();},
}});
mock.module(moduleURL('../../../src/defi/withdrawals/generation-private-vault-exit.mjs', '../../defi-adapters/generation-private-vault-exit.mjs'), {namedExports: {
  generationPrivateVaultExitBinding(runtime, service) {const p = positions.get(service); return p?.runtime === runtime ? {runtime, catalogue: p.catalogue} : null;},
  assertGenerationPrivateVaultExitSession(runtime, service, session) {const p = positions.get(service); if (!p || p.runtime !== runtime || p.session !== session) no();},
  generationPrivateVaultExitActionTarget() {return null;},
}});
const {createOriginalWalletEconomicStateV1, openOriginalWalletEconomicStateV1, assertOriginalWalletEconomicStateV1} = await import('../../../src/accounts/state/original-wallet-economic-state-v1.mjs');
const {startWalletApplication} = await import('../../../../../apps/wallet/src/server/server.mjs');
const h = v => createHash('sha256').update(v).digest('hex');
const asset = (id, domain, token = '3'.repeat(40)) => ({assetId: id, kind: 'ERC20', symbol: 'USDC', decimals: 6,
  chainId: '31337', genesis: h(domain + '-genesis'), pool: domain === 'first' ? '1'.repeat(40) : '2'.repeat(40), scope: h(domain + '-scope'),
  policy: h(domain + '-policy'), token, codeHash: h('code'), assetIdentity: h('asset'), custody: 'ONCHAIN_NOTE_POOL', trust: 'PINNED_LOCAL_CONTRACT_AND_TRUSTED_NATIVE_ISSUER'});
const view = (a, block, amount) => ({version: 1, status: 'LIVE', asset: {assetId: a.assetId, symbol: a.symbol, decimals: a.decimals},
  observed: {observedAt: Date.now(), blockNumber: String(block), blockHash: h('block-' + block), timestamp: '1000'},
  balances: {available: amount, reserved: '2', recovery: '1', locked: '1'}, backing: {held: '100', liabilities: '90', surplus: '10', deficit: '0'}, requests: []});
function http(app, token = app.ownerAccess.token, origin = app.origin) {
  return new Promise((resolve, reject) => {const req = request(app.origin + '/api/wallet/state', {headers: {Origin: origin, 'x-wallet-owner-token': token}}, res => {
    const chunks = []; res.on('data', x => chunks.push(x)); res.on('end', () => resolve({status: res.statusCode, body: JSON.parse(Buffer.concat(chunks))}));
  }); req.on('error', reject); req.end();});
}
test('original economic union keeps domains, original pending/position heads, CAS uncertainty and owner HTTP boundary', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'original-economic-host-')); await chmod(directory, 0o700);
  t.after(() => rm(directory, {recursive: true, force: true}));
  const runtime = {}, system = {}, a = asset(h('same-asset'), 'first'), b = asset(a.assetId, 'second'), underlying = {...asset(h('underlying'), 'first', '4'.repeat(40)), pool:'5'.repeat(40), assetIdentity:h('underlying-asset')}, generationId = h('generation');
  const config = {accountId: 'host_catalogue_account', journalId: 'host_catalogue_journal', lifetime: h('catalogue-lifetime'), registry: [a, underlying]};
  let phase = null, amount = '10', unavailable = false, ownerConfirmed = true, valuationStale = false, gate = null, observedCalls = 0;
  const originalView = () => ({...view(a, 10, amount), requests: phase ? [{requestId: 'original_top_up_01', kind: 'TOP_UP', state: phase === 'CONFIRMED' && ownerConfirmed ? 'CONFIRMED' : 'UNRESOLVED', disposition: phase === 'CONFIRMED' && ownerConfirmed ? 'APPLIED' : null}] : []});
  const routes = [a, underlying].map(value => ({assetId:value.assetId,pool:value.pool,domainCommitment:h('domain-'+value.assetId)}));
  const originalPortfolio = () => {const one=originalView();return {version:1,profile:'OWNED_FLAT_PRIVATE_PORTFOLIO_V1',status:'LIVE',coherent:true,observed:one.observed,
    assets:[one,{...view(underlying,10,'0'),observed:one.observed}],
    capabilities:{coordinatorRestart:true,keeperRestart:false,crossAssetAtomicConversion:false,privateDeFiComposability:false,fullWalletAcceptance:false}};};
  const keeper = {async snapshot() {return {version: 1, revision: phase ? 1 : 0, storageAvailable: true, requests: phase ? [{requestId: 'original_top_up_01', assetId: a.assetId, kind: 'TOP_UP', state: phase, errorCode: null}] : []};},
    async close() {}, async prepare() {no();}, async execute() {no();}, async reconcile() {no();}, async recover() {no();}, async restartCoordinator() {no();}};
  const catalogue = {keeper, status() {return {generations:[{generationId,identity:genericAccountIdentity(config),registry:[a,underlying],routes}],
    bindings:phase?[{generationId,request:{requestId:'original_top_up_01',assetId:a.assetId,kind:'TOP_UP'}}]:[],storageFault:false,uncertainWrite:false};},
    async ownerView(){observedCalls++;if(gate)await gate;if(unavailable)no();const portfolio=originalPortfolio();return {version:2,profile:'FLAT_IMMUTABLE_JOURNAL_CATALOGUE_V2',status:'LIVE',coherent:true,observed:portfolio.observed,
      generations:[{generationId,routes,portfolio,errorCode:null}],capabilities:{coordinatorRestart:true,keeperRestart:false,nodeRestart:false,privateBalancesAggregated:false,implicitNoteMigration:false,fullWalletAcceptance:false}};}};
  catalogues.set(catalogue, {runtime});
  const session = await createFlatAccountSession({keeper, ownerHandoff: catalogue}); pairs.set(session, {runtime, catalogue}); t.after(() => session.close());
  // Synthetic source/vault observations pass through the original projector;
  // they do not manufacture an official vault or a private service brand.
  const vaultIdentity={chainId:'31337',genesisHash:a.genesis,domain:h('vault-domain'),runtimeId:h('runtime'),asset:underlying.token,assetCodeSHA256:underlying.codeHash,vault:a.token,vaultCodeSHA256:a.codeHash};
  const positionService = {async ownerStateView(){const portfolioView=originalPortfolio(),observed=portfolioView.observed;
    const vaultView={identity:vaultIdentity,snapshot:{blockNumber:valuationStale?'9':observed.blockNumber,blockHash:valuationStale?h('block-9'):observed.blockHash,blockTimestamp:observed.timestamp,totalAssets:'200',totalShares:'100'}};
    const row=projectPrivatePositionStateV2({generationId,shareAssetId:a.assetId,underlyingAssetId:underlying.assetId,identity:vaultIdentity,portfolioView,vaultView});
    return {version:2,profile:'OWNED_GENERATION_PRIVATE_VAULT_POSITIONS_V2',positions:[row],privateBalancesAggregated:false,underlyingPrivateSpendable:false};},
    async snapshot(){return {version:1,profile:'OWNED_PRIVATE_VAULT_EXIT_V1',operations:[],generationProjection:{version:1,profile:'OWNED_GENERATION_PRIVATE_VAULT_EXITS_V1',
      generations:[{generationId,shareAssetId:a.assetId,status:'AVAILABLE',requestIds:[],errorCode:null}]}};}};
  positions.set(positionService, {runtime, catalogue, session});
  const nativeAccount = {config: {accountId: 'host_native_account', journalId: 'host_native_journal', lifetime: h('native-lifetime'), registry: [b]}, registry: [b],
    async privateStatus() {return {operations: []};}, async ownerView() {return view(b, 50, '7');}};
  natives.set(nativeAccount, {runtime, system});
  const input = {catalogues: [{runtime, catalogue, session, positions: positionService}], nativeAccounts: [{runtime, system, account: nativeAccount}], wrappedPortfolios: [], journal: {path: join(directory, 'union.vault'), password: 'synthetic-observation-password'}};
  await assert.rejects(createOriginalWalletEconomicStateV1({...input, nativeAccounts: [{runtime, system, account: {...nativeAccount}}]}));
  let state = await createOriginalWalletEconomicStateV1(input); t.after(() => state.close());
  assert.throws(() => assertOriginalWalletEconomicStateV1({...state}));
  let observed = validateOriginalWalletEconomicStateV1(await state.observe()); assert.equal(observed.status, 'LIVE');
  assert.equal(observed.rows.length,3);assert.equal(observed.rows[0].route.assetId,observed.rows[2].route.assetId);assert.equal(new Set(observed.rows.map(r=>r.route.assetId)).size,2);
  assert.equal(new Set(observed.rows.map(r => originalEconomicRouteKeyV1(r.route))).size, 3);
  assert.deepEqual(observed.rows.map(r => r.head.blockNumber), ['10','10','50']); // independent domains; no same-height demand
  assert.equal(observed.rows[0].position.estimate, '19'); assert.equal(observed.rows[0].balances.available, '10');
  const acknowledged = await readFile(input.journal.path); const revision = observed.revision;
  assert.equal((await state.observe()).revision, revision); assert.deepEqual(await readFile(input.journal.path), acknowledged);
  const expired = projectOriginalWalletEconomicStateV1(observed, {now: observed.observedAt + 30001});
  assert.equal(expired.rows[0].state, 'STALE'); assert.equal(expired.rows[0].balances, null); assert.equal(expired.rows[0].position.estimate, null);
  const checkpoint = state.checkpoint(); await state.close();
  await assert.rejects(createOriginalWalletEconomicStateV1(input), e => e.code === 'VAULT_EXISTS');
  await assert.rejects(openOriginalWalletEconomicStateV1({...input, checkpoint: {...checkpoint, stateSHA256: h('wrong-checkpoint')}}), /ORIGINAL_CHECKPOINT_REQUIRED/);
  state = await openOriginalWalletEconomicStateV1({...input, checkpoint});
  observed = await state.snapshot(); assert.equal(observed.rows[0].state, 'STALE'); assert.equal(observed.rows[0].balances, null);
  observed = await state.observe(); assert.equal(observed.status, 'LIVE');
  phase = 'UNKNOWN'; observed = await state.observe(); assert.equal(observed.rows[0].state, 'UNKNOWN'); assert.equal(observed.rows[0].balances, null);
  assert.equal(observed.rows[2].balances.available, '7'); assert.equal(observed.rows[0].requests[0].requestId, 'original_top_up_01');
  phase = 'CONFIRMED'; observed = await state.reconcile(); assert.equal(observed.rows[0].state, 'LIVE'); assert.equal(observed.rows[0].requests[0].disposition, 'APPLIED');
  ownerConfirmed = false; observed = await state.observe(); assert.equal(observed.rows[0].state, 'STALE'); assert.equal(observed.rows[0].balances, null); assert.equal(observed.rows[0].requests[0].state, 'STALE');
  ownerConfirmed = true; valuationStale = true; observed = await state.observe(); assert.equal(observed.rows[0].state, 'LIVE'); assert.equal(observed.rows[0].position.valuationStatus, 'STALE'); assert.equal(observed.rows[0].position.estimate, null);
  valuationStale = false;
  // Failure authenticating the source keeps its prior original IDs, with no
  // cached amounts. No execute/reconcile port is called to manufacture credit.
  unavailable = true; observed = await state.observe(); assert.equal(observed.rows[0].state, 'UNKNOWN'); assert.equal(observed.rows[0].requests[0].state, 'UNKNOWN');
  unavailable = false; observed = await state.observe();
  const app = await startWalletApplication({accountSession: session, defiExit: {runtime, service: positionService}, economicState: state, actionAccessMode: 'exact-only'}); t.after(() => app.close());
  const count = observedCalls; assert.equal((await http(app, '0'.repeat(64))).status, 403); assert.equal(observedCalls, count);
  assert.equal((await http(app, app.ownerAccess.token, 'http://127.0.0.1:1')).status, 403); assert.equal(observedCalls, count);
  const result = await http(app); assert.equal(result.status, 200); const payload = validateWalletState(result.body), projected = projectWalletState(payload);
  assert.equal(projected.assets.length, 3); assert.equal(new Set(projected.assets.map(a => a.rowKey)).size, 3);
  assert.equal(projected.positions[0].estimate, '19'); assert.equal(projected.economicState.capabilities.underlyingCredit, false);
  await app.close();
  // A real Vault conflict after the observation is prepared is retained as
  // uncertainty. The checkpoint reconciliation refuses an unrelated revision.
  const beforeUpdate = Vault.prototype.update; let interfere = true;
  Vault.prototype.update = async function(password, expected, transform) {
    if (this.path === input.journal.path && interfere) {interfere = false; await beforeUpdate.call(this, password, expected, d => ({...d, rows: d.rows.map(r => ({...r}))}));}
    return beforeUpdate.call(this, password, expected, transform);
  };
  t.after(() => {Vault.prototype.update = beforeUpdate;}); amount = '11';
  await assert.rejects(state.observe(), e => e.code === 'VAULT_CONFLICT');
  observed = await state.snapshot(); assert.equal(observed.status, 'UNKNOWN'); assert.equal(observed.rows[0].balances, null);
  await assert.rejects(state.reconcile(), /ORIGINAL_CHECKPOINT_REQUIRED/);
  Vault.prototype.update = beforeUpdate;
  // Close fences an admitted read synchronously and waits for that same work.
  const second = await createOriginalWalletEconomicStateV1({...input, journal: {...input.journal, path: join(directory, 'second.vault')}});
  let release, entered; const started = new Promise(r => {entered = r;}); gate = new Promise(r => {release = r;});
  const originalOwnerView = catalogue.ownerView; catalogue.ownerView = async () => {entered(); return originalOwnerView();};
  const reading = second.observe(); await started; const closing = second.close(); assert.throws(() => second.observe(), /CLOSED/);
  release(); await assert.rejects(reading, /CLOSED/); await closing;
});
