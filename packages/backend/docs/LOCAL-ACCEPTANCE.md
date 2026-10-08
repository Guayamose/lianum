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

La aceptación nueva de shares privadas se ejecuta desde la raíz con:

```sh
./dev lab metamorpho
```

Resultado nuevo **aprobado**, con dos pruebas genuinas: financiación privada
`deposit_balance` y retirada `withdraw_balance`. La fuente inicial de shares
es un depósito público explícito en el MetaMorpho oficial del laboratorio:
1.000.000 de unidades subyacentes producen 1.000.000.000.000.000.000 shares.
La nota privada, su EXIT y el backing originales preceden la redención oficial.
Se comprueban el reinicio del owner/coordinador con credenciales supervivientes,
la respuesta completa de redención descartada, la reapertura/reconciliación del
journal y duplicados sin segundo envío. Termina con saldo privado, backing,
pasivos y supply de shares en cero; devuelve el subyacente al propietario público.

El supervisor acepta el resultado, las fuentes sin cambios y el cierre completo
del grupo propio. Anvil termina con exit0, sin señales, y elimina su scratch.
Las dos pruebas se enlazan independientemente con los recibos públicos originales
almacenados: identidad, bytes, key, verificación, ZK, exit0 y cierre de recursos.
El recorrido duró 122 s; el pico del worker de proofs fue 1.341.374.464 bytes,
el del worker principal 468.180.992 bytes y la RAM disponible mínima
17.218.490.368 bytes. El guard conserva los límites originales. Las 20 regresiones del puente pasan.
El wrapper se validó en sintaxis y rechazo de opciones; el resultado anterior
corresponde al runner original supervisado, sin una segunda ejecución.

Intento `.local/private-metamorpho-flow/attempt-6cd6b65d-7e39-4357-8f95-6bc6756ffb56`:
resultado SHA256 `f8c7532d31444dafe929f892629a8136a85b2c4646419e800185f4f25767d45e`,
recursos `48edda2248db093d458817c36e8a15153cde0fb6863dd88e5a52a85dd7bcd5af` y
fuentes `c24b27dfc5475c2f1ab9ab40ed2754a1c41a48507a611a5c180ac1128ed78d0c`.
El resumen humano `.internal/dev/reports/metamorpho-lab.json` conserva el alcance
`PRIVATE_SHARE_NOTE_EXIT_AND_PUBLIC_METAMORPHO_REDEMPTION`, aceptado, dos pruebas
y SHA256 `14436a5844d947a62908a944719fdff64c2953061de9e75f56c996e177a78858`.

La entrada privada D27 desde los protocolos oficiales también queda comprobada
con el perfil nuevo:

```sh
./dev lab defi
```

Intento `e8eb31eb-d500-4d52-b937-ebc711bdd3d4`: **aceptado**, cuatro pruebas
D27/W39 nuevas. El swap Uniswap V3 entrega exactamente 1.000 unidades de salida
y gasta 1.005 de input público, dentro del máximo de 2.000. MetaMorpho gasta
1.000.000 de subyacente público y acuña exactamente 1.000.000.000.000.000.000
shares. En ambos casos el router original entrega la salida a una nota privada
mientras el owner está desconectado; su observación original y D27 preceden el
saldo. El proceso hijo del owner se reinicia; la coordinación se cierra y
reabre dentro del mismo proceso con credenciales supervivientes. Repetir la
reconciliación no envía de nuevo. La retirada W39 por HTTP original confirma el
EXIT; termina con pasivos privados y allowances en cero. La redención oficial
MetaMorpho se liga al EXIT y al backing original: se descarta su respuesta
completa y se recupera el mismo recibo, sin un segundo envío.

El supervisor acepta las fuentes intactas y el cierre completo: worker y Anvil
exit0, sin señales, ningún proceso propio vivo ni lock, scratch eliminado.
Duración 228 s; pico del proof worker 1.368.895.488 bytes, grupo propio
2.172.764.160 bytes y RAM disponible mínima 14.901.571.584 bytes. Mantiene los
límites originales y las dos regresiones de política. Los cuatro recibos
originales de pruebas se conservan con identidades, bytes, VK, ZK,
verificación y cierre; no se usan pruebas del paquete antiguo para este intento.

