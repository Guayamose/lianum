# Contratos Solidity

`wallet/` contiene los contratos consumidos por la wallet actual.
`engine/` y `protocol/` conservan los contratos de sus motores correspondientes.

Dentro de la wallet hay pools, receipt hubs, codecs, verificadores y contratos
específicos de reclamaciones y activos nativos. Los nombres de versión
identifican contratos existentes. `npm run check` comprueba compilación ABI
y tipos; no valida despliegues.
