# Fixed owned EVM native-value profiles

Status: source-only, disabled release. No actual positive native-value execution,
new admission key, proof, generated verifier or production-client acceptance is
established by this patch. Host checks are not integrated wallet acceptance.

## One implementation, four fixed factories

The same private implementation in `owned-evm-v2-runtime.mjs` owns exactly these
no-options factories:

- `createOwnedLocalEvmNativeValueV1()` creates isolated synthetic chain ID 1
- `createOwnedLocalEvmNativeValueBaseV1()` creates isolated synthetic chain ID 8453
- `createOwnedLocalEvmNativeValueArbitrumV1()` creates isolated synthetic chain ID 42161
- `createOwnedLocalEvmNativeValueBnbV1()` creates isolated synthetic chain ID 56

These correspond to the existing immutable `evm-native-value-v2.mjs` registry's
Ethereum/Base/Arbitrum/BNB chain IDs. They do not create a new circuit or a new
relation for each network or graph combination. All consume the same distinct
native I84 relation and genuine original P/R/I/N/T wallet path after release.

Every supplied argument is rejected, including `undefined`. The private process
selector is not exported. A closed descriptor map fixes chain ID, classification,
local genesis timestamp, owned pinned Anvil binary, loopback endpoint, fresh
random synthetic wallet count, manual mining, Cancun execution, and gas bounds.
No caller endpoint, chain/genesis/profile, key, account, fee, signer, callback,
transport or imported existing runtime is accepted by a factory. The only
writable native API is `dispatchNativeValueV1(originalGateRequest)`.

The pure fixed codec functions validate data but mint no capability. Each
normalizer is fixed to one chain ID; it does not accept a profile-selection
argument. They keep the legacy EIP-155 transaction shape, 100000 gas,
1000000000 gas price, strictly positive uint128 value and exact 70-byte
`LNRB1:` receipt-key memo. Typed transaction signing remains unsupported.

## What execution means here

When a future genuine release runs these factories, transactions will execute
on isolated pinned Anvil EVM processes using solver-owned synthetic funds. This
is real local EVM transaction execution, but it is not public Ethereum, Base,
Arbitrum or BNB consensus/finality. These fixtures do not reproduce Ethereum's
production execution/consensus client pair, Base's op-geth/OP Stack execution and
derivation, Arbitrum Nitro, or BSC-specific execution and validator finality.
A matching public chain ID does not establish any of these properties.

Each native runtime's `metadata.fixtureAssurance` and read-only identity record
explicitly report `productionClientAcceptance: 'UNVERIFIED'`,
`protocolSpecificExecutionEquivalent: false`, and
`publicConsensusOrFinalityVerified: false`. Acceptance with each real production
client family remains separate, unperformed work. Receipt success establishes
only the exact top-level native-value execution on that local fixture; it does
not prove recipient key control or recipient value retention.

Native liquidity belongs to the separate original solver runtime. It is never
user custody backing, wrapped-asset backing, source pool reserves, a private
balance, or protocol payout. Public/native delivery gives no private credit.

## Actual genesis and live identity

The factory observes the fresh process's genesis hash and accounts after startup.
Before use and at each health boundary, it re-observes chain ID, actual genesis,
accounts and original process liveness. It never substitutes a public network's
genesis hash or accepts one supplied by a caller.

`isOwnedLocalEvmNativeValueRuntime` and
`assertOwnedLocalEvmNativeValueRuntime` are the new narrow fixed-family ownership
join. They only accept original objects issued by these four private factories.
The assertion also performs fresh health checks. Original chain1-only
`isOwnedLocalEvmNativeValueV1` and `assertOwnedLocalEvmNativeValueV1` retain their
chain1 meaning and continue rejecting Base/Arbitrum/BNB objects.

`ownedLocalEvmNativeValueRuntimeIdentity(originalRuntime)` returns a frozen,
read-only audit record. Its instance commitment binds observed chain/genesis and
accounts to the owned process ID, private scratch directory and module-session
sequence. Even same-genesis same-chain instances have distinct identities.
This commitment is not a bearer capability, ownership proof or registration API.
Copies, proxies, inherited objects, copied metadata and copied methods cannot
obtain the original runtime identity. Original live object identity remains the
authority. The read-only audit record may outlive a process; the live assertion
fails after closure. Files alone cannot recover a native signer process.

The coordinated provider owner uses the family assertion, then still joins the
selected original system registry profile's exact chain ID and observed genesis.
The once-only lease closes over that exact native runtime. The private dispatch
scope additionally requires `request.nativeRuntime === originalRuntime` by
module-private identity. Same genesis alone is insufficient to swap runtimes.
There is no public brand registration and no arbitrary adapter acceptance.

## Fixed local observation source bridge

`owned-evm-native-value-health-source-v4.mjs` is a separate local-only bridge.
It does not reuse or spoof the original HTTPS endpoint bootstrap. The coordinated
V4 operator bootstrap owns this bridge; its public application API does not
receive native transports.

- `describeOwnedLocalEvmNativeValueSource(originalRuntime, sourceIndex)` observes
  actual client version and original health, then returns data only for slot0..3
