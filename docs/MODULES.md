# Modules and dependencies

Each JavaScript package declares its public entries in `package.json` by `exports`. Consumers use these entries and stated dependencies:

```js
import { createFlatAccountSession } from '@lianum/backend/accounts/session';
import { createRoleProofClient } from '@lianum/proofs/client';
```

The entries point to a single implementation. Public facades that continue to have consumers re-export the same functions; replaced private facades are removed. Don't create another custody, state, or identity record. Packages are product modules, not services to be deployed separately.

## Responsibilities and direction of dependencies

| Package | Owner of | Representative public exports |
| --- | --- | --- |
| `@lianum/backend` | Composition of accounts, custody and networks; APIs, execution, recovery and deployments | `accounts/session`, `accounts/durable-keeper`, `wallet/http-service`, `claims/session`, `defi/withdrawal` |
| `@lianum/proofs` | Jobs, workers, tools and cryptographic verification | `client`, `catalog`, `execution/proof-process`, `toolchain/wallet-prover`, `verification` |
| `@lianum/custody` | Custody of the owner, authorization of signatures and bindings | `owner`, `signing/authorized-envelope`, `preparation/flat-owner-manual-binding` |
| `@lianum/engine` | State, generic coordination, storage, codecs and shared mechanisms | `accounts/keeper`, `accounts/journal`, `crypto/vault`, `execution/inputs/funding-witness`, `storage/records` |
| `@lianum/mobile-protocol` | Contracts between clients and backend; wallet client without DOM | root export, `original-account-v2`, `wallet/client` |
| `@lianum/components` | Public formats, integrity, resource policy and CRS | `encoding/commitments`, `encoding/statements`, `verification/wrapped-installation`, `file-integrity` |
| `@lianum/crypto` | Candidate circuits and portable Poseidon | `framing`, `portable-poseidon2` |
| `@lianum/environment` | Locations of declared sources and resources | `sourcePath`, `sourceURL`, `resourceRoot`, `resourcePath`, `legacyDataRoot` |
| `@lianum/protocol` | Frozen historical generation | References for historical reproduction, outside active consumers |

The main dependency direction is `backend → proofs → custody → engine`. Each layer may also consume the lower layers it needs. Engine consumes contracts of `mobile-protocol`, `components`, `crypto` and `environment`; it does not import backend, proofs or custody. Shared public formats are in those lower packages and do not construct accounts or processes when imported. The complete detail is in the manifests and in [`scripts/module-boundaries.json`](../scripts/module-boundaries.json).

Owner processes, network-dependent observers and account preparation belong to `backend/src/custody/`. Key custody and its bindings remain in `packages/custody`. Also, backend composes economic execution requiring a prover; engine retains its shared mechanisms and proofs owns the proof process. The Java driver of `packages/chains/` retains its separate build.

The retained web fixture mounts visual resources in `packages/backend/tests/fixtures/api/wallet/application.mjs` and uses `@lianum/backend/wallet/http-service` for HTTP, sessions and authorization. The backend can use that service regardless of the application. Shared contracts and the DOM-free client belong to `mobile-protocol`; DOM, screens and static resources are still in apps.

## Shared implementations and authority

| Code | Place of editing | Compatibility |
| --- | --- | --- |
| Wallet contracts and shared client | `packages/mobile-protocol/src/wallet/` | Wallet imports shared exports; its duplicate facades were removed |
| HTTP Wallet Service and Request Controls | `packages/backend/src/api/wallet/` | The app adds its closed list of web resources |
| Portable Poseidon2 | `packages/crypto/src/portable/poseidon2-bn254-v1.mjs` | Reexport from mobile custody |
| Encrypted segmented record | `packages/engine/src/storage/segmented-record-store.mjs` | Re-export from backend claims/storage |
| Generic Coordinator and Checkpoints | `packages/engine/src/execution/accounts/generic-account-keeper-core.mjs` | Backend composes durable persistence |
| Durable Keeper and SOURCE Validation | `packages/backend/src/accounts/storage/durable-generic-account-keeper.mjs` | Its identity registry lives beside its factory. |
| Toolchain wallet/assembly and key validators | `packages/proofs/src/toolchain/` and `src/verification/` | Previous experimental entries re-export these owners |
| DeFi deployments and typed local composition | `packages/backend/src/operations/` | Former fixtures re-export the operational implementation |
| Process identity and RSS observation | `packages/proofs/src/host/` | Test helpers re-export the implementation |
| EVM runtime mechanics and instance-scoped custody | `packages/backend/src/chains/evm/runtime/owned-evm-runtime-backend-v1.mjs` | The facade `owned-evm-v2-runtime.mjs` retains the functions of the original owner |
| Journal SOURCE and original composition of runtime | `packages/backend/src/operations/recovery/native-original-source-lifecycle-v1.mjs` | The former capsule facade is retained as `.source` evidence; consumers use this owner |

