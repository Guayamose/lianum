# Source, resources and private state

The repository contains editable product source, tests, deployment scripts and the public evidence required by retained readers. A source clone intentionally excludes installed dependencies, compiled APKs, caches, private custody, service credentials, conversations and live financial state.

Verified local tools and restored resources belong under `.internal`; private state, reports and backups belong under `.local`. Use `./dev resources status` and the [source-generation guide](docs/SOURCE-GENERATIONS.md) to identify missing resources. A public source backup cannot restore an owner's keys or the state of a previous private laboratory.

The original delivery referred to `archive/delivery/EXCLUSIONS.md`. That historical path is not present in the current tree. Earlier names remain provenance, not an instruction to fabricate missing artifacts or remove integrity checks.

Presentation work under `lianum_pitch/` and large files under `demo_video/` are excluded from ordinary Git commits and remain on disk. Final delivery assets should be packaged separately from the source repository.
