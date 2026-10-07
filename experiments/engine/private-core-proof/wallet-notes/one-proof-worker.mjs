/** In-memory bounded one-operation protocol. fd3 only typed proof result. */
import {writeSync} from 'node:fs';
import {proveWallet,verifyWallet} from './prover.mjs';
import {WALLET_MODES,assertWalletStatement} from '../../../../packages/engine/src/wallet/notes/private-wallet-note-encoding.mjs';
const parentPid=process.ppid,parentWatch=setInterval(()=>{if(process.ppid!==parentPid)process.exit(2);},1000);
const chunks=[];let size=0,request,encoded;
const exact=(o,fields)=>{if(!o||typeof o!=='object'||Array.isArray(o)||Object.keys(o).sort().join(',')!==fields.sort().join(','))throw Error('PC23_WORKER_FIELDS');};
const scrub=o=>{if(Array.isArray(o)){for(let i=0;i<o.length;i++){if(typeof o[i]==='object')scrub(o[i]);else o[i]=0;}}else if(o&&typeof o==='object'){for(const k of Object.keys(o)){if(typeof o[k]==='object')scrub(o[k]);else o[k]=null;}}};
try{for await(const chunk of process.stdin){size+=chunk.length;if(size>4*1024*1024)throw Error('PC23_INPUT_LIMIT');chunks.push(chunk);}const data=Buffer.concat(chunks);try{request=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(data));}finally{data.fill(0);}exact(request,['mode','input','label','operation']);if(!WALLET_MODES.includes(request.mode))throw Error('PC23_MODE');let result;
 if(request.operation==='prove')result=await proveWallet(request.mode,request.input,request.label);
 else if(request.operation==='verify'){exact(request.input,['proofBase64','publicInputs']);const b=request.input.proofBase64;if(typeof b!=='string'||!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(b))throw Error('PC23_BASE64');const proof=Buffer.from(b,'base64');if(proof.toString('base64')!==b)throw Error('PC23_BASE64');assertWalletStatement(request.mode,request.input.publicInputs);try{result=await verifyWallet(request.mode,{proof,publicInputs:request.input.publicInputs},request.label);}finally{proof.fill(0);}}
 else throw Error('PC23_OPERATION');
 encoded=Buffer.from(JSON.stringify({ok:true,result:request.operation==='prove'?{...result,proof:Buffer.from(result.proof).toString('base64')}:result}));if(encoded.length>2*1024*1024)throw Error('PC23_OUTPUT_LIMIT');let offset=0;while(offset<encoded.length)offset+=writeSync(3,encoded,offset,encoded.length-offset);writeSync(3,'\n');
}catch(error){writeSync(3,JSON.stringify({ok:false,code:/^PC23_[A-Z0-9_]+$/.test(error.message)?error.message:'PC23_PROOF_WORKER_FAILURE',name:/^[A-Za-z][A-Za-z0-9_]{0,63}$/.test(error.name)?error.name:'Error'})+'\n');process.exitCode=1;}
finally{clearInterval(parentWatch);for(const c of chunks)c.fill(0);encoded?.fill(0);scrub(request);}