Tests import operational implementations. Active literal imports no longer target test drivers or executable modules of `experiments/`. Assertions, simulated transport failures and campaigns remain in tests. The retained sources and artifacts that validate a generation remain explicit resources: separating the code does not eliminate those requirements.

Custody, recovery and broadcast tokens depend on identity in memory. Moving a consumer requires the joint preservation of the issuer, its private registry and its validator. For example, the operator kernel owns the provenance of EVM/TRON health observations; separate RPC readers cannot issue a self-certified observation. Local EVM economic custody has a fixed instance created by the runtime kernel. Another instance of the mechanism does not share its handles or signing permissions.

The EVM mechanism backend receives six specific contracts: journal, recovery, device SOURCE, reorg, dispatch and observation. It does not import its account consumers, sessions or controllers. The fixed composition links these contracts with the original owners; it does not offer configuration to replace them in the actual instance. The journal retains AEAD, CAS, single-use tokens and their private records. Regression tests check that another instance, even with a real local process, does not obtain authority from the original singleton.

## Shared paged interfaces

These entries from `@lianum/mobile-protocol` maintain implementation and shared types for mobile and SDK:

| Export | Interface | Responsibility |
| --- | --- | --- |
| `device/paged-operation-runner-v3` | `runDevicePagedOperationV3({command, isUnconfirmedReply, onProgress, onActivity, signal, maxCommands})` | Requests `NEXT_COMMAND` and consumes the following original command; reports completion, waiting or an adverse outcome. The port accepts the SDK response in custody before returning its private copy; the classifier only recognizes errors from that same SDK instance. |
| `device/paged-economic-view-v3` | `normalizeDevicePagedEconomicRequestV3`, `normalizeDevicePagedEconomicViewV3` | Validates cost, beneficiary, output and ledger DATA. Their types include: `DevicePagedEconomicViewV3` and `DevicePagedEconomicLedgerV3`; does not issue an SDK brand or permission. |
| `device/paged-payout-settlement-v3` | `runDevicePagedPayoutSettlementV3({plan, command, readState, readOutputs, prepareWithdrawal, approve, onProgress, signal})` | After the change is withdrawn, it composes original W39 and checks the output NF, recipient, amount and retained ledger. The native costs are separated from payments in units of the note. |
| `device/paged-wallet-portfolio-v3` | `normalizeDevicePagedPortfolioRequestV3`, `normalizeDevicePagedWalletPortfolioV3` | Validates output, issuance, spending and reservation DATA at the same block; it does not issue permits or SDK authority. |

These codecs and helpers do not import backend or possess RPC, keys, custody or broadcast capability. The ports supplied by the authorized composition maintain the original signatures, permits and acceptance; a callback or normalized plan cannot substitute for those boundaries.

The runner recovers state replies marked expired, advanced or lost by the same SDK instance using at most two `OBSERVE_GRAPH` reads and fresh `NEXT_COMMAND` planning. It does not blindly repeat the proof, effect or native broadcast whose response was lost; the other consent and expiration guards retain their original errors.

`READ_PORTFOLIO` composes a read-only encrypted channel with the original note authority. It binds the same block, graph, ROOT and revision with the CM/NF/SOURCE, CHANGE, RECOVERY and PAYOUT values opened by the device's Vault. An issued PAYOUT output requires both the provider’s original MINED delivery and inclusion in the accepted output root. It does not generate proofs, native signatures or withdrawals, and retains the original fifteen-second permit.

The mobile actor groups DATA verified by asset, domain, contract, policy, unit and precision. It excludes duplicates and unissued outputs and underlying valuations; reports coverage only of registered connections and custody instances. Its observation window retains the original snapshot when transport closes, expires after fifteen seconds and is revoked by a custody write. This DATA does not retain authorizations and does not constitute a permit for expenditure.

The Mixed path adds authenticated retained composition of five runtimes and four components. Uniswap captures its original five-contract fixture, router, private authority D27 and configuration, with its own framing and tokens. The Native composition of seven tokens and the historical fixture of seven contracts retain their formats. Capture requires both listeners drained, a quiescent provider and canonical reads; reopening only supports original tokens from the same supervisor and maintains the same leadgers and journal. This is orderly closure, not arbitrary process-loss recovery.

`READ_ECONOMIC_SETTLEMENT` is only supported with FULFILLED graph, with no active work or pending result. The backend delivers it encrypted by [`createDevicePagedNativeEconomicChannelV3`](../packages/backend/src/operations/local/device-paged-native-economic-channel-v3.mjs) with a private reader linked to the original provider and authority. That callback consults facts and ledger at the same state head; it does not prove, sign or execute a withdrawal.

