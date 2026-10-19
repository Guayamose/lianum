/** Actual mobile completion body; HOST retained custody, no proof or transfer. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import ts from '../node_modules/typescript/lib/typescript.js';
import {normalizeDevicePagedUniswapIntentV3} from '../../../packages/mobile-protocol/src/device-paged-uniswap-v3.mjs';
const source=await readFile(new URL('../src/api/device-paged-uniswap-preparation-v3.ts',import.meta.url),'utf8');
const tree=ts.createSourceFile('helper.ts',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TS);
let method;
function visit(node){if(ts.isMethodDeclaration(node)&&node.name.getText(tree)==='completePreparedNode')method=node;ts.forEachChild(node,visit);}visit(tree);assert.ok(method);
const code=ts.transpileModule('({'+method.getText(tree)+'}).completePreparedNode',{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.None}}).outputText;
function fixture(profile){
 const result={},copy={},owner={},checkpoint={rootId:'b'.repeat(64)},recipient='1'.repeat(40);
 const review={...checkpoint,outputCommitment:'c'.repeat(64),maximumInput:'200',outputAmount:'100',validFrom:'1000',validUntil:'2000',recipient};
 const row={jobId:'a'.repeat(64),stage:'PROVED'},proofs=new WeakMap([[result,{owner,used:false,row,review}]]),copies=new WeakMap([[copy,{owner,used:false,checkpoint}]]);
 const environment={proofs,copies,apiMarker:owner,run:fn=>fn(),need:condition=>assert.ok(condition),same:(a,b)=>JSON.stringify(a)===JSON.stringify(b),normalizeDevicePagedUniswapIntentV3:raw=>normalizeDevicePagedUniswapIntentV3(structuredClone(raw)),preparation:{profile,targetConnection:{}},descriptor:{},nodes:new WeakMap(),paged:{},vault:{
  async recoveryCheckpoint(){return checkpoint;},
  async summary(){return{rootId:review.rootId,commitment:review.outputCommitment,pending:null,jobs:[row]};},
 }};
 return{complete:vm.runInNewContext(code,environment),result,copy,recipient};
}
test('both local and public Uniswap retain the reviewed beneficiary in the completed intent',async()=>{
 for(const profile of ['DEVICE_PAGED_UNISWAP_PREPARATION_V3','DEVICE_PAGED_PUBLIC_UNISWAP_PREPARATION_V4']){
  const f=fixture(profile),node=await f.complete(f.result,f.copy);
  assert.equal(node.intent.recipient,f.recipient);assert.equal(node.outputSpendAuthorized,false);
  await assert.rejects(f.complete(f.result,f.copy));
 }
});
test('foreign proof or backup cannot manufacture a reviewed Uniswap beneficiary',async()=>{
 for(const foreign of ['proof','copy']){
  const f=fixture('DEVICE_PAGED_UNISWAP_PREPARATION_V3');
  await assert.rejects(f.complete(foreign==='proof'?{}:f.result,foreign==='copy'?{}:f.copy));
 }
});
