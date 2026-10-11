/** Real session factories, private session membership, economic Vault/CAS,
 * anchor recovery and owner HTTP. Lower authorities and keeper persistence
 * are explicit HOST fixtures; no financial execution or proof is claimed. */
import test,{mock} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,chmod,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {request} from 'node:http';
import {Vault} from '@lianum/engine/crypto/vault';
import {genericAccountIdentity,sha} from '@lianum/engine/accounts/journal';
import {validateWalletState} from '../../../../mobile-protocol/src/wallet/client/view-model.mjs';
const backend=new URL('../../../src/',import.meta.url),h=v=>createHash('sha256').update(v).digest('hex');
const asset=(id,domain)=>({assetId:id,kind:'ERC20',symbol:'USDC',decimals:6,chainId:'31337',genesis:h(domain+'-genesis'),pool:domain==='first'?'1'.repeat(40):'2'.repeat(40),scope:h(domain+'-scope'),policy:h(domain+'-policy'),token:'3'.repeat(40),codeHash:h('code'),assetIdentity:h('asset'),custody:'ONCHAIN_NOTE_POOL',trust:'PINNED_LOCAL_CONTRACT_AND_TRUSTED_NATIVE_ISSUER'});
const view=(a,block,amount)=>({version:1,status:'LIVE',asset:{assetId:a.assetId,symbol:a.symbol,decimals:a.decimals},observed:{observedAt:Date.now(),blockNumber:String(block),blockHash:h('block-'+block),timestamp:'1000'},balances:{available:amount,reserved:'2',recovery:'1',locked:'1'},backing:{held:'100',liabilities:'90',surplus:'10',deficit:'0'},requests:[]});
function http(app,token=app.ownerAccess.token){return new Promise((resolve,reject)=>{const req=request(app.origin+'/api/wallet/state',{headers:{Origin:app.origin,'x-wallet-owner-token':token}},res=>{const chunks=[];res.on('data',value=>chunks.push(value));res.on('end',()=>resolve({status:res.statusCode,body:JSON.parse(Buffer.concat(chunks))}));});req.on('error',reject);req.end();});}

// Fixed public review data supplied by the lower authority fixture. The real
// wallet validator still checks every field returned through owner HTTP.
function reviewFixture(kind,body,a,config){
 const accountIdentitySHA256=sha(genericAccountIdentity(config)),identitySHA256=h(kind+'-owner');
 const display={assetId:a.assetId,symbol:a.symbol,decimals:a.decimals};
 if(kind==='native'){
  const terms={version:1,profile:'NATIVE_VALUE_OWNER_NOTE_REVIEW_V1',processIdentitySHA256:h('process'),processGeneration:1,keyScopeSHA256:h('key-scope'),originalAccountLifetime:config.lifetime,generationId:accountIdentitySHA256,request:body,kind:body.kind,ownerKind:'deposit',ownerIdentitySHA256:identitySHA256,accountIdentitySHA256,asset:a,epoch:'1',amount:'10',recipient:'9'.repeat(40),role:null,noteStatus:null,observed:{blockHash:h('block-10'),timestamp:'1000'},effect:'CREATE_ORIGINAL_PRIVATE_DEPOSIT_PREPARATION',fundingApproval:'EXISTING_EXACT_TOKEN_ALLOWANCE_REQUIRED_WHEN_APPLICABLE',registration:'ORIGINAL_NATIVE_VALUE_AUTHORITY_OWNER_LOCAL_NOTE_PREPARATION',spending:'SEPARATE_ACCOUNT_PREPARE_AND_EXECUTE_REVIEW_REQUIRED'};
  return{version:1,profile:'ORIGINAL_MANUAL_NATIVE_VALUE_NOTE_REVIEW_V1',...body,asset:display,originalAccountLifetime:config.lifetime,generationId:accountIdentitySHA256,identitySHA256,accountIdentitySHA256,terms,termsSHA256:sha(terms),actionBodySHA256:{accountPrepare:sha(body),accountExecute:sha({requestId:body.requestId}),accountReconcile:sha({requestId:body.requestId})},publicNetwork:false,observation:'ORIGINAL_OWNER_LOCAL_NOTE_TERMS_ONLY',settlementEstablished:false};
 }
 return{version:1,profile:'ORIGINAL_MANUAL_WRAPPED_WALLET_GRAPH_REVIEW_V1',...body,asset:display,routeProfile:'OWNED_LOCAL_WRAPPED_CLAIM_NATIVE_GRAPH_V1',family:'3',chainId:'1',genesis:a.genesis,sourcePool:'0x'+a.pool,sourceAssetIdentity:a.assetIdentity,nativeAsset:h('wrapped-native-asset'),solver:'0x'+'7'.repeat(40),recipient:'0x'+'9'.repeat(40),nativeAmount:'1',executionFrom:'1001',executionUntil:'1100',settleBefore:'1200',payoutCommitment:h('payout'),deliveryRiskCommitment:h('delivery-risk'),deliveryLossClause:'EXPLICIT_HOST_REVIEW_ONLY',creditEligible:false,privateSpendableAtomic:null,publicNetwork:false,envelope:h('envelope'),fundingNotBefore:'900',fundingValidUntil:'1000',identitySHA256,sourceAmount:'10',reservedAmount:'8',changeAmount:'2',changeRecipient:'8'.repeat(40),recoveryRecipient:'9'.repeat(40),originalAccountLifetime:config.lifetime,observation:'ORIGINAL_AUTHORIZED_TERMS_ONLY',solverOwnLiquidity:true,settlementEstablished:false,recovery:'PRIVATE_ORIGINAL_CUTOFF_ONLY',wrappedBinding:{profile:'WRAPPED_WALLET_ORIGINAL_CONSENT_BINDING_V1',accountIdentitySHA256,runtimeIdentitySHA256:h('runtime'),systemProfile:'LIANUM_OWNED_WRAPPED_CUSTODY_NATIVE_GRAPH_V1',hub:'0x'+'4'.repeat(40),claimAuthority:'0x'+'5'.repeat(40),registryCommitment:h('registry'),claimDomain:h('domain'),processIdentitySHA256:h('process'),processGeneration:1,head:{hash:h('block-10'),number:'10',timestamp:'1000'},economicIntentSHA256:h('intent')}};
}

