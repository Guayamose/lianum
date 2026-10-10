import{randomUUID}from'node:crypto';
import{preparePrivateProofJobV1,privateProofAuthorizationBindingV1,readOriginalPrivateProofRecipientV1}from'./private-proof-transit-v1.mjs';
/** Fixed D26/W39 economic producers. Private witness, original prepared VK,
 * official BB5.2 Native12; this grants no account or financial authority. */
import assert from 'node:assert/strict';
import {ChildProcess} from 'node:child_process';
import {createRequire} from 'node:module';
import {Socket} from 'node:net';
import {accessSync,constants,closeSync,fstatSync,lstatSync,openSync,readFileSync,readlinkSync,readdirSync,realpathSync,statSync,unlinkSync} from 'node:fs';
import {join} from 'node:path';
import {ROOT,GOLDEN,EXPERIMENT,LIMITS,MEMORY} from '../catalog.mjs';
import {loadProofProfile,assertExpectedInputs,wipePrivate,PROOF_PROTOCOL,encodeProofMessage,decodeProofMessage,
 exactObject,assertProofRole,normalizePublicInputs,normalizeProofWitness,publicInputsFromWitness,encodePrivateProof,decodePrivateProof,need,proofError} from '../../../engine/src/execution/proofs/proof-worker.mjs';
import {PRIVATE_RESOURCE_POLICY} from '../../../engine/src/crypto/private-resource-policy.mjs';
import {initializePrivateVerifierCRS} from '../../../engine/src/crypto/private-verifier-crs.mjs';
import {CRS,verifyToolchain,verifyCRS} from '../../../../experiments/engine/private-core-proof/wallet-notes/resources.mjs';
import {gunzipSync} from 'node:zlib';
import {pathToFileURL} from 'node:url';
import {regular,hash,resources} from '../tooling/tooling.mjs';
import {nativeProcStatV1} from '../../../../tests/integration/native/native-flow-owned-files-v1.mjs';
import {nativeOwnedRSSV1} from '../../../../tests/integration/native/native-flow-owned-rss-v1.mjs';

export const PRIVATE_NOTE_NATIVE_PROFILE_V1='LIANUM_ECONOMIC_D26_W39_PRIVATE_NATIVE_UNIX_SOCKET_V3';
export const PRIVATE_NOTE_NATIVE_THREADS_V1=12;
export const PRIVATE_NOTE_NATIVE_BINARY_V1=join(EXPERIMENT,'node_modules/@aztec/bb.js/build/amd64-linux/bb');
export const PRIVATE_NOTE_NATIVE_BINARY_SHA256_V1='5a1c1ccd835e257217880936f837847fd74c8d5993497527f070fb2308f9145b';
export const PRIVATE_NOTE_NATIVE_PINS_V1=Object.freeze([
  ['@aztec/bb.js/package.json','709a3a3cbcccb58096d177d3922e3b5e8441cc9d0440dee4f207c293d57e01c2'],
  ['@aztec/bb.js/build/amd64-linux/bb',PRIVATE_NOTE_NATIVE_BINARY_SHA256_V1],
  ['@aztec/bb.js/src/bb_backends/node/native_socket.ts','fa5a96777643988c1cd4aafb9bd99033275f7caa9e8313cac58d39df04daae54'],
  ['@aztec/bb.js/dest/node-cjs/bb_backends/node/native_socket.js','4717f954418316b4fe768e38b4e515fe86d208ee981546ef91bbb2728bd29d73'],
  ['@aztec/bb.js/dest/node-cjs/bb_backends/node/platform.js','e78e62ceda7a577fbdeb7a82c0efa6729920aa8460d2667266210efa5d5e8e2f'],
].map(row=>Object.freeze(row)));
export const PRIVATE_NOTE_NATIVE_WORKERS_V1=Object.freeze({
 deposit_balance:join(ROOT,'proof-workers/native-private-note-deposit-worker-v3.mjs'),
 withdraw_balance:join(ROOT,'proof-workers/native-private-note-withdraw-worker-v3.mjs'),
});
export const PRIVATE_NOTE_NATIVE_LINEAGE_V1=Object.freeze({
 deposit_balance:Object.freeze({mode:'deposit_balance',target:'evm',statementWords:26,
  provenanceSHA256:'7aa7dacf33baec14b1d98bb48a0bdeb6115c1204b42bd970e87a5c8c23a8630e',
  artifactSHA256:'42c9dadc3194592249b5e86c047eba8969e7624669474f68a91aca6554fd9238',
  compiledFileSHA256:'42c9dadc3194592249b5e86c047eba8969e7624669474f68a91aca6554fd9238',
  circuitSHA256:'e02b8d05c4cad3e8fc00d6d5b8714292bfdf2b9d81d5617145114486e6d3b4ba',
  keySHA256:'e8b8b1d20c9c7618e799599ccc54dcada8043ee0bf23fd8f3c15c0a800e68767',
  sourceTreeSHA256:'f7b1e2611965d908ece5df618ae95b76763f697671b3dea9bb38886e71236868',
  soliditySHA256:'47ab7388f52b695fc33b8d71a3fbc0f022b8d50f8007967aa0e4b335ab71ea93'}),
 withdraw_balance:Object.freeze({mode:'withdraw_balance',target:'evm',statementWords:39,
  provenanceSHA256:'b155829f4a17d17ad516074d0e0a896fdc1f6f35ef0a129bdee9f936850744da',
  artifactSHA256:'99383985b10fcbd786d0d186a7bd02d139741877fe897d682dc1272c937b638b',
  compiledFileSHA256:'99383985b10fcbd786d0d186a7bd02d139741877fe897d682dc1272c937b638b',
  circuitSHA256:'e45e6e24f2738ae20b1b46ee95a5c9126becff6830ee8439d3b8901ab40b3370',
  keySHA256:'edb16c5329479e04b026ac4b80216291b7d830f6e0815b4d5d9297fa55fecf8a',
  sourceTreeSHA256:'e6194c6aeeb46051062a87eb8e77229c65cd5dc7d6f5613707ab408b6c2ecf77',
  soliditySHA256:'d1d06f9b3689f6d531b19775131cc91700772ffa0bcc5e72b083b9f7393b1824'}),
});
export function assertNativePrivateEconomicNoteLineageV1(mode,loaded){
 assert.equal(arguments.length,2);assert.ok(Object.hasOwn(PRIVATE_NOTE_NATIVE_LINEAGE_V1,mode),'PAEG_PROOF_NOTE_MODE');
 assert.equal(loaded.legacy,true);assert.equal(loaded.maximumPages,MEMORY.standard);assert.equal(loaded.key.length,1888);
 assert.equal(hash(loaded.key),PRIVATE_NOTE_NATIVE_LINEAGE_V1[mode].keySHA256,'PAEG_PROOF_NOTE_ORIGINAL_KEY');
 assert.equal(hash(Buffer.from(loaded.program.bytecode,'base64')),PRIVATE_NOTE_NATIVE_LINEAGE_V1[mode].circuitSHA256,'PAEG_PROOF_NOTE_ORIGINAL_ACIR');
 assert.deepEqual(loaded.publicPins,PRIVATE_NOTE_NATIVE_LINEAGE_V1[mode],'PAEG_PROOF_NOTE_ORIGINAL_LINEAGE');return true;
}
const originalToolchain=Object.freeze({node:'v24.19.0',noir:'1.0.0-beta.25',barretenberg:'5.2.0',
 auditSHA256:'81aecc452689cfb28709b7d6b3998a1e3c0532de82780a15b2e7a10b3f3e74d6'});
