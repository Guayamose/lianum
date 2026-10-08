# Laboratorio EVM de desarrollo

Desde la raíz del proyecto:

```bash
./dev lab prepare  # Artefactos públicos, sin nodos ni pruebas de usuario
./dev lab          # Laboratorio nuevo, pruebas reales y cierre de procesos
./dev lab recovery # Otro laboratorio nuevo: entrega real y devolución F tras vencimiento
./dev lab browser  # Wallet DOM real, quince pruebas y salidas en estado nuevo
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

El perfil `browser` es independiente: conserva ese mismo núcleo y sus
autoridades, pero financiación, revisión, ejecución, reconciliación y salida se
confirman mediante la interfaz web real en Chrome con sandbox. El driver compara
cada término original y comprueba que la casilla empieza sin marcar antes de
importar el permiso de un solo uso. Al descartar una respuesta HTTP ya admitida,
la interfaz conserva UNKNOWN y consulta la operación original sin reenviarla.
Los replays negativos se prueban por HTTP y no realizan acciones financieras.

La custodia Linux prepara importe, destino y testigo fuera del navegador. Este
perfil no convierte la wallet web en custodia móvil autónoma. Fija la distribución
de Chrome y Playwright y verifica identidad, grupo, UID, sandbox y cierre de
cada proceso propio. El contrato DOM sintético y el recorrido financiero nuevo
de quince pruebas genuinas ya pasaron; sus evidencias se distinguen más abajo.

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

La última ejecución SDK retuvo quince pruebas reales y llegó a las tres
retiradas originales, pero fue rechazada al preparar la redención: el puente
DeFi llamaba a una ruta heredada incompatible con el keeper manual. El fallo
se corrigió y MetaMorpho validó el puente con D26/W39 reales. Después se aceptó
un recorrido completo nuevo desde el DOM real de la wallet, descrito más abajo.
El intento SDK anterior conserva su rechazo; no se reutilizaron sus pruebas.
La recuperación F está aceptada en su propio escenario separado.

El resultado resumido queda en `.internal/dev/reports/evm-lab.json`. Los hashes
permiten relacionarlo con los resultados y mediciones originales de esta NUEVA
ejecución. Las claves y journals privados quedan en directorios con permisos
restringidos dentro de `.internal/`; no se añaden a Git. El arranque no escribe
al laboratorio público archivado en `/workspace`.

El perfil de navegador retiene su resumen separado en
`.internal/dev/reports/evm-browser-lab.json`. No reutiliza un intento SDK o F.
Una ejecución fallida conserva su fallo y no cuenta como aceptación del
navegador, aunque haya generado pruebas válidas antes de fallar.

Esta aceptación cubre una EVM sintética y una generación de cuenta. No demuestra
finalidad de una red pública, privacidad de metadatos, operadores independientes,
interfaz visual móvil, reinicio completo del backend o aceptación de siete redes.
La recuperación de `./dev lab` observa un grafo ya liquidado. `./dev lab recovery`
comprueba una devolución F real en su propio escenario. `fullWalletAcceptance` permanece falso
incluso cuando este recorrido concreto termina correctamente.

El escenario de recuperación interrumpe deliberadamente después de una única
entrega nativa verificada y antes de la prueba/liquidación global. Conserva el
error original, reabre el mismo journal del coordinador y sustituye el listener
con ambos procesos owner ausentes. Adelanta sólo el reloj del Anvil propietario
al cutoff originalmente autorizado; la wallet revisa y confirma la recuperación
original, genera la prueba F y comprueba que una segunda recuperación y una
reconciliación no crean otra prueba, pago ni entrega. Reinicia después los owners
y recupera las notas originales. El error público sigue filtrado como
`FLAT_ACCOUNT_OPERATION_FAILED`; no se amplía el contrato público para exponer
el código privado de la inyección. El resumen separado queda en
`.internal/dev/reports/evm-recovery-lab.json`.

El escenario exige siete pruebas reales y conserva la pérdida de 100 del solver:
su entrega queda como 100 participaciones privadas de destino, no recibe el pago
reservado de 120. La admisión del catálogo permanece cercada tras el fallo; no se
desbloquea, retira o vuelve a enviar nada para fabricar un recorrido completo.
La aceptación sólo se declara después de comprobar hashes, métricas, fuentes y
cierre de procesos de esa ejecución; la policy host por sí sola no es evidencia.

La vista de custodia del escenario F conserva los dos importes:
`available=500` incluye la devolución de `recovery=120`. El segundo campo indica
procedencia de una parte del saldo; no se suma otra vez. El total recuperado es
500: cambio 380 más devolución 120. Reabrir ese journal y sustituir el listener
mantiene `coordinatorProcessRestart=false`; el backend original sigue vivo.

## Recorrido web EVM nuevo aceptado

El 8 de octubre de 2026, `./dev lab browser` completó el intento nuevo
`87c263aa-32a0-4832-9f30-67147fc552f4` con quince pruebas genuinas:
deposit_balance, deposit_intent, authorization, reservation, dependency, ready,
admission, cuatro node, settlement y tres withdraw_balance. Las pruebas se
generaron en este intento con claves de custodia, cuentas, journals y Anvil nuevos; los
artefactos públicos compilados y verificados se reutilizan conforme a sus pines.

La wallet web real financió, revisó y confirmó el grafo con una capability exacta
y la casilla visible. Se descartó una respuesta HTTP realmente admitida; el DOM
mostró UNKNOWN y concilió el journal original con un solo POST y sin reenvío.
Ambos titulares estuvieron ausentes durante la entrega y liquidación. Después
se cerró el primer navegador, se sustituyó el listener y se reabrió el mismo
journal del coordinador: el permiso del listener anterior se rechazó y la
conciliación/recuperación del grafo cumplido no agregó pagos, pruebas o envíos.
Los titulares reiniciaron sus procesos y recuperaron sus notas originales.

Las salidas originales desde la interfaz retiraron 380 PALT de cambio y
100 BLTV. La custodia reiniciada del solver retiró su único pago de 120 PALT;
el replay nativo fue rechazado y conservó nullifier y contabilidad. La interfaz
redimió las 100 participaciones por 100 PALT mediante el puente DeFi original,
reabrió y concilió esa operación y rechazó cualquier segundo efecto. Revisar el
EXIT confirmado mantuvo idéntico el estado privado original de esa cuenta.
Los destinatarios quedaron con 380/120/100 PALT; BLTV, activos y shares del vault,
respaldo de ambos pools y reservas terminaron en cero. El padding no se volvió
saldo ni capacidad reutilizable; no se acepta rollover ilimitado.

El supervisor y el resumen aceptaron el resultado con los 16 checks de identidad,
bytes y fuentes positivos y el cierre íntegro sin señales. Una auditoría
independiente verificó de nuevo los 15 archivos de prueba y los 15 de inputs,
los recibos originales cerrados de 11 jobs y las métricas retenidas de las otras
cuatro pruebas. Los 55 PID del grupo propio y el PID del supervisor estaban
ausentes en `/proc` después del cierre. Los dos Chrome conservaron
sandbox de kernel (`NoNewPrivs=1`, `Seccomp=2`), UID/grupo/sesión originales,
salida 0 y ningún proceso huérfano. Sus máximos de RSS fueron 886173696 y
889397248 bytes, por debajo de 1 GiB. El worker tardó 1167784.6 ms; el mayor
prover alcanzó 3033706496 bytes, por debajo de 3 GiB, y la RAM disponible mínima
fue 14165032960 bytes. Las 402 fuentes capturadas no cambiaron durante el intento.
`keeperRestart=false`, `nodeRestart=false` y `coordinatorProcessRestart=false`:
se sustituyó el listener y se reabrió el journal del mismo coordinador; el
reinicio en procesos de los titulares se comprueba por separado.

| Evidencia del intento nuevo | SHA256 |
| --- | --- |
| `result.json` original | `9c4497ee98b76599e75cb455911af6cd766e1b60cdec26dc80a7dfcdc19fc001` |
| `resources.json` original | `3ea033d43e3e4279dc1d5c48b03bfdd7cc000e58a806112254fea5a82a5253ed` |
| Cierre de fuentes capturado | `41e2c8143da24ffd80804fc277fbd670f8240040be91e143243f798a9135b3b6` |
| Resumen `evm-browser-lab.json` | `ad69723c5209caa6d8488405754409f4f6754ee6da2927f14a8d1122f6dda3a0` |

Los originales están en
`.internal/runtime/omnichain-flat-profile/flat-wallet/.local/manual-wallet-browser-acceptance/attempt-87c263aa-32a0-4832-9f30-67147fc552f4/`.
El envoltorio Python revisado en `2c0d8e5` se capturó aparte del cierre financiero:
19220 bytes, SHA256 `7c33576af7d86798301fcb8cde12008c850dae1311ade4055f9609b9f6dfcac4`.

`walletBrowserEvmFlowCompleted=true` y `manualConsentContractVerified=true`
describen automatización que verifica el DOM y confirma explícitamente; no una
persona operando el navegador. `walletSdkEvmFlowCompleted=false` conserva la
distinción respecto al intento SDK rechazado. La preparación de importes,
destinos y testigos sigue en la custodia Linux original. Móvil, custodia autónoma
del navegador, siete redes públicas, operadores independientes, privacidad y
rendimiento de producto siguen fuera de esta aceptación; `fullWalletAcceptance`
permanece falso.

Los intentos DOM previos permanecen rechazados. Se corrigieron y probaron la
espera de lectura inicial del catálogo y la comparación del orden fijo de
campos del formulario. Otro intento cerró el segundo Chrome por un guard cuya
causa exacta no se retuvo entonces; no se afirma haber corregido ni identificado
esa causa. Se añadió su captura y cuatro ciclos dobles sintéticos pasaron antes
de este recorrido nuevo, sin relajar el guard ni reutilizar las pruebas previas.

La tabla de medición fría por relación se conserva en
`.internal/dev/reports/evm-browser-cold-proof-timings.json`, calculada sólo desde
esos recibos originales; no se lanzó un benchmark nuevo. Distingue inicialización,
prueba, total del worker y tiempo del supervisor. Las cuatro pruebas heredadas
sólo registran tiempo total: sus columnas init/prove quedan `null`, sin inferirlas.
Los once jobs PAEG inicializaron workers nuevos. Cualquier propuesta de reutilizar
inicialización necesitaría volver a verificar límites, clausura de fuentes,
aislamiento de rol, testigos, inputs, claves, ZK y cierre antes de aceptar una mejora.

Esta es la medición fría del mismo intento, en segundos por prueba. Las filas
con varias pruebas muestran su media; el total externo lo midió el supervisor
de cada prueba e incluye más trabajo que init + prove. Los guiones indican que
el recibo original no separó esas etapas.

| Relación | Pruebas | Init (s) | Prove (s) | Total externo (s) |
| --- | ---: | ---: | ---: | ---: |
| `deposit_balance` | 1 | — | — | 38.700 |
| `deposit_intent` | 1 | 29.494 | 6.974 | 37.076 |
| `authorization` | 1 | 29.855 | 95.628 | 127.219 |
| `reservation` | 1 | 30.367 | 10.216 | 41.291 |
| `dependency` | 1 | 31.215 | 18.877 | 51.186 |
| `ready` | 1 | 31.177 | 27.879 | 60.099 |
| `admission` | 1 | 30.224 | 48.329 | 79.625 |
| `node` | 4 | 31.536 | 11.205 | 43.739 |
| `settlement` | 1 | 30.279 | 11.206 | 42.274 |
| `withdraw_balance` | 3 | — | — | 51.516 |

La autorización A consumió 127.219 s externos, de los cuales 95.628 s fueron
proving. Los once jobs inicializaron de nuevo el runtime, con unos 30 s en cada
init. Estos datos permiten investigar el coste de inicialización y después la
autorización, conservando ZK y las verificaciones. No se midió una ejecución
caliente, ni se cumplen o certifican aquí los objetivos de rendimiento del
producto. Esta única ejecución fría tampoco mide concurrencia o latencia móvil.

## Recuperación F nueva aceptada

Intento `59fba9ff-2298-449a-b825-393c002b57e0`: siete pruebas reales (financiación, D27, autorización,
reserva, dependencia, readiness y F). Tras una única entrega real queda la
admisión FAILED original; F se incluye al cutoff que había autorizado el titular.
Repetir F/reconcile, reabrir el journal y sustituir el listener no añade pruebas,
entregas, pagos ni créditos; el permiso del listener antiguo se rechaza.

Tras reiniciar los dos titulares, el origen tiene 500 disponibles, con los
120 devueltos incluidos; el destino tiene 100 shares y las reservas son cero.
El solver pierde su entrega de 100, sin recibir el pago reservado. La cerca del
catálogo permanece activa. No se realizan retiradas para ocultar ese estado.

El supervisor acepta fuentes sin cambios y cierre completo sin señales:
514,386.8 ms; siete pruebas genuinas. Resultado SHA256 `b6736a5eb09a0ce6f90379ba12e6fc850cf0d8e274b885e8654f7d817b911313`,
recursos `b065c3a10bc23ebb518ad6d1bb0081843c597878142da589ba6c994f69cddd7e`, fuentes `74512f9fb832f88c202fc9a360d4733edb94c7f8070bdc96e2debc4acf411c1b`.
El resumen está en `.internal/dev/reports/evm-recovery-lab.json`.

Es aceptación SDK/HTTP de recuperación local, no navegador, red pública,
reinicio del keeper/nodo ni wallet completa. El coordinador original sobrevive;
se reabre su journal y se sustituyen los listeners.
