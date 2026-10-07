# Laboratorio EVM de desarrollo

Desde la raíz del proyecto:

```bash
./dev lab prepare  # Artefactos públicos, sin nodos ni pruebas de usuario
./dev lab          # Laboratorio nuevo, pruebas reales y cierre de procesos
```

El segundo comando crea cuentas de prueba nuevas, arranca Anvil exclusivamente
local y usa PALT/BLTV ficticios. Financia una nota privada, revisa y confirma el
grafo con la API/SDK real de la wallet y permisos exactos de un solo uso, reserva
el pago, genera las pruebas de las relaciones PAEG y liquida contra una entrega
real en la bóveda. Luego reinicia la custodia de los propietarios, reabre el mismo
journal del coordinador, retira las notas y redime las participaciones.

La confirmación inicial de financiación descarta deliberadamente la respuesta
HTTP después de que el servidor real la admite. El SDK conserva la incertidumbre,
no reenvía y la comprobación lee el journal original. También se comprueban los
permisos consumidos, permisos de un listener sustituido, reconciliación terminal
y rechazo del segundo pago. La pérdida de respuesta es una inyección controlada
en el cliente; no simula una partición física de la red.

El script revisa y confirma con el SDK, HTTP y el modelo compartido de la wallet.
Después de verificar la admisión exacta detiene la custodia de destino antes de
la entrega. No hay una persona navegando una pantalla durante esta aceptación:
`walletSdkEvmFlowCompleted` y `manualConsentContractVerified` describen el contrato
de software comprobado; `browserVisualAcceptance` permanece falso.

Los presupuestos originales permanecen: al menos 2,5 GiB de RAM disponible,
5 GiB libres, máximo 3 GiB de RSS por worker pesado y un único worker pesado.
El supervisor conserva un plazo máximo de 90 minutos con reserva para cierre.
Ctrl+C pide el cierre al supervisor, que verifica sus procesos propietarios.

## Compilación revisada, distinta de la evidencia histórica

Faltaban la compilación del ledger, los fixtures de activos/router y los informes
históricos de la compilación conjunta de verificadores. No se fabrican esos
informes. El bootstrap crea `.local/development-evm/v1/` dentro del runtime
ignorado por Git, con un manifiesto determinista identificado como una compilación
nueva. El loader exige el hash literal revisado en
`packages/backend/src/operations/deployments/system/development-evm-build.mjs`.

Se conservan los hashes originales de fuentes, AST, ABI y artefactos del ledger
y del router. Las once compilaciones de verificadores recuperadas coinciden
exactamente en fuentes, AST, contratos, compilador y ajustes con las nuevas.
La relación de admisión ausente se compila y prepara con el circuito real,
Noir/Barretenberg y CRS originales. La cadena completa de sus nuevos informes
se verifica antes de usar su clave; no se reemplaza la comprobación por una
clave, hash o ruta proporcionados por el llamador.

Los IDs y tiempos de generación no forman parte de la identidad determinista
nueva: se fijan ABI, ACIR, clave, Solidity y artefactos compilados. Los loaders
siguen validando los recibos auténticos de cada generación. El verificador de
retirada de outputs usa la copia pública M15, cuyo hash coincide exactamente con
la copia M23 perdida. Su linaje histórico sigue siendo de fuente; la aceptación
actual debe comprobar su uso realmente.

## Evidencia y límites

El resultado resumido queda en `.internal/dev/reports/evm-lab.json`. Los hashes
permiten relacionarlo con los resultados y mediciones originales de esta NUEVA
ejecución. Las claves y journals privados quedan en directorios con permisos
restringidos dentro de `.internal/`; no se añaden a Git. El arranque no escribe
al laboratorio público archivado en `/workspace`.

Esta aceptación cubre una EVM sintética y una generación de cuenta. No demuestra
finalidad de una red pública, privacidad de metadatos, operadores independientes,
interfaz visual móvil, reinicio completo del backend o aceptación de siete redes.
La recuperación incluida observa un grafo ya liquidado; una devolución F tras
vencimiento necesita su propio escenario. `fullWalletAcceptance` permanece falso
incluso cuando este recorrido concreto termina correctamente.
