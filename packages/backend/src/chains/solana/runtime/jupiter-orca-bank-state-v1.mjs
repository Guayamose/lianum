/** Public bank material/observation only. No send, claim or private-note authority. */
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {JUPITER_OFFICIAL_FILES_V1,JUPITER_OFFICIAL_COMMIT_V1} from '../../../operations/deployments/defi/jupiter-official-material-v1.mjs';
import {base58Decode} from './solana-base58.mjs';
import {JUPITER_ORCA_V1,decodeOfficialJupiterBincodeAccountV1,decodeJupiterSplTokenAccountV1,
  decodeJupiterSplMintV1,validateOfficialJupiterOrcaPoolV1} from '../dispatch/jupiter-orca-route-codec-v1.mjs';
const sha=value=>createHash('sha256').update(value).digest('hex');
const LOADER='BPFLoader2111111111111111111111111111111111';
export const JUPITER_TOKEN_PROGRAMDATA_V1='3gvYRKWyXRR9xKWe1ZjPhLY5ZJRN7KDB4rFZFGoJfFk2';
const UPGRADEABLE='BPFLoaderUpgradeab1e11111111111111111111111';
export const JUPITER_BANK_RENT_V1='SysvarRent111111111111111111111111111111111';
export const JUPITER_BANK_CLOCK_V1='SysvarC1ock11111111111111111111111111111111';
const SYSVAR='Sysvar1111111111111111111111111111111111111';
const prefix='jupiter-core/tests/fixtures/accounts/'+JUPITER_ORCA_V1.pool+'/';
const snapshotAddresses=Object.freeze([JUPITER_ORCA_V1.reserveUsdc,JUPITER_ORCA_V1.poolFee,JUPITER_ORCA_V1.reserveSol,
  JUPITER_ORCA_V1.poolMint,JUPITER_ORCA_V1.pool,JUPITER_ORCA_V1.usdcMint,JUPITER_ORCA_V1.authority,
  JUPITER_ORCA_V1.solMint,JUPITER_ORCA_V1.tokenProgram]);
function pinned(material,path){
 const row=JUPITER_OFFICIAL_FILES_V1.find(value=>value.path===path),raw=material.files.get(path);
 assert.ok(row&&Buffer.isBuffer(raw),'JUPITER_BANK_FIXED_MATERIAL');assert.equal(raw.length,row.bytes);
 assert.equal(sha(raw),row.sha256,'JUPITER_BANK_INPUT_PIN');return raw;
}
function rpcAccount(address,account,origin){
 assert.ok(Number.isSafeInteger(Number(account.lamports))&&BigInt(account.lamports)>=0n,'JUPITER_BANK_SAFE_LAMPORTS');
 assert.ok(Number.isSafeInteger(Number(account.rentEpoch))&&BigInt(account.rentEpoch)>=0n,'JUPITER_BANK_SAFE_GENESIS_RENT_EPOCH');
 return Object.freeze({address,owner:account.owner,lamports:account.lamports,executable:account.executable,
  data:Buffer.from(account.data),dataSHA256:sha(account.data),origin,
  json:Object.freeze({pubkey:address,account:{lamports:Number(account.lamports),owner:account.owner,
    executable:account.executable,rentEpoch:Number(account.rentEpoch),space:account.data.length,
    data:[account.data.toString('base64'),'base64']}})});
}
/** Agave v2.3.13 --bpf-program is a V3 upgradeable genesis load, not an
 * executable --account snapshot. Extract only the pinned original Token ELF;
 * validate both loader accounts and rent derived by the original genesis. */
