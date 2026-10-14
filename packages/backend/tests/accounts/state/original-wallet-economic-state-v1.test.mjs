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
import {Vault} from '@lianum/engine/crypto/vault';
import {genericAccountIdentity} from '@lianum/engine/accounts/journal';
let createFlatAccountSession;
import {ORIGINAL_SPL_USDC_UNITS_V1} from '../../../../mobile-protocol/src/wallet/contracts/owner-portfolio-contract.mjs';
import {validateOriginalWalletEconomicStateV1, projectOriginalWalletEconomicStateV1, originalEconomicRouteKeyV1}
  from '../../../../mobile-protocol/src/original-wallet-economic-state-v1.mjs';
import {validateWalletState, projectWalletState} from '../../../../mobile-protocol/src/wallet/client/view-model.mjs';
const mapped = new URL(import.meta.url).pathname.includes('/wallet-platform/modules/');
const moduleURL = (raw, flat) => new URL(mapped ? flat : raw, import.meta.url);
const catalogues = new WeakMap(), natives = new WeakMap(), pairs = new WeakMap(), positions = new WeakMap(), wrapped = new WeakMap();
const no = () => {throw Error('SYNTHETIC_LOWER_PORT_REJECTED');};
mock.module(new URL('../../../src/operations/recovery/native-original-source-lifecycle-v1.mjs',import.meta.url),{exports:{assertNativeWalletEconomicSessionV1:no,flatManualNativeNoteReviews(){return[];},flatManualNativeNoteActionTarget(){return null;}}});
// Unused sibling services cannot supply authority to these observation tests.
mock.module(new URL('../../../src/claims/controller/controller.mjs',import.meta.url),{exports:{
 assertOriginalDeviceRootClaimIntakeV2:no,readOriginalDeviceRootClaimIntakeContextV2:no,readOriginalDeviceRootClaimEconomicSnapshotV2:no,
}});
for(const [specifier,names] of [
 ['@lianum/backend/withdrawals/session',['assertOwnedWrappedWithdrawalSessionV1']],
 ['@lianum/backend/claims/session',['assertWalletClaimSession','walletClaimSessionIdentity']],
 ['@lianum/backend/defi/withdrawal',['assertOwnedPrivateVaultExit']],
 ['@lianum/backend/portfolio/erc20',['createHttpErc20Portfolio']],
 ['@lianum/backend/portfolio/http',['createHttpPortfolioRegistry']],
 ['@lianum/backend/portfolio/requests',['normalizePortfolioRequest']],
 ['@lianum/backend/transfers/tron',['assertTronNativeTransferObserver']],
 ['@lianum/backend/transfers/evm',['assertEvmNativeTransferObserver']],
])mock.module(specifier,{exports:Object.fromEntries(names.map(name=>[name,no]))});
// Only the lower claim/runtime/keeper memberships are synthetic ports. The
// view issuer/body, real account session, Vault AES/CAS and owner HTTP are real.
const claimOriginals=new WeakMap(), claimKeeperOriginals=new WeakMap(), claimObservers=new WeakMap(), claimQuorums=new WeakMap(), claimPortfolios=new WeakMap();
mock.module(moduleURL('../../../src/accounts/authority/flat-portfolio-authority.mjs','../../global-state/flat-portfolio-authority.mjs'),{exports:{
 assertOwnedFlatPortfolio(runtime,portfolio){const fixture=claimPortfolios.get(portfolio)??cataloguePortfolios.get(portfolio);assert.equal(fixture?.runtime,runtime);},
 describeFlatPortfolioJournalAuthority(runtime,portfolio){const fixture=cataloguePortfolios.get(portfolio);assert.equal(fixture?.runtime,runtime);return fixture.owner;},
}});
mock.module(moduleURL('../../../src/operations/deployments/claims/deploy-native-claims.mjs','../../native-claims/deploy-native-claims.mjs'),{exports:{
 assertOwnedNativeClaimSystem(runtime,claims){assert.equal(claimOriginals.get(claims)?.runtime,runtime);},
}});
mock.module(moduleURL('../../../src/claims/operations/owned-state.mjs','../../native-claims/owned-state.mjs'),{exports:{
 assertOwnedClaimObserver(observer){assert.ok(claimObservers.has(observer));},
 ownedClaimObserverBindings(observer){assert.ok(claimObservers.has(observer));return claimObservers.get(observer);},
}});
mock.module(moduleURL('../../../src/claims/operations/operators.mjs','../../native-claims/operators.mjs'),{exports:{
 assertOwnedClaimOperatorQuorum(quorum,observer){assert.equal(claimQuorums.get(quorum),observer);},
}});
mock.module(moduleURL('../../../src/claims/operations/native-claim-asset-units-v1.mjs','../../native-claims/native-claim-asset-units-v1.mjs'),{namedExports:{
 originalNativeClaimAssetUnitsV1(runtime,claims,config){const original=claimOriginals.get(claims);assert.ok(original&&original.runtime===runtime&&claims.configs.includes(config));return original.units.get(config);},
}});
mock.module(moduleURL('../../../../engine/src/execution/accounts/generic-account-keeper.mjs','../../../../../../omnichain-product/src/paeg/generic-account-keeper.mjs'),{namedExports:{
 assertOriginalGenericAccountKeeperV1(keeper,expected){const original=claimKeeperOriginals.get(keeper);assert.ok(original&&original.authority===expected.authority);assert.deepEqual(original.config,expected.config);},
}});
// Complete generation/catalogue factories. Only their lower portfolio,
// admission and child-keeper ports are inert observation fixtures.
const cataloguePortfolios=new WeakMap(),catalogueKeepers=new WeakMap(),catalogueAdmissions=new WeakMap();
mock.module(new URL('../../../src/accounts/authority/flat-pool-admission-policy.mjs',import.meta.url),{exports:{
 assertOwnedFlatPoolAdmissionPolicy(policy,owner){assert.equal(catalogueAdmissions.get(policy),owner);},
}});
mock.module(new URL('../../../src/accounts/portfolio/flat-manual-portfolio-keeper.mjs',import.meta.url),{exports:{
 async createFlatManualPortfolioKeeper({runtime,portfolio,journal}){const fixture=cataloguePortfolios.get(portfolio);assert.equal(fixture?.runtime,runtime);assert.deepEqual(fixture.journal,journal);return fixture.keeper;},
 assertOwnedFlatManualPortfolioKeeper(keeper,{runtime,portfolio}){const fixture=catalogueKeepers.get(keeper);assert.equal(fixture?.runtime,runtime);assert.equal(fixture?.portfolio,portfolio);},
 createRetainedFlatManualPortfolioKeeperV1:no,captureRetainedFlatManualPortfolioKeeperV1:no,
}});
mock.module(new URL('../../../src/accounts/authority/flat-account-authority.mjs',import.meta.url),{exports:{retainedFlatAccountInventoryV1:no,assertRetainedExternalVaultNoteAccountV1:no}});
mock.module(new URL('../../../src/accounts/recovery/external-defi-catalogue-recovery-v1.mjs',import.meta.url),{exports:{consumeExternalDefiCatalogueGenerationReopenV1:no}});
mock.module(new URL('../../../src/claims/wrapped/recovery/wrapped-recovery-authority-v1.mjs',import.meta.url),{exports:{
 retainWrappedPrivateLifetimePartV1:no,readWrappedPrivateLifetimePartV1:no,updateWrappedPrivateLifetimePartV1:no,assertWrappedPrivateLifetimePartSealedV1:no,
}});
const catalogueAPI=await import('../../../src/accounts/storage/flat-journal-catalogue.mjs');
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
  assertWrappedWalletEconomicSessionV1() {no();},
  readOriginalSessionWalletEconomicSnapshotV1() {no();},
  flatManualGraphReviews() {return [];}, flatManualGraphActionTarget() {return null;}, flatManualGraphHandoffBindings() {return [];},
  flatManualWrappedGraphActionTarget() {return null;},
}});
mock.module(moduleURL('../../../src/accounts/portfolio/wrapped-wallet-portfolio-v1.mjs', '../../global-state/wrapped-wallet-portfolio-v1.mjs'), {namedExports: {
  assertOwnedWrappedWalletPortfolioV1(runtime, value) {if(wrapped.get(value)?.runtime!==runtime)no();},
}});
mock.module(moduleURL('../../../src/defi/withdrawals/generation-private-vault-exit.mjs', '../../defi-adapters/generation-private-vault-exit.mjs'), {namedExports: {
  generationPrivateVaultExitBinding(runtime, service) {const p = positions.get(service); return p?.runtime === runtime ? {runtime, catalogue: p.catalogue} : null;},
  assertGenerationPrivateVaultExitSession(runtime, service, session) {const p = positions.get(service); if (!p || p.runtime !== runtime || p.session !== session) no();},
  generationPrivateVaultExitActionTarget() {return null;},
}});
// Register all lower HOST ports before loading the DeFi ownership graph,
// which can otherwise cache the real claim issuer in the session module.
const {projectPrivatePositionStateV2}=await import('../../../src/defi/positions/private-position-state-v2.mjs');
({createFlatAccountSession}=await import('../../../src/api/accounts/flat-account-session.mjs'));
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
  let state;
  const directory = await mkdtemp(join(tmpdir(), 'original-economic-host-')); await chmod(directory, 0o700);
  t.after(async()=>{try{await state?.close();}finally{await rm(directory,{recursive:true,force:true});}});
  const runtime = {}, system = {}, a = asset(h('same-asset'), 'first'), b = asset(a.assetId, 'second'), underlying = {...asset(h('underlying'), 'first', '4'.repeat(40)), pool:'5'.repeat(40), assetIdentity:h('underlying-asset')}, generationId = h('generation');
  const config = {accountId: 'host_catalogue_account', journalId: 'host_catalogue_journal', lifetime: h('catalogue-lifetime'), registry: [a, underlying]};
  let phase = null, amount = '10', unavailable = false, ownerConfirmed = true, valuationStale = false, gate = null, observedCalls = 0, nativeObservedAt = null;
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
    async privateStatus() {return {operations: []};}, async ownerView() {const value=view(b, 50, '7'); if(nativeObservedAt!==null)value.observed.observedAt=nativeObservedAt; return value;}};
  natives.set(nativeAccount, {runtime, system});
  const input = {catalogues: [{runtime, catalogue, session, positions: positionService}], nativeAccounts: [{runtime, system, account: nativeAccount}], wrappedPortfolios: [], journal: {path: join(directory, 'union.vault'), password: 'synthetic-observation-password'}};
  await assert.rejects(createOriginalWalletEconomicStateV1({...input, nativeAccounts: [{runtime, system, account: {...nativeAccount}}]}));
  state = await createOriginalWalletEconomicStateV1(input);
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
  // The original native source can be older than a freshly observed catalogue.
  // Expiry must affect that domain alone, in BOTH producer and real consumer.
  nativeObservedAt=Date.now()-31000;
  observed=await state.observe();assert.equal(observed.status,'PARTIAL');
  assert.equal(observed.rows[2].state,'STALE');assert.equal(observed.rows[2].balances,null);
  assert.equal(observed.rows[0].state,'LIVE');assert.equal(observed.rows[0].balances.available,'10');assert.equal(observed.rows[0].position.estimate,'19');
  const independentlyFresh=projectOriginalWalletEconomicStateV1(observed);
  assert.equal(independentlyFresh.rows[0].state,'LIVE');assert.equal(independentlyFresh.rows[2].state,'STALE');
  const later=projectOriginalWalletEconomicStateV1(observed,{now:observed.rows[0].observedAt+30001});
  assert.equal(later.rows[0].state,'STALE');assert.equal(later.rows[0].balances,null);
  const legacy=structuredClone(observed);for(const row of legacy.rows)delete row.observedAt;
  assert.equal(projectOriginalWalletEconomicStateV1(legacy).rows[0].state,'STALE'); // old contract stays conservative
  nativeObservedAt=null;observed=await state.observe();assert.equal(observed.status,'LIVE');
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


