/** Bounded private diagnostics; never retain exception text or private data. */
import {mkdirSync,writeFileSync} from 'node:fs';
import {join,relative} from 'node:path';
import {randomUUID} from 'node:crypto';
import {projectRoot,resourceRoot} from '@lianum/environment';
import {readNativeRpcContractRejectionDataV1} from '../../native-wallet/rpc-contract-rejection-data-v1.mjs';
const stages=new Set(['GRAPH_RECIPIENT','GRAPH_HTTP']);
export function retainDevicePagedFailureMetadataV3(error,stage){try{
 if(!stages.has(stage))return;
 const frames=[];
 for(const row of String(error?.stack??'').slice(0,65536).split('\n').slice(1,65)){
  const m=/\b(file:\/\/[^()\r\n?#]+\.mjs):([1-9][0-9]{0,8}):([1-9][0-9]{0,8})\)?$/.exec(row);
  if(!m)continue;const file=new URL(m[1]).pathname,path=relative(projectRoot,file);
  if(!file.startsWith(projectRoot+'/')||!/^[A-Za-z0-9_./-]+$/.test(path)||path.split('/').includes('..'))continue;
  frames.push({path,line:Number(m[2]),column:Number(m[3])});if(frames.length===6)break;
 }
 const code=typeof error?.code==='string'&&/^[A-Z][A-Z0-9_]{0,100}$/.test(error.code)?error.code:typeof error?.message==='string'&&/^(?:PAGED_GRAPH|PAEG_PAGED)_[A-Z0-9_]{1,100}$/.test(error.message)?error.message:null;
 // The Original proof controller wraps worker failure for its public IPC.
 // Keep its bounded underlying code separately from any cleanup failure;
 // exception messages, input data and witness values remain excluded.
 const underlying=Object.getOwnPropertyDescriptor(error??{},'originalProofCode')?.value;
 const originalProofCode=typeof underlying==='string'&&/^PAEG_PAGED_[A-Z0-9_]{1,100}$/.test(underlying)?underlying:null;
 const directory=join(resourceRoot('engine'),'evidence/paeg-proof-attempts');mkdirSync(directory,{recursive:true,mode:0o700});
 writeFileSync(join(directory,'paged-graph-'+randomUUID()+'-failure.json'),JSON.stringify({format:'PAGED_GRAPH_PRIVATE_FAILURE_METADATA_V3',stage,code,originalProofCode,rpcContractRejection:readNativeRpcContractRejectionDataV1(error),clockGapMs:code==='MOBILE_PAGED_CLOCK_FUTURE'&&Number.isSafeInteger(error?.clockGapMs)&&error.clockGapMs>=0&&error.clockGapMs<=3600000?error.clockGapMs:null,frames})+'\n',{mode:0o600,flag:'wx'});
}catch{}}
