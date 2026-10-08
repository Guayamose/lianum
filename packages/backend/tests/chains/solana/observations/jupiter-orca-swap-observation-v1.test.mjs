/** Host receipt metadata with genuine codec/signature + pinned public bytes.
 * These synthetic RPC tuples do not establish program/native/private acceptance. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {createPrivateKey,createPublicKey,sign} from 'node:crypto';
import {base58Encode} from '../../../../src/chains/solana/runtime/owned-solana-runtime.mjs';
import {loadJupiterOfficialMaterialV1} from '../../../../src/operations/deployments/defi/jupiter-official-material-v1.mjs';
import {jupiterPublicBankGenesisV1} from '../../../../src/chains/solana/runtime/jupiter-orca-bank-state-v1.mjs';
import {JUPITER_ORCA_V1,quoteJupiterOrcaSolUsdcV1,encodeJupiterOrcaFixtureMessageV1,decodeJupiterSplTokenAccountV1,decodeJupiterSplMintV1} from '../../../../src/chains/solana/dispatch/jupiter-orca-route-codec-v1.mjs';
import {validateJupiterOrcaSwapObservationV1} from '../../../../src/chains/solana/observations/jupiter-orca-swap-observation-v1.mjs';
function sample(){
 const p=JUPITER_ORCA_V1,key=createPrivateKey({key:Buffer.concat([Buffer.from('302e020100300506032b657004220420','hex'),Buffer.alloc(32,91)]),type:'pkcs8',format:'der'});
 const payer=base58Encode(createPublicKey(key).export({type:'spki',format:'der'}).subarray(-32)),source=base58Encode(Buffer.alloc(32,92)),destination=base58Encode(Buffer.alloc(32,93));
 const beforeRows=jupiterPublicBankGenesisV1(loadJupiterOfficialMaterialV1(),payer,source,destination),find=a=>beforeRows.find(row=>row.address===a);
 const quote=quoteJupiterOrcaSolUsdcV1(decodeJupiterSplTokenAccountV1(find(p.reserveSol).data).amount,decodeJupiterSplTokenAccountV1(find(p.reserveUsdc).data).amount);
 const intent={payer,source,destination,blockhash:base58Encode(Buffer.alloc(32,94)),quotedOutput:quote.quotedOutput,minimumOutput:quote.minimumOutput};
 const message=encodeJupiterOrcaFixtureMessageV1(payer,source,destination,intent.blockhash,intent.quotedOutput),signature=sign(null,message.message,key);
 const nativeWire=Buffer.concat([Buffer.from([1]),signature,message.message]).toString('base64'),signature58=base58Encode(signature),keys=message.keys;
 const index=a=>keys.indexOf(a),input=BigInt(p.amount),output=BigInt(quote.quotedOutput),minted=2n;
 const afterRows=beforeRows.map(row=>({...row,data:Buffer.from(row.data)}));
 const change=(a,n)=>{const row=afterRows.find(r=>r.address===a);row.data.writeBigUInt64LE(row.data.readBigUInt64LE(64)+n,64);};
 change(source,-input);change(destination,output);change(p.reserveSol,input);change(p.reserveUsdc,-output);change(p.poolFee,minted);
 const mint=afterRows.find(row=>row.address===p.poolMint);mint.data.writeBigUInt64LE(mint.data.readBigUInt64LE(36)+minted,36);
 for(const [a,n] of [[source,-input],[p.reserveSol,input]]){const row=afterRows.find(r=>r.address===a);row.lamports=(BigInt(row.lamports)+n).toString();}
 const tokenAddresses=[source,destination,p.reserveSol,p.reserveUsdc,p.poolFee],balances=rows=>tokenAddresses.map(a=>{
  const token=decodeJupiterSplTokenAccountV1(rows.find(row=>row.address===a).data);
  return {accountIndex:index(a),mint:token.mint,owner:token.owner,programId:p.tokenProgram,
   uiTokenAmount:{amount:token.amount,decimals:token.mint===p.solMint?9:token.mint===p.usdcMint?6:decodeJupiterSplMintV1(find(p.poolMint).data).decimals}};
 });
 const native=rows=>keys.map(a=>a===payer?1000000:Number(rows.find(row=>row.address===a)?.lamports??0));
 const preBalances=native(beforeRows),postBalances=native(afterRows);postBalances[index(payer)]-=5000;
 const instruction=(program,accounts,data)=>({programIdIndex:index(program),accounts:accounts.map(index),data:base58Encode(data)});
 const binary=(tag,a,b)=>{const data=Buffer.alloc(b===undefined?9:17);data[0]=tag;data.writeBigUInt64LE(a,1);if(b!==undefined)data.writeBigUInt64LE(b,9);return data;};
 const inner=[instruction(p.dex,[p.pool,p.authority,payer,source,p.reserveSol,p.reserveUsdc,destination,p.poolMint,p.poolFee,p.tokenProgram],binary(1,input,BigInt(intent.minimumOutput))),
  instruction(p.tokenProgram,[source,p.reserveSol,payer],binary(3,input)),instruction(p.tokenProgram,[p.reserveUsdc,destination,p.authority],binary(3,output)),
  instruction(p.tokenProgram,[p.poolMint,p.poolFee,p.authority],binary(7,minted))];
 const transaction={slot:81,transaction:[nativeWire,'base64'],meta:{err:null,fee:5000,preBalances,postBalances,preTokenBalances:balances(beforeRows),postTokenBalances:balances(afterRows),innerInstructions:[{index:1,instructions:inner}]}};
 return {intent,nativeWire,genesis:base58Encode(Buffer.alloc(32,95)),observedGenesis:base58Encode(Buffer.alloc(32,95)),
  status:{err:null,slot:81,confirmationStatus:'finalized'},transaction,
  block:{parentSlot:80,blockhash:base58Encode(Buffer.alloc(32,96)),previousBlockhash:base58Encode(Buffer.alloc(32,97)),signatures:[signature58]},
  finalizedSlot:82,beforeRows,payerBefore:'1000000',expectedFee:'5000',afterAccounts:{context:{slot:82},value:afterRows.map(row=>({owner:row.owner,executable:row.executable,lamports:Number(row.lamports),data:[row.data.toString('base64'),'base64']}))}};
}
test('exact signed wire joins finalized SPL effects, reserve state and real-shaped CPI; corrupt joins reject',()=>{
 const original=sample(),observed=validateJupiterOrcaSwapObservationV1(original);assert.equal(observed.orcaCPI,1);assert.equal(observed.tokenTransfers,2);
 assert.equal(observed.actualInputSpent,'10000000');assert.equal(observed.privateCreditEstablished,false);
 for(const mutate of [x=>x.intent.minimumOutput='1',x=>x.status.confirmationStatus='confirmed',x=>x.block.signatures=[],
  x=>x.transaction.meta.innerInstructions[0].instructions[1].accounts.reverse(),x=>x.transaction.meta.postTokenBalances[0].uiTokenAmount.amount='1',
  x=>x.transaction.meta.postBalances[0]++,x=>x.transaction.transaction[0]=Buffer.alloc(200).toString('base64'),
  x=>x.afterAccounts.value[0].owner='11111111111111111111111111111111']){
  const bad=sample();mutate(bad);assert.throws(()=>validateJupiterOrcaSwapObservationV1(bad));
 }
});
