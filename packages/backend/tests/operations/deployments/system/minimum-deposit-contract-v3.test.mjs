/** Owned loopback Anvil and the exact V3 artifact. Permissive TEST verifier and
 * TEST hub exercise amount/state predicates, never genuine proof acceptance. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {join} from 'node:path';
import {encodeClaimABI,encodeClaimCall,claimABIType} from '@lianum/engine/claims/abi';
import {projectRoot} from '@lianum/environment';
import {createLocalEvm} from '@lianum/engine/execution/local/local-evm';
import {compileSoliditySources} from '@lianum/proofs/tooling/solidity-compiler';
import {linkPrivateBytecode} from '@lianum/engine/notes/private-asset-runtime';
import {encodeWalletPoolInputs} from '@lianum/engine/wallet/notes/private-wallet-note-encoding';
import {encodeStatement} from '@lianum/components/encoding/statements';
import {PrivateNoteTree} from '@lianum/engine/notes/private-note-tree';
import {loadMinimumDepositLedgerArtifacts} from '../../../../src/operations/deployments/system/append-only-deployment-artifacts-v3.mjs';
const wordHex=x=>'0x'+BigInt(x).toString(16).padStart(64,'0');
function interfaceFor(artifact){return{encodeDeploy:args=>encodeClaimABI(artifact.abi.find(x=>x.type==='constructor')?.inputs??[],args),encodeFunctionData(name,args=[]){const method=artifact.abi.find(x=>x.type==='function'&&x.name===name);assert.ok(method);return encodeClaimCall(artifact,name+'('+method.inputs.map(claimABIType).join(',')+')',args);}};}
const hash=x=>createHash('sha256').update(x).digest('hex'),digest=n=>'0x'+BigInt(n).toString(16).padStart(64,'0');
test('V3 contract rejects zero/below-minimum deposits and permits small withdrawal and reserved recovery',{timeout:120000},async()=>{
 const {artifacts}=loadMinimumDepositLedgerArtifacts(),sources={};
 for(const name of ['FlatHubCodec.sol','FlatVerifierSet.sol','crypto/Poseidon2.sol','crypto/Poseidon2Domains.sol']){const content=readFileSync(join(projectRoot,'contracts/wallet',name),'utf8');sources[name]={content,sha256:hash(content)};}
 const content=readFileSync(new URL('../../../fixtures/operations/deployments/minimum-test-ports-v3.sol',import.meta.url),'utf8');sources['MinimumTestPortsV3.sol']={content,sha256:hash(content)};
 const compiled=compileSoliditySources(sources,{profile:'standard'}),runtime=await createLocalEvm(),sender=runtime.accounts[0];
 let stopped=false;
 try{
  const {publicKeccak256}=await import('@lianum/engine/cohorts/private-cohort-public-native');
  const keccak=code=>'0x'+publicKeccak256(Buffer.from(code.slice(2),'hex')).toString('hex'),links={};
  async function deploy(label,artifact,args=[],status='0x1',reason){const iface=interfaceFor(artifact),data='0x'+linkPrivateBytecode(artifact.evm.bytecode.object,artifact.evm.bytecode.linkReferences,links)+iface.encodeDeploy(args).slice(2);const receipt=await runtime.send(label,{from:sender,data},status,reason);if(status==='0x0')return null;const address=receipt.contractAddress.toLowerCase(),code=await runtime.code(address);return{address,codeHash:keccak(code),iface,artifact};}
  const domains=await deploy('TEST real Poseidon2Domains',artifacts.poseidon2Domains),codec=await deploy('TEST real FlatHubCodec',artifacts.hubCodec);
  links['crypto/Poseidon2Domains.sol:Poseidon2Domains']=domains.address;links['FlatHubCodec.sol:FlatHubCodec']=codec.address;
  const verifier=await deploy('EXPLICIT permissive TEST verifier',compiled.contracts['MinimumTestPortsV3.sol'].MinimumTestVerifierV3);
  const verifierSet={pins:Array.from({length:12},()=>({verifier:verifier.address,codeHash:verifier.codeHash})),poseidon2Domains:domains.address,poseidon2DomainsCodeHash:domains.codeHash,hubCodec:codec.address,hubCodecCodeHash:codec.codeHash};
  const hub=await deploy('EXPLICIT TEST hub',compiled.contracts['MinimumTestPortsV3.sol'].MinimumTestHubV3,[verifierSet]);
  const configuration={minimumDepositAmount:'100',asset:'0x'+'00'.repeat(20),deploymentDomain:digest(10),policy:digest(11),verifierSet,receiptHub:hub.address,receiptHubCodeHash:hub.codeHash,hubDomain:digest(2),registryCommitment:digest(3)};
  await deploy('zero minimum must revert',artifacts.pool,[{...configuration,minimumDepositAmount:'0'}],'0x0','MINIMUM_DEPOSIT_REQUIRED');
  const pool=await deploy('exact V3 TEST deployment',artifacts.pool,[configuration]);
  const call=async name=>(await runtime.call({to:pool.address,data:pool.iface.encodeFunctionData(name)})).slice(2);
  assert.equal(BigInt('0x'+await call('minimumDepositAmount')),100n);
  const scope=await call('scope'),policy=configuration.policy.slice(2),epoch=String(BigInt((await runtime.block()).timestamp)/600n),output=digest(101).slice(2);
  const deposit=amount=>encodeWalletPoolInputs('deposit_balance',{scope,policy,epoch,amount,output});
  await runtime.send('below minimum D26 must revert',{from:sender,to:pool.address,data:pool.iface.encodeFunctionData('depositBalance',['0x',deposit('99').map(wordHex)]),value:'99'},'0x0','DEPOSIT_BELOW_MINIMUM');
  const timestamp=BigInt((await runtime.block()).timestamp),intent=encodeStatement('deposit_intent',{scope,policy,validFrom:String(timestamp-1n),validUntil:String(timestamp+100n),amount:'99',output:digest(102).slice(2)});
  await runtime.send('below minimum D27 must revert',{from:sender,to:pool.address,data:pool.iface.encodeFunctionData('depositBalanceIntent',['0x',intent.map(wordHex)]),value:'99'},'0x0','DEPOSIT_BELOW_MINIMUM');
  await runtime.send('TEST deposit at minimum',{from:sender,to:pool.address,data:pool.iface.encodeFunctionData('depositBalance',['0x',deposit('100').map(wordHex)]),value:'100'});
  const root=await call('currentRoot'),nullifier=digest(201).slice(2),recipient=runtime.accounts[1].slice(2),withdraw=encodeWalletPoolInputs('withdraw_balance',{scope,policy,epoch,root,nullifier,amount:'1',recipient});
  const balance=await runtime.balance(runtime.accounts[1]);await runtime.send('small TEST withdrawal remains available',{from:sender,to:pool.address,data:pool.iface.encodeFunctionData('withdrawBalance',['0x',withdraw.map(wordHex)])});assert.equal(await runtime.balance(runtime.accounts[1]),balance+1n);
  // A fresh output backs an ordinary reservation, then F41. Original Solidity
  // functions/counters run; permissive verifier is solely this explicit harness.
  const second=digest(103).slice(2);const secondDeposit=encodeWalletPoolInputs('deposit_balance',{scope,policy,epoch,amount:'100',output:second});await runtime.send('TEST second deposit',{from:sender,to:pool.address,data:pool.iface.encodeFunctionData('depositBalance',['0x',secondDeposit.map(wordHex)]),value:'100'});
  const domainCommitment=await call('domainCommitment'),envelope=digest(20).slice(2),reserve=digest(301).slice(2),change=digest(302).slice(2),reserveNullifier=digest(303).slice(2),now=BigInt((await runtime.block()).timestamp);
  const authorization=encodeStatement('authorization',{domainCommitment,envelope});const reservation=encodeStatement('reservation',{domainCommitment,envelope,inputRoot:await call('currentRoot'),inputNullifier:digest(304).slice(2),reserveCommitment:reserve,changeCommitment:change,admissionTag:digest(305).slice(2),fundingNotBefore:String(now-1n),fundingValidUntil:String(now+100n)});
  const expectedRoot=new PrivateNoteTree([digest(101),digest(103),'0x'+reserve,'0x'+change]).root;
  await runtime.send('TEST reserve before recovery',{from:sender,to:pool.address,data:pool.iface.encodeFunctionData('reserveGenericGuarded',[{proof:'0x',inputs:authorization.map(wordHex)},{proof:'0x',inputs:reservation.map(wordHex)},String(BigInt('0x'+await call('stateSequence'))),expectedRoot])});
  const recovery=encodeStatement('recovery',{domainCommitment,authorizationRoot:await call('authorizationRoot'),poolRoot:await call('currentRoot'),reserveNullifier,recoveryCommitment:digest(306).slice(2),settleBefore:String(now)});
  await runtime.send('TEST recovery has no deposit minimum gate',{from:sender,to:pool.address,data:pool.iface.encodeFunctionData('recoverGeneric',['0x',recovery.map(wordHex)])});assert.equal(BigInt('0x'+await call('liveReservations')),0n);
 }finally{const result=await runtime.close({removeScratch:true});assert.equal(result.stopped,true);stopped=true;}
 assert.equal(stopped,true);
});
