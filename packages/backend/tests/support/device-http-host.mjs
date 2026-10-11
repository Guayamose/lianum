import assert from 'node:assert/strict';
import {mock} from 'node:test';
import {EventEmitter} from 'node:events';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {execFileSync} from 'node:child_process';
import {randomUUID} from 'node:crypto';

/** Load the whole HTTP owner with explicit lower account and HTTPS ports.
 * TLS certificate/key checks, request parsing, diagnostics and listener state
 * execute unchanged. No sockets, financial ownership or wallet signing keys exist. */
export async function createDeviceHttpHost(t,accounts,graph=null){
 const scratch=await mkdtemp(join(tmpdir(),'device-http-host-'));
 t.after(()=>rm(scratch,{recursive:true,force:true}));
 const certificate=join(scratch,'certificate.pem'),privateKey=join(scratch,'key.pem');
 execFileSync('openssl',['req','-x509','-newkey','ec','-pkeyopt','ec_paramgen_curve:P-256','-nodes','-keyout',privateKey,'-out',certificate,'-days','2','-subj','/CN=localhost','-addext','basicConstraints=critical,CA:FALSE','-addext','subjectAltName=DNS:localhost,IP:127.0.0.1'],{stdio:'ignore'});
 const tls={certificate:await readFile(certificate,'utf8'),privateKey:await readFile(privateKey,'utf8')},servers=[],mocks=[];
 const fixture=(path,namedExports)=>mocks.push(mock.module(new URL(path,import.meta.url),{namedExports}));
 const denied=()=>assert.fail('HOST_UNEXPECTED_HTTP_OWNERSHIP_PORT');
 fixture('../../src/accounts/authority/device-external-flat-note-authority-v1.mjs',{
  assertOriginalDeviceExternalFlatNoteAuthorityV1(account){assert.ok(accounts.has(account));return accounts.get(account);},
  assertOriginalRetainedDeviceExternalFlatNoteAuthorityV1:denied,
  isOriginalDeviceExternalFlatPrivateShareNoteAuthorityV2:()=>false,
  isOriginalDeviceExternalFlatPrivateNoteAuthorityV3:()=>false,
 });
 fixture('../../src/defi/withdrawals/device-morpho-blue-private-exit-v1.mjs',{assertOriginalDeviceMetaMorphoPrivateExitBindingV2:denied});
 fixture('../../src/accounts/authority/device-external-flat-source-graph-v1.mjs',{assertOriginalDeviceExternalFlatGraphAccountBindingV1:denied});
 fixture('../../src/operations/local/device-external-flat-source-graph-service-v1.mjs',{
  assertOriginalDeviceExternalFlatGraphWorkspaceV1(workspace,input){assert.ok(graph);assert.equal(workspace,graph.workspace);assert.equal(input.account,graph.account);assert.equal(input.targetAccount,graph.targetAccount);},
 });
 mocks.push(mock.module('node:https',{namedExports:{createServer(options,handler){
  assert.equal(options.minVersion,'TLSv1.3');assert.equal(options.maxVersion,'TLSv1.3');assert.deepEqual(options.ALPNProtocols,['http/1.1']);
  const server=new EventEmitter();server.handler=handler;server.listen=(_port,host,ready)=>{assert.equal(host,'127.0.0.1');queueMicrotask(ready);};server.close=done=>queueMicrotask(done);servers.push(server);return server;
 }}}));
 t.after(()=>{for(const item of mocks.reverse())item.restore();});
 const api=await import(new URL('../../src/api/mobile/device-external-flat-note-http-v1.mjs?host='+randomUUID(),import.meta.url));
 function request(index,path,value,origin='https://localhost:9443'){
  const bytes=Buffer.from(JSON.stringify(value)),request={url:path,method:'POST',socket:{encrypted:true},headers:{host:new URL(origin).host,origin,'content-type':'application/json','content-length':String(bytes.length)},async *[Symbol.asyncIterator](){yield bytes;}};
  return new Promise(resolve=>{const response={destroyed:false,writableEnded:false,writeHead(status,headers){this.status=status;this.headers=headers;},end(raw){this.writableEnded=true;resolve({status:this.status,headers:this.headers,body:Buffer.from(raw).toString('utf8')});}};servers[index].handler(request,response);});
 }
 return{api,tls,request,servers};
}
