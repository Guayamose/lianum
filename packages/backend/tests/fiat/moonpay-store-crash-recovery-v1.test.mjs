import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {mkdtemp,chmod,mkdir,readFile,writeFile,readdir,rm,symlink} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {randomUUID} from 'node:crypto';
import {createMoonPayGatewayV1} from '../../src/fiat/moonpay-gateway-v1.mjs';
import {openMoonPayOrderStoreV1} from '../../src/fiat/moonpay-order-store-v1.mjs';
const configuration={enabled:true,environment:'SANDBOX',publishableKey:'pk_test_CRASH_LOCAL_0123456789',secretKey:'sk_test_CRASH_LOCAL_0123456789',webhookKey:'wk_test_CRASH_LOCAL_0123456789'};
test('SIGKILL releases Original OS exclusion; boot/start-fenced reopening preserves the same checkout without network or duplicate order',async t=>{
 const parent=await mkdtemp(join(tmpdir(),'lianum-fiat-crash-'));await chmod(parent,0o700);t.after(()=>rm(parent,{recursive:true,force:true}));const directory=join(parent,'orders'),requestId=randomUUID();
 const child=spawn(process.execPath,[fileURLToPath(new URL('./fixtures/moonpay-crash-writer-v1.mjs',import.meta.url)),directory,requestId],{stdio:['ignore','pipe','pipe']});t.after(()=>{if(child.exitCode===null&&child.signalCode===null)child.kill('SIGKILL');});
 const original=await new Promise((resolve,reject)=>{let text='';child.stdout.on('data',bytes=>{text+=bytes;if(text.includes('\n'))resolve(JSON.parse(text.split('\n')[0]));});child.once('error',reject);child.once('exit',(code,signal)=>reject(Error('writer exited before checkpoint '+code+' '+signal)));});
 const lockName=(await readdir(directory)).find(name=>name.startsWith('original-process-'));assert.ok(lockName);const retained=JSON.parse(await readFile(join(directory,lockName),'utf8'));assert.equal(retained.pid,child.pid);assert.match(retained.bootId,/^[0-9a-f-]{36}$/);assert.match(retained.startTicks,/^\d+$/);
 await assert.rejects(createMoonPayGatewayV1({configuration,directory,fetchImpl:()=>{throw Error('no network');}}),{code:'FIAT_STORE_ALREADY_OPEN'});
 const stopped=once(child,'exit');child.kill('SIGKILL');await stopped;
 let calls=0;const gateway=await createMoonPayGatewayV1({configuration,directory,fetchImpl:()=>{calls++;throw Error('network forbidden on retained request');}});t.after(()=>gateway.close());
 const order=await gateway.createSession('a'.repeat(64),{requestId,flow:'BUY',asset:'ETH',network:'ethereum',fiatCurrency:'EUR',amount:'10',walletAddress:'0x'+'12'.repeat(20)});
 assert.equal(order.id,original.id);assert.equal(calls,0);assert.equal(order.privateBalanceCredited,false);assert.equal(order.chainConfirmation,'UNVERIFIED');assert.equal(JSON.parse(await readFile(join(directory,'orders.json'),'utf8')).orders.length,1);
 const current=JSON.parse(await readFile(join(directory,lockName),'utf8'));assert.equal(current.pid,process.pid);assert.notEqual(current.identity,retained.identity);await gateway.close();
});
test('legacy PID-only lock, symlink claim and malformed ownership fail closed without deleting the lock or creating orders',async t=>{
 const parent=await mkdtemp(join(tmpdir(),'lianum-fiat-lock-'));await chmod(parent,0o700);t.after(()=>rm(parent,{recursive:true,force:true}));
 for(const mode of ['legacy','symlink','malformed']){
  const directory=join(parent,mode);await mkdir(directory,{mode:0o700});const path=join(directory,mode==='legacy'?'writer.lock':'original-process-fiat_orders_v1.lock');
  if(mode==='symlink')await symlink('/proc/self/stat',path);else await writeFile(path,mode==='legacy'?String(process.pid):JSON.stringify({pid:1}),{mode:0o600});
  await assert.rejects(openMoonPayOrderStoreV1(directory,'binding'),{code:mode==='legacy'?'FIAT_STORE_LEGACY_LOCK_RECOVERY_REQUIRED':'FIAT_STORE_UNSAFE'});
  assert.ok((await readdir(directory)).includes(path.split('/').at(-1)));assert.ok(!(await readdir(directory)).includes('orders.json'));
 }
});