export function jupiterExplicitTokenProgramV1(material){
 assert.equal(arguments.length,1);assert.equal(material.commit,JUPITER_OFFICIAL_COMMIT_V1);
 const path=prefix+JUPITER_ORCA_V1.tokenProgram+'.bin',raw=pinned(material,path),snapshot=decodeOfficialJupiterBincodeAccountV1(raw);
 assert.equal(snapshot.owner,LOADER);assert.equal(snapshot.executable,true);const elf=snapshot.data;
 assert.equal(elf.length,134080);assert.equal(elf.subarray(0,4).toString('hex'),'7f454c46');assert.equal(elf[4],2);assert.equal(elf[5],1);assert.equal(elf.readUInt16LE(18),247);
 // Fixed canonical PDA: original Agave derives this same address during genesis.
 assert.equal(sha(Buffer.concat([base58Decode(JUPITER_ORCA_V1.tokenProgram,32),Buffer.from([254]),base58Decode(UPGRADEABLE,32),Buffer.from('ProgramDerivedAddress')])),base58Decode(JUPITER_TOKEN_PROGRAMDATA_V1,32).toString('hex'),'JUPITER_TOKEN_PROGRAMDATA_PDA');
 const program=Buffer.alloc(36);program.writeUInt32LE(2);base58Decode(JUPITER_TOKEN_PROGRAMDATA_V1,32).copy(program,4);
 const programData=Buffer.alloc(45+elf.length);programData.writeUInt32LE(3);programData.writeBigUInt64LE(0n,4);programData[12]=1;elf.copy(programData,45);
 // Genesis predicts Rent::default(); acceptance below derives rent again from
 // the native Rent sysvar in the same finalized account/Clock response.
 const rent=size=>String((128+size)*3480*2);
 const origin={classification:'OFFICIAL_PINNED_TOKEN_ELF_EXPLICIT_AGAVE_V2_3_13_GENESIS',path,rawSHA256:sha(raw),elfSHA256:sha(elf),loader:UPGRADEABLE,programDataAddress:JUPITER_TOKEN_PROGRAMDATA_V1};
 return {elf:Buffer.from(elf),program:rpcAccount(JUPITER_ORCA_V1.tokenProgram,{owner:UPGRADEABLE,lamports:rent(program.length),executable:true,rentEpoch:'0',data:program},origin),
  programData:rpcAccount(JUPITER_TOKEN_PROGRAMDATA_V1,{owner:UPGRADEABLE,lamports:rent(programData.length),executable:false,rentEpoch:'0',data:programData},origin)};
}
function freshToken(mint,owner,native){
 const data=Buffer.alloc(165);base58Decode(mint,32).copy(data);base58Decode(owner,32).copy(data,32);
 data[108]=1;if(native){data.writeBigUInt64LE(BigInt(JUPITER_ORCA_V1.amount),64);data.writeUInt32LE(1,109);data.writeBigUInt64LE(BigInt(JUPITER_ORCA_V1.tokenRent),113);}
 return {owner:JUPITER_ORCA_V1.tokenProgram,lamports:(BigInt(JUPITER_ORCA_V1.tokenRent)+(native?BigInt(JUPITER_ORCA_V1.amount):0n)).toString(),
  executable:false,rentEpoch:'0',data};
}
/** Pure construction from pinned public bytes + fresh public account names.
 * Runtime authority is created only by the fixed original factory. */