- `createOwnedLocalEvmNativeValueHealthSource({nativeRuntime, policy, source,
  original, currentRegistry, history})` validates the exact registered local
  source identity and delegates to the genuine V4 historical health observer
- `assertOwnedLocalEvmNativeValueRuntimeLive(originalRuntime)` synchronously
  rechecks original brand, process and close lifetime at the final key boundary
  without substituting for earlier complete asynchronous native health checks

The runtime's internal read opener accepts only a one-use token issued inside
this fixed source module. No general RPC, transport, clock or callback is
exported. The descriptor hashes actual client release and fixed original
chain/genesis/process profile/binary pin/execution profile configuration. Its
endpoint identity binds original instance commitment and source position.
Operator identities are explicit local slot labels. They do not establish
independent operators, endpoints, hosts or consensus.

Every signer gets a separately constructed observer and fresh uncached node
requests, including new client-version reads. Core queries are limited to chain,
actual block tags (including finalized/safe without aliasing to latest), exact
original signed transactions/receipts, and the existing fixed callTracer and
prestateTracer options. Trace queries cannot execute a caller tracer. The original
signed wire is rechecked before transaction queries. Cancellation combines the
observer signal, fixed10-second upper request deadline and original runtime
close/exit; bodies are bounded, canceled/drained on failure and parsed with exact
JSON-RPC IDs. No source request can sign, send, mine or rewrite the node.

All four source positions can observe one common host/node, explicitly reported
in descriptor metadata. Four copied observations are not allowed. Distinct slot
identity is not infrastructure independence. Successful source observation still
needs the genuine V4 history token and authenticated current receiver state.
The V4 observer derives its clock from that private token; no caller timestamp
or clock is accepted here. Its independent monotonic deadline remains enforced.
The fixed native clock starts100 seconds after source31337's initial clock, so
future genuine acceptance must align receiver time through its legitimate owned
runtime steps before evidence freshness can pass; it must not fake clock inputs.

## Existing boundaries preserved

The original 31337 zero-value dispatch and read-only signed reconciliation source
blocks are byte-identical to the preferred base. Its methods and metadata remain
unchanged. Chain1's existing profile, method names, prepared schema, metadata
values, disclosure, fixed fees and exact wire rules remain intact; assurance
metadata is additive.

The native branch changes only its private fixed-profile selection and family
ownership check. It preserves:

1. Original first P/R and exact lease/request consumption before preparation
2. Original source/runtime identity and complete refreshed health at every gate
3. Exclusive nonce, owned solver value plus fee cap, fixed gas/fees and exact K
4. Create-only/fsync/read-back preparation and original unsigned transaction
5. Final original P/R/current-health guard immediately before the sole native key use
6. Exact independent wire decoding and durable original raw wire before callback
7. Original provider key use and verified durable provider signature retention
8. Final full current-health gate immediately before the sole raw broadcast
9. No replacement, no resend, no reset; UNKNOWN stays on the original identity
10. Cause-specific original-wire reconciliation and permanent adverse semantics

The native branch is tested byte-for-byte against the previous branch after only
its approved symbol substitutions, so ordering and uncertainty handling cannot
silently drift during this family extension.

## Disabled one-action acceptance preparation

`owned-evm-native-one-action-acceptance.json` is a disabled, read-only plan. It is
not a runnable demo, artifact-success receipt, authorization token or proof result.
No environment flag or caller option enables execution. Existing role and native
deployment release literals remain closed. The provider/keeper join is supplied
by the coordinated native proof-role patch rather than a second runtime path.

After reviewed release prerequisites, choose exactly one fixed factory and one
action. Use the original private wallet authority's `registerGraph`, the native
execution keeper, original custody/dispatch lease, actual new I84 proof worker,
and existing retained-receipt N/T path. Do not substitute an independent send,
a synthetic proof success, or a generated object claiming system ownership.

Before any real fixture acceptance, the final composition owner must:

- Review this exact source delta together with native role, wallet authority and
  provider-family changes; regenerate only the new branch's reviewed source
  closure through its release process. This patch does not modify compiler,
  tooling, shared catalog, historical pins, new-branch source pins or release pins
- Produce and independently verify the actual distinct native I84 program, typed
  ABI, accepted sourceVersion, constraint reports, fresh binary verification key,
  generated verifier and verifier compilation; preserve all twelve role lineages
- Produce the new wrapped-registry native graph-only hub/pool/library artifacts,
  AST/runtime/immutable pins, storage checks and EIP-170/EIP-3860 checks
- Release the separately versioned native worker and original wallet authority
  composition, with claims disabled and an exact original registered profile
- Start original source31337 and selected native fixture only after the heavy-slot
  restriction is lifted; observe and register that fixture's actual genesis and
  bind its distinct live instance to the original provider custody and lease
- Verify separate solver liquidity, original P/R, original full-health checks at
  native-key/provider-key/send boundaries, once-only durable wire/signature,
  real native receipt, independently verified dynamic I84, and retained N/T
- Verify altered profile/chain/genesis/instance, expired P/R, changed health,
  signer/send uncertainty, adverse receipt and no-resend rejection paths

A local positive acceptance still does not qualify production Ethereum, Base,
Arbitrum or BNB clients or public finality. Those four qualifications stay
UNVERIFIED until separately performed with the relevant clients and evidence.
