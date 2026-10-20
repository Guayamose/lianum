# Develop Lianum

[Overview](../README.md) / [Documentation](README.md) / Development

Start with the component you want to change. The source tree separates mobile UI, authenticated services, shared financial libraries, contracts and proof resources. [The repository map](STRUCTURE.md) identifies their owners.

## Prepare a checkout

On Linux/WSL x64 with Git and Python 3.12+:

```sh
./dev prepare host
./dev status
./dev workflows
./dev check
```

The bootstrap verifies the pinned official Node 24.19.0 archive and binary without replacing global Node. `status` reports installed tools/dependencies; `check` covers module boundaries, syntax/imports, declared checkJs contracts, workflow documentation and the bounded host selection. Neither command launches a funded financial campaign.

## Work on an application

| Component | Preparation | Reference |
| --- | --- | --- |
| Mobile | `./dev prepare mobile` | [Mobile setup and APK build](../apps/mobile/README.md) |
| API | `./dev prepare api-server` | [API service](../services/api-server/README.md) |
| Agent | `./dev npm --prefix services/agent ci --ignore-scripts` | [Agent setup and configuration](../services/agent/README.md) |
| Proof/network laboratory | `./dev lab profiles` then the selected profile | [Laboratory profiles](LAB-PROFILES.md) |

Credentials belong in local configuration based on the component's `.env.example`. Custody, conversations, provider keys, live journals and build outputs remain outside Git. [Local resources](LOCAL-ENVIRONMENT.md) explains the directory policy.

## Choose a bounded check

```sh
./dev test --changed --plan
./dev test --changed
./dev test --component mobile
./dev test --component agent
./dev npm --prefix apps/mobile run typecheck
```

Run the affected regression/component first and the repository check once when closing a code change. [Workflow](WORKFLOW.md) explains selection, limits, static checks and source adoption. [Commands](COMMANDS.md) is generated from the executable catalog.

<details>
<summary><b>Broader local checks and retained-resource workflows</b></summary>

```sh
./dev doctor
./dev sources status
./dev sources prepare --adopt
./dev block-check --plan
./dev block-check --timeout 7200 --stage-timeout 600
```

The full block plan inventories the retained Node/Python test files and records exclusions. Execution audits imports, module boundaries, static analysis, mobile TypeScript and selected tests. A timeout, unsupported format, orphaned process or source change is not a passing result.

Real PostgreSQL checks require Docker and `./dev npm --prefix services/api-server run test:postgres`. Browser checks use `./dev npm run test:browser` with local Chrome and the declared Playwright dependency. These paths have separate prerequisites and evidence.

Historical restoration uses `./dev setup`, `import`, `restore-package` and `canonical` only when the selected retained profile needs them. [Source generations](SOURCE-GENERATIONS.md) documents resource verification and original-artifact reuse; [the EVM laboratory](EVM-LAB.md) provides economic/proof setup.

</details>

## Documentation and artwork

The Markdown library links product explanations to detailed module and API references. SVG artwork uses the same ivory/slate palette, outlined extruded boxes and mono labels as the technical/security reports.

```sh
python3 -B scripts/documentation/build_assets.py
# Optional PNG fallbacks: requires local Google Chrome.
python3 -B scripts/documentation/build_assets.py --render
python3 -B scripts/documentation/check.py
```

The drawing sources live in [`scripts/documentation`](../scripts/documentation). The current detailed architecture remains an editable SVG in [`docs/assets`](assets). Keep image captions and text explanations aligned so the documentation remains readable without rendering images.

[Workflow](WORKFLOW.md) · [Module ownership](MODULES.md) · [Validation scope](VALIDATION.md)
