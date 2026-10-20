# Solidity contracts

<p><a href="../README.md"><img src="../docs/assets/lianum.svg" width="110" alt="Lianum"></a></p>

[Documentation](../docs/README.md) · [Architecture](../docs/ARCHITECTURE.md) · [Validation](../docs/VALIDATION.md)

`wallet/` contains the contracts consumed by the current wallet. `engine/` and `protocol/` retain the contracts of their corresponding engines.

Inside the wallet there are pools, receipt hubs, codecs, verifiers and specific contracts of claims and native assets. Version names identify existing contracts. `npm run check` checks ABI compilation and types; does not validate deployments.
