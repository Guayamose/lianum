# Integración

| Carpeta | Escenarios |
| --- | --- |
| `wallet/` | Wallet manual, nativa y wrapped |
| `accounts/`, `portfolio/` | Recuperación de cuentas y cartera |
| `chains/` | Flujos específicos de EVM y Solana |
| `claims/` | Ingreso, inventario, salud, grafo y pagos de reclamaciones |
| `native/`, `claims/graph/policies/` | Flujos nativos y políticas de grafo |
| `pools/`, `deployments/` | Generaciones de pools y despliegues |
| `proofs/` | Compilación y verificación de pruebas |
| `fixtures/` | Datos y runtimes de soporte |
| `runners/` | Catálogo, tareas y lanzadores comunes |

Esta carpeta mezcla pruebas Node y flujos de aceptación con requisitos de
laboratorio. No toda ella forma parte de la selección rápida de `npm test`.
Los nombres `run-*` identifican lanzadores y `*.test.mjs` pruebas Node.
