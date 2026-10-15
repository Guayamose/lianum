/** Readonly graph-output identity DATA. This module cannot select an OWNER,
 * open a note, issue a broker or grant proof/signing/financial authority. */
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {types} from 'node:util';
import {canonical} from '@lianum/engine/crypto/privacy';
export const PAGED_HISTORICAL_GRAPH_OUTPUT_V15='DEVICE_PAGED_ORIGINAL_HISTORICAL_GRAPH_OUTPUT_V5';
const fields=['profile','sourceId','graphId','role','id','ordinal','authorizationRoot','outputsCommitment','sparseOutput'];
function object(raw){assert.ok(raw&&!types.isProxy(raw)&&Object.getPrototypeOf(raw)===Object.prototype,'PAGED_HISTORICAL_GRAPH_OUTPUT_DATA');return Object.getOwnPropertyDescriptors(raw);}
function value(properties,key){const p=properties[key];assert.ok(p&&Object.hasOwn(p,'value'),'PAGED_HISTORICAL_GRAPH_OUTPUT_ACCESSOR');return p.value;}
function hash(raw){assert.match(raw,/^[0-9a-f]{64}$/,'PAGED_HISTORICAL_GRAPH_OUTPUT_HASH');assert.notEqual(raw,'0'.repeat(64),'PAGED_HISTORICAL_GRAPH_OUTPUT_HASH');return raw;}
export function normalizePagedHistoricalGraphOutputDataV15(raw){
 assert.equal(arguments.length,1);const props=object(raw);assert.deepEqual(Reflect.ownKeys(props).sort(),[...fields].sort(),'PAGED_HISTORICAL_GRAPH_OUTPUT_FIELDS');const out=Object.fromEntries(fields.map(key=>[key,value(props,key)]));assert.equal(out.profile,PAGED_HISTORICAL_GRAPH_OUTPUT_V15);hash(out.sourceId);hash(out.authorizationRoot);assert.ok(typeof out.graphId==='string'&&/^[A-Za-z0-9_.-]{1,128}$/.test(out.graphId));assert.ok(['payout','change','recovery'].includes(out.role),'PAGED_HISTORICAL_GRAPH_OUTPUT_ROLE');assert.equal(out.sparseOutput,out.role==='payout','PAGED_HISTORICAL_GRAPH_OUTPUT_MEMBERSHIP');
 if(out.role==='payout'){assert.ok(typeof out.id==='string'&&/^[A-Za-z][A-Za-z0-9_.-]{0,79}$/.test(out.id));assert.match(out.ordinal,/^(?:0|[1-9][0-9]*)$/);assert.ok(BigInt(out.ordinal)<(1n<<64n));hash(out.outputsCommitment);}else{assert.equal(out.id,null);assert.equal(out.ordinal,null);assert.equal(out.outputsCommitment,null);}
 return Object.freeze(out);
}
export function pagedHistoricalGraphOutputTargetSourceIdV15(raw,commitment,nullifier){
 assert.equal(arguments.length,3);const output=normalizePagedHistoricalGraphOutputDataV15(raw);hash(commitment);hash(nullifier);return createHash('sha256').update(canonical({sourceId:output.sourceId,commitment,nullifier})).digest('hex');
}
export function readPagedHistoricalGraphOutputBindingDataV15(raw){
 assert.equal(arguments.length,1);const props=object(raw);if(!Object.hasOwn(props,'graphOutput'))return null;const output=normalizePagedHistoricalGraphOutputDataV15(value(props,'graphOutput')),sourceId=value(props,'targetSourceId'),commitment=value(props,'targetCommitment'),nullifier=value(props,'targetNullifier');assert.equal(sourceId,pagedHistoricalGraphOutputTargetSourceIdV15(output,commitment,nullifier),'PAGED_HISTORICAL_GRAPH_OUTPUT_IDENTITY');return output;
}
