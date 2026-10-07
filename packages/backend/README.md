# Backend

`src/` contiene la implementación, `tests/` sus pruebas y fixtures, y
`docs/` los contratos documentados. Las pruebas siguen la misma división
por dominio que el código.

| Dominio en src/ | Responsabilidad |
| --- | --- |
| `api/` | Transporte, clientes y sesiones de wallet, cuentas y reclamaciones |
| `accounts/` | Autoridad, almacenamiento, cartera y recuperación de cuentas |
| `chains/` | Adaptadores por cadena y componentes compartidos |
| `claims/` | Autorización, emisión, almacenamiento y pagos de reclamaciones |
| `execution/` | Preparación, ejecución y reconciliación del protocolo PAEG |
| `defi/` | Vaults, posiciones, entregas y retiradas DeFi |
| `providers/` | Proveedores que ejecutan operaciones |
| `operations/` | Planes de despliegue, operadores y verificaciones de releases |

Entrada de cuentas:
[flat-account-session.mjs](src/api/accounts/flat-account-session.mjs).
Cliente de la aplicación:
[wallet-application-client.mjs](src/api/wallet/wallet-application-client.mjs).
