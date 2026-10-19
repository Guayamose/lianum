/** Actual coordinator method and UI queue; HOST ports cannot sign or send. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import ts from '../node_modules/typescript/lib/typescript.js';
import * as P from '../../../packages/mobile-protocol/src/device-paged-owner-v3.mjs';
import {deviceSepoliaDefiFeedbackV7} from '../src/screens/sepolia-defi-feedback-v7.mjs';
const source=await readFile(new URL('../src/api/device-sepolia-defi-paeg-investment-v8.ts',import.meta.url),'utf8');
const tree=ts.createSourceFile('actor.ts',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TS);let method;
function find(n){if(ts.isPropertyAssignment(n)&&n.name.getText(tree)==='fund')method=n.initializer;ts.forEachChild(n,find);}find(tree);assert.ok(method);
function funding(summary,proofResult={stage:'PROVED'}){const calls=[],jobId='same-original-deposit',prepared={draft:{action:'PROVE_D26',jobId},witness:{HOST:true}};
 const host={serial:fn=>fn(),sourceReady:()=>{},source:{origin:'https://host.invalid',pairingId:'host'},signal:new AbortController().signal,P,status:{HOST:true},need:(ok,code)=>{assert.ok(ok,code);},readSource:async()=>{calls.push('read');return summary;},
  sourceVault:{summary:async()=>summary,effectDraft:async(action,id)=>{calls.push(action);assert.equal(id,jobId);return{action,jobId:id};},prearmDraft:async d=>d,consumeArm:async()=>{},acceptRow:async()=>{},prepareEpochRetry:async(_status,id)=>{assert.equal(id,jobId);calls.push('same-note-reproof');return prepared;},prepareDeposit:async()=>assert.fail('must not allocate another deposit'),resumePreparedDeposit:async()=>assert.fail('must reuse the original job')},
  sourceApi:{challenge:async d=>d,submit:async c=>({jobId:c.jobId,...proofResult})},signDevicePagedOwnerPermissionV3:async()=> 'HOST_NO_REAL_SIGNATURE',approveWalletSessionPagedDepositV1:async()=>{calls.push('approve');return{HOST:true};},bindWalletSessionPagedDepositV1:()=>calls.push('bind'),closeWalletSessionAuthorizationV1:()=>calls.push('close-approval'),fundingEffect:async row=>{assert.equal(row.jobId,jobId);calls.push('fund-same-job');}};
 const code=ts.transpileModule('const fund='+method.getText(tree)+';fund',{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.None}}).outputText;
 return{fund:vm.runInNewContext(code,host),calls};
}
test('a pending funding button observes its original job without another proof, approval or send',async()=>{
 const ui=funding({noteState:'UNKNOWN',pending:{jobId:'same-original-deposit'},jobs:[{jobId:'same-original-deposit',mode:'deposit',stage:'UNKNOWN'}]});
 await ui.fund('1000');assert.deepEqual(ui.calls,['read','OBSERVE_JOB','read']);
});
test('an expired funding proof renews the same note/job with a fresh approval',async()=>{
 const ui=funding({noteState:'UNKNOWN',pending:null,jobs:[{jobId:'same-original-deposit',mode:'deposit',stage:'FAILED',errorCode:P.DEVICE_PAGED_NOTE_EPOCH_REPROOF_V8}]});
 await ui.fund('1000');assert.deepEqual(ui.calls,['read','same-note-reproof','approve','bind','fund-same-job','read','close-approval']);
});
test('expiry during reproof reports the actual failure and closes approval without funding',async()=>{
 const failed={stage:'FAILED',errorCode:P.DEVICE_PAGED_NOTE_EPOCH_REPROOF_V8};
 const ui=funding({noteState:'UNKNOWN',pending:null,jobs:[{jobId:'same-original-deposit',mode:'deposit',...failed}]},failed);
 await assert.rejects(ui.fund('1000'),error=>error.message===P.DEVICE_PAGED_NOTE_EPOCH_REPROOF_V8);
 assert.deepEqual(ui.calls,['read','same-note-reproof','approve','close-approval']);
 const message=deviceSepoliaDefiFeedbackV7(Error(P.DEVICE_PAGED_NOTE_EPOCH_REPROOF_V8));
 assert.match(message,/caducado/);assert.ok(!message.includes('sigue pendiente'));
});
const uiSource=await readFile(new URL('../src/screens/SepoliaDefiInvestmentScreenV8.tsx',import.meta.url),'utf8');
const uiTree=ts.createSourceFile('screen.tsx',uiSource,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX),functions=[];
function uiFind(n){if(ts.isFunctionDeclaration(n)&&['run','quietRefresh'].includes(n.name?.text))functions.push(n.getText(uiTree));ts.forEachChild(n,uiFind);}uiFind(uiTree);assert.equal(functions.length,2);
test('background DeFi observation leaves global controls free; a manual action waits for that observation',async()=>{
 let release,manualCalls=0;const pending=new Promise(resolve=>release=resolve),busy=[];
 const host={observationWork:{current:null},running:{current:false},childBusy:{current:false},generation:{current:1},controller:{current:{signal:new AbortController().signal}},active:true,
  refresh:()=>pending,current:token=>assert.equal(token,1),reportFailure:()=>{},deviceSepoliaDefiFeedbackV7:()=>'',setFailed:()=>{},setNotice:()=>{},setBusy:()=>{},callbacks:{current:{onBusyChange:value=>busy.push(value)}}};
 const code=ts.transpileModule(functions.join('\n')+'\n({run,quietRefresh})',{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.None}}).outputText,ui=vm.runInNewContext(code,host);
 const reading=ui.quietRefresh({HOST:true});assert.deepEqual(busy,[]);
 const action=ui.run(async()=>manualCalls++);await Promise.resolve();assert.equal(manualCalls,0);assert.deepEqual(busy,[true]);
 release();await reading;await action;assert.equal(manualCalls,1);assert.deepEqual(busy,[true,false]);assert.equal(host.observationWork.current,null);
});
