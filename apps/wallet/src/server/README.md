# Servidor de la wallet

`run.mjs` es la entrada de consola y `server.mjs` compone las sesiones y
las rutas HTTP. `security/` controla capacidades exactas de acción;
`errors/` transforma errores en respuestas públicas.

El servidor utiliza los módulos de `packages/backend/src/`. Se arranca
desde la raíz con `npm run dev`.
