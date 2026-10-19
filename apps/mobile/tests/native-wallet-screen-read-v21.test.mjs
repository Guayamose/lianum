/** Actual screen callback, deferred HOST ports; no custody, permissions or network. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import ts from '../node_modules/typescript/lib/typescript.js';
import {mergeNativeBalancesV25} from '../src/portfolio/portfolio-model-v1.ts';
const accounts=['ethereum','solana'].map(chain=>({chain,network:'testnet',networkId:chain+'-test',address:chain+'-address',path:'host-path',publicKey:'host-key'}));
const row=(i,amount='1')=>({account:accounts[i],status:'CONFIRMED',balance:{balanceAtomic:amount}});
const text=await readFile(new URL('../src/screens/NativeWalletScreen.tsx',import.meta.url),'utf8');
const tree=ts.createSourceFile('screen.tsx',text,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
let callback;
function visit(n){if(ts.isVariableDeclaration(n)&&n.name.getText(tree)==='read'&&ts.isCallExpression(n.initializer)&&n.initializer.expression.getText(tree)==='useCallback')callback=n.initializer.arguments[0];ts.forEachChild(n,visit);}visit(tree);assert.ok(callback);
function deferred(){let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return{promise,resolve,reject};}
function screen(port,previous=[]){let active=true;const observed={balances:previous,capabilities:null,readAt:null};const noop=()=>{};
 const host={port,network:'testnet',live:signal=>active&&!signal.aborted,setWallet:noop,setSelected:noop,setTransfer:noop,setOrder:noop,sameAccount:(a,b)=>a.networkId===b.networkId&&a.address===b.address,mergeNativeBalancesV25,setBalances:value=>observed.balances=typeof value==='function'?value(observed.balances):value,setCapabilities:value=>observed.capabilities=value,setBalanceReadAt:value=>observed.readAt=value};
 const code=ts.transpileModule('const read='+callback.getText(tree)+';read',{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.None}}).outputText;
 return{read:vm.runInNewContext(code,host),observed,lock(){active=false;}};
}
test('actual wallet screen publishes balances before a slow fiat lookup finishes',async()=>{
 const balances=deferred(),fiat=deferred(),value=[row(0)];
 const ui=screen({readState:async()=>({status:'READY',network:'testnet',accounts}),readBalances:()=>balances.promise,readFiatCapabilities:()=>fiat.promise});
 let done=false;const work=ui.read(new AbortController().signal,0).then(()=>done=true);
 await Promise.resolve();balances.resolve(value);await new Promise(resolve=>setImmediate(resolve));
 assert.equal(ui.observed.balances[0].balance,value[0].balance);assert.ok(ui.observed.readAt);assert.equal(done,false);
 fiat.resolve({configured:false});await work;assert.equal(ui.observed.capabilities.configured,false);
});
test('late balance and fiat results cannot repopulate a locked wallet',async()=>{
 const balances=deferred(),fiat=deferred();
 const ui=screen({readState:async()=>({status:'READY',network:'testnet',accounts}),readBalances:()=>balances.promise,readFiatCapabilities:()=>fiat.promise});
 const work=ui.read(new AbortController().signal,0);await Promise.resolve();ui.lock();balances.resolve([{balance:'private'}]);fiat.resolve({configured:true});await work;
 assert.equal(ui.observed.balances.length,0);assert.equal(ui.observed.readAt,null);assert.equal(ui.observed.capabilities,null);
});
test('one observed chain is displayed while another chain is still pending',async()=>{
 const all=deferred(),fiat=deferred(),first=row(0);
 let publish;
 const ui=screen({readState:async()=>({status:'READY',network:'testnet',accounts}),readBalances:(_signal,onAccount)=>{publish=onAccount;return all.promise;},readFiatCapabilities:()=>fiat.promise});
 const controller=new AbortController(),work=ui.read(controller.signal,0);await new Promise(resolve=>setImmediate(resolve));
 publish(first);assert.equal(ui.observed.balances.length,1);assert.equal(ui.observed.balances[0].balance,first.balance);
 ui.lock();publish({account:{networkId:'solana-devnet'},status:'CONFIRMED'});assert.equal(ui.observed.balances.length,1);
 all.resolve([first]);fiat.resolve({});await work;
});

test('refresh preserves other chains and labels a failed update without inventing a new observation',async()=>{
 const all=deferred(),previous=[{...row(0,'10'),observedAt:100},{...row(1,'20'),observedAt:100}];let publish;
 const ui=screen({readState:async()=>({status:'READY',network:'testnet',accounts}),readBalances:(_signal,callback)=>{publish=callback;return all.promise;},readFiatCapabilities:async()=>({})},previous);
 const work=ui.read(new AbortController().signal,0);await new Promise(resolve=>setImmediate(resolve));
 publish(row(0,'11'));assert.equal(ui.observed.balances.length,2);assert.equal(ui.observed.balances[1].balance.balanceAtomic,'20');
 const failed={account:accounts[1],status:'UNKNOWN',balance:null,reason:'HOST_RPC_UNAVAILABLE'};publish(failed);
 assert.equal(ui.observed.balances[1].balance.balanceAtomic,'20');assert.equal(ui.observed.balances[1].observedAt,100);assert.equal(ui.observed.balances[1].stale,true);
 all.resolve([row(0,'11'),failed]);await work;assert.equal(ui.observed.balances[1].stale,true);
});

const controllerSource=await readFile(new URL('../src/native-wallet/native-wallet-controller.ts',import.meta.url),'utf8');
const controllerTree=ts.createSourceFile('controller.ts',controllerSource,ts.ScriptTarget.Latest,true,ts.ScriptKind.TS);let balanceMethod;
function findController(n){if(ts.isMethodDeclaration(n)&&n.name.getText(controllerTree)==='readBalances')balanceMethod=n;ts.forEachChild(n,findController);}findController(controllerTree);assert.ok(balanceMethod);
function chainReads(){
 const accounts=[{networkId:'ethereum-sepolia',address:'host-eth'},{networkId:'solana-devnet',address:'host-sol'}],reads=new Map(accounts.map(a=>[a.networkId,deferred()]));
 const host={networkRevision:1,networkBusy:false,live:signal=>{assert.ok(!signal.aborted,'HOST_LOCKED');return 'host-owner';},activeCustody:async()=>({accounts}),request:async(_route,a)=>reads.get(a.networkId).promise,nativeAtomicV1:value=>assert.match(value,/^[0-9]+$/)};
 const code=ts.transpileModule('({'+balanceMethod.getText(controllerTree)+'})',{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.None}}).outputText;
 return {accounts,reads,host,port:vm.runInNewContext(code,host),value:index=>({address:accounts[index].address,network:{id:accounts[index].networkId},balanceAtomic:'1',spendableAtomic:'1',reservedAtomic:'0'})};
}
test('actual controller emits each verified chain without waiting for the other RPC',async()=>{
 const fixture=chainReads(),rows=[],controller=new AbortController();let done=false;
 const work=fixture.port.readBalances(controller.signal,row=>rows.push(row)).then(value=>{done=true;return value;});await Promise.resolve();
 fixture.reads.get('ethereum-sepolia').resolve(fixture.value(0));await new Promise(resolve=>setImmediate(resolve));
 assert.equal(rows.length,1);assert.equal(rows[0].status,'CONFIRMED');assert.equal(done,false);
 fixture.reads.get('solana-devnet').resolve(fixture.value(1));const result=await work;
 assert.equal(rows.length,2);assert.equal(result.length,2);assert.equal(done,true);
});
test('a network switch prevents late controller callbacks from publishing old-network balances',async()=>{
 const fixture=chainReads(),rows=[],work=fixture.port.readBalances(new AbortController().signal,row=>rows.push(row));await Promise.resolve();
 fixture.host.networkRevision++;
 fixture.reads.get('ethereum-sepolia').resolve(fixture.value(0));fixture.reads.get('solana-devnet').resolve(fixture.value(1));
 await assert.rejects(work,/NATIVE_NETWORK_CHANGED/);assert.equal(rows.length,0);
});
