# Aceptación local de redes y DeFi

Registro del 8 de octubre de 2026. Los laboratorios usan estado y claves nuevos, fondos
ficticios y procesos propios. Bitcoin conserva el génesis estándar de regtest. Una prueba de lectura RPC, una transferencia local
y una operación privada completa son criterios diferentes.

## DeFi oficial

Ejecutar desde la raíz:

```sh
./dev node tests/integration/defi/metamorpho-cycle.mjs --run-local-fixture
./dev test packages/backend/tests/defi/withdrawals/private-vault-exit.test.mjs
```

El primer comando despliega las compilaciones oficiales restauradas de Uniswap
V3, Morpho y MetaMorpho, verificadas con el manifiesto original. Comprueba un swap
Uniswap con salida exacta y gasto máximo; después deposita en MetaMorpho y
redime shares con mínimo, plazo y referencia protegidos dentro de una misma
transacción. Comprueba los reverts atómicos, reapertura del keeper superviviente
y ausencia de segundos envíos. El proceso se apaga y elimina su scratch.

`owned-metamorpho-vault.mjs` se conecta al servicio existente
`private-vault-exit.mjs`: sólo acepta una cuenta y un protocolo originales,
una retirada privada confirmada y su calldata/recibo originales, con backing
observado vigente. Usa `previewRedeem` y `maxRedeem` oficiales para cotizar;
no aplica la fórmula de la bóveda de pruebas. La salida subyacente va a la misma
dirección propietaria y sigue siendo pública. Ninguna observación crea saldo
privado. El puente cuenta con regresiones de pérdida de respuesta, journal,
replay, backing obsoleto y capabilities copiadas.

Aceptado: protocolo oficial local y puente de salida comprobado en pruebas del
host. Pendiente: recorrido completo de entrada privada, grafo, salida y redención
con pruebas reales sobre estos protocolos; recuperación tras perder el proceso
del keeper/nodo; composición DeFi entre redes.

## Revisión de aceptación Solana

Se habilita exclusivamente el runner de aceptación del runtime local restaurado:

```sh
./dev node tests/integration/chains/solana/solana-candidate-acceptance.mjs --run-reviewed-local-candidate
```

La revisión cubre `solana-candidate-acceptance.mjs`, su policy, las comprobaciones
de evidencia, el guard de recursos/procesos y el factory
`owned-solana-runtime.mjs`. El binary seleccionado conserva el pin
`a159dd521869c60e317b0db6d4f5ac7b24cfbb400308e6349a0fd63586d58517`, Agave
2.3.13, commit `5466f4592b1983adb13ba0a5d53f41ea2de69fba`. Su perfil fija
64 ticks/slot y retención de un millón de shreds. La revisión habilita la
ejecución del test; el resultado del test determina si hay aceptación nativa.

Controles conservados:

- Sólo un proceso propio con génesis y claves sintéticas nuevos; no acepta RPC,
  binario, clave ni clock suministrados por el usuario.
- Sólo sockets propios de loopback, verificados por inode, y un único peer;
  rechaza bibliotecas de rendimiento adicionales.
- Faucet sin fondos y sin uso; distingue fondos de custodia, nonce y solver.
- Preparación original, firma Ed25519, Memo, nonce duradero y latch de primer
  envío; observación de la firma original, sin nueva firma o reenvío.
- Suelo de 2,5 GiB de RAM disponible y 5 GiB de disco; plazo funcional de
  diez minutos; rechaza otro trabajo pesado concurrente del mismo usuario.
  La carga de otros usuarios queda cubierta por los suelos globales. La captura
  filtra por PPID antes de leer executables, compatible con Linux sin privilegios;
  los errores de identidad del hijo propio siguen bloqueando y no permiten señales.
- Limpieza del hijo propio comprobada por PID e inicio del proceso; conserva
  auditoría privada separada del informe público y verifica fuentes sin cambios.

El runner comprueba depósito y transferencia del solver, incluyendo
balances/comisiones, ambos nonces duraderos y separación de namespaces. La
redención exige la autoridad original del controlador de claims: este runner
no la fabrica ni llama a payout sin ella. El informe declara
`runtime-ingress-and-solver-only` y
`ORIGINAL_PAYOUT_CONTROLLER_AUTHORITY_REQUIRED`. No habilita una release de
claims/grafos, crédito privado, consenso público ni operadores independientes.

