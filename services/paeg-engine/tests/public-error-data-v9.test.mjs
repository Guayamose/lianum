import test from 'node:test';
import assert from 'node:assert/strict';
import {publicErrorDataV9} from '../src/public/public-error-data-v9.mjs';
test('administrative aggregate preserves finite original failures without private exception data',()=>{
 const failure=new TypeError('secret private key and RPC payload');
 failure.stack='TypeError: secret private key and RPC payload\n    at go (/private/secret-dir/component-v9.mjs:12:34)';
 const cause=new Error('SEPOLIA_SOURCE_EXPIRED');cause.code='FINITE_CODE';
 const result=publicErrorDataV9(new AggregateError([cause,failure],'OPENING_CAPTURE_FAILED'));
 assert.equal(result.reason,'OPENING_CAPTURE_FAILED');
 assert.equal(result.causes[0].reason,'SEPOLIA_SOURCE_EXPIRED');assert.equal(result.causes[0].code,'FINITE_CODE');
 assert.equal(result.causes[1].errorClass,'TypeError');assert.deepEqual(result.causes[1].locations,['component-v9.mjs:12:34']);
 assert.doesNotMatch(JSON.stringify(result),/private|secret|RPC payload/);
});
test('nested causes are bounded before logging',()=>{
 let failure=new Error('FINITE_LEAF');for(let i=0;i<8;i++)failure=new AggregateError(Array(8).fill(failure),'FINITE_AGGREGATE');
 const result=publicErrorDataV9(failure);let cursor=result;for(let i=0;i<3;i++){assert.equal(cursor.causes.length,4);cursor=cursor.causes[0];}assert.deepEqual(cursor.causes,[]);
});
