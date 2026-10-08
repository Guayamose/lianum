/** Public bank material/observation only. No send, claim or private-note authority. */
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {JUPITER_OFFICIAL_FILES_V1,JUPITER_OFFICIAL_COMMIT_V1} from '../../../operations/deployments/defi/jupiter-official-material-v1.mjs';
import {base58Decode} from './owned-solana-runtime.mjs';
import {JUPITER_ORCA_V1,decodeOfficialJupiterBincodeAccountV1,decodeJupiterSplTokenAccountV1,
  decodeJupiterSplMintV1,validateOfficialJupiterOrcaPoolV1} from '../dispatch/jupiter-orca-route-codec-v1.mjs';
const sha=value=>createHash('sha256').update(value).digest('hex');
const LOADER='BPFLoader2111111111111111111111111111111111';
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
 const rows=snapshotAddresses.map(address=>{
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
export function validateJupiterPublicBankAccountsV1(rows,response){
 assert.equal(arguments.length,2);assert.equal(rows.length,13);assert.ok(Number.isSafeInteger(response?.context?.slot)&&response.context.slot>=0);
 assert.ok(Array.isArray(response.value));assert.equal(response.value.length,14);
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
 return {slot:String(response.context.slot),accounts:observations,nativeClock:{address:JUPITER_BANK_CLOCK_V1,
  slot:clock.data.readBigUInt64LE(0).toString(),epoch:clock.data.readBigUInt64LE(16).toString(),
  unixTimestamp:clock.data.readBigInt64LE(32).toString(),loadedFromSnapshot:false},
  programBytesObserved:true,privateCreditEstablished:false,swapExecutionEstablished:false};
}
