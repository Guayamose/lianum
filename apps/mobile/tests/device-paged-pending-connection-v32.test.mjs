/** Actual screen connection continuation; HOST custody/transport, no financial effects. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import ts from '../node_modules/typescript/lib/typescript.js';
const source=await readFile(new URL('../src/screens/DevicePagedGraphScreen.tsx',import.meta.url),'utf8'),tree=ts.createSourceFile('screen.tsx',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);let action,refresh,automatic;
function visit(n){if(ts.isFunctionDeclaration(n)&&n.name?.text==='restoreSavedConnection')action=n;if(ts.isFunctionDeclaration(n)&&n.name?.text==='refreshConnectedState')refresh=n;if(ts.isBinaryExpression(n)&&n.left.getText(tree)==='automaticReadRef.current'&&ts.isArrowFunction(n.right))automatic=n.right;ts.forEachChild(n,visit);}visit(tree);assert.ok(action);assert.ok(refresh);assert.ok(automatic);
function fixture({stage='UNKNOWN',phase='PREPARED',lock=false}={}){
 const calls=[],s={status:null,vault:{graphSummary:async()=>({phase})}},host={serverAutomationRef:{current:null},setServerAutomation:()=>{},live(){assert.ok(!host.closed,'SESSION_CLOSED');},closed:false,
  async noteRead(){calls.push('NOTE');s.status={jobs:[{stage}]};if(lock)host.closed=true;return{phase,beginPrepared:false};},async display(){calls.push('DISPLAY');},async showOperationEconomic(){assert.ok(!['UNKNOWN','PROVING'].includes(stage),'PAGED_GRAPH_NOTE_PENDING');calls.push('ECONOMIC');},async refreshPortfolio(){calls.push('PORTFOLIO');},async command(name){calls.push(name);}};
 const code=ts.transpileModule(action.getText(tree)+'\n'+refresh.getText(tree)+'\n({restore:restoreSavedConnection,refresh:refreshConnectedState,automatic:('+automatic.getText(tree)+')})',{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.None}}).outputText;
 Object.assign(host,{suspendAutomaticRef:{current:false},graphFormRef:{current:false},automaticReconnectRef:{current:true},manualBusyRef:{current:false},activeRef:{current:true},foregroundRef:{current:true},sessionActiveRef:{current:true},busyRef:{current:false},reviewRef:{current:null},loadedProfileRef:{current:true},epoch:{current:1},current:{current:s},automaticWorkRef:{current:null},automaticReadRetryRef:{current:{available:()=>true,reset(){calls.push('RETRY_RESET');},failed(){calls.push('READ_FAILED');return true;}}},operationStageRef:{current:'IDLE'},setRefreshing(){},reportOperationFailure(){},onInvalidate(){},setSummary(){},setGraph(){},setWithdrawalOptions(){},setEconomic(){},setFeedbackKind(){},setActivity(){},setMessage(){}});
 const functions=vm.runInNewContext(code,host);return{run:automation=>functions.restore(s,1,automation,()=>{}),tick:automation=>{host.serverAutomationRef.current=automation;return functions.automatic();},calls};
}
test('pending withdrawal keeps the stopped plan connected and cannot enter its fenced economic channel',async()=>{
 for(const automation of [null,{revoked:true}])for(const stage of ['UNKNOWN','PROVING']){const f=fixture({stage});assert.equal(await f.run(automation),true);assert.deepEqual(f.calls,['NOTE','DISPLAY']);}
});
test('completed and active plans retain their original economic/portfolio observation sequence',async()=>{
 const stopped=fixture({stage:'CONFIRMED'});assert.equal(await stopped.run({revoked:true}),false);assert.deepEqual(stopped.calls,['NOTE','ECONOMIC']);
 const active=fixture({stage:'CONFIRMED',phase:'FULFILLED'});assert.equal(await active.run({revoked:false}),false);assert.deepEqual(active.calls,['ECONOMIC','PORTFOLIO','DISPLAY']);
 const normal=fixture({stage:'CONFIRMED'});assert.equal(await normal.run(null),false);assert.deepEqual(normal.calls,['NOTE','OBSERVE_GRAPH','PORTFOLIO','DISPLAY']);
});
test('session loss during note consultation cannot continue or display a connected wallet',async()=>{
 const f=fixture({lock:true});await assert.rejects(f.run({revoked:true}),/SESSION_CLOSED/);assert.deepEqual(f.calls,['NOTE']);
});

test('actual automatic refresh keeps a stopped pending withdrawal connected across successive ticks',async()=>{
 const f=fixture();await f.tick({revoked:true});await f.tick({revoked:true});assert.deepEqual(f.calls,['NOTE','DISPLAY','RETRY_RESET','NOTE','DISPLAY','RETRY_RESET']);
});
