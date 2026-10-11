/** Original-wire finality mechanics. Runtime ownership, in-flight mutation and
 * attempt identity remain in the calling runtime; this module issues no tokens. */
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {join} from 'node:path';
const freeze=value=>{if(value&&typeof value==='object'&&!Object.isFrozen(value)){Object.values(value).forEach(freeze);Object.freeze(value);}return value;};
const cloned=value=>freeze(structuredClone(value));
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const hex=value=>'0x'+BigInt(value).toString(16);
export async function confirmNativeValueOriginalFinalityV1(entry,{observed,mutation,clock,chain,records}) {
 const {rpc,block,mineAt,health,checkReceipt,assertCanonical}=chain;
 const {cwd,readFile,open}=records;
      mutation.assertOriginalRecord(entry);
      assert.equal(entry.phase,'mined');assert.equal(entry.receipt.status,'0x1');assert.equal(entry.finalityConfirmation,undefined,'NATIVE_VALUE_FINALITY_NO_RETRY');
      const original=cloned({prepared:entry.prepared,signed:entry.signed,receipt:entry.receipt,transactionHash:entry.transactionHash,gasUsed:entry.gasUsed});
      let started=clock.monotonicNow();const required=64,headers=[];
      const progress=entry.finalityConfirmation={phase:'confirming',requiredEmptyBlocks:required,confirmedEmptyBlocks:0,
        includedNumber:BigInt(original.receipt.blockNumber).toString(),includedTimestamp:null,tipNumber:null,tipTimestamp:null,finalizedNumber:null};
      entry.phase='mined-finality-pending';
      const guard=()=>{mutation.assertCurrent();
        if(observed)mutation.assertObservedWaitEntry(entry);
        assert.ok(clock.monotonicNow()-started<30000,'NATIVE_VALUE_ORIGINAL_FINALITY_TIMEOUT');
        assert.deepEqual({prepared:entry.prepared,signed:entry.signed,receipt:entry.receipt,transactionHash:entry.transactionHash,gasUsed:entry.gasUsed},original,
          'NATIVE_VALUE_FINALITY_ORIGINAL_BYTES_CHANGED');};
      const finalizedAt=async tip=>{
        guard();const finalized=await rpc('eth_getBlockByNumber',['finalized',false]);guard();
        assert.ok(finalized,'NATIVE_VALUE_ORIGINAL_FINALITY_UNAVAILABLE');
        const height=BigInt(tip.number)>64n?BigInt(tip.number)-64n:0n;
        assert.equal(BigInt(finalized.number),height,'NATIVE_VALUE_FINALITY_PINNED_EPOCH_POLICY');
        assert.deepEqual(await rpc('eth_getBlockByNumber',[hex(height),false]),finalized,'NATIVE_VALUE_FINALITY_CANONICAL_TAG');guard();
        return finalized;
      };
      try {
        guard();await checkReceipt(original.receipt);const included=await assertCanonical(original.receipt);guard();
        let tip=await block();assert.deepEqual(tip,included,'NATIVE_VALUE_FINALITY_ORIGINAL_TIP_REQUIRED');
        assert.equal(BigInt(included.number),BigInt(original.prepared.head.number)+1n);
        assert.equal(BigInt(included.timestamp),BigInt(original.prepared.head.timestamp)+1n);
        Object.assign(progress,{includedTimestamp:BigInt(included.timestamp).toString(),tipNumber:BigInt(tip.number).toString(),tipTimestamp:BigInt(tip.timestamp).toString()});
        let finalized=await finalizedAt(tip);progress.finalizedNumber=BigInt(finalized.number).toString();
        assert.ok(BigInt(finalized.number)<BigInt(included.number),'NATIVE_VALUE_FINALITY_INITIAL_TAG_CHANGED');
        for(let count=0;count<required;count++){
          if(observed){
            // No send authority is consulted, retained or renewed here. Wait
            // outside the audit, then perform a NEW bounded current audit of
            // this original entry before its next real empty descendant.
            await clock.waitSecond(clock.lastSecond()+1n,entry);
            started=clock.monotonicNow();await health();guard();
          }
          guard();assert.deepEqual(await block(),tip,'NATIVE_VALUE_FINALITY_TIP_CHANGED');
          const next=await mineAt(clock.lastSecond()+1n);guard();
          assert.equal(BigInt(next.number),BigInt(tip.number)+1n,'NATIVE_VALUE_FINALITY_CONTIGUOUS_HEIGHT');
          assert.equal(next.parentHash,tip.hash,'NATIVE_VALUE_FINALITY_ORIGINAL_ANCESTRY');
          assert.equal(BigInt(next.timestamp),BigInt(tip.timestamp)+1n,'NATIVE_VALUE_FINALITY_MONOTONIC_BLOCK_TIME');
          assert.deepEqual(next.transactions,[],'NATIVE_VALUE_FINALITY_EMPTY_BLOCKS_ONLY');
          headers.push(cloned(next));tip=next;
          Object.assign(progress,{confirmedEmptyBlocks:count+1,tipNumber:BigInt(tip.number).toString(),tipTimestamp:BigInt(tip.timestamp).toString()});
          finalized=await finalizedAt(tip);progress.finalizedNumber=BigInt(finalized.number).toString();
        }
        assert.deepEqual(finalized,included,'NATIVE_VALUE_FINALITY_ORIGINAL_INCLUSION_NOT_FINALIZED');
        await checkReceipt(original.receipt);assert.deepEqual(await assertCanonical(original.receipt),included);
        assert.deepEqual(await block(),tip,'NATIVE_VALUE_FINALITY_TIP_CHANGED');guard();
        const signedPath=join(cwd,'signed-'+original.transactionHash.slice(2)+'.json'),signedBytes=await readFile(signedPath);
        assert.deepEqual(JSON.parse(signedBytes),{schema:'OWNED_EVM_SIGNED_WIRE_V2',prepared:original.prepared,signed:original.signed},'NATIVE_VALUE_FINALITY_ORIGINAL_SIGNED_RECORD');
        const preparedPath=join(cwd,'native-value-prepared-'+original.prepared.binding.leaseId+'.json'),preparedBytes=await readFile(preparedPath);
        assert.deepEqual(JSON.parse(preparedBytes),{schema:'OWNED_EVM_NATIVE_VALUE_PREPARED_V1',prepared:original.prepared},'NATIVE_VALUE_FINALITY_ORIGINAL_PREPARATION');guard();
        const retained={schema:'OWNED_EVM_NATIVE_VALUE_ORIGINAL_FINALITY_V1',originalSignedRecordSHA256:sha(signedBytes),originalPreparedRecordSHA256:sha(preparedBytes),
          originalReceipt:original.receipt,originalIncludedHeader:included,confirmations:headers,actualFinalizedHeader:finalized,actualTip:tip,
          requiredEmptyBlocks:required,finalityTagAliased:false,epochPolicyChanged:false,sourceClockChanged:false,publicConsensusVerified:false};
        const path=join(cwd,'native-value-finality-'+original.transactionHash.slice(2)+'.json'),file=await open(path,'wx',0o600);
        try{await file.writeFile(JSON.stringify(retained)+'\n');await file.sync();}finally{await file.close();}
        const directory=await open(cwd,'r');try{await directory.sync();}finally{await directory.close();}
        assert.deepEqual(JSON.parse(await readFile(path,'utf8')),retained,'NATIVE_VALUE_FINALITY_DURABLE_READBACK');
        assert.equal(sha(await readFile(signedPath)),sha(signedBytes));assert.equal(sha(await readFile(preparedPath)),sha(preparedBytes));guard();
        progress.phase='completed';entry.phase='mined';
      } catch(cause){progress.phase='failed';entry.phase='mined-finality-unconfirmed';mutation.markUncertain();
        throw new Error('NATIVE_VALUE_ORIGINAL_FINALITY_UNAVAILABLE',{cause});}
    }
