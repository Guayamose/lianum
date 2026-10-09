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
import {exactRecord} from '../../../src/execution/encoding/commitments.mjs';
import {createFlatAccountSession} from '../../../src/api/accounts/flat-account-session.mjs';
import {projectPrivatePositionStateV2} from '../../../src/defi/positions/private-position-state-v2.mjs';
import {validateOriginalWalletEconomicStateV1, projectOriginalWalletEconomicStateV1, originalEconomicRouteKeyV1}
  from '../../../../../apps/wallet/src/client/features/portfolio/original-economic-state-v1.mjs';
import {validateWalletState, projectWalletState} from '../../../../../apps/wallet/src/client/state/view-model.mjs';
const mapped = new URL(import.meta.url).pathname.includes('/wallet-platform/modules/');
const moduleURL = (raw, flat) => new URL(mapped ? flat : raw, import.meta.url);
const catalogues = new WeakMap(), natives = new WeakMap(), pairs = new WeakMap(), positions = new WeakMap(), wrapped = new WeakMap();
let economicSessionHelpers;
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
  assertNativeWalletEconomicSessionV1(...args) {return economicSessionHelpers.assertNativeWalletEconomicSessionV1(...args);},
  assertWrappedWalletEconomicSessionV1(...args) {return economicSessionHelpers.assertWrappedWalletEconomicSessionV1(...args);},
  readOriginalSessionWalletEconomicSnapshotV1(...args) {return economicSessionHelpers.readOriginalSessionWalletEconomicSnapshotV1(...args);},
  flatManualGraphReviews() {return [];}, flatManualGraphActionTarget() {return null;}, flatManualGraphHandoffBindings() {return [];},
  flatManualNativeNoteReviews() {return [];}, flatManualNativeNoteActionTarget() {return null;}, flatManualWrappedGraphActionTarget() {return null;},
}});
mock.module(moduleURL('../../../src/accounts/portfolio/wrapped-wallet-portfolio-v1.mjs', '../../global-state/wrapped-wallet-portfolio-v1.mjs'), {namedExports: {
  assertOwnedWrappedWalletPortfolioV1(runtime, value) {if(wrapped.get(value)?.runtime!==runtime)no();},
}});
mock.module(moduleURL('../../../src/defi/withdrawals/generation-private-vault-exit.mjs', '../../defi-adapters/generation-private-vault-exit.mjs'), {namedExports: {
  generationPrivateVaultExitBinding(runtime, service) {const p = positions.get(service); return p?.runtime === runtime ? {runtime, catalogue: p.catalogue} : null;},
  assertGenerationPrivateVaultExitSession(runtime, service, session) {const p = positions.get(service); if (!p || p.runtime !== runtime || p.session !== session) no();},
  generationPrivateVaultExitActionTarget() {return null;},
}});
const {createOriginalWalletEconomicStateV1, openOriginalWalletEconomicStateV1, reopenOriginalWalletEconomicStateAfterCrashV1, assertOriginalWalletEconomicStateV1,assertOriginalWalletEconomicStateJournalV1,originalWalletEconomicStateBindingsV1} = await import('../../../src/accounts/state/original-wallet-economic-state-v1.mjs');
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