The mobile gets `graphEconomicRequest()` and `graphEconomicReview(reply)` from its [Original Vault](../apps/mobile/src/custody/device-paged-note-vault-v3.ts). The review requires an original SDK response and binds descriptor, ROOT, revision, graph, root authorization, CM, value, NF and beneficiary with their own custody. Confirmed history checks the recipient of withdrawn outputs. [`wallet-session-v1.ts`](../apps/mobile/src/custody/wallet-session-v1.ts) issues `approveWalletSessionPagedSettlementV3(review, signal)` after strong approval; `walletSessionPagedSettlementLeafV3(parent, id)` limits each leaf to its exit, and `closeWalletSessionPagedSettlementV3(parent)` revokes it. The maximum scope is 30 minutes in the foreground; each command retains its 15-second permission.

The Uniswap exit retains its D27 and its independent ExternalFlat custody. [`observeDeviceExternalFlatReceptionV1`](../apps/mobile/src/api/device-external-flat-reception-observer-v1.mjs) composes the original SDK and Vault for a single `OBSERVE_D27` of the same reception in `DELIVERY_UNKNOWN`, followed by fresh STATUS. It checks descriptor, work, ROOT, statement and proof hashes. It does not change PROVED preparation, generate proofs or send funds. The Paged result opens the exact destination profile after draining its transport and requires existing custody. The portfolio publishes the original reading of that token; the completion of the graph and the public connection directory do not credit available balance or spending permit.

External agents can only consume an authorized port from that same route. DTOs, public profiles, seeds, templates and ciphertexts cannot become branded capabilities or reconstruct tokens. The `executor:null` of [`services/api-server/src/admission/run.mjs`](../services/api-server/src/admission/run.mjs) belongs to the V1 TOP_UP/EXIT admission profile, other than the paged executor linked to its original account. These interfaces do not by themselves establish financial acceptance.

## Verification and outstanding debt

```sh
./dev boundaries
python3 -B scripts/development/module_boundaries.py --json
```

The checker inspects literal imports, re-exports and literal-path dynamic imports in `apps/*/src` and `packages/*/src`. It rejects unexported entries, undeclared dependencies, forbidden dependency directions and new private accesses between packages. It also controls cycles between packages and between files. It does not load the product or start networks. Computed imports require review.

The literal import graph leaves **zero cycles between packages, zero active private imports between packages and zero active links to tests/experiments**. The **13 historical support links** belong to the frozen `packages/protocol` tree, and excluded from the active product. These results describe the graph inspected, not the percentage of functionality completed.

Active assembly and payout launchers belong to proofs, with fixed entrypoints and literal URLs. The policy, resources and CRS are implemented in `components/src/resources/`; Loaders keep their APIs and check their location. The execution inventories read and calculate hashes on fixed lists from real sources, without accepting the hashes returned by those same implementations. Computed loads still require review and explicit packaging resources.

The paged gateway uses three declared canonical imports in `scripts/layout.json` to to maintain a single authority also from compatibility. The experimental sources fixed by that generation remain intact as evidence and are not executed from that gateway.

**An internal cyclical component of 133 files and 756 imports** remains, compared to 154 files and 845 imports from the previous cut. The mechanics of EVM, the SOURCE journal, the three bridge mechanisms, the mobile actor and the native session are outside of it: each family retains its private records and receives fixed contracts. The original composition retains public functions and does not accept substitutes. The SOURCE implementation (`native-original-source-lifecycle-backend-v1.mjs`) is also outside the SCC; its canonical composition is still inside. Their maps are private by instance. The composition sets sixteen deferred loaders and ten original dependencies; the 185 public members retain their signatures and guards.

Implementations `wrapped-recovery-backend-v1.mjs`, `external-defi-catalogue-recovery-backend-v1.mjs` and `device-external-flat-source-graph-backend-v1.mjs` are also outside the strongly connected component (SCC). Their compositions retain the original owners and private records by instance. GRAPH parts/checkpoints, preparation terms and retained Aave/Uniswap birth records have complete lower-level contracts under strict typing. The guards use snapshots separated from the caller objects during their asynchronous readings. The large implementation of GRAPH continues to receive many contracts; this separation does not establish complete cohesion or typing.

Implementation `native-value-account-backend-v2.mjs` is also outside the SCC. The canonical entry retains the 103 public members and the seven original loaders; the static checker follows the concrete frozen binding until its literal import. Regression uses actual encrypted storage and rejects copied handlers and other families, without financial resources or financial acceptance.

The scoped record reader, physical GRAPH queue and portfolio reader have complete bodies under strict typing. They have no keys or account authority: the store retains AEAD/CAS, the bootstrap selects the original physical entries and the portfolio authority retains its lock and its registered children. Tests import these complete implementations rather than extracting individual functions.

