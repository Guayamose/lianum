# Adaptadores de cadenas

`evm/`, `bitcoin/`, `solana/` y `tron/` contienen la implementación
específica de cada cadena. `shared/` conserva contratos comunes entre cadenas.

Dentro de cada cadena, `runtime/` gestiona sus recursos;
`observations/` recoge observaciones; `transfers/` maneja transferencias;
`health/` expone salud; `dispatch/` valida envíos; `contracts/` comprueba
contratos; y `vault/` adapta entregas por vault cuando existe esa función.
`shared/portfolio/` concentra el registro y la lectura de cartera.

Pruebas en `packages/backend/tests/chains/`; fixtures en
`packages/backend/tests/fixtures/chains/`.
