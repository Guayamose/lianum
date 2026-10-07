# Pruebas

`integration/` contiene flujos de aceptación, lanzadores y fixtures
organizados por dominio. Las pruebas de cada componente están en su carpeta
`tests/`, por ejemplo `apps/wallet/tests/` y `packages/backend/tests/`.

`npm test` ejecuta la selección habitual de nueve archivos. Puedes elegir
archivos o carpetas con `./dev test ruta`. Algunos escenarios heredados
requieren artefactos y recursos del laboratorio original; consulta el estado
del proyecto antes de interpretar el conjunto como una suite portátil completa.
