/** Source-extracted bootstrap/readonly checks with synthetic deployment records.
 * No EVM, compiler, proof or financial authority is created by these tests. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const fixtureSource=readFileSync(new URL('./official-aave-fixture-v1.mjs',import.meta.url),'utf8');
function cut(source,begin,end){const start=source.indexOf(begin),stop=source.indexOf(end,start);assert.ok(start>=0&&stop>start);return source.slice(start,stop);}
const bootstrap=cut(fixtureSource,'  const vaultImplementation =','  assert.equal((await read(vault,\'asset\'))');
const address=n=>'0x'+n.repeat(40),implAddress=address('1'),proxyAddress=address('2'),admin=address('3'),sender=address('4');
const run=(body,env)=>vm.runInThisContext('(async function({'+Object.keys(env).join(',')+'}){'+body+'\n})')(env);
test('official proxy initializes atomically at direct CREATE and retains its original creation receipt',async()=>{
  const deployments=[],checks=[],proxies=[],creationReceipt=Object.freeze({transactionHash:'0x'+'8'.repeat(64),blockNumber:'0x20',contractAddress:proxyAddress});
  const staticArtifact={},proxyArtifact={},sourceASTs={},initializeData='0x8129fc1c';
  const iface={encodeFunctionData:(method,args)=>{assert.equal(method,'initialize');assert.deepEqual(args,[address('5'),'Local Aave static token','LSTATA']);return initializeData;}};
  const env={assert,Object,sender,zero:address('0'),pool:{address:address('6')},provider:{address:admin},aToken:{address:address('5')},
    build:{artifacts:{StaticATokenLM:staticArtifact},sourceASTs},core:{artifacts:{AdminUpgradeabilityProxy:proxyArtifact}},proxies,
    deploy:async(...args)=>{deployments.push(args);return args[0]==='StaticATokenLMImplementation'
      ?Object.freeze({address:implAddress,iface,code:'0x6001',receipt:{blockNumber:'0x1f'}})
      :Object.freeze({name:args[0],address:proxyAddress,iface:{},code:'0x6002',receipt:creationReceipt});},
    send:async()=>{throw new Error('Initializable: contract is already initialized');},
    runtime:{proxyImplementation1967:async(...args)=>{checks.push(['implementation',...args]);return implAddress;},
      proxyAdmin1967:async(...args)=>{checks.push(['admin',...args]);return admin;}}};
  const vault=await run(bootstrap+'return vault;',env);
  assert.equal(deployments.length,2);assert.equal(deployments[0][1],staticArtifact);
  assert.equal(deployments[1][1],proxyArtifact);assert.deepEqual(deployments[1][2],[implAddress,admin,initializeData]);
  assert.deepEqual(deployments[1][3],{});assert.equal(vault.address,proxyAddress);assert.equal(vault.code,'0x6002');
  assert.equal(vault.iface,iface);assert.equal(vault.receipt,creationReceipt);assert.equal(proxies[0],vault);
  assert.deepEqual(checks,[['implementation',proxyAddress,'0x20'],['admin',proxyAddress,'0x20']]);
  const previous="const vault=await deploy('StaticATokenLM',build.artifacts.StaticATokenLM,[pool.address,zero],{POOL:pool.address,INCENTIVES_CONTROLLER:zero},build.sourceASTs);await send(vault,'initialize',[aToken.address,'Local Aave static token','LSTATA']);";
  await assert.rejects(run(previous,env),/Initializable: contract is already initialized/);
  await assert.rejects(run(bootstrap,{...env,provider:{address:sender}}),/AAVE_STATIC_PROXY_ADMIN_NOT_CALLER/);
});
test('fixed admin slot read retains canonical head and rejects zero or malformed words',async()=>{
  const source=readFileSync(new URL('../chain-adapters/owned-evm-runtime-backend-v1.mjs',import.meta.url),'utf8');
  const body=cut(source,"async proxyAdmin1967(holder, tag = 'latest') {",'\n      } }),').split('{').slice(1).join('{');
  const calls=[],head={number:'0x20',hash:'0x'+'9'.repeat(64)};let word='0x'+'0'.repeat(24)+admin.slice(2);
  const method=vm.runInThisContext('(function({assert,health,address,block,blockTag,rpc,assertCanonical}){return async function(holder,tag=\'latest\'){'+body+'\n};})')({
    assert,health:async()=>{},address:value=>{assert.match(value,/^0x[0-9a-f]{40}$/);return value;},
    block:async tag=>{assert.equal(tag,'0x20');return head;},blockTag:value=>value,
    rpc:async(method,args)=>{calls.push([method,args]);return method==='eth_getCode'?'0x6002':word;},
    assertCanonical:async value=>assert.equal(value,head)});
  assert.equal(await method(proxyAddress,'0x20'),admin);
  assert.deepEqual(calls[1],['eth_getStorageAt',[proxyAddress,'0xb53127684a568b3173ae13b9f8a6016e243e63b6e8ee1178d6a717850b5d6103','0x20']]);
  word='0x'+'0'.repeat(64);await assert.rejects(method(proxyAddress,'0x20'),/LOCAL_EVM_PROXY_ADMIN_NONZERO/);
  word='0x'+'f'.repeat(64);await assert.rejects(method(proxyAddress,'0x20'),/LOCAL_EVM_PROXY_ADMIN_WORD/);
});
