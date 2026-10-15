/** Mechanical HTTP port only. This brand proves transport construction, not
 * Source authority, spending permission or a current financial observation.
 * The higher producer validates its original application; GraphOperator
 * separately binds the installed port to its exact original account. */
import assert from 'node:assert/strict';
import * as P from '@lianum/mobile-protocol/device/paged-owner-v3';
const ports=new WeakMap(),paths=new Set(['/v1/mobile/paged-owner/agent/challenges','/v1/mobile/paged-owner/agent/observations','/v1/mobile/paged-owner/agent/revocations']);
export function createDevicePagedAgentMechanicalTransportV4(rawDescriptor,dispatch){
 assert.equal(arguments.length,2);const descriptor=P.normalizeDevicePagedDescriptorV3(rawDescriptor);assert.equal(typeof dispatch,'function');const state={descriptor,dispatch,closed:false},port=Object.freeze({close(){state.closed=true;state.dispatch=null;}});ports.set(port,state);return port;
}
export function readDevicePagedAgentMechanicalTransportV4(port){assert.equal(arguments.length,1);const state=ports.get(port);assert.ok(state&&!state.closed,'PAGED_AGENT_MECHANICAL_PORT');return state.descriptor;}
export async function handleDevicePagedAgentMechanicalTransportV4(port,request,response,isLive){
 assert.equal(arguments.length,4);const descriptor=readDevicePagedAgentMechanicalTransportV4(port);assert.equal(typeof isLive,'function');const live=()=>{readDevicePagedAgentMechanicalTransportV4(port);assert.ok(isLive()===true,'PAGED_AGENT_OPERATOR_CLOSED');};live();
 assert.ok(request.headers.origin===undefined||request.headers.origin===descriptor.origin,'PAGED_AGENT_OPERATOR_ORIGIN');assert.equal(request.headers['x-lianum-paged-pairing-id'],descriptor.pairingId,'PAGED_AGENT_OPERATOR_PAIRING_REQUIRED');
 if(request.method!=='POST'||!paths.has(request.url)){response.writeHead(404,{'content-type':'application/json','cache-control':'no-store'});response.end('{"error":"PAGED_AGENT_ROUTE_NOT_FOUND"}');return;}
 assert.ok(/^application\/json(?:;\s*charset=utf-8)?$/i.test(request.headers['content-type']??''),'PAGED_AGENT_OPERATOR_CONTENT_TYPE');const chunks=[];let size=0,body;
 try{for await(const chunk of request){size+=chunk.length;assert.ok(size<=8192,'PAGED_AGENT_OPERATOR_BODY_LIMIT');chunks.push(chunk);}live();body=Buffer.concat(chunks);const result=await ports.get(port).dispatch(request.url,JSON.parse(body.toString('utf8')));live();response.writeHead(200,{'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff'});response.end(JSON.stringify(result));}finally{body?.fill(0);for(const chunk of chunks)chunk.fill(0);}
}
