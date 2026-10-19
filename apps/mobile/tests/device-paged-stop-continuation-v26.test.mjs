/** Actual screen action with HOST custody/transport; no device or financial send. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import ts from '../node_modules/typescript/lib/typescript.js';
const source=await readFile(new URL('../src/screens/DevicePagedGraphScreen.tsx',import.meta.url),'utf8'),tree=ts.createSourceFile('screen.tsx',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);let action,disabled;
function visit(n){if(ts.isFunctionDeclaration(n)&&n.name?.text==='stopServerContinuation')action=n;if(ts.isCallExpression(n)&&n.expression.getText(tree)==='button'&&n.arguments[0]?.text==='Detener continuación')disabled=n.arguments[2];ts.forEachChild(n,visit);}visit(tree);assert.ok(action&&disabled);
function fixture({ack=true,error=null}={}){
 const calls=[],state={current:false,revoked:false},messages=[],host={current:{current:{vault:{graphAutomationStatus:async()=>({...state}),graphAutomationReadHint:async()=>null}}},epoch:{current:1},live:t=>assert.equal(t,host.epoch.current),
  command:async name=>{calls.push(name);if(error)throw error;state.revoked=ack;},display:async()=>calls.push('DISPLAY'),setFeedbackKind:()=>{},setMessage:text=>messages.push(text)};
 const code=ts.transpileModule(action.getText(tree)+'\nstopServerContinuation',{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.None}}).outputText;
 return{run:vm.runInNewContext(code,host),calls,state,messages,host};
}
test('stale automation can be stopped without another OWNER observation; success requires accepted revocation',async()=>{
 const f=fixture();await f.run();assert.deepEqual(f.calls,['STOP_AUTOMATION','DISPLAY']);assert.equal(f.state.revoked,true);assert.match(f.messages[0],/Continuación detenida/);
 assert.equal(vm.runInNewContext(disabled.getText(tree),{graph:{status:{pending:false}},serverAutomation:{current:false}}),false);
 assert.equal(vm.runInNewContext(disabled.getText(tree),{graph:{status:{pending:true}},serverAutomation:{current:true}}),true);
});
test('a lost response or missing revocation never displays a successful stop or sends a second command',async()=>{
 for(const options of [{ack:false},{error:Error('HOST_REPLY_LOST')}]){const f=fixture(options);await assert.rejects(f.run());assert.deepEqual(f.calls,['STOP_AUTOMATION']);assert.equal(f.messages.length,0);}
});
test('a locked/replaced session cannot enter the stop request',async()=>{
 const f=fixture();f.host.current.current.vault.graphAutomationStatus=async()=>{f.host.epoch.current++;return f.state;};await assert.rejects(f.run());assert.equal(f.calls.length,0);assert.equal(f.messages.length,0);
});
