/** Exact public Jupiter/Orca wire, CPI and finalized accounting. No claim authority. */
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {base58Decode} from '../runtime/owned-solana-runtime.mjs';
import {JUPITER_ORCA_V1,quoteJupiterOrcaSolUsdcV1,validateJupiterOrcaFixtureTransactionV1,decodeJupiterSplTokenAccountV1,decodeJupiterSplMintV1} from '../dispatch/jupiter-orca-route-codec-v1.mjs';
const sha=value=>createHash('sha256').update(value).digest('hex');
const integer=value=>{assert.ok(Number.isSafeInteger(value)&&value>=0);return BigInt(value);};
function account(raw){assert.ok(raw&&Array.isArray(raw.data)&&raw.data[1]==='base64');const data=Buffer.from(raw.data[0],'base64');assert.equal(data.toString('base64'),raw.data[0]);return{...raw,data};}
export function validateJupiterOrcaSwapObservationV1(input){
 assert.equal(arguments.length,1);const {intent,nativeWire,genesis,status,transaction,block,finalizedSlot,beforeRows,afterAccounts,payerBefore}=input;
 const wire=validateJupiterOrcaFixtureTransactionV1(nativeWire,intent),keys=wire.keys,p=JUPITER_ORCA_V1;
 assert.equal(input.observedGenesis,genesis,'JUPITER_SWAP_GENESIS');
 assert.equal(status?.err,null);assert.equal(status.confirmationStatus,'finalized');assert.equal(status.slot,transaction?.slot);
 assert.ok(integer(finalizedSlot)>=integer(transaction.slot));assert.equal(transaction.meta?.err,null,'JUPITER_SWAP_TRANSACTION_FAILED');
 assert.deepEqual(transaction.transaction,[nativeWire,'base64'],'JUPITER_SWAP_ORIGINAL_TRANSACTION_BYTES');
 assert.ok(block&&integer(block.parentSlot)<integer(transaction.slot));base58Decode(block.blockhash,32);base58Decode(block.previousBlockhash,32);
 assert.equal(block.signatures.filter(value=>value===wire.signature).length,1,'JUPITER_SWAP_UNIQUE_CANONICAL_SIGNATURE');
 const meta=transaction.meta;assert.ok(Number.isSafeInteger(meta.fee)&&meta.fee>0);assert.equal(String(meta.fee),input.expectedFee,'JUPITER_SWAP_PREPARED_FEE');assert.equal(meta.preBalances.length,keys.length);assert.equal(meta.postBalances.length,keys.length);
 if(meta.loadedAddresses)assert.deepEqual(meta.loadedAddresses,{readonly:[],writable:[]});
 const index=address=>{const value=keys.indexOf(address);assert.ok(value>=0,'JUPITER_SWAP_ACCOUNT_KEY');return value;};
 assert.equal(BigInt(payerBefore),integer(meta.preBalances[index(intent.payer)]));
 assert.equal(integer(meta.preBalances[index(intent.payer)])-integer(meta.postBalances[index(intent.payer)]),BigInt(meta.fee),'JUPITER_SWAP_PAYER_FEE_ONLY');
 assert.equal(beforeRows.length,13);assert.equal(afterAccounts.value.length,13);assert.ok(integer(afterAccounts.context.slot)>=integer(transaction.slot));
 const tokenAddresses=[intent.source,intent.destination,p.reserveSol,p.reserveUsdc,p.poolFee],tokens=new Map(),updated=[];
 for(const [i,before] of beforeRows.entries()){
  const after=account(afterAccounts.value[i]);assert.equal(after.owner,before.owner);assert.equal(after.executable,before.executable);assert.equal(after.data.length,before.data.length);
  const at=keys.indexOf(before.address);if(at>=0){assert.equal(integer(meta.preBalances[at]),BigInt(before.lamports));assert.equal(integer(meta.postBalances[at]),integer(after.lamports));}
  if(tokenAddresses.includes(before.address)){
   const a=decodeJupiterSplTokenAccountV1(before.data),b=decodeJupiterSplTokenAccountV1(after.data),{amount:aa,...ra}=a,{amount:bb,...rb}=b;
   assert.deepEqual(ra,rb,'JUPITER_SWAP_TOKEN_AUTHORITY_UNCHANGED');assert.ok(before.data.subarray(0,64).equals(after.data.subarray(0,64))&&before.data.subarray(72).equals(after.data.subarray(72)));
   tokens.set(before.address,{before:a,after:b});
  }else if(before.address===p.poolMint){
   assert.ok(before.data.subarray(0,36).equals(after.data.subarray(0,36))&&before.data.subarray(44).equals(after.data.subarray(44)),'JUPITER_SWAP_LP_MINT_AUTHORITY');
  }else assert.ok(before.data.equals(after.data),'JUPITER_SWAP_IMMUTABLE_ACCOUNT_BYTES');
  updated.push({...before,lamports:String(after.lamports),data:after.data,dataSHA256:sha(after.data)});
 }
 const quote=quoteJupiterOrcaSolUsdcV1(tokens.get(p.reserveSol).before.amount,tokens.get(p.reserveUsdc).before.amount);
 assert.equal(intent.quotedOutput,quote.quotedOutput);assert.equal(intent.minimumOutput,quote.minimumOutput,'JUPITER_SWAP_FIXED_SLIPPAGE');
 assert.equal(tokens.get(intent.source).before.amount,p.amount);assert.equal(tokens.get(intent.destination).before.amount,'0');
 assert.equal(tokens.get(intent.source).before.owner,intent.payer);assert.equal(tokens.get(intent.destination).before.owner,intent.payer);
 const delta=address=>BigInt(tokens.get(address).after.amount)-BigInt(tokens.get(address).before.amount);
 const spent=-delta(intent.source),received=delta(intent.destination);
 assert.ok(spent>0n&&spent<=BigInt(p.amount),'JUPITER_SWAP_ACTUAL_INPUT_SPENT');assert.ok(received>=BigInt(intent.minimumOutput),'JUPITER_SWAP_MINIMUM_OUTPUT');
 assert.equal(delta(p.reserveSol),spent);assert.equal(delta(p.reserveUsdc),-received);assert.ok(delta(p.poolFee)>=0n);
 for(const address of [intent.source,p.reserveSol]){const before=beforeRows.find(row=>row.address===address),after=updated.find(row=>row.address===address);assert.equal(BigInt(after.lamports)-BigInt(before.lamports),delta(address),'JUPITER_SWAP_WRAPPED_SOL_LAMPORTS');}
 for(const row of updated)if(![intent.source,p.reserveSol].includes(row.address))assert.equal(row.lamports,beforeRows.find(before=>before.address===row.address).lamports,'JUPITER_SWAP_ACCOUNT_LAMPORTS_UNCHANGED');
 const lpBefore=decodeJupiterSplMintV1(beforeRows.find(row=>row.address===p.poolMint).data),lpAfter=decodeJupiterSplMintV1(updated.find(row=>row.address===p.poolMint).data);
 const minted=BigInt(lpAfter.supply)-BigInt(lpBefore.supply);assert.equal(minted,delta(p.poolFee),'JUPITER_SWAP_LP_FEE_AND_SUPPLY');
 const x=BigInt(tokens.get(p.reserveSol).before.amount),y=BigInt(tokens.get(p.reserveUsdc).before.amount);
 assert.ok((x+spent)*(y-received)>=x*y,'JUPITER_SWAP_RESERVE_INVARIANT');
 for(const field of ['preTokenBalances','postTokenBalances']){
  assert.equal(meta[field].length,5);const seen=new Set();
  for(const row of meta[field]){const address=keys[row.accountIndex];assert.ok(tokenAddresses.includes(address)&&!seen.has(address));seen.add(address);
   const expected=tokens.get(address)[field==='preTokenBalances'?'before':'after'];assert.equal(row.mint,expected.mint);assert.equal(row.owner,expected.owner);assert.equal(row.programId,p.tokenProgram);
   assert.equal(row.uiTokenAmount.amount,expected.amount);assert.equal(row.uiTokenAmount.decimals,row.mint===p.solMint?9:row.mint===p.usdcMint?6:lpBefore.decimals);
  }
 }
 assert.equal(meta.innerInstructions.length,1);assert.equal(meta.innerInstructions[0].index,1);
 const inner=meta.innerInstructions[0].instructions,orca=[],transfers=[],mints=[];
 for(const row of inner){
  const program=keys[row.programIdIndex];assert.ok([p.program,p.dex,p.tokenProgram].includes(program),'JUPITER_SWAP_UNEXPECTED_CPI_PROGRAM');
  const accounts=row.accounts.map(i=>{assert.ok(Number.isSafeInteger(i)&&i>=0&&i<keys.length);return keys[i];});
  if(program===p.dex){const data=base58Decode(row.data,17);assert.equal(data[0],1);assert.equal(data.readBigUInt64LE(1),BigInt(p.amount));assert.ok(data.readBigUInt64LE(9)<=received);
   assert.deepEqual(accounts,[p.pool,p.authority,intent.payer,intent.source,p.reserveSol,p.reserveUsdc,intent.destination,p.poolMint,p.poolFee,p.tokenProgram]);orca.push(row);
  }else if(program===p.tokenProgram){const data=base58Decode(row.data);if(data[0]===3){assert.equal(data.length,9);transfers.push({accounts,amount:data.readBigUInt64LE(1)});}
   else if(data[0]===7){assert.equal(data.length,9);mints.push({accounts,amount:data.readBigUInt64LE(1)});}else assert.fail('JUPITER_SWAP_UNEXPECTED_TOKEN_CPI');}
 }
 assert.equal(orca.length,1);assert.equal(transfers.length,2);assert.deepEqual(transfers.map(row=>row.accounts),[[intent.source,p.reserveSol,intent.payer],[p.reserveUsdc,intent.destination,p.authority]]);
 assert.deepEqual(transfers.map(row=>row.amount),[spent,received]);assert.equal(mints.length,minted>0n?1:0);
 if(mints.length){assert.deepEqual(mints[0].accounts,[p.poolMint,p.poolFee,p.authority]);assert.equal(mints[0].amount,minted);}
 assert.equal(meta.preBalances.reduce((sum,n)=>sum+integer(n),0n)-meta.postBalances.reduce((sum,n)=>sum+integer(n),0n),BigInt(meta.fee),'JUPITER_SWAP_NATIVE_BALANCE_CONSERVATION');
 return {status:'observed',signature:wire.signature,transactionSHA256:wire.transactionSHA256,messageSHA256:wire.messageSHA256,
  transactionSlot:String(transaction.slot),blockHash:block.blockhash,parentSlot:String(block.parentSlot),finalizedSlot:String(finalizedSlot),
  actualInputSpent:spent.toString(),actualOutputReceived:received.toString(),minimumOutput:intent.minimumOutput,feeLamports:String(meta.fee),
  lpFeeMinted:minted.toString(),orcaCPI:1,tokenTransfers:2,privateCreditEstablished:false,updatedRows:updated};
}