export function jupiterPublicBankGenesisV1(material,payer,source,destination){
 assert.equal(arguments.length,4);for(const key of [payer,source,destination])base58Decode(key,32);
 assert.equal(new Set([payer,source,destination,...snapshotAddresses,JUPITER_ORCA_V1.program,JUPITER_ORCA_V1.dex]).size,14,'JUPITER_BANK_DISTINCT_ADDRESSES');
 assert.equal(material.commit,JUPITER_OFFICIAL_COMMIT_V1);
 const explicitToken=jupiterExplicitTokenProgramV1(material);
 const rows=snapshotAddresses.map(address=>{
  if(address===JUPITER_ORCA_V1.tokenProgram)return explicitToken.program;
  const raw=pinned(material,prefix+address+'.bin'),account=decodeOfficialJupiterBincodeAccountV1(raw);
  assert.equal(account.owner,address===JUPITER_ORCA_V1.pool?JUPITER_ORCA_V1.dex:
    address===JUPITER_ORCA_V1.authority?'11111111111111111111111111111111':
    address===JUPITER_ORCA_V1.tokenProgram?LOADER:JUPITER_ORCA_V1.tokenProgram,'JUPITER_SNAPSHOT_ACCOUNT_OWNER');
  assert.equal(account.executable,address===JUPITER_ORCA_V1.tokenProgram,'JUPITER_SNAPSHOT_EXECUTABLE');
  return rpcAccount(address,account,{classification:'OFFICIAL_PUBLIC_ACCOUNT_SNAPSHOT',path:prefix+address+'.bin',rawSHA256:sha(raw)});
 });
 const find=address=>rows.find(row=>row.address===address);validateOfficialJupiterOrcaPoolV1(find(JUPITER_ORCA_V1.pool).data);
 for(const [address,mint] of [[JUPITER_ORCA_V1.reserveSol,JUPITER_ORCA_V1.solMint],[JUPITER_ORCA_V1.reserveUsdc,JUPITER_ORCA_V1.usdcMint]]){
  const token=decodeJupiterSplTokenAccountV1(find(address).data);assert.equal(token.mint,mint);assert.equal(token.owner,JUPITER_ORCA_V1.authority);assert.ok(BigInt(token.amount)>0n);
 }
 assert.equal(decodeJupiterSplTokenAccountV1(find(JUPITER_ORCA_V1.poolFee).data).mint,JUPITER_ORCA_V1.poolMint);
 assert.equal(decodeJupiterSplMintV1(find(JUPITER_ORCA_V1.solMint).data).decimals,9);
 assert.equal(decodeJupiterSplMintV1(find(JUPITER_ORCA_V1.usdcMint).data).decimals,6);
 for(const [address,name] of [[JUPITER_ORCA_V1.program,'jupiter_v6.so'],[JUPITER_ORCA_V1.dex,'orca_v2.so']]){
  const path='jupiter-core/tests/fixtures/'+name,data=pinned(material,path);
  rows.push(rpcAccount(address,{owner:LOADER,lamports:'10000000000',executable:true,rentEpoch:'0',data},
   {classification:'OFFICIAL_PUBLIC_PROGRAM_SNAPSHOT_NOT_LOCAL_BUILD',path,rawSHA256:sha(data)}));
 }
 rows.push(rpcAccount(source,freshToken(JUPITER_ORCA_V1.solMint,payer,true),{classification:'SYNTHETIC_PUBLIC_SOLVER_LIQUIDITY_NOT_PRIVATE_BACKING'}));
 rows.push(rpcAccount(destination,freshToken(JUPITER_ORCA_V1.usdcMint,payer,false),{classification:'SYNTHETIC_PUBLIC_SOLVER_DESTINATION_NOT_PRIVATE_NOTE'}));
 assert.equal(rows.length,13);assert.equal(new Set(rows.map(row=>row.address)).size,13);
 assert.ok(!rows.some(row=>row.address===JUPITER_BANK_CLOCK_V1),'JUPITER_OLD_CLOCK_SNAPSHOT_FORBIDDEN');
 return rows;
}
function decodedRPC(value){
 assert.ok(value&&typeof value==='object'&&!Array.isArray(value),'JUPITER_BANK_RPC_ACCOUNT');
 assert.ok(Array.isArray(value.data)&&value.data.length===2&&value.data[1]==='base64');
 assert.equal(typeof value.data[0],'string');const data=Buffer.from(value.data[0],'base64');assert.equal(data.toString('base64'),value.data[0]);
 assert.ok(Number.isSafeInteger(value.lamports)&&value.lamports>=0);assert.equal(typeof value.executable,'boolean');
 return {data,owner:value.owner,lamports:String(value.lamports),executable:value.executable};
}
/** Account bytes observed in this bank, not inferred from args, IDL or a quote.
 * Clock must originate from the observed native slot; the old snapshot is never loaded. */
