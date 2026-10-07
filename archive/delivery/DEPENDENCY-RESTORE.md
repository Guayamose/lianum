# Exact public dependency restoration

No compiler, proof, native chain or private-wallet process is launched by these restoration recipes. No private keys, obligations or active execution locks are reconstructed. Stage histories remain historical.

Inputs are the verified restored flat35/golden17/base23/delta45/continuation27 archives, final reviewed source55/root2 and their recorded manifests. Root names are anchored by the coordinator's restoration receipts.

Run the explicit restoration scripts in this directory in order: public proof dependencies, stage dependencies, retained-reader dependencies, deployment pins, flat lineage, I84 reader, canonical-root materialization. Each uses original literal hashes and refuses a conflicting existing file. Some small supplements (node-component15 files, retained driver57 files, legacy verifier2 files) have explicit receipts here; restore only their listed public files from the authenticated archive sources and verify each hash.

The fixed I84 reader requires literal original workspace path /workspace/scratch/770c47ebf757/lianum-recovery-20261005-0655. Do not patch its source assertion or claim history moved. Materialize the reviewed final source and exact public dependencies there only after verifying the destination is absent or a known partial restoration with no conflicting bytes. No launch is implied.

## Official npm packages

Original audit: omnichain-product/evidence/m15-linux-package-provenance.json, SHA256 81aecc452689cfb28709b7d6b3998a1e3c0532de82780a15b2e7a10b3f3e74d6. It specifies12 packages and7 WASM pins. Original reused lock SHA256 03d180659e066007b0add05f6bbe7f1c846e19d8c913645ac1cae3f5fe6104ba. Construct an isolated npm project from that lock's root package metadata and exact lock bytes; use npm ci --ignore-scripts --omit=optional --no-audit --no-fund --registry=https://registry.npmjs.org/ with explicit empty project-local user/global configs and isolated cache. Do not run package scripts or update lock versions. Verify every installed package JSON and WASM file against the original audit before copying the package tree. Omit .bin symlinks when materializing the read-only runtime dependency tree.

Solc uses the exact restored tools/solidity-js package.json and package-lock.json. Install similarly with scripts disabled. Required soljson.js SHA256 is221d7a667378b5068d913e75fe092507e061363cd1d23b64c49ae82febabad4c. Installation is not compilation.

## Official public CRS

Use documented https://crs.aztec-cdn.foundation/g1_compressed.dat with Range bytes=0-67108863. Require HTTP206, exactly67108864 bytes, SHA2563e1ac09652ee9df779a4955fb8f7050620c7b1ee7f18566581bd00326b06be37. Use https://crs.aztec-cdn.foundation/g2.dat, HTTP200, exactly128 bytes, SHA25601797bfc4de5a96f0e516a9ea4537d18786dc30cb991aca4274c95822b69c32f.

Restore the original provenance.json bytes from golden17 development-evidence/supervision/restored-crs.json with SHA256e24f63bcea7cc9d1430c3696c109569015fc38c6e44d5a46ebab3a64013939e3. Preserve that historical record; current download results belong in the new restoration receipt rather than rewriting its timestamp/hash.

All three files belong at experiments/private-core-proof/native-notes/.local/crs/2097152 under the original golden root. Exact public bytes do not independently audit the ceremony.