// Original factories retain their own generation/catalogue identities. The
// observation facade below injects invalid catalogue DTOs only for the economic
// reader's negative cases; it never becomes an original catalogue capability.
test('HOST original catalogue append preserves old routes and reopens the same economic journal', async t => {
  const directory=await mkdtemp(join(tmpdir(),'original-economic-append-host-'));await chmod(directory,0o700);
  let state,session; t.after(async()=>{try{await state?.close();await session?.close();}finally{await rm(directory,{recursive:true,force:true});}});
  const a=asset(h('append-a'),'first'),b={...a,assetId:h('append-b'),pool:'2'.repeat(40),scope:h('append-b-scope')},runtime={metadata:{evmGenesis:a.genesis}};
  const common={economicIdentitySHA256:h('append-economic'),registryProfile:'LIANUM_FLAT_APPEND_ONLY_POOLS_V2',
    genesis:a.genesis,chainId:a.chainId,hub:'6'.repeat(40),hubDomain:h('append-hub'),ledgerNamespace:h('append-ledger'),
    registryCommitment:h('append-registry'),verifierSetCommitment:h('append-verifiers'),sourceProvenanceSHA256:h('append-provenance'),
    keyLineageSHA256:h('append-lineage'),sourceManifestSHA256:h('append-source'),keyManifestSHA256:h('append-keys')};
  async function makeGeneration(asset,predecessor,block,amount){
    const config={accountId:'host_append_'+asset.assetId.slice(0,16),journalId:'host_append_journal_'+asset.assetId.slice(0,16),lifetime:h('append-lifetime-'+asset.assetId),registry:[asset]};
    const routes=[{...common,assetId:asset.assetId,pool:asset.pool,domainCommitment:h('append-domain-'+asset.assetId),predecessorPool:predecessor}];
    const keeper={async snapshot(){return{version:1,revision:0,storageAvailable:true,requests:[]};},async close(){return{closed:true};},prepare:no,execute:no,reconcile:no,recover:no,restartCoordinator:no};
    const portfolio={config,async ownerView(){const observed=view(asset,block,amount);return{version:1,profile:'OWNED_FLAT_PRIVATE_PORTFOLIO_V1',status:'LIVE',coherent:true,observed:observed.observed,assets:[observed],
      capabilities:{coordinatorRestart:true,keeperRestart:false,crossAssetAtomicConversion:false,privateDeFiComposability:false,fullWalletAcceptance:false}};}};
    const owner={accounts:[]},poolAdmissions={async verifyFreshGeneration(){return routes.map(route=>({route}));},status(){return{current:[asset.assetId]};}};
    const journal={path:join(directory,asset.assetId+'.vault'),password:'original-child-journal-password'};
    cataloguePortfolios.set(portfolio,{runtime,owner,keeper,journal});catalogueKeepers.set(keeper,{runtime,portfolio});catalogueAdmissions.set(poolAdmissions,owner);
    return catalogueAPI.createFlatJournalGeneration({runtime,portfolio,poolAdmissions,journal});
  }
  const first=await makeGeneration(a,'0'.repeat(40),10,'10'),next=await makeGeneration(b,a.pool,20,'3');
  const catalogueVault=new Vault(join(directory,'catalogue.vault')),cataloguePassword='original-append-catalogue-password';
  const originalCatalogue=await catalogueAPI.createFlatJournalCatalogue({runtime,initialGeneration:first,journal:{path:catalogueVault.path,password:cataloguePassword}});
  catalogueAPI.assertOwnedFlatJournalCatalogue(originalCatalogue,{runtime});
  assert.throws(()=>catalogueAPI.assertOwnedFlatJournalCatalogue({...originalCatalogue},{runtime}),/ORIGINAL_CATALOGUE_REQUIRED/);
  let altered=null;
  const keeper=originalCatalogue.keeper;
  const catalogue={keeper,appendGeneration:originalCatalogue.appendGeneration,
    status(){const status=structuredClone(originalCatalogue.status());if(altered==='replacement')status.generations[0].identity.lifetime=h('replacement');
      else if(altered==='removal')status.generations=status.generations.slice(1);else if(altered==='reordering')status.generations.reverse();return status;},
    ownerView:originalCatalogue.ownerView};
  assert.throws(()=>catalogueAPI.assertOwnedFlatJournalCatalogue(catalogue,{runtime}),/ORIGINAL_CATALOGUE_REQUIRED/);
  catalogues.set(catalogue,{runtime});session=await createFlatAccountSession({keeper,ownerHandoff:catalogue});pairs.set(session,{runtime,catalogue});
  const input={catalogues:[{runtime,catalogue,session,positions:null}],nativeAccounts:[],wrappedPortfolios:[],journal:{path:join(directory,'economic.vault'),password:'original-append-observation-password'}};
  state=await createOriginalWalletEconomicStateV1(input);let observation=await state.observe();const oldRoute=observation.rows[0].route,oldKey=originalEconomicRouteKeyV1(oldRoute),birth=state.checkpoint();
  await catalogue.appendGeneration(next);assert.equal((await catalogueVault.read(cataloguePassword)).revision,1);
  const codec=await import('../../../../mobile-protocol/src/wallet/contracts/owner-portfolio-contract.mjs'),payload=await catalogue.ownerView();
  codec.validateFlatOwnerReadPayload(payload);
  assert.equal(payload.freshAdmissions.budget.remaining,64);assert.equal(payload.freshAdmissions.budget.generations,2);
  for(const changed of [{remaining:65},{nonrefundable:false},{remainingGenerations:7}]){
    const tampered=structuredClone(payload);Object.assign(tampered.freshAdmissions.budget,changed);
    assert.throws(()=>codec.validateFlatOwnerReadPayload(tampered),/RESPONSE_INVALID/);
  }
  observation=await state.observe();assert.equal(observation.status,'LIVE');assert.equal(observation.rows.length,2);
  assert.equal(originalEconomicRouteKeyV1(observation.rows[0].route),oldKey);assert.deepEqual(observation.rows[0].route,oldRoute);
  assert.equal(observation.rows[0].balances.available,'10');assert.equal(observation.rows[1].balances.available,'3');
  assert.equal(observation.rows[1].route.sourceId,oldRoute.sourceId);assert.notEqual(observation.rows[1].route.domainCommitment,oldRoute.domainCommitment);
  const retainedRoute=observation.rows[1].route;const retained=state.checkpoint();assert.notEqual(retained.sourceSetSHA256,birth.sourceSetSHA256);await state.close();
  await assert.rejects(openOriginalWalletEconomicStateV1({...input,checkpoint:birth}),/CHECKPOINT/);
  state=await openOriginalWalletEconomicStateV1({...input,checkpoint:retained});observation=await state.snapshot();assert.equal(observation.status,'STALE');
  observation=await state.observe();assert.equal(observation.status,'LIVE');assert.deepEqual(observation.rows[0].route,oldRoute);
  assert.equal(observation.rows[1].route.generationId,next.generationId);assert.equal(state.checkpoint().lifetime,birth.lifetime);
  await assert.rejects(catalogue.appendGeneration({...next}),/ORIGINAL_GENERATION_REQUIRED/);
  for(const mutation of ['replacement','removal','reordering']) {altered=mutation;observation=await state.observe();
    assert.equal(observation.status,'UNKNOWN');assert.ok(observation.rows.every(r=>r.balances===null));
    assert.deepEqual(observation.rows.map(r=>r.route),[oldRoute,retainedRoute]);
    altered=null;observation=await state.observe();assert.equal(observation.status,'LIVE');assert.deepEqual(observation.rows[0].route,oldRoute);}
  const finalCheckpoint=state.checkpoint();await state.close();
  altered='replacement';await assert.rejects(openOriginalWalletEconomicStateV1({...input,checkpoint:finalCheckpoint}),/ORIGINAL_ROUTES_CHANGED|ORIGINAL_SOURCE_SET_REQUIRED/);
  altered=null;state=await openOriginalWalletEconomicStateV1({...input,checkpoint:finalCheckpoint});assert.equal((await state.observe()).status,'LIVE');
});


