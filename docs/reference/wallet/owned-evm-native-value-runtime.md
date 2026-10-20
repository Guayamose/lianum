# Owned EVM native-value runtime V1

<p><a href="../../../README.md"><img src="../../assets/lianum.svg" width="110" alt="Lianum"></a></p>

[Documentation](../../README.md) · [Architecture](../../ARCHITECTURE.md) · [Validation](../../VALIDATION.md)

This is inactive, source-only integration work. No actual runtime, key, signature,
transaction, deployment, compiler or prover was run for this change. The source
and synthetic lower-port checks do not establish an accepted graph delivery.

## Exact boundary

`createOwnedLocalEvmV2()` keeps its original fixed chain 31337, accounts, process
arguments and public API. Its existing zero-native-value contract dispatch and
legacy read-only wire verifier are byte-identical. Its ownership brand cannot be
used as a native-value runtime, and the new native fixture cannot be used as V2.

The separate zero-argument `createOwnedLocalEvmNativeValueV1()` reuses the private
owned process implementation with a different fixed profile:

- Classification/name: `LOCAL_SYNTHETIC_EVM_CHAIN_ID_1`
- Chain ID 1, Cancun, synthetic genesis timestamp 1900000310
- Original observed synthetic genesis, five fresh local accounts, fake funds,
  pinned Anvil, private loopback-only transport, manual mining and no CORS
- Legacy EIP-155 only, 100000 gas and fixed 1000000000 gas price
- Positive native value below 2^128, distinct nonzero recipient, exact 70-byte
  `LNRB1:` followed by the lowercase 64-character public K commitment

Reusing chain ID 1 in this isolated fixture is not Ethereum mainnet execution.
The actual synthetic genesis must be registered in the original source system.
No Ethereum mainnet genesis, remote RPC, imported key or caller-selected chain
is accepted. The source system remains its separately owned 31337 runtime.

Native runtime identity is checked only by
`isOwnedLocalEvmNativeValueV1` / `assertOwnedLocalEvmNativeValueV1`. Copies,
proxies, inherited objects, metadata and copied methods do not obtain its brand.
The native runtime exposes no `send`, `dispatch`, `advanceTo`, raw RPC, signing,
key import, fee replacement or resend API. It exposes `dispatchNativeValueV1`
and the fixed read/lifecycle methods below. Keep the entire capability inside
the private bootstrap; it is not an application API.

## Private gate contract

`dispatchNativeValueV1(request)` opens only the exact request registered by
`native-value-evm-dispatch-gate.mjs` through
`assertOwnedNativeValueEvmDispatchRequest(request, originalNativeRuntime)`.
That module belongs to the separate provider/lease patch. No caller-supplied
callback bundle, arbitrary signer or public request-registration API is added.

The exact immutable scope is:

```
{
  transaction: {from, to, data, gas, value},
  binding: {
    leaseId, profileCommitment, chainId, genesis, actionCommitment,
    receiptKeyCommitment, readyStatement,
    dependencyProofSHA256, readyProofSHA256
  },
  beforeSign, onSigned, beforeSend
}
```

Transaction addresses/data are lowercase prefixed hex; gas/value are canonical
RPC quantities. All binding hashes are bare lowercase 32-byte hex; chainId is
exact decimal `1`. Binding genesis must equal the runtime's originally observed
genesis. The provider/lease validates the full Action, original P/R proofs,
registered source/profile, K opening and, after signing, original GID/N.
The runtime checks exact prepared native fields, native solver account ownership,
current native state and durable retention. Digest data alone grants no authority.

`beforeSign(prepared)` receives:

```
{
  profile: "LIANUM_OWNED_LOCAL_EVM_NATIVE_VALUE_V1",
  binding,
  genesis: "0x...",
  head: {number: "0x...", hash: "0x...", timestamp: "0x..."},
  transaction: {chainId, from, to, nonce, gasPrice, gas, value, data},
  unsignedWire: "0x...",
  funds: {
    balanceWei, estimatedGas, targetCodeHash,
    maximumFeeWei, estimatedFeeWei,
    ownershipCommitment, observationCommitment
  }
}
```

