import test from 'node:test';
import assert from 'node:assert/strict';
import {planDeviceSepoliaMorphoShareNotesV4 as plan,MAXIMUM_SHARE_NOTE_ATOMIC_V4} from '../src/device-sepolia-defi-share-plan-v4.mjs';
const max=BigInt(MAXIMUM_SHARE_NOTE_ATOMIC_V4),min=10n**18n;
function verify(total,limit=256){
 const result=plan({totalSharesAtomic:total.toString(),maximumNodes:limit});
 assert.equal(result.notes.reduce((sum,n)=>sum+BigInt(n.sharesAtomic),0n),total);
 assert.equal(result.notes.length,Number((total+max-1n)/max));
 assert.equal(new Set(result.notes.map(n=>n.id)).size,result.notes.length);
 for(const [i,n]of result.notes.entries()){assert.ok(BigInt(n.sharesAtomic)>=min&&BigInt(n.sharesAtomic)<=max);assert.equal(n.pageIndex,Math.floor(i/64));assert.equal(n.noteIndex,i%64);assert.ok(Object.isFrozen(n));}
 assert.equal(result.pages,Math.ceil(result.notes.length/64));assert.equal(result.financialAuthority,false);assert.equal(result.quotesRequired,true);assert.ok(Object.isFrozen(result.notes));return result;
}
test('preserves every share atom and redistributes a one-atom overflow instead of a dust note',()=>{
 assert.deepEqual(verify(min).notes.map(n=>n.sharesAtomic),[min.toString()]);assert.equal(verify(max).notes.length,1);
 const result=verify(max+1n);assert.equal(result.notes.length,2);assert.equal(result.notes[0].sharesAtomic,'9223372036854775808');assert.equal(result.notes[1].sharesAtomic,'9223372036854775808');
 // User-facing ordinary100shares are six notes, not a rounded18.45-share cap.
 assert.equal(verify(100n*min).notes.length,6);
});
test('64 is a page boundary; larger quantities keep their complete exact total',()=>{
 assert.equal(verify(max*64n).pages,1);const next=verify(max*64n+1n);assert.equal(next.pages,2);assert.equal(next.notes.at(-1).pageIndex,1);assert.equal(next.notes.at(-1).noteIndex,0);assert.equal(verify(max*256n).notes.length,256);
});
test('capacity is rejected before allocation; canonical units and minimum are enforced',()=>{
 for(const input of [{totalSharesAtomic:(max*2n).toString(),maximumNodes:1},{totalSharesAtomic:(max*256n+1n).toString(),maximumNodes:256},{totalSharesAtomic:(min-1n).toString(),maximumNodes:256},{totalSharesAtomic:'100.0',maximumNodes:256},{totalSharesAtomic:'01000000000000000000',maximumNodes:256},{totalSharesAtomic:1000000000000000000,maximumNodes:256},{totalSharesAtomic:min.toString(),maximumNodes:257},{totalSharesAtomic:min.toString(),maximumNodes:1.5},{totalSharesAtomic:min.toString(),maximumNodes:1,assetDecimals:6}])assert.throws(()=>plan(input));
});
test('conservation and note limits hold around every supported capacity boundary',()=>{
 for(let count=1n;count<=256n;count++){verify(max*count);verify(max*count-1n);if(count<256n)verify(max*count+1n);}
});
