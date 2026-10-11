/** Real fixed child entrypoints, malformed input only: no proof, key or runtime. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {launchRecipientWithdrawalProofWorker,launchPrivateWalletSignerProcess} from '../../src/execution/assembly-workers.mjs';

const cases=[
  ['assembly proof',()=>spawn(process.execPath,[fileURLToPath(new URL('../../src/execution/assembly-prove-worker.mjs',import.meta.url))],{stdio:['pipe','pipe','pipe','pipe']}),'PC18_PROOF_REQUEST_FIELDS'],
  ['assembly verification',()=>spawn(process.execPath,[fileURLToPath(new URL('../../src/execution/assembly-verify-worker.mjs',import.meta.url))],{stdio:['pipe','pipe','pipe','pipe']}),'PC18_VERIFY_REQUEST'],
  ['wallet proof',()=>spawn(process.execPath,[fileURLToPath(new URL('../../src/execution/wallet-note-proof-worker.mjs',import.meta.url))],{stdio:['pipe','pipe','pipe','pipe']}),'PC23_WORKER_FIELDS'],
  ['recipient withdrawal',launchRecipientWithdrawalProofWorker,'PC18_NOTE_REQUEST'],
  ['wallet signer',launchPrivateWalletSignerProcess,'ERR_ASSERTION'],
];
for(const [name,launch,expectedCode] of cases)test(`${name} rejects malformed IPC through its real owned entrypoint`,{timeout:3000},async t=>{
  const child=launch(),out=[],err=[],packets=[];
  t.after(()=>{if(child.exitCode===null&&child.signalCode===null)child.kill('SIGKILL');});
  child.stdout.on('data',b=>out.push(b));child.stderr.on('data',b=>err.push(b));child.stdio[3].on('data',b=>packets.push(b));
  const closed=new Promise((resolve,reject)=>{child.once('error',reject);child.once('close',(code,signal)=>resolve({code,signal}));});
  child.stdin.end(JSON.stringify({invalid:true}));
  const exit=await closed;
  assert.deepEqual(exit,{code:1,signal:null},Buffer.concat(err).toString());
  assert.equal(Buffer.concat(out).length,0);assert.equal(Buffer.concat(err).length,0);
  const result=JSON.parse(Buffer.concat(packets).toString('utf8'));
  assert.equal(result.ok,false);assert.equal(result.code,expectedCode);
});
test('fixed launcher contracts cannot accept an entrypoint or process options',()=>{
  assert.throws(()=>launchRecipientWithdrawalProofWorker({file:'arbitrary.mjs'}),/PC18_WITHDRAW_WORKER_ARITY/);
  assert.throws(()=>launchPrivateWalletSignerProcess({cwd:'/tmp'}),/PC23_SIGNER_PROCESS_ARITY/);
});
