import { inspectWrappedInstallationSourcesV2 } from '@lianum/components/verification/wrapped-installation';
/** CLOSED, source-only original wrapped wallet acceptance composition.
 * One SOL custody identity and the original two-pool GRAPH account pair share
 * one listener/SDK. This helper owns neither runtimes nor original owner keys.
 * Native custody and GRAPH key authority remain separate original release prerequisites. */
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import {isDeepStrictEqual as privateSameV1} from 'node:util';
import {assertWrappedWalletCompositionReleaseV1 as released} from '../../claims/wrapped/recovery/wrapped-composition-release-v1.mjs';
export {WRAPPED_WALLET_ACCEPTANCE_RELEASE_V1,WRAPPED_WALLET_PAYOUT_V4_CONTRACT_RELEASE_V1} from '../../claims/wrapped/recovery/wrapped-composition-release-v1.mjs';
const fresh = () => randomBytes(32).toString('hex');
const originalWalletLifetimesV1=new WeakMap();
/** The fixed supervisor, not this helper, must own original runtime startup,
 * resource budgets, retained attempts and terminal cleanup. No factory seam. */
/** Original owners and the original controller are prepared by the fixed
 * bootstrap. The SOL owner handoff must already contain its actual D27 proof.
 * No public callback, signer, key, observer, endpoint or proof loader accepted. */
