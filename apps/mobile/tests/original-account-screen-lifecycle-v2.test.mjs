/** Executes the exact screen refresh/invalidation/lifecycle method bodies,
 * selected by TypeScript AST. React rendering, hardware, storage and HTTP are
 * controlled boundaries; this is a late-response regression, not device proof. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Script } from 'node:vm';
import ts from 'typescript';
const source = readFileSync(new URL('../src/screens/OriginalAccountScreen.tsx', import.meta.url), 'utf8');
const ast = ts.createSourceFile('OriginalAccountScreen.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const screen = ast.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === 'OriginalAccountScreen');
assert.ok(screen?.body);
function body(name) {
  const node = screen.body.statements.find(item => ts.isFunctionDeclaration(item) && item.name?.text === name);
  assert.ok(node?.body, name); return source.slice(node.body.getStart(ast), node.body.end);
}
let listener;
function find(node) {
  if (ts.isCallExpression(node) && node.expression.getText(ast) === 'AppState.addEventListener') listener = node.arguments[1];
  ts.forEachChild(node, find);
}
find(screen); assert.ok(listener && ts.isArrowFunction(listener));
const listenerBody = source.slice(listener.body.getStart(ast), listener.body.end);
const deferred = () => { let resolve; return { promise: new Promise(done => { resolve = done; }), resolve }; };
function fixture() {
  const key = deferred(), state = deferred(), stateEntered = deferred(), events = [], values = { available: false, key: null, notice: '', privateState: null };
  const globals = { origin: 'https://original.example', pairingId: '1'.repeat(64), expoFetch: 'EXPLICIT_NATIVE_FETCH_BOUNDARY',
    mounted: { current: true }, observationEpoch: { current: 0 }, AppState: { currentState: 'active' },
    context: { current: { devicePublicKey: null } }, accessLease: { current: null }, reviewLease: { current: null },
    consent: { invalidate() { events.push('consent-invalidated'); } },
    setAccess() {}, setReview() {}, setDiagnostic() {},
    setPrivateState(value) { values.privateState = value; },
    setAvailable(value) { values.available = value; events.push('availability-' + value); },
    setDevicePublicKey(value) { values.key = value; events.push('key-displayed'); },
    setNotice(value) { values.notice = value; },
    readDevicePublicKey: () => key.promise,
    createOriginalAccountApiV2(options) {
      assert.equal(options.descriptor.origin, globals.origin); assert.equal(options.descriptor.pairingId, globals.pairingId);
      assert.equal(options.fetchImpl, globals.expoFetch); events.push('api-created');
      return { async state() { events.push('state-requested'); stateEntered.resolve(); return state.promise; } };
    },
  };
  globals.invalidate = new Script('(function invalidate() ' + body('invalidate') + ')').runInNewContext(globals);
  const refresh = new Script('(async function refresh() ' + body('refresh') + ')').runInNewContext(globals);
  const onChange = new Script('(function(value) ' + listenerBody + ')').runInNewContext(globals);
  const lifecycle = value => { globals.AppState.currentState = value; onChange(value); };
  return { refresh, key, state, events, values, globals, lifecycle,
    waitForState: pending => Promise.race([stateEntered.promise,
      Promise.resolve(pending).then(() => { throw new Error('REFRESH_FINISHED_BEFORE_HTTP'); })]),
  };
}
test('a current foreground check displays only the retained device identity and diagnostic availability', async () => {
  const f = fixture(), pending = f.refresh(); f.key.resolve('04' + '11'.repeat(64));
  await f.waitForState(pending); f.state.resolve({ privatePortfolio: null }); await pending;
  assert.equal(f.values.available, true); assert.equal(f.values.key, '04' + '11'.repeat(64));
  assert.equal(f.globals.context.current.devicePublicKey, f.values.key);
  assert.equal(f.events.filter(value => value === 'state-requested').length, 1);
});
test('background then foreground during the identity read cannot revive an obsolete availability check', async () => {
  const f = fixture(), pending = f.refresh(); f.lifecycle('background'); f.lifecycle('active');
  f.key.resolve('04' + '11'.repeat(64)); f.state.resolve({ privatePortfolio: null }); await pending;
  assert.equal(f.values.available, false); assert.equal(f.values.key, null);
  assert.equal(f.events.includes('api-created'), false);
});
test('background then foreground during HTTP discards the old availability reply', async () => {
  const f = fixture(), pending = f.refresh(); f.key.resolve('04' + '11'.repeat(64)); await f.waitForState(pending);
  assert.equal(f.events.includes('state-requested'), true);
  f.lifecycle('background'); f.lifecycle('active'); f.state.resolve({ privatePortfolio: null }); await pending;
  assert.equal(f.values.available, false); assert.equal(f.events.filter(value => value === 'availability-true').length, 0);
});
test('a new invalidation or unmount while HTTP waits leaves the previous check unavailable', async () => {
  for (const change of [f => f.globals.invalidate(), f => { f.globals.mounted.current = false; }]) {
    const f = fixture(), pending = f.refresh(); f.key.resolve('04' + '11'.repeat(64)); await f.waitForState(pending);
    change(f); f.state.resolve({ privatePortfolio: null }); await pending;
    assert.equal(f.values.available, false); assert.equal(f.values.notice, '');
  }
});

test('background or input invalidation removes previously displayed private quantities immediately', () => {
  for (const change of [f => f.lifecycle('background'), f => f.globals.invalidate()]) {
    const f = fixture(); f.values.privateState = { status: 'LIVE', balances: { available: '123' } };
    change(f); assert.equal(f.values.privateState, null);
    assert.equal(f.globals.observationEpoch.current, 1);
  }
});

test('native screen reopens deposit W39 against D26 and output W39 against the same U without new admission', async () => {
  const input = readFileSync(new URL('../src/screens/DeviceDepositScreen.tsx', import.meta.url), 'utf8');
  const tree = ts.createSourceFile('DeviceDepositScreen.tsx', input, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const component = tree.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === 'DeviceDepositScreen');
  assert.ok(component?.body);
  const selectedBody = name => {
    const node = component.body.statements.find(item => ts.isFunctionDeclaration(item) && item.name?.text === name);
    assert.ok(node?.body, name); return input.slice(node.body.getStart(tree), node.body.end);
  };
  const transpiled = name => ts.transpileModule('(async function ' + name + (name === 'publishNote' ? '(value, held) ' : '(held, sameOperation) ') + selectedBody(name) + ')',
    { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText;
  const depositId = 'd'.repeat(64), reservationId = 'a'.repeat(64), rootId = 'b'.repeat(64), pub = '04' + 'c'.repeat(128);
  function local(role, mutate = () => {}) {
    const values = { exitRole: role === 'deposit' ? 'change' : 'deposit', exitIntent: null, exitJob: null, note: null }, events = [];
    const state = { rootId, job: { jobId: depositId, origin: 'https://native.original.test', pairingId: 'e'.repeat(64) },
      status: 'FUNDED', availableBalance: null, localReservation: role === 'deposit' ? null : { sourceSpentAtRetainedHead: true } };
    const intent = role === 'deposit' ? null : { rootId, depositJobId: depositId, jobId: reservationId,
      origin: state.job.origin, pairingId: state.job.pairingId, devicePublicKey: pub };
    const pending = { rootId, parentJobId: role === 'deposit' ? depositId : reservationId, jobId: 'f'.repeat(64),
      noteRole: role, statement: { recipient: '1'.repeat(40) }, receipt: null, phase: 'SIGNED', availableBalance: null };
    const world = { state, intent, pending }; mutate(world);
    // Explicit inert custody projection and five SDK acquisition boundaries.
    // The product body consumes only these authenticated-reader projections;
    // AEAD and SDK branding have their existing original integration tests.
    const custody = { async readDeviceNote() { events.push('read-note'); return world.state; },
      async readDeviceReservationIntent() { return world.intent; }, async readDeviceExecutionIntent() { return null; },
      async readDeviceExitIntent(selected) { events.push('read-exit-' + selected); return world.pending; },
      close() { events.push('custody-close'); } };
    const globals = { origin: state.job.origin, pairingId: state.job.pairingId, exitRole: values.exitRole, onObservation: undefined,
      inspectLocalRootNoteVaultV1: async () => ({ rootId, status: 'ACTIVE' }), openLocalRootNoteVaultV1: id => { assert.equal(id, rootId); return custody; },
      readDevicePublicKey: async () => pub, live() {}, clearNativeReview() {},
      setOrigin() {}, setPairingId() {}, setReservationJob() {}, setExecutionIntent() {}, setExitRecipient() {}, setConsent() {},
      setOwnerReview() {}, setReservationConsent() {}, setExitReview() {}, setExitConsent() {}, setApproved() {}, setMessage() {},
      setExitRole(value) { values.exitRole = typeof value === 'function' ? value(values.exitRole) : value; },
      setExitJob(value) { values.exitJob = value; }, setExitIntent(value) { values.exitIntent = value; }, setNote(value) { values.note = value; },
    };
    for (const name of ['request', 'authorizationRequest', 'exitRequest', 'quote', 'exitQuote', 'client', 'reservationClient', 'exitClient', 'executionClient', 'balanceClient', 'vault'])
      globals[name] = { current: null };
    for (const name of ['createDeviceOwnerDepositApiV1', 'createDeviceOwnerReservationApiV1', 'createDeviceOwnerExitApiV1', 'createDeviceOwnerExecutionApiV1', 'createDeviceOwnerOutputBalanceApiV1'])
      globals[name] = async descriptor => { assert.equal(descriptor.origin, state.job.origin); assert.equal(descriptor.pairingId, state.job.pairingId);
        assert.equal(descriptor.devicePublicKey, pub); events.push('sdk-open'); return { descriptor, close() { events.push('sdk-close'); } }; };
    globals.publishNote = new Script(transpiled('publishNote')).runInNewContext(globals);
    const connect = new Script(transpiled('openConnection')).runInNewContext(globals);
    return { connect, values, events, globals, world };
  }
  for (const role of ['deposit', 'change', 'recovery']) {
    const f = local(role);
    // The stored role choice is meaningful only among S outputs. Start this
    // recovery case on recovery to ensure the selection survives the reads.
    if (role === 'recovery') f.globals.exitRole = 'recovery';
    await f.connect(0, true);
    assert.equal(f.values.exitRole, role); assert.equal(f.values.exitJob, f.world.pending.jobId);
    assert.equal(f.values.exitIntent, f.world.pending); assert.equal(f.values.exitIntent.availableBalance, null);
    assert.equal(f.values.note, f.world.state); assert.equal(f.events.filter(value => value === 'sdk-open').length, 5);
    assert.equal(f.events.some(value => /prove|fund|reserve|send/.test(value)), false);
  }
  for (const mutate of [w => { w.pending.parentJobId = '0'.repeat(64); }, w => { w.pending.rootId = '0'.repeat(64); },
    w => { w.pending.noteRole = 'change'; }, w => { w.intent = { rootId, depositJobId: depositId, jobId: reservationId,
      origin: w.state.job.origin, pairingId: w.state.job.pairingId, devicePublicKey: pub }; }]) {
    const f = local('deposit', mutate); await assert.rejects(f.connect(0, true), /MOBILE_LOCAL_ORIGINAL_JOB_CHANGED/);
    assert.equal(f.events.includes('sdk-open'), false); assert.equal(f.events.includes('custody-close'), true);
  }
  const foreignOutput = local('change', w => { w.intent = null; });
  await assert.rejects(foreignOutput.connect(0, true), /MOBILE_LOCAL_ORIGINAL_JOB_CHANGED/);
  assert.equal(foreignOutput.events.includes('sdk-open'), false);
  // Actual JSX subtree: W39 has its own funded-D26-or-confirmed-S condition,
  // rather than remaining hidden inside the original reservation-only branch.
  let withdrawalGate = false;
  function visit(node) {
    if (ts.isJsxExpression(node) && node.expression && node.getText(tree).includes('Salida de la misma custodia')) {
      if (ts.isBinaryExpression(node.expression) && node.expression.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken) {
        const condition = node.expression.left.getText(tree);
        if (condition.includes("note?.status === 'FUNDED'") && condition.includes('!note.localReservation')) withdrawalGate = true;
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(component); assert.equal(withdrawalGate, true);
});

test('MetaMorpho four pairing screen keeps original routed notes, a common D27 window and fences late acquisition', async () => {
  const input=readFileSync(new URL('../src/screens/ExternalTokenNoteScreen.tsx',import.meta.url),'utf8');
  const tree=ts.createSourceFile('ExternalTokenNoteScreen.tsx',input,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
  const component=tree.statements.find(n=>ts.isFunctionDeclaration(n)&&n.name?.text==='ExternalTokenNoteScreen');assert.ok(component?.body);
  const P=await import(new URL('../../../packages/mobile-protocol/src/device-external-flat-note-v1.mjs',import.meta.url));
  const top=tree.statements.find(n=>ts.isFunctionDeclaration(n)&&n.name?.text==='parseMetaFourPairing');assert.ok(top);
  const emit=node=>ts.transpileModule(input.slice(node.getStart(tree),node.end),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;
  const selected=name=>{const n=component.body.statements.find(v=>ts.isFunctionDeclaration(v)&&v.name?.text===name);assert.ok(n,name);return emit(n);};
  const hash=n=>n.toString(16).padStart(64,'0'),pub='04'+'11'.repeat(64),pool={pool:'12'.repeat(20),poolCodeHash:hash(1),scope:hash(2),policy:hash(3),assetIdentity:hash(4),asset:'13'.repeat(20),assetCodeHash:hash(5),genesis:hash(6),domainCommitment:hash(7),hub:'14'.repeat(20),hubCodeHash:hash(8),hubDomain:hash(9),ledgerNamespace:hash(10)};
  const source=P.normalizeExternalFlatDescriptorV1({profile:P.DEVICE_EXTERNAL_FLAT_NOTE_V1,origin:'https://original.local:9447',pairingId:hash(11),devicePublicKey:pub,lifetime:hash(12),poolTerms:pool,assetMetadata:{kind:'ERC20',symbol:'USDC',decimals:6}});
  const targets=Array.from({length:4},(_,slot)=>P.normalizeExternalFlatDescriptorV1({profile:P.DEVICE_EXTERNAL_FLAT_SHARE_V1,origin:'https://original.local:'+(9447+slot),pairingId:hash(20+slot),devicePublicKey:pub,lifetime:hash(30+slot),poolTerms:{...pool,pool:'15'.repeat(20),asset:'16'.repeat(20),assetIdentity:hash(40),scope:hash(41)},assetMetadata:{kind:'ERC20',symbol:'MMS',decimals:6}}));
  const depends=[[],['device-external-share-0'],['device-external-share-0'],['device-external-share-1','device-external-share-2']];
  const packet={profile:'DEVICE_EXTERNAL_FLAT_META_FOUR_PAIRING_V1',source,targets,deliveries:targets.map((d,slot)=>({id:'device-external-share-'+slot,dependsOn:depends[slot],origin:d.origin,maximumInput:'100',shareAmount:'100',payoutAmount:'100'}))};
  const globals={JSON,Array,Object,Number,BigInt,DEVICE_EXTERNAL_FLAT_NOTE_V1:P.DEVICE_EXTERNAL_FLAT_NOTE_V1,DEVICE_EXTERNAL_FLAT_SHARE_V1:P.DEVICE_EXTERNAL_FLAT_SHARE_V1,normalizeExternalFlatDescriptorV1:P.normalizeExternalFlatDescriptorV1,externalFlatExactV1:P.externalFlatExactV1,externalFlatUintV1:P.externalFlatUintV1};
  const parse=new Script(emit(top)+'\nparseMetaFourPairing;').runInNewContext(globals),pairing=parse(JSON.stringify(packet));
  assert.deepEqual(JSON.parse(JSON.stringify(pairing)),packet);const redemptionPacket={...packet,profile:'DEVICE_EXTERNAL_FLAT_META_FOUR_UNDERLYING_PAIRING_V2',redemptionRecipient:'61'.repeat(20)};assert.deepEqual(JSON.parse(JSON.stringify(parse(JSON.stringify(redemptionPacket)))),redemptionPacket);assert.throws(()=>parse(JSON.stringify({...redemptionPacket,redemptionRecipient:'0'.repeat(40)})));
  for(const mutate of [p=>p.targets.pop(),p=>{p.targets[3]=structuredClone(p.targets[0]);},p=>{p.targets[1].devicePublicKey='04'+'22'.repeat(64);},p=>{p.targets[2].poolTerms.genesis=hash(99);},p=>{p.deliveries[3].dependsOn=[];},p=>{p.deliveries[0].shareAmount='101';},p=>{p.extra='NO_AUTHORITY_SELECTOR';}]){const p=structuredClone(packet);mutate(p);assert.throws(()=>parse(JSON.stringify(p)));}
  const events=[],calls=[],reads=[null,null,null,null],state={summary:null,connected:false,amount:'',window:null,prepared:null};let head=1000n,lateAcquisition=null;
  Object.assign(globals,{mounted:{current:true},epoch:{current:0},connection:{current:null},AppState:{currentState:'active'},acquiring:{current:null},closing:{current:null},metaFourRef:{current:pairing},metaFourWindowRef:{current:null},metaFourText:JSON.stringify(packet),parseMetaFourPairing:parse,descriptorText:JSON.stringify(source),custodyRoute:'LEGACY',recipient:'0x'+'17'.repeat(20),amount:'100',validUntil:'',expoFetch:'EXPLICIT_ORIGINAL_TRANSPORT_PORT',preparedRef:{current:null},onObservation:()=>events.push('original-observation'),
    clearReview(){events.push('clear-review');},hideRecovery(){},setConnected:v=>{state.connected=v;},setSummary:v=>{state.summary=v;},setStatus(){},setGraphStatus(){},setBlueStatus(){},setAaveStatus(){},setRecipient(){},setAmount:v=>{state.amount=v;},setNotice(){},setRecoveryPreparation:v=>{state.prepared=v;},setDescriptorText(){},setMetaFour(){},setMetaFourWindow:v=>{state.window=v;},setValidUntil(){},setGraphValidFrom(){},setGraphSettleBefore(){},setGraphAssetAmount(){},setGraphShareAmount(){},setGraphPayoutAmount(){},
    setMetaFourReads:fn=>{const next=typeof fn==='function'?fn(reads):fn;for(let i=0;i<4;i++)reads[i]=next[i];},readDevicePublicKey:async()=>pub,
    sign:async selected=>{events.push('same-device-pop-'+selected.descriptor.pairingId);return 'EXPLICIT_INERT_POP';},
    createDeviceExternalFlatNoteApiV1({descriptor}){events.push('sdk-'+descriptor.pairingId);return{async challenge(){return{descriptor};},async status(){const now=Date.now();return P.normalizeExternalFlatStatusV1({descriptor,jobs:[],observed:{blockNumber:head.toString(),blockHash:hash(50),timestamp:head.toString()},observedAt:now,expiresAt:now+15000,note:{state:'UNISSUED',commitment:null,available:null,backing:null},...(descriptor.profile===P.DEVICE_EXTERNAL_FLAT_NOTE_V1?{graphClaimed:false}:{})});},close(){events.push('sdk-close-'+descriptor.pairingId);}};},
    createDeviceExternalFlatGraphApiV1({descriptor}){assert.equal(descriptor.profile,P.DEVICE_EXTERNAL_FLAT_NOTE_V1);events.push('graph-source-only');return{close(){events.push('graph-close');}};},
    createDeviceMorphoBlueRedemptionApiV1(){throw Error('META_IS_NOT_BLUE');},readBlueStatus(){throw Error('META_IS_NOT_BLUE');},readGraphStatus(){throw Error('NO_EXISTING_GRAPH_IN_EXPLICIT_PORT');},makeReview(){throw Error('D27_REQUIRES_RECOVERY_COPY');},
  });
  function custody(descriptor){return{async summary(){return{descriptor:null,recipient:null,amount:null,graph:null};},async reconcileOriginalStatus(v){assert.equal(JSON.stringify(v.descriptor),JSON.stringify(descriptor));events.push('same-note-read-'+descriptor.pairingId);return{descriptor,recipient:null,amount:null,graph:null};},async prepareDeposit(d,address,amount,start,end){assert.equal(JSON.stringify(d),JSON.stringify(descriptor));assert.equal(address,'17'.repeat(20));calls.push({pairingId:d.pairingId,amount,start,end});return{draft:{action:'PROVE_D27'},witness:null};},async close(){events.push('vault-close-'+descriptor.pairingId);}};}
  globals.createDeviceExternalFlatNoteVaultV1=async()=>{events.push('legacy-source-vault');return custody(source);};
  globals.createDeviceExternalFlatRoutedNoteVaultV1=async descriptor=>{events.push('routed-'+descriptor.pairingId);if(lateAcquisition)return lateAcquisition.promise;return custody(descriptor);};
  globals.clearUniswap=()=>{};globals.clearAave=()=>{};globals.aaveRef={current:null};globals.createDeviceAaveStaticRedemptionApiV1=()=>{throw Error('META_IS_NOT_AAVE');};globals.readAaveStatus=()=>{throw Error('META_IS_NOT_AAVE');};
  globals.metaRef??={current:null};globals.clearMeta??=()=>{};globals.setMetaStatus??=()=>{};globals.setGraphPreparationPending??=()=>{};
 for(const name of ['closeConnection','current','requireConnection','clearMetaFour','metaFourSlot','retainMetaFourWindow','recordMetaFourStatus','invalidateMetaFourStatus','readStatus','connect','loadMetaFour','selectMetaFour','prepareDeposit'])globals[name]=new Script(selected(name)+'\n'+name+';').runInNewContext(globals);
  for(let slot=0;slot<4;slot++){head=1000n+BigInt(slot);await globals.selectMetaFour(slot);await globals.prepareDeposit();assert.equal(globals.connection.current.descriptor.pairingId,targets[slot].pairingId);assert.equal(reads[slot].note.available,null);}
  assert.equal(events.filter(v=>v.startsWith('routed-')).length,4);assert.deepEqual(calls.map(v=>[v.start,v.end,v.amount]),Array.from({length:4},()=>['1000','29740','100']));assert.equal(state.window.settleBefore,'29800');assert.equal(state.prepared,'SHARE');
  await globals.selectMetaFour(-1);assert.equal(globals.connection.current.descriptor.pairingId,source.pairingId);assert.equal(state.amount,'500');assert.equal(events.filter(v=>v==='legacy-source-vault').length,1);assert.equal(events.filter(v=>v==='graph-source-only').length,1);
  // Reopened original D27 history must retain its exact common tuple. A
  // contradictory target is rejected before accepting its display response.
  const matching={descriptor:targets[0],jobs:[{mode:'deposit_intent',consentFields:{statement:{amount:'100',validFrom:'1000',validUntil:'29740'}}}]};globals.recordMetaFourStatus(matching);
  assert.throws(()=>globals.recordMetaFourStatus({...matching,jobs:[{mode:'deposit_intent',consentFields:{statement:{amount:'100',validFrom:'1001',validUntil:'29740'}}}]}),/MOBILE_META_FOUR_WINDOW_CHANGED/);
  globals.invalidateMetaFourStatus(targets[0]);assert.equal(reads[0],null);assert.notEqual(reads[3],null);
  head=29740n;await globals.selectMetaFour(1);await assert.rejects(globals.prepareDeposit(),/MOBILE_META_FOUR_WINDOW_EXPIRED/);assert.equal(calls.length,4);
  const key=deferred(),beforeKey=events.filter(v=>v.startsWith('sdk-')).length;globals.readDevicePublicKey=()=>key.promise;const obsoleteLoad=globals.loadMetaFour();globals.epoch.current++;key.resolve(pub);await assert.rejects(obsoleteLoad,/MOBILE_EXTERNAL_FLAT_CONTEXT_CHANGED/);assert.equal(events.filter(v=>v.startsWith('sdk-')).length,beforeKey);globals.readDevicePublicKey=async()=>pub;
  lateAcquisition=deferred();const pending=globals.selectMetaFour(2);while(!globals.acquiring.current)await Promise.resolve();globals.AppState.currentState='background';const drained=globals.closeConnection();lateAcquisition.resolve(custody(targets[2]));await pending;await drained;assert.equal(globals.connection.current,null);assert.equal(state.connected,false);assert.equal(events.some(v=>/fund|reserve|execute|send/.test(v)),false);
});

test('Aave mobile pairing routes own source and shares and drains late acquisition without authorizing an effect',async()=>{
 const input=readFileSync(new URL('../src/screens/ExternalTokenNoteScreen.tsx',import.meta.url),'utf8'),tree=ts.createSourceFile('ExternalTokenNoteScreen.tsx',input,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX),component=tree.statements.find(n=>ts.isFunctionDeclaration(n)&&n.name?.text==='ExternalTokenNoteScreen');assert.ok(component?.body);
 const P=await import(new URL('../../../packages/mobile-protocol/src/device-external-flat-note-v1.mjs',import.meta.url)),emit=node=>ts.transpileModule(input.slice(node.getStart(tree),node.end),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText,selected=name=>{const n=component.body.statements.find(v=>ts.isFunctionDeclaration(v)&&v.name?.text===name);assert.ok(n,name);return emit(n);},top=tree.statements.find(n=>ts.isFunctionDeclaration(n)&&n.name?.text==='parseAavePairing');assert.ok(top);
 const hex=n=>n.toString(16).padStart(64,'0'),pub='04'+'11'.repeat(64),pool={pool:'12'.repeat(20),poolCodeHash:hex(1),scope:hex(2),policy:hex(3),assetIdentity:hex(4),asset:'13'.repeat(20),assetCodeHash:hex(5),genesis:hex(6),domainCommitment:hex(7),hub:'14'.repeat(20),hubCodeHash:hex(8),hubDomain:hex(9),ledgerNamespace:hex(10)},source=P.normalizeExternalFlatDescriptorV1({profile:P.DEVICE_EXTERNAL_FLAT_NOTE_V1,origin:'https://original.local:9447',pairingId:hex(11),devicePublicKey:pub,lifetime:hex(12),poolTerms:pool,assetMetadata:{kind:'ERC20',symbol:'USDC',decimals:6}}),target=P.normalizeExternalFlatDescriptorV1({...source,profile:P.DEVICE_EXTERNAL_FLAT_SHARE_V1,pairingId:hex(13),lifetime:hex(14),poolTerms:{...pool,pool:'15'.repeat(20),asset:'16'.repeat(20),assetIdentity:hex(15)},assetMetadata:{kind:'ERC20',symbol:'staticUSDC',decimals:6}}),packet={profile:'DEVICE_EXTERNAL_FLAT_AAVE_PAIRING_V1',source,target};
 const events=[],state={pairing:null},globals={JSON,Array,Object,Number,BigInt,DEVICE_EXTERNAL_FLAT_NOTE_V1:P.DEVICE_EXTERNAL_FLAT_NOTE_V1,DEVICE_EXTERNAL_FLAT_SHARE_V1:P.DEVICE_EXTERNAL_FLAT_SHARE_V1,normalizeExternalFlatDescriptorV1:P.normalizeExternalFlatDescriptorV1,externalFlatExactV1:P.externalFlatExactV1,externalFlatUintV1:P.externalFlatUintV1};
 const parse=new Script(emit(top)+'\nparseAavePairing;').runInNewContext(globals);assert.deepEqual(JSON.parse(JSON.stringify(parse(JSON.stringify(packet)))),packet);
 for(const change of [p=>p.profile='ARBITRARY_PROVIDER',p=>p.target.profile=P.DEVICE_EXTERNAL_FLAT_NOTE_V1,p=>p.target.origin='https://other.local',p=>p.target.devicePublicKey='04'+'22'.repeat(64),p=>p.target.poolTerms.hub=hex(50).slice(0,40),p=>p.target.poolTerms.assetIdentity=p.source.poolTerms.assetIdentity,p=>p.extra={}]){const p=structuredClone(packet);change(p);assert.throws(()=>parse(JSON.stringify(p)));}
 let late=null;
 Object.assign(globals,{mounted:{current:true},epoch:{current:0},connection:{current:null},AppState:{currentState:'active'},acquiring:{current:null},closing:{current:null},aaveRef:{current:null},aaveWindowRef:{current:null},aaveText:JSON.stringify(packet),parseAavePairing:parse,metaFourRef:{current:null},custodyRoute:'LEGACY',descriptorText:'',expoFetch:'EXPLICIT_ORIGINAL_FETCH_PORT',readDevicePublicKey:async()=>pub,
  clearReview(){},hideRecovery(){},clearMetaFour(){},clearUniswap(){},setAavePairing:v=>{state.pairing=v;},setCustodyRoute:v=>events.push('route-'+v),setGraphValidFrom(){},setGraphSettleBefore(){},setGraphShareAmount(){},setDescriptorText(){},setSummary(){},setConnected(){},setRecipient(){},setAmount(){},setStatus(){},setGraphStatus(){},setBlueStatus(){},setAaveStatus(){},setNotice(){},
  createDeviceAaveStaticRedemptionApiV1({descriptor}){assert.equal(JSON.stringify(descriptor),JSON.stringify(target));events.push('aave-sdk');return{close(){events.push('aave-sdk-close');}};},async readAaveStatus(selected,ticket){globals.current(ticket,selected);assert.ok(selected.aaveClient);events.push('aave-read');return{operations:[]};},
  metaFourSlot:()=>-1,createDeviceMorphoBlueRedemptionApiV1(){throw Error('AAVE_IS_NOT_BLUE');},createDeviceExternalFlatNoteVaultV1(){throw Error('AAVE_MUST_NOT_ADOPT_LEGACY_SOURCE');},
  createDeviceExternalFlatNoteApiV1:({descriptor})=>{events.push('sdk-'+descriptor.pairingId);return{close(){events.push('sdk-close-'+descriptor.pairingId);}};},createDeviceExternalFlatGraphApiV1:({descriptor})=>{assert.equal(descriptor.profile,P.DEVICE_EXTERNAL_FLAT_NOTE_V1);return{close(){events.push('graph-close');}};},
  async readStatus(selected,ticket){globals.current(ticket,selected);events.push('same-original-read-'+selected.descriptor.pairingId);return{jobs:[]};},readGraphStatus(){throw Error('NO_ADOPTED_GRAPH');}
 });
 function vault(descriptor){return{async summary(){return{descriptor:null,recipient:null,amount:null,graph:null};},async close(){events.push('vault-close-'+descriptor.pairingId);}};}
 globals.createDeviceExternalFlatRoutedNoteVaultV1=async descriptor=>{events.push('routed-'+descriptor.pairingId);return late?late.promise:vault(descriptor);};
 globals.metaRef??={current:null};globals.clearMeta??=()=>{};globals.setMetaStatus??=()=>{};globals.setGraphPreparationPending??=()=>{};
 for(const name of ['closeConnection','current','requireConnection','clearAave','loadAave','selectAave','connect'])globals[name]=new Script(selected(name)+'\n'+name+';').runInNewContext(globals);
 await globals.loadAave();assert.equal(globals.connection.current.descriptor.pairingId,source.pairingId);await globals.selectAave('target');assert.equal(globals.connection.current.descriptor.pairingId,target.pairingId);assert.equal(globals.connection.current.graphClient,null);assert.ok(globals.connection.current.aaveClient);assert.equal(events.filter(v=>v==='aave-read').length,1);await globals.selectAave('source');assert.equal(events.filter(v=>v==='aave-sdk-close').length,1);assert.equal(events.filter(v=>v.startsWith('routed-')).length,3);assert.ok(events.indexOf('vault-close-'+source.pairingId)<events.indexOf('routed-'+target.pairingId));
 const key=deferred(),before=events.filter(v=>v.startsWith('sdk-')).length;globals.readDevicePublicKey=()=>key.promise;const obsolete=globals.loadAave();globals.epoch.current++;key.resolve(pub);await assert.rejects(obsolete,/MOBILE_EXTERNAL_FLAT_CONTEXT_CHANGED/);assert.equal(events.filter(v=>v.startsWith('sdk-')).length,before);globals.readDevicePublicKey=async()=>pub;
 late=deferred();const pending=globals.selectAave('target');while(!globals.acquiring.current)await Promise.resolve();globals.AppState.currentState='background';const drain=globals.closeConnection();late.resolve(vault(target));await assert.rejects(pending,/MOBILE_EXTERNAL_FLAT_CONNECTION_REQUIRED|MOBILE_EXTERNAL_FLAT_CONTEXT_CHANGED/);await drain;assert.equal(globals.connection.current,null);assert.equal(events.some(v=>/fund|proof|reserve|execute|send/.test(v)),false);
});

test('original Aave SDK keeps redemption PoP separate and observes the same job after one lost reply',async()=>{
 const P=await import(new URL('../../../packages/mobile-protocol/src/device-morpho-blue-redemption-v1.mjs',import.meta.url)),N=await import(new URL('../../../packages/mobile-protocol/src/device-external-flat-note-v1.mjs',import.meta.url)),A=await import(new URL('../src/api/device-morpho-blue-redemption-api-v1.mjs',import.meta.url));
 const h=n=>n.toString(16).padStart(64,'0'),a=n=>n.toString(16).padStart(40,'0'),descriptor=N.normalizeExternalFlatDescriptorV1({profile:N.DEVICE_EXTERNAL_FLAT_SHARE_V1,origin:'https://original.local:9447',pairingId:h(1),devicePublicKey:'04'+'11'.repeat(64),lifetime:h(2),poolTerms:{pool:a(1),poolCodeHash:h(3),scope:h(4),policy:h(5),assetIdentity:h(6),asset:a(2),assetCodeHash:h(7),genesis:h(8),domainCommitment:h(9),hub:a(3),hubCodeHash:h(10),hubDomain:h(11),ledgerNamespace:h(12)},assetMetadata:{kind:'ERC20',symbol:'staticUSDC',decimals:6}});
 const signature='01'.repeat(64),subject={withdrawalJobId:h(13),rootId:h(14),withdrawalTransactionHash:h(15),shares:'100',minimumAssets:'100',deadline:'1180',reference:h(16),position:a(2),underlying:a(4),recipient:a(5)},row={profile:P.DEVICE_AAVE_STATIC_REDEMPTION_V1,descriptor,...subject,stage:'REDEEMED',redeemedUnderlying:'100',nativeGas:{approvalWei:null,redemptionWei:null},observation:'ORIGINAL_RECONCILIATION'};let nonce=20,posts=0,reads=0,closed=0;
 // Explicit fixed transport boundary only. No native receipt or balance is
 // credited by this fixture; production SDK parses, brands and gates it.
 const fetchImpl=async(url,request)=>{assert.equal(request.headers.Origin,descriptor.origin);assert.equal(request.redirect,'error');const q=JSON.parse(request.body),path=url.slice((descriptor.origin+'/v1/mobile/external-flat/aave-static/').length);assert.ok(url.startsWith(descriptor.origin+'/v1/mobile/external-flat/aave-static/'));let value;
  if(path==='challenges')value={profile:P.DEVICE_AAVE_STATIC_REDEMPTION_V1,action:'ACCESS_AAVE',descriptor,challengeId:h(nonce++),nonce:h(nonce++),expiresAt:Date.now()+15000};
  else if(path==='reviews')value={consent:{profile:P.DEVICE_AAVE_STATIC_REDEMPTION_V1,descriptor,...q.draft,...subject,action:q.draft.action,challengeId:h(nonce++),nonce:h(nonce++),expiresAt:Date.now()+15000,observed:{blockNumber:'22',blockHash:h(30),timestamp:'1000'}}};
  else if(path==='operations'){posts++;if(q.consent.action==='REDEEM_AAVE')throw Object.assign(Error('HOST_ORIGINAL_REPLY_LOST'),{code:'HOST_ORIGINAL_REPLY_LOST'});assert.equal(q.consent.withdrawalJobId,subject.withdrawalJobId);value=row;}
  else if(path==='status'){reads++;const observedAt=Date.now();value={profile:P.DEVICE_AAVE_STATIC_REDEMPTION_V1,descriptor,observationOnly:false,operations:[row],observedAt,expiresAt:observedAt+15000};}else assert.fail('HOST_FIXED_AAVE_ROUTE');
  return new Response(JSON.stringify(value),{status:200,headers:{'content-type':'application/json'}});
 };
 const first=A.createDeviceAaveStaticRedemptionApiV1({descriptor,fetchImpl}),access=await first.challenge();assert.throws(()=>P.normalizeDeviceMorphoBlueRedemptionAccessV1(access));assert.ok(P.deviceAaveStaticRedemptionPermissionMessageV1(access).length<=4096);const consent=await first.review(access,signature,{action:'REDEEM_AAVE',withdrawalJobId:subject.withdrawalJobId,minimumAssets:'100',deadline:'1180'});assert.ok(P.deviceAaveStaticRedemptionPermissionMessageV1(consent).length<=4096);await assert.rejects(first.submit(consent,signature),{code:'HOST_ORIGINAL_REPLY_LOST'});await assert.rejects(first.submit(consent,signature));assert.equal(posts,1);first.close();closed++;
 const reopened=A.createDeviceAaveStaticRedemptionApiV1({descriptor,fetchImpl}),fresh=await reopened.challenge(),status=await reopened.status(fresh,signature);assert.equal(A.readDeviceAaveStaticRedemptionStatusV1(status),status);assert.throws(()=>A.readDeviceMorphoBlueRedemptionStatusV1(status));assert.throws(()=>A.readDeviceAaveStaticRedemptionStatusV1(structuredClone(status)));const again=await reopened.challenge(),observe=await reopened.review(again,signature,{action:'OBSERVE_AAVE',withdrawalJobId:subject.withdrawalJobId,minimumAssets:'100',deadline:'1180'}),result=await reopened.submit(observe,signature);assert.equal(result.reference,subject.reference);assert.equal(result.stage,'REDEEMED');assert.equal(posts,2);assert.equal(reads,1);reopened.close();closed++;assert.throws(()=>A.readDeviceAaveStaticRedemptionRowV1(result));assert.equal(closed,2);
});

test('Uniswap mobile pairing keeps original output terms and drains changed contexts without admitting an effect',async()=>{
 const input=readFileSync(new URL('../src/screens/ExternalTokenNoteScreen.tsx',import.meta.url),'utf8'),tree=ts.createSourceFile('ExternalTokenNoteScreen.tsx',input,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX),component=tree.statements.find(n=>ts.isFunctionDeclaration(n)&&n.name?.text==='ExternalTokenNoteScreen');assert.ok(component?.body);
 const P=await import(new URL('../../../packages/mobile-protocol/src/device-external-flat-note-v1.mjs',import.meta.url)),emit=node=>ts.transpileModule(input.slice(node.getStart(tree),node.end),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText,selected=name=>{const n=component.body.statements.find(v=>ts.isFunctionDeclaration(v)&&v.name?.text===name);assert.ok(n,name);return emit(n);},top=tree.statements.find(n=>ts.isFunctionDeclaration(n)&&n.name?.text==='parseUniswapPairing');assert.ok(top);
 const hex=n=>n.toString(16).padStart(64,'0'),pub='04'+'11'.repeat(64),pool={pool:'12'.repeat(20),poolCodeHash:hex(1),scope:hex(2),policy:hex(3),assetIdentity:hex(4),asset:'13'.repeat(20),assetCodeHash:hex(5),genesis:hex(6),domainCommitment:hex(7),hub:'14'.repeat(20),hubCodeHash:hex(8),hubDomain:hex(9),ledgerNamespace:hex(10)},source=P.normalizeExternalFlatDescriptorV1({profile:P.DEVICE_EXTERNAL_FLAT_NOTE_V1,origin:'https://original.local:9447',pairingId:hex(11),devicePublicKey:pub,lifetime:hex(12),poolTerms:pool,assetMetadata:{kind:'ERC20',symbol:'USDC',decimals:6}}),target=P.normalizeExternalFlatDescriptorV1({...source,profile:P.DEVICE_EXTERNAL_FLAT_SHARE_V1,pairingId:hex(13),lifetime:hex(14),poolTerms:{...pool,pool:'15'.repeat(20),asset:'16'.repeat(20),assetIdentity:hex(15)},assetMetadata:{kind:'ERC20',symbol:'OUTPUT',decimals:6}}),packet={profile:'DEVICE_EXTERNAL_FLAT_UNISWAP_PAIRING_V1',source,target};
 const events=[],state={pairing:null},globals={JSON,Array,Object,Number,BigInt,DEVICE_EXTERNAL_FLAT_NOTE_V1:P.DEVICE_EXTERNAL_FLAT_NOTE_V1,DEVICE_EXTERNAL_FLAT_SHARE_V1:P.DEVICE_EXTERNAL_FLAT_SHARE_V1,normalizeExternalFlatDescriptorV1:P.normalizeExternalFlatDescriptorV1,externalFlatExactV1:P.externalFlatExactV1,externalFlatUintV1:P.externalFlatUintV1};
 const parse=new Script(emit(top)+'\nparseUniswapPairing;').runInNewContext(globals);assert.deepEqual(JSON.parse(JSON.stringify(parse(JSON.stringify(packet)))),packet);
 for(const change of [p=>p.profile='ARBITRARY_PROVIDER',p=>p.target.profile=P.DEVICE_EXTERNAL_FLAT_NOTE_V1,p=>p.target.origin='https://other.local',p=>p.target.devicePublicKey='04'+'22'.repeat(64),p=>p.target.poolTerms.hub='99'.repeat(20),p=>p.target.poolTerms.assetIdentity=p.source.poolTerms.assetIdentity,p=>p.extra={}]){const p=structuredClone(packet);change(p);assert.throws(()=>parse(JSON.stringify(p)));}
 let late=null;
 Object.assign(globals,{mounted:{current:true},epoch:{current:0},connection:{current:null},AppState:{currentState:'active'},acquiring:{current:null},closing:{current:null},uniswapRef:{current:null},uniswapWindowRef:{current:null},uniswapText:JSON.stringify(packet),parseUniswapPairing:parse,metaFourRef:{current:null},aaveRef:{current:null},custodyRoute:'LEGACY',descriptorText:'',expoFetch:'EXPLICIT_ORIGINAL_FETCH_PORT',readDevicePublicKey:async()=>pub,
  clearReview(){},hideRecovery(){},clearMetaFour(){},clearAave(){},setUniswapPairing:v=>{state.pairing=v;},setCustodyRoute:v=>events.push('route-'+v),setGraphValidFrom:v=>state.from=v,setGraphSettleBefore:v=>state.cutoff=v,setGraphShareAmount:v=>state.output=v,setDescriptorText(){},setSummary(){},setConnected(){},setRecipient(){},setAmount(){},setStatus(){},setGraphStatus(){},setBlueStatus(){},setAaveStatus(){},setNotice(){},
  createDeviceAaveStaticRedemptionApiV1(){throw Error('SWAP_OUTPUT_IS_NOT_AAVE');},readAaveStatus(){throw Error('SWAP_OUTPUT_IS_NOT_AAVE');},metaFourSlot:()=>-1,createDeviceMorphoBlueRedemptionApiV1(){throw Error('SWAP_OUTPUT_IS_NOT_BLUE');},createDeviceExternalFlatNoteVaultV1(){throw Error('UNISWAP_MUST_NOT_ADOPT_LEGACY_SOURCE');},
  createDeviceExternalFlatNoteApiV1:({descriptor})=>{events.push('sdk-'+descriptor.pairingId);return{close(){events.push('sdk-close-'+descriptor.pairingId);}};},createDeviceExternalFlatGraphApiV1:({descriptor})=>{assert.equal(descriptor.profile,P.DEVICE_EXTERNAL_FLAT_NOTE_V1);return{close(){events.push('graph-close');}};},
  async readStatus(selected,ticket){globals.current(ticket,selected);events.push('same-original-read-'+selected.descriptor.pairingId);return{jobs:selected.descriptor.pairingId===target.pairingId?[{mode:'deposit_intent',consentFields:{statement:{validFrom:'1000',validUntil:'1200',amount:'1000'}}}]:[]};},readGraphStatus(){throw Error('NO_ADOPTED_GRAPH');}
 });
 function vault(descriptor){return{async summary(){return{descriptor:null,recipient:null,amount:null,graph:null};},async close(){events.push('vault-close-'+descriptor.pairingId);}};}
 globals.createDeviceExternalFlatRoutedNoteVaultV1=async descriptor=>{events.push('routed-'+descriptor.pairingId);return late?late.promise:vault(descriptor);};
 globals.metaRef??={current:null};globals.clearMeta??=()=>{};globals.setMetaStatus??=()=>{};globals.setGraphPreparationPending??=()=>{};
 for(const name of ['closeConnection','current','requireConnection','clearUniswap','loadUniswap','selectUniswap','connect'])globals[name]=new Script(selected(name)+'\n'+name+';').runInNewContext(globals);
 await globals.loadUniswap();assert.equal(globals.connection.current.descriptor.pairingId,source.pairingId);await globals.selectUniswap('target');assert.equal(globals.connection.current.descriptor.pairingId,target.pairingId);assert.equal(globals.connection.current.graphClient,null);assert.equal(globals.connection.current.aaveClient,null);assert.equal(globals.connection.current.blueClient,null);assert.equal(state.output,'1000');assert.equal(state.from,'1000');assert.equal(state.cutoff,'1260');await globals.selectUniswap('source');assert.equal(events.filter(v=>v.startsWith('routed-')).length,3);assert.ok(events.indexOf('vault-close-'+source.pairingId)<events.indexOf('routed-'+target.pairingId));
 const key=deferred(),before=events.filter(v=>v.startsWith('sdk-')).length;globals.readDevicePublicKey=()=>key.promise;const obsolete=globals.loadUniswap();globals.epoch.current++;key.resolve(pub);await assert.rejects(obsolete,/MOBILE_EXTERNAL_FLAT_CONTEXT_CHANGED/);assert.equal(events.filter(v=>v.startsWith('sdk-')).length,before);globals.readDevicePublicKey=async()=>pub;
 late=deferred();const pending=globals.selectUniswap('target');while(!globals.acquiring.current)await Promise.resolve();globals.AppState.currentState='background';const drain=globals.closeConnection();late.resolve(vault(target));await assert.rejects(pending,/MOBILE_EXTERNAL_FLAT_CONNECTION_REQUIRED|MOBILE_EXTERNAL_FLAT_CONTEXT_CHANGED/);await drain;assert.equal(globals.connection.current,null);assert.equal(events.some(v=>/fund|proof|reserve|execute|send/.test(v)),false);
});

test('original MetaMorpho SDK keeps redemption PoP separate and observes the same job after one lost reply',async()=>{
 const P=await import(new URL('../../../packages/mobile-protocol/src/device-morpho-blue-redemption-v1.mjs',import.meta.url)),N=await import(new URL('../../../packages/mobile-protocol/src/device-external-flat-note-v1.mjs',import.meta.url)),A=await import(new URL('../src/api/device-morpho-blue-redemption-api-v1.mjs',import.meta.url));
 const h=n=>n.toString(16).padStart(64,'0'),a=n=>n.toString(16).padStart(40,'0'),descriptor=N.normalizeExternalFlatDescriptorV1({profile:N.DEVICE_EXTERNAL_FLAT_SHARE_V1,origin:'https://original.local:9447',pairingId:h(1),devicePublicKey:'04'+'11'.repeat(64),lifetime:h(2),poolTerms:{pool:a(1),poolCodeHash:h(3),scope:h(4),policy:h(5),assetIdentity:h(6),asset:a(2),assetCodeHash:h(7),genesis:h(8),domainCommitment:h(9),hub:a(3),hubCodeHash:h(10),hubDomain:h(11),ledgerNamespace:h(12)},assetMetadata:{kind:'ERC20',symbol:'MMV',decimals:6}});
 const signature='01'.repeat(64),subject={withdrawalJobId:h(13),rootId:h(14),withdrawalTransactionHash:h(15),shares:'100',minimumAssets:'100',deadline:'1180',reference:h(16),position:a(2),underlying:a(4),recipient:a(5)},row={profile:P.DEVICE_METAMORPHO_REDEMPTION_V2,descriptor,...subject,stage:'REDEEMED',redeemedUnderlying:'100',nativeGas:{approvalWei:null,redemptionWei:null},observation:'ORIGINAL_RECONCILIATION'};let nonce=20,posts=0,reads=0,closed=0;
 // Explicit fixed transport boundary only. No native receipt or balance is
 // credited by this fixture; production SDK parses, brands and gates it.
 const fetchImpl=async(url,request)=>{assert.equal(request.headers.Origin,descriptor.origin);assert.equal(request.redirect,'error');const q=JSON.parse(request.body),path=url.slice((descriptor.origin+'/v1/mobile/external-flat/metamorpho/').length);assert.ok(url.startsWith(descriptor.origin+'/v1/mobile/external-flat/metamorpho/'));let value;
  if(path==='challenges')value={profile:P.DEVICE_METAMORPHO_REDEMPTION_V2,action:'ACCESS_META',descriptor,challengeId:h(nonce++),nonce:h(nonce++),expiresAt:Date.now()+15000};
  else if(path==='reviews')value={consent:{profile:P.DEVICE_METAMORPHO_REDEMPTION_V2,descriptor,...q.draft,...subject,action:q.draft.action,challengeId:h(nonce++),nonce:h(nonce++),expiresAt:Date.now()+15000,observed:{blockNumber:'22',blockHash:h(30),timestamp:'1000'}}};
  else if(path==='operations'){posts++;if(q.consent.action==='REDEEM_META')throw Object.assign(Error('HOST_ORIGINAL_REPLY_LOST'),{code:'HOST_ORIGINAL_REPLY_LOST'});assert.equal(q.consent.withdrawalJobId,subject.withdrawalJobId);value=row;}
  else if(path==='status'){reads++;const observedAt=Date.now();value={profile:P.DEVICE_METAMORPHO_REDEMPTION_V2,descriptor,observationOnly:false,operations:[row],observedAt,expiresAt:observedAt+15000};}else assert.fail('HOST_FIXED_AAVE_ROUTE');
  return new Response(JSON.stringify(value),{status:200,headers:{'content-type':'application/json'}});
 };
 const first=A.createDeviceMetaMorphoRedemptionApiV2({descriptor,fetchImpl}),access=await first.challenge();assert.throws(()=>P.normalizeDeviceMorphoBlueRedemptionAccessV1(access));assert.ok(P.deviceMetaMorphoRedemptionPermissionMessageV2(access).length<=4096);const consent=await first.review(access,signature,{action:'REDEEM_META',withdrawalJobId:subject.withdrawalJobId,minimumAssets:'100',deadline:'1180'});assert.ok(P.deviceMetaMorphoRedemptionPermissionMessageV2(consent).length<=4096);await assert.rejects(first.submit(consent,signature),{code:'HOST_ORIGINAL_REPLY_LOST'});await assert.rejects(first.submit(consent,signature));assert.equal(posts,1);first.close();closed++;
 const reopened=A.createDeviceMetaMorphoRedemptionApiV2({descriptor,fetchImpl}),fresh=await reopened.challenge(),status=await reopened.status(fresh,signature);assert.equal(A.readDeviceMetaMorphoRedemptionStatusV2(status),status);assert.throws(()=>A.readDeviceMorphoBlueRedemptionStatusV1(status));assert.throws(()=>A.readDeviceMetaMorphoRedemptionStatusV2(structuredClone(status)));const again=await reopened.challenge(),observe=await reopened.review(again,signature,{action:'OBSERVE_META',withdrawalJobId:subject.withdrawalJobId,minimumAssets:'100',deadline:'1180'}),result=await reopened.submit(observe,signature);assert.equal(result.reference,subject.reference);assert.equal(result.stage,'REDEEMED');assert.equal(posts,2);assert.equal(reads,1);reopened.close();closed++;assert.throws(()=>A.readDeviceMetaMorphoRedemptionRowV2(result));assert.equal(closed,2);
});

test('Meta mobile pairing routes own source and shares and drains late acquisition without authorizing an effect',async()=>{
 const input=readFileSync(new URL('../src/screens/ExternalTokenNoteScreen.tsx',import.meta.url),'utf8'),tree=ts.createSourceFile('ExternalTokenNoteScreen.tsx',input,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX),component=tree.statements.find(n=>ts.isFunctionDeclaration(n)&&n.name?.text==='ExternalTokenNoteScreen');assert.ok(component?.body);
 const P=await import(new URL('../../../packages/mobile-protocol/src/device-external-flat-note-v1.mjs',import.meta.url)),emit=node=>ts.transpileModule(input.slice(node.getStart(tree),node.end),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText,selected=name=>{const n=component.body.statements.find(v=>ts.isFunctionDeclaration(v)&&v.name?.text===name);assert.ok(n,name);return emit(n);},top=tree.statements.find(n=>ts.isFunctionDeclaration(n)&&n.name?.text==='parseMetaPairing');assert.ok(top);
 const hex=n=>n.toString(16).padStart(64,'0'),pub='04'+'11'.repeat(64),pool={pool:'12'.repeat(20),poolCodeHash:hex(1),scope:hex(2),policy:hex(3),assetIdentity:hex(4),asset:'13'.repeat(20),assetCodeHash:hex(5),genesis:hex(6),domainCommitment:hex(7),hub:'14'.repeat(20),hubCodeHash:hex(8),hubDomain:hex(9),ledgerNamespace:hex(10)},source=P.normalizeExternalFlatDescriptorV1({profile:P.DEVICE_EXTERNAL_FLAT_NOTE_V1,origin:'https://original.local:9447',pairingId:hex(11),devicePublicKey:pub,lifetime:hex(12),poolTerms:pool,assetMetadata:{kind:'ERC20',symbol:'USDC',decimals:6}}),target=P.normalizeExternalFlatDescriptorV1({...source,profile:P.DEVICE_EXTERNAL_FLAT_SHARE_V1,pairingId:hex(13),lifetime:hex(14),poolTerms:{...pool,pool:'15'.repeat(20),asset:'16'.repeat(20),assetIdentity:hex(15)},assetMetadata:{kind:'ERC20',symbol:'staticUSDC',decimals:6}}),packet={profile:'DEVICE_EXTERNAL_FLAT_METAMORPHO_UNDERLYING_PAIRING_V2',source,target,redemptionRecipient:'61'.repeat(20)};
 const events=[],state={pairing:null},globals={JSON,Array,Object,Number,BigInt,DEVICE_EXTERNAL_FLAT_NOTE_V1:P.DEVICE_EXTERNAL_FLAT_NOTE_V1,DEVICE_EXTERNAL_FLAT_SHARE_V1:P.DEVICE_EXTERNAL_FLAT_SHARE_V1,normalizeExternalFlatDescriptorV1:P.normalizeExternalFlatDescriptorV1,externalFlatExactV1:P.externalFlatExactV1,externalFlatUintV1:P.externalFlatUintV1};
 const parse=new Script(emit(top)+'\nparseMetaPairing;').runInNewContext(globals);assert.deepEqual(JSON.parse(JSON.stringify(parse(JSON.stringify(packet)))),packet);
 for(const change of [p=>p.profile='ARBITRARY_PROVIDER',p=>p.target.profile=P.DEVICE_EXTERNAL_FLAT_NOTE_V1,p=>p.target.origin='https://other.local',p=>p.target.devicePublicKey='04'+'22'.repeat(64),p=>p.target.poolTerms.hub=hex(50).slice(0,40),p=>p.target.poolTerms.assetIdentity=p.source.poolTerms.assetIdentity,p=>p.extra={}]){const p=structuredClone(packet);change(p);assert.throws(()=>parse(JSON.stringify(p)));}
 let late=null;
 Object.assign(globals,{mounted:{current:true},epoch:{current:0},connection:{current:null},AppState:{currentState:'active'},acquiring:{current:null},closing:{current:null},metaRef:{current:null},metaWindowRef:{current:null},metaText:JSON.stringify(packet),parseMetaPairing:parse,metaFourRef:{current:null},custodyRoute:'LEGACY',descriptorText:'',expoFetch:'EXPLICIT_ORIGINAL_FETCH_PORT',readDevicePublicKey:async()=>pub,
  clearReview(){},hideRecovery(){},clearMetaFour(){},clearUniswap(){},setMetaPairing:v=>{state.pairing=v;},setCustodyRoute:v=>events.push('route-'+v),setGraphValidFrom(){},setGraphSettleBefore(){},setGraphShareAmount(){},setDescriptorText(){},setSummary(){},setConnected(){},setRecipient(){},setAmount(){},setStatus(){},setGraphStatus(){},setBlueStatus(){},setMetaStatus(){},setNotice(){},
  createDeviceMetaMorphoRedemptionApiV2({descriptor}){assert.equal(JSON.stringify(descriptor),JSON.stringify(target));events.push('meta-sdk');return{close(){events.push('meta-sdk-close');}};},async readMetaStatus(selected,ticket){globals.current(ticket,selected);assert.ok(selected.metaClient);events.push('meta-read');return{operations:[]};},
  aaveRef:{current:null},createDeviceAaveStaticRedemptionApiV1(){throw Error('META_IS_NOT_AAVE');},readAaveStatus(){throw Error('META_IS_NOT_AAVE');},setAaveStatus(){},clearAave(){},metaFourSlot:()=>-1,createDeviceMorphoBlueRedemptionApiV1(){throw Error('META_IS_NOT_BLUE');},createDeviceExternalFlatNoteVaultV1(){throw Error('META_MUST_NOT_ADOPT_LEGACY_SOURCE');},
  createDeviceExternalFlatNoteApiV1:({descriptor})=>{events.push('sdk-'+descriptor.pairingId);return{close(){events.push('sdk-close-'+descriptor.pairingId);}};},createDeviceExternalFlatGraphApiV1:({descriptor})=>{assert.equal(descriptor.profile,P.DEVICE_EXTERNAL_FLAT_NOTE_V1);return{close(){events.push('graph-close');}};},
  async readStatus(selected,ticket){globals.current(ticket,selected);events.push('same-original-read-'+selected.descriptor.pairingId);return{jobs:[]};},readGraphStatus(){throw Error('NO_ADOPTED_GRAPH');}
 });
 function vault(descriptor){return{async summary(){return{descriptor:null,recipient:null,amount:null,graph:null};},async close(){events.push('vault-close-'+descriptor.pairingId);}};}
 globals.createDeviceExternalFlatRoutedNoteVaultV1=async descriptor=>{events.push('routed-'+descriptor.pairingId);return late?late.promise:vault(descriptor);};
 globals.metaRef??={current:null};globals.clearMeta??=()=>{};globals.setMetaStatus??=()=>{};globals.setGraphPreparationPending??=()=>{};
 for(const name of ['closeConnection','current','requireConnection','clearMeta','loadMeta','selectMeta','connect'])globals[name]=new Script(selected(name)+'\n'+name+';').runInNewContext(globals);
 await globals.loadMeta();assert.equal(globals.connection.current.descriptor.pairingId,source.pairingId);await globals.selectMeta('target');assert.equal(globals.connection.current.descriptor.pairingId,target.pairingId);assert.equal(globals.connection.current.graphClient,null);assert.ok(globals.connection.current.metaClient);assert.equal(events.filter(v=>v==='meta-read').length,1);await globals.selectMeta('source');assert.equal(events.filter(v=>v==='meta-sdk-close').length,1);assert.equal(events.filter(v=>v.startsWith('routed-')).length,3);assert.ok(events.indexOf('vault-close-'+source.pairingId)<events.indexOf('routed-'+target.pairingId));
 const key=deferred(),before=events.filter(v=>v.startsWith('sdk-')).length;globals.readDevicePublicKey=()=>key.promise;const obsolete=globals.loadMeta();globals.epoch.current++;key.resolve(pub);await assert.rejects(obsolete,/MOBILE_EXTERNAL_FLAT_CONTEXT_CHANGED/);assert.equal(events.filter(v=>v.startsWith('sdk-')).length,before);globals.readDevicePublicKey=async()=>pub;
 late=deferred();const pending=globals.selectMeta('target');while(!globals.acquiring.current)await Promise.resolve();globals.AppState.currentState='background';const drain=globals.closeConnection();late.resolve(vault(target));await assert.rejects(pending,/MOBILE_EXTERNAL_FLAT_CONNECTION_REQUIRED|MOBILE_EXTERNAL_FLAT_CONTEXT_CHANGED/);await drain;assert.equal(globals.connection.current,null);assert.equal(events.some(v=>/fund|proof|reserve|execute|send/.test(v)),false);
});
