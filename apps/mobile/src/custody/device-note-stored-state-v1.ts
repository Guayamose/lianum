/** Historical private storage DATA decoders. The Vault validates the decoded
 * state against its retained key, descriptor and CAS pointer before use. */
import * as P from '../../../../packages/mobile-protocol/src/device-external-flat-note-v1.mjs';
import * as G from '../../../../packages/mobile-protocol/src/device-external-flat-graph-v1.mjs';
import {decodeStringTableState} from './device-graph-string-table-v5.ts';
const need:(value:unknown)=>asserts value=value=>{if(!value)throw Error('MOBILE_EXTERNAL_FLAT_BINDING');};
function record(value:unknown):Record<string,unknown>{return P.externalFlatExactV1(value,Object.keys(Object(value)));}
export function decodeDeviceNoteStoredStateV1(raw:unknown):unknown{
 let value=record(raw);
 if(typeof value.codec==='string'&&['DEVICE_EXTERNAL_FLAT_GRAPH_STRING_TABLE_V3','DEVICE_EXTERNAL_FLAT_GRAPH_STRING_TABLE_V4','DEVICE_EXTERNAL_FLAT_GRAPH_STRING_TABLE_V5'].includes(value.codec))value=record(decodeStringTableState(value));
 if(!Object.hasOwn(value,'codec'))return value;
 const graphCodec=value.codec==='DEVICE_EXTERNAL_FLAT_GRAPH_STATE_V2';
 const v:Record<string,unknown>=P.externalFlatExactV1(value,['codec','profile','rootId','noteRevision','descriptor','note','jobs','pending','prepared',...(graphCodec?['graph']:[]),...(Object.hasOwn(value,'recoveryFence')?['recoveryFence']:[])]);
 need(v.codec==='DEVICE_EXTERNAL_FLAT_SHARED_DESCRIPTOR_STATE_V1'||graphCodec);
 const descriptor=v.descriptor===null?null:P.normalizeExternalFlatDescriptorV1(v.descriptor);need(Array.isArray(v.jobs)&&v.jobs.length<=2);
 const jobs=v.jobs.map((row:unknown)=>{const r:Record<string,unknown>=P.externalFlatExactV1(row,['profile','jobId','mode','stage','consentFields','observation','errorCode']);need(descriptor!==null);return P.normalizeExternalFlatRowV1({...r,descriptor});});let graph:Record<string,unknown>|null=null;
 if(graphCodec){const original=record(v.graph),g:Record<string,unknown>=P.externalFlatExactV1(original,['draft','change','recovery','row','pending',...(Object.hasOwn(original,'withdrawals')?['withdrawals','withdrawalPending','withdrawalPrepared']:[])]);
  if(Object.hasOwn(g,'withdrawals')){need(Array.isArray(g.withdrawals)&&g.withdrawals.length<=2);g.withdrawals=g.withdrawals.map((w:unknown):unknown=>{const x:Record<string,unknown>=P.externalFlatExactV1(w,['profile','noteRole','row']);return G.normalizeExternalFlatGraphOutputRowV1({...x,row:{...record(x.row),descriptor}});});}
  let row:unknown=null;if(g.row!==null){const r:Record<string,unknown>=P.externalFlatExactV1(g.row,['stage','proofSHA256','publicInputsSHA256','observation','errorCode','authorizationSHA256','graph','outputs']),d=G.normalizeExternalFlatGraphDraftV1(g.draft),keys=['depositJobId','quoteId','jobId','custody','statement','witnessSHA256'] as const,fields=Object.fromEntries(keys.map(k=>[k,d[k]]));row=G.normalizeExternalFlatGraphRowV1({profile:G.DEVICE_EXTERNAL_FLAT_GRAPH_V1,descriptor,reservation:{jobId:d.jobId,stage:r.stage,consentFields:{...fields,proofSHA256:r.proofSHA256,publicInputsSHA256:r.publicInputsSHA256},statement:d.statement,observation:r.observation,errorCode:r.errorCode,authorizationSHA256:r.authorizationSHA256},graph:r.graph,outputs:r.outputs});}
  graph={...g,row};
 }
 return{profile:v.profile,rootId:v.rootId,noteRevision:v.noteRevision,descriptor,note:v.note,jobs,pending:v.pending,prepared:v.prepared,graph,...(Object.hasOwn(v,'recoveryFence')?{recoveryFence:v.recoveryFence}:{})};
}
