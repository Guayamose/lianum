/** Exercise the complete local SOURCE owner. Only reopening the lower service,
 * deployment review, and its system guard are fixture ports. The actual TLS,
 * pinned caller bytes, owner WeakMap, detached context and close gate execute. */
import test,{mock} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {execFileSync} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {devicePublicKey} from '../../../../../apps/mobile/src/custody/signing.mjs';
const backend=new URL('../../../src/',import.meta.url);
const project=fileURLToPath(new URL('../../../../../',import.meta.url));
const originalURL=new URL('operations/local/device-external-flat-local-operator-v1.mjs',backend);

test('HOST real SOURCE local opener owns context identity and revokes it before closing its service',async t=>{
 const scratch=await mkdtemp(join(tmpdir(),'device-source-local-context-'));
 t.after(()=>rm(scratch,{recursive:true,force:true}));
 const certificate=join(scratch,'certificate.pem'),privateKey=join(scratch,'key.pem');
 execFileSync('openssl',['req','-x509','-newkey','ec','-pkeyopt','ec_paramgen_curve:P-256','-nodes','-keyout',privateKey,'-out',certificate,'-days','2','-subj','/CN=localhost','-addext','basicConstraints=critical,CA:FALSE','-addext','subjectAltName=DNS:localhost,IP:127.0.0.1'],{stdio:'ignore'});
 const tls={certificate:await readFile(certificate,'utf8'),privateKey:await readFile(privateKey,'utf8')};
 const key=new Uint8Array(32);key[31]=1;t.after(()=>key.fill(0));
 const configuration={origin:'https://localhost:9443',devicePublicKey:devicePublicKey(key),tls,depositAmountAtomic:'1'};
 const runtime=Object.freeze({}),system=Object.freeze({}),account=Object.freeze({}),targetAccount=Object.freeze({}),context=Object.freeze({runtime,system,account,targetAccount});
 const services=new Set(),opens=[],closes=[];let expected='external2',descriptor=configuration,reviewed=0,delayClose=false,releaseClose;
 function reopen(kind){return async input=>{
  assert.equal(kind,expected);assert.deepEqual(input,{tls,host:'0.0.0.0',...(kind.endsWith('3')?{devicePublicKey:configuration.devicePublicKey}:{})});
  const service=Object.freeze({descriptor:Object.freeze({origin:descriptor.origin,devicePublicKey:descriptor.devicePublicKey}),close(){closes.push(service);return delayClose?new Promise(resolve=>{releaseClose=resolve;}):Promise.resolve({closed:true});}});
  services.add(service);opens.push(service);return service;
 };}
 const boundaries=[
  ['@lianum/proofs/catalog',{ROOT:scratch,FLAT:join(project,'fixture','flat','leaf')}],
  [new URL('operations/recovery/device-external-flat-original-source-v2.mjs',backend),{
   reopenOriginalDeviceExternalFlatGraphSourceV2:reopen('external2'),reopenOriginalDeviceUniswapGraphSourceV2:reopen('uniswap2'),
   reopenOriginalDeviceExternalFlatGraphSourceV3:reopen('external3'),reopenOriginalDeviceUniswapGraphSourceV3:reopen('uniswap3'),reopenOriginalDeviceAaveStaticGraphSourceV3:reopen('aave3'),
  }],
  [new URL('operations/local/device-external-flat-source-graph-service-v1.mjs',backend),{readOriginalDeviceExternalFlatGraphObservationContextV1(service){assert.ok(services.has(service));return context;}}],
  [new URL('operations/deployments/system/deploy-system.mjs',backend),{assertOwnedFlatSystem(r,s){assert.equal(r,runtime);assert.equal(s,system);}}],
  [new URL('operations/releases/native-value/native-value-dev-release-v5.mjs',backend),{NATIVE_VALUE_DEV_RELEASE_V5:Object.freeze({sourceFiles:[{path:'wallet-platform/modules/operations/local/device-external-flat-local-operator-v1.mjs'}]})}],
  [new URL('operations/deployments/native-value/native-value-deployment-artifacts-v2.mjs',backend),{loadNativeValueDevDeploymentArtifactsV5:async()=>{reviewed++;}}],
 ];
 const namespaces=await Promise.all(boundaries.map(([path])=>import(path))),mocks=[];
 t.after(()=>{for(const item of mocks.reverse())item.restore();});
 for(const [i,[path,exports]]of boundaries.entries())mocks.push(mock.module(path,{exports:{...namespaces[i],...exports}}));
 const api=await import(originalURL.href+'?host='+randomUUID()),read=api.readOriginalDeviceGraphSourceLocalOperatorContextV2;
 const stranger=await import(originalURL.href+'?host='+randomUUID());
 for(const [kind,name]of [
  ['external2','openOriginalDeviceExternalFlatSourceLocalOperatorV2'],['uniswap2','openOriginalDeviceUniswapSourceLocalOperatorV2'],
  ['external3','openOriginalDeviceExternalFlatSourceLocalOperatorV3'],['uniswap3','openOriginalDeviceUniswapSourceLocalOperatorV3'],['aave3','openOriginalDeviceAaveStaticSourceLocalOperatorV3'],
 ]){
  expected=kind;const operator=await api[name](configuration),service=opens.at(-1);
  assert.equal(Object.isFrozen(operator),true);assert.equal(operator.sourceObservationImplemented,true);assert.equal(operator.automaticFunding,false);
  assert.throws(()=>read({...operator}),/DEVICE_GRAPH_SOURCE_ORIGINAL_LOCAL_OPERATOR/);
  assert.throws(()=>read(new Proxy(operator,{})));assert.throws(()=>read(Object.freeze({})),/DEVICE_GRAPH_SOURCE_ORIGINAL_LOCAL_OPERATOR/);
  assert.throws(()=>stranger.readOriginalDeviceGraphSourceLocalOperatorContextV2(operator),/DEVICE_GRAPH_SOURCE_ORIGINAL_LOCAL_OPERATOR/);
  const first=read(operator),next=read(operator);assert.notEqual(first,next);assert.equal(Object.isFrozen(first),true);
  assert.deepEqual(Object.keys(first).sort(),['account','runtime','service','system','targetAccount']);
  for(const key of ['runtime','system','account','targetAccount'])assert.equal(first[key],context[key]);assert.equal(first.service,service);
  assert.throws(()=>{first.account={};},TypeError);assert.equal(read(operator).account,account);
  delayClose=true;const closing=operator.close();assert.equal(closes.at(-1),service);assert.throws(()=>read(operator),/DEVICE_GRAPH_SOURCE_LOCAL_CLOSED/);
  releaseClose({closed:true});assert.deepEqual(await closing,{closed:true});delayClose=false;
 }
 assert.equal(reviewed,5);assert.equal(opens.length,5);assert.equal(closes.length,5);
 expected='external2';descriptor={...configuration,origin:'https://localhost:9444'};
 await assert.rejects(api.openOriginalDeviceExternalFlatSourceLocalOperatorV2(configuration));assert.equal(closes.at(-1),opens.at(-1));
 const otherKey=new Uint8Array(32);otherKey[31]=2;descriptor={...configuration,devicePublicKey:devicePublicKey(otherKey)};otherKey.fill(0);
 await assert.rejects(api.openOriginalDeviceExternalFlatSourceLocalOperatorV2(configuration));assert.equal(closes.at(-1),opens.at(-1));
 descriptor=configuration;const before=opens.length;
 await assert.rejects(api.openOriginalDeviceExternalFlatSourceLocalOperatorV2({...configuration,origin:'https://unpaired.invalid'}),/DEVICE_EXTERNAL_LOCAL_TLS_IDENTITY/);
 await assert.rejects(api.openOriginalDeviceExternalFlatSourceLocalOperatorV2({...configuration,depositAmountAtomic:'0'}),/DEVICE_EXTERNAL_LOCAL_CONFIGURATION/);
 assert.equal(opens.length,before);assert.equal(configuration.tls,tls);
});
