import {PRIVATE_RESOURCE_FLOORS,PRIVATE_RESOURCE_POLICY,PRIVATE_PROOF_WORKER_RSS_LIMIT} from '../../../../packages/engine/src/crypto/private-resource-policy.mjs';
/** PC18 actor-owned short-lived worker for unchanged PC15 reserve/withdraw.
 * Private note witnesses remain on this actor->child pipe, never in evidence.
 */
import {writeSync,readFileSync,statfsSync,mkdirSync,writeFileSync} from 'node:fs';import {fileURLToPath} from 'node:url';import {createNoteProver} from '../native-notes/prover.mjs';import {sha256} from '../../../../packages/engine/src/notes/private-note-encoding.mjs';
const root=fileURLToPath(new URL('.',import.meta.url)),chunks=[];let size=0,prover,report,path;
const save=()=>{if(path)writeFileSync(path,JSON.stringify(report,null,2)+'\n');};
const check=()=>{const d=statfsSync(root),ram=Number(/MemAvailable:\s+(\d+)/.exec(readFileSync('/proc/meminfo','utf8'))[1])*1024;if(ram<PRIVATE_RESOURCE_FLOORS.availableRAM||d.bavail*d.bsize<PRIVATE_RESOURCE_FLOORS.freeDisk)throw Error('PC18_RESOURCE_FLOOR');};
const stop=code=>{if(report){report.phase='bounded-abort';report.failure={code};save();}process.exit(2);};let monitor,timer;
try {
 for await(const chunk of process.stdin){size+=chunk.length;if(size>4*1024*1024)throw Error('PC18_PROOF_INPUT_LIMIT');chunks.push(chunk);}
 const data=Buffer.concat(chunks),r=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(data));data.fill(0);
 if(!r||Object.keys(r).sort().join(',')!=='input,label,mode,operation'||r.operation!=='prove'||!['reserve','withdraw'].includes(r.mode)||typeof r.label!=='string'||!/^[a-zA-Z0-9_-]{1,100}$/.test(r.label))throw Error('PC18_NOTE_REQUEST');
 const stamp=new Date().toISOString().replace(/[:.]/g,'-');mkdirSync(root+'../../../evidence/m18-note-proof-attempts',{recursive:true});path=root+'../../../evidence/m18-note-proof-attempts/'+stamp+'-'+r.label+'.json';report={classification:'GENUINE_UNCHANGED_PC15_NOTE_PROOF_PC18_ACTOR_CHILD',mode:r.mode,label:r.label,phase:'initializing',startedAt:new Date().toISOString()};save();
 monitor=setInterval(()=>{try{check();}catch{stop('PC18_RESOURCE_FLOOR');}},1000);timer=setTimeout(()=>stop('PC18_NOTE_PROOF_TIMEOUT'),900000);check();globalThis.fetch=async()=>{throw Error('PC18_OFFLINE_NOTE_PROOF');};
 prover=await createNoteProver({saveArtifacts:false});report.phase='proving';save();const result=await prover.prove(r.mode,r.input,r.label);await prover.close();prover=undefined;
 report.phase='completed';report.metrics=result.metrics;report.proofSHA256=sha256(result.proof).toString('hex');save();const encoded=Buffer.from(JSON.stringify({ok:true,result:{...result,proof:Buffer.from(result.proof).toString('base64')}}));if(encoded.length>2*1024*1024)throw Error('PC18_PROOF_OUTPUT_LIMIT');let n=0;while(n<encoded.length)n+=writeSync(3,encoded,n,encoded.length-n);writeSync(3,'\n');
}catch(error){if(report){report.failedPhase=report.phase;report.phase='failed';report.failure={name:error.name,code:/^PC18_[A-Z0-9_]+$/.test(error.message)?error.message:'PC18_NOTE_TOOLCHAIN_OR_CONSTRAINT_FAILURE'};save();}writeSync(3,JSON.stringify({ok:false,code:/^PC18_[A-Z0-9_]+$/.test(error.message)?error.message:'PC18_NOTE_PROOF_FAILURE',name:error.name})+'\n');process.exitCode=1;}
finally{clearInterval(monitor);clearTimeout(timer);if(prover)await prover.close();if(report){report.completedAt=new Date().toISOString();report.processResourceUsage=process.resourceUsage();save();}}
