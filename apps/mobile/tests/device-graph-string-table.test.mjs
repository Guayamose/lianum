import test from 'node:test';
import assert from 'node:assert/strict';
import {stringTableState,decodeStringTableState} from '../src/custody/device-graph-string-table-v5.ts';

const V3='DEVICE_EXTERNAL_FLAT_GRAPH_STRING_TABLE_V3',V4='DEVICE_EXTERNAL_FLAT_GRAPH_STRING_TABLE_V4',V5='DEVICE_EXTERNAL_FLAT_GRAPH_STRING_TABLE_V5';
test('private graph storage retains exact V5 bytes and reads the historical V3 and V4 data codecs',()=>{
 const raw={key:'ab'.repeat(32),marker:'!ordinary-marker',list:['ab'.repeat(32),null,true,9]},expected={codec:V5,strings:['key','!q6urq6urq6urq6urq6urq6urq6urq6urq6urq6urq6s=','marker','!!ordinary-marker','list'],value:{'#0':'~1','#2':'~3','#4':['~1',null,true,9]}};
 assert.equal(JSON.stringify(stringTableState(raw)),JSON.stringify(expected));assert.deepEqual(decodeStringTableState(expected),raw);
 assert.deepEqual(decodeStringTableState({codec:V3,strings:['ab'.repeat(32),'!ordinary-marker'],value:{key:'~0',marker:'~1',list:['~0',null,true,9]}}),raw);
 assert.deepEqual(decodeStringTableState({codec:V4,strings:['key','ab'.repeat(32),'marker','!ordinary-marker','list'],value:expected.value}),raw);
 const detached=decodeStringTableState(expected);detached.list[0]='changed';assert.equal(decodeStringTableState(expected).list[0],raw.key);
});

test('private graph string table rejects duplicate, noncanonical, over-capacity and deep data',()=>{
 const valid=stringTableState({key:'ab'.repeat(32)});
 const changed=edit=>{const value=structuredClone(valid);edit(value);assert.throws(()=>decodeStringTableState(value));};
 changed(v=>v.strings.push(v.strings[0]));changed(v=>v.value['#zzzzz']=0);changed(v=>v.value['#0']='~zzzzz');changed(v=>v.value['#0']='~01');
 changed(v=>v.strings[1]='!bad');changed(v=>v.strings[1]='!'+Buffer.alloc(32,171).toString('base64').slice(0,-2)+'t=');changed(v=>v.strings[1]='ab'.repeat(32));
 changed(v=>v.extra=true);changed(v=>v.codec='UNKNOWN');changed(v=>v.strings=Array.from({length:2049},(_,i)=>String(i)));
 assert.throws(()=>decodeStringTableState({codec:V4,strings:['#0'],value:{'#0':1,'#00':2}}));
 let deep=null;for(let i=0;i<25;i++)deep=[deep];assert.throws(()=>stringTableState(deep));assert.throws(()=>decodeStringTableState({codec:V5,strings:[],value:deep}));
 assert.throws(()=>stringTableState(Array(12001).fill(null)));assert.throws(()=>decodeStringTableState({codec:V5,strings:[],value:Array(12001).fill(null)}));
 assert.throws(()=>decodeStringTableState({codec:V5,strings:['x'.repeat(32768)],value:['~0','~0']}),/MOBILE_EXTERNAL_FLAT_CAPACITY/);
});
