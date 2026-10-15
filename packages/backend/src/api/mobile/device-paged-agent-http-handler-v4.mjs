/** Mechanical bounded transport for an operator-installed original reader.
 * The request cannot create a reader, select a Source or issue spending rights. */
import assert from 'node:assert/strict';
import {assertOriginalDevicePagedAgentHttpApplicationV4} from './device-paged-agent-http-v4.mjs';
import {createDevicePagedAgentMechanicalTransportV4} from './device-paged-agent-transport-v4.mjs';
/** Emission happens only at the higher original application producer. The
 * resulting lower transport port issues no Source/financial capability. */
export function createOriginalDevicePagedAgentHttpTransportV4(application){assert.equal(arguments.length,1);assertOriginalDevicePagedAgentHttpApplicationV4(application);return createDevicePagedAgentMechanicalTransportV4(application.descriptor,(path,body)=>{assertOriginalDevicePagedAgentHttpApplicationV4(application);return application.dispatch(path,body);});}
const paths=new Set(['/v1/mobile/paged-owner/agent/challenges','/v1/mobile/paged-owner/agent/observations','/v1/mobile/paged-owner/agent/revocations']);
export async function handleOriginalDevicePagedAgentHttpRequestV4(application,request,response,isLive){
 assert.equal(arguments.length,4);assertOriginalDevicePagedAgentHttpApplicationV4(application);assert.equal(typeof isLive,'function');
 const live=()=>assert.ok(isLive()===true,'PAGED_AGENT_OPERATOR_CLOSED');live();
 assert.ok(request.headers.origin===undefined||request.headers.origin===application.descriptor.origin,'PAGED_AGENT_OPERATOR_ORIGIN');
 assert.equal(request.headers['x-lianum-paged-pairing-id'],application.descriptor.pairingId,'PAGED_AGENT_OPERATOR_PAIRING_REQUIRED');
 if(request.method!=='POST'||!paths.has(request.url)){response.writeHead(404,{'content-type':'application/json','cache-control':'no-store'});response.end('{"error":"PAGED_AGENT_ROUTE_NOT_FOUND"}');return;}
 assert.ok(/^application\/json(?:;\s*charset=utf-8)?$/i.test(request.headers['content-type']??''),'PAGED_AGENT_OPERATOR_CONTENT_TYPE');
 const chunks=[];let size=0,body;
 try{for await(const chunk of request){size+=chunk.length;assert.ok(size<=8192,'PAGED_AGENT_OPERATOR_BODY_LIMIT');chunks.push(chunk);}live();body=Buffer.concat(chunks);const result=await application.dispatch(request.url,JSON.parse(body.toString('utf8')));live();response.writeHead(200,{'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff'});response.end(JSON.stringify(result));}
 finally{body?.fill(0);for(const chunk of chunks)chunk.fill(0);}
}