Intento `.local/development-defi-entry-roundtrip-v1/attempt-e8eb31eb-d500-4d52-b937-ebc711bdd3d4`:
resultado SHA256 `19e4af3791a28b88e7b37e9db436352964f9ad361b55b136df33e569aebddaea`,
recursos `453610d3ab40823d99b75481b8c04724e6b69831c61e4cac1d6d11f0a3fdba47` y
fuentes `115dc3d7099845e366dde0ef3a0c872d0846523043ec6b7608d4cbb915ee1cc8`.
Resumen humano: `.internal/dev/reports/defi-entry-lab.json`.

El input inicial y la salida final son públicos. Este perfil no establece
admisión de una leg registrada, conversión PAEG, grafo, reembolso de provider,
operadores independientes, wallet completa ni recuperación tras perder el
keeper/nodo. La salida Uniswap no prueba un swap inverso; el subyacente MetaMorpho
redimido no se cuenta como nuevo saldo privado. Siguen pendientes composición
DeFi entre redes y despliegue/aceptación en redes públicas. El laboratorio usa
el cliente EVM local Cancun; no acredita settlement de proofs bajo Osaka.

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
| Ethereum | EVM local Cancun; wallet DOM original y recuperación de journal comprobados | Cliente/finalidad públicos, envelopes y settlement post-Osaka; pérdida completa de custodia |
| Base | Factory EVM sintético con chainId 8453 | OP Stack real y su finalidad; cambiar chainId no prueba Base |
| Arbitrum | Factory EVM sintético con chainId 42161 | Nitro real y su finalidad |
| BNB | Factory EVM sintético con chainId 56 | BSC real, consenso y finalidad |
| Bitcoin | Core: ingreso/solver y ciclo privado BTC demostrado dentro del intento global rechazado | Aceptación conjunta de ocho proofs BTC/SOL; wallet/grafo, pérdida de custodia y red pública |
| Solana | Agave: ingreso/solver; nota privada y EXIT genuinos; payout rechazado por audit caducado | Cerrar payout/CO42 con auditoría vigente, aceptación conjunta, recuperación y red pública |
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
locks/diagnósticos para revisión. La revisión posterior añadió SIGTERM/SIGINT,
plazo total de 120 s, muestreo periódico cada 250 ms y rechazo de locks de proofs
y workers Node/WASM. Se comprobó con cuatro regresiones del host, incluidas
señales reales a hijos propios sin Core. Después se repitió el recorrido nativo
completo con el guard final: aprobó los mismos efectos, la monitorización
periódica y el cierre limpio sin procesos propios ni wallets/ledger retenidos.

Informe final `.local/bitcoin-runtime-acceptance/attempt-6XNSOf/report.json`, SHA256
`8dec9a5d99f6422923689c2415e93719a2e7c9d5fd9e6fa445bcf21e7b210a74`.
El alcance es `runtime-ingress-and-solver-only`: no demuestra claims, payout,
crédito privado, reinicio del nodo ni consenso de la red pública.

## BTC/Solana: round trip privado nuevo

`./dev lab claims` usa los controladores originales para D27/CI51 y W39/CO42
de ambas redes, con ocho pruebas genuinas esperadas. Mantiene las claves y los
nodos originales durante el reinicio de owner/keeper; no acredita pérdida
completa de procesos, rutas de grafo ni consenso público.

El primer intento, `3f4f6c01-c2a3-4676-bc01-4be0db648091`, quedó **rechazado**
tras emitir ambas notas con cuatro pruebas D27/CI51. Falló antes de EXIT/payout:
el harness consultaba en paralelo un controlador privado que sólo admite una
lectura activa. El controlador conserva esa restricción; el harness ahora
consulta secuencialmente y dos regresiones comprueban el caso y el fallo anterior.
No se presenta ese intento como un recorrido de ocho pruebas aceptado.

Se conservan resultado SHA256
`11c4021df66b0cc0586d8c95ce3c4d61ca6751b345cce77aafa776e952595d27`,
recursos `3fa1e9ada28b0596be9a11c20139ba29c9dad2511c4fab182a405790057ccef4`
y fuentes `71d9685e293a201430420f2a36def4969b6cb5c9c4f7300c01906d7455c34661`.
El supervisor original se cerró tras el fallo y los procesos propios quedaron
ausentes. La nueva aceptación requiere otro intento completo, sin reutilizar
los cuatro recibos ni las notas del intento fallido.

