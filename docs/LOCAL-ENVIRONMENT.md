# Source, resources and local state

[Documentation](README.md) / Development / Local resources

A source checkout contains editable product code, tests, deployment tooling and sanitized evidence. Local dependencies, authenticated proof resources, private custody and generated outputs have separate lifecycles.

## Directory policy

| Location | Role | Treatment |
| --- | --- | --- |
| `apps/`, `services/`, `packages/`, `contracts/` | Editable product implementations | Versioned source |
| `scripts/`, `infra/`, `docs/` | Tooling, deployment and public documentation | Versioned source |
| `.internal/dev/toolchains/` | Verified local compilers and runtimes | Prepared/restored resources |
| `.internal/runtime/` | Retained resources and compatibility paths | Preserve the selected profile's required identities |
| `.local/` | Private keys, vaults, journals, databases, development networks and backups | Private; never treat the whole tree as disposable |
| `node_modules/`, application build directories | Installed dependencies and build products | Regenerable through their declared tooling |
| `.local/cache/npm/` | Shared npm download cache | Regenerable under the resource policy |

A directory named `cache` can still hold authenticated original material. The executable classification is [`local-resources.json`](../scripts/development/local-resources.json); the public resource inventory is [`public-resources.json`](../scripts/development/resources/public-resources.json).

## Inspect before changing

```sh
./dev resources status
./dev resources check
./dev clean
```

Inventory counts allocated disk blocks, deduplicates hard links and does not read key/database contents. Unknown paths are reported and preserved. Without `--apply`, cleanup commands show their selection without removing files.

## Apply a declared cleanup

```sh
./dev clean --scope caches
./dev clean --scope caches --apply
./dev clean --scope history --apply
```

The policy restricts exact regenerable paths and checks for active users. Selected historical drafts/reports/snapshots are compacted with manifests and verified before removal; they are not silently promoted into source. Changing resource classification does not authorize replacement of an immutable cryptographic artifact.

<details>
<summary><b>Cache migration and retained cleanup recovery</b></summary>

```sh
./dev resources migrate-caches
./dev resources migrate-caches --apply
./dev clean --restore drafts
./dev clean --restore reports
./dev clean --restore snapshots
```

Migration rejects aliases, versioned files, occupied paths and conflicting destinations. Restoration returns retained history to its original location without overwriting differing content. Regenerable caches are recreated by their owning tools.

</details>

## Source integrity and deployment

Source-generation manifests bind current consumers to authenticated original resources. Preparing or adopting a generation is separate from deploying it or demonstrating a financial operation. A checkout cannot restore a private owner's custody or a previous laboratory's state.

[Source generations](SOURCE-GENERATIONS.md) · [Portable bundles](../packages/environment/README.md) · [Workflow](WORKFLOW.md) · [Validation](VALIDATION.md)
