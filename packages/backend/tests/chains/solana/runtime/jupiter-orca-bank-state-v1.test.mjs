/** Synthetic observation metadata only; no validator, program execution or note. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {loadJupiterOfficialMaterialV1} from '../../../../src/operations/deployments/defi/jupiter-official-material-v1.mjs';
import {JUPITER_ORCA_V1} from '../../../../src/chains/solana/dispatch/jupiter-orca-route-codec-v1.mjs';
import {validateJupiterPublicBankAccountsV1,jupiterExplicitTokenProgramV1,jupiterNativeWsolMintV1,JUPITER_TOKEN_PROGRAMDATA_V1} from '../../../../src/chains/solana/runtime/jupiter-orca-bank-state-v1.mjs';
import {createOwnedJupiterPublicBankV1,assertOwnedJupiterPublicBankV1} from '../../../../src/chains/solana/runtime/owned-solana-runtime.mjs';
const sha=value=>createHash('sha256').update(value).digest('hex');
function sample(){
 const rows=Array.from({length:13},(_,n)=>{const data=Buffer.from([n,1,2]);return{address:'synthetic-'+n,
  owner:'BPFLoader2111111111111111111111111111111111',lamports:'10000000',executable:n<3,
  data,dataSHA256:sha(data),origin:{classification:'SYNTHETIC_HOST_METADATA_ONLY'}};});
 const clock=Buffer.alloc(40);clock.writeBigUInt64LE(80n,0);clock.writeBigInt64LE(123n,32);
 const response={context:{slot:80},value:[...rows.map(row=>({owner:row.owner,lamports:Number(row.lamports),
  executable:row.executable,data:[row.data.toString('base64'),'base64']})),
  {owner:'Sysvar1111111111111111111111111111111111111',lamports:1169280,executable:false,data:[clock.toString('base64'),'base64']}]};
 return {rows,response};
}
test('bank metadata joins every program/account byte and native clock to its observed slot',()=>{
 const {rows,response}=sample(),observed=validateJupiterPublicBankAccountsV1(rows,response);
 assert.equal(observed.accounts.length,13);assert.equal(observed.slot,'80');assert.equal(observed.nativeClock.slot,'80');
 assert.equal(observed.nativeClock.loadedFromSnapshot,false);assert.equal(observed.privateCreditEstablished,false);assert.equal(observed.swapExecutionEstablished,false);
 for(const mutate of [x=>x.value[0].data[0]=Buffer.from([0,1,3]).toString('base64'),x=>x.value[1].owner='11111111111111111111111111111111',
   x=>x.value[2].executable=false,x=>x.value[3].lamports++,x=>x.context.slot++,x=>x.value.pop()]){
  const bad=structuredClone(response);mutate(bad);assert.throws(()=>validateJupiterPublicBankAccountsV1(rows,bad));
 }
});
test('fixed bank rejects caller options before any material/native load and has a separate brand',async()=>{
 await assert.rejects(createOwnedJupiterPublicBankV1({endpoint:'synthetic-invalid'}),/JUPITER_BANK_NO_OPTIONS/);
 assert.throws(()=>assertOwnedJupiterPublicBankV1({metadata:{classification:'OWNED_JUPITER_ORCA_PUBLIC_BANK_V1'}}),/ORIGINAL_JUPITER_PUBLIC_BANK_REQUIRED/);
});

test('explicit Tokenkeg loader joins original ELF and both V3 loader accounts; builtin drift rejects',()=>{
 const material=loadJupiterOfficialMaterialV1(),token=jupiterExplicitTokenProgramV1(material),{rows,response}=sample();
 rows[8]=token.program;response.value[8]={owner:token.program.owner,lamports:Number(token.program.lamports),executable:true,data:[token.program.data.toString('base64'),'base64']};
 const rent=Buffer.alloc(17);rent.writeBigUInt64LE(3480n);rent.writeDoubleLE(2,8);rent[16]=50;
 response.value.push({owner:token.programData.owner,lamports:Number(token.programData.lamports),executable:false,data:[token.programData.data.toString('base64'),'base64']},{owner:'Sysvar1111111111111111111111111111111111111',lamports:1002240,executable:false,data:[rent.toString('base64'),'base64']});
 const got=validateJupiterPublicBankAccountsV1(rows,response,token);assert.equal(got.tokenProgramData.address,JUPITER_TOKEN_PROGRAMDATA_V1);assert.equal(got.tokenProgramData.elfSHA256,token.program.origin.elfSHA256);assert.equal(got.tokenProgramData.dataBytes,134125);assert.equal(got.tokenProgramData.authority,'0'.repeat(64));assert.equal(got.tokenProgramData.slot,'0');assert.equal(got.tokenProgramData.nativeRent.contextSlot,'80');assert.equal(got.tokenProgramData.nativeRent.lamportsPerByteYear,'3480');
 for(const mutate of [x=>x.value[8].lamports=1000000000,x=>x.value[8].owner='BPFLoader2111111111111111111111111111111111',x=>{const data=Buffer.from(x.value[14].data[0],'base64');data[45]^=1;x.value[14].data[0]=data.toString('base64');},x=>{const data=Buffer.from(x.value[14].data[0],'base64');data[13]=1;x.value[14].data[0]=data.toString('base64');},x=>{const data=Buffer.from(x.value[14].data[0],'base64');data.writeBigUInt64LE(1n,4);x.value[14].data[0]=data.toString('base64');},x=>{const data=Buffer.from(x.value[15].data[0],'base64');data.writeDoubleLE(3,8);x.value[15].data[0]=data.toString('base64');},x=>x.value[15].owner='11111111111111111111111111111111']){
  const bad=structuredClone(response);mutate(bad);assert.throws(()=>validateJupiterPublicBankAccountsV1(rows,bad,token));
 }
 assert.equal(token.program.address,JUPITER_ORCA_V1.tokenProgram);assert.equal(token.program.lamports,'1141440');assert.equal(token.programData.lamports,'934400880');
});

// Pure native mint metadata, not a validator/Token execution or private credit.
test('WSOL mint uses exact Agave genesis bytes and balance while retaining snapshot provenance',()=>{
 const mint=jupiterNativeWsolMintV1(loadJupiterOfficialMaterialV1()),{rows,response}=sample();
 assert.equal(mint.origin.classification,'NATIVE_GENESIS_NOT_SNAPSHOT');assert.equal(mint.owner,JUPITER_ORCA_V1.tokenProgram);assert.equal(mint.lamports,'1000000000');assert.equal(mint.data.length,82);assert.equal(mint.data[44],9);assert.equal(mint.data[45],1);assert.equal(mint.data.readBigUInt64LE(36),0n);assert.equal(mint.data.readUInt32LE(0),0);assert.equal(mint.data.readUInt32LE(46),0);
 rows[7]=mint;response.value[7]={owner:mint.owner,lamports:Number(mint.lamports),executable:false,data:[mint.data.toString('base64'),'base64']};
 assert.equal(validateJupiterPublicBankAccountsV1(rows,response).accounts[7].dataSHA256,mint.dataSHA256);
 const wrongBalance=structuredClone(response);wrongBalance.value[7].lamports=165690819597;assert.throws(()=>validateJupiterPublicBankAccountsV1(rows,wrongBalance),/JUPITER_BANK_OBSERVED_LAMPORTS:So111/);
 const wrongSupply=structuredClone(response),bytes=Buffer.from(wrongSupply.value[7].data[0],'base64');bytes.writeBigUInt64LE(1n,36);wrongSupply.value[7].data[0]=bytes.toString('base64');assert.throws(()=>validateJupiterPublicBankAccountsV1(rows,wrongSupply),/JUPITER_BANK_OBSERVED_DATA_PIN/);
});