// Acceptance over the same original SDK read. This is data evidence only;
// it performs no extra read, grants no capability and never supplies balances.
function assertWrappedOpeningStateV1(state,assets){
 assert.equal(state.connection,'CONNECTED','WRAPPED_ACCEPTANCE_OPENING_CONNECTION');
 for(const section of ['account','portfolio','nativeClaims','wrappedWithdrawals'])assert.equal(state.errors[section],null,'WRAPPED_ACCEPTANCE_OPENING_SECTION_UNAVAILABLE');
 const snapshot=state.account?.snapshot,portfolio=state.portfolio;
 assert.ok(snapshot?.phase==='READY'&&snapshot.available===true&&snapshot.storageAvailable===true&&snapshot.observation==='CURRENT'&&snapshot.busy===false&&snapshot.queued===0,'WRAPPED_ACCEPTANCE_OPENING_JOURNAL');
 assert.equal(portfolio?.profile,'OWNED_WRAPPED_WALLET_PORTFOLIO_V1','WRAPPED_ACCEPTANCE_OPENING_PORTFOLIO');
 assert.ok(portfolio.status==='LIVE'&&portfolio.coherent===true&&portfolio.observed,'WRAPPED_ACCEPTANCE_OPENING_CURRENT_PORTFOLIO');
 assert.equal(assets.length,2);assert.equal(portfolio.assets.length,2);assert.notEqual(assets[0].assetId,assets[1].assetId);
 const head=portfolio.observed;
 for(const key of ['blockNumber','timestamp'])assert.ok(typeof head[key]==='string'&&/^(0|[1-9][0-9]{0,77})$/.exec(head[key])?.[0]===head[key]&&BigInt(head[key])<(1n<<256n),'WRAPPED_ACCEPTANCE_OPENING_HEAD');
 assert.ok(typeof head.blockHash==='string'&&/^[0-9a-f]{64}$/.exec(head.blockHash)?.[0]===head.blockHash,'WRAPPED_ACCEPTANCE_OPENING_HEAD');
 const rows=portfolio.assets.map((row,i)=>{
  assert.equal(row.status,'LIVE','WRAPPED_ACCEPTANCE_OPENING_ASSET_UNAVAILABLE');
  assert.deepEqual(row.asset,{assetId:assets[i].assetId,symbol:assets[i].symbol,decimals:assets[i].decimals},'WRAPPED_ACCEPTANCE_OPENING_ORIGINAL_ASSET');
  for(const key of ['blockNumber','blockHash','timestamp'])assert.equal(row.observed?.[key],head[key],'WRAPPED_ACCEPTANCE_OPENING_ASSET_HEAD');
  assert.deepEqual(Object.keys(row.balances??{}).sort(),['available','locked','recovery','reserved'],'WRAPPED_ACCEPTANCE_OPENING_BALANCE_CATEGORIES');
  for(const amount of Object.values(row.balances))assert.ok(typeof amount==='string'&&/^(0|[1-9][0-9]{0,77})$/.exec(amount)?.[0]===amount&&BigInt(amount)<(1n<<256n),'WRAPPED_ACCEPTANCE_OPENING_BALANCE');
  return {assetId:row.asset.assetId,symbol:row.asset.symbol,decimals:row.asset.decimals,balances:{...row.balances}};
 });
 return {profile:'ORIGINAL_WRAPPED_WALLET_OPENING_STATE_V1',via:'ORIGINAL_OWNER_NODE_SDK_SAME_STATE_READ',coherent:true,
  observed:{blockNumber:head.blockNumber,blockHash:head.blockHash,timestamp:head.timestamp},assets:rows};
}
export async function createWrappedWalletAcceptanceV1(input) {assert.equal(arguments.length,1);return walletAcceptanceV1(input,null);}
async function walletAcceptanceV1(input,recovery){
  released();
  const { exactRecord, fixedArray } = await import('@lianum/components/encoding/commitments');
  exactRecord(input, ['runtime','system','owners','controller','handoff','journal','deadlineMs']);
  exactRecord(input.journal, ['path','password']); fixedArray(input.owners, 2);
  const {runtime,system,controller,handoff,deadlineMs} = input, owners=[...input.owners];
  assert.ok(Number.isSafeInteger(deadlineMs) && deadlineMs > Date.now());
  const { assertOwnedWrappedClaimWalletSystemV1 } = await import('../deployments/wrapped/wrapped-claim-system-v1.mjs');
  const { assertOwnedWrappedClaimOwnerProcessV1, assertOwnedWrappedClaimIngressHandoffV1 } = await import('../../custody/processes/wrapped-claim-owner-process-v1.mjs');
  const { ownedWrappedNativeClaimControllerBindingsV1 } = await import('../../claims/wrapped/controller/wrapped-controller-v1.mjs');
  const { claimDomainCommitment } = await import('@lianum/engine/claims/framing');
  assertOwnedWrappedClaimWalletSystemV1(runtime,system);
  owners.forEach((owner,poolIndex)=>assertOwnedWrappedClaimOwnerProcessV1(owner,{runtime,system,poolIndex}));
  assert.notEqual(owners[0],owners[1]);
  const binding=ownedWrappedNativeClaimControllerBindingsV1(controller);
  assert.equal(binding.runtime,runtime);assert.equal(binding.claims,system.claims);
  assert.equal(system.claims.configs[0].nativeFamily,'1');assert.equal(system.claims.configs[1].nativeFamily,'2');
  const domain=claimDomainCommitment(system.claims.configs[1]), scope=await owners[1].publicView.summary();
  assert.equal(scope.closed,false);
  if(!recovery)assertOwnedWrappedClaimIngressHandoffV1(handoff,{claimDomain:domain,ownerIdentitySHA256:scope.identitySHA256});
  const { createWrappedWalletExecutionV1,reopenWrappedWalletExecutionFromRecoveryV1,wrappedWalletExecutionPrivateInitializationV1 } = await import('../../execution/wrapped/execution/wrapped-wallet-execution-v1.mjs');
  const { createWrappedWalletAccountAuthorityV1,reopenWrappedWalletAccountFromRecoveryV1,wrappedWalletAccountPrivateInitializationV1,recoveredWrappedWalletManualGraphApprovalsV1 } = await import('../../accounts/authority/wrapped-wallet-account-authority-v1.mjs');
  const { createWrappedWalletPortfolioAuthorityV1 } = await import('../../accounts/portfolio/wrapped-wallet-portfolio-v1.mjs');
  const { createWrappedWalletManualGraphSessionV1,reopenWrappedWalletGraphSessionV1 } = await import('../../api/wallet/wrapped-wallet-session-v1.mjs');
  const { createWrappedClaimSessionV1, wrappedClaimSessionControllerV1 } = await import('../../api/claims/wrapped/wrapped-claim-session-v1.mjs');
  const { createWrappedWithdrawalSessionV1,reopenWrappedWithdrawalSessionFromRecoveryV1 } = await import('../../api/withdrawals/wrapped-withdrawal-session-v1.mjs');
  const {createOriginalSessionWalletEconomicStateV1,readOriginalSessionWalletEconomicStateV1}=await import('../../api/accounts/flat-manual-graph-session.mjs');
  const { startWalletApplication } = await import('../../api/wallet/http-service.mjs');
  const { createOwnedWalletFlowClientV1 } = await import('../../api/wallet/owned-flow-client.mjs');
  const { createWalletApplicationClient } = await import('../../api/wallet/wallet-application-client.mjs');
  const { ACTIONS } = await import('@lianum/mobile-protocol/wallet/client');
  const accounts=[],executions=[];let portfolio,joined,claimSession,withdrawalSession,app,driver,closed=false,busy=false,closing;
  const claimEvidence=recovery?structuredClone(recovery.record.claimEvidence):[];
  const ids=recovery?structuredClone(recovery.record.ids):{accounts:[0,1].map(()=>({accountId:fresh(),journalId:fresh()})),portfolio:{accountId:fresh(),journalId:fresh()},claimAccountId:fresh()};
  const withdrawalJournal=recovery?{...recovery.record.withdrawal.record.journal}:{path:input.journal.path+'.wrapped-withdrawals',password:fresh()};
  const privateLifetime=await walletPrivateLifetimeV1(input.journal,{runtime,system,scope},recovery?.record.lifetime??null,{ids,journal:{...input.journal},withdrawalJournal,accounts:[],executions:[]});
  const reopenedProviders=recovery?.providers??[],reopenedRecipient=recovery?.recipient??null;
  const restoreProviderRows=rows=>rows.map(({reference,providers})=>({reference,providers:providers.map(row=>{const {providerId,...metadata}=row;assert.ok(reopenedProviders[providerId]);return {...metadata,custody:reopenedProviders[providerId]};})}));
  async function closeOwned() {
    const failures=[];
    const close=async work=>{try{await work();}catch(error){failures.push(error);}};
    await close(()=>app?.close());await close(()=>withdrawalSession?.close());await close(()=>claimSession?.close());await close(()=>joined?.session.close());
    await close(()=>portfolio?.close());await close(()=>privateLifetime.close());
    for(const account of accounts)await close(()=>account.close());
    for(const execution of executions)await close(()=>execution.close());
    if(recovery){await close(()=>reopenedRecipient?.close());for(const provider of reopenedProviders)if(!provider.report().closed)await close(()=>provider.close());}
    if(failures.length)throw new AggregateError(failures,'WRAPPED_ACCEPTANCE_CLEANUP_INCOMPLETE');
  }
  const remaining=()=>{inspectWrappedInstallationSourcesV2();assert.equal(closed,false,'WRAPPED_ACCEPTANCE_CLOSED');const ms=deadlineMs-Date.now();assert.ok(ms>0,'WRAPPED_ACCEPTANCE_ORIGINAL_DEADLINE');return Math.min(ms,2147483647);};
  try {
    for(let poolIndex=0;poolIndex<2;poolIndex++) {
      const executionInput={runtime,system,poolIndex,quorum:system.quorum};let nativeExecution;
      if(recovery){const saved=recovery.record.executions[poolIndex],adapters=[];
        const providerModule=await import('../../chains/shared/dispatch/wrapped-claim-dispatch-owner-v1.mjs');
        for(const adapter of saved.record.adapters){const selected=saved.providers.flatMap(row=>row.providers.map(provider=>({...provider,reference:row.reference}))).find(row=>adapter.key===row.reference+':'+row.slot);assert.ok(selected);
          const dispatchLease=await withWrappedWalletRecoveryPartV1('provider-lease',{custody:reopenedProviders[selected.providerId]},token=>providerModule.takeRecoveredNativeValueProviderLeaseV1(token));adapters.push({...adapter,dispatchLease});}
        nativeExecution=await withWrappedWalletRecoveryPartV1('execution',{input:executionInput,record:saved.record,providers:restoreProviderRows(saved.providers),adapters},token=>reopenWrappedWalletExecutionFromRecoveryV1(token),value=>value.close());
      }else nativeExecution=await createWrappedWalletExecutionV1(executionInput);
      executions.push(nativeExecution);
      const accountInput={runtime,system,poolIndex,owner:owners[poolIndex],nativeExecution,...ids.accounts[poolIndex]};
      accounts.push(recovery?await withWrappedWalletRecoveryPartV1('account',{input:accountInput,record:recovery.record.accounts[poolIndex].record,providers:restoreProviderRows(recovery.record.accounts[poolIndex].providers)},token=>reopenWrappedWalletAccountFromRecoveryV1(token),value=>value.close()):await createWrappedWalletAccountAuthorityV1(accountInput));
    }
    const withdrawalInput={runtime,system,owner:owners[1],account:accounts[1],journal:withdrawalJournal};
    withdrawalSession=recovery?await withWrappedWalletRecoveryPartV1('withdrawal',{input:withdrawalInput,record:recovery.record.withdrawal.record,recipient:reopenedRecipient},token=>reopenWrappedWithdrawalSessionFromRecoveryV1(token),value=>value.close()):await createWrappedWithdrawalSessionV1(withdrawalInput);
    portfolio=createWrappedWalletPortfolioAuthorityV1({runtime,system,accounts:accounts.map((account,poolIndex)=>({poolIndex,account})),...ids.portfolio});
    const graphInput={runtime,portfolio,journal:{...input.journal}};
    joined=recovery?await withWrappedWalletRecoveryPartV1('graph-keeper',{input:graphInput,record:recovery.record.graph,approvals:accounts.flatMap(account=>recoveredWrappedWalletManualGraphApprovalsV1(account))},token=>reopenWrappedWalletGraphSessionV1(token),value=>value.session.close()):await createWrappedWalletManualGraphSessionV1(graphInput);
    if(!recovery)await privateLifetime.retainInitialization({accounts:accounts.map(wrappedWalletAccountPrivateInitializationV1),executions:executions.map(wrappedWalletExecutionPrivateInitializationV1)});
    const prepared=recovery?structuredClone(recovery.record.prepared):await controller.prepare({handoff});
    claimSession=await createWrappedClaimSessionV1({controller,accountId:ids.claimAccountId,ownerIdentitySHA256:scope.identitySHA256,claimDomain:domain,caller:runtime.accounts[4]});
    const economicState=readOriginalSessionWalletEconomicStateV1(joined.session)??await createOriginalSessionWalletEconomicStateV1(joined.session);
    inspectWrappedInstallationSourcesV2();app=await startWalletApplication({accountSession:joined.session,economicState,nativeClaimSession:claimSession,wrappedWithdrawalSession:withdrawalSession,actionAccessMode:'exact-only',port:0});
    driver=createOwnedWalletFlowClientV1(app,{deadlineMs});
    const initial=await driver.state();assert.ok(initial.account && initial.nativeClaims);
    const opening=assertWrappedOpeningStateV1(initial,accounts.map(account=>account.registry[0]));
    assert.equal(initial.nativeClaims.identity.claimDomain,domain);assert.equal(initial.nativeClaims.identity.nativeFamily,'2');
    async function exclusive(work){assert.ok(!closed&&!busy,'WRAPPED_ACCEPTANCE_BUSY_OR_CLOSED');remaining();busy=true;try{return await work();}finally{busy=false;}}
    const wallet=Object.freeze({
      bindOriginalRecipient:value=>exclusive(()=>withdrawalSession.bindOriginalRecipient(value)),
      withdrawalOffers:()=>exclusive(async()=>{const state=await driver.state();assert.equal(state.errors.wrappedWithdrawals,null);return structuredClone(state.wrappedWithdrawals.owner.offers);}),
      cancelWithdrawalReview:body=>exclusive(async()=>{const action='wrappedWithdrawPrepare',access=app.issueActionCapability({action,body});
        const sdk=createWalletApplicationClient({origin:app.origin,ownerToken:app.ownerAccess.token,actionToken:access.token});assert.equal(await sdk.refresh(),true);sdk.review(action,body);sdk.cancelReview();assert.deepEqual(app.revokeActionCapability(access),{revoked:true});
        assert.equal(await sdk.confirm(),false);return {cancelled:true,sent:false};}),
      withdraw:(method,body)=>exclusive(async()=>{
        assert.ok(['prepare','execute','reconcile','reapprove','cancel'].includes(method));body=structuredClone(body);const action='wrappedWithdraw'+method[0].toUpperCase()+method.slice(1);
        const access=app.issueActionCapability({action,body}),sdk=createWalletApplicationClient({origin:app.origin,ownerToken:app.ownerAccess.token,actionToken:access.token});
        assert.equal(await sdk.refresh(),true);const review=sdk.review(action,body);assert.deepEqual(review.body,body);assert.ok(review.wrappedWithdrawalContext);
        assert.equal(await sdk.confirm(),true,'WRAPPED_ACCEPTANCE_WITHDRAWAL_OUTCOME_UNKNOWN');remaining();
        const response=await fetch(app.origin+'/api/wallet/wrapped-withdrawal/'+method,{method:'POST',redirect:'error',signal:AbortSignal.timeout(remaining()),
          headers:{Origin:app.origin,'Content-Type':'application/json','x-wallet-action-token':access.token},body:JSON.stringify(body)});
        assert.equal(response.status,403);assert.equal((await response.json()).error,'WALLET_ACTION_ACCESS_REQUIRED');
        for(;;){const state=await driver.state();remaining();const snapshot=state.wrappedWithdrawals?.snapshot;
          assert.ok(snapshot?.storageAvailable&&snapshot.phase==='READY','WRAPPED_ACCEPTANCE_WITHDRAWAL_UNAVAILABLE');
          const row=snapshot.operations.find(row=>row.requestId===body.requestId);assert.ok(row);assert.equal(row.termsSHA256,body.termsSHA256);
          if(row.state==='UNKNOWN')throw new Error('WRAPPED_ACCEPTANCE_WITHDRAWAL_ORIGINAL_RECONCILIATION_REQUIRED');
          if(row.state===(['prepare','reapprove'].includes(method)?'PREPARED':method==='cancel'?'CANCELLED':'CONFIRMED')&&!snapshot.busy&&snapshot.queued===0){
            const evidence={action,requestId:body.requestId,termsSHA256:body.termsSHA256,role:row.role,state:row.state,originalAuthorityKind:row.terms.actor.kind,
              exactOneUseReplayRejected:true,via:'ORIGINAL_WRAPPED_WITHDRAWAL_NODE_SDK_EXACT_ONLY_HTTP'};claimEvidence.push(evidence);return structuredClone(evidence);}
          await new Promise(resolve=>setTimeout(resolve,Math.min(500,remaining())));
        }
      }),
      accounts:Object.freeze(accounts),executions:Object.freeze(executions),session:joined.session,prepared:Object.freeze(structuredClone(prepared)),
      bindManualGraph:approval=>{assert.ok(!closed&&!busy);return joined.bindManualGraph(approval);},
      graph:(method,body)=>exclusive(()=>driver.account(method,body)),
      /** Each invocation is an explicit scripted acceptance approval. An original
       * resume is separate; there is no auto-retry, alternate identity or send. */
      claim:(action,body)=>exclusive(async()=>{
        assert.ok(['deposit','redeem','refund','reconcile','resume'].includes(action));body=structuredClone(body);
        const access=app.issueActionCapability({action,body});
        const sdk=createWalletApplicationClient({origin:app.origin,ownerToken:app.ownerAccess.token,actionToken:access.token});
        assert.equal(await sdk.refresh(),true);remaining();
        assert.equal(sdk.getState().data.nativeClaims.identity.claimDomain,domain);
        const review=sdk.review(action,body);assert.deepEqual(review.body,body);
        assert.equal(await sdk.confirm(),true,'WRAPPED_ACCEPTANCE_ORIGINAL_OUTCOME_UNKNOWN');remaining();
        const outcome=sdk.getState().outcome;assert.equal(outcome.state,'ADMITTED');assert.equal(outcome.requestId,body.requestId);
        const replay=await fetch(app.origin+ACTIONS[action].route,{method:'POST',redirect:'error',signal:AbortSignal.timeout(remaining()),
          headers:{Origin:app.origin,'Content-Type':'application/json','x-wallet-action-token':access.token},body:JSON.stringify(body)});
        assert.equal(replay.status,403);assert.equal((await replay.json()).error,'WALLET_ACTION_ACCESS_REQUIRED');
        for(;;){
          const state=await driver.state(),snapshot=state.nativeClaims?.snapshot;remaining();
          assert.equal(state.nativeClaims.identity.claimDomain,domain);
          assert.ok(snapshot?.storageAvailable && snapshot.phase==='READY','WRAPPED_ACCEPTANCE_CLAIM_JOURNAL_UNAVAILABLE');
          const rows=snapshot.requests.filter(row=>row.requestId===body.requestId);assert.equal(rows.length,1);
          const row=rows[0];
          if(['FAILED','RECONCILIATION_REQUIRED'].includes(row.state)&&!snapshot.busy&&snapshot.queued===0)throw Object.assign(new Error('WRAPPED_ACCEPTANCE_EXPLICIT_ORIGINAL_RECONCILIATION_REQUIRED'),{claimRequest:structuredClone(row)});
          if(row.state==='CONFIRMED'&&!snapshot.busy&&snapshot.queued===0){
            const record={action,requestId:body.requestId,claimDomain:domain,via:'ORIGINAL_WRAPPED_SESSION_NODE_SDK_EXACT_ONLY_HTTP',
              exactOneUseReplayRejected:true,durableOriginalRequestState:row.state,fullEconomicClosureEstablished:false};
            claimEvidence.push(record);return structuredClone(record);
          }
          await new Promise(resolve=>setTimeout(resolve,Math.min(500,remaining())));
        }
      }),
      /** Full reciprocal inventory audit is original production code and covers
       * both custody domains and all retained graph inventories at one head. */
      audit:()=>exclusive(async()=>{const audit=await system.quorum.audit({poolIndex:1});
        assert.equal(audit.classification,'ORIGINAL_WRAPPED_RECIPROCAL_FULL_INVENTORY_AUDIT_V1');assert.equal(audit.signed,false);return audit;}),
      // Private lifecycle handoff only. The session keeps the exact original
      // controller replacement after same-keeper restart, also after close.
      originalController(){assert.equal(arguments.length,0,'WRAPPED_ACCEPTANCE_CONTROLLER_NO_OPTIONS');return wrappedClaimSessionControllerV1(claimSession);},
      claimStatus:()=>exclusive(()=>claimSession.ownerView()),
      evidence:()=>({graph:driver.evidence(),claims:structuredClone(claimEvidence),opening:structuredClone(opening),oneSharedListener:true,fullEconomicClosureEstablished:false}),
      close(){closed=true;closing??=closeOwned();return closing;},
    });
    originalWalletLifetimesV1.set(wallet,{resources(){assert.ok(recovery&&!closed,'WRAPPED_WALLET_RECOVERED_RESOURCES_REQUIRED');return Object.freeze({providers:Object.freeze([...reopenedProviders]),recipient:reopenedRecipient});},async capture(attemptAuthority){
      assert.ok(!closed&&!busy,'WRAPPED_ACCEPTANCE_BUSY_OR_CLOSED');closed=true;const appClosing=app.close(),claimClosing=claimSession.close();appClosing.catch(()=>{});claimClosing.catch(()=>{});
      const accountModule=await import('../../accounts/authority/wrapped-wallet-account-authority-v1.mjs'),executionModule=await import('../../execution/wrapped/execution/wrapped-wallet-execution-v1.mjs');
      const graphModule=await import('../../api/wallet/wrapped-wallet-session-v1.mjs'),withdrawalModule=await import('../../api/withdrawals/wrapped-withdrawal-session-v1.mjs');
      const providerModule=await import('../../chains/shared/dispatch/wrapped-claim-dispatch-owner-v1.mjs'),recipientModule=await import('../../execution/native/recipients/native-recipient-process.mjs');
      const providerHandles=[],providerIds=new Map(),fencedProviders=new Set();let recipientHandle=null;
      const mapProviders=rows=>rows.map(({reference,providers})=>({reference,providers:providers.map(({custody,...metadata})=>{if(!providerIds.has(custody)){providerIds.set(custody,providerHandles.length);providerHandles.push(custody);}return {...metadata,providerId:providerIds.get(custody)};})}));
      try{
        graphModule.fenceWrappedWalletGraphSessionV1(joined.session);
        const initialAccounts=accounts.map(account=>accountModule.fenceWrappedWalletAccountRecoveryV1(account));
        const initialExecutions=executions.map(execution=>executionModule.fenceWrappedWalletExecutionRecoveryV1(execution));
        recipientHandle=withdrawalModule.fenceWrappedWithdrawalSessionRecoveryV1(withdrawalSession);
        initialAccounts.forEach(mapProviders);initialExecutions.forEach(mapProviders);
        for(const provider of providerHandles){providerModule.fenceOwnedNativeValueProviderRecoveryV1(provider);fencedProviders.add(provider);}
        if(recipientHandle)recipientModule.fenceNativeRecipientRecoveryV1(recipientHandle);
        await appClosing;await claimClosing;
        const graph=await graphModule.captureWrappedWalletGraphSessionV1(joined.session);
        const withdrawal=await withdrawalModule.captureWrappedWithdrawalSessionForReopenV1(withdrawalSession);recipientHandle=withdrawal.recipient;
        const capturedAccounts=[],capturedExecutions=[];
        for(const account of accounts){const captured=await accountModule.captureWrappedWalletAccountForReopenV1(account);capturedAccounts.push({record:captured.record,providers:mapProviders(captured.providers)});}
        for(const execution of executions){const captured=await executionModule.captureWrappedWalletExecutionForReopenV1(execution);capturedExecutions.push({record:captured.record,providers:mapProviders(captured.providers)});}
        const providers=[];for(const provider of providerHandles)providers.push(await providerModule.captureOwnedNativeValueProviderRecoveryV1(provider));
        const recipient=recipientHandle?await recipientModule.captureNativeRecipientRecoveryV1(recipientHandle):null;
        const record={schema:'WRAPPED_ORIGINAL_WHOLE_WALLET_RECOVERY_V1',ids,journal:{...input.journal},prepared:structuredClone(prepared),claimEvidence:structuredClone(claimEvidence),
          lifetime:await privateLifetime.checkpoint(),accounts:capturedAccounts,executions:capturedExecutions,graph,withdrawal:{record:withdrawal.record},providers,recipient};
        const {retainOriginalWrappedRecoverySectionV1}=await import('../../claims/wrapped/recovery/wrapped-recovery-authority-v1.mjs');
        await retainOriginalWrappedRecoverySectionV1(attemptAuthority,'wallet',record);
        await withdrawalModule.stopCapturedWrappedWithdrawalSessionV1(withdrawalSession);
        for(const account of accounts)await accountModule.stopCapturedWrappedWalletAccountV1(account);
        for(const execution of executions)await executionModule.stopCapturedWrappedWalletExecutionV1(execution);
        for(const provider of providerHandles)await providerModule.stopCapturedNativeValueProviderRecoveryV1(provider);
        if(recipientHandle)await recipientModule.stopCapturedNativeRecipientRecoveryV1(recipientHandle);
        portfolio.close();privateLifetime.close();return {retained:true,originalResourcesStopped:true};
      }catch(error){const failures=[];const aborts=await Promise.allSettled([...accounts.map(account=>account.abort()),...executions.map(execution=>execution.abort())]);failures.push(...aborts.filter(row=>row.status==='rejected').map(row=>row.reason));try{await closeOwned();}catch(cleanup){failures.push(cleanup);}for(const provider of providerHandles)try{if(!provider.report().closed){if(fencedProviders.has(provider))await providerModule.abortOwnedNativeValueProviderRecoveryV1(provider);else await provider.close();}}catch(cleanup){failures.push(cleanup);}if(recipientHandle)try{await recipientHandle.close();}catch(cleanup){failures.push(cleanup);}if(failures.length)throw new AggregateError([error,...failures],'WRAPPED_WALLET_CAPTURE_CLEANUP_FAILED',{cause:error});throw error;}
    }});
    return wallet;
  } catch(error) {closed=true;try{await closeOwned();}catch(cleanup){throw new AggregateError([error,cleanup],'WRAPPED_ACCEPTANCE_CONSTRUCTION_AND_CLEANUP_FAILED');}throw error;}
}

