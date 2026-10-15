# Backend

Este paquete compone las cuentas, la custodia, las redes, la ejecución y los
workers. Las aplicaciones lo consumen por sus APIs; backend no importa código
de aplicaciones ni implementaciones de tests o experiments.

| Dominio en `src/` | Responsabilidad |
| --- | --- |
| `api/` | HTTP, clientes y sesiones de wallet, cuentas y reclamaciones |
| `accounts/` | Autoridad, almacenamiento, cartera, runtimes y recuperación de cuentas |
| `chains/` | Adaptadores y runtimes por cadena; composición EVM local |
| `custody/` | Procesos y observadores del propietario que necesitan cuentas o redes |
| `claims/` | Autorización, emisión, almacenamiento, pagos y recuperación de reclamaciones |
| `execution/` | Preparación, ejecución y reconciliación del protocolo PAEG |
| `proving/` | Integración de pruebas criptográficas con cuentas, ingresos y claims |
| `defi/` | Vaults, posiciones, entregas y retiradas DeFi |
| `providers/` | Proveedores que ejecutan operaciones |
| `coordination/`, `payments/` | Composición de cohortes y orquestación de pagos |
| `operations/` | Despliegues, operadores, composición local y verificaciones de releases |
| `storage/` | Escritura de registros privados auxiliares |

Entradas habituales:
[sesión de cuentas](src/api/accounts/flat-account-session.mjs),
[cliente wallet](src/api/wallet/wallet-application-client.mjs) y
[servicio HTTP wallet](src/api/wallet/http-service.mjs).
La app web añade la lista de recursos visuales; el servicio HTTP funciona sin
importar la app. `services/api-server` compone su entrada de API y los perfiles locales.

La autoridad nativa conserva su fábrica y controles de identidad, exclusión y
cierre. Sus operaciones se organizan en
[accounts/authority/native-value](src/accounts/authority/native-value/README.md):
depósitos, reservas, ejecución, retiradas y ciclo manual. Los puertos de journals
ofrecen escrituras concretas; no entregan el registro ni la contraseña completos.
`./dev static` comprueba los contratos de composición declarados.

El [keeper duradero](src/accounts/storage/durable-generic-account-keeper.mjs)
posee sus marcas y validación SOURCE; consume el coordinador genérico de engine.
Los procesos y observadores de `src/custody/` componen la custodia de claves que
pertenece a `@lianum/custody`. Jobs y herramientas criptográficas compartidas
pertenecen a `@lianum/proofs`.

Las fábricas de despliegues y recuperación usadas también por pruebas viven en
`src/operations/` y `src/claims/`. Sus antiguas entradas de fixtures reexportan
el mismo propietario. Los escenarios, las aserciones y los fallos simulados
permanecen en `tests/`.

El grafo entre paquetes es acíclico, pero quedan ciclos internos de composición
SOURCE, recuperación y ejecución. Conservan capacidades vinculadas a objetos
originales y requieren seguir separando responsabilidades sin debilitar sus
validadores. El inventario vigente está en [Módulos y dependencias](../../docs/MODULES.md)
y `./dev boundaries`; las APIs públicas están en [package.json](package.json).