Resultado nuevo: aceptación nativa aprobada en Agave, génesis sintético nuevo y
fondos ficticios. Ambos bootstraps se finalizan una vez; el depósito de 1.000.000
lamports avanza sólo su nonce; el solver entrega 250.000 lamports desde liquidez
separada. Comisiones observadas: 10.000 por bootstrap y 5.000 por transferencia.
El apagado verifica el PID original, evita la carrera de muestreo durante cierre
y elimina claves y ledger sin forzar el proceso. Las fuentes permanecen
invariantes. Las 29 regresiones del host pasan, incluida pérdida de respuesta.
Ese caso de pérdida sigue siendo una regresión del host, no una interrupción
inducida en la aceptación nativa. Informe local retenido:
`attempt-Jf9dGZ/report.json`, SHA256
`442a5704e96bc07abc804566173105e80a668a93cc9e715854a990942b8482df`.

## Matriz de trabajo restante

| Red | Laboratorio disponible | Criterio pendiente |
| --- | --- | --- |
| Ethereum | EVM propio y fixtures de cuentas/grafos | Recorrido privado reproducible desde wallet y recuperación integral |
| Base | Factory EVM sintético con chainId 8453 | OP Stack real y su finalidad; cambiar chainId no prueba Base |
| Arbitrum | Factory EVM sintético con chainId 42161 | Nitro real y su finalidad |
| BNB | Factory EVM sintético con chainId 56 | BSC real, consenso y finalidad |
| Bitcoin | Core: ingreso y solver nativos aprobados, 6 confirmaciones | Autoridad original de payout, integración privada y recuperación |
| Solana | Agave: ingreso y solver nativos aprobados | Autoridad original de payout, integración privada y recuperación |
| Tron | Consenso, firma y único broadcast nativos; finalidad rechazada | Diagnosticar pending, cierre SIGABRT y completar aceptación antes de release canónica |

Tron conserva `OWNED_TRON_RUNTIME_RELEASE=null`. Para promoverlo hay que cotejar
la fuente del driver con todas sus clases, revisar los parches offline y de
prestate/replay contra upstream, verificar el inventario completo JDK/jar/clases,
fijar una configuración y demostrar consenso local, transferencia, observación
y apagado sin sockets de red. Restaurar el jar no satisface esos criterios. Los modelos
de claims de BTC/SOL y sus autoridades requieren también declarar sus supuestos
de custodia; no equivalen a autocustodia nativa por disponer de una nota privada.


## Bitcoin: aceptación nueva de ingreso y solver

```sh
./dev node tests/integration/chains/bitcoin/bitcoin-runtime-acceptance.mjs --run-owned-regtest
```

Resultado: **aprobado para ingreso y solver originales**. El factory combinado
crea un Core propio con wallets/estado nuevos, red deshabilitada y RPC loopback.
El depósito de 1.000.000 satoshi se confirma en 6 bloques; el solver envía 250.000
satoshi desde liquidez separada. Cada firma original se transmite una vez y
consume 222 satoshi de comisión. Las observaciones repetidas conservan el wire
original; rechaza una segunda minería de confirmación y las identidades del otro
namespace. El inventario de custodia conserva principal y UTXO tras el solver.

El guard verifica los inodos de sockets propios, los suelos de RAM/disco y la
clausura ESM sin cambios. Ambos facades cierran secuencialmente el mismo proceso;
Core termina sin force, elimina wallets/ledger y rechaza operaciones posteriores.
Dos preflights anteriores rechazaron actividad transitoria en daemons Gradle
conocidos: no arrancaron Core, no se mataron procesos ajenos y se retuvieron sus
locks/diagnósticos para revisión. El intento aprobado pasó el mismo guard. La revisión posterior añadió SIGTERM/SIGINT,
plazo total de 120 s, muestreo periódico cada 250 ms y rechazo de locks de proofs
y workers Node/WASM. Se comprobó con cuatro regresiones del host, incluidas
señales reales a hijos propios sin Core. El informe nativo citado corresponde
a la versión anterior a esa mejora del guard; queda pendiente su nueva ejecución.

