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

Desde la raíz del proyecto: `npm run dev`. Para probar esta aplicación,
`./dev test apps/wallet/tests`. Esa selección incluye el fallo previo del
mock del servidor; no equivale a la selección corta de `npm test`.
