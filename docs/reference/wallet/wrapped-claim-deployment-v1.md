# Wrapped custody plus generic graph deployment V1

<p><a href="../../../README.md"><img src="../../assets/lianum.svg" width="110" alt="Lianum"></a></p>

[Documentation](../../README.md) · [Architecture](../../ARCHITECTURE.md) · [Validation](../../VALIDATION.md)

Status: source-only, not activated. All operational, deployment, and proof release constants remain null. No compiler, prover, ACVM, native node, signing, funding, deployment, or network operation was run for this change.

## Distinct contract identity

The graph-only V2 hub constructor explicitly rejects every nonzero claim authority. Its source and owned factory remain unchanged. The combined path targets only `contracts/wrapped-claim-v1/PrivateFlatReceiptHubWrappedClaimV1.sol:PrivateFlatReceiptHubWrappedClaimV1`.

The distinct hub changes the first constructor predicate to require both a nonzero authority address and a nonzero authority code hash. The existing exact code check and authority-to-hub identity check still apply. Aside from the name, import path, notices, and this constructor predicate, its source preserves the original generic I84 graph, wrapped registry, claim admission, reservation, nullifier, pool, health, and receipt predicates exactly.

This new source needs its own actual Solidity compilation, source/AST/artifact pins, constructor/runtime derivation, and EIP170/EIP3860 checks. No previous graph-only compiler result or size report establishes acceptance for it. There is no circuit change.

## Ownership and lifecycle

1. `createWrappedClaimCustodyBootstrapV1({runtime,nativeRuntimes,journalRoot})` first authenticates all fourteen deployment/proof roles. Only then may it inspect original BTC/SOL custody capabilities, reserve their physical close identities, inspect the fresh journal, read native inventories, and allocate inventory domains
2. The operator bootstrap uses that exact original custody capability to construct one complete mixed custody/native-value registry and the shared signer positions
3. `deployWrappedClaimGraphSystemV1({runtime,options})` accepts only public deployment domain/epoch/pool policy data plus original operator and custody bootstrap capabilities. Options are exactly `deploymentDomain`, `registryEpoch`, two `pools` with `policy`/`deploymentDomain`, `bootstrap`, and `custodyBootstrap`
4. The factory deploys and audits two common libraries, the twelve graph verifier roles, both genuine wrapped claim verifier roles, claim libraries/wrappers/gateways/authority, the distinct combined hub, and both wrapper-backed pools. Actual nonce/address/creation bytes/transaction/receipt/runtime checks precede private ownership publication
5. Gateways and authority are sealed. Full constructor/storage checks, original-claim accounting, fixed-head graph reconstruction, and another original native custody preflight must all succeed before returning the graph system

The returned graph system has `profile === LIANUM_OWNED_WRAPPED_CUSTODY_NATIVE_GRAPH_V1`, `claimsEnabled === true`, and `system.claims.flatSystem === system`. Both have separate private WeakMap ownership. `system.custodyRegistration` and `system.claims.custodyRegistration` are the same immutable complete public registration.

The common custody allocation broker is shared with the legacy claim bootstrap. Reservations are keyed by original physical runtime close identities, not copied facade properties. Pending or failed attempts remain allocated, and no reset/unreserve entrypoint exists. A failed combined deployment revokes its custody capability and both system brands and closes its operator bootstrap while retaining available transaction/receipt evidence.

## Fixed artifact contract

The deployment release is a reviewed literal with fields `schema`, `sourceClosureSHA256`, `sourceFiles`, `toolchain`, `crs`, `ledger`, `contracts`, `verifiers`, and `proofReleaseSHA256`. The verifier table in that release covers the twelve original graph roles, including genuine generic I84. The separately branded proof artifact loader supplies CI51 for `native_claim_ingress_nonce_registry_v3` and CO42 for `native_claim_discharge_registry_v2`.

The operational literal joins `schema`, `sourceClosureSHA256`, `deploymentReleaseSHA256`, and `proofReleaseSHA256`. The combined loader authenticates complete fixed raw-file pins, current host import closure, source/AST/compiler/artifact records, actual program/ABI/key/generated verifier lineage, exact claim profile roles, and a common toolchain/CRS. The original W39 retained-record adapter and actual I84 loader retain their specific lineage checks. No graph-only operational release or legacy claim loader is substituted.

Public pure planners still accept a hash callback only as a non-authoritative proposal seam. Live planning exclusively uses the fully code-pinned onchain Poseidon2 library at an unchanged receiver head. Neither public descriptors nor copied artifact records can enter a branded planner/deployer path.

## Current-state readers

The graph reader reconstructs both pool ledgers and trees at one fixed block, validates the complete mixed registry, pins all fourteen verifier runtimes plus custody/hub/pool/library runtimes, and checks the nonzero authority identity. The claim observer reconstructs bounded intent/ticket history, wrapper supply, all liabilities and reservations, seal/configuration pins, and current or historical mode. Historical views cannot pass current-view gates. These views are receiver-chain evidence; operators separately repeat original native inventory/history reads before signatures.

## Verification performed

- JavaScript import and syntax checks
- Seven pure/negative tests: null releases, exact fourteen role widths, no runtime/native access before the real null gate, false ownership and copied objects rejected, pure hash callback never called for an unowned bundle, unchanged BTC/SOL rule identities, preserved graph-only authority rejection, shared physical custody allocation seam, and exact separate-hub source invariance
- Original graph-only hub/system/planner remain byte-identical to their base snapshot

No positive owned deployment, real generated artifact acceptance, new-contract EVM size pass, proof generation/acceptance, physical lifecycle, or runtime performance claim is made. Existing BTC8/SOL12 corrections were not edited by this deployment change.
