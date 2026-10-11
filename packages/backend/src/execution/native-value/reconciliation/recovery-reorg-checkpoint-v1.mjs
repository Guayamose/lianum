/** Exact parent and before-F state checks; no authority is created here. */
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {exactRecord} from '@lianum/components/encoding/commitments';
import {validateStatement} from '@lianum/components/encoding/statements';
const prefix=value=>'0x'+value,dataHash=value=>createHash('sha256').update(Buffer.from(value.slice(2),'hex')).digest('hex');
function freeze(value){if(value&&typeof value==='object'){Object.values(value).forEach(freeze);Object.freeze(value);}return value;}
const detached=value=>freeze(structuredClone(value));
export async function checkRecoveryReorgCheckpointV1(checkpoint,{wrapped,bindingOf,decodeNativeValueTerminalCalldata,pool,runtime,readAt,reader}){
      assert.ok(!wrapped, 'F_REORG_NATIVE_ONLY');
      exactRecord(checkpoint, ['schema', 'query', 'before', 'includedHeader', 'receipt']);
      assert.equal(checkpoint.schema, 'ORIGINAL_NATIVE_F_BEFORE_CHECKPOINT_V1');
      const { query, before, includedHeader, receipt: old } = checkpoint;
      exactRecord(query, ['kind', 'submission', 'statement', 'binding']);
      assert.equal(query.kind, 'recovery'); bindingOf(query.binding);
      const decoded = decodeNativeValueTerminalCalldata(query.submission.calldata);
      assert.equal(decoded.kind, 'recovery');
      assert.deepEqual(decoded.statement, validateStatement('recovery', query.statement));
      assert.equal(query.submission.target, pool.address);
      assert.equal(dataHash(query.submission.calldata), query.submission.calldataSHA256);
      assert.equal(old.transactionHash, prefix(query.submission.transactionHash));
      assert.equal(old.status, '0x1'); assert.equal(old.to, pool.address);
      assert.equal(BigInt(old.blockNumber), BigInt(before.header.number) + 1n, 'F_REORG_EXACT_PARENT_REQUIRED');
      assert.ok(BigInt(old.blockNumber) > 0n);
      assert.equal(includedHeader.hash, old.blockHash); assert.equal(includedHeader.parentHash, before.header.hash);
      assert.deepEqual(includedHeader.transactions, [old.transactionHash]);
      assert.ok(BigInt(includedHeader.timestamp) >= BigInt(query.binding.settleBefore), 'F_REORG_ORIGINAL_CUTOFF_REQUIRED');
      const head = await runtime.block();
      assert.deepEqual(head, before.header, 'F_REORG_DEEPER_OR_LATER_HEAD_REJECTED');
      await runtime.assertCanonical(before.header);
      const [transaction, included] = await Promise.all([runtime.transaction(old.transactionHash), runtime.receipt(old.transactionHash)]);
      assert.equal(transaction, null, 'F_REORG_OLD_TRANSACTION_PRESENT');
      assert.equal(included, null, 'F_REORG_OLD_RECEIPT_PRESENT');
      assert.deepEqual(await readAt(before.header.number), before, 'F_REORG_ORIGINAL_PARENT_STATE_CHANGED');
      const current = await reader.read();
      assert.deepEqual(current.header, before.header);
      assert.ok(current.ledger.nullifiers.includes(prefix(query.binding.inputNullifier)), 'F_REORG_ORIGINAL_S_REQUIRED');
      assert.ok(!current.ledger.nullifiers.includes(prefix(query.binding.reserveNullifier)), 'F_REORG_RESERVE_ALREADY_SPENT');
      await reader.assertCurrent(current); await runtime.assertCanonical(before.header);
      assert.deepEqual(await runtime.block(), head, 'F_REORG_HEAD_CHANGED');
      return detached({ parent: head, transactionHash: old.transactionHash, calldataSHA256: query.submission.calldataSHA256 });
}
