/** Bounded private recipient IPC. Bootstrap travels over fd3, never argv/env.
 * Owner requests cannot change pinned terms, destination, or request arbitrary
 * signatures. This trusted-host process boundary is not an OS security sandbox.
 */
import { randomBytes } from 'node:crypto';
import { spawn } from 'node:child_process';
import { createReadStream } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { Vault } from '../vault.mjs';
import { canonical,digest } from '../privacy.mjs';
import { createNativeRecipientCustody, recoverNativeRecipientCustody, NATIVE_RECIPIENT_PROFILE } from './native-recipient-custody.mjs';

const MAX_BYTES = 64 * 1024;
const ERROR_PATTERN = /^(?:PAEG_RECIPIENT|VAULT)_[A-Z_]+$/;
const problem = code => Object.assign(new Error(code), { code });
const need = (ok, code = 'PAEG_RECIPIENT_IPC_INPUT') => { if (!ok) throw problem(code); };
const ownedRecipientProcesses = new WeakSet(),recipientRecoveryStatesV1=new WeakMap();
export function assertOwnedNativeRecipientProcess(recipient) {
  need(ownedRecipientProcesses.has(recipient), 'PAEG_RECIPIENT_OWNED_PROCESS_CAPABILITY');
}
const codeFor = error => ERROR_PATTERN.test(error?.code || '') ? error.code : 'PAEG_RECIPIENT_REJECTED';
function exact(value, fields) {
  canonical(value);
  need(value && typeof value === 'object' && !Array.isArray(value)
    && Object.keys(value).length === fields.length && fields.every(key => Object.hasOwn(value, key)));
}
function bootstrap(input) {
  exact(input, ['mode', 'path', 'password', 'expectedTerms', 'withdrawalRecipient']);
  need(input.mode === 'create' || input.mode === 'recover');
  return JSON.parse(canonical(input));
}
const reply = value => new Promise((resolve, reject) => process.stdout.write(JSON.stringify(value) + '\n', error => error ? reject(error) : resolve()));

async function worker() {
  const stream = createReadStream(null, { fd: 3, autoClose: true }), buffer = Buffer.alloc(MAX_BYTES);
  let length = 0, boot, custody;
  try {
    for await (const chunk of stream) {
      need(length + chunk.length <= MAX_BYTES, 'PAEG_RECIPIENT_IPC_SIZE');
      chunk.copy(buffer, length); length += chunk.length;
    }
    boot = bootstrap(JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(buffer.subarray(0, length))));
  } finally { buffer.fill(0); }
  const { mode, ...cfg } = boot;
  custody = await (mode === 'create' ? createNativeRecipientCustody(cfg) : recoverNativeRecipientCustody(cfg));
  boot.password = ''; cfg.password = ''; // No JavaScript secret-zeroization claim.
  let queue = Promise.resolve(), stopping = false, pending = '';
  function cleanup() {
    if (stopping) return;
    stopping = true; custody.close(); process.stdin.destroy();
  }
  function receive(line) {
    queue = queue.then(async () => {
      if (stopping) return;
      let id = null;
      try {
        const request = JSON.parse(line);
        exact(request, ['id', 'operation', 'input']);
        need(Number.isSafeInteger(request.id) && request.id > 0); id = request.id;
        let value;
        switch (request.operation) {
          case 'offer': need(request.input === null); value = custody.offer(); break;
          case 'recoveryCheckpoint': need(request.input === null); value = await custody.recoveryCheckpoint(); break;
          case 'acceptedQuote': need(request.input === null); value = custody.acceptedQuote(); break;
          case 'withdrawalStatus': need(request.input === null); value = custody.withdrawalStatus(); break;
          case 'retainedWithdrawal': need(request.input === null); value = await custody.retainedWithdrawal(); break;
          case 'acceptInvoice': value = await custody.acceptInvoice(request.input); break;
          case 'authorizeWithdrawal': value = await custody.authorizeWithdrawal(request.input); break;
          case 'close': need(request.input === null); value = { closed: true }; break;
          default: need(false, 'PAEG_RECIPIENT_OPERATION_DENIED');
        }
        await reply({ id, ok: true, value });
        if (request.operation === 'close') cleanup();
      } catch (error) { await reply({ id, ok: false, code: codeFor(error) }); }
    }).catch(() => { cleanup(); process.exitCode = 1; });
  }
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', chunk => {
    if (stopping) return;
    pending += chunk;
    const lines = pending.split('\n'); pending = lines.pop();
    if (Buffer.byteLength(pending) > MAX_BYTES || lines.some(line => Buffer.byteLength(line) > MAX_BYTES)) {
      process.stdin.pause();
      queue = queue.then(async () => { await reply({ id: null, ok: false, code: 'PAEG_RECIPIENT_IPC_SIZE' }); cleanup(); });
      return;
    }
    for (const line of lines) receive(line);
  });
  process.stdin.on('end', () => { queue = queue.then(cleanup); });
  process.stdin.on('error', () => { queue = queue.then(cleanup); });
  await reply({ event: 'ready', profile: NATIVE_RECIPIENT_PROFILE });
}

