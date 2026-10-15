/** Real pinned Anvil execution against read-only Sepolia state. Fresh software
 * key and synthetic ETH are HOST setup, not a protected provider acceptance. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import {Transaction} from 'micro-eth-signer';
import {readFile,stat} from 'node:fs/promises';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {pinnedBinary,unusedLoopbackPort,startOwnProcess,stopOwnProcess,sleep} from '../../packages/engine/src/chains/shared/runtime-harness.mjs';
import {linuxRuntimePins} from '../../packages/engine/src/chains/shared/linux-runtime-pins.mjs';
import {publicPagedAccountFromKeyV1} from '../../packages/backend/src/chains/public-testnet/wire-v1.mjs';
import * as H from './public-sepolia-fork-harness-v5.mjs';

test('owned Sepolia fork executes the same signed creation wire and actual bytecode; upstream remains read-only',{timeout:180000},async()=>{
 let fork;const key=randomBytes(32);
 try{
  fork=await H.createPublicSepoliaForkHarnessV5();
  await assert.rejects(()=>H.readPublicSepoliaForkV5({...fork},'eth_chainId',[]),/FORK_ORIGINAL_OWNED_PROCESS/);
  await assert.rejects(()=>H.readPublicSepoliaForkV5(fork,'eth_sendTransaction',[]),/FORK_READ_ONLY_QUERY/);
  assert.equal(await H.readPublicSepoliaForkV5(fork,'eth_chainId',[]),'0xaa36a7');
  const account=publicPagedAccountFromKeyV1('ethereum-sepolia',key),setup=await H.seedPublicSepoliaForkBootstrapV5(fork,[account.address]);assert.equal(setup.publicFundsMoved,false);
  let id=0;
  const rpc=async(method,params)=>{const response=await fetch(fork.rpcURL,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:++id,method,params}),signal:AbortSignal.timeout(60000)});assert.equal(response.status,200);const value=await response.json();assert.equal(value.id,id);assert.equal(value.error,undefined);return value.result;};
  assert.equal(await rpc('eth_maxPriorityFeePerGas',[]),'0x1');
  const runtime='0x602a60005260206000f3',creation='0x600a600c600039600a6000f3'+runtime.slice(2);
  const estimated=await rpc('eth_estimateGas',[{from:account.address,data:creation,value:'0x0',gasPrice:'0x0'}]);assert.ok(BigInt(estimated)>21000n);
  const unsigned=Transaction.prepare({type:'eip1559',chainId:11155111n,nonce:0n,to:'0x',value:0n,data:creation,gasLimit:1000000n,maxFeePerGas:2n,maxPriorityFeePerGas:1n,accessList:[]}),signed=unsigned.signBy(key,false),wire=signed.toHex();
  const nativeId=await rpc('eth_sendRawTransaction',[wire]);assert.equal(nativeId,signed.hash);
  const transaction=await rpc('eth_getTransactionByHash',[nativeId]);assert.equal(transaction.input,creation);assert.equal(transaction.from.toLowerCase(),account.address);assert.equal(transaction.nonce,'0x0');
  const receipt=await rpc('eth_getTransactionReceipt',[nativeId]);assert.equal(receipt.status,'0x1');assert.equal(receipt.transactionHash,nativeId);assert.equal(await rpc('eth_getCode',[receipt.contractAddress,'latest']),runtime);
  assert.equal(BigInt(await rpc('eth_call',[{to:receipt.contractAddress,data:'0x'},'latest'])),42n,'actual EVM returns deployed contract result');
  const finalized=await rpc('eth_getBlockByNumber',['finalized',false]),actual=await H.readPublicSepoliaForkV5(fork,'eth_getBlockByNumber',['latest',false]);assert.equal(finalized.hash,actual.hash);assert.ok(BigInt(actual.timestamp)<=BigInt(Math.floor(Date.now()/1000))+1n);
  const evidence=H.publicSepoliaForkEvidenceV5(fork);assert.equal(evidence.localFinancialPosts,1);assert.equal(evidence.publicPayments,0);assert.equal(evidence.upstreamWriteAttempts,0);assert.equal(evidence.execution,'REAL_OWNED_ANVIL');assert.equal(evidence.feeOracle,'HOST_SYNTHETIC_PRIORITY_1_WEI');
  await assert.rejects(()=>H.seedPublicSepoliaForkBootstrapV5(fork,[account.address]),/FORK_SEED_BEFORE_FINANCIAL_POST/);
  await H.stopPublicSepoliaForkHarnessV5(fork);
  const checkpoint=JSON.parse(await readFile(join(evidence.directory,'owned-chain-checkpoint.json'),'utf8')),bytes=await readFile(checkpoint.path);assert.equal(checkpoint.sha256,createHash('sha256').update(bytes).digest('hex'));assert.deepEqual(checkpoint.head,actual);assert.equal(checkpoint.financialAuthority,false);assert.equal((await stat(checkpoint.path)).isFile(),true);
  const binary=await pinnedBinary(...linuxRuntimePins.anvil),port=await unusedLoopbackPort(),restored=startOwnProcess(binary,['--host','127.0.0.1','--port',String(port),'--chain-id','11155111','--accounts','0','--no-mining','--load-state',checkpoint.path,'--preserve-historical-states','--quiet'],evidence.directory);
  try{
   let seq=0;const read=async(method,params)=>{restored.assertAlive();const response=await fetch('http://127.0.0.1:'+port,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:++seq,method,params}),signal:AbortSignal.timeout(5000)}),value=await response.json();assert.equal(value.error,undefined);return value.result;};
   let ready=false;for(let i=0;i<100;i++){try{ready=await read('eth_chainId',[])==='0xaa36a7';if(ready)break;}catch{}await sleep(50);}assert.equal(ready,true);
   assert.deepEqual(await read('eth_getBlockByNumber',['latest',false]),actual,'same owned head survives disposal');assert.deepEqual(await read('eth_getTransactionReceipt',[nativeId]),receipt,'same original receipt survives disposal');assert.deepEqual(await read('eth_getTransactionByHash',[nativeId]),transaction,'same original signed transaction survives disposal');assert.equal(await read('eth_getCode',[receipt.contractAddress,'latest']),runtime);assert.equal(await read('eth_getStorageAt',[receipt.contractAddress,'0x0',receipt.blockNumber]),'0x'+'0'.repeat(64));
  }finally{await stopOwnProcess(restored);}
  let replay;try{
   const savedEvidence=await readFile(join(evidence.directory,'evidence.json')),input={directory:evidence.directory,stateSHA256:checkpoint.sha256,evidenceSHA256:createHash('sha256').update(savedEvidence).digest('hex')};
   await assert.rejects(H.restorePublicSepoliaForkHarnessV5({...input,stateSHA256:'0'.repeat(64)}));
   replay=await H.restorePublicSepoliaForkHarnessV5(input);assert.deepEqual(await H.readPublicSepoliaForkV5(replay,'eth_getTransactionReceipt',[nativeId]),receipt);assert.deepEqual(await H.readPublicSepoliaForkV5(replay,'eth_getTransactionByHash',[nativeId]),transaction);const current=H.publicSepoliaForkEvidenceV5(replay);assert.equal(current.restoration.priorDirectory,evidence.directory);assert.equal(current.restoration.head.hash,actual.hash);assert.equal(current.localFinancialPosts,1);assert.equal(current.publicPayments,0);assert.equal(current.upstreamWriteAttempts,0);await assert.rejects(H.seedPublicSepoliaForkBootstrapV5(replay,[account.address]),/FORK_SEED_BEFORE_FINANCIAL_POST/);
  }finally{if(replay)await H.stopPublicSepoliaForkHarnessV5(replay);}

 }finally{key.fill(0);if(fork)await H.stopPublicSepoliaForkHarnessV5(fork);}
});

test('owned fork disposal closes both proxies after its wallclock miner sees the owned child exit',{timeout:180000},async()=>{
 let fork;
 try{
  fork=await H.createPublicSepoliaForkHarnessV5();const evidence=H.publicSepoliaForkEvidenceV5(fork),rpcURL=fork.rpcURL;
  // The PID came from this freshly issued Original handle; no discovery or
  // adoption of an existing Anvil, wallet service or cloud process occurs.
  process.kill(evidence.pid,'SIGKILL');await new Promise(resolve=>setTimeout(resolve,10500));
  await assert.rejects(()=>H.readPublicSepoliaForkV5(fork,'eth_chainId',[]));
  await H.stopPublicSepoliaForkHarnessV5(fork);await H.stopPublicSepoliaForkHarnessV5(fork);
  await assert.rejects(()=>fetch(rpcURL,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:1,method:'eth_chainId',params:[]}),signal:AbortSignal.timeout(5000)}));
 }finally{if(fork)await H.stopPublicSepoliaForkHarnessV5(fork);}
});