const originalCRS=Object.freeze({points:2097152,provenanceSHA256:'e24f63bcea7cc9d1430c3696c109569015fc38c6e44d5a46ebab3a64013939e3',
 records:Object.freeze([
  Object.freeze({file:'bn254_g1_compressed.dat',bytes:67108864,sha256:'3e1ac09652ee9df779a4955fb8f7050620c7b1ee7f18566581bd00326b06be37'}),
  Object.freeze({file:'bn254_g2.dat',bytes:128,sha256:'01797bfc4de5a96f0e516a9ea4537d18786dc30cb991aca4274c95822b69c32f'})])});
const owned=new WeakMap();
const chargedOutputBytes=row=>row.outputBytes+row.loggerUpperBoundBytes();
const same=(a,b)=>a&&b&&a.pid===b.pid&&a.startTimeTicks===b.startTimeTicks&&a.ppid===b.ppid&&a.pgrp===b.pgrp&&a.session===b.session;
const identity=stat=>Object.fromEntries(['pid','ppid','pgrp','session','startTimeTicks'].map(name=>[name,stat[name]]));
const fileIdentity=stat=>['dev','ino','uid','size','mode','nlink','mtimeNs','ctimeNs'].map(name=>[name,stat[name].toString()]);
const argvFor=pid=>readFileSync(`/proc/${pid}/cmdline`,'utf8').split('\0').filter(Boolean);
function originalNoteWorker(argv){return argv.length===2&&argv[0]===process.execPath
 &&Object.values(PRIVATE_NOTE_NATIVE_WORKERS_V1).includes(argv[1]);}
function originalMode(){assert.ok(originalNoteWorker(process.argv),'PAEG_PROOF_NOTE_FIXED_WORKER');
 return Object.keys(PRIVATE_NOTE_NATIVE_WORKERS_V1).find(mode=>PRIVATE_NOTE_NATIVE_WORKERS_V1[mode]===process.argv[1]);}
