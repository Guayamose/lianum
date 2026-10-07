/** Actual EVM control tests with synthetic statement-digest verifiers.
 * SYNTHETIC_CONTRACT_CONTROLS_ONLY_NOT_GENUINE_PROOFS: no witness, membership,
 * amount conservation, note-type or signature soundness is established here. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { access, mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { PRIVATE_ASSET_VERIFIER_MODES, PRIVATE_ASSET_POOL_METHODS, deployPrivateAssetPool, privateVerifierCalldata, decodePrivateRevert } from '../src/private-asset-runtime.mjs';
import { encodePrivatePoolInputs, noteHashToWords, PrivateNoteTree, ZERO_NOTE_HASH } from '../src/private-note-tree.mjs';
import { encodeWalletPoolInputs } from '../src/private-wallet-note-encoding.mjs';
import { linuxRuntimePins } from '../src/chains/linux-runtime-pins.mjs';
import { pinnedBinary, scratchDirectory, removeOwnScratch, unusedLoopbackPort, startOwnProcess, stopOwnProcess, ownedRuntimeRpc, sleep, projectRoot } from '../src/chains/runtime-harness.mjs';
const CLASSIFICATION='SYNTHETIC_CONTRACT_CONTROLS_ONLY_NOT_GENUINE_PROOFS';
const sha=data=>createHash('sha256').update(data).digest('hex');
const hash=label=>`0x${sha(`PRIVATE ASSET NATIVE SYNTHETIC ${label}`)}`;
const word=n=>BigInt(n).toString(16).padStart(64,'0');
const marker=mode=>PRIVATE_ASSET_VERIFIER_MODES.indexOf(mode)+1;
const proof=(mode,inputs)=>Buffer.concat([Buffer.from([marker(mode)]),Buffer.from(sha(Buffer.from(inputs.map(word).join(''),'hex')),'hex')]);
const source=mode=>`// SPDX-License-Identifier: MIT\npragma solidity 0.8.37;
// ${CLASSIFICATION}. Only binds test inputs; NO circuit relation.
contract HonkVerifier {
 function verify(bytes calldata p,bytes32[] calldata inputs) external view returns(bool){
  return p.length==33 && p[0]==bytes1(uint8(${marker(mode)})) && bytes32(p[1:33])==sha256(abi.encodePacked(inputs));
 }
}`;
async function ownAnvil(){
 const binary=await pinnedBinary(...linuxRuntimePins.anvil),cwd=await scratchDirectory('private-asset-native-controls-');let handle;
 try{
  const port=await unusedLoopbackPort();
  handle=startOwnProcess(binary,['--host','127.0.0.1','--port',String(port),'--chain-id','31337','--hardfork','cancun','--timestamp','1900000200','--accounts','5','--balance','10','--mnemonic-random','12','--no-cors'],cwd);
  const evm=(method,params=[])=>ownedRuntimeRpc(`http://127.0.0.1:${port}`,method,params,{timeoutMs:15000});
  let ready=false;for(let i=0;i<100;i++){handle.assertAlive();try{ready=await evm('eth_chainId')==='0x7a69';if(ready)break;}catch{}await sleep(50);}
  assert.ok(ready,'OWNED_WALLET_ANVIL_READY');
  return{evm,accounts:await evm('eth_accounts'),metadata:{classification:'OWNED_LOCAL_RUNTIMES_ONLY',freshSyntheticWallets:true,chainId:'31337',evmGenesis:(await evm('eth_getBlockByNumber',['0x0',false])).hash},close:async()=>{await stopOwnProcess(handle);await removeOwnScratch(cwd);}};
 }catch(error){if(handle)await stopOwnProcess(handle);await removeOwnScratch(cwd);throw error;}
}
let unavailable=process.platform!=='linux'||process.arch!=='x64'?'requires reviewed Linux x64 binaries':null;
if(!unavailable)try{for(const pin of[linuxRuntimePins.anvil,linuxRuntimePins.solc])await access(join(projectRoot,'.local/linux-runtimes',pin[0]));}catch(error){if(error.code!=='ENOENT')throw error;unavailable='pinned local Anvil/solc missing; no EVM coverage claimed';}

test(`${CLASSIFICATION}: new immutable native-asset regression`,{skip:unavailable??false,timeout:180000},async t=>{
 const runtime=await ownAnvil();const cases=[],rawReceipts=[];let pool;
 try{
  const sources=Object.fromEntries(PRIVATE_ASSET_VERIFIER_MODES.map(mode=>{const content=source(mode);return[mode,{content,sha256:sha(content)}];}));
  pool=await deployPrivateAssetPool(runtime,{asset:'0x'+'00'.repeat(20),sources,policy:hash('policy'),deploymentDomain:hash('deployment'),solAuthority:runtime.accounts[1],btcAuthority:runtime.accounts[2]});
  const abi=pool.compilation.output.contracts[pool.compilation.sourceNames.pool].PrivateAssetNotePool.abi;
  for(const [name,mutability] of [['depositBalance','payable'],['reserveFromNoteGuarded','nonpayable'],['withdrawBalance','nonpayable']])assert.equal(abi.find(item=>item.type==='function'&&item.name===name).stateMutability,mutability);
  assert.equal(abi.filter(item=>item.type==='function'&&/^reserveFromNote/.test(item.name)&&item.name!=='reserveFromNoteVerifier').length,1);
  const balance=()=>runtime.evm('eth_getBalance',[pool.address,'latest']).then(BigInt);
  const base=async()=>({scope:pool.scope,policy:pool.policy,epoch:BigInt((await runtime.evm('eth_getBlockByNumber',['latest',false])).timestamp)/600n});
  const encode=async(mode,fields)=>mode.includes('_')?encodeWalletPoolInputs(mode,{...await base(),...fields}):encodePrivatePoolInputs(mode,{...await base(),...fields});
  const data=(mode,inputs,p=proof(mode,inputs))=>privateVerifierCalldata(pool.selectors[`${PRIVATE_ASSET_POOL_METHODS[mode]}(bytes,bytes32[])`],p,inputs);
  const send=(label,mode,inputs,{value,from=runtime.accounts[0],status='0x1',reason,p=proof(mode,inputs)}={})=>pool.send(label,{to:pool.address,from,data:data(mode,inputs,p),...(value===undefined?{}:{value})},status,reason);
  const deposit=async(label,amount=3000n)=>{const output=hash(`${label} balance`),inputs=await encode('deposit_balance',{amount,output});await send(`D ${label}`,'deposit_balance',inputs,{value:amount});return{output,inputs};};
  const candidate=async(label,fields={})=>{
   const snap=await pool.snapshot(),tree=new PrivateNoteTree(snap.leaves.slice(0,snap.leafCount));
   const c={root:snap.root,nullifier:hash(`${label} input NF`),output:hash(`${label} reserved`),change:hash(`${label} change`),admissionTag:hash(`${label} admission`),expectedBaseRoot:snap.root,expectedSequence:snap.stateSequence,...fields};
   tree.append(c.output);const intermediateRoot=tree.root;tree.append(c.change);
   c.expectedPostRoot=fields.expectedPostRoot??tree.root;
   return{...c,intermediateRoot,inputs:await encode('reserve_from_note',c),snap};
  };
  const spend=c=>send('S exact guarded spend','reserve_from_note',c.inputs);
  const state=async c=>({
   calls:await Promise.all(['canonicalState()','canonicalEffects()','canonicalRootHistory()','canonicalRevocations()','treeNodes()','noteLeaves()','spentList()','solEffectList()','btcEffectList()'].map(method=>pool.call(method))),
   maps:await Promise.all([pool.call('admissions(bytes32)',[c.admissionTag??ZERO_NOTE_HASH]),...[c.output,c.change].map(x=>pool.call('insertedCommitments(bytes32)',[x??ZERO_NOTE_HASH])),pool.call('spentNullifiers(bytes32)',[c.nullifier??ZERO_NOTE_HASH]),...[c.expectedBaseRoot,c.expectedPostRoot,c.intermediateRoot,c.root].map(x=>pool.call('acceptedRoots(bytes32)',[x??ZERO_NOTE_HASH]))]),balance:await balance(),
  });
  const reject=async(label,mode,inputs,reason,{c={},value,p=proof(mode,inputs)}={})=>{const before=await state(c),receipt=await send(label,mode,inputs,{value,status:'0x0',reason,p});assert.deepEqual(await state(c),before,`${label}: all canonical fields/maps/tree/ETH rollback`);assert.deepEqual(receipt.logs,[],`${label}: no reverted logs`);return receipt;};
  const mutate=(inputs,offset,value)=>{const a=[...inputs];if(typeof value==='string'&&/^0x[0-9a-f]{64}$/i.test(value))a.splice(offset,8,...noteHashToWords(value));else a[offset]=String(value);return a;};
  const check=async(name,fn)=>t.test(name,async()=>{const id=await runtime.evm('evm_snapshot');try{await fn();cases.push({name,passed:true});}catch(error){cases.push({name,passed:false,error:error.message});throw error;}finally{assert.equal(await runtime.evm('evm_revert',[id]),true);}});
  const withdraw=async(mode,nf,amount=1000n,recipient=runtime.accounts[4],root)=>{root??=await pool.call('currentRoot()');const inputs=await encode(mode,{root,nullifier:nf,amount,recipient});await send(mode,mode,inputs);return inputs;};
  const refund=async(label,root)=>{root??=await pool.call('currentRoot()');const inputs=await encode('refund',{root,nullifier:hash(`${label} reserved NF`),outputRecovery:hash(`${label} recovery`)});await send('legacy refund','refund',inputs);return inputs;};
  const fulfill=async(label,root)=>{
   root??=await pool.call('currentRoot()');const inputs=await encode('fulfill',{root,nullifier:hash(`${label} reserved NF`),effectSol:hash(`${label} SOL effect`),effectBtc:hash(`${label} BTC effect`),outputSol:hash(`${label} SOL payout`),outputBtc:hash(`${label} BTC payout`)});
   const statement=await runtime.evm('eth_call',[{to:pool.address,data:`0x${pool.selectors['terminalStatement(bytes32[])']}${word(32)}${word(inputs.length)}${inputs.map(word).join('')}`} ,'latest']);
   const timestamp=BigInt((await runtime.evm('eth_getBlockByNumber',['latest',false])).timestamp);
   for(const[chain,effect,account]of[[1,hash(`${label} SOL effect`),runtime.accounts[1]],[2,hash(`${label} BTC effect`),runtime.accounts[2]]])await pool.send('synthetic current permit',{to:pool.address,from:account,data:pool.data('recordPermit(uint8,bytes32,bytes32,uint64,uint64,uint64)',[chain,effect,statement,1,timestamp,timestamp+30n])});
   await send('legacy fulfill','fulfill',inputs);return inputs;
  };

  await check('no live input rejects S and balance W on the empty pool',async()=>{
   const c=await candidate('empty');await reject('empty S','reserve_from_note',c.inputs,'NO_LIVE_OUTPUT',{c});
   const w=await encode('withdraw_balance',{root:c.root,nullifier:c.nullifier,amount:1n,recipient:runtime.accounts[4]});await reject('empty W','withdraw_balance',w,'NO_LIVE_OUTPUT',{c});
  });
  await check('one D and two S/legacy fulfills conserve synthetic backing and expected counters',async()=>{
   const empty=await pool.snapshot();await deposit('bootstrap');assert.equal(await balance(),3000n);
   const first=await candidate('first');assert.equal(BigInt(await pool.call('acceptedRoots(bytes32)',[first.expectedPostRoot])),0n);await spend(first);
   assert.equal(await balance(),3000n);assert.equal(BigInt(await pool.call('acceptedRoots(bytes32)',[first.intermediateRoot])),0n);
   await fulfill('first',first.expectedPostRoot);const second=await candidate('second',{root:first.expectedPostRoot});await spend(second);await fulfill('second',second.expectedPostRoot);
   const settled=await pool.snapshot();assert.deepEqual([settled.leafCount,settled.spentCount,settled.liveReservations,settled.liveOutputNotes],[9,4,0,5]);
   assert.equal(await balance(),3000n);assert.equal(settled.rootHistoryCount,6);assert.equal(settled.stateSequence,'5');
   for(const root of[empty.root,first.expectedPostRoot,second.expectedPostRoot])assert.equal(BigInt(await pool.call('acceptedRoots(bytes32)',[root])),1n);
   await withdraw('withdraw_balance',hash('residual change NF'),1000n, runtime.accounts[4],first.expectedPostRoot);
   const done=await pool.snapshot();assert.deepEqual([done.leafCount,done.spentCount,done.liveReservations,done.liveOutputNotes],[9,5,0,4]);assert.equal(done.rootHistoryCount,settled.rootHistoryCount);assert.equal(await balance(),2000n);
  });
  await check('S accepts historical membership root but requires exact current base root',async()=>{
   await deposit('input');const old=await pool.call('currentRoot()');await deposit('later');const c=await candidate('historical',{root:old});await spend(c);assert.equal(BigInt(await pool.call('spentNullifiers(bytes32)',[c.nullifier])),1n);
  });
  await check('copied exact S from another sender succeeds; local status0 cannot undo canonical success',async()=>{
   await deposit('copied');const c=await candidate('copied'),encoded=data('reserve_from_note',c.inputs);
   const accepted=await pool.send('copied S first sender',{from:runtime.accounts[3],to:pool.address,data:encoded,value:'0x0'}),acceptedState=await state(c);
   const copiedTx=await runtime.evm('eth_getTransactionByHash',[accepted.transactionHash]);assert.equal(copiedTx.input,encoded);assert.equal(BigInt(copiedTx.value),0n);
   const local=await pool.send('local S loses copied-success race',{from:runtime.accounts[0],to:pool.address,data:encoded,value:'0x0'},'0x0','RESERVE_ROOT_CHANGED');
   assert.notEqual(local.from,accepted.from);assert.deepEqual(await state(c),acceptedState);assert.equal(BigInt(await pool.call('spentNullifiers(bytes32)',[c.nullifier])),1n);assert.equal(BigInt(await pool.call('acceptedRoots(bytes32)',[c.expectedPostRoot])),1n);
  });
  await check('stale append and spent-only sequence churn reject prepared S without spending input',async()=>{
   await deposit('base');const stale=await candidate('stale');await deposit('churn');await reject('stale root','reserve_from_note',stale.inputs,'RESERVE_ROOT_CHANGED',{c:stale});
   const seq=await candidate('sequence');await withdraw('withdraw_balance',hash('other balance NF'));assert.equal(await pool.call('currentRoot()'),seq.expectedBaseRoot);await reject('spent-only stale sequence','reserve_from_note',seq.inputs,'RESERVE_SEQUENCE_CHANGED',{c:seq});
  });
  await check('wrong final root and reversed output projection atomically roll back all writes',async()=>{
   await deposit('wrong post');const c=await candidate('wrong post'),reverse=new PrivateNoteTree(c.snap.leaves.slice(0,c.snap.leafCount));reverse.append(c.change);reverse.append(c.output);
   for(const wrong of[ZERO_NOTE_HASH,c.expectedBaseRoot,c.intermediateRoot,reverse.root,hash('wrong root')])await reject('post root mismatch','reserve_from_note',mutate(c.inputs,66,wrong),'RESERVE_POST_ROOT_MISMATCH',{c});
   await spend(c);
  });
  await check('proof public-field binding rejects unsigned mutation of otherwise valid guards',async()=>{
   await deposit('binding');const c=await candidate('binding');
   const altered=mutate(c.inputs,66,hash('other signed post'));
   await reject('changed signed post','reserve_from_note',altered,'RESERVE_FROM_NOTE_PROOF',{c,p:proof('reserve_from_note',c.inputs)});
   for(const offset of[25,33,41,49])await reject('changed signed statement','reserve_from_note',mutate(c.inputs,offset,hash(`field ${offset}`)),'RESERVE_FROM_NOTE_PROOF',{c,p:proof('reserve_from_note',c.inputs)});
  });
  await check('S and both W methods are nonpayable, with complete value rollback',async()=>{
   await deposit('value');const c=await candidate('value'),w=await encode('withdraw_balance',{root:c.root,nullifier:hash('value W NF'),amount:1n,recipient:runtime.accounts[4]});
   for(const[mode,inputs]of[['reserve_from_note',c.inputs],['withdraw_balance',w],['withdraw',w]]){
    const before=await state(c),transactionHash=await runtime.evm('eth_sendTransaction',[{from:runtime.accounts[0],to:pool.address,data:data(mode,inputs),value:'0x1',gas:'0x1c9c380'}]);
    let receipt;for(let i=0;i<200;i++){receipt=await runtime.evm('eth_getTransactionReceipt',[transactionHash]);if(receipt)break;await sleep(50);}assert.ok(receipt,'NONPAYABLE_CONTROL_RECEIPT');
    const trace=await runtime.evm('debug_traceTransaction',[transactionHash,{disableMemory:true,disableStack:true,disableStorage:true}]);
    assert.equal(receipt.status,'0x0');assert.equal(trace.failed,true);assert.deepEqual(receipt.logs,[]);assert.deepEqual(await state(c),before);assert.equal(decodePrivateRevert(trace.returnValue).kind,'EMPTY_REVERT');rawReceipts.push({label:`nonpayable ${mode}`,receipt,trace:{failed:trace.failed,returnValue:trace.returnValue},expected:'compiler nonpayable empty revert'});
   }
  });
  await check('D enforces current domain/epoch/widths, exact positive value and fresh commitment',async()=>{
   const output=hash('D candidate'),inputs=await encode('deposit_balance',{amount:1000n,output}),c={output};
   for(const value of[0n,999n,1001n])await reject('D value','deposit_balance',inputs,'DEPOSIT_AMOUNT',{value,c});
   for(const[offset,value,reason]of[[16,0n,'STALE_EPOCH'],[17,1n<<64n,'PUBLIC_U64'],[18,1n<<32n,'PUBLIC_U32'],[0,1n<<32n,'PUBLIC_U32']])await reject('D word','deposit_balance',mutate(inputs,offset,value),reason,{value:1000n,c});
   await reject('D zero','deposit_balance',mutate(inputs,17,0n),'DEPOSIT_AMOUNT',{value:0n,c});
   for(const offset of[0,8])await reject('D domain','deposit_balance',mutate(inputs,offset,hash('wrong domain')),'PUBLIC_DOMAIN',{value:1000n,c});
   await reject('D zero output','deposit_balance',mutate(inputs,18,ZERO_NOTE_HASH),'OUTPUT_ALREADY_INSERTED',{value:1000n,c});
   await send('D success','deposit_balance',inputs,{value:1000n});await reject('D duplicate','deposit_balance',inputs,'OUTPUT_ALREADY_INSERTED',{value:1000n,c});
  });
  await check('all D/S/W exact lengths, immutable proof families and range checks reject',async()=>{
   await deposit('ABI');const c=await candidate('ABI'),d=await encode('deposit_balance',{amount:1n,output:hash('ABI new output')}),w=await encode('withdraw_balance',{root:c.root,nullifier:hash('ABI W'),amount:1n,recipient:runtime.accounts[4]});
   for(const[mode,inputs,value,reason]of[['deposit_balance',d,1n,'DEPOSIT_BALANCE_PROOF'],['reserve_from_note',c.inputs,undefined,'RESERVE_FROM_NOTE_PROOF'],['withdraw_balance',w,undefined,'WITHDRAW_BALANCE_PROOF']]){
    for(const malformed of[inputs.slice(1),[...inputs,'0']])await reject('bad length',mode,malformed,'PUBLIC_INPUT_LENGTH',{value,c});
    await reject('wrong immutable proof family',mode,inputs,reason,{value,c,p:proof('sol_ready',inputs)});
   }
   for(const[offset,value,reason]of[[16,1n<<64n,'PUBLIC_U64'],[65,1n<<64n,'PUBLIC_U64'],[57,1n<<32n,'PUBLIC_U32'],[66,1n<<32n,'PUBLIC_U32'],[25,1n<<32n,'PUBLIC_U32']])await reject('S width','reserve_from_note',mutate(c.inputs,offset,value),reason,{c});
   await reject('W recipient width','withdraw_balance',mutate(w,34,1n<<32n),'PUBLIC_U32',{c});
  });
  await check('shared admissions/inserted outputs reject reuse across legacy reserve, D and S',async()=>{
   const input=await deposit('uniqueness'),c=await candidate('uniqueness');await spend(c);
   const next=await candidate('next');
   await reject('S same origin','reserve_from_note',mutate(next.inputs,49,c.admissionTag),'ORIGIN_ALREADY_ADMITTED',{c:next});
   for(const offset of[33,41])for(const output of[input.output,c.output,c.change,ZERO_NOTE_HASH])await reject('S inserted output','reserve_from_note',mutate(next.inputs,offset,output),'OUTPUT_ALREADY_INSERTED',{c:next});
   await reject('S duplicate pair','reserve_from_note',mutate(next.inputs,41,next.output),'DUPLICATE_OUTPUT',{c:next});
   const legacy=await encode('reserve',{amount:1n,output:hash('legacy output'),admissionTag:c.admissionTag});await reject('legacy same origin','reserve',legacy,'ORIGIN_ALREADY_ADMITTED',{value:1n,c});
   const depositInput=await encode('deposit_balance',{amount:1n,output:c.change});await reject('D cannot reinsert S change','deposit_balance',depositInput,'OUTPUT_ALREADY_INSERTED',{value:1n,c});
  });
  await check('unknown membership and zero/spent canonical NF reject including accepted old roots',async()=>{
   await deposit('NF');const c=await candidate('NF');await reject('unknown membership','reserve_from_note',mutate(c.inputs,17,hash('unknown root')),'UNKNOWN_ROOT',{c});
   await reject('zero NF','reserve_from_note',mutate(c.inputs,25,ZERO_NOTE_HASH),'NOTE_ALREADY_SPENT',{c});await spend(c);
   const next=await candidate('NF replay',{root:c.root,nullifier:c.nullifier});await reject('NF old root replay','reserve_from_note',next.inputs,'NOTE_ALREADY_SPENT',{c:next});
  });
  await check('internal spend wins canonical-nullifier race against old type2/3 withdrawal',async()=>{
   await deposit('race');const funding=await candidate('race funding');await spend(funding);await refund('race recovery');
   const c=await candidate('race payout'),old=await encode('withdraw',{root:c.root,nullifier:c.nullifier,amount:1000n,recipient:runtime.accounts[4]});await spend(c);
   await reject('old withdrawal loses','withdraw',old,'NOTE_ALREADY_SPENT',{c});
  });
  await check('old type2/3 withdrawal wins race against subsequently refreshed internal spend',async()=>{
   await deposit('reverse race');const funding=await candidate('reverse funding');await spend(funding);await refund('reverse recovery');
   const c=await candidate('reverse payout');await withdraw('withdraw',c.nullifier);
   await reject('prepared S loses sequence','reserve_from_note',c.inputs,'RESERVE_SEQUENCE_CHANGED',{c});
   const next=await candidate('reverse retry',{root:c.root,nullifier:c.nullifier});await reject('refreshed S loses NF','reserve_from_note',next.inputs,'NOTE_ALREADY_SPENT',{c:next});
  });
  await check('balance withdrawal failure rolls back NF, digest, counts, sequence and ETH',async()=>{
   await deposit('failed recipient');const c=await candidate('failed recipient'),inputs=await encode('withdraw_balance',{root:c.root,nullifier:c.nullifier,amount:1000n,recipient:pool.address});
   await reject('receiver reverts','withdraw_balance',inputs,'ASSET_SELF_RECIPIENT',{c});await withdraw('withdraw_balance',c.nullifier);assert.equal(await balance(),2000n);
  });
  await check('withdrawal terms reject zero amount/recipient and direct balance proof replay',async()=>{
   await deposit('terms');const c=await candidate('terms'),inputs=await encode('withdraw_balance',{root:c.root,nullifier:c.nullifier,amount:1000n,recipient:runtime.accounts[4]});
   await reject('zero withdrawal','withdraw_balance',mutate(inputs,33,0n),'WITHDRAWAL_TERMS',{c});const zero=[...inputs];zero.fill('0',34,39);await reject('zero recipient','withdraw_balance',zero,'WITHDRAWAL_TERMS',{c});
   await send('withdraw success','withdraw_balance',inputs);await reject('withdraw replay','withdraw_balance',inputs,'NOTE_ALREADY_SPENT',{c});
  });
  await check('intermediate reservation-only root is not accepted by legacy refund/withdraw',async()=>{
   await deposit('intermediate');const c=await candidate('intermediate');await spend(c);
   const inputs=await encode('refund',{root:c.intermediateRoot,nullifier:hash('orphan reserved NF'),outputRecovery:hash('orphan recovery')});await reject('orphan refund','refund',inputs,'UNKNOWN_ROOT',{c});
   const w=await encode('withdraw',{root:c.intermediateRoot,nullifier:hash('orphan payout NF'),amount:1n,recipient:runtime.accounts[4]});await reject('orphan withdrawal','withdraw',w,'UNKNOWN_ROOT',{c});assert.ok(!(await pool.snapshot()).rootHistory.includes(c.intermediateRoot));
  });
  await check('near-capacity D cannot steal terminal headroom and S requires four units',async()=>{
   for(let i=0;i<20;i++){const inputs=await encode('reserve',{amount:1n,output:hash(`capacity legacy ${i}`),admissionTag:hash(`capacity admission ${i}`)});await send('legacy capacity','reserve',inputs,{value:1n});}
   for(let i=0;i<4;i++)await deposit(`capacity D ${i}`,1n);
   const before=await pool.snapshot();assert.deepEqual([before.leafCount,before.liveReservations,before.liveOutputNotes],[24,20,4]);
   const d=await encode('deposit_balance',{amount:1n,output:hash('overflow D')});await reject('D terminal headroom','deposit_balance',d,'TREE_HEADROOM',{value:1n});
   const c=await candidate('overflow S');await reject('S terminal headroom','reserve_from_note',c.inputs,'TREE_HEADROOM',{c});
   await refund('capacity terminal');assert.equal((await pool.snapshot()).liveReservations,19);
  });
  await check('repeated S/refund/withdraw transitions preserve bounded counters without recycling',async()=>{
   // Fifteen refunded S cycles leave leaves=46 and spent=30 while O=16: tree
   // and spent weighted usage agree initially; withdrawals preserve spent usage.
   await deposit('spent headroom',100000n);
   for(let i=0;i<15;i++){const c=await candidate(`spent cycle ${i}`);await spend(c);await refund(`spent cycle ${i}`);}
   const before=await pool.snapshot();assert.deepEqual([before.leafCount,before.spentCount,before.liveOutputNotes],[46,30,16]);
   // Spent usage rises via withdrawing spendable notes without removing leaves,
   // so it stays equal to leaf usage. Use bounded unspent reservations to verify
   // both inequalities are rechecked by every transition; no reset is allowed.
   const c=await candidate('spent pending');await spend(c);assert.equal((await pool.snapshot()).spentCount,31);
   await withdraw('withdraw_balance',hash('spent-only cap NF'),1n);assert.equal((await pool.snapshot()).spentCount,32);
   assert.equal((await pool.snapshot()).liveOutputNotes,15);
  });
  await check('revocation coverage halt blocks new D and S while preserving explicit W recovery',async()=>{
   await deposit('halt');const c=await candidate('halt');
   for(let i=0;i<65;i++)await pool.send('authorized synthetic adverse',{to:pool.address,from:runtime.accounts[1],data:pool.data('recordAdverse(uint8,bytes32,bytes32)',[1,hash(`halt effect ${i}`),hash(`halt evidence ${i}`)])});
   assert.equal((await pool.snapshot()).revocationCoverageHalted,true);
   const d=await encode('deposit_balance',{amount:1n,output:hash('halt D')});await reject('halt D','deposit_balance',d,'REVOCATION_COVERAGE_HALTED',{value:1n,c});await reject('halt S','reserve_from_note',c.inputs,'REVOCATION_COVERAGE_HALTED',{c});
   await withdraw('withdraw_balance',hash('halt recovery NF'),1n);
  });
  const report={classification:CLASSIFICATION,status:cases.every(c=>c.passed)?'PASSED':'FAILED',cases,sources:pool.compilation.sources,runtimePins:{anvil:linuxRuntimePins.anvil,solc:linuxRuntimePins.solc},deployments:pool.deployments,receipts:[...pool.receipts,...rawReceipts]};
  t.diagnostic(JSON.stringify({classification:CLASSIFICATION,cases:cases.length,receipts:report.receipts.length,deployedPoolBytes:pool.deployments.find(d=>d.role==='asset-funded-note-pool').deployedCodeBytes}));
  if(process.env.PRIVATE_ASSET_SAVE_NATIVE_CONTROLS==='1'){const folder=join(projectRoot,'evidence/private-asset-native-controls');await mkdir(folder,{recursive:true});await writeFile(join(folder,`report-${Date.now()}.json`),JSON.stringify(report,null,2)+'\n');await writeFile(join(folder,'report.json'),JSON.stringify(report,null,2)+'\n');}
 }finally{await runtime.close();}
});
