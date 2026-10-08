# Diagnóstico de las auditorías CLAIM y GRAPH

Desde la raíz, en Linux/WSL con los originales restaurados:

```sh
./dev lab audit-base
```

El comando prepara los artefactos públicos y crea un laboratorio EVM, Bitcoin
y Solana con claves sintéticas. Después llama secuencialmente a `audit()` de
tres operadores CLAIM y tres GRAPH originales, sobre inventarios vacíos.
Conserva los límites, verificaciones, identidad y limpieza del supervisor
existente. No crea owners, fondos, pruebas, autorizaciones ni payouts durante
la medición. El bootstrap sí despliega contratos y crea claves locales.

El resumen queda en `.internal/dev/reports/empty-audit-lab.json`. Cada intento
conserva sus fuentes, recursos, resultado y diagnósticos privados bajo
`.internal/runtime/omnichain-flat-profile/flat-wallet/.local/native-claim-empty-audit-metrics-v1/`.
No ejecutes otro laboratorio o prover al mismo tiempo.

## Primera aceptación

Intento `09f6f025-0086-4dc8-9838-5c624bc82692`, sobre `4c61d57`, aceptado y
cerrado el 8 de octubre de 2026. El comando completo duró 64,308 s,
incluyendo preparación y arranque. Las seis llamadas terminaron:

| Operador | Tiempo de la llamada |
| --- | ---: |
| CLAIM 0 | 307,197 ms |
| CLAIM 1 | 338,083 ms |
| CLAIM 2 | 319,190 ms |
| GRAPH 0 | 674,504 ms |
| GRAPH 1 | 677,792 ms |
| GRAPH 2 | 646,467 ms |

La revisión raíz unió 461 archivos de fuentes/API/vendor y comprobó
6.459 archivos públicos, generados y originales antes/después, además de
13 artefactos de preparación. Los 21 PID conservados en las observaciones
y recibos estaban ausentes después; los cuatro locks desaparecieron.
No hubo señales del auditor ni cierre forzado. Se retiraron scratch y
claves/ledgers sintéticos. Solana conserva `nativeOrderlyExit=false` y
`nativeStopFailure=null`.

Resultado SHA256 `3e16c78f0368a15efde0852edcc7cc515a18eb92135f90ff1c21c5c663989ed0`.
Recursos SHA256 `2e161218baece4f9899380bacecc80b1370e5192d441dbee61900f4bff91cd7c`.
Fuentes SHA256 `5435c42840db8f585e7e19f889bcc1a2e800756b3ee8ada89d8d12108920f40e`.

Los epochs V4 y las historias persistidas conservan sus valores cero en
los ocho operadores. Ese contador tiene un alcance concreto: no mide
todas las firmas ni el uso de claves efímeras/anteriores. Los intervalos
CLAIM se solapan y su CPU incluye otros trabajos del proceso; no hay
contadores RPC. Esta aceptación mide la base vacía y **no explica todavía
el payout Solana caducado con fondos**, ni acepta un recorrido financiero.

La primera captura física falló antes de arrancar cadenas porque el
preparador ejecuta una fixture del workspace. Su rechazo permanece
conservado. La corrección incluye exactamente esa fixture y sus 23 imports
físicos, sin modificar el worker original ni admitir otras rutas.