export function classifyNativePrivateEconomicNoteProcessV3(argv,executable,parent=null){
  assert.equal(arguments.length,3);
  // The fixed BB backend owns threads, not another producer process. Any
  // descendant receives the stricter proof classification; it grants nothing.
  if(parent?.argv[0]===PRIVATE_NOTE_NATIVE_BINARY_V1)return{role:'economic-note-native-unexpected-descendant',proofWorker:true};
  if(executable===process.execPath&&originalNoteWorker(argv))return{role:'economic-note-native-coordinator',proofWorker:false};
  if(executable!==PRIVATE_NOTE_NATIVE_BINARY_V1)return null;
  if(!parent||!originalNoteWorker(parent.argv))return null;
  assert.deepEqual(argv,[PRIVATE_NOTE_NATIVE_BINARY_V1,'msgpack','run','--input',`/tmp/bb-${parent.pid}-0-0.sock`],
    'PW_NATIVE_FIXED_CHILD_ARGUMENTS');
  return{role:'economic-note-native-backend',proofWorker:true};
}
function assertChild(identityValue,expectedParent){
  const now=nativeProcStatV1(identityValue.pid);assert.ok(same(now,identityValue),'PW_NATIVE_CHILD_IDENTITY_CHANGED');
  assert.equal(now.ppid,expectedParent.pid,'PW_NATIVE_ORIGINAL_PARENT');
  assert.equal(now.pgrp,expectedParent.pgrp,'PW_NATIVE_CHILD_GROUP_CHANGED');
  assert.equal(now.session,expectedParent.session,'PW_NATIVE_CHILD_SESSION_CHANGED');
  assert.equal(readlinkSync(`/proc/${now.pid}/exe`),PRIVATE_NOTE_NATIVE_BINARY_V1,'PW_NATIVE_EXECUTABLE_CHANGED');
  const status=readFileSync(`/proc/${now.pid}/status`,'utf8');
  assert.deepEqual(/^Uid:\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)$/m.exec(status)?.slice(1),Array(4).fill(String(process.getuid())),
    'PW_NATIVE_CHILD_UID_CHANGED');
  assert.equal(classifyNativePrivateEconomicNoteProcessV3(argvFor(now.pid),PRIVATE_NOTE_NATIVE_BINARY_V1,
    {pid:expectedParent.pid,argv:argvFor(expectedParent.pid)}).proofWorker,true);
  assert.ok(same(now,nativeProcStatV1(now.pid)),'PW_NATIVE_CHILD_IDENTITY_CHANGED');return now;
}
function socketStat(path){const stat=lstatSync(path,{bigint:true});assert.ok(stat.isSocket(),'PW_NATIVE_SOCKET_TYPE');
  assert.equal(stat.uid,BigInt(process.getuid()),'PW_NATIVE_SOCKET_OWNER');
  assert.equal(stat.mode&0o077n,0n,'PW_NATIVE_SOCKET_PRIVATE');assert.equal(realpathSync(path),path,'PW_NATIVE_SOCKET_ALIAS');return stat;}
function pins(){for(const[path,expected]of PRIVATE_NOTE_NATIVE_PINS_V1)
  assert.equal(hash(regular(join(EXPERIMENT,'node_modules',path))),expected,'PW_NATIVE_OFFICIAL_PIN');}