// Private cold-recovery parts are one-use capabilities, never data supplied by
// HTTP, an SDK caller, or a page. Only this fixed composition can mint them.
const walletRecoveryPartsV1=new WeakMap();
export function consumeWrappedWalletRecoveryPartV1(token,part){
 assert.equal(arguments.length,2);const entry=walletRecoveryPartsV1.get(token);
 assert.ok(entry&&entry.part===part&&!entry.used&&entry.active,'WRAPPED_WALLET_ORIGINAL_RECOVERY_PART_REQUIRED');entry.used=true;return entry.value;
}
async function withWrappedWalletRecoveryPartV1(part,value,work,cleanup){
 const token=Object.freeze(Object.create(null)),entry={part,value,used:false,active:true};walletRecoveryPartsV1.set(token,entry);let result,returned=false;
 try{result=await work(token);returned=true;assert.equal(entry.used,true,'WRAPPED_WALLET_RECOVERY_PART_UNUSED');return result;}
 catch(error){if(returned&&cleanup)await cleanup(result);throw error;}
 finally{entry.active=false;entry.value=null;walletRecoveryPartsV1.delete(token);}
}

async function walletPrivateLifetimeV1(journal,context,retained,seed){
 const {retainWrappedPrivateLifetimePartV1,readWrappedPrivateLifetimePartV1,updateWrappedPrivateLifetimePartV1}=await import('../../claims/wrapped/recovery/wrapped-recovery-authority-v1.mjs');
 const identity={profile:'WRAPPED_WALLET_PRIVATE_LIFETIME_V1',genesis:context.runtime.metadata.evmGenesis,hub:context.system.hub.address,ownerIdentitySHA256:context.scope.identitySHA256};
 let handle,state,version;
 if(retained){assert.equal(retained.profile,'WRAPPED_WALLET_SHARED_LIFETIME_PART_V1');assert.deepEqual(retained.identity,identity);const original=await readWrappedPrivateLifetimePartV1(context.runtime,'wallet',identity);assert.equal(original.version,retained.version);for(const key of ['ids','journal','withdrawalJournal'])assert.ok(privateSameV1(original.privateState[key],seed[key]),'WRAPPED_WALLET_ORIGINAL_INITIALIZATION_CHANGED');handle=original.handle;state=original.privateState;version=original.version;}
 else{handle=await retainWrappedPrivateLifetimePartV1(context.runtime,'wallet',identity,seed);state=structuredClone(seed);version=1;}
 return {async retainInitialization(value){const next={...state,...structuredClone(value)},result=await updateWrappedPrivateLifetimePartV1(handle,next);state=next;version=result.version;},
  async checkpoint(){const original=await readWrappedPrivateLifetimePartV1(context.runtime,'wallet',identity);assert.equal(original.version,version);assert.ok(privateSameV1(original.privateState,state),'WRAPPED_WALLET_ORIGINAL_INITIALIZATION_CHANGED');return {profile:'WRAPPED_WALLET_SHARED_LIFETIME_PART_V1',identity,version};},close(){return {closed:true,sharedRegistryRetained:true};}};
}

