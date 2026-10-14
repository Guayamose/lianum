/** Original claim dispatch mechanism. The runtime retains token ownership,
 * mutation admission and custody; this module issues no runtime or gate brand. */
import assert from 'node:assert/strict';
/** @template T @param {T} value @returns {T} */
function freeze(value) {
  if (value && typeof value === 'object') {
    Object.values(value).forEach(freeze);
    Object.freeze(value);
  }
  return value;
}
/** @template T @param {T} value @returns {T} */
const cloned = (value) => freeze(structuredClone(value));
/** @param {bigint} value */ const hex = (value) => '0x' + value.toString(16);
/** @param {string} value */ const quantity = (value) => {
  assert.match(value, /^0x(?:0|[1-9a-f][0-9a-f]*)$/i, 'LOCAL_EVM_QUANTITY');
  return value;
};
/** @param {string} value */ const bytes = (value) => {
  assert.match(value, /^0x(?:[0-9a-f]{2})*$/i, 'LOCAL_EVM_BYTES');
  return value.toLowerCase();
};
/**
 * @typedef {{from:string,to:string,data:string,gas:string,value:string}} DispatchTransaction
 * @typedef {DispatchTransaction & {chainId:string,nonce:string,gasPrice:string}} ExactTransaction
 * @typedef {{number:string,hash:string,timestamp:string,baseFeePerGas:string,transactions:string[]}} Head
 * @typedef {{genesis:string,head:Pick<Head,'number'|'hash'|'timestamp'>,transaction:ExactTransaction,unsignedWire:string,funds:{balanceWei:string,estimatedGas:string,targetCodeHash:string}}} Prepared
 * @typedef {{nativeWire:string,nativeId:string,transactionSHA256:string}} Signed
 * @typedef {{status:string,gasUsed:string}} Receipt
 * @typedef {{transaction:DispatchTransaction,beforeSign(prepared:Prepared):Promise<unknown>,onSigned(signed:Signed):Promise<unknown>,consumeBeforeKey?:(token:unknown,prepared:Prepared)=>number}} Scope
 * @typedef {Scope & {consumeBeforeKey(token:unknown,prepared:Prepared):number}} ClaimScope
 * @typedef {{label:string,request:DispatchTransaction,senderNonce:string,prepared:Prepared,phase:string,signed?:Signed,transactionHash?:string,originalObservedInclusionSecond?:string,receipt?:Receipt,gasUsed?:string,uncertaintyCause?:string}} TransactionRecord
 * @typedef {{assertOwnedEvmDispatchRequest(request:object,runtime:object):Scope,isOwnedClaimEvmDispatchRequest(request:object):boolean,assertOwnedClaimEvmDispatchRequest(request:object,runtime:object):ClaimScope,isWrapped(request:object):boolean,openWrapped(request:object,runtime:object):ClaimScope}} ClaimGate
 * @typedef {{profile:{observedClock:boolean,observedEconomicV2:boolean,economicV2:boolean,pagedObservedV4?:boolean,runtime:object,genesisHash:string},
 * lifetime:{assertMutable():void,assertAlive():void,mutate<T>(work:()=>Promise<T>):Promise<T>},
 * requests:{loadGate():Promise<ClaimGate>,prepare(transaction:DispatchTransaction):DispatchTransaction,used(request:object):boolean,consume(request:object):void},
 * chain:{block():Promise<Head>,rpc(method:'eth_getTransactionCount'|'eth_getCode'|'eth_getBalance'|'eth_estimateGas'|'eth_signTransaction'|'eth_sendRawTransaction',params:unknown[]):Promise<string>,receipt(hash:string):Promise<Receipt|null>,assertCanonical(receipt:Receipt):Promise<Head>},
 * clock:{current():bigint,monotonic():number,nextObservedSecond():Promise<bigint>,mineAt(timestamp:bigint):Promise<unknown>},
 * custody:{prepare(prepared:Prepared):Promise<object>,consume(lease:object|null,prepared:Prepared):Signed,revoke(lease:object):void},
 * records:{append(record:TransactionRecord):void,receipt(record:TransactionRecord):void,persistSigned(record:TransactionRecord):Promise<unknown>,markUncertain(hash:string|null|undefined):void},
 * wire:{encodeUnsigned(transaction:ExactTransaction):string,verify(raw:string,transaction:ExactTransaction):Signed & {unsignedWire:string},keccak(bytes:Buffer):Buffer}}} ClaimDispatchPorts
 */

