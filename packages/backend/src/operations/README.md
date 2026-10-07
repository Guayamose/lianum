# Composición y operación del sistema

`deployments/` contiene planes, artefactos y composición de despliegues.
`operators/` contiene operadores e inventarios.
`releases/` contiene pines, procedencia y verificaciones de releases.
`payouts/` valida autorización y recogida de pagos.
`recovery/` conserva checkpoint y recuperación.
`validation/` verifica hechos y límites de fuentes.

Las subcarpetas `claims/`, `native-value/`, `wrapped/`, `defi/` y
`system/` indican el consumidor. Estos módulos no son el arranque HTTP:
ese arranque está en `apps/wallet/src/server/`.
