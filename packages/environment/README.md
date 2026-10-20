# Source locations and portable execution

<p><a href="../../README.md"><img src="../../docs/assets/lianum.svg" width="110" alt="Lianum"></a></p>

[Documentation](../../docs/README.md) · [Architecture](../../docs/ARCHITECTURE.md) · [Validation](../../docs/VALIDATION.md)

`sourcePath` and `sourceURL` locate active source. `resourceRoot(family)` and `resourcePath(family, relative)` locate separate resources. Supported families are `engine`, `wallet`, `crypto`, `components` and `protocol`; the retained `legacyDataRoot` API delegates to `resourceRoot`.

In an ordinary checkout, resources keep their historical locations. A candidate produced by `scripts/development/source_bundle.py` uses `runtime-resources.json` to locate them under `resources/`, without falling back to `.internal/runtime`. The descriptor travels with source and still works when a worker clears its inherited environment.

The packager preserves source bytes, follows literal imports, resolves workspace exports and creates one link per package. Expression-based module loads and directory enumeration require explicit `--include-source` declarations. It does not rewrite historical paths or pins; the manifest records its exact scope.

## External resource manifest

Each SHA256 must come from the reviewed public resource. Available bytes are checked before the candidate directory is published.

```json
{
  "schema": "LIANUM_EXTERNAL_RESOURCES_V1",
  "files": [
    {
      "source": "node/bin/node",
      "path": "tools/node",
      "scope": "resources",
      "kind": "toolchain",
      "sha256": "<expected executable SHA256>",
      "mode": "0755"
    }
  ]
}
```

`source` is relative to the supplied external directory. With `scope: "resources"`, `path` is relative to `resources/`. Normal npm dependencies use `scope: "dependency"`, require `kind: "npm-package"` and a path beginning with `node_modules/`. Every file, including transitive dependencies, is declared and checked. Libraries expected by historical validators use the exact family-relative path with `scope: "resources"`.

Allowed kinds are `toolchain`, `public-parameter`, `public-artifact`, `historical-source` and `npm-package`. Only public resources belong in this manifest. The command does not discover or copy credentials, private directories, journals, witnesses or sessions. Symlink inputs and duplicate destinations are rejected. It downloads nothing and generates no proofs or keys. Missing or mismatched resources stop creation without replacing originals.

## Build, verify and run

```sh
python3 scripts/development/source_bundle.py build \
  --entry packages/proofs/src/jobs/role-process.mjs \
  --include-source packages/proofs/src \
  --resources /public/worker-resources.json \
  --resource-root /public/resources \
  --node-resource tools/node \
  --cwd-family wallet \
  --output /candidates/worker-v1

python3 /candidates/worker-v1/run-source-bundle.py verify
python3 /candidates/worker-v1/run-source-bundle.py run \
  --expected-sha256 CANDIDATE_MANIFEST_HASH -- authorization
```

The destination must be new. `--state-directory` declares writable state paths relative to `resources/`; they cannot contain manifest-pinned resources. Before executing the included Node directly, the launcher rechecks source, resources, permissions and links. It preserves worker arguments and forwards only `LANG` and `PATH`, without an extra wrapper module or Node arguments. Python and the executable's required system libraries are host prerequisites. Node and program dependencies are explicit resources.

A successful build is a **candidate** with `financialAcceptance: false`. Supervisor, capability, pin, custody and release checks remain active. A supervised role cannot run independently merely because it has been packaged; a generation requiring historical paths/hashes may reject the candidate. Dynamic loads need review for each worker. Bundle creation does not demonstrate every execution path.

The offline `test_source_bundle.py` moves a candidate, removes its minimal source checkout and runs a worker without `.internal`. It also checks module identity, manifest reproducibility, missing/altered resources, unexpected files, modified links and declared state paths.
