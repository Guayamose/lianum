# Protocolo heredado

`src/` conserva la implementación histórica congelada y `tests/` sus pruebas.
Para cambiar comportamiento actual, trabaja en [`packages/engine`](../engine/README.md).

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

Las entradas de [`package.json`](package.json) se conservan para reproducción
histórica. El comprobador de módulos impide añadir consumidores activos de este
paquete y verifica que sus 63 fuentes originales no cambien. El inventario de
42 parejas con su implementación activa está en
[`historical-module-inventory.json`](../../scripts/historical-module-inventory.json).
Los destinos históricos no recuperados se enumeran en
[`static-check-exceptions.json`](../../scripts/development/static-check-exceptions.json).
Se conserva esa limitación; no se sustituyen con implementaciones de engine.
