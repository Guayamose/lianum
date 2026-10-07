import { performance } from 'node:perf_hooks';
import { writeFile } from 'node:fs/promises';
import { createState, makeGraph, transition, graphHash } from '../src/core.mjs';
import { newIdentity, sign, encryptJson, decryptJson } from '../src/privacy.mjs';
import { simulationReceipt } from '../src/simulation.mjs';
const now=1800000000000,user=newIdentity(),observer=newIdentity(),trust={now,userPublicKey:user.publicKey,verifierPublicKey:observer.publicKey};
const samples=[];
for(let i=0;i<120;i++){
  const begin=performance.now(),graph=makeGraph(now),hash=graphHash(graph);
  let state=transition(createState(now),{type:'open',graph,signature:sign(graph,user.privateKey),permission:'demo-payment'},trust);
  for(const leg of graph.legs)state=transition(state,{type:'receipt',hash,receipt:simulationReceipt(graph,leg.id,observer.privateKey,now)},trust);
  transition(state,{type:'settle',hash},trust);samples.push(performance.now()-begin);
}
samples.sort((a,b)=>a-b);const begin=performance.now();for(let i=0;i<5;i++)decryptJson(encryptJson(createState(now),'synthetic-profile-only'),'synthetic-profile-only');
const result={classification:'LOCAL_MICROBENCHMARK_NOT_CHAIN_THROUGHPUT',node:process.version,platform:process.platform,iterations:samples.length,graphLegs:3,coreMs:{median:samples[60],p95:samples[114],max:samples[119]},vaultCryptoRoundtripMeanMs:(performance.now()-begin)/5,rssBytes:process.memoryUsage().rss,limitations:['one machine','no network or ZK proving','warm process','scrypt deliberately dominates vault operations']};
await writeFile(new URL('../evidence/profile.json',import.meta.url),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result,null,2));
