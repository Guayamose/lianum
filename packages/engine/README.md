# Motor compartido

Engine contiene estado, coordinación genérica, almacenamiento y mecanismos de
protocolo compartidos. Lo consumen backend, custody y proofs. Sus fuentes no
importan esos paquetes superiores, aplicaciones ni conductores de pruebas.

| Dominio de `src/` | Responsabilidad |
| --- | --- |
| `accounts/`, `cohorts/` | Estado, coordinación y contratos de cuentas/cohortes |
| `notes/`, `crypto/` | Notas, cifrado, compromisos y transporte privado de pruebas |
| `assembly/`, `finality/` | Mecanismos de composición y controles de finalidad |
| `payments/`, `recipients/`, `recovery/` | Coordinación de pagos, destinatarios y mecanismos de recuperación |
| `wallet/` | Custodia, notas, recursos y mecanismos de sesión compartidos |
| `execution/` | Grafo PAEG, coordinación de cuentas, balances y ejecución local/nativa |
| `execution/inputs/` | Codificación de depósitos y construcción de witnesses compartidos |
| `native/`, `chains/`, `evidence/` | Identidad nativa, mecanismos de runtimes y evidencia |
| `claims/`, `encoding/` | Formatos, permisos y codificación de operaciones |
| `core/`, `api/` | Modelo y SDK del motor |
| `storage/` | Registro segmentado cifrado |

El coordinador genérico de checkpoints se edita en
[generic-account-keeper-core.mjs](src/execution/accounts/generic-account-keeper-core.mjs).
El keeper duradero con autoridad SOURCE pertenece a backend. Asimismo, las
composiciones de cuentas/pagos que combinan redes, custodia y un prover viven
en backend, mientras los procesos de prueba pertenecen a proofs.

La primitiva de ciclo de vida de procesos está en
[owned-process-lifecycle.mjs](src/chains/shared/owned-process-lifecycle.mjs).
El harness de runtimes añade las comprobaciones de binarios y recursos que
necesitan las redes locales. Las entradas públicas de protocolo y custodia
siguen validando sus capacidades originales.

`tests/` contiene las pruebas por dominio. `packages/protocol` conserva una
versión histórica inventariada; se desarrolla en engine sin actualizar esa
copia congelada para mantenerla igual.

Consulta las APIs explícitas en [package.json](package.json) y
[Módulos y dependencias](../../docs/MODULES.md). `./dev boundaries` controla las
fronteras y muestra por separado los ciclos internos pendientes del producto.
