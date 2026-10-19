/** Actual screen observer/effect with HOST read-only ports; no keys or network. */
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
import ts from '../node_modules/typescript/lib/typescript.js';
import {pendingTransfersV1} from '../src/portfolio/portfolio-model-v1.ts';
const source=await readFile(new URL('../src/screens/NativeWalletScreen.tsx',import.meta.url),'utf8');
const tree=ts.createSourceFile('screen.tsx',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);let observer,effect,pendingKey;
function find(n){
 if(ts.isFunctionDeclaration(n)&&n.name?.text==='observePendingTransfer')observer=n;
 if(ts.isVariableDeclaration(n)&&n.name.getText(tree)==='pendingTransferKey')pendingKey=n.initializer;
 if(ts.isCallExpression(n)&&n.expression.getText(tree)==='useEffect'&&n.arguments[0]?.getText(tree).includes('observePendingTransfer('))effect=n.arguments[0];
 ts.forEachChild(n,find);
}find(tree);assert.ok(observer&&effect);
test('an included transaction remains in the actual screen polling set until finality',()=>{
 assert.ok(pendingKey);const wallet={transactions:['SUBMITTED','PENDING','INCLUDED','UNKNOWN','CONFIRMED','FAILED'].map(status=>({id:status,status}))};
 const key=vm.runInNewContext(pendingKey.getText(tree),{wallet,pendingTransfersV1});
 assert.deepEqual(JSON.parse(key),['SUBMITTED','PENDING','INCLUDED','UNKNOWN']);
});
const flush=()=>new Promise(resolve=>setImmediate(resolve));
function fixture(){
 let resolve;const pending=new Promise(r=>resolve=r),calls=[],current={wallet:{transactions:[{id:'same-id',status:'SUBMITTED'}]},transfer:{id:'same-id',status:'SUBMITTED'},refreshes:0,aborts:0};
 const host={active:true,pendingTransferKey:'["same-id"]',AbortController,AppState:{currentState:'active'},sessionEpoch:{current:1},busyRef:{current:false},
  port:{refreshTransaction:async(id,signal)=>{calls.push({id,signal});return pending;}},live:(signal,epoch)=>!signal.aborted&&epoch===host.sessionEpoch.current,
  setWallet:fn=>current.wallet=fn(current.wallet),setTransfer:fn=>current.transfer=fn(current.transfer),readWork:{current:{abort:()=>current.aborts++}},refreshRead:()=>current.refreshes++,
  setInterval:(fn,ms)=>{assert.equal(ms,5000);host.tick=fn;return 1;},clearInterval:id=>{assert.equal(id,1);host.cleared=true;}};
 const code=ts.transpileModule(observer.getText(tree)+'\n({observePendingTransfer,effect:'+effect.getText(tree)+'})',{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.None}}).outputText;
 return {host,current,calls,resolve,ui:vm.runInNewContext(code,host)};
}
test('automatic status reads keep the same ID, serialize ticks, and refresh balances on final confirmation',async()=>{
 const f=fixture(),close=f.ui.effect();assert.equal(f.calls.length,1);f.host.tick();f.host.tick();assert.equal(f.calls.length,1);
 f.resolve({id:'same-id',status:'CONFIRMED',transactionId:'same-wire'});await flush();
 assert.equal(f.current.wallet.transactions[0].status,'CONFIRMED');assert.equal(f.current.transfer.status,'CONFIRMED');
 assert.equal(f.current.refreshes,1);assert.equal(f.current.aborts,1);assert.equal(f.host.readWork.current,null);
 close();assert.equal(f.host.cleared,true);assert.equal(f.calls[0].signal.aborted,true);
});
test('leaving the wallet aborts its observer and a late status cannot repopulate the view',async()=>{
 const f=fixture(),close=f.ui.effect();close();f.resolve({id:'same-id',status:'CONFIRMED'});await flush();
 assert.equal(f.current.wallet.transactions[0].status,'SUBMITTED');assert.equal(f.current.refreshes,0);
});
test('an uncertain status stays pending and never calls a send or releases balances',async()=>{
 const f=fixture(),close=f.ui.effect();f.resolve({id:'same-id',status:'UNKNOWN'});await flush();
 assert.equal(f.current.wallet.transactions[0].status,'UNKNOWN');assert.equal(f.current.refreshes,0);assert.equal(f.current.aborts,0);close();
});
test('a mismatched transaction ID cannot update the wallet',async()=>{
 const f=fixture(),signal=new AbortController().signal,work=f.ui.observePendingTransfer('same-id',signal,1);f.resolve({id:'foreign-id',status:'CONFIRMED'});
 await assert.rejects(work,/NATIVE_TRANSFER_BINDING/);assert.equal(f.current.wallet.transactions[0].status,'SUBMITTED');assert.equal(f.current.refreshes,0);
});
