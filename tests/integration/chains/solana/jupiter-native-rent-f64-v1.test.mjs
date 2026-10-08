/** Pure Rent representation regression; no runtime, network, signatures or native authority. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {base58Decode} from '../../../../packages/backend/src/chains/solana/runtime/solana-base58.mjs';
import {JUPITER_ORCA_V1} from '../../../../packages/backend/src/chains/solana/dispatch/jupiter-orca-route-codec-v1.mjs';
import {validateJupiterPublicBankAccountsV1,JUPITER_TOKEN_PROGRAMDATA_V1} from '../../../../packages/backend/src/chains/solana/runtime/jupiter-orca-bank-state-v1.mjs';
const sha=v=>createHash('sha256').update(v).digest('hex');
const loader='BPFLoaderUpgradeab1e11111111111111111111111',sysvar='Sysvar1111111111111111111111111111111111111';
const account=(data,owner,lamports,executable=false)=>({data:[data.toString('base64'),'base64'],owner,lamports,executable});
test('native finite nonintegral f64 keeps exact original eight bytes in integer-only metadata',()=>{
 const threshold=2.5, perByte=10n, minimum=n=>String(Math.max(1,Math.floor(Number(BigInt(128+n)*perByte)*threshold)));
 const data=Buffer.alloc(49);data.writeUInt32LE(3);data[12]=1;data.fill(0xab,45);
 const program=Buffer.alloc(36);program.writeUInt32LE(2);base58Decode(JUPITER_TOKEN_PROGRAMDATA_V1,32).copy(program,4);
 const rows=Array.from({length:13},(_,i)=>({address:'pure-host-'+i,owner:'11111111111111111111111111111111',lamports:'1',executable:false,data:Buffer.alloc(0),dataSHA256:sha(Buffer.alloc(0))}));
 rows[0]={address:JUPITER_ORCA_V1.tokenProgram,owner:loader,lamports:minimum(36),executable:true,data:program,dataSHA256:sha(program)};
 const clock=Buffer.alloc(40);clock.writeBigUInt64LE(8n);const rent=Buffer.alloc(17);rent.writeBigUInt64LE(perByte);rent.writeDoubleLE(threshold,8);rent[16]=50;
 const token={program:rows[0],programData:{address:JUPITER_TOKEN_PROGRAMDATA_V1,owner:loader,lamports:minimum(data.length),data,dataSHA256:sha(data)}};
 const response={context:{slot:8},value:[...rows.map(r=>account(r.data,r.owner,Number(r.lamports),r.executable)),account(clock,sysvar,1),account(data,loader,Number(token.programData.lamports)),account(rent,sysvar,1)]};
 const actual=validateJupiterPublicBankAccountsV1(rows,response,token);
 assert.equal(actual.tokenProgramData.nativeRent.exemptionThresholdIEEE754LE,rent.subarray(8,16).toString('hex'));
 assert.equal(Buffer.from(actual.tokenProgramData.nativeRent.exemptionThresholdIEEE754LE,'hex').readDoubleLE(),threshold);
 assert.equal(Object.hasOwn(actual.tokenProgramData.nativeRent,'exemptionThreshold'),false);
 function integerMetadata(value){if(typeof value==='number')assert.ok(Number.isSafeInteger(value));else if(value&&typeof value==='object')for(const item of Object.values(value))integerMetadata(item);}integerMetadata(actual);
 const invalid=Buffer.from(rent);invalid.writeDoubleLE(NaN,8);response.value[15]=account(invalid,sysvar,1);assert.throws(()=>validateJupiterPublicBankAccountsV1(rows,response,token));
});
