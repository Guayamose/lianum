/** HOST header metadata only. Actual private selector body and original block
 * codecs; no native transaction, payout, certificate, runtime or credit. */
import assert from 'node:assert/strict';
import test from 'node:test';
import {createHash} from 'node:crypto';
import {readFileSync,existsSync} from 'node:fs';
import {createContext,Script} from 'node:vm';
import {join} from 'node:path';
import {isDeepStrictEqual} from 'node:util';
import {ROOT} from '../../../../../proofs/src/catalog.mjs';
import {normalizeTronBlock} from '../../../../src/chains/tron/observations/tron-observation-adapter.mjs';
import {need,checkFreshBlock} from '../../../../src/chains/shared/portfolio/portfolio-registry.mjs';

const url=new URL('../../../../src/chains/tron/health/tron-native-value-health-source-v4.mjs',import.meta.url);
const source=readFileSync(existsSync(url)?url:join(ROOT,'wallet-platform/modules/chain-adapters/tron-native-value-health-source-v4.mjs'),'utf8');
const begin=source.indexOf('async function readReceiverAnchoredTronSolidV4('),end=source.indexOf('function retained(',begin);
assert.ok(begin>=0&&end>begin);
const readAtReceiver=new Script('('+source.slice(begin,end)+')').runInContext(createContext({normalizeTronBlock,need,checkFreshBlock,same:isDeepStrictEqual}));
const at=1_900_000_000_000;
const profile={maximumAncestry:'32',maximumClockSkewMs:'5000',maximumBlockAgeMs:'15000',maximumQueryMs:'10000'};
const id=height=>BigInt(height).toString(16).padStart(16,'0')+createHash('sha256').update('public-header-'+height).digest('hex').slice(16);
function headers(){return new Map(Array.from({length:26},(_,height)=>[String(height),{blockID:id(height),block_header:{raw_data:{number:String(height),timestamp:String(at+(height-10)*3000),parentHash:height?id(height-1):'0'.repeat(64)}}}]));}

test('fresh native tips advancing beyond the frozen receiver clock are re-read through canonical ancestry without changing the round',async()=>{
  const blocks=headers(),calls=[];let latest='13';
  const readLatest=async()=>{calls.push('latest:'+latest);return structuredClone(blocks.get(latest));};
  const readBlock=async height=>{calls.push(height);return structuredClone(blocks.get(height));};
  assert.throws(()=>checkFreshBlock(normalizeTronBlock(blocks.get(latest)),at,{maxFutureSkewMs:5000,maxBlockAgeMs:15000}),/FUTURE_BLOCK/);
  const first=await readAtReceiver(readLatest,readBlock,at,profile,null);
  assert.equal(normalizeTronBlock(first.raw).height,'10');assert.equal(first.latest.height,'13');
  for(const height of ['13','12','11'])assert.equal(calls.filter(value=>value===height).length,height==='13'?1:2);
  assert.equal(calls.filter(value=>value==='10').length,2);
  latest='14';calls.length=0;
  const second=await readAtReceiver(readLatest,readBlock,at,profile,first.latest);
  assert.deepEqual(second.raw,first.raw);assert.equal(second.latest.height,'14');
  assert.equal(calls[0],'latest:14');assert.ok(calls.includes('14')&&calls.includes('13')&&calls.includes('10'));
  checkFreshBlock(normalizeTronBlock(second.raw),at,{maxFutureSkewMs:5000,maxBlockAgeMs:15000});
  assert.deepEqual(Object.keys(second).sort(),['latest','raw']);
});

test('latest regression, changed branches, nonmonotone time, missing paths, far future and stale selected heads all reject',async()=>{
  async function check({latest='14',previous=null,change=()=>{},limits=profile}={}){
    const blocks=headers();change(blocks);
    return readAtReceiver(async()=>structuredClone(blocks.get(latest)),async height=>structuredClone(blocks.get(height)),at,limits,previous);
  }
  await assert.rejects(check({latest:'12',previous:normalizeTronBlock(headers().get('13'))}),/TRON_GRAPH_ANCESTRY_CHANGED/);
  await assert.rejects(check({change:blocks=>{blocks.get('13').block_header.raw_data.parentHash='a'.repeat(64);}}),/TRON_GRAPH_CANONICAL_ANCESTRY_CHANGED/);
  await assert.rejects(check({change:blocks=>{blocks.get('13').block_header.raw_data.timestamp=String(at+15000);}}),/TRON_GRAPH_CANONICAL_ANCESTRY_CHANGED/);
  await assert.rejects(check({change:blocks=>blocks.delete('12')}));
  await assert.rejects(check({latest:'25'}),/FUTURE_BLOCK/);
  await assert.rejects(check({latest:'4'}),/BLOCK_STALE/);
  await assert.rejects(check({limits:{...profile,maximumAncestry:'2'}}),/TRON_GRAPH_SOLIDIFIED_ANCESTRY_BOUND/);
  const blocks=headers();let read=0;
  await assert.rejects(readAtReceiver(async()=>structuredClone(blocks.get('14')),async height=>{
    const result=structuredClone(blocks.get(height));
    if(height==='12'&&++read===2)result.block_header.raw_data.parentHash='b'.repeat(64);
    return result;
  },at,profile,null),/TRON_GRAPH_ANCESTRY_CHANGED/);
});