export async function initializeNativePrivateEconomicNoteV3(bb){
  assert.equal(arguments.length,1);originalMode();
  assert.equal(process.platform,'linux');assert.equal(process.arch,'x64');pins();
  try{accessSync(PRIVATE_NOTE_NATIVE_BINARY_V1,constants.X_OK);}catch{throw Error('PW_NATIVE_EXECUTABLE_PERMISSION');}
  const parent=nativeProcStatV1(process.pid);assert.ok(parent);const socketPath=`/tmp/bb-${process.pid}-0-0.sock`;
  try{lstatSync(socketPath);throw Error('PW_NATIVE_SOCKET_MUST_BE_ABSENT');}catch(error){if(error.code!=='ENOENT')throw error;}
  const binaryFD=openSync(PRIVATE_NOTE_NATIVE_BINARY_V1,constants.O_RDONLY|constants.O_NOFOLLOW),binaryIdentity=fileIdentity(fstatSync(binaryFD,{bigint:true}));
  let api,loggerUpperBoundBytes=0;
  try{
    // The fixed worker has one job. Restrict the original child's inherited
    // umask before it binds its socket, and restore this coordinator's mask.
    const originalMask=process.umask(0o077);
    try{api=await bb.Barretenberg.new({backend:bb.BackendType.NativeUnixSocket,threads:PRIVATE_NOTE_NATIVE_THREADS_V1,
      bbPath:PRIVATE_NOTE_NATIVE_BINARY_V1,skipSrsInit:true,logger:line=>{
        // Includes pre-return output too. Readline hides delimiters: charge
        // two bytes per line (LF/CRLF) plus raw capture, never undercount.
        loggerUpperBoundBytes+=Buffer.byteLength(line,'utf8')+2;}});}finally{process.umask(originalMask);}
    const require=createRequire(join(EXPERIMENT,'package.json')),
      {BarretenbergNativeSocketAsyncBackend}=require(join(EXPERIMENT,'node_modules/@aztec/bb.js/dest/node-cjs/bb_backends/node/native_socket.js'));
    assert.ok(api.backend instanceof BarretenbergNativeSocketAsyncBackend,'PW_NATIVE_OFFICIAL_BACKEND');
    const child=api.backend.process;assert.ok(child instanceof ChildProcess,'PW_NATIVE_ORIGINAL_CHILD');child.ref();
    const stat=nativeProcStatV1(child.pid);assert.ok(stat);assertChild(stat,parent);
    assert.deepEqual(fileIdentity(statSync(`/proc/${child.pid}/exe`,{bigint:true})),binaryIdentity,'PW_NATIVE_LOADED_BINARY_CHANGED');
    const env=readFileSync(`/proc/${child.pid}/environ`,'utf8').split('\0').filter(Boolean);
    assert.equal(env.find(value=>value.startsWith('HARDWARE_CONCURRENCY=')),`HARDWARE_CONCURRENCY=${PRIVATE_NOTE_NATIVE_THREADS_V1}`,
      'PW_NATIVE_FIXED_THREADS');
    const socketIdentity=fileIdentity(socketStat(socketPath)),row={api,child,parent,identity:identity(stat),binaryFD,binaryIdentity,socketPath,socketIdentity,
      close:null,closing:false,streams:[],socketClosed:false,outputBytes:0,loggerUpperBoundBytes:()=>loggerUpperBoundBytes};
    row.closed=new Promise(resolve=>{row.onClose=(code,signal)=>{row.close={code,signal};resolve(row.close);};child.once('close',row.onClose);});
    for(const stream of[child.stdout,child.stderr]){assert.ok(stream&&!stream.closed,'PW_NATIVE_ORIGINAL_OUTPUT_STREAM');
      // The fixed sink keeps raw C++ text private; bytes still belong to the
      // same original output limit and are checked before publication.
      stream.on('data',bytes=>{row.outputBytes+=bytes.length;});
      row.streams.push(new Promise(resolve=>stream.once('close',resolve)));}
    const socket=api.backend.socket;
    assert.ok(socket instanceof Socket&&!socket.closed&&!socket.destroyed&&!socket.connecting&&socket.readable&&socket.writable,
      'PW_NATIVE_ORIGINAL_SOCKET_ALREADY_CLOSED');
    row.socketClosure=new Promise(resolve=>socket.once('close',()=>{row.socketClosed=true;resolve();}));
    owned.set(api,row);assertNativePrivateEconomicNoteCurrentV1(api);return api;
  }catch(error){
    // A retained original API closes through the same owned Child, including
    // refusal. Before capture, a wrong/reused PID never acquires SDK.kill: the
    // original group supervisor retains failed startup closure; no retry.
    if(api&&owned.has(api)){try{await destroyNativePrivateEconomicNoteV3(api);}catch{}}
    try{closeSync(binaryFD);}catch(closeError){if(closeError.code!=='EBADF')throw closeError;}
    throw error;
  }
}
export function assertNativePrivateEconomicNoteCurrentV1(api){
  assert.equal(arguments.length,1);const row=owned.get(api);assert.ok(row&&!row.closing,'PW_NATIVE_ORIGINAL_API');
  assert.ok(chargedOutputBytes(row)<=LIMITS.outputBytes,'PW_NATIVE_OUTPUT_LIMIT');
  assertChild(row.identity,row.parent);assert.equal(row.child.exitCode,null);assert.equal(row.child.signalCode,null);
  assert.deepEqual(fileIdentity(fstatSync(row.binaryFD,{bigint:true})),row.binaryIdentity,'PW_NATIVE_BINARY_FD_CHANGED');
  assert.deepEqual(fileIdentity(lstatSync(PRIVATE_NOTE_NATIVE_BINARY_V1,{bigint:true})),row.binaryIdentity,'PW_NATIVE_BINARY_PATH_CHANGED');
  assert.deepEqual(fileIdentity(socketStat(row.socketPath)),row.socketIdentity,'PW_NATIVE_SOCKET_CHANGED');pins();
}
export async function destroyNativePrivateEconomicNoteV3(api){
  assert.equal(arguments.length,1);const row=owned.get(api);assert.ok(row&&!row.closing,'PW_NATIVE_ORIGINAL_API');
  let refusal=null;try{assertNativePrivateEconomicNoteCurrentV1(api);}catch(error){refusal=error;}
  // Failed pins/output never become acceptance, but do not skip closure of the
  // still-original child. PID reuse/identity loss cannot acquire a signal.
  const before=nativeProcStatV1(row.identity.pid);
  if(before)assertChild(row.identity,row.parent);
  else assert.ok(row.close,'PW_NATIVE_CLOSE_NOT_OBSERVED');
  row.closing=true;
  // Pinned installed call chain: Barretenberg.destroy -> AsyncApi.destroy ->
  // native_socket.destroy. The last body has NO await, then kill(SIGTERM) and
  // removeAllListeners. Restore close on the retained Child IN THIS STACK,
  // before awaiting either Promise. Stream/socket listeners are separate.
  const destruction=api.destroy();
  assert.equal(row.child.listenerCount('close'),0,'PW_NATIVE_SDK_DESTROY_ORDER_CHANGED');
  if(!row.close)row.child.once('close',row.onClose);
  await destruction;await Promise.all([row.closed,row.socketClosure,...row.streams]);
  try{
    assert.ok(row.close&&(row.close.code===0&&row.close.signal===null||row.close.code===null&&row.close.signal==='SIGTERM'),
      'PW_NATIVE_ORIGINAL_CLOSE_REJECTED');
    assert.equal(nativeProcStatV1(row.identity.pid),null,'PW_NATIVE_CHILD_STILL_PRESENT');
    // Only the same socket actually used by this original child may be removed,
    // and only after its Child.close and output/socket closure were observed.
    try{assert.deepEqual(fileIdentity(socketStat(row.socketPath)),row.socketIdentity,'PW_NATIVE_SOCKET_CHANGED');unlinkSync(row.socketPath);}
    catch(error){if(error.code!=='ENOENT')throw error;}
    try{lstatSync(row.socketPath);throw Error('PW_NATIVE_SOCKET_STILL_PRESENT');}catch(error){if(error.code!=='ENOENT')throw error;}
    assert.deepEqual(fileIdentity(fstatSync(row.binaryFD,{bigint:true})),row.binaryIdentity,'PW_NATIVE_BINARY_FD_CHANGED');pins();
    assert.ok(chargedOutputBytes(row)<=LIMITS.outputBytes,'PW_NATIVE_OUTPUT_LIMIT');
    if(refusal)throw refusal;
    return{profile:PRIVATE_NOTE_NATIVE_PROFILE_V1,backend:'NativeUnixSocket',threads:PRIVATE_NOTE_NATIVE_THREADS_V1,
      bbVersion:'5.2.0',binarySHA256:PRIVATE_NOTE_NATIVE_BINARY_SHA256_V1,originalPreparedKeyRequired:true,
      oneEphemeralJob:true,memoryScope:'COORDINATOR_PLUS_NATIVE_CHILD',rssLimitBytes:LIMITS.workerRSS,
      childIdentity:row.identity,childClose:row.close,outputBytes:chargedOutputBytes(row),
      outputByteAccounting:'RAW_CAPTURE_PLUS_OFFICIAL_LOGGER_UPPER_BOUND',outputStreamsClosed:true,socketClosed:true,socketRemoved:true};
  }finally{closeSync(row.binaryFD);owned.delete(api);}
}
/** Original monitor inputs only. Native memory remains inside the SAME3GiB;
 * a missing leader VmRSS cannot hide live thread memory (shared original RSS).
 * history is retained privately by the original facade, never caller request data. */