The retention of attestations (`original-facts-retention-v2.mjs`) retains comparisons before and after coverage, but their issuance and WeakMap remain in the operator. Vault preparation (`vault-preparation.mjs`) retains nonce, reference, quote history and broadcast lock; custody and serial lock remain in the adapter. Tests import the complete implementations.

Readers `inputUint`/`inputPath` are next to the snapshots in `components/plain-input`. Data clients do not need to load witness preparation or job validation. Preparation re-exports preserve the API. Migrated consumers retain their algorithms and the Node permission test allows you to read only the common component.

The remaining group brings together five main families: wrapped recovery (`wrapped-recovery-authority-v1.mjs`), SOURCE composition (`native-original-source-lifecycle-v1.mjs`), native authority (`native-value-account-authority-v2.mjs`), device GRAPH service (`device-external-flat-source-graph-service-v1.mjs`) and recovery of the DeFi catalogue (`external-defi-catalogue-recovery-v1.mjs`). Their two-way relationships remain visible; they are not five independent components or resolved dependency debt.

Strict selection has **100 explicit entries**. We check the new complete bodies of actor, native session, deposits and account execution, in addition to the mechanisms of journal, recovery, observation and extracted formats. Reader I84 and the validator of retained authorizations have complete typed implementations. BTC closure and SOURCE receipts of data, which do not issue account authority, are also typed. Canonical claim integers and hashes belong to `value-codecs`; their consumers do not need to import the protocol/quorum to decode bytes. Higher-level native authority, durable keeper, general session, economic state, SOURCE composition and GRAPH/DeFi recovery implementations remain outside that strict selection. A typed contract of a port does not prove the type of its implementation.

SOURCE retains the emission and consumption of its private checkpoint tokens and calls directly the journal data reconciler. It no longer delegates that read to account authority. Typed account, executor, terminal, claim and session entry points have direct consumers to their owners. The nine private facades removed are preserved as `.source` with hash in `packages/proofs/evidence/retired-facades`, outside `src` and without copies of execution. Historical publication names resolve to evidence; their historical imports are neither followed nor executed.

Exceptions identify exact consumers and destinations. The relocations retain their origin; they do not grant permission to add new dependencies. `python3 -B scripts/development/module_boundaries.py --prune` removes only exceptions that are no longer used. It does not approve newly detected cycles.

## Active sources, resources and history

[`historical-module-inventory.json`](../scripts/historical-module-inventory.json) identifies the 42 conserved pairs of engine/protocol and the 63 files of `packages/protocol/src`. `active` indicates where to develop; `historical` retains the original with its SHA-256. The check detects modifications, absences and new sources within the historical.

Applications do not consume protocol. Historical evidence may do so, but some original targets are missing, as recorded in [`static-check-exceptions.json`](../scripts/development/static-check-exceptions.json). Keeping that inventory does not mean that the entire historical generation is executable.

`environment` differentiates editable sources and resources. `ROOT`, `FLAT` and `GOLDEN` of the catalog describe retained locations; they are not routes to edit code. A portable candidate carries its `runtime-resources.json` descriptor, source closure and hash-declared resources. When that descriptor exists, it does not fall back to the host’s historical runtime. Original verifiers continue to decide whether tools, keys, sources and proofs are acceptable.

The current I84 reader uses a public capsule sealed by SHA-256 and reauthenticates the original 244 files from declared resources. The code of the historical reader is preserved as `.source`, without execution. The paged/wrapped/I84 bundle passes with Node authorized to read only within the candidate; its transfer does not in itself validate the start of all economic workers.

Commands `./dev bundle build`, `verify` and `run` are at [COMMANDS.md](COMMANDS.md). Preparing or transferring a bundle does not publish a release or certify an economic execution. The compatibility of previous generations remains explicitly available; consult [STRUCTURE.md](STRUCTURE.md).

The fixed route BTC→SOL for SPL SOURCE belongs to `operations/recovery/device-root-spl-source-execution-v4.mjs`; HTTP composes the original resources and delegates the entire cycle. Its test imports the actual implementation with explicitly inert lower financial ports. SOURCE state encryption belongs to `source-journal/native-state-cipher-v1.mjs`, under strict typing; has no authority, registry or filesystem access. The orchestration SOURCE retains its guards and functions, now formatted; its higher-level composition is still pending separation and complete typing.

Solc loading belongs to `packages/engine/src/execution/local/solidity-compiler-v1.mjs`. The generic compiler and Blue/Aave profiles delegate their checks and C API to this owner, with the same original pins and no remote callbacks/imports. The official ABI reader retains the authentication of the entire SDK tree using the original manifest; both loaders operate from transferred resources, under Node without permission to read outside the package. This does not prove economic execution.
