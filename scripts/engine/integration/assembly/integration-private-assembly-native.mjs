/** PC18 actual owned-local owner-offline schedules. PREPARATION ONLY until an
 * explicit post-capability native run is authorized. No top-level side effects.
 * All funding and keys are disposable local test assets. Same trusted OS and
 * controller/bootstrap, native signer/issuer/current-authority services survive.
 * Recovery issuance is demonstrated; its owner-held key is never distributed.
 */
import assert from 'node:assert/strict';
import { randomBytes, createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { readFile, writeFile, mkdir, readdir, rm } from 'node:fs/promises';
import { readFileSync, statfsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createOwnedNativeRuntime } from '../../../../packages/engine/src/chains/shared/native-runtime.mjs';
import { createOwnedSolanaRuntime, base58Decode } from '../../../../packages/engine/src/chains/solana/solana-runtime.mjs';
import { projectRoot } from '../../../../packages/engine/src/chains/shared/runtime-harness.mjs';
import { createDisposableNativeIssuerLifetime, effectConsumptionHash } from '../../../../packages/engine/src/notes/private-native-certificate.mjs';
import { createCurrentFinalityAuthority, FINALITY_PROFILE_NAME } from '../../../../packages/engine/src/finality/private-finality-authority.mjs';
import { deployPrivateAssemblyNativePool } from '../../../../packages/engine/src/assembly/private-assembly-runtime.mjs';
import { captureAssemblyEvmReceipt } from '../../../../packages/engine/src/assembly/private-assembly-evm-audit.mjs';
import { createAssemblyFrameDecoder, encodeAssemblyFrame, validateAssemblyProofPackage, assemblyPackageDigest } from '../../../../packages/engine/src/assembly/private-assembly-actors.mjs';
import { launchAssemblyProcess } from '@lianum/proofs/execution/assembly-workers';
import { createAssemblyNativeDispatch, assemblyFieldInventory, assemblyEvmProof, assemblyProofDigest } from '../../../../packages/engine/src/assembly/private-assembly-native-dispatch.mjs';
import { policyCommitment } from '../../../../packages/engine/src/notes/private-note-encoding.mjs';
import { PrivateNoteTree, noteWordsToHash, PRIVATE_POOL_INPUT_WORDS } from '../../../../packages/engine/src/notes/private-note-tree.mjs';
import { discoverRecipientWithdrawal } from '../../../../packages/engine/src/recipients/private-recipient-graph.mjs';
import { importRecipientInvoice, recipientWithdrawalInput } from '../../../../packages/engine/src/recipients/private-recipient-custody.mjs';

import { sideEndpoint, startRecipient, proveRecipientWithdrawal, completeAssemblyPaidPayment } from '../../../../packages/backend/src/payments/private-payment-engine.mjs';

const stamp = () => process.hrtime.bigint().toString();
const sha = value => createHash('sha256').update(value).digest('hex');
const pref = value => `0x${Buffer.from(value).toString('hex')}`;
// Revision4 source/profile is prepared. The composite gate and final source
// must be reviewed before deliberately clearing this guard. No native run is
// authorized merely by a capability success or by constructing this source.
const NATIVE_SCHEMA_REPAIR_REQUIRED = true;

/** Bounded scheduling only: timeout-only is a fresh C reservation, never a
 * continuation or replay of a cleaned prior deployment. Protocol logic stays shared. */
export function assemblyNativeScenarioProfile(name = 'full') {
  assert.ok(['full', 'timeout-only', 'paid-control'].includes(name), 'PC18_NATIVE_SCENARIO_PROFILE');
  return Object.freeze({ name, runSuccessSchedules: name === 'full', runTimeoutSchedule: name !== 'paid-control', runPaidControlSchedule: name === 'paid-control', completedEffectPairs: name === 'full' ? 2 : name === 'paid-control' ? 1 : 0, requestedSchedules: Object.freeze(name === 'full' ? ['A', 'B', 'C'] : name === 'paid-control' ? ['A'] : ['C']) });
}
const requireRun = options => { assert.equal(options?.authorizedNativeRun, true, 'PC18_EXPLICIT_POST_CAPABILITY_NATIVE_GO_REQUIRED'); assert.equal(options?.refundIssuanceOnly, true, 'PC18_RECOVERY_ISSUANCE_ONLY_APPROVAL_REQUIRED'); assert.equal(NATIVE_SCHEMA_REPAIR_REQUIRED, false, 'PC18_REVISION4_REPAIR_REQUIRED_BEFORE_NATIVE_RUN'); };
const safeCode = error => /^[A-Z][A-Z0-9_]{1,100}$/.test(error?.code ?? '') ? error.code : /^[A-Z][A-Z0-9_]{1,100}$/.test(error?.message ?? '') ? error.message : 'PC18_ASSERTION_OR_OPERATION_FAILED';
const receiptSummary = receipt => ({ transactionHash: receipt.transactionHash, blockHash: receipt.blockHash, blockNumber: receipt.blockNumber, status: receipt.status, gasUsed: receipt.gasUsed, ...(receipt.contractAddress ? { contractAddress: receipt.contractAddress } : {}) });
function resourceSnapshot() { const s = statfsSync(projectRoot); return { availableRAM: Number(/MemAvailable:\s+(\d+)/.exec(readFileSync('/proc/meminfo', 'utf8'))[1]) * 1024, freeDisk: s.bavail * s.bsize, controllerRSS: process.memoryUsage().rss }; }
function resourceGuard() { const r = resourceSnapshot(); assert.ok(r.availableRAM >= 3 * 1024 ** 3, 'PC18_AVAILABLE_RAM_FLOOR'); assert.ok(r.freeDisk >= 5 * 1024 ** 3, 'PC18_DISK_FLOOR'); return r; }

async function snapshotSources(directory) {
  const files = ['src/private-payment-engine.mjs','src/private-payment-worker.mjs','scripts/integration-private-assembly-native.mjs', 'src/private-assembly-native-dispatch.mjs','src/private-assembly-evm-audit.mjs', 'src/private-assembly-actors.mjs', 'src/private-assembly-owner-process.mjs', 'src/private-assembly-actor-process.mjs', 'src/private-assembly-encoding.mjs', 'src/private-assembly-history.mjs', 'src/private-assembly-revocations.mjs', 'src/private-assembly-runtime.mjs', 'contracts/PrivateAssemblyNativeNotePool.sol', 'src/private-finality-authority.mjs', 'src/private-finality-runtime.mjs', 'src/private-native-certificate.mjs', 'src/private-note-encoding.mjs', 'src/private-note-tree.mjs', 'src/private-recipient-graph.mjs', 'src/private-recipient-custody.mjs', 'src/private-recipient-process.mjs', 'src/vault.mjs', 'src/privacy.mjs', 'src/chains/native-runtime.mjs', 'src/chains/solana-runtime.mjs', 'src/chains/runtime-harness.mjs', 'src/chains/linux-runtime-pins.mjs', 'src/native-bitcoin.mjs', 'experiments/private-core-proof/native-notes/prover.mjs', 'experiments/private-core-proof/owner-independent/prover.mjs', 'experiments/private-core-proof/owner-independent/prove-worker.mjs', 'experiments/private-core-proof/owner-independent/verify-worker.mjs', 'experiments/private-core-proof/owner-independent/note-prove-worker.mjs'];
  async function recurse(relative) { for (const entry of await readdir(join(projectRoot, relative), { withFileTypes: true })) { const file = join(relative, entry.name); if (entry.isDirectory()) await recurse(file); else if (/\.nr$/.test(file)) files.push(file); } }
  await recurse('experiments/private-core-proof/owner-independent/circuits');
  for (const mode of ['authorization','sol_local','btc_local','sol_join','sol_ready','btc_ready','fulfill','refund']) for (const extension of ['json']) files.push(`experiments/private-core-proof/owner-independent/.local/compiled/${mode}.${extension}`);
  for (const mode of ['authorization','sol_local','btc_local','sol_join','sol_ready','btc_ready','fulfill','refund']) for (const extension of ['vk','key.json',...(['authorization','sol_local','btc_local','sol_join'].includes(mode)?['fields.json']:['sol'])]) files.push(`experiments/private-core-proof/owner-independent/.local/prepared/${mode}.${extension}`);
  for (const mode of ['reserve','withdraw']) { files.push(`experiments/private-core-proof/native-notes/.local/compiled/${mode}.json`); for (const extension of ['vk','sol']) files.push(`experiments/private-core-proof/native-notes/.local/prepared/${mode}.${extension}`); }
  const hashes = {};
  for (const file of files) { const bytes = await readFile(join(projectRoot,file)); const path = join(directory, file); await mkdir(dirname(path), { recursive: true }); await writeFile(path, bytes); hashes[file] = { sha256: sha(bytes), bytes: bytes.length }; }
  return hashes;
}

export async function runAssemblyNativeIntegration(options = {}) {
  requireRun(options); // Must precede any file write, runtime or proof operation.
  const scenarioProfile = assemblyNativeScenarioProfile(options.scenarioProfile);
  assert.equal(typeof options.capabilityReportPath, 'string', 'PC18_CAPABILITY_REPORT_REQUIRED');
  const capabilityBytes = await readFile(options.capabilityReportPath), capability = JSON.parse(capabilityBytes);
  assert.equal(capability.phase, 'completed', 'PC18_GENUINE_CAPABILITY_NOT_COMPLETED');
  assert.equal(capability.classification,'GENUINE_REVOCATION_AWARE_V2_READINESS_CAPABILITY_NOT_NATIVE_OWNER_OFFLINE','PC18_V2_CAPABILITY_REQUIRED');
  assert.equal(capability.profile,'PC18_READINESS_V2_REVOCATION_COVERAGE');
  const oldRun=capability.reusedProofs?.[0]?.from;assert.match(oldRun,/^[0-9TZ-]+$/);
  const legacyBytes=await readFile(join(projectRoot,'evidence','m18-capability-'+oldRun+'.json')),legacy=JSON.parse(legacyBytes);
  assert.equal(sha(legacyBytes),capability.previousCapabilitySHA256,'PC18_FROZEN_CAPABILITY_HASH');
  assert.equal(legacy.phase,'completed');assert.equal(legacy.classification,'GENUINE_RECURSIVE_SYNTHETIC_CAPABILITY_NOT_FUNDED_OR_NATIVE_OWNER_OFFLINE');
  const staticModes=['authorization','sol_local','btc_local','sol_join','fulfill','refund'];
  const compositeProofs=staticModes.map(mode=>{const p=legacy.proofs.find(p=>p.mode===mode&&p.verified===true);assert.ok(p,'PC18_UNCHANGED_CAPABILITY_MODE_MISSING');return p;});
  for(const [mode,count,pages]of [['sol_ready',61,32768],['btc_ready',79,65536]]){const p=capability.proofs.find(p=>p.mode===mode&&p.verified===true);assert.ok(p,'PC18_V2_READINESS_MISSING');assert.equal(p.publicInputCount,count);assert.equal(p.maximumPages,pages);assert.ok(p.workerWallMilliseconds<600000);assert.ok(p.minimumObservedAvailableRAM>=3*1024**3);compositeProofs.push(p);}
  assert.ok(capability.pool?.verifiers&&capability.runtimeCleanup?.completed&&legacy.runtimeCleanup?.completed,'PC18_CAPABILITY_DEPLOYMENT_AND_CLEANUP_REQUIRED');
  assert.ok(capability.evmChecks.some(c=>c.mode==='btc_ready'&&c.oldV1RejectedByNewV2));
  for(const [sourceReport,folder]of [[capability,join(projectRoot,'evidence','m18-readiness-v2',capability.runId)],[legacy,join(projectRoot,'evidence','m18-capability',oldRun)]])for(const [name,expected]of Object.entries(sourceReport.artifacts)){assert.ok(!name.startsWith('/')&&!name.split('/').includes('..'));const bytes=await readFile(join(folder,name));assert.equal(bytes.length,expected.bytes);assert.equal(sha(bytes),expected.sha256,'PC18_CAPABILITY_ARTIFACT_HASH');}
  resourceGuard();
  const runId = new Date().toISOString().replace(/[:.]/g,'-'), local = join(projectRoot,'.local','pc18-native-'+runId), evidence = join(projectRoot,'evidence','m18-native-'+runId+'.json'), artifacts = join(projectRoot,'evidence','m18-native',runId), sourceDirectory = join(projectRoot,'evidence','m18-source-at-run',runId);
  await mkdir(local,{recursive:true}); await mkdir(artifacts,{recursive:true});
  const report = { classification:'IN_PROGRESS_ACTUAL_OWNER_OFFLINE_PC18', scenarioProfile:scenarioProfile.name, requestedSchedules:scenarioProfile.requestedSchedules, priorDeploymentStateReused:false, runId, startedAt:new Date().toISOString(),phase:'checking-source-at-run', realFunds:false,publicNetwork:false,fullAcceptance:false,commonTrustedOS:true,hostileHostIsolation:false,capabilityReportSHA256:sha(capabilityBytes),frozenStaticCapabilitySHA256:sha(legacyBytes),cases:{},proofOperations:[],checks:[],ipcInventory:[],nativeBoundaries:[],deployments:[],transactions:[],publicTerminalArtifacts:[],limitations:[
    'Exact S and K are preauthorized; no adaptive hidden strategy or general private program',
    'Controller/bootstrap and common OS can correlate; services are owner-independent availability boundaries, not adversarial isolation',
    'Surviving role bridges retain genuine WeakMap handles and issuer/native signing/current-authority services',
    'A/J/L/role packages are operational private data; only hashes and inventories are public here',
    'ObservedAt order is certified observation order; actual signing order additionally trusts bridge readiness checks and process chronology',
    'Case C issues only the original authorized recovery note; the stopped owner alone held its recovery key, so withdrawal is unavailable',
    'Native prefix can remain uncompensated after late failure; no zero-loss or full cash recovery guarantee',
    'Stale preflight preserves nonce for one public-state refresh; a later race inside immutable bridge authorization burns its one-use nonce and fails closed, potentially leaving timeout issuance as the remaining path',
    'Controlled local EVM timestamps do not establish real-world 600-second epoch or 30-second lease inclusion liveness',
    'PC16 reorg/adverse-state evidence is separate historical regression evidence, not repeated in this availability run',
  ] };
  const save = () => writeFile(evidence,JSON.stringify(report,null,2)+'\n');
  let runtime,solana,pool,issuer,clock,activeHeavy=false,aborted,foreignEnabled=true,foreignReads=0,blockedForeignReads=0,activeNative;
  const actors=[],recipients=[],ownedChildren=[],vaults=[],reservations=[];
  const checkpoint = async label => { report.phase=label; report.resources=resourceGuard(); if(aborted)throw aborted; await save(); };
  async function heavy(label, work) {
    assert.equal(activeHeavy,false,'PC18_ONE_HEAVY_ENGINE_ONLY'); activeHeavy=true; const begin=performance.now(),atNs=stamp();
    try { await checkpoint(label); const value=await work(); report.proofOperations.push({label,startedAtNs:atNs,completedAtNs:stamp(),milliseconds:performance.now()-begin,ok:true,classification:'GENUINE_ACTOR_BACKEND_OPERATION_NO_WITNESS_ARCHIVE'}); await save(); return value; }
    catch(error){report.proofOperations.push({label,startedAtNs:atNs,completedAtNs:stamp(),milliseconds:performance.now()-begin,ok:false,code:safeCode(error)});throw error;}finally{activeHeavy=false;}
  }
  const monitor=setInterval(()=>{try{resourceGuard();}catch(error){if(!aborted){aborted=error;for(const actor of actors)void actor.control.terminate();}}},1000);
  const privateAuditDirectory=join(local,'native-audit'),privateCertificatePaths=new Map();let privateAuditCount=0;
  async function privateAudit(label,item){await mkdir(privateAuditDirectory,{recursive:true,mode:0o700});const file=join(privateAuditDirectory,String(++privateAuditCount).padStart(4,'0')+'-'+label+'.json');await writeFile(file,JSON.stringify(item,(_,v)=>typeof v==='bigint'?v.toString():v,2)+'\n',{mode:0o600});if(item.kind==='native-certificate')privateCertificatePaths.set(label,file);return file;}
  let privateEvmReceiptCount=0;
  async function archiveNewEvmReceipts(){if(!pool)return;for(const entry of pool.receipts.slice(privateEvmReceiptCount)){await privateAudit('evm',await captureAssemblyEvmReceipt(runtime,entry));privateEvmReceiptCount++;}}
  const foreign=()=>{if(!foreignEnabled){blockedForeignReads++;throw Error('PC18_FOREIGN_ACCESS_DISABLED');}foreignReads++;};
  const check=(name,condition=true)=>{assert.ok(condition,name);report.checks.push(name);};
  try {
    report.sources=await snapshotSources(sourceDirectory);
    // Key/circuit hashes must match the completed capability family, rather than
    // silently deploying a subsequently rebuilt circuit family.
    for(const proof of compositeProofs){
      const key=JSON.parse(await readFile(join(projectRoot,'experiments/private-core-proof/owner-independent/.local/prepared',proof.mode+'.key.json'),'utf8'));
      assert.equal(key.keySHA256,proof.verificationKeySHA256,'PC18_CAPABILITY_KEY_CHANGED');assert.equal(key.circuitSHA256,proof.circuitSHA256,'PC18_CAPABILITY_CIRCUIT_CHANGED');assert.equal(sha(await readFile(join(projectRoot,'experiments/private-core-proof/owner-independent/circuits',proof.mode,'src/main.nr'))),proof.sourceSHA256,'PC18_CAPABILITY_SOURCE_CHANGED');
    }
    const {assemblyVerificationPins}=await import('../../../../packages/proofs/programs/owner-independent/prover.mjs');
    const pins=assemblyVerificationPins(); // File/hash reads only; no warm prover.
    await checkpoint('starting-owned-local-runtimes');runtime=await createOwnedNativeRuntime(()=>{});solana=await createOwnedSolanaRuntime(()=>{},{ledgerRetentionShreds:1_000_000,ticksPerSlot:64});
    await privateAudit('runtime-bootstrap',{kind:'private-runtime-metadata',evmBitcoin:runtime.metadata,solana:solana.metadata});
    report.runtimes={evmBitcoin:runtime.metadata,solana:Object.fromEntries(['classification','runtimeVersion','runtimePins','pohImplementation','officialSourceVersion','sourceCommit','sourcePatchSHA256','patchManifestSHA256','genesis','genesisHex','processId','binding','publicEntrypoints','freshSyntheticKeys','hostSecurityChanged','assurance','ledgerRetention','slotTiming'].map(k=>[k,solana.metadata[k]]))};clock=(Math.floor((await runtime.time())/600)+1)*600+10;
    await runtime.evm('evm_setNextBlockTimestamp',[clock]);await runtime.evm('evm_mine');
    issuer=createDisposableNativeIssuerLifetime({lifetimeId:randomBytes(32).toString('hex'),identityNamespace:randomBytes(32).toString('hex'),mode:'DISPOSABLE_LOCAL_ONLY_NO_RESTART'});
    const solAdapter={genesis:solana.genesis,solver:solana.solver,recipient:solana.recipient,
      transfer:async(...args)=>{foreign();report.nativeBoundaries.push({case:activeNative?.label,chain:'SOL',operation:'transfer-signing-capable-API-entry',atNs:stamp(),meaning:'Entry precedes internal native signing; actual signature callback is separately recorded'});return solana.transfer(...args);},
      observe:async(...args)=>{foreign();try{return await solana.observe(...args);}catch(error){if(error.observationDiagnostic)await privateAudit('solana-timeout',{kind:'private-solana-timeout',diagnostic:error.observationDiagnostic});throw error;}},balance:(...args)=>{foreign();return solana.balance(...args);}};
    const btcAdapter={btc:(method,...args)=>{foreign();if(['signrawtransactionwithwallet','sendrawtransaction'].includes(method))report.nativeBoundaries.push({case:activeNative?.label,chain:'BTC',operation:method+'-entry',atNs:stamp()});return runtime.btc(method,...args);}};
    const policyFor=bridge=>{const p=bridge.policy;return{policyId:p.policyId,identityNamespace:p.identityNamespace,genesis:p.chainDomain.genesis,x:p.issuerPublicKey.x,y:p.issuerPublicKey.y};};
    function createRoleService(role,token,destination,ack,label){return createAssemblyNativeDispatch({role,bridgeToken:token,nativeDestination:destination,nowSeconds:()=>clock,recipientAck:ack,archivePrivate:item=>privateAudit(label+'-'+role,item),onEvent:entry=>{(report.cases[label]??={}).serviceEvents??=[];report.cases[label].serviceEvents.push(entry);},createBridge:callbacks=>issuer.bind({chain:role.toUpperCase(),genesis:role==='sol'?base58Decode(solana.genesis,32).toString('hex'):runtime.metadata.bitcoinGenesis,minimumConfirmations:role==='sol'?1:6,runtime:role==='sol'?solAdapter:btcAdapter,policyFamilyId:sha(Buffer.from('PC15/notes/immutable-observation-only/1')),epochSeconds:600,nowSeconds:()=>clock,...callbacks})});}
    // Policy bootstrap bridge has no descriptor and can never dispatch. Policy
    // remains exactly the issuer/chain identity later bound by each role broker.
    const noCall=async()=>{throw Error('PC18_POLICY_BOOTSTRAP_NO_DISPATCH');};
    const policyBridges=Object.fromEntries(['sol','btc'].map(role=>[role,issuer.bind({chain:role.toUpperCase(),genesis:role==='sol'?base58Decode(solana.genesis,32).toString('hex'):runtime.metadata.bitcoinGenesis,minimumConfirmations:role==='sol'?1:6,runtime:role==='sol'?solAdapter:btcAdapter,policyFamilyId:sha(Buffer.from('PC15/notes/immutable-observation-only/1')),epochSeconds:600,authorizeLocalInvocation:noCall,retainSignedDispatch:noCall,archiveCertificate:noCall,nowSeconds:()=>clock})]));
    const policy={sol:policyFor(policyBridges.sol),btc:policyFor(policyBridges.btc),minimumBtcConfirmations:6};
    const sources={};for(const mode of ['reserve','withdraw'])sources[mode]=await readFile(join(projectRoot,'experiments/private-core-proof/native-notes/.local/prepared',mode+'.sol'),'utf8');for(const mode of ['sol_ready','btc_ready','fulfill','refund'])sources[mode]=await readFile(join(projectRoot,'experiments/private-core-proof/owner-independent/.local/prepared',mode+'.sol'),'utf8');
    await checkpoint('deploying-genuine-verifier-family-and-pool');pool=await deployPrivateAssemblyNativePool(runtime,{sources,policy:pref(policyCommitment(policy)),deploymentDomain:pref(randomBytes(32)),solAuthority:runtime.accounts[2],btcAuthority:runtime.accounts[1],onDeployment:async d=>{report.deployments.push(d);await save();}});
    await archiveNewEvmReceipts();clock=await runtime.time();report.pool={address:pool.address,scope:pool.scope,policy:pool.policy,verifiers:pool.verifiers,finalityProfile:FINALITY_PROFILE_NAME};
    async function submit(label,mode,proof,{value=0n,expectedStatus='0x1',expectedRevert,at,from=runtime.accounts[2]}={}){
      clock=at??clock+1;await runtime.evm('evm_setNextBlockTimestamp',[clock]);let receipt;try{receipt=await pool.send(label,{from,to:pool.address,data:pool.proofData(mode,proof.proof,proof.publicInputs),value:'0x'+BigInt(value).toString(16)},expectedStatus,expectedRevert);}finally{await archiveNewEvmReceipts();}report.transactions.push({label,mode,from:receipt.from,atNs:stamp(),...receiptSummary(receipt)});await save();return receipt;
    }
    async function submitAuthority(label,from,method,args){clock++;await runtime.evm('evm_setNextBlockTimestamp',[clock]);let receipt;try{receipt=await pool.send(label,{from,to:pool.address,data:pool.data(method,args)});}finally{await archiveNewEvmReceipts();}report.transactions.push({label,mode:'current-authority',from:receipt.from,atNs:stamp(),...receiptSummary(receipt)});await save();return receipt;}
    async function terminalArtifact(label,pkg){assert.ok(['fulfill','refund'].includes(pkg.mode));const proof=assemblyEvmProof(pkg);const dir=join(artifacts,label);await mkdir(dir,{recursive:true});await writeFile(join(dir,'proof.bin'),proof.proof);await writeFile(join(dir,'public-inputs.json'),JSON.stringify(proof.publicInputs,null,2)+'\n');report.publicTerminalArtifacts.push({label,...assemblyProofDigest(pkg),classification:'ACTUAL_PUBLIC_ONCHAIN_TERMINAL_TUPLE_ONLY'});return proof;}
    function actor(kind,bootstrap,label){const p=launchAssemblyProcess(kind,bootstrap);actors.push(p);return{...p,side:Object.fromEntries(Object.entries(p.channels).map(([channel,stream])=>[channel,sideEndpoint(stream,{channel,pid:p.control.pid,inventory:report.ipcInventory,label})]))};}
    async function transferPackage(from,operation,to,admit,ownerAck){let pkg=await from.request(operation);const acknowledgement=await heavy(`verify-retained-${pkg.mode??pkg.role}`,()=>to.request(admit,pkg));assert.equal(acknowledgement.packageSHA256,assemblyPackageDigest(pkg));if(ownerAck)await ownerAck.request('acknowledgePackage',{packageSHA256:acknowledgement.packageSHA256});pkg=undefined;return acknowledgement;}
    async function prepare(label){
      report.cases[label]={classification:'IN_PROGRESS_ACTUAL_FUNDED_RESERVATION',serviceEvents:[],ownerStopped:false,refundIssuanceOnly:label==='C'};
      const fundingAccount=runtime.accounts[{A:0,B:3,C:4}[label]],startEpoch=BigInt(Math.floor(clock/600)),claimEpoch=startEpoch+12n,tokens={sol:randomBytes(32).toString('hex'),btc:randomBytes(32).toString('hex')};
      const btcAddress=await runtime.btc('getnewaddress',['','bech32'],'m9-recipient'),btcInfo=await runtime.btc('getaddressinfo',[btcAddress],'m9-recipient');
      const owner=actor('owner',{plan:{scope:pool.scope.slice(2),policy,epoch:startEpoch.toString(),sourceSol:base58Decode(solana.solver,32).toString('hex'),recipientSol:base58Decode(solana.recipient,32).toString('hex'),recipientBtc:sha(Buffer.from(btcInfo.scriptPubKey,'hex')),claimEpoch:claimEpoch.toString()},bridgeTokens:tokens},label+'-owner');await owner.control.ready;
      const assembler=actor('assembler',{kind:'assembler',scope:pool.scope.slice(2),policy:pool.policy.slice(2),pins},label+'-assembler');await assembler.control.ready;
      const roles={};
      for(const role of ['sol','btc']){
        let terms=await owner.side[role].request('terms'),invoice;
        const vaultPath=join(local,`${label}-${role}.vault`);vaults.push(vaultPath);
        const withdrawalRecipient=runtime.accounts[role==='sol'?3:4].slice(2),recipient=await startRecipient({path:vaultPath,password:'synthetic-'+randomBytes(32).toString('hex'),expectedTerms:terms,withdrawalRecipient},report.ipcInventory,ownedChildren);recipients.push(recipient);
        const {termsDigest,value,paymentCommitment,localCommitment}=recipient.review;
        await recipient.request('acknowledgeCompensation',{termsDigest,value,paymentCommitment,localCommitment},'operator');
        invoice=await recipient.request('invoice',terms);importRecipientInvoice(terms,invoice);await owner.side[role].request('acceptInvoice',invoice);
        const producer=actor('producer',{kind:'producer',role,policy,bridgeToken:tokens[role]},label+'-'+role+'-producer');await producer.control.ready;
        const service=createRoleService(role,tokens[role],role==='sol'?solana.recipient:btcAddress,input=>recipient.request('assertNativeExposureAcknowledged',input),label);assert.deepEqual(policyFor(service),policy[role]);service.attachPool(pool,runtime);
        service.attachAuthority(bridge=>createCurrentFinalityAuthority({chain:role.toUpperCase(),bridge,pool,account:runtime.accounts[role==='sol'?2:1],chainId:runtime.metadata.chainId,nowSeconds:()=>clock,submitAuthority,archive:async entry=>{report.cases[label].authorityEvents??=[];report.cases[label].authorityEvents.push({chain:role.toUpperCase(),atNs:stamp(),entrySHA256:assemblyPackageDigest(entry),fields:assemblyFieldInventory(entry),stage:entry.stage??'fresh-permit'});}}));
        // Each closure has only its own terms/invoice/custody/process. There is
        // no controller-wide invoice array and no backup of the owner graph.
        roles[role]={
          async retain(){const retained=await transferPackage(owner.side[role],'ownPackage',producer.side.owner,'retainPackage',owner.side[role]);let b=await producer.side.broker.request('bridgeBinding');service.retainBinding(b);b=undefined;return retained;},
          async execute(readiness){await checkpoint(label+'-'+role+'-actual-native-dispatch');let result;activeNative={label,role};try{result=await service.dispatch({bridgeToken:tokens[role],readiness});}finally{activeNative=undefined;}if(role==='btc')await runtime.btc('generatetoaddress',[6,runtime.miningAddress]);let certificate=await service.certify(tokens[role]);await heavy(label+'-'+role+'-local-proof',()=>producer.side.broker.request('proveLocal',{certificate}));certificate=undefined;await transferPackage(producer.side.assembler,'localProof',assembler.side[role],'retainLocal');report.cases[label][role+'LocalRetainedAtNs']=stamp();return result;},
          async refuseDispatch(readiness,pattern){const before=service.audit();await assert.rejects(service.dispatch({bridgeToken:tokens[role],readiness}),pattern);assert.equal(service.audit().firstSignedAtNs,before.firstSignedAtNs);return{refused:true,firstSignedAtNs:service.audit().firstSignedAtNs};},
          async permit(pkg){return service.permit(tokens[role],pkg);},
          async withdraw(){
            const discovery=await discoverRecipientWithdrawal({pool,runtime,terms,invoice,recipient:withdrawalRecipient});
            await assert.rejects(recipient.request('authorizeWithdrawal',{...discovery.request,recipient:runtime.accounts[1].slice(2)}),/RECIPIENT_WITHDRAWAL_MISMATCH/);
            const authorization=await recipient.request('authorizeWithdrawal',discovery.request);
            const proof=await heavy(label+'-'+role+'-recipient-withdrawal-proof',()=>proveRecipientWithdrawal(recipientWithdrawalInput(terms,invoice,authorization,discovery.path),`pc18-${label}-${role}-withdraw`,ownedChildren));
            const current=await discoverRecipientWithdrawal({pool,runtime,terms,invoice,recipient:withdrawalRecipient});assert.equal(current.request.epoch,authorization.epoch);
            const account='0x'+withdrawalRecipient,before=await runtime.balance(account);const receipt=await submit(label+' '+role+' exact recipient withdrawal','withdraw',proof);const delta=await runtime.balance(account)-before;assert.equal(delta,BigInt(authorization.amount));
            await submit(label+' '+role+' duplicate withdrawal refused','withdraw',proof,{expectedStatus:'0x0',expectedRevert:'NOTE_ALREADY_SPENT'});
            return{role,recipient:account,amount:delta.toString(),transaction:receiptSummary(receipt),recipientPid:recipient.pid,signingKeyHeldByRecipientProcess:true};
          },
          audit:()=>service.audit(),producer:producer.control,
        };
      }
      const reserve=validateAssemblyProofPackage(await heavy(label+'-owner-reserve-proof',()=>owner.control.request('proveReserve',{epoch:startEpoch.toString()})),'reserve');
      const funded=BigInt(reserve.publicInputs[17]);await submit(label+' actual funded reserve','reserve',assemblyEvmProof(reserve),{value:funded,from:fundingAccount});
      const state=await pool.snapshot(),reserved=noteWordsToHash(reserve.publicInputs.slice(18,26)),index=state.leaves.slice(0,state.leafCount).indexOf(reserved);assert.ok(index>=0);const path=new PrivateNoteTree(state.leaves.slice(0,state.leafCount)).path(index);
      await heavy(label+'-owner-authorization-proof',()=>owner.control.request('proveAuthorization',{path}));
      for(const role of ['sol','btc'])await roles[role].retain();
      const aAck=await transferPackage(owner.side.assembler,'authorization',assembler.side.owner,'retainAuthorization',owner.side.assembler);
      const complete=await owner.control.request('completePackages');assert.equal(complete.event,'complete-packages-ready');
      report.cases[label].reservation={fundedWei:funded.toString(),reserveProofSHA256:assemblyProofDigest(reserve).proofSHA256,authorizationSHA256:aAck.packageSHA256,ownerPid:owner.control.pid,assemblerPid:assembler.control.pid,producerPids:Object.fromEntries(['sol','btc'].map(role=>[role,roles[role].producer.pid])),fundingAccount,relayerAccount:runtime.accounts[2],privateCutoffRetainedByAssembler:true,completePackagesAtNs:stamp()};
      const reservation={label,owner,assembler,roles,funded,claimEpoch,authorizedRoot:state.root,
        async stopOwner(point){const exit=await owner.control.stop();assert.equal(exit.code,0);await assert.rejects(owner.control.request('status'),/PC18_PROCESS_STOPPED/);const p=owner.control.provenance();assert.equal(p.writesAfterExit,0);assert.equal(p.channelsClosed,true);assert.equal(p.closed,true);report.cases[label].ownerStopped=true;report.cases[label].ownerRemoval={point,...p};await save();return p;},
      };
      reservations.push(reservation);await save();return reservation;
    }
    async function readiness(r,role){const state=await pool.snapshot();const start=performance.now();await heavy(r.label+'-'+role+'-readiness-proof',()=>r.assembler.control.request('proveReadiness',{role,snapshot:state,epoch:state.epoch}));if(performance.now()-start>=600000)throw Error('PC18_READINESS_TIMING_REDESIGN_REQUIRED');return r.assembler.side[role].request('readiness');}
    async function finish(r,{solAlready=false}={}){
      let claimed;const permits={};
      const withdrawals=await completeAssemblyPaidPayment({
        readiness:role=>readiness(r,role),
        async execute(role,ready){await r.roles[role].execute(ready);if(role==='btc')await r.roles.btc.refuseDispatch(ready,/PC18_DISPATCH_CAPABILITY_USED_OR_BUSY/);},
        async assertOwnerExited(){assert.equal(r.owner.control.provenance().closed,true,'PC18_OWNER_REQUIRED_OFFLINE_BEFORE_JOIN');},
        async join(){await heavy(r.label+'-joined-authorization-sol-proof',()=>r.assembler.control.request('proveJoin'));},
        async terminal(){
          await heavy(r.label+'-terminal-fulfillment-proof',async()=>r.assembler.control.request('proveFulfillment',{epoch:(await pool.snapshot()).epoch}));
          const pkg=await r.assembler.control.request('terminalProof'),full=await terminalArtifact(r.label+'-fulfill',pkg);r.claimReserveNF=noteWordsToHash(full.publicInputs.slice(25,33));
          assert.equal(noteWordsToHash(full.publicInputs.slice(17,25)),r.authorizedRoot,'PC18_ORIGINAL_AUTHORIZATION_ROOT');
          await submit(r.label+' O without current permits refused','fulfill',full,{expectedStatus:'0x0',expectedRevert:'FINALITY_NOT_CURRENT'});
          return {pkg,full};
        },
        async permit(role,{pkg}){permits[role]=await r.roles[role].permit(pkg);},
        async claim({full}){
          claimed=await submit(r.label+' recursive O and current permits issue payouts','fulfill',full);
          await submit(r.label+' duplicate global claim refused','fulfill',full,{expectedStatus:'0x0',expectedRevert:'NOTE_ALREADY_SPENT'});
          const state=await pool.snapshot();await assert.rejects(r.assembler.control.request('proveReadiness',{role:'sol',snapshot:state,epoch:state.epoch}),/PC18_RESERVE_ALREADY_SPENT/);
        },
        withdraw:role=>r.roles[role].withdraw(),
      },{solAlready});
      assert.equal(withdrawals.reduce((n,w)=>n+BigInt(w.amount),0n),r.funded);
      const audit={sol:r.roles.sol.audit(),btc:r.roles.btc.audit()};const ownerExit=BigInt(r.owner.control.provenance().exitedAtNs);assert.ok(ownerExit<BigInt(audit.btc.authorizedAtNs));assert.ok(BigInt(audit.sol.certifiedAtNs)<BigInt(audit.btc.authorizedAtNs));if(r.label==='A'){assert.ok(ownerExit<BigInt(audit.sol.dispatchEnteredAtNs));const nativeEntry=report.nativeBoundaries.find(e=>e.case===r.label&&e.chain==='SOL');assert.ok(nativeEntry&&ownerExit<BigInt(nativeEntry.atNs));}else assert.ok(BigInt(report.cases[r.label].solLocalRetainedAtNs)<ownerExit);const btcSign=report.nativeBoundaries.find(e=>e.case===r.label&&e.operation==='signrawtransactionwithwallet-entry');assert.ok(btcSign&&BigInt(audit.btc.authorizedAtNs)<BigInt(btcSign.atNs));
      Object.assign(report.cases[r.label],{classification:'ACTUAL_OWNER_OFFLINE_CLAIM_AND_BOTH_RECIPIENT_WITHDRAWALS',permits:Object.fromEntries(Object.entries(permits).map(([role,p])=>[role,{...p,receipt:receiptSummary(p.receipt)}])),claim:receiptSummary(claimed),withdrawals,serviceAudit:audit});
      check(r.label+' owner offline before dependent BTC and terminal claim; both exact recipient payouts withdrawn');await save();
    }
    let A;
    if(scenarioProfile.runSuccessSchedules){
    A=await prepare('A');await A.stopOwner('AFTER_RETAINED_A_AND_ROLE_PACKAGES_BEFORE_FIRST_NATIVE_EXPOSURE');
    const stale=await readiness(A,'sol');
    const B=await prepare('B'); // Authentic unrelated insertion, no fourth reserve.
    assert.notEqual((await pool.snapshot()).root,A.authorizedRoot);await A.roles.sol.refuseDispatch(stale,/PC18_READINESS_STALE_OR_MISMATCH/);report.cases.A.staleRefusal={classification:'ACTUAL_GENUINE_READINESS_STALE_PUBLIC_STATE_PRE_SIGN_HOST_REFUSAL',ownerAlreadyExited:true,refreshCount:1,unrelatedAuthenticFundedReservation:'B'};
    const refreshed=await readiness(A,'sol');await A.roles.btc.refuseDispatch(null,/PC18_/);await A.roles.sol.execute(refreshed);await finish(A,{solAlready:true});
    check('Case A unrelated authentic insertion does not require original owner path/witness refresh');
    const br=await readiness(B,'sol');await B.roles.sol.execute(br);await B.stopOwner('AFTER_ACTUAL_SOL_AND_RETAINED_L_SOL_BEFORE_J_OR_R_BTC');await finish(B,{solAlready:true});
    }else if(scenarioProfile.runPaidControlSchedule){
      A=await prepare('A');await A.stopOwner('AFTER_RETAINED_A_AND_ROLE_PACKAGES_BEFORE_FIRST_NATIVE_EXPOSURE');await finish(A);
    }
    let beforeForeign,beforeBlocked;
    if(scenarioProfile.runTimeoutSchedule){
    const C=await prepare('C');const cr=await readiness(C,'sol');await C.roles.sol.execute(cr);await C.stopOwner('AFTER_ACTUAL_SOL_PREFIX_AND_RETAINED_L_SOL_BEFORE_LATE_FAILURE_TIMEOUT');
    await assert.rejects(C.assembler.control.request('proveRefund',{epoch:(C.claimEpoch-1n).toString()}),/PC18_CUTOFF/);report.cases.C.earlyRefundRefusal={classification:'ACTOR_PHASE_REFUSAL_NOT_CRYPTOGRAPHIC_NEGATIVE',code:'PC18_CUTOFF'};
    await heavy('C-authenticated-SOL-join-before-revocation-control',()=>C.assembler.control.request('proveJoin'));const preRevocationReady=await readiness(C,'btc');
    const privateCertificate=JSON.parse(await readFile(privateCertificatePaths.get('C-sol'),'utf8')).envelope;const revokedEffect=pref(effectConsumptionHash(pool.scope.slice(2),privateCertificate.certificate.chainDomain,privateCertificate.certificate.opaqueTag));
    const adverseReceipt=await submitAuthority('C synthetic SOL policy adverse fact included',runtime.accounts[2],'recordAdverse(uint8,bytes32,bytes32)',[1,revokedEffect,pref(randomBytes(32))]);
    await C.roles.btc.refuseDispatch(preRevocationReady,/PC18_READINESS_STALE_OR_MISMATCH/);const revokedState=await pool.snapshot();await assert.rejects(C.assembler.control.request('proveReadiness',{role:'btc',snapshot:revokedState,epoch:revokedState.epoch}),/PC18_SOL_EFFECT_REVOKED/);
    report.cases.C.knownRevocationRefusal={classification:'ACTUAL_INCLUDED_SYNTHETIC_AUTHORITY_POLICY_FACT_NOT_SOLANA_REORG',adverseReceipt:receiptSummary(adverseReceipt),oldReadinessGenuine:true,oldReadinessRefusedBeforeSigning:true,freshReadinessRefusal:'HOST_PRECHECK_OF_AUTHENTICATED_SET_TARGET_NO_NEW_PROOF',btcSignaturesAfterAdverse:0};
    report.cases.C.timeoutCause='SYNTHETIC_INCLUDED_SOL_POLICY_REVOCATION_BLOCKS_BTC: SOL really delivered; no Solana reorg is claimed; immutable funded recovery then issues at cutoff';beforeForeign=foreignReads;beforeBlocked=blockedForeignReads;foreignEnabled=false;const exactCutoff=Number(C.claimEpoch*600n);
    await heavy('C-exact-cutoff-recursive-refund',()=>C.assembler.control.request('proveRefund',{epoch:C.claimEpoch.toString()}));
    const refundPackage=await C.assembler.control.request('terminalProof'),refund=await terminalArtifact('C-refund',refundPackage);assert.equal(BigInt(refund.publicInputs[16]),C.claimEpoch);
    const recovery=noteWordsToHash(refund.publicInputs.slice(33,41)),reserveNF=noteWordsToHash(refund.publicInputs.slice(25,33));assert.equal(noteWordsToHash(refund.publicInputs.slice(17,25)),C.authorizedRoot);
    const refunded=await submit('C exact original recovery output issued at cutoff','refund',refund,{at:exactCutoff});assert.equal(Number(BigInt((await runtime.evm('eth_getBlockByHash',[refunded.blockHash,false])).timestamp)),exactCutoff);await submit('C duplicate refund refused','refund',refund,{expectedStatus:'0x0',expectedRevert:'NOTE_ALREADY_SPENT'});
    assert.equal(foreignReads,beforeForeign);assert.equal(blockedForeignReads,beforeBlocked);assert.equal(C.roles.btc.audit().firstSignedAtNs,null);assert.equal(C.roles.btc.audit().retainedNativeHandle,false);
    const final=await pool.snapshot();assert.equal(final.liveReservations,0);assert.equal(final.liveOutputNotes,1);assert.equal(final.solEffectCount,scenarioProfile.completedEffectPairs);assert.equal(final.btcEffectCount,scenarioProfile.completedEffectPairs);assert.ok(final.leaves.includes(recovery));assert.ok(final.nullifiers.includes(reserveNF));assert.equal(await runtime.balance(pool.address),C.funded);
    Object.assign(report.cases.C,{classification:'ACTUAL_OWNER_OFFLINE_TIMEOUT_EXACT_RECOVERY_ISSUANCE_ONLY',refund:receiptSummary(refunded),recoveryOutput:recovery,reserveNullifier:reserveNF,foreignReadsDuringRefund:0,blockedForeignReadAttemptsDuringRefund:0,btcNeverSigned:true,recoveryWithdrawn:false,recoveryWithdrawalAvailable:false,recoveryKeyLocation:'STOPPED_OWNER_PROCESS_ONLY_NOT_DISTRIBUTED',remainingBackingWei:C.funded.toString(),serviceAudit:{sol:C.roles.sol.audit(),btc:C.roles.btc.audit()}});
    check('Case C actual SOL prefix remains unpaid; exact authorized recovery note issued after owner exit with zero foreign reads');
    }
    if(scenarioProfile.runPaidControlSchedule){
      beforeForeign=foreignReads;beforeBlocked=blockedForeignReads;foreignEnabled=false;
      const cutoff=Number(A.claimEpoch*600n);await runtime.evm('evm_setNextBlockTimestamp',[cutoff]);await runtime.evm('evm_mine');clock=await runtime.time();assert.equal(clock,cutoff);
      report.paidControl={freshReservationOnly:true,priorDeploymentStateReused:false,actualClaimAndBothWithdrawalsCompleted:true,refundEpoch:A.claimEpoch.toString(),foreignAccessDisabledBeforeRefundProof:true};
    }
    if(A){
    // One additional genuine F for already claimed A establishes real cross-mode
    // same-NF exclusion. A's assembler survived through cutoff, without owner.
    await heavy('A-post-claim-recursive-refund-exclusion',async()=>A.assembler.control.request('proveRefund',{epoch:(await pool.snapshot()).epoch}));
    const excludedPackage=await A.assembler.control.request('terminalProof'),excludedRefund=await terminalArtifact('A-refund-after-claim-rejected',excludedPackage);
    assert.equal(noteWordsToHash(excludedRefund.publicInputs.slice(25,33)),A.claimReserveNF,'PC18_CLAIM_REFUND_IDENTICAL_NF');
    assert.equal(await pool.verify('refund',excludedRefund.proof,excludedRefund.publicInputs),true,'PC18_GENUINE_F_DEPLOYED_VERIFIER');
    const excludedReceipt=await submit('A genuine F after prior O uses identical NF and is refused','refund',excludedRefund,{expectedStatus:'0x0',expectedRevert:'NOTE_ALREADY_SPENT'});
    report.cases.A.claimVersusRefund={classification:'ACTUAL_GENUINE_F_FOR_PRIOR_CLAIM_SAME_NF_POOL_REJECTION',deployedRefundVerifierAccepted:true,reserveNullifier:A.claimReserveNF,receipt:receiptSummary(excludedReceipt),expectedRevert:'NOTE_ALREADY_SPENT'};
    assert.equal(foreignReads,beforeForeign);assert.equal(blockedForeignReads,beforeBlocked);
    check('Claimed A cannot refund with a genuine F proof carrying exactly the same public reserve nullifier');
    }
    report.genuinePostClaimRefundExclusion={executed:Boolean(A),classification:A?'ACTUAL_GENUINE_F_SAME_NULLIFIER_REJECTED':'NOT_SCHEDULED_IN_FRESH_TIMEOUT_ONLY_PROFILE'};
    report.finalState=await pool.snapshot();report.finalPoolBalanceWei=(await runtime.balance(pool.address)).toString();report.disclosure={privateWitnessSaved:false,ownerGraphExported:false,ownerRecoveryKeyDistributed:false,rawRolePackagesArchived:false,completeAJLStatementsPublished:false,onlyTerminalOFProofInputsPublished:true,signingKeysSavedInEvidence:false};
    if(scenarioProfile.runPaidControlSchedule){assert.equal(report.finalState.liveReservations,0);assert.equal(report.finalState.liveOutputNotes,0);assert.equal(report.finalState.solEffectCount,1);assert.equal(report.finalState.btcEffectCount,1);assert.equal(report.finalPoolBalanceWei,'0');report.paidControl.foreignReadsDuringRefundControl=foreignReads-beforeForeign;report.paidControl.blockedForeignReadAttemptsDuringRefundControl=blockedForeignReads-beforeBlocked;}
    for(const [file,expected]of Object.entries(report.sources))assert.equal(sha(await readFile(join(projectRoot,file))),expected.sha256,'PC18_SOURCE_CHANGED_DURING_RUN');
    for(const r of reservations){const p=r.owner.control.provenance();assert.equal(p.writesAfterExit,0);assert.equal(p.closed,true);const funder=report.cases[r.label].reservation.fundingAccount;assert.equal(report.transactions.filter(t=>t.from?.toLowerCase()===funder.toLowerCase()&&BigInt(t.atNs)>BigInt(p.exitedAtNs)).length,0,'PC18_STOPPED_OWNER_FUNDER_REUSED');report.cases[r.label].postExitFundingAccountTransactions=0;}
    report.phase='completed';report.classification=scenarioProfile.runSuccessSchedules?'ACTUAL_FUNDED_PC18_OWNER_OFFLINE_ASSEMBLY_TWO_WITHDRAWALS_EACH_AND_REFUND_ISSUANCE_ONLY':scenarioProfile.runPaidControlSchedule?'ACTUAL_FUNDED_PC18_SINGLE_PAID_OWNER_OFFLINE_GENUINE_F_EXCLUSION':'ACTUAL_FUNDED_PC18_FRESH_TIMEOUT_ONLY_OWNER_OFFLINE_RECOVERY_ISSUANCE';report.completedAt=new Date().toISOString();
  }catch(error){report.failedPhase=report.phase;report.phase='failed';report.classification='FAILED_ACTUAL_OWNER_OFFLINE_PC18';report.failure={code:safeCode(error),name:error.name,details:'Value-bearing assertion diagnostics omitted; failed phase and prior attempts preserved'};}
  finally{
    clearInterval(monitor);const cleanups=[];
    for(const recipient of recipients)try{cleanups.push(await recipient.stop());}catch(error){cleanups.push({error:safeCode(error)});}
    for(const actor of actors)try{await actor.control.stop();}catch{await actor.control.terminate();}
    for(const child of ownedChildren)if(child.exitCode===null&&child.signalCode===null){child.kill('SIGTERM');await new Promise(resolve=>child.once('close',resolve));}
    for(const path of vaults)await rm(path,{force:true});report.disposableRecipientVaultsRemoved=true;report.recipientCleanup=cleanups;
    if(issuer)issuer.close();if(solana)try{report.solanaCleanup=await solana.close();}catch(error){report.solanaCleanupError=safeCode(error);}
    if(runtime)try{await runtime.close();report.nativeRuntimeCleanup=true;}catch(error){report.nativeRuntimeCleanupError=safeCode(error);}
    report.privateOperationalAudit={files:privateAuditCount,containsRawNativeReceiptsAndCertificates:true,containsSigningKeys:false,fullEvmTransactionReceiptHeaderRecords:privateEvmReceiptCount,publiclyArchived:false,excludedFromPublicCheckpoint:true};
    report.actorCleanup=actors.map(a=>a.control.provenance());report.processResourceUsage=process.resourceUsage();report.resources=resourceSnapshot();
    if(report.phase==='completed'&&(!report.nativeRuntimeCleanup||report.solanaCleanupError||report.nativeRuntimeCleanupError||cleanups.some(c=>c.error)||report.actorCleanup.some(p=>!p.closed))){report.phase='failed-cleanup';report.classification='FAILED_CLEANUP_ACTUAL_OWNER_OFFLINE_PC18';}
    await save();
  }
  return{phase:report.phase,evidence,classification:report.classification};
}
if(process.argv[1]===fileURLToPath(import.meta.url)){
  const args=process.argv.slice(2);assert.ok(!(args.includes('--timeout-only')&&args.includes('--paid-control-only')),'PC18_CONFLICTING_SCENARIOS');runAssemblyNativeIntegration({authorizedNativeRun:args.includes('--authorized-native-run'),refundIssuanceOnly:args.includes('--refund-issuance-only'),scenarioProfile:args.includes('--paid-control-only')?'paid-control':args.includes('--timeout-only')?'timeout-only':'full',capabilityReportPath:args.find(x=>x.startsWith('--capability-report='))?.slice('--capability-report='.length)}).then(result=>{console.log(JSON.stringify(result));if(result.phase!=='completed')process.exitCode=1;}).catch(error=>{console.error(safeCode(error));process.exitCode=1;});
}
