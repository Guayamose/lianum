/** Actual app callbacks with a deferred read transport; no keys or network. */
import assert from 'node:assert/strict';
import test from 'node:test';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import ts from '../node_modules/typescript/lib/typescript.js';
import {walletNavigationDuringWorkV1} from '../src/state/wallet-navigation-v1.mjs';
const text=await readFile(new URL('../App.tsx',import.meta.url),'utf8');
const tree=ts.createSourceFile('App.tsx',text,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX),nodes=new Map();let disabled;
function visit(node){
 if(ts.isVariableDeclaration(node)&&['navigate','transportClosed'].includes(node.name.getText(tree)))nodes.set(node.name.getText(tree),node.initializer.arguments[0].getText(tree));
 if(ts.isFunctionDeclaration(node)&&node.name?.text==='openWalletAction')nodes.set('openWalletAction',node.getText(tree));
 if(ts.isJsxSelfClosingElement(node)&&node.tagName.getText(tree)==='PrivateWalletStateScreen')disabled=node.attributes.properties.find(value=>value.name?.getText(tree)==='actionsDisabled').initializer.expression.getText(tree);
 ts.forEachChild(node,visit);
}visit(tree);
const code=ts.transpileModule(`const navigate=${nodes.get('navigate')};const transportClosed=${nodes.get('transportClosed')};${nodes.get('openWalletAction')};({navigate,transportClosed,openWalletAction})`,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.None}}).outputText;
function fixture({reading=false,working=false,group='paged'}={}){
 const observed={screen:'state',nextGroup:group,cancelled:0,notices:[],request:null,touched:0},controller=new AbortController();
 const context={walletSessionStatusV1:()=>({active:true}),networkChangingRef:{current:false},recoveryBusy:false,routing:false,transition:{current:null},network:'testnet',rehydrating:reading,readController:{current:reading?controller:null},pagedBusy:working||reading,externalBusy:false,positionsBusy:false,agentBusy:false,nativeBusy:false,activeGroup:group,activeGroupRef:{current:group},manualNavigationRevision:{current:0},requestSequence:{current:0},pendingRead:{current:{resolve:()=>{}}},privateState:{cancelRegisteredReads(){observed.cancelled++;}},groupFor:target=>target==='pagedGraph'?'paged':target==='investment'?'investment':null,walletNavigationDuringWorkV1,touchWalletSessionV1(){observed.touched++;},setConnectionNavigation(){},setCoverage(){},setRehydrating(){},setTransitioning(){},setScreen(value){observed.screen=value;},setActiveGroup(value){observed.nextGroup=value;},setNotice(value){observed.notices.push(value);},setInvestmentRequest(){},setGraphEntryAction(value){observed.request=value;}};
 return {ui:vm.runInNewContext(code,context),context,observed,controller};
}
test('an explicit financial route cancels a balance read and waits for its original transport to close',()=>{
 const f=fixture({reading:true});f.ui.openWalletAction('invest');
 assert.equal(f.controller.signal.aborted,true);assert.equal(f.observed.cancelled,1);assert.equal(f.observed.nextGroup,null);
 assert.equal(f.observed.screen,'state','another custody must not open before TLS drain');
 f.ui.transportClosed('external');assert.equal(f.observed.screen,'state','unrelated close cannot release the owner');
 f.ui.transportClosed('paged');assert.equal(f.observed.screen,'investment');assert.equal(f.observed.nextGroup,'investment');
});
test('a real financial operation retains its owner and rejects entry to another custody',()=>{
 const f=fixture({working:true});f.ui.openWalletAction('invest');assert.equal(f.observed.screen,'state');assert.equal(f.observed.cancelled,0);assert.equal(f.observed.nextGroup,'paged');assert.equal(f.context.transition.current,null);
 f.ui.navigate('native');assert.equal(f.observed.screen,'native');assert.equal(f.observed.nextGroup,'paged');assert.equal(f.observed.cancelled,0);
});
test('Swap opens the public plan and preserves its intent through balance-read cancellation',()=>{
 const f=fixture({reading:true});f.ui.openWalletAction('swap');assert.equal(f.observed.request.action,'swap');assert.equal(f.controller.signal.aborted,true);f.ui.transportClosed('paged');assert.equal(f.observed.screen,'pagedGraph');assert.equal(f.observed.nextGroup,'paged');
});
test('the wallet action controls remain usable during aggregate reads, but financial and navigation locks remain',()=>{
 assert.equal(vm.runInNewContext(disabled,{nativeBusy:false,agentBusy:false,networkChanging:false,pagedBusy:true,externalBusy:false,positionsBusy:false,rehydrating:true,navigationBlocked:false}),false);
 assert.equal(vm.runInNewContext(disabled,{nativeBusy:false,agentBusy:false,networkChanging:false,pagedBusy:true,externalBusy:false,positionsBusy:false,rehydrating:false,navigationBlocked:false}),true);
 assert.equal(vm.runInNewContext(disabled,{nativeBusy:false,agentBusy:false,networkChanging:false,pagedBusy:false,externalBusy:false,positionsBusy:false,rehydrating:true,navigationBlocked:true}),true);
 assert.equal(vm.runInNewContext(disabled,{nativeBusy:true,agentBusy:false,networkChanging:false,pagedBusy:true,externalBusy:false,positionsBusy:false,rehydrating:true,navigationBlocked:false}),true);
});
