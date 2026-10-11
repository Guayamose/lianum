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

La autoridad nativa compone operaciones desde `accounts/authority/native-value/`.
Depósitos, reservas, ejecución, retiradas, operaciones del propietario y ciclo
manual tienen módulos propios. `native-value-authority-journals.mjs` ofrece las
escrituras concretas de cada operación; los módulos no reciben el registro ni
la contraseña completos. La fábrica conserva identidad, exclusión y cierre.
`./dev static` contrasta los siete contratos con los miembros efectivamente
utilizados e impide ampliar sus objetos de composición con campos sobrantes.

`accounts/storage/durable-generic-account-keeper.mjs` posee el keeper duradero,
su WeakMap y la validación SOURCE. Consume el coordinador genérico de engine;
engine no necesita importar la sesión backend para coordinar checkpoints.
El ciclo original entre sesión y keeper duradero permanece explícito dentro
del backend, con las mismas comprobaciones de identidad.

Los formatos puros de `execution/encoding/{statements,commitments}.mjs` son
entradas de compatibilidad. Su implementación única pertenece a components.

Las entradas públicas de `@lianum/backend` están en
[`package.json`](package.json). Consulta [Módulos y dependencias](../../docs/MODULES.md)
para consumirlas y comprobar los límites entre componentes.