export function nativePrivateEconomicNoteResourcesV3(pid,history){
  assert.equal(arguments.length,2);assert.ok(history instanceof Map);const sample=resources();
  if(pid===null)return{...sample,workerRSS:0,coordinatorRSS:0,nativeBackendRSS:0,liveNativeBackends:0,nativeChildIdentities:[],memoryScope:'COORDINATOR_PLUS_NATIVE_CHILD'};
  const worker=nativeProcStatV1(pid);
  let coordinatorRSS=0,nativeBackendRSS=0;
  if(worker){const prior=history.get('coordinator');if(prior)assert.ok(same(prior,worker),'PW_NATIVE_COORDINATOR_CHANGED');
    else{assert.ok(originalNoteWorker(argvFor(pid)),'PW_NATIVE_ORIGINAL_PARENT');history.set('coordinator',identity(worker));}
    const measured=nativeOwnedRSSV1(worker);if(measured)coordinatorRSS=measured.rssBytes;
    const processes=readdirSync('/proc').filter(name=>/^[1-9]\d*$/.test(name)).map(name=>nativeProcStatV1(Number(name))).filter(Boolean);
    for(const stat of processes){if(stat.ppid!==pid)continue;const previous=history.get(stat.pid);
      if(previous)assert.ok(same(previous,stat),'PW_NATIVE_CHILD_IDENTITY_CHANGED');
      else{assertChild(stat,worker);history.set(stat.pid,identity(stat));}}
    assert.ok(!processes.some(stat=>history.has(stat.ppid)),'PW_NATIVE_EXTRA_PRODUCER_PROCESS');
  }
  let liveNativeBackends=0;const childIdentities=[];
  for(const[key,expected]of history){if(key==='coordinator')continue;childIdentities.push(expected);
    const stat=nativeProcStatV1(key);if(!stat)continue;assert.ok(same(stat,expected),'PW_NATIVE_CHILD_IDENTITY_CHANGED');
    const measured=nativeOwnedRSSV1(expected);if(!measured)continue;
    if(!/[ZX]/.test(measured.stat.state)||(measured.liveThreadCount??0)>0)liveNativeBackends++;
    nativeBackendRSS+=measured.rssBytes;}
  assert.ok(liveNativeBackends<=1,'PW_NATIVE_ONE_HEAVY_JOB');
  assert.ok(Number.isSafeInteger(coordinatorRSS+nativeBackendRSS),'PW_NATIVE_RESOURCE_INTEGER');
  return{...sample,workerRSS:coordinatorRSS+nativeBackendRSS,coordinatorRSS,nativeBackendRSS,liveNativeBackends,
    nativeChildIdentities:childIdentities,memoryScope:'COORDINATOR_PLUS_NATIVE_CHILD'};
}