test('HOST real native and wrapped session factories retain pending state and recover durable anchor candidates',async t=>{
 const directory=await mkdtemp(join(tmpdir(),'original-session-economic-host-'));await chmod(directory,0o700);
 const natives=new WeakMap(),wrapped=new WeakMap(),details=new WeakMap(),keepers=new WeakMap(),keeperInputs=new WeakMap(),recoveries=new WeakMap(),lifetime=new WeakMap();
 const authority=Object.freeze({}),section=Object.freeze({}),sourceSHA256=h('original-state-source'),identity={sourceSHA256};
 let keeperCaptures=0,effects=0;const mocks=[],live=new Set();
 const no=()=>{throw Error('HOST_UNUSED_LOWER_PORT');};
 const lowerModules=new Map();
 const install=(path,exports)=>{lowerModules.set(path,exports);mocks.push(mock.module(new URL(path,backend),{exports}));};
 const unused=(path,names)=>install(path,Object.fromEntries(names.map(name=>[name,no])));
 t.after(async()=>{try{for(const value of live)await value.close().catch(()=>{});}finally{for(const installed of mocks.reverse())installed.restore();await rm(directory,{recursive:true,force:true});}});
 const noteDetails=value=>{assert.ok(details.has(value),'HOST_ORIGINAL_APPROVAL_REQUIRED');return details.get(value);};
 install('accounts/authority/native-value-account-authority-v2.mjs',{
  assertOwnedNativeValueAccountAuthority(value,expected){const row=natives.get(value);assert.ok(row&&row.runtime===expected.runtime&&row.system===expected.system);},
  assertOriginalNativeAccountSourceV1:no,nativeValueAccountManualGraphDetails:no,assertNativeValueAccountManualGraphExecution:no,
  nativeValueAccountManualNoteDetails:noteDetails,
 });
 install('accounts/portfolio/wrapped-wallet-portfolio-v1.mjs',{
  assertOwnedWrappedWalletPortfolioV1(runtime,value){assert.equal(wrapped.get(value)?.runtime,runtime);},
  assertOwnedWrappedWalletPortfolioAccountV1(portfolio,value){assert.equal(value,portfolio);assert.ok(wrapped.has(portfolio));},
  claimWrappedWalletPortfolioJournalV1(runtime,value){const row=wrapped.get(value);assert.equal(row?.runtime,runtime);assert.equal(row.claimed,false);row.claimed=true;},
 });
 install('accounts/authority/wrapped-wallet-account-authority-v1.mjs',{
  wrappedWalletAccountManualGraphDetailsV1:noteDetails,assertWrappedWalletAccountManualGraphExecutionV1:noteDetails,
 });
 unused('accounts/authority/flat-portfolio-authority.mjs',['assertOwnedFlatPortfolio','assertOwnedFlatPortfolioAccount']);
 unused('accounts/authority/flat-account-authority.mjs',['flatAccountManualGraphDetails','assertFlatAccountManualGraphExecution']);
 unused('accounts/storage/flat-journal-catalogue.mjs',['assertOwnedFlatJournalCatalogue','assertOwnedFlatJournalCatalogueAccount']);
 unused('claims/operations/portfolio-view.mjs',['readOriginalNativeClaimPortfolioViewV1']);
 unused('claims/operations/native-claim-asset-units-v1.mjs',['originalNativeClaimAssetUnitsV1']);
 unused('claims/controller/controller.mjs',['assertOriginalDeviceRootClaimIntakeV2','readOriginalDeviceRootClaimIntakeContextV2','readOriginalDeviceRootClaimEconomicSnapshotV2']);
 unused('defi/withdrawals/generation-private-vault-exit.mjs',['generationPrivateVaultExitBinding','assertGenerationPrivateVaultExitSession','generationPrivateVaultExitActionTarget']);
 const sourcePorts=Object.fromEntries(['nativeSourceRecoverySectionIdentityV1','retainOriginalNativeSourceSectionV1','consumeOriginalNativeSourceSectionV1','updateOriginalNativeSourceSectionV1','resumeOriginalNativeSourceSectionV1','nativeSourceRecoveryOwnedProcessV1'].map(name=>[name,no]));
 install('operations/deployments/native-value/native-value-system-v2.mjs',{nativeValueOriginalRecoverySourceV1(){return sourceSHA256;}});
 install('claims/wrapped/recovery/wrapped-recovery-authority-v1.mjs',{
  assertNativeEconomicRecoveryCaptureV1(value){assert.equal(value,authority);return identity;},
  nativeEconomicRecoverySectionIdentityV1(value,part){assert.ok(value===section||recoveries.has(value));assert.equal(part,'session');return identity;},
  consumeNativeEconomicRecoverySectionV1(value,part){assert.equal(part,'session');assert.ok(recoveries.has(value));return recoveries.get(value).record;},
  async retainWrappedPrivateLifetimePartV1(runtime,part,_identity,value){assert.equal(part,'wallet-graph-keeper');const handle=Object.freeze({});lifetime.set(runtime,{handle,privateState:value});return handle;},
  async readWrappedPrivateLifetimePartV1(runtime,part){assert.equal(part,'wallet-graph-keeper');assert.ok(lifetime.has(runtime));return lifetime.get(runtime);},
 });
 install('operations/wallet/wrapped-wallet-composition-v1.mjs',{
  consumeWrappedWalletRecoveryPartV1(value,part){assert.equal(part,'graph-keeper');assert.ok(recoveries.has(value));return recoveries.get(value);},
 });
 install('accounts/storage/durable-generic-account-keeper.mjs',{
  async createDurableGenericAccountKeeperV1(input){assert.ok(keepers.has(input.config));const keeper=keepers.get(input.config);keeperInputs.set(keeper,input);return keeper;},
  async reopenDurableGenericAccountKeeperV1(input,retained){assert.ok(keepers.has(input.config));assert.deepEqual(input.journal,retained.journal);const keeper=keepers.get(input.config);keeperInputs.set(keeper,input);return keeper;},
  async captureDurableGenericAccountKeeperV1(keeper){assert.ok(keeperInputs.has(keeper));keeperCaptures++;await keeper.close();const input=keeperInputs.get(keeper);return{config:input.config,journal:input.journal,checkpoint:{revision:2,stateSHA256:h('keeper-checkpoint')},pendingCheckpoint:null,parentCheckpoint:{revision:2,commitment:h('parent-checkpoint')}};},
 });
 for(const [specifier,names] of [
  ['@lianum/backend/withdrawals/session',['assertOwnedWrappedWithdrawalSessionV1']],
  ['@lianum/backend/claims/session',['assertWalletClaimSession','walletClaimSessionIdentity']],
  ['@lianum/backend/defi/withdrawal',['assertOwnedPrivateVaultExit']],
  ['@lianum/backend/portfolio/erc20',['createHttpErc20Portfolio']],
  ['@lianum/backend/portfolio/http',['createHttpPortfolioRegistry']],
  ['@lianum/backend/portfolio/requests',['normalizePortfolioRequest']],
  ['@lianum/backend/transfers/tron',['assertTronNativeTransferObserver']],
  ['@lianum/backend/transfers/evm',['assertEvmNativeTransferObserver']],
 ])mocks.push(mock.module(specifier,{exports:Object.fromEntries(names.map(name=>[name,no]))}));
 // The full native implementation has per-instance maps; forwarding this
 // exact instance through the mocked composition never fabricates membership.
 const {buildNativeManualSessionV1}=await import('../../../src/api/accounts/native-manual-session-backend-v1.mjs');
 const recovery=lowerModules.get('claims/wrapped/recovery/wrapped-recovery-authority-v1.mjs');
 const native=buildNativeManualSessionV1({account:lowerModules.get('accounts/authority/native-value-account-authority-v2.mjs'),
  economic:{assertNativeEconomicRecoveryCaptureV1:recovery.assertNativeEconomicRecoveryCaptureV1,nativeEconomicRecoverySectionIdentityV1:recovery.nativeEconomicRecoverySectionIdentityV1,
   consumeNativeEconomicRecoverySectionV1:recovery.consumeNativeEconomicRecoverySectionV1,...lowerModules.get('operations/deployments/native-value/native-value-system-v2.mjs')},
  source:sourcePorts,resources:{loadDurableKeeper:()=>import('../../../src/accounts/storage/durable-generic-account-keeper.mjs'),
   loadAccountSession:()=>import('../../../src/api/accounts/flat-account-session.mjs'),loadEconomicState:()=>import('../../../src/accounts/state/original-wallet-economic-state-v1.mjs')}});
 install('operations/recovery/native-original-source-lifecycle-v1.mjs',{...sourcePorts,...native});
 const APIs={...native,...await import('../../../src/api/accounts/flat-manual-graph-session.mjs')};
 const {reopenOriginalWalletEconomicStateAfterCrashV1,originalWalletEconomicStateBindingsV1}=await import('../../../src/accounts/state/original-wallet-economic-state-v1.mjs');
 const {startWalletApplication}=await import('../../../../../apps/wallet/src/server/server.mjs');
 async function family(kind,recovered=null,crashName=null,password='original-observation-private-password'){
  const runtime={},system={claimsEnabled:false},a=asset(h(kind+'-a'),'first'),b=asset(h(kind+'-b'),'second');let phase=recovered?'CONFIRMED':'PREPARED',viewChanged=false;
  const requestId=kind+'_original_request',body={requestId,kind:kind==='native'?'TOP_UP':'GRAPH',ownerOperationRef:h(kind+'-ref'),assetId:a.assetId};
  const journal={path:join(directory,(crashName?.replace(/-restored$/,'')??kind)+'.session.vault'),password};
  const observed=()=>{const one=view(a,10,'10');if(phase==='CONFIRMED')one.requests=[{requestId,kind:body.kind,state:'CONFIRMED',disposition:kind==='native'?'APPLIED':'FULFILLED'}];return one;};
  let account,portfolio;const approval=Object.freeze({}),owner=Object.freeze({});
  if(kind==='native'){
   account={config:{accountId:'native_state_account',journalId:'native_state_journal',lifetime:h('native-state-lifetime'),registry:[a]},registry:[a],features:{nativeManualNoteConsent:true},authority:{},
    ownerActions:{async restoreManualPreparation(){return{async reconcileOriginal(value){assert.equal(value.requestId,requestId);},originalApproval(value){assert.equal(value,requestId);return approval;}};}},
    async privateStatus(){return{operations:phase==='CONFIRMED'?[{request:body,outcome:'APPLIED'}]:[]};},async ownerView(){const out=observed();if(viewChanged)phase='UNKNOWN';return out;}};
   natives.set(account,{runtime,system});
  }else{
   portfolio={config:{accountId:'wrapped_state_account',journalId:'wrapped_state_journal',lifetime:h('wrapped-state-lifetime'),registry:[a,b]},registry:[a,b],authority:{},
    async ownerView(){const one=observed(),two={...view(b,10,'3'),observed:one.observed};if(viewChanged)phase='UNKNOWN';return{version:1,profile:'OWNED_WRAPPED_WALLET_PORTFOLIO_V1',status:'LIVE',coherent:true,observed:one.observed,assets:[one,two],capabilities:{coordinatorRestart:true,keeperRestart:false,crossAssetAtomicConversion:false,privateDeFiComposability:false,fullWalletAcceptance:false}};}};
   wrapped.set(portfolio,{runtime,claimed:false});
  }
  const keeper={async snapshot(){return{version:1,revision:phase==='PREPARED'?1:2,storageAvailable:true,requests:[{requestId,kind:body.kind,assetId:a.assetId,state:phase,errorCode:null}]};},async close(){},async prepare(){effects++;no();},async execute(){effects++;no();},async recover(){effects++;no();},async reconcile(){effects++;no();},async restartCoordinator(){no();}};
  keepers.set((account??portfolio).config,keeper);details.set(approval,{account:account??portfolio,body,review:reviewFixture(kind,body,a,(account??portfolio).config)});
  let joined;
  if(recovered){
   const token=Object.freeze({});
   if(kind==='native'){
    recoveries.set(token,{record:recovered});joined=await APIs.reopenOriginalNativeSessionEconomicRecoveryV1(token,{runtime,system,account,owner});
   }else{
    const input={runtime,portfolio,journal};recoveries.set(token,{input,record:recovered,approvals:[approval]});
    lifetime.set(runtime,{handle:Object.freeze({}),privateState:{config:portfolio.config,journal,checkpoint:recovered.keeper.checkpoint,pendingCheckpoint:recovered.keeper.pendingCheckpoint,parentCheckpoint:recovered.keeper.parentCheckpoint}});
    joined=await APIs.reopenWrappedWalletGraphSessionV1(token);
   }
  }else{
   joined=kind==='native'?await APIs.createNativeValueManualGraphAccountSession({runtime,system,poolIndex:0,account,journal}):await APIs.createWrappedWalletManualGraphSessionV1({runtime,portfolio,journal});
   (kind==='native'?joined.bindManualNote:joined.bindManualGraph)(approval);
  }
  const session=joined.session;live.add(session);
  const economicState=recovered?APIs.readOriginalSessionWalletEconomicStateV1(session):crashName?.endsWith('-restored')?await APIs.reopenOriginalSessionWalletEconomicStateAfterCrashV1(session):await APIs.createOriginalSessionWalletEconomicStateV1(session);
  live.add(economicState);
  return{session,economicState,runtime,system,account,portfolio,journal,body,setPhase(value){phase=value;},changeDuringView(value){viewChanged=value;}};
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
    if(kind==='native'){APIs.fenceOriginalNativeSessionEconomicRecoveryV1(session,authority);record=await APIs.captureOriginalNativeSessionEconomicRecoveryV1(session,section);assert.equal(record.schema,'ORIGINAL_NATIVE_SESSION_WALLET_STATE_RECOVERY_V1');}
    else{APIs.fenceWrappedWalletGraphSessionV1(session);record=await APIs.captureWrappedWalletGraphSessionV1(session);assert.equal(record.schema,'WRAPPED_ORIGINAL_GRAPH_SESSION_ECONOMIC_RECOVERY_V1');}
    assert.throws(()=>economicState.observe(),/CLOSED/);assert.equal(record.economicState.journal.path,original.journal.path+'.economic-state.vault');
    const privateCapture=new Vault(join(directory,kind+'.capture.vault')),key='inert-private-section-password';await privateCapture.create({session:record},key);
    const authenticated=(await new Vault(privateCapture.path).read(key)).data.session;
    if(kind==='wrapped'){
      const altered=structuredClone(authenticated);altered.reviews[0].review.sourceAmount='11';
      await assert.rejects(family(kind,altered),/WALLET_ACCOUNT_ORIGINAL_REVIEWS_CHANGED/);
    }
    const restored=await family(kind,authenticated);t.after(()=>restored.economicState.close());
    output=await restored.economicState.snapshot();assert.equal(output.rows[0].state,'STALE');assert.equal(output.rows[0].balances,null);output=await restored.economicState.observe();assert.equal(output.rows[0].state,'LIVE');
    assert.equal(restored.economicState.checkpoint().lifetime,authenticated.economicState.checkpoint.lifetime);await restored.economicState.close();
    const stateVault=new Vault(authenticated.economicState.journal.path);await stateVault.update(authenticated.economicState.journal.password,authenticated.economicState.checkpoint.revision,data=>({...data,checkpoints:data.checkpoints.map(c=>({...c,stateSHA256:h('unrelated')}))}));
    await assert.rejects(family(kind,authenticated),/ORIGINAL_CHECKPOINT_REQUIRED/);
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