/** Fixed child entry point; no caller script, environment, or signing callback.
 * Failed/uncertain replies must be reconciled with mode:'recover'. Exact invoice
 * and withdrawal retries return the retained signature/witness after restart.
 * close() waits for the actual OS process exit, not just an IPC acknowledgement.
 */
export async function createNativeRecipientProcess(input) {need(arguments.length===1);return createRecipientProcessV1(input,null);}
async function createRecipientProcessV1(input,recovery) {
  const boot = bootstrap(input),privateBootstrap=bootstrap(input), encoded = Buffer.from(canonical(boot));
  if(recovery){need(boot.mode==='recover');const actual=await new Vault(boot.path).read(boot.password);need(canonical(actual)===canonical(recovery.record),'PAEG_RECIPIENT_RECOVERY_VAULT_CHANGED');}
  need(encoded.length <= MAX_BYTES, 'PAEG_RECIPIENT_IPC_SIZE');
  const child = spawn(process.execPath, [fileURLToPath(import.meta.url), '--worker'], {
    env: { LANG: 'C.UTF-8' }, stdio: ['pipe', 'pipe', 'pipe', 'pipe'],
  });
  boot.password = '';
  let count = 0, pending, buffer = '', failure, stopping = false, finished = false, timer,capturing=false,captureStarted=false,captured=false,initialization=null,parentBusy=false;
  let resolveReady, rejectReady, resolveExit;
  const ready = new Promise((resolve, reject) => { resolveReady = resolve; rejectReady = reject; });
  const exited = new Promise(resolve => { resolveExit = resolve; });
  const processLifetimeIdentity=randomBytes(32).toString('hex');
  const lifecycle = { profile: NATIVE_RECIPIENT_PROFILE, processLifetimeIdentity, started: true, pid: child.pid, exited: false, completedRequests: 0 };
  function fail(error) {
    failure ??= problem(codeFor(error));
    clearTimeout(timer); rejectReady(failure);
    if (pending) { pending.reject(failure); pending = null; }
    if (!finished) {
      child.kill('SIGTERM');
      timer = setTimeout(() => { if (!finished) child.kill('SIGKILL'); }, 1000);
    }
  }
  child.once('error', () => fail(problem('PAEG_RECIPIENT_SPAWN')));
  child.once('close', (code, signal) => {
    finished = true; clearTimeout(timer); lifecycle.exited = true; lifecycle.exit = { code, signal };
    if (!stopping || pending || code !== 0) fail(problem('PAEG_RECIPIENT_CHILD_EXIT'));
    for (const stream of child.stdio) stream?.destroy();
    resolveExit(structuredClone(lifecycle));
  });
  child.stderr.on('data', bytes => { bytes.fill(0); fail(problem('PAEG_RECIPIENT_UNEXPECTED_LOG')); });
  for (const stream of [child.stdin, child.stdout, child.stderr, child.stdio[3]]) {
    stream.on('error', () => fail(problem('PAEG_RECIPIENT_IO')));
  }
  child.stdout.setEncoding('utf8');
  child.stdout.on('data', chunk => {
    try {
      buffer += chunk;
      const lines = buffer.split('\n'); buffer = lines.pop();
      need(Buffer.byteLength(buffer) <= MAX_BYTES && lines.every(line => Buffer.byteLength(line) <= MAX_BYTES), 'PAEG_RECIPIENT_IPC_SIZE');
      for (const line of lines) {
        const response = JSON.parse(line);
        if (response.event === 'ready') {
          exact(response, ['event', 'profile']);
          need(count === 0 && response.profile === NATIVE_RECIPIENT_PROFILE, 'PAEG_RECIPIENT_PROTOCOL');
          clearTimeout(timer); resolveReady();
        } else if (response.event === 'startupRejected') {
          exact(response, ['event', 'code']); fail(problem(response.code));
        } else {
          need(pending && response.id === pending.id, 'PAEG_RECIPIENT_PROTOCOL');
          exact(response, response.ok === true ? ['id', 'ok', 'value'] : ['id', 'ok', 'code']);
          need(response.ok === true || (response.ok === false && ERROR_PATTERN.test(response.code)), 'PAEG_RECIPIENT_PROTOCOL');
          const current = pending; pending = null; clearTimeout(timer);
          if (response.ok === true) { lifecycle.completedRequests++; current.resolve(response.value); }
          else current.reject(problem(response.code));
        }
      }
    } catch (error) { fail(error); }
  });
  timer = setTimeout(() => fail(problem('PAEG_RECIPIENT_START_TIMEOUT')), 15000);
  child.stdio[3].end(encoded, () => encoded.fill(0));
  async function rawRequest(operation, value, internalCapture=false) {
    need(!capturing||internalCapture||operation==='close','PAEG_RECIPIENT_CAPTURE_FENCED');
    need(!failure && !finished && !pending && (!stopping || operation === 'close'), 'PAEG_RECIPIENT_BUSY_OR_CLOSED');
    const message = Buffer.from(canonical({ id: ++count, operation, input: value }));
    need(message.length <= MAX_BYTES, 'PAEG_RECIPIENT_IPC_SIZE');
    const response = new Promise((resolve, reject) => { pending = { id: count, resolve, reject }; });
    timer = setTimeout(() => fail(problem('PAEG_RECIPIENT_REQUEST_TIMEOUT')), 15000);
    child.stdin.write(Buffer.concat([message, Buffer.from('\n')]), error => { message.fill(0); if (error) fail(problem('PAEG_RECIPIENT_IO')); });
    return response;
  }
  function request(operation,value,internalCapture=false){need(!parentBusy||operation==='close','PAEG_RECIPIENT_PARENT_BUSY');return rawRequest(operation,value,internalCapture);}
  let recipientRegistryAccessV1=null;
  async function recipientRegistryV1(){recipientRegistryAccessV1=await import('../../../omnichain-flat-profile/flat-wallet/wallet-platform/modules/native-claims/wrapped-private-lifetime-registry-v1.mjs');return recipientRegistryAccessV1;}
  function assertRetainedWithdrawalCheckpoint(expected){
    need(!parentBusy&&!capturing&&!failure&&!finished&&!pending&&!stopping,'PAEG_RECIPIENT_PARENT_BUSY');
    need(initialization&&recipientRegistryAccessV1&&initialization.original.pendingOperation===null&&initialization.original.latestCheckpoint,'PAEG_RECIPIENT_PARENT_ACK_REQUIRED');
    need(canonical(expected)===canonical(initialization.original.latestCheckpoint),'PAEG_RECIPIENT_PARENT_CHECKPOINT_CHANGED');
    recipientRegistryAccessV1.assertWrappedPrivateLifetimePartSealedV1(initialization.handle);return true;
  }
  async function originalParentRowV1(){
    need(initialization,'PAEG_RECIPIENT_DURABLE_INITIALIZATION_REQUIRED');const a=await recipientRegistryV1(),row=await a.readWrappedPrivateLifetimeIndexedPartV1(initialization.runtime,'recipient',initialization.identity);
    need(row.handle===initialization.handle&&canonical(row.privateState)===canonical(initialization.original),'PAEG_RECIPIENT_PARENT_STATE_CHANGED');a.assertWrappedPrivateLifetimePartSealedV1(initialization.handle);return {a,row};
  }
  async function saveParentRowV1(a,data){await a.updateWrappedPrivateLifetimePartV1(initialization.handle,data);a.assertWrappedPrivateLifetimePartSealedV1(initialization.handle);initialization.original=structuredClone(data);}
  async function checkedChildCheckpointV1(){
    const checkpoint=await rawRequest('recoveryCheckpoint',null,true),record=await new Vault(privateBootstrap.path).read(privateBootstrap.password);
    need(checkpoint.revision===record.revision&&checkpoint.stateSHA256===digest('LIANUM/PAEG/original-recipient-recovery/1',record.data),'PAEG_RECIPIENT_PARENT_CHILD_CHANGED');return checkpoint;
  }
  async function durableRecipientMutationV1(operation,value){
    if(!initialization)return request(operation,value); // Existing standalone custody scope has no wrapped resume admission.
    need(!parentBusy&&!capturing&&!failure&&!finished&&!pending&&!stopping,'PAEG_RECIPIENT_PARENT_BUSY');const originalEncoded=canonical(value);need(Buffer.byteLength(originalEncoded)<=MAX_BYTES,'PAEG_RECIPIENT_IPC_SIZE');const originalValue=JSON.parse(originalEncoded);parentBusy=true;
    try{const {a,row}=await originalParentRowV1();need(row.privateState.pendingOperation===null&&row.privateState.latestCheckpoint,'PAEG_RECIPIENT_PARENT_ACK_REQUIRED');
      const prior=row.privateState.latestCheckpoint;need(canonical(await checkedChildCheckpointV1())===canonical(prior),'PAEG_RECIPIENT_PARENT_CHECKPOINT_CHANGED');
      const originalOperation={schema:'PAEG_RECIPIENT_ORIGINAL_PENDING_ACK_V1',operation,inputSHA256:digest('LIANUM/PAEG/original-recipient-request/1',originalValue),priorCheckpoint:prior,process:{pid:child.pid,lifetimeIdentity:processLifetimeIdentity}};
      await saveParentRowV1(a,{...row.privateState,pendingOperation:originalOperation});
      const result=await rawRequest(operation,originalValue,true),checkpoint=await checkedChildCheckpointV1();need(checkpoint.revision===prior.revision||checkpoint.revision===prior.revision+1,'PAEG_RECIPIENT_PARENT_REVISION_CHANGED');
      await saveParentRowV1(a,{...initialization.original,latestCheckpoint:checkpoint,pendingOperation:null});need(!failure&&!finished&&!stopping,'PAEG_RECIPIENT_PARENT_ACK_UNCERTAIN');return result;
    }catch(error){fail(error);throw error;}finally{parentBusy=false;}
  }
  async function retainedRecipientWithdrawalV1(){
    need(!parentBusy&&!capturing&&!failure&&!finished&&!pending&&!stopping,'PAEG_RECIPIENT_PARENT_BUSY');parentBusy=true;let absent=false;
    try{const {row}=await originalParentRowV1();need(row.privateState.pendingOperation===null&&row.privateState.latestCheckpoint,'PAEG_RECIPIENT_PARENT_ACK_REQUIRED');
      let retained;try{retained=await rawRequest('retainedWithdrawal',null,true);}catch(error){absent=error?.code==='PAEG_RECIPIENT_NO_RETAINED_WITHDRAWAL';throw error;}
      need(canonical(retained.checkpoint)===canonical(row.privateState.latestCheckpoint),'PAEG_RECIPIENT_PARENT_CHECKPOINT_CHANGED');await originalParentRowV1();return retained;
    }catch(error){if(!absent)fail(error);throw error;}finally{parentBusy=false;}
  }
  try { await ready; }
  catch (error) { await exited; throw error; }
  const recipient = Object.freeze({
    offer: () => request('offer', null),
    acceptInvoice: value => durableRecipientMutationV1('acceptInvoice', value),
    acceptedQuote: () => request('acceptedQuote', null),
    withdrawalStatus: () => request('withdrawalStatus', null),
    retainedWithdrawal: () => retainedRecipientWithdrawalV1(),
    assertRetainedWithdrawalCheckpoint,
    authorizeWithdrawal: value => durableRecipientMutationV1('authorizeWithdrawal', value),
    report: () => structuredClone(lifecycle),
    async close() {
      if (!stopping) {
        stopping = true;
        if (!failure && !finished && !pending) {
          try {
            await request('close', null);
            if (!finished) timer = setTimeout(() => fail(problem('PAEG_RECIPIENT_CLOSE_TIMEOUT')), 5000);
          }
          catch (error) { fail(error); }
        } else if (!finished) fail(problem('PAEG_RECIPIENT_CANCELLED'));
      }
      return exited;
    },
  });
  ownedRecipientProcesses.add(recipient);
  const lineage=recovery?{originalProcessId:recovery.lineage.originalProcessId,originalLifetimeIdentity:recovery.lineage.originalLifetimeIdentity,generation:recovery.lineage.generation+1,priorProcessId:recovery.capturedProcessId,priorLifetimeIdentity:recovery.capturedLifetimeIdentity}:{originalProcessId:child.pid,originalLifetimeIdentity:processLifetimeIdentity,generation:1,priorProcessId:null,priorLifetimeIdentity:null};
  recipientRecoveryStatesV1.set(recipient,{
    lineage,
    async attach(value){need(!initialization&&!parentBusy&&!capturing&&!failure&&!finished&&!pending&&!stopping,'PAEG_RECIPIENT_INITIALIZATION_ONCE');
      const a=await import('../../../omnichain-flat-profile/flat-wallet/wallet-platform/modules/native-claims/wrapped-private-lifetime-registry-v1.mjs');
      const row=await a.readWrappedPrivateLifetimeIndexedPartV1(value.runtime,'recipient',value.identity);need(row.handle===value.handle);need(canonical({...row.privateState.bootstrap,mode:'recover'})===canonical({...privateBootstrap,mode:'recover'}),'PAEG_RECIPIENT_INITIALIZATION_CHANGED');
      a.assertWrappedPrivateLifetimePartSealedV1(value.handle);initialization={...value,original:row.privateState};
      parentBusy=true;try{need(row.privateState.pendingOperation===undefined||row.privateState.pendingOperation===null,'PAEG_RECIPIENT_PARENT_ACK_REQUIRED');const checkpoint=await checkedChildCheckpointV1();if(row.privateState.latestCheckpoint)need(canonical(checkpoint)===canonical(row.privateState.latestCheckpoint),'PAEG_RECIPIENT_PARENT_CHECKPOINT_CHANGED');else need(!recovery&&privateBootstrap.mode==='create','PAEG_RECIPIENT_PARENT_CHECKPOINT_REQUIRED');await saveParentRowV1(a,{...row.privateState,latestCheckpoint:checkpoint,pendingOperation:null,currentProcess:{pid:child.pid,lifetimeIdentity:processLifetimeIdentity}});}catch(error){fail(error);throw error;}finally{parentBusy=false;}},
    assertOriginal(expected){exact(expected,['originalProcessId','originalLifetimeIdentity']);need(!parentBusy&&!capturing&&!failure&&!finished&&!stopping,'PAEG_RECIPIENT_RECOVERY_NOT_LIVE');need(expected.originalProcessId===lineage.originalProcessId&&expected.originalLifetimeIdentity===lineage.originalLifetimeIdentity,'PAEG_RECIPIENT_ORIGINAL_LINEAGE_REQUIRED');return Object.freeze({...lineage,currentProcessId:child.pid,currentLifetimeIdentity:processLifetimeIdentity});},
    fence(){need(!parentBusy&&!capturing&&!failure&&!finished&&!pending&&!stopping,'PAEG_RECIPIENT_CAPTURE_BUSY');capturing=true;},
    async capture(){need(initialization,'PAEG_RECIPIENT_DURABLE_INITIALIZATION_REQUIRED');if(!capturing)recipientRecoveryStatesV1.get(recipient).fence();need(!captureStarted,'PAEG_RECIPIENT_CAPTURE_ONCE');captureStarted=true;
      const checkpoint=await request('recoveryCheckpoint',null,true),record=await new Vault(privateBootstrap.path).read(privateBootstrap.password),offer=await request('offer',null,true);
      need(checkpoint.revision===record.revision&&checkpoint.stateSHA256===digest('LIANUM/PAEG/original-recipient-recovery/1',record.data),'PAEG_RECIPIENT_CAPTURE_MEMORY_CHANGED');
      const reread=await new Vault(privateBootstrap.path).read(privateBootstrap.password);need(canonical(record)===canonical(reread),'PAEG_RECIPIENT_CAPTURE_VAULT_CHANGED');
      const a=await import('../../../omnichain-flat-profile/flat-wallet/wallet-platform/modules/native-claims/wrapped-private-lifetime-registry-v1.mjs');
      const {row}=await originalParentRowV1();need(row.privateState.pendingOperation===null&&canonical(row.privateState.latestCheckpoint)===canonical(checkpoint),'PAEG_RECIPIENT_PARENT_ACK_REQUIRED');a.assertWrappedPrivateLifetimePartSealedV1(initialization.handle);captured=true;
      return {schema:'PAEG_RECIPIENT_ORIGINAL_RECOVERY_V1',registryIdentity:structuredClone(initialization.identity),bootstrap:{...privateBootstrap,mode:'recover'},record,offer,lineage:{...lineage},capturedProcessId:child.pid,capturedLifetimeIdentity:processLifetimeIdentity};},
    async stopCaptured(){need(capturing&&captured,'PAEG_RECIPIENT_CAPTURE_REQUIRED');const stopped=await recipient.close();need(stopped.exited&&stopped.exit.code===0&&stopped.exit.signal===null,'PAEG_RECIPIENT_CAPTURE_STOP_FAILED');return {closed:true,originalPrivateStateRetained:true};},
  });
  if(recovery){try{const offer=await recipient.offer();need(canonical(offer)===canonical(recovery.offer),'PAEG_RECIPIENT_ORIGINAL_OPENING_CHANGED');}catch(error){await recipient.close();throw error;}}
  return recipient;
}

