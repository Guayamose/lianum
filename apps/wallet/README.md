# Aplicación wallet

| Carpeta | Para qué sirve |
| --- | --- |
| [src/client](src/client/) | Pantalla web: entrada, estado y funciones de usuario |
| [src/server](src/server/) | Arranque y servidor HTTP; seguridad y errores separados |
| [tests](tests/) | Pruebas del servidor, interfaz e integración |
| [docs](docs/) | Diseño de UI y contratos de interacción anteriores |

Empieza por [app.mjs](src/client/app.mjs) para la interfaz o por
[server.mjs](src/server/server.mjs) para las rutas HTTP. Las funciones de
cuentas, cartera, DeFi, reclamaciones y retiradas están en
[src/client/features](src/client/features/).

El recorrido de Uniswap y MetaMorpho está en la [guía de uso](docs/DEFI-USAGE.md).

Desde la raíz del proyecto: `npm run dev`. `./dev test` ejecuta la selección
verificada de pruebas del host. Las pruebas restantes en `tests/` incluyen
recorridos históricos con dependencias o laboratorios propios.

En modo `exact-only`, la pantalla puede revisar TOP_UP, EXIT y las acciones
DeFi conectadas. El host original entrega explícitamente un permiso distinto
para cada revisión mediante `getExactActionReview()` y
`acceptExactActionAccess({ review, access })`. Después se marca la casilla de
consentimiento y se confirma. Cancelar, editar, actualizar o abandonar la
página invalida el permiso recibido. El servidor conserva sus comprobaciones
de cuerpo exacto, destino original, vigencia y consumo único.

Este canal vincula lo mostrado al permiso existente: no crea autoridad, claves,
preparaciones ni pruebas. GRAPH, recuperación F y notas nativas conservan su
handoff específico; las retiradas wrapped usan su propio contrato. Las pruebas
del canal emplean el registro real del servidor con servicios inferiores
sintéticos. El recorrido financiado en navegador requiere su aceptación aparte.
