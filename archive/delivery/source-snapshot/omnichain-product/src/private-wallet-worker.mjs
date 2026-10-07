/** Bounded live wallet keeper transport. It has one authenticated parent and no
 * recovery/reconnect protocol. Public durable checkpoint ACK precedes sends.
 * Private owner-view responses are separate from the public checkpoint schema. */
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {createPrivateWalletAuthority,PRIVATE_WALLET_PROFILE,sanitizePrivateWalletSummary} from './private-wallet-engine.mjs';
const exact=(v,k)=>assert.ok(v&&Object.getPrototypeOf(v)===Object.prototype&&Object.keys(v).length===k.length&&k.every(x=>Object.hasOwn(v,x)),'PRIVATE_WALLET_IPC_FIELDS');
const id=v=>typeof v==='string'&&/^[0-9a-f]{32}$/.test(v);
const code=e=>/^[A-Z][A-Z0-9_]{1,100}$/.test(e?.code??e?.message??'')?e.code??e.message:'PRIVATE_WALLET_OPERATION_FAILED';
export function createPrivateWalletWorkerHost({transport,createAuthority=createPrivateWalletAuthority,ackTimeoutMs=30000,bootTimeoutMs=10000}={}){
 assert.ok(transport&&typeof transport.on==='function'&&typeof transport.send==='function');assert.equal(typeof createAuthority,'function');assert.ok(Number.isSafeInteger(ackTimeoutMs)&&ackTimeoutMs>0&&ackTimeoutMs<=30000);assert.ok(Number.isSafeInteger(bootTimeoutMs)&&bootTimeoutMs>0&&bootTimeoutMs<=10000);
 const controller=new AbortController(),commands=new Set();let authority,walletId,sequence=0,pending,fault,finished=false,active=false,doneResolve;
 const done=new Promise(resolve=>{doneResolve=resolve;});
 const send=message=>{assert.ok(Buffer.byteLength(JSON.stringify(message))<=32768,'PRIVATE_WALLET_IPC_SIZE');assert.ok(transport.connected!==false,'PRIVATE_WALLET_PARENT_DISCONNECTED');return new Promise((resolve,reject)=>{try{transport.send(message,e=>e?reject(e):resolve());}catch(e){reject(e);}});};
 function finish(){if(finished)return;finished=true;clearTimeout(bootTimer);transport.removeListener('message',onMessage);transport.removeListener('disconnect',onDisconnect);transport.removeListener('error',onError);doneResolve(authority?.status()??null);}
 async function abort(error){if(fault)return;fault=error instanceof Error?error:new Error(error);clearTimeout(bootTimer);if(pending){clearTimeout(pending.timer);pending.reject(fault);pending=null;}controller.abort(fault);try{await authority?.abort();}finally{finish();}}
 async function checkpoint(value){if(fault)throw fault;assert.equal(pending,undefined,'PRIVATE_WALLET_ONE_CHECKPOINT');const payload=sanitizePrivateWalletSummary(value),current=++sequence;
  assert.ok(Buffer.byteLength(JSON.stringify(payload))<=16384,'PRIVATE_WALLET_CHECKPOINT_LIMIT');
  const acknowledged=new Promise((resolve,reject)=>{const timer=setTimeout(()=>void abort(new Error('PRIVATE_WALLET_ACK_TIMEOUT')),ackTimeoutMs);pending={sequence:current,resolve,reject,timer};});
  const delivery=send({type:'checkpoint',walletId,sequence:current,payload}).catch(e=>abort(e));await Promise.all([delivery,acknowledged]);if(fault)throw fault;
 }
 async function command(message){
  const readonly=['status','privateStatus'].includes(message.action);if(!readonly)assert.equal(active,false,'PRIVATE_WALLET_ACTION_IN_PROGRESS');if(!readonly)active=true;
  try{if(!authority){assert.equal(message.action,'open','PRIVATE_WALLET_OPEN_REQUIRED');walletId=message.walletId;authority=createAuthority({walletId,profile:PRIVATE_WALLET_PROFILE,onCheckpoint:checkpoint,signal:controller.signal});}
   const result=await authority.action(message.action,message.input);await send({type:'result',commandId:message.commandId,ok:true,result});if(message.action==='close')finish();
  }catch(e){if(!fault)try{await send({type:'result',commandId:message.commandId,ok:false,errorCode:code(e)});}catch(error){void abort(error);}}
  finally{commands.delete(message.commandId);if(!readonly)active=false;}
 }
 function onMessage(message){try{
  assert.ok(Buffer.byteLength(JSON.stringify(message))<=32768,'PRIVATE_WALLET_IPC_SIZE');
  if(message?.type==='stop'){exact(message,['type']);void abort(new Error('PRIVATE_WALLET_WORKER_STOPPED'));return;}
  if(message?.type==='ack'){exact(message,['type','walletId','sequence']);assert.equal(message.walletId,walletId,'PRIVATE_WALLET_STALE_LIFETIME');assert.ok(pending&&message.sequence===pending.sequence,'PRIVATE_WALLET_ACK_SEQUENCE');const p=pending;pending=undefined;clearTimeout(p.timer);p.resolve();return;}
  exact(message,['type','walletId','commandId','action','input']);assert.equal(message.type,'command');assert.ok(id(message.walletId)&&id(message.commandId));assert.ok(!walletId||walletId===message.walletId,'PRIVATE_WALLET_STALE_LIFETIME');assert.ok(['open','prepareIntent','execute','reconcile','close','status','privateStatus'].includes(message.action),'PRIVATE_WALLET_COMMAND');assert.ok(message.input&&Object.getPrototypeOf(message.input)===Object.prototype,'PRIVATE_WALLET_INPUT');assert.ok(commands.size<8&&!commands.has(message.commandId),'PRIVATE_WALLET_COMMAND_REPLAY');commands.add(message.commandId);clearTimeout(bootTimer);void command(message).catch(e=>abort(e));
 }catch(e){void abort(e);}}
 const onDisconnect=()=>void abort(new Error('PRIVATE_WALLET_PARENT_DISCONNECTED')),onError=()=>void abort(new Error('PRIVATE_WALLET_IPC_ERROR'));
 const bootTimer=setTimeout(()=>void abort(new Error('PRIVATE_WALLET_BOOT_TIMEOUT')),bootTimeoutMs);transport.on('message',onMessage);transport.on('disconnect',onDisconnect);transport.on('error',onError);
 return Object.freeze({done,stop:()=>abort(new Error('PRIVATE_WALLET_WORKER_STOPPED'))});
}
if(process.argv[1]===fileURLToPath(import.meta.url)){
 if(typeof process.send!=='function'){process.stderr.write('PRIVATE_WALLET_IPC_REQUIRED\n');process.exitCode=1;}
 else{const host=createPrivateWalletWorkerHost({transport:process}),stop=()=>void host.stop();process.once('SIGTERM',stop);process.once('SIGINT',stop);host.done.then(()=>{process.removeListener('SIGTERM',stop);process.removeListener('SIGINT',stop);if(process.connected)process.disconnect();});}
}