export async function retainWrappedWalletForReopenV1(wallet,attemptAuthority){assert.equal(arguments.length,2);const state=originalWalletLifetimesV1.get(wallet);assert.ok(state,'WRAPPED_WALLET_ORIGINAL_LIFETIME_REQUIRED');return state.capture(attemptAuthority);}
export async function reopenWrappedWalletAcceptanceV1(input){
 const {exactRecord}=await import('@lianum/components/encoding/commitments');
 exactRecord(input,['runtime','system','owners','controller','bootstrap','nativeRuntimes','deadlineMs','attemptAuthority']);
 const {consumeOriginalWrappedRecoverySectionV1}=await import('../../claims/wrapped/recovery/wrapped-recovery-authority-v1.mjs');
 const record=consumeOriginalWrappedRecoverySectionV1(input.attemptAuthority,'wallet');
 exactRecord(record,['schema','ids','journal','prepared','claimEvidence','lifetime','accounts','executions','graph','withdrawal','providers','recipient']);assert.equal(record.schema,'WRAPPED_ORIGINAL_WHOLE_WALLET_RECOVERY_V1');
 assert.ok(record.accounts.length===2&&record.executions.length===2&&Array.isArray(record.providers));
 const providerModule=await import('../../chains/shared/dispatch/wrapped-claim-dispatch-owner-v1.mjs'),recipientModule=await import('../../execution/native/recipients/native-recipient-process.mjs');
 const providers=[];let recipient=null;
 try{
  for(const saved of record.providers){const matches=input.nativeRuntimes.filter(runtime=>saved.nativeIdentity.family==='3'?runtime.metadata.evmGenesis==='0x'+saved.nativeIdentity.genesis&&runtime.metadata.chainId===saved.nativeIdentity.chainId:runtime.metadata.genesis===saved.nativeIdentity.genesis);assert.equal(matches.length,1,'WRAPPED_WALLET_ORIGINAL_NATIVE_PROVIDER_RUNTIME');
   providers.push(await withWrappedWalletRecoveryPartV1('provider',{runtime:input.runtime,system:input.system,poolIndex:saved.input.poolIndex,nativeRuntime:matches[0],bootstrap:input.bootstrap,record:saved},token=>providerModule.reopenOwnedNativeValueProviderRecoveryV1(token),value=>value.close()));}
  if(record.recipient)recipient=await withWrappedWalletRecoveryPartV1('recipient',{runtime:input.runtime,record:record.recipient},token=>recipientModule.reopenNativeRecipientRecoveryV1(token),value=>value.close());
  return await walletAcceptanceV1({runtime:input.runtime,system:input.system,owners:input.owners,controller:input.controller,handoff:null,journal:record.journal,deadlineMs:input.deadlineMs},{record,providers,recipient});
 }catch(error){const failures=[];if(recipient)try{await recipient.close();}catch(cleanup){failures.push(cleanup);}for(const provider of providers)try{if(!provider.report().closed)await provider.close();}catch(cleanup){failures.push(cleanup);}if(failures.length)throw new AggregateError([error,...failures],'WRAPPED_WALLET_REOPEN_CLEANUP_FAILED',{cause:error});throw error;}
}

export function ownedWrappedWalletRecoveryResourcesV1(wallet){assert.equal(arguments.length,1);const state=originalWalletLifetimesV1.get(wallet);assert.ok(state,"WRAPPED_WALLET_ORIGINAL_LIFETIME_REQUIRED");return state.resources();}


export {createWrappedWalletAcceptanceSystemV1,consumeWrappedSystemRecoveryPartV1,retainWrappedWalletSystemForReopenV1,reopenWrappedWalletAcceptanceSystemV1} from '../../claims/wrapped/recovery/wrapped-recovery-authority-v1.mjs';
