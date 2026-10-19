# Native claim artifacts: inventory and reconstruction

Audit of 8 October 2026. Public sources are available; original acceptance receipts and several compilations were not recovered. The new development build prepares CI51 V3 and CO42 and allows the original preflight of the fixture BTC/Solana. Historical acceptances remain absent and the complete payout needs a new acceptance. `./dev artifacts` currently verifies its encoding scope; **does not accredit these claims or recover their acceptances**.

The artefact routes in this document are related to the `ROOT` of runtime `omnichain-flat-profile/flat-wallet`locally reconstructed by `./dev`. Consumers link to the editable sources of the repository.

## Original Identities Proven

Identity has been recalculated with the Noir sources, their local dependencies, ABI, official packages, toolchain and original settings. The three hashes match; this check **does not replace a compilation, a test, or a native operation**.

| Relationship | Function | Source version original |
| --- | --- | --- |
| CI51 V3 `native_claim_ingress_v3` | BTC/Solana income registered | `65d4737a5da725dc9b73998f240c02346ae50db1731a652feb55071f2ed0d555` |
| CO42 `native_claim_discharge` | Download ticket and payout | `7ddd3be0eaddf7bc08840d6fa0660ee6e6596108e35c9c1ac83ca4f76f468ea5` |
| IC51 legacy `native_claim_ingress` | Perfil anterior | `c13d5cc0e1be06158727cf933013492fe44efe987d09e4dee9bb9216c04fb418` |

VK expected from V3: `11682686c16db1276738b60ad906560a58ddf18183acf7ec5fb40f99474d8f6f`. VK expected from CO42: `0cfe032118e9e3d18dd9e4eadc1d738b9ec2116e65c8bed3e35a3db2416a2a83`. They are hashes SHA-256 literals of the bytes of each key, fixed by the original code. The keys to the written claims profiles are different and do not serve as a replacement.

## What lack and who consumes it

| Family and route | State | Consumer |
| --- | --- | --- |
| `experiments/native-ingress-v3-artifacts/acceptance.json` | Absent; historical receipt | [Loader V3](../src/operations/deployments/claims/native-claim-ingress-v3-artifacts.mjs) |
| `experiments/native-ingress-v3-artifacts/.local/<fase>/` | Absent stats, key, proof, solidarity and `result.json`, `resources.json`, `pins.json` | Loader V3 |
| `experiments/native-ingress-v3-validation/acceptance.json` and `.local/f574cd35-4ba6-4bf7-911f-8711df163bb2/{compiled-manifest.json,program.json}` | Absent acceptance, manifest and program | Loader V3 |
| `experiments/native-ingress-v3/{source-manifest.json,baseline-manifest.json,profile.json,verification.json,source.patch}` | Absent receipts from sources/revision | Loader V3 and original experimental validation |
| `.local/native-claims-contracts/e3e645b6-9466-4f3c-aab1-4dcaa93b7f51/compiled.json` | **Retaining and exact hash checked** | [Loader of contracts](../src/operations/deployments/claims/native-claim-artifacts.mjs) |
| Same directory: `manifest.json`, `source-snapshot.json` | Absent original receipts | Contract Loader |
| `.local/proof-workers/claim-verifier-compilation/5ead74d0-bb7c-4d0e-a625-87bbcf46682b/{result.json,resources.json}` and related compilations | Absent | Contract Loader |
| `.local/proof-workers/relations/native_claim_discharge/<source-version>/` | Complete absence: program, stats, VK, Solidity, pointers and execution receipts | [Proof tooling](../../proofs/src/tooling/tooling.mjs), payout worker and contract loader |
| `.local/proof-workers/relations/native_claim_ingress/<source-version>/` | Absent complete; it is also demanded by the legacy loader | Test Tooling and Legacy Loader |

The input that checks these artifacts before starting nodes is [`createOwnedNativeClaimGraphV3Fixture()`](../../../tests/integration/fixtures/claims/lifecycle/owned-native-claim-fixture.mjs). Preparing only contracts does not solve the payout: CO42 also needs the authenticated artifacts that your worker reads.

Original Hashes known to retrieve exact backrests:

