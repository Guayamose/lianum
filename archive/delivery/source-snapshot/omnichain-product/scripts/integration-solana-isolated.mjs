import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { pinnedBinary, scratchDirectory, removeOwnScratch, unusedLoopbackPort, ownedRuntimeRpc, stopOwnProcess, sleep, projectRoot } from '../src/chains/runtime-harness.mjs';

const pins = { validator: ['agave-validator.exe','3120a0cc5d6994ec014404b1615ddc2ac47580681ba0a44ad047e329c65e3a8e'], genesis: ['solana-genesis.exe','ccb91ad12262f853accd38104f2280c688d3b7f236ca31658a276058ac0f18d9'], keygen: ['solana-keygen.exe','9a7b1d93f6d70479311b3841f8e3c2060c9c9731e5bb62fb65b3b4daf059fc03'], cli: ['solana.exe','c3820df6dd2537023892998aef1ceaabe27557953fee8d46b9a9eba7cf175b4c'] };
const dir = await scratchDirectory('m10-solana-native-');
const env = { SystemRoot:process.env.SystemRoot,WINDIR:process.env.WINDIR,USERPROFILE:dir,APPDATA:dir,LOCALAPPDATA:dir,TEMP:dir,TMP:dir,RUST_LOG:'info' };
const report = { classification:'OFFICIAL_GENESIS_LOCAL_VALIDATOR_RUNTIME_ATTEMPT_NO_PUBLIC_BOOTSTRAP',phase:'preparing',pins,commands:[],faucetStarted:false,hostSecurityChanged:false,wslRetried:false };
let child, diagnostic='';
const redact = s => s.replaceAll(dir,'[OWN_SCRATCH]');
try {
  const binaries={}; for(const [name,[path,hash]] of Object.entries(pins)) binaries[name]=await pinnedBinary('agave-v4.3.0-portable/'+path,hash);
  const exec=(name,args,{secretOutput=false}={})=>{
    const r=spawnSync(binaries[name],args,{cwd:dir,env,windowsHide:true,encoding:'utf8',timeout:45000,maxBuffer:1024*1024});
    report.commands.push({binary:pins[name][0],args:args.map(redact),exitCode:r.status,...(!secretOutput ? {stdout:redact(r.stdout||'').slice(-6000),stderr:redact(r.stderr||'').slice(-4000)}:{outputOmitted:'disposable key creation'})});
    assert.equal(r.error,undefined); assert.equal(r.signal,null); assert.equal(r.status,0,name+' command failed');return r.stdout.trim();
  };
  const files={},pubkeys={};
  for(const role of ['identity','vote','stake','solver','recipient']){
    files[role]=join(dir,role+'.json');exec('keygen',['new','--no-bip39-passphrase','--silent','--outfile',files[role]],{secretOutput:true});pubkeys[role]=exec('keygen',['pubkey',files[role]]);
  }
  const bls=exec('keygen',['bls_pubkey',files.identity]);
  const ledger=join(dir,'ledger');
  exec('genesis',['--ledger',ledger,'--bootstrap-validator',pubkeys.identity,pubkeys.vote,pubkeys.stake,'--bootstrap-validator-bls-pubkey',bls,'--cluster-type','development','--faucet-pubkey',pubkeys.solver,'--faucet-lamports','10000000000','--hashes-per-tick','sleep','--ticks-per-slot','16','--target-tick-duration','25','--slots-per-epoch','512','--inflation','none']);
  const rpcPort=await unusedLoopbackPort(),gossipPort=await unusedLoopbackPort();
  const endpoint=`http://127.0.0.1:${rpcPort}`;
  const args=['--identity',files.identity,'--vote-account',pubkeys.vote,'--ledger',ledger,'--bind-address','127.0.0.1','--rpc-bind-address','127.0.0.1','--rpc-port',String(rpcPort),'--gossip-port',String(gossipPort),'--dynamic-port-range','24000-24100','--gossip-validator',pubkeys.identity,'--repair-validator',pubkeys.identity,'--private-rpc','--full-rpc-api','--enable-rpc-transaction-history','--enable-extended-tx-metadata-storage','--no-genesis-fetch','--no-snapshot-fetch','--no-snapshots','--no-port-check','--allow-private-addr','--no-poh-speed-test','--no-wait-for-vote-to-start-leader','--rpc-threads','2','--rpc-blocking-threads','2','--rpc-pubsub-worker-threads','1','--unified-scheduler-handler-threads','2','--log','-'];
  report.validatorArgs=args.map(redact);report.publicKeys=pubkeys;
  child=spawn(binaries.validator,args,{cwd:dir,env,windowsHide:true,stdio:['ignore','ignore','pipe']});
  let spawnError;child.on('error',e=>{spawnError=e.code;});child.stderr.on('data',b=>{diagnostic=(diagnostic+b.toString()).slice(-24000);});
  report.phase='starting-validator';
  const rpc=(method,params=[])=>ownedRuntimeRpc(endpoint,method,params,{timeoutMs:1000});
  let ready=false;
  for(let i=0;i<180;i++){
    if(spawnError||child.exitCode!==null)throw new Error('SOLANA_VALIDATOR_EXITED:'+String(spawnError??child.exitCode));
    try{ready=await rpc('getHealth')==='ok';if(ready)break;}catch{}
    await sleep(250);
  }
  assert.ok(ready,'SOLANA_STARTUP_TIMEOUT');
  report.phase='runtime-ready';report.genesisHash=await rpc('getGenesisHash');report.version=await rpc('getVersion');report.clusterNodes=await rpc('getClusterNodes');
  for(const peer of report.clusterNodes){assert.equal(peer.pubkey,pubkeys.identity);for(const key of ['gossip','tpu','rpc'])if(peer[key])assert.ok(peer[key].startsWith('127.0.0.1:'));}
  const config=join(dir,'cli.yml');await writeFile(config,`json_rpc_url: ${endpoint}\nwebsocket_url: ws://127.0.0.1:${rpcPort+1}\nkeypair_path: ${JSON.stringify(files.solver)}\ncommitment: confirmed\n`);
  const before=(await rpc('getBalance',[pubkeys.recipient,{commitment:'confirmed'}])).value;
  const signature=exec('cli',['--config',config,'--url',endpoint,'--keypair',files.solver,'--commitment','confirmed','transfer',pubkeys.recipient,'0.003','--allow-unfunded-recipient','--output','json']);
  report.transfer=JSON.parse(signature);
  report.recipientBefore=before;report.recipientAfter=(await rpc('getBalance',[pubkeys.recipient,{commitment:'confirmed'}])).value;
  assert.equal(report.recipientAfter-before,3000000);report.phase='completed';
}catch(e){report.phase='blocked';report.failure={name:e.name,message:e.message};process.exitCode=1;}
finally{
  if(child)await stopOwnProcess({child});report.validatorExitCode=child?.exitCode;report.diagnostic=redact(diagnostic);
  await removeOwnScratch(dir);report.ownedProcessStopped=true;report.disposableKeysAndLedgerRemoved=true;
  await writeFile(join(projectRoot,'evidence/m10-solana-isolated.json'),JSON.stringify(report,null,2)+'\n');
}
console.log(JSON.stringify({phase:report.phase,failure:report.failure,genesisHash:report.genesisHash,recipientAfter:report.recipientAfter,diagnostic:report.diagnostic.slice(-3000)}));
