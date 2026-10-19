# Source generations and artifact reuse

A development generation identifies the current source and assembles a reviewable candidate. Preparation creates the compatibility copies required by historical readers and authenticates retained artifacts. Identical original circuits do not need to be recompiled merely because host code changed.

```sh
./dev sources status
./dev sources prepare
./dev sources verify --generation <digest>
./dev sources adopt --generation <digest>
```

## Inspect, prepare, verify, adopt

`status` reads editable source and compares it with the existing native release, native paged execution catalog and paged graph catalog. It identifies stale runtime copies and checks published ledger V5/W39 V9 hashes. `--json` includes individual files and differences. It writes nothing.

`prepare` incrementally refreshes compatibility copies and captures current dependencies in a V7 candidate independent of earlier publications. Candidate creation requires successful checks of the ledger, twelve native roles and five paged roles. A missing original or failed check returns its specific code and exit status 2; diagnostic capture remains available, but no valid candidate is produced.

`sources check` returns 1 when source/artifacts differ from the **existing publication** or compatibility copies are stale. Preparing a candidate does not publish it, so that check may still report differences after successful preparation.

`verify` rereads captured objects, current source, exports and relocation rules, and authenticates retained artifacts again. Stale or modified captures are rejected; success reports READBACK_VERIFIED without changing the generation.

`adopt` performs the same verification and writes `scripts/development/adopted-generation.json`, binding candidate digest and current source closure. Migrated paged catalogs and native deployment loader V5 check that record and current bytes before consuming original artifacts. Later source edits invalidate that association. Adoption does not compile, deploy or certify an economic operation.

After reviewing code, `./dev sources prepare --adopt` prepares and verifies the same generation before recording it, rejecting altered originals and concurrent edits. Ordinary preparation retains a separate review/adoption step.

## Stored objects

Generations live under `.local/generations`, outside Git:

| Path | Contents |
| --- | --- |
| `<digest>/sources.json` | Source, dependencies, differences and byte references |
| `<digest>/candidate-release.json` | V7 candidate binding current source to original publications and W39/N32/paged reuse receipts; present only after successful inspection |
| `<digest>/reuse-receipt.json` | V6 receipt for exact reuse of retained W39 V9 |
| `<digest>/inspection-<digest>.json` | Inspection result and any rejection reason |
| `objects/<sha256>` | Source bytes shared between generations |

Preparing unchanged source reuses existing objects. It does not duplicate the repository, tools, networks, custody or compilations. Modified stored objects are detected and stop preparation.

Sources removed from three collectors and seven facades have explicit relocations to SHA256-named `.source` evidence. Historical names remain useful for publication verification, but are not executable entry points. Capture authenticates those bytes without following their imports, and the builder no longer generates their old copies.

## Dependency closure and integrity

Capture follows literal ESM imports, module URLs and declared public exports of known `@lianum/*` packages from the published inventory and explicit relocations. It includes the `package.json` that selects each export and the target source. Unknown packages, private exports, escaping paths and symlinks are rejected; bytes are rechecked after inspection to catch concurrent changes.

Mobile TypeScript is inventoried by bytes; this does not certify the mobile bundler's closure. `createRequire` loads are declared as resources needing consumer validation. The W39 build report follows imports from its build entry point, distinguishing changes to build modules from Python/shell launchers. Compiler packages, circuits, CRS and outputs retain their own checks. A report grants no execution permission and is not a cryptographic proof.

## N32 and paged artifacts

N32 authenticates its nine original build inputs under `packages/proofs/evidence/original-sources` against the pinned original manifest. Current resource owners are identified separately. Program, ABI, key, statistics, toolchain and CRS checks remain enforced.

Paged inspection authenticates both retained manifests and five programs, keys and Solidity contracts, plus original circuits/configuration. It checks 100 original records: 58 build inputs and 42 host sources. Changed historical bodies are retained under their exact hashes as evidence, not executed. Both earlier catalogs remain in `packages/proofs/evidence/paged-source-catalogues`. Current catalogs require explicit adoption and original artifact provenance.

## I84 reuse

`retained-i84-publication-v1.json` pins an immutable publication of the original reader result and the hashes of its reader, driver manifest and source version. The capsule authenticates the 244 public resources it read: source, programs, key, Solidity, proofs, receipts, toolchain, Wasm and CRS.