/** Native producer always closes before opening independent Wasm1. No VK compute. */
async function verifyOriginalNoteAfterNativeCloseV1(bb,loaded,proof,expected,closeNative){
 await closeNative();
 let verifier;
 try{
  verifier=await bb.Barretenberg.new({backend:bb.BackendType.Wasm,threads:1,skipSrsInit:true,
   memory:{initial:37,maximum:MEMORY.standard}});
  await initializePrivateVerifierCRS(verifier,bb.BN254_G1_GENERATOR,readFileSync(CRS+'bn254_g2.dat'));
  const okay=await new bb.UltraHonkVerifierBackend(verifier).verifyProof({proof:proof.proof,
   publicInputs:expected.map(value=>'0x'+BigInt(value).toString(16).padStart(64,'0')),verificationKey:loaded.key},
   {verifierTarget:'evm'});
  assert.equal(okay,true,'PAEG_PROOF_SELF_VERIFICATION_FAILED');
 }finally{if(verifier)await verifier.destroy();}
 return{backend:'Wasm',threads:1,maximumPages:MEMORY.standard,originalPreparedKeyRequired:true,
  verifierCRSOnly:true,backendDestroyed:true,nativeProducerClosedBeforeVerification:true};
}
export async function proveNativePrivateEconomicNoteV3(mode,input,expected,phase){
 assert.equal(arguments.length,4);assert.equal(originalMode(),mode,'PAEG_PROOF_NOTE_FIXED_WORKER');
 const loaded=loadProofProfile(mode);assertNativePrivateEconomicNoteLineageV1(mode,loaded);
 const toolchain=verifyToolchain(),crs=verifyCRS();
 assert.deepEqual(toolchain,originalToolchain);assert.deepEqual(crs,originalCRS);
 const require=createRequire(join(EXPERIMENT,'package.json'));
 const bb=await import(pathToFileURL(require.resolve('@aztec/bb.js'))),{Noir}=await import(pathToFileURL(require.resolve('@noir-lang/noir_js')));
 let api,witness,rawWitness,proof,nativeBackendExecution;const began=performance.now();
 const metrics={...loaded.publicPins,zeroKnowledgeEnabled:true,maximumPages:null,preparedMaximumPages:MEMORY.standard,
  threads:PRIVATE_NOTE_NATIVE_THREADS_V1,toolchain,crs};
 try{
  await phase('initializing-official-native');
  api=await initializeNativePrivateEconomicNoteV3(bb);
  await phase('initializing-pinned-proving-crs');
  await api.srsInitSrs({pointsBuf:readFileSync(CRS+'bn254_g1_compressed.dat'),numPoints:crs.points,g2Point:readFileSync(CRS+'bn254_g2.dat')});
  assertNativePrivateEconomicNoteCurrentV1(api);await phase('private-witness-in-memory');
  let start=performance.now();({witness}=await new Noir(loaded.program).execute(input));metrics.witnessMilliseconds=performance.now()-start;
  wipePrivate(input);input=null;assertNativePrivateEconomicNoteCurrentV1(api);
  await phase('actual-proof-generation');start=performance.now();rawWitness=gunzipSync(witness);
  const generated=await api.circuitProve({witness:rawWitness,circuit:{name:mode,
   bytecode:gunzipSync(Buffer.from(loaded.program.bytecode,'base64')),verificationKey:loaded.key},
   settings:{ipaAccumulation:false,oracleHashType:'keccak',disableZk:false,optimizedSolidityVerifier:false}});
  proof={proof:Buffer.concat(generated.proof.map(value=>Buffer.from(value))),
   publicInputs:generated.publicInputs.map(value=>'0x'+Buffer.from(value).toString('hex'))};
  metrics.proofMilliseconds=performance.now()-start;rawWitness.fill(0);rawWitness=null;witness.fill(0);witness=null;
  proof.publicInputs=assertExpectedInputs(mode,proof.publicInputs,expected);assertNativePrivateEconomicNoteCurrentV1(api);
  await phase('actual-pinned-verification');start=performance.now();
  metrics.independentVerification=await verifyOriginalNoteAfterNativeCloseV1(bb,loaded,proof,proof.publicInputs,async()=>{
   const closeBegan=performance.now();nativeBackendExecution=await destroyNativePrivateEconomicNoteV3(api);api=null;
   metrics.nativeCloseMilliseconds=performance.now()-closeBegan;
  });
  metrics.verificationMilliseconds=performance.now()-start-metrics.nativeCloseMilliseconds;metrics.nativeBackendExecution=nativeBackendExecution;
  assertNativePrivateEconomicNoteLineageV1(mode,loadProofProfile(mode));assert.deepEqual(verifyToolchain(),toolchain);assert.deepEqual(verifyCRS(),crs);
  metrics.verified=true;metrics.proofSHA256=hash(proof.proof);metrics.publicInputsSHA256=hash(JSON.stringify(proof.publicInputs));
  metrics.proofBytes=proof.proof.length;metrics.publicInputCount=proof.publicInputs.length;metrics.totalMilliseconds=performance.now()-began;
  return{proof,metrics};
 }finally{
  rawWitness?.fill(0);witness?.fill(0);wipePrivate(input);
  if(api)await destroyNativePrivateEconomicNoteV3(api);
 }
}
/** Public telemetry join only; authentic subprocess ownership is independent. */
export function assertNativePrivateEconomicNoteReceiptV3(mode,worker,resource){
 assert.equal(arguments.length,3);const pins=PRIVATE_NOTE_NATIVE_LINEAGE_V1[mode];assert.ok(pins,'PAEG_PROOF_NOTE_MODE');
 for(const[key,value]of Object.entries(pins))assert.equal(worker[key],value,'PAEG_PROOF_NOTE_ORIGINAL_LINEAGE');
 assert.equal(worker.threads,12);assert.equal(worker.maximumPages,null);assert.equal(worker.preparedMaximumPages,32768);
 assert.equal(worker.zeroKnowledgeEnabled,true);assert.equal(worker.verified,true);
 assert.deepEqual(worker.toolchain,originalToolchain);assert.deepEqual(worker.crs,originalCRS);
 assert.deepEqual(worker.independentVerification,{backend:'Wasm',threads:1,maximumPages:32768,originalPreparedKeyRequired:true,
  verifierCRSOnly:true,backendDestroyed:true,nativeProducerClosedBeforeVerification:true});
 const row=worker.nativeBackendExecution;assert.ok(row,'PAEG_PROOF_NOTE_CLOSE_REQUIRED');
 assert.deepEqual(Object.keys(row).sort(),['profile','backend','threads','bbVersion','binarySHA256','originalPreparedKeyRequired',
  'oneEphemeralJob','memoryScope','rssLimitBytes','childIdentity','childClose','outputBytes','outputByteAccounting',
  'outputStreamsClosed','socketClosed','socketRemoved'].sort());
 assert.deepEqual(Object.keys(row.childIdentity).sort(),['pid','ppid','pgrp','session','startTimeTicks'].sort());
 for(const name of ['pid','ppid','pgrp','session'])assert.ok(Number.isSafeInteger(row.childIdentity[name])&&row.childIdentity[name]>1);
 assert.ok(/^\d+$/.exec(row.childIdentity.startTimeTicks)?.[0]===row.childIdentity.startTimeTicks);
 assert.deepEqual(Object.keys(row.childClose).sort(),['code','signal']);
 for(const[key,value]of Object.entries({profile:PRIVATE_NOTE_NATIVE_PROFILE_V1,backend:'NativeUnixSocket',threads:12,bbVersion:'5.2.0',
  binarySHA256:PRIVATE_NOTE_NATIVE_BINARY_SHA256_V1,originalPreparedKeyRequired:true,oneEphemeralJob:true,
  memoryScope:'COORDINATOR_PLUS_NATIVE_CHILD',rssLimitBytes:LIMITS.workerRSS,
  outputByteAccounting:'RAW_CAPTURE_PLUS_OFFICIAL_LOGGER_UPPER_BOUND',outputStreamsClosed:true,socketClosed:true,socketRemoved:true}))
  assert.equal(row[key],value,'PAEG_PROOF_NOTE_CLOSE_JOIN');
 assert.ok(row.childClose&&(row.childClose.code===0&&row.childClose.signal===null
  ||row.childClose.code===null&&row.childClose.signal==='SIGTERM'),'PAEG_PROOF_NOTE_CLOSE_REJECTED');
 assert.ok(Number.isSafeInteger(row.outputBytes)&&row.outputBytes>=0&&row.outputBytes<=LIMITS.outputBytes);
 assert.equal(resource.nativeChildrenGone,true);assert.deepEqual(resource.nativeBackendExecution,row);
 assert.ok(resource.nativeChildIdentities.some(value=>same(value,row.childIdentity)));
 assert.equal(resource.nativeMemoryScope,'COORDINATOR_PLUS_NATIVE_CHILD');
 assert.ok(Number.isSafeInteger(resource.peakWorkerRSS)&&resource.peakWorkerRSS>=0&&resource.peakWorkerRSS<=LIMITS.workerRSS);
 return true;
}

