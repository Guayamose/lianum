# Poseidon cryptography

<p><a href="../../README.md"><img src="../../docs/assets/lianum.svg" width="110" alt="Lianum"></a></p>

[Documentation](../../docs/README.md) · [Architecture](../../docs/ARCHITECTURE.md) · [Validation](../../docs/VALIDATION.md)

`src/` contains the candidate implementation; `circuits/` its circuits; `lib/` Noir libraries; `test/` tests; and `vendor/` external sources. Candidate tooling lives in `scripts/`.

`src/portable/poseidon2-bn254-v1.mjs` is the BigInt implementation shared by engine and mobile, exported as `@lianum/crypto/portable-poseidon2`. Preserve its official vectors and license. The former mobile entry point re-exports it; changes to this primitive belong here. BigInt arithmetic is not constant-time, and primitive tests alone do not establish economic acceptance.

It is a cryptographic component of the project, not an independent application.

Public exports are declared in [`package.json`](package.json). [Modules and dependencies](../../docs/MODULES.md) explains their consumers and component boundaries.