Informe `.local/bitcoin-runtime-acceptance/attempt-1hgmcH/report.json`, SHA256
`7b7a9574dc903afcf2ab061e1631a8e2400edf966b845f1a2f3d198ef22a8d68`.
El alcance es `runtime-ingress-and-solver-only`: no demuestra claims, payout,
crédito privado, reinicio del nodo ni consenso de la red pública.

## Tron: build nuevo y aceptación candidata rechazada

```sh
python3 tests/integration/chains/tron/fixtures/offline-agree-zero/build.py --build-reviewed-offline-args
./dev node tests/integration/chains/tron/tron-candidate-acceptance.mjs --run-reviewed-local-candidate
```

La clausura pública original está verificada: 407 entradas del JDK, 7 clases,
JAR, driver y recibos originales, todos preservados sin modificaciones. El
primer intento original fallaba porque NodeConfig.postProcess convierte el
agreeNodeCount=0 explícito en 19. El nuevo parche de Args conserva 0 sólo para
el CLI p2pDisable=true y node.agreeNodeCount=0 explícito. Mantiene todas las
condiciones de assertOffline y los defaults de la red normal.

El build nuevo compila la Args revisada y un diagnóstico público sin keys,
witness, aplicación ni ledger. La comparación original/revisada cambia sólo
agreeNodeCount 19 → 0. Sus 4 hijos Java cierran con exit0; el inventario original
queda intacto. Args nueva SHA256
`ce82095ff403f837ee02b243ab05e5ad3886b1124f2bbb3e1bf0e8165b310a70`, fuente
`7896412e8aa21a80331f66606f25414a589c5127e355a0289d422c72405e280d`.
El report nuevo `reviewed-offline-agree-zero-v1/build-report.json` tiene SHA256
`71de6b263c4051738e76d27da7f4f821f800c9ca944a742c4980ccd9695e98e2`.
Los recibos históricos no se regeneran. El runner fija la clase nueva en código
y la coloca delante del JAR mediante su package original; las siete originales se
verifican y siguen conservadas.

El helper instala seccomp exclusivamente en el hijo antes de ejecutar Java:
deniega socket() en todas las familias y socketpair() de red; permite sólo
AF_UNIX anónimos para stdio/FileDispatcher. Comprueba cada inode y rechaza
sockets con pathname o de red. Mantiene suelos de recursos y no cambia el host.
La excepción de Gradle exige JDK21/cwd/version/argv exactos y dos snapshots del
mismo PID/inicio/parent con todos los threads dormidos y CPU sin cambios.

Resultado candidato: **no aceptado**. Produjo bloques por consenso Java-Tron,
recuperó el firmante original y admitió el único broadcast. La observación
original siguió pending durante 60 s; la prueba rechazó finalidad. El cierre
terminó SIGABRT, sin señal enviada por el harness; el PID original quedó
verificado ausente y se eliminaron claves/configuración/ledger. No constituye
apagado limpio ni aceptación completa. Informe
`candidate-acceptance/attempt-4GaJWD/report.json`, SHA256
`1e5214e7158e4bd044b272ed7d2b763d231e8ec97441bc24f3c6441429bfdbcf`.

El snapshot original previo al envío tenía head=solid=reference=2. La altura
sólida ya avanzaba; no hay evidencia de que falten 27 witnesses para finalizar:
[DposService del commit fijado](https://raw.githubusercontent.com/tronprotocol/java-tron/5c449a18a2bb995d3b688d1587e664d909b473c7/consensus/src/main/java/org/tron/consensus/dpos/DposService.java)
calcula la altura a partir de los witnesses activos.

El pending original permite dos causas: ausencia de tx/receipt, o altura sólida
anterior al receipt. Ese intento no retenía dichas lecturas antes de eliminar
el ledger; por tanto la rama concreta sigue pendiente de nueva auditoría
read-only. No se sustituye finalidad por aceptación del mempool ni se reenvía.
La release canónica sigue null; no hay autoridad de grafo, crédito privado,
claims, consenso público ni recuperación tras perder proceso.