test('original native claim portfolio joins common state with BTC/SPL units, same session and fail-closed custody',async t=>{
 const directory=await mkdtemp(join(tmpdir(),'original-native-claim-union-'));await chmod(directory,0o700);
 let state,transport,session,app,healthReads=0,phase='CONFIRMED',splReady=true;
 t.after(async()=>{try{await app?.close();await transport?.close();await state?.close();await session?.close();}finally{await rm(directory,{recursive:true,force:true});}});
 const runtime={},btc={...asset(h('claim-btc'),'first'),symbol:'CBTC',decimals:8},spl={...asset(h('claim-usdc'),'second'),symbol:'CUSDC',decimals:6},authority=Object.freeze({});
 const {CLAIM_CONFIG_SCHEMA,claimDomainCommitment}=await import(moduleURL('../../../../engine/src/claims/framing.mjs','../../native-claims/framing.mjs'));
 const configs=[btc,spl].map((a,i)=>{const config=Object.fromEntries(CLAIM_CONFIG_SCHEMA.map(([name,type])=>[name,type.startsWith('u')?'1':type==='address'?h(name+i).slice(0,40):type==='field32'?'0'.repeat(63)+'1':h(name+i)]));
  return{...config,evmChainId:a.chainId,evmGenesis:a.genesis,wrapper:a.token,pool:a.pool,scope:a.scope,policy:a.policy,nativeFamily:String(i+1),ledgerNamespace:config.hubDomain};});
 const domains=configs.map(claimDomainCommitment);
 const claims={configs},quorum={async health({claimDomain}){healthReads++;if(!splReady&&claimDomain===domains[1])throw Error('HOST_CUSTODY_UNKNOWN');return{head:{hash:h('block-10'),number:'10',timestamp:'1000'}};}},
  config={accountId:'host_private_claims',journalId:'host_private_claim_journal',lifetime:h('claim-lifetime'),registry:[btc,spl]};
 const units=new Map([[configs[0],{claimSymbol:'cBTC',nativeSymbol:'BTC',decimals:8,atomicUnit:'satoshi'}],
  [configs[1],{claimSymbol:'cUSDC',nativeSymbol:'USDC',decimals:6,atomicUnit:'micro-USDC',nativeAssetKind:'SOLANA_SPL_USDC',mint:ORIGINAL_SPL_USDC_UNITS_V1.mint}]]);
 const portfolio={config,registry:[btc,spl],authority,async ownerView(){const assets=[{...view(btc,10,'80000'),asset:{assetId:btc.assetId,symbol:'CBTC',decimals:8}},
  {...view(spl,10,'1000000'),asset:{assetId:spl.assetId,symbol:'CUSDC',decimals:6}}];
  assets[0].requests=[{requestId:'claim_original_topup',kind:'TOP_UP',state:phase==='CONFIRMED'?'CONFIRMED':'UNRESOLVED',disposition:phase==='CONFIRMED'?'APPLIED':null}];
  return{version:1,profile:'OWNED_FLAT_PRIVATE_PORTFOLIO_V1',status:'LIVE',coherent:true,observed:assets[0].observed,assets,
   capabilities:{coordinatorRestart:true,keeperRestart:false,crossAssetAtomicConversion:false,privateDeFiComposability:false,fullWalletAcceptance:false}};}};
 claimOriginals.set(claims,{runtime,portfolio,units});
 // Import the complete issuer after fixing only its lower ownership ports;
 // its originalViews map and guard remain private to the production module.
 const actualObserver={async read(){return{head:{hash:h('block-10')}};},async assertCurrent(){}};
 claimObservers.set(actualObserver,{system:claims});claimQuorums.set(quorum,actualObserver);claimPortfolios.set(portfolio,{runtime});
 const {createNativeClaimPortfolioView,readOriginalNativeClaimPortfolioViewV1}=await import('../../../src/claims/operations/portfolio-view.mjs');
 const ownerView=createNativeClaimPortfolioView({runtime,claims,observer:actualObserver,quorum,portfolio});
 assert.equal(readOriginalNativeClaimPortfolioViewV1(ownerView,runtime).portfolio,portfolio);
 assert.throws(()=>readOriginalNativeClaimPortfolioViewV1(ownerView,{}),/CLAIM_PORTFOLIO_ORIGINAL_VIEW_REQUIRED/);
 assert.throws(()=>readOriginalNativeClaimPortfolioViewV1((...args)=>ownerView(...args),runtime),/CLAIM_PORTFOLIO_ORIGINAL_VIEW_REQUIRED/);
 const keeper={async snapshot(){return{version:1,revision:phase==='CONFIRMED'?2:1,storageAvailable:true,requests:[{requestId:'claim_original_topup',assetId:btc.assetId,kind:'TOP_UP',state:phase,errorCode:null}]};},
  async close(){},async prepare(){no();},async execute(){no();},async reconcile(){no();},async recover(){no();},async restartCoordinator(){no();}};
 claimKeeperOriginals.set(keeper,{config,authority});session=await createFlatAccountSession({keeper,ownerHandoff:{ownerView}});
 const input={catalogues:[],nativeAccounts:[],wrappedPortfolios:[],claimPortfolios:[{runtime,view:ownerView,session}],journal:{path:join(directory,'claims.vault'),password:'original-observation-claim-password'}};
 const readsBefore=healthReads;await assert.rejects(createOriginalWalletEconomicStateV1({...input,claimPortfolios:[{runtime,view:async()=>ownerView(),session}]}));assert.equal(healthReads,readsBefore);
 const foreignSession=await createFlatAccountSession({keeper:{...keeper},ownerHandoff:{ownerView}});await assert.rejects(createOriginalWalletEconomicStateV1({...input,claimPortfolios:[{runtime,view:ownerView,session:foreignSession}]}));await foreignSession.close();
 state=await createOriginalWalletEconomicStateV1(input);let value=await state.observe();assert.equal(value.status,'LIVE');assert.deepEqual(value.rows.map(r=>[r.asset.symbol,r.asset.decimals,r.component]),[['CBTC',8,'NATIVE_CLAIM'],['CUSDC',6,'NATIVE_CLAIM']]);
 assert.deepEqual(value.rows.map(r=>r.route.domainCommitment),domains);assert.equal(value.capabilities.underlyingCredit,false);
 const {startFlatAccountHttp}=await import('../../../src/api/accounts/flat-account-http.mjs');transport=await startFlatAccountHttp({session,port:0,economicState:state});
 const requestState=token=>fetch(transport.origin+'/api/flat-account/economic-state',{headers:{Origin:transport.origin,'x-flat-owner-token':token}});
 const beforeDenied=healthReads;assert.equal((await requestState('0'.repeat(64))).status,403);assert.equal(healthReads,beforeDenied);
 const response=await requestState(transport.ownerAccess.token);assert.equal(response.status,200);assert.equal(validateOriginalWalletEconomicStateV1(await response.json()).rows.length,2);
 phase='PREPARED';value=await state.observe();assert.equal(value.rows[0].state,'UNKNOWN');assert.equal(value.rows[0].balances,null);assert.equal(value.rows[1].state,'LIVE');
 app=await startWalletApplication({accountSession:session,economicState:state,actionAccessMode:'exact-only'});
 const rendered=projectWalletState(validateWalletState((await http(app)).body));assert.equal(rendered.nativeClaims[0].amount,null);assert.equal(rendered.nativeClaims[0].custody,'UNAVAILABLE');assert.equal(rendered.nativeClaims[1].amount,'1000000');await app.close();app=null;
 phase='CONFIRMED';splReady=false;value=await state.observe();assert.equal(value.rows[0].state,'LIVE');assert.equal(value.rows[1].state,'UNKNOWN');assert.equal(value.rows[1].balances,null);
 splReady=true;await state.observe();const checkpoint=state.checkpoint();await state.close();
 state=await openOriginalWalletEconomicStateV1({...input,checkpoint});
 assert.equal((await state.snapshot()).rows[0].state,'STALE');
 const reopenedObservation=await state.observe();
 assert.equal(reopenedObservation.status,'LIVE',JSON.stringify(reopenedObservation));
 assert.equal(reopenedObservation.rows[1].balances.available,'1000000');
});
