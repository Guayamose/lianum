/** Public-header selection only. This module owns no source tokens or observer
 * brands; the source owner supplies its original round's receiver time. */
import {isDeepStrictEqual as same} from 'node:util';
import {normalizeTronBlock} from './tron-observation-adapter.mjs';
import {need,checkFreshBlock} from '../../shared/portfolio/portfolio-registry.mjs';
// Only already-known original heights enter this fixed read queue. All fresh
// requests drain before their outcomes are validated in original order. It is
// never used for selection, dependent parent traversal, replay, keys or sends.
export async function readOriginalKnownTronHeadersV4(headers,read){
  const outcomes=new Array(headers.length);let next=0;
  async function worker(){while(next<headers.length){const i=next++;try{outcomes[i]={ok:true,value:await read(headers[i])};}catch(error){outcomes[i]={ok:false,error};}}}
  await Promise.allSettled(Array.from({length:Math.min(4,headers.length)},()=>worker()));
  return outcomes;
}
export function originalTronHeaderReadV4(outcome){if(!outcome.ok)throw outcome.error;return outcome.value;}
/** V4 selection from fresh canonical reads, never a cached certificate.
 * Receiver time is issued by the original round/history token below. The live
 * solid tip may advance while that immutable common receiver round is audited.
 */
export async function readReceiverAnchoredTronSolidV4(readLatest,readBlock,at,profile,previous) {
  const rawLatest=await readLatest(),latest=normalizeTronBlock(rawLatest);
  // An advancing live context is bounded by the unchanged whole-round 30 s
  // guard plus registered skew. This does not change selected-block freshness,
  // certificate time, the source query timer or the quorum's audit deadline.
  need(BigInt(latest.timestampMs)<=BigInt(at)+30000n+BigInt(profile.maximumClockSkewMs),'FUTURE_BLOCK');
  if(previous){
    need(BigInt(latest.height)>=BigInt(previous.height)&&BigInt(latest.timestampMs)>=BigInt(previous.timestampMs),'TRON_GRAPH_ANCESTRY_CHANGED');
    if(latest.height===previous.height)need(same(latest,previous),'TRON_GRAPH_ANCESTRY_CHANGED');
  }
  const headers=[latest];let child=latest,rawChild=rawLatest,selected=null,steps=0n;
  if(BigInt(child.timestampMs)<=BigInt(at))selected={header:child,raw:rawChild};
  while(selected===null||(previous&&BigInt(child.height)>BigInt(previous.height))){
    need(steps<BigInt(profile.maximumAncestry)&&BigInt(child.height)>0n,'TRON_GRAPH_SOLIDIFIED_ANCESTRY_BOUND');steps++;
    const height=(BigInt(child.height)-1n).toString(),rawParent=await readBlock(height),parent=normalizeTronBlock(rawParent,height==='0');
    need(parent.height===height,'TRON_GRAPH_REQUESTED_HEIGHT');
    need(child.parentHash===parent.hash&&BigInt(parent.timestampMs)<=BigInt(child.timestampMs),'TRON_GRAPH_CANONICAL_ANCESTRY_CHANGED');
    if(previous&&parent.height===previous.height)need(same(parent,previous),'TRON_GRAPH_ANCESTRY_CHANGED');
    child=parent;rawChild=rawParent;headers.push(parent);
    if(selected===null&&BigInt(child.timestampMs)<=BigInt(at))selected={header:child,raw:rawChild};
  }
  // Every previously traversed header is independently fetched again, including
  // the actual latest solid tip. No old source observation supplies its truth.
  const rechecks=await readOriginalKnownTronHeadersV4(headers,
    async header=>normalizeTronBlock(await readBlock(header.height),header.height==='0'));
  for(let i=0;i<headers.length;i++){
    const header=headers[i],current=originalTronHeaderReadV4(rechecks[i]);
    need(same(header,current),'TRON_GRAPH_ANCESTRY_CHANGED');
  }
  checkFreshBlock(selected.header,at,{maxBlockAgeMs:Number(profile.maximumBlockAgeMs),maxFutureSkewMs:Number(profile.maximumClockSkewMs)});
  return {raw:selected.raw,latest};
}