/** These records are private authority payloads, never public receipts. */
export async function attachWrappedRecipientInitializationV1(recipient,token){need(arguments.length===2);assertOwnedNativeRecipientProcess(recipient);const {consumeWrappedFixtureRecoveryPartV1}=await import('../../../omnichain-flat-profile/flat-wallet/integration/wrapped-wallet-fixed-fixture-v1.mjs');return recipientRecoveryStatesV1.get(recipient).attach(consumeWrappedFixtureRecoveryPartV1(token,'recipient-initialization'));}
export function fenceNativeRecipientRecoveryV1(recipient){need(arguments.length===1);assertOwnedNativeRecipientProcess(recipient);recipientRecoveryStatesV1.get(recipient).fence();}
export function captureNativeRecipientRecoveryV1(recipient){need(arguments.length===1);assertOwnedNativeRecipientProcess(recipient);return recipientRecoveryStatesV1.get(recipient).capture();}
export function stopCapturedNativeRecipientRecoveryV1(recipient){need(arguments.length===1);assertOwnedNativeRecipientProcess(recipient);return recipientRecoveryStatesV1.get(recipient).stopCaptured();}
export function assertOriginalNativeRecipientRecoveryV1(recipient,expected){need(arguments.length===2);assertOwnedNativeRecipientProcess(recipient);return recipientRecoveryStatesV1.get(recipient).assertOriginal(expected);}
export async function reopenNativeRecipientRecoveryV1(token){
 need(arguments.length===1);const {consumeWrappedWalletRecoveryPartV1}=await import('../../../omnichain-flat-profile/flat-wallet/integration/wrapped-wallet-acceptance-v1.mjs');
 const {runtime,record}=consumeWrappedWalletRecoveryPartV1(token,'recipient');exact(record,['schema','registryIdentity','bootstrap','record','offer','lineage','capturedProcessId','capturedLifetimeIdentity']);
 need(record.schema==='PAEG_RECIPIENT_ORIGINAL_RECOVERY_V1');exact(record.lineage,['originalProcessId','originalLifetimeIdentity','generation','priorProcessId','priorLifetimeIdentity']);
 need(/^[0-9a-f]{64}$/.test(record.lineage.originalLifetimeIdentity)&&/^[0-9a-f]{64}$/.test(record.capturedLifetimeIdentity));
 need(Number.isSafeInteger(record.lineage.originalProcessId)&&record.lineage.originalProcessId>0);need(Number.isSafeInteger(record.lineage.generation)&&record.lineage.generation>=1&&record.lineage.generation<64);need(Number.isSafeInteger(record.capturedProcessId)&&record.capturedProcessId>0);
 const a=await import('../../../omnichain-flat-profile/flat-wallet/wallet-platform/modules/native-claims/wrapped-private-lifetime-registry-v1.mjs');
 const registered=await a.readWrappedPrivateLifetimeIndexedPartV1(runtime,'recipient',record.registryIdentity);
 need(canonical({...registered.privateState.bootstrap,mode:'recover'})===canonical(record.bootstrap),'PAEG_RECIPIENT_INITIALIZATION_CHANGED');
 const recipient=await createRecipientProcessV1(record.bootstrap,record);
 try{await recipientRecoveryStatesV1.get(recipient).attach({runtime,identity:record.registryIdentity,handle:registered.handle});const report=recipient.report();
  return recipient;
 }catch(error){await recipient.close();throw error;}

}

if (process.argv[1] === fileURLToPath(import.meta.url) && process.argv[2] === '--worker') {
  worker().catch(async error => {
    await reply({ event: 'startupRejected', code: codeFor(error) }).catch(() => {});
    process.exitCode = 1;
  });
}
