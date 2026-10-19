/** Public connection identities only. A read task supplies neither an SDK
 * observation nor a financial command. Its consumer performs the original read. */
import {sha256} from '@noble/hashes/sha2.js';
import {normalizePublicWalletConnectionV1} from './public-connection-registry-v1.mjs';
const fail=()=>{throw Error('MOBILE_WALLET_READ_PLAN');};
const hash=value=>Array.from(sha256(new TextEncoder().encode(value)),byte=>byte.toString(16).padStart(2,'0')).join('');
const freeze=value=>{if(value&&typeof value==='object'){Object.values(value).forEach(freeze);Object.freeze(value);}return value;};
/** Public route binding only; the task is never an economic observation. */
export function walletConnectionReadBindingV1(task){
 const entry=normalizePublicWalletConnectionV1(task.profile),id=hash(entry.profile);if(task.id!==id||task.kind!==entry.kind||task.origin!==entry.origin)fail();
 const ordinal=entry.kind==='EXTERNAL_FLAT'?entry.descriptors.findIndex(descriptor=>task.route&&Object.entries({origin:descriptor.origin,pairingId:descriptor.pairingId,lifetime:descriptor.lifetime,pool:descriptor.poolTerms.pool,assetId:descriptor.poolTerms.assetIdentity,genesis:descriptor.poolTerms.genesis,scope:descriptor.poolTerms.scope,policy:descriptor.poolTerms.policy,domain:descriptor.poolTerms.domainCommitment}).every(([key,value])=>task.route[key]===value)):0;
 if(ordinal<0||entry.kind==='PAGED'&&!['GRAPH','NOTE'].includes(task.mode)||task.key!==id+':'+ordinal+(entry.kind==='PAGED'?':'+task.mode:''))fail();
 return freeze({kind:entry.kind,descriptor:entry.descriptors[ordinal],...(entry.kind==='PAGED'?{mode:task.mode}:{})});
}
export function walletConnectionReadTasksV1(entries,devicePublicKey,pagedModes){
 if(!Array.isArray(entries)||entries.length>32)fail();const ids=new Set(),tasks=[];
 for(const saved of entries){
  const entry=normalizePublicWalletConnectionV1(saved.profile,devicePublicKey),id=hash(entry.profile);
  if(saved.id!==id||ids.has(id))fail();ids.add(id);
  const descriptors=entry.kind==='EXTERNAL_FLAT'?entry.descriptors:[entry.descriptors[0]];
  const modes=entry.kind==='PAGED'?(pagedModes?.[id]?.length?pagedModes[id]:['GRAPH']):[null];if(!Array.isArray(modes)||new Set(modes).size!==modes.length||entry.kind==='PAGED'&&modes.some(mode=>!['GRAPH','NOTE'].includes(mode)))fail();
  for(const [ordinal,descriptor]of descriptors.entries()){
   const route=entry.kind==='EXTERNAL_FLAT'?{origin:descriptor.origin,pairingId:descriptor.pairingId,lifetime:descriptor.lifetime,pool:descriptor.poolTerms.pool,assetId:descriptor.poolTerms.assetIdentity,genesis:descriptor.poolTerms.genesis,scope:descriptor.poolTerms.scope,policy:descriptor.poolTerms.policy,domain:descriptor.poolTerms.domainCommitment}:null;
   for(const mode of modes)tasks.push(freeze({key:id+':'+ordinal+(mode?':'+mode:''),id,kind:entry.kind,profile:entry.profile,route,...(mode?{mode}:{}),label:entry.kind==='PAGED'?mode==='NOTE'?"Standalone note":"Inter-network payments":entry.kind==='POSITIONS'?"Related positions":(entry.protocol??'DeFi')+(descriptors.length>1?(ordinal===0?' · origen':" · asset received"):''),origin:entry.origin}));
  }
 }
 return freeze(tasks);
}
export async function runWalletConnectionReadsV1({tasks,read,onProgress,signal}){
 if(!Array.isArray(tasks)||tasks.length>64||typeof read!=='function'||onProgress!==undefined&&typeof onProgress!=='function'||signal!==undefined&&!(signal instanceof AbortSignal))fail();
 let consulted=0,unavailable=0;const publish=async(state,current=null)=>{const value=freeze({state,total:tasks.length,consulted,unavailable,pending:tasks.length-consulted-unavailable,current});if(onProgress)await onProgress(value);return value;};
 for(const task of tasks){if(signal?.aborted)return publish('CANCELLED');await publish('RUNNING',task.label);if(signal?.aborted)return publish('CANCELLED');let ok=false;try{ok=await read(task,signal)===true;}catch(error){if(signal?.aborted)return publish('CANCELLED');}if(signal?.aborted)return publish('CANCELLED');if(ok)consulted++;else unavailable++;}
 return publish(unavailable?'PARTIAL':'COMPLETE');
}
