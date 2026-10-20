/** Real screen callbacks; explicit failed HOST ports, no custody or signatures. */
import assert from 'node:assert/strict';
import test from 'node:test';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import ts from '../node_modules/typescript/lib/typescript.js';
import {nativeWalletAmountAtomicV1,nativeWalletQuoteReviewV1,nativeWalletNetworkLabelV1} from '../src/native-wallet/native-wallet-form-v1.mjs';
const source=await readFile(new URL('../src/screens/NativeWalletScreen.tsx',import.meta.url),'utf8');
const tree=ts.createSourceFile('screen.tsx',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX),nodes=new Map();
function visit(node){if(ts.isFunctionDeclaration(node)&&node.name?.text==='friendlyError')nodes.set('friendlyError',node.getText(tree));if(ts.isVariableDeclaration(node)&&['run','prepare','cancelQuote'].includes(node.name.getText(tree)))nodes.set(node.name.getText(tree),node.name.getText(tree)==='run'?node.initializer.arguments[0].getText(tree):node.initializer.getText(tree));ts.forEachChild(node,visit);}visit(tree);
const code=ts.transpileModule(`${nodes.get('friendlyError')};const run=${nodes.get('run')};const prepare=${nodes.get('prepare')};const cancelQuote=${nodes.get('cancelQuote')};({prepare,cancelQuote})`,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.None}}).outputText;
const noop=()=>{},flush=()=>new Promise(resolve=>setImmediate(resolve));
function screen(port){
 const state={error:'',message:'',quote:{id:'unsigned-review'},busy:false,task:null};
 const context={port,Error,AbortController,nativeWalletAmountAtomicV1,nativeWalletQuoteReviewV1,selected:{chain:'bitcoin'},asset:{decimals:8},recipient:'test-recipient',amount:'0.00001',quote:state.quote,busyRef:{current:false},readWork:{current:null},blocked:false,mounted:{current:true},sessionEpoch:{current:0},work:{current:null},walletSessionStatusV1:()=>({active:true}),live:signal=>!signal.aborted,setBusy:v=>state.busy=v,setTask:v=>state.task=v,setLoading:noop,setError:v=>state.error=v,setMessage:v=>state.message=v,onBusyChange:noop,setQuote:v=>state.quote=v,setQuoteInput:noop,setSaleReview:noop,setNow:noop};
 return {ui:vm.runInNewContext(code,context),state};
}
test('a BTC preparation failure reports no signature or send and releases the busy state',async()=>{
 let signed=0,prepared=0;const f=screen({prepareSend:async()=>{prepared++;throw Error('MOBILE_NATIVE_HTTP_503');},authorizeAndSend:async()=>{signed++;}});
 f.ui.prepare();await flush();assert.equal(prepared,1);assert.equal(signed,0);assert.equal(f.state.busy,false);assert.equal(f.state.task,'prepare');assert.match(f.state.error,/Nothing was signed or sent/);assert.doesNotMatch(f.state.error,/Check its status/);
});
test('closing an unsigned review releases the modal even if the cancellation service is unavailable',async()=>{
 let cancelled=0,signed=0;const f=screen({cancelSendQuote:async id=>{assert.equal(id,'unsigned-review');cancelled++;throw Error('MOBILE_NATIVE_HTTP_503');},authorizeAndSend:async()=>{signed++;}});
 f.ui.cancelQuote();assert.equal(f.state.quote,null);await flush();assert.equal(cancelled,1);assert.equal(signed,0);assert.equal(f.state.busy,false);assert.match(f.state.error,/unsigned quote will expire/);
});
test('receiving and reviewing identifies the exact test network, preserving unknown network identifiers',()=>{
 for(const [chain,networkId,label]of [['ethereum','ethereum-sepolia','Ethereum Sepolia'],['bitcoin','bitcoin-testnet','Bitcoin Testnet3'],['solana','solana-devnet','Solana Devnet']])assert.equal(nativeWalletNetworkLabelV1({chain,networkId,network:'testnet'}),label);
 assert.equal(nativeWalletNetworkLabelV1({chain:'bitcoin',networkId:'bitcoin-signet',network:'testnet'}),'Bitcoin · bitcoin-signet');
});
