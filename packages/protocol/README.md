# Protocolo heredado

`src/` contiene la implementación y `tests/` sus pruebas por dominio.

| Dominio | Responsabilidad |
| --- | --- |
| `accounts/`, `cohorts/` | Cuentas, sesiones y cohortes |
| `notes/`, `crypto/` | Notas, compromisos y primitivas criptográficas |
| `assembly/`, `finality/` | Composición y controles de finalidad |
| `payments/`, `recipients/`, `recovery/` | Pagos, destinatarios y recuperación |
| `wallet/` | Custodia, notas, recursos y runtime de la wallet anterior |
| `execution/` | Grafo PAEG, cuentas, balances, ejecución local y nativa |
| `native/`, `chains/`, `evidence/` | Activos nativos, adaptadores y evidencia |
| `core/`, `api/` | Modelo y API del motor |

Este paquete conserva una generación anterior del protocolo. Sus módulos y escenarios no equivalen a una segunda aplicación actual; algunos tienen dependencias históricas incompletas.
Las carpetas presentes reflejan el código conservado de cada generación.

Las entradas públicas de `@lianum/protocol` están en
[`package.json`](package.json). Consulta [Módulos y dependencias](../../docs/MODULES.md)
para consumirlas y comprobar los límites entre componentes.
