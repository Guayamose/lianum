import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { GENERATION_PORTFOLIO_PROFILE, validateFlatOwnerReadPayload, ownerPortfolioAssetRows } from '../../../../../packages/mobile-protocol/src/wallet/contracts/owner-portfolio-contract.mjs';
import { ACTIONS, validateWalletState, projectWalletState, accountAssetChoices, accountActionContext } from '../../../../../packages/mobile-protocol/src/wallet/client/view-model.mjs';
import { startWalletApplication } from '../../../src/server/server.mjs';
import { createFlatAccountSession } from '../../../../../packages/backend/src/api/accounts/flat-account-session.mjs';
import { createWalletApplicationClient } from '../../../../../packages/backend/src/api/wallet/wallet-application-client.mjs';
const hex = n => BigInt(n).toString(16).padStart(64, '0'), address = n => BigInt(n).toString(16).padStart(40, '0');
const copy = value => structuredClone(value);
const observed = { observedAt: 100, blockNumber: '4', blockHash: hex(77), timestamp: '1200' };
function originalAsset(n, amount = String(n)) {
 return { version: 1, status: 'LIVE', asset: { assetId: hex(n), symbol: 'PALT', decimals: 6 }, observed: copy(observed),
  balances: { available: amount, reserved: '0', recovery: '0', locked: '0' },
  backing: { held: amount, liabilities: amount, surplus: '0', deficit: '0' }, requests: [] };
}
function portfolio(asset) { return { version: 1, profile: 'OWNED_FLAT_PRIVATE_PORTFOLIO_V1', status: asset.status,
 coherent: asset.observed !== null, observed: copy(asset.observed), assets: [asset], capabilities: { coordinatorRestart: true,
 keeperRestart: false, crossAssetAtomicConversion: false, privateDeFiComposability: false, fullWalletAcceptance: false } }; }
function generation(n) { return { generationId: hex(100+n), routes: [{ assetId: hex(n), pool: address(n), domainCommitment: hex(200+n) }],
 portfolio: portfolio(originalAsset(n, n === 1 ? '9007199254740993' : '2000000')), errorCode: null }; }
function catalogue() { return { version: 2, profile: GENERATION_PORTFOLIO_PROFILE, status: 'LIVE', coherent: true, observed: copy(observed),
 generations: [generation(1), generation(2)], freshAdmissions: { version: 1, fenced: false, routes: [{generationId:hex(102),assetId:hex(2)}] }, capabilities: { coordinatorRestart: true, keeperRestart: false, nodeRestart: false,
 privateBalancesAggregated: false, implicitNoteMigration: false, fullWalletAcceptance: false } }; }
function wallet(p) { return { version: 1, profile: 'ACTIVE_FLAT_WALLET_APP_V1', connection: 'CONNECTED', portfolio: p, account: null,
 nativeClaims: null, networks: null, defi: null, transfers: null,
 capabilities: { graphExecution: false, ...Object.fromEntries(Object.values(ACTIONS).map(value => [value.capability, false])) },
 errors: { account: null, portfolio: null, nativeClaims: null, networks: null, defi: null, transfers: null } }; }