El segundo intento fresco, `f9c90308-a14d-4173-82df-b5429e3cb393`, queda
**rechazado con siete de ocho pruebas**, sin reutilizar las cuatro anteriores.
Las dos notas se emiten con los owners desconectados. Pasan el reinicio original
owner/keeper/controller, lectura serial y reconciliación sin otro envío.
BTC completa D27/CI51/W39/CO42: devuelve 100.000 satoshi al destinatario,
DISCHARGED, tras la respuesta HTTP admitida descartada y `resume` original.
Duplicados `redeem`, `resume` y `reconcile` conservan los efectos. Ingreso y
redención BTC tienen un broadcast y una minería de seis confirmaciones cada uno.

SOL conserva D27/CI51 y EXIT W39 genuinos, pero su primer `redeem` retorna
`RECONCILIATION_REQUIRED / CLAIM_OPERATOR_AUDIT_TOO_OLD`. El `BEGIN_PAYOUT` EVM
original sí se confirmó; el audit de Agave sólo conserva el ingreso finalizado,
sin transferencia de payout ni CO42. El harness rechazó ese error antes de
observar/reanudar SOL. Su extractor de mensajes eligió el literal esperado
`CLAIM_NATIVE_FINALITY_UNRESOLVED` de la AssertionError; esa etiqueta del
resultado **no acredita un fallo de finalidad nativa**. La causa disponible es
el audit de operador demasiado antiguo. El intento no retuvo fase/elapsed de
`auditBudget`, así que la parte exacta del round sigue pendiente de diagnóstico.

El presupuesto de 30 s sigue intacto. La ausencia de payout nativo no demuestra
que ningún operador haya firmado o quedado poisoned: pudo caducar otro actor
después de una firma parcial del quorum. El controlador conserva UNKNOWN y su
fence; no se añade retry, nueva firma, nueva autorización ni una falsa
observación de finalidad. BTC demostrado no convierte este intento conjunto en
una aceptación completa de ambas redes.

Se conservan resultado SHA256
`d357553ae9e91ff57381beaabb7c7cdf042f3a17f8726af94a83d682ab26f1da`,
recursos `34d848b4e7e9ac45872c2aa2ce2c05754f0c21a9a067de84b8ed7b53e9a27e59`
y fuentes `c38b45cb7ba20bebc6607b28424b65db3a0274382b536cb54b53bdecfa6ec7b1`.
Duración 2.035 s; proof worker máximo 1.640.632.320 bytes y grupo
4.388.188.160 bytes. Los siete recibos de pruebas se cotejan con sus originales.
El cierre termina con controller/keeper/EVM/BTC/SOL cerrados, las 133 identidades
originales ausentes, fuentes intactas y lock liberado. El estado sintético y las
claves se eliminan. BTC/SOL no requirieron force; Solana declara
`nativeOrderlyExit=false`, conservado como límite del cierre observado.

Los dos intentos y sus rechazos permanecen como evidencia. Los nodos y claves
sobrevivieron los reinicios de procesos de coordinación, no la pérdida del
laboratorio; no acreditan autocustodia, operadores independientes, consenso
público ni recorrido de grafo. Una nueva aceptación requiere estado y recibos
nuevos y resolver el diagnóstico de audit sin ampliar su frescura.

## Grafo CBTC → entrega SOL y dos retiradas Bitcoin

```sh
./dev lab btc-sol
```

Intento `67ca1114-cb94-4f87-9041-1cd7b7e62e82`, sobre `759d732`: **aceptado y
cerrado**, dieciséis pruebas genuinas nuevas. D27/CI51 emiten una nota CBTC de
100.000 satoshis; U/S/P/R/I, cuatro N y C completan el grafo original. El solver
entrega 1.000.000 lamports una sola vez, con el owner ausente. El journal termina
CONFIRMED y el grafo FULFILLED. Reinicio, reconcile y recover no repiten el envío.

