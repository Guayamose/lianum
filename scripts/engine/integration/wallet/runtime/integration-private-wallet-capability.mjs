/** Genuine PC23 D/S/W circuit + deployed-pool capability on owned synthetic ETH.
 * No native SOL/BTC execution, A/readiness proof, custody/owner-exit integration,
 * end-user wallet acceptance or production privacy claim is made by this run. */
import assert from 'node:assert/strict';
import {randomBytes,createHash} from 'node:crypto';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {join} from 'node:path';
import {createGraph,freshKey,policyCommitment,nullifier} from '../../../../../packages/engine/src/notes/private-note-encoding.mjs';
import {createBalanceNote,walletDepositInput,walletReserveInput,walletWithdrawInput,walletInputPublicWords,decodeWalletPoolInputs} from '../../../../../packages/engine/src/wallet/notes/private-wallet-note-encoding.mjs';
import {PrivateNoteTree,noteHashToWords} from '../../../../../packages/engine/src/notes/private-note-tree.mjs';
import {deployPrivateWalletNativePool,privateVerifierCalldata} from '../../../../../packages/engine/src/wallet/runtime/private-wallet-runtime.mjs';
import { createAssemblyProofWorkerRunner } from '@lianum/proofs/execution/assembly-workers';
import {loadWalletVerifierSources,walletVerificationPins} from '../../../../../experiments/engine/private-core-proof/wallet-notes/prover.mjs';
import {linuxRuntimePins} from '../../../../../packages/engine/src/chains/shared/linux-runtime-pins.mjs';
import {pinnedBinary,scratchDirectory,removeOwnScratch,unusedLoopbackPort,startOwnProcess,stopOwnProcess,ownedRuntimeRpc,sleep,projectRoot} from '../../../../../packages/engine/src/chains/shared/runtime-harness.mjs';
const sha=value=>createHash('sha256').update(value).digest('hex'),hex=value=>'0x'+Buffer.from(value).toString('hex');
const runId=new Date().toISOString().replace(/[:.]/g,'-'),directory=join(projectRoot,'evidence/m23-wallet-capability',runId),reportPath=join(directory,'report.json');
await mkdir(directory,{recursive:true});
const report={classification:'GENUINE_WALLET_CIRCUIT_DEPLOYED_SYNTHETIC_ETH_CAPABILITY_NOT_NATIVE_OR_WALLET_ACCEPTANCE',runId,startedAt:new Date().toISOString(),phase:'starting',fullAcceptance:false,nativeSolExecuted:false,nativeBtcExecuted:false,ownerExitOrDurableCustodyTested:false,publicNetwork:false,realFunds:false,controlledSyntheticEvmClock:true,disclosure:'Only public proof material, deployment/source pins, canonical public state and transaction receipts are retained. This synthetic capability deliberately discloses 3B deposit, B reservation and 2B change/withdrawal with B=10^15 wei. No private opening, key, witness or graph package is written.',proofs:[],checks:[],artifacts:{},deployments:[]};
const save=()=>writeFile(reportPath,JSON.stringify(report,null,2)+'\n');
const archive=async(name,bytes)=>{const path=join(directory,name);await mkdir(join(path,'..'),{recursive:true});await writeFile(path,bytes,{flag:'wx'});report.artifacts[name]={bytes:bytes.length,sha256:sha(bytes)};await save();};
let runtime,pool,clock;const prove=createAssemblyProofWorkerRunner();
async function ownAnvil(){
 const binary=await pinnedBinary(...linuxRuntimePins.anvil),cwd=await scratchDirectory('pc23-genuine-wallet-capability-');let handle;
 try{const port=await unusedLoopbackPort();handle=startOwnProcess(binary,['--host','127.0.0.1','--port',String(port),'--chain-id','31337','--hardfork','cancun','--timestamp','1900000200','--accounts','5','--balance','10','--mnemonic-random','12','--no-cors'],cwd);
  const evm=(method,params=[])=>ownedRuntimeRpc(`http://127.0.0.1:${port}`,method,params,{timeoutMs:30000});let ready=false;
  for(let i=0;i<100;i++){handle.assertAlive();try{ready=await evm('eth_chainId')==='0x7a69';if(ready)break;}catch{}await sleep(50);}assert.ok(ready,'PC23_CAPABILITY_ANVIL_READY');
  return{evm,accounts:await evm('eth_accounts'),metadata:{classification:'OWNED_LOCAL_RUNTIMES_ONLY',freshSyntheticWallets:true,chainId:'31337',evmGenesis:(await evm('eth_getBlockByNumber',['0x0',false])).hash},close:async()=>{await stopOwnProcess(handle);await removeOwnScratch(cwd);}};
 }catch(error){if(handle)await stopOwnProcess(handle);await removeOwnScratch(cwd);throw error;}
}
async function sourceMap(){
 const frozenPath='evidence/m18-post-native-review/2026-10-03T02-06-20-857Z/terminal-report.json',bytes=await readFile(join(projectRoot,frozenPath));
 assert.equal(sha(bytes),'0fb709cd4ee19b3270bcc0e202702d1f274cbaf047f32b105bfe54a6d42ec081','PC23_FROZEN_NATIVE_SOURCE_AUTHORITY');
 const frozen=JSON.parse(bytes),sources={...loadWalletVerifierSources()};
 for(const mode of ['reserve','withdraw','fulfill','refund','sol_ready','btc_ready']){
  const family=['reserve','withdraw'].includes(mode)?'native-notes':'owner-independent',path=`experiments/private-core-proof/${family}/.local/prepared/${mode}.sol`,content=await readFile(join(projectRoot,path),'utf8'),pin=frozen.sources[path];
  assert.ok(pin,'PC23_FROZEN_VERIFIER_PIN');assert.equal(Buffer.byteLength(content),pin.bytes,'PC23_FROZEN_VERIFIER_SIZE');assert.equal(sha(content),pin.sha256,'PC23_FROZEN_VERIFIER_HASH');sources[mode]={content,sha256:pin.sha256};
 }
 report.baselineVerifierPins={file:frozenPath,sha256:sha(bytes)};report.walletVerificationPins=walletVerificationPins();
 const provenancePath='evidence/m23-wallet-proof-provenance-2026-10-03T07-18-48-938Z.json',provenanceBytes=await readFile(join(projectRoot,provenancePath));assert.equal(sha(provenanceBytes),'206a57aa6141eb28a447724ff0ccb1a80dd13c7740ef8e1d3a99338a3b0a3840','PC23_WALLET_PROVENANCE_PIN');
 for(const record of JSON.parse(provenanceBytes).records)for(const key of['sourceSHA256','circuitSHA256','keySHA256','soliditySHA256'])assert.equal(report.walletVerificationPins[record.mode][key],record[key],'PC23_WALLET_ARTIFACT_LINEAGE');
 report.walletProvenance={file:provenancePath,sha256:sha(provenanceBytes)};return sources;
}
async function makeProof(mode,input,label){
 report.phase='proving-'+label;await save();console.log(JSON.stringify({phase:report.phase}));
 const began=performance.now(),expected=walletInputPublicWords(mode,input),result=await prove(mode,input,label);
 assert.deepEqual(result.publicInputs.map(BigInt),expected.map(BigInt),'PC23_EXACT_PROVED_STATEMENT');
 report.proofs.push({mode,label,wallMilliseconds:performance.now()-began,proofBytes:result.proof.length,proofSHA256:sha(result.proof),publicInputsSHA256:sha(JSON.stringify(result.publicInputs)),publicInputs:result.publicInputs,statement:decodeWalletPoolInputs(mode,result.publicInputs),verifiedInShortLivedWorker:true,workerExitedBeforeReturn:true});
 await archive(`public-proofs/${label}.bin`,Buffer.from(result.proof));await archive(`public-proofs/${label}.inputs.json`,Buffer.from(JSON.stringify(result.publicInputs,null,2)+'\n'));
 return result;
}
async function send(label,transaction,status='0x1',reason){
 await runtime.evm('evm_setNextBlockTimestamp',[++clock]);let receipt;
 try{receipt=await pool.send(label,transaction,status,reason);return receipt;}finally{report.receipts=pool.receipts;await save();}
}
const balance=account=>runtime.evm('eth_getBalance',[account,'latest']).then(BigInt);
async function acceptVerifier(mode,p,label){assert.equal(await pool.verify(mode,p.proof,p.publicInputs),true,'PC23_GENUINE_DEPLOYED_VERIFIER');await send(label,{to:pool.verifiers[mode].address,data:privateVerifierCalldata(pool.verifiers[mode].selector,p.proof,p.publicInputs)});report.checks.push({name:label,passed:true});}
async function rejectMutations(mode,p,offset,label){
 const changed=[...p.publicInputs];changed[offset]='0x'+((BigInt(changed[offset])+1n)%(1n<<32n)).toString(16).padStart(64,'0');
 await send(label+' changed public word',{to:pool.verifiers[mode].address,data:privateVerifierCalldata(pool.verifiers[mode].selector,p.proof,changed)},'0x0');
 const corrupted=Buffer.from(p.proof);corrupted[corrupted.length-1]^=1;
 await send(label+' changed proof byte',{to:pool.verifiers[mode].address,data:privateVerifierCalldata(pool.verifiers[mode].selector,corrupted,p.publicInputs)},'0x0');
 report.checks.push({name:label+' public/proof mutation rejected by actual deployed verifier',passed:true});
}
function newPolicy(){const policy={minimumBtcConfirmations:6};for(const role of['sol','btc']){const key=freshKey();policy[role]={policyId:randomBytes(32),identityNamespace:randomBytes(32),genesis:randomBytes(32),x:key.x,y:key.y};}return policy;}
function graphAt(scope,policy,epoch){return createGraph({scope,policy,epoch,sourceSol:randomBytes(32),recipientSol:randomBytes(32),recipientBtc:randomBytes(32),budget:1000000000000000n});}
const publicState=async()=>({snapshot:await pool.snapshot(),balanceWei:String(await balance(pool.address))});
try{
 const ownedSources=['contracts/PrivateWalletNativeNotePool.sol','src/private-wallet-runtime.mjs','src/private-wallet-capacity.mjs','src/private-wallet-note-encoding.mjs','src/private-assembly-actors.mjs','scripts/integration-private-wallet-capability.mjs','experiments/private-core-proof/wallet-notes/prover.mjs','experiments/private-core-proof/wallet-notes/one-proof-worker.mjs'];
 report.sources={};for(const path of ownedSources){const bytes=await readFile(join(projectRoot,path));report.sources[path]={bytes:bytes.length,sha256:sha(bytes)};await archive('source/'+path,bytes);}
 const sources=await sourceMap();for(const[mode,{content}]of Object.entries(sources))await archive(`verifiers/${mode}.sol`,Buffer.from(content));
 report.phase='deploying-nine-genuine-verifiers';await save();runtime=await ownAnvil();const policy=newPolicy(),policyHash=policyCommitment(policy);
 report.runtime={...runtime.metadata,pins:linuxRuntimePins,node:process.version};
 pool=await deployPrivateWalletNativePool(runtime,{sources,policy:hex(policyHash),deploymentDomain:hex(randomBytes(32)),solAuthority:runtime.accounts[1],btcAuthority:runtime.accounts[2],onDeployment:async record=>{report.deployments.push(record);await save();}});
 report.pool={address:pool.address,scope:pool.scope,policy:pool.policy,verifiers:pool.verifiers,compilation:{sources:pool.compilation.sources,settings:pool.compilation.settings,milliseconds:pool.compilation.milliseconds,peakSampledRSSKiB:pool.compilation.peakSampledRSSKiB}};
 clock=(Math.floor(Number(BigInt((await runtime.evm('eth_getBlockByNumber',['latest',false])).timestamp))/600)+1)*600+10;await runtime.evm('evm_setNextBlockTimestamp',[clock]);await runtime.evm('evm_mine');const epoch=BigInt(Math.floor(clock/600)),scope=Buffer.from(pool.scope.slice(2),'hex');
 const note=createBalanceNote({scope,policy:policyHash,value:3000000000000000n}),dInput=walletDepositInput({scope,policy:policyHash,epoch,note});
 report.before=await publicState();const d=await makeProof('deposit_balance',dInput,'genuine-balance-deposit');await acceptVerifier('deposit_balance',d,'actual D26 verifier accepts');await rejectMutations('deposit_balance',d,18,'D26');
 await send('genuine D26 funded deposit',{to:pool.address,data:pool.proofData('deposit_balance',d.proof,d.publicInputs),value:'0x'+note.value.toString(16)});
 report.afterDeposit=await publicState();assert.deepEqual([report.afterDeposit.snapshot.leafCount,report.afterDeposit.snapshot.spentCount,report.afterDeposit.snapshot.liveReservations,report.afterDeposit.snapshot.liveOutputNotes],[1,0,0,1]);assert.equal(report.afterDeposit.balanceWei,String(note.value));
 const tree=new PrivateNoteTree(report.afterDeposit.snapshot.leaves.slice(0,1)),inputPath=tree.path(0),graph=graphAt(scope,policy,epoch),change=createBalanceNote({scope,policy:policyHash,value:note.value-graph.budget});
 tree.append(graph.reserved);const intermediate=tree.root;tree.append(change.commitment);
 const sInput=walletReserveInput({graph,epoch,note,path:inputPath,change,expectedBaseRoot:report.afterDeposit.snapshot.root,expectedSequence:report.afterDeposit.snapshot.stateSequence,expectedPostRoot:tree.root}),s=await makeProof('reserve_from_note',sInput,'genuine-guarded-internal-spend'),sStatement=decodeWalletPoolInputs('reserve_from_note',s.publicInputs);
 assert.equal(sStatement.nullifier,hex(nullifier(scope,note.commitment,note.secret)));assert.equal(sStatement.output,hex(graph.reserved));assert.equal(sStatement.change,hex(change.commitment));assert.equal(note.value,graph.budget+change.value);
 await acceptVerifier('reserve_from_note',s,'actual S74 verifier accepts');await rejectMutations('reserve_from_note',s,66,'S74 signed final root');
 const sData=pool.proofData('reserve_from_note',s.proof,s.publicInputs);
 const copied=await send('copied genuine S74 alternate sender succeeds',{from:runtime.accounts[3],to:pool.address,data:sData,value:'0x0'});report.copiedSpendReceipt=copied;
 report.afterSpend=await publicState();assert.deepEqual([report.afterSpend.snapshot.leafCount,report.afterSpend.snapshot.spentCount,report.afterSpend.snapshot.liveReservations,report.afterSpend.snapshot.liveOutputNotes],[3,1,1,1]);assert.equal(report.afterSpend.snapshot.root,tree.root);assert.equal(report.afterSpend.balanceWei,String(note.value));assert.equal(BigInt(await pool.call('acceptedRoots(bytes32)',[intermediate])),0n);assert.ok(!report.afterSpend.snapshot.rootHistory.includes(intermediate));
 assert.equal(BigInt(await pool.call('acceptedRoots(bytes32)',[inputPath.root])),1n);assert.equal(BigInt(await pool.call('spentNullifiers(bytes32)',[sStatement.nullifier])),1n);
 await send('local exact genuine S74 loses copied-success race',{to:pool.address,data:sData,value:'0x0'},'0x0','RESERVE_ROOT_CHANGED');
 const afterRace=await publicState();assert.deepEqual(afterRace.snapshot.leaves,report.afterSpend.snapshot.leaves);assert.equal(afterRace.snapshot.spentDigest,report.afterSpend.snapshot.spentDigest);assert.equal(afterRace.snapshot.stateSequence,report.afterSpend.snapshot.stateSequence);
 report.checks.push({name:'Copied genuine S succeeds and local status0 leaves canonical input consumed',passed:true});
 // First distinguish an old-proof, changed-statement ordering control from the
 // fresh, independently valid second S proof below.
 const changedGuards=[...s.publicInputs];changedGuards.splice(57,8,...noteHashToWords(report.afterSpend.snapshot.root));changedGuards[65]=report.afterSpend.snapshot.stateSequence;
 await send('invalid changed-guard old-proof replay rejected by spent precheck',{to:pool.address,data:pool.proofData('reserve_from_note',s.proof,changedGuards),value:'0x0'},'0x0','NOTE_ALREADY_SPENT');
 report.checks.push({name:'Old proof with changed guards rejected before verification',classification:'CONTRACT_ORDERING_ONLY_NOT_VALID_SECOND_PROOF',passed:true});
 const replayGraph=graphAt(scope,policy,epoch),replayChange=createBalanceNote({scope,policy:policyHash,value:note.value-replayGraph.budget}),replayTree=new PrivateNoteTree(report.afterSpend.snapshot.leaves.slice(0,3));replayTree.append(replayGraph.reserved);replayTree.append(replayChange.commitment);
 const replayInput=walletReserveInput({graph:replayGraph,epoch,note,path:inputPath,change:replayChange,expectedBaseRoot:report.afterSpend.snapshot.root,expectedSequence:report.afterSpend.snapshot.stateSequence,expectedPostRoot:replayTree.root}),replay=await makeProof('reserve_from_note',replayInput,'genuine-consumed-input-fresh-guards');
 const replayStatement=decodeWalletPoolInputs('reserve_from_note',replay.publicInputs);assert.equal(replayStatement.nullifier,sStatement.nullifier);assert.notEqual(replayStatement.output,sStatement.output);assert.notEqual(replayStatement.change,sStatement.change);assert.notEqual(replayStatement.admissionTag,sStatement.admissionTag);
 await acceptVerifier('reserve_from_note',replay,'actual S verifier accepts fresh valid spent-input candidate');
 const beforeReplay=await publicState();await send('genuine fresh-guard spent-input proof rejected by shared NF',{to:pool.address,data:pool.proofData('reserve_from_note',replay.proof,replay.publicInputs),value:'0x0'},'0x0','NOTE_ALREADY_SPENT');
 const afterReplay=await publicState();assert.equal(afterReplay.snapshot.stateSequence,beforeReplay.snapshot.stateSequence);assert.equal(afterReplay.snapshot.root,beforeReplay.snapshot.root);assert.equal(afterReplay.balanceWei,beforeReplay.balanceWei);
 for(const cm of[replayStatement.output,replayStatement.change])assert.equal(BigInt(await pool.call('insertedCommitments(bytes32)',[cm])),0n);assert.equal(BigInt(await pool.call('admissions(bytes32)',[replayStatement.admissionTag])),0n);
 report.checks.push({name:'Freshly signed and genuine-verifier-valid second S is rejected specifically NOTE_ALREADY_SPENT',passed:true});
 const wInput=walletWithdrawInput({scope,policy:policyHash,epoch,note:change,path:tree.path(2),recipient:runtime.accounts[4]}),w=await makeProof('withdraw_balance',wInput,'genuine-explicit-change-withdrawal'),wStatement=decodeWalletPoolInputs('withdraw_balance',w.publicInputs);
 assert.equal(wStatement.nullifier,hex(nullifier(scope,change.commitment,change.secret)));assert.equal(wStatement.amount,String(change.value));await acceptVerifier('withdraw_balance',w,'actual W39 verifier accepts');await rejectMutations('withdraw_balance',w,34,'W39 recipient');
 await send('same-39-word genuine W under wrong immutable legacy VK',{to:pool.verifiers.withdraw.address,data:privateVerifierCalldata(pool.verifiers.withdraw.selector,w.proof,w.publicInputs)},'0x0');report.checks.push({name:'Genuine W39 proof rejected by distinct legacy W39 verification key with same public word count',passed:true});
 const recipientBefore=await balance(runtime.accounts[4]);await send('explicit genuine W39 change withdrawal',{to:pool.address,data:pool.proofData('withdraw_balance',w.proof,w.publicInputs),value:'0x0'});
 assert.equal(await balance(runtime.accounts[4])-recipientBefore,change.value);report.afterWithdrawal=await publicState();assert.deepEqual([report.afterWithdrawal.snapshot.leafCount,report.afterWithdrawal.snapshot.spentCount,report.afterWithdrawal.snapshot.liveReservations,report.afterWithdrawal.snapshot.liveOutputNotes],[3,2,1,0]);assert.equal(report.afterWithdrawal.balanceWei,String(graph.budget));assert.equal(report.afterWithdrawal.snapshot.rootHistoryCount,report.afterSpend.snapshot.rootHistoryCount);
 await send('genuine explicit W replay rejected',{to:pool.address,data:pool.proofData('withdraw_balance',w.proof,w.publicInputs),value:'0x0'},'0x0','NOTE_ALREADY_SPENT');
 report.checks.push({name:'One genuine D, zero-value S and explicit W conserve 3B deposit = B reserved + 2B withdrawn',passed:true});
 for(const[path,pin]of Object.entries(report.sources))assert.equal(sha(await readFile(join(projectRoot,path))),pin.sha256,'PC23_SOURCE_CHANGED_DURING_CAPABILITY');
 report.phase='completed';report.completedAt=new Date().toISOString();
}catch(error){report.failedPhase=report.phase;report.phase='failed';report.failure={name:error.name,message:/^PC(?:18|23)_[A-Z0-9_]+$/.test(error.message)?error.message:'CAPABILITY_CHECK_FAILED',code:typeof error.code==='string'?error.code:undefined};process.exitCode=1;console.error(JSON.stringify(report.failure));}
finally{if(pool)report.receipts=pool.receipts;if(runtime){await runtime.close();report.runtimeCleanup={completed:true};}report.processResourceUsage=process.resourceUsage();await save();console.log(JSON.stringify({report:reportPath,phase:report.phase,proofs:report.proofs.length,checks:report.checks.length}));}
