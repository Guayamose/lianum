# Owned local TRX native writer: source preparation only

The fixed entry is `createOwnedLocalTronNativeValueV1()` in the new chain-adapter
module. `inspectOwnedTronRuntimePrerequisites()` gives its explicit blocker report.
The factory takes zero arguments. Today it rejects `OWNED_TRON_RUNTIME_RELEASE_ABSENT`
before starting a process or generating a key. `OWNED_TRON_RUNTIME_RELEASE` is null.
The graph dispatch request opener is independently closed. No successful native
transfer, Tron consensus run, proof acceptance, graph delivery or private credit
has been demonstrated by this handoff.

## Concrete source implementation

- A fixed stdio-only `OwnedTronNativeDriver.java`, intended to embed the official
  pinned Java-Tron node with a minimal offline initialization patch
- New synthetic local SR, solver and recipient accounts. Solver key remains in
  the original Java process and is never imported, exported or returned. The
  local SR fixture key is written only to its fresh private node config so the
  official witness service can produce blocks. No user's credential is used
- Unique actual native genesis observed from the node's own store. Public
  metadata separates upstream commit, patched-node hash, driver hash and public
  configuration hash. Native genesis/asset identity is never substituted with a
  mainnet identity. This is synthetic local TRON protocol execution, not Mainnet,
  Shasta, Nile, EVM or public-network finality
- Fresh source-owned fictitious TRX separate from source escrow, graph reserves,
  claim backing and protocol payouts. Recipient is the fixed fresh pre-funded
  Normal account. No arbitrary address, contract call, permission change, fee
  replacement, RPC endpoint, signer, callback or key import API
- Canonical one-TransferContract protobuf, permission 0, positive amount up to
  10^12 sun, exact 32-byte K memo, original solid-block TAPOS, 60-second expiry,
  and 30-second preparation lifetime. The fee reserve is 10^7 sun. The balance
  must cover amount plus reserve; free bandwidth is not relied upon
- Official `ECKey.sign` over SHA256(original raw_data), official protobuf signed
  envelope, and official `Manager.pushTransaction` validation/execution/pending
  queue. Official consensus must produce blocks autonomously. There is no fake
  mining endpoint or hand-constructed block fallback
- Exact original-only canonical inclusion/solidified ancestry observation,
  bounded to 256 blocks. A local singleton witness is not independent consensus
  and does not satisfy the four registered graph source positions by itself

The Java source has not been compiled. Passive class metadata checks establish
that nine selected upstream API classes contain the referenced public members;
that is neither Java compilation nor behavior validation.

## Native boundary and exact dispatch interface

The runtime exposes only `metadata`, `accounts`, `health`,
`assertNativeValuePreparedCurrent`, `dispatchNativeValueV1`,
`observeNativeValueOriginal`, `report` and `close`.
Ownership is a private WeakSet populated only by a successful fixed constructor.
Copies, proxies, metadata and copied methods confer no ownership. No runtime
brand was minted in tests.

The separate `native-value-tron-dispatch-gate.mjs` has no issuer and always rejects.
A future genuine owner/controller join must return exactly:

```
{
  binding: {
    leaseId, profileCommitment, genesis, actionCommitment,
    receiptKeyCommitment, readyStatement,
    dependencyProofSHA256, readyProofSHA256
  },
  transaction: { ownerAddress, recipientAddress, amountSun, wireKeyCommitment },
  beforeSign, onSigned, beforeSend
}
```

All binding values are bare lowercase 32-byte hex. Addresses are bare 21-byte
Tron hex with prefix 41. Amount is canonical positive decimal. No EVM chainId is
invented. `beforeSign(prepared)`, `onSigned(signed)` and `beforeSend()` are
assert-only and must return undefined. They are obtained only from the original
private gate, never from the public caller. Native ID and wire are bare hex;
this differs from the prefixed nativeId at the existing EVM callback boundary.

The prepared object contains profile, binding, actual genesis, original native
head, exact transaction and raw_data bytes, the complete initial native snapshot,
and source-owned funds/fee/observation commitments. Audit hashes are data, not
permission/ownership proofs. The future gate must normalize it into the existing
native-value prepared record and check original P/R, Action, K, profile, source
inventory and windows. The existing EVM preparation normalizer cannot be reused.

Before key use, the parent and child create-only persist and fsync the binding,
preparation and original key-start marker. Native reads are then refreshed. The
private gate must complete a fresh FULL source inventory/controller health
assessment. The next asynchronous effect is the one original child key command.
The Java child synchronously rechecks its own native state immediately before
key use. This does not replace the independently fresh graph/source assessment.

