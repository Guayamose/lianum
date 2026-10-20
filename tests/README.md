# Tests

<p><a href="../README.md"><img src="../docs/assets/lianum.svg" width="110" alt="Lianum"></a></p>

[Documentation](../docs/README.md) · [Architecture](../docs/ARCHITECTURE.md) · [Validation](../docs/VALIDATION.md)

`integration/` contains acceptance flows, launchers and fixtures by domain. Component tests live beside their owners, for example `apps/mobile/tests/` and `packages/backend/tests/`.

Use `./dev test --component mobile`, a specific `./dev test path/to/test.mjs`, or inspect selection with `./dev test --changed --plan`. The executable catalog determines the default host selection. Some historical scenarios need original laboratory artifacts and resources; the existence of a test file does not make the full laboratory portable. [Validation](../docs/VALIDATION.md) distinguishes host, proof, network and physical-device evidence.