Exact transaction numeric fields and funds amounts are canonical decimal strings.
Target code hash is prefixed hex; audit commitments are bare hex. Ownership and
observation commitments are audit digests, not ownership proofs. Original runtime
identity and its private account/RPC closure establish the limited local ownership.

The runtime checks original latest/pending nonce equality, exact observed head,
fixed fees/base fee, recipient code, successful estimate and solver balance
covering native value plus the full signed gas cap. This is solver-owned native
liquidity on the separate native fixture. Escrow, claim backing, source pool
reserves and protocol payout are never read as spendable native funds.

Before key use it create-only persists and fsyncs the complete preparation,
original nonce, unsigned wire and binding, fsyncs the parent directory and reads
it back. Then it completes all native health/head/nonce/balance/code/estimate
RPC reads. The gate performs its final P/R/registered-source/current-health check.
The next asynchronous effect is the original private `eth_signTransaction` RPC.

The raw legacy wire is independently decoded and matched to every prepared field.
The runtime create-only persists/fsyncs/readbacks the exact signed wire before
`onSigned({nativeWire,nativeId,transactionSHA256})`. This callback must durably
retain native identity, derive/check GID/N, create and verify the original provider
signature, and durably retain that exact signature. Its assert-only return is
required. The final assert-only `beforeSend()` check then immediately precedes
the sole raw broadcast. No preparation, persistence or extra RPC follows that
check before the broadcast.

The gate may first call `assertNativeValuePreparedCurrent(rawPrepared)` and then
perform its final source/current-health reads. This read-only method accepts only
the exact raw preparation object privately delivered by this runtime while the
original dispatch is live. Cloning or replaying JSON cannot regain its identity.
It rechecks head, original nonce, balance, code, estimate, fees and process/network
health. Native reads must precede the gate's last source/current-health check.

## Exact outcome, durability and UNKNOWN

The original request and lease are consumed before preparation awaits. The native
runtime uses the same exclusive mutation fence and retained signed-wire journal
as the original runtime. It signs at most once, broadcasts at most once and mines
at most once for a request. A valid reverted receipt consumes the request but
permits unrelated later work. Unknown key, wire persistence, provider retention,
broadcast or mining outcomes latch mutation; there is no reset or replacement.

`observeNativeValueOriginal({nativeId,nativeWire,transactionSHA256})` requires the
original retained signed transaction and both durable preparation/signed files.
Input nativeId/SHA256 are bare hex; wire is prefixed. It checks exact transaction,
canonical receipt and block joins, original inclusion height/time and one-transaction
block. Result is `{status,nativeId,nativeWire}` with `observed`, `pending`, `unknown`
or `adverse`; only observed returns wire. It never clears the mutation latch.
These statuses report bounded local top-level execution, not graph acceptance.

`reconcileSignedTransaction(prefixedHash)` remains the original read-only,
cause-specific reconciliation. Only uncertainty from the sole original durable
raw broadcast can be resolved using that exact wire and canonical original
receipt. Signing, persistence, unknown mining/time and unrelated mutation
uncertainty cannot be cleared by a different successful receipt. Missing/pending
inclusion remains unknown. No reconciliation call signs, sends or mines.

The original process/account identity is required throughout. Files alone do not
restore native signer custody after process destruction. Journal retention is not
a claim of durable native key recovery.

## Assurance limits

Recipient code is observed, committed and refreshed. Code execution is permitted
within this fixed gas profile. A successful top-level value transaction does not
prove the recipient kept the value, lacked delegated code or controlled a key.
Local canonical inclusion is not public-network consensus/finality. All funds
and networks here are synthetic. This change implements no remote, hardware,
mobile or Tron signing capability. Those execution owners remain unsupported.

Nineteen focused checks cover pure profile constraints, public mathematical legacy
wire verification, exact branch preservation, ordering/durability/no-resend source
guards, and synthetic lower-port constructor/identity checks. Constructor tests
replace process/HTTP ports only and never mock a production gate or lease brand.
They start no process and generate/sign/send nothing. A genuine lease-backed
positive native dispatch and its fault cases still require separately authorized
integrated acceptance; no such runtime acceptance is claimed here.
