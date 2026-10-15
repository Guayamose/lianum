/** One official compiler/stats process. No proof, keys or private witnesses. */
import assert from 'node:assert/strict';
import {compile,createFileManager} from '@noir-lang/noir_wasm';
import {Barretenberg,BackendType} from '@aztec/bb.js';
import {mkdirSync,readFileSync,writeFileSync} from 'node:fs';
import {gunzipSync} from 'node:zlib';
import {WALLET_PUBLIC_WORDS} from '@lianum/engine/wallet/notes/private-wallet-note-encoding';
import {root,hash,guard,verifyToolchain} from './resources.mjs';
const mode=process.argv[2];assert.ok(Object.hasOwn(WALLET_PUBLIC_WORDS,mode),'PC23_MODE');
mkdirSync(root+'.local/compiled',{recursive:true});const path=root+'.local/compiled/'+mode+'.compile.json';
const report={classification:'CIRCUIT_COMPILATION_AND_STATS_NOT_PROOF',mode,startedAt:new Date().toISOString(),target:'evm',maximumPages:32768,phase:'starting'};let api;
const save=()=>writeFileSync(path,JSON.stringify(report,null,2)+'\n');
const watchdog=setInterval(()=>{try{guard();}catch{process.exit(2);}},1000),timer=setTimeout(()=>process.exit(2),900000);
function countType(t){return t.kind==='array'?t.length*countType(t.type):1;}
globalThis.fetch=async()=>{throw Error('PC23_OFFLINE_COMPILE');};
try{report.resourcesBefore=guard();report.toolchain=verifyToolchain();report.phase='compiling';save();let t=performance.now();const {program}=await compile(createFileManager(root+'circuits/'+mode),undefined,()=>{});const params=program.abi.parameters.filter(p=>p.visibility==='public');report.publicInputWords=params.reduce((n,p)=>n+countType(p.type),0);assert.equal(report.publicInputWords,WALLET_PUBLIC_WORDS[mode]);report.publicParameters=params;report.compileMs=performance.now()-t;report.noirVersion=program.noir_version;report.sourceSHA256=hash(readFileSync(root+'circuits/'+mode+'/src/main.nr'));report.circuitSHA256=hash(Buffer.from(program.bytecode,'base64'));writeFileSync(root+'.local/compiled/'+mode+'.json',JSON.stringify(program));report.compiledFileSHA256=hash(readFileSync(root+'.local/compiled/'+mode+'.json'));report.phase='stats';save();guard();api=await Barretenberg.new({backend:BackendType.Wasm,threads:1,skipSrsInit:true,memory:{initial:37,maximum:32768}});t=performance.now();report.stats=await api.circuitStats({circuit:{name:mode,bytecode:gunzipSync(Buffer.from(program.bytecode,'base64')),verificationKey:new Uint8Array()},includeGatesPerOpcode:false,settings:{ipaAccumulation:false,oracleHashType:'keccak',disableZk:false,optimizedSolidityVerifier:false}});report.statsMs=performance.now()-t;assert.ok(report.stats.numGatesDyadic<=2097152,'PC23_EXISTING_SRS_TOO_SMALL');report.phase='completed';}
catch(error){report.failedPhase=report.phase;report.phase='failed';report.failure={name:error.name,message:error.message};process.exitCode=1;}
finally{clearInterval(watchdog);clearTimeout(timer);if(api)await api.destroy();report.resourcesAfter=guard();report.resourceUsage=process.resourceUsage();report.completedAt=new Date().toISOString();save();console.log(JSON.stringify(report));}
