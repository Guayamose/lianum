# Local environment and cleanliness

The versioned code is in the visible root folders. Installed dependencies, compilations, local network data and development results occupy much more space than that code. This file explains where they are and how to clean up the build-up without removing resources needed to work.

## Result of the October 10 cleaning

The project decreased from **32,008,396,800 to 21,270,175,744 bytes** — from **29.8 to 19.8 GiB** — releasing **10 GiB**. The measurement counts the space occupied on disk and counts only once the files with hard links.

The retired history is preserved in three compressed files and a manifest, with about **2.1 GiB** in total. There is no 20 GiB code: the versioned code occupies about 66 MB; the rest includes tools, dependencies, cryptographic artifacts, databases, compilations and that backup.

## What is in each folder

| Location | Function |
| --- | --- |
| `.internal/runtime/` | Compatible execution routes, restored dependencies, original artifacts and associated laboratories |
| `.internal/dev/toolchains/` | Node, compilers and other local tools used by commands |
| `.internal/dev/drafts/` | Candidates and patches pending integration |
| `.internal/dev/reports/` | Current reports and evidence linked by documentation |
| `.local/` | Private configurations, keys, databases, Vaults, journals, laboratory status and caches |
| `.local/history/` | Backups compressed during cleanup; not part of the product code |
| `.local/cache/npm/` | Npm shared cache for host, applications and profiles; regenerable |
| `apps/mobile/node_modules/` and Android compilations | Installed dependencies and mobile client outputs |

Preparation of `.internal/runtime/` is explained in [STRUCTURE.md](STRUCTURE.md). Part of the project still depends on its routes and hashes. Cleaning does not eliminate such compatibility or change your verifications.

Executable policy is at [`local-resources.json`](../scripts/development/local-resources.json): distinguishes tools, originals, dependencies, private status, copies, generations, reports, compilations, caches and inherited helpers. An unknown path is pointed out and preserved; it does not automatically convert to cache.

```sh
./dev resources status
./dev resources check
```

The inventory counts disk blocks, deduplicates hard-linked files and does not follow symbolic links or read key content or databases. `check` returns code 1 if unclassified resources appear. This classification does not move the private state. Originals under `.internal/dev/cache/public-crs/` are preserved even if its historical route contains the word `cache`.

The npm cache has a unique location. To move an old installation:

```sh
./dev resources migrate-caches
./dev resources migrate-caches --apply
```

The transfer retains the files by rename, rejects paths with aliases, versioned files and existing destinations, and checks that there are no processes using folders. Repeating a completed migration moves nothing.

## Preview and apply

From the root:

```sh
./dev clean
./dev clean --scope caches
./dev clean --scope history
./dev clean --apply
```

Without `--apply`, the commands show the selection and its space without modifying files. `--scope caches --apply` removes only the exact caches declared by policy; `--scope history --apply` compacts only selected history. The default scope `all` also includes eligible temporary copies:

- Temporary check frames and old working copies.
- Public Staging I84 which is already materialized and verified at its destination.
- Regenerable Gradle and Go caches, and failed BSC compilation outputs;
preserves the Python environment required.
- Selected drafts and historical reports, after compacting them and
verifying their backup.
- Selected large historical captures of `reopen-state*` and
`wrapped-runtime-capture`, also with restorable backups.

Cleaning a cache can cause the next build to re-download dependencies or recompile. Cleaning does not reinstall packages or run `npm ci`.

## What is conserved

The selection retains code, active tools and binaries, BSC databases, local configurations and keys, Vaults, journal, locks, economic status and current APK. It also retains the originals of compilation and testing, including the sets of 45 and 100 archives and their manifests, the cryptographic artifacts and the resources needed to use them. These originals are not replaced by regeneration during cleaning.

Mobile SOURCE candidates not yet integrated remain in `.internal/dev/drafts/continuous-networks-v1/spl-source-mobile-economic-v4/` and `spl-source-mobile-sdk-ui-v4/`. Current diagnostic summaries and files linked directly by the guides are also available.

Local custody data, keys and checkpoints have a function other than a cache. They do not recover by installing dependencies. The command does not treat them as regenerable material.

## Compacted history and restoration

Every clean that compacts history creates a folder `.local/history/cleanup-*/`. Contains `manifest.json` and archives `drafts.tar.gz`, `reports.tar.gz` and `snapshots.tar.gz` corresponding to the classes selected. The manifest retains routes, hashes and modes; the backup is checked before removing the selected originals.

To recover one class of the last backup available:

```sh
./dev clean --restore drafts
./dev clean --restore reports
./dev clean --restore snapshots
```

The restore returns the files to their original paths and refuses to overwrite an existing file with different content. Recovering a draft returns it to the local history: it does not integrate it into the canonical code. Deleted regenerable caches are rebuilt using their tools; these three backup files correspond to the selected history.

Cleaning and restoration do not start an economic campaign or demonstrate the closure of a product target. Functional status and remaining work are maintained at [STATUS.md](../STATUS.md).