function unavailable(p, n = 1) {
 p.generations[n].portfolio = null; p.generations[n].errorCode = 'FLAT_CATALOGUE_GENERATION_VIEW_UNAVAILABLE';
 p.status = 'PARTIAL'; p.coherent = false; p.observed = null; return p;
}
test('catalogue reader preserves exact original generation/pool units and no aggregate/private migration', () => {
 const p = catalogue(), accepted = validateFlatOwnerReadPayload(p);
 assert.equal(accepted.payloadKind, 'IMMUTABLE_JOURNAL_GENERATIONS'); assert.deepEqual(accepted.data, p);
 const data = validateWalletState(wallet(p)), view = projectWalletState(data);
 assert.equal(view.assets.length, 2); assert.equal(view.generations.length, 2); assert.equal(view.coherent, true);
 assert.equal(view.assets[0].balances.available, '9007199254740993'); assert.equal(view.assets[1].balances.available, '2000000');
 assert.equal(view.assets[0].generationId, hex(101)); assert.equal(view.assets[1].pool, address(2));
 assert.equal(view.assets[0].domainCommitment, hex(201)); assert.equal(Object.hasOwn(view, 'total'), false);
 assert.deepEqual(accountAssetChoices({ data }).map(asset => asset.assetId), [hex(2)]);
});
test('unavailable generation retains exact route placeholders and null amounts; fresh mutation choices are fenced', () => {
 const p = unavailable(catalogue()), data = validateWalletState(wallet(p)), view = projectWalletState(data);
 assert.equal(view.portfolioStatus, 'PARTIAL'); assert.equal(view.coherent, false); assert.equal(view.assets.length, 2);
 assert.equal(view.assets[1].id, hex(2)); assert.equal(view.assets[1].generationId, hex(102));
 assert.equal(view.assets[1].status, 'UNAVAILABLE'); assert.equal(view.assets[1].observed, null);
 assert.deepEqual(view.assets[1].balances, { available: null, reserved: null, recovery: null, locked: null });
 assert.deepEqual(accountAssetChoices({ data }), []); assert.equal(view.assets[0].balances.available, '9007199254740993');
});
test('cross-generation head mismatch is STALE, not a current combined observation', () => {
 const p = catalogue(); p.generations[1].portfolio.assets[0].observed.blockHash = hex(99);
 p.generations[1].portfolio.observed.blockHash = hex(99); p.coherent = false; p.observed = null; p.status = 'STALE';
 validateFlatOwnerReadPayload(p); const data = validateWalletState(wallet(p));
 assert.equal(projectWalletState(data).coherent, false); assert.deepEqual(accountAssetChoices({ data }), []);
});
test('all unavailable generations expose no zero balance or invented observation', () => {
 const p = unavailable(unavailable(catalogue(),0),1);p.status='UNAVAILABLE';validateFlatOwnerReadPayload(p);
 assert.ok(ownerPortfolioAssetRows(p).every(row => row.balances === null && row.observed === null));
});
test('catalogue codec rejects ambiguous identities, hidden extras, false status/capability, invalid observations and routing substitution', () => {
 const changes = [p => p.generations.push(copy(p.generations[0])), p => p.generations[1].routes[0].assetId=hex(1),
  p => p.generations[1].portfolio.assets[0].asset.assetId=hex(3), p => p.generations[0].routes[0].secret='forbidden',
  p => p.capabilities.privateBalancesAggregated=true,p=>p.capabilities.implicitNoteMigration=true,
  p=>p.observed.observedAt++,p=>p.status='PARTIAL',p=>p.version=1,p=>p.generations[0].errorCode='FLAT_CATALOGUE_GENERATION_VIEW_UNAVAILABLE',
  p=>p.generations[0].portfolio=null,p=>p.generations[0].routes[0].pool=address(1).toUpperCase()+'\n',
  p=>p.generations[0].portfolio.assets[0].balances.available='01',p=>p.generations[0].portfolio.assets[0].backing.deficit='1',
  p=>p.generations[0].portfolio.assets[0].observed.timestamp='-1',p=>p.generations[0].portfolio.capabilities.fullWalletAcceptance=true];
 for(const change of changes){const p=catalogue();change(p);assert.throws(()=>validateFlatOwnerReadPayload(p),/RESPONSE_INVALID/);assert.throws(()=>validateWalletState(wallet(p)));}
});
test('catalogue bounds, sparse routes and globally ambiguous request IDs are rejected', () => {
 for(const change of [p=>{p.generations=Array.from({length:9},(_,i)=>generation(i+1));},p=>{delete p.generations[0].routes[0];},
  p=>{const row={requestId:'same_original_id',kind:'EXIT',state:'CONFIRMED',disposition:'APPLIED'};for(const g of p.generations)g.portfolio.assets[0].requests=[copy(row)];}]){
  const p=catalogue();change(p);assert.throws(()=>validateFlatOwnerReadPayload(p),/RESPONSE_INVALID/);
 }
});
test('original reconciliation remains available without a new generation balance; original execute requires unique current asset', () => {
 const data=wallet(unavailable(catalogue()));data.account={snapshot:{requests:[{requestId:'original_exit_1',kind:'EXIT',state:'UNKNOWN'}]}};
 const state={data};const context=accountActionContext(state,'accountReconcile',{requestId:'original_exit_1'});
 assert.equal(context.kind,'EXIT');assert.equal(context.asset,null);
 data.account.snapshot.requests[0].state='PREPARED';assert.throws(()=>accountActionContext(state,'accountExecute',{requestId:'original_exit_1'}));
});
test('original child request lookup and review keep exact source pool identity', () => {
 const p=catalogue();p.generations[0].portfolio.assets[0].requests=[{requestId:'original_exit_2',kind:'EXIT',state:'UNRESOLVED',disposition:null}];
 const data=wallet(p);data.account={snapshot:{requests:[{requestId:'original_exit_2',kind:'EXIT',state:'PREPARED'}]}};
 const context=accountActionContext({data},'accountExecute',{requestId:'original_exit_2'});assert.equal(context.asset.assetId,hex(1));
});
test('legacy single-account and portfolio payloads retain the exact original codec', () => {
 for(const data of [originalAsset(1),portfolio(originalAsset(1))])assert.deepEqual(validateFlatOwnerReadPayload(data).data,data);
});
test('actual loopback wallet HTTP and genuine session carry generation payload and serve the shared browser codec', async t => {
 const p=catalogue();let mutations=0;
 const keeper={prepare:async()=>{mutations++;},execute:async()=>{mutations++;},reconcile:async()=>{mutations++;},recover:async()=>{mutations++;},
 snapshot:async()=>({version:1,revision:1,storageAvailable:true,requests:[]}),restartCoordinator:async()=>{},close:async()=>{}};
 const session=await createFlatAccountSession({keeper,ownerHandoff:{ownerView:async()=>copy(p)}});
 const app=await startWalletApplication({accountSession:session,actionAccessMode:'exact-only'});
 t.after(async()=>{await app.close();await session.close();});
 const access=app.ownerAccess; const response=await fetch(access.origin+'/api/wallet/state',{headers:{'x-wallet-owner-token':access.token,Origin:access.origin}});
 assert.equal(response.status,200);const body=await response.json();assert.deepEqual(validateWalletState(body).portfolio,p);
 const sdk=createWalletApplicationClient({origin:access.origin,ownerToken:access.token});
 assert.equal(await sdk.refresh(),true);assert.deepEqual(sdk.getState().data.portfolio.freshAdmissions,p.freshAdmissions);
 assert.deepEqual(accountAssetChoices(sdk.getState()).map(asset=>asset.assetId),[hex(2)]);
 assert.equal(sdk.can('accountPrepare'),false); // owner token supplies read access only
 p.freshAdmissions.fenced=true;assert.equal(await sdk.refresh(),true);assert.deepEqual(accountAssetChoices(sdk.getState()),[]);
 assert.equal(accountAssetChoices(sdk.getState(),'EXIT').length,2);

 const codec=await fetch(access.origin+'/owner-portfolio-contract.mjs');assert.equal(codec.status,200);
 assert.match(codec.headers.get('content-type'),/javascript/);assert.match(await codec.text(),/FLAT_IMMUTABLE_JOURNAL_CATALOGUE_V2/);
 assert.equal(mutations,0);
});
test('browser rendering keeps separate generation/pool/domain labels using text nodes, with no migration or aggregation control', async()=>{
 const s=await readFile(new URL('./public/app.mjs',import.meta.url),'utf8');assert.match(s,/Generación \$\{generation\?\.ordinal/);
 assert.match(s,/Dominio original/);assert.match(s,/No se suma ni migra/);assert.doesNotMatch(s,/innerHTML\s*=/);
});


test('new TOP_UP choices use only explicit current routes while same-asset original EXIT remains distinct', () => {
 const p=catalogue(), state={data:wallet(p)};
 assert.deepEqual(accountAssetChoices(state).map(asset=>asset.assetId),[hex(2)]);
 assert.deepEqual(accountAssetChoices(state,'EXIT').map(asset=>asset.assetId),[hex(1),hex(2)]);
 state.data.account={snapshot:{requests:[]}};
 const request={requestId:'new_topup_route',kind:'TOP_UP',assetId:hex(1),ownerOperationRef:hex(999)};
 assert.throws(()=>accountActionContext(state,'accountPrepare',request));
 assert.equal(accountActionContext(state,'accountPrepare',{...request,assetId:hex(2)}).asset.assetId,hex(2));
 assert.equal(p.generations[0].portfolio.assets[0].balances.available,'9007199254740993');
});
test('legacy missing admission metadata remains readable with new TOP_UP and GRAPH fenced', () => {
 const p=catalogue(); delete p.freshAdmissions; validateFlatOwnerReadPayload(p);
 const state={data:wallet(p)};
 assert.deepEqual(accountAssetChoices(state),[]);assert.deepEqual(accountAssetChoices(state,'GRAPH'),[]);
 assert.equal(accountAssetChoices(state,'EXIT').length,2);
});
test('fenced admission metadata cannot authorize new or original TOP_UP while old EXIT stays usable', () => {
 const p=catalogue();p.freshAdmissions.fenced=true;validateFlatOwnerReadPayload(p);
 const state={data:wallet(p)};assert.deepEqual(accountAssetChoices(state),[]);assert.deepEqual(accountAssetChoices(state,'GRAPH'),[]);
 assert.equal(accountAssetChoices(state,'EXIT').length,2);
 p.generations[0].portfolio.assets[0].requests=[{requestId:'old_prepared_topup',kind:'TOP_UP',state:'UNRESOLVED',disposition:null}];
 state.data.account={snapshot:{requests:[{requestId:'old_prepared_topup',kind:'TOP_UP',state:'PREPARED'}]}};
 assert.throws(()=>accountActionContext(state,'accountExecute',{requestId:'old_prepared_topup'}));
});
test('prepared original TOP_UP can finish and continue only its old request route after pointer advance', () => {
 const p=catalogue();p.generations[0].portfolio.assets[0].requests=[{requestId:'old_prepared_topup',kind:'TOP_UP',state:'UNRESOLVED',disposition:null}];
 const state={data:wallet(p)};state.data.account={snapshot:{requests:[{requestId:'old_prepared_topup',kind:'TOP_UP',state:'PREPARED'}]}};
 assert.equal(accountActionContext(state,'accountExecute',{requestId:'old_prepared_topup'}).asset.assetId,hex(1));
 state.data.account.snapshot.requests[0].state='PREPARING';
 const body={requestId:'old_prepared_topup',kind:'TOP_UP',assetId:hex(1),ownerOperationRef:hex(999)};
 assert.equal(accountActionContext(state,'accountPrepare',body).asset.assetId,hex(1));
 assert.throws(()=>accountActionContext(state,'accountPrepare',{...body,assetId:hex(2)}));
 assert.throws(()=>accountActionContext(state,'accountPrepare',{...body,requestId:'replacement_topup'}));
 p.generations[1].portfolio.assets[0].requests=structuredClone(p.generations[0].portfolio.assets[0].requests);
 assert.throws(()=>accountActionContext(state,'accountPrepare',body));
});
test('admission metadata rejects forged, duplicate, sparse, oversized and extra route identities', () => {
 const changes=[p=>p.freshAdmissions.routes=[{generationId:hex(102),assetId:hex(99)}],
 p=>p.freshAdmissions.routes=[{generationId:hex(101),assetId:hex(2)}],
 p=>p.freshAdmissions.routes=[{generationId:hex(999),assetId:hex(2)}],
 p=>p.freshAdmissions.routes.push(structuredClone(p.freshAdmissions.routes[0])),
 p=>p.freshAdmissions.routes=[],p=>p.freshAdmissions.routes=Array(9).fill(p.freshAdmissions.routes[0]),
 p=>delete p.freshAdmissions.routes[0],p=>p.freshAdmissions.fenced='false',
 p=>p.freshAdmissions.routes[0].assetId+='\n',p=>p.freshAdmissions.authority=true,p=>p.freshAdmissions.routes.secret=true,
 p=>p.freshAdmissions.version=2,p=>p.freshAdmissions.routes[0].index=1];
 for(const change of changes){const p=catalogue();change(p);assert.throws(()=>validateFlatOwnerReadPayload(p),/RESPONSE_INVALID/);}
});

test('generation array order never changes fresh routing or original EXIT identity',()=>{
 const p=catalogue(),state={data:wallet(p)};
 const before=accountAssetChoices(state);p.generations.reverse();validateFlatOwnerReadPayload(p);
 assert.deepEqual(accountAssetChoices(state),before);
 state.data.account={snapshot:{requests:[]}};
 const exit=accountActionContext(state,'accountPrepare',{requestId:'ordered_old_exit',kind:'EXIT',assetId:hex(1),ownerOperationRef:hex(900)});
 assert.equal(exit.originalGeneration.generationId,hex(101));assert.equal(exit.originalGeneration.pool,address(1));
 for(const change of [s=>s.stale=true,s=>s.portfolioStale=true,s=>s.data.portfolio.status='STALE']){
  const state={data:wallet(catalogue())};change(state);assert.deepEqual(accountAssetChoices(state),[]);
 }
});
