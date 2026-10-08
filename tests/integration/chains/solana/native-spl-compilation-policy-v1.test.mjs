/** Host metadata only: does not compile SBF or grant any native capability. */
import assert from 'node:assert/strict';
import {test} from 'node:test';
import {assertNativeSplElfV1,nativeSplCompilationProcessFailureV1} from './native-spl-compilation-policy-v1.mjs';
test('SBF envelope rejects native host ELF and truncated output before publication',()=>{
 const b=Buffer.alloc(65);b.write('7f454c46',0,'hex');b[4]=2;b[5]=1;b[6]=1;b.writeUInt16LE(3,16);b.writeUInt16LE(247,18);
 assert.equal(assertNativeSplElfV1(b),true);const host=Buffer.from(b);host.writeUInt16LE(62,18);assert.throws(()=>assertNativeSplElfV1(host),/SPL_COMPILATION_ELF_BPF/);
 assert.throws(()=>assertNativeSplElfV1(b.subarray(0,64)),/SPL_COMPILATION_ELF_SIZE/);
});
test('compiler scope rejects proof/native or excess compiler RSS including exited history',()=>{
 const rows=[{role:'main-worker',proofWorker:false,rssBytes:1},{role:'spl-rust-toolchain',proofWorker:false,rssBytes:2}];assert.equal(nativeSplCompilationProcessFailureV1(rows),null);
 for(const role of ['solana-runtime','flat-proof-worker','owned-descendant'])assert.equal(nativeSplCompilationProcessFailureV1([...rows,{role,proofWorker:role==='flat-proof-worker',rssBytes:0,state:'Z'}]),'SPL_COMPILATION_UNEXPECTED_CHILD');
 assert.equal(nativeSplCompilationProcessFailureV1([{role:'spl-rust-toolchain',proofWorker:false,rssBytes:3*1024**3+1}]),'SPL_COMPILATION_CHILD_RSS_LIMIT');
});
