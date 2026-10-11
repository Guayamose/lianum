/** One owned proof process, bounded input/output, no saved private witness. */
import {writeSync} from 'node:fs';
import {proveAssembly,proveRejectedAssemblyCandidate} from '../toolchain/assembly-prover.mjs';
const chunks=[];let size=0;
try {
 for await(const chunk of process.stdin){size+=chunk.length;if(size>4*1024*1024)throw Error('PC18_PROOF_INPUT_LIMIT');chunks.push(chunk);}
 const data=Buffer.concat(chunks),request=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(data));data.fill(0);
 if(!request||Object.keys(request).sort().join(',')!=='input,label,mode,operation')throw Error('PC18_PROOF_REQUEST_FIELDS');
 const operation=request.operation==='prove'?proveAssembly:request.operation==='reject-candidate'?proveRejectedAssemblyCandidate:null;if(!operation)throw Error('PC18_PROOF_OPERATION');
 const result=await operation(request.mode,request.input,request.label);
 const encoded=Buffer.from(JSON.stringify({ok:true,result:{...result,proof:Buffer.from(result.proof).toString('base64')}}));if(encoded.length>2*1024*1024)throw Error('PC18_PROOF_OUTPUT_LIMIT');
 let offset=0;while(offset<encoded.length)offset+=writeSync(3,encoded,offset,encoded.length-offset);writeSync(3,'\n');
} catch(error){writeSync(3,JSON.stringify({ok:false,code:/^PC18_[A-Z0-9_]+$/.test(error.message)?error.message:'PC18_PROOF_WORKER_FAILURE',name:error.name})+'\n');process.exitCode=1;}
