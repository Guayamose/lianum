import { compile,createFileManager } from '@noir-lang/noir_wasm';
import {Barretenberg,BackendType} from '@aztec/bb.js';
import{mkdirSync,readFileSync,writeFileSync}from'node:fs';
import{fileURLToPath}from'node:url';
import{gunzipSync}from'node:zlib';
import{sha256}from'@lianum/engine/notes/private-note-encoding';
const root=fileURLToPath(new URL('.',import.meta.url));globalThis.fetch=async()=>{throw Error('PC15_NOTES_OFFLINE_COMPILE');};mkdirSync(root+'.local/compiled',{recursive:true});
const evidence={classification:'CIRCUIT_COMPILATION_AND_STATS_NOT_PROOF',node:process.version,records:[]};const save=()=>writeFileSync(root+'../../../evidence/m15-notes-compile.json',JSON.stringify(evidence,null,2)+'\n');
const names=process.argv.slice(2);const chosen=names.length?names:['reserve','fulfill','refund','withdraw','sol_ready','btc_ready'];
for(const name of chosen){try{let t=performance.now();const r=await compile(createFileManager(root+'circuits/'+name),undefined,console.log);writeFileSync(root+'.local/compiled/'+name+'.json',JSON.stringify(r.program));evidence.records.push({name,compileMs:performance.now()-t,sourceSHA256:sha256(readFileSync(root+'circuits/'+name+'/src/main.nr')).toString('hex'),noirVersion:r.program.noir_version,abi:r.program.abi});save();}catch(e){evidence.failure={name,message:e.message};save();throw e;}}
const api=await Barretenberg.new({backend:BackendType.Wasm,threads:1,skipSrsInit:true,memory:{initial:37,maximum:32768}});try{for(const record of evidence.records){const p=JSON.parse(readFileSync(root+'.local/compiled/'+record.name+'.json'));record.stats=await api.circuitStats({circuit:{name:record.name,bytecode:gunzipSync(Buffer.from(p.bytecode,'base64')),verificationKey:new Uint8Array()},includeGatesPerOpcode:true,settings:{ipaAccumulation:false,oracleHashType:'keccak',disableZk:false,optimizedSolidityVerifier:false}});console.log(JSON.stringify({name:record.name,stats:record.stats,resourceUsage:process.resourceUsage()}));save();}}finally{await api.destroy();evidence.resourceUsage=process.resourceUsage();save();}