// This case runs the original session membership/installation/capture bodies.
// Only account/portfolio/proof memberships and generic keeper capture are
// explicit inert HOST ports; no native chain or economic execution is used.
test('HOST original native and wrapped sessions retain pending economic state and recover durable anchor candidates', async t => {
  const directory=await mkdtemp(join(tmpdir(),'original-session-economic-host-'));await chmod(directory,0o700);t.after(()=>rm(directory,{recursive:true,force:true}));
  const text=await readFile(moduleURL('../../../src/api/accounts/flat-manual-graph-session.mjs','../../api/flat-manual-graph-session.mjs'),'utf8');
  const start=text.indexOf('export function assertNativeWalletEconomicSessionV1('),end=text.indexOf('/** Distinct original registry',start);assert.ok(start>0&&end>start);
  const originalBodies=text.slice(start,end).replaceAll('export ','').replace(/const module=await import\('[^']+'\);/g,'const module=modulePort;');
  const sessions=new WeakMap(),details=new WeakMap(),authority=Object.freeze({}),section=Object.freeze({}),sourceSHA256=h('original-state-source'),identity={sourceSHA256};let keeperCaptures=0,effects=0;
  const need=(value,code)=>{if(!value)throw Object.assign(Error(code),{code});};
  const nativeAssert=(value,expected)=>{const p=natives.get(value);need(p?.runtime===expected.runtime&&p.system===expected.system,'HOST_NATIVE_ORIGINAL_REQUIRED');};
  const wrappedAssert=(runtime,value)=>need(wrapped.get(value)?.runtime===runtime,'HOST_WRAPPED_ORIGINAL_REQUIRED');
  const detail=(_session,approval)=>{const value=details.get(approval);need(value,'HOST_ORIGINAL_APPROVAL_REQUIRED');return value;};
  const modulePort={createOriginalWalletEconomicStateV1,openOriginalWalletEconomicStateV1,reopenOriginalWalletEconomicStateAfterCrashV1,assertOriginalWalletEconomicStateV1,assertOriginalWalletEconomicStateJournalV1,originalWalletEconomicStateBindingsV1};
  const APIs=Function('sessions','need','exactRecord','sha','assertOwnedNativeValueAccountAuthority','assertOwnedWrappedWalletPortfolioV1','original','originalNote','modulePort',originalBodies+
    ';return {assertNativeWalletEconomicSessionV1,assertWrappedWalletEconomicSessionV1,readOriginalSessionWalletEconomicSnapshotV1,createOriginalSessionWalletEconomicStateV1,reopenOriginalSessionWalletEconomicStateAfterCrashV1,readOriginalSessionWalletEconomicStateV1,sessionEconomicState,fenceSessionEconomicState,capturedSessionEconomicState};')
    (sessions,need,exactRecord,sha,nativeAssert,wrappedAssert,detail,detail,modulePort);economicSessionHelpers=APIs;
  const captureBody=(begin,finish)=>{const a=text.indexOf(begin),b=text.indexOf(finish,a);assert.ok(a>=0&&b>a);return text.slice(a,b).replaceAll('export ','')
    .replace(/const \{\s*captureDurableGenericAccountKeeperV1\s*\}\s*=\s*await import\('[^']+'\);/g,'const {captureDurableGenericAccountKeeperV1}=keeperPort;');};
  const keeperPort={async captureDurableGenericAccountKeeperV1(keeper){keeperCaptures++;await keeper.close();return {checkpoint:h('keeper-checkpoint'),journal:keeper.originalJournal};}};
  const nativeCaptureCode=captureBody('export function fenceOriginalNativeSessionEconomicRecoveryV1(', 'export async function stopCapturedNativeSessionEconomicRecoveryV1(');
  const nativeCapture=Function('sessions','need','sha','genericAccountIdentity','assertNativeEconomicRecoveryCaptureV1','nativeValueOriginalRecoverySourceV1','nativeEconomicRecoverySectionIdentityV1','assertOwnedNativeValueAccountAuthority','originalNote','fenceSessionEconomicState','capturedSessionEconomicState','keeperPort',nativeCaptureCode+
    ';return {fenceOriginalNativeSessionEconomicRecoveryV1,captureOriginalNativeSessionEconomicRecoveryV1};')
    (sessions,need,sha,genericAccountIdentity,value=>{need(value===authority,'HOST_ISSUER_ORIGINAL_REQUIRED');return identity;},()=>sourceSHA256,(value,kind)=>{need(value===section&&kind==='session','HOST_SECTION_ORIGINAL_REQUIRED');return identity;},nativeAssert,detail,APIs.fenceSessionEconomicState,APIs.capturedSessionEconomicState,keeperPort);
  const wrappedFenceCode=captureBody('export function fenceWrappedWalletGraphSessionV1(', '/** Same original durable generic keeper');
  const wrappedCaptureCode=captureBody('export async function captureWrappedWalletGraphSessionV1(', 'export async function reopenWrappedWalletGraphSessionV1(');
  const wrappedCapture=Function('sessions','need','original','fenceSessionEconomicState','capturedSessionEconomicState','keeperPort',wrappedFenceCode+wrappedCaptureCode+
    ';return {fenceWrappedWalletGraphSessionV1,captureWrappedWalletGraphSessionV1};')(sessions,need,detail,APIs.fenceSessionEconomicState,APIs.capturedSessionEconomicState,keeperPort);
  async function family(kind,recovered=null,crashName=null,password='original-observation-private-password'){
    const runtime={},system={},a=asset(h(kind+'-a'),'first'),b=asset(h(kind+'-b'),'second');let phase='PREPARED',viewChanged=false;
    const requestId=kind+'_original_request',body={requestId,kind:kind==='native'?'TOP_UP':'GRAPH',ownerOperationRef:h(kind+'-ref'),assetId:a.assetId};
    const journal={path:join(directory,(crashName?.replace(/-restored$/,'')??kind)+'.session.vault'),password};
    const observed=()=>{const one=view(a,10,'10');if(phase==='CONFIRMED')one.requests=[{requestId,kind:body.kind,state:'CONFIRMED',disposition:kind==='native'?'APPLIED':'FULFILLED'}];return one;};
    let account,portfolio;
    if(kind==='native'){account={config:{accountId:'native_state_account',journalId:'native_state_journal',lifetime:h('native-state-lifetime'),registry:[a]},registry:[a],
      async privateStatus(){return {operations:phase==='CONFIRMED'?[{request:body,outcome:'APPLIED'}]:[]};},async ownerView(){const out=observed();if(viewChanged)phase='UNKNOWN';return out;}};natives.set(account,{runtime,system});}
    else{portfolio={config:{accountId:'wrapped_state_account',journalId:'wrapped_state_journal',lifetime:h('wrapped-state-lifetime'),registry:[a,b]},registry:[a,b],
      async ownerView(){const one=observed(),two={...view(b,10,'3'),observed:one.observed};if(viewChanged)phase='UNKNOWN';return{version:1,profile:'OWNED_WRAPPED_WALLET_PORTFOLIO_V1',status:'LIVE',coherent:true,observed:one.observed,assets:[one,two],
        capabilities:{coordinatorRestart:true,keeperRestart:false,crossAssetAtomicConversion:false,privateDeFiComposability:false,fullWalletAcceptance:false}};}};wrapped.set(portfolio,{runtime});}
    const keeper={originalJournal:journal,async snapshot(){return{version:1,revision:phase==='PREPARED'?1:2,storageAvailable:true,requests:[{requestId,kind:body.kind,assetId:a.assetId,state:phase,errorCode:null}]};},
      async close(){},async prepare(){effects++;no();},async execute(){effects++;no();},async recover(){effects++;no();},async reconcile(){effects++;no();},async restartCoordinator(){no();}};
    const session=await createFlatAccountSession({keeper,ownerHandoff:account??portfolio});t.after(()=>session.close());
    const approval=Object.freeze({}),state={runtime,system,poolIndex:0,nativeAccount:account,wrappedPortfolio:portfolio,journal,durableKeeper:keeper,graphs:new Map(),notes:new Map(),nativeCaptured:false,nativeFence:null,nativeIdentity:null,nativeStopped:false,captured:false};
    details.set(approval,{body,review:{profile:'EXPLICIT_INERT_ORIGINAL_APPROVAL_PORT'}});(kind==='native'?state.notes:state.graphs).set(requestId,approval);sessions.set(session,state);
    if(recovered){phase='CONFIRMED';await APIs.sessionEconomicState(session,recovered);}
    const economicState=recovered?APIs.readOriginalSessionWalletEconomicStateV1(session):crashName?.endsWith('-restored')
      ?await APIs.reopenOriginalSessionWalletEconomicStateAfterCrashV1(session):await APIs.createOriginalSessionWalletEconomicStateV1(session);
    return{state,session,economicState,runtime,system,account,portfolio,journal,body,setPhase(value){phase=value;},changeDuringView(value){viewChanged=value;}};
  }
  for(const kind of ['native','wrapped']){
    const original=await family(kind),{economicState,session,body}=original;
    await assert.rejects(APIs.createOriginalSessionWalletEconomicStateV1({...session}));
    await assert.rejects(APIs.createOriginalSessionWalletEconomicStateV1(session));
    assert.equal(originalWalletEconomicStateBindingsV1(economicState)[0].session,session);
    let output=await economicState.observe();assert.equal(output.rows[0].state,'UNKNOWN');assert.equal(output.rows[0].requests[0].state,'PREPARED');assert.equal(output.rows[0].balances,null);
    original.setPhase('UNKNOWN');output=await economicState.observe();assert.equal(output.rows[0].requests[0].state,'UNKNOWN');assert.equal(output.rows[0].balances,null);
    original.setPhase('CONFIRMED');output=await economicState.observe();assert.equal(output.rows[0].state,'LIVE');assert.equal(output.rows[0].requests[0].disposition,kind==='native'?'APPLIED':'FULFILLED');
    const app=await startWalletApplication({accountSession:session,economicState,actionAccessMode:'exact-only',port:0});t.after(()=>app.close());
    assert.equal((await http(app,'0'.repeat(64))).status,403);const response=await http(app);assert.equal(response.status,200);assert.equal(validateWalletState(response.body).economicState.rows[0].requests[0].requestId,body.requestId);await app.close();
    original.changeDuringView(true);output=await economicState.observe();assert.equal(output.rows[0].state,'UNKNOWN');assert.equal(output.rows[0].balances,null);original.changeDuringView(false);original.setPhase('CONFIRMED');await economicState.observe();
    let record;
    if(kind==='native'){nativeCapture.fenceOriginalNativeSessionEconomicRecoveryV1(session,authority);record=await nativeCapture.captureOriginalNativeSessionEconomicRecoveryV1(session,section);assert.equal(record.schema,'ORIGINAL_NATIVE_SESSION_WALLET_STATE_RECOVERY_V1');}
    else{wrappedCapture.fenceWrappedWalletGraphSessionV1(session);record=await wrappedCapture.captureWrappedWalletGraphSessionV1(session);assert.equal(record.schema,'WRAPPED_ORIGINAL_GRAPH_SESSION_ECONOMIC_RECOVERY_V1');}
    assert.throws(()=>economicState.observe(),/CLOSED/);assert.equal(record.economicState.journal.path,original.journal.path+'.economic-state.vault');
    const privateCapture=new Vault(join(directory,kind+'.capture.vault')),key='inert-private-section-password';await privateCapture.create({session:record},key);
    const authenticated=(await new Vault(privateCapture.path).read(key)).data.session;const restored=await family(kind,authenticated.economicState);t.after(()=>restored.economicState.close());
    output=await restored.economicState.snapshot();assert.equal(output.rows[0].state,'STALE');assert.equal(output.rows[0].balances,null);output=await restored.economicState.observe();assert.equal(output.rows[0].state,'LIVE');
    assert.equal(restored.economicState.checkpoint().lifetime,authenticated.economicState.checkpoint.lifetime);await restored.economicState.close();
    const stateVault=new Vault(authenticated.economicState.journal.path);await stateVault.update(authenticated.economicState.journal.password,authenticated.economicState.checkpoint.revision,data=>({...data,checkpoints:data.checkpoints.map(c=>({...c,stateSHA256:h('unrelated')}))}));
    await assert.rejects(family(kind,authenticated.economicState),/ORIGINAL_CHECKPOINT_REQUIRED/);
  }
  // Explicit HOST crash boundaries: close/dispose the failed observer WITHOUT
  // capture; lower source/keeper restoration is synthetic, while this real
  // session and its original journal membership are used unchanged. No abrupt
  // runtime, owner-key or native-transaction recovery is claimed by this case.
  for(const [kind,committed] of [['native',true],['wrapped',false]]) {
    const name='anchor-'+kind,original=await family(kind,null,name),state=original.economicState;
    original.setPhase('UNKNOWN');const baseline=await state.observe(),birth=state.checkpoint();
    await assert.rejects(APIs.reopenOriginalSessionWalletEconomicStateAfterCrashV1({...original.session}));
    // A second same-source observer cannot bypass the live writer lease.
    await assert.rejects(reopenOriginalWalletEconomicStateAfterCrashV1({catalogues:[],nativeAccounts:kind==='native'?[{runtime:original.runtime,system:original.system,account:original.account,session:original.session}]:[],
      wrappedPortfolios:kind==='wrapped'?[{runtime:original.runtime,portfolio:original.portfolio,session:original.session}]:[],journal:{path:original.journal.path+'.economic-state.vault'}}),/ANCHOR_WRITER_STILL_LIVE/);
    const update=Vault.prototype.update,firstError=Error('EXPLICIT_HOST_LOST_STATE_WRITE_REPLY');let inject=true;
    Vault.prototype.update=async function(password,revision,transform){
      if(this.path===original.journal.path+'.economic-state.vault'&&inject){inject=false;if(committed)await update.call(this,password,revision,transform);throw firstError;}
      return update.call(this,password,revision,transform);
    };
    original.setPhase('CONFIRMED');try{await assert.rejects(state.observe(),error=>error===firstError);}finally{Vault.prototype.update=update;}
    assert.equal((await state.snapshot()).rows[0].balances,null);await state.close();
    const anchorPath=original.journal.path+'.economic-state.vault.original-state-anchor-v1',secret=await readFile(join(anchorPath,'local-observation-root.secret'));
    let retained;try{retained=(await new Vault(join(anchorPath,'anchor.vault')).read(secret.toString('hex'))).data;}finally{secret.fill(0);}
    assert.equal(retained.confirmed.revision,birth.revision);assert.equal(retained.candidate.revision,birth.revision+1);
    assert.equal(retained.lifetime,birth.lifetime);
    await assert.rejects(family(kind,null,name+'-restored','wrong-original-source-journal-password'),/ORIGINAL_JOURNAL_REQUIRED/);
    const restored=await family(kind,null,name+'-restored');t.after(()=>restored.economicState.close());
    let output=await restored.economicState.snapshot();assert.equal(output.lifetime,birth.lifetime);assert.equal(output.revision,birth.revision+(committed?1:0));
    assert.equal(output.rows[0].balances,null);assert.ok(['STALE','UNKNOWN'].includes(output.rows[0].state));
    assert.equal(restored.economicState.checkpoint().lifetime,birth.lifetime);
    restored.setPhase('UNKNOWN');output=await restored.economicState.observe();assert.equal(output.rows[0].state,'UNKNOWN');assert.equal(output.rows[0].balances,null);
    await restored.economicState.close();
    // Authenticated but unpinned third revision is never adopted as latest.
    const rogue=new Vault(original.journal.path+'.economic-state.vault');const actual=await rogue.read('original-observation-private-password');
    await rogue.update('original-observation-private-password',actual.revision,data=>({...data,checkpoints:data.checkpoints.map(row=>({...row,stateSHA256:h('unrelated-anchor-revision')}))}));
    await assert.rejects(family(kind,null,name+'-restored'),/ANCHOR_CHECKPOINT_REQUIRED/);
    assert.equal(baseline.rows[0].requests[0].state,'UNKNOWN');
  }
  assert.equal(keeperCaptures,2);assert.equal(effects,0);
});


// The append method below is the original catalogue body. Catalogue/generation
// membership and native admission readers remain explicit inert HOST ports;
// both its catalogue writes and the observation union use real Vault/AES/CAS.
test('HOST original catalogue append preserves old routes and reopens the same economic journal', async t => {
  const directory=await mkdtemp(join(tmpdir(),'original-economic-append-host-'));await chmod(directory,0o700);
  let state,session; t.after(async()=>{try{await state?.close();await session?.close();}finally{await rm(directory,{recursive:true,force:true});}});
  const runtime={},a=asset(h('append-a'),'first'),b={...a,assetId:h('append-b'),pool:'2'.repeat(40),scope:h('append-b-scope')};
  const common={economicIdentitySHA256:h('append-economic'),registryProfile:'LIANUM_FLAT_APPEND_ONLY_POOLS_V2',
    genesis:a.genesis,chainId:a.chainId,hub:'6'.repeat(40),hubDomain:h('append-hub'),ledgerNamespace:h('append-ledger'),
    registryCommitment:h('append-registry'),verifierSetCommitment:h('append-verifiers'),sourceProvenanceSHA256:h('append-provenance'),
    keyLineageSHA256:h('append-lineage'),sourceManifestSHA256:h('append-source'),keyManifestSHA256:h('append-keys')};
  const makeGeneration=(asset,predecessor)=>{const config={accountId:'host_append_'+asset.assetId.slice(0,16),journalId:'host_append_journal_'+asset.assetId.slice(0,16),lifetime:h('append-lifetime-'+asset.assetId),registry:[asset]};
    const routes=[{...common,assetId:asset.assetId,pool:asset.pool,domainCommitment:h('append-domain-'+asset.assetId),predecessorPool:predecessor}];
    return {id:h('append-generation-'+asset.assetId),identity:genericAccountIdentity(config),config,routes,admissionAssets:[asset.assetId],
      retained:true,attached:false,journalPath:join(directory,asset.assetId+'.vault'),poolAdmissions:{async verifyFreshGeneration(){return routes.map(route=>({route}));}}};};
  const first=makeGeneration(a,'0'.repeat(40)),next=makeGeneration(b,a.pool),capability=Object.freeze({}),generationBrands=new WeakMap([[capability,next]]);
  first.attached=true;const byId=new Map([[first.id,first]]),byAsset=new Map([[a.assetId,first.id]]),catalogueClaims=new WeakSet();
  const descriptor=g=>({generationId:g.id,identity:g.identity,registry:g.config.registry,routes:g.routes,admissionAssets:g.admissionAssets});
  const catalogueVault=new Vault(join(directory,'catalogue.vault')),cataloguePassword='original-append-catalogue-password';
  let catalogueRecord=await catalogueVault.create({generations:[descriptor(first)],current:{[common.economicIdentitySHA256]:a.assetId},bindings:[],events:[]},cataloguePassword);
  const catalogueText=await readFile(moduleURL('../../../src/accounts/storage/flat-journal-catalogue.mjs','../../global-state/flat-journal-catalogue.mjs'),'utf8');
  const begin=catalogueText.indexOf('    async appendGeneration(capability) {'),end=catalogueText.indexOf('    async reviewOwnerPreparation(',begin);
  assert.ok(begin>0&&end>begin);const appendBody=catalogueText.slice(begin,end);
  const requirement=(ok,code)=>assert.ok(ok,'HOST_ORIGINAL_APPEND_'+code);
  const appender=Function('p',`const {runtime,byId,byAsset,path,assert,descriptor,catalogueClaims,write,originalGeneration,requireTrue}=p;
    const durable=null;let pendingGeneration=null;const newAdmissionsHealthy=async()=>{};const exclusive=work=>work();
    return Object.freeze({${appendBody}});`)({runtime,byId,byAsset,path:catalogueVault.path,assert,descriptor,catalogueClaims,requireTrue:requirement,
      originalGeneration(cap,expected){requirement(expected===runtime&&generationBrands.has(cap),'ORIGINAL_GENERATION_REQUIRED');return generationBrands.get(cap);},
      async write(transform){const before=catalogueRecord;assert.deepEqual(await catalogueVault.read(cataloguePassword),before);
        const result=await catalogueVault.update(cataloguePassword,before.revision,transform);assert.deepEqual(await catalogueVault.read(cataloguePassword),result);catalogueRecord=result;}});
  let altered=null;
  const keeper={async snapshot(){return {version:1,revision:catalogueRecord.revision,storageAvailable:true,requests:[]};},async close(){},async prepare(){no();},async execute(){no();},async reconcile(){no();},async recover(){no();},async restartCoordinator(){no();}};
  const catalogue={keeper,appendGeneration:appender.appendGeneration,
    status(){let generations=structuredClone(catalogueRecord.data.generations);if(altered==='replacement')generations[0].identity.lifetime=h('replacement');
      else if(altered==='removal')generations=generations.slice(1);else if(altered==='reordering')generations.reverse();return {generations,bindings:[],storageFault:false,uncertainWrite:false};},
    async ownerView(){const generations=[...byId.values()].map(g=>{const observed=view(g.config.registry[0],g===first?10:20,g===first?'10':'3');return {generationId:g.id,routes:g.routes.map(({assetId,pool,domainCommitment})=>({assetId,pool,domainCommitment})),
        portfolio:{version:1,profile:'OWNED_FLAT_PRIVATE_PORTFOLIO_V1',status:'LIVE',coherent:true,observed:observed.observed,assets:[observed],
          capabilities:{coordinatorRestart:true,keeperRestart:false,crossAssetAtomicConversion:false,privateDeFiComposability:false,fullWalletAcceptance:false}},errorCode:null};});
      const observed=generations.map(g=>g.portfolio.observed),coherent=observed.every(row=>['blockNumber','blockHash','timestamp'].every(key=>row[key]===observed[0][key]));
      return {version:2,profile:'FLAT_IMMUTABLE_JOURNAL_CATALOGUE_V2',status:coherent?'LIVE':'STALE',coherent,observed:coherent?observed[0]:null,generations,
        capabilities:{coordinatorRestart:true,keeperRestart:false,nodeRestart:false,privateBalancesAggregated:false,implicitNoteMigration:false,fullWalletAcceptance:false}};}};
  catalogues.set(catalogue,{runtime});session=await createFlatAccountSession({keeper,ownerHandoff:catalogue});pairs.set(session,{runtime,catalogue});
  const input={catalogues:[{runtime,catalogue,session,positions:null}],nativeAccounts:[],wrappedPortfolios:[],journal:{path:join(directory,'economic.vault'),password:'original-append-observation-password'}};
  state=await createOriginalWalletEconomicStateV1(input);let observation=await state.observe();const oldRoute=observation.rows[0].route,oldKey=originalEconomicRouteKeyV1(oldRoute),birth=state.checkpoint();
  await catalogue.appendGeneration(capability);assert.equal(catalogueRecord.revision,1);
  observation=await state.observe();assert.equal(observation.status,'LIVE');assert.equal(observation.rows.length,2);
  assert.equal(originalEconomicRouteKeyV1(observation.rows[0].route),oldKey);assert.deepEqual(observation.rows[0].route,oldRoute);
  assert.equal(observation.rows[0].balances.available,'10');assert.equal(observation.rows[1].balances.available,'3');
  assert.equal(observation.rows[1].route.sourceId,oldRoute.sourceId);assert.notEqual(observation.rows[1].route.domainCommitment,oldRoute.domainCommitment);
  const retainedRoute=observation.rows[1].route;const retained=state.checkpoint();assert.notEqual(retained.sourceSetSHA256,birth.sourceSetSHA256);await state.close();
  await assert.rejects(openOriginalWalletEconomicStateV1({...input,checkpoint:birth}),/CHECKPOINT/);
  state=await openOriginalWalletEconomicStateV1({...input,checkpoint:retained});observation=await state.snapshot();assert.equal(observation.status,'STALE');
  observation=await state.observe();assert.equal(observation.status,'LIVE');assert.deepEqual(observation.rows[0].route,oldRoute);
  assert.equal(observation.rows[1].route.generationId,next.id);assert.equal(state.checkpoint().lifetime,birth.lifetime);
  await assert.rejects(catalogue.appendGeneration({...capability}),/ORIGINAL_GENERATION_REQUIRED/);
  for(const mutation of ['replacement','removal','reordering']) {altered=mutation;observation=await state.observe();
    assert.equal(observation.status,'UNKNOWN');assert.ok(observation.rows.every(r=>r.balances===null));
    assert.deepEqual(observation.rows.map(r=>r.route),[oldRoute,retainedRoute]);
    altered=null;observation=await state.observe();assert.equal(observation.status,'LIVE');assert.deepEqual(observation.rows[0].route,oldRoute);}
  const finalCheckpoint=state.checkpoint();await state.close();
  altered='replacement';await assert.rejects(openOriginalWalletEconomicStateV1({...input,checkpoint:finalCheckpoint}),/ORIGINAL_ROUTES_CHANGED|ORIGINAL_SOURCE_SET_REQUIRED/);
  altered=null;state=await openOriginalWalletEconomicStateV1({...input,checkpoint:finalCheckpoint});assert.equal((await state.observe()).status,'LIVE');
});