W39/CO42 descargan el cambio de 80.000 satoshis y el pago del solver de 20.000.
La admisión HTTP perdida se conserva y se resuelve por resume original; repetir
redeem/resume conserva CONFIRMED sin otro efecto. Bitcoin retiene ingreso y dos
pagos con seis o más confirmaciones, un broadcast por transferencia y comisión
de 222 satoshis cada uno. La custodia SOL y sus nonces no se gastan. Supply,
deudas, reservas y obligaciones finales quedan a cero. Los dos pagos Bitcoin
van al destinatario fijo de la custodia local; no representan dos wallets
Bitcoin independientes ni acreditan descubrimiento de precio o un bridge.

No se reutilizó ninguna de las quince pruebas del primer intento rechazado
`d284e41a`. Éste permanece conservado, incluida su entrega SOL, la retirada del
cambio y el EXIT EVM del solver antes del ID mal formado. La corrección usa el
hash determinista original del controlador y mantiene las dos regresiones.
Los programas, VK, guardas y presupuesto de auditoría de 30 s permanecen iguales.

Duración: 2.649.977,794 ms (44 min 09,978 s). Pico del prover 2.970.472.448 bytes,
worker principal 598.491.136 y supervisor 97.656.832. El RSS total del grupo se
midió, sin atribuirle el límite individual de 3 GiB. La auditoría independiente
unió los dieciséis recibos y verificó 399 fuentes, 20 archivos API y 11 de vendor.
Las 219 identidades originales y cuatro locks quedaron ausentes. Controller,
keeper y runtimes cerraron; scratch, wallets, claves y ledgers sintéticos se
retiraron sin force. Solana declara `nativeOrderlyExit=false`,
`nativeStopFailure=null`; no se atribuye salida ordenada nativa.

Evidencia local conservada en `.internal/dev/reports/`:

- Resultado original SHA256 `93735732687f1c10c95d1bb4ce3cdf182f26c2751f8995cb3c51eed800c1955e`.
- Recursos SHA256 `47cde74251728dffb2933f595a1f07384ae1e172a453fd493dcabf75ca69d399`.
- AFTER SHA256 `a6ace6cbcaaa7dda1f8e9302c0445146e7ab22ec415f2ee22acd895a68b0119a`.
- Manifiesto de las dieciséis pruebas SHA256 `b54bd6567d9d323b43f6bc946944293009894b4b20e215ad6833815d3ce5acad`.

La aceptación cubre este grafo local con fondos ficticios. El payout de custodia
Solana del ensayo de ocho pruebas sigue rechazado. No acredita pérdida de
keeper/nodos, recuperación F de este grafo, operadores independientes, red pública,
custodia móvil ni wallet omnichain completa.

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

## Tron: diagnóstico nativo posterior

El candidato posterior conserva un único broadcast y consultas originales.
Al inicio la tx está en el mempool y su raw coincide; después el mempool está
vacío y no aparecen tx ni TransactionInfo. Head y solid avanzan de 2 a 23.
No hay inclusión canónica demostrada. El saldo observado vuelve al inicial;
esto encaja con descarte o rollback durante el packing, todavía una inferencia.
El Logback del JAR escribe sus warnings a disco; hay que retener esos logs en
el siguiente diagnóstico antes de retirar el scratch.

El cierre vuelve a SIGABRT, sin fuerza del harness. Esta vez se conserva el
error fatal privado del JVM: 102.321 bytes, SHA256
`3bbee07b27f41e1ecf890bb4952175579a1a92a2187fe318853ca4a788681312`.
La pila pasa por `jni_DetachCurrentThread`, `hawtjni_thread_cleanup` y
`VM_Exit::wait_if_vm_exited`. El callback de [HawtJNI 1.18](https://raw.githubusercontent.com/fusesource/hawtjni/hawtjni-project-1.18/hawtjni-generator/src/main/resources/hawtjni.c)
y [HotSpot 8u504](https://raw.githubusercontent.com/openjdk/jdk8u/jdk8u504-b01/hotspot/src/share/vm/runtime/vm_operations.cpp)
explican esa ruta, sin demostrar todavía una corrección.

Informe `candidate-acceptance/attempt-dLP1hZ/report.json`, SHA256
`25bf2d7befae07365eb90d24ab064dd9857ba3c6a325d9fd17061434451aacbe`.
Los prefijos privados quedan acotados, el PID original está ausente y las claves,
configuración y ledger sintéticos se eliminaron. El candidato sigue rechazado
y la release canónica permanece null.
