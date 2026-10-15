// Disposable owned Anvil + loopback-guarded Agave + offline Core only.
// Common-operator research harness. Never use with external capital or real keys.
import assert from'node:assert/strict';
import{randomBytes}from'node:crypto';
import{readFile,writeFile,mkdir,copyFile,stat,rm}from'node:fs/promises';
import{spawn}from'node:child_process';
import{fileURLToPath}from'node:url';
import{createRecipientGraphPlan,discoverRecipientWithdrawal}from'../../../../packages/engine/src/recipients/private-recipient-graph.mjs';
import{importRecipientInvoice,recipientWithdrawalInput}from'../../../../packages/engine/src/recipients/private-recipient-custody.mjs';
import{join}from'node:path';
import{createOwnedNativeRuntime}from'../../../../packages/engine/src/chains/shared/native-runtime.mjs';
import{createOwnedSolanaRuntime,base58Decode}from'../../../../packages/engine/src/chains/solana/solana-runtime.mjs';
import{projectRoot}from'../../../../packages/engine/src/chains/shared/runtime-harness.mjs';
import{createDisposableNativeIssuerLifetime,verifyNativeCertificate}from'../../../../packages/engine/src/notes/private-native-certificate.mjs';
import{deployPrivateCurrentNativePool,assertPrivateSnapshotCanonical}from'../../../../packages/engine/src/finality/private-finality-runtime.mjs';
import{createCurrentFinalityAuthority,FINALITY_PROFILE_NAME}from'../../../../packages/engine/src/finality/private-finality-authority.mjs';
import{savePublicNoteProofArtifacts}from'../../../../packages/proofs/programs/native-notes/public-artifacts.mjs';
import{PrivateNoteTree,noteWordsToHash,privateSpentDigest,privateEffectDigest}from'../../../../packages/engine/src/notes/private-note-tree.mjs';
import{policyCommitment,reserveInput,sha256,localCommitment}from'../../../../packages/engine/src/notes/private-note-encoding.mjs';
import{readinessInput,fulfillInput}from'../../../../packages/proofs/programs/native-notes/fixtures.mjs';
import{createNoteProver,modes,noteExperiment}from'../../../../packages/proofs/programs/native-notes/prover.mjs';
const runId=new Date().toISOString().replace(/[:.]/g,'-'),local=join(noteExperiment,'.local/recipient-native-'+runId),path=join(projectRoot,'evidence/m17-recipient-native-'+runId+'.json');await mkdir(local,{recursive:true});
const record={classification:'IN_PROGRESS_PC17_RECIPIENT_NATIVE_RECOVERY',runId,startedAt:new Date().toISOString(),phase:'starting',fullAcceptance:false,commonOperator:true,realFunds:false,publicNetwork:false,recipientSigningKeysGeneratedInOwner:false,ownerKnowsFullGraphAndNoteOpenings:true,hostileHostIsolation:false,ownerIndependentClaimability:false,proofs:[],checks:[],deployments:[],recipientTranscripts:{sol:[],btc:[]},intentionalAuditDisclosure:'This synthetic common-operator evidence deliberately publishes native receipts, certificate mappings, pool statements and own public note commitments. It is not an unlinkability transcript. No private note opening or signing key is included.',limitations:['Owner can withhold global proof and eventually refund after native delivery; no executor no-loss guarantee','Separate recipient processes are a trusted-OS API/data minimization boundary, not adversarial isolation','Common harness supplies passwords, operator acknowledgements and pinned destinations','Only recipient signing-key custody restarts; pool, nodes, issuer keys and capabilities stay running','Owner knows full graph and both note openings for monolithic proof','Native SOL/BTC signing keys remain in existing common-operator adapters','Public amounts, timing, permits, output bundles and recipient/authority coalitions remain linkable','PC16 leases require honest available current observers and timely included adverse facts','No remote bootstrap, arbitrary hidden strategy, proof-only assembly or production wallet acceptance','Local EVM clock is deliberately controlled; real-world epoch/lease liveness is unproven']};
const save=()=>writeFile(path,JSON.stringify(record,null,2)+'\n');const check=(name,ok)=>{assert.ok(ok,name);record.checks.push(name);};let runtime,solana,issuer,prover,pool,clock;const workers=[];const roleWorkers={};const roleTerms={};
const pref=b=>'0x'+Buffer.from(b).toString('hex'),raw=h=>Buffer.from(h.replace(/^0x/,''),'hex');
// IPC evidence contains only field names, channels, operations and error codes.
// The trusted common harness knows vault passwords, never recipient private keys.
function fields(value,prefix=''){
 if(value===null||typeof value!=='object')return [];
 return Object.entries(value).flatMap(([key,val])=>{const name=prefix?prefix+'.'+key:key;return [name,...(Array.isArray(val)?[]:fields(val,name))];});
}
async function launchRecipient(config,mode){
 const role=config.expectedTerms.role,child=spawn(process.execPath,[fileURLToPath(new URL('../src/private-recipient-process.mjs',import.meta.url))],{stdio:['pipe','pipe','pipe','pipe','pipe']});
 let pending='',stderr='',counter=0;const seen=[],waiters=[];
 const ended=new Promise(resolve=>child.once('close',(code,signal)=>{for(const w of waiters){clearTimeout(w.timer);w.reject(new Error('RECIPIENT_PROCESS_EXIT'));}waiters.length=0;resolve({code,signal});}));
 child.stderr.on('data',b=>{stderr+=b;if(stderr.length>4096)child.kill('SIGTERM');});
 child.stdout.setEncoding('utf8');child.stdout.on('data',chunk=>{pending+=chunk;const lines=pending.split('\n');pending=lines.pop();for(const line of lines){const message=JSON.parse(line);seen.push(message);const i=waiters.findIndex(w=>w.matches(message));if(i>=0){const[w]=waiters.splice(i,1);clearTimeout(w.timer);w.resolve(message);}}});
 const wait=matches=>{const old=seen.find(matches);if(old)return Promise.resolve(old);return new Promise((resolve,reject)=>{const w={matches,resolve,reject,timer:setTimeout(()=>{const i=waiters.indexOf(w);if(i>=0)waiters.splice(i,1);reject(new Error('RECIPIENT_PROCESS_TIMEOUT'));},15000)};waiters.push(w);});};
 const worker={child,ended,authorizations:0};workers.push(worker);
 record.recipientTranscripts[role].push({phase:mode,channel:'bootstrap',inputFields:fields({...config,mode}),classification:'FIELD_INVENTORY_ONLY_PASSWORD_AND_VALUES_EXCLUDED'});
 child.stdio[3].end(JSON.stringify({mode,...config}));
 const ready=await wait(m=>m.event==='ready'||m.event==='startupRejected');assert.equal(ready.event,'ready');worker.ready=ready;
 record.recipientTranscripts[role].push({phase:mode,event:ready.event,responseFields:fields(ready)});
 worker.request=async(operation,input=null,channel='owner')=>{const id='request_'+(++counter),response=wait(m=>m.id===id);(channel==='operator'?child.stdio[4]:child.stdin).write(JSON.stringify({id,operation,input})+'\n');const reply=await response;assert.equal(stderr,'');record.recipientTranscripts[role].push({phase:mode,channel,operation,inputFields:fields(input),responseFields:fields(reply),ok:reply.ok,...(!reply.ok?{code:reply.code}:{})});if(operation==='authorizeWithdrawal'&&reply.ok)worker.authorizations++;return reply;};
 return worker;
}
async function expectRole(worker,operation,input=null,channel='owner'){const r=await worker.request(operation,input,channel);assert.equal(r.ok,true,r.code??operation);return r.value;}
try{
 record.sourceHashes={};
 const files=['contracts/PrivateCurrentNativeNotePool.sol','src/private-finality-authority.mjs','src/private-finality-runtime.mjs','scripts/integration-private-recipient-native.mjs','src/private-recipient-graph.mjs','src/private-recipient-custody.mjs','src/private-recipient-process.mjs','src/vault.mjs','src/privacy.mjs','src/private-native-certificate.mjs','src/private-note-encoding.mjs','src/private-note-tree.mjs','src/chains/native-runtime.mjs','src/chains/solana-runtime.mjs','src/chains/runtime-harness.mjs','src/chains/linux-runtime-pins.mjs','experiments/private-core-proof/native-notes/prover.mjs','experiments/private-core-proof/native-notes/fixtures.mjs','experiments/private-core-proof/native-notes/public-artifacts.mjs'];
 for(const file of files){const bytes=await readFile(join(projectRoot,file));record.sourceHashes[file]=sha256(bytes).toString('hex');const dest=join(projectRoot,'evidence/m17-source-at-run',runId,file);await mkdir(join(dest,'..'),{recursive:true});await writeFile(dest,bytes);}
 record.reusedCircuits={};for(const mode of modes){const entry={};for(const [kind,source]of [['verifier.sol',`.local/prepared/${mode}.sol`],['verification-key.bin',`.local/prepared/${mode}.vk`],['compiled.json',`.local/compiled/${mode}.json`]]){const b=await readFile(join(noteExperiment,source)),dest=join(projectRoot,'evidence/m17-source-at-run',runId,'reused-circuits',mode,kind);await mkdir(join(dest,'..'),{recursive:true});await writeFile(dest,b);entry[kind]={bytes:b.length,sha256:sha256(b).toString('hex')};}record.reusedCircuits[mode]=entry;}
 prover=await createNoteProver({saveArtifacts:false});
 runtime=await createOwnedNativeRuntime(s=>console.log(s));solana=await createOwnedSolanaRuntime(s=>console.log(s));clock=await runtime.time();
 record.runtimes={evmBitcoin:runtime.metadata,solana:solana.metadata};await save();
 issuer=createDisposableNativeIssuerLifetime({lifetimeId:randomBytes(32).toString('hex'),identityNamespace:randomBytes(32).toString('hex'),mode:'DISPOSABLE_LOCAL_ONLY_NO_RESTART'});
 const localPackages=new Map(),dispatchCounts={SOL:0,BTC:0},signedRecords=[],certificateRecords=[];
 const snapshot=async()=>{const s=await pool.snapshot();return{...s,block:s.blockNumber,timestamp:Number(s.blockTimestamp),sequence:Number(s.stateSequence),spent:s.nullifiers};};
 const authorize=async(request,policy)=>{const p=localPackages.get(request.localInstructionCommitment);assert.ok(p,'REQUIRED_PRIVATE_READINESS_PACKAGE');assert.equal(p.chain,policy.chainDomain.chain);const state=await snapshot(),publicInputs=p.proof.publicInputs;const readHash=(o)=>noteWordsToHash(publicInputs.slice(o,o+8));assert.equal(readHash(0),pool.scope);assert.equal(readHash(8),pool.policy);assert.equal(BigInt(publicInputs[16]),BigInt(Math.floor(state.timestamp/600)));assert.equal(await pool.call('acceptedRoots(bytes32)',[readHash(17)],state.block),'0x'+'0'.repeat(63)+'1');assert.equal(readHash(25),state.spentDigest);assert.equal(Number(BigInt(publicInputs[33])),state.spentCount);let offset=34;if(p.chain==='BTC'){assert.equal(readHash(34),state.solEffectDigest);assert.equal(Number(BigInt(publicInputs[42])),state.solEffectCount);offset=43;}assert.equal(readHash(offset),pref(p.local.commitment));assert.equal(readHash(offset+8),pref(p.local.nonce));assert.equal(readHash(offset+16),pref(p.local.source));assert.equal(readHash(offset+24),pref(p.local.recipient));assert.equal(BigInt(publicInputs[offset+32]),p.local.amount);assert.equal(BigInt(publicInputs[offset+33]),p.local.executeAfter);assert.equal(BigInt(publicInputs[offset+34]),p.local.executeBefore);assert.equal(BigInt(publicInputs[offset+35]),p.local.validFrom);assert.equal(BigInt(publicInputs[offset+36]),p.local.validUntil);assert.equal(readHash(offset+37),pref(p.local.payout));assert.equal(request.localInstructionCommitment,p.local.commitment.toString('hex'));assert.equal(request.invocationNonce,p.local.nonce.toString('hex'));assert.equal(request.amount,p.local.amount.toString());for(const[a,b]of[['executeAfter','executeAfter'],['executeBefore','executeBefore'],['validFromEpoch','validFrom'],['validUntilEpoch','validUntil']])assert.equal(request[a],p.local[b].toString());if(p.chain==='SOL'){assert.equal(pref(base58Decode(request.source,32)),pref(p.local.source));assert.equal(pref(base58Decode(request.recipient,32)),pref(p.local.recipient));}else{assert.equal(request.source,'00'.repeat(32));const info=await runtime.btc('getaddressinfo',[request.recipient],'m9-recipient');assert.equal(pref(sha256(Buffer.from(info.scriptPubKey,'hex'))),pref(p.local.recipient));}assert.equal(pref(localCommitment(raw(pool.scope),raw(pool.policy),p.local)),pref(p.local.commitment));assert.equal(await pool.verify(p.chain==='SOL'?'sol_ready':'btc_ready',p.proof.proof,publicInputs,state.block),true);await assertPrivateSnapshotCanonical(runtime,state);const role=p.chain.toLowerCase();const ack=await expectRole(roleWorkers[role],'assertNativeExposureAcknowledged',{terms:roleTerms[role],paymentCommitment:p.local.payout.toString('hex'),localCommitment:p.local.commitment.toString('hex')});assert.equal(ack.acknowledged,true);dispatchCounts[p.chain]++;record.readinessChecks??=[];record.readinessChecks.push({chain:p.chain,block:state.block,blockHash:state.blockHash,sequence:state.sequence,proofSHA256:sha256(p.proof.proof).toString('hex'),classification:'REAL_DEPLOYED_ZK_READINESS_CURRENT_AUTHORITY_AND_RECIPIENT_ACK_BEFORE_NATIVE_SIGNING'});await save();};
 const common={policyFamilyId:sha256(Buffer.from('PC15/notes/immutable-observation-only/1')).toString('hex'),epochSeconds:600,authorizeLocalInvocation:authorize,retainSignedDispatch:async(request,signed,policy)=>{const item={request,signed,policy};signedRecords.push(item);await writeFile(join(local,'signed-dispatch-'+signedRecords.length+'.json'),JSON.stringify(item,null,2));},archiveCertificate:async(envelope,policy)=>{certificateRecords.push({envelope,policy});await writeFile(join(local,'certificate-'+certificateRecords.length+'.json'),JSON.stringify({envelope,policy},null,2));},nowSeconds:()=>clock};
 let foreignAvailable=true,blockedForeignReads=0;const outage=()=>{if(!foreignAvailable){blockedForeignReads++;throw new Error('INJECTED_FOREIGN_OBSERVATION_UNAVAILABLE');}};
 const solAdapter={genesis:solana.genesis,solver:solana.solver,recipient:solana.recipient,transfer:(...args)=>solana.transfer(...args),observe:(...args)=>{outage();return solana.observe(...args);},balance:(...args)=>{outage();return solana.balance(...args);}};const btcAdapter={btc:(...args)=>{outage();return runtime.btc(...args);}};
 const solBridge=issuer.bind({...common,chain:'SOL',genesis:base58Decode(solana.genesis,32).toString('hex'),minimumConfirmations:1,runtime:solAdapter}),btcBridge=issuer.bind({...common,chain:'BTC',genesis:runtime.metadata.bitcoinGenesis,minimumConfirmations:6,runtime:btcAdapter});
 const bridgePolicy=c=>{const p=c.policy;return{policyId:p.policyId,identityNamespace:p.identityNamespace,genesis:p.chainDomain.genesis,x:p.issuerPublicKey.x,y:p.issuerPublicKey.y};};
 const policy={sol:bridgePolicy(solBridge),btc:bridgePolicy(btcBridge),minimumBtcConfirmations:6};record.issuerPolicies={sol:solBridge.policy,btc:btcBridge.policy};
 const sources={};for(const mode of modes)sources[mode]=await readFile(join(noteExperiment,'.local/prepared/'+mode+'.sol'),'utf8');pool=await deployPrivateCurrentNativePool(runtime,{sources,solAuthority:runtime.accounts[2],btcAuthority:runtime.accounts[0],policy:pref(policyCommitment(policy)),deploymentDomain:randomBytes(32).toString('hex').replace(/^/,'0x'),onDeployment:async d=>{record.deployments.push(d);await save();}});record.pool={address:pool.address,scope:pool.scope,policy:pool.policy,verifiers:pool.verifiers,solAuthority:runtime.accounts[2],btcAuthority:runtime.accounts[0],finalityProfile:FINALITY_PROFILE_NAME,maxLeaseSeconds:30};await writeFile(join(local,'compiled-solidity.json'),JSON.stringify(pool.compilation.output));
 // Explicit local-only clock control keeps test transitions deterministic. It
 // does not establish liveness through a real600s wall-clock inclusion window.
 clock=(Math.floor((await runtime.time())/600)+1)*600+10;await runtime.evm('evm_setNextBlockTimestamp',[clock]);await runtime.evm('evm_mine');
 const submit=async(label,mode,proof,{value=0n,expectedStatus='0x1',expectedRevert,inputs=proof.publicInputs,bytes=proof.proof,at}={})=>{clock=at??clock+1;await runtime.evm('evm_setNextBlockTimestamp',[clock]);const receipt=await pool.send(label,{to:pool.address,data:pool.proofData(mode,bytes,inputs),value:'0x'+BigInt(value).toString(16)},expectedStatus,expectedRevert);const b=await runtime.evm('eth_getBlockByHash',[receipt.blockHash,false]);assert.equal(Number(BigInt(b.timestamp)),clock);await save();return receipt;};
 const prove=async(mode,input,label)=>{record.phase='proving-'+label;await save();const proof=await prover.prove(mode,input,label);savePublicNoteProofArtifacts(join(projectRoot,'evidence/m17-proof',runId,label),proof);record.proofs.push(proof.metrics);console.log(JSON.stringify({phase:label,...proof.metrics}));await save();return proof;};
 const submitAuthority=async(label,from,method,args)=>{clock++;await runtime.evm('evm_setNextBlockTimestamp',[clock]);const receipt=await pool.send(label,{from,to:pool.address,data:pool.data(method,args)});await save();return receipt;};
 const authorityCommon={pool,chainId:runtime.metadata.chainId,nowSeconds:()=>clock,submitAuthority,archive:async entry=>{(record.authorityRecords??=[]).push(entry);await save();}};
 const solAuthority=createCurrentFinalityAuthority({...authorityCommon,chain:'SOL',bridge:solBridge,account:runtime.accounts[2]}),btcAuthority=createCurrentFinalityAuthority({...authorityCommon,chain:'BTC',bridge:btcBridge,account:runtime.accounts[0]});
 const tree=new PrivateNoteTree(),btcAddress=await runtime.btc('getnewaddress',['','bech32'],'m9-recipient'),btcInfo=await runtime.btc('getaddressinfo',[btcAddress],'m9-recipient');
 const stateMatches=async()=>{const s=await snapshot();assert.equal(s.root,tree.root);assert.equal(s.leafCount,tree.leafCount);assert.equal(s.spentDigest,privateSpentDigest(pool.scope,s.spent,s.spentCount));assert.equal(s.solEffectDigest,privateEffectDigest('SOL',pool.scope,s.solEffects,s.solEffectCount));assert.equal(s.btcEffectDigest,privateEffectDigest('BTC',pool.scope,s.btcEffects,s.btcEffectCount));return s;};
 const prepareReadiness=async(g,c,index,solCert)=>{const s=await stateMatches(),input=readinessInput(g,c,Math.floor(clock/600),tree,{index,spent:s.spent.slice(0,s.spentCount),solEffects:s.solEffects.slice(0,s.solEffectCount),solCertificate:solCert}),proof=await prove(c+'_ready',input,`${c}-ready-${index}`),l=g[c];const local={...l};delete local.invoiceSignature;const p={chain:c.toUpperCase(),local,proof};localPackages.set(l.commitment.toString('hex'),p);record.rolePayloads??=[];record.rolePayloads.push({chain:p.chain,localCommitment:l.commitment.toString('hex'),fields:['scope','policy','shared historical membership root','current note spent digest/count',...(c==='btc'?['current SOL effect digest/count']:[]),'common epoch','own local commitment','own invocation nonce','own source','own recipient','own amount','own execution interval','own validity interval','own payout commitment'],excluded:['graph commitment','stable owner key','reservation nullifier','admission tag','origin seed','sibling raw descriptor','sibling receipt','sibling private key'],proofBytes:proof.proof.length,classification:'COMMON_OPERATOR_ALLOWLISTED_ROLE_PROJECTION_NOT_INDEPENDENT_HOST_ISOLATION'});return{proof,input};};
 const requestFor=(g,c)=>{const l=g[c];return{localInstructionCommitment:l.commitment.toString('hex'),invocationNonce:l.nonce.toString('hex'),source:c==='sol'?solana.solver:'00'.repeat(32),recipient:c==='sol'?solana.recipient:btcAddress,amount:l.amount.toString(),executeAfter:l.executeAfter.toString(),executeBefore:l.executeBefore.toString(),validFromEpoch:l.validFrom.toString(),validUntilEpoch:l.validUntil.toString()};};
 const epoch=BigInt(Math.floor(clock/600));
 const plan=createRecipientGraphPlan({scope:raw(pool.scope),policy,epoch,sourceSol:base58Decode(solana.solver,32),recipientSol:base58Decode(solana.recipient,32),recipientBtc:sha256(Buffer.from(btcInfo.scriptPubKey,'hex')),claimEpoch:epoch+12n});
 const roleConfigs={},invoices={};record.recipientPublicIdentities={};
 for(const[role,recipient]of[['sol',runtime.accounts[3]],['btc',runtime.accounts[4]]]){
  const terms=plan.terms(role);roleTerms[role]=terms;
  const config={path:join(local,role+'.vault'),password:'synthetic-'+randomBytes(32).toString('hex'),expectedTerms:terms,withdrawalRecipient:recipient.slice(2)};roleConfigs[role]=config;
  const worker=await launchRecipient(config,'create');roleWorkers[role]=worker;
  assert.equal((await worker.request('invoice',terms)).code,'RECIPIENT_ACK_REQUIRED');
  const {termsDigest,value,paymentCommitment,localCommitment}=worker.ready.review;
  assert.equal((await worker.request('acknowledgeCompensation',{termsDigest,value,paymentCommitment,localCommitment})).code,'RECIPIENT_OPERATION_DENIED');
  for(const operation of ['sign','exportKey','getPrivateKey','updateWithdrawalRecipient'])assert.equal((await worker.request(operation,{})).code,'RECIPIENT_OPERATION_DENIED');
  await expectRole(worker,'acknowledgeCompensation',{termsDigest,value,paymentCommitment,localCommitment},'operator');
  invoices[role]=await expectRole(worker,'invoice',terms);importRecipientInvoice(terms,invoices[role]);
  const changedValue={...terms,value:(BigInt(terms.value)+1n).toString()},changedDescriptor={...terms,descriptor:{...terms.descriptor,amount:(BigInt(terms.descriptor.amount)+1n).toString()}};
  for(const changed of [changedValue,changedDescriptor])assert.equal((await worker.request('invoice',changed)).code,'RECIPIENT_TERMS_MISMATCH');
  record.recipientPublicIdentities[role]={originalPid:worker.child.pid,publicKey:{x:invoices[role].note.x,y:invoices[role].note.y},paymentCommitment,localCommitment,withdrawalRecipient:recipient,compensation:value,vaultMode:(await stat(config.path)).mode&0o777,bootstrapFields:['mode','path','password','expectedTerms','withdrawalRecipient'],ownTermsFields:Object.keys(terms),ownDescriptorFields:Object.keys(terms.descriptor)};
 }
 assert.throws(()=>plan.assemble({sol:invoices.btc,btc:invoices.sol}));
 check('cross-role invoices cannot assemble the owner graph',true);
 const g=plan.assemble(invoices);assert.equal(g.solNote.privateKey,undefined);assert.equal(g.btcNote.privateKey,undefined);
 for(const role of ['sol','btc']){
  const ownWire=JSON.stringify({terms:roleTerms[role],invoice:invoices[role]}),sibling=role==='sol'?'btc':'sol';
  for(const excluded of [g.originSeed,g.graphSalt,g.commitment,g.reserved,g.nullifier,g[sibling].recipient,g[sibling].nonce])assert.equal(ownWire.includes(excluded.toString('hex')),false);
  const ciphertext=await readFile(roleConfigs[role].path,'utf8');for(const secret of ['PRIVATE KEY',invoices[role].note.secret,roleConfigs[role].password])assert.equal(ciphertext.includes(secret),false);
 }
 check('actual recipient keys created only in own role processes; owner imports openings and signatures',true);
 const fund=await prove('reserve',reserveInput(g,epoch),'fund-recipient-owned');
 await submit('actual recipient-invoice funded reservation','reserve',fund,{value:g.budget});tree.append(g.reserved);await stateMatches();
 assert.equal(await runtime.balance(pool.address),g.budget);
 await prepareReadiness(g,'sol',0);const sd=await solBridge.dispatch(requestFor(g,'sol')),sc=await solBridge.observeAndCertify(sd.handle);
 assert.equal(verifyNativeCertificate(sc,solBridge.policy,{settlementEpoch:Math.floor(clock/600)}),true);
 await prepareReadiness(g,'btc',0,sc);const bd=await btcBridge.dispatch(requestFor(g,'btc'));await runtime.btc('generatetoaddress',[6,runtime.miningAddress]);const bc=await btcBridge.observeAndCertify(bd.handle);
 assert.equal(verifyNativeCertificate(bc,btcBridge.policy,{settlementEpoch:Math.floor(clock/600)}),true);
 assert.equal(BigInt(bc.certificate.amount),BigInt(sc.certificate.amount)*g.numerator/g.denominator);
 record.nativeDelivery={sol:{nativeReceipt:sd.nativeReceipt,certificate:sc},btc:{nativeReceipt:bd.nativeReceipt,certificate:bc},classification:'INTENTIONAL_SYNTHETIC_AUDIT_MAPPING_ACTUAL_NATIVE_FINALIZED_SOL_AND_SIX_CONFIRMATION_BTC'};
 const full=await prove('fulfill',fulfillInput(g,Math.floor(clock/600),tree,sc,bc),'fulfill-recipient-owned');
 await submit('real global proof still requires PC16 current permits','fulfill',full,{expectedStatus:'0x0',expectedRevert:'FINALITY_NOT_CURRENT'});
 solAuthority.remember(sd.handle,sc);btcAuthority.remember(bd.handle,bc);
 record.permits={sol:await solAuthority.observeAndPermit(sd.handle,full),btc:await btcAuthority.observeAndPermit(bd.handle,full)};
 const settlement=await submit('current permits and global proof issue real recipient payout notes','fulfill',full);
 tree.append(g.solNote.commitment);tree.append(g.btcNote.commitment);
 const beforeRestart=await stateMatches();assert.equal(beforeRestart.liveOutputNotes,2);assert.equal(beforeRestart.liveReservations,0);
 record.interruption={point:'AFTER_REAL_PAYOUT_ISSUANCE_BEFORE_ANY_WITHDRAWAL_AUTHORIZATION',pool:pool.address,scope:pool.scope,policy:pool.policy,settlementTransaction:settlement.transactionHash,before:beforeRestart};
 for(const role of ['sol','btc']){
  const worker=roleWorkers[role];assert.equal(worker.authorizations,0);
  worker.child.kill('SIGTERM');const ended=await worker.ended;assert.equal(ended.signal,'SIGTERM');
  record.recipientPublicIdentities[role].terminated=ended;
 }
 // Pool, Anvil, Core, Solana, issuer lifetime and finality authorities all remain
 // running. No snapshot/revert, redeploy, new authority or synthetic tree reset.
 await runtime.evm('evm_setNextBlockTimestamp',[++clock]);await runtime.evm('evm_mine');
 for(const role of ['sol','btc']){
  const worker=await launchRecipient(roleConfigs[role],'recover');roleWorkers[role]=worker;
  const recovered=await expectRole(worker,'invoice',roleTerms[role]);assert.deepEqual(recovered,invoices[role]);
  assert.notEqual(worker.child.pid,record.recipientPublicIdentities[role].originalPid);
  record.recipientPublicIdentities[role].recoveredPid=worker.child.pid;
  record.recipientPublicIdentities[role].identicalRecoveredOpeningKeyAndInvoice=true;
 }
 const afterRestart=await stateMatches();for(const field of ['root','spentDigest','leafCount','spentCount','liveReservations','liveOutputNotes','solEffectCount','btcEffectCount'])assert.equal(afterRestart[field],beforeRestart[field]);
 assert.equal(await runtime.evm('eth_chainId'),'0x7a69');
 assert.equal((await runtime.evm('eth_getBlockByNumber',['0x0',false])).hash,runtime.metadata.evmGenesis);
 assert.equal(await pool.call('scope()'),pool.scope);assert.equal(await pool.call('policy()'),pool.policy);
 record.interruption.after=afterRestart;record.interruption.sameAuthorityVerified=true;record.interruption.nodesAndIssuerRestarted=false;
 record.withdrawals=[];
 for(const role of ['sol','btc']){
  const discovery=await discoverRecipientWithdrawal({pool,runtime,terms:roleTerms[role],invoice:invoices[role],recipient:roleConfigs[role].withdrawalRecipient});
  const worker=roleWorkers[role],sibling=role==='sol'?'btc':'sol';
  for(const request of [{...discovery.request,recipient:runtime.accounts[1].slice(2)},{...discovery.request,amount:'1'},{...discovery.request,paymentCommitment:invoices[sibling].paymentCommitment}])assert.equal((await worker.request('authorizeWithdrawal',request)).code,'RECIPIENT_WITHDRAWAL_MISMATCH');
  const authorization=await expectRole(worker,'authorizeWithdrawal',discovery.request);
  const proof=await prove('withdraw',recipientWithdrawalInput(roleTerms[role],invoices[role],authorization,discovery.path),'withdraw-recovered-'+role);
  // Re-read authority immediately before transfer; proof membership can be a
  // still-accepted historical root, while current epoch/unspentness must hold.
  const current=await discoverRecipientWithdrawal({pool,runtime,terms:roleTerms[role],invoice:invoices[role],recipient:roleConfigs[role].withdrawalRecipient});
  assert.equal(current.request.epoch,authorization.epoch);
  const recipient='0x'+authorization.recipient,before=await runtime.balance(recipient);
  const redirected=[...proof.publicInputs];redirected[34]='0x'+(BigInt(redirected[34])^1n).toString(16).padStart(64,'0');
  await submit('recovered '+role+' withdrawal cannot redirect recipient','withdraw',proof,{inputs:redirected,expectedStatus:'0x0'});
  const receipt=await submit('recovered '+role+' signs exact bound payout withdrawal','withdraw',proof);
  assert.equal(await runtime.balance(recipient)-before,BigInt(authorization.amount));
  await submit('recovered '+role+' payout cannot withdraw twice','withdraw',proof,{expectedStatus:'0x0',expectedRevert:'NOTE_ALREADY_SPENT'});
  await assert.rejects(discoverRecipientWithdrawal({pool,runtime,terms:roleTerms[role],invoice:invoices[role],recipient:roleConfigs[role].withdrawalRecipient}),/RECIPIENT_PAYMENT_ALREADY_SPENT/);
  record.withdrawals.push({role,recipient,amount:authorization.amount,authority:discovery.authority,preSubmitAuthority:current.authority,receipt,exactBalanceDelta:authorization.amount,authorizationObtainedOnlyAfterRestart:true});
 }
 check('both recovered recipients withdraw exact full payout values from same surviving pool',await runtime.balance(pool.address)===0n);
 record.finalState=await stateMatches();assert.equal(record.finalState.leafCount,3);assert.equal(record.finalState.spentCount,3);assert.equal(record.finalState.liveReservations,0);assert.equal(record.finalState.liveOutputNotes,0);
 record.dispatchCounts=dispatchCounts;record.fundedWei=g.budget.toString();record.withdrawnWei=record.withdrawals.reduce((n,x)=>n+BigInt(x.amount),0n).toString();assert.equal(record.withdrawnWei,record.fundedWei);
 // Values intentionally private even though openings were sent through owner
 // IPC stay absent from this public evidence. Raw request/response payloads and
 // plaintext circuit witness/input objects are never archived.
 for(const secret of [g.originSeed,g.graphSalt,g.reserveSecret,g.recovery.secret,g.solNote.secret,g.btcNote.secret])assert.equal(JSON.stringify(record).includes(secret.toString('hex')),false);
 record.artifactPrivacy={privateWitnessInputsSaved:false,privateSigningKeysSaved:false,rawRecipientIPCArchived:false,allowlistedFieldInventoryOnly:true};
 record.phase='completed';record.classification='ACTUAL_FUNDED_PC16_NATIVE_RECIPIENT_PROCESS_RECOVERY_AND_WITHDRAWAL';record.completedAt=new Date().toISOString();
 record.provingWindowAssessment={epochSeconds:600,leaseSeconds:30,maxMeasuredProofMs:Math.max(...record.proofs.map(p=>p.provingMs+p.witnessMs+p.verificationMs)),realTimeInclusionAdequacyProven:false,reason:'Authorities reobserve after proving; local EVM timestamps controlled. No real-world 30-second inclusion/liveness claim.'};
}catch(e){const phase=record.phase;record.phase='failed';record.failure={phase,code:e.code??e.name,message:'Integration assertion or operation failed; value-bearing diagnostics omitted from public evidence'};process.exitCode=1;console.error('PC17 failure',phase,e.code??e.name);}
finally{for(const worker of workers){if(worker.child.exitCode===null&&worker.child.signalCode===null){try{await expectRole(worker,'shutdown');await worker.ended;}catch{worker.child.kill('SIGTERM');await worker.ended;}}}record.recipientProcessesStopped=workers.every(w=>w.child.exitCode!==null||w.child.signalCode!==null);for(const role of ['sol','btc'])await rm(join(local,role+'.vault'),{force:true});record.disposableEncryptedRecipientVaultsRemoved=true;if(pool){record.transactions=pool.receipts;record.compilation={settings:pool.compilation.settings,milliseconds:pool.compilation.milliseconds,sources:pool.compilation.sources};}if(issuer)issuer.close();if(solana){try{record.solanaCleanup=await solana.close();}catch(e){record.solanaCleanupError=e.code??e.name;process.exitCode=1;}}if(runtime){try{await runtime.close();record.nativeRuntimesStopped=true;}catch(e){record.runtimeCleanupError=e.code??e.name;process.exitCode=1;}}if(prover)await prover.close();record.resourceUsage=process.resourceUsage();if(record.phase==='completed'&&(!record.recipientProcessesStopped||!record.nativeRuntimesStopped||record.solanaCleanupError||record.runtimeCleanupError)){record.phase='failed-cleanup';process.exitCode=1;}await save();if(record.phase==='completed')await copyFile(path,join(projectRoot,'evidence/m17-recipient-native.json'));}
console.log(JSON.stringify({phase:record.phase,evidence:path,proofs:record.proofs.length,checks:record.checks.length,fullAcceptance:false}));
