/** Protocol guards with controlled clocks; no hardware, signatures, funds or RPC. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {generateKeyPairSync} from 'node:crypto';

test('Paged wire epochs stay real while owner and graph frames retain monotonic expiry',async t=>{
 const dateProperty=Object.getOwnPropertyDescriptor(Date,'now'),performanceProperty=Object.getOwnPropertyDescriptor(globalThis,'performance');
 let wall=Date.now(),monotonic=0;const base=wall;
 Object.defineProperty(Date,'now',{...dateProperty,value:()=>wall});
 Object.defineProperty(globalThis,'performance',{configurable:true,writable:true,value:{now:()=>monotonic}});
 t.after(()=>{Object.defineProperty(Date,'now',dateProperty);Object.defineProperty(globalThis,'performance',performanceProperty);});
 const P=await import('../src/device-paged-owner-v3.mjs'),C=await import('../src/device-paged-graph-v3.mjs');
 // Local leases keep their rollback-resistant clock; peer epochs must not use it.
 wall-=1000;monotonic+=60000;assert.equal(P.devicePagedNowV3(),base+60000);assert.equal(P.devicePagedWallNowV3(),wall);
 const hex=character=>character.repeat(64),publicKey=generateKeyPairSync('x25519').publicKey.export({format:'der',type:'spki'}).toString('base64');
 const descriptor=P.normalizeDevicePagedDescriptorV3({profile:P.DEVICE_PAGED_OWNER_V3,graphProfile:P.DEVICE_PAGED_GRAPH_V3,sparseEncoding:P.DEVICE_PAGED_SPARSE_V3,origin:'https://127.0.0.1:9443',pairingId:'clock-frame-pairing',devicePublicKey:'04'+'a'.repeat(128),deadlineMs:base+9*3600000,chainId:'31337',
  ...Object.fromEntries(['genesis','scope','policy','assetIdentity','domain','hubDomain','registryCommitment','manifestSHA256','consumerSHA256','poolCodeHash','stateCodeHash','nativeCodeHash','mathCodeHash'].map(name=>[name,hex('a')])),
  ...Object.fromEntries(['pool','state','native','math'].map((name,i)=>[name,'0x'+String(i+1).repeat(40)]))});
 const rootId=hex('b'),challengeId='clock-challenge-0001',nonce=hex('c'),graphId='clock-graph-0001',blockHash='0x'+hex('d');
 const consent={version:3,profile:P.DEVICE_PAGED_OWNER_V3,descriptor,action:'READ_STATE',mode:null,jobId:'clock-read-0001',challengeId,nonce,rootId,revision:1,authorizationRoot:null,reserveNullifier:null,previousCommitment:null,nextCommitment:null,publicInputs:null,witnessSHA256:null,recipient:null,proofSHA256:null,expiresAt:wall+15000};
 const status={profile:P.DEVICE_PAGED_OWNER_V3,descriptor,jobs:[],note:null,issuedAt:wall,expiresAt:wall+15000,blockHash,blockNumber:'1',epoch:'1'};
 const graphConsent={version:3,profile:C.DEVICE_PAGED_GRAPH_OWNER_V3,descriptor,action:'READ_GRAPH',graphId,jobId:'clock-graph-read-0001',rootId,revision:1,commandSHA256:hex('e'),replyPublicKey:publicKey,challengeId,nonce,authorizationRoot:null,reserveNullifier:null,progressCommitment:null,
  recipient:{type:'flat-private-proof-input-ready',profile:'ORIGINAL_ROLE_PRIVATE_PROOF_TRANSIT_V1',relation:P.DEVICE_PAGED_MODES_V3.reserve.relation,role:'owner',jobId:'clock-graph-read-0001',recipientPublicKey:publicKey},expiresAt:wall+14000};
 const graphStatus={profile:C.DEVICE_PAGED_GRAPH_OWNER_V3,descriptor,graphId,rootId,revision:1,authorizationRoot:null,reserveNullifier:null,progressCommitment:null,readyCommitment:null,sourceCommitment:null,sourceNullifier:null,pages:null,nodes:null,budget:null,settleBefore:null,phase:'BUILDING',job:null,pending:false,issuedAt:wall,expiresAt:wall+15000,blockHash,blockNumber:'1'};
 const cases=[[P.validateDevicePagedConsentFreshV3,consent],[P.validateDevicePagedStatusFreshV3,status],[C.validateDevicePagedGraphConsentFreshV3,graphConsent],[C.validateDevicePagedGraphPublicFreshV3,graphStatus]];
 for(const [validate,frame]of cases)assert.equal(validate(frame).expiresAt,frame.expiresAt);
 const consentCode=expected=>error=>error instanceof Error&&error.message==='MOBILE_PAGED_GRAPH_MESSAGE'&&error.code===expected&&Object.getOwnPropertyDescriptor(error,'code')?.writable===false;
 const permissionBytes=C.devicePagedGraphPermissionMessageV3(graphConsent);
 assert.deepEqual(C.devicePagedGraphPermissionMessageV3(C.validateDevicePagedGraphConsentFreshV3(graphConsent)),permissionBytes,'diagnostic classification never changes the signed frame');
 assert.throws(()=>C.validateDevicePagedGraphConsentFreshV3(graphConsent,NaN),consentCode('MOBILE_PAGED_GRAPH_CONSENT_CLOCK_INVALID'));
 assert.equal(C.validateDevicePagedGraphConsentFreshV3(graphConsent,wall-1001).expiresAt,graphConsent.expiresAt,'an already registered exact permission retains its elapsed deadline through wall rollback');
 assert.throws(()=>C.validateDevicePagedGraphConsentFreshV3({...graphConsent,challengeId:'clock-new-future-frame'},wall-1001),consentCode('MOBILE_PAGED_GRAPH_CONSENT_FUTURE'));
 assert.throws(()=>C.validateDevicePagedGraphConsentFreshV3(graphConsent,graphConsent.expiresAt),consentCode('MOBILE_PAGED_GRAPH_CONSENT_EXPIRED'));
 assert.throws(()=>C.validateDevicePagedGraphConsentFreshV3({...graphConsent,descriptor:{...descriptor,deadlineMs:graphConsent.expiresAt}},graphConsent.expiresAt),consentCode('MOBILE_PAGED_GRAPH_CONSENT_DEADLINE'));
 const exactWindow={...graphConsent,challengeId:'clock-challenge-boundary',nonce:hex('1'),expiresAt:wall+15000};
 assert.equal(C.validateDevicePagedGraphConsentFreshV3(exactWindow).expiresAt,exactWindow.expiresAt,'15 seconds remain the exact accepted upper bound');
 assert.throws(()=>C.validateDevicePagedGraphConsentFreshV3({...exactWindow,challengeId:'clock-challenge-future',expiresAt:wall+15001}),consentCode('MOBILE_PAGED_GRAPH_CONSENT_FUTURE'));
 assert.throws(()=>C.validateDevicePagedGraphConsentFreshV3({...graphConsent,expiresAt:graphConsent.expiresAt-1}),/MOBILE_PAGED_CLOCK_BINDING/);
 assert.throws(()=>C.validateDevicePagedGraphConsentFreshV3({...graphConsent,nonce:'malformed'}),error=>error.code===undefined&&error.message==='MOBILE_PAGED_OWNER_BINDING');
 assert.throws(()=>P.validateDevicePagedConsentFreshV3({...consent,expiresAt:consent.expiresAt-1}),/MOBILE_PAGED_CLOCK_BINDING/);
 assert.throws(()=>P.validateDevicePagedConsentFreshV3({...consent,nonce:hex('f'),expiresAt:wall+15001}),/MOBILE_PAGED_OWNER_BINDING/);
 assert.throws(()=>C.validateDevicePagedGraphPublicFreshV3({...graphStatus,issuedAt:wall+1,expiresAt:wall+15001}),error=>error.code==='MOBILE_PAGED_GRAPH_STATUS_FUTURE');
 // Wall rollback/freeze cannot renew the original frame's remaining 15 seconds.
 monotonic+=15001;
 for(const [validate,frame]of cases){
  if(validate===C.validateDevicePagedGraphConsentFreshV3)assert.throws(()=>validate(frame),consentCode('MOBILE_PAGED_GRAPH_CONSENT_EXPIRED'));
  else if(validate===C.validateDevicePagedGraphPublicFreshV3)assert.throws(()=>validate(frame),error=>error.code==='MOBILE_PAGED_GRAPH_STATUS_EXPIRED');
  else assert.throws(()=>validate(frame),/MOBILE_PAGED_CLOCK_EXPIRED/);
 }
});