/** New bounded public receipt classification only. Raw proof bytes and the
 * original persisted telemetry must already be joined independently; these
 * checks grant no account, consent, key or runtime authority. */
export function assertNativePrivateEconomicNoteTelemetryV3(value){
 assert.equal(arguments.length,1);exactObject(value,['relation','returnedMetrics','storedMetrics','proofSHA256','publicInputsSHA256','telemetrySHA256']);
 const{relation,returnedMetrics,storedMetrics,proofSHA256,publicInputsSHA256,telemetrySHA256}=value;
 assert.ok(Object.hasOwn(PRIVATE_NOTE_NATIVE_LINEAGE_V1,relation),'PAEG_PROOF_NOTE_MODE');
 for(const digest of[proofSHA256,publicInputsSHA256,telemetrySHA256])assert.ok(typeof digest==='string'&&/^[0-9a-f]{64}$/.exec(digest)?.[0]===digest);
 assert.deepEqual(returnedMetrics,storedMetrics,'PAEG_PROOF_NOTE_ORIGINAL_TELEMETRY');
 const e=storedMetrics;assert.ok(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.exec(e.id)?.[0]===e.id);
 assert.equal(e.classification,'ACTUAL_PRIVATE_PROOF_PROCESS_PUBLIC_METRICS_ONLY');
 assert.equal(e.mode,relation);assert.equal(e.operation,'prove');assert.equal(e.purpose,'owner');
 assert.equal(e.phase,'completed');assert.equal(e.acceptedResult,true);assert.deepEqual(e.exit,{code:0,signal:null});
 for(const field of['failureCode','telemetryWriteFailed','fallbackTelemetryWriteFailed'])assert.equal(e[field],undefined);
 assert.equal(e.lockPreserved,false);assert.equal(e.zeroKnowledgeEnabled,true);assert.deepEqual(e.policy,PRIVATE_RESOURCE_POLICY);
 for(const[key,pin]of Object.entries(PRIVATE_NOTE_NATIVE_LINEAGE_V1[relation]))assert.equal(e[key],pin,'PAEG_PROOF_NOTE_PARENT_LINEAGE');
 assert.equal(e.threads,12);assert.equal(e.maximumPages,null);assert.equal(e.preparedMaximumPages,32768);
 assert.equal(e.worker.proofSHA256,proofSHA256);assert.equal(e.worker.publicInputsSHA256,publicInputsSHA256);
 assert.equal(e.worker.publicInputCount,relation==='deposit_balance'?26:39);
 assertNativePrivateEconomicNoteReceiptV3(relation,e.worker,e);
 assert.ok(Array.isArray(e.resourceSamples)&&e.resourceSamples.length>0);
 for(const sample of e.resourceSamples){
  assert.ok(Number.isSafeInteger(sample.availableRAM)&&sample.availableRAM>=PRIVATE_RESOURCE_POLICY.floors.availableRAM);
  assert.ok(Number.isSafeInteger(sample.freeDisk)&&sample.freeDisk>=PRIVATE_RESOURCE_POLICY.floors.freeDisk);
  assert.ok(Number.isSafeInteger(sample.workerRSS)&&sample.workerRSS>=0&&sample.workerRSS<=LIMITS.workerRSS);
 }
 return{...returnedMetrics,telemetrySHA256,resourceReceiptCompleted:true};
}

