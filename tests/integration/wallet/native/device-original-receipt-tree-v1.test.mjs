/** HOST framing only. Digests and tree views here grant no receipt authority. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {assertDeviceFinalOriginalReceiptTreeV1} from './device-owner-execution-native-checks-v1.mjs';
const fixture=()=>({receiptLeaves:['6a'.repeat(32),...Array(63).fill('0'.repeat(64))],state:{receiptCount:'1'}});
test('a bare hexadecimal I84 digest remains present in the original padded tree',()=>{
 assertDeviceFinalOriginalReceiptTreeV1(fixture(),{admittedReceipts:1});
});
test('missing receipt, changed counts, malformed digests and nonzero padding are rejected',()=>{
 for(const change of [view=>{view.receiptLeaves[0]='0'.repeat(64);},view=>{view.receiptLeaves[1]='ab'.repeat(32);},
  view=>{view.receiptLeaves[0]='0x'+'6a'.repeat(32);},view=>{view.receiptLeaves.pop();},view=>{view.state.receiptCount='0';}]){
  const view=fixture();change(view);assert.throws(()=>assertDeviceFinalOriginalReceiptTreeV1(view,{admittedReceipts:1}));
 }
 assert.throws(()=>assertDeviceFinalOriginalReceiptTreeV1(fixture(),{admittedReceipts:0}));
});
