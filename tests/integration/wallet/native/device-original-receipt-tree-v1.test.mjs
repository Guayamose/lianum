/** Inert HOST parser fixtures only. SHA below is deliberately NOT Poseidon,
 * and the decoded views issue no receipt, current-head or financial authority. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {assertDeviceFinalOriginalReceiptTreeV1} from './device-owner-execution-native-checks-v1.mjs';
import {decodeFlatFieldTree} from '../../../../packages/backend/src/execution/native-value/reconciliation/native-value-system-state-v2.mjs';
import {FIELD_MODULUS} from '@lianum/components/encoding/commitments';
const ZERO='0'.repeat(64);
const hostField=(label,...values)=>((BigInt('0x'+createHash('sha256').update(JSON.stringify([label,...values])).digest('hex'))%(FIELD_MODULUS-1n))+1n).toString(16).padStart(64,'0');
const DOMAIN=hostField('INERT_HOST_RECEIPT_DOMAIN'),KIND=2;
const math=Object.freeze({
 emptyLeaf(domain,kind){assert.equal(domain,DOMAIN);assert.equal(kind,KIND);return hostField('INERT_HOST_TYPED_EMPTY',domain,kind);},
 nodeHash(domain,kind,level,left,right){assert.equal(domain,DOMAIN);assert.equal(kind,KIND);return hostField('INERT_HOST_NODE',domain,kind,level,left,right);},
});
const raw=nodes=>'0x'+nodes.join('');
async function fixture(){
 const empty=math.emptyLeaf(DOMAIN,KIND),live=hostField('INERT_HOST_OCCUPIED_RECEIPT');
 assert.notEqual(live,empty);const nodes=Array(128).fill(ZERO);nodes.fill(empty,64);nodes[64]=live;
 for(let level=1;level<=6;level++)for(let i=64>>level;i<(64>>(level-1));i++)nodes[i]=math.nodeHash(DOMAIN,KIND,level,nodes[i*2],nodes[i*2+1]);
 const tree=await decodeFlatFieldTree(raw(nodes),'1',nodes[1],DOMAIN,KIND,math);
 return {nodes,view:{receiptLeaves:[...tree.leaves],state:{receiptCount:'1',receiptRoot:tree.root},receiptTree:tree}};
}
function copy(view){return {...view,receiptLeaves:[...view.receiptLeaves],state:{...view.state},receiptTree:{...view.receiptTree,leaves:[...view.receiptTree.leaves]}};}
function leaf(view,index,value){view.receiptLeaves[index]=value;view.receiptTree.leaves[index]=value;}
test('HOST bare receipt digest is retained by the real decoder with 63 typed empty leaves',async()=>{
 const {view}=await fixture(),tree=view.receiptTree;
 assert.equal(tree.nodes.length,128);assert.equal(tree.count,1);assert.equal(tree.leafCount,1);assert.equal(tree.path(0).siblings.length,6);
 assert.equal(tree.emptyLeaf,math.emptyLeaf(DOMAIN,KIND));assert.notEqual(tree.emptyLeaf,ZERO);
 assert.notEqual(view.receiptLeaves[0],ZERO);assert.notEqual(view.receiptLeaves[0],tree.emptyLeaf);
 assert.ok(view.receiptLeaves.slice(1).every(value=>value===tree.emptyLeaf));
 assertDeviceFinalOriginalReceiptTreeV1(view,{admittedReceipts:1});
});
test('HOST receipt framing rejects missing/count/root/empty/malformed and zero or substituted typed padding',async()=>{
 const {view,nodes}=await fixture();
 for(const mutate of [
  v=>{delete v.receiptTree;},v=>leaf(v,0,ZERO),v=>leaf(v,0,v.receiptTree.emptyLeaf),
  v=>{v.state.receiptCount='0';},v=>{v.receiptTree.count=0;},v=>{v.receiptTree.leafCount=0;},
  v=>{v.state.receiptRoot=hostField('WRONG_HOST_ROOT');},v=>{v.receiptTree.emptyLeaf=ZERO;},
  v=>leaf(v,0,'0x'+v.receiptLeaves[0]),v=>{v.receiptLeaves.pop();},
  v=>{v.receiptTree.leaves[0]=hostField('WRONG_HOST_TREE_LEAF');},
  v=>leaf(v,1,ZERO),v=>leaf(v,1,hostField('WRONG_HOST_PADDING')),
 ]){const changed=copy(view);mutate(changed);assert.throws(()=>assertDeviceFinalOriginalReceiptTreeV1(changed,{admittedReceipts:1}));}
 assert.throws(()=>assertDeviceFinalOriginalReceiptTreeV1(view,{admittedReceipts:0}));
 // Exercise the original decoder too: even internally consistent metadata is
 // no excuse to reinterpret a zero/substituted raw leaf as its typed empty.
 for(const padding of [ZERO,hostField('WRONG_HOST_RAW_PADDING')]){
  const changed=[...nodes];changed[65]=padding;
  await assert.rejects(()=>decodeFlatFieldTree(raw(changed),'1',nodes[1],DOMAIN,KIND,math),/FLAT_STATE_TYPED_PADDING/);
 }
});