/** Only the original one-use AEAD recipient can issue this private request.
 * This validates the unchanged ABI/public words; it issues no account or proof. */
export function readOriginalNativePrivateNoteProverRequestV3(opened,mode){
 assert.equal(arguments.length,2);need(Object.hasOwn(PRIVATE_NOTE_NATIVE_WORKERS_V1,mode),'PAEG_PROOF_NOTE_MODE');
 const recipient=readOriginalPrivateProofRecipientV1(opened);need(recipient.relation===mode&&recipient.role==='owner','PAEG_PROOF_PRIVATE_RECIPIENT');
 const binding=privateProofAuthorizationBindingV1(opened.authorization);need(binding.kind==='ORIGINAL_CONSENT_V1','PAEG_PROOF_PRIVATE_CONSENT');
 const request=opened.inputs;exactObject(request,['profile','purpose','operation','mode','input','label']);
 need(request.profile==='ORIGINAL_NATIVE_NOTE_PRIVATE_WORKER_INPUT_V3'&&request.purpose==='owner'&&request.operation==='prove'&&request.mode===mode,'PAEG_PROOF_NOTE_FIXED_MODE');assertProofRole(request.purpose,request.operation,mode);
 need(typeof request.label==='string'&&/^[A-Za-z0-9_-]{1,100}$/.test(request.label),'PAEG_PROOF_LABEL');
 const loaded=loadProofProfile(mode);assertNativePrivateEconomicNoteLineageV1(mode,loaded);
 const expected=normalizePublicInputs(mode,opened.expectedPublicInputs);let input;
 try{input=normalizeProofWitness(loaded.program,request.input);assertExpectedInputs(mode,publicInputsFromWitness(loaded.program,input),expected);return Object.freeze({request,binding,expected,input});}
 catch(error){wipePrivate(input);throw error;}
}

/** Fixed private intake with original Native12 algorithm and original phase ACKs. */
export async function runNativePrivateEconomicNoteProofWorkerV3(){
 assert.equal(arguments.length,0);const fixedMode=originalMode();need(process.execArgv.length===0&&!process.env.NODE_OPTIONS&&!process.env.NODE_PATH,'PAEG_PROOF_NOTE_FIXED_EXECUTION');need(typeof process.send==='function'&&process.connected,'PAEG_PROOF_PRIVATE_IPC_REQUIRED');
 let request,received,input,sequence=0,pendingAck;const terminate=()=>{wipePrivate(input);wipePrivate(request);wipePrivate(received?.inputs);process.exit(2);};process.once('disconnect',terminate);
 async function send(value){return new Promise((resolve,reject)=>{const bytes=encodeProofMessage(value);process.send(bytes,error=>{bytes.fill(0);error?reject(error):resolve();});});}
 const ack=bytes=>{let value;try{value=decodeProofMessage(bytes);exactObject(value,['event','sequence']);need(value.event==='phase-persisted'&&value.sequence===sequence&&pendingAck,'PAEG_PROOF_ONE_REQUEST');const resolve=pendingAck;pendingAck=null;resolve();}catch{terminate();}finally{wipePrivate(value);}};
 try{
  received=await preparePrivateProofJobV1({relation:fixedMode,role:'owner',jobId:randomUUID()});
  const admitted=readOriginalNativePrivateNoteProverRequestV3(received,fixedMode),{binding,expected}=admitted;request=admitted.request;input=admitted.input;
  process.on('message',ack);const phase=async stage=>{const wait=new Promise(resolve=>{pendingAck=resolve;});await send({event:'phase',sequence:++sequence,stage});await wait;};
  await phase('checking-pins');globalThis.fetch=async()=>{throw proofError('PAEG_PROOF_OFFLINE_REQUIRED');};let result;
  try{const produced=await proveNativePrivateEconomicNoteV3(fixedMode,input,expected,phase);input=null;result={proofPackage:encodePrivateProof(fixedMode,produced.proof),metrics:{...produced.metrics,privateWorkerIntake:{profile:'ORIGINAL_NATIVE_NOTE_PRIVATE_WORKER_INPUT_V3',originalConsentBound:true,consentSHA256:binding.consentSHA256,witnessSHA256:binding.witnessSHA256,jobId:binding.jobId}}};wipePrivate(produced.proof);}finally{wipePrivate(input);wipePrivate(request.input);request.input=null;}
  assertNativePrivateEconomicNoteLineageV1(fixedMode,loadProofProfile(fixedMode));await send({event:'result',result});wipePrivate(result.proofPackage);
  wipePrivate(input);wipePrivate(request);wipePrivate(received?.inputs);process.removeListener('message',ack);process.removeListener('disconnect',terminate);process.disconnect();process.exit(0);
 }catch(error){wipePrivate(input);wipePrivate(request);wipePrivate(received?.inputs);const code=/^PAEG_PROOF_[A-Z_]+$/.test(error?.code??'')?error.code:'PAEG_PROOF_TOOLCHAIN_OR_CONSTRAINT_FAILURE';await send({event:'failure',code}).catch(()=>{});process.removeListener('message',ack);process.removeListener('disconnect',terminate);if(process.connected)process.disconnect();process.exit(1);}
 finally{wipePrivate(input);wipePrivate(request);wipePrivate(received?.inputs);}
}