Exact native signed bytes are create-only persisted, fsynced and read back before
`onSigned`. The genuine gate must durably retain original GID/N, its exact provider
statement and signature before returning. Then both owners persist their one-use
send-start markers; native state is refreshed again, followed by an independent
fresh FULL source/controller check in `beforeSend`. The next asynchronous effect
is the sole child submission command. There is no extra parent journal write or
RPC between either gate completion and that command.

Native head/solid heights may advance normally. The originally signed TAPOS
reference must remain canonical and recent (at most 32 blocks), and no unsigned
or signed bytes may be rebased. Permission, solver balance, resources, fees and
configuration must remain unchanged. Native state checks are independent at the
key and send boundaries. They are not cached health permits.

## Retention and uncertainty

The fixed runtime has one mutation request for its lifetime. Journal events are
append-only, individually create-only, SHA-linked, bounded to 32, mode 0600, and
fsync/readback checked. Its fresh owned directory is 0700. There is no reset,
resend, alternate signature, nonce/timestamp/fee replacement or journal recovery
that restores signer authority. Process loss leaves exact retained data but not
custody recovery. Data is retained on close; cleanup is not performed.

Key, persistence, provider-retention or original-send uncertainty permanently
latches mutation. Read-only reconciliation requires all three original signed
identity fields. Same raw-data txid with a different signature envelope fails.
Pending/missing stays unknown; adverse is permanent. Even a later observed
original cannot clear key/provider/persistence uncertainty or issue new authority.
The pure journal codec authenticates neither provenance nor a capability.

## Exact dependency blocker and safe launch route

Official java-tron GreatVoyage-v4.8.2.3 resolves to commit
`5c449a18a2bb995d3b688d1587e664d909b473c7`. The official 145750002-byte
FullNode-x64.jar was downloaded and its SHA256 and published GPG signature checked:
`faef7f4d89b9f154632bbab2db1712c25f02ee37b356013e098558ea994accec`.
It is a provenance reference, not the offline runtime binary.

Stock HTTP, gRPC, P2P TCP and discovery UDP listeners bind wildcard. Worse,
unpatched Args creates libp2p P2pConfig before applying CLI overrides, and that
constructor contacts public external-IP services even with `--p2p-disable true`.
A loopback advertised IP does not solve this. No firewall, namespace, VPN or other
host-security change has been made or proposed.

The minimal reviewed source patch avoids constructing P2pConfig when the explicit
P2P-disable switch is present before config load. All API, discovery, backup,
metrics, event, DNS and dynamic-config services remain off and are checked in the
parsed runtime parameters. Full Spring/null-safety and no-egress behavior remain
untested. The candidate uses no HTTP or RPC server at all; its original parent
owns the child's stdin/stdout pipes. See `dependency/REVIEW.md` for exact sources. A second small source patch adds
`OwnedLocalTronReplayRecorder` and one call in `Manager.processTransaction` after
signature validation and before native effects. It captures only the exact
original transaction while validating a containing block that already has its
witness signature; speculative unsigned block construction is excluded. Actual
owner permission, parent validation head, fork flags and transaction index are
retained create-only with fsync/readback. Fresh source reads require the current
canonical original block and wire to match that retained prestate. A missing or
changed record fails closed; latest-account state is never used as historical
replay. The official upstream recorders and binaries have not been executed.

Java 8 is required on x86 by both upstream build and runtime. Only a Java21 JRE
is available here; javac and Gradle are absent. Temurin8u504-b01 and Gradle7.6.4
vendor metadata/checksums are pinned, but neither toolchain was acquired/installed
or run. The dependency build recipe is not executed. It uses a checksum-verified
Gradle distribution directly because the checked-in wrapper is not byte-identical
to the current vendor wrapper. A shell opt-in flag is merely an accident guard,
not user authorization or a runtime release.

Required before a runtime pin can become non-null:
1. Approved isolated JDK8/Gradle acquisition, exact patched build and driver
   compilation; complete transitive/JDK/source/class/config hash inventories
2. Complete startup and shutdown/null-safety acceptance, with no listener or
   outbound traffic through configuration, Spring initialization, consensus,
   native signing/submission or shutdown; no hand-made ledger fallback
3. Exact signed-block pretransaction recorder patch and durable replay acceptance,
   followed by native positive transfer and native fault-path acceptance against original
   wire/journal, independent observation and native permission/TAPOS/expiry rules