| File | SHA-256 expected |
| --- | --- |
| V3 artifacts `acceptance.json` | `a533bbdf7f6f3b52acc86f6350fdcf6d33aafb7206abc3a5fbb2a95b7fb6bc10` |
| V3 validation `acceptance.json` | `4becaf943b9694066754749da3b35c863d8e8cd0fe977b7749619a299a9a12ec` |
| V3 `source-manifest.json` | `b0c8317888e6a4afff98a90b57be4f8fa839ffaf7c4d9726aa3017828553eb68` |
| Contracts `compiled.json` withheld | `263757f0d143276829e9bf21548a67ac7b3931f28fcdd42825a31093c486bda9` |
| Contracts `manifest.json` | `1b799fc3fad9ade30f3f7f4a432071d265deaf2a2c4075e0cc4dc7e40b559c5b` |
| Contracts `source-snapshot.json` | `b21f5489eb481a32e75547b8402da6b759cabba0225025bd1725aa736b4d5a25` |
| Verifier compilation `result.json` | `827b270dd6e6537cef628efa751b97dd008f904299132f6516831217ec1310ce` |
| Verifier compilation `resources.json` | `7c7d398c8fb0f926d92f7b439caa4239239a982887b140725df4ea9ab1d411ef` |
| Programme CO42 `compiled/61d900c0-e5a2-4757-a274-c59fd0d0c645/program.json` | `5ec7d600e2f1a76d72720f2b3a35b44c4e777e7dee30f46d0be2b98a3eca39e3` |

The individual hashes of the V3 phase files depend on the allowlist for their missing acceptance; no separate literal has been recovered for each one. Its original IDs are stats `ab926291-69ce-4c26-9193-3c2253c11195`, key `09feff05-9d1e-4036-98b2-4e50783cbbc3`, proof `bcf79517-1ccb-41ef-8aef-3de833aa4c82` y Solidity `46d5696e-76b0-45ba-b947-5e8bd5c13e7d`.

## Revised public reconstruction

A new low public building has been prepared `.local/development-native-claims/v2`with fixed manifest `0df110957d9bde54085d6ae47b67811dfe626dece77b33dfa14db935b3bef043`. The v1 revision is preserved as evidence of the first build; v2 removes the variables UUID from the published pin and normalizes only the diagnostic path of the `main.nr` in `file_map`. The complete program, ABI, ACIR, circuits, CRS, compilers and VK are still verified. The actual local hashes of the program and its manifests are checked within each laboratory.

From the root, after preparing the public offices:

```sh
./dev node scripts/wallet/preparation/prepare-development-native-claims.mjs
LIANUM_TEST_NATIVE_CLAIMS_REBUILD=1 ./dev test packages/backend/tests/operations/deployments/claims/development-native-claims-build.test.mjs
./dev test packages/proofs/tests/native-ingress/native-claims-parent-death.test.mjs
```

CO42 uses the original generic supervisor and produces current attempts with UUID new; its original reader retains all compile/stats/key checks. V3 uses a closed supervisor with the global lock, maximum RSS of 3 GiB, free 2,5 GiB floor and original timeout per phase. The two VKs have been generated and both match exactly the original hashes. The original 40 tests of Constraints Noir pass: 7 accepted and 33 rejected. Compilers, immutables, ABI and real sizes of Solidity verifiers are verified. The fingerprint covers 46 transitive sources of execution and fixture, in addition to Noir/API/vendor/CRS.

The CO42 preparation receives SIGTERM from the kernel if your father dies, even after `exec` and SIGKILL. Four regressions with real processes verify that closure, including paths of editable code, runtime and clean copy of IC. Eight integration checks pass, including preflight without nodes, alteration of manifest/VK/ABI/sources and transfer of the diagnostic route keeping ABI, ACIR and key identical. The loader of the historic public proof continues to demand its original acceptance; it does not return an invented proof of the new build.

The identity of the **circuit** is preserved. The identity and receipts of the ** new build/laboratory** are new and have been fixed after checking their actual results. The build does not manufacture acceptances, evidence, manifests, sources of review or authorities under historical identifiers. The BTC/Solana and payout operations must establish their own acceptance in a new laboratory. ** This build does not generate a proof nor credits entry, finality or complete native payout.** The preflight already has the necessary artifacts to continue that laboratory keeping its original controls.

More detailed local evidence: `.internal/dev/reports/native-claims-artifact-inventory.json` and `native-claims-source-audit.json`. These are ignored reports of this restoration; the information needed for the following engineers is reversed here.