The current reader verifies bytes from `environment.externalResourcesRoot`; it does not import the historical reader or use `/workspace` as a fallback. Returned original directories are provenance labels. The capsule grants no account, system or deployment-bundle authority.

Export happens once from restored originals, with the complete result checked against the original. It is not a current-code pin to refresh after an ordinary edit. When restoration lacks the publication but has the original installation:

```sh
./dev proof-node scripts/protocol/proofs/export-retained-i84-public.mjs
```

The exporter authenticates the original reader pins, observes ordinary and streaming reads, and restores its hooks before publishing. It neither compiles circuits/generates keys nor reads private account state. It reuses restored resources, preserves historical modules as `.source`, and rejects overwriting a different publication. Ordinary operation consumes the publication; only restoration needs the historical reader at its original location.

The portable verification covers I84, paged artifacts and wrapped source inspection. It runs from `/` with reads restricted to the bundle, rejects altered paged keys and altered key/program/receipt/I84-capsule data, and loads the canonical RootNote worker with fixed SPL SOURCE selection. It does not construct an economic system or execute financial operations. Original compiler and ABI SDK resources are authenticated.

## W39 reuse

V9 remains the original artifact generation. V6 names the **new preparation procedure and reuse receipt**, not a fresh compilation of V9.

Inspection checks eight files against published hashes, the original receipt/source capsule, Noir/Nargo/program/key/Solidity bytes, ABI, ACIR, AST, compilation options, toolchain and CRS. The existing semantic component validator is reused. Current launchers belong to current source records; they are not attributed as producers of an earlier build.

V7 candidates and reuse receipts do not mint the private internal bundle brand. After explicit adoption, canonical loader V5 authenticates the complete original publication, ledger, W39 and N32; only that loader retains authority to issue its private brand. Original programs, keys, ABI and receipts keep their hashes. Without adoption, the earlier path remains. Copying an object does not turn it into a canonical bundle.

## Current source pins

```sh
./dev pins check
./dev pins check --profile platform --json
./dev pins update
./dev sources prepare
```

`check` is read-only: exit 1 means proposed changes; exit 2 means preparation is blocked. Output includes old/new fields; JSON includes the exact proposed file diff. `update` writes only declared current fields and is a no-op when bytes are unchanged.

| Profile | Fields that may change | Immutable checks |
| --- | --- | --- |
| `mobile` | Three manifest hashes and catalog digest | Noble versions/integrities and 46 installed public files |
| `platform` | Hash/size of 15 declared sources/manifests | 138 public files and 14 exact packages |
| `callers` | Hash/size of 25 declared local consumers | Exact reviewed path list |
| `runtime` | Current network-profile, dispatcher and SOURCE process-guard pins | Explicit allowed declarations; historical pins stay fixed |

`platform` includes `callers` because the backend authenticates the Platform capsule. The default profile is `all`. `scripts/development/source-pins.json` declares allowed paths; adding paths or changing public dependencies requires explicit policy review, never automatic discovery. Symlinks, private entries, historical originals and detected concurrent edits are rejected. Each output replacement is atomic; rollback only restores writes still owned by that command, preserving someone else's concurrent edit.

Source preparation first checks the mandatory mobile profile. If stale, it prints the review command and stops; it does not silently update pins or require Cloud installation for native preparation. Current pin updates identify code for review without rewriting original publications, receipts or financial acceptance.

Moving modules can change local manifests. Current catalogs bind the new source while the historical publication remains authenticated by its fixed digest. A candidate must not rewrite an old catalog or claim its source was the current implementation.

## Additional retained compiler provenance

`paged-original-host-v4/compiler-provenance-v1.json` preserves the earlier paged host compiler and original bytes recovered from Git/backups. Its reader verifies the historical hashes; the current Solc loader source belongs to the adopted generation.

Portable economic bundles include the original ABI SDK and Solc, with rejection checks for their four integrity alterations. SDK vendor modules are authenticated by manifest. Historical drivers remain `.source` evidence; no historical backend is imported and no private state is copied.

VALIDATED_CANDIDATE means preparation and provenance passed. Adoption selects its use for migrated consumers, which recheck source/artifacts at load time. Neither result substitutes for financial acceptance on the intended network.