4. Fixed local source/controller/registry join described below

## Exact graph registration and clock prerequisite

The I84 Tron profile schema can represent an actual local synthetic genesis.
However, the current `native-value-operator-bootstrap-v2` issuer only accepts
HTTPS rpcURL plus a mandatory replayURL for Tron, with four distinct registered
source positions. The socket-free original node is not such an issuer. Existing
provider custody/dispatch additionally requires the original EVM runtime and
explicitly rejects Tron. None of those modules was changed by this patch.

The additive local V4 source bridge now supplies a fixed interface to the
separately developed local-only bootstrap owner. It binds this exact original
process, actual genesis, patched client/config identity and current full inventory
to four explicitly common-host/common-node signer positions. Runtime acceptance
and the controller/custody issuer still remain separately gated. Four copies of this node's receipt are not infrastructure independence.
No forged HTTPS address, caller adapter, digest-based brand or mainnet profile is
an acceptable substitute. The new native I key/proof/verifier/system release is
also separately required. Graph claims/private-credit authority remains disabled.

The actual Java-Tron node follows wall-clock native consensus time. The existing
source EVM fixture uses a synthetic future clock. A real original P/R/Action window
must overlap native inclusion time under the registered policy; neither chain
metadata nor time is relabeled here. This clock join is an explicit release
prerequisite, not solved by the public synthetic 2030 wire used in codec tests.

## Verification scope

25/25 focused host checks pass, no skips: native encoding against retained public
synthetic wires; strict fields; permission/funds/fees/TAPOS/current-state checks;
original-envelope uniqueness; full journal phases, no reissue, unknown/adverse
handling, capacity/tamper rejection; closed runtime/gate ownership; source
boundary/durability/network-disable guards. The initial source-guard run had one
incorrect regex (extra closing parenthesis), preserved separately and corrected.
No native gate, lease, process, permission replay or accepted ledger is mocked.

All 16 extra source excerpts match git blob identities in the pinned commit tree.
Nine API class public-member sets were checked by passive byte parsing of the
verified official JAR. Six host candidate modules pass Node syntax checks.
Patch roundtrip and exact source hashes are in the handoff manifest.

Not run: Java compile, native node, new key, signature, real transfer, native
consensus, public network, proof compiler/prover, deployment or graph acceptance.
Active and golden trees, shared catalog/tooling/statements and historical pins
were untouched. No broad existing suite is represented as a new pass.

## Additive V4 local source bridge

`owned-tron-native-value-health-source-v4.mjs` exports:
- `describeOwnedLocalTronNativeValueSource(nativeRuntime,{profile,sourceIndex})`
- `createOwnedLocalTronNativeValueHealthSource({nativeRuntime,policy,source,original,currentRegistry,history})`

The descriptor contains identity, actual genesis, chainId null, family 4,
publicNetwork false and trust `COMMON_HOST_COMMON_NODE_SYNTHETIC`. The common
operator slot label uses SHA256 of `LIANUM/owned-local-native-operator-slot/1`, a
NUL byte and its decimal sourceIndex. It is a slot label, not a key or independence
proof. Endpoint identity includes actual genesis, configuration, compiled release
and slot. Client identity binds upstream commit plus patched node, driver and
both patch hashes. Configuration includes exact registered profile without its
sourceSetRoot and the original native public configuration hash.

The source factory rederives the entire identity, authenticates the exact original
runtime and signed wire, and constructs its own fixed read-only port. The caller
cannot inject a transport, replay result, URL, key, signer or clock. Four factory
calls issue separate native reads through the original child's serialized command
queue. Retained prestate is historical data; current canonical blocks, original
transaction and receipt are re-read for each signer and each audit round. No
observation or certificate is copied between signer positions.

The factory dynamically imports the separate `tron-native-value-health-source-v4`
reader, whose V4 private history token and original receiver anchor remain the
shared owner worker's responsibility. That module is an explicit prerequisite of
the composition, not copied or reimplemented by this patch. The runtime also
exports `assertOwnedLocalTronNativeValueRuntimeLive`, a synchronous original
brand/process/close-state check for final authority boundaries, and a private-use
read-only original port opener. These do not mint a signer or provider lease.

The original HTTPS bootstrap remains unchanged. The new source bridge removes
the need to counterfeit HTTPS metadata; it does not relax any policy, substitute
an I key or assert the actual native runtime exists. Local synthetic wall-clock
and original receiver time still must fit the selected registered profile.
