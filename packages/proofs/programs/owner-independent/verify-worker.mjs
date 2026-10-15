import {PRIVATE_RESOURCE_FLOORS,PRIVATE_RESOURCE_POLICY,PRIVATE_PROOF_WORKER_RSS_LIMIT} from '@lianum/engine/crypto/private-resource-policy';
/** Short-lived actual verifier; fd3 result is isolated from toolchain logging. */
import {writeSync,readFileSync,statfsSync} from 'node:fs';import {verifyAssembly} from './prover.mjs';
const parts=[];let bytes=0;const timer=setTimeout(()=>process.exit(2),300000);const monitor=setInterval(()=>{const disk=statfsSync(process.cwd()),ram=Number(/MemAvailable:\s+(\d+)/.exec(readFileSync('/proc/meminfo','utf8'))[1])*1024;if(ram<PRIVATE_RESOURCE_FLOORS.availableRAM||disk.bavail*disk.bsize<PRIVATE_RESOURCE_FLOORS.freeDisk){writeSync(3,JSON.stringify({ok:false,code:'PC18_RESOURCE_FLOOR',name:'Error'})+'\n');process.exit(2);}},1000);
try{
 for await(const b of process.stdin){bytes+=b.length;if(bytes>2*1024*1024)throw Error('PC18_VERIFY_INPUT_LIMIT');parts.push(b);}
 const r=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(Buffer.concat(parts)));
 if(!r||Object.keys(r).sort().join(',')!=='input,label,mode,operation'||r.operation!=='verify'||!r.input||typeof r.input.proofBase64!=='string')throw Error('PC18_VERIFY_REQUEST');
 const expected=['proofBase64','publicInputs',...(Object.hasOwn(r.input,'vkFields')?['vkFields','proofFields']:[])].sort();if(Object.keys(r.input).sort().join(',')!==expected.join(','))throw Error('PC18_VERIFY_PACKAGE');
 const proof=Buffer.from(r.input.proofBase64,'base64');if(proof.toString('base64')!==r.input.proofBase64||proof.length>256*1024)throw Error('PC18_VERIFY_BYTES');
 const publicInputs=r.input.publicInputs.map(v=>{if(typeof v!=='string'||!/^(0|[1-9][0-9]{0,76}|0x[0-9a-f]{64})$/i.test(v))throw Error('PC18_VERIFY_FIELD');const n=BigInt(v);if(n>=21888242871839275222246405745257275088548364400416034343698204186575808495617n)throw Error('PC18_VERIFY_FIELD');return'0x'+n.toString(16).padStart(64,'0');});
 const verified=await verifyAssembly(r.mode,{proof,publicInputs,...(r.input.vkFields?{vkFields:r.input.vkFields,proofFields:r.input.proofFields}:{})});writeSync(3,JSON.stringify({ok:true,result:{verified}})+'\n');
}catch(error){writeSync(3,JSON.stringify({ok:false,code:/^PC18_[A-Z0-9_]+$/.test(error.message)?error.message:'PC18_VERIFY_FAILURE',name:error.name})+'\n');process.exitCode=1;}finally{clearTimeout(timer);clearInterval(monitor);}
