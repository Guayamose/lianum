# Custodia del propietario

Este paquete posee la custodia de claves, las autorizaciones de firma y los
bindings del propietario. Su entrada `@lianum/custody/owner` apunta a
[flat-owner-custody.mjs](src/signing/flat-owner-custody.mjs).

| Carpeta de `src/` | Responsabilidad |
| --- | --- |
| `signing/` | Custodia, envelopes autorizados y contrato de observación |
| `preparation/` | Bindings de preparación y consentimiento |
| `claims/` | Transiciones del propietario y entregas entrantes |

La composición que requiere sesiones, adaptadores de red o workers se encuentra
en `packages/backend/src/custody/`: allí están los procesos y observadores del
propietario, la preparación de operaciones y la integración con cuentas.
Así, este paquete consume engine y contratos compartidos sin importar backend
ni proofs. La custodia nativa de dispositivo sigue en `apps/mobile/src/custody/`.

Las marcas y permisos son capacidades vinculadas a sus objetos originales.
Las APIs públicas y sus reexports comparten las mismas funciones y registros;
una copia de datos o un callback de validación no sustituye esas identidades.

`tests/` agrupa las comprobaciones de custodia y los escenarios por dominio.
Los tests pueden consumir las composiciones backend sin convertirlas en una
dependencia del código de `src/`.

Consulta las entradas explícitas en [package.json](package.json) y la dirección
de dependencias en [MODULES.md](../../docs/MODULES.md). El estado de los ciclos
internos del producto se mantiene allí y en `./dev boundaries`.