export function validateJupiterPublicBankAccountsV1(rows,response,tokenProgram=null){
 assert.ok(arguments.length===2||arguments.length===3);assert.equal(rows.length,13);assert.ok(Number.isSafeInteger(response?.context?.slot)&&response.context.slot>=0);
 assert.ok(Array.isArray(response.value));assert.equal(response.value.length,tokenProgram?16:14);
 const observations=rows.map((expected,index)=>{
  const actual=decodedRPC(response.value[index]);assert.equal(actual.owner,expected.owner,'JUPITER_BANK_OBSERVED_OWNER');
  assert.equal(actual.executable,expected.executable,'JUPITER_BANK_OBSERVED_EXECUTABLE');
  assert.equal(actual.lamports,expected.lamports,'JUPITER_BANK_OBSERVED_LAMPORTS');
  assert.equal(sha(actual.data),expected.dataSHA256,'JUPITER_BANK_OBSERVED_DATA_PIN');assert.equal(actual.data.length,expected.data.length);
  return {address:expected.address,owner:actual.owner,executable:actual.executable,lamports:actual.lamports,
    dataBytes:actual.data.length,dataSHA256:sha(actual.data),origin:expected.origin};
 });
 const clock=decodedRPC(response.value[13]);assert.equal(clock.owner,SYSVAR);assert.equal(clock.executable,false);assert.equal(clock.data.length,40);
 assert.equal(clock.data.readBigUInt64LE(0),BigInt(response.context.slot),'JUPITER_BANK_NATIVE_CLOCK_SLOT');
 let tokenProgramData=null;
 if(tokenProgram){
  const expected=tokenProgram.programData,actual=decodedRPC(response.value[14]),rent=decodedRPC(response.value[15]);
  assert.equal(rent.owner,SYSVAR);assert.equal(rent.executable,false);assert.equal(rent.data.length,17);
  const perByte=rent.data.readBigUInt64LE(0),threshold=rent.data.readDoubleLE(8),burn=rent.data[16];
  assert.ok(perByte>0n&&perByte<=BigInt(Number.MAX_SAFE_INTEGER));assert.ok(Number.isFinite(threshold)&&threshold>0);assert.ok(burn<=100);
  const minimum=size=>{const value=Number(BigInt(128+size)*perByte)*threshold;assert.ok(Number.isFinite(value)&&value>=0&&value<=Number.MAX_SAFE_INTEGER);return String(Math.max(1,Math.floor(value)));};
  assert.equal(tokenProgram.program.lamports,minimum(tokenProgram.program.data.length),'JUPITER_TOKEN_PROGRAM_NATIVE_RENT');
  assert.equal(actual.lamports,minimum(actual.data.length),'JUPITER_TOKEN_PROGRAMDATA_NATIVE_RENT');
  assert.equal(expected.address,JUPITER_TOKEN_PROGRAMDATA_V1);assert.equal(actual.owner,UPGRADEABLE,'JUPITER_TOKEN_PROGRAMDATA_OWNER');
  assert.equal(actual.executable,false);assert.equal(actual.lamports,expected.lamports,'JUPITER_TOKEN_PROGRAMDATA_RENT');
  assert.equal(actual.data.length,expected.data.length);assert.equal(sha(actual.data),expected.dataSHA256,'JUPITER_TOKEN_PROGRAMDATA_ELF_PIN');
  assert.equal(actual.data.readUInt32LE(0),3);assert.equal(actual.data.readBigUInt64LE(4),0n);assert.equal(actual.data[12],1);assert.equal(actual.data.subarray(13,45).toString('hex'),'0'.repeat(64));
  const token=rows.find(row=>row.address===JUPITER_ORCA_V1.tokenProgram);assert.ok(token);assert.equal(token.owner,UPGRADEABLE);assert.equal(token.data.readUInt32LE(0),2);assert.equal(base58Decode(expected.address,32).toString('hex'),token.data.subarray(4).toString('hex'));
  tokenProgramData={address:expected.address,owner:actual.owner,lamports:actual.lamports,dataBytes:actual.data.length,dataSHA256:sha(actual.data),elfSHA256:sha(actual.data.subarray(45)),slot:'0',authority:'0'.repeat(64),authorityOption:'Some',loadedBy:'ORIGINAL_AGAVE_BPF_PROGRAM_FLAG',nativeRent:{address:JUPITER_BANK_RENT_V1,contextSlot:String(response.context.slot),dataSHA256:sha(rent.data),lamportsPerByteYear:perByte.toString(),exemptionThreshold:threshold,burnPercent:burn}};
 }
 return {slot:String(response.context.slot),accounts:observations,...(tokenProgramData?{tokenProgramData}:{}),nativeClock:{address:JUPITER_BANK_CLOCK_V1,
  slot:clock.data.readBigUInt64LE(0).toString(),epoch:clock.data.readBigUInt64LE(16).toString(),
  unixTimestamp:clock.data.readBigInt64LE(32).toString(),loadedFromSnapshot:false},
  programBytesObserved:true,privateCreditEstablished:false,swapExecutionEstablished:false};
}