/** @param {object} scopedRequest @param {boolean} observedClaim @param {ClaimDispatchPorts} ports */
export async function dispatchOriginalEvmClaimV1(scopedRequest, observedClaim, ports) {
  const { profile, lifetime, requests, chain, clock, custody, records, wire } = ports;
  const { observedClock, observedEconomicV2, economicV2, pagedObservedV4=false, runtime, genesisHash } = profile;
  const { block, rpc, receipt, assertCanonical } = chain;

  lifetime.assertMutable();
  assert.equal(
    observedClock && !observedEconomicV2 && !pagedObservedV4,
    observedClaim,
    'LOCAL_EVM_FIXED_DISPATCH_CLOCK',
  );
  // The fixed composition loads the original gate before preparation.
  // It completes before preparation; no import/RPC is inserted after the
  // final beforeSign check and the actual sign-only RPC.
  const {
    assertOwnedEvmDispatchRequest,
    isOwnedClaimEvmDispatchRequest,
    assertOwnedClaimEvmDispatchRequest,
    isWrapped,
    openWrapped,
  } = await requests.loadGate();

  // Only the runtime's fixed private birth can select this branch. The
  // original wrapped gate still consumes its opaque request and exact scope.
  if(pagedObservedV4)assert.ok(observedClock&&!observedEconomicV2&&!observedClaim&&isWrapped(scopedRequest),'PAGED_OBSERVED_ORIGINAL_WRAPPED_REQUEST');
  if (observedClaim)
    assert.ok(
      isOwnedClaimEvmDispatchRequest(scopedRequest),
      'LOCAL_OBSERVED_RECEIVER_ORIGINAL_CLAIM_REQUIRED',
    );
  const claimV4 = isOwnedClaimEvmDispatchRequest(scopedRequest) || isWrapped(scopedRequest);
  const scope = observedClaim
    ? assertOwnedClaimEvmDispatchRequest(scopedRequest, runtime)
    : isWrapped(scopedRequest)
      ? openWrapped(scopedRequest, runtime)
      : isOwnedClaimEvmDispatchRequest(scopedRequest)
        ? assertOwnedClaimEvmDispatchRequest(scopedRequest, runtime)
        : assertOwnedEvmDispatchRequest(scopedRequest, runtime);
  assert.deepEqual(
    Object.keys(scope).sort(),
    ['beforeSign', ...(claimV4 ? ['consumeBeforeKey'] : []), 'onSigned', 'transaction'],
    'EVM_SCOPED_FIELDS',
  );
  if (claimV4)
    assert.equal(typeof scope.consumeBeforeKey, 'function', 'EVM_ORIGINAL_KEY_CONSUMER_V4');
  assert.equal(typeof scope.beforeSign, 'function', 'EVM_FINAL_GUARD');
  assert.equal(typeof scope.onSigned, 'function', 'EVM_DURABLE_CALLBACK');
  // Copy exact values and callback identities before the first await.
  const beforeSign = scope.beforeSign,
    onSigned = scope.onSigned;
  assert.deepEqual(
    Object.keys(scope.transaction).sort(),
    ['data', 'from', 'gas', 'to', 'value'],
    'EVM_DISPATCH_TRANSACTION_FIELDS',
  );
  const tx = cloned(requests.prepare(scope.transaction));
  assert.equal(tx.value, '0x0', 'EVM_DISPATCH_ZERO_NATIVE_VALUE');
  assert.ok(
    tx.to && tx.data?.length >= 10 && tx.data.length <= 262_146,
    'EVM_DISPATCH_CONTRACT_CALL',
  );
  assert.ok(!requests.used(scopedRequest), 'EVM_DISPATCH_ALREADY_USED_NO_RESEND');
  return lifetime.mutate(async () => {
    requests.consume(scopedRequest);
    let keyUsePossible = false,
      outcomeKnown = false;
    /** @type {TransactionRecord | undefined} */ let entry;
    /** @type {object | null} */ let localSigningLease = null;
    try {
      const head = await block();
      assert.equal(BigInt(head.timestamp), clock.current(), 'LOCAL_EVM_UNCONTROLLED_TIME');
      const pending = quantity(await rpc('eth_getTransactionCount', [tx.from, 'pending']));
      const confirmed = quantity(await rpc('eth_getTransactionCount', [tx.from, 'latest']));
      assert.equal(pending, confirmed, 'EVM_PENDING_NONCE_NOT_EXCLUSIVE');
      const gasPrice = 1_000_000_000n;
      assert.ok(BigInt(head.baseFeePerGas) <= gasPrice, 'EVM_FIXED_GAS_PRICE_TOO_LOW');
      const txExact = {
        chainId: '31337',
        from: tx.from,
        to: tx.to,
        nonce: BigInt(pending).toString(),
        gasPrice: gasPrice.toString(),
        gas: BigInt(tx.gas).toString(),
        value: '0',
        data: tx.data,
      };
      const signingRequest = Object.freeze({
        ...tx,
        nonce: pending,
        chainId: '0x7a69',
        gasPrice: hex(gasPrice),
        type: '0x0',
      });
      const targetCode = bytes(await rpc('eth_getCode', [tx.to, head.number]));
      assert.notEqual(targetCode, '0x', 'EVM_DISPATCH_TARGET_NO_CODE');
      const balanceWei = BigInt(quantity(await rpc('eth_getBalance', [tx.from, head.number])));
      assert.ok(balanceWei >= BigInt(tx.gas) * gasPrice, 'EVM_DISPATCH_GAS_FUNDS');
      const estimate = BigInt(
        quantity(await rpc('eth_estimateGas', [signingRequest, head.number])),
      );
      assert.ok(estimate > 0n && estimate <= BigInt(tx.gas), 'EVM_DISPATCH_GAS_ESTIMATE');
      const prepared = cloned({
        genesis: genesisHash,
        head: { number: head.number, hash: head.hash, timestamp: head.timestamp },
        transaction: txExact,
        unsignedWire: wire.encodeUnsigned(txExact),
        funds: {
          balanceWei: balanceWei.toString(),
          estimatedGas: estimate.toString(),
          targetCodeHash:
            '0x' + wire.keccak(Buffer.from(targetCode.slice(2), 'hex')).toString('hex'),
        },
      });
      entry = {
        label: 'gated EVM vault delivery',
        request: tx,
        senderNonce: pending,
        prepared,
        phase: 'prepared-before-final-guard',
      };
      records.append(entry);
      if (economicV2) localSigningLease = await custody.prepare(prepared);
      // V4 returns a genuine one-use authority, consumed only after the
      // final complete native observation of this exact preparation.
      const keyAuthorityV4 = claimV4 ? await beforeSign(prepared) : null;
      const nativeAuditStarted = clock.monotonic();
      assert.deepEqual(await block(), head, 'EVM_PREPARED_HEAD_CHANGED');
      for (const tag of ['latest', 'pending'])
        assert.equal(
          await rpc('eth_getTransactionCount', [tx.from, tag]),
          pending,
          'EVM_PREPARED_NONCE_CHANGED',
        );
      assert.equal(
        await rpc('eth_getCode', [tx.to, 'latest']),
        targetCode,
        'EVM_PREPARED_CODE_CHANGED',
      );
      assert.equal(
        BigInt(await rpc('eth_getBalance', [tx.from, 'latest'])),
        balanceWei,
        'EVM_PREPARED_BALANCE_CHANGED',
      );
      assert.equal(
        BigInt(await rpc('eth_estimateGas', [signingRequest, 'latest'])),
        estimate,
        'EVM_PREPARED_ESTIMATE_CHANGED',
      );
      assert.deepEqual(await block(), head, 'EVM_PREPARED_HEAD_CHANGED');
      if (claimV4) {
        const authorityAuditStarted = /** @type {ClaimScope} */ (scope).consumeBeforeKey(
          keyAuthorityV4,
          prepared,
        );
        const terminalNow = clock.monotonic(),
          elapsed = terminalNow - nativeAuditStarted;
        const authorityElapsed = terminalNow - authorityAuditStarted;
        assert.ok(
          Number.isFinite(authorityElapsed) && authorityElapsed >= 0 && authorityElapsed < 30_000,
          'EVM_KEY_ORIGINAL_AUTHORITY_TOO_OLD',
        );
        assert.ok(
          Number.isFinite(elapsed) && elapsed >= 0 && elapsed < 30_000,
          'EVM_KEY_NATIVE_OBSERVATION_TOO_OLD',
        );
      } else assert.equal(await beforeSign(prepared), undefined, 'EVM_FINAL_GUARD_ASSERT_ONLY');
      // Immediately following the guard: no preparation, observation, file
      // I/O or other callback intervenes before actual backend key use.
      if (economicV2) lifetime.assertAlive();
      keyUsePossible = true;
      entry.phase = 'signing-outcome-unknown';
      const raw = economicV2
        ? custody.consume(localSigningLease, prepared).nativeWire
        : await rpc('eth_signTransaction', [signingRequest]);
      const verified = wire.verify(raw, prepared.transaction);
      assert.equal(
        verified.unsignedWire,
        prepared.unsignedWire,
        'EVM_SIGNED_UNSIGNED_WIRE_CHANGED',
      );
      entry.signed = cloned({
        nativeWire: verified.nativeWire,
        nativeId: verified.nativeId,
        transactionSHA256: verified.transactionSHA256,
      });
      entry.transactionHash = verified.nativeId;
      entry.phase = 'signed-not-yet-durable';
      await records.persistSigned(entry);
      entry.phase = 'native-signed-durable';
      // The original scoped gate persists raw/GID, creates and verifies the
      // provider signature, then durably retains that EXACT signature.
      assert.equal(await onSigned(entry.signed), undefined, 'EVM_ON_SIGNED_ASSERT_ONLY');
      entry.phase = 'provider-signature-durable';
      entry.phase = 'broadcast-result-unknown';
      const hash = await rpc('eth_sendRawTransaction', [entry.signed.nativeWire]);
      assert.equal(hash, entry.transactionHash, 'EVM_BROADCAST_HASH_CHANGED');
      entry.phase = 'broadcast';
      const includedSecond =
        observedClaim || observedEconomicV2 || pagedObservedV4
          ? await clock.nextObservedSecond()
          : clock.current() + 1n;
      if (observedEconomicV2) entry.originalObservedInclusionSecond = includedSecond.toString();
      await clock.mineAt(includedSecond);
      const mined = await receipt(entry.transactionHash);
      assert.ok(mined, 'LOCAL_EVM_RECEIPT_MISSING_AFTER_MINE');
      const header = await assertCanonical(mined);
      assert.deepEqual(
        header.transactions,
        [entry.transactionHash],
        'EVM_DISPATCH_ONE_TRANSACTION_BLOCK',
      );
      entry.receipt = mined;
      entry.gasUsed = BigInt(mined.gasUsed).toString();
      entry.phase = mined.status === '0x1' ? 'mined' : 'mined-reverted';
      records.receipt(entry);
      outcomeKnown = true;
      assert.equal(mined.status, '0x1', 'EVM_DISPATCH_REVERTED');
      return cloned({
        nativeId: entry.transactionHash,
        transactionSHA256: entry.signed.transactionSHA256,
      });
    } catch (error) {
      if (keyUsePossible && !outcomeKnown) {
        // Only a lost reply to the sole durable raw broadcast can be
        // reconciled here. Signing/persistence/mining/time uncertainty is
        // a different cause and must keep the global mutation fence.
        const uncertainSignedHash =
          entry?.signed && entry.phase === 'broadcast-result-unknown'
            ? entry.transactionHash
            : null;
        records.markUncertain(uncertainSignedHash);
        if (entry) {
          entry.uncertaintyCause = uncertainSignedHash
            ? 'original-signed-broadcast'
            : 'unrecoverable-signing-or-mining';
          entry.phase = 'uncertain-no-resend';
        }
      } else if (!keyUsePossible && entry) entry.phase = 'pre-sign-rejected';
      // Do not attach the mutable internal entry to caller-visible errors.
      if (entry && error instanceof Error && Object.isExtensible(error)) {
        try {
          Object.defineProperty(error, 'transactionRecord', {
            value: cloned(entry),
            enumerable: true,
          });
        } catch {}
      }
      // Preserve even a frozen/primitive callback exception exactly: the
      // gate uses its identity to establish rejection before key use.
      throw error;
    } finally {
      if (localSigningLease) custody.revoke(localSigningLease);
    }
  });
}
